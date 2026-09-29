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
  if (value === null) {
    return null;
  }

  const cleaned = value.trim();

  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function isValidLatitude(
  value: number
): boolean {
  return (
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value: number
): boolean {
  return (
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

function formatDistance(
  distanceKm: number
): number {
  return Number(
    distanceKm.toFixed(2)
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

    const latitudeRaw =
      searchParams.get("lat");

    const longitudeRaw =
      searchParams.get("lng") ??
      searchParams.get("long");

    const latitude =
      parseCoordinate(
        latitudeRaw
      );

    const longitude =
      parseCoordinate(
        longitudeRaw
      );

    /*
     * A coordinate parameter is considered
     * supplied when it exists and is not blank.
     *
     * This lets us distinguish:
     *
     *   missing/blank -> no GPS supplied
     *
     * from:
     *
     *   "abc" -> invalid GPS supplied
     */

    const latitudeSupplied =
      latitudeRaw !== null &&
      latitudeRaw.trim() !== "";

    const longitudeSupplied =
      longitudeRaw !== null &&
      longitudeRaw.trim() !== "";

    /*
     * -----------------------------------------
     * INVALID NUMERIC GPS INPUT
     * -----------------------------------------
     *
     * Do not silently treat invalid values as
     * missing coordinates.
     */

    if (
      (latitudeSupplied &&
        latitude === null) ||
      (longitudeSupplied &&
        longitude === null)
    ) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode: "none",
          location: null,
          error:
            "Latitude and longitude must be valid numbers.",
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

    const hasLatitude =
      latitude !== null;

    const hasLongitude =
      longitude !== null;

    /*
     * -----------------------------------------
     * GPS PAIR VALIDATION
     * -----------------------------------------
     *
     * A GPS search must provide both coordinates.
     */

    const hasPartialGps =
      hasLatitude !==
      hasLongitude;

    if (hasPartialGps) {
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

    /*
     * At this point TypeScript still sees
     * latitude/longitude as nullable.
     *
     * Narrow them explicitly before passing
     * them to the existing distance validators,
     * which accept `number`, not `number | null`.
     */

    const hasValidGps =
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      isValidLatitude(latitude) &&
      isValidLongitude(longitude);

    /*
     * Coordinates were supplied as a pair but
     * are outside their valid geographic ranges.
     */
    if (
      hasLatitude &&
      hasLongitude &&
      !hasValidGps
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

    /*
     * -----------------------------------------
     * SEARCH MODE
     * -----------------------------------------
     *
     * Explicit area search takes precedence
     * when an area is supplied.
     *
     * Otherwise, valid GPS produces GPS mode.
     */

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
     * The searchMode can only reach this point
     * when valid GPS coordinates exist.
     *
     * Narrow them explicitly for TypeScript and
     * for the distance calculation below.
     */

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !isValidLatitude(latitude) ||
      !isValidLongitude(longitude)
    ) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode: "none",
          location: null,
          error:
            "A valid latitude and longitude are required for current-location search.",
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

    const businessesWithCoordinates =
      baseBusinesses.filter(
        (business) =>
          business.location !==
            null &&
          typeof business.location.lat ===
            "number" &&
          typeof business.location.long ===
            "number" &&
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
     * Haversine is the first-stage distance
     * calculation.
     *
     * IMPORTANT:
     *
     * 1. Calculate raw distance.
     * 2. Filter using raw distance.
     * 3. Sort using raw distance.
     * 4. Round only for the API response.
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
            typeof location.lat !==
              "number" ||
            typeof location.long !==
              "number" ||
            !isValidLatitude(
              location.lat
            ) ||
            !isValidLongitude(
              location.long
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

            /*
             * Internal value used only for
             * filtering and sorting.
             */
            distanceKmRaw:
              distanceKm,
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
            a.distanceKmRaw -
            b.distanceKmRaw
        )
        .map(
          ({
            distanceKmRaw,
            ...business
          }) => ({
            ...business,

            distanceKm:
              formatDistance(
                distanceKmRaw
              ),
          })
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