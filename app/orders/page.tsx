"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Package,
  PackageOpen,
  RefreshCw,
  ShoppingBag,
  Store,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

/* =========================================================
   CONSTANTS
========================================================= */

const ORDERS_PER_PAGE = 10;

type DeliveryFeeStatus = "UNCONFIRMED" | "CONFIRMED";

/* =========================================================
   TYPES
========================================================= */

type OrderItemPreview = {
  id: string;
  productName: string;
  productImageUrl: string | null;
  quantity: number;
  lineTotal: number;
};

type SellerOrderPreview = {
  id: string;
  sellerOrderCode: string;
  status: string;
  subtotal: number;
  business: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
  items: OrderItemPreview[];
};

type BuyerOrder = {
  id: string;
  orderCode: string;
  status: string;
  itemsSubtotal: number;
  deliveryFee: number;
  totalAmount: number;
  deliveryFeeStatus: DeliveryFeeStatus;
  currency: string;
  createdAt: string;
  sellerOrders: SellerOrderPreview[];
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

/* =========================================================
   HELPERS
========================================================= */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSafeInteger(value: unknown, minimum = 0): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    return null;
  }
  return value;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* =========================================================
   STATUS LABELS AND STYLES
========================================================= */

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PLACED: "Order placed",
    PARTIALLY_ACCEPTED: "Partially accepted",
    CONFIRMED: "Confirmed",
    PROCESSING: "Processing",
    PARTIALLY_DISPATCHED: "Partially dispatched",
    DISPATCHED: "Dispatched",
    COMPLETED: "Completed",
    PARTIALLY_CANCELLED: "Partially cancelled",
    CANCELLED: "Cancelled",
    PENDING_ACCEPTANCE: "Awaiting seller",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    READY_FOR_DISPATCH: "Ready for dispatch",
    DELIVERED: "Delivered",
    PENDING: "Payment pending",
    INITIATED: "Payment initiated",
    SUCCESS: "Payment successful",
    FAILED: "Payment failed",
    REFUNDED: "Refunded",
    PARTIALLY_REFUNDED: "Partially refunded",
  };

  return labels[status] ?? status.replaceAll("_", " ").toLowerCase();
}

function getStatusClass(status: string): string {
  if (["COMPLETED", "DELIVERED", "SUCCESS", "CONFIRMED"].includes(status)) {
    return "bg-[var(--rm-green-bg)] text-[var(--rm-green)]";
  }

  if (["CANCELLED", "PARTIALLY_CANCELLED", "REJECTED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(status)) {
    return "bg-[var(--rm-red-bg)] text-[var(--rm-red)]";
  }

  if (["DISPATCHED", "PARTIALLY_DISPATCHED", "READY_FOR_DISPATCH"].includes(status)) {
    return "bg-[#DBEAFE] text-[#1D4ED8]";
  }

  return "bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]";
}

function getOrderStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    PLACED: "Your order has been submitted and is awaiting seller responses.",
    PARTIALLY_ACCEPTED: "Some sellers have accepted your order. Others are yet to respond.",
    CONFIRMED: "The relevant sellers have accepted your order.",
    PROCESSING: "Your products are being prepared by the sellers.",
    PARTIALLY_DISPATCHED: "Some products have been dispatched.",
    DISPATCHED: "Your products have been dispatched.",
    COMPLETED: "Your order has been completed.",
    PARTIALLY_CANCELLED: "Some parts of your order were cancelled or rejected.",
    CANCELLED: "This order has been cancelled.",
  };

  return descriptions[status] ?? "View your order for more details.";
}

/* =========================================================
   RESPONSE PARSERS
========================================================= */

function parseOrderItems(value: unknown): OrderItemPreview[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((rawItem): OrderItemPreview[] => {
    if (!isRecord(rawItem)) return [];

    const id = rawItem.id;
    const productName = rawItem.productName;
    const quantity = getSafeInteger(rawItem.quantity, 1);
    const lineTotal = getSafeInteger(rawItem.lineTotal);

    if (
      typeof id !== "string" ||
      typeof productName !== "string" ||
      quantity === null ||
      lineTotal === null
    ) {
      return [];
    }

    return [{
      id,
      productName,
      productImageUrl: typeof rawItem.productImageUrl === "string" ? rawItem.productImageUrl : null,
      quantity,
      lineTotal,
    }];
  });
}

