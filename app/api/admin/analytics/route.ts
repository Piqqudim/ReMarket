import { NextRequest, NextResponse } from "next/server";
import { BusinessStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type AnalyticsRange = "7d" | "30d" | "90d" | "all";

function getRangeStart(range: AnalyticsRange): Date | null {
  if (range === "all") return null;

  const days =
    range === "7d" ? 7 :
    range === "30d" ? 30 :
    90;

  const date = new Date();
  date.setDate(date.getDate() - days);

  return date;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    if (admin instanceof NextResponse) {
      return admin;
    }

    const rangeParam = request.nextUrl.searchParams.get("range") ?? "30d";

    const allowedRanges: AnalyticsRange[] = ["7d", "30d", "90d", "all"];

    if (!allowedRanges.includes(rangeParam as AnalyticsRange)) {
      return NextResponse.json(
        { error: "Invalid analytics range. Use 7d, 30d, 90d or all." },
        { status: 400 }
      );
    }

    const range = rangeParam as AnalyticsRange;
    const rangeStart = getRangeStart(range);

    const dateFilter: Prisma.DateTimeFilter | undefined = rangeStart
      ? { gte: rangeStart }
      : undefined;

    const searchWhere: Prisma.SearchEventWhereInput = dateFilter
      ? { createdAt: dateFilter }
      : {};

    const bookingWhere: Prisma.ServiceBookingWhereInput = dateFilter
      ? { createdAt: dateFilter }
      : {};

    const userWhere: Prisma.UserWhereInput = dateFilter
      ? { createdAt: dateFilter }
      : {};

    const productWhere: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    };

    const serviceWhere: Prisma.ServiceWhereInput = {
      deletedAt: null,
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    };

    const [
      totalAccounts,
      newAccounts,

      totalSearches,
      zeroResultSearches,
      topSearches,
      topUnsuccessfulSearches,

      newProducts,
      newServices,
      activeProducts,
      activeServices,

      newBookings,
      bookingsByStatus,

      totalBusinessViews,
      totalContactEvents,
    ] = await Promise.all([
      // Accounts
      prisma.user.count(),
      prisma.user.count({ where: userWhere }),

      // Search analytics
      prisma.searchEvent.count({ where: searchWhere }),

      prisma.searchEvent.count({
        where: {
          ...searchWhere,
          resultCount: 0,
        },
      }),

      prisma.searchEvent.groupBy({
        by: ["query"],
        where: searchWhere,
        _count: {
          query: true,
        },
        orderBy: {
          _count: {
            query: "desc",
          },
        },
        take: 10,
      }),

      prisma.searchEvent.groupBy({
        by: ["query"],
        where: {
          ...searchWhere,
          resultCount: 0,
        },
        _count: {
          query: true,
        },
        orderBy: {
          _count: {
            query: "desc",
          },
        },
        take: 10,
      }),

      // New listings within the selected period
      prisma.product.count({
        where: productWhere,
      }),

      prisma.service.count({
        where: serviceWhere,
      }),

      // Currently active listings
      prisma.product.count({
        where: {
          status: BusinessStatus.ACTIVE,
          deletedAt: null,
          business: {
            status: BusinessStatus.ACTIVE,
            deletedAt: null,
          },
        },
      }),

      prisma.service.count({
        where: {
          status: BusinessStatus.ACTIVE,
          deletedAt: null,
          business: {
            status: BusinessStatus.ACTIVE,
            deletedAt: null,
          },
        },
      }),

      // Service bookings within the selected period
      prisma.serviceBooking.count({
        where: bookingWhere,
      }),

      prisma.serviceBooking.groupBy({
        by: ["status"],
        where: bookingWhere,
        _count: {
          _all: true,
        },
      }),

      // Event totals
      prisma.businessViewEvent.count(),
      prisma.contactEvent.count(),
    ]);

    const totalNewListings = newProducts + newServices;
    const totalActiveListings = activeProducts + activeServices;

    return NextResponse.json(
      {
        success: true,

        range: {
          selected: range,
          startDate: rangeStart,
          endDate: new Date(),
        },

        accounts: {
          total: totalAccounts,
          new: newAccounts,
        },

        listings: {
          newProducts,
          newServices,
          totalNew: totalNewListings,
          activeProducts,
          activeServices,
          totalActive: totalActiveListings,
        },

        searches: {
          total: totalSearches,
          zeroResult: zeroResultSearches,
          successful: totalSearches - zeroResultSearches,

          topQueries: topSearches.map((item) => ({
            query: item.query,
            count: item._count.query,
          })),

          unsuccessfulQueries: topUnsuccessfulSearches.map((item) => ({
            query: item.query,
            count: item._count.query,
          })),
        },

        bookings: {
          total: newBookings,
          byStatus: bookingsByStatus.map((item) => ({
            status: item.status,
            count: item._count._all,
          })),
        },

        engagement: {
          totalBusinessViews: totalBusinessViews,
          totalContactEvents: totalContactEvents,
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
    console.error("Admin analytics error:", error);

    return NextResponse.json(
      { error: "Failed to load platform analytics." },
      { status: 500 }
    );
  }
}