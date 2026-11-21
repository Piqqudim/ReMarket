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
    return "bg-[var(--rm-green-bg)] text-[var(--rm-green)]";
  }
  if (["CANCELLED", "PARTIALLY_CANCELLED", "REJECTED", "FAILED", "REFUNDED"].includes(status)) {
    return "bg-[var(--rm-red-bg)] text-[var(--rm-red)]";
  }
  if (["DISPATCHED", "PARTIALLY_DISPATCHED", "READY_FOR_DISPATCH", "IN_TRANSIT", "OUT_FOR_DELIVERY", "PICKED_UP"].includes(status)) {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]";
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
  if (status === "DELIVERED") return "bg-[var(--rm-green-bg)] text-[var(--rm-green)]";
  if (["FAILED", "DELIVERY_FAILED", "RETURNED", "CANCELLED"].includes(status)) {
    return "bg-[var(--rm-red-bg)] text-[var(--rm-red)]";
  }
  if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "COURIER_ASSIGNED"].includes(status)) {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]";
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

function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: typeof Package;
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="rm-panel-header">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rm-category-icon h-10 w-10 shrink-0">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--rm-coral-dark)]">{eyebrow}</p>}
          <h2 className="text-sm font-bold text-[var(--rm-ink)]">{title}</h2>
          {description && <p className="mt-1 text-xs leading-5 text-[var(--rm-muted)]">{description}</p>}
        </div>
      </div>
    </div>
  );
}

