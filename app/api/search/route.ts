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
const MAX_SEARCH_RESULTS_PER_TYPE = 120;
const PRODUCT_IMAGE_LIMIT = 1;
const SERVICE_IMAGE_LIMIT = 1;

type SearchType = "all" | "product" | "service";

const ALLOWED_AVAILABILITY = new Set<Availability>([
  Availability.AVAILABLE,
  Availability.ASK_SELLER,
  Availability.UNAVAILABLE,
]);

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

type ParsedPrice = {
  value: number | null;
  error?: string;
};

/*
 * =========================================
 * PUBLIC BUSINESS DATA
 * =========================================
 */

const publicSellerSelect = {
  id: true,
  name: true,
  ownerName: true,
  description: true,
  imageUrl: true,
  availability: true,
  verification: true,
  showContactInfo: true,

  location: {
    select: {
      id: true,
      area: true,
      street: true,
      address: true,
      verification: true,
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

  socialLinks: {
    select: {
      id: true,
      platform: true,
      handle: true,
    },
  },
} satisfies Prisma.BusinessSelect;

/*
 * =========================================
 * PRODUCT SEARCH SELECTION
 * =========================================
 */

const productSearchSelect = {
  id: true,
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
    orderBy: {
      sortOrder: "asc",
    },
    take: PRODUCT_IMAGE_LIMIT,
  },

  business: {
    select: publicSellerSelect,
  },
} satisfies Prisma.ProductSelect;

/*
 * =========================================
 * SERVICE SEARCH SELECTION
 * =========================================
 */

const serviceSearchSelect = {
  id: true,
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
    orderBy: {
      sortOrder: "asc",
    },
    take: SERVICE_IMAGE_LIMIT,
  },

  business: {
    select: publicSellerSelect,
  },
} satisfies Prisma.ServiceSelect;

type SearchProduct = Prisma.ProductGetPayload<{
  select: typeof productSearchSelect;
}>;

type SearchService = Prisma.ServiceGetPayload<{
  select: typeof serviceSearchSelect;
}>;

type SearchSeller = Prisma.BusinessGetPayload<{
  select: typeof publicSellerSelect;
}>;

/*
 * =========================================
 * GENERAL HELPERS
 * =========================================
 */

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function noStoreHeaders(
  baseHeaders?: HeadersInit,
): Headers {
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
  headers?: HeadersInit,
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
      headers: noStoreHeaders(headers),
    },
  );
}

/*
 * =========================================
 * PRICE PARSING
 * =========================================
 */

function parsePriceParameter(
  value: string | null,
  label: string,
): ParsedPrice {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return {
      value: null,
    };
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

  return {
    value: parsed,
  };
}

function parseMoneyAmount(
  input: string,
): number | null {
  const normalized = input
    .trim()
    .replace(/[₦,\s]/g, "")
    .toLowerCase();

  const match = normalized.match(
    /^(\d+(?:\.\d+)?)(k)?$/,
  );

  if (!match) return null;

  const multiplier = match[2] === "k" ? 1000 : 1;

  const amount = Math.round(
    Number(match[1]) * multiplier,
  );

  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount > MAX_PRICE_VALUE
  ) {
    return null;
  }

  return amount;
}

function parseInlineBudget(
  rawQuery: string,
): InlineBudget {
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

      return {
        query,
        minPrice,
        maxPrice,
      };
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

  return {
    query,
    minPrice,
    maxPrice,
  };
}

/*
 * =========================================
 * SEARCH TEXT NORMALIZATION
 * =========================================
 */

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
  if (token.length < 4) return token;

  if (
    token.endsWith("ies") &&
    token.length > 4
  ) {
    return `${token.slice(0, -3)}y`;
  }

  if (
    token.endsWith("ing") &&
    token.length > 5
  ) {
    return token.slice(0, -3);
  }

  if (
    token.endsWith("ed") &&
    token.length > 4
  ) {
    return token.slice(0, -2);
  }

  if (
    token.endsWith("es") &&
    token.length > 4
  ) {
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
      tokens.flatMap((token) => [
        token,
        stemToken(token),
      ]),
    ),
  );
}

/*
 * =========================================
 * PRODUCT PRICE CONDITIONS
 * =========================================
 */

