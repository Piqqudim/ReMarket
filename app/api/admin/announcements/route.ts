import { createHash } from "node:crypto";
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
const INSERT_BATCH_SIZE = 500;

const SENDABLE_AUDIENCES = [
  NotificationAudience.EVERYONE,
  NotificationAudience.BUYERS,
  NotificationAudience.SELLERS,
  NotificationAudience.ADMINS,
] as const;

type SendableAudience =
  (typeof SENDABLE_AUDIENCES)[number];

type AnnouncementSummary = {
  id: string;
  title: string;
  message: string;
  audience: NotificationAudience;
  priority: NotificationPriority;
  createdAt: Date;
};

class NoEligibleRecipientsError extends Error {
  constructor() {
    super("No eligible users were found for this audience.");
    this.name = "NoEligibleRecipientsError";
  }
}

class IdempotencyConflictError extends Error {
  constructor() {
    super("This request key was already used for a different announcement.");
    this.name = "IdempotencyConflictError";
  }
}

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isSendableAudience(value: unknown): value is SendableAudience {
  return (
    typeof value === "string" &&
    SENDABLE_AUDIENCES.some((audience) => audience === value)
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
        notificationType: NotificationType.SYSTEM_ANNOUNCEMENT,
        inApp: false,
      },
    },
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function makeRequestFingerprint(input: {
  title: string;
  message: string;
  audience: SendableAudience;
  priority: NotificationPriority;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title,
        message: input.message,
        audience: input.audience,
        priority: input.priority,
      })
    )
    .digest("hex");
}

function getStoredIdempotencyMetadata(
  value: Prisma.JsonValue | null
): { idempotencyKey: string; requestFingerprint: string } | null {
  if (!isRecord(value) || !isRecord(value.__meta)) {
    return null;
  }

  const idempotencyKey = value.__meta.idempotencyKey;
  const requestFingerprint = value.__meta.requestFingerprint;

  if (
    typeof idempotencyKey !== "string" ||
    typeof requestFingerprint !== "string"
  ) {
    return null;
  }

  return { idempotencyKey, requestFingerprint };
}

function mapAnnouncementSummary(
  announcement: AnnouncementSummary,
  recipientCount: number,
  alreadySent: boolean
) {
  return {
    announcement,
    recipientCount,
    notificationCount: recipientCount,
    channel: NotificationChannel.IN_APP,
    alreadySent,
  };
}

/**
 * GET /api/admin/announcements
 * Returns recent announcements and current eligible audience estimates.
 */
export async function GET() {
  const auth = await requireAdminOrRespond();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const [announcements, everyoneCount, buyersCount, sellersCount, adminsCount] =
      await Promise.all([
        prisma.notificationAnnouncement.findMany({
          orderBy: { createdAt: "desc" },
          take: ANNOUNCEMENT_HISTORY_LIMIT,
          select: {
            id: true,
            title: true,
            message: true,
            audience: true,
            priority: true,
            createdAt: true,
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
            _count: {
              select: { notifications: true },
            },
          },
        }),
        prisma.user.count({
          where: buildRecipientWhere(NotificationAudience.EVERYONE),
        }),
        prisma.user.count({
          where: buildRecipientWhere(NotificationAudience.BUYERS),
        }),
        prisma.user.count({
          where: buildRecipientWhere(NotificationAudience.SELLERS),
        }),
        prisma.user.count({
          where: buildRecipientWhere(NotificationAudience.ADMINS),
        }),
      ]);

    return jsonNoStore({
      announcements: announcements.map(({ _count, ...announcement }) => ({
        ...announcement,
        recipientCount: _count.notifications,
      })),
      audienceCounts: {
        EVERYONE: everyoneCount,
        BUYERS: buyersCount,
        SELLERS: sellersCount,
        ADMINS: adminsCount,
      },
      availableAudiences: SENDABLE_AUDIENCES,
    });
  } catch (error) {
    console.error("Admin announcements GET error:", error);
    return jsonNoStore(
      { error: "Unable to load announcements." },
      500
    );
  }
}

