import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const FEATURED_COUNT = 4;

export async function GET() {
  try {
    /*
     * -----------------------------------------
     * SELECT RANDOM FEATURED BUSINESSES
     * -----------------------------------------
     *
     * Only active and non-soft-deleted businesses
     * can appear publicly.
     */
    const randomBusinessRows =
      await prisma.$queryRaw<{ id: string }[]>`
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
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    /*
     * -----------------------------------------
     * LOAD PUBLIC BUSINESS DATA
     * -----------------------------------------
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

        include: {
          location: true,

          /*
           * Only active categories are public.
           */
          categories: {
            where: {
              category: {
                isActive: true,
              },
            },

            include: {
              category: true,
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
            business.socialLinks,
        })
      );

    /*
     * -----------------------------------------
     * RESPONSE
     * -----------------------------------------
     *
     * Disable caching because Featured is
     * intentionally randomized.
     */
    return NextResponse.json(
      {
        businesses: featured,

        total:
          featured.length,
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
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
      }
    );
  }
}