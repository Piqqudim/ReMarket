import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "PENDING",
] as const;

const VALID_AVAILABILITIES = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

type ProductStatus =
  (typeof VALID_STATUSES)[number];

type ProductAvailability =
  (typeof VALID_AVAILABILITIES)[number];

function isProductStatus(
  value: string
): value is ProductStatus {
  return VALID_STATUSES.includes(
    value as ProductStatus
  );
}

function isProductAvailability(
  value: string
): value is ProductAvailability {
  return VALID_AVAILABILITIES.includes(
    value as ProductAvailability
  );
}

export async function GET(
  request: NextRequest
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(
      request.url
    );

    const q =
      searchParams.get("q")?.trim() ?? "";

    const status =
      searchParams.get("status") ?? "";

    const availability =
      searchParams.get("availability") ?? "";

    const where: Prisma.ProductWhereInput = {};

    if (isProductStatus(status)) {
      where.status = status;
    }

    if (isProductAvailability(availability)) {
      where.availability = availability;
    }

    if (q) {
      where.OR = [
        {
          name: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          business: {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
        {
          business: {
            location: {
              area: {
                contains: q,
                mode: "insensitive",
              },
            },
          },
        },
        {
          category: {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    const products =
      await prisma.product.findMany({
        where,

        orderBy: {
          updatedAt: "desc",
        },

        include: {
          business: {
            select: {
              id: true,
              name: true,
              deletedAt: true,

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
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        availability: product.availability,
        status: product.status,
        imageUrl: product.imageUrl,
        deletedAt: product.deletedAt,

        business: {
          id: product.business.id,
          name: product.business.name,
          area:
            product.business.location?.area ??
            "Location not added",
          deletedAt:
            product.business.deletedAt,
        },

        category:
          product.category?.name ?? null,

        updatedAt: product.updatedAt,
      })),
    });
  } catch (error) {
    console.error(
      "Admin products GET error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to load admin products",
      },
      {
        status: 500,
      }
    );
  }
}