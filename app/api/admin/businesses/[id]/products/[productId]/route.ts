import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

import {
  Availability,
  BusinessStatus,
} from "@prisma/client";

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value === Availability.AVAILABLE ||
    value ===
      Availability.ASK_SELLER ||
    value ===
      Availability.UNAVAILABLE
  );
}

function isBusinessStatus(
  value: unknown
): value is BusinessStatus {
  return (
    value === BusinessStatus.ACTIVE ||
    value === BusinessStatus.INACTIVE ||
    value === BusinessStatus.PENDING
  );
}

function parseOptionalInt(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return null;
  }

  return Math.floor(parsed);
}

function parseKeywords(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item ===
        "string"
    )
    .map((item) =>
      item.trim()
    )
    .filter(Boolean);
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      productId: string;
    }>;
  }
) {
  try {
    await requireAdmin();

    const {
      id: businessId,
      productId,
    } = await params;

    const product =
      await prisma.product.findFirst(
        {
          where: {
            id: productId,
            businessId,
          },

          include: {
            business: true,
            category: true,

            images: {
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
        }
      );

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      product,
    });
  } catch (error) {
    console.error(
      "Admin product GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load product.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      productId: string;
    }>;
  }
) {
  try {
    await requireAdmin();

    const {
      id: businessId,
      productId,
    } = await params;

    const existing =
      await prisma.product.findFirst(
        {
          where: {
            id: productId,
            businessId,
          },

          include: {
            images: {
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
        }
      );

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
        }
      );
    }

    const body =
      await request.json();

    const data: {
      name?: string;
      description?: string | null;
      categoryId?: string | null;
      price?: number | null;
      priceMin?: number | null;
      priceMax?: number | null;
      availability?: Availability;
      status?: BusinessStatus;
      keywords?: string[];
      imageUrl?: string | null;
    } = {};

    if (
      body.name !==
      undefined
    ) {
      if (
        typeof body.name !==
        "string" ||
        !body.name.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "Product name is required.",
          },
          {
            status: 400,
          }
        );
      }

      data.name =
        body.name.trim();
    }

    if (
      body.description !==
      undefined
    ) {
      data.description =
        typeof body.description ===
        "string"
          ? body.description.trim() ||
            null
          : null;
    }

    if (
      body.categoryId !==
      undefined
    ) {
      const categoryId =
        typeof body.categoryId ===
          "string" &&
        body.categoryId.trim()
          ? body.categoryId.trim()
          : null;

      if (categoryId) {
        const category =
          await prisma.category.findUnique(
            {
              where: {
                id: categoryId,
              },
            }
          );

        if (!category) {
          return NextResponse.json(
            {
              error:
                "Category not found.",
            },
            {
              status: 400,
            }
          );
        }
      }

      data.categoryId =
        categoryId;
    }

    if (
      body.price !==
      undefined
    ) {
      data.price =
        parseOptionalInt(
          body.price
        );
    }

    if (
      body.priceMin !==
      undefined
    ) {
      data.priceMin =
        parseOptionalInt(
          body.priceMin
        );
    }

    if (
      body.priceMax !==
      undefined
    ) {
      data.priceMax =
        parseOptionalInt(
          body.priceMax
        );
    }

    const finalPrice =
      data.price !== undefined
        ? data.price
        : existing.price;

    const finalPriceMin =
      data.priceMin !==
      undefined
        ? data.priceMin
        : existing.priceMin;

    const finalPriceMax =
      data.priceMax !==
      undefined
        ? data.priceMax
        : existing.priceMax;

    if (
      finalPrice !== null &&
      finalPrice < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Price cannot be negative.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      finalPriceMin !== null &&
      finalPriceMin < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be negative.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      finalPriceMax !== null &&
      finalPriceMax < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum price cannot be negative.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      finalPriceMin !== null &&
      finalPriceMax !== null &&
      finalPriceMin >
        finalPriceMax
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot exceed maximum price.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      body.availability !==
      undefined
    ) {
      if (
        !isAvailability(
          body.availability
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid availability.",
          },
          {
            status: 400,
          }
        );
      }

      data.availability =
        body.availability;
    }

    if (
      body.status !==
      undefined
    ) {
      if (
        !isBusinessStatus(
          body.status
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid product status.",
          },
          {
            status: 400,
          }
        );
      }

      data.status =
        body.status;
    }

    if (
      body.keywords !==
      undefined
    ) {
      data.keywords =
        parseKeywords(
          body.keywords
        );
    }

    const hasImagesField =
      Object.prototype.hasOwnProperty.call(
        body,
        "images"
      );

    if (
      hasImagesField &&
      !Array.isArray(
        body.images
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Images must be an array.",
        },
        {
          status: 400,
        }
      );
    }

    let imageUrls:
      | string[]
      | null = [];

    if (hasImagesField) {
      imageUrls =
        body.images
          .filter(
            (
              value: any
            ): value is string =>
              typeof value ===
              "string"
          )
          .map((value: string) =>
            value.trim()
          )
          .filter(Boolean);
          if(imageUrls !== null){
             data.imageUrl =imageUrls[0] ?? null;
          }

     
        
    }

    const product =
      await prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.product.update(
              {
                where: {
                  id: productId,
                },

                data,

                include: {
                  category: true,
                },
              }
            );

          if (hasImagesField) {
            await tx.productImage.deleteMany(
              {
                where: {
                  productId,
                },
              }
            );

            if (
              imageUrls &&
              imageUrls.length > 0
            ) {
              await tx.productImage.createMany(
                {
                  data:
                    imageUrls.map(
                      (
                        url,
                        index
                      ) => ({
                        productId,
                        url,
                        sortOrder:
                          index,
                      })
                    ),
                }
              );
            }
          }

          return updated;
        }
      );

    const completeProduct =
      await prisma.product.findUnique(
        {
          where: {
            id: product.id,
          },

          include: {
            category: true,

            images: {
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
        }
      );

    return NextResponse.json({
      product:
        completeProduct,
    });
  } catch (error) {
    console.error(
      "Admin product PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update product.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      productId: string;
    }>;
  }
) {
  try {
    await requireAdmin();

    const {
      id: businessId,
      productId,
    } = await params;

    const existing =
      await prisma.product.findFirst(
        {
          where: {
            id: productId,
            businessId,
          },

          select: {
            id: true,
          },
        }
      );

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
        }
      );
    }

    await prisma.product.delete(
      {
        where: {
          id: productId,
        },
      }
    );

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Admin product DELETE error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to delete product.",
      },
      {
        status: 500,
      }
    );
  }
}