import { NotificationPriority, NotificationType, Prisma, SellerOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

/**
 * Queue one review invitation for each eligible delivered order item.
 * The order item ID is the idempotency key, so duplicate courier webhooks,
 * buyer confirmations or cron retries cannot create repeat invitations.
 * This helper is deliberately best-effort: it must never change delivery,
 * settlement or payout outcomes.
 */
export async function queueProductReviewInvitations(orderId: string, sellerOrderId: string) {
  const deliveredOrder = await prisma.sellerOrder.findFirst({
    where: {
      id: sellerOrderId,
      orderId,
      status: { in: [SellerOrderStatus.DELIVERED, SellerOrderStatus.COMPLETED] },
      deliveredAt: { not: null },
      order: { paidAt: { not: null } },
    },
    select: {
      sellerOrderCode: true,
      order: { select: { buyerId: true } },
      items: {
        where: { productId: { not: null }, productReview: null },
        select: { id: true, productId: true, productName: true },
      },
    },
  });
  if (!deliveredOrder) return { queued: 0 };

  let queued = 0;
  for (const item of deliveredOrder.items) {
    if (!item.productId) continue;
    try {
      const result = await createNotification({
        userId: deliveredOrder.order.buyerId,
        type: NotificationType.REVIEW_INVITATION,
        title: "How was your ReMarket purchase?",
        message: `Your order (${deliveredOrder.sellerOrderCode}) has been delivered. Share your experience with ${item.productName} and help other buyers make informed decisions.`,
        priority: NotificationPriority.NORMAL,
        dedupeKey: `product-review-invitation:${item.id}`,
        data: {
          productId: item.productId,
          orderItemId: item.id,
          href: `/product/${encodeURIComponent(item.productId)}#product-reviews`,
        } as Prisma.InputJsonValue,
      });
      if (result.created) queued += 1;
    } catch (notificationError) {
      console.error("PRODUCT_REVIEW_INVITATION_NOTIFICATION_ERROR:", {
        orderItemId: item.id,
        notificationError,
      });
    }
  }
  return { queued };
}
