import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    {
      status,
      headers: noStore,
    },
  );
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number | null {
  if (value === null) return fallback;

  if (!/^\d+$/.test(value.trim())) return null;

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    return null;
  }

  return parsed;
}

function parseFilter(
  value: string | null,
  maximumLength: number,
): string | null | undefined {
  if (value === null) return undefined;

  const trimmed = value.trim();

  if (!trimmed) return undefined;
  if (trimmed.length > maximumLength) return null;

  return trimmed;
}

function parseDate(
  value: string | null,
  endOfDay = false,
): Date | null | undefined {
  if (value === null || !value.trim()) return undefined;

  const input = value.trim();

  if (input.length > 40) return null;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(input);
  const parsed = new Date(input);

  if (Number.isNaN(parsed.getTime())) return null;

  if (dateOnly && endOfDay) {
    parsed.setUTCHours(23, 59, 59, 999);
  }

  return parsed;
}

/*
 * GET /api/admin/audit-logs
 *
 * Query parameters:
 * page       - page number
 * pageSize   - records per page
 * search     - search across action, entity, reason and Admin
 * action     - exact action filter
 * entityType - exact entity type filter
 * entityId   - exact entity ID filter
 * adminId    - Admin actor ID filter
 * from       - starting date
 * to         - ending date
 */

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();

    if (!auth.authorized) {
      return auth.response;
    }

    const params = new URL(request.url).searchParams;

    const page = parsePositiveInteger(
      params.get("page"),
      1,
      MAX_PAGE,
    );

    const pageSize = parsePositiveInteger(
      params.get("pageSize"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    if (page === null || pageSize === null) {
      return jsonError("Invalid pagination parameters.", 400);
    }

    const skip = (page - 1) * pageSize;

    if (!Number.isSafeInteger(skip)) {
      return jsonError("The requested page is too large.", 400);
    }

    const search = parseFilter(params.get("search"), 200);
    const action = parseFilter(params.get("action"), 100);
    const entityType = parseFilter(params.get("entityType"), 50);
    const entityId = parseFilter(params.get("entityId"), 100);
    const adminId = parseFilter(params.get("adminId"), 100);

    if (
      search === null ||
      action === null ||
      entityType === null ||
      entityId === null ||
      adminId === null
    ) {
      return jsonError("One or more filters are too long.", 400);
    }

    const from = parseDate(params.get("from"));
    const to = parseDate(params.get("to"), true);

    if (from === null || to === null) {
      return jsonError("Invalid date filter.", 400);
    }

    if (from && to && from > to) {
      return jsonError(
        "The starting date cannot be later than the ending date.",
        400,
      );
    }

    const where = {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(adminId ? { adminId } : {}),

      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),

      ...(search
        ? {
            OR: [
              {
                action: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                entityType: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                entityId: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                reason: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                admin: {
                  is: {
                    OR: [
                      {
                        name: {
                          contains: search,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        email: {
                          contains: search,
                          mode: "insensitive" as const,
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          reason: true,
          beforeData: true,
          afterData: true,
          metadata: true,
          createdAt: true,
          admin: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),

      prisma.adminAuditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json(
      {
        success: true,
        entries,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPages,
        },
        filters: {
          search: search ?? "",
          action: action ?? "",
          entityType: entityType ?? "",
          entityId: entityId ?? "",
          adminId: adminId ?? "",
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
        },
        generatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error("ADMIN_AUDIT_LOGS_ERROR:", error);

    return jsonError(
      "Unable to retrieve Admin audit logs.",
      500,
    );
  }
}