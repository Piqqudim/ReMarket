import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const [
      total,
      whatsapp,
      phone,
      instagram,
      tiktok,
      facebook,
      directions,
    ] = await Promise.all([
      prisma.contactEvent.count(),

      prisma.contactEvent.count({
        where: {
          platform: "WHATSAPP",
        },
      }),

      prisma.contactEvent.count({
        where: {
          platform: "PHONE",
        },
      }),

      prisma.contactEvent.count({
        where: {
          platform: "INSTAGRAM",
        },
      }),

      prisma.contactEvent.count({
        where: {
          platform: "TIKTOK",
        },
      }),

      prisma.contactEvent.count({
        where: {
          platform: "FACEBOOK",
        },
      }),

      prisma.contactEvent.count({
        where: {
          platform: "DIRECTIONS",
        },
      }),
    ]);

    const topBusinesses =
      await prisma.contactEvent.groupBy({
        by: ["businessId"],
        _count: {
          businessId: true,
        },
        orderBy: {
          _count: {
            businessId: "desc",
          },
        },
        take: 10,
      });

    const businessIds = topBusinesses.map(
      (item) => item.businessId,
    );

    const businesses =
      await prisma.business.findMany({
        where: {
          id: {
            in: businessIds,
          },
        },
        select: {
          id: true,
          name: true,
          location: {
            select: {
              area: true,
            },
          },
        },
      });

    const businessMap = new Map(
      businesses.map((business) => [
        business.id,
        business,
      ]),
    );

    return NextResponse.json({
      total,
      byPlatform: {
        WHATSAPP: whatsapp,
        PHONE: phone,
        INSTAGRAM: instagram,
        TIKTOK: tiktok,
        FACEBOOK: facebook,
        DIRECTIONS: directions,
      },
      topBusinesses: topBusinesses.map(
        (item) => {
          const business =
            businessMap.get(item.businessId);

          return {
            businessId: item.businessId,
            businessName:
              business?.name ?? "Unknown business",
            area:
              business?.location?.area ?? null,
            contacts: item._count.businessId,
          };
        },
      ),
    });
  } catch (error) {
    console.error(
      "Admin contact events error:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to load contact analytics" },
      { status: 500 },
    );
  }
}