"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Heart,
  LoaderCircle,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Wrench,
} from "lucide-react";

type SavedTab = "products" | "services";

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
  isAvailable: boolean;
};

type ServiceItem = {
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
  durationMinutes: number | null;
  fulfillmentType: string;
  businessId: string | null;
  businessName: string;
  area: string;
  isAvailable: boolean;
};

type SavedCollections = {
  products: ProductItem[];
  services: ServiceItem[];
};

const EMPTY_COLLECTIONS: SavedCollections = {
  products: [],
  services: [],
};

type UnknownRecord = Record<string, unknown>;

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

  return value.trim().length > 0 ? value : null;
}

function stringOrDefault(
  value: unknown,
  fallback: string,
): string {
  return stringOrNull(value) ?? fallback;
}

function numberOrNull(value: unknown): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function formatNaira(value: number): string {
  return `₦${new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function getPriceLabel(item: {
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
}): string {
  if (item.price !== null) {
    return formatNaira(item.price);
  }

  if (
    item.priceMin !== null &&
    item.priceMax !== null
  ) {
    return item.priceMin === item.priceMax
      ? formatNaira(item.priceMin)
      : `${formatNaira(item.priceMin)} – ${formatNaira(item.priceMax)}`;
  }

  if (item.priceMin !== null) {
    return `From ${formatNaira(item.priceMin)}`;
  }

  if (item.priceMax !== null) {
    return `Up to ${formatNaira(item.priceMax)}`;
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

  for (const candidate of fallback as unknown[]) {
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
  if (value === "AVAILABLE") {
    return "Available";
  }

  if (value === "UNAVAILABLE") {
    return "Unavailable";
  }

  return "Ask seller";
}

function getAvailabilityClasses(value: string): string {
  if (value === "AVAILABLE") {
    return "bg-[#DDF5EA] text-[#137A59]";
  }

  if (value === "UNAVAILABLE") {
    return "bg-[#F3ECEA] text-[#8B6960]";
  }

  return "bg-[#FFF0D9] text-[#9F2D18]";
}

function getDurationLabel(
  value: number | null,
): string | null {
  if (value === null || value <= 0) {
    return null;
  }

  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return minutes
    ? `${hours} hr ${minutes} min`
    : `${hours} hr`;
}

function getFulfillmentLabel(value: string): string {
  switch (value) {
    case "AT_PROVIDER":
      return "At seller's location";

    case "AT_CUSTOMER":
      return "At your location";

    case "REMOTE":
      return "Remote service";

    default:
      return "Flexible location";
  }
}

/**
 * Converts the API response into strongly typed collections.
 *
 * Every value received from the API is checked before it is
 * assigned to a ProductItem or ServiceItem field.
 */
function normalizeSavedCollections(
  data: unknown,
): SavedCollections {
  if (
    !isRecord(data) ||
    !Array.isArray(data.savedListings)
  ) {
    return EMPTY_COLLECTIONS;
  }

  const products: ProductItem[] = [];
  const services: ServiceItem[] = [];

  const savedListings: unknown[] = data.savedListings;

  for (const entry of savedListings) {
    if (!isRecord(entry)) {
      continue;
    }

    const savedListingId = stringOrNull(entry.id);

    if (!savedListingId) {
      continue;
    }

    // -----------------------------------------------------
    // SAVED PRODUCTS
    // -----------------------------------------------------

    if (isRecord(entry.product)) {
      const product: UnknownRecord = entry.product;

      // Validate the product ID independently.
      const productId = stringOrNull(product.id);

      if (productId) {
        const business: UnknownRecord = isRecord(
          product.business,
        )
          ? product.business
          : {};

        const location: UnknownRecord = isRecord(
          business.location,
        )
          ? business.location
          : {};

        const category: UnknownRecord = isRecord(
          product.category,
        )
          ? product.category
          : {};

        const businessStatus = stringOrDefault(
          business.status,
          "ACTIVE",
        );

        const productStatus = stringOrDefault(
          product.status,
          "",
        );

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

          isAvailable:
            productStatus === "ACTIVE" &&
            product.deletedAt == null &&
            businessStatus === "ACTIVE" &&
            business.deletedAt == null,
        });

        continue;
      }
    }

    // -----------------------------------------------------
    // SAVED SERVICES
    // -----------------------------------------------------

    if (isRecord(entry.service)) {
      const service: UnknownRecord = entry.service;

      // Validate the service ID independently.
      const serviceId = stringOrNull(service.id);

      if (!serviceId) {
        continue;
      }

      const business: UnknownRecord = isRecord(
        service.business,
      )
        ? service.business
        : {};

      const location: UnknownRecord = isRecord(
        business.location,
      )
        ? business.location
        : {};

      const category: UnknownRecord = isRecord(
        service.category,
      )
        ? service.category
        : {};

      const businessStatus = stringOrDefault(
        business.status,
        "ACTIVE",
      );

      const serviceStatus = stringOrDefault(
        service.status,
        "",
      );

      services.push({
        savedListingId,
        id: serviceId,

        name: stringOrDefault(
          service.name,
          "Service",
        ),

        description: stringOrNull(
          service.description,
        ),

        price: numberOrNull(service.price),
        priceMin: numberOrNull(service.priceMin),
        priceMax: numberOrNull(service.priceMax),

        availability: stringOrDefault(
          service.availability,
          "ASK_SELLER",
        ),

        imageUrl: getImageUrl(
          service.imageUrl,
          service.images,
        ),

        category: stringOrNull(category.name),

        durationMinutes: numberOrNull(
          service.durationMinutes,
        ),

        fulfillmentType: stringOrDefault(
          service.fulfillmentType,
          "FLEXIBLE",
        ),

        businessId: stringOrNull(business.id),

        businessName: stringOrDefault(
          business.name,
          "Local service provider",
        ),

        area: stringOrDefault(
          location.area,
          "Location not listed",
        ),

        isAvailable:
          serviceStatus === "ACTIVE" &&
          service.deletedAt == null &&
          businessStatus === "ACTIVE" &&
          business.deletedAt == null,
      });
    }
  }

  return {
    products,
    services,
  };
}

function getSellerHref(
  businessId: string | null,
): string | null {
  if (!businessId) {
    return null;
  }

  return `/seller/${encodeURIComponent(businessId)}`;
}

export default function SavedPage() {
  const [collections, setCollections] =
    useState<SavedCollections>(EMPTY_COLLECTIONS);

  const [activeTab, setActiveTab] =
    useState<SavedTab>("products");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [authRequired, setAuthRequired] =
    useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [deletingId, setDeletingId] =
    useState<string | null>(null);

  const requestIdRef = useRef(0);
  const tabSelectedByUserRef = useRef(false);

  // -------------------------------------------------------
  // LOAD SAVED PRODUCTS AND SERVICES
  // -------------------------------------------------------

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
            setCollections(EMPTY_COLLECTIONS);
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
              : "Unable to load your saved items.";

          throw new Error(message);
        }

        const data: unknown = await response.json();

        const next = normalizeSavedCollections(data);

        if (
          signal?.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        setAuthRequired(false);
        setCollections(next);

        if (!tabSelectedByUserRef.current) {
          setActiveTab(
            next.products.length > 0 ||
              next.services.length === 0
              ? "products"
              : "services",
          );
        }
      } catch (loadError) {
        if (
          signal?.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        console.error(
          "Saved items loading error:",
          loadError,
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your saved items.",
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

  // -------------------------------------------------------
  // INITIAL LOAD AND AUTOMATIC REFRESH
  // -------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    void loadSavedItems(controller.signal);

    const refresh = () => {
      if (!document.hidden) {
        void loadSavedItems();
      }
    };

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

  // -------------------------------------------------------
  // TAB SELECTION
  // -------------------------------------------------------

  function selectTab(tab: SavedTab) {
    tabSelectedByUserRef.current = true;

    setActiveTab(tab);
    setNotice("");
  }

  // -------------------------------------------------------
  // REMOVE SAVED ITEM
  // -------------------------------------------------------

  async function removeSavedItem(
    savedListingId: string,
    type: SavedTab,
  ) {
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
          "Sign in again to manage your saved items.",
        );
      }

      if (!response.ok) {
        const message =
          isRecord(data) &&
          typeof data.error === "string"
            ? data.error
            : "Unable to remove this saved item.";

        throw new Error(message);
      }

      setCollections((current) => ({
        products:
          type === "products"
            ? current.products.filter(
                (item) =>
                  item.savedListingId !== savedListingId,
              )
            : current.products,

        services:
          type === "services"
            ? current.services.filter(
                (item) =>
                  item.savedListingId !== savedListingId,
              )
            : current.services,
      }));

      setNotice(
        type === "products"
          ? "Product removed from Saved."
          : "Service removed from Saved.",
      );
    } catch (removeError) {
      console.error(
        "Saved item removal error:",
        removeError,
      );

      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove this saved item.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  // -------------------------------------------------------
  // COLLECTION COUNTS
  // -------------------------------------------------------

  const productCount = collections.products.length;
  const serviceCount = collections.services.length;

  const totalCount = productCount + serviceCount;

  const activeItems =
    activeTab === "products"
      ? collections.products
      : collections.services;

  // -------------------------------------------------------
  // PAGE
  // -------------------------------------------------------

  return (
    <div className="min-h-dvh bg-[#FFF7ED] text-[#17202A]">

      {/* HEADER */}

      <header className="sticky top-0 z-30 border-b border-[#EAE6DF] bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[68px] w-full max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">

          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="ReMarket home"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
              <Store
                className="h-5 w-5"
                strokeWidth={2.5}
              />
            </span>

            <span>
              <span className="block text-[18px] font-extrabold tracking-tight">
                ReMarket
              </span>

              <span className="-mt-1 block text-[10px] font-medium text-[#8A8178]">
                Find it nearby
              </span>
            </span>
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-5 text-sm font-semibold text-[#6F675F] md:flex"
          >
            <Link
              href="/"
              className="transition hover:text-[#9F2D18]"
            >
              Home
            </Link>

            <Link
              href="/shop"
              className="transition hover:text-[#9F2D18]"
            >
              Shop
            </Link>

            <Link
              href="/services"
              className="transition hover:text-[#9F2D18]"
            >
              Services
            </Link>

            <Link
              href="/my-requests"
              className="transition hover:text-[#9F2D18]"
            >
              Requests
            </Link>

            <span
              aria-current="page"
              className="font-extrabold text-[#FF5A36]"
            >
              Saved
            </span>
          </nav>

          <div className="flex shrink-0 items-center gap-2">

            <Link
              href="/account"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 text-xs font-bold text-[#6F675F] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
            >
              <Heart className="h-4 w-4 text-[#FF5A36]" />

              <span className="hidden sm:inline">
                Account
              </span>
            </Link>

            <Link
              href="/shop"
              aria-label="Browse products"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0D9] text-[#9F2D18] transition hover:bg-[#FFE0D6]"
            >
              <Search className="h-4 w-4" />
            </Link>

          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}

      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">

        {/* PAGE INTRODUCTION */}

        <section className="overflow-hidden rounded-[26px] border border-[#F0DDD4] bg-gradient-to-r from-[#FFF0E9] via-[#FFF7ED] to-[#FCFAF6] p-5 sm:p-7">

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">

            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-[#FF5A36]">
                Your collection
              </p>

              <h1 className="mt-1 text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl">
                Saved items
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#756B61]">
                Keep products you are interested in and
                services you may want to book in one place.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">

              <span className="rounded-full border border-white/80 bg-white/80 px-3 py-2 text-xs font-bold text-[#9F2D18]">
                {totalCount}{" "}
                {totalCount === 1
                  ? "saved item"
                  : "saved items"}
              </span>

              <button
                type="button"
                onClick={() => void loadSavedItems()}
                disabled={refreshing || loading}
                className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] transition hover:text-[#9F2D18] disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />

                Refresh
              </button>

            </div>
          </div>
        </section>

        {/* SUCCESS MESSAGE */}

        {notice && (
          <p
            role="status"
            className="mt-4 flex items-center gap-2 rounded-xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-3 text-xs font-semibold text-[#137A59]"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </p>
        )}

        {/* ERROR MESSAGE */}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#F1D5D0] bg-[#FFF0EE] px-4 py-3 text-xs font-semibold text-[#C5402D]"
          >
            {error}
          </div>
        )}

        {/* AUTHENTICATION REQUIRED */}

        {authRequired ? (
          <section className="mt-6 flex min-h-[320px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#E4DED6] bg-white px-6 text-center">

            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#9F2D18]">
              <Heart className="h-7 w-7" />
            </div>

            <h2 className="mt-5 text-lg font-extrabold">
              Sign in to view your saved items
            </h2>

            <p className="mt-2 max-w-sm text-sm leading-6 text-[#756B61]">
              Your saved products and services are linked
              to your ReMarket account.
            </p>

            <Link
              href={`/buyer/login?callbackUrl=${encodeURIComponent("/saved")}`}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#E94A28]"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>

          </section>
        ) : (
          <>

            {/* PRODUCT AND SERVICE TABS */}

            <div
              role="tablist"
              aria-label="Saved item types"
              className="mt-6 flex w-full gap-2 border-b border-[#EAE6DF] pb-2"
            >

              <button
                id="saved-products-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === "products"}
                aria-controls="saved-products-panel"
                onClick={() => selectTab("products")}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                  activeTab === "products"
                    ? "bg-[#FFE0D6] text-[#9F2D18]"
                    : "text-[#756B61] hover:bg-white hover:text-[#9F2D18]"
                }`}
              >
                <Package className="h-4 w-4" />

                Products

                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px]">
                  {productCount}
                </span>
              </button>

              <button
                id="saved-services-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === "services"}
                aria-controls="saved-services-panel"
                onClick={() => selectTab("services")}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                  activeTab === "services"
                    ? "bg-[#FFE0D6] text-[#9F2D18]"
                    : "text-[#756B61] hover:bg-white hover:text-[#9F2D18]"
                }`}
              >
                <Wrench className="h-4 w-4" />

                Services

                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px]">
                  {serviceCount}
                </span>
              </button>

            </div>

            {/* LOADING STATE */}

            {loading ? (
              <div className="mt-8 flex min-h-[240px] items-center justify-center rounded-2xl border border-[#EAE6DF] bg-white">

                <div className="flex items-center gap-2 text-sm font-semibold text-[#756B61]">
                  <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />

                  Loading your saved items...
                </div>

              </div>
            ) : activeItems.length === 0 ? (

              /* EMPTY STATE */

              <section className="mt-7 flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[#E4DED6] bg-white px-6 text-center">

                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#FF5A36]">
                  {activeTab === "products" ? (
                    <Package className="h-7 w-7" />
                  ) : (
                    <Wrench className="h-7 w-7" />
                  )}
                </div>

                <h2 className="mt-5 text-lg font-extrabold text-[#17202A]">
                  {activeTab === "products"
                    ? "No saved products yet"
                    : "No saved services yet"}
                </h2>

                <p className="mt-2 max-w-sm text-sm leading-6 text-[#756B61]">
                  {activeTab === "products"
                    ? "Save products from Shop to keep them here for later."
                    : "Save services from the Services page to keep them here for later."}
                </p>

                <Link
                  href={
                    activeTab === "products"
                      ? "/shop"
                      : "/services"
                  }
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#E94A28]"
                >
                  {activeTab === "products"
                    ? "Explore products"
                    : "Explore services"}

                  <ChevronRight className="h-4 w-4" />
                </Link>

              </section>

            ) : activeTab === "products" ? (

              /* SAVED PRODUCTS */

              <div
                id="saved-products-panel"
                role="tabpanel"
                aria-labelledby="saved-products-tab"
                className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              >
                {collections.products.map((product) => {
                  const sellerHref = getSellerHref(
                    product.businessId,
                  );

                  return (
                    <article
                      key={product.savedListingId}
                      className="group flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:border-[#FFD0C3] hover:shadow-[0_12px_28px_rgba(23,32,42,0.07)]"
                    >

                      {/* PRODUCT IMAGE */}

                      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#FCFAF6]">

                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <Package className="h-10 w-10 text-[#D1C5B9]" />
                        )}

                        {/* REMOVE BUTTON */}

                        <button
                          type="button"
                          onClick={() =>
                            void removeSavedItem(
                              product.savedListingId,
                              "products",
                            )
                          }
                          disabled={
                            deletingId ===
                            product.savedListingId
                          }
                          aria-label={`Remove ${product.name} from Saved`}
                          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-[#9F2D18] shadow-sm transition hover:bg-[#FFF0D9] disabled:opacity-50"
                        >
                          {deletingId ===
                          product.savedListingId ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>

                        {!product.isAvailable && (
                          <span className="absolute bottom-3 left-3 rounded-full bg-[#FFF0EE] px-2.5 py-1 text-[10px] font-bold text-[#C5402D]">
                            No longer available
                          </span>
                        )}

                      </div>

                      {/* PRODUCT DETAILS */}

                      <div className="flex flex-1 flex-col p-4">

                        <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#9F2D18]">
                          {product.category || "Product"}
                        </p>

                        <h2 className="mt-1 line-clamp-2 min-h-10 text-sm font-extrabold text-[#17202A]">
                          {product.name}
                        </h2>

                        <p className="mt-2 text-base font-black text-[#9F2D18]">
                          {getPriceLabel(product)}
                        </p>

                        <span
                          className={`mt-2 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${getAvailabilityClasses(
                            product.availability,
                          )}`}
                        >
                          {getAvailabilityLabel(
                            product.availability,
                          )}
                        </span>

                        <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-[#756B61]">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#FF5A36]" />

                          {product.area}
                        </p>

                        {/* SELLER AND PRODUCT LINKS */}

                        <div className="mt-auto border-t border-[#F0ECE7] pt-4">

                          <p className="truncate text-xs font-semibold text-[#514840]">
                            {product.businessName}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">

                            {product.isAvailable && (
                              <Link
                                href={`/product/${encodeURIComponent(product.id)}`}
                                className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-[#FFF0E9] px-3 py-2 text-[11px] font-bold text-[#9F2D18] transition hover:bg-[#FFE0D6]"
                              >
                                View product

                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            )}

                            {sellerHref ? (
                              <Link
                                href={sellerHref}
                                className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-xl border border-[#EAE6DF] px-3 py-2 text-[11px] font-bold text-[#6F675F] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
                              >
                                View seller

                                <ChevronRight className="h-3.5 w-3.5" />
                              </Link>
                            ) : (
                              <span className="flex-1 py-2 text-center text-[10px] text-[#A39A91]">
                                Seller profile unavailable
                              </span>
                            )}

                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

            ) : (

              /* SAVED SERVICES */

              <div
                id="saved-services-panel"
                role="tabpanel"
                aria-labelledby="saved-services-tab"
                className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              >
                {collections.services.map((service) => {
                  const sellerHref = getSellerHref(
                    service.businessId,
                  );

                  const duration = getDurationLabel(
                    service.durationMinutes,
                  );

                  return (
                    <article
                      key={service.savedListingId}
                      className="group flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:border-[#FFD0C3] hover:shadow-[0_12px_28px_rgba(23,32,42,0.07)]"
                    >

                      {/* SERVICE IMAGE */}

                      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#FCFAF6]">

                        {service.imageUrl ? (
                          <img
                            src={service.imageUrl}
                            alt={service.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <Wrench className="h-10 w-10 text-[#D1C5B9]" />
                        )}

                        {/* REMOVE BUTTON */}

                        <button
                          type="button"
                          onClick={() =>
                            void removeSavedItem(
                              service.savedListingId,
                              "services",
                            )
                          }
                          disabled={
                            deletingId ===
                            service.savedListingId
                          }
                          aria-label={`Remove ${service.name} from Saved`}
                          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-[#9F2D18] shadow-sm transition hover:bg-[#FFF0D9] disabled:opacity-50"
                        >
                          {deletingId ===
                          service.savedListingId ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>

                        {!service.isAvailable && (
                          <span className="absolute bottom-3 left-3 rounded-full bg-[#FFF0EE] px-2.5 py-1 text-[10px] font-bold text-[#C5402D]">
                            No longer available
                          </span>
                        )}

                      </div>

                      {/* SERVICE DETAILS */}

                      <div className="flex flex-1 flex-col p-4">

                        <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#9F2D18]">
                          {service.category || "Service"}
                        </p>

                        <h2 className="mt-1 line-clamp-2 min-h-10 text-sm font-extrabold text-[#17202A]">
                          {service.name}
                        </h2>

                        <p className="mt-2 text-base font-black text-[#9F2D18]">
                          {getPriceLabel(service)}
                        </p>

                        <span
                          className={`mt-2 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[10px] font-bold ${getAvailabilityClasses(
                            service.availability,
                          )}`}
                        >
                          {getAvailabilityLabel(
                            service.availability,
                          )}
                        </span>

                        {/* SERVICE INFORMATION */}

                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-[#756B61]">

                          {duration && (
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3.5 w-3.5" />
                              {duration}
                            </span>
                          )}

                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3.5 w-3.5" />

                            {getFulfillmentLabel(
                              service.fulfillmentType,
                            )}
                          </span>

                        </div>

                        <p className="mt-3 flex items-center gap-1.5 truncate text-xs text-[#756B61]">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#FF5A36]" />

                          {service.area}
                        </p>

                        {/* SELLER AND SERVICE LINKS */}

                        <div className="mt-auto border-t border-[#F0ECE7] pt-4">

                          <p className="truncate text-xs font-semibold text-[#514840]">
                            {service.businessName}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">

                            {service.isAvailable && (
                              <Link
                                href={`/service/${encodeURIComponent(service.id)}`}
                                className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-[#FFF0E9] px-3 py-2 text-[11px] font-bold text-[#9F2D18] transition hover:bg-[#FFE0D6]"
                              >
                                View service

                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            )}

                            {sellerHref ? (
                              <Link
                                href={sellerHref}
                                className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-xl border border-[#EAE6DF] px-3 py-2 text-[11px] font-bold text-[#6F675F] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
                              >
                                View seller

                                <ChevronRight className="h-3.5 w-3.5" />
                              </Link>
                            ) : (
                              <span className="flex-1 py-2 text-center text-[10px] text-[#A39A91]">
                                Seller profile unavailable
                              </span>
                            )}

                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

          </>
        )}

        {/* DISCOVER MORE */}

        <section className="mt-8 flex flex-col gap-3 rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">

          <div>
            <h2 className="text-sm font-extrabold text-[#17202A]">
              Want to discover more?
            </h2>

            <p className="mt-1 text-xs leading-5 text-[#756B61]">
              Browse products or services from sellers around you.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">

            <Link
              href="/shop"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28]"
            >
              Browse products

              <Package className="h-4 w-4" />
            </Link>

            <Link
              href="/services"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] px-4 py-2.5 text-xs font-bold text-[#6F675F] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
            >
              Browse services

              <Wrench className="h-4 w-4" />
            </Link>

          </div>
        </section>

      </main>
    </div>
  );
}