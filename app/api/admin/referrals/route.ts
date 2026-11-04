import { NextRequest, NextResponse } from "next/server";
import { Prisma, ReferralStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function parseDate(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    if (admin instanceof NextResponse) {
      return admin;
    }

    const params = request.nextUrl.searchParams;

    const search = params.get("q")?.trim() ?? "";
    const statusParam = params.get("status")?.trim().toUpperCase() ?? "";
    const referrerRoleParam =
      params.get("referrerRole")?.trim().toUpperCase() ?? "";
    const referredRoleParam =
      params.get("referredRole")?.trim().toUpperCase() ?? "";

    const page = Math.max(
      1,
      Number.parseInt(params.get("page") ?? "1", 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(params.get("limit") ?? "20", 10) || 20
      )
    );

    const skip = (page - 1) * limit;

    const fromParam = params.get("from");
    const toParam = params.get("to");

    const validStatuses = Object.values(ReferralStatus);
    const validRoles = Object.values(Role);

    if (
      statusParam &&
      !validStatuses.includes(statusParam as ReferralStatus)
    ) {
      return NextResponse.json(
        {
          error: "Invalid referral status.",
          validStatuses,
        },
        { status: 400 }
      );
    }

    if (
      referrerRoleParam &&
      !validRoles.includes(referrerRoleParam as Role)
    ) {
      return NextResponse.json(
        {
          error: "Invalid referrer role.",
          validRoles,
        },
        { status: 400 }
      );
    }

    if (
      referredRoleParam &&
      !validRoles.includes(referredRoleParam as Role)
    ) {
      return NextResponse.json(
        {
          error: "Invalid referred user role.",
          validRoles,
        },
        { status: 400 }
      );
    }

    const from = parseDate(fromParam);
    const to = parseDate(toParam, true);

    if (fromParam && !from) {
      return NextResponse.json(
        { error: "Invalid 'from' date." },
        { status: 400 }
      );
    }

    if (toParam && !to) {
      return NextResponse.json(
        { error: "Invalid 'to' date." },
        { status: 400 }
      );
    }

    if (from && to && from > to) {
      return NextResponse.json(
        { error: "'from' date cannot be later than 'to' date." },
        { status: 400 }
      );
    }

    const baseWhere: Prisma.ReferralWhereInput = {
      ...(search
        ? {
            OR: [
              {
                id: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                referrer: {
                  is: {
                    name: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                },
              },
              {
                referrer: {
                  is: {
                    email: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                },
              },
              {
                referredUser: {
                  is: {
                    name: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                },
              },
              {
                referredUser: {
                  is: {
                    email: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                },
              },
            ],
          }
        : {}),

      ...(referrerRoleParam
        ? { referrerRole: referrerRoleParam as Role }
        : {}),

      ...(referredRoleParam
        ? { referredRole: referredRoleParam as Role }
        : {}),

      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const where: Prisma.ReferralWhereInput = {
      ...baseWhere,
      ...(statusParam
        ? { status: statusParam as ReferralStatus }
        : {}),
    };

    const [
      referrals,
      total,
      statusSummary,
      rewardSummary,
      totalRewards,
    ] = await Promise.all([
      prisma.referral.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        select: {
          id: true,
          referrerId: true,
          referredUserId: true,
          referrerRole: true,
          referredRole: true,
          status: true,
          qualifiedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          createdAt: true,
          updatedAt: true,

          referrer: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },

          referredUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },

          rewards: {
            select: {
              id: true,
              type: true,
              status: true,
              quantity: true,
              milestone: true,
              grantedAt: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      }),

      prisma.referral.count({
        where,
      }),

      prisma.referral.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: {
          _all: true,
        },
      }),

      prisma.referralReward.groupBy({
        by: ["type", "status"],
        _count: {
          _all: true,
        },
        _sum: {
          quantity: true,
        },
      }),

      prisma.referralReward.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        success: true,

        filters: {
          search: search || null,
          status: statusParam || null,
          referrerRole: referrerRoleParam || null,
          referredRole: referredRoleParam || null,
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
        },

        summary: {
          totalMatchingReferrals: total,

          byStatus: statusSummary.map((item) => ({
            status: item.status,
            count: item._count._all,
          })),

          rewards: {
            total: totalRewards,
            byTypeAndStatus: rewardSummary.map((item) => ({
              type: item.type,
              status: item.status,
              count: item._count._all,
              totalQuantity: item._sum.quantity ?? 0,
            })),
          },
        },

        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },

        referrals,
        generatedAt: new Date(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Admin referrals GET error:", error);

    return NextResponse.json(
      { error: "Failed to retrieve referral records." },
      { status: 500 }
    );
  }
}