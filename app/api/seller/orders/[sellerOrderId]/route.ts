import { NextResponse } from "next/server";

import {
  NotificationPriority,
  NotificationType,
  OrderStatus,
  Prisma,
  SellerOrderStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSellerAccount } from "@/lib/seller-auth";
import { createNotification } from "@/lib/notifications";

const MAX_ORDER_ID_LENGTH = 100;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const MAX_PRISMA_INT = 2_147_483_647;
const MAX_TRANSACTION_RETRIES = 3;

const noStore = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/* =========================================================
   ERRORS
========================================================= */

class OrderUpdateError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OrderUpdateError";
    this.status = status;
  }
}

function jsonError(
  message: string,
  status: number,
) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: noStore,
    },
  );
}

/* =========================================================
   REQUEST VALIDATION
========================================================= */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

async function readJsonBody(
  request: Request,
): Promise<
  | { valid: true; value: unknown }
  | {
      valid: false;
      reason: "TOO_LARGE" | "INVALID_JSON";
    }
> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const declaredLength = Number(contentLength);

    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0
    ) {
      return {
        valid: false,
        reason: "INVALID_JSON",
      };
    }

    if (declaredLength > MAX_REQUEST_BODY_BYTES) {
      return {
        valid: false,
        reason: "TOO_LARGE",
      };
    }
  }

  if (!request.body) {
    return {
      valid: false,
      reason: "INVALID_JSON",
    };
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

      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);

        return {
          valid: false,
          reason: "TOO_LARGE",
        };
      }

      chunks.push(value);
    }
  } catch {
    return {
      valid: false,
      reason: "INVALID_JSON",
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader may already have been cancelled.
    }
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const decoded = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);

    return {
      valid: true,
      value: JSON.parse(decoded) as unknown,
    };
  } catch {
    return {
      valid: false,
      reason: "INVALID_JSON",
    };
  }
}

/* =========================================================
   ALLOWED SELLER STATUS TRANSITIONS
========================================================= */

const allowedTransitions: Partial<
  Record<SellerOrderStatus, SellerOrderStatus[]>
> = {
  PENDING_ACCEPTANCE: [
    SellerOrderStatus.ACCEPTED,
    SellerOrderStatus.REJECTED,
  ],

  ACCEPTED: [
    SellerOrderStatus.PROCESSING,
  ],

  PROCESSING: [
    SellerOrderStatus.READY_FOR_DISPATCH,
  ],

  READY_FOR_DISPATCH: [
    SellerOrderStatus.DISPATCHED,
  ],

  DISPATCHED: [
    SellerOrderStatus.DELIVERED,
  ],
};

/* =========================================================
   PARENT ORDER STATUS AGGREGATION
========================================================= */

