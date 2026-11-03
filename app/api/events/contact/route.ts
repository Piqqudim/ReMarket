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

type ContactPlatform = (typeof PLATFORMS)[number];

type ContactEventBody = {
  businessId?: unknown;
  requestId?: unknown;
  platform?: unknown;
};

const MAX_BODY_BYTES = 4 * 1024;
const MAX_BUSINESS_ID_LENGTH = 100;
const MAX_REQUEST_ID_LENGTH = 100;

function getResponseHeaders(rateLimitHeaders: Headers): Headers {
  const headers = new Headers(rateLimitHeaders);
  headers.set("Cache-Control", "no-store");
  return headers;
}

function isContactPlatform(value: string): value is ContactPlatform {
  return (PLATFORMS as readonly string[]).includes(value);
}

function jsonError(
  message: string,
  status: number,
  rateLimitHeaders: Headers
) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: getResponseHeaders(rateLimitHeaders),
    }
  );
}

export async function POST(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "contact-event");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many contact events. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  try {
    const contentLength = Number(request.headers.get("content-length"));

    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_BODY_BYTES
    ) {
      return jsonError(
        "Request body is too large.",
        413,
        rateLimit.headers
      );
    }

    const rawBody = await request.text();
    const actualBodyBytes = new TextEncoder().encode(rawBody).byteLength;

    if (actualBodyBytes > MAX_BODY_BYTES) {
      return jsonError(
        "Request body is too large.",
        413,
        rateLimit.headers
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON body.", 400, rateLimit.headers);
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return jsonError("Invalid request body.", 400, rateLimit.headers);
    }

    const data = body as ContactEventBody;

    if (typeof data.businessId !== "string") {
      return jsonError("Business ID is required.", 400, rateLimit.headers);
    }

    const businessId = data.businessId.trim();

    if (
      !businessId ||
      businessId.length > MAX_BUSINESS_ID_LENGTH
    ) {
      return jsonError("Invalid business ID.", 400, rateLimit.headers);
    }

    let requestId: string | null = null;

    if (data.requestId !== undefined && data.requestId !== null) {
      if (typeof data.requestId !== "string") {
        return jsonError("Invalid request ID.", 400, rateLimit.headers);
      }

      requestId = data.requestId.trim() || null;

      if (
        requestId &&
        requestId.length > MAX_REQUEST_ID_LENGTH
      ) {
        return jsonError("Invalid request ID.", 400, rateLimit.headers);
      }
    }

    if (typeof data.platform !== "string") {
      return jsonError("Invalid contact platform.", 400, rateLimit.headers);
    }

    const platformValue = data.platform.trim().toUpperCase();

    if (!isContactPlatform(platformValue)) {
      return jsonError("Invalid contact platform.", 400, rateLimit.headers);
    }

    // Only active, non-soft-deleted businesses receive new contact events.
    const business = await prisma.business.findFirst({
      where: {
        id: businessId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!business) {
      return jsonError("Business not found.", 404, rateLimit.headers);
    }

    // A request-linked event is accepted only for a real business/request match.
    if (requestId) {
      const match = await prisma.match.findUnique({
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
        return jsonError(
          "Business is not matched to this request.",
          400,
          rateLimit.headers
        );
      }
    }

    const event = await prisma.contactEvent.create({
      data: {
        businessId,
        requestId,
        platform: platformValue,
      },
      select: {
        id: true,
        businessId: true,
        requestId: true,
        platform: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { success: true, event },
      {
        status: 201,
        headers: getResponseHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error("Contact event error:", error);

    return NextResponse.json(
      { error: "Unable to record contact event." },
      {
        status: 500,
        headers: getResponseHeaders(rateLimit.headers),
      }
    );
  }
}
