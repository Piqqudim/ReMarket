"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Heart,
  Loader2,
  MapPin,
  Package,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import AreaAutocomplete, {
  type AreaSelection,
} from "@/components/filters/AreaAutocomplete";
import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

const PAGE_SIZE = 12;
const MAX_SEARCH_RESULTS = 120;
const MAX_SEARCH_PAGE = 100_000;
const MAX_PRICE_VALUE = 1_000_000_000;
const SAVED_ITEMS_CHANGED_EVENT = "remarket-saved-items-changed";
const CART_CHANGED_EVENT = "remarket-cart-changed";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type SortMode = "relevance" | "newest" | "price-asc" | "price-desc";

type Category = ReMarketCategory & {
  parentId: string | null;
  imageUrl: string | null;
  sortOrder: number;
};

type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

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
  id: string;
  name: string;
  verified: boolean;
  location: {
    area: string | null;
    lga: string | null;
    state: string | null;
  } | null;
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
  categoryId: string;
  state: string;
  lga: string;
  area: string;
  minPrice: string;
  maxPrice: string;
  availability: string;
  verified: boolean;
  sort: SortMode;
};

type SearchPageViewProps = {
  initialQuery: string;
  initialCategory: string;
  initialCategoryId: string;
  initialState: string;
  initialLga: string;
  initialArea: string;
  initialMinPrice: string;
  initialMaxPrice: string;
  initialAvailability: string;
  initialVerified: boolean;
  initialPage: number;
  initialSort: SortMode;
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

type LocationFilterOptions = {
  states: string[];
  lgasByState: Record<string, string[]>;
};

type RawCategory = {
  id: string;
  name: string;
  iconKey: string | null;
  isActive: boolean;
  sortOrder: number;
  parentId: string | null;
  imageUrl: string | null;
};

type SaveFeedback = {
  message: string;
  error: boolean;
} | null;

type CartFeedback = {
  productId: string;
  message: string;
  error: boolean;
} | null;

/* -------------------------------------------------------------------------- */
/* GENERAL HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function isValidPriceFilterInput(rawValue: string): boolean {
  const raw = rawValue.trim();
  if (!raw) return true;
  if (!/^\d+$/.test(raw)) return false;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_PRICE_VALUE;
}

function parseAvailability(value: unknown): Availability {
  return value === "AVAILABLE" || value === "ASK_SELLER" || value === "UNAVAILABLE"
    ? value
    : "ASK_SELLER";
}

function parseSortMode(value: string | null): SortMode {
  return value === "newest" || value === "price-asc" || value === "price-desc" || value === "relevance"
    ? value
    : "relevance";
}

function parseAvailabilityFilter(value: string): Availability | "" {
  return value === "AVAILABLE" || value === "ASK_SELLER" || value === "UNAVAILABLE"
    ? value
    : "";
}

function getPositivePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_SEARCH_PAGE ? parsed : 1;
}

function getApiError(value: unknown): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : "Something went wrong. Please try again.";
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function getDiscountPercentage(price: number | null, originalPrice: number | null): number | null {
  if (price === null || price <= 0 || originalPrice === null || originalPrice <= price) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

/* -------------------------------------------------------------------------- */
/* CATEGORY HELPERS                                                           */
/* -------------------------------------------------------------------------- */

function parseCategoryOptions(payload: unknown): Category[] {
  if (!isRecord(payload)) return [];
  const source = Array.isArray(payload.navigationCategories) && payload.navigationCategories.length > 0
    ? payload.navigationCategories
    : payload.categories;
  if (!Array.isArray(source)) return [];

  const rows: RawCategory[] = [];
  const visited = new Set<string>();

  function visit(items: unknown[], inheritedParentId: string | null = null) {
    for (const raw of items) {
      if (!isRecord(raw)) continue;
      const id = cleanString(raw.id);
      const name = cleanString(raw.name);
      if (!id || !name || visited.has(id)) continue;
      visited.add(id);
      rows.push({
        id,
        name,
        iconKey: cleanString(raw.iconKey),
        isActive: raw.isActive !== false,
        sortOrder: typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0,
        parentId: cleanString(raw.parentId) ?? inheritedParentId,
        imageUrl: cleanString(raw.imageUrl),
      });
      if (Array.isArray(raw.children)) visit(raw.children, id);
    }
  }

  visit(source);
  const activeRows = rows.filter((item) => item.isActive);
  const apiCategories: ApiCategory[] = activeRows.map((item) => ({
    id: item.id,
    name: item.name,
    iconKey: item.iconKey,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
  }));
  const merged = mergeCategories(apiCategories);
  const mergedById = new Map(merged.map((item) => [item.id, item] as const));

  return activeRows.flatMap((item) => {
    const display = mergedById.get(item.id);
    if (!display) return [];
    return [{
      ...display,
      id: item.id,
      name: item.name,
      parentId: item.parentId,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
    }];
  });
}

function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const nodes: CategoryTreeNode[] = categories.map((category) => ({ ...category, children: [] }));
  const nodesById = new Map(nodes.map((item) => [item.id, item] as const));
  const roots: CategoryTreeNode[] = [];
  for (const category of nodes) {
    const parent = category.parentId ? nodesById.get(category.parentId) : undefined;
    if (parent && parent.id !== category.id) parent.children.push(category);
    else roots.push(category);
  }
  function sortNodes(items: CategoryTreeNode[]) {
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const item of items) sortNodes(item.children);
  }
  sortNodes(roots);
  return roots;
}

function getCategoryBackground(categoryName: string, categories: Category[]): string {
  const normalized = categoryName.trim().toLocaleLowerCase();
  return categories.find((item) => item.name.toLocaleLowerCase() === normalized)?.bg ??
    DEFAULT_CATEGORIES.find((item) => item.name.toLocaleLowerCase() === normalized)?.bg ??
    "#EEF1F4";
}

/* -------------------------------------------------------------------------- */
/* LOCATION HELPERS                                                           */
/* -------------------------------------------------------------------------- */

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value.flatMap((item) => {
    if (typeof item === "string") {
      const cleaned = item.trim();
      return cleaned ? [cleaned] : [];
    }
    if (isRecord(item)) {
      const name = cleanString(item.lga) ?? cleanString(item.name) ?? cleanString(item.state) ?? cleanString(item.value);
      return name ? [name] : [];
    }
    return [];
  });
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

