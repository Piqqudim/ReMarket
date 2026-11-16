import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

function parseName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSortOrder(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { business: true, products: true, requests: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ categories }, { headers: noStore });
  } catch (error) {
    console.error("Admin categories GET error:", error);
    return jsonError("Unable to load categories.", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    if (!isRecord(body)) return jsonError("Invalid request body.", 400);

    const name = parseName(body.name);
    const iconKey = parseName(body.iconKey) || "Store";
    const sortOrder = parseSortOrder(body.sortOrder);

    if (!name) return jsonError("Category name is required.", 400);
    if (name.length > 50) return jsonError("Category name must be 50 characters or less.", 400);
    if (sortOrder === null) return jsonError("Sort order must be a non-negative whole number.", 400);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.category.findUnique({
        where: { name },
        select: { id: true },
      });

      if (existing) return { kind: "EXISTS" as const };

      const category = await tx.category.create({
        data: { name, iconKey, sortOrder, isActive: parseBoolean(body.isActive, true) },
        include: { _count: { select: { business: true, products: true, requests: true } } },
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
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        } as Prisma.InputJsonValue,
        metadata: {
          relatedBusinesses: category._count.business,
          relatedProducts: category._count.products,
          relatedRequests: category._count.requests,
        } as Prisma.InputJsonValue,
      });

      return { kind: "CREATED" as const, category };
    });

    if (result.kind === "EXISTS") {
      return jsonError("A category with this name already exists.", 409);
    }

    return NextResponse.json(
      { success: true, category: result.category },
      { status: 201, headers: noStore },
    );
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      return jsonError("A category with this name already exists.", 409);
    }

    console.error("Admin category POST error:", error);
    return jsonError("Unable to create category.", 500);
  }
}