function buildProductPriceConditions(
  filters: SearchFilters,
): Prisma.ProductWhereInput[] {
  const { minPrice, maxPrice } = filters;

  if (
    minPrice === null &&
    maxPrice === null
  ) {
    return [];
  }

  if (
    minPrice !== null &&
    maxPrice !== null
  ) {
    return [
      {
        OR: [
          {
            price: {
              gte: minPrice,
              lte: maxPrice,
            },
          },
          {
            AND: [
              {
                priceMin: {
                  lte: maxPrice,
                },
              },
              {
                OR: [
                  {
                    priceMax: {
                      gte: minPrice,
                    },
                  },
                  {
                    priceMax: null,
                  },
                ],
              },
            ],
          },
          {
            AND: [
              {
                priceMin: null,
              },
              {
                priceMax: {
                  gte: minPrice,
                  lte: maxPrice,
                },
              },
            ],
          },
        ],
      },
    ];
  }

  if (minPrice !== null) {
    return [
      {
        OR: [
          {
            price: {
              gte: minPrice,
            },
          },
          {
            priceMax: {
              gte: minPrice,
            },
          },
          {
            AND: [
              {
                priceMax: null,
              },
              {
                priceMin: {
                  gte: minPrice,
                },
              },
            ],
          },
        ],
      },
    ];
  }

  return [
    {
      OR: [
        {
          price: {
            lte: maxPrice!,
          },
        },
        {
          priceMin: {
            lte: maxPrice!,
          },
        },
        {
          AND: [
            {
              priceMin: null,
            },
            {
              priceMax: {
                lte: maxPrice!,
              },
            },
          ],
        },
      ],
    },
  ];
}

/*
 * =========================================
 * SERVICE PRICE CONDITIONS
 * =========================================
 */

function buildServicePriceConditions(
  filters: SearchFilters,
): Prisma.ServiceWhereInput[] {
  const { minPrice, maxPrice } = filters;

  if (
    minPrice === null &&
    maxPrice === null
  ) {
    return [];
  }

  if (
    minPrice !== null &&
    maxPrice !== null
  ) {
    return [
      {
        OR: [
          {
            price: {
              gte: minPrice,
              lte: maxPrice,
            },
          },
          {
            AND: [
              {
                priceMin: {
                  lte: maxPrice,
                },
              },
              {
                OR: [
                  {
                    priceMax: {
                      gte: minPrice,
                    },
                  },
                  {
                    priceMax: null,
                  },
                ],
              },
            ],
          },
          {
            AND: [
              {
                priceMin: null,
              },
              {
                priceMax: {
                  gte: minPrice,
                  lte: maxPrice,
                },
              },
            ],
          },
        ],
      },
    ];
  }

  if (minPrice !== null) {
    return [
      {
        OR: [
          {
            price: {
              gte: minPrice,
            },
          },
          {
            priceMax: {
              gte: minPrice,
            },
          },
          {
            AND: [
              {
                priceMax: null,
              },
              {
                priceMin: {
                  gte: minPrice,
                },
              },
            ],
          },
        ],
      },
    ];
  }

  return [
    {
      OR: [
        {
          price: {
            lte: maxPrice!,
          },
        },
        {
          priceMin: {
            lte: maxPrice!,
          },
        },
        {
          AND: [
            {
              priceMin: null,
            },
            {
              priceMax: {
                lte: maxPrice!,
              },
            },
          ],
        },
      ],
    },
  ];
}

