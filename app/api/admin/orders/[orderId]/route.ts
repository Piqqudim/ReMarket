import {
  NotificationPriority,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  SellerOrderStatus,
  ShipmentStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notifications";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_ORDER_ID_LENGTH = 100;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_REASON_LENGTH = 500;
const MIN_REASON_LENGTH = 10;
const MAX_PRISMA_INT = 2_147_483_647;
const MAX_TRANSACTION_RETRIES = 3;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const CANCELLABLE_STATUSES = new Set<SellerOrderStatus>([
  SellerOrderStatus.PENDING_ACCEPTANCE,
  SellerOrderStatus.ACCEPTED,
  SellerOrderStatus.PROCESSING,
  SellerOrderStatus.READY_FOR_DISPATCH,
]);

const ALREADY_FINAL_STATUSES = new Set<SellerOrderStatus>([
  SellerOrderStatus.REJECTED,
  SellerOrderStatus.CANCELLED,
]);

// A successful payment is intentionally included. This endpoint does not
// issue refunds, so an Admin must not cancel a paid order from this route.
const PAYMENT_REVIEW_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PENDING,
  PaymentStatus.INITIATED,
  PaymentStatus.SUCCESS,
  PaymentStatus.PARTIALLY_REFUNDED,
]);

const CLOSED_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.REFUNDED,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class AdminOrderCancellationError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
    this.name = "AdminOrderCancellationError";
  }
}

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
    if (declaredLength > MAX_BODY_BYTES) {
      return { valid: false, reason: "TOO_LARGE" };
    }
  }

  // Enforce the byte limit while reading, including requests without a
  // Content-Length header (for example, streamed/chunked requests).
  if (!request.body) {
    return { valid: false, reason: "INVALID_JSON" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { valid: false, reason: "TOO_LARGE" };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { valid: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { valid: false, reason: "INVALID_JSON" };
  } finally {
    reader.releaseLock();
  }
}

function aggregateOrderStatus(statuses: SellerOrderStatus[]): OrderStatus {
  if (statuses.length === 0) return OrderStatus.PLACED;

  const finalStatuses = new Set<SellerOrderStatus>([
    SellerOrderStatus.COMPLETED,
    SellerOrderStatus.REJECTED,
    SellerOrderStatus.CANCELLED,
  ]);
  const allFinal = statuses.every((status) => finalStatuses.has(status));
  const completedCount = statuses.filter((status) => status === SellerOrderStatus.COMPLETED).length;
  const hasCancellation = statuses.some((status) =>
    status === SellerOrderStatus.REJECTED || status === SellerOrderStatus.CANCELLED,
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

  const hasProcessing = statuses.some((status) =>
    status === SellerOrderStatus.PROCESSING || status === SellerOrderStatus.READY_FOR_DISPATCH,
  );
  if (hasProcessing) return OrderStatus.PROCESSING;

  const acceptedCount = statuses.filter(
    (status) => status !== SellerOrderStatus.PENDING_ACCEPTANCE,
  ).length;
  if (acceptedCount === 0) return OrderStatus.PLACED;
  if (acceptedCount < statuses.length) return OrderStatus.PARTIALLY_ACCEPTED;
  return OrderStatus.CONFIRMED;
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

type CancelledSellerOrder = {
  id: string;
  sellerOrderCode: string;
  sellerId: string;
};

type ShipmentReviewItem = {
  id: string;
  provider: string;
  providerOrderId: string | null;
  status: ShipmentStatus;
};

type ShipmentReviewSellerOrder = {
  sellerOrderCode: string;
  shipments: ShipmentReviewItem[];
};

type CancellationResult =
  | { kind: "NOT_FOUND" }
  | { kind: "ALREADY_CANCELLED"; orderCode: string; status: OrderStatus }
  | { kind: "PAYMENT_REVIEW"; statuses: PaymentStatus[]; paidAt: Date | null }
  | { kind: "SHIPMENT_REVIEW"; sellerOrders: ShipmentReviewSellerOrder[] }
  | { kind: "BLOCKED_STATUS"; statuses: SellerOrderStatus[] }
  | { kind: "CONFLICT" }
  | {
      kind: "SUCCESS";
      orderId: string;
      orderCode: string;
      buyerId: string;
      parentOrderStatus: OrderStatus;
      sellerOrders: CancelledSellerOrder[];
      inventoryRestoredLineItems: number;
      inventoryRestoredUnits: number;
    };

async function cancelAdminOrder(input: {
  orderId: string;
  adminId: string;
  reason: string;
}): Promise<CancellationResult> {
  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx): Promise<CancellationResult> => {
          const order = await tx.order.findUnique({
            where: { id: input.orderId },
            select: {
              id: true,
              orderCode: true,
              buyerId: true,
              status: true,
              paidAt: true,
              payments: { select: { status: true } },
              sellerOrders: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  sellerOrderCode: true,
                  sellerId: true,
                  businessId: true,
                  status: true,
                  inventoryReleasedAt: true,
                  shipments: {
                    orderBy: { createdAt: "asc" },
                    select: {
                      id: true,
                      provider: true,
                      providerOrderId: true,
                      status: true,
                    },
                  },
                  items: {
                    select: {
                      productId: true,
                      quantity: true,
                      inventoryReserved: true,
                    },
                  },
                },
              },
            },
          });

          if (!order) return { kind: "NOT_FOUND" };
          if (order.sellerOrders.length === 0) {
            return { kind: "BLOCKED_STATUS", statuses: [] };
          }

          const allAlreadyFinal = order.sellerOrders.every((sellerOrder) =>
            ALREADY_FINAL_STATUSES.has(sellerOrder.status),
          );
          if (allAlreadyFinal) {
            return {
              kind: "ALREADY_CANCELLED",
              orderCode: order.orderCode,
              status: order.status,
            };
          }

          const paymentStatuses = order.payments.map((payment) => payment.status);
          const hasRefundedPayment = paymentStatuses.includes(PaymentStatus.REFUNDED);
          const allPaymentAttemptsClosed = paymentStatuses.every((status) =>
            CLOSED_PAYMENT_STATUSES.has(status),
          );

          // Failed/cancelled attempts from earlier checkouts should not prevent
          // cancellation after a successful payment has been fully refunded.
          // But a paidAt timestamp still requires at least one REFUNDED record,
          // and every other payment attempt must be in a closed state.
          const paidWithoutRefundEvidence =
            order.paidAt !== null &&
            !(hasRefundedPayment && allPaymentAttemptsClosed);

          if (
            paymentStatuses.some((status) => PAYMENT_REVIEW_STATUSES.has(status)) ||
            paidWithoutRefundEvidence
          ) {
            return {
              kind: "PAYMENT_REVIEW",
              statuses: paymentStatuses,
              paidAt: order.paidAt,
            };
          }

          // Shipbubble booking can create a paid courier label before the seller
          // order status changes. Never cancel or restore stock while a booking
          // is active, has a provider order ID, or has an uncertain outcome.
          // FAILED/CANCELLED records without a provider order ID are safe to pass.
          const shipmentReviewSellerOrders: ShipmentReviewSellerOrder[] = [];
          for (const sellerOrder of order.sellerOrders) {
            const unsafeShipments = sellerOrder.shipments.filter((shipment) => {
              const hasProviderBooking = Boolean(shipment.providerOrderId?.trim());
              const terminalWithoutBooking =
                (shipment.status === ShipmentStatus.FAILED ||
                  shipment.status === ShipmentStatus.CANCELLED) &&
                !hasProviderBooking;
              return !terminalWithoutBooking;
            });

            if (unsafeShipments.length > 0) {
              shipmentReviewSellerOrders.push({
                sellerOrderCode: sellerOrder.sellerOrderCode,
                shipments: unsafeShipments.map((shipment) => ({
                  id: shipment.id,
                  provider: shipment.provider,
                  providerOrderId: shipment.providerOrderId,
                  status: shipment.status,
                })),
              });
            }
          }

          if (shipmentReviewSellerOrders.length > 0) {
            return {
              kind: "SHIPMENT_REVIEW",
              sellerOrders: shipmentReviewSellerOrders,
            };
          }

          const blockedStatuses = order.sellerOrders
            .filter((sellerOrder) =>
              !CANCELLABLE_STATUSES.has(sellerOrder.status) &&
              !ALREADY_FINAL_STATUSES.has(sellerOrder.status),
            )
            .map((sellerOrder) => sellerOrder.status);
          if (blockedStatuses.length > 0) {
            return { kind: "BLOCKED_STATUS", statuses: blockedStatuses };
          }

          const activeSellerOrders = order.sellerOrders.filter((sellerOrder) =>
            CANCELLABLE_STATUSES.has(sellerOrder.status),
          );
          if (activeSellerOrders.some((sellerOrder) => sellerOrder.inventoryReleasedAt !== null)) {
            throw new AdminOrderCancellationError(
              "An active seller order already has an inventory release record. Manual reconciliation is required.",
            );
          }

          const now = new Date();
          const cancelledSellerOrders: CancelledSellerOrder[] = [];
          let inventoryRestoredLineItems = 0;
          let inventoryRestoredUnits = 0;

          for (const sellerOrder of activeSellerOrders) {
            const updated = await tx.sellerOrder.updateMany({
              where: {
                id: sellerOrder.id,
                orderId: order.id,
                sellerId: sellerOrder.sellerId,
                businessId: sellerOrder.businessId,
                status: sellerOrder.status,
                inventoryReleasedAt: null,
              },
              data: {
                status: SellerOrderStatus.CANCELLED,
                cancelledAt: now,
                inventoryReleasedAt: now,
              },
            });
            if (updated.count !== 1) {
              throw new AdminOrderCancellationError(
                "A seller order changed during cancellation. Refresh and try again.",
              );
            }

            for (const item of sellerOrder.items) {
              if (!item.inventoryReserved || !item.productId) continue;
              if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
                throw new AdminOrderCancellationError(
                  "An order item has an invalid quantity. Inventory was not restored.",
                );
              }

              const inventory = await tx.product.findUnique({
                where: { id: item.productId },
                select: { businessId: true, stockQuantity: true },
              });
              if (!inventory) {
                throw new AdminOrderCancellationError(
                  "A reserved product could not be found. Manual inventory reconciliation is required.",
                );
              }
              if (inventory.businessId !== sellerOrder.businessId) {
                throw new AdminOrderCancellationError(
                  "A product does not belong to the expected seller. Inventory was not restored.",
                );
              }
              if (inventory.stockQuantity === null) continue;
              if (!Number.isSafeInteger(inventory.stockQuantity) || inventory.stockQuantity < 0) {
                throw new AdminOrderCancellationError("The current inventory value is invalid.");
              }
              if (inventory.stockQuantity > MAX_PRISMA_INT - item.quantity) {
                throw new AdminOrderCancellationError(
                  "Restoring this inventory would exceed the supported quantity limit.",
                );
              }

              const restored = await tx.product.updateMany({
                where: {
                  id: item.productId,
                  businessId: sellerOrder.businessId,
                  stockQuantity: inventory.stockQuantity,
                },
                data: { stockQuantity: { increment: item.quantity } },
              });
              if (restored.count !== 1) {
                throw new AdminOrderCancellationError(
                  "Product inventory changed during cancellation. Refresh and try again.",
                );
              }
              inventoryRestoredLineItems += 1;
              inventoryRestoredUnits += item.quantity;
            }

            cancelledSellerOrders.push({
              id: sellerOrder.id,
              sellerOrderCode: sellerOrder.sellerOrderCode,
              sellerId: sellerOrder.sellerId,
            });
          }

          const updatedSellerOrders = await tx.sellerOrder.findMany({
            where: { orderId: order.id },
            select: { status: true },
          });
          const parentOrderStatus = aggregateOrderStatus(
            updatedSellerOrders.map((item) => item.status),
          );

          const updatedParent = await tx.order.updateMany({
            where: { id: order.id, status: order.status },
            data: {
              status: parentOrderStatus,
              completedAt: null,
              cancelledAt: parentOrderStatus === OrderStatus.CANCELLED ? now : null,
            },
          });
          if (updatedParent.count !== 1) {
            throw new AdminOrderCancellationError(
              "The parent order changed during cancellation. Refresh and try again.",
            );
          }

          await writeAdminAuditLog(tx, {
            adminId: input.adminId,
            action: "ORDER_CANCELLED_BY_ADMIN",
            entityType: "ORDER",
            entityId: order.id,
            reason: input.reason,
            beforeData: {
              parentStatus: order.status,
              sellerOrders: order.sellerOrders.map((sellerOrder) => ({
                id: sellerOrder.id,
                sellerOrderCode: sellerOrder.sellerOrderCode,
                status: sellerOrder.status,
                inventoryReleasedAt: sellerOrder.inventoryReleasedAt?.toISOString() ?? null,
                shipments: sellerOrder.shipments.map((shipment) => ({
                  id: shipment.id,
                  provider: shipment.provider,
                  providerOrderId: shipment.providerOrderId,
                  status: shipment.status,
                })),
              })),
            } as Prisma.InputJsonValue,
            afterData: {
              parentStatus: parentOrderStatus,
              sellerOrders: updatedSellerOrders.map((sellerOrder) => ({
                status: sellerOrder.status,
              })),
            } as Prisma.InputJsonValue,
            metadata: {
              orderCode: order.orderCode,
              inventoryRestoredLineItems,
              inventoryRestoredUnits,
              paymentStatuses,
              paidAt: order.paidAt?.toISOString() ?? null,
            } as Prisma.InputJsonValue,
          });

          return {
            kind: "SUCCESS",
            orderId: order.id,
            orderCode: order.orderCode,
            buyerId: order.buyerId,
            parentOrderStatus,
            sellerOrders: cancelledSellerOrders,
            inventoryRestoredLineItems,
            inventoryRestoredUnits,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof AdminOrderCancellationError) throw error;
      if (isSerializationConflict(error)) {
        if (attempt < MAX_TRANSACTION_RETRIES - 1) continue;
        return { kind: "CONFLICT" };
      }
      throw error;
    }
  }
  return { kind: "CONFLICT" };
}

