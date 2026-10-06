import {
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { createNotification } from "@/lib/notifications";

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
              match.business.location
                ?.area ??
              null,

            lat:
              match.business.location
                ?.lat ??
              null,

            long:
              match.business.location
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
              match.business.status,

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

/*
 * -----------------------------------------
 * REQUEST STATUS NOTIFICATION
 * -----------------------------------------
 *
 * The current BuyerRequest model is contact-
 * based and does not have a buyer User ID.
 *
 * Therefore, status-change notifications are
 * sent to every seller whose business is
 * actually matched to this request.
 *
 * No fixed dedupe key is used because a request
 * can legitimately move through multiple
 * statuses over its lifetime.
 */

async function notifyMatchedSellersOfStatusChange(
  requestId: string,
  requestCode: string,
  query: string,
  status: RequestStatus
) {
  let notificationType:
    | NotificationType
    | null = null;

  let title = "";

  switch (status) {
    case "FULFILLED":
      notificationType =
        NotificationType.REQUEST_FULFILLED;

      title =
        "Request fulfilled";

      break;

    case "UNFULFILLED":
      notificationType =
        NotificationType.REQUEST_UNFULFILLED;

      title =
        "Request marked unfulfilled";

      break;

    case "CLOSED":
      notificationType =
        NotificationType.REQUEST_CLOSED;

      title =
        "Request closed";

      break;

    default:
      notificationType =
        NotificationType.REQUEST_UPDATED;

      title =
        "Buyer request updated";

      break;
  }

  let message = "";

  switch (status) {
    case "MATCHED":
      message =
        `A buyer request matching your business is now marked as matched: "${query}" (${requestCode}).`;

      break;

    case "CONTACTED":
      message =
        `A buyer request matching your business is now marked as contacted: "${query}" (${requestCode}).`;

      break;

    case "FULFILLED":
      message =
        `The buyer request "${query}" (${requestCode}) has been marked as fulfilled.`;

      break;

    case "UNFULFILLED":
      message =
        `The buyer request "${query}" (${requestCode}) has been marked as unfulfilled.`;

      break;

    case "CLOSED":
      message =
        `The buyer request "${query}" (${requestCode}) has been closed.`;

      break;

    case "NEW":
      message =
        `The buyer request "${query}" (${requestCode}) has been moved back to new.`;

      break;
  }

  try {
    const matches =
      await prisma.match.findMany({
        where: {
          requestId,
        },

        select: {
          business: {
            select: {
              id: true,
              ownerId: true,
            },
          },
        },
      });

    const recipients =
      new Map<
        string,
        string
      >();

    for (
      const match of matches
    ) {
      const ownerId =
        match.business.ownerId;

      if (
        typeof ownerId !==
          "string" ||
        !ownerId
      ) {
        continue;
      }

      recipients.set(
        ownerId,
        match.business.id
      );
    }

    for (
      const [
        ownerId,
        businessId,
      ] of recipients
    ) {
      try {
        await createNotification({
          userId:
            ownerId,

          type:
            notificationType,

          title,

          message,

          priority:
            NotificationPriority.NORMAL,

          data: {
            requestId,

            requestCode,

            businessId,

            status,

            href:
              "/seller",
          },

          /*
           * No permanent dedupe key:
           * the same request can legitimately
           * change status more than once.
           */
          dedupeKey:
            null,
        });
      } catch (
        notificationError
      ) {
        console.error(
          "Admin request status notification error:",
          notificationError
        );
      }
    }
  } catch (
    matchLookupError
  ) {
    console.error(
      "Admin request matched-seller lookup error:",
      matchLookupError
    );
  }
}

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } =
    await params;

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
      await prisma.buyerRequest.findUnique(
        {
          where: {
            id,
          },

          include:
            adminRequestInclude,
        }
      );

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
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } =
    await params;

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
      typeof body !==
        "object" ||
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
      await prisma.buyerRequest.findUnique(
        {
          where: {
            id,
          },

          select: {
            id: true,
            requestCode: true,
            query: true,
            status: true,
          },
        }
      );

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

    /*
     * Do nothing notification-wise when the
     * requested status is already the current
     * status.
     */

    const statusChanged =
      existingRequest.status !==
      statusValue;

    const updatedRequest =
      await prisma.buyerRequest.update({
        where: {
          id,
        },

        data: {
          status:
            statusValue,
        },

        include:
          adminRequestInclude,
      });

    /*
     * Notify all affected matched sellers
     * only after the database update succeeds.
     *
     * Notification failure must never roll back
     * the successful admin status update.
     */

    if (statusChanged) {
      try {
        await notifyMatchedSellersOfStatusChange(
          updatedRequest.id,

          updatedRequest.requestCode,

          updatedRequest.query,

          statusValue
        );
      } catch (
        notificationError
      ) {
        console.error(
          "Admin request notification error:",
          notificationError
        );
      }
    }

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