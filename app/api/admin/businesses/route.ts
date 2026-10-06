import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Availability,
  BusinessStatus,
  SocialPlatform,
  VerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { geocodeBusinessLocation } from "@/lib/geocoding";

const MAX_PRISMA_INT = 2_147_483_647;

const MAX_NAME_LENGTH = 200;
const MAX_OWNER_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_AREA_LENGTH = 200;
const MAX_STREET_LENGTH = 300;
const MAX_HOUSE_NUMBER_LENGTH = 100;
const MAX_CITY_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 2000;
const MAX_PHONE_LENGTH = 32;
const MAX_IMAGE_URL_LENGTH = 2000;
const MAX_CATEGORY_IDS = 50;
const MAX_CATEGORY_ID_LENGTH = 100;
const MAX_SOCIAL_LINKS = 6;
const MAX_SOCIAL_HANDLE_LENGTH = 2000;
const MAX_QUERY_LENGTH = 100;

function noStoreHeaders(): Headers {
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
  return typeof value === "string"
    ? value.trim()
    : "";
}

function nullableString(
  value: unknown
): string | null {
  const valueString =
    cleanString(value);

  return valueString || null;
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
    value === "AVAILABLE" ||
    value === "ASK_SELLER" ||
    value === "UNAVAILABLE"
  );
}

function isBusinessStatus(
  value: unknown
): value is BusinessStatus {
  return (
    value === "ACTIVE" ||
    value === "INACTIVE" ||
    value === "PENDING"
  );
}

function isVerificationStatus(
  value: unknown
): value is VerificationStatus {
  return (
    value === "VERIFIED" ||
    value === "UNVERIFIED"
  );
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

function normalizeWhatsApp(
  value: string
): string {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return "";
  }

  /*
   * Allow WhatsApp URLs to pass through.
   */
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

  /*
   * +2348012345678
   */
  if (
    digits.startsWith("234")
  ) {
    return `+${digits}`;
  }

  /*
   * 08012345678
   */
  if (
    digits.startsWith("0")
  ) {
    return `+234${digits.slice(
      1
    )}`;
  }

  /*
   * Preserve compatibility with
   * existing stored values.
   */
  return trimmed;
}

type ParsedSocialLink = {
  platform: SocialPlatform;
  handle: string;
};

function parseSocialLinks(
  value: unknown
): ParsedSocialLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result:
    ParsedSocialLink[] = [];

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
      handle.length >
      MAX_SOCIAL_HANDLE_LENGTH
    ) {
      continue;
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

    if (
      result.length >=
      MAX_SOCIAL_LINKS
    ) {
      break;
    }
  }

  return result;
}

function parseCategoryIds(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cleaned = value
    .filter(
      (
        item
      ): item is string =>
        typeof item ===
        "string"
    )
    .map(
      (item) =>
        item.trim()
    )
    .filter(Boolean)
    .filter(
      (item) =>
        item.length <=
        MAX_CATEGORY_ID_LENGTH
    );

  return Array.from(
    new Set(cleaned)
  ).slice(
    0,
    MAX_CATEGORY_IDS
  );
}

function isDeletionFilter(
  value: string | null
): value is
  | "ALL"
  | "ACTIVE"
  | "DELETED" {
  return (
    value === "ALL" ||
    value === "ACTIVE" ||
    value === "DELETED"
  );
}

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

function getLocationInput(
  payload: Record<
    string,
    unknown
  >
): {
  area: string;
  address: string | null;
  street: string | null;
  houseNumber: string;
  city: string;
} {
  const area =
    cleanString(
      payload.area
    );

  const street =
    cleanString(
      payload.street
    );

  const houseNumber =
    cleanString(
      payload.houseNumber
    );

  const city =
    cleanString(
      payload.city
    );

  const suppliedAddress =
    cleanString(
      payload.address
    );

  const address =
    street
      ? composeLocationAddress(
          houseNumber,
          street,
          area,
          city
        )
      : suppliedAddress;

  return {
    area,
    address:
      address || null,
    street:
      street || null,
    houseNumber,
    city,
  };
}

function invalidBodyResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        "Invalid request body.",
    },
    {
      status: 400,
      headers:
        noStoreHeaders(),
    }
  );
}

/*
 * ------------------------------------------------
 * GET BUSINESSES
 * ------------------------------------------------
 */

export async function GET(
  request: NextRequest
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } =
      new URL(request.url);

    const q =
      cleanString(
        searchParams.get("q")
      );

    const status =
      searchParams.get("status");

    const verification =
      searchParams.get(
        "verification"
      );

    const requestedDeletionFilter =
      searchParams.get(
        "deleted"
      );

    if (
      q.length >
      MAX_QUERY_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "Search query is too long.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (
      status !== null &&
      !isBusinessStatus(
        status
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
            noStoreHeaders(),
        }
      );
    }

    if (
      verification !==
        null &&
      !isVerificationStatus(
        verification
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
            noStoreHeaders(),
        }
      );
    }

    if (
      requestedDeletionFilter !==
        null &&
      !isDeletionFilter(
        requestedDeletionFilter
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid deletion filter.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    const deletionFilter =
      isDeletionFilter(
        requestedDeletionFilter
      )
        ? requestedDeletionFilter
        : "ALL";

    const businesses =
      await prisma.business.findMany(
        {
          where: {
            ...(q
              ? {
                  OR: [
                    {
                      name: {
                        contains:
                          q,
                        mode:
                          "insensitive",
                      },
                    },
                    {
                      ownerName: {
                        contains:
                          q,
                        mode:
                          "insensitive",
                      },
                    },
                    {
                      description: {
                        contains:
                          q,
                        mode:
                          "insensitive",
                      },
                    },
                  ],
                }
              : {}),

            ...(status
              ? {
                  status,
                }
              : {}),

            ...(verification
              ? {
                  verification,
                }
              : {}),

            ...(deletionFilter ===
            "ACTIVE"
              ? {
                  deletedAt:
                    null,
                }
              : deletionFilter ===
                "DELETED"
              ? {
                  deletedAt: {
                    not: null,
                  },
                }
              : {}),
          },

          include: {
            location: true,

            categories: {
              include: {
                category: true,
              },
            },

            _count: {
              select: {
                products: {
                  where: {
                    status:
                      BusinessStatus.ACTIVE,
                    deletedAt:
                      null,
                  },
                },
              },
            },
          },

          orderBy: [
            {
              deletedAt:
                "asc",
            },
            {
              updatedAt:
                "desc",
            },
          ],
        }
      );

    return NextResponse.json(
      {
        businesses:
          businesses.map(
            (business) => ({
              id:
                business.id,

              name:
                business.name,

              ownerName:
                business.ownerName,

              description:
                business.description,

              area:
                business.location
                  ?.area ??
                "",

              /*
               * Canonical street used by
               * the Near Me ranking system.
               */
              street:
                business.location
                  ?.street ??
                "",

              address:
                business.location
                  ?.address ??
                null,

              status:
                business.status,

              verification:
                business.verification,

              availability:
                business.availability,

              phone:
                business.phone,

              categories:
                business.categories.map(
                  (item) =>
                    item.category
                ),

              productCount:
                business._count
                  .products,

              onboardedAt:
                business.onboardedAt,

              deletedAt:
                business.deletedAt,
            })
          ),
      },
      {
        headers:
          noStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin businesses GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load businesses.",
      },
      {
        status: 500,
        headers:
          noStoreHeaders(),
      }
    );
  }
}

/*
 * ------------------------------------------------
 * POST BUSINESS
 * ------------------------------------------------
 */

