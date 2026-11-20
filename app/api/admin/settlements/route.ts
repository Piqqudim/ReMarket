import { SellerSettlementStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
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

function isSettlementStatus(value: string): value is SellerSettlementStatus {
  return Object.values(SellerSettlementStatus).includes(value as SellerSettlementStatus);
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
    if (statusParam && !isSettlementStatus(statusParam)) return jsonError("Invalid settlement status.", 400);

    const status = statusParam ? statusParam as SellerSettlementStatus : undefined;
    const where: Prisma.SellerSettlementWhereInput = {
      ...(status ? { status } : {}),
      ...(q ? {
        OR: [
          { sellerOrder: { is: { sellerOrderCode: { contains: q, mode: "insensitive" } } } },
          { sellerOrder: { is: { order: { is: { orderCode: { contains: q, mode: "insensitive" } } } } } },
          { seller: { is: { name: { contains: q, mode: "insensitive" } } } },
          { seller: { is: { email: { contains: q, mode: "insensitive" } } } },
          { payout: { is: { reference: { contains: q, mode: "insensitive" } } } },
        ],
      } : {}),
    };

    const [settlements, total, statusRows] = await Promise.all([
      prisma.sellerSettlement.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        select: {
          id: true,
          sellerOrderId: true,
          sellerId: true,
          grossSalesAmount: true,
          commissionRateBps: true,
          commissionAmount: true,
          adjustmentAmount: true,
          netPayoutAmount: true,
          currency: true,
          status: true,
          deliveryConfirmedAt: true,
          paidAt: true,
          failureReason: true,
          createdAt: true,
          updatedAt: true,
          seller: { select: { id: true, name: true, email: true } },
          sellerOrder: {
            select: {
              id: true,
              sellerOrderCode: true,
              status: true,
              subtotal: true,
              business: { select: { id: true, name: true } },
              order: { select: { id: true, orderCode: true, status: true, paidAt: true } },
            },
          },
          payout: {
            select: {
              id: true,
              provider: true,
              reference: true,
              providerTransferCode: true,
              amount: true,
              currency: true,
              status: true,
              attemptCount: true,
              lastAttemptAt: true,
              nextAttemptAt: true,
              submittedAt: true,
              paidAt: true,
              reversedAt: true,
              failureReason: true,
              payoutAccount: {
                select: {
                  bankName: true,
                  accountName: true,
                  accountNumberLast4: true,
                },
              },
              attempts: {
                orderBy: { attemptNumber: "desc" },
                take: 3,
                select: {
                  attemptNumber: true,
                  reference: true,
                  providerTransferCode: true,
                  status: true,
                  failureReason: true,
                  submittedAt: true,
                  paidAt: true,
                  reversedAt: true,
                },
              },
            },
          },
        },
      }),
      prisma.sellerSettlement.count({ where }),
      prisma.sellerSettlement.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      Object.values(SellerSettlementStatus).map((value) => [value, 0]),
    ) as Record<SellerSettlementStatus, number>;
    for (const row of statusRows) statusCounts[row.status] = row._count._all;

    return NextResponse.json({
      success: true,
      settlements,
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
    console.error("ADMIN_SELLER_SETTLEMENTS_GET_ERROR:", error);
    return jsonError("Unable to load seller settlements.", 500);
  }
}
