"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Package,
  PackageOpen,
  RefreshCw,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import CartItem, { type CartItemData } from "@/components/cart/CartItem";
import CartSummary from "@/components/cart/CartSummary";

const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_ORDER_TOTAL = 2_147_483_647;
const CART_CHANGED_EVENT = "remarket-cart-changed";
const QUANTITY_DEBOUNCE_MS = 180;

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

type QuantityQueueEntry = {
  desiredQuantity: number;
  confirmedQuantity: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  return cleaned || fallback;
}

function getNumber(value: unknown, fallback: number | null = null): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function dispatchCartChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CART_CHANGED_EVENT));
  }
}

function parseCartResponse(value: unknown): CartResponse | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;

  const items: CartItemData[] = value.items.flatMap((rawItem): CartItemData[] => {
    if (!isRecord(rawItem) || typeof rawItem.id !== "string") return [];
    if (
      !Number.isSafeInteger(rawItem.quantity) ||
      (rawItem.quantity as number) < 1 ||
      (rawItem.quantity as number) > MAX_QUANTITY_PER_PRODUCT
    ) return [];

    const quantity = rawItem.quantity as number;
    const rawProduct = isRecord(rawItem.product) ? rawItem.product : null;
    const rawBusiness = rawProduct && isRecord(rawProduct.business) ? rawProduct.business : null;
    const productId = typeof rawItem.productId === "string"
      ? rawItem.productId
      : getString(rawProduct?.id);
    if (!productId) return [];

    const productNotDeleted = rawProduct?.deletedAt === null || rawProduct?.deletedAt === undefined;
    const businessNotDeleted = rawBusiness?.deletedAt === null || rawBusiness?.deletedAt === undefined;
    const productAvailable = Boolean(
      rawProduct &&
      rawProduct.status === "ACTIVE" &&
      productNotDeleted &&
      rawProduct.availability === "AVAILABLE" &&
      rawBusiness?.status === "ACTIVE" &&
      businessNotDeleted,
    );

    const business: CartItemData["business"] = {
      id: getString(rawBusiness?.id, "unavailable-business")!,
      name: getString(rawBusiness?.name, "Business unavailable")!,
      status: getString(rawBusiness?.status, "INACTIVE")!,
      deletedAt: getString(rawBusiness?.deletedAt),
    };

    const rawImages = Array.isArray(rawProduct?.images) ? rawProduct.images : [];
    const firstImage = rawImages.find(isRecord);
    const imageUrl = getString(rawProduct?.imageUrl)
      ?? getString(firstImage?.imageUrl)
      ?? getString(firstImage?.url);

    const unitPrice = getNumber(rawProduct?.price);
    const rawOriginalPrice = getNumber(rawProduct?.originalPrice);
    const originalPrice = unitPrice !== null && unitPrice > 0 && rawOriginalPrice !== null && rawOriginalPrice > unitPrice
      ? rawOriginalPrice
      : null;
    const lineTotal = getNumber(rawItem.lineTotal);
    const purchasable = rawItem.purchasable === true && productAvailable;

    return [{
      id: rawItem.id,
      productId,
      name: getString(rawProduct?.name, "Product unavailable")!,
      description: getString(rawProduct?.description),
      unitPrice,
      originalPrice,
      quantity,
      lineTotal,
      availability: getString(rawProduct?.availability, "UNAVAILABLE")!,
      stockQuantity: getNumber(rawProduct?.stockQuantity),
      imageUrl,
      business,
      purchasable,
      unavailableReason: getString(rawItem.unavailableReason)
        ?? (purchasable ? null : "This product is no longer available."),
    }];
  });

  const calculatedItemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const calculatedSubtotal = items.reduce(
    (sum, item) => sum + (item.purchasable ? item.lineTotal ?? 0 : 0),
    0,
  );

  return {
    items,
    itemCount: typeof value.itemCount === "number" && Number.isSafeInteger(value.itemCount) && value.itemCount >= 0
      ? value.itemCount
      : calculatedItemCount,
    subtotal: calculatedSubtotal,
    currency: typeof value.currency === "string" ? value.currency : "NGN",
  };
}

