import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processNotificationDeliveries } from "@/lib/notification-delivery";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7).trim(), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function handle(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503, headers: noStore });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  try {
    const result = await processNotificationDeliveries(15);
    return NextResponse.json({ success: true, ...result, generatedAt: new Date().toISOString() }, { headers: noStore });
  } catch (error) {
    console.error("NOTIFICATION_DELIVERY_CRON_ERROR:", error);
    return NextResponse.json({ error: "Unable to process notification deliveries." }, { status: 500, headers: noStore });
  }
}
export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