function aggregateOrderStatus(
  statuses: SellerOrderStatus[],
): OrderStatus {
  if (statuses.length === 0) {
    return OrderStatus.PLACED;
  }

  const finalStatuses = new Set<SellerOrderStatus>([
    SellerOrderStatus.COMPLETED,
    SellerOrderStatus.REJECTED,
    SellerOrderStatus.CANCELLED,
  ]);

  const allFinal = statuses.every(
    (status) => finalStatuses.has(status),
  );

  const completedCount = statuses.filter(
    (status) =>
      status === SellerOrderStatus.COMPLETED,
  ).length;

  const hasCancellation = statuses.some(
    (status) =>
      status === SellerOrderStatus.REJECTED ||
      status === SellerOrderStatus.CANCELLED,
  );

  if (allFinal) {
    if (completedCount === statuses.length) {
      return OrderStatus.COMPLETED;
    }

    if (completedCount > 0) {
      return OrderStatus.PARTIALLY_CANCELLED;
    }

    return OrderStatus.CANCELLED;
  }

  if (hasCancellation) {
    return OrderStatus.PARTIALLY_CANCELLED;
  }

  const dispatchedStatuses = new Set<SellerOrderStatus>([
    SellerOrderStatus.DISPATCHED,
    SellerOrderStatus.DELIVERED,
    SellerOrderStatus.COMPLETED,
  ]);

  const dispatchedCount = statuses.filter(
    (status) => dispatchedStatuses.has(status),
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

  if (hasProcessing) {
    return OrderStatus.PROCESSING;
  }

  const acceptedCount = statuses.filter(
    (status) =>
      status !== SellerOrderStatus.PENDING_ACCEPTANCE,
  ).length;

  if (acceptedCount === 0) {
    return OrderStatus.PLACED;
  }

  if (acceptedCount < statuses.length) {
    return OrderStatus.PARTIALLY_ACCEPTED;
  }

  return OrderStatus.CONFIRMED;
}

/* =========================================================
   NOTIFICATION DETAILS
========================================================= */

type OrderNotificationDetails = {
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
};

const notificationDetails: Partial<
  Record<SellerOrderStatus, OrderNotificationDetails>
> = {
  [SellerOrderStatus.ACCEPTED]: {
    type: NotificationType.ORDER_ACCEPTED,
    title: "Your order was accepted",
    message:
      "The seller has accepted your product order.",
    priority: NotificationPriority.NORMAL,
  },

  [SellerOrderStatus.REJECTED]: {
    type: NotificationType.ORDER_REJECTED,
    title: "Your order was rejected",
    message:
      "The seller could not accept your product order.",
    priority: NotificationPriority.HIGH,
  },

  [SellerOrderStatus.PROCESSING]: {
    type: NotificationType.ORDER_STATUS_UPDATED,
    title: "Your order is being prepared",
    message:
      "The seller has started preparing your order.",
    priority: NotificationPriority.NORMAL,
  },

  [SellerOrderStatus.READY_FOR_DISPATCH]: {
    type: NotificationType.ORDER_STATUS_UPDATED,
    title: "Your order is ready",
    message:
      "The seller has marked your order as ready for dispatch.",
    priority: NotificationPriority.NORMAL,
  },

  [SellerOrderStatus.DISPATCHED]: {
    type: NotificationType.ORDER_STATUS_UPDATED,
    title: "Your order has been dispatched",
    message:
      "The seller has dispatched your order.",
    priority: NotificationPriority.HIGH,
  },

  [SellerOrderStatus.DELIVERED]: {
    type: NotificationType.ORDER_STATUS_UPDATED,
    title: "Your order is marked as delivered",
    message:
      "The seller has marked your order as delivered. Please confirm receipt after receiving your products.",
    priority: NotificationPriority.HIGH,
  },
};

/* =========================================================
   TRANSACTION RESULT
========================================================= */

type UpdateResult =
  | {
      kind: "NOT_FOUND";
    }
  | {
      kind: "INVALID_TRANSITION";
      currentStatus: SellerOrderStatus;
    }
  | {
      kind: "CONFLICT";
    }
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

/* =========================================================
   DATABASE SERIALIZATION CONFLICT
========================================================= */

function isSerializationConflict(
  error: unknown,
): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

/* =========================================================
   UPDATE SELLER ORDER
========================================================= */

async function updateSellerOrderStatus(
  input: {
    sellerOrderId: string;
    sellerId: string;
    businessId: string;
    requestedStatus: SellerOrderStatus;
  },
): Promise<UpdateResult> {
  for (
    let attempt = 0;
    attempt < MAX_TRANSACTION_RETRIES;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx): Promise<UpdateResult> => {
          /*
           * --------------------------------------------------
           * FIND SELLER ORDER
           * --------------------------------------------------
           *
           * The order must belong to both the authenticated
           * seller and their currently linked business.
           * --------------------------------------------------
           */

          const existing = await tx.sellerOrder.findFirst({
            where: {
              id: input.sellerOrderId,
              sellerId: input.sellerId,
              businessId: input.businessId,
            },

            include: {
              items: {
                select: {
                  productId: true,
                  quantity: true,
                },
              },

              order: {
                select: {
                  id: true,
                  orderCode: true,
                  buyerId: true,
                },
              },

              business: {
                select: {
                  name: true,
                },
              },
            },
          });

          if (!existing) {
            return {
              kind: "NOT_FOUND",
            };
          }

          /*
           * --------------------------------------------------
           * VALIDATE STATUS TRANSITION
           * --------------------------------------------------
           */

          const allowed =
            allowedTransitions[existing.status] ?? [];

          if (
            !allowed.includes(input.requestedStatus)
          ) {
            return {
              kind: "INVALID_TRANSITION",
              currentStatus: existing.status,
            };
          }

          const now = new Date();

          /*
           * --------------------------------------------------
           * BUILD UPDATE DATA
           * --------------------------------------------------
           */

          const updateData: Prisma.SellerOrderUpdateManyMutationInput =
            {
              status: input.requestedStatus,

              ...(input.requestedStatus ===
              SellerOrderStatus.ACCEPTED
                ? { acceptedAt: now }
                : {}),

              ...(input.requestedStatus ===
              SellerOrderStatus.REJECTED
                ? { rejectedAt: now }
                : {}),

              ...(input.requestedStatus ===
              SellerOrderStatus.DISPATCHED
                ? { dispatchedAt: now }
                : {}),

              ...(input.requestedStatus ===
              SellerOrderStatus.DELIVERED
                ? { deliveredAt: now }
                : {}),
            };

          /*
           * --------------------------------------------------
           * CONDITIONAL STATUS UPDATE
           * --------------------------------------------------
           *
           * This is the key protection against duplicate
           * inventory restoration.
           *
           * Only one request can successfully move this order
           * from its existing status to the requested status.
           *
           * A repeated rejection cannot update the same row
           * again, so its stock cannot be restored twice.
           * --------------------------------------------------
           */

          const updated = await tx.sellerOrder.updateMany({
            where: {
              id: existing.id,
              sellerId: input.sellerId,
              businessId: input.businessId,
              status: existing.status,
            },

            data: updateData,
          });

          if (updated.count !== 1) {
            return {
              kind: "CONFLICT",
            };
          }

          /*
           * --------------------------------------------------
           * RESTORE TRACKED INVENTORY ON REJECTION
           * --------------------------------------------------
           *
           * Checkout deducts tracked stock.
           *
           * Rejection restores the ordered quantities.
           *
           * Null stockQuantity means tracking is disabled.
           * Such products are not modified.
           *
           * Stock restoration runs in the same transaction
           * as the status update.
           *
           * If restoration fails, the rejection also rolls back.
           * --------------------------------------------------
           */

          if (
            input.requestedStatus ===
            SellerOrderStatus.REJECTED
          ) {
            for (const item of existing.items) {
              if (!item.productId) {
                // Historical item whose product was deleted.
                continue;
              }

              if (
                !Number.isSafeInteger(item.quantity) ||
                item.quantity <= 0
              ) {
                throw new Error(
                  "INVALID_ORDER_ITEM_QUANTITY",
                );
              }

              const inventory = await tx.product.findUnique({
                where: {
                  id: item.productId,
                },

                select: {
                  businessId: true,
                  stockQuantity: true,
                },
              });

              /*
               * If the product was hard-deleted, there is
               * no inventory record left to restore.
               */

              if (!inventory) {
                continue;
              }

              /*
               * Never restore inventory to a different
               * business, even if the data is inconsistent.
               */

              if (
                inventory.businessId !== existing.businessId
              ) {
                throw new Error(
                  "ORDER_ITEM_BUSINESS_MISMATCH",
                );
              }

              /*
               * Null means inventory tracking is currently off.
               */

              if (inventory.stockQuantity === null) {
                continue;
              }

              /*
               * Protect against exceeding the Prisma Int range.
               */

              if (
                inventory.stockQuantity >
                MAX_PRISMA_INT - item.quantity
              ) {
                throw new OrderUpdateError(
                  "The stock quantity cannot be restored because it would exceed the supported inventory limit.",
                  409,
                );
              }

              /*
               * Conditional update prevents overwriting a
               * concurrent inventory change.
               */

              const restored = await tx.product.updateMany({
                where: {
                  id: item.productId,
                  businessId: existing.businessId,
                  stockQuantity: inventory.stockQuantity,
                },

                data: {
                  stockQuantity: {
                    increment: item.quantity,
                  },
                },
              });

              if (restored.count !== 1) {
                throw new OrderUpdateError(
                  "Inventory changed while this order was being rejected. Refresh and try again.",
                  409,
                );
              }
            }
          }

          /*
           * --------------------------------------------------
           * RECALCULATE PARENT ORDER STATUS
           * --------------------------------------------------
           *
           * Read all seller order statuses after the update.
           *
           * Serializable isolation protects the aggregation
           * when different sellers update their seller orders
           * at the same time.
           * --------------------------------------------------
           */

          const siblingOrders =
            await tx.sellerOrder.findMany({
              where: {
                orderId: existing.orderId,
              },

              select: {
                status: true,
              },
            });

          const parentStatus = aggregateOrderStatus(
            siblingOrders.map(
              (sellerOrder) => sellerOrder.status,
            ),
          );

          await tx.order.update({
            where: {
              id: existing.orderId,
            },

            data: {
              status: parentStatus,

              completedAt:
                parentStatus === OrderStatus.COMPLETED
                  ? now
                  : null,

              cancelledAt:
                parentStatus === OrderStatus.CANCELLED
                  ? now
                  : null,
            },
          });

          /*
           * --------------------------------------------------
           * SUCCESS
           * --------------------------------------------------
           */

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

        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (error instanceof OrderUpdateError) {
        throw error;
      }

      /*
       * Concurrent order updates may cause a serialization
       * conflict. Retry a limited number of times.
       */

      if (isSerializationConflict(error)) {
        if (attempt < MAX_TRANSACTION_RETRIES - 1) {
          continue;
        }

        return {
          kind: "CONFLICT",
        };
      }

      throw error;
    }
  }

  return {
    kind: "CONFLICT",
  };
}

