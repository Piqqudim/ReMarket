import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

const DEFAULT_PERIOD_DAYS = 30;
const MAX_RECENT_EVENTS = 20;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}

function parseDateParam(
  value: string | null,
  fallback: Date
): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("INVALID_DATE");
  }

  return parsed;
}

function getDefaultPeriod() {
  const to = new Date();

  const from = new Date(
    to.getTime() -
      DEFAULT_PERIOD_DAYS *
        24 *
        60 *
        60 *
        1000
  );

  return {
    from,
    to,
  };
}

function serializeDate(value: Date): string {
  return value.toISOString();
}

function buildPeriodWhere(
  from: Date,
  to: Date
) {
  return {
    gte: from,
    lt: to,
  };
}

function countByEnum(
  rows: Array<{
    platform: string;
    _count: {
      _all: number;
    };
  }>
) {
  const result: Record<string, number> = {};

  for (const row of rows) {
    result[row.platform] = row._count._all;
  }

  return result;
}

function countProductAvailability(
  rows: Array<{
    availability:
      | "AVAILABLE"
      | "ASK_SELLER"
      | "UNAVAILABLE";
    _count: {
      _all: number;
    };
  }>
) {
  const result: Record<string, number> = {};

  for (const row of rows) {
    result[row.availability] =
      row._count._all;
  }

  return result;
}

function countRequestStatuses(
  rows: Array<{
    request: {
      status:
        | "NEW"
        | "MATCHED"
        | "CONTACTED"
        | "FULFILLED"
        | "UNFULFILLED"
        | "CLOSED";
    };
  }>
) {
  const result: Record<string, number> = {};

  for (const row of rows) {
    const status = row.request.status;

    result[status] =
      (result[status] ?? 0) + 1;
  }

  return result;
}

function countUniqueRequestIds(
  rows: Array<{
    requestId: string;
  }>
) {
  return new Set(
    rows.map((row) => row.requestId)
  ).size;
}

/**
 * GET
 *
 * /api/admin/businesses/[id]/analytics
 *
 * Optional query parameters:
 *
 * ?from=2026-09-01T00:00:00.000Z
 * &to=2026-09-29T00:00:00.000Z
 *
 * Defaults to the last 30 days.
 *
 * This endpoint is admin-only.
 */
