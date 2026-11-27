import { NextResponse } from "next/server";
import { ProductReviewStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.authorized) return NextResponse.json({ error: "Forbidden" }, { status: auth.response.status, headers: noStore });
  try {
    const { searchParams } = new URL(request.url);
    const statusValue = searchParams.get("status")?.toUpperCase() ?? "ALL";
    if (!["ALL", "PUBLISHED", "HIDDEN", "REMOVED", "REPORTED"].includes(statusValue)) return NextResponse.json({ error: "Invalid review status filter." }, { status: 400, headers: noStore });
    const where = statusValue === "REPORTED"
      ? { reports: { some: { status: "OPEN" as const } } }
      : statusValue === "ALL" ? {} : { status: statusValue as ProductReviewStatus };
    const [reviews, total, openReports] = await Promise.all([
      prisma.productReview.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, select: {
        id: true, productId: true, orderItemId: true, productName: true, rating: true, comment: true, status: true, createdAt: true,
        sellerResponse: true, user: { select: { name: true } },
        seller: { select: { name: true } },
        reports: { orderBy: { createdAt: "desc" }, select: { id: true, reason: true, details: true, status: true, createdAt: true, reporter: { select: { name: true } } } },
      } }),
      prisma.productReview.count({ where }),
      prisma.productReviewReport.count({ where: { status: "OPEN" } }),
    ]);
    return NextResponse.json({ reviews, total, openReports }, { headers: noStore });
  } catch (error) {
    console.error("ADMIN_PRODUCT_REVIEWS_GET_ERROR:", error);
    return NextResponse.json({ error: "Unable to load product reviews." }, { status: 500, headers: noStore });
  }
}
