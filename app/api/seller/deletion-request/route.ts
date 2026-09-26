import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

/*
 * ----------------------------------------------------
 * GET
 * ----------------------------------------------------
 *
 * Returns the latest deletion request belonging
 * to the authenticated seller's business.
 */
export async function GET() {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const business =
      await prisma.business.findUnique({
        where: {
          ownerId: auth.user.id,
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

    if (!business) {
      return NextResponse.json(
        {
          request: null,
        },
        {
          headers: jsonHeaders(),
        }
      );
    }

    const request =
      await prisma.businessDeletionRequest.findFirst(
        {
          where: {
            businessId: business.id,
          },
          orderBy: {
            createdAt: "desc",
          },
          select: {
            id: true,
            businessId: true,
            reason: true,
            status: true,
            reviewedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }
      );

    return NextResponse.json(
      {
        request,
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller deletion request fetch error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load deletion request.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/*
 * ----------------------------------------------------
 * POST
 * ----------------------------------------------------
 *
 * Creates a deletion request for the seller's
 * own business.
 *
 * The business is NOT deleted here.
 */
export async function POST(
  request: Request
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body: unknown =
      await request.json();

    if (
      body !== undefined &&
      body !== null &&
      (typeof body !== "object" ||
        Array.isArray(body))
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const payload =
      body && typeof body === "object"
        ? (body as Record<
            string,
            unknown
          >)
        : {};

    const reason = cleanString(
      payload.reason
    );

    /*
     * Find the seller's own business.
     */
    const business =
      await prisma.business.findUnique({
        where: {
          ownerId: auth.user.id,
        },
        select: {
          id: true,
          name: true,
          deletedAt: true,
        },
      });

    if (!business) {
      return NextResponse.json(
        {
          error:
            "You do not have a business linked to this seller account.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    if (business.deletedAt) {
      return NextResponse.json(
        {
          error:
            "This business has already been deleted.",
        },
        {
          status: 410,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Do not allow multiple pending requests
     * for the same business.
     */
    const pendingRequest =
      await prisma.businessDeletionRequest.findFirst(
        {
          where: {
            businessId: business.id,
            status: "PENDING",
          },
          select: {
            id: true,
            createdAt: true,
          },
        }
      );

    if (pendingRequest) {
      return NextResponse.json(
        {
          error:
            "A business deletion request is already pending.",
          request:
            pendingRequest,
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * A previously rejected request can be
     * followed by a new request.
     *
     * An already approved request should only
     * occur while the business is awaiting the
     * admin operation, so the business's
     * deletedAt state remains the source of truth.
     */
    const deletionRequest =
      await prisma.businessDeletionRequest.create(
        {
          data: {
            businessId:
              business.id,

            requestedById:
              auth.user.id,

            reason:
              reason || null,

            status: "PENDING",
          },

          select: {
            id: true,
            businessId: true,
            reason: true,
            status: true,
            reviewedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }
      );

    return NextResponse.json(
      {
        message:
          "Business deletion request submitted successfully.",

        request:
          deletionRequest,
      },
      {
        status: 201,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller deletion request creation error:",
      error
    );

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "A deletion request already exists for this business.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to submit deletion request.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}