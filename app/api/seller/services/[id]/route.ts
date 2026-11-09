import { NextResponse } from "next/server";
import {
  GET as legacyGET,
  PATCH as legacyPATCH,
  DELETE as legacyDELETE,
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
   ROUTE CONTEXT
--------------------------------------------------------- */

type RouteContext = {
  params: Promise<{ id: string }>;
};

/* ---------------------------------------------------------
   ROUTE HANDLERS

   Keep the original handlers in route-legacy.ts.
   Set the feature switch to true to restore them.
--------------------------------------------------------- */

export async function GET(
  request: Request,
  context: RouteContext,
) {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyGET(request, context);
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyPATCH(request, context);
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  if (!SERVICES_FEATURE_ENABLED) {
    return comingSoonResponse();
  }

  return legacyDELETE(request, context);
}
