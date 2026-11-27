import { PaymentStatus, Prisma } from "@prisma/client";
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

function isPaymentStatus(value: string): value is PaymentStatus {
  return Object.values(PaymentStatus).includes(value as PaymentStatus);
}

function hasVerifiedPaystackPayment(payment: {
  provider: string | null;
  providerTransactionId: string | null;
  status: PaymentStatus;
  paidAt: Date | null;
}): boolean {
  return payment.provider?.trim().toUpperCase() === "PAYSTACK" &&
    payment.status === PaymentStatus.SUCCESS &&
    Boolean(payment.providerTransactionId?.trim()) &&
    payment.paidAt !== null;
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
    if (statusParam && !isPaymentStatus(statusParam)) return jsonError("Invalid payment status.", 400);

    const where: Prisma.PaymentWhereInput = {
      ...(statusParam ? { status: statusParam as PaymentStatus } : {}),
      ...(q ? {
        OR: [
          { providerReference: { contains: q, mode: "insensitive" } },
          { providerTransactionId: { contains: q, mode: "insensitive" } },
          { order: { is: { orderCode: { contains: q, mode: "insensitive" } } } },
          { order: { is: { buyer: { is: { email: { contains: q, mode: "insensitive" } } } } } },
          { order: { is: { buyer: { is: { name: { contains: q, mode: "insensitive" } } } } } },
        ],
      } : {}),
    };

    const [payments, total, statusRows] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          method: true,
          provider: true,
          providerReference: true,
          providerTransactionId: true,
          initializedAt: true,
          expiresAt: true,
          failureReason: true,
          paidAt: true,
          createdAt: true,
          updatedAt: true,
          order: {
            select: {
              id: true,
              orderCode: true,
              status: true,
              totalAmount: true,
              currency: true,
              paidAt: true,
              buyer: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.payment.count({ where }),
      prisma.payment.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const statusCounts = Object.fromEntries(
      Object.values(PaymentStatus).map((value) => [value, 0]),
    ) as Record<PaymentStatus, number>;
    for (const row of statusRows) statusCounts[row.status] = row._count._all;

    const paymentsWithVerification = payments.map((payment) => ({
      ...payment,
      providerVerified: hasVerifiedPaystackPayment(payment),
    }));

    return NextResponse.json({
      success: true,
      payments: paymentsWithVerification,
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
    console.error("ADMIN_PAYMENTS_GET_ERROR:", error);
    return jsonError("Unable to load payment records.", 500);
  }
}
