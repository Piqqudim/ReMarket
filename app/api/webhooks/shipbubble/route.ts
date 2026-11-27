import {
  NotificationPriority,
  NotificationType,
  OrderStatus,
  Prisma,
  SellerOrderStatus,
  ShipmentStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  createShipbubbleProviderEventKey,
  createShipbubbleWebhookEventKey,
  getLatestShipbubblePackageStatus,
  mapShipbubbleStatus,
  verifyShipbubbleWebhookSignature,
} from "@/lib/shipbubble-webhook";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const noStore = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength = 500): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

function toSafeWebhookPayload(
  body: JsonRecord,
  providerOrderId: string,
  statusLabel: string | null,
): Prisma.InputJsonValue {
  const courier = isRecord(body.courier) ? body.courier : {};
  const events = Array.isArray(body.events) ? body.events.slice(-10) : [];
  const safeEvents = events.flatMap((event) => {
    if (!isRecord(event)) return [];
    return [{
      location: cleanString(event.location, 200),
      message: cleanString(event.message, 500),
      captured: cleanString(event.captured, 80),
    }];
  });

  return {
    order_id: providerOrderId,
    status: cleanString(body.status, 80),
    latest_package_status: statusLabel,
    courier: {
      name: cleanString(courier.name, 120),
      tracking_code: cleanString(courier.tracking_code, 120),
      tracking_message: cleanString(courier.tracking_message, 500),
    },
    tracking_url: cleanString(body.tracking_url, 1000),
    waybill_document: cleanString(body.waybill_document, 1000),
    events: safeEvents,
    date: cleanString(body.date, 80),
  } as Prisma.InputJsonValue;
}

function aggregateOrderStatus(statuses: SellerOrderStatus[]): OrderStatus {
  if (statuses.length === 0) return OrderStatus.PLACED;

  const cancelledCount = statuses.filter((status) =>
    status === SellerOrderStatus.CANCELLED || status === SellerOrderStatus.REJECTED,
  ).length;

  if (cancelledCount === statuses.length) return OrderStatus.CANCELLED;
  if (cancelledCount > 0) return OrderStatus.PARTIALLY_CANCELLED;
  if (statuses.every((status) => status === SellerOrderStatus.COMPLETED)) {
    return OrderStatus.COMPLETED;
  }

  const dispatchedCount = statuses.filter((status) =>
    status === SellerOrderStatus.DISPATCHED ||
    status === SellerOrderStatus.DELIVERED ||
    status === SellerOrderStatus.COMPLETED,
  ).length;

  if (dispatchedCount > 0) {
    return dispatchedCount === statuses.length
      ? OrderStatus.DISPATCHED
      : OrderStatus.PARTIALLY_DISPATCHED;
  }

  if (statuses.some((status) =>
    status === SellerOrderStatus.PROCESSING ||
    status === SellerOrderStatus.READY_FOR_DISPATCH,
  )) {
    return OrderStatus.PROCESSING;
  }

  const acceptedCount = statuses.filter(
    (status) => status !== SellerOrderStatus.PENDING_ACCEPTANCE,
  ).length;

  if (acceptedCount === 0) return OrderStatus.PLACED;
  if (acceptedCount < statuses.length) return OrderStatus.PARTIALLY_ACCEPTED;
  return OrderStatus.CONFIRMED;
}


const SHIPMENT_STATUS_RANK: Record<ShipmentStatus, number> = {
  [ShipmentStatus.BOOKING_PENDING]: 0,
  [ShipmentStatus.PENDING]: 1,
  [ShipmentStatus.CONFIRMED]: 2,
  [ShipmentStatus.COURIER_ASSIGNED]: 3,
  [ShipmentStatus.AWAITING_PICKUP]: 4,
  [ShipmentStatus.PICKED_UP]: 5,
  [ShipmentStatus.IN_TRANSIT]: 6,
  [ShipmentStatus.OUT_FOR_DELIVERY]: 7,
  [ShipmentStatus.DELIVERY_FAILED]: 8,
  [ShipmentStatus.DELIVERED]: 9,
  [ShipmentStatus.RETURNING]: 10,
  [ShipmentStatus.RETURNED]: 11,
  [ShipmentStatus.CANCELLED]: 11,
  [ShipmentStatus.FAILED]: 11,
};

