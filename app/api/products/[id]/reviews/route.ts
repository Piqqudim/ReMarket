import { NotificationPriority, NotificationType, Prisma, SellerOrderStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const MAX_COMMENT_LENGTH = 2_000;
const MAX_PAGE_SIZE = 30;

function reply(data: unknown, status = 200, headers?: HeadersInit) {
  const merged = new Headers(headers ?? noStore);
  merged.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return NextResponse.json(data, { status, headers: merged });
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: string | null, fallback: number, max: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limited = checkPublicRateLimit(request, "product-review-read");
  if (!limited.allowed) return reply({ error: "Too many review requests. Please try again shortly." }, 429, limited.headers);

  try {
    const { id: productId } = await context.params;
    if (!productId || productId.length > 100) return reply({ error: "Invalid product ID." }, 400);

    const product = await prisma.product.findFirst({
      where: { id: productId, status: "ACTIVE", deletedAt: null, business: { is: { status: "ACTIVE", deletedAt: null } } },
      select: { id: true },
    });
    if (!product) return reply({ error: "Product not found." }, 404);

    const params = request.nextUrl.searchParams;
    const page = positiveInteger(params.get("page"), 1, 100_000);
    const limit = positiveInteger(params.get("limit"), 8, MAX_PAGE_SIZE);
    const sort = params.get("sort");
    const orderBy: Prisma.ProductReviewOrderByWithRelationInput[] = sort === "highest"
      ? [{ rating: "desc" }, { createdAt: "desc" }, { id: "desc" }]
      : sort === "lowest"
        ? [{ rating: "asc" }, { createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;
    const currentUser = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }) : null;

    const reviewWhere = { productId, status: "PUBLISHED" as const };
    const [total, aggregate, breakdown, reviews, ownReviews, eligibleItems] = await Promise.all([
      prisma.productReview.count({ where: reviewWhere }),
      prisma.productReview.aggregate({ where: reviewWhere, _avg: { rating: true } }),
      prisma.productReview.groupBy({ by: ["rating"], where: reviewWhere, _count: { _all: true } }),
      prisma.productReview.findMany({
        where: reviewWhere,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, userId: true, rating: true, comment: true, createdAt: true, updatedAt: true,
          productName: true, sellerResponse: true, sellerRespondedAt: true,
          user: { select: { name: true } },
        },
      }),
      currentUser?.role === "BUYER" ? prisma.productReview.findMany({
        where: { productId, userId: currentUser.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, orderItemId: true, rating: true, comment: true, status: true, createdAt: true, updatedAt: true },
      }) : Promise.resolve([]),
      currentUser?.role === "BUYER" ? prisma.orderItem.findMany({
        where: {
          productId,
          productReview: null,
          sellerOrder: {
            status: { in: [SellerOrderStatus.DELIVERED, SellerOrderStatus.COMPLETED] },
            OR: [{ deliveredAt: { not: null } }, { completedAt: { not: null } }],
            order: { buyerId: currentUser.id, paidAt: { not: null } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, productName: true, createdAt: true,
          sellerOrder: { select: { sellerOrderCode: true, status: true, deliveredAt: true, completedAt: true } },
        },
      }) : Promise.resolve([]),
    ]);

    const ratingDistribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const row of breakdown) ratingDistribution[String(row.rating)] = row._count._all;

    return reply({
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        productName: review.productName,
        buyerName: review.user.name?.trim() || "ReMarket buyer",
        verifiedPurchase: true,
        sellerResponse: review.sellerResponse,
        sellerRespondedAt: review.sellerRespondedAt,
        canReport: review.userId !== currentUser?.id,
      })),
      summary: { rating: aggregate._avg.rating, reviewCount: total, ratingDistribution },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total },
      ownReviews,
      eligiblePurchases: eligibleItems.map((item) => ({
        orderItemId: item.id,
        productName: item.productName,
        purchasedAt: item.createdAt,
        sellerOrderCode: item.sellerOrder.sellerOrderCode,
      })),
      canReview: eligibleItems.length > 0,
    });
  } catch (error) {
    console.error("PRODUCT_REVIEWS_GET_ERROR:", error);
    return reply({ error: "Unable to load product reviews." }, 500);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limited = checkPublicRateLimit(request, "product-review-write");
  if (!limited.allowed) return reply({ error: "You are submitting reviews too quickly. Please try again shortly." }, 429, limited.headers);

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return reply({ error: "Sign in with a buyer account to review a product." }, 401);
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, accountStatus: true } });
    if (!user || user.role !== "BUYER" || user.accountStatus !== "ACTIVE") return reply({ error: "Only active buyer accounts can submit product reviews." }, 403);

    const { id: productId } = await context.params;
    if (!productId || productId.length > 100) return reply({ error: "Invalid product ID." }, 400);

    const raw = await request.text();
    if (raw.length > 8_192) return reply({ error: "Review request is too large." }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Invalid request body." }, 400);
    const data = body as Record<string, unknown>;
    const orderItemId = cleanText(data.orderItemId);
    const rating = data.rating;
    const comment = cleanText(data.comment);
    if (!orderItemId || orderItemId.length > 100) return reply({ error: "Choose an eligible delivered purchase to review." }, 400);
    if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5) return reply({ error: "Select a rating from 1 to 5 stars." }, 400);
    if (comment.length > MAX_COMMENT_LENGTH) return reply({ error: `Your review must be ${MAX_COMMENT_LENGTH} characters or fewer.` }, 400);
    if (!comment) return reply({ error: "Write a short comment about your purchase." }, 400);

    const orderItem = await prisma.orderItem.findFirst({
      where: {
        id: orderItemId,
        productId,
        productReview: null,
        sellerOrder: {
          status: { in: [SellerOrderStatus.DELIVERED, SellerOrderStatus.COMPLETED] },
          OR: [{ deliveredAt: { not: null } }, { completedAt: { not: null } }],
          order: { buyerId: user.id, paidAt: { not: null } },
        },
      },
      select: {
        id: true, productId: true, productName: true,
        sellerOrder: { select: { sellerId: true, order: { select: { buyerId: true } } } },
        product: { select: { name: true, business: { select: { ownerId: true } } } },
      },
    });
    if (!orderItem) return reply({ error: "This purchase is not eligible for review. Reviews are available only for products in your delivered ReMarket orders." }, 409);
    if (orderItem.sellerOrder.order.buyerId !== user.id || orderItem.sellerOrder.sellerId === user.id || orderItem.product?.business.ownerId === user.id) {
      return reply({ error: "You cannot review this purchase." }, 403);
    }

    const review = await prisma.productReview.create({
      data: {
        productId,
        productName: orderItem.product?.name ?? orderItem.productName,
        orderItemId: orderItem.id,
        userId: user.id,
        sellerId: orderItem.sellerOrder.sellerId,
        rating: Number(rating),
        comment,
        status: "PUBLISHED",
      },
      select: { id: true, rating: true, comment: true, createdAt: true, status: true },
    });

    try {
      await createNotification({
        userId: orderItem.sellerOrder.sellerId,
        type: NotificationType.REVIEW_RECEIVED,
        title: "A buyer reviewed your product",
        message: `A buyer left a ${Number(rating)}-star review for ${orderItem.product?.name ?? orderItem.productName}.`,
        priority: NotificationPriority.NORMAL,
        dedupeKey: `product-review:${review.id}:seller-review-received`,
        data: { productId, reviewId: review.id, href: "/seller/reviews" } as Prisma.InputJsonValue,
      });
    } catch (notificationError) {
      console.error("PRODUCT_REVIEW_SELLER_NOTIFICATION_ERROR:", notificationError);
    }

    return reply({ review, message: "Thank you. Your verified purchase review has been published." }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply({ error: "This delivered purchase has already been reviewed." }, 409);
    }
    if (error instanceof SyntaxError) return reply({ error: "Invalid JSON request body." }, 400);
    console.error("PRODUCT_REVIEW_CREATE_ERROR:", error);
    return reply({ error: "Unable to submit your review." }, 500);
  }
}
