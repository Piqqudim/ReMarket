import {
  Prisma,
  Role,
  UserAccountStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 100_000;
const MAX_BUYER_ID_LENGTH = 100;
const MAX_BODY_BYTES = 8 * 1024;
const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type RouteContext = { params: Promise<{ id: string }> };
type BuyerStatus = UserAccountStatus;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

function parsePositiveInteger(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBuyerStatus(value: unknown): value is BuyerStatus {
  return value === UserAccountStatus.ACTIVE || value === UserAccountStatus.SUSPENDED;
}

async function readJsonBody(request: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false; reason: "TOO_LARGE" | "INVALID_JSON" }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0) return { ok: false, reason: "INVALID_JSON" };
    if (declared > MAX_BODY_BYTES) return { ok: false, reason: "TOO_LARGE" };
  }

  if (!request.body) return { ok: false, reason: "INVALID_JSON" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(decoded) as unknown };
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  }
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** GET /api/admin/buyers/[id] — buyer profile and paginated order history. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { id } = await context.params;
    const buyerId = typeof id === "string" ? id.trim() : "";
    if (!buyerId || buyerId.length > MAX_BUYER_ID_LENGTH) return jsonError("Invalid buyer ID.", 400);

    const params = new URL(request.url).searchParams;
    const page = parsePositiveInteger(params.get("page"), 1, MAX_PAGE);
    const pageSize = parsePositiveInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    if (page === null || pageSize === null) {
      return jsonError("Invalid pagination. Page must be positive and pageSize must be between 1 and 50.", 400);
    }

    const skip = (page - 1) * pageSize;
    if (!Number.isSafeInteger(skip)) return jsonError("The requested page is too large.", 400);

    const buyer = await prisma.user.findFirst({
      where: { id: buyerId, role: Role.BUYER },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        accountStatus: true,
        suspendedAt: true,
        createdAt: true,
      },
    });
    if (!buyer) return jsonError("Buyer not found.", 404);

    const where = { buyerId: buyer.id };
    const [orders, totalOrders] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        select: {
          id: true,
          orderCode: true,
          status: true,
          itemsSubtotal: true,
          deliveryFee: true,
          deliveryFeeStatus: true,
          totalAmount: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { sellerOrders: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const totalPages = Math.ceil(totalOrders / pageSize);
    return NextResponse.json({
      success: true,
      buyer,
      orders: orders.map(({ _count, ...order }) => ({ ...order, sellerOrderCount: _count.sellerOrders })),
      pagination: {
        page,
        pageSize,
        total: totalOrders,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
      generatedAt: new Date().toISOString(),
    }, { headers: noStore });
  } catch (error) {
    console.error("Admin buyer detail GET error:", error);
    return jsonError("Unable to load buyer details.", 500);
  }
}

/** PATCH /api/admin/buyers/[id] — suspend or restore a buyer account. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { id } = await context.params;
    const buyerId = typeof id === "string" ? id.trim() : "";
    if (!buyerId || buyerId.length > MAX_BUYER_ID_LENGTH) return jsonError("Invalid buyer ID.", 400);

    const bodyResult = await readJsonBody(request);
    if (!bodyResult.ok) {
      return bodyResult.reason === "TOO_LARGE"
        ? jsonError("Request body is too large.", 413)
        : jsonError("Request body must contain valid JSON.", 400);
    }
    if (!isRecord(bodyResult.value)) return jsonError("Invalid request body.", 400);

    const unsupported = Object.keys(bodyResult.value).filter((key) => key !== "accountStatus" && key !== "reason");
    if (unsupported.length) return jsonError(`Unsupported fields: ${unsupported.join(", ")}.`, 400);

    const targetStatus = bodyResult.value.accountStatus;
    if (!isBuyerStatus(targetStatus)) {
      return jsonError("accountStatus must be ACTIVE or SUSPENDED.", 400);
    }

    const rawReason = bodyResult.value.reason;
    if (typeof rawReason !== "string") return jsonError("A reason is required.", 400);
    const reason = rawReason.trim();
    if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
      return jsonError(`The reason must be between ${MIN_REASON_LENGTH} and ${MAX_REASON_LENGTH} characters.`, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findFirst({
        where: { id: buyerId, role: Role.BUYER },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          accountStatus: true,
          suspendedAt: true,
          createdAt: true,
        },
      });
      if (!current) return { kind: "NOT_FOUND" as const };

      if (current.accountStatus === targetStatus) {
        return { kind: "UNCHANGED" as const, buyer: current };
      }

      const changedAt = new Date();
      const update = await tx.user.updateMany({
        where: { id: current.id, role: Role.BUYER, accountStatus: current.accountStatus },
        data: {
          accountStatus: targetStatus,
          suspendedAt: targetStatus === UserAccountStatus.SUSPENDED ? changedAt : null,
        },
      });
      if (update.count !== 1) throw new Error("BUYER_ACCOUNT_STATUS_CONFLICT");

      const updated = await tx.user.findUnique({
        where: { id: current.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          accountStatus: true,
          suspendedAt: true,
          createdAt: true,
        },
      });
      if (!updated) throw new Error("BUYER_NOT_FOUND_AFTER_UPDATE");

      await writeAdminAuditLog(tx, {
        adminId: auth.user.id,
        action: targetStatus === UserAccountStatus.SUSPENDED
          ? "BUYER_ACCOUNT_SUSPENDED_BY_ADMIN"
          : "BUYER_ACCOUNT_RESTORED_BY_ADMIN",
        entityType: "USER",
        entityId: current.id,
        reason,
        beforeData: {
          id: current.id,
          name: current.name,
          email: current.email,
          role: current.role,
          accountStatus: current.accountStatus,
          suspendedAt: current.suspendedAt?.toISOString() ?? null,
        } as Prisma.InputJsonValue,
        afterData: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          accountStatus: updated.accountStatus,
          suspendedAt: updated.suspendedAt?.toISOString() ?? null,
        } as Prisma.InputJsonValue,
        metadata: {
          previousStatus: current.accountStatus,
          newStatus: targetStatus,
          changedAt: changedAt.toISOString(),
          buyerEmail: current.email,
        } as Prisma.InputJsonValue,
      });

      return { kind: "UPDATED" as const, buyer: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "NOT_FOUND") return jsonError("Buyer not found.", 404);
    if (result.kind === "UNCHANGED") {
      return NextResponse.json({ success: true, alreadyInRequestedStatus: true, buyer: result.buyer }, { headers: noStore });
    }

    return NextResponse.json({
      success: true,
      message: targetStatus === UserAccountStatus.SUSPENDED
        ? "Buyer account suspended successfully."
        : "Buyer account restored successfully.",
      buyer: result.buyer,
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "BUYER_ACCOUNT_STATUS_CONFLICT") {
      return jsonError("The buyer account changed during this operation. Refresh and try again.", 409);
    }
    if (error instanceof Error && error.message === "BUYER_NOT_FOUND_AFTER_UPDATE") {
      return jsonError("Buyer could not be found after the update.", 404);
    }
    if (isPrismaErrorCode(error, "P2034")) {
      return jsonError("The buyer account changed during this operation. Refresh and try again.", 409);
    }
    console.error("Admin buyer account update error:", error);
    return jsonError("Unable to update buyer account status.", 500);
  }
}
