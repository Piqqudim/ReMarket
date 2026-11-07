
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
 * Creates a recipient-specific deduplication key.
 *
 * The Prisma schema currently declares dedupeKey as
 * globally unique:
 *
 *   dedupeKey String? @unique
 *
 * Therefore, the same event must have a different
 * database key for each recipient.
 *
 * Example:
 *
 *   Event key: service-booking:123:accepted
 *
 *   Buyer key:   ["remarket-notification","buyer-id","service-booking:123:accepted"]
 *   Seller key:  ["remarket-notification","seller-id","service-booking:123:accepted"]
 *
 * This allows both parties to receive a notification
 * for the same booking event.
 */
function buildRecipientDedupeKey(
  userId: string,
  eventKey: string
): string {
  return JSON.stringify([
    "remarket-notification",
    userId,
    eventKey,
  ]);
}

/**
 * Finds an existing notification by its exact database key.
 *
 * A matching key belonging to another user is treated
 * as a data-integrity error.
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
 * Checks for an existing notification for this recipient.
 *
 * First checks the new recipient-specific key.
 *
 * Then checks the original unscoped key for backward
 * compatibility with notifications created before this
 * implementation.
 *
 * An old unscoped key belonging to another recipient
 * is ignored. It must never prevent another recipient
 * from receiving their own notification.
 */
async function findExistingRecipientNotification(
  eventKey: string,
  recipientDedupeKey: string,
  userId: string
): Promise<NotificationResult | null> {
  // Check the new recipient-specific key.
  const recipientExisting = await findExistingNotification(
    recipientDedupeKey,
    userId
  );

  if (recipientExisting) {
    return recipientExisting;
  }

  // Check the previous unscoped key for legacy records.
  const legacyExisting = await prisma.notification.findUnique({
    where: {
      dedupeKey: eventKey,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!legacyExisting || legacyExisting.userId !== userId) {
    return null;
  }

  return {
    notificationId: legacyExisting.id,
    created: false,
  };
}

/**
 * Creates one in-app ReMarket notification.
 *
 * V1 supports IN_APP delivery only.
 *
 * Behaviour:
 * - Validates the recipient.
 * - Checks the recipient's notification preferences.
 * - Prevents duplicate notifications.
 * - Creates the notification and delivery record
 *   inside the same database transaction.
 * - Handles concurrent duplicate creation.
 *
 * Missing preference records default to in-app enabled.
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

  const normalizedEventKey =
    input.dedupeKey?.trim() || null;

  const normalizedAnnouncementId =
    input.announcementId?.trim() || null;

  const priority =
    input.priority ?? NotificationPriority.NORMAL;

  const data = input.data ?? null;

  if (!normalizedUserId) {
    throw new Error(
      "Notification userId is required."
    );
  }

  if (!normalizedTitle) {
    throw new Error(
      "Notification title is required."
    );
  }

  if (!normalizedMessage) {
    throw new Error(
      "Notification message is required."
    );
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
   * BUILD RECIPIENT-SPECIFIC DEDUPLICATION KEY
   */

  const recipientDedupeKey = normalizedEventKey
    ? buildRecipientDedupeKey(
        normalizedUserId,
        normalizedEventKey
      )
    : null;

  /*
   * CHECK FOR EXISTING NOTIFICATION
   *
   * Existing notifications are returned without creating
   * another notification or delivery record.
   */

  if (normalizedEventKey && recipientDedupeKey) {
    const existing =
      await findExistingRecipientNotification(
        normalizedEventKey,
        recipientDedupeKey,
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
     * The preference check, notification creation and
     * delivery creation are handled in one transaction.
     */

    const transactionResult =
      await prisma.$transaction(
        async (
          tx
        ): Promise<NotificationTransactionResult> => {
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

                // New notifications use recipient-specific keys.
                dedupeKey: recipientDedupeKey,

                announcementId: normalizedAnnouncementId,
              },
              select: {
                id: true,
              },
            });

          /*
           * CREATE IN-APP DELIVERY RECORD
           *
           * Both records are committed together.
           * If delivery creation fails, notification creation
           * is rolled back by the transaction.
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
     * If another request creates the same recipient-specific
     * notification first, PostgreSQL rejects the duplicate
     * through the unique constraint.
     *
     * We then retrieve the notification that already exists.
     */

    if (
      recipientDedupeKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await findExistingNotification(
        recipientDedupeKey,
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
 * Creates multiple in-app ReMarket notifications.
 *
 * Processing is sequential to avoid creating a large
 * burst of simultaneous database operations.
 *
 * Each recipient's preferences are checked independently.
 *
 * Each event's deduplication key is also scoped to
 * the individual recipient by createNotification().
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
 * The recipient's SYSTEM_ANNOUNCEMENT in-app preference
 * is respected.
 *
 * For bulk announcements, the caller should continue
 * selecting the correct recipients before invoking
 * this utility.
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
