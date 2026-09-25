import type { Prisma } from "@prisma/client";
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

type RequestStatus =
  (typeof REQUEST_STATUSES)[number];

function isRequestStatus(
  value: unknown
): value is RequestStatus {
  return (
    typeof value === "string" &&
    REQUEST_STATUSES.includes(
      value as RequestStatus
    )
  );
}

const adminRequestInclude = {
  category: {
    select: {
      id: true,
      name: true,
    },
  },

  matches: {
    orderBy: {
      score: "desc" as const,
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
              long: true,
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
} satisfies Prisma.BuyerRequestInclude;

type AdminRequestWithDetails =
  Prisma.BuyerRequestGetPayload<{
    include: typeof adminRequestInclude;
  }>;

function formatAdminRequest(
  requestItem: AdminRequestWithDetails
) {
  return {
    id: requestItem.id,
    requestCode: requestItem.requestCode,
    query: requestItem.query,

    category: requestItem.category,

    budget: requestItem.budget,
    locationArea:
      requestItem.locationArea,
    quantity: requestItem.quantity,
    description:
      requestItem.description,
    imageUrl: requestItem.imageUrl,

    status: requestItem.status,

    buyerContact:
      requestItem.buyerContact ?? "",

    createdAt:
      requestItem.createdAt.toISOString(),

    matches:
      requestItem.matches.map((match) => ({
        id: match.id,
        score: match.score,
        addedManually:
          match.addedManually,

        createdAt:
          match.createdAt.toISOString(),

        business: {
          id: match.business.id,
          name: match.business.name,

          ownerName:
            match.business.ownerName,

          phone:
            match.business.phone,

          area:
            match.business.location
              ?.area ?? null,

          lat:
            match.business.location
              ?.lat ?? null,

          long:
            match.business.location
              ?.long ?? null,

          verification:
            match.business.verification,

          verified:
            match.business.verification ===
            "VERIFIED",

          status:
            match.business.status,

          availability:
            match.business.availability,

          socialLinks:
            match.business.socialLinks,
        },
      })),
  };
}

export async function GET(
  request: Request
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { searchParams } =
    new URL(request.url);

  const q =
    searchParams.get("q")?.trim() ?? "";

  const rawStatus =
    searchParams.get("status")?.trim() ?? "";

  if (
    rawStatus &&
    !isRequestStatus(rawStatus)
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid request status",
      },
      {
        status: 400,
      }
    );
  }

  const status: RequestStatus | undefined =
    rawStatus
      ? (rawStatus as RequestStatus)
      : undefined;

  try {
    const requests =
      await prisma.buyerRequest.findMany({
        where: {
          ...(status
            ? {
                status,
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

        include:
          adminRequestInclude,
      });

    return NextResponse.json({
      requests:
        requests.map(
          formatAdminRequest
        ),

      total: requests.length,
    });
  } catch (error) {
    console.error(
      "Admin requests GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load requests",
      },
      {
        status: 500,
      }
    );
  }
}