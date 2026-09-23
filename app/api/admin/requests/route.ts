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

export async function GET(request: Request) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q")?.trim() || "";
  const status = searchParams.get("status")?.trim() || "";

  if (
    status &&
    !REQUEST_STATUSES.includes(status as (typeof REQUEST_STATUSES)[number])
  ) {
    return NextResponse.json(
      { error: "Invalid request status" },
      { status: 400 },
    );
  }

  try {
    const requests = await prisma.buyerRequest.findMany({
      where: {
        ...(status
          ? {
              status:
                status as (typeof REQUEST_STATUSES)[number],
            }
          : {}),
        ...(q
          ? {
              OR: [
                {
                  requestCode: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  query: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  buyerContact: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  locationArea: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: {
        createdAt: "desc",
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
      requests: requests.map((requestItem) => ({
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
            area: match.business.location?.area ?? null,
            verification: match.business.verification,
            verified: match.business.verification === "VERIFIED",
            status: match.business.status,
          },
        })),
      })),
    });
  } catch (error) {
    console.error("Admin requests GET error:", error);

    return NextResponse.json(
      { error: "Unable to load requests" },
      { status: 500 },
    );
  }
}