/* =========================================================
   PATCH SELLER ORDER STATUS
========================================================= */

type RouteContext = {
  params: Promise<{
    sellerOrderId: string;
  }>;
};

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    /*
     * --------------------------------------------------
     * AUTHENTICATION
     * --------------------------------------------------
     *
     * An inactive business owner should still be able
     * to fulfil orders already received.
     *
     * A deleted business cannot continue managing orders
     * through this seller route.
     * --------------------------------------------------
     */

    const access = await requireSellerAccount();

    if (!access.authorized) {
      return access.response;
    }

    const business = access.business;

    if (!business) {
      return jsonError(
        "You do not have a business linked to this seller account.",
        404,
      );
    }

    if (business.ownerId !== access.user.id) {
      return jsonError(
        "You are not allowed to manage this business.",
        403,
      );
    }

    if (business.deletedAt) {
      return jsonError(
        "This business has been deleted.",
        410,
      );
    }

    /*
     * --------------------------------------------------
     * ROUTE PARAMETER
     * --------------------------------------------------
     */

    const { sellerOrderId } = await context.params;

    if (
      !sellerOrderId ||
      sellerOrderId.trim().length === 0 ||
      sellerOrderId.length > MAX_ORDER_ID_LENGTH
    ) {
      return jsonError(
        "Invalid seller order reference.",
        400,
      );
    }

    /*
     * --------------------------------------------------
     * REQUEST BODY
     * --------------------------------------------------
     */

    const bodyResult = await readJsonBody(request);

    if (!bodyResult.valid) {
      return bodyResult.reason === "TOO_LARGE"
        ? jsonError(
            "Request body is too large.",
            413,
          )
        : jsonError(
            "Request body must contain valid JSON.",
            400,
          );
    }

    if (!isRecord(bodyResult.value)) {
      return jsonError(
        "A valid status is required.",
        400,
      );
    }

    const body = bodyResult.value;

    if (
      typeof body.status !== "string" ||
      body.status.trim() === ""
    ) {
      return jsonError(
        "A valid status is required.",
        400,
      );
    }

    const allowedBodyFields = new Set(["status"]);

    const unsupportedFields = Object.keys(body).filter(
      (key) => !allowedBodyFields.has(key),
    );

    if (unsupportedFields.length > 0) {
      return jsonError(
        `Unsupported fields: ${unsupportedFields.join(", ")}.`,
        400,
      );
    }

    const requestedStatus = body.status.trim();

    if (
      !Object.values(SellerOrderStatus).includes(
        requestedStatus as SellerOrderStatus,
      )
    ) {
      return jsonError(
        "Invalid seller order status.",
        400,
      );
    }

    /*
     * --------------------------------------------------
     * UPDATE ORDER
     * --------------------------------------------------
     */

    const result = await updateSellerOrderStatus({
      sellerOrderId,
      sellerId: access.user.id,
      businessId: business.id,
      requestedStatus:
        requestedStatus as SellerOrderStatus,
    });

    /*
     * --------------------------------------------------
     * HANDLE TRANSACTION RESULTS
     * --------------------------------------------------
     */

    if (result.kind === "NOT_FOUND") {
      return jsonError(
        "Seller order not found.",
        404,
      );
    }

    if (result.kind === "INVALID_TRANSITION") {
      return NextResponse.json(
        {
          error: "This status change is not allowed.",
          currentStatus: result.currentStatus,
        },
        {
          status: 409,
          headers: noStore,
        },
      );
    }

    if (result.kind === "CONFLICT") {
      return jsonError(
        "The order or its inventory was updated by another request. Refresh and try again.",
        409,
      );
    }

    /*
     * --------------------------------------------------
     * NOTIFY BUYER
     * --------------------------------------------------
     *
     * Notifications happen after the transaction commits.
     *
     * A notification failure must never undo an order update.
     * --------------------------------------------------
     */

    const notification = notificationDetails[
      result.sellerOrder.status
    ];

    if (notification) {
      try {
        await createNotification({
          userId: result.buyerId,

          type: notification.type,

          title: notification.title,

          message:
            `${result.businessName}: ` +
            notification.message,

          priority: notification.priority,

          dedupeKey:
            `seller-order:${result.sellerOrder.id}:` +
            `status:${result.sellerOrder.status}`,

          data: {
            orderId: result.orderId,
            orderCode: result.orderCode,

            sellerOrderId: result.sellerOrder.id,
            sellerOrderCode:
              result.sellerOrder.sellerOrderCode,

            status: result.sellerOrder.status,

            href:
              `/orders/${encodeURIComponent(result.orderId)}`,
          },
        });
      } catch (notificationError) {
        console.error(
          "BUYER_ORDER_NOTIFICATION_ERROR:",
          notificationError,
        );
      }
    }

    /*
     * --------------------------------------------------
     * SUCCESS RESPONSE
     * --------------------------------------------------
     */

    return NextResponse.json(
      {
        message: "Seller order updated successfully.",

        sellerOrder: result.sellerOrder,

        parentOrderStatus: result.parentOrderStatus,
      },
      {
        headers: noStore,
      },
    );
  } catch (error) {
    if (error instanceof OrderUpdateError) {
      return jsonError(
        error.message,
        error.status,
      );
    }

    console.error(
      "SELLER_ORDER_PATCH_ERROR:",
      error,
    );

    return jsonError(
      "Unable to update this seller order.",
      500,
    );
  }
}