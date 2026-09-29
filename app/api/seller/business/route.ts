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

/*
 * -----------------------------------------
 * HELPERS
 * -----------------------------------------
 */

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
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

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : "INVALID";
  }

  if (
    typeof value === "string"
  ) {
    const cleaned =
      value.trim();

    if (!cleaned) {
      return null;
    }

    const parsed =
      Number(cleaned);

    return Number.isFinite(parsed)
      ? parsed
      : "INVALID";
  }

  return "INVALID";
}

/*
 * This function returns the exact
 * AvailabilityValue union.
 */
function parseAvailability(
  value: unknown
): AvailabilityValue | null {
  const cleaned =
    cleanString(value);

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
    "Content-Type":
      "application/json",
  };
}

function validateCoordinates(
  lat: number | null,
  long: number | null
): string | null {
  /*
   * Exact GPS location requires both
   * coordinates or neither.
   */
  if (
    (lat === null) !==
    (long === null)
  ) {
    return "Latitude and longitude must be provided together.";
  }

  if (
    lat !== null &&
    (lat < -90 ||
      lat > 90)
  ) {
    return "Latitude must be between -90 and 90.";
  }

  if (
    long !== null &&
    (long < -180 ||
      long > 180)
  ) {
    return "Longitude must be between -180 and 180.";
  }

  return null;
}

/*
 * -----------------------------------------
 * GET
 * -----------------------------------------
 */

export async function GET() {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const business =
      await prisma.business.findUnique({
        where: {
          ownerId:
            auth.user.id,
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
              deletedAt: null,
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
      });

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
        headers:
          jsonHeaders(),
      }
    );
  }
}

/*
 * -----------------------------------------
 * POST
 * -----------------------------------------
 */

