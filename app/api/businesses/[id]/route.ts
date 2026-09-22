import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

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

    const business =
      await prisma.business.findFirst(
        {
          where: {
            id,
            status: "ACTIVE",
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
                updatedAt: true,

                images: {
                  select: {
                    id: true,
                    url: true,
                    publicId: true,
                    sortOrder: true,
                    createdAt: true,
                  },
                },
              },

              orderBy: {
                updatedAt: "desc",
              },
            },

            socialLinks: true,
          },
        }
      );

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

    const formattedBusiness = {
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

      verified:
        business.verification ===
        "VERIFIED",

      category:
        business
          .categories[0]
          ?.category?.name ??
        "Other",

      categories:
        business.categories.map(
          (item) =>
            item.category.name
        ),

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
              [
                ...product.images,
              ]
                .sort(
                  (a, b) =>
                    a.sortOrder -
                      b.sortOrder ||
                    a.createdAt.getTime() -
                      b.createdAt.getTime()
                )
                .map(
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
            handle: link.handle,
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