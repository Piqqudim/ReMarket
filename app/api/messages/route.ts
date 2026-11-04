
import {
  Prisma,
  ServiceBookingStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_OFFSET = 2_147_483_647;
const MAX_ID_LENGTH = 100;

const ALLOWED_STATUSES = new Set<ServiceBookingStatus>(
  Object.values(ServiceBookingStatus),
);

const inboxInclude = {
  service: {
    select: {
      id: true,
      name: true,
      imageUrl: true,
      business: {
        select: {
          id: true,
          ownerId: true,
          name: true,
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
      sender: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: 1,
  },
} satisfies Prisma.ServiceBookingInclude;

type InboxBooking = Prisma.ServiceBookingGetPayload<{
  include: typeof inboxInclude;
}>;

type Account = {
  id: string;
  role: "BUYER" | "SELLER";
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
    {
      conversations: [],
      total: 0,
      error: message,
    },
    {
      status,
      headers: responseHeaders(baseHeaders),
    },
  );
}

async function getAuthenticatedAccount(): Promise<{
  account: Account | null;
  error: string | null;
  status: number;
}> {
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
      error: "Please sign in to view your messages.",
      status: 401,
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!user) {
    return {
      account: null,
      error: "Your account could not be found.",
      status: 401,
    };
  }

  if (user.role !== "BUYER" && user.role !== "SELLER") {
    return {
      account: null,
      error: "This account cannot access messages.",
      status: 403,
    };
  }

  return {
    account: {
      id: user.id,
      role: user.role,
    },
    error: null,
    status: 200,
  };
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

  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );

  if (page === null || requestedPageSize === null) {
    return null;
  }

  const pageSize = Math.min(
    requestedPageSize,
    MAX_PAGE_SIZE,
  );

  const skip = (page - 1) * pageSize;

  if (!Number.isSafeInteger(skip) || skip > MAX_OFFSET) {
    return null;
  }

  return { page, pageSize, skip };
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "request-read");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many message requests. Please try again shortly.",
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

    const searchParams = request.nextUrl.searchParams;
    const pagination = parsePagination(searchParams);

    if (!pagination) {
      return jsonError(
        "Invalid pagination parameters.",
        400,
        rateLimit.headers,
      );
    }

    const view = searchParams.get("view")?.trim() || "ALL";
    const statusFilter = searchParams.get("status")?.trim() || "";
    const unreadFilter = searchParams.get("unread")?.trim() || "";
    const bookingId = searchParams.get("bookingId")?.trim() || "";

    if (!["ALL", "BUYING", "SELLING"].includes(view)) {
      return jsonError(
        "Invalid conversation view.",
        400,
        rateLimit.headers,
      );
    }

    if (
      statusFilter &&
      statusFilter !== "ALL" &&
      !ALLOWED_STATUSES.has(statusFilter as ServiceBookingStatus)
    ) {
      return jsonError(
        "Invalid booking status.",
        400,
        rateLimit.headers,
      );
    }

    if (unreadFilter && !["true", "false"].includes(unreadFilter)) {
      return jsonError(
        "Unread filter must be true or false.",
        400,
        rateLimit.headers,
      );
    }

    if (bookingId.length > MAX_ID_LENGTH) {
      return jsonError(
        "Invalid booking ID.",
        400,
        rateLimit.headers,
      );
    }

    const buyerCondition: Prisma.ServiceBookingWhereInput = {
      buyerId: account.id,
    };

    const sellerCondition: Prisma.ServiceBookingWhereInput = {
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

    const participantCondition: Prisma.ServiceBookingWhereInput =
      view === "BUYING"
        ? buyerCondition
        : view === "SELLING"
          ? sellerCondition
          : {
              OR: [
                buyerCondition,
                sellerCondition,
              ],
            };

    const conditions: Prisma.ServiceBookingWhereInput[] = [
      participantCondition,
    ];

    if (statusFilter && statusFilter !== "ALL") {
      conditions.push({
        status: statusFilter as ServiceBookingStatus,
      });
    }

    if (unreadFilter === "true") {
      conditions.push({
        messages: {
          some: {
            senderId: {
              not: account.id,
            },
            readAt: null,
          },
        },
      });
    }

    if (bookingId) {
      conditions.push({
        id: bookingId,
      });
    }

    const where: Prisma.ServiceBookingWhereInput = {
      AND: conditions,
    };

    // Count unread messages across the user's entire inbox,
    // regardless of the selected view or filters.
    const unreadWhere: Prisma.ServiceBookingMessageWhereInput = {
      senderId: {
        not: account.id,
      },
      readAt: null,
      booking: {
        is: participantCondition,
      },
    };

    const [
      total,
      bookings,
      totalUnreadMessages,
    ] = await Promise.all([
      prisma.serviceBooking.count({ where }),

      prisma.serviceBooking.findMany({
        where,
        include: inboxInclude,
        orderBy: [
          { updatedAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),

      prisma.serviceBookingMessage.count({
        where: unreadWhere,
      }),
    ]);

    const bookingIds = bookings.map((booking) => booking.id);

    // Calculate unread counts separately for each conversation.
    const unreadGroups = bookingIds.length > 0
      ? await prisma.serviceBookingMessage.groupBy({
          by: ["bookingId"],
          where: {
            bookingId: {
              in: bookingIds,
            },
            senderId: {
              not: account.id,
            },
            readAt: null,
          },
          _count: {
            _all: true,
          },
        })
      : [];

    const unreadCountMap = new Map(
      unreadGroups.map((group) => [
        group.bookingId,
        group._count._all,
      ]),
    );

    const conversations = bookings.map(
      (booking: InboxBooking) => {
        const isBuyer = booking.buyerId === account.id;
        const business = booking.service.business;

        const latestMessage = booking.messages[0] ?? null;

        const counterpart = isBuyer
          ? {
              type: "SELLER" as const,
              id: business.id,
              name: business.name,
              imageUrl: business.imageUrl,
              verification: business.verification,
              verified: business.verification === "VERIFIED",
              location: business.location,
            }
          : {
              type: "BUYER" as const,
              id: booking.buyer.id,
              name: booking.buyer.name,
              imageUrl: null,
              verification: null,
              verified: false,
              location: null,
            };

        return {
          id: booking.id,
          status: booking.status,
          participantRole: isBuyer ? "BUYER" : "SELLER",
          unreadCount: unreadCountMap.get(booking.id) ?? 0,

          service: {
            id: booking.service.id,
            name: booking.service.name,
            imageUrl: booking.service.imageUrl,
          },

          counterpart,

          latestMessage: latestMessage
            ? {
                id: latestMessage.id,
                body: latestMessage.body,
                senderId: latestMessage.senderId,
                senderName: latestMessage.sender.name,
                isMine: latestMessage.senderId === account.id,
                createdAt: latestMessage.createdAt.toISOString(),
              }
            : null,

          createdAt: booking.createdAt.toISOString(),
          updatedAt: booking.updatedAt.toISOString(),
        };
      },
    );

    const totalPages = Math.ceil(total / pagination.pageSize);

    return NextResponse.json(
      {
        conversations,
        summary: {
          totalConversations: total,
          unreadMessages: totalUnreadMessages,
        },
        filters: {
          view,
          status: statusFilter || "ALL",
          unread: unreadFilter === "true",
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
    console.error("Global Messages API error:", error);

    return jsonError(
      "Unable to load your conversations.",
      500,
      rateLimit.headers,
    );
  }
}
