import {
  Prisma,
  NotificationPriority,
  NotificationType,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";
import { createNotification } from "@/lib/notifications";

const CLAIM_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const MIN_REASON_LENGTH = 20;
const MAX_REASON_LENGTH = 1000;
const MAX_BUSINESS_ID_LENGTH = 200;

function jsonHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: jsonHeaders() }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isClaimStatus(value: string): value is ClaimStatus {
  return CLAIM_STATUSES.includes(value as ClaimStatus);
}

/**
 * Deliberately excludes business.ownerId and reviewedBy.
 * Those are internal identifiers and are not needed by the seller page.
 */
const CLAIM_RESPONSE_SELECT = {
  id: true,
  businessId: true,
  reason: true,
  status: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  business: {
    select: {
      id: true,
      name: true,
      status: true,
      verification: true,
      deletedAt: true,
      location: {
        select: {
          area: true,
        },
      },
    },
  },
} as const;

/* --------------------------------------------------
 * GET
 *
 * Returns only claims submitted by the authenticated
 * seller. Internal owner IDs and reviewer IDs are not
 * included in the response.
 * -------------------------------------------------- */

export async function GET(request: Request) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const rawStatus = cleanString(url.searchParams.get("status")).toUpperCase();

    if (rawStatus && !isClaimStatus(rawStatus)) {
      return jsonError("Invalid claim request status.", 400);
    }

    const requests = await prisma.businessClaimRequest.findMany({
      where: {
        requestedById: auth.user.id,
        ...(rawStatus ? { status: rawStatus as ClaimStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: CLAIM_RESPONSE_SELECT,
    });

    return NextResponse.json(
      { requests, total: requests.length },
      { headers: jsonHeaders() }
    );
  } catch (error) {
    console.error("Seller claim requests GET error:", error);
    return jsonError("Unable to load your claim requests.", 500);
  }
}

/* --------------------------------------------------
 * POST
 *
 * Creates a claim request only. It never transfers
 * business ownership. An authorized admin must verify
 * the evidence and approve the request separately.
 *
 * Checks run in a SERIALIZABLE transaction so two
 * simultaneous submissions cannot both pass the same
 * eligibility checks under normal PostgreSQL/Prisma
 * transaction semantics.
 * -------------------------------------------------- */

export async function POST(request: Request) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  if (!isRecord(body)) {
    return jsonError("Invalid request body.", 400);
  }

  const businessId = cleanString(body.businessId);
  const reason = cleanString(body.reason);

  if (!businessId) {
    return jsonError("Business ID is required.", 400);
  }

  if (businessId.length > MAX_BUSINESS_ID_LENGTH) {
    return jsonError("Business ID is too long.", 400);
  }

  if (reason.length < MIN_REASON_LENGTH) {
    return jsonError(
      `Please explain why you are authorized to claim this business (at least ${MIN_REASON_LENGTH} characters).`,
      400
    );
  }

  if (reason.length > MAX_REASON_LENGTH) {
    return jsonError(
      `Your reason must not exceed ${MAX_REASON_LENGTH} characters.`,
      400
    );
  }

  // Store the successfully created claim, not the full result union.
  // The union also contains error variants that do not have a `business` field.
  let createdClaim: ClaimResponse | null = null;

  try {
    const result = await createClaimRequest({
      businessId,
      reason,
      sellerId: auth.user.id,
    });

    if (result.kind !== "created") {
      switch (result.kind) {
        case "seller-already-owns-business":
          return jsonError(
            "This seller account already owns a business.",
            409
          );
        case "business-not-found":
          return jsonError("Business not found.", 404);
        case "business-deleted":
          return jsonError("This business has been deleted.", 410);
        case "business-not-active":
          return jsonError(
            "Only active businesses can be claimed.",
            409
          );
        case "business-already-owned":
          return jsonError(
            "This business is already claimed.",
            409
          );
        case "business-claim-pending":
          return jsonError(
            "A claim request for this business is already awaiting review.",
            409
          );
        case "seller-claim-pending":
          return jsonError(
            "You already have a pending business claim. Wait for it to be reviewed before submitting another.",
            409
          );
      }
    }

    createdClaim = result.claim;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return jsonError(
        "A matching claim request already exists. Refresh your claim history before trying again.",
        409
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return jsonError(
        "Another claim request was submitted at the same time. Refresh your claim history and try again if needed.",
        409
      );
    }

    console.error("Seller claim request POST error:", error);
    return jsonError("Unable to submit business claim request.", 500);
  }

  // Do not allow notification failure to undo a successfully created claim.
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    const notificationResults = await Promise.allSettled(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          type: NotificationType.CLAIM_SUBMITTED,
          title: "New business claim request",
          message: `${auth.user.name ?? "A seller"} has requested ownership of "${createdClaim!.business.name}".`,
          priority: NotificationPriority.HIGH,
          data: {
            claimId: createdClaim!.id,
            businessId: createdClaim!.business.id,
          },
          dedupeKey: `claim:${createdClaim!.id}:submitted:admin:${admin.id}`,
        })
      )
    );

    notificationResults.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `Claim admin notification error for admin ${admins[index]?.id ?? "unknown"}:`,
          result.reason
        );
      }
    });
  } catch (notificationError) {
    console.error("Claim admin notification error:", notificationError);
  }

  return NextResponse.json(
    {
      message: "Business claim request submitted successfully.",
      claim: createdClaim,
    },
    { status: 201, headers: jsonHeaders() }
  );
}