function parseStateGroups(value: unknown): LocationFilterOptions {
  const result: LocationFilterOptions = { states: [], lgasByState: {} };
  if (!isRecord(value)) return result;

  if (isRecord(value.lgasByState)) {
    for (const [stateName, rawLgas] of Object.entries(value.lgasByState)) {
      const state = stateName.trim();
      const lgas = parseStringList(rawLgas);
      if (state && lgas.length) result.lgasByState[state] = lgas;
    }
  }

  const stateGroups = Array.isArray(value.stateGroups) ? value.stateGroups : [];
  for (const rawGroup of stateGroups) {
    if (!isRecord(rawGroup)) continue;
    const state = cleanString(rawGroup.state) ?? cleanString(rawGroup.name);
    if (!state) continue;
    const rawLgas = Array.isArray(rawGroup.lgas)
      ? rawGroup.lgas
      : Array.isArray(rawGroup.groups)
        ? rawGroup.groups
        : [];
    const names = parseStringList(rawLgas);
    if (names.length) {
      result.lgasByState[state] = Array.from(new Set([...(result.lgasByState[state] ?? []), ...names]))
        .sort((a, b) => a.localeCompare(b));
    }
  }

  // Support the legacy Lagos-only /api/areas shape: { groups: [{ lga, areas }] }.
  if (Object.keys(result.lgasByState).length === 0 && Array.isArray(value.groups)) {
    const legacyLgas = value.groups.flatMap((item) => {
      if (!isRecord(item)) return [];
      const lga = cleanString(item.lga);
      return lga ? [lga] : [];
    });
    if (legacyLgas.length) result.lgasByState.Lagos = Array.from(new Set(legacyLgas)).sort();
  }

  const explicitStates = parseStringList(value.states);
  result.states = Array.from(new Set([...explicitStates, ...Object.keys(result.lgasByState)]))
    .sort((a, b) => a.localeCompare(b));
  return result;
}

function getLgasForState(options: LocationFilterOptions, state: string): string[] {
  if (!state) return [];
  const entry = Object.entries(options.lgasByState).find(([name]) => name.toLocaleLowerCase() === state.toLocaleLowerCase());
  return entry?.[1] ?? [];
}

/* -------------------------------------------------------------------------- */
/* PRODUCT RESPONSE PARSING                                                   */
/* -------------------------------------------------------------------------- */

function parseCategory(value: unknown): ListingCategory {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  return {
    id: value.id,
    name: value.name,
    iconKey: cleanString(value.iconKey) ?? undefined,
    isActive: typeof value.isActive === "boolean" ? value.isActive : undefined,
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : undefined,
  };
}

function parseImages(value: unknown): ListingImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): ListingImage[] => {
    if (!isRecord(raw) || typeof raw.url !== "string" || !raw.url.trim()) return [];
    return [{
      id: typeof raw.id === "string" ? raw.id : "",
      url: raw.url,
      publicId: cleanString(raw.publicId),
      sortOrder: typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder) ? raw.sortOrder : 0,
    }];
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

function parseProduct(value: unknown): ProductSearchResult | null {
  if (!isRecord(value)) return null;
  const seller = isRecord(value.seller) ? value.seller : isRecord(value.business) ? value.business : null;
  const id = cleanString(value.id);
  const name = cleanString(value.name);
  const sellerId = seller ? cleanString(seller.id) : null;
  const sellerName = seller ? cleanString(seller.name) : null;
  if (!id || !name || !seller || !sellerId || !sellerName) return null;

  const images = parseImages(value.images);
  const price = parseNumber(value.price) ?? parseNumber(value.salePrice) ?? parseNumber(value.currentPrice);
  const originalCandidate = parseNumber(value.originalPrice) ?? parseNumber(value.compareAtPrice) ??
    parseNumber(value.regularPrice) ?? parseNumber(value.oldPrice);
  const originalPrice = price !== null && originalCandidate !== null && originalCandidate > price ? originalCandidate : null;
  const rawLocation = isRecord(seller.location) ? seller.location : null;
  const verification = cleanString(seller.verification);

  return {
    id,
    name,
    description: cleanString(value.description),
    price,
    originalPrice,
    stockQuantity: parseNumber(value.stockQuantity),
    availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl) ?? images[0]?.url ?? null,
    images,
    category: parseCategory(value.category),
    keywords: Array.isArray(value.keywords) ? value.keywords.filter((item): item is string => typeof item === "string") : [],
    matchScore: parseNumber(value.matchScore) ?? 0,
    seller: {
      id: sellerId,
      name: sellerName,
      verified: seller.verified === true || verification === "VERIFIED",
      location: rawLocation ? {
        area: cleanString(rawLocation.area),
        lga: cleanString(rawLocation.lga),
        state: cleanString(rawLocation.state),
      } : null,
    },
  };
}

function parseResultMeta(value: unknown, productCount: number, fallbackPage: number): SearchResultMeta {
  const meta = isRecord(value) ? value : {};
  function readInteger(key: string, fallback: number, minimum = 0): number {
    const candidate = meta[key];
    return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= minimum ? candidate : fallback;
  }
  const totalProducts = readInteger("totalProducts", productCount);
  const pageSize = readInteger("pageSize", PAGE_SIZE, 1);
  const cappedTotal = Math.min(totalProducts, MAX_SEARCH_RESULTS);
  const totalPages = readInteger("totalPages", Math.ceil(cappedTotal / pageSize));
  const rawSort = meta.sort;
  return {
    totalProducts,
    returnedResults: readInteger("returnedResults", productCount),
    page: readInteger("page", fallbackPage, 1),
    pageSize,
    totalPages: Math.max(1, totalPages),
    hasMore: meta.hasMore === true,
    maxResults: readInteger("maxResults", MAX_SEARCH_RESULTS, 1),
    truncated: meta.truncated === true,
    sort: rawSort === "newest" || rawSort === "price-asc" || rawSort === "price-desc" || rawSort === "relevance" ? rawSort : "relevance",
  };
}

/* -------------------------------------------------------------------------- */
/* URL AND SAVED-LISTING HELPERS                                              */
/* -------------------------------------------------------------------------- */

function buildSearchParams(values: SearchFilterValues, page = 1): URLSearchParams {
  const params = new URLSearchParams();
  const fields: Array<[string, string]> = [
    ["q", values.query], ["category", values.category], ["categoryId", values.categoryId],
    ["state", values.state], ["lga", values.lga], ["area", values.area],
    ["minPrice", values.minPrice], ["maxPrice", values.maxPrice], ["availability", values.availability],
  ];
  for (const [key, raw] of fields) {
    const value = raw.trim();
    if (value) params.set(key, value);
  }
  if (values.verified) params.set("verified", "true");
  params.set("type", "product");
  params.set("pageSize", String(PAGE_SIZE));
  if (page > 1) params.set("page", String(page));
  if (values.sort !== "relevance") params.set("sort", values.sort);
  return params;
}

function parseSavedProductMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  const collections = [value.items, value.savedListings, value.savedProducts];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const raw of collection) {
      if (!isRecord(raw)) continue;
      if (raw.type === "PRODUCT" && isRecord(raw.listing)) {
        const productId = cleanString(raw.listing.id);
        const savedId = cleanString(raw.id);
        if (productId && savedId) result[productId] = savedId;
        continue;
      }
      const nestedProduct = isRecord(raw.product) ? raw.product : null;
      const productId = cleanString(raw.productId) ?? cleanString(raw.listingId) ?? (nestedProduct ? cleanString(nestedProduct.id) : null);
      const savedId = cleanString(raw.savedListingId) ?? cleanString(raw.savedId) ?? (productId ? cleanString(raw.id) : null);
      if (productId && savedId) result[productId] = savedId;
    }
  }
  return result;
}

function getCreatedSavedRecordId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["item", "savedListing", "savedItem", "saved"]) {
    if (isRecord(value[key])) {
      const id = cleanString(value[key].id);
      if (id) return id;
    }
  }
  return cleanString(value.savedListingId) ?? cleanString(value.savedItemId) ?? cleanString(value.savedId);
}

/* -------------------------------------------------------------------------- */
/* PRODUCT DISPLAY HELPERS                                                    */
/* -------------------------------------------------------------------------- */

function getProductImage(product: ProductSearchResult): string | null {
  return product.images[0]?.url ?? product.imageUrl;
}

function getAvailabilityStatus(product: ProductSearchResult) {
  if (product.availability === "UNAVAILABLE" || product.stockQuantity === 0) {
    return { label: "Out of stock", className: "bg-[#F3E8E8] text-[#9F2D18]" };
  }
  if (product.availability === "AVAILABLE") {
    return { label: product.stockQuantity !== null ? `${product.stockQuantity} in stock` : "Available", className: "bg-[#DCFCE7] text-[#166534]" };
  }
  return { label: "Confirm availability", className: "bg-[#FEF3C7] text-[#A16207]" };
}

function canAddToCart(product: ProductSearchResult): boolean {
  return product.availability === "AVAILABLE" && product.price !== null && product.price > 0 && product.stockQuantity !== 0;
}

/* -------------------------------------------------------------------------- */
/* PRODUCT CARD                                                               */
/* -------------------------------------------------------------------------- */

