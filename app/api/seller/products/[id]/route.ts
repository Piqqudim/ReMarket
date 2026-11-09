import {
  Availability as PrismaAvailability,
  NotificationPriority,
  NotificationType,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { validateProductPricing } from "@/lib/product-pricing";
import { requireSellerAccount } from "@/lib/seller-auth";
import { createNotification } from "@/lib/notifications";

const MAX_PRODUCT_ID_LENGTH = 100;
const MAX_REQUEST_BYTES = 256 * 1024;

const MAX_PRODUCT_IMAGES = 20;
const MAX_IMAGE_URL_LENGTH = 2000;
const MAX_PUBLIC_ID_LENGTH = 255;

const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS_TOTAL_LENGTH = 1500;

const MAX_PRISMA_INT = 2_147_483_647;

const ALLOWED_AVAILABILITY = [
  PrismaAvailability.AVAILABLE,
  PrismaAvailability.ASK_SELLER,
  PrismaAvailability.UNAVAILABLE,
] as const;

type ProductAvailability =
  (typeof ALLOWED_AVAILABILITY)[number];

type ParsedProductImage = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type JsonBodyResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      reason: "TOO_LARGE" | "INVALID_JSON";
    };

type ProductUpdateData = {
  name?: string;
  description?: string | null;
  categoryId?: string | null;
  imageUrl?: string | null;
  availability?: ProductAvailability;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  stockQuantity?: number | null;
  keywords?: string[];
};

function jsonHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function jsonError(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: jsonHeaders(),
    },
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function hasOwn(
  payload: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    payload,
    key,
  );
}

function isAvailability(
  value: unknown,
): value is ProductAvailability {
  return ALLOWED_AVAILABILITY.includes(
    value as ProductAvailability,
  );
}

/*
 * --------------------------------------------------
 * REQUEST BODY
 * --------------------------------------------------
 *
 * Enforces the request size while streaming.
 * This also protects requests without Content-Length.
 * --------------------------------------------------
 */

async function readJsonBody(
  request: Request,
  maximumBytes = MAX_REQUEST_BYTES,
): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const declaredLength = Number(contentLength);

    if (
      !Number.isFinite(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > maximumBytes
    ) {
      return {
        ok: false,
        reason: "TOO_LARGE",
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      reason: "INVALID_JSON",
    };
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

        return {
          ok: false,
          reason: "TOO_LARGE",
        };
      }

      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      reason: "INVALID_JSON",
    };
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

    const decoded = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);

    return {
      ok: true,
      value: JSON.parse(decoded) as unknown,
    };
  } catch {
    return {
      ok: false,
      reason: "INVALID_JSON",
    };
  }
}

/*
 * --------------------------------------------------
 * INTEGER VALIDATION
 * --------------------------------------------------
 */

function parseOptionalInteger(
  value: unknown,
): {
  valid: boolean;
  value: number | null;
} {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      valid: true,
      value: null,
    };
  }

  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (
    typeof value === "string" &&
    /^\d+$/.test(value.trim())
  ) {
    parsed = Number(value.trim());
  } else {
    return {
      valid: false,
      value: null,
    };
  }

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_PRISMA_INT
  ) {
    return {
      valid: false,
      value: null,
    };
  }

  return {
    valid: true,
    value: parsed,
  };
}

/*
 * --------------------------------------------------
 * IMAGE VALIDATION
 * --------------------------------------------------
 */

