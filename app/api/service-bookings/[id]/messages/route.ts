import { NextRequest, NextResponse } from "next/server";
import { checkPublicRateLimit } from "@/lib/rate-limit";

import {
  GET as legacyGET,
  POST as legacyPOST,
} from "./route-legacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICES_FEATURE_ENABLED = false;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function responseHeaders(
  baseHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");

  return headers;
}

function comingSoonResponse(
  rateLimitHeaders?: HeadersInit,
) {
  return NextResponse.json(
    {
      error: "Service bookings and messages are coming soon.",
      code: "SERVICES_COMING_SOON",
    },
    {
      status: 503,
      headers: responseHeaders(rateLimitHeaders),
    },
  );
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  if (!SERVICES_FEATURE_ENABLED) {
    const limit = checkPublicRateLimit(
      request,
      "request-read",
    );

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: "Too many requests. Please try again shortly.",
        },
        {
          status: 429,
          headers: responseHeaders(limit.headers),
        },
      );
    }

    return comingSoonResponse(limit.headers);
  }

  return legacyGET(request, context);
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  if (!SERVICES_FEATURE_ENABLED) {
    const limit = checkPublicRateLimit(
      request,
      "request-create",
    );

    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: "Too many messages. Please try again shortly.",
        },
        {
          status: 429,
          headers: responseHeaders(limit.headers),
        },
      );
    }

    return comingSoonResponse(limit.headers);
  }

  return legacyPOST(request, context);
}
