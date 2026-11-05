
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
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Vary: "Cookie",
  };
}

/*
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number
): number {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.min(parsed, maximum);
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

const MAX_PATCH_BODY_SIZE = 4096;

/*
 * ---------------------------------------------------------
 * GET
 * ---------------------------------------------------------
 *
 * Returns notifications belonging only to the
 * authenticated user.
 *
 * Supported query parameters:
 *
 * ?page=1
 * ?limit=20
 * ?unread=true
 *
 * unreadCount always represents the user's total
 * unread notifications, regardless of the list filter.
 * ---------------------------------------------------------
 */

export async function GET(request: NextRequest) {
  try {
    /*
     * AUTHENTICATION
     */

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: "You must be logged in to view notifications.",
        },
        {
          status: 401,
          headers: jsonHeaders(),
        }
      );
    }

    const userId = session.user.id;

    /*
     * QUERY PARAMETERS
     */

    const { searchParams } = new URL(request.url);

    const page = parsePositiveInteger(
      searchParams.get("page"),
      1,
      10_000
    );

    const limit = parsePositiveInteger(
      searchParams.get("limit"),
      20,
      50
    );

    const unreadParameter = cleanString(
      searchParams.get("unread")
    ).toLowerCase();

    let unreadFilter: boolean | undefined;

    if (unreadParameter === "true") {
      unreadFilter = true;
    } else if (unreadParameter === "false") {
      unreadFilter = false;
    }

    /*
     * USER-SCOPED WHERE CLAUSE
     */

    const where = {
      userId,

      ...(unreadFilter === true
        ? {
            readAt: null,
          }
        : unreadFilter === false
        ? {
            readAt: {
              not: null,
            },
          }
        : {}),
    };

    /*
     * TOTAL
     */

    const total = await prisma.notification.count({
      where,
    });

    const totalPages =
      total === 0
        ? 0
        : Math.ceil(total / limit);

    const safePage =
      totalPages > 0
        ? Math.min(page, totalPages)
        : 1;

    const skip = (safePage - 1) * limit;

    /*
     * NOTIFICATIONS
     */

    const notifications =
      await prisma.notification.findMany({
        where,

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        skip,
        take: limit,

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
      });

    /*
     * TOTAL UNREAD COUNT
     *
     * Independent of the current list filter.
     */

    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });

    return NextResponse.json(
      {
        notifications,
        unreadCount,

        pagination: {
          page: safePage,
          limit,
          total,
          totalPages,

          hasNextPage:
            totalPages > 0 &&
            safePage < totalPages,

          hasPreviousPage: safePage > 1,
        },
      },
      {
        status: 200,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error("Notifications GET error:", error);

    return NextResponse.json(
      {
        error: "Unable to load notifications.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/*
 * ---------------------------------------------------------
 * PATCH
 * ---------------------------------------------------------
 *
 * Supported operations:
 *
 * MARK_ONE:
 * {
 *   "action": "MARK_ONE",
 *   "notificationId": "..."
 * }
 *
 * MARK_ALL:
 * {
 *   "action": "MARK_ALL"
 * }
 *
 * The authenticated user's ID always comes from
 * the server-side session.
 * ---------------------------------------------------------
 */

export async function PATCH(request: NextRequest) {
  try {
    /*
     * AUTHENTICATION
     */

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          error: "You must be logged in to update notifications.",
        },
        {
          status: 401,
          headers: jsonHeaders(),
        }
      );
    }

    const userId = session.user.id;

    /*
     * READ AND VALIDATE REQUEST BODY
     */

    let body: PatchNotificationBody;

    try {
      const contentLength = Number(
        request.headers.get("content-length") ?? 0
      );

      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_PATCH_BODY_SIZE
      ) {
        return NextResponse.json(
          {
            error: "Request body is too large.",
          },
          {
            status: 413,
            headers: jsonHeaders(),
          }
        );
      }

      const rawBody = await request.text();

      if (rawBody.length > MAX_PATCH_BODY_SIZE) {
        return NextResponse.json(
          {
            error: "Request body is too large.",
          },
          {
            status: 413,
            headers: jsonHeaders(),
          }
        );
      }

      const parsed: unknown = JSON.parse(rawBody);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return NextResponse.json(
          {
            error: "Invalid request body.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      body = parsed as PatchNotificationBody;
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * PARSE ACTION
     */

    const action = cleanString(body.action).toUpperCase();

    /*
     * -----------------------------------------------------
     * MARK ONE
     * -----------------------------------------------------
     */

    if (action === "MARK_ONE") {
      const notificationId = cleanString(
        body.notificationId
      );

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
       * Only update an unread notification belonging
       * to the authenticated user.
       */

      const result = await prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId,
          readAt: null,
        },

        data: {
          readAt: new Date(),
        },
      });

      /*
       * Already read, missing, or owned by another user.
       */

      if (result.count === 0) {
        const existing = await prisma.notification.findFirst({
          where: {
            id: notificationId,
            userId,
          },

          select: {
            id: true,
            readAt: true,
          },
        });

        if (!existing) {
          return NextResponse.json(
            {
              error: "Notification not found.",
            },
            {
              status: 404,
              headers: jsonHeaders(),
            }
          );
        }

        return NextResponse.json(
          {
            message: "Notification was already marked as read.",
            notification: existing,
            updated: false,
          },
          {
            status: 200,
            headers: jsonHeaders(),
          }
        );
      }

      /*
       * Return the updated notification.
       */

      const notification = await prisma.notification.findFirst({
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
      });

      return NextResponse.json(
        {
          message: "Notification marked as read.",
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
      const now = new Date();

      const result = await prisma.notification.updateMany({
        where: {
          userId,
          readAt: null,
        },

        data: {
          readAt: now,
        },
      });

      return NextResponse.json(
        {
          message: "All unread notifications have been marked as read.",
          updatedCount: result.count,
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
        error: "Invalid notification action. Use MARK_ONE or MARK_ALL.",
      },
      {
        status: 400,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error("Notifications PATCH error:", error);

    return NextResponse.json(
      {
        error: "Unable to update notifications.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}
