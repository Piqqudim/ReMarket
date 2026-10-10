"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  Suspense,
  type FormEvent,
} from "react";

import {
  Search,
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  UserCircle,
  Store,
  MapPin,
  ArrowRight,
  SlidersHorizontal,
  X,
  ChevronDown,
  Check,
  Package,
  Bookmark,
  MoreHorizontal,
} from "lucide-react";

import Link from "next/link";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ReMarketCategory,
} from "@/lib/categories";

import {
  getSavedBusinesses,
  isBusinessSaved,
  saveBusiness,
  removeSavedBusiness,
  SAVED_BUSINESSES_CHANGED_EVENT,
} from "@/lib/saved";

type Category = ReMarketCategory;

type ProductImage = {
  id: string;
  url: string;
  publicId?: string | null;
  sortOrder: number;
};

type Product = {
  id: string;
  name: string;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  imageUrl: string | null;
  images?: ProductImage[];
};

type Business = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;

  location: {
    area?: string | null;
    address?: string | null;
  } | null;

  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";

  verification:
    | "VERIFIED"
    | "UNVERIFIED";

  categories: {
    category: {
      id: string;
      name: string;
    };
  }[];

  products: Product[];

  socialLinks: {
    platform: string;
    handle: string;
  }[];

  matchScore?: number;
};

type SearchFilterValues = {
  query: string;
  category: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  availability: string;
  verified: boolean;
};

const NAV_ITEMS = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Shop",
    href: "/shop",
    icon: ShoppingBag,
  },
  {
    label: "Requests",
    href: "/my-requests",
    icon: ClipboardList,
  },
  {
    label: "Saved",
    href: "/saved",
    icon: Heart,
  },
];

function formatPrice(product: Product): string {
  if (product.price !== null) {
    return `₦${product.price.toLocaleString()}`;
  }

  if (
    product.priceMin !== null &&
    product.priceMax !== null
  ) {
    return `₦${product.priceMin.toLocaleString()} - ₦${product.priceMax.toLocaleString()}`;
  }

  if (product.priceMin !== null) {
    return `From ₦${product.priceMin.toLocaleString()}`;
  }

  if (product.priceMax !== null) {
    return `Up to ₦${product.priceMax.toLocaleString()}`;
  }

  return "Ask seller";
}

function getProductImage(
  product: Product
): string | null {
  return (
    product.images?.[0]?.url ??
    product.imageUrl ??
    null
  );
}

/*
 * -----------------------------------------
 * SEARCH PARAMETER HELPERS
 * -----------------------------------------
 *
 * Keep search parameters consistent across:
 * - Search submission
 * - Applying filters
 * - Clearing filters
 * - Removing individual filter chips
 * - Selecting a category in the sidebar
 */

function buildSearchParams(
  values: SearchFilterValues
): URLSearchParams {
  const params = new URLSearchParams();

  if (values.query.trim()) {
    params.set(
      "q",
      values.query.trim()
    );
  }

  if (values.category.trim()) {
    params.set(
      "category",
      values.category.trim()
    );
  }

  if (values.location.trim()) {
    params.set(
      "location",
      values.location.trim()
    );
  }

  if (values.minPrice.trim()) {
    params.set(
      "minPrice",
      values.minPrice.trim()
    );
  }

  if (values.maxPrice.trim()) {
    params.set(
      "maxPrice",
      values.maxPrice.trim()
    );
  }

  if (values.availability) {
    params.set(
      "availability",
      values.availability
    );
  }

  if (values.verified) {
    params.set(
      "verified",
      "true"
    );
  }

  return params;
}

/*
 * -----------------------------------------
 * SAVED BUSINESSES EXTERNAL STORE
 * -----------------------------------------
 */

function subscribeToSavedBusinesses(
  callback: () => void
) {
  window.addEventListener(
    SAVED_BUSINESSES_CHANGED_EVENT,
    callback
  );

  window.addEventListener(
    "storage",
    callback
  );

  return () => {
    window.removeEventListener(
      SAVED_BUSINESSES_CHANGED_EVENT,
      callback
    );

    window.removeEventListener(
      "storage",
      callback
    );
  };
}

function getSavedBusinessesSnapshot(): string {
  const saved = getSavedBusinesses();

  return JSON.stringify(
    saved
      .map((business) => business.id)
      .sort()
  );
}

