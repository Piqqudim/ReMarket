
import {
  NotificationPriority,
  NotificationType,
  Prisma,
  ServiceBookingStatus,
} from "@prisma/client";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/*
 * ---------------------------------------------------------
 * CONFIGURATION
 * ---------------------------------------------------------
 */

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_BODY_SIZE = 12_000;
const MAX_BOOKING_ID_LENGTH = 100;
const MAX_MESSAGES = 100;

/*
 * ---------------------------------------------------------
 * TYPES
 * ---------------------------------------------------------
 */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type Account = {
  id: string;
  name: string | null;
  role: "BUYER" | "SELLER";
};

type AccountResult =
  | {
      account: Account;
      error: null;
      status: 200;
    }
  | {
      account: null;
      error: string;
      status: 401 | 403;
    };

/*
 * ---------------------------------------------------------
 * PRISMA BOOKING SELECT
 * ---------------------------------------------------------
 *
 * Derive the booking type from Prisma instead of manually
 * maintaining a separate type.
 * ---------------------------------------------------------
 */

const conversationBookingSelect = {
  id: true,
  status: true,

  buyerId: true,
  sellerId: true,

  service: {
    select: {
      id: true,
      name: true,

      business: {
        select: {
          ownerId: true,
        },
      },
    },
  },
} satisfies Prisma.ServiceBookingSelect;

type ConversationBooking =
  Prisma.ServiceBookingGetPayload<{
    select: typeof conversationBookingSelect;
  }>;

/*
 * ---------------------------------------------------------
 * RESPONSE HELPERS
 * ---------------------------------------------------------
 */

function responseHeaders(base?: HeadersInit): Headers {
  const result = new Headers(base);

  result.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );

  result.set("Pragma", "no-cache");
  result.set("Expires", "0");
  result.set("X-Content-Type-Options", "nosniff");

  return result;
}

function jsonError(
  message: string,
  status: number,
  base?: HeadersInit,
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: responseHeaders(base),
    },
  );
}

/*
 * ---------------------------------------------------------
 * GENERAL HELPERS
 * ---------------------------------------------------------
 */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/*
 * ---------------------------------------------------------
 * AUTHENTICATION
 * ---------------------------------------------------------
 */

async function getAccount(): Promise<AccountResult> {
  const session = await getServerSession(authOptions);

  const sessionUser = session?.user as
    | {
        id?: unknown;
      }
    | undefined;

  if (
    typeof sessionUser?.id !== "string" ||
    !sessionUser.id
  ) {
    return {
      account: null,
      error: "Please sign in to continue.",
      status: 401,
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },

    select: {
      id: true,
      name: true,
      role: true,
    },
  });

  if (!user) {
    return {
      account: null,
      error: "Your account could not be found.",
      status: 401,
    };
  }

  if (
    user.role !== "BUYER" &&
    user.role !== "SELLER"
  ) {
    return {
      account: null,
      error:
        "Only buyers and sellers can access booking conversations.",
      status: 403,
    };
  }

  return {
    account: {
      id: user.id,
      name: user.name,
      role: user.role,
    },

    error: null,
    status: 200,
  };
}

/*
 * ---------------------------------------------------------
 * BOOKING ID
 * ---------------------------------------------------------
 */

async function getBookingId(
  context: RouteContext,
): Promise<string | null> {
  const { id } = await context.params;

  const value =
    typeof id === "string"
      ? id.trim()
      : "";

  return (
    value &&
    value.length <= MAX_BOOKING_ID_LENGTH
  )
    ? value
    : null;
}

/*
 * ---------------------------------------------------------
 * REQUEST BODY PROTECTION
 * ---------------------------------------------------------
 */

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

async function readLimitedRequestBody(
  request: NextRequest,
): Promise<string> {
  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_BODY_SIZE) {
        try {
          await reader.cancel();
        } catch {
          // The stream may already be closed.
        }

        throw new RequestBodyTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);

  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", {
    fatal: true,
  }).decode(bytes);
}