/*
 * =========================================
 * TEXT SEARCH CONDITIONS
 * =========================================
 */

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
      {
        business: {
          is: {
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
                categories: {
                  some: {
                    category: {
                      isActive: true,
                      name: {
                        contains: term,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  }));
}

function serviceTextConditions(
  terms: string[],
): Prisma.ServiceWhereInput[] {
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
      {
        business: {
          is: {
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
                categories: {
                  some: {
                    category: {
                      isActive: true,
                      name: {
                        contains: term,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  }));
}

/*
 * =========================================
 * LOCATION CONDITIONS
 * =========================================
 */

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

/*
 * =========================================
 * CATEGORY CONDITIONS
 * =========================================
 */

function buildProductCategoryConditions(
  category: string,
): Prisma.ProductWhereInput[] {
  const activeCategory = {
    isActive: true,
    name: {
      equals: category,
      mode: "insensitive" as const,
    },
  };

  return [
    {
      category: {
        is: activeCategory,
      },
    },
    {
      AND: [
        {
          category: {
            is: null,
          },
        },
        {
          business: {
            is: {
              categories: {
                some: {
                  category: activeCategory,
                },
              },
            },
          },
        },
      ],
    },
  ];
}

function buildServiceCategoryConditions(
  category: string,
): Prisma.ServiceWhereInput[] {
  const activeCategory = {
    isActive: true,
    name: {
      equals: category,
      mode: "insensitive" as const,
    },
  };

  return [
    {
      category: {
        is: activeCategory,
      },
    },
    {
      AND: [
        {
          category: {
            is: null,
          },
        },
        {
          business: {
            is: {
              categories: {
                some: {
                  category: activeCategory,
                },
              },
            },
          },
        },
      ],
    },
  ];
}

/*
 * =========================================
 * PRODUCT WHERE CLAUSE
 * =========================================
 */

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
                verification:
                  VerificationStatus.VERIFIED,
              }
            : {}),

          ...(filters.location
            ? {
                location: {
                  is: buildLocationWhere(
                    filters.location,
                  ),
                },
              }
            : {}),
        },
      },
    },
  ];

  if (terms.length > 0) {
    conditions.push(
      ...productTextConditions(terms),
    );
  }

  if (filters.category) {
    conditions.push({
      OR: buildProductCategoryConditions(
        filters.category,
      ),
    });
  }

  if (filters.availability) {
    conditions.push({
      availability: filters.availability,
    });
  }

  conditions.push(
    ...buildProductPriceConditions(filters),
  );

  return {
    AND: conditions,
  };
}

/*
 * =========================================
 * SERVICE WHERE CLAUSE
 * =========================================
 */

function buildServiceWhere(
  filters: SearchFilters,
  terms: string[],
): Prisma.ServiceWhereInput {
  const conditions: Prisma.ServiceWhereInput[] = [
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
                verification:
                  VerificationStatus.VERIFIED,
              }
            : {}),

          ...(filters.location
            ? {
                location: {
                  is: buildLocationWhere(
                    filters.location,
                  ),
                },
              }
            : {}),
        },
      },
    },
  ];

  if (terms.length > 0) {
    conditions.push(
      ...serviceTextConditions(terms),
    );
  }

  if (filters.category) {
    conditions.push({
      OR: buildServiceCategoryConditions(
        filters.category,
      ),
    });
  }

  if (filters.availability) {
    conditions.push({
      availability: filters.availability,
    });
  }

  conditions.push(
    ...buildServicePriceConditions(filters),
  );

  return {
    AND: conditions,
  };
}

/*
 * =========================================
 * SEARCH SCORING
 * =========================================
 */

function scoreText(
  query: string,
  values: Array<string | null | undefined>,
): number {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) return 0;

  let score = 0;

  for (const value of values) {
    if (!value) continue;

    const normalizedValue = normalizeText(value);

    if (normalizedValue === normalizedQuery) {
      score = Math.max(score, 120);
      continue;
    }

    if (normalizedValue.includes(normalizedQuery)) {
      score = Math.max(score, 80);
    }

    for (const term of getSearchTerms(query)) {
      if (
        normalizedValue.split(" ").includes(term)
      ) {
        score += 10;
      } else if (normalizedValue.includes(term)) {
        score += 5;
      }
    }
  }

  return score;
}

/*
 * =========================================
 * PUBLIC SELLER RESPONSE
 * =========================================
 */

function formatSeller(business: SearchSeller) {
  const categoryNames = business.categories.map(
    (item) => item.category.name,
  );

  return {
    id: business.id,
    name: business.name,
    ownerName: business.ownerName,
    description: business.description,
    imageUrl: business.imageUrl,
    availability: business.availability,
    verification: business.verification,

    verified:
      business.verification ===
      VerificationStatus.VERIFIED,

    showContactInfo:
      business.showContactInfo === true,

    location: business.location
      ? {
          id: business.location.id,
          area: business.location.area,
          street: business.location.street,
          address: business.location.address,
          verification:
            business.location.verification,
        }
      : null,

    categories: categoryNames,

    category:
      categoryNames[0] ?? "Uncategorised",

    // Private contact details are never sent
    // when the business has hidden its contact information.
    socialLinks:
      business.showContactInfo === true
        ? business.socialLinks
        : [],
  };
}

