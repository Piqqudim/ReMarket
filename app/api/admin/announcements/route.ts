
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
  Role,
} from "@prisma/client";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TITLE_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 5000;
const ANNOUNCEMENT_HISTORY_LIMIT = 25;

const SENDABLE_AUDIENCES = [
  NotificationAudience.EVERYONE,
  NotificationAudience.BUYERS,
  NotificationAudience.SELLERS,
  NotificationAudience.ADMINS,
] as const;

type SendableAudience =
  (typeof SENDABLE_AUDIENCES)[number];

class NoEligibleRecipientsError extends Error {
  constructor() {
    super("No eligible users were found for this audience.");
    this.name = "NoEligibleRecipientsError";
  }
}

function jsonNoStore(
  body: unknown,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        "private, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

async function requireAdminOrRespond() {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    auth.response.headers.set(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate"
    );
    auth.response.headers.set("Pragma", "no-cache");
    auth.response.headers.set("Expires", "0");

    return {
      authorized: false as const,
      response: auth.response,
    };
  }

  return {
    authorized: true as const,
    user: auth.user,
  };
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isSendableAudience(
  value: unknown
): value is SendableAudience {
  return (
    typeof value === "string" &&
    SENDABLE_AUDIENCES.some(
      (audience) => audience === value
    )
  );
}

function isNotificationPriority(
  value: unknown
): value is NotificationPriority {
  return (
    typeof value === "string" &&
    Object.values(NotificationPriority).some(
      (priority) => priority === value
    )
  );
}

/**
 * Build the recipient filter used for both audience
 * previews and actual sending.
 *
 * Missing preference rows use the schema's default:
 * in-app notifications are enabled.
 */
function buildRecipientWhere(
  audience: SendableAudience
): Prisma.UserWhereInput {
  let role: Role | undefined;

  switch (audience) {
    case NotificationAudience.BUYERS:
      role = Role.BUYER;
      break;

    case NotificationAudience.SELLERS:
      role = Role.SELLER;
      break;

    case NotificationAudience.ADMINS:
      role = Role.ADMIN;
      break;

    case NotificationAudience.EVERYONE:
      role = undefined;
      break;
  }

  return {
    ...(role ? { role } : {}),
    notificationPreferences: {
      none: {
        notificationType:
          NotificationType.SYSTEM_ANNOUNCEMENT,
        inApp: false,
      },
    },
  };
}

/**
 * GET /api/admin/announcements
 *
 * Returns recent announcements and audience counts.
 * Counts are estimates; the actual audience is evaluated
 * again when an announcement is sent.
 */
export async function GET() {
  const auth = await requireAdminOrRespond();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const [
      announcements,
      everyoneCount,
      buyersCount,
      sellersCount,
      adminsCount,
    ] = await Promise.all([
      prisma.notificationAnnouncement.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: ANNOUNCEMENT_HISTORY_LIMIT,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              notifications: true,
            },
          },
        },
      }),

      prisma.user.count({
        where: buildRecipientWhere(
          NotificationAudience.EVERYONE
        ),
      }),

      prisma.user.count({
        where: buildRecipientWhere(
          NotificationAudience.BUYERS
        ),
      }),

      prisma.user.count({
        where: buildRecipientWhere(
          NotificationAudience.SELLERS
        ),
      }),

      prisma.user.count({
        where: buildRecipientWhere(
          NotificationAudience.ADMINS
        ),
      }),
    ]);

    return jsonNoStore({
      announcements: announcements.map(
        ({ _count, ...announcement }) => ({
          ...announcement,
          recipientCount: _count.notifications,
        })
      ),

      audienceCounts: {
        EVERYONE: everyoneCount,
        BUYERS: buyersCount,
        SELLERS: sellersCount,
        ADMINS: adminsCount,
      },

      availableAudiences: SENDABLE_AUDIENCES,
    });
  } catch (error) {
    console.error(
      "Admin announcements GET error:",
      error
    );

    return jsonNoStore(
      {
        error: "Unable to load announcements.",
      },
      500
    );
  }
}

/**
 * POST /api/admin/announcements
 *
 * Creates an announcement and immediately sends it
 * as an in-app SYSTEM_ANNOUNCEMENT notification.
 *
 * This endpoint does not send push notifications,
 * emails, WhatsApp messages, or SMS.
 */
