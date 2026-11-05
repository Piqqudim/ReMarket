import {
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

/*
 * ============================================================
 * CONSTANTS AND TYPES
 * ============================================================
 */

const MAX_BOOKING_ID_LENGTH = 100;
const MAX_BODY_SIZE = 4_000;

type BookingStatus =
  | "PENDING"
  | "ACCEPTED"
  | "DECLINED"
  | "CANCELLED"
  | "COMPLETED";

type BookingTransition =
  | "ACCEPTED"
  | "DECLINED"
  | "CANCELLED"
  | "COMPLETED";

const ALLOWED_TRANSITIONS = new Set<BookingTransition>([
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
  "COMPLETED",
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

type AccountResult =
  | {
      account: {
        id: string;
        role: "BUYER" | "SELLER";
      };
      error: null;
      status: 200;
    }
  | {
      account: null;
      error: string;
      status: 401 | 403;
    };

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

/*
 * ============================================================
 * RESPONSE HELPERS
 * ============================================================
 */

function responseHeaders(
  baseHeaders?: HeadersInit
): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "no-store, max-age=0, must-revalidate"
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
 * ============================================================
 * GENERAL HELPERS
 * ============================================================
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

/*
 * ============================================================
 * REQUEST BODY SIZE PROTECTION
 * ============================================================
 */

async function readLimitedRequestBody(
  request: NextRequest,
  maximumBytes: number
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

      if (totalBytes > maximumBytes) {
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

  const completeBody = new Uint8Array(totalBytes);

  let offset = 0;

  for (const chunk of chunks) {
    completeBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", {
    fatal: true,
  }).decode(completeBody);
}

/*
 * ============================================================
 * PHONE HELPERS
 * ============================================================
 */

function normalizeNigerianPhone(value: string): string {
  let phone = value.trim().replace(/[^\d+]/g, "");

  if (!phone) {
    return "";
  }

  if (phone.startsWith("00")) {
    phone = phone.slice(2);
  }

  if (phone.startsWith("+")) {
    phone = phone.slice(1);
  }

  if (phone.startsWith("234")) {
    return `+${phone}`;
  }

  if (phone.startsWith("0")) {
    return `+234${phone.slice(1)}`;
  }

  return `+234${phone}`;
}

function normalizeSocialHandle(
  platform: string,
  handle: string
): string {
  const clean = handle.trim();

  if (!clean) {
    return "";
  }

  if (
    platform === "PHONE" ||
    platform === "WHATSAPP"
  ) {
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

/*
 * ============================================================
 * AUTHENTICATION
 * ============================================================
 */

async function getAuthenticatedAccount(): Promise<AccountResult> {
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

  const account = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },

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

  if (
    account.role !== "BUYER" &&
    account.role !== "SELLER"
  ) {
    return {
      account: null,
      error: "This account cannot access service bookings.",
      status: 403,
    };
  }

  return {
    account: {
      id: account.id,
      role: account.role,
    },

    error: null,
    status: 200,
  };
}

/*
 * ============================================================
 * BOOKING RESPONSE FORMAT
 * ============================================================
 */

function formatBooking(
  booking: BookingRecord,
  viewer: "BUYER" | "SELLER"
) {
  const business = booking.service.business;

  const showContactInfo =
    business.showContactInfo === true;

  const socialLinks = showContactInfo
    ? business.socialLinks
        .map((link) => ({
          id: link.id,
          platform: link.platform,

          handle: normalizeSocialHandle(
            link.platform,
            link.handle
          ),
        }))
        .filter((link) => Boolean(link.handle))
    : [];

  /*
   * Include the legacy business phone when contact
   * information is publicly enabled and no PHONE
   * social-link entry already exists.
   */

  if (
    showContactInfo &&
    business.phone &&
    !socialLinks.some(
      (link) => link.platform === "PHONE"
    )
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

    requestedFor:
      booking.requestedFor?.toISOString() ?? null,

    quantity: booking.quantity,
    contactPhone: booking.contactPhone,
    buyerMessage: booking.buyerMessage,

    acceptedAt:
      booking.acceptedAt?.toISOString() ?? null,

    declinedAt:
      booking.declinedAt?.toISOString() ?? null,

    cancelledAt:
      booking.cancelledAt?.toISOString() ?? null,

    completedAt:
      booking.completedAt?.toISOString() ?? null,

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

      // Only expose the required public image fields.
      images: booking.service.images.map((image) => ({
        id: image.id,
        url: image.url,
        sortOrder: image.sortOrder,
      })),

      seller: {
        id: business.id,
        name: business.name,
        ownerName: business.ownerName,
        description: business.description,
        imageUrl: business.imageUrl,

        availability: business.availability,

        verification: business.verification,

        verified:
          business.verification === "VERIFIED",

        showContactInfo,

        location: business.location,

        socialLinks,
      },
    },
  };
}

/*
 * ============================================================
 * BOOKING NOTIFICATIONS
 * ============================================================
 */

async function notifyBookingParticipant(
  userId: string,
  bookingId: string,
  serviceName: string,
  status: BookingTransition,
  recipientType: "BUYER" | "SELLER"
): Promise<void> {
  const notificationTitles: Record<
    BookingStatus,
    string
  > = {
    PENDING: "New booking request",
    ACCEPTED: "Booking accepted",
    DECLINED: "Booking declined",
    CANCELLED: "Booking cancelled",
    COMPLETED: "Booking completed",
  };

  const statusMessages: Record<
    BookingStatus,
    string
  > = {
    PENDING: "is awaiting confirmation.",
    ACCEPTED: "has been accepted.",
    DECLINED: "has been declined.",
    CANCELLED: "has been cancelled.",
    COMPLETED: "has been marked as completed.",
  };

  /*
   * A seller receives this notification when the buyer
   * cancels a booking.
   *
   * A buyer receives notifications when the seller
   * accepts, declines or completes their booking.
   */

  const message =
    recipientType === "SELLER"
      ? `A buyer cancelled the booking for ${serviceName}.`
      : `Your booking request for ${serviceName} ${statusMessages[status]}`;

  const href =
    recipientType === "SELLER"
      ? "/seller#service-bookings"
      : "/bookings";

  try {
    await createNotification({
      userId,

      type: NotificationType.SERVICE_BOOKING_UPDATED,

      title: notificationTitles[status],

      message,

      priority: NotificationPriority.NORMAL,

      data: {
        bookingId,
        status,
        href,
      },

      dedupeKey:
        `service-booking:${bookingId}:status:${status}:user:${userId}`,
    });

    /*
     * createNotification() checks the recipient's
     * SERVICE_BOOKING_UPDATED in-app preference.
     *
     * A disabled preference results in a skipped
     * notification, not a failed booking update.
     */
  } catch (error) {
    /*
     * Notification failure must never reverse
     * a successful booking status update.
     */

    console.error(
      "Booking status notification error:",
      error
    );
  }
}

/*
 * ============================================================
 * GET /api/service-bookings/[id]
 * ============================================================
 *
 * Only the buyer who created the booking or the seller
 * who owns the service can view it.
 * ============================================================
 */

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const rateLimit = checkPublicRateLimit(
    request,
    "request-read"
  );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many booking requests. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  try {
    const {
      account,
      error,
      status,
    } = await getAuthenticatedAccount();

    if (!account) {
      return jsonError(
        error,
        status,
        rateLimit.headers
      );
    }

    const { id } = await params;

    const bookingId = id.trim();

    if (
      !bookingId ||
      bookingId.length > MAX_BOOKING_ID_LENGTH
    ) {
      return jsonError(
        "Invalid booking ID.",
        400,
        rateLimit.headers
      );
    }

    const booking = await prisma.serviceBooking.findUnique({
      where: {
        id: bookingId,
      },

      include: bookingInclude,
    });

    if (!booking) {
      return jsonError(
        "Booking not found.",
        404,
        rateLimit.headers
      );
    }

    const isBuyer =
      booking.buyerId === account.id;

    const isSeller =
      booking.service.business.ownerId === account.id;

    if (!isBuyer && !isSeller) {
      return jsonError(
        "Booking not found.",
        404,
        rateLimit.headers
      );
    }

    const currentStatus = booking.status;

    return NextResponse.json(
      {
        booking: formatBooking(
          booking,
          isSeller ? "SELLER" : "BUYER"
        ),

        permissions: {
          canAccept:
            isSeller &&
            currentStatus === "PENDING",

          canDecline:
            isSeller &&
            currentStatus === "PENDING",

          canComplete:
            isSeller &&
            currentStatus === "ACCEPTED",

          canCancel:
            isBuyer &&
            (
              currentStatus === "PENDING" ||
              currentStatus === "ACCEPTED"
            ),

          // Must match the booking messages API.
          // Messages are permitted after acceptance
          // or after service completion.
          canSendMessage:
            currentStatus === "ACCEPTED" ||
            currentStatus === "COMPLETED",
        },
      },

      {
        headers: responseHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error(
      "Get service booking details error:",
      error
    );

    return jsonError(
      "Unable to load this booking.",
      500,
      rateLimit.headers
    );
  }
}

/*
 * ============================================================
 * PATCH /api/service-bookings/[id]
 * ============================================================
 *
 * PERMITTED TRANSITIONS
 *
 * SELLER:
 * PENDING -> ACCEPTED
 * PENDING -> DECLINED
 * ACCEPTED -> COMPLETED
 *
 * BUYER:
 * PENDING -> CANCELLED
 * ACCEPTED -> CANCELLED
 *
 * The update is conditional to protect against
 * simultaneous status changes.
 * ============================================================
 */

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
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
      account,
      error,
      status,
    } = await getAuthenticatedAccount();

    if (!account) {
      return jsonError(
        error,
        status,
        rateLimit.headers
      );
    }

    /*
     * BOOKING ID
     */

    const { id } = await params;

    const bookingId = id.trim();

    if (
      !bookingId ||
      bookingId.length > MAX_BOOKING_ID_LENGTH
    ) {
      return jsonError(
        "Invalid booking ID.",
        400,
        rateLimit.headers
      );
    }

    /*
     * REQUEST BODY SIZE
     */

    const contentLength = Number(
      request.headers.get("content-length") ?? 0
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_BODY_SIZE
    ) {
      return jsonError(
        "Request body is too large.",
        413,
        rateLimit.headers
      );
    }

    let rawBody: string;

    try {
      rawBody = await readLimitedRequestBody(
        request,
        MAX_BODY_SIZE
      );
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
        "Invalid request body.",
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
     * THIS ENDPOINT ONLY ACCEPTS A STATUS UPDATE.
     */

    if (
      Object.keys(body).some(
        (key) => key !== "status"
      )
    ) {
      return jsonError(
        "Only the booking status can be updated.",
        400,
        rateLimit.headers
      );
    }

    /*
     * VALIDATE TARGET STATUS
     */

    const requestedStatus =
      typeof body.status === "string"
        ? body.status.trim().toUpperCase()
        : "";

    if (
      !ALLOWED_TRANSITIONS.has(
        requestedStatus as BookingTransition
      )
    ) {
      return jsonError(
        "Invalid booking status.",
        400,
        rateLimit.headers
      );
    }

    const targetStatus =
      requestedStatus as BookingTransition;

    /*
     * FIND BOOKING
     */

    const booking = await prisma.serviceBooking.findUnique({
      where: {
        id: bookingId,
      },

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
        rateLimit.headers
      );
    }

    /*
     * PARTICIPANT OWNERSHIP
     */

    const isBuyer =
      booking.buyerId === account.id;

    const isSeller =
      booking.service.business.ownerId === account.id;

    if (!isBuyer && !isSeller) {
      return jsonError(
        "Booking not found.",
        404,
        rateLimit.headers
      );
    }

    if (isBuyer && isSeller) {
      return jsonError(
        "You cannot update a booking for your own service.",
        403,
        rateLimit.headers
      );
    }

    /*
     * CHECK PERMITTED TRANSITIONS
     */

    const currentStatus = booking.status;

    let allowed = false;

    if (isSeller) {
      allowed =
        (
          currentStatus === "PENDING" &&
          (
            targetStatus === "ACCEPTED" ||
            targetStatus === "DECLINED"
          )
        ) ||
        (
          currentStatus === "ACCEPTED" &&
          targetStatus === "COMPLETED"
        );
    }

    if (isBuyer) {
      allowed =
        (
          currentStatus === "PENDING" ||
          currentStatus === "ACCEPTED"
        ) &&
        targetStatus === "CANCELLED";
    }

    if (!allowed) {
      return jsonError(
        "This booking status change is not permitted.",
        409,
        rateLimit.headers
      );
    }

    /*
     * PREPARE STATUS UPDATE
     */

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

    /*
     * ATOMIC OWNERSHIP FILTER
     *
     * The database checks ownership again during the update.
     */

    const ownershipFilter: Prisma.ServiceBookingWhereInput =
      isBuyer
        ? {
            buyerId: account.id,
          }
        : {
            service: {
              is: {
                business: {
                  is: {
                    ownerId: account.id,
                  },
                },
              },
            },
          };

    /*
     * ATOMIC STATUS UPDATE
     *
     * Checks:
     * - Booking ID.
     * - Previous booking status.
     * - Current buyer or seller ownership.
     *
     * This prevents two simultaneous requests from
     * successfully changing the same booking state.
     */

    const updatedBooking = await prisma.$transaction(
      async (tx) => {
        const updateResult =
          await tx.serviceBooking.updateMany({
            where: {
              id: booking.id,
              status: currentStatus,
              ...ownershipFilter,
            },

            data: updateData,
          });

        if (updateResult.count !== 1) {
          return null;
        }

        return tx.serviceBooking.findUnique({
          where: {
            id: booking.id,
          },

          include: bookingInclude,
        });
      }
    );

    if (!updatedBooking) {
      return jsonError(
        "This booking has already changed. Refresh and try again.",
        409,
        rateLimit.headers
      );
    }

    /*
     * NOTIFY THE OTHER PARTICIPANT
     *
     * Notification creation happens after the booking
     * transaction has committed.
     *
     * If the recipient disabled SERVICE_BOOKING_UPDATED,
     * createNotification() skips the notification.
     *
     * The status update remains successful.
     */

    const recipientId = isSeller
      ? booking.buyerId
      : booking.service.business.ownerId;

    const recipientType = isSeller
      ? "BUYER"
      : "SELLER";

    if (recipientId) {
      await notifyBookingParticipant(
        recipientId,
        booking.id,
        booking.service.name,
        targetStatus,
        recipientType
      );
    }

    /*
     * SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        message: `Booking ${targetStatus.toLowerCase()} successfully.`,

        booking: formatBooking(
          updatedBooking,
          isSeller ? "SELLER" : "BUYER"
        ),
      },

      {
        headers: responseHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error(
      "Update service booking API error:",
      error
    );

    return jsonError(
      "Unable to update this booking.",
      500,
      rateLimit.headers
    );
  }
}