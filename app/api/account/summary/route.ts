
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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
        { error: "You must be logged in to view your account summary." },
        401
      );
    }

    const userId = session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        business: {
          select: {
            id: true,
            name: true,
            status: true,
            verification: true,
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

    const businessId = user.business?.id;

    const [
      savedListings,
      buyerBookings,
      buyerPendingBookings,
      sellerBookings,
      sellerPendingBookings,
      unreadNotifications,
      unreadMessages,
      activeProducts,
      activeServices,
    ] = await Promise.all([
      prisma.savedListing.count({
        where: {
          userId,
          OR: [
            {
              product: {
                is: {
                  status: "ACTIVE",
                  deletedAt: null,
                  business: {
                    is: {
                      status: "ACTIVE",
                      deletedAt: null,
                    },
                  },
                },
              },
            },
            {
              service: {
                is: {
                  status: "ACTIVE",
                  deletedAt: null,
                  business: {
                    is: {
                      status: "ACTIVE",
                      deletedAt: null,
                    },
                  },
                },
              },
            },
          ],
        },
      }),

      prisma.serviceBooking.count({
        where: { buyerId: userId },
      }),

      prisma.serviceBooking.count({
        where: {
          buyerId: userId,
          status: "PENDING",
        },
      }),

      businessId
        ? prisma.serviceBooking.count({
            where: {
              service: {
                is: {
                  businessId,
                },
              },
            },
          })
        : Promise.resolve(0),

      businessId
        ? prisma.serviceBooking.count({
            where: {
              status: "PENDING",
              service: {
                is: {
                  businessId,
                },
              },
            },
          })
        : Promise.resolve(0),

      prisma.notification.count({
        where: {
          userId,
          readAt: null,
        },
      }),

      prisma.serviceBookingMessage.count({
        where: {
          senderId: { not: userId },
          readAt: null,
          booking: {
            is: {
              OR: [
                { buyerId: userId },
                {
                  service: {
                    is: {
                      business: {
                        is: {
                          ownerId: userId,
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      }),

      businessId
        ? prisma.product.count({
            where: {
              businessId,
              status: "ACTIVE",
              deletedAt: null,
            },
          })
        : Promise.resolve(0),

      businessId
        ? prisma.service.count({
            where: {
              businessId,
              status: "ACTIVE",
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
    ]);

    return response({
      account: {
        id: user.id,
        role: user.role,
        isBuyer: user.role === "BUYER" || user.role === "SELLER",
        isSeller: Boolean(user.business),
      },

      sellerBusiness: user.business,

      saved: {
        total: savedListings,
      },

      bookings: {
        asBuyer: {
          total: buyerBookings,
          pending: buyerPendingBookings,
        },
        asSeller: {
          total: sellerBookings,
          pending: sellerPendingBookings,
        },
      },

      messages: {
        unreadCount: unreadMessages,
      },

      notifications: {
        unreadCount: unreadNotifications,
      },

      sellerListings: {
        activeProducts,
        activeServices,
        total: activeProducts + activeServices,
      },
    });
  } catch (error) {
    console.error("Account summary GET error:", error);

    return response(
      { error: "Unable to load account summary." },
      500
    );
  }
}
