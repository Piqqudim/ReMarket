
import {
  Availability,
  BusinessStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

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

type ProductStatus = (typeof VALID_PRODUCT_STATUSES)[number];
type ProductAvailability = (typeof VALID_AVAILABILITIES)[number];

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ProductImageInput = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type ProductUpdateData = {
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  availability?: ProductAvailability;
  keywords?: string[];
  imageUrl?: string | null;
  status?: ProductStatus;
};

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "TOO_LARGE" | "INVALID_JSON" };

class ProductCapacityError extends Error {
  constructor(
    public readonly activeCount: number,
    public readonly maximum: number,
  ) {
    super(
      `This seller has reached the active product limit of ${maximum}.`,
    );
    this.name = "ProductCapacityError";
  }
}

class ProductPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductPricingError";
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

function hasOwn(payload: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalInt(
  value: unknown,
): { valid: boolean; value: number | null } {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null };
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value.trim())
        : Number.NaN;

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

  const keywords: string[] = [];
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
    keywords.push(keyword);
  }

  return { valid: true, value: keywords };
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

  const parsed: ProductImageInput[] = [];

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
        const order = parseOptionalInt(item.sortOrder);
        if (!order.valid || order.value === null) {
          return { valid: false, value: [] };
        }
        sortOrder = order.value;
      }
    } else {
      return { valid: false, value: [] };
    }

    if (!isSafeImageUrl(url)) {
      return { valid: false, value: [] };
    }

    parsed.push({ url, publicId, sortOrder });
  }

  parsed.sort((a, b) => a.sortOrder - b.sortOrder);

  const seenUrls = new Set<string>();
  const uniqueImages: ProductImageInput[] = [];

  for (const image of parsed) {
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
    reader.releaseLock();
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
  type: NotificationType;
  title: string;
  message: string;
  dedupeKey?: string;
}): Promise<void> {
  if (!input.ownerId) return;

  try {
    await createNotification({
      userId: input.ownerId,
      type: input.type,
      title: input.title,
      message: input.message,
      priority: NotificationPriority.NORMAL,
      data: {
        productId: input.productId,
        businessId: input.businessId,
        href: `/seller/${input.businessId}`,
      },
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    });
  } catch (error) {
    console.error("Product owner notification error:", error);
  }
}

async function getProduct(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
          location: { select: { area: true } },
        },
      },
      category: true,
      images: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

