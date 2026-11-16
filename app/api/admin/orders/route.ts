
import {
  DeliveryFeeStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from "@prisma/client";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;
const MAX_QUERY_LENGTH = 100;

const noStore = {
  "Cache-Control":
    "private, no-store, max-age=0, must-revalidate",
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

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number | null {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    return null;
  }

  return parsed;
}

function isOrderStatus(
  value: string,
): value is OrderStatus {
  return Object.values(OrderStatus).includes(
    value as OrderStatus,
  );
}

function isPaymentStatus(
  value: string,
): value is PaymentStatus {
  return Object.values(PaymentStatus).includes(
    value as PaymentStatus,
  );
}

function isDeliveryFeeStatus(
  value: string,
): value is DeliveryFeeStatus {
  return Object.values(DeliveryFeeStatus).includes(
    value as DeliveryFeeStatus,
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { searchParams } = request.nextUrl;

    const page = parsePositiveInteger(
      searchParams.get("page"),
      1,
      MAX_PAGE,
    );

    const pageSize = parsePositiveInteger(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

    if (page === null || pageSize === null) {
      return jsonError(
        "Invalid pagination. Page must be positive and pageSize must be between 1 and 100.",
        400,
      );
    }

    const skip = (page - 1) * pageSize;

    if (!Number.isSafeInteger(skip)) {
      return jsonError(
        "The requested page is too large.",
        400,
      );
    }

    const q =
      searchParams.get("q")?.trim() ?? "";

    const statusParam =
      searchParams.get("status") ?? "";

    const paymentStatusParam =
      searchParams.get("paymentStatus") ?? "";

    const deliveryFeeStatusParam =
      searchParams.get("deliveryFeeStatus") ?? "";

    if (q.length > MAX_QUERY_LENGTH) {
      return jsonError(
        "Search query must not exceed 100 characters.",
        400,
      );
    }

    if (
      statusParam &&
      !isOrderStatus(statusParam)
    ) {
      return jsonError(
        "Invalid order status.",
        400,
      );
    }

    if (
      paymentStatusParam &&
      !isPaymentStatus(paymentStatusParam)
    ) {
      return jsonError(
        "Invalid payment status.",
        400,
      );
    }

    if (
      deliveryFeeStatusParam &&
      !isDeliveryFeeStatus(deliveryFeeStatusParam)
    ) {
      return jsonError(
        "Invalid delivery fee status.",
        400,
      );
    }

    const status = statusParam
      ? statusParam as OrderStatus
      : undefined;

    const paymentStatus = paymentStatusParam
      ? paymentStatusParam as PaymentStatus
      : undefined;

    const deliveryFeeStatus =
      deliveryFeeStatusParam
        ? deliveryFeeStatusParam as DeliveryFeeStatus
        : undefined;

    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),

      ...(deliveryFeeStatus
        ? { deliveryFeeStatus }
        : {}),

      ...(paymentStatus
        ? {
            payments: {
              some: {
                status: paymentStatus,
              },
            },
          }
        : {}),

      ...(q
        ? {
            OR: [
              {
                orderCode: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                buyer: {
                  is: {
                    name: {
                      contains: q,
                      mode: "insensitive",
                    },
                  },
                },
              },
              {
                buyer: {
                  is: {
                    email: {
                      contains: q,
                      mode: "insensitive",
                    },
                  },
                },
              },
              {
                sellerOrders: {
                  some: {
                    sellerOrderCode: {
                      contains: q,
                      mode: "insensitive",
                    },
                  },
                },
              },
              {
                sellerOrders: {
                  some: {
                    business: {
                      is: {
                        name: {
                          contains: q,
                          mode: "insensitive",
                        },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [
      orders,
      total,
      orderStatusRows,
      paymentStatusRows,
    ] = await Promise.all([
      prisma.order.findMany({
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
        take: pageSize,

        select: {
          id: true,
          orderCode: true,
          status: true,

          itemsSubtotal: true,
          deliveryFee: true,
          deliveryFeeStatus: true,
          totalAmount: true,
          currency: true,

          deliveryRecipient: true,
          deliveryPhone: true,
          deliveryAddress: true,
          deliveryArea: true,
          deliveryLandmark: true,
          deliveryNotes: true,

          completedAt: true,
          cancelledAt: true,

          createdAt: true,
          updatedAt: true,

          buyer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },

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
              sellerNote: true,

              acceptedAt: true,
              rejectedAt: true,
              dispatchedAt: true,
              deliveredAt: true,
              completedAt: true,
              cancelledAt: true,

              seller: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },

              business: {
                select: {
                  id: true,
                  name: true,

                  location: {
                    select: {
                      area: true,
                      address: true,
                    },
                  },
                },
              },

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
                  inventoryReserved: true,
                  createdAt: true,
                },
              },
            },
          },

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
              provider: true,
              providerReference: true,
              failureReason: true,
              paidAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),

      prisma.order.count({
        where,
      }),

      prisma.order.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),

      prisma.payment.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(
      total / pageSize,
    );

    return NextResponse.json(
      {
        success: true,

        orders,

        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPages,
        },

        statusCounts: orderStatusRows.map(
          (row) => ({
            status: row.status,
            count: row._count._all,
          }),
        ),

        paymentStatusCounts: paymentStatusRows.map(
          (row) => ({
            status: row.status,
            count: row._count._all,
          }),
        ),

        generatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error(
      "Admin orders GET error:",
      error,
    );

    return jsonError(
      "Unable to load marketplace orders.",
      500,
    );
  }
}
