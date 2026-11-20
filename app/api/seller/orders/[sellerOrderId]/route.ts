import {
  NotificationPriority,
  NotificationType,
  OrderStatus,
  Prisma,
  SellerOrderStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { requireSellerAccount } from "@/lib/seller-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_ORDER_ID_LENGTH = 100;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const MAX_TRANSACTION_RETRIES = 3;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/* =========================================================
   ERRORS AND RESPONSE HELPERS
========================================================= */

class OrderUpdateError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OrderUpdateError";
    this.status = status;
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: noStore },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* =========================================================
   BOUNDED JSON BODY READER
========================================================= */

async function readJsonBody(
  request: Request,
): Promise<
  | { valid: true; value: unknown }
  | { valid: false; reason: "TOO_LARGE" | "INVALID_JSON" }
> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      return { valid: false, reason: "INVALID_JSON" };
    }
    if (declaredLength > MAX_REQUEST_BODY_BYTES) {
      return { valid: false, reason: "TOO_LARGE" };
    }
  }

  if (!request.body) return { valid: false, reason: "INVALID_JSON" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { valid: false, reason: "TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { valid: false, reason: "INVALID_JSON" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The reader may already have been cancelled.
    }
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { valid: true, value: JSON.parse(decoded) as unknown };
  } catch {
    return { valid: false, reason: "INVALID_JSON" };
  }
}

/* =========================================================
   SELLER-MANAGED STATUS TRANSITIONS

   Important:
   - A seller can accept and prepare a paid order.
   - A seller cannot manually mark an order dispatched.
   - A seller cannot manually mark an order delivered.
   - Courier pickup and delivery are provider-confirmed
     events handled by the Shipbubble webhook.
   - Rejecting a paid order is disabled until the refund
     workflow is implemented; otherwise customer funds
     could remain unrefunded after stock is restored.
========================================================= */

const allowedTransitions: Partial<Record<SellerOrderStatus, SellerOrderStatus[]>> = {
  [SellerOrderStatus.PENDING_ACCEPTANCE]: [SellerOrderStatus.ACCEPTED],
  [SellerOrderStatus.ACCEPTED]: [SellerOrderStatus.PROCESSING],
  [SellerOrderStatus.PROCESSING]: [SellerOrderStatus.READY_FOR_DISPATCH],
};

/* =========================================================
   PARENT ORDER STATUS AGGREGATION
========================================================= */

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
  const dispatchedCount = statuses.filter((status) => dispatchedStatuses.has(status)).length;

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

/* =========================================================
   BUYER NOTIFICATION DETAILS
========================================================= */

type OrderNotificationDetails = {
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
};

const notificationDetails: Partial<Record<SellerOrderStatus, OrderNotificationDetails>> = {
  [SellerOrderStatus.ACCEPTED]: {
    type: NotificationType.ORDER_ACCEPTED,
    title: "Your order was accepted",
    message: "The seller has accepted your product order.",
    priority: NotificationPriority.NORMAL,
  },
  [SellerOrderStatus.PROCESSING]: {
    type: NotificationType.ORDER_STATUS_UPDATED,
    title: "Your order is being prepared",
    message: "The seller has started preparing your order.",
    priority: NotificationPriority.NORMAL,
  },
  [SellerOrderStatus.READY_FOR_DISPATCH]: {
    type: NotificationType.ORDER_STATUS_UPDATED,
    title: "Your order is ready for courier collection",
    message: "The seller has prepared your parcel. Courier booking is the next step.",
    priority: NotificationPriority.NORMAL,
  },
};

/* =========================================================
   TRANSACTION RESULT
========================================================= */

type UpdateResult =
  | { kind: "NOT_FOUND" }
  | { kind: "PAYMENT_REQUIRED" }
  | { kind: "PAID_REJECTION_REQUIRES_REFUND" }
  | { kind: "INVALID_TRANSITION"; currentStatus: SellerOrderStatus }
  | { kind: "CONFLICT" }
  | {
      kind: "SUCCESS";
      sellerOrder: {
        id: string;
        sellerOrderCode: string;
        status: SellerOrderStatus;
      };
      parentOrderStatus: OrderStatus;
      buyerId: string;
      orderId: string;
      orderCode: string;
      businessName: string;
    };

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/* =========================================================
   UPDATE SELLER ORDER
========================================================= */

