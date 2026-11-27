import { getServerSession } from "next-auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
function reply(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: noStore }); }
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; reviewId: string }> }) {
  const limited = checkPublicRateLimit(request, "product-review-write");
  if (!limited.allowed) return NextResponse.json({ error: "You are editing reviews too quickly. Please try again shortly." }, { status: 429, headers: { ...noStore, ...Object.fromEntries(limited.headers) } });
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return reply({ error: "Sign in to edit your review." }, 401);
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
    if (!user || user.role !== "BUYER") return reply({ error: "Only buyers can edit their own reviews." }, 403);
    const { id: productId, reviewId } = await context.params;
    const raw = await request.text();
    if (raw.length > 8_192) return reply({ error: "Request body is too large." }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Invalid request body." }, 400);
    const data = body as Record<string, unknown>;
    const rating = data.rating;
    const comment = clean(data.comment);
    if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5) return reply({ error: "Select a rating from 1 to 5 stars." }, 400);
    if (!comment || comment.length > 2_000) return reply({ error: "Write a review of no more than 2,000 characters." }, 400);
    const existing = await prisma.productReview.findFirst({ where: { id: reviewId, productId, userId: user.id, orderItemId: { not: null }, status: { in: ["PUBLISHED", "HIDDEN"] } }, select: { id: true } });
    if (!existing) return reply({ error: "Review not found or you do not have permission to edit it." }, 404);
    const updated = await prisma.productReview.update({ where: { id: existing.id }, data: { rating: Number(rating), comment }, select: { id: true, rating: true, comment: true, updatedAt: true, status: true } });
    return reply({ review: updated, message: "Your review has been updated." });
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON request body." }, 400);
    console.error("PRODUCT_REVIEW_UPDATE_ERROR:", error);
    return reply({ error: "Unable to update this review." }, 500);
  }
}
