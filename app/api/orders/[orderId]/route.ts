import { NextResponse } from "next/server";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_ORDER_ID_LENGTH = 100;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

function jsonError(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: noStore,
    },
  );
}

/* =========================================================
   GET BUYER ORDER DETAILS

   GET /api/orders/[orderId]

   Buyers can only retrieve orders belonging to
   their authenticated account.
========================================================= */

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    /* -----------------------------------------------
       1. BUYER AUTHENTICATION
    ----------------------------------------------- */

    const access = await requireBuyer();

    if (!access.authorized) {
      return access.response;
    }

    /* -----------------------------------------------
       2. ROUTE PARAMETER VALIDATION
    ----------------------------------------------- */

    const { orderId } = await context.params;

    if (typeof orderId !== "string") {
      return jsonError(
        "Invalid order reference.",
        400,
      );
    }

    const validatedOrderId = orderId.trim();

    if (
      !validatedOrderId ||
      validatedOrderId.length > MAX_ORDER_ID_LENGTH
    ) {
      return jsonError(
        "Invalid order reference.",
        400,
      );
    }

    /* -----------------------------------------------
       3. RETRIEVE BUYER ORDER
    ----------------------------------------------- */

    const order = await prisma.order.findFirst({
      where: {
        id: validatedOrderId,
        buyerId: access.user.id,
      },

      select: {
        /* PARENT ORDER */

        id: true,
        orderCode: true,
        status: true,

        itemsSubtotal: true,
        deliveryFee: true,
        totalAmount: true,
        currency: true,

        /* DELIVERY DETAILS */

        deliveryRecipient: true,
        deliveryPhone: true,
        deliveryAddress: true,
        deliveryArea: true,
        deliveryLandmark: true,
        deliveryNotes: true,

        /* ORDER TIMESTAMPS */

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

        /* PAYMENT RECORDS */

        payments: {
          orderBy: [
            {
              createdAt: "desc",
            },
            {
              id: "desc",
            },
          ],

          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            failureReason: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    });

    /* -----------------------------------------------
       4. HANDLE MISSING ORDER
    ----------------------------------------------- */

    if (!order) {
      return jsonError(
        "Order not found.",
        404,
      );
    }

    /* -----------------------------------------------
       5. SUCCESS RESPONSE
    ----------------------------------------------- */

    return NextResponse.json(
      {
        success: true,
        order,
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error(
      "Buyer order details GET error:",
      error,
    );

    return jsonError(
      "Unable to retrieve this order.",
      500,
    );
  }
}