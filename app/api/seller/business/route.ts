import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";
import { geocodeBusinessLocation } from "@/lib/geocoding";

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

type AvailabilityValue =
  (typeof ALLOWED_AVAILABILITY)[number];

type SocialPlatform =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "TIKTOK"
  | "FACEBOOK"
  | "PHONE"
  | "DIRECTIONS";

type ParsedSocialLink = {
  platform: SocialPlatform;
  handle: string;
};

type ParsedLocationInput = {
  area: string;
  address: string;
  houseNumber: string;
  street: string;
  city: string;
};

type ParsedStoredAddress = {
  houseNumber: string;
  street: string;
  city: string;
};

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function nullableString(
  value: unknown
): string | null {
  const cleaned = cleanString(value);

  return cleaned || null;
}

function parseOptionalInt(
  value: unknown
): number | null | "INVALID" {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value)
  ) {
    return "INVALID";
  }

  return value;
}

function parseOptionalFloat(
  value: unknown
): number | null | "INVALID" {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : "INVALID";
  }

  if (typeof value === "string") {
    const cleaned = value.trim();

    if (!cleaned) {
      return null;
    }

    const parsed = Number(cleaned);

    return Number.isFinite(parsed)
      ? parsed
      : "INVALID";
  }

  return "INVALID";
}

function parseAvailability(
  value: unknown
): AvailabilityValue | null {
  const cleaned = cleanString(value);

  if (
    cleaned === "AVAILABLE" ||
    cleaned === "ASK_SELLER" ||
    cleaned === "UNAVAILABLE"
  ) {
    return cleaned;
  }

  return null;
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

function validateCoordinates(
  lat: number | null,
  long: number | null
): string | null {
  if (
    (lat === null) !==
    (long === null)
  ) {
    return "Latitude and longitude must be provided together.";
  }

  if (
    lat !== null &&
    (lat < -90 || lat > 90)
  ) {
    return "Latitude must be between -90 and 90.";
  }

  if (
    long !== null &&
    (long < -180 || long > 180)
  ) {
    return "Longitude must be between -180 and 180.";
  }

  return null;
}

function isSocialPlatform(
  value: unknown
): value is SocialPlatform {
  return (
    value === "WHATSAPP" ||
    value === "INSTAGRAM" ||
    value === "TIKTOK" ||
    value === "FACEBOOK" ||
    value === "PHONE" ||
    value === "DIRECTIONS"
  );
}

function normalizeNigerianPhone(
  value: string
): string {
  let clean =
    value
      .trim()
      .replace(/[^\d+]/g, "");

  if (!clean) {
    return "";
  }

  if (clean.startsWith("00")) {
    clean = clean.slice(2);
  }

  if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }

  if (clean.startsWith("234")) {
    return `+${clean}`;
  }

  if (clean.startsWith("0")) {
    return `+234${clean.slice(1)}`;
  }

  return `+234${clean}`;
}

function normalizePhone(
  value: string
): string {
  return normalizeNigerianPhone(value);
}

function normalizeSocialHandle(
  platform: SocialPlatform,
  handle: string
): string {
  const clean = handle.trim();

  if (!clean) {
    return "";
  }

  if (
    platform === "WHATSAPP" ||
    platform === "PHONE"
  ) {
    if (
      clean.startsWith("http://") ||
      clean.startsWith("https://")
    ) {
      return clean;
    }

    return normalizeNigerianPhone(clean);
  }

  return clean;
}

/*
 * Social links have PATCH semantics.
 *
 * On PATCH:
 *
 * {
 *   socialLinks: [
 *     {
 *       platform: "INSTAGRAM",
 *       handle: "myshop"
 *     }
 *   ]
 * }
 *
 * means:
 *
 *   update Instagram only
 *   preserve all other platforms.
 *
 * An empty handle intentionally removes
 * that specific platform.
 *
 * An omitted platform is NOT changed.
 */
function parseSocialLinkUpdates(
  value: unknown
): ParsedSocialLink[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const result: ParsedSocialLink[] = [];

  /*
   * Multiple rows for the same social platform
   * are supported. This matches the repeatable
   * social-link UI used by seller/admin forms.
   *
   * PHONE remains a single canonical platform
   * because Business.phone is a single mirrored
   * value and must stay synchronized with it.
   */
  let phoneAlreadyProvided = false;

  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const record =
      item as Record<string, unknown>;

    if (
      !isSocialPlatform(record.platform)
    ) {
      continue;
    }

    if (record.platform === "PHONE") {
      if (phoneAlreadyProvided) {
        continue;
      }

      phoneAlreadyProvided = true;
    }

    let handle =
      cleanString(record.handle);

    /*
     * Preserve an intentionally empty
     * handle so PATCH can interpret it
     * as removal of that platform.
     */
    if (handle) {
      handle = normalizeSocialHandle(
        record.platform,
        handle
      );
    }

    result.push({
      platform: record.platform,
      handle,
    });
  }

  return result;
}

