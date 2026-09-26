import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function parseName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function parseSortOrder(
  value: unknown
): number | undefined | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
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

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } =
    await context.params;

  if (!id) {
    return NextResponse.json(
      {
        error:
          "Category ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const existing =
      await prisma.category.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Category not found.",
        },
        {
          status: 404,
        }
      );
    }

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

    const data: {
      name?: string;
      iconKey?: string;
      sortOrder?: number;
      isActive?: boolean;
    } = {};

    if (
      payload.name !== undefined
    ) {
      const name =
        parseName(payload.name);

      if (!name) {
        return NextResponse.json(
          {
            error:
              "Category name cannot be empty.",
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

      const duplicate =
        await prisma.category.findFirst({
          where: {
            name,
            NOT: {
              id,
            },
          },
        });

      if (duplicate) {
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

      data.name = name;
    }

    if (
      payload.iconKey !== undefined
    ) {
      const iconKey =
        parseName(
          payload.iconKey
        );

      data.iconKey =
        iconKey || "Store";
    }

    if (
      payload.sortOrder !==
      undefined
    ) {
      const sortOrder =
        parseSortOrder(
          payload.sortOrder
        );

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

      if (
        sortOrder !== undefined
      ) {
        data.sortOrder =
          sortOrder;
      }
    }

    if (
      typeof payload.isActive ===
      "boolean"
    ) {
      data.isActive =
        payload.isActive;
    }

    const category =
      await prisma.category.update({
        where: {
          id,
        },
        data,

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

    return NextResponse.json({
      success: true,
      category,
    });
  } catch (error) {
    console.error(
      "Admin category PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update category.",
      },
      {
        status: 500,
      }
    );
  }
}