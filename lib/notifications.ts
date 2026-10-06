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

  /*
   * Prisma JSON input.
   *
   * This allows normal objects, arrays, strings,
   * numbers, booleans, and null in a Prisma-safe way.
   */
  data?: Prisma.InputJsonValue | null;

  /**
   * Optional unique event key used to prevent
   * duplicate notifications when an operation
   * is retried.
   *
   * Example:
   *
   * REQUEST_MATCHED:request_123:user_456
   */
  dedupeKey?: string | null;

  /**
   * Optional admin announcement ID.
   */
  announcementId?: string | null;
};

export type CreateNotificationsInput =
  CreateNotificationInput[];

export type NotificationResult = {
  notificationId: string;

  created: boolean;
};

/**
 * Creates one in-app ReMarket notification.
 *
 * V1 uses IN_APP only.
 *
 * The notification is stored in the database and
 * its IN_APP delivery is immediately marked as
 * DELIVERED because it is now available to the user.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<NotificationResult> {
  const {
    userId,
    type,
    title,
    message,
    priority = NotificationPriority.NORMAL,
    data = null,
    dedupeKey = null,
    announcementId = null,
  } = input;

  const normalizedUserId =
    typeof userId === "string"
      ? userId.trim()
      : "";

  const normalizedTitle =
    typeof title === "string"
      ? title.trim()
      : "";

  const normalizedMessage =
    typeof message === "string"
      ? message.trim()
      : "";

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
   * Validate the recipient before creating
   * the notification.
   */
  const userExists =
    await prisma.user.findUnique({
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
   * Check the dedupe key before creating.
   */
  if (dedupeKey) {
    const existing =
      await prisma.notification.findUnique({
        where: {
          dedupeKey,
        },
        select: {
          id: true,
        },
      });

    if (existing) {
      return {
        notificationId: existing.id,
        created: false,
      };
    }
  }

  try {
    const notification =
      await prisma.$transaction(
        async (tx) => {
          const createdNotification =
            await tx.notification.create({
              data: {
                userId:
                  normalizedUserId,

                type,

                title:
                  normalizedTitle,

                message:
                  normalizedMessage,

                priority,

                /*
                 * Prisma accepts InputJsonValue here.
                 *
                 * When data is null, we omit the field.
                 */
                data:
                  data === null
                    ? undefined
                    : data,

                dedupeKey:
                  dedupeKey || null,

                announcementId:
                  announcementId || null,
              },
            });

          /*
           * V1 only uses IN_APP.
           *
           * The notification is available immediately
           * after the database transaction succeeds.
           */
          await tx.notificationDelivery.create({
            data: {
              notificationId:
                createdNotification.id,

              channel:
                NotificationChannel.IN_APP,

              status:
                NotificationDeliveryStatus.DELIVERED,

              sentAt:
                new Date(),

              deliveredAt:
                new Date(),
            },
          });

          return createdNotification;
        }
      );

    return {
      notificationId:
        notification.id,

      created: true,
    };
  } catch (error) {
    /*
     * Another request may have created the same
     * deduplicated notification concurrently.
     *
     * Prisma reports the unique constraint as P2002.
     */
    if (
      dedupeKey &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existing =
        await prisma.notification.findUnique({
          where: {
            dedupeKey,
          },
          select: {
            id: true,
          },
        });

      if (existing) {
        return {
          notificationId: existing.id,
          created: false,
        };
      }
    }

    throw error;
  }
}

/**
 * Creates multiple in-app notifications.
 *
 * This is useful when one event should notify
 * several users.
 */
export async function createNotifications(
  inputs: CreateNotificationsInput
): Promise<NotificationResult[]> {
  if (inputs.length === 0) {
    return [];
  }

  const results:
    NotificationResult[] = [];

  /*
   * Keep this sequential rather than using
   * Promise.all() so we do not create a large
   * burst of database connections when one event
   * targets many users.
   */
  for (const input of inputs) {
    const result =
      await createNotification(input);

    results.push(result);
  }

  return results;
}

/**
 * Creates a standard ReMarket system announcement
 * notification for one user.
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
    userId:
      input.userId,

    type:
      NotificationType.SYSTEM_ANNOUNCEMENT,

    title:
      input.title,

    message:
      input.message,

    priority:
      input.priority ??
      NotificationPriority.NORMAL,

    data:
      input.data ??
      null,

    announcementId:
      input.announcementId ??
      null,

    dedupeKey:
      input.dedupeKey ??
      null,
  });
}