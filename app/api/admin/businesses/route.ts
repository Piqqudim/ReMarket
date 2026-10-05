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

  const digits =
    trimmed.replace(
      /\D/g,
      ""
    );

  if (!digits) {
    return "";
  }

  if (
    digits.startsWith("234")
  ) {
    return `+${digits}`;
  }

  if (
    digits.startsWith("0")
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
): ParsedSocialLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result:
    ParsedSocialLink[] = [];

  const seen =
    new Set<SocialPlatform>();

  for (const item of value) {
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

function parseCategoryIds(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
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
        .map(
          (item) =>
            item.trim()
        )
        .filter(Boolean)
    )
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

/*
 * ------------------------------------------------
 * LOCATION HELPERS
 * ------------------------------------------------
 *
 * Admin location input now supports:
 *
 * area
 * address
 * street
 * houseNumber
 * city
 *
 * Existing address-only callers remain valid.
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

            ...(status &&
            isBusinessStatus(
              status
            )
              ? {
                  status,
                }
              : {}),

            ...(verification &&
            isVerificationStatus(
              verification
            )
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

    return NextResponse.json({
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
             * Expose the stored street to the
             * admin UI so administrators can
             * inspect the canonical Near Me
             * street value.
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
    });
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
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
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

    const ownerName =
      nullableString(
        payload.ownerName
      );

    const description =
      nullableString(
        payload.description
      );

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

    if (!area) {
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
      area.length >
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
        }
      );
    }

    if (
      address !== null &&
      address.length >
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
        }
      );
    }

    /*
     * ------------------------------------------------
     * LOCATION RESOLUTION
     * ------------------------------------------------
     *
     * Coordinates, when explicitly supplied by an
     * API caller, are used directly.
     *
     * When coordinates are absent, use the business
     * address through the shared geocoder.
     *
     * The geocoder can provide a canonical road
     * through its `street` result.
     *
     * If geocoding fails, the manually supplied
     * structured street is preserved.
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
     * structured street, we intentionally leave
     * street null rather than inventing one from
     * coordinates.
     *
     * A later location update can populate the
     * canonical street through address geocoding.
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
        }
      );
    }

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
     * ------------------------------------------------
     * PHONE / SOCIAL LINKS
     * ------------------------------------------------
     *
     * The PHONE social link is the canonical contact
     * value when it is supplied.
     *
     * The legacy Business.phone field is kept in sync
     * for compatibility with existing consumers.
     */

    const legacyPhone =
      nullableString(
        payload.phone
      );

    const imageUrl =
      nullableString(
        payload.imageUrl
      );

    const categoryIds =
      parseCategoryIds(
        payload.categoryIds
      );

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
          }
        );
      }
    }

    const socialLinks =
      parseSocialLinks(
        payload.socialLinks
      );

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

    const business =
      await prisma.$transaction(
        async (tx) => {
          /*
           * -----------------------------------------
           * BUSINESS-SPECIFIC LOCATION
           * -----------------------------------------
           *
           * Every newly created business receives
           * its own Location record.
           *
           * We NEVER search for or reuse a Location
           * by area.
           */

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
                   *
                   * A new location is unverified until
                   * its physical position is confirmed.
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
      }
    );
  }
}