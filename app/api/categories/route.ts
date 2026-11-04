
import {
  BusinessStatus,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

const NO_STORE = "no-store, max-age=0, must-revalidate";

function responseHeaders(
  baseHeaders?: HeadersInit,
  cacheControl = NO_STORE
): Headers {
  const headers = new Headers(baseHeaders);

  headers.set("Cache-Control", cacheControl);

  if (cacheControl === NO_STORE) {
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  }

  return headers;
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(
    request,
    "categories"
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        categories: [],
        error: "Too many requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: responseHeaders(rateLimit.headers),
      }
    );
  }

  try {
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
      },

      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],

      select: {
        id: true,
        name: true,
        iconKey: true,
        isActive: true,
        sortOrder: true,

        _count: {
          select: {
            products: {
              where: {
                status: BusinessStatus.ACTIVE,
                deletedAt: null,
                business: {
                  is: {
                    status: BusinessStatus.ACTIVE,
                    deletedAt: null,
                  },
                },
              },
            },

            services: {
              where: {
                status: BusinessStatus.ACTIVE,
                deletedAt: null,
                business: {
                  is: {
                    status: BusinessStatus.ACTIVE,
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
      },
    });

    const formattedCategories = categories.map(
      (category) => ({
        id: category.id,
        name: category.name,
        iconKey: category.iconKey,
        isActive: category.isActive,
        sortOrder: category.sortOrder,

        _count: {
          products: category._count.products,
          services: category._count.services,
          totalListings:
            category._count.products +
            category._count.services,
        },
      })
    );

    return NextResponse.json(
      {
        categories: formattedCategories,
        total: formattedCategories.length,
      },
      {
        headers: responseHeaders(
          rateLimit.headers,
          CACHE_CONTROL
        ),
      }
    );
  } catch (error) {
    console.error("Categories API error:", error);

    return NextResponse.json(
      {
        categories: [],
        error: "Unable to load categories.",
      },
      {
        status: 500,
        headers: responseHeaders(rateLimit.headers),
      }
    );
  }
}
