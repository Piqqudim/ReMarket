import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getNigeriaTodayPeriod,
  parseAnalyticsPeriod,
  type AnalyticsPeriod,
} from "@/lib/analytics-period";

const PLATFORMS = [
  "WHATSAPP",
  "PHONE",
  "INSTAGRAM",
  "TIKTOK",
  "FACEBOOK",
  "DIRECTIONS",
] as const;

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}

function getReportingPeriod(
  searchParams: URLSearchParams
): {
  period: AnalyticsPeriod | null;
  label: string;
  error?: string;
} {
  const requestedPeriod = searchParams.get("period")?.trim().toLowerCase();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const hasCustomRange = from !== null || to !== null;

  if (hasCustomRange) {
    if (
      requestedPeriod &&
      requestedPeriod !== "custom"
    ) {
      return {
        period: null,
        label: "custom",
        error: "Use either a preset period or a custom from/to range, not both.",
      };
    }

    if (from === null || to === null) {
      return {
        period: null,
        label: "custom",
        error: "Both 'from' and 'to' are required for a custom date range.",
      };
    }

    const customParams = new URLSearchParams({ from, to });
    const result = parseAnalyticsPeriod(customParams, 30);

    if (!result.valid) {
      return {
        period: null,
        label: "custom",
        error: result.error,
      };
    }

    return {
      period: result.period,
      label: "custom",
    };
  }

  const label = requestedPeriod || "all";
  const now = new Date();

  switch (label) {
    case "all":
      return { period: null, label: "all" };

    case "today":
      return {
        period: getNigeriaTodayPeriod(now),
        label,
      };

    case "7d":
      return {
        period: {
          from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          to: now,
        },
        label,
      };

    case "30d":
      return {
        period: {
          from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          to: now,
        },
        label,
      };

    default:
      return {
        period: null,
        label,
        error: "Invalid period. Use all, today, 7d, 30d, or a custom from/to range.",
      };
  }
}

export async function GET(request: Request) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const reporting = getReportingPeriod(url.searchParams);

    if (reporting.error) {
      return NextResponse.json(
        { error: reporting.error },
        { status: 400, headers: jsonHeaders() }
      );
    }

    const eventWhere = reporting.period
      ? {
          createdAt: {
            gte: reporting.period.from,
            lt: reporting.period.to,
          },
        }
      : {};

    const [
      total,
      platformRows,
      topBusinesses,
    ] = await Promise.all([
      prisma.contactEvent.count({
        where: eventWhere,
      }),
      prisma.contactEvent.groupBy({
        by: ["platform"],
        where: eventWhere,
        _count: { _all: true },
      }),
      prisma.contactEvent.groupBy({
        by: ["businessId"],
        where: eventWhere,
        _count: { businessId: true },
        orderBy: {
          _count: {
            businessId: "desc",
          },
        },
        take: 10,
      }),
    ]);

    const byPlatform: Record<string, number> = Object.fromEntries(
      PLATFORMS.map((platform) => [platform, 0])
    );

    for (const row of platformRows) {
      byPlatform[row.platform] = row._count._all;
    }

    const businessIds = topBusinesses.map((item) => item.businessId);

    // Keep historical rows visible even when the business is inactive or deleted.
    const businesses = businessIds.length > 0
      ? await prisma.business.findMany({
          where: {
            id: { in: businessIds },
          },
          select: {
            id: true,
            name: true,
            location: {
              select: {
                area: true,
              },
            },
          },
        })
      : [];

    const businessMap = new Map(
      businesses.map((business) => [business.id, business])
    );

    return NextResponse.json(
      {
        total,
        byPlatform,
        topBusinesses: topBusinesses.map((item) => {
          const business = businessMap.get(item.businessId);

          return {
            businessId: item.businessId,
            businessName: business?.name ?? "Unknown business",
            area: business?.location?.area ?? null,
            contacts: item._count.businessId,
          };
        }),
        period: {
          type: reporting.label,
          from: reporting.period?.from.toISOString() ?? null,
          to: reporting.period?.to.toISOString() ?? null,
          timezone: "Africa/Lagos",
          endExclusive: true,
        },
      },
      { headers: jsonHeaders() }
    );
  } catch (error) {
    console.error("Admin contact events error:", error);

    return NextResponse.json(
      { error: "Unable to load contact analytics." },
      { status: 500, headers: jsonHeaders() }
    );
  }
}
