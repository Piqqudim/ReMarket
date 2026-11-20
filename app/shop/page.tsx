"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
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
  Package,
  RotateCcw,
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
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type SortMode = "relevance" | "newest" | "price-asc" | "price-desc";
type ProductImage = { id: string; url: string; publicId: string | null; sortOrder: number };
type ProductCategory = {
  id: string;
  name: string;
  iconKey: string | null;
  isActive: boolean;
  sortOrder: number;
};
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
type ShopPageViewProps = {
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
type SavedProductMap = Record<string, string>;
type CartFeedback = {
  productId: string;
  kind: "success" | "error";
  message: string;
} | null;
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
const MOBILE_FILTER_TITLE_ID = "shop-mobile-filter-title";

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
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function parseCategoryRows(payload: unknown): RawCategory[] {
  if (!isRecord(payload)) return [];
  const source = Array.isArray(payload.navigationCategories) && payload.navigationCategories.length > 0
    ? payload.navigationCategories
    : payload.categories;
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
      const parentId = cleanString(value.parentId) ?? inheritedParentId;
      rows.push({
        id,
        name,
        iconKey: cleanString(value.iconKey),
        isActive: value.isActive !== false,
        sortOrder:
          typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder)
            ? value.sortOrder
            : 0,
        parentId,
        imageUrl: cleanString(value.imageUrl),
      });
      if (Array.isArray(value.children)) visit(value.children, id);
    }
  };

  visit(source, null);
  return rows;
}

function sortCategoryTree(items: ShopCategory[]): ShopCategory[] {
  return [...items]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((item) => ({ ...item, children: sortCategoryTree(item.children) }));
}

function parseCategoryTree(payload: unknown): ShopCategory[] {
  const rows = parseCategoryRows(payload).filter((item) => item.isActive);
  if (!rows.length) return [];

  const apiCategories: ApiCategory[] = rows.map((item) => ({
    id: item.id,
    name: item.name,
    iconKey: item.iconKey,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
  }));
  const merged = mergeCategories(apiCategories);
  const displayById = new Map<string, ReMarketCategory>(
    merged.map((item) => [item.id, item] as const),
  );
  const nodes = rows.flatMap((item): ShopCategory[] => {
    const display = displayById.get(item.id);
    if (!display) return [];
    return [{
      ...display,
      parentId: item.parentId,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
      children: [],
    }];
  });

  const byId = new Map<string, ShopCategory>(nodes.map((item) => [item.id, item] as const));
  const roots: ShopCategory[] = [];
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  // Orphaned or malformed rows remain visible instead of silently disappearing.
  const attachedIds = new Set<string>();
  const markAttached = (items: ShopCategory[], trail = new Set<string>()) => {
    for (const item of items) {
      if (trail.has(item.id) || attachedIds.has(item.id)) continue;
      attachedIds.add(item.id);
      const nextTrail = new Set(trail);
      nextTrail.add(item.id);
      markAttached(item.children, nextTrail);
    }
  };
  markAttached(roots);
  const orphans = nodes.filter((item) => !attachedIds.has(item.id));
  // Detach orphaned nodes completely so malformed cycles cannot recurse forever.
  orphans.forEach((item) => {
    item.parentId = null;
    item.children = [];
  });
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
    const rawGroups = Array.isArray(raw.lgas)
      ? raw.lgas
      : Array.isArray(raw.groups)
        ? raw.groups
        : [];
    if (!state) return [];
    const groups = rawGroups.flatMap((item): LocationLgaGroup[] => {
      if (!isRecord(item) || typeof item.lga !== "string" || !Array.isArray(item.areas)) return [];
      const lga = item.lga.trim();
      const areas = Array.from(new Set(item.areas.flatMap((area) => {
        if (typeof area !== "string") return [];
        const cleaned = area.trim();
        return cleaned ? [cleaned] : [];
      })));
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
    const areas = item.areas.flatMap((area) => {
      if (typeof area !== "string") return [];
      const cleaned = area.trim();
      return cleaned ? [cleaned] : [];
    });
    return lga && areas.length ? [{ lga, areas }] : [];
  });
  return groups.length ? [{ state: "Lagos", groups }] : [];
}

function parseAvailability(value: unknown): Availability {
  return value === "AVAILABLE" || value === "UNAVAILABLE" || value === "ASK_SELLER"
    ? value
    : "ASK_SELLER";
}

function parseAvailabilityFilter(value: string): Availability | "" {
  return value === "AVAILABLE" || value === "ASK_SELLER" || value === "UNAVAILABLE"
    ? value
    : "";
}

function parseCategory(value: unknown): ProductCategory | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    iconKey: cleanString(value.iconKey),
    isActive: value.isActive === true,
    sortOrder: typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder)
      ? value.sortOrder
      : 0,
  };
}

function parseProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null;

  const seller = isRecord(value.seller) ? value.seller : null;
  const id = cleanString(value.id);
  const name = cleanString(value.name);
  const sellerId = seller ? cleanString(seller.id) : null;
  const sellerName = seller ? cleanString(seller.name) : null;

  if (!id || !name || !seller || !sellerId || !sellerName) return null;

  const images: ProductImage[] = (Array.isArray(value.images) ? value.images : [])
    .filter(isRecord)
    .flatMap((image): ProductImage[] => {
      const url = cleanString(image.url);
      if (!url) return [];
      return [{
        id: cleanString(image.id) ?? "",
        url,
        publicId: cleanString(image.publicId),
        sortOrder: typeof image.sortOrder === "number" && Number.isFinite(image.sortOrder)
          ? image.sortOrder
          : 0,
      }];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const price = parseOptionalNumber(value.price);
  const originalCandidate = parseOptionalNumber(value.originalPrice);
  const originalPrice = price !== null && originalCandidate !== null && originalCandidate > price
    ? originalCandidate
    : null;
  const verification = cleanString(seller.verification);
  const rawLocation = isRecord(seller.location) ? seller.location : null;

  return {
    id,
    name,
    description: cleanString(value.description),
    price,
    originalPrice,
    stockQuantity: parseOptionalNumber(value.stockQuantity),
    availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl),
    images,
    category: parseCategory(value.category),
    keywords: Array.isArray(value.keywords)
      ? value.keywords.filter((item): item is string => typeof item === "string")
      : [],
    matchScore: parseOptionalNumber(value.matchScore) ?? 0,
    seller: {
      id: sellerId,
      name: sellerName,
      verification,
      verified: seller.verified === true || verification === "VERIFIED",
      location: rawLocation ? {
        area: cleanString(rawLocation.area),
        street: cleanString(rawLocation.street),
        lga: cleanString(rawLocation.lga),
        state: cleanString(rawLocation.state),
      } : null,
    },
  };
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

function parseSortMode(value: string | null): SortMode {
  return value === "relevance" || value === "price-asc" || value === "price-desc" || value === "newest"
    ? value
    : "newest";
}

function formatNaira(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`;
}

function getDiscountPercentage(product: Product): number | null {
  if (
    product.price === null ||
    product.price <= 0 ||
    product.originalPrice === null ||
    product.originalPrice <= product.price
  ) return null;
  return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
}

function formatPrice(product: Product): string {
  return product.price !== null ? formatNaira(product.price) : "Ask seller";
}

function getAvailabilityLabel(product: Pick<Product, "availability" | "stockQuantity">): string {
  if (product.availability === "UNAVAILABLE" || product.stockQuantity === 0) return "Out of stock";
  if (product.availability === "AVAILABLE") return "Available";
  return "Ask seller";
}

function getAvailabilityStyle(product: Pick<Product, "availability" | "stockQuantity">): string {
  if (product.availability === "UNAVAILABLE" || product.stockQuantity === 0) {
    return "bg-[#FEE2E2] text-[#B42318]";
  }
  if (product.availability === "AVAILABLE") return "bg-[#DCFCE7] text-[#166534]";
  return "bg-[#FEF3C7] text-[#92400E]";
}

function canAddProductToCart(
  product: Pick<Product, "price" | "availability" | "stockQuantity">,
): boolean {
  return product.availability === "AVAILABLE" &&
    product.price !== null && product.price > 0 && product.stockQuantity !== 0;
}

function buildShopUrl(filters: ShopFilters, page: number): string {
  const params = new URLSearchParams();
  params.set("type", "product");
  params.set("pageSize", String(PAGE_SIZE));
  params.set("sort", filters.sort);

  const fields: Array<[string, string]> = [
    ["q", filters.query],
    ["category", filters.category],
    ["categoryId", filters.categoryId],
    ["state", filters.state],
    ["lga", filters.lga],
    ["area", filters.area],
    ["minPrice", filters.minPrice],
    ["maxPrice", filters.maxPrice],
    ["availability", filters.availability],
  ];
  fields.forEach(([key, value]) => {
    if (value.trim()) params.set(key, value.trim());
  });
  if (filters.verified) params.set("verified", "true");
  if (page > 1) params.set("page", String(page));
  return `/shop?${params.toString()}`;
}

function parseSavedProductMap(value: unknown): SavedProductMap {
  if (!isRecord(value)) return {};
  const result: SavedProductMap = {};
  const collections = [value.items, value.savedListings, value.savedProducts, value.products, value.saved];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const item of collection) {
      if (!isRecord(item)) continue;
      if (item.type === "PRODUCT" && isRecord(item.listing)) {
        const productId = cleanString(item.listing.id);
        const savedId = cleanString(item.id);
        if (productId && savedId) result[productId] = savedId;
        continue;
      }
      const nestedProduct = isRecord(item.product) ? item.product : null;
      const productId = cleanString(item.productId) ?? cleanString(item.listingId) ??
        (nestedProduct ? cleanString(nestedProduct.id) : null);
      const savedId = cleanString(item.savedListingId) ?? cleanString(item.savedId) ??
        (productId ? cleanString(item.id) : null);
      if (productId && savedId) result[productId] = savedId;
    }
  }
  return result;
}

function getSavedRecordId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["item", "savedListing", "saved"]) {
    if (isRecord(value[key])) {
      const id = cleanString(value[key].id);
      if (id) return id;
    }
  }
  return cleanString(value.savedListingId) ?? cleanString(value.savedId);
}

function ProductPrice({ product }: { product: Product }) {
  const discount = getDiscountPercentage(product);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[15px] font-extrabold leading-5 text-[#9F2D18] sm:text-base">
          {formatPrice(product)}
        </span>
        {product.originalPrice !== null && product.price !== null && (
          <del className="whitespace-nowrap text-[10px] text-[#958B83] sm:text-xs">
            {formatNaira(product.originalPrice)}
          </del>
        )}
      </div>
      {discount !== null && (
        <span className="mt-1 inline-flex rounded bg-[#FFF0EA] px-1.5 py-0.5 text-[9px] font-semibold text-[#9F2D18]">
          {discount}% off
        </span>
      )}
    </div>
  );
}

function ShopProductCard({
  product,
  saved,
  saving,
  adding,
  feedback,
  onToggleSaved,
  onAddToCart,
}: {
  product: Product;
  saved: boolean;
  saving: boolean;
  adding: boolean;
  feedback: CartFeedback;
  onToggleSaved: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}) {
  const canAdd = canAddProductToCart(product);
  const discount = getDiscountPercentage(product);
  const imageUrl = product.imageUrl ?? product.images[0]?.url ?? null;
  const productUrl = `/product/${encodeURIComponent(product.id)}`;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#EAE6DF] bg-white transition-colors hover:border-[#FFB5A2] hover:shadow-[0_5px_18px_rgba(23,32,42,0.07)]">
      <div className="relative aspect-square overflow-hidden bg-[#FCFAF6]">
        <Link
          href={productUrl}
          aria-label={`View ${product.name}`}
          className="absolute inset-0 flex items-center justify-center p-3 sm:p-4"
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.035]"
            />
          ) : (
            <Package className="h-10 w-10 text-[#C3B9AE]" aria-hidden="true" />
          )}
        </Link>

        {discount !== null && (
          <span className="absolute bottom-2 left-2 rounded bg-[#9F2D18] px-2 py-1 text-[9px] font-bold text-white">
            -{discount}%
          </span>
        )}

        <span className={`absolute bottom-2 right-2 rounded-full px-2 py-1 text-[8px] font-semibold shadow-sm ${getAvailabilityStyle(product)}`}>
          {getAvailabilityLabel(product)}
        </span>

        <button
          type="button"
          aria-label={saved ? `Remove ${product.name} from Saved` : `Save ${product.name}`}
          aria-pressed={saved}
          disabled={saving}
          onClick={() => onToggleSaved(product)}
          className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[#EAE6DF] bg-white/95 shadow-sm transition hover:scale-105 disabled:opacity-60 ${saved ? "text-[#FF5A36]" : "text-[#756B61] hover:text-[#FF5A36]"}`}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Heart className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
          )}
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        <div className="mb-1 flex min-h-4 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-wide text-[#8A6252]">
            {product.category?.name ?? "Product"}
          </p>
          {product.seller.verified && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold text-[#237A57]" title="Verified seller">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Verified
            </span>
          )}
        </div>

        <Link
          href={productUrl}
          className="line-clamp-2 min-h-10 text-[12px] font-semibold leading-5 text-[#17202A] transition hover:text-[#9F2D18] sm:text-[13px]"
        >
          {product.name}
        </Link>

        <div className="mt-2">
          <ProductPrice product={product} />
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[10px] text-[#756B61]">
          <span className="truncate">Sold by {product.seller.name}</span>
        </div>

        <div className="mt-auto pt-3">
          <button
            type="button"
            disabled={!canAdd || adding}
            onClick={() => onAddToCart(product)}
            aria-label={canAdd ? `Add ${product.name} to cart` : `${product.name} cannot be added to cart`}
            title={!canAdd ? "This product needs an available status, fixed price and stock." : "Add to cart"}
            className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 disabled:cursor-not-allowed ${feedback?.productId === product.id && feedback.kind === "success"
              ? "bg-[#DCFCE7] text-[#166534]"
              : canAdd
                ? "bg-[#FF5A36] text-white hover:bg-[#E94A28]"
                : "bg-[#F0ECE7] text-[#8A8077]"}`}
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : feedback?.productId === product.id && feedback.kind === "success" ? (
              <Check className="h-4 w-4" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            {adding ? "Adding…" : !canAdd ? "Not available to buy" : feedback?.productId === product.id && feedback.kind === "success" ? "Added to cart" : "Add to cart"}
          </button>
          {feedback?.productId === product.id && feedback.kind === "error" && (
            <p role="alert" className="mt-1.5 text-[9px] leading-4 text-[#B42318]">{feedback.message}</p>
          )}
        </div>
      </div>
    </article>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#EAE6DF] py-4 first:pt-0 last:border-b-0 last:pb-0">
      <h3 className="mb-3 text-[12px] font-bold text-[#17202A]">{title}</h3>
      {children}
    </section>
  );
}

function ShopPageContent() {
  const searchParams = useSearchParams();
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
  const initialPage = parsePage(searchParams.get("page"));
  const initialSort = parseSortMode(searchParams.get("sort"));
  return (
    <ShopPageView
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

function ShopPageView({
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
}: ShopPageViewProps) {
  const router = useRouter();
  const query = initialQuery;
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
  const [isDesktop, setIsDesktop] = useState(false);
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [locationGroups, setLocationGroups] = useState<LocationStateGroup[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);
  const [resultsTruncated, setResultsTruncated] = useState(false);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [maxSearchResults, setMaxSearchResults] = useState(120);
  const [filterValidationError, setFilterValidationError] = useState("");
  const [savedProducts, setSavedProducts] = useState<SavedProductMap>({});
  const [savingProductIds, setSavingProductIds] = useState<Record<string, boolean>>({});
  const [saveFeedback, setSaveFeedback] = useState("");
  const [saveFeedbackError, setSaveFeedbackError] = useState(false);
  const [addingToCartProductIds, setAddingToCartProductIds] = useState<Record<string, boolean>>({});
  const [cartFeedback, setCartFeedback] = useState<CartFeedback>(null);

  useEffect(() => {
    setCategory(initialCategory);
    setCategoryId(initialCategoryId);
    setState(initialState);
    setLga(initialLga);
    setArea(initialArea);
    setMinPrice(initialMinPrice);
    setMaxPrice(initialMaxPrice);
    setAvailability(initialAvailability);
    setVerified(initialVerified);
  }, [
    initialCategory, initialCategoryId, initialState, initialLga, initialArea,
    initialMinPrice, initialMaxPrice, initialAvailability, initialVerified,
  ]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const updateViewport = () => {
      setIsDesktop(media.matches);
      if (media.matches) setShowMobileFilters(false);
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!showMobileFilters) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowMobileFilters(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMobileFilters]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCategories() {
      try {
        const response = await fetch("/api/categories?type=product&includeEmpty=true", {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load product categories.");
        const data: unknown = await response.json();
        if (!isRecord(data)) throw new Error("Invalid category response.");
        if (!controller.signal.aborted) setCategories(parseCategoryTree(data));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Shop category loading error:", err);
        if (!controller.signal.aborted) setCategories([]);
      }
    }
    async function loadLocations() {
      try {
        const response = await fetch("/api/areas", {
          cache: "force-cache",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load location suggestions.");
        const data: unknown = await response.json();
        if (!isRecord(data)) throw new Error("Invalid location response.");
        let parsed = parseLocationStateGroups(data.stateGroups);

        if (parsed.length === 0 && isRecord(data.lgasByState)) {
          parsed = Object.entries(data.lgasByState).flatMap(([stateName, rawLgas]) => {
            const stateNameClean = stateName.trim();
            if (!stateNameClean || !Array.isArray(rawLgas)) return [];
            const groups = rawLgas.flatMap((rawLga): LocationLgaGroup[] => {
              const lga = typeof rawLga === "string"
                ? rawLga.trim()
                : isRecord(rawLga)
                  ? cleanString(rawLga.lga) ?? cleanString(rawLga.name) ?? ""
                  : "";
              return lga ? [{ lga, areas: [] }] : [];
            });
            return [{ state: stateNameClean, groups }];
          });
        }

        if (parsed.length === 0) parsed = parseLegacyLagosGroups(data.groups);
        if (parsed.length === 0 && Array.isArray(data.states)) {
          parsed = data.states.flatMap((rawState) => {
            const stateName = typeof rawState === "string"
              ? rawState.trim()
              : isRecord(rawState)
                ? cleanString(rawState.state) ?? cleanString(rawState.name) ?? ""
                : "";
            return stateName ? [{ state: stateName, groups: [] }] : [];
          });
        }
        if (!controller.signal.aborted) setLocationGroups(parsed);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Shop location loading error:", err);
        if (!controller.signal.aborted) setLocationGroups([]);
      }
    }
    void loadCategories();
    void loadLocations();
    return () => controller.abort();
  }, []);

  const availableLgas = useMemo(() => {
    const selectedState = normalizeLocationName(state);
    if (!selectedState) return [];
    return locationGroups.find((item) => normalizeLocationName(item.state) === selectedState)
      ?.groups.map((item) => item.lga) ?? [];
  }, [locationGroups, state]);

  const selectedCategory = useMemo(() => {
    return (categoryId ? findCategoryById(categories, categoryId) : null) ??
      findCategoryByName(categories, category);
  }, [categories, categoryId, category]);



  async function loadSavedProducts(signal?: AbortSignal): Promise<SavedProductMap> {
    const combined: SavedProductMap = {};
    try {
      const firstResponse = await fetch("/api/saved?type=PRODUCT&page=1&limit=50", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      if (firstResponse.status === 401 || firstResponse.status === 403) {
        if (!signal?.aborted) setSavedProducts({});
        return {};
      }
      if (!firstResponse.ok) throw new Error("Unable to load saved products.");
      const firstData: unknown = await firstResponse.json();
      Object.assign(combined, parseSavedProductMap(firstData));
      const pagination = isRecord(firstData) && isRecord(firstData.pagination)
        ? firstData.pagination
        : null;
      const totalPages = pagination && typeof pagination.totalPages === "number" &&
        Number.isInteger(pagination.totalPages) && pagination.totalPages > 0
        ? Math.min(pagination.totalPages, 1000)
        : 1;
      for (let page = 2; page <= totalPages; page += 4) {
        if (signal?.aborted) return combined;
        const pages = Array.from({ length: Math.min(4, totalPages - page + 1) }, (_, index) => page + index);
        const maps = await Promise.all(pages.map(async (pageNumber) => {
          const response = await fetch(`/api/saved?type=PRODUCT&page=${pageNumber}&limit=50`, {
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal,
          });
          if (!response.ok) throw new Error("Unable to load all saved products.");
          return parseSavedProductMap(await response.json());
        }));
        maps.forEach((item) => Object.assign(combined, item));
      }
      if (!signal?.aborted) setSavedProducts(combined);
      return combined;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return combined;
      console.error("Saved products loading error:", err);
      if (!signal?.aborted && Object.keys(combined).length) setSavedProducts(combined);
      return combined;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadSavedProducts(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setLoading(true);
      setError("");
      setCartFeedback(null);

      try {
        const params = new URLSearchParams();
        params.set("type", "product");
        params.set("page", String(initialPage));
        params.set("pageSize", String(PAGE_SIZE));
        params.set("sort", initialSort);

        const fields: Array<[string, string]> = [
          ["q", initialQuery],
          ["category", initialCategory],
          ["categoryId", initialCategoryId],
          ["state", initialState],
          ["lga", initialLga],
          ["area", initialArea],
          ["minPrice", initialMinPrice],
          ["maxPrice", initialMaxPrice],
          ["availability", initialAvailability],
        ];
        fields.forEach(([key, value]) => {
          if (value.trim()) params.set(key, value.trim());
        });
        if (initialVerified) params.set("verified", "true");

        const response = await fetch(`/api/search?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Unable to load products.");
        }
        if (!isRecord(data)) throw new Error("The search API returned an invalid response.");

        const rawProducts = Array.isArray(data.products) ? data.products : [];
        const parsedProducts = rawProducts
          .map(parseProduct)
          .filter((item): item is Product => item !== null);
        if (controller.signal.aborted) return;

        const meta = isRecord(data.resultMeta) ? data.resultMeta : {};
        const readMetaInteger = (key: string, fallback: number, minimum = 0) => {
          const candidate = meta[key];
          return typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= minimum
            ? candidate
            : fallback;
        };

        const reportedTotal = readMetaInteger("totalProducts", parsedProducts.length);
        const reportedPageSize = readMetaInteger("pageSize", PAGE_SIZE, 1);
        const reportedMax = readMetaInteger("maxResults", 120, 1);
        const cappedTotal = Math.min(reportedTotal, reportedMax);
        const reportedPages = readMetaInteger(
          "totalPages",
          Math.max(1, Math.ceil(cappedTotal / reportedPageSize)),
        );

        setProducts(parsedProducts);
        setTotalProducts(reportedTotal);
        setServerTotalPages(Math.max(1, reportedPages));
        setHasMoreResults(meta.hasMore === true);
        setMaxSearchResults(reportedMax);
        setResultsTruncated(meta.truncated === true || reportedTotal > reportedMax);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Products loading error:", err);
        setProducts([]);
        setTotalProducts(0);
        setServerTotalPages(1);
        setHasMoreResults(false);
        setMaxSearchResults(120);
        setResultsTruncated(false);
        setError(err instanceof Error ? err.message : "Unable to load products. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadProducts();
    return () => controller.abort();
  }, [
    initialQuery, initialCategory, initialCategoryId, initialState, initialLga,
    initialArea, initialMinPrice, initialMaxPrice, initialAvailability,
    initialVerified, initialPage, initialSort,
  ]);

  const totalPages = Math.max(1, serverTotalPages);
  const currentPage = Math.min(Math.max(1, initialPage), totalPages);
  const visibleProducts = products;
  const resultStart = visibleProducts.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const resultEnd = resultStart ? resultStart + visibleProducts.length - 1 : 0;

  useEffect(() => {
    if (loading || currentPage === initialPage) return;
    router.replace(buildShopUrl({
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
    }, currentPage));
  }, [
    loading, currentPage, initialPage, initialQuery, initialCategory,
    initialCategoryId, initialState, initialLga, initialArea,
    initialMinPrice, initialMaxPrice, initialAvailability,
    initialVerified, initialSort, router,
  ]);

  function getCurrentFilters(): ShopFilters {
    return {
      query, category, categoryId, state, lga, area, minPrice, maxPrice,
      availability, verified, sort: initialSort,
    };
  }

  function applyFilters() {
    const min = minPrice.trim() ? Number(minPrice) : null;
    const max = maxPrice.trim() ? Number(maxPrice) : null;
    if (min !== null && (!Number.isSafeInteger(min) || min < 0 || min > 1_000_000_000)) {
      setFilterValidationError("Minimum price must be a whole number between ₦0 and ₦1,000,000,000.");
      return;
    }
    if (max !== null && (!Number.isSafeInteger(max) || max < 0 || max > 1_000_000_000)) {
      setFilterValidationError("Maximum price must be a whole number between ₦0 and ₦1,000,000,000.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setFilterValidationError("Minimum price cannot be greater than maximum price.");
      return;
    }
    setFilterValidationError("");
    router.push(buildShopUrl(getCurrentFilters(), 1));
    setShowMobileFilters(false);
  }

  function selectCategory(next: ShopCategory | null) {
    const nextCategory = next?.name ?? "";
    const nextCategoryId = next?.id ?? "";
    setCategory(nextCategory);
    setCategoryId(nextCategoryId);
    router.push(buildShopUrl({
      ...getCurrentFilters(),
      category: nextCategory,
      categoryId: nextCategoryId,
    }, 1));
    setShowMobileFilters(false);
  }

  function handleAreaChange(value: string) {
    setArea(value);
  }

  function handleAreaSelect(selected: AreaSelection) {
    setState(selected.state);
    setLga(selected.lga);
    setArea(selected.area);
  }

  function clearFilters() {
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
    setShowMobileFilters(false);
    router.push("/shop");
  }

  function goToPage(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    router.push(buildShopUrl(getCurrentFilters(), page));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const activeFilterCount = [
    categoryId || category,
    state || lga || area ? "LOCATION" : "",
    minPrice,
    maxPrice,
    availability,
    verified ? "VERIFIED" : "",
  ].filter(Boolean).length;

  async function toggleSavedProduct(product: Product) {
    if (savingProductIds[product.id]) return;
    setSaveFeedback("");
    setSaveFeedbackError(false);
    setSavingProductIds((current) => ({ ...current, [product.id]: true }));
    try {
      const savedId = savedProducts[product.id];
      if (savedId) {
        const response = await fetch(`/api/saved/${encodeURIComponent(savedId)}`, {
          method: "DELETE",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const data: unknown = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) {
          const callbackUrl = `${window.location.pathname}${window.location.search}`;
          router.push(`/buyer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
          return;
        }
        if (!response.ok) {
          throw new Error(isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Unable to remove this saved product.");
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
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ type: "PRODUCT", listingId: product.id }),
        });
        const data: unknown = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) {
          const callbackUrl = `${window.location.pathname}${window.location.search}`;
          router.push(`/buyer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
          return;
        }
        if (!response.ok) {
          throw new Error(isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Unable to save this product.");
        }
        const createdId = getSavedRecordId(data);
        if (createdId) {
          setSavedProducts((current) => ({ ...current, [product.id]: createdId }));
        } else {
          await loadSavedProducts();
        }
        setSaveFeedback(isRecord(data) && data.alreadySaved === true
          ? "This product is already in Saved."
          : "Product added to Saved.");
      }
      window.dispatchEvent(new Event("remarket-saved-items-changed"));
    } catch (err) {
      console.error("Save product error:", err);
      setSaveFeedbackError(true);
      setSaveFeedback(err instanceof Error ? err.message : "Unable to update your saved products.");
    } finally {
      setSavingProductIds((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }
  }

  async function addProductToCart(product: Product) {
    if (addingToCartProductIds[product.id] || !canAddProductToCart(product)) return;
    setCartFeedback(null);
    setAddingToCartProductIds((current) => ({ ...current, [product.id]: true }));
    try {
      const response = await fetch("/api/cart/items", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        const callbackUrl = `${window.location.pathname}${window.location.search}`;
        router.push(`/buyer/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
        return;
      }
      if (!response.ok) {
        throw new Error(isRecord(data)
          ? cleanString(data.error) ?? cleanString(data.message) ?? "Unable to add this product to your cart."
          : "Unable to add this product to your cart.");
      }
      setCartFeedback({ productId: product.id, kind: "success", message: "Added to cart successfully." });
      window.dispatchEvent(new Event("remarket-cart-changed"));
    } catch (err) {
      console.error("Add to cart error:", err);
      setCartFeedback({
        productId: product.id,
        kind: "error",
        message: err instanceof Error ? err.message : "Unable to add this product to your cart.",
      });
    } finally {
      setAddingToCartProductIds((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    }
  }

  function renderFilterFields(prefix: "desktop" | "mobile") {
    const categoryValue = selectedCategory?.id ?? "";
    const categoryIdInput = `${prefix}-shop-category`;
    const stateIdInput = `${prefix}-shop-state`;
    const lgaIdInput = `${prefix}-shop-lga`;
    const areaIdInput = `${prefix}-shop-area`;
    const minPriceIdInput = `${prefix}-shop-min-price`;
    const maxPriceIdInput = `${prefix}-shop-max-price`;
    const availabilityIdInput = `${prefix}-shop-availability`;
    return (
      <div className="space-y-4">
        <FilterSection title="Category">
          <select
            id={categoryIdInput}
            aria-label="Filter by category"
            value={categoryValue}
            onChange={(event) => selectCategory(findCategoryById(categories, event.target.value))}
            className="h-10 w-full rounded-lg border border-[#E2DED8] bg-white px-3 text-xs text-[#17202A] outline-none transition focus:border-[#FF9A81] focus:ring-2 focus:ring-[#FF5A36]/10"
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <optgroup key={item.id} label={item.name}>
                <option value={item.id}>All {item.name}</option>
                {item.children.map((child) => (
                  <option key={child.id} value={child.id}>— {child.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </FilterSection>

        <FilterSection title="Location">
          <div className="space-y-3">
            <div>
              <label htmlFor={stateIdInput} className="mb-1.5 block text-[10px] font-medium text-[#756B61]">State</label>
              <select
                id={stateIdInput}
                value={state}
                onChange={(event) => { setState(event.target.value); setLga(""); setArea(""); }}
                className="h-10 w-full rounded-lg border border-[#E2DED8] bg-white px-3 text-xs outline-none focus:border-[#FF9A81]"
              >
                <option value="">All supported states</option>
                {locationGroups.map((item) => <option key={item.state} value={item.state}>{item.state}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={lgaIdInput} className="mb-1.5 block text-[10px] font-medium text-[#756B61]">Local Government Area</label>
              <select
                id={lgaIdInput}
                value={lga}
                disabled={!state}
                onChange={(event) => { setLga(event.target.value); setArea(""); }}
                className="h-10 w-full rounded-lg border border-[#E2DED8] bg-white px-3 text-xs outline-none focus:border-[#FF9A81] disabled:cursor-not-allowed disabled:bg-[#F6F3EF]"
              >
                <option value="">{state ? "All LGAs in selected state" : "Select a state first"}</option>
                {availableLgas.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={areaIdInput} className="mb-1.5 block text-[10px] font-medium text-[#756B61]">Area or neighbourhood</label>
              <AreaAutocomplete
                id={areaIdInput}
                value={area}
                state={state || undefined}
                lga={lga || undefined}
                onChange={(value) => setArea(value)}
                onSelect={(selected: AreaSelection) => {
                  setState(selected.state);
                  setLga(selected.lga);
                  setArea(selected.area);
                }}
                placeholder="Search an area"
              />
            </div>
          </div>
        </FilterSection>

        <FilterSection title="Price range">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={minPriceIdInput} className="mb-1.5 block text-[10px] text-[#756B61]">Minimum (₦)</label>
              <input
                id={minPriceIdInput}
                type="number"
                min="0"
                max="1000000000"
                step="1"
                inputMode="numeric"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
                placeholder="0"
                className="h-10 w-full min-w-0 rounded-lg border border-[#E2DED8] bg-white px-2.5 text-xs outline-none focus:border-[#FF9A81]"
              />
            </div>
            <div>
              <label htmlFor={maxPriceIdInput} className="mb-1.5 block text-[10px] text-[#756B61]">Maximum (₦)</label>
              <input
                id={maxPriceIdInput}
                type="number"
                min="0"
                max="1000000000"
                step="1"
                inputMode="numeric"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                placeholder="Any"
                className="h-10 w-full min-w-0 rounded-lg border border-[#E2DED8] bg-white px-2.5 text-xs outline-none focus:border-[#FF9A81]"
              />
            </div>
          </div>
        </FilterSection>

        {filterValidationError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] leading-4 text-red-700">
            {filterValidationError}
          </p>
        )}

        <FilterSection title="Availability">
          <select
            id={availabilityIdInput}
            aria-label="Filter by availability"
            value={availability}
            onChange={(event) => setAvailability(parseAvailabilityFilter(event.target.value))}
            className="h-10 w-full rounded-lg border border-[#E2DED8] bg-white px-3 text-xs outline-none focus:border-[#FF9A81]"
          >
            <option value="">Any availability</option>
            <option value="AVAILABLE">Available</option>
            <option value="ASK_SELLER">Ask seller</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </select>
        </FilterSection>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#EAE6DF] bg-white p-3">
          <input
            type="checkbox"
            checked={verified}
            onChange={(event) => setVerified(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF5A36]"
          />
          <span>
            <span className="block text-[11px] font-semibold text-[#17202A]">Verified sellers only</span>
            <span className="mt-0.5 block text-[10px] leading-4 text-[#756B61]">Only show products from verified sellers.</span>
          </span>
        </label>
      </div>
    );
  }

  function renderFilterActions(mobile = false) {
    return (
      <div className={`${mobile ? "" : "mt-4 border-t border-[#EAE6DF] pt-4"} grid grid-cols-2 gap-2`}>
        <button
          type="button"
          onClick={clearFilters}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[#E2DED8] bg-white px-3 py-2 text-[11px] font-semibold text-[#62574E] transition hover:bg-[#FCFAF6]"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Clear
        </button>
        <button
          type="button"
          onClick={applyFilters}
          className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[#FF5A36] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#E94A28]"
        >
          Apply filters <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const title = selectedCategory?.name ?? (category || "All products");
  const productCountLabel = loading
    ? "Loading products…"
    : error
      ? "Products could not be loaded"
      : `${totalProducts.toLocaleString("en-NG")} ${totalProducts === 1 ? "product" : "products"}`;

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />
      <main id="main-content" className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-24 text-[#17202A] lg:pb-10">
        <div className="mx-auto max-w-[1600px] px-3 pb-8 pt-4 sm:px-5 sm:pt-6 lg:px-7 xl:px-9">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#EAE6DF] pb-4 sm:mb-5 sm:pb-5">
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-[10px] text-[#82776E]">
                <Link href="/" className="transition hover:text-[#9F2D18]">Home</Link>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
                <span className="font-semibold text-[#514840]">Shop</span>
              </nav>
              <h1 className="text-xl font-extrabold tracking-tight text-[#17202A] sm:text-2xl">{query ? `Results for “${query}”` : title}</h1>
              <p className="mt-1 text-[11px] text-[#756B61] sm:text-xs">{productCountLabel}</p>
            </div>
            {(activeFilterCount > 0 || query) && (
              <button type="button" onClick={clearFilters} className="text-[11px] font-semibold text-[#9F2D18] transition hover:text-[#FF5A36]">
                Clear filters
              </button>
            )}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:mb-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMobileFilters(true)}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#E2DED8] bg-white px-3 py-2 text-[11px] font-semibold text-[#514840] transition hover:border-[#FF9A81] hover:text-[#9F2D18] lg:hidden"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF5A36] px-1 text-[9px] text-white">{activeFilterCount}</span>}
              </button>
              <span className="hidden text-[11px] text-[#756B61] sm:inline">
                {loading ? "Updating results" : `${visibleProducts.length} shown on this page`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="product-sort" className="whitespace-nowrap text-[10px] text-[#756B61] sm:text-[11px]">Sort:</label>
              <div className="relative">
                <select
                  id="product-sort"
                  value={initialSort}
                  onChange={(event) => {
                    const nextSort = parseSortMode(event.target.value);
                    router.push(buildShopUrl({ ...getCurrentFilters(), sort: nextSort }, 1));
                  }}
                  className="h-9 max-w-[190px] appearance-none rounded-lg border border-[#E2DED8] bg-white py-2 pl-3 pr-8 text-[11px] font-semibold text-[#514840] outline-none transition focus:border-[#FF9A81]"
                >
                  <option value="relevance">Best match</option>
                  <option value="newest">Recently updated</option>
                  <option value="price-asc">Price: lowest first</option>
                  <option value="price-desc">Price: highest first</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#756B61]" aria-hidden="true" />
              </div>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[224px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)] xl:gap-6">
            {isDesktop && <aside className="hidden min-w-0 lg:block">
              <div className="sticky top-[150px] rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-4">
                <div className="mb-4 flex items-center justify-between border-b border-[#EAE6DF] pb-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-[#9F2D18]" aria-hidden="true" />
                    <h2 className="text-sm font-bold text-[#17202A]">Filters</h2>
                  </div>
                  {activeFilterCount > 0 && <span className="rounded-full bg-[#FFF0EB] px-2 py-0.5 text-[9px] font-bold text-[#9F2D18]">{activeFilterCount} applied</span>}
                </div>
                {renderFilterFields("desktop")}
                {renderFilterActions()}
              </div>
            </aside>}

            <section aria-label="Product results" className="min-w-0">
              {saveFeedback && (
                <div role={saveFeedbackError ? "alert" : "status"} className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-[11px] ${saveFeedbackError ? "border-red-200 bg-red-50 text-red-700" : "border-[#FFD9CE] bg-[#FFF1ED] text-[#9F2D18]"}`}>
                  <span>{saveFeedback}</span>
                  <button type="button" onClick={() => setSaveFeedback("")} aria-label="Dismiss message" className="rounded p-1 hover:bg-black/5"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}

              {loading && (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4 sm:gap-3">
                  {Array.from({ length: 8 }, (_, index) => (
                    <div key={index} className="overflow-hidden rounded-xl border border-[#EAE6DF] bg-white" aria-hidden="true">
                      <div className="aspect-square animate-pulse bg-[#F0ECE7]" />
                      <div className="space-y-2 p-3"><div className="h-2.5 w-3/4 animate-pulse rounded bg-[#F0ECE7]" /><div className="h-3.5 w-1/2 animate-pulse rounded bg-[#F0ECE7]" /><div className="h-9 animate-pulse rounded-lg bg-[#F0ECE7]" /></div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-10 text-center">
                  <Package className="mx-auto h-9 w-9 text-red-400" aria-hidden="true" />
                  <h2 className="mt-3 text-sm font-bold text-red-800">We couldn't load products.</h2>
                  <p className="mt-2 text-xs leading-5 text-red-700">{error}</p>
                  <button type="button" onClick={() => router.refresh()} className="mt-5 rounded-lg bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]">Try again</button>
                </div>
              )}

              {!loading && !error && visibleProducts.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-12 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#FF5A36]"><Package className="h-6 w-6" /></div>
                  <h2 className="mt-4 text-sm font-bold text-[#17202A]">No products found</h2>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#756B61]">Try changing your category, area or price range.</p>
                  <button type="button" onClick={clearFilters} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]">Clear filters <RotateCcw className="h-3.5 w-3.5" /></button>
                </div>
              )}

              {!loading && !error && visibleProducts.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 sm:gap-3">
                    {visibleProducts.map((product) => (
                      <ShopProductCard
                        key={product.id}
                        product={product}
                        saved={Boolean(savedProducts[product.id])}
                        saving={Boolean(savingProductIds[product.id])}
                        adding={Boolean(addingToCartProductIds[product.id])}
                        feedback={cartFeedback?.productId === product.id ? cartFeedback : null}
                        onToggleSaved={(item) => void toggleSavedProduct(item)}
                        onAddToCart={(item) => void addProductToCart(item)}
                      />
                    ))}
                  </div>

                  {resultsTruncated && (
                    <div className="mt-5 rounded-lg border border-[#F2E3C9] bg-[#FFFAF0] px-4 py-3 text-[11px] leading-5 text-[#785B25]">
                      The Search API limits results to the first {maxSearchResults.toLocaleString("en-NG")} matches. Narrow your search or add filters to find more specific results.
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#EAE6DF] pt-4">
                      <p className="text-[10px] text-[#756B61] sm:text-[11px]">
                        Showing {resultStart}–{resultEnd}{resultsTruncated ? ` of the first ${maxSearchResults.toLocaleString("en-NG")} results` : ` of ${totalProducts.toLocaleString("en-NG")}`}
                      </p>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2DED8] bg-white text-[#9F2D18] transition hover:bg-[#FFF1ED] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                        <span className="min-w-[74px] text-center text-[11px] font-semibold text-[#514840]">Page {currentPage} of {totalPages}</span>
                        <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages || !hasMoreResults} aria-label="Next page" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E2DED8] bg-white text-[#9F2D18] transition hover:bg-[#FFF1ED] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          <footer className="mt-10 flex items-center justify-center gap-3 border-t border-[#EAE6DF] pt-5 text-[10px] text-[#9B9188]">
            <span className="h-px w-10 bg-[#EAE6DF]" />
            <span>ReMarket · Find it nearby</span>
            <span className="h-px w-10 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>

      {!isDesktop && showMobileFilters && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-[#17202A]/45 sm:items-center sm:p-4 lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowMobileFilters(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={MOBILE_FILTER_TITLE_ID}
            className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#EAE6DF] bg-[#FFFDFC] shadow-2xl sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[#EAE6DF] px-4 py-4 sm:px-5">
              <div>
                <h2 id={MOBILE_FILTER_TITLE_ID} className="text-base font-extrabold text-[#17202A]">Filter products</h2>
                <p className="mt-0.5 text-[11px] text-[#756B61]">Choose the details that matter to you.</p>
              </div>
              <button type="button" onClick={() => setShowMobileFilters(false)} aria-label="Close filters" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F4F1ED] text-[#62574E] transition hover:bg-[#FFF0EB] hover:text-[#9F2D18]"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {renderFilterFields("mobile")}
            </div>
            <div className="shrink-0 border-t border-[#EAE6DF] bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5">
              {renderFilterActions(true)}
            </div>
          </section>
        </div>
      )}
      <MobileBottomNav />
    </>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={
      <>
        <SiteHeader searchMode="PRODUCTS" />
        <main className="min-h-dvh bg-[#FFFDFC] px-3 pb-24 pt-6 sm:px-5 lg:px-8">
          <div className="mx-auto max-w-[1600px]">
            <div className="mb-5 h-10 w-48 animate-pulse rounded bg-[#F0ECE7]" />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[224px_minmax(0,1fr)]">
              <div className="hidden h-[520px] animate-pulse rounded-xl bg-[#F0ECE7] lg:block" />
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4 sm:gap-3">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="overflow-hidden rounded-xl border border-[#EAE6DF] bg-white">
                    <div className="aspect-square animate-pulse bg-[#F0ECE7]" />
                    <div className="space-y-2 p-3"><div className="h-2.5 w-3/4 animate-pulse rounded bg-[#F0ECE7]" /><div className="h-3.5 w-1/2 animate-pulse rounded bg-[#F0ECE7]" /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
        <MobileBottomNav />
      </>
    }>
      <ShopPageContent />
    </Suspense>
  );
}
