import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);

    const q = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status") ?? "";
    const availability = searchParams.get("availability") ?? "";

    const products = await prisma.product.findMany({
      where: {
        ...(status &&
          ["ACTIVE", "INACTIVE", "PENDING"].includes(status)
          ? {
              status: status as
                | "ACTIVE"
                | "INACTIVE"
                | "PENDING",
            }
          : {}),

        ...(availability &&
          ["AVAILABLE", "ASK_SELLER", "UNAVAILABLE"].includes(
            availability
          )
          ? {
              availability: availability as
                | "AVAILABLE"
                | "ASK_SELLER"
                | "UNAVAILABLE",
            }
          : {}),

        ...(q
          ? {
              OR: [
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
              ],
            }
          : {}),
      },

      orderBy: {
        updatedAt: "desc",
      },

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

        business: {
          id: product.business.id,
          name: product.business.name,
          area:
            product.business.location?.area ??
            "Location not added",
        },

        category: product.category?.name ?? null,
        updatedAt: product.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Admin products GET error:", error);

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