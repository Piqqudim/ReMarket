import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import {
  GET as legacyGET,
  POST as legacyPOST,
} from "./route-legacy";

/*
 * Keep service bookings paused until the feature is ready.
 *
 * The original GET and POST handlers remain in route-legacy.ts.
 * Set this to true when service bookings are ready to launch.
 */
const SERVICES_FEATURE_ENABLED = false;

function comingSoonResponse() {
  const headers = new Headers();

  headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return NextResponse.json(
    {
      error: "Service bookings are coming soon.",
      code: "SERVICES_COMING_SOON",
    },
    {
      status: 503,
      headers,
    },
  );
}

export async function GET(request: NextRequest) {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyGET(request);
}

export async function POST(request: NextRequest) {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyPOST(request);
}
