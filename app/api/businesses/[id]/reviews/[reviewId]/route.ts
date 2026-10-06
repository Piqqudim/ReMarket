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

type RouteContext = {
  params: Promise<{
    id: string;
    reviewId: string;
  }>;
};

const MAX_BUSINESS_ID_LENGTH = 100;
const MAX_REVIEW_ID_LENGTH = 100;
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

  return comment || null;
}

async function getBuyerSession() {
  const session =
    await getServerSession(
      authOptions
    );

  if (!session?.user) {
    return {
      authorized: false as const,

      response:
        NextResponse.json(
          {
            error:
              "You must be signed in to manage your review.",
          },
          {
            status: 401,
            headers:
              getNoStoreHeaders(),
          }
        ),
    };
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
    return {
      authorized: false as const,

      response:
        NextResponse.json(
          {
            error:
              "Your account session is invalid.",
          },
          {
            status: 401,
            headers:
              getNoStoreHeaders(),
          }
        ),
    };
  }

  /*
   * Only BUYER accounts may manage reviews.
   */
  if (
    sessionRole !== "BUYER"
  ) {
    return {
      authorized: false as const,

      response:
        NextResponse.json(
          {
            error:
              "Only buyers can manage business reviews.",
          },
          {
            status: 403,
            headers:
              getNoStoreHeaders(),
          }
        ),
    };
  }

  /*
   * Verify the current role in the database
   * instead of relying only on the JWT role.
   */
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
    return {
      authorized: false as const,

      response:
        NextResponse.json(
          {
            error:
              "Your account could not be found.",
          },
          {
            status: 401,
            headers:
              getNoStoreHeaders(),
          }
        ),
    };
  }

  if (
    currentUser.role !==
    "BUYER"
  ) {
    return {
      authorized: false as const,

      response:
        NextResponse.json(
          {
            error:
              "Only buyers can manage business reviews.",
          },
          {
            status: 403,
            headers:
              getNoStoreHeaders(),
          }
        ),
    };
  }

  return {
    authorized: true as const,
    userId,
  };
}

/*
 * ------------------------------------------------
 * VALIDATE ROUTE IDS
 * ------------------------------------------------
 */

