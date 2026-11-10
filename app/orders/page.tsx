
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Package,
  PackageOpen,
  RefreshCw,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

/* =========================================================
   CONSTANTS
========================================================= */

const ORDERS_PER_PAGE = 10;

type DeliveryFeeStatus =
  | "UNCONFIRMED"
  | "CONFIRMED";

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

function isValidDate(
  value: string,
): boolean {
  return !Number.isNaN(
    new Date(value).getTime(),
  );
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

    // Other statuses

    PENDING: "Payment pending",
    INITIATED: "Payment initiated",
    SUCCESS: "Payment successful",
    FAILED: "Payment failed",
    REFUNDED: "Refunded",
    PARTIALLY_REFUNDED: "Partially refunded",
  };

  return (
    labels[status] ??
    status.replaceAll("_", " ").toLowerCase()
  );
}

/* =========================================================
   ORDER STATUS COLOURS
========================================================= */

function getStatusClass(status: string): string {
  if (
    [
      "COMPLETED",
      "DELIVERED",
      "SUCCESS",
      "CONFIRMED",
    ].includes(status)
  ) {
    return "bg-[#DCFCE7] text-[#166534]";
  }

  if (
    [
      "CANCELLED",
      "PARTIALLY_CANCELLED",
      "REJECTED",
      "FAILED",
    ].includes(status)
  ) {
    return "bg-[#FEE2E2] text-[#B42318]";
  }

  if (
    [
      "DISPATCHED",
      "PARTIALLY_DISPATCHED",
      "READY_FOR_DISPATCH",
    ].includes(status)
  ) {
    return "bg-[#DBEAFE] text-[#1D4ED8]";
  }

  return "bg-[#FFF1ED] text-[#9F2D18]";
}

/* =========================================================
   ORDER STATUS DESCRIPTION
========================================================= */

