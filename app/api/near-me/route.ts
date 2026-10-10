import {
  NextRequest,
  NextResponse,
} from "next/server";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  haversineDistance,
} from "@/lib/distance";

import {
  reverseGeocodeLocation,
} from "@/lib/geocoding";

import {
  checkPublicRateLimit,
} from "@/lib/rate-limit";

/**
 * ------------------------------------------------
 * REMARKET NEAR ME CONFIGURATION
 * ------------------------------------------------
 *
 * GPS ranking hierarchy:
 *
 * 1. Same Street
 * 2. Adjacent Street
 * 3. Nearby Street
 * 4. Whole Area
 *
 * Ranking level takes precedence over distance.
 *
 * Pagination:
 * - Default page: 1
 * - Default page size: 12
 * - Maximum page size: 50
 */

const DEFAULT_NEAR_ME_RADIUS_KM = 10;

const DEFAULT_ADJACENT_STREET_MAX_KM = 1;

const DEFAULT_PAGE = 1;

const DEFAULT_PAGE_SIZE = 12;

const MAX_PAGE_SIZE = 50;

const MAX_AREA_LENGTH = 100;

/**
 * Keep database offsets within a safe range.
 */
const MAX_DATABASE_OFFSET = 2_147_483_647;

type ParsedCoordinate =
  | number
  | null
  | "INVALID";

type NearMeRanking =
  | 1
  | 2
  | 3
  | 4;

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

type RankedBusiness = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  imageUrl: string | null;
  area: string;

  location: ReturnType<
    typeof serializeLocation
  >;

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
   * Retained internally for sorting.
   * Never returned to the client.
   */
  distanceKmRaw: number | null;
};

/**
 * ------------------------------------------------
 * SHARED BUSINESS SELECT
 * ------------------------------------------------
 *
 * Reuse the same selected fields across the
 * search branches to keep their response data
 * consistent.
 *
 * Exact business coordinates remain server-side.
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

/**
 * ------------------------------------------------
 * SHARED DATABASE FILTERS
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

  if (
    Number.isFinite(configured) &&
    configured > 0
  ) {
    return configured;
  }

  return DEFAULT_NEAR_ME_RADIUS_KM;
}

function getAdjacentStreetMaxKm(): number {
  const configured = Number(
    process.env.REMARKET_ADJACENT_STREET_MAX_KM
  );

  if (
    Number.isFinite(configured) &&
    configured > 0
  ) {
    return configured;
  }

  return DEFAULT_ADJACENT_STREET_MAX_KM;
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

  /**
   * Enforce an upper limit so clients cannot
   * request excessively large result pages.
   */
  const pageSize = Math.min(
    parsedPageSize,
    MAX_PAGE_SIZE
  );

  const skip =
    (parsedPage - 1) * pageSize;

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

  if (!Number.isFinite(parsed)) {
    return "INVALID";
  }

  return parsed;
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

  if (
    !Number.isFinite(distance) ||
    distance < 0
  ) {
    return null;
  }

  return distance;
}

/**
 * ------------------------------------------------
 * STREET NORMALIZATION
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

function streetsMatch(
  first: string | null,
  second: string | null
): boolean {
  if (!first || !second) {
    return false;
  }

  const normalizedFirst =
    normalizeStreetName(first);

  const normalizedSecond =
    normalizeStreetName(second);

  if (
    !normalizedFirst ||
    !normalizedSecond
  ) {
    return false;
  }

  return (
    normalizedFirst === normalizedSecond
  );
}

/**
 * ------------------------------------------------
 * AREA NORMALIZATION
 * ------------------------------------------------
 */

