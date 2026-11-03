import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  checkPublicRateLimit,
} from "@/lib/rate-limit";

/**
 * ------------------------------------------------
 * REMARKET BROWSE API
 * ------------------------------------------------
 *
 * Used by the Shop page.
 *
 * Supports:
 * - Business-name and description search.
 * - Product-name, description and keyword search.
 * - Multi-word matching (each search term must match).
 * - Active business and product categories.
 * - Server-side business pagination.
 * - Relevant active product previews.
 * - Public business data without exact coordinates.
 *
 * Public API contract:
 * {
 *   businesses,
 *   total,
 *   page,
 *   pageSize,
 *   totalPages
 * }
 */

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;
const MAX_SEARCH_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function parsePositiveInteger(
  value: string | null,
  fallback: number
): number {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function getQueryTerms(query: string): string[] {
  const normalized = query
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return Array.from(
    new Set(normalized.split(/\s+/).filter(Boolean))
  );
}

function noStoreHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "no-store, max-age=0, must-revalidate"
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return headers;
}

function emptyResponse(
  message: string,
  status: number,
  headers?: HeadersInit
) {
  return NextResponse.json(
    {
      businesses: [],
      total: 0,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalPages: 1,
      error: message,
    },
    {
      status,
      headers: noStoreHeaders(headers),
    }
  );
}

function buildActiveCategoryCondition(
  category: string
): Prisma.CategoryWhereInput {
  return {
    isActive: true,
    name: {
      equals: category,
      mode: "insensitive",
    },
  };
}

function buildProductCategoryFilter(
  category: string
): Prisma.ProductWhereInput {
  const activeCategory = buildActiveCategoryCondition(category);

  return {
    OR: [
      {
        category: {
          is: activeCategory,
        },
      },
      {
        AND: [
          {
            category: { is: null },
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
    ],
  };
}

export async function GET(request: NextRequest) {
  /*
   * Browse and Search intentionally share the existing
   * public search rate-limit budget.
   */
  const rateLimit = checkPublicRateLimit(request, "search");

  if (!rateLimit.allowed) {
    return emptyResponse(
      "Too many browse requests. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const q = clean(searchParams.get("q"));
    const category = clean(searchParams.get("category"));

    if (q.length > MAX_SEARCH_LENGTH) {
      return emptyResponse(
        `Search text must not exceed ${MAX_SEARCH_LENGTH} characters.`,
        400,
        rateLimit.headers
      );
    }

    if (category.length > MAX_CATEGORY_LENGTH) {
      return emptyResponse(
        `Category must not exceed ${MAX_CATEGORY_LENGTH} characters.`,
        400,
        rateLimit.headers
      );
    }

    const terms = getQueryTerms(q);
    if (q && terms.length === 0) {
      return emptyResponse(
        "Enter a search term containing letters or numbers.",
        400,
        rateLimit.headers
      );
    }

    const requestedPage = parsePositiveInteger(
      searchParams.get("page"),
      1
    );

    const requestedPageSize = parsePositiveInteger(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE
    );

    const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

    /*
     * Each term must match a product field. This avoids
     * broad partial matches where only one word in a
     * multi-word query happens to occur in a listing.
     */
    const productTextConditions: Prisma.ProductWhereInput[] =
      terms.map((term) => ({
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
                ],
              },
            },
          },
        ],
      }));

    const matchingProductConditions: Prisma.ProductWhereInput = {
      AND: [
        {
          status: "ACTIVE",
          deletedAt: null,
        },
        ...productTextConditions,
        ...(category
          ? [buildProductCategoryFilter(category)]
          : []),
      ],
    };

    const businessConditions: Prisma.BusinessWhereInput[] = [
      {
        status: "ACTIVE",
        deletedAt: null,
      },
    ];

    if (category) {
      const activeCategory = buildActiveCategoryCondition(category);

      businessConditions.push({
        OR: [
          {
            categories: {
              some: {
                category: activeCategory,
              },
            },
          },
          {
            products: {
              some: {
                status: "ACTIVE",
                deletedAt: null,
                category: {
                  is: activeCategory,
                },
              },
            },
          },
        ],
      });
    }

    if (terms.length > 0) {
      const businessProfileMatchesAllTerms: Prisma.BusinessWhereInput = {
        AND: terms.map((term) => ({
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
          ],
        })),
      };

      businessConditions.push({
        OR: [
          businessProfileMatchesAllTerms,
          {
            products: {
              some: matchingProductConditions,
            },
          },
        ],
      });
    }

    const where: Prisma.BusinessWhereInput = {
      AND: businessConditions,
    };

    const total = await prisma.business.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);

    const businesses = await prisma.business.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        ownerName: true,
        description: true,
        imageUrl: true,
        availability: true,
        verification: true,

        // Public area only. Exact coordinates stay private.
        location: {
          select: {
            id: true,
            area: true,
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
          where: matchingProductConditions,
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
            category: {
              select: {
                id: true,
                name: true,
              },
            },
            images: {
              select: {
                id: true,
                url: true,
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
          take: 4,
        },

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

    const formattedBusinesses = businesses.map((business) => ({
      id: business.id,
      name: business.name,
      ownerName: business.ownerName,
      description: business.description,
      imageUrl: business.imageUrl,
      availability: business.availability,
      verification: business.verification,
      location: business.location,
      categories: business.categories,
      products: business.products,
      productCount: business._count.products,
      socialLinks: business.socialLinks,
    }));

    return NextResponse.json(
      {
        businesses: formattedBusinesses,
        total,
        page,
        pageSize,
        totalPages,
      },
      {
        headers: noStoreHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error("Browse API error:", error);

    return emptyResponse(
      "Unable to load businesses.",
      500,
      rateLimit.headers
    );
  }
}
