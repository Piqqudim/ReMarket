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
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS_TOTAL_LENGTH = 1500;
const MAX_IMAGE_URL_LENGTH = 2000;
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ProductAvailability = (typeof VALID_AVAILABILITIES)[number];
type ProductStatus = (typeof VALID_PRODUCT_STATUSES)[number];

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "TOO_LARGE" | "INVALID_JSON" };

class ProductCapacityError extends Error {
  constructor(
    public readonly activeCount: number,
    public readonly maximum: number,
  ) {
    super(`This business has reached its active product limit of ${maximum}.`);
    this.name = "ProductCapacityError";
  }
}

class BusinessNotFoundError extends Error {
  constructor() {
    super("Business not found.");
    this.name = "BusinessNotFoundError";
  }
}

class BusinessDeletedError extends Error {
  constructor() {
    super("This business has been deleted and cannot receive new products.");
    this.name = "BusinessDeletedError";
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

function parseOptionalInteger(
  value: unknown,
): { valid: boolean; value: number | null } {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return { valid: true, value: null };
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
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

function isSafeHttpUrl(value: string): boolean {
  if (!value || value.length > MAX_IMAGE_URL_LENGTH) return false;

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

async function readJsonBody(
  request: Request,
  maximumBytes = MAX_REQUEST_BYTES,
): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength >= 0 &&
      declaredLength > maximumBytes
    ) {
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
      // The reader may already have been cancelled.
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

async function createProductWithCapacity(input: {
  businessId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: ProductAvailability;
  status: ProductStatus;
  keywords: string[];
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

          if (!business) throw new BusinessNotFoundError();
          if (business.deletedAt) throw new BusinessDeletedError();

          if (input.status === BusinessStatus.ACTIVE) {
            const activeCount = await tx.product.count({
              where: {
                businessId: business.id,
                status: BusinessStatus.ACTIVE,
                deletedAt: null,
              },
            });

            // A business without an owner cannot receive referral bonus slots.
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

          const product = await tx.product.create({
            data: {
              businessId: business.id,
              name: input.name,
              description: input.description,
              imageUrl: input.imageUrl,
              categoryId: input.categoryId,
              price: input.price,
              priceMin: input.priceMin,
              priceMax: input.priceMax,
              availability: input.availability,
              status: input.status,
              keywords: input.keywords,
            },
            include: {
              category: {
                select: { id: true, name: true },
              },
              business: {
                select: { id: true, name: true },
              },
            },
          });

          return {
            product,
            ownerId: business.ownerId,
            businessName: business.name,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
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

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { id: businessId } = await params;
    if (!businessId) return jsonError("Business ID is required.", 400);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true },
    });

    if (!business) return jsonError("Business not found.", 404);

    const products = await prisma.product.findMany({
      where: { businessId },
      orderBy: { updatedAt: "desc" },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(
      { business, products },
      { headers: jsonHeaders() },
    );
  } catch (error) {
    console.error("Admin business products GET error:", error);
    return jsonError("Unable to load business products.", 500);
  }
}

export async function POST(
  request: Request,
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
    if (name.length > MAX_NAME_LENGTH) {
      return jsonError(
        `Product name must not exceed ${MAX_NAME_LENGTH} characters.`,
        400,
      );
    }

    if (
      body.description !== undefined &&
      body.description !== null &&
      typeof body.description !== "string"
    ) {
      return jsonError("Product description must be a string or null.", 400);
    }

    const description = cleanString(body.description) || null;
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      return jsonError(
        `Product description must not exceed ${MAX_DESCRIPTION_LENGTH} characters.`,
        400,
      );
    }

    if (
      body.imageUrl !== undefined &&
      body.imageUrl !== null &&
      typeof body.imageUrl !== "string"
    ) {
      return jsonError("Image URL must be a string or null.", 400);
    }

    const imageUrl = cleanString(body.imageUrl) || null;
    if (imageUrl && !isSafeHttpUrl(imageUrl)) {
      return jsonError("Image URL must be a valid HTTP or HTTPS URL.", 400);
    }

    if (
      body.categoryId !== undefined &&
      body.categoryId !== null &&
      typeof body.categoryId !== "string"
    ) {
      return jsonError("Category ID must be a string or null.", 400);
    }

    const categoryId = cleanString(body.categoryId) || null;
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!category) {
        return jsonError("Selected category was not found or is inactive.", 400);
      }
    }

    const parsedPrice = parseOptionalInteger(body.price);
    const parsedPriceMin = parseOptionalInteger(body.priceMin);
    const parsedPriceMax = parseOptionalInteger(body.priceMax);

    if (!parsedPrice.valid) {
      return jsonError("Price must be a valid whole number in naira.", 400);
    }
    if (!parsedPriceMin.valid) {
      return jsonError("Minimum price must be a valid whole number in naira.", 400);
    }
    if (!parsedPriceMax.valid) {
      return jsonError("Maximum price must be a valid whole number in naira.", 400);
    }

    const pricingError = validateProductPricing(
      parsedPrice.value,
      parsedPriceMin.value,
      parsedPriceMax.value,
    );

    if (pricingError) return jsonError(pricingError, 400);

    let availability: ProductAvailability = Availability.ASK_SELLER;
    if (body.availability !== undefined) {
      if (!isAvailability(body.availability)) {
        return jsonError("Invalid product availability value.", 400);
      }
      availability = body.availability;
    }

    let status: ProductStatus = BusinessStatus.ACTIVE;
    if (body.status !== undefined) {
      if (!isProductStatus(body.status)) {
        return jsonError("Invalid product status.", 400);
      }
      status = body.status;
    }

    const parsedKeywords =
      body.keywords === undefined
        ? { valid: true, value: [] as string[] }
        : parseKeywords(body.keywords);

    if (!parsedKeywords.valid) {
      return jsonError(
        "Keywords must be an array of up to 30 strings. Each keyword may contain up to 80 characters, with 1,500 characters combined.",
        400,
      );
    }

    const created = await createProductWithCapacity({
      businessId,
      name,
      description,
      imageUrl,
      categoryId,
      price: parsedPrice.value,
      priceMin: parsedPriceMin.value,
      priceMax: parsedPriceMax.value,
      availability,
      status,
      keywords: parsedKeywords.value,
    });

    // Notification failure must not undo the successful product creation.
    if (created.ownerId) {
      try {
        await createNotification({
          userId: created.ownerId,
          type: NotificationType.PRODUCT_ADDED,
          title: "New product added",
          message: `A new product, "${created.product.name}", has been added to ${created.businessName}.`,
          priority: NotificationPriority.NORMAL,
          data: {
            productId: created.product.id,
            businessId: created.product.business.id,
            href: `/seller/${created.product.business.id}`,
          },
          dedupeKey: `product:${created.product.id}:added`,
        });
      } catch (notificationError) {
        console.error(
          "Admin business product notification error:",
          notificationError,
        );
      }
    }

    return NextResponse.json(
      { product: created.product },
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

    if (error instanceof BusinessNotFoundError) {
      return jsonError("Business not found.", 404);
    }

    if (error instanceof BusinessDeletedError) {
      return jsonError(error.message, 409);
    }

    console.error("Admin business product POST error:", error);
    return jsonError("Unable to create product.", 500);
  }
}
