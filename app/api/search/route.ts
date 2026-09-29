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

  const numberValue = Number(
    value.trim()
  );

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return Math.floor(numberValue);
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

function normalizeNigerianPhone(
  value: string
): string {
  let cleanValue = value
    .trim()
    .replace(/[^\d+]/g, "");

  if (!cleanValue) {
    return "";
  }

  if (cleanValue.startsWith("00")) {
    cleanValue = cleanValue.slice(2);
  }

  if (cleanValue.startsWith("+")) {
    cleanValue = cleanValue.slice(1);
  }

  if (cleanValue.startsWith("234")) {
    return `+${cleanValue}`;
  }

  if (cleanValue.startsWith("0")) {
    return `+234${cleanValue.slice(1)}`;
  }

  return `+234${cleanValue}`;
}

function normalizeSocialHandle(
  platform: string,
  handle: string
): string {
  const cleanHandle = handle.trim();

  if (!cleanHandle) {
    return "";
  }

  if (
    platform === "WHATSAPP" ||
    platform === "PHONE"
  ) {
    if (
      cleanHandle.startsWith("http://") ||
      cleanHandle.startsWith("https://")
    ) {
      return cleanHandle;
    }

    return normalizeNigerianPhone(
      cleanHandle
    );
  }

  return cleanHandle;
}

export async function GET(
  request: NextRequest
) {
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

    const minPrice =
      parseOptionalInt(
        searchParams.get("minPrice")
      );

    const maxPrice =
      parseOptionalInt(
        searchParams.get("maxPrice")
      );

    const availabilityValue =
      clean(
        searchParams.get("availability")
      );

    const availability =
      parseAvailability(
        availabilityValue
      );

    const verifiedOnly =
      parseBoolean(
        searchParams.get("verified")
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

    const normalizedMinPrice =
      validMinPrice !== null &&
      validMaxPrice !== null &&
      validMinPrice > validMaxPrice
        ? validMaxPrice
        : validMinPrice;

    const normalizedMaxPrice =
      validMinPrice !== null &&
      validMaxPrice !== null &&
      validMinPrice > validMaxPrice
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
                        equals: category,
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
                    contains: location,
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

          /*
           * Only active and non-deleted products
           * are visible to customers.
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
                    sortOrder: "asc",
                  },
                  {
                    createdAt: "asc",
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
     *
     * A business qualifies when at least one
     * active product overlaps the requested
     * price range.
     *
     * Products without price information remain
     * searchable because ReMarket supports
     * "Ask seller".
     */

    const priceFiltered =
      businesses.filter(
        (business) => {
          if (
            normalizedMinPrice === null &&
            normalizedMaxPrice === null
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
                productMin === null &&
                productMax === null
              ) {
                return true;
              }

              /*
               * Requested minimum means the
               * product maximum must reach it.
               */
              if (
                normalizedMinPrice !== null &&
                productMax !== null &&
                productMax <
                  normalizedMinPrice
              ) {
                return false;
              }

              /*
               * Requested maximum means the
               * product minimum must not exceed it.
               */
              if (
                normalizedMaxPrice !== null &&
                productMin !== null &&
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

    let results = priceFiltered;

    if (q) {
      /*
       * The matching engine supports:
       *
       * raw query
       * explicit location
       * explicit budget
       * explicit category
       *
       * For a search range, use the maximum
       * requested price as the matching budget
       * when available. The actual range filtering
       * has already happened above.
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
        await findMatches(parsed);

      const scoreMap =
        new Map<string, number>();

      for (const match of matches) {
        scoreMap.set(
          match.business.id,
          match.score
        );
      }

      results = results
        .filter((business) =>
          scoreMap.has(business.id)
        )
        .sort((a, b) => {
          const scoreA =
            scoreMap.get(a.id) ?? 0;

          const scoreB =
            scoreMap.get(b.id) ?? 0;

          return scoreB - scoreA;
        });
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
                  id:
                    business.location.id,

                  area:
                    business.location.area,

                  address:
                    business.location.address,

                  lat:
                    business.location.lat,

                  long:
                    business.location.long,

                  verification:
                    business.location
                      .verification,
                }
              : null,

          area:
            business.location?.area ??
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
                id: product.id,

                name: product.name,

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
                      id: image.id,

                      url: image.url,

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
                id: link.id,

                platform:
                  link.platform,

                handle:
                  normalizeSocialHandle(
                    link.platform,
                    link.handle
                  ),
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
          query: q || "*",

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