async function updateSellerOrderStatus(input: {
  sellerOrderId: string;
  sellerId: string;
  businessId: string;
  requestedStatus: SellerOrderStatus;
}): Promise<UpdateResult> {
  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx): Promise<UpdateResult> => {
          const existing = await tx.sellerOrder.findFirst({
            where: {
              id: input.sellerOrderId,
              sellerId: input.sellerId,
              businessId: input.businessId,
            },
            include: {
              order: {
                select: {
                  id: true,
                  orderCode: true,
                  buyerId: true,
                  status: true,
                  paidAt: true,
                  payments: {
                    where: {
                      provider: "PAYSTACK",
                      status: "SUCCESS",
                    },
                    select: {
                      id: true,
                      paidAt: true,
                    },
                  },
                },
              },
              business: {
                select: { name: true },
              },
            },
          });

          if (!existing) return { kind: "NOT_FOUND" };

          // Never expose seller fulfilment controls for an unpaid order.
          const paymentVerified =
            existing.order.paidAt !== null &&
            existing.order.payments.some((payment) => payment.paidAt !== null);

          if (!paymentVerified || existing.order.status === OrderStatus.PENDING_PAYMENT) {
            return { kind: "PAYMENT_REQUIRED" };
          }

          // Rejection after successful payment requires a refund workflow.
          // Do not restore reserved stock while leaving the buyer's payment unrefunded.
          if (input.requestedStatus === SellerOrderStatus.REJECTED) {
            return { kind: "PAID_REJECTION_REQUIRES_REFUND" };
          }

          const allowed = allowedTransitions[existing.status] ?? [];
          if (!allowed.includes(input.requestedStatus)) {
            return {
              kind: "INVALID_TRANSITION",
              currentStatus: existing.status,
            };
          }

          const now = new Date();
          const updateData: Prisma.SellerOrderUpdateManyMutationInput = {
            status: input.requestedStatus,
            ...(input.requestedStatus === SellerOrderStatus.ACCEPTED
              ? { acceptedAt: now }
              : {}),
          };

          const updated = await tx.sellerOrder.updateMany({
            where: {
              id: existing.id,
              sellerId: input.sellerId,
              businessId: input.businessId,
              status: existing.status,
            },
            data: updateData,
          });

          if (updated.count !== 1) return { kind: "CONFLICT" };

          const siblingOrders = await tx.sellerOrder.findMany({
            where: { orderId: existing.orderId },
            select: { status: true },
          });

          const parentStatus = aggregateOrderStatus(
            siblingOrders.map((sellerOrder) => sellerOrder.status),
          );

          const parentUpdated = await tx.order.updateMany({
            where: {
              id: existing.orderId,
              paidAt: { not: null },
              status: { not: OrderStatus.PENDING_PAYMENT },
            },
            data: {
              status: parentStatus,
              completedAt: parentStatus === OrderStatus.COMPLETED ? now : null,
              cancelledAt: parentStatus === OrderStatus.CANCELLED ? now : null,
            },
          });

          if (parentUpdated.count !== 1) {
            // Throwing rolls back the preceding seller-order update too.
            throw new OrderUpdateError(
              "The parent order changed while this seller update was being saved. Refresh and try again.",
              409,
            );
          }

          return {
            kind: "SUCCESS",
            sellerOrder: {
              id: existing.id,
              sellerOrderCode: existing.sellerOrderCode,
              status: input.requestedStatus,
            },
            parentOrderStatus: parentStatus,
            buyerId: existing.order.buyerId,
            orderId: existing.order.id,
            orderCode: existing.order.orderCode,
            businessName: existing.business.name,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isSerializationConflict(error)) {
        if (attempt < MAX_TRANSACTION_RETRIES - 1) continue;
        return { kind: "CONFLICT" };
      }
      throw error;
    }
  }

  return { kind: "CONFLICT" };
}

/* =========================================================
   PATCH SELLER ORDER STATUS
========================================================= */

