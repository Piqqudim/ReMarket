
import {
  Prisma,
  ServiceBookingStatus,
} from "@prisma/client";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/*
 * ---------------------------------------------------------
 * CONFIGURATION
 * ---------------------------------------------------------
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const MAX_PAGE_SIZE = 100;
const MAX_DATABASE_OFFSET = 2_147_483_647;

const MAX_SEARCH_LENGTH = 150;
const MAX_FILTER_ID_LENGTH = 100;

/*
 * ---------------------------------------------------------
 * RESPONSE HEADERS
 * ---------------------------------------------------------
 */

function responseHeaders(
  base?: HeadersInit
): Headers {
  const headers = new Headers(base);

  headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate"
  );

  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Content-Type-Options", "nosniff");

  return headers;
}

function jsonError(
  message: string,
  status: number
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status,
      headers: responseHeaders(),
    }
  );
}

/*
 * ---------------------------------------------------------
 * PAGINATION
 * ---------------------------------------------------------
 */

function parsePositiveInteger(
  value: string | null,
  fallback: number
): number | null {
  if (value === null) {
    return fallback;
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return null;
  }

  return parsed;
}

function parsePagination(
  params: URLSearchParams
) {
  const page = parsePositiveInteger(
    params.get("page"),
    DEFAULT_PAGE
  );

  const requestedLimit = parsePositiveInteger(
    params.get("limit"),
    DEFAULT_LIMIT
  );

  if (
    page === null ||
    requestedLimit === null
  ) {
    return null;
  }

  const limit = Math.min(
    requestedLimit,
    MAX_PAGE_SIZE
  );

  const skip = (page - 1) * limit;

  if (
    !Number.isSafeInteger(skip) ||
    skip > MAX_DATABASE_OFFSET
  ) {
    return null;
  }

  return {
    page,
    limit,
    skip,
  };
}

/*
 * ---------------------------------------------------------
 * DATE VALIDATION
 * ---------------------------------------------------------
 *
 * Date-only filters use Lagos local time (UTC+01:00).
 *
 * Examples:
 *
 * from=2026-11-01
 * to=2026-11-07
 *
 * These represent the complete Lagos calendar days.
 *
 * Explicit timezone offsets are preserved.
 * Timezone-less datetime values are interpreted as Lagos
 * local time.
 * ---------------------------------------------------------
 */

function isValidCalendarDate(
  value: string
): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  const daysInMonth = new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();

  return day <= daysInMonth;
}

