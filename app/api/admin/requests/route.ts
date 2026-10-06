import {
  Prisma,
  RequestStatus as PrismaRequestStatus,
} from "@prisma/client";

import {
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

const MAX_QUERY_LENGTH = 100;

function noStoreHeaders(): Headers {
  const headers = new Headers();

  headers.set(
    "Cache-Control",
    "no-store"
  );

  headers.set(
    "Pragma",
    "no-cache"
  );

  return headers;
}

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isRequestStatus(
  value: unknown
): value is PrismaRequestStatus {
  return (
    typeof value === "string" &&
    Object.values(
      PrismaRequestStatus
    ).includes(
      value as PrismaRequestStatus
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
    include:
      typeof adminRequestInclude;
  }>;

function formatAdminRequest(
  requestItem: AdminRequestWithDetails
) {
  return {
    id:
      requestItem.id,

    requestCode:
      requestItem.requestCode,

    query:
      requestItem.query,

    category:
      requestItem.category,

    budget:
      requestItem.budget,

    locationArea:
      requestItem.locationArea,

    quantity:
      requestItem.quantity,

    description:
      requestItem.description,

    imageUrl:
      requestItem.imageUrl,

    status:
      requestItem.status,

    buyerContact:
      requestItem.buyerContact ??
      "",

    createdAt:
      requestItem.createdAt.toISOString(),

    matches:
      requestItem.matches.map(
        (match) => ({
          id:
            match.id,

          score:
            match.score,

          addedManually:
            match.addedManually,

          createdAt:
            match.createdAt.toISOString(),

          business: {
            id:
              match.business.id,

            name:
              match.business.name,

            ownerName:
              match.business.ownerName,

            phone:
              match.business.phone,

            area:
              match.business
                .location
                ?.area ??
              null,

            lat:
              match.business
                .location
                ?.lat ??
              null,

            long:
              match.business
                .location
                ?.long ??
              null,

            verification:
              match.business
                .verification,

            verified:
              match.business
                .verification ===
              "VERIFIED",

            status:
              match.business
                .status,

            availability:
              match.business
                .availability,

            socialLinks:
              match.business
                .socialLinks,
          },
        })
      ),
  };
}

export async function GET(
  request: Request
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const {
      searchParams,
    } = new URL(
      request.url
    );

    const q =
      cleanString(
        searchParams.get("q")
      );

    if (
      q.length >
      MAX_QUERY_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "Search query is too long.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders(),
        }
      );
    }

    const rawStatus =
      cleanString(
        searchParams.get(
          "status"
        )
      );

    let status:
      | PrismaRequestStatus
      | undefined;

    if (rawStatus) {
      if (
        !isRequestStatus(
          rawStatus
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid request status.",
          },
          {
            status: 400,
            headers:
              noStoreHeaders(),
          }
        );
      }

      status =
        rawStatus;
    }

    const requests =
      await prisma.buyerRequest.findMany(
        {
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
                        contains:
                          q,
                        mode:
                          "insensitive",
                      },
                    },

                    {
                      query: {
                        contains:
                          q,
                        mode:
                          "insensitive",
                      },
                    },

                    {
                      buyerContact: {
                        contains:
                          q,
                        mode:
                          "insensitive",
                      },
                    },

                    {
                      locationArea: {
                        contains:
                          q,
                        mode:
                          "insensitive",
                      },
                    },
                  ],
                }
              : {}),
          },

          orderBy: {
            createdAt:
              "desc",
          },

          include:
            adminRequestInclude,
        }
      );

    const formattedRequests =
      requests.map(
        formatAdminRequest
      );

    return NextResponse.json(
      {
        requests:
          formattedRequests,

        total:
          formattedRequests.length,
      },
      {
        status: 200,
        headers:
          noStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin requests GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load requests.",
      },
      {
        status: 500,
        headers:
          noStoreHeaders(),
      }
    );
  }
}