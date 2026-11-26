"use client";

import Link from "next/link";
import { LoaderCircle, Minus, Package, Plus, Trash2 } from "lucide-react";

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
  quantityPending?: boolean;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
};

function formatNaira(amount: number | null): string {
  if (amount === null) return "Price unavailable";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CartItem({
  item,
  busy,
  quantityPending = false,
  onQuantityChange,
  onRemove,
}: CartItemProps) {
  const maxQuantity = item.stockQuantity === null ? 50 : Math.min(50, item.stockQuantity);
  const canReduceQuantity = item.purchasable || item.unavailableReason?.toLowerCase().includes("stock") === true;
  const hasDiscount = item.unitPrice !== null
    && item.unitPrice > 0
    && item.originalPrice !== null
    && Number.isSafeInteger(item.originalPrice)
    && item.originalPrice > item.unitPrice;

  return (
    <article className="flex min-w-0 gap-3 bg-white sm:gap-4">
      <Link
        href={`/product/${encodeURIComponent(item.productId)}`}
        className="flex h-[92px] w-[92px] shrink-0 items-center justify-center overflow-hidden border border-[#EAE6DF] bg-[#FCFAF7] sm:h-28 sm:w-28"
        aria-label={`View ${item.name}`}
      >
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-contain p-0" />
        ) : (
          <Package className="h-8 w-8 text-[#B6A99E]" />
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/product/${encodeURIComponent(item.productId)}`} className="line-clamp-2 text-xs font-semibold leading-5 text-[#17202A] hover:text-[#9F2D18] sm:text-sm">
              {item.name}
            </Link>
            <p className="mt-1 truncate text-[10px] text-[#81766D]">Sold by {item.business.name}</p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            disabled={busy || quantityPending}
            aria-label={`Remove ${item.name} from cart`}
            className="flex h-8 w-8 shrink-0 items-center justify-center text-[#91877E] hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-sm font-bold text-[#9F2D18]">{formatNaira(item.unitPrice)}</p>
          {hasDiscount && <p className="text-[11px] text-[#91877E] line-through">{formatNaira(item.originalPrice)}</p>}
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
          <div>
            <div className="inline-flex h-9 items-center border border-[#E5DED6] bg-white">
              <button
                type="button"
                onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                disabled={busy || item.quantity <= 1 || !canReduceQuantity}
                aria-label={`Decrease quantity of ${item.name}`}
                className="flex h-full w-9 items-center justify-center text-[#514840] hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-8 text-center text-xs font-semibold tabular-nums text-[#17202A]" aria-live="polite">{item.quantity}</span>
              <button
                type="button"
                onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                disabled={busy || !item.purchasable || item.quantity >= maxQuantity}
                aria-label={`Increase quantity of ${item.name}`}
                className="flex h-full w-9 items-center justify-center text-[#514840] hover:bg-[#FFF1ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {quantityPending && (
              <span className="mt-1 flex items-center gap-1 text-[9px] text-[#9F2D18]" role="status">
                <LoaderCircle className="h-2.5 w-2.5 animate-spin" /> Saving…
              </span>
            )}
          </div>
          <p className="text-sm font-bold tabular-nums text-[#17202A]">{formatNaira(item.lineTotal)}</p>
        </div>

        {!item.purchasable && (
          <div role="alert" className="mt-2 border border-[#F0D7B3] bg-[#FFF8EC] px-2.5 py-2 text-[10px] leading-4 text-[#796B5C]">
            {item.unavailableReason ?? "This product cannot currently be purchased."}
          </div>
        )}
      </div>
    </article>
  );
}
