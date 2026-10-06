import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

/*
 * ---------------------------------------------------------
 * RESPONSE HEADERS
 * ---------------------------------------------------------
 */

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}

/*
 * ---------------------------------------------------------
 * JSON BODY TYPE
 * ---------------------------------------------------------
 */

type PatchNotificationBody = {
  notificationId?: unknown;
  action?: unknown;
};

/*
 * ---------------------------------------------------------
 * PATCH
 * ---------------------------------------------------------
 *
 * Supported operations:
 *
 * 1. Mark one notification as read:
 *
 * {
 *   "action": "MARK_ONE",
 *   "notificationId": "..."
 * }
 *
 * 2. Mark all notifications as read:
 *
 * {
 *   "action": "MARK_ALL"
 * }
 *
 * The authenticated user's ID is always taken from
 * the server-side session.
 *
 * A client cannot choose another user's notifications.
 */

export async function PATCH(
  request: NextRequest
) {
  try {
    /*
     * -----------------------------------------------------
     * AUTHENTICATION
     * -----------------------------------------------------
     */

    const session =
      await getServerSession(
        authOptions
      );

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error:
            "You must be logged in to update notifications.",
        },
        {
          status: 401,
          headers: jsonHeaders(),
        }
      );
    }

    const userId =
      session.user.id;

    /*
     * -----------------------------------------------------
     * READ REQUEST BODY
     * -----------------------------------------------------
     */

    let body: PatchNotificationBody;

    try {
      const parsed: unknown =
        await request.json();

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid request body.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      body =
        parsed as PatchNotificationBody;
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid JSON request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------------------
     * PARSE ACTION
     * -----------------------------------------------------
     */

    const action =
      typeof body.action === "string"
        ? body.action.trim().toUpperCase()
        : "";

    /*
     * -----------------------------------------------------
     * MARK ONE
     * -----------------------------------------------------
     */

    if (action === "MARK_ONE") {
      const notificationId =
        typeof body.notificationId ===
        "string"
          ? body.notificationId.trim()
          : "";

      if (!notificationId) {
        return NextResponse.json(
          {
            error:
              "notificationId is required when marking one notification as read.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      /*
       * The userId condition is essential.
       *
       * It means the notification can only be updated
       * when it belongs to the currently authenticated user.
       */
      const result =
        await prisma.notification.updateMany(
          {
            where: {
              id: notificationId,
              userId,
              readAt: null,
            },

            data: {
              readAt: new Date(),
            },
          }
        );

      /*
       * count === 0 means either:
       *
       * - the notification does not exist,
       * - it belongs to another user,
       * - or it was already read.
       */
      if (result.count === 0) {
        const existing =
          await prisma.notification.findFirst(
            {
              where: {
                id: notificationId,
                userId,
              },
              select: {
                id: true,
                readAt: true,
              },
            }
          );

        if (!existing) {
          return NextResponse.json(
            {
              error:
                "Notification not found.",
            },
            {
              status: 404,
              headers: jsonHeaders(),
            }
          );
        }

        return NextResponse.json(
          {
            message:
              "Notification was already marked as read.",
            notification: existing,
            updated: false,
          },
          {
            status: 200,
            headers: jsonHeaders(),
          }
        );
      }

      const notification =
        await prisma.notification.findFirst(
          {
            where: {
              id: notificationId,
              userId,
            },
            select: {
              id: true,
              type: true,
              title: true,
              message: true,
              priority: true,
              data: true,
              readAt: true,
              announcementId: true,
              createdAt: true,
            },
          }
        );

      return NextResponse.json(
        {
          message:
            "Notification marked as read.",
          notification,
          updated: true,
        },
        {
          status: 200,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------------------
     * MARK ALL
     * -----------------------------------------------------
     */

    if (action === "MARK_ALL") {
      const now =
        new Date();

      const result =
        await prisma.notification.updateMany(
          {
            where: {
              userId,
              readAt: null,
            },

            data: {
              readAt: now,
            },
          }
        );

      return NextResponse.json(
        {
          message:
            "All unread notifications have been marked as read.",
          updatedCount:
            result.count,
        },
        {
          status: 200,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------------------
     * INVALID ACTION
     * -----------------------------------------------------
     */

    return NextResponse.json(
      {
        error:
          "Invalid notification action. Use MARK_ONE or MARK_ALL.",
      },
      {
        status: 400,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Notifications PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update notifications.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}
