import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PLATFORMS = [
  "WHATSAPP",
  "INSTAGRAM",
  "TIKTOK",
  "FACEBOOK",
  "PHONE",
  "DIRECTIONS",
] as const;

type ContactPlatform = (typeof PLATFORMS)[number];

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const businessId =
      typeof body.businessId === "string"
        ? body.businessId.trim()
        : "";

    const requestId =
      typeof body.requestId === "string"
        ? body.requestId.trim()
        : null;

    const platform =
      typeof body.platform === "string"
        ? body.platform.trim().toUpperCase()
        : "";

    if (!businessId) {
      return NextResponse.json(
        { error: "Business ID is required" },
        { status: 400 },
      );
    }

    if (
      !PLATFORMS.includes(
        platform as ContactPlatform,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid contact platform" },
        { status: 400 },
      );
    }

    const business = await prisma.business.findUnique({
      where: {
        id: businessId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!business) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 },
      );
    }

    if (business.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Business is not active" },
        { status: 400 },
      );
    }

    if (requestId) {
      const buyerRequest =
        await prisma.buyerRequest.findUnique({
          where: {
            id: requestId,
          },
          select: {
            id: true,
          },
        });

      if (!buyerRequest) {
        return NextResponse.json(
          { error: "Request not found" },
          { status: 404 },
        );
      }
    }

    const event = await prisma.contactEvent.create({
      data: {
        businessId,
        requestId,
        platform: platform as ContactPlatform,
      },
      select: {
        id: true,
        businessId: true,
        requestId: true,
        platform: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        event,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Contact event error:", error);

    return NextResponse.json(
      { error: "Unable to record contact event" },
      { status: 500 },
    );
  }
}