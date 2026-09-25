import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FEATURED_COUNT = 4;

export async function GET() {
  try {
    /*
     * Select 4 random businesses directly from PostgreSQL.
     *
     * Only ACTIVE and non-soft-deleted businesses
     * are allowed to appear in Featured Businesses.
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
    if (randomBusinessIds.length === 0) {
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
     * Load the randomly selected businesses
     * and their public data.
     */
    const businesses =
      await prisma.business.findMany({
        where: {
          id: {
            in: randomBusinessIds,
          },

          /*
           * Double-check that the businesses are
           * still active and not soft-deleted.
           */
          status: "ACTIVE",
          deletedAt: null,
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
           * are exposed publicly.
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
            },

            orderBy: {
              updatedAt: "desc",
            },
          },

          /*
           * Count only customer-visible products.
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
     * Prisma's `in` query does not guarantee the
     * same order produced by PostgreSQL RANDOM().
     *
     * Restore the random order here.
     */
    const businessMap = new Map(
      businesses.map((business) => [
        business.id,
        business,
      ])
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
          > => business !== undefined
        );

    /*
     * Format the response expected by the
     * ReMarket homepage.
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

          area:
            business.location?.area ??
            "Location not added",

          availability:
            business.availability,

          verification:
            business.verification,

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
            business.products,

          socialLinks:
            business.socialLinks,
        })
      );

    /*
     * Prevent caching so the homepage gets a
     * fresh random selection when it requests
     * Featured Businesses.
     */
    return NextResponse.json(
      {
        businesses: featured,
        total: featured.length,
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