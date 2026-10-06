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

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_BUSINESS_ID_LENGTH = 100;
const MAX_COMMENT_LENGTH = 2000;

function getNoStoreHeaders(): Headers {
  const headers = new Headers();

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return headers;
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
  _request: NextRequest,
  context: RouteContext
) {
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
        headers:
          getNoStoreHeaders(),
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
        headers:
          getNoStoreHeaders(),
      }
    );
  }

  try {
    const business =
      await prisma.business.findFirst({
        where: {
          id,

          status:
            "ACTIVE",

          deletedAt:
            null,
        },

        select: {
          id: true,
        },
      });

    if (!business) {
      return NextResponse.json(
        {
          error:
            "Business not found.",
        },
        {
          status: 404,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    const reviews =
      await prisma.businessReview.findMany(
        {
          where: {
            businessId:
              id,
          },

          orderBy: {
            createdAt:
              "desc",
          },

          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            updatedAt: true,

            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }
      );

    const reviewCount =
      reviews.length;

    const ratingTotal =
      reviews.reduce(
        (
          total,
          review
        ) =>
          total +
          review.rating,
        0
      );

    const averageRating =
      reviewCount > 0
        ? Number(
            (
              ratingTotal /
              reviewCount
            ).toFixed(1)
          )
        : 0;

    const ratingBreakdown = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    for (
      const review of
        reviews
    ) {
      if (
        review.rating >= 1 &&
        review.rating <= 5
      ) {
        ratingBreakdown[
          review.rating as
            | 1
            | 2
            | 3
            | 4
            | 5
        ] += 1;
      }
    }

    return NextResponse.json(
      {
        reviews:
          reviews.map(
            (review) => ({
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
                id:
                  review.user.id,

                name:
                  review.user.name ||
                  "ReMarket user",
              },
            })
          ),

        reviewCount,

        averageRating,

        ratingBreakdown,
      },
      {
        headers:
          getNoStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Business reviews GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load reviews.",
      },
      {
        status: 500,
        headers:
          getNoStoreHeaders(),
      }
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
        headers:
          getNoStoreHeaders(),
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
        headers:
          getNoStoreHeaders(),
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
        headers:
          getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
                id: true,
                name: true,
              },
            },
          },
        }
      );

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
            id:
              review.user.id,

            name:
              review.user.name ||
              "ReMarket user",
          },
        },
      },
      {
        status: 201,
        headers:
          getNoStoreHeaders(),
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
          headers:
            getNoStoreHeaders(),
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
        headers:
          getNoStoreHeaders(),
      }
    );
  }
}