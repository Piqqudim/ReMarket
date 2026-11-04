
import { NextRequest, NextResponse } from "next/server";
import { BusinessStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const admin = await requireAdmin();

    if (admin instanceof NextResponse) {
      return admin;
    }

    const { id } = await params;
    const userId = id.trim();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 404 }
      );
    }

    const businessRecord = await prisma.business.findUnique({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        status: true,
        verification: true,

        // Location is stored as a related Location record.
        location: {
          select: {
            area: true,
            street: true,
          },
        },
      },
    });

    // Preserve the existing API response shape.
    const business = businessRecord
      ? {
          id: businessRecord.id,
          name: businessRecord.name,
          status: businessRecord.status,
          verification: businessRecord.verification,
          area: businessRecord.location?.area ?? null,
          street: businessRecord.location?.street ?? null,
        }
      : null;

    const sellerBookingWhere = {
      service: {
        is: {
          business: {
            is: {
              ownerId: userId,
            },
          },
        },
      },
    };

    const [
      productTotal,
      productActive,
      productPending,
      productInactive,

      serviceTotal,
      serviceActive,
      servicePending,
      serviceInactive,

      buyerBookingTotal,
      sellerBookingTotal,
      buyerBookingStatuses,
      sellerBookingStatuses,
    ] = await Promise.all([
      business
        ? prisma.product.count({
            where: {
              businessId: business.id,
              deletedAt: null,
            },
          })
        : 0,

      business
        ? prisma.product.count({
            where: {
              businessId: business.id,
              deletedAt: null,
              status: BusinessStatus.ACTIVE,
            },
          })
        : 0,

      business
        ? prisma.product.count({
            where: {
              businessId: business.id,
              deletedAt: null,
              status: BusinessStatus.PENDING,
            },
          })
        : 0,

      business
        ? prisma.product.count({
            where: {
              businessId: business.id,
              deletedAt: null,
              status: BusinessStatus.INACTIVE,
            },
          })
        : 0,

      business
        ? prisma.service.count({
            where: {
              businessId: business.id,
              deletedAt: null,
            },
          })
        : 0,

      business
        ? prisma.service.count({
            where: {
              businessId: business.id,
              deletedAt: null,
              status: BusinessStatus.ACTIVE,
            },
          })
        : 0,

      business
        ? prisma.service.count({
            where: {
              businessId: business.id,
              deletedAt: null,
              status: BusinessStatus.PENDING,
            },
          })
        : 0,

      business
        ? prisma.service.count({
            where: {
              businessId: business.id,
              deletedAt: null,
              status: BusinessStatus.INACTIVE,
            },
          })
        : 0,

      prisma.serviceBooking.count({
        where: {
          buyerId: userId,
        },
      }),

      prisma.serviceBooking.count({
        where: sellerBookingWhere,
      }),

      prisma.serviceBooking.groupBy({
        by: ["status"],
        where: {
          buyerId: userId,
        },
        _count: {
          _all: true,
        },
      }),

      prisma.serviceBooking.groupBy({
        by: ["status"],
        where: sellerBookingWhere,
        _count: {
          _all: true,
        },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,

        user,

        business,

        listings: {
          products: {
            total: productTotal,
            active: productActive,
            pending: productPending,
            inactive: productInactive,
          },

          services: {
            total: serviceTotal,
            active: serviceActive,
            pending: servicePending,
            inactive: serviceInactive,
          },

          total: productTotal + serviceTotal,
          active: productActive + serviceActive,
        },

        bookings: {
          asBuyer: {
            total: buyerBookingTotal,
            byStatus: buyerBookingStatuses.map((item) => ({
              status: item.status,
              count: item._count._all,
            })),
          },

          asSeller: {
            total: sellerBookingTotal,
            byStatus: sellerBookingStatuses.map((item) => ({
              status: item.status,
              count: item._count._all,
            })),
          },
        },

        generatedAt: new Date(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Admin user details GET error:", error);

    return NextResponse.json(
      { error: "Failed to retrieve user account details." },
      { status: 500 }
    );
  }
}