function isSafeImageUrl(
  value: string,
): boolean {
  if (
    !value ||
    value.length > MAX_IMAGE_URL_LENGTH
  ) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      (url.protocol === "http:" ||
        url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function parseProductImages(
  value: unknown,
): {
  valid: boolean;
  value: ParsedProductImage[];
} {
  if (
    !Array.isArray(value) ||
    value.length > MAX_PRODUCT_IMAGES
  ) {
    return {
      valid: false,
      value: [],
    };
  }

  const images: ParsedProductImage[] = [];

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const item = value[index];

    let url = "";
    let publicId: string | null = null;
    let sortOrder = index;

    /*
     * Backward compatibility:
     * Plain image URL strings are still accepted.
     */
    if (typeof item === "string") {
      url = item.trim();
    } else if (isRecord(item)) {
      url = cleanString(item.url);

      if (
        item.publicId !== undefined &&
        item.publicId !== null
      ) {
        if (typeof item.publicId !== "string") {
          return {
            valid: false,
            value: [],
          };
        }

        publicId = item.publicId.trim() || null;

        if (
          publicId &&
          publicId.length > MAX_PUBLIC_ID_LENGTH
        ) {
          return {
            valid: false,
            value: [],
          };
        }
      }

      if (
        item.sortOrder !== undefined &&
        item.sortOrder !== null &&
        item.sortOrder !== ""
      ) {
        const parsedSortOrder = parseOptionalInteger(
          item.sortOrder,
        );

        if (
          !parsedSortOrder.valid ||
          parsedSortOrder.value === null
        ) {
          return {
            valid: false,
            value: [],
          };
        }

        sortOrder = parsedSortOrder.value;
      }
    } else {
      return {
        valid: false,
        value: [],
      };
    }

    /*
     * Empty image entries are ignored.
     * Sending images: [] intentionally removes
     * all previously saved images.
     */
    if (!url) {
      continue;
    }

    if (!isSafeImageUrl(url)) {
      return {
        valid: false,
        value: [],
      };
    }

    images.push({
      url,
      publicId,
      sortOrder,
    });
  }

  /*
   * Respect the supplied order, then normalize
   * the saved sequence to zero-based positions.
   */
  images.sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const seenUrls = new Set<string>();
  const uniqueImages: ParsedProductImage[] = [];

  for (const image of images) {
    if (seenUrls.has(image.url)) {
      continue;
    }

    seenUrls.add(image.url);

    uniqueImages.push({
      ...image,
      sortOrder: uniqueImages.length,
    });
  }

  return {
    valid: true,
    value: uniqueImages,
  };
}

function getCompatibilityImageUrl(
  images: ParsedProductImage[],
): string | null {
  return images[0]?.url ?? null;
}

/*
 * --------------------------------------------------
 * KEYWORD VALIDATION
 * --------------------------------------------------
 */

function parseKeywords(
  value: unknown,
): {
  valid: boolean;
  value: string[];
} {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;

  if (!values || values.length > MAX_KEYWORDS) {
    return {
      valid: false,
      value: [],
    };
  }

  const keywords: string[] = [];
  const seen = new Set<string>();

  let totalLength = 0;

  for (const item of values) {
    if (typeof item !== "string") {
      return {
        valid: false,
        value: [],
      };
    }

    const keyword = item.trim().toLowerCase();

    if (!keyword) {
      continue;
    }

    if (keyword.length > MAX_KEYWORD_LENGTH) {
      return {
        valid: false,
        value: [],
      };
    }

    if (seen.has(keyword)) {
      continue;
    }

    totalLength += keyword.length;

    if (totalLength > MAX_KEYWORDS_TOTAL_LENGTH) {
      return {
        valid: false,
        value: [],
      };
    }

    seen.add(keyword);
    keywords.push(keyword);
  }

  return {
    valid: true,
    value: keywords,
  };
}

/*
 * --------------------------------------------------
 * NOTIFICATION HELPERS
 * --------------------------------------------------
 */

async function notifyAdminsOfProductEvent(
  input: {
    type: NotificationType;
    title: string;
    message: string;
    productId: string;
    businessId: string;
    dedupePrefix?: string;
  },
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: {
        role: "ADMIN",
      },
      select: {
        id: true,
      },
    });

    for (const admin of admins) {
      try {
        await createNotification({
          userId: admin.id,
          type: input.type,
          title: input.title,
          message: input.message,
          priority: NotificationPriority.NORMAL,

          data: {
            productId: input.productId,
            businessId: input.businessId,
            href: "/admin/products",
          },

          dedupeKey: input.dedupePrefix
            ? `${input.dedupePrefix}:${input.productId}:admin:${admin.id}`
            : null,
        });
      } catch (notificationError) {
        console.error(
          "Seller product admin notification error:",
          notificationError,
        );
      }
    }
  } catch (adminLookupError) {
    console.error(
      "Seller product admin lookup error:",
      adminLookupError,
    );
  }
}

/*
 * --------------------------------------------------
 * SELLER BUSINESS VALIDATION
 * --------------------------------------------------
 *
 * Business.ownerId is nullable in the Prisma schema.
 * The ownership comparison rejects null owners.
 * --------------------------------------------------
 */

function validateSellerBusiness(
  business: {
    id: string;
    ownerId: string | null;
    deletedAt: Date | null;
  } | null,
  sellerId: string,
) {
  if (!business) {
    return jsonError(
      "You do not have a business linked to this seller account.",
      404,
    );
  }

  if (business.ownerId !== sellerId) {
    return jsonError(
      "You are not allowed to manage this business.",
      403,
    );
  }

  if (business.deletedAt) {
    return jsonError(
      "This business has been deleted.",
      410,
    );
  }

  return null;
}

