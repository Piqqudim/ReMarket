import { NextResponse } from "next/server";
import { SellerOrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSellerAccount } from "@/lib/seller-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: noStore,
  });
}

function zeroDashboard() {
  return {
    hasBusiness: false,
    message: "Complete your seller onboarding to access your dashboard.",
    business: null,
    listings: {
      products: {
        total: 0,
        active: 0,
      },
      totalActive: 0,
    },
    inventory: {
      trackedProducts: 0,
      untrackedProducts: 0,
      inStockProducts: 0,
      outOfStockProducts: 0,
      totalTrackedUnits: 0,
    },
    orders: {
      total: 0,
      pendingAcceptance: 0,
      accepted: 0,
      processing: 0,
      readyForDispatch: 0,
      dispatched: 0,
      delivered: 0,
      completed: 0,
      rejected: 0,
      cancelled: 0,
    },
    recentOrders: [],
  };
}

/* =========================================================
   SELLER DASHBOARD
========================================================= */

export async function GET() {
  try {
    /* 1. SELLER AUTHENTICATION */
    const access = await requireSellerAccount();
    if (!access.authorized) {
      return access.response;
    }

    /* 2. FIND SELLER BUSINESS */
    const business = await prisma.business.findUnique({
      where: {
        ownerId: access.user.id,
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        description: true,
        imageUrl: true,
        status: true,
        verification: true,
        availability: true,
        showContactInfo: true,
        deletedAt: true,
        location: {
          select: {
            area: true,
            street: true,
          },
        },
      },
    });

    if (!business) {
      return response(zeroDashboard());
    }

    if (business.ownerId !== access.user.id) {
      return response(
        {
          error: "You are not allowed to access this business dashboard.",
        },
        403,
      );
    }

    if (business.deletedAt) {
      return response(
        {
          error: "This business has been deleted.",
        },
        410,
      );
    }

    const businessId = business.id;
    const sellerId = access.user.id;

    /* 3. DATABASE FILTERS */
    const productWhere = {
      businessId,
      deletedAt: null,
    };

    const activeProductWhere = {
      ...productWhere,
      status: "ACTIVE" as const,
    };

    const sellerOrderWhere = {
      businessId,
      sellerId,
    };

    /* 4. LOAD DASHBOARD STATISTICS AND RECENT ORDERS */
    const [
      totalProducts,
      activeProducts,
      trackedProducts,
      untrackedProducts,
      inStockProducts,
      outOfStockProducts,
      inventoryAggregate,
      groupedOrders,
      recentOrders,
    ] = await Promise.all([
      prisma.product.count({
        where: productWhere,
      }),

      prisma.product.count({
        where: activeProductWhere,
      }),

      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: {
            not: null,
          },
        },
      }),

      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: null,
        },
      }),

      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: {
            gt: 0,
          },
        },
      }),

      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: 0,
        },
      }),

      prisma.product.aggregate({
        where: {
          ...productWhere,
          stockQuantity: {
            not: null,
          },
        },
        _sum: {
          stockQuantity: true,
        },
      }),

      prisma.sellerOrder.groupBy({
        by: ["status"],
        where: sellerOrderWhere,
        _count: {
          _all: true,
        },
      }),

      prisma.sellerOrder.findMany({
        where: sellerOrderWhere,
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 10,
        select: {
          id: true,
          sellerOrderCode: true,
          status: true,
          subtotal: true,
          acceptedAt: true,
          rejectedAt: true,
          dispatchedAt: true,
          deliveredAt: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
          updatedAt: true,

          /*
           * SHIPMENT DETAILS
           *
           * Include provider identifiers, courier details and safe tracking
           * URLs so the seller dashboard can restore these details after a
           * page refresh. Never return raw provider responses or webhook data.
           */
          shipments: {
            orderBy: [
              {
                createdAt: "desc",
              },
              {
                id: "desc",
              },
            ],
            take: 5,
            select: {
              id: true,
              provider: true,
              providerOrderId: true,
              status: true,
              courierName: true,
              trackingCode: true,
              trackingUrl: true,
              waybillUrl: true,
              estimatedDelivery: true,
              shippingFee: true,
              currency: true,
              bookedAt: true,
              pickedUpAt: true,
              inTransitAt: true,
              deliveredAt: true,
              cancelledAt: true,
              failureReason: true,
              createdAt: true,
              updatedAt: true,
            },
          },

          /* PARENT ORDER, DELIVERY DETAILS AND VERIFIED PAYMENT STATE */
          order: {
            select: {
              id: true,
              orderCode: true,
              status: true,
              createdAt: true,
              paidAt: true,
              deliveryRecipient: true,
              deliveryPhone: true,
              deliveryAddress: true,
              deliveryArea: true,
              deliveryLandmark: true,
              deliveryNotes: true,
              buyer: {
                select: {
                  id: true,
                  name: true,
                },
              },
              payments: {
                where: {
                  provider: "PAYSTACK",
                  status: "SUCCESS",
                  paidAt: {
                    not: null,
                  },
                },
                select: {
                  id: true,
                  paidAt: true,
                },
                take: 1,
              },
            },
          },

          /* ORDERED PRODUCT SNAPSHOTS */
          items: {
            orderBy: {
              createdAt: "asc",
            },
            select: {
              id: true,
              productId: true,
              productName: true,
              productImageUrl: true,
              unitPrice: true,
              quantity: true,
              lineTotal: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    /* 5. PROCESS ORDER COUNTS */
    const orderStatusCounts: Partial<Record<SellerOrderStatus, number>> = {};

    for (const row of groupedOrders) {
      orderStatusCounts[row.status] = row._count._all;
    }

    function getOrderCount(status: SellerOrderStatus): number {
      return orderStatusCounts[status] ?? 0;
    }

    const totalOrders = groupedOrders.reduce(
      (total, row) => total + row._count._all,
      0,
    );

    /*
     * Derive a boolean server-side rather than trusting the order status
     * alone. Seller fulfilment is unlocked only if both the parent order's
     * paidAt and a successful, paid Paystack record exist.
     *
     * Strip payment internals from the API response; expose only the boolean.
     */
    const recentOrdersWithPaymentState = recentOrders.map((sellerOrder) => {
      const {
        paidAt,
        payments,
        ...publicOrderFields
      } = sellerOrder.order;

      const paymentVerified = Boolean(
        sellerOrder.order.status !== "PENDING_PAYMENT" &&
        paidAt &&
        payments.some((payment) => payment.paidAt),
      );

      return {
        ...sellerOrder,
        order: {
          ...publicOrderFields,
          paymentVerified,
        },
      };
    });

    /* 6. SUCCESSFUL DASHBOARD RESPONSE */
    return response({
      hasBusiness: true,
      business: {
        id: business.id,
        name: business.name,
        description: business.description,
        imageUrl: business.imageUrl,
        status: business.status,
        verification: business.verification,
        availability: business.availability,
        showContactInfo: business.showContactInfo,
        location: business.location,
      },

      listings: {
        products: {
          total: totalProducts,
          active: activeProducts,
        },
        totalActive: activeProducts,
      },

      inventory: {
        trackedProducts,
        untrackedProducts,
        inStockProducts,
        outOfStockProducts,
        totalTrackedUnits: inventoryAggregate._sum.stockQuantity ?? 0,
      },

      orders: {
        total: totalOrders,
        pendingAcceptance: getOrderCount(SellerOrderStatus.PENDING_ACCEPTANCE),
        accepted: getOrderCount(SellerOrderStatus.ACCEPTED),
        processing: getOrderCount(SellerOrderStatus.PROCESSING),
        readyForDispatch: getOrderCount(SellerOrderStatus.READY_FOR_DISPATCH),
        dispatched: getOrderCount(SellerOrderStatus.DISPATCHED),
        delivered: getOrderCount(SellerOrderStatus.DELIVERED),
        completed: getOrderCount(SellerOrderStatus.COMPLETED),
        rejected: getOrderCount(SellerOrderStatus.REJECTED),
        cancelled: getOrderCount(SellerOrderStatus.CANCELLED),
      },

      recentOrders: recentOrdersWithPaymentState,
    });
  } catch (error) {
    console.error("Seller dashboard GET error:", error);
    return response(
      {
        error: "Unable to load seller dashboard.",
      },
      500,
    );
  }
}
