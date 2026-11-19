import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { writeAdminAuditLog } from "@/lib/admin-audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CategoryUpdateData = {
  name?: string;
  iconKey?: string;
  imageUrl?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

const MAX_CATEGORY_ID_LENGTH = 100;
const MAX_CATEGORY_NAME_LENGTH = 50;
const MAX_ICON_KEY_LENGTH = 100;
const MAX_IMAGE_URL_LENGTH = 2048;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: noStore },
  );
}

function parseName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSortOrder(
  value: unknown,
): number | undefined | null {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

type ParsedImageUrl =
  | { valid: true; value: string | null }
  | { valid: false };

function parseImageUrl(value: unknown): ParsedImageUrl {
  if (value === null || value === "") {
    return { valid: true, value: null };
  }

  if (typeof value !== "string") {
    return { valid: false };
  }

  const imageUrl = value.trim();
  if (!imageUrl) return { valid: true, value: null };
  if (imageUrl.length > MAX_IMAGE_URL_LENGTH) return { valid: false };

  try {
    const parsed = new URL(imageUrl);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return { valid: false };
    }
    return { valid: true, value: imageUrl };
  } catch {
    return { valid: false };
  }
}

function parseParentId(
  value: unknown,
): { valid: true; value: string | null } | { valid: false } {
  if (value === null || value === "") {
    return { valid: true, value: null };
  }

  if (typeof value !== "string") {
    return { valid: false };
  }

  const parentId = value.trim();
  if (!parentId || parentId.length > MAX_CATEGORY_ID_LENGTH) {
    return { valid: false };
  }

  return { valid: true, value: parentId };
}

