import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
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
      "Failed to fetch categories:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch categories",
      },
      {
        status: 500,
      }
    );
  }
}