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
  LoaderCircle,
  PackageOpen,
  RefreshCw,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

import CartItem, {
  type CartItemData,
} from "@/components/cart/CartItem";

import CartSummary from "@/components/cart/CartSummary";

const MAX_QUANTITY_PER_PRODUCT = 50;

/* =========================================================
   TYPES
========================================================= */

type CartResponse = {
  items: CartItemData[];
  itemCount: number;
  subtotal: number;
  currency: string;
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

function getNumber(
  value: unknown,
  fallback: number | null = null,
): number | null {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value)
  )
    ? value
    : fallback;
}

/* =========================================================
   CART RESPONSE PARSER

   The API response structure is:

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
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }

  const items: CartItemData[] = value.items.flatMap(
    (rawItem): CartItemData[] => {
      if (!isRecord(rawItem)) {
        return [];
      }

      if (
        typeof rawItem.id !== "string" ||
        !Number.isSafeInteger(rawItem.quantity) ||
        (rawItem.quantity as number) < 1 ||
        (rawItem.quantity as number) > MAX_QUANTITY_PER_PRODUCT
      ) {
        return [];
      }

      // Product information is nested inside rawItem.product.
      const rawProduct = isRecord(rawItem.product)
        ? rawItem.product
        : null;

      const rawBusiness =
        rawProduct && isRecord(rawProduct.business)
          ? rawProduct.business
          : null;

      const productId =
        typeof rawItem.productId === "string"
          ? rawItem.productId
          : getString(rawProduct?.id);

      if (!productId) {
        return [];
      }

      const productAvailable =
        rawProduct !== null &&
        rawProduct.status === "ACTIVE" &&
        rawProduct.deletedAt === null &&
        rawProduct.availability === "AVAILABLE" &&
        rawBusiness?.status === "ACTIVE" &&
        rawBusiness?.deletedAt === null;

      const business: CartItemData["business"] = {
        id: getString(rawBusiness?.id, "unavailable-business")!,
        name: getString(rawBusiness?.name, "Business unavailable")!,
        status: getString(
          rawBusiness?.status,
          "INACTIVE",
        )!,
        deletedAt: getString(rawBusiness?.deletedAt),
      };

      // The API also returns the first product image separately.
      const images = Array.isArray(rawProduct?.images)
        ? rawProduct.images
        : [];

      const firstImage = images.find(isRecord);

      const imageUrl =
        getString(rawProduct?.imageUrl) ??
        getString(firstImage?.imageUrl) ??
        getString(firstImage?.url);

      const unitPrice = getNumber(rawProduct?.price);
      const rawOriginalPrice = getNumber(rawProduct?.originalPrice);

      // Original price is only valid for discount display when it is
      // greater than the current selling price. It is never used in totals.
      const originalPrice =
        unitPrice !== null &&
        unitPrice > 0 &&
        rawOriginalPrice !== null &&
        rawOriginalPrice > unitPrice
          ? rawOriginalPrice
          : null;

      const lineTotal = getNumber(rawItem.lineTotal);

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
        description: getString(rawProduct?.description),
        unitPrice,
        originalPrice,
        quantity: rawItem.quantity as number,
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
          (purchasable
            ? null
            : "This product is no longer available."),
      };

      return [item];
    },
  );

  const calculatedItemCount = items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  // Exclude unavailable products from the payable subtotal.
  // The API's lineTotal is calculated from the current selling price.
  const calculatedSubtotal = items.reduce(
    (sum, item) =>
      sum +
      (item.purchasable ? item.lineTotal ?? 0 : 0),
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
   MAIN CART PAGE
========================================================= */

