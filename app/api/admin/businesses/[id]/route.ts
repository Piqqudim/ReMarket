import { NextRequest, NextResponse } from "next/server";
import {
  Availability,
  BusinessStatus,
  SocialPlatform,
  VerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const cleaned = cleanString(value);
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

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
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

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
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

function normalizeWhatsApp(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("234")) {
    return `+${digits}`;
  }

  if (digits.startsWith("0")) {
    return `+234${digits.slice(1)}`;
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
  if (!Array.isArray(value)) {
    return null;
  }

  const result: ParsedSocialLink[] = [];
  const seen = new Set<SocialPlatform>();

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;

    if (!isSocialPlatform(record.platform)) {
      continue;
    }

    let handle = cleanString(record.handle);

    if (record.platform === "WHATSAPP") {
      handle = normalizeWhatsApp(handle);
    }

    if (!handle || seen.has(record.platform)) {
      continue;
    }

    seen.add(record.platform);

    result.push({
      platform: record.platform,
      handle,
    });
  }

  return result;
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
          (item): item is string =>
            typeof item === "string"
        )
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

async function loadBusiness(id: string) {
  const business = await prisma.business.findUnique({
    where: {
      id,
    },
    include: {
      location: true,

      categories: {
        include: {
          category: true,
        },
      },

      products: {
        include: {
          category: true,
          images: {
            orderBy: {
              sortOrder: "asc",
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      },

      socialLinks: true,
    },
  });

  if (!business) {
    return null;
  }

  return {
    ...business,
    categories: business.categories.map(
      (item) => item.category
    ),
  };
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error: "Business ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const business = await loadBusiness(id);

    if (!business) {
      return NextResponse.json(
        {
          error: "Business not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      business,
    });
  } catch (error) {
    console.error(
      "Admin business GET error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to load business.",
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
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error: "Business ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const existing = await prisma.business.findUnique({
      where: {
        id,
      },
      include: {
        location: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        {
          error: "Business not found.",
        },
        {
          status: 404,
        }
      );
    }

    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
        },
        {
          status: 400,
        }
      );
    }

    const payload =
      body as Record<string, unknown>;

    /*
     * RESTORE
     *
     * PATCH /api/admin/businesses/[id]
     * body: { restore: true }
     */
    if ("restore" in payload) {
      if (payload.restore !== true) {
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

      if (!existing.deletedAt) {
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
        await prisma.business.update({
          where: {
            id,
          },
          data: {
            deletedAt: null,
          },
        });

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

      return NextResponse.json({
        success: true,
        restored: true,
        business,
      });
    }

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

    if ("name" in payload) {
      const name = cleanString(payload.name);

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

      data.name = name;
    }

    if ("ownerName" in payload) {
      data.ownerName =
        nullableString(
          payload.ownerName
        );
    }

    if ("description" in payload) {
      data.description =
        nullableString(
          payload.description
        );
    }

    if ("phone" in payload) {
      data.phone =
        nullableString(
          payload.phone
        );
    }

    if ("imageUrl" in payload) {
      data.imageUrl =
        nullableString(
          payload.imageUrl
        );
    }

    if ("availability" in payload) {
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

    if ("status" in payload) {
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

    if ("verification" in payload) {
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

    const priceMin =
      parseOptionalInt(
        payload.priceMin
      );

    if (priceMin === undefined) {
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

    if (priceMax === undefined) {
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

    if ("priceMin" in payload) {
      data.priceMin = priceMin;
    }

    if ("priceMax" in payload) {
      data.priceMax = priceMax;
    }

    const finalPriceMin =
      "priceMin" in payload
        ? priceMin
        : existing.priceMin;

    const finalPriceMax =
      "priceMax" in payload
        ? priceMax
        : existing.priceMax;

    if (
      finalPriceMin !== null &&
      finalPriceMax !== null &&
      finalPriceMin > finalPriceMax
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

    const locationWasProvided =
      "area" in payload ||
      "lat" in payload ||
      "lng" in payload ||
      "long" in payload;

    const categoryIdsProvided =
      "categoryIds" in payload;

    const socialLinksProvided =
      "socialLinks" in payload;

    let categoryIds: string[] | null = null;

    if (categoryIdsProvided) {
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

      if (categoryIds.length > 0) {
        const categories =
          await prisma.category.findMany({
            where: {
              id: {
                in: categoryIds,
              },
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
                "One or more selected categories do not exist.",
            },
            {
              status: 400,
            }
          );
        }
      }
    }

    let socialLinks:
      | ParsedSocialLink[]
      | null = null;

    if (socialLinksProvided) {
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
    }

    let locationId =
      existing.locationId;

    if (locationWasProvided) {
      const currentArea =
        existing.location?.area ?? "";

      const requestedArea =
        "area" in payload
          ? cleanString(payload.area)
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

      const lat =
        parseOptionalFloat(
          "lat" in payload
            ? payload.lat
            : existing.location?.lat
        );

      if (lat === undefined) {
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

      const long =
        parseOptionalFloat(
          "long" in payload
            ? payload.long
            : "lng" in payload
            ? payload.lng
            : existing.location?.long
        );

      if (long === undefined) {
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
        lat !== null &&
        (lat < -90 || lat > 90)
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
        long !== null &&
        (long < -180 || long > 180)
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

      const location =
        await prisma.location.upsert({
          where: {
            area: requestedArea,
          },
          create: {
            area: requestedArea,
            lat,
            long,
          },
          update: {
            lat,
            long,
          },
        });

      locationId = location.id;
      data.locationId = location.id;
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.business.update({
          where: {
            id,
          },
          data,
        });

        if (categoryIdsProvided) {
          await tx.businessCategory.deleteMany({
            where: {
              businessId: id,
            },
          });

          if (
            categoryIds &&
            categoryIds.length > 0
          ) {
            await tx.businessCategory.createMany({
              data: categoryIds.map(
                (categoryId) => ({
                  businessId: id,
                  categoryId,
                })
              ),
              skipDuplicates: true,
            });
          }
        }

        if (socialLinksProvided) {
          await tx.businessSocialLink.deleteMany({
            where: {
              businessId: id,
            },
          });

          if (
            socialLinks &&
            socialLinks.length > 0
          ) {
            await tx.businessSocialLink.createMany({
              data: socialLinks.map(
                (link) => ({
                  businessId: id,
                  platform:
                    link.platform,
                  handle:
                    link.handle,
                })
              ),
              skipDuplicates: true,
            });
          }
        }
      }
    );

    const updatedBusiness =
      await loadBusiness(id);

    if (!updatedBusiness) {
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

    return NextResponse.json({
      success: true,
      business: updatedBusiness,
    });
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
 * SOFT DELETE
 *
 * DELETE /api/admin/businesses/[id]
 *
 * This does NOT remove the database record.
 * It only sets deletedAt.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error: "Business ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const existing =
      await prisma.business.findUnique({
        where: {
          id,
        },
        select: {
          id: true,
          name: true,
          deletedAt: true,
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error: "Business not found.",
        },
        {
          status: 404,
        }
      );
    }

    if (existing.deletedAt) {
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
      await prisma.business.update({
        where: {
          id,
        },
        data: {
          deletedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          deletedAt: true,
        },
      });

    return NextResponse.json({
      success: true,
      deleted: true,
      business,
    });
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