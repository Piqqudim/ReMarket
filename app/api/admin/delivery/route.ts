import { Prisma, ShipmentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;
const MAX_QUERY_LENGTH = 100;
const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status, headers: noStore });
}

function parsePositiveInteger(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function isShipmentStatus(value: string): value is ShipmentStatus {
  return Object.values(ShipmentStatus).includes(value as ShipmentStatus);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const params = request.nextUrl.searchParams;
    const page = parsePositiveInteger(params.get("page"), 1, MAX_PAGE);
    const pageSize = parsePositiveInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    if (page === null || pageSize === null) {
      return jsonError("Invalid pagination. Page must be positive and pageSize must be between 1 and 100.", 400);
    }

    const skip = (page - 1) * pageSize;
    if (!Number.isSafeInteger(skip)) return jsonError("The requested page is too large.", 400);

    const q = params.get("q")?.trim() ?? "";
    const statusParam = params.get("status")?.trim() ?? "";
    if (q.length > MAX_QUERY_LENGTH) return jsonError("Search query must not exceed 100 characters.", 400);
    if (statusParam && !isShipmentStatus(statusParam)) return jsonError("Invalid shipment status.", 400);

    const where: Prisma.ShipmentWhereInput = {
      ...(statusParam ? { status: statusParam as ShipmentStatus } : {}),
      ...(q ? {
        OR: [
          { providerOrderId: { contains: q, mode: "insensitive" } },
          { trackingCode: { contains: q, mode: "insensitive" } },
          { courierName: { contains: q, mode: "insensitive" } },
          { sellerOrder: { is: { sellerOrderCode: { contains: q, mode: "insensitive" } } } },
          { sellerOrder: { is: { business: { is: { name: { contains: q, mode: "insensitive" } } } } } },
          { sellerOrder: { is: { seller: { is: { email: { contains: q, mode: "insensitive" } } } } } },
          { sellerOrder: { is: { order: { is: { orderCode: { contains: q, mode: "insensitive" } } } } } },
        ],
      } : {}),
    };

    const [shipments, total, statusRows] = await Promise.all([
      prisma.shipment.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        select: {
          id: true,
          provider: true,
          providerOrderId: true,
          courierId: true,
          courierName: true,
          trackingCode: true,
          trackingUrl: true,
          waybillUrl: true,
          status: true,
          shippingFee: true,
          currency: true,
          estimatedDelivery: true,
          failureReason: true,
          bookedAt: true,
          pickedUpAt: true,
          inTransitAt: true,
          deliveredAt: true,
          cancelledAt: true,
          createdAt: true,
          updatedAt: true,
          sellerOrder: {
            select: {
              id: true,
              sellerOrderCode: true,
              status: true,
              seller: { select: { id: true, name: true, email: true } },
              business: { select: { id: true, name: true } },
              order: {
                select: {
                  id: true,
                  orderCode: true,
                  status: true,
                  deliveryRecipient: true,
                  deliveryPhone: true,
                  deliveryAddress: true,
                  deliveryArea: true,
                },
              },
            },
          },
          quotePackage: {
            select: {
              packageWeightKg: true,
              packageLengthCm: true,
              packageWidthCm: true,
              packageHeightCm: true,
              selectedCourierName: true,
              selectedDeliveryFee: true,
              selectedDeliveryEta: true,
            },
          },
          trackingEvents: {
            orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
            take: 5,
            select: {
              id: true,
              status: true,
              statusLabel: true,
              message: true,
              location: true,
              occurredAt: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.shipment.count({ where }),
      prisma.shipment.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const statusCounts = Object.fromEntries(
      Object.values(ShipmentStatus).map((value) => [value, 0]),
    ) as Record<ShipmentStatus, number>;
    for (const row of statusRows) statusCounts[row.status] = row._count._all;

    return NextResponse.json({
      success: true,
      shipments,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasPreviousPage: page > 1,
        hasNextPage: page * pageSize < total,
      },
      statusCounts,
      generatedAt: new Date().toISOString(),
    }, { headers: noStore });
  } catch (error) {
    console.error("ADMIN_DELIVERY_GET_ERROR:", error);
    return jsonError("Unable to load delivery records.", 500);
  }
}