/**
 * POST /api/admin/announcements
 * Creates an announcement and in-app notifications atomically.
 * Clients must send a stable Idempotency-Key UUID for each send attempt.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminOrRespond();

  if (!auth.authorized) {
    return auth.response;
  }

  const idempotencyKey = cleanString(
    request.headers.get("Idempotency-Key")
  );

  if (!isUuid(idempotencyKey)) {
    return jsonNoStore(
      {
        error:
          "A valid Idempotency-Key UUID is required. Update the announcement page before sending.",
      },
      400
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonNoStore(
      { error: "Invalid JSON request body." },
      400
    );
  }

  if (!isRecord(body)) {
    return jsonNoStore(
      { error: "Invalid request body." },
      400
    );
  }

  const title = cleanString(body.title);
  const message = cleanString(body.message);
  const audience = body.audience;

  if (!title) {
    return jsonNoStore({ error: "Announcement title is required." }, 400);
  }

  if (title.length > TITLE_MAX_LENGTH) {
    return jsonNoStore(
      { error: `Title must not exceed ${TITLE_MAX_LENGTH} characters.` },
      400
    );
  }

  if (!message) {
    return jsonNoStore({ error: "Announcement message is required." }, 400);
  }

  if (message.length > MESSAGE_MAX_LENGTH) {
    return jsonNoStore(
      { error: `Message must not exceed ${MESSAGE_MAX_LENGTH} characters.` },
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

  let priority: NotificationPriority =NotificationPriority.NORMAL;
  if (body.priority !== undefined) {
    if (!isNotificationPriority(body.priority)) {
      return jsonNoStore(
        { error: "Invalid notification priority." },
        400
      );
    }
    priority = body.priority;
  }

  const requestFingerprint = makeRequestFingerprint({
    title,
    message,
    audience,
    priority,
  });

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // PostgreSQL transaction-scoped lock serializes retries that use
        // the same key, including concurrent requests on separate workers.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${idempotencyKey}, 0)
          )
        `;

        const existing = await tx.notificationAnnouncement.findFirst({
          where: {
            data: {
              path: ["__meta", "idempotencyKey"],
              equals: idempotencyKey,
            },
          },
          select: {
            id: true,
            title: true,
            message: true,
            audience: true,
            priority: true,
            createdAt: true,
            data: true,
            _count: {
              select: { notifications: true },
            },
          },
        });

        if (existing) {
          const metadata = getStoredIdempotencyMetadata(existing.data);

          if (
            !metadata ||
            metadata.requestFingerprint !== requestFingerprint
          ) {
            throw new IdempotencyConflictError();
          }

          return mapAnnouncementSummary(
            {
              id: existing.id,
              title: existing.title,
              message: existing.message,
              audience: existing.audience,
              priority: existing.priority,
              createdAt: existing.createdAt,
            },
            existing._count.notifications,
            true
          );
        }

        const recipientWhere = buildRecipientWhere(audience);
        const recipients = await tx.user.findMany({
          where: recipientWhere,
          select: { id: true },
        });

        if (recipients.length === 0) {
          throw new NoEligibleRecipientsError();
        }

        const announcement = await tx.notificationAnnouncement.create({
          data: {
            title,
            message,
            audience,
            priority,
            createdById: auth.user.id,
            data: {
              __meta: {
                idempotencyKey,
                requestFingerprint,
              },
            } satisfies Prisma.InputJsonObject,
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

        for (
          let start = 0;
          start < recipients.length;
          start += INSERT_BATCH_SIZE
        ) {
          const recipientBatch = recipients.slice(
            start,
            start + INSERT_BATCH_SIZE
          );

          await tx.notification.createMany({
            data: recipientBatch.map((recipient) => ({
              userId: recipient.id,
              type: NotificationType.SYSTEM_ANNOUNCEMENT,
              title,
              message,
              priority,
              announcementId: announcement.id,
              dedupeKey: `announcement:${announcement.id}:${recipient.id}`,
            })),
          });
        }

        const createdNotifications = await tx.notification.findMany({
          where: { announcementId: announcement.id },
          select: { id: true },
        });

        if (createdNotifications.length !== recipients.length) {
          throw new Error(
            "Created notification count did not match the eligible recipient count."
          );
        }

        const deliveredAt = new Date();

        for (
          let start = 0;
          start < createdNotifications.length;
          start += INSERT_BATCH_SIZE
        ) {
          const notificationBatch = createdNotifications.slice(
            start,
            start + INSERT_BATCH_SIZE
          );

          await tx.notificationDelivery.createMany({
            data: notificationBatch.map((notification) => ({
              notificationId: notification.id,
              channel: NotificationChannel.IN_APP,
              status: NotificationDeliveryStatus.DELIVERED,
              sentAt: deliveredAt,
              deliveredAt,
            })),
          });
        }

        return mapAnnouncementSummary(
          announcement,
          recipients.length,
          false
        );
      },
      {
        maxWait: 10_000,
        timeout: 20_000,
      }
    );

    return jsonNoStore(
      {
        message: result.alreadySent
          ? "This announcement was already sent. The existing result has been returned."
          : "Announcement sent successfully.",
        ...result,
      },
      result.alreadySent ? 200 : 201
    );
  } catch (error) {
    if (error instanceof NoEligibleRecipientsError) {
      return jsonNoStore(
        { error: "There are no eligible recipients for this audience." },
        409
      );
    }

    if (error instanceof IdempotencyConflictError) {
      return jsonNoStore(
        {
          error:
            "This send key was already used with different announcement details. Return to editing and submit the changed announcement as a new send.",
        },
        409
      );
    }

    console.error("Admin announcements POST error:", error);
    return jsonNoStore(
      {
        error:
          "Unable to send the announcement. The database transaction was rolled back if it did not complete.",
      },
      500
    );
  }
}
