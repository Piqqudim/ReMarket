import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const PLATFORMS = [
  "WHATSAPP",
  "INSTAGRAM",
  "TIKTOK",
  "FACEBOOK",
  "PHONE",
  "DIRECTIONS",
] as const;

type ContactPlatform =
  (typeof PLATFORMS)[number];

const MAX_BUSINESS_ID_LENGTH = 100;
const MAX_REQUEST_ID_LENGTH = 100;

function getResponseHeaders(
  rateLimitHeaders: Headers
): Headers {
  const headers =
    new Headers(rateLimitHeaders);

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return headers;
}

export async function POST(
  request: NextRequest
) {
  const rateLimit =
    checkPublicRateLimit(
      request,
      "contact-event"
    );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many contact events. Please try again shortly.",
      },
      {
        status: 429,
        headers: getResponseHeaders(
          rateLimit.headers
        ),
      }
    );
  }

  try {
    let body: unknown;

    /*
     * -----------------------------------------
     * PARSE REQUEST BODY
     * -----------------------------------------
     */

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON body",
        },
        {
          status: 400,
          headers: getResponseHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE BODY
     * -----------------------------------------
     */

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error: "Invalid request body",
        },
        {
          status: 400,
          headers: getResponseHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    const data =
      body as Record<string, unknown>;

    /*
     * -----------------------------------------
     * READ FIELDS
     * -----------------------------------------
     */

    const businessId =
      typeof data.businessId === "string"
        ? data.businessId.trim()
        : "";

    const requestId =
      typeof data.requestId === "string"
        ? data.requestId.trim() || null
        : null;

    const platform =
      typeof data.platform === "string"
        ? data.platform.trim().toUpperCase()
        : "";

    /*
     * -----------------------------------------
     * VALIDATE BUSINESS ID
     * -----------------------------------------
     */

    if (!businessId) {
      return NextResponse.json(
        {
          error: "Business ID is required",
        },
        {
          status: 400,
          headers: getResponseHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    if (
      businessId.length >
      MAX_BUSINESS_ID_LENGTH
    ) {
      return NextResponse.json(
        {
          error: "Invalid business ID",
        },
        {
          status: 400,
          headers: getResponseHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE REQUEST ID
     * -----------------------------------------
     */

    if (
      requestId &&
      requestId.length >
        MAX_REQUEST_ID_LENGTH
    ) {
      return NextResponse.json(
        {
          error: "Invalid request ID",
        },
        {
          status: 400,
          headers: getResponseHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE CONTACT PLATFORM
     * -----------------------------------------
     */

    if (
      !PLATFORMS.includes(
        platform as ContactPlatform
      )
    ) {
      return NextResponse.json(
        {
          error: "Invalid contact platform",
        },
        {
          status: 400,
          headers: getResponseHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    /*
     * -----------------------------------------
     * VERIFY BUSINESS
     * -----------------------------------------
     *
     * Only active, non-soft-deleted
     * businesses may receive contact events.
     */

    const business =
      await prisma.business.findFirst({
        where: {
          id: businessId,
          status: "ACTIVE",
          deletedAt: null,
        },

        select: {
          id: true,
        },
      });

    if (!business) {
      return NextResponse.json(
        {
          error: "Business not found",
        },
        {
          status: 404,
          headers: getResponseHeaders(
            rateLimit.headers
          ),
        }
      );
    }

    /*
     * -----------------------------------------
     * VERIFY REQUEST WHEN PROVIDED
     * -----------------------------------------
     *
     * A request-linked contact event is valid
     * only when the business is actually matched
     * to that buyer request.
     */

    if (requestId) {
      const match =
        await prisma.match.findUnique({
          where: {
            requestId_businessId: {
              requestId,
              businessId,
            },
          },

          select: {
            requestId: true,
            businessId: true,
          },
        });

      if (!match) {
        return NextResponse.json(
          {
            error:
              "Business is not matched to this request",
          },
          {
            status: 400,
            headers:
              getResponseHeaders(
                rateLimit.headers
              ),
          }
        );
      }
    }

    /*
     * -----------------------------------------
     * CREATE CONTACT EVENT
     * -----------------------------------------
     */

    const event =
      await prisma.contactEvent.create({
        data: {
          businessId,
          requestId,
          platform:
            platform as ContactPlatform,
        },

        select: {
          id: true,
          businessId: true,
          requestId: true,
          platform: true,
          createdAt: true,
        },
      });

    /*
     * -----------------------------------------
     * SUCCESS
     * -----------------------------------------
     */

    return NextResponse.json(
      {
        success: true,
        event,
      },
      {
        status: 201,
        headers: getResponseHeaders(
          rateLimit.headers
        ),
      }
    );
  } catch (error) {
    console.error(
      "Contact event error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to record contact event",
      },
      {
        status: 500,
        headers: getResponseHeaders(
          rateLimit.headers
        ),
      }
    );
  }
}