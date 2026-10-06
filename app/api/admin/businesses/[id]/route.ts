import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Availability,
  BusinessStatus,
  LocationVerificationStatus,
  NotificationType,
  SocialPlatform,
  VerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { geocodeBusinessLocation } from "@/lib/geocoding";
import { createNotification } from "@/lib/notifications";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_PRISMA_INT = 2_147_483_647;

const MAX_BUSINESS_ID_LENGTH = 100;

const MAX_NAME_LENGTH = 200;
const MAX_OWNER_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

const MAX_AREA_LENGTH = 200;
const MAX_STREET_LENGTH = 300;
const MAX_HOUSE_NUMBER_LENGTH = 100;
const MAX_CITY_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 2000;

const MAX_PHONE_LENGTH = 50;
const MAX_IMAGE_URL_LENGTH = 2000;

const MAX_CATEGORY_IDS = 50;
const MAX_CATEGORY_ID_LENGTH = 100;

const MAX_SOCIAL_LINKS = 6;
const MAX_SOCIAL_HANDLE_LENGTH = 2000;

const MAX_REQUEST_BODY_SIZE = 100 * 1024;

function getNoStoreHeaders(): Headers {
  const headers = new Headers();

  headers.set(
    "Cache-Control",
    "no-store"
  );

  headers.set(
    "Pragma",
    "no-cache"
  );

  return headers;
}

function cleanString(
  value: unknown
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function nullableString(
  value: unknown
): string | null {
  const cleaned =
    cleanString(value);

  return cleaned || null;
}

function parseOptionalInt(
  value: unknown
): number | null | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(
      parsed
    )
  ) {
    return undefined;
  }

  if (
    parsed < 0 ||
    parsed > MAX_PRISMA_INT
  ) {
    return undefined;
  }

  return parsed;
}

function parseOptionalFloat(
  value: unknown
): number | null | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return undefined;
  }

  return parsed;
}

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value ===
      "AVAILABLE" ||
    value ===
      "ASK_SELLER" ||
    value ===
      "UNAVAILABLE"
  );
}

function isBusinessStatus(
  value: unknown
): value is BusinessStatus {
  return (
    value ===
      "ACTIVE" ||
    value ===
      "INACTIVE" ||
    value ===
      "PENDING"
  );
}

function isVerificationStatus(
  value: unknown
): value is VerificationStatus {
  return (
    value ===
      "VERIFIED" ||
    value ===
      "UNVERIFIED"
  );
}

function isLocationVerificationStatus(
  value: unknown
): value is LocationVerificationStatus {
  return (
    value ===
      "VERIFIED" ||
    value ===
      "UNVERIFIED"
  );
}

function isSocialPlatform(
  value: unknown
): value is SocialPlatform {
  return (
    value ===
      "WHATSAPP" ||
    value ===
      "INSTAGRAM" ||
    value ===
      "TIKTOK" ||
    value ===
      "FACEBOOK" ||
    value ===
      "PHONE" ||
    value ===
      "DIRECTIONS"
  );
}

function normalizeWhatsApp(
  value: string
): string {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return "";
  }

  if (
    trimmed.startsWith(
      "http://"
    ) ||
    trimmed.startsWith(
      "https://"
    )
  ) {
    return trimmed;
  }

  const digits =
    trimmed.replace(
      /\D/g,
      ""
    );

  if (!digits) {
    return "";
  }

  if (
    digits.startsWith(
      "234"
    )
  ) {
    return `+${digits}`;
  }

  if (
    digits.startsWith(
      "0"
    )
  ) {
    return `+234${digits.slice(
      1
    )}`;
  }

  return trimmed;
}

type ParsedSocialLink = {
  platform: SocialPlatform;
  handle: string;
};

function parseSocialLinks(
  value: unknown
): ParsedSocialLink[] | null {
  if (
    !Array.isArray(value)
  ) {
    return null;
  }

  if (
    value.length >
    MAX_SOCIAL_LINKS
  ) {
    return null;
  }

  const result:
    ParsedSocialLink[] =
    [];

  const seen =
    new Set<SocialPlatform>();

  for (
    const item of value
  ) {
    if (
      !item ||
      typeof item !==
        "object" ||
      Array.isArray(item)
    ) {
      return null;
    }

    const record =
      item as Record<
        string,
        unknown
      >;

    if (
      !isSocialPlatform(
        record.platform
      )
    ) {
      return null;
    }

    let handle =
      cleanString(
        record.handle
      );

    if (
      handle.length >
      MAX_SOCIAL_HANDLE_LENGTH
    ) {
      return null;
    }

    if (
      record.platform ===
      SocialPlatform.WHATSAPP
    ) {
      handle =
        normalizeWhatsApp(
          handle
        );
    }

    /*
     * Empty handles are ignored.
     */
    if (!handle) {
      continue;
    }

    /*
     * Only one link per platform
     * is allowed.
     */
    if (
      seen.has(
        record.platform
      )
    ) {
      return null;
    }

    seen.add(
      record.platform
    );

    result.push({
      platform:
        record.platform,

      handle,
    });
  }

  return result;
}

