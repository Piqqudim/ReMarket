import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

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
    "Cache-Control": "no-store",
  };
}

/*
 * ----------------------------------------------------
 * SAFE REQUEST BODY PARSER
 * ----------------------------------------------------
 *
 * The deletion reason is optional, so an empty request
 * body is valid and is treated as an empty object.
 */
async function readRequestBody(
  request: Request
): Promise<
  | {
      success: true;
      payload: Record<string, unknown>;
    }
  | {
      success: false;
    }
> {
  try {
    const text =
      await request.text();

    if (!text.trim()) {
      return {
        success: true,
        payload: {},
      };
    }

    const parsed: unknown =
      JSON.parse(text);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {
        success: false,
      };
    }

    return {
      success: true,
      payload:
        parsed as Record<
          string,
          unknown
        >,
    };
  } catch {
    return {
      success: false,
    };
  }
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
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const business =
      await prisma.business.findUnique({
        where: {
          ownerId:
            auth.user.id,
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
          status: 200,
          headers:
            jsonHeaders(),
        }
      );
    }

    const request =
      await prisma.businessDeletionRequest.findFirst(
        {
          where: {
            businessId:
              business.id,
          },

          orderBy: {
            createdAt:
              "desc",
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
        status: 200,
        headers:
          jsonHeaders(),
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
        headers:
          jsonHeaders(),
      }
    );
  }
}

/*
 * ----------------------------------------------------
 * POST
 * ----------------------------------------------------
 *
 * Creates a deletion request for the authenticated
 * seller's own business.
 *
 * IMPORTANT:
 * The business is NOT deleted here.
 * Admin review is required.
 */
export async function POST(
  request: Request
) {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body =
      await readRequestBody(
        request
      );

    if (!body.success) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    const reason =
      cleanString(
        body.payload.reason
      );

    if (
      reason.length > 2000
    ) {
      return NextResponse.json(
        {
          error:
            "Deletion reason is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * Find the seller's own business.
     *
     * ownerId comes from the authenticated session,
     * never from the request body.
     */
    const business =
      await prisma.business.findUnique({
        where: {
          ownerId:
            auth.user.id,
        },

        select: {
          id: true,
          name: true,
          ownerId: true,
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
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * Defensive ownership check.
     *
     * requireSeller() already establishes the
     * authenticated seller identity.
     */
    if (
      business.ownerId !==
      auth.user.id
    ) {
      return NextResponse.json(
        {
          error:
            "You are not allowed to request deletion of this business.",
        },
        {
          status: 403,
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * A soft-deleted business cannot receive
     * another deletion request.
     */
    if (business.deletedAt) {
      return NextResponse.json(
        {
          error:
            "This business has already been deleted.",
        },
        {
          status: 410,
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * Only one PENDING deletion request is allowed
     * at a time for a business.
     *
     * This lookup provides a friendly response for the
     * normal case. The database unique constraint is the
     * final concurrency protection.
     */
    const pendingRequest =
      await prisma.businessDeletionRequest.findFirst({
        where: {
          businessId:
            business.id,

          status:
            "PENDING",
        },

        orderBy: {
          createdAt:
            "desc",
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
      });

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
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * Create a new deletion request.
     *
     * requestedById is always the authenticated
     * seller's user ID.
     *
     * The schema has:
     *
     * @@unique([
     *   businessId,
     *   requestedById,
     *   status
     * ])
     *
     * Therefore a concurrent request that attempts
     * to create the same PENDING record will produce
     * Prisma error P2002. That case is converted into
     * the same client-friendly 409 response.
     */
    try {
      const deletionRequest =
        await prisma.businessDeletionRequest.create({
          data: {
            businessId:
              business.id,

            requestedById:
              auth.user.id,

            reason:
              reason || null,

            status:
              "PENDING",
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
        });

      return NextResponse.json(
        {
          message:
            "Business deletion request submitted successfully.",

          request:
            deletionRequest,
        },
        {
          status: 201,
          headers:
            jsonHeaders(),
        }
      );
    } catch (error) {
      /*
       * Database-level concurrency protection.
       *
       * If another request created the same PENDING
       * deletion request after our application-level
       * lookup, Prisma will raise P2002.
       */
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const latestPendingRequest =
          await prisma.businessDeletionRequest.findFirst(
            {
              where: {
                businessId:
                  business.id,

                requestedById:
                  auth.user.id,

                status:
                  "PENDING",
              },

              orderBy: {
                createdAt:
                  "desc",
              },

              select: {
                id: true,
                businessId:
                  true,
                reason: true,
                status: true,
                reviewedAt:
                  true,
                createdAt:
                  true,
                updatedAt:
                  true,
              },
            }
          );

        return NextResponse.json(
          {
            error:
              "A business deletion request is already pending.",

            request:
              latestPendingRequest,
          },
          {
            status: 409,
            headers:
              jsonHeaders(),
          }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error(
      "Seller deletion request creation error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to submit deletion request.",
      },
      {
        status: 500,
        headers:
          jsonHeaders(),
      }
    );
  }
}