function normalizeAreaName(
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

function areasMatch(
  first: string | null,
  second: string | null
): boolean {
  if (!first || !second) {
    return false;
  }

  const normalizedFirst =
    normalizeAreaName(first);

  const normalizedSecond =
    normalizeAreaName(second);

  if (
    !normalizedFirst ||
    !normalizedSecond
  ) {
    return false;
  }

  return (
    normalizedFirst === normalizedSecond
  );
}

/**
 * ------------------------------------------------
 * LEGACY STREET FALLBACK
 * ------------------------------------------------
 *
 * Canonical address ordering:
 *
 * House Number, Street, Area, City, Nigeria
 *
 * Older records may have the street in address
 * instead of the dedicated Location.street field.
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

  /**
   * Remove Nigeria from the end if present.
   */
  if (
    normalizeAreaName(
      parts[parts.length - 1]
    ) === "nigeria"
  ) {
    parts = parts.slice(0, -1);
  }

  if (parts.length === 0) {
    return null;
  }

  /**
   * Prefer finding the stored area within the
   * address components, rather than assuming
   * the street is always at a fixed position.
   */
  const normalizedArea =
    normalizeAreaName(area);

  const areaIndex = parts.findIndex(
    (part) =>
      normalizeAreaName(part) ===
      normalizedArea
  );

  if (areaIndex > 0) {
    let streetIndex = areaIndex - 1;

    /**
     * Handle a separate house-number component
     * immediately before the area if the older
     * address omitted its street component.
     */
    if (
      isHouseNumberOnly(parts[streetIndex]) &&
      streetIndex > 0
    ) {
      streetIndex -= 1;
    }

    const candidate = stripLeadingHouseNumber(
      parts[streetIndex]
    );

    return candidate || null;
  }

  /**
   * Fallback for older canonical addresses when
   * the area component is absent or formatted
   * differently.
   */
  if (parts.length >= 3) {
    const candidate = stripLeadingHouseNumber(
      parts[1]
    );

    return candidate || null;
  }

  if (parts.length === 2) {
    if (isHouseNumberOnly(parts[0])) {
      const candidate = stripLeadingHouseNumber(
        parts[1]
      );

      return candidate || null;
    }

    const candidate = stripLeadingHouseNumber(
      parts[0]
    );

    return candidate || null;
  }

  const candidate = stripLeadingHouseNumber(
    parts[0]
  );

  return candidate || null;
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

  if (storedStreet) {
    return storedStreet;
  }

  return parseLegacyStreetFromAddress(
    location.address,
    location.area
  );
}

/**
 * ------------------------------------------------
 * LOCATION SERIALIZATION
 * ------------------------------------------------
 *
 * Exact business coordinates must never be
 * returned in public Near Me responses.
 */

