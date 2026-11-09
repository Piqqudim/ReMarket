"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronDown,
  Check,
  Package,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  ArrowRight,
  ArrowUpDown,
  BadgeCheck,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

const PAGE_SIZE = 12;
const SAVED_ITEMS_CHANGED_EVENT = "remarket-saved-items-changed";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type SortMode = "relevance" | "newest" | "price-asc" | "price-desc";
type Category = ReMarketCategory;

type ListingImage = {
  id: string;
  url: string;
  publicId?: string | null;
  sortOrder: number;
};

type ListingCategory = {
  id: string;
  name: string;
  iconKey?: string;
  isActive?: boolean;
  sortOrder?: number;
} | null;

type ProductSellerContext = {
  verified: boolean;
  location: { area: string | null } | null;
};

type ProductSearchResult = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  stockQuantity: number | null;
  availability: Availability;
  imageUrl: string | null;
  images: ListingImage[];
  category: ListingCategory;
  keywords: string[];
  matchScore: number;
  seller: ProductSellerContext;
};

type SearchFilterValues = {
  query: string;
  category: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  availability: string;
  verified: boolean;
  sort: SortMode;
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
  initialSort: SortMode;
};

type SavedListingMaps = {
  products: Record<string, string>;
  services: Record<string, string>;
};

type SearchResultMeta = {
  totalProducts: number;
  returnedResults: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  maxResults: number;
  truncated: boolean;
  sort: SortMode;
};

/* -------------------------------------------------------------------------- */
/* GENERAL HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
}

function parseAvailability(value: unknown): Availability {
  if (
    value === "AVAILABLE" ||
    value === "ASK_SELLER" ||
    value === "UNAVAILABLE"
  ) {
    return value;
  }
  return "ASK_SELLER";
}

function parseSortMode(value: string | null): SortMode {
  if (
    value === "newest" ||
    value === "price-asc" ||
    value === "price-desc" ||
    value === "relevance"
  ) {
    return value;
  }
  return "relevance";
}

function parseCategory(value: unknown): ListingCategory {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    iconKey: cleanString(value.iconKey) ?? undefined,
    isActive:
      typeof value.isActive === "boolean"
        ? value.isActive
        : undefined,
    sortOrder:
      typeof value.sortOrder === "number"
        ? value.sortOrder
        : undefined,
  };
}

function parseImages(value: unknown): ListingImage[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.url !== "string" ||
      !item.url.trim()
    ) {
      return [];
    }

    return [{
      id: item.id,
      url: item.url,
      publicId: cleanString(item.publicId),
      sortOrder:
        typeof item.sortOrder === "number" ? item.sortOrder : 0,
    }];
  });
}

/*
 * The new search API intentionally returns only broad seller context:
 * verification and area. It does not return a business profile or name.
 */
function parseSellerContext(value: unknown): ProductSellerContext {
  if (!isRecord(value)) {
    return { verified: false, location: null };
  }

  const rawLocation = isRecord(value.location)
    ? value.location
    : null;

  return {
    verified: value.verified === true,
    location: rawLocation
      ? { area: cleanString(rawLocation.area) }
      : null,
  };
}

function parseSearchProduct(value: unknown): ProductSearchResult | null {
  if (!isRecord(value)) return null;

  const id = cleanString(value.id);
  const name = cleanString(value.name);
  if (!id || !name) return null;

  const price = parseNumber(value.price);
  const parsedOriginalPrice = parseNumber(value.originalPrice);
  const originalPrice =
    price !== null &&
    parsedOriginalPrice !== null &&
    parsedOriginalPrice > price
      ? parsedOriginalPrice
      : null;

  return {
    id,
    name,
    description: cleanString(value.description),
    price,
    originalPrice,
    stockQuantity: parseNumber(value.stockQuantity),
    availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl),
    images: parseImages(value.images),
    category: parseCategory(value.category),
    keywords: Array.isArray(value.keywords)
      ? value.keywords.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    matchScore: parseNumber(value.matchScore) ?? 0,
    seller: parseSellerContext(value.seller),
  };
}

function parseCategoryOptions(value: unknown): Category[] {
  if (!Array.isArray(value)) return [];

  const categories: ApiCategory[] = value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.name !== "string"
    ) {
      return [];
    }

    return [{
      id: item.id,
      name: item.name,
      iconKey: cleanString(item.iconKey),
      isActive:
        typeof item.isActive === "boolean" ? item.isActive : true,
      sortOrder:
        typeof item.sortOrder === "number"
          ? item.sortOrder
          : undefined,
    }];
  });

  return mergeCategories(categories);
}

function parseResultMeta(
  value: unknown,
  productCount: number,
  fallbackPage: number,
): SearchResultMeta {
  const meta = isRecord(value) ? value : {};
  const readInteger = (
    key: string,
    fallback: number,
    minimum = 0,
  ) => {
    const candidate = meta[key];
    return typeof candidate === "number" &&
      Number.isSafeInteger(candidate) &&
      candidate >= minimum
      ? candidate
      : fallback;
  };

  const totalProducts = readInteger(
    "totalProducts",
    productCount,
  );
  const pageSize = readInteger("pageSize", PAGE_SIZE, 1);
  const totalPages = readInteger(
    "totalPages",
    Math.max(1, Math.ceil(totalProducts / pageSize)),
    1,
  );
  const rawSort = meta.sort;

  return {
    totalProducts,
    returnedResults: readInteger("returnedResults", productCount),
    page: readInteger("page", fallbackPage, 1),
    pageSize,
    totalPages,
    hasMore: meta.hasMore === true,
    maxResults: readInteger("maxResults", 120, 1),
    truncated: meta.truncated === true,
    sort:
      rawSort === "newest" ||
      rawSort === "price-asc" ||
      rawSort === "price-desc" ||
      rawSort === "relevance"
        ? rawSort
        : "relevance",
  };
}

