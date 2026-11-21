"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
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
  ShoppingCart,
  SlidersHorizontal,
  X,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import AreaAutocomplete, { type AreaSelection } from "@/components/filters/AreaAutocomplete";
import { mergeCategories, type ApiCategory, type ReMarketCategory } from "@/lib/categories";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type SortMode = "relevance" | "newest" | "price-asc" | "price-desc";
type ProductImage = { id: string; url: string; publicId: string | null; sortOrder: number };
type ProductCategory = { id: string; name: string; iconKey: string | null; isActive: boolean; sortOrder: number };
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  stockQuantity: number | null;
  availability: Availability;
  imageUrl: string | null;
  images: ProductImage[];
  category: ProductCategory | null;
  keywords: string[];
  matchScore: number;
  seller: {
    id: string;
    name: string;
    verification: string | null;
    verified: boolean;
    location: { area: string | null; street: string | null; lga: string | null; state: string | null } | null;
  };
};
type ShopCategory = ReMarketCategory & {
  parentId: string | null;
  imageUrl: string | null;
  sortOrder: number;
  children: ShopCategory[];
};
type LocationLgaGroup = { lga: string; areas: string[] };
type LocationStateGroup = { state: string; groups: LocationLgaGroup[] };
type SavedProductMap = Record<string, string>;
type CartFeedback = { productId: string; kind: "success" | "error"; message: string } | null;
type ShopFilters = {
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
type RawCategory = {
  id: string;
  name: string;
  iconKey: string | null;
  isActive: boolean;
  sortOrder: number;
  parentId: string | null;
  imageUrl: string | null;
};

const PAGE_SIZE = 12;
const FILTER_DIALOG_TITLE = "shop-mobile-filter-title";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cleanString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}
function normalizeLocationName(value: string): string {
  return value.trim().toLocaleLowerCase();
}
function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}
function parseAvailability(value: unknown): Availability {
  return value === "AVAILABLE" || value === "UNAVAILABLE" || value === "ASK_SELLER" ? value : "ASK_SELLER";
}
function parseAvailabilityFilter(value: string): Availability | "" {
  return value === "AVAILABLE" || value === "ASK_SELLER" || value === "UNAVAILABLE" ? value : "";
}
function parseSortMode(value: string | null): SortMode {
  return value === "relevance" || value === "price-asc" || value === "price-desc" || value === "newest" ? value : "newest";
}
function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}
function formatNaira(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`;
}
function getDiscountPercentage(product: Product): number | null {
  if (product.price === null || product.price <= 0 || product.originalPrice === null || product.originalPrice <= product.price) return null;
  return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
}
function canAddProductToCart(product: Pick<Product, "price" | "availability" | "stockQuantity">): boolean {
  return product.availability === "AVAILABLE" && product.price !== null && product.price > 0 && product.stockQuantity !== 0;
}
function getAvailabilityLabel(product: Pick<Product, "availability" | "stockQuantity">): string {
  if (product.availability === "UNAVAILABLE" || product.stockQuantity === 0) return "Out of stock";
  if (product.availability === "AVAILABLE") return "Available";
  return "Check availability";
}
function getAvailabilityClass(product: Pick<Product, "availability" | "stockQuantity">): string {
  if (product.availability === "UNAVAILABLE" || product.stockQuantity === 0) return "bg-[#FCE8E6] text-[#A12A20]";
  if (product.availability === "AVAILABLE") return "bg-[#E8F4EB] text-[#176B48]";
  return "bg-[#FFF4DD] text-[#805D16]";
}

function parseCategoryRows(payload: unknown): RawCategory[] {
  if (!isRecord(payload)) return [];
  const source = Array.isArray(payload.navigationCategories) && payload.navigationCategories.length ? payload.navigationCategories : payload.categories;
  if (!Array.isArray(source)) return [];
  const rows: RawCategory[] = [];
  const visited = new Set<string>();
  const visit = (items: unknown[], inheritedParentId: string | null) => {
    for (const value of items) {
      if (!isRecord(value)) continue;
      const id = cleanString(value.id);
      const name = cleanString(value.name);
      if (!id || !name || visited.has(id)) continue;
      visited.add(id);
      rows.push({
        id,
        name,
        iconKey: cleanString(value.iconKey),
        isActive: value.isActive !== false,
        sortOrder: typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder) ? value.sortOrder : 0,
        parentId: cleanString(value.parentId) ?? inheritedParentId,
        imageUrl: cleanString(value.imageUrl),
      });
      if (Array.isArray(value.children)) visit(value.children, id);
    }
  };
  visit(source, null);
  return rows;
}
function sortCategoryTree(items: ShopCategory[]): ShopCategory[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((item) => ({ ...item, children: sortCategoryTree(item.children) }));
}
function parseCategoryTree(payload: unknown): ShopCategory[] {
  const rows = parseCategoryRows(payload).filter((item) => item.isActive);
  if (!rows.length) return [];
  const apiCategories: ApiCategory[] = rows.map((item) => ({ id: item.id, name: item.name, iconKey: item.iconKey, isActive: item.isActive, sortOrder: item.sortOrder }));
  const merged = mergeCategories(apiCategories);
  const displayById = new Map<string, ReMarketCategory>(merged.map((item) => [item.id, item]));
  const nodes: ShopCategory[] = rows.flatMap((item) => {
    const display = displayById.get(item.id);
    return display ? [{ ...display, parentId: item.parentId, imageUrl: item.imageUrl, sortOrder: item.sortOrder, children: [] }] : [];
  });
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const roots: ShopCategory[] = [];
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  const attached = new Set<string>();
  const mark = (items: ShopCategory[], trail = new Set<string>()) => {
    for (const item of items) {
      if (trail.has(item.id) || attached.has(item.id)) continue;
      attached.add(item.id);
      const next = new Set(trail);
      next.add(item.id);
      mark(item.children, next);
    }
  };
  mark(roots);
  const orphans = nodes.filter((item) => !attached.has(item.id));
  orphans.forEach((item) => { item.parentId = null; item.children = []; });
  return sortCategoryTree([...roots, ...orphans]);
}
function findCategoryById(categories: ShopCategory[], id: string): ShopCategory | null {
  for (const category of categories) {
    if (category.id === id) return category;
    const child = findCategoryById(category.children, id);
    if (child) return child;
  }
  return null;
}
function findCategoryByName(categories: ShopCategory[], name: string): ShopCategory | null {
  const target = name.trim().toLocaleLowerCase();
  if (!target) return null;
  for (const category of categories) {
    if (category.name.trim().toLocaleLowerCase() === target) return category;
    const child = findCategoryByName(category.children, name);
    if (child) return child;
  }
  return null;
}
function parseLocationStateGroups(value: unknown): LocationStateGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): LocationStateGroup[] => {
    if (!isRecord(raw)) return [];
    const state = cleanString(raw.state) ?? cleanString(raw.name);
    const rawGroups = Array.isArray(raw.lgas) ? raw.lgas : Array.isArray(raw.groups) ? raw.groups : [];
    if (!state) return [];
    const groups = rawGroups.flatMap((item): LocationLgaGroup[] => {
      if (!isRecord(item) || typeof item.lga !== "string" || !Array.isArray(item.areas)) return [];
      const lga = item.lga.trim();
      const areas = Array.from(new Set(item.areas.flatMap((area) => typeof area === "string" && area.trim() ? [area.trim()] : [])));
      return lga ? [{ lga, areas }] : [];
    });
    return groups.length ? [{ state, groups }] : [];
  });
}
function parseLegacyLagosGroups(value: unknown): LocationStateGroup[] {
  if (!Array.isArray(value)) return [];
  const groups = value.flatMap((item): LocationLgaGroup[] => {
    if (!isRecord(item) || typeof item.lga !== "string" || !Array.isArray(item.areas)) return [];
    const lga = item.lga.trim();
    const areas = item.areas.flatMap((area) => typeof area === "string" && area.trim() ? [area.trim()] : []);
    return lga && areas.length ? [{ lga, areas }] : [];
  });
  return groups.length ? [{ state: "Lagos", groups }] : [];
}
function parseProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null;
  const seller = isRecord(value.seller) ? value.seller : null;
  const id = cleanString(value.id);
  const name = cleanString(value.name);
  const sellerId = seller ? cleanString(seller.id) : null;
  const sellerName = seller ? cleanString(seller.name) : null;
  if (!id || !name || !seller || !sellerId || !sellerName) return null;
  const images: ProductImage[] = (Array.isArray(value.images) ? value.images : []).filter(isRecord).flatMap((image) => {
    const url = cleanString(image.url);
    return url ? [{ id: cleanString(image.id) ?? "", url, publicId: cleanString(image.publicId), sortOrder: typeof image.sortOrder === "number" && Number.isFinite(image.sortOrder) ? image.sortOrder : 0 }] : [];
  }).sort((a, b) => a.sortOrder - b.sortOrder);
  const price = parseOptionalNumber(value.price);
  const originalCandidate = parseOptionalNumber(value.originalPrice);
  const originalPrice = price !== null && originalCandidate !== null && originalCandidate > price ? originalCandidate : null;
  const verification = cleanString(seller.verification);
  const rawLocation = isRecord(seller.location) ? seller.location : null;
  const rawCategory = isRecord(value.category) ? value.category : null;
  const category: ProductCategory | null = rawCategory && typeof rawCategory.id === "string" && typeof rawCategory.name === "string" ? {
    id: rawCategory.id,
    name: rawCategory.name,
    iconKey: cleanString(rawCategory.iconKey),
    isActive: rawCategory.isActive === true,
    sortOrder: typeof rawCategory.sortOrder === "number" && Number.isFinite(rawCategory.sortOrder) ? rawCategory.sortOrder : 0,
  } : null;
  return {
    id, name, description: cleanString(value.description), price, originalPrice,
    stockQuantity: parseOptionalNumber(value.stockQuantity), availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl), images, category,
    keywords: Array.isArray(value.keywords) ? value.keywords.filter((item): item is string => typeof item === "string") : [],
    matchScore: parseOptionalNumber(value.matchScore) ?? 0,
    seller: {
      id: sellerId, name: sellerName, verification,
      verified: seller.verified === true || verification === "VERIFIED",
      location: rawLocation ? { area: cleanString(rawLocation.area), street: cleanString(rawLocation.street), lga: cleanString(rawLocation.lga), state: cleanString(rawLocation.state) } : null,
    },
  };
}
function buildShopUrl(filters: ShopFilters, page: number): string {
  const params = new URLSearchParams({ type: "product", pageSize: String(PAGE_SIZE), sort: filters.sort });
  const fields: Array<[string, string]> = [
    ["q", filters.query], ["category", filters.category], ["categoryId", filters.categoryId],
    ["state", filters.state], ["lga", filters.lga], ["area", filters.area],
    ["minPrice", filters.minPrice], ["maxPrice", filters.maxPrice], ["availability", filters.availability],
  ];
  fields.forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()); });
  if (filters.verified) params.set("verified", "true");
  if (page > 1) params.set("page", String(page));
  return `/shop?${params.toString()}`;
}
function parseSavedProductMap(value: unknown): SavedProductMap {
  if (!isRecord(value)) return {};
  const result: SavedProductMap = {};
  for (const collection of [value.items, value.savedListings, value.savedProducts, value.products, value.saved]) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      if (!isRecord(item)) continue;
      if (item.type === "PRODUCT" && isRecord(item.listing)) {
        const productId = cleanString(item.listing.id);
        const savedId = cleanString(item.id);
        if (productId && savedId) result[productId] = savedId;
        continue;
      }
      const nested = isRecord(item.product) ? item.product : null;
      const productId = cleanString(item.productId) ?? cleanString(item.listingId) ?? (nested ? cleanString(nested.id) : null);
      const savedId = cleanString(item.savedListingId) ?? cleanString(item.savedId) ?? (productId ? cleanString(item.id) : null);
      if (productId && savedId) result[productId] = savedId;
    }
  }
  return result;
}
function getSavedRecordId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["item", "savedListing", "saved"]) if (isRecord(value[key])) {
    const id = cleanString(value[key].id);
    if (id) return id;
  }
  return cleanString(value.savedListingId) ?? cleanString(value.savedId);
}

function ProductPrice({ product }: { product: Product }) {
  const discount = getDiscountPercentage(product);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[15px] font-bold leading-5 text-[#17202A] sm:text-base">{product.price !== null ? formatNaira(product.price) : "Ask seller"}</span>
        {product.originalPrice !== null && <del className="whitespace-nowrap text-[10px] text-[#958B83] sm:text-xs">{formatNaira(product.originalPrice)}</del>}
      </div>
      {discount !== null && <span className="mt-1 inline-flex rounded-sm bg-[#FFF0EA] px-1.5 py-0.5 text-[9px] font-semibold text-[#9F2D18]">{discount}% off</span>}
    </div>
  );
}

function ShopProductCard({
  product, saved, saving, adding, feedback, onToggleSaved, onAddToCart,
}: {
  product: Product; saved: boolean; saving: boolean; adding: boolean; feedback: CartFeedback;
  onToggleSaved: (product: Product) => void; onAddToCart: (product: Product) => void;
}) {
  const canAdd = canAddProductToCart(product);
  const imageUrl = product.imageUrl ?? product.images[0]?.url ?? null;
  const productUrl = `/product/${encodeURIComponent(product.id)}`;
  const productFeedback = feedback?.productId === product.id ? feedback : null;
  return (
    <article className="group flex min-w-0 flex-col border-b border-r border-[#EEE9E3] bg-white p-2.5 sm:rounded-md sm:border sm:p-3">
      <div className="relative aspect-square overflow-hidden bg-[#F8F7F4]">
        <Link href={productUrl} aria-label={`View ${product.name}`} className="absolute inset-0 flex items-center justify-center p-2 sm:p-3">
          {imageUrl ? <img src={imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.025]" /> : <Package className="h-9 w-9 text-[#BDB4AA]" aria-hidden="true" />}
        </Link>
        {getDiscountPercentage(product) !== null && <span className="absolute left-2 top-2 rounded-sm bg-[#9F2D18] px-1.5 py-1 text-[9px] font-bold text-white">-{getDiscountPercentage(product)}%</span>}
        <span className={`absolute bottom-2 left-2 rounded-sm px-1.5 py-1 text-[8px] font-semibold ${getAvailabilityClass(product)}`}>{getAvailabilityLabel(product)}</span>
        <button type="button" aria-label={saved ? `Remove ${product.name} from Saved` : `Save ${product.name}`} aria-pressed={saved} disabled={saving} onClick={() => onToggleSaved(product)} className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-[#E9E4DE] bg-white text-[#6F675F] shadow-sm transition hover:text-[#FF5A36] disabled:opacity-60 ${saved ? "text-[#FF5A36]" : ""}`}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" fill={saved ? "currentColor" : "none"} />}
        </button>
      </div>
      <div className="flex flex-1 flex-col pt-2.5">
        <div className="mb-1 flex min-h-4 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[9px] font-medium uppercase tracking-wide text-[#89796D]">{product.category?.name ?? "Product"}</p>
          {product.seller.verified && <span title="Verified seller" className="inline-flex shrink-0 items-center gap-0.5 text-[9px] font-medium text-[#26734F]"><BadgeCheck className="h-3 w-3" /> <span className="hidden sm:inline">Verified</span></span>}
        </div>
        <Link href={productUrl} className="line-clamp-2 min-h-[2.5rem] text-[12px] font-medium leading-5 text-[#252A2E] hover:text-[#9F2D18] sm:text-[13px]">{product.name}</Link>
        <div className="mt-1.5"><ProductPrice product={product} /></div>
        <div className="mt-1.5 flex min-w-0 items-center gap-1 text-[10px] text-[#777067]">
          <span className="truncate">{product.seller.name}</span>
          {product.seller.location?.area && <><span className="text-[#C4BBB1]">·</span><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{product.seller.location.area}</span></>}
        </div>
        <div className="mt-auto pt-2.5">
          <button type="button" disabled={!canAdd || adding} onClick={() => onAddToCart(product)} aria-label={canAdd ? `Add ${product.name} to cart` : `${product.name} is not available to buy`} className={`flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 disabled:cursor-not-allowed ${productFeedback?.kind === "success" ? "bg-[#E8F4EB] text-[#176B48]" : canAdd ? "bg-[#FF5A36] text-white hover:bg-[#E94A28]" : "bg-[#F2F0ED] text-[#8A8178]"}`}>
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : productFeedback?.kind === "success" ? <Check className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
            {adding ? "Adding" : productFeedback?.kind === "success" ? "Added to cart" : canAdd ? "Add to cart" : getAvailabilityLabel(product)}
          </button>
          {productFeedback?.kind === "error" && <p role="alert" className="mt-1.5 text-[9px] leading-4 text-[#B42318]">{productFeedback.message}</p>}
        </div>
      </div>
    </article>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="border-b border-[#EEE9E3] py-4 first:pt-0 last:border-b-0 last:pb-0"><h3 className="mb-2.5 text-[12px] font-semibold text-[#242B31]">{title}</h3>{children}</section>;
}

