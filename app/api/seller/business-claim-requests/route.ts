import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "no-store, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff" };
function unavailable() {
  return NextResponse.json(
    { error: "Business claims are not currently available on ReMarket." },
    { status: 404, headers: noStore },
  );
}

/** Seller business-claim endpoints are intentionally disabled for this release. */
export async function GET() { return unavailable(); }
export async function POST() { return unavailable(); }