function getPhoneFromSocialLinks(
  socialLinks: ParsedSocialLink[]
): string | null {
  return (
    socialLinks.find(
      (link) =>
        link.platform ===
        SocialPlatform.PHONE
    )?.handle ??
    null
  );
}

function parseCategoryIds(
  value: unknown
): string[] | null {
  if (
    !Array.isArray(value)
  ) {
    return null;
  }

  if (
    value.length >
    MAX_CATEGORY_IDS
  ) {
    return null;
  }

  const result: string[] =
    [];

  const seen =
    new Set<string>();

  for (
    const item of value
  ) {
    if (
      typeof item !==
      "string"
    ) {
      return null;
    }

    const id =
      item.trim();

    if (!id) {
      continue;
    }

    if (
      id.length >
      MAX_CATEGORY_ID_LENGTH
    ) {
      return null;
    }

    if (
      seen.has(id)
    ) {
      return null;
    }

    seen.add(id);

    result.push(id);
  }

  return result;
}

/*
 * ------------------------------------------------
 * LOCATION HELPERS
 * ------------------------------------------------
 *
 * Canonical ReMarket address:
 *
 * House Number, Street, Area, City, Nigeria
 */

function composeLocationAddress(
  houseNumber: string,
  street: string,
  area: string,
  city: string
): string {
  return [
    houseNumber,
    street,
    area,
    city,
    "Nigeria",
  ]
    .filter(Boolean)
    .join(", ");
}

function parseStoredLocationAddress(
  address: string | null,
  area: string
): {
  houseNumber: string;
  street: string;
  city: string;
} {
  if (!address) {
    return {
      houseNumber: "",
      street: "",
      city: "",
    };
  }

  let parts =
    address
      .split(",")
      .map((part) =>
        part.trim()
      )
      .filter(Boolean);

  if (
    parts.length ===
    0
  ) {
    return {
      houseNumber: "",
      street: "",
      city: "",
    };
  }

  /*
   * Remove Nigeria.
   */
  if (
    parts[
      parts.length - 1
    ].toLowerCase() ===
    "nigeria"
  ) {
    parts =
      parts.slice(
        0,
        -1
      );
  }

  if (
    parts.length ===
    0
  ) {
    return {
      houseNumber: "",
      street: "",
      city: "",
    };
  }

  /*
   * Remove the known Area wherever it
   * appears as its own address component.
   */
  const normalizedArea =
    area
      .trim()
      .toLowerCase();

  if (normalizedArea) {
    const areaIndex =
      parts.findIndex(
        (part) =>
          part.toLowerCase() ===
          normalizedArea
      );

    if (
      areaIndex >= 0
    ) {
      parts.splice(
        areaIndex,
        1
      );
    }
  }

  if (
    parts.length ===
    0
  ) {
    return {
      houseNumber: "",
      street: "",
      city: "",
    };
  }

  if (
    parts.length ===
    1
  ) {
    return {
      houseNumber: "",
      street:
        parts[0],
      city: "",
    };
  }

  if (
    parts.length ===
    2
  ) {
    const firstPart =
      parts[0];

    const looksLikeHouseNumber =
      /^\d+[A-Za-z]?(?:\s*[/-]\s*[\w-]+)?$/.test(
        firstPart
      );

    if (
      looksLikeHouseNumber
    ) {
      return {
        houseNumber:
          firstPart,

        street:
          parts[1],

        city:
          "",
      };
    }

    return {
      houseNumber: "",

      street:
        parts[0],

      city:
        parts[1],
    };
  }

  return {
    houseNumber:
      parts[0],

    street:
      parts[1],

    city:
      parts
        .slice(2)
        .join(", "),
  };
}

async function loadBusiness(
  id: string
) {
  const business =
    await prisma.business.findUnique(
      {
        where: {
          id,
        },

        include: {
          location:
            true,

          categories: {
            include: {
              category:
                true,
            },
          },

          products: {
            include: {
              category:
                true,

              images: {
                orderBy: {
                  sortOrder:
                    "asc",
                },
              },
            },

            orderBy: {
              updatedAt:
                "desc",
            },
          },

          socialLinks:
            true,
        },
      }
    );

  if (!business) {
    return null;
  }

  return {
    ...business,

    categories:
      business.categories.map(
        (item) =>
          item.category
      ),
  };
}

function bodyTooLarge(
  request: NextRequest
): boolean {
  const contentLengthHeader =
    request.headers.get(
      "content-length"
    );

  if (
    !contentLengthHeader
  ) {
    return false;
  }

  const contentLength =
    Number(
      contentLengthHeader
    );

  return (
    Number.isFinite(
      contentLength
    ) &&
    contentLength >
      MAX_REQUEST_BODY_SIZE
  );
}