function getApiError(value: unknown): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : "Something went wrong. Please try again.";
}

/* -------------------------------------------------------------------------- */
/* PRICE AND PRODUCT DISPLAY HELPERS                                          */
/* -------------------------------------------------------------------------- */

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function getProductPrice(product: ProductSearchResult): string {
  return product.price !== null
    ? formatNaira(product.price)
    : "Price unavailable";
}

function getDiscountPercentage(
  price: number | null,
  originalPrice: number | null,
): number | null {
  if (
    price === null ||
    originalPrice === null ||
    originalPrice <= price
  ) {
    return null;
  }

  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

function getProductImage(product: ProductSearchResult): string | null {
  return product.images[0]?.url ?? product.imageUrl;
}

function getAvailabilityStatus(product: ProductSearchResult) {
  if (product.availability === "UNAVAILABLE") {
    return {
      label: "Out of stock",
      className: "bg-[#F3E8E8] text-[#9F2D18]",
    };
  }

  if (product.stockQuantity !== null && product.stockQuantity <= 0) {
    return {
      label: "Out of stock",
      className: "bg-[#F3E8E8] text-[#9F2D18]",
    };
  }

  if (product.availability === "AVAILABLE") {
    return {
      label:
        product.stockQuantity !== null
          ? `${product.stockQuantity} in stock`
          : "Available",
      className: "bg-[#DDF5EA] text-[#137A59]",
    };
  }

  return {
    label: "Confirm availability",
    className: "bg-[#FFF0C7] text-[#8A671D]",
  };
}

function getPositivePage(value: string | null): number {
  if (!value) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/* -------------------------------------------------------------------------- */
/* SEARCH PARAMETER HELPERS                                                   */
/* -------------------------------------------------------------------------- */

function buildSearchParams(
  values: SearchFilterValues,
  page = 1,
): URLSearchParams {
  const params = new URLSearchParams();

  if (values.query.trim()) params.set("q", values.query.trim());
  if (values.category.trim()) {
    params.set("category", values.category.trim());
  }
  if (values.location.trim()) {
    params.set("location", values.location.trim());
  }
  if (values.minPrice.trim()) {
    params.set("minPrice", values.minPrice.trim());
  }
  if (values.maxPrice.trim()) {
    params.set("maxPrice", values.maxPrice.trim());
  }
  if (values.availability) {
    params.set("availability", values.availability);
  }
  if (values.verified) params.set("verified", "true");

  // This page always uses the product-only search API contract.
  params.set("type", "product");
  params.set("pageSize", String(PAGE_SIZE));
  if (page > 1) params.set("page", String(page));
  if (values.sort !== "relevance") {
    params.set("sort", values.sort);
  }

  return params;
}

/* -------------------------------------------------------------------------- */
/* SAVED PRODUCT RESPONSE HELPERS                                             */
/* -------------------------------------------------------------------------- */

function getCollectionHint(key: string): "PRODUCT" | "SERVICE" | undefined {
  const normalized = key.toLowerCase();
  if (normalized.includes("product")) return "PRODUCT";
  if (normalized.includes("service")) return "SERVICE";
  return undefined;
}

function normalizeListingKind(
  value: unknown,
): "PRODUCT" | "SERVICE" | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized.includes("PRODUCT")) return "PRODUCT";
  if (normalized.includes("SERVICE")) return "SERVICE";
  return undefined;
}

/*
 * The saved endpoint may still return a mixed legacy response. We retain the
 * parser shape, but this page reads and changes product entries only.
 */
