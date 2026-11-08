"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Filter,
  Heart,
  Loader2,
  MapPin,
  Package,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  ShoppingBag,
  Store,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import {
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

/* =========================================================
   TYPES
========================================================= */

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type SortOption = "NEWEST" | "PRICE_LOW" | "PRICE_HIGH" | "NAME";

type ProductImage = {
  id?: string;
  url: string;
  sortOrder: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: Availability;
  imageUrl: string | null;
  images: ProductImage[];
  createdAt: string | null;
  category: {
    id: string;
    name: string;
  } | null;
  seller: {
    id: string;
    name: string;
    verification: string | null;
    verified: boolean;
    location: {
      area: string;
      street: string | null;
    } | null;
  };
};

type ShopPageViewProps = {
  initialQuery: string;
  initialCategory: string;
  initialLocation: string;
  initialMinPrice: string;
  initialMaxPrice: string;
  initialAvailability: string;
  initialVerified: boolean;
  initialPage: number;
};

type SavedProductMap = Record<string, string>;

const PAGE_SIZE = 12;
const MAX_CLIENT_RESULTS = 50;

/* =========================================================
   GENERAL HELPERS
========================================================= */

function StoreIcon() {
  return <Store className="h-3.5 w-3.5" aria-hidden="true" />;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  // Prisma Decimal values may arrive through JSON as numeric strings.
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseApiCategories(value: unknown): ApiCategory[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => ({
      id: cleanString(item.id) ?? "",
      name: cleanString(item.name) ?? "",
      iconKey: cleanString(item.iconKey),
      isActive: item.isActive !== false,
      sortOrder:
        typeof item.sortOrder === "number" &&
        Number.isFinite(item.sortOrder)
          ? item.sortOrder
          : undefined,
    }))
    .filter((item) => item.id.length > 0 && item.name.length > 0);
}

function parseAvailability(value: unknown): Availability {
  if (
    value === "AVAILABLE" ||
    value === "UNAVAILABLE" ||
    value === "ASK_SELLER"
  ) {
    return value;
  }
  return "ASK_SELLER";
}

function parseCategory(value: unknown): Product["category"] {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  return { id: value.id, name: value.name };
}

/*
 * Both /api/search and /api/recent-products currently return the
 * seller profile under `seller`. Some older endpoints may return
 * the internal owner relation under `business`, so accept either shape
 * while keeping the public Shop experience focused on products.
 */
function parseProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null;

  const rawSeller = isRecord(value.seller)
    ? value.seller
    : isRecord(value.business)
      ? value.business
      : null;

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !rawSeller
  ) {
    return null;
  }

  const seller = rawSeller;

  if (
    typeof seller.id !== "string" ||
    typeof seller.name !== "string"
  ) {
    return null;
  }

  const rawImages = Array.isArray(value.images) ? value.images : [];
  const images: ProductImage[] = rawImages
    .filter(isRecord)
    .map((image) => ({
      id: typeof image.id === "string" ? image.id : undefined,
      url: typeof image.url === "string" ? image.url : "",
      sortOrder: typeof image.sortOrder === "number" ? image.sortOrder : 0,
    }))
    .filter((image) => image.url.length > 0);

  const location = isRecord(seller.location) ? seller.location : null;
  const verification =
    typeof seller.verification === "string" ? seller.verification : null;

  return {
    id: value.id,
    name: value.name,
    description: cleanString(value.description),
    price: parseOptionalNumber(value.price),
    priceMin: parseOptionalNumber(value.priceMin),
    priceMax: parseOptionalNumber(value.priceMax),
    availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl) ?? images[0]?.url ?? null,
    images,
    createdAt:
      cleanString(value.createdAt) ?? cleanString(value.updatedAt),
    category: parseCategory(value.category),
    seller: {
      id: seller.id,
      name: seller.name,
      verification,
      verified:
        seller.verified === true || verification === "VERIFIED",
      location: location
        ? {
            area: cleanString(location.area) ?? "Local",
            street: cleanString(location.street),
          }
        : null,
    },
  };
}

