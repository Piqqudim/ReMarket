"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
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

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getSafeInteger(
  value: unknown,
  minimum = 0,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    return null;
  }

  return value;
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

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* =========================================================
   STATUS LABELS
========================================================= */

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    // Parent order statuses
    PLACED: "Order placed",
    PARTIALLY_ACCEPTED: "Partially accepted",
    CONFIRMED: "Confirmed",
    PROCESSING: "Processing",
    PARTIALLY_DISPATCHED: "Partially dispatched",
    DISPATCHED: "Dispatched",
    COMPLETED: "Completed",
    PARTIALLY_CANCELLED: "Partially cancelled",
    CANCELLED: "Cancelled",

    // Seller order statuses
    PENDING_ACCEPTANCE: "Awaiting seller",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    READY_FOR_DISPATCH: "Ready for dispatch",
    DELIVERED: "Delivered",
  };

  return (
    labels[status] ??
    status.replaceAll("_", " ").toLowerCase()
  );
}

/* =========================================================
   STATUS COLOURS
========================================================= */

function getStatusClass(status: string): string {
  if (
    ["COMPLETED", "DELIVERED"].includes(status)
  ) {
    return "bg-[#DCFCE7] text-[#166534]";
  }

  if (
    ["CANCELLED", "REJECTED"].includes(status)
  ) {
    return "bg-[#FEE2E2] text-[#B42318]";
  }

  if (
    ["DISPATCHED", "PARTIALLY_DISPATCHED", "READY_FOR_DISPATCH"].includes(status)
  ) {
    return "bg-[#DBEAFE] text-[#1D4ED8]";
  }

  return "bg-[#FFF1ED] text-[#9F2D18]";
}

/* =========================================================
   ORDER ITEM PARSER
========================================================= */

function parseOrderItems(
  value: unknown,
): OrderItemPreview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(
    (rawItem): OrderItemPreview[] => {
      if (!isRecord(rawItem)) {
        return [];
      }

      const id = rawItem.id;
      const productName = rawItem.productName;

      const quantity = getSafeInteger(
        rawItem.quantity,
        1,
      );

      const lineTotal = getSafeInteger(
        rawItem.lineTotal,
      );

      if (
        typeof id !== "string" ||
        typeof productName !== "string" ||
        quantity === null ||
        lineTotal === null
      ) {
        return [];
      }

      return [
        {
          id,
          productName,

          productImageUrl:
            typeof rawItem.productImageUrl === "string"
              ? rawItem.productImageUrl
              : null,

          quantity,
          lineTotal,
        },
      ];
    },
  );
}

/* =========================================================
   SELLER ORDER PARSER
========================================================= */

function parseSellerOrders(
  value: unknown,
): SellerOrderPreview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(
    (rawSeller): SellerOrderPreview[] => {
      if (
        !isRecord(rawSeller) ||
        !isRecord(rawSeller.business)
      ) {
        return [];
      }

      const business = rawSeller.business;

      const sellerId = rawSeller.id;
      const sellerOrderCode = rawSeller.sellerOrderCode;
      const sellerStatus = rawSeller.status;

      const sellerSubtotal = getSafeInteger(
        rawSeller.subtotal,
      );

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

      return [
        {
          id: sellerId,
          sellerOrderCode,
          status: sellerStatus,
          subtotal: sellerSubtotal,

          business: {
            id: businessId,
            name: businessName,

            imageUrl:
              typeof business.imageUrl === "string"
                ? business.imageUrl
                : null,
          },

          items: parseOrderItems(rawSeller.items),
        },
      ];
    },
  );
}

/* =========================================================
   PARENT ORDER PARSER
========================================================= */

function parseOrders(
  value: unknown,
): BuyerOrder[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(
    (rawOrder): BuyerOrder[] => {
      if (!isRecord(rawOrder)) {
        return [];
      }

      const id = rawOrder.id;
      const orderCode = rawOrder.orderCode;
      const status = rawOrder.status;
      const createdAt = rawOrder.createdAt;

      const itemsSubtotal = getSafeInteger(
        rawOrder.itemsSubtotal,
      );

      const deliveryFee = getSafeInteger(
        rawOrder.deliveryFee,
      );

      const totalAmount = getSafeInteger(
        rawOrder.totalAmount,
      );

      if (
        typeof id !== "string" ||
        typeof orderCode !== "string" ||
        typeof status !== "string" ||
        typeof createdAt !== "string" ||
        itemsSubtotal === null ||
        deliveryFee === null ||
        totalAmount === null ||
        Number.isNaN(new Date(createdAt).getTime())
      ) {
        return [];
      }

      const sellerOrders = parseSellerOrders(
        rawOrder.sellerOrders,
      );

      return [
        {
          id,
          orderCode,
          status,

          itemsSubtotal,
          deliveryFee,
          totalAmount,

          currency:
            typeof rawOrder.currency === "string"
              ? rawOrder.currency
              : "NGN",

          createdAt,
          sellerOrders,
        },
      ];
    },
  );
}