function ShopPageContent() {
  const params = useSearchParams();
  const initialQuery = params.get("q") ?? "";
  const initialCategory = params.get("category") ?? "";
  const initialCategoryId = params.get("categoryId") ?? "";
  const initialState = params.get("state") ?? "";
  const initialLga = params.get("lga") ?? "";
  const initialArea = params.get("area") ?? params.get("location") ?? "";
  const initialMinPrice = params.get("minPrice") ?? "";
  const initialMaxPrice = params.get("maxPrice") ?? "";
  const initialAvailability = parseAvailabilityFilter(params.get("availability") ?? "");
  const initialVerified = params.get("verified") === "true";
  const initialPage = parsePage(params.get("page"));
  const initialSort = parseSortMode(params.get("sort"));
  return <ShopPageView key={params.toString()} initialQuery={initialQuery} initialCategory={initialCategory} initialCategoryId={initialCategoryId} initialState={initialState} initialLga={initialLga} initialArea={initialArea} initialMinPrice={initialMinPrice} initialMaxPrice={initialMaxPrice} initialAvailability={initialAvailability} initialVerified={initialVerified} initialPage={initialPage} initialSort={initialSort} />;
}

type ShopPageViewProps = {
  initialQuery: string; initialCategory: string; initialCategoryId: string; initialState: string; initialLga: string;
  initialArea: string; initialMinPrice: string; initialMaxPrice: string; initialAvailability: string;
  initialVerified: boolean; initialPage: number; initialSort: SortMode;
};