function getSavedBusinessesServerSnapshot(): string {
  return "[]";
}

type SearchPageViewProps = {
  initialQuery: string;
  initialCategory: string;
  initialLocation: string;
  initialMinPrice: string;
  initialMaxPrice: string;
  initialAvailability: string;
  initialVerified: boolean;
};

/*
 * -----------------------------------------
 * SEARCH PAGE URL STATE
 * -----------------------------------------
 *
 * Remount the view whenever the URL changes.
 * The URL remains the source of truth for
 * applied search parameters.
 */

function SearchPageContent() {
  const searchParams = useSearchParams();

  const initialQuery =
    searchParams.get("q") ?? "";

  const initialCategory =
    searchParams.get("category") ?? "";

  const initialLocation =
    searchParams.get("location") ?? "";

  const initialMinPrice =
    searchParams.get("minPrice") ?? "";

  const initialMaxPrice =
    searchParams.get("maxPrice") ?? "";

  const initialAvailability =
    searchParams.get("availability") ?? "";

  const initialVerified =
    searchParams.get("verified") === "true";

  const searchKey = searchParams.toString();

  return (
    <SearchPageView
      key={searchKey}
      initialQuery={initialQuery}
      initialCategory={initialCategory}
      initialLocation={initialLocation}
      initialMinPrice={initialMinPrice}
      initialMaxPrice={initialMaxPrice}
      initialAvailability={initialAvailability}
      initialVerified={initialVerified}
    />
  );
}

/*
 * -----------------------------------------
 * SEARCH PAGE VIEW
 * -----------------------------------------
 */

