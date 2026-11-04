
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

const MAX_BOOKING_ID_LENGTH = 100;
const MAX_BODY_SIZE = 4_000;

const ALLOWED_TRANSITIONS = new Set<ServiceBookingStatus>([
  ServiceBookingStatus.ACCEPTED,
  ServiceBookingStatus.DECLINED,
  ServiceBookingStatus.CANCELLED,
  ServiceBookingStatus.COMPLETED,
]);

const bookingInclude = {
  service: {
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      priceMin: true,
      priceMax: true,
      durationMinutes: true,
      fulfillmentType: true,
      availability: true,
      imageUrl: true,
      category: {
        select: {
          id: true,
          name: true,
          iconKey: true,
        },
      },
      images: {
        select: {
          id: true,
          url: true,
          publicId: true,
          sortOrder: true,
        },
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },
      business: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          ownerName: true,
          description: true,
          imageUrl: true,
          phone: true,
          availability: true,
          verification: true,
          showContactInfo: true,
          location: {
            select: {
              id: true,
              area: true,
              street: true,
              address: true,
              verification: true,
            },
          },
          socialLinks: {
            select: {
              id: true,
              platform: true,
              handle: true,
            },
          },
        },
      },
    },
  },
  buyer: {
    select: {
      id: true,
      name: true,
    },
  },
  _count: {
    select: {
      messages: true,
    },
  },
} satisfies Prisma.ServiceBookingInclude;

type BookingRecord = Prisma.ServiceBookingGetPayload<{
  include: typeof bookingInclude;
}>;

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
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}

function normalizeNigerianPhone(value: string): string {
  let phone = value.trim().replace(/[^\d+]/g, "");

  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("234")) return `+${phone}`;
  if (phone.startsWith("0")) return `+234${phone.slice(1)}`;

  return `+234${phone}`;
}

function normalizeSocialHandle(
  platform: string,
  handle: string,
): string {
  const clean = handle.trim();
  if (!clean) return "";

  if (platform === "PHONE" || platform === "WHATSAPP") {
    if (
      clean.startsWith("http://") ||
      clean.startsWith("https://")
    ) {
      return clean;
    }

    return normalizeNigerianPhone(clean);
  }

  return clean;
}

async function getAuthenticatedAccount() {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as
    | { id?: unknown }
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

  const account = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      role: true,
    },
  });

  if (!account) {
    return {
      account: null,
      error: "Your account could not be found.",
      status: 401,
    };
  }

  if (account.role !== "BUYER" && account.role !== "SELLER") {
    return {
      account: null,
      error: "This account cannot access service bookings.",
      status: 403,
    };
  }

  return {
    account,
    error: null,
    status: 200,
  };
}

function formatBooking(
  booking: BookingRecord,
  viewer: "BUYER" | "SELLER",
) {
  const business = booking.service.business;
  const showContactInfo = business.showContactInfo === true;

  const socialLinks = showContactInfo
    ? business.socialLinks.map((link) => ({
        id: link.id,
        platform: link.platform,
        handle: normalizeSocialHandle(link.platform, link.handle),
      }))
    : [];

  if (
    showContactInfo &&
    business.phone &&
    !socialLinks.some((link) => link.platform === "PHONE")
  ) {
    socialLinks.push({
      id: `legacy-phone-${business.id}`,
      platform: "PHONE",
      handle: normalizeNigerianPhone(business.phone),
    });
  }

  return {
    id: booking.id,
    status: booking.status,
    requestedFor: booking.requestedFor?.toISOString() ?? null,
    quantity: booking.quantity,
    contactPhone: booking.contactPhone,
    buyerMessage: booking.buyerMessage,
    acceptedAt: booking.acceptedAt?.toISOString() ?? null,
    declinedAt: booking.declinedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    messageCount: booking._count.messages,
    viewer,

    buyer: {
      id: booking.buyer.id,
      name: booking.buyer.name,
    },

    service: {
      id: booking.service.id,
      name: booking.service.name,
      description: booking.service.description,
      price: booking.service.price,
      priceMin: booking.service.priceMin,
      priceMax: booking.service.priceMax,
      durationMinutes: booking.service.durationMinutes,
      fulfillmentType: booking.service.fulfillmentType,
      availability: booking.service.availability,
      imageUrl: booking.service.imageUrl,
      category: booking.service.category,
      images: booking.service.images,
      seller: {
        id: business.id,
        name: business.name,
        ownerName: business.ownerName,
        description: business.description,
        imageUrl: business.imageUrl,
        availability: business.availability,
        verification: business.verification,
        verified: business.verification === "VERIFIED",
        showContactInfo,
        location: business.location,
        socialLinks,
      },
    },
  };
}

