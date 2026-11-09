"use client";

import Link from "next/link";

import {
  ArrowRight,
  ShoppingBag,
  ShieldCheck,
} from "lucide-react";

type CartSummaryProps = {
  itemCount: number;
  subtotal: number;
  unavailableCount: number;
};

function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CartSummary({
  itemCount,
  subtotal,
  unavailableCount,
}: CartSummaryProps) {
  const canCheckout =
    itemCount > 0 &&
    unavailableCount === 0 &&
    Number.isSafeInteger(subtotal) &&
    subtotal > 0;

  return (
    <aside className="rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-[0_4px_20px_rgba(23,32,42,0.035)]">
      <h2 className="text-base font-extrabold text-[#17202A]">
        Order summary
      </h2>

      <div className="mt-5 space-y-4">
        <div className="flex items-center justify-between gap-3 text-xs text-[#756B61]">
          <span>Items</span>

          <span className="font-semibold text-[#17202A]">
            {itemCount}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-[#756B61]">
          <span>Subtotal</span>

          <span className="font-bold text-[#17202A]">
            {formatNaira(subtotal)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-[#756B61]">
          <span>Delivery fee</span>

          <span className="font-semibold text-[#81766C]">
            To be confirmed
          </span>
        </div>

        <div className="border-t border-[#EAE6DF] pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-extrabold text-[#17202A]">
              Subtotal
            </span>

            <span className="text-lg font-black text-[#9F2D18]">
              {formatNaira(subtotal)}
            </span>
          </div>

          <p className="mt-1 text-[10px] leading-5 text-[#91877E]">
            The final order amount and any applicable delivery
            charges must be confirmed before order placement.
          </p>
        </div>
      </div>

      {unavailableCount > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-[#F0D7B3] bg-[#FFF8EC] p-3 text-[11px] leading-5 text-[#796B5C]"
        >
          {unavailableCount}{" "}
          {unavailableCount === 1
            ? "product is"
            : "products are"}{" "}
          not ready for checkout. Remove or correct them first.
        </div>
      )}

      {canCheckout ? (
        <Link
          href="/checkout"
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2"
        >
          Continue to checkout

          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="mt-5 flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#EAE6DF] px-4 py-3 text-xs font-extrabold text-[#91877E]"
        >
          <ShoppingBag className="h-4 w-4" />

          {itemCount === 0
            ? "Your cart is empty"
            : unavailableCount > 0
              ? "Resolve unavailable products"
              : "Review your cart"}
        </button>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#FCFAF6] p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" />

        <p className="text-[10px] leading-5 text-[#756B61]">
          Product availability, stock and prices will be
          checked again before your order is created.
        </p>
      </div>
    </aside>
  );
}