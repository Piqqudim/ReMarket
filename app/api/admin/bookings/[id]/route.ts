
import {
  Prisma,
  ServiceBookingStatus,
} from "@prisma/client";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_BOOKING_ID_LENGTH = 100;

const allowedTransitions: Record<
  ServiceBookingStatus,
  readonly ServiceBookingStatus[]
> = {
  PENDING: [
    ServiceBookingStatus.ACCEPTED,
    ServiceBookingStatus.DECLINED,
    ServiceBookingStatus.CANCELLED,
  ],

  AWAITING_BUYER: [
    ServiceBookingStatus.ACCEPTED,
    ServiceBookingStatus.DECLINED,
    ServiceBookingStatus.CANCELLED,
  ],

  ACCEPTED: [
    ServiceBookingStatus.IN_PROGRESS,
    ServiceBookingStatus.COMPLETED,
    ServiceBookingStatus.CANCELLED,
  ],

  IN_PROGRESS: [
    ServiceBookingStatus.COMPLETED,
    ServiceBookingStatus.CANCELLED,
  ],

  DECLINED: [],

  CANCELLED: [],

  COMPLETED: [],
};

/*
 * ---------------------------------------------------------
 * RESPONSE HELPERS
 * ---------------------------------------------------------
 */

function responseHeaders(
  base?: HeadersInit
): Headers {
  const headers = new Headers(base);

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
  base?: HeadersInit
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: responseHeaders(base),
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

function isBookingStatus(
  value: string
): value is ServiceBookingStatus {
  return Object.values(ServiceBookingStatus).includes(
    value as ServiceBookingStatus
  );
}

/*
 * ---------------------------------------------------------
 * ADMIN BOOKING DETAILS
 * ---------------------------------------------------------
 */

/*
 * =========================================================
 * GET /api/admin/bookings/[id]
 * =========================================================
 *
 * Returns complete administrator booking details.
 *
 * Access is restricted to authenticated administrators.
 * =========================================================
 */

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    /*
     * ADMIN AUTHENTICATION
     */

    const admin = await requireAdmin();

    if (admin instanceof NextResponse) {
      return admin;
    }

    /*
     * BOOKING ID
     */

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError(
        "A valid booking ID is required.",
        400
      );
    }

    /*
     * LOAD BOOKING
     */

    const booking = await prisma.serviceBooking.findUnique({
      where: {
        id: bookingId,
      },

      select: {
        id: true,
        bookingCode: true,

        serviceId: true,

        buyerId: true,
        sellerId: true,

        bookingType: true,
        status: true,

        requestedFor: true,
        scheduledFor: true,

        quantity: true,

        contactPhone: true,
        buyerMessage: true,

        fulfillmentType: true,
        fulfillmentAddress: true,

        quotedPrice: true,
        quoteMessage: true,
        quoteSentAt: true,

        agreedPrice: true,
        quoteAcceptedAt: true,

        currency: true,

        merchantNote: true,

        acceptedAt: true,
        declinedAt: true,
        cancelledAt: true,
        startedAt: true,
        completedAt: true,

        declineReason: true,
        cancellationReason: true,
        cancelledById: true,

        createdAt: true,
        updatedAt: true,

        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },

        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },

        service: {
          select: {
            id: true,
            name: true,
            description: true,

            price: true,
            priceMin: true,
            priceMax: true,

            availability: true,
            fulfillmentType: true,
            bookingType: true,
            durationMinutes: true,

            status: true,
            deletedAt: true,

            images: {
              select: {
                id: true,
                url: true,
                sortOrder: true,
              },

              orderBy: [
                {
                  sortOrder: "asc",
                },
                {
                  createdAt: "asc",
                },
              ],
            },

            business: {
              select: {
                id: true,
                name: true,
                status: true,
                verification: true,

                location: {
                  select: {
                    area: true,
                    street: true,
                  },
                },
              },
            },
          },
        },

        messages: {
          select: {
            id: true,
            body: true,
            readAt: true,
            createdAt: true,

            sender: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },

          orderBy: [
            {
              createdAt: "desc",
            },
            {
              id: "desc",
            },
          ],

          take: 50,
        },
      },
    });

    if (!booking) {
      return jsonError(
        "Booking not found.",
        404
      );
    }

    /*
     * PRESERVE EXISTING RESPONSE SHAPE
     *
     * Existing admin UI can continue accessing:
     *
     * service.business.area
     * service.business.street
     *
     * Location remains a relation in Prisma.
     */

    const responseBooking = {
      ...booking,

      service: {
        ...booking.service,

        business: {
          ...booking.service.business,

          area:
            booking.service.business.location?.area ??
            null,

          street:
            booking.service.business.location?.street ??
            null,
        },
      },
    };

    return NextResponse.json(
      {
        success: true,
        booking: responseBooking,
      },
      {
        headers: responseHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin booking GET error:",
      error
    );

    return jsonError(
      "Failed to retrieve booking details.",
      500
    );
  }
}

