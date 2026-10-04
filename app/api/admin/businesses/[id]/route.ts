import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Availability,
  BusinessStatus,
  LocationVerificationStatus,
  SocialPlatform,
  VerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { geocodeBusinessLocation } from "@/lib/geocoding";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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

  const parsed = Number(
    value
  );

  if (
    !Number.isInteger(
      parsed
    )
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

  const parsed = Number(
    value
  );

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

  const result: ParsedSocialLink[] =
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
      continue;
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
      continue;
    }

    let handle =
      cleanString(
        record.handle
      );

    if (
      record.platform ===
      SocialPlatform.WHATSAPP
    ) {
      handle =
        normalizeWhatsApp(
          handle
        );
    }

    if (
      !handle ||
      seen.has(
        record.platform
      )
    ) {
      continue;
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

  return Array.from(
    new Set(
      value
        .filter(
          (
            item
          ): item is string =>
            typeof item ===
            "string"
        )
        .map((item) =>
          item.trim()
        )
        .filter(Boolean)
    )
  );
}

/*
 * ------------------------------------------------
 * LOCATION HELPERS
 * ------------------------------------------------
 */

function composeLocationAddress(
  houseNumber: string,
  street: string,
  city: string,
  area: string
): string {
  return [
    houseNumber,
    street,
    city,
    area,
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

  const lastPart =
    parts[
      parts.length - 1
    ];

  if (
    lastPart.toLowerCase() ===
    "nigeria"
  ) {
    parts =
      parts.slice(
        0,
        -1
      );
  }

  if (
    parts.length > 0 &&
    area &&
    parts[
      parts.length - 1
    ].toLowerCase() ===
      area.trim().toLowerCase()
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
        city: "",
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
      parts.slice(2).join(", "),
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
          location: true,

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
        }
      );
    }

    return NextResponse.json(
      {
        business,
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
      }
    );
  }
}

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
        }
      );
    }

    const body: unknown =
      await request.json();

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
      availability?: Availability;
      status?: BusinessStatus;
      verification?: VerificationStatus;
      priceMin?: number | null;
      priceMax?: number | null;
      locationId?: string;
    } = {};

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
          }
        );
      }

      if (
        name.length >
        200
      ) {
        return NextResponse.json(
          {
            error:
              "Business name is too long.",
          },
          {
            status: 400,
          }
        );
      }

      data.name =
        name;
    }

    if (
      "ownerName" in
      payload
    ) {
      data.ownerName =
        nullableString(
          payload.ownerName
        );
    }

    if (
      "description" in
      payload
    ) {
      data.description =
        nullableString(
          payload.description
        );
    }

    /*
     * Legacy phone input is still
     * accepted for compatibility.
     *
     * When socialLinks are supplied,
     * the PHONE social link becomes
     * the source of truth.
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
        50
    ) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      legacyPhoneProvided
    ) {
      data.phone =
        legacyPhone;
    }

    if (
      "imageUrl" in
      payload
    ) {
      data.imageUrl =
        nullableString(
          payload.imageUrl
        );
    }

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
          }
        );
      }

      data.availability =
        payload.availability;
    }

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
          }
        );
      }

      data.status =
        payload.status;
    }

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
            "Minimum price must be a valid integer.",
        },
        {
          status: 400,
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
            "Maximum price must be a valid integer.",
        },
        {
          status: 400,
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
        }
      );
    }

    /*
     * -----------------------------------------
     * RELATIONSHIP FLAGS
     * -----------------------------------------
     *
     * Structured location fields are included
     * so an admin can change the street without
     * having to manually construct a combined
     * address string.
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
              "categoryIds must be an array.",
          },
          {
            status: 400,
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
              "socialLinks must be an array.",
          },
          {
            status: 400,
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
          50
      ) {
        return NextResponse.json(
          {
            error:
              "Phone number is too long.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * PHONE social link is the
       * authoritative phone value.
       *
       * Business.phone is maintained
       * as a compatibility mirror.
       */
      if (
        phoneFromSocial
      ) {
        data.phone =
          phoneFromSocial;
      } else if (
        legacyPhone
      ) {
        socialLinks.push({
          platform:
            SocialPlatform.PHONE,
          handle:
            legacyPhone,
        });

        data.phone =
          legacyPhone;
      } else {
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
        currentStreet ?
        parsedExistingAddress.street :
        "";

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
          }
        );
      }

      if (
        requestedArea.length >
        200
      ) {
        return NextResponse.json(
          {
            error:
              "Business area is too long.",
          },
          {
            status: 400,
          }
        );
      }

      /*
       * -----------------------------------------
       * STRUCTURED LOCATION INPUT
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

        if (!resultingStreet) {
          return NextResponse.json(
            {
              error:
                "Street, road, or close is required.",
            },
            {
              status: 400,
            }
          );
        }

        requestedStreet =
          resultingStreet;

        requestedAddress =
          composeLocationAddress(
            resultingHouseNumber,
            resultingStreet,
            resultingCity,
            requestedArea
          );
      } else {
        /*
         * Backward-compatible address-only
         * update path.
         */
        requestedAddress =
          "address" in
          payload
            ? nullableString(
                payload.address
              )
            : currentAddress;

        /*
         * When no new structured street is
         * supplied, preserve the existing
         * canonical street until a new address
         * is successfully geocoded.
         */
        requestedStreet =
          existingStreet ||
          null;
      }

      if (
        requestedAddress !==
          null &&
        requestedAddress.length >
          2000
      ) {
        return NextResponse.json(
          {
            error:
              "Business address is too long.",
          },
          {
            status: 400,
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
          }
        );
      }

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
          }
        );
      }

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
       * Address/area changes should not retain
       * stale coordinates from the old location.
       *
       * Successful geocoding supplies the canonical
       * road/street as well.
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
          /*
           * If the location was changed using
           * structured fields, retain the newly
           * supplied street as a fallback.
           *
           * For an address-only update, do not
           * blindly carry the old street.
           */
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
                      requestedArea,
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
               * Do not retain stale coordinates
               * belonging to the old location.
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
           * Fresh coordinates were explicitly
           * captured. Keep the structured street
           * supplied by the admin.
           */
          resolvedStreet =
            requestedStreet ??
            null;
        }
      }

      /*
       * If only the street value changed and
       * the other location fields did not,
       * preserve that explicit street value.
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
        if (
          locationWasProvided &&
          locationChanged
        ) {
          /*
           * A changed location always becomes
           * UNVERIFIED.
           *
           * Verification must happen separately
           * after the new location is confirmed.
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

        await tx.business.update(
          {
            where: {
              id,
            },

            data,
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
         * SOCIAL LINKS
         */

        if (
          socialLinksProvided
        ) {
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
           * Older callers can still submit only
           * phone.
           *
           * Keep the PHONE social link synchronized.
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
        }
      );
    }

    return NextResponse.json(
      {
        success:
          true,

        business:
          updatedBusiness,
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
      }
    );
  }
}

/*
 * ------------------------------------------------
 * SOFT DELETE
 * ------------------------------------------------
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
            name: true,
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
            name: true,
            deletedAt:
              true,
          },
        }
      );

    return NextResponse.json(
      {
        success:
          true,

        deleted:
          true,

        business,
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
      }
    );
  }
}