function parseSellerOrders(value: unknown): SellerOrderPreview[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((rawSeller): SellerOrderPreview[] => {
    if (!isRecord(rawSeller) || !isRecord(rawSeller.business)) return [];

    const business = rawSeller.business;
    const sellerId = rawSeller.id;
    const sellerOrderCode = rawSeller.sellerOrderCode;
    const sellerStatus = rawSeller.status;
    const sellerSubtotal = getSafeInteger(rawSeller.subtotal);
    const businessId = business.id;
    const businessName = business.name;

    if (
      typeof sellerId !== "string" ||
      typeof sellerOrderCode !== "string" ||
      typeof sellerStatus !== "string" ||
      sellerSubtotal === null ||
      typeof businessId !== "string" ||
      typeof businessName !== "string"
    ) {
      return [];
    }

    return [{
      id: sellerId,
      sellerOrderCode,
      status: sellerStatus,
      subtotal: sellerSubtotal,
      business: {
        id: businessId,
        name: businessName,
        imageUrl: typeof business.imageUrl === "string" ? business.imageUrl : null,
      },
      items: parseOrderItems(rawSeller.items),
    }];
  });
}

function parseOrders(value: unknown): BuyerOrder[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((rawOrder): BuyerOrder[] => {
    if (!isRecord(rawOrder)) return [];

    const id = rawOrder.id;
    const orderCode = rawOrder.orderCode;
    const status = rawOrder.status;
    const createdAt = rawOrder.createdAt;
    const itemsSubtotal = getSafeInteger(rawOrder.itemsSubtotal);
    const deliveryFee = getSafeInteger(rawOrder.deliveryFee);
    const totalAmount = getSafeInteger(rawOrder.totalAmount);

    if (
      typeof id !== "string" ||
      typeof orderCode !== "string" ||
      typeof status !== "string" ||
      typeof createdAt !== "string" ||
      !isValidDate(createdAt) ||
      itemsSubtotal === null ||
      deliveryFee === null ||
      totalAmount === null
    ) {
      return [];
    }

    const calculatedTotal = itemsSubtotal + deliveryFee;
    if (!Number.isSafeInteger(calculatedTotal) || totalAmount !== calculatedTotal) return [];

    // Unknown or missing delivery-fee status remains provisional.
    const deliveryFeeStatus: DeliveryFeeStatus = rawOrder.deliveryFeeStatus === "CONFIRMED"
      ? "CONFIRMED"
      : "UNCONFIRMED";

    return [{
      id,
      orderCode,
      status,
      itemsSubtotal,
      deliveryFee,
      totalAmount,
      deliveryFeeStatus,
      currency: typeof rawOrder.currency === "string" ? rawOrder.currency : "NGN",
      createdAt,
      sellerOrders: parseSellerOrders(rawOrder.sellerOrders),
    }];
  });
}

function parsePagination(value: unknown): Pagination {
  const fallback: Pagination = {
    page: 1,
    limit: ORDERS_PER_PAGE,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  if (!isRecord(value)) return fallback;

  const page = getSafeInteger(value.page, 1);
  const limit = getSafeInteger(value.limit, 1);
  const total = getSafeInteger(value.total);
  const totalPages = getSafeInteger(value.totalPages);

  if (page === null || limit === null || total === null || totalPages === null) return fallback;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: value.hasNextPage === true,
    hasPreviousPage: value.hasPreviousPage === true,
  };
}

/* =========================================================
   ORDER CARD
========================================================= */

