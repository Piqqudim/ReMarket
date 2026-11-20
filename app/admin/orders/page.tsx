"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import {
  Activity, AlertCircle, ArrowDownUp, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2,
  ChevronLeft, ChevronRight, CreditCard, ExternalLink, Eye, FileText, Filter, History,
  LayoutDashboard, MapPin, Package, PackageCheck, RefreshCw, Search, ShieldCheck,
  ShoppingBag, Store, Truck, UserRound, Wallet, X, type LucideIcon,
} from "lucide-react";

type OrderStatus = "PENDING_PAYMENT" | "PLACED" | "PARTIALLY_ACCEPTED" | "CONFIRMED" | "PROCESSING" | "PARTIALLY_DISPATCHED" | "DISPATCHED" | "COMPLETED" | "PARTIALLY_CANCELLED" | "CANCELLED";
type PaymentStatus = "PENDING" | "INITIATED" | "SUCCESS" | "FAILED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
type DeliveryFeeStatus = "UNCONFIRMED" | "CONFIRMED";
type PaymentMethod = "CARD" | "BANK_TRANSFER" | "USSD" | "OTHER";
type ShipmentStatus = "BOOKING_PENDING" | "PENDING" | "CONFIRMED" | "COURIER_ASSIGNED" | "AWAITING_PICKUP" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_FAILED" | "RETURNING" | "RETURNED" | "CANCELLED" | "FAILED";

type ShipmentTrackingEvent = {
  id: string; status: ShipmentStatus; statusLabel: string; message: string | null;
  location: string | null; occurredAt: string | null; createdAt: string;
};
type Shipment = {
  id: string; provider: string; providerOrderId: string | null; courierName: string | null;
  trackingCode: string | null; trackingUrl: string | null; waybillUrl: string | null;
  status: ShipmentStatus; shippingFee: number; currency: string; estimatedDelivery: string | null;
  failureReason: string | null; bookedAt: string | null; pickedUpAt: string | null;
  inTransitAt: string | null; deliveredAt: string | null; cancelledAt: string | null;
  createdAt: string; updatedAt: string; trackingEvents: ShipmentTrackingEvent[];
};

type OrderItem = {
  id: string; productId: string | null; productName: string; productImageUrl: string | null;
  unitPrice: number; quantity: number; lineTotal: number; inventoryReserved: boolean; createdAt: string;
};
type SellerOrder = {
  id: string; sellerOrderCode: string; status: string; subtotal: number; sellerNote: string | null;
  acceptedAt: string | null; rejectedAt: string | null; dispatchedAt: string | null;
  deliveredAt: string | null; completedAt: string | null; cancelledAt: string | null;
  seller: { id: string; name: string | null; email: string | null };
  business: { id: string; name: string; location: { area: string; address: string | null } | null };
  items: OrderItem[]; shipments?: Shipment[];
};
type Payment = {
  id: string; amount: number; currency: string; status: PaymentStatus; method: PaymentMethod | null;
  provider: string | null; providerReference: string | null; failureReason: string | null;
  paidAt: string | null; createdAt: string; updatedAt: string;
  providerTransactionId?: string | null; providerVerified?: boolean;
  requiresManualReview?: boolean; manualReviewReason?: string | null;
};
type SellerOrderOperations = {
  id: string; sellerOrderCode: string; status: string;
  acceptedAt: string | null; rejectedAt: string | null; dispatchedAt: string | null;
  deliveredAt: string | null; completedAt: string | null; cancelledAt: string | null;
  shipments: Shipment[];
};
type OrderOperationsResponse = {
  success: boolean;
  order: { id: string; orderCode: string; status: OrderStatus; paidAt: string | null; paymentExpiresAt: string | null };
  payments: Payment[];
  sellerOrders: SellerOrderOperations[];
};
type AdminOrder = {
  id: string; orderCode: string; status: OrderStatus; itemsSubtotal: number; deliveryFee: number;
  deliveryFeeStatus: DeliveryFeeStatus; totalAmount: number; currency: string;
  deliveryRecipient: string; deliveryPhone: string; deliveryAddress: string; deliveryArea: string;
  deliveryLandmark: string | null; deliveryNotes: string | null; completedAt: string | null;
  cancelledAt: string | null; createdAt: string; updatedAt: string;
  paidAt?: string | null; paymentExpiresAt?: string | null;
  buyer: { id: string; name: string | null; email: string | null };
  sellerOrders: SellerOrder[]; payments: Payment[];
};
type CountRow<T extends string> = { status: T; count: number };
type OrdersResponse = {
  success: boolean; orders: AdminOrder[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
  statusCounts: CountRow<OrderStatus>[]; paymentStatusCounts: CountRow<PaymentStatus>[]; generatedAt: string;
};
type AuditEntry = {
  id: string; action: string; entityType: string; entityId: string; reason: string | null;
  beforeData: unknown; afterData: unknown; metadata: unknown; createdAt: string;
  admin: { id: string; name: string | null; email: string | null };
};
type AuditResponse = {
  success: boolean; entries: AuditEntry[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
};

const ORDER_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT", "PLACED", "PARTIALLY_ACCEPTED", "CONFIRMED", "PROCESSING", "PARTIALLY_DISPATCHED",
  "DISPATCHED", "COMPLETED", "PARTIALLY_CANCELLED", "CANCELLED",
];
const PAYMENT_STATUSES: PaymentStatus[] = [
  "PENDING", "INITIATED", "SUCCESS", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED",
];
const CANCELLABLE = new Set(["PENDING_ACCEPTANCE", "ACCEPTED", "PROCESSING", "READY_FOR_DISPATCH"]);
const FINAL_SELLER_STATUSES = new Set(["REJECTED", "CANCELLED"]);
const PAYMENT_REVIEW = new Set(["PENDING", "INITIATED", "SUCCESS", "PARTIALLY_REFUNDED"]);
const ADMIN_NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
  { label: "Settlements", href: "/admin/settlements", icon: Wallet },
  { label: "Categories", href: "/admin/categories", icon: Filter },
  { label: "Deletion requests", href: "/admin/business-deletion-requests", icon: FileText },
  { label: "Announcements", href: "/admin/announcements", icon: Activity },
];

