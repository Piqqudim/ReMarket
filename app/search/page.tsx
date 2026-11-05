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
  Wrench,
  Loader2,
  MapPin,
  ArrowRight,
  Store,
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

type SearchType = "" | "product" | "service";
type ListingKind = "PRODUCT" | "SERVICE";
type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
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

type SellerLocation = {
  id?: string;
  area?: string | null;
  street?: string | null;
  verification?: string;
} | null;

type SellerInfo = {
  id: string;
  name: string;
  ownerName?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  availability: Availability;
  verification: "VERIFIED" | "UNVERIFIED";
  verified: boolean;
  showContactInfo: boolean;
  location: SellerLocation;
  categories: string[];
  category: string;
};

type ListingBase = {
  id: string;
  name: string;
  description?: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: Availability;
  imageUrl: string | null;
  images?: ListingImage[];
  category?: ListingCategory;
  keywords?: string[];
  matchScore: number;
};

type ProductSearchResult = ListingBase & {
  seller: SellerInfo;
};

type ServiceSearchResult = ListingBase & {
  seller: SellerInfo;
  durationMinutes?: number | null;
  fulfillmentType?: string | null;
};

type SearchListing =
  | {
      type: "PRODUCT";
      id: string;
      matchScore: number;
      name: string;
      product: ProductSearchResult;
    }
  | {
      type: "SERVICE";
      id: string;
      matchScore: number;
      name: string;
      service: ServiceSearchResult;
    };

type SearchFilterValues = {
  query: string;
  category: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  availability: string;
  verified: boolean;
  type: SearchType;
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
  initialType: SearchType;
};

type SavedListingMaps = {
  products: Record<string, string>;
  services: Record<string, string>;
};

type SearchResultMeta = {
  totalProducts: number;
  totalServices: number;
  truncated: boolean;
};

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
    isActive: typeof value.isActive === "boolean" ? value.isActive : undefined,
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : undefined,
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
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 0,
    }];
  });
}

function parseSeller(value: unknown): SellerInfo | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }

  const rawLocation = isRecord(value.location) ? value.location : null;
  const location: SellerLocation = rawLocation
    ? {
        id: cleanString(rawLocation.id) ?? undefined,
        area: cleanString(rawLocation.area),
        street: cleanString(rawLocation.street),
        verification: cleanString(rawLocation.verification) ?? undefined,
      }
    : null;

  const categories = Array.isArray(value.categories)
    ? value.categories.flatMap((item) => {
        const category = cleanString(item);
        return category ? [category] : [];
      })
    : [];

  const verification = value.verification === "VERIFIED" ? "VERIFIED" : "UNVERIFIED";

  return {
    id: value.id,
    name: value.name,
    ownerName: cleanString(value.ownerName),
    description: cleanString(value.description),
    imageUrl: cleanString(value.imageUrl),
    availability: parseAvailability(value.availability),
    verification,
    verified: value.verified === true || verification === "VERIFIED",
    showContactInfo: value.showContactInfo === true,
    location,
    categories,
    category: categories[0] ?? cleanString(value.category) ?? "Uncategorised",
  };
}

/* The search API returns seller data as `seller`; `business` is accepted as a legacy alias. */
function parseSearchProduct(value: unknown): ProductSearchResult | null {
  if (!isRecord(value)) return null;

  const id = cleanString(value.id);
  const name = cleanString(value.name);
  const seller = parseSeller(value.seller ?? value.business);

  if (!id || !name || !seller) return null;

  return {
    id,
    name,
    description: cleanString(value.description),
    price: parseNumber(value.price),
    priceMin: parseNumber(value.priceMin),
    priceMax: parseNumber(value.priceMax),
    availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl),
    images: parseImages(value.images),
    category: parseCategory(value.category),
    keywords: Array.isArray(value.keywords)
      ? value.keywords.filter((item): item is string => typeof item === "string")
      : [],
    matchScore: parseNumber(value.matchScore) ?? 0,
    seller,
  };
}

function parseSearchService(value: unknown): ServiceSearchResult | null {
  if (!isRecord(value)) return null;

  const id = cleanString(value.id);
  const name = cleanString(value.name);
  const seller = parseSeller(value.seller ?? value.business);

  if (!id || !name || !seller) return null;

  return {
    id,
    name,
    description: cleanString(value.description),
    price: parseNumber(value.price),
    priceMin: parseNumber(value.priceMin),
    priceMax: parseNumber(value.priceMax),
    availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl),
    images: parseImages(value.images),
    category: parseCategory(value.category),
    keywords: Array.isArray(value.keywords)
      ? value.keywords.filter((item): item is string => typeof item === "string")
      : [],
    durationMinutes: parseNumber(value.durationMinutes),
    fulfillmentType: cleanString(value.fulfillmentType),
    matchScore: parseNumber(value.matchScore) ?? 0,
    seller,
  };
}

