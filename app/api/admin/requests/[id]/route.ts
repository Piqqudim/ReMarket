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

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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
  _request: Request,
  { params }: RouteContext
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      {
        error:
          "Request ID is required",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const requestItem =
      await prisma.buyerRequest.findUnique({
        where: {
          id,
        },

        include:
          adminRequestInclude,
      });

    if (!requestItem) {
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

    return NextResponse.json({
      request:
        formatAdminRequest(
          requestItem
        ),
    });
  } catch (error) {
    console.error(
      "Admin request GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load request",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      {
        error:
          "Request ID is required",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body",
        },
        {
          status: 400,
        }
      );
    }

    const statusValue =
      "status" in body
        ? body.status
        : undefined;

    if (
      !isRequestStatus(
        statusValue
      )
    ) {
      return NextResponse.json(
        {
          error:
            "A valid request status is required",
        },
        {
          status: 400,
        }
      );
    }

    const existingRequest =
      await prisma.buyerRequest.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
        },
      });

    if (!existingRequest) {
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

    const updatedRequest =
      await prisma.buyerRequest.update({
        where: {
          id,
        },

        data: {
          status: statusValue,
        },

        include:
          adminRequestInclude,
      });

    return NextResponse.json({
      request:
        formatAdminRequest(
          updatedRequest
        ),
    });
  } catch (error) {
    console.error(
      "Admin request PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update request",
      },
      {
        status: 500,
      }
    );
  }
}