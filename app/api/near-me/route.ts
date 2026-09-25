import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * ReMarket Near Me search radius.
 *
 * This is intentionally isolated here so the radius
 * can be changed later without changing the UI.
 */
const DEFAULT_NEAR_ME_RADIUS_KM = 10;

function getNearMeRadiusKm(): number {
  const configured =
    Number(
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

  const parsed =
    Number(value.trim());

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

function distanceInKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
): number {
  const earthRadiusKm = 6371;

  const latitudeDelta =
    ((latitude2 - latitude1) *
      Math.PI) /
    180;

  const longitudeDelta =
    ((longitude2 - longitude1) *
      Math.PI) /
    180;

  const latitude1Radians =
    (latitude1 * Math.PI) /
    180;

  const latitude2Radians =
    (latitude2 * Math.PI) /
    180;

  const a =
    Math.sin(
      latitudeDelta / 2
    ) *
      Math.sin(
        latitudeDelta / 2
      ) +
    Math.cos(
      latitude1Radians
    ) *
      Math.cos(
        latitude2Radians
      ) *
      Math.sin(
        longitudeDelta / 2
      ) *
      Math.sin(
        longitudeDelta / 2
      );

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadiusKm * c;
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

  /**
   * Important:
   * Exact business coordinates stay server-side.
   * The client only needs the location identity/name.
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

    const hasValidGps =
      isValidLatitude(latitude) &&
      isValidLongitude(longitude);

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
      return NextResponse.json({
        businesses: [],
        total: 0,
        mode: "none",
        location: null,
      });
    }

    /*
     * -----------------------------------------
     * LOAD ACTIVE BUSINESSES
     * -----------------------------------------
     *
     * IMPORTANT:
     *
     * deletedAt must always be null for
     * normal customer-facing queries.
     */

    const baseBusinesses =
      await prisma.business.findMany({
        where: {
          status: "ACTIVE",
          deletedAt: null,

          ...(searchMode === "area"
            ? {
                location: {
                  area: {
                    contains: area,
                    mode: "insensitive",
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

              /**
               * These coordinates are selected only
               * for server-side GPS calculations.
               * They are never returned directly.
               */
              lat: true,
              long: true,
            },
          },

          categories: {
            select: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

          /**
           * Near Me cards only display one product.
           * Don't load all 30 products unnecessarily.
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
              business.location?.area ??
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

      return NextResponse.json({
        businesses:
          formattedBusinesses,

        total:
          formattedBusinesses.length,

        mode: "area",

        location: area,
      });
    }

    /*
     * -----------------------------------------
     * GPS SEARCH
     * -----------------------------------------
     *
     * Businesses must have valid coordinates
     * before distance can be calculated.
     */

    const businessesWithCoordinates =
      baseBusinesses.filter(
        (business) =>
          business.location !== null &&
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
     * CALCULATE + FILTER DISTANCES
     * -----------------------------------------
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
            )
          ) {
            return null;
          }

          const distanceKm =
            distanceInKm(
              latitude!,
              longitude!,
              location.lat,
              location.long
            );

          /**
           * Proper Near Me behavior:
           * businesses outside the configured
           * radius are excluded.
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
          > => business !== null
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
     */

    return NextResponse.json({
      businesses: gpsResults,

      total: gpsResults.length,

      mode: "gps",

      /**
       * Do not return the user's exact
       * coordinates unnecessarily.
       */
      location: {
        type: "current",
      },

      radiusKm,
    });
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
      }
    );
  }
}