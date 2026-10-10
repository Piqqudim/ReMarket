import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Prisma,
  Availability,
  VerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  checkPublicRateLimit,
} from "@/lib/rate-limit";

/**
 * ------------------------------------------------
 * REMARKET SEARCH API
 * ------------------------------------------------
 *
 * General discovery:
 *
 * 1. Search individual products.
 * 2. Attach the actual selling business.
 * 3. Preserve direct business discovery.
 * 4. Apply filters at the correct level.
 * 5. Rank results before pagination.
 * 6. Return total counts and pagination metadata.
 *
 * Buyer Request matching remains separate.
 */

/**
 * ------------------------------------------------
 * CONFIGURATION
 * ------------------------------------------------
 */

const MAX_SEARCH_QUERY_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;
const MAX_LOCATION_LENGTH = 100;

const MAX_PRISMA_INT = 2_147_483_647;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

/**
 * ------------------------------------------------
 * GENERIC SEARCH WORDS
 * ------------------------------------------------
 */

const GENERIC_WORDS = new Set([
  "store",
  "stores",
  "shop",
  "shops",
  "seller",
  "sellers",
  "business",
  "businesses",
  "item",
  "items",
  "product",
  "products",
  "thing",
  "things",
  "buy",
  "buying",
  "find",
  "looking",
  "need",
  "want",
  "please",
  "me",
  "for",
  "a",
  "an",
  "the",
  "and",
  "or",
  "with",
  "of",
  "to",
  "in",
  "at",
  "near",
  "around",
]);

/**
 * ------------------------------------------------
 * DATABASE SELECT
 * ------------------------------------------------
 *
 * Product.category is a Category relation,
 * not a string.
 *
 * Access its text value through category.name.
 */

const searchBusinessSelect = {
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
      address: true,
      lat: true,
      long: true,
      verification: true,
    },
  },

  categories: {
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
      category: true,
      updatedAt: true,

      images: {
        select: {
          id: true,
          url: true,
          publicId: true,
          sortOrder: true,
          createdAt: true,
        },

        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
      },
    },

    orderBy: [
      {
        updatedAt: "desc",
      },
      {
        id: "asc",
      },
    ],
  },

  socialLinks: {
    select: {
      id: true,
      platform: true,
      handle: true,
    },
  },
} satisfies Prisma.BusinessSelect;

type SearchBusiness =
  Prisma.BusinessGetPayload<{
    select: typeof searchBusinessSelect;
  }>;

type SearchProduct =
  SearchBusiness["products"][number];

type ProductMatch = {
  business: SearchBusiness;
  product: SearchProduct;
  score: number;
};

type ScoredBusiness = {
  business: SearchBusiness;
  score: number;
};

type PaginationInput = {
  page: number;
  pageSize: number;
  skip: number;
};

type PaginationParseResult =
  | {
      valid: true;
      pagination: PaginationInput;
    }
  | {
      valid: false;
      error: string;
    };

/**
 * ------------------------------------------------
 * BASIC HELPERS
 * ------------------------------------------------
 */

function clean(
  value: string | null
): string {
  return value?.trim() ?? "";
}

function noStoreHeaders(
  source?: Headers
): Headers {
  const headers = new Headers(source);

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return headers;
}

function badRequest(
  error: string,
  rateLimitHeaders?: Headers
): NextResponse {
  return NextResponse.json(
    {
      businesses: [],
      products: [],
      total: 0,
      totalBusinesses: 0,
      totalProducts: 0,
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
      pagination: {
        businesses: {
          total: 0,
          totalPages: 0,
        },
        products: {
          total: 0,
          totalPages: 0,
        },
      },
      query: "",
      error,
    },
    {
      status: 400,
      headers: noStoreHeaders(
        rateLimitHeaders
      ),
    }
  );
}

/**
 * ------------------------------------------------
 * PAGINATION INPUT
 * ------------------------------------------------
 *
 * Supported parameters:
 *
 * page=1
 * pageSize=12
 *
 * Defaults:
 * page=1
 * pageSize=12
 *
 * Maximum page size: 50
 *
 * Invalid page values return HTTP 400.
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
): PaginationParseResult {
  const parsedPage = parsePositiveInteger(
    searchParams.get("page"),
    DEFAULT_PAGE
  );

  if (parsedPage === null) {
    return {
      valid: false,
      error:
        "'page' must be a positive integer.",
    };
  }

  const parsedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE
  );

  if (parsedPageSize === null) {
    return {
      valid: false,
      error:
        "'pageSize' must be a positive integer.",
    };
  }

  /**
   * Prevent callers from requesting very
   * large response pages.
   */
  const pageSize = Math.min(
    parsedPageSize,
    MAX_PAGE_SIZE
  );

  const skip =
    (parsedPage - 1) * pageSize;

  /**
   * Protect against unsafe calculations and
   * excessively large offsets.
   */
  if (
    !Number.isSafeInteger(skip) ||
    skip > MAX_PRISMA_INT
  ) {
    return {
      valid: false,
      error:
        "Requested page is too large.",
    };
  }

  return {
    valid: true,

    pagination: {
      page: parsedPage,
      pageSize,
      skip,
    },
  };
}