export async function GET(
  request: Request,
  { params }: RouteContext
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;

    const businessId = id.trim();

    if (!businessId) {
      return NextResponse.json(
        {
          error:
            "Business ID is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const { searchParams } =
      new URL(request.url);

    const defaults =
      getDefaultPeriod();

    let from: Date;
    let to: Date;

    try {
      from = parseDateParam(
        searchParams.get("from"),
        defaults.from
      );

      to = parseDateParam(
        searchParams.get("to"),
        defaults.to
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "INVALID_DATE"
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid analytics date range.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      throw error;
    }

    if (
      from.getTime() >=
      to.getTime()
    ) {
      return NextResponse.json(
        {
          error:
            "Analytics start date must be before the end date.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * BUSINESS
     * -----------------------------------------
     *
     * Do not filter deleted businesses here.
     *
     * Admin analytics should still be able
     * to inspect historical business data.
     */
    const business =
      await prisma.business.findUnique({
        where: {
          id: businessId,
        },
        select: {
          id: true,
          name: true,
          ownerName: true,
          ownerId: true,
          status: true,
          verification: true,
          availability: true,
          onboardedAt: true,
          updatedAt: true,
          deletedAt: true,

          location: {
            select: {
              id: true,
              area: true,
              address: true,
              verification: true,
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
      return NextResponse.json(
        {
          error:
            "Business not found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    const periodCreatedAt =
      buildPeriodWhere(from, to);

    /*
     * -----------------------------------------
     * VIEWS
     * -----------------------------------------
     *
     * BusinessViewEvent already stores:
     * - businessId
     * - visitorId
     * - createdAt
     *
     * visitorId is only used for aggregation.
     * It is never returned to the client.
     */
    const [
      totalViewsAllTime,
      periodViews,
      uniqueVisitorsAllTimeRows,
      periodUniqueVisitorRows,
      recentViews,
    ] = await Promise.all([
      prisma.businessViewEvent.count({
        where: {
          businessId,
        },
      }),

      prisma.businessViewEvent.count({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
      }),

      prisma.businessViewEvent.findMany({
        where: {
          businessId,
        },
        select: {
          visitorId: true,
        },
        distinct: ["visitorId"],
      }),

      prisma.businessViewEvent.findMany({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
        select: {
          visitorId: true,
        },
        distinct: ["visitorId"],
      }),

      prisma.businessViewEvent.findMany({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: MAX_RECENT_EVENTS,
        select: {
          id: true,
          createdAt: true,
        },
      }),
    ]);

    /*
     * -----------------------------------------
     * CONTACTS
     * -----------------------------------------
     */
    const [
      totalContactsAllTime,
      periodContacts,
      contactsByPlatformAllTime,
      contactsByPlatformPeriod,
      recentContacts,
    ] = await Promise.all([
      prisma.contactEvent.count({
        where: {
          businessId,
        },
      }),

      prisma.contactEvent.count({
        where: {
          businessId,
          createdAt: periodCreatedAt,
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
          createdAt: periodCreatedAt,
        },
        _count: {
          _all: true,
        },
      }),

      prisma.contactEvent.findMany({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: MAX_RECENT_EVENTS,
        select: {
          id: true,
          platform: true,
          requestId: true,
          createdAt: true,
        },
      }),
    ]);

    /*
     * -----------------------------------------
     * PRODUCT ANALYTICS
     * -----------------------------------------
     *
     * Total includes soft-deleted products.
     * Active/inactive/pending exclude soft-deleted
     * records.
     */
    const [
      totalProducts,
      activeProducts,
      inactiveProducts,
      pendingProducts,
      deletedProducts,
      productAvailability,
    ] = await Promise.all([
      prisma.product.count({
        where: {
          businessId,
        },
      }),

      prisma.product.count({
        where: {
          businessId,
          deletedAt: null,
          status: "ACTIVE",
        },
      }),

      prisma.product.count({
        where: {
          businessId,
          deletedAt: null,
          status: "INACTIVE",
        },
      }),

      prisma.product.count({
        where: {
          businessId,
          deletedAt: null,
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
        where: {
          businessId,
          deletedAt: null,
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    /*
     * -----------------------------------------
     * MATCH ANALYTICS
     * -----------------------------------------
     *
     * Match records are the source of truth for
     * seller/business matching activity.
     *
     * We use match.createdAt for the requested
     * analytics period.
     */
    const [
      totalMatchesAllTime,
      periodMatches,
    ] = await Promise.all([
      prisma.match.findMany({
        where: {
          businessId,
        },
        select: {
          requestId: true,
          request: {
            select: {
              status: true,
            },
          },
        },
      }),

      prisma.match.findMany({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
        select: {
          requestId: true,
          request: {
            select: {
              status: true,
            },
          },
        },
      }),
    ]);

    const totalMatchedRequestsAllTime =
      countUniqueRequestIds(
        totalMatchesAllTime
      );

    const periodMatchedRequests =
      countUniqueRequestIds(
        periodMatches
      );

    /*
     * -----------------------------------------
     * CONTACT RATE
     * -----------------------------------------
     *
     * This is only a derived operational metric:
     *
     * recorded contacts / recorded business views
     *
     * It does NOT claim unique-user conversion.
     */
    const allTimeContactRate =
      totalViewsAllTime > 0
        ? Number(
            (
              (totalContactsAllTime /
                totalViewsAllTime) *
              100
            ).toFixed(2)
          )
        : null;

    const periodContactRate =
      periodViews > 0
        ? Number(
            (
              (periodContacts /
                periodViews) *
              100
            ).toFixed(2)
          )
        : null;

    /*
     * -----------------------------------------
     * SEARCH ANALYTICS
     * -----------------------------------------
     *
     * SearchEvent currently has no businessId.
     *
     * Therefore it is not possible to
     * truthfully calculate:
     *
     * "How many searches returned this
     * business?"
     *
     * Do not fabricate this metric.
     */
    const searchAnalytics = {
      available: false,
      reason:
        "SearchEvent does not currently reference a business, so per-business search appearances cannot be calculated yet.",
    };

    /*
     * -----------------------------------------
     * RESPONSE
     * -----------------------------------------
     */
    return NextResponse.json(
      {
        business: {
          id: business.id,
          name: business.name,
          ownerName: business.ownerName,
          ownerId: business.ownerId,
          status: business.status,
          verification:
            business.verification,
          availability:
            business.availability,
          onboardedAt:
            serializeDate(
              business.onboardedAt
            ),
          updatedAt:
            serializeDate(
              business.updatedAt
            ),
          deletedAt:
            business.deletedAt
              ? serializeDate(
                  business.deletedAt
                )
              : null,

          location:
            business.location,

          categories:
            business.categories.map(
              ({ category }) =>
                category
            ),
        },

        period: {
          from: serializeDate(from),
          to: serializeDate(to),
        },

        analytics: {
          views: {
            allTime: {
              total: totalViewsAllTime,
              uniqueVisitors:
                uniqueVisitorsAllTimeRows.length,
            },

            period: {
              total: periodViews,
              uniqueVisitors:
                periodUniqueVisitorRows.length,
            },

            recent:
              recentViews.map(
                (event) => ({
                  id: event.id,
                  createdAt:
                    serializeDate(
                      event.createdAt
                    ),
                })
              ),
          },

          contacts: {
            allTime: {
              total: totalContactsAllTime,
              byPlatform:
                countByEnum(
                  contactsByPlatformAllTime
                ),
            },

            period: {
              total: periodContacts,
              byPlatform:
                countByEnum(
                  contactsByPlatformPeriod
                ),
            },

            contactRatePercent: {
              allTime:
                allTimeContactRate,
              period:
                periodContactRate,
            },

            recent:
              recentContacts.map(
                (event) => ({
                  id: event.id,
                  platform:
                    event.platform,
                  requestId:
                    event.requestId,
                  createdAt:
                    serializeDate(
                      event.createdAt
                    ),
                })
              ),
          },

          directions: {
            allTime:
              contactsByPlatformAllTime.find(
                (item) =>
                  item.platform ===
                  "DIRECTIONS"
              )?._count._all ?? 0,

            period:
              contactsByPlatformPeriod.find(
                (item) =>
                  item.platform ===
                  "DIRECTIONS"
              )?._count._all ?? 0,

            source:
              "Recorded ContactEvent records with platform=DIRECTIONS.",
          },

          products: {
            total:
              totalProducts,

            active:
              activeProducts,

            inactive:
              inactiveProducts,

            pending:
              pendingProducts,

            deleted:
              deletedProducts,

            availability:
              countProductAvailability(
                productAvailability
              ),
          },

          matching: {
            matches: {
              allTime:
                totalMatchesAllTime.length,
              period:
                periodMatches.length,
            },

            matchedRequests: {
              allTime:
                totalMatchedRequestsAllTime,
              period:
                periodMatchedRequests,
            },

            requestStatus: {
              allTime:
                countRequestStatuses(
                  totalMatchesAllTime
                ),

              period:
                countRequestStatuses(
                  periodMatches
                ),
            },
          },

          search:
            searchAnalytics,
        },
      },
      {
        status: 200,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Business analytics API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load business analytics.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}