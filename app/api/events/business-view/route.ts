import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const MAX_VISITOR_ID_LENGTH = 100;

export async function POST(
  request: Request
) {
  try {
    let body: unknown;

    /*
     * -----------------------------------------
     * PARSE REQUEST BODY
     * -----------------------------------------
     */

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "Invalid JSON body",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE REQUEST BODY
     * -----------------------------------------
     */

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error: "Invalid request body",
        },
        {
          status: 400,
        }
      );
    }

    const data =
      body as Record<string, unknown>;

    /*
     * -----------------------------------------
     * READ FIELDS
     * -----------------------------------------
     */

    const businessId =
      typeof data.businessId === "string"
        ? data.businessId.trim()
        : "";

    const visitorId =
      typeof data.visitorId === "string"
        ? data.visitorId.trim()
        : "";

    /*
     * -----------------------------------------
     * VALIDATE BUSINESS ID
     * -----------------------------------------
     */

    if (!businessId) {
      return NextResponse.json(
        {
          error: "Business ID is required",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE VISITOR ID
     * -----------------------------------------
     */

    if (!visitorId) {
      return NextResponse.json(
        {
          error: "Visitor ID is required",
        },
        {
          status: 400,
        }
      );
    }

    if (
      visitorId.length >
      MAX_VISITOR_ID_LENGTH
    ) {
      return NextResponse.json(
        {
          error: "Invalid visitor ID",
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
     * Only active, non-soft-deleted businesses
     * may receive view events.
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
          error: "Business not found",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * -----------------------------------------
     * CREATE BUSINESS VIEW EVENT
     * -----------------------------------------
     */

    const event =
      await prisma.businessViewEvent.create({
        data: {
          businessId,
          visitorId,
        },
        select: {
          id: true,
          businessId: true,
          createdAt: true,
        },
      });

    /*
     * -----------------------------------------
     * SUCCESS
     * -----------------------------------------
     *
     * visitorId is intentionally not returned.
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
      "Business view event error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to record business view",
      },
      {
        status: 500,
      }
    );
  }
}