"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MapPin,
  Package,
  ShieldCheck,
  Store,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

/* =========================================================
   TYPES
========================================================= */

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

/* =========================================================
   HELPERS
========================================================= */

const MAX_ORDER_ID_LENGTH = 100;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value === "string"
    ? value
    : null;
}

function isValidDateString(
  value: string,
): boolean {
  return !Number.isNaN(new Date(value).getTime());
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

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return "Not yet recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
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

function getOrderStatusLabel(
  status: string,
): string {
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
    PENDING_ACCEPTANCE: "Awaiting seller response",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    READY_FOR_DISPATCH: "Ready for dispatch",
    DELIVERED: "Delivered",

    // Payment statuses
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
   STATUS COLOURS
========================================================= */

function getStatusClass(
  status: string,
): string {
  if (
    [
      "COMPLETED",
      "DELIVERED",
      "SUCCESS",
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
   ORDER ITEM PARSER
========================================================= */

function parseOrderItems(
  value: unknown,
): OrderItemView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(
    (item): OrderItemView[] => {
      if (!isRecord(item)) {
        return [];
      }

      const id = item.id;
      const productName = item.productName;

      const unitPrice = getSafeInteger(
        item.unitPrice,
        1,
      );

      const quantity = getSafeInteger(
        item.quantity,
        1,
      );

      const lineTotal = getSafeInteger(
        item.lineTotal,
      );

      if (
        typeof id !== "string" ||
        typeof productName !== "string" ||
        unitPrice === null ||
        quantity === null ||
        lineTotal === null
      ) {
        return [];
      }

      return [
        {
          id,

          productId:
            typeof item.productId === "string"
              ? item.productId
              : null,

          productName,

          productImageUrl:
            typeof item.productImageUrl === "string"
              ? item.productImageUrl
              : null,

          unitPrice,
          quantity,
          lineTotal,
        },
      ];
    },
  );
}

/* =========================================================
   BUSINESS PARSER
========================================================= */

function parseBusiness(
  value: unknown,
): BusinessView | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,

    imageUrl:
      typeof value.imageUrl === "string"
        ? value.imageUrl
        : null,
  };
}

/* =========================================================
   SELLER ORDER PARSER
========================================================= */

function parseSellerOrders(
  value: unknown,
): SellerOrderView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(
    (item): SellerOrderView[] => {
      if (!isRecord(item)) {
        return [];
      }

      const business = parseBusiness(item.business);

      const subtotal = getSafeInteger(
        item.subtotal,
      );

      if (
        typeof item.id !== "string" ||
        typeof item.sellerOrderCode !== "string" ||
        typeof item.status !== "string" ||
        subtotal === null ||
        !business
      ) {
        return [];
      }

      return [
        {
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
        },
      ];
    },
  );
}

/* =========================================================
   PAYMENT PARSER
========================================================= */

function parsePayments(
  value: unknown,
): PaymentView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(
    (item): PaymentView[] => {
      if (!isRecord(item)) {
        return [];
      }

      const amount = getSafeInteger(
        item.amount,
      );

      if (
        typeof item.id !== "string" ||
        amount === null ||
        typeof item.status !== "string" ||
        typeof item.createdAt !== "string" ||
        !isValidDateString(item.createdAt)
      ) {
        return [];
      }

      return [
        {
          id: item.id,
          amount,

          currency:
            typeof item.currency === "string"
              ? item.currency
              : "NGN",

          status: item.status,

          method:
            typeof item.method === "string"
              ? item.method
              : null,

          failureReason: nullableString(
            item.failureReason,
          ),

          paidAt: nullableString(item.paidAt),
          createdAt: item.createdAt,
        },
      ];
    },
  );
}

/* =========================================================
   ORDER DETAIL PARSER
========================================================= */

