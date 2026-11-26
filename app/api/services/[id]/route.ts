import { NextResponse } from "next/server";

const noStore = { "Cache-Control": "no-store, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff" };
function unavailable() {
  return NextResponse.json(
    { error: "Services and service bookings are not currently available on ReMarket." },
    { status: 404, headers: noStore },
  );
}

export async function GET() { return unavailable(); }