function ShopPageView({
  initialQuery, initialCategory, initialCategoryId, initialState, initialLga, initialArea,
  initialMinPrice, initialMaxPrice, initialAvailability, initialVerified, initialPage, initialSort,
}: ShopPageViewProps) {
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
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [locationGroups, setLocationGroups] = useState<LocationStateGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);
  const [resultsTruncated, setResultsTruncated] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [maxSearchResults, setMaxSearchResults] = useState(120);
  const [filterValidationError, setFilterValidationError] = useState("");
  const [savedProducts, setSavedProducts] = useState<SavedProductMap>({});
  const [savingProductIds, setSavingProductIds] = useState<Record<string, boolean>>({});
  const [saveFeedback, setSaveFeedback] = useState("");
  const [saveFeedbackError, setSaveFeedbackError] = useState(false);
  const [addingProductIds, setAddingProductIds] = useState<Record<string, boolean>>({});
  const [cartFeedback, setCartFeedback] = useState<CartFeedback>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadFiltersData = async () => {
      const [categoryResult, locationResult] = await Promise.allSettled([
        fetch("/api/categories?type=product&includeEmpty=true", { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal }),
        fetch("/api/areas", { cache: "force-cache", headers: { Accept: "application/json" }, signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      if (categoryResult.status === "fulfilled" && categoryResult.value.ok) {
        const data: unknown = await categoryResult.value.json().catch(() => null);
        setCategories(parseCategoryTree(data));
      } else if (categoryResult.status === "rejected") console.error("Shop category loading error:", categoryResult.reason);
      if (locationResult.status === "fulfilled" && locationResult.value.ok) {
        const data: unknown = await locationResult.value.json().catch(() => null);
        if (isRecord(data)) {
          let parsed = parseLocationStateGroups(data.stateGroups);
          if (!parsed.length && isRecord(data.lgasByState)) {
            parsed = Object.entries(data.lgasByState).flatMap(([stateName, rawLgas]) => {
              const groups = Array.isArray(rawLgas) ? rawLgas.flatMap((raw): LocationLgaGroup[] => {
                const lgaName = typeof raw === "string" ? raw.trim() : isRecord(raw) ? cleanString(raw.lga) ?? cleanString(raw.name) ?? "" : "";
                return lgaName ? [{ lga: lgaName, areas: [] }] : [];
              }) : [];
              return stateName.trim() ? [{ state: stateName.trim(), groups }] : [];
            });
          }
          if (!parsed.length) parsed = parseLegacyLagosGroups(data.groups);
          if (!parsed.length && Array.isArray(data.states)) parsed = data.states.flatMap((raw): LocationStateGroup[] => {
            const name = typeof raw === "string" ? raw.trim() : isRecord(raw) ? cleanString(raw.state) ?? cleanString(raw.name) ?? "" : "";
            return name ? [{ state: name, groups: [] }] : [];
          });
          setLocationGroups(parsed);
        }
      } else if (locationResult.status === "rejected") console.error("Shop location loading error:", locationResult.reason);
    };
    void loadFiltersData();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSavedProducts() {
      const collected: SavedProductMap = {};
      try {
        const first = await fetch("/api/saved?type=PRODUCT&page=1&limit=50", { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
        if (first.status === 401 || first.status === 403) { setSavedProducts({}); return; }
        if (!first.ok) throw new Error("Unable to load saved products.");
        const firstData: unknown = await first.json();
        Object.assign(collected, parseSavedProductMap(firstData));
        const pagination = isRecord(firstData) && isRecord(firstData.pagination) ? firstData.pagination : null;
        const pages = pagination && typeof pagination.totalPages === "number" && Number.isInteger(pagination.totalPages) && pagination.totalPages > 0 ? Math.min(pagination.totalPages, 1000) : 1;
        for (let page = 2; page <= pages; page += 4) {
          const batch = Array.from({ length: Math.min(4, pages - page + 1) }, (_, index) => page + index);
          const maps = await Promise.all(batch.map(async (pageNumber) => {
            const response = await fetch(`/api/saved?type=PRODUCT&page=${pageNumber}&limit=50`, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
            if (!response.ok) throw new Error("Unable to load all saved products.");
            return parseSavedProductMap(await response.json());
          }));
          maps.forEach((map) => Object.assign(collected, map));
        }
        if (!controller.signal.aborted) setSavedProducts(collected);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) console.error("Saved products loading error:", err);
        if (!controller.signal.aborted && Object.keys(collected).length) setSavedProducts(collected);
      }
    }
    void loadSavedProducts();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProducts() {
      setLoading(true);
      setError("");
      setCartFeedback(null);
      try {
        const params = new URLSearchParams({ type: "product", page: String(initialPage), pageSize: String(PAGE_SIZE), sort: initialSort });
        const fields: Array<[string, string]> = [
          ["q", initialQuery], ["category", initialCategory], ["categoryId", initialCategoryId], ["state", initialState],
          ["lga", initialLga], ["area", initialArea], ["minPrice", initialMinPrice], ["maxPrice", initialMaxPrice], ["availability", initialAvailability],
        ];
        fields.forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()); });
        if (initialVerified) params.set("verified", "true");
        const response = await fetch(`/api/search?${params.toString()}`, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(isRecord(data) ? cleanString(data.error) ?? "Unable to load products." : "Unable to load products.");
        if (!isRecord(data)) throw new Error("The search API returned an invalid response.");
        const parsed = (Array.isArray(data.products) ? data.products : []).map(parseProduct).filter((item): item is Product => item !== null);
        if (controller.signal.aborted) return;
        const meta = isRecord(data.resultMeta) ? data.resultMeta : {};
        const readInt = (key: string, fallback: number, minimum = 0) => typeof meta[key] === "number" && Number.isSafeInteger(meta[key]) && (meta[key] as number) >= minimum ? meta[key] as number : fallback;
        const reportedTotal = readInt("totalProducts", parsed.length);
        const pageSize = readInt("pageSize", PAGE_SIZE, 1);
        const maxResults = readInt("maxResults", 120, 1);
        const cappedTotal = Math.min(reportedTotal, maxResults);
        setProducts(parsed);
        setTotalProducts(reportedTotal);
        setTotalPages(Math.max(1, readInt("totalPages", Math.max(1, Math.ceil(cappedTotal / pageSize)), 1)));
        setHasMoreResults(meta.hasMore === true);
        setMaxSearchResults(maxResults);
        setResultsTruncated(meta.truncated === true || reportedTotal > maxResults);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Products loading error:", err);
        setProducts([]); setTotalProducts(0); setTotalPages(1); setHasMoreResults(false); setMaxSearchResults(120); setResultsTruncated(false);
        setError(err instanceof Error ? err.message : "Unable to load products. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadProducts();
    return () => controller.abort();
  }, [initialQuery, initialCategory, initialCategoryId, initialState, initialLga, initialArea, initialMinPrice, initialMaxPrice, initialAvailability, initialVerified, initialPage, initialSort]);

  useEffect(() => {
    if (!showMobileFilters) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keyHandler = (event: KeyboardEvent) => { if (event.key === "Escape") setShowMobileFilters(false); };
    window.addEventListener("keydown", keyHandler);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", keyHandler); };
  }, [showMobileFilters]);

  const availableLgas = useMemo(() => {
    const selected = normalizeLocationName(state);
    if (!selected) return [];
    return locationGroups.find((item) => normalizeLocationName(item.state) === selected)?.groups.map((item) => item.lga) ?? [];
  }, [locationGroups, state]);
  const selectedCategory = useMemo(() => (categoryId ? findCategoryById(categories, categoryId) : null) ?? findCategoryByName(categories, category), [categories, categoryId, category]);
  const activeFilterCount = [categoryId || category, state || lga || area ? "LOCATION" : "", minPrice, maxPrice, availability, verified ? "VERIFIED" : ""].filter(Boolean).length;
  const currentPage = Math.min(Math.max(1, initialPage), totalPages);
  const resultStart = products.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const resultEnd = resultStart ? resultStart + products.length - 1 : 0;
  const title = selectedCategory?.name ?? (category || "All products");
  const countText = loading ? "Loading products…" : error ? "Products could not be loaded" : `${totalProducts.toLocaleString("en-NG")} ${totalProducts === 1 ? "product" : "products"}`;

  function currentFilters(): ShopFilters {
    return { query: initialQuery, category, categoryId, state, lga, area, minPrice, maxPrice, availability, verified, sort: initialSort };
  }
  function applyFilters() {
    const min = minPrice.trim() ? Number(minPrice) : null;
    const max = maxPrice.trim() ? Number(maxPrice) : null;
    if (min !== null && (!Number.isSafeInteger(min) || min < 0 || min > 1_000_000_000)) return setFilterValidationError("Minimum price must be a whole number between ₦0 and ₦1,000,000,000.");
    if (max !== null && (!Number.isSafeInteger(max) || max < 0 || max > 1_000_000_000)) return setFilterValidationError("Maximum price must be a whole number between ₦0 and ₦1,000,000,000.");
    if (min !== null && max !== null && min > max) return setFilterValidationError("Minimum price cannot be greater than maximum price.");
    setFilterValidationError("");
    router.push(buildShopUrl(currentFilters(), 1));
    setShowMobileFilters(false);
  }
  function selectCategory(next: ShopCategory | null) {
    const nextName = next?.name ?? "";
    const nextId = next?.id ?? "";
    setCategory(nextName); setCategoryId(nextId);
  }
  function clearFilters() {
    setCategory(""); setCategoryId(""); setState(""); setLga(""); setArea(""); setMinPrice(""); setMaxPrice(""); setAvailability(""); setVerified(false); setFilterValidationError(""); setShowMobileFilters(false);
    router.push(initialQuery ? `/shop?q=${encodeURIComponent(initialQuery)}` : "/shop");
  }
  function goToPage(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    router.push(buildShopUrl(currentFilters(), page));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleSavedProduct(product: Product) {
    if (savingProductIds[product.id]) return;
    setSaveFeedback(""); setSaveFeedbackError(false);
    setSavingProductIds((current) => ({ ...current, [product.id]: true }));
    try {
      const savedId = savedProducts[product.id];
      if (savedId) {
        const response = await fetch(`/api/saved/${encodeURIComponent(savedId)}`, { method: "DELETE", cache: "no-store", headers: { Accept: "application/json" } });
        const data: unknown = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) {
          router.push(`/buyer/login?callbackUrl=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return;
        }
        if (!response.ok) throw new Error(isRecord(data) ? cleanString(data.error) ?? "Unable to remove this saved product." : "Unable to remove this saved product.");
        setSavedProducts((current) => { const next = { ...current }; delete next[product.id]; return next; });
        setSaveFeedback("Product removed from Saved.");
      } else {
        const response = await fetch("/api/saved", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ type: "PRODUCT", listingId: product.id }) });
        const data: unknown = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) {
          router.push(`/buyer/login?callbackUrl=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return;
        }
        if (!response.ok) throw new Error(isRecord(data) ? cleanString(data.error) ?? "Unable to save this product." : "Unable to save this product.");
        const createdId = getSavedRecordId(data);
        if (createdId) setSavedProducts((current) => ({ ...current, [product.id]: createdId }));
        else await reloadSavedProducts();
        setSaveFeedback(isRecord(data) && data.alreadySaved === true ? "This product is already in Saved." : "Product added to Saved.");
      }
      window.dispatchEvent(new Event("remarket-saved-items-changed"));
    } catch (err) {
      console.error("Save product error:", err); setSaveFeedbackError(true); setSaveFeedback(err instanceof Error ? err.message : "Unable to update your saved products.");
    } finally {
      setSavingProductIds((current) => { const next = { ...current }; delete next[product.id]; return next; });
    }
  }
  async function reloadSavedProducts() {
    try {
      const response = await fetch("/api/saved?type=PRODUCT&page=1&limit=50", { cache: "no-store", headers: { Accept: "application/json" } });
      if (response.ok) setSavedProducts(parseSavedProductMap(await response.json()));
    } catch (err) { console.error("Unable to refresh saved products:", err); }
  }
  async function addProductToCart(product: Product) {
    if (addingProductIds[product.id] || !canAddProductToCart(product)) return;
    setCartFeedback(null); setAddingProductIds((current) => ({ ...current, [product.id]: true }));
    try {
      const response = await fetch("/api/cart/items", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ productId: product.id, quantity: 1 }) });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        router.push(`/buyer/login?callbackUrl=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return;
      }
      if (!response.ok) throw new Error(isRecord(data) ? cleanString(data.error) ?? cleanString(data.message) ?? "Unable to add this product to your cart." : "Unable to add this product to your cart.");
      setCartFeedback({ productId: product.id, kind: "success", message: "Added to cart successfully." });
      window.dispatchEvent(new Event("remarket-cart-changed"));
    } catch (err) {
      console.error("Add to cart error:", err); setCartFeedback({ productId: product.id, kind: "error", message: err instanceof Error ? err.message : "Unable to add this product to your cart." });
    } finally {
      setAddingProductIds((current) => { const next = { ...current }; delete next[product.id]; return next; });
    }
  }

  function renderFilterFields(prefix: "desktop" | "mobile") {
    return (
      <div className="space-y-1">
        <FilterSection title="Category">
          <select id={`${prefix}-shop-category`} aria-label="Filter by category" value={selectedCategory?.id ?? ""} onChange={(event) => selectCategory(findCategoryById(categories, event.target.value))} className="h-10 w-full rounded-md border border-[#E4DED6] bg-white px-3 text-xs text-[#252B31] outline-none focus:border-[#FF8A70] focus:ring-2 focus:ring-[#FF5A36]/10">
            <option value="">All categories</option>
            {categories.map((item) => <optgroup key={item.id} label={item.name}><option value={item.id}>All {item.name}</option>{item.children.map((child) => <option key={child.id} value={child.id}>— {child.name}</option>)}</optgroup>)}
          </select>
        </FilterSection>
        <FilterSection title="Location">
          <div className="space-y-3">
            <div><label htmlFor={`${prefix}-shop-state`} className="mb-1.5 block text-[10px] text-[#777067]">State</label><select id={`${prefix}-shop-state`} value={state} onChange={(event) => { setState(event.target.value); setLga(""); setArea(""); }} className="h-10 w-full rounded-md border border-[#E4DED6] bg-white px-3 text-xs outline-none focus:border-[#FF8A70]"><option value="">All supported states</option>{locationGroups.map((item) => <option key={item.state} value={item.state}>{item.state}</option>)}</select></div>
            <div><label htmlFor={`${prefix}-shop-lga`} className="mb-1.5 block text-[10px] text-[#777067]">Local Government Area</label><select id={`${prefix}-shop-lga`} value={lga} disabled={!state} onChange={(event) => { setLga(event.target.value); setArea(""); }} className="h-10 w-full rounded-md border border-[#E4DED6] bg-white px-3 text-xs outline-none focus:border-[#FF8A70] disabled:bg-[#F6F4F1]"><option value="">{state ? "All LGAs in selected state" : "Select a state first"}</option>{availableLgas.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
            <div><label htmlFor={`${prefix}-shop-area`} className="mb-1.5 block text-[10px] text-[#777067]">Area or neighbourhood</label><AreaAutocomplete id={`${prefix}-shop-area`} value={area} state={state || undefined} lga={lga || undefined} onChange={setArea} onSelect={(selected: AreaSelection) => { setState(selected.state); setLga(selected.lga); setArea(selected.area); }} placeholder="Search an area" /></div>
          </div>
        </FilterSection>
        <FilterSection title="Price range">
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor={`${prefix}-min-price`} className="mb-1.5 block text-[10px] text-[#777067]">Minimum (₦)</label><input id={`${prefix}-min-price`} type="number" min="0" max="1000000000" step="1" inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="0" className="h-10 w-full min-w-0 rounded-md border border-[#E4DED6] bg-white px-2.5 text-xs outline-none focus:border-[#FF8A70]" /></div>
            <div><label htmlFor={`${prefix}-max-price`} className="mb-1.5 block text-[10px] text-[#777067]">Maximum (₦)</label><input id={`${prefix}-max-price`} type="number" min="0" max="1000000000" step="1" inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Any" className="h-10 w-full min-w-0 rounded-md border border-[#E4DED6] bg-white px-2.5 text-xs outline-none focus:border-[#FF8A70]" /></div>
          </div>
        </FilterSection>
        {filterValidationError && <p role="alert" className="my-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] leading-4 text-red-700">{filterValidationError}</p>}
        <FilterSection title="Availability"><select id={`${prefix}-availability`} aria-label="Filter by availability" value={availability} onChange={(event) => setAvailability(parseAvailabilityFilter(event.target.value))} className="h-10 w-full rounded-md border border-[#E4DED6] bg-white px-3 text-xs outline-none focus:border-[#FF8A70]"><option value="">Any availability</option><option value="AVAILABLE">Available</option><option value="ASK_SELLER">Ask seller</option><option value="UNAVAILABLE">Unavailable</option></select></FilterSection>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-[#EEE9E3] bg-white p-3"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF5A36]" /><span><span className="block text-[11px] font-semibold text-[#252B31]">Verified sellers only</span><span className="mt-0.5 block text-[10px] leading-4 text-[#777067]">Show products from verified sellers.</span></span></label>
      </div>
    );
  }
  function renderFilterActions() {
    return <div className="grid grid-cols-2 gap-2 border-t border-[#EEE9E3] pt-3"><button type="button" onClick={clearFilters} className="flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[#E4DED6] bg-white px-3 py-2 text-[11px] font-semibold text-[#62574E] hover:bg-[#FAF8F5]"><RotateCcw className="h-3.5 w-3.5" /> Clear</button><button type="button" onClick={applyFilters} className="flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-[#FF5A36] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#E94A28]">Apply filters <ArrowRight className="h-3.5 w-3.5" /></button></div>;
  }

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />
      <main id="main-content" className="min-h-dvh overflow-x-clip bg-white pb-24 text-[#17202A] lg:pb-10">
        <div className="mx-auto w-full max-w-[1560px] px-3 pb-8 pt-4 sm:px-5 sm:pt-5 lg:px-7 xl:px-9">
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-[11px] text-[#81776E]"><Link href="/" className="hover:text-[#9F2D18]">Home</Link><ChevronRight className="h-3 w-3" /><span className="font-medium text-[#4F4943]">Shop</span></nav>
          <div className="mb-4 flex flex-col gap-3 border-b border-[#ECE7E1] pb-4 sm:flex-row sm:items-end sm:justify-between sm:pb-5">
            <div className="min-w-0"><h1 className="text-xl font-bold tracking-tight text-[#17202A] sm:text-2xl">{initialQuery ? `Results for “${initialQuery}”` : title}</h1><p className="mt-1 text-xs text-[#777067]">{countText}</p></div>
            {(activeFilterCount > 0 || initialQuery) && <button type="button" onClick={clearFilters} className="self-start text-[11px] font-semibold text-[#9F2D18] hover:text-[#FF5A36] sm:self-auto">Clear filters</button>}
          </div>

          <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowMobileFilters(true)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#E4DED6] bg-white px-3 py-2 text-[11px] font-semibold text-[#514840] hover:border-[#FF9A81] lg:hidden"><SlidersHorizontal className="h-3.5 w-3.5" /> Filters {activeFilterCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF5A36] px-1 text-[9px] text-white">{activeFilterCount}</span>}</button>
              <span className="hidden text-[11px] text-[#777067] sm:inline">{loading ? "Updating products…" : `${products.length} products on this page`}</span>
            </div>
            <label className="flex items-center gap-2"><span className="whitespace-nowrap text-[10px] text-[#777067] sm:text-[11px]">Sort by</span><span className="relative"><select aria-label="Sort products" value={initialSort} onChange={(event) => router.push(buildShopUrl({ ...currentFilters(), sort: parseSortMode(event.target.value) }, 1))} className="h-9 max-w-[190px] appearance-none rounded-md border border-[#E4DED6] bg-white py-2 pl-3 pr-8 text-[11px] font-semibold text-[#514840] outline-none focus:border-[#FF9A81]"><option value="relevance">Best match</option><option value="newest">Recently updated</option><option value="price-asc">Price: lowest first</option><option value="price-desc">Price: highest first</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#756B61]" /></span></label>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[236px_minmax(0,1fr)] xl:grid-cols-[252px_minmax(0,1fr)] xl:gap-7">
            <aside className="hidden min-w-0 lg:block"><div className="sticky top-[136px] border border-[#E9E4DE] bg-white p-4"><div className="mb-3 flex items-center justify-between border-b border-[#EEE9E3] pb-3"><div className="flex items-center gap-2"><Filter className="h-4 w-4 text-[#9F2D18]" /><h2 className="text-sm font-bold text-[#242B31]">Filter products</h2></div>{activeFilterCount > 0 && <span className="text-[10px] font-semibold text-[#9F2D18]">{activeFilterCount} applied</span>}</div>{renderFilterFields("desktop")}<div className="mt-4">{renderFilterActions()}</div></div></aside>

            <section aria-label="Product results" className="min-w-0">
              {saveFeedback && <div role={saveFeedbackError ? "alert" : "status"} className={`mb-4 flex items-center justify-between gap-3 border px-3 py-2.5 text-[11px] ${saveFeedbackError ? "border-red-200 bg-red-50 text-red-700" : "border-[#FFD9CE] bg-[#FFF5F1] text-[#9F2D18]"}`}><span>{saveFeedback}</span><button type="button" onClick={() => setSaveFeedback("")} aria-label="Dismiss message" className="rounded p-1 hover:bg-black/5"><X className="h-3.5 w-3.5" /></button></div>}
              {loading && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 sm:gap-3">{Array.from({ length: PAGE_SIZE }, (_, index) => <div key={index} className="overflow-hidden border border-[#EEE9E3] bg-white" aria-hidden="true"><div className="aspect-square animate-pulse bg-[#F1EEE9]" /><div className="space-y-2 p-3"><div className="h-2.5 w-3/4 animate-pulse bg-[#F1EEE9]" /><div className="h-3.5 w-1/2 animate-pulse bg-[#F1EEE9]" /><div className="h-9 animate-pulse bg-[#F1EEE9]" /></div></div>)}</div>}
              {!loading && error && <div className="border border-red-200 bg-red-50 px-5 py-10 text-center"><Package className="mx-auto h-9 w-9 text-red-400" /><h2 className="mt-3 text-sm font-bold text-red-800">We couldn’t load products.</h2><p className="mt-2 text-xs leading-5 text-red-700">{error}</p><button type="button" onClick={() => router.refresh()} className="mt-5 rounded-md bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]">Try again</button></div>}
              {!loading && !error && products.length === 0 && <div className="border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-12 text-center"><Package className="mx-auto h-10 w-10 text-[#B7ADA3]" /><h2 className="mt-4 text-sm font-bold text-[#17202A]">No products found</h2><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#756B61]">Try changing your category, location or price range.</p><button type="button" onClick={clearFilters} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]">Clear filters <RotateCcw className="h-3.5 w-3.5" /></button></div>}
              {!loading && !error && products.length > 0 && <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 sm:gap-3">
                  {products.map((product) => <ShopProductCard key={product.id} product={product} saved={Boolean(savedProducts[product.id])} saving={Boolean(savingProductIds[product.id])} adding={Boolean(addingProductIds[product.id])} feedback={cartFeedback?.productId === product.id ? cartFeedback : null} onToggleSaved={(item) => void toggleSavedProduct(item)} onAddToCart={(item) => void addProductToCart(item)} />)}
                </div>
                {resultsTruncated && <div className="mt-5 border border-[#F2E3C9] bg-[#FFFAF0] px-4 py-3 text-[11px] leading-5 text-[#785B25]">Search results are limited to the first {maxSearchResults.toLocaleString("en-NG")} matches. Narrow your search or add filters to find more specific products.</div>}
                {totalPages > 1 && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECE7E1] pt-4"><p className="text-[10px] text-[#756B61] sm:text-[11px]">Showing {resultStart}–{resultEnd}{resultsTruncated ? ` of the first ${maxSearchResults.toLocaleString("en-NG")} results` : ` of ${totalProducts.toLocaleString("en-NG")}`}</p><div className="flex items-center gap-2"><button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page" className="flex h-9 w-9 items-center justify-center border border-[#E4DED6] bg-white text-[#9F2D18] hover:bg-[#FFF5F1] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span className="min-w-[74px] text-center text-[11px] font-semibold text-[#514840]">Page {currentPage} of {totalPages}</span><button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages || !hasMoreResults} aria-label="Next page" className="flex h-9 w-9 items-center justify-center border border-[#E4DED6] bg-white text-[#9F2D18] hover:bg-[#FFF5F1] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>}
              </>}
            </section>
          </div>
          <footer className="mt-10 flex items-center justify-center gap-3 border-t border-[#ECE7E1] pt-5 text-[10px] text-[#9B9188]"><span className="h-px w-10 bg-[#EAE6DF]" /><span>ReMarket · Find it nearby</span><span className="h-px w-10 bg-[#EAE6DF]" /></footer>
        </div>
      </main>

      {showMobileFilters && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#17202A]/45 sm:items-center sm:p-4 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMobileFilters(false); }}><section role="dialog" aria-modal="true" aria-labelledby={FILTER_DIALOG_TITLE} className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden border border-[#EAE6DF] bg-white shadow-2xl sm:rounded-lg"><div className="flex shrink-0 items-center justify-between border-b border-[#ECE7E1] px-4 py-4 sm:px-5"><div><h2 id={FILTER_DIALOG_TITLE} className="text-base font-bold text-[#17202A]">Filter products</h2><p className="mt-0.5 text-[11px] text-[#756B61]">Choose your preferred category, location and price.</p></div><button type="button" onClick={() => setShowMobileFilters(false)} aria-label="Close filters" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F4F1ED] text-[#62574E] hover:bg-[#FFF0EB] hover:text-[#9F2D18]"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{renderFilterFields("mobile")}</div><div className="shrink-0 border-t border-[#ECE7E1] bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5">{renderFilterActions()}</div></section></div>}
      <MobileBottomNav />
    </>
  );
}

export default function ShopPage() {
  return <Suspense fallback={<><SiteHeader searchMode="PRODUCTS" /><main className="min-h-dvh bg-white px-3 pb-24 pt-6 sm:px-5 lg:px-8"><div className="mx-auto max-w-[1560px]"><div className="mb-5 h-8 w-48 animate-pulse bg-[#F1EEE9]" /><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4 sm:gap-3">{Array.from({ length: 8 }, (_, index) => <div key={index} className="overflow-hidden border border-[#EEE9E3] bg-white"><div className="aspect-square animate-pulse bg-[#F1EEE9]" /><div className="space-y-2 p-3"><div className="h-2.5 w-3/4 animate-pulse bg-[#F1EEE9]" /><div className="h-3.5 w-1/2 animate-pulse bg-[#F1EEE9]" /></div></div>)}</div></div></main><MobileBottomNav /></>}><ShopPageContent /></Suspense>;
}
