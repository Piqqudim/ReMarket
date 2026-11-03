import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { parseAnalyticsPeriod } from "@/lib/analytics-period";

const MAX_RECENT_EVENTS = 20;

const REQUEST_STATUSES = [
  "NEW",
  "MATCHED",
  "CONTACTED",
  "FULFILLED",
  "UNFULFILLED",
  "CLOSED",
] as const;

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

function serializeDate(value: Date): string {
  return value.toISOString();
}

function countByPlatform(
  rows: Array<{
    platform: string;
    _count: { _all: number };
  }>
): Record<string, number> {
  const result: Record<string, number> = {
    WHATSAPP: 0,
    PHONE: 0,
    INSTAGRAM: 0,
    TIKTOK: 0,
    FACEBOOK: 0,
    DIRECTIONS: 0,
  };

  for (const row of rows) {
    result[row.platform] = row._count._all;
  }

  return result;
}

function countProductAvailability(
  rows: Array<{
    availability: string;
    _count: { _all: number };
  }>
): Record<string, number> {
  const result: Record<string, number> = {
    AVAILABLE: 0,
    ASK_SELLER: 0,
    UNAVAILABLE: 0,
  };

  for (const row of rows) {
    result[row.availability] = row._count._all;
  }

  return result;
}

function countRequestStatuses(
  rows: Array<{
    status: string;
    _count: { _all: number };
  }>
): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(
    REQUEST_STATUSES.map((status) => [status, 0])
  );

  for (const row of rows) {
    result[row.status] = row._count._all;
  }

  return result;
}

