
import {
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* -------------------------------------------------------------------------- */
/* CONFIGURATION                                                              */
/* -------------------------------------------------------------------------- */

const MAX_BODY_SIZE = 12_000;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_BOOKING_ID_LENGTH = 100;

const QUOTE_ACTIONS = ["ACCEPT", "REJECT"] as const;

type QuoteAction = (typeof QUOTE_ACTIONS)[number];

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/* -------------------------------------------------------------------------- */
/* RESPONSE HELPERS                                                           */
/* -------------------------------------------------------------------------- */

function responseHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate"
  );

  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");

  return headers;
}

function jsonError(
  message: string,
  status: number,
  baseHeaders?: HeadersInit
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: responseHeaders(baseHeaders),
    }
  );
}

/* -------------------------------------------------------------------------- */
/* GENERAL HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function clean(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isQuoteAction(value: string): value is QuoteAction {
  return QUOTE_ACTIONS.includes(value as QuoteAction);
}

/* -------------------------------------------------------------------------- */
/* REQUEST BODY PROTECTION                                                    */
/* -------------------------------------------------------------------------- */

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

async function readLimitedRequestBody(
  request: NextRequest
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

/* -------------------------------------------------------------------------- */
/* BOOKING ID                                                                 */
/* -------------------------------------------------------------------------- */

async function getBookingId(
  context: RouteContext
): Promise<string | null> {
  const { id } = await context.params;

  const bookingId =
    typeof id === "string"
      ? id.trim()
      : "";

  if (
    !bookingId ||
    bookingId.length > MAX_BOOKING_ID_LENGTH
  ) {
    return null;
  }

  return bookingId;
}

/* -------------------------------------------------------------------------- */
/* AUTHENTICATION                                                             */
/* -------------------------------------------------------------------------- */

async function getAuthenticatedBuyer() {
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
      buyer: null,
      error: "Please sign in to continue.",
      status: 401,
    } as const;
  }

  const buyer = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },

    select: {
      id: true,
      name: true,
      role: true,
    },
  });

  if (!buyer) {
    return {
      buyer: null,
      error: "Your account could not be found.",
      status: 401,
    } as const;
  }

  if (buyer.role !== "BUYER") {
    return {
      buyer: null,
      error: "Only buyers can respond to service quotations.",
      status: 403,
    } as const;
  }

  return {
    buyer,
    error: null,
    status: 200,
  } as const;
}

/* -------------------------------------------------------------------------- */
/* OPTIONAL RESPONSE MESSAGE                                                  */
/* -------------------------------------------------------------------------- */

function parseResponseMessage(
  value: unknown
): string | null | "INVALID" {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value !== "string") {
    return "INVALID";
  }

  const message = value.trim();

  if (!message) {
    return null;
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return "INVALID";
  }

  return message;
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/service-bookings/[id]/quote                                     */
/* -------------------------------------------------------------------------- */

