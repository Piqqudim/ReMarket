import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGet } from "./route-legacy";
import { checkPublicRateLimit } from "@/lib/rate-limit";

/*
 * Keep this disabled until Services launches.
 * The previous route must be saved as route-legacy.ts.
 */
const SERVICES_FEATURE_ENABLED = false;

function noStoreHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);
  headers.set(
    "Cache-Control",
    "no-store, max-age=0, must-revalidate",
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}

function comingSoonResponse(headers?: HeadersInit) {
  return NextResponse.json(
    {
      service: null,
      error: "Services are coming soon.",
      code: "SERVICES_COMING_SOON",
    },
    {
      status: 503,
      headers: noStoreHeaders(headers),
    },
  );
}

function rateLimitResponse(headers?: HeadersInit) {
  return NextResponse.json(
    {
      service: null,
      error: "Too many service requests. Please try again shortly.",
    },
    {
      status: 429,
      headers: noStoreHeaders(headers),
    },
  );
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  if (SERVICES_FEATURE_ENABLED) {
    return legacyGet(request, context);
  }

  const rateLimit = checkPublicRateLimit(
    request,
    "featured",
  );

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.headers);
  }

  return comingSoonResponse(rateLimit.headers);
}
