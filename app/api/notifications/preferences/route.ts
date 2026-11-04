
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

const CHANNELS = [
  "inApp",
  "push",
  "email",
  "whatsapp",
  "sms",
] as const;

type Channel = (typeof CHANNELS)[number];

type PreferenceUpdates = Partial<
  Record<Channel, boolean>
>;

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  };
}

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: jsonHeaders(),
  });
}

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
}

/*
 * GET /api/notifications/preferences
 *
 * Retrieves preferences for every notification type.
 *
 * Missing preference records use application defaults:
 * inApp: true
 * push: false
 * email: false
 * whatsapp: false
 * sms: false
 */

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return response(
        { error: "You must be logged in to view notification preferences." },
        401
      );
    }

    const savedPreferences =
      await prisma.notificationPreference.findMany({
        where: { userId: user.id },
        orderBy: { notificationType: "asc" },
      });

    const preferenceMap = new Map(
      savedPreferences.map((preference) => [
        preference.notificationType,
        preference,
      ])
    );

    const preferences = Object.values(NotificationType).map(
      (notificationType) => {
        const saved = preferenceMap.get(notificationType);

        return {
          notificationType,
          inApp: saved?.inApp ?? true,
          push: saved?.push ?? false,
          email: saved?.email ?? false,
          whatsapp: saved?.whatsapp ?? false,
          sms: saved?.sms ?? false,
          customized: Boolean(saved),
          updatedAt: saved?.updatedAt ?? null,
        };
      }
    );

    return response({
      preferences,
      channels: CHANNELS,
    });
  } catch (error) {
    console.error("Notification preferences GET error:", error);

    return response(
      { error: "Unable to load notification preferences." },
      500
    );
  }
}

/*
 * PATCH /api/notifications/preferences
 *
 * Request body:
 *
 * {
 *   "notificationType": "SERVICE_BOOKING_CREATED",
 *   "inApp": true,
 *   "push": false,
 *   "email": true,
 *   "whatsapp": false,
 *   "sms": false
 * }
 *
 * Only supplied channel values are updated.
 * Other existing preferences remain unchanged.
 */

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return response(
        { error: "You must be logged in to update notification preferences." },
        401
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return response(
        { error: "Invalid JSON request body." },
        400
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return response(
        { error: "Invalid request body." },
        400
      );
    }

    const data = body as Record<string, unknown>;

    const notificationType =
      typeof data.notificationType === "string"
        ? data.notificationType.trim().toUpperCase()
        : "";

    if (
      !Object.values(NotificationType).includes(
        notificationType as NotificationType
      )
    ) {
      return response(
        { error: "A valid notificationType is required." },
        400
      );
    }

    const updates: PreferenceUpdates = {};

    for (const channel of CHANNELS) {
      if (Object.prototype.hasOwnProperty.call(data, channel)) {
        if (typeof data[channel] !== "boolean") {
          return response(
            { error: `${channel} must be a boolean value.` },
            400
          );
        }

        updates[channel] = data[channel] as boolean;
      }
    }

    if (Object.keys(updates).length === 0) {
      return response(
        { error: "Provide at least one notification channel to update." },
        400
      );
    }

    const preference =
      await prisma.notificationPreference.upsert({
        where: {
          userId_notificationType: {
            userId: user.id,
            notificationType:
              notificationType as NotificationType,
          },
        },
        update: updates,
        create: {
          userId: user.id,
          notificationType:
            notificationType as NotificationType,
          ...updates,
        },
      });

    return response({
      message: "Notification preferences updated successfully.",
      preference,
    });
  } catch (error) {
    console.error("Notification preferences PATCH error:", error);

    return response(
      { error: "Unable to update notification preferences." },
      500
    );
  }
}

