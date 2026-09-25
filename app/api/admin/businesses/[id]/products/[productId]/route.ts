import { NextRequest, NextResponse } from "next/server";
import {
  Availability,
  BusinessStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{
    id: string;
    productId: string;
  }>;
};

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function nullableString(
  value: unknown
): string | null {
  const cleaned =
    cleanString(value);

  return cleaned || null;
}

function parseOptionalInt(
  value: unknown
): number | null | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return undefined;
  }

  return parsed;
}

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value === "AVAILABLE" ||
    value === "ASK_SELLER" ||
    value === "UNAVAILABLE"
  );
}

function isBusinessStatus(
  value: unknown
): value is BusinessStatus {
  return (
    value === "ACTIVE" ||
    value === "INACTIVE" ||
    value === "PENDING"
  );
}

function parseKeywords(
  value: unknown
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            item
          ): item is string =>
            typeof item ===
            "string"
        )
        .map(
          (item) =>
            item.trim()
        )
        .filter(Boolean)
    )
  );
}

function parseImages(
  value: unknown
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            item
          ): item is string =>
            typeof item ===
            "string"
        )
        .map(
          (item) =>
            item.trim()
        )
        .filter(Boolean)
    )
  );
}

async function getProduct(
  businessId: string,
  productId: string
) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      businessId,
    },
    include: {
      business: {
        select: {
          id: true,
          name: true,
        },
      },

      category: true,

      images: {
        orderBy: {
          sortOrder: "asc",
        },
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const {
    id: businessId,
    productId,
  } = await context.params;

  if (
    !businessId ||
    !productId
  ) {
    return NextResponse.json(
      {
        error:
          "Business ID and product ID are required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const product =
      await getProduct(
        businessId,
        productId
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
  context: RouteContext
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const {
    id: businessId,
    productId,
  } = await context.params;

  if (
    !businessId ||
    !productId
  ) {
    return NextResponse.json(
      {
        error:
          "Business ID and product ID are required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const existing =
      await prisma.product.findFirst(
        {
          where: {
            id: productId,
            businessId,
          },
          select: {
            id: true,
            name: true,
            description: true,
            categoryId: true,
            price: true,
            priceMin: true,
            priceMax: true,
            availability: true,
            keywords: true,
            imageUrl: true,
            status: true,
            deletedAt: true,
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

    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
        }
      );
    }

    const payload =
      body as Record<string, unknown>;

    const data: {
      name?: string;
      description?: string | null;
      categoryId?: string | null;
      price?: number | null;
      priceMin?: number | null;
      priceMax?: number | null;
      availability?: Availability;
      keywords?: string[];
      imageUrl?: string | null;
      status?: BusinessStatus;
      deletedAt?: Date | null;
    } = {};

    if ("name" in payload) {
      const name =
        cleanString(
          payload.name
        );

      if (!name) {
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

      data.name = name;
    }

    if ("description" in payload) {
      data.description =
        nullableString(
          payload.description
        );
    }

    if ("categoryId" in payload) {
      const categoryId =
        nullableString(
          payload.categoryId
        );

      if (categoryId) {
        const category =
          await prisma.category.findUnique(
            {
              where: {
                id: categoryId,
              },
              select: {
                id: true,
              },
            }
          );

        if (!category) {
          return NextResponse.json(
            {
              error:
                "Selected category does not exist.",
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

    const price =
      parseOptionalInt(
        payload.price
      );

    if (
      price === undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Price must be a valid integer.",
        },
        {
          status: 400,
        }
      );
    }

    if ("price" in payload) {
      data.price =
        price;
    }

    const priceMin =
      parseOptionalInt(
        payload.priceMin
      );

    if (
      priceMin === undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price must be a valid integer.",
        },
        {
          status: 400,
        }
      );
    }

    if ("priceMin" in payload) {
      data.priceMin =
        priceMin;
    }

    const priceMax =
      parseOptionalInt(
        payload.priceMax
      );

    if (
      priceMax === undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum price must be a valid integer.",
        },
        {
          status: 400,
        }
      );
    }

    if ("priceMax" in payload) {
      data.priceMax =
        priceMax;
    }

    const finalPriceMin =
      "priceMin" in payload
        ? priceMin
        : existing.priceMin;

    const finalPriceMax =
      "priceMax" in payload
        ? priceMax
        : existing.priceMax;

    if (
      finalPriceMin !== null &&
      finalPriceMax !== null &&
      finalPriceMin >
        finalPriceMax
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be greater than maximum price.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      "availability" in
      payload
    ) {
      if (
        !isAvailability(
          payload.availability
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid availability value.",
          },
          {
            status: 400,
          }
        );
      }

      data.availability =
        payload.availability;
    }

    if ("status" in payload) {
      if (
        !isBusinessStatus(
          payload.status
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
        payload.status;
    }

    if ("keywords" in payload) {
      const keywords =
        parseKeywords(
          payload.keywords
        );

      if (!keywords) {
        return NextResponse.json(
          {
            error:
              "Keywords must be an array.",
          },
          {
            status: 400,
          }
        );
      }

      data.keywords =
        keywords;
    }

    let imageUrls:
      | string[]
      | null = null;

    if ("images" in payload) {
      imageUrls =
        parseImages(
          payload.images
        );

      if (!imageUrls) {
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

      data.imageUrl =
        imageUrls[0] ??
        null;
    }

    const updated =
      await prisma.$transaction(
        async (tx) => {
          const product =
            await tx.product.update(
              {
                where: {
                  id: productId,
                },
                data,
              }
            );

          if (
            imageUrls !==
            null
          ) {
            await tx.productImage.deleteMany(
              {
                where: {
                  productId,
                },
              }
            );

            if (
              imageUrls.length >
              0
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
                        publicId:
                          null,
                        sortOrder:
                          index,
                      })
                    ),
                }
              );
            }
          }

          return product;
        }
      );

    const refreshed =
      await getProduct(
        businessId,
        updated.id
      );

    return NextResponse.json({
      success: true,
      product:
        refreshed,
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
  _request: NextRequest,
  context: RouteContext
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const {
    id: businessId,
    productId,
  } = await context.params;

  if (
    !businessId ||
    !productId
  ) {
    return NextResponse.json(
      {
        error:
          "Business ID and product ID are required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const existing =
      await prisma.product.findFirst(
        {
          where: {
            id: productId,
            businessId,
          },
          select: {
            id: true,
            deletedAt: true,
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

    if (existing.deletedAt) {
      return NextResponse.json({
        success: true,
      });
    }

    await prisma.product.update(
      {
        where: {
          id: productId,
        },
        data: {
          deletedAt:
            new Date(),
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