/**
 * ------------------------------------------------
 * PAGINATION METADATA
 * ------------------------------------------------
 */

function getPaginationMetadata(
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
      page > 1,
  };
}

/**
 * ------------------------------------------------
 * PRICE PARAMETER PARSING
 * ------------------------------------------------
 *
 * Accepts:
 *
 * 20000
 * 20,000
 * ₦20,000
 */

function parseOptionalInt(
  value: string | null
): number | null {
  if (!value?.trim()) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/[₦,\s]/g, "");

  if (
    !normalized ||
    !/^\d+$/.test(normalized)
  ) {
    return null;
  }

  const parsed = Number(normalized);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_PRISMA_INT
  ) {
    return null;
  }

  return parsed;
}

/**
 * ------------------------------------------------
 * AVAILABILITY
 * ------------------------------------------------
 */

function parseAvailability(
  value: string
): Availability | null {
  if (
    value === Availability.AVAILABLE ||
    value === Availability.ASK_SELLER ||
    value === Availability.UNAVAILABLE
  ) {
    return value;
  }

  return null;
}

/**
 * ------------------------------------------------
 * BOOLEAN FILTER
 * ------------------------------------------------
 */

function parseBoolean(
  value: string | null
): boolean | null {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

/**
 * ------------------------------------------------
 * TEXT NORMALIZATION
 * ------------------------------------------------
 */

function normalizeText(
  value: string | null | undefined
): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ------------------------------------------------
 * TOKEN NORMALIZATION
 * ------------------------------------------------
 */

function normalizeToken(
  token: string
): string {
  if (
    token.length > 4 &&
    token.endsWith("ies")
  ) {
    return token.slice(0, -3) + "y";
  }

  if (
    /(ches|shes|xes|zes|sses)$/.test(token)
  ) {
    return token.slice(0, -2);
  }

  if (
    token.length > 3 &&
    token.endsWith("s") &&
    !token.endsWith("ss")
  ) {
    return token.slice(0, -1);
  }

  return token;
}

function rawTokens(
  value: string | null | undefined
): string[] {
  const normalized = normalizeText(value);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .filter(
      (token) =>
        token.length > 1 ||
        /^\d+$/.test(token)
    );
}

function tokenSet(
  value: string | null | undefined
): Set<string> {
  return new Set(
    rawTokens(value).map(
      normalizeToken
    )
  );
}

function tokensMatch(
  fieldTokens: Set<string>,
  queryToken: string
): boolean {
  return fieldTokens.has(
    normalizeToken(queryToken)
  );
}

/**
 * ------------------------------------------------
 * PHRASE MATCHING
 * ------------------------------------------------
 */

function containsPhrase(
  text: string | null | undefined,
  phrase: string | null | undefined
): boolean {
  const normalizedText =
    normalizeText(text);

  const normalizedPhrase =
    normalizeText(phrase);

  if (
    !normalizedText ||
    !normalizedPhrase
  ) {
    return false;
  }

  return (
    ` ${normalizedText} `
  ).includes(
    ` ${normalizedPhrase} `
  );
}

/**
 * ------------------------------------------------
 * INLINE BUDGET PARSING
 * ------------------------------------------------
 */

type InlineBudget = {
  amount: number;
  isUpperBound: boolean;
};

function parseBudgetAmount(
  value: string,
  suffix?: string
): number | null {
  const numericValue = Number(
    value.replace(/,/g, "")
  );

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  let multiplier = 1;

  const normalizedSuffix =
    suffix?.toLowerCase();

  if (normalizedSuffix === "k") {
    multiplier = 1_000;
  } else if (
    normalizedSuffix === "m"
  ) {
    multiplier = 1_000_000;
  }

  const amount =
    numericValue * multiplier;

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return null;
  }

  return amount;
}

/**
 * ------------------------------------------------
 * SEARCH INTENT EXTRACTION
 * ------------------------------------------------
 */

type SearchIntent = {
  searchText: string;
  location: string;
  inlineBudget: InlineBudget | null;
};

