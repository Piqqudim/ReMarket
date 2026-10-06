import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const FEATURED_COUNT = 4;

function getResponseHeaders(
  rateLimitHeaders: Headers
): Headers {
  const headers =
    new Headers(rateLimitHeaders);

  headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  return headers;
}

export async function GET(
  request: NextRequest
) {
  const rateLimit =
    checkPublicRateLimit(
      request,
      "featured"
    );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        businesses: [],
        total: 0,
        error:
          "Too many featured-business requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: getResponseHeaders(
          rateLimit.headers
        ),
      }
    );
  }

  try {
    /*
     * -----------------------------------------
     * SELECT RANDOM FEATURED BUSINESSES
     * -----------------------------------------
     *
     * Only active and non-soft-deleted
     * businesses can appear publicly.
     *
     * The query is parameterized through Prisma.
     */
    const randomBusinessRows =
      await prisma.$queryRaw<
        { id: string }[]
      >`
        SELECT "id"
        FROM "Business"
        WHERE "status" = 'ACTIVE'
          AND "deletedAt" IS NULL
        ORDER BY RANDOM()
        LIMIT ${FEATURED_COUNT}
      `;

    const randomBusinessIds =
      randomBusinessRows.map(
        (row) => row.id
      );

    /*
     * No eligible businesses.
     */
    if (
      randomBusinessIds.length === 0
    ) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
        },
        {
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    /*
     * -----------------------------------------
     * LOAD PUBLIC BUSINESS DATA
     * -----------------------------------------
     *
     * Only fields actually used by the public
     * response are selected.
     */
    const businesses =
      await prisma.business.findMany({
        where: {
          id: {
            in: randomBusinessIds,
          },

          /*
           * Re-check business visibility in case
           * the record changed between queries.
           */
          status: "ACTIVE",
          deletedAt: null,
        },

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
              lat: true,
              long: true,
            },
          },

          /*
           * Only active categories are public.
           */
          categories: {
            where: {
              category: {
                isActive: true,
              },
            },

            select: {
              category: {
                select: {
                  name: true,
                },
              },
            },
          },

          /*
           * Only active, non-deleted products are
           * visible to customers.
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

          /*
           * Count only publicly visible products.
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
           * Preserve the existing public
           * social-links response.
           */
          socialLinks: true,
        },
      });

    /*
     * -----------------------------------------
     * RESTORE RANDOM ORDER
     * -----------------------------------------
     *
     * Prisma's `in` query does not guarantee
     * PostgreSQL's RANDOM() order.
     */
    const businessMap =
      new Map(
        businesses.map(
          (business) => [
            business.id,
            business,
          ]
        )
      );

    const orderedBusinesses =
      randomBusinessIds
        .map((id) =>
          businessMap.get(id)
        )
        .filter(
          (
            business
          ): business is NonNullable<
            typeof business
          > =>
            business !== undefined
        );

    /*
     * -----------------------------------------
     * FORMAT PUBLIC RESPONSE
     * -----------------------------------------
     */
    const featured =
      orderedBusinesses.map(
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

                  lat:
                    business.location.lat,

                  long:
                    business.location.long,
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
            "VERIFIED",

          category:
            business.categories[0]
              ?.category.name ??
            "Other",

          categories:
            business.categories.map(
              (item) =>
                item.category.name
            ),

          productCount:
            business._count.products,

          products:
            business.products.map(
              (product) => ({
                id: product.id,

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
     * RESPONSE
     * -----------------------------------------
     *
     * Featured is intentionally randomized,
     * so public caching is disabled.
     */
    return NextResponse.json(
      {
        businesses: featured,

        total:
          featured.length,
      },
      {
        headers:
          getResponseHeaders(
            rateLimit.headers
          ),
      }
    );
  } catch (error) {
    console.error(
      "Featured businesses error:",
      error
    );

    return NextResponse.json(
      {
        businesses: [],
        total: 0,
        error:
          "Unable to load featured businesses",
      },
      {
        status: 500,
        headers:
          getResponseHeaders(
            rateLimit.headers
          ),
      }
    );
  }
}