function shouldApplyShipmentStatus(input: {
  currentStatus: ShipmentStatus;
  nextStatus: ShipmentStatus;
  occurredAt: Date | null;
  latestOccurredAt: Date | null;
}): boolean {
  if (
    input.occurredAt &&
    input.latestOccurredAt &&
    input.occurredAt.getTime() < input.latestOccurredAt.getTime()
  ) {
    return false;
  }

  if (input.currentStatus === input.nextStatus) return true;

  // Couriers may retry delivery after a failed attempt. Permit a newer
  // in-transit/out-for-delivery/delivered event to resume that shipment.
  if (
    input.currentStatus === ShipmentStatus.DELIVERY_FAILED &&
    new Set<ShipmentStatus>([
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.OUT_FOR_DELIVERY,
      ShipmentStatus.DELIVERED,
    ]).has(input.nextStatus) &&
    input.occurredAt &&
    (!input.latestOccurredAt || input.occurredAt.getTime() > input.latestOccurredAt.getTime())
  ) {
    return true;
  }

  return SHIPMENT_STATUS_RANK[input.nextStatus] >= SHIPMENT_STATUS_RANK[input.currentStatus];
}

function getShipmentNotification(status: ShipmentStatus) {
  switch (status) {
    case ShipmentStatus.PICKED_UP:
      return { title: "Your parcel has been picked up", message: "The courier has collected your parcel and delivery is underway." };
    case ShipmentStatus.IN_TRANSIT:
      return { title: "Your parcel is in transit", message: "Your parcel is on its way to the delivery address." };
    case ShipmentStatus.OUT_FOR_DELIVERY:
      return { title: "Your parcel is out for delivery", message: "The courier is taking your parcel to the delivery address." };
    case ShipmentStatus.DELIVERED:
      return { title: "Your parcel has been delivered", message: "Shipbubble has marked your parcel as delivered." };
    case ShipmentStatus.DELIVERY_FAILED:
      return { title: "Delivery needs attention", message: "The courier reported a delivery issue. ReMarket is checking the shipment." };
    case ShipmentStatus.RETURNING:
    case ShipmentStatus.RETURNED:
      return { title: "Your parcel is being returned", message: "The courier reported that your parcel is returning to the seller." };
    case ShipmentStatus.CANCELLED:
      return { title: "Shipment cancelled", message: "The courier shipment has been cancelled. ReMarket will review the next steps." };
    default:
      return null;
  }
}

/**
 * POST /api/webhooks/shipbubble
 *
 * Verify the raw request body using the dedicated SHIPBUBBLE_WEBHOOK_SECRET.
 * Do not reuse SHIPBUBBLE_API_KEY unless Shipbubble explicitly confirms that
 * it is also the webhook signing secret for this merchant account. The
 * signature algorithm/header still requires account-level provider confirmation.
 */
