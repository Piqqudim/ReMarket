import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  NotificationPriority,
  NotificationType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";
import { createNotification } from "@/lib/notifications";
import {
  getGrantedProductSlotBonus,
  qualifyReferralForUser,
} from "@/lib/referrals";

const MAX_ACTIVE_PRODUCTS = 10;
const MAX_PRISMA_INT = 2_147_483_647;
const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const MAX_PRODUCT_IMAGES = 20;
const MAX_IMAGE_URL_LENGTH = 2000;
const MAX_PUBLIC_ID_LENGTH = 500;
const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS_TOTAL_LENGTH = 1500;

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

type Availability =
  (typeof ALLOWED_AVAILABILITY)[number];

type ParsedProductImage = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type ParseResult<T> = {
  valid: boolean;
  value: T;
};

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

function isPrismaInt(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PRISMA_INT
  );
}

/**
 * Parse an optional non-negative Prisma Int.
 * Blank/null values clear the optional field.
 * Booleans, objects, arrays, decimals, negative values,
 * and values outside the supported Int range are rejected.
 */
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

    const normalizedKey = cleaned.toLocaleLowerCase();

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

function parseHttpUrl(value: string): string | null {
  if (!value || value.length > MAX_IMAGE_URL_LENGTH) {
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

/*
 * --------------------------------------------------
 * PRODUCT IMAGES
 * --------------------------------------------------
 *
 * ProductImage is the primary image record.
 * Product.imageUrl remains a compatibility mirror of
 * the first image.
 *
 * If images is omitted, the caller has not supplied
 * this field. On POST, an imageUrl compatibility value
 * may be converted into a single image record.
 * --------------------------------------------------
 */

function parseProductImages(
  value: unknown
): ParseResult<ParsedProductImage[]> {
  if (value === undefined) {
    return {
      valid: true,
      value: [],
    };
  }

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
  const seenUrls = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];

    let rawUrl: string;
    let publicId: string | null = null;
    let sortOrder = index;

    /* Backward compatibility with string image entries. */
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
        const parsedSortOrder = parseOptionalInteger(
          item.sortOrder
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
  images: ParsedProductImage[]
): string | null {
  return images[0]?.url ?? null;
}

/*
 * --------------------------------------------------
 * EFFECTIVE PRODUCT LIMIT
 * --------------------------------------------------
 *
 * Every seller gets the base allowance. Granted referral
 * rewards add permanent slots. The API always calculates
 * the effective limit from the database, not client input.
 * --------------------------------------------------
 */

function calculateMaxActiveProducts(
  referralBonusSlots: number
): number {
  return (
    MAX_ACTIVE_PRODUCTS +
    Math.max(0, referralBonusSlots)
  );
}

class ActiveProductLimitError extends Error {
  constructor(
    public readonly maxActiveProducts: number,
    public readonly referralBonusSlots: number
  ) {
    super(
      `You have reached the maximum of ${maxActiveProducts} active products.`
    );

    this.name = "ActiveProductLimitError";
  }
}

/*
 * --------------------------------------------------
 * CREATE PRODUCT WITH EFFECTIVE LIMIT
 * --------------------------------------------------
 *
 * The product count and referral bonus are checked in
 * the same serializable transaction as the creation.
 * Retry only serialization conflicts.
 * --------------------------------------------------
 */

async function createProductWithLimit(
  businessId: string,
  sellerUserId: string,
  data: Prisma.ProductCreateInput
) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const activeCount = await tx.product.count({
            where: {
              businessId,
              status: "ACTIVE",
              deletedAt: null,
            },
          });

          const referralBonusSlots =
            await getGrantedProductSlotBonus(
              sellerUserId,
              tx
            );

          const maxActiveProducts =
            calculateMaxActiveProducts(referralBonusSlots);

          if (activeCount >= maxActiveProducts) {
            throw new ActiveProductLimitError(
              maxActiveProducts,
              referralBonusSlots
            );
          }

          const product = await tx.product.create({
            data,
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

          return {
            product,
            maxActiveProducts,
            referralBonusSlots,
            activeCount: activeCount + 1,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        }
      );
    } catch (error) {
      if (error instanceof ActiveProductLimitError) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        if (attempt === MAX_RETRIES - 1) {
          throw new Error(
            "The product could not be created safely. Please try again."
          );
        }

        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to create product.");
}

function isRequestBodyTooLarge(request: Request): boolean {
  const contentLength = request.headers.get("content-length");

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

/* --------------------------------------------------
 * GET
 *
 * Returns products owned by the authenticated seller.
 * -------------------------------------------------- */

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

    const [products, activeCount, referralBonusSlots] =
      await Promise.all([
        prisma.product.findMany({
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
        }),

        prisma.product.count({
          where: {
            businessId: business.id,
            status: "ACTIVE",
            deletedAt: null,
          },
        }),

        getGrantedProductSlotBonus(auth.user.id),
      ]);

    const maxActiveProducts =
      calculateMaxActiveProducts(referralBonusSlots);

    return NextResponse.json(
      {
        business: {
          id: business.id,
          name: business.name,
        },
        products,
        total: products.length,
        activeCount,
        maxActiveProducts,
        baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS,
        referralBonusSlots,
        remainingSlots: Math.max(
          0,
          maxActiveProducts - activeCount
        ),
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller products GET error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to load your products.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/* --------------------------------------------------
 * POST
 *
 * Creates an active product for the seller's business.
 * Sellers cannot choose product status themselves.
 * -------------------------------------------------- */

export async function POST(request: Request) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    if (isRequestBodyTooLarge(request)) {
      return NextResponse.json(
        {
          error: "Request body is too large.",
        },
        {
          status: 413,
          headers: jsonHeaders(),
        }
      );
    }

    let rawBody: string;

    try {
      rawBody = await request.text();
    } catch {
      return NextResponse.json(
        {
          error: "Unable to read request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      Buffer.byteLength(rawBody, "utf8") >
      MAX_REQUEST_BODY_BYTES
    ) {
      return NextResponse.json(
        {
          error: "Request body is too large.",
        },
        {
          status: 413,
          headers: jsonHeaders(),
        }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!isRecord(body)) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const name = cleanString(body.name);
    const description = cleanString(body.description);
    const categoryId = cleanString(body.categoryId);
    const availabilityValue = cleanString(body.availability);

    if (
      hasOwn(body, "description") &&
      body.description !== null &&
      typeof body.description !== "string"
    ) {
      return NextResponse.json(
        {
          error: "Product description must be a string.",
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

    const keywordsResult = parseKeywords(body.keywords);
    const priceResult = parseOptionalInteger(body.price);
    const priceMinResult = parseOptionalInteger(body.priceMin);
    const priceMaxResult = parseOptionalInteger(body.priceMax);
    const imagesResult = parseProductImages(body.images);

    const legacyImageUrlProvided = hasOwn(body, "imageUrl");
    const legacyImageUrl = cleanString(body.imageUrl);

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
          error: "Image URL must be a valid HTTP or HTTPS URL.",
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
            `Images must be an array of no more than ${MAX_PRODUCT_IMAGES} valid uploaded image records.`,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    let images = imagesResult.value;

    /*
     * Compatibility with existing callers that still
     * supply imageUrl. An explicit images array takes
     * precedence, including an intentionally empty array.
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

    if (!name) {
      return NextResponse.json(
        {
          error: "Product name is required.",
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
          error: "Product name is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (description.length > 2000) {
      return NextResponse.json(
        {
          error: "Product description is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

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

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin > priceMax
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be greater than maximum price.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

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

    /*
     * -----------------------------------------
     * SELLER BUSINESS
     * -----------------------------------------
     */

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

    /*
     * Allow sellers to prepare products while their
     * business is pending/inactive. Such products are
     * not publicly discoverable through business queries
     * that require an ACTIVE business. The referral service
     * still requires an active business and active product.
     */

    /*
     * -----------------------------------------
     * CATEGORY
     * -----------------------------------------
     */

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

    /*
     * -----------------------------------------
     * CREATE PRODUCT WITH SERVER-SIDE LIMIT
     * -----------------------------------------
     */

    const compatibilityImageUrl =
      getCompatibilityImageUrl(images);

    const {
      product,
      maxActiveProducts: enforcedMaxActiveProducts,
      referralBonusSlots: enforcedReferralBonusSlots,
      activeCount,
    } = await createProductWithLimit(
      business.id,
      auth.user.id,
      {
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

        availability: (
          availabilityValue || "ASK_SELLER"
        ) as Availability,

        keywords: keywordsResult.value,

        // Compatibility mirror of the first image.
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
      }
    );

    /*
     * -----------------------------------------
     * QUALIFY SELLER REFERRAL
     * -----------------------------------------
     *
     * The current seller's newly-created product may
     * satisfy the referred-seller qualification rule.
     * The referral service handles the status check and
     * idempotency. It awards the referrer, not the newly
     * referred seller, for seller-to-seller referrals.
     *
     * Qualification failure must not undo product creation.
     */

    try {
      await qualifyReferralForUser(
        auth.user.id,
        "SELLER"
      );
    } catch (qualificationError) {
      console.error(
        "Seller referral qualification error:",
        qualificationError
      );
    }

    /*
     * -----------------------------------------
     * NOTIFY ADMINS
     * -----------------------------------------
     *
     * Notification failures must not undo a successfully
     * created product.
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
            type: NotificationType.PRODUCT_ADDED,
            title: "New product added",
            message:
              `A new product, "${product.name}", was added to ${business.name}.`,
            priority: NotificationPriority.NORMAL,
            data: {
              productId: product.id,
              businessId: business.id,
              href: "/admin/products",
            },
            dedupeKey:
              `product:${product.id}:added:admin:${admin.id}`,
          });
        } catch (notificationError) {
          console.error(
            "Seller product admin notification error:",
            notificationError
          );
        }
      }
    } catch (notificationLookupError) {
      console.error(
        "Seller product admin lookup error:",
        notificationLookupError
      );
    }

    /*
     * Return capacity from the same transaction snapshot
     * as the product creation. Avoid turning a successful
     * create into a 500 because a later summary query fails.
     */

    return NextResponse.json(
      {
        message: "Product created successfully.",
        product,
        activeCount,
        maxActiveProducts: enforcedMaxActiveProducts,
        baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS,
        referralBonusSlots: enforcedReferralBonusSlots,
        remainingSlots: Math.max(
          0,
          enforcedMaxActiveProducts - activeCount
        ),
      },
      {
        status: 201,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    if (error instanceof ActiveProductLimitError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "ACTIVE_PRODUCT_LIMIT",
          maxActiveProducts: error.maxActiveProducts,
          baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS,
          referralBonusSlots: error.referralBonusSlots,
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    console.error(
      "Seller products POST error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to create product.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}