function parseOrderDetail(
  value: unknown,
): OrderDetail | null {
  if (
    !isRecord(value) ||
    !isRecord(value.order)
  ) {
    return null;
  }

  const raw = value.order;

  const orderId = raw.id;
  const orderCode = raw.orderCode;
  const orderStatus = raw.status;
  const createdAt = raw.createdAt;

  const itemsSubtotal = getSafeInteger(
    raw.itemsSubtotal,
  );

  const deliveryFee = getSafeInteger(
    raw.deliveryFee,
  );

  const totalAmount = getSafeInteger(
    raw.totalAmount,
  );

  const deliveryRecipient = raw.deliveryRecipient;
  const deliveryPhone = raw.deliveryPhone;
  const deliveryAddress = raw.deliveryAddress;
  const deliveryArea = raw.deliveryArea;

  if (
    typeof orderId !== "string" ||
    typeof orderCode !== "string" ||
    typeof orderStatus !== "string" ||
    typeof createdAt !== "string" ||
    !isValidDateString(createdAt) ||
    itemsSubtotal === null ||
    deliveryFee === null ||
    totalAmount === null ||
    typeof deliveryRecipient !== "string" ||
    typeof deliveryPhone !== "string" ||
    typeof deliveryAddress !== "string" ||
    typeof deliveryArea !== "string"
  ) {
    return null;
  }

  // The order total must agree with its stored components.
  if (
    totalAmount !== itemsSubtotal + deliveryFee
  ) {
    return null;
  }

  const updatedAt =
    typeof raw.updatedAt === "string" &&
    isValidDateString(raw.updatedAt)
      ? raw.updatedAt
      : createdAt;

  return {
    id: orderId,
    orderCode,
    status: orderStatus,

    itemsSubtotal,
    deliveryFee,
    totalAmount,

    currency:
      typeof raw.currency === "string"
        ? raw.currency
        : "NGN",

    deliveryRecipient,
    deliveryPhone,
    deliveryAddress,
    deliveryArea,

    deliveryLandmark: nullableString(
      raw.deliveryLandmark,
    ),

    deliveryNotes: nullableString(
      raw.deliveryNotes,
    ),

    createdAt,
    updatedAt,

    completedAt: nullableString(raw.completedAt),
    cancelledAt: nullableString(raw.cancelledAt),

    sellerOrders: parseSellerOrders(
      raw.sellerOrders,
    ),

    payments: parsePayments(
      raw.payments,
    ),
  };
}

/* =========================================================
   SELLER FULFILMENT PROGRESS
========================================================= */

const fulfilmentSteps = [
  {
    status: "PENDING_ACCEPTANCE",
    label: "Awaiting seller response",
  },
  {
    status: "ACCEPTED",
    label: "Order accepted",
  },
  {
    status: "PROCESSING",
    label: "Preparing order",
  },
  {
    status: "READY_FOR_DISPATCH",
    label: "Ready for dispatch",
  },
  {
    status: "DISPATCHED",
    label: "Dispatched",
  },
  {
    status: "DELIVERED",
    label: "Delivered",
  },
  {
    status: "COMPLETED",
    label: "Completed",
  },
];

function getProgressIndex(
  status: string,
): number {
  return fulfilmentSteps.findIndex(
    (step) => step.status === status,
  );
}

/* =========================================================
   SELLER ORDER CARD
========================================================= */

