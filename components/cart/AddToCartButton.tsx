
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Plus,
  Minus,
  LoaderCircle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

type Availability =
  | "AVAILABLE"
  | "ASK_SELLER"
  | "UNAVAILABLE";

type AddToCartButtonProps = {
  productId: string;
  availability: Availability;
  /** Current selling price only. Never pass originalPrice here. */
  price: number | null;
  stockQuantity?: number | null;
  isPurchaseReady?: boolean;
  hasShippingMeasurements?: boolean;
  compact?: boolean;
};

const MAX_QUANTITY = 50;
const CART_CHANGED_EVENT = "remarket-cart-changed";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getSafeStockQuantity(
  value: number | null | undefined,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return null;
  }

  return value;
}

function getApiError(value: unknown): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : "Unable to add this product to your cart. Please try again.";
}

export default function AddToCartButton({
  productId,
  availability,
  price,
  stockQuantity = null,
  isPurchaseReady = true,
  hasShippingMeasurements = true,
  compact = false,
}: AddToCartButtonProps) {
  const router = useRouter();

  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const hasExplicitStock = stockQuantity !== null && stockQuantity !== undefined;
  const hasInvalidStock = hasExplicitStock && getSafeStockQuantity(stockQuantity) === null;
  const safeStock = hasInvalidStock ? 0 : getSafeStockQuantity(stockQuantity);

  const hasValidPrice =
    typeof price === "number" &&
    Number.isSafeInteger(price) &&
    price > 0;

  const outOfStock = safeStock !== null && safeStock <= 0 && !hasInvalidStock;
  const unavailable = availability === "UNAVAILABLE";

  const canPurchase =
    isPurchaseReady &&
    availability === "AVAILABLE" &&
    hasValidPrice &&
    !outOfStock &&
    !unavailable &&
    !hasInvalidStock;

  const maxQuantity =
    safeStock === null
      ? MAX_QUANTITY
      : Math.min(MAX_QUANTITY, safeStock);

  const selectedQuantity = Math.min(
    Math.max(1, quantity),
    Math.max(1, maxQuantity),
  );

  useEffect(() => {
    setQuantity((current) =>
      Math.min(
        Math.max(1, current),
        Math.max(1, maxQuantity),
      ),
    );
  }, [maxQuantity]);

  function changeQuantity(nextQuantity: number) {
    setQuantity(
      Math.min(
        Math.max(1, nextQuantity),
        maxQuantity,
      ),
    );

    setSuccess(false);
    setError("");
  }

  async function addToCart() {
    if (
      !canPurchase ||
      loading ||
      selectedQuantity < 1 ||
      selectedQuantity > maxQuantity
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const response = await fetch("/api/cart/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          productId,
          quantity: selectedQuantity,
        }),
      });

      const payload: unknown = await response
        .json()
        .catch(() => null);

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        const callbackUrl =
          `/product/${encodeURIComponent(productId)}`;

        router.push(
          `/buyer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
        );

        return;
      }

      if (!response.ok) {
        throw new Error(getApiError(payload));
      }

      setSuccess(true);

      // Notify the global header and homepage side cart.
      window.dispatchEvent(
        new Event(CART_CHANGED_EVENT),
      );

      // Refresh server-rendered data where applicable.
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!canPurchase) {
    const title = hasInvalidStock
      ? "Stock information unavailable"
      : outOfStock
        ? "Currently out of stock"
        : unavailable
          ? "Currently unavailable"
          : availability === "ASK_SELLER"
            ? "Ask seller to confirm availability"
            : !hasValidPrice
              ? "Fixed price required"
              : !hasShippingMeasurements
                ? "Delivery details incomplete"
                : "Online checkout unavailable";

    const message = hasInvalidStock
      ? "The available stock information could not be confirmed. Please contact the seller."
      : outOfStock
        ? "This product cannot currently be added to your cart."
        : unavailable
          ? "The seller has marked this product as unavailable."
          : availability === "ASK_SELLER"
            ? "Availability needs to be confirmed with the seller before online checkout."
            : !hasValidPrice
              ? "A valid fixed selling price is required before this product can be purchased online."
              : !hasShippingMeasurements
                ? "The seller needs to complete the package measurements before delivery checkout."
                : "This product is not currently eligible for online checkout.";

    return (
      <div className="rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3">
        <p className="text-xs font-bold text-[#514840]">
          {title}
        </p>

        <p className="mt-1 text-[11px] leading-5 text-[#756B61]">
          {message}
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="mt-3 space-y-2">
        <button
          type="button"
          onClick={() => void addToCart()}
          disabled={loading || selectedQuantity > maxQuantity || maxQuantity < 1}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-3 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94E2C] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Add this product to cart"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
          {loading ? "Adding…" : success ? "Added to cart" : "Add to cart"}
        </button>
        {error && <p role="alert" className="text-xs leading-5 text-red-700">{error}</p>}
        {success && (
          <p role="status" className="text-xs font-semibold text-[#137A59]">
            Added successfully. <Link href="/cart" className="underline underline-offset-2">View cart</Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <section
      className="rounded-xl border border-[#EAE6DF] bg-white p-3 sm:p-4"
      aria-label="Purchase this product"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold text-[#756B61]">
            Quantity
          </p>

          <div className="inline-flex h-10 items-center overflow-hidden rounded-full border border-[#EAE6DF] bg-[#FCFAF6]">
            <button
              type="button"
              onClick={() =>
                changeQuantity(selectedQuantity - 1)
              }
              disabled={loading || selectedQuantity <= 1}
              aria-label="Decrease quantity"
              className="flex h-full w-9 items-center justify-center text-[#756B61] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            <span
              className="min-w-8 text-center text-xs font-extrabold text-[#17202A]"
              aria-live="polite"
              aria-label={`Quantity ${selectedQuantity}`}
            >
              {selectedQuantity}
            </span>

            <button
              type="button"
              onClick={() =>
                changeQuantity(selectedQuantity + 1)
              }
              disabled={
                loading ||
                selectedQuantity >= maxQuantity
              }
              aria-label="Increase quantity"
              className="flex h-full w-9 items-center justify-center text-[#756B61] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {safeStock !== null && (
            <p className="mt-1 text-[9px] text-[#91877E]">
              {safeStock} available
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void addToCart()}
          disabled={
            loading ||
            selectedQuantity > maxQuantity ||
            maxQuantity < 1
          }
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#E94E2C] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
        >
          {loading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <ShoppingCart className="h-4 w-4" />
          )}

          {loading ? "Adding..." : "Add to cart"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700"
        >
          {error}
        </p>
      )}

      {success && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#B8E5D2] bg-[#F0FBF5] px-3 py-2.5"
        >
          <p className="flex items-center gap-2 text-[11px] font-bold text-[#137A59]">
            <CheckCircle2 className="h-4 w-4" />
            Added to your cart.
          </p>

          <Link
            href="/cart"
            className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#9F2D18] hover:text-[#FF5A36]"
          >
            View cart
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <p className="mt-2.5 text-[9px] leading-4 text-[#91877E]">
        Stock is checked again by the server when your cart is
        updated and during checkout. Adding a product does not
        reserve stock.
      </p>
    </section>
  );
}
