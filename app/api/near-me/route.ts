import {
  NextRequest,
  NextResponse,
} from "next/server";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/distance";
import { reverseGeocodeLocation } from "@/lib/geocoding";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import {
  areasMatch,
  resolvePredefinedArea,
} from "@/lib/lagos-areas";
import { STREET_ALIASES } from "@/lib/near-me-street-aliases";

/**
 * ReMarket Near Me search.
 *
 * Text search:
 * - q=<area or street> is the unified search parameter.
 * - A predefined area is resolved to its canonical spelling.
 * - Otherwise, q is matched against registered business streets.
 * - The legacy area=<area> parameter remains supported.
 *
 * GPS ranking hierarchy:
 * 1. Same street
 * 2. Adjacent street
 * 3. Nearby street
 * 4. Whole area
 *
 * Ranking takes precedence over distance.
 * GPS results are sorted before pagination.
 */

const DEFAULT_NEAR_ME_RADIUS_KM = 10;
const DEFAULT_ADJACENT_STREET_MAX_KM = 1;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;
const MAX_DATABASE_OFFSET = 2_147_483_647;

type ParsedCoordinate = number | null | "INVALID";

type NearMeRanking = 1 | 2 | 3 | 4;

type NearMeRankingLabel =
  | "same-street"
  | "adjacent-street"
  | "nearby-street"
  | "whole-area";

type PaginationParams = {
  page: number;
  pageSize: number;
  skip: number;
};

type PaginationResult =
  | {
      valid: true;
      params: PaginationParams;
    }
  | {
      valid: false;
      error: string;
    };

type SearchMode =
  | "none"
  | "area"
  | "street"
  | "gps"
  | "invalid-area";

/**
 * ------------------------------------------------
 * BUSINESS SELECT
 * ------------------------------------------------
 */

const nearMeBusinessSelect = {
  id: true,
  name: true,
  ownerName: true,
  description: true,
  imageUrl: true,
  availability: true,
  verification: true,
  onboardedAt: true,

  location: {
    select: {
      id: true,
      area: true,
      street: true,
      address: true,
      lat: true,
      long: true,
    },
  },

  categories: {
    where: {
      category: {
        isActive: true,
      },
    },

    select: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },

  products: {
    where: {
      status: "ACTIVE",
      deletedAt: null,
    },

    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      priceMin: true,
      priceMax: true,
      availability: true,
      imageUrl: true,
      keywords: true,

      images: {
        select: {
          id: true,
          url: true,
          publicId: true,
          sortOrder: true,
        },

        orderBy: {
          sortOrder: "asc",
        },

        take: 1,
      },
    },

    orderBy: {
      updatedAt: "desc",
    },

    take: 1,
  },

  socialLinks: {
    select: {
      id: true,
      platform: true,
      handle: true,
    },
  },
} satisfies Prisma.BusinessSelect;

type NearMeBusinessRecord =
  Prisma.BusinessGetPayload<{
    select: typeof nearMeBusinessSelect;
  }>;

type SerializedLocation = {
  id: string;
  area: string;
  street: string | null;
} | null;

type RankedBusiness = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  imageUrl: string | null;
  area: string;
  location: SerializedLocation;

  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";

  verification:
    | "VERIFIED"
    | "UNVERIFIED";

  verified: boolean;

  categories: unknown;
  products: unknown;
  socialLinks: unknown;

  distanceKm: number | null;

  ranking: NearMeRanking;
  rankingLabel: NearMeRankingLabel;

  /**
   * Internal full-precision distance.
   * Removed before returning JSON.
   */
  distanceKmRaw: number | null;
};

/**
 * ------------------------------------------------
 * DATABASE FILTER
 * ------------------------------------------------
 */

const activeBusinessesWithLocationWhere = {
  status: "ACTIVE",
  deletedAt: null,

  location: {
    isNot: null,
  },
} satisfies Prisma.BusinessWhereInput;

