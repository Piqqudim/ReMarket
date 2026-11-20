"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  LoaderCircle,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  XCircle,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

const MAX_ORDER_ID_LENGTH = 100;

type DeliveryFeeStatus = "UNCONFIRMED" | "CONFIRMED";

type OrderItemView = {
  id: string;
  productId: string | null;
  productName: string;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

type BusinessView = {
  id: string;
  name: string;
  imageUrl: string | null;
};

type ShipmentEventView = {
  id: string;
  status: string;
  statusLabel: string;
  message: string | null;
  location: string | null;
  occurredAt: string | null;
  createdAt: string;
};

type ShipmentView = {
  id: string;
  provider: string;
  providerOrderId: string | null;
  courierName: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  waybillUrl: string | null;
  status: string;
  shippingFee: number;
  currency: string;
  estimatedDelivery: string | null;
  bookedAt: string | null;
  pickedUpAt: string | null;
  inTransitAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  trackingEvents: ShipmentEventView[];
};

type SellerOrderView = {
  id: string;
  sellerOrderCode: string;
  status: string;
  subtotal: number;
  acceptedAt: string | null;
  rejectedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  business: BusinessView;
  items: OrderItemView[];
  shipments: ShipmentView[];
};

type PaymentView = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
};

type OrderDetail = {
  id: string;
  orderCode: string;
  status: string;
  itemsSubtotal: number;
  deliveryFee: number;
  totalAmount: number;
  deliveryFeeStatus: DeliveryFeeStatus;
  currency: string;
  deliveryRecipient: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryArea: string;
  deliveryLandmark: string | null;
  deliveryNotes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  sellerOrders: SellerOrderView[];
  payments: PaymentView[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function getSafeInteger(value: unknown, minimum = 0): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) return null;
  return value;
}

