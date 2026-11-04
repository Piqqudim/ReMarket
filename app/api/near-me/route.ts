
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { haversineDistance } from "@/lib/distance";
import { reverseGeocodeLocation } from "@/lib/geocoding";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { areasMatch, resolvePredefinedArea } from "@/lib/lagos-areas";
import { STREET_ALIASES } from "@/lib/near-me-street-aliases";

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

type SearchMode = "none" | "area" | "street" | "gps" | "invalid-area";

type PaginationParams = {
  page: number;
  pageSize: number;
  skip: number;
};

type PaginationResult =
  | { valid: true; params: PaginationParams }
  | { valid: false; error: string };

const nearMeSellerSelect = {
  id: true,
  name: true,
  ownerName: true,
  description: true,
  imageUrl: true,
  availability: true,
  verification: true,
  onboardedAt: true,
  showContactInfo: true,
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
      category: { isActive: true },
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
  socialLinks: {
    select: {
      id: true,
      platform: true,
      handle: true,
    },
  },
} satisfies Prisma.BusinessSelect;

const nearMeProductSelect = {
  id: true,
  businessId: true,
  name: true,
  description: true,
  price: true,
  priceMin: true,
  priceMax: true,
  availability: true,
  imageUrl: true,
  keywords: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      iconKey: true,
      isActive: true,
      sortOrder: true,
    },
  },
  images: {
    select: {
      id: true,
      url: true,
      publicId: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
    take: 1,
  },
} satisfies Prisma.ProductSelect;

const nearMeServiceSelect = {
  id: true,
  businessId: true,
  name: true,
  description: true,
  price: true,
  priceMin: true,
  priceMax: true,
  availability: true,
  imageUrl: true,
  keywords: true,
  durationMinutes: true,
  fulfillmentType: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      iconKey: true,
      isActive: true,
      sortOrder: true,
    },
  },
  images: {
    select: {
      id: true,
      url: true,
      publicId: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
    take: 1,
  },
} satisfies Prisma.ServiceSelect;

type NearMeSeller = Prisma.BusinessGetPayload<{
  select: typeof nearMeSellerSelect;
}>;

type NearMeProduct = Prisma.ProductGetPayload<{
  select: typeof nearMeProductSelect;
}>;

type NearMeService = Prisma.ServiceGetPayload<{
  select: typeof nearMeServiceSelect;
}>;

type SerializedSeller = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  imageUrl: string | null;
  availability: string;
  verification: string;
  verified: boolean;
  showContactInfo: boolean;
  location: {
    id: string;
    area: string;
    street: string | null;
  } | null;
  categories: string[];
  socialLinks: Array<{
    id: string;
    platform: string;
    handle: string;
  }>;
};

type RankedSeller = {
  seller: NearMeSeller;
  street: string | null;
  ranking: NearMeRanking;
  rankingLabel: NearMeRankingLabel;
  distanceKmRaw: number | null;
};

type RankedListing = {
  id: string;
  type: "PRODUCT" | "SERVICE";
  updatedAt: Date;
  ranking: NearMeRanking;
  rankingLabel: NearMeRankingLabel;
  distanceKm: number | null;
  distanceKmRaw: number | null;
  area: string;
  seller: SerializedSeller;
  payload: Record<string, unknown>;
};

const activeBusinessesWithLocationWhere = {
  status: "ACTIVE",
  deletedAt: null,
  location: { isNot: null },
} satisfies Prisma.BusinessWhereInput;

function getNearMeRadiusKm(): number {
  const configured = Number(process.env.REMARKET_NEAR_ME_RADIUS_KM);

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_NEAR_ME_RADIUS_KM;
}