function categorySnapshot(category: {
  id: string;
  name: string;
  iconKey: string;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}): Prisma.InputJsonValue {
  return {
    id: category.id,
    name: category.name,
    iconKey: category.iconKey,
    imageUrl: category.imageUrl,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

function getCategoryId(value: string): string | null {
  const id = value.trim();
  return id && id.length <= MAX_CATEGORY_ID_LENGTH ? id : null;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id: rawId } = await context.params;
  const id = getCategoryId(rawId ?? "");
  if (!id) return jsonError("A valid category ID is required.", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON request body.", 400);
  }

  if (!isRecord(body)) return jsonError("Invalid request body.", 400);

  const allowedFields = new Set([
    "name",
    "iconKey",
    "imageUrl",
    "parentId",
    "sortOrder",
    "isActive",
  ]);
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

  if (body.imageUrl !== undefined) {
    const image = parseImageUrl(body.imageUrl);
    if (!image.valid) {
      return jsonError(
        "Category image must be a valid HTTP or HTTPS URL under 2,048 characters.",
        400,
      );
    }
    data.imageUrl = image.value;
  }

  if (body.parentId !== undefined) {
    const parent = parseParentId(body.parentId);
    if (!parent.valid) return jsonError("Choose a valid parent category.", 400);
    data.parentId = parent.value;
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

  if (!Object.keys(data).length) {
    return jsonError("No supported changes were provided.", 400);
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.category.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            iconKey: true,
            imageUrl: true,
            parentId: true,
            sortOrder: true,
            isActive: true,
          },
        });

        if (!existing) return { kind: "NOT_FOUND" as const };

        if (data.name && data.name !== existing.name) {
          const duplicate = await tx.category.findFirst({
            where: { name: data.name, NOT: { id } },
            select: { id: true },
          });
          if (duplicate) return { kind: "DUPLICATE" as const };
        }

        const resultingParentId = data.parentId !== undefined
          ? data.parentId
          : existing.parentId;
        const resultingIsActive = data.isActive !== undefined
          ? data.isActive
          : existing.isActive;

        // A category can only be a root or a child. A child cannot be a parent.
        if (data.parentId !== undefined && data.parentId !== null) {
          if (data.parentId === id) return { kind: "SELF_PARENT" as const };

          const parent = await tx.category.findUnique({
            where: { id: data.parentId },
            select: { id: true, parentId: true, isActive: true },
          });

          if (!parent) return { kind: "PARENT_NOT_FOUND" as const };
          if (!parent.isActive) return { kind: "PARENT_INACTIVE" as const };
          if (parent.parentId !== null) {
            return { kind: "PARENT_IS_SUBCATEGORY" as const };
          }

          const existingChildren = await tx.category.count({
            where: { parentId: id },
          });
          if (existingChildren > 0) {
            return { kind: "CATEGORY_HAS_CHILDREN" as const };
          }
        }

        // Do not allow an active child to exist under an inactive parent.
        if (resultingIsActive && resultingParentId) {
          const parent = await tx.category.findUnique({
            where: { id: resultingParentId },
            select: { id: true, parentId: true, isActive: true },
          });

          if (!parent) return { kind: "PARENT_NOT_FOUND" as const };
          if (!parent.isActive) return { kind: "PARENT_INACTIVE" as const };
          if (parent.parentId !== null) {
            return { kind: "PARENT_IS_SUBCATEGORY" as const };
          }
        }

        // A parent cannot be deactivated while active children remain.
        if (data.isActive === false && existing.isActive) {
          const activeChildren = await tx.category.count({
            where: { parentId: id, isActive: true },
          });
          if (activeChildren > 0) {
            return { kind: "HAS_ACTIVE_CHILDREN" as const };
          }
        }

        const updated = await tx.category.update({
          where: { id },
          data,
          include: {
            parent: {
              select: {
                id: true,
                name: true,
                iconKey: true,
                imageUrl: true,
                isActive: true,
                sortOrder: true,
              },
            },
            children: {
              select: {
                id: true,
                name: true,
                iconKey: true,
                imageUrl: true,
                parentId: true,
                isActive: true,
                sortOrder: true,
              },
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            },
            _count: {
              select: {
                business: true,
                products: true,
                requests: true,
                services: true,
              },
            },
          },
        });

        const statusChanged = existing.isActive !== updated.isActive;
        await writeAdminAuditLog(tx, {
          adminId: auth.user.id,
          action: statusChanged
            ? "CATEGORY_STATUS_CHANGED_BY_ADMIN"
            : "CATEGORY_UPDATED_BY_ADMIN",
          entityType: "CATEGORY",
          entityId: existing.id,
          beforeData: categorySnapshot(existing),
          afterData: categorySnapshot(updated),
          metadata: {
            changedFields: Object.keys(data),
            previousIsActive: existing.isActive,
            newIsActive: updated.isActive,
            relatedBusinesses: updated._count.business,
            relatedProducts: updated._count.products,
            relatedRequests: updated._count.requests,
            relatedServices: updated._count.services,
          } as Prisma.InputJsonValue,
        });

        return { kind: "SUCCESS" as const, category: updated };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.kind === "NOT_FOUND") return jsonError("Category not found.", 404);
    if (result.kind === "DUPLICATE") {
      return jsonError("A category with this name already exists.", 409);
    }
    if (result.kind === "SELF_PARENT") {
      return jsonError("A category cannot be its own parent.", 400);
    }
    if (result.kind === "PARENT_NOT_FOUND") {
      return jsonError("The selected parent category does not exist.", 404);
    }
    if (result.kind === "PARENT_INACTIVE") {
      return jsonError("An active category must have an active parent category.", 400);
    }
    if (result.kind === "PARENT_IS_SUBCATEGORY") {
      return jsonError(
        "Only top-level categories can contain subcategories. ReMarket supports two levels.",
        400,
      );
    }
    if (result.kind === "CATEGORY_HAS_CHILDREN") {
      return jsonError(
        "This category already has subcategories and must remain top-level.",
        400,
      );
    }
    if (result.kind === "HAS_ACTIVE_CHILDREN") {
      return jsonError(
        "Deactivate this category's subcategories before deactivating the parent category.",
        409,
      );
    }

    return NextResponse.json(
      { success: true, category: result.category },
      { headers: noStore },
    );
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      return jsonError("A category with this name already exists.", 409);
    }
    if (isPrismaErrorCode(error, "P2034")) {
      return jsonError(
        "The category changed during this update. Reload and try again.",
        409,
      );
    }
    console.error("Admin category PATCH error:", error);
    return jsonError("Unable to update category.", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const { id: rawId } = await context.params;
  const id = getCategoryId(rawId ?? "");
  if (!id) return jsonError("A valid category ID is required.", 400);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.category.findUnique({
          where: { id },
          include: {
            _count: {
              select: {
                business: true,
                products: true,
                requests: true,
                services: true,
                children: true,
              },
            },
          },
        });

        if (!existing) return { kind: "NOT_FOUND" as const };

        const usedCount =
          existing._count.business +
          existing._count.products +
          existing._count.requests +
          existing._count.services;

        if (existing._count.children > 0) {
          return { kind: "HAS_CHILDREN" as const };
        }
        if (usedCount > 0) {
          return {
            kind: "IN_USE" as const,
            businessCount: existing._count.business,
            productCount: existing._count.products,
            requestCount: existing._count.requests,
            serviceCount: existing._count.services,
          };
        }

        await tx.category.delete({ where: { id } });

        await writeAdminAuditLog(tx, {
          adminId: auth.user.id,
          action: "CATEGORY_DELETED_BY_ADMIN",
          entityType: "CATEGORY",
          entityId: existing.id,
          beforeData: categorySnapshot(existing),
          afterData: {
            id: existing.id,
            deleted: true,
          } as Prisma.InputJsonValue,
          metadata: {
            deletedCategoryName: existing.name,
            parentId: existing.parentId,
            relatedBusinesses: existing._count.business,
            relatedProducts: existing._count.products,
            relatedRequests: existing._count.requests,
            relatedServices: existing._count.services,
          } as Prisma.InputJsonValue,
        });

        return { kind: "DELETED" as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.kind === "NOT_FOUND") return jsonError("Category not found.", 404);
    if (result.kind === "HAS_CHILDREN") {
      return jsonError(
        "This category contains subcategories. Move or delete its subcategories before deleting the parent category.",
        409,
      );
    }
    if (result.kind === "IN_USE") {
      return NextResponse.json(
        {
          error: "This category is still in use and cannot be deleted.",
          usage: {
            businesses: result.businessCount,
            products: result.productCount,
            requests: result.requestCount,
            services: result.serviceCount,
          },
        },
        { status: 409, headers: noStore },
      );
    }

    return NextResponse.json({ success: true, deleted: true }, { headers: noStore });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2003") || isPrismaErrorCode(error, "P2014")) {
      return jsonError(
        "This category is still connected to other records and cannot be deleted.",
        409,
      );
    }
    if (isPrismaErrorCode(error, "P2034")) {
      return jsonError(
        "The category changed during deletion. Reload and try again.",
        409,
      );
    }
    console.error("Admin category DELETE error:", error);
    return jsonError("Unable to delete category.", 500);
  }
}
