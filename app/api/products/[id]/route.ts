import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_PRODUCT_ID_LENGTH = 100;
const RELATED_PRODUCT_LIMIT = 6;

function responseHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}

function jsonError(
  message: string,
  status: number,
  headers?: HeadersInit
) {
  return NextResponse.json(
    { error: message },
    { status, headers: responseHeaders(headers) }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimit = checkPublicRateLimit(request, "featured");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many product requests. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  try {
    const { id } = await params;

    if (!id || id.length > MAX_PRODUCT_ID_LENGTH) {
      return jsonError("Invalid product ID.", 400, rateLimit.headers);
    }

    const product = await prisma.product.findFirst({
      where: {
        id,
        status: "ACTIVE",
        deletedAt: null,
        business: {
          is: {
            status: "ACTIVE",
            deletedAt: null,
          },
        },
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
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
        images: {
          select: {
            id: true,
            url: true,
            sortOrder: true,
          },
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        },
        business: {
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
                area: true,
                street: true,
              },
            },
            categories: {
              where: {
                category: { isActive: true },
              },
              select: {
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      return jsonError("Product not found.", 404, rateLimit.headers);
    }

    const relatedProducts = await prisma.product.findMany({
      where: {
        businessId: product.business.id,
        id: { not: product.id },
        status: "ACTIVE",
        deletedAt: null,
        business: {
          is: {
            status: "ACTIVE",
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        name: true,
        price: true,
        priceMin: true,
        priceMax: true,
        availability: true,
        imageUrl: true,
        images: {
          select: {
            id: true,
            url: true,
            sortOrder: true,
          },
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
          take: 1,
        },
        category: {
          select: {
            name: true,
            isActive: true,
          },
        },
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: RELATED_PRODUCT_LIMIT,
    });

    return NextResponse.json(
      {
        product: {
          ...product,
          category:
            product.category?.isActive
              ? {
                  id: product.category.id,
                  name: product.category.name,
                }
              : null,
          business: {
            ...product.business,
            categories: product.business.categories.map(
              (item) => item.category
            ),
            verified: product.business.verification === "VERIFIED",
          },
        },
        relatedProducts: relatedProducts.map((related) => ({
          ...related,
          category:
            related.category?.isActive
              ? { name: related.category.name }
              : null,
        })),
      },
      { headers: responseHeaders(rateLimit.headers) }
    );
  } catch (error) {
    console.error("Public product detail API error:", error);
    return jsonError(
      "Unable to load this product. Please try again.",
      500,
      rateLimit.headers
    );
  }
}