function formatCurrency(value: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}
function readableStatus(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function orderStatusClass(status: string) {
  if (["COMPLETED", "DELIVERED"].includes(status)) return "bg-[#E7F7EF] text-[#287A4B]";
  if (["CANCELLED", "PARTIALLY_CANCELLED", "REJECTED", "DELIVERY_FAILED", "FAILED", "RETURNED"].includes(status)) return "bg-[#FCE8E6] text-[#B42318]";
  if (["PROCESSING", "DISPATCHED", "PARTIALLY_DISPATCHED", "READY_FOR_DISPATCH", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "COURIER_ASSIGNED"].includes(status)) return "bg-[#EAF1FF] text-[#315DA8]";
  return "bg-[#FFF0D9] text-[#9F5A18]";
}
function paymentStatusClass(status: string) {
  if (status === "SUCCESS") return "bg-[#E7F7EF] text-[#287A4B]";
  if (["FAILED", "CANCELLED"].includes(status)) return "bg-[#FCE8E6] text-[#B42318]";
  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(status)) return "bg-[#F1EAFE] text-[#6941A5]";
  return "bg-[#FFF0D9] text-[#9F5A18]";
}
function getPaymentSummary(payments: Payment[]) {
  if (!payments.length) return "NO_RECORD";
  if (payments.every((p) => p.status === "REFUNDED")) return "REFUNDED";
  if (payments.some((p) => p.status === "PARTIALLY_REFUNDED")) return "PARTIALLY_REFUNDED";
  if (payments.some((p) => p.status === "SUCCESS")) return "SUCCESS";
  if (payments.some((p) => p.status === "INITIATED")) return "INITIATED";
  if (payments.some((p) => p.status === "PENDING")) return "PENDING";
  if (payments.some((p) => p.status === "FAILED")) return "FAILED";
  return "CANCELLED";
}
function getCancellationBlockReason(order: AdminOrder): string | null {
  if (!order.sellerOrders.length) return "This order has no seller orders to cancel.";
  if (!order.sellerOrders.some((s) => CANCELLABLE.has(s.status))) return "There are no remaining seller orders eligible for cancellation.";
  if (order.sellerOrders.some((s) => !CANCELLABLE.has(s.status) && !FINAL_SELLER_STATUSES.has(s.status))) {
    return "At least one seller order has already been dispatched, delivered or completed. This order requires manual review.";
  }
  if (order.payments.some((p) => PAYMENT_REVIEW.has(p.status))) {
    return "This order has payment records that must be reconciled before cancellation.";
  }
  return null;
}
function getSafeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
function formatAuditData(value: unknown) {
  if (value === null || value === undefined) return "No data recorded.";
  try { return JSON.stringify(value, null, 2) ?? "No data recorded."; }
  catch { return "Audit data could not be displayed."; }
}

function StatusPill({ value, payment = false }: { value: string; payment?: boolean }) {
  if (value === "NO_RECORD") return <span className="rounded-full bg-[#F0ECE7] px-2.5 py-1 text-[11px] font-semibold text-[#6F675F]">No payment record</span>;
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${payment ? paymentStatusClass(value) : orderStatusClass(value)}`}>{readableStatus(value)}</span>;
}
function SummaryCard({ label, value, icon: Icon, accent = false }: { label: string; value: number; icon: LucideIcon; accent?: boolean }) {
  return <div className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-[#766C63] sm:text-sm">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-[#2E241F] sm:text-3xl">{value.toLocaleString("en-NG")}</p></div><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent ? "bg-[#FFF0E8] text-[#9F2D18]" : "bg-[#F7F1EB] text-[#6F675F]"}`}><Icon className="h-5 w-5" /></div></div></div>;
}