function getOrderStatusDescription(
  status: string,
): string {
  const descriptions: Record<string, string> = {
    PLACED:
      "Your order has been submitted and is awaiting seller responses.",

    PARTIALLY_ACCEPTED:
      "Some sellers have accepted your order. Others are yet to respond.",

    CONFIRMED:
      "The relevant sellers have accepted your order.",

    PROCESSING:
      "Your products are being prepared by the sellers.",

    PARTIALLY_DISPATCHED:
      "Some products have been dispatched.",

    DISPATCHED:
      "Your products have been dispatched.",

    COMPLETED:
      "Your order has been completed.",

    PARTIALLY_CANCELLED:
      "Some parts of your order were cancelled or rejected.",

    CANCELLED:
      "This order has been cancelled.",
  };

  return (
    descriptions[status] ??
    "View your order for more details."
  );
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
        !isValidDate(createdAt) ||
        itemsSubtotal === null ||
        deliveryFee === null ||
        totalAmount === null
      ) {
        return [];
      }

      /*
       * Validate stored order totals.
       */

      const calculatedTotal =
        itemsSubtotal + deliveryFee;

      if (
        !Number.isSafeInteger(calculatedTotal) ||
        totalAmount !== calculatedTotal
      ) {
        return [];
      }

      /*
       * Treat missing or unknown fee status as
       * UNCONFIRMED to avoid displaying a provisional
       * subtotal as a final order total.
       */

      const deliveryFeeStatus: DeliveryFeeStatus =
        rawOrder.deliveryFeeStatus === "CONFIRMED"
          ? "CONFIRMED"
          : "UNCONFIRMED";

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
          deliveryFeeStatus,

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
    limit: ORDERS_PER_PAGE,
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
  /*
   * Product quantity across all sellers.
   */

  const productCount = order.sellerOrders.reduce(
    (sum, sellerOrder) =>
      sum +
      sellerOrder.items.reduce(
        (itemSum, item) =>
          itemSum + item.quantity,
        0,
      ),
    0,
  );

  /*
   * Combine product previews from all seller orders.
   */

  const allItems = order.sellerOrders.flatMap(
    (sellerOrder) => sellerOrder.items,
  );

  const firstItems = allItems.slice(0, 4);

  const extraProducts = Math.max(
    0,
    allItems.length - firstItems.length,
  );

  /*
   * Never display a provisional amount as a
   * confirmed final order total.
   */

  const deliveryConfirmed =
    order.deliveryFeeStatus === "CONFIRMED";

  const displayAmount = deliveryConfirmed
    ? order.totalAmount
    : order.itemsSubtotal;

  const amountLabel = deliveryConfirmed
    ? "Order total"
    : "Products subtotal";

  return (
    <article className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white transition duration-200 hover:border-[#FFB39F] hover:shadow-[0_8px_24px_rgba(23,32,42,0.045)]">

      {/* =====================================
          ORDER HEADER
      ===================================== */}

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

        {/* =====================================
            ORDER INFORMATION
        ===================================== */}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-[#756B61]">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-[#9F2D18]" />
            {formatDate(order.createdAt)}
          </span>

          <span className="inline-flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-[#9F2D18]" />

            {productCount}{" "}
            {productCount === 1 ? "item" : "items"}
          </span>

          <span className="inline-flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-[#9F2D18]" />

            {order.sellerOrders.length}{" "}
            {order.sellerOrders.length === 1
              ? "seller"
              : "sellers"}
          </span>
        </div>

        {/* =====================================
            ORDER STATUS DESCRIPTION
        ===================================== */}

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#F3D6CC] bg-[#FFF7F3] p-3">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" />

          <p className="text-[10px] leading-5 text-[#756B61]">
            {getOrderStatusDescription(order.status)}
          </p>
        </div>

        {/* =====================================
            PRODUCT PREVIEWS
        ===================================== */}

        {firstItems.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-extrabold text-[#514840]">
                Products ordered
              </p>

              <span className="text-[9px] text-[#91877E]">
                {allItems.length}{" "}
                {allItems.length === 1
                  ? "product"
                  : "products"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {firstItems.map((item) => (
                <div
                  key={item.id}
                  className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-[#FCFAF6]"
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

                  <span className="absolute bottom-1 right-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[8px] font-bold text-white">
                    ×{item.quantity}
                  </span>
                </div>
              ))}

              {extraProducts > 0 && (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] text-xs font-extrabold text-[#756B61]">
                  +{extraProducts}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================
            SELLER ORDER PROGRESS
        ===================================== */}

        <div className="mt-5 border-t border-[#F0ECE7] pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-extrabold text-[#401B13]">
              Seller fulfilment
            </h3>

            <span className="text-[9px] text-[#91877E]">
              Tracked separately
            </span>
          </div>

          <div className="space-y-2">
            {order.sellerOrders.map((sellerOrder) => (
              <div
                key={sellerOrder.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F0ECE7] bg-[#FCFAF6] px-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#EAE6DF] bg-white text-[#9F2D18]">
                    {sellerOrder.business.imageUrl ? (
                      <img
                        src={sellerOrder.business.imageUrl}
                        alt={sellerOrder.business.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Store className="h-4 w-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-bold text-[#514840]">
                      {sellerOrder.business.name}
                    </p>

                    <p className="mt-0.5 break-all text-[8px] text-[#A69D94]">
                      {sellerOrder.sellerOrderCode}
                    </p>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold ${getStatusClass(sellerOrder.status)}`}
                >
                  {getStatusLabel(sellerOrder.status)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* =====================================
            ORDER TOTALS
        ===================================== */}

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-[#F0ECE7] pt-4">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
              {amountLabel}
            </p>

            <p className="mt-1 text-xl font-black text-[#9F2D18]">
              {formatNaira(displayAmount)}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[9px] text-[#756B61]">
                Products: {formatNaira(order.itemsSubtotal)}
              </span>

              <span className="text-[9px] text-[#756B61]">
                Delivery:{" "}
                {deliveryConfirmed
                  ? formatNaira(order.deliveryFee)
                  : "To be confirmed"}
              </span>
            </div>

            {!deliveryConfirmed && (
              <p className="mt-1.5 text-[9px] leading-4 text-[#A07848]">
                Delivery charges are not included in this subtotal.
              </p>
            )}
          </div>

          <Link
            href={`/orders/${encodeURIComponent(order.id)}`}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[10px] font-extrabold text-white transition hover:bg-[#E94E2C]"
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
    limit: ORDERS_PER_PAGE,
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
          `/api/orders?page=${pagination.page}&limit=${ORDERS_PER_PAGE}`,
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

        const parsedOrders = parseOrders(
          payload.orders,
        );

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
    [pagination.page, router],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadOrders(controller.signal);

    return () => controller.abort();
  }, [loadOrders, refreshKey]);

  /* =====================================================
     RETRY
  ===================================================== */

  function retryLoading() {
    setRefreshKey((current) => current + 1);
  }

  /* =====================================================
     PAGINATION
  ===================================================== */

  function goToPreviousPage() {
    if (
      !pagination.hasPreviousPage ||
      loading
    ) {
      return;
    }

    setPagination((current) => ({
      ...current,
      page: Math.max(1, current.page - 1),
    }));
  }

  function goToNextPage() {
    if (
      !pagination.hasNextPage ||
      loading
    ) {
      return;
    }

    setPagination((current) => ({
      ...current,
      page: current.page + 1,
    }));
  }

  const firstVisibleOrder =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;

  const lastVisibleOrder = Math.min(
    pagination.page * pagination.limit,
    pagination.total,
  );

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

          {/* =====================================
              BREADCRUMB
          ===================================== */}

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

          {/* =====================================
              ORDERS HERO
          ===================================== */}

          <section className="mb-7 overflow-hidden rounded-[24px] border border-[#F3D6CC] bg-gradient-to-br from-[#FFF1ED] via-white to-[#FFF7ED] p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD9CE] bg-white/80 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#9F2D18]">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Your purchases
                </div>

                <h1 className="mt-4 text-[29px] font-black tracking-tight text-[#401B13] sm:text-[36px]">
                  My orders
                </h1>

                <p className="mt-2 max-w-xl text-xs leading-6 text-[#756B61] sm:text-sm">
                  Manage your purchases, view seller responses,
                  and follow the progress of your orders on ReMarket.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white bg-white/85 px-4 py-3 shadow-sm">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                  <Package className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-[#91877E]">
                    All orders
                  </p>

                  <p className="mt-1 text-lg font-black text-[#401B13]">
                    {pagination.total}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* =====================================
              ORDER LIST HEADING
          ===================================== */}

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-[#401B13]">
                Purchase history
              </h2>

              <p className="mt-1 text-[10px] text-[#91877E]">
                Your recent purchases and order updates.
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

          {/* =====================================
              ERROR
          ===================================== */}

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

          {/* =====================================
              LOADING
          ===================================== */}

          {loading ? (
            <div
              role="status"
              className="flex min-h-[300px] items-center justify-center gap-3 text-sm font-semibold text-[#756B61]"
            >
              <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
              Loading your orders...
            </div>
          ) : error && orders.length === 0 ? (
            /* =====================================
               FAILED REQUEST
            ===================================== */

            <section className="mx-auto max-w-lg rounded-[24px] border border-[#EAE6DF] bg-white px-6 py-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#9F2D18]">
                <PackageOpen className="h-8 w-8" />
              </div>

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
            /* =====================================
               EMPTY STATE
            ===================================== */

            <section className="mx-auto max-w-lg rounded-[24px] border border-[#EAE6DF] bg-white px-6 py-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#9F2D18]">
                <PackageOpen className="h-8 w-8" />
              </div>

              <h2 className="mt-5 text-xl font-black text-[#401B13]">
                No orders yet
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-[#756B61]">
                When you place an order on ReMarket,
                it will appear here. You can then follow
                each seller's response and fulfilment progress.
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
              {/* =====================================
                  ORDER COUNT AND SORT DESCRIPTION
              ===================================== */}

              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#514840]">
                  Showing {firstVisibleOrder}–{lastVisibleOrder} of{" "}
                  {pagination.total}{" "}
                  {pagination.total === 1
                    ? "order"
                    : "orders"}
                </p>

                <span className="text-[10px] text-[#91877E]">
                  Newest orders first
                </span>
              </div>

              {/* =====================================
                  ORDER LIST
              ===================================== */}

              <div className="space-y-4">
                {orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                  />
                ))}
              </div>

              {/* =====================================
                  PAGINATION
              ===================================== */}

              {pagination.totalPages > 1 && (
                <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#EAE6DF] pt-5">
                  <div>
                    <p className="text-[10px] font-bold text-[#514840]">
                      Page {pagination.page} of{" "}
                      {pagination.totalPages}
                    </p>

                    <p className="mt-1 text-[9px] text-[#91877E]">
                      Browse your previous purchases.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        !pagination.hasPreviousPage ||
                        loading
                      }
                      onClick={goToPreviousPage}
                      className="flex h-10 items-center gap-1 rounded-lg border border-[#EAE6DF] bg-white px-3 text-[10px] font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
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
                      onClick={goToNextPage}
                      className="flex h-10 items-center gap-1 rounded-lg border border-[#EAE6DF] bg-white px-3 text-[10px] font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* =====================================
              FOOTER
          ===================================== */}

          <footer className="mt-12 flex items-center justify-center gap-3 pb-4 text-[10px] text-[#9B9188]">
            <span className="h-px w-12 bg-[#EAE6DF]" />

            <span>
              ReMarket · Find it nearby
            </span>

            <span className="h-px w-12 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>

      <MobileBottomNav />
    </>
  );
}
