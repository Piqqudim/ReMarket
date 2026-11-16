import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { writeAdminAuditLog } from "@/lib/admin-audit";

type RouteContext = { params: Promise<{ id: string }> };
type CategoryUpdateData = {
  name?: string;
  iconKey?: string;
  sortOrder?: number;
  isActive?: boolean;
};

const MAX_CATEGORY_ID_LENGTH = 100;
const MAX_CATEGORY_NAME_LENGTH = 50;
const MAX_ICON_KEY_LENGTH = 100;
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

function parseName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSortOrder(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function categorySnapshot(category: {
  id: string;
  name: string;
  iconKey: string;
  sortOrder: number;
  isActive: boolean;
}): Prisma.InputJsonValue {
  return {
    id: category.id,
    name: category.name,
    iconKey: category.iconKey,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  if (!id?.trim() || id.length > MAX_CATEGORY_ID_LENGTH) {
    return jsonError("A valid category ID is required.", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  if (!isRecord(body)) return jsonError("Invalid request body.", 400);

  const allowedFields = new Set(["name", "iconKey", "sortOrder", "isActive"]);
  const unsupportedFields = Object.keys(body).filter((key) => !allowedFields.has(key));
  if (unsupportedFields.length) {
    return jsonError(`Unsupported fields: ${unsupportedFields.join(", ")}.`, 400);
  }

  const data: CategoryUpdateData = {};

  if (body.name !== undefined) {
    const name = parseName(body.name);
    if (!name) return jsonError("Category name cannot be empty.", 400);
    if (name.length > MAX_CATEGORY_NAME_LENGTH) {
      return jsonError("Category name must be 50 characters or less.", 400);
    }
    data.name = name;
  }

  if (body.iconKey !== undefined) {
    const iconKey = parseName(body.iconKey) || "Store";
    if (iconKey.length > MAX_ICON_KEY_LENGTH) {
      return jsonError("Category icon key is too long.", 400);
    }
    data.iconKey = iconKey;
  }

  if (body.sortOrder !== undefined) {
    const sortOrder = parseSortOrder(body.sortOrder);
    if (sortOrder === null) {
      return jsonError("Sort order must be a non-negative whole number.", 400);
    }
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return jsonError("isActive must be a boolean.", 400);
    }
    data.isActive = body.isActive;
  }

  if (!Object.keys(data).length) return jsonError("No supported changes were provided.", 400);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.category.findUnique({ where: { id } });
      if (!existing) return { kind: "NOT_FOUND" as const };

      if (data.name && data.name !== existing.name) {
        const duplicate = await tx.category.findFirst({
          where: { name: data.name, NOT: { id } },
          select: { id: true },
        });
        if (duplicate) return { kind: "DUPLICATE" as const };
      }

      const updated = await tx.category.update({
        where: { id },
        data,
        include: { _count: { select: { business: true, products: true, requests: true } } },
      });

      const statusChanged = existing.isActive !== updated.isActive;
      const changedFields = Object.keys(data);

      await writeAdminAuditLog(tx, {
        adminId: auth.user.id,
        action: statusChanged ? "CATEGORY_STATUS_CHANGED_BY_ADMIN" : "CATEGORY_UPDATED_BY_ADMIN",
        entityType: "CATEGORY",
        entityId: existing.id,
        beforeData: categorySnapshot(existing),
        afterData: categorySnapshot(updated),
        metadata: {
          changedFields,
          previousIsActive: existing.isActive,
          newIsActive: updated.isActive,
          relatedBusinesses: updated._count.business,
          relatedProducts: updated._count.products,
          relatedRequests: updated._count.requests,
        } as Prisma.InputJsonValue,
      });

      return { kind: "SUCCESS" as const, category: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "NOT_FOUND") return jsonError("Category not found.", 404);
    if (result.kind === "DUPLICATE") return jsonError("A category with this name already exists.", 409);

    return NextResponse.json({ success: true, category: result.category }, { headers: noStore });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      return jsonError("A category with this name already exists.", 409);
    }
    if (isPrismaErrorCode(error, "P2034")) {
      return jsonError("The category changed during this update. Reload and try again.", 409);
    }
    console.error("Admin category PATCH error:", error);
    return jsonError("Unable to update category.", 500);
  }
}
