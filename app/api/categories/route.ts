import {
  BusinessStatus,
  Prisma,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

type ListingType = "all" | "product" | "service";

const CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

const NO_STORE =
  "no-store, max-age=0, must-revalidate";

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function responseHeaders(
  baseHeaders?: HeadersInit,
  cacheControl = NO_STORE,
): Headers {
  const headers = new Headers(baseHeaders);

  headers.set("Cache-Control", cacheControl);

  if (cacheControl === NO_STORE) {
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  }

  return headers;
}

function jsonError(
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json(
    {
      categories: [],
      error: message,
    },
    {
      status,
      headers: responseHeaders(headers),
    },
  );
}

/*
 * A product/service can be assigned directly to a category.
 * Some existing listings have no direct category, however,
 * and inherit category discovery from their seller's category
 * assignments. These conditions mirror the fallback used by
 * the public search API.
 */
function buildInheritedProductCategoryWhere(
  categoryName: string,
): Prisma.ProductWhereInput {
  return {
    status: BusinessStatus.ACTIVE,
    deletedAt: null,
    category: {
      is: null,
    },
    business: {
      is: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
        categories: {
          some: {
            category: {
              isActive: true,
              name: {
                equals: categoryName,
                mode: "insensitive",
              },
            },
          },
        },
      },
    },
  };
}

function buildInheritedServiceCategoryWhere(
  categoryName: string,
): Prisma.ServiceWhereInput {
  return {
    status: BusinessStatus.ACTIVE,
    deletedAt: null,
    category: {
      is: null,
    },
    business: {
      is: {
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
        categories: {
          some: {
            category: {
              isActive: true,
              name: {
                equals: categoryName,
                mode: "insensitive",
              },
            },
          },
        },
      },
    },
  };
}

function parseListingType(
  value: string,
): ListingType | null {
  if (!value || value === "all") {
    return "all";
  }

  if (
    value === "product" ||
    value === "service"
  ) {
    return value;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(
    request,
    "categories",
  );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const requestedType = clean(
      request.nextUrl.searchParams.get("type"),
    ).toLowerCase();

    const listingType = parseListingType(
      requestedType,
    );

    if (!listingType) {
      return jsonError(
        "Category type must be all, product or service.",
        400,
        rateLimit.headers,
      );
    }

    /*
     * By default, public category requests continue
     * returning only categories with active listings.
     *
     * Seller listing forms can request all active
     * categories by passing includeEmpty=true.
     */
    const includeEmpty =
      clean(
        request.nextUrl.searchParams.get(
          "includeEmpty",
        ),
      ).toLowerCase() === "true";

    /*
     * Always restrict the result to active categories.
     * includeEmpty does not expose inactive categories.
     */
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
      },

      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          name: "asc",
        },
      ],

      select: {
        id: true,
        name: true,
        iconKey: true,
        isActive: true,
        sortOrder: true,

        _count: {
          select: {
            products: {
              where: {
                status: BusinessStatus.ACTIVE,
                deletedAt: null,

                business: {
                  is: {
                    status: BusinessStatus.ACTIVE,
                    deletedAt: null,
                  },
                },
              },
            },

            services: {
              where: {
                status: BusinessStatus.ACTIVE,
                deletedAt: null,

                business: {
                  is: {
                    status: BusinessStatus.ACTIVE,
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
      },
    });

    /*
     * Count uncategorised listings whose seller has
     * this active category.
     *
     * Direct category counts above and inherited counts
     * do not overlap because inherited queries explicitly
     * require category IS NULL.
     *
     * When type=product or type=service, only the relevant
     * inherited count is queried.
     */
    const inheritedCounts = await Promise.all(
      categories.map(async (category) => {
        const [products, services] =
          await Promise.all([
            listingType !== "service"
              ? prisma.product.count({
                  where:
                    buildInheritedProductCategoryWhere(
                      category.name,
                    ),
                })
              : Promise.resolve(0),

            listingType !== "product"
              ? prisma.service.count({
                  where:
                    buildInheritedServiceCategoryWhere(
                      category.name,
                    ),
                })
              : Promise.resolve(0),
          ]);

        return {
          id: category.id,
          products,
          services,
        };
      }),
    );

    const inheritedCountById = new Map(
      inheritedCounts.map((item) => [
        item.id,
        item,
      ]),
    );

    const formattedCategories = categories
      .map((category) => {
        const inherited =
          inheritedCountById.get(category.id);

        const productCount =
          category._count.products +
          (inherited?.products ?? 0);

        const serviceCount =
          category._count.services +
          (inherited?.services ?? 0);

        return {
          id: category.id,
          name: category.name,
          iconKey: category.iconKey,
          isActive: category.isActive,
          sortOrder: category.sortOrder,

          _count: {
            products: productCount,
            services: serviceCount,
            totalListings:
              productCount + serviceCount,
          },
        };
      })
      .filter((category) => {
        /*
         * Seller forms can use every active category,
         * including categories with zero listings.
         */
        if (includeEmpty) {
          return true;
        }

        /*
         * Existing public filtering remains unchanged.
         */
        if (listingType === "product") {
          return category._count.products > 0;
        }

        if (listingType === "service") {
          return category._count.services > 0;
        }

        return category._count.totalListings > 0;
      });

    return NextResponse.json(
      {
        type: listingType,
        categories: formattedCategories,
        total: formattedCategories.length,
      },
      {
        headers: responseHeaders(
          rateLimit.headers,
          includeEmpty
            ? NO_STORE
            : CACHE_CONTROL,
        ),
      },
    );
  } catch (error) {
    console.error(
      "Categories API error:",
      error,
    );

    return jsonError(
      "Unable to load categories.",
      500,
      rateLimit.headers,
    );
  }
}