import { NotificationPriority, NotificationType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
function reply(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: noStore }); }
const REASONS = new Set(["SPAM", "ABUSIVE", "MISLEADING", "NOT_PRODUCT_RELATED", "PERSONAL_INFORMATION", "OTHER"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; reviewId: string }> }) {
  const limited = checkPublicRateLimit(request, "product-review-write");
  if (!limited.allowed) return NextResponse.json({ error: "You are submitting reports too quickly. Please try again shortly." }, { status: 429, headers: { ...noStore, ...Object.fromEntries(limited.headers) } });
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return reply({ error: "Sign in to report a review." }, 401);
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
    if (!user || user.role !== "BUYER") return reply({ error: "Only buyer accounts can report product reviews." }, 403);
    const { id: productId, reviewId } = await context.params;
    const raw = await request.text();
    if (raw.length > 4_096) return reply({ error: "Report is too large." }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Invalid report." }, 400);
    const data = body as Record<string, unknown>;
    const reason = typeof data.reason === "string" ? data.reason.trim().toUpperCase() : "";
    const details = typeof data.details === "string" ? data.details.trim() : "";
    if (!REASONS.has(reason)) return reply({ error: "Choose a valid report reason." }, 400);
    if (details.length > 1_000) return reply({ error: "Additional details must be 1,000 characters or fewer." }, 400);
    const review = await prisma.productReview.findFirst({ where: { id: reviewId, productId, status: "PUBLISHED" }, select: { id: true, userId: true, productName: true } });
    if (!review) return reply({ error: "Review not found." }, 404);
    if (review.userId === user.id) return reply({ error: "You cannot report your own review." }, 409);
    const report = await prisma.productReviewReport.create({ data: { reviewId, reporterId: user.id, reason, details: details || null }, select: { id: true } });
    try {
      const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
      for (const admin of admins) {
        await createNotification({
          userId: admin.id,
          type: NotificationType.REVIEW_REPORTED,
          title: "A product review was reported",
          message: `A buyer reported a review for ${review.productName}. Please inspect it in Admin review moderation.`,
          priority: NotificationPriority.NORMAL,
          dedupeKey: `product-review-report:${report.id}:admin:${admin.id}`,
          data: { reviewId, href: "/admin/product-reviews?status=REPORTED" },
        });
      }
    } catch (notificationError) {
      console.error("PRODUCT_REVIEW_REPORT_ADMIN_NOTIFICATION_ERROR:", notificationError);
    }
    return reply({ message: "Thank you. The review has been sent to ReMarket for moderation." }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON request body." }, 400);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return reply({ error: "You have already reported this review." }, 409);
    console.error("PRODUCT_REVIEW_REPORT_ERROR:", error);
    return reply({ error: "Unable to submit this report." }, 500);
  }
}