export async function POST(
  request: Request
) {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  /*
   * One seller can own only one business.
   */
  if (auth.business) {
    return NextResponse.json(
      {
        error:
          "This seller account already has a business.",
      },
      {
        status: 409,
        headers:
          jsonHeaders(),
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
          headers:
            jsonHeaders(),
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

    const ownerName =
      cleanString(
        payload.ownerName
      );

    const description =
      cleanString(
        payload.description
      );

    const area =
      cleanString(
        payload.area
      );

    const address =
      cleanString(
        payload.address
      );

    const phone =
      cleanString(
        payload.phone
      );

    const imageUrl =
      cleanString(
        payload.imageUrl
      );

    const categoryIds =
      Array.isArray(
        payload.categoryIds
      )
        ? [
            ...new Set(
              payload.categoryIds
                .map(
                  (value) =>
                    typeof value ===
                    "string"
                      ? value.trim()
                      : ""
                )
                .filter(Boolean)
            ),
          ]
        : [];

    const availability =
      parseAvailability(
        payload.availability
      );

    /*
     * -----------------------------------------
     * BASIC VALIDATION
     * -----------------------------------------
     */

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Business name is required.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
        }
      );
    }

    if (!area) {
      return NextResponse.json(
        {
          error:
            "Business area is required.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
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
          headers:
            jsonHeaders(),
        }
      );
    }

    const availabilityWasProvided =
      payload.availability !==
        undefined &&
      payload.availability !==
        null &&
      payload.availability !==
        "";

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
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * PRICE VALIDATION
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
      priceMin ===
        "INVALID" ||
      priceMax ===
        "INVALID"
    ) {
      return NextResponse.json(
        {
          error:
            "Price values must be whole numbers.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
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
            jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * LOCATION COORDINATES
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
          headers:
            jsonHeaders(),
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
      parsedLat ===
        "INVALID" ||
      parsedLong ===
        "INVALID"
    ) {
      return NextResponse.json(
        {
          error:
            "Latitude and longitude must be valid numbers.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * LOCATION RESOLUTION
     * -----------------------------------------
     *
     * GPS coordinates, when supplied by the
     * seller UI, are treated as the strongest
     * available source.
     *
     * When coordinates are not supplied, use
     * the existing business address + area
     * through the shared Nominatim geocoder.
     *
     * If geocoding cannot produce a sufficiently
     * precise result, do not invent coordinates.
     * The business may still be created with
     * its address and null coordinates.
     */

    let resolvedLat =
      parsedLat;

    let resolvedLong =
      parsedLong;

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
            }
          );

        resolvedLat =
          geocoded.latitude;

        resolvedLong =
          geocoded.longitude;
      } catch (error) {
        console.warn(
          "Seller business address could not be geocoded. Saving without precise coordinates:",
          error
        );
      }
    }

    /*
     * -----------------------------------------
     * STRING LENGTH VALIDATION
     * -----------------------------------------
     */

    if (
      ownerName.length >
      200
    ) {
      return NextResponse.json(
        {
          error:
            "Owner name is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      description.length >
      2000
    ) {
      return NextResponse.json(
        {
          error:
            "Business description is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      phone.length >
      50
    ) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      imageUrl.length >
      2000
    ) {
      return NextResponse.json(
        {
          error:
            "Image URL is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * CATEGORY VALIDATION
     * -----------------------------------------
     */

    let categories: {
      id: string;
    }[] = [];

    if (
      categoryIds.length >
      0
    ) {
      categories =
        await prisma.category.findMany(
          {
            where: {
              id: {
                in:
                  categoryIds,
              },

              isActive:
                true,
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
              "One or more selected categories are invalid or inactive.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }
    }

    /*
     * -----------------------------------------
     * FINAL OWNERSHIP CHECK
     * -----------------------------------------
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
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * LOCATION + BUSINESS
     * -----------------------------------------
     *
     * A new seller business always receives
     * its own Location record.
     *
     * We NEVER search for or reuse a Location
     * by area.
     *
     * Location verification is separate from
     * Business verification.
     */

    const businessAvailability:
      AvailabilityValue =
      availability ??
      "ASK_SELLER";

    const business =
      await prisma.$transaction(
        async (tx) => {
          const location =
            await tx.location.create({
              data: {
                area,

                address:
                  address ||
                  null,

                lat:
                  resolvedLat,

                long:
                  resolvedLong,

                verification:
                  "UNVERIFIED",
              },
            });

          return tx.business.create({
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

              phone:
                phone ||
                null,

              imageUrl:
                imageUrl ||
                null,

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
                  status:
                    "ACTIVE",

                  deletedAt:
                    null,
                },

                orderBy: {
                  updatedAt:
                    "desc",
                },
              },

              socialLinks:
                true,
            },
          });
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
          jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller business creation error:",
      error
    );

    if (
      typeof error ===
        "object" &&
      error !== null &&
      "code" in error &&
      error.code ===
        "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "This seller account already has a business.",
        },
        {
          status: 409,
          headers:
            jsonHeaders(),
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
        headers:
          jsonHeaders(),
      }
    );
  }
}

/*
 * -----------------------------------------
 * PATCH
 * -----------------------------------------
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
          headers:
            jsonHeaders(),
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
     * FIND SELLER BUSINESS
     * -----------------------------------------
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
            ownerId: true,
            deletedAt: true,
            priceMin: true,
            priceMax: true,

            location: {
              select: {
                id: true,
                area: true,
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
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
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
     * BASIC BUSINESS FIELDS
     * -----------------------------------------
     */

    const name =
      has("name")
        ? cleanString(
            payload.name
          )
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

    const area =
      has("area")
        ? cleanString(
            payload.area
          )
        : undefined;

    const address =
      has("address")
        ? cleanString(
            payload.address
          )
        : undefined;

    const phone =
      has("phone")
        ? cleanString(
            payload.phone
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

    /*
     * -----------------------------------------
     * BASIC VALIDATION
     * -----------------------------------------
     */

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
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      name !== undefined &&
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
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      ownerName !== undefined &&
      ownerName.length >
        200
    ) {
      return NextResponse.json(
        {
          error:
            "Owner name is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      description !== undefined &&
      description.length >
        2000
    ) {
      return NextResponse.json(
        {
          error:
            "Business description is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      area !== undefined &&
      !area
    ) {
      return NextResponse.json(
        {
          error:
            "Business area cannot be empty.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      area !== undefined &&
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
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      address !== undefined &&
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
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      phone !== undefined &&
      phone.length >
        50
    ) {
      return NextResponse.json(
        {
          error:
            "Phone number is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      imageUrl !== undefined &&
      imageUrl.length >
        2000
    ) {
      return NextResponse.json(
        {
          error:
            "Image URL is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * PRICE VALIDATION
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
      priceMin ===
        "INVALID" ||
      priceMax ===
        "INVALID"
    ) {
      return NextResponse.json(
        {
          error:
            "Price values must be whole numbers.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
        }
      );
    }

    const resultingPriceMin:
      | number
      | null =
      priceMinProvided
        ? priceMin ?? null
        : existingBusiness.priceMin;

    const resultingPriceMax:
      | number
      | null =
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
          headers:
            jsonHeaders(),
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

    let categoryIds: string[] =
      [];

    if (
      categoryIdsProvided
    ) {
      if (
        !Array.isArray(
          payload.categoryIds
        )
      ) {
        return NextResponse.json(
          {
            error:
              "categoryIds must be an array.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }

      const rawCategoryIds =
        payload.categoryIds;

      if (
        rawCategoryIds.some(
          (value) =>
            typeof value !==
            "string"
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Category IDs must be strings.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }

      categoryIds = [
        ...new Set(
          rawCategoryIds.map(
            (value) =>
              (
                value as string
              ).trim()
          )
        ),
      ];

      if (
        categoryIds.some(
          (categoryId) =>
            !categoryId
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid category IDs.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }

      if (
        categoryIds.length >
        0
      ) {
        const validCategories =
          await prisma.category.findMany(
            {
              where: {
                id: {
                  in:
                    categoryIds,
                },

                isActive:
                  true,
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
              headers:
                jsonHeaders(),
            }
          );
        }
      }
    }

    /*
     * -----------------------------------------
     * LOCATION
     * -----------------------------------------
     *
     * A seller may update:
     *
     * - area
     * - address
     * - latitude
     * - longitude / lng
     *
     * A changed location gets a NEW Location
     * record.
     *
     * The new Location is UNVERIFIED.
     *
     * Coordinate resolution:
     *
     * 1. Freshly supplied GPS coordinates win.
     *
     * 2. If area/address changes without new GPS,
     *    resolve the new address with Nominatim.
     *
     * 3. If the new address cannot be resolved,
     *    do not keep stale coordinates.
     *
     * 4. If location data has not changed,
     *    preserve the existing Location.
     *
     * We NEVER reuse a Location by area.
     */

    const areaProvided =
      has("area");

    const addressProvided =
      has("address");

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
          headers:
            jsonHeaders(),
        }
      );
    }

    const locationWasProvided =
      areaProvided ||
      addressProvided ||
      latProvided ||
      longProvided ||
      lngProvided;

    let newLocationData:
      | {
          area: string;
          address: string | null;
          lat: number | null;
          long: number | null;
        }
      | null = null;

    if (locationWasProvided) {
      const resultingArea =
        areaProvided
          ? area as string
          : existingBusiness
              .location
              ?.area ?? "";

      const resultingAddress =
        addressProvided
          ? address as string
          : existingBusiness
              .location
              ?.address ?? null;

      const parsedLat =
        latProvided
          ? parseOptionalFloat(
              payload.lat
            )
          : existingBusiness
              .location
              ?.lat ?? null;

      const parsedLong =
        longProvided ||
        lngProvided
          ? parseOptionalFloat(
              longProvided
                ? payload.long
                : payload.lng
            )
          : existingBusiness
              .location
              ?.long ?? null;

      if (
        parsedLat ===
          "INVALID" ||
        parsedLong ===
          "INVALID"
      ) {
        return NextResponse.json(
          {
            error:
              "Latitude and longitude must be valid numbers.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }

      if (!resultingArea) {
        return NextResponse.json(
          {
            error:
              "Business area is required.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
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
            headers:
              jsonHeaders(),
          }
        );
      }

      const currentArea =
        existingBusiness
          .location
          ?.area ?? "";

      const currentAddress =
        existingBusiness
          .location
          ?.address ?? null;

      const currentLat =
        existingBusiness
          .location
          ?.lat ?? null;

      const currentLong =
        existingBusiness
          .location
          ?.long ?? null;

      const areaChanged =
        currentArea !==
        resultingArea;

      const addressChanged =
        currentAddress !==
        resultingAddress;

      const coordinatesChanged =
        currentLat !==
          parsedLat ||
        currentLong !==
          parsedLong;

      let resolvedLat =
        parsedLat;

      let resolvedLong =
        parsedLong;

      /*
       * If the seller changes the physical
       * address/area but does not provide newly
       * captured GPS coordinates, the old
       * coordinates must not continue to
       * represent the new address.
       *
       * Resolve the new address instead.
       */
      if (
        areaChanged ||
        addressChanged
      ) {
        const hasFreshCoordinates =
          parsedLat !== null &&
          parsedLong !== null &&
          coordinatesChanged;

        if (
          !hasFreshCoordinates
        ) {
          if (
            resultingAddress
          ) {
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
            } catch (error) {
              /*
               * Never keep stale coordinates
               * after a physical address change
               * when the new address cannot be
               * resolved.
               */
              console.warn(
                "Seller business address could not be geocoded. Saving the changed address without precise coordinates:",
                error
              );

              resolvedLat =
                null;

              resolvedLong =
                null;
            }
          } else {
            /*
             * There is no address from which
             * coordinates can be resolved.
             */
            resolvedLat =
              null;

            resolvedLong =
              null;
          }
        }
      }

      const locationChanged =
        !existingBusiness.location ||
        currentArea !==
          resultingArea ||
        currentAddress !==
          resultingAddress ||
        currentLat !==
          resolvedLat ||
        currentLong !==
          resolvedLong;

      if (locationChanged) {
        newLocationData = {
          area:
            resultingArea,

          address:
            resultingAddress,

          lat:
            resolvedLat,

          long:
            resolvedLong,
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
      availability?:
        AvailabilityValue;
      priceMin?: number | null;
      priceMax?: number | null;
    } = {};

    if (
      name !== undefined
    ) {
      updateData.name =
        name;
    }

    if (
      ownerName !== undefined
    ) {
      updateData.ownerName =
        ownerName || null;
    }

    if (
      description !== undefined
    ) {
      updateData.description =
        description || null;
    }

    if (
      phone !== undefined
    ) {
      updateData.phone =
        phone || null;
    }

    if (
      imageUrl !== undefined
    ) {
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

    if (
      priceMinProvided
    ) {
      updateData.priceMin =
        priceMin ?? null;
    }

    if (
      priceMaxProvided
    ) {
      updateData.priceMax =
        priceMax ?? null;
    }

    /*
     * -----------------------------------------
     * TRANSACTION
     * -----------------------------------------
     */

    const business =
      await prisma.$transaction(
        async (tx) => {
          if (newLocationData) {
            const location =
              await tx.location.create(
                {
                  data: {
                    area:
                      newLocationData.area,

                    address:
                      newLocationData
                        .address,

                    lat:
                      newLocationData.lat,

                    long:
                      newLocationData.long,

                    /*
                     * Any newly submitted or
                     * newly resolved location
                     * must be verified again.
                     */
                    verification:
                      "UNVERIFIED",
                  },
                }
              );

            updateData.locationId =
              location.id;
          }

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

          return tx.business.update(
            {
              where: {
                id:
                  existingBusiness.id,
              },

              data:
                updateData,

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
          "Business updated successfully.",

        business,
      },
      {
        headers:
          jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller business update error:",
      error
    );

    if (
      typeof error ===
        "object" &&
      error !== null &&
      "code" in error &&
      error.code ===
        "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "Business could not be found.",
        },
        {
          status: 404,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      typeof error ===
        "object" &&
      error !== null &&
      "code" in error &&
      error.code ===
        "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "This business update conflicts with an existing record.",
        },
        {
          status: 409,
          headers:
            jsonHeaders(),
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
        headers:
          jsonHeaders(),
      }
    );
  }
}