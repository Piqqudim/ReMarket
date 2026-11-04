
import { NextRequest, NextResponse } from "next/server";
import { ServiceBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const allowedTransitions: Record<
  ServiceBookingStatus,
  ServiceBookingStatus[]
> = {
  PENDING: [
    ServiceBookingStatus.ACCEPTED,
    ServiceBookingStatus.DECLINED,
    ServiceBookingStatus.CANCELLED,
  ],
  ACCEPTED: [
    ServiceBookingStatus.COMPLETED,
    ServiceBookingStatus.CANCELLED,
  ],
  DECLINED: [],
  CANCELLED: [],
  COMPLETED: [],
};

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const admin = await requireAdmin();

    if (admin instanceof NextResponse) {
      return admin;
    }

    const { id } = await params;
    const bookingId = id.trim();

    if (!bookingId) {
      return NextResponse.json(
        { error: "Booking ID is required." },
        { status: 400 }
      );
    }

    const booking = await prisma.serviceBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        requestedFor: true,
        quantity: true,
        contactPhone: true,
        buyerMessage: true,
        acceptedAt: true,
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
            durationMinutes: true,
            status: true,
            deletedAt: true,

            images: {
              select: {
                id: true,
                url: true,
                sortOrder: true,
              },
              orderBy: {
                sortOrder: "asc",
              },
            },

            business: {
              select: {
                id: true,
                name: true,
                status: true,
                verification: true,

                // Location is a relation on Business.
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
          orderBy: {
            createdAt: "desc",
          },
          take: 50,
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Booking not found." },
        { status: 404 }
      );
    }

    // Preserve the existing API response shape:
    // service.business.area and service.business.street.
    const responseBooking = {
      ...booking,
      service: {
        ...booking.service,
        business: {
          ...booking.service.business,
          area: booking.service.business.location?.area ?? null,
          street: booking.service.business.location?.street ?? null,
        },
      },
    };

    return NextResponse.json(
      {
        success: true,
        booking: responseBooking,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Admin booking GET error:", error);

    return NextResponse.json(
      { error: "Failed to retrieve booking details." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const admin = await requireAdmin();

    if (admin instanceof NextResponse) {
      return admin;
    }

    const { id } = await params;
    const bookingId = id.trim();

    if (!bookingId) {
      return NextResponse.json(
        { error: "Booking ID is required." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "A valid JSON request body is required." },
        { status: 400 }
      );
    }

    const payload = body as Record<string, unknown>;

    if (Object.keys(payload).some((key) => key !== "status")) {
      return NextResponse.json(
        { error: "Only the booking status can be updated through this endpoint." },
        { status: 400 }
      );
    }

    const statusValue =
      typeof payload.status === "string"
        ? payload.status.trim().toUpperCase()
        : "";

    const validStatuses = Object.values(ServiceBookingStatus);

    if (!validStatuses.includes(statusValue as ServiceBookingStatus)) {
      return NextResponse.json(
        {
          error: "Invalid booking status.",
          validStatuses,
        },
        { status: 400 }
      );
    }

    const nextStatus = statusValue as ServiceBookingStatus;

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.serviceBooking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          status: true,
        },
      });

      if (!current) {
        return { type: "NOT_FOUND" as const };
      }

      if (current.status === nextStatus) {
        return { type: "UNCHANGED" as const };
      }

      if (!allowedTransitions[current.status].includes(nextStatus)) {
        return {
          type: "INVALID_TRANSITION" as const,
          currentStatus: current.status,
        };
      }

      const now = new Date();

      const updateData = {
        status: nextStatus,
        ...(nextStatus === ServiceBookingStatus.ACCEPTED
          ? { acceptedAt: now }
          : {}),
      };

      // Compare the existing status to prevent concurrent updates
      // from silently overwriting one another.
      const updateResult = await tx.serviceBooking.updateMany({
        where: {
          id: bookingId,
          status: current.status,
        },
        data: updateData,
      });

      if (updateResult.count === 0) {
        return { type: "CONFLICT" as const };
      }

      const booking = await tx.serviceBooking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          status: true,
          acceptedAt: true,
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

      return {
        type: "UPDATED" as const,
        booking,
      };
    });

    if (result.type === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Booking not found." },
        { status: 404 }
      );
    }

    if (result.type === "INVALID_TRANSITION") {
      return NextResponse.json(
        {
          error: `A booking cannot move from ${result.currentStatus} to ${nextStatus}.`,
          currentStatus: result.currentStatus,
          requestedStatus: nextStatus,
        },
        { status: 409 }
      );
    }

    if (result.type === "CONFLICT") {
      return NextResponse.json(
        {
          error: "This booking was updated by another request. Refresh and try again.",
        },
        { status: 409 }
      );
    }

    if (result.type === "UNCHANGED") {
      return NextResponse.json({
        success: true,
        message: "Booking already has this status.",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Booking status updated successfully.",
      booking: result.booking,
    });
  } catch (error) {
    console.error("Admin booking PATCH error:", error);

    return NextResponse.json(
      { error: "Failed to update booking status." },
      { status: 500 }
    );
  }
}