/*
 * ------------------------------------------------
 * NOTIFICATIONS
 * ------------------------------------------------
 *
 * Notification failures must never cause a
 * successful business update to become a failed
 * request.
 *
 * Notifications are therefore sent only after
 * the database operation has completed.
 */

async function notifyBusinessOwner(
  input: {
    ownerId: string | null;
    businessId: string;
    type: NotificationType;
    title: string;
    message: string;
  }
): Promise<void> {
  const ownerId =
    cleanString(
      input.ownerId
    );

  if (!ownerId) {
    return;
  }

  try {
    await createNotification({
      userId:
        ownerId,

      type:
        input.type,

      title:
        input.title,

      message:
        input.message,

      data: {
        businessId:
          input.businessId,

        href:
          `/seller/${input.businessId}`,
      },
    });
  } catch (error) {
    console.error(
      "Business owner notification error:",
      error
    );
  }
}

/*
 * ------------------------------------------------
 * GET BUSINESS
 * ------------------------------------------------
 */

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } =
    await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error:
          "Business ID is required.",
      },
      {
        status: 400,
        headers:
          getNoStoreHeaders(),
      }
    );
  }

  if (
    id.length >
    MAX_BUSINESS_ID_LENGTH
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid business ID.",
      },
      {
        status: 400,
        headers:
          getNoStoreHeaders(),
      }
    );
  }

  try {
    const business =
      await loadBusiness(
        id
      );

    if (!business) {
      return NextResponse.json(
        {
          error:
            "Business not found.",
        },
        {
          status: 404,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        business,
      },
      {
        status: 200,
        headers:
          getNoStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin business GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load business.",
      },
      {
        status: 500,
        headers:
          getNoStoreHeaders(),
      }
    );
  }
}

