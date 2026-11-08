
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
const MAX_QUOTE_MESSAGE_LENGTH = 2_000;
const MAX_BOOKING_ID_LENGTH = 100;
const MAX_QUOTED_PRICE = 2_147_483_647;

const BOOKING_ACTIONS = [
  "ACCEPT",
  "DECLINE",
  "SEND_QUOTE",
  "CONFIRM_APPOINTMENT",
  "START",
  "COMPLETE",
  "CANCEL",
] as const;

type BookingAction = (typeof BOOKING_ACTIONS)[number];

/*
 * ---------------------------------------------------------
 * PRISMA BOOKING SELECT
 * ---------------------------------------------------------
 */

const managedBookingSelect = {
  id: true,
  bookingCode: true,

  buyerId: true,
  sellerId: true,

  status: true,
  bookingType: true,

  requestedFor: true,
  scheduledFor: true,

  quotedPrice: true,
  quoteMessage: true,
  quoteSentAt: true,
  quoteAcceptedAt: true,

  agreedPrice: true,

  acceptedAt: true,
  declinedAt: true,
  cancelledAt: true,
  startedAt: true,
  completedAt: true,

  updatedAt: true,

  service: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.ServiceBookingSelect;

type ManagedBooking = Prisma.ServiceBookingGetPayload<{
  select: typeof managedBookingSelect;
}>;

type BookingOutcome =
  | {
      success: true;
      booking: ManagedBooking;
    }
  | {
      success: false;
      message: string;
      status: number;
    };

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
 * REQUEST BODY SIZE PROTECTION
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

function isBookingAction(
  value: string
): value is BookingAction {
  const actions: readonly string[] = BOOKING_ACTIONS;

  return actions.includes(value);
}

/*
 * ---------------------------------------------------------
 * QUOTATION VALIDATION
 * ---------------------------------------------------------
 */

function parseQuotedPrice(
  value: unknown
): number | null {
  let amount: number;

  if (typeof value === "number") {
    amount = value;
  } else if (
    typeof value === "string" &&
    value.trim()
  ) {
    amount = Number(value.trim());
  } else {
    return null;
  }

  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount > MAX_QUOTED_PRICE
  ) {
    return null;
  }

  return amount;
}

/*
 * ---------------------------------------------------------
 * APPOINTMENT DATE VALIDATION
 * ---------------------------------------------------------
 */

function parseScheduledDate(
  value: unknown
): Date | null {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 50
  ) {
    return null;
  }

  const scheduledFor = new Date(value);

  if (
    Number.isNaN(scheduledFor.getTime()) ||
    scheduledFor.getTime() <= Date.now()
  ) {
    return null;
  }

  return scheduledFor;
}

/*
 * ---------------------------------------------------------
 * AUTHENTICATION
 * ---------------------------------------------------------
 */

async function getAuthenticatedSeller() {
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
      seller: null,
      error: "Please sign in to continue.",
      status: 401,
    } as const;
  }

  const seller = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },

    select: {
      id: true,
      name: true,
      role: true,
    },
  });

  if (!seller) {
    return {
      seller: null,
      error: "Your account could not be found.",
      status: 401,
    } as const;
  }

  if (seller.role !== "SELLER") {
    return {
      seller: null,
      error: "Only sellers can manage service bookings.",
      status: 403,
    } as const;
  }

  return {
    seller,
    error: null,
    status: 200,
  } as const;
}

/*
 * ---------------------------------------------------------
 * BOOKING OWNERSHIP
 * ---------------------------------------------------------
 *
 * New bookings:
 * ServiceBooking.sellerId = authenticated seller ID.
 *
 * Older bookings:
 * sellerId may be null, so ownership is checked through:
 *
 * ServiceBooking -> Service -> Business -> ownerId.
 *
 * An assigned booking belonging to another seller cannot
 * be accessed through the legacy ownership fallback.
 * ---------------------------------------------------------
 */

