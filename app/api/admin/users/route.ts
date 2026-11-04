import { NextRequest, NextResponse } from "next/server";
import { Role, Prisma } from "@prisma/client";
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
    const roleParam = params.get("role")?.trim().toUpperCase() ?? "";

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

    const validRoles = Object.values(Role);

    if (roleParam && !validRoles.includes(roleParam as Role)) {
      return NextResponse.json(
        {
          error: "Invalid account role.",
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

    const baseWhere: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
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

    const where: Prisma.UserWhereInput = {
      ...baseWhere,
      ...(roleParam ? { role: roleParam as Role } : {}),
    };

    const [users, total, roleSummary] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),

      prisma.user.count({
        where,
      }),

      prisma.user.groupBy({
        by: ["role"],
        where: baseWhere,
        _count: {
          _all: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        success: true,

        filters: {
          search: search || null,
          role: roleParam || null,
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
        },

        summary: {
          totalMatchingAccounts: total,
          byRole: roleSummary.map((item) => ({
            role: item.role,
            count: item._count._all,
          })),
        },

        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },

        users,
        generatedAt: new Date(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Admin users GET error:", error);

    return NextResponse.json(
      { error: "Failed to retrieve user accounts." },
      { status: 500 }
    );
  }
}