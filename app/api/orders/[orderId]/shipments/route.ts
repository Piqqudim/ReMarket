import { NextResponse } from "next/server";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireBuyer();
  if (!access.authorized) return access.response;

  const { orderId } = await context.params;
  if (!orderId || orderId.length > 128) {
    return NextResponse.json({ error: "Invalid order reference." }, { status: 400, headers: noStore });
  }

  try {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        buyerId: access.user.id,
      },
      select: {
        id: true,
        orderCode: true,
        status: true,
        sellerOrders: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            sellerOrderCode: true,
            status: true,
            business: {
              select: { id: true, name: true },
            },
            shipments: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                provider: true,
                providerOrderId: true,
                courierName: true,
                trackingCode: true,
                trackingUrl: true,
                waybillUrl: true,
                status: true,
                shippingFee: true,
                currency: true,
                estimatedDelivery: true,
                bookedAt: true,
                pickedUpAt: true,
                inTransitAt: true,
                deliveredAt: true,
                cancelledAt: true,
                failureReason: true,
                trackingEvents: {
                  orderBy: [
                    { occurredAt: "desc" },
                    { createdAt: "desc" },
                  ],
                  take: 30,
                  select: {
                    id: true,
                    status: true,
                    statusLabel: true,
                    message: true,
                    location: true,
                    occurredAt: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404, headers: noStore });
    }

    return NextResponse.json(
      {
        order: {
          id: order.id,
          orderCode: order.orderCode,
          status: order.status,
        },
        sellerOrders: order.sellerOrders.map((sellerOrder) => ({
          id: sellerOrder.id,
          sellerOrderCode: sellerOrder.sellerOrderCode,
          status: sellerOrder.status,
          business: sellerOrder.business,
          shipments: sellerOrder.shipments.map((shipment) => ({
            id: shipment.id,
            provider: shipment.provider,
            providerOrderId: shipment.providerOrderId,
            courierName: shipment.courierName,
            trackingCode: shipment.trackingCode,
            trackingUrl: shipment.trackingUrl,
            waybillUrl: shipment.waybillUrl,
            status: shipment.status,
            shippingFee: shipment.shippingFee,
            currency: shipment.currency,
            estimatedDelivery: shipment.estimatedDelivery,
            bookedAt: shipment.bookedAt,
            pickedUpAt: shipment.pickedUpAt,
            inTransitAt: shipment.inTransitAt,
            deliveredAt: shipment.deliveredAt,
            cancelledAt: shipment.cancelledAt,
            // Do not expose internal provider failure details to buyers.
            trackingEvents: shipment.trackingEvents,
          })),
        })),
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("BUYER_ORDER_SHIPMENTS_GET_ERROR:", error);
    return NextResponse.json(
      { error: "Unable to load shipment tracking information." },
      { status: 500, headers: noStore },
    );
  }
}