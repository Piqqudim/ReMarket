import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_BUSINESS_ID_LENGTH = 100;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function validCoordinatePair(
  latitude: number | null,
  longitude: number | null
): latitude is number {
  return (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function parseOptionalCoordinate(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function noStoreHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const rateLimit = checkPublicRateLimit(request, "featured");

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many directions requests. Please try again shortly." },
      { status: 429, headers: noStoreHeaders(rateLimit.headers) }
    );
  }

  try {
    const { id } = await context.params;

    if (!id || id.length > MAX_BUSINESS_ID_LENGTH) {
      return NextResponse.json(
        { error: "Invalid business ID." },
        { status: 400, headers: noStoreHeaders(rateLimit.headers) }
      );
    }

    const business = await prisma.business.findFirst({
      where: {
        id,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: {
        location: {
          select: {
            lat: true,
            long: true,
            address: true,
          },
        },
      },
    });

    if (!business?.location) {
      return NextResponse.json(
        { error: "Business directions are not available." },
        { status: 404, headers: noStoreHeaders(rateLimit.headers) }
      );
    }

    const destinationLocation = business.location;
    const hasCoordinates = validCoordinatePair(
      destinationLocation.lat,
      destinationLocation.long
    );
    const address = destinationLocation.address?.trim() ?? "";
    const destination = hasCoordinates
      ? `${destinationLocation.lat},${destinationLocation.long}`
      : address;

    if (!destination) {
      return NextResponse.json(
        { error: "Business directions are not available." },
        { status: 404, headers: noStoreHeaders(rateLimit.headers) }
      );
    }

    const originLatitude = parseOptionalCoordinate(
      request.nextUrl.searchParams.get("originLat")
    );
    const originLongitude = parseOptionalCoordinate(
      request.nextUrl.searchParams.get("originLng")
    );

    if (
      (request.nextUrl.searchParams.has("originLat") ||
        request.nextUrl.searchParams.has("originLng")) &&
      !validCoordinatePair(originLatitude, originLongitude)
    ) {
      return NextResponse.json(
        { error: "Origin coordinates are invalid." },
        { status: 400, headers: noStoreHeaders(rateLimit.headers) }
      );
    }

    const mapsUrl = new URL("https://www.google.com/maps/dir/");
    mapsUrl.searchParams.set("api", "1");
    mapsUrl.searchParams.set("destination", destination);
    mapsUrl.searchParams.set("travelmode", "driving");
    mapsUrl.searchParams.set("dir_action", "navigate");

    if (validCoordinatePair(originLatitude, originLongitude)) {
      mapsUrl.searchParams.set(
        "origin",
        `${originLatitude},${originLongitude}`
      );
    }

    return NextResponse.redirect(mapsUrl, {
      status: 302,
      headers: noStoreHeaders(rateLimit.headers),
    });
  } catch (error) {
    console.error("Business directions error:", error);
    return NextResponse.json(
      { error: "Unable to open business directions." },
      { status: 500, headers: noStoreHeaders(rateLimit.headers) }
    );
  }
}
