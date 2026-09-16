// app/api/search/route.ts

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  findMatches,
  parseQuery,
} from "@/lib/matching";
import { Availability, VerificationStatus } from "@prisma/client";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function clean(value: string | null) {
  return value?.trim() ?? "";
}

function parseOptionalInt(value: string | null) {
  if (!value) return null;

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.floor(number);
}

function parseBoolean(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;

  return null;
}

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const q = clean(searchParams.get("q"));
    const category = clean(searchParams.get("category"));
    const location = clean(searchParams.get("location"));

    const minPrice = parseOptionalInt(
      searchParams.get("minPrice")
    );

    const maxPrice = parseOptionalInt(
      searchParams.get("maxPrice")
    );

    const availability = clean(
      searchParams.get("availability")
    );

    const verifiedOnly = parseBoolean(
      searchParams.get("verified")
    );

    /* ---------------------------------------------------------------------- */
    /* Validate price range                                                   */
    /* ---------------------------------------------------------------------- */

    const validMinPrice =
      minPrice !== null && minPrice >= 0
        ? minPrice
        : null;

    const validMaxPrice =
      maxPrice !== null && maxPrice >= 0
        ? maxPrice
        : null;

    /* ---------------------------------------------------------------------- */
    /* Build base business query                                              */
    /* ---------------------------------------------------------------------- */

    const businesses = await prisma.business.findMany({
      where: {
        status: "ACTIVE",

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
              availability:Availability.AVAILABLE
                
            }
          : {}),

        ...(verifiedOnly === true
          ? {
              verification: VerificationStatus.VERIFIED,
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

    /* ---------------------------------------------------------------------- */
    /* Filter businesses by product price                                     */
    /* ---------------------------------------------------------------------- */

    const priceFiltered = businesses.filter((business) => {
      /*
       * If no price filter exists, don't remove anything.
       */
      if (
        validMinPrice === null &&
        validMaxPrice === null
      ) {
        return true;
      }

      /*
       * A business matches a price filter if at least one
       * active product overlaps the requested price range.
       */
      return business.products.some((product) => {
        const productMin =
          product.priceMin ?? product.price;

        const productMax =
          product.priceMax ?? product.price;

        /*
         * Product has no known price.
         * We don't exclude it when a price filter is supplied.
         */
        if (
          productMin === null &&
          productMax === null
        ) {
          return true;
        }

        /*
         * Under minimum requested price.
         */
        if (
          validMinPrice !== null &&
          productMax !== null &&
          productMax < validMinPrice
        ) {
          return false;
        }

        /*
         * Above maximum requested price.
         */
        if (
          validMaxPrice !== null &&
          productMin !== null &&
          productMin > validMaxPrice
        ) {
          return false;
        }

        return true;
      });
    });

    /* ---------------------------------------------------------------------- */
    /* Text search                                                             */
    /* ---------------------------------------------------------------------- */

    let results = priceFiltered;

    if (q) {
      /*
       * Use the existing matching engine.
       *
       * This is important because:
       *
       * "bread"
       *
       * should search:
       * - business name
       * - product name
       * - product description
       * - product keywords
       * - category
       */
      const parsed = parseQuery(q, location);

      const matches = await findMatches(parsed);

      /*
       * Convert matching IDs into a score lookup.
       */
      const scoreMap = new Map<string, number>();

      for (const match of matches) {
        scoreMap.set(match.business.id, match.score);
      }

      /*
       * Keep only businesses that actually matched.
       */
      results = results
        .filter((business) =>
          scoreMap.has(business.id)
        )
        .sort((a, b) => {
          const scoreA = scoreMap.get(a.id) ?? 0;
          const scoreB = scoreMap.get(b.id) ?? 0;

          return scoreB - scoreA;
        });
    }

    /* ---------------------------------------------------------------------- */
    /* Shape response for ReMarket frontend                                   */
    /* ---------------------------------------------------------------------- */

    const formattedBusinesses = results.map(
      (business) => ({
        id: business.id,

        name: business.name,

        ownerName: business.ownerName,

        description: business.description,

        location: business.location
          ? {
              area: business.location.area,
            }
          : null,

        area:
          business.location?.area ??
          "Location not added",

        availability: business.availability,

        verification: business.verification,

        verified:
          business.verification === "VERIFIED",

        category:
          business.categories?.[0]?.category?.name ??
          "Other",

        categories:
          business.categories.map(
            (item) => item.category.name
          ),

        productCount:
          business.products.length,

        products: business.products,

        socialLinks:
          business.socialLinks,
      })
    );

    /* ---------------------------------------------------------------------- */
    /* Record search                                                          */
    /* ---------------------------------------------------------------------- */

    try {
      await prisma.searchEvent.create({
        data: {
          query: q || "*",
          category: category || null,
          location: location || null,
          resultCount: formattedBusinesses.length,
        },
      });
    } catch (eventError) {
      /*
       * Search analytics should never break the actual search.
       */
      console.error(
        "Search event error:",
        eventError
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Response                                                               */
    /* ---------------------------------------------------------------------- */

    return NextResponse.json({
      businesses: formattedBusinesses,
      total: formattedBusinesses.length,

      query: q,

      filters: {
        category: category || null,
        location: location || null,
        minPrice: validMinPrice,
        maxPrice: validMaxPrice,
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