function formatNaira(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`;
}

function formatPrice(product: Product): string {
  if (product.price !== null) return formatNaira(product.price);

  if (product.priceMin !== null && product.priceMax !== null) {
    if (product.priceMin === product.priceMax) {
      return formatNaira(product.priceMin);
    }

    return `${formatNaira(product.priceMin)} – ${formatNaira(product.priceMax)}`;
  }

  if (product.priceMin !== null) {
    return `From ${formatNaira(product.priceMin)}`;
  }

  if (product.priceMax !== null) {
    return `Up to ${formatNaira(product.priceMax)}`;
  }

  return "Ask seller";
}

function getSortablePrice(product: Product): number {
  return (
    product.price ??
    product.priceMin ??
    product.priceMax ??
    Number.POSITIVE_INFINITY
  );
}

function getAvailabilityLabel(availability: Availability): string {
  switch (availability) {
    case "AVAILABLE":
      return "Available";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return "Ask seller";
  }
}

function getAvailabilityStyle(availability: Availability): string {
  switch (availability) {
    case "AVAILABLE":
      return "bg-[#DCFCE7] text-[#166534]";
    case "UNAVAILABLE":
      return "bg-[#FEE2E2] text-[#B42318]";
    default:
      return "bg-[#FEF3C7] text-[#92400E]";
  }
}

function parsePage(value: string | null): number {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

function parseAvailabilityFilter(value: string): Availability | "" {
  if (
    value === "AVAILABLE" ||
    value === "ASK_SELLER" ||
    value === "UNAVAILABLE"
  ) {
    return value;
  }
  return "";
}

/* =========================================================
   URL HELPERS
========================================================= */

type ShopFilters = {
  query: string;
  category: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  availability: string;
  verified: boolean;
};

function buildShopUrl(filters: ShopFilters, page: number): string {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  const category = filters.category.trim();
  const location = filters.location.trim();

  if (query) params.set("q", query);
  if (category) params.set("category", category);
  if (location) params.set("location", location);
  if (filters.minPrice.trim()) {
    params.set("minPrice", filters.minPrice.trim());
  }
  if (filters.maxPrice.trim()) {
    params.set("maxPrice", filters.maxPrice.trim());
  }
  if (filters.availability) {
    params.set("availability", filters.availability);
  }
  if (filters.verified) params.set("verified", "true");
  if (page > 1) params.set("page", String(page));

  const queryString = params.toString();
  return queryString ? `/shop?${queryString}` : "/shop";
}

/* =========================================================
   SAVED PRODUCT RESPONSE HELPERS
========================================================= */

/*
 * Reads the current /api/saved response:
 * { items: [{ id, type: "PRODUCT", listing: { id } }] }
 *
 * Legacy response shapes are also accepted for compatibility.
 * The returned value is always the SavedListing ID required by DELETE.
 */
function parseSavedProductMap(value: unknown): SavedProductMap {
  if (!isRecord(value)) return {};

  const possibleArrays = [
    value.items,
    value.savedListings,
    value.savedProducts,
    value.products,
    value.saved,
  ];

  const result: SavedProductMap = {};

  for (const collection of possibleArrays) {
    if (!Array.isArray(collection)) continue;

    for (const item of collection) {
      if (!isRecord(item)) continue;

      // Current API response shape.
      if (item.type === "PRODUCT" && isRecord(item.listing)) {
        const productId = cleanString(item.listing.id);
        const savedListingId = cleanString(item.id);

        if (productId && savedListingId) {
          result[productId] = savedListingId;
        }

        continue;
      }

      // Older response shapes retained for migration compatibility.
      const nestedProduct = isRecord(item.product) ? item.product : null;

      const productId =
        cleanString(item.productId) ??
        cleanString(item.listingId) ??
        (nestedProduct ? cleanString(nestedProduct.id) : null);

      const savedListingId =
        cleanString(item.savedListingId) ??
        cleanString(item.savedId) ??
        (productId ? cleanString(item.id) : null);

      if (productId && savedListingId) {
        result[productId] = savedListingId;
      }
    }
  }

  return result;
}

function getSavedRecordId(value: unknown): string | null {
  if (!isRecord(value)) return null;

  // Current POST response: { item: { id, productId, serviceId } }.
  if (isRecord(value.item)) {
    const id = cleanString(value.item.id);
    if (id) return id;
  }

  if (isRecord(value.savedListing)) {
    return cleanString(value.savedListing.id);
  }

  if (isRecord(value.saved)) {
    return cleanString(value.saved.id);
  }

  return cleanString(value.savedListingId) ?? cleanString(value.savedId);
}

/* =========================================================
   PAGE SEARCH PARAMS
========================================================= */

function ShopPageContent() {
  const searchParams = useSearchParams();

  const initialQuery = searchParams.get("q") ?? "";
  const initialCategory = searchParams.get("category") ?? "";
  const initialLocation = searchParams.get("location") ?? "";
  const initialMinPrice = searchParams.get("minPrice") ?? "";
  const initialMaxPrice = searchParams.get("maxPrice") ?? "";

  const initialAvailability = parseAvailabilityFilter(
    searchParams.get("availability") ?? "",
  );

  const initialVerified = searchParams.get("verified") === "true";
  const initialPage = parsePage(searchParams.get("page"));

  const pageKey = [
    initialQuery,
    initialCategory,
    initialLocation,
    initialMinPrice,
    initialMaxPrice,
    initialAvailability,
    String(initialVerified),
    String(initialPage),
  ].join("|");

  return (
    <ShopPageView
      key={pageKey}
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

/* =========================================================
   MAIN SHOP PAGE
========================================================= */

function ShopPageView({
  initialQuery,
  initialCategory,
  initialLocation,
  initialMinPrice,
  initialMaxPrice,
  initialAvailability,
  initialVerified,
  initialPage,
}: ShopPageViewProps) {
  const router = useRouter();

  /* FILTER STATE */
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [location, setLocation] = useState(initialLocation);
  const [minPrice, setMinPrice] = useState(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
  const [availability, setAvailability] = useState(initialAvailability);
  const [verified, setVerified] = useState(initialVerified);
  const [sortBy, setSortBy] = useState<SortOption>("NEWEST");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  /* DATA STATE */
  // Start empty so service-only/default categories are never shown in Shop.
  // The product categories are loaded from the product-filtered API below.
  const [categories, setCategories] = useState<ReMarketCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);
  const [resultsTruncated, setResultsTruncated] = useState(false);
  const [serverPagination, setServerPagination] = useState(false);
  const [serverTotalPages, setServerTotalPages] = useState(1);

  /* SAVED PRODUCT STATE */
  const [savedProducts, setSavedProducts] = useState<SavedProductMap>({});
  const [savingProductIds, setSavingProductIds] = useState<
    Record<string, boolean>
  >({});
  const [saveFeedback, setSaveFeedback] = useState("");
  const [saveFeedbackError, setSaveFeedbackError] = useState(false);

  /* LOAD CATEGORIES */
  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch("/api/categories?type=product", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load product categories.");
        }

        const data: unknown = await response.json();

        if (!isRecord(data)) {
          throw new Error("Invalid category response.");
        }

        const backendCategories = parseApiCategories(data.categories);
        const merged = mergeCategories(backendCategories);

        // Replace the list even when it is empty. Keeping default categories
        // here could expose categories that have no matching products.
        if (!controller.signal.aborted) {
          setCategories(merged);
        }
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error("Shop product-category loading error:", loadError);

        if (!controller.signal.aborted) {
          setCategories([]);
        }
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, []);

  /* LOAD ALL SAVED PRODUCTS FROM THE DATABASE */
  async function loadSavedProducts(
    signal?: AbortSignal,
  ): Promise<SavedProductMap> {
    const combined: SavedProductMap = {};

    try {
      const firstResponse = await fetch(
        "/api/saved?type=PRODUCT&page=1&limit=50",
        {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal,
        },
      );

      if (firstResponse.status === 401 || firstResponse.status === 403) {
        if (!signal?.aborted) {
          setSavedProducts({});
        }
        return {};
      }

      if (!firstResponse.ok) {
        throw new Error("Unable to load saved products.");
      }

      const firstData: unknown = await firstResponse.json();

      Object.assign(combined, parseSavedProductMap(firstData));

      const pagination =
        isRecord(firstData) && isRecord(firstData.pagination)
          ? firstData.pagination
          : null;

      const totalPages =
        pagination &&
        typeof pagination.totalPages === "number" &&
        Number.isInteger(pagination.totalPages) &&
        pagination.totalPages > 0
          ? Math.min(pagination.totalPages, 1000)
          : 1;

      // Fetch additional pages in small batches. The API caps page size at 50.
      for (
        let firstPage = 2;
        firstPage <= totalPages;
        firstPage += 4
      ) {
        if (signal?.aborted) return combined;

        const pages = Array.from(
          { length: Math.min(4, totalPages - firstPage + 1) },
          (_, index) => firstPage + index,
        );

        const pageMaps = await Promise.all(
          pages.map(async (pageNumber) => {
            const response = await fetch(
              `/api/saved?type=PRODUCT&page=${pageNumber}&limit=50`,
              {
                method: "GET",
                cache: "no-store",
                headers: { Accept: "application/json" },
                signal,
              },
            );

            if (!response.ok) {
              throw new Error("Unable to load all saved products.");
            }

            const data: unknown = await response.json();
            return parseSavedProductMap(data);
          }),
        );

        for (const pageMap of pageMaps) {
          Object.assign(combined, pageMap);
        }
      }

      if (!signal?.aborted) {
        setSavedProducts(combined);
      }

      return combined;
    } catch (loadError) {
      if (
        loadError instanceof DOMException &&
        loadError.name === "AbortError"
      ) {
        return combined;
      }

      console.error("Saved products loading error:", loadError);

      if (!signal?.aborted && Object.keys(combined).length > 0) {
        setSavedProducts(combined);
      }

      return combined;
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    void loadSavedProducts(controller.signal);

    return () => controller.abort();
  }, []);

  /* LOAD PRODUCTS */
  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setLoading(true);
      setError("");

      const hasFilters = Boolean(
        initialQuery.trim() ||
          initialCategory ||
          initialLocation ||
          initialMinPrice ||
          initialMaxPrice ||
          initialAvailability ||
          initialVerified,
      );

      const useSearchApi = hasFilters;
      const useServerPagination = !useSearchApi && sortBy === "NEWEST";

      setServerPagination(useServerPagination);

      try {
        let endpoint = "";

        if (useSearchApi) {
          const params = new URLSearchParams();

          // Shop displays products only. Asking the search API
          // for product results avoids running an unnecessary
          // service search for every Shop filter request.
          params.set("type", "product");

          if (initialQuery.trim()) {
            params.set("q", initialQuery.trim());
          }

          if (initialCategory.trim()) {
            // The search API filters by the active category name.
            params.set("category", initialCategory.trim());
          }

          if (initialLocation.trim()) {
            params.set("location", initialLocation.trim());
          }

          if (initialMinPrice.trim()) {
            params.set("minPrice", initialMinPrice.trim());
          }

          if (initialMaxPrice.trim()) {
            params.set("maxPrice", initialMaxPrice.trim());
          }

          if (initialAvailability) {
            params.set("availability", initialAvailability);
          }

          if (initialVerified) {
            params.set("verified", "true");
          }

          endpoint = `/api/search?${params.toString()}`;
        } else {
          const params = new URLSearchParams();

          if (useServerPagination) {
            params.set("page", String(initialPage));
            params.set("pageSize", String(PAGE_SIZE));
          } else {
            params.set("page", "1");
            params.set("pageSize", String(MAX_CLIENT_RESULTS));
          }

          endpoint = `/api/recent-products?${params.toString()}`;
        }

        const response = await fetch(endpoint, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        const data: unknown = await response.json();

        if (!response.ok) {
          const message =
            isRecord(data) && typeof data.error === "string"
              ? data.error
              : "Unable to load products.";

          throw new Error(message);
        }

        if (!isRecord(data)) {
          throw new Error("The products API returned an invalid response.");
        }

        const rawProducts = Array.isArray(data.products) ? data.products : [];

        const parsedProducts = rawProducts
          .map(parseProduct)
          .filter((item): item is Product => item !== null);

        if (controller.signal.aborted) return;

        setProducts(parsedProducts);

        if (useSearchApi) {
          const resultMeta = isRecord(data.resultMeta)
            ? data.resultMeta
            : null;

          const reportedTotal =
            resultMeta && typeof resultMeta.totalProducts === "number"
              ? resultMeta.totalProducts
              : parsedProducts.length;

          setTotalProducts(
            Number.isFinite(reportedTotal)
              ? Math.max(0, reportedTotal)
              : parsedProducts.length,
          );

          setResultsTruncated(resultMeta?.truncated === true);

          setServerTotalPages(
            Math.max(1, Math.ceil(parsedProducts.length / PAGE_SIZE)),
          );
        } else {
          const reportedTotal =
            typeof data.total === "number"
              ? data.total
              : parsedProducts.length;

          const reportedPages =
            typeof data.totalPages === "number"
              ? data.totalPages
              : Math.max(1, Math.ceil(reportedTotal / PAGE_SIZE));

          setTotalProducts(
            Number.isFinite(reportedTotal)
              ? Math.max(0, reportedTotal)
              : parsedProducts.length,
          );

          setServerTotalPages(Math.max(1, reportedPages));

          setResultsTruncated(
            !useServerPagination && reportedTotal > parsedProducts.length,
          );
        }
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error("Products loading error:", loadError);

        setProducts([]);
        setTotalProducts(0);
        setServerTotalPages(1);
        setResultsTruncated(false);

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load products. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => controller.abort();
  }, [
    initialQuery,
    initialCategory,
    initialLocation,
    initialMinPrice,
    initialMaxPrice,
    initialAvailability,
    initialVerified,
    initialPage,
    sortBy,
  ]);

  /* SORT PRODUCTS */
  const sortedProducts = useMemo(() => {
    const result = [...products];

    switch (sortBy) {
      case "PRICE_LOW":
        result.sort((a, b) => getSortablePrice(a) - getSortablePrice(b));
        break;

      case "PRICE_HIGH":
        result.sort((a, b) => getSortablePrice(b) - getSortablePrice(a));
        break;

      case "NAME":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;

      case "NEWEST":
      default:
        break;
    }

    return result;
  }, [products, sortBy]);

  /* PAGINATION */
  const totalPages = serverPagination
    ? serverTotalPages
    : Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));

  const currentPage = Math.min(Math.max(1, initialPage), totalPages);

  const visibleProducts = serverPagination
    ? sortedProducts
    : sortedProducts.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      );

  const resultStart =
    visibleProducts.length > 0
      ? (currentPage - 1) * PAGE_SIZE + 1
      : 0;

  const resultEnd =
    resultStart > 0
      ? resultStart + visibleProducts.length - 1
      : 0;

  /* FILTER URL ACTIONS */
  function getCurrentFilters(): ShopFilters {
    return {
      query,
      category,
      location,
      minPrice,
      maxPrice,
      availability,
      verified,
    };
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildShopUrl(getCurrentFilters(), 1));
  }

  function applyFilters() {
    router.push(buildShopUrl(getCurrentFilters(), 1));
    setShowMobileFilters(false);
  }

  function selectCategory(nextCategory: string) {
    setCategory(nextCategory);

    router.push(
      buildShopUrl(
        { ...getCurrentFilters(), category: nextCategory },
        1,
      ),
    );
  }

  function clearFilters() {
    setQuery("");
    setCategory("");
    setLocation("");
    setMinPrice("");
    setMaxPrice("");
    setAvailability("");
    setVerified(false);
    setSortBy("NEWEST");
    setShowMobileFilters(false);

    router.push("/shop");
  }

  function goToPage(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return;

    router.push(buildShopUrl(getCurrentFilters(), page));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* SAVE / UNSAVE PRODUCT */
  async function toggleSavedProduct(product: Product) {
    if (savingProductIds[product.id]) return;

    setSaveFeedback("");
    setSaveFeedbackError(false);

    setSavingProductIds((current) => ({
      ...current,
      [product.id]: true,
    }));

    try {
      const savedRecordId = savedProducts[product.id];

      if (savedRecordId) {
        const response = await fetch(
          `/api/saved/${encodeURIComponent(savedRecordId)}`,
          {
            method: "DELETE",
            cache: "no-store",
            headers: { Accept: "application/json" },
          },
        );

        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            isRecord(data) && typeof data.error === "string"
              ? data.error
              : "Unable to remove this saved product.";

          throw new Error(message);
        }

        setSavedProducts((current) => {
          const next = { ...current };
          delete next[product.id];
          return next;
        });

        setSaveFeedback("Product removed from Saved.");
      } else {
        const response = await fetch("/api/saved", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            type: "PRODUCT",
            listingId: product.id,
          }),
        });

        const data: unknown = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          throw new Error("Sign in to save products.");
        }

        if (!response.ok) {
          const message =
            isRecord(data) && typeof data.error === "string"
              ? data.error
              : "Unable to save this product.";

          throw new Error(message);
        }

        const createdRecordId = getSavedRecordId(data);

        if (createdRecordId) {
          setSavedProducts((current) => ({
            ...current,
            [product.id]: createdRecordId,
          }));
        } else {
          await loadSavedProducts();
        }

        const alreadySaved =
          isRecord(data) && data.alreadySaved === true;

        setSaveFeedback(
          alreadySaved
            ? "This product is already in Saved."
            : "Product added to Saved.",
        );
      }
    } catch (saveError) {
      console.error("Save product action error:", saveError);

      setSaveFeedbackError(true);

      setSaveFeedback(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update your saved products.",
      );
    } finally {
      setSavingProductIds((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }
  }

  /* FILTER CONTROLS */
  function renderFilterControls() {
    return (
      <div className="space-y-5">
        <div>
          <label
            htmlFor="shop-category"
            className="mb-2 block text-xs font-bold text-[#17202A]"
          >
            Category
          </label>

          <select
            id="shop-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF9A81] focus:ring-2 focus:ring-[#FF5A36]/10"
          >
            <option value="">All categories</option>

            {categories.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="shop-location"
            className="mb-2 block text-xs font-bold text-[#17202A]"
          >
            Area or neighbourhood
          </label>

          <div className="relative">
            <MapPin
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9087]"
              aria-hidden="true"
            />

            <input
              id="shop-location"
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Ogba, Ikeja"
              maxLength={100}
              className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white pl-9 pr-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF9A81] focus:ring-2 focus:ring-[#FF5A36]/10"
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-[#17202A]">
            Price range
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="shop-min-price"
                className="mb-1 block text-[10px] text-[#756B61]"
              >
                Minimum
              </label>

              <input
                id="shop-min-price"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
                placeholder="₦ Min"
                className="h-11 w-full min-w-0 rounded-xl border border-[#EAE6DF] bg-white px-2.5 text-sm text-[#17202A] outline-none focus:border-[#FF9A81] focus:ring-2 focus:ring-[#FF5A36]/10"
              />
            </div>

            <div>
              <label
                htmlFor="shop-max-price"
                className="mb-1 block text-[10px] text-[#756B61]"
              >
                Maximum
              </label>

              <input
                id="shop-max-price"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                placeholder="₦ Max"
                className="h-11 w-full min-w-0 rounded-xl border border-[#EAE6DF] bg-white px-2.5 text-sm text-[#17202A] outline-none focus:border-[#FF9A81] focus:ring-2 focus:ring-[#FF5A36]/10"
              />
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="shop-availability"
            className="mb-2 block text-xs font-bold text-[#17202A]"
          >
            Availability
          </label>

          <select
            id="shop-availability"
            value={availability}
            onChange={(event) =>
              setAvailability(
                parseAvailabilityFilter(event.target.value),
              )
            }
            className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3 text-sm text-[#17202A] outline-none focus:border-[#FF9A81] focus:ring-2 focus:ring-[#FF5A36]/10"
          >
            <option value="">Any availability</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASK_SELLER">Ask seller</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#EAE6DF] bg-white p-3">
          <input
            type="checkbox"
            checked={verified}
            onChange={(event) => setVerified(event.target.checked)}
            className="h-4 w-4 accent-[#FF5A36]"
          />

          <span>
            <span className="block text-xs font-semibold text-[#17202A]">
              Verified sellers only
            </span>

            <span className="mt-0.5 block text-[10px] text-[#756B61]">
              Show products from verified sellers.
            </span>
          </span>
        </label>

        <div className="space-y-2 border-t border-[#EAE6DF] pt-4">
          <button
            type="button"
            onClick={applyFilters}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#E94A28]"
          >
            Apply filters
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={clearFilters}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-xs font-semibold text-[#756B61] transition hover:bg-[#FCFAF6]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Clear filters
          </button>
        </div>
      </div>
    );
  }

  const activeFilterCount = [
    category,
    location,
    minPrice,
    maxPrice,
    availability,
    verified ? "VERIFIED" : "",
  ].filter(Boolean).length;

  /* RENDER */
  return (
    <>
      <SiteHeader />

      <main
        id="main-content"
        className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10"
      >
        <div className="mx-auto max-w-[1600px] px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-8 xl:px-10">
          {/* PAGE INTRODUCTION */}
          <section className="relative overflow-hidden rounded-[24px] border border-[#FFE0D5] bg-gradient-to-r from-[#FFF0E7] via-[#FFF5EE] to-[#FFE4D9] px-5 py-6 sm:px-8 sm:py-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-24 hidden h-64 w-64 rounded-full bg-[#FF5A36]/10 sm:block"
            />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD1C5] bg-white/75 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9F2D18]">
                <Package
                  className="h-3.5 w-3.5 text-[#FF5A36]"
                  aria-hidden="true"
                />
                ReMarket Products
              </div>

              <h1 className="mt-3 text-[27px] font-extrabold leading-tight tracking-tight text-[#401B13] sm:text-4xl">
                Find Products Nearby
              </h1>

              <p className="mt-2 max-w-[570px] text-sm leading-6 text-[#66564C] sm:text-base">
                Discover products from sellers near you. Compare prices and
                find what you need on ReMarket.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-[#7A6255]">
                <span className="inline-flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5 text-[#FF5A36]" />
                  Local products
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#FF5A36]" />
                  Area-based discovery
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-3.5 w-3.5 text-[#FF5A36]" />
                  Verified sellers
                </span>
              </div>
            </div>
          </section>

          {/* SEARCH AND FILTER TOOLBAR */}
          <section className="mt-6">
            <form
              onSubmit={submitSearch}
              role="search"
              className="flex h-[52px] w-full items-center rounded-2xl border border-[#EAE6DF] bg-white p-1.5 shadow-[0_3px_14px_rgba(23,32,42,0.035)] transition focus-within:border-[#FF9A81] focus-within:ring-2 focus-within:ring-[#FF5A36]/10"
            >
              <Search
                className="ml-3 h-5 w-5 shrink-0 text-[#81766C]"
                aria-hidden="true"
              />

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="What product are you looking for?"
                aria-label="Search products"
                className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#17202A] outline-none placeholder:text-[#91877E]"
              />

              <button
                type="submit"
                disabled={!query.trim()}
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-xs font-bold text-white transition hover:bg-[#E94A28] disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search</span>
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowMobileFilters(true)}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3.5 py-2 text-xs font-bold text-[#514840] transition hover:border-[#FF9A81] hover:text-[#9F2D18] lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters

                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A36] px-1.5 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="product-sort"
                  className="whitespace-nowrap text-[11px] font-medium text-[#756B61]"
                >
                  Sort by
                </label>

                <select
                  id="product-sort"
                  value={sortBy}
                  onChange={(event) => {
                    setSortBy(event.target.value as SortOption);

                    if (initialPage !== 1) {
                      router.push(buildShopUrl(getCurrentFilters(), 1));
                    }
                  }}
                  className="h-10 max-w-[175px] rounded-xl border border-[#EAE6DF] bg-white px-3 text-xs font-semibold text-[#17202A] outline-none focus:border-[#FF9A81]"
                >
                  <option value="NEWEST">Recently added</option>
                  <option value="PRICE_LOW">Price: Low to High</option>
                  <option value="PRICE_HIGH">Price: High to Low</option>
                  <option value="NAME">Product name</option>
                </select>
              </div>
            </div>
          </section>

          {/* CATEGORY CHIPS */}
          <section aria-label="Product categories" className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#514840]">
                Browse categories
              </h2>

              {category && (
                <button
                  type="button"
                  onClick={() => selectCategory("")}
                  className="text-[10px] font-semibold text-[#9F2D18] hover:underline"
                >
                  Clear category
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                aria-pressed={!category}
                onClick={() => selectCategory("")}
                className={`flex min-h-10 shrink-0 items-center rounded-full border px-4 py-2 text-xs font-bold transition ${
                  !category
                    ? "border-[#FF5A36] bg-[#FF5A36] text-white"
                    : "border-[#EAE6DF] bg-white text-[#514840] hover:border-[#FF9A81] hover:text-[#9F2D18]"
                }`}
              >
                All products
              </button>

              {categories.map((item) => {
                const active =
                  category.trim().toLowerCase() ===
                  item.name.trim().toLowerCase();

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      selectCategory(active ? "" : item.name)
                    }
                    className={`flex min-h-10 shrink-0 items-center rounded-full border px-4 py-2 text-xs font-semibold transition ${
                      active
                        ? "border-[#FF5A36] bg-[#FFF0EB] text-[#9F2D18]"
                        : "border-[#EAE6DF] bg-white text-[#514840] hover:border-[#FF9A81] hover:text-[#9F2D18]"
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          </section>

          {/* MAIN CONTENT AND SIDEBAR */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <div className="sticky top-[105px] rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter
                      className="h-4 w-4 text-[#FF5A36]"
                      aria-hidden="true"
                    />
                    <h2 className="text-sm font-bold text-[#17202A]">
                      Filters
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-[10px] font-semibold text-[#9F2D18] hover:underline"
                  >
                    Clear all
                  </button>
                </div>

                {renderFilterControls()}
              </div>
            </aside>

            {/* PRODUCT RESULTS */}
            <section className="min-w-0">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight text-[#401B13] sm:text-2xl">
                    {category || "All Products"}
                  </h2>

                  <p className="mt-1 text-xs text-[#756B61] sm:text-sm">
                    {loading
                      ? "Finding products..."
                      : error
                        ? "Products could not be loaded."
                        : `${totalProducts.toLocaleString("en-NG")} ${
                            totalProducts === 1 ? "product" : "products"
                          } found`}
                  </p>
                </div>

                {totalPages > 1 && !loading && (
                  <span className="text-[10px] font-semibold text-[#756B61]">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
              </div>

              {saveFeedback && (
                <div
                  role="status"
                  className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
                    saveFeedbackError
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-[#FFD9CE] bg-[#FFF1ED] text-[#9F2D18]"
                  }`}
                >
                  <span>{saveFeedback}</span>

                  <button
                    type="button"
                    onClick={() => setSaveFeedback("")}
                    aria-label="Dismiss message"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {loading && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={`product-loading-${index}`}
                      className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white"
                      aria-hidden="true"
                    >
                      <div className="aspect-square animate-pulse bg-[#F0ECE7]" />

                      <div className="space-y-2 p-3">
                        <div className="h-3 w-4/5 animate-pulse rounded bg-[#F0ECE7]" />
                        <div className="h-3 w-2/5 animate-pulse rounded bg-[#F0ECE7]" />
                        <div className="h-2.5 w-3/5 animate-pulse rounded bg-[#F0ECE7]" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-10 text-center">
                  <Package className="mx-auto h-9 w-9 text-red-400" />

                  <h3 className="mt-3 text-sm font-bold text-red-800">
                    We couldn't load products.
                  </h3>

                  <p className="mt-2 text-xs leading-5 text-red-700">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() => router.refresh()}
                    className="mt-5 rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28]"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!loading && !error && visibleProducts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm">
                    <Search className="h-7 w-7" />
                  </div>

                  <h3 className="mt-4 text-sm font-bold text-[#17202A]">
                    No products found
                  </h3>

                  <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#756B61]">
                    Try another search, choose a different category or remove
                    some filters.
                  </p>

                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28]"
                  >
                    Clear filters
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {!loading && !error && visibleProducts.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {visibleProducts.map((product) => {
                      const isSaved = Boolean(savedProducts[product.id]);
                      const isSaving = Boolean(savingProductIds[product.id]);
                      const imageUrl =
                        product.imageUrl ?? product.images[0]?.url ?? null;
                      const area =
                        product.seller.location?.area ?? "Local";

                      return (
                        <article
                          key={product.id}
                          className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_4px_16px_rgba(23,32,42,0.035)] transition duration-200 hover:-translate-y-1 hover:border-[#FFD0C3] hover:shadow-[0_12px_28px_rgba(23,32,42,0.09)]"
                        >
                          <div className="relative aspect-square overflow-hidden bg-[#FCFAF6]">
                            <Link
                              href={`/product/${encodeURIComponent(product.id)}`}
                              aria-label={`View ${product.name}`}
                              className="absolute inset-0"
                            >
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={product.name}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[#C3B9AE]">
                                  <Package className="h-12 w-12" />
                                </div>
                              )}
                            </Link>

                            <button
                              type="button"
                              aria-label={
                                isSaved
                                  ? `Remove ${product.name} from Saved`
                                  : `Save ${product.name}`
                              }
                              aria-pressed={isSaved}
                              disabled={isSaving}
                              onClick={() => {
                                void toggleSavedProduct(product);
                              }}
                              className={`absolute right-2.5 top-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/95 shadow-sm transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 ${
                                isSaved
                                  ? "text-[#FF5A36]"
                                  : "text-[#756B61] hover:text-[#FF5A36]"
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Heart
                                  className="h-[18px] w-[18px]"
                                  fill={isSaved ? "currentColor" : "none"}
                                />
                              )}
                            </button>

                            <span
                              className={`absolute bottom-2.5 left-2.5 rounded-full px-2.5 py-1 text-[9px] font-bold shadow-sm ${getAvailabilityStyle(
                                product.availability,
                              )}`}
                            >
                              {getAvailabilityLabel(product.availability)}
                            </span>
                          </div>

                          <div className="flex flex-1 flex-col p-3 sm:p-3.5">
                            {product.category && (
                              <p className="mb-1 truncate text-[9px] font-bold uppercase tracking-[0.1em] text-[#9F2D18]">
                                {product.category.name}
                              </p>
                            )}

                            <Link
                              href={`/product/${encodeURIComponent(product.id)}`}
                              className="line-clamp-2 min-h-10 text-xs font-bold leading-5 text-[#17202A] transition hover:text-[#9F2D18] sm:text-sm"
                            >
                              {product.name}
                            </Link>

                            <p className="mt-2 text-sm font-extrabold text-[#9F2D18] sm:text-base">
                              {formatPrice(product)}
                            </p>

                            <div className="mt-3 flex min-w-0 items-center gap-1.5 border-t border-[#F0ECE7] pt-3">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0EB] text-[#9F2D18]">
                                <StoreIcon />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-1 text-[10px] font-semibold text-[#514840] sm:text-[11px]">
                                  <span className="truncate">
                                    {product.seller.name}
                                  </span>

                                  {product.seller.verified && (
                                    <BadgeCheck
                                      className="h-3.5 w-3.5 shrink-0 text-[#2196C5]"
                                      aria-label="Verified seller"
                                    />
                                  )}
                                </div>

                                <p className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-[#91877E]">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  {area}
                                </p>
                              </div>
                            </div>

                            <Link
                              href={`/product/${encodeURIComponent(product.id)}`}
                              className="mt-3 flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-[#FFF1ED] px-3 py-2 text-[10px] font-bold text-[#9F2D18] transition hover:bg-[#FFE0D6] sm:text-xs"
                            >
                              View product
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {resultsTruncated && (
                    <div className="mt-5 rounded-xl border border-[#F2E3C9] bg-[#FFFAF0] px-4 py-3 text-xs leading-5 text-[#785B25]">
                      {serverPagination
                        ? `Only the first ${products.length} products are loaded for this sorting view. Use search or filters to narrow the results.`
                        : "Your search has more matches than the current results limit. Narrow your search or apply additional filters to find more specific results."}
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EAE6DF] bg-white p-3 sm:px-4">
                      <p className="text-[10px] text-[#756B61] sm:text-xs">
                        Showing {resultStart}–{resultEnd}
                        {resultsTruncated
                          ? " of the loaded results"
                          : ` of ${totalProducts.toLocaleString("en-NG")}`}
                      </p>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => goToPage(currentPage - 1)}
                          disabled={currentPage <= 1}
                          aria-label="Previous page"
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#EAE6DF] text-[#9F2D18] transition hover:bg-[#FFF1ED] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>

                        <span className="min-w-[74px] text-center text-xs font-bold text-[#17202A]">
                          {currentPage} / {totalPages}
                        </span>

                        <button
                          type="button"
                          onClick={() => goToPage(currentPage + 1)}
                          disabled={currentPage >= totalPages}
                          aria-label="Next page"
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#EAE6DF] text-[#9F2D18] transition hover:bg-[#FFF1ED] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          <footer className="mt-10 flex items-center justify-center gap-3 pb-3 text-[10px] text-[#9B9188]">
            <span className="h-px w-12 bg-[#EAE6DF]" />
            <span>ReMarket · Find it nearby</span>
            <span className="h-px w-12 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>

      {/* MOBILE FILTER SHEET */}
      {showMobileFilters && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4 lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowMobileFilters(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-filter-heading"
            className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[24px] bg-[#FFFDFC] p-5 shadow-2xl sm:rounded-[24px]"
          >
            <div className="mb-5 flex items-center justify-between border-b border-[#EAE6DF] pb-4">
              <div>
                <h2
                  id="mobile-filter-heading"
                  className="text-lg font-extrabold text-[#17202A]"
                >
                  Filter products
                </h2>

                <p className="mt-1 text-xs text-[#756B61]">
                  Narrow your product search.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                aria-label="Close filters"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FCFAF6] text-[#756B61] hover:bg-[#FFF1ED] hover:text-[#9F2D18]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {renderFilterControls()}
          </section>
        </div>
      )}

      <MobileBottomNav />
    </>
  );
}

/* PAGE ENTRY */
export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <>
          <SiteHeader />

          <main className="min-h-dvh bg-[#FFFDFC] px-4 pb-28 pt-8">
            <div className="mx-auto max-w-[1600px]">
              <div className="h-32 animate-pulse rounded-2xl bg-[#F0ECE7]" />

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={`fallback-${index}`}
                    className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white"
                  >
                    <div className="aspect-square animate-pulse bg-[#F0ECE7]" />

                    <div className="space-y-2 p-3">
                      <div className="h-3 w-4/5 animate-pulse rounded bg-[#F0ECE7]" />
                      <div className="h-3 w-2/5 animate-pulse rounded bg-[#F0ECE7]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </main>

          <MobileBottomNav />
        </>
      }
    >
      <ShopPageContent />
    </Suspense>
  );
}