function extractSearchIntent(
  rawQuery: string,
  explicitLocation: string
): SearchIntent {
  let remaining = rawQuery;

  let inlineBudget: InlineBudget | null =
    null;

  /**
   * Extract a budget before extracting location.
   */
  const budgetMatch = remaining.match(
    /\b(under|below|less\s+than|budget(?:\s+of)?|up\s+to|upto|max(?:imum)?)\s*[₦n]?\s*([\d,]+(?:\.\d+)?)\s*(k|m)?\s*(?:naira)?\b/i
  );

  if (budgetMatch?.[2]) {
    const amount = parseBudgetAmount(
      budgetMatch[2],
      budgetMatch[3]
    );

    if (amount !== null) {
      const qualifier =
        budgetMatch[1]
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

      inlineBudget = {
        amount,

        isUpperBound:
          qualifier === "under" ||
          qualifier === "below" ||
          qualifier === "less than" ||
          qualifier === "up to" ||
          qualifier === "upto" ||
          qualifier === "max" ||
          qualifier === "maximum",
      };
    }

    remaining = remaining.replace(
      budgetMatch[0],
      " "
    );
  }

  /**
   * Extract location text such as "in Ogba".
   */
  const locationMatch = remaining.match(
    /\b(?:near|in|at|around)\s+([a-z][a-z0-9\s-]*?)(?=\s+\b(?:under|below|less\s+than|budget|for|up\s+to|upto|max(?:imum)?)\b|$)/i
  );

  let extractedLocation = "";

  if (locationMatch?.[1]) {
    extractedLocation =
      locationMatch[1].trim();

    remaining = remaining.replace(
      locationMatch[0],
      " "
    );
  }

  const location =
    explicitLocation ||
    extractedLocation;

  return {
    searchText: normalizeText(remaining),
    location: normalizeText(location),
    inlineBudget,
  };
}

/**
 * ------------------------------------------------
 * PRODUCT PRICE RANGE
 * ------------------------------------------------
 */

type PriceRange = {
  min: number | null;
  max: number | null;
};

function getProductPriceRange(
  product: SearchProduct
): PriceRange {
  return {
    min:
      product.priceMin ??
      product.price,

    max:
      product.priceMax ??
      product.price,
  };
}

/**
 * ------------------------------------------------
 * PRODUCT PRICE FILTER
 * ------------------------------------------------
 *
 * A product qualifies when its known price range
 * overlaps the requested range.
 *
 * Products without known prices do not qualify
 * for numeric price filters.
 */

function productMatchesPriceRange(
  product: SearchProduct,
  minPrice: number | null,
  maxPrice: number | null
): boolean {
  if (
    minPrice === null &&
    maxPrice === null
  ) {
    return true;
  }

  const range =
    getProductPriceRange(product);

  if (
    range.min === null &&
    range.max === null
  ) {
    return false;
  }

  if (
    maxPrice !== null &&
    range.min !== null &&
    range.min > maxPrice
  ) {
    return false;
  }

  if (
    minPrice !== null &&
    range.max !== null &&
    range.max < minPrice
  ) {
    return false;
  }

  return true;
}

/**
 * ------------------------------------------------
 * CATEGORY FILTERS
 * ------------------------------------------------
 */

function businessMatchesCategory(
  business: SearchBusiness,
  category: string
): boolean {
  if (!category) {
    return true;
  }

  return business.categories.some(
    (item) =>
      containsPhrase(
        item.category.name,
        category
      )
  );
}

function productMatchesCategory(
  business: SearchBusiness,
  product: SearchProduct,
  category: string
): boolean {
  if (!category) {
    return true;
  }

  /**
   * Product.category is a nullable Category
   * relation, not a string.
   */
  const productCategory = normalizeText(
    product.category?.name
  );

  if (productCategory) {
    return containsPhrase(
      productCategory,
      category
    );
  }

  return businessMatchesCategory(
    business,
    category
  );
}

/**
 * ------------------------------------------------
 * PRODUCT RELEVANCE SCORING
 * ------------------------------------------------
 */

function getMinimumMatchedTokens(
  count: number
): number {
  if (count <= 2) {
    return count;
  }

  return Math.ceil(
    (count * 2) / 3
  );
}

