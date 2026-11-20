import { NextResponse } from "next/server";
import {
  OrderStatus,
  SellerOrderStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import {
  createSettlementAfterBuyerConfirmation,
  initiateQueuedSellerPayout,
} from "@/lib/seller-settlement";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_ORDER_ID_LENGTH = 100;
const MAX_TRANSACTION_RETRIES = 3;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: noStore },
  );
}

/**
 * requireBuyer currently exposes its unauthorized response as the standard
 * Response type. Clone it into a NextResponse while preserving its body,
 * status, status text, and headers, then apply the no-cache headers.
 */
function applyNoStore(response: Response): NextResponse {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(noStore)) {
    headers.set(key, value);
  }

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function aggregateOrderStatus(statuses: SellerOrderStatus[]): OrderStatus {
  if (statuses.length === 0) return OrderStatus.PLACED;

  const finalStatuses = new Set<SellerOrderStatus>([
    SellerOrderStatus.COMPLETED,
    SellerOrderStatus.REJECTED,
    SellerOrderStatus.CANCELLED,
  ]);
  const allFinal = statuses.every((status) => finalStatuses.has(status));
  const completedCount = statuses.filter(
    (status) => status === SellerOrderStatus.COMPLETED,
  ).length;
  const hasCancellation = statuses.some(
    (status) =>
      status === SellerOrderStatus.REJECTED ||
      status === SellerOrderStatus.CANCELLED,
  );

  if (allFinal) {
    if (completedCount === statuses.length) return OrderStatus.COMPLETED;
    if (completedCount > 0) return OrderStatus.PARTIALLY_CANCELLED;
    return OrderStatus.CANCELLED;
  }

  if (hasCancellation) return OrderStatus.PARTIALLY_CANCELLED;

  const dispatchedStatuses = new Set<SellerOrderStatus>([
    SellerOrderStatus.DISPATCHED,
    SellerOrderStatus.DELIVERED,
    SellerOrderStatus.COMPLETED,
  ]);
  const dispatchedCount = statuses.filter((status) =>
    dispatchedStatuses.has(status),
  ).length;

  if (dispatchedCount > 0) {
    return dispatchedCount === statuses.length
      ? OrderStatus.DISPATCHED
      : OrderStatus.PARTIALLY_DISPATCHED;
  }

  const hasProcessing = statuses.some(
    (status) =>
      status === SellerOrderStatus.PROCESSING ||
      status === SellerOrderStatus.READY_FOR_DISPATCH,
  );
  if (hasProcessing) return OrderStatus.PROCESSING;

  const acceptedCount = statuses.filter(
    (status) => status !== SellerOrderStatus.PENDING_ACCEPTANCE,
  ).length;
  if (acceptedCount === 0) return OrderStatus.PLACED;
  if (acceptedCount < statuses.length) return OrderStatus.PARTIALLY_ACCEPTED;
  return OrderStatus.CONFIRMED;
}

type RouteContext = {
  params: Promise<{
    orderId: string;
    sellerOrderId: string;
  }>;
};

type ConfirmResult =
  | { kind: "NOT_FOUND" }
  | { kind: "INVALID_STATUS"; currentStatus: SellerOrderStatus }
  | { kind: "SHIPMENT_REVIEW"; shipmentCount: number; deliveredShipmentCount: number }
  | { kind: "CONFLICT" }
  | { kind: "PAYMENT_REVIEW"; reason: string }
  | {
      kind: "ALREADY_COMPLETED";
      sellerId: string;
      orderId: string;
      orderCode: string;
      sellerOrderId: string;
      sellerOrderCode: string;
      sellerOrderCompletedAt: Date | null;
      parentOrderStatus: OrderStatus;
      parentOrderCompletedAt: Date | null;
    }
  | {
      kind: "SUCCESS";
      sellerId: string;
      orderId: string;
      orderCode: string;
      sellerOrderId: string;
      sellerOrderCode: string;
      sellerOrderCompletedAt: Date;
      parentOrderStatus: OrderStatus;
      parentOrderCompletedAt: Date | null;
      settlement: {
        id: string;
        status: string;
        grossSalesAmount: number;
        commissionRateBps: number;
        commissionAmount: number;
        netPayoutAmount: number;
        payoutId: string | null;
      };
    };

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

/**
 * Throwing this error inside the transaction is intentional: Prisma rolls
 * back the seller-order completion if the parent-order update fails.
 */
class DeliveryConfirmationConflictError extends Error {
  constructor() {
    super("Delivery confirmation encountered a concurrent order update.");
    this.name = "DeliveryConfirmationConflictError";
  }
}


class DeliverySettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliverySettlementError";
  }
}

