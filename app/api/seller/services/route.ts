import { NextResponse } from "next/server";
import {
  GET as legacyGET,
  POST as legacyPOST,
} from "./route-legacy";

/* ---------------------------------------------------------
   SERVICE FEATURE SWITCH
--------------------------------------------------------- */

const SERVICES_FEATURE_ENABLED = false;

/* ---------------------------------------------------------
   COMING SOON RESPONSE
--------------------------------------------------------- */

function comingSoonResponse() {
  return NextResponse.json(
    {
      error: "Seller services are coming soon.",
      feature: "seller-services",
    },
    {
      status: 503,
      headers: {
        "Cache-Control":
          "private, no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/* ---------------------------------------------------------
   ROUTE HANDLERS

   Original handlers stay in route-legacy.ts.
   Set the switch to true to restore them.
--------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyGET();
}

export async function POST(request: Request) {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyPOST(request);
}
