import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

const REQUEST_STATUSES = [
  "NEW",
  "MATCHED",
  "CONTACTED",
  "FULFILLED",
  "UNFULFILLED",
  "CLOSED",
] as const;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Request ID is required" },
      { status: 400 },
    );
  }

  try {
    const requestItem = await prisma.buyerRequest.findUnique({
      where: {
        id,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        matches: {
          orderBy: {
            score: "desc",
          },
          include: {
            business: {
              select: {
                id: true,
                name: true,
                ownerName: true,
                phone: true,
                verification: true,
                status: true,
                availability: true,
                location: {
                  select: {
                    area: true,
                    lat: true,
                    lng: true,
                  },
                },
                socialLinks: {
                  select: {
                    id: true,
                    platform: true,
                    handle: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!requestItem) {
      return NextResponse.json(
        { error: "Request not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      request: {
        id: requestItem.id,
        requestCode: requestItem.requestCode,
        query: requestItem.query,
        category: requestItem.category,
        budget: requestItem.budget,
        locationArea: requestItem.locationArea,
        quantity: requestItem.quantity,
        description: requestItem.description,
        imageUrl: requestItem.imageUrl,
        status: requestItem.status,
        buyerContact: requestItem.buyerContact,
        createdAt: requestItem.createdAt,
        matches: requestItem.matches.map((match) => ({
          id: match.id,
          score: match.score,
          addedManually: match.addedManually,
          createdAt: match.createdAt,
          business: {
            id: match.business.id,
            name: match.business.name,
            ownerName: match.business.ownerName,
            phone: match.business.phone,
            area: match.business.location?.area ?? null,
            lat: match.business.location?.lat ?? null,
            lng: match.business.location?.lng ?? null,
            verification: match.business.verification,
            verified: match.business.verification === "VERIFIED",
            status: match.business.status,
            availability: match.business.availability,
            socialLinks: match.business.socialLinks,
          },
        })),
      },
    });
  } catch (error) {
    console.error("Admin request GET error:", error);

    return NextResponse.json(
      { error: "Unable to load request" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Request ID is required" },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();

    const existingRequest = await prisma.buyerRequest.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existingRequest) {
      return NextResponse.json(
        { error: "Request not found" },
        { status: 404 },
      );
    }

    const updateData: {
      status?: (typeof REQUEST_STATUSES)[number];
    } = {};

    if (body.status !== undefined) {
      if (
        typeof body.status !== "string" ||
        !REQUEST_STATUSES.includes(
          body.status as (typeof REQUEST_STATUSES)[number],
        )
      ) {
        return NextResponse.json(
          { error: "Invalid request status" },
          { status: 400 },
        );
      }

      updateData.status =
        body.status as (typeof REQUEST_STATUSES)[number];
    }

    const updatedRequest = await prisma.buyerRequest.update({
      where: {
        id,
      },
      data: updateData,
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        matches: {
          orderBy: {
            score: "desc",
          },
          include: {
            business: {
              select: {
                id: true,
                name: true,
                verification: true,
                status: true,
                location: {
                  select: {
                    area: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      request: {
        ...updatedRequest,
        matches: updatedRequest.matches.map((match) => ({
          id: match.id,
          score: match.score,
          addedManually: match.addedManually,
          createdAt: match.createdAt,
          business: {
            id: match.business.id,
            name: match.business.name,
            area: match.business.location?.area ?? null,
            verification: match.business.verification,
            verified: match.business.verification === "VERIFIED",
            status: match.business.status,
          },
        })),
      },
    });
  } catch (error) {
    console.error("Admin request PATCH error:", error);

    return NextResponse.json(
      { error: "Unable to update request" },
      { status: 500 },
    );
  }
}