/*
 * ------------------------------------------------
 * PATCH BUSINESS
 * ------------------------------------------------
 */

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } =
    await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error:
          "Business ID is required.",
      },
      {
        status: 400,
        headers:
          getNoStoreHeaders(),
      }
    );
  }

  if (
    id.length >
    MAX_BUSINESS_ID_LENGTH
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid business ID.",
      },
      {
        status: 400,
        headers:
          getNoStoreHeaders(),
      }
    );
  }

  try {
    if (
      bodyTooLarge(
        request
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Request body is too large.",
        },
        {
          status: 413,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    const existing =
      await prisma.business.findUnique(
        {
          where: {
            id,
          },

          include: {
            location:
              true,
          },
        }
      );

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Business not found.",
        },
        {
          status: 404,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    let body: unknown;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid JSON body.",
        },
        {
          status: 400,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    if (
      !body ||
      typeof body !==
        "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

    /*
     * -----------------------------------------
     * RESTORE
     * -----------------------------------------
     */

    if (
      "restore" in
      payload
    ) {
      if (
        payload.restore !==
        true
      ) {
        return NextResponse.json(
          {
            error:
              "Restore value must be true.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      if (
        !existing.deletedAt
      ) {
        return NextResponse.json(
          {
            error:
              "Business is not deleted.",
          },
          {
            status: 409,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      const restoredBusiness =
        await prisma.business.update(
          {
            where: {
              id,
            },

            data: {
              deletedAt:
                null,
            },
          }
        );

      const business =
        await loadBusiness(
          restoredBusiness.id
        );

      if (!business) {
        return NextResponse.json(
          {
            error:
              "Business was restored but could not be reloaded.",
          },
          {
            status: 500,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      return NextResponse.json(
        {
          success:
            true,

          restored:
            true,

          business,
        },
        {
          status: 200,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * BUSINESS UPDATE DATA
     * -----------------------------------------
     */

    const data: {
      name?: string;
      ownerName?: string | null;
      description?: string | null;
      phone?: string | null;
      imageUrl?: string | null;

      availability?:
        Availability;

      status?:
        BusinessStatus;

      verification?:
        VerificationStatus;

      priceMin?:
        number | null;

      priceMax?:
        number | null;

      locationId?:
        string;
    } = {};

    /*
     * -----------------------------------------
     * NAME
     * -----------------------------------------
     */

    if (
      "name" in
      payload
    ) {
      const name =
        cleanString(
          payload.name
        );

      if (!name) {
        return NextResponse.json(
          {
            error:
              "Business name is required.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      if (
        name.length >
        MAX_NAME_LENGTH
      ) {
        return NextResponse.json(
          {
            error:
              "Business name is too long.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      data.name =
        name;
    }

    /*
     * -----------------------------------------
     * OWNER NAME
     * -----------------------------------------
     */

    if (
      "ownerName" in
      payload
    ) {
      const ownerName =
        nullableString(
          payload.ownerName
        );

      if (
        ownerName &&
        ownerName.length >
          MAX_OWNER_NAME_LENGTH
      ) {
        return NextResponse.json(
          {
            error:
              "Owner name is too long.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      data.ownerName =
        ownerName;
    }

    /*
     * -----------------------------------------
     * DESCRIPTION
     * -----------------------------------------
     */

    if (
      "description" in
      payload
    ) {
      const description =
        nullableString(
          payload.description
        );

      if (
        description &&
        description.length >
          MAX_DESCRIPTION_LENGTH
      ) {
        return NextResponse.json(
          {
            error:
              "Business description is too long.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      data.description =
        description;
    }

    /*
     * -----------------------------------------
     * LEGACY PHONE
     * -----------------------------------------
     *
     * The PHONE social link remains the
     * source of truth when socialLinks are
     * explicitly supplied.
     *
     * Business.phone is kept as a mirror.
     */

    const legacyPhoneProvided =
      "phone" in
      payload;

    const legacyPhone =
      legacyPhoneProvided
        ? nullableString(
            payload.phone
          )
        : null;

    if (
      legacyPhone &&
      legacyPhone.length >
        MAX_PHONE_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    if (
      legacyPhoneProvided
    ) {
      data.phone =
        legacyPhone;
    }

    /*
     * -----------------------------------------
     * IMAGE URL
     * -----------------------------------------
     */

    if (
      "imageUrl" in
      payload
    ) {
      const imageUrl =
        nullableString(
          payload.imageUrl
        );

      if (
        imageUrl &&
        imageUrl.length >
          MAX_IMAGE_URL_LENGTH
      ) {
        return NextResponse.json(
          {
            error:
              "Image URL is too long.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      if (imageUrl) {
        try {
          const parsedImageUrl =
            new URL(
              imageUrl
            );

          if (
            parsedImageUrl.protocol !==
              "http:" &&
            parsedImageUrl.protocol !==
              "https:"
          ) {
            return NextResponse.json(
              {
                error:
                  "Image URL must use HTTP or HTTPS.",
              },
              {
                status: 400,
                headers:
                  getNoStoreHeaders(),
              }
            );
          }
        } catch {
          return NextResponse.json(
            {
              error:
                "Invalid image URL.",
            },
            {
              status: 400,
              headers:
                getNoStoreHeaders(),
            }
          );
        }
      }

      data.imageUrl =
        imageUrl;
    }

    /*
     * -----------------------------------------
     * AVAILABILITY
     * -----------------------------------------
     */

    if (
      "availability" in
      payload
    ) {
      if (
        !isAvailability(
          payload.availability
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid availability value.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      data.availability =
        payload.availability;
    }

    /*
     * -----------------------------------------
     * BUSINESS STATUS
     * -----------------------------------------
     */

    if (
      "status" in
      payload
    ) {
      if (
        !isBusinessStatus(
          payload.status
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid business status.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      data.status =
        payload.status;
    }

    /*
     * -----------------------------------------
     * BUSINESS VERIFICATION
     * -----------------------------------------
     */

    if (
      "verification" in
      payload
    ) {
      if (
        !isVerificationStatus(
          payload.verification
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid verification status.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      data.verification =
        payload.verification;
    }

    /*
     * -----------------------------------------
     * LOCATION VERIFICATION
     * -----------------------------------------
     */

    const locationVerificationWasProvided =
      "locationVerification" in
      payload;

    let requestedLocationVerification:
      | LocationVerificationStatus
      | undefined;

    if (
      locationVerificationWasProvided
    ) {
      if (
        !isLocationVerificationStatus(
          payload.locationVerification
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid location verification status.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      requestedLocationVerification =
        payload.locationVerification;
    }

    /*
     * -----------------------------------------
     * PRICES
     * -----------------------------------------
     */

    const priceMinProvided =
      "priceMin" in
      payload;

    const priceMaxProvided =
      "priceMax" in
      payload;

    const priceMin =
      parseOptionalInt(
        payload.priceMin
      );

    if (
      priceMin ===
      undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price must be a valid integer between 0 and 2147483647.",
        },
        {
          status: 400,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    const priceMax =
      parseOptionalInt(
        payload.priceMax
      );

    if (
      priceMax ===
      undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum price must be a valid integer between 0 and 2147483647.",
        },
        {
          status: 400,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    if (
      priceMinProvided
    ) {
      data.priceMin =
        priceMin;
    }

    if (
      priceMaxProvided
    ) {
      data.priceMax =
        priceMax;
    }

    const finalPriceMin =
      priceMinProvided
        ? priceMin
        : existing.priceMin;

    const finalPriceMax =
      priceMaxProvided
        ? priceMax
        : existing.priceMax;

    if (
      finalPriceMin !==
        null &&
      finalPriceMax !==
        null &&
      finalPriceMin >
        finalPriceMax
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be greater than maximum price.",
        },
        {
          status: 400,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * RELATIONSHIP FLAGS
     * -----------------------------------------
     */

    const locationWasProvided =
      "area" in
        payload ||
      "address" in
        payload ||
      "street" in
        payload ||
      "houseNumber" in
        payload ||
      "city" in
        payload ||
      "lat" in
        payload ||
      "lng" in
        payload ||
      "long" in
        payload;

    const categoryIdsProvided =
      "categoryIds" in
      payload;

    const socialLinksProvided =
      "socialLinks" in
      payload;

    /*
     * -----------------------------------------
     * CATEGORIES
     * -----------------------------------------
     */

    let categoryIds:
      | string[]
      | null =
      null;

    if (
      categoryIdsProvided
    ) {
      categoryIds =
        parseCategoryIds(
          payload.categoryIds
        );

      if (!categoryIds) {
        return NextResponse.json(
          {
            error:
              "categoryIds must be an array containing no more than 50 valid IDs.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      if (
        categoryIds.length >
        0
      ) {
        const categories =
          await prisma.category.findMany(
            {
              where: {
                id: {
                  in:
                    categoryIds,
                },
              },

              select: {
                id: true,
              },
            }
          );

        if (
          categories.length !==
          categoryIds.length
        ) {
          return NextResponse.json(
            {
              error:
                "One or more selected categories do not exist.",
            },
            {
              status: 400,
              headers:
                getNoStoreHeaders(),
            }
          );
        }
      }
    }

    /*
     * -----------------------------------------
     * SOCIAL LINKS + PHONE
     * -----------------------------------------
     */

    let socialLinks:
      | ParsedSocialLink[]
      | null =
      null;

    if (
      socialLinksProvided
    ) {
      socialLinks =
        parseSocialLinks(
          payload.socialLinks
        );

      if (!socialLinks) {
        return NextResponse.json(
          {
            error:
              "socialLinks must be an array containing no more than 6 valid links.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      const phoneFromSocial =
        getPhoneFromSocialLinks(
          socialLinks
        );

      if (
        phoneFromSocial &&
        phoneFromSocial.length >
          MAX_PHONE_LENGTH
      ) {
        return NextResponse.json(
          {
            error:
              "Phone number is too long.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      /*
       * PHONE social link is authoritative.
       *
       * Business.phone remains its compatibility
       * mirror.
       */
      if (
        phoneFromSocial
      ) {
        data.phone =
          phoneFromSocial;
      } else if (
        legacyPhoneProvided
      ) {
        /*
         * Keep legacy phone compatible by creating
         * the canonical PHONE social link.
         */
        if (
          legacyPhone
        ) {
          socialLinks.push({
            platform:
              SocialPlatform.PHONE,

            handle:
              legacyPhone,
          });
        }

        data.phone =
          legacyPhone;
      } else {
        /*
         * socialLinks was explicitly supplied
         * without a PHONE link or legacy phone.
         *
         * That means PHONE is intentionally removed.
         */
        data.phone =
          null;
      }
    }

    /*
     * -----------------------------------------
     * LOCATION
     * -----------------------------------------
     */

    let requestedArea:
      | string
      | undefined;

    let requestedAddress:
      | string
      | null
      | undefined;

    let requestedStreet:
      | string
      | null
      | undefined;

    let requestedLat:
      | number
      | null
      | undefined;

    let requestedLong:
      | number
      | null
      | undefined;

    let resolvedLat:
      | number
      | null
      | undefined;

    let resolvedLong:
      | number
      | null
      | undefined;

    let resolvedStreet:
      | string
      | null
      | undefined;

    let locationChanged =
      false;

    if (
      locationWasProvided
    ) {
      const currentArea =
        existing.location
          ?.area ??
        "";

      const currentStreet =
        existing.location
          ?.street ??
        null;

      const currentAddress =
        existing.location
          ?.address ??
        null;

      const currentLat =
        existing.location
          ?.lat ??
        null;

      const currentLong =
        existing.location
          ?.long ??
        null;

      const parsedExistingAddress =
        parseStoredLocationAddress(
          currentAddress,
          currentArea
        );

      const existingStreet =
        currentStreet ||
        parsedExistingAddress.street;

      /*
       * -----------------------------------------
       * AREA
       * -----------------------------------------
       */

      requestedArea =
        "area" in
        payload
          ? cleanString(
              payload.area
            )
          : currentArea;

      if (!requestedArea) {
        return NextResponse.json(
          {
            error:
              "Business area is required.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      if (
        requestedArea.length >
        MAX_AREA_LENGTH
      ) {
        return NextResponse.json(
          {
            error:
              "Business area is too long.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      /*
       * -----------------------------------------
       * STRUCTURED LOCATION
       * -----------------------------------------
       */

      const streetProvided =
        "street" in
        payload;

      const houseNumberProvided =
        "houseNumber" in
        payload;

      const cityProvided =
        "city" in
        payload;

      const structuredLocationWasProvided =
        streetProvided ||
        houseNumberProvided ||
        cityProvided;

      if (
        structuredLocationWasProvided
      ) {
        const resultingStreet =
          streetProvided
            ? cleanString(
                payload.street
              )
            : existingStreet;

        const resultingHouseNumber =
          houseNumberProvided
            ? cleanString(
                payload.houseNumber
              )
            : parsedExistingAddress.houseNumber;

        const resultingCity =
          cityProvided
            ? cleanString(
                payload.city
              )
            : parsedExistingAddress.city;

        if (
          resultingStreet.length >
          MAX_STREET_LENGTH
        ) {
          return NextResponse.json(
            {
              error:
                "Business street is too long.",
            },
            {
              status: 400,
              headers:
                getNoStoreHeaders(),
            }
          );
        }

        if (
          resultingHouseNumber.length >
          MAX_HOUSE_NUMBER_LENGTH
        ) {
          return NextResponse.json(
            {
              error:
                "House or shop number is too long.",
            },
            {
              status: 400,
              headers:
                getNoStoreHeaders(),
            }
          );
        }

        if (
          resultingCity.length >
          MAX_CITY_LENGTH
        ) {
          return NextResponse.json(
            {
              error:
                "Business city is too long.",
            },
            {
              status: 400,
              headers:
                getNoStoreHeaders(),
            }
          );
        }

        if (
          !resultingStreet
        ) {
          return NextResponse.json(
            {
              error:
                "Street, road, or close is required.",
            },
            {
              status: 400,
              headers:
                getNoStoreHeaders(),
            }
          );
        }

        requestedStreet =
          resultingStreet;

        /*
         * Canonical address:
         *
         * House Number, Street, Area, City, Nigeria
         */
        requestedAddress =
          composeLocationAddress(
            resultingHouseNumber,
            resultingStreet,
            requestedArea,
            resultingCity,
          );
      } else {
        /*
         * Address-only / legacy caller.
         */
        requestedAddress =
          "address" in
          payload
            ? nullableString(
                payload.address
              )
            : currentAddress;

        requestedStreet =
          existingStreet ||
          null;
      }

      /*
       * The check explicitly excludes both
       * null and undefined.
       */
      if (
        requestedAddress !=
          null &&
        requestedAddress.length >
          MAX_ADDRESS_LENGTH
      ) {
        return NextResponse.json(
          {
            error:
              "Business address is too long.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      /*
       * -----------------------------------------
       * COORDINATES
       * -----------------------------------------
       */

      requestedLat =
        "lat" in
        payload
          ? parseOptionalFloat(
              payload.lat
            )
          : currentLat;

      if (
        requestedLat ===
        undefined
      ) {
        return NextResponse.json(
          {
            error:
              "Latitude must be a valid number.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      if (
        "long" in
        payload &&
        "lng" in
        payload
      ) {
        return NextResponse.json(
          {
            error:
              "Provide longitude using either 'long' or 'lng', not both.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      requestedLong =
        "long" in
        payload
          ? parseOptionalFloat(
              payload.long
            )
          : "lng" in
            payload
          ? parseOptionalFloat(
              payload.lng
            )
          : currentLong;

      if (
        requestedLong ===
        undefined
      ) {
        return NextResponse.json(
          {
            error:
              "Longitude must be a valid number.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      /*
       * Coordinates must always exist as a pair.
       */
      if (
        (requestedLat ===
          null) !==
        (requestedLong ===
          null)
      ) {
        return NextResponse.json(
          {
            error:
              "Latitude and longitude must be provided together.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      if (
        requestedLat !==
          null &&
        (
          requestedLat <
            -90 ||
          requestedLat >
            90
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Latitude must be between -90 and 90.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      if (
        requestedLong !==
          null &&
        (
          requestedLong <
            -180 ||
          requestedLong >
            180
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Longitude must be between -180 and 180.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        );
      }

      /*
       * -----------------------------------------
       * DETERMINE LOCATION CHANGES
       * -----------------------------------------
       */

      const areaChanged =
        requestedArea !==
        currentArea;

      const addressChanged =
        requestedAddress !==
        currentAddress;

      const streetChanged =
        (
          requestedStreet ??
          null
        ) !==
        currentStreet;

      const coordinatesChanged =
        requestedLat !==
          currentLat ||
        requestedLong !==
          currentLong;

      resolvedLat =
        requestedLat;

      resolvedLong =
        requestedLong;

      resolvedStreet =
        requestedStreet ??
        null;

      /*
       * -----------------------------------------
       * RE-GEOCODE CHANGED LOCATION
       * -----------------------------------------
       *
       * If the address/area/street changed
       * without newly supplied coordinates,
       * the old coordinates must not be retained.
       */

      if (
        areaChanged ||
        addressChanged ||
        streetChanged
      ) {
        const hasFreshCoordinates =
          requestedLat !==
            null &&
          requestedLong !==
            null &&
          coordinatesChanged;

        if (
          !hasFreshCoordinates
        ) {
          resolvedStreet =
            structuredLocationWasProvided
              ? requestedStreet ??
                null
              : null;

          if (
            requestedAddress
          ) {
            try {
              const geocoded =
                await geocodeBusinessLocation(
                  {
                    address:
                      requestedAddress,

                    area:
                      requestedArea!,
                  }
                );

              resolvedLat =
                geocoded.latitude;

              resolvedLong =
                geocoded.longitude;

              if (
                geocoded.street
              ) {
                resolvedStreet =
                  geocoded.street;
              }
            } catch (
              error
            ) {
              console.warn(
                "Business address could not be geocoded. Saving the changed address without precise coordinates:",
                error
              );

              /*
               * Never retain stale coordinates from
               * the previous physical location.
               */
              resolvedLat =
                null;

              resolvedLong =
                null;
            }
          } else {
            resolvedLat =
              null;

            resolvedLong =
              null;
          }
        } else {
          /*
           * Newly supplied coordinates are authoritative.
           */
          resolvedStreet =
            requestedStreet ??
            null;
        }
      }

      /*
       * If only the stored street changed, preserve
       * the newly requested street.
       */
      if (
        streetChanged &&
        !(
          areaChanged ||
          addressChanged
        )
      ) {
        resolvedStreet =
          requestedStreet ??
          null;
      }

      locationChanged =
        !existing.location ||
        requestedArea !==
          currentArea ||
        (
          resolvedStreet ??
          null
        ) !==
          currentStreet ||
        requestedAddress !==
          currentAddress ||
        resolvedLat !==
          currentLat ||
        resolvedLong !==
          currentLong;
    }

    /*
     * A location verification request needs
     * an existing or newly supplied location.
     */
    if (
      locationVerificationWasProvided &&
      !existing.location &&
      !locationWasProvided
    ) {
      return NextResponse.json(
        {
          error:
            "Business has no saved location to verify.",
        },
        {
          status: 400,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * UPDATE EVERYTHING ATOMICALLY
     * -----------------------------------------
     */

    await prisma.$transaction(
      async (tx) => {
        /*
         * -----------------------------------------
         * LOCATION
         * -----------------------------------------
         */

        if (
          locationWasProvided &&
          locationChanged
        ) {
          /*
           * Any physical location change creates
           * a fresh Location record and resets
           * location verification.
           */
          const location =
            await tx.location.create(
              {
                data: {
                  area:
                    requestedArea!,

                  street:
                    resolvedStreet ??
                    null,

                  address:
                    requestedAddress ??
                    null,

                  lat:
                    resolvedLat ??
                    null,

                  long:
                    resolvedLong ??
                    null,

                  verification:
                    LocationVerificationStatus.UNVERIFIED,
                },
              }
            );

          data.locationId =
            location.id;
        } else if (
          locationVerificationWasProvided &&
          existing.location
        ) {
          await tx.location.update(
            {
              where: {
                id:
                  existing
                    .location
                    .id,
              },

              data: {
                verification:
                  requestedLocationVerification!,
              },
            }
          );
        }

        /*
         * -----------------------------------------
         * BUSINESS
         * -----------------------------------------
         *
         * Only validated fields are passed to Prisma.
         */
        await tx.business.update(
          {
            where: {
              id,
            },

            data,
          }
        );

        /*
         * -----------------------------------------
         * CATEGORIES
         * -----------------------------------------
         */

        if (
          categoryIdsProvided
        ) {
          await tx.businessCategory.deleteMany(
            {
              where: {
                businessId:
                  id,
              },
            }
          );

          if (
            categoryIds &&
            categoryIds.length >
              0
          ) {
            await tx.businessCategory.createMany(
              {
                data:
                  categoryIds.map(
                    (
                      categoryId
                    ) => ({
                      businessId:
                        id,

                      categoryId,
                    })
                  ),

                skipDuplicates:
                  true,
              }
            );
          }
        }

        /*
         * -----------------------------------------
         * SOCIAL LINKS
         * -----------------------------------------
         */

        if (
          socialLinksProvided
        ) {
          /*
           * socialLinks is a full replacement.
           */
          await tx.businessSocialLink.deleteMany(
            {
              where: {
                businessId:
                  id,
              },
            }
          );

          if (
            socialLinks &&
            socialLinks.length >
              0
          ) {
            await tx.businessSocialLink.createMany(
              {
                data:
                  socialLinks.map(
                    (
                      link
                    ) => ({
                      businessId:
                        id,

                      platform:
                        link.platform,

                      handle:
                        link.handle,
                    })
                  ),

                skipDuplicates:
                  true,
              }
            );
          }
        } else if (
          legacyPhoneProvided
        ) {
          /*
           * Legacy callers can still update only
           * the phone number.
           *
           * Keep PHONE social link synchronized.
           */
          await tx.businessSocialLink.deleteMany(
            {
              where: {
                businessId:
                  id,

                platform:
                  SocialPlatform.PHONE,
              },
            }
          );

          if (
            legacyPhone
          ) {
            await tx.businessSocialLink.create(
              {
                data: {
                  businessId:
                    id,

                  platform:
                    SocialPlatform.PHONE,

                  handle:
                    legacyPhone,
                },
              }
            );
          }
        }
      }
    );

    /*
     * -----------------------------------------
     * RELOAD UPDATED BUSINESS
     * -----------------------------------------
     */

    const updatedBusiness =
      await loadBusiness(
        id
      );

    if (
      !updatedBusiness
    ) {
      return NextResponse.json(
        {
          error:
            "Business was updated but could not be reloaded.",
        },
        {
          status: 500,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * BUSINESS STATUS NOTIFICATIONS
     * -----------------------------------------
     *
     * Only notify when an actual lifecycle
     * transition happened.
     */

    const resultingStatus =
      data.status ??
      existing.status;

    const resultingVerification =
      data.verification ??
      existing.verification;

    /*
     * PENDING -> ACTIVE
     *
     * Business approved.
     */
    if (
      existing.status ===
        BusinessStatus.PENDING &&
      resultingStatus ===
        BusinessStatus.ACTIVE
    ) {
      await notifyBusinessOwner({
        ownerId:
          existing.ownerId,

        businessId:
          existing.id,

        type:
          NotificationType.BUSINESS_APPROVED,

        title:
          "Business approved",

        message:
          `"${existing.name}" has been approved and is now active on ReMarket.`,
      });
    }

    /*
     * PENDING -> INACTIVE
     *
     * Business not approved.
     */
    if (
      existing.status ===
        BusinessStatus.PENDING &&
      resultingStatus ===
        BusinessStatus.INACTIVE
    ) {
      await notifyBusinessOwner({
        ownerId:
          existing.ownerId,

        businessId:
          existing.id,

        type:
          NotificationType.BUSINESS_REJECTED,

        title:
          "Business not approved",

        message:
          `"${existing.name}" was not approved and is currently inactive on ReMarket.`,
      });
    }

    /*
     * ACTIVE -> INACTIVE
     *
     * Existing active business was
     * deactivated by an admin.
     */
    if (
      existing.status ===
        BusinessStatus.ACTIVE &&
      resultingStatus ===
        BusinessStatus.INACTIVE
    ) {
      await notifyBusinessOwner({
        ownerId:
          existing.ownerId,

        businessId:
          existing.id,

        type:
          NotificationType.BUSINESS_DEACTIVATED,

        title:
          "Business deactivated",

        message:
          `"${existing.name}" has been deactivated by a ReMarket admin.`,
      });
    }

    /*
     * UNVERIFIED -> VERIFIED
     *
     * This refers specifically to
     * Business.verification.
     *
     * Location.verification remains
     * a separate concept.
     */
    if (
      existing.verification ===
        VerificationStatus.UNVERIFIED &&
      resultingVerification ===
        VerificationStatus.VERIFIED
    ) {
      await notifyBusinessOwner({
        ownerId:
          existing.ownerId,

        businessId:
          existing.id,

        type:
          NotificationType.BUSINESS_VERIFIED,

        title:
          "Business verified",

        message:
          `"${existing.name}" has been verified by ReMarket.`,
      });
    }

    return NextResponse.json(
      {
        success:
          true,

        business:
          updatedBusiness,
      },
      {
        status: 200,
        headers:
          getNoStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin business PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update business.",
      },
      {
        status: 500,
        headers:
          getNoStoreHeaders(),
      }
    );
  }
}

/*
 * ------------------------------------------------
 * SOFT DELETE
 * ------------------------------------------------
 *
 * DELETE /api/admin/businesses/[id]
 *
 * This does NOT physically remove the business.
 * It only sets deletedAt.
 */

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } =
    await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error:
          "Business ID is required.",
      },
      {
        status: 400,
        headers:
          getNoStoreHeaders(),
      }
    );
  }

  if (
    id.length >
    MAX_BUSINESS_ID_LENGTH
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid business ID.",
      },
      {
        status: 400,
        headers:
          getNoStoreHeaders(),
      }
    );
  }

  try {
    const existing =
      await prisma.business.findUnique(
        {
          where: {
            id,
          },

          select: {
            id: true,

            name:
              true,

            ownerId:
              true,

            deletedAt:
              true,
          },
        }
      );

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Business not found.",
        },
        {
          status: 404,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    if (
      existing.deletedAt
    ) {
      return NextResponse.json(
        {
          error:
            "Business is already deleted.",
        },
        {
          status: 409,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    const business =
      await prisma.business.update(
        {
          where: {
            id,
          },

          data: {
            deletedAt:
              new Date(),
          },

          select: {
            id: true,

            name:
              true,

            deletedAt:
              true,
          },
        }
      );

    /*
     * Notify the seller after the soft delete
     * succeeds.
     */
    await notifyBusinessOwner({
      ownerId:
        existing.ownerId,

      businessId:
        existing.id,

      type:
        NotificationType.BUSINESS_DEACTIVATED,

      title:
        "Business deactivated",

      message:
        `"${existing.name}" has been deactivated on ReMarket.`,
    });

    return NextResponse.json(
      {
        success:
          true,

        deleted:
          true,

        business,
      },
      {
        status: 200,
        headers:
          getNoStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin business DELETE error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to delete business.",
      },
      {
        status: 500,
        headers:
          getNoStoreHeaders(),
        }
      
    );
  }
}