function getAdjacentStreetMaxKm(): number {
  const configured = Number(process.env.REMARKET_ADJACENT_STREET_MAX_KM);

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_ADJACENT_STREET_MAX_KM;
}

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function noStoreHeaders(rateLimitHeaders?: Headers): Headers {
  const headers = new Headers(rateLimitHeaders);
  headers.set("Cache-Control", "no-store");
  return headers;
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
): number | null {
  if (value === null) return fallback;

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function parsePagination(searchParams: URLSearchParams): PaginationResult {
  const page = parsePositiveInteger(
    searchParams.get("page"),
    DEFAULT_PAGE,
  );

  if (page === null) {
    return {
      valid: false,
      error: "'page' must be a positive integer.",
    };
  }

  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );

  if (requestedPageSize === null) {
    return {
      valid: false,
      error: "'pageSize' must be a positive integer.",
    };
  }

  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  if (!Number.isSafeInteger(skip) || skip > MAX_DATABASE_OFFSET) {
    return {
      valid: false,
      error: "Requested page is too large.",
    };
  }

  return {
    valid: true,
    params: { page, pageSize, skip },
  };
}

function paginationMetadata(
  total: number,
  page: number,
  pageSize: number,
) {
  const totalPages = Math.ceil(total / pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: totalPages > 0 && page > 1,
  };
}

function parseCoordinate(value: string | null): ParsedCoordinate {
  if (value === null || !value.trim()) return null;

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : "INVALID";
}

function isValidLatitude(value: number | null): value is number {
  return value !== null &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return value !== null &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180;
}

function formatDistance(distanceKm: number): number {
  return Number(distanceKm.toFixed(1));
}

function getBusinessDistanceKm(
  latitude: number,
  longitude: number,
  location: { lat: number | null; long: number | null },
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
    location.long,
  );

  return Number.isFinite(distance) && distance >= 0
    ? distance
    : null;
}