async function updateProductWithRetry(input: {
  productId: string;
  data: ProductUpdateData;
  imageInputs?: ProductImageInput[];
  pricingWasProvided: boolean;
}): Promise<{
  product: NonNullable<Awaited<ReturnType<typeof getProduct>>>;
  ownerId: string | null;
  previousAvailability: Availability;
}> {
  const maximumAttempts = 3;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const current = await tx.product.findUnique({
            where: { id: input.productId },
            include: {
              business: {
                select: {
                  id: true,
                  ownerId: true,
                  deletedAt: true,
                },
              },
            },
          });

          if (!current || current.deletedAt) {
            throw new Error("PRODUCT_NOT_FOUND");
          }

          if (current.business.deletedAt) {
            throw new Error("BUSINESS_DELETED");
          }

          const isActivating =
            current.status !== BusinessStatus.ACTIVE &&
            input.data.status === BusinessStatus.ACTIVE;

          if (input.pricingWasProvided || isActivating) {
            const finalPrice =
              input.data.price !== undefined
                ? input.data.price
                : current.price;
            const finalPriceMin =
              input.data.priceMin !== undefined
                ? input.data.priceMin
                : current.priceMin;
            const finalPriceMax =
              input.data.priceMax !== undefined
                ? input.data.priceMax
                : current.priceMax;

            const pricingError = validateProductPricing(
              finalPrice,
              finalPriceMin,
              finalPriceMax,
            );

            if (pricingError) {
              throw new ProductPricingError(pricingError);
            }
          }

          if (isActivating) {
            const activeCount = await tx.product.count({
              where: {
                businessId: current.business.id,
                status: BusinessStatus.ACTIVE,
                deletedAt: null,
              },
            });

            // A business without an owner receives no referral bonus slots.
            // The conditional also narrows ownerId to a definite string.
            const referralBonusSlots = current.business.ownerId
              ? await getGrantedProductSlotBonus(
                  current.business.ownerId,
                  tx,
                )
              : 0;

            const maximum =
              BASE_MAX_ACTIVE_PRODUCTS +
              Math.max(0, Number(referralBonusSlots) || 0);

            if (activeCount >= maximum) {
              throw new ProductCapacityError(activeCount, maximum);
            }
          }

          if (Object.keys(input.data).length > 0) {
            await tx.product.update({
              where: { id: current.id },
              data: input.data,
            });
          }

          if (input.imageInputs !== undefined) {
            await tx.productImage.deleteMany({
              where: { productId: current.id },
            });

            if (input.imageInputs.length > 0) {
              await tx.productImage.createMany({
                data: input.imageInputs.map((image) => ({
                  productId: current.id,
                  url: image.url,
                  publicId: image.publicId,
                  sortOrder: image.sortOrder,
                })),
              });
            }
          }

          const updated = await tx.product.findUniqueOrThrow({
            where: { id: current.id },
            include: {
              business: {
                select: {
                  id: true,
                  name: true,
                  deletedAt: true,
                  location: { select: { area: true } },
                },
              },
              category: true,
              images: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              },
            },
          });

          return {
            product: updated,
            ownerId: current.business.ownerId,
            previousAvailability: current.availability,
          };
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

  throw new Error("PRODUCT_UPDATE_RETRIES_EXHAUSTED");
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id: productId } = await params;
    if (!productId) return jsonError("Product ID is required.", 400);

    const product = await getProduct(productId);
    if (!product) return jsonError("Product not found.", 404);

    return NextResponse.json(
      { product },
      { headers: jsonHeaders() },
    );
  } catch (error) {
    console.error("Admin product GET error:", error);
    return jsonError("Unable to load product.", 500);
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id: productId } = await params;
    if (!productId) return jsonError("Product ID is required.", 400);

    const existing = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!existing) return jsonError("Product not found.", 404);
    if (existing.deletedAt) {
      return jsonError("This product has been deleted and cannot be edited.", 409);
    }
    if (existing.business.deletedAt) {
      return jsonError(
        "This business has been deleted and its products cannot be edited.",
        409,
      );
    }

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
    if (Object.keys(body).length === 0) {
      return jsonError("No changes provided.", 400);
    }

    const data: ProductUpdateData = {};

    if (hasOwn(body, "name")) {
      const name = cleanString(body.name);
      if (!name) return jsonError("Product name is required.", 400);
      if (name.length > 200) {
        return jsonError("Product name must not exceed 200 characters.", 400);
      }
      data.name = name;
    }

    if (hasOwn(body, "description")) {
      if (body.description !== null && typeof body.description !== "string") {
        return jsonError("Product description must be a string or null.", 400);
      }
      const description = cleanString(body.description);
      if (description.length > 2000) {
        return jsonError("Product description must not exceed 2,000 characters.", 400);
      }
      data.description = description || null;
    }

    if (hasOwn(body, "categoryId")) {
      if (body.categoryId !== null && typeof body.categoryId !== "string") {
        return jsonError("Category ID must be a string or null.", 400);
      }

      const categoryId = cleanString(body.categoryId);
      if (!categoryId) {
        data.categoryId = null;
      } else {
        const category = await prisma.category.findFirst({
          where: { id: categoryId, isActive: true },
          select: { id: true },
        });
        if (!category) {
          return jsonError("Selected category was not found or is inactive.", 400);
        }
        data.categoryId = category.id;
      }
    }

    let pricingWasProvided = false;

    if (hasOwn(body, "price")) {
      const parsed = parseOptionalInt(body.price);
      if (!parsed.valid) {
        return jsonError(
          "Price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }
      data.price = parsed.value;
      pricingWasProvided = true;
    }

    if (hasOwn(body, "priceMin")) {
      const parsed = parseOptionalInt(body.priceMin);
      if (!parsed.valid) {
        return jsonError(
          "Minimum price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }
      data.priceMin = parsed.value;
      pricingWasProvided = true;
    }

    if (hasOwn(body, "priceMax")) {
      const parsed = parseOptionalInt(body.priceMax);
      if (!parsed.valid) {
        return jsonError(
          "Maximum price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }
      data.priceMax = parsed.value;
      pricingWasProvided = true;
    }

    if (hasOwn(body, "availability")) {
      if (!isAvailability(body.availability)) {
        return jsonError("Invalid availability value.", 400);
      }
      data.availability = body.availability;
    }

    if (hasOwn(body, "status")) {
      if (!isProductStatus(body.status)) {
        return jsonError("Invalid product status.", 400);
      }
      data.status = body.status;
    }

    if (hasOwn(body, "keywords")) {
      const parsed = parseKeywords(body.keywords);
      if (!parsed.valid) {
        return jsonError(
          "Keywords must be an array of up to 30 strings. Each keyword may contain up to 80 characters, with 1,500 characters combined.",
          400,
        );
      }
      data.keywords = parsed.value;
    }

    let imageInputs: ProductImageInput[] | undefined;
    if (hasOwn(body, "images")) {
      const parsed = parseImages(body.images);
      if (!parsed.valid) {
        return jsonError(
          "Images must be an array of up to 20 valid HTTP or HTTPS image URLs.",
          400,
        );
      }
      imageInputs = parsed.value;
      data.imageUrl = imageInputs[0]?.url ?? null;
    }

    if (Object.keys(data).length === 0 && imageInputs === undefined) {
      return jsonError("No supported changes were provided.", 400);
    }

    const updated = await updateProductWithRetry({
      productId,
      data,
      imageInputs,
      pricingWasProvided,
    });

    const availabilityChanged =
      updated.product.availability !== updated.previousAvailability;

    if (availabilityChanged) {
      await notifyProductOwner({
        ownerId: updated.ownerId,
        productId: updated.product.id,
        businessId: updated.product.business.id,
        type: NotificationType.PRODUCT_AVAILABILITY_CHANGED,
        title: "Product availability changed",
        message: `The availability of "${updated.product.name}" has been changed by a ReMarket admin.`,
      });
    } else {
      await notifyProductOwner({
        ownerId: updated.ownerId,
        productId: updated.product.id,
        businessId: updated.product.business.id,
        type: NotificationType.PRODUCT_UPDATED,
        title: "Product updated",
        message: `"${updated.product.name}" has been updated by a ReMarket admin.`,
      });
    }

    return NextResponse.json(
      {
        success: true,
        product: updated.product,
      },
      { headers: jsonHeaders() },
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

    if (error instanceof ProductPricingError) {
      return jsonError(error.message, 400);
    }

    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return jsonError("Product not found.", 404);
    }

    if (error instanceof Error && error.message === "BUSINESS_DELETED") {
      return jsonError(
        "This business has been deleted and its products cannot be edited.",
        409,
      );
    }

    if (isPrismaErrorCode(error, "P2025")) {
      return jsonError("Product could not be found.", 404);
    }

    console.error("Admin product PATCH error:", error);
    return jsonError("Unable to update product.", 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id: productId } = await params;
    if (!productId) return jsonError("Product ID is required.", 400);

    const existing = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        business: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    if (!existing) return jsonError("Product not found.", 404);

    if (existing.deletedAt) {
      return NextResponse.json(
        { success: true, alreadyDeleted: true },
        { headers: jsonHeaders() },
      );
    }

    const deletedAt = new Date();
    const result = await prisma.product.updateMany({
      where: {
        id: productId,
        deletedAt: null,
      },
      data: {
        deletedAt,
        deletedById: auth.user.id,
      },
    });

    if (result.count !== 1) {
      return jsonError(
        "Product could not be deleted because it was already deleted or changed.",
        409,
      );
    }

    await notifyProductOwner({
      ownerId: existing.business.ownerId,
      productId: existing.id,
      businessId: existing.business.id,
      type: NotificationType.PRODUCT_REMOVED,
      title: "Product removed",
      message: `"${existing.name}" has been removed from your ReMarket business by an admin.`,
      dedupeKey: `product-removed:${existing.id}:${existing.business.ownerId ?? "no-owner"}`,
    });

    return NextResponse.json(
      {
        success: true,
        productId,
        deletedAt: deletedAt.toISOString(),
      },
      { headers: jsonHeaders() },
    );
  } catch (error) {
    console.error("Admin product DELETE error:", error);
    return jsonError("Unable to delete product.", 500);
  }
}