function ProductResultCard({
  product,
  saved,
  saving,
  adding,
  cartFeedback,
  categoryBackground,
  onToggleSaved,
  onAddToCart,
}: {
  product: ProductSearchResult;
  saved: boolean;
  saving: boolean;
  adding: boolean;
  cartFeedback: CartFeedback;
  categoryBackground: string;
  onToggleSaved: (product: ProductSearchResult) => void;
  onAddToCart: (product: ProductSearchResult) => void;
}) {
  const image = getProductImage(product);
  const status = getAvailabilityStatus(product);
  const discount = getDiscountPercentage(product.price, product.originalPrice);
  const productHref = `/product/${encodeURIComponent(product.id)}`;
  const canAdd = canAddToCart(product);
  const feedback = cartFeedback?.productId === product.id ? cartFeedback : null;

  return (
    <article className="rm-product-card group flex min-w-0 flex-col">
      <div className="rm-product-media" style={{ backgroundColor: categoryBackground }}>
        <Link href={productHref} aria-label={`View ${product.name}`} className="absolute inset-0">
          {image ? (
            <img src={image} alt={product.name} loading="lazy" style={{ width: "100%", height: "100%", display: "block" }} />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[#A69D94]"><Package className="h-9 w-9" /></span>
          )}
        </Link>

        <div className="rm-product-badges">
          <span className="rm-product-badge">{status.label}</span>
          {discount !== null && <span className="rm-product-badge rm-product-badge-sale">-{discount}%</span>}
        </div>

        <button
          type="button"
          aria-label={saved ? `Remove ${product.name} from Saved` : `Save ${product.name}`}
          aria-pressed={saved}
          disabled={saving}
          onClick={() => onToggleSaved(product)}
          className={`absolute right-2 top-2 z-[1] flex h-9 w-9 items-center justify-center rounded-full border border-[var(--rm-border)] bg-white text-[var(--rm-muted)] shadow-sm transition hover:text-[var(--rm-coral)] disabled:opacity-60 ${saved ? "text-[var(--rm-coral)]" : ""}`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" fill={saved ? "currentColor" : "none"} />}
        </button>
      </div>

      <div className="rm-product-details flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center justify-between gap-1.5">
          <p className="rm-product-category">{product.category?.name ?? "Product"}</p>
          {product.seller.verified && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] font-semibold text-[var(--rm-green)]" title="Verified seller">
              <BadgeCheck className="h-3 w-3" /> Verified
            </span>
          )}
        </div>

        <Link href={productHref} className="rm-product-title mt-1 hover:text-[var(--rm-coral-dark)]">
          {product.name}
        </Link>

        <div className="rm-product-price-row mt-1.5">
          <span className="rm-product-price">{product.price !== null ? formatNaira(product.price) : "Price unavailable"}</span>
          {product.originalPrice !== null && product.price !== null && (
            <del className="rm-product-old-price">{formatNaira(product.originalPrice)}</del>
          )}
        </div>

        {product.description && (
          <p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-[var(--rm-muted)]">{product.description}</p>
        )}

        <div className="rm-product-meta mt-auto border-t border-[var(--rm-border)] pt-2.5">
          <Link href={`/seller/${encodeURIComponent(product.seller.id)}`} className="rm-product-seller" title={product.seller.name}>
            {product.seller.name}
          </Link>
          <p className="flex min-w-0 shrink-0 items-center gap-0.5 text-[9px] text-[var(--rm-muted)]">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            <span className="max-w-[78px] truncate">{product.seller.location?.area ?? "Nearby"}</span>
          </p>
        </div>

        <button
          type="button"
          disabled={!canAdd || adding}
          onClick={() => onAddToCart(product)}
          title={!canAdd ? "This product requires a confirmed price and availability." : "Add to cart"}
          className={`rm-button mt-2.5 w-full ${canAdd ? "rm-button-primary" : "cursor-not-allowed border-[var(--rm-border)] bg-[var(--rm-surface-muted)] text-[var(--rm-subtle)]"}`}
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
          {!canAdd ? "Not available to buy" : adding ? "Adding..." : "Add to cart"}
        </button>

        {feedback && (
          <p role={feedback.error ? "alert" : "status"} className={`mt-1.5 text-[9px] leading-4 ${feedback.error ? "text-[var(--rm-red)]" : "text-[var(--rm-green)]"}`}>
            {feedback.message}
          </p>
        )}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* CATEGORY FILTER CONTROLS                                                   */
/* -------------------------------------------------------------------------- */

function CategoryIcon({ category }: { category: Category }) {
  const Icon = category.icon;
  if (category.imageUrl) return <img src={category.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" style={{ width: "100%", height: "100%", display: "block" }} />;
  return <Icon className="h-3.5 w-3.5" />;
}

function CategoryFilterList({
  categories,
  selectedCategoryId,
  selectedCategory,
  onSelect,
}: {
  categories: CategoryTreeNode[];
  selectedCategoryId: string;
  selectedCategory: string;
  onSelect: (category: CategoryTreeNode | null) => void;
}) {
  const isActive = (item: CategoryTreeNode) => selectedCategoryId
    ? selectedCategoryId === item.id
    : selectedCategory.toLocaleLowerCase() === item.name.toLocaleLowerCase();

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-pressed={!selectedCategory && !selectedCategoryId}
        onClick={() => onSelect(null)}
        className={`rm-filter-chip w-full justify-between rounded-md ${!selectedCategory && !selectedCategoryId ? "border-[var(--rm-coral)] bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]" : ""}`}
      >
        All categories
        {!selectedCategory && !selectedCategoryId && <Check className="h-3.5 w-3.5" />}
      </button>

      {categories.map((parent) => (
        <div key={parent.id} className="rounded-lg border border-[var(--rm-border)] bg-white p-2">
          <button
            type="button"
            aria-pressed={isActive(parent)}
            onClick={() => onSelect(isActive(parent) ? null : parent)}
            className={`flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-bold transition ${isActive(parent) ? "bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]" : "text-[var(--rm-text)] hover:bg-[var(--rm-surface-muted)]"}`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: parent.bg }}>
              <CategoryIcon category={parent} />
            </span>
            <span className="min-w-0 flex-1 truncate">{parent.name}</span>
            {isActive(parent) && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>

          {parent.children.length > 0 && (
            <div className="ml-4 mt-1 space-y-0.5 border-l border-[var(--rm-border)] pl-2">
              {parent.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  aria-pressed={isActive(child)}
                  onClick={() => onSelect(isActive(child) ? parent : child)}
                  className={`flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition ${isActive(child) ? "bg-[var(--rm-coral-soft)] font-semibold text-[var(--rm-coral-dark)]" : "text-[var(--rm-muted)] hover:bg-[var(--rm-surface-muted)]"}`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: child.bg }}>
                    <CategoryIcon category={child} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{child.name}</span>
                  {isActive(child) && <Check className="h-3 w-3 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {categories.length === 0 && <p className="px-2 py-2 text-[11px] text-[var(--rm-muted)]">No product categories are available.</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SEARCH PARAMETER WRAPPER                                                   */
/* -------------------------------------------------------------------------- */

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const allSearchParams = searchParams.toString();
  const initialQuery = searchParams.get("q") ?? "";
  const initialCategory = searchParams.get("category") ?? "";
  const initialCategoryId = searchParams.get("categoryId") ?? "";
  const initialState = searchParams.get("state") ?? "";
  const initialLga = searchParams.get("lga") ?? "";
  const initialArea = searchParams.get("area") ?? searchParams.get("location") ?? "";
  const initialMinPrice = searchParams.get("minPrice") ?? "";
  const initialMaxPrice = searchParams.get("maxPrice") ?? "";
  const initialAvailability = parseAvailabilityFilter(searchParams.get("availability") ?? "");
  const initialVerified = searchParams.get("verified") === "true";
  const initialPage = getPositivePage(searchParams.get("page"));
  const initialSort = parseSortMode(searchParams.get("sort"));

  const stableParams = new URLSearchParams(allSearchParams);
  stableParams.delete("page");
  const searchKey = stableParams.toString();

  useEffect(() => {
    const params = new URLSearchParams(allSearchParams);
    let changed = false;
    if (params.get("type") !== "product") {
      params.set("type", "product");
      changed = true;
    }
    if (params.has("location") && !params.has("area")) {
      const legacyLocation = params.get("location");
      if (legacyLocation?.trim()) params.set("area", legacyLocation.trim());
      params.delete("location");
      changed = true;
    }
    const rawPage = params.get("page");
    if (rawPage !== null) {
      const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : Number.NaN;
      if (!Number.isSafeInteger(parsedPage) || parsedPage < 1 || parsedPage > MAX_SEARCH_PAGE) {
        params.delete("page");
        changed = true;
      }
    }
    if (changed) {
      const next = params.toString();
      router.replace(next ? `/search?${next}` : "/search", { scroll: false });
    }
  }, [allSearchParams, router]);

  return (
    <SearchPageView
      key={searchKey}
      initialQuery={initialQuery}
      initialCategory={initialCategory}
      initialCategoryId={initialCategoryId}
      initialState={initialState}
      initialLga={initialLga}
      initialArea={initialArea}
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
/* MAIN SEARCH PAGE                                                           */
/* -------------------------------------------------------------------------- */

function SearchPageView({
  initialQuery,
  initialCategory,
  initialCategoryId,
  initialState,
  initialLga,
  initialArea,
  initialMinPrice,
  initialMaxPrice,
  initialAvailability,
  initialVerified,
  initialPage,
  initialSort,
}: SearchPageViewProps) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [state, setState] = useState(initialState);
  const [lga, setLga] = useState(initialLga);
  const [area, setArea] = useState(initialArea);
  const [minPrice, setMinPrice] = useState(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
  const [availability, setAvailability] = useState(initialAvailability);
  const [verified, setVerified] = useState(initialVerified);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [locationOptions, setLocationOptions] = useState<LocationFilterOptions>({ states: [], lgasByState: {} });
  const [locationOptionsLoading, setLocationOptionsLoading] = useState(true);
  const [locationOptionsError, setLocationOptionsError] = useState("");

  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [savedProducts, setSavedProducts] = useState<Record<string, string>>({});
  const [savingProductIds, setSavingProductIds] = useState<Record<string, boolean>>({});
  const [addingProductIds, setAddingProductIds] = useState<Record<string, boolean>>({});
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null);
  const [cartFeedback, setCartFeedback] = useState<CartFeedback>(null);

  const [resultMeta, setResultMeta] = useState<SearchResultMeta>({
    totalProducts: 0,
    returnedResults: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
    hasMore: false,
    maxResults: MAX_SEARCH_RESULTS,
    truncated: false,
    sort: initialSort,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterValidationError, setFilterValidationError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const appliedFilters = useMemo<SearchFilterValues>(() => ({
    query: initialQuery,
    category: initialCategory,
    categoryId: initialCategoryId,
    state: initialState,
    lga: initialLga,
    area: initialArea,
    minPrice: initialMinPrice,
    maxPrice: initialMaxPrice,
    availability: initialAvailability,
    verified: initialVerified,
    sort: initialSort,
  }), [
    initialQuery, initialCategory, initialCategoryId, initialState, initialLga,
    initialArea, initialMinPrice, initialMaxPrice, initialAvailability,
    initialVerified, initialSort,
  ]);

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const availableLgas = useMemo(() => getLgasForState(locationOptions, state), [locationOptions, state]);
  const activeFilterCount =
    Number(Boolean(initialCategory || initialCategoryId)) +
    Number(Boolean(initialState)) +
    Number(Boolean(initialLga)) +
    Number(Boolean(initialArea)) +
    Number(Boolean(initialMinPrice)) +
    Number(Boolean(initialMaxPrice)) +
    Number(Boolean(initialAvailability)) +
    Number(initialVerified);

  const totalPages = Math.max(1, resultMeta.totalPages);
  const currentPage = Math.min(Math.max(1, initialPage), totalPages);
  const hasResults = products.length > 0;
  const effectivePageSize = resultMeta.pageSize || PAGE_SIZE;
  const pageStart = hasResults ? (currentPage - 1) * effectivePageSize + 1 : 0;
  const pageEnd = hasResults ? pageStart + products.length - 1 : 0;

  /* ------------------------------------------------------------------------ */
  /* DATA LOADING                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller = new AbortController();
    async function loadCategories() {
      setCategoriesLoading(true);
      try {
        const response = await fetch("/api/categories?type=product&includeEmpty=true", {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load product categories.");
        const data: unknown = await response.json();
        if (!isRecord(data)) throw new Error("Invalid category response.");
        if (!controller.signal.aborted) setCategories(parseCategoryOptions(data));
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Product category loading error:", loadError);
        setCategories([]);
      } finally {
        if (!controller.signal.aborted) setCategoriesLoading(false);
      }
    }
    async function loadLocationOptions() {
      setLocationOptionsLoading(true);
      setLocationOptionsError("");
      try {
        const response = await fetch("/api/areas", {
          cache: "force-cache",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load location options.");
        const data: unknown = await response.json();
        if (!isRecord(data)) throw new Error("Invalid location response.");
        const parsed = parseStateGroups(data);
        if (controller.signal.aborted) return;
        setLocationOptions(parsed);
        if (parsed.states.length === 0) setLocationOptionsError("No supported states were returned by the location API.");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Location option loading error:", loadError);
        setLocationOptions({ states: [], lgasByState: {} });
        setLocationOptionsError(loadError instanceof Error ? loadError.message : "Unable to load location options.");
      } finally {
        if (!controller.signal.aborted) setLocationOptionsLoading(false);
      }
    }
    void loadCategories();
    void loadLocationOptions();
    return () => controller.abort();
  }, []);

  const loadSavedProducts = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/saved?type=PRODUCT", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        if (!signal?.aborted) setSavedProducts({});
        return {};
      }
      if (!response.ok) throw new Error("Unable to load saved products.");
      const data: unknown = await response.json();
      const parsed = parseSavedProductMap(data);
      if (!signal?.aborted) setSavedProducts(parsed);
      return parsed;
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return null;
      console.error("Saved product loading error:", loadError);
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refreshSaved = () => { void loadSavedProducts(); };
    void loadSavedProducts(controller.signal);
    window.addEventListener(SAVED_ITEMS_CHANGED_EVENT, refreshSaved);
    window.addEventListener("storage", refreshSaved);
    return () => {
      controller.abort();
      window.removeEventListener(SAVED_ITEMS_CHANGED_EVENT, refreshSaved);
      window.removeEventListener("storage", refreshSaved);
    };
  }, [loadSavedProducts]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSearchResults() {
      setLoading(true);
      setError("");
      setCartFeedback(null);
      try {
        const params = buildSearchParams(appliedFilters, initialPage);
        const response = await fetch(`/api/search?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(getApiError(data));
        if (!isRecord(data)) throw new Error("The search API returned an invalid response.");
        if (controller.signal.aborted) return;
        const rawProducts = Array.isArray(data.products) ? data.products : [];
        const parsedProducts = rawProducts.map(parseProduct).filter((item): item is ProductSearchResult => item !== null);
        setProducts(parsedProducts);
        setResultMeta(parseResultMeta(data.resultMeta, parsedProducts.length, initialPage));
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") return;
        console.error("Product search loading error:", searchError);
        setProducts([]);
        setResultMeta({
          totalProducts: 0,
          returnedResults: 0,
          page: 1,
          pageSize: PAGE_SIZE,
          totalPages: 1,
          hasMore: false,
          maxResults: MAX_SEARCH_RESULTS,
          truncated: false,
          sort: initialSort,
        });
        setError(searchError instanceof Error && searchError.message ? searchError.message : "We couldn't complete your search right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadSearchResults();
    return () => controller.abort();
  }, [appliedFilters, initialPage, initialSort, retryCount]);

  /* Close the mobile filter sheet with Escape and prevent background scrolling. */
  useEffect(() => {
    if (!showFilters) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCategory(initialCategory);
      setCategoryId(initialCategoryId);
      setState(initialState);
      setLga(initialLga);
      setArea(initialArea);
      setMinPrice(initialMinPrice);
      setMaxPrice(initialMaxPrice);
      setAvailability(initialAvailability);
      setVerified(initialVerified);
      setFilterValidationError("");
      setShowFilters(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
    // The effect restores draft filter values from the current URL state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFilters]);

  /* ------------------------------------------------------------------------ */
  /* ROUTING AND FILTER ACTIONS                                               */
  /* ------------------------------------------------------------------------ */

  const navigateToSearch = useCallback((values: SearchFilterValues, page = 1) => {
    const params = buildSearchParams(values, page);
    const queryString = params.toString();
    router.push(queryString ? `/search?${queryString}` : "/search", { scroll: false });
  }, [router]);

  const navigateToPage = useCallback((requestedPage: number) => {
    const params = buildSearchParams(appliedFilters, requestedPage);
    const queryString = params.toString();
    router.push(queryString ? `/search?${queryString}` : "/search", { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [appliedFilters, router]);

  function getDraftFilters(): SearchFilterValues {
    return { ...appliedFilters, category, categoryId, state, lga, area, minPrice, maxPrice, availability, verified };
  }

  function applyFilters() {
    const minimumRaw = minPrice.trim();
    const maximumRaw = maxPrice.trim();
    const minimum = minimumRaw ? Number(minimumRaw) : null;
    const maximum = maximumRaw ? Number(maximumRaw) : null;
    if (!isValidPriceFilterInput(minimumRaw)) {
      setFilterValidationError("Minimum price must be a whole number between ₦0 and ₦1,000,000,000.");
      return;
    }
    if (!isValidPriceFilterInput(maximumRaw)) {
      setFilterValidationError("Maximum price must be a whole number between ₦0 and ₦1,000,000,000.");
      return;
    }
    if (minimum !== null && maximum !== null && minimum > maximum) {
      setFilterValidationError("Minimum price cannot be greater than maximum price.");
      return;
    }
    setFilterValidationError("");
    navigateToSearch(getDraftFilters());
    setShowFilters(false);
  }

  function closeFilters() {
    setCategory(initialCategory);
    setCategoryId(initialCategoryId);
    setState(initialState);
    setLga(initialLga);
    setArea(initialArea);
    setMinPrice(initialMinPrice);
    setMaxPrice(initialMaxPrice);
    setAvailability(initialAvailability);
    setVerified(initialVerified);
    setFilterValidationError("");
    setShowFilters(false);
  }

  function clearFilters() {
    const cleared: SearchFilterValues = {
      ...appliedFilters,
      category: "",
      categoryId: "",
      state: "",
      lga: "",
      area: "",
      minPrice: "",
      maxPrice: "",
      availability: "",
      verified: false,
      sort: "relevance",
    };
    setCategory("");
    setCategoryId("");
    setState("");
    setLga("");
    setArea("");
    setMinPrice("");
    setMaxPrice("");
    setAvailability("");
    setVerified(false);
    setFilterValidationError("");
    setShowFilters(false);
    navigateToSearch(cleared);
  }

  function selectCategory(item: CategoryTreeNode | null) {
    setCategory(item?.name ?? "");
    setCategoryId(item?.id ?? "");
  }

  function handleAreaChange(value: string) {
    setArea(value);
  }

  function handleAreaSelect(selected: AreaSelection) {
    setState(selected.state);
    setLga(selected.lga);
    setArea(selected.area);
  }

  /* ------------------------------------------------------------------------ */
  /* SAVE AND ADD-TO-CART ACTIONS                                             */
  /* ------------------------------------------------------------------------ */

  async function toggleSavedProduct(product: ProductSearchResult) {
    if (savingProductIds[product.id]) return;
    setSaveFeedback(null);
    setSavingProductIds((current) => ({ ...current, [product.id]: true }));
    const callbackUrl = `${window.location.pathname}${window.location.search}`;
    try {
      const currentSavedId = savedProducts[product.id];
      if (currentSavedId) {
        const response = await fetch(`/api/saved/${encodeURIComponent(currentSavedId)}`, {
          method: "DELETE",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const data: unknown = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) {
          router.push(`/buyer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
          return;
        }
        if (!response.ok) throw new Error(getApiError(data));
        setSavedProducts((current) => {
          const next = { ...current };
          delete next[product.id];
          return next;
        });
        setSaveFeedback({ message: `${product.name} removed from Saved.`, error: false });
      } else {
        const response = await fetch("/api/saved", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ type: "PRODUCT", listingId: product.id }),
        });
        const data: unknown = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) {
          router.push(`/buyer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
          return;
        }
        if (response.status === 409) {
          const refreshed = await loadSavedProducts();
          if (refreshed && refreshed[product.id]) {
            setSaveFeedback({ message: `${product.name} is already in Saved.`, error: false });
            return;
          }
        }
        if (!response.ok) throw new Error(getApiError(data));
        let savedId = getCreatedSavedRecordId(data);
        if (!savedId) {
          const refreshed = await loadSavedProducts();
          savedId = refreshed?.[product.id] ?? null;
        }
        if (savedId) setSavedProducts((current) => ({ ...current, [product.id]: savedId! }));
        setSaveFeedback({ message: `${product.name} added to Saved.`, error: false });
      }
      window.dispatchEvent(new Event(SAVED_ITEMS_CHANGED_EVENT));
    } catch (saveError) {
      console.error("Saved product action error:", saveError);
      setSaveFeedback({
        message: saveError instanceof Error ? saveError.message : "Unable to update Saved.",
        error: true,
      });
    } finally {
      setSavingProductIds((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }
  }

  async function addProductToCart(product: ProductSearchResult) {
    if (addingProductIds[product.id] || !canAddToCart(product)) return;
    setCartFeedback(null);
    setAddingProductIds((current) => ({ ...current, [product.id]: true }));
    const callbackUrl = `${window.location.pathname}${window.location.search}`;
    try {
      const response = await fetch("/api/cart/items", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        router.push(`/buyer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
        return;
      }
      if (!response.ok) throw new Error(getApiError(data));
      setCartFeedback({ productId: product.id, message: "Added to cart.", error: false });
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch (cartError) {
      console.error("Add-to-cart error:", cartError);
      setCartFeedback({
        productId: product.id,
        message: cartError instanceof Error ? cartError.message : "Unable to add this product to your cart.",
        error: true,
      });
    } finally {
      setAddingProductIds((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }
  }

  /* Keep pagination within the result count returned by the API. */
  useEffect(() => {
    if (loading || currentPage === initialPage) return;
    const params = buildSearchParams(appliedFilters, currentPage);
    router.replace(`/search?${params.toString()}`, { scroll: false });
  }, [loading, currentPage, initialPage, appliedFilters, router]);

  const selectedCategoryName = categories.find((item) => item.id === initialCategoryId)?.name ?? initialCategory;
  const resultTitle = initialQuery ? `Results for “${initialQuery}”` : selectedCategoryName || "Search products";
  const resultSummary = `${resultMeta.totalProducts.toLocaleString("en-NG")} ${resultMeta.totalProducts === 1 ? "product" : "products"} found`;

  /* ------------------------------------------------------------------------ */
  /* FILTER PANEL CONTENT                                                     */
  /* ------------------------------------------------------------------------ */

  function renderFilterControls(idPrefix: "desktop" | "mobile") {
    const stateId = `${idPrefix}-search-state-filter`;
    const lgaId = `${idPrefix}-search-lga-filter`;
    const areaId = `${idPrefix}-search-area-filter`;
    const minPriceId = `${idPrefix}-search-min-price`;
    const maxPriceId = `${idPrefix}-search-max-price`;
    const availabilityId = `${idPrefix}-search-availability`;

    return (
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[var(--rm-text)]">Category</h3>
            {(category || categoryId) && (
              <button type="button" onClick={() => selectCategory(null)} className="text-[10px] font-semibold text-[var(--rm-coral-dark)] hover:underline">Clear</button>
            )}
          </div>
          {categoriesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-9 animate-pulse rounded-lg bg-[var(--rm-surface-muted)]" />)}
            </div>
          ) : (
            <CategoryFilterList categories={categoryTree} selectedCategoryId={categoryId} selectedCategory={category} onSelect={selectCategory} />
          )}
        </section>

        <section className="border-t border-[var(--rm-border)] pt-4">
          <label htmlFor={stateId} className="rm-field-label">State</label>
          <div className="relative">
            <select
              id={stateId}
              value={state}
              onChange={(event) => { setState(event.target.value); setLga(""); setArea(""); }}
              disabled={locationOptionsLoading}
              className="rm-select appearance-none pr-9"
            >
              <option value="">All supported states</option>
              {locationOptions.states.map((stateName) => <option key={stateName} value={stateName}>{stateName}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--rm-muted)]" />
          </div>
          {locationOptionsLoading && <p className="mt-1.5 text-[10px] text-[var(--rm-muted)]">Loading locations...</p>}
          {locationOptionsError && <p role="status" className="mt-1.5 text-[10px] leading-4 text-[var(--rm-coral-dark)]">{locationOptionsError}</p>}
        </section>

        <section>
          <label htmlFor={lgaId} className="rm-field-label">Local Government Area</label>
          <div className="relative">
            <select
              id={lgaId}
              value={lga}
              onChange={(event) => { setLga(event.target.value); setArea(""); }}
              disabled={!state || locationOptionsLoading}
              className="rm-select appearance-none pr-9"
            >
              <option value="">{state ? "All LGAs in selected state" : "Select a state first"}</option>
              {availableLgas.map((lgaName) => <option key={lgaName} value={lgaName}>{lgaName}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--rm-muted)]" />
          </div>
        </section>

        <section>
          <label htmlFor={areaId} className="rm-field-label">Area or neighbourhood</label>
          <AreaAutocomplete
            id={areaId}
            value={area}
            state={state || undefined}
            lga={lga || undefined}
            onChange={handleAreaChange}
            onSelect={handleAreaSelect}
            placeholder="Search an area, e.g. Ogba or Epe"
          />
          <p className="mt-1.5 text-[10px] leading-4 text-[var(--rm-muted)]">Choose a state and LGA to narrow the suggestions, or search supported locations.</p>
        </section>

        <section>
          <h3 className="rm-field-label">Price range (₦)</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={minPriceId} className="mb-1 block text-[10px] text-[var(--rm-muted)]">Minimum</label>
              <input
                id={minPriceId}
                type="number"
                min="0"
                max="1000000000"
                step="1"
                inputMode="numeric"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
                placeholder="Min price"
                className="rm-input"
              />
            </div>
            <div>
              <label htmlFor={maxPriceId} className="mb-1 block text-[10px] text-[var(--rm-muted)]">Maximum</label>
              <input
                id={maxPriceId}
                type="number"
                min="0"
                max="1000000000"
                step="1"
                inputMode="numeric"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                placeholder="Max price"
                className="rm-input"
              />
            </div>
          </div>
        </section>

        <section>
          <label htmlFor={availabilityId} className="rm-field-label">Availability</label>
          <div className="relative">
            <select
              id={availabilityId}
              value={availability}
              onChange={(event) => setAvailability(parseAvailabilityFilter(event.target.value))}
              className="rm-select appearance-none pr-9"
            >
              <option value="">Any availability</option>
              <option value="AVAILABLE">Available now</option>
              <option value="ASK_SELLER">Confirm availability</option>
              <option value="UNAVAILABLE">Out of stock</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--rm-muted)]" />
          </div>
        </section>

        <button
          type="button"
          aria-pressed={verified}
          onClick={() => setVerified((current) => !current)}
          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition ${verified ? "border-[var(--rm-green-bg)] bg-[var(--rm-green-bg)]" : "border-[var(--rm-border)] bg-white hover:bg-[var(--rm-surface-muted)]"}`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <BadgeCheck className={`h-4 w-4 shrink-0 ${verified ? "text-[var(--rm-green)]" : "text-[var(--rm-muted)]"}`} />
            <span>
              <span className="block text-xs font-semibold text-[var(--rm-text)]">Verified sellers</span>
              <span className="mt-0.5 block text-[10px] text-[var(--rm-muted)]">Only show verified businesses</span>
            </span>
          </span>
          <span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${verified ? "bg-[var(--rm-coral)]" : "bg-[var(--rm-border-strong)]"}`}>
            <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${verified ? "translate-x-4" : "translate-x-0"}`} />
          </span>
        </button>

        {filterValidationError && <p role="alert" className="rounded-lg border border-[var(--rm-red-bg)] bg-[var(--rm-red-bg)] px-3 py-2 text-[11px] leading-4 text-[var(--rm-red)]">{filterValidationError}</p>}

        <div className="flex gap-2 border-t border-[var(--rm-border)] pt-4">
          <button type="button" onClick={clearFilters} className="rm-button rm-button-secondary flex-1">Clear all</button>
          <button type="button" onClick={applyFilters} className="rm-button rm-button-primary flex-[1.35]">Apply filters</button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* PAGE UI                                                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="rm-storefront">
      <SiteHeader searchMode="PRODUCTS" />

      <main id="main-content" className="pb-28 lg:pb-10">
        <div className="rm-container pb-8 pt-4 sm:pt-5 lg:pt-6">
          <section className="rm-section-heading border-b border-[var(--rm-border)] pb-4">
            <div className="min-w-0">
              <div className="mb-1.5 flex items-center gap-2 text-[10px] text-[var(--rm-muted)]">
                <Link href="/" className="hover:text-[var(--rm-coral-dark)]">Home</Link>
                <ChevronRight className="h-3 w-3" />
                <span className="font-semibold text-[var(--rm-text)]">Products</span>
              </div>
              <h1 className="rm-section-title truncate">{resultTitle}</h1>
              <p className="rm-section-subtitle">
                {loading ? "Finding matching products..." : error ? "Products could not be loaded." : resultSummary}
              </p>
            </div>

            <div className="flex w-full items-center gap-2 sm:w-auto">
              <label htmlFor="search-sort" className="shrink-0 text-xs font-semibold text-[var(--rm-muted)]">Sort by</label>
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <select
                  id="search-sort"
                  value={initialSort}
                  onChange={(event) => navigateToSearch({ ...appliedFilters, sort: parseSortMode(event.target.value) })}
                  className="rm-select min-w-0 appearance-none pr-9 sm:min-w-[180px]"
                >
                  <option value="relevance">Best match</option>
                  <option value="newest">Newest first</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--rm-muted)]" />
              </div>
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                aria-label={`Open filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""}`}
                className="rm-button rm-button-secondary shrink-0 lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--rm-coral)] px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
              </button>
            </div>
          </section>

          {saveFeedback && (
            <div role={saveFeedback.error ? "alert" : "status"} className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-xs ${saveFeedback.error ? "border-[var(--rm-red-bg)] bg-[var(--rm-red-bg)] text-[var(--rm-red)]" : "border-[var(--rm-coral-soft)] bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]"}`}>
              <span>{saveFeedback.message}</span>
              <button type="button" onClick={() => setSaveFeedback(null)} aria-label="Dismiss saved message" className="rm-icon-button h-8 w-8"><X className="h-4 w-4" /></button>
            </div>
          )}

          {resultMeta.truncated && !loading && !error && (
            <div role="status" className="mb-4 rounded-lg border border-[var(--rm-yellow-bg)] bg-[var(--rm-yellow-bg)] px-3.5 py-3 text-xs leading-5 text-[var(--rm-yellow)]">
              More than {resultMeta.maxResults} products match these filters. ReMarket is showing a limited result set; add a location, category or price filter to narrow your search.
            </div>
          )}

          <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-6">
            {/* Desktop filter sidebar */}
            <aside className="hidden min-w-0 lg:block">
              <div className="rm-panel sticky top-[145px] max-h-[calc(100dvh-160px)] overflow-y-auto">
                <div className="rm-panel-header">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-[var(--rm-coral)]" />
                    <h2 className="text-sm font-bold text-[var(--rm-ink)]">Filter results</h2>
                  </div>
                  {activeFilterCount > 0 && <span className="rounded-full bg-[var(--rm-coral-soft)] px-2 py-1 text-[9px] font-bold text-[var(--rm-coral-dark)]">{activeFilterCount} active</span>}
                </div>
                <div className="rm-panel-body">{renderFilterControls("desktop")}</div>
              </div>
            </aside>

            {/* Product results */}
            <section className="min-w-0" aria-label="Product search results">
              <div className="rm-section-heading mb-3">
                <h2 className="text-sm font-bold text-[var(--rm-ink)]">{initialQuery ? "Matching products" : "Explore products"}</h2>
                {!loading && !error && hasResults && (
                  <span className="text-[10px] text-[var(--rm-muted)]">Showing {pageStart.toLocaleString("en-NG")}–{pageEnd.toLocaleString("en-NG")} of {resultMeta.totalProducts.toLocaleString("en-NG")}</span>
                )}
              </div>

              {loading && (
                <div className="rm-product-grid" aria-label="Loading products" aria-busy="true">
                  {Array.from({ length: PAGE_SIZE }, (_, index) => (
                    <div key={`search-skeleton-${index}`} className="rm-product-card overflow-hidden">
                      <div className="aspect-square animate-pulse bg-[var(--rm-surface-muted)]" />
                      <div className="space-y-2 p-3">
                        <div className="h-2.5 w-1/3 animate-pulse rounded bg-[var(--rm-surface-muted)]" />
                        <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--rm-surface-muted)]" />
                        <div className="h-4 w-2/5 animate-pulse rounded bg-[var(--rm-surface-muted)]" />
                        <div className="h-9 w-full animate-pulse rounded-lg bg-[var(--rm-surface-muted)]" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && error && (
                <div className="rm-panel px-5 py-12 text-center">
                  <Search className="mx-auto h-9 w-9 text-[var(--rm-subtle)]" />
                  <h3 className="mt-3 text-sm font-bold text-[var(--rm-ink)]">Search unavailable</h3>
                  <p className="mt-2 text-xs leading-5 text-[var(--rm-muted)]">{error}</p>
                  <button type="button" onClick={() => setRetryCount((current) => current + 1)} className="rm-button rm-button-primary mt-5">Try again</button>
                </div>
              )}

              {!loading && !error && !hasResults && (
                <div className="rm-panel rm-empty-state border-dashed px-5 py-14">
                  <Package className="h-8 w-8 text-[var(--rm-coral)]" />
                  <h3>No products found</h3>
                  <p>Try a different product name or adjust your category, location or price filters.</p>
                  {activeFilterCount > 0 ? (
                    <button type="button" onClick={clearFilters} className="rm-button rm-button-primary mt-5">Clear filters <RotateCcw className="h-3.5 w-3.5" /></button>
                  ) : (
                    <Link href="/shop" className="rm-button rm-button-primary mt-5">Browse all products <ArrowRight className="h-3.5 w-3.5" /></Link>
                  )}
                </div>
              )}

              {!loading && !error && hasResults && (
                <>
                  <div className="rm-product-grid">
                    {products.map((product) => (
                      <ProductResultCard
                        key={product.id}
                        product={product}
                        saved={Boolean(savedProducts[product.id])}
                        saving={Boolean(savingProductIds[product.id])}
                        adding={Boolean(addingProductIds[product.id])}
                        cartFeedback={cartFeedback}
                        categoryBackground={getCategoryBackground(product.category?.name ?? "Products", categories)}
                        onToggleSaved={(item) => { void toggleSavedProduct(item); }}
                        onAddToCart={(item) => { void addProductToCart(item); }}
                      />
                    ))}
                  </div>

                  {resultMeta.totalPages > 1 && (
                    <nav aria-label="Product search result pages" className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rm-border)] pt-5">
                      <p className="text-xs text-[var(--rm-muted)]">Page {currentPage} of {totalPages}</p>
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={currentPage <= 1} onClick={() => navigateToPage(currentPage - 1)} className="rm-button rm-button-secondary">
                          <ChevronLeft className="h-4 w-4" /> Previous
                        </button>
                        <span aria-live="polite" className="min-w-[78px] text-center text-xs font-semibold text-[var(--rm-muted)]">{currentPage} / {totalPages}</span>
                        <button type="button" disabled={currentPage >= totalPages || !resultMeta.hasMore} onClick={() => navigateToPage(currentPage + 1)} className="rm-button rm-button-secondary">
                          Next <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </nav>
                  )}
                </>
              )}
            </section>
          </div>

          <footer className="mt-9 flex items-center justify-center gap-3 pb-2 text-[10px] text-[var(--rm-subtle)]">
            <span className="h-px w-10 bg-[var(--rm-border)]" />
            <span>ReMarket · Find it nearby</span>
            <span className="h-px w-10 bg-[var(--rm-border)]" />
          </footer>
        </div>
      </main>

      {/* Mobile filters: desktop uses the persistent sidebar above. */}
      {showFilters && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button type="button" aria-label="Close filters" onClick={closeFilters} className="absolute inset-0 bg-black/40" />
          <section role="dialog" aria-modal="true" aria-labelledby="mobile-search-filters-title" className="rm-panel absolute bottom-0 left-0 right-0 max-h-[90dvh] overflow-y-auto overscroll-contain rounded-b-none rounded-t-[20px] border-b-0 p-4 pb-[max(18px,env(safe-area-inset-bottom))] shadow-[var(--rm-shadow-popover)] sm:bottom-4 sm:left-auto sm:right-4 sm:top-4 sm:max-h-none sm:w-[390px] sm:rounded-xl sm:border sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--rm-border)] pb-4">
              <div>
                <h2 id="mobile-search-filters-title" className="text-base font-extrabold text-[var(--rm-ink)]">Filter products</h2>
                <p className="mt-0.5 text-[11px] text-[var(--rm-muted)]">Narrow down your product results.</p>
              </div>
              <button type="button" onClick={closeFilters} aria-label="Close filters" className="rm-icon-button"><X className="h-4 w-4" /></button>
            </div>
            {renderFilterControls("mobile")}
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
    <Suspense fallback={
      <div className="rm-storefront">
        <SiteHeader searchMode="PRODUCTS" />
        <main className="flex min-h-[60dvh] items-center justify-center px-4 pb-24">
          <div role="status" className="rm-panel flex items-center gap-2 px-5 py-4 text-xs text-[var(--rm-muted)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--rm-coral)]" />
            Loading product search...
          </div>
        </main>
        <MobileBottomNav />
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