async function notifyBookingParticipant(
  userId: string,
  bookingId: string,
  serviceName: string,
  status: ServiceBookingStatus,
  recipientType: "BUYER" | "SELLER",
) {
  const statusMessages: Record<ServiceBookingStatus, string> = {
    PENDING: "is awaiting confirmation.",
    ACCEPTED: "has been accepted.",
    DECLINED: "has been declined.",
    CANCELLED: "has been cancelled.",
    COMPLETED: "has been marked as completed.",
  };

  try {
    await createNotification({
      userId,
      type: NotificationType.SERVICE_BOOKING_UPDATED,
      title: "Booking updated",
      message: `Your booking for ${serviceName} ${statusMessages[status]}`,
      priority: NotificationPriority.NORMAL,
      data: {
        bookingId,
        status,
        href: recipientType === "SELLER" ? "/seller" : "/account",
      },
      dedupeKey: `service-booking:${bookingId}:status:${status}`,
    });
  } catch (error) {
    console.error("Booking status notification error:", error);
  }
}

/*
 * GET /api/service-bookings/[id]
 *
 * Only the buyer who created the booking or the seller
 * who owns the service can view it.
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  const rateLimit = checkPublicRateLimit(request, "request-read");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many booking requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const { account, error, status } =
      await getAuthenticatedAccount();

    if (!account) {
      return jsonError(
        error ?? "Authentication required.",
        status,
        rateLimit.headers,
      );
    }

    const { id } = await params;

    if (!id || id.length > MAX_BOOKING_ID_LENGTH) {
      return jsonError(
        "Invalid booking ID.",
        400,
        rateLimit.headers,
      );
    }

    const booking = await prisma.serviceBooking.findUnique({
      where: { id },
      include: bookingInclude,
    });

    if (!booking) {
      return jsonError(
        "Booking not found.",
        404,
        rateLimit.headers,
      );
    }

    const isBuyer = booking.buyerId === account.id;
    const isSeller = booking.service.business.ownerId === account.id;

    if (!isBuyer && !isSeller) {
      return jsonError(
        "Booking not found.",
        404,
        rateLimit.headers,
      );
    }

    return NextResponse.json(
      {
        booking: formatBooking(
          booking,
          isSeller ? "SELLER" : "BUYER",
        ),
        permissions: {
          canAccept:
            isSeller && booking.status === "PENDING",
          canDecline:
            isSeller && booking.status === "PENDING",
          canComplete:
            isSeller && booking.status === "ACCEPTED",
          canCancel:
            isBuyer &&
            (booking.status === "PENDING" ||
              booking.status === "ACCEPTED"),
          canSendMessage:
            booking.status !== "DECLINED" &&
            booking.status !== "CANCELLED",
        },
      },
      {
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Get service booking details error:", error);

    return jsonError(
      "Unable to load this booking.",
      500,
      rateLimit.headers,
    );
  }
}

/*
 * PATCH /api/service-bookings/[id]
 *
 * Permitted transitions:
 *
 * SELLER:
 * PENDING -> ACCEPTED
 * PENDING -> DECLINED
 * ACCEPTED -> COMPLETED
 *
 * BUYER:
 * PENDING -> CANCELLED
 * ACCEPTED -> CANCELLED
 */
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
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
    const { account, error, status } =
      await getAuthenticatedAccount();

    if (!account) {
      return jsonError(
        error ?? "Authentication required.",
        status,
        rateLimit.headers,
      );
    }

    const { id } = await params;

    if (!id || id.length > MAX_BOOKING_ID_LENGTH) {
      return jsonError(
        "Invalid booking ID.",
        400,
        rateLimit.headers,
      );
    }

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
      new TextEncoder().encode(rawBody).length >
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
        "Invalid request body.",
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
      typeof requestedStatus !== "string" ||
      !ALLOWED_TRANSITIONS.has(
        requestedStatus as ServiceBookingStatus,
      )
    ) {
      return jsonError(
        "Invalid booking status.",
        400,
        rateLimit.headers,
      );
    }

    const targetStatus =
      requestedStatus as ServiceBookingStatus;

    const booking = await prisma.serviceBooking.findUnique({
      where: { id },
      select: {
        id: true,
        buyerId: true,
        status: true,
        service: {
          select: {
            id: true,
            name: true,
            business: {
              select: {
                id: true,
                ownerId: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      return jsonError(
        "Booking not found.",
        404,
        rateLimit.headers,
      );
    }

    const isBuyer = booking.buyerId === account.id;
    const isSeller = booking.service.business.ownerId === account.id;

    if (!isBuyer && !isSeller) {
      return jsonError(
        "Booking not found.",
        404,
        rateLimit.headers,
      );
    }

    if (isBuyer && isSeller) {
      return jsonError(
        "You cannot update a booking for your own service.",
        403,
        rateLimit.headers,
      );
    }

    let allowed = false;

    if (isSeller) {
      allowed =
        (booking.status === "PENDING" &&
          (targetStatus === "ACCEPTED" ||
            targetStatus === "DECLINED")) ||
        (booking.status === "ACCEPTED" &&
          targetStatus === "COMPLETED");
    }

    if (isBuyer) {
      allowed =
        (booking.status === "PENDING" ||
          booking.status === "ACCEPTED") &&
        targetStatus === "CANCELLED";
    }

    if (!allowed) {
      return jsonError(
        "This booking status change is not permitted.",
        409,
        rateLimit.headers,
      );
    }

    const now = new Date();

    const updateData: Prisma.ServiceBookingUpdateManyMutationInput = {
      status: targetStatus,
    };

    if (targetStatus === "ACCEPTED") {
      updateData.acceptedAt = now;
    }

    if (targetStatus === "DECLINED") {
      updateData.declinedAt = now;
    }

    if (targetStatus === "CANCELLED") {
      updateData.cancelledAt = now;
    }

    if (targetStatus === "COMPLETED") {
      updateData.completedAt = now;
    }

    // Conditional update prevents two simultaneous actions from
    // overwriting each other's booking status.
    const updatedBooking = await prisma.$transaction(async (tx) => {
      const result = await tx.serviceBooking.updateMany({
        where: {
          id: booking.id,
          status: booking.status,
          ...(isBuyer ? { buyerId: account.id } : {}),
        },
        data: updateData,
      });

      if (result.count !== 1) {
        return null;
      }

      return tx.serviceBooking.findUnique({
        where: { id: booking.id },
        include: bookingInclude,
      });
    });

    if (!updatedBooking) {
      return jsonError(
        "This booking has already changed. Refresh and try again.",
        409,
        rateLimit.headers,
      );
    }

    const recipientId = isSeller
      ? booking.buyerId
      : booking.service.business.ownerId;

    const recipientType = isSeller ? "BUYER" : "SELLER";

    if (recipientId) {
      await notifyBookingParticipant(
        recipientId,
        booking.id,
        booking.service.name,
        targetStatus,
        recipientType,
      );
    }

    return NextResponse.json(
      {
        message: `Booking ${targetStatus.toLowerCase()} successfully.`,
        booking: formatBooking(
          updatedBooking,
          isSeller ? "SELLER" : "BUYER",
        ),
      },
      {
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Update service booking API error:", error);

    return jsonError(
      "Unable to update this booking.",
      500,
      rateLimit.headers,
    );
  }
}
