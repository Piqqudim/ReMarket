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

function response(
  data: unknown,
  status = 200,
) {
  return NextResponse.json(data, {
    status,
    headers: noStore,
  });
}

function zeroDashboard() {
  return {
    hasBusiness: false,

    message:
      "Complete your seller onboarding to access your dashboard.",

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
    /*
     * --------------------------------------------------
     * 1. SELLER AUTHENTICATION
     * --------------------------------------------------
     */

    const access = await requireSellerAccount();

    if (!access.authorized) {
      return access.response;
    }

    /*
     * --------------------------------------------------
     * 2. FIND SELLER BUSINESS
     * --------------------------------------------------
     */

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
          error:
            "You are not allowed to access this business dashboard.",
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

    /*
     * --------------------------------------------------
     * 3. DATABASE FILTERS
     * --------------------------------------------------
     */

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

    /*
     * --------------------------------------------------
     * 4. LOAD DASHBOARD STATISTICS
     * --------------------------------------------------
     *
     * Products:
     * - Total products.
     * - Active products.
     *
     * Inventory:
     * - Tracked products.
     * - Untracked products.
     * - In-stock products.
     * - Out-of-stock products.
     * - Total tracked units.
     *
     * Orders:
     * - Counts grouped by seller order status.
     *
     * Recent orders:
     * - Latest ten seller orders.
     * --------------------------------------------------
     */

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
      /*
       * TOTAL PRODUCTS
       */

      prisma.product.count({
        where: productWhere,
      }),

      /*
       * ACTIVE PRODUCTS
       */

      prisma.product.count({
        where: activeProductWhere,
      }),

      /*
       * PRODUCTS WITH INVENTORY TRACKING ENABLED
       */

      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: {
            not: null,
          },
        },
      }),

      /*
       * PRODUCTS WITHOUT INVENTORY TRACKING
       */

      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: null,
        },
      }),

      /*
       * PRODUCTS WITH AVAILABLE STOCK
       */

      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: {
            gt: 0,
          },
        },
      }),

      /*
       * TRACKED PRODUCTS THAT ARE OUT OF STOCK
       */

      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: 0,
        },
      }),

      /*
       * TOTAL REMAINING TRACKED UNITS
       */

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

      /*
       * ORDER COUNTS GROUPED BY STATUS
       */

      prisma.sellerOrder.groupBy({
        by: ["status"],

        where: sellerOrderWhere,

        _count: {
          _all: true,
        },
      }),

      /*
       * RECENT SELLER ORDERS
       */

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
           * PARENT ORDER AND DELIVERY DETAILS
           */

          order: {
            select: {
              id: true,
              orderCode: true,
              status: true,
              createdAt: true,

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
            },
          },

          /*
           * ORDERED PRODUCT SNAPSHOTS
           */

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

    /*
     * --------------------------------------------------
     * 5. PROCESS ORDER COUNTS
     * --------------------------------------------------
     */

    const orderStatusCounts: Partial<
      Record<SellerOrderStatus, number>
    > = {};

    for (const row of groupedOrders) {
      orderStatusCounts[row.status] =
        row._count._all;
    }

    function getOrderCount(
      status: SellerOrderStatus,
    ): number {
      return orderStatusCounts[status] ?? 0;
    }

    const totalOrders = groupedOrders.reduce(
      (total, row) => total + row._count._all,
      0,
    );

    /*
     * --------------------------------------------------
     * 6. SUCCESSFUL DASHBOARD RESPONSE
     * --------------------------------------------------
     */

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

      /*
       * PRODUCT LISTINGS
       */

      listings: {
        products: {
          total: totalProducts,
          active: activeProducts,
        },

        totalActive: activeProducts,
      },

      /*
       * INVENTORY STATISTICS
       */

      inventory: {
        trackedProducts,
        untrackedProducts,
        inStockProducts,
        outOfStockProducts,

        totalTrackedUnits:
          inventoryAggregate._sum.stockQuantity ?? 0,
      },

      /*
       * SELLER ORDER STATISTICS
       */

      orders: {
        total: totalOrders,

        pendingAcceptance: getOrderCount(
          SellerOrderStatus.PENDING_ACCEPTANCE,
        ),

        accepted: getOrderCount(
          SellerOrderStatus.ACCEPTED,
        ),

        processing: getOrderCount(
          SellerOrderStatus.PROCESSING,
        ),

        readyForDispatch: getOrderCount(
          SellerOrderStatus.READY_FOR_DISPATCH,
        ),

        dispatched: getOrderCount(
          SellerOrderStatus.DISPATCHED,
        ),

        delivered: getOrderCount(
          SellerOrderStatus.DELIVERED,
        ),

        completed: getOrderCount(
          SellerOrderStatus.COMPLETED,
        ),

        rejected: getOrderCount(
          SellerOrderStatus.REJECTED,
        ),

        cancelled: getOrderCount(
          SellerOrderStatus.CANCELLED,
        ),
      },

      /*
       * RECENT ORDERS
       */

      recentOrders,
    });
  } catch (error) {
    console.error(
      "Seller dashboard GET error:",
      error,
    );

    return response(
      {
        error: "Unable to load seller dashboard.",
      },
      500,
    );
  }
}