function scoreProduct(
  business: SearchBusiness,
  product: SearchProduct,
  queryTokens: string[],
  queryPhrase: string,
  inlineBudget: InlineBudget | null
): number | null {
  if (queryTokens.length === 0) {
    return 0;
  }

  const productName =
    normalizeText(product.name);

  const nameTokens =
    tokenSet(product.name);

  const descriptionTokens =
    tokenSet(product.description);

  const keywordTokens =
    tokenSet(
      (product.keywords ?? []).join(" ")
    );

  const productCategoryTokens =
    tokenSet(
      product.category?.name
    );

  const businessCategoryTokens =
    tokenSet(
      business.categories
        .map(
          (item) =>
            item.category.name
        )
        .join(" ")
    );

  let score = 0;
  let matchedTokens = 0;

  for (const queryToken of queryTokens) {
    if (
      tokensMatch(
        nameTokens,
        queryToken
      )
    ) {
      score += 45;
      matchedTokens += 1;
      continue;
    }

    if (
      tokensMatch(
        keywordTokens,
        queryToken
      )
    ) {
      score += 32;
      matchedTokens += 1;
      continue;
    }

    if (
      tokensMatch(
        productCategoryTokens,
        queryToken
      )
    ) {
      score += 28;
      matchedTokens += 1;
      continue;
    }

    if (
      tokensMatch(
        businessCategoryTokens,
        queryToken
      )
    ) {
      score += 22;
      matchedTokens += 1;
      continue;
    }

    if (
      tokensMatch(
        descriptionTokens,
        queryToken
      )
    ) {
      score += 15;
      matchedTokens += 1;
    }
  }

  /**
   * Require a meaningful portion of the query
   * to match the current product.
   */
  if (
    matchedTokens <
    getMinimumMatchedTokens(
      queryTokens.length
    )
  ) {
    return null;
  }

  if (
    queryPhrase &&
    productName === queryPhrase
  ) {
    score += 120;
  } else if (
    queryPhrase &&
    containsPhrase(
      productName,
      queryPhrase
    )
  ) {
    score += 85;
  }

  /**
   * "Budget of" is treated as a relevance hint.
   * Upper-bound budgets are actual filters.
   */
  if (
    inlineBudget &&
    !inlineBudget.isUpperBound
  ) {
    const range =
      getProductPriceRange(product);

    if (
      range.min !== null &&
      range.max !== null &&
      range.min <= inlineBudget.amount &&
      range.max >= inlineBudget.amount
    ) {
      score += 20;
    } else if (
      range.min !== null &&
      range.min <= inlineBudget.amount &&
      range.max === null
    ) {
      score += 10;
    }
  }

  return score;
}

/**
 * ------------------------------------------------
 * BUSINESS DISCOVERY SCORING
 * ------------------------------------------------
 */

function scoreBusiness(
  business: SearchBusiness,
  queryTokens: string[],
  queryPhrase: string
): number | null {
  if (queryTokens.length === 0) {
    return null;
  }

  const businessName =
    normalizeText(business.name);

  const nameTokens =
    tokenSet(business.name);

  const descriptionTokens =
    tokenSet(business.description);

  const categoryTokens =
    tokenSet(
      business.categories
        .map(
          (item) =>
            item.category.name
        )
        .join(" ")
    );

  let score = 0;
  let matchedTokens = 0;

  for (const queryToken of queryTokens) {
    if (
      tokensMatch(
        nameTokens,
        queryToken
      )
    ) {
      score += 40;
      matchedTokens += 1;
      continue;
    }

    if (
      tokensMatch(
        categoryTokens,
        queryToken
      )
    ) {
      score += 24;
      matchedTokens += 1;
      continue;
    }

    if (
      tokensMatch(
        descriptionTokens,
        queryToken
      )
    ) {
      score += 12;
      matchedTokens += 1;
    }
  }

  if (
    matchedTokens <
    getMinimumMatchedTokens(
      queryTokens.length
    )
  ) {
    return null;
  }

  if (
    queryPhrase &&
    businessName === queryPhrase
  ) {
    score += 140;
  } else if (
    queryPhrase &&
    containsPhrase(
      businessName,
      queryPhrase
    )
  ) {
    score += 90;
  }

  return score;
}

/**
 * ------------------------------------------------
 * PRODUCT FILTERS
 * ------------------------------------------------
 */

function productPassesFilters(
  business: SearchBusiness,
  product: SearchProduct,
  category: string,
  availability: Availability | null,
  minPrice: number | null,
  maxPrice: number | null
): boolean {
  if (
    availability &&
    product.availability !== availability
  ) {
    return false;
  }

  if (
    !productMatchesCategory(
      business,
      product,
      category
    )
  ) {
    return false;
  }

  if (
    !productMatchesPriceRange(
      product,
      minPrice,
      maxPrice
    )
  ) {
    return false;
  }

  return true;
}

/**
 * ------------------------------------------------
 * BUSINESS FILTERS
 * ------------------------------------------------
 */

function businessPassesFilters(
  business: SearchBusiness,
  category: string,
  availability: Availability | null
): boolean {
  if (
    availability &&
    business.availability !== availability
  ) {
    return false;
  }

  if (
    !businessMatchesCategory(
      business,
      category
    )
  ) {
    return false;
  }

  return true;
}

/**
 * ------------------------------------------------
 * PRODUCT RESPONSE FORMATTING
 * ------------------------------------------------
 */

function formatProduct(
  product: SearchProduct
) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,

    price: product.price,
    priceMin: product.priceMin,
    priceMax: product.priceMax,

    availability: product.availability,

    imageUrl: product.imageUrl,

    keywords: product.keywords,

    category: product.category
      ? {
          id: product.category.id,
          name: product.category.name,
          iconKey: product.category.iconKey,
          isActive: product.category.isActive,
          sortOrder: product.category.sortOrder,
        }
      : null,

    images: product.images.map(
      (image) => ({
        id: image.id,
        url: image.url,
        publicId: image.publicId,
        sortOrder: image.sortOrder,
      })
    ),
  };
}

