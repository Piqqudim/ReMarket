
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  LoaderCircle,
  MapPin,
  Package,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  XCircle,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_ORDER_TOTAL = 2_147_483_647;

const CART_CHANGED_EVENT = "remarket-cart-changed";

const CHECKOUT_IDEMPOTENCY_STORAGE_KEY =
  "remarket-checkout-idempotency";

/* =========================================================
   TYPES
========================================================= */

type CheckoutCartItem = {
  id: string;
  productId: string;

  businessId: string;
  businessName: string;

  name: string;
  imageUrl: string | null;

  quantity: number;

  unitPrice: number | null;
  originalPrice: number | null;
  lineTotal: number | null;

  purchasable: boolean;
  unavailableReason: string | null;
};

type CartGroup = {
  businessId: string;
  businessName: string;
  items: CheckoutCartItem[];
};

type DeliveryForm = {
  deliveryRecipient: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryArea: string;
  deliveryLandmark: string;
  deliveryNotes: string;
};

type CheckoutResult = {
  orderId: string;
  orderCode: string;
  sellerOrderCodes: string[];
};

type CartResponse = {
  items: CheckoutCartItem[];
  itemCount: number;
  subtotal: number;
  currency: string;
};

type StoredCheckoutAttempt = {
  key: string;
  fingerprint: string;
};

/* =========================================================
   INITIAL FORM
========================================================= */

const initialDeliveryForm: DeliveryForm = {
  deliveryRecipient: "",
  deliveryPhone: "",
  deliveryAddress: "",
  deliveryArea: "",
  deliveryLandmark: "",
  deliveryNotes: "",
};

/* =========================================================
   GENERAL HELPERS
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

function getString(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.trim();

  return cleaned || fallback;
}

function getSafeInteger(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value)
  ) {
    return null;
  }

  return value;
}

function isNotDeleted(
  value: unknown,
): boolean {
  return value === null || value === undefined;
}

function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function dispatchCartChanged() {
  window.dispatchEvent(
    new Event(CART_CHANGED_EVENT),
  );
}

/* =========================================================
   ORIGINAL PRICE VALIDATION

   originalPrice is only for displaying a discount.

   It is never used in the checkout calculation.
========================================================= */

function getValidOriginalPrice(
  rawOriginalPrice: unknown,
  unitPrice: number | null,
): number | null {
  const originalPrice =
    getSafeInteger(rawOriginalPrice);

  if (
    unitPrice === null ||
    unitPrice <= 0 ||
    originalPrice === null ||
    originalPrice <= unitPrice ||
    originalPrice > MAX_ORDER_TOTAL
  ) {
    return null;
  }

  return originalPrice;
}

/* =========================================================
   CART RESPONSE PARSER

   Expected API response:

   {
     items: [
       {
         id,
         productId,
         quantity,
         product: {
           id,
           name,
           price,
           originalPrice,
           stockQuantity,
           imageUrl,
           status,
           availability,
           deletedAt,
           images,
           business: {
             id,
             name,
             status,
             deletedAt
           }
         },
         lineTotal,
         purchasable,
         unavailableReason
       }
     ]
   }
========================================================= */

