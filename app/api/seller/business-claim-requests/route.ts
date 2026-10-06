import { Prisma, NotificationPriority, NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";
import { createNotification } from "@/lib/notifications";

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

/* --------------------------------------------------
 * GET
 *
 * Returns only claim requests created by
 * the authenticated seller.
 * -------------------------------------------------- */

export async function GET(
  request: Request
) {
  const auth = await requireSeller();

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
        where: {
          requestedById:
            auth.user.id,

          ...(rawStatus
            ? {
                status:
                  rawStatus as ClaimStatus,
              }
            : {}),
        },

        orderBy: {
          createdAt: "desc",
        },

        include: {
          business: {
            select: {
              id: true,
              name: true,
              ownerId: true,
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

          reviewedBy: {
            select: {
              id: true,
              name: true,
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
      "Seller claim requests GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load your claim requests.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}

/* --------------------------------------------------
 * POST
 *
 * Seller requests ownership of an existing
 * unowned business.
 *
 * Seller never receives ownership directly.
 * Admin must approve.
 * -------------------------------------------------- */

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

    const businessId =
      cleanString(
        body.businessId
      );

    const reason =
      cleanString(body.reason);

    if (!businessId) {
      return NextResponse.json(
        {
          error:
            "Business ID is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (reason.length > 1000) {
      return NextResponse.json(
        {
          error:
            "Reason is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const existingOwnedBusiness =
      await prisma.business.findUnique({
        where: {
          ownerId: auth.user.id,
        },
        select: {
          id: true,
        },
      });

    if (existingOwnedBusiness) {
      return NextResponse.json(
        {
          error:
            "This seller account already owns a business.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    const business =
      await prisma.business.findUnique({
        where: {
          id: businessId,
        },
        select: {
          id: true,
          name: true,
          ownerId: true,
          status: true,
          deletedAt: true,
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
          headers: jsonHeaders(),
        }
      );
    }

    if (business.deletedAt) {
      return NextResponse.json(
        {
          error:
            "This business has been deleted.",
        },
        {
          status: 410,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      business.status !==
      "ACTIVE"
    ) {
      return NextResponse.json(
        {
          error:
            "Only active businesses can be claimed.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    if (business.ownerId) {
      return NextResponse.json(
        {
          error:
            "This business is already claimed.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    const claim =
      await prisma.businessClaimRequest.create({
        data: {
          businessId,

          requestedById:
            auth.user.id,

          reason:
            reason || null,

          status: "PENDING",
        },

        include: {
          business: {
            select: {
              id: true,
              name: true,
              ownerId: true,
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
        },
      });

    /*
     * ------------------------------------------------
     * NOTIFY ADMINS
     * ------------------------------------------------
     *
     * The claim has now been successfully created.
     *
     * Every admin receives a separate notification.
     *
     * Notification failure must never cause the
     * successful claim submission to fail.
     * ------------------------------------------------
     */

    try {
      const admins =
        await prisma.user.findMany({
          where: {
            role: "ADMIN",
          },

          select: {
            id: true,
          },
        });

      for (
        const admin of admins
      ) {
        try {
          await createNotification({
            userId:
              admin.id,

            type:
              NotificationType.CLAIM_SUBMITTED,

            title:
              "New business claim request",

            message:
              `${auth.user.name ?? "A seller"} has requested ownership of "${claim.business.name}".`,

            priority:
              NotificationPriority.HIGH,

            data: {
              claimId:
                claim.id,

              businessId:
                claim.business.id,
            },

            dedupeKey:
              `claim:${claim.id}:submitted:admin:${admin.id}`,
          });
        } catch (
          notificationError
        ) {
          console.error(
            "Claim admin notification error:",
            notificationError
          );
        }
      }
    } catch (
      adminLookupError
    ) {
      console.error(
        "Claim admin lookup error:",
        adminLookupError
      );
    }

    return NextResponse.json(
      {
        message:
          "Business claim request submitted successfully.",

        claim,
      },
      {
        status: 201,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "You already have a pending claim request for this business.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    console.error(
      "Seller claim request POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to submit business claim request.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}