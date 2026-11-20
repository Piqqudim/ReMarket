import {
  NotificationPriority,
  NotificationType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  SellerOrderStatus,
} from "@prisma/client";

import { confirmPaystackPayment } from "@/lib/paystack-payment-confirmation";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const EXPIRY_GRACE_MS = 10 * 60 * 1000;
const MAX_PRISMA_INT = 2_147_483_647;
const MAX_RETRIES = 3;

type ExpiryResult =
  | { kind: "EXPIRED"; orderId: string; orderCode: string; buyerId: string; sellerOrders: Array<{ id: string; sellerId: string; sellerOrderCode: string }>; restoredLineItems: number; restoredUnits: number; skippedDeletedProducts: number }
  | { kind: "SKIPPED"; orderId: string; reason: string }
  | { kind: "CONFLICT"; orderId: string };

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

/**
 * Expires unpaid checkouts after the 30-minute checkout window plus a short
 * webhook/verification grace period. Every stock release is guarded by the
 * parent and seller-order states and committed in one serializable transaction.
 */
async function expireOneCheckout(orderId: string, now: Date): Promise<ExpiryResult> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx): Promise<ExpiryResult> => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            orderCode: true,
            buyerId: true,
            status: true,
            paidAt: true,
            paymentExpiresAt: true,
            payments: { select: { status: true } },
            sellerOrders: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                sellerId: true,
                sellerOrderCode: true,
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

        if (!order) return { kind: "SKIPPED", orderId, reason: "Order no longer exists." };
        if (
          order.status !== OrderStatus.PENDING_PAYMENT ||
          !order.paymentExpiresAt ||
          order.paymentExpiresAt.getTime() + EXPIRY_GRACE_MS > now.getTime()
        ) {
          return { kind: "SKIPPED", orderId, reason: "Order is no longer eligible for expiry." };
        }

        if (order.paidAt || order.payments.some((payment) => payment.status === PaymentStatus.SUCCESS)) {
          return { kind: "SKIPPED", orderId, reason: "A successful payment exists; stock was not released." };
        }
        if (
          order.payments.length === 0 ||
          order.payments.some((payment) =>
            payment.status !== PaymentStatus.FAILED &&
            payment.status !== PaymentStatus.CANCELLED
          )
        ) {
          return { kind: "SKIPPED", orderId, reason: "One or more Paystack attempts are not conclusively failed or cancelled; stock was not released." };
        }
        if (order.sellerOrders.length === 0) {
          return { kind: "SKIPPED", orderId, reason: "Order has no seller orders; manual review is required." };
        }
        if (order.sellerOrders.some((sellerOrder) =>
          sellerOrder.status !== SellerOrderStatus.PENDING_ACCEPTANCE ||
          sellerOrder.inventoryReleasedAt !== null,
        )) {
          return { kind: "SKIPPED", orderId, reason: "Seller fulfilment has started or inventory was already released." };
        }

        // Aggregate per product so an item can only be restored once, even if
        // a malformed historical order contains duplicate product rows.
        const quantitiesByProduct = new Map<string, { businessId: string; quantity: number; lineCount: number }>();
        let skippedDeletedProducts = 0;
        for (const sellerOrder of order.sellerOrders) {
          for (const item of sellerOrder.items) {
            if (!item.inventoryReserved) continue;
            if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
              throw new Error("An expired order contains an invalid reserved quantity. Inventory was not released.");
            }
            if (!item.productId) {
              skippedDeletedProducts += 1;
              continue;
            }
            const current = quantitiesByProduct.get(item.productId);
            if (current) {
              if (current.businessId !== sellerOrder.businessId) {
                throw new Error("A reserved product is linked to more than one seller. Inventory was not released.");
              }
              current.quantity += item.quantity;
              current.lineCount += 1;
            } else {
              quantitiesByProduct.set(item.productId, {
                businessId: sellerOrder.businessId,
                quantity: item.quantity,
                lineCount: 1,
              });
            }
          }
        }

        const inventoryRows = [];
        let restoredLineItems = 0;
        let restoredUnits = 0;
        for (const [productId, requested] of quantitiesByProduct) {
          const product = await tx.product.findUnique({
            where: { id: productId },
            select: { businessId: true, stockQuantity: true },
          });
          // Deleted products have no current inventory to restore. Their
          // historical order snapshot is retained on the seller order.
          if (!product) {
            skippedDeletedProducts += requested.lineCount;
            continue;
          }
          if (product.businessId !== requested.businessId) {
            throw new Error("A reserved product no longer belongs to its original seller. Inventory was not released.");
          }
          // null means stock tracking was disabled; there is no quantity to add.
          if (product.stockQuantity === null) continue;
          if (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0) {
            throw new Error("Current product inventory is invalid. Inventory was not released.");
          }
          if (product.stockQuantity > MAX_PRISMA_INT - requested.quantity) {
            throw new Error("Restoring expired checkout stock would exceed the supported inventory limit.");
          }
          inventoryRows.push({ productId, businessId: requested.businessId, stockQuantity: product.stockQuantity, quantity: requested.quantity, lineCount: requested.lineCount });
        }

        const cancelledAt = now;
        for (const sellerOrder of order.sellerOrders) {
          const sellerUpdate = await tx.sellerOrder.updateMany({
            where: {
              id: sellerOrder.id,
              orderId: order.id,
              status: SellerOrderStatus.PENDING_ACCEPTANCE,
              inventoryReleasedAt: null,
            },
            data: {
              status: SellerOrderStatus.CANCELLED,
              cancelledAt,
              inventoryReleasedAt: cancelledAt,
            },
          });
          if (sellerUpdate.count !== 1) {
            throw new Error("A seller order changed while the expired checkout was being released.");
          }
        }

        for (const inventory of inventoryRows) {
          const restored = await tx.product.updateMany({
            where: {
              id: inventory.productId,
              businessId: inventory.businessId,
              stockQuantity: inventory.stockQuantity,
            },
            data: { stockQuantity: { increment: inventory.quantity } },
          });
          if (restored.count !== 1) {
            throw new Error("Product inventory changed while the expired checkout was being released.");
          }
          restoredLineItems += inventory.lineCount;
          restoredUnits += inventory.quantity;
        }

        const orderUpdate = await tx.order.updateMany({
          where: {
            id: order.id,
            status: OrderStatus.PENDING_PAYMENT,
            paidAt: null,
            paymentExpiresAt: { lte: new Date(now.getTime() - EXPIRY_GRACE_MS) },
          },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt,
            completedAt: null,
          },
        });
        if (orderUpdate.count !== 1) {
          throw new Error("The parent order changed while the expired checkout was being released.");
        }

        return {
          kind: "EXPIRED",
          orderId: order.id,
          orderCode: order.orderCode,
          buyerId: order.buyerId,
          sellerOrders: order.sellerOrders.map((sellerOrder) => ({
            id: sellerOrder.id,
            sellerId: sellerOrder.sellerId,
            sellerOrderCode: sellerOrder.sellerOrderCode,
          })),
          restoredLineItems,
          restoredUnits,
          skippedDeletedProducts,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error) && attempt < MAX_RETRIES - 1) continue;
      throw error;
    }
  }
  return { kind: "CONFLICT", orderId };
}

