
import {
  Availability,
  BusinessStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
  ServiceFulfillmentType,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notifications";
import { validateProductPricing } from "@/lib/product-pricing";

const MAX_SERVICE_ID_LENGTH = 100;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_SERVICE_IMAGES = 20;
const MAX_IMAGE_URL_LENGTH = 2000;
const MAX_PUBLIC_ID_LENGTH = 500;
const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS_TOTAL_LENGTH = 1500;
const MAX_PRISMA_INT = 2_147_483_647;

const VALID_STATUSES = [
  BusinessStatus.ACTIVE,
  BusinessStatus.INACTIVE,
  BusinessStatus.PENDING,
] as const;

const VALID_AVAILABILITIES = [
  Availability.AVAILABLE,
  Availability.ASK_SELLER,
  Availability.UNAVAILABLE,
] as const;

const VALID_FULFILLMENT_TYPES = [
  ServiceFulfillmentType.AT_PROVIDER,
  ServiceFulfillmentType.AT_CUSTOMER,
  ServiceFulfillmentType.REMOTE,
  ServiceFulfillmentType.FLEXIBLE,
] as const;

type ServiceStatus = (typeof VALID_STATUSES)[number];
type ServiceAvailability = (typeof VALID_AVAILABILITIES)[number];
type FulfillmentType = (typeof VALID_FULFILLMENT_TYPES)[number];

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ServiceImageInput = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type ServicePricingValues = {
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
};

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "TOO_LARGE" | "INVALID_JSON" };

type ServiceUpdateData = Prisma.ServiceUncheckedUpdateInput;

class ServicePricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServicePricingError";
  }
}

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: jsonHeaders(),
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasOwn(
  payload: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isServiceStatus(value: unknown): value is ServiceStatus {
  return VALID_STATUSES.includes(value as ServiceStatus);
}

function isAvailability(value: unknown): value is ServiceAvailability {
  return VALID_AVAILABILITIES.includes(
    value as ServiceAvailability,
  );
}

function isFulfillmentType(value: unknown): value is FulfillmentType {
  return VALID_FULFILLMENT_TYPES.includes(
    value as FulfillmentType,
  );
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
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

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          value.trim() !== ""
        ? Number(value.trim())
        : Number.NaN;

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
 * REQUEST BODY
 * --------------------------------------------------
 */

async function readJsonBody(
  request: Request,
): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const declaredLength = Number(contentLength);

    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > MAX_REQUEST_BYTES
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

      if (totalBytes > MAX_REQUEST_BYTES) {
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
      // Reader may already have been cancelled.
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
 * KEYWORDS
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

    if (!keyword) continue;

    if (keyword.length > MAX_KEYWORD_LENGTH) {
      return {
        valid: false,
        value: [],
      };
    }

    if (seen.has(keyword)) continue;

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
 * IMAGE VALIDATION
 * --------------------------------------------------
 */

function isSafeImageUrl(value: string): boolean {
  if (!value || value.length > MAX_IMAGE_URL_LENGTH) {
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

function parseImages(
  value: unknown,
): {
  valid: boolean;
  value: ServiceImageInput[];
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

  const parsed: ServiceImageInput[] = [];

  for (let index = 0; index < value.length; index += 1) {
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
        const order = parseOptionalInteger(item.sortOrder);

        if (!order.valid || order.value === null) {
          return {
            valid: false,
            value: [],
          };
        }

        sortOrder = order.value;
      }
    } else {
      return {
        valid: false,
        value: [],
      };
    }

    if (!isSafeImageUrl(url)) {
      return {
        valid: false,
        value: [],
      };
    }

    parsed.push({
      url,
      publicId,
      sortOrder,
    });
  }

  parsed.sort((a, b) => a.sortOrder - b.sortOrder);

  const seenUrls = new Set<string>();
  const uniqueImages: ServiceImageInput[] = [];

  for (const image of parsed) {
    if (seenUrls.has(image.url)) continue;

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

/*
 * --------------------------------------------------
 * SERVICE LOOKUP
 * --------------------------------------------------
 */

async function getService(serviceId: string) {
  return prisma.service.findUnique({
    where: {
      id: serviceId,
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
              street: true,
            },
          },
        },
      },
      category: true,
      images: {
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },
      _count: {
        select: {
          bookings: true,
        },
      },
    },
  });
}

/*
 * --------------------------------------------------
 * OWNER NOTIFICATION
 * --------------------------------------------------
 */

async function notifyServiceOwner(input: {
  ownerId: string | null;
  serviceId: string;
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
        serviceId: input.serviceId,
        businessId: input.businessId,
        href: `/seller/${input.businessId}`,
      },
      ...(input.dedupeKey
        ? { dedupeKey: input.dedupeKey }
        : {}),
    });
  } catch (error) {
    console.error("Service owner notification error:", error);
  }
}

