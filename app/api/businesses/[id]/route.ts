import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

function normalizeNigerianPhone(
  value: string
): string {
  let clean = value
    .trim()
    .replace(/[^\d+]/g, "");

  if (!clean) {
    return "";
  }

  if (clean.startsWith("00")) {
    clean = clean.slice(2);
  }

  if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }

  if (clean.startsWith("234")) {
    return `+${clean}`;
  }

  if (clean.startsWith("0")) {
    return `+234${clean.slice(1)}`;
  }

  return `+234${clean}`;
}

function normalizeSocialHandle(
  platform: string,
  handle: string
): string {
  const clean = handle.trim();

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
        }
      );
    }

    /*
     * -----------------------------------------
     * LOAD PUBLIC BUSINESS
     * -----------------------------------------
     *
     * Public ReMarket pages may only expose
     * ACTIVE and non-soft-deleted businesses.
     */

    const business =
      await prisma.business.findFirst(
        {
          where: {
            id,
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

            categories: {
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
             * Only active + non-deleted products
             * are public.
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
             * Count only products which are
             * currently visible to customers.
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
        }
      );

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
        }
      );
    }

    /*
     * -----------------------------------------
     * FORMAT BUSINESS
     * -----------------------------------------
     */

    const formattedBusiness = {
      id: business.id,

      name: business.name,

      ownerName:
        business.ownerName,

      description:
        business.description,

      imageUrl:
        business.imageUrl,

      /*
       * Coordinates remain available here
       * because the public business page uses
       * the business location for Directions.
       *
       * These are BUSINESS coordinates, not the
       * customer's current coordinates.
       */
      location: {
        id:
          business.location?.id ??
          null,

        area:
          business.location?.area ??
          "Location not added",

        lat:
          business.location?.lat ??
          null,

        long:
          business.location?.long ??
          null,
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

      /*
       * Normalize WhatsApp/Phone handles
       * before exposing them to the client.
       */
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
    };

    return NextResponse.json({
      business:
        formattedBusiness,
    });
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
      }
    );
  }
}