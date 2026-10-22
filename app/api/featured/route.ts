import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import {
  checkPublicRateLimit,
} from "@/lib/rate-limit";

/**
 * ------------------------------------------------
 * REMARKET FEATURED BUSINESSES API
 * ------------------------------------------------
 *
 * Purpose:
 * - Return a small random selection of active
 *   businesses for the homepage.
 * - Include active categories and product previews.
 * - Keep the total product count accurate.
 * - Never expose exact business coordinates.
 * - Prevent excessive public requests.
 *
 * Important:
 * - This is an organic featured-business selection.
 * - It is not a paid promotion or sponsored-listing
 *   system.
 */

const FEATURED_BUSINESS_LIMIT = 4;
const PRODUCT_PREVIEW_LIMIT = 4;

function noStoreHeaders(
  baseHeaders?: HeadersInit
): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "no-store, max-age=0"
  );

  headers.set(
    "Pragma",
    "no-cache"
  );

  headers.set(
    "Expires",
    "0"
  );

  return headers;
}

function emptyResponse(
  headers?: HeadersInit
) {
  return NextResponse.json(
    {
      businesses: [],
    },
    {
      headers: noStoreHeaders(headers),
    }
  );
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
        error:
          "Too many requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: noStoreHeaders(
          rateLimit.headers
        ),
      }
    );
  }

  try {
    /*
     * --------------------------------------------
     * 1. Select a small random set of businesses
     * --------------------------------------------
     *
     * The raw query returns IDs only.
     * It does not retrieve or expose location
     * coordinates.
     *
     * Keep this query restricted to active,
     * non-deleted businesses.
     */

    const selectedBusinesses =
      await prisma.$queryRaw<
        Array<{ id: string }>
      >`
        SELECT "id"
        FROM "Business"
        WHERE
          "status" = 'ACTIVE'
          AND "deletedAt" IS NULL
        ORDER BY RANDOM()
        LIMIT ${FEATURED_BUSINESS_LIMIT}
      `;

    const selectedIds =
      selectedBusinesses.map(
        (business) => business.id
      );

    if (selectedIds.length === 0) {
      return emptyResponse(
        rateLimit.headers
      );
    }

    /*
     * --------------------------------------------
     * 2. Fetch public business information
     * --------------------------------------------
     *
     * Do not select:
     * - Business phone directly from the record
     * - Internal notes
     * - Owner account IDs
     * - Location latitude
     * - Location longitude
     *
     * The public location object deliberately
     * excludes exact coordinates.
     */

    const businesses =
      await prisma.business.findMany({
        where: {
          id: {
            in: selectedIds,
          },

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
              street: true,
              address: true,
            },
          },

          /*
           * Show only categories that are
           * currently enabled by ReMarket.
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
                  id: true,
                  name: true,
                },
              },
            },
          },

          /*
           * Product previews are intentionally
           * limited so the homepage response
           * does not grow with the full catalogue.
           *
           * productCount below still represents
           * the complete active product count.
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

            take: PRODUCT_PREVIEW_LIMIT,
          },

          /*
           * Count all visible products, not just
           * the product previews returned above.
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
           * Keep only the fields used for public
           * business contact links.
           */
          socialLinks: {
            select: {
              platform: true,
              handle: true,
            },
          },
        },
      });

    /*
     * --------------------------------------------
     * 3. Restore the random selection order
     * --------------------------------------------
     *
     * findMany does not guarantee that results
     * follow the order of IDs supplied in `in`.
     */

    const businessesById =
      new Map(
        businesses.map(
          (business) => [
            business.id,
            business,
          ]
        )
      );

    const orderedBusinesses =
      selectedIds
        .map(
          (id) =>
            businessesById.get(id)
        )
        .filter(
          (
            business
          ): business is NonNullable<
            typeof business
          > => Boolean(business)
        );

    /*
     * --------------------------------------------
     * 4. Format the existing public response
     * --------------------------------------------
     *
     * Keep homepage fields including:
     * - area
     * - category
     * - categories
     * - products
     * - productCount
     * - socialLinks
     *
     * Do not include exact latitude/longitude.
     */

    const formattedBusinesses =
      orderedBusinesses.map(
        (business) => {
          const categoryNames =
            business.categories.map(
              (item) =>
                item.category.name
            );

          return {
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

            /*
             * Retain this nested location object
             * without latitude or longitude.
             */
            location:
              business.location,

            availability:
              business.availability,

            verification:
              business.verification,

            category:
              categoryNames[0] ??
              "Services",

            categories:
              categoryNames,

            products:
              business.products,

            productCount:
              business._count.products,

            socialLinks:
              business.socialLinks,
          };
        }
      );

    return NextResponse.json(
      {
        businesses:
          formattedBusinesses,
      },
      {
        headers: noStoreHeaders(
          rateLimit.headers
        ),
      }
    );
  } catch (error) {
    console.error(
      "Featured API error:",
      error
    );

    return NextResponse.json(
      {
        businesses: [],
        error:
          "Unable to load featured businesses.",
      },
      {
        status: 500,
        headers: noStoreHeaders(
          rateLimit.headers
        ),
      }
    );
  }
}