/*
 * ---------------------------------------------------------
 * BOOKING PARTICIPANTS
 * ---------------------------------------------------------
 *
 * New bookings:
 * ServiceBooking.sellerId stores the assigned seller.
 *
 * Legacy bookings:
 * sellerId can be null, so ownership falls back to:
 *
 * ServiceBooking -> Service -> Business -> ownerId.
 *
 * Only the assigned buyer and seller can access the
 * booking conversation.
 * ---------------------------------------------------------
 */

function resolveSellerId(
  booking: ConversationBooking,
): string | null {
  return (
    booking.sellerId ??
    booking.service.business.ownerId
  );
}

function isBookingParticipant(
  booking: ConversationBooking,
  account: Account,
): boolean {
  const sellerId = resolveSellerId(booking);

  const isBuyer =
    account.role === "BUYER" &&
    booking.buyerId === account.id;

  const isSeller =
    account.role === "SELLER" &&
    sellerId === account.id;

  return isBuyer || isSeller;
}

/*
 * ---------------------------------------------------------
 * MESSAGE PERMISSIONS
 * ---------------------------------------------------------
 *
 * PENDING:
 * Buyer and provider can discuss the original request.
 *
 * AWAITING_BUYER:
 * Buyer and provider can discuss the quotation.
 *
 * ACCEPTED:
 * Booking has been accepted.
 *
 * IN_PROGRESS:
 * Service is being delivered.
 *
 * COMPLETED:
 * Conversation remains available for follow-up.
 *
 * DECLINED and CANCELLED:
 * Conversation is read-only.
 * ---------------------------------------------------------
 */

const MESSAGEABLE_STATUSES: readonly ServiceBookingStatus[] = [
  "PENDING",
  "AWAITING_BUYER",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
];

function canMessage(
  status: ServiceBookingStatus,
): boolean {
  return MESSAGEABLE_STATUSES.includes(status);
}

