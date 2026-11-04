
import {
  ServiceBookingStatus,
  Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const MAX_DATABASE_OFFSET = 2_147_483_647;
const MAX_SERVICE_ID_LENGTH = 100;

const ALLOWED_STATUSES = new Set<ServiceBookingStatus>(
  Object.values(ServiceBookingStatus),
);

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
    orderBy: {
      createdAt: "desc",
    },
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

  if (page === null) return null;

  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );

  if (requestedPageSize === null) return null;

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
          readAt: booking.messages[0].readAt?.toISOString() ?? null,
          createdAt: booking.messages[0].createdAt.toISOString(),
        }
      : null,

    messageCount: booking._count.messages,
  };
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "request-read");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many booking requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
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

    // Confirm the account still exists and is not an admin.
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

    // Resolve the seller's own business from the authenticated account.
    const business = await prisma.business.findUnique({
      where: {
        ownerId: account.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!business) {
      return jsonError(
        "Complete your seller onboarding before accessing bookings.",
        403,
        rateLimit.headers,
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const pagination = parsePagination(searchParams);

    if (!pagination) {
      return jsonError(
        "Invalid pagination parameters.",
        400,
        rateLimit.headers,
      );
    }

    const statusParam = searchParams.get("status")?.trim() ?? "";
    const serviceId = searchParams.get("serviceId")?.trim() ?? "";

    if (
      statusParam &&
      statusParam !== "ALL" &&
      !ALLOWED_STATUSES.has(statusParam as ServiceBookingStatus)
    ) {
      return jsonError(
        "Invalid booking status filter.",
        400,
        rateLimit.headers,
      );
    }

    if (serviceId.length > MAX_SERVICE_ID_LENGTH) {
      return jsonError(
        "Invalid service ID.",
        400,
        rateLimit.headers,
      );
    }

    // Every booking must belong to a service owned by this seller.
    const where: Prisma.ServiceBookingWhereInput = {
      service: {
        is: {
          businessId: business.id,
        },
      },
      ...(statusParam && statusParam !== "ALL"
        ? {
            status: statusParam as ServiceBookingStatus,
          }
        : {}),
      ...(serviceId
        ? {
            serviceId,
          }
        : {}),
    };

    const [total, bookings, statusCounts] = await Promise.all([
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

      prisma.serviceBooking.groupBy({
        by: ["status"],
        where: {
          service: {
            is: {
              businessId: business.id,
            },
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pagination.pageSize);

    const counts = {
      PENDING: 0,
      ACCEPTED: 0,
      DECLINED: 0,
      CANCELLED: 0,
      COMPLETED: 0,
    };

    for (const item of statusCounts) {
      counts[item.status] = item._count._all;
    }

    return NextResponse.json(
      {
        bookings: bookings.map(formatBooking),

        seller: {
          businessId: business.id,
          businessName: business.name,
        },

        summary: {
          total: Object.values(counts).reduce(
            (sum, count) => sum + count,
            0,
          ),
          ...counts,
        },

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
    console.error("Seller service bookings API error:", error);

    return jsonError(
      "Unable to load incoming service bookings.",
      500,
      rateLimit.headers,
    );
  }
}
