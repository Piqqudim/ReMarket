import {
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notifications";
import { writeAdminAuditLog } from "@/lib/admin-audit";

const ALLOWED_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const MAX_REQUEST_ID_LENGTH = 100;
const MAX_REASON_LENGTH = 500;
type DeletionRequestStatus = (typeof ALLOWED_STATUSES)[number];

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function jsonHeaders() {
  return { "Content-Type": "application/json", "Cache-Control": "private, no-store, max-age=0, must-revalidate", Pragma: "no-cache" };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: jsonHeaders() });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function notifyDeletionRequester(input: {
  userId: string | null;
  deletionRequestId: string;
  businessId: string;
  type: NotificationType;
  title: string;
  message: string;
}): Promise<void> {
  const userId = cleanString(input.userId);
  if (!userId) return;

  try {
    await createNotification({
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      priority: NotificationPriority.HIGH,
      data: { deletionRequestId: input.deletionRequestId, businessId: input.businessId },
      dedupeKey: `business-deletion:${input.deletionRequestId}:${input.type}:seller:${userId}`,
    });
  } catch (error) {
    console.error("Business deletion notification error:", error);
  }
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const statusParam = cleanString(new URL(request.url).searchParams.get("status"));
    let status: DeletionRequestStatus | undefined;

    if (statusParam) {
      if (!ALLOWED_STATUSES.includes(statusParam as DeletionRequestStatus)) {
        return jsonError("Invalid deletion request status.", 400);
      }
      status = statusParam as DeletionRequestStatus;
    }

    const requests = await prisma.businessDeletionRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        business: {
          select: {
            id: true, name: true, ownerId: true, ownerName: true,
            status: true, verification: true, deletedAt: true,
            location: { select: { id: true, area: true } },
          },
        },
        requestedBy: { select: { id: true, name: true, email: true, role: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json({ requests, count: requests.length }, { headers: jsonHeaders() });
  } catch (error) {
    console.error("Admin deletion requests fetch error:", error);
    return jsonError("Unable to load deletion requests.", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON request body.", 400);
    }

    if (!isRecord(body)) return jsonError("Invalid request body.", 400);

    const id = cleanString(body.id);
    const statusValue = cleanString(body.status);
    if (!id) return jsonError("Deletion request ID is required.", 400);
    if (id.length > MAX_REQUEST_ID_LENGTH) return jsonError("Invalid deletion request ID.", 400);

    if (!ALLOWED_STATUSES.includes(statusValue as DeletionRequestStatus) ||
      (statusValue !== "APPROVED" && statusValue !== "REJECTED")) {
      return jsonError("Status must be APPROVED or REJECTED.", 400);
    }

    let reason: string | null = null;
    if (body.reason !== undefined) {
      if (typeof body.reason !== "string") return jsonError("Review reason must be a string.", 400);
      reason = body.reason.trim() || null;
      if (reason && reason.length > MAX_REASON_LENGTH) {
        return jsonError(`Review reason must not exceed ${MAX_REASON_LENGTH} characters.`, 400);
      }
    }

    const newStatus = statusValue as Exclude<DeletionRequestStatus, "PENDING">;
    const deletionRequest = await prisma.businessDeletionRequest.findUnique({
      where: { id },
      include: { business: { select: { id: true, name: true, ownerId: true, deletedAt: true } } },
    });

    if (!deletionRequest) return jsonError("Deletion request not found.", 404);
    if (deletionRequest.status !== "PENDING") {
      return jsonError(`This deletion request has already been ${deletionRequest.status.toLowerCase()}.`, 409);
    }
    if (!deletionRequest.business) {
      return jsonError("The business associated with this request no longer exists.", 409);
    }
    if (newStatus === "APPROVED" && deletionRequest.business.deletedAt) {
      return jsonError("This business has already been deleted.", 409);
    }

    const result = await prisma.$transaction(async (tx) => {
      const reviewedAt = new Date();
      const currentRequest = await tx.businessDeletionRequest.findUnique({
        where: { id },
        include: { business: { select: { id: true, name: true, ownerId: true, deletedAt: true } } },
      });

      if (!currentRequest) throw new Error("DELETION_REQUEST_NOT_FOUND");
      if (currentRequest.status !== "PENDING") throw new Error("DELETION_REQUEST_ALREADY_REVIEWED");
      if (!currentRequest.business) throw new Error("BUSINESS_NOT_FOUND");

      const business = currentRequest.business;
      if (newStatus === "APPROVED") {
        const businessUpdate = await tx.business.updateMany({
          where: { id: business.id, deletedAt: null },
          data: { deletedAt: reviewedAt },
        });
        if (businessUpdate.count !== 1) throw new Error("BUSINESS_ALREADY_DELETED");
      }

      const requestUpdate = await tx.businessDeletionRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status: newStatus, reviewedById: auth.user.id, reviewedAt },
      });
      if (requestUpdate.count !== 1) throw new Error("DELETION_REQUEST_ALREADY_REVIEWED");

      const updatedRequest = await tx.businessDeletionRequest.findUnique({
        where: { id },
        include: {
          business: {
            select: {
              id: true, name: true, ownerId: true, ownerName: true,
              status: true, verification: true, deletedAt: true,
              location: { select: { id: true, area: true } },
            },
          },
          requestedBy: { select: { id: true, name: true, email: true, role: true } },
          reviewedBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });
      if (!updatedRequest) throw new Error("DELETION_REQUEST_NOT_FOUND");

      const beforeBusiness = {
        id: business.id,
        name: business.name,
        deletedAt: business.deletedAt?.toISOString() ?? null,
      };
      const afterBusiness = {
        id: updatedRequest.business?.id ?? business.id,
        name: updatedRequest.business?.name ?? business.name,
        deletedAt: updatedRequest.business?.deletedAt?.toISOString() ?? null,
      };

      await writeAdminAuditLog(tx, {
        adminId: auth.user.id,
        action: `BUSINESS_DELETION_REQUEST_${newStatus}_BY_ADMIN`,
        entityType: "BUSINESS_DELETION_REQUEST",
        entityId: currentRequest.id,
        reason,
        beforeData: {
          id: currentRequest.id,
          status: currentRequest.status,
          reviewedById: currentRequest.reviewedById,
          reviewedAt: currentRequest.reviewedAt?.toISOString() ?? null,
          business: beforeBusiness,
        } as Prisma.InputJsonValue,
        afterData: {
          id: updatedRequest.id,
          status: updatedRequest.status,
          reviewedById: auth.user.id,
          reviewedAt: reviewedAt.toISOString(),
          business: afterBusiness,
        } as Prisma.InputJsonValue,
        metadata: {
          decision: newStatus,
          businessId: business.id,
          businessName: business.name,
          requestedById: currentRequest.requestedById,
          approvedBusinessDeletion: newStatus === "APPROVED",
        } as Prisma.InputJsonValue,
      });

      if (newStatus === "APPROVED") {
        await writeAdminAuditLog(tx, {
          adminId: auth.user.id,
          action: "BUSINESS_DELETED_BY_ADMIN",
          entityType: "BUSINESS",
          entityId: business.id,
          reason,
          beforeData: beforeBusiness as Prisma.InputJsonValue,
          afterData: afterBusiness as Prisma.InputJsonValue,
          metadata: {
            source: "BUSINESS_DELETION_REQUEST",
            deletionRequestId: currentRequest.id,
            decision: newStatus,
          } as Prisma.InputJsonValue,
        });
      }

      return updatedRequest;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.requestedBy && result.business) {
      const approved = newStatus === "APPROVED";
      await notifyDeletionRequester({
        userId: result.requestedBy.id,
        deletionRequestId: result.id,
        businessId: result.business.id,
        type: approved
          ? NotificationType.BUSINESS_DELETION_APPROVED
          : NotificationType.BUSINESS_DELETION_REJECTED,
        title: approved ? "Business deletion approved" : "Business deletion rejected",
        message: approved
          ? `Your request to delete "${result.business.name}" has been approved. The business has been removed from ReMarket.`
          : `Your request to delete "${result.business.name}" has been rejected by a ReMarket admin.`,
      });
    }

    return NextResponse.json({
      message: newStatus === "APPROVED"
        ? "Business deletion request approved and business soft-deleted successfully."
        : "Business deletion request rejected successfully.",
      request: result,
    }, { headers: jsonHeaders() });
  } catch (error) {
    console.error("Admin deletion request review error:", error);

    if (error instanceof Error) {
      if (error.message === "DELETION_REQUEST_NOT_FOUND") return jsonError("The deletion request could not be found.", 404);
      if (error.message === "DELETION_REQUEST_ALREADY_REVIEWED") return jsonError("This deletion request has already been reviewed.", 409);
      if (error.message === "BUSINESS_NOT_FOUND") return jsonError("The business associated with this request no longer exists.", 409);
      if (error.message === "BUSINESS_ALREADY_DELETED") return jsonError("This business has already been deleted.", 409);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return jsonError("The deletion request changed during review. Reload and try again.", 409);
    }

    return jsonError("Unable to review deletion request.", 500);
  }
}
