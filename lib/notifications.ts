import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  data?: Prisma.InputJsonValue | null;
  dedupeKey?: string | null;
  announcementId?: string | null;
};
export type CreateNotificationsInput = CreateNotificationInput[];
export type NotificationResult =
  | { notificationId: string; created: boolean; skipped?: false }
  | { notificationId: null; created: false; skipped: true; reason: "PREFERENCE_DISABLED" };

type Created = { status: "CREATED"; notificationId: string } | { status: "SKIPPED" };

function recipientKey(userId: string, eventKey: string) {
  return JSON.stringify(["remarket-notification", userId, eventKey]);
}

async function findExisting(key: string, userId: string): Promise<NotificationResult | null> {
  const existing = await prisma.notification.findUnique({ where: { dedupeKey: key }, select: { id: true, userId: true } });
  if (!existing) return null;
  if (existing.userId !== userId) throw new Error("Notification deduplication key belongs to another user.");
  return { notificationId: existing.id, created: false };
}

async function findExistingRecipientNotification(eventKey: string, recipientKey: string, userId: string): Promise<NotificationResult | null> {
  const recipientExisting = await findExisting(recipientKey, userId);
  if (recipientExisting) return recipientExisting;

  // Preserve idempotency for notification events created by the previous
  // in-app-only implementation, whose keys were not recipient-scoped.
  const legacyExisting = await prisma.notification.findUnique({
    where: { dedupeKey: eventKey },
    select: { id: true, userId: true },
  });
  if (!legacyExisting || legacyExisting.userId !== userId) return null;
  return { notificationId: legacyExisting.id, created: false };
}

/**
 * Persist one user-facing event and queue each independently enabled delivery channel.
 * IN_APP is recorded as immediately delivered; EMAIL/PUSH remain pending until the
 * protected notification worker has actually submitted them to their providers.
 */
export async function createNotification(input: CreateNotificationInput): Promise<NotificationResult> {
  const userId = input.userId?.trim() ?? "";
  const title = input.title?.trim() ?? "";
  const message = input.message?.trim() ?? "";
  const eventKey = input.dedupeKey?.trim() || null;
  if (!userId || !title || !message) throw new Error("Notification recipient, title and message are required.");

  const recipientDedupeKey = eventKey ? recipientKey(userId, eventKey) : null;
  if (recipientDedupeKey && eventKey) {
    const existing = await findExistingRecipientNotification(eventKey, recipientDedupeKey, userId);
    if (existing) return existing;
  }

  try {
    const transactionResult = await prisma.$transaction(async (tx): Promise<Created> => {
      const recipient = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!recipient) throw new Error("Notification recipient could not be found.");
      const preference = await tx.notificationPreference.findUnique({
        where: { userId_notificationType: { userId, notificationType: input.type } },
        select: { inApp: true, email: true, push: true },
      });
      const inAppEnabled = preference?.inApp ?? true;
      const emailEnabled = preference?.email ?? false;
      const pushEnabled = preference?.push ?? false;
      const pushHasSubscription = pushEnabled
        ? await tx.pushSubscription.count({ where: { userId } }) > 0
        : false;
      const channels: Array<{ channel: NotificationChannel; status: NotificationDeliveryStatus; sentAt?: Date; deliveredAt?: Date }> = [];
      if (inAppEnabled) channels.push({ channel: NotificationChannel.IN_APP, status: NotificationDeliveryStatus.DELIVERED, sentAt: new Date(), deliveredAt: new Date() });
      if (emailEnabled) channels.push({ channel: NotificationChannel.EMAIL, status: NotificationDeliveryStatus.PENDING });
      if (pushEnabled && pushHasSubscription) channels.push({ channel: NotificationChannel.PUSH, status: NotificationDeliveryStatus.PENDING });
      if (channels.length === 0) return { status: "SKIPPED" };

      const notification = await tx.notification.create({
        data: {
          userId,
          type: input.type,
          title,
          message,
          priority: input.priority ?? NotificationPriority.NORMAL,
          ...(input.data == null ? {} : { data: input.data }),
          dedupeKey: recipientDedupeKey,
          ...(input.announcementId ? { announcementId: input.announcementId } : {}),
        },
        select: { id: true },
      });
      await tx.notificationDelivery.createMany({
        data: channels.map((item) => ({
          notificationId: notification.id,
          channel: item.channel,
          status: item.status,
          ...(item.sentAt ? { sentAt: item.sentAt } : {}),
          ...(item.deliveredAt ? { deliveredAt: item.deliveredAt } : {}),
        })),
        skipDuplicates: true,
      });
      return { status: "CREATED", notificationId: notification.id };
    });

    if (transactionResult.status === "SKIPPED") return { notificationId: null, created: false, skipped: true, reason: "PREFERENCE_DISABLED" };
    return { notificationId: transactionResult.notificationId, created: true };
  } catch (error) {
    if (recipientDedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findExisting(recipientDedupeKey, userId);
      if (existing) return existing;
    }
    throw error;
  }
}

export async function createNotifications(inputs: CreateNotificationsInput): Promise<NotificationResult[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) return [];
  const results: NotificationResult[] = [];
  for (const input of inputs) results.push(await createNotification(input));
  return results;
}

export async function createSystemAnnouncement(input: {
  userId: string; title: string; message: string; priority?: NotificationPriority;
  data?: Prisma.InputJsonValue | null; announcementId?: string | null; dedupeKey?: string | null;
}): Promise<NotificationResult> {
  return createNotification({
    userId: input.userId,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: input.title,
    message: input.message,
    priority: input.priority ?? NotificationPriority.NORMAL,
    data: input.data ?? null,
    announcementId: input.announcementId ?? null,
    dedupeKey: input.dedupeKey ?? null,
  });
}
