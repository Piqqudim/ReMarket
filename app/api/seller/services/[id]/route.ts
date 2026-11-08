import {
  Availability as PrismaAvailability,
  NotificationPriority,
  NotificationType,
  Prisma,
  ServiceFulfillmentType,
} from "@prisma/client";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { validateProductPricing } from "@/lib/product-pricing";
import { requireSeller } from "@/lib/seller-auth";
import { createNotification } from "@/lib/notifications";

const MAX_SERVICE_ID_LENGTH = 100;
const MAX_CATEGORY_ID_LENGTH = 100;
const MAX_REQUEST_BYTES = 256 * 1024;

const MAX_SERVICE_IMAGES = 20;
const MAX_IMAGE_URL_LENGTH = 2000;
const MAX_PUBLIC_ID_LENGTH = 500;

const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS_TOTAL_LENGTH = 1500;

const MAX_PRISMA_INT = 2_147_483_647;

const ALLOWED_AVAILABILITY = [
  PrismaAvailability.AVAILABLE,
  PrismaAvailability.ASK_SELLER,
  PrismaAvailability.UNAVAILABLE,
] as const;

const ALLOWED_FULFILLMENT_TYPES = [
  ServiceFulfillmentType.AT_PROVIDER,
  ServiceFulfillmentType.AT_CUSTOMER,
  ServiceFulfillmentType.REMOTE,
  ServiceFulfillmentType.FLEXIBLE,
] as const;

type ServiceAvailability =
  (typeof ALLOWED_AVAILABILITY)[number];

type FulfillmentType =
  (typeof ALLOWED_FULFILLMENT_TYPES)[number];