function parseCategoryOptions(value: unknown): Category[] {
  if (!Array.isArray(value)) return [];

  const categories: ApiCategory[] = value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") {
      return [];
    }

    return [{
      id: item.id,
      name: item.name,
      iconKey: cleanString(item.iconKey),
      isActive: typeof item.isActive === "boolean" ? item.isActive : true,
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : undefined,
    }];
  });

  return mergeCategories(categories);
}

function parseResultMeta(
  value: unknown,
  productCount: number,
  serviceCount: number,
): SearchResultMeta {
  const meta = isRecord(value) ? value : {};

  return {
    totalProducts:
      typeof meta.totalProducts === "number" && Number.isSafeInteger(meta.totalProducts) && meta.totalProducts >= 0
        ? meta.totalProducts
        : productCount,
    totalServices:
      typeof meta.totalServices === "number" && Number.isSafeInteger(meta.totalServices) && meta.totalServices >= 0
        ? meta.totalServices
        : serviceCount,
    truncated: meta.truncated === true,
  };
}

function getApiError(value: unknown): string {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : "Something went wrong. Please try again.";
}

/* -------------------------------------------------------------------------- */
/* PRICE AND DISPLAY HELPERS                                                  */
/* -------------------------------------------------------------------------- */

function isUsablePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function formatPrice(
  listing: { price: number | null; priceMin: number | null; priceMax: number | null },
  fallback = "Ask seller",
): string {
  const { price, priceMin, priceMax } = listing;

  if (isUsablePrice(price)) return formatNaira(price);

  if (isUsablePrice(priceMin) && isUsablePrice(priceMax)) {
    if (priceMin === priceMax) return formatNaira(priceMin);
    return `${formatNaira(priceMin)} - ${formatNaira(priceMax)}`;
  }

  if (isUsablePrice(priceMin)) return `From ${formatNaira(priceMin)}`;
  if (isUsablePrice(priceMax)) return `Up to ${formatNaira(priceMax)}`;
  return fallback;
}

function getListingImage(listing: { images?: ListingImage[]; imageUrl: string | null }): string | null {
  return listing.images?.[0]?.url ?? listing.imageUrl ?? null;
}

function getSellerCategory(seller: SellerInfo): string {
  const firstCategory = seller.categories.find((value) => value.trim().length > 0);
  if (firstCategory) return firstCategory.trim();

  const category = seller.category.trim();
  return category && category.toLowerCase() !== "uncategorised" ? category : "General";
}

function getAvailabilityStatus(availability: Availability) {
  if (availability === "AVAILABLE") {
    return { label: "Available", className: "bg-[#DDF5EA] text-[#137A59]" };
  }
  if (availability === "UNAVAILABLE") {
    return { label: "Unavailable", className: "bg-[#F3E8E8] text-[#9F2D18]" };
  }
  return { label: "Ask seller", className: "bg-[#FFF0C7] text-[#8A671D]" };
}

function getPositivePage(value: string | null): number {
  if (!value) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/* -------------------------------------------------------------------------- */
/* SEARCH PARAMETER HELPERS                                                   */
/* -------------------------------------------------------------------------- */

function buildSearchParams(values: SearchFilterValues): URLSearchParams {
  const params = new URLSearchParams();

  if (values.query.trim()) params.set("q", values.query.trim());
  if (values.category.trim()) params.set("category", values.category.trim());
  if (values.location.trim()) params.set("location", values.location.trim());
  if (values.minPrice.trim()) params.set("minPrice", values.minPrice.trim());
  if (values.maxPrice.trim()) params.set("maxPrice", values.maxPrice.trim());
  if (values.availability) params.set("availability", values.availability);
  if (values.verified) params.set("verified", "true");
  if (values.type) params.set("type", values.type);

  return params;
}

/* -------------------------------------------------------------------------- */
/* SAVED PRODUCT AND SERVICE RESPONSE HELPERS                                 */
/* -------------------------------------------------------------------------- */

function getCollectionHint(key: string): ListingKind | undefined {
  const normalized = key.toLowerCase();
  if (normalized.includes("product")) return "PRODUCT";
  if (normalized.includes("service")) return "SERVICE";
  return undefined;
}

function normalizeListingKind(value: unknown): ListingKind | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized.includes("PRODUCT")) return "PRODUCT";
  if (normalized.includes("SERVICE")) return "SERVICE";
  return undefined;
}

