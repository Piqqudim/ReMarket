import { NextRequest, NextResponse } from "next/server";
import { PATCH as legacyPATCH } from "./route-legacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SERVICES_FEATURE_ENABLED = false;

function responseHeaders(): Headers {
  const headers = new Headers();

  headers.set(
    "Cache-Control",
    "no-store, max-age=0, must-revalidate",
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");

  return headers;
}

function comingSoonResponse() {
  return NextResponse.json(
    {
      error: "Service bookings are coming soon.",
      code: "SERVICES_COMING_SOON",
    },
    {
      status: 503,
      headers: responseHeaders(),
    },
  );
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyPATCH(request, context);
}
