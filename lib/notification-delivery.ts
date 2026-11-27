import { NotificationChannel, NotificationDeliveryStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EmailDeliveryError, safeNotificationPath, sendNotificationEmail } from "@/lib/email-notifications";
import { isAllowedPushEndpoint, PushDeliveryError, sendBrowserPush } from "@/lib/web-push";
import { decryptPushAuthSecret } from "@/lib/push-subscription-crypto";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 3_600_000, 21_600_000];
const noStoreSelect = {
  id: true,
  notificationId: true,
  channel: true,
  attemptCount: true,
} satisfies Prisma.NotificationDeliverySelect;
type Claimed = { id: string; notificationId: string; channel: NotificationChannel; attemptCount: number };

function safeDataHref(data: Prisma.JsonValue | null): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return safeNotificationPath((data as Record<string, unknown>).href);
}

async function claimDeliveries(batchSize: number): Promise<Claimed[]> {
  // PostgreSQL row locks prevent two cron invocations from processing the same row.
  return prisma.$queryRaw<Claimed[]>(Prisma.sql`
    WITH candidates AS (
      SELECT "id"
      FROM "NotificationDelivery"
      WHERE "channel" IN ('EMAIL'::"NotificationChannel", 'PUSH'::"NotificationChannel")
        AND "nextAttemptAt" <= NOW()
        AND (
          "status" = 'PENDING'::"NotificationDeliveryStatus"
          OR ("status" = 'PROCESSING'::"NotificationDeliveryStatus" AND "lockedAt" < NOW() - INTERVAL '15 minutes')
        )
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE "NotificationDelivery" AS delivery
    SET "status" = 'PROCESSING'::"NotificationDeliveryStatus",
        "lockedAt" = NOW(),
        "lastAttemptAt" = NOW(),
        "attemptCount" = delivery."attemptCount" + 1,
        "updatedAt" = NOW()
    FROM candidates
    WHERE delivery."id" = candidates."id"
    RETURNING delivery."id", delivery."notificationId", delivery."channel", delivery."attemptCount"
  `);
}

async function finishAttempt(input: {
  deliveryId: string; attemptNumber: number; status: NotificationDeliveryStatus;
  providerMessageId?: string | null; error?: string | null; retryAt?: Date | null;
}) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.notificationDeliveryAttempt.create({
      data: {
        deliveryId: input.deliveryId,
        attemptNumber: input.attemptNumber,
        status: input.status,
        providerMessageId: input.providerMessageId ?? null,
        error: input.error?.slice(0, 500) ?? null,
      },
    });
    await tx.notificationDelivery.update({
      where: { id: input.deliveryId },
      data: {
        status: input.status,
        providerMessageId: input.providerMessageId ?? undefined,
        error: input.error?.slice(0, 500) ?? null,
        lockedAt: null,
        ...(input.status === NotificationDeliveryStatus.SENT ? { sentAt: now, failedAt: null } : {}),
        ...(input.status === NotificationDeliveryStatus.FAILED ? { failedAt: now } : {}),
        ...(input.retryAt ? { nextAttemptAt: input.retryAt } : {}),
      },
    });
  });
}

