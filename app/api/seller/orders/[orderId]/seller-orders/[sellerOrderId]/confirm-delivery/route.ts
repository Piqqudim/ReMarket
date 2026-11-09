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

const MAX_ORDER_ID_LENGTH = 100;
const MAX_TRANSACTION_RETRIES = 3;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

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

  const allFinal = statuses.every((status) =>
    finalStatuses.has(status),
  );

  const completedCount = statuses.filter(
    (status) => status === SellerOrderStatus.COMPLETED,
  ).length;

  const hasCancellation = statuses.some(
    (status) =>
      status === SellerOrderStatus.REJECTED ||
      status === SellerOrderStatus.CANCELLED,
  );

  // All seller orders have reached a final status.
  if (allFinal) {
    if (completedCount === statuses.length) {
      return OrderStatus.COMPLETED;
    }

    if (completedCount > 0) {
      return OrderStatus.PARTIALLY_CANCELLED;
    }

    return OrderStatus.CANCELLED;
  }

  // At least one seller order was cancelled or rejected.
  if (hasCancellation) {
    return OrderStatus.PARTIALLY_CANCELLED;
  }

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
   ROUTE CONTEXT
========================================================= */

type RouteContext = {
  params: Promise<{
    orderId: string;
    sellerOrderId: string;
  }>;
};

/* =========================================================
   TRANSACTION RESULT
========================================================= */

type ConfirmResult =
  | {
      kind: "NOT_FOUND";
    }
  | {
      kind: "INVALID_STATUS";
      currentStatus: SellerOrderStatus;
    }
  | {
      kind: "CONFLICT";
    }
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
    };

/* =========================================================
   SERIALIZATION CONFLICT
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
   CONFIRM DELIVERY TRANSACTION
========================================================= */