function parseSavedListingMaps(value: unknown): SavedListingMaps {
  const result: SavedListingMaps = {
    products: {},
    services: {},
  };
  const visited = new WeakSet<object>();

  function visit(
    item: unknown,
    inheritedKind?: "PRODUCT" | "SERVICE",
    collectionHint?: "PRODUCT" | "SERVICE",
  ) {
    if (!item || typeof item !== "object") return;
    if (visited.has(item as object)) return;
    visited.add(item as object);

    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, inheritedKind, collectionHint));
      return;
    }

    const record = item as Record<string, unknown>;
    const nestedProduct = isRecord(record.product) ? record.product : null;
    const nestedService = isRecord(record.service) ? record.service : null;
    const nestedSaved = isRecord(record.savedListing)
      ? record.savedListing
      : isRecord(record.savedItem)
        ? record.savedItem
        : isRecord(record.saved)
          ? record.saved
          : null;
    const nestedListing = isRecord(record.listing)
      ? record.listing
      : isRecord(record.item)
        ? record.item
        : null;

    const explicitKind = normalizeListingKind(
      record.type ??
        record.listingType ??
        record.entityType ??
        record.savedType,
    );
    const kind =
      explicitKind ??
      (nestedProduct ? "PRODUCT" : undefined) ??
      (nestedService ? "SERVICE" : undefined) ??
      inheritedKind ??
      collectionHint;

    const nestedEntity = nestedProduct ?? nestedService ?? nestedListing;
    const listingId =
      (kind === "PRODUCT" ? cleanString(record.productId) : null) ??
      (kind === "SERVICE" ? cleanString(record.serviceId) : null) ??
      cleanString(record.listingId) ??
      cleanString(record.entityId) ??
      cleanString(nestedEntity?.id) ??
      (kind ? cleanString(record.id) : null);

    const explicitSavedId =
      cleanString(nestedSaved?.id) ??
      cleanString(record.savedListingId) ??
      cleanString(record.savedItemId) ??
      cleanString(record.savedId);
    const recordId =
      explicitSavedId ??
      (listingId && cleanString(record.id) !== listingId
        ? cleanString(record.id)
        : null);

    if (kind && listingId && recordId && listingId !== recordId) {
      if (kind === "PRODUCT") result.products[listingId] = recordId;
      else result.services[listingId] = recordId;
    }

    for (const [key, child] of Object.entries(record)) {
      visit(child, kind, getCollectionHint(key) ?? kind);
    }
  }

  visit(value);
  return result;
}

function getCreatedSavedRecordId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.savedListing)) {
    return cleanString(value.savedListing.id);
  }
  if (isRecord(value.savedItem)) {
    return cleanString(value.savedItem.id);
  }
  if (isRecord(value.saved)) {
    return cleanString(value.saved.id);
  }
  return (
    cleanString(value.savedListingId) ??
    cleanString(value.savedItemId) ??
    cleanString(value.savedId)
  );
}

/* -------------------------------------------------------------------------- */
/* PRODUCT RESULT CARD                                                        */
/* -------------------------------------------------------------------------- */

