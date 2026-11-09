import { NextRequest, NextResponse } from "next/server";

import { GET as legacyGET } from "./route-legacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/*
 * Keep the existing seller booking implementation in
 * route-legacy.ts. This route pauses access without
 * deleting any booking data or business logic.
 */
const SERVICES_FEATURE_ENABLED = false;

function responseHeaders(): Headers {
  const headers = new Headers();

  headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate",
  );
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return headers;
}

export async function GET(request: NextRequest) {
  if (!SERVICES_FEATURE_ENABLED) {
    return NextResponse.json(
      {
        bookings: [],
        total: 0,
        error: "Seller service bookings are coming soon.",
      },
      {
        status: 503,
        headers: responseHeaders(),
      },
    );
  }

  return legacyGET(request);
}
