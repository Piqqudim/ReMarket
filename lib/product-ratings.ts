import { prisma } from "@/lib/prisma";

export type ProductRatingSummary = {
  rating: number | null;
  reviewCount: number;
};

/**
 * Loads aggregate product-review data for a bounded set of product IDs.
 * Products without reviews deliberately return a null rating and zero count.
 */
export async function getProductRatingSummaries(
  productIds: string[],
): Promise<Map<string, ProductRatingSummary>> {
  const ids = Array.from(new Set(productIds.filter((id) => typeof id === "string" && id.trim())));
  if (ids.length === 0) return new Map();

  const rows = await prisma.productReview.groupBy({
    by: ["productId"],
    where: { productId: { in: ids }, status: "PUBLISHED" },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return new Map(rows.filter((row) => row.productId !== null).map((row) => [row.productId as string, {
    rating: typeof row._avg.rating === "number" ? row._avg.rating : null,
    reviewCount: row._count._all,
  }]));
}
