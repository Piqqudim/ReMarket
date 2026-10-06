import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

function getResponseHeaders(
  rateLimitHeaders: Headers
): Headers {
  const headers =
    new Headers(rateLimitHeaders);

  /*
   * Categories are public data and can be cached
   * briefly by the browser/CDN.
   */
  headers.set(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );

  return headers;
}

export async function GET(
  request: NextRequest
) {
  const rateLimit =
    checkPublicRateLimit(
      request,
      "categories"
    );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        categories: [],
        error:
          "Too many category requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: (() => {
          const headers =
            new Headers(
              rateLimit.headers
            );

          headers.set(
            "Cache-Control",
            "no-store"
          );

          return headers;
        })(),
      }
    );
  }

  try {
    const categories =
      await prisma.category.findMany({
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

    return NextResponse.json(
      {
        categories,
      },
      {
        headers:
          getResponseHeaders(
            rateLimit.headers
          ),
      }
    );
  } catch (error) {
    console.error(
      "Failed to fetch categories:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch categories",
      },
      {
        status: 500,
        headers: (() => {
          const headers =
            new Headers(
              rateLimit.headers
            );

          headers.set(
            "Cache-Control",
            "no-store"
          );

          return headers;
        })(),
      }
    );
  }
}