/*
 * =========================================
 * PRODUCT MATCH SCORE
 * =========================================
 */

function scoreProduct(
  query: string,
  product: SearchProduct,
): number {
  return (
    scoreText(query, [
      product.name,
      product.business.name,
    ]) * 2 +
    scoreText(query, [
      product.description,
      product.business.description,
    ]) +
    scoreText(query, [
      ...product.keywords,
      product.category?.isActive
        ? product.category.name
        : "",
      ...product.business.categories.map(
        (item) => item.category.name,
      ),
    ])
  );
}

/*
 * =========================================
 * SERVICE MATCH SCORE
 * =========================================
 */

function scoreService(
  query: string,
  service: SearchService,
): number {
  return (
    scoreText(query, [
      service.name,
      service.business.name,
    ]) * 2 +
    scoreText(query, [
      service.description,
      service.business.description,
    ]) +
    scoreText(query, [
      ...service.keywords,
      service.category?.isActive
        ? service.category.name
        : "",
      ...service.business.categories.map(
        (item) => item.category.name,
      ),
    ])
  );
}

/*
 * =========================================
 * SEARCH API
 * =========================================
 */

export async function GET(
  request: NextRequest,
) {
  const rateLimit = checkPublicRateLimit(
    request,
    "search",
  );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many searches. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const searchParams =
      request.nextUrl.searchParams;

    const rawQuery = clean(
      searchParams.get("q"),
    );

    const category = clean(
      searchParams.get("category"),
    );

    const location = clean(
      searchParams.get("location"),
    );

    /*
     * =====================================
     * SEARCH TYPE VALIDATION
     * =====================================
     *
     * No type or type=all:
     * Search products and services.
     *
     * type=product:
     * Search products only.
     *
     * type=service:
     * Search services only.
     */

    const rawType = clean(
      searchParams.get("type"),
    ).toLowerCase();

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

    const searchType: SearchType =
      rawType === "product" ||
      rawType === "service"
        ? rawType
        : "all";

    /*
     * =====================================
     * INPUT VALIDATION
     * =====================================
     */

    if (
      rawQuery.length > MAX_SEARCH_LENGTH
    ) {
      return jsonError(
        `Search text must not exceed ${MAX_SEARCH_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    if (
      category.length > MAX_CATEGORY_LENGTH
    ) {
      return jsonError(
        `Category must not exceed ${MAX_CATEGORY_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    if (
      location.length > MAX_LOCATION_LENGTH
    ) {
      return jsonError(
        `Location must not exceed ${MAX_LOCATION_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    /*
     * =====================================
     * PRICE VALIDATION
     * =====================================
     */

    const minimumPriceInput =
      parsePriceParameter(
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

    const maximumPriceInput =
      parsePriceParameter(
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

    /*
     * =====================================
     * AVAILABILITY VALIDATION
     * =====================================
     */

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

    /*
     * =====================================
     * VERIFICATION VALIDATION
     * =====================================
     */

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

    /*
     * =====================================
     * BUILD SEARCH FILTERS
     * =====================================
     */

    const inlineBudget = parseInlineBudget(
      rawQuery,
    );

    const filters: SearchFilters = {
      query: inlineBudget.query,
      category,
      location,

      minPrice:
        minimumPriceInput.value ??
        inlineBudget.minPrice,

      maxPrice:
        maximumPriceInput.value ??
        inlineBudget.maxPrice,

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

    /*
     * =====================================
     * BUILD DATABASE CONDITIONS
     * =====================================
     */

    const terms = getSearchTerms(
      filters.query,
    );

    const productWhere = buildProductWhere(
      filters,
      terms,
    );

    const serviceWhere = buildServiceWhere(
      filters,
      terms,
    );

    /*
     * =====================================
     * SEARCH ONLY REQUESTED LISTING TYPES
     * =====================================
     */

    const shouldSearchProducts =
      searchType !== "service";

    const shouldSearchServices =
      searchType !== "product";

    /*
     * Do not execute product queries for a
     * service-only search.
     *
     * Do not execute service queries for a
     * product-only search.
     */

    const productCountPromise =
      shouldSearchProducts
        ? prisma.product.count({
            where: productWhere,
          })
        : Promise.resolve(0);

    const productRowsPromise =
      shouldSearchProducts
        ? prisma.product.findMany({
            where: productWhere,
            select: productSearchSelect,
            orderBy: {
              updatedAt: "desc",
            },
            take: MAX_SEARCH_RESULTS_PER_TYPE,
          })
        : Promise.resolve(
            [] as SearchProduct[],
          );

    const serviceCountPromise =
      shouldSearchServices
        ? prisma.service.count({
            where: serviceWhere,
          })
        : Promise.resolve(0);

    const serviceRowsPromise =
      shouldSearchServices
        ? prisma.service.findMany({
            where: serviceWhere,
            select: serviceSearchSelect,
            orderBy: {
              updatedAt: "desc",
            },
            take: MAX_SEARCH_RESULTS_PER_TYPE,
          })
        : Promise.resolve(
            [] as SearchService[],
          );

    const [
      totalProducts,
      matchedProducts,
      totalServices,
      matchedServices,
    ] = await Promise.all([
      productCountPromise,
      productRowsPromise,
      serviceCountPromise,
      serviceRowsPromise,
    ]);

    /*
     * =====================================
     * FORMAT PRODUCT RESULTS
     * =====================================
     */

    const products = matchedProducts
      .map((product) => ({
        product,
        matchScore: scoreProduct(
          filters.query,
          product,
        ),
      }))
      .sort(
        (a, b) =>
          b.matchScore - a.matchScore ||
          b.product.updatedAt.getTime() -
            a.product.updatedAt.getTime(),
      )
      .map(({ product, matchScore }) => ({
        id: product.id,
        type: "PRODUCT" as const,
        name: product.name,
        description: product.description,
        price: product.price,
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        availability: product.availability,
        imageUrl: product.imageUrl,
        keywords: product.keywords,

        category:
          product.category?.isActive
            ? product.category
            : null,

        images: product.images,

        // Keep this field name consistent with
        // the existing API response.
        seller: formatSeller(
          product.business,
        ),

        matchScore,
      }));

    /*
     * =====================================
     * FORMAT SERVICE RESULTS
     * =====================================
     */

    const services = matchedServices
      .map((service) => ({
        service,
        matchScore: scoreService(
          filters.query,
          service,
        ),
      }))
      .sort(
        (a, b) =>
          b.matchScore - a.matchScore ||
          b.service.updatedAt.getTime() -
            a.service.updatedAt.getTime(),
      )
      .map(({ service, matchScore }) => ({
        id: service.id,
        type: "SERVICE" as const,
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

        category:
          service.category?.isActive
            ? service.category
            : null,

        images: service.images,

        seller: formatSeller(
          service.business,
        ),

        matchScore,
      }));

    /*
     * =====================================
     * COMBINED LISTINGS
     * =====================================
     */

    const listings = [
      ...products,
      ...services,
    ].sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        a.name.localeCompare(b.name),
    );

    /*
     * =====================================
     * SEARCH EVENT TRACKING
     * =====================================
     *
     * Tracking failures must not break search.
     */

    try {
      await prisma.searchEvent.create({
        data: {
          query: rawQuery,
          category: category || null,
          resultCount:
            totalProducts + totalServices,
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

    /*
     * =====================================
     * SUCCESS RESPONSE
     * =====================================
     */

    return NextResponse.json(
      {
        products,
        services,
        listings,

        resultMeta: {
          type: searchType,

          totalProducts,
          totalServices,

          totalResults:
            totalProducts + totalServices,

          maxResultsPerType:
            MAX_SEARCH_RESULTS_PER_TYPE,

          truncated:
            totalProducts >
              MAX_SEARCH_RESULTS_PER_TYPE ||
            totalServices >
              MAX_SEARCH_RESULTS_PER_TYPE,
        },
      },
      {
        headers: noStoreHeaders(
          rateLimit.headers,
        ),
      },
    );
  } catch (error) {
    console.error(
      "Search API error:",
      error,
    );

    return jsonError(
      "Unable to complete search. Please try again.",
      500,
      rateLimit.headers,
    );
  }
}