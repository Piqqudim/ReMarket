
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { qualifyReferralForUser } from "@/lib/referrals";

const MAX_VISITOR_ID_LENGTH = 100;
const MAX_BUSINESS_ID_LENGTH = 100;

function getResponseHeaders(
  rateLimitHeaders: Headers
): Headers {
  const headers = new Headers(rateLimitHeaders);

  headers.set("Cache-Control", "no-store");

  return headers;
}

export async function POST(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(
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
        headers: getResponseHeaders(rateLimit.headers),
      }
    );
  }

  try {
    let body: unknown;

    /*
     * PARSE REQUEST BODY
     */

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        {
          status: 400,
          headers: getResponseHeaders(rateLimit.headers),
        }
      );
    }

    /*
     * VALIDATE REQUEST BODY
     */

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { error: "Invalid request body" },
        {
          status: 400,
          headers: getResponseHeaders(rateLimit.headers),
        }
      );
    }

    const data = body as Record<string, unknown>;

    /*
     * READ ALLOWED FIELDS
     *
     * A userId supplied by the client is deliberately
     * ignored. Authenticated identity comes from the
     * server-verified session.
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
     * VALIDATE BUSINESS ID
     */

    if (!businessId) {
      return NextResponse.json(
        { error: "Business ID is required" },
        {
          status: 400,
          headers: getResponseHeaders(rateLimit.headers),
        }
      );
    }

    if (businessId.length > MAX_BUSINESS_ID_LENGTH) {
      return NextResponse.json(
        { error: "Invalid business ID" },
        {
          status: 400,
          headers: getResponseHeaders(rateLimit.headers),
        }
      );
    }

    /*
     * VALIDATE VISITOR ID
     *
     * Keep client-generated visitor IDs for compatibility
     * with existing anonymous analytics.
     */

    if (!visitorId) {
      return NextResponse.json(
        { error: "Visitor ID is required" },
        {
          status: 400,
          headers: getResponseHeaders(rateLimit.headers),
        }
      );
    }

    if (visitorId.length > MAX_VISITOR_ID_LENGTH) {
      return NextResponse.json(
        { error: "Invalid visitor ID" },
        {
          status: 400,
          headers: getResponseHeaders(rateLimit.headers),
        }
      );
    }

    /*
     * VERIFY BUSINESS
     *
     * Only active, non-soft-deleted businesses
     * may receive view events.
     */

    const business = await prisma.business.findFirst({
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
        { error: "Business not found" },
        {
          status: 404,
          headers: getResponseHeaders(rateLimit.headers),
        }
      );
    }

    /*
     * RESOLVE AUTHENTICATED BUYER
     *
     * Only a buyer's server-verified identity is
     * associated with a view for buyer-referral
     * qualification. Anonymous visitors and other
     * roles continue to be tracked without userId.
     */

    let authenticatedBuyerId: string | null = null;

    try {
      const session = await getServerSession(authOptions);

      if (
        session?.user?.role === "BUYER" &&
        typeof session.user.id === "string" &&
        session.user.id.length > 0
      ) {
        authenticatedBuyerId = session.user.id;
      }
    } catch (sessionError) {
      /*
       * Preserve public analytics if session resolution
       * fails. This event will be recorded anonymously,
       * so it cannot qualify a buyer referral.
       */
      console.error(
        "Business view session resolution error:",
        sessionError
      );
    }

    /*
     * CREATE BUSINESS VIEW EVENT
     *
     * Anonymous events preserve the existing behavior.
     * Authenticated buyer events include the server-derived
     * userId required for referral qualification.
     */

    const event = await prisma.businessViewEvent.create({
      data: {
        businessId,
        visitorId,
        ...(authenticatedBuyerId
          ? { userId: authenticatedBuyerId }
          : {}),
      },
      select: {
        id: true,
        businessId: true,
        createdAt: true,
      },
    });

    /*
     * CHECK BUYER REFERRAL QUALIFICATION
     *
     * The referral service is responsible for applying
     * the configured qualification rules, including
     * distinct business views and idempotent rewards.
     *
     * Keep qualification failure separate from event
     * creation so a referral-service error does not
     * invalidate an already-recorded view.
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
     * SUCCESS
     *
     * Do not return visitorId or userId.
     */

    return NextResponse.json(
      {
        success: true,
        event,
      },
      {
        status: 201,
        headers: getResponseHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error("Business view event error:", error);

    return NextResponse.json(
      {
        error: "Unable to record business view",
      },
      {
        status: 500,
        headers: getResponseHeaders(rateLimit.headers),
      }
    );
  }
}