type ClaimResponse = Prisma.BusinessClaimRequestGetPayload<{
  select: typeof CLAIM_RESPONSE_SELECT;
}>;

type CreateClaimResult =
  | { kind: "seller-already-owns-business" }
  | { kind: "business-not-found" }
  | { kind: "business-deleted" }
  | { kind: "business-not-active" }
  | { kind: "business-already-owned" }
  | { kind: "business-claim-pending" }
  | { kind: "seller-claim-pending" }
  | { kind: "created"; claim: ClaimResponse };

async function createClaimRequest(input: {
  businessId: string;
  reason: string;
  sellerId: string;
}): Promise<CreateClaimResult> {
  return prisma.$transaction(
    async (tx) => {
      const ownedBusiness = await tx.business.findUnique({
        where: { ownerId: input.sellerId },
        select: { id: true },
      });

      if (ownedBusiness) {
        return { kind: "seller-already-owns-business" } as const;
      }

      const business = await tx.business.findUnique({
        where: { id: input.businessId },
        select: {
          id: true,
          name: true,
          ownerId: true,
          status: true,
          deletedAt: true,
        },
      });

      if (!business) {
        return { kind: "business-not-found" } as const;
      }

      if (business.deletedAt) {
        return { kind: "business-deleted" } as const;
      }

      if (business.status !== "ACTIVE") {
        return { kind: "business-not-active" } as const;
      }

      if (business.ownerId) {
        return { kind: "business-already-owned" } as const;
      }

      const pendingForBusiness = await tx.businessClaimRequest.findFirst({
        where: {
          businessId: input.businessId,
          status: "PENDING",
        },
        select: { id: true },
      });

      if (pendingForBusiness) {
        return { kind: "business-claim-pending" } as const;
      }

      const pendingForSeller = await tx.businessClaimRequest.findFirst({
        where: {
          requestedById: input.sellerId,
          status: "PENDING",
        },
        select: { id: true },
      });

      if (pendingForSeller) {
        return { kind: "seller-claim-pending" } as const;
      }

      const claim = await tx.businessClaimRequest.create({
        data: {
          businessId: input.businessId,
          requestedById: input.sellerId,
          reason: input.reason,
          status: "PENDING",
        },
        select: CLAIM_RESPONSE_SELECT,
      });

      return { kind: "created", claim } as const;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
}
