import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";
import { parseAnalyticsPeriod } from "@/lib/analytics-period";

const REQUEST_STATUSES = [
  "NEW",
  "MATCHED",
  "CONTACTED",
  "FULFILLED",
  "UNFULFILLED",
  "CLOSED",
] as const;

const MAX_RECENT_EVENTS = 20;

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}

function percentage(
  numerator: number,
  denominator: number
): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number(((numerator / denominator) * 100).toFixed(2));
}

function countStatuses(
  rows: Array<{
    status: string;
    _count: { _all: number };
  }>
): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(
    REQUEST_STATUSES.map((status) => [status, 0])
  );

  for (const row of rows) {
    counts[row.status] = row._count._all;
  }

  return counts;
}

function countByPlatform(
  rows: Array<{
    platform: string;
    _count: { _all: number };
  }>
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

function countAvailability(
  rows: Array<{
    availability: string;
    _count: { _all: number };
  }>
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

export async function GET(request: Request) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
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
    const periodWhere = {
      gte: from,
      lt: to,
    };

    const business = await prisma.business.findUnique({
      where: {
        ownerId: auth.user.id,
      },
      select: {
        id: true,
        name: true,
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
      return NextResponse.json(
        {
          error:
            "You do not have a business linked to this seller account.",
        },
        { status: 404, headers: jsonHeaders() }
      );
    }

    if (business.deletedAt) {
      return NextResponse.json(
        { error: "This business has been deleted." },
        { status: 410, headers: jsonHeaders() }
      );
    }

    const [
      allViews,
      periodViews,
      uniqueVisitorsAllTime,
      uniqueVisitorsPeriod,
      recentViews,
      allContacts,
      periodContacts,
      contactsByPlatformAllRows,
      contactsByPlatformPeriodRows,
      recentContacts,
      productTotal,
      productActive,
      productInactive,
      productPending,
      productDeleted,
      productsByAvailability,
      matchesTotal,
      matchesPeriod,
      matchedRequestStatusesAllRows,
      matchedRequestStatusesPeriodRows,
    ] = await Promise.all([
      prisma.businessViewEvent.count({
        where: { businessId: business.id },
      }),
      prisma.businessViewEvent.count({
        where: {
          businessId: business.id,
          createdAt: periodWhere,
        },
      }),
      countUniqueVisitors(business.id),
      countUniqueVisitors(business.id, { from, to }),
      prisma.businessViewEvent.findMany({
        where: {
          businessId: business.id,
          createdAt: periodWhere,
        },
        select: {
          id: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_RECENT_EVENTS,
      }),
      prisma.contactEvent.count({
        where: { businessId: business.id },
      }),
      prisma.contactEvent.count({
        where: {
          businessId: business.id,
          createdAt: periodWhere,
        },
      }),
      prisma.contactEvent.groupBy({
        by: ["platform"],
        where: { businessId: business.id },
        _count: { _all: true },
      }),
      prisma.contactEvent.groupBy({
        by: ["platform"],
        where: {
          businessId: business.id,
          createdAt: periodWhere,
        },
        _count: { _all: true },
      }),
      prisma.contactEvent.findMany({
        where: {
          businessId: business.id,
          createdAt: periodWhere,
        },
        select: {
          id: true,
          platform: true,
          requestId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: MAX_RECENT_EVENTS,
      }),
      // Preserve the existing seller API meaning: total excludes soft-deleted products.
      prisma.product.count({
        where: {
          businessId: business.id,
          deletedAt: null,
        },
      }),
      prisma.product.count({
        where: {
          businessId: business.id,
          status: "ACTIVE",
          deletedAt: null,
        },
      }),
      prisma.product.count({
        where: {
          businessId: business.id,
          status: "INACTIVE",
          deletedAt: null,
        },
      }),
      prisma.product.count({
        where: {
          businessId: business.id,
          status: "PENDING",
          deletedAt: null,
        },
      }),
      prisma.product.count({
        where: {
          businessId: business.id,
          deletedAt: { not: null },
        },
      }),
      prisma.product.groupBy({
        by: ["availability"],
        where: {
          businessId: business.id,
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      prisma.match.count({
        where: { businessId: business.id },
      }),
      prisma.match.count({
        where: {
          businessId: business.id,
          createdAt: periodWhere,
        },
      }),
      // Grouping BuyerRequest records counts distinct matched requests.
      // Statuses are current statuses, not historical snapshots.
      prisma.buyerRequest.groupBy({
        by: ["status"],
        where: {
          matches: {
            some: { businessId: business.id },
          },
        },
        _count: { _all: true },
      }),
      prisma.buyerRequest.groupBy({
        by: ["status"],
        where: {
          matches: {
            some: {
              businessId: business.id,
              createdAt: periodWhere,
            },
          },
        },
        _count: { _all: true },
      }),
    ]);

    const contactsByPlatformAll = countByPlatform(
      contactsByPlatformAllRows
    );
    const contactsByPlatformPeriod = countByPlatform(
      contactsByPlatformPeriodRows
    );
    const availabilityCounts = countAvailability(
      productsByAvailability
    );

    const matchedRequestsAllTime = matchedRequestStatusesAllRows.reduce(
      (sum, row) => sum + row._count._all,
      0
    );
    const matchedRequestsPeriod = matchedRequestStatusesPeriodRows.reduce(
      (sum, row) => sum + row._count._all,
      0
    );

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
        period: {
          from: from.toISOString(),
          to: to.toISOString(),
          timezone: "Africa/Lagos",
          endExclusive: true,
          days: Math.max(
            1,
            Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
          ),
        },
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
          allTimeContactRate: percentage(allContacts, allViews),
          periodContactRate: percentage(periodContacts, periodViews),
          contactRateDefinition:
            "Contact clicks per 100 business views. This is not a unique-buyer conversion rate and can exceed 100%.",
          directionsAllTime: contactsByPlatformAll.DIRECTIONS,
          directionsPeriod: contactsByPlatformPeriod.DIRECTIONS,
        },
        products: {
          total: productTotal,
          active: productActive,
          inactive: productInactive,
          pending: productPending,
          deleted: productDeleted,
          availability: availabilityCounts,
          totalDefinition: "Non-deleted products only; deleted is reported separately.",
          availabilityScope: "Non-deleted products, including inactive and pending products.",
        },
        matches: {
          total: matchesTotal,
          period: matchesPeriod,
          matchedRequestsAllTime,
          matchedRequestsPeriod,
          requestStatusesAllTime: countStatuses(matchedRequestStatusesAllRows),
          requestStatusesPeriod: countStatuses(matchedRequestStatusesPeriodRows),
          statusMeaning: "Current status of matched requests, not a historical status snapshot.",
        },
        search: {
          available: false,
          reason: "SearchEvent does not currently reference a business.",
        },
      },
      { headers: jsonHeaders() }
    );
  } catch (error) {
    console.error("Seller analytics GET error:", error);

    return NextResponse.json(
      { error: "Unable to load seller analytics." },
      { status: 500, headers: jsonHeaders() }
    );
  }
}
