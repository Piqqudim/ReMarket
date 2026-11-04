
import { NextRequest, NextResponse } from "next/server";
import {
  Prisma,
  ServiceBookingStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function parseDate(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // Treat a date-only "to" value as the end of that day.
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(23, 59, 59, 999);
  }

  return date;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    if (admin instanceof NextResponse) {
      return admin;
    }

    const params = request.nextUrl.searchParams;

    const search = params.get("q")?.trim() ?? "";
    const statusParam = params.get("status")?.trim().toUpperCase() ?? "";
    const fromParam = params.get("from");
    const toParam = params.get("to");

    const page = Math.max(
      1,
      Number.parseInt(params.get("page") ?? "1", 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(params.get("limit") ?? "20", 10) || 20
      )
    );

    const skip = (page - 1) * limit;

    const validStatuses = Object.values(ServiceBookingStatus);

    if (
      statusParam &&
      !validStatuses.includes(statusParam as ServiceBookingStatus)
    ) {
      return NextResponse.json(
        {
          error: "Invalid booking status.",
          validStatuses,
        },
        { status: 400 }
      );
    }

    const from = parseDate(fromParam);
    const to = parseDate(toParam, true);

    if (fromParam && !from) {
      return NextResponse.json(
        { error: "Invalid 'from' date." },
        { status: 400 }
      );
    }

    if (toParam && !to) {
      return NextResponse.json(
        { error: "Invalid 'to' date." },
        { status: 400 }
      );
    }

    if (from && to && from > to) {
      return NextResponse.json(
        { error: "'from' date cannot be later than 'to' date." },
        { status: 400 }
      );
    }

    const dateFilter: Prisma.ServiceBookingWhereInput =
      from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {};

    const searchFilter: Prisma.ServiceBookingWhereInput = search
      ? {
          OR: [
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
        }
      : {};

    // Date and search filters are shared by the list
    // and status summary.
    const baseWhere: Prisma.ServiceBookingWhereInput = {
      ...dateFilter,
      ...searchFilter,
    };

    const where: Prisma.ServiceBookingWhereInput = {
      ...baseWhere,
      ...(statusParam
        ? { status: statusParam as ServiceBookingStatus }
        : {}),
    };

    const [bookings, total, statusSummary] = await Promise.all([
      prisma.serviceBooking.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        select: {
          id: true,
          status: true,
          requestedFor: true,
          quantity: true,
          contactPhone: true,
          buyerMessage: true,
          acceptedAt: true,
          createdAt: true,
          updatedAt: true,

          buyer: {
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
              fulfillmentType: true,
              durationMinutes: true,

              business: {
                select: {
                  id: true,
                  name: true,

                  // Business location is a relation.
                  location: {
                    select: {
                      area: true,
                      street: true,
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

      prisma.serviceBooking.count({
        where,
      }),

      prisma.serviceBooking.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: {
          _all: true,
        },
      }),
    ]);

    // Preserve the previous API shape expected by the admin UI:
    // service.business.area and service.business.street.
    const formattedBookings = bookings.map((booking) => {
      const { location, ...business } = booking.service.business;

      return {
        ...booking,
        service: {
          ...booking.service,
          business: {
            ...business,
            area: location?.area ?? null,
            street: location?.street ?? null,
          },
        },
      };
    });

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      {
        success: true,

        filters: {
          search: search || null,
          status: statusParam || null,
          from: from?.toISOString() ?? null,
          to: to?.toISOString() ?? null,
        },

        summary: {
          total,
          byStatus: statusSummary.map((item) => ({
            status: item.status,
            count: item._count._all,
          })),
        },

        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },

        bookings: formattedBookings,
        generatedAt: new Date(),
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Admin bookings GET error:", error);

    return NextResponse.json(
      { error: "Failed to retrieve service bookings." },
      { status: 500 }
    );
  }
}
