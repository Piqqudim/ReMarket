import {
  BusinessStatus,
  Prisma,
  Role,
  SellerOrderStatus,
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
const MAX_SELLER_ID_LENGTH = 100;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type RouteContext = { params: Promise<{ id: string }> };

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status, headers: noStore });
}

function parsePositiveInteger(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

/**
 * GET /api/admin/sellers/[id]
 * Seller account, linked business, paginated product catalogue and seller-order history.
 * Separate pagination parameters:
 *   productPage, productPageSize, orderPage, orderPageSize
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { id } = await context.params;
    const sellerId = typeof id === "string" ? id.trim() : "";
    if (!sellerId || sellerId.length > MAX_SELLER_ID_LENGTH) return jsonError("Invalid seller ID.", 400);

    const params = new URL(request.url).searchParams;
    const productPage = parsePositiveInteger(params.get("productPage"), 1, MAX_PAGE);
    const productPageSize = parsePositiveInteger(params.get("productPageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const orderPage = parsePositiveInteger(params.get("orderPage"), 1, MAX_PAGE);
    const orderPageSize = parsePositiveInteger(params.get("orderPageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    if (productPage === null || productPageSize === null || orderPage === null || orderPageSize === null) {
      return jsonError("Invalid pagination. Page values must be positive and page sizes must be between 1 and 50.", 400);
    }

    const productSkip = (productPage - 1) * productPageSize;
    const orderSkip = (orderPage - 1) * orderPageSize;
    if (!Number.isSafeInteger(productSkip) || !Number.isSafeInteger(orderSkip)) {
      return jsonError("The requested page is too large.", 400);
    }

    const seller = await prisma.user.findFirst({
      where: { id: sellerId, role: Role.SELLER },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        accountStatus: true,
        suspendedAt: true,
        createdAt: true,
        business: {
          select: {
            id: true,
            name: true,
            ownerName: true,
            description: true,
            phone: true,
            imageUrl: true,
            availability: true,
            status: true,
            verification: true,
            priceMin: true,
            priceMax: true,
            deletedAt: true,
            createdAt: true,
            location: {
              select: {
                id: true,
                area: true,
                street: true,
                address: true,
                verification: true,
              },
            },
            categories: {
              select: {
                category: { select: { id: true, name: true } },
              },
            },
            socialLinks: {
              select: { platform: true, handle: true },
              orderBy: { platform: "asc" },
            },
          },
        },
      },
    });

    if (!seller) return jsonError("Seller not found.", 404);

    const businessId = seller.business?.id ?? null;
    const productWhere = businessId ? { businessId } : { businessId: "__no_business__" };
    const orderWhere = { sellerId: seller.id };

    const [products, totalProducts, activeProducts, sellerOrders, totalSellerOrders, completedSellerOrders] = await Promise.all([
      businessId
        ? prisma.product.findMany({
            where: productWhere,
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            skip: productSkip,
            take: productPageSize,
            select: {
              id: true,
              name: true,
              description: true,
              price: true,
              priceMin: true,
              priceMax: true,
              availability: true,
              status: true,
              imageUrl: true,
              stockQuantity: true,
              deletedAt: true,
              createdAt: true,
              updatedAt: true,
              category: { select: { id: true, name: true } },
              images: {
                select: { id: true, url: true, sortOrder: true },
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              },
            },
          })
        : Promise.resolve([]),
      businessId ? prisma.product.count({ where: productWhere }) : Promise.resolve(0),
      businessId
        ? prisma.product.count({ where: { ...productWhere, status: BusinessStatus.ACTIVE, deletedAt: null } })
        : Promise.resolve(0),
      prisma.sellerOrder.findMany({
        where: orderWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: orderSkip,
        take: orderPageSize,
        select: {
          id: true,
          sellerOrderCode: true,
          status: true,
          subtotal: true,
          sellerNote: true,
          createdAt: true,
          updatedAt: true,
          items: {
            select: {
              productId: true,
              productName: true,
              unitPrice: true,
              quantity: true,
              lineTotal: true,
            },
          },
          order: {
            select: {
              id: true,
              orderCode: true,
              status: true,
              totalAmount: true,
              currency: true,
              createdAt: true,
              buyer: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.sellerOrder.count({ where: orderWhere }),
      prisma.sellerOrder.count({ where: { ...orderWhere, status: SellerOrderStatus.COMPLETED } }),
    ]);

    const productTotalPages = Math.ceil(totalProducts / productPageSize);
    const orderTotalPages = Math.ceil(totalSellerOrders / orderPageSize);

    return NextResponse.json({
      success: true,
      seller: {
        id: seller.id,
        name: seller.name,
        email: seller.email,
        role: seller.role,
        accountStatus: seller.accountStatus,
        suspendedAt: seller.suspendedAt,
        createdAt: seller.createdAt,
        business: seller.business
          ? {
              ...seller.business,
              categories: seller.business.categories.map((item) => item.category),
            }
          : null,
      },
      counts: {
        products: totalProducts,
        activeProducts,
        sellerOrders: totalSellerOrders,
        completedSellerOrders,
      },
      products,
      productPagination: {
        page: productPage,
        pageSize: productPageSize,
        total: totalProducts,
        totalPages: productTotalPages,
        hasPreviousPage: productPage > 1,
        hasNextPage: productPage < productTotalPages,
      },
      sellerOrders,
      orderPagination: {
        page: orderPage,
        pageSize: orderPageSize,
        total: totalSellerOrders,
        totalPages: orderTotalPages,
        hasPreviousPage: orderPage > 1,
        hasNextPage: orderPage < orderTotalPages,
      },
      generatedAt: new Date().toISOString(),
    }, { headers: noStore });
  } catch (error) {
    console.error("Admin seller detail GET error:", error);
    return jsonError("Unable to load seller details.", 500);
  }
}

const MAX_BODY_BYTES = 8 * 1024;
const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

type SellerAccountStatus = UserAccountStatus;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSellerAccountStatus(value: unknown): value is SellerAccountStatus {
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

/** PATCH /api/admin/sellers/[id] — suspend or restore a seller account. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const { id } = await context.params;
    const sellerId = typeof id === "string" ? id.trim() : "";
    if (!sellerId || sellerId.length > MAX_SELLER_ID_LENGTH) return jsonError("Invalid seller ID.", 400);

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
    if (!isSellerAccountStatus(targetStatus)) return jsonError("accountStatus must be ACTIVE or SUSPENDED.", 400);

    const rawReason = bodyResult.value.reason;
    if (typeof rawReason !== "string") return jsonError("A reason is required.", 400);
    const reason = rawReason.trim();
    if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
      return jsonError(`The reason must be between ${MIN_REASON_LENGTH} and ${MAX_REASON_LENGTH} characters.`, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findFirst({
        where: { id: sellerId, role: Role.SELLER },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          accountStatus: true,
          suspendedAt: true,
          createdAt: true,
          business: {
            select: { id: true, name: true, status: true, deletedAt: true },
          },
        },
      });
      if (!current) return { kind: "NOT_FOUND" as const };
      if (current.accountStatus === targetStatus) return { kind: "UNCHANGED" as const, seller: current };

      const changedAt = new Date();
      const update = await tx.user.updateMany({
        where: { id: current.id, role: Role.SELLER, accountStatus: current.accountStatus },
        data: {
          accountStatus: targetStatus,
          suspendedAt: targetStatus === UserAccountStatus.SUSPENDED ? changedAt : null,
        },
      });
      if (update.count !== 1) throw new Error("SELLER_ACCOUNT_STATUS_CONFLICT");

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
          business: {
            select: { id: true, name: true, status: true, deletedAt: true },
          },
        },
      });
      if (!updated) throw new Error("SELLER_NOT_FOUND_AFTER_UPDATE");

      await writeAdminAuditLog(tx, {
        adminId: auth.user.id,
        action: targetStatus === UserAccountStatus.SUSPENDED
          ? "SELLER_ACCOUNT_SUSPENDED_BY_ADMIN"
          : "SELLER_ACCOUNT_RESTORED_BY_ADMIN",
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
          business: current.business
            ? { id: current.business.id, name: current.business.name, status: current.business.status, deletedAt: current.business.deletedAt?.toISOString() ?? null }
            : null,
        } as Prisma.InputJsonValue,
        afterData: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          accountStatus: updated.accountStatus,
          suspendedAt: updated.suspendedAt?.toISOString() ?? null,
          business: updated.business
            ? { id: updated.business.id, name: updated.business.name, status: updated.business.status, deletedAt: updated.business.deletedAt?.toISOString() ?? null }
            : null,
        } as Prisma.InputJsonValue,
        metadata: {
          previousStatus: current.accountStatus,
          newStatus: targetStatus,
          changedAt: changedAt.toISOString(),
          sellerEmail: current.email,
          businessId: current.business?.id ?? null,
          businessName: current.business?.name ?? null,
        } as Prisma.InputJsonValue,
      });

      return { kind: "UPDATED" as const, seller: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "NOT_FOUND") return jsonError("Seller not found.", 404);
    if (result.kind === "UNCHANGED") {
      return NextResponse.json({ success: true, alreadyInRequestedStatus: true, seller: result.seller }, { headers: noStore });
    }

    return NextResponse.json({
      success: true,
      message: targetStatus === UserAccountStatus.SUSPENDED
        ? "Seller account suspended successfully."
        : "Seller account restored successfully.",
      seller: result.seller,
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.message === "SELLER_ACCOUNT_STATUS_CONFLICT") {
      return jsonError("The seller account changed during this operation. Refresh and try again.", 409);
    }
    if (error instanceof Error && error.message === "SELLER_NOT_FOUND_AFTER_UPDATE") {
      return jsonError("Seller could not be found after the update.", 404);
    }
    if (isPrismaErrorCode(error, "P2034")) {
      return jsonError("The seller account changed during this operation. Refresh and try again.", 409);
    }
    console.error("Admin seller account update error:", error);
    return jsonError("Unable to update seller account status.", 500);
  }
}

