import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

const DEFAULT_CONTACT_ACTIVITY = {
  WHATSAPP: 0,
  PHONE: 0,
  INSTAGRAM: 0,
  TIKTOK: 0,
  FACEBOOK: 0,
  DIRECTIONS: 0,
};

export async function GET() {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const [
      businesses,
      products,
      requests,
      matches,
      contacts,
      contactActivityRows,
      recentRequests,
      recentBusinesses,
    ] = await Promise.all([
      prisma.business.count(),

      prisma.product.count(),

      prisma.buyerRequest.count(),

      prisma.match.count(),

      prisma.contactEvent.count(),

      prisma.contactEvent.groupBy({
        by: ["platform"],
        _count: {
          _all: true,
        },
      }),

      prisma.buyerRequest.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          matches: {
            select: {
              id: true,
            },
          },
        },
      }),

      prisma.business.findMany({
        orderBy: {
          onboardedAt: "desc",
        },
        take: 5,
        include: {
          location: {
            select: {
              area: true,
            },
          },
        },
      }),
    ]);

    const contactActivity = {
      ...DEFAULT_CONTACT_ACTIVITY,
    };

    for (const row of contactActivityRows) {
      if (
        row.platform in
        contactActivity
      ) {
        contactActivity[
          row.platform as keyof typeof contactActivity
        ] = row._count._all;
      }
    }

    return NextResponse.json({
      stats: {
        businesses,
        products,
        requests,
        matches,
        contacts,
      },

      contactActivity,

      recentRequests: recentRequests.map(
        (item) => ({
          id: item.id,
          requestCode: item.requestCode,
          query: item.query,
          status: item.status,
          category: item.category,
          createdAt: item.createdAt,
          matchCount: item.matches.length,
        }),
      ),

      recentBusinesses:
        recentBusinesses.map(
          (item) => ({
            id: item.id,
            name: item.name,
            status: item.status,
            verification:
              item.verification,
            availability:
              item.availability,
            area:
              item.location?.area ??
              null,
            onboardedAt:
              item.onboardedAt,
          }),
        ),
    });
  } catch (error) {
    console.error(
      "Admin overview error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load admin overview",
      },
      {
        status: 500,
      },
    );
  }
}