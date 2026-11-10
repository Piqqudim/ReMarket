
import {
  Availability,
  Prisma,
  VerificationStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_SEARCH_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;
const MAX_LOCATION_LENGTH = 100;
const MAX_PRICE_VALUE = 1_000_000_000;
const MAX_SEARCH_RESULTS = 120;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;
const PRODUCT_IMAGE_LIMIT = 1;

type SortMode =
  | "relevance"
  | "newest"
  | "price-asc"
  | "price-desc";

type SearchFilters = {
  query: string;
  category: string;
  location: string;
  minPrice: number | null;
  maxPrice: number | null;
  availability: Availability | null;
  verified: boolean;
};

type InlineBudget = {
  query: string;
  minPrice: number | null;
  maxPrice: number | null;
};

type ParsedValue<T> = {
  value: T | null;
  error?: string;
};

const ALLOWED_AVAILABILITY = new Set<Availability>([
  Availability.AVAILABLE,
  Availability.ASK_SELLER,
  Availability.UNAVAILABLE,
]);

const ALLOWED_SORTS = new Set<SortMode>([
  "relevance",
  "newest",
  "price-asc",
  "price-desc",
]);

/*
 * Product search returns product data and the seller information
 * required by the public Shop product cards.
 */
const productSearchSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  originalPrice: true,
  stockQuantity: true,
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
    orderBy: {
      sortOrder: "asc",
    },
    take: PRODUCT_IMAGE_LIMIT,
  },

  business: {
    select: {
      // Required by the Shop page's parseProduct() function.
      id: true,
      name: true,

      verification: true,

      location: {
        select: {
          area: true,
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

type SearchProduct = Prisma.ProductGetPayload<{
  select: typeof productSearchSelect;
}>;

type ParsedPrice = ParsedValue<number>;

function noStoreHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "no-store, max-age=0, must-revalidate",
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return headers;
}

function jsonError(
  message: string,
  status: number,
  baseHeaders?: HeadersInit,
) {
  return NextResponse.json(
    {
      products: [],
      services: [],
      listings: [],
      error: message,
    },
    {
      status,
      headers: noStoreHeaders(baseHeaders),
    },
  );
}

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function parseBoundedInteger(
  rawValue: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): ParsedValue<number> {
  const raw = rawValue?.trim() ?? "";

  if (!raw) {
    return { value: fallback };
  }

  if (!/^\d+$/.test(raw)) {
    return {
      value: null,
      error: `${label} must be a whole number.`,
    };
  }

  const value = Number(raw);

  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    return {
      value: null,
      error: `${label} must be between ${minimum} and ${maximum}.`,
    };
  }

  return { value };
}

function parsePriceParameter(
  value: string | null,
  label: string,
): ParsedPrice {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return { value: null };
  }

  const normalized = raw.replace(/,/g, "");

  if (!/^\d+$/.test(normalized)) {
    return {
      value: null,
      error: `${label} must be a whole-number price.`,
    };
  }

  const parsed = Number(normalized);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_PRICE_VALUE
  ) {
    return {
      value: null,
      error: `${label} is outside the permitted range.`,
    };
  }

  return { value: parsed };
}

function parseMoneyAmount(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/[₦,\s]/g, "")
    .toLowerCase();

  const match = normalized.match(/^(\d+(?:\.\d+)?)(k)?$/);

  if (!match) {
    return null;
  }

  const multiplier = match[2] === "k" ? 1000 : 1;
  const amount = Math.round(Number(match[1]) * multiplier);

  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount > MAX_PRICE_VALUE
  ) {
    return null;
  }

  return amount;
}

