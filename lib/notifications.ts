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

export type CreateNotificationsInput =
  CreateNotificationInput[];

/**
 * A notification can either be created, already exist,
 * or be skipped because the recipient disabled in-app
 * notifications for that category.
 */
export type NotificationResult =
  | {
      notificationId: string;
      created: boolean;
      skipped?: false;
    }
  | {
      notificationId: null;
      created: false;
      skipped: true;
      reason: "PREFERENCE_DISABLED";
    };

type NotificationTransactionResult =
  | {
      status: "CREATED";
      notificationId: string;
    }
  | {
      status: "SKIPPED";
    };

/**
 * Finds an existing notification by its unique event key.
 *
 * A dedupe key must never silently return another user's
 * notification.
 */
async function findExistingNotification(
  dedupeKey: string,
  userId: string
): Promise<NotificationResult | null> {
  const existing = await prisma.notification.findUnique({
    where: {
      dedupeKey,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!existing) {
    return null;
  }

  if (existing.userId !== userId) {
    throw new Error(
      "Notification deduplication key belongs to another user."
    );
  }

  return {
    notificationId: existing.id,
    created: false,
  };
}

/**
 * Checks whether the recipient allows in-app notifications
 * for the specified notification category.
 *
 * Missing preference records use the default:
 * inApp = true.
 */
async function isInAppNotificationEnabled(
  userId: string,
  notificationType: NotificationType
): Promise<boolean> {
  const preference =
    await prisma.notificationPreference.findUnique({
      where: {
        userId_notificationType: {
          userId,
          notificationType,
        },
      },
      select: {
        inApp: true,
      },
    });

  return preference?.inApp ?? true;
}

/**
 * Creates one in-app ReMarket notification.
 *
 * V1 supports IN_APP delivery only.
 *
 * Before creating a notification, the recipient's
 * in-app preference is checked.
 *
 * The notification and its delivery record are created
 * inside the same database transaction.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationResult> {
  const normalizedUserId =
    input.userId?.trim() ?? "";

  const normalizedTitle =
    input.title?.trim() ?? "";

  const normalizedMessage =
    input.message?.trim() ?? "";

  const normalizedDedupeKey =
    input.dedupeKey?.trim() || null;

  const normalizedAnnouncementId =
    input.announcementId?.trim() || null;

  const priority =
    input.priority ?? NotificationPriority.NORMAL;

  const data = input.data ?? null;

  if (!normalizedUserId) {
    throw new Error("Notification userId is required.");
  }

  if (!normalizedTitle) {
    throw new Error("Notification title is required.");
  }

  if (!normalizedMessage) {
    throw new Error("Notification message is required.");
  }

  /*
   * VERIFY RECIPIENT
   */

  const userExists = await prisma.user.findUnique({
    where: {
      id: normalizedUserId,
    },
    select: {
      id: true,
    },
  });

  if (!userExists) {
    throw new Error(
      "Notification recipient could not be found."
    );
  }

  /*
   * DEDUPLICATION
   *
   * Return an existing notification when this event
   * has already been processed for this recipient.
   *
   * Existing notifications are not removed when a user
   * subsequently changes their preferences.
   */

  if (normalizedDedupeKey) {
    const existing = await findExistingNotification(
      normalizedDedupeKey,
      normalizedUserId
    );

    if (existing) {
      return existing;
    }
  }

  try {
    /*
     * CREATE NOTIFICATION
     *
     * Check the preference inside the transaction
     * immediately before creating the notification.
     */

    const transactionResult =
      await prisma.$transaction(
        async (tx): Promise<NotificationTransactionResult> => {
          /*
           * CHECK IN-APP PREFERENCE
           *
           * Missing preference records default to enabled.
           */

          const preference =
            await tx.notificationPreference.findUnique({
              where: {
                userId_notificationType: {
                  userId: normalizedUserId,
                  notificationType: input.type,
                },
              },
              select: {
                inApp: true,
              },
            });

          if (preference && !preference.inApp) {
            return {
              status: "SKIPPED",
            };
          }

          /*
           * CREATE NOTIFICATION
           */

          const createdNotification =
            await tx.notification.create({
              data: {
                userId: normalizedUserId,
                type: input.type,
                title: normalizedTitle,
                message: normalizedMessage,
                priority,

                // Omit JSON data when no payload was supplied.
                data: data === null ? undefined : data,

                dedupeKey: normalizedDedupeKey,
                announcementId: normalizedAnnouncementId,
              },
              select: {
                id: true,
              },
            });

          /*
           * CREATE IN-APP DELIVERY RECORD
           */

          const deliveredAt = new Date();

          await tx.notificationDelivery.create({
            data: {
              notificationId: createdNotification.id,
              channel: NotificationChannel.IN_APP,
              status: NotificationDeliveryStatus.DELIVERED,
              sentAt: deliveredAt,
              deliveredAt,
            },
          });

          return {
            status: "CREATED",
            notificationId: createdNotification.id,
          };
        }
      );

    /*
     * NOTIFICATION DISABLED
     *
     * No notification or delivery record was created.
     */

    if (transactionResult.status === "SKIPPED") {
      return {
        notificationId: null,
        created: false,
        skipped: true,
        reason: "PREFERENCE_DISABLED",
      };
    }

    /*
     * SUCCESS
     */

    return {
      notificationId: transactionResult.notificationId,
      created: true,
    };
  } catch (error) {
    /*
     * CONCURRENT DUPLICATE PROTECTION
     *
     * If another request creates the same notification
     * concurrently, the database unique constraint
     * rejects this creation with P2002.
     */

    if (
      normalizedDedupeKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await findExistingNotification(
        normalizedDedupeKey,
        normalizedUserId
      );

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

/**
 * Creates multiple in-app notifications.
 *
 * Sequential processing avoids creating a large burst
 * of database connections.
 *
 * Each recipient's notification preferences are checked
 * independently by createNotification().
 */
export async function createNotifications(
  inputs: CreateNotificationsInput
): Promise<NotificationResult[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return [];
  }

  const results: NotificationResult[] = [];

  for (const input of inputs) {
    const result = await createNotification(input);
    results.push(result);
  }

  return results;
}

/**
 * Creates a standard system announcement notification.
 *
 * SYSTEM_ANNOUNCEMENT preferences are also respected
 * when this utility is used.
 *
 * The bulk admin announcement endpoint has its own
 * recipient filtering and should continue using that
 * filtering when creating announcements in batches.
 */
export async function createSystemAnnouncement(
  input: {
    userId: string;
    title: string;
    message: string;
    priority?: NotificationPriority;
    data?: Prisma.InputJsonValue | null;
    announcementId?: string | null;
    dedupeKey?: string | null;
  }
): Promise<NotificationResult> {
  return createNotification({
    userId: input.userId,
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: input.title,
    message: input.message,
    priority:
      input.priority ?? NotificationPriority.NORMAL,
    data: input.data ?? null,
    announcementId: input.announcementId ?? null,
    dedupeKey: input.dedupeKey ?? null,
  });
}