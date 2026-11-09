import { NextRequest, NextResponse } from "next/server";
import { checkPublicRateLimit } from "@/lib/rate-limit";

/* Keep this false until Services is ready to launch. */
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

export async function GET(request: NextRequest) {
  if (SERVICES_FEATURE_ENABLED) {
    const legacyRoute = await import("./route-legacy");
    return legacyRoute.GET(request);
  }

  const rateLimit = checkPublicRateLimit(request, "search");

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        services: [],
        comingSoon: true,
        featureEnabled: false,
        error: "Too many service requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: noStoreHeaders(rateLimit.headers),
      },
    );
  }

  return NextResponse.json(
    {
      services: [],
      comingSoon: true,
      featureEnabled: false,
      error: "Services are coming soon. Please check back later.",
    },
    {
      status: 503,
      headers: noStoreHeaders(rateLimit.headers),
    },
  );
}