async function countUniqueVisitors(
  businessId: string,
  period?: { from: Date; to: Date }
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

/**
 * GET /api/admin/businesses/[id]/analytics
 *
 * Optional query parameters:
 *   ?from=2026-11-01&to=2026-11-03
 *   ?from=2026-11-01T00:00:00.000Z&to=2026-11-04T00:00:00.000Z
 *
 * Date-only values use Africa/Lagos calendar days. A date-only `to` is
 * inclusive. Timestamp `to` values are exclusive instants.
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
        { error: "Business ID is required." },
        { status: 400, headers: jsonHeaders() }
      );
    }

    const url = new URL(request.url);
    const periodResult = parseAnalyticsPeriod(
      url.searchParams,
      30
    );

    if (!periodResult.valid) {
      return NextResponse.json(
        { error: periodResult.error },
        { status: 400, headers: jsonHeaders() }
      );
    }

    const { from, to } = periodResult.period;
    const periodCreatedAt = {
      gte: from,
      lt: to,
    };

    // Historical admin analytics intentionally include inactive and
    // soft-deleted businesses.
    const business = await prisma.business.findUnique({
      where: { id: businessId },
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
        { error: "Business not found." },
        { status: 404, headers: jsonHeaders() }
      );
    }

    const [
      totalViewsAllTime,
      periodViews,
      uniqueVisitorsAllTime,
      periodUniqueVisitors,
      recentViews,
      totalContactsAllTime,
      periodContacts,
      contactsByPlatformAllTimeRows,
      contactsByPlatformPeriodRows,
      recentContacts,
      totalProducts,
      activeProducts,
      inactiveProducts,
      pendingProducts,
      deletedProducts,
      productAvailabilityRows,
      totalMatchesAllTime,
      periodMatches,
      requestStatusesAllTimeRows,
      requestStatusesPeriodRows,
    ] = await Promise.all([
      prisma.businessViewEvent.count({
        where: { businessId },
      }),
      prisma.businessViewEvent.count({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
      }),
      countUniqueVisitors(businessId),
      countUniqueVisitors(businessId, { from, to }),
      prisma.businessViewEvent.findMany({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_RECENT_EVENTS,
        select: {
          id: true,
          createdAt: true,
        },
      }),
      prisma.contactEvent.count({
        where: { businessId },
      }),
      prisma.contactEvent.count({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
      }),
      prisma.contactEvent.groupBy({
        by: ["platform"],
        where: { businessId },
        _count: { _all: true },
      }),
      prisma.contactEvent.groupBy({
        by: ["platform"],
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
        _count: { _all: true },
      }),
      prisma.contactEvent.findMany({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_RECENT_EVENTS,
        select: {
          id: true,
          platform: true,
          requestId: true,
          createdAt: true,
        },
      }),
      prisma.product.count({
        where: { businessId },
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
          deletedAt: { not: null },
        },
      }),
      prisma.product.groupBy({
        by: ["availability"],
        where: {
          businessId,
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      prisma.match.count({
        where: { businessId },
      }),
      prisma.match.count({
        where: {
          businessId,
          createdAt: periodCreatedAt,
        },
      }),
      // BuyerRequest rows are unique, so this calculates distinct matched
      // requests and their CURRENT status without loading every Match row.
      prisma.buyerRequest.groupBy({
        by: ["status"],
        where: {
          matches: {
            some: { businessId },
          },
        },
        _count: { _all: true },
      }),
      prisma.buyerRequest.groupBy({
        by: ["status"],
        where: {
          matches: {
            some: {
              businessId,
              createdAt: periodCreatedAt,
            },
          },
        },
        _count: { _all: true },
      }),
    ]);

    const contactsByPlatformAllTime = countByPlatform(
      contactsByPlatformAllTimeRows
    );
    const contactsByPlatformPeriod = countByPlatform(
      contactsByPlatformPeriodRows
    );

    const allTimeMatchedRequests = requestStatusesAllTimeRows.reduce(
      (sum, row) => sum + row._count._all,
      0
    );
    const periodMatchedRequests = requestStatusesPeriodRows.reduce(
      (sum, row) => sum + row._count._all,
      0
    );

    const allTimeContactRate = totalViewsAllTime > 0
      ? Number(((totalContactsAllTime / totalViewsAllTime) * 100).toFixed(2))
      : null;
    const periodContactRate = periodViews > 0
      ? Number(((periodContacts / periodViews) * 100).toFixed(2))
      : null;

    return NextResponse.json(
      {
        business: {
          id: business.id,
          name: business.name,
          ownerName: business.ownerName,
          ownerId: business.ownerId,
          status: business.status,
          verification: business.verification,
          availability: business.availability,
          onboardedAt: serializeDate(business.onboardedAt),
          updatedAt: serializeDate(business.updatedAt),
          deletedAt: business.deletedAt
            ? serializeDate(business.deletedAt)
            : null,
          location: business.location,
          categories: business.categories.map(({ category }) => category),
        },
        period: {
          from: serializeDate(from),
          to: serializeDate(to),
          timezone: "Africa/Lagos",
          endExclusive: true,
        },
        analytics: {
          views: {
            allTime: {
              total: totalViewsAllTime,
              uniqueVisitors: uniqueVisitorsAllTime,
            },
            period: {
              total: periodViews,
              uniqueVisitors: periodUniqueVisitors,
            },
            recent: recentViews.map((event) => ({
              id: event.id,
              createdAt: serializeDate(event.createdAt),
            })),
          },
          contacts: {
            allTime: {
              total: totalContactsAllTime,
              byPlatform: contactsByPlatformAllTime,
            },
            period: {
              total: periodContacts,
              byPlatform: contactsByPlatformPeriod,
            },
            contactRatePercent: {
              allTime: allTimeContactRate,
              period: periodContactRate,
            },
            contactRateDefinition:
              "Contact clicks divided by business views, multiplied by 100. This is not a unique-buyer conversion rate and can exceed 100%.",
            recent: recentContacts.map((event) => ({
              id: event.id,
              platform: event.platform,
              requestId: event.requestId,
              createdAt: serializeDate(event.createdAt),
            })),
          },
          directions: {
            allTime: contactsByPlatformAllTime.DIRECTIONS,
            period: contactsByPlatformPeriod.DIRECTIONS,
            source:
              "Recorded ContactEvent records with platform=DIRECTIONS.",
          },
          products: {
            total: totalProducts,
            active: activeProducts,
            inactive: inactiveProducts,
            pending: pendingProducts,
            deleted: deletedProducts,
            availability: countProductAvailability(productAvailabilityRows),
            availabilityScope: "Non-deleted products, including inactive and pending products.",
          },
          matching: {
            matches: {
              allTime: totalMatchesAllTime,
              period: periodMatches,
            },
            matchedRequests: {
              allTime: allTimeMatchedRequests,
              period: periodMatchedRequests,
            },
            requestStatus: {
              allTime: countRequestStatuses(requestStatusesAllTimeRows),
              period: countRequestStatuses(requestStatusesPeriodRows),
              statusMeaning: "Current status of requests that have a match with this business in the relevant period.",
            },
          },
          search: {
            available: false,
            reason:
              "SearchEvent does not currently reference a business, so per-business search appearances cannot be calculated yet.",
          },
        },
      },
      {
        status: 200,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error("Business analytics API error:", error);

    return NextResponse.json(
      { error: "Unable to load business analytics." },
      { status: 500, headers: jsonHeaders() }
    );
  }
}