function sellerBookingWhere(
  bookingId: string,
  sellerId: string
): Prisma.ServiceBookingWhereInput {
  return {
    id: bookingId,

    OR: [
      {
        sellerId,
      },

      {
        sellerId: null,

        service: {
          is: {
            business: {
              is: {
                ownerId: sellerId,
              },
            },
          },
        },
      },
    ],
  };
}

/*
 * ---------------------------------------------------------
 * NOTIFICATION CONTENT
 * ---------------------------------------------------------
 */

function getBuyerNotification(
  action: BookingAction,
  booking: ManagedBooking
): {
  title: string;
  message: string;
  priority: NotificationPriority;
} {
  const serviceName = booking.service.name;

  const details: Record<
    BookingAction,
    {
      title: string;
      message: string;
      priority: NotificationPriority;
    }
  > = {
    ACCEPT: {
      title: "Your service booking was accepted",
      message:
        `The provider has accepted your booking for ${serviceName}.`,
      priority: NotificationPriority.NORMAL,
    },

    DECLINE: {
      title: "Service booking declined",
      message:
        `Your booking for ${serviceName} was declined.`,
      priority: NotificationPriority.HIGH,
    },

    SEND_QUOTE: {
      title: "New service quotation",
      message:
        `The provider has sent you a quotation for ${serviceName}.`,
      priority: NotificationPriority.NORMAL,
    },

    CONFIRM_APPOINTMENT: {
      title: "Appointment confirmed",
      message:
        `Your appointment for ${serviceName} has been confirmed.`,
      priority: NotificationPriority.NORMAL,
    },

    START: {
      title: "Service in progress",
      message:
        `The provider has started working on ${serviceName}.`,
      priority: NotificationPriority.NORMAL,
    },

    COMPLETE: {
      title: "Service completed",
      message:
        `${serviceName} has been marked as completed.`,
      priority: NotificationPriority.NORMAL,
    },

    CANCEL: {
      title: "Service booking cancelled",
      message:
        `Your booking for ${serviceName} has been cancelled.`,
      priority: NotificationPriority.HIGH,
    },
  };

  return details[action];
}

