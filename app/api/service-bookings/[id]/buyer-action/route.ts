
import {
  NotificationPriority,
  NotificationType,
  Prisma,
  ServiceBookingStatus,
} from "@prisma/client";

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

/*
 * ---------------------------------------------------------
 * CONFIGURATION
 * ---------------------------------------------------------
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BODY_SIZE = 12_000;
const MAX_REASON_LENGTH = 2_000;
const MAX_BOOKING_ID_LENGTH = 100;

type BuyerBookingAction =
  | "ACCEPT_QUOTE"
  | "REJECT_QUOTE"
  | "CANCEL_BOOKING";

const BUYER_BOOKING_ACTIONS: readonly BuyerBookingAction[] = [
  "ACCEPT_QUOTE",
  "REJECT_QUOTE",
  "CANCEL_BOOKING",
];

/*
 * ---------------------------------------------------------
 * RESPONSE HELPERS
 * ---------------------------------------------------------
 */

function responseHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate"
  );

  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

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

/*
 * ---------------------------------------------------------
 * GENERAL HELPERS
 * ---------------------------------------------------------
 */

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

function parseOptionalText(
  value: unknown,
  maximumLength: number
): string | null | "INVALID" {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return "INVALID";
  }

  const result = value.trim();

  if (!result) {
    return null;
  }

  if (result.length > maximumLength) {
    return "INVALID";
  }

  return result;
}

/*
 * ---------------------------------------------------------
 * BOOKING ID
 * ---------------------------------------------------------
 */

async function getBookingId(
  context: {
    params: Promise<{ id: string }>;
  }
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
  request: NextRequest
): Promise<string> {
  const stream = request.body;

  if (!stream) {
    return "";
  }

  const reader = stream.getReader();

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
 * ACTION VALIDATION
 * ---------------------------------------------------------
 */

function isBuyerBookingAction(
  value: string
): value is BuyerBookingAction {
  const actions: readonly string[] = BUYER_BOOKING_ACTIONS;

  return actions.includes(value);
}

/*
 * ---------------------------------------------------------
 * AUTHENTICATION
 * ---------------------------------------------------------
 */

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
      error: "Only buyer accounts can manage these bookings.",
      status: 403,
    } as const;
  }

  return {
    buyer,
    error: null,
    status: 200,
  } as const;
}

/*
 * ---------------------------------------------------------
 * BOOKING SELECT
 * ---------------------------------------------------------
 *
 * Includes:
 * - Buyer and seller snapshots.
 * - Quotation information.
 * - Cancellation information.
 * - Service information.
 * - Legacy business owner fallback.
 *
 * business.ownerId is nullable in the Prisma schema.
 * ---------------------------------------------------------
 */

