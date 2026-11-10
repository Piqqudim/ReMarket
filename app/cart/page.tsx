"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  LoaderCircle,
  Package,
  PackageOpen,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

import CartItem, {
  type CartItemData,
} from "@/components/cart/CartItem";

import CartSummary from "@/components/cart/CartSummary";

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_QUANTITY_PER_PRODUCT = 50;

const CART_CHANGED_EVENT = "remarket-cart-changed";

/* =========================================================
   TYPES
========================================================= */

type CartResponse = {
  items: CartItemData[];
  itemCount: number;
  subtotal: number;
  currency: string;
};

type CartGroup = {
  businessId: string;
  businessName: string;
  items: CartItemData[];
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
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.trim();

  return cleaned || fallback;
}

function getNumber(
  value: unknown,
  fallback: number | null = null,
): number | null {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
    ? value
    : fallback;
}

function dispatchCartChanged() {
  window.dispatchEvent(
    new Event(CART_CHANGED_EVENT),
  );
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
           originalPrice,
           business: {},
           ...
         },
         lineTotal,
         purchasable,
         unavailableReason
       }
     ]
   }
========================================================= */

function parseCartResponse(
  value: unknown,
): CartResponse | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items)
  ) {
    return null;
  }

  const items: CartItemData[] =
    value.items.flatMap((rawItem): CartItemData[] => {
      if (!isRecord(rawItem)) {
        return [];
      }

      if (
        typeof rawItem.id !== "string" ||
        !Number.isSafeInteger(rawItem.quantity) ||
        (rawItem.quantity as number) < 1 ||
        (rawItem.quantity as number) >
          MAX_QUANTITY_PER_PRODUCT
      ) {
        return [];
      }

      const quantity =
        rawItem.quantity as number;

      const rawProduct = isRecord(rawItem.product)
        ? rawItem.product
        : null;

      const rawBusiness =
        rawProduct &&
        isRecord(rawProduct.business)
          ? rawProduct.business
          : null;

      const productId =
        typeof rawItem.productId === "string"
          ? rawItem.productId
          : getString(rawProduct?.id);

      if (!productId) {
        return [];
      }

      const productNotDeleted =
        rawProduct?.deletedAt === null ||
        rawProduct?.deletedAt === undefined;

      const businessNotDeleted =
        rawBusiness?.deletedAt === null ||
        rawBusiness?.deletedAt === undefined;

      const productAvailable =
        rawProduct !== null &&
        rawProduct.status === "ACTIVE" &&
        productNotDeleted &&
        rawProduct.availability === "AVAILABLE" &&
        rawBusiness?.status === "ACTIVE" &&
        businessNotDeleted;

      const business: CartItemData["business"] = {
        id:
          getString(
            rawBusiness?.id,
            "unavailable-business",
          )!,

        name:
          getString(
            rawBusiness?.name,
            "Business unavailable",
          )!,

        status:
          getString(
            rawBusiness?.status,
            "INACTIVE",
          )!,

        deletedAt:
          getString(rawBusiness?.deletedAt),
      };

      /* PRODUCT IMAGE */

      const images = Array.isArray(
        rawProduct?.images,
      )
        ? rawProduct.images
        : [];

      const firstImage = images.find(isRecord);

      const imageUrl =
        getString(rawProduct?.imageUrl) ??
        getString(firstImage?.imageUrl) ??
        getString(firstImage?.url);

      /* PRICING */

      const unitPrice = getNumber(
        rawProduct?.price,
      );

      const rawOriginalPrice = getNumber(
        rawProduct?.originalPrice,
      );

      const originalPrice =
        unitPrice !== null &&
        unitPrice > 0 &&
        rawOriginalPrice !== null &&
        rawOriginalPrice > unitPrice
          ? rawOriginalPrice
          : null;

      const lineTotal = getNumber(
        rawItem.lineTotal,
      );

      /* AVAILABILITY */

      const purchasable =
        rawItem.purchasable === true &&
        productAvailable;

      const item: CartItemData = {
        id: rawItem.id,
        productId,

        name: getString(
          rawProduct?.name,
          "Product unavailable",
        )!,

        description: getString(
          rawProduct?.description,
        ),

        unitPrice,
        originalPrice,

        quantity,
        lineTotal,

        availability: getString(
          rawProduct?.availability,
          "UNAVAILABLE",
        )!,

        stockQuantity: getNumber(
          rawProduct?.stockQuantity,
        ),

        imageUrl,

        business,

        purchasable,

        unavailableReason:
          getString(rawItem.unavailableReason) ??
          (
            purchasable
              ? null
              : "This product is no longer available."
          ),
      };

      return [item];
    });

  const calculatedItemCount = items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  /*
   * Unavailable products are excluded from
   * the payable subtotal.
   *
   * The lineTotal returned by the API is used.
   * The originalPrice is never used in totals.
   */

  const calculatedSubtotal = items.reduce(
    (sum, item) => {
      if (!item.purchasable) {
        return sum;
      }

      return sum + (item.lineTotal ?? 0);
    },
    0,
  );

  return {
    items,

    itemCount:
      typeof value.itemCount === "number" &&
      Number.isSafeInteger(value.itemCount) &&
      value.itemCount >= 0
        ? value.itemCount
        : calculatedItemCount,

    subtotal: calculatedSubtotal,

    currency:
      typeof value.currency === "string"
        ? value.currency
        : "NGN",
  };
}

