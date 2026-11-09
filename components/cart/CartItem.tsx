"use client";

import Link from "next/link";

import {
  Minus,
  Plus,
  Package,
  Trash2,
  LoaderCircle,
} from "lucide-react";

export type CartItemData = {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  unitPrice: number | null;
  originalPrice: number | null;
  quantity: number;
  lineTotal: number | null;
  availability: string;
  stockQuantity: number | null;
  imageUrl: string | null;
  business: {
    id: string;
    name: string;
    status: string;
    deletedAt: string | null;
  };
  purchasable: boolean;
  unavailableReason: string | null;
};

type CartItemProps = {
  item: CartItemData;
  busy: boolean;
  onQuantityChange: (
    itemId: string,
    quantity: number,
  ) => void;
  onRemove: (itemId: string) => void;
};

function formatNaira(amount: number | null): string {
  if (amount === null) {
    return "Price unavailable";
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CartItem({
  item,
  busy,
  onQuantityChange,
  onRemove,
}: CartItemProps) {
  const maxQuantity =
    item.stockQuantity === null
      ? 50
      : Math.min(50, item.stockQuantity);

  const canReduceQuantity =
    item.purchasable ||
    item.unavailableReason?.toLowerCase().includes("stock") === true;

  // Only show a discount when the original price is valid
  // and greater than the current selling price.
  const hasDiscount =
    item.unitPrice !== null &&
    item.unitPrice > 0 &&
    item.originalPrice !== null &&
    Number.isSafeInteger(item.originalPrice) &&
    item.originalPrice > item.unitPrice;

  return (
    <article className="rounded-2xl border border-[#EAE6DF] bg-white p-3 sm:p-4">
      <div className="flex gap-3 sm:gap-4">
        {/* PRODUCT IMAGE */}
        <Link
          href={`/product/${encodeURIComponent(item.productId)}`}
          className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] sm:h-28 sm:w-28"
          aria-label={`View ${item.name}`}
        >
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Package className="h-8 w-8 text-[#B6A99E]" />
          )}
        </Link>

        {/* PRODUCT INFORMATION */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/product/${encodeURIComponent(item.productId)}`}
                className="line-clamp-2 text-sm font-extrabold text-[#17202A] transition hover:text-[#9F2D18]"
              >
                {item.name}
              </Link>

              <p className="mt-1 truncate text-[11px] text-[#756B61]">
                Sold by {item.business.name}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onRemove(item.id)}
              disabled={busy}
              aria-label={`Remove ${item.name} from cart`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#9B9188] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-black text-[#9F2D18]">
              {formatNaira(item.unitPrice)}
            </p>

            {hasDiscount && (
              <p className="text-xs font-medium text-[#9B9188] line-through">
                {formatNaira(item.originalPrice)}
              </p>
            )}
          </div>

          {/* QUANTITY AND LINE TOTAL */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex h-9 items-center overflow-hidden rounded-lg border border-[#EAE6DF] bg-[#FCFAF6]">
              <button
                type="button"
                onClick={() =>
                  onQuantityChange(
                    item.id,
                    item.quantity - 1,
                  )
                }
                disabled={
                  busy ||
                  item.quantity <= 1 ||
                  !canReduceQuantity
                }
                aria-label={`Decrease quantity of ${item.name}`}
                className="flex h-full w-9 items-center justify-center text-[#756B61] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>

              <span
                className="min-w-9 text-center text-xs font-bold text-[#17202A]"
                aria-live="polite"
              >
                {item.quantity}
              </span>

              <button
                type="button"
                onClick={() =>
                  onQuantityChange(
                    item.id,
                    item.quantity + 1,
                  )
                }
                disabled={
                  busy ||
                  !item.purchasable ||
                  item.quantity >= maxQuantity
                }
                aria-label={`Increase quantity of ${item.name}`}
                className="flex h-full w-9 items-center justify-center text-[#756B61] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="text-sm font-extrabold text-[#17202A]">
              {formatNaira(item.lineTotal)}
            </p>
          </div>
        </div>
      </div>

      {/* AVAILABILITY MESSAGE */}
      {!item.purchasable && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-[#F0D7B3] bg-[#FFF8EC] px-3 py-2.5 text-[11px] leading-5 text-[#796B5C]"
        >
          {item.unavailableReason ??
            "This product cannot currently be purchased."}

          <p className="mt-1 font-semibold text-[#9F2D18]">
            Remove this item or adjust its quantity before checkout.
          </p>
        </div>
      )}
    </article>
  );
}
