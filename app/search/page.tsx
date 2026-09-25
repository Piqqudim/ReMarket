"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  Suspense,
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
  Star,
  MoreHorizontal,
  Shirt,
  Plug,
  Utensils,
  Sparkles,
  Layers3,
  Briefcase,
} from "lucide-react";

import Link from "next/link";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  getSavedBusinesses,
  isBusinessSaved,
  saveBusiness,
  removeSavedBusiness,
  SAVED_BUSINESSES_CHANGED_EVENT,
} from "@/lib/saved";

const CATEGORY_STYLE: Record<
  string,
  {
    bg: string;
    icon: ReactNode;
  }
> = {
  Fashion: {
    bg: "#FFE0D6",
    icon: (
      <Shirt className="h-5 w-5" />
    ),
  },

  Electronics: {
    bg: "#DDF5EA",
    icon: (
      <Plug className="h-5 w-5" />
    ),
  },

  Food: {
    bg: "#FFF0C7",
    icon: (
      <Utensils className="h-5 w-5" />
    ),
  },

  Beauty: {
    bg: "#E7E5FF",
    icon: (
      <Sparkles className="h-5 w-5" />
    ),
  },

  Textiles: {
    bg: "#F9DCE8",
    icon: (
      <Layers3 className="h-5 w-5" />
    ),
  },

  Services: {
    bg: "#E4E9EF",
    icon: (
      <Briefcase className="h-5 w-5" />
    ),
  },
};

/*
 * ReMarket's current category set.
 *
 * IMPORTANT:
 * These categories belong to the ReMarket UI.
 * The Search page does not depend on the
 * /api/categories endpoint to render them.
 *
 * Additional categories can be added here later.
 */
const REMARKET_CATEGORIES: Category[] = [
  {
    id: "fashion",
    name: "Fashion",
  },
  {
    id: "electronics",
    name: "Electronics",
  },
  {
    id: "food",
    name: "Food",
  },
  {
    id: "beauty",
    name: "Beauty",
  },
  {
    id: "textiles",
    name: "Textiles",
  },
  {
    id: "services",
    name: "Services",
  },
];

type Category = {
  id: string;
  name: string;
};

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

function getCategoryStyle(
  name: string
) {
  return (
    CATEGORY_STYLE[name] ?? {
      bg: "#EEF1F4",
      icon: (
        <MoreHorizontal className="h-5 w-5" />
      ),
    }
  );
}

function formatPrice(
  product: Product
): string {
  if (
    product.price !==
    null
  ) {
    return `₦${product.price.toLocaleString()}`;
  }

  if (
    product.priceMin !==
      null &&
    product.priceMax !==
      null
  ) {
    return `₦${product.priceMin.toLocaleString()} - ₦${product.priceMax.toLocaleString()}`;
  }

  if (
    product.priceMin !==
    null
  ) {
    return `From ₦${product.priceMin.toLocaleString()}`;
  }

  if (
    product.priceMax !==
    null
  ) {
    return `Up to ₦${product.priceMax.toLocaleString()}`;
  }

  return "Ask seller";
}

function getProductImage(
  product: Product
): string | null {
  return (
    product.images?.[0]
      ?.url ??
    product.imageUrl ??
    null
  );
}

/*
 * -----------------------------------------
 * SAVED BUSINESSES EXTERNAL STORE
 * -----------------------------------------
 *
 * This avoids synchronously calling setState
 * from an effect during the initial render.
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
  const saved =
    getSavedBusinesses();

  return JSON.stringify(
    saved
      .map(
        (business) =>
          business.id
      )
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

function SearchPageContent() {
  const searchParams =
    useSearchParams();

  const initialQuery =
    searchParams.get("q") ?? "";

  const initialCategory =
    searchParams.get(
      "category"
    ) ?? "";

  const initialLocation =
    searchParams.get(
      "location"
    ) ?? "";

  const initialMinPrice =
    searchParams.get(
      "minPrice"
    ) ?? "";

  const initialMaxPrice =
    searchParams.get(
      "maxPrice"
    ) ?? "";

  const initialAvailability =
    searchParams.get(
      "availability"
    ) ?? "";

  const initialVerified =
    searchParams.get(
      "verified"
    ) === "true";

  /*
   * Re-create the view whenever the URL
   * changes. This means query/filter state
   * comes directly from the URL instead of
   * using a setState effect.
   */
  const searchKey =
    searchParams.toString();

  return (
    <SearchPageView
      key={searchKey}
      initialQuery={initialQuery}
      initialCategory={
        initialCategory
      }
      initialLocation={
        initialLocation
      }
      initialMinPrice={
        initialMinPrice
      }
      initialMaxPrice={
        initialMaxPrice
      }
      initialAvailability={
        initialAvailability
      }
      initialVerified={
        initialVerified
      }
    />
  );
}

