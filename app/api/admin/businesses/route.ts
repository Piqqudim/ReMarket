import { NextRequest, NextResponse } from "next/server";
import {
  Availability,
  BusinessStatus,
  SocialPlatform,
  VerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const valueString = cleanString(value);
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

function normalizeWhatsApp(
  value: string
): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const digits = trimmed.replace(
    /\D/g,
    ""
  );

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
): ParsedSocialLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: ParsedSocialLink[] = [];
  const seen =
    new Set<SocialPlatform>();

  for (const item of value) {
    if (
      !item ||
      typeof item !== "object"
    ) {
      continue;
    }

    const record =
      item as Record<string, unknown>;

    if (
      !isSocialPlatform(
        record.platform
      )
    ) {
      continue;
    }

    let handle =
      cleanString(record.handle);

    if (
      record.platform ===
      "WHATSAPP"
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
): value is "ALL" | "ACTIVE" | "DELETED" {
  return (
    value === "ALL" ||
    value === "ACTIVE" ||
    value === "DELETED"
  );
}

export async function GET(
  request: NextRequest
) {
  const auth = await requireAdmin();

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

    /*
     * Deleted filter:
     *
     * ALL     = active + soft-deleted
     * ACTIVE  = deletedAt IS NULL
     * DELETED = deletedAt IS NOT NULL
     *
     * Default is ALL because Admin must be able
     * to see and restore soft-deleted businesses.
     */
    const requestedDeletionFilter =
      searchParams.get("deleted");

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
            isBusinessStatus(status)
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
              deletedAt: "asc",
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
  const auth = await requireAdmin();

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
        }
      );
    }

    const payload =
      body as Record<string, unknown>;

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

    const ownerName =
      nullableString(
        payload.ownerName
      );

    const description =
      nullableString(
        payload.description
      );

    const area =
      cleanString(
        payload.area
      );

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

    const lat =
      parseOptionalFloat(
        payload.lat
      );

    if (
      lat === undefined ||
      (lat !== null &&
        (lat < -90 ||
          lat > 90))
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

    const long =
      parseOptionalFloat(
        payload.lng ??
          payload.long
      );

    if (
      long === undefined ||
      (long !== null &&
        (long < -180 ||
          long > 180))
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
      priceMin > priceMax
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

    const phone =
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
      categoryIds.length > 0
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

    const business =
      await prisma.$transaction(
        async (tx) => {
          const location =
            await tx.location.upsert(
              {
                where: {
                  area,
                },
                create: {
                  area,
                  lat,
                  long,
                },
                update: {
                  lat,
                  long,
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
            categoryIds.length > 0
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
            socialLinks.length > 0
          ) {
            await tx.businessSocialLink.createMany(
              {
                data:
                  socialLinks.map(
                    (link) => ({
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

          return created;
        }
      );

    return NextResponse.json(
      {
        success: true,
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