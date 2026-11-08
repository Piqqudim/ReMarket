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

/* =========================================================
   CONFIGURATION
========================================================= */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_BODY_SIZE = 12_000;
const MAX_REASON_LENGTH = 2_000;
const MAX_BOOKING_ID_LENGTH = 100;

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function responseHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );

  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return headers;
}

function jsonError(
  message: string,
  status: number,
  baseHeaders?: HeadersInit,
) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: responseHeaders(baseHeaders),
    },
  );
}

/* =========================================================
   GENERAL HELPERS
========================================================= */

function isRecord(
  value: unknown,
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
  maximumLength: number,
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

/* =========================================================
   BOOKING ID
========================================================= */

async function getBookingId(
  context: {
    params: Promise<{ id: string }>;
  },
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

/* =========================================================
   REQUEST BODY SIZE PROTECTION
========================================================= */

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

async function readLimitedRequestBody(
  request: NextRequest,
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

/* =========================================================
   AUTHENTICATION
========================================================= */

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

/* =========================================================
   BOOKING SELECT
========================================================= */

const buyerBookingSelect = {
  id: true,
  bookingCode: true,

  buyerId: true,
  sellerId: true,

  status: true,

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
    }
  | {
      success: false;
      message: string;
      status: number;
    };

/* =========================================================
   PATCH /api/service-bookings/[id]/buyer-action

   MVP BUYER ACTION:

   CANCEL_BOOKING

   Buyers can only cancel bookings belonging to their
   authenticated account.

   Allowed cancellation statuses:
   - PENDING
   - AWAITING_BUYER (legacy records)
   - ACCEPTED
========================================================= */

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  /* RATE LIMITING */

  const rateLimit = checkPublicRateLimit(
    request,
    "request-create",
  );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many booking updates. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    /* AUTHENTICATION */

    const {
      buyer,
      error,
      status,
    } = await getAuthenticatedBuyer();

    if (!buyer) {
      return jsonError(
        error ?? "Authentication required.",
        status,
        rateLimit.headers,
      );
    }

    /* BOOKING ID */

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError(
        "Invalid booking ID.",
        400,
        rateLimit.headers,
      );
    }

    /* BODY SIZE VALIDATION */

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
          rateLimit.headers,
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
          rateLimit.headers,
        );
      }

      return jsonError(
        "Unable to read the request body.",
        400,
        rateLimit.headers,
      );
    }

    /* JSON VALIDATION */

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError(
        "Invalid JSON request body.",
        400,
        rateLimit.headers,
      );
    }

    if (!isRecord(body)) {
      return jsonError(
        "Invalid request body.",
        400,
        rateLimit.headers,
      );
    }

    /* ACTION VALIDATION */

    const action = clean(body.action).toUpperCase();

    if (action !== "CANCEL_BOOKING") {
      return jsonError(
        "Only booking cancellation is available.",
        400,
        rateLimit.headers,
      );
    }

    /* OPTIONAL CANCELLATION REASON */

    const reasonResult = parseOptionalText(
      body.reason,
      MAX_REASON_LENGTH,
    );

    if (reasonResult === "INVALID") {
      return jsonError(
        "The cancellation reason is too long or invalid.",
        400,
        rateLimit.headers,
      );
    }

    const reason = reasonResult;

    /* PROCESS CANCELLATION */

    const result = await prisma.$transaction(
      async (tx): Promise<BuyerActionOutcome> => {
        /*
         * Load only the booking belonging to this buyer.
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

        /*
         * The buyer can cancel:
         *
         * - PENDING
         * - ACCEPTED
         *
         * AWAITING_BUYER is retained for older records
         * created before quotation negotiation is removed.
         */

        const cancellableStatuses: ServiceBookingStatus[] = [
          ServiceBookingStatus.PENDING,
          ServiceBookingStatus.AWAITING_BUYER,
          ServiceBookingStatus.ACCEPTED,
        ];

        if (!cancellableStatuses.includes(booking.status)) {
          return {
            success: false,
            message: "This booking can no longer be cancelled.",
            status: 409,
          };
        }

        const now = new Date();

        /*
         * UncheckedUpdateManyInput is required because
         * cancelledById is a scalar foreign-key field.
         *
         * Buyer ownership is independently enforced in
         * the conditional update below.
         */

        const updateData: Prisma.ServiceBookingUncheckedUpdateManyInput =
          {
            status: ServiceBookingStatus.CANCELLED,
            cancelledAt: now,
            cancelledById: buyer.id,
            cancellationReason:
              reason ?? "Cancelled by buyer.",
          };

        /*
         * CONDITIONAL DATABASE UPDATE
         *
         * Recheck:
         * - Booking ID.
         * - Buyer ownership.
         * - Original status.
         * - Original updatedAt.
         *
         * This prevents stale requests from overwriting
         * a newer booking update.
         */

        const updatedCount =
          await tx.serviceBooking.updateMany({
            where: {
              id: booking.id,
              buyerId: buyer.id,
              status: booking.status,
              updatedAt: booking.updatedAt,
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

        /* LOAD UPDATED BOOKING */

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
            message: "Unable to retrieve the updated booking.",
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
      },
    );

    /* HANDLE UPDATE FAILURE */

    if (!result.success) {
      return jsonError(
        result.message,
        result.status,
        rateLimit.headers,
      );
    }

    /* RESOLVE SELLER */

    const booking = result.booking;

    /*
     * New bookings use their saved sellerId.
     *
     * Legacy bookings without sellerId use the
     * owning business account as a fallback.
     */

    const sellerUserId =
      booking.sellerId ??
      booking.service.business.ownerId;

    /* NOTIFY SELLER */

    if (sellerUserId) {
      try {
        await createNotification({
          userId: sellerUserId,

          type: NotificationType.SERVICE_BOOKING_UPDATED,

          title: "Buyer cancelled a service booking",

          message:
            `The buyer cancelled their booking for ${booking.service.name}.`,

          priority: NotificationPriority.HIGH,

          data: {
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            serviceId: booking.service.id,
            serviceName: booking.service.name,
            status: booking.status,
            action: "CANCEL_BOOKING",
            href: "/seller#service-bookings",
          },

          dedupeKey:
            `service-booking:${booking.id}:` +
            `CANCEL_BOOKING:` +
            `${booking.updatedAt.getTime()}:` +
            `seller:${sellerUserId}`,
        });
      } catch (notificationError) {
        console.error(
          "Buyer booking cancellation notification error:",
          notificationError,
        );
      }
    } else {
      console.warn(
        "Buyer booking notification skipped: no seller ID.",
        {
          bookingId: booking.id,
        },
      );
    }

    /* SUCCESS RESPONSE */

    return NextResponse.json(
      {
        message: "Your booking has been cancelled.",

        booking: {
          id: booking.id,
          bookingCode: booking.bookingCode,

          status: booking.status,

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
      },
    );
  } catch (error) {
    console.error(
      "Buyer service booking cancellation error:",
      error,
    );

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return jsonError(
        "This booking was updated by another request. Refresh and try again.",
        409,
        rateLimit.headers,
      );
    }

    return jsonError(
      "Unable to cancel this booking. Please try again.",
      500,
      rateLimit.headers,
    );
  }
}