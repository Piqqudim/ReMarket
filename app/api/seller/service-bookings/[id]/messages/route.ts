
import { ServiceBookingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_BODY_SIZE = 12_000;
const MAX_BOOKING_ID_LENGTH = 100;
const MAX_MESSAGES = 100;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function responseHeaders(base?: HeadersInit): Headers {
  const headers = new Headers(base);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    { status, headers: responseHeaders(headers) },
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

async function resolveParticipant(bookingId: string, userId: string) {
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
          businessId: true,
        },
      },
    },
  });

  if (!booking) return null;

  if (booking.buyerId === userId) {
    return { booking, role: "BUYER" as const };
  }

  const ownedBusiness = await prisma.business.findFirst({
    where: {
      id: booking.service.businessId,
      ownerId: userId,
    },
    select: { id: true },
  });

  return ownedBusiness
    ? { booking, role: "SELLER" as const }
    : null;
}

async function getBookingId(context: RouteContext) {
  const { id } = await context.params;
  const bookingId = typeof id === "string" ? id.trim() : "";

  return bookingId && bookingId.length <= MAX_BOOKING_ID_LENGTH
    ? bookingId
    : null;
}

/* -------------------------------------------------------------------------- */
/* GET: LOAD BOOKING CONVERSATION                                             */
/* -------------------------------------------------------------------------- */

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const rateLimit = checkPublicRateLimit(request, "request-read");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const account = await getAccount();

    if (!account) {
      return jsonError("Please sign in to view this conversation.", 401, rateLimit.headers);
    }

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError("Invalid booking ID.", 400, rateLimit.headers);
    }

    const participant = await resolveParticipant(bookingId, account.id);

    // Do not reveal whether another person's booking exists.
    if (!participant) {
      return jsonError("Booking conversation not found.", 404, rateLimit.headers);
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
    const senderIds = [...new Set(messages.map((message) => message.senderId))];

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
          id: participant.booking.id,
          status: participant.booking.status,
          service: {
            id: participant.booking.service.id,
            name: participant.booking.service.name,
          },
        },
        currentUser: {
          id: account.id,
          name: account.name,
          role: participant.role,
        },
        messages: messages.map((message) => ({
          id: message.id,
          body: message.body,
          senderId: message.senderId,
          senderName: senderNames.get(message.senderId) || "ReMarket user",
          isOwnMessage: message.senderId === account.id,
          readAt: message.readAt?.toISOString() ?? null,
          createdAt: message.createdAt.toISOString(),
        })),
        total,
        hasMore: total > messages.length,
      },
      { headers: responseHeaders(rateLimit.headers) },
    );
  } catch (error) {
    console.error("Booking conversation GET error:", error);

    return jsonError(
      "Unable to load this booking conversation.",
      500,
      rateLimit.headers,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST: SEND BOOKING MESSAGE                                                 */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const rateLimit = checkPublicRateLimit(request, "request-create");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many messages. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const account = await getAccount();

    if (!account) {
      return jsonError("Please sign in to send a message.", 401, rateLimit.headers);
    }

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError("Invalid booking ID.", 400, rateLimit.headers);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE) {
      return jsonError("Request body is too large.", 413, rateLimit.headers);
    }

    const rawBody = await request.text();

    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_SIZE) {
      return jsonError("Request body is too large.", 413, rateLimit.headers);
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON request body.", 400, rateLimit.headers);
    }

    if (!isRecord(body)) {
      return jsonError("Invalid request body.", 400, rateLimit.headers);
    }

    const rawMessage = body.message ?? body.body;

    if (typeof rawMessage !== "string") {
      return jsonError("Message text is required.", 400, rateLimit.headers);
    }

    const messageText = rawMessage.trim();

    if (!messageText) {
      return jsonError("Message cannot be empty.", 400, rateLimit.headers);
    }

    if (messageText.length > MAX_MESSAGE_LENGTH) {
      return jsonError(
        `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    /*
     * Check booking ownership and current status again inside the
     * transaction before saving the message.
     */
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
              businessId: true,
            },
          },
        },
      });

      if (!booking) return { outcome: "NOT_FOUND" as const };

      const isBuyer = booking.buyerId === account.id;

      const ownedBusiness = isBuyer
        ? null
        : await tx.business.findFirst({
            where: {
              id: booking.service.businessId,
              ownerId: account.id,
            },
            select: { id: true },
          });

      if (!isBuyer && !ownedBusiness) {
        return { outcome: "NOT_FOUND" as const };
      }

      const canMessage =
        booking.status === ServiceBookingStatus.ACCEPTED ||
        booking.status === ServiceBookingStatus.COMPLETED;

      if (!canMessage) {
        return { outcome: "NOT_ACCEPTED" as const };
      }

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
        service: booking.service,
      };
    });

    if (result.outcome === "NOT_FOUND") {
      return jsonError("Booking conversation not found.", 404, rateLimit.headers);
    }

    if (result.outcome === "NOT_ACCEPTED") {
      return jsonError(
        "Messaging becomes available after the provider accepts the booking.",
        409,
        rateLimit.headers,
      );
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
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Booking conversation POST error:", error);

    return jsonError(
      "Unable to send your message. Please try again.",
      500,
      rateLimit.headers,
    );
  }
}
