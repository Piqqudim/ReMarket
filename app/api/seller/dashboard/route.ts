
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ServiceBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return response(
        { error: "You must be logged in to access the seller dashboard." },
        401
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        role: true,
        business: {
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            status: true,
            verification: true,
            availability: true,
            showContactInfo: true,
            location: {
              select: {
                area: true,
                street: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return response(
        { error: "Account not found." },
        404
      );
    }

    if (user.role !== "SELLER") {
      return response(
        { error: "A seller account is required to access this dashboard." },
        403
      );
    }

    if (!user.business) {
      return response({
        hasBusiness: false,
        message: "Complete your seller onboarding to access your dashboard.",
        business: null,
        listings: {
          products: { total: 0, active: 0 },
          services: { total: 0, active: 0 },
        },
        bookings: {
          total: 0,
          pending: 0,
          accepted: 0,
          declined: 0,
          cancelled: 0,
          completed: 0,
        },
        recentBookings: [],
      });
    }

    const businessId = user.business.id;

    const bookingWhere = {
      service: {
        is: {
          businessId,
        },
      },
    };

    const activeProductWhere = {
      businessId,
      status: "ACTIVE" as const,
      deletedAt: null,
    };

    const activeServiceWhere = {
      businessId,
      status: "ACTIVE" as const,
      deletedAt: null,
    };

    const [
      totalProducts,
      activeProducts,
      totalServices,
      activeServices,
      totalBookings,
      pendingBookings,
      acceptedBookings,
      declinedBookings,
      cancelledBookings,
      completedBookings,
      recentBookings,
    ] = await Promise.all([
      prisma.product.count({
        where: {
          businessId,
          deletedAt: null,
        },
      }),

      prisma.product.count({
        where: activeProductWhere,
      }),

      prisma.service.count({
        where: {
          businessId,
          deletedAt: null,
        },
      }),

      prisma.service.count({
        where: activeServiceWhere,
      }),

      prisma.serviceBooking.count({
        where: bookingWhere,
      }),

      prisma.serviceBooking.count({
        where: {
          ...bookingWhere,
          status: ServiceBookingStatus.PENDING,
        },
      }),

      prisma.serviceBooking.count({
        where: {
          ...bookingWhere,
          status: ServiceBookingStatus.ACCEPTED,
        },
      }),

      prisma.serviceBooking.count({
        where: {
          ...bookingWhere,
          status: ServiceBookingStatus.DECLINED,
        },
      }),

      prisma.serviceBooking.count({
        where: {
          ...bookingWhere,
          status: ServiceBookingStatus.CANCELLED,
        },
      }),

      prisma.serviceBooking.count({
        where: {
          ...bookingWhere,
          status: ServiceBookingStatus.COMPLETED,
        },
      }),

      prisma.serviceBooking.findMany({
        where: bookingWhere,
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
        select: {
          id: true,
          status: true,
          requestedFor: true,
          quantity: true,
          buyerMessage: true,
          createdAt: true,
          updatedAt: true,
          service: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
            },
          },
          buyer: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              messages: true,
            },
          },
        },
      }),
    ]);

    return response({
      hasBusiness: true,

      business: user.business,

      listings: {
        products: {
          total: totalProducts,
          active: activeProducts,
        },
        services: {
          total: totalServices,
          active: activeServices,
        },
        totalActive: activeProducts + activeServices,
      },

      bookings: {
        total: totalBookings,
        pending: pendingBookings,
        accepted: acceptedBookings,
        declined: declinedBookings,
        cancelled: cancelledBookings,
        completed: completedBookings,
      },

      recentBookings: recentBookings.map((booking) => ({
        id: booking.id,
        status: booking.status,
        requestedFor: booking.requestedFor,
        quantity: booking.quantity,
        buyerMessage: booking.buyerMessage,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        service: booking.service,
        buyer: booking.buyer,
        messageCount: booking._count.messages,
      })),
    });
  } catch (error) {
    console.error("Seller dashboard GET error:", error);

    return response(
      { error: "Unable to load seller dashboard." },
      500
    );
  }
}
