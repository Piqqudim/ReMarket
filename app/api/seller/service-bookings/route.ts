
import {
  ServiceBookingStatus,
  Prisma,
} from "@prisma/client";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";

/*
 * ---------------------------------------------------------
 * CONFIGURATION
 * ---------------------------------------------------------
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const MAX_DATABASE_OFFSET = 2_147_483_647;
const MAX_SERVICE_ID_LENGTH = 100;

/*
 * ---------------------------------------------------------
 * ALLOWED STATUSES
 * ---------------------------------------------------------
 */

const ALLOWED_STATUSES = new Set<ServiceBookingStatus>(
  Object.values(ServiceBookingStatus)
);

/*
 * ---------------------------------------------------------
 * BOOKING INCLUDE
 * ---------------------------------------------------------
 */

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

      bookingType: true,
      fulfillmentType: true,
      availability: true,

      imageUrl: true,

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

        take: 1,
      },

      category: {
        select: {
          id: true,
          name: true,
          iconKey: true,
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

  messages: {
    select: {
      id: true,
      body: true,
      senderId: true,
      readAt: true,
      createdAt: true,
    },

    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],

    take: 1,
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

/*
 * ---------------------------------------------------------
 * RESPONSE HEADERS
 * ---------------------------------------------------------
 */

function responseHeaders(
  baseHeaders?: HeadersInit
): Headers {
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
      bookings: [],
      total: 0,
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
 * PAGINATION
 * ---------------------------------------------------------
 */

function parsePositiveInteger(
  value: string | null,
  fallback: number
): number | null {
  if (value === null) {
    return fallback;
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return (
    Number.isSafeInteger(parsed) &&
    parsed >= 1
  )
    ? parsed
    : null;
}

function parsePagination(
  searchParams: URLSearchParams
) {
  const page = parsePositiveInteger(
    searchParams.get("page"),
    DEFAULT_PAGE
  );

  if (page === null) {
    return null;
  }

  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE
  );

  if (requestedPageSize === null) {
    return null;
  }

  const pageSize = Math.min(
    requestedPageSize,
    MAX_PAGE_SIZE
  );

  const skip = (page - 1) * pageSize;

  if (
    !Number.isSafeInteger(skip) ||
    skip > MAX_DATABASE_OFFSET
  ) {
    return null;
  }

  return {
    page,
    pageSize,
    skip,
  };
}

/*
 * ---------------------------------------------------------
 * BOOKING RESPONSE FORMAT
 * ---------------------------------------------------------
 *
 * Includes the fields needed by the seller dashboard:
 *
 * - Booking reference and type.
 * - Requested and confirmed dates.
 * - Customer details.
 * - Fulfillment details.
 * - Quotation and agreed price.
 * - Booking lifecycle timestamps.
 * - Latest conversation message.
 * - Message count.
 *
 * Private merchantNote is never returned.
 * ---------------------------------------------------------
 */

function formatBooking(
  booking: BookingRecord
) {
  return {
    id: booking.id,

    bookingCode: booking.bookingCode,

    serviceId: booking.serviceId,

    bookingType: booking.bookingType,

    status: booking.status,

    requestedFor:
      booking.requestedFor?.toISOString() ?? null,

    scheduledFor:
      booking.scheduledFor?.toISOString() ?? null,

    quantity: booking.quantity,

    contactPhone: booking.contactPhone,

    buyerMessage: booking.buyerMessage,

    fulfillmentType: booking.fulfillmentType,

    fulfillmentAddress: booking.fulfillmentAddress,

    quotedPrice: booking.quotedPrice,

    quoteMessage: booking.quoteMessage,

    quoteSentAt:
      booking.quoteSentAt?.toISOString() ?? null,

    agreedPrice: booking.agreedPrice,

    quoteAcceptedAt:
      booking.quoteAcceptedAt?.toISOString() ?? null,

    currency: booking.currency,

    declineReason: booking.declineReason,

    cancellationReason:
      booking.cancellationReason,

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

    createdAt:
      booking.createdAt.toISOString(),

    updatedAt:
      booking.updatedAt.toISOString(),

    buyer: {
      id: booking.buyer.id,
      name: booking.buyer.name,
    },

    service: booking.service,

    latestMessage: booking.messages[0]
      ? {
          id: booking.messages[0].id,
          body: booking.messages[0].body,
          senderId: booking.messages[0].senderId,

          readAt:
            booking.messages[0].readAt?.toISOString() ?? null,

          createdAt:
            booking.messages[0].createdAt.toISOString(),
        }
      : null,

    messageCount: booking._count.messages,
  };
}

/*
 * ---------------------------------------------------------
 * SELLER OWNERSHIP
 * ---------------------------------------------------------
 *
 * NEW BOOKINGS:
 * sellerId identifies the seller assigned when the
 * booking was created.
 *
 * LEGACY BOOKINGS:
 * sellerId may be null. In that case, ownership is
 * resolved through:
 *
 * ServiceBooking -> Service -> Business -> ownerId.
 *
 * Importantly, sellers with existing assigned bookings
 * do not need to own a current Business record to access
 * those bookings through their saved sellerId.
 * ---------------------------------------------------------
 */

function sellerBookingWhere(
  sellerId: string
): Prisma.ServiceBookingWhereInput {
  return {
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
 * =========================================================
 * GET /api/seller/service-bookings
 * =========================================================
 *
 * Returns incoming bookings belonging to the
 * authenticated seller.
 *
 * Supports:
 *
 * - All seven booking statuses.
 * - Optional service filtering.
 * - Pagination.
 * - Overall seller booking status summaries.
 * - Saved seller ownership.
 * - Legacy business-owner fallback.
 *
 * The summary is independent of the selected status,
 * service filter and current page.
 * =========================================================
 */

export async function GET(
  request: NextRequest
) {
  /*
   * RATE LIMITING
   */

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
    /*
     * AUTHENTICATION
     */

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
      return jsonError(
        "Please sign in to view your bookings.",
        401,
        rateLimit.headers
      );
    }

    /*
     * CONFIRM ACCOUNT
     */

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
      return jsonError(
        "Your account could not be found.",
        401,
        rateLimit.headers
      );
    }

    if (account.role !== "SELLER") {
      return jsonError(
        "A seller account is required to access incoming bookings.",
        403,
        rateLimit.headers
      );
    }

    /*
     * RESOLVE CURRENT BUSINESS
     *
     * This is optional because sellerId snapshots allow
     * sellers to retain access to previously assigned
     * bookings even if their current business ownership
     * relationship changes.
     *
     * The business is still returned for the dashboard
     * when one exists.
     */

    const business = await prisma.business.findUnique({
      where: {
        ownerId: account.id,
      },

      select: {
        id: true,
        name: true,
      },
    });

    /*
     * PAGINATION
     */

    const searchParams =
      request.nextUrl.searchParams;

    const pagination = parsePagination(
      searchParams
    );

    if (!pagination) {
      return jsonError(
        "Invalid pagination parameters.",
        400,
        rateLimit.headers
      );
    }

    /*
     * STATUS FILTER
     */

    const statusParam = (
      searchParams.get("status") ?? ""
    )
      .trim()
      .toUpperCase();

    if (
      statusParam &&
      statusParam !== "ALL" &&
      !ALLOWED_STATUSES.has(
        statusParam as ServiceBookingStatus
      )
    ) {
      return jsonError(
        "Invalid booking status filter.",
        400,
        rateLimit.headers
      );
    }

    /*
     * SERVICE FILTER
     */

    const serviceId = (
      searchParams.get("serviceId") ?? ""
    ).trim();

    if (
      serviceId.length > MAX_SERVICE_ID_LENGTH
    ) {
      return jsonError(
        "Invalid service ID.",
        400,
        rateLimit.headers
      );
    }

    /*
     * SELLER OWNERSHIP
     *
     * A seller can see:
     *
     * 1. Bookings explicitly assigned to their sellerId.
     * 2. Older bookings without sellerId belonging to
     *    their currently owned business.
     *
     * A booking assigned to another seller is excluded.
     */

    const sellerWhere = sellerBookingWhere(
      account.id
    );

    /*
     * FINAL BOOKING FILTER
     */

    const conditions: Prisma.ServiceBookingWhereInput[] = [
      sellerWhere,
    ];

    if (
      statusParam &&
      statusParam !== "ALL"
    ) {
      conditions.push({
        status: statusParam as ServiceBookingStatus,
      });
    }

    if (serviceId) {
      conditions.push({
        serviceId,
      });
    }

    const where: Prisma.ServiceBookingWhereInput = {
      AND: conditions,
    };

    /*
     * FETCH BOOKINGS AND SUMMARY
     *
     * The summary uses seller ownership only.
     *
     * It is not affected by:
     * - Status filter.
     * - Service filter.
     * - Pagination.
     */

    const [
      total,
      bookings,
      statusCounts,
    ] = await Promise.all([
      prisma.serviceBooking.count({
        where,
      }),

      prisma.serviceBooking.findMany({
        where,

        include: bookingInclude,

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        skip: pagination.skip,
        take: pagination.pageSize,
      }),

      prisma.serviceBooking.groupBy({
        by: ["status"],

        where: sellerWhere,

        _count: {
          _all: true,
        },
      }),
    ]);

    /*
     * BUILD STATUS COUNTS
     */

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
      0
    );

    /*
     * PAGINATION METADATA
     */

    const totalPages = Math.ceil(
      total / pagination.pageSize
    );

    /*
     * SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        bookings: bookings.map(formatBooking),

        seller: {
          businessId: business?.id ?? null,
          businessName: business?.name ?? null,
        },

        summary: {
          total: summaryTotal,
          ...counts,
        },

        page: pagination.page,
        pageSize: pagination.pageSize,

        total,
        totalPages,

        hasNextPage:
          pagination.page < totalPages,

        hasPreviousPage:
          pagination.page > 1 &&
          pagination.page <= totalPages,
      },

      {
        headers: responseHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error(
      "Seller service bookings API error:",
      error
    );

    return jsonError(
      "Unable to load incoming service bookings.",
      500,
      rateLimit.headers
    );
  }
}
