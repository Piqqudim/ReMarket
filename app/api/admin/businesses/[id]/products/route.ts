
import {
  Availability,
  BusinessStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notifications";
import { validateProductPricing } from "@/lib/product-pricing";
import { prisma } from "@/lib/prisma";
import { getGrantedProductSlotBonus } from "@/lib/referrals";

const BASE_MAX_ACTIVE_PRODUCTS = 100;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_PRODUCT_IMAGES = 20;
const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS_TOTAL_LENGTH = 1500;
const MAX_PRISMA_INT = 2_147_483_647;

const VALID_AVAILABILITIES = [
  Availability.AVAILABLE,
  Availability.ASK_SELLER,
  Availability.UNAVAILABLE,
] as const;

const VALID_PRODUCT_STATUSES = [
  BusinessStatus.ACTIVE,
  BusinessStatus.INACTIVE,
  BusinessStatus.PENDING,
] as const;

type ProductAvailability = (typeof VALID_AVAILABILITIES)[number];
type ProductStatus = (typeof VALID_PRODUCT_STATUSES)[number];

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ProductImageInput = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "TOO_LARGE" | "INVALID_JSON" };

class ProductCapacityError extends Error {
  constructor(
    public readonly activeCount: number,
    public readonly maximum: number,
  ) {
    super(`This seller has reached the active product limit of ${maximum}.`);
    this.name = "ProductCapacityError";
  }
}

function jsonHeaders() {
  return { "Cache-Control": "no-store" };
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: jsonHeaders() },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseOptionalInt(
  value: unknown,
): { valid: boolean; value: number | null } {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null };
  }

  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    parsed = Number(value.trim());
  } else {
    return { valid: false, value: null };
  }

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_PRISMA_INT
  ) {
    return { valid: false, value: null };
  }

  return { valid: true, value: parsed };
}

function isAvailability(value: unknown): value is ProductAvailability {
  return VALID_AVAILABILITIES.includes(value as ProductAvailability);
}

function isProductStatus(value: unknown): value is ProductStatus {
  return VALID_PRODUCT_STATUSES.includes(value as ProductStatus);
}

function parseKeywords(
  value: unknown,
): { valid: boolean; value: string[] } {
  if (!Array.isArray(value) || value.length > MAX_KEYWORDS) {
    return { valid: false, value: [] };
  }

  const result: string[] = [];
  const seen = new Set<string>();
  let totalLength = 0;

  for (const item of value) {
    if (typeof item !== "string") {
      return { valid: false, value: [] };
    }

    const keyword = item.trim().toLowerCase();
    if (!keyword) continue;
    if (keyword.length > MAX_KEYWORD_LENGTH) {
      return { valid: false, value: [] };
    }
    if (seen.has(keyword)) continue;

    totalLength += keyword.length;
    if (totalLength > MAX_KEYWORDS_TOTAL_LENGTH) {
      return { valid: false, value: [] };
    }

    seen.add(keyword);
    result.push(keyword);
  }

  return { valid: true, value: result };
}

function isSafeImageUrl(value: string): boolean {
  if (!value || value.length > 2000) return false;

  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function parseImages(
  value: unknown,
): { valid: boolean; value: ProductImageInput[] } {
  if (!Array.isArray(value) || value.length > MAX_PRODUCT_IMAGES) {
    return { valid: false, value: [] };
  }

  const images: ProductImageInput[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    let url = "";
    let publicId: string | null = null;
    let sortOrder = index;

    if (typeof item === "string") {
      url = item.trim();
    } else if (isRecord(item)) {
      url = cleanString(item.url);

      if (item.publicId !== undefined && item.publicId !== null) {
        if (typeof item.publicId !== "string") {
          return { valid: false, value: [] };
        }
        publicId = item.publicId.trim() || null;
        if (publicId && publicId.length > 255) {
          return { valid: false, value: [] };
        }
      }

      if (item.sortOrder !== undefined && item.sortOrder !== null) {
        const parsedOrder = parseOptionalInt(item.sortOrder);
        if (!parsedOrder.valid || parsedOrder.value === null) {
          return { valid: false, value: [] };
        }
        sortOrder = parsedOrder.value;
      }
    } else {
      return { valid: false, value: [] };
    }

    if (!isSafeImageUrl(url)) {
      return { valid: false, value: [] };
    }

    images.push({ url, publicId, sortOrder });
  }

  images.sort((a, b) => a.sortOrder - b.sortOrder);

  const seenUrls = new Set<string>();
  const uniqueImages: ProductImageInput[] = [];

  for (const image of images) {
    if (seenUrls.has(image.url)) continue;
    seenUrls.add(image.url);
    uniqueImages.push({
      ...image,
      sortOrder: uniqueImages.length,
    });
  }

  return { valid: true, value: uniqueImages };
}

async function readJsonBody(
  request: Request,
  maximumBytes = MAX_REQUEST_BYTES,
): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      return { ok: false, reason: "TOO_LARGE" };
    }
  }

  if (!request.body) {
    return { ok: false, reason: "INVALID_JSON" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "TOO_LARGE" };
      }

      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already have been cancelled.
    }
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(decoded) as unknown };
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  }
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

