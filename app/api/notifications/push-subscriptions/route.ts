import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAllowedPushEndpoint } from "@/lib/web-push";
import { encryptPushAuthSecret } from "@/lib/push-subscription-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
function reply(data: unknown, status = 200) { return NextResponse.json(data, { status, headers }); }

async function authenticatedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, accountStatus: true } });
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch { return false; }
}

function decodeKey(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function isValidSubscription(value: unknown): value is {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (typeof data.endpoint !== "string" || data.endpoint.length > 2_000 || !isAllowedPushEndpoint(data.endpoint)) return false;
  if (!data.keys || typeof data.keys !== "object" || Array.isArray(data.keys)) return false;
  const keys = data.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return false;
  try {
    const p256dh = decodeKey(keys.p256dh);
    const auth = decodeKey(keys.auth);
    return p256dh.length === 65 && p256dh[0] === 4 && auth.length >= 16 && auth.length <= 32;
  } catch { return false; }
}

export async function GET() {
  try {
    const user = await authenticatedUser();
    if (!user || user.accountStatus !== "ACTIVE") return reply({ error: "An active signed-in account is required." }, 401);
    const [count, latest] = await Promise.all([
      prisma.pushSubscription.count({ where: { userId: user.id } }),
      prisma.pushSubscription.findFirst({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    ]);
    return reply({ hasSubscription: count > 0, subscriptionCount: count, updatedAt: latest?.updatedAt ?? null });
  } catch (error) {
    console.error("PUSH_SUBSCRIPTION_STATUS_ERROR:", error);
    return reply({ error: "Unable to check browser notification status." }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Same-origin request required." }, 403);
  try {
    const user = await authenticatedUser();
    if (!user || user.accountStatus !== "ACTIVE") return reply({ error: "An active signed-in account is required." }, 401);
    const raw = await request.text();
    if (raw.length > 8_192) return reply({ error: "Subscription request is too large." }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body) || !isValidSubscription((body as Record<string, unknown>).subscription)) {
      return reply({ error: "A valid browser push subscription is required." }, 400);
    }
    const subscription = (body as { subscription: { endpoint: string; expirationTime?: number | null; keys: { p256dh: string; auth: string } } }).subscription;
    let encryptedAuth: string;
    try { encryptedAuth = encryptPushAuthSecret(subscription.keys.auth); }
    catch (error) { return reply({ error: error instanceof Error ? error.message : "Push encryption is not configured." }, 503); }

    const expirationTime = typeof subscription.expirationTime === "number" && Number.isFinite(subscription.expirationTime) && subscription.expirationTime > Date.now()
      ? new Date(subscription.expirationTime) : null;
    const saved = await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      // One browser endpoint can be associated with only one signed-in
      // account. An explicit opt-in from the current account transfers it.
      update: { userId: user.id, p256dh: subscription.keys.p256dh, auth: encryptedAuth, expirationTime, userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null },
      create: { userId: user.id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: encryptedAuth, expirationTime, userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null },
      select: { id: true, updatedAt: true },
    });
    return reply({ saved: true, subscriptionId: saved.id, updatedAt: saved.updatedAt });
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON request body." }, 400);
    console.error("PUSH_SUBSCRIPTION_SAVE_ERROR:", error);
    return reply({ error: "Unable to save this browser subscription." }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Same-origin request required." }, 403);
  try {
    const user = await authenticatedUser();
    if (!user) return reply({ error: "Sign in to manage browser notifications." }, 401);
    const raw = await request.text();
    if (raw.length > 8_192) return reply({ error: "Request is too large." }, 413);
    const body: unknown = raw.trim() ? JSON.parse(raw) : {};
    const endpoint = body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).endpoint === "string"
      ? ((body as Record<string, string>).endpoint).trim() : "";
    if (endpoint && !isAllowedPushEndpoint(endpoint)) return reply({ error: "Invalid browser subscription endpoint." }, 400);
    const result = endpoint
      ? await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } })
      : await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    return reply({ removed: result.count });
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON request body." }, 400);
    console.error("PUSH_SUBSCRIPTION_DELETE_ERROR:", error);
    return reply({ error: "Unable to remove this browser subscription." }, 500);
  }
}