function parseCheckoutCart(
  value: unknown,
): CartResponse | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items)
  ) {
    return null;
  }

  const items: CheckoutCartItem[] = [];

  for (const rawItem of value.items) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const product = isRecord(rawItem.product)
      ? rawItem.product
      : null;

    const business =
      product && isRecord(product.business)
        ? product.business
        : null;

    const quantity =
      getSafeInteger(rawItem.quantity);

    const productId =
      getString(rawItem.productId) ??
      getString(product?.id);

    if (
      typeof rawItem.id !== "string" ||
      !productId ||
      quantity === null ||
      quantity < 1
    ) {
      continue;
    }

    /* BUSINESS */

    const businessName = getString(
      business?.name,
      "Business unavailable",
    )!;

    const businessId = getString(
      business?.id,
      `business:${businessName}`,
    )!;

    /* PRODUCT */

    const productName = getString(
      product?.name,
      "Product unavailable",
    )!;

    const unitPrice =
      getSafeInteger(product?.price);

    const originalPrice =
      getValidOriginalPrice(
        product?.originalPrice,
        unitPrice,
      );

    /* STOCK */

    const stockFieldExists =
      product !== null &&
      Object.prototype.hasOwnProperty.call(
        product,
        "stockQuantity",
      );

    const rawStockQuantity =
      product?.stockQuantity;

    const stockQuantity =
      rawStockQuantity === null
        ? null
        : getSafeInteger(rawStockQuantity);

    const validStockInformation =
      stockFieldExists &&
      (
        rawStockQuantity === null ||
        (
          stockQuantity !== null &&
          stockQuantity >= 0
        )
      );

    const enoughStock =
      validStockInformation &&
      (
        stockQuantity === null ||
        (
          stockQuantity !== null &&
          stockQuantity >= quantity
        )
      );

    /* PRODUCT STATUS */

    const productAvailable =
      product !== null &&
      product.status === "ACTIVE" &&
      isNotDeleted(product.deletedAt) &&
      product.availability === "AVAILABLE" &&
      business !== null &&
      business.status === "ACTIVE" &&
      isNotDeleted(business.deletedAt);

    /* PRICE VALIDATION */

    const validFixedPrice =
      unitPrice !== null &&
      unitPrice > 0 &&
      unitPrice <= MAX_ORDER_TOTAL;

    const validQuantity =
      quantity <= MAX_QUANTITY_PER_PRODUCT;

    const calculatedLineTotal =
      validFixedPrice && unitPrice !== null
        ? unitPrice * quantity
        : null;

    const validCalculatedTotal =
      calculatedLineTotal !== null &&
      Number.isSafeInteger(calculatedLineTotal) &&
      calculatedLineTotal > 0 &&
      calculatedLineTotal <= MAX_ORDER_TOTAL;

    /*
     * If the API provides lineTotal, compare it with
     * current price multiplied by quantity.
     */

    const apiLineTotalExists =
      rawItem.lineTotal !== null &&
      rawItem.lineTotal !== undefined;

    const apiLineTotal =
      getSafeInteger(rawItem.lineTotal);

    const lineTotalMatches =
      !apiLineTotalExists ||
      (
        apiLineTotal !== null &&
        apiLineTotal === calculatedLineTotal
      );

    const lineTotal =
      validCalculatedTotal
        ? calculatedLineTotal
        : null;

    /* PURCHASABILITY */

    const purchasable =
      rawItem.purchasable === true &&
      productAvailable &&
      validFixedPrice &&
      validQuantity &&
      validStockInformation &&
      enoughStock &&
      validCalculatedTotal &&
      lineTotalMatches;

    /* PRODUCT IMAGE */

    const images = Array.isArray(
      product?.images,
    )
      ? product.images
      : [];

    const firstImage = images.find(isRecord);

    const imageUrl =
      getString(product?.imageUrl) ??
      getString(firstImage?.imageUrl) ??
      getString(firstImage?.url);

    /* UNAVAILABLE REASON */

    let unavailableReason: string | null = null;

    if (!validQuantity) {
      unavailableReason =
        `You can purchase up to ${MAX_QUANTITY_PER_PRODUCT} units of one product.`;
    } else if (!productAvailable) {
      unavailableReason =
        "This product or its business is no longer available.";
    } else if (!validFixedPrice) {
      unavailableReason =
        "This product does not have a confirmed fixed price.";
    } else if (!validStockInformation) {
      unavailableReason =
        "The stock information for this product is unavailable.";
    } else if (!enoughStock) {
      unavailableReason =
        "The requested quantity exceeds the available stock.";
    } else if (!validCalculatedTotal) {
      unavailableReason =
        "The product total exceeds the maximum allowed order value.";
    } else if (!lineTotalMatches) {
      unavailableReason =
        "The product price has changed. Return to your cart and refresh it.";
    } else if (!purchasable) {
      unavailableReason =
        getString(rawItem.unavailableReason) ??
        "This product is unavailable for checkout.";
    }

    items.push({
      id: rawItem.id,
      productId,

      businessId,
      businessName,

      name: productName,
      imageUrl,

      quantity,

      unitPrice,
      originalPrice,
      lineTotal,

      purchasable,
      unavailableReason,
    });
  }

  const itemCount = items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const calculatedSubtotal = items.reduce(
    (sum, item) => {
      if (
        !item.purchasable ||
        item.lineTotal === null
      ) {
        return sum;
      }

      return sum + item.lineTotal;
    },
    0,
  );

  return {
    items,
    itemCount,
    subtotal: calculatedSubtotal,

    currency:
      typeof value.currency === "string"
        ? value.currency
        : "NGN",
  };
}

/* =========================================================
   CART FINGERPRINT

   Used to determine whether a saved checkout key
   belongs to the current cart.

   A different cart receives a different key.
========================================================= */

