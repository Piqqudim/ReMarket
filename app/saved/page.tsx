
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Heart,
  LoaderCircle,
  MapPin,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
  Trash2,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

type ProductItem = {
  savedListingId: string;
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: string;
  imageUrl: string | null;
  category: string | null;
  businessId: string | null;
  businessName: string;
  area: string;
  verified: boolean;
  isAvailable: boolean;
};

type UnknownRecord = Record<string, unknown>;

const EMPTY_PRODUCTS: ProductItem[] = [];

function isRecord(value: unknown): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function stringOrDefault(
  value: unknown,
  fallback: string,
): string {
  return stringOrNull(value) ?? fallback;
}

function numberOrNull(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }

  return value;
}

function formatNaira(value: number): string {
  return `₦${new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function getPriceLabel(product: ProductItem): string {
  if (product.price !== null) {
    return formatNaira(product.price);
  }

  // Legacy price range fallback for older product listings.
  if (
    product.priceMin !== null &&
    product.priceMax !== null
  ) {
    return product.priceMin === product.priceMax
      ? formatNaira(product.priceMin)
      : `${formatNaira(product.priceMin)} – ${formatNaira(product.priceMax)}`;
  }

  if (product.priceMin !== null) {
    return `From ${formatNaira(product.priceMin)}`;
  }

  if (product.priceMax !== null) {
    return `Up to ${formatNaira(product.priceMax)}`;
  }

  return "Ask seller";
}

function getImageUrl(
  value: unknown,
  fallback: unknown,
): string | null {
  const directUrl = stringOrNull(value);

  if (directUrl) {
    return directUrl;
  }

  if (!Array.isArray(fallback)) {
    return null;
  }

  for (const candidate of fallback) {
    if (!isRecord(candidate)) {
      continue;
    }

    const imageUrl = stringOrNull(candidate.url);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

function getAvailabilityLabel(value: string): string {
  switch (value) {
    case "AVAILABLE":
      return "Available";

    case "UNAVAILABLE":
      return "Out of stock";

    default:
      return "Confirm availability";
  }
}

function getAvailabilityClasses(
  availability: string,
  isAvailable: boolean,
): string {
  if (!isAvailable) {
    return "bg-[#F3ECEA] text-[#8B6960]";
  }

  switch (availability) {
    case "AVAILABLE":
      return "bg-[#DDF5EA] text-[#137A59]";

    case "UNAVAILABLE":
      return "bg-[#F3ECEA] text-[#8B6960]";

    default:
      return "bg-[#FFF0D9] text-[#9F2D18]";
  }
}

/* -------------------------------------------------------------------------- */
/* NORMALIZE SAVED PRODUCTS                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The saved API may return both products and services.
 * This page deliberately extracts products only.
 */
function normalizeSavedProducts(data: unknown): ProductItem[] {
  if (
    !isRecord(data) ||
    !Array.isArray(data.savedListings)
  ) {
    return [];
  }

  const products: ProductItem[] = [];

  for (const entry of data.savedListings) {
    if (!isRecord(entry)) {
      continue;
    }

    const savedListingId = stringOrNull(entry.id);

    if (!savedListingId || !isRecord(entry.product)) {
      // Ignore services and invalid saved records.
      continue;
    }

    const product = entry.product;
    const productId = stringOrNull(product.id);

    if (!productId) {
      continue;
    }

    const business = isRecord(product.business)
      ? product.business
      : {};

    const location = isRecord(business.location)
      ? business.location
      : {};

    const category = isRecord(product.category)
      ? product.category
      : {};

    const productStatus = stringOrDefault(
      product.status,
      "",
    );

    const businessStatus = stringOrDefault(
      business.status,
      "ACTIVE",
    );

    const isAvailable =
      productStatus === "ACTIVE" &&
      product.deletedAt == null &&
      businessStatus === "ACTIVE" &&
      business.deletedAt == null;

    products.push({
      savedListingId,
      id: productId,

      name: stringOrDefault(
        product.name,
        "Product",
      ),

      description: stringOrNull(
        product.description,
      ),

      price: numberOrNull(product.price),
      priceMin: numberOrNull(product.priceMin),
      priceMax: numberOrNull(product.priceMax),

      availability: stringOrDefault(
        product.availability,
        "ASK_SELLER",
      ),

      imageUrl: getImageUrl(
        product.imageUrl,
        product.images,
      ),

      category: stringOrNull(category.name),

      businessId: stringOrNull(business.id),

      businessName: stringOrDefault(
        business.name,
        "Local seller",
      ),

      area: stringOrDefault(
        location.area,
        "Location not listed",
      ),

      verified:
        business.verification === "VERIFIED",

      isAvailable,
    });
  }

  return products;
}

/* -------------------------------------------------------------------------- */
/* PRODUCT CARD                                                               */
/* -------------------------------------------------------------------------- */

function ProductCard({
  product,
  deleting,
  onRemove,
}: {
  product: ProductItem;
  deleting: boolean;
  onRemove: (savedListingId: string) => void;
}) {
  const productHref =
    `/product/${encodeURIComponent(product.id)}`;

  const sellerHref = product.businessId
    ? `/seller/${encodeURIComponent(product.businessId)}`
    : null;

  const availabilityLabel = product.isAvailable
    ? getAvailabilityLabel(product.availability)
    : "Listing unavailable";

  const availabilityClasses = getAvailabilityClasses(
    product.availability,
    product.isAvailable,
  );

  return (
    <article
      className="group flex min-w-0 flex-col overflow-hidden
        rounded-xl border border-[#EAE6DF] bg-white
        transition duration-200
        hover:-translate-y-0.5 hover:border-[#FFD0C3]
        hover:shadow-[0_8px_22px_rgba(23,32,42,0.07)]"
    >
      {/* PRODUCT IMAGE */}

      <div
        className="relative aspect-square overflow-hidden
          bg-[#FCFAF6]"
      >
        <Link
          href={productHref}
          aria-label={`View ${product.name}`}
          className="block h-full w-full"
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              className={`h-full w-full object-cover
                transition-transform duration-300
                group-hover:scale-[1.035]
                ${!product.isAvailable ? "opacity-70" : ""}`}
            />
          ) : (
            <div
              className="flex h-full w-full items-center
                justify-center text-[#C3B9AE]"
            >
              <Package className="h-10 w-10" />
            </div>
          )}
        </Link>

        {/* REMOVE FROM SAVED */}

        <button
          type="button"
          onClick={() => onRemove(product.savedListingId)}
          disabled={deleting}
          aria-label={`Remove ${product.name} from saved products`}
          title="Remove from Saved"
          className="absolute right-2 top-2 flex h-9 w-9
            items-center justify-center rounded-full
            border border-[#EAE6DF] bg-white/95
            text-[#FF5A36] shadow-sm transition
            hover:scale-105 hover:bg-[#FFF0E9]
            disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Heart
              className="h-[18px] w-[18px] fill-[#FF5A36]"
              strokeWidth={2}
            />
          )}
        </button>

        {/* AVAILABILITY */}

        <span
          className={`absolute bottom-2 left-2
            max-w-[calc(100%-1rem)] truncate rounded-full
            px-2 py-1 text-[9px] font-bold ${availabilityClasses}`}
        >
          {availabilityLabel}
        </span>
      </div>

      {/* PRODUCT INFORMATION */}

      <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-3">
        <div className="flex min-w-0 items-center justify-between gap-1">
          <p
            className="truncate text-[9px] font-bold uppercase
              tracking-wide text-[#9F2D18]"
          >
            {product.category ?? "Product"}
          </p>

          {product.verified && (
            <span
              className="flex shrink-0 items-center gap-0.5
                text-[8px] font-semibold text-[#137A59]"
              title="Verified seller"
            >
              <CheckCircle2 className="h-3 w-3" />
              Verified
            </span>
          )}
        </div>

        <Link
          href={productHref}
          className="mt-1 line-clamp-2 min-h-9
            text-xs font-semibold leading-[18px]
            text-[#292421] transition
            hover:text-[#9F2D18]"
        >
          {product.name}
        </Link>

        {product.description && (
          <p
            className="mt-1 line-clamp-1 text-[9px]
              leading-4 text-[#958B83]"
          >
            {product.description}
          </p>
        )}

        {/* PRICE */}

        <p className="mt-2 text-sm font-extrabold text-[#9F2D18]">
          {getPriceLabel(product)}
        </p>

        {/* SELLER INFORMATION */}

        <div className="mt-2 flex min-w-0 items-center gap-1.5">
          <Store
            className="h-3 w-3 shrink-0 text-[#958B83]"
            aria-hidden="true"
          />

          <span className="truncate text-[9px] font-medium text-[#756B61]">
            {product.businessName}
          </span>
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <MapPin
            className="h-3 w-3 shrink-0 text-[#FF5A36]"
            aria-hidden="true"
          />

          <span className="truncate text-[9px] text-[#8A8077]">
            {product.area}
          </span>
        </div>

        {/* ACTIONS */}

        <div className="mt-auto border-t border-[#F0ECE7] pt-2.5">
          <Link
            href={productHref}
            className="flex min-h-9 w-full items-center
              justify-center gap-1.5 rounded-lg
              bg-[#FF5A36] px-2 py-2 text-[10px]
              font-bold text-white transition
              hover:bg-[#E94A28]"
          >
            View product
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          {sellerHref && (
            <Link
              href={sellerHref}
              className="mt-1.5 flex min-h-8 w-full
                items-center justify-center rounded-lg
                border border-[#EAE6DF] px-2 py-1.5
                text-[9px] font-semibold text-[#6F675F]
                transition hover:border-[#FFB39F]
                hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
            >
              View seller
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* SAVED PAGE                                                                 */
/* -------------------------------------------------------------------------- */

export default function SavedPage() {
  const [products, setProducts] =
    useState<ProductItem[]>(EMPTY_PRODUCTS);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const requestIdRef = useRef(0);

  /* ---------------------------------------------------------------------- */
  /* LOAD SAVED PRODUCTS                                                    */
  /* ---------------------------------------------------------------------- */

  const loadSavedItems = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++requestIdRef.current;

      setError("");
      setRefreshing(true);

      try {
        const response = await fetch("/api/saved", {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
          signal,
        });

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          if (requestId === requestIdRef.current) {
            setAuthRequired(true);
            setProducts([]);
          }

          return;
        }

        if (!response.ok) {
          const data: unknown = await response
            .json()
            .catch(() => null);

          const message =
            isRecord(data) &&
            typeof data.error === "string"
              ? data.error
              : "Unable to load your saved products.";

          throw new Error(message);
        }

        const data: unknown = await response.json();

        const nextProducts = normalizeSavedProducts(data);

        if (
          signal?.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        setAuthRequired(false);
        setProducts(nextProducts);
      } catch (loadError) {
        if (
          signal?.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        console.error(
          "Saved products loading error:",
          loadError,
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your saved products.",
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  /* ---------------------------------------------------------------------- */
  /* INITIAL LOAD AND AUTOMATIC REFRESH                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const controller = new AbortController();

    void loadSavedItems(controller.signal);

    function refresh() {
      if (!document.hidden) {
        void loadSavedItems();
      }
    }

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);

    document.addEventListener(
      "visibilitychange",
      refresh,
    );

    return () => {
      controller.abort();

      requestIdRef.current += 1;

      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);

      document.removeEventListener(
        "visibilitychange",
        refresh,
      );
    };
  }, [loadSavedItems]);

  /* ---------------------------------------------------------------------- */
  /* REMOVE SAVED PRODUCT                                                   */
  /* ---------------------------------------------------------------------- */

  async function removeSavedItem(savedListingId: string) {
    if (deletingId) {
      return;
    }

    setDeletingId(savedListingId);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/saved/${encodeURIComponent(savedListingId)}`,
        {
          method: "DELETE",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const data: unknown = await response
        .json()
        .catch(() => null);

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        setAuthRequired(true);

        throw new Error(
          "Sign in again to manage your saved products.",
        );
      }

      if (!response.ok) {
        const message =
          isRecord(data) &&
          typeof data.error === "string"
            ? data.error
            : "Unable to remove this product from Saved.";

        throw new Error(message);
      }

      setProducts((current) =>
        current.filter(
          (item) => item.savedListingId !== savedListingId,
        ),
      );

      setNotice("Product removed from Saved.");
    } catch (removeError) {
      console.error(
        "Saved product removal error:",
        removeError,
      );

      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove this product from Saved.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* RETRY                                                                  */
  /* ---------------------------------------------------------------------- */

  function retryLoading() {
    setLoading(true);
    void loadSavedItems();
  }

  /* ---------------------------------------------------------------------- */
  /* PAGE                                                                   */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="min-h-dvh bg-[#FFFDFC] text-[#17202A]">
      {/* SHARED REMARKET HEADER */}

      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh bg-[#FFFDFC] pb-28 lg:pb-8"
      >
        <div
          className="mx-auto w-full max-w-[1600px]
            px-3 py-5 sm:px-5 sm:py-7
            lg:px-7 xl:px-8"
        >
          {/* PAGE HEADING */}

          <section
            className="flex flex-col gap-3
              sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div
                className="inline-flex items-center gap-1.5
                  text-[9px] font-bold uppercase
                  tracking-[0.15em] text-[#9F2D18]"
              >
                <Heart className="h-3.5 w-3.5 fill-[#FF5A36] text-[#FF5A36]" />
                Your collection
              </div>

              <h1
                className="mt-1 text-xl font-extrabold
                  tracking-tight text-[#292421]
                  sm:text-2xl"
              >
                Saved products
              </h1>

              <p
                className="mt-1 max-w-xl text-xs
                  leading-5 text-[#756B61] sm:text-sm"
              >
                Products you have saved to view again or
                consider buying later.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="inline-flex min-h-9 items-center
                  rounded-full border border-[#F1D4C8]
                  bg-[#FFF7ED] px-3 text-[11px]
                  font-bold text-[#9F2D18]"
              >
                {products.length}{" "}
                {products.length === 1 ? "item" : "items"}
              </span>

              <button
                type="button"
                onClick={() => void loadSavedItems()}
                disabled={refreshing || loading}
                className="inline-flex min-h-9
                  items-center gap-1.5 rounded-lg
                  border border-[#EAE6DF] bg-white
                  px-3 text-[10px] font-bold
                  text-[#6F675F] transition
                  hover:bg-[#FFF7ED] hover:text-[#9F2D18]
                  disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />

                Refresh
              </button>
            </div>
          </section>

          {/* SUCCESS MESSAGE */}

          {notice && (
            <div
              role="status"
              className="mt-4 flex items-center gap-2
                rounded-lg border border-[#BDE8D8]
                bg-[#EFFBF6] px-3 py-2.5
                text-xs font-semibold text-[#137A59]"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {notice}
            </div>
          )}

          {/* ERROR MESSAGE */}

          {error && (
            <div
              role="alert"
              className="mt-4 flex flex-wrap
                items-center justify-between gap-3
                rounded-lg border border-[#F1D5D0]
                bg-[#FFF0EE] px-3 py-3
                text-xs font-semibold text-[#9F2D18]"
            >
              <span>{error}</span>

              <button
                type="button"
                onClick={retryLoading}
                className="shrink-0 font-bold underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* LOGIN REQUIRED */}

          {authRequired ? (
            <section
              className="mt-8 flex min-h-[300px]
                flex-col items-center justify-center
                rounded-2xl border border-dashed
                border-[#E4DED6] bg-white px-6 text-center"
            >
              <div
                className="flex h-14 w-14 items-center
                  justify-center rounded-2xl
                  bg-[#FFF0E9] text-[#9F2D18]"
              >
                <Heart className="h-6 w-6" />
              </div>

              <h2 className="mt-4 text-base font-extrabold">
                Sign in to view your saved products
              </h2>

              <p
                className="mt-2 max-w-sm text-xs
                  leading-5 text-[#756B61]"
              >
                Your saved products are linked to your
                ReMarket account.
              </p>

              <Link
                href={`/buyer/login?callbackUrl=${encodeURIComponent("/saved")}`}
                className="mt-5 inline-flex min-h-10
                  items-center gap-2 rounded-lg
                  bg-[#FF5A36] px-5 py-2.5
                  text-xs font-bold text-white
                  transition hover:bg-[#E94A28]"
              >
                Sign in
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </section>
          ) : (
            <>
              {/* LOADING SKELETON */}

              {loading && (
                <div
                  className="mt-6 grid grid-cols-2
                    gap-2.5 sm:grid-cols-3 sm:gap-3
                    md:grid-cols-4 lg:grid-cols-5
                    2xl:grid-cols-6"
                >
                  {Array.from({ length: 12 }).map((_, index) => (
                    <div
                      key={`saved-skeleton-${index}`}
                      className="overflow-hidden rounded-xl
                        border border-[#EAE6DF] bg-white"
                    >
                      <div
                        className="aspect-square animate-pulse
                          bg-[#F2EEE9]"
                      />

                      <div className="space-y-2 p-3">
                        <div className="h-2.5 w-2/5 animate-pulse rounded bg-[#F2EEE9]" />
                        <div className="h-3 w-4/5 animate-pulse rounded bg-[#F2EEE9]" />
                        <div className="h-3 w-2/5 animate-pulse rounded bg-[#F2EEE9]" />
                        <div className="h-8 w-full animate-pulse rounded-lg bg-[#F2EEE9]" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* EMPTY SAVED PRODUCTS */}

              {!loading &&
                !error &&
                products.length === 0 && (
                  <section
                    className="mt-7 flex min-h-[310px]
                      flex-col items-center justify-center
                      rounded-2xl border border-dashed
                      border-[#E4DED6] bg-white px-6 text-center"
                  >
                    <div
                      className="flex h-14 w-14
                        items-center justify-center
                        rounded-2xl bg-[#FFF0E9]
                        text-[#FF5A36]"
                    >
                      <ShoppingBag className="h-6 w-6" />
                    </div>

                    <h2
                      className="mt-4 text-base
                        font-extrabold text-[#292421]"
                    >
                      Your Saved list is empty
                    </h2>

                    <p
                      className="mt-2 max-w-sm text-xs
                        leading-5 text-[#756B61]"
                    >
                      Browse products on ReMarket and tap
                      the heart icon to save items you
                      would like to revisit.
                    </p>

                    <Link
                      href="/shop"
                      className="mt-5 inline-flex min-h-10
                        items-center gap-2 rounded-lg
                        bg-[#FF5A36] px-5 py-2.5
                        text-xs font-bold text-white
                        transition hover:bg-[#E94A28]"
                    >
                      Discover products
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </section>
                )}

              {/* SAVED PRODUCT GRID */}

              {!loading && products.length > 0 && (
                <section
                  className="mt-6"
                  aria-labelledby="saved-products-heading"
                >
                  <div
                    className="mb-3 flex items-center
                      justify-between gap-3"
                  >
                    <h2
                      id="saved-products-heading"
                      className="text-sm font-bold text-[#292421]"
                    >
                      Your saved items
                    </h2>

                    <span className="text-[10px] text-[#8A8077]">
                      {products.length}{" "}
                      {products.length === 1
                        ? "product"
                        : "products"}
                    </span>
                  </div>

                  <div
                    className="grid min-w-0
                      grid-cols-2 gap-2.5
                      sm:grid-cols-3 sm:gap-3
                      md:grid-cols-4
                      lg:grid-cols-5
                      2xl:grid-cols-6"
                  >
                    {products.map((product) => (
                      <ProductCard
                        key={product.savedListingId}
                        product={product}
                        deleting={
                          deletingId === product.savedListingId
                        }
                        onRemove={(id) =>
                          void removeSavedItem(id)
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* DISCOVER MORE */}

              <section
                className="mt-8 flex flex-col gap-3
                  rounded-xl border border-[#EAE6DF]
                  bg-white p-4 sm:flex-row
                  sm:items-center sm:justify-between"
              >
                <div>
                  <h2 className="text-sm font-extrabold text-[#292421]">
                    Looking for something else?
                  </h2>

                  <p
                    className="mt-1 text-[10px]
                      leading-4 text-[#756B61] sm:text-xs"
                  >
                    Explore more products from businesses around you.
                  </p>
                </div>

                <Link
                  href="/shop"
                  className="inline-flex min-h-9
                    shrink-0 items-center justify-center
                    gap-2 rounded-lg bg-[#FFF0E9]
                    px-4 py-2 text-[10px]
                    font-bold text-[#9F2D18]
                    transition hover:bg-[#FFE0D6]"
                >
                  Browse products
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </section>
            </>
          )}
        </div>
      </main>

      {/* SHARED MOBILE NAVIGATION */}

      <MobileBottomNav />
    </div>
  );
}