type RouteContext = {
  params: Promise<{ sellerOrderId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const access = await requireSellerAccount();
    if (!access.authorized) return access.response;

    const business = access.business;
    if (!business) {
      return jsonError("You do not have a business linked to this seller account.", 404);
    }
    if (business.ownerId !== access.user.id) {
      return jsonError("You are not allowed to manage this business.", 403);
    }
    if (business.deletedAt) {
      return jsonError("This business has been deleted.", 410);
    }

    const { sellerOrderId } = await context.params;
    if (
      typeof sellerOrderId !== "string" ||
      sellerOrderId.trim().length === 0 ||
      sellerOrderId.length > MAX_ORDER_ID_LENGTH
    ) {
      return jsonError("Invalid seller order reference.", 400);
    }

    const bodyResult = await readJsonBody(request);
    if (!bodyResult.valid) {
      return bodyResult.reason === "TOO_LARGE"
        ? jsonError("Request body is too large.", 413)
        : jsonError("Request body must contain valid JSON.", 400);
    }
    if (!isRecord(bodyResult.value)) {
      return jsonError("A valid status is required.", 400);
    }

    const body = bodyResult.value;
    const unsupportedFields = Object.keys(body).filter((key) => key !== "status");
    if (unsupportedFields.length > 0) {
      return jsonError(`Unsupported fields: ${unsupportedFields.join(", ")}.`, 400);
    }
    if (typeof body.status !== "string" || body.status.trim() === "") {
      return jsonError("A valid status is required.", 400);
    }

    const requestedStatus = body.status.trim();
    if (!Object.values(SellerOrderStatus).includes(requestedStatus as SellerOrderStatus)) {
      return jsonError("Invalid seller order status.", 400);
    }

    const nextStatus = requestedStatus as SellerOrderStatus;
    if (nextStatus === SellerOrderStatus.DISPATCHED) {
      return jsonError(
        "Sellers cannot manually mark an order as dispatched. Book the selected Shipbubble courier; courier pickup will update this status automatically.",
        409,
      );
    }
    if (nextStatus === SellerOrderStatus.DELIVERED) {
      return jsonError(
        "Sellers cannot manually mark an order as delivered. Shipbubble delivery confirmation updates this status automatically.",
        409,
      );
    }
    if (nextStatus === SellerOrderStatus.REJECTED) {
      return jsonError(
        "Rejecting a paid order requires a refund workflow. This action is currently disabled so a buyer is not left without their products or a refund. Contact ReMarket support for this order.",
        409,
      );
    }

    const result = await updateSellerOrderStatus({
      sellerOrderId: sellerOrderId.trim(),
      sellerId: access.user.id,
      businessId: business.id,
      requestedStatus: nextStatus,
    });

    if (result.kind === "NOT_FOUND") {
      return jsonError("Seller order not found.", 404);
    }
    if (result.kind === "PAYMENT_REQUIRED") {
      return jsonError(
        "This order does not have a verified successful Paystack payment. Seller fulfilment is blocked until payment is confirmed.",
        409,
      );
    }
    if (result.kind === "PAID_REJECTION_REQUIRES_REFUND") {
      return jsonError(
        "This paid order cannot be rejected until its refund has been arranged.",
        409,
      );
    }
    if (result.kind === "INVALID_TRANSITION") {
      return NextResponse.json(
        {
          error: "This status change is not allowed.",
          currentStatus: result.currentStatus,
          allowedNextStatuses: allowedTransitions[result.currentStatus] ?? [],
        },
        { status: 409, headers: noStore },
      );
    }
    if (result.kind === "CONFLICT") {
      return jsonError(
        "The order changed during this update. Refresh and try again.",
        409,
      );
    }

    const notification = notificationDetails[result.sellerOrder.status];
    if (notification) {
      try {
        await createNotification({
          userId: result.buyerId,
          type: notification.type,
          title: notification.title,
          message: `${result.businessName}: ${notification.message}`,
          priority: notification.priority,
          dedupeKey:
            `seller-order:${result.sellerOrder.id}:` +
            `status:${result.sellerOrder.status}`,
          data: {
            orderId: result.orderId,
            orderCode: result.orderCode,
            sellerOrderId: result.sellerOrder.id,
            sellerOrderCode: result.sellerOrder.sellerOrderCode,
            status: result.sellerOrder.status,
            href: `/orders/${encodeURIComponent(result.orderId)}`,
          },
        });
      } catch (notificationError) {
        console.error("BUYER_ORDER_NOTIFICATION_ERROR:", notificationError);
      }
    }

    return NextResponse.json(
      {
        message: "Seller order updated successfully.",
        sellerOrder: result.sellerOrder,
        parentOrderStatus: result.parentOrderStatus,
      },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof OrderUpdateError) {
      return jsonError(error.message, error.status);
    }
    console.error("SELLER_ORDER_PATCH_ERROR:", error);
    return jsonError("Unable to update this seller order.", 500);
  }
}