function validateRouteIds(
  id: string,
  reviewId: string
):
  | {
      valid: true;
    }
  | {
      valid: false;
      response: NextResponse;
    } {
  if (!id) {
    return {
      valid: false,

      response:
        NextResponse.json(
          {
            error:
              "Business ID is required.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        ),
    };
  }

  if (
    id.length >
    MAX_BUSINESS_ID_LENGTH
  ) {
    return {
      valid: false,

      response:
        NextResponse.json(
          {
            error:
              "Invalid business ID.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        ),
    };
  }

  if (!reviewId) {
    return {
      valid: false,

      response:
        NextResponse.json(
          {
            error:
              "Review ID is required.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        ),
    };
  }

  if (
    reviewId.length >
    MAX_REVIEW_ID_LENGTH
  ) {
    return {
      valid: false,

      response:
        NextResponse.json(
          {
            error:
              "Invalid review ID.",
          },
          {
            status: 400,
            headers:
              getNoStoreHeaders(),
          }
        ),
    };
  }

  return {
    valid: true,
  };
}

/*
 * ------------------------------------------------
 * PATCH REVIEW
 * ------------------------------------------------
 *
 * PATCH /api/businesses/[id]/reviews/[reviewId]
 *
 * A buyer can update only their own review.
 *
 * No notification is sent here because the
 * current notification schema does not contain
 * REVIEW_UPDATED.
 */

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const auth =
      await getBuyerSession();

    if (!auth.authorized) {
      return auth.response;
    }

    const {
      id,
      reviewId,
    } = await context.params;

    const routeValidation =
      validateRouteIds(
        id,
        reviewId
      );

    if (
      !routeValidation.valid
    ) {
      return routeValidation.response;
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
     *
     * A review can only be edited while the
     * business remains publicly active.
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
     * VERIFY REVIEW OWNERSHIP
     * -----------------------------------------
     *
     * The review must belong to:
     *
     * - this business
     * - this authenticated buyer
     */

    const existingReview =
      await prisma.businessReview.findFirst(
        {
          where: {
            id:
              reviewId,

            businessId:
              id,

            userId:
              auth.userId,
          },

          select: {
            id: true,
          },
        }
      );

    if (!existingReview) {
      return NextResponse.json(
        {
          error:
            "Review not found or you are not allowed to edit it.",
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
     * UPDATE REVIEW
     * -----------------------------------------
     */

    const review =
      await prisma.businessReview.update(
        {
          where: {
            id:
              reviewId,
          },

          data: {
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
          "Review updated successfully.",

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
        headers:
          getNoStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Business review PATCH error:",
      error
    );

    /*
     * Prisma P2025 means the review could not
     * be found at update time.
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
        "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "Review could not be found.",
        },
        {
          status: 404,
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to update review.",
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
 * DELETE REVIEW
 * ------------------------------------------------
 *
 * DELETE /api/businesses/[id]/reviews/[reviewId]
 *
 * A buyer can delete only their own review.
 */

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const auth =
      await getBuyerSession();

    if (!auth.authorized) {
      return auth.response;
    }

    const {
      id,
      reviewId,
    } = await context.params;

    const routeValidation =
      validateRouteIds(
        id,
        reviewId
      );

    if (
      !routeValidation.valid
    ) {
      return routeValidation.response;
    }

    /*
     * -----------------------------------------
     * VERIFY REVIEW OWNERSHIP
     * -----------------------------------------
     *
     * A buyer can delete only a review that
     * belongs to that buyer and this business.
     */

    const existingReview =
      await prisma.businessReview.findFirst(
        {
          where: {
            id:
              reviewId,

            businessId:
              id,

            userId:
              auth.userId,
          },

          select: {
            id: true,
          },
        }
      );

    if (!existingReview) {
      return NextResponse.json(
        {
          error:
            "Review not found or you are not allowed to delete it.",
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
     * VERIFY BUSINESS OWNER
     * -----------------------------------------
     *
     * The business owner is the affected
     * recipient when their business review
     * is removed.
     */

    const business =
      await prisma.business.findUnique(
        {
          where: {
            id,
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
          headers:
            getNoStoreHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * DELETE REVIEW
     * -----------------------------------------
     */

    await prisma.businessReview.delete(
      {
        where: {
          id:
            reviewId,
        },
      }
    );

    /*
     * -----------------------------------------
     * NOTIFY BUSINESS OWNER
     * -----------------------------------------
     *
     * The buyer who deleted the review should
     * not receive a notification about their
     * own deletion.
     *
     * Notification failure must not change
     * the successful deletion response.
     */

    if (
      business.ownerId
    ) {
      try {
        await createNotification({
          userId:
            business.ownerId,

          type:
            NotificationType.REVIEW_REMOVED,

          title:
            "Review removed",

          message:
            `A review for ${business.name} was removed by the reviewer.`,

          priority:
            NotificationPriority.NORMAL,

          data: {
            reviewId,

            businessId:
              business.id,

            href:
              `/seller/${business.id}`,
          },

          dedupeKey:
            `review:${reviewId}:removed`,
        });
      } catch (
        notificationError
      ) {
        console.error(
          "Business review removal notification error:",
          notificationError
        );
      }
    }

    return NextResponse.json(
      {
        message:
          "Review deleted successfully.",
      },
      {
        headers:
          getNoStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Business review DELETE error:",
      error
    );

    if (
      error instanceof
        Error &&
      "code" in error &&
      (
        error as {
          code?: unknown;
        }
      ).code ===
        "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "Review could not be found.",
        },
        {
          status: 404,
          headers:
            getNoStoreHeaders(),
          }
        );
    }

    return NextResponse.json(
      {
        error:
          "Unable to delete review.",
      },
      {
        status: 500,
        headers:
          getNoStoreHeaders(),
      }
    );
  }
}