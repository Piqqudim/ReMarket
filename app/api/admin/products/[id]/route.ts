import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const AVAILABILITIES = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

const STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "PENDING",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Product ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const body = await request.json();

    const existingProduct =
      await prisma.product.findUnique({
        where: {
          id,
        },
      });

    if (!existingProduct) {
      return NextResponse.json(
        {
          error: "Product not found",
        },
        {
          status: 404,
        }
      );
    }

    const data: {
      name?: string;
      description?: string | null;
      price?: number | null;
      priceMin?: number | null;
      priceMax?: number | null;
      availability?:
        | "AVAILABLE"
        | "ASK_SELLER"
        | "UNAVAILABLE";
      status?: "ACTIVE" | "INACTIVE" | "PENDING";
      imageUrl?: string | null;
    } = {};

    if (body.name !== undefined) {
      if (
        typeof body.name !== "string" ||
        !body.name.trim()
      ) {
        return NextResponse.json(
          {
            error: "Product name must be a non-empty string",
          },
          {
            status: 400,
          }
        );
      }

      data.name = body.name.trim();
    }

    if (body.description !== undefined) {
      if (
        body.description !== null &&
        typeof body.description !== "string"
      ) {
        return NextResponse.json(
          {
            error: "Description must be a string or null",
          },
          {
            status: 400,
          }
        );
      }

      data.description =
        body.description === null
          ? null
          : body.description.trim();
    }

    if (body.price !== undefined) {
      if (
        body.price !== null &&
        (!Number.isInteger(body.price) ||
          body.price < 0)
      ) {
        return NextResponse.json(
          {
            error: "Price must be a non-negative integer or null",
          },
          {
            status: 400,
          }
        );
      }

      data.price = body.price;
    }

    if (body.priceMin !== undefined) {
      if (
        body.priceMin !== null &&
        (!Number.isInteger(body.priceMin) ||
          body.priceMin < 0)
      ) {
        return NextResponse.json(
          {
            error:
              "Minimum price must be a non-negative integer or null",
          },
          {
            status: 400,
          }
        );
      }

      data.priceMin = body.priceMin;
    }

    if (body.priceMax !== undefined) {
      if (
        body.priceMax !== null &&
        (!Number.isInteger(body.priceMax) ||
          body.priceMax < 0)
      ) {
        return NextResponse.json(
          {
            error:
              "Maximum price must be a non-negative integer or null",
          },
          {
            status: 400,
          }
        );
      }

      data.priceMax = body.priceMax;
    }

    if (body.priceMin !== undefined && body.priceMax !== undefined) {
      if (
        body.priceMin !== null &&
        body.priceMax !== null &&
        body.priceMin > body.priceMax
      ) {
        return NextResponse.json(
          {
            error:
              "Minimum price cannot be greater than maximum price",
          },
          {
            status: 400,
          }
        );
      }
    }

    if (body.availability !== undefined) {
      if (
        !AVAILABILITIES.includes(body.availability)
      ) {
        return NextResponse.json(
          {
            error: "Invalid availability",
          },
          {
            status: 400,
          }
        );
      }

      data.availability = body.availability;
    }

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json(
          {
            error: "Invalid product status",
          },
          {
            status: 400,
          }
        );
      }

      data.status = body.status;
    }

    if (body.imageUrl !== undefined) {
      if (
        body.imageUrl !== null &&
        typeof body.imageUrl !== "string"
      ) {
        return NextResponse.json(
          {
            error: "Image URL must be a string or null",
          },
          {
            status: 400,
          }
        );
      }

      data.imageUrl = body.imageUrl;
    }

    const product = await prisma.product.update({
      where: {
        id,
      },
      data,

      include: {
        business: {
          select: {
            id: true,
            name: true,
            location: {
              select: {
                area: true,
              },
            },
          },
        },

        category: {
          select: {
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        availability: product.availability,
        status: product.status,
        imageUrl: product.imageUrl,

        business: {
          id: product.business.id,
          name: product.business.name,
          area:
            product.business.location?.area ??
            "Location not added",
        },

        category: product.category?.name ?? null,
        updatedAt: product.updatedAt,
      },
    });
  } catch (error) {
    console.error("Admin product PATCH error:", error);

    return NextResponse.json(
      {
        error: "Unable to update product",
      },
      {
        status: 500,
      }
    );
  }
}