function getPhoneUpdateFromSocialLinks(
  socialLinks: ParsedSocialLink[]
): ParsedSocialLink | null {
  return (
    socialLinks.find(
      (link) =>
        link.platform === "PHONE"
    ) ?? null
  );
}

function parseCategoryIds(
  value: unknown
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            item
          ): item is string =>
            typeof item === "string"
        )
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

/*
 * Build the canonical Location.address
 * from the structured seller location fields.
 *
 * EXACT ReMarket order:
 *
 * House Number
 * Street
 * Area
 * City
 * Nigeria
 *
 * Optional values are omitted.
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

/*
 * Parse structured location fields from
 * the request.
 *
 * Street is preferred.
 * Area is required.
 *
 * House number and city are optional.
 *
 * `address` remains accepted for backward
 * compatibility with the existing Seller UI
 * and older callers.
 */
function parseLocationInput(
  payload: Record<string, unknown>
): ParsedLocationInput {
  const area =
    cleanString(payload.area);

  const street =
    cleanString(payload.street);

  const houseNumber =
    cleanString(payload.houseNumber);

  const city =
    cleanString(payload.city);

  const suppliedAddress =
    cleanString(payload.address);

  const address = street
    ? composeLocationAddress(
        houseNumber,
        street,
        area,
        city
      )
    : suppliedAddress;

  return {
    area,
    address,
    houseNumber,
    street,
    city,
  };
}

/*
 * Existing Location stores the structured
 * street separately now, but older locations
 * may not have it populated yet.
 *
 * The canonical address format is:
 *
 *   House Number, Street, Area, City, Nigeria
 *
 * Older records may also have:
 *
 *   House Number, Street, City, Area, Nigeria
 *
 * or address-only/free-form values.
 *
 * This helper therefore:
 *
 * 1. removes Nigeria;
 * 2. recognizes the stored area when it appears
 *    at the end or immediately before the city;
 * 3. reconstructs house number, street, and city
 *    as safely as possible.
 */
function parseStoredLocationAddress(
  address: string | null,
  area: string
): ParsedStoredAddress {
  if (!address) {
    return {
      houseNumber: "",
      street: "",
      city: "",
    };
  }

  let parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      houseNumber: "",
      street: "",
      city: "",
    };
  }

  /*
   * Remove the country suffix when present.
   */
  if (
    parts[parts.length - 1]
      .toLowerCase() === "nigeria"
  ) {
    parts = parts.slice(0, -1);
  }

  if (parts.length === 0) {
    return {
      houseNumber: "",
      street: "",
      city: "",
    };
  }

  /*
   * The confirmed ReMarket format places Area:
   *
   *   - immediately before City when City exists;
   *   - at the end when City is omitted.
   *
   * Some older records may use:
   *
   *   House, Street, City, Area
   *
   * so we support both placements.
   */
  const normalizedArea =
    area.trim().toLowerCase();

  if (normalizedArea) {
    let areaIndex = -1;

    for (
      let index = parts.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (
        parts[index].toLowerCase() ===
          normalizedArea &&
        (
          index ===
            parts.length - 1 ||
          index ===
            parts.length - 2
        )
      ) {
        areaIndex = index;
        break;
      }
    }

    if (areaIndex >= 0) {
      parts.splice(areaIndex, 1);
    }
  }

  if (parts.length === 0) {
    return {
      houseNumber: "",
      street: "",
      city: "",
    };
  }

  if (parts.length === 1) {
    return {
      houseNumber: "",
      street: parts[0],
      city: "",
    };
  }

  /*
   * At this point two parts can represent:
   *
   *   Street, City
   *
   * or:
   *
   *   House Number, Street
   *
   * Detect the second form when the first
   * value clearly looks like a house/shop number.
   */
  if (parts.length === 2) {
    const firstPart = parts[0];

    const looksLikeHouseNumber =
      /^(?:\d+[A-Za-z]?(?:\s*[/-]\s*[\w-]+)?|(?:shop|suite|unit|plot|house|block)\s*[\w-]+)$/i.test(
        firstPart
      );

    if (looksLikeHouseNumber) {
      return {
        houseNumber: firstPart,
        street: parts[1],
        city: "",
      };
    }

    return {
      houseNumber: "",
      street: parts[0],
      city: parts[1],
    };
  }

  /*
   * Three or more remaining parts are interpreted
   * as:
   *
   *   House Number, Street, City...
   *
   * which supports canonical structured addresses
   * after the known Area value has been removed.
   */
  return {
    houseNumber: parts[0],
    street: parts[1],
    city: parts
      .slice(2)
      .join(", "),
  };
}

