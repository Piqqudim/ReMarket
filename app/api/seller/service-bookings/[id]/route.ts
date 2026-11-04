
import {
  Prisma,
  ServiceBookingStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_BODY_SIZE = 2_000;
const MAX_BOOKING_ID_LENGTH = 100;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function responseHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const rateLimit = checkPublicRateLimit(request, "request-create");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many booking updates. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    /* AUTHENTICATION */

    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as
      | { id?: unknown }
      | undefined;

    if (
      typeof sessionUser?.id !== "string" ||
      !sessionUser.id
    ) {
      return jsonError(
        "Please sign in to manage bookings.",
        401,
        rateLimit.headers,
      );
    }

    const account = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, role: true },
    });

    if (!account) {
      return jsonError(
        "Your account could not be found.",
        401,
        rateLimit.headers,
      );
    }

    if (account.role !== "SELLER") {
      return jsonError(
        "A seller account is required to manage bookings.",
        403,
        rateLimit.headers,
      );
    }

    /* VERIFY BUSINESS OWNERSHIP */

    const business = await prisma.business.findUnique({
      where: { ownerId: account.id },
      select: { id: true },
    });

    if (!business) {
      return jsonError(
        "Complete your seller onboarding before managing bookings.",
        403,
        rateLimit.headers,
      );
    }

    /* VALIDATE BOOKING ID */

    const { id } = await context.params;
    const bookingId = typeof id === "string" ? id.trim() : "";

    if (
      !bookingId ||
      bookingId.length > MAX_BOOKING_ID_LENGTH
    ) {
      return jsonError(
        "Invalid booking ID.",
        400,
        rateLimit.headers,
      );
    }

    /* VALIDATE REQUEST BODY */

    const contentLength = Number(
      request.headers.get("content-length") ?? 0,
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_BODY_SIZE
    ) {
      return jsonError(
        "Request body is too large.",
        413,
        rateLimit.headers,
      );
    }

    const rawBody = await request.text();

    if (
      new TextEncoder().encode(rawBody).byteLength >
      MAX_BODY_SIZE
    ) {
      return jsonError(
        "Request body is too large.",
        413,
        rateLimit.headers,
      );
    }

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

    const requestedStatus = body.status;

    if (
      requestedStatus !== "ACCEPTED" &&
      requestedStatus !== "DECLINED"
    ) {
      return jsonError(
        "Booking status must be ACCEPTED or DECLINED.",
        400,
        rateLimit.headers,
      );
    }

    const nextStatus =
      requestedStatus === "ACCEPTED"
        ? ServiceBookingStatus.ACCEPTED
        : ServiceBookingStatus.DECLINED;

    /* UPDATE BOOKING ATOMICALLY */

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Check that this booking belongs to a service
      // owned by the currently authenticated seller.
      const existingBooking =
        await tx.serviceBooking.findFirst({
          where: {
            id: bookingId,
            service: {
              is: {
                businessId: business.id,
              },
            },
          },
          select: {
            id: true,
            status: true,
          },
        });

      if (!existingBooking) {
        return { outcome: "NOT_FOUND" as const };
      }

      // Only pending bookings may be accepted or declined.
      if (
        existingBooking.status !==
        ServiceBookingStatus.PENDING
      ) {
        return {
          outcome: "INVALID_STATE" as const,
          currentStatus: existingBooking.status,
        };
      }

      /*
       * Conditional update prevents two concurrent actions
       * from changing the same pending booking.
       */
      const updateResult = await tx.serviceBooking.updateMany({
        where: {
          id: bookingId,
          status: ServiceBookingStatus.PENDING,
        },
        data: {
          status: nextStatus,
          acceptedAt:
            nextStatus === ServiceBookingStatus.ACCEPTED
              ? now
              : null,
          declinedAt:
            nextStatus === ServiceBookingStatus.DECLINED
              ? now
              : null,
        },
      });

      if (updateResult.count !== 1) {
        return { outcome: "CONFLICT" as const };
      }

      const updatedBooking =
        await tx.serviceBooking.findUnique({
          where: { id: bookingId },
          select: {
            id: true,
            status: true,
            acceptedAt: true,
            declinedAt: true,
            updatedAt: true,
            service: {
              select: {
                id: true,
                name: true,
              },
            },
            buyer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

      if (!updatedBooking) {
        throw new Error(
          "Updated booking could not be retrieved.",
        );
      }

      return {
        outcome: "UPDATED" as const,
        booking: updatedBooking,
      };
    });

    /* HANDLE TRANSACTION RESULTS */

    if (result.outcome === "NOT_FOUND") {
      return jsonError(
        "Booking request not found.",
        404,
        rateLimit.headers,
      );
    }

    if (result.outcome === "INVALID_STATE") {
      return jsonError(
        `This booking is already ${result.currentStatus.toLowerCase()}. Only pending bookings can be accepted or declined.`,
        409,
        rateLimit.headers,
      );
    }

    if (result.outcome === "CONFLICT") {
      return jsonError(
        "This booking was updated by another request. Refresh your bookings and try again.",
        409,
        rateLimit.headers,
      );
    }

    return NextResponse.json(
      {
        message:
          nextStatus === ServiceBookingStatus.ACCEPTED
            ? "Booking accepted successfully."
            : "Booking declined successfully.",

        booking: {
          id: result.booking.id,
          status: result.booking.status,
          acceptedAt:
            result.booking.acceptedAt?.toISOString() ?? null,
          declinedAt:
            result.booking.declinedAt?.toISOString() ?? null,
          updatedAt: result.booking.updatedAt.toISOString(),
          service: result.booking.service,
          buyer: result.booking.buyer,
        },
      },
      {
        status: 200,
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error(
      "Seller service booking update error:",
      error,
    );

    return jsonError(
      "Unable to update this booking. Please try again.",
      500,
      rateLimit.headers,
    );
  }
}