type ParsedServiceImage = {
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

/* -------------------------------------------------------------------------- */
/* RESPONSE HELPERS                                                           */
/* -------------------------------------------------------------------------- */

function jsonHeaders() {
  return {
    "Cache-Control":
      "no-store, max-age=0, must-revalidate",
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

/* -------------------------------------------------------------------------- */
/* GENERAL HELPERS                                                            */
/* -------------------------------------------------------------------------- */

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
): value is ServiceAvailability {
  return ALLOWED_AVAILABILITY.includes(
    value as ServiceAvailability,
  );
}

function isFulfillmentType(
  value: unknown,
): value is FulfillmentType {
  return ALLOWED_FULFILLMENT_TYPES.includes(
    value as FulfillmentType,
  );
}

/* -------------------------------------------------------------------------- */
/* REQUEST BODY                                                               */
/* -------------------------------------------------------------------------- */

async function readJsonBody(
  request: Request,
  maximumBytes = MAX_REQUEST_BYTES,
): Promise<JsonBodyResult> {
  const contentLength =
    request.headers.get("content-length");

  if (contentLength !== null) {
    const declaredLength = Number(contentLength);

    if (
      !Number.isSafeInteger(declaredLength) ||
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

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

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

/* -------------------------------------------------------------------------- */
/* INTEGER VALIDATION                                                         */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* IMAGE VALIDATION                                                           */
/* -------------------------------------------------------------------------- */

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

/**
 * Accepted formats:
 *
 * 1. Plain URL strings for backward compatibility.
 * 2. Objects containing url, publicId and sortOrder.
 *
 * Duplicate URLs are removed.
 * The final positions are normalized to zero-based order.
 */
function parseServiceImages(
  value: unknown,
): {
  valid: boolean;
  value: ParsedServiceImage[];
} {
  if (
    !Array.isArray(value) ||
    value.length > MAX_SERVICE_IMAGES
  ) {
    return {
      valid: false,
      value: [],
    };
  }

  const images: ParsedServiceImage[] = [];

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const item = value[index];

    let url = "";
    let publicId: string | null = null;
    let sortOrder = index;

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
        const parsedSortOrder =
          parseOptionalInteger(item.sortOrder);

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

  images.sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const seenUrls = new Set<string>();
  const uniqueImages: ParsedServiceImage[] = [];

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
  images: ParsedServiceImage[],
): string | null {
  return images[0]?.url ?? null;
}

/* -------------------------------------------------------------------------- */
/* KEYWORD VALIDATION                                                         */
/* -------------------------------------------------------------------------- */

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

    if (
      totalLength > MAX_KEYWORDS_TOTAL_LENGTH
    ) {
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

/* -------------------------------------------------------------------------- */
/* NOTIFICATION HELPERS                                                       */
/* -------------------------------------------------------------------------- */

async function notifyAdminsOfServiceEvent(
  input: {
    type: NotificationType;
    title: string;
    message: string;
    serviceId: string;
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
            serviceId: input.serviceId,
            businessId: input.businessId,
            href: "/admin/services",
          },

          dedupeKey: input.dedupePrefix
            ? `${input.dedupePrefix}:${input.serviceId}:admin:${admin.id}`
            : null,
        });
      } catch (notificationError) {
        console.error(
          "Seller service admin notification error:",
          notificationError,
        );
      }
    }
  } catch (adminLookupError) {
    console.error(
      "Seller service admin lookup error:",
      adminLookupError,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* SELLER SERVICE LOOKUP                                                      */
/* -------------------------------------------------------------------------- */

async function getSellerService(
  serviceId: string,
  sellerId: string,
) {
  return prisma.service.findFirst({
    where: {
      id: serviceId,
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
          { sortOrder: "asc" },
          { createdAt: "asc" },
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

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await context.params;

    if (
      !id ||
      id.length > MAX_SERVICE_ID_LENGTH
    ) {
      return jsonError(
        "Invalid service ID.",
        400,
      );
    }

    const service = await getSellerService(
      id,
      auth.user.id,
    );

    if (!service) {
      return jsonError(
        "Service not found.",
        404,
      );
    }

    return NextResponse.json(
      {
        service,
      },
      {
        headers: jsonHeaders(),
      },
    );
  } catch (error) {
    console.error(
      "Seller service GET error:",
      error,
    );

    return jsonError(
      "Unable to load service.",
      500,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH                                                                      */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await context.params;

    if (
      !id ||
      id.length > MAX_SERVICE_ID_LENGTH
    ) {
      return jsonError(
        "Invalid service ID.",
        400,
      );
    }

    const existing = await getSellerService(
      id,
      auth.user.id,
    );

    if (!existing) {
      return jsonError(
        "Service not found.",
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

    const data: Prisma.ServiceUncheckedUpdateInput = {};

    /* ---------------------------------------------------------------------- */
    /* NAME                                                                   */
    /* ---------------------------------------------------------------------- */

    if (hasOwn(body, "name")) {
      const name = cleanString(body.name);

      if (!name) {
        return jsonError(
          "Service name cannot be empty.",
          400,
        );
      }

      if (name.length > 200) {
        return jsonError(
          "Service name must not exceed 200 characters.",
          400,
        );
      }

      data.name = name;
    }

    /* ---------------------------------------------------------------------- */
    /* DESCRIPTION                                                            */
    /* ---------------------------------------------------------------------- */

    if (hasOwn(body, "description")) {
      if (
        body.description !== null &&
        typeof body.description !== "string"
      ) {
        return jsonError(
          "Service description must be a string or null.",
          400,
        );
      }

      const description = cleanString(
        body.description,
      );

      if (description.length > 4000) {
        return jsonError(
          "Service description must not exceed 4,000 characters.",
          400,
        );
      }

      data.description = description || null;
    }

    /* ---------------------------------------------------------------------- */
    /* AVAILABILITY                                                           */
    /* ---------------------------------------------------------------------- */

    if (hasOwn(body, "availability")) {
      if (!isAvailability(body.availability)) {
        return jsonError(
          "Invalid availability value.",
          400,
        );
      }

      data.availability = body.availability;
    }

    const availabilityChanged =
      hasOwn(body, "availability") &&
      isAvailability(body.availability) &&
      body.availability !== existing.availability;

    /* ---------------------------------------------------------------------- */
    /* FULFILLMENT TYPE                                                       */
    /* ---------------------------------------------------------------------- */

    if (hasOwn(body, "fulfillmentType")) {
      if (!isFulfillmentType(body.fulfillmentType)) {
        return jsonError(
          "Invalid service fulfillment type.",
          400,
        );
      }

      data.fulfillmentType = body.fulfillmentType;
    }

    /* ---------------------------------------------------------------------- */
    /* DURATION                                                               */
    /* ---------------------------------------------------------------------- */

    if (hasOwn(body, "durationMinutes")) {
      const durationResult = parseOptionalInteger(
        body.durationMinutes,
      );

      if (!durationResult.valid) {
        return jsonError(
          "Duration must be a whole number greater than zero.",
          400,
        );
      }

      if (
        durationResult.value !== null &&
        durationResult.value <= 0
      ) {
        return jsonError(
          "Duration must be greater than zero minutes.",
          400,
        );
      }

      data.durationMinutes = durationResult.value;
    }

    /* ---------------------------------------------------------------------- */
    /* KEYWORDS                                                               */
    /* ---------------------------------------------------------------------- */

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

    /* ---------------------------------------------------------------------- */
    /* CATEGORY                                                               */
    /* ---------------------------------------------------------------------- */

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
        if (
          categoryId.length >
          MAX_CATEGORY_ID_LENGTH
        ) {
          return jsonError(
            "Category ID is too long.",
            400,
          );
        }

        const category =
          await prisma.category.findFirst({
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

    /* ---------------------------------------------------------------------- */
    /* PRICING                                                                */
    /* ---------------------------------------------------------------------- */

    const priceProvided = hasOwn(body, "price");

    const priceMinProvided = hasOwn(
      body,
      "priceMin",
    );

    const priceMaxProvided = hasOwn(
      body,
      "priceMax",
    );

    let finalPrice: number | null =
      existing.price;

    let finalPriceMin: number | null =
      existing.priceMin;

    let finalPriceMax: number | null =
      existing.priceMax;

    if (priceProvided) {
      const result = parseOptionalInteger(
        body.price,
      );

      if (!result.valid) {
        return jsonError(
          "Price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }

      finalPrice = result.value;
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

      finalPriceMin = result.value;
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

      finalPriceMax = result.value;
      data.priceMax = result.value;
    }

    /*
     * IMPORTANT:
     *
     * A service can have no fixed price or price range.
     * The seller may quote the buyer after receiving a request.
     *
     * Any supplied price must still be valid.
     */
    const pricingError = validateProductPricing(
      finalPrice,
      finalPriceMin,
      finalPriceMax,
      {
        requirePrice: false,
      },
    );

    if (pricingError) {
      return jsonError(
        pricingError,
        400,
      );
    }

    /* ---------------------------------------------------------------------- */
    /* IMAGES                                                                 */
    /* ---------------------------------------------------------------------- */

    const imagesProvided = hasOwn(body, "images");

    let parsedImages: ParsedServiceImage[] | null =
      null;

    if (imagesProvided) {
      const imagesResult = parseServiceImages(
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

    /* ---------------------------------------------------------------------- */
    /* CHECK FOR SUPPORTED CHANGES                                            */
    /* ---------------------------------------------------------------------- */

    if (Object.keys(data).length === 0) {
      return jsonError(
        "No supported changes were supplied.",
        400,
      );
    }

    /* ---------------------------------------------------------------------- */
    /* DATABASE TRANSACTION                                                   */
    /* ---------------------------------------------------------------------- */

    const service = await prisma.$transaction(
      async (tx) => {
        const currentService =
          await tx.service.findFirst({
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

        if (!currentService) {
          throw new Error("SERVICE_NOT_FOUND");
        }

        await tx.service.update({
          where: {
            id: currentService.id,
          },

          data,
        });

        /*
         * Images are replaced only when the request
         * explicitly supplies the images property.
         */
        if (imagesProvided) {
          await tx.serviceImage.deleteMany({
            where: {
              serviceId: existing.id,
            },
          });

          if (
            parsedImages &&
            parsedImages.length > 0
          ) {
            await tx.serviceImage.createMany({
              data: parsedImages.map((image) => ({
                serviceId: existing.id,
                url: image.url,
                publicId: image.publicId,
                sortOrder: image.sortOrder,
              })),
            });
          }
        }

        return tx.service.findUniqueOrThrow({
          where: {
            id: existing.id,
          },

          include: {
            category: true,

            images: {
              orderBy: [
                { sortOrder: "asc" },
                { createdAt: "asc" },
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

    /* ---------------------------------------------------------------------- */
    /* ADMIN NOTIFICATIONS                                                    */
    /* ---------------------------------------------------------------------- */

    if (availabilityChanged) {
      await notifyAdminsOfServiceEvent({
        type:
          NotificationType.SERVICE_AVAILABILITY_CHANGED,

        title: "Service availability changed",

        message:
          `The availability of "${service.name}" from ${service.business.name} has changed to ${service.availability}.`,

        serviceId: service.id,

        businessId: service.business.id,
      });
    } else {
      await notifyAdminsOfServiceEvent({
        type: NotificationType.SERVICE_UPDATED,

        title: "Service updated",

        message:
          `"${service.name}" from ${service.business.name} was updated by the seller.`,

        serviceId: service.id,

        businessId: service.business.id,
      });
    }

    return NextResponse.json(
      {
        message: "Service updated successfully.",
        service,
      },
      {
        headers: jsonHeaders(),
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "SERVICE_NOT_FOUND"
    ) {
      return jsonError(
        "Service could not be found.",
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
        "Service could not be found.",
        404,
      );
    }

    console.error(
      "Seller service PATCH error:",
      error,
    );

    return jsonError(
      "Unable to update service.",
      500,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE                                                                     */
/* -------------------------------------------------------------------------- */

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await context.params;

    if (
      !id ||
      id.length > MAX_SERVICE_ID_LENGTH
    ) {
      return jsonError(
        "Invalid service ID.",
        400,
      );
    }

    const service = await getSellerService(
      id,
      auth.user.id,
    );

    if (!service) {
      return jsonError(
        "Service not found.",
        404,
      );
    }

    const deletedAt = new Date();

    const result = await prisma.service.updateMany({
      where: {
        id: service.id,
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
        "Service could not be deleted because it was already deleted or is no longer available.",
        409,
      );
    }

    await notifyAdminsOfServiceEvent({
      type: NotificationType.SERVICE_REMOVED,

      title: "Service removed",

      message:
        `${service.business.name} has removed the service "${service.name}".`,

      serviceId: service.id,

      businessId: service.business.id,

      dedupePrefix: "service-removed",
    });

    return NextResponse.json(
      {
        message: "Service deleted successfully.",

        serviceId: service.id,

        deletedAt: deletedAt.toISOString(),
      },
      {
        headers: jsonHeaders(),
      },
    );
  } catch (error) {
    console.error(
      "Seller service DELETE error:",
      error,
    );

    return jsonError(
      "Unable to delete service.",
      500,
    );
  }
}