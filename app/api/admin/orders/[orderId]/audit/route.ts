
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;
const MAX_ORDER_ID_LENGTH = 100;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: noStore,
    },
  );
}

/* =========================================================
   PAGINATION VALIDATION
========================================================= */

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number | null {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

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

/* =========================================================
   ROUTE CONTEXT
========================================================= */

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

/* =========================================================
   GET ORDER AUDIT HISTORY

   GET /api/admin/orders/[orderId]/audit

   Query parameters:
   - page: page number, defaults to 1
   - pageSize: records per page, defaults to 25

   Only authenticated Admin users may retrieve audit history.
========================================================= */

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    /*
     * 1. ADMIN AUTHENTICATION
     */

    const auth = await requireAdmin();

    if (!auth.authorized) {
      return auth.response;
    }

    /*
     * 2. VALIDATE ORDER ID
     */

    const { orderId } = await context.params;

    if (
      typeof orderId !== "string" ||
      !orderId.trim() ||
      orderId.trim().length > MAX_ORDER_ID_LENGTH
    ) {
      return jsonError(
        "Invalid order reference.",
        400,
      );
    }

    const validatedOrderId = orderId.trim();

    /*
     * 3. VALIDATE PAGINATION
     */

    const searchParams = new URL(request.url).searchParams;

    const page = parsePositiveInteger(
      searchParams.get("page"),
      1,
      MAX_PAGE,
    );

    const pageSize = parsePositiveInteger(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    if (page === null || pageSize === null) {
      return jsonError(
        "Invalid pagination. Page must be positive and pageSize must be between 1 and 100.",
        400,
      );
    }

    const skip = (page - 1) * pageSize;

    if (!Number.isSafeInteger(skip)) {
      return jsonError(
        "The requested page is too large.",
        400,
      );
    }

    /*
     * 4. VERIFY THAT THE ORDER EXISTS
     */

    const order = await prisma.order.findUnique({
      where: {
        id: validatedOrderId,
      },

      select: {
        id: true,
        orderCode: true,
        status: true,
        createdAt: true,
      },
    });

    if (!order) {
      return jsonError(
        "Order not found.",
        404,
      );
    }

    /*
     * 5. BUILD AUDIT HISTORY FILTER
     *
     * The entityType and entityId combination identifies
     * audit entries belonging to this parent order.
     */

    const where = {
      entityType: "ORDER",
      entityId: order.id,
    };

    /*
     * 6. RETRIEVE AUDIT ENTRIES AND TOTAL COUNT
     */

    const [entries, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
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

      prisma.adminAuditLog.count({
        where,
      }),
    ]);

    /*
     * 7. PAGINATION METADATA
     */

    const totalPages = Math.ceil(total / pageSize);

    /*
     * 8. SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        success: true,

        order,

        entries,

        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPages,
        },

        generatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error(
      "ADMIN_ORDER_AUDIT_HISTORY_ERROR:",
      error,
    );

    return jsonError(
      "Unable to retrieve this order's audit history.",
      500,
    );
  }
}