export async function POST(request: Request) {
  let rawBody: Buffer;
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_WEBHOOK_BYTES) {
      return jsonError("Invalid Shipbubble webhook body size.", 413);
    }
    rawBody = Buffer.from(bytes);
  } catch {
    return jsonError("Unable to read Shipbubble webhook body.", 400);
  }

  if (!verifyShipbubbleWebhookSignature(rawBody, request.headers.get("x-ship-signature"))) {
    return jsonError("Invalid Shipbubble webhook signature.", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    return jsonError("Invalid Shipbubble webhook JSON.", 400);
  }

  if (!isRecord(payload)) return jsonError("Invalid Shipbubble webhook payload.", 400);

  const providerOrderId = cleanString(payload.order_id, 120);
  if (!providerOrderId) return jsonError("Shipbubble webhook has no valid order_id.", 400);

  const latestPackageStatus = getLatestShipbubblePackageStatus(payload);
  const mappedStatus = latestPackageStatus
    ? mapShipbubbleStatus(latestPackageStatus.label)
    : mapShipbubbleStatus(payload.status);

  const webhookEventKey = createShipbubbleWebhookEventKey(rawBody);
  const providerEventKey = createShipbubbleProviderEventKey(rawBody);
  const safePayload = toSafeWebhookPayload(
    payload,
    providerOrderId,
    latestPackageStatus?.label ?? cleanString(payload.status, 80),
  );

  try {
    const shipment = await prisma.shipment.findUnique({
      where: { providerOrderId },
      select: {
        id: true,
        status: true,
        sellerOrderId: true,
        trackingCode: true,
        trackingUrl: true,
        waybillUrl: true,
        trackingEvents: {
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { occurredAt: true },
        },
        sellerOrder: {
          select: {
            id: true,
            sellerOrderCode: true,
            status: true,
            orderId: true,
            order: {
              select: {
                id: true,
                orderCode: true,
                buyerId: true,
              },
            },
          },
        },
      },
    });

    if (!shipment) {
      // The label may have been created just before its providerOrderId was
      // saved locally. Ask Shipbubble to retry rather than discarding it.
      return NextResponse.json(
        { error: "Shipment is not registered yet. Please retry this webhook." },
        { status: 503, headers: noStore },
      );
    }

    const courier = isRecord(payload.courier) ? payload.courier : {};
    const trackingCode = cleanString(courier.tracking_code, 120);
    const trackingUrl = cleanString(payload.tracking_url, 1000);
    const waybillUrl = cleanString(payload.waybill_document, 1000);
    const trackingMessage = cleanString(courier.tracking_message, 500);

    const latestEvent = Array.isArray(payload.events) && payload.events.length > 0
      ? payload.events[payload.events.length - 1]
      : null;
    const latestEventRecord = isRecord(latestEvent) ? latestEvent : {};
    const eventLocation = cleanString(latestEventRecord.location, 200);
    const eventMessage = cleanString(latestEventRecord.message, 500) ?? trackingMessage;
    const occurredAt = latestPackageStatus?.occurredAt ?? (() => {
      const captured = cleanString(latestEventRecord.captured, 80);
      const parsed = captured ? new Date(captured) : null;
      return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
    })();
    const latestOccurredAt = shipment.trackingEvents.reduce<Date | null>((latest, event) => {
      if (!event.occurredAt) return latest;
      if (!latest || event.occurredAt.getTime() > latest.getTime()) return event.occurredAt;
      return latest;
    }, null);
    const applyMappedStatus = mappedStatus !== null && shouldApplyShipmentStatus({
      currentStatus: shipment.status,
      nextStatus: mappedStatus,
      occurredAt,
      latestOccurredAt,
    });

    const result = await prisma.$transaction(async (tx) => {
      await tx.webhookReceipt.create({
        data: {
          provider: "SHIPBUBBLE",
          eventKey: webhookEventKey,
          payload: safePayload,
        },
      });

      const shipmentUpdate = await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          ...(applyMappedStatus && mappedStatus ? { status: mappedStatus } : {}),
          ...(trackingCode ? { trackingCode } : {}),
          ...(trackingUrl ? { trackingUrl } : {}),
          ...(waybillUrl ? { waybillUrl } : {}),
          ...(cleanString(courier.name, 120) ? { courierName: cleanString(courier.name, 120) } : {}),
          ...(applyMappedStatus && mappedStatus === ShipmentStatus.PICKED_UP ? { pickedUpAt: occurredAt ?? new Date() } : {}),
          ...(applyMappedStatus && mappedStatus === ShipmentStatus.IN_TRANSIT ? { inTransitAt: occurredAt ?? new Date() } : {}),
          ...(applyMappedStatus && mappedStatus === ShipmentStatus.DELIVERED ? { deliveredAt: occurredAt ?? new Date() } : {}),
          ...(applyMappedStatus && mappedStatus === ShipmentStatus.CANCELLED ? { cancelledAt: occurredAt ?? new Date() } : {}),
        },
        select: { id: true, status: true },
      });

      if (mappedStatus) {
        await tx.shipmentTrackingEvent.create({
          data: {
            shipmentId: shipment.id,
            providerEventKey,
            status: mappedStatus,
            statusLabel: latestPackageStatus?.label ?? mappedStatus.replace(/_/g, " "),
            message: eventMessage,
            location: eventLocation,
            occurredAt,
            rawData: safePayload,
          },
        });
      }

      // Courier pickup means the parcel is dispatched. A label being booked
      // does not. Delivery completion updates the seller order to DELIVERED,
      // but does not automatically mark the buyer order COMPLETED.
      const sellerShipments = await tx.shipment.findMany({
        where: { sellerOrderId: shipment.sellerOrderId },
        select: { status: true, deliveredAt: true },
      });
      const allParcelsDelivered = sellerShipments.length > 0 &&
        sellerShipments.every((item) => item.status === ShipmentStatus.DELIVERED);
      const courierHasTakenStatuses = new Set<ShipmentStatus>([
        ShipmentStatus.PICKED_UP,
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentStatus.DELIVERY_FAILED,
        ShipmentStatus.DELIVERED,
        ShipmentStatus.RETURNING,
        ShipmentStatus.RETURNED,
      ]);
      const courierHasTakenParcel = sellerShipments.some((item) =>
        courierHasTakenStatuses.has(item.status),
      );

      if (allParcelsDelivered) {
        await tx.sellerOrder.updateMany({
          where: {
            id: shipment.sellerOrderId,
            status: { in: [SellerOrderStatus.READY_FOR_DISPATCH, SellerOrderStatus.DISPATCHED] },
          },
          data: {
            status: SellerOrderStatus.DELIVERED,
            deliveredAt: sellerShipments.reduce<Date | null>((latest, item) => {
              if (!item.deliveredAt) return latest;
              if (!latest || item.deliveredAt.getTime() > latest.getTime()) return item.deliveredAt;
              return latest;
            }, occurredAt ?? new Date()),
          },
        });
      } else if (courierHasTakenParcel) {
        await tx.sellerOrder.updateMany({
          where: {
            id: shipment.sellerOrderId,
            status: SellerOrderStatus.READY_FOR_DISPATCH,
          },
          data: {
            status: SellerOrderStatus.DISPATCHED,
            dispatchedAt: occurredAt ?? new Date(),
          },
        });
      }

      const sellerOrders = await tx.sellerOrder.findMany({
        where: { orderId: shipment.sellerOrder.orderId },
        select: { status: true },
      });
      const parentStatus = aggregateOrderStatus(sellerOrders.map((row) => row.status));

      await tx.order.update({
        where: { id: shipment.sellerOrder.orderId },
        data: { status: parentStatus },
      });

      await tx.webhookReceipt.update({
        where: { eventKey: webhookEventKey },
        data: { processedAt: new Date(), processingError: null },
      });

      return {
        status: shipmentUpdate.status,
        previousStatus: shipment.status,
        statusApplied: applyMappedStatus,
        buyerId: shipment.sellerOrder.order.buyerId,
        orderId: shipment.sellerOrder.order.id,
        orderCode: shipment.sellerOrder.order.orderCode,
        sellerOrderId: shipment.sellerOrder.id,
        sellerOrderCode: shipment.sellerOrder.sellerOrderCode,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    const notification = mappedStatus ? getShipmentNotification(mappedStatus) : null;
    if (notification && result.previousStatus !== result.status) {
      try {
        await createNotification({
          userId: result.buyerId,
          type: NotificationType.ORDER_STATUS_UPDATED,
          title: notification.title,
          message: notification.message,
          priority: mappedStatus === ShipmentStatus.DELIVERY_FAILED
            ? NotificationPriority.HIGH
            : NotificationPriority.NORMAL,
          dedupeKey: `shipbubble-status:${shipment.id}:${providerEventKey}`,
          data: {
            orderId: result.orderId,
            orderCode: result.orderCode,
            sellerOrderId: result.sellerOrderId,
            sellerOrderCode: result.sellerOrderCode,
            shipmentId: shipment.id,
            shipmentStatus: mappedStatus,
            href: `/orders/${result.orderId}`,
          } as Prisma.InputJsonValue,
        });
      } catch (notificationError) {
        console.error("SHIPBUBBLE_TRACKING_NOTIFICATION_ERROR:", notificationError);
      }
    }

    return NextResponse.json(
      {
        received: true,
        processed: true,
        shipmentStatus: result.status,
        statusApplied: result.statusApplied,
        staleOrOutOfOrder: Boolean(mappedStatus && !result.statusApplied),
      },
      { status: 200, headers: noStore },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { received: true, duplicate: true },
        { status: 200, headers: noStore },
      );
    }

    console.error("SHIPBUBBLE_WEBHOOK_PROCESSING_ERROR:", error);
    return NextResponse.json(
      { error: "Shipbubble webhook processing failed. Please retry." },
      { status: 500, headers: noStore },
    );
  }
}