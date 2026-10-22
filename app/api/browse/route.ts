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
 * - Product-name and description search.
 * - Product keyword search.
 * - Active category filtering.
 * - Pagination.
 * - Product previews.
 *
 * Public API contract remains:
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

function clean(
  value: string | null
): string {
  return value?.trim() ?? "";
}

function parsePositiveInteger(
  value: string | null,
  fallback: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return parsed;
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

export async function GET(
  request: NextRequest
) {
  /*
   * Use the existing configured public search
   * rate-limit bucket. This shares its request
   * budget with /api/search.
   */
  const rateLimit =
    checkPublicRateLimit(
      request,
      "search"
    );

  if (!rateLimit.allowed) {
    return emptyResponse(
      "Too many browse requests. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  try {
    const searchParams =
      request.nextUrl.searchParams;

    const q = clean(
      searchParams.get("q")
    );

    const category = clean(
      searchParams.get("category")
    );

    /*
     * --------------------------------------------
     * 1. Validate input
     * --------------------------------------------
     */

    if (
      q.length > MAX_SEARCH_LENGTH
    ) {
      return emptyResponse(
        `Search text must not exceed ${MAX_SEARCH_LENGTH} characters.`,
        400,
        rateLimit.headers
      );
    }

    if (
      category.length >
      MAX_CATEGORY_LENGTH
    ) {
      return emptyResponse(
        `Category must not exceed ${MAX_CATEGORY_LENGTH} characters.`,
        400,
        rateLimit.headers
      );
    }

    const requestedPage =
      parsePositiveInteger(
        searchParams.get("page"),
        1
      );

    const requestedPageSize =
      parsePositiveInteger(
        searchParams.get("pageSize"),
        DEFAULT_PAGE_SIZE
      );

    const pageSize = Math.min(
      requestedPageSize,
      MAX_PAGE_SIZE
    );

    /*
     * --------------------------------------------
     * 2. Define the business search
     * --------------------------------------------
     *
     * A business must be active and not soft-deleted.
     *
     * Category matches must use active categories.
     *
     * Product matches must use active,
     * non-deleted products.
     */

    const matchingProductConditions:
      Prisma.ProductWhereInput = {
        status: "ACTIVE",
        deletedAt: null,

        ...(q
          ? {
              OR: [
                {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  description: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  keywords: {
                    has: q.toLowerCase(),
                  },
                },
              ],
            }
          : {}),
      };

    const where:
      Prisma.BusinessWhereInput = {
        status: "ACTIVE",
        deletedAt: null,

        ...(category
          ? {
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
            }
          : {}),

        ...(q
          ? {
              OR: [
                {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  description: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  products: {
                    some:
                      matchingProductConditions,
                  },
                },
              ],
            }
          : {}),
      };

    /*
     * --------------------------------------------
     * 3. Count matching businesses
     * --------------------------------------------
     */

    const total =
      await prisma.business.count({
        where,
      });

    const totalPages = Math.max(
      1,
      Math.ceil(total / pageSize)
    );

    const page = Math.min(
      requestedPage,
      totalPages
    );

    /*
     * --------------------------------------------
     * 4. Fetch the requested page
     * --------------------------------------------
     */

    const businesses =
      await prisma.business.findMany({
        where,

        skip:
          (page - 1) * pageSize,

        take: pageSize,

        select: {
          id: true,
          name: true,
          ownerName: true,
          description: true,
          imageUrl: true,
          availability: true,
          verification: true,

          /*
           * Keep the existing public location
           * contract: ID and area only.
           * Exact coordinates are not selected.
           */
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

          /*
           * When searching by text, return only
           * product previews that match that text.
           *
           * With no text query, show the latest
           * active products as before.
           */
          products: {
            where:
              matchingProductConditions,

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

            take: 4,
          },

          /*
           * This is the complete active product
           * count, not just the returned previews.
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

          /*
           * Keep these existing public fields
           * for compatibility with callers.
           */
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

    /*
     * --------------------------------------------
     * 5. Preserve the existing response structure
     * --------------------------------------------
     */

    const formattedBusinesses =
      businesses.map(
        (business) => ({
          id: business.id,

          name: business.name,

          ownerName:
            business.ownerName,

          description:
            business.description,

          imageUrl:
            business.imageUrl,

          availability:
            business.availability,

          verification:
            business.verification,

          location:
            business.location,

          categories:
            business.categories,

          products:
            business.products,

          productCount:
            business._count.products,

          socialLinks:
            business.socialLinks,
        })
      );

    return NextResponse.json(
      {
        businesses:
          formattedBusinesses,

        total,

        page,

        pageSize,

        totalPages,
      },
      {
        headers: noStoreHeaders(
          rateLimit.headers
        ),
      }
    );
  } catch (error) {
    console.error(
      "Browse API error:",
      error
    );

    return emptyResponse(
      "Unable to load businesses.",
      500,
      rateLimit.headers
    );
  }
}