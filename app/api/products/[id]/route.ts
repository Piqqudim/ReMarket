
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
  headers?: HeadersInit,
) {
  return NextResponse.json(
    { product: null, relatedProducts: [], error: message },
    {
      status,
      headers: responseHeaders(headers),
    },
  );
}

function normalizeNigerianPhone(value: string): string {
  let clean = value.trim().replace(/[^\d+]/g, "");

  if (!clean) return "";
  if (clean.startsWith("00")) clean = clean.slice(2);
  if (clean.startsWith("+")) clean = clean.slice(1);
  if (clean.startsWith("234")) return `+${clean}`;
  if (clean.startsWith("0")) return `+234${clean.slice(1)}`;

  return `+234${clean}`;
}

function normalizeSocialHandle(
  platform: string,
  handle: string,
): string {
  const clean = handle.trim();
  if (!clean) return "";

  if (platform === "PHONE" || platform === "WHATSAPP") {
    if (
      clean.startsWith("http://") ||
      clean.startsWith("https://")
    ) {
      return clean;
    }

    return normalizeNigerianPhone(clean);
  }

  return clean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimit = checkPublicRateLimit(request, "featured");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many product requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const { id } = await params;

    if (!id || id.length > MAX_PRODUCT_ID_LENGTH) {
      return jsonError(
        "Invalid product ID.",
        400,
        rateLimit.headers,
      );
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
            iconKey: true,
            sortOrder: true,
          },
        },

        images: {
          select: {
            id: true,
            url: true,
            publicId: true,
            sortOrder: true,
            createdAt: true,
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
            phone: true,
            availability: true,
            verification: true,
            showContactInfo: true,

            location: {
              select: {
                id: true,
                area: true,
                street: true,
                address: true,
                verification: true,
              },
            },

            categories: {
              where: {
                category: {
                  isActive: true,
                },
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

            socialLinks: {
              select: {
                id: true,
                platform: true,
                handle: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      return jsonError(
        "Product not found.",
        404,
        rateLimit.headers,
      );
    }

    const seller = product.business;
    const showContactInfo = seller.showContactInfo === true;

    // CONTACT PRIVACY: contact information is only formatted when public.
    const socialLinks = showContactInfo
      ? seller.socialLinks.map((link) => ({
          id: link.id,
          platform: link.platform,
          handle: normalizeSocialHandle(
            link.platform,
            link.handle,
          ),
        }))
      : [];

    // Support older manually onboarded sellers with a Business.phone value.
    if (
      showContactInfo &&
      seller.phone &&
      !socialLinks.some((link) => link.platform === "PHONE")
    ) {
      socialLinks.push({
        id: `legacy-phone-${seller.id}`,
        platform: "PHONE",
        handle: normalizeNigerianPhone(seller.phone),
      });
    }

    const sellerCategories = seller.categories.map(
      (item) => ({
        id: item.category.id,
        name: item.category.name,
      }),
    );

    const relatedProducts = await prisma.product.findMany({
      where: {
        businessId: seller.id,
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
        description: true,
        price: true,
        priceMin: true,
        priceMax: true,
        availability: true,
        imageUrl: true,

        images: {
          select: {
            id: true,
            url: true,
            publicId: true,
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
            id: true,
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

    const formattedProduct = {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      priceMin: product.priceMin,
      priceMax: product.priceMax,
      availability: product.availability,
      imageUrl: product.imageUrl,
      keywords: product.keywords,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,

      category: product.category?.isActive
        ? {
            id: product.category.id,
            name: product.category.name,
            iconKey: product.category.iconKey,
            sortOrder: product.category.sortOrder,
          }
        : null,

      images: product.images.map((image) => ({
        id: image.id,
        url: image.url,
        publicId: image.publicId,
        sortOrder: image.sortOrder,
      })),

      // Seller is supporting information, not a separate listing.
      seller: {
        id: seller.id,
        name: seller.name,
        ownerName: seller.ownerName,
        description: seller.description,
        imageUrl: seller.imageUrl,
        availability: seller.availability,
        verification: seller.verification,
        verified: seller.verification === "VERIFIED",
        showContactInfo,
        location: seller.location
          ? {
              id: seller.location.id,
              area: seller.location.area,
              street: seller.location.street,
              address: seller.location.address,
              verification: seller.location.verification,
            }
          : null,
        categories: sellerCategories,
        category: sellerCategories[0]?.name ?? "Uncategorised",
        socialLinks,
      },
    };

    const formattedRelatedProducts = relatedProducts.map((related) => ({
      id: related.id,
      name: related.name,
      description: related.description,
      price: related.price,
      priceMin: related.priceMin,
      priceMax: related.priceMax,
      availability: related.availability,
      imageUrl: related.imageUrl,

      images: related.images.map((image) => ({
        id: image.id,
        url: image.url,
        publicId: image.publicId,
        sortOrder: image.sortOrder,
      })),

      category: related.category?.isActive
        ? {
            id: related.category.id,
            name: related.category.name,
          }
        : null,
    }));

    return NextResponse.json(
      {
        product: formattedProduct,
        relatedProducts: formattedRelatedProducts,
      },
      {
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Public Product Details API error:", error);

    return jsonError(
      "Unable to load this product. Please try again.",
      500,
      rateLimit.headers,
    );
  }
}
