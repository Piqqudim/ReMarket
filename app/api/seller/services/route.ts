import { NextResponse } from "next/server";
import {
  NotificationPriority,
  NotificationType,
  Prisma,
  ServiceFulfillmentType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { validateProductPricing } from "@/lib/product-pricing";
import { requireSeller } from "@/lib/seller-auth";
import { createNotification } from "@/lib/notifications";

const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const MAX_SERVICE_IMAGES = 20;
const MAX_IMAGE_URL_LENGTH = 2000;
const MAX_PUBLIC_ID_LENGTH = 500;
const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS_TOTAL_LENGTH = 1500;
const MAX_PRISMA_INT = 2_147_483_647;

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

const ALLOWED_FULFILLMENT_TYPES = [
  "AT_PROVIDER",
  "AT_CUSTOMER",
  "REMOTE",
  "FLEXIBLE",
] as const;

type Availability =
  (typeof ALLOWED_AVAILABILITY)[number];

type FulfillmentType =
  (typeof ALLOWED_FULFILLMENT_TYPES)[number];

type ParsedServiceImage = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type ParseResult<T> = {
  valid: boolean;
  value: T;
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasOwn(
  value: Record<string, unknown>,
  key: string
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value === "AVAILABLE" ||
    value === "ASK_SELLER" ||
    value === "UNAVAILABLE"
  );
}

function isFulfillmentType(
  value: unknown
): value is FulfillmentType {
  return (
    value === "AT_PROVIDER" ||
    value === "AT_CUSTOMER" ||
    value === "REMOTE" ||
    value === "FLEXIBLE"
  );
}

function isPrismaInt(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PRISMA_INT
  );
}

