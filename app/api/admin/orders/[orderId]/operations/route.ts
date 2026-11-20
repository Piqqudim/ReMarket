import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_ORDER_ID_LENGTH = 128;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: noStore },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * GET /api/admin/orders/[orderId]/operations
 *
 * Read-only Admin view of payment verification records and seller
 * fulfilment shipments. Provider payloads, raw webhook bodies and
 * unfiltered payment metadata are deliberately never exposed.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const access = await requireAdmin();
    if (!access.authorized) return access.response;

    const params = await context.params;
    const orderId = typeof params?.orderId === "string" ? params.orderId.trim() : "";

    if (!orderId || orderId.length > MAX_ORDER_ID_LENGTH) {
      return jsonError("Invalid order reference.", 400);
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderCode: true,
        status: true,
        paidAt: true,
        paymentExpiresAt: true,
        payments: {
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" },
          ],
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
            metadata: true,
          },
        },
        sellerOrders: {
          orderBy: [
            { createdAt: "asc" },
            { id: "asc" },
          ],
          select: {
            id: true,
            sellerOrderCode: true,
            sellerId: true,
            businessId: true,
            status: true,
            subtotal: true,
            acceptedAt: true,
            rejectedAt: true,
            dispatchedAt: true,
            deliveredAt: true,
            completedAt: true,
            cancelledAt: true,
            shipments: {
              orderBy: [
                { createdAt: "asc" },
                { id: "asc" },
              ],
              select: {
                id: true,
                quotePackageId: true,
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
                trackingEvents: {
                  orderBy: [
                    { occurredAt: "desc" },
                    { createdAt: "desc" },
                    { id: "desc" },
                  ],
                  take: 30,
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
            },
          },
        },
      },
    });

    if (!order) {
      return jsonError("Order not found.", 404);
    }

    const payments = order.payments.map((payment) => {
      const metadata = isRecord(payment.metadata) ? payment.metadata : {};
      const requiresManualReview = metadata.requiresManualReview === true;
      const manualReviewReason =
        typeof metadata.manualReviewReason === "string"
          ? metadata.manualReviewReason.slice(0, 500)
          : null;
      const providerTransactionId = payment.providerTransactionId?.trim() || null;

      // The indicator is derived from server-written payment fields.
      // It is not a claim that funds are held in escrow, that a refund
      // has occurred, or that seller settlement has been completed.
      const providerVerified =
        payment.provider === "PAYSTACK" &&
        payment.status === "SUCCESS" &&
        providerTransactionId !== null &&
        payment.paidAt !== null &&
        order.paidAt !== null;

      return {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        provider: payment.provider,
        providerReference: payment.providerReference,
        providerTransactionId,
        initializedAt: payment.initializedAt,
        expiresAt: payment.expiresAt,
        failureReason: payment.failureReason,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        providerVerified,
        requiresManualReview,
        manualReviewReason,
      };
    });

    const shipmentSummary = order.sellerOrders.reduce(
      (summary, sellerOrder) => {
        for (const shipment of sellerOrder.shipments) {
          summary.total += 1;
          if (shipment.status === "DELIVERED") summary.delivered += 1;
          if (["FAILED", "DELIVERY_FAILED"].includes(shipment.status)) summary.failed += 1;
          if (shipment.failureReason) summary.withFailureReason += 1;
        }
        return summary;
      },
      { total: 0, delivered: 0, failed: 0, withFailureReason: 0 },
    );

    return NextResponse.json(
      {
        success: true,
        order: {
          id: order.id,
          orderCode: order.orderCode,
          status: order.status,
          paidAt: order.paidAt,
          paymentExpiresAt: order.paymentExpiresAt,
        },
        payments,
        sellerOrders: order.sellerOrders,
        shipmentSummary,
        commissionAccounting: {
          configured: false,
          message:
            "Commission is not yet stored against seller orders. No commission or settlement amount is reported by this endpoint.",
        },
      },
      { status: 200, headers: noStore },
    );
  } catch (error) {
    console.error("ADMIN_ORDER_OPERATIONS_GET_ERROR:", error);
    return jsonError("Unable to load order payment and shipment details.", 500);
  }
}