function SearchPageView({
  initialQuery,
  initialCategory,
  initialLocation,
  initialMinPrice,
  initialMaxPrice,
  initialAvailability,
  initialVerified,
}: SearchPageViewProps) {
  const router = useRouter();

  /*
   * These values represent the editable form
   * state. They become applied when the user
   * submits a search or applies filters.
   */

  const [query, setQuery] = useState(
    initialQuery
  );

  const [category, setCategory] = useState(
    initialCategory
  );

  const [location, setLocation] = useState(
    initialLocation
  );

  const [minPrice, setMinPrice] = useState(
    initialMinPrice
  );

  const [maxPrice, setMaxPrice] = useState(
    initialMaxPrice
  );

  const [availability, setAvailability] = useState(
    initialAvailability
  );

  const [verified, setVerified] = useState(
    initialVerified
  );

  const [categories, setCategories] = useState<
    Category[]
  >(DEFAULT_CATEGORIES);

  const [businesses, setBusinesses] = useState<
    Business[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [showFilters, setShowFilters] = useState(
    false
  );

  /*
   * -----------------------------------------
   * APPLIED FILTERS
   * -----------------------------------------
   *
   * These values always come from the URL.
   * Draft changes in the filter drawer do not
   * change the visible chips until applied.
   */

  const appliedFilters: SearchFilterValues = {
    query: initialQuery,
    category: initialCategory,
    location: initialLocation,
    minPrice: initialMinPrice,
    maxPrice: initialMaxPrice,
    availability: initialAvailability,
    verified: initialVerified,
  };

  const savedSnapshot = useSyncExternalStore(
    subscribeToSavedBusinesses,
    getSavedBusinessesSnapshot,
    getSavedBusinessesServerSnapshot
  );

  const savedBusinessIds = useMemo(() => {
    try {
      const ids = JSON.parse(savedSnapshot);

      if (!Array.isArray(ids)) {
        return new Set<string>();
      }

      return new Set<string>(
        ids.filter(
          (value): value is string =>
            typeof value === "string"
        )
      );
    } catch {
      return new Set<string>();
    }
  }, [savedSnapshot]);

  /*
   * -----------------------------------------
   * NAVIGATE TO SEARCH
   * -----------------------------------------
   */

  function navigateToSearch(
    values: SearchFilterValues
  ) {
    const params = buildSearchParams(values);

    const queryString = params.toString();

    router.push(
      queryString
        ? `/search?${queryString}`
        : "/search"
    );
  }

  /*
   * Apply a single change using the currently
   * applied URL values, not any unsaved changes
   * that may still exist in the filter drawer.
   */

  function applyAppliedFilterChanges(
    overrides: Partial<SearchFilterValues>
  ) {
    navigateToSearch({
      ...appliedFilters,
      ...overrides,
    });
  }

  /*
   * -----------------------------------------
   * LOAD CATEGORIES
   * -----------------------------------------
   *
   * Backend categories remain authoritative.
   * DEFAULT_CATEGORIES is the fallback.
   */

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const response = await fetch(
          "/api/categories",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (
          !cancelled &&
          Array.isArray(data.categories)
        ) {
          setCategories(
            mergeCategories(data.categories)
          );
        }
      } catch (categoryError) {
        console.error(
          "Failed to load categories:",
          categoryError
        );
      }
    }

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * -----------------------------------------
   * LOAD SEARCH RESULTS
   * -----------------------------------------
   *
   * Results are driven by URL parameters.
   * Changing draft filter values does not
   * trigger a search until those values are
   * applied through the URL.
   */

  useEffect(() => {
    const controller = new AbortController();

    async function loadSearchResults() {
      setLoading(true);
      setError("");

      try {
        const params = buildSearchParams({
          query: initialQuery,
          category: initialCategory,
          location: initialLocation,
          minPrice: initialMinPrice,
          maxPrice: initialMaxPrice,
          availability: initialAvailability,
          verified: initialVerified,
        });

        const response = await fetch(
          `/api/search?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Unable to complete search."
          );
        }

        if (controller.signal.aborted) {
          return;
        }

        setBusinesses(
          Array.isArray(data.businesses)
            ? data.businesses
            : []
        );
      } catch (searchError) {
        if (
          searchError instanceof DOMException &&
          searchError.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Search loading error:",
          searchError
        );

        setBusinesses([]);

        setError(
          "We couldn't complete your search right now."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadSearchResults();

    return () => {
      controller.abort();
    };
  }, [
    initialQuery,
    initialCategory,
    initialLocation,
    initialMinPrice,
    initialMaxPrice,
    initialAvailability,
    initialVerified,
  ]);

  /*
   * -----------------------------------------
   * SUBMIT SEARCH
   * -----------------------------------------
   */

  function submitSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    navigateToSearch({
      query,
      category,
      location,
      minPrice,
      maxPrice,
      availability,
      verified,
    });
  }

  /*
   * -----------------------------------------
   * APPLY FILTERS
   * -----------------------------------------
   */

  function applyFilters() {
    navigateToSearch({
      query,
      category,
      location,
      minPrice,
      maxPrice,
      availability,
      verified,
    });

    setShowFilters(false);
  }

  /*
   * -----------------------------------------
   * CLOSE FILTERS WITHOUT APPLYING
   * -----------------------------------------
   *
   * Discard pending filter edits and restore
   * the values represented by the current URL.
   */

  function closeFilters() {
    setCategory(initialCategory);
    setLocation(initialLocation);
    setMinPrice(initialMinPrice);
    setMaxPrice(initialMaxPrice);
    setAvailability(initialAvailability);
    setVerified(initialVerified);

    setShowFilters(false);
  }

  /*
   * -----------------------------------------
   * CLEAR FILTERS
   * -----------------------------------------
   *
   * Preserve the already-applied search query
   * while removing every applied filter.
   */

  function clearFilters() {
    setQuery(initialQuery);
    setCategory("");
    setLocation("");
    setMinPrice("");
    setMaxPrice("");
    setAvailability("");
    setVerified(false);

    navigateToSearch({
      query: initialQuery,
      category: "",
      location: "",
      minPrice: "",
      maxPrice: "",
      availability: "",
      verified: false,
    });

    setShowFilters(false);
  }

  /*
   * -----------------------------------------
   * SAVE / UNSAVE BUSINESS
   * -----------------------------------------
   */

  function toggleSaved(business: Business) {
    if (isBusinessSaved(business.id)) {
      removeSavedBusiness(business.id);
      return;
    }

    const categoryName =
      business.categories?.[0]?.category?.name ??
      "Services";

    saveBusiness({
      id: business.id,
      name: business.name,
      area: business.location?.area ?? "Local",
      category: categoryName,
      verified:
        business.verification === "VERIFIED",
      availability: business.availability,
      imageUrl: business.imageUrl,
    });
  }

  /*
   * Count applied filters, not draft changes.
   */

  const activeFilterCount =
    Number(Boolean(initialCategory)) +
    Number(Boolean(initialLocation)) +
    Number(Boolean(initialMinPrice)) +
    Number(Boolean(initialMaxPrice)) +
    Number(Boolean(initialAvailability)) +
    Number(initialVerified);

  return (
    <main className="min-h-screen bg-[#FFF7ED]">
      <div className="mx-auto min-h-screen w-full max-w-[1500px] px-3 py-3 sm:px-5 sm:py-5">
        <div className="min-h-[calc(100vh-24px)] overflow-hidden rounded-[18px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:rounded-[22px] lg:min-h-[calc(100vh-40px)]">

          {/* HEADER */}
          <header className="flex h-[64px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6 lg:h-[66px]">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                <Store className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-bold tracking-tight">
                  ReMarket
                </p>

                <p className="text-[10px] leading-none text-muted">
                  Find it nearby
                </p>
              </div>
            </Link>

            {/* DESKTOP HEADER NAVIGATION */}
            <nav className="hidden items-center gap-1 lg:flex">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => router.push(item.href)}
                  aria-current={
                    item.label === "Shop"
                      ? "page"
                      : undefined
                  }
                  className={`rounded-xl px-4 py-2 text-xs font-semibold transition hover:bg-gray-50 ${
                    item.label === "Shop"
                      ? "bg-[#FFF1ED] text-[#9F2D18]"
                      : "text-gray-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {/* Keep the request action available at all widths. */}
              <button
                type="button"
                onClick={() => router.push("/request")}
                className="rounded-xl bg-[#FF5A36] px-3 py-2.5 text-[10px] font-bold text-white shadow-sm transition hover:opacity-90 sm:px-4 sm:text-xs"
              >
                Request something
              </button>

              <button
                type="button"
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 sm:flex"
                aria-label="Profile"
              >
                <UserCircle className="h-6 w-6 text-gray-700" />
              </button>
            </div>
          </header>

          <div className="flex">

            {/* SIDEBAR */}
            <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 lg:block">
              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => router.push(item.href)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-white ${
                        item.label === "Shop"
                          ? "bg-white text-[#9F2D18]"
                          : "text-gray-700"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" />

                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="my-5 h-px bg-[#E7E2DB]" />

              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Categories
                </p>

                <div className="mt-3 space-y-1">
                  {categories.map((item) => {
                    const Icon = item.icon;

                    const active =
                      initialCategory === item.name;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          applyAppliedFilterChanges({
                            category: active
                              ? ""
                              : item.name,
                          })
                        }
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white ${
                          active
                            ? "bg-white text-[#9F2D18]"
                            : "text-gray-700"
                        }`}
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: item.bg,
                          }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>

                        <span className="truncate text-xs font-medium">
                          {item.name}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => router.push("/shop")}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100">
                      <MoreHorizontal className="h-4 w-4 text-gray-500" />
                    </span>

                    <span className="text-xs font-medium text-gray-700">
                      More
                    </span>
                  </button>
                </div>
              </div>
            </aside>

            {/* MAIN CONTENT */}
            <div className="min-w-0 flex-1">
              <div className="px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-6 lg:pb-8">

                {/* HERO */}
                <section className="rounded-[18px] bg-[#FF5A36] px-5 py-6 text-white shadow-soft sm:px-7 sm:py-7">
                  <div className="max-w-[720px]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                      Search ReMarket
                    </p>

                    <h1 className="mt-2 text-[26px] font-bold leading-tight sm:text-[30px]">
                      Find what you need
                    </h1>

                    <p className="mt-2 max-w-[520px] text-xs leading-5 text-white/80 sm:text-sm">
                      Search local sellers and products around you.
                    </p>

                    <form
                      onSubmit={submitSearch}
                      className="mt-5 flex h-[48px] w-full items-center rounded-full bg-white p-1.5 shadow-sm"
                    >
                      <Search className="ml-3 h-[18px] w-[18px] shrink-0 text-gray-500" />

                      <input
                        value={query}
                        onChange={(event) =>
                          setQuery(event.target.value)
                        }
                        placeholder="What are you looking for?"
                        aria-label="Search products and businesses"
                        className="min-w-0 flex-1 bg-transparent px-3 text-xs text-gray-800 outline-none placeholder:text-gray-400"
                      />

                      <button
                        type="submit"
                        className="flex h-[38px] shrink-0 items-center rounded-full bg-[#FF5A36] px-4 text-xs font-bold text-white transition hover:opacity-90 sm:px-5"
                      >
                        Search
                      </button>
                    </form>
                  </div>
                </section>

                {/* RESULTS HEADER */}
                <section className="mt-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-[#17202A]">
                        Search results
                      </h2>

                      <p className="mt-0.5 text-xs text-muted">
                        {loading
                          ? "Finding local businesses..."
                          : `${businesses.length} ${
                              businesses.length === 1
                                ? "business"
                                : "businesses"
                            } found`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowFilters(true)}
                      aria-label={`Open filters${
                        activeFilterCount > 0
                          ? `, ${activeFilterCount} active`
                          : ""
                      }`}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-[#FFB09B] hover:text-[#9F2D18]"
                    >
                      <SlidersHorizontal className="h-4 w-4" />

                      Filters

                      {activeFilterCount > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A36] px-1.5 text-[9px] font-bold text-white">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* APPLIED FILTER CHIPS */}
                  {activeFilterCount > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {initialCategory && (
                        <button
                          type="button"
                          onClick={() =>
                            applyAppliedFilterChanges({
                              category: "",
                            })
                          }
                          className="flex items-center gap-1.5 rounded-full bg-[#FFE0D6] px-3 py-1.5 text-[10px] font-semibold text-[#9F2D18]"
                        >
                          {initialCategory}

                          <X className="h-3 w-3" />
                        </button>
                      )}

                      {initialLocation && (
                        <button
                          type="button"
                          onClick={() =>
                            applyAppliedFilterChanges({
                              location: "",
                            })
                          }
                          className="flex items-center gap-1.5 rounded-full bg-[#E9EDF0] px-3 py-1.5 text-[10px] font-semibold text-gray-700"
                        >
                          {initialLocation}

                          <X className="h-3 w-3" />
                        </button>
                      )}

                      {(initialMinPrice ||
                        initialMaxPrice) && (
                        <button
                          type="button"
                          onClick={() =>
                            applyAppliedFilterChanges({
                              minPrice: "",
                              maxPrice: "",
                            })
                          }
                          className="flex items-center gap-1.5 rounded-full bg-[#FFF0C7] px-3 py-1.5 text-[10px] font-semibold text-[#8A671D]"
                        >
                          Price

                          <X className="h-3 w-3" />
                        </button>
                      )}

                      {initialAvailability && (
                        <button
                          type="button"
                          onClick={() =>
                            applyAppliedFilterChanges({
                              availability: "",
                            })
                          }
                          className="flex items-center gap-1.5 rounded-full bg-[#DDF5EA] px-3 py-1.5 text-[10px] font-semibold text-[#137A59]"
                        >
                          {initialAvailability ===
                          "AVAILABLE"
                            ? "Available"
                            : initialAvailability ===
                                "ASK_SELLER"
                              ? "Ask seller"
                              : "Unavailable"}

                          <X className="h-3 w-3" />
                        </button>
                      )}

                      {initialVerified && (
                        <button
                          type="button"
                          onClick={() =>
                            applyAppliedFilterChanges({
                              verified: false,
                            })
                          }
                          className="flex items-center gap-1.5 rounded-full bg-[#E7E5FF] px-3 py-1.5 text-[10px] font-semibold text-[#62559B]"
                        >
                          Verified

                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </section>

                {/* RESULTS */}
                <section className="mt-5">

                  {/* LOADING STATE */}
                  {loading && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[1, 2, 3, 4].map((item) => (
                        <div
                          key={item}
                          className="h-[240px] animate-pulse rounded-xl border border-[#E8E4DE] bg-white"
                        />
                      ))}
                    </div>
                  )}

                  {/* ERROR STATE */}
                  {!loading && error && (
                    <div className="rounded-xl border border-[#E8E4DE] bg-white px-5 py-12 text-center">
                      <Search className="mx-auto h-8 w-8 text-gray-300" />

                      <p className="mt-3 text-sm font-semibold text-gray-700">
                        Search unavailable
                      </p>

                      <p className="mt-1 text-xs text-gray-400">
                        {error}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          window.location.reload()
                        }
                        className="mt-4 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-white"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  {/* EMPTY STATE */}
                  {!loading &&
                    !error &&
                    businesses.length === 0 && (
                      <div className="rounded-xl border border-[#E8E4DE] bg-white px-5 py-12 text-center">
                        <Search className="mx-auto h-8 w-8 text-gray-300" />

                        <p className="mt-3 text-sm font-semibold text-gray-700">
                          We couldn&apos;t find that
                        </p>

                        <p className="mt-1 text-xs leading-5 text-gray-400">
                          Try another search or adjust your filters.
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            setShowFilters(true)
                          }
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-white"
                        >
                          Adjust filters

                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                  {/* BUSINESS CARDS */}
                  {!loading &&
                    !error &&
                    businesses.length > 0 && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {businesses.map((business) => {
                          const businessCategory =
                            business.categories?.[0]
                              ?.category?.name ??
                            "Services";

                          const categoryStyle =
                            categories.find(
                              (item) =>
                                item.name.toLowerCase() ===
                                businessCategory.toLowerCase()
                            ) ??
                            DEFAULT_CATEGORIES.find(
                              (item) =>
                                item.name.toLowerCase() ===
                                businessCategory.toLowerCase()
                            );

                          const categoryBg =
                            categoryStyle?.bg ??
                            "#EEF1F4";

                          const saved =
                            savedBusinessIds.has(
                              business.id
                            );

                          const firstProduct =
                            business.products?.[0] ??
                            null;

                          const productImage =
                            firstProduct
                              ? getProductImage(
                                  firstProduct
                                )
                              : null;

                          const availableProductCount =
                            (business.products ?? []).filter(
                              (product) =>
                                product.availability ===
                                "AVAILABLE"
                            ).length;

                          const availabilityStatus =
                            business.availability ===
                            "AVAILABLE"
                              ? {
                                  label: "Available",
                                  className:
                                    "bg-[#DDF5EA] text-[#137A59]",
                                }
                              : business.availability ===
                                  "ASK_SELLER"
                                ? {
                                    label: "Ask seller",
                                    className:
                                      "bg-[#FFF0C7] text-[#8A671D]",
                                  }
                                : {
                                    label: "Unavailable",
                                    className:
                                      "bg-[#F3E8E8] text-[#9F2D18]",
                                  };

                          const verified =
                            business.verification ===
                            "VERIFIED";

                          return (
                            <article
                              key={business.id}
                              className="overflow-hidden rounded-xl border border-[#E8E4DE] bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                            >
                              {/* BUSINESS IMAGE */}
                              <Link
                                href={`/seller/${business.id}`}
                                className="relative flex h-[120px] items-center justify-center overflow-hidden sm:h-[110px] xl:h-[120px]"
                                style={{
                                  backgroundColor:
                                    categoryBg,
                                }}
                              >
                                {business.imageUrl ? (
                                  <img
                                    src={business.imageUrl}
                                    alt={business.name}
                                    loading="lazy"
                                    className="absolute inset-0 h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/75 shadow-sm">
                                    <Store className="h-7 w-7 text-gray-700" />
                                  </div>
                                )}

                                <span
                                  className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[9px] font-semibold ${availabilityStatus.className}`}
                                >
                                  {availabilityStatus.label}
                                </span>
                              </Link>

                              {/* BUSINESS INFORMATION */}
                              <div className="p-3.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <Link
                                      href={`/seller/${business.id}`}
                                      className="block truncate text-sm font-bold text-[#17202A] hover:text-[#9F2D18]"
                                    >
                                      {business.name}
                                    </Link>

                                    <p className="mt-1 flex min-w-0 items-center gap-1 truncate text-[10px] text-muted">
                                      <span className="truncate">
                                        {businessCategory}
                                      </span>

                                      <span>·</span>

                                      <span className="flex min-w-0 items-center gap-1 truncate">
                                        <MapPin className="h-3 w-3 shrink-0" />

                                        <span className="truncate">
                                          {business.location?.area ??
                                            "Local"}
                                        </span>
                                      </span>
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    aria-label={
                                      saved
                                        ? `Remove ${business.name} from saved businesses`
                                        : `Save ${business.name}`
                                    }
                                    aria-pressed={saved}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();

                                      toggleSaved(business);
                                    }}
                                    className={`shrink-0 transition ${
                                      saved
                                        ? "text-[#9F2D18]"
                                        : "text-gray-500 hover:text-[#9F2D18]"
                                    }`}
                                  >
                                    <Bookmark
                                      className="h-4 w-4"
                                      fill={
                                        saved
                                          ? "currentColor"
                                          : "none"
                                      }
                                    />
                                  </button>
                                </div>

                                {/* VERIFICATION AND PRODUCT COUNT */}
                                <div className="mt-3 flex items-center justify-between gap-2">
                                  <div
                                    className={`flex min-w-0 items-center gap-1 ${
                                      verified
                                        ? "text-[#137A59]"
                                        : "text-gray-500"
                                    }`}
                                  >
                                    {verified ? (
                                      <Check className="h-4 w-4 shrink-0" />
                                    ) : (
                                      <Store className="h-4 w-4 shrink-0" />
                                    )}

                                    <span className="truncate text-[10px] font-semibold">
                                      {verified
                                        ? "Verified"
                                        : "Local seller"}
                                    </span>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-1 text-[10px] text-gray-400">
                                    <Package className="h-3 w-3" />

                                    <span>
                                      {availableProductCount}{" "}
                                      available
                                    </span>
                                  </div>
                                </div>

                                {/* FIRST PRODUCT */}
                                {firstProduct && (
                                  <div className="mt-3 border-t border-[#F0ECE6] pt-3">
                                    <div className="flex items-center gap-2.5">
                                      {productImage ? (
                                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[#ECE7E0] bg-[#FCFAF6]">
                                          <img
                                            src={productImage}
                                            alt={firstProduct.name}
                                            loading="lazy"
                                            className="h-full w-full object-cover"
                                          />
                                        </div>
                                      ) : (
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FCFAF6] text-gray-400">
                                          <Package className="h-4 w-4" />
                                        </div>
                                      )}

                                      <div className="min-w-0">
                                        <p className="truncate text-[10px] font-semibold text-gray-600">
                                          {firstProduct.name}
                                        </p>

                                        <p className="mt-1 text-[10px] text-gray-400">
                                          {formatPrice(firstProduct)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* BUSINESS LINK */}
                                <Link
                                  href={`/seller/${business.id}`}
                                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFF1ED] py-2.5 text-[11px] font-bold text-[#9F2D18] transition hover:bg-[#FFE6DF]"
                                >
                                  Browse

                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                </section>

                {/* FOOTER */}
                <footer className="mt-7 flex items-center justify-center gap-3 text-[10px] text-gray-400">
                  <span className="h-px w-10 bg-gray-200 sm:w-16" />

                  <span className="text-center">
                    ReMarket · Find it nearby
                  </span>

                  <span className="h-px w-10 bg-gray-200 sm:w-16" />
                </footer>
              </div>
            </div>
          </div>

          {/* FILTER DRAWER */}
          {showFilters && (
            <div className="fixed inset-0 z-[60]">
              {/* BACKDROP */}
              <button
                type="button"
                aria-label="Close filters"
                onClick={closeFilters}
                className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
              />

              {/* DRAWER */}
              <div className="absolute bottom-0 left-0 right-0 max-h-[88dvh] overflow-y-auto rounded-t-[24px] border-t border-[#E8E4DE] bg-[#FFFDFC] p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:bottom-4 sm:left-auto sm:right-4 sm:top-4 sm:max-h-none sm:w-[380px] sm:rounded-[22px] sm:border sm:pb-5">
                {/* DRAWER HEADER */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[#17202A]">
                      Filters
                    </h2>

                    <p className="mt-0.5 text-[11px] text-muted">
                      Narrow down your results
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeFilters}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600"
                    aria-label="Close filters"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* CATEGORY */}
                <div className="mt-6">
                  <label className="text-xs font-bold text-gray-700">
                    Category
                  </label>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {categories.map((item) => {
                      const Icon = item.icon;

                      const active =
                        category === item.name;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setCategory(
                              active ? "" : item.name
                            )
                          }
                          className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[11px] font-semibold transition ${
                            active
                              ? "border-[#FFB09B] bg-[#FFF1ED] text-[#9F2D18]"
                              : "border-[#E8E4DE] bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                            style={{
                              backgroundColor: item.bg,
                            }}
                          >
                            <Icon className="h-4 w-4" />
                          </span>

                          <span className="min-w-0 flex-1 truncate">
                            {item.name}
                          </span>

                          {active && (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* LOCATION */}
                <div className="mt-5">
                  <label
                    htmlFor="search-location-filter"
                    className="text-xs font-bold text-gray-700"
                  >
                    Location
                  </label>

                  <div className="relative mt-2">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                    <input
                      id="search-location-filter"
                      value={location}
                      onChange={(event) =>
                        setLocation(event.target.value)
                      }
                      placeholder="e.g. Ikeja"
                      className="h-11 w-full rounded-xl border border-[#E8E4DE] bg-white pl-10 pr-3 text-xs outline-none focus:border-[#FF9B82]"
                    />
                  </div>
                </div>

                {/* PRICE RANGE */}
                <div className="mt-5">
                  <label
                    htmlFor="search-min-price"
                    className="text-xs font-bold text-gray-700"
                  >
                    Price range
                  </label>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      id="search-min-price"
                      value={minPrice}
                      onChange={(event) =>
                        setMinPrice(event.target.value)
                      }
                      inputMode="numeric"
                      placeholder="Min price"
                      aria-label="Minimum price"
                      className="h-11 min-w-0 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                    />

                    <input
                      id="search-max-price"
                      value={maxPrice}
                      onChange={(event) =>
                        setMaxPrice(event.target.value)
                      }
                      inputMode="numeric"
                      placeholder="Max price"
                      aria-label="Maximum price"
                      className="h-11 min-w-0 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                    />
                  </div>
                </div>

                {/* AVAILABILITY */}
                <div className="mt-5">
                  <label
                    htmlFor="search-availability"
                    className="text-xs font-bold text-gray-700"
                  >
                    Availability
                  </label>

                  <div className="relative mt-2">
                    <select
                      id="search-availability"
                      value={availability}
                      onChange={(event) =>
                        setAvailability(event.target.value)
                      }
                      className="h-11 w-full appearance-none rounded-xl border border-[#E8E4DE] bg-white px-3 pr-9 text-xs text-gray-700 outline-none focus:border-[#FF9B82]"
                    >
                      <option value="">
                        Any availability
                      </option>

                      <option value="AVAILABLE">
                        Available now
                      </option>

                      <option value="ASK_SELLER">
                        Ask seller
                      </option>

                      <option value="UNAVAILABLE">
                        Unavailable
                      </option>
                    </select>

                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>

                {/* VERIFIED BUSINESS TOGGLE */}
                <button
                  type="button"
                  aria-pressed={verified}
                  onClick={() =>
                    setVerified(!verified)
                  }
                  className={`mt-5 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                    verified
                      ? "border-[#BFE7D0] bg-[#F0FBF5]"
                      : "border-[#E8E4DE] bg-white"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        verified
                          ? "bg-[#DDF5EA] text-[#137A59]"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 text-left">
                      <p className="text-xs font-bold text-gray-700">
                        Verified businesses
                      </p>

                      <p className="mt-0.5 text-[10px] text-gray-400">
                        Show verified sellers only
                      </p>
                    </div>
                  </div>

                  <div
                    className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                      verified
                        ? "bg-[#FF5A36]"
                        : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        verified
                          ? "translate-x-4"
                          : "translate-x-0"
                      }`}
                    />
                  </div>
                </button>

                {/* DRAWER ACTIONS */}
                <div className="mt-6 flex gap-2 border-t border-[#EAE6DF] pt-5">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex-1 rounded-xl border border-[#E8E4DE] bg-white py-3 text-xs font-bold text-gray-700 transition hover:bg-gray-50"
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    onClick={applyFilters}
                    className="flex-[1.5] rounded-xl bg-[#FF5A36] py-3 text-xs font-bold text-white transition hover:opacity-90"
                  >
                    Apply filters
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MOBILE / TABLET BOTTOM NAVIGATION */}
          <nav
            aria-label="Mobile navigation"
            className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
          >
            <div className="mx-auto grid max-w-md grid-cols-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => router.push(item.href)}
                    aria-current={
                      item.label === "Shop"
                        ? "page"
                        : undefined
                    }
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 ${
                      item.label === "Shop"
                        ? "text-[#9F2D18]"
                        : "text-gray-500"
                    }`}
                  >
                    <Icon className="h-[19px] w-[19px]" />

                    <span className="text-[9px] font-medium">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}

/*
 * -----------------------------------------
 * SEARCH PAGE ENTRY POINT
 * -----------------------------------------
 */

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FFF7ED]">
          <div className="mx-auto flex min-h-screen w-full max-w-[1500px] items-center justify-center px-3 py-3 sm:px-5 sm:py-5">
            <div className="rounded-xl border border-[#E8E4DE] bg-white px-5 py-4 text-xs text-gray-500 shadow-sm">
              Loading search...
            </div>
          </div>
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}