/*
 * =========================================================
 * PATCH /api/service-bookings/[id]
 * =========================================================
 *
 * SELLER ACTIONS
 *
 * ACCEPT
 * DECLINE
 * SEND_QUOTE
 * CONFIRM_APPOINTMENT
 * START
 * COMPLETE
 * CANCEL
 *
 * All updates verify:
 * - Seller authentication.
 * - Booking ownership.
 * - Valid booking state.
 * - Current booking version.
 *
 * Buyer notifications are created after the database
 * transaction succeeds.
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
      seller,
      error,
      status,
    } = await getAuthenticatedSeller();

    if (!seller) {
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

    if (!isBookingAction(actionValue)) {
      return jsonError(
        "Invalid booking action.",
        400,
        rateLimit.headers
      );
    }

    const action: BookingAction = actionValue;

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
     * QUOTATION INPUT
     */

    let quotedPrice: number | null = null;
    let quoteMessage: string | null = null;

    if (action === "SEND_QUOTE") {
      quotedPrice = parseQuotedPrice(body.quotedPrice);

      if (quotedPrice === null) {
        return jsonError(
          "Enter a valid quotation amount.",
          400,
          rateLimit.headers
        );
      }

      const quoteMessageResult = parseOptionalText(
        body.quoteMessage,
        MAX_QUOTE_MESSAGE_LENGTH
      );

      if (quoteMessageResult === "INVALID") {
        return jsonError(
          "The quotation message is too long or invalid.",
          400,
          rateLimit.headers
        );
      }

      quoteMessage = quoteMessageResult;
    }

    /*
     * APPOINTMENT INPUT
     */

    let scheduledFor: Date | null = null;

    if (action === "CONFIRM_APPOINTMENT") {
      scheduledFor = parseScheduledDate(
        body.scheduledFor
      );

      if (!scheduledFor) {
        return jsonError(
          "Enter a valid future appointment date and time.",
          400,
          rateLimit.headers
        );
      }
    }

    /*
     * PROCESS BOOKING UPDATE
     */

    const result = await prisma.$transaction(
      async (tx): Promise<BookingOutcome> => {
        /*
         * LOAD BOOKING ONLY IF THIS SELLER OWNS IT
         */

        const booking = await tx.serviceBooking.findFirst({
          where: sellerBookingWhere(
            bookingId,
            seller.id
          ),

          select: managedBookingSelect,
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
         * RECHECK APPOINTMENT DATE
         */

        if (
          action === "CONFIRM_APPOINTMENT" &&
          scheduledFor &&
          scheduledFor.getTime() <= now.getTime()
        ) {
          return {
            success: false,
            message:
              "The appointment time must be in the future.",
            status: 400,
          };
        }

        /*
         * UPDATE DATA
         *
         * UncheckedUpdateManyInput permits direct updates
         * to scalar foreign-key fields.
         *
         * Setting sellerId also assigns older bookings
         * to the seller who is legitimately managing them.
         */

        const updateData: Prisma.ServiceBookingUncheckedUpdateManyInput =
          {
            sellerId: seller.id,
          };

        /*
         * ACCEPT REQUEST
         */

        if (action === "ACCEPT") {
          if (booking.status !== "PENDING") {
            return {
              success: false,
              message:
                "Only pending bookings can be accepted.",
              status: 409,
            };
          }

          if (booking.bookingType === "APPOINTMENT") {
            return {
              success: false,
              message:
                "Appointment bookings must use the confirm appointment action.",
              status: 409,
            };
          }

          if (
            booking.quoteSentAt &&
            !booking.quoteAcceptedAt
          ) {
            return {
              success: false,
              message:
                "The buyer must respond to the outstanding quotation first.",
              status: 409,
            };
          }

          updateData.status = "ACCEPTED";
          updateData.acceptedAt = now;
        }

        /*
         * DECLINE BOOKING
         */

        else if (action === "DECLINE") {
          if (
            booking.status !== "PENDING" &&
            booking.status !== "AWAITING_BUYER"
          ) {
            return {
              success: false,
              message:
                "This booking can no longer be declined.",
              status: 409,
            };
          }

          updateData.status = "DECLINED";
          updateData.declinedAt = now;

          updateData.declineReason =
            reason ?? "Declined by seller.";
        }

        /*
         * SEND OR UPDATE QUOTATION
         */

        else if (action === "SEND_QUOTE") {
          if (
            booking.status !== "PENDING" &&
            booking.status !== "AWAITING_BUYER"
          ) {
            return {
              success: false,
              message:
                "A quotation can only be sent for a pending booking.",
              status: 409,
            };
          }

          updateData.status = "AWAITING_BUYER";

          updateData.quotedPrice = quotedPrice;
          updateData.quoteMessage = quoteMessage;
          updateData.quoteSentAt = now;

          // A new quotation requires a fresh buyer response.
          updateData.quoteAcceptedAt = null;
          updateData.agreedPrice = null;
        }

        /*
         * CONFIRM APPOINTMENT
         */

        else if (action === "CONFIRM_APPOINTMENT") {
          if (booking.bookingType !== "APPOINTMENT") {
            return {
              success: false,
              message:
                "This booking is not an appointment-based service.",
              status: 409,
            };
          }

          if (
            booking.status !== "PENDING" &&
            booking.status !== "AWAITING_BUYER" &&
            booking.status !== "ACCEPTED"
          ) {
            return {
              success: false,
              message:
                "This appointment can no longer be confirmed.",
              status: 409,
            };
          }

          if (
            booking.status === "ACCEPTED" &&
            booking.scheduledFor
          ) {
            return {
              success: false,
              message:
                "This appointment has already been confirmed.",
              status: 409,
            };
          }

          if (
            booking.quoteSentAt &&
            !booking.quoteAcceptedAt
          ) {
            return {
              success: false,
              message:
                "The buyer must accept the quotation before the appointment can be confirmed.",
              status: 409,
            };
          }

          updateData.status = "ACCEPTED";
          updateData.scheduledFor = scheduledFor;
          updateData.acceptedAt = now;
        }

        /*
         * START SERVICE
         */

        else if (action === "START") {
          if (booking.status !== "ACCEPTED") {
            return {
              success: false,
              message:
                "Only accepted bookings can be started.",
              status: 409,
            };
          }

          updateData.status = "IN_PROGRESS";
          updateData.startedAt = now;
        }

        /*
         * COMPLETE SERVICE
         */

        else if (action === "COMPLETE") {
          if (booking.status !== "IN_PROGRESS") {
            return {
              success: false,
              message:
                "Only services in progress can be completed.",
              status: 409,
            };
          }

          updateData.status = "COMPLETED";
          updateData.completedAt = now;
        }

        /*
         * CANCEL BOOKING
         */

        else if (action === "CANCEL") {
          const cancellableStatuses: ServiceBookingStatus[] = [
            "PENDING",
            "AWAITING_BUYER",
            "ACCEPTED",
            "IN_PROGRESS",
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
          updateData.cancelledById = seller.id;

          updateData.cancellationReason =
            reason ?? "Cancelled by seller.";
        }

        /*
         * CONDITIONAL DATABASE UPDATE
         *
         * Recheck:
         * - Booking ID.
         * - Seller ownership.
         * - Original sellerId.
         * - Original status.
         * - Original updatedAt value.
         *
         * This protects against stale concurrent updates.
         */

        const updatedCount =
          await tx.serviceBooking.updateMany({
            where: {
              AND: [
                sellerBookingWhere(
                  booking.id,
                  seller.id
                ),

                {
                  sellerId: booking.sellerId,
                },

                {
                  status: booking.status,
                },

                {
                  updatedAt: booking.updatedAt,
                },
              ],
            },

            data: updateData,
          });

        if (updatedCount.count !== 1) {
          return {
            success: false,
            message:
              "This booking was updated by another request. Refresh and try again.",
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

            select: managedBookingSelect,
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
     * NOTIFY BUYER
     *
     * Notification creation is deliberately outside
     * the booking transaction.
     *
     * A notification failure must not undo a successful
     * booking update.
     */

    const booking = result.booking;

    const notification = getBuyerNotification(
      action,
      booking
    );

    /*
     * DEDUPLICATION KEY
     *
     * The notification helper adds recipient-specific
     * scoping to this event key.
     *
     * Keep the buyer suffix for compatibility with
     * the previous version of this endpoint.
     */

    const notificationDedupeKey =
      `service-booking:${booking.id}:` +
      `${action}:` +
      `${booking.updatedAt.getTime()}:` +
      `buyer:${booking.buyerId}`;

    try {
      await createNotification({
        userId: booking.buyerId,

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
          action,
          href: "/bookings",
        },

        dedupeKey: notificationDedupeKey,
      });
    } catch (notificationError) {
      console.error(
        "Service booking update notification error:",
        notificationError
      );
    }

    /*
     * SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        message: notification.message,

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

          quoteAcceptedAt:
            booking.quoteAcceptedAt?.toISOString() ?? null,

          agreedPrice: booking.agreedPrice,

          acceptedAt:
            booking.acceptedAt?.toISOString() ?? null,

          declinedAt:
            booking.declinedAt?.toISOString() ?? null,

          cancelledAt:
            booking.cancelledAt?.toISOString() ?? null,

          startedAt:
            booking.startedAt?.toISOString() ?? null,

          completedAt:
            booking.completedAt?.toISOString() ?? null,

          updatedAt:
            booking.updatedAt.toISOString(),

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
      "Merchant service booking update error:",
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
