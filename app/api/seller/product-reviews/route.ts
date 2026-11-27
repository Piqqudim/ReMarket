import { NextResponse } from "next/server";
import { requireSeller } from "@/lib/seller-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET() {
  const auth = await requireSeller();
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: auth.response.status, headers: noStore });
  try {
    const reviews = await prisma.productReview.findMany({
      where: { sellerId: auth.user.id, orderItemId: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true, productId: true, productName: true, rating: true, comment: true, status: true,
        sellerResponse: true, sellerRespondedAt: true, createdAt: true, updatedAt: true,
        user: { select: { name: true } },
        reports: { where: { status: "OPEN" }, select: { id: true } },
      },
    });
    return NextResponse.json({ reviews: reviews.map((review) => ({ ...review, buyerName: review.user.name?.trim() || "ReMarket buyer", openReportCount: review.reports.length, user: undefined, reports: undefined })) }, { headers: noStore });
  } catch (error) {
    console.error("SELLER_PRODUCT_REVIEWS_ERROR:", error);
    return NextResponse.json({ error: "Unable to load product reviews." }, { status: 500, headers: noStore });
  }
}
