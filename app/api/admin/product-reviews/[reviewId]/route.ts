import { NextRequest, NextResponse } from "next/server";
import { ProductReviewStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
function reply(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: noStore }); }

export async function PATCH(request: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.authorized) return reply({ error: "Forbidden" }, auth.response.status);
  try {
    const { reviewId } = await context.params;
    const raw = await request.text();
    if (raw.length > 4_096) return reply({ error: "Request is too large." }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Invalid request." }, 400);
    const data = body as Record<string, unknown>;
    const action = typeof data.action === "string" ? data.action.toUpperCase() : "";
    const reason = typeof data.reason === "string" ? data.reason.trim().slice(0, 500) : "";
    const statusMap: Record<string, ProductReviewStatus> = { PUBLISH: "PUBLISHED", HIDE: "HIDDEN", REMOVE: "REMOVED" };
    const newStatus = statusMap[action];
    if (!newStatus) return reply({ error: "Choose PUBLISH, HIDE or REMOVE." }, 400);
    const existing = await prisma.productReview.findUnique({ where: { id: reviewId }, select: { id: true, status: true, productName: true, orderItemId: true } });
    if (!existing) return reply({ error: "Review not found." }, 404);
    if (action === "PUBLISH" && !existing.orderItemId) return reply({ error: "This historical review is not linked to a verifiable delivered purchase and cannot be republished." }, 409);
    const result = await prisma.$transaction(async (tx) => {
      const review = await tx.productReview.update({ where: { id: reviewId }, data: { status: newStatus }, select: { id: true, status: true } });
      await tx.productReviewModerationLog.create({ data: { reviewId, moderatorId: auth.user.id, action, reason: reason || null, previousStatus: existing.status, newStatus } });
      await tx.productReviewReport.updateMany({ where: { reviewId, status: "OPEN" }, data: { status: action === "REMOVE" || action === "HIDE" ? "REVIEWED" : "DISMISSED", reviewedAt: new Date(), reviewedById: auth.user.id } });
      await tx.adminAuditLog.create({ data: { adminId: auth.user.id, action: `PRODUCT_REVIEW_${action}`, entityType: "PRODUCT_REVIEW", entityId: reviewId, reason: reason || null, beforeData: { status: existing.status }, afterData: { status: newStatus, productName: existing.productName } } });
      return review;
    });
    const actionMessage: Record<string, string> = {
      PUBLISH: "Review published successfully.",
      HIDE: "Review hidden successfully.",
      REMOVE: "Review removed successfully.",
    };
    return reply({ review: result, message: actionMessage[action] });
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON body." }, 400);
    console.error("ADMIN_PRODUCT_REVIEW_UPDATE_ERROR:", error);
    return reply({ error: "Unable to moderate this review." }, 500);
  }
}