export default function CartPage() {
  const router = useRouter();

  const [items, setItems] = useState<CartItemData[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [clearingCart, setClearingCart] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  /* =====================================================
     UNAVAILABLE ITEMS
  ===================================================== */

  const unavailableCount = useMemo(
    () => items.filter((item) => !item.purchasable).length,
    [items],
  );

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

        console.error("Load cart error:", loadError);

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your cart.",
        );
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

      setFeedback("Cart updated successfully.");
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

      setFeedback("Product removed from your cart.");
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
      setFeedback("Your cart has been cleared.");
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
     LOADING STATE
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
            Loading your cart...
          </div>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     PAGE
  ===================================================== */

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10"
      >
        <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          {/* BREADCRUMB */}
          <div className="mb-5 flex items-center gap-2 text-[11px] text-[#756B61]">
            <Link href="/" className="hover:text-[#9F2D18]">
              Home
            </Link>

            <span>/</span>

            <Link
              href="/shop"
              className="hover:text-[#9F2D18]"
            >
              Products
            </Link>

            <span>/</span>

            <span className="font-bold text-[#9F2D18]">
              Cart
            </span>
          </div>

          {/* PAGE HEADING */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF5A36]">
                Your shopping
              </p>

              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#401B13] sm:text-3xl">
                Shopping cart
              </h1>

              <p className="mt-2 text-xs text-[#756B61]">
                Review your products before proceeding to checkout.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  disabled={
                    clearingCart ||
                    busyItemId !== null ||
                    refreshing
                  }
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {clearingCart ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}

                  {clearingCart ? "Clearing..." : "Clear cart"}
                </button>
              )}

              <Link
                href="/shop"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2 text-xs font-bold text-[#756B61] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
              >
                <ArrowLeft className="h-4 w-4" />
                Continue shopping
              </Link>
            </div>
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
                onClick={() =>
                  setRefreshKey((current) => current + 1)
                }
                className="inline-flex items-center gap-1 font-bold"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          )}

          {/* FEEDBACK */}
          {feedback && (
            <p
              role="status"
              className="mb-5 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] px-4 py-3 text-xs font-semibold text-[#137A59]"
            >
              {feedback}
            </p>
          )}

          {/* REFRESHING */}
          {refreshing && (
            <p
              role="status"
              className="mb-4 flex items-center gap-2 text-[11px] font-semibold text-[#756B61]"
            >
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#FF5A36]" />
              Updating your cart...
            </p>
          )}

          {/* EMPTY CART */}
          {items.length === 0 ? (
            <section className="mx-auto max-w-xl rounded-[24px] border border-[#EAE6DF] bg-white px-6 py-12 text-center shadow-[0_4px_20px_rgba(23,32,42,0.035)]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#9F2D18]">
                <PackageOpen className="h-8 w-8" />
              </div>

              <h2 className="mt-5 text-xl font-black text-[#401B13]">
                {error
                  ? "We couldn't load your cart"
                  : "Your cart is empty"}
              </h2>

              <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-[#756B61]">
                {error
                  ? "Please try loading your cart again."
                  : "Explore products from nearby businesses and add the ones you want to purchase."}
              </p>

              {error ? (
                <button
                  type="button"
                  onClick={() =>
                    setRefreshKey((current) => current + 1)
                  }
                  className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </button>
              ) : (
                <Link
                  href="/shop"
                  className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Explore products
                </Link>
              )}
            </section>
          ) : (
            /* CART CONTENT */
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
              {/* CART ITEMS */}
              <section>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-extrabold text-[#17202A]">
                    Your products
                  </h2>

                  <span className="rounded-full bg-[#FFF1ED] px-3 py-1.5 text-[10px] font-bold text-[#9F2D18]">
                    {itemCount}{" "}
                    {itemCount === 1 ? "item" : "items"}
                  </span>
                </div>

                <div className="space-y-3">
                  {items.map((item) => (
                    <CartItem
                      key={item.id}
                      item={item}
                      busy={
                        busyItemId === item.id ||
                        clearingCart
                      }
                      onQuantityChange={updateQuantity}
                      onRemove={removeItem}
                    />
                  ))}
                </div>

                <Link
                  href="/shop"
                  className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#9F2D18] transition hover:text-[#FF5A36]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Continue shopping
                </Link>
              </section>

              {/* SUMMARY */}
              <div className="lg:sticky lg:top-24">
                <CartSummary
                  itemCount={itemCount}
                  subtotal={subtotal}
                  unavailableCount={unavailableCount}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      <MobileBottomNav />
    </>
  );
}
