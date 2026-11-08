import {
  Prisma,
  ServiceBookingStatus,
} from "@prisma/client";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";

/* =========================================================
   CONFIGURATION
========================================================= */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const MAX_DATABASE_OFFSET = 2_147_483_647;
const MAX_SERVICE_ID_LENGTH = 100;

const ALLOWED_STATUSES = new Set<string>(
  Object.values(ServiceBookingStatus),
);

/* =========================================================
   BOOKING SELECT

   Deliberately excludes:
   - Merchant private notes.
   - Quotation details.
   - Booking message contents.

   messageCount is temporarily retained because the current
   seller dashboard displays it. The conversation UI will be
   removed in the dashboard MVP update.
========================================================= */

const bookingSelect = {
  id: true,
  bookingCode: true,

  serviceId: true,
  buyerId: true,
  sellerId: true,

  status: true,
  bookingType: true,

  requestedFor: true,
  scheduledFor: true,

  quantity: true,
  contactPhone: true,
  buyerMessage: true,

  fulfillmentType: true,
  fulfillmentAddress: true,

  declineReason: true,
  cancellationReason: true,

  acceptedAt: true,
  declinedAt: true,
  cancelledAt: true,
  startedAt: true,
  completedAt: true,

  createdAt: true,
  updatedAt: true,

  service: {
    select: {
      id: true,
      name: true,
      bookingType: true,
      fulfillmentType: true,
      imageUrl: true,
    },
  },

  buyer: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },

  _count: {
    select: {
      messages: true,
    },
  },
} satisfies Prisma.ServiceBookingSelect;

type BookingRecord = Prisma.ServiceBookingGetPayload<{
  select: typeof bookingSelect;
}>;

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
    {
      bookings: [],
      total: 0,
      error: message,
    },
    {
      status,
      headers: responseHeaders(baseHeaders),
    },
  );
}

/* =========================================================
   PAGINATION
========================================================= */

function parsePositiveInteger(
  value: string | null,
  fallback: number,
): number | null {
  if (value === null) return fallback;

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) && parsed >= 1
    ? parsed
    : null;
}

function parsePagination(searchParams: URLSearchParams) {
  const page = parsePositiveInteger(
    searchParams.get("page"),
    DEFAULT_PAGE,
  );

  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );

  if (page === null || requestedPageSize === null) {
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

/* =========================================================
   BOOKING RESPONSE FORMAT
========================================================= */

function formatBooking(booking: BookingRecord) {
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    serviceId: booking.serviceId,
    bookingType: booking.bookingType,
    status: booking.status,

    requestedFor: booking.requestedFor?.toISOString() ?? null,
    scheduledFor: booking.scheduledFor?.toISOString() ?? null,

    quantity: booking.quantity,
    contactPhone: booking.contactPhone,
    buyerMessage: booking.buyerMessage,

    fulfillmentType: booking.fulfillmentType,
    fulfillmentAddress: booking.fulfillmentAddress,

    declineReason: booking.declineReason,
    cancellationReason: booking.cancellationReason,

    acceptedAt: booking.acceptedAt?.toISOString() ?? null,
    declinedAt: booking.declinedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    startedAt: booking.startedAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,

    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),

    buyer: booking.buyer,
    service: booking.service,

    // Temporary dashboard compatibility; no message content is exposed.
    messageCount: booking._count.messages,
  };
}

/* =========================================================
   SELLER OWNERSHIP

   New bookings are assigned through sellerId.
   Older bookings with sellerId=null are resolved through:
   ServiceBooking -> Service -> Business -> ownerId.

   A booking assigned to another seller is never included
   through the legacy ownership fallback.
========================================================= */

function sellerBookingWhere(
  sellerId: string,
): Prisma.ServiceBookingWhereInput {
  return {
    OR: [
      { sellerId },
      {
        sellerId: null,
        service: {
          is: {
            business: {
              is: { ownerId: sellerId },
            },
          },
        },
      },
    ],
  };
}

/* =========================================================
   GET /api/seller/service-bookings

   Returns bookings belonging to the authenticated seller.
   Supports status filtering, service filtering, pagination
   and seller-wide status summaries.
========================================================= */

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(
    request,
    "request-read",
  );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many booking requests. Please try again shortly.",
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
        "Please sign in to view your bookings.",
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
        "A seller account is required to access incoming bookings.",
        403,
        rateLimit.headers,
      );
    }

    /* QUERY PARAMETERS */

    const searchParams = request.nextUrl.searchParams;
    const pagination = parsePagination(searchParams);

    if (!pagination) {
      return jsonError(
        "Invalid pagination parameters.",
        400,
        rateLimit.headers,
      );
    }

    const statusParam = (
      searchParams.get("status") ?? ""
    ).trim().toUpperCase();

    if (
      statusParam &&
      statusParam !== "ALL" &&
      !ALLOWED_STATUSES.has(statusParam)
    ) {
      return jsonError(
        "Invalid booking status filter.",
        400,
        rateLimit.headers,
      );
    }

    const serviceId = (
      searchParams.get("serviceId") ?? ""
    ).trim();

    if (serviceId.length > MAX_SERVICE_ID_LENGTH) {
      return jsonError(
        "Invalid service ID.",
        400,
        rateLimit.headers,
      );
    }

    /* SELLER-OWNED BOOKINGS */

    const sellerWhere = sellerBookingWhere(account.id);
    const conditions: Prisma.ServiceBookingWhereInput[] = [
      sellerWhere,
    ];

    if (statusParam && statusParam !== "ALL") {
      conditions.push({
        status: statusParam as ServiceBookingStatus,
      });
    }

    if (serviceId) {
      conditions.push({ serviceId });
    }

    const where: Prisma.ServiceBookingWhereInput = {
      AND: conditions,
    };

    /* LOAD RESULTS AND STATUS SUMMARY */

    const [total, bookings, statusCounts] = await Promise.all([
      prisma.serviceBooking.count({ where }),

      prisma.serviceBooking.findMany({
        where,
        select: bookingSelect,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),

      prisma.serviceBooking.groupBy({
        by: ["status"],
        where: sellerWhere,
        _count: { _all: true },
      }),
    ]);

    /* STATUS COUNTS */

    const counts: Record<ServiceBookingStatus, number> = {
      PENDING: 0,
      AWAITING_BUYER: 0,
      ACCEPTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      DECLINED: 0,
      CANCELLED: 0,
    };

    for (const item of statusCounts) {
      counts[item.status] = item._count._all;
    }

    const summaryTotal = Object.values(counts).reduce(
      (sum, count) => sum + count,
      0,
    );

    /* PAGINATION METADATA */

    const totalPages = Math.ceil(total / pagination.pageSize);

    return NextResponse.json(
      {
        bookings: bookings.map(formatBooking),
        summary: {
          total: summaryTotal,
          ...counts,
        },
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPreviousPage:
          pagination.page > 1 && pagination.page <= totalPages,
      },
      {
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error(
      "Seller service bookings API error:",
      error,
    );

    return jsonError(
      "Unable to load incoming service bookings.",
      500,
      rateLimit.headers,
    );
  }
}