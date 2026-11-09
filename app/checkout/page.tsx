"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
  LoaderCircle,
  MapPin,
  Package,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_ORDER_TOTAL = 2_147_483_647;

/* =========================================================
   TYPES
========================================================= */

type CheckoutCartItem = {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  purchasable: boolean;
  unavailableReason: string | null;
  businessName: string;
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

const initialDeliveryForm: DeliveryForm = {
  deliveryRecipient: "",
  deliveryPhone: "",
  deliveryAddress: "",
  deliveryArea: "",
  deliveryLandmark: "",
  deliveryNotes: "",
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

function getString(
  value: unknown,
  fallback: string | null = null,
): string | null {
  return typeof value === "string" ? value : fallback;
}

function getSafeInteger(
  value: unknown,
): number | null {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  )
    ? value
    : null;
}

function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

/* =========================================================
   CART RESPONSE PARSER

   Expected API structure:

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
           imageUrl,
           business: {}
         },
         lineTotal,
         purchasable,
         unavailableReason
       }
     ],
     itemCount,
     subtotal,
     currency
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

    const quantity = getSafeInteger(rawItem.quantity);

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

    const productName = getString(
      product?.name,
      "Product unavailable",
    )!;

    const businessName = getString(
      business?.name,
      "Business unavailable",
    )!;

    const unitPrice = getSafeInteger(product?.price);

    const stockQuantity =
      getSafeInteger(product?.stockQuantity);

    const validFixedPrice =
      unitPrice !== null &&
      unitPrice > 0 &&
      product?.priceMin === null &&
      product?.priceMax === null;

    const validQuantity =
      quantity <= MAX_QUANTITY_PER_PRODUCT;

    const productAvailable =
      product !== null &&
      product.status === "ACTIVE" &&
      product.deletedAt === null &&
      product.availability === "AVAILABLE" &&
      business !== null &&
      business.status === "ACTIVE" &&
      business.deletedAt === null;

    const validStock =
      product !== null &&
      (
        product.stockQuantity === null ||
        (
          stockQuantity !== null &&
          stockQuantity >= 0
        )
      );

    const enoughStock =
      product !== null &&
      (
        product.stockQuantity === null ||
        (
          stockQuantity !== null &&
          stockQuantity >= quantity
        )
      );

    const calculatedTotal =
      validFixedPrice && unitPrice !== null
        ? unitPrice * quantity
        : null;

    const apiLineTotal =
      getSafeInteger(rawItem.lineTotal);

    const lineTotal =
      apiLineTotal !== null &&
      apiLineTotal >= 0 &&
      apiLineTotal <= MAX_ORDER_TOTAL
        ? apiLineTotal
        : calculatedTotal !== null &&
            Number.isSafeInteger(calculatedTotal) &&
            calculatedTotal > 0 &&
            calculatedTotal <= MAX_ORDER_TOTAL
          ? calculatedTotal
          : null;

    const purchasable =
      rawItem.purchasable === true &&
      productAvailable &&
      validFixedPrice &&
      validQuantity &&
      validStock &&
      enoughStock &&
      lineTotal !== null;

    // The cart API includes images inside product.images.
    const images = Array.isArray(product?.images)
      ? product.images
      : [];

    const firstImage = images.find(isRecord);

    const imageUrl =
      getString(product?.imageUrl) ??
      getString(firstImage?.imageUrl) ??
      getString(firstImage?.url);

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
    } else if (!validStock) {
      unavailableReason =
        "The inventory information for this product is invalid.";
    } else if (!enoughStock) {
      unavailableReason =
        "The requested quantity is higher than the available stock.";
    } else if (lineTotal === null) {
      unavailableReason =
        "The product total exceeds the maximum allowed order value.";
    } else if (
      typeof rawItem.unavailableReason === "string"
    ) {
      unavailableReason = rawItem.unavailableReason;
    }

    items.push({
      id: rawItem.id,
      productId,
      name: productName,
      imageUrl,
      quantity,
      unitPrice,
      lineTotal,
      purchasable,
      unavailableReason,
      businessName,
    });
  }

  const itemCount = items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  const calculatedSubtotal = items.reduce(
    (sum, item) => {
      if (item.lineTotal === null) {
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
   CHECKOUT RESPONSE PARSER

   Expected API structure:

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
   MAIN CHECKOUT PAGE
========================================================= */

export default function CheckoutPage() {
  const router = useRouter();

  /* CART */

  const [items, setItems] = useState<CheckoutCartItem[]>([]);

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState("");

  /* DELIVERY FORM */

  const [form, setForm] =
    useState<DeliveryForm>(initialDeliveryForm);

  /* CHECKOUT SUBMISSION */

  const [submitting, setSubmitting] = useState(false);

  const [submitError, setSubmitError] = useState("");

  const [result, setResult] =
    useState<CheckoutResult | null>(null);

  /* =====================================================
     CART TOTALS
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
          sum + (item.lineTotal ?? 0),
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

  const allLineTotalsValid = items.every(
    (item) =>
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
     FORM CHANGE
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

        setItems(parsed.items);
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (!signal.aborted) {
          console.error("Checkout cart error:", error);

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
  }, [loadCart]);

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

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
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

      if (!checkoutResult) {
        throw new Error(
          "Your order may have been submitted, but we could not read the confirmation. Check your order history before trying again.",
        );
      }

      setResult(checkoutResult);
      setItems([]);
    } catch (error) {
      console.error("Checkout submission error:", error);

      setSubmitError(
        error instanceof Error
          ? error.message
          : "Something went wrong while placing your order.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* =====================================================
     LOADING SCREEN
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
            Preparing your checkout...
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

        <main className="min-h-dvh bg-[#FFFDFC] px-4 pb-28 pt-10 lg:pb-12">
          <section className="mx-auto max-w-xl rounded-[24px] border border-[#EAE6DF] bg-white p-6 text-center shadow-[0_6px_28px_rgba(23,32,42,0.05)] sm:p-9">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#E9F9F0] text-[#16845D]">
              <CheckCircle2 className="h-11 w-11" />
            </div>

            <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#16845D]">
              Order submitted
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-tight text-[#401B13] sm:text-3xl">
              Thank you for your order!
            </h1>

            <p className="mt-3 text-xs leading-6 text-[#756B61]">
              Your order has been submitted successfully.
              The relevant sellers have been notified and
              will review their orders.
            </p>

            {/* MAIN ORDER REFERENCE */}

            <div className="mt-7 rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#91877E]">
                Your ReMarket order reference
              </p>

              <p className="mt-2 break-all text-lg font-black text-[#9F2D18]">
                {result.orderCode}
              </p>

              <p className="mt-2 text-[10px] text-[#91877E]">
                Keep this reference for order enquiries.
              </p>
            </div>

            {/* SELLER ORDER REFERENCES */}

            {result.sellerOrderCodes.length > 0 && (
              <div className="mt-5 rounded-2xl border border-[#EAE6DF] p-4 text-left">
                <h2 className="text-xs font-extrabold text-[#292522]">
                  Seller order references
                </h2>

                <div className="mt-3 space-y-2">
                  {result.sellerOrderCodes.map((code) => (
                    <div
                      key={code}
                      className="flex items-center justify-between gap-3 rounded-xl bg-[#FCFAF6] px-3 py-2.5"
                    >
                      <span className="text-[10px] text-[#756B61]">
                        Seller order
                      </span>

                      <span className="break-all text-[11px] font-bold text-[#9F2D18]">
                        {code}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PAYMENT NOTICE */}

            <div className="mt-5 rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-4 text-left">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" />

                <div>
                  <h2 className="text-xs font-extrabold text-[#5E4730]">
                    Payment has not been collected
                  </h2>

                  <p className="mt-1.5 text-[11px] leading-5 text-[#796B5C]">
                    This is an order submission, not a payment
                    confirmation. Payment and delivery
                    arrangements will be communicated separately
                    while ReMarket's payment integration is being
                    prepared.
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-4 text-[10px] leading-5 text-[#91877E]">
              Your order is awaiting seller acceptance.
              A submitted order does not mean every seller
              has confirmed it.
            </p>

            <Link
              href="/shop"
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]"
            >
              Continue shopping
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/"
              className="mt-4 inline-flex text-xs font-bold text-[#9F2D18] hover:text-[#FF5A36]"
            >
              Return to ReMarket home
            </Link>
          </section>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     LOAD ERROR
  ===================================================== */

  if (loadError) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28">
          <section className="w-full max-w-md rounded-2xl border border-[#F0C9BF] bg-[#FFF1ED] p-7 text-center">
            <Package className="mx-auto h-9 w-9 text-[#9F2D18]" />

            <h1 className="mt-4 text-lg font-extrabold text-[#17202A]">
              Checkout unavailable
            </h1>

            <p className="mt-2 text-xs leading-6 text-[#756B61]">
              {loadError}
            </p>

            <Link
              href="/cart"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94E2C]"
            >
              <ArrowLeft className="h-4 w-4" />
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

        <main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28">
          <section className="w-full max-w-md rounded-2xl border border-[#EAE6DF] bg-white p-8 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 text-[#9F2D18]" />

            <h1 className="mt-4 text-lg font-extrabold text-[#401B13]">
              Your cart is empty
            </h1>

            <p className="mt-2 text-xs leading-6 text-[#756B61]">
              Add products to your cart before proceeding to checkout.
            </p>

            <Link
              href="/shop"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94E2C]"
            >
              Explore products
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     MAIN CHECKOUT PAGE
  ===================================================== */

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10"
      >
        <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">

          {/* BREADCRUMB */}

          <div className="mb-5 flex items-center gap-2 text-[11px] text-[#756B61]">
            <Link href="/" className="hover:text-[#9F2D18]">
              Home
            </Link>

            <ChevronRight className="h-3 w-3" />

            <Link href="/cart" className="hover:text-[#9F2D18]">
              Cart
            </Link>

            <ChevronRight className="h-3 w-3" />

            <span className="font-bold text-[#9F2D18]">
              Checkout
            </span>
          </div>

          {/* HEADING */}

          <div className="mb-7">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF5A36]">
              Complete your order
            </p>

            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#401B13] sm:text-3xl">
              Checkout
            </h1>

            <p className="mt-2 text-xs text-[#756B61]">
              Provide your delivery information and review
              your order before submitting.
            </p>
          </div>

          {/* UNAVAILABLE PRODUCTS */}

          {unavailableItems.length > 0 && (
            <div
              role="alert"
              className="mb-6 rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-4"
            >
              <h2 className="text-xs font-extrabold text-[#5E4730]">
                Some products cannot be checked out
              </h2>

              <div className="mt-3 space-y-2">
                {unavailableItems.map((item) => (
                  <p
                    key={item.id}
                    className="text-[11px] leading-5 text-[#796B5C]"
                  >
                    <strong>{item.name}:</strong>{" "}
                    {item.unavailableReason ??
                      "This product is unavailable."}
                  </p>
                ))}
              </div>

              <Link
                href="/cart"
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#9F2D18]"
              >
                Return to cart and make changes
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
          >

            {/* DELIVERY INFORMATION */}

            <section className="space-y-5">
              <div className="rounded-[22px] border border-[#EAE6DF] bg-white p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                    <MapPin className="h-5 w-5" />
                  </div>

                  <div>
                    <h2 className="text-sm font-extrabold text-[#401B13]">
                      Delivery information
                    </h2>

                    <p className="mt-1 text-[10px] text-[#91877E]">
                      Where should we deliver your order?
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">

                  {/* RECIPIENT */}

                  <div>
                    <label
                      htmlFor="deliveryRecipient"
                      className="mb-2 block text-xs font-bold text-[#514840]"
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
                      className="w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3 text-xs text-[#292522] outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </div>

                  {/* PHONE */}

                  <div>
                    <label
                      htmlFor="deliveryPhone"
                      className="mb-2 block text-xs font-bold text-[#514840]"
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
                      className="w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3 text-xs text-[#292522] outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </div>

                  {/* ADDRESS */}

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="deliveryAddress"
                      className="mb-2 block text-xs font-bold text-[#514840]"
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
                      className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3 text-xs leading-6 text-[#292522] outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </div>

                  {/* AREA */}

                  <div>
                    <label
                      htmlFor="deliveryArea"
                      className="mb-2 block text-xs font-bold text-[#514840]"
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
                      className="w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3 text-xs text-[#292522] outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </div>

                  {/* LANDMARK */}

                  <div>
                    <label
                      htmlFor="deliveryLandmark"
                      className="mb-2 block text-xs font-bold text-[#514840]"
                    >
                      Nearby landmark
                      <span className="ml-1 text-[10px] font-normal text-[#91877E]">
                        (Optional)
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
                      className="w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3 text-xs text-[#292522] outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </div>

                  {/* DELIVERY NOTES */}

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="deliveryNotes"
                      className="mb-2 block text-xs font-bold text-[#514840]"
                    >
                      Additional delivery instructions
                      <span className="ml-1 text-[10px] font-normal text-[#91877E]">
                        (Optional)
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
                      placeholder="Any information that will help with delivery..."
                      rows={2}
                      maxLength={300}
                      className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3 text-xs leading-6 text-[#292522] outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </div>
                </div>
              </div>

              {/* DELIVERY NOTICE */}

              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5">
                <div className="flex items-start gap-3">
                  <Truck className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" />

                  <div>
                    <h2 className="text-xs font-extrabold text-[#401B13]">
                      Delivery arrangements
                    </h2>

                    <p className="mt-2 text-[11px] leading-6 text-[#756B61]">
                      Your delivery address will be shared with
                      the relevant sellers for fulfilment.
                      Delivery fees and arrangements are not
                      calculated by this MVP and will be
                      confirmed separately.
                    </p>
                  </div>
                </div>
              </div>

              {/* PAYMENT NOTICE */}

              <div className="rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" />

                  <div>
                    <h2 className="text-xs font-extrabold text-[#5E4730]">
                      Payment information
                    </h2>

                    <p className="mt-2 text-[11px] leading-6 text-[#796B5C]">
                      Payment is not collected at this stage.
                      Submitting your order sends it to the
                      relevant sellers for acceptance. ReMarket
                      will communicate the payment arrangements
                      separately.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ORDER SUMMARY */}

            <aside className="space-y-4 lg:sticky lg:top-24">
              <section className="rounded-[22px] border border-[#EAE6DF] bg-white p-5">
                <h2 className="text-sm font-extrabold text-[#401B13]">
                  Your order
                </h2>

                <p className="mt-1 text-[10px] text-[#91877E]">
                  {itemCount}{" "}
                  {itemCount === 1 ? "item" : "items"}{" "}
                  from your selected businesses
                </p>

                <div className="mt-5 space-y-4">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex gap-3"
                    >
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-[#FCFAF6]">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-6 w-6 text-[#B6A99E]" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[11px] font-bold leading-5 text-[#292522]">
                          {item.name}
                        </p>

                        <p className="mt-1 text-[10px] text-[#91877E]">
                          {item.businessName}
                        </p>

                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-[#756B61]">
                            Quantity: {item.quantity}
                          </span>

                          <span className="text-xs font-extrabold text-[#9F2D18]">
                            {item.lineTotal !== null
                              ? formatNaira(item.lineTotal)
                              : "Price unavailable"}
                          </span>
                        </div>

                        {!item.purchasable && (
                          <p className="mt-1 text-[10px] text-red-600">
                            {item.unavailableReason ??
                              "Unavailable for checkout"}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="my-5 border-t border-[#EAE6DF]" />

                <div className="space-y-3">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="text-[#756B61]">
                      Items subtotal
                    </span>

                    <span className="font-bold text-[#292522]">
                      {formatNaira(subtotal)}
                    </span>
                  </div>

                  <div className="flex justify-between gap-3 text-xs">
                    <span className="text-[#756B61]">
                      Delivery fee
                    </span>

                    <span className="font-semibold text-[#796B5C]">
                      To be confirmed
                    </span>
                  </div>
                </div>

                <div className="my-5 border-t border-[#EAE6DF]" />

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#91877E]">
                    Order subtotal
                  </p>

                  <p className="mt-1 text-2xl font-black text-[#9F2D18]">
                    {formatNaira(subtotal)}
                  </p>

                  <p className="mt-2 text-[10px] leading-5 text-[#91877E]">
                    This is not a final payment amount.
                    Delivery fees are not included.
                  </p>
                </div>

                {submitError && (
                  <div
                    role="alert"
                    className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] leading-5 text-red-700"
                  >
                    {submitError}
                  </div>
                )}

                {/* SUBMIT ORDER */}

                <button
                  type="submit"
                  disabled={!canCheckout}
                  className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C] disabled:cursor-not-allowed disabled:bg-[#EAE6DF] disabled:text-[#91877E]"
                >
                  {submitting ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Submitting order...
                    </>
                  ) : (
                    <>
                      Place order
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <p className="mt-3 text-center text-[10px] leading-5 text-[#91877E]">
                  No payment will be collected when you
                  submit this order.
                </p>
              </section>

              <Link
                href="/cart"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-3 text-xs font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
              >
                <ArrowLeft className="h-4 w-4" />
                Return to cart
              </Link>
            </aside>
          </form>

          {/* FOOTER */}

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