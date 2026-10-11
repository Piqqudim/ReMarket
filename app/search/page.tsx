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
  ChevronLeft,
  ChevronRight,
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

/**
 * ------------------------------------------------
 * SEARCH PAGE CONFIGURATION
 * ------------------------------------------------
 */

const PAGE_SIZE = 12;

type Category = ReMarketCategory;

type ProductImage = {
  id: string;
  url: string;
  publicId?: string | null;
  sortOrder: number;
};

type ProductCategory = {
  id: string;
  name: string;
  iconKey?: string;
  isActive?: boolean;
  sortOrder?: number;
} | null;

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;

  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";

  imageUrl: string | null;

  images?: ProductImage[];

  category?: ProductCategory;

  keywords?: string[];

  matchScore?: number;
};

/**
 * Categories are string arrays in the current
 * /api/search response.
 */

type BusinessLocation = {
  id?: string;
  area?: string | null;
  address?: string | null;
  verification?: string;
  lat?: number | null;
  long?: number | null;
} | null;

type SaveableBusiness = {
  id: string;
  name: string;
  ownerName?: string | null;
  description: string | null;
  imageUrl: string | null;

  location: BusinessLocation;

  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";

  verification:
    | "VERIFIED"
    | "UNVERIFIED";

  verified?: boolean;

  categories: string[];

  category?: string;

  socialLinks: {
    id?: string;
    platform: string;
    handle: string;
  }[];
};

type ProductBusiness = SaveableBusiness;

type ProductSearchResult = Product & {
  business: ProductBusiness;
  matchScore: number;
};