function serializeLocation(
  location: {
    id: string;
    area: string;
    street: string | null;
  } | null
) {
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

/**
 * Remove the internal raw distance before
 * returning a business to the client.
 */
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
 * Ranking always wins over physical distance.
 *
 * Distance only sorts businesses within the
 * same ranking level.
 *
 * Records without coordinates follow records
 * that have calculable distances.
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
    return 0;
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
 * NEAR ME API
 * ------------------------------------------------
 */

export async function GET(
  request: NextRequest
) {
  /**
   * -----------------------------------------
   * PUBLIC RATE LIMIT
   * -----------------------------------------
   */

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

        headers: noStoreHeaders(
          rateLimit.headers
        ),
      }
    );
  }

  try {
    const { searchParams } = new URL(
      request.url
    );

    /**
     * -----------------------------------------
     * PAGINATION PARAMETERS
     * -----------------------------------------
     */

    const paginationResult =
      parsePagination(searchParams);

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

          headers: noStoreHeaders(
            rateLimit.headers
          ),
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
     * -----------------------------------------
     * READ LOCATION PARAMETERS
     * -----------------------------------------
     */

    const area = clean(
      searchParams.get("area")
    );

    const latitudeRaw =
      searchParams.get("lat");

    const lngRaw =
      searchParams.get("lng");

    const longRaw =
      searchParams.get("long");

    /**
     * -----------------------------------------
     * VALIDATE AREA INPUT
     * -----------------------------------------
     */

    if (area.length > MAX_AREA_LENGTH) {
      return NextResponse.json(
        {
          businesses: [],
          ...emptyPagination,
          mode: "none",
          location: null,
          error: "Area is too long.",
        },
        {
          status: 400,

          headers: noStoreHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    /**
     * -----------------------------------------
     * LONGITUDE ALIAS VALIDATION
     * -----------------------------------------
     *
     * Support both lng and long.
     *
     * Reject two populated aliases, but allow
     * an empty lng parameter to fall back to long.
     */

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

          headers: noStoreHeaders(
            rateLimit.headers
          ),
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

    /**
     * -----------------------------------------
     * VALIDATE COORDINATE FORMAT
     * -----------------------------------------
     */

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

          headers: noStoreHeaders(
            rateLimit.headers
          ),
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

    /**
     * -----------------------------------------
     * VALIDATE GPS PAIR
     * -----------------------------------------
     *
     * Explicit area search keeps precedence
     * when an area is provided.
     */

    const hasPartialGps =
      hasLatitude !== hasLongitude;

    if (
      hasPartialGps &&
      !area
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

          headers: noStoreHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    /**
     * -----------------------------------------
     * VALIDATE GEOGRAPHIC RANGES
     * -----------------------------------------
     */

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

          headers: noStoreHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    const hasValidGps =
      isValidLatitude(latitude) &&
      isValidLongitude(longitude);

    const searchMode = area
      ? "area"
      : hasValidGps
        ? "gps"
        : "none";

    /**
     * -----------------------------------------
     * NO LOCATION PROVIDED
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
          headers: noStoreHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    /**
     * -----------------------------------------
     * EXPLICIT AREA SEARCH
     * -----------------------------------------
     *
     * Area search is paginated in the database.
     * It is separate from GPS street ranking.
     */

    if (searchMode === "area") {
      const areaWhere = {
        status: "ACTIVE",
        deletedAt: null,

        location: {
          area: {
            contains: area,
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
            {
              onboardedAt: "desc",
            },
            {
              id: "asc",
            },
          ],
        }),
      ]);

      const formattedBusinesses =
        baseBusinesses.map(
          (business) =>
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
          headers: noStoreHeaders(
            rateLimit.headers
          ),
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
      ReturnType<
        typeof reverseGeocodeLocation
      >
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

          headers: noStoreHeaders(
            rateLimit.headers
          ),
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
     * NO STREET DETECTED
     * -----------------------------------------
     *
     * If the provider returns an area but no
     * street, fall back to Whole Area.
     *
     * Calculate physical distance when possible,
     * while keeping every result at ranking 4.
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

            reason:
              "street-and-area-not-found",
          },
          {
            headers: noStoreHeaders(
              rateLimit.headers
            ),
          }
        );
      }

      const wholeAreaBusinesses =
        await prisma.business.findMany({
          where:
            activeBusinessesWithLocationWhere,

          select: nearMeBusinessSelect,

          orderBy: [
            {
              onboardedAt: "desc",
            },
            {
              id: "asc",
            },
          ],
        });

      const fallbackResults =
        wholeAreaBusinesses
          .flatMap(
            (business): RankedBusiness[] => {
              const location =
                business.location;

              if (!location) {
                return [];
              }

              if (
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
          .sort(
            compareRankedBusinesses
          );

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
          headers: noStoreHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    /**
     * -----------------------------------------
     * LOAD GPS CANDIDATES
     * -----------------------------------------
     *
     * Do not apply database pagination here.
     *
     * All candidates must be classified and
     * sorted before selecting the requested page.
     *
     * Otherwise, higher-ranking businesses could
     * be missed by an early database limit.
     */

    const baseBusinesses =
      await prisma.business.findMany({
        where:
          activeBusinessesWithLocationWhere,

        select: nearMeBusinessSelect,

        orderBy: [
          {
            onboardedAt: "desc",
          },
          {
            id: "asc",
          },
        ],
      });

    /**
     * -----------------------------------------
     * CLASSIFY BUSINESSES
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
              getBusinessStreet(
                location
              );

            const sameArea =
              userArea !== null &&
              areasMatch(
                location.area,
                userArea
              );

            /**
             * Determine distance for sorting
             * and distance-based ranking levels.
             */
            const distanceKmRaw =
              getBusinessDistanceKm(
                latitude as number,
                longitude as number,
                location
              );

            /**
             * -------------------------------------
             * 1. SAME STREET
             * -------------------------------------
             *
             * If the buyer's area is known, the
             * business must also belong to that
             * area. This prevents unrelated roads
             * with identical names from matching.
             *
             * GPS distance does not determine
             * Same Street membership.
             */

            const sameStreetName =
              streetsMatch(
                businessStreet,
                userStreet
              );

            const sameStreet =
              sameStreetName &&
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
             * -------------------------------------
             * 2. ADJACENT STREET
             * -------------------------------------
             *
             * Requirements:
             * - Different street
             * - Same area
             * - Within the configured threshold
             *
             * This uses proximity as a V1
             * approximation of street adjacency.
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
             * -------------------------------------
             * 3. NEARBY STREET
             * -------------------------------------
             *
             * Requirements:
             * - Same area
             * - Beyond the adjacent threshold
             * - Within the Near Me radius
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
             * -------------------------------------
             * 4. WHOLE AREA
             * -------------------------------------
             *
             * Whole Area is not constrained by
             * the Near Me radius.
             *
             * A matching area is sufficient.
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

            /**
             * The business is outside the
             * applicable ranking levels.
             */
            return [];
          }
        )
        .sort(
          compareRankedBusinesses
        );

    /**
     * -----------------------------------------
     * PAGINATE AFTER RANKING
     * -----------------------------------------
     */

    const total =
      rankedResults.length;

    const paginatedBusinesses =
      paginateRankedBusinesses(
        rankedResults,
        page,
        pageSize
      );

    /**
     * -----------------------------------------
     * GPS RESPONSE
     * -----------------------------------------
     */

    return NextResponse.json(
      {
        businesses:
          paginatedBusinesses,

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
        headers: noStoreHeaders(
          rateLimit.headers
        ),
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

        error:
          "Unable to load nearby businesses.",
      },
      {
        status: 500,

        headers: noStoreHeaders(
          rateLimit.headers
        ),
      }
    );
  }
}