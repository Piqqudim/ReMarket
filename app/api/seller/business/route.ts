import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

function cleanString(value: unknown): string {
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

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

/*
 * ----------------------------------------------------
 * GET
 * ----------------------------------------------------
 *
 * Returns the authenticated seller's business.
 */
export async function GET() {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const business =
      await prisma.business.findUnique({
        where: {
          ownerId: auth.user.id,
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

    return NextResponse.json({
      business,
    });
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
 * ----------------------------------------------------
 * POST
 * ----------------------------------------------------
 *
 * Creates the authenticated seller's business.
 *
 * Business.ownerId is automatically assigned to
 * the authenticated seller.
 */
export async function POST(
  request: Request
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  /*
   * Business.ownerId is unique, so one seller
   * can own only one business.
   */
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
      body as Record<string, unknown>;

    const name = cleanString(
      payload.name
    );

    const ownerName = cleanString(
      payload.ownerName
    );

    const description = cleanString(
      payload.description
    );

    const area = cleanString(
      payload.area
    );

    const phone = cleanString(
      payload.phone
    );

    const imageUrl = cleanString(
      payload.imageUrl
    );

    const categoryIds = Array.isArray(
      payload.categoryIds
    )
      ? [
          ...new Set(
            payload.categoryIds.filter(
              (
                value
              ): value is string =>
                typeof value ===
                  "string" &&
                value.trim().length >
                  0
            )
          ),
        ]
      : [];

    const availabilityValue =
      cleanString(
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

    if (
      availabilityValue &&
      !ALLOWED_AVAILABILITY.includes(
        availabilityValue as (typeof ALLOWED_AVAILABILITY)[number]
      )
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
     * Validate categories before creating
     * BusinessCategory records.
     */
    let categories: {
      id: string;
    }[] = [];

    if (categoryIds.length > 0) {
      categories =
        await prisma.category.findMany({
          where: {
            id: {
              in: categoryIds,
            },
            isActive: true,
          },
          select: {
            id: true,
          },
        });

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
            headers: jsonHeaders(),
          }
        );
      }
    }

    /*
     * Re-check ownership immediately before
     * creating the business.
     */
    const existingBusiness =
      await prisma.business.findUnique({
        where: {
          ownerId: auth.user.id,
        },
        select: {
          id: true,
        },
      });

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
     * Location.area is not unique in the schema,
     * so use findFirst() instead of upsert().
     */
    let location =
      await prisma.location.findFirst({
        where: {
          area,
        },
        select: {
          id: true,
          area: true,
        },
      });

    if (!location) {
      location =
        await prisma.location.create({
          data: {
            area,
          },
          select: {
            id: true,
            area: true,
          },
        });
    }

    const business =
      await prisma.business.create({
        data: {
          name,

          ownerName:
            ownerName ||
            auth.user.name ||
            null,

          ownerId: auth.user.id,

          description:
            description || null,

          locationId:
            location.id,

          priceMin,

          priceMax,

          availability:
            (availabilityValue ||
              "ASK_SELLER") as
              | "AVAILABLE"
              | "ASK_SELLER"
              | "UNAVAILABLE",

          phone:
            phone || null,

          imageUrl:
            imageUrl || null,

          categories:
            categories.length > 0
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
              category: true,
            },
          },
        },
      });

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
 * ----------------------------------------------------
 * PATCH
 * ----------------------------------------------------
 *
 * Updates ONLY the authenticated seller's own business.
 *
 * Seller cannot change:
 * - ownerId
 * - verification
 * - status
 * - deletedAt
 * - onboardedAt
 */
export async function PATCH(
  request: Request
) {
  const auth = await requireSeller();

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
      body as Record<string, unknown>;

    const existingBusiness =
      await prisma.business.findUnique({
        where: {
          ownerId: auth.user.id,
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

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

    if (existingBusiness.deletedAt) {
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

    /*
     * Track which fields were actually supplied.
     */
    const has = (key: string) =>
      Object.prototype.hasOwnProperty.call(
        payload,
        key
      );

    const name = has("name")
      ? cleanString(
          payload.name
        )
      : undefined;

    const ownerName = has(
      "ownerName"
    )
      ? cleanString(
          payload.ownerName
        )
      : undefined;

    const description = has(
      "description"
    )
      ? cleanString(
          payload.description
        )
      : undefined;

    const area = has("area")
      ? cleanString(
          payload.area
        )
      : undefined;

    const phone = has("phone")
      ? cleanString(
          payload.phone
        )
      : undefined;

    const imageUrl = has(
      "imageUrl"
    )
      ? cleanString(
          payload.imageUrl
        )
      : undefined;

    const availabilityValue =
      has("availability")
        ? cleanString(
            payload.availability
          )
        : undefined;

    /*
     * Validate business name.
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
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Validate area.
     */
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
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Validate availability.
     */
    if (
      availabilityValue !==
        undefined &&
      !ALLOWED_AVAILABILITY.includes(
        availabilityValue as (typeof ALLOWED_AVAILABILITY)[number]
      )
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
     * Prices.
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

    /*
     * Get the current prices so a partial PATCH
     * can validate the final combination.
     */
    const currentPrices =
      await prisma.business.findUnique({
        where: {
          id: existingBusiness.id,
        },
        select: {
          priceMin: true,
          priceMax: true,
        },
      });

    /*
     * IMPORTANT:
     * Explicitly normalize undefined to null.
     * This removes the TypeScript possibly-undefined
     * error while preserving PATCH semantics.
     */
    const resultingPriceMin: number | null =
      priceMinProvided
        ? priceMin ?? null
        : currentPrices?.priceMin ??
          null;

    const resultingPriceMax: number | null =
      priceMaxProvided
        ? priceMax ?? null
        : currentPrices?.priceMax ??
          null;

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
     * Validate category IDs when supplied.
     */
    const categoryIdsProvided =
      has("categoryIds");

    let categoryIds: string[] =
      [];

    if (categoryIdsProvided) {
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
            headers: jsonHeaders(),
          }
        );
      }

      categoryIds = [
        ...new Set(
          payload.categoryIds.filter(
            (
              value
            ): value is string =>
              typeof value ===
                "string" &&
              value.trim().length >
                0
          )
        ),
      ];

      if (
        categoryIds.length !==
        payload.categoryIds.length
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid category IDs.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

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
     * If the area changes, find or create
     * the correct Location.
     *
     * Location.area is not unique in the schema,
     * so findFirst() is intentional.
     */
    let locationId:
      | string
      | undefined;

    if (area !== undefined) {
      const location =
        await prisma.location.findFirst(
          {
            where: {
              area,
            },
            select: {
              id: true,
            },
          }
        );

      if (location) {
        locationId =
          location.id;
      } else {
        const newLocation =
          await prisma.location.create({
            data: {
              area,
            },
            select: {
              id: true,
            },
          });

        locationId =
          newLocation.id;
      }
    }

    /*
     * Build the update object.
     *
     * Protected fields such as ownerId,
     * verification, status and deletedAt
     * are intentionally excluded.
     */
    const updateData: {
      name?: string;
      ownerName?: string | null;
      description?: string | null;
      locationId?: string;
      phone?: string | null;
      imageUrl?: string | null;
      availability?:
        | "AVAILABLE"
        | "ASK_SELLER"
        | "UNAVAILABLE";
      priceMin?: number | null;
      priceMax?: number | null;
    } = {};

    if (name !== undefined) {
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

    if (locationId !== undefined) {
      updateData.locationId =
        locationId;
    }

    if (phone !== undefined) {
      updateData.phone =
        phone || null;
    }

    if (imageUrl !== undefined) {
      updateData.imageUrl =
        imageUrl || null;
    }

    if (
      availabilityValue !==
      undefined
    ) {
      updateData.availability =
        availabilityValue as
          | "AVAILABLE"
          | "ASK_SELLER"
          | "UNAVAILABLE";
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
     * Update the business and, when requested,
     * replace its category relationships.
     */
    const business =
      await prisma.$transaction(
        async (tx) => {
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
                  data: categoryIds.map(
                    (categoryId) => ({
                      businessId:
                        existingBusiness.id,
                      categoryId,
                    })
                  ),
                  skipDuplicates: true,
                }
              );
            }
          }

          return tx.business.update({
            where: {
              id: existingBusiness.id,
            },
            data: updateData,
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
      );

    return NextResponse.json({
      message:
        "Business updated successfully.",

      business,
    });
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