/** Maps each Product/Service ID to its SavedListing record ID for DELETE. */
function parseSavedListingMaps(value: unknown): SavedListingMaps {
  const result: SavedListingMaps = { products: {}, services: {} };
  const visited = new WeakSet<object>();

  function visit(item: unknown, inheritedKind?: ListingKind, collectionHint?: ListingKind) {
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
      record.type ?? record.listingType ?? record.entityType ?? record.savedType,
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
  if (isRecord(value.savedListing)) return cleanString(value.savedListing.id);
  if (isRecord(value.savedItem)) return cleanString(value.savedItem.id);
  if (isRecord(value.saved)) return cleanString(value.saved.id);
  return cleanString(value.savedListingId) ?? cleanString(value.savedItemId) ?? cleanString(value.savedId);
}

/* -------------------------------------------------------------------------- */
/* RESULT CARDS                                                               */
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
  const seller = product.seller;
  const image = getListingImage(product);
  const categoryName = product.category?.name ?? getSellerCategory(seller);
  const availability = getAvailabilityStatus(product.availability);
  const productHref = `/product/${encodeURIComponent(product.id)}`;

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:border-[#FFB5A3] hover:shadow-lg hover:shadow-[#9F2D18]/5">
      <div className="relative aspect-[4/3] overflow-hidden" style={{ backgroundColor: categoryBackground }}>
        <Link href={productHref} aria-label={`View ${product.name}`} className="absolute inset-0">
          {image ? (
            <img src={image} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center"><Package className="h-11 w-11 text-[#C7BDB3]" /></div>
          )}
        </Link>
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold ${availability.className}`}>{availability.label}</span>
        <button
          type="button"
          aria-label={saved ? `Remove ${product.name} from Saved` : `Save ${product.name}`}
          aria-pressed={saved}
          disabled={saving}
          onClick={() => onToggleSaved(product)}
          className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition disabled:opacity-60 ${saved ? "text-[#FF5A36]" : "text-[#6F675F] hover:text-[#FF5A36]"}`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />}
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[#9F2D18]">{categoryName}</p>
        <Link href={productHref} className="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-[#292421] hover:text-[#9F2D18]">{product.name}</Link>
        <p className="mt-2 text-base font-extrabold text-[#9F2D18]">{formatPrice(product)}</p>
        {product.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#81766D]">{product.description}</p>}

        <div className="mt-4 flex min-w-0 items-center gap-2.5 border-t border-[#F0ECE6] pt-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#ECE7E0] bg-[#FCFAF6]">
            {seller.imageUrl ? <img src={seller.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Store className="h-4 w-4 text-[#81766D]" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-[#514840]">{seller.name}</p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-[#91877E]"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{seller.location?.area ?? "Local"}</span></p>
          </div>
          {seller.verified && <span title="Verified seller" aria-label="Verified seller" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#DDF5EA] text-[#137A59]"><Check className="h-3.5 w-3.5" /></span>}
        </div>
        <Link href={productHref} className="mt-4 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FFF1ED] px-3 py-2.5 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFE0D6]">View product <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </article>
  );
}

function ServiceResultCard({
  service,
  saved,
  saving,
  categoryBackground,
  onToggleSaved,
}: {
  service: ServiceSearchResult;
  saved: boolean;
  saving: boolean;
  categoryBackground: string;
  onToggleSaved: (service: ServiceSearchResult) => void;
}) {
  const seller = service.seller;
  const image = getListingImage(service);
  const categoryName = service.category?.name ?? getSellerCategory(seller);
  const availability = getAvailabilityStatus(service.availability);
  const serviceHref = `/service/${encodeURIComponent(service.id)}`;

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:border-[#FFB5A3] hover:shadow-lg hover:shadow-[#9F2D18]/5">
      <div className="relative aspect-[4/3] overflow-hidden" style={{ backgroundColor: categoryBackground }}>
        <Link href={serviceHref} aria-label={`View ${service.name}`} className="absolute inset-0">
          {image ? (
            <img src={image} alt={service.name} loading="lazy" className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center"><Wrench className="h-11 w-11 text-[#C7BDB3]" /></div>
          )}
        </Link>
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold ${availability.className}`}>{availability.label}</span>
        <button
          type="button"
          aria-label={saved ? `Remove ${service.name} from Saved` : `Save ${service.name}`}
          aria-pressed={saved}
          disabled={saving}
          onClick={() => onToggleSaved(service)}
          className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition disabled:opacity-60 ${saved ? "text-[#FF5A36]" : "text-[#6F675F] hover:text-[#FF5A36]"}`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />}
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[#9F2D18]">{categoryName}</p>
        <Link href={serviceHref} className="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-[#292421] hover:text-[#9F2D18]">{service.name}</Link>
        <p className="mt-2 text-base font-extrabold text-[#9F2D18]">{formatPrice(service, "Price on request")}</p>
        {service.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#81766D]">{service.description}</p>}
        {typeof service.durationMinutes === "number" && service.durationMinutes > 0 && <p className="mt-2 text-[10px] text-[#81766D]">Duration: {service.durationMinutes} minutes</p>}
        {service.fulfillmentType && <p className="mt-1 text-[10px] text-[#81766D]">{service.fulfillmentType.replaceAll("_", " ").toLowerCase()}</p>}

        <div className="mt-4 flex min-w-0 items-center gap-2.5 border-t border-[#F0ECE6] pt-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#ECE7E0] bg-[#FCFAF6]">
            {seller.imageUrl ? <img src={seller.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Store className="h-4 w-4 text-[#81766D]" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-[#514840]">{seller.name}</p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-[#91877E]"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{seller.location?.area ?? "Local"}</span></p>
          </div>
          {seller.verified && <span title="Verified seller" aria-label="Verified seller" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#DDF5EA] text-[#137A59]"><Check className="h-3.5 w-3.5" /></span>}
        </div>
        <Link href={serviceHref} className="mt-4 flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FFF1ED] px-3 py-2.5 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFE0D6]">View service <ArrowRight className="h-3.5 w-3.5" /></Link>
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
  const rawType = searchParams.get("type");
  const initialType: SearchType = rawType === "product" || rawType === "service" ? rawType : "";
  const initialPage = getPositivePage(searchParams.get("page"));

  const allSearchParams = searchParams.toString();
  const stableParams = new URLSearchParams(allSearchParams);
  stableParams.delete("page");
  const searchKey = stableParams.toString();

  useEffect(() => {
    const rawPage = searchParams.get("page");
    if (rawPage === null) return;
    const parsedPage = Number(rawPage);
    if (Number.isSafeInteger(parsedPage) && parsedPage >= 1) return;

    const params = new URLSearchParams(allSearchParams);
    params.delete("page");
    const queryString = params.toString();
    router.replace(queryString ? `/search?${queryString}` : "/search", { scroll: false });
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
      initialType={initialType}
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
  initialType,
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
  const [services, setServices] = useState<ServiceSearchResult[]>([]);
  const [savedListings, setSavedListings] = useState<SavedListingMaps>({ products: {}, services: {} });
  const [savingListings, setSavingListings] = useState<Record<string, boolean>>({});
  const [saveFeedback, setSaveFeedback] = useState("");
  const [saveFeedbackError, setSaveFeedbackError] = useState(false);

  const [resultMeta, setResultMeta] = useState<SearchResultMeta>({ totalProducts: 0, totalServices: 0, truncated: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const appliedFilters = useMemo<SearchFilterValues>(() => ({
    query: initialQuery,
    category: initialCategory,
    location: initialLocation,
    minPrice: initialMinPrice,
    maxPrice: initialMaxPrice,
    availability: initialAvailability,
    verified: initialVerified,
    type: initialType,
  }), [
    initialQuery,
    initialCategory,
    initialLocation,
    initialMinPrice,
    initialMaxPrice,
    initialAvailability,
    initialVerified,
    initialType,
  ]);

  /* ------------------------------------------------------------------------ */
  /* NAVIGATION                                                               */
  /* ------------------------------------------------------------------------ */

  const navigateToSearch = useCallback((values: SearchFilterValues) => {
    const params = buildSearchParams(values);
    const queryString = params.toString();
    router.push(queryString ? `/search?${queryString}` : "/search", { scroll: false });
  }, [router]);

  const navigateToPage = useCallback((requestedPage: number, replace = false) => {
    const params = buildSearchParams(appliedFilters);
    if (requestedPage > 1) params.set("page", String(requestedPage));
    const queryString = params.toString();
    const url = queryString ? `/search?${queryString}` : "/search";
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }, [appliedFilters, router]);

  function applyAppliedFilterChanges(overrides: Partial<SearchFilterValues>) {
    navigateToSearch({ ...appliedFilters, ...overrides });
  }

  /* ------------------------------------------------------------------------ */
  /* TYPE-SPECIFIC CATEGORIES                                                 */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller = new AbortController();
    setCategories([]);
    setCategoriesLoading(true);

    async function loadCategories() {
      try {
        const categoryType = initialType || "all";
        const response = await fetch(`/api/categories?type=${categoryType}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load categories.");
        const data: unknown = await response.json();
        if (!isRecord(data)) throw new Error("Invalid categories response.");
        if (!controller.signal.aborted) {
          setCategories(parseCategoryOptions(data.categories));
        }
      } catch (categoryError) {
        if (controller.signal.aborted) return;
        console.error("Failed to load search categories:", categoryError);
        setCategories([]);
      } finally {
        if (!controller.signal.aborted) setCategoriesLoading(false);
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, [initialType]);

  /* ------------------------------------------------------------------------ */
  /* SAVED PRODUCTS AND SERVICES                                              */
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
      if (savedError instanceof DOMException && savedError.name === "AbortError") return null;
      console.error("Unable to load saved listings:", savedError);
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refreshSaved = () => { void loadSavedListings(); };

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
  /* SEARCH RESULTS                                                           */
  /* ------------------------------------------------------------------------ */

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
          type: initialType,
        });
        const queryString = params.toString();
        const response = await fetch(`/api/search${queryString ? `?${queryString}` : ""}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = await response.json();

        if (!response.ok) throw new Error(getApiError(data));
        if (!isRecord(data)) throw new Error("The search API returned an invalid response.");
        if (controller.signal.aborted) return;

        const rawProducts = Array.isArray(data.products) ? data.products : [];
        const rawServices = Array.isArray(data.services) ? data.services : [];
        const parsedProducts = rawProducts
          .map(parseSearchProduct)
          .filter((item): item is ProductSearchResult => item !== null);
        const parsedServices = rawServices
          .map(parseSearchService)
          .filter((item): item is ServiceSearchResult => item !== null);

        setProducts(parsedProducts);
        setServices(parsedServices);
        setResultMeta(parseResultMeta(data.resultMeta, parsedProducts.length, parsedServices.length));
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") return;
        console.error("Search loading error:", searchError);
        setProducts([]);
        setServices([]);
        setResultMeta({ totalProducts: 0, totalServices: 0, truncated: false });
        setError(searchError instanceof Error && searchError.message
          ? searchError.message
          : "We couldn't complete your search right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSearchResults();
    return () => controller.abort();
  }, [
    initialQuery,
    initialCategory,
    initialLocation,
    initialMinPrice,
    initialMaxPrice,
    initialAvailability,
    initialVerified,
    initialType,
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

  function changeSearchType(type: SearchType) {
    // Category lists differ by listing type, so reset the old category when switching.
    navigateToSearch({ ...appliedFilters, type, category: "" });
  }

  /* ------------------------------------------------------------------------ */
  /* SAVE / UNSAVE INDIVIDUAL LISTINGS                                        */
  /* ------------------------------------------------------------------------ */

  const toggleSavedListing = useCallback(async (
    kind: ListingKind,
    listingId: string,
    listingName: string,
  ) => {
    const key = `${kind}:${listingId}`;
    if (savingListings[key]) return;

    setSaveFeedback("");
    setSaveFeedbackError(false);
    setSavingListings((current) => ({ ...current, [key]: true }));

    try {
      const currentSavedId = kind === "PRODUCT"
        ? savedListings.products[listingId]
        : savedListings.services[listingId];

      if (currentSavedId) {
        const response = await fetch(`/api/saved/${encodeURIComponent(currentSavedId)}`, {
          method: "DELETE",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const data: unknown = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          router.push(`/buyer/login?callbackUrl=${encodeURIComponent("/search")}`);
          return;
        }
        if (!response.ok) throw new Error(getApiError(data));

        setSavedListings((current) => {
          const next = { products: { ...current.products }, services: { ...current.services } };
          if (kind === "PRODUCT") delete next.products[listingId];
          else delete next.services[listingId];
          return next;
        });
        setSaveFeedback(`${listingName} removed from Saved.`);
      } else {
        const response = await fetch("/api/saved", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ type: kind, listingId }),
        });
        const data: unknown = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          router.push(`/buyer/login?callbackUrl=${encodeURIComponent("/search")}`);
          return;
        }

        if (response.status === 409) {
          const refreshed = await loadSavedListings();
          const alreadySaved = kind === "PRODUCT"
            ? refreshed?.products[listingId]
            : refreshed?.services[listingId];
          if (alreadySaved) {
            setSaveFeedback(`${listingName} is already in Saved.`);
            return;
          }
        }

        if (!response.ok) throw new Error(getApiError(data));

        let createdId = getCreatedSavedRecordId(data);
        if (!createdId) {
          const refreshed = await loadSavedListings();
          createdId = kind === "PRODUCT"
            ? refreshed?.products[listingId] ?? null
            : refreshed?.services[listingId] ?? null;
        }

        if (createdId) {
          setSavedListings((current) => ({
            products: kind === "PRODUCT"
              ? { ...current.products, [listingId]: createdId! }
              : current.products,
            services: kind === "SERVICE"
              ? { ...current.services, [listingId]: createdId! }
              : current.services,
          }));
        }
        setSaveFeedback(`${listingName} added to Saved.`);
      }

      window.dispatchEvent(new Event(SAVED_ITEMS_CHANGED_EVENT));
    } catch (saveError) {
      console.error("Unable to update saved listing:", saveError);
      setSaveFeedbackError(true);
      setSaveFeedback(saveError instanceof Error ? saveError.message : "Unable to update Saved.");
    } finally {
      setSavingListings((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, [loadSavedListings, router, savedListings, savingListings]);

  function toggleSavedProduct(product: ProductSearchResult) {
    void toggleSavedListing("PRODUCT", product.id, product.name);
  }

  function toggleSavedService(service: ServiceSearchResult) {
    void toggleSavedListing("SERVICE", service.id, service.name);
  }

  /* ------------------------------------------------------------------------ */
  /* COMBINE AND PAGINATE RESULTS                                             */
  /* ------------------------------------------------------------------------ */

  const allListings = useMemo<SearchListing[]>(() => {
    const combined: SearchListing[] = [
      ...products.map((product) => ({
        type: "PRODUCT" as const,
        id: product.id,
        name: product.name,
        matchScore: product.matchScore,
        product,
      })),
      ...services.map((service) => ({
        type: "SERVICE" as const,
        id: service.id,
        name: service.name,
        matchScore: service.matchScore,
        service,
      })),
    ];

    combined.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
    return combined;
  }, [products, services]);

  const visibleListings = useMemo(() => {
    if (initialType === "product") return allListings.filter((item) => item.type === "PRODUCT");
    if (initialType === "service") return allListings.filter((item) => item.type === "SERVICE");
    return allListings;
  }, [allListings, initialType]);

  const totalLoadedResults = visibleListings.length;
  const totalPages = Math.max(1, Math.ceil(totalLoadedResults / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, initialPage), totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const displayedListings = visibleListings.slice(pageStart, pageEnd);

  useEffect(() => {
    if (loading || currentPage === initialPage) return;
    navigateToPage(currentPage, true);
  }, [loading, currentPage, initialPage, navigateToPage]);

  const totalProductResults = initialType === "service" ? 0 : resultMeta.totalProducts;
  const totalServiceResults = initialType === "product" ? 0 : resultMeta.totalServices;
  const hasResults = visibleListings.length > 0;

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
      categories.find((item) => item.name.toLowerCase() === normalized)?.bg ??
      DEFAULT_CATEGORIES.find((item) => item.name.toLowerCase() === normalized)?.bg ??
      "#EEF1F4"
    );
  }

  const resultSummary = initialType === "product"
    ? `${resultMeta.totalProducts} ${resultMeta.totalProducts === 1 ? "product" : "products"} found`
    : initialType === "service"
      ? `${resultMeta.totalServices} ${resultMeta.totalServices === 1 ? "service" : "services"} found`
      : `${resultMeta.totalProducts} ${resultMeta.totalProducts === 1 ? "product" : "products"} · ${resultMeta.totalServices} ${resultMeta.totalServices === 1 ? "service" : "services"}`;

  const currentTypeLabel = initialType === "product" ? "Products" : initialType === "service" ? "Services" : "All listings";

  /* ------------------------------------------------------------------------ */
  /* SHARED-SHELL PAGE UI                                                     */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-dvh bg-[#FFF7ED]">
      {/* Shared site header owns the main desktop navigation and header actions. */}
      <SiteHeader />

      <main id="main-content" className="min-h-[calc(100dvh-66px)] overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10">
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-8 xl:px-10">
          {/* SEARCH INTRO */}
          <section className="relative overflow-hidden rounded-[24px] border border-[#FFE0D5] bg-gradient-to-r from-[#FFF0E7] via-[#FFF5EE] to-[#FFE4D9] px-5 py-6 sm:px-8 sm:py-8">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 hidden h-64 w-64 rounded-full bg-[#FF5A36]/10 sm:block" />
            <div className="relative z-10 max-w-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9F2D18]">Search ReMarket</p>
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#401B13] sm:text-4xl">Find what you need</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66564C] sm:text-base">Discover products and services from sellers around you. Compare options and find what works for you.</p>

              <form onSubmit={submitSearch} role="search" className="mt-5 flex h-[52px] w-full max-w-2xl items-center rounded-2xl border border-[#F0D8CE] bg-white p-1.5 shadow-sm focus-within:border-[#FF9A81] focus-within:ring-2 focus-within:ring-[#FF5A36]/10">
                <Search className="ml-3 h-5 w-5 shrink-0 text-[#81766C]" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="What are you looking for?"
                  aria-label="Search products and services"
                  maxLength={100}
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#17202A] outline-none placeholder:text-[#91877E]"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search text" className="mr-1 flex h-8 w-8 items-center justify-center rounded-full text-[#91877E] hover:bg-[#FCFAF6]">
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button type="submit" disabled={!query.trim()} className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-xs font-bold text-white transition hover:bg-[#E94A28] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5">
                  Search <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </div>
          </section>

          {/* LISTING TYPE SELECTOR */}
          <section aria-label="Search listing type" className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {([
                { value: "" as SearchType, label: "All" },
                { value: "product" as SearchType, label: "Products" },
                { value: "service" as SearchType, label: "Services" },
              ]).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={initialType === option.value}
                  onClick={() => changeSearchType(option.value)}
                  className={`rounded-full border px-4 py-2 text-xs font-bold transition ${initialType === option.value ? "border-[#FF5A36] bg-[#FFF0E9] text-[#9F2D18]" : "border-[#E8E4DE] bg-white text-[#6F675F] hover:border-[#FFB09B] hover:text-[#9F2D18]"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-semibold text-[#81766D]">{currentTypeLabel}</span>
          </section>

          {/* CATEGORY CHIPS */}
          {categories.length > 0 && (
            <section aria-label="Search categories" className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-xs font-bold text-[#514840]">Browse categories</h2>
                {initialCategory && (
                  <button type="button" onClick={() => applyAppliedFilterChanges({ category: "" })} className="text-[10px] font-semibold text-[#9F2D18] hover:underline">Clear category</button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button type="button" aria-pressed={!initialCategory} onClick={() => applyAppliedFilterChanges({ category: "" })} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${!initialCategory ? "border-[#FF5A36] bg-[#FF5A36] text-white" : "border-[#EAE6DF] bg-white text-[#514840] hover:border-[#FF9A81]"}`}>All categories</button>
                {categories.map((item) => {
                  const active = initialCategory.toLowerCase() === item.name.toLowerCase();
                  const Icon = item.icon;
                  return (
                    <button key={item.id} type="button" aria-pressed={active} onClick={() => applyAppliedFilterChanges({ category: active ? "" : item.name })} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${active ? "border-[#FF5A36] bg-[#FFF0EB] text-[#9F2D18]" : "border-[#EAE6DF] bg-white text-[#514840] hover:border-[#FF9A81]"}`}>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: item.bg }}><Icon className="h-3 w-3" /></span>
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {categoriesLoading && <p className="mt-3 text-[11px] text-[#91877E]">Loading categories...</p>}

          {/* RESULTS HEADER */}
          <section className="mt-6 min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold tracking-tight text-[#401B13] sm:text-2xl">
                  {initialType === "product" ? "Product results" : initialType === "service" ? "Service results" : "Search results"}
                </h2>
                <p className="mt-1 text-xs text-[#756B61] sm:text-sm">{loading ? "Finding products and services..." : resultSummary}</p>
              </div>
              <button type="button" onClick={() => setShowFilters(true)} aria-label={`Open filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""}`} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-xs font-bold text-[#514840] transition hover:border-[#FF9A81] hover:text-[#9F2D18] sm:self-auto">
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {activeFilterCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A36] px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
              </button>
            </div>

            {saveFeedback && (
              <div role={saveFeedbackError ? "alert" : "status"} className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${saveFeedbackError ? "border-red-200 bg-red-50 text-red-700" : "border-[#FFD9CE] bg-[#FFF1ED] text-[#9F2D18]"}`}>
                <span>{saveFeedback}</span>
                <button type="button" onClick={() => setSaveFeedback("")} aria-label="Dismiss saved message"><X className="h-4 w-4" /></button>
              </div>
            )}

            {!loading && !error && resultMeta.truncated && (
              <div role="status" className="mt-4 rounded-xl border border-[#F1D7A7] bg-[#FFF8E8] px-4 py-3 text-xs leading-5 text-[#76551A]">
                There are more matches than the search API can return at once. These results show a limited selection. Add a category, location or price filter to narrow your search.
              </div>
            )}
          </section>

          {/* RESULTS */}
          <section className="mt-5 min-w-0">
            {loading && (
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-[330px] animate-pulse rounded-2xl border border-[#EAE6DF] bg-white" />)}
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-12 text-center">
                <Search className="mx-auto h-9 w-9 text-red-400" />
                <h3 className="mt-3 text-sm font-bold text-red-800">Search unavailable</h3>
                <p className="mt-2 text-xs leading-5 text-red-700">{error}</p>
                <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]">Try again</button>
              </div>
            )}

            {!loading && !error && !hasResults && (
              <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-14 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm"><Search className="h-7 w-7" /></div>
                <h3 className="mt-4 text-sm font-bold text-[#17202A]">We couldn't find that</h3>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#756B61]">Try another search or adjust your filters.</p>
                <button type="button" onClick={() => setShowFilters(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white">Adjust filters <SlidersHorizontal className="h-3.5 w-3.5" /></button>
              </div>
            )}

            {!loading && !error && displayedListings.length > 0 && (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#17202A]">{initialType === "product" ? "Products" : initialType === "service" ? "Services" : "Products and services"}</h3>
                  <span className="text-[10px] text-[#91877E]">Showing {pageStart + 1}–{Math.min(pageEnd, totalLoadedResults)} of {totalLoadedResults} loaded</span>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {displayedListings.map((listing) => {
                    if (listing.type === "PRODUCT") {
                      const product = listing.product;
                      const savedId = savedListings.products[product.id];
                      return (
                        <ProductResultCard
                          key={`product-${product.id}`}
                          product={product}
                          saved={Boolean(savedId)}
                          saving={Boolean(savingListings[`PRODUCT:${product.id}`])}
                          categoryBackground={getCategoryBackground(product.category?.name ?? getSellerCategory(product.seller))}
                          onToggleSaved={(item) => { void toggleSavedListing("PRODUCT", item.id, item.name); }}
                        />
                      );
                    }

                    const service = listing.service;
                    const savedId = savedListings.services[service.id];
                    return (
                      <ServiceResultCard
                        key={`service-${service.id}`}
                        service={service}
                        saved={Boolean(savedId)}
                        saving={Boolean(savingListings[`SERVICE:${service.id}`])}
                        categoryBackground={getCategoryBackground(service.category?.name ?? getSellerCategory(service.seller))}
                        onToggleSaved={(item) => { void toggleSavedListing("SERVICE", item.id, item.name); }}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {!loading && !error && hasResults && totalPages > 1 && (
              <nav aria-label="Search result pages" className="mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-[#EAE6DF] pt-5">
                <button type="button" disabled={currentPage <= 1} onClick={() => navigateToPage(currentPage - 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-[#6F675F] transition hover:border-[#FFB09B] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button>
                <span aria-live="polite" className="text-xs font-medium text-[#756B61]">Page {currentPage} of {totalPages}</span>
                <button type="button" disabled={currentPage >= totalPages} onClick={() => navigateToPage(currentPage + 1)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-[#6F675F] transition hover:border-[#FFB09B] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
              </nav>
            )}

            {!loading && !error && hasResults && (
              <p className="mt-4 text-center text-[10px] text-[#91877E]">
                {initialType === "product"
                  ? `${totalProductResults} matching products`
                  : initialType === "service"
                    ? `${totalServiceResults} matching services`
                    : `${totalProductResults} products and ${totalServiceResults} services`}
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
          <button type="button" aria-label="Close filters" onClick={closeFilters} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
          <section role="dialog" aria-modal="true" aria-labelledby="search-filters-title" className="absolute bottom-0 left-0 right-0 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[24px] border-t border-[#E8E4DE] bg-[#FFFDFC] p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:bottom-4 sm:left-auto sm:right-4 sm:top-4 sm:max-h-none sm:w-[390px] sm:rounded-[22px] sm:border sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="search-filters-title" className="text-base font-extrabold text-[#17202A]">Filters</h2>
                <p className="mt-0.5 text-[11px] text-[#81766D]">Narrow down your results</p>
              </div>
              <button type="button" onClick={closeFilters} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FCFAF6] text-[#6F675F] hover:bg-[#FFF1ED]" aria-label="Close filters"><X className="h-4 w-4" /></button>
            </div>

            {/* CATEGORY */}
            <div className="mt-6">
              <label className="text-xs font-bold text-[#514840]">Category</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {categories.map((item) => {
                  const Icon = item.icon;
                  const active = category.toLowerCase() === item.name.toLowerCase();
                  return (
                    <button key={item.id} type="button" aria-pressed={active} onClick={() => setCategory(active ? "" : item.name)} className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-[11px] font-semibold transition ${active ? "border-[#FFB09B] bg-[#FFF1ED] text-[#9F2D18]" : "border-[#E8E4DE] bg-white text-[#514840] hover:bg-[#FCFAF6]"}`}>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: item.bg }}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
                {categories.length === 0 && <p className="col-span-2 text-[11px] text-[#91877E]">No categories available for this search type.</p>}
              </div>
            </div>

            {/* LOCATION */}
            <div className="mt-5">
              <label htmlFor="search-location-filter" className="text-xs font-bold text-[#514840]">Location</label>
              <div className="relative mt-2">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91877E]" />
                <input id="search-location-filter" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Ikeja" maxLength={100} className="h-11 w-full min-w-0 rounded-xl border border-[#E8E4DE] bg-white pl-10 pr-3 text-xs text-[#292421] outline-none focus:border-[#FF9B82]" />
              </div>
            </div>

            {/* PRICE */}
            <div className="mt-5">
              <label htmlFor="search-min-price" className="text-xs font-bold text-[#514840]">Price range (₦)</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input id="search-min-price" type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} inputMode="numeric" placeholder="Min price" aria-label="Minimum price" className="h-11 w-full min-w-0 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs text-[#292421] outline-none focus:border-[#FF9B82]" />
                <input id="search-max-price" type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="numeric" placeholder="Max price" aria-label="Maximum price" className="h-11 w-full min-w-0 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs text-[#292421] outline-none focus:border-[#FF9B82]" />
              </div>
            </div>

            {/* AVAILABILITY */}
            <div className="mt-5">
              <label htmlFor="search-availability" className="text-xs font-bold text-[#514840]">Availability</label>
              <div className="relative mt-2">
                <select id="search-availability" value={availability} onChange={(event) => setAvailability(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-[#E8E4DE] bg-white px-3 pr-9 text-xs text-[#514840] outline-none focus:border-[#FF9B82]">
                  <option value="">Any availability</option>
                  <option value="AVAILABLE">Available now</option>
                  <option value="ASK_SELLER">Ask seller</option>
                  <option value="UNAVAILABLE">Unavailable</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91877E]" />
              </div>
            </div>

            {/* VERIFIED SELLERS */}
            <button type="button" aria-pressed={verified} onClick={() => setVerified((current) => !current)} className={`mt-5 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 ${verified ? "border-[#BFE7D0] bg-[#F0FBF5]" : "border-[#E8E4DE] bg-white"}`}>
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${verified ? "bg-[#DDF5EA] text-[#137A59]" : "bg-gray-100 text-gray-500"}`}><Check className="h-4 w-4" /></div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-bold text-[#514840]">Verified sellers</p>
                  <p className="mt-0.5 text-[10px] text-[#91877E]">Show verified sellers only</p>
                </div>
              </div>
              <div className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${verified ? "bg-[#FF5A36]" : "bg-gray-200"}`}>
                <div className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${verified ? "translate-x-4" : "translate-x-0"}`} />
              </div>
            </button>

            <div className="mt-6 flex gap-2 border-t border-[#EAE6DF] pt-5">
              <button type="button" onClick={clearFilters} className="flex-1 rounded-xl border border-[#E8E4DE] bg-white py-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]">Clear</button>
              <button type="button" onClick={applyFilters} className="flex-[1.5] rounded-xl bg-[#FF5A36] py-3 text-xs font-bold text-white transition hover:bg-[#E94A28]">Apply filters</button>
            </div>
          </section>
        </div>
      )}

      {/* Shared mobile navigation; no duplicate page-specific bottom bar. */}
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
      <div className="min-h-dvh bg-[#FFF7ED]">
        <SiteHeader />
        <main className="flex min-h-[60dvh] items-center justify-center bg-[#FFFDFC] px-4 pb-24">
          <div className="flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-5 py-4 text-xs text-[#756B61] shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-[#FF5A36]" />
            Loading search...
          </div>
        </main>
        <MobileBottomNav />
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