/*
 * =========================================================
 * PATCH /api/admin/bookings/[id]
 * =========================================================
 *
 * Allows an administrator to update booking status.
 *
 * Only the status field is accepted.
 *
 * Lifecycle timestamps are updated automatically.
 * =========================================================
 */

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    /*
     * ADMIN AUTHENTICATION
     */

    const admin = await requireAdmin();

    if (admin instanceof NextResponse) {
      return admin;
    }

    /*
     * BOOKING ID
     */

    const bookingId = await getBookingId(context);

    if (!bookingId) {
      return jsonError(
        "A valid booking ID is required.",
        400
      );
    }

    /*
     * REQUEST BODY
     */

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError(
        "A valid JSON request body is required.",
        400
      );
    }

    if (!isRecord(body)) {
      return jsonError(
        "A valid JSON request body is required.",
        400
      );
    }

    /*
     * ONLY STATUS CAN BE UPDATED
     */

    if (
      Object.keys(body).some(
        (key) => key !== "status"
      )
    ) {
      return jsonError(
        "Only the booking status can be updated through this endpoint.",
        400
      );
    }

    /*
     * VALIDATE STATUS
     */

    const statusValue =
      typeof body.status === "string"
        ? body.status.trim().toUpperCase()
        : "";

    if (!isBookingStatus(statusValue)) {
      return NextResponse.json(
        {
          error: "Invalid booking status.",

          validStatuses: Object.values(
            ServiceBookingStatus
          ),
        },
        {
          status: 400,
          headers: responseHeaders(),
        }
      );
    }

    const nextStatus = statusValue;

    /*
     * PROCESS STATUS UPDATE
     */

    const result = await prisma.$transaction(
      async (tx) => {
        /*
         * LOAD CURRENT BOOKING
         */

        const current =
          await tx.serviceBooking.findUnique({
            where: {
              id: bookingId,
            },

            select: {
              id: true,
              status: true,
              updatedAt: true,

              quoteSentAt: true,
              quoteAcceptedAt: true,
              quotedPrice: true,

              bookingType: true,
              scheduledFor: true,
            },
          });

        if (!current) {
          return {
            type: "NOT_FOUND" as const,
          };
        }

        /*
         * NO-OP
         */

        if (current.status === nextStatus) {
          return {
            type: "UNCHANGED" as const,
          };
        }

        /*
         * CHECK ALLOWED TRANSITION
         */

        if (
          !allowedTransitions[current.status].includes(
            nextStatus
          )
        ) {
          return {
            type: "INVALID_TRANSITION" as const,
            currentStatus: current.status,
          };
        }

        const now = new Date();

        /*
         * PREVENT ADMIN FROM BYPASSING
         * AN UNANSWERED SELLER QUOTATION
         */

        if (
          current.status ===
            ServiceBookingStatus.AWAITING_BUYER &&
          nextStatus === ServiceBookingStatus.ACCEPTED &&
          current.quoteSentAt &&
          current.quotedPrice !== null &&
          !current.quoteAcceptedAt
        ) {
          return {
            type: "BUYER_RESPONSE_REQUIRED" as const,
          };
        }

        /*
         * APPOINTMENT VALIDATION
         *
         * An appointment must have a confirmed date
         * before it can be marked ACCEPTED.
         *
         * The admin endpoint does not accept a new
         * scheduled date. Appointment scheduling must
         * happen through the seller appointment action.
         */

        if (
          current.bookingType === "APPOINTMENT" &&
          current.status === ServiceBookingStatus.PENDING &&
          nextStatus === ServiceBookingStatus.ACCEPTED &&
          !current.scheduledFor
        ) {
          return {
            type: "APPOINTMENT_DATE_REQUIRED" as const,
          };
        }

        /*
         * UPDATE DATA
         *
         * Each lifecycle transition receives its
         * corresponding timestamp.
         */

        const updateData: Prisma.ServiceBookingUncheckedUpdateManyInput =
          {
            status: nextStatus,
          };

        switch (nextStatus) {
          case ServiceBookingStatus.ACCEPTED:
            updateData.acceptedAt = now;
            break;

          case ServiceBookingStatus.IN_PROGRESS:
            updateData.startedAt = now;
            break;

          case ServiceBookingStatus.COMPLETED:
            updateData.completedAt = now;
            break;

          case ServiceBookingStatus.DECLINED:
            updateData.declinedAt = now;
            break;

          case ServiceBookingStatus.CANCELLED:
            updateData.cancelledAt = now;
            break;

          case ServiceBookingStatus.PENDING:
          case ServiceBookingStatus.AWAITING_BUYER:
            break;

          default:
            return {
              type: "INVALID_TRANSITION" as const,
              currentStatus: current.status,
            };
        }

        /*
         * CONDITIONAL DATABASE UPDATE
         *
         * Check the original status and updatedAt.
         *
         * This prevents a stale administrator request
         * from overwriting another booking update.
         */

        const updateResult =
          await tx.serviceBooking.updateMany({
            where: {
              id: bookingId,
              status: current.status,
              updatedAt: current.updatedAt,
            },

            data: updateData,
          });

        if (updateResult.count !== 1) {
          return {
            type: "CONFLICT" as const,
          };
        }

        /*
         * RETRIEVE UPDATED BOOKING
         */

        const updatedBooking =
          await tx.serviceBooking.findUnique({
            where: {
              id: bookingId,
            },

            select: {
              id: true,
              bookingCode: true,

              status: true,

              acceptedAt: true,
              declinedAt: true,
              cancelledAt: true,
              startedAt: true,
              completedAt: true,

              updatedAt: true,

              buyer: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },

              service: {
                select: {
                  id: true,
                  name: true,

                  business: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          });

        if (!updatedBooking) {
          return {
            type: "NOT_FOUND" as const,
          };
        }

        return {
          type: "UPDATED" as const,
          booking: updatedBooking,
        };
      },

      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    /*
     * HANDLE TRANSACTION RESULTS
     */

    if (result.type === "NOT_FOUND") {
      return jsonError(
        "Booking not found.",
        404
      );
    }

    if (result.type === "INVALID_TRANSITION") {
      return NextResponse.json(
        {
          error:
            `A booking cannot move from ${result.currentStatus} to ${nextStatus}.`,

          currentStatus: result.currentStatus,

          requestedStatus: nextStatus,
        },
        {
          status: 409,
          headers: responseHeaders(),
        }
      );
    }

    if (result.type === "BUYER_RESPONSE_REQUIRED") {
      return jsonError(
        "The buyer must respond to the outstanding quotation before this booking can be accepted.",
        409
      );
    }

    if (
      result.type ===
      "APPOINTMENT_DATE_REQUIRED"
    ) {
      return jsonError(
        "Confirm the appointment date through the seller booking action before accepting this appointment.",
        409
      );
    }

    if (result.type === "CONFLICT") {
      return jsonError(
        "This booking was updated by another request. Refresh and try again.",
        409
      );
    }

    if (result.type === "UNCHANGED") {
      return NextResponse.json(
        {
          success: true,
          message: "Booking already has this status.",
        },
        {
          headers: responseHeaders(),
        }
      );
    }

    /*
     * SUCCESS
     */

    return NextResponse.json(
      {
        success: true,

        message:
          "Booking status updated successfully.",

        booking: result.booking,
      },
      {
        headers: responseHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin booking PATCH error:",
      error
    );

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return jsonError(
        "This booking was updated by another request. Refresh and try again.",
        409
      );
    }

    return jsonError(
      "Failed to update booking status.",
      500
    );
  }
}
