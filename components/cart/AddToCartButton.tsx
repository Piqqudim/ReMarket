"use client";

import { useState } from "react";

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
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
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

export default function AddToCartButton({
  productId,
  availability,
  price,
  priceMin,
  priceMax,
}: AddToCartButtonProps) {
  const router = useRouter();

  const [quantity, setQuantity] = useState(1);

  const [loading, setLoading] = useState(false);

  const [success, setSuccess] = useState(false);

  const [error, setError] = useState("");

  const hasFixedPrice =
    price !== null &&
    price > 0 &&
    priceMin === null &&
    priceMax === null;

  const canPurchase =
    availability === "AVAILABLE" &&
    hasFixedPrice;

  async function addToCart() {
    if (!canPurchase || loading) {
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
          quantity,
        }),
      });

      const payload: unknown =
        await response.json().catch(() => null);

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        router.push("/buyer/login");
        return;
      }

      if (!response.ok) {
        const message =
          isRecord(payload) &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to add this product to your cart.";

        throw new Error(message);
      }

      setSuccess(true);
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
    return (
      <div className="rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-4">
        <p className="text-xs font-extrabold text-[#5E4730]">
          Online checkout unavailable
        </p>

        <p className="mt-1 text-[11px] leading-5 text-[#796B5C]">
          {availability !== "AVAILABLE"
            ? "This product is not currently available for online purchase."
            : "This product needs a confirmed fixed price before it can be purchased online."}
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-[#FFD9CE] bg-[#FFF7F4] p-4">
      <h2 className="text-sm font-extrabold text-[#401B13]">
        Buy this product
      </h2>

      <p className="mt-1 text-[11px] text-[#756B61]">
        Choose your quantity and add the product to your cart.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {/* QUANTITY */}

        <div className="inline-flex h-11 items-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-white">
          <button
            type="button"
            onClick={() =>
              setQuantity((current) =>
                Math.max(1, current - 1),
              )
            }
            disabled={loading || quantity <= 1}
            aria-label="Decrease quantity"
            className="flex h-full w-11 items-center justify-center text-[#756B61] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>

          <span
            className="min-w-10 text-center text-sm font-extrabold text-[#17202A]"
            aria-live="polite"
          >
            {quantity}
          </span>

          <button
            type="button"
            onClick={() =>
              setQuantity((current) =>
                Math.min(MAX_QUANTITY, current + 1),
              )
            }
            disabled={loading || quantity >= MAX_QUANTITY}
            aria-label="Increase quantity"
            className="flex h-full w-11 items-center justify-center text-[#756B61] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* ADD TO CART */}

        <button
          type="button"
          onClick={() => void addToCart()}
          disabled={loading}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
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
          className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] leading-5 text-red-700"
        >
          {error}
        </p>
      )}

      {success && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B8E5D2] bg-[#F0FBF5] p-3"
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

      <p className="mt-3 text-[10px] leading-5 text-[#91877E]">
        Adding a product to your cart does not reserve its stock. Availability is checked again during checkout.
      </p>
    </section>
  );
}