/*
 * --------------------------------------------------
 * SELLER PRODUCT LOOKUP
 * --------------------------------------------------
 *
 * A seller may only access products belonging
 * to their own non-deleted business.
 *
 * The business does not have to be ACTIVE.
 * --------------------------------------------------
 */

async function getSellerProduct(
  productId: string,
  sellerId: string,
) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      deletedAt: null,

      business: {
        ownerId: sellerId,
        deletedAt: null,
      },
    },

    include: {
      category: true,

      images: {
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
      },

      business: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/*
 * --------------------------------------------------
 * GET
 * --------------------------------------------------
 */

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const auth = await requireSellerAccount();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const businessError = validateSellerBusiness(
      auth.business,
      auth.user.id,
    );

    if (businessError) {
      return businessError;
    }

    const { id } = await context.params;

    if (
      !id ||
      id.length > MAX_PRODUCT_ID_LENGTH
    ) {
      return jsonError(
        "Invalid product ID.",
        400,
      );
    }

    const product = await getSellerProduct(
      id,
      auth.user.id,
    );

    if (!product) {
      return jsonError(
        "Product not found.",
        404,
      );
    }

    return NextResponse.json(
      {
        product,
      },
      {
        headers: jsonHeaders(),
      },
    );
  } catch (error) {
    console.error(
      "Seller product GET error:",
      error,
    );

    return jsonError(
      "Unable to load product.",
      500,
    );
  }
}