async function notifyProductOwner(input: {
  ownerId: string | null;
  productId: string;
  businessId: string;
  businessName: string;
  productName: string;
}): Promise<void> {
  if (!input.ownerId) return;

  try {
    await createNotification({
      userId: input.ownerId,
      type: NotificationType.PRODUCT_ADDED,
      title: "New product added",
      message: `A new product, "${input.productName}", has been added to ${input.businessName}.`,
      priority: NotificationPriority.NORMAL,
      data: {
        productId: input.productId,
        businessId: input.businessId,
        href: `/seller/${input.businessId}`,
      },
      dedupeKey: `product:${input.productId}:added`,
    });
  } catch (error) {
    console.error("Admin business product notification error:", error);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id: businessId } = await params;
    if (!businessId) return jsonError("Business ID is required.", 400);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });

    if (!business) return jsonError("Business not found.", 404);

    const products = await prisma.product.findMany({
      where: { businessId },
      orderBy: { updatedAt: "desc" },
      include: {
        category: true,
        images: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    return NextResponse.json(
      { products },
      { headers: jsonHeaders() },
    );
  } catch (error) {
    console.error("Admin products GET error:", error);
    return jsonError("Unable to load products.", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id: businessId } = await params;
    if (!businessId) return jsonError("Business ID is required.", 400);

    const bodyResult = await readJsonBody(request);
    if (!bodyResult.ok) {
      return bodyResult.reason === "TOO_LARGE"
        ? jsonError("Request body is too large.", 413)
        : jsonError("Request body must contain valid JSON.", 400);
    }

    if (!isRecord(bodyResult.value)) {
      return jsonError("Invalid request body.", 400);
    }

    const body = bodyResult.value;
    const name = cleanString(body.name);

    if (!name) return jsonError("Product name is required.", 400);
    if (name.length > 200) {
      return jsonError("Product name must not exceed 200 characters.", 400);
    }

    if (hasOwn(body, "description") && body.description !== null && typeof body.description !== "string") {
      return jsonError("Product description must be a string or null.", 400);
    }

    const description = cleanString(body.description) || null;
    if (description && description.length > 2000) {
      return jsonError("Product description must not exceed 2,000 characters.", 400);
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        deletedAt: true,
      },
    });

    if (!business) return jsonError("Business not found.", 404);
    if (business.deletedAt) {
      return jsonError(
        "This business has been deleted and cannot receive new products.",
        409,
      );
    }

    let categoryId: string | null = null;
    if (hasOwn(body, "categoryId")) {
      if (body.categoryId !== null && typeof body.categoryId !== "string") {
        return jsonError("Category ID must be a string or null.", 400);
      }

      categoryId = cleanString(body.categoryId) || null;
      if (categoryId) {
        const category = await prisma.category.findFirst({
          where: { id: categoryId, isActive: true },
          select: { id: true },
        });
        if (!category) {
          return jsonError("Selected category was not found or is inactive.", 400);
        }
      }
    }

    const parsedPrice = parseOptionalInt(body.price);
    const parsedPriceMin = parseOptionalInt(body.priceMin);
    const parsedPriceMax = parseOptionalInt(body.priceMax);

    if (!parsedPrice.valid) {
      return jsonError("Price must be a whole number between 0 and 2,147,483,647.", 400);
    }
    if (!parsedPriceMin.valid) {
      return jsonError("Minimum price must be a whole number between 0 and 2,147,483,647.", 400);
    }
    if (!parsedPriceMax.valid) {
      return jsonError("Maximum price must be a whole number between 0 and 2,147,483,647.", 400);
    }

    const price = parsedPrice.value;
    const priceMin = parsedPriceMin.value;
    const priceMax = parsedPriceMax.value;

    const pricingError = validateProductPricing(price, priceMin, priceMax);
    if (pricingError) return jsonError(pricingError, 400);

    let availability: ProductAvailability = Availability.ASK_SELLER;
    if (hasOwn(body, "availability")) {
      if (!isAvailability(body.availability)) {
        return jsonError("Invalid product availability value.", 400);
      }
      availability = body.availability;
    }

    let status: ProductStatus = BusinessStatus.ACTIVE;
    if (hasOwn(body, "status")) {
      if (!isProductStatus(body.status)) {
        return jsonError("Invalid product status.", 400);
      }
      status = body.status;
    }

    let keywords: string[] = [];
    if (hasOwn(body, "keywords")) {
      const parsedKeywords = parseKeywords(body.keywords);
      if (!parsedKeywords.valid) {
        return jsonError(
          "Keywords must be an array of up to 30 strings. Each keyword may contain up to 80 characters, with 1,500 characters combined.",
          400,
        );
      }
      keywords = parsedKeywords.value;
    }

    let images: ProductImageInput[] = [];
    if (hasOwn(body, "images")) {
      const parsedImages = parseImages(body.images);
      if (!parsedImages.valid) {
        return jsonError(
          "Images must be an array of up to 20 valid HTTP or HTTPS image URLs.",
          400,
        );
      }
      images = parsedImages.value;
    } else if (hasOwn(body, "imageUrl") && body.imageUrl !== null && body.imageUrl !== "") {
      if (typeof body.imageUrl !== "string" || !isSafeImageUrl(body.imageUrl.trim())) {
        return jsonError("Image URL must be a valid HTTP or HTTPS URL.", 400);
      }
      images = [{ url: body.imageUrl.trim(), publicId: null, sortOrder: 0 }];
    }

    const imageUrl = images[0]?.url ?? null;

    const created = await createProductWithCapacityRetry({
      businessId,
      name,
      description,
      categoryId,
      price,
      priceMin,
      priceMax,
      availability,
      keywords,
      imageUrl,
      images,
      status,
    });

    await notifyProductOwner({
      ownerId: created.business.ownerId,
      productId: created.id,
      businessId: created.business.id,
      businessName: created.business.name,
      productName: created.name,
    });

    return NextResponse.json(
      { product: created },
      { status: 201, headers: jsonHeaders() },
    );
  } catch (error) {
    if (error instanceof ProductCapacityError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "ACTIVE_PRODUCT_LIMIT",
          activeProductCount: error.activeCount,
          maxActiveProducts: error.maximum,
          availableSlots: Math.max(0, error.maximum - error.activeCount),
        },
        { status: 409, headers: jsonHeaders() },
      );
    }

    if (error instanceof Error && error.message === "BUSINESS_DELETED") {
      return jsonError(
        "This business has been deleted and cannot receive new products.",
        409,
      );
    }

    if (isPrismaErrorCode(error, "P2034")) {
      return jsonError(
        "Product capacity changed during this request. Please retry.",
        409,
      );
    }

    console.error("Admin products POST error:", error);
    return jsonError("Unable to create product.", 500);
  }
}