/**
 * Rechecks outstanding Paystack payment attempts before stock is released.
 * A successful or ambiguous provider response prevents expiry in this run.
 */
export async function expireExpiredCheckouts(limit = 50) {
  const now = new Date();
  const eligibleBefore = new Date(now.getTime() - EXPIRY_GRACE_MS);
  const candidates = await prisma.order.findMany({
    where: {
      status: OrderStatus.PENDING_PAYMENT,
      paidAt: null,
      paymentExpiresAt: { lte: eligibleBefore },
    },
    orderBy: [{ paymentExpiresAt: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(limit, 100)),
    select: {
      id: true,
      payments: {
        where: { provider: "PAYSTACK" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { status: true, providerReference: true },
      },
    },
  });

  const results: Array<{ orderId: string; status: string; message?: string; restoredUnits?: number }> = [];
  for (const candidate of candidates) {
    try {
      let verificationFailed = false;
      let verificationPending = false;
      if (candidate.payments.length === 0) {
        verificationFailed = true;
      }
      for (const payment of candidate.payments) {
        if (payment.status === PaymentStatus.SUCCESS) {
          verificationPending = true;
          break;
        }
        if (payment.status === PaymentStatus.FAILED || payment.status === PaymentStatus.CANCELLED) {
          // These are only treated as final after Paystack confirmation or a
          // definitive initialization rejection has updated the local record.
          continue;
        }
        if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.INITIATED) {
          verificationFailed = true;
          break;
        }
        if (!payment.providerReference) {
          verificationFailed = true;
          break;
        }
        try {
          const verification = await confirmPaystackPayment(payment.providerReference);
          if (verification.paymentStatus === "PENDING" || verification.paymentStatus === "SUCCESS") {
            // A pending charge is not proof that funds were not received. A
            // success may also be under manual review because it arrived late.
            // In either case leave reserved stock untouched for reconciliation.
            verificationPending = true;
            break;
          }
        } catch (error) {
          verificationFailed = true;
          console.error("EXPIRED_CHECKOUT_PAYMENT_RECHECK_ERROR:", {
            orderId: candidate.id,
            reason: error instanceof Error ? error.message : "Paystack recheck failed.",
          });
          break;
        }
      }
      if (verificationFailed) {
        results.push({ orderId: candidate.id, status: "REQUIRES_RECHECK", message: "Paystack could not be conclusively rechecked; inventory was left reserved." });
        continue;
      }
      if (verificationPending) {
        results.push({ orderId: candidate.id, status: "PAYMENT_PENDING", message: "Paystack has not returned a conclusive final failure; inventory remains reserved." });
        continue;
      }

      const result = await expireOneCheckout(candidate.id, new Date());
      if (result.kind === "EXPIRED") {
        const notificationJobs = [
          createNotification({
            userId: result.buyerId,
            type: NotificationType.ORDER_CANCELLED,
            title: "Checkout expired",
            message: `Your ReMarket checkout (${result.orderCode}) expired before payment was confirmed. Reserved stock has been released.`,
            priority: NotificationPriority.NORMAL,
            dedupeKey: `expired-checkout:${result.orderId}:buyer`,
            data: {
              orderId: result.orderId,
              orderCode: result.orderCode,
              status: OrderStatus.CANCELLED,
              href: `/orders/${encodeURIComponent(result.orderId)}`,
            } as Prisma.InputJsonValue,
          }),
          ...result.sellerOrders.map((sellerOrder) =>
            createNotification({
              userId: sellerOrder.sellerId,
              type: NotificationType.ORDER_CANCELLED,
              title: "Unpaid checkout expired",
              message: `Seller order (${sellerOrder.sellerOrderCode}) expired before buyer payment was confirmed. Reserved stock has been released.`,
              priority: NotificationPriority.LOW,
              dedupeKey: `expired-checkout:${sellerOrder.id}:seller`,
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
        const notifications = await Promise.allSettled(notificationJobs);
        for (const item of notifications) {
          if (item.status === "rejected") {
            console.error("EXPIRED_CHECKOUT_NOTIFICATION_ERROR:", item.reason);
          }
        }
        results.push({ orderId: result.orderId, status: "CANCELLED", restoredUnits: result.restoredUnits });
      } else {
        results.push({ orderId: candidate.id, status: result.kind, message: result.kind === "SKIPPED" ? result.reason : "Concurrent update; retry on the next scheduled run." });
      }
    } catch (error) {
      console.error("EXPIRED_CHECKOUT_PROCESSING_ERROR:", { orderId: candidate.id, error });
      results.push({ orderId: candidate.id, status: "ERROR", message: "Checkout expiry failed; inventory was not confirmed released." });
    }
  }

  return {
    processed: results.length,
    expired: results.filter((item) => item.status === "CANCELLED").length,
    results,
    generatedAt: new Date().toISOString(),
  };
}
