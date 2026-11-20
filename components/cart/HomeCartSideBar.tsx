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

const CART_CHANGED_EVENT = "remarket-cart-changed";
const MAX_QUANTITY_PER_PRODUCT = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCartSnapshot(value: unknown): CartSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;

  const items = value.items.flatMap((raw): CartItem[] => {
    if (!isRecord(raw)) return [];

    const id = cleanString(raw.id);
    const productId = cleanString(raw.productId);
    const name = cleanString(raw.name);
    const rawQuantity = numberOrNull(raw.quantity);

    if (
      !id ||
      !productId ||
      !name ||
      rawQuantity === null ||
      !Number.isFinite(rawQuantity) ||
      rawQuantity < 1
    ) {
      return [];
    }

    const quantity = Math.floor(rawQuantity);
    if (quantity < 1) return [];

    const stockQuantity = numberOrNull(raw.stockQuantity);

    return [
      {
        id,
        productId,
        name,
        unitPrice: numberOrNull(raw.unitPrice),
        quantity,
        lineTotal: numberOrNull(raw.lineTotal),
        imageUrl: cleanString(raw.imageUrl),
        stockQuantity: stockQuantity === null ? null : Math.max(0, Math.floor(stockQuantity)),
        purchasable: raw.purchasable === true,
        unavailableReason: cleanString(raw.unavailableReason),
      },
    ];
  });

  const parsedCount = numberOrNull(value.itemCount);
  const parsedSubtotal = numberOrNull(value.subtotal);

  return {
    items,
    itemCount:
      parsedCount === null
        ? items.reduce((total, item) => total + item.quantity, 0)
        : Math.max(0, Math.floor(parsedCount)),
    subtotal:
      parsedSubtotal === null
        ? items.reduce((total, item) => total + (item.lineTotal ?? 0), 0)
        : Math.max(0, parsedSubtotal),
  };
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG", {
    maximumFractionDigits: 2,
  })}`;
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
    const controller = new AbortController();

    async function loadCart(showLoading: boolean) {
      if (showLoading && active) setLoading(true);
      if (active) setLoadError("");

      try {
        const response = await fetch("/api/cart", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
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
          const message =
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Unable to load your cart.";
          throw new Error(message);
        }

        const parsed = parseCartSnapshot(payload);
        if (!parsed) {
          throw new Error("The cart response could not be read.");
        }

        if (active) {
          setCart(parsed);
          setNeedsBuyerSignIn(false);
          setLoadError("");
        }
      } catch (error) {
        if (
          active &&
          !(error instanceof Error && error.name === "AbortError")
        ) {
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

    window.addEventListener(CART_CHANGED_EVENT, handleCartChanged);
    window.addEventListener("focus", handleCartChanged);
    void loadCart(true);

    return () => {
      active = false;
      controller.abort();
      window.removeEventListener(CART_CHANGED_EVENT, handleCartChanged);
      window.removeEventListener("focus", handleCartChanged);
    };
  }, []);

  const canCheckout = useMemo(
    () =>
      cart.items.length > 0 &&
      cart.items.every(
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
            ...(method === "PATCH"
              ? { "Content-Type": "application/json" }
              : {}),
          },
          ...(method === "PATCH"
            ? { body: JSON.stringify({ quantity }) }
            : {}),
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
        const message =
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : method === "PATCH"
              ? "Unable to update the quantity."
              : "Unable to remove this product.";
        throw new Error(message);
      }

      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
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
      <aside
        aria-label="Shopping cart"
        className="fixed bottom-6 right-4 z-30 hidden lg:block"
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={`Open cart, ${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"}`}
          aria-expanded={false}
          className="flex min-h-12 items-center gap-2.5 rounded-xl border border-[#EAE6DF] bg-white px-4 py-3 text-sm font-semibold text-[#9F2D18] shadow-[0_8px_26px_rgba(23,32,42,0.14)] transition hover:border-[#FFD0C3] hover:bg-[#FFF7F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2"
        >
          <ShoppingCart className="h-[18px] w-[18px]" aria-hidden="true" />
          <span>Cart</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A36] px-1.5 text-[10px] font-bold text-white">
            {cart.itemCount > 99 ? "99+" : cart.itemCount}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Shopping cart preview"
      className="fixed bottom-4 right-4 top-[140px] z-30 hidden w-[296px] lg:block xl:w-[312px]"
    >
      <section
        aria-labelledby="home-cart-title"
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#EAE6DF] bg-white shadow-[0_10px_30px_rgba(23,32,42,0.12)]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF0EB] text-[#9F2D18]">
              <ShoppingCart className="h-[17px] w-[17px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="home-cart-title" className="text-sm font-bold text-[#17202A]">
                Your cart
              </h2>
              <p className="mt-0.5 text-[11px] text-[#756B61]" aria-live="polite">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Collapse cart panel"
              aria-expanded={true}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#756B61] transition hover:bg-white hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <Link
              href="/cart"
              aria-label="Open full cart page"
              title="Open full cart"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#756B61] transition hover:bg-white hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </header>

        {loadError && (
          <div
            role="alert"
            className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700"
          >
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(CART_CHANGED_EVENT))}
              className="mt-1 font-semibold underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3">
          {loading ? (
            <div
              role="status"
              className="flex h-40 items-center justify-center text-[#9F2D18]"
            >
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span className="ml-2 text-xs text-[#756B61]">Loading cart...</span>
            </div>
          ) : needsBuyerSignIn ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FCFAF6] text-[#9F2D18]">
                <ShoppingCart className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-bold text-[#17202A]">
                Sign in to view your cart
              </p>
              <p className="mt-1 text-xs leading-5 text-[#756B61]">
                Use a buyer account to add and manage products.
              </p>
              <Link
                href={`/buyer/login?callbackUrl=${encodeURIComponent("/cart")}`}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2"
              >
                Sign in
              </Link>
            </div>
          ) : cart.items.length === 0 ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FCFAF6] text-[#A69B91]">
                <Package className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-bold text-[#17202A]">
                Your cart is empty
              </p>
              <p className="mt-1 text-xs leading-5 text-[#756B61]">
                Products you add will appear here.
              </p>
              <Link
                href="/shop"
                className="mt-4 text-xs font-semibold text-[#9F2D18] transition hover:text-[#FF5A36]"
              >
                Explore products
              </Link>
            </div>
          ) : (
            <div className="space-y-3.5">
              {cart.items.map((item) => {
                const canIncrease =
                  item.purchasable &&
                  item.quantity < MAX_QUANTITY_PER_PRODUCT &&
                  (item.stockQuantity === null ||
                    item.quantity < item.stockQuantity);
                const isBusy = busyItemId === item.id;

                return (
                  <article
                    key={item.id}
                    className="flex gap-3 border-b border-[#F0ECE7] pb-3.5 last:border-0 last:pb-0"
                  >
                    <Link
                      href={`/product/${encodeURIComponent(item.productId)}`}
                      aria-label={`View ${item.name}`}
                      className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-lg bg-[#FCFAF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[#B9AEA4]">
                          <Package className="h-6 w-6" aria-hidden="true" />
                        </span>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/product/${encodeURIComponent(item.productId)}`}
                        className="line-clamp-2 text-xs font-semibold leading-[1.4] text-[#26313B] transition hover:text-[#9F2D18] focus-visible:outline-none focus-visible:underline"
                      >
                        {item.name}
                      </Link>

                      <div className="mt-1 flex min-w-0 items-baseline justify-between gap-2">
                        <p className="truncate text-[13px] font-bold text-[#9F2D18]">
                          {item.unitPrice === null
                            ? "Price unavailable"
                            : formatNaira(item.unitPrice)}
                        </p>
                        {item.lineTotal !== null && item.quantity > 1 && (
                          <p className="shrink-0 text-[10px] font-medium text-[#756B61]">
                            {formatNaira(item.lineTotal)} total
                          </p>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div
                          className="inline-flex h-[30px] items-center overflow-hidden rounded-md border border-[#EAE6DF] bg-white"
                          aria-label={`Quantity controls for ${item.name}`}
                        >
                          <button
                            type="button"
                            disabled={
                              isBusy || !item.purchasable || item.quantity <= 1
                            }
                            onClick={() =>
                              void changeItem(item, "PATCH", item.quantity - 1)
                            }
                            aria-label={`Decrease ${item.name} quantity`}
                            className="flex h-[30px] w-[30px] items-center justify-center text-[#756B61] transition hover:bg-[#FFF7F4] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <span
                            className="min-w-7 px-1 text-center text-[11px] font-semibold tabular-nums text-[#17202A]"
                            aria-live="polite"
                          >
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={isBusy || !canIncrease}
                            onClick={() =>
                              void changeItem(item, "PATCH", item.quantity + 1)
                            }
                            aria-label={`Increase ${item.name} quantity`}
                            className="flex h-[30px] w-[30px] items-center justify-center text-[#756B61] transition hover:bg-[#FFF7F4] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void changeItem(item, "DELETE")}
                          aria-label={`Remove ${item.name} from cart`}
                          title="Remove item"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#94877D] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>

                      {!item.purchasable && (
                        <p className="mt-1.5 text-[10px] leading-4 text-[#B42318]">
                          {item.unavailableReason ??
                            "This product cannot currently be checked out."}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-[#EAE6DF] bg-[#FCFAF6] p-3.5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-[#756B61]">Items subtotal</p>
            <p className="text-base font-bold tabular-nums text-[#17202A]">
              {formatNaira(cart.subtotal)}
            </p>
          </div>

          <Link
            href="/cart"
            className="flex min-h-10 w-full items-center justify-center rounded-lg border border-[#FFD0C3] bg-white px-3 py-2.5 text-xs font-semibold text-[#9F2D18] transition hover:bg-[#FFF1ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2"
          >
            View cart
          </Link>

          {canCheckout ? (
            <Link
              href="/checkout"
              className="mt-2 flex min-h-10 w-full items-center justify-center rounded-lg bg-[#FF5A36] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2"
            >
              Continue to checkout
            </Link>
          ) : (
            <p className="mt-2 text-center text-[10px] leading-4 text-[#8B7E74]">
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