function ProductResultCard({
  product,
  saved,
  saving,
  categoryBackground,
  onToggleSaved,
}: {
  product: ProductSearchResult;
  saved: boolean;
  saving: boolean;
  categoryBackground: string;
  onToggleSaved: (product: ProductSearchResult) => void;
}) {
  const image = getProductImage(product);
  const categoryName = product.category?.name ?? "Products";
  const availability = getAvailabilityStatus(product);
  const discount = getDiscountPercentage(
    product.price,
    product.originalPrice,
  );
  const productHref = `/product/${encodeURIComponent(product.id)}`;
  const area = product.seller.location?.area;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:border-[#FFB5A3] hover:shadow-lg hover:shadow-[#9F2D18]/5">
      <div
        className="relative aspect-square overflow-hidden"
        style={{ backgroundColor: categoryBackground }}
      >
        <Link
          href={productHref}
          aria-label={`View ${product.name}`}
          className="absolute inset-0"
        >
          {image ? (
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-11 w-11 text-[#C7BDB3]" />
            </div>
          )}
        </Link>

        <span
          className={`absolute left-2.5 top-2.5 max-w-[calc(100%-58px)] truncate rounded-full px-2.5 py-1 text-[9px] font-bold sm:left-3 sm:top-3 sm:text-[10px] ${availability.className}`}
        >
          {availability.label}
        </span>

        {discount !== null && (
          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-[#9F2D18] px-2 py-1 text-[9px] font-bold text-white sm:bottom-3 sm:left-3 sm:text-[10px]">
            -{discount}%
          </span>
        )}

        <button
          type="button"
          aria-label={
            saved
              ? `Remove ${product.name} from Saved`
              : `Save ${product.name}`
          }
          aria-pressed={saved}
          disabled={saving}
          onClick={() => onToggleSaved(product)}
          className={`absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-sm transition disabled:opacity-60 sm:right-3 sm:top-3 sm:h-9 sm:w-9 ${
            saved
              ? "text-[#FF5A36]"
              : "text-[#6F675F] hover:text-[#FF5A36]"
          }`}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bookmark
              className="h-4 w-4"
              fill={saved ? "currentColor" : "none"}
            />
          )}
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
        <p className="truncate text-[9px] font-bold uppercase tracking-wide text-[#9F2D18] sm:text-[10px]">
          {categoryName}
        </p>

        <Link
          href={productHref}
          className="mt-1 line-clamp-2 min-h-10 text-xs font-bold leading-5 text-[#292421] hover:text-[#9F2D18] sm:text-sm"
        >
          {product.name}
        </Link>

        <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-sm font-extrabold text-[#9F2D18] sm:text-base">
            {getProductPrice(product)}
          </p>
          {product.originalPrice !== null && (
            <p className="text-[10px] text-[#91877E] line-through sm:text-xs">
              {formatNaira(product.originalPrice)}
            </p>
          )}
        </div>

        {product.description && (
          <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[#81766D] sm:text-xs sm:leading-5">
            {product.description}
          </p>
        )}

        <div className="mt-auto border-t border-[#F0ECE6] pt-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 text-[9px] text-[#91877E] sm:text-[10px]">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{area ?? "Location not listed"}</span>
            </p>
            {product.seller.verified && (
              <span
                title="Verified seller"
                aria-label="Verified seller"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#DDF5EA] px-2 py-1 text-[9px] font-bold text-[#137A59]"
              >
                <BadgeCheck className="h-3 w-3" />
                Verified
              </span>
            )}
          </div>

          <Link
            href={productHref}
            className="mt-3 flex min-h-9 items-center justify-center gap-2 rounded-xl bg-[#FFF1ED] px-3 py-2 text-[10px] font-bold text-[#9F2D18] transition hover:bg-[#FFE0D6] sm:min-h-10 sm:text-xs"
          >
            View product
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* SEARCH PAGE URL                                                            */
/* -------------------------------------------------------------------------- */

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQuery = searchParams.get("q") ?? "";
  const initialCategory = searchParams.get("category") ?? "";
  const initialLocation = searchParams.get("location") ?? "";
  const initialMinPrice = searchParams.get("minPrice") ?? "";
  const initialMaxPrice = searchParams.get("maxPrice") ?? "";
  const initialAvailability = searchParams.get("availability") ?? "";
  const initialVerified = searchParams.get("verified") === "true";
  const initialPage = getPositivePage(searchParams.get("page"));
  const initialSort = parseSortMode(searchParams.get("sort"));
  const allSearchParams = searchParams.toString();

  const stableParams = new URLSearchParams(allSearchParams);
  stableParams.delete("page");
  const searchKey = stableParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(allSearchParams);
    let changed = false;

    // Old links may still carry type=service or type=all. This page is now
    // product-only, so normalize all search links to type=product.
    if (params.get("type") !== "product") {
      params.set("type", "product");
      changed = true;
    }

    const rawPage = params.get("page");
    if (rawPage !== null) {
      const parsedPage = Number(rawPage);
      if (
        !Number.isSafeInteger(parsedPage) ||
        parsedPage < 1
      ) {
        params.delete("page");
        changed = true;
      }
    }

    if (changed) {
      const queryString = params.toString();
      router.replace(
        queryString ? `/search?${queryString}` : "/search",
        { scroll: false },
      );
    }
  }, [allSearchParams, router]);

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
      initialSort={initialSort}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* SEARCH PAGE VIEW                                                           */
/* -------------------------------------------------------------------------- */

function SearchPageView({
  initialQuery,
  initialCategory,
  initialLocation,
  initialMinPrice,
  initialMaxPrice,
  initialAvailability,
  initialVerified,
  initialPage,
  initialSort,
}: SearchPageViewProps) {
  const router = useRouter();

  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [location, setLocation] = useState(initialLocation);
  const [minPrice, setMinPrice] = useState(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
  const [availability, setAvailability] = useState(initialAvailability);
  const [verified, setVerified] = useState(initialVerified);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [savedListings, setSavedListings] = useState<SavedListingMaps>({
    products: {},
    services: {},
  });
  const [savingListings, setSavingListings] = useState<Record<string, boolean>>({});
  const [saveFeedback, setSaveFeedback] = useState("");
  const [saveFeedbackError, setSaveFeedbackError] = useState(false);
  const [resultMeta, setResultMeta] = useState<SearchResultMeta>({
    totalProducts: 0,
    returnedResults: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
    hasMore: false,
    maxResults: 120,
    truncated: false,
    sort: initialSort,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const appliedFilters = useMemo<SearchFilterValues>(() => ({
    query: initialQuery,
    category: initialCategory,
    location: initialLocation,
    minPrice: initialMinPrice,
    maxPrice: initialMaxPrice,
    availability: initialAvailability,
    verified: initialVerified,
    sort: initialSort,
  }), [
    initialQuery,
    initialCategory,
    initialLocation,
    initialMinPrice,
    initialMaxPrice,
    initialAvailability,
    initialVerified,
    initialSort,
  ]);

  /* ------------------------------------------------------------------------ */
  /* NAVIGATION                                                               */
  /* ------------------------------------------------------------------------ */

  const navigateToSearch = useCallback((values: SearchFilterValues) => {
    const params = buildSearchParams(values, 1);
    const queryString = params.toString();
    router.push(
      queryString ? `/search?${queryString}` : "/search",
      { scroll: false },
    );
  }, [router]);

  const navigateToPage = useCallback((requestedPage: number, replace = false) => {
    const params = buildSearchParams(appliedFilters, requestedPage);
    const queryString = params.toString();
    const url = queryString ? `/search?${queryString}` : "/search";

    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }, [appliedFilters, router]);

  function applyAppliedFilterChanges(
    overrides: Partial<SearchFilterValues>,
  ) {
    navigateToSearch({ ...appliedFilters, ...overrides });
  }

  /* ------------------------------------------------------------------------ */
  /* PRODUCT CATEGORIES                                                       */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller = new AbortController();
    setCategories([]);
    setCategoriesLoading(true);

    async function loadCategories() {
      try {
        const response = await fetch("/api/categories?type=product", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Unable to load product categories.");
        }

        const data: unknown = await response.json();
        if (!isRecord(data)) {
          throw new Error("Invalid categories response.");
        }

        if (!controller.signal.aborted) {
          setCategories(parseCategoryOptions(data.categories));
        }
      } catch (categoryError) {
        if (controller.signal.aborted) return;
        console.error("Failed to load product categories:", categoryError);
        setCategories([]);
      } finally {
        if (!controller.signal.aborted) {
          setCategoriesLoading(false);
        }
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, []);

  /* ------------------------------------------------------------------------ */
  /* SAVED PRODUCTS                                                           */
  /* ------------------------------------------------------------------------ */

  const loadSavedListings = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/saved", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!response.ok) return null;

      const data: unknown = await response.json();
      const parsed = parseSavedListingMaps(data);
      if (!signal?.aborted) setSavedListings(parsed);
      return parsed;
    } catch (savedError) {
      if (
        savedError instanceof DOMException &&
        savedError.name === "AbortError"
      ) {
        return null;
      }
      console.error("Unable to load saved products:", savedError);
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refreshSaved = () => {
      void loadSavedListings();
    };

    void loadSavedListings(controller.signal);
    window.addEventListener(SAVED_ITEMS_CHANGED_EVENT, refreshSaved);
    window.addEventListener("storage", refreshSaved);

    return () => {
      controller.abort();
      window.removeEventListener(SAVED_ITEMS_CHANGED_EVENT, refreshSaved);
      window.removeEventListener("storage", refreshSaved);
    };
  }, [loadSavedListings]);

  /* ------------------------------------------------------------------------ */
  /* PRODUCT SEARCH RESULTS                                                   */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller = new AbortController();

    async function loadSearchResults() {
      setLoading(true);
      setError("");

      try {
        const params = buildSearchParams(
          appliedFilters,
          initialPage,
        );
        const queryString = params.toString();
        const response = await fetch(
          `/api/search?${queryString}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const data: unknown = await response.json();

        if (!response.ok) {
          throw new Error(getApiError(data));
        }
        if (!isRecord(data)) {
          throw new Error("The search API returned an invalid response.");
        }
        if (controller.signal.aborted) return;

        const rawProducts = Array.isArray(data.products)
          ? data.products
          : [];
        const parsedProducts = rawProducts
          .map(parseSearchProduct)
          .filter(
            (item): item is ProductSearchResult => item !== null,
          );

        const parsedMeta = parseResultMeta(
          data.resultMeta,
          parsedProducts.length,
          initialPage,
        );

        setProducts(parsedProducts);
        setResultMeta(parsedMeta);
      } catch (searchError) {
        if (
          searchError instanceof DOMException &&
          searchError.name === "AbortError"
        ) {
          return;
        }

        console.error("Product search loading error:", searchError);
        setProducts([]);
        setResultMeta({
          totalProducts: 0,
          returnedResults: 0,
          page: 1,
          pageSize: PAGE_SIZE,
          totalPages: 1,
          hasMore: false,
          maxResults: 120,
          truncated: false,
          sort: initialSort,
        });
        setError(
          searchError instanceof Error && searchError.message
            ? searchError.message
            : "We couldn't complete your search right now.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSearchResults();
    return () => controller.abort();
  }, [
    appliedFilters,
    initialPage,
    initialSort,
    retryCount,
  ]);

  /* ------------------------------------------------------------------------ */
  /* SEARCH AND FILTER ACTIONS                                                */
  /* ------------------------------------------------------------------------ */

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateToSearch({
      ...appliedFilters,
      query,
      category,
      location,
      minPrice,
      maxPrice,
      availability,
      verified,
    });
  }

  function applyFilters() {
    navigateToSearch({
      ...appliedFilters,
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

  function closeFilters() {
    setCategory(initialCategory);
    setLocation(initialLocation);
    setMinPrice(initialMinPrice);
    setMaxPrice(initialMaxPrice);
    setAvailability(initialAvailability);
    setVerified(initialVerified);
    setShowFilters(false);
  }

  function clearFilters() {
    setQuery(initialQuery);
    setCategory("");
    setLocation("");
    setMinPrice("");
    setMaxPrice("");
    setAvailability("");
    setVerified(false);
    navigateToSearch({
      ...appliedFilters,
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

  /* ------------------------------------------------------------------------ */
  /* SAVE / UNSAVE PRODUCT                                                    */
  /* ------------------------------------------------------------------------ */

  const toggleSavedProduct = useCallback(async (
    product: ProductSearchResult,
  ) => {
    const key = `PRODUCT:${product.id}`;
    if (savingListings[key]) return;

    setSaveFeedback("");
    setSaveFeedbackError(false);
    setSavingListings((current) => ({
      ...current,
      [key]: true,
    }));

    try {
      const currentSavedId = savedListings.products[product.id];

      if (currentSavedId) {
        const response = await fetch(
          `/api/saved/${encodeURIComponent(currentSavedId)}`,
          {
            method: "DELETE",
            cache: "no-store",
            headers: { Accept: "application/json" },
          },
        );
        const data: unknown = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          router.push(
            `/buyer/login?callbackUrl=${encodeURIComponent("/search")}`,
          );
          return;
        }
        if (!response.ok) throw new Error(getApiError(data));

        setSavedListings((current) => {
          const next = {
            products: { ...current.products },
            services: { ...current.services },
          };
          delete next.products[product.id];
          return next;
        });
        setSaveFeedback(`${product.name} removed from Saved.`);
      } else {
        const response = await fetch("/api/saved", {
          method: "POST",
          cache: "no-store",
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
          router.push(
            `/buyer/login?callbackUrl=${encodeURIComponent("/search")}`,
          );
          return;
        }

        if (response.status === 409) {
          const refreshed = await loadSavedListings();
          if (refreshed?.products[product.id]) {
            setSaveFeedback(`${product.name} is already in Saved.`);
            return;
          }
        }

        if (!response.ok) throw new Error(getApiError(data));

        let createdId = getCreatedSavedRecordId(data);
        if (!createdId) {
          const refreshed = await loadSavedListings();
          createdId = refreshed?.products[product.id] ?? null;
        }

        if (createdId) {
          setSavedListings((current) => ({
            ...current,
            products: {
              ...current.products,
              [product.id]: createdId!,
            },
          }));
        }
        setSaveFeedback(`${product.name} added to Saved.`);
      }

      window.dispatchEvent(new Event(SAVED_ITEMS_CHANGED_EVENT));
    } catch (saveError) {
      console.error("Unable to update saved product:", saveError);
      setSaveFeedbackError(true);
      setSaveFeedback(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update Saved.",
      );
    } finally {
      setSavingListings((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, [
    loadSavedListings,
    router,
    savedListings,
    savingListings,
  ]);

  /* ------------------------------------------------------------------------ */
  /* SERVER PAGINATION                                                        */
  /* ------------------------------------------------------------------------ */

  const totalPages = Math.max(1, resultMeta.totalPages);
  const currentPage = Math.min(
    Math.max(1, initialPage),
    totalPages,
  );
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + products.length;
  const hasResults = products.length > 0;

  useEffect(() => {
    if (loading || currentPage === initialPage) return;
    navigateToPage(currentPage, true);
  }, [
    loading,
    currentPage,
    initialPage,
    navigateToPage,
  ]);

  const activeFilterCount =
    Number(Boolean(initialCategory)) +
    Number(Boolean(initialLocation)) +
    Number(Boolean(initialMinPrice)) +
    Number(Boolean(initialMaxPrice)) +
    Number(Boolean(initialAvailability)) +
    Number(initialVerified);

  function getCategoryBackground(categoryName: string): string {
    const normalized = categoryName.toLowerCase();
    return (
      categories.find(
        (item) => item.name.toLowerCase() === normalized,
      )?.bg ??
      DEFAULT_CATEGORIES.find(
        (item) => item.name.toLowerCase() === normalized,
      )?.bg ??
      "#EEF1F4"
    );
  }

  const resultSummary = `${resultMeta.totalProducts.toLocaleString("en-NG")} ${
    resultMeta.totalProducts === 1 ? "product" : "products"
  } found`;

  /* ------------------------------------------------------------------------ */
  /* PAGE UI                                                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-dvh bg-[#FFF7ED]">
      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-[calc(100dvh-66px)] overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10"
      >
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-8 xl:px-10">
          {/* SEARCH INTRO */}
          <section className="relative overflow-hidden rounded-[24px] border border-[#FFE0D5] bg-gradient-to-r from-[#FFF0E7] via-[#FFF5EE] to-[#FFE4D9] px-5 py-6 sm:px-8 sm:py-8">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-24 hidden h-64 w-64 rounded-full bg-[#FF5A36]/10 sm:block"
            />
            <div className="relative z-10 max-w-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9F2D18]">
                ReMarket product search
              </p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#401B13] sm:text-4xl">
                Find what you need
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66564C] sm:text-base">
                Search products nearby, compare prices and check availability
                before choosing what to buy.
              </p>

              <form
                onSubmit={submitSearch}
                role="search"
                className="mt-5 flex h-[52px] w-full max-w-2xl items-center rounded-2xl border border-[#F0D8CE] bg-white p-1.5 shadow-sm focus-within:border-[#FF9A81] focus-within:ring-2 focus-within:ring-[#FF5A36]/10"
              >
                <Search
                  className="ml-3 h-5 w-5 shrink-0 text-[#81766C]"
                  aria-hidden="true"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search products, names or categories..."
                  aria-label="Search products"
                  maxLength={100}
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#17202A] outline-none placeholder:text-[#91877E]"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search text"
                    className="mr-1 flex h-8 w-8 items-center justify-center rounded-full text-[#91877E] hover:bg-[#FCFAF6]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-xs font-bold text-white transition hover:bg-[#E94A28] sm:px-5"
                >
                  Search
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          </section>

          {/* PRODUCT CATEGORY CHIPS */}
          {categories.length > 0 && (
            <section aria-label="Product categories" className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-xs font-bold text-[#514840]">
                  Browse categories
                </h2>
                {initialCategory && (
                  <button
                    type="button"
                    onClick={() =>
                      applyAppliedFilterChanges({ category: "" })
                    }
                    className="text-[10px] font-semibold text-[#9F2D18] hover:underline"
                  >
                    Clear category
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  aria-pressed={!initialCategory}
                  onClick={() =>
                    applyAppliedFilterChanges({ category: "" })
                  }
                  className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${
                    !initialCategory
                      ? "border-[#FF5A36] bg-[#FF5A36] text-white"
                      : "border-[#EAE6DF] bg-white text-[#514840] hover:border-[#FF9A81]"
                  }`}
                >
                  All categories
                </button>
                {categories.map((item) => {
                  const active =
                    initialCategory.toLowerCase() ===
                    item.name.toLowerCase();
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        applyAppliedFilterChanges({
                          category: active ? "" : item.name,
                        })
                      }
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-[#FF5A36] bg-[#FFF0EB] text-[#9F2D18]"
                          : "border-[#EAE6DF] bg-white text-[#514840] hover:border-[#FF9A81]"
                      }`}
                    >
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ backgroundColor: item.bg }}
                      >
                        <Icon className="h-3 w-3" />
                      </span>
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {categoriesLoading && (
            <p className="mt-3 text-[11px] text-[#91877E]">
              Loading product categories...
            </p>
          )}

          {/* RESULTS HEADER, SORT AND FILTERS */}
          <section className="mt-6 min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold tracking-tight text-[#401B13] sm:text-2xl">
                  Products
                </h2>
                <p className="mt-1 text-xs text-[#756B61] sm:text-sm">
                  {loading ? "Searching products..." : resultSummary}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 text-xs text-[#514840] sm:flex-none">
                  <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-[#91877E]" />
                  <span className="shrink-0 font-semibold">Sort:</span>
                  <select
                    value={initialSort}
                    onChange={(event) =>
                      applyAppliedFilterChanges({
                        sort: event.target.value as SortMode,
                      })
                    }
                    aria-label="Sort products"
                    className="min-w-0 flex-1 appearance-none bg-transparent py-2 pr-4 font-semibold outline-none sm:flex-none"
                  >
                    <option value="relevance">Best match</option>
                    <option value="newest">Newest</option>
                    <option value="price-asc">Price: low to high</option>
                    <option value="price-desc">Price: high to low</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-[#91877E]" />
                </label>

                <button
                  type="button"
                  onClick={() => setShowFilters(true)}
                  aria-label={`Open filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""}`}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-xs font-bold text-[#514840] transition hover:border-[#FF9A81] hover:text-[#9F2D18]"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A36] px-1.5 text-[10px] text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {saveFeedback && (
              <div
                role={saveFeedbackError ? "alert" : "status"}
                className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
                  saveFeedbackError
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-[#FFD9CE] bg-[#FFF1ED] text-[#9F2D18]"
                }`}
              >
                <span>{saveFeedback}</span>
                <button
                  type="button"
                  onClick={() => setSaveFeedback("")}
                  aria-label="Dismiss saved message"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {!loading && !error && resultMeta.truncated && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-[#F1D7A7] bg-[#FFF8E8] px-4 py-3 text-xs leading-5 text-[#76551A]"
              >
                More than {resultMeta.maxResults} products match these filters.
                This search currently sorts a limited set of the newest matches.
                Add a category, location or price filter to narrow your results.
              </div>
            )}
          </section>

          {/* PRODUCT RESULTS */}
          <section className="mt-5 min-w-0">
            {loading && (
              <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 10 }, (_, index) => (
                  <div
                    key={index}
                    className="h-[280px] animate-pulse rounded-2xl border border-[#EAE6DF] bg-white sm:h-[340px]"
                  />
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-12 text-center">
                <Search className="mx-auto h-9 w-9 text-red-400" />
                <h3 className="mt-3 text-sm font-bold text-red-800">
                  Search unavailable
                </h3>
                <p className="mt-2 text-xs leading-5 text-red-700">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => setRetryCount((value) => value + 1)}
                  className="mt-5 rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]"
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && !error && !hasResults && (
              <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-14 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm">
                  <Package className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-[#17202A]">
                  No products found
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#756B61]">
                  Try another product name or adjust your category, location or
                  price filters.
                </p>
                <button
                  type="button"
                  onClick={() => setShowFilters(true)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white"
                >
                  Adjust filters
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {!loading && !error && products.length > 0 && (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#17202A]">
                    {initialQuery
                      ? `Results for “${initialQuery}”`
                      : "Explore products"}
                  </h3>
                  <span className="text-[10px] text-[#91877E]">
                    Showing {pageStart + 1}–{pageEnd} of {resultMeta.totalProducts.toLocaleString("en-NG")}
                  </span>
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {products.map((product) => (
                    <ProductResultCard
                      key={product.id}
                      product={product}
                      saved={Boolean(savedListings.products[product.id])}
                      saving={Boolean(savingListings[`PRODUCT:${product.id}`])}
                      categoryBackground={getCategoryBackground(
                        product.category?.name ?? "Products",
                      )}
                      onToggleSaved={(item) => {
                        void toggleSavedProduct(item);
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            {!loading && !error && resultMeta.totalPages > 1 && (
              <nav
                aria-label="Product search result pages"
                className="mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-[#EAE6DF] pt-5"
              >
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => navigateToPage(currentPage - 1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-[#6F675F] transition hover:border-[#FFB09B] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <span
                  aria-live="polite"
                  className="text-xs font-medium text-[#756B61]"
                >
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages || !resultMeta.hasMore}
                  onClick={() => navigateToPage(currentPage + 1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-[#6F675F] transition hover:border-[#FFB09B] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            )}

            {!loading && !error && resultMeta.totalProducts > 0 && (
              <p className="mt-4 text-center text-[10px] text-[#91877E]">
                {resultMeta.totalProducts.toLocaleString("en-NG")} matching products
              </p>
            )}
          </section>

          <footer className="mt-10 flex items-center justify-center gap-3 pb-3 text-[10px] text-[#9B9188]">
            <span className="h-px w-12 bg-[#EAE6DF]" />
            <span>ReMarket · Find it nearby</span>
            <span className="h-px w-12 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>

      {/* FILTER DRAWER */}
      {showFilters && (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            aria-label="Close filters"
            onClick={closeFilters}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="search-filters-title"
            className="absolute bottom-0 left-0 right-0 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[24px] border-t border-[#E8E4DE] bg-[#FFFDFC] p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:bottom-4 sm:left-auto sm:right-4 sm:top-4 sm:max-h-none sm:w-[390px] sm:rounded-[22px] sm:border sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  id="search-filters-title"
                  className="text-base font-extrabold text-[#17202A]"
                >
                  Product filters
                </h2>
                <p className="mt-0.5 text-[11px] text-[#81766D]">
                  Narrow down your product results
                </p>
              </div>
              <button
                type="button"
                onClick={closeFilters}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FCFAF6] text-[#6F675F] hover:bg-[#FFF1ED]"
                aria-label="Close filters"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* CATEGORY */}
            <div className="mt-6">
              <label className="text-xs font-bold text-[#514840]">
                Category
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {categories.map((item) => {
                  const Icon = item.icon;
                  const active =
                    category.toLowerCase() === item.name.toLowerCase();

                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setCategory(active ? "" : item.name)
                      }
                      className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-[11px] font-semibold transition ${
                        active
                          ? "border-[#FFB09B] bg-[#FFF1ED] text-[#9F2D18]"
                          : "border-[#E8E4DE] bg-white text-[#514840] hover:bg-[#FCFAF6]"
                      }`}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: item.bg }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {item.name}
                      </span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
                {categories.length === 0 && (
                  <p className="col-span-2 text-[11px] text-[#91877E]">
                    No product categories are available.
                  </p>
                )}
              </div>
            </div>

            {/* LOCATION */}
            <div className="mt-5">
              <label
                htmlFor="search-location-filter"
                className="text-xs font-bold text-[#514840]"
              >
                Location
              </label>
              <div className="relative mt-2">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91877E]" />
                <input
                  id="search-location-filter"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="e.g. Ikeja"
                  maxLength={100}
                  className="h-11 w-full min-w-0 rounded-xl border border-[#E8E4DE] bg-white pl-10 pr-3 text-xs text-[#292421] outline-none focus:border-[#FF9B82]"
                />
              </div>
            </div>

            {/* PRICE */}
            <div className="mt-5">
              <label
                htmlFor="search-min-price"
                className="text-xs font-bold text-[#514840]"
              >
                Price range (₦)
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  id="search-min-price"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                  inputMode="numeric"
                  placeholder="Min price"
                  aria-label="Minimum price"
                  className="h-11 w-full min-w-0 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs text-[#292421] outline-none focus:border-[#FF9B82]"
                />
                <input
                  id="search-max-price"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  inputMode="numeric"
                  placeholder="Max price"
                  aria-label="Maximum price"
                  className="h-11 w-full min-w-0 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs text-[#292421] outline-none focus:border-[#FF9B82]"
                />
              </div>
            </div>

            {/* AVAILABILITY */}
            <div className="mt-5">
              <label
                htmlFor="search-availability"
                className="text-xs font-bold text-[#514840]"
              >
                Availability
              </label>
              <div className="relative mt-2">
                <select
                  id="search-availability"
                  value={availability}
                  onChange={(event) => setAvailability(event.target.value)}
                  className="h-11 w-full appearance-none rounded-xl border border-[#E8E4DE] bg-white px-3 pr-9 text-xs text-[#514840] outline-none focus:border-[#FF9B82]"
                >
                  <option value="">Any availability</option>
                  <option value="AVAILABLE">Available now</option>
                  <option value="ASK_SELLER">Confirm availability</option>
                  <option value="UNAVAILABLE">Out of stock</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91877E]" />
              </div>
            </div>

            {/* VERIFIED SELLERS */}
            <button
              type="button"
              aria-pressed={verified}
              onClick={() => setVerified((current) => !current)}
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
                  <BadgeCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-bold text-[#514840]">
                    Verified sellers
                  </p>
                  <p className="mt-0.5 text-[10px] text-[#91877E]">
                    Show products from verified sellers only
                  </p>
                </div>
              </div>
              <div
                className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  verified ? "bg-[#FF5A36]" : "bg-gray-200"
                }`}
              >
                <div
                  className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    verified ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </div>
            </button>

            <div className="mt-6 flex gap-2 border-t border-[#EAE6DF] pt-5">
              <button
                type="button"
                onClick={clearFilters}
                className="flex-1 rounded-xl border border-[#E8E4DE] bg-white py-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="flex-[1.5] rounded-xl bg-[#FF5A36] py-3 text-xs font-bold text-white transition hover:bg-[#E94A28]"
              >
                Apply filters
              </button>
            </div>
          </section>
        </div>
      )}

      <MobileBottomNav />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PAGE EXPORT                                                                */
/* -------------------------------------------------------------------------- */

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-[#FFF7ED]">
          <SiteHeader searchMode="PRODUCTS" />
          <main className="flex min-h-[60dvh] items-center justify-center bg-[#FFFDFC] px-4 pb-24">
            <div className="flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-5 py-4 text-xs text-[#756B61] shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-[#FF5A36]" />
              Loading product search...
            </div>
          </main>
          <MobileBottomNav />
        </div>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
