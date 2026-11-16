
import { NextResponse } from "next/server";
import {
  BusinessStatus,
  OrderStatus,
  PaymentStatus,
} from "@prisma/client";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = {
  "Cache-Control":
    "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET() {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const [
      businesses,
      activeBusinesses,
      deletedBusinesses,
      products,
      activeProducts,
      buyers,
      sellers,
      orders,
      completedOrders,
      cancelledOrders,
      pendingSellerOrders,
      unconfirmedDeliveryFees,
      pendingPayments,
      pendingDeletionRequests,
      categories,
      activeCategories,
      businessViews,
      contacts,
      contactActivityRows,
      orderStatusRows,
      paymentStatusRows,
      recentOrders,
      recentBusinesses,
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
          deletedAt: {
            not: null,
          },
        },
      }),

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
            status: BusinessStatus.ACTIVE,
            deletedAt: null,
          },
        },
      }),

      prisma.user.count({
        where: {
          role: "BUYER",
        },
      }),

      prisma.user.count({
        where: {
          role: "SELLER",
        },
      }),

      prisma.order.count(),

      prisma.order.count({
        where: {
          status: OrderStatus.COMPLETED,
        },
      }),

      prisma.order.count({
        where: {
          status: {
            in: [
              OrderStatus.CANCELLED,
              OrderStatus.PARTIALLY_CANCELLED,
            ],
          },
        },
      }),

      prisma.sellerOrder.count({
        where: {
          status: "PENDING_ACCEPTANCE",
        },
      }),

      prisma.order.count({
        where: {
          deliveryFeeStatus: "UNCONFIRMED",
        },
      }),

      prisma.payment.count({
        where: {
          status: {
            in: [
              PaymentStatus.PENDING,
              PaymentStatus.INITIATED,
            ],
          },
        },
      }),

      prisma.businessDeletionRequest.count({
        where: {
          status: "PENDING",
        },
      }),

      prisma.category.count(),

      prisma.category.count({
        where: {
          isActive: true,
        },
      }),

      prisma.businessViewEvent.count(),

      prisma.contactEvent.count(),

      prisma.contactEvent.groupBy({
        by: ["platform"],
        _count: {
          _all: true,
        },
      }),

      prisma.order.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.payment.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.order.findMany({
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 8,
        select: {
          id: true,
          orderCode: true,
          status: true,
          itemsSubtotal: true,
          deliveryFee: true,
          deliveryFeeStatus: true,
          totalAmount: true,
          currency: true,
          createdAt: true,

          buyer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },

          _count: {
            select: {
              sellerOrders: true,
            },
          },
        },
      }),

      prisma.business.findMany({
        where: {
          deletedAt: null,
        },
        orderBy: [
          {
            onboardedAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 6,
        select: {
          id: true,
          name: true,
          status: true,
          verification: true,
          onboardedAt: true,

          location: {
            select: {
              area: true,
            },
          },
        },
      }),
    ]);

    const contactActivity: Record<string, number> = {
      WHATSAPP: 0,
      PHONE: 0,
      INSTAGRAM: 0,
      TIKTOK: 0,
      FACEBOOK: 0,
      DIRECTIONS: 0,
    };

    for (const row of contactActivityRows) {
      contactActivity[row.platform] =
        row._count._all;
    }

    const mapCounts = <T extends string>(
      rows: Array<{
        status: T;
        _count: {
          _all: number;
        };
      }>,
    ) =>
      rows.map((row) => ({
        status: row.status,
        count: row._count._all,
      }));

    return NextResponse.json(
      {
        stats: {
          businesses,
          activeBusinesses,
          deletedBusinesses,
          products,
          activeProducts,
          buyers,
          sellers,
          orders,
          completedOrders,
          cancelledOrders,
          businessViews,
          contacts,
        },

        operations: {
          pendingSellerOrders,
          unconfirmedDeliveryFees,
          pendingPayments,
          pendingDeletionRequests,
          categories,
          activeCategories,
        },

        orderStatusCounts:
          mapCounts(orderStatusRows),

        paymentStatusCounts:
          mapCounts(paymentStatusRows),

        contactActivity,

        recentOrders: recentOrders.map(
          (order) => ({
            ...order,
            sellerOrderCount:
              order._count.sellerOrders,
          }),
        ),

        recentBusinesses,

        generatedAt: new Date().toISOString(),
      },
      {
        headers: noStore,
      },
    );
  } catch (error) {
    console.error(
      "Admin overview error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to load the Admin overview.",
      },
      {
        status: 500,
        headers: noStore,
      },
    );
  }
}