/* =========================================================
   CART PAGE
========================================================= */

export default function CartPage() {
  const router = useRouter();

  /* =====================================================
     STATE
  ===================================================== */

  const [items, setItems] = useState<CartItemData[]>([]);

  const [itemCount, setItemCount] = useState(0);

  const [subtotal, setSubtotal] = useState(0);

  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const [busyItemId, setBusyItemId] =
    useState<string | null>(null);

  const [clearingCart, setClearingCart] =
    useState(false);

  const [error, setError] = useState("");

  const [feedback, setFeedback] = useState("");

  const [refreshKey, setRefreshKey] = useState(0);

  /* =====================================================
     CART STATISTICS
  ===================================================== */

  const unavailableCount = useMemo(
    () =>
      items.filter(
        (item) => !item.purchasable,
      ).length,
    [items],
  );

  const sellerCount = useMemo(
    () =>
      new Set(
        items.map(
          (item) => item.business.id,
        ),
      ).size,
    [items],
  );

  const totalProductLines = items.length;

  /* =====================================================
     GROUP PRODUCTS BY SELLER

     This gives ReMarket a more organised
     multi-seller marketplace cart.
  ===================================================== */

  const groupedItems = useMemo(() => {
    const groups = new Map<string, CartGroup>();

    for (const item of items) {
      const businessId =
        item.business?.id ??
        "unavailable-business";

      if (!groups.has(businessId)) {
        groups.set(businessId, {
          businessId,

          businessName:
            item.business?.name ??
            "Business unavailable",

          items: [],
        });
      }

      groups.get(businessId)?.items.push(item);
    }

    return Array.from(groups.values());
  }, [items]);

  /* =====================================================
     LOAD CART
  ===================================================== */

  const loadCart = useCallback(
    async (signal?: AbortSignal) => {
      if (refreshKey === 0) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

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
          const message =
            isRecord(payload) &&
            typeof payload.error === "string"
              ? payload.error
              : "Unable to load your cart.";

          throw new Error(message);
        }

        const parsed = parseCartResponse(payload);

        if (!parsed) {
          throw new Error(
            "The cart response could not be read.",
          );
        }

        if (signal?.aborted) {
          return;
        }

        setItems(parsed.items);
        setItemCount(parsed.itemCount);
        setSubtotal(parsed.subtotal);

      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Load cart error:",
          loadError,
        );

        if (!signal?.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your cart.",
          );
        }

      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [refreshKey, router],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadCart(controller.signal);

    return () => controller.abort();
  }, [loadCart]);

  /* =====================================================
     REFRESH CART
  ===================================================== */

  function refreshCart() {
    if (
      refreshing ||
      clearingCart ||
      busyItemId !== null
    ) {
      return;
    }

    setRefreshKey((current) => current + 1);
  }

  /* =====================================================
     UPDATE QUANTITY
  ===================================================== */

  async function updateQuantity(
    itemId: string,
    quantity: number,
  ) {
    if (busyItemId || clearingCart) {
      return;
    }

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY_PER_PRODUCT
    ) {
      return;
    }

    setBusyItemId(itemId);
    setError("");
    setFeedback("");

    try {
      const response = await fetch(
        `/api/cart/items/${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },

          credentials: "same-origin",

          body: JSON.stringify({
            quantity,
          }),
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
        const message =
          isRecord(payload) &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to update the quantity.";

        throw new Error(message);
      }

      dispatchCartChanged();

      setFeedback(
        "Your cart has been updated.",
      );

      setRefreshKey((current) => current + 1);

    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update this item.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  /* =====================================================
     REMOVE ONE ITEM
  ===================================================== */

  async function removeItem(itemId: string) {
    if (busyItemId || clearingCart) {
      return;
    }

    setBusyItemId(itemId);
    setError("");
    setFeedback("");

    try {
      const response = await fetch(
        `/api/cart/items/${encodeURIComponent(itemId)}`,
        {
          method: "DELETE",

          credentials: "same-origin",

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
        const message =
          isRecord(payload) &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to remove this item.";

        throw new Error(message);
      }

      dispatchCartChanged();

      setFeedback(
        "Product removed from your cart.",
      );

      setRefreshKey((current) => current + 1);

    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove this product.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  /* =====================================================
     CLEAR ENTIRE CART
  ===================================================== */

  async function clearCart() {
    if (
      clearingCart ||
      busyItemId ||
      items.length === 0
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to remove all products from your cart?",
    );

    if (!confirmed) {
      return;
    }

    setClearingCart(true);
    setError("");
    setFeedback("");

    try {
      const response = await fetch("/api/cart", {
        method: "DELETE",

        credentials: "same-origin",

        headers: {
          Accept: "application/json",
        },
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
        const message =
          isRecord(payload) &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to clear your cart.";

        throw new Error(message);
      }

      setItems([]);
      setItemCount(0);
      setSubtotal(0);

      dispatchCartChanged();

      setFeedback(
        "Your cart has been cleared.",
      );

    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Unable to clear your cart.",
      );
    } finally {
      setClearingCart(false);
    }
  }

  /* =====================================================
     LOADING SCREEN
  ===================================================== */

  if (loading) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="flex min-h-[70vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28">

          <div className="w-full max-w-sm rounded-[24px] border border-[#EAE6DF] bg-white p-8 text-center shadow-sm">

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#9F2D18]">
              <ShoppingBag className="h-8 w-8" />
            </div>

            <LoaderCircle className="mx-auto mt-6 h-5 w-5 animate-spin text-[#FF5A36]" />

            <h1 className="mt-4 text-base font-extrabold text-[#401B13]">
              Preparing your cart
            </h1>

            <p className="mt-2 text-xs leading-6 text-[#756B61]">
              Getting your selected products ready.
            </p>
          </div>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     EMPTY CART SCREEN
  ===================================================== */

  const isEmpty = items.length === 0;

  /* =====================================================
     MAIN PAGE
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

            <span>/</span>

            <Link
              href="/shop"
              className="transition hover:text-[#9F2D18]"
            >
              Products
            </Link>

            <span>/</span>

            <span className="font-bold text-[#9F2D18]">
              Cart
            </span>
          </nav>

          {/* =====================================
              CART HERO
          ===================================== */}

          <section className="relative mb-6 overflow-hidden rounded-[26px] border border-[#F3D6CC] bg-gradient-to-br from-[#FFF1ED] via-[#FFFDFC] to-[#FFF7ED] p-5 sm:p-7">

            {/* DECORATION */}

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full bg-[#FF5A36]/[0.06] blur-2xl"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 right-[30%] h-48 w-48 rounded-full bg-[#F7B69F]/20 blur-2xl"
            />

            <div className="relative grid items-center gap-7 lg:grid-cols-[minmax(0,1fr)_auto]">

              {/* LEFT CONTENT */}

              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD9CE] bg-white/80 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#9F2D18]">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  ReMarket shopping
                </div>

                <h1 className="mt-4 text-[29px] font-black leading-tight tracking-tight text-[#401B13] sm:text-[36px]">
                  Your shopping cart
                </h1>

                <p className="mt-2 max-w-xl text-xs leading-6 text-[#756B61] sm:text-sm">
                  Everything you have selected, brought
                  together in one place. Review your
                  products and check availability before
                  proceeding.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">

                  <Link
                    href="/shop"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#E94E2C]"
                  >
                    Discover more products
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  {!isEmpty && (
                    <button
                      type="button"
                      onClick={refreshCart}
                      disabled={
                        refreshing ||
                        busyItemId !== null ||
                        clearingCart
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E8CFC5] bg-white/80 px-4 py-3 text-xs font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18] disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          refreshing
                            ? "animate-spin"
                            : ""
                        }`}
                      />

                      Refresh cart
                    </button>
                  )}
                </div>
              </div>

              {/* CART STATISTICS */}

              {!isEmpty && (
                <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[330px]">

                  <div className="rounded-2xl border border-white bg-white/85 p-3 shadow-sm sm:p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                      <ShoppingCart className="h-4 w-4" />
                    </div>

                    <p className="mt-3 text-xl font-black tabular-nums text-[#401B13] sm:text-2xl">
                      {itemCount}
                    </p>

                    <p className="mt-1 text-[9px] font-semibold text-[#756B61] sm:text-[10px]">
                      Total units
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white bg-white/85 p-3 shadow-sm sm:p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#9F2D18]">
                      <Package className="h-4 w-4" />
                    </div>

                    <p className="mt-3 text-xl font-black tabular-nums text-[#401B13] sm:text-2xl">
                      {totalProductLines}
                    </p>

                    <p className="mt-1 text-[9px] font-semibold text-[#756B61] sm:text-[10px]">
                      Products
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white bg-white/85 p-3 shadow-sm sm:p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F5F2ED] text-[#756B61]">
                      <Store className="h-4 w-4" />
                    </div>

                    <p className="mt-3 text-xl font-black tabular-nums text-[#401B13] sm:text-2xl">
                      {sellerCount}
                    </p>

                    <p className="mt-1 text-[9px] font-semibold text-[#756B61] sm:text-[10px]">
                      Sellers
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* =====================================
              ERROR MESSAGE
          ===================================== */}

          {error && (
            <div
              role="alert"
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
            >
              <div className="flex items-start gap-2">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />

                <span>{error}</span>
              </div>

              <button
                type="button"
                onClick={refreshCart}
                className="inline-flex items-center gap-1 font-extrabold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          )}

          {/* =====================================
              SUCCESS MESSAGE
          ===================================== */}

          {feedback && (
            <div
              role="status"
              className="mb-5 flex items-center gap-2 rounded-2xl border border-[#B8E5D2] bg-[#F0FBF5] px-4 py-3 text-xs font-semibold text-[#137A59]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {feedback}
            </div>
          )}

          {/* =====================================
              REFRESH STATUS
          ===================================== */}

          {refreshing && (
            <div
              role="status"
              className="mb-4 flex items-center gap-2 text-[11px] font-semibold text-[#756B61]"
            >
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#FF5A36]" />
              Updating your cart...
            </div>
          )}

          {/* =====================================
              UNAVAILABLE PRODUCT NOTICE
          ===================================== */}

          {!isEmpty && unavailableCount > 0 && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#F4D5A1] bg-[#FFFAEC] p-4">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0C9] text-[#96610D]">
                <XCircle className="h-4 w-4" />
              </div>

              <div>
                <p className="text-xs font-extrabold text-[#79500E]">
                  Some products need your attention
                </p>

                <p className="mt-1 text-[11px] leading-5 text-[#8B6A2B]">
                  {unavailableCount}{" "}
                  {unavailableCount === 1
                    ? "product is"
                    : "products are"}{" "}
                  currently unavailable for purchase.
                  They have been excluded from your payable
                  subtotal.
                </p>
              </div>
            </div>
          )}

          {/* =====================================
              EMPTY CART
          ===================================== */}

          {isEmpty ? (
            <section className="relative mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-[#EAE6DF] bg-white px-6 py-12 text-center shadow-[0_5px_30px_rgba(23,32,42,0.035)] sm:px-10 sm:py-16">

              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#FFF1ED] blur-2xl"
              />

              <div className="relative">

                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] bg-[#FFF1ED] text-[#9F2D18]">
                  <PackageOpen className="h-11 w-11" />
                </div>

                <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF5A36]">
                  Your next find is waiting
                </p>

                <h2 className="mt-2 text-2xl font-black tracking-tight text-[#401B13] sm:text-3xl">
                  {error
                    ? "We couldn't load your cart."
                    : "Your cart is taking a break."}
                </h2>

                <p className="mx-auto mt-3 max-w-md text-xs leading-7 text-[#756B61] sm:text-sm">
                  {error
                    ? "There was a problem retrieving your products. Try again to reload your shopping cart."
                    : "You haven't added any products yet. Explore ReMarket to find products from nearby sellers and add your favourites."}
                </p>

                {error ? (
                  <button
                    type="button"
                    onClick={refreshCart}
                    className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-7 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reload cart
                  </button>
                ) : (
                  <Link
                    href="/shop"
                    className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-7 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Start shopping
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}

                <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[10px] font-semibold text-[#91877E]">

                  <span className="inline-flex items-center gap-2">
                    <Store className="h-3.5 w-3.5 text-[#FF5A36]" />
                    Nearby sellers
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-[#FF5A36]" />
                    Product discovery
                  </span>

                  <span className="inline-flex items-center gap-2">
                    <ShoppingCart className="h-3.5 w-3.5 text-[#FF5A36]" />
                    Easy shopping
                  </span>
                </div>
              </div>
            </section>
          ) : (
            /* =====================================
               CART CONTENT
            ===================================== */

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_370px] xl:gap-8">

              {/* =================================
                  LEFT: CART ITEMS
              ================================= */}

              <section className="min-w-0">

                {/* ITEMS HEADER */}

                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">

                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#9F2D18]">
                      Your selection
                    </p>

                    <h2 className="mt-1 text-xl font-black tracking-tight text-[#401B13]">
                      Cart items
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={clearCart}
                    disabled={
                      clearingCart ||
                      busyItemId !== null ||
                      refreshing
                    }
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2 text-[10px] font-bold text-[#756B61] transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {clearingCart ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}

                    {clearingCart
                      ? "Clearing..."
                      : "Clear cart"}
                  </button>
                </div>

                {/* SELLER GROUPS */}

                <div className="space-y-5">

                  {groupedItems.map((group) => (
                    <section
                      key={group.businessId}
                      className="overflow-hidden rounded-[22px] border border-[#EAE6DF] bg-white shadow-[0_4px_18px_rgba(23,32,42,0.025)]"
                    >

                      {/* SELLER HEADER */}

                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0ECE7] bg-[#FFFDFC] px-4 py-4 sm:px-5">

                        <div className="flex min-w-0 items-center gap-3">

                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#EAE6DF] bg-[#FFF1ED] text-[#9F2D18]">
                            <Store className="h-4 w-4" />
                          </div>

                          <div className="min-w-0">

                            <p className="text-[9px] font-semibold uppercase tracking-wide text-[#91877E]">
                              Seller
                            </p>

                            <h3 className="mt-0.5 truncate text-xs font-extrabold text-[#401B13] sm:text-sm">
                              {group.businessName}
                            </h3>
                          </div>
                        </div>

                        <span className="shrink-0 rounded-full border border-[#EAE6DF] bg-white px-3 py-1.5 text-[9px] font-bold text-[#756B61]">
                          {group.items.length}{" "}
                          {group.items.length === 1
                            ? "product"
                            : "products"}
                        </span>
                      </div>

                      {/* PRODUCTS FROM SELLER */}

                      <div className="space-y-3 p-3 sm:p-4">

                        {group.items.map((item) => (
                          <CartItem
                            key={item.id}
                            item={item}
                            busy={
                              busyItemId === item.id ||
                              clearingCart
                            }
                            onQuantityChange={
                              updateQuantity
                            }
                            onRemove={removeItem}
                          />
                        ))}

                      </div>
                    </section>
                  ))}
                </div>

                {/* CONTINUE SHOPPING */}

                <div className="mt-5 rounded-2xl border border-dashed border-[#E5C9BD] bg-[#FFF7F3] p-4 sm:p-5">

                  <div className="flex flex-wrap items-center justify-between gap-3">

                    <div className="flex min-w-0 items-center gap-3">

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#9F2D18]">
                        <ShoppingBag className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">

                        <p className="text-xs font-extrabold text-[#401B13]">
                          Still looking for something?
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-[#756B61]">
                          Browse more products on ReMarket.
                        </p>
                      </div>
                    </div>

                    <Link
                      href="/shop"
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 py-2 text-[10px] font-extrabold text-[#9F2D18] shadow-sm transition hover:bg-[#FFF1ED]"
                    >
                      Browse products
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>

              </section>

              {/* =================================
                  RIGHT: ORDER SUMMARY
              ================================= */}

              <aside className="min-w-0 lg:sticky lg:top-24">

                <div className="mb-4 flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-[#FF5A36]" />

                  <h2 className="text-sm font-extrabold text-[#401B13]">
                    Order summary
                  </h2>
                </div>

                <div className="overflow-hidden rounded-[22px] border border-[#EAE6DF] bg-white p-4 shadow-[0_5px_22px_rgba(23,32,42,0.035)] sm:p-5">

                  {/* ORDER OVERVIEW */}

                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#F0ECE7] pb-4">

                    <div>
                      <p className="text-[10px] font-semibold text-[#91877E]">
                        Products in your cart
                      </p>

                      <p className="mt-1 text-lg font-black text-[#401B13]">
                        {itemCount}{" "}
                        <span className="text-xs font-semibold text-[#756B61]">
                          {itemCount === 1
                            ? "unit"
                            : "units"}
                        </span>
                      </p>
                    </div>

                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1ED] text-[#9F2D18]">
                      <Package className="h-5 w-5" />
                    </div>
                  </div>

                  {/* EXISTING SUMMARY COMPONENT */}

                  <CartSummary
                    itemCount={itemCount}
                    subtotal={subtotal}
                    unavailableCount={unavailableCount}
                  />

                  {/* UNAVAILABLE INFORMATION */}

                  {unavailableCount > 0 && (
                    <div className="mt-4 rounded-xl border border-[#F4D5A1] bg-[#FFFAEC] p-3">

                      <div className="flex items-start gap-2">
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#96610D]" />

                        <p className="text-[10px] leading-5 text-[#79500E]">
                          Unavailable products are excluded
                          from your payable subtotal.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* SHOPPING INFORMATION */}

                  <div className="mt-5 space-y-3 border-t border-[#F0ECE7] pt-4">

                    <div className="flex items-start gap-2.5">
                      <Store className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A36]" />

                      <div>
                        <p className="text-[10px] font-bold text-[#514840]">
                          Multiple sellers
                        </p>

                        <p className="mt-0.5 text-[9px] leading-5 text-[#91877E]">
                          Your cart can contain products
                          from different merchants.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A36]" />

                      <div>
                        <p className="text-[10px] font-bold text-[#514840]">
                          Current product prices
                        </p>

                        <p className="mt-0.5 text-[9px] leading-5 text-[#91877E]">
                          Your subtotal uses current selling
                          prices, not crossed-out original
                          prices.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A36]" />

                      <div>
                        <p className="text-[10px] font-bold text-[#514840]">
                          Delivery information
                        </p>

                        <p className="mt-0.5 text-[9px] leading-5 text-[#91877E]">
                          Check the applicable delivery
                          details during checkout.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CONTINUE BROWSING */}

                <Link
                  href="/shop"
                  className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-3 text-xs font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Continue shopping
                </Link>

              </aside>
            </div>
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