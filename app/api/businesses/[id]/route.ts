import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_BUSINESS_ID_LENGTH = 100;

function getResponseHeaders(
  rateLimitHeaders: Headers
): Headers {
  const headers =
    new Headers(rateLimitHeaders);

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return headers;
}

function normalizeNigerianPhone(
  value: string
): string {
  let clean = value
    .trim()
    .replace(/[^\d+]/g, "");

  if (!clean) {
    return "";
  }

  if (
    clean.startsWith("00")
  ) {
    clean = clean.slice(2);
  }

  if (
    clean.startsWith("+")
  ) {
    clean = clean.slice(1);
  }

  if (
    clean.startsWith("234")
  ) {
    return `+${clean}`;
  }

  if (
    clean.startsWith("0")
  ) {
    return `+234${clean.slice(1)}`;
  }

  return `+234${clean}`;
}

function normalizeSocialHandle(
  platform: string,
  handle: string
): string {
  const clean =
    handle.trim();

  if (!clean) {
    return "";
  }

  if (
    platform === "WHATSAPP" ||
    platform === "PHONE"
  ) {
    if (
      clean.startsWith("http://") ||
      clean.startsWith("https://")
    ) {
      return clean;
    }

    return normalizeNigerianPhone(
      clean
    );
  }

  return clean;
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const rateLimit =
    checkPublicRateLimit(
      request,
      "featured"
    );

  /*
   * The business-detail route uses the
   * existing public limiter while avoiding
   * creation of another limiter scope/file.
   */
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many business requests. Please try again shortly.",
      },
      {
        status: 429,
        headers:
          getResponseHeaders(
            rateLimit.headers
          ),
      }
    );
  }

  try {
    const { id } =
      await params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Business ID is required",
        },
        {
          status: 400,
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    if (
      id.length >
      MAX_BUSINESS_ID_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid business ID",
        },
        {
          status: 400,
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    /*
     * -----------------------------------------
     * LOAD PUBLIC BUSINESS
     * -----------------------------------------
     *
     * Only ACTIVE and non-soft-deleted
     * businesses are publicly visible.
     */

    const business =
      await prisma.business.findFirst({
        where: {
          id,
          status: "ACTIVE",
          deletedAt: null,
        },

        select: {
          id: true,
          name: true,

          /*
           * ownerId is used only on the server
           * to determine whether this business
           * is currently unowned.
           *
           * It is NOT exposed to the client.
           */
          ownerId: true,

          ownerName: true,
          description: true,
          imageUrl: true,
          availability: true,
          verification: true,

          /*
           * Business.phone remains available as a
           * compatibility fallback for older
           * manually onboarded businesses.
           *
           * PHONE socialLinks remains the source
           * of truth whenever it exists.
           */
          phone: true,

          location: {
            select: {
              id: true,

              area: true,

              /*
               * Canonical street used by the
               * ReMarket Near Me street-ranking
               * system.
               */
              street: true,

              address: true,
              lat: true,
              long: true,
              verification: true,
            },
          },

          /*
           * Only active categories are exposed
           * publicly.
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
           * Only ACTIVE + non-deleted products
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
              keywords: true,

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

          /*
           * Count only products currently
           * visible to customers.
           *
           * Reviews are counted separately below
           * so the existing product count behavior
           * remains unchanged.
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

          socialLinks: {
            select: {
              id: true,
              platform: true,
              handle: true,
            },
          },
        },
      });

    /*
     * -----------------------------------------
     * BUSINESS NOT FOUND
     * -----------------------------------------
     */

    if (!business) {
      return NextResponse.json(
        {
          error:
            "Business not found",
        },
        {
          status: 404,
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    /*
     * -----------------------------------------
     * REVIEW SUMMARY
     * -----------------------------------------
     *
     * Reviews belong to the business and are
     * already restricted by the public business
     * lookup above to ACTIVE + non-deleted
     * businesses.
     *
     * We expose only summary information here.
     * Individual reviews remain available through:
     *
     * /api/businesses/[id]/reviews
     */

    const reviewSummary =
      await prisma.businessReview.aggregate(
        {
          where: {
            businessId:
              business.id,
          },

          _avg: {
            rating: true,
          },

          _count: {
            _all: true,
          },
        }
      );

    const reviewCount =
      reviewSummary._count._all;

    const averageRating =
      reviewCount > 0 &&
      reviewSummary._avg.rating !==
        null
        ? Number(
            reviewSummary._avg.rating.toFixed(
              1
            )
          )
        : 0;

    /*
     * -----------------------------------------
     * FORMAT SOCIAL LINKS
     * -----------------------------------------
     */

    /*
     * Normalize the stored social links first.
     *
     * PHONE social link is the canonical phone
     * value whenever it exists.
     */
    const formattedSocialLinks =
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
      );

    /*
     * Legacy compatibility:
     *
     * Some older manually onboarded businesses
     * may have Business.phone populated without
     * a PHONE social-link record.
     *
     * In that case only, expose Business.phone
     * as a fallback PHONE social link.
     *
     * Newly created/updated businesses should
     * already have PHONE stored in socialLinks,
     * so the canonical PHONE social value wins.
     */
    const hasPhoneSocialLink =
      formattedSocialLinks.some(
        (link) =>
          link.platform ===
          "PHONE"
      );

    if (
      !hasPhoneSocialLink &&
      business.phone
    ) {
      formattedSocialLinks.push({
        id: `legacy-phone-${business.id}`,

        platform: "PHONE",

        handle:
          normalizeNigerianPhone(
            business.phone
          ),
      });
    }

    /*
     * -----------------------------------------
     * FORMAT BUSINESS
     * -----------------------------------------
     */

    const formattedBusiness = {
      id: business.id,

      name:
        business.name,

      ownerName:
        business.ownerName,

      description:
        business.description,

      imageUrl:
        business.imageUrl,

      /*
       * Safe public flag.
       *
       * This tells the client whether the
       * business currently has no owner.
       *
       * The actual ownerId is never exposed.
       */
      claimable:
        business.ownerId ===
        null,

      /*
       * Business verification and location
       * verification remain separate.
       */
      location: {
        id:
          business.location?.id ??
          null,

        area:
          business.location?.area ??
          "Location not added",

        /*
         * Canonical street used by
         * street-based discovery.
         */
        street:
          business.location?.street ??
          null,

        address:
          business.location?.address ??
          null,

        lat:
          business.location?.lat ??
          null,

        long:
          business.location?.long ??
          null,

        verification:
          business.location
            ?.verification ??
          "UNVERIFIED",
      },

      availability:
        business.availability,

      verification:
        business.verification,

      verified:
        business.verification ===
        "VERIFIED",

      category:
        business.categories[0]
          ?.category?.name ??
        "Other",

      categories:
        business.categories.map(
          (item) =>
            item.category.name
        ),

      /*
       * Accurate active product count.
       */
      productCount:
        business._count.products,

      /*
       * Review summary.
       */
      averageRating,

      reviewCount,

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

      /*
       * Normalize WhatsApp / Phone handles
       * before exposing them to the client.
       */
      socialLinks:
        formattedSocialLinks,
    };

    return NextResponse.json(
      {
        business:
          formattedBusiness,
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
      "Business API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load business",
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