function OrderDetails({ order, onClose, onCancelled }: { order: AdminOrder; onClose: () => void; onCancelled: (orderCode: string) => void }) {
  const [cancelReason, setCancelReason] = useState("");
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState("");
  const [auditReloadKey, setAuditReloadKey] = useState(0);
  const [operations, setOperations] = useState<OrderOperationsResponse | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [operationsError, setOperationsError] = useState("");
  const [operationsReloadKey, setOperationsReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOperations() {
      setOperationsLoading(true);
      setOperationsError("");
      try {
        const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/operations`, {
          method: "GET", cache: "no-store", signal: controller.signal,
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error : "Unable to load payment and shipment details.";
          throw new Error(message);
        }
        if (typeof result !== "object" || result === null || !("payments" in result) || !Array.isArray(result.payments) || !("sellerOrders" in result) || !Array.isArray(result.sellerOrders) || !("order" in result)) {
          throw new Error("The order operations response was invalid.");
        }
        setOperations(result as OrderOperationsResponse);
      } catch (error) {
        if (controller.signal.aborted) return;
        setOperations(null);
        setOperationsError(error instanceof Error ? error.message : "Unable to load payment and shipment details.");
      } finally {
        if (!controller.signal.aborted) setOperationsLoading(false);
      }
    }
    void loadOperations();
    return () => controller.abort();
  }, [order.id, operationsReloadKey]);

  const detailedPayments = operations?.payments ?? order.payments;
  const detailedSellerOrders = order.sellerOrders.map((sellerOrder) => {
    const latest = operations?.sellerOrders.find((entry) => entry.id === sellerOrder.id);
    return { ...sellerOrder, status: latest?.status ?? sellerOrder.status, shipments: latest?.shipments ?? [] };
  });
  const cancellationBlockReason = operationsLoading
    ? "Loading payment and fulfilment records. Cancellation stays disabled until these records are checked."
    : operationsError
      ? "Payment and fulfilment records could not be loaded. Refresh the order before attempting cancellation."
      : getCancellationBlockReason({ ...order, sellerOrders: detailedSellerOrders, payments: detailedPayments });

  useEffect(() => {
    const controller = new AbortController();
    async function loadAudit() {
      setAuditLoading(true); setAuditError("");
      try {
        const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/audit?page=${auditPage}&pageSize=10`, {
          method: "GET", cache: "no-store", signal: controller.signal,
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error : "Unable to load order audit history.";
          throw new Error(message);
        }
        if (typeof result !== "object" || result === null || !("entries" in result) || !Array.isArray(result.entries) || !("pagination" in result) || typeof result.pagination !== "object" || result.pagination === null) {
          throw new Error("The audit-history response was invalid.");
        }
        const payload = result as AuditResponse;
        setAuditEntries(payload.entries);
        setAuditTotal(payload.pagination.total);
        setAuditTotalPages(payload.pagination.totalPages);
      } catch (error) {
        if (controller.signal.aborted) return;
        setAuditError(error instanceof Error ? error.message : "Unable to load order audit history.");
        setAuditEntries([]); setAuditTotal(0); setAuditTotalPages(0);
      } finally {
        if (!controller.signal.aborted) setAuditLoading(false);
      }
    }
    void loadAudit();
    return () => controller.abort();
  }, [order.id, auditPage, auditReloadKey]);

  async function handleAdminCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (reason.length < 10 || reason.length > 500) { setCancelError("Enter a cancellation reason between 10 and 500 characters."); return; }
    if (!confirmCancellation) { setCancelError("Please confirm that you understand this cancellation."); return; }
    setCancelling(true); setCancelError("");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ reason }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error : "Unable to cancel this order.";
        throw new Error(message);
      }
      onCancelled(order.orderCode);
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Unable to cancel this order.");
    } finally { setCancelling(false); }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#241B17]/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !cancelling) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="order-detail-title" className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-[#FAF6EF] shadow-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-[#E8DED3] bg-white px-5 py-4 sm:px-7">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#9F2D18]">Order details</p><h2 id="order-detail-title" className="mt-1 break-all text-xl font-semibold text-[#2E241F] sm:text-2xl">{order.orderCode}</h2><p className="mt-1 text-xs text-[#8B8178]">Placed {formatDate(order.createdAt)}</p></div>
          <button type="button" onClick={onClose} disabled={cancelling} aria-label="Close order details" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8DED3] text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:opacity-50"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-7">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><p className="text-xs text-[#8B8178]">Order status</p><div className="mt-2"><StatusPill value={order.status} /></div></div>
            <div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><p className="text-xs text-[#8B8178]">Payment records</p><div className="mt-2"><StatusPill value={getPaymentSummary(detailedPayments)} payment /></div></div>
            <div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><p className="text-xs text-[#8B8178]">Paystack verification</p><div className="mt-2">{operationsLoading ? <span className="text-xs font-medium text-[#8B8178]">Checking…</span> : operationsError ? <span className="inline-flex rounded-full bg-[#FCE8E6] px-2.5 py-1 text-[11px] font-semibold text-[#B42318]">Unavailable</span> : detailedPayments.some((payment) => payment.providerVerified) ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F7EF] px-2.5 py-1 text-[11px] font-semibold text-[#287A4B]"><ShieldCheck className="h-3.5 w-3.5" />Verified</span> : <span className="inline-flex rounded-full bg-[#FFF0D9] px-2.5 py-1 text-[11px] font-semibold text-[#9F5A18]">Not verified</span>}</div></div>
            <div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><p className="text-xs text-[#8B8178]">Delivery fee</p><div className="mt-2"><StatusPill value={order.deliveryFeeStatus} /></div></div>
          </div>
          {operationsError && <div className="flex flex-col gap-2 rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] p-3 sm:flex-row sm:items-center sm:justify-between"><p role="alert" className="text-xs text-[#B42318]">{operationsError}</p><button type="button" onClick={() => setOperationsReloadKey((key) => key + 1)} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-[#9F2D18] ring-1 ring-[#F1C5BF]"><RefreshCw className="h-3.5 w-3.5" />Retry details</button></div>}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5"><div className="mb-3 flex items-center gap-2"><UserRound className="h-4 w-4 text-[#9F2D18]" /><h3 className="text-sm font-semibold text-[#2E241F]">Buyer</h3></div><p className="text-sm font-semibold text-[#2E241F]">{order.buyer.name || "Name not available"}</p><p className="mt-1 break-all text-xs text-[#766C63]">{order.buyer.email || "Email not available"}</p><p className="mt-2 text-[11px] text-[#A0968E]">Buyer ID: {order.buyer.id}</p></section>
            <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5"><div className="mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-[#9F2D18]" /><h3 className="text-sm font-semibold text-[#2E241F]">Delivery destination</h3></div><p className="text-sm font-semibold text-[#2E241F]">{order.deliveryRecipient}</p><p className="mt-1 text-xs text-[#766C63]">{order.deliveryPhone}</p><p className="mt-2 text-sm leading-6 text-[#4B4038]">{order.deliveryAddress}</p><p className="mt-1 text-xs text-[#766C63]">{order.deliveryArea}</p>{order.deliveryLandmark && <p className="mt-1 text-xs text-[#8B8178]">Landmark: {order.deliveryLandmark}</p>}{order.deliveryNotes && <p className="mt-2 rounded-lg bg-[#F7F1EB] p-2 text-xs leading-5 text-[#6F675F]">Note: {order.deliveryNotes}</p>}</section>
          </div>

          <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2"><Wallet className="h-4 w-4 text-[#9F2D18]" /><h3 className="text-sm font-semibold text-[#2E241F]">Order amounts</h3></div>
            <div className="space-y-2 text-sm"><div className="flex items-center justify-between gap-3 text-[#6F675F]"><span>Items subtotal</span><span className="font-medium text-[#2E241F]">{formatCurrency(order.itemsSubtotal, order.currency)}</span></div><div className="flex items-center justify-between gap-3 text-[#6F675F]"><span>Delivery fee</span><span className="font-medium text-[#2E241F]">{order.deliveryFeeStatus === "CONFIRMED" ? formatCurrency(order.deliveryFee, order.currency) : "Not confirmed"}</span></div><div className="border-t border-dashed border-[#E8DED3] pt-3"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#2E241F]">Recorded order total</p>{order.deliveryFeeStatus !== "CONFIRMED" && <p className="mt-1 max-w-sm text-[11px] leading-4 text-[#9F5A18]">This recorded total excludes a confirmed delivery fee and should not be treated as the final delivered amount.</p>}</div><p className="text-lg font-semibold text-[#2E241F]">{formatCurrency(order.totalAmount, order.currency)}</p></div></div></div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-[#2E241F]">Seller fulfilment and shipments</h3><p className="mt-1 text-[11px] text-[#8B8178]">{detailedSellerOrders.length} {detailedSellerOrders.length === 1 ? "seller" : "sellers"}</p></div><button type="button" onClick={() => setOperationsReloadKey((key) => key + 1)} disabled={operationsLoading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DED3] bg-white px-3 text-[11px] font-semibold text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${operationsLoading ? "animate-spin" : ""}`} />Refresh details</button></div>
            {detailedSellerOrders.map((sellerOrder) => <article key={sellerOrder.id} className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-all text-xs font-semibold text-[#9F2D18]">{sellerOrder.sellerOrderCode}</p><h4 className="mt-1 text-sm font-semibold text-[#2E241F]">{sellerOrder.business.name}</h4><p className="mt-1 text-xs text-[#766C63]">Seller: {sellerOrder.seller.name || sellerOrder.seller.email || "Seller account"}</p>{sellerOrder.business.location?.area && <p className="mt-1 text-xs text-[#8B8178]">Pickup business area: {sellerOrder.business.location.area}</p>}</div><div className="flex shrink-0 flex-wrap items-center gap-2"><StatusPill value={sellerOrder.status} /><span className="text-sm font-semibold text-[#2E241F]">{formatCurrency(sellerOrder.subtotal, order.currency)}</span></div></div>
              {sellerOrder.sellerNote && <p className="mt-3 rounded-lg bg-[#F7F1EB] p-3 text-xs leading-5 text-[#6F675F]">Seller note: {sellerOrder.sellerNote}</p>}
              <div className="mt-4 divide-y divide-[#F0E9E2] border-t border-[#F0E9E2]">{sellerOrder.items.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-medium text-[#2E241F]">{item.productName}</p><p className="mt-1 text-xs text-[#8B8178]">{item.quantity} × {formatCurrency(item.unitPrice, order.currency)}</p><p className="mt-1 text-[10px] text-[#A0968E]">{item.inventoryReserved ? "Stock was reserved" : "Stock tracking was not enabled"}</p></div><p className="shrink-0 text-sm font-semibold text-[#2E241F]">{formatCurrency(item.lineTotal, order.currency)}</p></div>)}</div>
              <div className="mt-4 rounded-xl border border-[#F0E9E2] bg-[#FFFCF8] p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-[#9F2D18]" /><h5 className="text-xs font-semibold text-[#2E241F]">Shipbubble delivery</h5></div><span className="text-[10px] text-[#8B8178]">{sellerOrder.shipments.length} {sellerOrder.shipments.length === 1 ? "shipment" : "shipments"}</span></div>
                {operationsLoading ? <div className="h-16 animate-pulse rounded-lg bg-[#F7F1EB]" /> : operationsError ? <p className="rounded-lg bg-[#FFF4F2] p-3 text-xs text-[#B42318]">Shipment details are unavailable until the operations request succeeds.</p> : sellerOrder.shipments.length === 0 ? <div className="rounded-lg bg-white p-3"><p className="text-xs font-medium text-[#4B4038]">No shipment has been booked for this seller order.</p><p className="mt-1 text-[11px] leading-5 text-[#8B8178]">Seller fulfilment status: {readableStatus(sellerOrder.status)}. A shipment record appears here after a courier booking is created.</p></div> : <div className="space-y-3">{sellerOrder.shipments.map((shipment) => {
                  const trackingUrl = getSafeExternalUrl(shipment.trackingUrl);
                  const waybillUrl = getSafeExternalUrl(shipment.waybillUrl);
                  return <div key={shipment.id} className="rounded-lg border border-[#E8DED3] bg-white p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><PackageCheck className="h-4 w-4 shrink-0 text-[#9F2D18]" /><p className="text-xs font-semibold text-[#2E241F]">{shipment.provider}</p></div><StatusPill value={shipment.status} /></div>
                    <div className="mt-3 grid gap-2 text-xs text-[#766C63] sm:grid-cols-2"><p>Courier: <span className="font-semibold text-[#4B4038]">{shipment.courierName || "Not assigned"}</span></p><p>Shipping fee: <span className="font-semibold text-[#4B4038]">{formatCurrency(shipment.shippingFee, shipment.currency)}</span></p><p className="break-all">Tracking code: <span className="font-semibold text-[#4B4038]">{shipment.trackingCode || "Not available"}</span></p><p>Provider order ID: <span className="font-semibold text-[#4B4038]">{shipment.providerOrderId || "Pending"}</span></p><p>Booked: {formatDate(shipment.bookedAt)}</p><p>Estimated delivery: {shipment.estimatedDelivery || "Not supplied"}</p>{shipment.pickedUpAt && <p>Picked up: {formatDate(shipment.pickedUpAt)}</p>}{shipment.inTransitAt && <p>In transit: {formatDate(shipment.inTransitAt)}</p>}{shipment.deliveredAt && <p>Delivered: {formatDate(shipment.deliveredAt)}</p>}{shipment.cancelledAt && <p>Cancelled: {formatDate(shipment.cancelledAt)}</p>}</div>
                    {(trackingUrl || waybillUrl) && <div className="mt-3 flex flex-wrap gap-2">{trackingUrl && <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[#FFF0E8] px-3 py-2 text-[11px] font-semibold text-[#9F2D18] hover:bg-[#FFE3D7]">Track shipment<ExternalLink className="h-3 w-3" /></a>}{waybillUrl && <a href={waybillUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#E8DED3] px-3 py-2 text-[11px] font-semibold text-[#6F675F] hover:bg-[#F7F1EB]">Open waybill<ExternalLink className="h-3 w-3" /></a>}</div>}
                    {shipment.failureReason && <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#F1C5BF] bg-[#FFF4F2] p-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B42318]" /><div><p className="text-[11px] font-semibold text-[#B42318]">Delivery / booking issue</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[#8F3028]">{shipment.failureReason}</p></div></div>}
                    <div className="mt-4 border-t border-[#F0E9E2] pt-3"><p className="mb-2 text-[11px] font-semibold text-[#4B4038]">Tracking events</p>{shipment.trackingEvents.length === 0 ? <p className="text-[11px] text-[#8B8178]">No tracking events have been received yet.</p> : <ol className="space-y-3">{shipment.trackingEvents.map((event) => <li key={event.id} className="relative pl-4 before:absolute before:left-0 before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-[#FF8A70]"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><p className="text-xs font-semibold text-[#4B4038]">{event.statusLabel || readableStatus(event.status)}</p><span className="text-[10px] text-[#8B8178]">{formatDate(event.occurredAt || event.createdAt)}</span></div>{event.message && <p className="mt-1 text-[11px] leading-5 text-[#766C63]">{event.message}</p>}{event.location && <p className="mt-1 text-[10px] text-[#9A9087]">Location: {event.location}</p>}</li>)}</ol>}</div>
                  </div>;
                })}</div>}
              </div>
            </article>)}
          </section>

          <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2"><CreditCard className="h-4 w-4 text-[#9F2D18]" /><h3 className="text-sm font-semibold text-[#2E241F]">Paystack and payment verification</h3></div>
            <p className="mb-3 text-xs leading-5 text-[#8B8178]">A payment is shown as provider-verified only when the server has a successful Paystack status, a transaction ID and a paid timestamp. A browser redirect or a payment row by itself is not proof of payment.</p>
            <div className="mb-3 grid gap-2 rounded-xl bg-[#F7F1EB] p-3 text-xs sm:grid-cols-2"><p className="text-[#6F675F]">Order paid at: <span className="font-semibold text-[#2E241F]">{operations?.order.paidAt ? formatDate(operations.order.paidAt) : "Not recorded"}</span></p><p className="text-[#6F675F]">Payment session expiry: <span className="font-semibold text-[#2E241F]">{operations?.order.paymentExpiresAt ? formatDate(operations.order.paymentExpiresAt) : "Not recorded"}</span></p></div>
            {operationsLoading ? <div className="space-y-2"><div className="h-16 animate-pulse rounded-xl bg-[#F7F1EB]" /><div className="h-16 animate-pulse rounded-xl bg-[#F7F1EB]" /></div> : operationsError ? <p className="rounded-xl bg-[#FFF4F2] p-3 text-xs text-[#B42318]">Could not load provider verification data. Use the retry control above before making a payment-related decision.</p> : !detailedPayments.length ? <div className="rounded-xl bg-[#F7F1EB] p-4"><p className="text-sm font-medium text-[#4B4038]">No payment record attached to this order.</p><p className="mt-1 text-xs leading-5 text-[#8B8178]">Order placement is not proof of payment. This order has no provider payment attempt recorded.</p></div> : <div className="space-y-3">{detailedPayments.map((payment) => <div key={payment.id} className="rounded-xl border border-[#F0E9E2] p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#2E241F]">{formatCurrency(payment.amount, payment.currency)}</p><div className="flex flex-wrap items-center gap-2"><StatusPill value={payment.status} payment />{payment.providerVerified ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F7EF] px-2.5 py-1 text-[10px] font-semibold text-[#287A4B]"><ShieldCheck className="h-3 w-3" />Provider verified</span> : payment.status === "SUCCESS" ? <span className="rounded-full bg-[#FFF0D9] px-2.5 py-1 text-[10px] font-semibold text-[#9F5A18]">Verification incomplete</span> : null}</div></div>
              <div className="mt-3 grid gap-2 text-xs text-[#766C63] sm:grid-cols-2"><p>Provider: <span className="font-semibold text-[#4B4038]">{payment.provider || "Not assigned"}</span></p><p>Method: <span className="font-semibold text-[#4B4038]">{payment.method ? readableStatus(payment.method) : "Not selected"}</span></p><p className="break-all">Payment reference: <span className="font-semibold text-[#4B4038]">{payment.providerReference || "Not available"}</span></p><p className="break-all">Provider transaction ID: <span className="font-semibold text-[#4B4038]">{payment.providerTransactionId || "Not available"}</span></p><p>Created: {formatDate(payment.createdAt)}</p><p>Provider paid at: {formatDate(payment.paidAt)}</p></div>
              {payment.requiresManualReview && <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#F2D49F] bg-[#FFF8E8] p-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9F5A18]" /><div><p className="text-xs font-semibold text-[#875313]">Order requires manual review</p><p className="mt-1 text-xs leading-5 text-[#8B6A3F]">{payment.manualReviewReason || "Paystack reported a successful payment, but the payment confirmation workflow flagged this order for review before fulfilment."}</p></div></div>}
              {payment.failureReason && <p className="mt-3 rounded-lg bg-[#FFF4F2] p-2 text-xs text-[#B42318]">{payment.failureReason}</p>}
            </div>)}</div>}
          </section>

          {/* AUDIT HISTORY */}
          <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-[#9F2D18]" /><h3 className="text-sm font-semibold text-[#2E241F]">Admin audit history</h3></div><span className="text-xs text-[#8B8178]">{auditTotal} {auditTotal === 1 ? "record" : "records"}</span></div>
            {auditLoading ? <div className="space-y-3"><div className="h-16 animate-pulse rounded-xl bg-[#F7F1EB]" /><div className="h-16 animate-pulse rounded-xl bg-[#F7F1EB]" /></div> : auditError ? <div className="rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] p-3"><p role="alert" className="text-xs text-[#B42318]">{auditError}</p><button type="button" onClick={() => setAuditReloadKey((key) => key + 1)} className="mt-2 text-xs font-semibold text-[#9F2D18] hover:underline">Try again</button></div> : auditEntries.length === 0 ? <div className="rounded-xl bg-[#F7F1EB] p-4"><p className="text-sm font-medium text-[#4B4038]">No Admin actions have been recorded for this order.</p><p className="mt-1 text-xs leading-5 text-[#8B8178]">New actions that use the Admin audit system will appear here. Older actions are not created retroactively.</p></div> : <div className="space-y-3">{auditEntries.map((entry) => <article key={entry.id} className="rounded-xl border border-[#F0E9E2] p-3 sm:p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-[#2E241F]">{readableStatus(entry.action)}</p><p className="mt-1 text-xs text-[#766C63]">{entry.admin.name || entry.admin.email || "Admin account"}{entry.admin.name && entry.admin.email ? ` · ${entry.admin.email}` : ""}</p></div><span className="text-[11px] text-[#8B8178]">{formatDate(entry.createdAt)}</span></div>{entry.reason && <div className="mt-3 rounded-lg bg-[#FFF7F3] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#9F2D18]">Reason</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#5F4940]">{entry.reason}</p></div>}
                {(entry.beforeData !== null && entry.beforeData !== undefined || entry.afterData !== null && entry.afterData !== undefined || entry.metadata !== null && entry.metadata !== undefined) && <div className="mt-3 space-y-2">{entry.beforeData !== null && entry.beforeData !== undefined && <details className="rounded-lg border border-[#E8DED3] p-2"><summary className="cursor-pointer text-xs font-semibold text-[#6F675F]">Before</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-[#6F675F]">{formatAuditData(entry.beforeData)}</pre></details>}{entry.afterData !== null && entry.afterData !== undefined && <details className="rounded-lg border border-[#E8DED3] p-2"><summary className="cursor-pointer text-xs font-semibold text-[#6F675F]">After</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-[#6F675F]">{formatAuditData(entry.afterData)}</pre></details>}{entry.metadata !== null && entry.metadata !== undefined && <details className="rounded-lg border border-[#E8DED3] p-2"><summary className="cursor-pointer text-xs font-semibold text-[#6F675F]">Additional details</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-[#6F675F]">{formatAuditData(entry.metadata)}</pre></details>}</div>}
              </article>)}</div>}
            {!auditLoading && !auditError && auditTotalPages > 1 && <div className="mt-4 flex items-center justify-between border-t border-[#F0E9E2] pt-3"><p className="text-xs text-[#8B8178]">Page {auditPage} of {auditTotalPages}</p><div className="flex gap-2"><button type="button" onClick={() => setAuditPage((p) => Math.max(1, p - 1))} disabled={auditPage <= 1} className="rounded-lg border border-[#E8DED3] px-3 py-2 text-xs font-semibold text-[#6F675F] disabled:opacity-40">Previous</button><button type="button" onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))} disabled={auditPage >= auditTotalPages} className="rounded-lg border border-[#E8DED3] px-3 py-2 text-xs font-semibold text-[#6F675F] disabled:opacity-40">Next</button></div></div>}
          </section>

          {/* ADMIN CANCELLATION */}
          {cancellationBlockReason ? <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5"><div className="flex items-start gap-3"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" /><div><h3 className="text-sm font-semibold text-[#2E241F]">Admin cancellation unavailable</h3><p className="mt-2 text-xs leading-5 text-[#766C63]">{cancellationBlockReason}</p></div></div></section> : <form onSubmit={handleAdminCancellation} className="rounded-2xl border border-[#F1D1C9] bg-[#FFF7F3] p-4 sm:p-5">
            <div className="flex items-center gap-2"><X className="h-4 w-4 text-[#9F2D18]" /><h3 className="text-sm font-semibold text-[#7C2C1A]">Admin cancellation</h3></div>
            <p className="mt-2 text-xs leading-5 text-[#8B5A4C]">This order currently meets the basic cancellation checks. Cancelling it will update its eligible seller orders, restore reserved inventory and record your action in the Admin audit log.</p>
            <label htmlFor="admin-cancellation-reason" className="mt-4 block text-xs font-semibold text-[#4B4038]">Reason for cancellation</label>
            <textarea id="admin-cancellation-reason" value={cancelReason} onChange={(event) => { setCancelReason(event.target.value); setCancelError(""); }} maxLength={500} rows={4} required minLength={10} disabled={cancelling} placeholder="Explain why the marketplace team is cancelling this order..." className="mt-2 w-full rounded-xl border border-[#E8DED3] bg-white p-3 text-sm text-[#2E241F] outline-none placeholder:text-[#A0968E] focus:border-[#FF8A70] focus:ring-2 focus:ring-[#FF5A36]/10 disabled:opacity-60" />
            <div className="mt-1 flex justify-between gap-3"><p className="text-[11px] text-[#8B8178]">Minimum 10 characters.</p><p className="text-[11px] text-[#8B8178]">{cancelReason.length}/500</p></div>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5"><input type="checkbox" checked={confirmCancellation} onChange={(event) => { setConfirmCancellation(event.target.checked); setCancelError(""); }} disabled={cancelling} className="mt-0.5 h-4 w-4 shrink-0 accent-[#9F2D18]" /><span className="text-xs leading-5 text-[#6F675F]">I confirm that I have reviewed this order and understand that this action will cancel its eligible seller orders and restore reserved inventory.</span></label>
            {cancelError && <p role="alert" className="mt-3 rounded-lg border border-[#F1C5BF] bg-[#FFF4F2] p-3 text-xs text-[#B42318]">{cancelError}</p>}
            <button type="submit" disabled={cancelling || !confirmCancellation || cancelReason.trim().length < 10 || cancelReason.trim().length > 500} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#9F2D18] px-4 text-xs font-semibold text-white transition hover:bg-[#842515] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{cancelling ? <><RefreshCw className="h-4 w-4 animate-spin" />Cancelling order...</> : "Cancel entire order"}</button>
          </form>}

          <div className="rounded-2xl border border-[#F1D1C9] bg-[#FFF7F3] p-4"><div className="flex items-start gap-3"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" /><div><p className="text-sm font-semibold text-[#7C2C1A]">Order management safeguards</p><p className="mt-1 text-xs leading-5 text-[#8B5A4C]">Eligible pre-dispatch cancellations are enabled. Payment reconciliation, refunds, delivery assignments and exceptional post-dispatch interventions remain separate operations.</p></div></div></div>
        </div>
      </section>
    </div>
  );
}

export default function AdminOrdersPage() {
  const pathname = usePathname();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [statusCounts, setStatusCounts] = useState<CountRow<OrderStatus>[]>([]);
  const [paymentStatusCounts, setPaymentStatusCounts] = useState<CountRow<PaymentStatus>[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [deliveryFeeStatus, setDeliveryFeeStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setQuery(queryInput.trim()); }, 350);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const loadOrders = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (deliveryFeeStatus) params.set("deliveryFeeStatus", deliveryFeeStatus);
    const response = await fetch(`/api/admin/orders?${params.toString()}`, { method: "GET", cache: "no-store", signal });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "Unable to load marketplace orders.";
      throw new Error(message);
    }
    if (typeof result !== "object" || result === null || !("orders" in result) || !Array.isArray(result.orders) || !("pagination" in result) || typeof result.pagination !== "object" || result.pagination === null) throw new Error("The Admin orders response was invalid.");
    const payload = result as OrdersResponse;
    setOrders(payload.orders); setStatusCounts(payload.statusCounts ?? []); setPaymentStatusCounts(payload.paymentStatusCounts ?? []);
    setTotal(payload.pagination.total); setTotalPages(payload.pagination.totalPages);
    if (payload.pagination.totalPages > 0 && page > payload.pagination.totalPages) setPage(payload.pagination.totalPages);
  }, [page, pageSize, query, status, paymentStatus, deliveryFeeStatus]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function run() {
      setLoading(true); setError("");
      try { await loadOrders(controller.signal); }
      catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Admin orders load error:", loadError);
        if (!cancelled) { setError(loadError instanceof Error ? loadError.message : "Unable to load marketplace orders."); setOrders([]); setTotal(0); setTotalPages(0); }
      } finally { if (!cancelled) { setLoading(false); setRefreshing(false); } }
    }
    void run();
    return () => { cancelled = true; controller.abort(); };
  }, [loadOrders, reloadKey]);

  const selectedOrder = useMemo(() => orders.find((order) => order.id === selectedOrderId) ?? null, [orders, selectedOrderId]);
  const totalCompleted = statusCounts.find((row) => row.status === "COMPLETED")?.count ?? 0;
  const totalPlaced = statusCounts.find((row) => row.status === "PLACED")?.count ?? 0;
  const pendingPayments = paymentStatusCounts.filter((row) => row.status === "PENDING" || row.status === "INITIATED").reduce((sum, row) => sum + row.count, 0);

  function resetFilters() { setQueryInput(""); setQuery(""); setStatus(""); setPaymentStatus(""); setDeliveryFeeStatus(""); setPage(1); }
  function handleOrderCancelled(orderCode: string) {
    setSelectedOrderId(null);
    setActionMessage(`Order ${orderCode} was cancelled successfully. The order records and eligible inventory have been updated.`);
    setRefreshing(true); setReloadKey((value) => value + 1);
  }

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#FAF6EF] text-[#2E241F]"><div className="flex min-h-dvh w-full">
      <aside className="hidden w-64 shrink-0 border-r border-[#E8DED3] bg-[#FFFDFC] lg:block"><div className="sticky top-0 flex h-dvh flex-col"><div className="border-b border-[#E8DED3] px-6 py-6"><Link href="/admin" className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#9F2D18] text-sm font-bold text-white">R</div><div><p className="font-semibold text-[#2E241F]">ReMarket</p><p className="text-xs text-[#8B8178]">Admin</p></div></Link></div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6"><p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9A9087]">Marketplace operations</p>{ADMIN_NAV.map((item) => { const Icon = item.icon; const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB] hover:text-[#2E241F]"}`}><Icon className="h-4 w-4" /><span>{item.label}</span></Link>; })}</nav>
        <div className="border-t border-[#E8DED3] px-6 py-4"><p className="text-xs text-[#9A9087]">Founder access</p><p className="mt-1 text-sm font-medium text-[#4B4038]">Marketplace operations</p></div></div></aside>

      <main className="min-w-0 flex-1"><div className="mx-auto w-full max-w-7xl px-3 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:py-8">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8B8178] hover:text-[#9F2D18]"><ArrowLeft className="h-3.5 w-3.5" />Admin overview</Link><p className="text-sm font-medium text-[#9F2D18]">Marketplace operations</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#2E241F] sm:text-3xl">Orders</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#766C63]">Monitor buyer checkouts, seller fulfilment, delivery details and recorded payment attempts.</p></div>
          <button type="button" onClick={() => { setRefreshing(true); setReloadKey((value) => value + 1); }} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-[#E8DED3] bg-white px-4 text-xs font-semibold text-[#6F675F] transition hover:border-[#D8C9BC] hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"><RefreshCw className={`h-4 w-4 ${refreshing || loading ? "animate-spin" : ""}`} />Refresh</button>
        </div>

        {actionMessage && <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[#B9E5CA] bg-[#E7F7EF] p-4"><p className="text-sm font-medium text-[#287A4B]">{actionMessage}</p><button type="button" onClick={() => setActionMessage("")} className="shrink-0 text-xs font-semibold text-[#287A4B] hover:underline">Dismiss</button></div>}
        <div className="mb-5 rounded-2xl border border-[#F1D1C9] bg-[#FFF7F3] px-4 py-3"><div className="flex items-start gap-3"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" /><div><p className="text-sm font-semibold text-[#7C2C1A]">Payment and fulfilment monitoring</p><p className="mt-1 text-xs leading-5 text-[#8B5A4C]">The Admin order view reads Paystack verification records and Shipbubble shipment updates. Payment status, refunds and courier tracking are not editable from this page; eligible pre-dispatch cancellations remain separately guarded and audited.</p></div></div></div>

        <section className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><SummaryCard label="All orders" value={statusCounts.reduce((sum, row) => sum + row.count, 0)} icon={ShoppingBag} accent /><SummaryCard label="Newly placed" value={totalPlaced} icon={CalendarDays} /><SummaryCard label="Completed" value={totalCompleted} icon={CheckCircle2} /><SummaryCard label="Pending payment records" value={pendingPayments} icon={CreditCard} /></section>

        <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-base font-semibold text-[#2E241F]">Order directory</h2><p className="mt-1 text-xs text-[#8B8178]">Search and filter parent orders. Each order can contain several seller orders.</p></div>
          <div className="flex flex-wrap items-center gap-2"><label className="relative min-w-[220px] flex-1 xl:w-72 xl:flex-none"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9087]" /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search order, buyer or seller..." className="h-10 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] pl-9 pr-3 text-sm text-[#2E241F] outline-none transition placeholder:text-[#A0968E] focus:border-[#FF8A70] focus:ring-2 focus:ring-[#FF5A36]/10" /></label><button type="button" onClick={resetFilters} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#F7F1EB]"><ArrowDownUp className="h-3.5 w-3.5" />Clear filters</button></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[#8B8178]">Order status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-[#E8DED3] bg-white px-3 text-sm text-[#4B4038] outline-none focus:border-[#FF8A70]"><option value="">All order statuses</option>{ORDER_STATUSES.map((item) => <option key={item} value={item}>{readableStatus(item)}</option>)}</select></label>
            <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[#8B8178]">Payment status</span><select value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-[#E8DED3] bg-white px-3 text-sm text-[#4B4038] outline-none focus:border-[#FF8A70]"><option value="">All payment statuses</option>{PAYMENT_STATUSES.map((item) => <option key={item} value={item}>{readableStatus(item)}</option>)}</select></label>
            <label className="space-y-1"><span className="text-[11px] font-semibold uppercase tracking-wide text-[#8B8178]">Delivery fee</span><select value={deliveryFeeStatus} onChange={(event) => { setDeliveryFeeStatus(event.target.value); setPage(1); }} className="h-10 w-full rounded-xl border border-[#E8DED3] bg-white px-3 text-sm text-[#4B4038] outline-none focus:border-[#FF8A70]"><option value="">All delivery fee states</option><option value="UNCONFIRMED">Unconfirmed</option><option value="CONFIRMED">Confirmed</option></select></label></div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#F0E9E2] pt-4"><p className="text-xs text-[#8B8178]">{total.toLocaleString("en-NG")} matching {total === 1 ? "order" : "orders"}</p><p className="text-[11px] text-[#A0968E]">Sorted newest first</p></div>
          {error && <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-[#B42318]">{error}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-[#9F2D18] ring-1 ring-[#F1C5BF]"><RefreshCw className="h-3.5 w-3.5" />Try again</button></div>}
          {loading ? <div className="mt-4 space-y-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-[#F7F1EB]" />)}</div> : error ? null : orders.length === 0 ? <div className="py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F7F1EB] text-[#9A9087]"><ShoppingBag className="h-6 w-6" /></div><p className="mt-4 text-sm font-semibold text-[#4B4038]">No orders found</p><p className="mt-1 text-xs text-[#8B8178]">Try changing your search or clearing the filters.</p><button type="button" onClick={resetFilters} className="mt-4 text-xs font-semibold text-[#9F2D18] hover:underline">Clear filters</button></div> : <>
            <div className="mt-3 hidden overflow-x-auto md:block"><table className="w-full min-w-[850px] border-collapse text-left"><thead><tr className="border-b border-[#E8DED3] text-[11px] font-semibold uppercase tracking-wide text-[#8B8178]"><th className="px-3 py-3">Order</th><th className="px-3 py-3">Buyer</th><th className="px-3 py-3">Seller orders</th><th className="px-3 py-3">Order status</th><th className="px-3 py-3">Payment record</th><th className="px-3 py-3">Recorded total</th><th className="px-3 py-3"><span className="sr-only">Details</span></th></tr></thead>
              <tbody className="divide-y divide-[#F0E9E2]">{orders.map((order) => <tr key={order.id} className="align-top transition hover:bg-[#FFFCF8]"><td className="px-3 py-4"><p className="text-sm font-semibold text-[#2E241F]">{order.orderCode}</p><p className="mt-1 text-[11px] text-[#8B8178]">{formatDate(order.createdAt)}</p></td><td className="max-w-[190px] px-3 py-4"><p className="truncate text-sm font-medium text-[#4B4038]">{order.buyer.name || "Buyer"}</p><p className="mt-1 truncate text-[11px] text-[#8B8178]">{order.buyer.email || "No email"}</p></td><td className="px-3 py-4"><p className="text-sm font-medium text-[#4B4038]">{order.sellerOrders.length}</p><p className="mt-1 max-w-[160px] truncate text-[11px] text-[#8B8178]">{order.sellerOrders.map((item) => item.business.name).join(", ") || "No seller order"}</p></td><td className="px-3 py-4"><StatusPill value={order.status} /></td><td className="px-3 py-4"><StatusPill value={getPaymentSummary(order.payments)} payment /></td><td className="px-3 py-4"><p className="text-sm font-semibold text-[#2E241F]">{formatCurrency(order.totalAmount, order.currency)}</p>{order.deliveryFeeStatus === "UNCONFIRMED" && <p className="mt-1 text-[10px] text-[#9F5A18]">Delivery fee pending</p>}</td><td className="px-3 py-4 text-right"><button type="button" onClick={() => setSelectedOrderId(order.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:border-[#F0B3A5] hover:bg-[#FFF0E8] hover:text-[#9F2D18]"><Eye className="h-3.5 w-3.5" />Details</button></td></tr>)}</tbody></table></div>
            <div className="mt-3 space-y-3 md:hidden">{orders.map((order) => <article key={order.id} className="rounded-xl border border-[#E8DED3] bg-[#FFFEFC] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-sm font-semibold text-[#2E241F]">{order.orderCode}</p><p className="mt-1 text-[11px] text-[#8B8178]">{formatDate(order.createdAt)}</p></div><StatusPill value={order.status} /></div><div className="mt-3 border-t border-[#F0E9E2] pt-3"><p className="text-xs font-medium text-[#4B4038]">{order.buyer.name || "Buyer"}</p><p className="mt-1 break-all text-[11px] text-[#8B8178]">{order.buyer.email || "No email"}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-[#2E241F]">{formatCurrency(order.totalAmount, order.currency)}</p><p className="mt-1 text-[11px] text-[#8B8178]">{order.sellerOrders.length} seller {order.sellerOrders.length === 1 ? "order" : "orders"}</p></div><StatusPill value={getPaymentSummary(order.payments)} payment /></div>{order.deliveryFeeStatus === "UNCONFIRMED" && <p className="mt-2 text-[11px] text-[#9F5A18]">Delivery fee not confirmed</p>}</div><button type="button" onClick={() => setSelectedOrderId(order.id)} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[#FFF0E8] text-xs font-semibold text-[#9F2D18] hover:bg-[#FFE3D7]">View order details<ArrowRight className="h-3.5 w-3.5" /></button></article>)}</div>
            <div className="mt-5 flex flex-col gap-3 border-t border-[#F0E9E2] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[#8B8178]">Page {page} of {Math.max(totalPages, 1)} · Showing {orders.length} of {total.toLocaleString("en-NG")}</p><div className="flex items-center justify-between gap-2 sm:justify-end"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading || totalPages === 0} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></div>
          </>}
        </section>

        <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-[#9F2D18]" /><p className="text-sm font-semibold text-[#2E241F]">Shipbubble fulfilment</p></div><p className="mt-1 text-xs leading-5 text-[#8B8178]">Shipment booking results, courier details, tracking links, delivery failures and webhook tracking events appear inside each order's details.</p></div><div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-[#9F2D18]" /><p className="text-sm font-semibold text-[#2E241F]">Paystack payments</p></div><p className="mt-1 text-xs leading-5 text-[#8B8178]">Provider verification is read from server-confirmed transaction records. This page does not manually mark payments successful or issue refunds.</p></div></div>
      </div></main>
    </div>

    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E8DED3] bg-[#FFFDFC]/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(46,36,31,0.08)] backdrop-blur lg:hidden" aria-label="Mobile Admin navigation"><div className="mx-auto grid w-full max-w-xl grid-cols-5 gap-1">{ADMIN_NAV.filter((item) => ["/admin", "/admin/businesses", "/admin/products", "/admin/orders", "/admin/settlements"].includes(item.href)).map((item) => { const Icon = item.icon; const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[10px] font-semibold transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB]"}`}><Icon className="h-4 w-4 shrink-0" /><span>{item.label}</span></Link>; })}</div></nav>

    {selectedOrder && <OrderDetails order={selectedOrder} onClose={() => setSelectedOrderId(null)} onCancelled={handleOrderCancelled} />}
  </div>
  );
}
