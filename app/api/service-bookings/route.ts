
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

const MAX_BODY_SIZE = 12_000;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_PHONE_LENGTH = 32;
const MAX_BOOKING_QUANTITY = 1_000;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const MAX_DATABASE_OFFSET = 2_147_483_647;

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
          ownerName: true,
          imageUrl: true,
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
  headers?: HeadersInit,
) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: responseHeaders(headers),
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function isValidNigerianPhone(value: string): boolean {
  return /^\+234\d{10}$/.test(normalizeNigerianPhone(value));
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
      error: "This account cannot make service bookings.",
      status: 403,
    };
  }

  return {
    account,
    error: null,
    status: 200,
  };
}

function parsePagination(searchParams: URLSearchParams) {
  const rawPage = searchParams.get("page");
  const rawPageSize = searchParams.get("pageSize");

  const page = rawPage === null ? DEFAULT_PAGE : Number(rawPage);
  const requestedPageSize =
    rawPageSize === null ? DEFAULT_PAGE_SIZE : Number(rawPageSize);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(requestedPageSize) ||
    requestedPageSize < 1
  ) {
    return null;
  }

  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;

  if (
    !Number.isSafeInteger(skip) ||
    skip > MAX_DATABASE_OFFSET
  ) {
    return null;
  }

  return { page, pageSize, skip };
}

function formatBooking(booking: BookingRecord) {
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
        id: booking.service.business.id,
        name: booking.service.business.name,
        ownerName: booking.service.business.ownerName,
        imageUrl: booking.service.business.imageUrl,
        verification: booking.service.business.verification,
        verified: booking.service.business.verification === "VERIFIED",
        location: booking.service.business.location,
      },
    },
  };
}

/*
 * GET /api/service-bookings
 * Returns the authenticated user's own bookings.
 */
export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "request-read");

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        bookings: [],
        total: 0,
        error: "Too many booking requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: responseHeaders(rateLimit.headers),
      },
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

    const pagination = parsePagination(
      request.nextUrl.searchParams,
    );

    if (!pagination) {
      return jsonError(
        "Invalid pagination parameters.",
        400,
        rateLimit.headers,
      );
    }

    const where = {
      buyerId: account.id,
    };

    const [total, bookings] = await Promise.all([
      prisma.serviceBooking.count({ where }),
      prisma.serviceBooking.findMany({
        where,
        include: bookingInclude,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
    ]);

    const totalPages = Math.ceil(total / pagination.pageSize);

    return NextResponse.json(
      {
        bookings: bookings.map(formatBooking),
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPreviousPage: pagination.page > 1 && totalPages > 0,
      },
      {
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Get service bookings API error:", error);

    return jsonError(
      "Unable to load your bookings.",
      500,
      rateLimit.headers,
    );
  }
}

/*
 * POST /api/service-bookings
 * Creates a booking and its initial conversation message.
 */
export async function POST(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "request-create");

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

    const serviceId = clean(body.serviceId);
    const buyerMessage = clean(body.buyerMessage);
    const rawPhone = clean(body.contactPhone);

    if (!serviceId || serviceId.length > 100) {
      return jsonError(
        "A valid service ID is required.",
        400,
        rateLimit.headers,
      );
    }

    if (buyerMessage.length > MAX_MESSAGE_LENGTH) {
      return jsonError(
        "Your booking message is too long.",
        400,
        rateLimit.headers,
      );
    }

    if (rawPhone.length > MAX_PHONE_LENGTH) {
      return jsonError(
        "Your contact number is too long.",
        400,
        rateLimit.headers,
      );
    }

    if (rawPhone && !isValidNigerianPhone(rawPhone)) {
      return jsonError(
        "Enter a valid Nigerian phone number.",
        400,
        rateLimit.headers,
      );
    }

    const quantity =
      body.quantity === undefined || body.quantity === null
        ? 1
        : Number(body.quantity);

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_BOOKING_QUANTITY
    ) {
      return jsonError(
        `Quantity must be between 1 and ${MAX_BOOKING_QUANTITY}.`,
        400,
        rateLimit.headers,
      );
    }

    let requestedFor: Date | null = null;

    if (
      body.requestedFor !== undefined &&
      body.requestedFor !== null &&
      body.requestedFor !== ""
    ) {
      if (
        typeof body.requestedFor !== "string" ||
        body.requestedFor.length > 50
      ) {
        return jsonError(
          "Invalid requested date.",
          400,
          rateLimit.headers,
        );
      }

      requestedFor = new Date(body.requestedFor);

      if (Number.isNaN(requestedFor.getTime())) {
        return jsonError(
          "Enter a valid requested date and time.",
          400,
          rateLimit.headers,
        );
      }

      if (requestedFor.getTime() < Date.now()) {
        return jsonError(
          "The requested date and time cannot be in the past.",
          400,
          rateLimit.headers,
        );
      }
    }

    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        status: "ACTIVE",
        deletedAt: null,
        business: {
          is: {
            status: "ACTIVE",
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        name: true,
        availability: true,
        business: {
          select: {
            id: true,
            name: true,
            ownerId: true,
          },
        },
      },
    });

    if (!service) {
      return jsonError(
        "This service is no longer available.",
        404,
        rateLimit.headers,
      );
    }

    if (service.availability === "UNAVAILABLE") {
      return jsonError(
        "This service is currently unavailable for booking.",
        409,
        rateLimit.headers,
      );
    }

    const sellerId = service.business.ownerId;

    if (!sellerId) {
      return jsonError(
        "This seller has not enabled account-based bookings yet.",
        409,
        rateLimit.headers,
      );
    }

    if (sellerId === account.id) {
      return jsonError(
        "You cannot book your own service.",
        403,
        rateLimit.headers,
      );
    }

    const contactPhone = rawPhone
      ? normalizeNigerianPhone(rawPhone)
      : null;

    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.serviceBooking.create({
        data: {
          service: {
            connect: { id: service.id },
          },
          buyer: {
            connect: { id: account.id },
          },
          status: ServiceBookingStatus.PENDING,
          requestedFor,
          quantity,
          contactPhone,
          buyerMessage: buyerMessage || null,
        },
        select: {
          id: true,
        },
      });

      // Save the first message in the booking conversation.
      if (buyerMessage) {
        await tx.serviceBookingMessage.create({
          data: {
            booking: {
              connect: { id: created.id },
            },
            sender: {
              connect: { id: account.id },
            },
            body: buyerMessage,
          },
        });
      }

      return tx.serviceBooking.findUnique({
        where: { id: created.id },
        include: bookingInclude,
      });
    });

    if (!booking) {
      return jsonError(
        "Your booking could not be completed.",
        500,
        rateLimit.headers,
      );
    }

    // A notification failure must not undo a successfully created booking.
    try {
      await createNotification({
        userId: sellerId,
        type: NotificationType.SERVICE_BOOKING_CREATED,
        title: "New service booking",
        message: `A buyer has requested your service: ${service.name}.`,
        priority: NotificationPriority.HIGH,
        data: {
          bookingId: booking.id,
          serviceId: service.id,
          serviceName: service.name,
          href: "/seller",
        },
        dedupeKey: `service-booking:${booking.id}:created:seller:${sellerId}`,
      });
    } catch (notificationError) {
      console.error(
        "Service booking notification error:",
        notificationError,
      );
    }

    return NextResponse.json(
      {
        message: "Your booking request has been submitted.",
        booking: formatBooking(booking),
      },
      {
        status: 201,
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Create service booking API error:", error);

    return jsonError(
      "Unable to submit your booking. Please try again.",
      500,
      rateLimit.headers,
    );
  }
}