function calculateLineTotal(item: CartItemData, quantity: number): number | null {
  if (item.unitPrice === null) return null;
  const total = item.unitPrice * quantity;
  return Number.isSafeInteger(total) && total > 0 && total <= MAX_ORDER_TOTAL ? total : null;
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItemData[]>([]);
  const itemsRef = useRef<CartItemData[]>([]);
  const quantityQueueRef = useRef(new Map<string, QuantityQueueEntry>());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingQuantityIds, setPendingQuantityIds] = useState<Record<string, boolean>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [clearingCart, setClearingCart] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const commitItems = useCallback((next: CartItemData[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const markQuantityPending = useCallback((itemId: string, pending: boolean) => {
    setPendingQuantityIds((current) => {
      const next = { ...current };
      if (pending) next[itemId] = true;
      else delete next[itemId];
      return next;
    });
  }, []);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.purchasable ? item.lineTotal ?? 0 : 0), 0),
    [items],
  );
  const unavailableCount = useMemo(() => items.filter((item) => !item.purchasable).length, [items]);
  const sellerCount = useMemo(() => new Set(items.map((item) => item.business.id)).size, [items]);
  const totalProductLines = items.length;
  const hasPendingQuantity = Object.keys(pendingQuantityIds).length > 0;

  const groupedItems = useMemo(() => {
    const groups = new Map<string, CartGroup>();
    for (const item of items) {
      const businessId = item.business?.id ?? "unavailable-business";
      if (!groups.has(businessId)) {
        groups.set(businessId, {
          businessId,
          businessName: item.business?.name ?? "Business unavailable",
          items: [],
        });
      }
      groups.get(businessId)?.items.push(item);
    }
    return Array.from(groups.values());
  }, [items]);

  const loadCart = useCallback(async (options?: { signal?: AbortSignal; background?: boolean }) => {
    const signal = options?.signal;
    const background = options?.background === true;
    if (background || itemsRef.current.length > 0) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/cart", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to load your cart.");
      }
      const parsed = parseCartResponse(payload);
      if (!parsed) throw new Error("The cart response could not be read.");
      if (signal?.aborted) return;
      commitItems(parsed.items);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      console.error("Load cart error:", loadError);
      if (!signal?.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load your cart.");
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [commitItems, router]);

  useEffect(() => {
    const controller = new AbortController();
    void loadCart({ signal: controller.signal });
    return () => controller.abort();
  }, [loadCart]);

  useEffect(() => () => {
    for (const entry of quantityQueueRef.current.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    quantityQueueRef.current.clear();
  }, []);

  const refreshCart = useCallback(() => {
    if (refreshing || clearingCart || busyItemId !== null || hasPendingQuantity) return;
    void loadCart({ background: true });
  }, [busyItemId, clearingCart, hasPendingQuantity, loadCart, refreshing]);

  const flushQuantityUpdate = useCallback(async (itemId: string) => {
    const entry = quantityQueueRef.current.get(itemId);
    if (!entry || entry.inFlight) return;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    const requestedQuantity = entry.desiredQuantity;
    entry.inFlight = true;

    try {
      const response = await fetch(`/api/cart/items/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ quantity: requestedQuantity }),
      });

      if (response.status === 401 || response.status === 403) {
        quantityQueueRef.current.delete(itemId);
        markQuantityPending(itemId, false);
        router.replace("/buyer/login");
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to update the quantity.");
      }

      const returnedItem = isRecord(payload) && isRecord(payload.item) ? payload.item : null;
      const confirmedQuantity = returnedItem && Number.isSafeInteger(returnedItem.quantity)
        && (returnedItem.quantity as number) >= 1
        ? returnedItem.quantity as number
        : requestedQuantity;
      entry.confirmedQuantity = confirmedQuantity;
      entry.inFlight = false;

      // A shopper may have tapped + or - while the request was in flight.
      // Send only the latest desired value, in sequence, without a second GET.
      if (entry.desiredQuantity !== requestedQuantity) {
        void flushQuantityUpdate(itemId);
        return;
      }

      quantityQueueRef.current.delete(itemId);
      markQuantityPending(itemId, false);
      setFeedback("Cart updated.");
      setError("");
      dispatchCartChanged();
    } catch (updateError) {
      entry.inFlight = false;
      if (entry.desiredQuantity !== requestedQuantity) {
        // The failed request was superseded by a newer tap. Try the latest value.
        void flushQuantityUpdate(itemId);
        return;
      }

      const rollbackQuantity = entry.confirmedQuantity;
      commitItems(itemsRef.current.map((item) => item.id === itemId
        ? { ...item, quantity: rollbackQuantity, lineTotal: calculateLineTotal(item, rollbackQuantity) }
        : item));
      quantityQueueRef.current.delete(itemId);
      markQuantityPending(itemId, false);
      setError(updateError instanceof Error ? updateError.message : "Unable to update this item.");
    }
  }, [commitItems, markQuantityPending, router]);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    if (clearingCart || busyItemId !== null) return;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_PRODUCT) return;

    const currentItem = itemsRef.current.find((item) => item.id === itemId);
    if (!currentItem) return;
    const maxQuantity = currentItem.stockQuantity === null
      ? MAX_QUANTITY_PER_PRODUCT
      : Math.min(MAX_QUANTITY_PER_PRODUCT, currentItem.stockQuantity);
    if (quantity > maxQuantity || (quantity > currentItem.quantity && !currentItem.purchasable)) return;

    const entry = quantityQueueRef.current.get(itemId) ?? {
      desiredQuantity: currentItem.quantity,
      confirmedQuantity: currentItem.quantity,
      timer: null,
      inFlight: false,
    };
    entry.desiredQuantity = quantity;
    if (entry.timer) clearTimeout(entry.timer);
    quantityQueueRef.current.set(itemId, entry);

    commitItems(itemsRef.current.map((item) => item.id === itemId
      ? { ...item, quantity, lineTotal: calculateLineTotal(item, quantity) }
      : item));
    markQuantityPending(itemId, true);
    setError("");
    setFeedback("");

    // Debounce fast repeated taps and submit the final chosen quantity.
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void flushQuantityUpdate(itemId);
    }, QUANTITY_DEBOUNCE_MS);
  }, [busyItemId, clearingCart, commitItems, flushQuantityUpdate, markQuantityPending]);

  const removeItem = useCallback(async (itemId: string) => {
    if (busyItemId || clearingCart || pendingQuantityIds[itemId]) return;
    const snapshot = itemsRef.current;
    const itemIndex = snapshot.findIndex((item) => item.id === itemId);
    if (itemIndex < 0) return;
    const removedItem = snapshot[itemIndex];

    setBusyItemId(itemId);
    setError("");
    setFeedback("");
    commitItems(snapshot.filter((item) => item.id !== itemId));

    try {
      const response = await fetch(`/api/cart/items/${encodeURIComponent(itemId)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to remove this item.");
      }
      setFeedback("Product removed from your cart.");
      dispatchCartChanged();
    } catch (removeError) {
      const restored = [...itemsRef.current];
      restored.splice(Math.min(itemIndex, restored.length), 0, removedItem);
      commitItems(restored);
      setError(removeError instanceof Error ? removeError.message : "Unable to remove this product.");
    } finally {
      setBusyItemId(null);
    }
  }, [busyItemId, clearingCart, commitItems, pendingQuantityIds, router]);

  const clearCart = useCallback(async () => {
    if (clearingCart || busyItemId || itemsRef.current.length === 0 || hasPendingQuantity) return;
    if (!window.confirm("Are you sure you want to remove all products from your cart?")) return;

    const previousItems = itemsRef.current;
    setClearingCart(true);
    setError("");
    setFeedback("");
    commitItems([]);

    try {
      const response = await fetch("/api/cart", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Unable to clear your cart.");
      }
      setFeedback("Your cart has been cleared.");
      dispatchCartChanged();
    } catch (clearError) {
      commitItems(previousItems);
      setError(clearError instanceof Error ? clearError.message : "Unable to clear your cart.");
    } finally {
      setClearingCart(false);
    }
  }, [busyItemId, clearingCart, commitItems, hasPendingQuantity, router]);

  if (loading) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />
        <main className="flex min-h-[60vh] items-center justify-center bg-white px-4 pb-24">
          <div role="status" className="flex items-center gap-3 text-sm text-[#62574E]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
            Loading your cart…
          </div>
        </main>
        <MobileBottomNav />
      </>
    );
  }

  const isEmpty = items.length === 0;

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />
      <main id="main-content" className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10">
        <div className="mx-auto max-w-[1440px] px-3 pb-10 pt-4 sm:px-5 sm:pt-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-[11px] text-[#81766D]">
            <Link href="/" className="hover:text-[#9F2D18]">Home</Link>
            <span aria-hidden="true">/</span>
            <Link href="/shop" className="hover:text-[#9F2D18]">Shop</Link>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-[#17202A]">Shopping cart</span>
          </nav>

          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[#EAE6DF] pb-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[#17202A] sm:text-3xl">Shopping cart</h1>
              <p className="mt-1 text-xs text-[#756B61] sm:text-sm">
                {isEmpty ? "Your selected products will appear here." : `${itemCount} ${itemCount === 1 ? "item" : "items"} from ${sellerCount} ${sellerCount === 1 ? "seller" : "sellers"}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isEmpty && (
                <button
                  type="button"
                  onClick={refreshCart}
                  disabled={refreshing || clearingCart || busyItemId !== null || hasPendingQuantity}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#E5DED6] bg-white px-3 py-2 text-xs font-semibold text-[#62574E] hover:border-[#FFB39F] hover:text-[#9F2D18] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              )}
              <Link href="/shop" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#FF5A36] px-4 py-2 text-xs font-bold text-white hover:bg-[#E94E2C]">
                Continue shopping <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {refreshing && (
            <div role="status" className="mb-3 flex items-center gap-2 text-[11px] text-[#756B61]">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#FF5A36]" />Refreshing cart in the background…
            </div>
          )}
          {error && (
            <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700">
              <span>{error}</span>
              <button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="shrink-0 rounded p-1 hover:bg-red-100">×</button>
            </div>
          )}
          {feedback && (
            <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />{feedback}
              <button type="button" onClick={() => setFeedback("")} aria-label="Dismiss message" className="ml-auto rounded p-1 hover:bg-green-100">×</button>
            </div>
          )}

          {unavailableCount > 0 && !isEmpty && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-[#F0D7B3] bg-[#FFFAEC] px-4 py-3">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#96610D]" />
              <div>
                <p className="text-xs font-bold text-[#79500E]">Some products are unavailable</p>
                <p className="mt-1 text-[11px] leading-5 text-[#8B6A2B]">{unavailableCount} {unavailableCount === 1 ? "product is" : "products are"} excluded from your payable subtotal. Remove them or check back with the seller.</p>
              </div>
            </div>
          )}

          {isEmpty ? (
            <section className="mx-auto max-w-2xl border-y border-[#EAE6DF] bg-white px-4 py-14 text-center sm:py-16">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF1ED] text-[#9F2D18]">
                <PackageOpen className="h-8 w-8" />
              </div>
              <h2 className="mt-5 text-xl font-bold text-[#17202A]">{error ? "Your cart couldn't be loaded" : "Your cart is empty"}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#756B61]">
                {error ? "Check your connection and try loading your cart again." : "Find something you like from businesses nearby and add it to your cart."}
              </p>
              {error ? (
                <button type="button" onClick={refreshCart} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white hover:bg-[#E94E2C]">
                  <RefreshCw className="h-4 w-4" /> Try again
                </button>
              ) : (
                <Link href="/shop" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white hover:bg-[#E94E2C]">
                  <ShoppingBag className="h-4 w-4" /> Start shopping <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </section>
          ) : (
            <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_370px] xl:gap-8">
              <section className="min-w-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-[#17202A]">Your items <span className="ml-1 text-xs font-medium text-[#81766D]">({totalProductLines})</span></h2>
                  <button
                    type="button"
                    onClick={clearCart}
                    disabled={clearingCart || busyItemId !== null || hasPendingQuantity}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-[11px] font-semibold text-[#756B61] hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:opacity-40"
                  >
                    {clearingCart ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Clear cart
                  </button>
                </div>

                {hasPendingQuantity && (
                  <div role="status" className="mb-3 flex items-center gap-2 text-[10px] text-[#756B61]">
                    <LoaderCircle className="h-3 w-3 animate-spin text-[#FF5A36]" /> Saving quantity changes…
                  </div>
                )}

                <div className="space-y-4">
                  {groupedItems.map((group) => (
                    <section key={group.businessId} className="overflow-hidden border border-[#EAE6DF] bg-white">
                      <div className="flex items-center justify-between gap-3 border-b border-[#EEE9E3] bg-[#FCFAF7] px-3 py-3 sm:px-4">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF1ED] text-[#9F2D18]"><Store className="h-4 w-4" /></div>
                          <div className="min-w-0">
                            <p className="text-[9px] uppercase tracking-wide text-[#91877E]">Seller</p>
                            <h3 className="truncate text-xs font-bold text-[#292522]">{group.businessName}</h3>
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] font-medium text-[#81766D]">{group.items.length} {group.items.length === 1 ? "product" : "products"}</span>
                      </div>
                      <div className="divide-y divide-[#F0ECE7] px-3 sm:px-4">
                        {group.items.map((item) => (
                          <div key={item.id} className="py-3 first:pt-3 last:pb-3">
                            <CartItem
                              item={item}
                              busy={busyItemId === item.id || clearingCart}
                              quantityPending={Boolean(pendingQuantityIds[item.id])}
                              onQuantityChange={updateQuantity}
                              onRemove={removeItem}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <Link href="/shop" className="mt-5 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[#9F2D18] hover:text-[#FF5A36]">
                  <ArrowLeft className="h-4 w-4" /> Continue shopping
                </Link>
              </section>

              <aside className="min-w-0 lg:sticky lg:top-24">
                <div className="border border-[#EAE6DF] bg-white">
                  <div className="border-b border-[#EEE9E3] px-4 py-4 sm:px-5">
                    <h2 className="text-base font-bold text-[#17202A]">Order summary</h2>
                    <p className="mt-1 text-[11px] text-[#81766D]">Your current cart total</p>
                  </div>
                  <div className="p-4 sm:p-5">
                    <div aria-busy={hasPendingQuantity} className={hasPendingQuantity ? "pointer-events-none opacity-60" : ""}>
                      <CartSummary itemCount={itemCount} subtotal={subtotal} unavailableCount={unavailableCount} />
                    </div>
                    {unavailableCount > 0 && (
                      <p className="mt-3 text-[10px] leading-5 text-[#8B6A2B]">Unavailable products are excluded from your payable subtotal.</p>
                    )}
                    <div className="mt-5 space-y-3 border-t border-[#EEE9E3] pt-4">
                      <div className="flex items-start gap-2.5">
                        <Store className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" />
                        <div><p className="text-[11px] font-semibold text-[#514840]">Multiple sellers</p><p className="mt-0.5 text-[10px] leading-5 text-[#81766D]">Products from different businesses are grouped by seller.</p></div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" />
                        <div><p className="text-[11px] font-semibold text-[#514840]">Delivery calculated at checkout</p><p className="mt-0.5 text-[10px] leading-5 text-[#81766D]">Choose delivery options after entering your address.</p></div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <Package className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" />
                        <div><p className="text-[11px] font-semibold text-[#514840]">Stock is checked again</p><p className="mt-0.5 text-[10px] leading-5 text-[#81766D]">Product availability and quantities are validated during checkout.</p></div>
                      </div>
                    </div>
                    {hasPendingQuantity && <p className="mt-4 text-[10px] text-[#9F2D18]">Saving your latest quantity changes before checkout.</p>}
                  </div>
                </div>
                <p className="mt-3 text-center text-[10px] leading-5 text-[#91877E]">Delivery fees are not included until you select a delivery option at checkout.</p>
              </aside>
            </div>
          )}

          <footer className="mt-10 flex items-center justify-center gap-3 border-t border-[#EAE6DF] pt-5 text-[10px] text-[#9B9188]">
            <span className="h-px w-10 bg-[#EAE6DF]" />
            <span>ReMarket · Find it nearby</span>
            <span className="h-px w-10 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>
      <MobileBottomNav />
    </>
  );
}