function OrderCard({ order }: { order: BuyerOrder }) {
  const productCount = order.sellerOrders.reduce(
    (sum, sellerOrder) => sum + sellerOrder.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0,
  );
  const allItems = order.sellerOrders.flatMap((sellerOrder) => sellerOrder.items);
  const firstItems = allItems.slice(0, 4);
  const extraProducts = Math.max(0, allItems.length - firstItems.length);
  const deliveryConfirmed = order.deliveryFeeStatus === "CONFIRMED";
  const displayAmount = deliveryConfirmed ? order.totalAmount : order.itemsSubtotal;
  const amountLabel = deliveryConfirmed ? "Order total" : "Products subtotal";

  return (
    <article className="rm-panel overflow-hidden transition-shadow duration-150 hover:shadow-[var(--rm-shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rm-border)] bg-[var(--rm-surface-muted)] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-[var(--rm-muted)]">Order reference</p>
          <p className="mt-1 break-all text-sm font-bold tracking-[0.01em] text-[var(--rm-coral-dark)]">{order.orderCode}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-[10px] font-bold ${getStatusClass(order.status)}`}>
          {getStatusLabel(order.status)}
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--rm-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-[var(--rm-coral-dark)]" />
            {formatDate(order.createdAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Package className="h-4 w-4 text-[var(--rm-coral-dark)]" />
            {productCount} {productCount === 1 ? "item" : "items"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Store className="h-4 w-4 text-[var(--rm-coral-dark)]" />
            {order.sellerOrders.length} {order.sellerOrders.length === 1 ? "seller" : "sellers"}
          </span>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] px-3 py-3">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rm-coral-dark)]" />
          <p className="text-xs leading-5 text-[var(--rm-muted)]">{getOrderStatusDescription(order.status)}</p>
        </div>

        {firstItems.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-bold text-[var(--rm-text)]">Products ordered</p>
              <span className="text-[11px] text-[var(--rm-muted)]">{allItems.length} {allItems.length === 1 ? "product" : "products"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {firstItems.map((item) => (
                <div
                  key={item.id}
                  className="relative flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface-muted)]"
                  title={`${item.productName} × ${item.quantity}`}
                >
                  {item.productImageUrl ? (
                    <img src={item.productImageUrl} alt={item.productName} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-5 w-5 text-[var(--rm-subtle)]" />
                  )}
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">×{item.quantity}</span>
                </div>
              ))}
              {extraProducts > 0 && (
                <div className="flex h-[68px] w-[68px] items-center justify-center rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] text-sm font-bold text-[var(--rm-muted)]">
                  +{extraProducts}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-[var(--rm-border)] pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[var(--rm-ink)]">Seller fulfilment</h3>
            <span className="text-[11px] text-[var(--rm-muted)]">Tracked separately</span>
          </div>
          {order.sellerOrders.length > 0 ? (
            <div className="space-y-2">
              {order.sellerOrders.map((sellerOrder) => (
                <div key={sellerOrder.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--rm-border)] px-3 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] text-[var(--rm-coral-dark)]">
                      {sellerOrder.business.imageUrl ? (
                        <img src={sellerOrder.business.imageUrl} alt={sellerOrder.business.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <Store className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[var(--rm-text)]">{sellerOrder.business.name}</p>
                      <p className="mt-0.5 break-all text-[10px] text-[var(--rm-muted)]">{sellerOrder.sellerOrderCode}</p>
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${getStatusClass(sellerOrder.status)}`}>
                    {getStatusLabel(sellerOrder.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-[var(--rm-surface-muted)] px-3 py-3 text-xs text-[var(--rm-muted)]">Seller details are not available yet.</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-[var(--rm-border)] pt-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--rm-muted)]">{amountLabel}</p>
            <p className="mt-1 text-xl font-extrabold tracking-tight text-[var(--rm-coral-dark)]">{formatNaira(displayAmount)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--rm-muted)]">
              <span>Products: {formatNaira(order.itemsSubtotal)}</span>
              <span>Delivery: {deliveryConfirmed ? formatNaira(order.deliveryFee) : "To be confirmed"}</span>
            </div>
            {!deliveryConfirmed && (
              <p className="mt-1.5 text-[10px] leading-4 text-[var(--rm-yellow)]">Delivery charges are not included in this subtotal.</p>
            )}
          </div>
          <Link href={`/orders/${encodeURIComponent(order.id)}`} className="rm-button rm-button-primary min-h-10 shrink-0">
            View order <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* =========================================================
   MAIN ORDERS PAGE
========================================================= */

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: ORDERS_PER_PAGE,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const loadOrders = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/orders?page=${pagination.page}&limit=${ORDERS_PER_PAGE}`, {
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
        throw new Error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Unable to load your orders.",
        );
      }
      if (!isRecord(payload)) throw new Error("Invalid orders response.");
      if (signal.aborted) return;

      setOrders(parseOrders(payload.orders));
      setPagination(parsePagination(payload.pagination));
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      if (!signal.aborted) {
        console.error("Buyer orders loading error:", loadError);
        setError(loadError instanceof Error ? loadError.message : "Unable to load your orders.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [pagination.page, router]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrders(controller.signal);
    return () => controller.abort();
  }, [loadOrders, refreshKey]);

  function retryLoading() {
    setRefreshKey((current) => current + 1);
  }

  function goToPreviousPage() {
    if (!pagination.hasPreviousPage || loading) return;
    setPagination((current) => ({ ...current, page: Math.max(1, current.page - 1) }));
  }

  function goToNextPage() {
    if (!pagination.hasNextPage || loading) return;
    setPagination((current) => ({ ...current, page: current.page + 1 }));
  }

  const firstVisibleOrder = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const lastVisibleOrder = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />
      <main id="main-content" className="rm-storefront pb-28 lg:pb-10">
        <div className="rm-container max-w-[1200px] pb-10 pt-5 sm:pt-6 lg:pt-8">
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-xs text-[var(--rm-muted)]">
            <Link href="/" className="hover:text-[var(--rm-coral-dark)]">Home</Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span aria-current="page" className="font-semibold text-[var(--rm-ink)]">My orders</span>
          </nav>

          <section className="mb-7 flex flex-col gap-4 border-b border-[var(--rm-border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--rm-coral-dark)]">Your purchases</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--rm-ink)] sm:text-3xl">My orders</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--rm-muted)]">
                View your purchases, check seller responses, and follow each order through fulfilment.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex min-h-11 items-center gap-3 rounded-lg border border-[var(--rm-border)] bg-white px-3.5 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]">
                  <Package className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[10px] font-medium text-[var(--rm-muted)]">All orders</span>
                  <span className="block text-sm font-bold tabular-nums text-[var(--rm-ink)]">{pagination.total}</span>
                </span>
              </div>
              <Link href="/shop" className="rm-button rm-button-primary min-h-11">
                <ShoppingBag className="h-4 w-4" /> Continue shopping
              </Link>
            </div>
          </section>

          <div className="rm-section-heading">
            <div>
              <h2 className="rm-section-title">Purchase history</h2>
              <p className="rm-section-subtitle">Your recent purchases and order updates.</p>
            </div>
            {!loading && !error && orders.length > 0 && (
              <span className="text-xs text-[var(--rm-muted)]">Newest orders first</span>
            )}
          </div>

          {error && (
            <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--rm-red)]/20 bg-[var(--rm-red-bg)] px-4 py-3 text-sm text-[var(--rm-red)]">
              <span>{error}</span>
              <button type="button" onClick={retryLoading} className="inline-flex items-center gap-1.5 font-bold hover:underline">
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            </div>
          )}

          {loading ? (
            <div role="status" className="rm-panel flex min-h-[260px] flex-col items-center justify-center gap-3 px-5 py-10 text-sm font-medium text-[var(--rm-muted)]">
              <LoaderCircle className="h-6 w-6 animate-spin text-[var(--rm-coral)]" />
              Loading your orders...
            </div>
          ) : error && orders.length === 0 ? (
            <section className="rm-panel mx-auto max-w-lg px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--rm-surface-muted)] text-[var(--rm-coral-dark)]">
                <PackageOpen className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-[var(--rm-ink)]">Unable to display your orders</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--rm-muted)]">Please check your connection and try again.</p>
              <button type="button" onClick={retryLoading} className="rm-button rm-button-primary mt-5">
                <RefreshCw className="h-4 w-4" /> Try again
              </button>
            </section>
          ) : orders.length === 0 ? (
            <section className="rm-panel mx-auto max-w-lg px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--rm-surface-muted)] text-[var(--rm-coral-dark)]">
                <PackageOpen className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-[var(--rm-ink)]">No orders yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--rm-muted)]">
                When you place an order on ReMarket, it will appear here. You can then follow each seller&apos;s response and fulfilment progress.
              </p>
              <Link href="/shop" className="rm-button rm-button-primary mt-5">
                <ShoppingBag className="h-4 w-4" /> Explore products
              </Link>
            </section>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                <p className="font-semibold text-[var(--rm-text)]">
                  Showing {firstVisibleOrder}–{lastVisibleOrder} of {pagination.total} {pagination.total === 1 ? "order" : "orders"}
                </p>
                <span className="text-[var(--rm-muted)]">Newest orders first</span>
              </div>

              <div className="space-y-4">
                {orders.map((order) => <OrderCard key={order.id} order={order} />)}
              </div>

              {pagination.totalPages > 1 && (
                <nav aria-label="Order pages" className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rm-border)] pt-5">
                  <div>
                    <p className="text-xs font-semibold text-[var(--rm-text)]">Page {pagination.page} of {pagination.totalPages}</p>
                    <p className="mt-1 text-[11px] text-[var(--rm-muted)]">Browse your previous purchases.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!pagination.hasPreviousPage || loading}
                      onClick={goToPreviousPage}
                      className="rm-button rm-button-secondary min-h-10 px-3 text-xs disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" /> Previous
                    </button>
                    <button
                      type="button"
                      disabled={!pagination.hasNextPage || loading}
                      onClick={goToNextPage}
                      className="rm-button rm-button-secondary min-h-10 px-3 text-xs disabled:opacity-40"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}

          <footer className="mt-10 flex items-center justify-center gap-3 pb-4 text-[11px] text-[var(--rm-muted)]">
            <span className="h-px w-10 bg-[var(--rm-border)]" />
            <span>ReMarket · Find it nearby</span>
            <span className="h-px w-10 bg-[var(--rm-border)]" />
          </footer>
        </div>
      </main>
      <MobileBottomNav />
    </>
  );
}
