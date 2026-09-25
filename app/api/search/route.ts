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

  const number =
    Number(value.trim());

  if (
    !Number.isFinite(number)
  ) {
    return null;
  }

  return Math.floor(number);
}

function parseBoolean(
  value: string | null
): boolean | null {
  if (
    value === "true"
  ) {
    return true;
  }

  if (
    value === "false"
  ) {
    return false;
  }

  return null;
}

function parseAvailability(
  value: string
): Availability | null {
  if (
    value ===
      Availability.AVAILABLE ||
    value ===
      Availability.ASK_SELLER ||
    value ===
      Availability.UNAVAILABLE
  ) {
    return value;
  }

  return null;
}

export async function GET(
  request: NextRequest
) {
  try {
    const {
      searchParams,
    } = new URL(
      request.url
    );

    /*
     * -----------------------------------------
     * READ SEARCH PARAMETERS
     * -----------------------------------------
     */

    const q = clean(
      searchParams.get("q")
    );

    const category = clean(
      searchParams.get(
        "category"
      )
    );

    const location = clean(
      searchParams.get(
        "location"
      )
    );

    const minPrice =
      parseOptionalInt(
        searchParams.get(
          "minPrice"
        )
      );

    const maxPrice =
      parseOptionalInt(
        searchParams.get(
          "maxPrice"
        )
      );

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

    const verifiedOnly =
      parseBoolean(
        searchParams.get(
          "verified"
        )
      );

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

    /*
     * If both are supplied in the wrong
     * order, swap them so the filter remains
     * useful instead of silently returning
     * unexpected results.
     */

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
     * Soft-deleted businesses and products
     * must never appear in normal ReMarket
     * search results.
     */

    const businesses =
      await prisma.business.findMany(
        {
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

            ...(verifiedOnly ===
            true
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

            /*
             * Only active + non-deleted
             * products are visible.
             */
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
        }
      );

    /*
     * -----------------------------------------
     * PRICE FILTER
     * -----------------------------------------
     *
     * A business qualifies when at least one
     * active product overlaps the requested
     * price range.
     *
     * Products without any price remain
     * searchable because the seller may still
     * require the customer to ask for a price.
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
               * preserve the existing ReMarket
               * "Ask seller" behavior.
               */
              if (
                productMin ===
                  null &&
                productMax ===
                  null
              ) {
                return true;
              }

              /*
               * Requested minimum means the
               * product's maximum must reach it.
               */
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

              /*
               * Requested maximum means the
               * product's minimum must not exceed it.
               */
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
      const parsed =
        parseQuery(
          q,
          location
        );

      const matches =
        await findMatches(
          parsed
        );

      const scoreMap =
        new Map<
          string,
          number
        >();

      for (
        const match of
          matches
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
          id: business.id,

          name: business.name,

          ownerName:
            business.ownerName,

          description:
            business.description,

          imageUrl:
            business.imageUrl,

          location:
            business.location
              ? {
                  area:
                    business
                      .location
                      .area,
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
            business.categories?.[0]
              ?.category?.name ??
            "Other",

          categories:
            business.categories.map(
              (item) =>
                item.category.name
            ),

          productCount:
            business.products.length,

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
            business.socialLinks,
        })
      );

    /*
     * -----------------------------------------
     * SEARCH ANALYTICS
     * -----------------------------------------
     *
     * Analytics failure must never make
     * a valid search fail.
     */

    try {
      await prisma.searchEvent.create(
        {
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
        }
      );
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

    return NextResponse.json({
      businesses:
        formattedBusinesses,

      total:
        formattedBusinesses.length,

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
    });
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
      }
    );
  }
}