import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

type Availability =
  (typeof ALLOWED_AVAILABILITY)[number];

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function hasOwn(
  payload: Record<string, unknown>,
  key: string
): boolean {
  return Object.prototype.hasOwnProperty.call(
    payload,
    key
  );
}

function isAvailability(
  value: string
): value is Availability {
  return ALLOWED_AVAILABILITY.includes(
    value as Availability
  );
}

function parseOptionalInteger(
  value: unknown
): {
  valid: boolean;
  value: number | null;
} {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      valid: true,
      value: null,
    };
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed)
  ) {
    return {
      valid: false,
      value: null,
    };
  }

  return {
    valid: true,
    value: parsed,
  };
}

function parseKeywords(
  value: unknown
): {
  valid: boolean;
  value: string[];
} {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;

  if (!values) {
    return {
      valid: false,
      value: [],
    };
  }

  const keywords: string[] = [];

  for (const item of values) {
    if (typeof item !== "string") {
      return {
        valid: false,
        value: [],
      };
    }

    const cleaned = item.trim();

    if (!cleaned) {
      continue;
    }

    if (!keywords.includes(cleaned)) {
      keywords.push(cleaned);
    }
  }

  return {
    valid: true,
    value: keywords,
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
        },
      },
    },
  });
}

/* --------------------------------------------------
 * GET
 * -------------------------------------------------- */

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } =
      await context.params;

    if (!id) {
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

    const product =
      await getSellerProduct(
        id,
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

    return NextResponse.json(
      {
        product,
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller product GET error:",
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

/* --------------------------------------------------
 * PATCH
 * -------------------------------------------------- */

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } =
      await context.params;

    if (!id) {
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

    const existing =
      await getSellerProduct(
        id,
        auth.user.id
      );

    if (!existing) {
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

    if (!isRecord(body)) {
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

    if (
      Object.keys(body).length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No changes were supplied.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const data: {
      name?: string;
      description?: string | null;
      categoryId?: string | null;
      imageUrl?: string | null;
      availability?: Availability;
      price?: number | null;
      priceMin?: number | null;
      priceMax?: number | null;
      keywords?: string[];
    } = {};

    if (hasOwn(body, "name")) {
      const name = cleanString(
        body.name
      );

      if (!name) {
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

      if (name.length > 200) {
        return NextResponse.json(
          {
            error:
              "Product name is too long.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      data.name = name;
    }

    if (
      hasOwn(body, "description")
    ) {
      const description =
        cleanString(body.description);

      if (description.length > 2000) {
        return NextResponse.json(
          {
            error:
              "Product description is too long.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      data.description =
        description || null;
    }

    if (
      hasOwn(body, "imageUrl")
    ) {
      if (
        body.imageUrl !== null &&
        typeof body.imageUrl !==
          "string"
      ) {
        return NextResponse.json(
          {
            error:
              "Image URL must be a string or null.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      const imageUrl =
        body.imageUrl === null
          ? ""
          : cleanString(
              body.imageUrl
            );

      if (imageUrl.length > 2000) {
        return NextResponse.json(
          {
            error:
              "Image URL is too long.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      data.imageUrl =
        imageUrl || null;
    }

    if (
      hasOwn(body, "availability")
    ) {
      const availability =
        cleanString(
          body.availability
        );

      if (
        !isAvailability(
          availability
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

      data.availability =
        availability;
    }

    if (
      hasOwn(body, "keywords")
    ) {
      const keywordsResult =
        parseKeywords(
          body.keywords
        );

      if (
        !keywordsResult.valid
      ) {
        return NextResponse.json(
          {
            error:
              "Keywords must be an array of strings or a comma-separated string.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      data.keywords =
        keywordsResult.value;
    }

    if (hasOwn(body, "categoryId")) {
      if (
        body.categoryId !== null &&
        typeof body.categoryId !==
          "string"
      ) {
        return NextResponse.json(
          {
            error:
              "Category ID must be a string or null.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      const categoryId =
        body.categoryId === null
          ? ""
          : cleanString(
              body.categoryId
            );

      if (!categoryId) {
        data.categoryId = null;
      } else {
        const category =
          await prisma.category.findFirst({
            where: {
              id: categoryId,
              isActive: true,
            },
            select: {
              id: true,
            },
          });

        if (!category) {
          return NextResponse.json(
            {
              error:
                "Selected category was not found or is inactive.",
            },
            {
              status: 400,
              headers: jsonHeaders(),
            }
          );
        }

        data.categoryId =
          category.id;
      }
    }

    if (hasOwn(body, "price")) {
      const result =
        parseOptionalInteger(
          body.price
        );

      if (!result.valid) {
        return NextResponse.json(
          {
            error:
              "Price must be a valid whole number.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      if (
        result.value !== null &&
        result.value < 0
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

      data.price = result.value;
    }

    if (hasOwn(body, "priceMin")) {
      const result =
        parseOptionalInteger(
          body.priceMin
        );

      if (!result.valid) {
        return NextResponse.json(
          {
            error:
              "Minimum price must be a valid whole number.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      if (
        result.value !== null &&
        result.value < 0
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

      data.priceMin =
        result.value;
    }

    if (hasOwn(body, "priceMax")) {
      const result =
        parseOptionalInteger(
          body.priceMax
        );

      if (!result.valid) {
        return NextResponse.json(
          {
            error:
              "Maximum price must be a valid whole number.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      if (
        result.value !== null &&
        result.value < 0
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

      data.priceMax =
        result.value;
    }

    const finalPriceMin =
      data.priceMin ??
      existing.priceMin;

    const finalPriceMax =
      data.priceMax ??
      existing.priceMax;

    if (
      finalPriceMin !== null &&
      finalPriceMax !== null &&
      finalPriceMin > finalPriceMax
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

    const product =
      await prisma.product.update({
        where: {
          id: existing.id,
        },

        data,

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
            },
          },
        },
      });

    return NextResponse.json(
      {
        message:
          "Product updated successfully.",
        product,
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller product PATCH error:",
      error
    );

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

/* --------------------------------------------------
 * DELETE
 *
 * Soft delete only.
 * -------------------------------------------------- */

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } =
      await context.params;

    if (!id) {
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

    const product =
      await getSellerProduct(
        id,
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

    const deletedAt =
      new Date();

    const result =
      await prisma.product.updateMany({
        where: {
          id: product.id,
          deletedAt: null,
        },

        data: {
          deletedAt,
          deletedById:
            auth.user.id,
        },
      });

    if (result.count !== 1) {
      return NextResponse.json(
        {
          error:
            "Product could not be deleted because it was already deleted.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        message:
          "Product deleted successfully.",

        productId: product.id,

        deletedAt:
          deletedAt.toISOString(),
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller product DELETE error:",
      error
    );

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