async function confirmSellerOrderDelivery(input: {
  buyerId: string;
  orderId: string;
  sellerOrderId: string;
}): Promise<ConfirmResult> {
  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx): Promise<ConfirmResult> => {
          const parentOrder = await tx.order.findFirst({
            where: {
              id: input.orderId,
              buyerId: input.buyerId,
            },
            select: {
              id: true,
              orderCode: true,
              status: true,
              completedAt: true,
            },
          });

          if (!parentOrder) return { kind: "NOT_FOUND" };

          const sellerOrder = await tx.sellerOrder.findFirst({
            where: {
              id: input.sellerOrderId,
              orderId: parentOrder.id,
            },
            select: {
              id: true,
              orderId: true,
              sellerId: true,
              sellerOrderCode: true,
              status: true,
              completedAt: true,
              shipments: { select: { status: true } },
            },
          });

          if (!sellerOrder) return { kind: "NOT_FOUND" };

          if (sellerOrder.status === SellerOrderStatus.COMPLETED) {
            return {
              kind: "ALREADY_COMPLETED",
              sellerId: sellerOrder.sellerId,
              orderId: parentOrder.id,
              orderCode: parentOrder.orderCode,
              sellerOrderId: sellerOrder.id,
              sellerOrderCode: sellerOrder.sellerOrderCode,
              sellerOrderCompletedAt: sellerOrder.completedAt,
              parentOrderStatus: parentOrder.status,
              parentOrderCompletedAt: parentOrder.completedAt,
            };
          }

          if (sellerOrder.status !== SellerOrderStatus.DELIVERED) {
            return {
              kind: "INVALID_STATUS",
              currentStatus: sellerOrder.status,
            };
          }

          const deliveredShipmentCount = sellerOrder.shipments.filter(
            (shipment) => shipment.status === "DELIVERED",
          ).length;
          if (
            sellerOrder.shipments.length === 0 ||
            deliveredShipmentCount !== sellerOrder.shipments.length
          ) {
            return {
              kind: "SHIPMENT_REVIEW",
              shipmentCount: sellerOrder.shipments.length,
              deliveredShipmentCount,
            };
          }

          const now = new Date();
          const updatedSellerOrder = await tx.sellerOrder.updateMany({
            where: {
              id: sellerOrder.id,
              orderId: parentOrder.id,
              status: SellerOrderStatus.DELIVERED,
            },
            data: {
              status: SellerOrderStatus.COMPLETED,
              completedAt: now,
            },
          });

          if (updatedSellerOrder.count !== 1) {
            throw new DeliveryConfirmationConflictError();
          }

          const siblingOrders = await tx.sellerOrder.findMany({
            where: { orderId: parentOrder.id },
            select: { status: true },
          });

          const parentStatus = aggregateOrderStatus(
            siblingOrders.map((item) => item.status),
          );
          const parentCompletedAt =
            parentStatus === OrderStatus.COMPLETED ? now : null;

          const updatedParent = await tx.order.updateMany({
            where: {
              id: parentOrder.id,
              buyerId: input.buyerId,
              status: parentOrder.status,
            },
            data: {
              status: parentStatus,
              completedAt: parentCompletedAt,
              cancelledAt:
                parentStatus === OrderStatus.CANCELLED ? now : null,
            },
          });

          // Do not return a conflict from inside the transaction. A normal
          // return would commit the seller-order update above. Throwing forces
          // both updates to roll back atomically.
          if (updatedParent.count !== 1) {
            throw new DeliveryConfirmationConflictError();
          }

          let settlement: Awaited<ReturnType<typeof createSettlementAfterBuyerConfirmation>>;
          try {
            settlement = await createSettlementAfterBuyerConfirmation(tx, sellerOrder.id);
          } catch (settlementError) {
            throw new DeliverySettlementError(
              settlementError instanceof Error
                ? settlementError.message
                : "The seller settlement could not be prepared.",
            );
          }

          return {
            kind: "SUCCESS",
            sellerId: sellerOrder.sellerId,
            orderId: parentOrder.id,
            orderCode: parentOrder.orderCode,
            sellerOrderId: sellerOrder.id,
            sellerOrderCode: sellerOrder.sellerOrderCode,
            sellerOrderCompletedAt: now,
            parentOrderStatus: parentStatus,
            parentOrderCompletedAt: parentCompletedAt,
            settlement: {
              id: settlement.settlementId,
              status: settlement.status,
              grossSalesAmount: settlement.grossSalesAmount,
              commissionRateBps: settlement.commissionRateBps,
              commissionAmount: settlement.commissionAmount,
              netPayoutAmount: settlement.netPayoutAmount,
              payoutId: settlement.payoutId,
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof DeliverySettlementError) {
        return { kind: "PAYMENT_REVIEW", reason: error.message };
      }
      if (
        error instanceof DeliveryConfirmationConflictError ||
        isSerializationConflict(error)
      ) {
        if (attempt < MAX_TRANSACTION_RETRIES - 1) continue;
        return { kind: "CONFLICT" };
      }
      throw error;
    }
  }

  return { kind: "CONFLICT" };
}

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const access = await requireBuyer();
    if (!access.authorized) return applyNoStore(access.response);

    const { orderId, sellerOrderId } = await context.params;
    if (typeof orderId !== "string" || typeof sellerOrderId !== "string") {
      return jsonError("Invalid order reference.", 400);
    }

    const validatedOrderId = orderId.trim();
    const validatedSellerOrderId = sellerOrderId.trim();
    if (
      !validatedOrderId ||
      !validatedSellerOrderId ||
      validatedOrderId.length > MAX_ORDER_ID_LENGTH ||
      validatedSellerOrderId.length > MAX_ORDER_ID_LENGTH
    ) {
      return jsonError("Invalid order reference.", 400);
    }

    const result = await confirmSellerOrderDelivery({
      buyerId: access.user.id,
      orderId: validatedOrderId,
      sellerOrderId: validatedSellerOrderId,
    });

    if (result.kind === "NOT_FOUND") {
      return jsonError("Order not found in your account.", 404);
    }

    if (result.kind === "INVALID_STATUS") {
      return NextResponse.json(
        {
          error:
            "You can only confirm an order after the seller marks it as delivered.",
          currentStatus: result.currentStatus,
        },
        { status: 409, headers: noStore },
      );
    }

    if (result.kind === "PAYMENT_REVIEW") {
      return NextResponse.json(
        {
          error: "Delivery confirmation could not complete because the payment or settlement records need review.",
          reason: result.reason,
        },
        { status: 409, headers: noStore },
      );
    }

    if (result.kind === "SHIPMENT_REVIEW") {
      return NextResponse.json(
        {
          error: "Delivery cannot be confirmed until every parcel in this seller order is marked delivered by Shipbubble.",
          shipmentCount: result.shipmentCount,
          deliveredShipmentCount: result.deliveredShipmentCount,
        },
        { status: 409, headers: noStore },
      );
    }

    if (result.kind === "CONFLICT") {
      return jsonError(
        "The order changed during delivery confirmation. Refresh and try again.",
        409,
      );
    }

    if (result.kind === "ALREADY_COMPLETED") {
      return NextResponse.json(
        {
          success: true,
          message: "Delivery has already been confirmed.",
          sellerOrder: {
            id: result.sellerOrderId,
            sellerOrderCode: result.sellerOrderCode,
            status: SellerOrderStatus.COMPLETED,
            completedAt: result.sellerOrderCompletedAt?.toISOString() ?? null,
          },
          order: {
            status: result.parentOrderStatus,
            completedAt: result.parentOrderCompletedAt?.toISOString() ?? null,
          },
        },
        { status: 200, headers: noStore },
      );
    }

    try {
      await createNotification({
        userId: result.sellerId,
        type: NotificationType.ORDER_STATUS_UPDATED,
        title: "Buyer confirmed delivery",
        message: `The buyer has confirmed delivery for order (${result.sellerOrderCode}).`,
        priority: NotificationPriority.NORMAL,
        dedupeKey: `seller-order:${result.sellerOrderId}:buyer-confirmed-delivery`,
        data: {
          orderId: result.orderId,
          orderCode: result.orderCode,
          sellerOrderId: result.sellerOrderId,
          sellerOrderCode: result.sellerOrderCode,
          status: SellerOrderStatus.COMPLETED,
          href: "/seller/orders",
        } as Prisma.InputJsonValue,
      });
    } catch (notificationError) {
      console.error(
        "BUYER_CONFIRM_DELIVERY_NOTIFICATION_ERROR:",
        notificationError,
      );
    }

    let payoutResult: { initiated: boolean; status: string; reason?: string } | null = null;
    if (result.settlement.payoutId) {
      try {
        payoutResult = await initiateQueuedSellerPayout(result.settlement.payoutId);
      } catch (payoutError) {
        // Delivery remains confirmed. The durable payout record is reconciled
        // by the scheduled payout worker; never roll back delivery for a
        // temporary transfer-provider outage.
        console.error("SELLER_PAYOUT_INITIATION_ERROR:", payoutError);
      }
    }

    const payoutStatus = payoutResult?.status ?? (
      result.settlement.payoutId ? "QUEUED" : result.settlement.status
    );

    return NextResponse.json(
      {
        success: true,
        message: "Delivery confirmed successfully. ReMarket has recorded the seller settlement.",
        sellerOrder: {
          id: result.sellerOrderId,
          sellerOrderCode: result.sellerOrderCode,
          status: SellerOrderStatus.COMPLETED,
          completedAt: result.sellerOrderCompletedAt.toISOString(),
        },
        order: {
          status: result.parentOrderStatus,
          completedAt: result.parentOrderCompletedAt?.toISOString() ?? null,
        },
        settlement: {
          id: result.settlement.id,
          status: result.settlement.status,
          grossSalesAmount: result.settlement.grossSalesAmount,
          commissionRateBps: result.settlement.commissionRateBps,
          commissionAmount: result.settlement.commissionAmount,
          netPayoutAmount: result.settlement.netPayoutAmount,
          payoutStatus: payoutStatus,
          payoutMessage: payoutResult?.reason ?? null,
        },
      },
      { status: 200, headers: noStore },
    );
  } catch (error) {
    console.error("BUYER_CONFIRM_DELIVERY_ERROR:", error);
    return jsonError("Unable to confirm delivery.", 500);
  }
}
