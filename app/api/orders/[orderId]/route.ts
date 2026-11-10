
import { NextResponse } from "next/server";

import {
  NotificationPriority,
  NotificationType,
  OrderStatus,
  Prisma,
  SellerOrderStatus,
} from "@prisma/client";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_ORDER_ID_LENGTH = 100;
const MAX_PRISMA_INT = 2_147_483_647;
const MAX_TRANSACTION_RETRIES = 3;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/* =========================================================
   ERRORS
========================================================= */

class OrderCancellationError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "OrderCancellationError";
    this.status = status;
  }
}

function jsonError(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: noStore,
    },
  );
}

/* =========================================================
   ROUTE CONTEXT
========================================================= */

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

/* =========================================================
   ORDER ID VALIDATION
========================================================= */

async function getValidatedOrderId(
  context: RouteContext,
): Promise<string | null> {
  const { orderId } = await context.params;

  if (typeof orderId !== "string") {
    return null;
  }

  const validatedOrderId = orderId.trim();

  if (
    !validatedOrderId ||
    validatedOrderId.length > MAX_ORDER_ID_LENGTH
  ) {
    return null;
  }

  return validatedOrderId;
}

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
   TRANSACTION RESULT
========================================================= */

type CancelledSellerOrder = {
  id: string;
  sellerOrderCode: string;
  sellerId: string;
};

type CancellationResult =
  | {
      kind: "NOT_FOUND";
    }
  | {
      kind: "NOT_CANCELLABLE";
      statuses: SellerOrderStatus[];
    }
  | {
      kind: "ALREADY_CANCELLED";
      orderCode: string;
    }
  | {
      kind: "CONFLICT";
    }
  | {
      kind: "SUCCESS";
      orderId: string;
      orderCode: string;
      sellerOrders: CancelledSellerOrder[];
    };

/* =========================================================
   BUYER ORDER CANCELLATION TRANSACTION
========================================================= */

