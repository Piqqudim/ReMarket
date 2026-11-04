
import {
  NotificationPriority,
  NotificationType,
  ServiceBookingStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_BODY_SIZE = 12000;
const MAX_BOOKING_ID_LENGTH = 100;
const MAX_MESSAGES = 100;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function headers(base?: HeadersInit): Headers {
  const result = new Headers(base);
  result.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  result.set("Pragma", "no-cache");
  result.set("Expires", "0");
  return result;
}

function jsonError(message: string, status: number, base?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    { status, headers: headers(base) },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getAccount() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: unknown } | undefined;

  if (typeof sessionUser?.id !== "string" || !sessionUser.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, name: true },
  });
}

async function getBookingId(context: RouteContext) {
  const { id } = await context.params;
  const value = typeof id === "string" ? id.trim() : "";

  return value && value.length <= MAX_BOOKING_ID_LENGTH
    ? value
    : null;
}

/* -------------------------------------------------------------------------- */
/* GET: READ BOOKING CONVERSATION                                             */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest, context: RouteContext) {
  const limit = checkPublicRateLimit(request, "request-read");

  if (!limit.allowed) {
    return jsonError("Too many requests. Please try again shortly.", 429, limit.headers);
  }

  try {
    const account = await getAccount();

    if (!account) {
      return jsonError("Please sign in to view this conversation.", 401, limit.headers);
    }

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError("Invalid booking ID.", 400, limit.headers);
    }

    const booking = await prisma.serviceBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        buyerId: true,
        service: {
          select: {
            id: true,
            name: true,
            business: {
              select: { ownerId: true },
            },
          },
        },
      },
    });

    if (!booking) {
      return jsonError("Booking conversation not found.", 404, limit.headers);
    }

    const isBuyer = booking.buyerId === account.id;
    const isSeller = booking.service.business.ownerId === account.id;

    if (!isBuyer && !isSeller) {
      return jsonError("Booking conversation not found.", 404, limit.headers);
    }

    // Mark messages from the other participant as read.
    await prisma.serviceBookingMessage.updateMany({
      where: {
        bookingId,
        senderId: { not: account.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    const [total, records] = await Promise.all([
      prisma.serviceBookingMessage.count({
        where: { bookingId },
      }),

      prisma.serviceBookingMessage.findMany({
        where: { bookingId },
        select: {
          id: true,
          body: true,
          senderId: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: MAX_MESSAGES,
      }),
    ]);

    const messages = records.reverse();
    const senderIds = [...new Set(messages.map((item) => item.senderId))];

    const senders = senderIds.length
      ? await prisma.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, name: true },
        })
      : [];

    const senderNames = new Map(
      senders.map((sender) => [sender.id, sender.name]),
    );

    return NextResponse.json(
      {
        booking: {
          id: booking.id,
          status: booking.status,
          service: {
            id: booking.service.id,
            name: booking.service.name,
          },
        },
        currentUser: {
          id: account.id,
          name: account.name,
          role: isBuyer ? "BUYER" : "SELLER",
        },
        messages: messages.map((item) => ({
          id: item.id,
          body: item.body,
          senderId: item.senderId,
          senderName: senderNames.get(item.senderId) || "ReMarket user",
          isOwnMessage: item.senderId === account.id,
          readAt: item.readAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
        total,
        hasMore: total > messages.length,
      },
      { headers: headers(limit.headers) },
    );
  } catch (error) {
    console.error("Booking conversation GET error:", error);

    return jsonError(
      "Unable to load this booking conversation.",
      500,
      limit.headers,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST: SEND BOOKING MESSAGE                                                 */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest, context: RouteContext) {
  const limit = checkPublicRateLimit(request, "request-create");

  if (!limit.allowed) {
    return jsonError("Too many messages. Please try again shortly.", 429, limit.headers);
  }

  try {
    const account = await getAccount();

    if (!account) {
      return jsonError("Please sign in to send a message.", 401, limit.headers);
    }

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError("Invalid booking ID.", 400, limit.headers);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE) {
      return jsonError("Request body is too large.", 413, limit.headers);
    }

    const rawBody = await request.text();

    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_SIZE) {
      return jsonError("Request body is too large.", 413, limit.headers);
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON request body.", 400, limit.headers);
    }

    if (!isRecord(body)) {
      return jsonError("Invalid request body.", 400, limit.headers);
    }

    const rawMessage = body.message ?? body.body;

    if (typeof rawMessage !== "string") {
      return jsonError("Message text is required.", 400, limit.headers);
    }

    const messageText = rawMessage.trim();

    if (!messageText) {
      return jsonError("Message cannot be empty.", 400, limit.headers);
    }

    if (messageText.length > MAX_MESSAGE_LENGTH) {
      return jsonError(
        `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
        400,
        limit.headers,
      );
    }

    /* SAVE MESSAGE AND RESOLVE RECIPIENT */

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.serviceBooking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          status: true,
          buyerId: true,
          service: {
            select: {
              id: true,
              name: true,
              business: {
                select: { ownerId: true },
              },
            },
          },
        },
      });

      if (!booking) {
        return { outcome: "NOT_FOUND" as const };
      }

      const isBuyer = booking.buyerId === account.id;
      const isSeller = booking.service.business.ownerId === account.id;

      if (!isBuyer && !isSeller) {
        return { outcome: "NOT_FOUND" as const };
      }

      // Messaging is enabled after acceptance and remains
      // available for completed bookings.
      const canMessage =
        booking.status === ServiceBookingStatus.ACCEPTED ||
        booking.status === ServiceBookingStatus.COMPLETED;

      if (!canMessage) {
        return { outcome: "NOT_ACCEPTED" as const };
      }

      const recipientId = isBuyer
        ? booking.service.business.ownerId
        : booking.buyerId;

      const created = await tx.serviceBookingMessage.create({
        data: {
          bookingId,
          senderId: account.id,
          body: messageText,
        },
        select: {
          id: true,
          body: true,
          senderId: true,
          readAt: true,
          createdAt: true,
        },
      });

      return {
        outcome: "CREATED" as const,
        message: created,
        recipientId,
        service: {
          id: booking.service.id,
          name: booking.service.name,
        },
      };
    });

    if (result.outcome === "NOT_FOUND") {
      return jsonError("Booking conversation not found.", 404, limit.headers);
    }

    if (result.outcome === "NOT_ACCEPTED") {
      return jsonError(
        "Messaging becomes available after the provider accepts the booking.",
        409,
        limit.headers,
      );
    }

    /* NOTIFY THE OTHER PARTICIPANT */

    if (result.recipientId && result.recipientId !== account.id) {
      try {
        await createNotification({
          userId: result.recipientId,
          type: NotificationType.SERVICE_BOOKING_MESSAGE,
          title: "New service booking message",
          message: `You have a new message about ${result.service.name}.`,
          priority: NotificationPriority.NORMAL,
          data: {
            bookingId,
            serviceId: result.service.id,
            serviceName: result.service.name,
          },
          dedupeKey: `SERVICE_BOOKING_MESSAGE:${result.message.id}:${result.recipientId}`,
        });
      } catch (notificationError) {
        // The message is already saved. A notification failure
        // must not make the sender believe that sending failed.
        console.error(
          "Booking message notification error:",
          notificationError,
        );
      }
    }

    return NextResponse.json(
      {
        message: "Message sent successfully.",
        booking: {
          id: bookingId,
          service: result.service,
        },
        messageRecord: {
          id: result.message.id,
          body: result.message.body,
          senderId: result.message.senderId,
          senderName: account.name || "ReMarket user",
          isOwnMessage: true,
          readAt: result.message.readAt?.toISOString() ?? null,
          createdAt: result.message.createdAt.toISOString(),
        },
      },
      {
        status: 201,
        headers: headers(limit.headers),
      },
    );
  } catch (error) {
    console.error("Booking conversation POST error:", error);

    return jsonError(
      "Unable to send your message. Please try again.",
      500,
      limit.headers,
    );
  }
}
