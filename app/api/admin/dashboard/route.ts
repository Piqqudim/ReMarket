
import {
  BusinessStatus,
  Role,
  ServiceBookingStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

function jsonHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: jsonHeaders(),
  });
}

export async function GET() {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const now = new Date();

    const sevenDaysAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    );

    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    );

    /*
     * --------------------------------------------------
     * ACCOUNTS
     * --------------------------------------------------
     */

    const [
      totalUsers,
      buyerAccounts,
      sellerAccounts,
      adminAccounts,
      newUsers7Days,
      newUsers30Days,
    ] = await Promise.all([
      prisma.user.count(),

      prisma.user.count({
        where: {
          role: Role.BUYER,
        },
      }),

      prisma.user.count({
        where: {
          role: Role.SELLER,
        },
      }),

      prisma.user.count({
        where: {
          role: Role.ADMIN,
        },
      }),

      prisma.user.count({
        where: {
          createdAt: {
            gte: sevenDaysAgo,
          },
        },
      }),

      prisma.user.count({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
        },
      }),
    ]);

    /*
     * --------------------------------------------------
     * BUSINESSES
     * --------------------------------------------------
     */

    const [
      totalBusinesses,
      activeBusinesses,
      pendingBusinesses,
      inactiveBusinesses,
      deletedBusinesses,
    ] = await Promise.all([
      prisma.business.count({
        where: {
          deletedAt: null,
        },
      }),

      prisma.business.count({
        where: {
          status: BusinessStatus.ACTIVE,
          deletedAt: null,
        },
      }),

      prisma.business.count({
        where: {
          status: BusinessStatus.PENDING,
          deletedAt: null,
        },
      }),

      prisma.business.count({
        where: {
          status: BusinessStatus.INACTIVE,
          deletedAt: null,
        },
      }),

      prisma.business.count({
        where: {
          deletedAt: {
            not: null,
          },
        },
      }),
    ]);

    /*
     * --------------------------------------------------
     * PRODUCTS
     * --------------------------------------------------
     */

    const [
      totalProducts,
      activeProducts,
      pendingProducts,
      inactiveProducts,
      deletedProducts,
      newProducts7Days,
      newProducts30Days,
    ] = await Promise.all([
      prisma.product.count({
        where: {
          deletedAt: null,
        },
      }),

      prisma.product.count({
        where: {
          status: BusinessStatus.ACTIVE,
          deletedAt: null,
          business: {
            is: {
              status: BusinessStatus.ACTIVE,
              deletedAt: null,
            },
          },
        },
      }),

      prisma.product.count({
        where: {
          status: BusinessStatus.PENDING,
          deletedAt: null,
        },
      }),

      prisma.product.count({
        where: {
          status: BusinessStatus.INACTIVE,
          deletedAt: null,
        },
      }),

      prisma.product.count({
        where: {
          deletedAt: {
            not: null,
          },
        },
      }),

      prisma.product.count({
        where: {
          createdAt: {
            gte: sevenDaysAgo,
          },
          deletedAt: null,
        },
      }),

      prisma.product.count({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
          deletedAt: null,
        },
      }),
    ]);

    /*
     * --------------------------------------------------
     * SERVICES
     * --------------------------------------------------
     */

    const [
      totalServices,
      activeServices,
      pendingServices,
      inactiveServices,
      deletedServices,
      newServices7Days,
      newServices30Days,
    ] = await Promise.all([
      prisma.service.count({
        where: {
          deletedAt: null,
        },
      }),

      prisma.service.count({
        where: {
          status: BusinessStatus.ACTIVE,
          deletedAt: null,
          business: {
            is: {
              status: BusinessStatus.ACTIVE,
              deletedAt: null,
            },
          },
        },
      }),

      prisma.service.count({
        where: {
          status: BusinessStatus.PENDING,
          deletedAt: null,
        },
      }),

      prisma.service.count({
        where: {
          status: BusinessStatus.INACTIVE,
          deletedAt: null,
        },
      }),

      prisma.service.count({
        where: {
          deletedAt: {
            not: null,
          },
        },
      }),

      prisma.service.count({
        where: {
          createdAt: {
            gte: sevenDaysAgo,
          },
          deletedAt: null,
        },
      }),

      prisma.service.count({
        where: {
          createdAt: {
            gte: thirtyDaysAgo,
          },
          deletedAt: null,
        },
      }),
    ]);

    /*
     * --------------------------------------------------
     * SERVICE BOOKINGS
     * --------------------------------------------------
     */

    const [
      totalBookings,
      pendingBookings,
      acceptedBookings,
      declinedBookings,
      cancelledBookings,
      completedBookings,
    ] = await Promise.all([
      prisma.serviceBooking.count(),

      prisma.serviceBooking.count({
        where: {
          status: ServiceBookingStatus.PENDING,
        },
      }),

      prisma.serviceBooking.count({
        where: {
          status: ServiceBookingStatus.ACCEPTED,
        },
      }),

      prisma.serviceBooking.count({
        where: {
          status: ServiceBookingStatus.DECLINED,
        },
      }),

      prisma.serviceBooking.count({
        where: {
          status: ServiceBookingStatus.CANCELLED,
        },
      }),

      prisma.serviceBooking.count({
        where: {
          status: ServiceBookingStatus.COMPLETED,
        },
      }),
    ]);

    /*
     * --------------------------------------------------
     * PLATFORM ACTIVITY
     * --------------------------------------------------
     */

    const [
      businessViews,
      contactEvents,
      totalSearches,
      zeroResultSearches,
      unreadMessages,
      unreadNotifications,
    ] = await Promise.all([
      prisma.businessViewEvent.count(),

      prisma.contactEvent.count(),

      prisma.searchEvent.count(),

      prisma.searchEvent.count({
        where: {
          resultCount: 0,
        },
      }),

      prisma.serviceBookingMessage.count({
        where: {
          readAt: null,
        },
      }),

      prisma.notification.count({
        where: {
          readAt: null,
        },
      }),
    ]);

    /*
     * --------------------------------------------------
     * RECENT SERVICE BOOKINGS
     * --------------------------------------------------
     */

    const recentBookings =
      await prisma.serviceBooking.findMany({
        orderBy: {
          createdAt: "desc",
        },

        take: 10,

        select: {
          id: true,
          status: true,
          quantity: true,
          requestedFor: true,
          createdAt: true,

          service: {
            select: {
              id: true,
              name: true,

              business: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

          buyer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    /*
     * --------------------------------------------------
     * RESPONSE
     * --------------------------------------------------
     */

    return response({
      dashboard: {
        generatedAt: now.toISOString(),

        accounts: {
          total: totalUsers,

          buyerAccounts,

          sellerAccounts,

          adminAccounts,

          newUsers: {
            last7Days: newUsers7Days,
            last30Days: newUsers30Days,
          },
        },

        businesses: {
          total: totalBusinesses,
          active: activeBusinesses,
          pending: pendingBusinesses,
          inactive: inactiveBusinesses,
          deleted: deletedBusinesses,
        },

        products: {
          total: totalProducts,
          active: activeProducts,
          pending: pendingProducts,
          inactive: inactiveProducts,
          deleted: deletedProducts,

          newListings: {
            last7Days: newProducts7Days,
            last30Days: newProducts30Days,
          },
        },

        services: {
          total: totalServices,
          active: activeServices,
          pending: pendingServices,
          inactive: inactiveServices,
          deleted: deletedServices,

          newListings: {
            last7Days: newServices7Days,
            last30Days: newServices30Days,
          },
        },

        listings: {
          total: totalProducts + totalServices,
          active: activeProducts + activeServices,
          pending: pendingProducts + pendingServices,
          inactive: inactiveProducts + inactiveServices,
          deleted: deletedProducts + deletedServices,
        },

        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          accepted: acceptedBookings,
          declined: declinedBookings,
          cancelled: cancelledBookings,
          completed: completedBookings,
        },

        activity: {
          businessViews,
          contactEvents,
          totalSearches,
          zeroResultSearches,
          unreadMessages,
          unreadNotifications,
        },

        recentBookings,
      },
    });
  } catch (error) {
    console.error(
      "Admin dashboard API error:",
      error
    );

    return response(
      {
        error: "Unable to load admin dashboard statistics.",
      },
      500
    );
  }
}
