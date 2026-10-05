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
    reviewId: string;
  }>;
};

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
      ? sessionUser.id
      : "";

  const role =
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
          }
        ),
    };
  }

  if (role !== "BUYER") {
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
 * PATCH REVIEW
 * ------------------------------------------------
 *
 * PATCH /api/businesses/[id]/reviews/[reviewId]
 *
 * A buyer can update only their own review.
 */

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const auth =
    await getBuyerSession();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id, reviewId } =
    await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error:
          "Business ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  if (!reviewId) {
    return NextResponse.json(
      {
        error:
          "Review ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const body: unknown =
      await request.json();

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
        }
      );
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

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
        }
      );
    }

    const comment =
      parseComment(
        payload.comment
      );

    if (
      comment &&
      comment.length > 2000
    ) {
      return NextResponse.json(
        {
          error:
            "Review comment is too long.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * The business must still be active and
     * non-deleted for a review to be edited.
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
        }
      );
    }

    /*
     * Ownership is checked through both:
     *
     * - review ID
     * - business ID
     * - authenticated user ID
     *
     * This prevents a buyer from editing
     * another review or a review belonging
     * to another business.
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
        }
      );
    }

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
      }
    );
  } catch (error) {
    console.error(
      "Business review PATCH error:",
      error
    );

    if (
      typeof error ===
        "object" &&
      error !== null &&
      "code" in error &&
      error.code ===
        "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "Review could not be found.",
        },
        {
          status: 404,
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
  const auth =
    await getBuyerSession();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id, reviewId } =
    await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error:
          "Business ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  if (!reviewId) {
    return NextResponse.json(
      {
        error:
          "Review ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
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
        }
      );
    }

    await prisma.businessReview.delete(
      {
        where: {
          id:
            reviewId,
        },
      }
    );

    return NextResponse.json(
      {
        message:
          "Review deleted successfully.",
      }
    );
  } catch (error) {
    console.error(
      "Business review DELETE error:",
      error
    );

    if (
      typeof error ===
        "object" &&
      error !== null &&
      "code" in error &&
      error.code ===
        "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "Review could not be found.",
        },
        {
          status: 404,
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
      }
    );
  }
}