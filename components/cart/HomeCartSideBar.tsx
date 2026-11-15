"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";

type CartItem = {
  id: string;
  productId: string;
  name: string;
  unitPrice: number | null;
  quantity: number;
  lineTotal: number | null;
  imageUrl: string | null;
  stockQuantity: number | null;
  purchasable: boolean;
  unavailableReason: string | null;
};

type CartSnapshot = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
};

const EMPTY_CART: CartSnapshot = {
  items: [],
  itemCount: 0,
  subtotal: 0,
};

const MAX_QUANTITY_PER_PRODUCT = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function parseCartSnapshot(value: unknown): CartSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;

  const items = value.items.flatMap((raw): CartItem[] => {
    if (!isRecord(raw)) return [];

    const id = cleanString(raw.id);
    const productId = cleanString(raw.productId);
    const name = cleanString(raw.name);
    const quantity = numberOrNull(raw.quantity);

    if (!id || !productId || !name || quantity === null || quantity < 1) {
      return [];
    }

    return [{
      id,
      productId,
      name,
      unitPrice: numberOrNull(raw.unitPrice),
      quantity: Math.floor(quantity),
      lineTotal: numberOrNull(raw.lineTotal),
      imageUrl: cleanString(raw.imageUrl),
      stockQuantity: numberOrNull(raw.stockQuantity),
      purchasable: raw.purchasable === true,
      unavailableReason: cleanString(raw.unavailableReason),
    }];
  });

  const parsedCount = numberOrNull(value.itemCount);
  const parsedSubtotal = numberOrNull(value.subtotal);

  return {
    items,
    itemCount: parsedCount === null
      ? items.reduce((total, item) => total + item.quantity, 0)
      : Math.max(0, Math.floor(parsedCount)),
    subtotal: parsedSubtotal === null
      ? items.reduce((total, item) => total + (item.lineTotal ?? 0), 0)
      : Math.max(0, parsedSubtotal),
  };
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

