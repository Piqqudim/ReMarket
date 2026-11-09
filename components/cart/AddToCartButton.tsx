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
};

const MAX_QUANTITY = 50;

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
}: AddToCartButtonProps) {
  const router = useRouter();

  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const safeStock = getSafeStockQuantity(stockQuantity);
  const hasValidPrice =
    typeof price === "number" &&
    Number.isSafeInteger(price) &&
    price > 0;

  const outOfStock =
    availability === "UNAVAILABLE" ||
    (safeStock !== null && safeStock <= 0);

  const canPurchase =
    availability === "AVAILABLE" &&
    hasValidPrice &&
    !outOfStock;

  const maxQuantity =
    safeStock === null
      ? MAX_QUANTITY
      : Math.min(MAX_QUANTITY, safeStock);

  const selectedQuantity = Math.min(
    Math.max(1, quantity),
    Math.max(1, maxQuantity),
  );

  // Keep the selected quantity valid if stock changes while this page is open.
  useEffect(() => {
    setQuantity((current) =>
      Math.min(Math.max(1, current), Math.max(1, maxQuantity)),
    );
  }, [maxQuantity]);

  function changeQuantity(nextQuantity: number) {
    setQuantity(
      Math.min(Math.max(1, nextQuantity), maxQuantity),
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
        // The server must look up the current price and stock itself.
        body: JSON.stringify({
          productId,
          quantity: selectedQuantity,
        }),
      });

      const payload: unknown = await response
        .json()
        .catch(() => null);

      if (response.status === 401 || response.status === 403) {
        const callbackUrl = `/product/${encodeURIComponent(productId)}`;
        router.push(
          `/buyer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
        );
        return;
      }

      if (!response.ok) {
        throw new Error(getApiError(payload));
      }

      setSuccess(true);
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
    const title = outOfStock
      ? "Currently out of stock"
      : availability !== "AVAILABLE"
        ? "Online checkout unavailable"
        : "Fixed price required";

    const message = outOfStock
      ? "This product cannot currently be added to your cart."
      : availability !== "AVAILABLE"
        ? "Availability needs to be confirmed before online checkout."
        : "A valid fixed selling price is required before this product can be purchased online.";

    return (
      <div className="rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3">
        <p className="text-xs font-bold text-[#514840]">{title}</p>
        <p className="mt-1 text-[11px] leading-5 text-[#756B61]">
          {message}
        </p>
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
              onClick={() => changeQuantity(selectedQuantity - 1)}
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
              onClick={() => changeQuantity(selectedQuantity + 1)}
              disabled={loading || selectedQuantity >= maxQuantity}
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
        Stock is checked again by the server when your cart is updated and
        during checkout. Adding a product does not reserve stock.
      </p>
    </section>
  );
}