export async function POST(
  request: NextRequest
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    /*
     * Reject clearly oversized JSON
     * bodies before parsing.
     */
    const contentLengthHeader =
      request.headers.get(
        "content-length"
      );

    if (contentLengthHeader) {
      const contentLength =
        Number(
          contentLengthHeader
        );

      if (
        Number.isFinite(
          contentLength
        ) &&
        contentLength >
          100_000
      ) {
        return NextResponse.json(
          {
            error:
              "Request body is too large.",
          },
          {
            status: 413,
            headers:
              noStoreHeaders(),
          }
        );
      }
    }

    let body: unknown;

    try {
      body =
        await request.json();
    } catch {
      return invalidBodyResponse();
    }

    if (
      !body ||
      typeof body !==
        "object" ||
      Array.isArray(body)
    ) {
      return invalidBodyResponse();
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

    /*
     * -----------------------------------------
     * BASIC BUSINESS FIELDS
     * -----------------------------------------
     */

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
            noStoreHeaders(),
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
            noStoreHeaders(),
        }
      );
    }

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
            noStoreHeaders(),
        }
      );
    }

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
            noStoreHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * LOCATION
     * -----------------------------------------
     */

    const locationInput =
      getLocationInput(
        payload
      );

    const area =
      locationInput.area;

    const address =
      locationInput.address;

    const street =
      locationInput.street;

    const city =
      locationInput.city;

    const houseNumber =
      locationInput.houseNumber;

    if (!area) {
      return NextResponse.json(
        {
          error:
            "Business area is required.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (
      area.length >
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
            noStoreHeaders(),
        }
      );
    }

    if (
      street &&
      street.length >
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
            noStoreHeaders(),
        }
      );
    }

    if (
      houseNumber.length >
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
            noStoreHeaders(),
        }
      );
    }

    if (
      city.length >
      MAX_CITY_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "City is too long.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (
      !address &&
      !street
    ) {
      return NextResponse.json(
        {
          error:
            "Business street/address is required.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (
      address !== null &&
      address.length >
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
            noStoreHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * COORDINATES
     * -----------------------------------------
     */

    const lat =
      parseOptionalFloat(
        payload.lat
      );

    if (
      lat === undefined ||
      (
        lat !== null &&
        (
          lat < -90 ||
          lat > 90
        )
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Latitude must be a valid value between -90 and 90.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    const longitudeProvidedByLong =
      Object.prototype.hasOwnProperty.call(
        payload,
        "long"
      );

    const longitudeProvidedByLng =
      Object.prototype.hasOwnProperty.call(
        payload,
        "lng"
      );

    if (
      longitudeProvidedByLong &&
      longitudeProvidedByLng
    ) {
      return NextResponse.json(
        {
          error:
            "Provide longitude using either 'long' or 'lng', not both.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    const long =
      parseOptionalFloat(
        longitudeProvidedByLong
          ? payload.long
          : payload.lng
      );

    if (
      long === undefined ||
      (
        long !== null &&
        (
          long < -180 ||
          long > 180
        )
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Longitude must be a valid value between -180 and 180.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    /*
     * Latitude and longitude must be supplied
     * together when coordinates are provided.
     */
    const hasLatitude =
      lat !== null;

    const hasLongitude =
      long !== null;

    if (
      hasLatitude !==
      hasLongitude
    ) {
      return NextResponse.json(
        {
          error:
            "Latitude and longitude must be provided together.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * LOCATION RESOLUTION
     * -----------------------------------------
     *
     * Coordinates, when explicitly supplied,
     * are used directly.
     *
     * When coordinates are absent, resolve the
     * business address through the shared geocoder.
     */

    let resolvedLat =
      lat;

    let resolvedLong =
      long;

    let resolvedStreet:
      | string
      | null =
      street;

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
                city ||
                undefined,
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
          "Business address could not be geocoded. Saving without precise coordinates:",
          error
        );
      }
    }

    /*
     * If coordinates are supplied without a
     * structured street, leave street null
     * rather than inventing one from coordinates.
     */

    /*
     * -----------------------------------------
     * PRODUCT-LEVEL PRICE SETTINGS
     * -----------------------------------------
     */

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
            noStoreHeaders(),
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
            noStoreHeaders(),
        }
      );
    }

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin >
        priceMax
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be greater than maximum price.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * ENUM FIELDS
     * -----------------------------------------
     */

    const availability =
      isAvailability(
        payload.availability
      )
        ? payload.availability
        : Availability.ASK_SELLER;

    const status =
      isBusinessStatus(
        payload.status
      )
        ? payload.status
        : BusinessStatus.ACTIVE;

    const verification =
      isVerificationStatus(
        payload.verification
      )
        ? payload.verification
        : VerificationStatus.UNVERIFIED;

    /*
     * -----------------------------------------
     * PHONE / IMAGE
     * -----------------------------------------
     */

    const legacyPhone =
      nullableString(
        payload.phone
      );

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
            noStoreHeaders(),
        }
      );
    }

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
            noStoreHeaders(),
        }
      );
    }

    if (imageUrl) {
      try {
        const parsedImageUrl =
          new URL(imageUrl);

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
                noStoreHeaders(),
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
              noStoreHeaders(),
          }
        );
      }
    }

    /*
     * -----------------------------------------
     * CATEGORIES
     * -----------------------------------------
     */

    const categoryIds =
      parseCategoryIds(
        payload.categoryIds
      );

    if (
      Array.isArray(
        payload.categoryIds
      ) &&
      payload.categoryIds.length >
        MAX_CATEGORY_IDS
    ) {
      return NextResponse.json(
        {
          error:
            "Too many categories were selected.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
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
                in: categoryIds,
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
              noStoreHeaders(),
          }
        );
      }
    }

    /*
     * -----------------------------------------
     * SOCIAL LINKS
     * -----------------------------------------
     */

    const socialLinks =
      parseSocialLinks(
        payload.socialLinks
      );

    if (
      Array.isArray(
        payload.socialLinks
      ) &&
      payload.socialLinks.length >
        MAX_SOCIAL_LINKS
    ) {
      return NextResponse.json(
        {
          error:
            "Too many social links were supplied.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    const phoneFromSocial =
      socialLinks.find(
        (link) =>
          link.platform ===
          SocialPlatform.PHONE
      )?.handle ??
      null;

    const phone =
      phoneFromSocial ??
      legacyPhone;

    if (
      phone &&
      !socialLinks.some(
        (link) =>
          link.platform ===
          SocialPlatform.PHONE
      )
    ) {
      socialLinks.push({
        platform:
          SocialPlatform.PHONE,
        handle:
          phone,
      });
    }

    /*
     * -----------------------------------------
     * CREATE BUSINESS
     * -----------------------------------------
     *
     * Every newly created business gets its own
     * Location record.
     */

    const business =
      await prisma.$transaction(
        async (tx) => {
          const location =
            await tx.location.create(
              {
                data: {
                  area,

                  /*
                   * Canonical street used by
                   * ReMarket Near Me.
                   */
                  street:
                    resolvedStreet,

                  address,

                  lat:
                    resolvedLat,

                  long:
                    resolvedLong,

                  /*
                   * Location verification is separate
                   * from Business verification.
                   */
                  verification:
                    "UNVERIFIED",
                },
              }
            );

          const created =
            await tx.business.create(
              {
                data: {
                  name,

                  ownerName,

                  description,

                  locationId:
                    location.id,

                  priceMin,

                  priceMax,

                  availability,

                  phone,

                  status,

                  verification,

                  imageUrl,

                  onboardedAt:
                    new Date(),
                },
              }
            );

          if (
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
                        created.id,

                      categoryId,
                    })
                  ),

                skipDuplicates:
                  true,
              }
            );
          }

          if (
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
                        created.id,

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
                  created.id,
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
        headers:
          noStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin businesses POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to create business.",
      },
      {
        status: 500,
        headers:
          noStoreHeaders(),
      }
    );
  }
}