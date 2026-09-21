// app/api/admin/businesses/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const BUSINESS_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "PENDING",
] as const;

const VERIFICATION_STATUSES = [
  "VERIFIED",
  "UNVERIFIED",
] as const;

const AVAILABILITIES = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

const SOCIAL_PLATFORMS = [
  "WHATSAPP",
  "INSTAGRAM",
  "TIKTOK",
  "FACEBOOK",
  "PHONE",
  "DIRECTIONS",
] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);

    const q = searchParams.get("q")?.trim() ?? "";
    const status = searchParams.get("status") ?? "";
    const verification = searchParams.get("verification") ?? "";

    const businesses = await prisma.business.findMany({
      where: {
        ...(status && BUSINESS_STATUSES.includes(status as never)
          ? {
              status: status as
                | "ACTIVE"
                | "INACTIVE"
                | "PENDING",
            }
          : {}),

        ...(verification &&
        VERIFICATION_STATUSES.includes(verification as never)
          ? {
              verification:
                verification as
                  | "VERIFIED"
                  | "UNVERIFIED",
            }
          : {}),

        ...(q
          ? {
              OR: [
                {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  ownerName: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  location: {
                    area: {
                      contains: q,
                      mode: "insensitive",
                    },
                  },
                },
              ],
            }
          : {}),
      },

      orderBy: {
        onboardedAt: "desc",
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
            status: "ACTIVE",
          },
          select: {
            id: true,
          },
        },

        socialLinks: true,
      },
    });

    return NextResponse.json({
      businesses: businesses.map((business) => ({
        id: business.id,
        name: business.name,
        ownerName: business.ownerName,
        description: business.description,
        area:
          business.location?.area ??
          "Location not added",
        status: business.status,
        verification: business.verification,
        availability: business.availability,
        phone: business.phone,

        categories: business.categories.map(
          (item) => item.category.name
        ),

        productCount: business.products.length,

        socialLinks: business.socialLinks.map(
          (link) => ({
            id: link.id,
            platform: link.platform,
            handle: link.handle,
          })
        ),

        onboardedAt: business.onboardedAt,
      })),
    });
  } catch (error) {
    console.error("Admin businesses GET error:", error);

    return NextResponse.json(
      {
        error: "Unable to load businesses",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    if (!name) {
      return NextResponse.json(
        {
          error: "Business name is required",
        },
        {
          status: 400,
        }
      );
    }

    const ownerName =
      typeof body.ownerName === "string"
        ? body.ownerName.trim()
        : null;

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : null;

    const phone =
      typeof body.phone === "string"
        ? body.phone.trim()
        : null;

    const area =
      typeof body.area === "string"
        ? body.area.trim()
        : "";

    if (!area) {
      return NextResponse.json(
        {
          error: "Business area is required",
        },
        {
          status: 400,
        }
      );
    }

    const status =
      body.status ?? "ACTIVE";

    const verification =
      body.verification ?? "UNVERIFIED";

    const availability =
      body.availability ?? "ASK_SELLER";

    if (!BUSINESS_STATUSES.includes(status)) {
      return NextResponse.json(
        {
          error: "Invalid business status",
        },
        {
          status: 400,
        }
      );
    }

    if (!VERIFICATION_STATUSES.includes(verification)) {
      return NextResponse.json(
        {
          error: "Invalid verification status",
        },
        {
          status: 400,
        }
      );
    }

    if (!AVAILABILITIES.includes(availability)) {
      return NextResponse.json(
        {
          error: "Invalid availability",
        },
        {
          status: 400,
        }
      );
    }

    const categoryNames: string[] = Array.isArray(
      body.categories
    )
      ? body.categories
          .filter(
            (category: unknown): category is string =>
              typeof category === "string"
          )
          .map((category: string) => category.trim())
          .filter(Boolean)
      : [];

    const socialLinks: {
      platform: string;
      handle: string;
    }[] = Array.isArray(body.socialLinks)
      ? body.socialLinks.filter(
          (link: unknown) =>
            typeof link === "object" &&
            link !== null &&
            "platform" in link &&
            "handle" in link
        )
      : [];

    for (const link of socialLinks) {
      if (
        !SOCIAL_PLATFORMS.includes(
          link.platform as never
        )
      ) {
        return NextResponse.json(
          {
            error: `Invalid social platform: ${link.platform}`,
          },
          {
            status: 400,
          }
        );
      }

      if (!link.handle.trim()) {
        return NextResponse.json(
          {
            error: "Social link handle cannot be empty",
          },
          {
            status: 400,
          }
        );
      }
    }

    const business = await prisma.$transaction(
      async (tx) => {
        const location = await tx.location.create({
        data: {
          area,
          lat:
          typeof body.lat === "number" && Number.isFinite(body.lat)
               ?       body.lat
                  : null,
    lng:
      typeof body.lng === "number" && Number.isFinite(body.lng)
        ? body.lng
        : null,
        },
          });
        
        const categories = [];

        for (const categoryName of categoryNames) {
          const category =
            await tx.category.upsert({
              where: {
                name: categoryName,
              },
              update: {},
              create: {
                name: categoryName,
              },
            });

          categories.push(category);
        }

        const createdBusiness =
          await tx.business.create({
            data: {
              name,
              ownerName,
              description,
              phone,
              status,
              verification,
              availability,

              locationId: location.id,

              categories: {
                create: categories.map(
                  (category) => ({
                    categoryId: category.id,
                  })
                ),
              },

              socialLinks: {
                create: socialLinks.map(
                  (link) => ({
                    platform:
                      link.platform as
                        | "WHATSAPP"
                        | "INSTAGRAM"
                        | "TIKTOK"
                        | "FACEBOOK"
                        | "PHONE"
                        | "DIRECTIONS",
                    handle: link.handle.trim(),
                  })
                ),
              },
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
          });

        return createdBusiness;
      }
    );

    return NextResponse.json(
      {
        business: {
          id: business.id,
          name: business.name,
          ownerName: business.ownerName,
          description: business.description,
          area:
            business.location?.area ??
            "Location not added",
          status: business.status,
          verification: business.verification,
          availability: business.availability,
          phone: business.phone,

          categories: business.categories.map(
            (item) => item.category.name
          ),

          socialLinks: business.socialLinks.map(
            (link) => ({
              id: link.id,
              platform: link.platform,
              handle: link.handle,
            })
          ),

          onboardedAt: business.onboardedAt,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Admin businesses POST error:", error);

    return NextResponse.json(
      {
        error: "Unable to create business",
      },
      {
        status: 500,
      }
    );
  }
}