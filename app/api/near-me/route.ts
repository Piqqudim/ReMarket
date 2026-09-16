import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function toNumber(value: string | null) {
  if (!value) return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const earthRadiusKm = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const lat = toNumber(searchParams.get("lat"));
    const lng = toNumber(searchParams.get("lng"));

    const area = searchParams.get("area")?.trim() ?? "";

    /*
     * Get active businesses.
     *
     * We keep the query simple because the current Location
     * model only has area, lat and lng.
     */
    const businesses = await prisma.business.findMany({
      where: {
        status: "ACTIVE",
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
            price: true,
            priceMin: true,
            priceMax: true,
            availability: true,
            imageUrl: true,
          },
        },

        socialLinks: true,
      },
    });

    /*
     * ---------------------------------------------------------
     * AREA MODE
     * ---------------------------------------------------------
     *
     * Used when browser location is unavailable or denied.
     *
     * Example:
     * /api/near-me?area=Yaba
     */
    if (area) {
      const nearbyBusinesses = businesses
        .filter((business) => {
          const businessArea =
            business.location?.area?.toLowerCase() ?? "";

          return businessArea.includes(area.toLowerCase());
        })
        .map((business) => ({
          id: business.id,
          name: business.name,

          area:
            business.location?.area ?? "Location not added",

          distanceKm: null,

          category:
            business.categories[0]?.category?.name ?? "Other",

          categories: business.categories.map(
            (item) => item.category.name
          ),

          productCount: business.products.length,

          products: business.products,

          verified:
            business.verification === "VERIFIED",

          verification: business.verification,

          availability: business.availability,

          socialLinks: business.socialLinks,

          whatsapp:
            business.socialLinks.find(
              (link) => link.platform === "WHATSAPP"
            )?.handle ?? null,

          phone:
            business.socialLinks.find(
              (link) => link.platform === "PHONE"
            )?.handle ??
            business.phone ??
            null,

          directionsUrl:
            business.socialLinks.find(
              (link) => link.platform === "DIRECTIONS"
            )?.handle ?? null,
        }));

      return NextResponse.json({
        businesses: nearbyBusinesses,
        total: nearbyBusinesses.length,
        mode: "area",
        area,
      });
    }

    /*
     * ---------------------------------------------------------
     * GPS MODE
     * ---------------------------------------------------------
     *
     * Used when the browser gives us the user's coordinates.
     *
     * Example:
     * /api/near-me?lat=6.5244&lng=3.3792
     */

    if (lat !== null && lng !== null) {
      const nearbyBusinesses = businesses
        .map((business) => {
          const businessLat = business.location?.lat;
          const businessLng = business.location?.long;

          /*
           * Businesses without coordinates cannot have an
           * accurate distance calculated.
           */
          if (businessLat === null || businessLng === null) {
            return null;
          }

          if (
            businessLat === undefined ||
            businessLng === undefined
          ) {
            return null;
          }

          const distanceKm = calculateDistance(
            lat,
            lng,
            businessLat,
            businessLng
          );

          return {
            id: business.id,
            name: business.name,

            area:
              business.location?.area ?? "Location not added",

            distanceKm: Number(distanceKm.toFixed(1)),

            category:
              business.categories[0]?.category?.name ?? "Other",

            categories: business.categories.map(
              (item) => item.category.name
            ),

            productCount: business.products.length,

            products: business.products,

            verified:
              business.verification === "VERIFIED",

            verification: business.verification,

            availability: business.availability,

            socialLinks: business.socialLinks,

            whatsapp:
              business.socialLinks.find(
                (link) => link.platform === "WHATSAPP"
              )?.handle ?? null,

            phone:
              business.socialLinks.find(
                (link) => link.platform === "PHONE"
              )?.handle ??
              business.phone ??
              null,

            directionsUrl:
              business.socialLinks.find(
                (link) => link.platform === "DIRECTIONS"
              )?.handle ?? null,
          };
        })
        .filter(
          (
            business
          ): business is NonNullable<typeof business> =>
            business !== null
        )
        .sort(
          (a, b) => a.distanceKm - b.distanceKm
        );

      return NextResponse.json({
        businesses: nearbyBusinesses,
        total: nearbyBusinesses.length,
        mode: "gps",
        location: {
          lat,
          lng,
        },
      });
    }

    /*
     * ---------------------------------------------------------
     * NO LOCATION
     * ---------------------------------------------------------
     *
     * If neither GPS nor an area was supplied, return a useful
     * response instead of crashing.
     */

    return NextResponse.json({
      businesses: [],
      total: 0,
      mode: "none",
      message: "Location or area is required",
    });
  } catch (error) {
    console.error("Near Me API error:", error);

    return NextResponse.json(
      {
        businesses: [],
        total: 0,
        error: "Unable to load nearby businesses",
      },
      { status: 500 }
    );
  }
}