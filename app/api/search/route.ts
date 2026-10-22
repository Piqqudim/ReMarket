import {
  Availability,
  Prisma,
  VerificationStatus,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import {
  checkPublicRateLimit,
} from "@/lib/rate-limit";

/**
 * ------------------------------------------------
 * REMARKET SEARCH API
 * ------------------------------------------------
 *
 * Provides:
 * - Product-first discovery.
 * - Business discovery.
 * - Search relevance scoring.
 * - Category and location filters.
 * - Price and availability filters.
 * - Business verification filtering.
 * - Search-event tracking.
 *
 * Public-response privacy:
 * Exact latitude and longitude are not returned
 * by this endpoint.
 *
 * Pagination:
 * The current search page paginates the combined
 * result arrays client-side. This endpoint returns
 * those arrays rather than applying a second,
 * potentially conflicting pagination layer.
 */

const MAX_SEARCH_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;
const MAX_LOCATION_LENGTH = 100;
const MAX_PRICE_VALUE = 1_000_000_000;
const PRODUCT_PREVIEW_LIMIT = 4;
const PRODUCT_IMAGE_LIMIT = 5;

const ALLOWED_AVAILABILITY =
  new Set<Availability>([
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

function clean(
  value: string | null
): string {
  return value?.trim() ?? "";
}

function noStoreHeaders(
  baseHeaders?: HeadersInit
): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "no-store, max-age=0, must-revalidate"
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return headers;
}

function jsonError(
  message: string,
  status: number,
  headers?: HeadersInit
) {
  return NextResponse.json(
    {
      businesses: [],
      products: [],
      error: message,
    },
    {
      status,
      headers: noStoreHeaders(headers),
    }
  );
}

/**
 * Accept whole-number naira values, optionally
 * entered with comma separators.
 */
function parsePriceParameter(
  value: string | null,
  label: string
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

/**
 * Parse simple inline budget expressions such as:
 *
 * - shoes under 50000
 * - phone below ₦50,000
 * - laptop over 100000
 * - fabric between 5000 and 20000
 *
 * Explicit minPrice/maxPrice URL parameters take
 * precedence over values extracted from the query.
 */
function parseMoneyAmount(
  input: string
): number | null {
  const normalized = input
    .trim()
    .replace(/[₦,\s]/g, "")
    .toLowerCase();

  const match = normalized.match(
    /^(\d+(?:\.\d+)?)(k)?$/
  );

  if (!match) {
    return null;
  }

  const multiplier = match[2] === "k"
    ? 1000
    : 1;

  const amount = Math.round(
    Number(match[1]) * multiplier
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
  rawQuery: string
): InlineBudget {
  let query = rawQuery.trim();
  let minPrice: number | null = null;
  let maxPrice: number | null = null;

  const betweenPattern =
    /\bbetween\s+([\d,]+(?:\.\d+)?\s*k?)\s+and\s+([\d,]+(?:\.\d+)?\s*k?)\b/i;

  const betweenMatch =
    query.match(betweenPattern);

  if (betweenMatch) {
    const lower = parseMoneyAmount(
      betweenMatch[1]
    );

    const upper = parseMoneyAmount(
      betweenMatch[2]
    );

    if (
      lower !== null &&
      upper !== null
    ) {
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

  const maximumMatch =
    query.match(maximumPattern);

  if (maximumMatch) {
    const amount = parseMoneyAmount(
      maximumMatch[1]
    );

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

    const minimumMatch =
      query.match(minimumPattern);

    if (minimumMatch) {
      const amount = parseMoneyAmount(
        minimumMatch[1]
      );

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

function normalizeText(
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

/**
 * Lightweight normalization for common word
 * endings. Original tokens are retained as well.
 */
function stemToken(
  token: string
): string {
  if (token.length < 4) {
    return token;
  }

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

function getSearchTerms(
  query: string
): string[] {
  const tokens = normalizeText(query)
    .split(" ")
    .filter((token) => token.length > 0);

  return Array.from(
    new Set(
      tokens.flatMap((token) => [
        token,
        stemToken(token),
      ])
    )
  );
}

/**
 * Database text conditions for a product or
 * business. Each token can match any searchable
 * field, preserving flexible discovery.
 */
function productTextConditions(
  terms: string[]
): Prisma.ProductWhereInput[] {
  const conditions:
    Prisma.ProductWhereInput[] = [];

  for (const term of terms) {
    conditions.push(
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
      }
    );
  }

  return conditions;
}

function businessTextConditions(
  terms: string[]
): Prisma.BusinessWhereInput[] {
  const conditions:
    Prisma.BusinessWhereInput[] = [];

  for (const term of terms) {
    conditions.push(
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
      {
        products: {
          some: {
            status: "ACTIVE",
            deletedAt: null,
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
            ],
          },
        },
      }
    );
  }

  return conditions;
}

/**
 * A product is eligible when its price range
 * overlaps the requested range.
 *
 * Unpriced products do not match explicit
 * numeric price filters.
 */
function buildProductPriceConditions(
  filters: SearchFilters
): Prisma.ProductWhereInput[] {
  const conditions:
    Prisma.ProductWhereInput[] = [];

  if (filters.minPrice !== null) {
    conditions.push({
      OR: [
        {
          price: {
            gte: filters.minPrice,
          },
        },
        {
          priceMin: {
            gte: filters.minPrice,
          },
        },
        {
          priceMax: {
            gte: filters.minPrice,
          },
        },
      ],
    });
  }

  if (filters.maxPrice !== null) {
    conditions.push({
      OR: [
        {
          price: {
            lte: filters.maxPrice,
          },
        },
        {
          priceMin: {
            lte: filters.maxPrice,
          },
        },
        {
          priceMax: {
            lte: filters.maxPrice,
          },
        },
      ],
    });
  }

  return conditions;
}

function buildBusinessPriceConditions(
  filters: SearchFilters
): Prisma.BusinessWhereInput[] {
  const conditions:
    Prisma.BusinessWhereInput[] = [];

  if (filters.minPrice !== null) {
    conditions.push({
      OR: [
        {
          priceMin: {
            gte: filters.minPrice,
          },
        },
        {
          priceMax: {
            gte: filters.minPrice,
          },
        },
      ],
    });
  }

  if (filters.maxPrice !== null) {
    conditions.push({
      OR: [
        {
          priceMin: {
            lte: filters.maxPrice,
          },
        },
        {
          priceMax: {
            lte: filters.maxPrice,
          },
        },
      ],
    });
  }

  return conditions;
}

function buildLocationWhere(
  location: string
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

function buildProductCategoryConditions(
  category: string
): Prisma.ProductWhereInput[] {
  return [
    {
      category: {
        is: {
          isActive: true,
          name: {
            equals: category,
            mode: "insensitive",
          },
        },
      },
    },
    {
      business: {
        is: {
          categories: {
            some: {
              category: {
                isActive: true,
                name: {
                  equals: category,
                  mode: "insensitive",
                },
              },
            },
          },
        },
      },
    },
  ];
}

function buildProductWhere(
  filters: SearchFilters,
  terms: string[]
): Prisma.ProductWhereInput {
  const conditions:
    Prisma.ProductWhereInput[] = [
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
                      filters.location
                    ),
                  },
                }
              : {}),
          },
        },
      },
    ];

  if (terms.length > 0) {
    conditions.push({
      OR: [
        ...productTextConditions(terms),

        /*
         * Searching for a business name should
         * also reveal its products.
         */
        ...terms.flatMap((term) => [
          {
            business: {
              is: {
                name: {
                  contains: term,
                  mode: "insensitive" as const,
                },
              },
            },
          },
          {
            business: {
              is: {
                description: {
                  contains: term,
                  mode: "insensitive" as const,
                },
              },
            },
          },
        ]),
      ],
    });
  }

  if (filters.category) {
    conditions.push({
      OR: buildProductCategoryConditions(
        filters.category
      ),
    });
  }

  if (filters.availability) {
    conditions.push({
      availability: filters.availability,
    });
  }

  conditions.push(
    ...buildProductPriceConditions(filters)
  );

  return {
    AND: conditions,
  };
}

function buildBusinessWhere(
  filters: SearchFilters,
  terms: string[]
): Prisma.BusinessWhereInput {
  const conditions:
    Prisma.BusinessWhereInput[] = [
      {
        status: "ACTIVE",
        deletedAt: null,
      },
    ];

  if (filters.verified) {
    conditions.push({
      verification:
        VerificationStatus.VERIFIED,
    });
  }

  if (terms.length > 0) {
    conditions.push({
      OR: businessTextConditions(terms),
    });
  }

  if (filters.location) {
    conditions.push({
      location: {
        is: buildLocationWhere(
          filters.location
        ),
      },
    });
  }

  if (filters.category) {
    conditions.push({
      OR: [
        {
          categories: {
            some: {
              category: {
                isActive: true,
                name: {
                  equals: filters.category,
                  mode: "insensitive",
                },
              },
            },
          },
        },
        {
          products: {
            some: {
              status: "ACTIVE",
              deletedAt: null,
              category: {
                is: {
                  isActive: true,
                  name: {
                    equals: filters.category,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        },
      ],
    });
  }

  if (filters.availability) {
    conditions.push({
      OR: [
        {
          availability:
            filters.availability,
        },
        {
          products: {
            some: {
              status: "ACTIVE",
              deletedAt: null,
              availability:
                filters.availability,
            },
          },
        },
      ],
    });
  }

  const businessPriceConditions =
    buildBusinessPriceConditions(filters);

  const productPriceConditions =
    buildProductPriceConditions(filters);

  if (
    businessPriceConditions.length > 0
  ) {
    conditions.push({
      OR: [
        {
          AND: businessPriceConditions,
        },
        {
          products: {
            some: {
              AND: [
                {
                  status: "ACTIVE",
                  deletedAt: null,
                },
                ...productPriceConditions,
              ],
            },
          },
        },
      ],
    });
  }

  return {
    AND: conditions,
  };
}

/**
 * Client-side relevance scoring is retained after
 * database filtering so the most relevant results
 * appear first.
 */
function scoreText(
  query: string,
  values: Array<string | null | undefined>
): number {
  const normalizedQuery =
    normalizeText(query);

  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;

  for (const value of values) {
    if (!value) {
      continue;
    }

    const normalizedValue =
      normalizeText(value);

    if (
      normalizedValue === normalizedQuery
    ) {
      score = Math.max(score, 120);
      continue;
    }

    if (
      normalizedValue.includes(
        normalizedQuery
      )
    ) {
      score = Math.max(score, 80);
    }

    for (
      const term of getSearchTerms(query)
    ) {
      if (
        normalizedValue
          .split(" ")
          .includes(term)
      ) {
        score += 10;
      } else if (
        normalizedValue.includes(term)
      ) {
        score += 5;
      }
    }
  }

  return score;
}

function toPublicLocation(
  location: {
    id: string;
    area: string;
    street: string | null;
    address: string | null;
    verification: string;
  } | null
) {
  if (!location) {
    return null;
  }

  /*
   * Deliberately omit lat and long.
   */
  return {
    id: location.id,
    area: location.area,
    street: location.street,
    address: location.address,
    verification: location.verification,
  };
}

function toPublicCategories(
  categories: Array<{
    category: {
      id: string;
      name: string;
    };
  }>
) {
  return categories.map(
    (item) => item.category.name
  );
}

function scoreProduct(
  query: string,
  product: {
    name: string;
    description: string | null;
    keywords: string[];
    category: {
      name: string;
    } | null;
    business: {
      name: string;
      description: string | null;
      categories: Array<{
        category: {
          name: string;
        };
      }>;
    };
  }
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
      product.category?.name ?? "",
      ...product.business.categories.map(
        (item) => item.category.name
      ),
    ])
  );
}

export async function GET(
  request: NextRequest
) {
  const rateLimit =
    checkPublicRateLimit(
      request,
      "search"
    );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many searches. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  try {
    const searchParams =
      request.nextUrl.searchParams;

    const rawQuery =
      clean(searchParams.get("q"));

    const category =
      clean(searchParams.get("category"));

    const location =
      clean(searchParams.get("location"));

    if (
      rawQuery.length >
      MAX_SEARCH_LENGTH
    ) {
      return jsonError(
        `Search text must not exceed ${MAX_SEARCH_LENGTH} characters.`,
        400,
        rateLimit.headers
      );
    }

    if (
      category.length >
      MAX_CATEGORY_LENGTH
    ) {
      return jsonError(
        `Category must not exceed ${MAX_CATEGORY_LENGTH} characters.`,
        400,
        rateLimit.headers
      );
    }

    if (
      location.length >
      MAX_LOCATION_LENGTH
    ) {
      return jsonError(
        `Location must not exceed ${MAX_LOCATION_LENGTH} characters.`,
        400,
        rateLimit.headers
      );
    }

    const minimumPriceInput =
      parsePriceParameter(
        searchParams.get("minPrice"),
        "Minimum price"
      );

    if (minimumPriceInput.error) {
      return jsonError(
        minimumPriceInput.error,
        400,
        rateLimit.headers
      );
    }

    const maximumPriceInput =
      parsePriceParameter(
        searchParams.get("maxPrice"),
        "Maximum price"
      );

    if (maximumPriceInput.error) {
      return jsonError(
        maximumPriceInput.error,
        400,
        rateLimit.headers
      );
    }

    const availabilityRaw =
      clean(
        searchParams.get("availability")
      );

    if (
      availabilityRaw &&
      !ALLOWED_AVAILABILITY.has(
        availabilityRaw as Availability
      )
    ) {
      return jsonError(
        "Availability filter is invalid.",
        400,
        rateLimit.headers
      );
    }

    const verifiedRaw =
      clean(searchParams.get("verified"));

    if (
      verifiedRaw &&
      verifiedRaw !== "true" &&
      verifiedRaw !== "false"
    ) {
      return jsonError(
        "Verification filter must be true or false.",
        400,
        rateLimit.headers
      );
    }

    const inlineBudget =
      parseInlineBudget(rawQuery);

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

      availability:
        availabilityRaw
          ? availabilityRaw as Availability
          : null,

      verified:
        verifiedRaw === "true",
    };

    if (
      filters.minPrice !== null &&
      filters.maxPrice !== null &&
      filters.minPrice > filters.maxPrice
    ) {
      return jsonError(
        "Minimum price cannot be greater than maximum price.",
        400,
        rateLimit.headers
      );
    }

    const terms =
      getSearchTerms(filters.query);

    const productWhere =
      buildProductWhere(
        filters,
        terms
      );

    const businessWhere =
      buildBusinessWhere(
        filters,
        terms
      );

    /*
     * --------------------------------------------
     * 1. Find matching products
     * --------------------------------------------
     *
     * Product previews include only products
     * matching the active category, price,
     * availability, location and verification
     * filters.
     *
     * Public location selection excludes exact
     * latitude and longitude.
     */

    const matchedProducts =
      await prisma.product.findMany({
        where: productWhere,

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
              id: true,
              name: true,
              ownerName: true,
              description: true,
              imageUrl: true,
              availability: true,
              verification: true,

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
            },
          },
        },

        orderBy: {
          updatedAt: "desc",
        },
      });

    const sortedProducts =
      matchedProducts
        .map((product) => ({
          product,
          matchScore: scoreProduct(
            filters.query,
            product
          ),
        }))
        .sort((first, second) => {
          if (
            second.matchScore !==
            first.matchScore
          ) {
            return (
              second.matchScore -
              first.matchScore
            );
          }

          return (
            second.product.updatedAt.getTime() -
            first.product.updatedAt.getTime()
          );
        });

    const formattedProducts =
      sortedProducts.map(
        ({
          product,
          matchScore,
        }) => {
          const {
            updatedAt: _updatedAt,
            ...publicProduct
          } = product;

          const categoryNames =
            toPublicCategories(
              product.business.categories
            );

          return {
            ...publicProduct,

            /*
             * Keep the location information useful
             * for discovery without exposing coordinates.
             */
            business: {
              ...product.business,

              location: toPublicLocation(
                product.business.location
              ),

              categories: categoryNames,

              category:
                categoryNames[0] ??
                "Services",

              verified:
                product.business.verification ===
                VerificationStatus.VERIFIED,
            },

            matchScore,
          };
        }
      );

    /*
     * --------------------------------------------
     * 2. Find matching businesses
     * --------------------------------------------
     *
     * Business result products are restricted by
     * the same productWhere filters used above.
     * This prevents unrelated active products from
     * appearing beneath filtered business results.
     */

    const matchedBusinesses =
      await prisma.business.findMany({
        where: businessWhere,

        select: {
          id: true,
          name: true,
          ownerName: true,
          description: true,
          imageUrl: true,
          availability: true,
          verification: true,
          onboardedAt: true,

          priceMin: true,
          priceMax: true,

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

          products: {
            where: productWhere,

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

                take: 1,
              },
            },

            orderBy: {
              updatedAt: "desc",
            },

            take: PRODUCT_PREVIEW_LIMIT,
          },

          /*
           * This count intentionally represents
           * the business's full active catalogue,
           * not only the returned filtered previews.
           */
          _count: {
            select: {
              products: {
                where: {
                  status: "ACTIVE",
                  deletedAt: null,
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
        },

        orderBy: [
          {
            onboardedAt: "desc",
          },
          {
            id: "desc",
          },
        ],
      });

    const sortedBusinesses =
      matchedBusinesses
        .map((business) => {
          const categoryNames =
            toPublicCategories(
              business.categories
            );

          const previewProductNames =
            business.products.map(
              (product) => product.name
            );

          const matchScore =
            scoreText(
              filters.query,
              [business.name]
            ) * 2 +
            scoreText(
              filters.query,
              [
                business.description,
                ...categoryNames,
                ...previewProductNames,
              ]
            );

          return {
            business,
            categoryNames,
            matchScore,
          };
        })
        .sort((first, second) => {
          if (
            second.matchScore !==
            first.matchScore
          ) {
            return (
              second.matchScore -
              first.matchScore
            );
          }

          return (
            second.business.onboardedAt.getTime() -
            first.business.onboardedAt.getTime()
          );
        });

    const formattedBusinesses =
      sortedBusinesses.map(
        ({
          business,
          categoryNames,
          matchScore,
        }) => ({
          id: business.id,

          name: business.name,

          ownerName:
            business.ownerName,

          description:
            business.description,

          imageUrl:
            business.imageUrl,

          location: toPublicLocation(
            business.location
          ),

          availability:
            business.availability,

          verification:
            business.verification,

          verified:
            business.verification ===
            VerificationStatus.VERIFIED,

          categories:
            categoryNames,

          category:
            categoryNames[0] ??
            "Services",

          products:
            business.products.map(
              (product) => {
                const {
                  updatedAt: _updatedAt,
                  ...publicProduct
                } = product;

                return publicProduct;
              }
            ),

          productCount:
            business._count.products,

          socialLinks:
            business.socialLinks,

          matchScore,
        })
      );

    /*
     * --------------------------------------------
     * 3. Track the search
     * --------------------------------------------
     *
     * Event tracking failure must not make an
     * otherwise successful buyer search fail.
     */

    try {
      await prisma.searchEvent.create({
        data: {
          query: rawQuery,
          category: category || null,
          resultCount:
            formattedProducts.length +
            formattedBusinesses.length,
          location: location || null,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
        },
      });
    } catch (trackingError) {
      console.error(
        "Search event tracking error:",
        trackingError
      );
    }

    return NextResponse.json(
      {
        businesses:
          formattedBusinesses,

        products:
          formattedProducts,
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

    return jsonError(
      "Unable to complete search. Please try again.",
      500,
      rateLimit.headers
    );
  }
}