/*
 * =========================================================
 * GET: READ BOOKING CONVERSATION
 * =========================================================
 *
 * GET /api/service-bookings/[id]/messages
 *
 * Optional query:
 * ?before=MESSAGE_ID
 *
 * The first request returns the latest 100 messages.
 * Further requests can use nextCursor to load older
 * messages without loading the entire conversation.
 * =========================================================
 */

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const limit = checkPublicRateLimit(
    request,
    "request-read",
  );

  if (!limit.allowed) {
    return jsonError(
      "Too many requests. Please try again shortly.",
      429,
      limit.headers,
    );
  }

  try {
    /*
     * AUTHENTICATION
     */

    const auth = await getAccount();

    if (!auth.account) {
      return jsonError(
        auth.error,
        auth.status,
        limit.headers,
      );
    }

    const account = auth.account;

    /*
     * BOOKING ID
     */

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError(
        "Invalid booking ID.",
        400,
        limit.headers,
      );
    }

    /*
     * PAGINATION CURSOR
     */

    const beforeParameter =
      request.nextUrl.searchParams.get("before");

    const before = beforeParameter?.trim() ?? null;

    if (
      beforeParameter !== null &&
      (
        !before ||
        before.length > MAX_BOOKING_ID_LENGTH
      )
    ) {
      return jsonError(
        "Invalid message pagination cursor.",
        400,
        limit.headers,
      );
    }

    /*
     * LOAD BOOKING
     */

    const booking = await prisma.serviceBooking.findUnique({
      where: {
        id: bookingId,
      },

      select: conversationBookingSelect,
    });

    if (!booking) {
      return jsonError(
        "Booking conversation not found.",
        404,
        limit.headers,
      );
    }

    /*
     * VERIFY PARTICIPANT
     */

    if (!isBookingParticipant(booking, account)) {
      return jsonError(
        "Booking conversation not found.",
        404,
        limit.headers,
      );
    }

    /*
     * LOAD MESSAGE PAGE AND MARK VISIBLE MESSAGES READ
     */

    const page = await prisma.$transaction(
      async (tx) => {
        /*
         * Validate that the cursor belongs to this booking.
         */

        if (before) {
          const cursorMessage =
            await tx.serviceBookingMessage.findFirst({
              where: {
                id: before,
                bookingId,
              },

              select: {
                id: true,
              },
            });

          if (!cursorMessage) {
            return {
              invalidCursor: true as const,
            };
          }
        }

        /*
         * Count all messages in this conversation.
         */

        const total =
          await tx.serviceBookingMessage.count({
            where: {
              bookingId,
            },
          });

        /*
         * Fetch one extra message to determine whether
         * another page exists.
         *
         * Results are newest first at the database level.
         */

        const fetchedMessages =
          await tx.serviceBookingMessage.findMany({
            where: {
              bookingId,
            },

            ...(before
              ? {
                  cursor: {
                    id: before,
                  },
                  skip: 1,
                }
              : {}),

            select: {
              id: true,
              body: true,
              senderId: true,
              readAt: true,
              createdAt: true,
            },

            orderBy: [
              {
                createdAt: "desc",
              },
              {
                id: "desc",
              },
            ],

            take: MAX_MESSAGES + 1,
          });

        const hasMore =
          fetchedMessages.length > MAX_MESSAGES;

        /*
         * Only return the requested page.
         */

        const visibleMessages =
          fetchedMessages.slice(0, MAX_MESSAGES);

        /*
         * Mark only messages in this page as read.
         *
         * Older messages not loaded by the current request
         * remain unread until their page is opened.
         */

        const unreadMessageIds =
          visibleMessages
            .filter(
              (message) =>
                message.senderId !== account.id &&
                message.readAt === null,
            )
            .map((message) => message.id);

        let messages = visibleMessages;

        if (unreadMessageIds.length > 0) {
          await tx.serviceBookingMessage.updateMany({
            where: {
              id: {
                in: unreadMessageIds,
              },

              bookingId,

              senderId: {
                not: account.id,
              },

              readAt: null,
            },

            data: {
              readAt: new Date(),
            },
          });

          /*
           * Reload the selected messages so returned
           * readAt values reflect the database.
           */

          messages =
            await tx.serviceBookingMessage.findMany({
              where: {
                id: {
                  in: visibleMessages.map(
                    (message) => message.id,
                  ),
                },

                bookingId,
              },

              select: {
                id: true,
                body: true,
                senderId: true,
                readAt: true,
                createdAt: true,
              },

              orderBy: [
                {
                  createdAt: "desc",
                },
                {
                  id: "desc",
                },
              ],
            });
        }

        /*
         * The next cursor is the oldest message
         * included in the current page.
         */

        const nextCursor =
          hasMore && visibleMessages.length > 0
            ? visibleMessages[
                visibleMessages.length - 1
              ].id
            : null;

        return {
          invalidCursor: false as const,
          total,
          messages,
          hasMore,
          nextCursor,
        };
      },
    );

    if (page.invalidCursor) {
      return jsonError(
        "The message pagination cursor is invalid.",
        400,
        limit.headers,
      );
    }

    /*
     * GET SENDER NAMES
     */

    const senderIds = [
      ...new Set(
        page.messages.map(
          (message) => message.senderId,
        ),
      ),
    ];

    const senders = senderIds.length
      ? await prisma.user.findMany({
          where: {
            id: {
              in: senderIds,
            },
          },

          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const senderNames = new Map(
      senders.map((sender) => [
        sender.id,
        sender.name,
      ]),
    );

    /*
     * RETURN MESSAGES IN CHRONOLOGICAL ORDER
     */

    const messages = [...page.messages]
      .reverse()
      .map((item) => ({
        id: item.id,
        body: item.body,
        senderId: item.senderId,

        senderName:
          senderNames.get(item.senderId) ??
          "ReMarket user",

        isOwnMessage:
          item.senderId === account.id,

        readAt:
          item.readAt?.toISOString() ?? null,

        createdAt:
          item.createdAt.toISOString(),
      }));

    /*
     * RETURN CONVERSATION
     */

    return NextResponse.json(
      {
        booking: {
          id: booking.id,
          status: booking.status,

          canSendMessage: canMessage(
            booking.status,
          ),

          service: {
            id: booking.service.id,
            name: booking.service.name,
          },
        },

        currentUser: {
          id: account.id,
          name: account.name,
          role: account.role,
        },

        messages,

        total: page.total,

        hasMore: page.hasMore,

        nextCursor: page.nextCursor,
      },

      {
        headers: responseHeaders(limit.headers),
      },
    );
  } catch (error) {
    console.error(
      "Booking conversation GET error:",
      error,
    );

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return jsonError(
        "The conversation changed while loading. Please refresh.",
        409,
        limit.headers,
      );
    }

    return jsonError(
      "Unable to load this booking conversation.",
      500,
      limit.headers,
    );
  }
}