function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "NGN"} ${amount.toLocaleString("en-NG")}`;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not yet recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

function getSafeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_PAYMENT: "Awaiting payment",
    PLACED: "Order placed",
    PARTIALLY_ACCEPTED: "Partially accepted",
    CONFIRMED: "Confirmed",
    PROCESSING: "Processing",
    PARTIALLY_DISPATCHED: "Partially dispatched",
    DISPATCHED: "Dispatched",
    COMPLETED: "Completed",
    PARTIALLY_CANCELLED: "Partially cancelled",
    CANCELLED: "Cancelled",
    PENDING_ACCEPTANCE: "Awaiting seller response",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    READY_FOR_DISPATCH: "Ready for dispatch",
    DELIVERED: "Delivered",
    PENDING: "Payment pending",
    INITIATED: "Payment initiated",
    SUCCESS: "Payment successful",
    FAILED: "Payment failed",
    CANCELLED_PAYMENT: "Payment cancelled",
    REFUNDED: "Refunded",
    PARTIALLY_REFUNDED: "Partially refunded",
  };
  return labels[status] ?? status.replaceAll("_", " ").toLowerCase();
}

function getStatusClass(status: string): string {
  if (["COMPLETED", "DELIVERED", "SUCCESS", "VERIFIED"].includes(status)) {
    return "bg-[#DCFCE7] text-[#166534]";
  }
  if (["CANCELLED", "PARTIALLY_CANCELLED", "REJECTED", "FAILED", "REFUNDED"].includes(status)) {
    return "bg-[#FEE2E2] text-[#B42318]";
  }
  if (["DISPATCHED", "PARTIALLY_DISPATCHED", "READY_FOR_DISPATCH", "IN_TRANSIT", "OUT_FOR_DELIVERY", "PICKED_UP"].includes(status)) {
    return "bg-[#DBEAFE] text-[#1D4ED8]";
  }
  return "bg-[#FFF1ED] text-[#9F2D18]";
}

function getShipmentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    BOOKING_PENDING: "Booking in progress",
    PENDING: "Awaiting courier confirmation",
    CONFIRMED: "Courier booking confirmed",
    COURIER_ASSIGNED: "Courier assigned",
    AWAITING_PICKUP: "Awaiting pickup",
    PICKED_UP: "Picked up by courier",
    IN_TRANSIT: "In transit",
    OUT_FOR_DELIVERY: "Out for delivery",
    DELIVERED: "Delivered",
    DELIVERY_FAILED: "Delivery attempt unsuccessful",
    RETURNING: "Returning to seller",
    RETURNED: "Returned to seller",
    CANCELLED: "Shipment cancelled",
    FAILED: "Booking unsuccessful",
  };
  return labels[status] ?? status.replaceAll("_", " ").toLowerCase();
}

function getShipmentStatusClass(status: string): string {
  if (status === "DELIVERED") return "bg-[#DCFCE7] text-[#166534]";
  if (["FAILED", "DELIVERY_FAILED", "RETURNED", "CANCELLED"].includes(status)) {
    return "bg-[#FEE2E2] text-[#B42318]";
  }
  if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "COURIER_ASSIGNED"].includes(status)) {
    return "bg-[#DBEAFE] text-[#1D4ED8]";
  }
  return "bg-[#FFF1ED] text-[#9F2D18]";
}

function parseOrderItems(value: unknown): OrderItemView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): OrderItemView[] => {
    if (!isRecord(item)) return [];
    const unitPrice = getSafeInteger(item.unitPrice, 1);
    const quantity = getSafeInteger(item.quantity, 1);
    const lineTotal = getSafeInteger(item.lineTotal);
    if (
      typeof item.id !== "string" || typeof item.productName !== "string" ||
      unitPrice === null || quantity === null || lineTotal === null
    ) return [];
    return [{
      id: item.id,
      productId: typeof item.productId === "string" ? item.productId : null,
      productName: item.productName,
      productImageUrl: typeof item.productImageUrl === "string" ? item.productImageUrl : null,
      unitPrice,
      quantity,
      lineTotal,
    }];
  });
}

function parseBusiness(value: unknown): BusinessView | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  return {
    id: value.id,
    name: value.name,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
  };
}

function parseShipmentEvents(value: unknown): ShipmentEventView[] {
  if (!Array.isArray(value)) return [];
  const events = value.flatMap((item): ShipmentEventView[] => {
    if (!isRecord(item)) return [];
    const createdAt = typeof item.createdAt === "string" && isValidDateString(item.createdAt)
      ? item.createdAt
      : null;
    if (typeof item.id !== "string" || typeof item.status !== "string" || !createdAt) return [];
    return [{
      id: item.id,
      status: item.status,
      statusLabel: typeof item.statusLabel === "string" && item.statusLabel.trim()
        ? item.statusLabel
        : getShipmentStatusLabel(item.status),
      message: nullableString(item.message),
      location: nullableString(item.location),
      occurredAt: typeof item.occurredAt === "string" && isValidDateString(item.occurredAt)
        ? item.occurredAt
        : null,
      createdAt,
    }];
  });
  // The API returns newest first; render the timeline oldest to newest.
  return events.reverse();
}

function parseShipments(value: unknown): ShipmentView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ShipmentView[] => {
    if (!isRecord(item)) return [];
    const shippingFee = getSafeInteger(item.shippingFee);
    if (typeof item.id !== "string" || typeof item.status !== "string" || shippingFee === null) return [];
    return [{
      id: item.id,
      provider: typeof item.provider === "string" ? item.provider : "SHIPBUBBLE",
      providerOrderId: nullableString(item.providerOrderId),
      courierName: nullableString(item.courierName),
      trackingCode: nullableString(item.trackingCode),
      trackingUrl: nullableString(item.trackingUrl),
      waybillUrl: nullableString(item.waybillUrl),
      status: item.status,
      shippingFee,
      currency: typeof item.currency === "string" ? item.currency : "NGN",
      estimatedDelivery: nullableString(item.estimatedDelivery),
      bookedAt: nullableString(item.bookedAt),
      pickedUpAt: nullableString(item.pickedUpAt),
      inTransitAt: nullableString(item.inTransitAt),
      deliveredAt: nullableString(item.deliveredAt),
      cancelledAt: nullableString(item.cancelledAt),
      trackingEvents: parseShipmentEvents(item.trackingEvents),
    }];
  });
}

function parseSellerOrders(value: unknown): SellerOrderView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SellerOrderView[] => {
    if (!isRecord(item)) return [];
    const business = parseBusiness(item.business);
    const subtotal = getSafeInteger(item.subtotal);
    if (
      typeof item.id !== "string" || typeof item.sellerOrderCode !== "string" ||
      typeof item.status !== "string" || subtotal === null || !business
    ) return [];
    return [{
      id: item.id,
      sellerOrderCode: item.sellerOrderCode,
      status: item.status,
      subtotal,
      acceptedAt: nullableString(item.acceptedAt),
      rejectedAt: nullableString(item.rejectedAt),
      dispatchedAt: nullableString(item.dispatchedAt),
      deliveredAt: nullableString(item.deliveredAt),
      completedAt: nullableString(item.completedAt),
      cancelledAt: nullableString(item.cancelledAt),
      business,
      items: parseOrderItems(item.items),
      shipments: [],
    }];
  });
}

function parsePayments(value: unknown): PaymentView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): PaymentView[] => {
    if (!isRecord(item)) return [];
    const amount = getSafeInteger(item.amount);
    if (
      typeof item.id !== "string" || amount === null || typeof item.status !== "string" ||
      typeof item.createdAt !== "string" || !isValidDateString(item.createdAt)
    ) return [];
    return [{
      id: item.id,
      amount,
      currency: typeof item.currency === "string" ? item.currency : "NGN",
      status: item.status,
      method: typeof item.method === "string" ? item.method : null,
      failureReason: nullableString(item.failureReason),
      paidAt: nullableString(item.paidAt),
      createdAt: item.createdAt,
    }];
  });
}

function parseOrderDetail(value: unknown): OrderDetail | null {
  if (!isRecord(value) || !isRecord(value.order)) return null;
  const raw = value.order;
  const itemsSubtotal = getSafeInteger(raw.itemsSubtotal);
  const deliveryFee = getSafeInteger(raw.deliveryFee);
  const totalAmount = getSafeInteger(raw.totalAmount);
  const deliveryFeeStatus: DeliveryFeeStatus = raw.deliveryFeeStatus === "CONFIRMED"
    ? "CONFIRMED"
    : "UNCONFIRMED";
  if (
    typeof raw.id !== "string" || typeof raw.orderCode !== "string" ||
    typeof raw.status !== "string" || typeof raw.createdAt !== "string" ||
    !isValidDateString(raw.createdAt) || itemsSubtotal === null || deliveryFee === null ||
    totalAmount === null || typeof raw.deliveryRecipient !== "string" ||
    typeof raw.deliveryPhone !== "string" || typeof raw.deliveryAddress !== "string" ||
    typeof raw.deliveryArea !== "string"
  ) return null;
  if (!Number.isSafeInteger(itemsSubtotal + deliveryFee) || totalAmount !== itemsSubtotal + deliveryFee) return null;
  const updatedAt = typeof raw.updatedAt === "string" && isValidDateString(raw.updatedAt)
    ? raw.updatedAt
    : raw.createdAt;
  return {
    id: raw.id,
    orderCode: raw.orderCode,
    status: raw.status,
    itemsSubtotal,
    deliveryFee,
    totalAmount,
    deliveryFeeStatus,
    currency: typeof raw.currency === "string" ? raw.currency : "NGN",
    deliveryRecipient: raw.deliveryRecipient,
    deliveryPhone: raw.deliveryPhone,
    deliveryAddress: raw.deliveryAddress,
    deliveryArea: raw.deliveryArea,
    deliveryLandmark: nullableString(raw.deliveryLandmark),
    deliveryNotes: nullableString(raw.deliveryNotes),
    createdAt: raw.createdAt,
    updatedAt,
    completedAt: nullableString(raw.completedAt),
    cancelledAt: nullableString(raw.cancelledAt),
    sellerOrders: parseSellerOrders(raw.sellerOrders),
    payments: parsePayments(raw.payments),
  };
}

function mergeShipmentTracking(order: OrderDetail, payload: unknown): OrderDetail {
  if (
    !isRecord(payload) || !isRecord(payload.order) || payload.order.id !== order.id ||
    !Array.isArray(payload.sellerOrders)
  ) {
    throw new Error("The shipment tracking response did not match this order.");
  }
  const trackingBySellerOrder = new Map<string, ShipmentView[]>();
  for (const rawSellerOrder of payload.sellerOrders) {
    if (!isRecord(rawSellerOrder) || typeof rawSellerOrder.id !== "string") continue;
    trackingBySellerOrder.set(rawSellerOrder.id, parseShipments(rawSellerOrder.shipments));
  }
  return {
    ...order,
    sellerOrders: order.sellerOrders.map((sellerOrder) => ({
      ...sellerOrder,
      shipments: trackingBySellerOrder.get(sellerOrder.id) ?? [],
    })),
  };
}

const fulfilmentSteps = [
  { status: "PENDING_ACCEPTANCE", label: "Awaiting seller response" },
  { status: "ACCEPTED", label: "Order accepted" },
  { status: "PROCESSING", label: "Preparing order" },
  { status: "READY_FOR_DISPATCH", label: "Ready for dispatch" },
  { status: "DISPATCHED", label: "Dispatched" },
  { status: "DELIVERED", label: "Delivered" },
  { status: "COMPLETED", label: "Completed" },
];

function getProgressIndex(status: string): number {
  return fulfilmentSteps.findIndex((step) => step.status === status);
}

function ShipmentCard({ shipment }: { shipment: ShipmentView }) {
  const trackingUrl = getSafeExternalUrl(shipment.trackingUrl);
  const waybillUrl = getSafeExternalUrl(shipment.waybillUrl);
  const failed = ["FAILED", "DELIVERY_FAILED"].includes(shipment.status);
  const trackingEvents = shipment.trackingEvents;

  return (
    <div className="mt-3 rounded-2xl border border-[#EAE6DF] bg-white p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
            <Truck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[#401B13]">
              {shipment.provider === "SHIPBUBBLE" ? "Shipbubble delivery" : `${shipment.provider} delivery`}
            </p>
            <p className="mt-1 break-words text-[10px] text-[#91877E]">
              {shipment.courierName || "Courier not yet assigned"}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1.5 text-[9px] font-bold ${getShipmentStatusClass(shipment.status)}`}>
          {getShipmentStatusLabel(shipment.status)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {shipment.trackingCode && (
          <div className="min-w-0 rounded-xl bg-[#FCFAF6] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Tracking number</p>
            <p className="mt-1 break-all text-xs font-extrabold text-[#292522]">{shipment.trackingCode}</p>
          </div>
        )}
        {shipment.estimatedDelivery && (
          <div className="min-w-0 rounded-xl bg-[#FCFAF6] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Estimated delivery</p>
            <p className="mt-1 break-words text-xs font-extrabold text-[#292522]">{shipment.estimatedDelivery}</p>
          </div>
        )}
        <div className="min-w-0 rounded-xl bg-[#FCFAF6] p-3">
          <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Delivery fee</p>
          <p className="mt-1 text-xs font-extrabold text-[#292522]">{formatMoney(shipment.shippingFee, shipment.currency)}</p>
        </div>
        <div className="min-w-0 rounded-xl bg-[#FCFAF6] p-3">
          <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Booked</p>
          <p className="mt-1 break-words text-[10px] font-semibold text-[#514840]">{formatDateTime(shipment.bookedAt)}</p>
        </div>
      </div>

      {(trackingUrl || waybillUrl) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {trackingUrl && (
            <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[10px] font-extrabold text-white transition hover:bg-[#E94E2C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2">
              <ExternalLink className="h-3.5 w-3.5" /> Track delivery
            </a>
          )}
          {waybillUrl && (
            <a href={waybillUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-[10px] font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2">
              <FileText className="h-3.5 w-3.5" /> View waybill
            </a>
          )}
        </div>
      )}

      {failed && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-[10px] font-bold text-red-700">This shipment needs attention.</p>
          <p className="mt-1 text-[10px] leading-5 text-red-600">
            The delivery provider has reported a booking or delivery issue. ReMarket support or the seller may need to review it.
          </p>
        </div>
      )}
      {shipment.status === "BOOKING_PENDING" && (
        <p className="mt-3 rounded-xl border border-[#F0D7B3] bg-[#FFF8EC] p-3 text-[10px] leading-5 text-[#796B5C]">
          The delivery booking is being processed. Tracking information will appear when the courier confirms the shipment.
        </p>
      )}
      {shipment.status === "DELIVERED" && shipment.deliveredAt && (
        <p className="mt-3 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] p-3 text-[10px] font-semibold text-[#137A59]">
          Courier delivery recorded: {formatDateTime(shipment.deliveredAt)}
        </p>
      )}

      <div className="mt-4 border-t border-[#F0ECE7] pt-4">
        <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-[#756B61]">Tracking updates</h4>
        {trackingEvents.length > 0 ? (
          <ol className="mt-3 space-y-3">
            {trackingEvents.map((event, index) => (
              <li key={event.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${index === trackingEvents.length - 1 ? "bg-[#E9F9F0] text-[#16845D]" : "bg-[#F3F0EB] text-[#91877E]"}`}>
                    {index === trackingEvents.length - 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                  </span>
                  {index !== trackingEvents.length - 1 && <span className="mt-1 h-5 w-px bg-[#EAE6DF]" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-[10px] font-bold text-[#514840]">{event.statusLabel}</p>
                  {event.message && <p className="mt-0.5 break-words text-[10px] leading-5 text-[#756B61]">{event.message}</p>}
                  {event.location && <p className="mt-0.5 flex items-center gap-1 text-[9px] text-[#91877E]"><MapPin className="h-3 w-3 shrink-0" />{event.location}</p>}
                  <p className="mt-1 text-[9px] text-[#A49A90]">{formatDateTime(event.occurredAt ?? event.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-[10px] leading-5 text-[#91877E]">
            No courier scans have been received yet. The latest shipment status is shown above.
          </p>
        )}
      </div>
    </div>
  );
}

function SellerOrderCard({
  sellerOrder,
  onConfirmDelivery,
  confirming,
}: {
  sellerOrder: SellerOrderView;
  onConfirmDelivery: (sellerOrderId: string) => void;
  confirming: boolean;
}) {
  const rejected = sellerOrder.status === "REJECTED";
  const cancelled = sellerOrder.status === "CANCELLED";
  const terminated = rejected || cancelled;
  const progressIndex = getProgressIndex(sellerOrder.status);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_4px_18px_rgba(41,37,34,0.025)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0ECE7] bg-[#FCFAF6] p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-white text-[#9F2D18]">
            {sellerOrder.business.imageUrl ? (
              <img src={sellerOrder.business.imageUrl} alt={sellerOrder.business.name} className="h-full w-full object-cover" />
            ) : <Store className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold text-[#292522]">{sellerOrder.business.name}</p>
            <p className="mt-1 break-all text-[9px] text-[#91877E]">{sellerOrder.sellerOrderCode}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${getStatusClass(sellerOrder.status)}`}>
          {getOrderStatusLabel(sellerOrder.status)}
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-extrabold text-[#401B13]">Fulfilment progress</h3>
            {!terminated && <span className="text-[9px] font-semibold text-[#91877E]">{Math.max(0, progressIndex + 1)} of {fulfilmentSteps.length} stages</span>}
          </div>
          {terminated ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-bold text-red-700">{rejected ? "This seller rejected the order." : "This seller order was cancelled."}</p>
              <p className="mt-1 text-[10px] text-red-600">{formatDateTime(rejected ? sellerOrder.rejectedAt : sellerOrder.cancelledAt)}</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {fulfilmentSteps.map((step, index) => {
                const done = progressIndex >= 0 && index <= progressIndex;
                const current = index === progressIndex;
                return (
                  <div key={step.status} className={`flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 ${current ? "bg-[#FFF1ED]" : "bg-[#FCFAF6]"}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-[#E9F9F0] text-[#16845D]" : "border border-[#EAE6DF] bg-white text-[#B6A99E]"}`}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-[9px] font-bold">{index + 1}</span>}
                    </span>
                    <span className={`min-w-0 text-[10px] ${current ? "font-extrabold text-[#9F2D18]" : done ? "font-semibold text-[#514840]" : "text-[#91877E]"}`}>{step.label}</span>
                    {current && <span className="ml-auto shrink-0 text-[8px] font-extrabold text-[#9F2D18]">NOW</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-[#F0ECE7] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-[#9F2D18]" />
              <h3 className="text-xs font-extrabold text-[#401B13]">Delivery tracking</h3>
            </div>
            <span className="text-[9px] font-semibold text-[#91877E]">{sellerOrder.shipments.length} {sellerOrder.shipments.length === 1 ? "parcel" : "parcels"}</span>
          </div>
          {sellerOrder.shipments.length > 0 ? (
            <div className="space-y-3">
              {sellerOrder.shipments.map((shipment) => <ShipmentCard key={shipment.id} shipment={shipment} />)}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-[#EAE6DF] bg-[#FCFAF6] p-3 text-[10px] leading-5 text-[#91877E]">
              {sellerOrder.status === "READY_FOR_DISPATCH"
                ? "The seller has marked this order ready. Courier booking details will appear here once a shipment is booked."
                : sellerOrder.status === "DISPATCHED" || sellerOrder.status === "DELIVERED"
                  ? "Shipment tracking details have not been returned yet. Refresh this page shortly or contact ReMarket support if they remain unavailable."
                  : "Courier tracking will become available after the seller prepares the order and books a delivery."}
            </p>
          )}
        </div>

        {sellerOrder.status === "DELIVERED" && (
          <div className="mt-5 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16845D]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-[#137A59]">The courier has marked this seller order as delivered.</p>
                <p className="mt-1 text-[10px] leading-5 text-[#42745F]">Confirm only after you have received the products.</p>
                <button type="button" disabled={confirming} onClick={() => onConfirmDelivery(sellerOrder.id)} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#16845D] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#137A59] disabled:cursor-not-allowed disabled:opacity-60">
                  {confirming ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {confirming ? "Confirming..." : "Confirm delivery"}
                </button>
              </div>
            </div>
          </div>
        )}
        {sellerOrder.status === "COMPLETED" && (
          <div className="mt-5 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-[#137A59]"><CheckCircle2 className="h-4 w-4" />You have confirmed delivery of this order.</p>
            {sellerOrder.completedAt && <p className="mt-2 text-[10px] text-[#42745F]">Confirmed: {formatDateTime(sellerOrder.completedAt)}</p>}
          </div>
        )}

        <div className="mt-5 border-t border-[#F0ECE7] pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-extrabold text-[#401B13]">Products from this seller</h3>
            <span className="text-[9px] font-semibold text-[#91877E]">{sellerOrder.items.length} {sellerOrder.items.length === 1 ? "product" : "products"}</span>
          </div>
          <div className="mt-3 space-y-3">
            {sellerOrder.items.map((item) => (
              <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-[#FCFAF6] p-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-white">
                  {item.productImageUrl ? <img src={item.productImageUrl} alt={item.productName} loading="lazy" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-[#B6A99E]" />}
                </div>
                <div className="min-w-0 flex-1">
                  {item.productId ? (
                    <Link href={`/product/${encodeURIComponent(item.productId)}`} className="line-clamp-2 break-words text-[11px] font-bold text-[#292522] hover:text-[#9F2D18]">{item.productName}</Link>
                  ) : <p className="line-clamp-2 break-words text-[11px] font-bold text-[#292522]">{item.productName}</p>}
                  <p className="mt-1 text-[10px] text-[#91877E]">{item.quantity} × {formatNaira(item.unitPrice)}</p>
                </div>
                <p className="shrink-0 text-xs font-extrabold text-[#9F2D18]">{formatNaira(item.lineTotal)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[#F0ECE7] pt-3">
            <span className="text-[10px] font-semibold text-[#756B61]">Seller subtotal</span>
            <span className="text-sm font-black text-[#17202A]">{formatNaira(sellerOrder.subtotal)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function OrderDetailContent({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingRefreshing, setTrackingRefreshing] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [confirmingSellerOrderId, setConfirmingSellerOrderId] = useState<string | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  const [cancellationMessage, setCancellationMessage] = useState("");
  const [cancellationError, setCancellationError] = useState("");

  const productCount = useMemo(() => order?.sellerOrders.reduce(
    (sum, sellerOrder) => sum + sellerOrder.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  ) ?? 0, [order]);

  const canCancelOrder = order !== null && order.status === "PLACED" &&
    order.sellerOrders.length > 0 &&
    order.sellerOrders.every((sellerOrder) => sellerOrder.status === "PENDING_ACCEPTANCE");

  const allSellerOrdersFinished = order !== null && order.sellerOrders.length > 0 &&
    order.sellerOrders.every((sellerOrder) => ["COMPLETED", "CANCELLED", "REJECTED"].includes(sellerOrder.status));

  const retrieveTracking = useCallback(async (
    targetOrderId: string,
    signal?: AbortSignal,
    mode: "initial" | "refresh" = "refresh",
  ) => {
    if (mode === "initial") setTrackingLoading(true);
    else setTrackingRefreshing(true);
    setTrackingError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(targetOrderId)}/shipments`, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to load delivery tracking information.");
      }
      if (!isRecord(payload) || !isRecord(payload.order) || payload.order.id !== targetOrderId || !Array.isArray(payload.sellerOrders)) {
        throw new Error("The shipment tracking response did not match this order.");
      }
      const bySellerOrder = new Map<string, ShipmentView[]>();
      for (const rawSellerOrder of payload.sellerOrders) {
        if (!isRecord(rawSellerOrder) || typeof rawSellerOrder.id !== "string") continue;
        bySellerOrder.set(rawSellerOrder.id, parseShipments(rawSellerOrder.shipments));
      }
      setOrder((existing) => existing?.id === targetOrderId ? {
        ...existing,
        sellerOrders: existing.sellerOrders.map((sellerOrder) => ({
          ...sellerOrder,
          shipments: bySellerOrder.get(sellerOrder.id) ?? [],
        })),
      } : existing);
    } catch (trackingLoadError) {
      if (trackingLoadError instanceof DOMException && trackingLoadError.name === "AbortError") return;
      if (!signal?.aborted) {
        console.error("Load buyer shipment tracking error:", trackingLoadError);
        setTrackingError(trackingLoadError instanceof Error
          ? trackingLoadError.message
          : "Unable to load delivery tracking information.");
      }
    } finally {
      if (!signal?.aborted) {
        setTrackingLoading(false);
        setTrackingRefreshing(false);
      }
    }
  }, [router]);

  useEffect(() => {
    if (!orderId || orderId.length > MAX_ORDER_ID_LENGTH) {
      setError("Invalid order reference.");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    async function loadOrder() {
      setLoading(true);
      setError("");
      setOrder(null);
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          router.replace("/buyer/login");
          return;
        }
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Unable to retrieve this order.");
        }
        const parsed = parseOrderDetail(payload);
        if (!parsed) throw new Error("Order information could not be read.");
        if (controller.signal.aborted) return;
        setOrder(parsed);
        void retrieveTracking(parsed.id, controller.signal, "initial");
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        if (!controller.signal.aborted) {
          console.error("Load buyer order error:", loadError);
          setError(loadError instanceof Error ? loadError.message : "Unable to retrieve this order.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadOrder();
    return () => controller.abort();
  }, [orderId, retrieveTracking, router]);

  async function refreshTracking() {
    if (!order || trackingRefreshing || trackingLoading) return;
    await retrieveTracking(order.id, undefined, "refresh");
  }

  async function confirmDelivery(sellerOrderId: string) {
    if (confirmingSellerOrderId || cancellingOrder) return;
    const sellerOrder = order?.sellerOrders.find((item) => item.id === sellerOrderId);
    if (!sellerOrder || sellerOrder.status !== "DELIVERED") {
      setDeliveryError("This seller order is not ready for delivery confirmation.");
      return;
    }
    const confirmed = window.confirm("Have you received all the products in this seller's order? Only confirm if you have actually received them.");
    if (!confirmed) return;
    setConfirmingSellerOrderId(sellerOrderId);
    setDeliveryError("");
    setDeliveryMessage("");
    setCancellationError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/seller-orders/${encodeURIComponent(sellerOrderId)}/confirm-delivery`, {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to confirm delivery.");
      }
      if (!isRecord(payload) || !isRecord(payload.sellerOrder) || !isRecord(payload.order)) {
        throw new Error("The delivery confirmation response could not be read.");
      }
      const updatedSellerOrderId = payload.sellerOrder.id;
      const updatedSellerStatus = payload.sellerOrder.status;
      const updatedParentStatus = payload.order.status;
      if (updatedSellerOrderId !== sellerOrderId || updatedSellerStatus !== "COMPLETED" || typeof updatedParentStatus !== "string") {
        throw new Error("The delivery confirmation response is invalid.");
      }
      const completedAt = typeof payload.sellerOrder.completedAt === "string"
        ? payload.sellerOrder.completedAt
        : new Date().toISOString();
      const parentCompletedAt = typeof payload.order.completedAt === "string" ? payload.order.completedAt : null;
      setOrder((current) => {
        if (!current) return current;
        return {
          ...current,
          status: updatedParentStatus,
          completedAt: updatedParentStatus === "COMPLETED" ? parentCompletedAt ?? completedAt : current.completedAt,
          sellerOrders: current.sellerOrders.map((item) => item.id === updatedSellerOrderId
            ? { ...item, status: "COMPLETED", completedAt }
            : item),
        };
      });
      setDeliveryMessage("Delivery confirmed successfully. Thank you.");
    } catch (confirmError) {
      console.error("Confirm delivery error:", confirmError);
      setDeliveryError(confirmError instanceof Error ? confirmError.message : "Unable to confirm delivery.");
    } finally {
      setConfirmingSellerOrderId(null);
    }
  }

  async function cancelOrder() {
    if (!order || !canCancelOrder || cancellingOrder || confirmingSellerOrderId) return;
    const confirmed = window.confirm("Are you sure you want to cancel this entire order? All seller orders will be cancelled. You cannot undo this action.");
    if (!confirmed) return;
    setCancellingOrder(true);
    setCancellationError("");
    setCancellationMessage("");
    setDeliveryError("");
    setDeliveryMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to cancel this order.");
      }
      if (!isRecord(payload) || payload.success !== true || !isRecord(payload.order) || payload.order.status !== "CANCELLED") {
        throw new Error("The cancellation response could not be verified. Refresh your order details to check its current status.");
      }
      const cancelledAt = new Date().toISOString();
      setOrder((current) => current ? {
        ...current,
        status: "CANCELLED",
        cancelledAt,
        sellerOrders: current.sellerOrders.map((sellerOrder) => ({
          ...sellerOrder,
          status: "CANCELLED",
          cancelledAt: sellerOrder.cancelledAt ?? cancelledAt,
        })),
      } : current);
      setCancellationMessage("Your order has been cancelled successfully. Reserved tracked inventory has been released.");
    } catch (cancelError) {
      console.error("Buyer order cancellation error:", cancelError);
      setCancellationError(cancelError instanceof Error ? cancelError.message : "Unable to cancel this order. Please try again.");
    } finally {
      setCancellingOrder(false);
    }
  }

  if (loading) {
    return (
      <>
        <div className="hidden lg:block"><SiteHeader searchMode="PRODUCTS" /></div>
        <MobileOrderHeader />
        <main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28 lg:pb-10">
          <div role="status" className="flex items-center gap-3 text-sm font-semibold text-[#756B61]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />Loading order details...
          </div>
        </main>
        <MobileBottomNav />
      </>
    );
  }

  if (error || !order) {
    return (
      <>
        <div className="hidden lg:block"><SiteHeader searchMode="PRODUCTS" /></div>
        <MobileOrderHeader />
        <main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28 lg:pb-10">
          <section className="w-full max-w-md rounded-2xl border border-[#F0C9BF] bg-[#FFF1ED] p-7 text-center">
            <Package className="mx-auto h-9 w-9 text-[#9F2D18]" />
            <h1 className="mt-4 text-lg font-extrabold text-[#17202A]">Order unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-[#756B61]">{error || "We could not find this order in your account."}</p>
            <Link href="/orders" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94E2C]">
              <ArrowLeft className="h-4 w-4" />Back to my orders
            </Link>
          </section>
        </main>
        <MobileBottomNav />
      </>
    );
  }

  const isDeliveryFeeConfirmed = order.deliveryFeeStatus === "CONFIRMED";
  const displayAmount = isDeliveryFeeConfirmed ? order.totalAmount : order.itemsSubtotal;
  const displayAmountLabel = isDeliveryFeeConfirmed ? "Confirmed order total" : "Products subtotal";

  return (
    <>
      {/* Desktop keeps the full site navigation. Mobile uses a compact order header without the category/search header. */}
      <div className="hidden lg:block"><SiteHeader searchMode="PRODUCTS" /></div>
      <MobileOrderHeader />

      <main id="main-content" className="min-h-dvh bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10">
        <div className="mx-auto max-w-[1240px] px-3 pb-8 pt-4 sm:px-5 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8">
          <div className="mb-5 hidden flex-wrap items-center gap-2 text-[11px] text-[#756B61] sm:flex">
            <Link href="/" className="hover:text-[#9F2D18]">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/orders" className="hover:text-[#9F2D18]">My orders</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-bold text-[#9F2D18]">Order details</span>
          </div>

          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
            <div className="min-w-0">
              <Link href="/orders" className="mb-2 hidden items-center gap-1.5 text-[10px] font-bold text-[#9F2D18] hover:text-[#FF5A36] sm:inline-flex">
                <ArrowLeft className="h-3.5 w-3.5" />Back to my orders
              </Link>
              <h1 className="text-xl font-black tracking-tight text-[#401B13] sm:text-2xl lg:text-3xl">Order details</h1>
              <p className="mt-1.5 break-all text-[11px] font-bold text-[#9F2D18] sm:text-xs">{order.orderCode}</p>
              <p className="mt-1 text-[10px] text-[#91877E]">Placed {formatDateTime(order.createdAt)}</p>
            </div>
            <span className={`rounded-full px-3 py-2 text-[10px] font-bold ${getStatusClass(order.status)}`}>
              {getOrderStatusLabel(order.status)}
            </span>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_350px] xl:gap-6">
            {/* MAIN COLUMN */}
            <div className="min-w-0 space-y-5">
              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-[0_4px_18px_rgba(41,37,34,0.025)] sm:p-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
                  <div><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Order date</p><p className="mt-1.5 text-xs font-bold text-[#292522]">{formatDateTime(order.createdAt)}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Products</p><p className="mt-1.5 text-xs font-bold text-[#292522]">{productCount} {productCount === 1 ? "item" : "items"}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Sellers</p><p className="mt-1.5 text-xs font-bold text-[#292522]">{order.sellerOrders.length}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">{displayAmountLabel}</p><p className="mt-1.5 text-sm font-black text-[#9F2D18]">{formatNaira(displayAmount)}</p></div>
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-[#401B13] sm:text-lg">Seller fulfilment and delivery</h2>
                    <p className="mt-1 max-w-2xl text-[10px] leading-5 text-[#756B61] sm:text-[11px]">
                      Each seller handles their part of your order. Courier tracking is shown separately for every parcel.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#FFF1ED] px-3 py-1.5 text-[9px] font-extrabold text-[#9F2D18]">
                      {order.sellerOrders.length} {order.sellerOrders.length === 1 ? "seller" : "sellers"}
                    </span>
                    <button type="button" onClick={() => void refreshTracking()} disabled={trackingLoading || trackingRefreshing} aria-label="Refresh delivery tracking" title="Refresh delivery tracking" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18] disabled:opacity-50">
                      {trackingLoading || trackingRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {trackingError && (
                  <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F0D7B3] bg-[#FFF8EC] p-3 text-[10px] leading-5 text-[#796B5C]">
                    <span>{trackingError} Your order details are still available; tracking could not be refreshed.</span>
                    <button type="button" onClick={() => void refreshTracking()} className="font-extrabold text-[#9F2D18] underline">Try again</button>
                  </div>
                )}
                {trackingLoading && order.sellerOrders.every((sellerOrder) => sellerOrder.shipments.length === 0) && (
                  <p role="status" className="mb-3 flex items-center gap-2 text-[10px] text-[#91877E]">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />Checking for courier updates...
                  </p>
                )}
                {deliveryError && <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{deliveryError}</div>}
                {deliveryMessage && <div role="status" className="mb-3 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] p-3 text-xs font-semibold text-[#137A59]">{deliveryMessage}</div>}

                {order.sellerOrders.length > 0 ? (
                  <div className="space-y-4">
                    {order.sellerOrders.map((sellerOrder) => (
                      <SellerOrderCard
                        key={sellerOrder.id}
                        sellerOrder={sellerOrder}
                        onConfirmDelivery={confirmDelivery}
                        confirming={confirmingSellerOrderId === sellerOrder.id}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5 text-xs text-[#756B61]">Seller fulfilment records are not available for this order.</div>
                )}
              </section>

              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-[0_4px_18px_rgba(41,37,34,0.025)] sm:p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]"><MapPin className="h-5 w-5" /></div>
                  <div><h2 className="text-sm font-extrabold text-[#401B13]">Delivery details</h2><p className="mt-1 text-[10px] text-[#91877E]">The delivery information supplied during checkout.</p></div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Recipient</p><p className="mt-1 text-xs font-bold text-[#292522]">{order.deliveryRecipient}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Phone number</p><p className="mt-1 text-xs font-bold text-[#292522]">{order.deliveryPhone}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Delivery address</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 text-[#514840]">{order.deliveryAddress}</p></div>
                  <div><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Area / neighbourhood</p><p className="mt-1 text-xs font-bold text-[#292522]">{order.deliveryArea}</p></div>
                  {order.deliveryLandmark && <div><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Landmark</p><p className="mt-1 text-xs text-[#514840]">{order.deliveryLandmark}</p></div>}
                  {order.deliveryNotes && <div className="sm:col-span-2"><p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">Delivery instructions</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6 text-[#514840]">{order.deliveryNotes}</p></div>}
                </div>
              </section>
            </div>

            {/* ORDER SIDEBAR */}
            <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
              {(canCancelOrder || cancellationMessage || cancellationError) && (
                <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xs font-extrabold text-[#401B13]">Order actions</h2>
                      <p className="mt-1 text-[10px] leading-5 text-[#91877E]">
                        {canCancelOrder
                          ? "No seller has accepted this order yet. You can cancel the entire order."
                          : order.status === "CANCELLED"
                            ? "This order has been cancelled."
                            : "Cancellation is unavailable after a seller accepts or starts processing an order."}
                      </p>
                    </div>
                    {canCancelOrder && (
                      <button type="button" onClick={cancelOrder} disabled={cancellingOrder || confirmingSellerOrderId !== null} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[10px] font-extrabold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
                        {cancellingOrder ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        {cancellingOrder ? "Cancelling..." : "Cancel order"}
                      </button>
                    )}
                  </div>
                  {cancellationError && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[10px] leading-5 text-red-700">{cancellationError}</div>}
                  {cancellationMessage && <div role="status" className="mt-3 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] p-3 text-[10px] leading-5 text-[#137A59]">{cancellationMessage}</div>}
                </section>
              )}

              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-[0_4px_18px_rgba(41,37,34,0.025)] sm:p-5">
                <h2 className="text-sm font-extrabold text-[#401B13]">Order summary</h2>
                <div className="mt-4 space-y-3">
                  <div className="flex justify-between gap-3 text-xs"><span className="text-[#756B61]">Products subtotal</span><span className="font-bold text-[#292522]">{formatNaira(order.itemsSubtotal)}</span></div>
                  <div className="flex justify-between gap-3 text-xs"><span className="text-[#756B61]">Delivery fee</span><span className="text-right font-semibold text-[#756B61]">{isDeliveryFeeConfirmed ? formatNaira(order.deliveryFee) : "To be confirmed"}</span></div>
                  <div className="flex justify-between gap-3 border-t border-[#EAE6DF] pt-4"><span className="text-sm font-extrabold text-[#292522]">{isDeliveryFeeConfirmed ? "Confirmed order total" : "Products subtotal"}</span><span className="text-base font-black text-[#9F2D18]">{formatNaira(displayAmount)}</span></div>
                </div>
                {!isDeliveryFeeConfirmed && (
                  <div className="mt-4 rounded-xl border border-[#F0D7B3] bg-[#FFF8EC] p-3">
                    <p className="text-[10px] leading-5 text-[#796B5C]">Delivery charges have not been confirmed yet. The displayed amount covers products only and is not the final delivered order amount.</p>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xs font-extrabold text-[#5E4730]">Payment information</h2>
                    {order.payments.length === 0 ? (
                      <p className="mt-2 text-[11px] leading-6 text-[#796B5C]">No payment has been recorded for this order. This order reference is not a payment receipt.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {order.payments.map((payment) => (
                          <div key={payment.id} className="rounded-xl border border-[#F0D7B3] bg-white/70 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-extrabold text-[#5E4730]">{formatMoney(payment.amount, payment.currency)}</span>
                              <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${getStatusClass(payment.status)}`}>{getOrderStatusLabel(payment.status)}</span>
                            </div>
                            <p className="mt-2 text-[10px] text-[#796B5C]">{payment.method ? payment.method.replaceAll("_", " ") : "Payment method not recorded"}</p>
                            <p className="mt-1 text-[10px] text-[#91877E]">Recorded: {formatDateTime(payment.createdAt)}</p>
                            {payment.paidAt && <p className="mt-1 text-[10px] font-semibold text-[#16845D]">Paid: {formatDateTime(payment.paidAt)}</p>}
                            {payment.failureReason && <p className="mt-2 break-words text-[10px] leading-5 text-red-600">Payment information: {payment.failureReason}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {allSellerOrdersFinished && (
                <div className="rounded-2xl border border-[#B8E5D2] bg-[#F0FBF5] p-4">
                  <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-[#16845D]" /><p className="text-xs font-bold text-[#137A59]">All seller orders have reached a final status.</p></div>
                </div>
              )}

              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                <h2 className="text-xs font-extrabold text-[#401B13]">Order timeline</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#756B61]"><CalendarDays className="h-4 w-4 text-[#9F2D18]" /><span>Created: {formatDateTime(order.createdAt)}</span></div>
                {order.completedAt && <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#756B61]"><CheckCircle2 className="h-4 w-4 text-[#16845D]" /><span>Completed: {formatDateTime(order.completedAt)}</span></div>}
                {order.cancelledAt && <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#B42318]"><Clock3 className="h-4 w-4" /><span>Cancelled: {formatDateTime(order.cancelledAt)}</span></div>}
              </section>
            </aside>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#EAE6DF] pt-5">
            <Link href="/orders" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-5 py-3 text-xs font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18]">
              <ArrowLeft className="h-4 w-4" />My orders
            </Link>
            <Link href="/shop" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]">
              Continue shopping<ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <footer className="mt-8 flex items-center justify-center gap-3 pb-4 text-[10px] text-[#9B9188]">
            <span className="h-px w-12 bg-[#EAE6DF]" /><span>ReMarket · Find it nearby</span><span className="h-px w-12 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>
      <MobileBottomNav />
    </>
  );
}

function MobileOrderHeader() {
  return (
    <header className="sticky top-0 z-40 flex min-h-[60px] items-center justify-between gap-3 border-b border-[#EAE6DF] bg-white/95 px-3 shadow-[0_2px_12px_rgba(23,32,42,0.035)] backdrop-blur lg:hidden">
      <Link href="/orders" aria-label="Back to my orders" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white text-[#756B61]">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <Link href="/" className="flex min-w-0 items-center gap-2" aria-label="ReMarket home">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white"><ShoppingBag className="h-4 w-4" /></span>
        <span className="min-w-0"><span className="block text-sm font-extrabold leading-4 text-[#9F2D18]">ReMarket</span><span className="block text-[9px] leading-3 text-[#91877E]">Order details</span></span>
      </Link>
      <Link href="/shop" className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-[#FFF1ED] px-3 text-[10px] font-extrabold text-[#9F2D18]">
        Shop<ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </header>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  return <OrderDetailContent key={orderId} orderId={orderId} />;
}
