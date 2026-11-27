import { Prisma } from "@prisma/client";
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

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { product: null, relatedProducts: [], error: message },
    { status, headers: responseHeaders(headers) },
  );
}

function toMoneyNumber(value: unknown): number | null {
  let amount: number;

  if (typeof value === "number") {
    amount = value;
  } else if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "");
    if (!normalized) return null;
    amount = Number(normalized);
  } else if (typeof value === "bigint") {
    amount = Number(value);
    if (!Number.isSafeInteger(amount)) return null;
  } else if (typeof value === "object" && value !== null) {
    const decimal = value as { toNumber?: () => number };
    if (typeof decimal.toNumber !== "function") return null;
    try {
      amount = decimal.toNumber();
    } catch {
      return null;
    }
  } else {
    return null;
  }

  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function getDisplayOriginalPrice(
  price: unknown,
  originalPrice: unknown,
): number | null {
  const current = toMoneyNumber(price);
  const original = toMoneyNumber(originalPrice);
  return current !== null && current > 0 && original !== null && original > current
    ? original
    : null;
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

function normalizeSocialHandle(platform: string, handle: string): string {
  const clean = handle.trim();
  if (!clean) return "";
  if (platform === "PHONE" || platform === "WHATSAPP") {
    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
    return normalizeNigerianPhone(clean);
  }
  return clean;
}

type CategorySummary = {
  id: string;
  name: string;
  isActive: boolean;
  parentId: string | null;
  imageUrl?: string | null;
  iconKey?: string;
  sortOrder?: number;
  parent: {
    id: string;
    name: string;
    isActive: boolean;
    imageUrl?: string | null;
    iconKey?: string;
    sortOrder?: number;
  } | null;
};

const relatedProductSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  originalPrice: true,
  stockQuantity: true,
  availability: true,
  imageUrl: true,
  images: {
    select: { id: true, url: true, publicId: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
  },
  category: {
    select: {
      id: true,
      name: true,
      isActive: true,
      parentId: true,
      imageUrl: true,
      iconKey: true,
      sortOrder: true,
      parent: {
        select: {
          id: true,
          name: true,
          isActive: true,
          imageUrl: true,
          iconKey: true,
          sortOrder: true,
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

type RelatedProductRow = Prisma.ProductGetPayload<{
  select: typeof relatedProductSelect;
}>;

function buildRelatedProductWhere(
  productId: string,
  excludedIds: string[],
  businessId: string,
  categoryId: string | null,
  area?: string | null,
): Prisma.ProductWhereInput {
  return {
    id: { notIn: [productId, ...excludedIds] },
    businessId: { not: businessId },
    status: "ACTIVE",
    deletedAt: null,
    ...(categoryId
      ? { category: { is: { id: categoryId, isActive: true } } }
      : {}),
    business: {
      is: {
        status: "ACTIVE",
        deletedAt: null,
        ...(area ? { location: { is: { area } } } : {}),
      },
    },
  };
}

function formatCategory(category: CategorySummary | null) {
  if (!category?.isActive) return null;

  const parent = category.parent?.isActive ? category.parent : null;

  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    imageUrl: category.imageUrl ?? null,
    ...(category.iconKey !== undefined ? { iconKey: category.iconKey } : {}),
    ...(category.sortOrder !== undefined ? { sortOrder: category.sortOrder } : {}),
    parent: parent
      ? {
          id: parent.id,
          name: parent.name,
          imageUrl: parent.imageUrl ?? null,
          ...(parent.iconKey !== undefined ? { iconKey: parent.iconKey } : {}),
          ...(parent.sortOrder !== undefined ? { sortOrder: parent.sortOrder } : {}),
        }
      : null,
  };
}

function formatRelatedProduct(related: RelatedProductRow) {
  return {
    id: related.id,
    name: related.name,
    description: related.description,
    price: toMoneyNumber(related.price),
    originalPrice: getDisplayOriginalPrice(related.price, related.originalPrice),
    stockQuantity: related.stockQuantity,
    availability: related.availability,
    imageUrl: related.imageUrl ?? related.images[0]?.url ?? null,
    images: related.images.map((image) => ({
      id: image.id,
      url: image.url,
      publicId: image.publicId,
      sortOrder: image.sortOrder,
    })),
    category: formatCategory(related.category),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rateLimit = checkPublicRateLimit(request, "product-details");
  if (!rateLimit.allowed) {
    return jsonError(
      "Too many product requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const { id } = await params;
    const productId = typeof id === "string" ? id.trim() : "";
    if (!productId || productId.length > MAX_PRODUCT_ID_LENGTH) {
      return jsonError("Invalid product ID.", 400, rateLimit.headers);
    }

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        status: "ACTIVE",
        deletedAt: null,
        business: { is: { status: "ACTIVE", deletedAt: null } },
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        originalPrice: true,
        stockQuantity: true,
        availability: true,
        imageUrl: true,
        keywords: true,
        shippingWeightKg: true,
        shippingLengthCm: true,
        shippingWidthCm: true,
        shippingHeightCm: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: {
            id: true,
            name: true,
            isActive: true,
            iconKey: true,
            imageUrl: true,
            sortOrder: true,
            parentId: true,
            parent: {
              select: {
                id: true,
                name: true,
                isActive: true,
                imageUrl: true,
                iconKey: true,
                sortOrder: true,
              },
            },
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
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
              where: { category: { isActive: true } },
              select: {
                category: {
                  select: {
                    id: true,
                    name: true,
                    isActive: true,
                    parentId: true,
                    imageUrl: true,
                    iconKey: true,
                    sortOrder: true,
                    parent: {
                      select: {
                        id: true,
                        name: true,
                        isActive: true,
                        imageUrl: true,
                        iconKey: true,
                        sortOrder: true,
                      },
                    },
                  },
                },
              },
            },
            socialLinks: {
              select: { id: true, platform: true, handle: true },
            },
          },
        },
      },
    });

    if (!product) {
      return jsonError("Product not found.", 404, rateLimit.headers);
    }

    const seller = product.business;
    const showContactInfo = seller.showContactInfo === true;
    const socialLinks = showContactInfo
      ? seller.socialLinks
          .map((link) => ({
            id: link.id,
            platform: link.platform,
            handle: normalizeSocialHandle(link.platform, link.handle),
          }))
          .filter((link) => Boolean(link.handle))
      : [];

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

    const businessCategories = seller.categories
      .map((item) => formatCategory(item.category))
      .filter((category): category is NonNullable<typeof category> => category !== null);

    const sellerCategories = businessCategories.map((category) => ({
      id: category.id,
      name: category.name,
    }));
    const [productRating, productReviewCount] = await Promise.all([
      prisma.productReview.aggregate({ where: { productId: product.id, status: "PUBLISHED" }, _avg: { rating: true } }),
      prisma.productReview.count({ where: { productId: product.id, status: "PUBLISHED" } }),
    ]);
    const hasShippingMeasurements = [
      product.shippingWeightKg,
      product.shippingLengthCm,
      product.shippingWidthCm,
      product.shippingHeightCm,
    ].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
    const isPurchaseReady = product.availability === "AVAILABLE" &&
      product.price !== null && Number.isSafeInteger(product.price) && product.price > 0 &&
      hasShippingMeasurements &&
      (product.stockQuantity === null || (Number.isSafeInteger(product.stockQuantity) && product.stockQuantity > 0));

    const activeCategoryId = product.category?.isActive
      ? product.category.id
      : null;

    const preferredRelatedProducts = await prisma.product.findMany({
      where: buildRelatedProductWhere(
        product.id,
        [],
        seller.id,
        activeCategoryId,
        seller.location?.area,
      ),
      select: relatedProductSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RELATED_PRODUCT_LIMIT,
    });

    let relatedRows: RelatedProductRow[] = [...preferredRelatedProducts];

    if (relatedRows.length < RELATED_PRODUCT_LIMIT) {
      const existingIds = relatedRows.map((item) => item.id);
      const broaderRelatedProducts = await prisma.product.findMany({
        where: buildRelatedProductWhere(
          product.id,
          existingIds,
          seller.id,
          activeCategoryId,
        ),
        select: relatedProductSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: RELATED_PRODUCT_LIMIT - relatedRows.length,
      });
      relatedRows = [...relatedRows, ...broaderRelatedProducts];
    }

    if (relatedRows.length < RELATED_PRODUCT_LIMIT) {
      const existingIds = relatedRows.map((item) => item.id);
      const sameSellerProducts = await prisma.product.findMany({
        where: {
          id: { notIn: [product.id, ...existingIds] },
          businessId: seller.id,
          status: "ACTIVE",
          deletedAt: null,
          business: { is: { status: "ACTIVE", deletedAt: null } },
        },
        select: relatedProductSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: RELATED_PRODUCT_LIMIT - relatedRows.length,
      });
      relatedRows = [...relatedRows, ...sameSellerProducts];
    }

    const formattedProduct = {
      id: product.id,
      name: product.name,
      description: product.description,
      price: toMoneyNumber(product.price),
      originalPrice: getDisplayOriginalPrice(product.price, product.originalPrice),
      stockQuantity: product.stockQuantity,
      availability: product.availability,
      imageUrl: product.imageUrl ?? product.images[0]?.url ?? null,
      keywords: product.keywords,
      // Return the persisted package measurements as well as the readiness flag.
      // Product Details needs the actual values, not only a boolean indicating completeness.
      shippingWeightKg: product.shippingWeightKg,
      shippingLengthCm: product.shippingLengthCm,
      shippingWidthCm: product.shippingWidthCm,
      shippingHeightCm: product.shippingHeightCm,
      rating: productReviewCount > 0 ? productRating._avg.rating : null,
      reviewCount: productReviewCount,
      hasShippingMeasurements,
      isPurchaseReady,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      category: formatCategory(product.category),
      images: product.images.map((image) => ({
        id: image.id,
        url: image.url,
        publicId: image.publicId,
        sortOrder: image.sortOrder,
      })),
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
              ...(showContactInfo ? {
                street: seller.location.street,
                address: seller.location.address,
              } : {}),
              verification: seller.location.verification,
            }
          : null,
        categories: sellerCategories,
        businessCategories,
        category: sellerCategories[0]?.name ?? "Uncategorised",
        socialLinks,
      },
    };

    return NextResponse.json(
      {
        product: formattedProduct,
        relatedProducts: relatedRows.map(formatRelatedProduct),
      },
      { headers: responseHeaders(rateLimit.headers) },
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