async function confirmSellerOrderDelivery(
  input: {
    buyerId: string;
    orderId: string;
    sellerOrderId: string;
  },
): Promise<ConfirmResult> {
  for (
    let attempt = 0;
    attempt < MAX_TRANSACTION_RETRIES;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx): Promise<ConfirmResult> => {
          /*
           * 1. VERIFY PARENT ORDER OWNERSHIP
           *
           * The parent order must belong to the
           * currently authenticated buyer.
           */

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

          if (!parentOrder) {
            return {
              kind: "NOT_FOUND",
            };
          }

          /*
           * 2. VERIFY SELLER ORDER
           *
           * The seller order must belong to this
           * particular parent order.
           */

          const sellerOrder =
            await tx.sellerOrder.findFirst({
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
              },
            });

          if (!sellerOrder) {
            return {
              kind: "NOT_FOUND",
            };
          }

          /*
           * 3. IDEMPOTENCY
           *
           * If delivery has already been confirmed,
           * return success without processing it again.
           */

          if (
            sellerOrder.status ===
            SellerOrderStatus.COMPLETED
          ) {
            return {
              kind: "ALREADY_COMPLETED",

              sellerId: sellerOrder.sellerId,

              orderId: parentOrder.id,
              orderCode: parentOrder.orderCode,

              sellerOrderId: sellerOrder.id,
              sellerOrderCode: sellerOrder.sellerOrderCode,

              sellerOrderCompletedAt:
                sellerOrder.completedAt,

              parentOrderStatus: parentOrder.status,

              parentOrderCompletedAt:
                parentOrder.completedAt,
            };
          }

          /*
           * 4. ONLY DELIVERED ORDERS CAN BE CONFIRMED
           */

          if (
            sellerOrder.status !==
            SellerOrderStatus.DELIVERED
          ) {
            return {
              kind: "INVALID_STATUS",
              currentStatus: sellerOrder.status,
            };
          }

          const now = new Date();

          /*
           * 5. CONDITIONAL COMPLETION
           *
           * Only one request can change the seller
           * order from DELIVERED to COMPLETED.
           */

          const updated =
            await tx.sellerOrder.updateMany({
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

          if (updated.count !== 1) {
            return {
              kind: "CONFLICT",
            };
          }

          /*
           * 6. RECALCULATE PARENT ORDER STATUS
           *
           * The parent order is COMPLETED only when
           * every seller order has been completed.
           */

          const siblingOrders =
            await tx.sellerOrder.findMany({
              where: {
                orderId: parentOrder.id,
              },

              select: {
                status: true,
              },
            });

          const parentStatus = aggregateOrderStatus(
            siblingOrders.map(
              (item) => item.status,
            ),
          );

          const parentCompletedAt =
            parentStatus === OrderStatus.COMPLETED
              ? now
              : null;

          /*
           * 7. UPDATE PARENT ORDER
           *
           * Ownership is checked again during the update.
           */

          const updatedParent = await tx.order.updateMany({
            where: {
              id: parentOrder.id,
              buyerId: input.buyerId,
            },

            data: {
              status: parentStatus,
              completedAt: parentCompletedAt,

              cancelledAt:
                parentStatus === OrderStatus.CANCELLED
                  ? now
                  : null,
            },
          });

          if (updatedParent.count !== 1) {
            return {
              kind: "CONFLICT",
            };
          }

          /*
           * 8. RETURN SUCCESS
           */

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
          };
        },

        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      /*
       * Retry PostgreSQL serialization conflicts.
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
   BUYER CONFIRMS DELIVERY

   PATCH /api/orders/[orderId]/seller-orders/
   [sellerOrderId]/confirm-delivery
========================================================= */

export async function PATCH(
  _request: Request,
  context: RouteContext,
) {
  try {
    /*
     * 1. BUYER AUTHENTICATION
     */

    const access = await requireBuyer();

    if (!access.authorized) {
      return access.response;
    }

    /*
     * 2. ROUTE PARAMETER VALIDATION
     */

    const { orderId, sellerOrderId } =
      await context.params;

    if (
      typeof orderId !== "string" ||
      typeof sellerOrderId !== "string"
    ) {
      return jsonError(
        "Invalid order reference.",
        400,
      );
    }

    const validatedOrderId = orderId.trim();
    const validatedSellerOrderId = sellerOrderId.trim();

    if (
      !validatedOrderId ||
      !validatedSellerOrderId ||
      validatedOrderId.length > MAX_ORDER_ID_LENGTH ||
      validatedSellerOrderId.length > MAX_ORDER_ID_LENGTH
    ) {
      return jsonError(
        "Invalid order reference.",
        400,
      );
    }

    /*
     * 3. CONFIRM DELIVERY
     */

    const result = await confirmSellerOrderDelivery({
      buyerId: access.user.id,
      orderId: validatedOrderId,
      sellerOrderId: validatedSellerOrderId,
    });

    /*
     * 4. HANDLE TRANSACTION RESULTS
     */

    if (result.kind === "NOT_FOUND") {
      return jsonError(
        "Order not found in your account.",
        404,
      );
    }

    if (result.kind === "INVALID_STATUS") {
      return NextResponse.json(
        {
          error:
            "You can only confirm an order after the seller marks it as delivered.",

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
        "This order was updated by another request. Refresh and try again.",
        409,
      );
    }

    /*
     * 5. ALREADY COMPLETED
     *
     * Return success without creating another notification.
     */

    if (result.kind === "ALREADY_COMPLETED") {
      return NextResponse.json(
        {
          success: true,
          message: "Delivery has already been confirmed.",

          sellerOrder: {
            id: result.sellerOrderId,
            sellerOrderCode: result.sellerOrderCode,
            status: SellerOrderStatus.COMPLETED,

            completedAt:
              result.sellerOrderCompletedAt?.toISOString() ?? null,
          },

          order: {
            status: result.parentOrderStatus,

            completedAt:
              result.parentOrderCompletedAt?.toISOString() ?? null,
          },
        },
        {
          status: 200,
          headers: noStore,
        },
      );
    }

    /*
     * 6. NOTIFY SELLER
     *
     * Notification failure must not undo a
     * successfully completed order.
     */

    try {
      await createNotification({
        userId: result.sellerId,

        type: NotificationType.ORDER_STATUS_UPDATED,

        title: "Buyer confirmed delivery",

        message:
          `The buyer has confirmed delivery for order (${result.sellerOrderCode}).`,

        priority: NotificationPriority.NORMAL,

        dedupeKey:
          `seller-order:${result.sellerOrderId}:buyer-confirmed-delivery`,

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

    /*
     * 7. SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        success: true,
        message: "Delivery confirmed successfully.",

        sellerOrder: {
          id: result.sellerOrderId,
          sellerOrderCode: result.sellerOrderCode,
          status: SellerOrderStatus.COMPLETED,

          completedAt:
            result.sellerOrderCompletedAt.toISOString(),
        },

        order: {
          status: result.parentOrderStatus,

          completedAt:
            result.parentOrderCompletedAt?.toISOString() ?? null,
        },
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error(
      "BUYER_CONFIRM_DELIVERY_ERROR:",
      error,
    );

    return jsonError(
      "Unable to confirm delivery.",
      500,
    );
  }
}