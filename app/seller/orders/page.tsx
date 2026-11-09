"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import {
  AlertCircle,
  ArrowRight,
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
  Package,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Truck,
  UserRound,
  Bookmark,
  XCircle,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

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

type LoadOptions = {
  refresh?: boolean;
  signal?: AbortSignal;
};

const PAGE_SIZE = 10;

const STATUS_FILTERS: {
  value: StatusFilter;
  label: string;
}[] = [
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

const STATUS_STYLES: Record<
  SellerOrderStatus,
  { label: string; className: string }
> = {
  PENDING_ACCEPTANCE: {
    label: "Awaiting your response",
    className: "border-[#F1DCA8] bg-[#FFF5D9] text-[#9A6700]",
  },
  ACCEPTED: {
    label: "Accepted",
    className: "border-[#D5E3FA] bg-[#EAF2FF] text-[#3566B8]",
  },
  REJECTED: {
    label: "Rejected",
    className: "border-[#F1D5D0] bg-[#FFF0EE] text-[#C5402D]",
  },
  PROCESSING: {
    label: "Processing",
    className: "border-[#D5E3FA] bg-[#EAF2FF] text-[#3566B8]",
  },
  READY_FOR_DISPATCH: {
    label: "Ready for dispatch",
    className: "border-[#E4D7F4] bg-[#F4EDFC] text-[#7543A5]",
  },
  DISPATCHED: {
    label: "Dispatched",
    className: "border-[#D8DCF5] bg-[#EEF0FF] text-[#505DA8]",
  },
  DELIVERED: {
    label: "Delivered",
    className: "border-[#BDE8D8] bg-[#EFFBF6] text-[#137A59]",
  },
  COMPLETED: {
    label: "Completed",
    className: "border-[#BDE8D8] bg-[#EFFBF6] text-[#137A59]",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "border-[#E8E4DE] bg-[#F5F5F4] text-[#57534E]",
  },
};

const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20 disabled:cursor-not-allowed disabled:opacity-50";

const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25 disabled:cursor-not-allowed disabled:opacity-50";

/* -------------------------------------------------------------------------- */
/* GENERAL HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function getNullableText(value: unknown): string | null {
  const text = getText(value);
  return text || null;
}

function getSafeNumber(
  value: unknown,
  fallback = 0,
): number {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    return fallback;
  }

  return number;
}

function getFirstValue(...values: unknown[]): unknown {
  return values.find(
    (value) => value !== null && value !== undefined,
  );
}

function isSellerOrderStatus(
  value: unknown,
): value is SellerOrderStatus {
  return (
    value === "PENDING_ACCEPTANCE" ||
    value === "ACCEPTED" ||
    value === "REJECTED" ||
    value === "PROCESSING" ||
    value === "READY_FOR_DISPATCH" ||
    value === "DISPATCHED" ||
    value === "DELIVERED" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  );
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(date);
}

function getErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (!isRecord(payload)) return fallback;

  return (
    getText(payload.message) ||
    getText(payload.error) ||
    fallback
  );
}

/* -------------------------------------------------------------------------- */
/* API RESPONSE PARSERS                                                       */
/* -------------------------------------------------------------------------- */

function parseOrderItem(raw: unknown): SellerOrderItem | null {
  if (!isRecord(raw)) return null;

  const product = isRecord(raw.product)
    ? raw.product
    : {};

  const productSnapshot = isRecord(raw.productSnapshot)
    ? raw.productSnapshot
    : {};

  const name = getText(
    getFirstValue(
      raw.productName,
      raw.name,
      raw.nameSnapshot,
      raw.productNameSnapshot,
      productSnapshot.name,
      product.name,
    ),
    "Product",
  );

  const quantity = getSafeNumber(raw.quantity);

  if (quantity < 1) return null;

  const unitPrice = getSafeNumber(
    getFirstValue(raw.unitPrice, raw.price),
  );

  const lineTotal = getSafeNumber(
    getFirstValue(
      raw.lineTotal,
      raw.totalPrice,
      raw.subtotal,
    ),
    unitPrice * quantity,
  );

  const images = Array.isArray(product.images)
    ? product.images
    : [];

  const firstImage = isRecord(images[0])
    ? images[0]
    : {};

  const imageUrl = getNullableText(
    getFirstValue(
      raw.productImageUrl,
      raw.imageUrl,
      raw.productImage,
      productSnapshot.imageUrl,
      product.imageUrl,
      firstImage.url,
    ),
  );

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

function parseSellerOrder(raw: unknown): SellerOrder | null {
  if (!isRecord(raw)) return null;

  const parentOrder = isRecord(raw.order)
    ? raw.order
    : {};

  const buyer = isRecord(parentOrder.buyer)
    ? parentOrder.buyer
    : {};

  const status = raw.status;

  /*
   * Do not silently convert an unknown status into PENDING_ACCEPTANCE.
   * Doing so could expose an incorrect action to the seller.
   */
  if (!isSellerOrderStatus(status)) {
    return null;
  }

  const id = getText(raw.id);

  if (!id) return null;

  const rawItems = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.orderItems)
      ? raw.orderItems
      : Array.isArray(parentOrder.items)
        ? parentOrder.items
        : [];

  const items = rawItems
    .map(parseOrderItem)
    .filter(
      (item): item is SellerOrderItem => item !== null,
    );

  const calculatedSubtotal = items.reduce(
    (total, item) => total + item.lineTotal,
    0,
  );

  const recipient = getNullableText(
    getFirstValue(
      parentOrder.deliveryRecipient,
      raw.deliveryRecipient,
    ),
  );

  const buyerName = getText(
    getFirstValue(
      buyer.name,
      buyer.fullName,
      parentOrder.buyerName,
      raw.buyerName,
      recipient,
    ),
    "Buyer",
  );

  const itemsSubtotal = getSafeNumber(
    getFirstValue(
      raw.subtotal,
      raw.itemsSubtotal,
      raw.totalAmount,
    ),
    calculatedSubtotal,
  );

  return {
    id,

    sellerOrderCode: getText(
      raw.sellerOrderCode,
      getText(raw.orderCode, id),
    ),

    orderCode: getNullableText(
      parentOrder.orderCode,
    ),

    status,

    createdAt: getNullableText(
      getFirstValue(
        raw.createdAt,
        parentOrder.createdAt,
      ),
    ),

    updatedAt: getNullableText(raw.updatedAt),

    buyerName,

    buyerPhone: getNullableText(
      getFirstValue(
        buyer.phone,
        buyer.phoneNumber,
        raw.buyerPhone,
      ),
    ),

    buyerEmail: getNullableText(
      getFirstValue(
        buyer.email,
        raw.buyerEmail,
      ),
    ),

    deliveryRecipient: recipient,

    deliveryPhone: getNullableText(
      getFirstValue(
        parentOrder.deliveryPhone,
        raw.deliveryPhone,
      ),
    ),

    deliveryAddress: getNullableText(
      getFirstValue(
        parentOrder.deliveryAddress,
        raw.deliveryAddress,
      ),
    ),

    deliveryArea: getNullableText(
      getFirstValue(
        parentOrder.deliveryArea,
        raw.deliveryArea,
      ),
    ),

    deliveryLandmark: getNullableText(
      getFirstValue(
        parentOrder.deliveryLandmark,
        raw.deliveryLandmark,
      ),
    ),

    deliveryNotes: getNullableText(
      getFirstValue(
        parentOrder.deliveryNotes,
        raw.deliveryNotes,
      ),
    ),

    items,
    itemsSubtotal,
  };
}

function parsePagination(
  raw: unknown,
  currentPage: number,
): Pagination {
  if (!isRecord(raw)) {
    return {
      page: currentPage,
      limit: PAGE_SIZE,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: currentPage > 1,
    };
  }

  const page = Math.max(
    1,
    getSafeNumber(raw.page, currentPage),
  );

  const limit = Math.max(
    1,
    getSafeNumber(raw.limit, PAGE_SIZE),
  );

  const total = getSafeNumber(raw.total);

  const totalPages = Math.max(
    1,
    getSafeNumber(
      raw.totalPages,
      Math.ceil(total / limit) || 1,
    ),
  );

  return {
    page,
    limit,
    total,
    totalPages,

    hasNextPage:
      typeof raw.hasNextPage === "boolean"
        ? raw.hasNextPage
        : page < totalPages,

    hasPreviousPage:
      typeof raw.hasPreviousPage === "boolean"
        ? raw.hasPreviousPage
        : page > 1,
  };
}

/* -------------------------------------------------------------------------- */
/* ORDER WORKFLOW                                                             */
/* -------------------------------------------------------------------------- */

function getNextAction(
  status: SellerOrderStatus,
): {
  nextStatus: SellerOrderStatus;
  label: string;
} | null {
  switch (status) {
    case "PENDING_ACCEPTANCE":
      return {
        nextStatus: "ACCEPTED",
        label: "Accept order",
      };

    case "ACCEPTED":
      return {
        nextStatus: "PROCESSING",
        label: "Start processing",
      };

    case "PROCESSING":
      return {
        nextStatus: "READY_FOR_DISPATCH",
        label: "Ready for dispatch",
      };

    case "READY_FOR_DISPATCH":
      return {
        nextStatus: "DISPATCHED",
        label: "Mark as dispatched",
      };

    case "DISPATCHED":
      return {
        nextStatus: "DELIVERED",
        label: "Mark as delivered",
      };

    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* SMALL UI COMPONENTS                                                        */
/* -------------------------------------------------------------------------- */

function StatusBadge({
  status,
}: {
  status: SellerOrderStatus;
}) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${style.className}`}
    >
      {style.label}
    </span>
  );
}

function OrderItemRow({
  item,
}: {
  item: SellerOrderItem;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-[#FCFAF6]">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <Package className="h-6 w-6 text-[#9F2D18]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold text-[#292524]">
          {item.name}
        </p>

        <p className="mt-1 text-xs text-[#78716C]">
          {formatMoney(item.unitPrice)} × {item.quantity}
        </p>
      </div>

      <p className="shrink-0 text-sm font-semibold text-[#292524]">
        {formatMoney(item.lineTotal)}
      </p>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-[#9F2D18]">
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-xs text-[#78716C]">
          {label}
        </p>

        <div className="mt-0.5 break-words text-sm font-medium text-[#292524]">
          {children}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: number;
  description: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#78716C]">
          {title}
        </p>

        <span className="rounded-xl bg-[#FFF7ED] p-2 text-[#9F2D18]">
          {icon}
        </span>
      </div>

      <p className="mt-3 text-2xl font-bold tabular-nums text-[#292524]">
        {value}
      </p>

      <p className="mt-1 text-xs text-[#78716C]">
        {description}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SELLER ORDERS PAGE                                                         */
/* -------------------------------------------------------------------------- */

export default function SellerOrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<SellerOrder[]>([]);

  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const [activeOrderId, setActiveOrderId] =
    useState<string | null>(null);

  const [mobileNavOpen, setMobileNavOpen] =
    useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  /* ------------------------------------------------------------------------ */
  /* LOAD SELLER ORDERS                                                       */
  /* ------------------------------------------------------------------------ */

  const loadOrders = useCallback(
    async ({
      refresh = false,
      signal,
    }: LoadOptions = {}) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const params = new URLSearchParams({
          page: String(pagination.page),
          limit: String(PAGE_SIZE),
        });

        if (statusFilter !== "ALL") {
          params.set("status", statusFilter);
        }

        const response = await fetch(
          `/api/seller/orders?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
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
          if (!signal?.aborted) {
            setRedirecting(true);
            router.replace("/seller/login");
          }

          return;
        }

        const payload: unknown = await response
          .json()
          .catch(() => null);

        if (!response.ok) {
          throw new Error(
            getErrorMessage(
              payload,
              "We could not load your orders. Please try again.",
            ),
          );
        }

        if (!isRecord(payload)) {
          throw new Error(
            "The server returned an invalid response.",
          );
        }

        const rawOrders = Array.isArray(payload.orders)
          ? payload.orders
          : Array.isArray(payload.sellerOrders)
            ? payload.sellerOrders
            : [];

        const parsedOrders = rawOrders
          .map(parseSellerOrder)
          .filter(
            (order): order is SellerOrder => order !== null,
          );

        if (signal?.aborted) return;

        setOrders(parsedOrders);

        setPagination(
          parsePagination(
            payload.pagination,
            pagination.page,
          ),
        );
      } catch (loadError) {
        if (signal?.aborted) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Something went wrong while loading orders.",
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [
      pagination.page,
      statusFilter,
      router,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadOrders({
      signal: controller.signal,
    });

    return () => controller.abort();
  }, [loadOrders]);

  /* ------------------------------------------------------------------------ */
  /* SEARCH                                                                   */
  /* ------------------------------------------------------------------------ */

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return orders;

    return orders.filter((order) => {
      const itemNames = order.items
        .map((item) => item.name)
        .join(" ");

      return [
        order.sellerOrderCode,
        order.orderCode ?? "",
        order.buyerName,
        order.deliveryRecipient ?? "",
        order.deliveryPhone ?? "",
        order.deliveryAddress ?? "",
        order.deliveryArea ?? "",
        itemNames,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [orders, search]);

  /* ------------------------------------------------------------------------ */
  /* PAGE SUMMARY                                                             */
  /* ------------------------------------------------------------------------ */

  const pendingCount = orders.filter(
    (order) => order.status === "PENDING_ACCEPTANCE",
  ).length;

  const activeCount = orders.filter((order) =>
    [
      "ACCEPTED",
      "PROCESSING",
      "READY_FOR_DISPATCH",
      "DISPATCHED",
    ].includes(order.status),
  ).length;

  const completedCount = orders.filter(
    (order) => order.status === "COMPLETED",
  ).length;

  /* ------------------------------------------------------------------------ */
  /* UPDATE ORDER STATUS                                                      */
  /* ------------------------------------------------------------------------ */

  async function updateOrderStatus(
    order: SellerOrder,
    nextStatus: SellerOrderStatus,
  ) {
    if (activeOrderId) return;

    if (nextStatus === "REJECTED") {
      const confirmed = window.confirm(
        `Are you sure you want to reject ${order.sellerOrderCode}? The reserved stock will be restored where inventory tracking is enabled.`,
      );

      if (!confirmed) return;
    }

    setActiveOrderId(order.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/seller/orders/${encodeURIComponent(order.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        setRedirecting(true);
        router.replace("/seller/login");
        return;
      }

      const payload: unknown = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            "We could not update this order. Please try again.",
          ),
        );
      }

      setNotice(
        nextStatus === "REJECTED"
          ? `${order.sellerOrderCode} has been rejected. Reserved tracked stock has been restored by the server.`
          : `${order.sellerOrderCode} has been updated successfully.`,
      );

      await loadOrders({
        refresh: true,
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Something went wrong while updating the order.",
      );
    } finally {
      setActiveOrderId(null);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* FILTERS AND PAGINATION                                                   */
  /* ------------------------------------------------------------------------ */

  function changeFilter(value: StatusFilter) {
    setStatusFilter(value);

    setPagination((current) => ({
      ...current,
      page: 1,
    }));

    setSearch("");
    setNotice("");
  }

  function changePage(nextPage: number) {
    setPagination((current) => ({
      ...current,
      page: Math.max(1, nextPage),
    }));

    setSearch("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function logout() {
    await signOut({
      callbackUrl: "/seller/login",
    });
  }

  /* ------------------------------------------------------------------------ */
  /* RENDER                                                                   */
  /* ------------------------------------------------------------------------ */

  if (redirecting) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#FFFDFC] px-4">
        <div className="flex items-center gap-3 text-sm font-medium text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin text-[#FF5A36]" />
          Redirecting to seller login...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#FFFDFC] text-[#17202A]">
      {/* ------------------------------------------------------------------ */}
      {/* SELLER PORTAL HEADER                                               */}
      {/* ------------------------------------------------------------------ */}

      <header className="sticky top-0 z-50 flex min-h-[66px] w-full items-center justify-between gap-3 border-b border-[#EAE6DF] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <Link
          href="/seller"
          className="flex shrink-0 items-center gap-2.5"
          aria-label="ReMarket Seller Portal home"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
            <Store className="h-5 w-5" />
          </span>

          <span>
            <span className="block text-sm font-bold tracking-tight">
              ReMarket
            </span>

            <span className="block text-[10px] leading-none text-gray-400">
              Seller Portal
            </span>
          </span>
        </Link>

        {/* DESKTOP NAVIGATION */}
        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Seller navigation"
        >
          <Link
            href="/seller"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
          >
            <Store className="h-4 w-4" />
            Dashboard
          </Link>

          <Link
            href="/seller#products-section"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
          >
            <Package className="h-4 w-4" />
            Products
          </Link>

          <Link
            href="/seller/orders"
            aria-current="page"
            className="inline-flex items-center gap-2 rounded-xl bg-[#FFF0E9] px-3 py-2.5 text-xs font-bold text-[#FF5A36]"
          >
            <ClipboardCheck className="h-4 w-4" />
            Orders
          </Link>

          <Link
            href="/seller#orders-section"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
          >
            <Package className="h-4 w-4" />
            Inventory overview
          </Link>
        </nav>

        {/* HEADER ACTIONS */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative z-[100] shrink-0">
            <NotificationBell />
          </div>

          {/* DESKTOP ACCOUNT MENU */}
          <details className="group relative hidden sm:block">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs font-bold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] [&::-webkit-details-marker]:hidden">
              <UserRound className="h-4 w-4" />
              <span>Account</span>
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>

            <div className="absolute right-0 top-full z-[120] mt-2 w-64 overflow-hidden rounded-2xl border border-[#E8E4DE] bg-white p-2 shadow-[0_18px_45px_rgba(23,32,42,0.16)]">
              <div className="border-b border-[#F0ECE6] px-3 py-3">
                <p className="text-xs font-bold text-[#17202A]">
                  Your ReMarket account
                </p>

                <p className="mt-1 text-[10px] leading-4 text-gray-400">
                  Manage your buyer and seller activities.
                </p>
              </div>

              <div className="grid gap-1 py-2">
                <Link
                  href="/account"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <UserRound className="h-4 w-4 text-gray-400" />
                  Account overview
                </Link>

                <Link
                  href="/saved"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <Bookmark className="h-4 w-4 text-gray-400" />
                  Saved items
                </Link>

                <Link
                  href="/seller/profile"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <Store className="h-4 w-4 text-gray-400" />
                  Seller profile
                </Link>

                <Link
                  href="/seller/claims"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <ShieldCheck className="h-4 w-4 text-gray-400" />
                  Business claims
                </Link>

                <Link
                  href="/seller#products-section"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <Package className="h-4 w-4 text-gray-400" />
                  Manage products
                </Link>

                <Link
                  href="/seller/orders"
                  className="flex items-center gap-3 rounded-xl bg-[#FFF0E9] px-3 py-2.5 text-xs font-bold text-[#FF5A36]"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Manage orders
                </Link>
              </div>

              <div className="border-t border-[#F0ECE6] pt-2">
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[#C5402D] hover:bg-[#FFF0EE]"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          </details>

          <button
            type="button"
            onClick={() => void logout()}
            className={`${secondaryButtonClass} hidden !px-3 md:inline-flex`}
          >
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </button>

          {/* MOBILE MENU BUTTON */}
          <button
            type="button"
            onClick={() =>
              setMobileNavOpen((open) => !open)
            }
            aria-expanded={mobileNavOpen}
            aria-label={
              mobileNavOpen
                ? "Close navigation"
                : "Open navigation"
            }
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E4DE] text-gray-600 sm:hidden"
          >
            <span className="text-lg leading-none">
              {mobileNavOpen ? "×" : "☰"}
            </span>
          </button>
        </div>

        {/* MOBILE NAVIGATION */}
        {mobileNavOpen && (
          <nav
            className="absolute left-0 right-0 top-full z-[110] grid gap-1 border-b border-[#EAE6DF] bg-white p-3 shadow-lg sm:hidden"
            aria-label="Mobile account and seller navigation"
          >
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Seller workspace
            </p>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/seller"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Dashboard
            </Link>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/seller#products-section"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Manage products
            </Link>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/seller/orders"
              className="rounded-xl bg-[#FFF0E9] px-4 py-3 text-sm font-bold text-[#FF5A36]"
            >
              Manage orders
            </Link>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/seller#orders-section"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Inventory overview
            </Link>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/seller/profile"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Seller profile
            </Link>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/seller/claims"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Business claims
            </Link>

            <div className="my-1 border-t border-[#F0ECE6]" />

            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Your account
            </p>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/account"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Account overview
            </Link>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/saved"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Saved items
            </Link>

            <div className="my-1 border-t border-[#F0ECE6]" />

            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-bold text-[#C5402D] hover:bg-[#FFF0EE]"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </nav>
        )}
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* PAGE CONTENT                                                       */}
      {/* ------------------------------------------------------------------ */}

      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
        {/* PAGE HEADING */}
        <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link
              href="/seller"
              className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-[#9F2D18] transition hover:text-[#FF5A36]"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to dashboard
            </Link>

            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
              Seller workspace
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              Manage your orders
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Review incoming orders, prepare products and keep buyers
              updated as their orders move through delivery.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadOrders({ refresh: true })
            }
            disabled={loading || refreshing}
            className={`${secondaryButtonClass} min-h-11`}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}

            Refresh orders
          </button>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard
            title="New orders"
            value={pendingCount}
            description="Awaiting your response on this page"
            icon={<Clock3 className="h-5 w-5" />}
          />

          <SummaryCard
            title="In progress"
            value={activeCount}
            description="Being prepared or delivered on this page"
            icon={<Truck className="h-5 w-5" />}
          />

          <SummaryCard
            title="Completed"
            value={completedCount}
            description="Completed orders on this page"
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
        </div>

        {/* SEARCH AND FILTERS */}
        <section className="mt-7 rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-base font-bold text-[#292524]">
                Your orders
              </h2>

              <p className="mt-1 text-xs text-[#78716C]">
                Search the currently loaded page or filter orders by status.
              </p>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8A29E]" />

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search order code, buyer, address or product..."
                className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] pl-10 pr-4 text-sm outline-none transition placeholder:text-[#A8A29E] focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-[#78716C]">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF7ED] text-[#9F2D18]">
                <Package className="h-4 w-4" />
              </span>

              Filter by order status
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {STATUS_FILTERS.map((filter) => {
                const selected =
                  statusFilter === filter.value;

                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() =>
                      changeFilter(filter.value)
                    }
                    aria-pressed={selected}
                    className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                      selected
                        ? "border-[#FF5A36] bg-[#FF5A36] text-white"
                        : "border-[#EAE6DF] bg-white text-[#57534E] hover:border-[#FF5A36] hover:bg-[#FFF7ED]"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* FEEDBACK */}
        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-5 flex items-start gap-3 rounded-xl border border-[#F1D5D0] bg-[#FFF0EE] p-4 text-sm text-[#C5402D]"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {notice && (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 flex items-start gap-3 rounded-xl border border-[#BDE8D8] bg-[#EFFBF6] p-4 text-sm text-[#137A59]"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{notice}</p>
          </div>
        )}

        {/* LOADING */}
        {loading ? (
          <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-[#EAE6DF] bg-white">
            <Loader2 className="h-8 w-8 animate-spin text-[#FF5A36]" />

            <p className="mt-3 text-sm font-medium text-[#78716C]">
              Loading your orders...
            </p>
          </div>
        ) : filteredOrders.length === 0 ? (
          /* EMPTY STATE */
          <div className="mt-6 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-[#D6D3D1] bg-white px-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF7ED] text-[#9F2D18]">
              {search || statusFilter !== "ALL" ? (
                <Search className="h-7 w-7" />
              ) : (
                <Package className="h-7 w-7" />
              )}
            </div>

            <h3 className="mt-5 text-lg font-bold text-[#292524]">
              {search || statusFilter !== "ALL"
                ? "No matching orders"
                : "No orders yet"}
            </h3>

            <p className="mt-2 max-w-md text-sm leading-6 text-[#78716C]">
              {search || statusFilter !== "ALL"
                ? "Try another search term or choose a different order status."
                : "When buyers place orders for your products, they will appear here for you to manage."}
            </p>

            {(search || statusFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  changeFilter("ALL");
                }}
                className="mt-5 rounded-xl bg-[#FFF7ED] px-4 py-2.5 text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFE9DC]"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          /* ORDER LIST */
          <div className="mt-6 space-y-5">
            {filteredOrders.map((order) => {
              const nextAction = getNextAction(order.status);

              const isUpdating =
                activeOrderId === order.id;

              const anotherOrderIsUpdating =
                activeOrderId !== null && !isUpdating;

              return (
                <article
                  key={order.id}
                  className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-sm"
                >
                  {/* ORDER HEADING */}
                  <div className="flex flex-col gap-3 border-b border-[#F0ECE7] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-all text-sm font-bold text-[#292524] sm:text-base">
                          {order.sellerOrderCode}
                        </h3>

                        <StatusBadge status={order.status} />
                      </div>

                      {order.orderCode && (
                        <p className="mt-1 text-xs text-[#78716C]">
                          Main order: {order.orderCode}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-2 text-xs text-[#78716C]">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(order.createdAt)}
                      </div>
                    </div>

                    <div className="sm:text-right">
                      <p className="text-xs text-[#78716C]">
                        Your items subtotal
                      </p>

                      <p className="mt-1 text-lg font-bold text-[#9F2D18]">
                        {formatMoney(order.itemsSubtotal)}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.2fr_0.8fr]">
                    {/* ORDERED PRODUCTS */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <h4 className="text-sm font-bold text-[#292524]">
                          Products ordered
                        </h4>

                        <span className="text-xs text-[#78716C]">
                          {order.items.length}{" "}
                          {order.items.length === 1
                            ? "product"
                            : "products"}
                        </span>
                      </div>

                      {order.items.length > 0 ? (
                        <div className="divide-y divide-[#F0ECE7]">
                          {order.items.map((item) => (
                            <OrderItemRow
                              key={item.id}
                              item={item}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="py-4 text-sm text-[#78716C]">
                          Product details are not available for this order.
                        </p>
                      )}
                    </div>

                    {/* BUYER AND DELIVERY DETAILS */}
                    <div className="rounded-xl bg-[#FCFAF6] p-4">
                      <h4 className="mb-4 text-sm font-bold text-[#292524]">
                        Buyer and delivery details
                      </h4>

                      <div className="space-y-4">
                        <DetailRow
                          icon={<UserRound className="h-4 w-4" />}
                          label="Recipient"
                        >
                          {order.deliveryRecipient ||
                            order.buyerName}
                        </DetailRow>

                        {order.deliveryPhone && (
                          <DetailRow
                            icon={<Phone className="h-4 w-4" />}
                            label="Delivery phone"
                          >
                            <a
                              href={`tel:${order.deliveryPhone}`}
                              className="text-[#9F2D18] hover:underline"
                            >
                              {order.deliveryPhone}
                            </a>
                          </DetailRow>
                        )}

                        {order.buyerPhone &&
                          order.buyerPhone !== order.deliveryPhone && (
                            <DetailRow
                              icon={<Phone className="h-4 w-4" />}
                              label="Buyer phone"
                            >
                              <a
                                href={`tel:${order.buyerPhone}`}
                                className="text-[#9F2D18] hover:underline"
                              >
                                {order.buyerPhone}
                              </a>
                            </DetailRow>
                          )}

                        {order.deliveryAddress && (
                          <DetailRow
                            icon={<MapPin className="h-4 w-4" />}
                            label="Delivery address"
                          >
                            {order.deliveryAddress}
                          </DetailRow>
                        )}

                        {order.deliveryArea && (
                          <DetailRow
                            icon={<MapPin className="h-4 w-4" />}
                            label="Area"
                          >
                            {order.deliveryArea}
                          </DetailRow>
                        )}

                        {order.deliveryLandmark && (
                          <DetailRow
                            icon={<MapPin className="h-4 w-4" />}
                            label="Nearby landmark"
                          >
                            {order.deliveryLandmark}
                          </DetailRow>
                        )}

                        {order.deliveryNotes && (
                          <div className="border-t border-[#EAE6DF] pt-3">
                            <p className="text-xs text-[#78716C]">
                              Delivery notes
                            </p>

                            <p className="mt-1 whitespace-pre-wrap text-sm text-[#44403C]">
                              {order.deliveryNotes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ORDER ACTIONS */}
                  <div className="flex flex-col gap-3 border-t border-[#F0ECE7] bg-[#FFFDFC] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="text-xs leading-5 text-[#78716C]">
                      {order.status === "PENDING_ACCEPTANCE" && (
                        <span>
                          Review the order and accept or reject it.
                        </span>
                      )}

                      {order.status === "ACCEPTED" && (
                        <span>
                          You accepted this order. Start preparing the products.
                        </span>
                      )}

                      {order.status === "PROCESSING" && (
                        <span>
                          Update the order when the products are ready for dispatch.
                        </span>
                      )}

                      {order.status === "READY_FOR_DISPATCH" && (
                        <span>
                          Update the order once it has been dispatched.
                        </span>
                      )}

                      {order.status === "DISPATCHED" && (
                        <span>
                          Update the order when it has been delivered to the buyer.
                        </span>
                      )}

                      {order.status === "DELIVERED" && (
                        <span>
                          Delivery has been reported. The buyer must confirm receipt to complete the order.
                        </span>
                      )}

                      {order.status === "COMPLETED" && (
                        <span>
                          This order has been completed.
                        </span>
                      )}

                      {order.status === "REJECTED" && (
                        <span>
                          You rejected this order.
                        </span>
                      )}

                      {order.status === "CANCELLED" && (
                        <span>
                          This order has been cancelled.
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {order.status === "PENDING_ACCEPTANCE" && (
                        <button
                          type="button"
                          disabled={
                            isUpdating ||
                            anotherOrderIsUpdating
                          }
                          onClick={() =>
                            void updateOrderStatus(
                              order,
                              "REJECTED",
                            )
                          }
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#F1D5D0] bg-white px-4 py-2 text-sm font-semibold text-[#C5402D] transition hover:bg-[#FFF0EE] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}

                          Reject
                        </button>
                      )}

                      {nextAction && (
                        <button
                          type="button"
                          disabled={
                            isUpdating ||
                            anotherOrderIsUpdating ||
                            order.items.length === 0
                          }
                          onClick={() =>
                            void updateOrderStatus(
                              order,
                              nextAction.nextStatus,
                            )
                          }
                          className={`${primaryButtonClass} min-h-10`}
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : order.status === "DISPATCHED" ? (
                            <Truck className="h-4 w-4" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}

                          {isUpdating
                            ? "Updating..."
                            : nextAction.label}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* PAGINATION */}
        {!loading && pagination.totalPages > 1 && (
          <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#78716C]">
              Page{" "}
              <span className="font-semibold text-[#292524]">
                {pagination.page}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-[#292524]">
                {pagination.totalPages}
              </span>

              {pagination.total > 0 && (
                <span>
                  {" "}
                  · {pagination.total} total orders
                </span>
              )}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={
                  !pagination.hasPreviousPage ||
                  loading ||
                  refreshing
                }
                onClick={() =>
                  changePage(pagination.page - 1)
                }
                className={secondaryButtonClass}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>

              <button
                type="button"
                disabled={
                  !pagination.hasNextPage ||
                  loading ||
                  refreshing
                }
                onClick={() =>
                  changePage(pagination.page + 1)
                }
                className={secondaryButtonClass}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ORDER COMPLETION NOTE */}
        <div className="mt-7 rounded-2xl border border-[#F5D4C7] bg-[#FFF7ED] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white p-2 text-[#9F2D18]">
              <Truck className="h-5 w-5" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-[#7C2D12]">
                Order completion
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#7C2D12]">
                After you mark an order as delivered, the buyer still
                needs to confirm receipt. The order becomes completed
                after the buyer confirms delivery.
              </p>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="mt-8 border-t border-[#EAE6DF] py-5">
          <div className="flex flex-col gap-2 text-[11px] text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <p>
              ReMarket Seller Portal · Find it nearby.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                href="/seller"
                className="hover:text-[#9F2D18]"
              >
                Dashboard
              </Link>

              <Link
                href="/seller/profile"
                className="hover:text-[#9F2D18]"
              >
                Profile settings
              </Link>

              <Link
                href="/seller/claims"
                className="hover:text-[#9F2D18]"
              >
                Business claims
              </Link>

              <button
                type="button"
                onClick={() => void logout()}
                className="text-left hover:text-[#9F2D18]"
              >
                Sign out
              </button>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}