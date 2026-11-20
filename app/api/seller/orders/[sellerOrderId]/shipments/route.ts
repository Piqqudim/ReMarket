import { NotificationPriority, NotificationType, Prisma, ShipmentStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { requireSellerAccount } from "@/lib/seller-auth";
import {
  createShipbubbleShipment,
  ShipbubbleError,
} from "@/lib/shipbubble";
import { mapShipbubbleStatus } from "@/lib/shipbubble-webhook";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type RouteContext = {
  params: Promise<{ sellerOrderId: string }>;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, maxLength = 500): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

function getProviderSafeSnapshot(data: JsonRecord): Prisma.InputJsonValue {
  const courier = isRecord(data.courier) ? data.courier : {};
  const payment = isRecord(data.payment) ? data.payment : {};

  return {
    order_id: stringValue(data.order_id, 120),
    status: stringValue(data.status, 80),
    courier: {
      name: stringValue(courier.name, 120),
      tracking_code: stringValue(courier.tracking_code, 120),
    },
    tracking_url: stringValue(data.tracking_url, 1000),
    waybill_document: stringValue(data.waybill_document, 1000),
    payment: {
      shipping_fee:
        typeof payment.shipping_fee === "number" && Number.isFinite(payment.shipping_fee)
          ? payment.shipping_fee
          : null,
      currency: stringValue(payment.currency, 3),
    },
  } as Prisma.InputJsonValue;
}

/**
 * POST /api/seller/orders/:sellerOrderId/shipments
 *
 * Books the selected Shipbubble courier for this seller's parcel.
 * A label is created only when:
 * - the authenticated seller owns this seller order and business;
 * - the parent order has a verified successful payment and paidAt;
 * - the seller has prepared the parcel and marked it READY_FOR_DISPATCH;
 * - the selected Shipbubble quote package is still valid.
 *
 * A BOOKING_PENDING record is created before calling Shipbubble. If the
 * network result is uncertain, it is deliberately not retried automatically
 * because that could create duplicate courier labels.
 */
export async function POST(_request: Request, context: RouteContext) {
  const access = await requireSellerAccount();
  if (!access.authorized) return access.response;

  const business = access.business;
  if (!business) {
    return jsonError("You do not have a business linked to this seller account.", 404);
  }
  if (business.ownerId !== access.user.id) {
    return jsonError("You are not allowed to manage this business.", 403);
  }
  if (business.deletedAt) {
    return jsonError("This business has been deleted.", 410);
  }

  const { sellerOrderId } = await context.params;
  if (!sellerOrderId || sellerOrderId.length > 128) {
    return jsonError("Invalid seller order reference.", 400);
  }

  try {
    const sellerOrder = await prisma.sellerOrder.findFirst({
      where: {
        id: sellerOrderId,
        sellerId: access.user.id,
        businessId: business.id,
        business: { is: { ownerId: access.user.id, deletedAt: null } },
      },
      select: {
        id: true,
        sellerOrderCode: true,
        sellerId: true,
        businessId: true,
        orderId: true,
        status: true,
        business: {
          select: { id: true, ownerId: true, name: true },
        },
        order: {
          select: {
            id: true,
            orderCode: true,
            buyerId: true,
            status: true,
            paidAt: true,
            payments: {
              where: { provider: "PAYSTACK", status: "SUCCESS" },
              select: { id: true, paidAt: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!sellerOrder) {
      return jsonError("Seller order not found.", 404);
    }

    if (
      sellerOrder.status !== "READY_FOR_DISPATCH"
    ) {
      return jsonError(
        "Prepare the products and mark this seller order as ready before booking delivery.",
        409,
      );
    }

    if (
      !sellerOrder.order.paidAt ||
      sellerOrder.order.payments.length === 0 ||
      sellerOrder.order.status === "PENDING_PAYMENT"
    ) {
      return jsonError(
        "This order does not have a verified successful payment. Shipment booking is blocked.",
        409,
      );
    }

    const quotePackage = await prisma.deliveryQuotePackage.findFirst({
      where: {
        businessId: sellerOrder.businessId,
        sellerId: access.user.id,
        quote: {
          is: {
            orderId: sellerOrder.orderId,
            status: "CONSUMED",
          },
        },
      },
      include: {
        shipment: true,
      },
    });

    if (!quotePackage) {
      return jsonError(
        "The selected delivery package could not be found for this seller order.",
        409,
      );
    }

    if (
      !quotePackage.selectedAt ||
      !quotePackage.selectedCourierId ||
      !quotePackage.selectedServiceCode ||
      quotePackage.selectedDeliveryFee === null ||
      !Number.isSafeInteger(quotePackage.selectedDeliveryFee) ||
      quotePackage.selectedDeliveryFee < 0
    ) {
      return jsonError("The buyer's selected courier information is incomplete.", 409);
    }

    const now = new Date();
    if (quotePackage.expiresAt <= now) {
      return jsonError(
        "The Shipbubble rate token has expired. This shipment needs a refreshed courier quote before booking.",
        409,
      );
    }

    if (
      sellerOrder.business.ownerId !== access.user.id ||
      quotePackage.sellerId !== sellerOrder.sellerId
    ) {
      return jsonError("You are not authorised to book this seller shipment.", 403);
    }

    let shipment = quotePackage.shipment;

    if (shipment?.providerOrderId) {
      return NextResponse.json(
        {
          message: "A Shipbubble shipment has already been booked for this parcel.",
          shipment: {
            id: shipment.id,
            providerOrderId: shipment.providerOrderId,
            status: shipment.status,
            courierName: shipment.courierName,
            trackingCode: shipment.trackingCode,
            trackingUrl: shipment.trackingUrl,
            waybillUrl: shipment.waybillUrl,
          },
          alreadyBooked: true,
        },
        { headers: noStore },
      );
    }

    if (shipment?.status === ShipmentStatus.BOOKING_PENDING) {
      return jsonError(
        "A shipment booking is already being processed or needs reconciliation. Do not submit it again; ask an administrator to check Shipbubble first.",
        409,
      );
    }

    if (shipment && shipment.status !== ShipmentStatus.FAILED) {
      return jsonError(
        "This delivery package already has a shipment record that cannot be booked again.",
        409,
      );
    }

    if (shipment) {
      const reset = await prisma.shipment.updateMany({
        where: {
          id: shipment.id,
          quotePackageId: quotePackage.id,
          providerOrderId: null,
          status: ShipmentStatus.FAILED,
        },
        data: {
          status: ShipmentStatus.BOOKING_PENDING,
          failureReason: null,
        },
      });
      if (reset.count !== 1) {
        return jsonError("Shipment booking state changed. Refresh and try again.", 409);
      }
      shipment = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    } else {
      try {
        shipment = await prisma.shipment.create({
          data: {
            sellerOrderId: sellerOrder.id,
            quotePackageId: quotePackage.id,
            provider: "SHIPBUBBLE",
            status: ShipmentStatus.BOOKING_PENDING,
            shippingFee: quotePackage.selectedDeliveryFee,
            currency: "NGN",
            courierId: quotePackage.selectedCourierId,
            courierName: quotePackage.selectedCourierName,
            estimatedDelivery: quotePackage.selectedDeliveryEta,
          },
        });
      } catch (createError) {
        if (
          createError instanceof Prisma.PrismaClientKnownRequestError &&
          createError.code === "P2002"
        ) {
          return jsonError(
            "Another request has already started shipment booking. Refresh the order before trying again.",
            409,
          );
        }
        throw createError;
      }
    }

    if (!shipment) {
      return jsonError("Unable to prepare the shipment booking record.", 500);
    }

    let providerData: JsonRecord;
    try {
      providerData = await createShipbubbleShipment({
        requestToken: quotePackage.requestToken,
        serviceCode: quotePackage.selectedServiceCode,
        courierId: quotePackage.selectedCourierId,
        isCashOnDelivery: false,
      });
    } catch (providerError) {
      const status = providerError instanceof ShipbubbleError
        ? providerError.status
        : 502;
      const message = providerError instanceof Error
        ? providerError.message.slice(0, 500)
        : "Shipbubble shipment booking failed.";

      // Definitive 4xx rejections can be corrected and retried. A timeout or
      // 5xx has an uncertain outcome, so keep BOOKING_PENDING to avoid a
      // second label being purchased while the first may already exist.
      if (status >= 400 && status < 500) {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            status: ShipmentStatus.FAILED,
            failureReason: message,
          },
        });
      } else {
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            failureReason: `Booking outcome uncertain: ${message}`.slice(0, 500),
          },
        });
      }

      return jsonError(
        status >= 400 && status < 500
          ? message
          : "Shipbubble's response was inconclusive. The booking has been held for reconciliation to prevent a duplicate shipping label.",
        status >= 400 && status < 500 ? status : 502,
      );
    }

    const providerOrderId = stringValue(providerData.order_id, 120);
    if (!providerOrderId) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          failureReason:
            "Shipbubble returned a response without an order_id. Booking outcome requires manual reconciliation.",
        },
      });
      return jsonError(
        "Shipbubble returned an incomplete booking response. The shipment is held for manual reconciliation.",
        502,
      );
    }

    const courier = isRecord(providerData.courier) ? providerData.courier : {};
    const trackingCode = stringValue(courier.tracking_code, 120);
    const trackingUrl = stringValue(providerData.tracking_url, 1000);
    const waybillUrl = stringValue(providerData.waybill_document, 1000);
    const mappedStatus = mapShipbubbleStatus(providerData.status) ?? ShipmentStatus.PENDING;

    const updatedShipment = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        providerOrderId,
        status: mappedStatus,
        courierName: stringValue(courier.name, 120) ?? quotePackage.selectedCourierName,
        trackingCode,
        trackingUrl,
        waybillUrl,
        rawResponse: getProviderSafeSnapshot(providerData),
        failureReason: null,
        bookedAt: new Date(),
      },
      select: {
        id: true,
        providerOrderId: true,
        status: true,
        courierName: true,
        trackingCode: true,
        trackingUrl: true,
        waybillUrl: true,
        estimatedDelivery: true,
        shippingFee: true,
        currency: true,
      },
    });

    try {
      await createNotification({
        userId: sellerOrder.order.buyerId,
        type: NotificationType.ORDER_STATUS_UPDATED,
        title: "Your delivery has been booked",
        message: `A courier has been booked for seller order ${sellerOrder.sellerOrderCode}. You can view its tracking details from your order.`,
        priority: NotificationPriority.NORMAL,
        dedupeKey: `shipbubble-booked:${updatedShipment.id}`,
        data: {
          orderId: sellerOrder.order.id,
          orderCode: sellerOrder.order.orderCode,
          sellerOrderId: sellerOrder.id,
          sellerOrderCode: sellerOrder.sellerOrderCode,
          shipmentId: updatedShipment.id,
          href: `/orders/${sellerOrder.order.id}`,
        } as Prisma.InputJsonValue,
      });
    } catch (notificationError) {
      console.error("SHIPBUBBLE_BOOKED_NOTIFICATION_ERROR:", notificationError);
    }

    return NextResponse.json(
      {
        message: "Shipbubble shipment booked successfully.",
        shipment: updatedShipment,
      },
      { status: 201, headers: noStore },
    );
  } catch (error) {
    console.error("SELLER_SHIPMENT_BOOKING_ERROR:", error);
    return jsonError(
      "Unable to book this shipment. No seller-order status has been changed.",
      500,
    );
  }
}