function SellerOrderCard({
  sellerOrder,
  onConfirmDelivery,
  confirming,
}: {
  sellerOrder: SellerOrderView;
  onConfirmDelivery: (sellerOrderId: string) => void;
  confirming: boolean;
}) {
  const rejected =
    sellerOrder.status === "REJECTED";

  const cancelled =
    sellerOrder.status === "CANCELLED";

  const terminated = rejected || cancelled;

  const progressIndex = getProgressIndex(
    sellerOrder.status,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">

      {/* SELLER HEADING */}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0ECE7] bg-[#FCFAF6] p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-white text-[#9F2D18]">
            {sellerOrder.business.imageUrl ? (
              <img
                src={sellerOrder.business.imageUrl}
                alt={sellerOrder.business.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <Store className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold text-[#292522]">
              {sellerOrder.business.name}
            </p>

            <p className="mt-1 break-all text-[9px] text-[#91877E]">
              {sellerOrder.sellerOrderCode}
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${getStatusClass(sellerOrder.status)}`}
        >
          {getOrderStatusLabel(sellerOrder.status)}
        </span>
      </div>

      <div className="p-4 sm:p-5">

        {/* FULFILMENT PROGRESS */}

        <div>
          <h3 className="text-xs font-extrabold text-[#401B13]">
            Fulfilment progress
          </h3>

          {terminated ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-bold text-red-700">
                {rejected
                  ? "This seller rejected the order."
                  : "This seller order was cancelled."}
              </p>

              <p className="mt-1 text-[10px] text-red-600">
                {formatDateTime(
                  rejected
                    ? sellerOrder.rejectedAt
                    : sellerOrder.cancelledAt,
                )}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {fulfilmentSteps.map((step, index) => {
                const done = index <= progressIndex;
                const current = index === progressIndex;

                return (
                  <div
                    key={step.status}
                    className="flex items-center gap-3"
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        done
                          ? "bg-[#E9F9F0] text-[#16845D]"
                          : "border border-[#EAE6DF] bg-white text-[#B6A99E]"
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <span className="text-[10px] font-bold">
                          {index + 1}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[11px] ${
                          current
                            ? "font-extrabold text-[#9F2D18]"
                            : done
                              ? "font-semibold text-[#514840]"
                              : "text-[#91877E]"
                        }`}
                      >
                        {step.label}
                      </p>

                      {current && (
                        <p className="mt-0.5 text-[9px] text-[#91877E]">
                          Current status
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* BUYER DELIVERY CONFIRMATION */}

        {sellerOrder.status === "DELIVERED" && (
          <div className="mt-5 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16845D]" />

              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-[#137A59]">
                  The seller has marked this order as delivered.
                </p>

                <p className="mt-1 text-[10px] leading-5 text-[#42745F]">
                  Confirm only after you have received your products.
                </p>

                <button
                  type="button"
                  disabled={confirming}
                  onClick={() =>
                    onConfirmDelivery(sellerOrder.id)
                  }
                  className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#16845D] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#137A59] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {confirming ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}

                  {confirming
                    ? "Confirming..."
                    : "Confirm delivery"}
                </button>
              </div>
            </div>
          </div>
        )}

        {sellerOrder.status === "COMPLETED" && (
          <div className="mt-5 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] p-3">
            <p className="flex items-center gap-2 text-xs font-bold text-[#137A59]">
              <CheckCircle2 className="h-4 w-4" />
              You have confirmed delivery of this order.
            </p>

            {sellerOrder.completedAt && (
              <p className="mt-2 text-[10px] text-[#42745F]">
                Confirmed: {formatDateTime(sellerOrder.completedAt)}
              </p>
            )}
          </div>
        )}

        {/* PRODUCTS */}

        <div className="mt-5 border-t border-[#F0ECE7] pt-4">
          <h3 className="text-xs font-extrabold text-[#401B13]">
            Products from this seller
          </h3>

          <div className="mt-3 space-y-3">
            {sellerOrder.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-[#FCFAF6]">
                  {item.productImageUrl ? (
                    <img
                      src={item.productImageUrl}
                      alt={item.productName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-5 w-5 text-[#B6A99E]" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {item.productId ? (
                    <Link
                      href={`/product/${encodeURIComponent(item.productId)}`}
                      className="line-clamp-2 text-[11px] font-bold text-[#292522] hover:text-[#9F2D18]"
                    >
                      {item.productName}
                    </Link>
                  ) : (
                    <p className="line-clamp-2 text-[11px] font-bold text-[#292522]">
                      {item.productName}
                    </p>
                  )}

                  <p className="mt-1 text-[10px] text-[#91877E]">
                    {item.quantity} × {formatNaira(item.unitPrice)}
                  </p>
                </div>

                <p className="shrink-0 text-xs font-extrabold text-[#9F2D18]">
                  {formatNaira(item.lineTotal)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-[#F0ECE7] pt-3">
            <span className="text-[10px] font-semibold text-[#756B61]">
              Seller subtotal
            </span>

            <span className="text-sm font-black text-[#17202A]">
              {formatNaira(sellerOrder.subtotal)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   ORDER DETAIL CONTENT
========================================================= */

function OrderDetailContent({
  orderId,
}: {
  orderId: string;
}) {
  const router = useRouter();

  const [order, setOrder] =
    useState<OrderDetail | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [confirmingSellerOrderId, setConfirmingSellerOrderId] =
    useState<string | null>(null);

  const [deliveryMessage, setDeliveryMessage] =
    useState("");

  const [deliveryError, setDeliveryError] =
    useState("");

  /* =====================================================
     DERIVED VALUES
  ===================================================== */

  const productCount = useMemo(
    () =>
      order?.sellerOrders.reduce(
        (sum, sellerOrder) =>
          sum +
          sellerOrder.items.reduce(
            (itemSum, item) =>
              itemSum + item.quantity,
            0,
          ),
        0,
      ) ?? 0,
    [order],
  );

  /* =====================================================
     LOAD ORDER
  ===================================================== */

  useEffect(() => {
    if (
      !orderId ||
      orderId.length > MAX_ORDER_ID_LENGTH
    ) {
      setError("Invalid order reference.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadOrder() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(orderId)}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
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
              : "Unable to retrieve this order.",
          );
        }

        const parsed = parseOrderDetail(payload);

        if (!parsed) {
          throw new Error(
            "Order information could not be read.",
          );
        }

        if (controller.signal.aborted) {
          return;
        }

        setOrder(parsed);
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        if (!controller.signal.aborted) {
          console.error(
            "Load buyer order error:",
            loadError,
          );

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to retrieve this order.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadOrder();

    return () => controller.abort();
  }, [orderId, router]);

  /* =====================================================
     BUYER CONFIRMS DELIVERY
  ===================================================== */

  async function confirmDelivery(
    sellerOrderId: string,
  ) {
    if (confirmingSellerOrderId) {
      return;
    }

    const sellerOrder = order?.sellerOrders.find(
      (item) => item.id === sellerOrderId,
    );

    if (
      !sellerOrder ||
      sellerOrder.status !== "DELIVERED"
    ) {
      setDeliveryError(
        "This seller order is not ready for delivery confirmation.",
      );
      return;
    }

    const confirmed = window.confirm(
      "Have you received all the products in this seller's order? Only confirm if you have actually received them.",
    );

    if (!confirmed) {
      return;
    }

    setConfirmingSellerOrderId(sellerOrderId);
    setDeliveryError("");
    setDeliveryMessage("");

    try {
      const response = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/seller-orders/${encodeURIComponent(sellerOrderId)}/confirm-delivery`,
        {
          method: "PATCH",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
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
            : "Unable to confirm delivery.",
        );
      }

      if (
        !isRecord(payload) ||
        !isRecord(payload.sellerOrder) ||
        !isRecord(payload.order)
      ) {
        throw new Error(
          "The delivery confirmation response could not be read.",
        );
      }

      const updatedSellerOrderId =
        payload.sellerOrder.id;

      const updatedSellerStatus =
        payload.sellerOrder.status;

      const updatedParentStatus =
        payload.order.status;

      if (
        updatedSellerOrderId !== sellerOrderId ||
        updatedSellerStatus !== "COMPLETED" ||
        typeof updatedParentStatus !== "string"
      ) {
        throw new Error(
          "The delivery confirmation response is invalid.",
        );
      }

      const completedAt =
        typeof payload.sellerOrder.completedAt === "string"
          ? payload.sellerOrder.completedAt
          : new Date().toISOString();

      const parentCompletedAt =
        typeof payload.order.completedAt === "string"
          ? payload.order.completedAt
          : null;

      setOrder((current) => {
        if (!current) {
          return current;
        }

        const updatedSellerOrders =
          current.sellerOrders.map((item) => {
            if (item.id !== updatedSellerOrderId) {
              return item;
            }

            return {
              ...item,
              status: "COMPLETED",
              completedAt,
            };
          });

        return {
          ...current,
          status: updatedParentStatus,

          completedAt:
            updatedParentStatus === "COMPLETED"
              ? parentCompletedAt ?? completedAt
              : current.completedAt,

          sellerOrders: updatedSellerOrders,
        };
      });

      setDeliveryMessage(
        "Delivery confirmed successfully. Thank you.",
      );
    } catch (confirmError) {
      console.error(
        "Confirm delivery error:",
        confirmError,
      );

      setDeliveryError(
        confirmError instanceof Error
          ? confirmError.message
          : "Unable to confirm delivery.",
      );
    } finally {
      setConfirmingSellerOrderId(null);
    }
  }

  /* =====================================================
     LOADING
  ===================================================== */

  if (loading) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28">
          <div
            role="status"
            className="flex items-center gap-3 text-sm font-semibold text-[#756B61]"
          >
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
            Loading order details...
          </div>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     ERROR
  ===================================================== */

  if (error || !order) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28">
          <section className="w-full max-w-md rounded-2xl border border-[#F0C9BF] bg-[#FFF1ED] p-7 text-center">
            <Package className="mx-auto h-9 w-9 text-[#9F2D18]" />

            <h1 className="mt-4 text-lg font-extrabold text-[#17202A]">
              Order unavailable
            </h1>

            <p className="mt-2 text-sm leading-6 text-[#756B61]">
              {error ||
                "We could not find this order in your account."}
            </p>

            <Link
              href="/orders"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94E2C]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to my orders
            </Link>
          </section>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     DERIVED ORDER STATE
  ===================================================== */

  const allSellerOrdersFinished =
    order.sellerOrders.length > 0 &&
    order.sellerOrders.every(
      (sellerOrder) =>
        sellerOrder.status === "COMPLETED" ||
        sellerOrder.status === "CANCELLED" ||
        sellerOrder.status === "REJECTED",
    );

  /* =====================================================
     MAIN DISPLAY
  ===================================================== */

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10"
      >
        <div className="mx-auto max-w-[1100px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-8">

          {/* BREADCRUMB */}

          <div className="mb-5 flex flex-wrap items-center gap-2 text-[11px] text-[#756B61]">
            <Link href="/" className="hover:text-[#9F2D18]">
              Home
            </Link>

            <ChevronRight className="h-3 w-3" />

            <Link href="/orders" className="hover:text-[#9F2D18]">
              My orders
            </Link>

            <ChevronRight className="h-3 w-3" />

            <span className="font-bold text-[#9F2D18]">
              Order details
            </span>
          </div>

          {/* ORDER HEADING */}

          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link
                href="/orders"
                className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-bold text-[#9F2D18] hover:text-[#FF5A36]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to my orders
              </Link>

              <h1 className="text-2xl font-black tracking-tight text-[#401B13] sm:text-3xl">
                Order details
              </h1>

              <p className="mt-2 break-all text-xs font-bold text-[#9F2D18]">
                {order.orderCode}
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-2 text-[10px] font-bold ${getStatusClass(order.status)}`}
            >
              {getOrderStatusLabel(order.status)}
            </span>
          </div>

          {/* ORDER OVERVIEW */}

          <section className="mb-6 rounded-2xl border border-[#EAE6DF] bg-white p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                  Order date
                </p>

                <p className="mt-2 text-xs font-bold text-[#292522]">
                  {formatDateTime(order.createdAt)}
                </p>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                  Products
                </p>

                <p className="mt-2 text-xs font-bold text-[#292522]">
                  {productCount}{" "}
                  {productCount === 1 ? "item" : "items"}
                </p>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                  Sellers
                </p>

                <p className="mt-2 text-xs font-bold text-[#292522]">
                  {order.sellerOrders.length}
                </p>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                  Order total
                </p>

                <p className="mt-2 text-sm font-black text-[#9F2D18]">
                  {formatNaira(order.totalAmount)}
                </p>
              </div>
            </div>
          </section>

          {/* SELLER ORDER TRACKING */}

          <section className="mb-7">
            <div className="mb-4">
              <h2 className="text-base font-extrabold text-[#401B13]">
                Seller fulfilment
              </h2>

              <p className="mt-1 text-[11px] leading-5 text-[#756B61]">
                Each seller handles their own part of your order.
                Follow their individual progress below.
              </p>
            </div>

            {deliveryError && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"
              >
                {deliveryError}
              </div>
            )}

            {deliveryMessage && (
              <div
                role="status"
                className="mb-4 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] p-3 text-xs font-semibold text-[#137A59]"
              >
                {deliveryMessage}
              </div>
            )}

            {order.sellerOrders.length > 0 ? (
              <div className="space-y-4">
                {order.sellerOrders.map((sellerOrder) => (
                  <SellerOrderCard
                    key={sellerOrder.id}
                    sellerOrder={sellerOrder}
                    onConfirmDelivery={confirmDelivery}
                    confirming={
                      confirmingSellerOrderId === sellerOrder.id
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5 text-xs text-[#756B61]">
                Seller fulfilment records are not available for this order.
              </div>
            )}
          </section>

          {/* DELIVERY DETAILS */}

          <section className="mb-6 rounded-2xl border border-[#EAE6DF] bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                <MapPin className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-sm font-extrabold text-[#401B13]">
                  Delivery details
                </h2>

                <p className="mt-1 text-[10px] text-[#91877E]">
                  Delivery information supplied during checkout.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                  Recipient
                </p>

                <p className="mt-1 text-xs font-bold text-[#292522]">
                  {order.deliveryRecipient}
                </p>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                  Phone number
                </p>

                <p className="mt-1 text-xs font-bold text-[#292522]">
                  {order.deliveryPhone}
                </p>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                  Delivery address
                </p>

                <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-[#514840]">
                  {order.deliveryAddress}
                </p>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                  Area / neighbourhood
                </p>

                <p className="mt-1 text-xs font-bold text-[#292522]">
                  {order.deliveryArea}
                </p>
              </div>

              {order.deliveryLandmark && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                    Landmark
                  </p>

                  <p className="mt-1 text-xs text-[#514840]">
                    {order.deliveryLandmark}
                  </p>
                </div>
              )}

              {order.deliveryNotes && (
                <div className="sm:col-span-2">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-[#91877E]">
                    Delivery instructions
                  </p>

                  <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-[#514840]">
                    {order.deliveryNotes}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* ORDER PAYMENT SUMMARY */}

          <section className="mb-6 rounded-2xl border border-[#EAE6DF] bg-white p-5 sm:p-6">
            <h2 className="text-sm font-extrabold text-[#401B13]">
              Order summary
            </h2>

            <div className="mt-5 space-y-3">
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-[#756B61]">
                  Products subtotal
                </span>

                <span className="font-bold text-[#292522]">
                  {formatNaira(order.itemsSubtotal)}
                </span>
              </div>

              <div className="flex justify-between gap-3 text-xs">
                <span className="text-[#756B61]">
                  Delivery fee
                </span>

                <span className="font-semibold text-[#756B61]">
                  {formatNaira(order.deliveryFee)}
                </span>
              </div>

              <div className="flex justify-between gap-3 border-t border-[#EAE6DF] pt-4">
                <span className="text-sm font-extrabold text-[#292522]">
                  Order total
                </span>

                <span className="text-lg font-black text-[#9F2D18]">
                  {formatNaira(order.totalAmount)}
                </span>
              </div>
            </div>
          </section>

          {/* PAYMENT INFORMATION */}

          <section className="mb-6 rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" />

              <div className="min-w-0 flex-1">
                <h2 className="text-xs font-extrabold text-[#5E4730]">
                  Payment information
                </h2>

                {order.payments.length === 0 ? (
                  <p className="mt-2 text-[11px] leading-6 text-[#796B5C]">
                    No payment has been recorded for this order.
                    Payment arrangements will be confirmed separately.
                    This order reference is not a payment receipt.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {order.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="rounded-xl border border-[#F0D7B3] bg-white/70 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-extrabold text-[#5E4730]">
                            {formatNaira(payment.amount)}
                          </span>

                          <span
                            className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${getStatusClass(payment.status)}`}
                          >
                            {getOrderStatusLabel(payment.status)}
                          </span>
                        </div>

                        <p className="mt-2 text-[10px] text-[#796B5C]">
                          {payment.method
                            ? payment.method.replaceAll("_", " ")
                            : "Payment method not recorded"}
                        </p>

                        <p className="mt-1 text-[10px] text-[#91877E]">
                          Recorded: {formatDateTime(payment.createdAt)}
                        </p>

                        {payment.paidAt && (
                          <p className="mt-1 text-[10px] font-semibold text-[#16845D]">
                            Paid: {formatDateTime(payment.paidAt)}
                          </p>
                        )}

                        {payment.failureReason && (
                          <p className="mt-2 text-[10px] leading-5 text-red-600">
                            Payment information: {payment.failureReason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ORDER COMPLETION NOTICE */}

          {allSellerOrdersFinished && (
            <div className="mb-6 rounded-2xl border border-[#B8E5D2] bg-[#F0FBF5] p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#16845D]" />

                <p className="text-xs font-bold text-[#137A59]">
                  All seller orders have reached a final status.
                </p>
              </div>
            </div>
          )}

          {/* ORDER DATES */}

          <section className="mb-6 rounded-2xl border border-[#EAE6DF] bg-white p-5">
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#756B61]">
              <CalendarDays className="h-4 w-4 text-[#9F2D18]" />

              <span>
                Order created: {formatDateTime(order.createdAt)}
              </span>
            </div>

            {order.completedAt && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[#756B61]">
                <CheckCircle2 className="h-4 w-4 text-[#16845D]" />

                <span>
                  Order completed: {formatDateTime(order.completedAt)}
                </span>
              </div>
            )}

            {order.cancelledAt && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[#B42318]">
                <Clock3 className="h-4 w-4" />

                <span>
                  Order cancelled: {formatDateTime(order.cancelledAt)}
                </span>
              </div>
            )}
          </section>

          {/* FOOTER ACTIONS */}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/orders"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-5 py-3 text-xs font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
            >
              <ArrowLeft className="h-4 w-4" />
              My orders
            </Link>

            <Link
              href="/shop"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]"
            >
              Continue shopping
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <footer className="mt-10 flex items-center justify-center gap-3 pb-4 text-[10px] text-[#9B9188]">
            <span className="h-px w-12 bg-[#EAE6DF]" />

            <span>ReMarket · Find it nearby</span>

            <span className="h-px w-12 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>

      <MobileBottomNav />
    </>
  );
}

/* =========================================================
   PAGE ENTRY

   This is the ONLY default export in this file.
========================================================= */

export default function OrderDetailPage() {
  const params = useParams<{
    orderId: string;
  }>();

  const orderId =
    typeof params.orderId === "string"
      ? params.orderId
      : "";

  return (
    <OrderDetailContent
      key={orderId}
      orderId={orderId}
    />
  );
}