
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";

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
      unreadMessages: 0,
      unreadConversations: 0,
      hasUnreadMessages: false,
      error: message,
    },
    {
      status,
      headers: responseHeaders(baseHeaders),
    },
  );
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "request-read");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many requests. Please try again shortly.",
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
        "Please sign in to view your messages.",
        401,
        rateLimit.headers,
      );
    }

    const account = await prisma.user.findUnique({
      where: { id: sessionUser.id },
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

    if (account.role !== "BUYER" && account.role !== "SELLER") {
      return jsonError(
        "This account cannot access messages.",
        403,
        rateLimit.headers,
      );
    }

    // A user can participate as a buyer, a seller, or both.
    const participantWhere: Prisma.ServiceBookingWhereInput = {
      OR: [
        {
          buyerId: account.id,
        },
        {
          service: {
            is: {
              business: {
                is: {
                  ownerId: account.id,
                },
              },
            },
          },
        },
      ],
    };

    const unreadMessageWhere: Prisma.ServiceBookingMessageWhereInput = {
      senderId: {
        not: account.id,
      },
      readAt: null,
      booking: {
        is: participantWhere,
      },
    };

    const [unreadMessages, unreadConversations] = await Promise.all([
      prisma.serviceBookingMessage.count({
        where: unreadMessageWhere,
      }),

      prisma.serviceBooking.count({
        where: {
          ...participantWhere,
          messages: {
            some: {
              senderId: {
                not: account.id,
              },
              readAt: null,
            },
          },
        },
      }),
    ]);

    return NextResponse.json(
      {
        unreadMessages,
        unreadConversations,
        hasUnreadMessages: unreadMessages > 0,
      },
      {
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Unread messages count API error:", error);

    return jsonError(
      "Unable to load unread message count.",
      500,
      rateLimit.headers,
    );
  }
}
