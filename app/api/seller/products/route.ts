import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";

const MAX_ACTIVE_PRODUCTS = 30;

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

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

/*
 * ----------------------------------------------------
 * GET
 * ----------------------------------------------------
 *
 * Returns all active (not soft-deleted) products
 * belonging to the authenticated seller's business.
 */
export async function GET() {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const business =
      await prisma.business.findUnique({
        where: {
          ownerId: auth.user.id,
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

    if (!business) {
      return NextResponse.json(
        {
          error:
            "You do not have a business linked to this seller account.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    if (business.deletedAt) {
      return NextResponse.json(
        {
          error:
            "This business has been deleted.",
        },
        {
          status: 410,
          headers: jsonHeaders(),
        }
      );
    }

    const products =
      await prisma.product.findMany({
        where: {
          businessId: business.id,
          deletedAt: null,
        },
        orderBy: {
          updatedAt: "desc",
        },
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
      products,
      activeProductCount:
        products.length,
      maxActiveProducts:
        MAX_ACTIVE_PRODUCTS,
      remainingSlots:
        Math.max(
          0,
          MAX_ACTIVE_PRODUCTS -
            products.length
        ),
    });
  } catch (error) {
    console.error(
      "Seller products fetch error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load products.",
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
 * POST
 * ----------------------------------------------------
 *
 * Creates a product under the authenticated
 * seller's own business.
 *
 * Maximum active products per business:
 * 30
 *
 * Soft-deleted products do NOT count toward
 * this limit.
 */
export async function POST(
  request: Request
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
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

    /*
     * Find the seller-owned business.
     *
     * Never trust a businessId sent by
     * the client.
     */
    const business =
      await prisma.business.findUnique({
        where: {
          ownerId: auth.user.id,
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

    if (!business) {
      return NextResponse.json(
        {
          error:
            "You do not have a business linked to this seller account.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    if (business.deletedAt) {
      return NextResponse.json(
        {
          error:
            "This business has been deleted.",
        },
        {
          status: 410,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------------
     * 30-PRODUCT LIMIT
     * -----------------------------------------------
     *
     * Only products with deletedAt = null count.
     * A soft-deleted product therefore frees a slot.
     */
    const activeProductCount =
      await prisma.product.count({
        where: {
          businessId: business.id,
          deletedAt: null,
        },
      });

    if (
      activeProductCount >=
      MAX_ACTIVE_PRODUCTS
    ) {
      return NextResponse.json(
        {
          error:
            `You have reached the maximum of ${MAX_ACTIVE_PRODUCTS} active products.`,

          activeProductCount,

          maxActiveProducts:
            MAX_ACTIVE_PRODUCTS,

          remainingSlots: 0,
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    const name = cleanString(
      payload.name
    );

    const description = cleanString(
      payload.description
    );

    const categoryId =
      cleanString(
        payload.categoryId
      );

    const imageUrl = cleanString(
      payload.imageUrl
    );

    const availabilityValue =
      cleanString(
        payload.availability
      );

    const keywords = Array.isArray(
      payload.keywords
    )
      ? [
          ...new Set(
            payload.keywords
              .filter(
                (
                  value
                ): value is string =>
                  typeof value ===
                    "string" &&
                  value.trim().length >
                    0
              )
              .map((value) =>
                value.trim()
              )
          ),
        ]
      : [];

    /*
     * Basic validation.
     */
    if (!name) {
      return NextResponse.json(
        {
          error:
            "Product name is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      availabilityValue &&
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
     * Product pricing.
     */
    const price =
      parseOptionalInt(
        payload.price
      );

    const priceMin =
      parseOptionalInt(
        payload.priceMin
      );

    const priceMax =
      parseOptionalInt(
        payload.priceMax
      );

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

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin > priceMax
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
     * Validate category only when supplied.
     *
     * Sellers can only select active categories.
     */
    if (categoryId) {
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
              "Selected category is invalid or inactive.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }
    }

    const product =
      await prisma.product.create({
        data: {
          businessId:
            business.id,

          name,

          description:
            description || null,

          categoryId:
            categoryId || null,

          price,

          priceMin,

          priceMax,

          availability:
            (availabilityValue ||
              "ASK_SELLER") as
              | "AVAILABLE"
              | "ASK_SELLER"
              | "UNAVAILABLE",

          keywords,

          imageUrl:
            imageUrl || null,

          /*
           * New seller products are active
           * and are not soft-deleted.
           */
          status: "ACTIVE",

          deletedAt: null,
        },

        include: {
          category: true,

          images: {
            orderBy: {
              sortOrder: "asc",
            },
          },
        },
      });

    return NextResponse.json(
      {
        message:
          "Product created successfully.",

        product,

        activeProductCount:
          activeProductCount + 1,

        maxActiveProducts:
          MAX_ACTIVE_PRODUCTS,

        remainingSlots:
          MAX_ACTIVE_PRODUCTS -
          (activeProductCount + 1),
      },
      {
        status: 201,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller product creation error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to create product.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}