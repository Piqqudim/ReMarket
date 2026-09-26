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

type ContactPlatform =
  (typeof PLATFORMS)[number];

export async function POST(
  request: Request
) {
  try {
    const body =
      await request.json();

    const businessId =
      typeof body.businessId ===
      "string"
        ? body.businessId.trim()
        : "";

    const requestId =
      typeof body.requestId ===
      "string"
        ? body.requestId.trim() ||
          null
        : null;

    const platform =
      typeof body.platform ===
      "string"
        ? body.platform
            .trim()
            .toUpperCase()
        : "";

    /*
     * -----------------------------------------
     * VALIDATE BUSINESS ID
     * -----------------------------------------
     */

    if (!businessId) {
      return NextResponse.json(
        {
          error:
            "Business ID is required",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE CONTACT PLATFORM
     * -----------------------------------------
     */

    if (
      !PLATFORMS.includes(
        platform as ContactPlatform
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid contact platform",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * -----------------------------------------
     * VERIFY BUSINESS
     * -----------------------------------------
     *
     * Only active, non-soft-deleted
     * businesses may receive contact events.
     */

    const business =
      await prisma.business.findFirst({
        where: {
          id: businessId,
          status: "ACTIVE",
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

    if (!business) {
      return NextResponse.json(
        {
          error:
            "Business not found",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * -----------------------------------------
     * VERIFY REQUEST WHEN PROVIDED
     * -----------------------------------------
     */

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
          {
            error:
              "Request not found",
          },
          {
            status: 404,
          }
        );
      }
    }

    /*
     * -----------------------------------------
     * CREATE CONTACT EVENT
     * -----------------------------------------
     */

    const event =
      await prisma.contactEvent.create({
        data: {
          businessId,
          requestId,
          platform:
            platform as ContactPlatform,
        },
        select: {
          id: true,
          businessId: true,
          requestId: true,
          platform: true,
          createdAt: true,
        },
      });

    /*
     * -----------------------------------------
     * SUCCESS
     * -----------------------------------------
     */

    return NextResponse.json(
      {
        success: true,
        event,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Contact event error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to record contact event",
      },
      {
        status: 500,
      }
    );
  }
}