import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import {
  haversineDistance,
} from "@/lib/distance";

/**
 * ReMarket Near Me search radius.
 *
 * Can be overridden with:
 *
 * REMARKET_NEAR_ME_RADIUS_KM=10
 *
 * Keep this isolated so the radius can be
 * changed later without touching the UI.
 */
const DEFAULT_NEAR_ME_RADIUS_KM = 10;

function getNearMeRadiusKm(): number {
  const configured = Number(
    process.env.REMARKET_NEAR_ME_RADIUS_KM
  );

  if (
    Number.isFinite(configured) &&
    configured > 0
  ) {
    return configured;
  }

  return DEFAULT_NEAR_ME_RADIUS_KM;
}

function clean(
  value: string | null
): string {
  return value?.trim() ?? "";
}

function parseCoordinate(
  value: string | null
): number | null {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(
    value.trim()
  );

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function isValidLatitude(
  value: number | null
): value is number {
  return (
    value !== null &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value: number | null
): value is number {
  return (
    value !== null &&
    value >= -180 &&
    value <= 180
  );
}

function formatDistance(
  distanceKm: number
): number {
  return Number(
    distanceKm.toFixed(1)
  );
}

function serializeLocation(
  location: {
    id: string;
    area: string;
  } | null
) {
  if (!location) {
    return null;
  }

  /*
   * Exact business coordinates remain
   * server-side.
   */
  return {
    id: location.id,
    area: location.area,
  };
}

export async function GET(
  request: NextRequest
) {
  try {
    const { searchParams } =
      new URL(request.url);

    /*
     * -----------------------------------------
     * READ QUERY PARAMETERS
     * -----------------------------------------
     */

    const area = clean(
      searchParams.get("area")
    );

    const latitude =
      parseCoordinate(
        searchParams.get("lat")
      );

    const longitude =
      parseCoordinate(
        searchParams.get("lng") ??
          searchParams.get("long")
      );

    const hasLatitude =
      latitude !== null;

    const hasLongitude =
      longitude !== null;

    /*
     * A client should provide both coordinates
     * for GPS mode.
     */
    const hasPartialGps =
      hasLatitude !==
        hasLongitude;

    if (hasPartialGps && !area) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode: "none",
          location: null,
          error:
            "Both latitude and longitude are required for current-location search.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const hasBothGps =
      hasLatitude &&
      hasLongitude;

    const hasValidGps =
      isValidLatitude(
        latitude
      ) &&
      isValidLongitude(
        longitude
      );

    /*
     * Do not silently convert invalid GPS
     * coordinates into a no-location search.
     *
     * Area search still takes precedence when
     * an area was explicitly supplied.
     */
    if (
      hasBothGps &&
      !hasValidGps &&
      !area
    ) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode: "none",
          location: null,
          error:
            "Latitude or longitude is outside the valid coordinate range.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const searchMode = area
      ? "area"
      : hasValidGps
        ? "gps"
        : "none";

    /*
     * -----------------------------------------
     * NO LOCATION PROVIDED
     * -----------------------------------------
     */

    if (searchMode === "none") {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode: "none",
          location: null,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * -----------------------------------------
     * LOAD ACTIVE BUSINESSES
     * -----------------------------------------
     *
     * Soft-deleted businesses are never exposed
     * to normal customer-facing searches.
     */

    const baseBusinesses =
      await prisma.business.findMany({
        where: {
          status: "ACTIVE",
          deletedAt: null,

          ...(searchMode ===
          "area"
            ? {
                location: {
                  area: {
                    contains:
                      area,
                    mode:
                      "insensitive",
                  },
                },
              }
            : {}),
        },

        select: {
          id: true,
          name: true,
          ownerName: true,
          description: true,
          imageUrl: true,
          availability: true,
          verification: true,
          onboardedAt: true,

          location: {
            select: {
              id: true,
              area: true,

              /*
               * Used only on the server for
               * GPS distance calculations.
               */
              lat: true,
              long: true,
            },
          },

          /*
           * Only active categories are exposed
           * publicly.
           */
          categories: {
            where: {
              category: {
                isActive: true,
              },
            },

            select: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

          /*
           * Near Me cards only need one product.
           */
          products: {
            where: {
              status: "ACTIVE",
              deletedAt: null,
            },

            select: {
              id: true,
              name: true,
              description: true,
              price: true,
              priceMin: true,
              priceMax: true,
              availability: true,
              imageUrl: true,
              keywords: true,

              images: {
                select: {
                  id: true,
                  url: true,
                  publicId: true,
                  sortOrder: true,
                },

                orderBy: {
                  sortOrder: "asc",
                },

                take: 1,
              },
            },

            orderBy: {
              updatedAt: "desc",
            },

            take: 1,
          },

          socialLinks: {
            select: {
              id: true,
              platform: true,
              handle: true,
            },
          },
        },

        orderBy: {
          onboardedAt: "desc",
        },
      });

    /*
     * -----------------------------------------
     * AREA SEARCH
     * -----------------------------------------
     *
     * Area mode does not calculate physical
     * distance. It simply searches businesses
     * whose Location.area matches the requested
     * area.
     */

    if (searchMode === "area") {
      const formattedBusinesses =
        baseBusinesses.map(
          (business) => ({
            id: business.id,

            name: business.name,

            ownerName:
              business.ownerName,

            description:
              business.description,

            imageUrl:
              business.imageUrl,

            area:
              business.location
                ?.area ??
              "Location not added",

            location:
              serializeLocation(
                business.location
              ),

            availability:
              business.availability,

            verification:
              business.verification,

            verified:
              business.verification ===
              "VERIFIED",

            categories:
              business.categories,

            products:
              business.products,

            socialLinks:
              business.socialLinks,

            distanceKm: null,
          })
        );

      return NextResponse.json(
        {
          businesses:
            formattedBusinesses,

          total:
            formattedBusinesses.length,

          mode: "area",

          location: area,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * -----------------------------------------
     * GPS SEARCH
     * -----------------------------------------
     *
     * A business must have valid coordinates
     * before it can participate in GPS Near Me.
     */

    const businessesWithCoordinates =
      baseBusinesses.filter(
        (business) =>
          business.location !==
            null &&
          isValidLatitude(
            business.location.lat
          ) &&
          isValidLongitude(
            business.location.long
          )
      );

    const radiusKm =
      getNearMeRadiusKm();

    /*
     * -----------------------------------------
     * CALCULATE DISTANCES
     * -----------------------------------------
     *
     * Haversine distance is used for candidate
     * filtering and sorting.
     */

    const gpsResults =
      businessesWithCoordinates
        .map((business) => {
          const location =
            business.location;

          if (!location) {
            return null;
          }

          if (
            !isValidLatitude(
              location.lat
            ) ||
            !isValidLongitude(
              location.long
            ) ||
            !isValidLatitude(
              latitude
            ) ||
            !isValidLongitude(
              longitude
            )
          ) {
            return null;
          }

          const distanceKm =
            haversineDistance(
              latitude,
              longitude,
              location.lat,
              location.long
            );

          /*
           * Exclude businesses outside the
           * configured Near Me radius.
           */
          if (
            distanceKm >
            radiusKm
          ) {
            return null;
          }

          return {
            id: business.id,

            name: business.name,

            ownerName:
              business.ownerName,

            description:
              business.description,

            imageUrl:
              business.imageUrl,

            area:
              location.area,

            location:
              serializeLocation(
                location
              ),

            availability:
              business.availability,

            verification:
              business.verification,

            verified:
              business.verification ===
              "VERIFIED",

            categories:
              business.categories,

            products:
              business.products,

            socialLinks:
              business.socialLinks,

            distanceKm:
              formatDistance(
                distanceKm
              ),
          };
        })
        .filter(
          (
            business
          ): business is NonNullable<
            typeof business
          > =>
            business !== null
        )
        .sort(
          (a, b) =>
            a.distanceKm -
            b.distanceKm
        );

    /*
     * -----------------------------------------
     * GPS RESPONSE
     * -----------------------------------------
     *
     * Do not return the user's exact GPS
     * coordinates.
     */

    return NextResponse.json(
      {
        businesses:
          gpsResults,

        total:
          gpsResults.length,

        mode: "gps",

        location: {
          type: "current",
        },

        radiusKm,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Near Me API error:",
      error
    );

    return NextResponse.json(
      {
        businesses: [],
        total: 0,
        mode: "none",
        location: null,
        error:
          "Unable to load nearby businesses.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}