function createCartFingerprint(
  items: CheckoutCartItem[],
): string {
  const snapshot = items
    .map((item) => ({
      id: item.id,
      productId: item.productId,
      businessId: item.businessId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify(snapshot);
}

/* =========================================================
   GROUP CART ITEMS BY SELLER
========================================================= */

function groupCartItems(
  items: CheckoutCartItem[],
): CartGroup[] {
  const groups = new Map<string, CartGroup>();

  for (const item of items) {
    if (!groups.has(item.businessId)) {
      groups.set(item.businessId, {
        businessId: item.businessId,
        businessName: item.businessName,
        items: [],
      });
    }

    groups.get(item.businessId)?.items.push(item);
  }

  return Array.from(groups.values());
}

/* =========================================================
   CHECKOUT RESPONSE PARSER

   Expected API response:

   {
     order: {
       id,
       orderCode
     },
     sellerOrders: [
       {
         sellerOrderCode
       }
     ]
   }
========================================================= */

function parseCheckoutResult(
  value: unknown,
): CheckoutResult | null {
  if (
    !isRecord(value) ||
    !isRecord(value.order) ||
    typeof value.order.id !== "string" ||
    typeof value.order.orderCode !== "string"
  ) {
    return null;
  }

  const sellerOrderCodes = Array.isArray(
    value.sellerOrders,
  )
    ? value.sellerOrders.flatMap((item) => {
        if (
          isRecord(item) &&
          typeof item.sellerOrderCode === "string"
        ) {
          return [item.sellerOrderCode];
        }

        return [];
      })
    : [];

  return {
    orderId: value.order.id,
    orderCode: value.order.orderCode,
    sellerOrderCodes,
  };
}

/* =========================================================
   SMALL PROGRESS COMPONENT
========================================================= */

function CheckoutProgress() {
  const steps = [
    {
      number: "01",
      label: "Shopping cart",
      status: "complete",
    },
    {
      number: "02",
      label: "Delivery and review",
      status: "active",
    },
    {
      number: "03",
      label: "Confirmation",
      status: "upcoming",
    },
  ] as const;

  return (
    <div className="mb-7 rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">

      <div className="grid grid-cols-3 gap-2">

        {steps.map((step, index) => (
          <div
            key={step.number}
            className="relative min-w-0"
          >
            <div className="flex items-center gap-2">

              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${
                  step.status === "complete"
                    ? "bg-[#E8F8F0] text-[#16845D]"
                    : step.status === "active"
                      ? "bg-[#FF5A36] text-white"
                      : "bg-[#F1EEEA] text-[#91877E]"
                }`}
              >
                {step.status === "complete" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  step.number
                )}
              </span>

              <div className="min-w-0">
                <p
                  className={`truncate text-[9px] font-bold sm:text-[11px] ${
                    step.status === "active"
                      ? "text-[#9F2D18]"
                      : step.status === "complete"
                        ? "text-[#16845D]"
                        : "text-[#91877E]"
                  }`}
                >
                  {step.label}
                </p>

                <p className="mt-0.5 hidden text-[9px] text-[#A69D94] sm:block">
                  {step.status === "complete"
                    ? "Completed"
                    : step.status === "active"
                      ? "Current step"
                      : "Next"}
                </p>
              </div>
            </div>

            {index < steps.length - 1 && (
              <div
                aria-hidden="true"
                className="absolute -right-1 top-4 hidden h-px w-4 bg-[#EAE6DF] sm:block"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   DELIVERY INPUT STYLE
========================================================= */

const inputClassName =
  "w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3 text-xs text-[#292522] outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white focus:ring-2 focus:ring-[#FF5A36]/10";

const labelClassName =
  "mb-2 block text-xs font-bold text-[#514840]";

/* =========================================================
   MAIN CHECKOUT PAGE
========================================================= */

export default function CheckoutPage() {
  const router = useRouter();

  /* =====================================================
     CART STATE
  ===================================================== */

  const [items, setItems] = useState<CheckoutCartItem[]>([]);

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  /* =====================================================
     DELIVERY FORM
  ===================================================== */

  const [form, setForm] =
    useState<DeliveryForm>(initialDeliveryForm);

  /* =====================================================
     SUBMISSION STATE
  ===================================================== */

  const [submitting, setSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState("");

  const [result, setResult] =
    useState<CheckoutResult | null>(null);

  /*
   * Keeps the current key in memory.
   *
   * sessionStorage also preserves it across a page
   * refresh within the same browser tab.
   */
  const idempotencyKeyRef =
    useRef<StoredCheckoutAttempt | null>(null);

  /* =====================================================
     IDEMPOTENCY KEY HELPERS
  ===================================================== */

  const getOrCreateCheckoutKey = useCallback(
    (fingerprint: string): string => {
      /*
       * Reuse the current key for this exact cart.
       */

      if (
        idempotencyKeyRef.current?.fingerprint ===
        fingerprint
      ) {
        return idempotencyKeyRef.current.key;
      }

      /*
       * Check sessionStorage so the key survives
       * a page refresh.
       */

      try {
        const saved = window.sessionStorage.getItem(
          CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
        );

        if (saved) {
          const parsed: unknown = JSON.parse(saved);

          if (
            isRecord(parsed) &&
            typeof parsed.key === "string" &&
            /^[A-Za-z0-9._:-]{16,100}$/.test(
              parsed.key,
            ) &&
            parsed.fingerprint === fingerprint
          ) {
            const record: StoredCheckoutAttempt = {
              key: parsed.key,
              fingerprint,
            };

            idempotencyKeyRef.current = record;

            return record.key;
          }
        }
      } catch {
        /*
         * If storage is unavailable or contains invalid
         * data, generate a new key.
         */
      }

      /*
       * Generate a new unique checkout key.
       */

      const randomPart =
        typeof window.crypto?.randomUUID === "function"
          ? window.crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2)}`;

      const record: StoredCheckoutAttempt = {
        key: `rm-${randomPart}`,
        fingerprint,
      };

      idempotencyKeyRef.current = record;

      try {
        window.sessionStorage.setItem(
          CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
          JSON.stringify(record),
        );
      } catch {
        /*
         * The in-memory key still works for retries
         * while this page remains open.
         */
      }

      return record.key;
    },
    [],
  );

  /*
   * Clear the checkout key after successful confirmation.
   */

  const clearCheckoutAttempt = useCallback(() => {
    idempotencyKeyRef.current = null;

    try {
      window.sessionStorage.removeItem(
        CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
      );
    } catch {
      // Storage may be unavailable.
    }
  }, []);

  /* =====================================================
     CART CALCULATIONS
  ===================================================== */

  const itemCount = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
    [items],
  );

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          item.purchasable
            ? sum + (item.lineTotal ?? 0)
            : sum,
        0,
      ),
    [items],
  );

  const unavailableItems = useMemo(
    () =>
      items.filter(
        (item) => !item.purchasable,
      ),
    [items],
  );

  const groups = useMemo(
    () => groupCartItems(items),
    [items],
  );

  const cartFingerprint = useMemo(
    () => createCartFingerprint(items),
    [items],
  );

  const allLineTotalsValid = items.every(
    (item) =>
      item.purchasable &&
      item.lineTotal !== null &&
      Number.isSafeInteger(item.lineTotal) &&
      item.lineTotal > 0,
  );

  const validSubtotal =
    Number.isSafeInteger(subtotal) &&
    subtotal > 0 &&
    subtotal <= MAX_ORDER_TOTAL;

  const canCheckout =
    items.length > 0 &&
    unavailableItems.length === 0 &&
    allLineTotalsValid &&
    validSubtotal &&
    !submitting;

  /* =====================================================
     FORM HANDLING
  ===================================================== */

  function updateField(
    field: keyof DeliveryForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  /* =====================================================
     LOAD CART
  ===================================================== */

  const loadCart = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch("/api/cart", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",

          headers: {
            Accept: "application/json",
          },

          signal,
        });

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
              : "Unable to load your shopping cart.",
          );
        }

        const parsed = parseCheckoutCart(payload);

        if (!parsed) {
          throw new Error(
            "We could not read your cart information.",
          );
        }

        if (signal.aborted) {
          return;
        }

        /*
         * Do not clear the saved checkout key merely
         * because the cart is empty.
         *
         * The server may already have created an order
         * while the browser did not receive its response.
         *
         * A different cart will automatically receive
         * a different key when checkout is started.
         */

        setItems(parsed.items);

      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (!signal.aborted) {
          console.error(
            "Checkout cart error:",
            error,
          );

          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load your cart.",
          );
        }

      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [router],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadCart(controller.signal);

    return () => controller.abort();
  }, [loadCart, refreshKey]);

  /* =====================================================
     RETRY CART LOADING
  ===================================================== */

  function retryLoadingCart() {
    setRefreshKey((current) => current + 1);
  }

  /* =====================================================
     PLACE ORDER
  ===================================================== */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!canCheckout || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    /*
     * Get or reuse the key for this exact cart.
     */

    const idempotencyKey =
      getOrCreateCheckoutKey(cartFingerprint);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",

        credentials: "same-origin",

        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",

          /*
           * Required by the updated checkout API.
           */

          "Idempotency-Key": idempotencyKey,
        },

        body: JSON.stringify({
          deliveryRecipient:
            form.deliveryRecipient.trim(),

          deliveryPhone:
            form.deliveryPhone.trim(),

          deliveryAddress:
            form.deliveryAddress.trim(),

          deliveryArea:
            form.deliveryArea.trim(),

          deliveryLandmark:
            form.deliveryLandmark.trim(),

          deliveryNotes:
            form.deliveryNotes.trim(),
        }),
      });

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
            : "We could not place your order. Please try again.",
        );
      }

      const checkoutResult =
        parseCheckoutResult(payload);

      /*
       * The server returned success, but the confirmation
       * could not be read.
       *
       * Keep the key so the buyer can retry the same
       * request and retrieve the existing order.
       */

      if (!checkoutResult) {
        throw new Error(
          "The server may have received your order, but we could not read its confirmation. Submit again to safely retrieve the same order.",
        );
      }

      /*
       * Clear the saved key only after successfully
       * reading the server's order confirmation.
       */

      clearCheckoutAttempt();

      setResult(checkoutResult);
      setItems([]);

      dispatchCartChanged();

    } catch (error) {
      console.error(
        "Checkout submission error:",
        error,
      );

      const message =
        error instanceof TypeError
          ? "We could not confirm whether your order was submitted. Please try again. The same checkout request key will be reused to prevent a duplicate order."
          : error instanceof Error
            ? error.message
            : "Something went wrong while placing your order.";

      setSubmitError(message);

    } finally {
      setSubmitting(false);
    }
  }

  /* =====================================================
     LOADING STATE
  ===================================================== */

  if (loading) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="flex min-h-[70vh] items-center justify-center bg-[#FCFAF6] px-4 pb-28">

          <div className="w-full max-w-sm rounded-[24px] border border-[#EAE6DF] bg-white p-8 text-center shadow-sm">

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#9F2D18]">
              <ShoppingBag className="h-8 w-8" />
            </div>

            <LoaderCircle className="mx-auto mt-6 h-5 w-5 animate-spin text-[#FF5A36]" />

            <h1 className="mt-4 text-base font-extrabold text-[#401B13]">
              Preparing your checkout
            </h1>

            <p className="mt-2 text-xs leading-6 text-[#756B61]">
              Checking your selected products and availability.
            </p>
          </div>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     ORDER SUCCESS SCREEN
  ===================================================== */

  if (result) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="min-h-dvh bg-[#FCFAF6] px-4 pb-28 pt-10 lg:pb-12">

          <section className="mx-auto max-w-2xl overflow-hidden rounded-[26px] border border-[#EAE6DF] bg-white shadow-[0_8px_35px_rgba(23,32,42,0.05)]">

            {/* SUCCESS HEADER */}

            <div className="bg-gradient-to-br from-[#F0FBF5] to-[#FFFDFC] px-6 py-9 text-center sm:px-10">

              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#DCFCE7] text-[#16845D]">
                <CheckCircle2 className="h-11 w-11" />
              </div>

              <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#16845D]">
                Order submitted
              </p>

              <h1 className="mt-2 text-2xl font-black tracking-tight text-[#401B13] sm:text-3xl">
                Your order request is in!
              </h1>

              <p className="mx-auto mt-3 max-w-md text-xs leading-6 text-[#756B61]">
                ReMarket has received your order request.
                Keep your order reference for future enquiries.
              </p>
            </div>

            <div className="space-y-5 p-5 sm:p-8">

              {/* ORDER REFERENCE */}

              <div className="rounded-2xl border border-[#FFD9CE] bg-[#FFF1ED] p-5 text-center">

                <p className="text-[10px] font-bold uppercase tracking-wide text-[#91877E]">
                  Your ReMarket order reference
                </p>

                <p className="mt-2 break-all text-xl font-black text-[#9F2D18]">
                  {result.orderCode}
                </p>

                <p className="mt-2 text-[10px] leading-5 text-[#756B61]">
                  Keep this reference for order enquiries.
                </p>
              </div>

              {/* SELLER REFERENCES */}

              {result.sellerOrderCodes.length > 0 && (
                <div className="rounded-2xl border border-[#EAE6DF] p-5">

                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-[#FF5A36]" />

                    <h2 className="text-xs font-extrabold text-[#401B13]">
                      Seller order references
                    </h2>
                  </div>

                  <div className="mt-4 space-y-2">
                    {result.sellerOrderCodes.map(
                      (code, index) => (
                        <div
                          key={`${code}-${index}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FCFAF6] px-3 py-3"
                        >
                          <span className="text-[10px] font-semibold text-[#756B61]">
                            Seller order {index + 1}
                          </span>

                          <span className="break-all text-[11px] font-extrabold text-[#9F2D18]">
                            {code}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {/* PAYMENT INFORMATION */}

              <div className="rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-4">

                <div className="flex items-start gap-3">

                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" />

                  <div>
                    <h2 className="text-xs font-extrabold text-[#5E4730]">
                      No payment has been collected
                    </h2>

                    <p className="mt-1.5 text-[11px] leading-6 text-[#796B5C]">
                      This confirms order submission, not payment
                      or seller acceptance. ReMarket will
                      communicate the next steps for payment
                      and fulfilment separately.
                    </p>
                  </div>
                </div>
              </div>

              {/* NEXT STEPS */}

              <div className="rounded-2xl border border-[#EAE6DF] p-5">

                <h2 className="text-xs font-extrabold text-[#401B13]">
                  What happens next?
                </h2>

                <div className="mt-4 space-y-4">

                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF1ED] text-[10px] font-extrabold text-[#9F2D18]">
                      1
                    </span>

                    <div>
                      <p className="text-[11px] font-bold text-[#514840]">
                        Order review
                      </p>

                      <p className="mt-1 text-[10px] leading-5 text-[#91877E]">
                        The submitted order will need to be reviewed
                        and accepted by the relevant sellers.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF1ED] text-[10px] font-extrabold text-[#9F2D18]">
                      2
                    </span>

                    <div>
                      <p className="text-[11px] font-bold text-[#514840]">
                        Delivery and payment arrangements
                      </p>

                      <p className="mt-1 text-[10px] leading-5 text-[#91877E]">
                        The applicable arrangements will be
                        communicated separately.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTION */}

              <Link
                href="/shop"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]"
              >
                Continue shopping
                <ArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href="/"
                className="flex justify-center text-xs font-bold text-[#9F2D18] hover:text-[#FF5A36]"
              >
                Return to ReMarket home
              </Link>

            </div>
          </section>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     CART LOADING ERROR
  ===================================================== */

  if (loadError) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="flex min-h-[65vh] items-center justify-center bg-[#FCFAF6] px-4 pb-28">

          <section className="w-full max-w-md rounded-[24px] border border-[#F0C9BF] bg-white p-7 text-center shadow-sm">

            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#9F2D18]">
              <Package className="h-7 w-7" />
            </div>

            <h1 className="mt-4 text-lg font-extrabold text-[#401B13]">
              Checkout unavailable
            </h1>

            <p className="mt-2 text-xs leading-6 text-[#756B61]">
              {loadError}
            </p>

            <button
              type="button"
              onClick={retryLoadingCart}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94E2C]"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>

            <Link
              href="/cart"
              className="mt-4 flex justify-center text-xs font-bold text-[#9F2D18]"
            >
              Return to cart
            </Link>

          </section>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     EMPTY CART
  ===================================================== */

  if (items.length === 0) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="flex min-h-[65vh] items-center justify-center bg-[#FCFAF6] px-4 pb-28">

          <section className="w-full max-w-md rounded-[24px] border border-[#EAE6DF] bg-white p-8 text-center shadow-sm">

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#9F2D18]">
              <PackageOpen className="h-8 w-8" />
            </div>

            <h1 className="mt-5 text-xl font-black text-[#401B13]">
              Your cart is empty
            </h1>

            <p className="mt-2 text-xs leading-6 text-[#756B61]">
              Add products to your cart before proceeding
              to checkout.
            </p>

            <Link
              href="/shop"
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94E2C]"
            >
              Explore products
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/cart"
              className="mt-4 flex justify-center text-xs font-bold text-[#9F2D18]"
            >
              Return to cart
            </Link>

          </section>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     MAIN CHECKOUT
  ===================================================== */

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh overflow-x-clip bg-[#FCFAF6] pb-28 text-[#17202A] lg:pb-10"
      >
        <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">

          {/* =====================================
              BREADCRUMB
          ===================================== */}

          <nav
            aria-label="Breadcrumb"
            className="mb-5 flex items-center gap-2 text-[11px] text-[#756B61]"
          >
            <Link
              href="/"
              className="transition hover:text-[#9F2D18]"
            >
              Home
            </Link>

            <ChevronRight className="h-3 w-3" />

            <Link
              href="/cart"
              className="transition hover:text-[#9F2D18]"
            >
              Cart
            </Link>

            <ChevronRight className="h-3 w-3" />

            <span className="font-bold text-[#9F2D18]">
              Checkout
            </span>
          </nav>

          {/* =====================================
              CHECKOUT HEADER
          ===================================== */}

          <section className="mb-6 overflow-hidden rounded-[24px] border border-[#F3D6CC] bg-gradient-to-br from-[#FFF1ED] via-white to-[#FFF7ED] p-5 sm:p-7">

            <div className="flex flex-wrap items-center justify-between gap-5">

              <div className="max-w-2xl">

                <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD9CE] bg-white/80 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#9F2D18]">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  ReMarket secure order submission
                </div>

                <h1 className="mt-4 text-[29px] font-black tracking-tight text-[#401B13] sm:text-[36px]">
                  Checkout
                </h1>

                <p className="mt-2 max-w-xl text-xs leading-6 text-[#756B61] sm:text-sm">
                  Confirm your delivery information, review
                  products from each seller, and submit
                  your order.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-white bg-white/85 px-4 py-3 shadow-sm">

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                  <Package className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-[#91877E]">
                    Your order
                  </p>

                  <p className="mt-1 text-sm font-black text-[#401B13]">
                    {itemCount}{" "}
                    {itemCount === 1 ? "item" : "items"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* =====================================
              PROGRESS
          ===================================== */}

          <CheckoutProgress />

          {/* =====================================
              UNAVAILABLE PRODUCTS
          ===================================== */}

          {unavailableItems.length > 0 && (
            <div
              role="alert"
              className="mb-6 rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0C9] text-[#96610D]">
                  <XCircle className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">

                  <h2 className="text-xs font-extrabold text-[#5E4730]">
                    Some products need attention
                  </h2>

                  <p className="mt-1 text-[10px] leading-5 text-[#796B5C]">
                    You cannot submit this order until the
                    unavailable products are addressed.
                  </p>

                  <div className="mt-3 space-y-2">

                    {unavailableItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl bg-white/70 px-3 py-2"
                      >
                        <p className="text-[10px] font-bold text-[#5E4730]">
                          {item.name}
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-[#796B5C]">
                          {item.unavailableReason ??
                            "This product is unavailable for checkout."}
                        </p>
                      </div>
                    ))}
                  </div>

                  <Link
                    href="/cart"
                    className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[#9F2D18]"
                  >
                    Return to cart
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* =====================================
              CHECKOUT FORM
          ===================================== */}

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_390px] xl:gap-8"
          >

            {/* =================================
                LEFT COLUMN
            ================================= */}

            <div className="min-w-0 space-y-5">

              {/* DELIVERY DETAILS */}

              <section className="overflow-hidden rounded-[22px] border border-[#EAE6DF] bg-white">

                <div className="flex items-center gap-3 border-b border-[#F0ECE7] px-5 py-5 sm:px-6">

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                    <MapPin className="h-5 w-5" />
                  </div>

                  <div>
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#FF5A36]">
                      Step 1 · Delivery
                    </p>

                    <h2 className="mt-1 text-sm font-extrabold text-[#401B13]">
                      Delivery information
                    </h2>

                    <p className="mt-1 text-[10px] text-[#91877E]">
                      Tell us where your order should be delivered.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 sm:p-6">

                  {/* RECIPIENT */}

                  <div>
                    <label
                      htmlFor="deliveryRecipient"
                      className={labelClassName}
                    >
                      Recipient's full name
                      <span className="text-[#FF5A36]"> *</span>
                    </label>

                    <input
                      id="deliveryRecipient"
                      type="text"
                      name="deliveryRecipient"
                      value={form.deliveryRecipient}
                      onChange={(event) =>
                        updateField(
                          "deliveryRecipient",
                          event.target.value,
                        )
                      }
                      placeholder="Who will receive this order?"
                      autoComplete="name"
                      minLength={2}
                      maxLength={100}
                      required
                      className={inputClassName}
                    />
                  </div>

                  {/* PHONE */}

                  <div>
                    <label
                      htmlFor="deliveryPhone"
                      className={labelClassName}
                    >
                      Phone number
                      <span className="text-[#FF5A36]"> *</span>
                    </label>

                    <input
                      id="deliveryPhone"
                      type="tel"
                      name="deliveryPhone"
                      value={form.deliveryPhone}
                      onChange={(event) =>
                        updateField(
                          "deliveryPhone",
                          event.target.value,
                        )
                      }
                      placeholder="08012345678"
                      autoComplete="tel"
                      maxLength={30}
                      pattern="[+]?[0-9() -]{7,30}"
                      required
                      className={inputClassName}
                    />
                  </div>

                  {/* ADDRESS */}

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="deliveryAddress"
                      className={labelClassName}
                    >
                      Full delivery address
                      <span className="text-[#FF5A36]"> *</span>
                    </label>

                    <textarea
                      id="deliveryAddress"
                      name="deliveryAddress"
                      value={form.deliveryAddress}
                      onChange={(event) =>
                        updateField(
                          "deliveryAddress",
                          event.target.value,
                        )
                      }
                      placeholder="House number, street name, estate or building..."
                      autoComplete="street-address"
                      rows={3}
                      minLength={5}
                      maxLength={300}
                      required
                      className={`${inputClassName} resize-y leading-6`}
                    />
                  </div>

                  {/* AREA */}

                  <div>
                    <label
                      htmlFor="deliveryArea"
                      className={labelClassName}
                    >
                      Area / Neighbourhood
                      <span className="text-[#FF5A36]"> *</span>
                    </label>

                    <input
                      id="deliveryArea"
                      type="text"
                      name="deliveryArea"
                      value={form.deliveryArea}
                      onChange={(event) =>
                        updateField(
                          "deliveryArea",
                          event.target.value,
                        )
                      }
                      placeholder="e.g. Ogba, Ikeja"
                      autoComplete="address-level2"
                      minLength={2}
                      maxLength={100}
                      required
                      className={inputClassName}
                    />
                  </div>

                  {/* LANDMARK */}

                  <div>
                    <label
                      htmlFor="deliveryLandmark"
                      className={labelClassName}
                    >
                      Nearby landmark
                      <span className="ml-1 text-[10px] font-normal text-[#91877E]">
                        Optional
                      </span>
                    </label>

                    <input
                      id="deliveryLandmark"
                      type="text"
                      name="deliveryLandmark"
                      value={form.deliveryLandmark}
                      onChange={(event) =>
                        updateField(
                          "deliveryLandmark",
                          event.target.value,
                        )
                      }
                      placeholder="e.g. Near a filling station"
                      maxLength={150}
                      className={inputClassName}
                    />
                  </div>

                  {/* NOTES */}

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="deliveryNotes"
                      className={labelClassName}
                    >
                      Additional delivery instructions
                      <span className="ml-1 text-[10px] font-normal text-[#91877E]">
                        Optional
                      </span>
                    </label>

                    <textarea
                      id="deliveryNotes"
                      name="deliveryNotes"
                      value={form.deliveryNotes}
                      onChange={(event) =>
                        updateField(
                          "deliveryNotes",
                          event.target.value,
                        )
                      }
                      placeholder="Anything that will help with delivery..."
                      rows={2}
                      maxLength={300}
                      className={`${inputClassName} resize-y leading-6`}
                    />
                  </div>
                </div>
              </section>

              {/* DELIVERY ARRANGEMENTS */}

              <section className="rounded-[22px] border border-[#EAE6DF] bg-white p-5 sm:p-6">

                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                    <Truck className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="text-xs font-extrabold text-[#401B13]">
                      Delivery arrangements
                    </h2>

                    <p className="mt-2 text-[11px] leading-6 text-[#756B61]">
                      Your delivery address will be provided
                      for fulfilment. Delivery fees and
                      arrangements are not calculated at this
                      stage and will be confirmed separately.
                    </p>
                  </div>
                </div>
              </section>

              {/* PAYMENT NOTICE */}

              <section className="rounded-[22px] border border-[#F0D7B3] bg-[#FFF8EC] p-5 sm:p-6">

                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0C9] text-[#9F2D18]">
                    <ShieldCheck className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="text-xs font-extrabold text-[#5E4730]">
                      Payment information
                    </h2>

                    <p className="mt-2 text-[11px] leading-6 text-[#796B5C]">
                      No payment is collected when you submit
                      your order. The order is sent for review
                      and seller acceptance. Payment
                      arrangements will be communicated
                      separately.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* =================================
                RIGHT COLUMN: ORDER REVIEW
            ================================= */}

            <aside className="min-w-0 lg:sticky lg:top-24">

              <section className="overflow-hidden rounded-[22px] border border-[#EAE6DF] bg-white shadow-[0_5px_22px_rgba(23,32,42,0.035)]">

                {/* SUMMARY HEADER */}

                <div className="border-b border-[#F0ECE7] px-5 py-5">

                  <div className="flex items-center justify-between gap-3">

                    <div>
                      <p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#FF5A36]">
                        Step 2 · Review
                      </p>

                      <h2 className="mt-1 text-sm font-extrabold text-[#401B13]">
                        Your order
                      </h2>
                    </div>

                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                      <ShoppingBag className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-xl bg-[#FCFAF6] px-3 py-3">
                    <span className="text-[10px] font-semibold text-[#756B61]">
                      Products
                    </span>

                    <span className="text-xs font-extrabold text-[#401B13]">
                      {itemCount}{" "}
                      {itemCount === 1 ? "item" : "items"}
                    </span>
                  </div>
                </div>

                {/* SELLER GROUPS */}

                <div className="max-h-[520px] space-y-5 overflow-y-auto p-4 sm:p-5">

                  {groups.map((group) => (
                    <section
                      key={group.businessId}
                      className="overflow-hidden rounded-xl border border-[#EAE6DF]"
                    >

                      {/* SELLER HEADER */}

                      <div className="flex items-center gap-2 border-b border-[#F0ECE7] bg-[#FCFAF6] px-3 py-3">

                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#9F2D18]">
                          <Store className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-[8px] font-semibold uppercase tracking-wide text-[#91877E]">
                            Seller
                          </p>

                          <p className="mt-0.5 truncate text-[10px] font-extrabold text-[#401B13]">
                            {group.businessName}
                          </p>
                        </div>

                        <span className="shrink-0 text-[9px] font-semibold text-[#91877E]">
                          {group.items.length}{" "}
                          {group.items.length === 1
                            ? "product"
                            : "products"}
                        </span>
                      </div>

                      {/* SELLER PRODUCTS */}

                      <div className="divide-y divide-[#F0ECE7] px-3">

                        {group.items.map((item) => {
                          const originalLineTotal =
                            item.originalPrice !== null
                              ? item.originalPrice *
                                item.quantity
                              : null;

                          const validOriginalLineTotal =
                            originalLineTotal !== null &&
                            Number.isSafeInteger(
                              originalLineTotal,
                            ) &&
                            originalLineTotal >
                              (item.lineTotal ?? 0);

                          return (
                            <div
                              key={item.id}
                              className="flex gap-3 py-3"
                            >

                              {/* IMAGE */}

                              <div className="relative flex h-[62px] w-[62px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-[#FCFAF6]">

                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <Package className="h-6 w-6 text-[#B6A99E]" />
                                )}

                                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-white bg-[#FF5A36] px-1 text-[8px] font-extrabold text-white">
                                  {item.quantity}
                                </span>
                              </div>

                              {/* ITEM INFORMATION */}

                              <div className="min-w-0 flex-1">

                                <p className="line-clamp-2 text-[10px] font-bold leading-5 text-[#292522]">
                                  {item.name}
                                </p>

                                <p className="mt-1 text-[9px] text-[#91877E]">
                                  Qty: {item.quantity}
                                </p>

                                {!item.purchasable && (
                                  <p className="mt-1 text-[9px] leading-4 text-red-600">
                                    {item.unavailableReason ??
                                      "Unavailable for checkout"}
                                  </p>
                                )}

                                <div className="mt-2 flex flex-wrap items-center justify-between gap-1">

                                  <span className="text-[9px] text-[#91877E]">
                                    {item.unitPrice !== null
                                      ? `${formatNaira(item.unitPrice)} each`
                                      : "Price unavailable"}
                                  </span>

                                  <div className="text-right">
                                    {validOriginalLineTotal && (
                                      <p className="text-[9px] text-[#91877E] line-through">
                                        {formatNaira(
                                          originalLineTotal!,
                                        )}
                                      </p>
                                    )}

                                    <p
                                      className={`text-[11px] font-extrabold ${
                                        item.purchasable
                                          ? "text-[#9F2D18]"
                                          : "text-[#91877E]"
                                      }`}
                                    >
                                      {item.lineTotal !== null
                                        ? formatNaira(
                                            item.lineTotal,
                                          )
                                        : "Unavailable"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>

                {/* ORDER TOTALS */}

                <div className="border-t border-[#F0ECE7] p-5">

                  <div className="space-y-3">

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-[#756B61]">
                        Products subtotal
                      </span>

                      <span className="text-xs font-bold text-[#292522]">
                        {formatNaira(subtotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-[#756B61]">
                        Delivery fee
                      </span>

                      <span className="text-[10px] font-semibold text-[#91877E]">
                        To be confirmed
                      </span>
                    </div>
                  </div>

                  <div className="my-4 h-px bg-[#EAE6DF]" />

                  <div>
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#91877E]">
                      Product order subtotal
                    </p>

                    <p className="mt-1 text-[26px] font-black tracking-tight text-[#9F2D18]">
                      {formatNaira(subtotal)}
                    </p>

                    <p className="mt-1 text-[9px] leading-5 text-[#91877E]">
                      Delivery charges are not included.
                      This is not a final payment amount.
                    </p>
                  </div>

                  {/* CHECKOUT ERROR */}

                  {submitError && (
                    <div
                      role="alert"
                      className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[10px] leading-5 text-red-700"
                    >
                      {submitError}
                    </div>
                  )}

                  {/* SUBMIT */}

                  <button
                    type="submit"
                    disabled={!canCheckout}
                    className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#E94E2C] disabled:cursor-not-allowed disabled:bg-[#EAE6DF] disabled:text-[#91877E]"
                  >
                    {submitting ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Submitting order...
                      </>
                    ) : (
                      <>
                        Submit order
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  {!canCheckout &&
                    !submitting && (
                      <p className="mt-3 text-center text-[9px] leading-5 text-[#B42318]">
                        {unavailableItems.length > 0
                          ? "Resolve unavailable products before submitting."
                          : !validSubtotal
                            ? "The order subtotal is not valid."
                            : "Check your cart before continuing."}
                      </p>
                    )}

                  <p className="mt-3 text-center text-[9px] leading-5 text-[#91877E]">
                    No payment will be collected when
                    you submit this order.
                  </p>
                </div>
              </section>

              {/* BACK TO CART */}

              <Link
                href="/cart"
                className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-3 text-xs font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
              >
                <ArrowLeft className="h-4 w-4" />
                Return to cart
              </Link>

              {/* TRUST INFORMATION */}

              <div className="mt-4 flex items-start gap-2 rounded-xl bg-white p-3">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#16845D]" />

                <p className="text-[9px] leading-5 text-[#91877E]">
                  Your order details and delivery information
                  are submitted together for processing.
                </p>
              </div>
            </aside>
          </form>

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
