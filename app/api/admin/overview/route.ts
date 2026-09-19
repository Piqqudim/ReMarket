// app/api/admin/overview/route.ts

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
      businesses,
      products,
      requests,
      matches,
      recentRequests,
      recentBusinesses,
    ] = await Promise.all([
      prisma.business.count(),

      prisma.product.count(),

      prisma.buyerRequest.count(),

      prisma.match.count(),

      prisma.buyerRequest.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          requestCode: true,
          query: true,
          status: true,
          createdAt: true,
        },
      }),

      prisma.business.findMany({
        orderBy: {
          onboardedAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          name: true,
          verification: true,
          status: true,
          onboardedAt: true,
          location: {
            select: {
              area: true,
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      stats: {
        businesses,
        products,
        requests,
        matches,
      },

      recentRequests,

      recentBusinesses: recentBusinesses.map((business) => ({
        id: business.id,
        name: business.name,
        verification: business.verification,
        status: business.status,
        area: business.location?.area ?? "Location not added",
        onboardedAt: business.onboardedAt,
      })),
    });
  } catch (error) {
    console.error("Admin overview error:", error);

    return NextResponse.json(
      {
        error: "Unable to load admin overview",
      },
      { status: 500 }
    );
  }
}