/**
 * Buyer accepts or rejects a merchant quotation.
 *
 * ACCEPT:
 * - Sets agreedPrice to quotedPrice.
 * - Sets quoteAcceptedAt.
 * - Sets acceptedAt.
 * - Changes status to ACCEPTED.
 *
 * REJECT:
 * - Clears agreedPrice and quoteAcceptedAt.
 * - Returns status to PENDING.
 * - Retains the previous quotation details for reference.
 * - Allows the merchant to send a revised quotation.
 *
 * Both responses are recorded in ServiceBookingMessage.
 *
 * IMPORTANT:
 * This route does not update sellerId.
 * New bookings already have their sellerId assigned when created.
 * Legacy bookings use the Business ownerId fallback for notifications.
 */

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const rateLimit = checkPublicRateLimit(
    request,
    "request-create"
  );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many quotation responses. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  try {
    /* ---------------------------------------------------------------------- */
    /* AUTHENTICATION                                                         */
    /* ---------------------------------------------------------------------- */

    const {
      buyer,
      error,
      status,
    } = await getAuthenticatedBuyer();

    if (!buyer) {
      return jsonError(
        error ?? "Authentication required.",
        status,
        rateLimit.headers
      );
    }

    /* ---------------------------------------------------------------------- */
    /* BOOKING ID                                                             */
    /* ---------------------------------------------------------------------- */

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError(
        "Invalid booking ID.",
        400,
        rateLimit.headers
      );
    }

    /* ---------------------------------------------------------------------- */
    /* REQUEST BODY SIZE                                                      */
    /* ---------------------------------------------------------------------- */

    const contentLengthHeader = request.headers.get(
      "content-length"
    );

    if (contentLengthHeader !== null) {
      const contentLength = Number(contentLengthHeader);

      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength < 0 ||
        contentLength > MAX_BODY_SIZE
      ) {
        return jsonError(
          "Request body is too large or invalid.",
          413,
          rateLimit.headers
        );
      }
    }

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
          rateLimit.headers
        );
      }

      return jsonError(
        "Unable to read the request body.",
        400,
        rateLimit.headers
      );
    }

    /* ---------------------------------------------------------------------- */
    /* PARSE JSON                                                             */
    /* ---------------------------------------------------------------------- */

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError(
        "Invalid JSON request body.",
        400,
        rateLimit.headers
      );
    }

    if (!isRecord(body)) {
      return jsonError(
        "Invalid request body.",
        400,
        rateLimit.headers
      );
    }

    /* ---------------------------------------------------------------------- */
    /* ACTION                                                                 */
    /* ---------------------------------------------------------------------- */

    const rawAction = clean(body.action).toUpperCase();

    if (!isQuoteAction(rawAction)) {
      return jsonError(
        "Action must be ACCEPT or REJECT.",
        400,
        rateLimit.headers
      );
    }

    const action = rawAction;

    /* ---------------------------------------------------------------------- */
    /* BUYER RESPONSE MESSAGE                                                 */
    /* ---------------------------------------------------------------------- */

    const responseMessageResult = parseResponseMessage(
      body.message
    );

    if (responseMessageResult === "INVALID") {
      return jsonError(
        `Your response cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
        400,
        rateLimit.headers
      );
    }

    const responseMessage = responseMessageResult;

    /* ---------------------------------------------------------------------- */
    /* PROCESS QUOTATION RESPONSE                                              */
    /* ---------------------------------------------------------------------- */

    const result = await prisma.$transaction(
      async (tx) => {
        /*
         * Only retrieve a booking belonging to the
         * authenticated buyer.
         */

        const booking = await tx.serviceBooking.findFirst({
          where: {
            id: bookingId,
            buyerId: buyer.id,
          },

          select: {
            id: true,
            bookingCode: true,

            buyerId: true,
            sellerId: true,

            status: true,

            quotedPrice: true,
            quoteMessage: true,
            quoteSentAt: true,
            quoteAcceptedAt: true,

            agreedPrice: true,
            currency: true,

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
          },
        });

        if (!booking) {
          return {
            outcome: "NOT_FOUND" as const,
          };
        }

        /* ------------------------------------------------------------------ */
        /* VERIFY ACTIVE QUOTATION                                             */
        /* ------------------------------------------------------------------ */

        if (
          booking.status !== "AWAITING_BUYER" ||
          !booking.quoteSentAt ||
          booking.quotedPrice === null ||
          booking.quoteAcceptedAt !== null
        ) {
          return {
            outcome: "NOT_WAITING" as const,
          };
        }

        /* ------------------------------------------------------------------ */
        /* RESOLVE SELLER                                                      */
        /* ------------------------------------------------------------------ */

        /**
         * New bookings use their sellerId snapshot.
         * Legacy bookings fall back to Business.ownerId.
         */

        const sellerId =
          booking.sellerId ??
          booking.service.business.ownerId;

        if (
          !sellerId ||
          sellerId === buyer.id
        ) {
          return {
            outcome: "SELLER_NOT_FOUND" as const,
          };
        }

        const now = new Date();

        /* ------------------------------------------------------------------ */
        /* PREPARE UPDATE                                                      */
        /* ------------------------------------------------------------------ */

        /**
         * Do not include sellerId here.
         *
         * The booking's seller assignment is already established
         * when the booking is created. Updating it during a buyer
         * quotation response is unnecessary.
         *
         * This keeps the update compatible with the checked
         * Prisma ServiceBookingUpdateManyMutationInput type.
         */

        const updateData: Prisma.ServiceBookingUpdateManyMutationInput =
          action === "ACCEPT"
            ? {
                status: "ACCEPTED",
                agreedPrice: booking.quotedPrice,
                quoteAcceptedAt: now,
                acceptedAt: now,
              }
            : {
                status: "PENDING",
                agreedPrice: null,
                quoteAcceptedAt: null,
              };

        /* ------------------------------------------------------------------ */
        /* CONDITIONAL UPDATE                                                  */
        /* ------------------------------------------------------------------ */

        /**
         * Prevents duplicate responses or competing updates
         * from overwriting one another.
         */

        const update = await tx.serviceBooking.updateMany({
          where: {
            id: booking.id,
            buyerId: buyer.id,

            status: "AWAITING_BUYER",

            quotedPrice: booking.quotedPrice,

            quoteSentAt: booking.quoteSentAt,

            quoteAcceptedAt: null,
          },

          data: updateData,
        });

        if (update.count !== 1) {
          return {
            outcome: "UPDATE_CONFLICT" as const,
          };
        }

        /* ------------------------------------------------------------------ */
        /* CREATE CONVERSATION MESSAGE                                         */
        /* ------------------------------------------------------------------ */

        const formattedAmount =
          `${booking.currency} ${booking.quotedPrice.toLocaleString("en-NG")}`;

        const messageText =
          action === "ACCEPT"
            ? [
                `I accept the quotation of ${formattedAmount}.`,
                responseMessage,
              ]
                .filter(Boolean)
                .join("\n\n")
            : [
                `I do not accept the quotation of ${formattedAmount}.`,
                responseMessage,
              ]
                .filter(Boolean)
                .join("\n\n");

        await tx.serviceBookingMessage.create({
          data: {
            bookingId: booking.id,
            senderId: buyer.id,
            body: messageText,
          },
        });

        /* ------------------------------------------------------------------ */
        /* RETRIEVE UPDATED BOOKING                                            */
        /* ------------------------------------------------------------------ */

        const updatedBooking =
          await tx.serviceBooking.findUnique({
            where: {
              id: booking.id,
            },

            select: {
              id: true,
              bookingCode: true,

              status: true,
              bookingType: true,

              requestedFor: true,
              scheduledFor: true,

              quotedPrice: true,
              quoteMessage: true,
              quoteSentAt: true,

              agreedPrice: true,
              quoteAcceptedAt: true,

              acceptedAt: true,

              currency: true,

              updatedAt: true,

              service: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

        if (!updatedBooking) {
          throw new Error(
            "UPDATED_BOOKING_NOT_FOUND"
          );
        }

        return {
          outcome: "SUCCESS" as const,

          action,

          sellerId,

          booking: updatedBooking,
        };
      },

      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    /* ---------------------------------------------------------------------- */
    /* HANDLE ERRORS                                                          */
    /* ---------------------------------------------------------------------- */

    if (result.outcome === "NOT_FOUND") {
      return jsonError(
        "Booking not found.",
        404,
        rateLimit.headers
      );
    }

    if (result.outcome === "NOT_WAITING") {
      return jsonError(
        "This booking does not have a quotation awaiting your response.",
        409,
        rateLimit.headers
      );
    }

    if (result.outcome === "SELLER_NOT_FOUND") {
      return jsonError(
        "The service provider could not be identified.",
        409,
        rateLimit.headers
      );
    }

    if (result.outcome === "UPDATE_CONFLICT") {
      return jsonError(
        "This quotation has already been updated. Refresh your booking and try again.",
        409,
        rateLimit.headers
      );
    }

    /* ---------------------------------------------------------------------- */
    /* NOTIFY SELLER                                                          */
    /* ---------------------------------------------------------------------- */

    const booking = result.booking;

    const notificationDetails =
      action === "ACCEPT"
        ? {
            title: "Quotation accepted",
            message:
              `The buyer has accepted your quotation for ${booking.service.name}.`,
          }
        : {
            title: "Quotation declined",
            message:
              `The buyer has declined your quotation for ${booking.service.name}. You can review the booking and send a revised quotation.`,
          };

    try {
      await createNotification({
        userId: result.sellerId,

        type: NotificationType.SERVICE_BOOKING_UPDATED,

        title: notificationDetails.title,

        message: notificationDetails.message,

        priority: NotificationPriority.NORMAL,

        data: {
          bookingId: booking.id,
          bookingCode: booking.bookingCode,

          serviceId: booking.service.id,
          serviceName: booking.service.name,

          action,

          status: booking.status,

          href: "/seller#service-bookings",
        },

        dedupeKey:
          `service-booking:${booking.id}:` +
          `quote-response:${action}:` +
          `${booking.updatedAt.getTime()}:` +
          `seller:${result.sellerId}`,
      });
    } catch (notificationError) {
      /*
       * The quotation response has already been saved.
       * A notification failure must not undo that response.
       */

      console.error(
        "Buyer quotation response notification error:",
        notificationError
      );
    }

    /* ---------------------------------------------------------------------- */
    /* SUCCESS RESPONSE                                                       */
    /* ---------------------------------------------------------------------- */

    return NextResponse.json(
      {
        message:
          action === "ACCEPT"
            ? "You have accepted the service quotation."
            : "You have declined the service quotation.",

        booking: {
          id: booking.id,
          bookingCode: booking.bookingCode,

          status: booking.status,
          bookingType: booking.bookingType,

          requestedFor:
            booking.requestedFor?.toISOString() ?? null,

          scheduledFor:
            booking.scheduledFor?.toISOString() ?? null,

          quotedPrice: booking.quotedPrice,
          quoteMessage: booking.quoteMessage,

          quoteSentAt:
            booking.quoteSentAt?.toISOString() ?? null,

          agreedPrice: booking.agreedPrice,

          quoteAcceptedAt:
            booking.quoteAcceptedAt?.toISOString() ?? null,

          acceptedAt:
            booking.acceptedAt?.toISOString() ?? null,

          currency: booking.currency,

          updatedAt: booking.updatedAt.toISOString(),

          service: booking.service,
        },
      },
      {
        status: 200,
        headers: responseHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error(
      "Buyer quotation response API error:",
      error
    );

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return jsonError(
        "Another booking update occurred. Refresh and try again.",
        409,
        rateLimit.headers
      );
    }

    return jsonError(
      "Unable to process your quotation response. Please try again.",
      500,
      rateLimit.headers
    );
  }
}