/*
 * --------------------------------------------------
 * UPDATE SERVICE TRANSACTION
 * --------------------------------------------------
 *
 * Pricing values are kept separate from Prisma's
 * update input to avoid nullable field-operation types.
 *
 * Service fields and images are saved atomically.
 * Existing booking records are preserved.
 * --------------------------------------------------
 */

async function updateServiceWithTransaction(input: {
  serviceId: string;
  data: ServiceUpdateData;
  imageInputs?: ServiceImageInput[];
  pricingWasProvided: boolean;
  pricingValues: ServicePricingValues;
  requestedStatus?: ServiceStatus;
}): Promise<{
  service: NonNullable<
    Awaited<ReturnType<typeof getService>>
  >;
  ownerId: string | null;
  previousAvailability: Availability;
  previousStatus: BusinessStatus;
}> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.service.findUnique({
      where: {
        id: input.serviceId,
      },
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

    if (!current || current.deletedAt) {
      throw new Error("SERVICE_NOT_FOUND");
    }

    if (current.business.deletedAt) {
      throw new Error("BUSINESS_DELETED");
    }

    const isActivating =
      current.status !== BusinessStatus.ACTIVE &&
      input.requestedStatus === BusinessStatus.ACTIVE;

    if (input.pricingWasProvided || isActivating) {
      const finalPrice: number | null =
        input.pricingValues.price !== undefined
          ? input.pricingValues.price
          : current.price;

      const finalPriceMin: number | null =
        input.pricingValues.priceMin !== undefined
          ? input.pricingValues.priceMin
          : current.priceMin;

      const finalPriceMax: number | null =
        input.pricingValues.priceMax !== undefined
          ? input.pricingValues.priceMax
          : current.priceMax;

      const pricingError = validateProductPricing(
        finalPrice,
        finalPriceMin,
        finalPriceMax,
      );

      if (pricingError) {
        throw new ServicePricingError(pricingError);
      }
    }

    if (Object.keys(input.data).length > 0) {
      await tx.service.update({
        where: {
          id: current.id,
        },
        data: input.data,
      });
    }

    if (input.imageInputs !== undefined) {
      await tx.serviceImage.deleteMany({
        where: {
          serviceId: current.id,
        },
      });

      if (input.imageInputs.length > 0) {
        await tx.serviceImage.createMany({
          data: input.imageInputs.map((image) => ({
            serviceId: current.id,
            url: image.url,
            publicId: image.publicId,
            sortOrder: image.sortOrder,
          })),
        });
      }
    }

    const updated = await tx.service.findUniqueOrThrow({
      where: {
        id: current.id,
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
                street: true,
              },
            },
          },
        },
        category: true,
        images: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    return {
      service: updated,
      ownerId: current.business.ownerId,
      previousAvailability: current.availability,
      previousStatus: current.status,
    };
  });
}

/*
 * --------------------------------------------------
 * GET
 * --------------------------------------------------
 *
 * GET /api/admin/services/[id]
 * --------------------------------------------------
 */

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;

    if (!id || id.length > MAX_SERVICE_ID_LENGTH) {
      return jsonError("Invalid service ID.", 400);
    }

    const service = await getService(id);

    if (!service) {
      return jsonError("Service not found.", 404);
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
    console.error("Admin service GET error:", error);
    return jsonError("Unable to load service.", 500);
  }
}

