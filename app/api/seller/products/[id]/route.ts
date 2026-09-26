import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function parseOptionalInt(
  value: unknown
): number | null | "INVALID" {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value)
  ) {
    return "INVALID";
  }

  return value;
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

async function getSellerProduct(
  productId: string,
  sellerId: string
) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      deletedAt: null,
      business: {
        ownerId: sellerId,
        deletedAt: null,
      },
    },
    include: {
      category: true,

      images: {
        orderBy: {
          sortOrder: "asc",
        },
      },

      business: {
        select: {
          id: true,
          name: true,
          ownerId: true,
        },
      },
    },
  });
}

/*
 * ----------------------------------------------------
 * GET
 * ----------------------------------------------------
 *
 * Returns one active product belonging to the
 * authenticated seller.
 */
export async function GET(
  _request: Request,
  context: RouteContext
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;

  const productId = cleanString(id);

  if (!productId) {
    return NextResponse.json(
      {
        error: "Product ID is required.",
      },
      {
        status: 400,
        headers: jsonHeaders(),
      }
    );
  }

  try {
    const product =
      await getSellerProduct(
        productId,
        auth.user.id
      );

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    return NextResponse.json({
      product,
    });
  } catch (error) {
    console.error(
      "Seller product fetch error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load product.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/*
 * ----------------------------------------------------
 * PATCH
 * ----------------------------------------------------
 *
 * Updates one active product belonging to the
 * authenticated seller.
 *
 * Seller cannot change:
 * - businessId
 * - status
 * - deletedAt
 * - deletedById
 */
export async function PATCH(
  request: Request,
  context: RouteContext
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;

  const productId = cleanString(id);

  if (!productId) {
    return NextResponse.json(
      {
        error: "Product ID is required.",
      },
      {
        status: 400,
        headers: jsonHeaders(),
      }
    );
  }

  try {
    const product =
      await getSellerProduct(
        productId,
        auth.user.id
      );

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
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
          headers: jsonHeaders(),
        }
      );
    }

    const payload =
      body as Record<string, unknown>;

    const has = (key: string) =>
      Object.prototype.hasOwnProperty.call(
        payload,
        key
      );

    const name = has("name")
      ? cleanString(
          payload.name
        )
      : undefined;

    const description = has(
      "description"
    )
      ? cleanString(
          payload.description
        )
      : undefined;

    const categoryId = has(
      "categoryId"
    )
      ? cleanString(
          payload.categoryId
        )
      : undefined;

    const imageUrl = has(
      "imageUrl"
    )
      ? cleanString(
          payload.imageUrl
        )
      : undefined;

    const availabilityValue =
      has("availability")
        ? cleanString(
            payload.availability
          )
        : undefined;

    if (
      name !== undefined &&
      !name
    ) {
      return NextResponse.json(
        {
          error:
            "Product name cannot be empty.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      availabilityValue !==
        undefined &&
      !ALLOWED_AVAILABILITY.includes(
        availabilityValue as (typeof ALLOWED_AVAILABILITY)[number]
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid availability value.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Price fields.
     */
    const priceProvided =
      has("price");

    const priceMinProvided =
      has("priceMin");

    const priceMaxProvided =
      has("priceMax");

    const price =
      priceProvided
        ? parseOptionalInt(
            payload.price
          )
        : undefined;

    const priceMin =
      priceMinProvided
        ? parseOptionalInt(
            payload.priceMin
          )
        : undefined;

    const priceMax =
      priceMaxProvided
        ? parseOptionalInt(
            payload.priceMax
          )
        : undefined;

    if (
      price === "INVALID" ||
      priceMin === "INVALID" ||
      priceMax === "INVALID"
    ) {
      return NextResponse.json(
        {
          error:
            "Price values must be whole numbers.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      price !== undefined &&
      price !== null &&
      price < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Price cannot be negative.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      priceMin !== undefined &&
      priceMin !== null &&
      priceMin < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be negative.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      priceMax !== undefined &&
      priceMax !== null &&
      priceMax < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum price cannot be negative.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Get current values so a partial PATCH can
     * validate the final pricing combination.
     */
    const currentPricing =
      await prisma.product.findUnique({
        where: {
          id: productId,
        },
        select: {
          price: true,
          priceMin: true,
          priceMax: true,
        },
      });

    if (!currentPricing) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    const resultingPrice: number | null =
      priceProvided
        ? price ?? null
        : currentPricing.price;

    const resultingPriceMin:
      | number
      | null =
      priceMinProvided
        ? priceMin ?? null
        : currentPricing.priceMin;

    const resultingPriceMax:
      | number
      | null =
      priceMaxProvided
        ? priceMax ?? null
        : currentPricing.priceMax;

    if (
      resultingPriceMin !== null &&
      resultingPriceMax !== null &&
      resultingPriceMin >
        resultingPriceMax
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be greater than maximum price.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Validate category when supplied.
     */
    if (categoryId !== undefined) {
      if (categoryId) {
        const category =
          await prisma.category.findFirst(
            {
              where: {
                id: categoryId,
                isActive: true,
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
                "Selected category is invalid or inactive.",
            },
            {
              status: 400,
              headers: jsonHeaders(),
            }
          );
        }
      }
    }

    /*
     * Build a seller-safe update object.
     */
    const updateData: {
      name?: string;
      description?: string | null;
      categoryId?: string | null;
      price?: number | null;
      priceMin?: number | null;
      priceMax?: number | null;
      availability?:
        | "AVAILABLE"
        | "ASK_SELLER"
        | "UNAVAILABLE";
      imageUrl?: string | null;
    } = {};

    if (name !== undefined) {
      updateData.name =
        name;
    }

    if (
      description !==
      undefined
    ) {
      updateData.description =
        description || null;
    }

    if (
      categoryId !==
      undefined
    ) {
      updateData.categoryId =
        categoryId || null;
    }

    if (priceProvided) {
      updateData.price =
        resultingPrice;
    }

    if (priceMinProvided) {
      updateData.priceMin =
        resultingPriceMin;
    }

    if (priceMaxProvided) {
      updateData.priceMax =
        resultingPriceMax;
    }

    if (
      availabilityValue !==
      undefined
    ) {
      updateData.availability =
        availabilityValue as
          | "AVAILABLE"
          | "ASK_SELLER"
          | "UNAVAILABLE";
    }

    if (imageUrl !== undefined) {
      updateData.imageUrl =
        imageUrl || null;
    }

    const updatedProduct =
      await prisma.product.update({
        where: {
          id: productId,
        },

        data: updateData,

        include: {
          category: true,

          images: {
            orderBy: {
              sortOrder: "asc",
            },
          },
        },
      });

    return NextResponse.json({
      message:
        "Product updated successfully.",

      product: updatedProduct,
    });
  } catch (error) {
    console.error(
      "Seller product update error:",
      error
    );

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "Product could not be found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to update product.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/*
 * ----------------------------------------------------
 * DELETE
 * ----------------------------------------------------
 *
 * SOFT DELETES the seller's product.
 *
 * The database record remains available to admins.
 */
export async function DELETE(
  _request: Request,
  context: RouteContext
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;

  const productId = cleanString(id);

  if (!productId) {
    return NextResponse.json(
      {
        error:
          "Product ID is required.",
      },
      {
        status: 400,
        headers: jsonHeaders(),
      }
    );
  }

  try {
    const product =
      await prisma.product.findFirst({
        where: {
          id: productId,
          deletedAt: null,
          business: {
            ownerId: auth.user.id,
            deletedAt: null,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * IMPORTANT:
     * This is a soft delete.
     *
     * The product remains in the database and
     * is marked with deletedAt + deletedById.
     */
    const deletedProduct =
      await prisma.product.update({
        where: {
          id: product.id,
        },

        data: {
          deletedAt:
            new Date(),

          deletedById:
            auth.user.id,
        },

        select: {
          id: true,
          name: true,
          deletedAt: true,
          deletedById: true,
        },
      });

    return NextResponse.json({
      message:
        "Product deleted successfully.",

      product:
        deletedProduct,
    });
  } catch (error) {
    console.error(
      "Seller product deletion error:",
      error
    );

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "Product could not be found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to delete product.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}