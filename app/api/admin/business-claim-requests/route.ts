import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

const CLAIM_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

type ClaimStatus =
  (typeof CLAIM_STATUSES)[number];

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isClaimStatus(
  value: string
): value is ClaimStatus {
  return CLAIM_STATUSES.includes(
    value as ClaimStatus
  );
}

class ClaimConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "ClaimConflictError";
  }
}

class ClaimNotFoundError extends Error {
  constructor() {
    super(
      "Business claim request not found."
    );

    this.name =
      "ClaimNotFoundError";
  }
}

/* --------------------------------------------------
 * GET
 *
 * Admin-only claim queue.
 * -------------------------------------------------- */

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

    const rawStatus =
      cleanString(
        url.searchParams.get(
          "status"
        )
      ).toUpperCase();

    if (
      rawStatus &&
      !isClaimStatus(
        rawStatus
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid claim request status.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const requests =
      await prisma.businessClaimRequest.findMany({
        where: rawStatus
          ? {
              status:
                rawStatus as ClaimStatus,
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
      });

    return NextResponse.json(
      {
        requests,

        total:
          requests.length,
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin claim requests GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load business claim requests.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/* --------------------------------------------------
 * PATCH
 *
 * status = APPROVED | REJECTED
 * -------------------------------------------------- */

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

    if (!isRecord(body)) {
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

    const requestId =
      cleanString(
        body.requestId
      );

    const rawStatus =
      cleanString(
        body.status
      ).toUpperCase();

    if (!requestId) {
      return NextResponse.json(
        {
          error:
            "Claim request ID is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      rawStatus !== "APPROVED" &&
      rawStatus !== "REJECTED"
    ) {
      return NextResponse.json(
        {
          error:
            "Admin can only approve or reject a pending claim request.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /* ------------------------------------------------
     * REJECT
     * ------------------------------------------------ */

    if (
      rawStatus === "REJECTED"
    ) {
      const result =
        await prisma.businessClaimRequest.updateMany({
          where: {
            id: requestId,
            status: "PENDING",
          },

          data: {
            status: "REJECTED",

            reviewedById:
              auth.user.id,

            reviewedAt:
              new Date(),
          },
        });

      if (result.count !== 1) {
        const existing =
          await prisma.businessClaimRequest.findUnique({
            where: {
              id: requestId,
            },

            select: {
              id: true,
              status: true,
            },
          });

        if (!existing) {
          return NextResponse.json(
            {
              error:
                "Business claim request not found.",
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
              "This claim request has already been reviewed.",
            status:
              existing.status,
          },
          {
            status: 409,
            headers: jsonHeaders(),
          }
        );
      }

      const claim =
        await prisma.businessClaimRequest.findUnique({
          where: {
            id: requestId,
          },

          include: {
            business: {
              select: {
                id: true,
                name: true,
                ownerId: true,
              },
            },

            requestedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },

            reviewedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

      return NextResponse.json(
        {
          message:
            "Business claim request rejected.",

          claim,
        },
        {
          headers: jsonHeaders(),
        }
      );
    }

    /* ------------------------------------------------
     * APPROVE
     * ------------------------------------------------ */

    const MAX_RETRIES = 3;

    for (
      let attempt = 0;
      attempt < MAX_RETRIES;
      attempt++
    ) {
      try {
        const result =
          await prisma.$transaction(
            async (tx) => {
              const claim =
                await tx.businessClaimRequest.findUnique({
                  where: {
                    id: requestId,
                  },

                  select: {
                    id: true,
                    businessId: true,
                    requestedById: true,
                    reason: true,
                    status: true,
                  },
                });

              if (!claim) {
                throw new ClaimNotFoundError();
              }

              if (
                claim.status !==
                "PENDING"
              ) {
                throw new ClaimConflictError(
                  "This claim request has already been reviewed."
                );
              }

              const business =
                await tx.business.findUnique({
                  where: {
                    id: claim.businessId,
                  },

                  select: {
                    id: true,
                    name: true,
                    ownerId: true,
                    deletedAt: true,
                    status: true,
                  },
                });

              if (!business) {
                throw new ClaimConflictError(
                  "The business for this claim no longer exists."
                );
              }

              if (
                business.deletedAt
              ) {
                throw new ClaimConflictError(
                  "The business for this claim has been deleted."
                );
              }

              if (
                business.status !==
                "ACTIVE"
              ) {
                throw new ClaimConflictError(
                  "Only active businesses can be approved for ownership."
                );
              }

              if (
                business.ownerId
              ) {
                throw new ClaimConflictError(
                  "This business has already been claimed by another seller."
                );
              }

              const existingSellerBusiness =
                await tx.business.findUnique({
                  where: {
                    ownerId:
                      claim.requestedById,
                  },

                  select: {
                    id: true,
                  },
                });

              if (
                existingSellerBusiness
              ) {
                throw new ClaimConflictError(
                  "This seller already owns a business."
                );
              }

              const businessUpdate =
                await tx.business.updateMany({
                  where: {
                    id:
                      business.id,

                    ownerId: null,

                    deletedAt: null,
                  },

                  data: {
                    ownerId:
                      claim.requestedById,
                  },
                });

              if (
                businessUpdate.count !==
                1
              ) {
                throw new ClaimConflictError(
                  "The business is no longer available for this claim."
                );
              }

              const claimUpdate =
                await tx.businessClaimRequest.updateMany({
                  where: {
                    id: requestId,
                    status: "PENDING",
                  },

                  data: {
                    status: "APPROVED",

                    reviewedById:
                      auth.user.id,

                    reviewedAt:
                      new Date(),
                  },
                });

              if (
                claimUpdate.count !==
                1
              ) {
                throw new ClaimConflictError(
                  "The claim request was reviewed by another admin."
                );
              }

              return tx.businessClaimRequest.findUnique({
                where: {
                  id: requestId,
                },

                include: {
                  business: {
                    select: {
                      id: true,
                      name: true,
                      ownerId: true,
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
              });
            },
            {
              isolationLevel:
                Prisma.TransactionIsolationLevel.Serializable,
            }
          );

        return NextResponse.json(
          {
            message:
              "Business claim request approved.",

            claim: result,
          },
          {
            headers:
              jsonHeaders(),
          }
        );
      } catch (error) {
        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034"
        ) {
          if (
            attempt ===
            MAX_RETRIES - 1
          ) {
            return NextResponse.json(
              {
                error:
                  "The approval conflicted with another ownership change. Please try again.",
              },
              {
                status: 409,
                headers:
                  jsonHeaders(),
              }
            );
          }

          continue;
        }

        if (
          error instanceof
          ClaimNotFoundError
        ) {
          return NextResponse.json(
            {
              error:
                error.message,
            },
            {
              status: 404,
              headers:
                jsonHeaders(),
            }
          );
        }

        if (
          error instanceof
          ClaimConflictError
        ) {
          return NextResponse.json(
            {
              error:
                error.message,
            },
            {
              status: 409,
              headers:
                jsonHeaders(),
            }
          );
        }

        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return NextResponse.json(
            {
              error:
                "This seller already owns a business, or the business ownership was claimed concurrently.",
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
    }

    return NextResponse.json(
      {
        error:
          "Unable to approve business claim request.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin claim request PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update business claim request.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}