function parseOptionalInteger(
  value: unknown
): ParseResult<number | null> {
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

  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return {
      valid: false,
      value: null,
    };
  }

  if (
    typeof value === "string" &&
    value.trim() === ""
  ) {
    return {
      valid: false,
      value: null,
    };
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value.trim());

  if (!isPrismaInt(parsed)) {
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
/* KEYWORDS                                                                    */
/* -------------------------------------------------------------------------- */

function parseKeywords(
  value: unknown
): ParseResult<string[]> {
  if (value === undefined) {
    return {
      valid: true,
      value: [],
    };
  }

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

  const normalized: string[] = [];
  const seen = new Set<string>();

  let totalLength = 0;

  for (const item of values) {
    if (typeof item !== "string") {
      return {
        valid: false,
        value: [],
      };
    }

    const cleaned = item.trim();

    if (!cleaned) {
      continue;
    }

    if (cleaned.length > MAX_KEYWORD_LENGTH) {
      return {
        valid: false,
        value: [],
      };
    }

    const normalizedKey =
      cleaned.toLocaleLowerCase();

    if (seen.has(normalizedKey)) {
      continue;
    }

    seen.add(normalizedKey);
    normalized.push(cleaned);

    totalLength += cleaned.length;

    if (
      normalized.length > MAX_KEYWORDS ||
      totalLength > MAX_KEYWORDS_TOTAL_LENGTH
    ) {
      return {
        valid: false,
        value: [],
      };
    }
  }

  return {
    valid: true,
    value: normalized,
  };
}

/* -------------------------------------------------------------------------- */
/* IMAGE URL VALIDATION                                                       */
/* -------------------------------------------------------------------------- */

function parseHttpUrl(
  value: string
): string | null {
  if (
    !value ||
    value.length > MAX_IMAGE_URL_LENGTH
  ) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (
      (parsed.protocol !== "https:" &&
        parsed.protocol !== "http:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* SERVICE IMAGES                                                             */
/* -------------------------------------------------------------------------- */

/**
 * ServiceImage is the primary image record.
 * Service.imageUrl is a compatibility mirror of
 * the first image.
 *
 * This endpoint accepts image URLs and Cloudinary
 * public IDs from the existing image-upload flow.
 *
 * It does not upload files to Cloudinary itself.
 */

function parseServiceImages(
  value: unknown
): ParseResult<ParsedServiceImage[]> {
  if (value === undefined) {
    return {
      valid: true,
      value: [],
    };
  }

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
  const seenUrls = new Set<string>();

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const item = value[index];

    let rawUrl: string;
    let publicId: string | null = null;
    let sortOrder = index;

    if (typeof item === "string") {
      rawUrl = item.trim();

      if (!rawUrl) {
        return {
          valid: false,
          value: [],
        };
      }
    } else {
      if (!isRecord(item)) {
        return {
          valid: false,
          value: [],
        };
      }

      rawUrl = cleanString(item.url);

      if (!rawUrl) {
        return {
          valid: false,
          value: [],
        };
      }

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
    }

    const url = parseHttpUrl(rawUrl);

    if (!url || url.length > MAX_IMAGE_URL_LENGTH) {
      return {
        valid: false,
        value: [],
      };
    }

    if (seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);

    images.push({
      url,
      publicId,
      sortOrder,
    });
  }

  images.sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  return {
    valid: true,
    value: images.map((image, index) => ({
      ...image,
      sortOrder: index,
    })),
  };
}

function getCompatibilityImageUrl(
  images: ParsedServiceImage[]
): string | null {
  return images[0]?.url ?? null;
}

/* -------------------------------------------------------------------------- */
/* REQUEST BODY                                                               */
/* -------------------------------------------------------------------------- */

function isRequestBodyTooLarge(
  request: Request
): boolean {
  const contentLength =
    request.headers.get("content-length");

  if (contentLength === null) {
    return false;
  }

  const parsedLength = Number(contentLength);

  if (
    !Number.isSafeInteger(parsedLength) ||
    parsedLength < 0
  ) {
    return true;
  }

  return parsedLength > MAX_REQUEST_BODY_BYTES;
}

async function readJsonBody(
  request: Request
): Promise<
  | {
      valid: true;
      body: Record<string, unknown>;
    }
  | {
      valid: false;
      response: NextResponse;
    }
> {
  if (isRequestBodyTooLarge(request)) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: "Request body is too large.",
        },
        {
          status: 413,
          headers: jsonHeaders(),
        }
      ),
    };
  }

  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: "Unable to read request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      ),
    };
  }

  if (
    Buffer.byteLength(rawBody, "utf8") >
    MAX_REQUEST_BODY_BYTES
  ) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: "Request body is too large.",
        },
        {
          status: 413,
          headers: jsonHeaders(),
        }
      ),
    };
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: "Invalid JSON body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      ),
    };
  }

  if (!isRecord(body)) {
    return {
      valid: false,
      response: NextResponse.json(
        {
          error: "Invalid request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      ),
    };
  }

  return {
    valid: true,
    body,
  };
}

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Returns all non-deleted services belonging
 * to the authenticated seller's business.
 *
 * Services have their own records and do not
 * consume the seller's product listing allowance.
 */

export async function GET() {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const business = await prisma.business.findUnique({
      where: {
        ownerId: auth.user.id,
      },

      select: {
        id: true,
        name: true,
        deletedAt: true,
      },
    });

    if (!business) {
      return NextResponse.json(
        {
          error:
            "You do not have a business linked to this seller account.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    if (business.deletedAt) {
      return NextResponse.json(
        {
          error: "This business has been deleted.",
        },
        {
          status: 410,
          headers: jsonHeaders(),
        }
      );
    }

    const services = await prisma.service.findMany({
      where: {
        businessId: business.id,
        deletedAt: null,
      },

      orderBy: {
        updatedAt: "desc",
      },

      include: {
        category: true,

        images: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        },
      },
    });

    return NextResponse.json(
      {
        business: {
          id: business.id,
          name: business.name,
        },

        services,
        total: services.length,
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller services GET error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to load your services.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Creates a service for the authenticated seller.
 *
 * Sellers cannot choose their own service status.
 * New services are created as ACTIVE.
 *
 * Services do not use product-slot or referral-slot calculations.
 */

export async function POST(request: Request) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const parsedBody = await readJsonBody(request);

    if (!parsedBody.valid) {
      return parsedBody.response;
    }

    const body = parsedBody.body;

    const name = cleanString(body.name);
    const description = cleanString(body.description);
    const categoryId = cleanString(body.categoryId);

    const availabilityValue =
      cleanString(body.availability);

    const fulfillmentTypeValue =
      body.fulfillmentType === undefined ||
      body.fulfillmentType === null ||
      body.fulfillmentType === ""
        ? "FLEXIBLE"
        : cleanString(body.fulfillmentType);

    /* ---------------------------------------------------------------------- */
    /* BASIC FIELD VALIDATION                                                 */
    /* ---------------------------------------------------------------------- */

    if (
      hasOwn(body, "description") &&
      body.description !== null &&
      typeof body.description !== "string"
    ) {
      return NextResponse.json(
        {
          error: "Service description must be a string.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      hasOwn(body, "categoryId") &&
      body.categoryId !== null &&
      body.categoryId !== "" &&
      typeof body.categoryId !== "string"
    ) {
      return NextResponse.json(
        {
          error: "Invalid category ID.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (categoryId.length > 100) {
      return NextResponse.json(
        {
          error: "Category ID is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!name) {
      return NextResponse.json(
        {
          error: "Service name is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (name.length > 200) {
      return NextResponse.json(
        {
          error: "Service name is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (description.length > 4000) {
      return NextResponse.json(
        {
          error: "Service description is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* KEYWORDS                                                               */
    /* ---------------------------------------------------------------------- */

    const keywordsResult =
      parseKeywords(body.keywords);

    if (!keywordsResult.valid) {
      return NextResponse.json(
        {
          error:
            `Keywords must contain no more than ${MAX_KEYWORDS} strings, each at most ${MAX_KEYWORD_LENGTH} characters.`,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* PRICING                                                                */
    /* ---------------------------------------------------------------------- */

    const priceResult =
      parseOptionalInteger(body.price);

    const priceMinResult =
      parseOptionalInteger(body.priceMin);

    const priceMaxResult =
      parseOptionalInteger(body.priceMax);

    if (
      !priceResult.valid ||
      !priceMinResult.valid ||
      !priceMaxResult.valid
    ) {
      return NextResponse.json(
        {
          error:
            `Prices must be whole numbers between 0 and ${MAX_PRISMA_INT}.`,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const price = priceResult.value;
    const priceMin = priceMinResult.value;
    const priceMax = priceMaxResult.value;

    /*
     * Services may be created without a price.
     * Any price supplied must still follow the
     * shared fixed-price/range validation rules.
     */
    const pricingError = validateProductPricing(
      price,
      priceMin,
      priceMax,
      {
        requirePrice: false,
      }
    );

    if (pricingError) {
      return NextResponse.json(
        {
          error: pricingError,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* DURATION                                                               */
    /* ---------------------------------------------------------------------- */

    const durationResult =
      parseOptionalInteger(body.durationMinutes);

    if (!durationResult.valid) {
      return NextResponse.json(
        {
          error:
            "Duration must be a whole number greater than zero.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const durationMinutes = durationResult.value;

    if (
      durationMinutes !== null &&
      durationMinutes <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Duration must be greater than zero minutes.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* AVAILABILITY                                                            */
    /* ---------------------------------------------------------------------- */

    if (
      body.availability !== undefined &&
      body.availability !== null &&
      body.availability !== "" &&
      !isAvailability(availabilityValue)
    ) {
      return NextResponse.json(
        {
          error: "Invalid availability value.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* FULFILLMENT TYPE                                                       */
    /* ---------------------------------------------------------------------- */

    if (!isFulfillmentType(fulfillmentTypeValue)) {
      return NextResponse.json(
        {
          error: "Invalid service fulfillment type.",
          allowedValues: ALLOWED_FULFILLMENT_TYPES,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* IMAGES                                                                 */
    /* ---------------------------------------------------------------------- */

    const imagesResult =
      parseServiceImages(body.images);

    const legacyImageUrlProvided =
      hasOwn(body, "imageUrl");

    const legacyImageUrl =
      cleanString(body.imageUrl);

    if (
      legacyImageUrlProvided &&
      body.imageUrl !== null &&
      body.imageUrl !== "" &&
      typeof body.imageUrl !== "string"
    ) {
      return NextResponse.json(
        {
          error: "Image URL must be a string.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      legacyImageUrl &&
      !parseHttpUrl(legacyImageUrl)
    ) {
      return NextResponse.json(
        {
          error:
            "Image URL must be a valid HTTP or HTTPS URL.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!imagesResult.valid) {
      return NextResponse.json(
        {
          error:
            `Images must be an array of no more than ${MAX_SERVICE_IMAGES} valid uploaded image records.`,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    let images = imagesResult.value;

    /*
     * Backward compatibility with callers that send
     * imageUrl instead of an images array.
     *
     * An explicitly supplied images array takes
     * precedence, including an empty array.
     */
    if (
      body.images === undefined &&
      images.length === 0 &&
      legacyImageUrl
    ) {
      images = [
        {
          url: parseHttpUrl(legacyImageUrl)!,
          publicId: null,
          sortOrder: 0,
        },
      ];
    }

    /* ---------------------------------------------------------------------- */
    /* SELLER BUSINESS                                                        */
    /* ---------------------------------------------------------------------- */

    const business = await prisma.business.findUnique({
      where: {
        ownerId: auth.user.id,
      },

      select: {
        id: true,
        name: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!business) {
      return NextResponse.json(
        {
          error:
            "You do not have a business linked to this seller account.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    if (business.deletedAt) {
      return NextResponse.json(
        {
          error: "This business has been deleted.",
        },
        {
          status: 410,
          headers: jsonHeaders(),
        }
      );
    }

    /* ---------------------------------------------------------------------- */
    /* CATEGORY                                                               */
    /* ---------------------------------------------------------------------- */

    let validatedCategoryId: string | null = null;

    if (categoryId) {
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
        return NextResponse.json(
          {
            error:
              "Selected category was not found or is inactive.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      validatedCategoryId = category.id;
    }

    /* ---------------------------------------------------------------------- */
    /* CREATE SERVICE                                                         */
    /* ---------------------------------------------------------------------- */

    const compatibilityImageUrl =
      getCompatibilityImageUrl(images);

    const serviceData: Prisma.ServiceCreateInput = {
      business: {
        connect: {
          id: business.id,
        },
      },

      name,
      description: description || null,

      category: validatedCategoryId
        ? {
            connect: {
              id: validatedCategoryId,
            },
          }
        : undefined,

      price,
      priceMin,
      priceMax,

      durationMinutes,

      fulfillmentType:
        fulfillmentTypeValue as ServiceFulfillmentType,

      availability: (
        availabilityValue || "ASK_SELLER"
      ) as Availability,

      keywords: keywordsResult.value,

      imageUrl: compatibilityImageUrl,

      images:
        images.length > 0
          ? {
              create: images.map((image) => ({
                url: image.url,
                publicId: image.publicId,
                sortOrder: image.sortOrder,
              })),
            }
          : undefined,

      status: "ACTIVE",
    };

    const service = await prisma.service.create({
      data: serviceData,

      include: {
        category: true,

        images: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        },
      },
    });

    /* ---------------------------------------------------------------------- */
    /* NOTIFY ADMINS                                                          */
    /* ---------------------------------------------------------------------- */

    /*
     * Notification failures must not undo a
     * successfully created service.
     */
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

            type: NotificationType.SERVICE_ADDED,

            title: "New service added",

            message:
              `A new service, "${service.name}", was added to ${business.name}.`,

            priority: NotificationPriority.NORMAL,

            data: {
              serviceId: service.id,
              businessId: business.id,
              href: "/admin/services",
            },

            dedupeKey:
              `service:${service.id}:added:admin:${admin.id}`,
          });
        } catch (notificationError) {
          console.error(
            "Seller service admin notification error:",
            notificationError
          );
        }
      }
    } catch (notificationLookupError) {
      console.error(
        "Seller service admin lookup error:",
        notificationLookupError
      );
    }

    return NextResponse.json(
      {
        message: "Service created successfully.",
        service,
      },
      {
        status: 201,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller services POST error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to create service.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}