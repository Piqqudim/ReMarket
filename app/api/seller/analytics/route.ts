import { NextResponse } from "next/server";
import { SellerOrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";
import { parseAnalyticsPeriod } from "@/lib/analytics-period";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const REQUEST_STATUSES = [
  "NEW",
  "MATCHED",
  "CONTACTED",
  "FULFILLED",
  "UNFULFILLED",
  "CLOSED",
] as const;

const SELLER_ORDER_STATUSES = [
  SellerOrderStatus.PENDING_ACCEPTANCE,
  SellerOrderStatus.ACCEPTED,
  SellerOrderStatus.REJECTED,
  SellerOrderStatus.PROCESSING,
  SellerOrderStatus.READY_FOR_DISPATCH,
  SellerOrderStatus.DISPATCHED,
  SellerOrderStatus.DELIVERED,
  SellerOrderStatus.COMPLETED,
  SellerOrderStatus.CANCELLED,
] as const;

const MAX_RECENT_EVENTS = 20;
const MAX_RECENT_ORDERS = 10;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function jsonError(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: noStore,
    },
  );
}

/* =========================================================
   PERCENTAGE
========================================================= */

function percentage(
  numerator: number,
  denominator: number,
): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number(
    ((numerator / denominator) * 100).toFixed(2),
  );
}

/* =========================================================
   REQUEST STATUS COUNTS
========================================================= */

function countStatuses(
  rows: Array<{
    status: string;
    _count: {
      _all: number;
    };
  }>,
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(
    REQUEST_STATUSES.map((status) => [status, 0]),
  );

  for (const row of rows) {
    counts[row.status] = row._count._all;
  }

  return counts;
}

/* =========================================================
   SELLER ORDER STATUS COUNTS
========================================================= */

type SellerOrderStatusRow = {
  status: SellerOrderStatus;
  _count: {
    _all: number;
  };
};

function countSellerOrderStatuses(
  rows: SellerOrderStatusRow[],
): Record<SellerOrderStatus, number> {
  const counts = Object.fromEntries(
    SELLER_ORDER_STATUSES.map((status) => [status, 0]),
  ) as Record<SellerOrderStatus, number>;

  for (const row of rows) {
    counts[row.status] = row._count._all;
  }

  return counts;
}

/* =========================================================
   CONTACT PLATFORM COUNTS
========================================================= */

function countByPlatform(
  rows: Array<{
    platform: string;
    _count: {
      _all: number;
    };
  }>,
): Record<string, number> {
  const counts: Record<string, number> = {
    WHATSAPP: 0,
    PHONE: 0,
    INSTAGRAM: 0,
    TIKTOK: 0,
    FACEBOOK: 0,
    DIRECTIONS: 0,
  };

  for (const row of rows) {
    counts[row.platform] = row._count._all;
  }

  return counts;
}

/* =========================================================
   PRODUCT AVAILABILITY COUNTS
========================================================= */

function countAvailability(
  rows: Array<{
    availability: string;
    _count: {
      _all: number;
    };
  }>,
): Record<string, number> {
  const counts: Record<string, number> = {
    AVAILABLE: 0,
    ASK_SELLER: 0,
    UNAVAILABLE: 0,
  };

  for (const row of rows) {
    counts[row.availability] = row._count._all;
  }

  return counts;
}

/* =========================================================
   UNIQUE BUSINESS VISITORS
========================================================= */

async function countUniqueVisitors(
  businessId: string,
  period?: {
    from: Date;
    to: Date;
  },
): Promise<number> {
  const rows = period
    ? await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "visitorId")::bigint AS "count"
        FROM "BusinessViewEvent"
        WHERE "businessId" = ${businessId}
          AND "createdAt" >= ${period.from}
          AND "createdAt" < ${period.to}
      `
    : await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(DISTINCT "visitorId")::bigint AS "count"
        FROM "BusinessViewEvent"
        WHERE "businessId" = ${businessId}
      `;

  return Number(rows[0]?.count ?? 0);
}

/* =========================================================
   SELLER ANALYTICS
========================================================= */

