import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function parseCoordinate(
  value: string | null
): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

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
    ((latitude2 - latitude1) * Math.PI) / 180;

  const longitudeDelta =
    ((longitude2 - longitude1) * Math.PI) / 180;

  const latitude1Radians =
    (latitude1 * Math.PI) / 180;

  const latitude2Radians =
    (latitude2 * Math.PI) / 180;

  const a =
    Math.sin(latitudeDelta / 2) *
      Math.sin(latitudeDelta / 2) +
    Math.cos(latitude1Radians) *
      Math.cos(latitude2Radians) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);

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
  return Number(distanceKm.toFixed(1));
}

export async function GET(
  request: NextRequest
) {
  try {
    const { searchParams } = new URL(
      request.url
    );

    /*
     * -----------------------------------------
     * READ QUERY PARAMETERS
     * -----------------------------------------
     */

    const area = clean(
      searchParams.get("area")
    );

    const latitude = parseCoordinate(
      searchParams.get("lat")
    );

    const longitude = parseCoordinate(
      searchParams.get("lng") ??
        searchParams.get("long")
    );

    const hasValidGps =
      isValidLatitude(latitude) &&
      isValidLongitude(longitude);

    /*
     * -----------------------------------------
     * NO LOCATION PROVIDED
     * -----------------------------------------
     *
     * ReMarket should not invent a location.
     */

    if (!area && !hasValidGps) {
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
     * For area searches, Prisma filters
     * businesses by their location area.
     *
     * For GPS searches, we load active
     * businesses and calculate their distance
     * from the user's coordinates below.
     */

    const baseBusinesses =
      await prisma.business.findMany({
        where: {
          status: "ACTIVE",

          ...(area
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

        include: {
          location: true,

          categories: {
            include: {
              category: true,
            },
          },

          products: {
            where: {
              status: "ACTIVE",
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
              },
            },

            orderBy: {
              updatedAt: "desc",
            },
          },

          socialLinks: true,
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

    if (area) {
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
              business.location,

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
     * Businesses without valid coordinates
     * cannot have a real distance calculated,
     * so they are excluded from GPS results.
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

    /*
     * -----------------------------------------
     * CALCULATE DISTANCES
     * -----------------------------------------
     */

    const gpsResults =
      businessesWithCoordinates
        .map((business) => {
          const businessLatitude =
            business.location!.lat;

          const businessLongitude =
            business.location!.long;

          const distanceKm =
            distanceInKm(
              latitude!,
              longitude!,
              businessLatitude!,
              businessLongitude!
            );

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
              business.location!.area,

            location:
              business.location,

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
     * IMPORTANT:
     *
     * Even when gpsResults is empty, this is
     * still a successful GPS search.
     *
     * The frontend can therefore display:
     *
     * "No businesses found near you yet"
     *
     * instead of treating it as an error.
     */

    return NextResponse.json({
      businesses: gpsResults,

      total: gpsResults.length,

      mode: "gps",

      location: {
        lat: latitude,
        lng: longitude,
      },
    });
  } catch (error) {
    console.error(
      "Near Me API error:",
      error
    );

    /*
     * -----------------------------------------
     * SERVER ERROR
     * -----------------------------------------
     */

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