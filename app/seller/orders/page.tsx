"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import {
  AlertCircle,
  BarChart3,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Loader2,
  LogOut,
  MapPin,
  Menu,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Truck,
  UserRound,
  X,
} from "lucide-react";

type SellerOrderStatus =
  | "PENDING_ACCEPTANCE"
  | "ACCEPTED"
  | "REJECTED"
  | "PROCESSING"
  | "READY_FOR_DISPATCH"
  | "DISPATCHED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

type SellerOrderItem = {
  id: string;
  productId: string | null;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

type SellerShipment = {
  id: string;
  status: string;
  courierName: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  waybillUrl: string | null;
  estimatedDelivery: string | null;
  failureReason: string | null;
};

type SellerOrder = {
  id: string;
  sellerOrderCode: string;
  orderCode: string | null;
  status: SellerOrderStatus;
  createdAt: string | null;
  updatedAt: string | null;
  buyerName: string;
  buyerPhone: string | null;
  buyerEmail: string | null;
  deliveryRecipient: string | null;
  deliveryPhone: string | null;
  deliveryAddress: string | null;
  deliveryArea: string | null;
  deliveryLandmark: string | null;
  deliveryNotes: string | null;
  items: SellerOrderItem[];
  itemsSubtotal: number;
  shipments: SellerShipment[];
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type StatusFilter = "ALL" | SellerOrderStatus;
type LoadOptions = { refresh?: boolean; signal?: AbortSignal };

const PAGE_SIZE = 10;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All orders" },
  { value: "PENDING_ACCEPTANCE", label: "New orders" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "PROCESSING", label: "Processing" },
  { value: "READY_FOR_DISPATCH", label: "Ready for dispatch" },
  { value: "DISPATCHED", label: "Dispatched" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_STYLES: Record<SellerOrderStatus, { label: string; className: string }> = {
  PENDING_ACCEPTANCE: { label: "Awaiting your response", className: "border-amber-200 bg-amber-50 text-amber-800" },
  ACCEPTED: { label: "Accepted", className: "border-blue-200 bg-blue-50 text-blue-700" },
  REJECTED: { label: "Rejected", className: "border-rose-200 bg-rose-50 text-rose-700" },
  PROCESSING: { label: "Processing", className: "border-blue-200 bg-blue-50 text-blue-700" },
  READY_FOR_DISPATCH: { label: "Ready for dispatch", className: "border-violet-200 bg-violet-50 text-violet-700" },
  DISPATCHED: { label: "Dispatched", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  DELIVERED: { label: "Delivered", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  COMPLETED: { label: "Completed", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  CANCELLED: { label: "Cancelled", className: "border-stone-200 bg-stone-100 text-stone-600" },
};

const secondaryButtonClass = "rm-button rm-button-secondary min-h-10";
const primaryButtonClass = "rm-button rm-button-primary min-h-10";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getNullableText(value: unknown): string | null {
  return getText(value) || null;
}

function getSafeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function getFirstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== null && value !== undefined);
}

function isSellerOrderStatus(value: unknown): value is SellerOrderStatus {
  return value === "PENDING_ACCEPTANCE" || value === "ACCEPTED" || value === "REJECTED" ||
    value === "PROCESSING" || value === "READY_FOR_DISPATCH" || value === "DISPATCHED" ||
    value === "DELIVERED" || value === "COMPLETED" || value === "CANCELLED";
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(date);
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  return getText(payload.message) || getText(payload.error) || fallback;
}

function parseOrderItem(raw: unknown): SellerOrderItem | null {
  if (!isRecord(raw)) return null;
  const product = isRecord(raw.product) ? raw.product : {};
  const productSnapshot = isRecord(raw.productSnapshot) ? raw.productSnapshot : {};
  const name = getText(getFirstValue(
    raw.productName, raw.name, raw.nameSnapshot, raw.productNameSnapshot,
    productSnapshot.name, product.name,
  ), "Product");
  const quantity = getSafeNumber(raw.quantity);
  if (quantity < 1) return null;
  const unitPrice = getSafeNumber(getFirstValue(raw.unitPrice, raw.price));
  const lineTotal = getSafeNumber(
    getFirstValue(raw.lineTotal, raw.totalPrice, raw.subtotal),
    unitPrice * quantity,
  );
  const images = Array.isArray(product.images) ? product.images : [];
  const firstImage = isRecord(images[0]) ? images[0] : {};
  const imageUrl = getNullableText(getFirstValue(
    raw.productImageUrl, raw.imageUrl, raw.productImage, productSnapshot.imageUrl,
    product.imageUrl, firstImage.url,
  ));
  return {
    id: getText(raw.id, `${name}-${quantity}`),
    productId: getNullableText(raw.productId),
    name,
    imageUrl,
    unitPrice,
    quantity,
    lineTotal,
  };
}

function parseShipment(raw: unknown): SellerShipment | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.status !== "string") return null;
  return {
    id: raw.id,
    status: raw.status,
    courierName: getNullableText(raw.courierName),
    trackingCode: getNullableText(raw.trackingCode),
    trackingUrl: getNullableText(raw.trackingUrl),
    waybillUrl: getNullableText(raw.waybillUrl),
    estimatedDelivery: getNullableText(raw.estimatedDelivery),
    failureReason: getNullableText(raw.failureReason),
  };
}

function parseSellerOrder(raw: unknown): SellerOrder | null {
  if (!isRecord(raw)) return null;
  const parentOrder = isRecord(raw.order) ? raw.order : {};
  const buyer = isRecord(parentOrder.buyer) ? parentOrder.buyer : {};
  const status = raw.status;

  // Unknown statuses are excluded so the page never offers an unsafe transition.
  if (!isSellerOrderStatus(status)) return null;
  const id = getText(raw.id);
  if (!id) return null;

  const rawItems = Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.orderItems) ? raw.orderItems
      : Array.isArray(parentOrder.items) ? parentOrder.items : [];
  const items = rawItems.map(parseOrderItem).filter((item): item is SellerOrderItem => item !== null);
  const calculatedSubtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  const recipient = getNullableText(getFirstValue(parentOrder.deliveryRecipient, raw.deliveryRecipient));
  const buyerName = getText(getFirstValue(
    buyer.name, buyer.fullName, parentOrder.buyerName, raw.buyerName, recipient,
  ), "Buyer");
  const itemsSubtotal = getSafeNumber(
    getFirstValue(raw.subtotal, raw.itemsSubtotal, raw.totalAmount),
    calculatedSubtotal,
  );

  return {
    id,
    sellerOrderCode: getText(raw.sellerOrderCode, getText(raw.orderCode, id)),
    orderCode: getNullableText(parentOrder.orderCode),
    status,
    createdAt: getNullableText(getFirstValue(raw.createdAt, parentOrder.createdAt)),
    updatedAt: getNullableText(raw.updatedAt),
    buyerName,
    buyerPhone: getNullableText(getFirstValue(buyer.phone, buyer.phoneNumber, raw.buyerPhone)),
    buyerEmail: getNullableText(getFirstValue(buyer.email, raw.buyerEmail)),
    deliveryRecipient: recipient,
    deliveryPhone: getNullableText(getFirstValue(parentOrder.deliveryPhone, raw.deliveryPhone)),
    deliveryAddress: getNullableText(getFirstValue(parentOrder.deliveryAddress, raw.deliveryAddress)),
    deliveryArea: getNullableText(getFirstValue(parentOrder.deliveryArea, raw.deliveryArea)),
    deliveryLandmark: getNullableText(getFirstValue(parentOrder.deliveryLandmark, raw.deliveryLandmark)),
    deliveryNotes: getNullableText(getFirstValue(parentOrder.deliveryNotes, raw.deliveryNotes)),
    items,
    itemsSubtotal,
    shipments: Array.isArray(raw.shipments)
      ? raw.shipments.map(parseShipment).filter((shipment): shipment is SellerShipment => shipment !== null)
      : [],
  };
}

function parsePagination(raw: unknown, currentPage: number): Pagination {
  if (!isRecord(raw)) {
    return { page: currentPage, limit: PAGE_SIZE, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: currentPage > 1 };
  }
  const page = Math.max(1, getSafeNumber(raw.page, currentPage));
  const limit = Math.max(1, getSafeNumber(raw.limit, PAGE_SIZE));
  const total = getSafeNumber(raw.total);
  const totalPages = Math.max(1, getSafeNumber(raw.totalPages, Math.ceil(total / limit) || 1));
  return {
    page, limit, total, totalPages,
    hasNextPage: typeof raw.hasNextPage === "boolean" ? raw.hasNextPage : page < totalPages,
    hasPreviousPage: typeof raw.hasPreviousPage === "boolean" ? raw.hasPreviousPage : page > 1,
  };
}

function getNextAction(status: SellerOrderStatus): { nextStatus: SellerOrderStatus; label: string } | null {
  switch (status) {
    case "PENDING_ACCEPTANCE": return { nextStatus: "ACCEPTED", label: "Accept order" };
    case "ACCEPTED": return { nextStatus: "PROCESSING", label: "Start preparing" };
    case "PROCESSING": return { nextStatus: "READY_FOR_DISPATCH", label: "Ready for dispatch" };
    // Dispatch and delivery are confirmed by the courier webhook, not the seller UI.
    default: return null;
  }
}

function StatusBadge({ status }: { status: SellerOrderStatus }) {
  const style = STATUS_STYLES[status];
  return <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-bold ${style.className}`}>{style.label}</span>;
}

function SummaryCard({ title, value, description, icon }: {
  title: string; value: number; description: string; icon: ReactNode;
}) {
  return (
    <section className="rm-panel min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--rm-muted)]">{title}</p>
          <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-[var(--rm-ink)]">{value}</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--rm-muted)]">{description}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]">{icon}</span>
      </div>
    </section>
  );
}

function OrderItemRow({ item }: { item: SellerOrderItem }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)]">
        {item.imageUrl
          ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-contain p-0" />
          : <Package className="h-6 w-6 text-[var(--rm-coral-dark)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold text-[var(--rm-ink)]">{item.name}</p>
        <p className="mt-1 text-xs text-[var(--rm-muted)]">{formatMoney(item.unitPrice)} × {item.quantity}</p>
      </div>
      <p className="shrink-0 text-right text-sm font-bold tabular-nums text-[var(--rm-ink)]">{formatMoney(item.lineTotal)}</p>
    </div>
  );
}

function DetailRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-[var(--rm-coral-dark)]">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-[var(--rm-muted)]">{label}</p>
        <div className="mt-0.5 break-words text-sm font-semibold leading-5 text-[var(--rm-ink)]">{children}</div>
      </div>
    </div>
  );
}

function OrderCard({ order, activeOrderId, onUpdate, onBookShipment }: {
  order: SellerOrder;
  activeOrderId: string | null;
  onUpdate: (order: SellerOrder, nextStatus: SellerOrderStatus) => void;
  onBookShipment: (order: SellerOrder) => void;
}) {
  const nextAction = getNextAction(order.status);
  const latestShipment = order.shipments[0] ?? null;
  const canBookShipment = order.status === "READY_FOR_DISPATCH" &&
    (latestShipment === null || latestShipment.status === "FAILED");
  const isUpdating = activeOrderId === order.id;
  const anotherOrderIsUpdating = activeOrderId !== null && !isUpdating;

  const statusMessage: Record<SellerOrderStatus, string> = {
    PENDING_ACCEPTANCE: "Review this order and accept it. Rejection is temporarily unavailable while the refund workflow is being completed.",
    ACCEPTED: "You accepted this order. Start preparing the products.",
    PROCESSING: "Update the order when the products are ready for dispatch.",
    READY_FOR_DISPATCH: "Book the buyer-selected courier. Courier pickup and delivery events will update the order automatically.",
    DISPATCHED: "The courier has collected this parcel. Use the tracking link for delivery updates.",
    DELIVERED: "Delivery has been reported. The buyer must confirm receipt to complete the order.",
    COMPLETED: "This order has been completed.",
    REJECTED: "You rejected this order.",
    CANCELLED: "This order has been cancelled.",
  };

  return (
    <article className="rm-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--rm-border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="break-all text-sm font-extrabold text-[var(--rm-ink)] sm:text-base">{order.sellerOrderCode}</h3>
            <StatusBadge status={order.status} />
          </div>
          {order.orderCode && <p className="mt-1 text-xs text-[var(--rm-muted)]">Main order: {order.orderCode}</p>}
          <p className="mt-2 flex items-center gap-2 text-xs text-[var(--rm-muted)]"><CalendarDays className="h-3.5 w-3.5" />{formatDate(order.createdAt)}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-[11px] font-medium text-[var(--rm-muted)]">Your items subtotal</p>
          <p className="mt-1 text-xl font-extrabold tabular-nums text-[var(--rm-coral-dark)]">{formatMoney(order.itemsSubtotal)}</p>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
        <section className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h4 className="text-sm font-bold text-[var(--rm-ink)]">Products ordered</h4>
            <span className="text-[11px] text-[var(--rm-muted)]">{order.items.length} {order.items.length === 1 ? "product" : "products"}</span>
          </div>
          {order.items.length > 0
            ? <div className="divide-y divide-[var(--rm-border)]">{order.items.map((item) => <OrderItemRow key={item.id} item={item} />)}</div>
            : <p className="py-4 text-sm text-[var(--rm-muted)]">Product details are not available for this order.</p>}
        </section>

        <section className="rounded-xl bg-[var(--rm-surface-muted)] p-4 sm:p-5">
          <h4 className="mb-4 text-sm font-bold text-[var(--rm-ink)]">Buyer and delivery details</h4>
          <div className="space-y-4">
            <DetailRow icon={<UserRound className="h-4 w-4" />} label="Recipient">{order.deliveryRecipient || order.buyerName}</DetailRow>
            {order.deliveryPhone && <DetailRow icon={<Phone className="h-4 w-4" />} label="Delivery phone"><a href={`tel:${order.deliveryPhone}`} className="text-[var(--rm-coral-dark)] hover:underline">{order.deliveryPhone}</a></DetailRow>}
            {order.buyerPhone && order.buyerPhone !== order.deliveryPhone && <DetailRow icon={<Phone className="h-4 w-4" />} label="Buyer phone"><a href={`tel:${order.buyerPhone}`} className="text-[var(--rm-coral-dark)] hover:underline">{order.buyerPhone}</a></DetailRow>}
            {order.deliveryAddress && <DetailRow icon={<MapPin className="h-4 w-4" />} label="Delivery address">{order.deliveryAddress}</DetailRow>}
            {order.deliveryArea && <DetailRow icon={<MapPin className="h-4 w-4" />} label="Area">{order.deliveryArea}</DetailRow>}
            {order.deliveryLandmark && <DetailRow icon={<MapPin className="h-4 w-4" />} label="Nearby landmark">{order.deliveryLandmark}</DetailRow>}
            {order.deliveryNotes && <div className="border-t border-[var(--rm-border)] pt-3"><p className="text-[11px] font-medium text-[var(--rm-muted)]">Delivery notes</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--rm-text)]">{order.deliveryNotes}</p></div>}
          </div>
        </section>
      </div>

      {latestShipment && <section className="border-t border-[var(--rm-border)] bg-white px-4 py-4 sm:px-5" aria-label="Courier shipment">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[var(--rm-ink)]">Courier shipment · {latestShipment.status.replace(/_/g, " ").toLowerCase()}</p>
            <p className="mt-1 text-xs text-[var(--rm-muted)]">{latestShipment.courierName || "Courier details pending"}{latestShipment.trackingCode ? ` · Tracking ${latestShipment.trackingCode}` : ""}</p>
            {latestShipment.failureReason && <p className="mt-1 text-xs text-[var(--rm-red)]">{latestShipment.failureReason}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {latestShipment.trackingUrl && <a href={latestShipment.trackingUrl} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>Track shipment</a>}
            {latestShipment.waybillUrl && <a href={latestShipment.waybillUrl} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>View waybill</a>}
          </div>
        </div>
      </section>}

      <div className="flex flex-col gap-3 border-t border-[var(--rm-border)] bg-[var(--rm-surface-muted)]/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="max-w-3xl text-xs leading-5 text-[var(--rm-muted)]">{statusMessage[order.status]}</p>
        {nextAction && <button
          type="button"
          disabled={isUpdating || anotherOrderIsUpdating || order.items.length === 0}
          onClick={() => onUpdate(order, nextAction.nextStatus)}
          className={`${primaryButtonClass} w-full sm:w-auto`}
        >
          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {isUpdating ? "Updating..." : nextAction.label}
        </button>}
        {canBookShipment && <button type="button" disabled={isUpdating || anotherOrderIsUpdating || order.items.length === 0} onClick={() => onBookShipment(order)} className={`${primaryButtonClass} w-full sm:w-auto`}>
          {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
          {isUpdating ? "Booking courier..." : latestShipment?.status === "FAILED" ? "Retry courier booking" : "Book courier"}
        </button>}
      </div>
    </article>
  );
}

export default function SellerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false,
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async ({ refresh = false, signal }: LoadOptions = {}) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(pagination.page), limit: String(PAGE_SIZE) });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/seller/orders?${params.toString()}`, {
        method: "GET", cache: "no-store", headers: { Accept: "application/json" }, signal,
      });
      if (response.status === 401 || response.status === 403) {
        if (!signal?.aborted) { setRedirecting(true); router.replace("/seller/login"); }
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getErrorMessage(payload, "We could not load your orders. Please try again."));
      if (!isRecord(payload)) throw new Error("The server returned an invalid response.");
      const rawOrders = Array.isArray(payload.orders) ? payload.orders
        : Array.isArray(payload.sellerOrders) ? payload.sellerOrders : [];
      const parsedOrders = rawOrders.map(parseSellerOrder).filter((order): order is SellerOrder => order !== null);
      if (signal?.aborted) return;
      setOrders(parsedOrders);
      const rawStatusCounts = isRecord(payload.statusCounts) ? payload.statusCounts : {};
      const parsedStatusCounts: Record<string, number> = {};
      for (const [key, value] of Object.entries(rawStatusCounts)) {
        if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) parsedStatusCounts[key] = value;
      }
      setStatusCounts(parsedStatusCounts);
      setPagination(parsePagination(payload.pagination, pagination.page));
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Something went wrong while loading orders.");
    } finally {
      if (!signal?.aborted) { setLoading(false); setRefreshing(false); }
    }
  }, [pagination.page, statusFilter, search, router]);

  useEffect(() => {
    const controller = new AbortController();
    const delay = window.setTimeout(() => { void loadOrders({ signal: controller.signal }); }, search.trim() ? 300 : 0);
    return () => { window.clearTimeout(delay); controller.abort(); };
  }, [loadOrders, search]);

  const filteredOrders = orders;
  const pendingCount = statusCounts.PENDING_ACCEPTANCE ?? 0;
  const activeCount = ["ACCEPTED", "PROCESSING", "READY_FOR_DISPATCH", "DISPATCHED", "DELIVERED"].reduce((total, status) => total + (statusCounts[status] ?? 0), 0);
  const completedCount = statusCounts.COMPLETED ?? 0;

  async function updateOrderStatus(order: SellerOrder, nextStatus: SellerOrderStatus) {
    if (activeOrderId) return;
    setActiveOrderId(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/seller/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (response.status === 401 || response.status === 403) {
        setRedirecting(true);
        router.replace("/seller/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getErrorMessage(payload, "We could not update this order. Please try again."));
      setNotice(`${order.sellerOrderCode} has been updated successfully.`);
      await loadOrders({ refresh: true });
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Something went wrong while updating the order.");
    } finally {
      setActiveOrderId(null);
    }
  }

  async function bookShipment(order: SellerOrder) {
    const latestShipment = order.shipments[0] ?? null;
    if (activeOrderId || order.status !== "READY_FOR_DISPATCH" || (latestShipment !== null && latestShipment.status !== "FAILED")) return;
    setActiveOrderId(order.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/seller/orders/${encodeURIComponent(order.id)}/shipments`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        setRedirecting(true);
        router.replace("/seller/login");
        return;
      }
      if (!response.ok) throw new Error(getErrorMessage(payload, "We could not book the courier for this order."));
      setNotice(`${order.sellerOrderCode}: ${getText(isRecord(payload) ? payload.message : null, "Courier booking submitted.")}`);
      await loadOrders({ refresh: true });
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Unable to book the courier.");
    } finally {
      setActiveOrderId(null);
    }
  }

  function changeFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPagination((current) => ({ ...current, page: 1 }));
    setNotice("");
  }

  function changePage(nextPage: number) {
    setPagination((current) => ({ ...current, page: Math.max(1, nextPage) }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function logout() {
    await signOut({ callbackUrl: "/seller/login" });
  }

  if (redirecting) {
    return (
      <main className="rm-storefront flex min-h-dvh w-full items-center justify-center px-4">
        <div className="flex items-center gap-3 text-sm font-semibold text-[var(--rm-muted)]" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--rm-coral)]" />Redirecting to seller login...
        </div>
      </main>
    );
  }

  return (
    <main className="rm-storefront min-h-dvh w-full overflow-x-clip">
      <header className="rm-site-header sticky top-0 z-50 w-full">
        <div className="rm-container flex min-h-[68px] items-center justify-between gap-3">
          <Link href="/seller" className="rm-brand flex shrink-0 items-center gap-2.5" aria-label="ReMarket Seller Portal home">
            <span className="rm-brand-mark grid h-10 w-10 place-items-center"><Store className="h-5 w-5" /></span>
            <span><span className="block text-sm font-extrabold tracking-tight">ReMarket</span><span className="mt-0.5 block text-[10px] leading-none text-[var(--rm-muted)]">Seller Portal</span></span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Seller navigation">
            <Link href="/seller" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--rm-text)] transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><Store className="h-4 w-4" />Dashboard</Link>
            <Link href="/seller#products-section" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--rm-text)] transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><Package className="h-4 w-4" />Products</Link>
            <Link href="/seller/orders" aria-current="page" className="inline-flex items-center gap-2 rounded-xl bg-[var(--rm-coral-soft)] px-3 py-2.5 text-xs font-bold text-[var(--rm-coral-dark)]"><ClipboardCheck className="h-4 w-4" />Orders</Link><Link href="/seller/insights" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--rm-text)] transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><BarChart3 className="h-4 w-4" />Insights</Link>
            <Link href="/seller#orders-section" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--rm-text)] transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><Truck className="h-4 w-4" />Inventory overview</Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <div className="relative z-[100] shrink-0"><NotificationBell /></div>
            <details className="group relative hidden sm:block">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-[var(--rm-border-strong)] bg-white px-3 text-xs font-bold text-[var(--rm-text)] transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)] [&::-webkit-details-marker]:hidden">
                <UserRound className="h-4 w-4" /><span>Account</span><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 top-full z-[120] mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--rm-border)] bg-white p-2 shadow-[0_18px_45px_rgba(23,32,42,0.14)]">
                <div className="border-b border-[var(--rm-border)] px-3 py-3"><p className="text-xs font-bold text-[var(--rm-ink)]">Your ReMarket account</p><p className="mt-1 text-[10px] leading-4 text-[var(--rm-muted)]">Manage your buyer and seller activities.</p></div>
                <div className="grid gap-1 py-2">
                  <Link href="/account" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><UserRound className="h-4 w-4 text-[var(--rm-muted)]" />Account overview</Link>
                  <Link href="/saved" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><Bookmark className="h-4 w-4 text-[var(--rm-muted)]" />Saved items</Link>
                  <Link href="/seller/profile" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><Store className="h-4 w-4 text-[var(--rm-muted)]" />Seller profile</Link>
                  
                  <Link href="/seller#products-section" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><Package className="h-4 w-4 text-[var(--rm-muted)]" />Manage products</Link>
                  <Link href="/seller/orders" className="flex items-center gap-3 rounded-xl bg-[var(--rm-coral-soft)] px-3 py-2.5 text-xs font-bold text-[var(--rm-coral-dark)]"><ClipboardCheck className="h-4 w-4" />Manage orders</Link>
                </div>
                <div className="border-t border-[var(--rm-border)] pt-2"><button type="button" onClick={() => void logout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[var(--rm-red)] hover:bg-[var(--rm-red-bg)]"><LogOut className="h-4 w-4" />Sign out</button></div>
              </div>
            </details>
            <button type="button" onClick={() => void logout()} className={`${secondaryButtonClass} hidden !min-h-10 !px-3 md:inline-flex`}><LogOut className="h-4 w-4" /><span>Log out</span></button>
            <button type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-expanded={mobileNavOpen} aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"} className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--rm-border-strong)] text-[var(--rm-text)] sm:hidden">
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {mobileNavOpen && <nav className="absolute left-0 right-0 top-full z-[110] grid max-h-[calc(100dvh-68px)] gap-1 overflow-y-auto border-b border-[var(--rm-border)] bg-white p-3 shadow-lg sm:hidden" aria-label="Mobile account and seller navigation">
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--rm-muted)]">Seller workspace</p>
            <Link onClick={() => setMobileNavOpen(false)} href="/seller" className="rounded-xl px-4 py-3 text-sm font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)]">Dashboard</Link>
            <Link onClick={() => setMobileNavOpen(false)} href="/seller#products-section" className="rounded-xl px-4 py-3 text-sm font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)]">Manage products</Link>
            <Link onClick={() => setMobileNavOpen(false)} href="/seller/orders" className="rounded-xl bg-[var(--rm-coral-soft)] px-4 py-3 text-sm font-bold text-[var(--rm-coral-dark)]">Manage orders</Link><Link onClick={() => setMobileNavOpen(false)} href="/seller/insights" className="rounded-xl px-4 py-3 text-sm font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)]">Insights</Link>
            <Link onClick={() => setMobileNavOpen(false)} href="/seller#orders-section" className="rounded-xl px-4 py-3 text-sm font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)]">Inventory overview</Link>
            <Link onClick={() => setMobileNavOpen(false)} href="/seller/profile" className="rounded-xl px-4 py-3 text-sm font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)]">Seller profile</Link>
            
            <div className="my-1 border-t border-[var(--rm-border)]" />
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--rm-muted)]">Your account</p>
            <Link onClick={() => setMobileNavOpen(false)} href="/account" className="rounded-xl px-4 py-3 text-sm font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)]">Account overview</Link>
            <Link onClick={() => setMobileNavOpen(false)} href="/saved" className="rounded-xl px-4 py-3 text-sm font-medium text-[var(--rm-text)] hover:bg-[var(--rm-cream)]">Saved items</Link>
            <div className="my-1 border-t border-[var(--rm-border)]" />
            <button type="button" onClick={() => void logout()} className="flex items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-bold text-[var(--rm-red)] hover:bg-[var(--rm-red-bg)]"><LogOut className="h-4 w-4" />Sign out</button>
          </nav>}
        </div>
      </header>

      <div className="rm-container py-6 sm:py-8">
        <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href="/seller" className="rm-text-link mb-3"><ChevronLeft className="h-4 w-4" />Back to dashboard</Link>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--rm-coral-dark)]">Seller workspace</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--rm-ink)] sm:text-3xl lg:text-4xl">Manage your orders</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--rm-muted)]">Review incoming orders, prepare products and keep buyers updated as their orders move through delivery.</p>
          </div>
          <button type="button" onClick={() => void loadOrders({ refresh: true })} disabled={loading || refreshing} className={`${secondaryButtonClass} min-h-11 self-start xl:self-auto`}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh orders
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard title="New orders" value={pendingCount} description="Across all matching orders" icon={<Clock3 className="h-5 w-5" />} />
          <SummaryCard title="In progress" value={activeCount} description="Across all matching orders" icon={<Truck className="h-5 w-5" />} />
          <SummaryCard title="Completed" value={completedCount} description="Across all matching orders" icon={<CheckCircle2 className="h-5 w-5" />} />
        </div>

        <section className="rm-panel mt-6 p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-extrabold text-[var(--rm-ink)]">Your orders</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--rm-muted)]">Search all your orders or filter them by status.</p>
            </div>
            <label className="relative block">
              <span className="sr-only">Search orders</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--rm-subtle)]" />
              <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPagination((current) => ({ ...current, page: 1 })); }} placeholder="Search order code, buyer, address or product..." className="rm-input h-11 w-full pl-10 pr-4 text-sm" />
            </label>
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--rm-text)]">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]"><Package className="h-4 w-4" /></span>Filter by order status
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {STATUS_FILTERS.map((filter) => {
                const selected = statusFilter === filter.value;
                return <button key={filter.value} type="button" onClick={() => changeFilter(filter.value)} aria-pressed={selected} className={`shrink-0 rounded-full border px-4 py-2.5 text-xs font-bold transition ${selected ? "border-[var(--rm-coral)] bg-[var(--rm-coral)] text-white" : "border-[var(--rm-border)] bg-white text-[var(--rm-text)] hover:border-[var(--rm-coral)] hover:bg-[var(--rm-coral-soft)] hover:text-[var(--rm-coral-dark)]"}`}>{filter.label}</button>;
              })}
            </div>
          </div>
        </section>

        {error && <div role="alert" aria-live="polite" className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--rm-red)]/20 bg-[var(--rm-red-bg)] p-4 text-sm text-[var(--rm-red)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><p>{error}</p></div>}
        {notice && <div role="status" aria-live="polite" className="mt-5 flex items-start gap-3 rounded-xl border border-[var(--rm-green)]/20 bg-[var(--rm-green-bg)] p-4 text-sm text-[var(--rm-green)]"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p>{notice}</p></div>}

        {loading ? (
          <div role="status" aria-busy="true" className="rm-panel mt-6 flex min-h-64 flex-col items-center justify-center px-5 py-10 text-sm font-semibold text-[var(--rm-muted)]">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--rm-coral)]" /><p className="mt-3">Loading your orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <section className="rm-panel rm-empty-state mt-6 border-dashed px-5 py-14">
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]">{search || statusFilter !== "ALL" ? <Search className="h-6 w-6" /> : <Package className="h-6 w-6" />}</span>
            <h3>{search || statusFilter !== "ALL" ? "No matching orders" : "No orders yet"}</h3>
            <p>{search || statusFilter !== "ALL" ? "Try another search term or choose a different order status." : "When buyers place orders for your products, they will appear here for you to manage."}</p>
            {(search || statusFilter !== "ALL") && <button type="button" onClick={() => { setSearch(""); changeFilter("ALL"); }} className="rm-button rm-button-secondary mt-5">Clear filters</button>}
          </section>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className="font-semibold text-[var(--rm-text)]">Showing {filteredOrders.length} of {pagination.total} matching {pagination.total === 1 ? "order" : "orders"}</p>
              <span className="text-[var(--rm-muted)]">Newest orders first</span>
            </div>
            {filteredOrders.map((order) => <OrderCard key={order.id} order={order} activeOrderId={activeOrderId} onUpdate={(item, nextStatus) => { void updateOrderStatus(item, nextStatus); }} onBookShipment={(item) => { void bookShipment(item); }} />)}
          </div>
        )}

        {!loading && pagination.totalPages > 1 && (
          <nav aria-label="Seller order pages" className="mt-7 flex flex-col gap-3 border-t border-[var(--rm-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-[var(--rm-ink)]">Page {pagination.page} of {pagination.totalPages}</p>
              <p className="mt-1 text-[11px] text-[var(--rm-muted)]">{pagination.total.toLocaleString("en-NG")} total orders</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!pagination.hasPreviousPage || loading || refreshing} onClick={() => changePage(pagination.page - 1)} className={secondaryButtonClass}><ChevronLeft className="h-4 w-4" />Previous</button>
              <button type="button" disabled={!pagination.hasNextPage || loading || refreshing} onClick={() => changePage(pagination.page + 1)} className={secondaryButtonClass}>Next<ChevronRight className="h-4 w-4" /></button>
            </div>
          </nav>
        )}

        <section className="mt-7 rounded-2xl border border-[var(--rm-coral)]/20 bg-[var(--rm-coral-soft)] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--rm-coral-dark)]"><Truck className="h-5 w-5" /></span>
            <div><h3 className="text-sm font-extrabold text-[var(--rm-coral-dark)]">Order completion</h3><p className="mt-1 text-sm leading-6 text-[var(--rm-coral-dark)]">The courier reports dispatch and delivery. After delivery is confirmed, the buyer can confirm receipt to complete the order.</p></div>
          </div>
        </section>

        <footer className="mt-8 border-t border-[var(--rm-border)] py-5">
          <div className="flex flex-col gap-3 text-[11px] text-[var(--rm-muted)] sm:flex-row sm:items-center sm:justify-between">
            <p>ReMarket Seller Portal · Find it nearby.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <Link href="/seller" className="hover:text-[var(--rm-coral-dark)]">Dashboard</Link>
              <Link href="/seller/profile" className="hover:text-[var(--rm-coral-dark)]">Profile settings</Link>
              
              <button type="button" onClick={() => void logout()} className="text-left hover:text-[var(--rm-coral-dark)]">Sign out</button>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