async function loadSellerBusiness(
  ownerId: string
) {
  return prisma.business.findUnique({
    where: {
      ownerId,
    },

    include: {
      location: true,

      categories: {
        include: {
          category: true,
        },
      },

      products: {
        where: {
          deletedAt: null,
        },

        orderBy: {
          updatedAt: "desc",
        },

        include: {
          images: {
            orderBy: {
              sortOrder: "asc",
            },
          },

          category: true,
        },
      },

      socialLinks: {
        orderBy: {
          platform: "asc",
        },
      },
    },
  });
}

/*
 * ------------------------------------------------
 * GET
 * ------------------------------------------------
 */

export async function GET() {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const business =
      await loadSellerBusiness(
        auth.user.id
      );

    return NextResponse.json(
      {
        business,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Seller business fetch error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load business.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/*
 * ------------------------------------------------
 * POST
 * ------------------------------------------------
 */

export async function POST(
  request: Request
) {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  if (auth.business) {
    return NextResponse.json(
      {
        error:
          "This seller account already has a business.",
      },
      {
        status: 409,
        headers: jsonHeaders(),
      }
    );
  }

  try {
    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

    const name =
      cleanString(payload.name);

    const ownerName =
      cleanString(payload.ownerName);

    const description =
      cleanString(payload.description);

    const locationInput =
      parseLocationInput(payload);

    const area =
      locationInput.area;

    const address =
      locationInput.address;

    const street =
      locationInput.street;

    const imageUrl =
      cleanString(payload.imageUrl);

    const categoryIds =
      parseCategoryIds(
        payload.categoryIds
      );

    if (
      payload.categoryIds !== undefined &&
      !categoryIds
    ) {
      return NextResponse.json(
        {
          error:
            "categoryIds must be an array.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const finalCategoryIds =
      categoryIds ?? [];

    const availability =
      parseAvailability(
        payload.availability
      );

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Business name is required.",
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
          error:
            "Business name is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * LOCATION
     * -----------------------------------------
     */

    if (!area) {
      return NextResponse.json(
        {
          error:
            "Business area is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (area.length > 200) {
      return NextResponse.json(
        {
          error:
            "Business area is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!street && !address) {
      return NextResponse.json(
        {
          error:
            "Business street/address is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (address.length > 2000) {
      return NextResponse.json(
        {
          error:
            "Business address is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (ownerName.length > 200) {
      return NextResponse.json(
        {
          error:
            "Owner name is too long.",
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
          error:
            "Business description is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (imageUrl.length > 2000) {
      return NextResponse.json(
        {
          error:
            "Image URL is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const availabilityWasProvided =
      payload.availability !==
        undefined &&
      payload.availability !== null &&
      payload.availability !== "";

    if (
      availabilityWasProvided &&
      availability === null
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid availability value.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * PRICES
     * -----------------------------------------
     */

    const priceMin =
      parseOptionalInt(
        payload.priceMin
      );

    const priceMax =
      parseOptionalInt(
        payload.priceMax
      );

    if (
      priceMin === "INVALID" ||
      priceMax === "INVALID"
    ) {
      return NextResponse.json(
        {
          error:
            "Price values must be whole numbers.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      priceMin !== null &&
      priceMin < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be negative.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      priceMax !== null &&
      priceMax < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum price cannot be negative.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

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

    /*
     * -----------------------------------------
     * COORDINATES
     * -----------------------------------------
     */

    const parsedLat =
      parseOptionalFloat(
        payload.lat
      );

    const longProvided =
      Object.prototype.hasOwnProperty.call(
        payload,
        "long"
      );

    const lngProvided =
      Object.prototype.hasOwnProperty.call(
        payload,
        "lng"
      );

    if (
      longProvided &&
      lngProvided
    ) {
      return NextResponse.json(
        {
          error:
            "Provide longitude using either 'long' or 'lng', not both.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const parsedLong =
      parseOptionalFloat(
        longProvided
          ? payload.long
          : payload.lng
      );

    if (
      parsedLat === "INVALID" ||
      parsedLong === "INVALID"
    ) {
      return NextResponse.json(
        {
          error:
            "Latitude and longitude must be valid numbers.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const coordinateError =
      validateCoordinates(
        parsedLat,
        parsedLong
      );

    if (coordinateError) {
      return NextResponse.json(
        {
          error: coordinateError,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * SOCIAL LINKS + PHONE
     * -----------------------------------------
     */

    const socialLinksProvided =
      payload.socialLinks !==
      undefined;

    let socialLinks:
      | ParsedSocialLink[]
      | null = null;

    if (socialLinksProvided) {
      socialLinks =
        parseSocialLinkUpdates(
          payload.socialLinks
        );

      if (!socialLinks) {
        return NextResponse.json(
          {
            error:
              "socialLinks must be an array.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }
    }

    const legacyPhoneProvided =
      Object.prototype.hasOwnProperty.call(
        payload,
        "phone"
      );

    const legacyPhoneRaw =
      legacyPhoneProvided
        ? cleanString(payload.phone)
        : "";

    if (legacyPhoneRaw.length > 50) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const normalizedLegacyPhone =
      legacyPhoneRaw
        ? normalizePhone(
            legacyPhoneRaw
          )
        : null;

    if (
      normalizedLegacyPhone &&
      normalizedLegacyPhone.length > 50
    ) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * On creation:
     *
     * - provided social links are created;
     * - blank social-link entries are ignored;
     * - legacy phone is converted to PHONE when
     *   no PHONE social link was explicitly supplied;
     * - Business.phone mirrors the PHONE value.
     */
    const createSocialLinks =
      (socialLinks ?? []).filter(
        (link) =>
          Boolean(link.handle)
      );

    const createPhoneSocial =
      createSocialLinks.find(
        (link) =>
          link.platform === "PHONE"
      );

    let finalCreateSocialLinks =
      [...createSocialLinks];

    if (
      !createPhoneSocial &&
      normalizedLegacyPhone
    ) {
      finalCreateSocialLinks.push({
        platform: "PHONE",
        handle:
          normalizedLegacyPhone,
      });
    }

    const phone =
      finalCreateSocialLinks.find(
        (link) =>
          link.platform === "PHONE"
      )?.handle ?? null;

    if (
      phone &&
      phone.length > 50
    ) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * CATEGORIES
     * -----------------------------------------
     */

    let categories: {
      id: string;
    }[] = [];

    if (
      finalCategoryIds.length > 0
    ) {
      categories =
        await prisma.category.findMany(
          {
            where: {
              id: {
                in:
                  finalCategoryIds,
              },

              isActive: true,
            },

            select: {
              id: true,
            },
          }
        );

      if (
        categories.length !==
        finalCategoryIds.length
      ) {
        return NextResponse.json(
          {
            error:
              "One or more selected categories are invalid or inactive.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }
    }

    /*
     * Re-check ownership immediately before
     * creation to preserve the one-business-
     * per-seller rule.
     */

    const existingBusiness =
      await prisma.business.findUnique(
        {
          where: {
            ownerId:
              auth.user.id,
          },

          select: {
            id: true,
          },
        }
      );

    if (existingBusiness) {
      return NextResponse.json(
        {
          error:
            "This seller account already has a business.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * RESOLVE BUSINESS LOCATION
     * -----------------------------------------
     */

    let resolvedLat =
      parsedLat;

    let resolvedLong =
      parsedLong;

    let resolvedStreet:
      | string
      | null =
      street || null;

    if (
      resolvedLat === null &&
      resolvedLong === null &&
      address
    ) {
      try {
        const geocoded =
          await geocodeBusinessLocation(
            {
              address,
              area,
              city:
                locationInput.city ||
                undefined,
            }
          );

        resolvedLat =
          geocoded.latitude;

        resolvedLong =
          geocoded.longitude;

        if (geocoded.street) {
          resolvedStreet =
            geocoded.street;
        }
      } catch (error) {
        console.warn(
          "Seller business address could not be geocoded. Saving without precise coordinates:",
          error
        );
      }
    }

    const resolvedCoordinateError =
      validateCoordinates(
        resolvedLat,
        resolvedLong
      );

    if (resolvedCoordinateError) {
      return NextResponse.json(
        {
          error:
            resolvedCoordinateError,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const businessAvailability:
      AvailabilityValue =
      availability ??
      "ASK_SELLER";

    /*
     * -----------------------------------------
     * CREATE BUSINESS
     * -----------------------------------------
     */

    const business =
      await prisma.$transaction(
        async (tx) => {
          /*
           * Every seller business receives
           * its own Location record.
           *
           * Never reuse a location merely
           * because another business is in
           * the same area.
           */
          const location =
            await tx.location.create(
              {
                data: {
                  area,

                  street:
                    resolvedStreet,

                  address:
                    address || null,

                  lat:
                    resolvedLat,

                  long:
                    resolvedLong,

                  verification:
                    "UNVERIFIED",
                },
              }
            );

          const createdBusiness =
            await tx.business.create(
              {
                data: {
                  name,

                  ownerName:
                    ownerName ||
                    auth.user.name ||
                    null,

                  ownerId:
                    auth.user.id,

                  description:
                    description ||
                    null,

                  locationId:
                    location.id,

                  priceMin,

                  priceMax,

                  availability:
                    businessAvailability,

                  phone,

                  imageUrl:
                    imageUrl || null,

                  categories:
                    categories.length >
                    0
                      ? {
                          create:
                            categories.map(
                              (
                                category
                              ) => ({
                                categoryId:
                                  category.id,
                              })
                            ),
                        }
                      : undefined,
                },
              }
            );

          if (
            finalCreateSocialLinks.length >
            0
          ) {
            await tx.businessSocialLink.createMany(
              {
                data:
                  finalCreateSocialLinks.map(
                    (link) => ({
                      businessId:
                        createdBusiness.id,

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

          return tx.business.findUniqueOrThrow(
            {
              where: {
                id:
                  createdBusiness.id,
              },

              include: {
                location: true,

                categories: {
                  include: {
                    category:
                      true,
                  },
                },

                products: {
                  where: {
                    deletedAt:
                      null,
                  },

                  orderBy: {
                    updatedAt:
                      "desc",
                  },

                  include: {
                    images: {
                      orderBy: {
                        sortOrder:
                          "asc",
                      },
                    },

                    category:
                      true,
                  },
                },

                socialLinks: {
                  orderBy: {
                    platform:
                      "asc",
                  },
                },
              },
            }
          );
        }
      );

    return NextResponse.json(
      {
        message:
          "Business created successfully.",

        business,
      },
      {
        status: 201,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller business creation error:",
      error
    );

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "This seller account already has a business.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to create business.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/*
 * ------------------------------------------------
 * PATCH
 * ------------------------------------------------
 */

export async function PATCH(
  request: Request
) {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

    const existingBusiness =
      await prisma.business.findUnique(
        {
          where: {
            ownerId:
              auth.user.id,
          },

          select: {
            id: true,
            ownerId: true,
            deletedAt: true,

            priceMin: true,
            priceMax: true,

            location: {
              select: {
                id: true,
                area: true,
                street: true,
                address: true,
                lat: true,
                long: true,
                verification:
                  true,
              },
            },
          },
        }
      );

    if (!existingBusiness) {
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

    if (
      existingBusiness.ownerId !==
      auth.user.id
    ) {
      return NextResponse.json(
        {
          error:
            "You are not allowed to edit this business.",
        },
        {
          status: 403,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      existingBusiness.deletedAt
    ) {
      return NextResponse.json(
        {
          error:
            "This business has been deleted.",
        },
        {
          status: 410,
          headers: jsonHeaders(),
        }
      );
    }

    const has = (
      key: string
    ): boolean =>
      Object.prototype.hasOwnProperty.call(
        payload,
        key
      );

    /*
     * -----------------------------------------
     * BUSINESS FIELDS
     * -----------------------------------------
     */

    const name =
      has("name")
        ? cleanString(payload.name)
        : undefined;

    const ownerName =
      has("ownerName")
        ? cleanString(
            payload.ownerName
          )
        : undefined;

    const description =
      has("description")
        ? cleanString(
            payload.description
          )
        : undefined;

    const imageUrl =
      has("imageUrl")
        ? cleanString(
            payload.imageUrl
          )
        : undefined;

    const availabilityProvided =
      has("availability");

    const availability =
      availabilityProvided
        ? parseAvailability(
            payload.availability
          )
        : undefined;

    if (
      name !== undefined &&
      !name
    ) {
      return NextResponse.json(
        {
          error:
            "Business name cannot be empty.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      name !== undefined &&
      name.length > 200
    ) {
      return NextResponse.json(
        {
          error:
            "Business name is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      ownerName !== undefined &&
      ownerName.length > 200
    ) {
      return NextResponse.json(
        {
          error:
            "Owner name is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      description !== undefined &&
      description.length > 2000
    ) {
      return NextResponse.json(
        {
          error:
            "Description is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      imageUrl !== undefined &&
      imageUrl.length > 2000
    ) {
      return NextResponse.json(
        {
          error:
            "Image URL is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      availabilityProvided &&
      availability === null
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid availability value.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * PRICE
     * -----------------------------------------
     */

    const priceMinProvided =
      has("priceMin");

    const priceMaxProvided =
      has("priceMax");

    const priceMin =
      priceMinProvided
        ? parseOptionalInt(
            payload.priceMin
          )
        : undefined;

    const priceMax =
      priceMaxProvided
        ? parseOptionalInt(
            payload.priceMax
          )
        : undefined;

    if (
      priceMin === "INVALID" ||
      priceMax === "INVALID"
    ) {
      return NextResponse.json(
        {
          error:
            "Price values must be whole numbers.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      priceMin !== undefined &&
      priceMin !== null &&
      priceMin < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be negative.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      priceMax !== undefined &&
      priceMax !== null &&
      priceMax < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum price cannot be negative.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const resultingPriceMin =
      priceMinProvided
        ? priceMin ?? null
        : existingBusiness.priceMin;

    const resultingPriceMax =
      priceMaxProvided
        ? priceMax ?? null
        : existingBusiness.priceMax;

    if (
      resultingPriceMin !== null &&
      resultingPriceMax !== null &&
      resultingPriceMin >
        resultingPriceMax
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

    /*
     * -----------------------------------------
     * CATEGORIES
     * -----------------------------------------
     */

    const categoryIdsProvided =
      has("categoryIds");

    let categoryIds: string[] = [];

    if (categoryIdsProvided) {
      const parsedCategoryIds =
        parseCategoryIds(
          payload.categoryIds
        );

      if (!parsedCategoryIds) {
        return NextResponse.json(
          {
            error:
              "categoryIds must be an array.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      categoryIds =
        parsedCategoryIds;

      if (
        categoryIds.length > 0
      ) {
        const validCategories =
          await prisma.category.findMany(
            {
              where: {
                id: {
                  in: categoryIds,
                },

                isActive: true,
              },

              select: {
                id: true,
              },
            }
          );

        if (
          validCategories.length !==
          categoryIds.length
        ) {
          return NextResponse.json(
            {
              error:
                "One or more selected categories are invalid or inactive.",
            },
            {
              status: 400,
              headers: jsonHeaders(),
            }
          );
        }
      }
    }

    /*
     * -----------------------------------------
     * SOCIAL / PHONE
     * -----------------------------------------
     */

    const socialLinksProvided =
      has("socialLinks");

    let socialLinks:
      | ParsedSocialLink[]
      | null = null;

    if (socialLinksProvided) {
      socialLinks =
        parseSocialLinkUpdates(
          payload.socialLinks
        );

      if (!socialLinks) {
        return NextResponse.json(
          {
            error:
              "socialLinks must be an array.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }
    }

    const legacyPhoneProvided =
      has("phone");

    const legacyPhoneRaw =
      legacyPhoneProvided
        ? cleanString(
            payload.phone
          )
        : "";

    if (
      legacyPhoneRaw.length > 50
    ) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const normalizedLegacyPhone =
      legacyPhoneRaw
        ? normalizePhone(
            legacyPhoneRaw
          )
        : null;

    if (
      normalizedLegacyPhone &&
      normalizedLegacyPhone.length > 50
    ) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const phoneSocialUpdate =
      getPhoneUpdateFromSocialLinks(
        socialLinks ?? []
      );

    let phoneUpdate:
      | string
      | null
      | undefined =
      undefined;

    if (phoneSocialUpdate) {
      phoneUpdate =
        phoneSocialUpdate.handle ||
        null;
    } else if (
      legacyPhoneProvided
    ) {
      phoneUpdate =
        normalizedLegacyPhone;
    }

    if (
      phoneUpdate &&
      phoneUpdate.length > 50
    ) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * LOCATION
     * -----------------------------------------
     */

    const areaProvided =
      has("area");

    const addressProvided =
      has("address");

    const streetProvided =
      has("street");

    const houseNumberProvided =
      has("houseNumber");

    const cityProvided =
      has("city");

    const latProvided =
      has("lat");

    const longProvided =
      has("long");

    const lngProvided =
      has("lng");

    if (
      longProvided &&
      lngProvided
    ) {
      return NextResponse.json(
        {
          error:
            "Provide longitude using either 'long' or 'lng', not both.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const locationWasProvided =
      areaProvided ||
      addressProvided ||
      streetProvided ||
      houseNumberProvided ||
      cityProvided ||
      latProvided ||
      longProvided ||
      lngProvided;

    let newLocationData:
      | {
          area: string;
          street: string | null;
          address: string | null;
          lat: number | null;
          long: number | null;
        }
      | null = null;

    if (locationWasProvided) {
      const currentArea =
        existingBusiness.location
          ?.area ?? "";

      const currentStoredStreet =
        existingBusiness.location
          ?.street ?? null;

      const currentAddress =
        existingBusiness.location
          ?.address ?? null;

      const currentLat =
        existingBusiness.location
          ?.lat ?? null;

      const currentLong =
        existingBusiness.location
          ?.long ?? null;

      const parsedExistingAddress =
        parseStoredLocationAddress(
          currentAddress,
          currentArea
        );

      const existingStreet =
        currentStoredStreet ||
        parsedExistingAddress.street;

      const resultingArea =
        areaProvided
          ? cleanString(
              payload.area
            )
          : currentArea;

      if (!resultingArea) {
        return NextResponse.json(
          {
            error:
              "Business area is required.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      if (
        resultingArea.length > 200
      ) {
        return NextResponse.json(
          {
            error:
              "Business area is too long.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      const structuredLocationWasProvided =
        streetProvided ||
        houseNumberProvided ||
        cityProvided;

      let resultingStreet =
        existingStreet;

      let resultingAddress = "";

      if (
        structuredLocationWasProvided
      ) {
        resultingStreet =
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

        if (!resultingStreet) {
          return NextResponse.json(
            {
              error:
                "Street, road, or close is required.",
            },
            {
              status: 400,
              headers: jsonHeaders(),
            }
          );
        }

        /*
         * Exact ReMarket address order:
         *
         * House Number, Street, Area, City, Nigeria
         */
        resultingAddress =
          composeLocationAddress(
            resultingHouseNumber,
            resultingStreet,
            resultingArea,
            resultingCity
          );
      } else {
        /*
         * Backward-compatible address-only
         * update path.
         */
        resultingAddress =
          addressProvided
            ? cleanString(
                payload.address
              )
            : currentAddress ?? "";
      }

      if (
        !structuredLocationWasProvided &&
        !resultingAddress
      ) {
        return NextResponse.json(
          {
            error:
              "Business address is required.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      if (
        resultingAddress.length >
        2000
      ) {
        return NextResponse.json(
          {
            error:
              "Business address is too long.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      const parsedLat =
        latProvided
          ? parseOptionalFloat(
              payload.lat
            )
          : currentLat;

      const parsedLong =
        longProvided ||
        lngProvided
          ? parseOptionalFloat(
              longProvided
                ? payload.long
                : payload.lng
            )
          : currentLong;

      if (
        parsedLat === "INVALID" ||
        parsedLong === "INVALID"
      ) {
        return NextResponse.json(
          {
            error:
              "Latitude and longitude must be valid numbers.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      const coordinateError =
        validateCoordinates(
          parsedLat,
          parsedLong
        );

      if (coordinateError) {
        return NextResponse.json(
          {
            error:
              coordinateError,
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      const areaChanged =
        currentArea !==
        resultingArea;

      const addressChanged =
        currentAddress !==
        (resultingAddress || null);

      const streetChanged =
        existingStreet !==
        (resultingStreet || null);

      const coordinatesChanged =
        currentLat !== parsedLat ||
        currentLong !== parsedLong;

      let resolvedLat =
        parsedLat;

      let resolvedLong =
        parsedLong;

      let resolvedStreet:
        | string
        | null =
        resultingStreet || null;

      if (
        areaChanged ||
        addressChanged
      ) {
        const hasFreshCoordinates =
          parsedLat !== null &&
          parsedLong !== null &&
          coordinatesChanged;

        if (!hasFreshCoordinates) {
          resolvedStreet =
            structuredLocationWasProvided
              ? resultingStreet ||
                null
              : null;

          if (resultingAddress) {
            try {
              const geocoded =
                await geocodeBusinessLocation(
                  {
                    address:
                      resultingAddress,

                    area:
                      resultingArea,
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
            } catch (error) {
              console.warn(
                "Seller business address could not be geocoded. Saving the changed address without precise coordinates:",
                error
              );

              /*
               * Do not retain coordinates that
               * belong to the previous location.
               */
              resolvedLat = null;
              resolvedLong = null;
            }
          } else {
            resolvedLat = null;
            resolvedLong = null;
          }
        }
      }

      if (
        streetChanged &&
        !(
          areaChanged ||
          addressChanged
        )
      ) {
        resolvedStreet =
          resultingStreet || null;
      }

      const locationChanged =
        !existingBusiness.location ||
        currentArea !==
          resultingArea ||
        currentStoredStreet !==
          (resolvedStreet || null) ||
        currentAddress !==
          (resultingAddress || null) ||
        currentLat !== resolvedLat ||
        currentLong !== resolvedLong;

      const resolvedCoordinateError =
        validateCoordinates(
          resolvedLat,
          resolvedLong
        );

      if (resolvedCoordinateError) {
        return NextResponse.json(
          {
            error:
              resolvedCoordinateError,
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      if (locationChanged) {
        newLocationData = {
          area: resultingArea,
          street: resolvedStreet,
          address:
            resultingAddress || null,
          lat: resolvedLat,
          long: resolvedLong,
        };
      }
    }

    /*
     * -----------------------------------------
     * BUILD UPDATE DATA
     * -----------------------------------------
     */

    const updateData: {
      name?: string;
      ownerName?: string | null;
      description?: string | null;
      locationId?: string;
      phone?: string | null;
      imageUrl?: string | null;
      availability?: AvailabilityValue;
      priceMin?: number | null;
      priceMax?: number | null;
    } = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (ownerName !== undefined) {
      updateData.ownerName =
        ownerName || null;
    }

    if (
      description !== undefined
    ) {
      updateData.description =
        description || null;
    }

    if (imageUrl !== undefined) {
      updateData.imageUrl =
        imageUrl || null;
    }

    if (
      availabilityProvided &&
      availability !== null &&
      availability !== undefined
    ) {
      updateData.availability =
        availability;
    }

    if (priceMinProvided) {
      updateData.priceMin =
        priceMin ?? null;
    }

    if (priceMaxProvided) {
      updateData.priceMax =
        priceMax ?? null;
    }

    /*
     * PHONE is updated only when the seller
     * actually touched PHONE or legacy phone.
     */
    if (phoneUpdate !== undefined) {
      updateData.phone =
        phoneUpdate;
    }

    /*
     * -----------------------------------------
     * TRANSACTION
     * -----------------------------------------
     */

    await prisma.$transaction(
      async (tx) => {
        /*
         * LOCATION
         */

        if (newLocationData) {
          const location =
            await tx.location.create(
              {
                data: {
                  area:
                    newLocationData.area,

                  street:
                    newLocationData.street,

                  address:
                    newLocationData.address,

                  lat:
                    newLocationData.lat,

                  long:
                    newLocationData.long,

                  /*
                   * Seller-submitted location
                   * remains unverified.
                   */
                  verification:
                    "UNVERIFIED",
                },
              }
            );

          updateData.locationId =
            location.id;
        }

        /*
         * BUSINESS
         */

        await tx.business.update(
          {
            where: {
              id:
                existingBusiness.id,
            },

            data: updateData,
          }
        );

        /*
         * CATEGORIES
         */

        if (
          categoryIdsProvided
        ) {
          await tx.businessCategory.deleteMany(
            {
              where: {
                businessId:
                  existingBusiness.id,
              },
            }
          );

          if (
            categoryIds.length > 0
          ) {
            await tx.businessCategory.createMany(
              {
                data:
                  categoryIds.map(
                    (categoryId) => ({
                      businessId:
                        existingBusiness.id,

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
         * SOCIAL LINKS
         */

        if (
          socialLinksProvided
        ) {
          const socialLinksByPlatform =
            new Map<
              SocialPlatform,
              ParsedSocialLink[]
            >();

          for (
            const link of
              socialLinks ?? []
          ) {
            const existingLinks =
              socialLinksByPlatform.get(
                link.platform
              ) ?? [];

            existingLinks.push(
              link
            );

            socialLinksByPlatform.set(
              link.platform,
              existingLinks
            );
          }

          for (
            const [
              platform,
              links,
            ] of socialLinksByPlatform
          ) {
            await tx.businessSocialLink.deleteMany(
              {
                where: {
                  businessId:
                    existingBusiness.id,

                  platform,
                },
              }
            );

            const validLinks =
              links.filter(
                (link) =>
                  Boolean(
                    link.handle
                  )
              );

            if (
              validLinks.length === 0
            ) {
              continue;
            }

            await tx.businessSocialLink.createMany(
              {
                data:
                  validLinks.map(
                    (link) => ({
                      businessId:
                        existingBusiness.id,

                      platform:
                        link.platform,

                      handle:
                        link.handle,
                    })
                  ),
              }
            );
          }
        }

        /*
         * LEGACY PHONE-ONLY UPDATE
         */

        if (
          legacyPhoneProvided &&
          !phoneSocialUpdate
        ) {
          await tx.businessSocialLink.deleteMany(
            {
              where: {
                businessId:
                  existingBusiness.id,

                platform:
                  "PHONE",
              },
            }
          );

          if (normalizedLegacyPhone) {
            await tx.businessSocialLink.create(
              {
                data: {
                  businessId:
                    existingBusiness.id,

                  platform:
                    "PHONE",

                  handle:
                    normalizedLegacyPhone,
                },
              }
            );
          }
        }
      }
    );

    const business =
      await loadSellerBusiness(
        auth.user.id
      );

    return NextResponse.json(
      {
        message:
          "Business updated successfully.",

        business,
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller business update error:",
      error
    );

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "Business could not be found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "This business update conflicts with an existing record.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to update business.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}