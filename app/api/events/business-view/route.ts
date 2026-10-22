import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { BusinessStatus, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { qualifyReferralForUser } from "@/lib/referrals";

const MAX_VISITOR_ID_LENGTH = 100;
const MAX_BUSINESS_ID_LENGTH = 100;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

function getResponseHeaders(
  rateLimitHeaders: Headers
): Headers {
  const headers = new Headers(rateLimitHeaders);

  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");

  return headers;
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

export async function POST(request: NextRequest) {
  /*
   * -----------------------------------------
   * RATE LIMIT
   * -----------------------------------------
   *
   * Keep the existing public endpoint rate limit.
   * Referral qualification must not be exposed as
   * a separate client-controlled operation.
   */

  const rateLimit = checkPublicRateLimit(
    request,
    "business-view-event"
  );

  const responseHeaders = () =>
    getResponseHeaders(rateLimit.headers);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many view events. Please try again shortly.",
      },
      {
        status: 429,
        headers: responseHeaders(),
      }
    );
  }

  try {
    /*
     * -----------------------------------------
     * READ AND VALIDATE REQUEST BODY
     * -----------------------------------------
     *
     * Read the body as text first so the application
     * can check its actual UTF-8 byte length before
     * parsing the JSON.
     */

    let rawBody: string;

    try {
      rawBody = await request.text();
    } catch {
      return NextResponse.json(
        {
          error: "Unable to read request body.",
        },
        {
          status: 400,
          headers: responseHeaders(),
        }
      );
    }

    if (
      Buffer.byteLength(rawBody, "utf8") >
      MAX_REQUEST_BODY_BYTES
    ) {
      return NextResponse.json(
        {
          error: "Request body is too large.",
        },
        {
          status: 413,
          headers: responseHeaders(),
        }
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON body.",
        },
        {
          status: 400,
          headers: responseHeaders(),
        }
      );
    }

    if (!isRecord(body)) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
        },
        {
          status: 400,
          headers: responseHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * READ ALLOWED FIELDS
     * -----------------------------------------
     *
     * Never use a userId supplied by the browser.
     * Authenticated identity must come from NextAuth.
     *
     * visitorId remains supported for existing
     * anonymous analytics.
     */

    const businessId = cleanString(body.businessId);
    const visitorId = cleanString(body.visitorId);

    /*
     * -----------------------------------------
     * VALIDATE BUSINESS ID
     * -----------------------------------------
     */

    if (!businessId) {
      return NextResponse.json(
        {
          error: "Business ID is required.",
        },
        {
          status: 400,
          headers: responseHeaders(),
        }
      );
    }

    if (
      businessId.length >
      MAX_BUSINESS_ID_LENGTH
    ) {
      return NextResponse.json(
        {
          error: "Invalid business ID.",
        },
        {
          status: 400,
          headers: responseHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE VISITOR ID
     * -----------------------------------------
     */

    if (!visitorId) {
      return NextResponse.json(
        {
          error: "Visitor ID is required.",
        },
        {
          status: 400,
          headers: responseHeaders(),
        }
      );
    }

    if (
      visitorId.length >
      MAX_VISITOR_ID_LENGTH
    ) {
      return NextResponse.json(
        {
          error: "Invalid visitor ID.",
        },
        {
          status: 400,
          headers: responseHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * VERIFY PUBLIC BUSINESS
     * -----------------------------------------
     *
     * Only active, non-deleted businesses receive
     * public view events.
     *
     * ownerId is also loaded so a buyer's own
     * business view cannot qualify their referral.
     */

    const business = await prisma.business.findFirst({
      where: {
        id: businessId,
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      },

      select: {
        id: true,
        ownerId: true,
      },
    });

    if (!business) {
      return NextResponse.json(
        {
          error: "Business not found.",
        },
        {
          status: 404,
          headers: responseHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * RESOLVE AUTHENTICATED BUYER
     * -----------------------------------------
     *
     * Only the verified session can identify the
     * buyer associated with a referral-qualifying view.
     *
     * Anonymous visitors and non-buyer accounts
     * remain supported for normal analytics.
     */

    let authenticatedBuyerId: string | null = null;

    try {
      const session = await getServerSession(
        authOptions
      );

      if (
        session?.user?.role === Role.BUYER &&
        typeof session.user.id === "string" &&
        session.user.id.length > 0
      ) {
        authenticatedBuyerId = session.user.id;
      }
    } catch (sessionError) {
      /*
       * Preserve ordinary public analytics if session
       * resolution fails. The event will be anonymous
       * and will not qualify a buyer referral.
       */

      console.error(
        "Business view session resolution error:",
        sessionError
      );
    }

    /*
     * -----------------------------------------
     * EXCLUDE SELF-OWNED BUSINESS VIEWS
     * -----------------------------------------
     *
     * Keep the view for anonymous analytics, but do
     * not associate a buyer's own business view with
     * their authenticated referral-qualification count.
     */

    if (
      authenticatedBuyerId &&
      business.ownerId === authenticatedBuyerId
    ) {
      authenticatedBuyerId = null;
    }

    /*
     * -----------------------------------------
     * CREATE BUSINESS VIEW EVENT
     * -----------------------------------------
     *
     * Save the analytics event before attempting
     * qualification.
     *
     * A browser-supplied userId is never stored.
     */

    const event = await prisma.businessViewEvent.create({
      data: {
        businessId,
        visitorId,

        ...(authenticatedBuyerId
          ? {
              userId: authenticatedBuyerId,
            }
          : {}),
      },

      select: {
        id: true,
        businessId: true,
        createdAt: true,
      },
    });

    /*
     * -----------------------------------------
     * CHECK BUYER REFERRAL QUALIFICATION
     * -----------------------------------------
     *
     * The referral service remains responsible for:
     *
     * - verifying the referral is still pending;
     * - checking the current user roles;
     * - requiring three distinct active businesses;
     * - changing the referral to QUALIFIED;
     * - recording the applicable buyer milestone;
     * - preventing duplicate rewards.
     *
     * Failure here must not invalidate the successfully
     * recorded business-view event.
     */

    if (authenticatedBuyerId) {
      try {
        await qualifyReferralForUser(
          authenticatedBuyerId,
          "BUYER"
        );
      } catch (qualificationError) {
        console.error(
          "Buyer referral qualification error:",
          qualificationError
        );
      }
    }

    /*
     * -----------------------------------------
     * SUCCESS
     * -----------------------------------------
     *
     * Do not expose visitorId or userId in the response.
     */

    return NextResponse.json(
      {
        success: true,
        event,
      },
      {
        status: 201,
        headers: responseHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Business view event error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to record business view.",
      },
      {
        status: 500,
        headers: responseHeaders(),
      }
    );
  }
}