/*
 * --------------------------------------------------
 * PATCH
 * --------------------------------------------------
 *
 * PATCH /api/admin/services/[id]
 *
 * Supported fields:
 * name, description, categoryId,
 * price, priceMin, priceMax,
 * availability, fulfillmentType,
 * durationMinutes, keywords,
 * images, status.
 * --------------------------------------------------
 */

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;

    if (!id || id.length > MAX_SERVICE_ID_LENGTH) {
      return jsonError("Invalid service ID.", 400);
    }

    const existing = await getService(id);

    if (!existing) {
      return jsonError("Service not found.", 404);
    }

    if (existing.deletedAt) {
      return jsonError(
        "This service has been deleted and cannot be edited.",
        409,
      );
    }

    if (existing.business.deletedAt) {
      return jsonError(
        "This business has been deleted and its services cannot be edited.",
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

    const data: ServiceUpdateData = {};
    const pricingValues: ServicePricingValues = {};

    let requestedStatus: ServiceStatus | undefined;

    /*
     * NAME
     */

    if (hasOwn(body, "name")) {
      const name = cleanString(body.name);

      if (!name) {
        return jsonError("Service name is required.", 400);
      }

      if (name.length > 200) {
        return jsonError(
          "Service name must not exceed 200 characters.",
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
          "Service description must be a string or null.",
          400,
        );
      }

      const description = cleanString(body.description);

      if (description.length > 4000) {
        return jsonError(
          "Service description must not exceed 4,000 characters.",
          400,
        );
      }

      data.description = description || null;
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
     *
     * Keep numeric values separate from Prisma's
     * update-operation input type.
     */

    const pricingWasProvided =
      hasOwn(body, "price") ||
      hasOwn(body, "priceMin") ||
      hasOwn(body, "priceMax");

    if (hasOwn(body, "price")) {
      const parsed = parseOptionalInteger(body.price);

      if (!parsed.valid) {
        return jsonError(
          "Price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }

      data.price = parsed.value;
      pricingValues.price = parsed.value;
    }

    if (hasOwn(body, "priceMin")) {
      const parsed = parseOptionalInteger(body.priceMin);

      if (!parsed.valid) {
        return jsonError(
          "Minimum price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }

      data.priceMin = parsed.value;
      pricingValues.priceMin = parsed.value;
    }

    if (hasOwn(body, "priceMax")) {
      const parsed = parseOptionalInteger(body.priceMax);

      if (!parsed.valid) {
        return jsonError(
          "Maximum price must be a whole number between 0 and 2,147,483,647.",
          400,
        );
      }

      data.priceMax = parsed.value;
      pricingValues.priceMax = parsed.value;
    }

    /*
     * AVAILABILITY
     */

    if (hasOwn(body, "availability")) {
      if (!isAvailability(body.availability)) {
        return jsonError("Invalid availability value.", 400);
      }

      data.availability = body.availability;
    }

    /*
     * FULFILLMENT
     */

    if (hasOwn(body, "fulfillmentType")) {
      if (!isFulfillmentType(body.fulfillmentType)) {
        return jsonError(
          "Invalid service fulfillment type.",
          400,
        );
      }

      data.fulfillmentType = body.fulfillmentType;
    }

    /*
     * DURATION
     */

    if (hasOwn(body, "durationMinutes")) {
      const duration = parseOptionalInteger(
        body.durationMinutes,
      );

      if (!duration.valid) {
        return jsonError(
          "Duration must be a whole number greater than zero.",
          400,
        );
      }

      if (
        duration.value !== null &&
        duration.value <= 0
      ) {
        return jsonError(
          "Duration must be greater than zero minutes.",
          400,
        );
      }

      data.durationMinutes = duration.value;
    }

    /*
     * KEYWORDS
     */

    if (hasOwn(body, "keywords")) {
      const parsed = parseKeywords(body.keywords);

      if (!parsed.valid) {
        return jsonError(
          "Keywords must contain no more than 30 strings, each at most 80 characters, with 1,500 characters combined.",
          400,
        );
      }

      data.keywords = parsed.value;
    }

    /*
     * SERVICE STATUS
     */

    if (hasOwn(body, "status")) {
      if (!isServiceStatus(body.status)) {
        return jsonError(
          "Invalid service status. Use ACTIVE, INACTIVE or PENDING.",
          400,
        );
      }

      requestedStatus = body.status;
      data.status = requestedStatus;
    }

    /*
     * IMAGES
     *
     * Omitted: preserve existing images.
     * []: remove all images.
     * [...]: replace existing images.
     */

    let imageInputs: ServiceImageInput[] | undefined;

    if (hasOwn(body, "images")) {
      const parsed = parseImages(body.images);

      if (!parsed.valid) {
        return jsonError(
          "Images must be an array of up to 20 valid HTTP or HTTPS image records.",
          400,
        );
      }

      imageInputs = parsed.value;
      data.imageUrl = imageInputs[0]?.url ?? null;
    }

    if (
      Object.keys(data).length === 0 &&
      imageInputs === undefined
    ) {
      return jsonError(
        "No supported changes were provided.",
        400,
      );
    }

    /*
     * UPDATE SERVICE
     */

    const updated = await updateServiceWithTransaction({
      serviceId: id,
      data,
      imageInputs,
      pricingWasProvided,
      pricingValues,
      requestedStatus,
    });

    /*
     * NOTIFY SERVICE OWNER
     *
     * Notification failure does not undo the
     * successfully updated service.
     */

    const availabilityChanged =
      updated.service.availability !==
      updated.previousAvailability;

    const statusChanged =
      updated.service.status !==
      updated.previousStatus;

    if (availabilityChanged || statusChanged || Object.keys(data).length > 0 || imageInputs !== undefined) {
      await notifyServiceOwner({
        ownerId: updated.ownerId,
        serviceId: updated.service.id,
        businessId: updated.service.business.id,

        type: availabilityChanged
          ? NotificationType.SERVICE_AVAILABILITY_CHANGED
          : NotificationType.SERVICE_UPDATED,

        title: availabilityChanged
          ? "Service availability changed"
          : "Service updated",

        message: availabilityChanged
          ? `The availability of "${updated.service.name}" has been changed by a ReMarket admin.`
          : `"${updated.service.name}" has been updated by a ReMarket admin.`,
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Service updated successfully.",
        service: updated.service,
      },
      {
        headers: jsonHeaders(),
      },
    );
  } catch (error) {
    if (error instanceof ServicePricingError) {
      return jsonError(error.message, 400);
    }

    if (
      error instanceof Error &&
      error.message === "SERVICE_NOT_FOUND"
    ) {
      return jsonError("Service not found.", 404);
    }

    if (
      error instanceof Error &&
      error.message === "BUSINESS_DELETED"
    ) {
      return jsonError(
        "This business has been deleted and its services cannot be edited.",
        409,
      );
    }

    if (isPrismaErrorCode(error, "P2025")) {
      return jsonError("Service could not be found.", 404);
    }

    console.error("Admin service PATCH error:", error);
    return jsonError("Unable to update service.", 500);
  }
}

/*
 * --------------------------------------------------
 * DELETE
 * --------------------------------------------------
 *
 * Soft-deletes a service.
 *
 * Does not hard-delete the service, its images,
 * or existing service bookings.
 * --------------------------------------------------
 */

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;

    if (!id || id.length > MAX_SERVICE_ID_LENGTH) {
      return jsonError("Invalid service ID.", 400);
    }

    const existing = await prisma.service.findUnique({
      where: {
        id,
      },
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

    if (!existing) {
      return jsonError("Service not found.", 404);
    }

    if (existing.deletedAt) {
      return NextResponse.json(
        {
          success: true,
          alreadyDeleted: true,
          serviceId: existing.id,
        },
        {
          headers: jsonHeaders(),
        },
      );
    }

    const deletedAt = new Date();

    const result = await prisma.service.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        deletedAt,
        deletedById: auth.user.id,
      },
    });

    if (result.count !== 1) {
      return jsonError(
        "Service could not be deleted because it was already deleted or changed.",
        409,
      );
    }

    await notifyServiceOwner({
      ownerId: existing.business.ownerId,
      serviceId: existing.id,
      businessId: existing.business.id,
      type: NotificationType.SERVICE_REMOVED,
      title: "Service removed",
      message: `"${existing.name}" has been removed from your ReMarket business by an admin.`,
      dedupeKey: `service-removed:${existing.id}:${existing.business.ownerId ?? "no-owner"}`,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Service deleted successfully.",
        serviceId: existing.id,
        deletedAt: deletedAt.toISOString(),
      },
      {
        headers: jsonHeaders(),
      },
    );
  } catch (error) {
    console.error("Admin service DELETE error:", error);
    return jsonError("Unable to delete service.", 500);
  }
}