async function processOne(claim: Claimed): Promise<{ deliveryId: string; channel: string; result: string }> {
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: claim.id },
    include: { notification: { include: { user: { select: { email: true, name: true } } } } },
  });
  if (!delivery) return { deliveryId: claim.id, channel: claim.channel, result: "MISSING" };
  const notification = delivery.notification;
  const href = safeDataHref(notification.data);
  const currentPreference = await prisma.notificationPreference.findUnique({
    where: { userId_notificationType: { userId: notification.userId, notificationType: notification.type } },
    select: { email: true, push: true },
  });
  const channelStillEnabled = claim.channel === NotificationChannel.EMAIL
    ? (currentPreference?.email ?? false)
    : (currentPreference?.push ?? false);
  if (!channelStillEnabled) {
    await finishAttempt({
      deliveryId: claim.id,
      attemptNumber: claim.attemptCount,
      status: NotificationDeliveryStatus.CANCELLED,
      error: `Recipient disabled ${claim.channel === NotificationChannel.EMAIL ? "Email" : "Browser Push"} before delivery.`,
    });
    return { deliveryId: claim.id, channel: claim.channel, result: "CANCELLED_PREFERENCE_DISABLED" };
  }

  try {
    if (claim.channel === NotificationChannel.EMAIL) {
      const sent = await sendNotificationEmail({ to: notification.user.email, title: notification.title, message: notification.message, href, idempotencyKey: claim.id });
      await finishAttempt({ deliveryId: claim.id, attemptNumber: claim.attemptCount, status: NotificationDeliveryStatus.SENT, providerMessageId: sent.id });
      return { deliveryId: claim.id, channel: claim.channel, result: "SENT" };
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: notification.userId, OR: [{ expirationTime: null }, { expirationTime: { gt: new Date() } }] },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) {
      await finishAttempt({
        deliveryId: claim.id,
        attemptNumber: claim.attemptCount,
        status: NotificationDeliveryStatus.CANCELLED,
        error: "No active browser push subscriptions remained before delivery.",
      });
      return { deliveryId: claim.id, channel: claim.channel, result: "CANCELLED_NO_SUBSCRIPTION" };
    }

    let successCount = 0;
    let lastRetryableError: PushDeliveryError | null = null;
    const invalidEndpoints: string[] = [];
    for (const subscription of subscriptions) {
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        invalidEndpoints.push(subscription.endpoint);
        continue;
      }
      try {
        await sendBrowserPush({ ...subscription, auth: decryptPushAuthSecret(subscription.auth) }, { title: notification.title, body: notification.message, ...(href ? { href } : {}), tag: notification.id });
        successCount += 1;
        await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { lastUsedAt: new Date() } });
      } catch (error) {
        if (error instanceof PushDeliveryError && (error.statusCode === 404 || error.statusCode === 410)) invalidEndpoints.push(subscription.endpoint);
        if (error instanceof PushDeliveryError && error.retryable) lastRetryableError = error;
      }
    }
    if (invalidEndpoints.length) await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: invalidEndpoints }, userId: notification.userId } });
    if (successCount > 0) {
      const partialError = successCount < subscriptions.length ? `${successCount} of ${subscriptions.length} browser subscriptions accepted the push.` : null;
      await finishAttempt({ deliveryId: claim.id, attemptNumber: claim.attemptCount, status: NotificationDeliveryStatus.SENT, error: partialError });
      return { deliveryId: claim.id, channel: claim.channel, result: `SENT_${successCount}_OF_${subscriptions.length}` };
    }
    if (lastRetryableError) throw lastRetryableError;
    throw new PushDeliveryError("No active browser subscription accepted this push.", { retryable: false });
  } catch (error) {
    const retryable = (error instanceof EmailDeliveryError || error instanceof PushDeliveryError) && error.retryable;
    const message = error instanceof Error ? error.message : "External notification delivery failed.";
    const retryAt = retryable && claim.attemptCount < MAX_ATTEMPTS
      ? new Date(Date.now() + RETRY_DELAYS_MS[Math.min(claim.attemptCount - 1, RETRY_DELAYS_MS.length - 1)])
      : null;
    const status = retryAt ? NotificationDeliveryStatus.PENDING : NotificationDeliveryStatus.FAILED;
    await finishAttempt({ deliveryId: claim.id, attemptNumber: claim.attemptCount, status, error: message, retryAt });
    return { deliveryId: claim.id, channel: claim.channel, result: retryAt ? "RETRY_SCHEDULED" : "FAILED" };
  }
}

export async function processNotificationDeliveries(batchSize = 25) {
  const safeBatchSize = Math.min(100, Math.max(1, Math.floor(batchSize)));
  const claimed = await claimDeliveries(safeBatchSize);
  const results: Array<{ deliveryId: string; channel: string; result: string }> = [];
  // Keep provider calls concurrent but bounded so one cron invocation cannot
  // fan out into an unbounded number of network requests or exhaust its runtime.
  const concurrency = 5;
  for (let offset = 0; offset < claimed.length; offset += concurrency) {
    const group = claimed.slice(offset, offset + concurrency);
    const settled = await Promise.all(group.map(async (delivery) => {
      try { return await processOne(delivery); }
      catch (error) {
        console.error("NOTIFICATION_DELIVERY_PROCESS_ERROR:", { deliveryId: delivery.id, error });
        // A claimed row is left PROCESSING; the next worker can reclaim it after the stale-lock timeout.
        return { deliveryId: delivery.id, channel: delivery.channel, result: "PROCESSOR_ERROR" };
      }
    }));
    results.push(...settled);
  }
  return { claimed: claimed.length, results };
}