function parseInlineBudget(rawQuery: string): InlineBudget {
  let query = rawQuery.trim();

  let minPrice: number | null = null;
  let maxPrice: number | null = null;

  const betweenPattern =
    /\bbetween\s+([\d,]+(?:\.\d+)?\s*k?)\s+and\s+([\d,]+(?:\.\d+)?\s*k?)\b/i;

  const betweenMatch = query.match(betweenPattern);

  if (betweenMatch) {
    const lower = parseMoneyAmount(betweenMatch[1]);
    const upper = parseMoneyAmount(betweenMatch[2]);

    if (lower !== null && upper !== null) {
      minPrice = lower;
      maxPrice = upper;

      query = query
        .replace(betweenMatch[0], " ")
        .replace(/\s+/g, " ")
        .trim();

      return { query, minPrice, maxPrice };
    }
  }

  const maximumPattern =
    /\b(?:under|below|less\s+than|up\s+to|at\s+most|max(?:imum)?)\s+(?:₦\s*)?([\d,]+(?:\.\d+)?\s*k?)\b/i;

  const maximumMatch = query.match(maximumPattern);

  if (maximumMatch) {
    const amount = parseMoneyAmount(maximumMatch[1]);

    if (amount !== null) {
      maxPrice = amount;

      query = query
        .replace(maximumMatch[0], " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  } else {
    const minimumPattern =
      /\b(?:over|above|more\s+than|at\s+least|min(?:imum)?)\s+(?:₦\s*)?([\d,]+(?:\.\d+)?\s*k?)\b/i;

    const minimumMatch = query.match(minimumPattern);

    if (minimumMatch) {
      const amount = parseMoneyAmount(minimumMatch[1]);

      if (amount !== null) {
        minPrice = amount;

        query = query
          .replace(minimumMatch[0], " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  return { query, minPrice, maxPrice };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token: string): string {
  if (token.length < 4) {
    return token;
  }

  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("ing") && token.length > 5) {
    return token.slice(0, -3);
  }

  if (token.endsWith("ed") && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }

  if (
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    token.length > 3
  ) {
    return token.slice(0, -1);
  }

  return token;
}

function getSearchTerms(query: string): string[] {
  const tokens = normalizeText(query)
    .split(" ")
    .filter(Boolean);

  return Array.from(
    new Set(
      tokens.flatMap((token) => [token, stemToken(token)]),
    ),
  );
}

function buildProductPriceConditions(
  filters: SearchFilters,
): Prisma.ProductWhereInput[] {
  const { minPrice, maxPrice } = filters;

  if (minPrice === null && maxPrice === null) {
    return [];
  }

  if (minPrice !== null && maxPrice !== null) {
    return [
      {
        price: {
          gte: minPrice,
          lte: maxPrice,
        },
      },
    ];
  }

  if (minPrice !== null) {
    return [
      {
        price: {
          gte: minPrice,
        },
      },
    ];
  }

  return [
    {
      price: {
        lte: maxPrice!,
      },
    },
  ];
}

function productTextConditions(
  terms: string[],
): Prisma.ProductWhereInput[] {
  return terms.map((term) => ({
    OR: [
      {
        name: {
          contains: term,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: term,
          mode: "insensitive",
        },
      },
      {
        keywords: {
          has: term,
        },
      },
      {
        category: {
          is: {
            isActive: true,
            name: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
      },
    ],
  }));
}

function buildLocationWhere(
  location: string,
): Prisma.LocationWhereInput {
  return {
    OR: [
      {
        area: {
          contains: location,
          mode: "insensitive",
        },
      },
      {
        street: {
          contains: location,
          mode: "insensitive",
        },
      },
      {
        address: {
          contains: location,
          mode: "insensitive",
        },
      },
    ],
  };
}

function buildProductWhere(
  filters: SearchFilters,
  terms: string[],
): Prisma.ProductWhereInput {
  const conditions: Prisma.ProductWhereInput[] = [
    {
      status: "ACTIVE",
      deletedAt: null,
    },
    {
      business: {
        is: {
          status: "ACTIVE",
          deletedAt: null,

          ...(filters.verified
            ? {
                verification: VerificationStatus.VERIFIED,
              }
            : {}),

          ...(filters.location
            ? {
                location: {
                  is: buildLocationWhere(filters.location),
                },
              }
            : {}),
        },
      },
    },
  ];

  if (terms.length > 0) {
    conditions.push(...productTextConditions(terms));
  }

  /*
   * Category filtering:
   * The Shop page currently sends the category name.
   * Match it against the active category name, ignoring case.
   */
  if (filters.category) {
    conditions.push({
      category: {
        is: {
          isActive: true,
          name: {
            equals: filters.category,
            mode: "insensitive",
          },
        },
      },
    });
  }

  if (filters.availability) {
    conditions.push({
      availability: filters.availability,
    });
  }

  conditions.push(...buildProductPriceConditions(filters));

  return {
    AND: conditions,
  };
}

function scoreText(
  query: string,
  values: Array<string | null | undefined>,
): number {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;

  const queryTerms = getSearchTerms(query);

  for (const value of values) {
    if (!value) {
      continue;
    }

    const normalizedValue = normalizeText(value);

    if (normalizedValue === normalizedQuery) {
      score = Math.max(score, 120);
      continue;
    }

    if (normalizedValue.includes(normalizedQuery)) {
      score = Math.max(score, 80);
    }

    for (const term of queryTerms) {
      if (normalizedValue.split(" ").includes(term)) {
        score += 10;
      } else if (normalizedValue.includes(term)) {
        score += 5;
      }
    }
  }

  return score;
}

function scoreProduct(
  query: string,
  product: SearchProduct,
): number {
  return (
    scoreText(query, [product.name]) * 2 +
    scoreText(query, [product.description]) +
    scoreText(query, [
      ...product.keywords,
      product.category?.isActive ? product.category.name : "",
    ])
  );
}

function comparePrice(
  a: SearchProduct,
  b: SearchProduct,
  direction: "asc" | "desc",
): number {
  const aPrice = a.price;
  const bPrice = b.price;

  if (aPrice == null && bPrice == null) {
    return 0;
  }

  if (aPrice == null) {
    return 1;
  }

  if (bPrice == null) {
    return -1;
  }

  return direction === "asc"
    ? Number(aPrice) - Number(bPrice)
    : Number(bPrice) - Number(aPrice);
}

function sortProducts(
  products: SearchProduct[],
  query: string,
  sort: SortMode,
): Array<{ product: SearchProduct; matchScore: number }> {
  const scored = products.map((product) => ({
    product,
    matchScore: scoreProduct(query, product),
  }));

  scored.sort((a, b) => {
    if (sort === "price-asc") {
      return (
        comparePrice(a.product, b.product, "asc") ||
        b.product.updatedAt.getTime() -
          a.product.updatedAt.getTime()
      );
    }

    if (sort === "price-desc") {
      return (
        comparePrice(a.product, b.product, "desc") ||
        b.product.updatedAt.getTime() -
          a.product.updatedAt.getTime()
      );
    }

    if (sort === "newest") {
      return (
        b.product.updatedAt.getTime() -
        a.product.updatedAt.getTime()
      );
    }

    return (
      b.matchScore - a.matchScore ||
      b.product.updatedAt.getTime() -
        a.product.updatedAt.getTime()
    );
  });

  return scored;
}

function formatProduct(
  product: SearchProduct,
  matchScore: number,
) {
  const currentPrice =
    product.price === null ? null : Number(product.price);

  const previousPrice =
    product.originalPrice === null
      ? null
      : Number(product.originalPrice);

  return {
    id: product.id,
    type: "PRODUCT" as const,
    name: product.name,
    description: product.description,

    price: currentPrice,

    originalPrice:
      currentPrice !== null &&
      previousPrice !== null &&
      previousPrice > currentPrice
        ? previousPrice
        : null,

    stockQuantity: product.stockQuantity,
    availability: product.availability,
    imageUrl: product.imageUrl,
    keywords: product.keywords,

    category:
      product.category?.isActive
        ? product.category
        : null,

    images: product.images,

    /*
     * The Shop page's parseProduct() expects seller.id and seller.name.
     * These fields were missing from the old search API response.
     */
    seller: {
      id: product.business.id,
      name: product.business.name,
      verification: product.business.verification,

      verified:
        product.business.verification ===
        VerificationStatus.VERIFIED,

      location: product.business.location
        ? {
            area: product.business.location.area,
          }
        : null,
    },

    matchScore,
  };
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "search");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many searches. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    const rawQuery = clean(searchParams.get("q"));
    const category = clean(searchParams.get("category"));
    const location = clean(searchParams.get("location"));

    const rawType = clean(searchParams.get("type")).toLowerCase();

    if (
      rawType &&
      rawType !== "all" &&
      rawType !== "product" &&
      rawType !== "service"
    ) {
      return jsonError(
        "Search type must be all, product or service.",
        400,
        rateLimit.headers,
      );
    }

    // Services are paused.
    if (rawType === "service") {
      return NextResponse.json(
        {
          products: [],
          services: [],
          listings: [],
          error: "Service search is coming soon.",
          feature: "service-search",
        },
        {
          status: 503,
          headers: noStoreHeaders(rateLimit.headers),
        },
      );
    }

    if (rawQuery.length > MAX_SEARCH_LENGTH) {
      return jsonError(
        `Search text must not exceed ${MAX_SEARCH_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    if (category.length > MAX_CATEGORY_LENGTH) {
      return jsonError(
        `Category must not exceed ${MAX_CATEGORY_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    if (location.length > MAX_LOCATION_LENGTH) {
      return jsonError(
        `Location must not exceed ${MAX_LOCATION_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    const pageInput = parseBoundedInteger(
      searchParams.get("page"),
      1,
      1,
      100_000,
      "Page",
    );

    if (pageInput.error || pageInput.value === null) {
      return jsonError(
        pageInput.error ?? "Page is invalid.",
        400,
        rateLimit.headers,
      );
    }

    const pageSizeInput = parseBoundedInteger(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
      "Page size",
    );

    if (
      pageSizeInput.error ||
      pageSizeInput.value === null
    ) {
      return jsonError(
        pageSizeInput.error ?? "Page size is invalid.",
        400,
        rateLimit.headers,
      );
    }

    const rawSort = clean(searchParams.get("sort")).toLowerCase();

    const sort: SortMode = rawSort
      ? (rawSort as SortMode)
      : "relevance";

    if (rawSort && !ALLOWED_SORTS.has(sort)) {
      return jsonError(
        "Sort must be relevance, newest, price-asc or price-desc.",
        400,
        rateLimit.headers,
      );
    }

    const minimumPriceInput = parsePriceParameter(
      searchParams.get("minPrice"),
      "Minimum price",
    );

    if (minimumPriceInput.error) {
      return jsonError(
        minimumPriceInput.error,
        400,
        rateLimit.headers,
      );
    }

    const maximumPriceInput = parsePriceParameter(
      searchParams.get("maxPrice"),
      "Maximum price",
    );

    if (maximumPriceInput.error) {
      return jsonError(
        maximumPriceInput.error,
        400,
        rateLimit.headers,
      );
    }

    const availabilityRaw = clean(
      searchParams.get("availability"),
    );

    if (
      availabilityRaw &&
      !ALLOWED_AVAILABILITY.has(
        availabilityRaw as Availability,
      )
    ) {
      return jsonError(
        "Availability filter is invalid.",
        400,
        rateLimit.headers,
      );
    }

    const verifiedRaw = clean(
      searchParams.get("verified"),
    );

    if (
      verifiedRaw &&
      verifiedRaw !== "true" &&
      verifiedRaw !== "false"
    ) {
      return jsonError(
        "Verification filter must be true or false.",
        400,
        rateLimit.headers,
      );
    }

    const inlineBudget = parseInlineBudget(rawQuery);

    const filters: SearchFilters = {
      query: inlineBudget.query,
      category,
      location,

      minPrice:
        minimumPriceInput.value ?? inlineBudget.minPrice,

      maxPrice:
        maximumPriceInput.value ?? inlineBudget.maxPrice,

      availability: availabilityRaw
        ? (availabilityRaw as Availability)
        : null,

      verified: verifiedRaw === "true",
    };

    if (
      filters.minPrice !== null &&
      filters.maxPrice !== null &&
      filters.minPrice > filters.maxPrice
    ) {
      return jsonError(
        "Minimum price cannot be greater than maximum price.",
        400,
        rateLimit.headers,
      );
    }

    const terms = getSearchTerms(filters.query);

    const productWhere = buildProductWhere(
      filters,
      terms,
    );

    const [totalProducts, matchedProducts] =
      await Promise.all([
        prisma.product.count({
          where: productWhere,
        }),

        prisma.product.findMany({
          where: productWhere,
          select: productSearchSelect,
          orderBy: {
            updatedAt: "desc",
          },
          take: MAX_SEARCH_RESULTS,
        }),
      ]);

    /*
     * Results are sorted from a bounded candidate set.
     * The API explicitly reports when more than 120 products match.
     */
    const sortedProducts = sortProducts(
      matchedProducts,
      filters.query,
      sort,
    );

    const offset =
      (pageInput.value - 1) * pageSizeInput.value;

    const pageProducts = sortedProducts.slice(
      offset,
      offset + pageSizeInput.value,
    );

    const products = pageProducts.map(
      ({ product, matchScore }) =>
        formatProduct(product, matchScore),
    );

    // Search tracking must never prevent a successful search response.
    try {
      await prisma.searchEvent.create({
        data: {
          query: rawQuery,
          category: category || null,
          resultCount: totalProducts,
          location: location || null,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
        },
      });
    } catch (trackingError) {
      console.error(
        "Search event tracking error:",
        trackingError,
      );
    }

    const cappedTotal = Math.min(
      totalProducts,
      MAX_SEARCH_RESULTS,
    );

    const totalPages = Math.ceil(
      cappedTotal / pageSizeInput.value,
    );

    const hasMore =
      offset + products.length < cappedTotal;

    return NextResponse.json(
      {
        products,
        services: [],
        listings: products,

        resultMeta: {
          type: "product",
          totalProducts,
          totalServices: 0,
          totalResults: totalProducts,
          returnedResults: products.length,
          page: pageInput.value,
          pageSize: pageSizeInput.value,
          totalPages,
          hasMore,
          maxResults: MAX_SEARCH_RESULTS,
          truncated: totalProducts > MAX_SEARCH_RESULTS,
          sort,
        },
      },
      {
        headers: noStoreHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Product search API error:", error);

    return jsonError(
      "Unable to complete search. Please try again.",
      500,
      rateLimit.headers,
    );
  }
}