type RouteContext = { params: Promise<{ orderId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { orderId } = await context.params;
    if (
      typeof orderId !== "string" ||
      !orderId.trim() ||
      orderId.trim().length > MAX_ORDER_ID_LENGTH
    ) {
      return jsonError("Invalid order reference.", 400);
    }

    const bodyResult = await readJsonBody(request);
    if (!bodyResult.valid) {
      return bodyResult.reason === "TOO_LARGE"
        ? jsonError("Request body is too large.", 413)
        : jsonError("Request body must contain valid JSON.", 400);
    }
    if (!isRecord(bodyResult.value)) {
      return jsonError("A cancellation reason is required.", 400);
    }

    const unsupportedFields = Object.keys(bodyResult.value).filter((key) => key !== "reason");
    if (unsupportedFields.length > 0) {
      return jsonError(`Unsupported fields: ${unsupportedFields.join(", ")}.`, 400);
    }

    const rawReason = bodyResult.value.reason;
    if (typeof rawReason !== "string") {
      return jsonError("A cancellation reason is required.", 400);
    }
    const reason = rawReason.trim();
    if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
      return jsonError(
        "The cancellation reason must be between 10 and 500 characters.",
        400,
      );
    }

    const result = await cancelAdminOrder({
      orderId: orderId.trim(),
      adminId: auth.user.id,
      reason,
    });

    if (result.kind === "NOT_FOUND") return jsonError("Order not found.", 404);

    if (result.kind === "ALREADY_CANCELLED") {
      return NextResponse.json(
        {
          success: true,
          message: "This order has already been cancelled.",
          order: { orderCode: result.orderCode, status: result.status },
        },
        { headers: noStore },
      );
    }

    if (result.kind === "PAYMENT_REVIEW") {
      return NextResponse.json(
        {
          error:
            "This order cannot be cancelled until its payment records have been reconciled. Paid orders must be fully refunded through the approved refund workflow first.",
          paymentStatuses: result.statuses,
          paidAt: result.paidAt,
        },
        { status: 409, headers: noStore },
      );
    }

    if (result.kind === "SHIPMENT_REVIEW") {
      return NextResponse.json(
        {
          error:
            "This order has a Shipbubble booking or an unresolved shipment booking. Reconcile or cancel the courier booking before cancelling seller orders or restoring inventory.",
          sellerOrders: result.sellerOrders,
        },
        { status: 409, headers: noStore },
      );
    }

    if (result.kind === "BLOCKED_STATUS") {
      return NextResponse.json(
        {
          error:
            "This order contains seller orders that are not eligible for this cancellation operation.",
          sellerOrderStatuses: result.statuses,
        },
        { status: 409, headers: noStore },
      );
    }

    if (result.kind === "CONFLICT") {
      return jsonError("The order changed during cancellation. Refresh and try again.", 409);
    }

    const notifications = [
      createNotification({
        userId: result.buyerId,
        type: NotificationType.ORDER_CANCELLED,
        title: "Your order was cancelled",
        message: `Your ReMarket order (${result.orderCode}) was cancelled by the marketplace team.`,
        priority: NotificationPriority.HIGH,
        dedupeKey: `admin-cancelled-order:${result.orderId}`,
        data: {
          orderId: result.orderId,
          orderCode: result.orderCode,
          status: result.parentOrderStatus,
          href: `/orders/${encodeURIComponent(result.orderId)}`,
        } as Prisma.InputJsonValue,
      }),
      ...result.sellerOrders.map((sellerOrder) =>
        createNotification({
          userId: sellerOrder.sellerId,
          type: NotificationType.ORDER_CANCELLED,
          title: "An order was cancelled by Admin",
          message: `Seller order (${sellerOrder.sellerOrderCode}) was cancelled by the marketplace team.`,
          priority: NotificationPriority.HIGH,
          dedupeKey: `admin-cancelled-seller-order:${sellerOrder.id}`,
          data: {
            orderId: result.orderId,
            orderCode: result.orderCode,
            sellerOrderId: sellerOrder.id,
            sellerOrderCode: sellerOrder.sellerOrderCode,
            status: SellerOrderStatus.CANCELLED,
            href: "/seller/orders",
          } as Prisma.InputJsonValue,
        }),
      ),
    ];

    const notificationResults = await Promise.allSettled(notifications);
    for (const notificationResult of notificationResults) {
      if (notificationResult.status === "rejected") {
        console.error(
          "ADMIN_ORDER_CANCELLATION_NOTIFICATION_ERROR:",
          notificationResult.reason,
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Order cancelled successfully.",
        order: {
          id: result.orderId,
          orderCode: result.orderCode,
          status: result.parentOrderStatus,
        },
        cancelledSellerOrders: result.sellerOrders.map((sellerOrder) => ({
          id: sellerOrder.id,
          sellerOrderCode: sellerOrder.sellerOrderCode,
          status: SellerOrderStatus.CANCELLED,
        })),
        inventory: {
          restoredLineItems: result.inventoryRestoredLineItems,
          restoredUnits: result.inventoryRestoredUnits,
        },
      },
      { status: 200, headers: noStore },
    );
  } catch (error) {
    if (error instanceof AdminOrderCancellationError) {
      return jsonError(error.message, error.status);
    }
    console.error("ADMIN_ORDER_CANCELLATION_ERROR:", error);
    return jsonError("Unable to cancel this order.", 500);
  }
}
