import {
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notifications";

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
 * NOTIFY SELLER
 * ----------------------------------------------------
 *
 * Notifications are sent only after the underlying
 * deletion-review operation succeeds.
 *
 * Notification failures must never turn a successful
 * deletion review into a failed request.
 */
async function notifyDeletionRequester(
  input: {
    userId: string | null;
    deletionRequestId: string;
    businessId: string;
    businessName: string;
    type: NotificationType;
    title: string;
    message: string;
  }
): Promise<void> {
  const userId =
    cleanString(
      input.userId
    );

  if (!userId) {
    return;
  }

  try {
    await createNotification({
      userId,

      type:
        input.type,

      title:
        input.title,

      message:
        input.message,

      priority:
        NotificationPriority.HIGH,

      data: {
        deletionRequestId:
          input.deletionRequestId,

        businessId:
          input.businessId,
      },

      dedupeKey:
        `business-deletion:${input.deletionRequestId}:${input.type}:seller:${userId}`,
    });
  } catch (error) {
    console.error(
      "Business deletion notification error:",
      error
    );
  }
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

    const id =
      cleanString(payload.id);

    const statusValue =
      cleanString(payload.status);

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

    /*
     * Initial lookup is used for clear error responses.
     *
     * It is NOT the final concurrency guard.
     * The transaction below checks PENDING again.
     */
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

    if (
      newStatus === "APPROVED" &&
      deletionRequest.business.deletedAt
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

    const result =
      await prisma.$transaction(
        async (tx) => {
          const reviewedAt =
            new Date();

          /*
           * Re-read inside the transaction.
           *
           * This is the authoritative state used
           * for the review operation.
           */
          const currentRequest =
            await tx.businessDeletionRequest.findUnique(
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

          if (!currentRequest) {
            throw new Error(
              "DELETION_REQUEST_NOT_FOUND"
            );
          }

          if (
            currentRequest.status !==
            "PENDING"
          ) {
            throw new Error(
              "DELETION_REQUEST_ALREADY_REVIEWED"
            );
          }

          if (!currentRequest.business) {
            throw new Error(
              "BUSINESS_NOT_FOUND"
            );
          }

          /*
           * Approval must only soft-delete a
           * business that is still active in
           * terms of deletedAt.
           */
          if (
            newStatus === "APPROVED"
          ) {
            const businessUpdate =
              await tx.business.updateMany(
                {
                  where: {
                    id:
                      currentRequest
                        .business
                        .id,

                    deletedAt: null,
                  },

                  data: {
                    deletedAt:
                      reviewedAt,
                  },
                }
              );

            if (
              businessUpdate.count !==
              1
            ) {
              throw new Error(
                "BUSINESS_ALREADY_DELETED"
              );
            }
          }

          /*
           * Critical concurrency guard:
           *
           * The request can only move from
           * PENDING to APPROVED/REJECTED here.
           */
          const requestUpdate =
            await tx.businessDeletionRequest.updateMany(
              {
                where: {
                  id,

                  status:
                    "PENDING",
                },

                data: {
                  status:
                    newStatus,

                  reviewedById:
                    auth.user.id,

                  reviewedAt,
                },
              }
            );

          if (
            requestUpdate.count !==
            1
          ) {
            throw new Error(
              "DELETION_REQUEST_ALREADY_REVIEWED"
            );
          }

          const updatedRequest =
            await tx.businessDeletionRequest.findUnique(
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

          if (!updatedRequest) {
            throw new Error(
              "DELETION_REQUEST_NOT_FOUND"
            );
          }

          return updatedRequest;
        }
      );

    /*
     * ------------------------------------------------
     * SELLER NOTIFICATION
     * ------------------------------------------------
     *
     * The review operation and, when approved,
     * business soft-delete have already succeeded.
     *
     * The notification is intentionally outside the
     * transaction so notification errors cannot undo
     * the successful review.
     */

    if (
      result.requestedBy &&
      result.business
    ) {
      if (
        newStatus ===
        "APPROVED"
      ) {
        await notifyDeletionRequester({
          userId:
            result.requestedBy.id,

          deletionRequestId:
            result.id,

          businessId:
            result.business.id,

          businessName:
            result.business.name,

          type:
            NotificationType.BUSINESS_DELETION_APPROVED,

          title:
            "Business deletion approved",

          message:
            `Your request to delete "${result.business.name}" has been approved. The business has been removed from ReMarket.`,
        });
      } else {
        await notifyDeletionRequester({
          userId:
            result.requestedBy.id,

          deletionRequestId:
            result.id,

          businessId:
            result.business.id,

          businessName:
            result.business.name,

          type:
            NotificationType.BUSINESS_DELETION_REJECTED,

          title:
            "Business deletion rejected",

          message:
            `Your request to delete "${result.business.name}" has been rejected by a ReMarket admin.`,
        });
      }
    }

    return NextResponse.json(
      {
        message:
          newStatus === "APPROVED"
            ? "Business deletion request approved and business soft-deleted successfully."
            : "Business deletion request rejected successfully.",

        request: result,
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin deletion request review error:",
      error
    );

    if (
      error instanceof Error
    ) {
      if (
        error.message ===
        "DELETION_REQUEST_NOT_FOUND"
      ) {
        return NextResponse.json(
          {
            error:
              "The deletion request could not be found.",
          },
          {
            status: 404,
            headers: jsonHeaders(),
          }
        );
      }

      if (
        error.message ===
        "DELETION_REQUEST_ALREADY_REVIEWED"
      ) {
        return NextResponse.json(
          {
            error:
              "This deletion request has already been reviewed.",
          },
          {
            status: 409,
            headers: jsonHeaders(),
          }
        );
      }

      if (
        error.message ===
        "BUSINESS_NOT_FOUND"
      ) {
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

      if (
        error.message ===
        "BUSINESS_ALREADY_DELETED"
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