const buyerBookingSelect = {
  id: true,
  bookingCode: true,

  buyerId: true,
  sellerId: true,

  status: true,

  quotedPrice: true,
  quoteMessage: true,
  quoteSentAt: true,

  agreedPrice: true,
  quoteAcceptedAt: true,

  cancelledAt: true,
  cancellationReason: true,

  updatedAt: true,

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

type BuyerBookingRecord =
  Prisma.ServiceBookingGetPayload<{
    select: typeof buyerBookingSelect;
  }>;

type BuyerActionOutcome =
  | {
      success: true;
      booking: BuyerBookingRecord;
      action: BuyerBookingAction;
    }
  | {
      success: false;
      message: string;
      status: number;
    };

/*
 * ---------------------------------------------------------
 * QUOTATION VALIDATION
 * ---------------------------------------------------------
 *
 * A buyer can only respond when:
 *
 * 1. The booking is awaiting a buyer response.
 * 2. A quotation was actually sent.
 * 3. A quoted amount exists.
 * 4. The quotation has not already been accepted.
 * ---------------------------------------------------------
 */

function hasPendingQuotation(
  booking: BuyerBookingRecord
): boolean {
  return (
    booking.status === "AWAITING_BUYER" &&
    booking.quoteSentAt !== null &&
    booking.quotedPrice !== null &&
    booking.quoteAcceptedAt === null
  );
}

/*
 * =========================================================
 * PATCH /api/service-bookings/[id]/buyer-action
 * =========================================================
 *
 * BUYER ACTIONS
 *
 * ACCEPT_QUOTE
 * REJECT_QUOTE
 * CANCEL_BOOKING
 *
 * Buyers can only manage bookings belonging to their
 * authenticated account.
 * =========================================================
 */

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  /*
   * RATE LIMITING
   */

  const rateLimit = checkPublicRateLimit(
    request,
    "request-create"
  );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many booking updates. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  try {
    /*
     * AUTHENTICATION
     */

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

    /*
     * BOOKING ID
     */

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError(
        "Invalid booking ID.",
        400,
        rateLimit.headers
      );
    }

    /*
     * BODY SIZE VALIDATION
     */

    const contentLengthHeader =
      request.headers.get("content-length");

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

    /*
     * JSON VALIDATION
     */

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

    /*
     * ACTION
     */

    const actionValue = clean(body.action).toUpperCase();

    if (!isBuyerBookingAction(actionValue)) {
      return jsonError(
        "Invalid buyer booking action.",
        400,
        rateLimit.headers
      );
    }

    const action: BuyerBookingAction = actionValue;

    /*
     * OPTIONAL REASON
     */

    const reasonResult = parseOptionalText(
      body.reason,
      MAX_REASON_LENGTH
    );

    if (reasonResult === "INVALID") {
      return jsonError(
        "The reason is too long or invalid.",
        400,
        rateLimit.headers
      );
    }

    const reason = reasonResult;

    /*
     * PROCESS BUYER ACTION
     */

    const result = await prisma.$transaction(
      async (tx): Promise<BuyerActionOutcome> => {
        /*
         * LOAD ONLY THE BUYER'S OWN BOOKING
         */

        const booking = await tx.serviceBooking.findFirst({
          where: {
            id: bookingId,
            buyerId: buyer.id,
          },

          select: buyerBookingSelect,
        });

        if (!booking) {
          return {
            success: false,
            message: "Booking not found.",
            status: 404,
          };
        }

        const now = new Date();

        /*
         * UNCHECKED UPDATE INPUT
         *
         * This allows direct updates to scalar foreign-key
         * fields such as cancelledById.
         *
         * Buyer ownership is still enforced by the
         * conditional database update.
         */

        const updateData: Prisma.ServiceBookingUncheckedUpdateManyInput =
          {};

        /*
         * ACCEPT QUOTATION
         *
         * The agreed amount is copied directly from the
         * stored seller quotation.
         *
         * The browser cannot supply or alter the amount.
         */

        if (action === "ACCEPT_QUOTE") {
          if (booking.status !== "AWAITING_BUYER") {
            return {
              success: false,
              message:
                "There is no quotation awaiting your response.",
              status: 409,
            };
          }

          if (
            !booking.quoteSentAt ||
            booking.quotedPrice === null
          ) {
            return {
              success: false,
              message:
                "A valid seller quotation could not be found.",
              status: 409,
            };
          }

          if (booking.quoteAcceptedAt) {
            return {
              success: false,
              message:
                "This quotation has already been accepted.",
              status: 409,
            };
          }

          updateData.status = "ACCEPTED";

          updateData.agreedPrice = booking.quotedPrice;

          updateData.quoteAcceptedAt = now;
          updateData.acceptedAt = now;
        }

        /*
         * REJECT QUOTATION
         *
         * Rejection cancels the booking and records
         * the buyer as the person who cancelled it.
         */

        else if (action === "REJECT_QUOTE") {
          if (booking.status !== "AWAITING_BUYER") {
            return {
              success: false,
              message:
                "There is no quotation awaiting your response.",
              status: 409,
            };
          }

          if (
            !booking.quoteSentAt ||
            booking.quotedPrice === null
          ) {
            return {
              success: false,
              message:
                "A valid seller quotation could not be found.",
              status: 409,
            };
          }

          if (booking.quoteAcceptedAt) {
            return {
              success: false,
              message:
                "This quotation has already been accepted.",
              status: 409,
            };
          }

          updateData.status = "CANCELLED";

          updateData.cancelledAt = now;
          updateData.cancelledById = buyer.id;

          updateData.cancellationReason =
            reason ?? "Buyer declined the quotation.";
        }

        /*
         * CANCEL BOOKING
         *
         * Buyers may cancel:
         * - PENDING
         * - AWAITING_BUYER
         * - ACCEPTED
         *
         * Once a service is IN_PROGRESS, cancellation
         * must be handled through an appropriate
         * cancellation/dispute process.
         */

        else if (action === "CANCEL_BOOKING") {
          const cancellableStatuses: ServiceBookingStatus[] = [
            "PENDING",
            "AWAITING_BUYER",
            "ACCEPTED",
          ];

          if (
            !cancellableStatuses.includes(booking.status)
          ) {
            return {
              success: false,
              message:
                "This booking can no longer be cancelled.",
              status: 409,
            };
          }

          updateData.status = "CANCELLED";

          updateData.cancelledAt = now;
          updateData.cancelledById = buyer.id;

          updateData.cancellationReason =
            reason ?? "Cancelled by buyer.";
        }

        /*
         * CONDITIONAL DATABASE UPDATE
         *
         * Recheck:
         * - Booking ID.
         * - Buyer ownership.
         * - Original status.
         * - Original updatedAt value.
         * - Original quotation values when responding
         *   to a quotation.
         *
         * This prevents stale requests from overwriting
         * a newer booking or quotation update.
         */

        const updatedCount =
          await tx.serviceBooking.updateMany({
            where: {
              id: booking.id,
              buyerId: buyer.id,

              status: booking.status,
              updatedAt: booking.updatedAt,

              ...(action === "ACCEPT_QUOTE" ||
              action === "REJECT_QUOTE"
                ? {
                    quoteSentAt: booking.quoteSentAt,
                    quotedPrice: booking.quotedPrice,
                    quoteAcceptedAt: null,
                  }
                : {}),
            },

            data: updateData,
          });

        if (updatedCount.count !== 1) {
          return {
            success: false,
            message:
              "This booking has changed. Refresh and try again.",
            status: 409,
          };
        }

        /*
         * LOAD UPDATED BOOKING
         */

        const updatedBooking =
          await tx.serviceBooking.findUnique({
            where: {
              id: booking.id,
            },

            select: buyerBookingSelect,
          });

        if (!updatedBooking) {
          return {
            success: false,
            message:
              "Unable to retrieve the updated booking.",
            status: 500,
          };
        }

        return {
          success: true,
          booking: updatedBooking,
          action,
        };
      },

      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    /*
     * HANDLE UPDATE FAILURE
     */

    if (!result.success) {
      return jsonError(
        result.message,
        result.status,
        rateLimit.headers
      );
    }

    /*
     * FIND SELLER
     *
     * New bookings use their saved sellerId.
     *
     * Older bookings without sellerId use the
     * owning business account as a fallback.
     */

    const booking = result.booking;

    const sellerUserId =
      booking.sellerId ??
      booking.service.business.ownerId;

    /*
     * SELLER NOTIFICATION DETAILS
     */

    const notificationDetails: Record<
      BuyerBookingAction,
      {
        title: string;
        message: string;
        priority: NotificationPriority;
      }
    > = {
      ACCEPT_QUOTE: {
        title: "Buyer accepted your quotation",
        message:
          `The buyer accepted your quotation for ${booking.service.name}.`,
        priority: NotificationPriority.NORMAL,
      },

      REJECT_QUOTE: {
        title: "Buyer declined your quotation",
        message:
          `The buyer declined your quotation for ${booking.service.name}.`,
        priority: NotificationPriority.HIGH,
      },

      CANCEL_BOOKING: {
        title: "Buyer cancelled a service booking",
        message:
          `The buyer cancelled their booking for ${booking.service.name}.`,
        priority: NotificationPriority.HIGH,
      },
    };

    const notification =
      notificationDetails[result.action];

    /*
     * NOTIFY SELLER
     *
     * Notification creation happens after the booking
     * transaction has successfully committed.
     *
     * A notification failure does not undo the buyer's
     * successful booking action.
     */

    if (sellerUserId) {
      try {
        await createNotification({
          userId: sellerUserId,

          type: NotificationType.SERVICE_BOOKING_UPDATED,

          title: notification.title,
          message: notification.message,

          priority: notification.priority,

          data: {
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            serviceId: booking.service.id,
            serviceName: booking.service.name,
            status: booking.status,
            action: result.action,
            href: "/seller#service-bookings",
          },

          /*
           * The notification helper also applies
           * recipient-specific deduplication.
           *
           * The seller suffix is retained to remain
           * compatible with previous notification keys.
           */

          dedupeKey:
            `service-booking:${booking.id}:` +
            `${result.action}:` +
            `${booking.updatedAt.getTime()}:` +
            `seller:${sellerUserId}`,
        });
      } catch (notificationError) {
        console.error(
          "Buyer service booking notification error:",
          notificationError
        );
      }
    } else {
      console.warn(
        "Buyer booking notification skipped: no seller ID.",
        {
          bookingId: booking.id,
        }
      );
    }

    /*
     * SUCCESS RESPONSE
     */

    const successMessage =
      result.action === "ACCEPT_QUOTE"
        ? "You have accepted the seller's quotation."
        : result.action === "REJECT_QUOTE"
          ? "You have declined the seller's quotation."
          : "Your booking has been cancelled.";

    return NextResponse.json(
      {
        message: successMessage,

        booking: {
          id: booking.id,
          bookingCode: booking.bookingCode,

          status: booking.status,

          quotedPrice: booking.quotedPrice,
          quoteMessage: booking.quoteMessage,

          quoteSentAt:
            booking.quoteSentAt?.toISOString() ?? null,

          agreedPrice: booking.agreedPrice,

          quoteAcceptedAt:
            booking.quoteAcceptedAt?.toISOString() ?? null,

          cancelledAt:
            booking.cancelledAt?.toISOString() ?? null,

          cancellationReason:
            booking.cancellationReason,

          updatedAt:
            booking.updatedAt.toISOString(),

          service: {
            id: booking.service.id,
            name: booking.service.name,
          },
        },
      },
      {
        status: 200,
        headers: responseHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error(
      "Buyer service booking action error:",
      error
    );

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return jsonError(
        "This booking was updated by another request. Refresh and try again.",
        409,
        rateLimit.headers
      );
    }

    return jsonError(
      "Unable to update this booking. Please try again.",
      500,
      rateLimit.headers
    );
  }
}
