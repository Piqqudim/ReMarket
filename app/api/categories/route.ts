import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  BusinessStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  checkPublicRateLimit,
} from "@/lib/rate-limit";

/**
 * ------------------------------------------------
 * REMARKET PUBLIC CATEGORIES API
 * ------------------------------------------------
 *
 * Returns active categories for buyer discovery.
 *
 * Counts:
 * - Businesses: active, non-deleted businesses.
 * - Products: active, non-deleted products belonging
 *   to active, non-deleted businesses.
 * - Requests: retains the existing total request
 *   count for response compatibility.
 *
 * No buyer request details or business coordinates
 * are returned by this endpoint.
 */

const CACHE_CONTROL =
  "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

const NO_STORE =
  "no-store, max-age=0, must-revalidate";

function responseHeaders(
  baseHeaders?: HeadersInit,
  cacheControl = NO_STORE
): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    cacheControl
  );

  if (cacheControl === NO_STORE) {
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
  }

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
          "Too many requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: responseHeaders(
          rateLimit.headers
        ),
      }
    );
  }

  try {
    const categories =
      await prisma.category.findMany({
        where: {
          isActive: true,
        },

        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            name: "asc",
          },
        ],

        select: {
          id: true,
          name: true,
          iconKey: true,
          isActive: true,
          sortOrder: true,

          /*
           * Count only currently visible businesses
           * associated with this category.
           */
          _count: {
            select: {
              business: {
                where: {
                  business: {
                    is: {
                      status:
                        BusinessStatus.ACTIVE,
                      deletedAt: null,
                    },
                  },
                },
              },

              /*
               * Do not count products belonging to
               * inactive or soft-deleted businesses.
               */
              products: {
                where: {
                  status:
                    BusinessStatus.ACTIVE,

                  deletedAt: null,

                  business: {
                    is: {
                      status:
                        BusinessStatus.ACTIVE,
                      deletedAt: null,
                    },
                  },
                },
              },

              /*
               * Preserve the existing request-count
               * field; no request records or buyer
               * contact details are exposed.
               */
              requests: true,
            },
          },
        },
      });

    return NextResponse.json(
      {
        categories,
      },
      {
        headers: responseHeaders(
          rateLimit.headers,
          CACHE_CONTROL
        ),
      }
    );
  } catch (error) {
    console.error(
      "Categories API error:",
      error
    );

    return NextResponse.json(
      {
        categories: [],
        error:
          "Unable to load categories.",
      },
      {
        status: 500,
        headers: responseHeaders(
          rateLimit.headers
        ),
      }
    );
  }
}