type Business = SaveableBusiness & {
  products: Product[];
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

type SearchPageViewProps = {
  initialQuery: string;
  initialCategory: string;
  initialLocation: string;
  initialMinPrice: string;
  initialMaxPrice: string;
  initialAvailability: string;
  initialVerified: boolean;
  initialPage: number;
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

/**
 * ------------------------------------------------
 * PRICE FORMATTING
 * ------------------------------------------------
 */

function formatPrice(
  product: Product
): string {
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

/**
 * ------------------------------------------------
 * PRODUCT IMAGE
 * ------------------------------------------------
 */

function getProductImage(
  product: Product
): string | null {
  return (
    product.images?.[0]?.url ??
    product.imageUrl ??
    null
  );
}

/**
 * ------------------------------------------------
 * BUSINESS CATEGORY
 * ------------------------------------------------
 */

function getBusinessCategory(
  business: {
    categories?: string[];
    category?: string;
  }
): string {
  return (
    business.categories?.[0] ??
    business.category ??
    "Services"
  );
}

/**
 * ------------------------------------------------
 * AVAILABILITY DISPLAY
 * ------------------------------------------------
 */

function getAvailabilityStatus(
  availability: string
) {
  if (availability === "AVAILABLE") {
    return {
      label: "Available",
      className:
        "bg-[#DDF5EA] text-[#137A59]",
    };
  }

  if (availability === "ASK_SELLER") {
    return {
      label: "Ask seller",
      className:
        "bg-[#FFF0C7] text-[#8A671D]",
    };
  }

  return {
    label: "Unavailable",
    className:
      "bg-[#F3E8E8] text-[#9F2D18]",
  };
}

/**
 * ------------------------------------------------
 * SEARCH PARAMETER HELPERS
 * ------------------------------------------------
 *
 * These parameters represent filters only.
 * Page state is added separately.
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

function getPositivePage(
  value: string | null
): number {
  if (!value) {
    return 1;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return 1;
  }

  return parsed;
}

/**
 * ------------------------------------------------
 * SAVED BUSINESSES EXTERNAL STORE
 * ------------------------------------------------
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

/**
 * ------------------------------------------------
 * PAGE URL STATE
 * ------------------------------------------------
 *
 * Filter changes remount the view.
 *
 * Changing the page retains the applied filters.
 */

function SearchPageContent() {
  const router = useRouter();
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

  const initialPage = getPositivePage(
    searchParams.get("page")
  );

  const allSearchParams =
    searchParams.toString();

  const stableParams = new URLSearchParams(
    allSearchParams
  );

  stableParams.delete("page");

  const searchKey = stableParams.toString();

  /**
   * Normalize invalid page values in the URL.
   */

  useEffect(() => {
    const rawPage =
      searchParams.get("page");

    if (rawPage === null) {
      return;
    }

    const parsedPage = Number(rawPage);

    if (
      Number.isSafeInteger(parsedPage) &&
      parsedPage >= 1
    ) {
      return;
    }

    const params = new URLSearchParams(
      allSearchParams
    );

    params.delete("page");

    const queryString = params.toString();

    router.replace(
      queryString
        ? `/search?${queryString}`
        : "/search",
      {
        scroll: false,
      }
    );
  }, [
    allSearchParams,
    router,
    searchParams,
  ]);

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
      initialPage={initialPage}
    />
  );
}

/**
 * ------------------------------------------------
 * SEARCH PAGE VIEW
 * ------------------------------------------------
 */

function SearchPageView({
  initialQuery,
  initialCategory,
  initialLocation,
  initialMinPrice,
  initialMaxPrice,
  initialAvailability,
  initialVerified,
  initialPage,
}: SearchPageViewProps) {
  const router = useRouter();

  /**
   * Draft filter values.
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

  const [products, setProducts] = useState<
    ProductSearchResult[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [showFilters, setShowFilters] = useState(
    false
  );

  /**
   * Applied filters are always sourced from the URL.
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

  /**
   * -----------------------------------------
   * SAVED BUSINESSES
   * -----------------------------------------
   */

  const savedSnapshot = useSyncExternalStore(
    subscribeToSavedBusinesses,
    getSavedBusinessesSnapshot,
    getSavedBusinessesServerSnapshot
  );

  const savedBusinessIds = useMemo(() => {
    try {
      const ids: unknown = JSON.parse(
        savedSnapshot
      );

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

  /**
   * -----------------------------------------
   * NAVIGATION
   * -----------------------------------------
   */

  function navigateToSearch(
    values: SearchFilterValues
  ) {
    const params = buildSearchParams(values);

    /**
     * A new query or filter starts at page 1.
     */

    const queryString = params.toString();

    router.push(
      queryString
        ? `/search?${queryString}`
        : "/search"
    );
  }

  function navigateToPage(
    requestedPage: number,
    replace = false
  ) {
    const params = buildSearchParams(
      appliedFilters
    );

    if (requestedPage > 1) {
      params.set(
        "page",
        String(requestedPage)
      );
    }

    const queryString = params.toString();

    const url = queryString
      ? `/search?${queryString}`
      : "/search";

    if (replace) {
      router.replace(
        url,
        {
          scroll: false,
        }
      );

      return;
    }

    router.push(
      url,
      {
        scroll: false,
      }
    );
  }

  function applyAppliedFilterChanges(
    overrides: Partial<SearchFilterValues>
  ) {
    navigateToSearch({
      ...appliedFilters,
      ...overrides,
    });
  }

  /**
   * -----------------------------------------
   * LOAD CATEGORIES
   * -----------------------------------------
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

  /**
   * -----------------------------------------
   * LOAD SEARCH RESULTS
   * -----------------------------------------
   *
   * The current search API returns the ranked
   * product and business result arrays.
   *
   * This component paginates the combined result
   * collection locally.
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

        const queryString = params.toString();

        const response = await fetch(
          `/api/search${queryString ? `?${queryString}` : ""}`,
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

        setProducts(
          Array.isArray(data.products)
            ? data.products
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
        setProducts([]);

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

  /**
   * -----------------------------------------
   * SEARCH SUBMISSION
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

  /**
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

  /**
   * -----------------------------------------
   * CLOSE FILTERS
   * -----------------------------------------
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

  /**
   * -----------------------------------------
   * CLEAR FILTERS
   * -----------------------------------------
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

  /**
   * -----------------------------------------
   * SAVE / UNSAVE BUSINESS
   * -----------------------------------------
   */

  function toggleSaved(
    business: SaveableBusiness
  ) {
    if (isBusinessSaved(business.id)) {
      removeSavedBusiness(business.id);
      return;
    }

    const categoryName =
      getBusinessCategory(business);

    saveBusiness({
      id: business.id,
      name: business.name,
      area:
        business.location?.area ??
        "Local",
      category: categoryName,
      verified:
        business.verification === "VERIFIED",
      availability: business.availability,
      imageUrl: business.imageUrl,
    });
  }

  /**
   * -----------------------------------------
   * RESULT COLLECTIONS
   * -----------------------------------------
   *
   * Products are the primary result for product
   * discovery.
   *
   * Businesses already represented by a matching
   * product are omitted from the separate business
   * section to reduce duplicate seller cards.
   *
   * Direct business matches remain available when
   * no matching product is found, and businesses
   * not represented by product results remain
   * discoverable alongside product results.
   */

  const productBusinessIds = useMemo(
    () =>
      new Set(
        products.map(
          (product) =>
            product.business.id
        )
      ),
    [products]
  );

  const additionalBusinesses = useMemo(
    () =>
      businesses.filter(
        (business) =>
          !productBusinessIds.has(
            business.id
          )
      ),
    [
      businesses,
      productBusinessIds,
    ]
  );

  /**
   * -----------------------------------------
   * COMBINED CLIENT-SIDE PAGINATION
   * -----------------------------------------
   *
   * Each page contains at most PAGE_SIZE results
   * across both result collections.
   *
   * Products appear first, followed by additional
   * businesses. This preserves their separate
   * visual sections without showing up to 24
   * results on a single page.
   */

  const totalProductResults =
    products.length;

  const totalAdditionalBusinesses =
    additionalBusinesses.length;

  const totalResults =
    totalProductResults +
    totalAdditionalBusinesses;

  const totalPages = Math.max(
    1,
    Math.ceil(totalResults / PAGE_SIZE)
  );

  /**
   * Keep the visible page within the result range.
   */

  const currentPage = Math.min(
    Math.max(1, initialPage),
    totalPages
  );

  /**
   * If the available result count changes,
   * move an invalid page back to the last valid
   * page.
   */

  useEffect(() => {
    if (
      loading ||
      currentPage === initialPage
    ) {
      return;
    }

    navigateToPage(
      currentPage,
      true
    );
  }, [
    loading,
    currentPage,
    initialPage,
  ]);

  const pageStart =
    (currentPage - 1) * PAGE_SIZE;

  const pageEnd =
    Math.min(
      pageStart + PAGE_SIZE,
      totalResults
    );

  /**
   * Products occupy the beginning of the
   * combined result collection.
   */

  const displayedProducts = useMemo(
    () =>
      products.slice(
        pageStart,
        Math.min(
          pageEnd,
          totalProductResults
        )
      ),
    [
      products,
      pageStart,
      pageEnd,
      totalProductResults,
    ]
  );

  /**
   * Additional businesses follow products
   * in the combined result collection.
   */

  const displayedBusinesses = useMemo(
    () => {
      const businessStart = Math.max(
        0,
        pageStart - totalProductResults
      );

      const businessEnd = Math.max(
        0,
        pageEnd - totalProductResults
      );

      return additionalBusinesses.slice(
        businessStart,
        businessEnd
      );
    },
    [
      additionalBusinesses,
      pageStart,
      pageEnd,
      totalProductResults,
    ]
  );

  const hasResults =
    totalResults > 0;

  /**
   * Count applied filters, not draft changes.
   */

  const activeFilterCount =
    Number(Boolean(initialCategory)) +
    Number(Boolean(initialLocation)) +
    Number(Boolean(initialMinPrice)) +
    Number(Boolean(initialMaxPrice)) +
    Number(Boolean(initialAvailability)) +
    Number(initialVerified);

  /**
   * -----------------------------------------
   * CATEGORY COLOR
   * -----------------------------------------
   */

  function getCategoryBackground(
    categoryName: string
  ): string {
    return (
      categories.find(
        (item) =>
          item.name.toLowerCase() ===
          categoryName.toLowerCase()
      )?.bg ??
      DEFAULT_CATEGORIES.find(
        (item) =>
          item.name.toLowerCase() ===
          categoryName.toLowerCase()
      )?.bg ??
      "#EEF1F4"
    );
  }

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#FFF7ED]">
      <div className="mx-auto min-h-dvh w-full min-w-0 max-w-[1500px] px-2 py-2 sm:px-5 sm:py-5">
        <div className="min-h-[calc(100dvh-16px)] min-w-0 overflow-hidden rounded-[16px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:min-h-[calc(100dvh-40px)] sm:rounded-[22px]">

          {/* HEADER */}

          <header className="flex h-[62px] min-w-0 items-center justify-between gap-2 border-b border-[#EAE6DF] bg-white px-3 sm:h-[66px] sm:px-6">

            <Link
              href="/"
              className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-2.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white sm:h-10 sm:w-10">
                <Store className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>

              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold tracking-tight sm:text-sm">
                  ReMarket
                </p>

                <p className="text-[9px] leading-none text-muted sm:text-[10px]">
                  Find it nearby
                </p>
              </div>
            </Link>

            {/* DESKTOP NAVIGATION */}

            <nav className="hidden items-center gap-1 lg:flex">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() =>
                    router.push(item.href)
                  }
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

            <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push("/request")
                }
                className="shrink-0 rounded-xl bg-[#FF5A36] px-2.5 py-2.5 text-[10px] font-bold text-white shadow-sm transition hover:opacity-90 sm:px-4 sm:text-xs"
              >
                <span className="sm:hidden">
                  Request
                </span>

                <span className="hidden sm:inline">
                  Request something
                </span>
              </button>

              <button
                type="button"
                aria-label="Profile"
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 sm:flex"
              >
                <UserCircle className="h-6 w-6 text-gray-700" />
              </button>
            </div>
          </header>

          <div className="flex min-w-0">

            {/* SIDEBAR */}

            <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 lg:block">
              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() =>
                        router.push(item.href)
                      }
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-white ${
                        item.label === "Shop"
                          ? "bg-white text-[#9F2D18]"
                          : "text-gray-700"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />

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
                        className={`flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white ${
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
                    onClick={() =>
                      router.push("/shop")
                    }
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100">
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
              <div className="min-w-0 px-3 pb-24 pt-3 sm:px-6 sm:pt-6 lg:px-6 lg:pb-8">

                {/* HERO */}

                <section className="min-w-0 rounded-[18px] bg-[#FF5A36] px-4 py-5 text-white shadow-soft sm:px-7 sm:py-7">
                  <div className="min-w-0 max-w-[720px]">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                      Search ReMarket
                    </p>

                    <h1 className="mt-2 text-[24px] font-bold leading-tight sm:text-[30px]">
                      Find what you need
                    </h1>

                    <p className="mt-2 max-w-[520px] text-xs leading-5 text-white/80 sm:text-sm">
                      Discover products and local businesses around you.
                    </p>

                    <form
                      onSubmit={submitSearch}
                      className="mt-5 flex h-[48px] w-full min-w-0 items-center rounded-full bg-white p-1.5 shadow-sm"
                    >
                      <Search className="ml-2 h-[18px] w-[18px] shrink-0 text-gray-500 sm:ml-3" />

                      <input
                        value={query}
                        onChange={(event) =>
                          setQuery(event.target.value)
                        }
                        placeholder="What are you looking for?"
                        aria-label="Search products and businesses"
                        className="min-w-0 flex-1 bg-transparent px-2 text-[11px] text-gray-800 outline-none placeholder:text-gray-400 sm:px-3 sm:text-xs"
                      />

                      <button
                        type="submit"
                        className="flex h-[38px] shrink-0 items-center rounded-full bg-[#FF5A36] px-3 text-[11px] font-bold text-white transition hover:opacity-90 sm:px-5 sm:text-xs"
                      >
                        Search
                      </button>
                    </form>
                  </div>
                </section>

                {/* RESULTS HEADER */}

                <section className="mt-5 min-w-0">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-[#17202A]">
                        Search results
                      </h2>

                      <p className="mt-0.5 break-words text-xs text-muted">
                        {loading
                          ? "Finding products and local businesses..."
                          : `${totalProductResults} ${
                              totalProductResults === 1
                                ? "product"
                                : "products"
                            } · ${totalAdditionalBusinesses} additional ${
                              totalAdditionalBusinesses === 1
                                ? "business"
                                : "businesses"
                            }`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setShowFilters(true)
                      }
                      aria-label={`Open filters${
                        activeFilterCount > 0
                          ? `, ${activeFilterCount} active`
                          : ""
                      }`}
                      className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-[#FFB09B] hover:text-[#9F2D18] sm:w-auto"
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
                    <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                      {initialCategory && (
                        <button
                          type="button"
                          onClick={() =>
                            applyAppliedFilterChanges({
                              category: "",
                            })
                          }
                          className="flex max-w-full items-center gap-1.5 rounded-full bg-[#FFE0D6] px-3 py-1.5 text-[10px] font-semibold text-[#9F2D18]"
                        >
                          <span className="truncate">
                            {initialCategory}
                          </span>

                          <X className="h-3 w-3 shrink-0" />
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
                          className="flex max-w-full items-center gap-1.5 rounded-full bg-[#E9EDF0] px-3 py-1.5 text-[10px] font-semibold text-gray-700"
                        >
                          <span className="truncate">
                            {initialLocation}
                          </span>

                          <X className="h-3 w-3 shrink-0" />
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
                          {initialAvailability === "AVAILABLE"
                            ? "Available"
                            : initialAvailability === "ASK_SELLER"
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

                <section className="mt-5 min-w-0">

                  {/* LOADING */}

                  {loading && (
                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {Array.from(
                        { length: 8 },
                        (_, index) => index
                      ).map((item) => (
                        <div
                          key={item}
                          className="h-[280px] min-w-0 animate-pulse rounded-xl border border-[#E8E4DE] bg-white"
                        />
                      ))}
                    </div>
                  )}

                  {/* ERROR */}

                  {!loading && error && (
                    <div className="rounded-xl border border-[#E8E4DE] bg-white px-4 py-12 text-center sm:px-5">
                      <Search className="mx-auto h-8 w-8 text-gray-300" />

                      <p className="mt-3 text-sm font-semibold text-gray-700">
                        Search unavailable
                      </p>

                      <p className="mt-1 break-words text-xs text-gray-400">
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
                    !hasResults && (
                      <div className="rounded-xl border border-[#E8E4DE] bg-white px-4 py-12 text-center sm:px-5">
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

                  {/* PRODUCT RESULTS */}

                  {!loading &&
                    !error &&
                    displayedProducts.length > 0 && (
                      <div className="min-w-0">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-[#17202A]">
                            Products
                          </h3>

                          <span className="shrink-0 text-[10px] text-gray-400">
                            {totalProductResults} found
                          </span>
                        </div>

                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {displayedProducts.map(
                            (product) => {
                              const business =
                                product.business;

                              const image =
                                getProductImage(
                                  product
                                );

                              const businessCategory =
                                getBusinessCategory(
                                  business
                                );

                              const categoryBg =
                                getCategoryBackground(
                                  businessCategory
                                );

                              const saved =
                                savedBusinessIds.has(
                                  business.id
                                );

                              const productAvailability =
                                getAvailabilityStatus(
                                  product.availability
                                );

                              const verified =
                                business.verification ===
                                "VERIFIED";

                              return (
                                <article
                                  key={product.id}
                                  className="min-w-0 overflow-hidden rounded-xl border border-[#E8E4DE] bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                                >
                                  {/* PRODUCT IMAGE */}

                                  <div
                                    className="relative flex h-[175px] items-center justify-center overflow-hidden"
                                    style={{
                                      backgroundColor:
                                        categoryBg,
                                    }}
                                  >
                                    {image ? (
                                      <img
                                        src={image}
                                        alt={product.name}
                                        loading="lazy"
                                        className="absolute inset-0 h-full w-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/75 shadow-sm">
                                        <Package className="h-7 w-7 text-gray-600" />
                                      </div>
                                    )}

                                    <span
                                      className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[9px] font-semibold ${productAvailability.className}`}
                                    >
                                      {productAvailability.label}
                                    </span>

                                    <button
                                      type="button"
                                      aria-label={
                                        saved
                                          ? `Remove ${business.name} from saved businesses`
                                          : `Save ${business.name}`
                                      }
                                      aria-pressed={saved}
                                      onClick={() =>
                                        toggleSaved(
                                          business
                                        )
                                      }
                                      className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-sm transition ${
                                        saved
                                          ? "text-[#9F2D18]"
                                          : "text-gray-600 hover:text-[#9F2D18]"
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

                                  {/* PRODUCT DETAILS */}

                                  <div className="min-w-0 p-3.5">
                                    <p className="truncate text-[10px] font-medium text-gray-500">
                                      {product.category?.name ??
                                        businessCategory}
                                    </p>

                                    <h4 className="mt-1 line-clamp-2 min-h-[40px] break-words text-sm font-bold text-[#17202A]">
                                      {product.name}
                                    </h4>

                                    <p className="mt-2 break-words text-sm font-bold text-[#9F2D18]">
                                      {formatPrice(product)}
                                    </p>

                                    {product.description && (
                                      <p className="mt-1 line-clamp-2 break-words text-[10px] leading-4 text-gray-500">
                                        {product.description}
                                      </p>
                                    )}

                                    {/* SELLING BUSINESS */}

                                    <div className="mt-3 min-w-0 border-t border-[#F0ECE6] pt-3">
                                      <div className="flex min-w-0 items-center gap-2.5">
                                        <Link
                                          href={`/seller/${business.id}`}
                                          aria-label={`View ${business.name}`}
                                          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#ECE7E0] bg-[#FCFAF6]"
                                        >
                                          {business.imageUrl ? (
                                            <img
                                              src={business.imageUrl}
                                              alt=""
                                              loading="lazy"
                                              className="h-full w-full object-cover"
                                            />
                                          ) : (
                                            <Store className="h-4 w-4 text-gray-500" />
                                          )}
                                        </Link>

                                        <div className="min-w-0 flex-1">
                                          <Link
                                            href={`/seller/${business.id}`}
                                            className="block truncate text-[11px] font-bold text-gray-700 hover:text-[#9F2D18]"
                                          >
                                            {business.name}
                                          </Link>

                                          <p className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-gray-400">
                                            <MapPin className="h-3 w-3 shrink-0" />

                                            <span className="truncate">
                                              {business.location?.area ??
                                                "Local"}
                                            </span>
                                          </p>
                                        </div>

                                        {verified && (
                                          <span
                                            title="Verified business"
                                            aria-label="Verified business"
                                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#DDF5EA] text-[#137A59]"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                          </span>
                                        )}
                                      </div>

                                      <Link
                                        href={`/seller/${business.id}`}
                                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFF1ED] py-2.5 text-[11px] font-bold text-[#9F2D18] transition hover:bg-[#FFE6DF]"
                                      >
                                        View seller
                                        <ArrowRight className="h-3.5 w-3.5" />
                                      </Link>
                                    </div>
                                  </div>
                                </article>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}

                  {/* ADDITIONAL BUSINESS RESULTS */}

                  {!loading &&
                    !error &&
                    displayedBusinesses.length > 0 && (
                      <div
                        className={
                          displayedProducts.length > 0
                            ? "mt-8 min-w-0 border-t border-[#EAE6DF] pt-6"
                            : "min-w-0"
                        }
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-[#17202A]">
                            Businesses to explore
                          </h3>

                          <span className="shrink-0 text-[10px] text-gray-400">
                            {totalAdditionalBusinesses} found
                          </span>
                        </div>

                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {displayedBusinesses.map(
                            (business) => {
                              const businessCategory =
                                getBusinessCategory(
                                  business
                                );

                              const categoryBg =
                                getCategoryBackground(
                                  businessCategory
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

                              const availableProductCount =
                                (business.products ?? [])
                                  .filter(
                                    (product) =>
                                      product.availability ===
                                      "AVAILABLE"
                                  ).length;

                              const availabilityStatus =
                                getAvailabilityStatus(
                                  business.availability
                                );

                              const verified =
                                business.verification ===
                                "VERIFIED";

                              return (
                                <article
                                  key={business.id}
                                  className="min-w-0 overflow-hidden rounded-xl border border-[#E8E4DE] bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                                >
                                  {/* BUSINESS IMAGE */}

                                  <Link
                                    href={`/seller/${business.id}`}
                                    className="relative flex h-[120px] items-center justify-center overflow-hidden"
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

                                  {/* BUSINESS DETAILS */}

                                  <div className="min-w-0 p-3.5">
                                    <div className="flex min-w-0 items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <Link
                                          href={`/seller/${business.id}`}
                                          className="block truncate text-sm font-bold text-[#17202A] hover:text-[#9F2D18]"
                                        >
                                          {business.name}
                                        </Link>

                                        <p className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-muted">
                                          <span className="shrink-0 truncate">
                                            {businessCategory}
                                          </span>

                                          <span className="shrink-0">
                                            ·
                                          </span>

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
                                        onClick={() =>
                                          toggleSaved(
                                            business
                                          )
                                        }
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

                                    {/* VERIFICATION + PRODUCTS */}

                                    <div className="mt-3 flex min-w-0 items-center justify-between gap-2">
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
                                          {availableProductCount} available
                                        </span>
                                      </div>
                                    </div>

                                    {/* FIRST PRODUCT PREVIEW */}

                                    {firstProduct && (
                                      <div className="mt-3 min-w-0 border-t border-[#F0ECE6] pt-3">
                                        <div className="flex min-w-0 items-center gap-2.5">
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

                                          <div className="min-w-0 flex-1">
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
                      </div>
                    )}

                  {/* PAGINATION */}

                  {!loading &&
                    !error &&
                    hasResults &&
                    totalPages > 1 && (
                      <nav
                        aria-label="Search result pages"
                        className="mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-[#EAE6DF] pt-5"
                      >
                        <button
                          type="button"
                          disabled={currentPage <= 1}
                          onClick={() =>
                            navigateToPage(
                              currentPage - 1
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-[#FFB09B] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </button>

                        <span
                          aria-live="polite"
                          className="text-xs font-medium text-gray-500"
                        >
                          Page {currentPage} of {totalPages}
                        </span>

                        <button
                          type="button"
                          disabled={
                            currentPage >= totalPages
                          }
                          onClick={() =>
                            navigateToPage(
                              currentPage + 1
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-[#FFB09B] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </nav>
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

              <div className="absolute bottom-0 left-0 right-0 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[24px] border-t border-[#E8E4DE] bg-[#FFFDFC] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl sm:bottom-4 sm:left-auto sm:right-4 sm:top-4 sm:max-h-none sm:w-[380px] sm:rounded-[22px] sm:border sm:p-5">

                {/* DRAWER HEADER */}

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
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
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600"
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
                              active
                                ? ""
                                : item.name
                            )
                          }
                          className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-[11px] font-semibold transition sm:px-3 ${
                            active
                              ? "border-[#FFB09B] bg-[#FFF1ED] text-[#9F2D18]"
                              : "border-[#E8E4DE] bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                            style={{
                              backgroundColor:
                                item.bg,
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
                        setLocation(
                          event.target.value
                        )
                      }
                      placeholder="e.g. Ikeja"
                      className="h-11 w-full min-w-0 rounded-xl border border-[#E8E4DE] bg-white pl-10 pr-3 text-xs outline-none focus:border-[#FF9B82]"
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
                        setMinPrice(
                          event.target.value
                        )
                      }
                      inputMode="numeric"
                      placeholder="Min price"
                      aria-label="Minimum price"
                      className="h-11 min-w-0 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                    />

                    <input
                      id="search-max-price"
                      value={maxPrice}
                      onChange={(event) =>
                        setMaxPrice(
                          event.target.value
                        )
                      }
                      inputMode="numeric"
                      placeholder="Max price"
                      aria-label="Maximum price"
                      className="h-11 min-w-0 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
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
                        setAvailability(
                          event.target.value
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

                {/* VERIFIED BUSINESS TOGGLE */}

                <button
                  type="button"
                  aria-pressed={verified}
                  onClick={() =>
                    setVerified(!verified)
                  }
                  className={`mt-5 flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 sm:px-4 ${
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
                    onClick={() =>
                      router.push(item.href)
                    }
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

/**
 * ------------------------------------------------
 * SEARCH PAGE ENTRY POINT
 * ------------------------------------------------
 */

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh overflow-x-clip bg-[#FFF7ED]">
          <div className="mx-auto flex min-h-dvh w-full max-w-[1500px] items-center justify-center px-3 py-3 sm:px-5 sm:py-5">
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