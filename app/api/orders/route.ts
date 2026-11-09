import { NextResponse } from "next/server";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_PAGE = 100_000;
const MAX_LIMIT = 30;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: noStore,
    },
  );
}

/* =========================================================
   PAGINATION VALIDATION
========================================================= */

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  if (value === null || !/^\d+$/.test(value.trim())) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

/* =========================================================
   GET BUYER ORDERS

   GET /api/orders?page=1&limit=10

   Buyers can only retrieve orders belonging to
   their authenticated account.
========================================================= */

export async function GET(request: Request) {
  try {
    /* -----------------------------------------------
       1. BUYER AUTHENTICATION
    ----------------------------------------------- */

    const access = await requireBuyer();

    if (!access.authorized) {
      return access.response;
    }

    /* -----------------------------------------------
       2. PAGINATION
    ----------------------------------------------- */

    const url = new URL(request.url);

    const page = parsePositiveInteger(
      url.searchParams.get("page"),
      1,
      MAX_PAGE,
    );

    const limit = parsePositiveInteger(
      url.searchParams.get("limit"),
      10,
      MAX_LIMIT,
    );

    const skip = (page - 1) * limit;

    /* -----------------------------------------------
       3. BUYER ORDER FILTER
    ----------------------------------------------- */

    const where = {
      buyerId: access.user.id,
    };

    /* -----------------------------------------------
       4. RETRIEVE ORDERS AND TOTAL COUNT
    ----------------------------------------------- */

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,

        // Stable ordering prevents inconsistent pagination
        // when multiple orders have the same creation time.
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        skip,
        take: limit,

        select: {
          /* PARENT ORDER */

          id: true,
          orderCode: true,
          status: true,

          itemsSubtotal: true,
          deliveryFee: true,
          totalAmount: true,
          currency: true,

          createdAt: true,
          updatedAt: true,
          completedAt: true,
          cancelledAt: true,

          /* SELLER ORDERS */

          sellerOrders: {
            orderBy: [
              {
                createdAt: "asc",
              },
              {
                id: "asc",
              },
            ],

            select: {
              id: true,
              sellerOrderCode: true,
              status: true,
              subtotal: true,

              acceptedAt: true,
              rejectedAt: true,
              dispatchedAt: true,
              deliveredAt: true,
              completedAt: true,
              cancelledAt: true,

              /* BUSINESS DETAILS */

              business: {
                select: {
                  id: true,
                  name: true,
                  imageUrl: true,
                },
              },

              /* ORDERED PRODUCT SNAPSHOTS */

              items: {
                orderBy: [
                  {
                    createdAt: "asc",
                  },
                  {
                    id: "asc",
                  },
                ],

                select: {
                  id: true,
                  productId: true,
                  productName: true,
                  productImageUrl: true,
                  unitPrice: true,
                  quantity: true,
                  lineTotal: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      }),

      prisma.order.count({
        where,
      }),
    ]);

    /* -----------------------------------------------
       5. PAGINATION METADATA
    ----------------------------------------------- */

    const totalPages = Math.ceil(total / limit);

    /* -----------------------------------------------
       6. SUCCESS RESPONSE
    ----------------------------------------------- */

    return NextResponse.json(
      {
        orders,

        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1 && total > 0,
        },
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error(
      "Buyer orders retrieval error:",
      error,
    );

    return jsonError(
      "Unable to retrieve your orders.",
      500,
    );
  }
}