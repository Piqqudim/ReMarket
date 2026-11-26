import { NextRequest, NextResponse } from "next/server";
import { Prisma, SellerOrderStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireSellerAccount } from "@/lib/seller-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_PAGE = 100_000;
const MAX_LIMIT = 50;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/* =========================================================
   RESPONSE HELPERS
========================================================= */

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
   PAGINATION VALIDATION
========================================================= */

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  if (
    value === null ||
    !/^\d+$/.test(value.trim())
  ) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

/* =========================================================
   SELLER ORDER STATUS VALIDATION
========================================================= */

function isSellerOrderStatus(
  value: string,
): value is SellerOrderStatus {
  return Object.values(SellerOrderStatus).includes(
    value as SellerOrderStatus,
  );
}

/* =========================================================
   GET SELLER ORDERS
========================================================= */

export async function GET(request: NextRequest) {
  try {
    /*
     * --------------------------------------------------
     * 1. SELLER AUTHENTICATION
     * --------------------------------------------------
     *
     * Allows an authenticated seller to access existing
     * orders even if their business is inactive.
     *
     * A deleted business is not allowed.
     * --------------------------------------------------
     */

    const access = await requireSellerAccount();

    if (!access.authorized) {
      return access.response;
    }

    const business = access.business;

    if (!business) {
      return jsonError(
        "You do not have a business linked to this seller account.",
        404,
      );
    }

    if (business.ownerId !== access.user.id) {
      return jsonError(
        "You are not allowed to access these orders.",
        403,
      );
    }

    if (business.deletedAt) {
      return jsonError(
        "This business has been deleted.",
        410,
      );
    }

    /*
     * --------------------------------------------------
     * 2. READ PAGINATION PARAMETERS
     * --------------------------------------------------
     */

    const searchParams = request.nextUrl.searchParams;

    const page = parsePositiveInteger(
      searchParams.get("page"),
      1,
      MAX_PAGE,
    );

    const limit = parsePositiveInteger(
      searchParams.get("limit"),
      20,
      MAX_LIMIT,
    );

    const skip = (page - 1) * limit;
    const searchTerm = (searchParams.get("search") ?? "").trim().slice(0, 120);

    /*
     * --------------------------------------------------
     * 3. VALIDATE STATUS FILTER
     * --------------------------------------------------
     */

    const rawStatus = searchParams.get("status");

    const statusParam = rawStatus?.trim() || null;

    if (
      statusParam &&
      !isSellerOrderStatus(statusParam)
    ) {
      return jsonError(
        "Invalid seller order status.",
        400,
      );
    }

    /*
     * --------------------------------------------------
     * 4. BUILD SELLER ORDER FILTER
     * --------------------------------------------------
     *
     * Both businessId and sellerId are checked.
     * This ensures a seller only retrieves orders
     * belonging to their own business and account.
     * --------------------------------------------------
     */

    const baseWhere: Prisma.SellerOrderWhereInput = {
      businessId: business.id,
      sellerId: access.user.id,
      ...(searchTerm ? {
        OR: [
          { sellerOrderCode: { contains: searchTerm, mode: "insensitive" } },
          { order: { is: {
            orderCode: { contains: searchTerm, mode: "insensitive" },
          } } },
          { order: { is: {
            deliveryRecipient: { contains: searchTerm, mode: "insensitive" },
          } } },
          { order: { is: {
            buyer: { is: { name: { contains: searchTerm, mode: "insensitive" } } },
          } } },
          { order: { is: {
            buyer: { is: { email: { contains: searchTerm, mode: "insensitive" } } },
          } } },
          { order: { is: {
            deliveryPhone: { contains: searchTerm, mode: "insensitive" },
          } } },
          { order: { is: {
            deliveryAddress: { contains: searchTerm, mode: "insensitive" },
          } } },
          { order: { is: {
            deliveryArea: { contains: searchTerm, mode: "insensitive" },
          } } },
          { items: { some: { productName: { contains: searchTerm, mode: "insensitive" } } } },
        ],
      } : {}),
    };
    const where: Prisma.SellerOrderWhereInput = {
      AND: [baseWhere, ...(statusParam ? [{ status: statusParam as SellerOrderStatus }] : [])],
    };

    /*
     * --------------------------------------------------
     * 5. RETRIEVE ORDERS AND TOTAL COUNT
     * --------------------------------------------------
     */

    const [orders, total, statusGroups] = await Promise.all([
      prisma.sellerOrder.findMany({
        where,

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
          /*
           * SELLER ORDER DETAILS
           */

          id: true,
          sellerOrderCode: true,
          status: true,
          subtotal: true,
          sellerNote: true,

          /*
           * ORDER LIFECYCLE TIMESTAMPS
           */

          acceptedAt: true,
          rejectedAt: true,
          dispatchedAt: true,
          deliveredAt: true,
          completedAt: true,
          cancelledAt: true,

          createdAt: true,
          updatedAt: true,

          /*
           * PARENT ORDER AND DELIVERY DETAILS
           */

          order: {
            select: {
              id: true,
              orderCode: true,
              status: true,

              createdAt: true,
              buyer: {
                select: { id: true, name: true, email: true },
              },

              deliveryRecipient: true,
              deliveryPhone: true,
              deliveryAddress: true,
              deliveryArea: true,
              deliveryLandmark: true,
              deliveryNotes: true,
            },
          },

          /*
           * ORDERED PRODUCTS
           *
           * Snapshot information is used so historical
           * orders remain readable even if the original
           * product changes or is removed.
           */

          items: {
            orderBy: {
              createdAt: "asc",
            },

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
          shipments: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              status: true,
              courierName: true,
              trackingCode: true,
              trackingUrl: true,
              waybillUrl: true,
              estimatedDelivery: true,
              shippingFee: true,
              currency: true,
              bookedAt: true,
              pickedUpAt: true,
              inTransitAt: true,
              deliveredAt: true,
              failureReason: true,
            },
          },
        },
      }),

      prisma.sellerOrder.count({ where }),
      prisma.sellerOrder.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      }),
    ]);

    /*
     * --------------------------------------------------
     * 6. PAGINATION METADATA
     * --------------------------------------------------
     */

    const totalPages = Math.ceil(total / limit);

    /*
     * --------------------------------------------------
     * 7. SUCCESS RESPONSE
     * --------------------------------------------------
     */

    return NextResponse.json(
      {
        orders,
        statusCounts: Object.fromEntries(statusGroups.map((item) => [item.status, item._count._all])),
        search: searchTerm,

        business: {
          id: business.id,
          name: business.name,
        },

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
      "SELLER_ORDERS_GET_ERROR:",
      error,
    );

    return jsonError(
      "Unable to retrieve seller orders.",
      500,
    );
  }
}