export default function HomeCartSidebar() {
  const [cart, setCart] = useState<CartSnapshot>(EMPTY_CART);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [needsBuyerSignIn, setNeedsBuyerSignIn] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadCart(showLoading: boolean) {
      if (showLoading && active) setLoading(true);
      if (active) setLoadError("");

      try {
        const response = await fetch("/api/cart", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (response.status === 401 || response.status === 403) {
          if (active) {
            setCart(EMPTY_CART);
            setNeedsBuyerSignIn(true);
          }
          return;
        }

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message = isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Unable to load your cart.";
          throw new Error(message);
        }

        const parsed = parseCartSnapshot(payload);
        if (!parsed) throw new Error("The cart response could not be read.");

        if (active) {
          setCart(parsed);
          setNeedsBuyerSignIn(false);
          setLoadError("");
        }
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load your cart.",
          );
        }
      } finally {
        if (active && showLoading) setLoading(false);
      }
    }

    function handleCartChanged() {
      void loadCart(false);
    }

    window.addEventListener("remarket-cart-changed", handleCartChanged);
    window.addEventListener("focus", handleCartChanged);
    void loadCart(true);

    return () => {
      active = false;
      window.removeEventListener("remarket-cart-changed", handleCartChanged);
      window.removeEventListener("focus", handleCartChanged);
    };
  }, []);

  const canCheckout = useMemo(
    () => cart.items.length > 0 && cart.items.every(
      (item) => item.purchasable && item.lineTotal !== null,
    ),
    [cart.items],
  );

  async function changeItem(
    item: CartItem,
    method: "PATCH" | "DELETE",
    quantity?: number,
  ) {
    if (busyItemId) return;

    if (
      method === "PATCH" &&
      (!Number.isSafeInteger(quantity) ||
        (quantity as number) < 1 ||
        (quantity as number) > MAX_QUANTITY_PER_PRODUCT)
    ) {
      return;
    }

    setBusyItemId(item.id);
    setLoadError("");

    try {
      const response = await fetch(
        `/api/cart/items/${encodeURIComponent(item.id)}`,
        {
          method,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
          },
          ...(method === "PATCH" ? { body: JSON.stringify({ quantity }) } : {}),
        },
      );

      const payload: unknown = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        window.location.assign(
          `/buyer/login?callbackUrl=${encodeURIComponent("/cart")}`,
        );
        return;
      }

      if (!response.ok) {
        const message = isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : method === "PATCH"
            ? "Unable to update the quantity."
            : "Unable to remove this product.";
        throw new Error(message);
      }

      window.dispatchEvent(new Event("remarket-cart-changed"));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to update your cart.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  if (!expanded) {
    return (
      <aside className="fixed bottom-6 right-4 z-30 hidden lg:block">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`Open cart, ${cart.itemCount} items`}
          className="flex min-h-12 items-center gap-2 rounded-l-xl rounded-r-md border border-[#EAE6DF] bg-white px-3 py-3 text-xs font-bold text-[#9F2D18] shadow-[0_8px_26px_rgba(23,32,42,0.14)] transition hover:bg-[#FFF1ED]"
        >
          <ShoppingCart className="h-4 w-4" />
          Cart
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A36] px-1.5 text-[10px] text-white">
            {cart.itemCount > 99 ? "99+" : cart.itemCount}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="fixed bottom-4 right-4 top-[92px] z-30 hidden w-[312px] lg:block">
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_12px_36px_rgba(23,32,42,0.14)]">
        <header className="flex shrink-0 items-center justify-between border-b border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#9F2D18]">
              <ShoppingCart className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-[#401B13]">Your cart</h2>
              <p className="text-[10px] text-[#756B61]">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Collapse cart panel"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#756B61] transition hover:bg-white hover:text-[#9F2D18]"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <Link
              href="/cart"
              aria-label="Open full cart page"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#756B61] transition hover:bg-white hover:text-[#9F2D18]"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        {loadError && (
          <div role="alert" className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] leading-4 text-red-700">
            {loadError}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("remarket-cart-changed"))}
              className="ml-1 font-bold underline"
            >
              Retry
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-[#9F2D18]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="ml-2 text-xs text-[#756B61]">Loading cart...</span>
            </div>
          ) : needsBuyerSignIn ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-3 text-center">
              <ShoppingCart className="h-8 w-8 text-[#C7B9AE]" />
              <p className="mt-3 text-sm font-bold text-[#401B13]">Sign in to view your cart</p>
              <p className="mt-1 text-[10px] leading-4 text-[#756B61]">
                Use a buyer account to add and manage products.
              </p>
              <Link
                href={`/buyer/login?callbackUrl=${encodeURIComponent("/cart")}`}
                className="mt-4 rounded-lg bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]"
              >
                Sign in
              </Link>
            </div>
          ) : cart.items.length === 0 ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-3 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FCFAF6] text-[#C7B9AE]">
                <Package className="h-7 w-7" />
              </span>
              <p className="mt-3 text-sm font-bold text-[#401B13]">Your cart is empty</p>
              <p className="mt-1 text-[10px] leading-4 text-[#756B61]">
                Add a product from the homepage and it will appear here.
              </p>
              <Link href="/shop" className="mt-4 text-xs font-bold text-[#9F2D18] hover:text-[#FF5A36]">
                Explore products
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.items.map((item) => {
                const canIncrease =
                  item.purchasable &&
                  item.quantity < MAX_QUANTITY_PER_PRODUCT &&
                  (item.stockQuantity === null || item.quantity < item.stockQuantity);

                return (
                  <article key={item.id} className="flex gap-2.5 border-b border-[#F0ECE7] pb-3 last:border-0">
                    <Link
                      href={`/product/${encodeURIComponent(item.productId)}`}
                      aria-label={`View ${item.name}`}
                      className="h-[62px] w-[62px] shrink-0 overflow-hidden rounded-lg bg-[#FCFAF6]"
                    >
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[#B9AEA4]">
                          <Package className="h-5 w-5" />
                        </span>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/product/${encodeURIComponent(item.productId)}`}
                        className="line-clamp-2 text-[11px] font-semibold leading-4 text-[#26313B] hover:text-[#9F2D18]"
                      >
                        {item.name}
                      </Link>
                      <p className="mt-1 text-xs font-extrabold text-[#9F2D18]">
                        {item.unitPrice === null ? "Price unavailable" : formatNaira(item.unitPrice)}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex h-7 items-center rounded-lg border border-[#EAE6DF] bg-white">
                          <button
                            type="button"
                            disabled={busyItemId === item.id || !item.purchasable || item.quantity <= 1}
                            onClick={() => void changeItem(item, "PATCH", item.quantity - 1)}
                            aria-label={`Decrease ${item.name} quantity`}
                            className="flex h-7 w-7 items-center justify-center text-[#756B61] hover:text-[#9F2D18] disabled:opacity-35"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-6 text-center text-[10px] font-bold tabular-nums text-[#17202A]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={busyItemId === item.id || !canIncrease}
                            onClick={() => void changeItem(item, "PATCH", item.quantity + 1)}
                            aria-label={`Increase ${item.name} quantity`}
                            className="flex h-7 w-7 items-center justify-center text-[#756B61] hover:text-[#9F2D18] disabled:opacity-35"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={busyItemId === item.id}
                          onClick={() => void changeItem(item, "DELETE")}
                          aria-label={`Remove ${item.name} from cart`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9A8E84] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:opacity-40"
                        >
                          {busyItemId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>

                      {!item.purchasable && (
                        <p className="mt-1 text-[9px] leading-3 text-[#B42318]">
                          {item.unavailableReason ?? "This product cannot currently be checked out."}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-[#EAE6DF] bg-[#FCFAF6] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[#756B61]">Subtotal</span>
            <span className="text-base font-extrabold text-[#401B13]">{formatNaira(cart.subtotal)}</span>
          </div>
          <Link
            href="/cart"
            className="flex min-h-10 w-full items-center justify-center rounded-lg border border-[#FFD0C3] bg-white px-3 py-2 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFF1ED]"
          >
            View cart
          </Link>
          {canCheckout ? (
            <Link
              href="/checkout"
              className="mt-2 flex min-h-10 w-full items-center justify-center rounded-lg bg-[#FF5A36] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#E94A28]"
            >
              Continue to checkout
            </Link>
          ) : (
            <p className="mt-2 text-center text-[9px] leading-4 text-[#8B7E74]">
              {cart.items.length === 0
                ? "Add a product to begin checkout."
                : "Review unavailable products in your cart before checkout."}
            </p>
          )}
        </footer>
      </section>
    </aside>
  );
}
