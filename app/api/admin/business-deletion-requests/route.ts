import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

const ALLOWED_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

type DeletionRequestStatus =
  (typeof ALLOWED_STATUSES)[number];

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
 * Returns seller business deletion requests for admins.
 *
 * Query:
 *   ?status=PENDING
 *   ?status=APPROVED
 *   ?status=REJECTED
 *
 * When no status is supplied, all requests are returned.
 */
export async function GET(
  request: Request
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const url =
      new URL(request.url);

    const statusParam =
      cleanString(
        url.searchParams.get(
          "status"
        )
      );

    let status:
      | DeletionRequestStatus
      | undefined;

    if (statusParam) {
      if (
        !ALLOWED_STATUSES.includes(
          statusParam as DeletionRequestStatus
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid deletion request status.",
          },
          {
            status: 400,
            headers: jsonHeaders(),
          }
        );
      }

      status =
        statusParam as DeletionRequestStatus;
    }

    const requests =
      await prisma.businessDeletionRequest.findMany(
        {
          where: status
            ? {
                status,
              }
            : undefined,

          orderBy: {
            createdAt: "desc",
          },

          include: {
            business: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                ownerName: true,
                status: true,
                verification: true,
                deletedAt: true,
                location: {
                  select: {
                    id: true,
                    area: true,
                  },
                },
              },
            },

            requestedBy: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },

            reviewedBy: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        }
      );

    return NextResponse.json(
      {
        requests,
        count: requests.length,
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin deletion requests fetch error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load deletion requests.",
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
 * PATCH
 * ----------------------------------------------------
 *
 * Admin reviews one deletion request.
 *
 * Body:
 * {
 *   "id": "...",
 *   "status": "APPROVED"
 * }
 *
 * APPROVED:
 *   - request becomes APPROVED
 *   - business gets deletedAt
 *
 * REJECTED:
 *   - request becomes REJECTED
 *   - business remains unchanged
 */
export async function PATCH(
  request: Request
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
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
      body as Record<string, unknown>;

    const id = cleanString(
      payload.id
    );

    const statusValue =
      cleanString(
        payload.status
      );

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Deletion request ID is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      !statusValue ||
      !ALLOWED_STATUSES.includes(
        statusValue as DeletionRequestStatus
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Status must be APPROVED or REJECTED.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const newStatus =
      statusValue as DeletionRequestStatus;

    /*
     * Admin review should only move a pending
     * request into APPROVED or REJECTED.
     */
    if (
      newStatus !== "APPROVED" &&
      newStatus !== "REJECTED"
    ) {
      return NextResponse.json(
        {
          error:
            "Admin can only approve or reject a pending deletion request.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const deletionRequest =
      await prisma.businessDeletionRequest.findUnique(
        {
          where: {
            id,
          },

          include: {
            business: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                deletedAt: true,
              },
            },
          },
        }
      );

    if (!deletionRequest) {
      return NextResponse.json(
        {
          error:
            "Deletion request not found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Only PENDING requests can be reviewed.
     */
    if (
      deletionRequest.status !==
      "PENDING"
    ) {
      return NextResponse.json(
        {
          error:
            `This deletion request has already been ${deletionRequest.status.toLowerCase()}.`,
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * The request is tied to a business through
     * the schema relation.
     */
    if (!deletionRequest.business) {
      return NextResponse.json(
        {
          error:
            "The business associated with this request no longer exists.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Prevent an approval operation from
     * pretending to delete an already deleted
     * business.
     */
    if (
      newStatus === "APPROVED" &&
      deletionRequest.business
        .deletedAt
    ) {
      return NextResponse.json(
        {
          error:
            "This business has already been deleted.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Review and business soft deletion happen
     * inside one transaction.
     */
    const result =
      await prisma.$transaction(
        async (tx) => {
          const reviewedAt =
            new Date();

          if (
            newStatus ===
            "APPROVED"
          ) {
            /*
             * Soft delete the business.
             *
             * Do not hard-delete the row.
             */
            await tx.business.update({
              where: {
                id:
                  deletionRequest
                    .business
                    .id,
              },

              data: {
                deletedAt:
                  reviewedAt,
              },
            });
          }

          const updatedRequest =
            await tx.businessDeletionRequest.update(
              {
                where: {
                  id,
                },

                data: {
                  status:
                    newStatus,

                  reviewedById:
                    auth.user.id,

                  reviewedAt,
                },

                include: {
                  business: {
                    select: {
                      id: true,
                      name: true,
                      ownerId: true,
                      ownerName: true,
                      status: true,
                      verification:
                        true,
                      deletedAt:
                        true,
                      location: {
                        select: {
                          id: true,
                          area: true,
                        },
                      },
                    },
                  },

                  requestedBy: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      role: true,
                    },
                  },

                  reviewedBy: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      role: true,
                    },
                  },
                },
              }
            );

          return updatedRequest;
        }
      );

    return NextResponse.json({
      message:
        newStatus === "APPROVED"
          ? "Business deletion request approved and business soft-deleted successfully."
          : "Business deletion request rejected successfully.",

      request: result,
    });
  } catch (error) {
    console.error(
      "Admin deletion request review error:",
      error
    );

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "The deletion request or business could not be found.",
        },
        {
          status: 404,
          headers: jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to review deletion request.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}