import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";

const REQUEST_STATUSES = [
  "NEW",
  "MATCHED",
  "CONTACTED",
  "FULFILLED",
  "UNFULFILLED",
  "CLOSED",
] as const;

type RequestStatus =
  (typeof REQUEST_STATUSES)[number];

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}

function parseDate(
  value: string | null,
  endOfDay: boolean
): Date | null {
  if (!value) {
    return null;
  }

  const trimmed =
    value.trim();

  if (!trimmed) {
    return null;
  }

  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(
      trimmed
    )
      ? new Date(
          `${trimmed}T${
            endOfDay
              ? "23:59:59.999"
              : "00:00:00.000"
          }Z`
        )
      : new Date(trimmed);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

function startOfDefaultPeriod(
  end: Date
): Date {
  return new Date(
    end.getTime() -
      30 * 24 * 60 * 60 * 1000
  );
}

function incrementMap(
  map: Record<string, number>,
  key: string
) {
  map[key] =
    (map[key] ?? 0) + 1;
}

function countStatuses(
  rows: { status: string }[]
) {
  const counts: Record<
    string,
    number
  > = {};

  for (const status of REQUEST_STATUSES) {
    counts[status] = 0;
  }

  for (const row of rows) {
    incrementMap(
      counts,
      row.status
    );
  }

  return counts;
}

function percentage(
  numerator: number,
  denominator: number
): number {
  if (
    denominator <= 0
  ) {
    return 0;
  }

  return Number(
    (
      (numerator /
        denominator) *
      100
    ).toFixed(2)
  );
}

export async function GET(
  request: Request
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const url =
      new URL(request.url);

    const fromParam =
      url.searchParams.get(
        "from"
      );

    const toParam =
      url.searchParams.get(
        "to"
      );

    const parsedTo =
      parseDate(
        toParam,
        true
      );

    if (
      toParam &&
      !parsedTo
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid 'to' date.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const to =
      parsedTo ?? new Date();

    const parsedFrom =
      parseDate(
        fromParam,
        false
      );

    if (
      fromParam &&
      !parsedFrom
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid 'from' date.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const from =
      parsedFrom ??
      startOfDefaultPeriod(to);

    if (
      from.getTime() >
      to.getTime()
    ) {
      return NextResponse.json(
        {
          error:
            "'from' date cannot be after 'to' date.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const periodWhere = {
      gte: from,
      lte: to,
    };

    const business =
      await prisma.business.findUnique({
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
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    if (business.deletedAt) {
      return NextResponse.json(
        {
          error:
            "This business has been deleted.",
        },
        {
          status: 410,
          headers: jsonHeaders(),
        }
      );
    }

    const [
      allViews,
      periodViews,
      uniqueVisitorsAllRows,
      uniqueVisitorsPeriodRows,

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
      matchedRequestsAll,
      matchedRequestsPeriod,
    ] = await Promise.all([
      prisma.businessViewEvent.count({
        where: {
          businessId:
            business.id,
        },
      }),

      prisma.businessViewEvent.count({
        where: {
          businessId:
            business.id,

          createdAt:
            periodWhere,
        },
      }),

      prisma.businessViewEvent.findMany({
        where: {
          businessId:
            business.id,
        },

        select: {
          visitorId: true,
        },

        distinct: [
          "visitorId",
        ],
      }),

      prisma.businessViewEvent.findMany({
        where: {
          businessId:
            business.id,

          createdAt:
            periodWhere,
        },

        select: {
          visitorId: true,
        },

        distinct: [
          "visitorId",
        ],
      }),

      prisma.businessViewEvent.findMany({
        where: {
          businessId:
            business.id,
        },

        select: {
          id: true,
          visitorId: true,
          createdAt: true,
        },

        orderBy: {
          createdAt: "desc",
        },

        take: 20,
      }),

      prisma.contactEvent.count({
        where: {
          businessId:
            business.id,
        },
      }),

      prisma.contactEvent.count({
        where: {
          businessId:
            business.id,

          createdAt:
            periodWhere,
        },
      }),

      prisma.contactEvent.groupBy({
        by: ["platform"],

        where: {
          businessId:
            business.id,
        },

        _count: {
          _all: true,
        },
      }),

      prisma.contactEvent.groupBy({
        by: ["platform"],

        where: {
          businessId:
            business.id,

          createdAt:
            periodWhere,
        },

        _count: {
          _all: true,
        },
      }),

      prisma.contactEvent.findMany({
        where: {
          businessId:
            business.id,
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

        take: 20,
      }),

      prisma.product.count({
        where: {
          businessId:
            business.id,
          deletedAt: null,
        },
      }),

      prisma.product.count({
        where: {
          businessId:
            business.id,
          status: "ACTIVE",
          deletedAt: null,
        },
      }),

      prisma.product.count({
        where: {
          businessId:
            business.id,
          status: "INACTIVE",
          deletedAt: null,
        },
      }),

      prisma.product.count({
        where: {
          businessId:
            business.id,
          status: "PENDING",
          deletedAt: null,
        },
      }),

      prisma.product.count({
        where: {
          businessId:
            business.id,
          deletedAt: {
            not: null,
          },
        },
      }),

      prisma.product.groupBy({
        by: ["availability"],

        where: {
          businessId:
            business.id,

          deletedAt: null,
        },

        _count: {
          _all: true,
        },
      }),

      prisma.match.count({
        where: {
          businessId:
            business.id,
        },
      }),

      prisma.match.count({
        where: {
          businessId:
            business.id,

          createdAt:
            periodWhere,
        },
      }),

      prisma.buyerRequest.findMany({
        where: {
          matches: {
            some: {
              businessId:
                business.id,
            },
          },
        },

        select: {
          status: true,
        },
      }),

      prisma.buyerRequest.findMany({
        where: {
          matches: {
            some: {
              businessId:
                business.id,

              createdAt:
                periodWhere,
            },
          },
        },

        select: {
          status: true,
        },
      }),
    ]);

    const contactsByPlatformAll: Record<
      string,
      number
    > = {};

    for (const row of contactsByPlatformAllRows) {
      contactsByPlatformAll[
        row.platform
      ] =
        row._count._all;
    }

    const contactsByPlatformPeriod: Record<
      string,
      number
    > = {};

    for (
      const row of contactsByPlatformPeriodRows
    ) {
      contactsByPlatformPeriod[
        row.platform
      ] =
        row._count._all;
    }

    const availabilityCounts: Record<
      string,
      number
    > = {};

    for (
      const row of productsByAvailability
    ) {
      availabilityCounts[
        row.availability
      ] =
        row._count._all;
    }

    return NextResponse.json(
      {
        business: {
          id: business.id,
          name: business.name,
          ownerName:
            business.ownerName,
          status:
            business.status,
          verification:
            business.verification,
          availability:
            business.availability,
          location:
            business.location,
          categories:
            business.categories,
        },

        period: {
          from:
            from.toISOString(),
          to:
            to.toISOString(),
          days: Math.max(
            1,
            Math.ceil(
              (to.getTime() -
                from.getTime()) /
                (24 *
                  60 *
                  60 *
                  1000)
            )
          ),
        },

        views: {
          allTime: allViews,
          period: periodViews,

          uniqueVisitorsAllTime:
            uniqueVisitorsAllRows.length,

          uniqueVisitorsPeriod:
            uniqueVisitorsPeriodRows.length,

          recent:
            recentViews.map(
              (view) => ({
                id: view.id,
                visitorId:
                  view.visitorId,
                createdAt:
                  view.createdAt.toISOString(),
              })
            ),
        },

        contacts: {
          allTime: allContacts,
          period: periodContacts,

          allTimeByPlatform:
            contactsByPlatformAll,

          periodByPlatform:
            contactsByPlatformPeriod,

          recent:
            recentContacts.map(
              (contact) => ({
                id: contact.id,
                platform:
                  contact.platform,
                requestId:
                  contact.requestId,
                createdAt:
                  contact.createdAt.toISOString(),
              })
            ),

          allTimeContactRate:
            percentage(
              allContacts,
              allViews
            ),

          periodContactRate:
            percentage(
              periodContacts,
              periodViews
            ),

          directionsAllTime:
            contactsByPlatformAll[
              "DIRECTIONS"
            ] ?? 0,

          directionsPeriod:
            contactsByPlatformPeriod[
              "DIRECTIONS"
            ] ?? 0,
        },

        products: {
          total:
            productTotal,

          active:
            productActive,

          inactive:
            productInactive,

          pending:
            productPending,

          deleted:
            productDeleted,

          availability:
            availabilityCounts,
        },

        matches: {
          total:
            matchesTotal,

          period:
            matchesPeriod,

          matchedRequestsAllTime:
            matchedRequestsAll.length,

          matchedRequestsPeriod:
            matchedRequestsPeriod.length,

          requestStatusesAllTime:
            countStatuses(
              matchedRequestsAll
            ),

          requestStatusesPeriod:
            countStatuses(
              matchedRequestsPeriod
            ),
        },

        search: {
          available: false,

          reason:
            "SearchEvent does not currently reference a business.",
        },
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller analytics GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load seller analytics.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}