function normalizeStreetName(value: string): string {
  let normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,'"`’()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const replacements: Array<[RegExp, string]> = [
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

  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function canonicalizeStreetName(value: string): string {
  const normalized = normalizeStreetName(value);
  if (!normalized) return "";

  for (const [canonical, aliases] of Object.entries(STREET_ALIASES)) {
    const candidates = [canonical, ...aliases].map(normalizeStreetName);

    if (candidates.includes(normalized)) {
      return normalizeStreetName(canonical);
    }
  }

  return normalized;
}

function streetsMatch(
  first: string | null,
  second: string | null,
): boolean {
  if (!first || !second) return false;

  const normalizedFirst = canonicalizeStreetName(first);
  const normalizedSecond = canonicalizeStreetName(second);

  return Boolean(
    normalizedFirst &&
    normalizedSecond &&
    normalizedFirst === normalizedSecond,
  );
}

function streetMatchesSearch(
  street: string | null,
  query: string,
): boolean {
  if (!street?.trim() || !query.trim()) return false;

  const normalizedStreet = canonicalizeStreetName(street);
  const normalizedQuery = canonicalizeStreetName(query);

  if (!normalizedStreet || !normalizedQuery) return false;
  if (normalizedStreet === normalizedQuery) return true;

  return normalizedQuery.length >= 3 &&
    normalizedStreet.startsWith(normalizedQuery);
}

function isHouseNumberOnly(value: string): boolean {
  return /^\d+[A-Za-z]?(?:\s*[-/]\s*\d+[A-Za-z]?)?$/.test(
    value.trim(),
  );
}

function stripLeadingHouseNumber(value: string): string {
  return value
    .replace(/^\s*\d+[A-Za-z]?(?:\s*[-/]\s*\d+[A-Za-z]?)?\s+/, "")
    .trim();
}

function normalizeAreaForComparison(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLegacyStreetFromAddress(
  address: string | null,
  area: string,
): string | null {
  if (!address?.trim()) return null;

  let parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  if (parts[parts.length - 1].toLowerCase() === "nigeria") {
    parts = parts.slice(0, -1);
  }

  if (parts.length === 0) return null;

  const normalizedArea = normalizeAreaForComparison(area);
  const areaIndex = parts.findIndex(
    (part) => normalizeAreaForComparison(part) === normalizedArea,
  );

  if (areaIndex > 0) {
    let streetIndex = areaIndex - 1;

    if (
      isHouseNumberOnly(parts[streetIndex]) &&
      streetIndex > 0
    ) {
      streetIndex -= 1;
    }

    return stripLeadingHouseNumber(parts[streetIndex]) || null;
  }

  if (parts.length >= 3) {
    return stripLeadingHouseNumber(parts[1]) || null;
  }

  if (parts.length === 2) {
    if (isHouseNumberOnly(parts[0])) {
      return stripLeadingHouseNumber(parts[1]) || null;
    }

    return stripLeadingHouseNumber(parts[0]) || null;
  }

  return stripLeadingHouseNumber(parts[0]) || null;
}

function getBusinessStreet(location: {
  street: string | null;
  address: string | null;
  area: string;
}): string | null {
  const storedStreet = location.street?.trim() ?? "";

  return storedStreet ||
    parseLegacyStreetFromAddress(location.address, location.area);
}

function serializeSeller(
  seller: NearMeSeller,
  street: string | null,
): SerializedSeller {
  return {
    id: seller.id,
    name: seller.name,
    ownerName: seller.ownerName,
    description: seller.description,
    imageUrl: seller.imageUrl,
    availability: seller.availability,
    verification: seller.verification,
    verified: seller.verification === "VERIFIED",
    showContactInfo: seller.showContactInfo === true,

    location: seller.location
      ? {
          id: seller.location.id,
          area: seller.location.area,
          street,
        }
      : null,

    categories: seller.categories.map(
      (item) => item.category.name,
    ),

    // CONTACT PRIVACY: private sellers never expose contact links.
    socialLinks: seller.showContactInfo === true
      ? seller.socialLinks
      : [],
  };
}

function buildRankedSeller(
  seller: NearMeSeller,
  ranking: NearMeRanking,
  rankingLabel: NearMeRankingLabel,
  distanceKmRaw: number | null,
  street: string | null,
): RankedSeller {
  return {
    seller,
    street,
    ranking,
    rankingLabel,
    distanceKmRaw,
  };
}

function compareRankedSellers(
  first: RankedSeller,
  second: RankedSeller,
): number {
  if (first.ranking !== second.ranking) {
    return first.ranking - second.ranking;
  }

  if (
    first.distanceKmRaw === null &&
    second.distanceKmRaw === null
  ) {
    return first.seller.name.localeCompare(second.seller.name);
  }

  if (first.distanceKmRaw === null) return 1;
  if (second.distanceKmRaw === null) return -1;

  return first.distanceKmRaw - second.distanceKmRaw;
}

function compareRankedListings(
  first: RankedListing,
  second: RankedListing,
): number {
  if (first.ranking !== second.ranking) {
    return first.ranking - second.ranking;
  }

  if (
    first.distanceKmRaw !== null &&
    second.distanceKmRaw !== null &&
    first.distanceKmRaw !== second.distanceKmRaw
  ) {
    return first.distanceKmRaw - second.distanceKmRaw;
  }

  if (first.distanceKmRaw === null && second.distanceKmRaw !== null) {
    return 1;
  }

  if (first.distanceKmRaw !== null && second.distanceKmRaw === null) {
    return -1;
  }

  const updatedDifference =
    second.updatedAt.getTime() - first.updatedAt.getTime();

  if (updatedDifference !== 0) return updatedDifference;

  return first.id.localeCompare(second.id);
}

function buildProductListing(
  product: NearMeProduct,
  rankedSeller: RankedSeller,
): RankedListing {
  const sellerLocation = rankedSeller.seller.location;

  return {
    id: product.id,
    type: "PRODUCT",
    updatedAt: product.updatedAt,
    ranking: rankedSeller.ranking,
    rankingLabel: rankedSeller.rankingLabel,
    distanceKm: rankedSeller.distanceKmRaw !== null
      ? formatDistance(rankedSeller.distanceKmRaw)
      : null,
    distanceKmRaw: rankedSeller.distanceKmRaw,
    area: sellerLocation?.area ?? "Location not added",
    seller: serializeSeller(
      rankedSeller.seller,
      rankedSeller.street,
    ),
    payload: {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      priceMin: product.priceMin,
      priceMax: product.priceMax,
      availability: product.availability,
      imageUrl: product.imageUrl,
      keywords: product.keywords,
      category: product.category?.isActive
        ? product.category
        : null,
      images: product.images.map((image) => ({
        id: image.id,
        url: image.url,
        publicId: image.publicId,
        sortOrder: image.sortOrder,
      })),
    },
  };
}

function buildServiceListing(
  service: NearMeService,
  rankedSeller: RankedSeller,
): RankedListing {
  const sellerLocation = rankedSeller.seller.location;

  return {
    id: service.id,
    type: "SERVICE",
    updatedAt: service.updatedAt,
    ranking: rankedSeller.ranking,
    rankingLabel: rankedSeller.rankingLabel,
    distanceKm: rankedSeller.distanceKmRaw !== null
      ? formatDistance(rankedSeller.distanceKmRaw)
      : null,
    distanceKmRaw: rankedSeller.distanceKmRaw,
    area: sellerLocation?.area ?? "Location not added",
    seller: serializeSeller(
      rankedSeller.seller,
      rankedSeller.street,
    ),
    payload: {
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      priceMin: service.priceMin,
      priceMax: service.priceMax,
      availability: service.availability,
      imageUrl: service.imageUrl,
      keywords: service.keywords,
      durationMinutes: service.durationMinutes,
      fulfillmentType: service.fulfillmentType,
      category: service.category?.isActive
        ? service.category
        : null,
      images: service.images.map((image) => ({
        id: image.id,
        url: image.url,
        publicId: image.publicId,
        sortOrder: image.sortOrder,
      })),
    },
  };
}

function toPublicListing(listing: RankedListing) {
  return {
    ...listing.payload,
    type: listing.type,
    area: listing.area,
    seller: listing.seller,
    distanceKm: listing.distanceKm,
    ranking: listing.ranking,
    rankingLabel: listing.rankingLabel,
  };
}

async function loadRankedListings(
  rankedSellers: RankedSeller[],
): Promise<RankedListing[]> {
  if (rankedSellers.length === 0) return [];

  const sellerMap = new Map(
    rankedSellers.map((item) => [item.seller.id, item]),
  );

  const sellerIds = Array.from(sellerMap.keys());

  const [products, services] = await Promise.all([
    prisma.product.findMany({
      where: {
        businessId: { in: sellerIds },
        status: "ACTIVE",
        deletedAt: null,
      },
      select: nearMeProductSelect,
      orderBy: { updatedAt: "desc" },
    }),

    prisma.service.findMany({
      where: {
        businessId: { in: sellerIds },
        status: "ACTIVE",
        deletedAt: null,
      },
      select: nearMeServiceSelect,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const listings: RankedListing[] = [];

  for (const product of products) {
    const rankedSeller = sellerMap.get(product.businessId);
    if (!rankedSeller) continue;

    listings.push(
      buildProductListing(product, rankedSeller),
    );
  }

  for (const service of services) {
    const rankedSeller = sellerMap.get(service.businessId);
    if (!rankedSeller) continue;

    listings.push(
      buildServiceListing(service, rankedSeller),
    );
  }

  return listings.sort(compareRankedListings);
}

function buildPublicResults(
  listings: RankedListing[],
  page: number,
  pageSize: number,
) {
  const start = (page - 1) * pageSize;
  const pageListings = listings
    .slice(start, start + pageSize)
    .map(toPublicListing);

  const products = pageListings.filter(
    (listing) => listing.type === "PRODUCT",
  );

  const services = pageListings.filter(
    (listing) => listing.type === "SERVICE",
  );

  const totalProducts = listings.filter(
    (listing) => listing.type === "PRODUCT",
  ).length;

  const totalServices = listings.filter(
    (listing) => listing.type === "SERVICE",
  ).length;

  return {
    listings: pageListings,
    products,
    services,
    ...paginationMetadata(listings.length, page, pageSize),
    totalProducts,
    totalServices,
  };
}

function invalidAreaResponse(
  rateLimitHeaders: Headers,
  page: number,
  pageSize: number,
) {
  const warning =
    "This area is not valid. Select an area from the predefined list, or enter a street name used by a registered seller.";

  return NextResponse.json(
    {
      listings: [],
      products: [],
      services: [],
      ...paginationMetadata(0, page, pageSize),
      totalProducts: 0,
      totalServices: 0,
      mode: "none",
      location: null,
      code: "INVALID_AREA",
      warning,
      error: warning,
    },
    {
      status: 400,
      headers: noStoreHeaders(rateLimitHeaders),
    },
  );
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "near-me");

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        listings: [],
        products: [],
        services: [],
        total: 0,
        mode: "none",
        location: null,
        error: "Too many location searches. Please try again shortly.",
      },
      {
        status: 429,
        headers: noStoreHeaders(rateLimit.headers),
      },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const paginationResult = parsePagination(searchParams);

    if (!paginationResult.valid) {
      return NextResponse.json(
        {
          listings: [],
          products: [],
          services: [],
          total: 0,
          mode: "none",
          location: null,
          error: paginationResult.error,
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        },
      );
    }

    const { page, pageSize } = paginationResult.params;
    const emptyResults = buildPublicResults([], page, pageSize);

    const areaParam = clean(searchParams.get("area"));
    const queryParam = clean(searchParams.get("q"));
    const searchText = queryParam || areaParam;
    const queryWasProvided = queryParam.length > 0;
    const resolvedArea = resolvePredefinedArea(searchText);
    const hasTextSearch = searchText.length > 0;

    if (searchText.length > MAX_SEARCH_LENGTH) {
      return NextResponse.json(
        {
          ...emptyResults,
          mode: "none",
          location: null,
          error: "Search text is too long.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        },
      );
    }

    const latitudeRaw = searchParams.get("lat");
    const lngRaw = searchParams.get("lng");
    const longRaw = searchParams.get("long");

    if (
      lngRaw !== null &&
      longRaw !== null &&
      lngRaw.trim() !== "" &&
      longRaw.trim() !== ""
    ) {
      return NextResponse.json(
        {
          ...emptyResults,
          mode: "none",
          location: null,
          error: "Provide longitude using either 'lng' or 'long', not both.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        },
      );
    }

    const longitudeRaw = lngRaw?.trim() ? lngRaw : longRaw;
    const parsedLatitude = parseCoordinate(latitudeRaw);
    const parsedLongitude = parseCoordinate(longitudeRaw);

    const latitudeSupplied =
      latitudeRaw !== null && latitudeRaw.trim() !== "";

    const longitudeSupplied =
      longitudeRaw !== null && longitudeRaw.trim() !== "";

    if (
      (latitudeSupplied && parsedLatitude === "INVALID") ||
      (longitudeSupplied && parsedLongitude === "INVALID")
    ) {
      return NextResponse.json(
        {
          ...emptyResults,
          mode: "none",
          location: null,
          error: "Latitude and longitude must be valid numbers.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        },
      );
    }

    const latitude: number | null =
      parsedLatitude === "INVALID" ? null : parsedLatitude;

    const longitude: number | null =
      parsedLongitude === "INVALID" ? null : parsedLongitude;

    const hasLatitude = latitude !== null;
    const hasLongitude = longitude !== null;
    const hasPartialGps = hasLatitude !== hasLongitude;

    if (hasPartialGps && !hasTextSearch) {
      return NextResponse.json(
        {
          ...emptyResults,
          mode: "none",
          location: null,
          error: "Both latitude and longitude are required for current-location search.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        },
      );
    }

    if (
      (hasLatitude && !isValidLatitude(latitude)) ||
      (hasLongitude && !isValidLongitude(longitude))
    ) {
      return NextResponse.json(
        {
          ...emptyResults,
          mode: "none",
          location: null,
          error: "Latitude must be between -90 and 90, and longitude must be between -180 and 180.",
        },
        {
          status: 400,
          headers: noStoreHeaders(rateLimit.headers),
        },
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
        searchMode = "street";
      } else {
        searchMode = "invalid-area";
      }
    } else {
      searchMode = hasValidGps ? "gps" : "none";
    }

    if (searchMode === "none") {
      return NextResponse.json(
        {
          ...emptyResults,
          mode: "none",
          location: null,
        },
        {
          headers: noStoreHeaders(rateLimit.headers),
        },
      );
    }

    if (searchMode === "invalid-area") {
      return invalidAreaResponse(
        rateLimit.headers,
        page,
        pageSize,
      );
    }

    // AREA SEARCH
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

      const sellers = await prisma.business.findMany({
        where: areaWhere,
        select: nearMeSellerSelect,
        orderBy: [
          { onboardedAt: "desc" },
          { id: "asc" },
        ],
      });

      const rankedSellers = sellers.map((seller) =>
        buildRankedSeller(
          seller,
          4,
          "whole-area",
          null,
          seller.location
            ? getBusinessStreet(seller.location)
            : null,
        ),
      );

      const listings = await loadRankedListings(rankedSellers);

      return NextResponse.json(
        {
          ...buildPublicResults(listings, page, pageSize),
          mode: "area",
          ranking: "whole-area",
          location: area,
        },
        {
          headers: noStoreHeaders(rateLimit.headers),
        },
      );
    }

    // STREET SEARCH
    if (searchMode === "street") {
      const sellers = await prisma.business.findMany({
        where: activeBusinessesWithLocationWhere,
        select: nearMeSellerSelect,
        orderBy: [
          { onboardedAt: "desc" },
          { id: "asc" },
        ],
      });

      const rankedSellers = sellers.flatMap((seller): RankedSeller[] => {
        const location = seller.location;
        if (!location) return [];

        const street = getBusinessStreet(location);

        if (!street || !streetMatchesSearch(street, searchText)) {
          return [];
        }

        return [
          buildRankedSeller(
            seller,
            1,
            "same-street",
            null,
            street,
          ),
        ];
      });

      if (rankedSellers.length === 0) {
        const warning =
          "No products or services were found on a matching street yet. Try another street or search by area.";

        return NextResponse.json(
          {
            ...emptyResults,
            mode: "street",
            ranking: "street-match",
            location: {
              type: "search",
              street: searchText,
              area: null,
            },
            code: "NO_MATCHES",
            warning,
          },
          {
            headers: noStoreHeaders(rateLimit.headers),
          },
        );
      }

      const listings = await loadRankedListings(rankedSellers);

      return NextResponse.json(
        {
          ...buildPublicResults(listings, page, pageSize),
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
        },
      );
    }

    // GPS SEARCH
    const radiusKm = getNearMeRadiusKm();
    const adjacentStreetMaxKm = getAdjacentStreetMaxKm();

    let reverseLocation: Awaited<
      ReturnType<typeof reverseGeocodeLocation>
    >;

    try {
      reverseLocation = await reverseGeocodeLocation({
        latitude: latitude as number,
        longitude: longitude as number,
      });
    } catch (error) {
      console.error("Near Me reverse geocoding error:", error);

      return NextResponse.json(
        {
          ...emptyResults,
          mode: "gps",
          ranking: "street-area",
          location: {
            type: "current",
            street: null,
            area: null,
          },
          radiusKm,
          adjacentStreetMaxKm,
          error: "We could not determine your current street. Please try again.",
        },
        {
          status: 503,
          headers: noStoreHeaders(rateLimit.headers),
        },
      );
    }

    const userStreet = reverseLocation.street?.trim() || null;
    const userArea = reverseLocation.area?.trim() || null;

    // WHOLE-AREA FALLBACK WHEN NO STREET IS FOUND
    if (!userStreet) {
      if (!userArea) {
        return NextResponse.json(
          {
            ...emptyResults,
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
          },
        );
      }

      const sellers = await prisma.business.findMany({
        where: activeBusinessesWithLocationWhere,
        select: nearMeSellerSelect,
        orderBy: [
          { onboardedAt: "desc" },
          { id: "asc" },
        ],
      });

      const rankedSellers = sellers.flatMap((seller): RankedSeller[] => {
        const location = seller.location;

        if (!location || !areasMatch(location.area, userArea)) {
          return [];
        }

        const distanceKmRaw = getBusinessDistanceKm(
          latitude as number,
          longitude as number,
          location,
        );

        return [
          buildRankedSeller(
            seller,
            4,
            "whole-area",
            distanceKmRaw,
            getBusinessStreet(location),
          ),
        ];
      }).sort((first, second) => {
        if (first.ranking !== second.ranking) {
          return first.ranking - second.ranking;
        }

        if (
          first.distanceKmRaw === null &&
          second.distanceKmRaw === null
        ) {
          return first.seller.name.localeCompare(second.seller.name);
        }

        if (first.distanceKmRaw === null) return 1;
        if (second.distanceKmRaw === null) return -1;

        return first.distanceKmRaw - second.distanceKmRaw;
      });

      const listings = await loadRankedListings(rankedSellers);

      return NextResponse.json(
        {
          ...buildPublicResults(listings, page, pageSize),
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
        },
      );
    }

    // GPS RANKING: SAME STREET, ADJACENT, NEARBY, WHOLE AREA
    const sellers = await prisma.business.findMany({
      where: activeBusinessesWithLocationWhere,
      select: nearMeSellerSelect,
      orderBy: [
        { onboardedAt: "desc" },
        { id: "asc" },
      ],
    });

    const rankedSellers = sellers.flatMap((seller): RankedSeller[] => {
      const location = seller.location;
      if (!location) return [];

      const businessStreet = getBusinessStreet(location);
      const sameArea =
        userArea !== null &&
        areasMatch(location.area, userArea);

      const distanceKmRaw = getBusinessDistanceKm(
        latitude as number,
        longitude as number,
        location,
      );

      const sameStreet =
        streetsMatch(businessStreet, userStreet) &&
        (userArea === null || sameArea);

      if (sameStreet) {
        return [
          buildRankedSeller(
            seller,
            1,
            "same-street",
            distanceKmRaw,
            businessStreet,
          ),
        ];
      }

      if (
        sameArea &&
        distanceKmRaw !== null &&
        distanceKmRaw <= adjacentStreetMaxKm
      ) {
        return [
          buildRankedSeller(
            seller,
            2,
            "adjacent-street",
            distanceKmRaw,
            businessStreet,
          ),
        ];
      }

      if (
        sameArea &&
        distanceKmRaw !== null &&
        distanceKmRaw > adjacentStreetMaxKm &&
        distanceKmRaw <= radiusKm
      ) {
        return [
          buildRankedSeller(
            seller,
            3,
            "nearby-street",
            distanceKmRaw,
            businessStreet,
          ),
        ];
      }

      // Whole-area results remain available beyond the nearby radius.
      if (sameArea) {
        return [
          buildRankedSeller(
            seller,
            4,
            "whole-area",
            distanceKmRaw,
            businessStreet,
          ),
        ];
      }

      return [];
    }).sort(compareRankedSellers);

    const listings = await loadRankedListings(rankedSellers);

    return NextResponse.json(
      {
        ...buildPublicResults(listings, page, pageSize),
        mode: "gps",
        ranking: "same-street-adjacent-street-nearby-street-whole-area",
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
      },
    );
  } catch (error) {
    console.error("Near Me API error:", error);

    return NextResponse.json(
      {
        listings: [],
        products: [],
        services: [],
        total: 0,
        mode: "none",
        location: null,
        error: "Unable to load nearby products and services.",
      },
      {
        status: 500,
        headers: noStoreHeaders(rateLimit.headers),
      },
    );
  }
}
