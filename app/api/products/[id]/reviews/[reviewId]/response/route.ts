import { NotificationType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
function reply(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: noStore }); }

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; reviewId: string }> }) {
  const limited = checkPublicRateLimit(request, "product-review-write");
  if (!limited.allowed) return NextResponse.json({ error: "You are responding to reviews too quickly. Please try again shortly." }, { status: 429, headers: { ...noStore, ...Object.fromEntries(limited.headers) } });
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return reply({ error: "Sign in to respond to a review." }, 401);
    const seller = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, business: { select: { id: true, ownerId: true } } } });
    if (!seller || seller.role !== "SELLER" || !seller.business || seller.business.ownerId !== seller.id) return reply({ error: "An active seller account is required." }, 403);
    const { id: productId, reviewId } = await context.params;
    const raw = await request.text();
    if (raw.length > 4_096) return reply({ error: "Response is too large." }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Invalid response." }, 400);
    const text = typeof (body as Record<string, unknown>).response === "string" ? (body as Record<string, string>).response.trim() : "";
    if (!text || text.length > 1_000) return reply({ error: "Write a response of no more than 1,000 characters." }, 400);
    const review = await prisma.productReview.findFirst({ where: { id: reviewId, productId, sellerId: seller.id, status: "PUBLISHED" }, select: { id: true, userId: true, sellerResponse: true } });
    if (!review) return reply({ error: "Review not found for your seller account." }, 404);
    const updated = await prisma.productReview.update({ where: { id: review.id }, data: { sellerResponse: text, sellerResponseById: seller.id, sellerRespondedAt: new Date() }, select: { id: true, sellerResponse: true, sellerRespondedAt: true } });
    try {
      await (await import("@/lib/notifications")).createNotification({
        userId: review.userId,
        type: NotificationType.REVIEW_REPLIED,
        title: "The seller responded to your review",
        message: "The seller has responded to your product review. View the response on ReMarket.",
        dedupeKey: `product-review:${review.id}:seller-response:${updated.sellerRespondedAt?.getTime() ?? Date.now()}`,
        data: { productId, reviewId, href: `/product/${encodeURIComponent(productId)}#product-reviews` },
      });
    } catch (notificationError) {
      console.error("PRODUCT_REVIEW_RESPONSE_NOTIFICATION_ERROR:", notificationError);
    }
    return reply({ response: updated, message: "Your response has been published." });
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON request body." }, 400);
    console.error("PRODUCT_REVIEW_RESPONSE_ERROR:", error);
    return reply({ error: "Unable to publish your response." }, 500);
  }
}