/**
 * ------------------------------------------------
 * CONFIGURATION HELPERS
 * ------------------------------------------------
 */

function getNearMeRadiusKm(): number {
  const configured = Number(
    process.env.REMARKET_NEAR_ME_RADIUS_KM
  );

  return (
    Number.isFinite(configured) &&
    configured > 0
  )
    ? configured
    : DEFAULT_NEAR_ME_RADIUS_KM;
}

function getAdjacentStreetMaxKm(): number {
  const configured = Number(
    process.env.REMARKET_ADJACENT_STREET_MAX_KM
  );

  return (
    Number.isFinite(configured) &&
    configured > 0
  )
    ? configured
    : DEFAULT_ADJACENT_STREET_MAX_KM;
}

function clean(
  value: string | null
): string {
  return value?.trim() ?? "";
}

/**
 * ------------------------------------------------
 * PAGINATION
 * ------------------------------------------------
 */

function parsePositiveInteger(
  value: string | null,
  fallback: number
): number | null {
  if (value === null) {
    return fallback;
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return null;
  }

  return parsed;
}

function parsePagination(
  searchParams: URLSearchParams
): PaginationResult {
  const parsedPage = parsePositiveInteger(
    searchParams.get("page"),
    DEFAULT_PAGE
  );

  if (parsedPage === null) {
    return {
      valid: false,
      error: "'page' must be a positive integer.",
    };
  }

  const parsedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE
  );

  if (parsedPageSize === null) {
    return {
      valid: false,
      error: "'pageSize' must be a positive integer.",
    };
  }

  const pageSize = Math.min(
    parsedPageSize,
    MAX_PAGE_SIZE
  );

  const skip = (parsedPage - 1) * pageSize;

  if (
    !Number.isSafeInteger(skip) ||
    skip > MAX_DATABASE_OFFSET
  ) {
    return {
      valid: false,
      error: "Requested page is too large.",
    };
  }

  return {
    valid: true,

    params: {
      page: parsedPage,
      pageSize,
      skip,
    },
  };
}

function paginationMetadata(
  total: number,
  page: number,
  pageSize: number
) {
  const totalPages = Math.ceil(
    total / pageSize
  );

  return {
    page,
    pageSize,
    total,
    totalPages,

    hasNextPage:
      page < totalPages,

    hasPreviousPage:
      totalPages > 0 &&
      page > 1,
  };
}

/**
 * ------------------------------------------------
 * RESPONSE HEADERS
 * ------------------------------------------------
 */

function noStoreHeaders(
  rateLimitHeaders?: Headers
): Headers {
  const headers = new Headers(
    rateLimitHeaders
  );

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return headers;
}

/**
 * ------------------------------------------------
 * COORDINATE HELPERS
 * ------------------------------------------------
 */

function parseCoordinate(
  value: string | null
): ParsedCoordinate {
  if (
    value === null ||
    !value.trim()
  ) {
    return null;
  }

  const parsed = Number(
    value.trim()
  );

  return Number.isFinite(parsed)
    ? parsed
    : "INVALID";
}

function isValidLatitude(
  value: number | null
): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value: number | null
): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

function formatDistance(
  distanceKm: number
): number {
  return Number(
    distanceKm.toFixed(1)
  );
}

function getBusinessDistanceKm(
  latitude: number,
  longitude: number,
  location: {
    lat: number | null;
    long: number | null;
  }
): number | null {
  if (
    !isValidLatitude(location.lat) ||
    !isValidLongitude(location.long)
  ) {
    return null;
  }

  const distance = haversineDistance(
    latitude,
    longitude,
    location.lat,
    location.long
  );

  return (
    Number.isFinite(distance) &&
    distance >= 0
  )
    ? distance
    : null;
}

/**
 * ------------------------------------------------
 * STREET NORMALIZATION AND ALIASES
 * ------------------------------------------------
 */

