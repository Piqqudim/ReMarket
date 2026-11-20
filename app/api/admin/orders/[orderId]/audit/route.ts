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

const AUDIT_ENTITY_TYPE = "ORDER";

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
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

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return null;
  }

  return parsed;
}

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

/**
 * GET /api/admin/orders/[orderId]/audit
 *
 * Returns the administrative audit history attached directly to a
 * parent order. This endpoint is read-only; it never creates or changes
 * audit records.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { orderId: rawOrderId } = await context.params;
    const orderId = typeof rawOrderId === "string" ? rawOrderId.trim() : "";

    if (!orderId || orderId.length > MAX_ORDER_ID_LENGTH) {
      return jsonError("Invalid order reference.", 400);
    }

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
      return jsonError("The requested page is too large.", 400);
    }

    // Verify the parent order first so an unknown order is not confused
    // with a valid order that simply has no audit records yet.
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderCode: true,
        status: true,
        createdAt: true,
      },
    });

    if (!order) {
      return jsonError("Order not found.", 404);
    }

    const where = {
      entityType: AUDIT_ENTITY_TYPE,
      entityId: order.id,
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
    console.error("ADMIN_ORDER_AUDIT_HISTORY_ERROR:", error);
    return jsonError(
      "Unable to retrieve this order's audit history.",
      500,
    );
  }
}