export async function POST(
  request: NextRequest
) {
  const auth = await requireAdminOrRespond();

  if (!auth.authorized) {
    return auth.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonNoStore(
      {
        error: "Invalid JSON request body.",
      },
      400
    );
  }

  if (!isRecord(body)) {
    return jsonNoStore(
      {
        error: "Invalid request body.",
      },
      400
    );
  }

  const title = cleanString(body.title);
  const message = cleanString(body.message);
  const audience = body.audience;

  if (!title) {
    return jsonNoStore(
      {
        error: "Announcement title is required.",
      },
      400
    );
  }

  if (title.length > TITLE_MAX_LENGTH) {
    return jsonNoStore(
      {
        error: `Title must not exceed ${TITLE_MAX_LENGTH} characters.`,
      },
      400
    );
  }

  if (!message) {
    return jsonNoStore(
      {
        error: "Announcement message is required.",
      },
      400
    );
  }

  if (message.length > MESSAGE_MAX_LENGTH) {
    return jsonNoStore(
      {
        error: `Message must not exceed ${MESSAGE_MAX_LENGTH} characters.`,
      },
      400
    );
  }

  if (!isSendableAudience(audience)) {
    return jsonNoStore(
      {
        error:
          "Choose Everyone, Buyers, Sellers, or Admins. Selected-user targeting is not available yet.",
      },
      400
    );
  }

  const rawPriority = body.priority;

  let priority: NotificationPriority =
    NotificationPriority.NORMAL;

  if (rawPriority !== undefined) {
    if (!isNotificationPriority(rawPriority)) {
      return jsonNoStore(
        {
          error: "Invalid notification priority.",
        },
        400
      );
    }

    priority = rawPriority;
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Re-evaluate the audience at send time.
        const recipients = await tx.user.findMany({
          where: buildRecipientWhere(audience),
          select: {
            id: true,
          },
        });

        if (recipients.length === 0) {
          throw new NoEligibleRecipientsError();
        }

        const announcement =
          await tx.notificationAnnouncement.create({
            data: {
              title,
              message,
              audience,
              priority,
              createdById: auth.user.id,
            },
            select: {
              id: true,
              title: true,
              message: true,
              audience: true,
              priority: true,
              createdAt: true,
            },
          });

        const createdAt = new Date();

        // Every notification is linked to this announcement.
        // The deterministic key prevents duplicate keys for
        // the same recipient within this announcement.
        await tx.notification.createMany({
          data: recipients.map((recipient) => ({
            userId: recipient.id,
            type: NotificationType.SYSTEM_ANNOUNCEMENT,
            title,
            message,
            priority,
            announcementId: announcement.id,
            dedupeKey:
              `announcement:${announcement.id}:${recipient.id}`,
          })),
        });

        const notifications =
          await tx.notification.findMany({
            where: {
              announcementId: announcement.id,
            },
            select: {
              id: true,
            },
          });

        if (notifications.length !== recipients.length) {
          throw new Error(
            "The number of created notifications did not match the recipient count."
          );
        }

        // Match the existing notification service's
        // in-app delivery tracking convention.
        await tx.notificationDelivery.createMany({
          data: notifications.map(
            (notification) => ({
              notificationId: notification.id,
              channel: NotificationChannel.IN_APP,
              status:
                NotificationDeliveryStatus.DELIVERED,
              sentAt: createdAt,
              deliveredAt: createdAt,
            })
          ),
        });

        return {
          announcement,
          recipientCount: recipients.length,
        };
      },
      {
        maxWait: 10_000,
        timeout: 20_000,
      }
    );

    return jsonNoStore(
      {
        message: "Announcement sent successfully.",
        announcement: result.announcement,
        recipientCount: result.recipientCount,
        notificationCount: result.recipientCount,
        channel: NotificationChannel.IN_APP,
      },
      201
    );
  } catch (error) {
    if (error instanceof NoEligibleRecipientsError) {
      return jsonNoStore(
        {
          error:
            "There are no eligible recipients for this audience.",
        },
        409
      );
    }

    console.error(
      "Admin announcements POST error:",
      error
    );

    return jsonNoStore(
      {
        error:
          "Unable to send the announcement. No partial send was committed.",
      },
      500
    );
  }
}