function normalizeStreetName(
  value: string
): string {
  let normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,'"`’()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const replacements: Array<
    [RegExp, string]
  > = [
    [/\bst\b/g, "street"],
    [/\brd\b/g, "road"],
    [/\bave\b/g, "avenue"],
    [/\bdr\b/g, "drive"],
    [/\bln\b/g, "lane"],
    [/\bcl\b/g, "close"],
    [/\bcres\b/g, "crescent"],
    [/\bblvd\b/g, "boulevard"],
    [/\bexpwy\b/g, "expressway"],
  ];

  for (
    const [pattern, replacement]
    of replacements
  ) {
    normalized = normalized.replace(
      pattern,
      replacement
    );
  }

  return normalized
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert a canonical street name or alias
 * to one normalized comparison value.
 */
function canonicalizeStreetName(
  value: string
): string {
  const normalized = normalizeStreetName(
    value
  );

  if (!normalized) {
    return "";
  }

  for (
    const [canonical, aliases]
    of Object.entries(STREET_ALIASES)
  ) {
    const candidates = [
      canonical,
      ...aliases,
    ].map(normalizeStreetName);

    if (candidates.includes(normalized)) {
      return normalizeStreetName(canonical);
    }
  }

  return normalized;
}

function streetsMatch(
  first: string | null,
  second: string | null
): boolean {
  if (!first || !second) {
    return false;
  }

  const normalizedFirst =
    canonicalizeStreetName(first);

  const normalizedSecond =
    canonicalizeStreetName(second);

  return Boolean(
    normalizedFirst &&
    normalizedSecond &&
    normalizedFirst === normalizedSecond
  );
}

/**
 * Match canonical street names, aliases,
 * or a leading partial street query.
 */
function streetMatchesSearch(
  street: string | null,
  query: string
): boolean {
  if (
    !street?.trim() ||
    !query.trim()
  ) {
    return false;
  }

  const normalizedStreet =
    canonicalizeStreetName(street);

  const normalizedQuery =
    canonicalizeStreetName(query);

  if (
    !normalizedStreet ||
    !normalizedQuery
  ) {
    return false;
  }

  if (
    normalizedStreet === normalizedQuery
  ) {
    return true;
  }

  // Avoid unrelated matches for very short inputs.
  return (
    normalizedQuery.length >= 3 &&
    normalizedStreet.startsWith(normalizedQuery)
  );
}

/**
 * ------------------------------------------------
 * LEGACY STREET FALLBACK
 * ------------------------------------------------
 *
 * Older records may have the street saved in
 * Location.address instead of Location.street.
 */

function isHouseNumberOnly(
  value: string
): boolean {
  return /^\d+[A-Za-z]?(?:\s*[-/]\s*\d+[A-Za-z]?)?$/.test(
    value.trim()
  );
}

function stripLeadingHouseNumber(
  value: string
): string {
  return value
    .replace(
      /^\s*\d+[A-Za-z]?(?:\s*[-/]\s*\d+[A-Za-z]?)?\s+/,
      ""
    )
    .trim();
}

function parseLegacyStreetFromAddress(
  address: string | null,
  area: string
): string | null {
  if (!address?.trim()) {
    return null;
  }

  let parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  if (
    parts[parts.length - 1].toLowerCase() ===
    "nigeria"
  ) {
    parts = parts.slice(0, -1);
  }

  if (parts.length === 0) {
    return null;
  }

  const normalizedArea =
    normalizeAreaForComparison(area);

  const areaIndex = parts.findIndex(
    (part) =>
      normalizeAreaForComparison(part) ===
      normalizedArea
  );

  if (areaIndex > 0) {
    let streetIndex = areaIndex - 1;

    if (
      isHouseNumberOnly(parts[streetIndex]) &&
      streetIndex > 0
    ) {
      streetIndex -= 1;
    }

    return (
      stripLeadingHouseNumber(
        parts[streetIndex]
      ) || null
    );
  }

  if (parts.length >= 3) {
    return (
      stripLeadingHouseNumber(parts[1]) ||
      null
    );
  }

  if (parts.length === 2) {
    if (isHouseNumberOnly(parts[0])) {
      return (
        stripLeadingHouseNumber(parts[1]) ||
        null
      );
    }

    return (
      stripLeadingHouseNumber(parts[0]) ||
      null
    );
  }

  return (
    stripLeadingHouseNumber(parts[0]) ||
    null
  );
}

function normalizeAreaForComparison(
  value: string
): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBusinessStreet(
  location: {
    street: string | null;
    address: string | null;
    area: string;
  }
): string | null {
  const storedStreet =
    location.street?.trim() ?? "";

  return (
    storedStreet ||
    parseLegacyStreetFromAddress(
      location.address,
      location.area
    )
  );
}

/**
 * ------------------------------------------------
 * LOCATION SERIALIZATION
 * ------------------------------------------------
 *
 * Exact business coordinates are never returned.
 */

function serializeLocation(
  location: {
    id: string;
    area: string;
    street: string | null;
  } | null
): SerializedLocation {
  if (!location) {
    return null;
  }

  return {
    id: location.id,
    area: location.area,
    street: location.street,
  };
}

/**
 * ------------------------------------------------
 * BUSINESS FORMATTING
 * ------------------------------------------------
 */

function buildRankedBusiness(
  business: NearMeBusinessRecord,
  ranking: NearMeRanking,
  rankingLabel: NearMeRankingLabel,
  distanceKmRaw: number | null,
  businessStreet: string | null
): RankedBusiness {
  const location = business.location;

  return {
    id: business.id,
    name: business.name,
    ownerName: business.ownerName,
    description: business.description,
    imageUrl: business.imageUrl,

    area:
      location?.area ??
      "Location not added",

    location: serializeLocation(
      location
        ? {
            id: location.id,
            area: location.area,
            street: businessStreet,
          }
        : null
    ),

    availability: business.availability,
    verification: business.verification,

    verified:
      business.verification === "VERIFIED",

    categories: business.categories,
    products: business.products,
    socialLinks: business.socialLinks,

    distanceKm:
      distanceKmRaw !== null
        ? formatDistance(distanceKmRaw)
        : null,

    ranking,
    rankingLabel,
    distanceKmRaw,
  };
}

function toPublicBusiness(
  business: RankedBusiness
) {
  const {
    distanceKmRaw: _distanceKmRaw,
    ...publicBusiness
  } = business;

  return publicBusiness;
}

/**
 * ------------------------------------------------
 * RANKING SORT
 * ------------------------------------------------
 *
 * Ranking level takes priority over distance.
 * Distance sorts businesses inside each level.
 */

function compareRankedBusinesses(
  first: RankedBusiness,
  second: RankedBusiness
): number {
  if (first.ranking !== second.ranking) {
    return first.ranking - second.ranking;
  }

  if (
    first.distanceKmRaw === null &&
    second.distanceKmRaw === null
  ) {
    return first.name.localeCompare(
      second.name
    );
  }

  if (first.distanceKmRaw === null) {
    return 1;
  }

  if (second.distanceKmRaw === null) {
    return -1;
  }

  return (
    first.distanceKmRaw -
    second.distanceKmRaw
  );
}

function paginateRankedBusinesses(
  businesses: RankedBusiness[],
  page: number,
  pageSize: number
) {
  const start = (page - 1) * pageSize;

  return businesses
    .slice(start, start + pageSize)
    .map(toPublicBusiness);
}

/**
 * ------------------------------------------------
 * INVALID SEARCH RESPONSE
 * ------------------------------------------------
 */

function invalidAreaResponse(
  rateLimitHeaders: Headers,
  page: number,
  pageSize: number
) {
  const warning =
    "This area is not valid. Select an area from the predefined list, or enter a street name used by a registered business.";

  return NextResponse.json(
    {
      businesses: [],
      ...paginationMetadata(
        0,
        page,
        pageSize
      ),
      mode: "none",
      location: null,
      code: "INVALID_AREA",
      warning,
      error: warning,
    },
    {
      status: 400,
      headers: noStoreHeaders(rateLimitHeaders),
    }
  );
}

/**
 * ------------------------------------------------
 * NEAR ME GET HANDLER
 * ------------------------------------------------
 */

export async function GET(
  request: NextRequest
) {
  const rateLimit = checkPublicRateLimit(
    request,
    "near-me"
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        businesses: [],
        total: 0,
        mode: "none",
        location: null,
        error:
          "Too many location searches. Please try again shortly.",
      },
      {
        status: 429,
        headers: noStoreHeaders(rateLimit.headers),
      }
    );
  }

  try {
    const { searchParams } = new URL(
      request.url
    );

    const paginationResult = parsePagination(
      searchParams
    );

    if (!paginationResult.valid) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode: "none",
          location: null,
          error: paginationResult.error,
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    const {
      page,
      pageSize,
      skip,
    } = paginationResult.params;

    const emptyPagination =
      paginationMetadata(
        0,
        page,
        pageSize
      );

    /**
     * `q` is the unified search parameter used
     * by the updated Near Me page.
     *
     * `area` remains supported for older callers,
     * but an area supplied this way must be valid.
     */

    const areaParam = clean(
      searchParams.get("area")
    );

    const queryParam = clean(
      searchParams.get("q")
    );

    const searchText =
      queryParam || areaParam;

    const queryWasProvided =
      queryParam.length > 0;

    const resolvedArea =
      resolvePredefinedArea(searchText);

    const hasTextSearch =
      searchText.length > 0;

    if (
      searchText.length > MAX_SEARCH_LENGTH
    ) {
      return NextResponse.json(
        {
          businesses: [],
          ...emptyPagination,
          mode: "none",
          location: null,
          error: "Search text is too long.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    /**
     * -----------------------------------------
     * GPS PARAMETERS
     * -----------------------------------------
     */

    const latitudeRaw =
      searchParams.get("lat");

    const lngRaw =
      searchParams.get("lng");

    const longRaw =
      searchParams.get("long");

    if (
      lngRaw !== null &&
      longRaw !== null &&
      lngRaw.trim() !== "" &&
      longRaw.trim() !== ""
    ) {
      return NextResponse.json(
        {
          businesses: [],
          ...emptyPagination,
          mode: "none",
          location: null,
          error:
            "Provide longitude using either 'lng' or 'long', not both.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    const longitudeRaw =
      lngRaw?.trim()
        ? lngRaw
        : longRaw;

    const parsedLatitude =
      parseCoordinate(latitudeRaw);

    const parsedLongitude =
      parseCoordinate(longitudeRaw);

    const latitudeSupplied =
      latitudeRaw !== null &&
      latitudeRaw.trim() !== "";

    const longitudeSupplied =
      longitudeRaw !== null &&
      longitudeRaw.trim() !== "";

    if (
      (
        latitudeSupplied &&
        parsedLatitude === "INVALID"
      ) ||
      (
        longitudeSupplied &&
        parsedLongitude === "INVALID"
      )
    ) {
      return NextResponse.json(
        {
          businesses: [],
          ...emptyPagination,
          mode: "none",
          location: null,
          error:
            "Latitude and longitude must be valid numbers.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    const latitude: number | null =
      parsedLatitude === "INVALID"
        ? null
        : parsedLatitude;

    const longitude: number | null =
      parsedLongitude === "INVALID"
        ? null
        : parsedLongitude;

    const hasLatitude =
      latitude !== null;

    const hasLongitude =
      longitude !== null;

    const hasPartialGps =
      hasLatitude !== hasLongitude;

    /**
     * A text search may be made independently.
     * A GPS-only request must have both coordinates.
     */

    if (
      hasPartialGps &&
      !hasTextSearch
    ) {
      return NextResponse.json(
        {
          businesses: [],
          ...emptyPagination,
          mode: "none",
          location: null,
          error:
            "Both latitude and longitude are required for current-location search.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    if (
      (
        hasLatitude &&
        !isValidLatitude(latitude)
      ) ||
      (
        hasLongitude &&
        !isValidLongitude(longitude)
      )
    ) {
      return NextResponse.json(
        {
          businesses: [],
          ...emptyPagination,
          mode: "none",
          location: null,
          error:
            "Latitude must be between -90 and 90, and longitude must be between -180 and 180.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    const hasValidGps =
      isValidLatitude(latitude) &&
      isValidLongitude(longitude);

    let searchMode: SearchMode;

    if (hasTextSearch) {
      if (resolvedArea) {
        searchMode = "area";
      } else if (queryWasProvided) {
        // q can be a street or a registered street alias.
        searchMode = "street";
      } else {
        // Legacy area= must refer to a predefined area.
        searchMode = "invalid-area";
      }
    } else {
      searchMode = hasValidGps
        ? "gps"
        : "none";
    }

    /**
     * -----------------------------------------
     * NO SEARCH LOCATION
     * -----------------------------------------
     */

    if (searchMode === "none") {
      return NextResponse.json(
        {
          businesses: [],
          ...emptyPagination,
          mode: "none",
          location: null,
        },
        {
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    if (searchMode === "invalid-area") {
      return invalidAreaResponse(
        rateLimit.headers,
        page,
        pageSize
      );
    }

    /**
     * -----------------------------------------
     * AREA SEARCH
     * -----------------------------------------
     *
     * Resolve the input to its canonical area name.
     * Match that area exactly, not with `contains`.
     * This prevents a partial or unrelated area from
     * returning results.
     */

    if (searchMode === "area") {
      const area = resolvedArea as string;

      const areaWhere = {
        status: "ACTIVE",
        deletedAt: null,

        location: {
          area: {
            equals: area,
            mode: "insensitive",
          },
        },
      } satisfies Prisma.BusinessWhereInput;

      const [
        total,
        baseBusinesses,
      ] = await Promise.all([
        prisma.business.count({
          where: areaWhere,
        }),

        prisma.business.findMany({
          where: areaWhere,
          select: nearMeBusinessSelect,
          skip,
          take: pageSize,

          orderBy: [
            { onboardedAt: "desc" },
            { id: "asc" },
          ],
        }),
      ]);

      const formattedBusinesses =
        baseBusinesses.map((business) =>
          buildRankedBusiness(
            business,
            4,
            "whole-area",
            null,
            business.location
              ? getBusinessStreet(
                  business.location
                )
              : null
          )
        );

      return NextResponse.json(
        {
          businesses:
            formattedBusinesses.map(
              toPublicBusiness
            ),

          ...paginationMetadata(
            total,
            page,
            pageSize
          ),

          mode: "area",
          ranking: "whole-area",
          location: area,
        },
        {
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    /**
     * -----------------------------------------
     * STREET SEARCH
     * -----------------------------------------
     *
     * Search stored business street names.
     * The alias map and normalization make matches
     * case-insensitive and support configured aliases.
     *
     * These are text-search results, not GPS proximity
     * results, so no distance is inferred.
     */

    if (searchMode === "street") {
      const baseBusinesses =
        await prisma.business.findMany({
          where:
            activeBusinessesWithLocationWhere,

          select: nearMeBusinessSelect,

          orderBy: [
            { onboardedAt: "desc" },
            { id: "asc" },
          ],
        });

      const matching =
        baseBusinesses.flatMap(
          (business): RankedBusiness[] => {
            const location =
              business.location;

            if (!location) {
              return [];
            }

            const businessStreet =
              getBusinessStreet(location);

            if (
              !businessStreet ||
              !streetMatchesSearch(
                businessStreet,
                searchText
              )
            ) {
              return [];
            }

            return [
              buildRankedBusiness(
                business,
                1,
                "same-street",
                null,
                businessStreet
              ),
            ];
          }
        );

      if (matching.length === 0) {
        return invalidAreaResponse(
          rateLimit.headers,
          page,
          pageSize
        );
      }

      const total = matching.length;

      return NextResponse.json(
        {
          businesses:
            paginateRankedBusinesses(
              matching,
              page,
              pageSize
            ),

          ...paginationMetadata(
            total,
            page,
            pageSize
          ),

          mode: "street",
          ranking: "street-match",

          location: {
            type: "search",
            street: searchText,
            area: null,
          },
        },
        {
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    /**
     * -----------------------------------------
     * GPS NEAR ME CONFIGURATION
     * -----------------------------------------
     */

    const radiusKm =
      getNearMeRadiusKm();

    const adjacentStreetMaxKm =
      getAdjacentStreetMaxKm();

    /**
     * -----------------------------------------
     * REVERSE GEOCODING
     * -----------------------------------------
     */

    let reverseLocation: Awaited<
      ReturnType<typeof reverseGeocodeLocation>
    >;

    try {
      reverseLocation =
        await reverseGeocodeLocation({
          latitude: latitude as number,
          longitude: longitude as number,
        });
    } catch (error) {
      console.error(
        "Near Me reverse geocoding error:",
        error
      );

      return NextResponse.json(
        {
          businesses: [],
          ...emptyPagination,
          mode: "gps",
          ranking: "street-area",

          location: {
            type: "current",
            street: null,
            area: null,
          },

          radiusKm,
          adjacentStreetMaxKm,

          error:
            "We could not determine your current street. Please try again.",
        },
        {
          status: 503,
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    const userStreet =
      reverseLocation.street?.trim() ||
      null;

    const userArea =
      reverseLocation.area?.trim() ||
      null;

    /**
     * -----------------------------------------
     * GPS FALLBACK: NO STREET DETECTED
     * -----------------------------------------
     */

    if (!userStreet) {
      if (!userArea) {
        return NextResponse.json(
          {
            businesses: [],
            ...emptyPagination,
            mode: "gps",
            ranking: "street-area",

            location: {
              type: "current",
              street: null,
              area: null,
            },

            radiusKm,
            adjacentStreetMaxKm,

            reason: "street-and-area-not-found",
          },
          {
            headers: noStoreHeaders(rateLimit.headers),
          }
        );
      }

      const wholeAreaBusinesses =
        await prisma.business.findMany({
          where:
            activeBusinessesWithLocationWhere,

          select: nearMeBusinessSelect,

          orderBy: [
            { onboardedAt: "desc" },
            { id: "asc" },
          ],
        });

      const fallbackResults =
        wholeAreaBusinesses
          .flatMap(
            (business): RankedBusiness[] => {
              const location =
                business.location;

              if (
                !location ||
                !areasMatch(
                  location.area,
                  userArea
                )
              ) {
                return [];
              }

              const distanceKmRaw =
                getBusinessDistanceKm(
                  latitude as number,
                  longitude as number,
                  location
                );

              return [
                buildRankedBusiness(
                  business,
                  4,
                  "whole-area",
                  distanceKmRaw,
                  getBusinessStreet(location)
                ),
              ];
            }
          )
          .sort(compareRankedBusinesses);

      const total =
        fallbackResults.length;

      return NextResponse.json(
        {
          businesses:
            paginateRankedBusinesses(
              fallbackResults,
              page,
              pageSize
            ),

          ...paginationMetadata(
            total,
            page,
            pageSize
          ),

          mode: "gps",
          ranking: "whole-area",

          location: {
            type: "current",
            street: null,
            area: userArea,
          },

          radiusKm,
          adjacentStreetMaxKm,
          reason: "street-not-found",
        },
        {
          headers: noStoreHeaders(rateLimit.headers),
        }
      );
    }

    /**
     * -----------------------------------------
     * LOAD GPS CANDIDATES
     * -----------------------------------------
     *
     * Do not paginate the database results yet.
     * All candidates must be ranked and sorted first.
     */

    const baseBusinesses =
      await prisma.business.findMany({
        where:
          activeBusinessesWithLocationWhere,

        select: nearMeBusinessSelect,

        orderBy: [
          { onboardedAt: "desc" },
          { id: "asc" },
        ],
      });

    /**
     * -----------------------------------------
     * CLASSIFY AND RANK BUSINESSES
     * -----------------------------------------
     */

    const rankedResults =
      baseBusinesses
        .flatMap(
          (business): RankedBusiness[] => {
            const location =
              business.location;

            if (!location) {
              return [];
            }

            const businessStreet =
              getBusinessStreet(location);

            const sameArea =
              userArea !== null &&
              areasMatch(
                location.area,
                userArea
              );

            const distanceKmRaw =
              getBusinessDistanceKm(
                latitude as number,
                longitude as number,
                location
              );

            /**
             * 1. SAME STREET
             *
             * Compare canonical street names and
             * registered aliases. When the reverse
             * geocoder supplies an area, require the
             * business to match that area as well.
             */

            const sameStreet =
              streetsMatch(
                businessStreet,
                userStreet
              ) &&
              (
                userArea === null ||
                sameArea
              );

            if (sameStreet) {
              return [
                buildRankedBusiness(
                  business,
                  1,
                  "same-street",
                  distanceKmRaw,
                  businessStreet
                ),
              ];
            }

            /**
             * 2. ADJACENT STREET
             *
             * V1 proximity approximation:
             * same area, different street, within threshold.
             */

            if (
              sameArea &&
              distanceKmRaw !== null &&
              distanceKmRaw <=
                adjacentStreetMaxKm
            ) {
              return [
                buildRankedBusiness(
                  business,
                  2,
                  "adjacent-street",
                  distanceKmRaw,
                  businessStreet
                ),
              ];
            }

            /**
             * 3. NEARBY STREET
             *
             * Same area and within the configured
             * radius, beyond the adjacent threshold.
             */

            if (
              sameArea &&
              distanceKmRaw !== null &&
              distanceKmRaw >
                adjacentStreetMaxKm &&
              distanceKmRaw <= radiusKm
            ) {
              return [
                buildRankedBusiness(
                  business,
                  3,
                  "nearby-street",
                  distanceKmRaw,
                  businessStreet
                ),
              ];
            }

            /**
             * 4. WHOLE AREA
             *
             * A matching area is sufficient.
             * This tier is not limited by the radius.
             */

            if (sameArea) {
              return [
                buildRankedBusiness(
                  business,
                  4,
                  "whole-area",
                  distanceKmRaw,
                  businessStreet
                ),
              ];
            }

            return [];
          }
        )
        .sort(compareRankedBusinesses);

    /**
     * -----------------------------------------
     * PAGINATE AFTER RANKING
     * -----------------------------------------
     */

    const total = rankedResults.length;

    return NextResponse.json(
      {
        businesses:
          paginateRankedBusinesses(
            rankedResults,
            page,
            pageSize
          ),

        ...paginationMetadata(
          total,
          page,
          pageSize
        ),

        mode: "gps",

        ranking:
          "same-street-adjacent-street-nearby-street-whole-area",

        location: {
          type: "current",
          street: userStreet,
          area: userArea,
        },

        radiusKm,
        adjacentStreetMaxKm,
      },
      {
        headers: noStoreHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error(
      "Near Me API error:",
      error
    );

    return NextResponse.json(
      {
        businesses: [],
        total: 0,
        mode: "none",
        location: null,
        error: "Unable to load nearby businesses.",
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      }
    );
  }
}