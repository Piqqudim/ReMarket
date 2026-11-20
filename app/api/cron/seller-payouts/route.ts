import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runSellerPayoutQueue } from "@/lib/seller-settlement";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length).trim();
  const expectedBytes = Buffer.from(secret, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

async function handle(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503, headers: noStore });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  }

  if (process.env.PAYSTACK_TRANSFERS_ENABLED?.trim().toLowerCase() !== "true") {
    return NextResponse.json({
      success: true,
      transfersEnabled: false,
      message: "Paystack automatic transfers are disabled. Queued settlements were not initiated.",
      processed: 0,
      results: [],
    }, { headers: noStore });
  }

  try {
    const results = await runSellerPayoutQueue(25);
    return NextResponse.json({
      success: true,
      transfersEnabled: true,
      processed: results.length,
      results,
      generatedAt: new Date().toISOString(),
    }, { headers: noStore });
  } catch (error) {
    console.error("SELLER_PAYOUT_CRON_ERROR:", error);
    return NextResponse.json({ error: "Unable to process the seller payout queue." }, { status: 500, headers: noStore });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