function ShipmentCard({ shipment }: { shipment: ShipmentView }) {
  const trackingUrl = getSafeExternalUrl(shipment.trackingUrl);
  const waybillUrl = getSafeExternalUrl(shipment.waybillUrl);
  const failed = ["FAILED", "DELIVERY_FAILED"].includes(shipment.status);
  const trackingEvents = shipment.trackingEvents;

  return (
    <section className="mt-3 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface)] p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rm-category-icon h-10 w-10 shrink-0"><Truck className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-[var(--rm-ink)]">
              {shipment.provider === "SHIPBUBBLE" ? "Shipbubble delivery" : `${shipment.provider} delivery`}
            </h4>
            <p className="mt-1 break-words text-xs text-[var(--rm-muted)]">{shipment.courierName || "Courier not yet assigned"}</p>
          </div>
        </div>
        <span className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold ${getShipmentStatusClass(shipment.status)}`}>
          {getShipmentStatusLabel(shipment.status)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {shipment.trackingCode && (
          <div className="min-w-0 rounded-lg bg-[var(--rm-surface-muted)] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--rm-muted)]">Tracking number</p>
            <p className="mt-1 break-all text-xs font-bold text-[var(--rm-ink)]">{shipment.trackingCode}</p>
          </div>
        )}
        {shipment.estimatedDelivery && (
          <div className="min-w-0 rounded-lg bg-[var(--rm-surface-muted)] p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--rm-muted)]">Estimated delivery</p>
            <p className="mt-1 break-words text-xs font-bold text-[var(--rm-ink)]">{shipment.estimatedDelivery}</p>
          </div>
        )}
        <div className="min-w-0 rounded-lg bg-[var(--rm-surface-muted)] p-3">
          <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--rm-muted)]">Delivery fee</p>
          <p className="mt-1 text-xs font-bold text-[var(--rm-ink)]">{formatMoney(shipment.shippingFee, shipment.currency)}</p>
        </div>
        <div className="min-w-0 rounded-lg bg-[var(--rm-surface-muted)] p-3">
          <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--rm-muted)]">Booked</p>
          <p className="mt-1 break-words text-[10px] font-semibold text-[var(--rm-text)]">{formatDateTime(shipment.bookedAt)}</p>
        </div>
      </div>

      {(trackingUrl || waybillUrl) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {trackingUrl && (
            <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="rm-button rm-button-primary min-h-10 text-xs">
              <ExternalLink className="h-3.5 w-3.5" />Track delivery
            </a>
          )}
          {waybillUrl && (
            <a href={waybillUrl} target="_blank" rel="noopener noreferrer" className="rm-button rm-button-secondary min-h-10 text-xs">
              <FileText className="h-3.5 w-3.5" />View waybill
            </a>
          )}
        </div>
      )}

      {failed && (
        <div className="mt-3 rounded-lg border border-[var(--rm-red)]/25 bg-[var(--rm-red-bg)] p-3">
          <p className="text-xs font-bold text-[var(--rm-red)]">This shipment needs attention.</p>
          <p className="mt-1 text-xs leading-5 text-[var(--rm-red)]">The delivery provider has reported a booking or delivery issue. ReMarket support or the seller may need to review it.</p>
        </div>
      )}
      {shipment.status === "BOOKING_PENDING" && (
        <p className="mt-3 rounded-lg border border-[var(--rm-yellow)]/25 bg-[var(--rm-yellow-bg)] p-3 text-xs leading-5 text-[var(--rm-yellow)]">
          The delivery booking is being processed. Tracking information will appear when the courier confirms the shipment.
        </p>
      )}
      {shipment.status === "DELIVERED" && shipment.deliveredAt && (
        <p className="mt-3 rounded-lg border border-[var(--rm-green)]/25 bg-[var(--rm-green-bg)] p-3 text-xs font-semibold text-[var(--rm-green)]">
          Courier delivery recorded: {formatDateTime(shipment.deliveredAt)}
        </p>
      )}

      <div className="mt-4 border-t border-[var(--rm-border)] pt-4">
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-[var(--rm-muted)]">Tracking updates</h4>
        {trackingEvents.length > 0 ? (
          <ol className="mt-3 space-y-3">
            {trackingEvents.map((event, index) => (
              <li key={event.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${index === trackingEvents.length - 1 ? "bg-[var(--rm-green-bg)] text-[var(--rm-green)]" : "bg-[var(--rm-surface-muted)] text-[var(--rm-muted)]"}`}>
                    {index === trackingEvents.length - 1 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                  </span>
                  {index !== trackingEvents.length - 1 && <span className="mt-1 h-5 w-px bg-[var(--rm-border)]" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-xs font-bold text-[var(--rm-text)]">{event.statusLabel}</p>
                  {event.message && <p className="mt-0.5 break-words text-xs leading-5 text-[var(--rm-muted)]">{event.message}</p>}
                  {event.location && <p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--rm-muted)]"><MapPin className="h-3 w-3 shrink-0" />{event.location}</p>}
                  <p className="mt-1 text-[10px] text-[var(--rm-subtle)]">{formatDateTime(event.occurredAt ?? event.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs leading-5 text-[var(--rm-muted)]">No courier scans have been received yet. The latest shipment status is shown above.</p>
        )}
      </div>
    </section>
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
    <section className="rm-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--rm-border)] bg-white text-[var(--rm-coral-dark)]">
            {sellerOrder.business.imageUrl ? (
              <img src={sellerOrder.business.imageUrl} alt={sellerOrder.business.name} className="h-full w-full object-cover" />
            ) : <Store className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--rm-ink)]">{sellerOrder.business.name}</p>
            <p className="mt-1 break-all text-[10px] text-[var(--rm-muted)]">{sellerOrder.sellerOrderCode}</p>
          </div>
        </div>
        <span className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold ${getStatusClass(sellerOrder.status)}`}>
          {getOrderStatusLabel(sellerOrder.status)}
        </span>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[var(--rm-ink)]">Fulfilment progress</h3>
            {!terminated && <span className="text-[10px] font-semibold text-[var(--rm-muted)]">{Math.max(0, progressIndex + 1)} of {fulfilmentSteps.length} stages</span>}
          </div>
          {terminated ? (
            <div className="mt-3 rounded-lg border border-[var(--rm-red)]/25 bg-[var(--rm-red-bg)] p-3">
              <p className="text-xs font-bold text-[var(--rm-red)]">{rejected ? "This seller rejected the order." : "This seller order was cancelled."}</p>
              <p className="mt-1 text-xs text-[var(--rm-red)]">{formatDateTime(rejected ? sellerOrder.rejectedAt : sellerOrder.cancelledAt)}</p>
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {fulfilmentSteps.map((step, index) => {
                const done = progressIndex >= 0 && index <= progressIndex;
                const current = index === progressIndex;
                return (
                  <div key={step.status} className={`flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 ${current ? "bg-[var(--rm-coral-soft)]" : "bg-[var(--rm-surface-muted)]"}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-[var(--rm-green-bg)] text-[var(--rm-green)]" : "border border-[var(--rm-border)] bg-white text-[var(--rm-subtle)]"}`}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-[9px] font-bold">{index + 1}</span>}
                    </span>
                    <span className={`min-w-0 text-xs ${current ? "font-bold text-[var(--rm-coral-dark)]" : done ? "font-semibold text-[var(--rm-text)]" : "text-[var(--rm-muted)]"}`}>{step.label}</span>
                    {current && <span className="ml-auto shrink-0 text-[9px] font-bold text-[var(--rm-coral-dark)]">NOW</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--rm-border)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-[var(--rm-coral-dark)]" /><h3 className="text-sm font-bold text-[var(--rm-ink)]">Delivery tracking</h3></div>
            <span className="text-[10px] font-semibold text-[var(--rm-muted)]">{sellerOrder.shipments.length} {sellerOrder.shipments.length === 1 ? "parcel" : "parcels"}</span>
          </div>
          {sellerOrder.shipments.length > 0 ? (
            <div className="space-y-3">{sellerOrder.shipments.map((shipment) => <ShipmentCard key={shipment.id} shipment={shipment} />)}</div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)] p-3 text-xs leading-5 text-[var(--rm-muted)]">
              {sellerOrder.status === "READY_FOR_DISPATCH"
                ? "The seller has marked this order ready. Courier booking details will appear here once a shipment is booked."
                : sellerOrder.status === "DISPATCHED" || sellerOrder.status === "DELIVERED"
                  ? "Shipment tracking details have not been returned yet. Refresh this page shortly or contact ReMarket support if they remain unavailable."
                  : "Courier tracking will become available after the seller prepares the order and books a delivery."}
            </p>
          )}
        </div>

        {sellerOrder.status === "DELIVERED" && (
          <div className="rounded-lg border border-[var(--rm-green)]/25 bg-[var(--rm-green-bg)] p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--rm-green)]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[var(--rm-green)]">The courier has marked this seller order as delivered.</p>
                <p className="mt-1 text-xs leading-5 text-[var(--rm-green)]">Confirm only after you have received the products.</p>
                <button type="button" disabled={confirming} onClick={() => onConfirmDelivery(sellerOrder.id)} className="rm-button mt-3 min-h-10 bg-[var(--rm-green)] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                  {confirming ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {confirming ? "Confirming..." : "Confirm delivery"}
                </button>
              </div>
            </div>
          </div>
        )}
        {sellerOrder.status === "COMPLETED" && (
          <div className="rounded-lg border border-[var(--rm-green)]/25 bg-[var(--rm-green-bg)] p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-[var(--rm-green)]"><CheckCircle2 className="h-4 w-4" />You have confirmed delivery of this order.</p>
            {sellerOrder.completedAt && <p className="mt-2 text-xs text-[var(--rm-green)]">Confirmed: {formatDateTime(sellerOrder.completedAt)}</p>}
          </div>
        )}

        <div className="border-t border-[var(--rm-border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[var(--rm-ink)]">Products from this seller</h3>
            <span className="text-[10px] font-semibold text-[var(--rm-muted)]">{sellerOrder.items.length} {sellerOrder.items.length === 1 ? "product" : "products"}</span>
          </div>
          <div className="mt-3 space-y-2">
            {sellerOrder.items.map((item) => (
              <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-lg bg-[var(--rm-surface-muted)] p-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--rm-border)] bg-white">
                  {item.productImageUrl ? <img src={item.productImageUrl} alt={item.productName} loading="lazy" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-[var(--rm-subtle)]" />}
                </div>
                <div className="min-w-0 flex-1">
                  {item.productId ? (
                    <Link href={`/product/${encodeURIComponent(item.productId)}`} className="line-clamp-2 break-words text-xs font-semibold text-[var(--rm-ink)] hover:text-[var(--rm-coral-dark)]">{item.productName}</Link>
                  ) : <p className="line-clamp-2 break-words text-xs font-semibold text-[var(--rm-ink)]">{item.productName}</p>}
                  <p className="mt-1 text-[10px] text-[var(--rm-muted)]">{item.quantity} × {formatNaira(item.unitPrice)}</p>
                </div>
                <p className="shrink-0 text-xs font-bold text-[var(--rm-coral-dark)]">{formatNaira(item.lineTotal)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--rm-border)] pt-3">
            <span className="text-xs font-semibold text-[var(--rm-muted)]">Seller subtotal</span>
            <span className="text-sm font-bold text-[var(--rm-ink)]">{formatNaira(sellerOrder.subtotal)}</span>
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
        <main className="rm-storefront flex min-h-[65vh] items-center justify-center px-4 pb-28 lg:pb-10">
          <div role="status" className="flex items-center gap-3 text-sm font-semibold text-[var(--rm-muted)]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[var(--rm-coral)]" />Loading order details...
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
        <main className="rm-storefront flex min-h-[65vh] items-center justify-center px-4 pb-28 lg:pb-10">
          <section className="rm-panel w-full max-w-md p-7 text-center">
            <span className="rm-category-icon mx-auto h-14 w-14"><Package className="h-7 w-7" /></span>
            <h1 className="mt-4 text-lg font-bold text-[var(--rm-ink)]">Order unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--rm-muted)]">{error || "We could not find this order in your account."}</p>
            <Link href="/orders" className="rm-button rm-button-primary mt-5"><ArrowLeft className="h-4 w-4" />Back to my orders</Link>
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
      <div className="hidden lg:block"><SiteHeader searchMode="PRODUCTS" /></div>
      <MobileOrderHeader />

      <main id="main-content" className="rm-storefront pb-28 lg:pb-10">
        <div className="rm-container max-w-[1240px] pb-8 pt-4 sm:pt-6 lg:pb-10 lg:pt-8">
          <nav aria-label="Breadcrumb" className="mb-5 hidden flex-wrap items-center gap-2 text-xs text-[var(--rm-muted)] sm:flex">
            <Link href="/" className="hover:text-[var(--rm-coral-dark)]">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/orders" className="hover:text-[var(--rm-coral-dark)]">My orders</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-semibold text-[var(--rm-coral-dark)]">Order details</span>
          </nav>

          <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
            <div className="min-w-0">
              <Link href="/orders" className="mb-2 hidden items-center gap-1.5 text-xs font-semibold text-[var(--rm-coral-dark)] hover:text-[var(--rm-coral)] sm:inline-flex">
                <ArrowLeft className="h-3.5 w-3.5" />Back to my orders
              </Link>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--rm-coral-dark)]">Purchase details</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--rm-ink)] sm:text-3xl">Order details</h1>
              <p className="mt-2 break-all text-sm font-bold text-[var(--rm-coral-dark)]">{order.orderCode}</p>
              <p className="mt-1 text-xs text-[var(--rm-muted)]">Placed {formatDateTime(order.createdAt)}</p>
            </div>
            <span className={`rounded-md px-3 py-2 text-xs font-bold ${getStatusClass(order.status)}`}>
              {getOrderStatusLabel(order.status)}
            </span>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="rm-panel p-3 sm:p-4"><p className="text-[10px] font-semibold text-[var(--rm-muted)]">Order date</p><p className="mt-1 text-xs font-bold text-[var(--rm-ink)]">{formatDateTime(order.createdAt)}</p></div>
            <div className="rm-panel p-3 sm:p-4"><p className="text-[10px] font-semibold text-[var(--rm-muted)]">Products</p><p className="mt-1 text-xs font-bold text-[var(--rm-ink)]">{productCount} {productCount === 1 ? "item" : "items"}</p></div>
            <div className="rm-panel p-3 sm:p-4"><p className="text-[10px] font-semibold text-[var(--rm-muted)]">Sellers</p><p className="mt-1 text-xs font-bold text-[var(--rm-ink)]">{order.sellerOrders.length}</p></div>
            <div className="rm-panel p-3 sm:p-4"><p className="text-[10px] font-semibold text-[var(--rm-muted)]">{displayAmountLabel}</p><p className="mt-1 text-sm font-bold text-[var(--rm-coral-dark)]">{formatNaira(displayAmount)}</p></div>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_350px] xl:gap-6">
            <div className="min-w-0 space-y-5">
              <section className="rm-panel overflow-hidden">
                <SectionHeading
                  icon={Store}
                  eyebrow="Order progress"
                  title="Seller fulfilment and delivery"
                  description="Each seller handles their part of your order. Courier tracking is shown separately for every parcel."
                />
                <div className="p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="rm-filter-chip" aria-current="true">{order.sellerOrders.length} {order.sellerOrders.length === 1 ? "seller" : "sellers"}</span>
                    <button type="button" onClick={() => void refreshTracking()} disabled={trackingLoading || trackingRefreshing} aria-label="Refresh delivery tracking" title="Refresh delivery tracking" className="rm-icon-button">
                      {trackingLoading || trackingRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </button>
                  </div>
                  {trackingError && (
                    <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--rm-yellow)]/25 bg-[var(--rm-yellow-bg)] p-3 text-xs leading-5 text-[var(--rm-yellow)]">
                      <span>{trackingError} Your order details are still available; tracking could not be refreshed.</span>
                      <button type="button" onClick={() => void refreshTracking()} className="font-bold underline">Try again</button>
                    </div>
                  )}
                  {trackingLoading && order.sellerOrders.every((sellerOrder) => sellerOrder.shipments.length === 0) && (
                    <p role="status" className="mb-3 flex items-center gap-2 text-xs text-[var(--rm-muted)]"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Checking for courier updates...</p>
                  )}
                  {deliveryError && <div role="alert" className="mb-3 rounded-lg border border-[var(--rm-red)]/25 bg-[var(--rm-red-bg)] p-3 text-xs font-semibold text-[var(--rm-red)]">{deliveryError}</div>}
                  {deliveryMessage && <div role="status" className="mb-3 rounded-lg border border-[var(--rm-green)]/25 bg-[var(--rm-green-bg)] p-3 text-xs font-semibold text-[var(--rm-green)]">{deliveryMessage}</div>}
                  {order.sellerOrders.length > 0 ? (
                    <div className="space-y-4">{order.sellerOrders.map((sellerOrder) => <SellerOrderCard key={sellerOrder.id} sellerOrder={sellerOrder} onConfirmDelivery={confirmDelivery} confirming={confirmingSellerOrderId === sellerOrder.id} />)}</div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)] p-5 text-xs text-[var(--rm-muted)]">Seller fulfilment records are not available for this order.</div>
                  )}
                </div>
              </section>

              <section className="rm-panel overflow-hidden">
                <SectionHeading icon={MapPin} title="Delivery details" description="The delivery information supplied during checkout." />
                <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
                  <div><p className="rm-field-label">Recipient</p><p className="text-sm font-semibold text-[var(--rm-ink)]">{order.deliveryRecipient}</p></div>
                  <div><p className="rm-field-label">Phone number</p><p className="text-sm font-semibold text-[var(--rm-ink)]">{order.deliveryPhone}</p></div>
                  <div><p className="rm-field-label">Delivery address</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--rm-text)]">{order.deliveryAddress}</p></div>
                  <div><p className="rm-field-label">Area / neighbourhood</p><p className="text-sm font-semibold text-[var(--rm-ink)]">{order.deliveryArea}</p></div>
                  {order.deliveryLandmark && <div><p className="rm-field-label">Landmark</p><p className="text-sm text-[var(--rm-text)]">{order.deliveryLandmark}</p></div>}
                  {order.deliveryNotes && <div className="sm:col-span-2"><p className="rm-field-label">Delivery instructions</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--rm-text)]">{order.deliveryNotes}</p></div>}
                </div>
              </section>
            </div>

            <aside className="min-w-0 space-y-5 lg:sticky lg:top-24 lg:self-start">
              {(canCancelOrder || cancellationMessage || cancellationError) && (
                <section className="rm-panel p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-bold text-[var(--rm-ink)]">Order actions</h2>
                      <p className="mt-1 text-xs leading-5 text-[var(--rm-muted)]">
                        {canCancelOrder
                          ? "No seller has accepted this order yet. You can cancel the entire order."
                          : order.status === "CANCELLED"
                            ? "This order has been cancelled."
                            : "Cancellation is unavailable after a seller accepts or starts processing an order."}
                      </p>
                    </div>
                    {canCancelOrder && (
                      <button type="button" onClick={cancelOrder} disabled={cancellingOrder || confirmingSellerOrderId !== null} className="rm-button min-h-10 border border-[var(--rm-red)]/30 bg-white px-3 text-xs font-bold text-[var(--rm-red)] hover:bg-[var(--rm-red-bg)] disabled:cursor-not-allowed disabled:opacity-50">
                        {cancellingOrder ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                        {cancellingOrder ? "Cancelling..." : "Cancel order"}
                      </button>
                    )}
                  </div>
                  {cancellationError && <div role="alert" className="mt-3 rounded-lg border border-[var(--rm-red)]/25 bg-[var(--rm-red-bg)] p-3 text-xs leading-5 text-[var(--rm-red)]">{cancellationError}</div>}
                  {cancellationMessage && <div role="status" className="mt-3 rounded-lg border border-[var(--rm-green)]/25 bg-[var(--rm-green-bg)] p-3 text-xs leading-5 text-[var(--rm-green)]">{cancellationMessage}</div>}
                </section>
              )}

              <section className="rm-panel overflow-hidden">
                <div className="rm-panel-header"><div><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--rm-coral-dark)]">Payment breakdown</p><h2 className="mt-1 text-sm font-bold text-[var(--rm-ink)]">Order summary</h2></div></div>
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex justify-between gap-3 text-xs"><span className="text-[var(--rm-muted)]">Products subtotal</span><span className="font-semibold text-[var(--rm-ink)]">{formatNaira(order.itemsSubtotal)}</span></div>
                  <div className="flex justify-between gap-3 text-xs"><span className="text-[var(--rm-muted)]">Delivery fee</span><span className="text-right font-semibold text-[var(--rm-text)]">{isDeliveryFeeConfirmed ? formatNaira(order.deliveryFee) : "To be confirmed"}</span></div>
                  <div className="flex justify-between gap-3 border-t border-[var(--rm-border)] pt-4"><span className="text-sm font-bold text-[var(--rm-ink)]">{isDeliveryFeeConfirmed ? "Confirmed order total" : "Products subtotal"}</span><span className="text-base font-extrabold text-[var(--rm-coral-dark)]">{formatNaira(displayAmount)}</span></div>
                  {!isDeliveryFeeConfirmed && <div className="rounded-lg border border-[var(--rm-yellow)]/25 bg-[var(--rm-yellow-bg)] p-3"><p className="text-xs leading-5 text-[var(--rm-yellow)]">Delivery charges have not been confirmed yet. The displayed amount covers products only and is not the final delivered order amount.</p></div>}
                </div>
              </section>

              <section className="rm-panel overflow-hidden">
                <div className="rm-panel-header"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--rm-coral-dark)]" /><h2 className="text-sm font-bold text-[var(--rm-ink)]">Payment information</h2></div></div>
                <div className="space-y-3 p-4 sm:p-5">
                  {order.payments.length === 0 ? (
                    <p className="text-xs leading-5 text-[var(--rm-muted)]">No payment has been recorded for this order. This order reference is not a payment receipt.</p>
                  ) : order.payments.map((payment) => (
                    <div key={payment.id} className="rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-[var(--rm-ink)]">{formatMoney(payment.amount, payment.currency)}</span>
                        <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold ${getStatusClass(payment.status)}`}>{getOrderStatusLabel(payment.status)}</span>
                      </div>
                      <p className="mt-2 text-xs text-[var(--rm-muted)]">{payment.method ? payment.method.replaceAll("_", " ") : "Payment method not recorded"}</p>
                      <p className="mt-1 text-[10px] text-[var(--rm-muted)]">Recorded: {formatDateTime(payment.createdAt)}</p>
                      {payment.paidAt && <p className="mt-1 text-xs font-semibold text-[var(--rm-green)]">Paid: {formatDateTime(payment.paidAt)}</p>}
                      {payment.failureReason && <p className="mt-2 break-words text-xs leading-5 text-[var(--rm-red)]">Payment information: {payment.failureReason}</p>}
                    </div>
                  ))}
                </div>
              </section>

              {allSellerOrdersFinished && (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--rm-green)]/25 bg-[var(--rm-green-bg)] p-4">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--rm-green)]" /><p className="text-xs font-semibold text-[var(--rm-green)]">All seller orders have reached a final status.</p>
                </div>
              )}

              <section className="rm-panel p-4 sm:p-5">
                <h2 className="text-sm font-bold text-[var(--rm-ink)]">Order timeline</h2>
                <div className="mt-3 flex items-start gap-2 text-xs text-[var(--rm-muted)]"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rm-coral-dark)]" /><span>Created: {formatDateTime(order.createdAt)}</span></div>
                {order.completedAt && <div className="mt-3 flex items-start gap-2 text-xs text-[var(--rm-muted)]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rm-green)]" /><span>Completed: {formatDateTime(order.completedAt)}</span></div>}
                {order.cancelledAt && <div className="mt-3 flex items-start gap-2 text-xs text-[var(--rm-red)]"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><span>Cancelled: {formatDateTime(order.cancelledAt)}</span></div>}
              </section>
            </aside>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rm-border)] pt-5">
            <Link href="/orders" className="rm-button rm-button-secondary"><ArrowLeft className="h-4 w-4" />My orders</Link>
            <Link href="/shop" className="rm-button rm-button-primary">Continue shopping<ArrowRight className="h-4 w-4" /></Link>
          </div>
          <footer className="mt-8 flex items-center justify-center gap-3 pb-4 text-xs text-[var(--rm-muted)]"><span className="h-px w-12 bg-[var(--rm-border)]" /><span>ReMarket · Find it nearby</span><span className="h-px w-12 bg-[var(--rm-border)]" /></footer>
        </div>
      </main>
      <MobileBottomNav />
    </>
  );
}

function MobileOrderHeader() {
  return (
    <header className="sticky top-0 z-40 flex min-h-[58px] items-center justify-between gap-2 border-b border-[var(--rm-border)] bg-white px-3 shadow-[var(--rm-shadow-header)] lg:hidden">
      <Link href="/orders" aria-label="Back to my orders" className="rm-icon-button h-9 w-9">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <Link href="/" className="rm-brand min-w-0 text-lg" aria-label="ReMarket home">
        <span className="rm-brand-mark"><ShoppingBag className="h-4 w-4" /></span>
        <span className="min-w-0"><span className="block">Re<span className="text-[var(--rm-coral)]">Market</span></span><span className="mt-0.5 block text-[10px] font-medium tracking-normal text-[var(--rm-muted)]">Order details</span></span>
      </Link>
      <Link href="/shop" className="rm-button min-h-9 gap-1 bg-[var(--rm-coral-soft)] px-3 text-xs text-[var(--rm-coral-dark)] hover:bg-[var(--rm-cream-deep)]">Shop<ArrowRight className="h-3.5 w-3.5" /></Link>
    </header>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  return <OrderDetailContent key={orderId} orderId={orderId} />;
}