export async function GET(request: Request) {
  try {
    /*
     * --------------------------------------------------
     * 1. SELLER AUTHENTICATION
     * --------------------------------------------------
     */

    const auth = await requireSeller();

    if (!auth.authorized) {
      return auth.response;
    }

    /*
     * --------------------------------------------------
     * 2. REPORTING PERIOD
     * --------------------------------------------------
     */

    const url = new URL(request.url);

    const periodResult = parseAnalyticsPeriod(
      url.searchParams,
      30,
    );

    if (!periodResult.valid) {
      return jsonError(
        periodResult.error,
        400,
      );
    }

    const { from, to } = periodResult.period;

    const periodWhere = {
      gte: from,
      lt: to,
    };

    /*
     * --------------------------------------------------
     * 3. SELLER BUSINESS
     * --------------------------------------------------
     */

    const business = await prisma.business.findUnique({
      where: {
        ownerId: auth.user.id,
      },

      select: {
        id: true,
        name: true,
        ownerId: true,
        ownerName: true,
        status: true,
        verification: true,
        availability: true,
        deletedAt: true,

        location: {
          select: {
            id: true,
            area: true,
          },
        },

        categories: {
          select: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!business) {
      return jsonError(
        "You do not have a business linked to this seller account.",
        404,
      );
    }

    if (business.ownerId !== auth.user.id) {
      return jsonError(
        "You are not allowed to access these analytics.",
        403,
      );
    }

    if (business.deletedAt) {
      return jsonError(
        "This business has been deleted.",
        410,
      );
    }

    const businessId = business.id;
    const sellerId = auth.user.id;

    /*
     * --------------------------------------------------
     * 4. DATABASE FILTERS
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

    const sellerOrderPeriodWhere = {
      ...sellerOrderWhere,
      createdAt: periodWhere,
    };

    /*
     * --------------------------------------------------
     * 5. FETCH ANALYTICS
     * --------------------------------------------------
     *
     * Business:
     * - Views.
     * - Unique visitors.
     * - Contact activity.
     *
     * Products:
     * - Listing status.
     * - Availability.
     * - Inventory tracking.
     * - Remaining stock.
     *
     * Orders:
     * - Total seller orders.
     * - Status breakdown.
     * - Period activity.
     * - Recent orders.
     *
     * Buyer requests:
     * - Existing match statistics.
     *
     * No service or service-booking queries are included.
     * --------------------------------------------------
     */

    const [
      // BUSINESS VIEWS
      allViews,
      periodViews,
      uniqueVisitorsAllTime,
      uniqueVisitorsPeriod,
      recentViews,

      // CONTACT EVENTS
      allContacts,
      periodContacts,
      contactsByPlatformAllRows,
      contactsByPlatformPeriodRows,
      recentContacts,

      // PRODUCT COUNTS
      productTotal,
      productActive,
      productInactive,
      productPending,
      productDeleted,
      productsByAvailability,

      // PRODUCT INVENTORY
      trackedProducts,
      untrackedProducts,
      inStockProducts,
      outOfStockProducts,
      inventoryAggregate,

      // BUYER REQUEST MATCHES
      matchesTotal,
      matchesPeriod,
      matchedRequestStatusesAllRows,
      matchedRequestStatusesPeriodRows,

      // SELLER ORDERS
      ordersTotal,
      ordersPeriod,
      ordersByStatusAllRows,
      ordersByStatusPeriodRows,
      recentOrders,
    ] = await Promise.all([
      /*
       * ---------------------------------------------
       * BUSINESS VIEWS
       * ---------------------------------------------
       */

      prisma.businessViewEvent.count({
        where: {
          businessId,
        },
      }),

      prisma.businessViewEvent.count({
        where: {
          businessId,
          createdAt: periodWhere,
        },
      }),

      countUniqueVisitors(businessId),

      countUniqueVisitors(
        businessId,
        { from, to },
      ),

      prisma.businessViewEvent.findMany({
        where: {
          businessId,
          createdAt: periodWhere,
        },

        select: {
          id: true,
          createdAt: true,
        },

        orderBy: {
          createdAt: "desc",
        },

        take: MAX_RECENT_EVENTS,
      }),

      /*
       * ---------------------------------------------
       * CONTACT EVENTS
       * ---------------------------------------------
       */

      prisma.contactEvent.count({
        where: {
          businessId,
        },
      }),

      prisma.contactEvent.count({
        where: {
          businessId,
          createdAt: periodWhere,
        },
      }),

      prisma.contactEvent.groupBy({
        by: ["platform"],

        where: {
          businessId,
        },

        _count: {
          _all: true,
        },
      }),

      prisma.contactEvent.groupBy({
        by: ["platform"],

        where: {
          businessId,
          createdAt: periodWhere,
        },

        _count: {
          _all: true,
        },
      }),

      prisma.contactEvent.findMany({
        where: {
          businessId,
          createdAt: periodWhere,
        },

        select: {
          id: true,
          platform: true,
          requestId: true,
          createdAt: true,
        },

        orderBy: {
          createdAt: "desc",
        },

        take: MAX_RECENT_EVENTS,
      }),

      /*
       * ---------------------------------------------
       * PRODUCT LISTINGS
       * ---------------------------------------------
       *
       * Total excludes soft-deleted products.
       * Deleted products are reported separately.
       * ---------------------------------------------
       */

      prisma.product.count({
        where: productWhere,
      }),

      prisma.product.count({
        where: {
          ...productWhere,
          status: "ACTIVE",
        },
      }),

      prisma.product.count({
        where: {
          ...productWhere,
          status: "INACTIVE",
        },
      }),

      prisma.product.count({
        where: {
          ...productWhere,
          status: "PENDING",
        },
      }),

      prisma.product.count({
        where: {
          businessId,
          deletedAt: {
            not: null,
          },
        },
      }),

      prisma.product.groupBy({
        by: ["availability"],

        where: productWhere,

        _count: {
          _all: true,
        },
      }),

      /*
       * ---------------------------------------------
       * PRODUCT INVENTORY
       * ---------------------------------------------
       */

      // Inventory tracking enabled.
      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: {
            not: null,
          },
        },
      }),

      // Inventory tracking disabled.
      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: null,
        },
      }),

      // Tracked products with positive stock.
      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: {
            gt: 0,
          },
        },
      }),

      // Tracked products with zero stock.
      prisma.product.count({
        where: {
          ...productWhere,
          stockQuantity: 0,
        },
      }),

      // Sum of remaining tracked units.
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
       * ---------------------------------------------
       * BUYER REQUEST MATCHES
       * ---------------------------------------------
       */

      prisma.match.count({
        where: {
          businessId,
        },
      }),

      prisma.match.count({
        where: {
          businessId,
          createdAt: periodWhere,
        },
      }),

      // Distinct matched requests, using their current status.
      prisma.buyerRequest.groupBy({
        by: ["status"],

        where: {
          matches: {
            some: {
              businessId,
            },
          },
        },

        _count: {
          _all: true,
        },
      }),

      prisma.buyerRequest.groupBy({
        by: ["status"],

        where: {
          matches: {
            some: {
              businessId,
              createdAt: periodWhere,
            },
          },
        },

        _count: {
          _all: true,
        },
      }),

      /*
       * ---------------------------------------------
       * SELLER ORDERS
       * ---------------------------------------------
       *
       * Each SellerOrder represents one business's
       * fulfilment portion of a buyer checkout.
       *
       * The seller sees only their own business orders.
       * ---------------------------------------------
       */

      prisma.sellerOrder.count({
        where: sellerOrderWhere,
      }),

      prisma.sellerOrder.count({
        where: sellerOrderPeriodWhere,
      }),

      // All-time seller order counts by status.
      prisma.sellerOrder.groupBy({
        by: ["status"],

        where: sellerOrderWhere,

        _count: {
          _all: true,
        },
      }),

      // Seller order counts within the selected period.
      prisma.sellerOrder.groupBy({
        by: ["status"],

        where: sellerOrderPeriodWhere,

        _count: {
          _all: true,
        },
      }),

      // Latest ten seller orders within the selected period.
      prisma.sellerOrder.findMany({
        where: sellerOrderPeriodWhere,

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        take: MAX_RECENT_ORDERS,

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

          order: {
            select: {
              id: true,
              orderCode: true,
              status: true,
              createdAt: true,

              buyer: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
    ]);

    /*
     * --------------------------------------------------
     * 6. PROCESS COUNTS
     * --------------------------------------------------
     */

    const contactsByPlatformAll = countByPlatform(
      contactsByPlatformAllRows,
    );

    const contactsByPlatformPeriod = countByPlatform(
      contactsByPlatformPeriodRows,
    );

    const availabilityCounts = countAvailability(
      productsByAvailability,
    );

    const matchedRequestsAllTime =
      matchedRequestStatusesAllRows.reduce(
        (sum, row) => sum + row._count._all,
        0,
      );

    const matchedRequestsPeriod =
      matchedRequestStatusesPeriodRows.reduce(
        (sum, row) => sum + row._count._all,
        0,
      );

    const orderStatusCountsAllTime =
      countSellerOrderStatuses(
        ordersByStatusAllRows,
      );

    const orderStatusCountsPeriod =
      countSellerOrderStatuses(
        ordersByStatusPeriodRows,
      );

    const totalTrackedUnits =
      inventoryAggregate._sum.stockQuantity ?? 0;

    /*
     * --------------------------------------------------
     * 7. RESPONSE
     * --------------------------------------------------
     */

    return NextResponse.json(
      {
        business: {
          id: business.id,
          name: business.name,
          ownerName: business.ownerName,
          status: business.status,
          verification: business.verification,
          availability: business.availability,
          location: business.location,
          categories: business.categories,
        },

        /*
         * REPORTING PERIOD
         */

        period: {
          from: from.toISOString(),
          to: to.toISOString(),
          timezone: "Africa/Lagos",
          endExclusive: true,

          days: Math.max(
            1,
            Math.ceil(
              (to.getTime() - from.getTime()) /
                (24 * 60 * 60 * 1000),
            ),
          ),
        },

        /*
         * BUSINESS VIEWS
         */

        views: {
          allTime: allViews,
          period: periodViews,

          uniqueVisitorsAllTime,
          uniqueVisitorsPeriod,

          recent: recentViews.map((view) => ({
            id: view.id,
            createdAt: view.createdAt.toISOString(),
          })),

          recentScope: "Selected reporting period",
        },

        /*
         * CONTACT ANALYTICS
         */

        contacts: {
          allTime: allContacts,
          period: periodContacts,

          allTimeByPlatform: contactsByPlatformAll,
          periodByPlatform: contactsByPlatformPeriod,

          recent: recentContacts.map((contact) => ({
            id: contact.id,
            platform: contact.platform,
            requestId: contact.requestId,
            createdAt: contact.createdAt.toISOString(),
          })),

          recentScope: "Selected reporting period",

          allTimeContactRate: percentage(
            allContacts,
            allViews,
          ),

          periodContactRate: percentage(
            periodContacts,
            periodViews,
          ),

          contactRateDefinition:
            "Contact clicks per 100 business views. This is not a unique-buyer conversion rate and can exceed 100%.",

          directionsAllTime:
            contactsByPlatformAll.DIRECTIONS,

          directionsPeriod:
            contactsByPlatformPeriod.DIRECTIONS,
        },

        /*
         * PRODUCT LISTINGS
         */

        products: {
          total: productTotal,
          active: productActive,
          inactive: productInactive,
          pending: productPending,
          deleted: productDeleted,

          availability: availabilityCounts,

          totalDefinition:
            "Non-deleted products only; deleted products are reported separately.",

          availabilityScope:
            "Non-deleted products, including inactive and pending products.",
        },

        /*
         * PRODUCT INVENTORY
         */

        inventory: {
          trackedProducts,
          untrackedProducts,
          inStockProducts,
          outOfStockProducts,

          totalTrackedUnits,

          definitions: {
            trackedProducts:
              "Non-deleted products with stockQuantity set to a number.",

            untrackedProducts:
              "Non-deleted products with stockQuantity set to null.",

            inStockProducts:
              "Non-deleted products with stockQuantity greater than zero.",

            outOfStockProducts:
              "Non-deleted products with stockQuantity equal to zero.",

            totalTrackedUnits:
              "Sum of remaining stock across non-deleted tracked products.",
          },
        },

        /*
         * SELLER ORDER ANALYTICS
         */

        orders: {
          allTime: {
            total: ordersTotal,
            byStatus: orderStatusCountsAllTime,
          },

          period: {
            total: ordersPeriod,
            byStatus: orderStatusCountsPeriod,
          },

          recent: recentOrders.map((order) => ({
            id: order.id,
            sellerOrderCode: order.sellerOrderCode,
            status: order.status,
            subtotal: order.subtotal,

            acceptedAt: order.acceptedAt,
            rejectedAt: order.rejectedAt,
            dispatchedAt: order.dispatchedAt,
            deliveredAt: order.deliveredAt,
            completedAt: order.completedAt,
            cancelledAt: order.cancelledAt,

            createdAt: order.createdAt,
            updatedAt: order.updatedAt,

            order: order.order,

            itemCount: order._count.items,
          })),

          recentScope: "Selected reporting period",

          orderDefinition:
            "Counts seller orders belonging to this business. One buyer checkout can create multiple seller orders when it includes products from different businesses.",

          financialStatus:
            "These figures represent order records, not confirmed payments or revenue.",
        },

        /*
         * BUYER REQUEST MATCHES
         */

        matches: {
          total: matchesTotal,
          period: matchesPeriod,

          matchedRequestsAllTime,
          matchedRequestsPeriod,

          requestStatusesAllTime:
            countStatuses(
              matchedRequestStatusesAllRows,
            ),

          requestStatusesPeriod:
            countStatuses(
              matchedRequestStatusesPeriodRows,
            ),

          statusMeaning:
            "Current status of matched requests, not a historical status snapshot.",
        },

        /*
         * SEARCH ANALYTICS
         */

        search: {
          available: false,

          reason:
            "SearchEvent does not currently reference a business.",
        },
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error(
      "Seller analytics GET error:",
      error,
    );

    return jsonError(
      "Unable to load seller analytics.",
      500,
    );
  }
}