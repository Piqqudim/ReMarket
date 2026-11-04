
import {
  Availability,
  BusinessStatus,
  Prisma,
  ServiceFulfillmentType,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

const MAX_QUERY_LENGTH = 100;

const VALID_STATUSES = [
  BusinessStatus.ACTIVE,
  BusinessStatus.INACTIVE,
  BusinessStatus.PENDING,
] as const;

const VALID_AVAILABILITIES = [
  Availability.AVAILABLE,
  Availability.ASK_SELLER,
  Availability.UNAVAILABLE,
] as const;

const VALID_FULFILLMENT_TYPES = [
  ServiceFulfillmentType.AT_PROVIDER,
  ServiceFulfillmentType.AT_CUSTOMER,
  ServiceFulfillmentType.REMOTE,
  ServiceFulfillmentType.FLEXIBLE,
] as const;

type ServiceStatus =
  (typeof VALID_STATUSES)[number];

type ServiceAvailability =
  (typeof VALID_AVAILABILITIES)[number];

type FulfillmentType =
  (typeof VALID_FULFILLMENT_TYPES)[number];

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: jsonHeaders(),
    }
  );
}

function cleanString(value: string | null): string {
  return value?.trim() ?? "";
}

function isServiceStatus(
  value: string
): value is ServiceStatus {
  return VALID_STATUSES.includes(
    value as ServiceStatus
  );
}

function isServiceAvailability(
  value: string
): value is ServiceAvailability {
  return VALID_AVAILABILITIES.includes(
    value as ServiceAvailability
  );
}

function isFulfillmentType(
  value: string
): value is FulfillmentType {
  return VALID_FULFILLMENT_TYPES.includes(
    value as FulfillmentType
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);

    const q = cleanString(searchParams.get("q"));

    const statusRaw = cleanString(
      searchParams.get("status")
    ).toUpperCase();

    const availabilityRaw = cleanString(
      searchParams.get("availability")
    ).toUpperCase();

    const fulfillmentRaw = cleanString(
      searchParams.get("fulfillmentType")
    ).toUpperCase();

    const deleted = cleanString(
      searchParams.get("deleted")
    ).toUpperCase();

    if (q.length > MAX_QUERY_LENGTH) {
      return jsonError(
        "Search query must not exceed 100 characters.",
        400
      );
    }

    if (
      statusRaw &&
      !isServiceStatus(statusRaw)
    ) {
      return jsonError(
        "Invalid service status. Use ACTIVE, INACTIVE or PENDING.",
        400
      );
    }

    if (
      availabilityRaw &&
      !isServiceAvailability(availabilityRaw)
    ) {
      return jsonError(
        "Invalid availability. Use AVAILABLE, ASK_SELLER or UNAVAILABLE.",
        400
      );
    }

    if (
      fulfillmentRaw &&
      !isFulfillmentType(fulfillmentRaw)
    ) {
      return jsonError(
        "Invalid fulfillment type.",
        400
      );
    }

    if (
      deleted &&
      !["ALL", "ACTIVE", "DELETED"].includes(deleted)
    ) {
      return jsonError(
        "Invalid deletion filter. Use ALL, ACTIVE or DELETED.",
        400
      );
    }

    const where: Prisma.ServiceWhereInput = {};

    /*
   /*
 * SERVICE STATUS FILTER
 */
if (statusRaw) {
  where.status = statusRaw as ServiceStatus;
}

/*
 * AVAILABILITY FILTER
 */
if (availabilityRaw) {
  where.availability =
    availabilityRaw as ServiceAvailability;
}

/*
 * FULFILLMENT FILTER
 */
if (fulfillmentRaw) {
  where.fulfillmentType =
    fulfillmentRaw as FulfillmentType;
}
    /*
     * SOFT-DELETION FILTER
     *
     * Default: return all records.
     */

    if (deleted === "ACTIVE") {
      where.deletedAt = null;
    } else if (deleted === "DELETED") {
      where.deletedAt = { not: null };
    }

    /*
     * SEARCH FILTER
     *
     * Searches service name, description,
     * seller business name, location and category.
     */

    if (q) {
      where.OR = [
        {
          name: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: q,
            mode: "insensitive",
          },
        },
        {
          business: {
            is: {
              name: {
                contains: q,
                mode: "insensitive",
              },
            },
          },
        },
        {
          business: {
            is: {
              location: {
                is: {
                  area: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        },
        {
          business: {
            is: {
              location: {
                is: {
                  street: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        },
        {
          category: {
            is: {
              name: {
                contains: q,
                mode: "insensitive",
              },
            },
          },
        },
      ];
    }

    /*
     * FETCH SERVICES
     */

    const services = await prisma.service.findMany({
      where,

      orderBy: [
        { updatedAt: "desc" },
        { id: "desc" },
      ],

      select: {
        id: true,
        name: true,
        description: true,

        price: true,
        priceMin: true,
        priceMax: true,

        durationMinutes: true,
        fulfillmentType: true,
        availability: true,

        keywords: true,
        imageUrl: true,

        status: true,
        deletedAt: true,
        deletedById: true,

        createdAt: true,
        updatedAt: true,

        business: {
          select: {
            id: true,
            name: true,
            status: true,
            deletedAt: true,

            location: {
              select: {
                area: true,
                street: true,
              },
            },
          },
        },

        category: {
          select: {
            id: true,
            name: true,
          },
        },

        images: {
          select: {
            id: true,
            url: true,
            publicId: true,
            sortOrder: true,
            createdAt: true,
          },
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        },

        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    /*
     * FORMAT ADMIN RESPONSE
     */

    const formattedServices = services.map(
      (service) => ({
        id: service.id,
        name: service.name,
        description: service.description,

        price: service.price,
        priceMin: service.priceMin,
        priceMax: service.priceMax,

        durationMinutes: service.durationMinutes,
        fulfillmentType: service.fulfillmentType,
        availability: service.availability,

        keywords: service.keywords,
        imageUrl: service.imageUrl,

        status: service.status,
        deletedAt: service.deletedAt,
        deletedById: service.deletedById,

        createdAt: service.createdAt,
        updatedAt: service.updatedAt,

        business: {
          id: service.business.id,
          name: service.business.name,
          status: service.business.status,
          deletedAt: service.business.deletedAt,
          area:
            service.business.location?.area ??
            "Location not added",
          street:
            service.business.location?.street ??
            null,
        },

        category: service.category
          ? {
              id: service.category.id,
              name: service.category.name,
            }
          : null,

        images: service.images,

        bookingCount: service._count.bookings,
      })
    );

    return NextResponse.json(
      {
        services: formattedServices,
        total: formattedServices.length,

        filters: {
          query: q || null,
          status: statusRaw || null,
          availability: availabilityRaw || null,
          fulfillmentType: fulfillmentRaw || null,
          deleted: deleted || "ALL",
        },
      },
      {
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin services GET error:",
      error
    );

    return jsonError(
      "Unable to load admin services.",
      500
    );
  }
}