/**
 * ------------------------------------------------
 * ASSOCIATED BUSINESS FORMATTING
 * ------------------------------------------------
 */

function formatProductBusiness(
  business: SearchBusiness
) {
  const location = business.location;

  return {
    id: business.id,
    name: business.name,
    ownerName: business.ownerName,
    description: business.description,
    imageUrl: business.imageUrl,

    location: location
      ? {
          id: location.id,
          area: location.area,
          address: location.address,
          lat: location.lat,
          long: location.long,
          verification: location.verification,
        }
      : null,

    area:
      location?.area ??
      "Location not added",

    availability: business.availability,
    verification: business.verification,

    verified:
      business.verification ===
      VerificationStatus.VERIFIED,

    category:
      business.categories[0]?.category.name ??
      "Other",

    categories:
      business.categories.map(
        (item) =>
          item.category.name
      ),

    socialLinks:
      business.socialLinks.map(
        (link) => ({
          id: link.id,
          platform: link.platform,
          handle: link.handle,
        })
      ),
  };
}

/**
 * ------------------------------------------------
 * LEGACY BUSINESS RESPONSE FORMATTING
 * ------------------------------------------------
 *
 * Retains the current businesses response.
 * Matching products are ordered first inside
 * each business catalogue.
 */

function formatBusiness(
  business: SearchBusiness,
  matchScore: number,
  productScoreMap: Map<string, number>
) {
  const orderedProducts = [
    ...business.products,
  ].sort((first, second) => {
    const firstScore =
      productScoreMap.get(first.id);

    const secondScore =
      productScoreMap.get(second.id);

    if (
      firstScore !== undefined &&
      secondScore === undefined
    ) {
      return -1;
    }

    if (
      firstScore === undefined &&
      secondScore !== undefined
    ) {
      return 1;
    }

    if (
      firstScore !== undefined &&
      secondScore !== undefined &&
      firstScore !== secondScore
    ) {
      return secondScore - firstScore;
    }

    const dateDifference =
      second.updatedAt.getTime() -
      first.updatedAt.getTime();

    if (dateDifference !== 0) {
      return dateDifference;
    }

    return first.id.localeCompare(
      second.id
    );
  });

  const location = business.location;

  return {
    id: business.id,
    name: business.name,
    ownerName: business.ownerName,
    description: business.description,
    imageUrl: business.imageUrl,

    location: location
      ? {
          id: location.id,
          area: location.area,
          address: location.address,
          lat: location.lat,
          long: location.long,
          verification: location.verification,
        }
      : null,

    area:
      location?.area ??
      "Location not added",

    availability: business.availability,
    verification: business.verification,

    verified:
      business.verification ===
      VerificationStatus.VERIFIED,

    category:
      business.categories[0]?.category.name ??
      "Other",

    categories:
      business.categories.map(
        (item) =>
          item.category.name
      ),

    products:
      orderedProducts.map(
        formatProduct
      ),

    socialLinks:
      business.socialLinks.map(
        (link) => ({
          id: link.id,
          platform: link.platform,
          handle: link.handle,
        })
      ),

    matchScore,
  };
}