async function createProductWithCapacityRetry(input: {
  businessId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: ProductAvailability;
  keywords: string[];
  imageUrl: string | null;
  images: ProductImageInput[];
  status: ProductStatus;
}) {
  const maximumAttempts = 3;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const business = await tx.business.findUnique({
            where: { id: input.businessId },
            select: {
              id: true,
              name: true,
              ownerId: true,
              deletedAt: true,
            },
          });

          if (!business) {
            throw new Error("BUSINESS_NOT_FOUND");
          }
          if (business.deletedAt) {
            throw new Error("BUSINESS_DELETED");
          }

          if (input.status === BusinessStatus.ACTIVE) {
            const activeCount = await tx.product.count({
              where: {
                businessId: business.id,
                status: BusinessStatus.ACTIVE,
                deletedAt: null,
              },
            });

            const referralBonusSlots = business.ownerId
              ? await getGrantedProductSlotBonus(business.ownerId, tx)
              : 0;

            const maximum =
              BASE_MAX_ACTIVE_PRODUCTS +
              Math.max(0, Number(referralBonusSlots) || 0);

            if (activeCount >= maximum) {
              throw new ProductCapacityError(activeCount, maximum);
            }
          }

          return tx.product.create({
            data: {
              businessId: business.id,
              name: input.name,
              description: input.description,
              categoryId: input.categoryId,
              price: input.price,
              priceMin: input.priceMin,
              priceMax: input.priceMax,
              availability: input.availability,
              keywords: input.keywords,
              imageUrl: input.imageUrl,
              status: input.status,
              ...(input.images.length > 0
                ? {
                    images: {
                      create: input.images.map((image) => ({
                        url: image.url,
                        publicId: image.publicId,
                        sortOrder: image.sortOrder,
                      })),
                    },
                  }
                : {}),
            },
            include: {
              category: true,
              images: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              },
              business: {
                select: { id: true, name: true, ownerId: true },
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaErrorCode(error, "P2034") && attempt < maximumAttempts) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("PRODUCT_CREATE_RETRIES_EXHAUSTED");
}