function SearchPageView({
  initialQuery,
  initialCategory,
  initialLocation,
  initialMinPrice,
  initialMaxPrice,
  initialAvailability,
  initialVerified,
}: SearchPageViewProps) {
  const router =
    useRouter();

  const [
    query,
    setQuery,
  ] = useState(
    initialQuery
  );

  const [
    category,
    setCategory,
  ] = useState(
    initialCategory
  );

  const [
    location,
    setLocation,
  ] = useState(
    initialLocation
  );

  const [
    minPrice,
    setMinPrice,
  ] = useState(
    initialMinPrice
  );

  const [
    maxPrice,
    setMaxPrice,
  ] = useState(
    initialMaxPrice
  );

  const [
    availability,
    setAvailability,
  ] = useState(
    initialAvailability
  );

  const [
    verified,
    setVerified,
  ] = useState(
    initialVerified
  );

  const [
    businesses,
    setBusinesses,
  ] = useState<Business[]>(
    []
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    showFilters,
    setShowFilters,
  ] = useState(false);

  const savedSnapshot =
    useSyncExternalStore(
      subscribeToSavedBusinesses,
      getSavedBusinessesSnapshot,
      getSavedBusinessesServerSnapshot
    );

  const savedBusinessIds =
    useMemo(() => {
      try {
        const ids =
          JSON.parse(
            savedSnapshot
          );

        if (
          !Array.isArray(ids)
        ) {
          return new Set<string>();
        }

        return new Set<string>(
          ids.filter(
            (
              value
            ): value is string =>
              typeof value ===
              "string"
          )
        );
      } catch {
        return new Set<string>();
      }
    }, [savedSnapshot]);

  /*
   * -----------------------------------------
   * LOAD SEARCH RESULTS
   * -----------------------------------------
   */

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadSearchResults() {
      setLoading(true);
      setError("");

      try {
        const params =
          new URLSearchParams();

        if (
          initialQuery.trim()
        ) {
          params.set(
            "q",
            initialQuery.trim()
          );
        }

        if (category) {
          params.set(
            "category",
            category
          );
        }

        if (
          location.trim()
        ) {
          params.set(
            "location",
            location.trim()
          );
        }

        if (
          minPrice.trim()
        ) {
          params.set(
            "minPrice",
            minPrice.trim()
          );
        }

        if (
          maxPrice.trim()
        ) {
          params.set(
            "maxPrice",
            maxPrice.trim()
          );
        }

        if (availability) {
          params.set(
            "availability",
            availability
          );
        }

        if (verified) {
          params.set(
            "verified",
            "true"
          );
        }

        const response =
          await fetch(
            `/api/search?${params.toString()}`,
            {
              cache:
                "no-store",
              signal:
                controller.signal,
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            typeof data?.error ===
              "string"
              ? data.error
              : "Unable to complete search."
          );
        }

        if (
          controller.signal.aborted
        ) {
          return;
        }

        setBusinesses(
          Array.isArray(
            data.businesses
          )
            ? data.businesses
            : []
        );
      } catch (searchError) {
        if (
          searchError instanceof
            DOMException &&
          searchError.name ===
            "AbortError"
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
        if (
          !controller.signal
            .aborted
        ) {
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
    category,
    location,
    minPrice,
    maxPrice,
    availability,
    verified,
  ]);

  function createSearchParams() {
    const params =
      new URLSearchParams();

    if (
      query.trim()
    ) {
      params.set(
        "q",
        query.trim()
      );
    }

    if (category) {
      params.set(
        "category",
        category
      );
    }

    if (
      location.trim()
    ) {
      params.set(
        "location",
        location.trim()
      );
    }

    if (
      minPrice.trim()
    ) {
      params.set(
        "minPrice",
        minPrice.trim()
      );
    }

    if (
      maxPrice.trim()
    ) {
      params.set(
        "maxPrice",
        maxPrice.trim()
      );
    }

    if (availability) {
      params.set(
        "availability",
        availability
      );
    }

    if (verified) {
      params.set(
        "verified",
        "true"
      );
    }

    return params;
  }

  function submitSearch(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const params =
      createSearchParams();

    const queryString =
      params.toString();

    router.push(
      queryString
        ? `/search?${queryString}`
        : "/search"
    );
  }

  function applyFilters() {
    const params =
      createSearchParams();

    const queryString =
      params.toString();

    router.push(
      queryString
        ? `/search?${queryString}`
        : "/search"
    );

    setShowFilters(false);
  }

  function clearFilters() {
    setCategory("");
    setLocation("");
    setMinPrice("");
    setMaxPrice("");
    setAvailability("");
    setVerified(false);

    const params =
      new URLSearchParams();

    if (
      query.trim()
    ) {
      params.set(
        "q",
        query.trim()
      );
    }

    const queryString =
      params.toString();

    router.push(
      queryString
        ? `/search?${queryString}`
        : "/search"
    );

    setShowFilters(false);
  }

  function toggleSaved(
    business: Business
  ) {
    if (
      isBusinessSaved(
        business.id
      )
    ) {
      removeSavedBusiness(
        business.id
      );

      return;
    }

    const categoryName =
      business.categories?.[0]
        ?.category?.name ??
      "Services";

    saveBusiness({
      id: business.id,
      name: business.name,
      area:
        business.location
          ?.area ??
        "Local",
      category:
        categoryName,
      verified:
        business.verification ===
        "VERIFIED",
      availability:
        business.availability,
      imageUrl:
        business.imageUrl,
    });
  }

  const activeFilterCount =
    Number(
      Boolean(category)
    ) +
    Number(
      Boolean(location)
    ) +
    Number(
      Boolean(minPrice)
    ) +
    Number(
      Boolean(maxPrice)
    ) +
    Number(
      Boolean(availability)
    ) +
    Number(verified);

  return (
    <main className="min-h-screen bg-[#FFF7ED]">
      <div className="mx-auto min-h-screen w-full max-w-[1500px] px-3 py-3 sm:px-5 sm:py-5">
        <div className="min-h-[calc(100vh-24px)] overflow-hidden rounded-[18px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:rounded-[22px] lg:min-h-[calc(100vh-40px)]">

          {/* HEADER */}
          <header className="flex h-[64px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6 lg:h-[66px]">
            <Link
              href="/"
              className="flex items-center gap-2.5"
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

            <nav className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map(
                (item) => (
                  <button
                    key={
                      item.label
                    }
                    type="button"
                    onClick={() =>
                      router.push(
                        item.href
                      )
                    }
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    {
                      item.label
                    }
                  </button>
                )
              )}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push("/")
                }
                className="hidden h-9 w-9 items-center justify-center rounded-full hover:bg-gray-50 sm:flex"
                aria-label="Home"
              >
                <Home className="h-[19px] w-[19px] text-gray-700" />
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/saved"
                  )
                }
                className="hidden h-9 w-9 items-center justify-center rounded-full hover:bg-gray-50 sm:flex"
                aria-label="Saved"
              >
                <Heart className="h-[19px] w-[19px] text-gray-700" />
              </button>

              <button
                type="button"
                className="hidden h-9 w-9 items-center justify-center rounded-full bg-gray-100 sm:flex"
                aria-label="Profile"
              >
                <UserCircle className="h-6 w-6 text-gray-700" />
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/request"
                  )
                }
                className="rounded-xl bg-[#FF5A36] px-3.5 py-2.5 text-[11px] font-bold text-white shadow-sm transition hover:opacity-90 sm:px-4 sm:text-xs"
              >
                Request something
              </button>
            </div>
          </header>

          <div className="flex">

            {/* SIDEBAR */}
            <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 lg:block">
              <nav className="space-y-1">
                {NAV_ITEMS.map(
                  (item) => {
                    const Icon =
                      item.icon;

                    return (
                      <button
                        key={
                          item.label
                        }
                        type="button"
                        onClick={() =>
                          router.push(
                            item.href
                          )
                        }
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-white ${
                          item.label ===
                          "Shop"
                            ? "bg-white text-[#9F2D18]"
                            : "text-gray-700"
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px]" />

                        <span>
                          {
                            item.label
                          }
                        </span>
                      </button>
                    );
                  }
                )}
              </nav>

              <div className="my-5 h-px bg-[#E7E2DB]" />

              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Categories
                </p>

                <div className="mt-3 space-y-1">
                  {REMARKET_CATEGORIES.map(
                    (item) => {
                      const style =
                        getCategoryStyle(
                          item.name
                        );

                      const active =
                        category ===
                        item.name;

                      return (
                        <button
                          key={
                            item.id
                          }
                          type="button"
                          onClick={() =>
                            setCategory(
                              active
                                ? ""
                                : item.name
                            )
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
                              backgroundColor:
                                style.bg,
                            }}
                          >
                            <span className="scale-[0.65]">
                              {
                                style.icon
                              }
                            </span>
                          </span>

                          <span className="truncate text-xs font-medium">
                            {
                              item.name
                            }
                          </span>
                        </button>
                      );
                    }
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        "/shop"
                      )
                    }
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

            {/* MAIN */}
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
                      onSubmit={
                        submitSearch
                      }
                      className="mt-5 flex h-[48px] w-full items-center rounded-full bg-white p-1.5 shadow-sm"
                    >
                      <Search className="ml-3 h-[18px] w-[18px] shrink-0 text-gray-500" />

                      <input
                        value={query}
                        onChange={(
                          event
                        ) =>
                          setQuery(
                            event.target
                              .value
                          )
                        }
                        placeholder="What are you looking for?"
                        className="min-w-0 flex-1 bg-transparent px-3 text-xs text-gray-800 outline-none placeholder:text-gray-400"
                      />

                      <button
                        type="submit"
                        className="flex h-[38px] items-center rounded-full bg-[#FF5A36] px-5 text-xs font-bold text-white transition hover:opacity-90"
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
                              businesses.length ===
                              1
                                ? "business"
                                : "businesses"
                            } found`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setShowFilters(
                          true
                        )
                      }
                      className="flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-[#FFB09B] hover:text-[#9F2D18]"
                    >
                      <SlidersHorizontal className="h-4 w-4" />

                      Filters

                      {activeFilterCount >
                        0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A36] px-1.5 text-[9px] font-bold text-white">
                          {
                            activeFilterCount
                          }
                        </span>
                      )}
                    </button>
                  </div>

                  {activeFilterCount >
                    0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {category && (
                        <button
                          type="button"
                          onClick={() =>
                            setCategory(
                              ""
                            )
                          }
                          className="flex items-center gap-1.5 rounded-full bg-[#FFE0D6] px-3 py-1.5 text-[10px] font-semibold text-[#9F2D18]"
                        >
                          {
                            category
                          }

                          <X className="h-3 w-3" />
                        </button>
                      )}

                      {location && (
                        <button
                          type="button"
                          onClick={() =>
                            setLocation(
                              ""
                            )
                          }
                          className="flex items-center gap-1.5 rounded-full bg-[#E9EDF0] px-3 py-1.5 text-[10px] font-semibold text-gray-700"
                        >
                          {
                            location
                          }

                          <X className="h-3 w-3" />
                        </button>
                      )}

                      {(minPrice ||
                        maxPrice) && (
                        <button
                          type="button"
                          onClick={() => {
                            setMinPrice(
                              ""
                            );
                            setMaxPrice(
                              ""
                            );
                          }}
                          className="flex items-center gap-1.5 rounded-full bg-[#FFF0C7] px-3 py-1.5 text-[10px] font-semibold text-[#8A671D]"
                        >
                          Price
                          <X className="h-3 w-3" />
                        </button>
                      )}

                      {availability && (
                        <button
                          type="button"
                          onClick={() =>
                            setAvailability(
                              ""
                            )
                          }
                          className="flex items-center gap-1.5 rounded-full bg-[#DDF5EA] px-3 py-1.5 text-[10px] font-semibold text-[#137A59]"
                        >
                          {availability ===
                          "AVAILABLE"
                            ? "Available"
                            : availability ===
                                "ASK_SELLER"
                              ? "Ask seller"
                              : "Unavailable"}

                          <X className="h-3 w-3" />
                        </button>
                      )}

                      {verified && (
                        <button
                          type="button"
                          onClick={() =>
                            setVerified(
                              false
                            )
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
                  {loading && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        1,
                        2,
                        3,
                        4,
                      ].map(
                        (item) => (
                          <div
                            key={
                              item
                            }
                            className="h-[240px] animate-pulse rounded-xl border border-[#E8E4DE] bg-white"
                          />
                        )
                      )}
                    </div>
                  )}

                  {!loading &&
                    error && (
                      <div className="rounded-xl border border-[#E8E4DE] bg-white px-5 py-12 text-center">
                        <Search className="mx-auto h-8 w-8 text-gray-300" />

                        <p className="mt-3 text-sm font-semibold text-gray-700">
                          Search unavailable
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          {
                            error
                          }
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

                  {!loading &&
                    !error &&
                    businesses.length ===
                      0 && (
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
                            setShowFilters(
                              true
                            )
                          }
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-white"
                        >
                          Adjust filters
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                  {!loading &&
                    !error &&
                    businesses.length >
                      0 && (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {businesses.map(
                          (
                            business
                          ) => {
                            const category =
                              business
                                .categories?.[0]
                                ?.category
                                ?.name ??
                              "Services";

                            const style =
                              getCategoryStyle(
                                category
                              );

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

                            return (
                              <article
                                key={
                                  business.id
                                }
                                className="overflow-hidden rounded-xl border border-[#E8E4DE] bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                              >
                                <Link
                                  href={`/seller/${business.id}`}
                                  className="relative flex h-[92px] items-center justify-center overflow-hidden"
                                  style={{
                                    backgroundColor:
                                      style.bg,
                                  }}
                                >
                                  {business.imageUrl ? (
                                    <img
                                      src={
                                        business.imageUrl
                                      }
                                      alt={
                                        business.name
                                      }
                                      className="absolute inset-0 h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/75 shadow-sm">
                                      <Store className="h-7 w-7 text-gray-700" />
                                    </div>
                                  )}

                                  <span className="absolute right-3 top-3 rounded-full bg-[#DDF5EA] px-2.5 py-1 text-[9px] font-semibold text-[#137A59]">
                                    {business.availability ===
                                    "AVAILABLE"
                                      ? "Available"
                                      : "Active"}
                                  </span>
                                </Link>

                                <div className="p-3.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <Link
                                        href={`/seller/${business.id}`}
                                        className="block truncate text-sm font-bold text-[#17202A] hover:text-[#9F2D18]"
                                      >
                                        {
                                          business.name
                                        }
                                      </Link>

                                      <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted">
                                        <span className="truncate">
                                          {
                                            category
                                          }
                                        </span>

                                        <span>
                                          ·
                                        </span>

                                        <span className="flex min-w-0 items-center gap-1 truncate">
                                          <MapPin className="h-3 w-3 shrink-0" />

                                          {
                                            business
                                              .location
                                              ?.area ??
                                            "Local"
                                          }
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
                                      aria-pressed={
                                        saved
                                      }
                                      onClick={(
                                        event
                                      ) => {
                                        event.preventDefault();
                                        event.stopPropagation();

                                        toggleSaved(
                                          business
                                        );
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

                                  <div className="mt-3 flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <Star className="h-5 w-5 text-[#F2B52B]" />

                                      <span className="text-[11px] font-semibold text-gray-700">
                                        Local
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                      <Package className="h-3 w-3" />

                                      <span>
                                        {
                                          business.products
                                            ?.length
                                        }{" "}
                                        available
                                      </span>
                                    </div>
                                  </div>

                                  {firstProduct && (
                                    <div className="mt-3 border-t border-[#F0ECE6] pt-3">
                                      <div className="flex items-center gap-2.5">
                                        {productImage ? (
                                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[#ECE7E0] bg-[#FCFAF6]">
                                            <img
                                              src={
                                                productImage
                                              }
                                              alt={
                                                firstProduct.name
                                              }
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
                                            {
                                              firstProduct.name
                                            }
                                          </p>

                                          <p className="mt-1 text-[10px] text-gray-400">
                                            {formatPrice(
                                              firstProduct
                                            )}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

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
                          }
                        )}
                      </div>
                    )}
                </section>

                <footer className="mt-7 flex items-center justify-center gap-3 text-[10px] text-gray-400">
                  <span className="h-px w-16 bg-gray-200" />

                  <span>
                    ReMarket · Find it nearby
                  </span>

                  <span className="h-px w-16 bg-gray-200" />
                </footer>
              </div>
            </div>
          </div>

          {/* FILTER DRAWER */}
          {showFilters && (
            <div className="fixed inset-0 z-[60]">
              <button
                type="button"
                aria-label="Close filters"
                onClick={() =>
                  setShowFilters(
                    false
                  )
                }
                className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
              />

              <div className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto rounded-t-[24px] border-t border-[#E8E4DE] bg-[#FFFDFC] p-5 shadow-2xl sm:bottom-4 sm:left-auto sm:right-4 sm:top-4 sm:w-[380px] sm:rounded-[22px] sm:border">
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
                    onClick={() =>
                      setShowFilters(
                        false
                      )
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600"
                    aria-label="Close filters"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-6">
                  <label className="text-xs font-bold text-gray-700">
                    Category
                  </label>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {REMARKET_CATEGORIES.map(
                      (item) => {
                        const active =
                          category ===
                          item.name;

                        const style =
                          getCategoryStyle(
                            item.name
                          );

                        return (
                          <button
                            key={
                              item.id
                            }
                            type="button"
                            onClick={() =>
                              setCategory(
                                active
                                  ? ""
                                  : item.name
                              )
                            }
                            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[11px] font-semibold transition ${
                              active
                                ? "border-[#FFB09B] bg-[#FFF1ED] text-[#9F2D18]"
                                : "border-[#E8E4DE] bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                              style={{
                                backgroundColor:
                                  style.bg,
                              }}
                            >
                              {
                                style.icon
                              }
                            </span>

                            <span className="truncate">
                              {
                                item.name
                              }
                            </span>

                            {active && (
                              <Check className="ml-auto h-3.5 w-3.5" />
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="mt-5">
                  <label className="text-xs font-bold text-gray-700">
                    Location
                  </label>

                  <div className="relative mt-2">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                    <input
                      value={location}
                      onChange={(
                        event
                      ) =>
                        setLocation(
                          event.target
                            .value
                        )
                      }
                      placeholder="e.g. Ikeja"
                      className="h-11 w-full rounded-xl border border-[#E8E4DE] bg-white pl-10 pr-3 text-xs outline-none focus:border-[#FF9B82]"
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <label className="text-xs font-bold text-gray-700">
                    Price range
                  </label>

                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      value={
                        minPrice
                      }
                      onChange={(
                        event
                      ) =>
                        setMinPrice(
                          event.target
                            .value
                        )
                      }
                      inputMode="numeric"
                      placeholder="Min price"
                      className="h-11 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                    />

                    <input
                      value={
                        maxPrice
                      }
                      onChange={(
                        event
                      ) =>
                        setMaxPrice(
                          event.target
                            .value
                        )
                      }
                      inputMode="numeric"
                      placeholder="Max price"
                      className="h-11 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <label className="text-xs font-bold text-gray-700">
                    Availability
                  </label>

                  <div className="relative mt-2">
                    <select
                      value={
                        availability
                      }
                      onChange={(
                        event
                      ) =>
                        setAvailability(
                          event.target
                            .value
                        )
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

                <button
                  type="button"
                  onClick={() =>
                    setVerified(
                      !verified
                    )
                  }
                  className={`mt-5 flex w-full items-center justify-between rounded-xl border px-4 py-3 ${
                    verified
                      ? "border-[#BFE7D0] bg-[#F0FBF5]"
                      : "border-[#E8E4DE] bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        verified
                          ? "bg-[#DDF5EA] text-[#137A59]"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </div>

                    <div className="text-left">
                      <p className="text-xs font-bold text-gray-700">
                        Verified businesses
                      </p>

                      <p className="mt-0.5 text-[10px] text-gray-400">
                        Show verified sellers only
                      </p>
                    </div>
                  </div>

                  <div
                    className={`h-5 w-9 rounded-full p-0.5 ${
                      verified
                        ? "bg-[#FF5A36]"
                        : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 rounded-full bg-white shadow-sm ${
                        verified
                          ? "translate-x-4"
                          : "translate-x-0"
                      }`}
                    />
                  </div>
                </button>

                <div className="mt-6 flex gap-2 border-t border-[#EAE6DF] pt-5">
                  <button
                    type="button"
                    onClick={
                      clearFilters
                    }
                    className="flex-1 rounded-xl border border-[#E8E4DE] bg-white py-3 text-xs font-bold text-gray-700"
                  >
                    Clear
                  </button>

                  <button
                    type="button"
                    onClick={
                      applyFilters
                    }
                    className="flex-[1.5] rounded-xl bg-[#FF5A36] py-3 text-xs font-bold text-white"
                  >
                    Apply filters
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MOBILE NAV */}
          <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(6px,safe-area-inset-bottom)] pt-1.5 backdrop-blur lg:hidden">
            <div className="mx-auto grid max-w-md grid-cols-4">
              {NAV_ITEMS.map(
                (item) => {
                  const Icon =
                    item.icon;

                  return (
                    <button
                      key={
                        item.label
                      }
                      type="button"
                      onClick={() =>
                        router.push(
                          item.href
                        )
                      }
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 ${
                        item.label ===
                        "Shop"
                          ? "text-[#9F2D18]"
                          : "text-gray-500"
                      }`}
                    >
                      <Icon className="h-[19px] w-[19px]" />

                      <span className="text-[9px] font-medium">
                        {
                          item.label
                        }
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}

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