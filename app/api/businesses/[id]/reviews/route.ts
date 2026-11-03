
import {
  NotificationPriority,
  NotificationType,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getServerSession,
} from "next-auth";

import {
  authOptions,
} from "@/lib/auth";

import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { checkPublicRateLimit } from "@/lib/rate-limit";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_BUSINESS_ID_LENGTH = 100;
const MAX_COMMENT_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function getNoStoreHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function parseRating(
  value: unknown
): number | null {
  const rating =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          value.trim()
        ? Number(value)
        : NaN;

  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return null;
  }

  return rating;
}

function parseComment(
  value: unknown
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const comment =
    cleanString(value);

  if (!comment) {
    return null;
  }

  return comment;
}

/*
 * ------------------------------------------------
 * GET REVIEWS
 * ------------------------------------------------
 *
 * GET /api/businesses/[id]/reviews
 *
 * Public endpoint.
 *
 * Only active, non-deleted businesses
 * can expose reviews.
 */

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const rateLimit = checkPublicRateLimit(request, "business-review-read");
  const responseHeaders = getNoStoreHeaders(rateLimit.headers);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many review requests. Please try again shortly." },
      { status: 429, headers: responseHeaders }
    );
  }

  const { id } = await context.params;
  if (!id || id.length > MAX_BUSINESS_ID_LENGTH) {
    return NextResponse.json(
      { error: id ? "Invalid business ID." : "Business ID is required." },
      { status: 400, headers: responseHeaders }
    );
  }

  try {
    const business = await prisma.business.findFirst({
      where: { id, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });

    if (!business) {
      return NextResponse.json(
        { error: "Business not found." },
        { status: 404, headers: responseHeaders }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const requestedPage = parsePositiveInteger(searchParams.get("page"), 1);
    const pageSize = Math.min(
      parsePositiveInteger(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    );

    const [summary, ratingGroups] = await Promise.all([
      prisma.businessReview.aggregate({
        where: { businessId: id },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.businessReview.groupBy({
        by: ["rating"],
        where: { businessId: id },
        _count: { _all: true },
      }),
    ]);

    const reviewCount = summary._count._all;
    const totalPages = Math.max(1, Math.ceil(reviewCount / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const averageRating = reviewCount > 0 && summary._avg.rating !== null
      ? Number(summary._avg.rating.toFixed(1))
      : 0;

    const ratingBreakdown: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
    };
    for (const group of ratingGroups) {
      if (group.rating >= 1 && group.rating <= 5) {
        ratingBreakdown[group.rating as 1 | 2 | 3 | 4 | 5] = group._count._all;
      }
    }

    let currentUserId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      const sessionUser = session?.user as { id?: unknown } | undefined;
      currentUserId = typeof sessionUser?.id === "string" && sessionUser.id.trim()
        ? sessionUser.id.trim()
        : null;
    } catch (sessionError) {
      // Reviews remain publicly readable if optional ownership lookup fails.
      console.warn("Unable to resolve review viewer session:", sessionError);
    }

    const reviews = await prisma.businessReview.findMany({
      where: { businessId: id },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        userId: true,
        rating: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json(
      {
        reviews: reviews.map((review) => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt,
          isOwnReview: Boolean(currentUserId && review.userId === currentUserId),
          user: {
            name: review.user.name || "ReMarket user",
          },
        })),
        reviewCount,
        averageRating,
        ratingBreakdown,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
      },
      { headers: responseHeaders }
    );
  } catch (error) {
    console.error("Business reviews GET error:", error);
    return NextResponse.json(
      { error: "Unable to load reviews." },
      { status: 500, headers: responseHeaders }
    );
  }
}

/*
 * ------------------------------------------------
 * POST REVIEW
 * ------------------------------------------------
 *
 * POST /api/businesses/[id]/reviews
 *
 * Only authenticated BUYER accounts
 * can create reviews.
 *
 * One buyer can create only one review
 * for a specific business.
 */

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const rateLimit = checkPublicRateLimit(request, "business-review-write");
  const responseHeaders = getNoStoreHeaders(rateLimit.headers);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many review submissions. Please try again shortly." },
      { status: 429, headers: responseHeaders }
    );
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 12_000) {
    return NextResponse.json(
      { error: "Review submission is too large." },
      { status: 413, headers: responseHeaders }
    );
  }

  /*
   * -----------------------------------------
   * AUTHENTICATION
   * -----------------------------------------
   */

  const session =
    await getServerSession(
      authOptions
    );

  if (!session?.user) {
    return NextResponse.json(
      {
        error:
          "You must be signed in to leave a review.",
      },
      {
        status: 401,
        headers: responseHeaders,
      }
    );
  }

  const sessionUser =
    session.user as {
      id?: unknown;
      role?: unknown;
    };

  const userId =
    typeof sessionUser.id ===
    "string"
      ? sessionUser.id.trim()
      : "";

  const sessionRole =
    typeof sessionUser.role ===
    "string"
      ? sessionUser.role
      : "";

  if (!userId) {
    return NextResponse.json(
      {
        error:
          "Your account session is invalid.",
      },
      {
        status: 401,
        headers: responseHeaders,
      }
    );
  }

  /*
   * Only BUYER accounts may create reviews.
   */
  if (
    sessionRole !== "BUYER"
  ) {
    return NextResponse.json(
      {
        error:
          "Only buyers can leave business reviews.",
      },
      {
        status: 403,
        headers: responseHeaders,
      }
    );
  }

  /*
   * -----------------------------------------
   * CURRENT ROLE VERIFICATION
   * -----------------------------------------
   *
   * Verify the user's current database role
   * instead of relying only on the JWT/session
   * role, which can become stale after a role
   * change.
   */

  try {
    const currentUser =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },

        select: {
          role: true,
        },
      });

    if (!currentUser) {
      return NextResponse.json(
        {
          error:
            "Your account could not be found.",
        },
        {
          status: 401,
          headers: responseHeaders,
        }
      );
    }

    if (
      currentUser.role !== "BUYER"
    ) {
      return NextResponse.json(
        {
          error:
            "Only buyers can leave business reviews.",
        },
        {
          status: 403,
          headers: responseHeaders,
        }
      );
    }

    /*
     * -----------------------------------------
     * BUSINESS ID
     * -----------------------------------------
     */

    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Business ID is required.",
        },
        {
          status: 400,
          headers: responseHeaders,
        }
      );
    }

    if (
      id.length >
      MAX_BUSINESS_ID_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid business ID.",
        },
        {
          status: 400,
          headers: responseHeaders,
        }
      );
    }

    /*
     * -----------------------------------------
     * PARSE REQUEST BODY
     * -----------------------------------------
     */

    let body: unknown;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid JSON body.",
        },
        {
          status: 400,
          headers: responseHeaders,
        }
      );
    }

    if (
      !body ||
      typeof body !==
        "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
          headers: responseHeaders,
        }
      );
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

    /*
     * -----------------------------------------
     * VALIDATE RATING
     * -----------------------------------------
     */

    const rating =
      parseRating(
        payload.rating
      );

    if (rating === null) {
      return NextResponse.json(
        {
          error:
            "Rating must be a whole number between 1 and 5.",
        },
        {
          status: 400,
          headers: responseHeaders,
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE COMMENT
     * -----------------------------------------
     */

    const comment =
      parseComment(
        payload.comment
      );

    if (
      comment &&
      comment.length >
        MAX_COMMENT_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "Review comment is too long.",
        },
        {
          status: 400,
          headers: responseHeaders,
        }
      );
    }

    /*
     * -----------------------------------------
     * VERIFY BUSINESS
     * -----------------------------------------
     */

    const business =
      await prisma.business.findFirst(
        {
          where: {
            id,

            status:
              "ACTIVE",

            deletedAt:
              null,
          },

          select: {
            id: true,
            name: true,
            ownerId: true,
          },
        }
      );

    if (!business) {
      return NextResponse.json(
        {
          error:
            "Business not found.",
        },
        {
          status: 404,
          headers: responseHeaders,
        }
      );
    }

    /*
     * -----------------------------------------
     * CREATE REVIEW
     * -----------------------------------------
     *
     * Do not perform a separate
     * findUnique() first.
     *
     * The database unique constraint:
     *
     * [businessId, userId]
     *
     * is the authoritative protection against
     * duplicate reviews and simultaneous
     * submissions.
     */

    const review =
      await prisma.businessReview.create(
        {
          data: {
            businessId:
              id,

            userId,

            rating,

            comment,
          },

          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            updatedAt: true,

            user: {
              select: {
                name: true,
              },
            },
          },
        }
      );

    /*
     * -----------------------------------------
     * NOTIFY BUSINESS OWNER
     * -----------------------------------------
     *
     * The reviewer is the buyer who just
     * submitted the review, so they should
     * not receive a notification about their
     * own action.
     *
     * The affected recipient is the owner
     * of the reviewed business.
     *
     * Notification failure must not undo
     * successful review creation.
     */

    if (
      business.ownerId
    ) {
      try {
        await createNotification({
          userId:
            business.ownerId,

          type:
            NotificationType.REVIEW_RECEIVED,

          title:
            "New business review",

          message:
            `Your business, ${business.name}, received a ${review.rating}-star review.`,

          priority:
            NotificationPriority.NORMAL,

          data: {
            reviewId:
              review.id,

            businessId:
              business.id,

            href:
              `/seller/${business.id}`,
          },

          dedupeKey:
            `review:${review.id}:received`,
        });
      } catch (
        notificationError
      ) {
        console.error(
          "Business review notification error:",
          notificationError
        );
      }
    }

    return NextResponse.json(
      {
        message:
          "Review submitted successfully.",

        review: {
          id:
            review.id,

          rating:
            review.rating,

          comment:
            review.comment,

          createdAt:
            review.createdAt,

          updatedAt:
            review.updatedAt,

          user: {
            name:
              review.user.name ||
              "ReMarket user",
          },
        },
      },
      {
        status: 201,
        headers: responseHeaders,
      }
    );
  } catch (error) {
    console.error(
      "Business review POST error:",
      error
    );

    /*
     * Prisma unique constraint protection.
     *
     * This also protects against two
     * simultaneous submissions from the
     * same buyer.
     */
    if (
      error instanceof
        Error &&
      "code" in error &&
      (
        error as {
          code?: unknown;
        }
      ).code ===
        "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "You have already reviewed this business.",
        },
        {
          status: 409,
          headers: responseHeaders,
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to submit review.",
      },
      {
        status: 500,
        headers: responseHeaders,
      }
    );
  }
}