function parseDate(
  value: string | null,
  endOfDay = false
): Date | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  /*
   * DATE-ONLY INPUT
   *
   * Interpret using Nigeria's UTC+01:00 timezone.
   */

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    if (!isValidCalendarDate(normalized)) {
      return null;
    }

    const time = endOfDay
      ? "23:59:59.999"
      : "00:00:00.000";

    const date = new Date(
      `${normalized}T${time}+01:00`
    );

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  /*
   * DATETIME INPUT
   */

  const match = normalized.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/i
  );

  if (!match) {
    return null;
  }

  if (!isValidCalendarDate(match[1])) {
    return null;
  }

  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number(match[4] ?? "0");

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  /*
   * If no timezone is supplied, assume Lagos time.
   */

  const hasTimezone = Boolean(match[6]);

  const date = new Date(
    hasTimezone
      ? normalized
      : `${normalized}+01:00`
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/*
 * ---------------------------------------------------------
 * STATUS VALIDATION
 * ---------------------------------------------------------
 */

function isBookingStatus(
  value: string
): value is ServiceBookingStatus {
  return Object.values(
    ServiceBookingStatus
  ).includes(value as ServiceBookingStatus);
}

/*
 * ---------------------------------------------------------
 * ALL SEVEN BOOKING STATUS COUNTS
 * ---------------------------------------------------------
 */

function createEmptyStatusCounts(): Record<
  ServiceBookingStatus,
  number
> {
  return {
    PENDING: 0,
    AWAITING_BUYER: 0,
    ACCEPTED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    DECLINED: 0,
    CANCELLED: 0,
  };
}

/*
 * ---------------------------------------------------------
 * BOOKING RESPONSE FORMAT
 * ---------------------------------------------------------
 *
 * Includes the lifecycle, customer, seller, service,
 * quotation, appointment and fulfillment details.
 *
 * Private merchant notes and internal financial data
 * unrelated to the booking are not included.
 * ---------------------------------------------------------
 */

function formatBooking(
  booking: {
    service: {
      business: {
        location: {
          area: string;
          street: string | null;
          address: string | null;
        } | null;
      } & Record<string, unknown>;
    };
  } & Record<string, any>
) {
  const {
    location,
    ...business
  } = booking.service.business;

  return {
    ...booking,

    service: {
      ...booking.service,

      business: {
        ...business,

        area: location?.area ?? null,
        street: location?.street ?? null,
        address: location?.address ?? null,
      },
    },
  };
}

/*
 * =========================================================
 * GET /api/admin/bookings
 * =========================================================
 *
 * ADMIN-ONLY SERVICE BOOKING LIST
 *
 * Supported query parameters:
 *
 * q          Search booking code, buyer, seller,
 *            phone number, service or business.
 *
 * status     Any of the seven booking statuses.
 *
 * from       Creation date lower boundary.
 *
 * to         Creation date upper boundary.
 *
 * sellerId   Filter by assigned seller.
 *
 * serviceId  Filter by service.
 *
 * page       Pagination page.
 *
 * limit      Results per page (maximum 100).
 *
 * Status summaries are calculated independently
 * of the selected status filter and pagination.
 * =========================================================
 */

export async function GET(
  request: NextRequest
) {
  try {
    /*
     * ADMIN AUTHENTICATION
     */

    const admin = await requireAdmin();

    if (admin instanceof NextResponse) {
      return admin;
    }

    /*
     * QUERY PARAMETERS
     */

    const params = request.nextUrl.searchParams;

    const search = (
      params.get("q") ?? ""
    ).trim();

    const statusParam = (
      params.get("status") ?? ""
    )
      .trim()
      .toUpperCase();

    const fromParam = params.get("from");
    const toParam = params.get("to");

    const sellerId = (
      params.get("sellerId") ?? ""
    ).trim();

    const serviceId = (
      params.get("serviceId") ?? ""
    ).trim();

    /*
     * SEARCH VALIDATION
     */

    if (search.length > MAX_SEARCH_LENGTH) {
      return jsonError(
        `Search cannot exceed ${MAX_SEARCH_LENGTH} characters.`,
        400
      );
    }

    /*
     * FILTER ID VALIDATION
     */

    if (
      sellerId.length > MAX_FILTER_ID_LENGTH ||
      serviceId.length > MAX_FILTER_ID_LENGTH
    ) {
      return jsonError(
        "Invalid seller or service filter.",
        400
      );
    }

    /*
     * PAGINATION
     */

    const pagination = parsePagination(params);

    if (!pagination) {
      return jsonError(
        "Invalid pagination parameters.",
        400
      );
    }

    /*
     * STATUS VALIDATION
     */

    const validStatuses = Object.values(
      ServiceBookingStatus
    );

    if (
      statusParam &&
      !isBookingStatus(statusParam)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid booking status.",
          validStatuses,
        },
        {
          status: 400,
          headers: responseHeaders(),
        }
      );
    }

    /*
     * DATE VALIDATION
     */

    const from = parseDate(fromParam);
    const to = parseDate(toParam, true);

    if (fromParam && !from) {
      return jsonError(
        "Invalid 'from' date.",
        400
      );
    }

    if (toParam && !to) {
      return jsonError(
        "Invalid 'to' date.",
        400
      );
    }

    if (
      from &&
      to &&
      from.getTime() > to.getTime()
    ) {
      return jsonError(
        "'from' date cannot be later than 'to' date.",
        400
      );
    }

    /*
     * BUILD BASE FILTERS
     *
     * These filters apply to both the booking list
     * and the all-status summary:
     *
     * - Search.
     * - Date range.
     * - Seller.
     * - Service.
     *
     * The selected booking status is deliberately
     * excluded from the base filter.
     */

    const baseConditions: Prisma.ServiceBookingWhereInput[] = [];

    /*
     * DATE FILTER
     */

    if (from || to) {
      baseConditions.push({
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      });
    }

    /*
     * SEARCH FILTER
     *
     * Search by:
     * - Booking reference.
     * - Buyer name/email.
     * - Seller name/email.
     * - Contact phone.
     * - Service name.
     * - Business name.
     */

    if (search) {
      baseConditions.push({
        OR: [
          {
            bookingCode: {
              contains: search,
              mode: "insensitive",
            },
          },

          {
            contactPhone: {
              contains: search,
            },
          },

          {
            buyer: {
              is: {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          },

          {
            buyer: {
              is: {
                email: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          },

          {
            seller: {
              is: {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          },

          {
            seller: {
              is: {
                email: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          },

          {
            service: {
              is: {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          },

          {
            service: {
              is: {
                business: {
                  is: {
                    name: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          },
        ],
      });
    }

    /*
     * SELLER FILTER
     *
     * New bookings use sellerId.
     *
     * Legacy bookings with sellerId = null fall back
     * to the current owner of the service business.
     */

    if (sellerId) {
      baseConditions.push({
        OR: [
          {
            sellerId,
          },

          {
            sellerId: null,

            service: {
              is: {
                business: {
                  is: {
                    ownerId: sellerId,
                  },
                },
              },
            },
          },
        ],
      });
    }

    /*
     * SERVICE FILTER
     */

    if (serviceId) {
      baseConditions.push({
        serviceId,
      });
    }

    /*
     * BASE WHERE
     */

    const baseWhere: Prisma.ServiceBookingWhereInput = {
      AND: baseConditions,
    };

    /*
     * FINAL WHERE
     *
     * Only the list and pagination total are affected
     * by the selected status.
     */

    const where: Prisma.ServiceBookingWhereInput =
      statusParam
        ? {
            AND: [
              baseWhere,
              {
                status:
                  statusParam as ServiceBookingStatus,
              },
            ],
          }
        : baseWhere;

    /*
     * FETCH BOOKINGS, FILTERED TOTAL AND STATUS SUMMARY
     */

    const [
      bookings,
      total,
      statusSummary,
    ] = await Promise.all([
      /*
       * BOOKING LIST
       */

      prisma.serviceBooking.findMany({
        where,

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        skip: pagination.skip,
        take: pagination.limit,

        select: {
          id: true,
          bookingCode: true,

          serviceId: true,

          buyerId: true,
          sellerId: true,

          bookingType: true,
          status: true,

          requestedFor: true,
          scheduledFor: true,

          quantity: true,

          contactPhone: true,
          buyerMessage: true,

          fulfillmentType: true,
          fulfillmentAddress: true,

          quotedPrice: true,
          quoteMessage: true,
          quoteSentAt: true,

          agreedPrice: true,
          quoteAcceptedAt: true,

          currency: true,

          acceptedAt: true,
          declinedAt: true,
          cancelledAt: true,
          startedAt: true,
          completedAt: true,

          declineReason: true,
          cancellationReason: true,

          createdAt: true,
          updatedAt: true,

          buyer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },

          seller: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },

          service: {
            select: {
              id: true,
              name: true,

              price: true,
              priceMin: true,
              priceMax: true,

              availability: true,
              bookingType: true,
              fulfillmentType: true,
              durationMinutes: true,

              business: {
                select: {
                  id: true,
                  name: true,

                  location: {
                    select: {
                      area: true,
                      street: true,
                      address: true,
                    },
                  },
                },
              },
            },
          },

          _count: {
            select: {
              messages: true,
            },
          },
        },
      }),

      /*
       * FILTERED TOTAL
       *
       * This is the total number of records matching
       * every active filter, including status.
       */

      prisma.serviceBooking.count({
        where,
      }),

      /*
       * ALL-STATUS SUMMARY
       *
       * This deliberately uses baseWhere instead
       * of where so changing the status filter does
       * not change the summary.
       */

      prisma.serviceBooking.groupBy({
        by: ["status"],

        where: baseWhere,

        _count: {
          _all: true,
        },
      }),
    ]);

    /*
     * BUILD COMPLETE SEVEN-STATUS SUMMARY
     */

    const counts = createEmptyStatusCounts();

    for (const item of statusSummary) {
      counts[item.status] = item._count._all;
    }

    const summaryTotal = Object.values(counts).reduce(
      (sum, count) => sum + count,
      0
    );

    const byStatus = validStatuses.map(
      (status) => ({
        status,
        count: counts[status],
      })
    );

    /*
     * FORMAT BOOKINGS
     */

    const formattedBookings = bookings.map(
      formatBooking
    );

    /*
     * PAGINATION METADATA
     */

    const totalPages = Math.ceil(
      total / pagination.limit
    );

    /*
     * SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        success: true,

        filters: {
          search: search || null,
          status: statusParam || null,

          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,

          sellerId: sellerId || null,
          serviceId: serviceId || null,
        },

        summary: {
          total: summaryTotal,
          byStatus,
        },

        pagination: {
          page: pagination.page,
          limit: pagination.limit,

          total,
          totalPages,

          hasNextPage:
            pagination.page < totalPages,

          hasPreviousPage:
            pagination.page > 1 &&
            pagination.page <= totalPages,
        },

        bookings: formattedBookings,

        generatedAt: new Date().toISOString(),
      },

      {
        headers: responseHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin bookings GET error:",
      error
    );

    return jsonError(
      "Failed to retrieve service bookings.",
      500
    );
  }
}