/* =========================================================
   PAGINATION PARSER
========================================================= */

function parsePagination(
  value: unknown,
): Pagination {
  const fallback: Pagination = {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  if (!isRecord(value)) {
    return fallback;
  }

  const page = getSafeInteger(value.page, 1);
  const limit = getSafeInteger(value.limit, 1);
  const total = getSafeInteger(value.total);
  const totalPages = getSafeInteger(value.totalPages);

  if (
    page === null ||
    limit === null ||
    total === null ||
    totalPages === null
  ) {
    return fallback;
  }

  return {
    page,
    limit,
    total,
    totalPages,

    hasNextPage:
      value.hasNextPage === true,

    hasPreviousPage:
      value.hasPreviousPage === true,
  };
}

/* =========================================================
   ORDER CARD
========================================================= */

function OrderCard({
  order,
}: {
  order: BuyerOrder;
}) {
  const productCount = order.sellerOrders.reduce(
    (sum, sellerOrder) =>
      sum +
      sellerOrder.items.reduce(
        (itemSum, item) => itemSum + item.quantity,
        0,
      ),
    0,
  );

  const allItems = order.sellerOrders.flatMap(
    (sellerOrder) => sellerOrder.items,
  );

  const firstItems = allItems.slice(0, 3);

  const extraProducts = Math.max(
    0,
    allItems.length - firstItems.length,
  );

  return (
    <article className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white transition hover:border-[#FFB39F] hover:shadow-[0_8px_24px_rgba(23,32,42,0.045)]">

      {/* ORDER HEADER */}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0ECE7] bg-[#FCFAF6] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[#91877E]">
            Order reference
          </p>

          <p className="mt-1 break-all text-xs font-extrabold text-[#9F2D18]">
            {order.orderCode}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${getStatusClass(order.status)}`}
        >
          {getStatusLabel(order.status)}
        </span>
      </div>

      <div className="p-4 sm:p-5">

        {/* DATE AND COUNTS */}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-[#756B61]">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(order.createdAt)}
          </span>

          <span className="inline-flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />

            {productCount}{" "}
            {productCount === 1 ? "item" : "items"}
          </span>

          <span className="inline-flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5" />

            {order.sellerOrders.length}{" "}
            {order.sellerOrders.length === 1
              ? "seller"
              : "sellers"}
          </span>
        </div>

        {/* PRODUCT PREVIEWS */}

        {firstItems.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {firstItems.map((item) => (
              <div
                key={item.id}
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-[#FCFAF6]"
                title={`${item.productName} × ${item.quantity}`}
              >
                {item.productImageUrl ? (
                  <img
                    src={item.productImageUrl}
                    alt={item.productName}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Package className="h-5 w-5 text-[#B6A99E]" />
                )}
              </div>
            ))}

            {extraProducts > 0 && (
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] text-xs font-extrabold text-[#756B61]">
                +{extraProducts}
              </div>
            )}
          </div>
        )}

        {/* SELLER PROGRESS */}

        <div className="mt-4 space-y-2">
          {order.sellerOrders.map((sellerOrder) => (
            <div
              key={sellerOrder.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FCFAF6] px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Store className="h-3.5 w-3.5 shrink-0 text-[#9F2D18]" />

                <span className="truncate text-[10px] font-semibold text-[#514840]">
                  {sellerOrder.business.name}
                </span>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${getStatusClass(sellerOrder.status)}`}
              >
                {getStatusLabel(sellerOrder.status)}
              </span>
            </div>
          ))}
        </div>

        {/* ORDER TOTAL */}

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-[#F0ECE7] pt-4">
          <div>
            <p className="text-[10px] text-[#91877E]">
              Order total
            </p>

            <p className="mt-1 text-lg font-black text-[#9F2D18]">
              {formatNaira(order.totalAmount)}
            </p>
          </div>

          <Link
            href={`/orders/${encodeURIComponent(order.id)}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[10px] font-extrabold text-white transition hover:bg-[#E94E2C]"
          >
            View order
            <ArrowRight className="h-3.5 w-3.5" />
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
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  /* =====================================================
     LOAD BUYER ORDERS
  ===================================================== */

  const loadOrders = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/orders?page=${pagination.page}&limit=10`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
            },
            signal,
          },
        );

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          router.replace("/buyer/login");
          return;
        }

        const payload: unknown =
          await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            isRecord(payload) &&
            typeof payload.error === "string"
              ? payload.error
              : "Unable to load your orders.",
          );
        }

        if (!isRecord(payload)) {
          throw new Error(
            "Invalid orders response.",
          );
        }

        if (signal.aborted) {
          return;
        }

        const parsedOrders = parseOrders(payload.orders);
        const parsedPagination = parsePagination(
          payload.pagination,
        );

        setOrders(parsedOrders);
        setPagination(parsedPagination);

      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        if (!signal.aborted) {
          console.error(
            "Buyer orders loading error:",
            loadError,
          );

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your orders.",
          );
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [pagination.page, refreshKey, router],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadOrders(controller.signal);

    return () => controller.abort();
  }, [loadOrders]);

  /* =====================================================
     RETRY
  ===================================================== */

  function retryLoading() {
    setRefreshKey((current) => current + 1);
  }

  /* =====================================================
     PAGE
  ===================================================== */

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10"
      >
        <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-8">

          {/* BREADCRUMB */}

          <div className="mb-5 flex items-center gap-2 text-[11px] text-[#756B61]">
            <Link
              href="/"
              className="hover:text-[#9F2D18]"
            >
              Home
            </Link>

            <ChevronRight className="h-3 w-3" />

            <span className="font-bold text-[#9F2D18]">
              My orders
            </span>
          </div>

          {/* HEADING */}

          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF5A36]">
                Your purchases
              </p>

              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#401B13] sm:text-3xl">
                My orders
              </h1>

              <p className="mt-2 text-xs text-[#756B61]">
                View your orders and follow each seller's progress.
              </p>
            </div>

            <Link
              href="/shop"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-[10px] font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
            >
              Continue shopping
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* ERROR */}

          {error && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
            >
              <span>{error}</span>

              <button
                type="button"
                onClick={retryLoading}
                className="inline-flex items-center gap-1 font-bold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          )}

          {/* LOADING */}

          {loading ? (
            <div
              role="status"
              className="flex min-h-[300px] items-center justify-center gap-3 text-sm font-semibold text-[#756B61]"
            >
              <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
              Loading your orders...
            </div>
          ) : error && orders.length === 0 ? (
            /* FAILED REQUEST */

            <section className="mx-auto max-w-lg rounded-[24px] border border-[#EAE6DF] bg-white px-6 py-12 text-center">
              <PackageOpen className="mx-auto h-10 w-10 text-[#9F2D18]" />

              <h2 className="mt-5 text-xl font-black text-[#401B13]">
                Unable to display your orders
              </h2>

              <p className="mt-2 text-xs leading-6 text-[#756B61]">
                Please check your connection and try again.
              </p>

              <button
                type="button"
                onClick={retryLoading}
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            </section>
          ) : orders.length === 0 ? (
            /* EMPTY STATE */

            <section className="mx-auto max-w-lg rounded-[24px] border border-[#EAE6DF] bg-white px-6 py-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#9F2D18]">
                <PackageOpen className="h-8 w-8" />
              </div>

              <h2 className="mt-5 text-xl font-black text-[#401B13]">
                No orders yet
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-[#756B61]">
                When you place an order on ReMarket, it will appear here.
              </p>

              <Link
                href="/shop"
                className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]"
              >
                <ShoppingBag className="h-4 w-4" />
                Explore products
              </Link>
            </section>
          ) : (
            <>
              {/* ORDER COUNT */}

              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-bold text-[#514840]">
                  {pagination.total}{" "}
                  {pagination.total === 1
                    ? "order"
                    : "orders"}
                </p>

                <span className="text-[10px] text-[#91877E]">
                  Newest orders first
                </span>
              </div>

              {/* ORDER LIST */}

              <div className="space-y-4">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                  />
                ))}
              </div>

              {/* PAGINATION */}

              {pagination.totalPages > 1 && (
                <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#EAE6DF] pt-5">
                  <p className="text-[10px] text-[#756B61]">
                    Page {pagination.page} of{" "}
                    {pagination.totalPages}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        !pagination.hasPreviousPage ||
                        loading
                      }
                      onClick={() =>
                        setPagination((current) => ({
                          ...current,
                          page: Math.max(
                            1,
                            current.page - 1,
                          ),
                        }))
                      }
                      className="flex h-9 items-center gap-1 rounded-lg border border-[#EAE6DF] px-3 text-[10px] font-bold text-[#756B61] transition hover:border-[#FFB39F] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Previous
                    </button>

                    <button
                      type="button"
                      disabled={
                        !pagination.hasNextPage ||
                        loading
                      }
                      onClick={() =>
                        setPagination((current) => ({
                          ...current,
                          page: current.page + 1,
                        }))
                      }
                      className="flex h-9 items-center gap-1 rounded-lg border border-[#EAE6DF] px-3 text-[10px] font-bold text-[#756B61] transition hover:border-[#FFB39F] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <MobileBottomNav />
    </>
  );
}