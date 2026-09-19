// app/api/admin/businesses/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);

    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status") || "";
    const verification = searchParams.get("verification") || "";

    const businesses = await prisma.business.findMany({
      where: {
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
              ],
            }
          : {}),

        ...(status &&
        ["ACTIVE", "INACTIVE", "PENDING"].includes(status)
          ? {
              status: status as
                | "ACTIVE"
                | "INACTIVE"
                | "PENDING",
            }
          : {}),

        ...(verification &&
        ["VERIFIED", "UNVERIFIED"].includes(verification)
          ? {
              verification: verification as
                | "VERIFIED"
                | "UNVERIFIED",
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

        area: business.location?.area ?? "Location not added",

        status: business.status,
        verification: business.verification,
        availability: business.availability,

        phone: business.phone,

        categories: business.categories.map(
          (item) => item.category.name
        ),

        productCount: business.products.length,

        socialLinks: business.socialLinks.map((link) => ({
          id: link.id,
          platform: link.platform,
          handle: link.handle,
        })),

        onboardedAt: business.onboardedAt,
      })),
    });
  } catch (error) {
    console.error("Admin businesses GET error:", error);

    return NextResponse.json(
      {
        error: "Unable to load businesses",
      },
      { status: 500 }
    );
  }
}