/*
 * --------------------------------------------------
 * PATCH
 * --------------------------------------------------
 *
 * Supports editing product details and stock quantity.
 *
 * Stock rules:
 * null = inventory tracking disabled.
 * 0 = out of stock.
 * > 0 = available tracked quantity.
 * --------------------------------------------------
 */

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const auth = await requireSellerAccount();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const businessError = validateSellerBusiness(
      auth.business,
      auth.user.id,
    );

    if (businessError) {
      return businessError;
    }

    const { id } = await context.params;

    if (
      !id ||
      id.length > MAX_PRODUCT_ID_LENGTH
    ) {
      return jsonError(
        "Invalid product ID.",
        400,
      );
    }

    const existing = await getSellerProduct(
      id,
      auth.user.id,
    );

    if (!existing) {
      return jsonError(
        "Product not found.",
        404,
      );
    }

    const bodyResult = await readJsonBody(request);

    if (!bodyResult.ok) {
      return bodyResult.reason === "TOO_LARGE"
        ? jsonError(
            "Request body is too large. Maximum size is 256 KB.",
            413,
          )
        : jsonError(
            "Request body must contain valid JSON.",
            400,
          );
    }

    if (!isRecord(bodyResult.value)) {
      return jsonError(
        "Invalid request body.",
        400,
      );
    }

    const body = bodyResult.value;

    if (Object.keys(body).length === 0) {
      return jsonError(
        "No changes were supplied.",
        400,
      );
    }

    const supportedPatchFields = new Set([
      "name",
      "description",
      "availability",
      "keywords",
      "categoryId",
      "price",
      "priceMin",
      "priceMax",
      "stockQuantity",
      "images",
    ]);

    const unsupportedFields = Object.keys(body).filter(
      (key) => !supportedPatchFields.has(key),
    );

    if (unsupportedFields.length > 0) {
      return jsonError(
        `Unsupported product fields: ${unsupportedFields.join(", ")}.`,
        400,
      );
    }

    const data: ProductUpdateData = {};

    /*
     * NAME
     */

    if (hasOwn(body, "name")) {
      const name = cleanString(body.name);

      if (!name) {
        return jsonError(
          "Product name cannot be empty.",
          400,
        );
      }

      if (name.length > 200) {
        return jsonError(
          "Product name must not exceed 200 characters.",
          400,
        );
      }

      data.name = name;
    }

    /*
     * DESCRIPTION
     */

    if (hasOwn(body, "description")) {
      if (
        body.description !== null &&
        typeof body.description !== "string"
      ) {
        return jsonError(
          "Product description must be a string or null.",
          400,
        );
      }

      const description = cleanString(
        body.description,
      );

      if (description.length > 2000) {
        return jsonError(
          "Product description must not exceed 2,000 characters.",
          400,
        );
      }

      data.description = description || null;
    }

    /*
     * AVAILABILITY
     */

    if (hasOwn(body, "availability")) {
      if (!isAvailability(body.availability)) {
        return jsonError(
          "Invalid availability value.",
          400,
        );
      }

      data.availability = body.availability;
    }

    /*
     * KEYWORDS
     */

    if (hasOwn(body, "keywords")) {
      const keywordsResult = parseKeywords(
        body.keywords,
      );

      if (!keywordsResult.valid) {
        return jsonError(
          "Keywords must be an array of up to 30 strings or a comma-separated string. Each keyword may contain up to 80 characters, with 1,500 characters combined.",
          400,
        );
      }

      data.keywords = keywordsResult.value;
    }

    /*
     * CATEGORY
     */

    if (hasOwn(body, "categoryId")) {
      if (
        body.categoryId !== null &&
        typeof body.categoryId !== "string"
      ) {
        return jsonError(
          "Category ID must be a string or null.",
          400,
        );
      }

      const categoryId =
        body.categoryId === null
          ? ""
          : cleanString(body.categoryId);

      if (!categoryId) {
        data.categoryId = null;
      } else {
        if (categoryId.length > 100) {
          return jsonError(
            "Category ID is too long.",
            400,
          );
        }

        const category = await prisma.category.findFirst({
          where: {
            id: categoryId,
            isActive: true,
          },

          select: {
            id: true,
          },
        });

        if (!category) {
          return jsonError(
            "Selected category was not found or is inactive.",
            400,
          );
        }

        data.categoryId = category.id;
      }
    }

    /*
     * PRICING
     */

    const priceProvided = hasOwn(body, "price");
    const priceMinProvided = hasOwn(body, "priceMin");
    const priceMaxProvided = hasOwn(body, "priceMax");

    if (priceProvided) {
      const result = parseOptionalInteger(body.price);

      if (!result.valid) {
        return jsonError(
          "Price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }

      data.price = result.value;
    }

    if (priceMinProvided) {
      const result = parseOptionalInteger(
        body.priceMin,
      );

      if (!result.valid) {
        return jsonError(
          "Minimum price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }

      data.priceMin = result.value;
    }

    if (priceMaxProvided) {
      const result = parseOptionalInteger(
        body.priceMax,
      );

      if (!result.valid) {
        return jsonError(
          "Maximum price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }

      data.priceMax = result.value;
    }

    const finalPrice = priceProvided
      ? data.price ?? null
      : existing.price;

    const finalPriceMin = priceMinProvided
      ? data.priceMin ?? null
      : existing.priceMin;

    const finalPriceMax = priceMaxProvided
      ? data.priceMax ?? null
      : existing.priceMax;

    const pricingError = validateProductPricing(
      finalPrice,
      finalPriceMin,
      finalPriceMax,
    );

    if (pricingError) {
      return jsonError(
        pricingError,
        400,
      );
    }

    /*
     * INVENTORY / STOCK QUANTITY
     */

    if (hasOwn(body, "stockQuantity")) {
      const stockResult = parseOptionalInteger(
        body.stockQuantity,
      );

      if (!stockResult.valid) {
        return jsonError(
          "Stock quantity must be null or a whole number between 0 and 2,147,483,647.",
          400,
        );
      }

      data.stockQuantity = stockResult.value;
    }

    /*
     * IMAGE UPDATE
     */

    const imagesProvided = hasOwn(body, "images");

    let parsedImages: ParsedProductImage[] | null = null;

    if (imagesProvided) {
      const imagesResult = parseProductImages(
        body.images,
      );

      if (!imagesResult.valid) {
        return jsonError(
          "Images must contain up to 20 valid HTTP or HTTPS image URLs. Image public IDs and sort orders must also be valid.",
          400,
        );
      }

      parsedImages = imagesResult.value;

      data.imageUrl = getCompatibilityImageUrl(
        parsedImages,
      );
    }

    /*
     * NOTIFICATION EVENT
     */

    const availabilityChanged =
      hasOwn(body, "availability") &&
      data.availability !== undefined &&
      data.availability !== existing.availability;

    const hasProductChanges =
      Object.keys(data).length > 0 ||
      imagesProvided;

    if (!hasProductChanges) {
      return jsonError(
        "No supported product changes were supplied.",
        400,
      );
    }

    /*
     * DATABASE TRANSACTION
     */

    const product = await prisma.$transaction(
      async (tx) => {
        const currentProduct = await tx.product.findFirst({
          where: {
            id: existing.id,
            deletedAt: null,

            business: {
              ownerId: auth.user.id,
              deletedAt: null,
            },
          },

          select: {
            id: true,
          },
        });

        if (!currentProduct) {
          throw new Error("PRODUCT_NOT_FOUND");
        }

        await tx.product.update({
          where: {
            id: currentProduct.id,
          },

          data,
        });

        if (imagesProvided) {
          await tx.productImage.deleteMany({
            where: {
              productId: existing.id,
            },
          });

          if (
            parsedImages &&
            parsedImages.length > 0
          ) {
            await tx.productImage.createMany({
              data: parsedImages.map((image) => ({
                productId: existing.id,
                url: image.url,
                publicId: image.publicId,
                sortOrder: image.sortOrder,
              })),
            });
          }
        }

        return tx.product.findUniqueOrThrow({
          where: {
            id: existing.id,
          },

          include: {
            category: true,

            images: {
              orderBy: [
                {
                  sortOrder: "asc",
                },
                {
                  createdAt: "asc",
                },
              ],
            },

            business: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });
      },
    );

    /*
     * NOTIFY ADMINS
     *
     * Notification failures do not roll back
     * the successfully updated product.
     */

    if (hasProductChanges) {
      if (availabilityChanged) {
        await notifyAdminsOfProductEvent({
          type: NotificationType.PRODUCT_AVAILABILITY_CHANGED,
          title: "Product availability changed",

          message:
            `The availability of "${product.name}" from ${product.business.name} has changed to ${product.availability}.`,

          productId: product.id,
          businessId: product.business.id,
        });
      } else {
        await notifyAdminsOfProductEvent({
          type: NotificationType.PRODUCT_UPDATED,
          title: "Product updated",

          message:
            `"${product.name}" from ${product.business.name} was updated by the seller.`,

          productId: product.id,
          businessId: product.business.id,
        });
      }
    }

    return NextResponse.json(
      {
        message: "Product updated successfully.",
        product,
      },
      {
        headers: jsonHeaders(),
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "PRODUCT_NOT_FOUND"
    ) {
      return jsonError(
        "Product could not be found.",
        404,
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return jsonError(
        "Product could not be found.",
        404,
      );
    }

    console.error(
      "Seller product PATCH error:",
      error,
    );

    return jsonError(
      "Unable to update product.",
      500,
    );
  }
}

/*
 * --------------------------------------------------
 * DELETE
 * --------------------------------------------------
 *
 * Soft delete only.
 *
 * ProductImage records are intentionally preserved.
 * Product.imageUrl and image records are not removed
 * from Cloudinary by this endpoint.
 *
 * Pending and inactive businesses are allowed.
 * --------------------------------------------------
 */

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const auth = await requireSellerAccount();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const businessError = validateSellerBusiness(
      auth.business,
      auth.user.id,
    );

    if (businessError) {
      return businessError;
    }

    const { id } = await context.params;

    if (
      !id ||
      id.length > MAX_PRODUCT_ID_LENGTH
    ) {
      return jsonError(
        "Invalid product ID.",
        400,
      );
    }

    const product = await getSellerProduct(
      id,
      auth.user.id,
    );

    if (!product) {
      return jsonError(
        "Product not found.",
        404,
      );
    }

    const deletedAt = new Date();

    const result = await prisma.product.updateMany({
      where: {
        id: product.id,
        deletedAt: null,

        business: {
          ownerId: auth.user.id,
          deletedAt: null,
        },
      },

      data: {
        deletedAt,
        deletedById: auth.user.id,
      },
    });

    if (result.count !== 1) {
      return jsonError(
        "Product could not be deleted because it was already deleted or is no longer available.",
        409,
      );
    }

    /*
     * Notify admins after the soft deletion succeeds.
     */

    await notifyAdminsOfProductEvent({
      type: NotificationType.PRODUCT_REMOVED,
      title: "Product removed",

      message:
        `"${product.business.name}" has removed the product "${product.name}".`,

      productId: product.id,
      businessId: product.business.id,
      dedupePrefix: "product-removed",
    });

    return NextResponse.json(
      {
        message: "Product deleted successfully.",
        productId: product.id,
        deletedAt: deletedAt.toISOString(),
      },
      {
        headers: jsonHeaders(),
      },
    );
  } catch (error) {
    console.error(
      "Seller product DELETE error:",
      error,
    );

    return jsonError(
      "Unable to delete product.",
      500,
    );
  }
}