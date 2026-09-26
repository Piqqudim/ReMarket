import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

function parseName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function parseSortOrder(
  value: unknown
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return 0;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

function parseBoolean(
  value: unknown,
  fallback = true
): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
}

export async function GET() {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const categories =
      await prisma.category.findMany({
        include: {
          _count: {
            select: {
              business: true,
              products: true,
              requests: true,
            },
          },
        },
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            name: "asc",
          },
        ],
      });

    return NextResponse.json({
      categories,
    });
  } catch (error) {
    console.error(
      "Admin categories GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load categories.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
        }
      );
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

    const name =
      parseName(payload.name);

    const iconKey =
      parseName(
        payload.iconKey
      ) || "Store";

    const sortOrder =
      parseSortOrder(
        payload.sortOrder
      );

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Category name is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (name.length > 50) {
      return NextResponse.json(
        {
          error:
            "Category name must be 50 characters or less.",
        },
        {
          status: 400,
        }
      );
    }

    if (sortOrder === null) {
      return NextResponse.json(
        {
          error:
            "Sort order must be a non-negative whole number.",
        },
        {
          status: 400,
        }
      );
    }

    const existing =
      await prisma.category.findUnique({
        where: {
          name,
        },
      });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "A category with this name already exists.",
        },
        {
          status: 409,
        }
      );
    }

    const category =
      await prisma.category.create({
        data: {
          name,
          iconKey,
          sortOrder,
          isActive:
            parseBoolean(
              payload.isActive,
              true
            ),
        },

        include: {
          _count: {
            select: {
              business: true,
              products: true,
              requests: true,
            },
          },
        },
      });

    return NextResponse.json(
      {
        success: true,
        category,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Admin category POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to create category.",
      },
      {
        status: 500,
      }
    );
  }
}