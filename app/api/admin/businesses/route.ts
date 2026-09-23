import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

import {
  Availability,
  BusinessStatus,
  SocialPlatform,
  VerificationStatus,
} from "@prisma/client";

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
  const cleaned =
    cleanString(value);

  return cleaned || null;
}

function parseOptionalInt(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return null;
  }

  return Math.floor(parsed);
}

function parseOptionalFloat(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return null;
  }

  return parsed;
}

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value === Availability.AVAILABLE ||
    value ===
      Availability.ASK_SELLER ||
    value ===
      Availability.UNAVAILABLE
  );
}

function isBusinessStatus(
  value: unknown
): value is BusinessStatus {
  return (
    value === BusinessStatus.ACTIVE ||
    value === BusinessStatus.INACTIVE ||
    value === BusinessStatus.PENDING
  );
}

function isVerificationStatus(
  value: unknown
): value is VerificationStatus {
  return (
    value ===
      VerificationStatus.VERIFIED ||
    value ===
      VerificationStatus.UNVERIFIED
  );
}

function isSocialPlatform(
  value: unknown
): value is SocialPlatform {
  return (
    value === SocialPlatform.WHATSAPP ||
    value === SocialPlatform.INSTAGRAM ||
    value === SocialPlatform.TIKTOK ||
    value === SocialPlatform.FACEBOOK ||
    value === SocialPlatform.PHONE ||
    value === SocialPlatform.DIRECTIONS
  );
}

function parseIdArray(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
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
    ),
  ];
}

type SocialInput = {
  platform: SocialPlatform;
  handle: string;
};

function parseSocialLinks(
  value: unknown
): SocialInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const links: SocialInput[] = [];

  for (const item of value) {
    if (
      typeof item !==
      "object" ||
      item === null
    ) {
      continue;
    }

    const record =
      item as Record<
        string,
        unknown
      >;

    const platform =
      record.platform;

    const handle =
      cleanString(
        record.handle
      );

    if (
      !isSocialPlatform(
        platform
      ) ||
      !handle
    ) {
      continue;
    }

    links.push({
      platform,
      handle,
    });
  }

  return links;
}

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(
  request: NextRequest
) {
  try {
    await requireAdmin();

    const {
      searchParams,
    } = new URL(
      request.url
    );

    const q = cleanString(
      searchParams.get("q")
    );

    const statusValue =
      cleanString(
        searchParams.get(
          "status"
        )
      );

    const verificationValue =
      cleanString(
        searchParams.get(
          "verification"
        )
      );

    const where = {
      ...(statusValue &&
      Object.values(
        BusinessStatus
      ).includes(
        statusValue as BusinessStatus
      )
        ? {
            status:
              statusValue as BusinessStatus,
          }
        : {}),

      ...(verificationValue &&
      Object.values(
        VerificationStatus
      ).includes(
        verificationValue as VerificationStatus
      )
        ? {
            verification:
              verificationValue as VerificationStatus,
          }
        : {}),

      ...(q
        ? {
            OR: [
              {
                name: {
                  contains: q,
                  mode: "insensitive" as const,
                },
              },
              {
                ownerName: {
                  contains: q,
                  mode: "insensitive" as const,
                },
              },
              {
                description: {
                  contains: q,
                  mode: "insensitive" as const,
                },
              },
              {
                phone: {
                  contains: q,
                  mode: "insensitive" as const,
                },
              },
              {
                location: {
                  area: {
                    contains: q,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const businesses =
      await prisma.business.findMany(
        {
          where,

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
                  },
                },
              },
            },
          },

          orderBy: {
            onboardedAt: "desc",
          },
        }
      );

    return NextResponse.json({
      businesses:
        businesses.map(
          (business) => ({
            id: business.id,

            name: business.name,

            ownerName:
              business.ownerName,

            description:
              business.description,

            imageUrl:
              business.imageUrl,

            phone:
              business.phone,

            area:
              business.location
                ?.area ??
              "Location not added",

            availability:
              business.availability,

            status:
              business.status,

            verification:
              business.verification,

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

/* -------------------------------------------------------------------------- */
/* POST                                                                       */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: NextRequest
) {
  try {
    await requireAdmin();

    const body =
      await request.json();

    const name =
      cleanString(body.name);

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

    const area =
      cleanString(body.area);

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

    const ownerName =
      nullableString(
        body.ownerName
      );

    const description =
      nullableString(
        body.description
      );

    const phone =
      nullableString(
        body.phone
      );

    const imageUrl =
      nullableString(
        body.imageUrl
      );

    const lat =
      parseOptionalFloat(
        body.lat
      );

    const long =
      parseOptionalFloat(
        body.lng ??
          body.long
      );

    const priceMin =
      parseOptionalInt(
        body.priceMin
      );

    const priceMax =
      parseOptionalInt(
        body.priceMax
      );

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
            "Minimum price cannot exceed maximum price.",
        },
        {
          status: 400,
        }
      );
    }

    const availability =
      isAvailability(
        body.availability
      )
        ? body.availability
        : Availability.ASK_SELLER;

    const status =
      isBusinessStatus(
        body.status
      )
        ? body.status
        : BusinessStatus.ACTIVE;

    const verification =
      isVerificationStatus(
        body.verification
      )
        ? body.verification
        : VerificationStatus.UNVERIFIED;

    const categoryIds =
      parseIdArray(
        body.categoryIds ??
          body.categories
      );

    const socialLinks =
      parseSocialLinks(
        body.socialLinks
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

                update: {
                  ...(lat !== null
                    ? { lat }
                    : {}),
                  ...(long !== null
                    ? { long }
                    : {}),
                },

                create: {
                  area,
                  lat,
                  long,
                },
              }
            );

          const createdBusiness =
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
                },
              }
            );

          if (
            categoryIds.length >
            0
          ) {
            const existingCategories =
              await tx.category.findMany(
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
              existingCategories.length >
              0
            ) {
              await tx.businessCategory.createMany(
                {
                  data:
                    existingCategories.map(
                      (
                        category
                      ) => ({
                        businessId:
                          createdBusiness.id,
                        categoryId:
                          category.id,
                      })
                    ),
                  skipDuplicates:
                    true,
                }
              );
            }
          }

          if (
            socialLinks.length >
            0
          ) {
            await tx.businessSocialLink.createMany(
              {
                data:
                  socialLinks.map(
                    (link) => ({
                      businessId:
                        createdBusiness.id,
                      platform:
                        link.platform,
                      handle:
                        link.handle,
                    })
                  ),
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
                    category: true,
                  },
                },

                socialLinks: true,
              },
            }
          );
        }
      );

    return NextResponse.json(
      {
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