async function cancelBuyerOrder(
  input: {
    orderId: string;
    buyerId: string;
  },
): Promise<CancellationResult> {
  for (
    let attempt = 0;
    attempt < MAX_TRANSACTION_RETRIES;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx): Promise<CancellationResult> => {
          /*
           * --------------------------------------------------
           * 1. FIND BUYER ORDER
           * --------------------------------------------------
           *
           * Only the authenticated buyer can cancel
           * their own order.
           *
           * Retrieve all seller orders and their inventory
           * reservation information.
           * --------------------------------------------------
           */

          const order = await tx.order.findFirst({
            where: {
              id: input.orderId,
              buyerId: input.buyerId,
            },

            select: {
              id: true,
              orderCode: true,
              status: true,

              sellerOrders: {
                orderBy: {
                  createdAt: "asc",
                },

                select: {
                  id: true,
                  sellerOrderCode: true,
                  sellerId: true,
                  businessId: true,
                  status: true,
                  inventoryReleasedAt: true,

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

          if (!order) {
            return {
              kind: "NOT_FOUND",
            };
          }

          /*
           * --------------------------------------------------
           * 2. IDEMPOTENT ALREADY-CANCELLED CHECK
           * --------------------------------------------------
           *
           * Repeated cancellation requests must not restore
           * inventory again.
           *
           * A parent order cancelled because every seller
           * rejected it is not treated as buyer cancellation.
           * --------------------------------------------------
           */

          if (
            order.sellerOrders.length > 0 &&
            order.sellerOrders.every(
              (sellerOrder) =>
                sellerOrder.status ===
                SellerOrderStatus.CANCELLED,
            )
          ) {
            return {
              kind: "ALREADY_CANCELLED",
              orderCode: order.orderCode,
            };
          }

          /*
           * --------------------------------------------------
           * 3. VERIFY CANCELLATION ELIGIBILITY
           * --------------------------------------------------
           *
           * A buyer can cancel this parent order only when:
           *
           * - The parent order is still PLACED.
           * - At least one seller order exists.
           * - Every seller order is PENDING_ACCEPTANCE.
           *
           * This prevents cancellation after a seller
           * has accepted or begun processing an order.
           * --------------------------------------------------
           */

          const statuses = order.sellerOrders.map(
            (sellerOrder) => sellerOrder.status,
          );

          const canCancel =
            order.status === OrderStatus.PLACED &&
            order.sellerOrders.length > 0 &&
            order.sellerOrders.every(
              (sellerOrder) =>
                sellerOrder.status ===
                  SellerOrderStatus.PENDING_ACCEPTANCE &&
                sellerOrder.inventoryReleasedAt === null,
            );

          if (!canCancel) {
            return {
              kind: "NOT_CANCELLABLE",
              statuses,
            };
          }

          const now = new Date();

          /*
           * --------------------------------------------------
           * 4. CANCEL EACH SELLER ORDER
           * --------------------------------------------------
           *
           * Each update is conditional.
           *
           * If another operation changes a seller order
           * during cancellation, the entire transaction
           * must roll back.
           * --------------------------------------------------
           */

          const cancelledSellerOrders: CancelledSellerOrder[] =
            [];

          for (const sellerOrder of order.sellerOrders) {
            const updatedSellerOrder =
              await tx.sellerOrder.updateMany({
                where: {
                  id: sellerOrder.id,
                  orderId: order.id,
                  status: SellerOrderStatus.PENDING_ACCEPTANCE,
                  inventoryReleasedAt: null,
                },

                data: {
                  status: SellerOrderStatus.CANCELLED,
                  cancelledAt: now,
                  inventoryReleasedAt: now,
                },
              });

            if (updatedSellerOrder.count !== 1) {
              throw new OrderCancellationError(
                "The seller order changed while cancellation was processing. Please refresh and try again.",
                409,
              );
            }

            /*
             * --------------------------------------------------
             * 5. RESTORE RESERVED INVENTORY
             * --------------------------------------------------
             *
             * Restore only items with inventoryReserved=true.
             *
             * Untracked products are never incremented.
             *
             * A deleted product has no inventory record
             * left to restore.
             * --------------------------------------------------
             */

            for (const item of sellerOrder.items) {
              if (!item.inventoryReserved) {
                continue;
              }

              if (!item.productId) {
                // Original product record was deleted.
                continue;
              }

              if (
                !Number.isSafeInteger(item.quantity) ||
                item.quantity <= 0
              ) {
                throw new OrderCancellationError(
                  "An order item has an invalid quantity. Inventory could not be restored.",
                  409,
                );
              }

              /*
               * Find current inventory.
               */

              const inventory = await tx.product.findUnique({
                where: {
                  id: item.productId,
                },

                select: {
                  businessId: true,
                  stockQuantity: true,
                },
              });

              if (!inventory) {
                // Hard-deleted product.
                continue;
              }

              /*
               * Ensure inventory belongs to the same seller.
               */

              if (
                inventory.businessId !== sellerOrder.businessId
              ) {
                throw new OrderCancellationError(
                  "A product does not belong to the expected seller. Inventory was not restored.",
                  409,
                );
              }

              /*
               * Null means inventory tracking is currently
               * disabled. Do not modify it.
               */

              if (inventory.stockQuantity === null) {
                continue;
              }

              if (
                !Number.isSafeInteger(inventory.stockQuantity) ||
                inventory.stockQuantity < 0
              ) {
                throw new OrderCancellationError(
                  "The current inventory value is invalid. Inventory was not restored.",
                  409,
                );
              }

              /*
               * Prevent Prisma Int overflow.
               */

              if (
                inventory.stockQuantity >
                MAX_PRISMA_INT - item.quantity
              ) {
                throw new OrderCancellationError(
                  "The stock quantity cannot be restored because it would exceed the supported inventory limit.",
                  409,
                );
              }

              /*
               * Conditional update prevents overwriting
               * concurrent inventory changes.
               */

              const restored = await tx.product.updateMany({
                where: {
                  id: item.productId,
                  businessId: sellerOrder.businessId,
                  stockQuantity: inventory.stockQuantity,
                },

                data: {
                  stockQuantity: {
                    increment: item.quantity,
                  },
                },
              });

              if (restored.count !== 1) {
                throw new OrderCancellationError(
                  "Inventory changed while cancellation was processing. Please refresh and try again.",
                  409,
                );
              }
            }

            cancelledSellerOrders.push({
              id: sellerOrder.id,
              sellerOrderCode: sellerOrder.sellerOrderCode,
              sellerId: sellerOrder.sellerId,
            });
          }

          /*
           * --------------------------------------------------
           * 6. CANCEL PARENT ORDER
           * --------------------------------------------------
           *
           * All seller orders have now been cancelled.
           *
           * The parent order is updated in the same transaction.
           * --------------------------------------------------
           */

          const updatedParentOrder =
            await tx.order.updateMany({
              where: {
                id: order.id,
                buyerId: input.buyerId,
                status: OrderStatus.PLACED,
              },

              data: {
                status: OrderStatus.CANCELLED,
                cancelledAt: now,
                completedAt: null,
              },
            });

          if (updatedParentOrder.count !== 1) {
            throw new OrderCancellationError(
              "The order changed while cancellation was processing. Please refresh and try again.",
              409,
            );
          }

          /*
           * --------------------------------------------------
           * 7. SUCCESS
           * --------------------------------------------------
           */

          return {
            kind: "SUCCESS",

            orderId: order.id,
            orderCode: order.orderCode,

            sellerOrders: cancelledSellerOrders,
          };
        },

        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (error instanceof OrderCancellationError) {
        throw error;
      }

      /*
       * Retry serialization conflicts.
       *
       * The transaction is rolled back before retrying.
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
   GET BUYER ORDER DETAILS

   GET /api/orders/[orderId]

   Buyers can only retrieve orders belonging to
   their authenticated account.
========================================================= */

export async function GET(
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

    const orderId = await getValidatedOrderId(context);

    if (!orderId) {
      return jsonError(
        "Invalid order reference.",
        400,
      );
    }

    /*
     * 3. RETRIEVE BUYER ORDER
     */

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        buyerId: access.user.id,
      },

      select: {
        /* PARENT ORDER */

        id: true,
        orderCode: true,
        status: true,

        itemsSubtotal: true,
        deliveryFee: true,
        totalAmount: true,
        deliveryFeeStatus: true,
        currency: true,

        /* DELIVERY DETAILS */

        deliveryRecipient: true,
        deliveryPhone: true,
        deliveryAddress: true,
        deliveryArea: true,
        deliveryLandmark: true,
        deliveryNotes: true,

        /* ORDER TIMESTAMPS */

        createdAt: true,
        updatedAt: true,
        completedAt: true,
        cancelledAt: true,

        /* SELLER ORDERS */

        sellerOrders: {
          orderBy: [
            {
              createdAt: "asc",
            },
            {
              id: "asc",
            },
          ],

          select: {
            id: true,
            sellerOrderCode: true,
            status: true,
            subtotal: true,

            acceptedAt: true,
            rejectedAt: true,
            dispatchedAt: true,
            deliveredAt: true,
            completedAt: true,
            cancelledAt: true,

            /* BUSINESS DETAILS */

            business: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
              },
            },

            /* ORDERED PRODUCT SNAPSHOTS */

            items: {
              orderBy: [
                {
                  createdAt: "asc",
                },
                {
                  id: "asc",
                },
              ],

              select: {
                id: true,
                productId: true,
                productName: true,
                productImageUrl: true,
                unitPrice: true,
                quantity: true,
                lineTotal: true,
                createdAt: true,
              },
            },
          },
        },

        /* PAYMENT RECORDS */

        payments: {
          orderBy: [
            {
              createdAt: "desc",
            },
            {
              id: "desc",
            },
          ],

          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            failureReason: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    });

    /*
     * 4. HANDLE MISSING ORDER
     */

    if (!order) {
      return jsonError(
        "Order not found.",
        404,
      );
    }

    /*
     * 5. SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        success: true,
        order,
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error(
      "Buyer order details GET error:",
      error,
    );

    return jsonError(
      "Unable to retrieve this order.",
      500,
    );
  }
}

/* =========================================================
   DELETE BUYER ORDER

   DELETE /api/orders/[orderId]

   Cancels the entire parent order only while every
   seller order is still PENDING_ACCEPTANCE.

   Inventory restoration and cancellation are atomic.
========================================================= */

export async function DELETE(
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

    const orderId = await getValidatedOrderId(context);

    if (!orderId) {
      return jsonError(
        "Invalid order reference.",
        400,
      );
    }

    /*
     * 3. CANCEL ORDER
     */

    const result = await cancelBuyerOrder({
      orderId,
      buyerId: access.user.id,
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

    if (result.kind === "NOT_CANCELLABLE") {
      return NextResponse.json(
        {
          error:
            "This order can no longer be cancelled because one or more sellers have already responded or started processing it.",

          sellerOrderStatuses: result.statuses,
        },
        {
          status: 409,
          headers: noStore,
        },
      );
    }

    if (result.kind === "CONFLICT") {
      return jsonError(
        "The order or its inventory changed during cancellation. Refresh and try again.",
        409,
      );
    }

    /*
     * 5. ALREADY CANCELLED
     *
     * Repeated cancellation requests do not release
     * inventory again.
     */

    if (result.kind === "ALREADY_CANCELLED") {
      return NextResponse.json(
        {
          success: true,
          message: "This order has already been cancelled.",

          order: {
            orderCode: result.orderCode,
            status: OrderStatus.CANCELLED,
          },
        },
        {
          status: 200,
          headers: noStore,
        },
      );
    }

    /*
     * 6. NOTIFY SELLERS
     *
     * Notifications are sent after the transaction commits.
     * A notification failure does not undo cancellation.
     */

    const notificationResults = await Promise.allSettled(
      result.sellerOrders.map((sellerOrder) =>
        createNotification({
          userId: sellerOrder.sellerId,

          type: NotificationType.ORDER_CANCELLED,

          title: "Buyer cancelled an order",

          message:
            `The buyer has cancelled order (${sellerOrder.sellerOrderCode}).`,

          priority: NotificationPriority.NORMAL,

          dedupeKey:
            `buyer-cancelled-order:${sellerOrder.id}`,

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
    );

    for (const notificationResult of notificationResults) {
      if (notificationResult.status === "rejected") {
        console.error(
          "BUYER_ORDER_CANCELLATION_NOTIFICATION_ERROR:",
          notificationResult.reason,
        );
      }
    }

    /*
     * 7. SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        success: true,
        message: "Your order has been cancelled successfully.",

        order: {
          id: result.orderId,
          orderCode: result.orderCode,
          status: OrderStatus.CANCELLED,
        },

        sellerOrders: result.sellerOrders.map(
          (sellerOrder) => ({
            id: sellerOrder.id,
            sellerOrderCode: sellerOrder.sellerOrderCode,
            status: SellerOrderStatus.CANCELLED,
          }),
        ),
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    if (error instanceof OrderCancellationError) {
      return jsonError(
        error.message,
        error.status,
      );
    }

    console.error(
      "Buyer order cancellation error:",
      error,
    );

    return jsonError(
      "Unable to cancel this order.",
      500,
    );
  }
}
