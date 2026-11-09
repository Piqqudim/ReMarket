import { NextRequest, NextResponse } from "next/server";
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
      error: "Seller service booking messages are coming soon.",
      feature: "seller-service-booking-messages",
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
   Set the feature switch to true to restore them.
--------------------------------------------------------- */

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyGET(request, context);
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyPOST(request, context);
}
