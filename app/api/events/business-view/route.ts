import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_VISITOR_ID_LENGTH = 100;
const MAX_BUSINESS_ID_LENGTH = 100;

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
      "business-view-event"
    );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many view events. Please try again shortly.",
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
     * VALIDATE REQUEST BODY
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

    const visitorId =
      typeof data.visitorId === "string"
        ? data.visitorId.trim()
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
     * VALIDATE VISITOR ID
     * -----------------------------------------
     *
     * The visitor ID remains client-generated
     * for compatibility with the existing
     * analytics implementation.
     */

    if (!visitorId) {
      return NextResponse.json(
        {
          error: "Visitor ID is required",
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
      visitorId.length >
      MAX_VISITOR_ID_LENGTH
    ) {
      return NextResponse.json(
        {
          error: "Invalid visitor ID",
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
     * Only active, non-soft-deleted businesses
     * may receive view events.
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
     * CREATE BUSINESS VIEW EVENT
     * -----------------------------------------
     */

    const event =
      await prisma.businessViewEvent.create({
        data: {
          businessId,
          visitorId,
        },

        select: {
          id: true,
          businessId: true,
          createdAt: true,
        },
      });

    /*
     * -----------------------------------------
     * SUCCESS
     * -----------------------------------------
     *
     * visitorId is intentionally not returned.
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
      "Business view event error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to record business view",
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