/*
 * =========================================================
 * POST: SEND BOOKING MESSAGE
 * =========================================================
 *
 * POST /api/service-bookings/[id]/messages
 *
 * Request body:
 *
 * {
 *   "message": "Hello, I would like an update."
 * }
 *
 * The sender must be the assigned buyer or seller.
 * =========================================================
 */

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const limit = checkPublicRateLimit(
    request,
    "request-create",
  );

  if (!limit.allowed) {
    return jsonError(
      "Too many messages. Please try again shortly.",
      429,
      limit.headers,
    );
  }

  try {
    /*
     * AUTHENTICATION
     */

    const auth = await getAccount();

    if (!auth.account) {
      return jsonError(
        auth.error,
        auth.status,
        limit.headers,
      );
    }

    const account = auth.account;

    /*
     * BOOKING ID
     */

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError(
        "Invalid booking ID.",
        400,
        limit.headers,
      );
    }

    /*
     * BODY SIZE VALIDATION
     */

    const contentLengthHeader =
      request.headers.get("content-length");

    if (contentLengthHeader !== null) {
      const contentLength = Number(
        contentLengthHeader,
      );

      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength < 0 ||
        contentLength > MAX_BODY_SIZE
      ) {
        return jsonError(
          "Request body is too large or invalid.",
          413,
          limit.headers,
        );
      }
    }

    /*
     * READ REQUEST BODY
     */

    let rawBody: string;

    try {
      rawBody = await readLimitedRequestBody(request);
    } catch (bodyError) {
      if (
        bodyError instanceof RequestBodyTooLargeError
      ) {
        return jsonError(
          "Request body is too large.",
          413,
          limit.headers,
        );
      }

      return jsonError(
        "Unable to read the request body.",
        400,
        limit.headers,
      );
    }

    /*
     * PARSE JSON
     */

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError(
        "Invalid JSON request body.",
        400,
        limit.headers,
      );
    }

    if (!isRecord(body)) {
      return jsonError(
        "Invalid request body.",
        400,
        limit.headers,
      );
    }

    /*
     * VALIDATE MESSAGE
     *
     * Support both:
     *
     * { "message": "Hello" }
     *
     * and:
     *
     * { "body": "Hello" }
     */

    const rawMessage = body.message ?? body.body;

    if (typeof rawMessage !== "string") {
      return jsonError(
        "Message text is required.",
        400,
        limit.headers,
      );
    }

    const messageText = rawMessage.trim();

    if (!messageText) {
      return jsonError(
        "Message cannot be empty.",
        400,
        limit.headers,
      );
    }

    if (messageText.length > MAX_MESSAGE_LENGTH) {
      return jsonError(
        `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
        400,
        limit.headers,
      );
    }

    /*
     * SAVE MESSAGE AND RESOLVE RECIPIENT
     *
     * The booking and participant checks happen inside
     * the same transaction as message creation.
     */

    const result = await prisma.$transaction(
      async (tx) => {
        const booking =
          await tx.serviceBooking.findUnique({
            where: {
              id: bookingId,
            },

            select: conversationBookingSelect,
          });

        if (!booking) {
          return {
            outcome: "NOT_FOUND" as const,
          };
        }

        /*
         * VERIFY PARTICIPANT
         */

        if (
          !isBookingParticipant(
            booking,
            account,
          )
        ) {
          return {
            outcome: "NOT_FOUND" as const,
          };
        }

        /*
         * VERIFY BOOKING STATUS
         */

        if (!canMessage(booking.status)) {
          return {
            outcome: "CLOSED" as const,
          };
        }

        /*
         * RESOLVE SELLER
         */

        const sellerId = resolveSellerId(booking);

        if (!sellerId) {
          return {
            outcome: "SELLER_NOT_FOUND" as const,
          };
        }

        /*
         * RESOLVE RECIPIENT
         */

        const isBuyer =
          account.role === "BUYER" &&
          booking.buyerId === account.id;

        const recipientId = isBuyer
          ? sellerId
          : booking.buyerId;

        /*
         * CREATE MESSAGE
         */

        const created =
          await tx.serviceBookingMessage.create({
            data: {
              bookingId: booking.id,
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

          recipientRole: isBuyer
            ? ("SELLER" as const)
            : ("BUYER" as const),

          service: {
            id: booking.service.id,
            name: booking.service.name,
          },

          status: booking.status,
        };
      },

      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    /*
     * HANDLE TRANSACTION RESULTS
     */

    if (result.outcome === "NOT_FOUND") {
      return jsonError(
        "Booking conversation not found.",
        404,
        limit.headers,
      );
    }

    if (result.outcome === "SELLER_NOT_FOUND") {
      return jsonError(
        "The service provider could not be identified.",
        409,
        limit.headers,
      );
    }

    if (result.outcome === "CLOSED") {
      return jsonError(
        "This booking is closed. Its conversation is now read-only.",
        409,
        limit.headers,
      );
    }

    /*
     * NOTIFY THE OTHER PARTICIPANT
     *
     * Message creation has already succeeded.
     * Notification failure must not undo the message.
     */

    if (
      result.recipientId &&
      result.recipientId !== account.id
    ) {
      const notificationHref =
        result.recipientRole === "SELLER"
          ? "/seller#service-bookings"
          : "/bookings";

      try {
        await createNotification({
          userId: result.recipientId,

          type: NotificationType.SERVICE_BOOKING_MESSAGE,

          title: "New service booking message",

          message:
            `You have a new message about ${result.service.name}.`,

          priority: NotificationPriority.NORMAL,

          data: {
            bookingId,
            serviceId: result.service.id,
            serviceName: result.service.name,
            href: notificationHref,
          },

          dedupeKey:
            `service-booking:${bookingId}:` +
            `message:${result.message.id}:` +
            `user:${result.recipientId}`,
        });
      } catch (notificationError) {
        console.error(
          "Booking message notification error:",
          notificationError,
        );
      }
    }

    /*
     * SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        message: "Message sent successfully.",

        booking: {
          id: bookingId,
          service: result.service,
          status: result.status,
        },

        messageRecord: {
          id: result.message.id,
          body: result.message.body,
          senderId: result.message.senderId,

          senderName:
            account.name || "ReMarket user",

          isOwnMessage: true,

          readAt:
            result.message.readAt?.toISOString() ?? null,

          createdAt:
            result.message.createdAt.toISOString(),
        },
      },

      {
        status: 201,
        headers: responseHeaders(limit.headers),
      },
    );
  } catch (error) {
    console.error(
      "Booking conversation POST error:",
      error,
    );

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return jsonError(
        "The booking changed while you were sending this message. Refresh and try again.",
        409,
        limit.headers,
      );
    }

    return jsonError(
      "Unable to send your message. Please try again.",
      500,
      limit.headers,
    );
  }
}