/**
 * ------------------------------------------------
 * SEARCH API
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

  const rateLimit =
    checkPublicRateLimit(
      request,
      "search"
    );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        businesses: [],
        products: [],
        total: 0,
        totalBusinesses: 0,
        totalProducts: 0,
        page: DEFAULT_PAGE,
        pageSize: DEFAULT_PAGE_SIZE,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        query: "",
        error:
          "Too many search requests. Please try again shortly.",
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
    const { searchParams } =
      new URL(request.url);

    /**
     * -----------------------------------------
     * PAGINATION PARAMETERS
     * -----------------------------------------
     */

    const paginationResult =
      parsePagination(searchParams);

    if (!paginationResult.valid) {
      return badRequest(
        paginationResult.error,
        rateLimit.headers
      );
    }

    const {
      page,
      pageSize,
      skip,
    } = paginationResult.pagination;

    /**
     * -----------------------------------------
     * READ SEARCH PARAMETERS
     * -----------------------------------------
     */

    const q = clean(
      searchParams.get("q")
    );

    const category = clean(
      searchParams.get("category")
    );

    const requestedLocation = clean(
      searchParams.get("location")
    );

    /**
     * -----------------------------------------
     * INPUT LENGTH VALIDATION
     * -----------------------------------------
     */

    if (
      q.length >
      MAX_SEARCH_QUERY_LENGTH
    ) {
      return badRequest(
        "Search query is too long.",
        rateLimit.headers
      );
    }

    if (
      category.length >
      MAX_CATEGORY_LENGTH
    ) {
      return badRequest(
        "Category is too long.",
        rateLimit.headers
      );
    }

    if (
      requestedLocation.length >
      MAX_LOCATION_LENGTH
    ) {
      return badRequest(
        "Location is too long.",
        rateLimit.headers
      );
    }

    /**
     * -----------------------------------------
     * PRICE PARAMETERS
     * -----------------------------------------
     */

    const rawMinPrice =
      searchParams.get("minPrice");

    const rawMaxPrice =
      searchParams.get("maxPrice");

    const minPrice =
      parseOptionalInt(rawMinPrice);

    const maxPrice =
      parseOptionalInt(rawMaxPrice);

    if (
      rawMinPrice?.trim() &&
      minPrice === null
    ) {
      return badRequest(
        "Minimum price must be a valid non-negative integer.",
        rateLimit.headers
      );
    }

    if (
      rawMaxPrice?.trim() &&
      maxPrice === null
    ) {
      return badRequest(
        "Maximum price must be a valid non-negative integer.",
        rateLimit.headers
      );
    }

    /**
     * -----------------------------------------
     * AVAILABILITY FILTER
     * -----------------------------------------
     */

    const availabilityValue = clean(
      searchParams.get("availability")
    );

    const availability =
      parseAvailability(
        availabilityValue
      );

    if (
      availabilityValue &&
      !availability
    ) {
      return badRequest(
        "Invalid availability value.",
        rateLimit.headers
      );
    }

    /**
     * -----------------------------------------
     * VERIFIED FILTER
     * -----------------------------------------
     */

    const rawVerified =
      searchParams.get("verified");

    const verifiedOnly =
      parseBoolean(rawVerified);

    if (
      rawVerified &&
      verifiedOnly === null
    ) {
      return badRequest(
        "Invalid verified filter.",
        rateLimit.headers
      );
    }

    /**
     * -----------------------------------------
     * EXTRACT SEARCH INTENT
     * -----------------------------------------
     *
     * Example:
     *
     * black leather shoes in Ogba under 50k
     *
     * Product text:
     * black leather shoes
     *
     * Location:
     * ogba
     *
     * Maximum price:
     * 50000
     */

    const searchIntent =
      extractSearchIntent(
        q,
        requestedLocation
      );

    const normalizedCategory =
      normalizeText(category);

    const effectiveLocation =
      searchIntent.location;

    /**
     * -----------------------------------------
     * NORMALIZE PRICE FILTERS
     * -----------------------------------------
     */

    let normalizedMinPrice =
      minPrice;

    let normalizedMaxPrice =
      maxPrice;

    if (
      normalizedMinPrice !== null &&
      normalizedMaxPrice !== null &&
      normalizedMinPrice >
        normalizedMaxPrice
    ) {
      const previousMin =
        normalizedMinPrice;

      normalizedMinPrice =
        normalizedMaxPrice;

      normalizedMaxPrice =
        previousMin;
    }

    /**
     * An inline upper-bound budget narrows
     * the maximum price.
     */

    let effectiveMinPrice =
      normalizedMinPrice;

    let effectiveMaxPrice =
      normalizedMaxPrice;

    if (
      searchIntent.inlineBudget?.isUpperBound
    ) {
      effectiveMaxPrice =
        effectiveMaxPrice === null
          ? searchIntent.inlineBudget.amount
          : Math.min(
              effectiveMaxPrice,
              searchIntent.inlineBudget.amount
            );
    }

    const hasPriceFilter =
      effectiveMinPrice !== null ||
      effectiveMaxPrice !== null;

    /**
     * -----------------------------------------
     * QUERY TOKENS
     * -----------------------------------------
     */

    const allQueryTokens =
      rawTokens(
        searchIntent.searchText
      );

    const productQueryTokens =
      allQueryTokens.filter(
        (token) =>
          !GENERIC_WORDS.has(token)
      );

    const businessQueryTokens =
      productQueryTokens.length > 0
        ? productQueryTokens
        : allQueryTokens;

    const queryPhrase =
      productQueryTokens.join(" ");

    const hasSearchText =
      searchIntent.searchText.length > 0;

    const genericOnlyTextQuery =
      hasSearchText &&
      productQueryTokens.length === 0;

    /**
     * -----------------------------------------
     * DATABASE CANDIDATE FILTER
     * -----------------------------------------
     *
     * All eligible candidates are loaded before
     * ranking. Pagination is applied only after
     * filtering and sorting to prevent better
     * matches from being skipped.
     */

    const businessWhere = {
      status: "ACTIVE",
      deletedAt: null,

      ...(effectiveLocation
        ? {
            location: {
              area: {
                contains:
                  effectiveLocation,
                mode: "insensitive",
              },
            },
          }
        : {}),

      ...(verifiedOnly === true
        ? {
            verification:
              VerificationStatus.VERIFIED,
          }
        : {}),
    } satisfies Prisma.BusinessWhereInput;

    const businesses =
      await prisma.business.findMany({
        where: businessWhere,

        select: searchBusinessSelect,

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
     * MATCH PRODUCTS INDEPENDENTLY
     * -----------------------------------------
     */

    const productMatches: ProductMatch[] = [];

    const productScoreById =
      new Map<string, number>();

    const bestProductScoreByBusiness =
      new Map<string, number>();

    for (const business of businesses) {
      for (const product of business.products) {
        if (
          !productPassesFilters(
            business,
            product,
            normalizedCategory,
            availability,
            effectiveMinPrice,
            effectiveMaxPrice
          )
        ) {
          continue;
        }

        let score: number | null;

        if (genericOnlyTextQuery) {
          score = null;
        } else if (
          productQueryTokens.length > 0
        ) {
          score = scoreProduct(
            business,
            product,
            productQueryTokens,
            queryPhrase,
            searchIntent.inlineBudget
          );
        } else {
          /**
           * Browse mode or a constraint-only query.
           */
          score = 0;
        }

        if (score === null) {
          continue;
        }

        productMatches.push({
          business,
          product,
          score,
        });

        productScoreById.set(
          product.id,
          score
        );

        const previousBest =
          bestProductScoreByBusiness.get(
            business.id
          );

        if (
          previousBest === undefined ||
          score > previousBest
        ) {
          bestProductScoreByBusiness.set(
            business.id,
            score
          );
        }
      }
    }

    /**
     * -----------------------------------------
     * SORT PRODUCTS BEFORE PAGINATION
     * -----------------------------------------
     *
     * 1. Relevance score
     * 2. Business onboarding recency
     * 3. Product update recency
     * 4. Stable product ID
     */

    productMatches.sort(
      (first, second) => {
        if (
          first.score !==
          second.score
        ) {
          return (
            second.score -
            first.score
          );
        }

        const businessDateDifference =
          second.business.onboardedAt.getTime() -
          first.business.onboardedAt.getTime();

        if (
          businessDateDifference !== 0
        ) {
          return businessDateDifference;
        }

        const productDateDifference =
          second.product.updatedAt.getTime() -
          first.product.updatedAt.getTime();

        if (
          productDateDifference !== 0
        ) {
          return productDateDifference;
        }

        return first.product.id.localeCompare(
          second.product.id
        );
      }
    );

    /**
     * -----------------------------------------
     * MATCH BUSINESSES DIRECTLY
     * -----------------------------------------
     */

    const directBusinessScores =
      new Map<string, number>();

    if (
      businessQueryTokens.length > 0
    ) {
      for (const business of businesses) {
        if (
          !businessPassesFilters(
            business,
            normalizedCategory,
            availability
          )
        ) {
          continue;
        }

        if (
          hasPriceFilter &&
          !business.products.some(
            (product) =>
              productMatchesPriceRange(
                product,
                effectiveMinPrice,
                effectiveMaxPrice
              )
          )
        ) {
          continue;
        }

        const score = scoreBusiness(
          business,
          businessQueryTokens,
          queryPhrase
        );

        if (score !== null) {
          directBusinessScores.set(
            business.id,
            score
          );
        }
      }
    }

    /**
     * -----------------------------------------
     * BUILD BUSINESS RESULTS
     * -----------------------------------------
     */

    const scoredBusinesses: ScoredBusiness[] = [];

    for (const business of businesses) {
      /**
       * Browse and constraint-only mode.
       */

      if (!hasSearchText) {
        if (
          !businessPassesFilters(
            business,
            normalizedCategory,
            availability
          )
        ) {
          continue;
        }

        if (
          hasPriceFilter &&
          !business.products.some(
            (product) =>
              productMatchesPriceRange(
                product,
                effectiveMinPrice,
                effectiveMaxPrice
              )
          )
        ) {
          continue;
        }

        scoredBusinesses.push({
          business,

          score:
            bestProductScoreByBusiness.get(
              business.id
            ) ?? 0,
        });

        continue;
      }

      const businessAvailabilityMatches =
        !availability ||
        business.availability === availability;

      const businessPriceMatches =
        !hasPriceFilter ||
        business.products.some(
          (product) =>
            productMatchesPriceRange(
              product,
              effectiveMinPrice,
              effectiveMaxPrice
            )
        );

      const productScore =
        bestProductScoreByBusiness.get(
          business.id
        );

      const directScore =
        directBusinessScores.get(
          business.id
        );

      const possibleScores: number[] = [];

      if (
        productScore !== undefined &&
        businessAvailabilityMatches &&
        businessPriceMatches
      ) {
        possibleScores.push(
          productScore
        );
      }

      if (
        directScore !== undefined &&
        businessAvailabilityMatches &&
        businessPriceMatches
      ) {
        possibleScores.push(
          directScore
        );
      }

      if (possibleScores.length === 0) {
        continue;
      }

      scoredBusinesses.push({
        business,

        score: Math.max(
          ...possibleScores
        ),
      });
    }

    /**
     * -----------------------------------------
     * SORT BUSINESSES BEFORE PAGINATION
     * -----------------------------------------
     */

    scoredBusinesses.sort(
      (first, second) => {
        if (
          first.score !==
          second.score
        ) {
          return (
            second.score -
            first.score
          );
        }

        const dateDifference =
          second.business.onboardedAt.getTime() -
          first.business.onboardedAt.getTime();

        if (dateDifference !== 0) {
          return dateDifference;
        }

        return first.business.id.localeCompare(
          second.business.id
        );
      }
    );

    /**
     * -----------------------------------------
     * TOTAL COUNTS
     * -----------------------------------------
     *
     * Counts represent all matching results,
     * not only the requested page.
     */

    const totalBusinesses =
      scoredBusinesses.length;

    const totalProducts =
      productMatches.length;

    const businessPagination =
      getPaginationMetadata(
        totalBusinesses,
        page,
        pageSize
      );

    const productPagination =
      getPaginationMetadata(
        totalProducts,
        page,
        pageSize
      );

    /**
     * Use the larger page count for a unified
     * result page containing both collections.
     *
     * The response also contains independent
     * pagination metadata for each collection.
     */

    const totalPages = Math.max(
      businessPagination.totalPages,
      productPagination.totalPages
    );

    const hasNextPage =
      page < totalPages;

    const hasPreviousPage =
      page > 1;

    /**
     * -----------------------------------------
     * SLICE REQUESTED PAGE
     * -----------------------------------------
     *
     * Crucially, slicing happens AFTER matching,
     * filtering and sorting.
     */

    const paginatedProductMatches =
      productMatches.slice(
        skip,
        skip + pageSize
      );

    const paginatedScoredBusinesses =
      scoredBusinesses.slice(
        skip,
        skip + pageSize
      );

    /**
     * -----------------------------------------
     * FORMAT PRODUCT PAGE
     * -----------------------------------------
     *
     * Each product retains its actual seller.
     */

    const formattedProducts =
      paginatedProductMatches.map(
        ({
          business,
          product,
          score,
        }) => ({
          ...formatProduct(product),

          matchScore: score,

          business:
            formatProductBusiness(
              business
            ),
        })
      );

    /**
     * -----------------------------------------
     * FORMAT BUSINESS PAGE
     * -----------------------------------------
     *
     * Preserve the existing businesses field.
     */

    const formattedBusinesses =
      paginatedScoredBusinesses.map(
        ({
          business,
          score,
        }) =>
          formatBusiness(
            business,
            score,
            productScoreById
          )
      );

    /**
     * -----------------------------------------
     * SEARCH ANALYTICS
     * -----------------------------------------
     *
     * Record the total number of matching
     * businesses, not the page size.
     */

    try {
      await prisma.searchEvent.create({
        data: {
          query: q || "*",

          category:
            category || null,

          location:
            effectiveLocation || null,

          minPrice:
            effectiveMinPrice,

          maxPrice:
            effectiveMaxPrice,

          resultCount:
            totalBusinesses,
        },
      });
    } catch (eventError) {
      console.error(
        "Search event error:",
        eventError
      );
    }

    /**
     * -----------------------------------------
     * RESPONSE
     * -----------------------------------------
     *
     * businesses:
     *   Business results for this page.
     *
     * products:
     *   Product results for this page.
     *
     * total:
     *   Preserved as the total business count.
     *
     * totalBusinesses:
     *   Total businesses across all pages.
     *
     * totalProducts:
     *   Total products across all pages.
     */

    return NextResponse.json(
      {
        businesses:
          formattedBusinesses,

        products:
          formattedProducts,

        total:
          totalBusinesses,

        totalBusinesses,

        totalProducts,

        page,

        pageSize,

        totalPages,

        hasNextPage,

        hasPreviousPage,

        pagination: {
          page,
          pageSize,
          totalPages,
          hasNextPage,
          hasPreviousPage,

          businesses:
            businessPagination,

          products:
            productPagination,
        },

        query: q,

        filters: {
          category:
            category || null,

          location:
            effectiveLocation || null,

          minPrice:
            effectiveMinPrice,

          maxPrice:
            effectiveMaxPrice,

          availability:
            availability || null,

          verified:
            verifiedOnly === true,
        },
      },
      {
        headers: noStoreHeaders(
          rateLimit.headers
        ),
      }
    );
  } catch (error) {
    console.error(
      "Search API error:",
      error
    );

    return NextResponse.json(
      {
        businesses: [],
        products: [],
        total: 0,
        totalBusinesses: 0,
        totalProducts: 0,
        page: DEFAULT_PAGE,
        pageSize: DEFAULT_PAGE_SIZE,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        query: "",

        error:
          "Unable to complete your search right now.",
      },
      {
        status: 500,

        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}