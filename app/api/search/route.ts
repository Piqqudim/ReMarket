import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

import {
  findMatches,
  parseQuery,
} from "@/lib/matching";

import {
  Availability,
  VerificationStatus,
} from "@prisma/client";

import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_SEARCH_QUERY_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;
const MAX_LOCATION_LENGTH = 100;

const MAX_PRISMA_INT = 2_147_483_647;

function clean(
  value: string | null
): string {
  return value?.trim() ?? "";
}

function parseOptionalInt(
  value: string | null
): number | null {
  if (!value?.trim()) {
    return null;
  }

  const numberValue = Number(
    value.trim()
  );

  if (
    !Number.isSafeInteger(
      numberValue
    ) ||
    numberValue < 0 ||
    numberValue > MAX_PRISMA_INT
  ) {
    return null;
  }

  return numberValue;
}

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

function badRequest(
  error: string
): NextResponse {
  return NextResponse.json(
    {
      businesses: [],
      total: 0,
      query: "",
      error,
    },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET(
  request: NextRequest
) {
  /*
   * ------------------------------------------------
   * PUBLIC RATE LIMIT
   * ------------------------------------------------
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
        total: 0,
        query: "",
        error:
          "Too many search requests. Please try again shortly.",
      },
      {
        status: 429,
        headers:
          rateLimit.headers,
      }
    );
  }

  try {
    const { searchParams } =
      new URL(request.url);

    /*
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

    const location = clean(
      searchParams.get("location")
    );

    /*
     * -----------------------------------------
     * INPUT LIMITS
     * -----------------------------------------
     */

    if (
      q.length >
      MAX_SEARCH_QUERY_LENGTH
    ) {
      return badRequest(
        "Search query is too long."
      );
    }

    if (
      category.length >
      MAX_CATEGORY_LENGTH
    ) {
      return badRequest(
        "Category is too long."
      );
    }

    if (
      location.length >
      MAX_LOCATION_LENGTH
    ) {
      return badRequest(
        "Location is too long."
      );
    }

    /*
     * -----------------------------------------
     * PRICE FILTERS
     * -----------------------------------------
     */

    const rawMinPrice =
      searchParams.get("minPrice");

    const rawMaxPrice =
      searchParams.get("maxPrice");

    const minPrice =
      parseOptionalInt(
        rawMinPrice
      );

    const maxPrice =
      parseOptionalInt(
        rawMaxPrice
      );

    if (
      rawMinPrice?.trim() &&
      minPrice === null
    ) {
      return badRequest(
        "Minimum price must be a valid non-negative integer."
      );
    }

    if (
      rawMaxPrice?.trim() &&
      maxPrice === null
    ) {
      return badRequest(
        "Maximum price must be a valid non-negative integer."
      );
    }

    const availabilityValue =
      clean(
        searchParams.get(
          "availability"
        )
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
        "Invalid availability value."
      );
    }

    const rawVerified =
      searchParams.get("verified");

    const verifiedOnly =
      parseBoolean(
        rawVerified
      );

    if (
      rawVerified &&
      verifiedOnly === null
    ) {
      return badRequest(
        "Invalid verified filter."
      );
    }

    /*
     * -----------------------------------------
     * NORMALIZE PRICE FILTERS
     * -----------------------------------------
     */

    const validMinPrice =
      minPrice !== null &&
      minPrice >= 0
        ? minPrice
        : null;

    const validMaxPrice =
      maxPrice !== null &&
      maxPrice >= 0
        ? maxPrice
        : null;

    const normalizedMinPrice =
      validMinPrice !== null &&
      validMaxPrice !== null &&
      validMinPrice >
        validMaxPrice
        ? validMaxPrice
        : validMinPrice;

    const normalizedMaxPrice =
      validMinPrice !== null &&
      validMaxPrice !== null &&
      validMinPrice >
        validMaxPrice
        ? validMinPrice
        : validMaxPrice;

    /*
     * -----------------------------------------
     * LOAD ACTIVE BUSINESSES
     * -----------------------------------------
     *
     * Soft-deleted businesses and products are
     * never included in normal search results.
     */

    const businesses =
      await prisma.business.findMany({
        where: {
          status: "ACTIVE",
          deletedAt: null,

          ...(category
            ? {
                categories: {
                  some: {
                    category: {
                      name: {
                        equals:
                          category,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              }
            : {}),

          ...(location
            ? {
                location: {
                  area: {
                    contains:
                      location,
                    mode: "insensitive",
                  },
                },
              }
            : {}),

          ...(availability
            ? {
                availability,
              }
            : {}),

          ...(verifiedOnly === true
            ? {
                verification:
                  VerificationStatus.VERIFIED,
              }
            : {}),
        },

        include: {
          location: true,

          categories: {
            include: {
              category: true,
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
                    sortOrder:
                      "asc",
                  },
                  {
                    createdAt:
                      "asc",
                  },
                ],
              },
            },

            orderBy: {
              updatedAt: "desc",
            },
          },

          socialLinks: true,
        },

        orderBy: {
          onboardedAt: "desc",
        },
      });

    /*
     * -----------------------------------------
     * PRICE FILTER
     * -----------------------------------------
     */

    const priceFiltered =
      businesses.filter(
        (business) => {
          if (
            normalizedMinPrice ===
              null &&
            normalizedMaxPrice ===
              null
          ) {
            return true;
          }

          return business.products.some(
            (product) => {
              const productMin =
                product.priceMin ??
                product.price;

              const productMax =
                product.priceMax ??
                product.price;

              /*
               * No price information:
               * preserve Ask Seller behavior.
               */
              if (
                productMin ===
                  null &&
                productMax ===
                  null
              ) {
                return true;
              }

              if (
                normalizedMinPrice !==
                  null &&
                productMax !==
                  null &&
                productMax <
                  normalizedMinPrice
              ) {
                return false;
              }

              if (
                normalizedMaxPrice !==
                  null &&
                productMin !==
                  null &&
                productMin >
                  normalizedMaxPrice
              ) {
                return false;
              }

              return true;
            }
          );
        }
      );

    /*
     * -----------------------------------------
     * TEXT / MATCHING SEARCH
     * -----------------------------------------
     */

    let results =
      priceFiltered;

    if (q) {
      /*
       * Reuse the already-loaded searchable
       * businesses instead of making findMatches()
       * issue another full Prisma query.
       */
      const matchingBudget =
        normalizedMaxPrice ??
        normalizedMinPrice ??
        undefined;

      const parsed =
        parseQuery(
          q,
          location || undefined,
          matchingBudget,
          category || undefined
        );

      const matches =
        await findMatches(
          parsed,
          priceFiltered
        );

      const scoreMap =
        new Map<string, number>();

      for (
        const match of matches
      ) {
        scoreMap.set(
          match.business.id,
          match.score
        );
      }

      results =
        results
          .filter(
            (business) =>
              scoreMap.has(
                business.id
              )
          )
          .sort(
            (a, b) => {
              const scoreA =
                scoreMap.get(
                  a.id
                ) ?? 0;

              const scoreB =
                scoreMap.get(
                  b.id
                ) ?? 0;

              return (
                scoreB -
                scoreA
              );
            }
          );
    }

    /*
     * -----------------------------------------
     * FORMAT RESPONSE
     * -----------------------------------------
     */

    const formattedBusinesses =
      results.map(
        (business) => ({
          id:
            business.id,

          name:
            business.name,

          ownerName:
            business.ownerName,

          description:
            business.description,

          imageUrl:
            business.imageUrl,

          location:
            business.location
              ? {
                  id:
                    business.location
                      .id,

                  area:
                    business.location
                      .area,

                  address:
                    business.location
                      .address,

                  lat:
                    business.location
                      .lat,

                  long:
                    business.location
                      .long,

                  verification:
                    business
                      .location
                      .verification,
                }
              : null,

          area:
            business.location
              ?.area ??
            "Location not added",

          availability:
            business.availability,

          verification:
            business.verification,

          verified:
            business.verification ===
            VerificationStatus.VERIFIED,

          category:
            business
              .categories?.[0]
              ?.category?.name ??
            "Other",

          categories:
            business.categories.map(
              (item) =>
                item.category
                  .name
            ),

          productCount:
            business.products
              .length,

          products:
            business.products.map(
              (product) => ({
                id:
                  product.id,

                name:
                  product.name,

                description:
                  product.description,

                price:
                  product.price,

                priceMin:
                  product.priceMin,

                priceMax:
                  product.priceMax,

                availability:
                  product.availability,

                imageUrl:
                  product.imageUrl,

                keywords:
                  product.keywords,

                category:
                  product.category,

                images:
                  product.images.map(
                    (image) => ({
                      id:
                        image.id,

                      url:
                        image.url,

                      publicId:
                        image.publicId,

                      sortOrder:
                        image.sortOrder,
                    })
                  ),
              })
            ),

          socialLinks:
            business.socialLinks.map(
              (link) => ({
                id:
                  link.id,

                platform:
                  link.platform,

                handle:
                  link.handle,
              })
            ),
        })
      );

    /*
     * -----------------------------------------
     * SEARCH ANALYTICS
     * -----------------------------------------
     *
     * Analytics failure must never cause
     * a valid search to fail.
     */

    try {
      await prisma.searchEvent.create({
        data: {
          query:
            q || "*",

          category:
            category || null,

          location:
            location || null,

          minPrice:
            normalizedMinPrice,

          maxPrice:
            normalizedMaxPrice,

          resultCount:
            formattedBusinesses.length,
        },
      });
    } catch (eventError) {
      console.error(
        "Search event error:",
        eventError
      );
    }

    /*
     * -----------------------------------------
     * RESPONSE
     * -----------------------------------------
     */

    return NextResponse.json(
      {
        businesses:
          formattedBusinesses,

        total:
          formattedBusinesses
            .length,

        query: q,

        filters: {
          category:
            category || null,

          location:
            location || null,

          minPrice:
            normalizedMinPrice,

          maxPrice:
            normalizedMaxPrice,

          availability:
            availability || null,

          verified:
            verifiedOnly === true,
        },
      },
      {
        headers:
          rateLimit.headers,
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
        total: 0,
        query: "",
        error:
          "Unable to complete your search right now.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}