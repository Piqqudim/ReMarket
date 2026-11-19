import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

const MAX_CATEGORY_ID_LENGTH = 100;
const MAX_CATEGORY_NAME_LENGTH = 50;
const MAX_ICON_KEY_LENGTH = 100;
const MAX_IMAGE_URL_LENGTH = 2048;

const categoryRelations = {
  parent: {
    select: {
      id: true,
      name: true,
      iconKey: true,
      imageUrl: true,
      parentId: true,
      isActive: true,
      sortOrder: true,
    },
  },
  children: {
    orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }],
    select: {
      id: true,
      name: true,
      iconKey: true,
      imageUrl: true,
      parentId: true,
      isActive: true,
      sortOrder: true,
    },
  },
  _count: {
    select: {
      business: true,
      products: true,
      requests: true,
    },
  },
} satisfies Prisma.CategoryInclude;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: noStore },
  );
}

function parseName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSortOrder(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

function parseBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

type ParsedImageUrl =
  | { valid: true; value: string | null }
  | { valid: false };

function parseImageUrl(value: unknown): ParsedImageUrl {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null };
  }

  if (typeof value !== "string") {
    return { valid: false };
  }

  const imageUrl = value.trim();

  if (!imageUrl) {
    return { valid: true, value: null };
  }

  if (imageUrl.length > MAX_IMAGE_URL_LENGTH) {
    return { valid: false };
  }

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
):
  | { valid: true; value: string | null }
  | { valid: false } {
  if (value === undefined || value === null || value === "") {
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

export async function GET() {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const categories = await prisma.category.findMany({
      include: categoryRelations,
      orderBy: [
        { parentId: "asc" },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(
      { categories },
      { headers: noStore },
    );
  } catch (error) {
    console.error("Admin categories GET error:", error);

    return jsonError("Unable to load categories.", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    if (!isRecord(body)) {
      return jsonError("Invalid request body.", 400);
    }

    const name = parseName(body.name);
    const iconKey = parseName(body.iconKey) || "Store";
    const sortOrder = parseSortOrder(body.sortOrder);
    const parent = parseParentId(body.parentId);
    const image = parseImageUrl(body.imageUrl);

    if (!name) {
      return jsonError("Category name is required.", 400);
    }

    if (name.length > MAX_CATEGORY_NAME_LENGTH) {
      return jsonError(
        "Category name must be 50 characters or less.",
        400,
      );
    }

    if (iconKey.length > MAX_ICON_KEY_LENGTH) {
      return jsonError("Category icon key is too long.", 400);
    }

    if (sortOrder === null) {
      return jsonError(
        "Sort order must be a non-negative whole number.",
        400,
      );
    }

    if (!parent.valid) {
      return jsonError("Choose a valid parent category.", 400);
    }

    if (!image.valid) {
      return jsonError(
        "Category image must be a valid HTTP or HTTPS URL under 2,048 characters.",
        400,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.category.findUnique({
        where: { name },
        select: { id: true },
      });

      if (existing) {
        return { kind: "EXISTS" as const };
      }

      if (parent.value) {
        const parentCategory = await tx.category.findUnique({
          where: { id: parent.value },
          select: {
            id: true,
            parentId: true,
            isActive: true,
          },
        });

        if (!parentCategory) {
          return { kind: "PARENT_NOT_FOUND" as const };
        }

        if (!parentCategory.isActive) {
          return { kind: "PARENT_INACTIVE" as const };
        }

        if (parentCategory.parentId !== null) {
          return { kind: "PARENT_IS_SUBCATEGORY" as const };
        }
      }

      const category = await tx.category.create({
        data: {
          name,
          iconKey,
          imageUrl: image.value,
          parentId: parent.value,
          sortOrder,
          isActive: parseBoolean(body.isActive, true),
        },
        include: categoryRelations,
      });

      await writeAdminAuditLog(tx, {
        adminId: auth.user.id,
        action: "CATEGORY_CREATED_BY_ADMIN",
        entityType: "CATEGORY",
        entityId: category.id,
        afterData: {
          id: category.id,
          name: category.name,
          iconKey: category.iconKey,
          imageUrl: category.imageUrl,
          parentId: category.parentId,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        } as Prisma.InputJsonValue,
        metadata: {
          relatedBusinesses: category._count.business,
          relatedProducts: category._count.products,
          relatedRequests: category._count.requests,
          parentId: category.parentId,
        } as Prisma.InputJsonValue,
      });

      return { kind: "CREATED" as const, category };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    if (result.kind === "EXISTS") {
      return jsonError(
        "A category with this name already exists.",
        409,
      );
    }

    if (result.kind === "PARENT_NOT_FOUND") {
      return jsonError(
        "The selected parent category does not exist.",
        404,
      );
    }

    if (result.kind === "PARENT_INACTIVE") {
      return jsonError(
        "Choose an active parent category.",
        400,
      );
    }

    if (result.kind === "PARENT_IS_SUBCATEGORY") {
      return jsonError(
        "Only top-level categories can contain subcategories. ReMarket supports two levels.",
        400,
      );
    }

    return NextResponse.json(
      {
        success: true,
        category: result.category,
      },
      {
        status: 201,
        headers: noStore,
      },
    );
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      return jsonError(
        "A category with this name already exists.",
        409,
      );
    }

    if (isPrismaErrorCode(error, "P2034")) {
      return jsonError(
        "The category hierarchy changed while this category was being created. Please try again.",
        409,
      );
    }

    console.error("Admin category POST error:", error);

    return jsonError("Unable to create category.", 500);
  }
}
