import {
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { verifyPaystackTransaction } from "@/lib/paystack";

export type PaystackConfirmationResult = {
  paymentStatus: "SUCCESS" | "FAILED" | "CANCELLED" | "PENDING";
  orderStatus: string;
  orderId: string;
  orderCode: string;
  paymentReference: string;
  paidAt: string | null;
  newlyConfirmed: boolean;
  requiresManualReview: boolean;
  message: string;
};

type WebhookReceiptInput = {
  eventKey: string;
  payload: Prisma.InputJsonValue;
};

class PaymentConfirmationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PaymentConfirmationError";
    this.status = status;
  }
}

function mapPaymentMethod(channel: string | null | undefined) {
  switch ((channel ?? "").toLowerCase()) {
    case "card":
      return "CARD" as const;
    case "bank_transfer":
    case "bank":
      return "BANK_TRANSFER" as const;
    case "ussd":
      return "USSD" as const;
    default:
      return "OTHER" as const;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeMetadata(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return isRecord(value) ? (value as Prisma.JsonObject) : {};
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function sendPaymentNotifications(input: {
  buyerId: string;
  orderId: string;
  orderCode: string;
  sellerOrders: Array<{
    id: string;
    sellerOrderCode: string;
    sellerId: string;
  }>;
}) {
  const jobs = [
    createNotification({
      userId: input.buyerId,
      type: NotificationType.PAYMENT_SUCCESS,
      title: "Payment confirmed",
      message: `Your payment for order ${input.orderCode} has been confirmed.`,
      priority: NotificationPriority.HIGH,
      dedupeKey: `paystack-payment-success:${input.orderId}`,
      data: {
        orderId: input.orderId,
        orderCode: input.orderCode,
        href: `/orders/${input.orderId}`,
      } as Prisma.InputJsonValue,
    }),
    ...input.sellerOrders.map((sellerOrder) =>
      createNotification({
        userId: sellerOrder.sellerId,
        type: NotificationType.ORDER_PLACED,
        title: "Paid order received",
        message: `A paid order (${sellerOrder.sellerOrderCode}) is ready for your review.`,
        priority: NotificationPriority.HIGH,
        dedupeKey: `order-placed:${sellerOrder.id}`,
        data: {
          orderId: input.orderId,
          orderCode: input.orderCode,
          sellerOrderId: sellerOrder.id,
          sellerOrderCode: sellerOrder.sellerOrderCode,
          href: "/seller/orders",
        } as Prisma.InputJsonValue,
      }),
    ),
  ];

  const results = await Promise.allSettled(jobs);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("PAYSTACK_PAYMENT_NOTIFICATION_ERROR:", result.reason);
    }
  }
}

/**
 * Verify a Paystack transaction from Paystack's server API, then atomically
 * update the payment/order, remove only purchased quantities from the cart,
 * and optionally mark a signed webhook receipt processed.
 *
 * A callback query string or webhook body alone is never treated as proof
 * of payment. The provider's verify endpoint is authoritative.
 */
export async function confirmPaystackPayment(
  reference: string,
  options: { webhookReceipt?: WebhookReceiptInput } = {},
): Promise<PaystackConfirmationResult> {
  const normalizedReference = reference.trim();
  if (
    !normalizedReference ||
    normalizedReference.length > 120 ||
    !/^[a-zA-Z0-9.\-=]+$/.test(normalizedReference)
  ) {
    throw new PaymentConfirmationError("Invalid payment reference.", 400);
  }

  const existingPayment = await prisma.payment.findUnique({
    where: { providerReference: normalizedReference },
    include: {
      order: {
        include: {
          buyer: { select: { id: true, email: true } },
          sellerOrders: {
            include: {
              items: {
                select: {
                  productId: true,
                  quantity: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!existingPayment || existingPayment.provider !== "PAYSTACK") {
    throw new PaymentConfirmationError("We could not find this ReMarket payment.", 404);
  }

  // If a previous callback/webhook already completed it, do not call Paystack
  // again. Still allow this webhook delivery to be recorded as acknowledged.
  if (existingPayment.status === "SUCCESS") {
    if (options.webhookReceipt) {
      await prisma.webhookReceipt.upsert({
        where: { eventKey: options.webhookReceipt.eventKey },
        create: {
          provider: "PAYSTACK",
          eventKey: options.webhookReceipt.eventKey,
          payload: options.webhookReceipt.payload,
          processedAt: new Date(),
        },
        update: { processedAt: new Date(), processingError: null },
      });
    }

    const reviewFlag = safeMetadata(existingPayment.metadata).requiresManualReview === true;
    if (!reviewFlag && existingPayment.order.status !== "PENDING_PAYMENT") {
      await sendPaymentNotifications({
        buyerId: existingPayment.order.buyer.id,
        orderId: existingPayment.order.id,
        orderCode: existingPayment.order.orderCode,
        sellerOrders: existingPayment.order.sellerOrders.map((sellerOrder) => ({
          id: sellerOrder.id,
          sellerOrderCode: sellerOrder.sellerOrderCode,
          sellerId: sellerOrder.sellerId,
        })),
      });
    }
    return {
      paymentStatus: "SUCCESS",
      orderStatus: existingPayment.order.status,
      orderId: existingPayment.order.id,
      orderCode: existingPayment.order.orderCode,
      paymentReference: normalizedReference,
      paidAt: existingPayment.paidAt?.toISOString() ?? null,
      newlyConfirmed: false,
      requiresManualReview: reviewFlag,
      message: reviewFlag
        ? "Payment was received, but this order needs a manual review before fulfilment."
        : "Payment has already been confirmed.",
    };
  }

  const verified = await verifyPaystackTransaction(normalizedReference);
  const providerStatus = String(verified.status ?? "").toLowerCase();

  if (verified.reference !== normalizedReference) {
    throw new PaymentConfirmationError("Paystack returned a different payment reference.", 409);
  }

  if (providerStatus !== "success") {
    const mappedStatus =
      providerStatus === "abandoned" ? "CANCELLED" :
      ["failed", "reversed"].includes(providerStatus) ? "FAILED" :
      null;

    if (mappedStatus) {
      const updated = await prisma.payment.updateMany({
        where: {
          id: existingPayment.id,
          status: { in: ["PENDING", "INITIATED"] },
        },
        data: {
          status: mappedStatus,
          failureReason: `Paystack transaction status: ${providerStatus}`.slice(0, 500),
        },
      });

      // Notify only when this request actually recorded a failed/cancelled
      // attempt. A concurrent successful confirmation must not be followed
      // by a stale failure notification.
      if (updated.count === 1) {
        try {
          await createNotification({
            userId: existingPayment.order.buyer.id,
            type: NotificationType.PAYMENT_FAILED,
            title: mappedStatus === "CANCELLED" ? "Payment not completed" : "Payment unsuccessful",
            message: `Paystack did not complete payment for order ${existingPayment.order.orderCode}. You can review the order and try again if it is still awaiting payment.`,
            priority: NotificationPriority.HIGH,
            dedupeKey: `paystack-payment-failed:${existingPayment.id}`,
            data: {
              orderId: existingPayment.order.id,
              orderCode: existingPayment.order.orderCode,
              href: `/orders/${existingPayment.order.id}`,
            } as Prisma.InputJsonValue,
          });
        } catch (notificationError) {
          console.error("PAYSTACK_PAYMENT_FAILURE_NOTIFICATION_ERROR:", notificationError);
        }
      }
    }

    return {
      paymentStatus: mappedStatus ?? "PENDING",
      orderStatus: existingPayment.order.status,
      orderId: existingPayment.order.id,
      orderCode: existingPayment.order.orderCode,
      paymentReference: normalizedReference,
      paidAt: null,
      newlyConfirmed: false,
      requiresManualReview: false,
      message:
        mappedStatus === "CANCELLED"
          ? "The Paystack payment was not completed. You can return to checkout and try again."
          : mappedStatus === "FAILED"
            ? "Paystack did not confirm this payment. You can return to checkout and try again."
            : "Paystack is still processing this payment. Check again shortly.",
    };
  }

  const expectedKobo = existingPayment.amount * 100;
  if (
    !Number.isSafeInteger(expectedKobo) ||
    verified.amount !== expectedKobo ||
    existingPayment.amount !== existingPayment.order.totalAmount ||
    verified.currency !== existingPayment.currency ||
    verified.currency !== existingPayment.order.currency
  ) {
    throw new PaymentConfirmationError(
      "The verified payment amount or currency does not match this order. The order has not been marked as paid.",
      409,
    );
  }

  const verifiedEmail = verified.customer?.email?.trim().toLowerCase();
  const buyerEmail = existingPayment.order.buyer.email?.trim().toLowerCase();
  if (verifiedEmail && buyerEmail && verifiedEmail !== buyerEmail) {
    throw new PaymentConfirmationError(
      "The Paystack payer email does not match the buyer account. The order has not been marked as paid.",
      409,
    );
  }

  const parsedPaidAt = verified.paid_at ? new Date(verified.paid_at) : null;
  const paidAt = parsedPaidAt && Number.isFinite(parsedPaidAt.getTime())
    ? parsedPaidAt
    : new Date();

  const transactionId = Number.isSafeInteger(verified.id)
    ? String(verified.id)
    : null;

  let outcome: {
    requiresManualReview: boolean;
    paymentStatus: "SUCCESS";
    orderStatus: string;
    orderId: string;
    orderCode: string;
    buyerId: string;
    sellerOrders: Array<{ id: string; sellerOrderCode: string; sellerId: string }>;
    paidAt: Date;
    newlyConfirmed: boolean;
  };

  try {
    outcome = await prisma.$transaction(async (tx) => {
      if (options.webhookReceipt) {
        await tx.webhookReceipt.create({
          data: {
            provider: "PAYSTACK",
            eventKey: options.webhookReceipt.eventKey,
            payload: options.webhookReceipt.payload,
          },
        });
      }

      const current = await tx.payment.findUnique({
        where: { id: existingPayment.id },
        include: {
          order: {
            include: {
              buyer: { select: { id: true } },
              sellerOrders: {
                include: {
                  items: {
                    select: { productId: true, quantity: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!current) {
        throw new PaymentConfirmationError("The payment record no longer exists.", 404);
      }

      if (current.status === "SUCCESS") {
        if (options.webhookReceipt) {
          await tx.webhookReceipt.update({
            where: { eventKey: options.webhookReceipt.eventKey },
            data: { processedAt: new Date(), processingError: null },
          });
        }
        return {
          requiresManualReview: safeMetadata(current.metadata).requiresManualReview === true,
          paymentStatus: "SUCCESS" as const,
          orderStatus: current.order.status,
          orderId: current.order.id,
          orderCode: current.order.orderCode,
          buyerId: current.order.buyer.id,
          sellerOrders: current.order.sellerOrders.map((sellerOrder) => ({
            id: sellerOrder.id,
            sellerOrderCode: sellerOrder.sellerOrderCode,
            sellerId: sellerOrder.sellerId,
          })),
          paidAt: current.paidAt ?? paidAt,
          newlyConfirmed: false,
        };
      }

      if (
        current.provider !== "PAYSTACK" ||
        current.providerReference !== normalizedReference ||
        current.amount * 100 !== verified.amount ||
        current.currency !== verified.currency ||
        current.order.totalAmount !== current.amount
      ) {
        throw new PaymentConfirmationError("The payment no longer matches its order.", 409);
      }

      const withinPaymentWindow =
        current.order.status === "PENDING_PAYMENT" &&
        current.expiresAt !== null &&
        paidAt.getTime() <= current.expiresAt.getTime() &&
        (current.order.paymentExpiresAt === null ||
          paidAt.getTime() <= current.order.paymentExpiresAt.getTime());

      const missingProviderPaidAt = !parsedPaidAt;
      const requiresManualReview = !withinPaymentWindow || missingProviderPaidAt;
      const priorMetadata = safeMetadata(current.metadata);
      const nextMetadata: Prisma.InputJsonValue = {
        ...priorMetadata,
        paystack: {
          transactionId,
          channel: verified.channel ?? null,
          providerPaidAt: verified.paid_at ?? null,
          verifiedAt: new Date().toISOString(),
        },
        ...(requiresManualReview
          ? {
              requiresManualReview: true,
              manualReviewReason: missingProviderPaidAt
                ? "Paystack verified success without a usable paid_at timestamp."
                : "Paystack confirmed payment outside the active order payment window or after the order state changed.",
            }
          : {}),
      };

      const paymentUpdate = await tx.payment.updateMany({
        where: {
          id: current.id,
          status: { in: ["PENDING", "INITIATED"] },
        },
        data: {
          status: "SUCCESS",
          method: mapPaymentMethod(verified.channel),
          providerTransactionId: transactionId,
          paidAt,
          failureReason: null,
          metadata: nextMetadata,
        },
      });

      if (paymentUpdate.count !== 1) {
        const latest = await tx.payment.findUnique({
          where: { id: current.id },
          select: { status: true },
        });
        if (latest?.status !== "SUCCESS") {
          throw new PaymentConfirmationError("The payment changed while it was being confirmed. Please retry verification.", 409);
        }
      }

      let finalOrderStatus = current.order.status;

      if (!requiresManualReview) {
        const orderUpdate = await tx.order.updateMany({
          where: {
            id: current.order.id,
            status: "PENDING_PAYMENT",
          },
          data: {
            status: "PLACED",
            paidAt,
          },
        });

        if (orderUpdate.count !== 1) {
          throw new PaymentConfirmationError("The order changed during payment confirmation. Please retry verification.", 409);
        }

        finalOrderStatus = "PLACED";

        // Remove only quantities already purchased. If the buyer changed the
        // cart in another tab while Paystack was open, keep the extra quantity.
        const cart = await tx.cart.findUnique({
          where: { buyerId: current.order.buyer.id },
          select: { id: true },
        });

        if (cart) {
          const purchasedByProduct = new Map<string, number>();
          for (const sellerOrder of current.order.sellerOrders) {
            for (const item of sellerOrder.items) {
              if (!item.productId) continue;
              purchasedByProduct.set(
                item.productId,
                (purchasedByProduct.get(item.productId) ?? 0) + item.quantity,
              );
            }
          }

          for (const [productId, purchasedQuantity] of purchasedByProduct) {
            const cartItem = await tx.cartItem.findUnique({
              where: {
                cartId_productId: {
                  cartId: cart.id,
                  productId,
                },
              },
              select: { id: true, quantity: true },
            });

            if (!cartItem) continue;

            const remainingQuantity = cartItem.quantity - purchasedQuantity;
            if (remainingQuantity > 0) {
              await tx.cartItem.update({
                where: { id: cartItem.id },
                data: { quantity: remainingQuantity },
              });
            } else {
              await tx.cartItem.delete({ where: { id: cartItem.id } });
            }
          }
        }
      }

      if (options.webhookReceipt) {
        await tx.webhookReceipt.update({
          where: { eventKey: options.webhookReceipt.eventKey },
          data: { processedAt: new Date(), processingError: null },
        });
      }

      return {
        requiresManualReview,
        paymentStatus: "SUCCESS" as const,
        orderStatus: finalOrderStatus,
        orderId: current.order.id,
        orderCode: current.order.orderCode,
        buyerId: current.order.buyer.id,
        sellerOrders: current.order.sellerOrders.map((sellerOrder) => ({
          id: sellerOrder.id,
          sellerOrderCode: sellerOrder.sellerOrderCode,
          sellerId: sellerOrder.sellerId,
        })),
        paidAt,
        newlyConfirmed: !requiresManualReview,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    // A concurrent delivery of the same webhook may have committed first.
    if (options.webhookReceipt && isUniqueConstraintError(error)) {
      const receipt = await prisma.webhookReceipt.findUnique({
        where: { eventKey: options.webhookReceipt.eventKey },
        select: { processedAt: true },
      });
      if (receipt?.processedAt) {
        const latest = await prisma.payment.findUnique({
          where: { providerReference: normalizedReference },
          include: { order: { select: { id: true, orderCode: true, status: true } } },
        });
        if (latest?.status === "SUCCESS") {
          return {
            paymentStatus: "SUCCESS",
            orderStatus: latest.order.status,
            orderId: latest.order.id,
            orderCode: latest.order.orderCode,
            paymentReference: normalizedReference,
            paidAt: latest.paidAt?.toISOString() ?? null,
            newlyConfirmed: false,
            requiresManualReview: safeMetadata(latest.metadata).requiresManualReview === true,
            message: "Payment confirmation was already processed.",
          };
        }
      }
    }
    if (isSerializationConflict(error)) {
      throw new PaymentConfirmationError("Payment confirmation is already being processed. Please retry shortly.", 409);
    }
    throw error;
  }

  if (!outcome.requiresManualReview) {
    await sendPaymentNotifications({
      buyerId: outcome.buyerId,
      orderId: outcome.orderId,
      orderCode: outcome.orderCode,
      sellerOrders: outcome.sellerOrders,
    });
  }

  return {
    paymentStatus: "SUCCESS",
    orderStatus: outcome.orderStatus,
    orderId: outcome.orderId,
    orderCode: outcome.orderCode,
    paymentReference: normalizedReference,
    paidAt: outcome.paidAt.toISOString(),
    newlyConfirmed: outcome.newlyConfirmed,
    requiresManualReview: outcome.requiresManualReview,
    message: outcome.requiresManualReview
      ? "Paystack received the payment, but this order needs a manual review before fulfilment. Please contact ReMarket support with your order reference."
      : "Payment confirmed successfully. Your order has been sent to the sellers for processing.",
  };
}