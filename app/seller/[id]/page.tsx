"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSession } from "next-auth/react";
import {
  ArrowRight, BadgeCheck, ExternalLink, Heart,
  LoaderCircle, MapPin, MessageCircle, Music2, Package, Pencil, Phone,
  Search, Share2, Star, Store, Trash2,
} from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import AddToCartButton from "@/components/cart/AddToCartButton";
import { trackContactEvent } from "@/lib/contact-event";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type Verification = "VERIFIED" | "UNVERIFIED";
type ReMarketRole = "ADMIN" | "SELLER" | "BUYER";
type SavedListingType = "PRODUCT";
type SavedListingIds = Record<string, string>;
type CategoryInfo = {
  id?: string;
  name: string;
  iconKey?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  parent?: { id: string; name: string } | null;
};
type ProductImage = { id?: string; url: string; publicId?: string | null; sortOrder?: number };
type Product = {
  id: string; name: string; description: string | null; price: number | null;
  originalPrice: number | null; availability: Availability; imageUrl: string | null;
  images: ProductImage[]; category: CategoryInfo | null; keywords: string[];
  stockQuantity: number | null; rating: number | null; reviewCount: number;
  hasShippingMeasurements: boolean; isPurchaseReady: boolean;
};
type SocialLink = { id: string; platform: string; handle: string };
type SellerLocation = { id?: string; area: string; street?: string | null; address?: string | null; hasDirections?: boolean } | null;
type Seller = {
  id: string; name: string; ownerName: string | null; description: string | null;
  location: SellerLocation; availability: Availability; verification: Verification;
  verified: boolean; category: string | null; categories: string[];
  businessCategories: CategoryInfo[]; productCount: number; products: Product[];
  showContactInfo: boolean;
  socialLinks: SocialLink[]; imageUrl: string | null; averageRating: number; reviewCount: number;
};
type Review = {
  id: string; rating: number; comment: string | null; createdAt: string;
  updatedAt: string; isOwnReview: boolean; user: { name: string };
};
type RatingBreakdown = { 1: number; 2: number; 3: number; 4: number; 5: number };

const CATEGORY_COLORS: Record<string, string> = {
  fashion: "#FFE0D6", electronics: "#DDF5EA", food: "#FFF0C7",
  beauty: "#E7E5FF", textiles: "#F9DCE8",
};
const EMPTY_BREAKDOWN: RatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
type ContactEventPlatform = Parameters<typeof trackContactEvent>[0]["platform"];

function isContactEventPlatform(value: string): value is ContactEventPlatform {
  return ["WHATSAPP", "INSTAGRAM", "TIKTOK", "FACEBOOK", "PHONE", "DIRECTIONS"].includes(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getString(value: unknown, fallback: string | null = null): string | null {
  return typeof value === "string" ? value : fallback;
}
function getNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}
function parseCategoryInfo(value: unknown): CategoryInfo | null {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) return null;
  const rawParent = isRecord(value.parent) ? value.parent : null;
  const parent = rawParent && typeof rawParent.id === "string" && typeof rawParent.name === "string"
    ? { id: rawParent.id, name: rawParent.name } : null;
  return {
    id: getString(value.id) ?? undefined,
    name: value.name.trim(),
    iconKey: getString(value.iconKey),
    imageUrl: getString(value.imageUrl),
    parentId: getString(value.parentId),
    parent,
  };
}
function categoryLabel(category: CategoryInfo | null | undefined): string {
  if (!category) return "";
  return category.parent?.name && category.parent.id !== category.id
    ? `${category.parent.name} · ${category.name}` : category.name;
}
function categoryHref(category: CategoryInfo): string {
  const params = new URLSearchParams({ category: category.name });
  if (category.id) params.set("categoryId", category.id);
  return `/shop?${params.toString()}`;
}
function categoryKey(category: CategoryInfo): string {
  return category.id ?? categoryLabel(category);
}
function getCategoryColor(category?: string | null): string {
  return category ? CATEGORY_COLORS[category.trim().toLowerCase()] ?? "#E4E9EF" : "#E4E9EF";
}
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "R";
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
function money(value: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}
function isAvailability(value: unknown): Availability {
  return value === "AVAILABLE" || value === "UNAVAILABLE" ? value : "ASK_SELLER";
}
function productOriginalPrice(price: number | null, originalPrice: number | null): number | null {
  return price !== null && price > 0 && originalPrice !== null && originalPrice > price ? originalPrice : null;
}
function discountPercent(price: number | null, originalPrice: number | null): number | null {
  const original = productOriginalPrice(price, originalPrice);
  return price !== null && original !== null ? Math.round(((original - price) / original) * 100) : null;
}
function formatProductPrice(product: Pick<Product, "price" | "originalPrice">): string {
  return product.price !== null && product.price > 0 ? money(product.price) : "Ask seller";
}
function getProductImages(listing: { images?: ProductImage[]; imageUrl?: string | null }): ProductImage[] {
  const images = Array.isArray(listing.images) ? listing.images.filter((image) => image && typeof image.url === "string" && image.url.trim()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) : [];
  return images.length ? images : listing.imageUrl ? [{ url: listing.imageUrl }] : [];
}
function getAvailabilityLabel(value: Availability): string {
  return value === "AVAILABLE" ? "Available" : value === "UNAVAILABLE" ? "Unavailable" : "Ask seller";
}
function getAvailabilityClass(value: Availability): string {
  return value === "AVAILABLE" ? "bg-[var(--rm-green-bg)] text-[var(--rm-green)]" : value === "UNAVAILABLE" ? "bg-[var(--rm-surface-muted)] text-[var(--rm-muted)]" : "bg-[var(--rm-yellow-bg)] text-[var(--rm-coral-dark)]";
}
function normalizeNigerianPhone(value: string): string {
  let clean = value.trim();
  if (!clean) return "";
  if (clean.startsWith("00")) clean = `+${clean.slice(2)}`;
  if (clean.startsWith("+")) { const digits = clean.slice(1).replace(/\D/g, ""); return digits ? `+${digits}` : ""; }
  const digits = clean.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  return digits.length === 10 ? `+234${digits}` : "";
}
function safeExternalUrl(value: string, domains: string[]): string {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    return url.protocol === "https:" && domains.some((domain) => host === domain || host.endsWith(`.${domain}`)) ? url.toString() : "#";
  } catch { return "#"; }
}
function buildContactUrl(platform: string, handle: string): string {
  const clean = handle.trim().replace(/^@/, "");
  if (!clean) return "#";
  const isUrl = clean.startsWith("http://") || clean.startsWith("https://");
  switch (platform) {
    case "WHATSAPP": {
      if (isUrl) return safeExternalUrl(clean, ["wa.me", "api.whatsapp.com"]);
      const phone = normalizeNigerianPhone(clean); return phone ? `https://wa.me/${phone.slice(1)}` : "#";
    }
    case "INSTAGRAM": return isUrl ? safeExternalUrl(clean, ["instagram.com"]) : `https://www.instagram.com/${encodeURIComponent(clean)}`;
    case "TIKTOK": return isUrl ? safeExternalUrl(clean, ["tiktok.com"]) : `https://www.tiktok.com/@${encodeURIComponent(clean)}`;
    case "FACEBOOK": return isUrl ? safeExternalUrl(clean, ["facebook.com", "fb.com"]) : `https://www.facebook.com/${encodeURIComponent(clean)}`;
    case "PHONE": { const phone = normalizeNigerianPhone(clean); return phone ? `tel:${phone}` : "#"; }
    default: return "#";
  }
}
function savedKey(type: SavedListingType, id: string): string { return `${type}:${id}`; }
function parseSavedPage(payload: unknown, type: SavedListingType): SavedListingIds {
  const result: SavedListingIds = {};
  if (!isRecord(payload) || !Array.isArray(payload.items)) return result;
  for (const raw of payload.items) if (isRecord(raw) && raw.type === type && isRecord(raw.listing) && typeof raw.id === "string" && typeof raw.listing.id === "string") result[savedKey(type, raw.listing.id)] = raw.id;
  return result;
}
async function loadSavedType(type: SavedListingType, signal: AbortSignal): Promise<SavedListingIds> {
  const response = await fetch(`/api/saved?type=${type}&page=1&limit=50`, { cache: "no-store", headers: { Accept: "application/json" }, signal });
  if (response.status === 401 || response.status === 403) return {};
  if (!response.ok) throw new Error(`Unable to load saved ${type.toLowerCase()} listings.`);
  const payload: unknown = await response.json(), result = parseSavedPage(payload, type);
  const pagination = isRecord(payload) && isRecord(payload.pagination) ? payload.pagination : null;
  const totalPages = pagination && typeof pagination.totalPages === "number" && Number.isFinite(pagination.totalPages)
    ? Math.min(100, Math.max(1, Math.floor(pagination.totalPages)))
    : 1;
  for (let start = 2; start <= totalPages; start += 4) {
    const pages = Array.from({ length: Math.min(4, totalPages - start + 1) }, (_, index) => start + index);
    const pageResults = await Promise.all(pages.map(async (page) => {
      const pageResponse = await fetch(`/api/saved?type=${type}&page=${page}&limit=50`, { cache: "no-store", headers: { Accept: "application/json" }, signal });
      if (!pageResponse.ok) throw new Error(`Unable to load saved ${type.toLowerCase()} listings.`);
      return parseSavedPage(await pageResponse.json(), type);
    }));
    pageResults.forEach((item) => Object.assign(result, item));
  }
  return result;
}
function parseImages(value: unknown): ProductImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((image): ProductImage[] => {
    if (!isRecord(image) || typeof image.url !== "string" || !image.url.trim()) return [];
    return [{ id: typeof image.id === "string" ? image.id : undefined, url: image.url, publicId: typeof image.publicId === "string" ? image.publicId : null, sortOrder: typeof image.sortOrder === "number" ? image.sortOrder : 0 }];
  }).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
function parseProduct(raw: unknown): Product | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const price = getNumber(raw.price), original = getNumber(raw.originalPrice);
  return {
    id: raw.id, name: raw.name, description: getString(raw.description), price,
    originalPrice: productOriginalPrice(price, original), availability: isAvailability(raw.availability),
    imageUrl: getString(raw.imageUrl), images: parseImages(raw.images),
    category: parseCategoryInfo(raw.category),
    keywords: Array.isArray(raw.keywords) ? raw.keywords.filter((word): word is string => typeof word === "string" && word.trim().length > 0) : [],
    stockQuantity: raw.stockQuantity === null ? null : getNumber(raw.stockQuantity),
    rating: typeof raw.rating === "number" && Number.isFinite(raw.rating) && raw.rating >= 0 && raw.rating <= 5 ? raw.rating : null,
    reviewCount: typeof raw.reviewCount === "number" && Number.isSafeInteger(raw.reviewCount) && raw.reviewCount >= 0 ? raw.reviewCount : 0,
    hasShippingMeasurements: raw.hasShippingMeasurements === true,
    isPurchaseReady: raw.isPurchaseReady === true,
  };
}
function formatReviewDate(value: string): string {
  const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return !parts.length ? "R" : parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
function RatingStars({ rating, size = 15 }: { rating: number; size?: number }) {
  return <div className="inline-flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={size} className={star <= Math.round(rating) ? "fill-[#FFB300] text-[#FFB300]" : "text-[var(--rm-border-strong)]"} />)}</div>;
}
function RatingLabel({ rating }: { rating: number }) {
  return <span>{(["", "Poor", "Fair", "Good", "Very good", "Excellent"] as string[])[rating] ?? "Select a rating"}</span>;
}
function ContactIcon({ platform }: { platform: string }) {
  if (platform === "WHATSAPP") return <MessageCircle size={16} />;
  if (platform === "PHONE") return <Phone size={16} />;
  if (platform === "TIKTOK") return <Music2 size={16} />;
  return <ExternalLink size={16} />;
}
function normalizeSeller(raw: unknown): Seller | null {
  if (!isRecord(raw) || typeof raw.id !== "string") return null;
  const categoriesRaw = Array.isArray(raw.categories) ? raw.categories : [];
  const categories = categoriesRaw.flatMap((entry): string[] => {
    if (typeof entry === "string") return [entry];
    if (!isRecord(entry)) return [];
    if (isRecord(entry.category) && typeof entry.category.name === "string") return [entry.category.name];
    return typeof entry.name === "string" ? [entry.name] : [];
  });
  const businessCategoriesRaw = Array.isArray(raw.businessCategories) ? raw.businessCategories : categoriesRaw;
  const businessCategories = businessCategoriesRaw.flatMap((entry): CategoryInfo[] => {
    const candidate = isRecord(entry) && isRecord(entry.category) ? entry.category : entry;
    const category = parseCategoryInfo(candidate); return category ? [category] : [];
  });
  const products = Array.isArray(raw.products) ? raw.products.map(parseProduct).filter((item): item is Product => item !== null) : [];
  const rawLocation = isRecord(raw.location) ? raw.location : null;
  const location: SellerLocation = rawLocation ? {
    id: getString(rawLocation.id) ?? undefined, area: getString(rawLocation.area, "") ?? "",
    street: getString(rawLocation.street), address: getString(rawLocation.address), hasDirections: rawLocation.hasDirections === true,
  } : null;
  const links = Array.isArray(raw.socialLinks) ? raw.socialLinks.flatMap((entry): SocialLink[] => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.platform !== "string" || typeof entry.handle !== "string") return [];
    return [{ id: entry.id, platform: entry.platform, handle: entry.handle }];
  }) : [];
  const verification: Verification = raw.verification === "VERIFIED" ? "VERIFIED" : "UNVERIFIED";
  const productCount = typeof raw.productCount === "number" && Number.isInteger(raw.productCount) && raw.productCount >= 0 ? raw.productCount : products.length;
  const averageRating = typeof raw.averageRating === "number" && Number.isFinite(raw.averageRating) ? Math.max(0, Math.min(5, raw.averageRating)) : 0;
  const reviewCount = typeof raw.reviewCount === "number" && Number.isInteger(raw.reviewCount) && raw.reviewCount >= 0 ? raw.reviewCount : 0;
  return {
    id: raw.id, name: getString(raw.name, "ReMarket Seller") ?? "ReMarket Seller", ownerName: getString(raw.ownerName),
    description: getString(raw.description), location, availability: isAvailability(raw.availability), verification,
    verified: raw.verified === true || verification === "VERIFIED", category: getString(raw.category) ?? categories[0] ?? null,
    categories, businessCategories, productCount, products,
    showContactInfo: raw.showContactInfo === true, socialLinks: links, imageUrl: getString(raw.imageUrl), averageRating, reviewCount,
  };
}

function SaveButton({ type, listingId, saved, busy, disabled, onClick }: {
  type: SavedListingType; listingId: string; saved: boolean; busy: boolean; disabled: boolean;
  onClick: (type: SavedListingType, id: string) => void;
}) {
  const label = "product";
  return <button type="button" onClick={() => onClick(type, listingId)} disabled={busy || disabled} aria-pressed={saved} aria-label={saved ? `Remove ${label} from Saved` : `Save ${label}`} className={`rm-icon-button !h-8 !w-8 sm:!h-9 sm:!w-9 shrink-0 rounded-full bg-white/95 shadow-sm transition disabled:cursor-wait disabled:opacity-60 ${saved ? "border-[var(--rm-coral)] text-[var(--rm-coral-dark)]" : "text-[var(--rm-muted)] hover:border-[var(--rm-coral)] hover:text-[var(--rm-coral-dark)]"}`}>
    {busy ? <LoaderCircle size={14} className="animate-spin sm:h-4 sm:w-4" /> : <Heart size={15} className="sm:h-4 sm:w-4" fill={saved ? "currentColor" : "none"} />}
  </button>;
}

function ProductCard({ product, sellerCategory, saved, saving, savedLoading, onSave }: {
  product: Product; sellerCategory: string | null; saved: boolean; saving: boolean; savedLoading: boolean;
  onSave: (type: SavedListingType, id: string) => void;
}) {
  const images = getProductImages(product);
  const originalPrice = productOriginalPrice(product.price, product.originalPrice);
  const discount = discountPercent(product.price, originalPrice);
  const href = `/product/${encodeURIComponent(product.id)}`;

  return (
    <article className="rm-product-card group flex h-full min-w-0 flex-col">
      <div className="rm-product-media">
        <Link
          href={href}
          aria-label={`View ${product.name}`}
          className="absolute inset-0 block"
        >
          {images[0] ? (
            <img
              src={images[0].url}
              alt={product.name}
              loading="lazy"
              className="rm-product-image transition-transform duration-300 group-hover:scale-[1.025]"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ backgroundColor: getCategoryColor(product.category?.name ?? sellerCategory) }}
            >
              <Package size={30} className="text-[var(--rm-coral-dark)] sm:h-9 sm:w-9" />
            </div>
          )}
        </Link>

        {discount !== null && (
          <span className="absolute left-2 top-2 rounded bg-[var(--rm-coral-dark)] px-1.5 py-1 text-[8px] font-extrabold text-white sm:left-2.5 sm:top-2.5 sm:px-2 sm:text-[9px]">
            -{discount}%
          </span>
        )}
        <div className="absolute right-2 top-2 sm:right-2.5 sm:top-2.5">
          <SaveButton
            type="PRODUCT"
            listingId={product.id}
            saved={saved}
            busy={saving}
            disabled={savedLoading}
            onClick={onSave}
          />
        </div>
        <span className={`absolute bottom-2 left-2 max-w-[calc(100%-3.5rem)] truncate rounded-full px-2 py-1 text-[8px] font-bold sm:bottom-2.5 sm:left-2.5 sm:text-[9px] ${getAvailabilityClass(product.availability)}`}>
          {getAvailabilityLabel(product.availability)}
        </span>
      </div>

      <div className="rm-product-details flex min-w-0 flex-1 flex-col p-2.5 sm:p-3.5">
        {product.category && (
          <p className="rm-product-category mb-1 text-[8px] uppercase tracking-wide sm:text-[9px]">
            {categoryLabel(product.category)}
          </p>
        )}
        <h3 className="rm-product-title min-h-[2.7em] break-words text-[11px] leading-[1.35] sm:text-[13px]">
          <Link href={href} className="transition hover:text-[var(--rm-coral-dark)]">
            {product.name}
          </Link>
        </h3>
        {product.reviewCount > 0 && product.rating !== null && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--rm-text)]" aria-label={`${product.rating.toFixed(1)} out of 5 from ${product.reviewCount} product reviews`}>
            <Star size={13} className="fill-[#FFB300] text-[#FFB300]" aria-hidden="true" />
            <span>{product.rating.toFixed(1)}</span>
            <span className="font-normal text-[var(--rm-muted)]">({product.reviewCount.toLocaleString("en-NG")})</span>
          </div>
        )}
        {product.description && (
          <p className="mt-1 line-clamp-2 break-words text-[9px] leading-[1.45] text-[var(--rm-muted)] sm:text-[10px] sm:leading-4">
            {product.description}
          </p>
        )}
        <div className="mt-auto flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 pt-2.5 sm:gap-x-2 sm:pt-3">
          <span className="rm-product-price break-words text-[13px] sm:text-[15px]">
            {formatProductPrice(product)}
          </span>
          {originalPrice !== null && (
            <span className="rm-product-old-price text-[9px] sm:text-[10px]">
              {money(originalPrice)}
            </span>
          )}
        </div>
        {product.isPurchaseReady ? (
          <AddToCartButton
            productId={product.id}
            availability={product.availability}
            price={product.price}
            stockQuantity={product.stockQuantity}
            isPurchaseReady={product.isPurchaseReady}
            hasShippingMeasurements={product.hasShippingMeasurements}
            compact
          />
        ) : (
          <Link href={href} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)] px-3 py-2 text-sm font-bold text-[var(--rm-text)] transition hover:border-[var(--rm-coral)] hover:text-[var(--rm-coral-dark)]">
            View product details
          </Link>
        )}
      </div>
    </article>
  );
}

function SellerPageContent({ id }: { id: string }) {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notFound, setNotFound] = useState(false), [directionsLoading, setDirectionsLoading] = useState(false);
  const [savedListingIds, setSavedListingIds] = useState<SavedListingIds>({}), [savedListingsLoading, setSavedListingsLoading] = useState(true), [savingListingKey, setSavingListingKey] = useState<string | null>(null), [savedNotice, setSavedNotice] = useState(""), [savedAuthRequired, setSavedAuthRequired] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<ReMarketRole | null>(null), [currentUserLoading, setCurrentUserLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]), [reviewsLoading, setReviewsLoading] = useState(true), [reviewsLoadingMore, setReviewsLoadingMore] = useState(false), [reviewsHasMore, setReviewsHasMore] = useState(false), [reviewsPage, setReviewsPage] = useState(1);
  const [reviewError, setReviewError] = useState(""), [reviewSuccess, setReviewSuccess] = useState(""), [reviewRating, setReviewRating] = useState(0), [reviewComment, setReviewComment] = useState(""), [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null), [editingRating, setEditingRating] = useState(0), [editingComment, setEditingComment] = useState(""), [reviewUpdatingId, setReviewUpdatingId] = useState<string | null>(null), [reviewDeletingId, setReviewDeletingId] = useState<string | null>(null);
  const [ratingBreakdown, setRatingBreakdown] = useState<RatingBreakdown>(EMPTY_BREAKDOWN), reviewRequestId = useRef(0);
  const [shareNotice, setShareNotice] = useState(""), [productSearch, setProductSearch] = useState(""), [activeProductCategory, setActiveProductCategory] = useState("All");

  useEffect(() => {
    const controller = new AbortController();
    async function loadSaved() {
      setSavedListingsLoading(true);
      try {
        const products = await loadSavedType("PRODUCT", controller.signal);
        if (!controller.signal.aborted) setSavedListingIds(products);
      } catch (err) { if (!(err instanceof DOMException && err.name === "AbortError")) console.error("Seller saved listings load error:", err); }
      finally { if (!controller.signal.aborted) setSavedListingsLoading(false); }
    }
    void loadSaved(); return () => controller.abort();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const session = await getSession(); if (cancelled) return;
        const role = session?.user?.role;
        setCurrentUserRole(role === "ADMIN" || role === "SELLER" || role === "BUYER" ? role : null);
      } catch (err) { console.error("Seller page session lookup error:", err); if (!cancelled) setCurrentUserRole(null); }
      finally { if (!cancelled) setCurrentUserLoading(false); }
    }
    void loadUser(); return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSeller() {
      setLoading(true); setError(""); setNotFound(false);
      try {
        const response = await fetch(`/api/businesses/${encodeURIComponent(id)}`, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) { if (response.status === 404) setNotFound(true); throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to load seller."); }
        const raw = isRecord(payload) && "business" in payload ? payload.business : payload;
        const normalized = normalizeSeller(raw); if (!normalized) throw new Error("Seller information was not found.");
        if (!controller.signal.aborted) setSeller(normalized);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Seller page error:", err); if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load seller.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    if (id) void loadSeller(); return () => controller.abort();
  }, [id]);

  const loadReviews = useCallback(async (page = 1, append = false) => {
    if (!id) return;
    const requestId = ++reviewRequestId.current;
    try {
      if (!append) setReviewsLoading(true); setReviewError("");
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews?page=${page}&pageSize=10`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to load reviews.");
      if (requestId !== reviewRequestId.current) return;
      const data = isRecord(payload) ? payload : {}, rawReviews = Array.isArray(data.reviews) ? data.reviews : [];
      const normalized = rawReviews.flatMap((raw): Review[] => {
        if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.rating !== "number" || !isRecord(raw.user)) return [];
        const rating = Number.isInteger(raw.rating) ? Math.min(5, Math.max(1, raw.rating)) : 0; if (rating < 1) return [];
        return [{ id: raw.id, rating, comment: getString(raw.comment), createdAt: getString(raw.createdAt, "") ?? "", updatedAt: getString(raw.updatedAt, "") ?? "", isOwnReview: raw.isOwnReview === true, user: { name: getString(raw.user.name, "ReMarket user") ?? "ReMarket user" } }];
      });
      const average = typeof data.averageRating === "number" && Number.isFinite(data.averageRating) ? Math.max(0, Math.min(5, data.averageRating)) : 0;
      const count = typeof data.reviewCount === "number" && Number.isInteger(data.reviewCount) && data.reviewCount >= 0 ? data.reviewCount : normalized.length;
      const breakdown: RatingBreakdown = { ...EMPTY_BREAKDOWN };
      const rawBreakdown = data.ratingBreakdown;
      if (isRecord(rawBreakdown)) {
        ([1, 2, 3, 4, 5] as const).forEach((rating) => {
          const value = rawBreakdown[String(rating)];
          if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
            breakdown[rating] = value;
          }
        });
      } else {
        normalized.forEach((review) => {
          breakdown[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
        });
      }
      if (requestId !== reviewRequestId.current) return;
      setReviews((current) => append ? [...current, ...normalized] : normalized);
      setReviewsPage(typeof data.page === "number" && Number.isInteger(data.page) ? data.page : page);
      setReviewsHasMore(data.hasMore === true); setRatingBreakdown(breakdown);
      setSeller((current) => current ? { ...current, averageRating: average, reviewCount: count } : current);
    } catch (err) {
      if (requestId !== reviewRequestId.current) return;
      console.error("Reviews load error:", err); setReviewError(err instanceof Error ? err.message : "Unable to load reviews.");
    } finally { if (requestId === reviewRequestId.current && !append) setReviewsLoading(false); }
  }, [id]);
  useEffect(() => { void loadReviews(); return () => { reviewRequestId.current += 1; }; }, [loadReviews]);

  async function loadMoreReviews() {
    if (reviewsLoadingMore || reviewsLoading || !reviewsHasMore) return;
    setReviewsLoadingMore(true); try { await loadReviews(reviewsPage + 1, true); } finally { setReviewsLoadingMore(false); }
  }
  async function toggleSaved(type: SavedListingType, listingId: string) {
    const key = savedKey(type, listingId);
    if (savingListingKey) return;

    const existingId = savedListingIds[key];
    setSavingListingKey(key);
    setSavedNotice("");
    setSavedAuthRequired(false);

    try {
      if (existingId) {
        const response = await fetch(`/api/saved/${encodeURIComponent(existingId)}`, {
          method: "DELETE",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const payload: unknown = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          setSavedAuthRequired(true);
          throw new Error("Sign in again to manage your saved listings.");
        }

        if (response.status === 404) {
          setSavedListingIds((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          });
          setSavedNotice("This item was already removed from Saved.");
        } else {
          if (!response.ok) {
            throw new Error(
              isRecord(payload) && typeof payload.error === "string"
                ? payload.error
                : "Unable to remove this listing from Saved.",
            );
          }
          setSavedListingIds((current) => {
            const next = { ...current };
            delete next[key];
            return next;
          });
          setSavedNotice("Product removed from Saved.");
        }
      } else {
        const response = await fetch("/api/saved", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ type, listingId }),
        });
        const payload: unknown = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          setSavedAuthRequired(true);
          throw new Error("Sign in to save products.");
        }
        if (!response.ok) {
          throw new Error(
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Unable to save this listing.",
          );
        }

        const item = isRecord(payload) && isRecord(payload.item) ? payload.item : null;
        if (!item || typeof item.id !== "string") {
          throw new Error("The saved listing ID was not returned. Refresh and try again.");
        }
        setSavedListingIds((current) => ({ ...current, [key]: item.id as string }));
        setSavedNotice(isRecord(payload) && payload.alreadySaved === true ? "This product is already in Saved." : "Product added to Saved.");
      }

      window.dispatchEvent(new Event("remarket-saved-items-changed"));
    } catch (err) {
      console.error("Saved listing action error:", err);
      setSavedNotice(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSavingListingKey(null);
    }
  }
  function trackContact(platform: string) {
    if (seller?.id && isContactEventPlatform(platform)) void trackContactEvent({ businessId: seller.id, platform });
  }
  const directionsUrl = seller?.id && (seller.location?.hasDirections || seller.location?.address) ? `/api/businesses/${encodeURIComponent(seller.id)}/directions` : "#";
  function openDirections() {
    if (!seller || directionsUrl === "#" || directionsLoading) return;
    trackContact("DIRECTIONS"); setDirectionsLoading(true);
    const opened = window.open("about:blank", "_blank"); if (opened) opened.opener = null;
    const navigate = (position?: GeolocationPosition) => {
      const url = new URL(directionsUrl, window.location.origin);
      if (position) { url.searchParams.set("originLat", String(position.coords.latitude)); url.searchParams.set("originLng", String(position.coords.longitude)); }
      if (opened && !opened.closed) opened.location.href = url.toString(); else window.location.assign(url.toString());
      setDirectionsLoading(false);
    };
    if (!navigator.geolocation) { navigate(); return; }
    navigator.geolocation.getCurrentPosition(navigate, () => navigate(), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  async function shareSeller() {
    if (!seller) return;
    const shareData = { title: seller.name, text: `Discover ${seller.name} on ReMarket.`, url: window.location.href };
    try { if (navigator.share) await navigator.share(shareData); else { await navigator.clipboard.writeText(window.location.href); setShareNotice("Seller link copied."); } }
    catch (err) { if (err instanceof Error && err.name !== "AbortError") setShareNotice("Unable to share this seller right now."); }
  }
  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (reviewSubmitting || !seller) return;
    if (currentUserRole !== "BUYER") { setReviewError(currentUserRole ? "Only buyer accounts can leave business reviews." : "Sign in as a buyer to leave a review."); return; }
    if (reviewRating < 1 || reviewRating > 5) { setReviewError("Please select a rating from 1 to 5 stars."); return; }
    if (reviewComment.trim().length > 2000) { setReviewError("Your review must be 2,000 characters or fewer."); return; }
    setReviewSubmitting(true); setReviewError(""); setReviewSuccess("");
    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: reviewRating, comment: reviewComment }) });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401) throw new Error("Sign in as a buyer to leave a review.");
      if (response.status === 403) throw new Error("Only buyer accounts can leave business reviews.");
      if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : response.status === 409 ? "You have already reviewed this business." : "Unable to submit your review.");
      setReviewRating(0); setReviewComment(""); setReviewSuccess("Your review was submitted successfully."); await loadReviews();
    } catch (err) { setReviewError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setReviewSubmitting(false); }
  }
  function beginEditReview(review: Review) { setReviewError(""); setReviewSuccess(""); setEditingReviewId(review.id); setEditingRating(review.rating); setEditingComment(review.comment ?? ""); }
  function cancelEditReview() { if (reviewUpdatingId) return; setEditingReviewId(null); setEditingRating(0); setEditingComment(""); setReviewError(""); }
  async function updateReview(reviewId: string) {
    if (reviewUpdatingId || editingReviewId !== reviewId) return;
    if (currentUserRole !== "BUYER") { setReviewError("Only buyer accounts can manage reviews."); return; }
    if (editingRating < 1 || editingRating > 5) { setReviewError("Please select a rating from 1 to 5 stars."); return; }
    if (editingComment.trim().length > 2000) { setReviewError("Your review must be 2,000 characters or fewer."); return; }
    setReviewUpdatingId(reviewId); setReviewError(""); setReviewSuccess("");
    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews/${encodeURIComponent(reviewId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: editingRating, comment: editingComment }) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to update your review.");
      setEditingReviewId(null); setEditingRating(0); setEditingComment(""); setReviewSuccess("Your review was updated successfully."); await loadReviews();
    } catch (err) { setReviewError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setReviewUpdatingId(null); }
  }
  async function deleteReview(reviewId: string) {
    if (reviewDeletingId || currentUserRole !== "BUYER" || !window.confirm("Delete your review from this business?")) return;
    setReviewDeletingId(reviewId); setReviewError(""); setReviewSuccess("");
    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews/${encodeURIComponent(reviewId)}`, { method: "DELETE" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to delete your review.");
      if (editingReviewId === reviewId) cancelEditReview(); setReviewSuccess("Your review was deleted successfully."); await loadReviews();
    } catch (err) { setReviewError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setReviewDeletingId(null); }
  }

  const productCategories = useMemo(() => {
    const unique = new Map<string, CategoryInfo>();
    seller?.products.forEach((product) => { if (product.category) unique.set(categoryKey(product.category), product.category); });
    return [...unique.values()].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
  }, [seller?.products]);
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return (seller?.products ?? []).filter((product) => {
      const matchesCategory = activeProductCategory === "All" || (product.category ? categoryKey(product.category) === activeProductCategory : false);
      const searchable = [product.name, product.description ?? "", categoryLabel(product.category), ...product.keywords].join(" ").toLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [seller?.products, productSearch, activeProductCategory]);

  if (!id) return <><SiteHeader searchMode="ALL" /><main className="rm-storefront flex min-h-[65vh] w-full items-center justify-center px-4 py-12"><div className="max-w-md rounded-3xl border border-[var(--rm-border-strong)] bg-white p-8 text-center shadow-sm"><Store size={34} className="mx-auto text-[var(--rm-coral-dark)]" /><h1 className="mt-4 text-xl font-black text-[var(--rm-coral-dark)]">Seller not found</h1><p className="mt-2 text-sm leading-6 text-[var(--rm-muted)]">We couldn&apos;t find the seller you&apos;re looking for.</p><Link href="/shop" className="rm-button rm-button-primary mt-5">Browse products <ArrowRight size={15} /></Link></div></main><MobileBottomNav /></>;

  return <><SiteHeader searchMode="ALL" /><main id="main-content" className="rm-storefront rm-seller-storefront min-h-screen w-full overflow-x-clip pb-24 text-[var(--rm-ink)] lg:pb-10">
    {loading ? <div className="rm-container w-full py-10"><div className="h-[260px] animate-pulse rounded-[26px] bg-[var(--rm-surface-muted)]" /><div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl bg-[var(--rm-surface-muted)]" />)}</div></div>
    : error || !seller ? <div className="mx-auto flex min-h-[65vh] w-full items-center justify-center px-4 py-12"><section className="w-full max-w-lg rounded-3xl border border-[var(--rm-border-strong)] bg-[var(--rm-coral-soft)] p-8 text-center"><Store size={34} className="mx-auto text-[var(--rm-coral-dark)]" /><h1 className="mt-4 text-xl font-black text-[var(--rm-coral-dark)]">{notFound ? "Seller not found" : "Unable to load seller"}</h1><p className="mt-2 text-sm leading-6 text-[var(--rm-muted)]">{notFound ? "This seller profile may have been removed or is no longer available." : error || "We could not load this seller profile."}</p>{!notFound && <button type="button" onClick={() => window.location.reload()} className="rm-button rm-button-secondary mt-5">Try again</button>}<Link href="/shop" className="rm-button rm-button-primary mt-5">Back to Shop <ArrowRight size={14} /></Link></section></div>
    : <>
      <section className="w-full border-b border-[var(--rm-border)] bg-[var(--rm-cream)]">
        <div className="rm-container py-5 sm:py-8">
          <div className="rounded-[24px] border border-[var(--rm-border)] bg-white px-4 py-5 shadow-[var(--rm-shadow-card)] sm:px-6 sm:py-7 lg:px-8">
          <div className="mb-4 flex min-w-0 items-center gap-2 overflow-hidden text-xs font-medium text-[var(--rm-muted)] sm:mb-5">
            <Link href="/" className="hover:text-[var(--rm-coral-dark)]">Home</Link>
            <span>/</span>
            <span>Stores</span>
            <span>/</span>
            <span className="min-w-0 truncate font-semibold text-[var(--rm-text)]">{seller.name}</span>
          </div>
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3.5 sm:gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--rm-border)] bg-white text-lg font-extrabold text-[var(--rm-coral-dark)] sm:h-20 sm:w-20 sm:rounded-2xl sm:text-2xl">
                {seller.imageUrl ? <img src={seller.imageUrl} alt={`${seller.name} logo`} className="h-full w-full object-cover" /> : getInitials(seller.name)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--rm-coral-dark)]">ReMarket storefront</p>
                  {seller.verified && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--rm-green-bg)] px-2 py-1 text-[9px] font-bold text-[var(--rm-green)]"><BadgeCheck size={12} /> Verified</span>}
                </div>
                <h1 className="mt-1 break-words text-lg font-extrabold leading-tight tracking-tight text-[var(--rm-ink)] sm:text-2xl lg:text-[28px]">{seller.name}</h1>
                {seller.ownerName && <p className="mt-0.5 truncate text-[11px] text-[var(--rm-muted)]">Owned by {seller.ownerName}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(seller.businessCategories[0] || seller.category) && <span className="rounded-md bg-white px-2 py-1 text-[9px] font-semibold text-[var(--rm-text)] ring-1 ring-inset ring-[var(--rm-border)]">{seller.businessCategories[0] ? categoryLabel(seller.businessCategories[0]) : seller.category}</span>}
                  <span className={`rounded-md px-2 py-1 text-[9px] font-bold ${seller.availability === "AVAILABLE" ? "bg-[var(--rm-green-bg)] text-[var(--rm-green)]" : seller.availability === "UNAVAILABLE" ? "bg-[var(--rm-surface-muted)] text-[var(--rm-muted)]" : "bg-[var(--rm-yellow-bg)] text-[var(--rm-coral-dark)]"}`}>{getAvailabilityLabel(seller.availability)}</span>
                  {seller.location?.area && <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[9px] font-semibold text-[var(--rm-muted)] ring-1 ring-inset ring-[var(--rm-border)]"><MapPin size={10} />{seller.location.area}</span>}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] font-medium text-[var(--rm-muted)] sm:mt-3 sm:gap-x-4 sm:text-[11px]">
                  <span className="inline-flex items-center gap-1"><Package size={12} className="shrink-0 text-[var(--rm-coral)]" />{seller.productCount.toLocaleString("en-NG")} products</span>
                  <a href="#seller-reviews" className="inline-flex items-center gap-1 hover:text-[var(--rm-coral-dark)]"><Star size={12} className="shrink-0 fill-[#FFB300] text-[#FFB300]" />{seller.reviewCount > 0 ? `${seller.averageRating.toFixed(1)} · ` : ""}{seller.reviewCount.toLocaleString("en-NG")} reviews</a>
                </div>
              </div>
            </div>
            <div className="flex w-full shrink-0 gap-2 sm:w-auto sm:pl-3">
              <a href="#seller-contact" className="rm-button rm-button-primary min-h-10 min-w-0 flex-1 px-3 text-[11px] sm:flex-none sm:px-4 sm:text-[13px]"><MessageCircle size={14} />Contact seller</a>
              <button type="button" onClick={() => void shareSeller()} aria-label="Share store" className="rm-button rm-button-secondary min-h-10 min-w-0 flex-1 px-3 text-[11px] sm:flex-none sm:px-4 sm:text-[13px]"><Share2 size={14} /><span>Share</span></button>
            </div>
          </div>
          </div>
        </div>
      </section>

      <nav aria-label="Seller storefront sections" className="sticky top-[var(--rm-header-height)] z-30 w-full border-b border-[var(--rm-border)] bg-white/95 backdrop-blur">
        <div className="rm-container flex items-center gap-1 overflow-x-auto py-1.5 sm:py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <a href="#seller-products" className="shrink-0 rounded-lg bg-[var(--rm-coral-soft)] px-3 py-2 text-[10px] font-bold sm:px-3.5 sm:py-2.5 sm:text-[11px] text-[var(--rm-coral-dark)]">Products</a>
          <a href="#seller-about" className="shrink-0 rounded-lg px-3 py-2 text-[10px] font-semibold sm:px-3.5 sm:py-2.5 sm:text-[11px] text-[var(--rm-text)] transition hover:bg-[var(--rm-surface-muted)] hover:text-[var(--rm-coral-dark)]">About</a>
          <a href="#seller-contact" className="shrink-0 rounded-lg px-3 py-2 text-[10px] font-semibold sm:px-3.5 sm:py-2.5 sm:text-[11px] text-[var(--rm-text)] transition hover:bg-[var(--rm-surface-muted)] hover:text-[var(--rm-coral-dark)]">Contact &amp; location</a>
          <a href="#seller-reviews" className="shrink-0 rounded-lg px-3 py-2 text-[10px] font-semibold sm:px-3.5 sm:py-2.5 sm:text-[11px] text-[var(--rm-text)] transition hover:bg-[var(--rm-surface-muted)] hover:text-[var(--rm-coral-dark)]">Reviews <span className="ml-1 text-[9px] opacity-70">{seller.reviewCount}</span></a>
        </div>
      </nav>

      <div className="rm-container w-full py-6 sm:py-9">
        {savedNotice && <div role="status" aria-live="polite" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--rm-border-strong)] bg-[var(--rm-coral-soft)] px-4 py-3 text-[11px] font-semibold text-[var(--rm-coral-dark)]"><Heart size={14} /><span>{savedNotice}</span>{savedAuthRequired && <Link href={`/buyer/login?callbackUrl=${encodeURIComponent(`/seller/${id}`)}`} className="font-extrabold underline underline-offset-2">Sign in</Link>}</div>}
        {shareNotice && <p role="status" className="mb-4 rounded-lg border border-[var(--rm-border)] bg-white px-4 py-3 text-[11px] font-semibold text-[var(--rm-muted)]">{shareNotice}</p>}

        <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_292px] xl:grid-cols-[minmax(0,1fr)_310px] xl:gap-7">
          <div className="min-w-0 space-y-7 sm:space-y-10">
            <section id="seller-products" className="scroll-mt-24 min-w-0 sm:scroll-mt-28">
              <div className="rm-section-heading mb-3 flex flex-col items-stretch gap-2.5 border-b border-[var(--rm-border)] pb-3 sm:mb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-3 sm:pb-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--rm-coral-dark)]">Store catalogue</p>
                  <h2 className="rm-section-title mt-1">Products</h2>
                  <p className="rm-section-subtitle mt-1">{seller.productCount.toLocaleString("en-NG")} {seller.productCount === 1 ? "product" : "products"} listed by this seller</p>
                </div>
                {seller.products.length > 0 && <label className="rm-search h-10 w-full sm:h-11 sm:max-w-[330px]"><Search size={15} className="shrink-0 text-[var(--rm-muted)]" /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={`Search this store`} aria-label="Search this seller's products" className="text-[12px]" /></label>}
              </div>

              {productCategories.length > 0 && seller.products.length > 0 && <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 sm:mb-4 sm:gap-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button type="button" onClick={() => setActiveProductCategory("All")} aria-pressed={activeProductCategory === "All"} className="rm-filter-chip shrink-0">All products</button>
                {productCategories.map((category) => {
                  const key = categoryKey(category);
                  return <button key={key} type="button" onClick={() => setActiveProductCategory(key)} aria-pressed={activeProductCategory === key} className="rm-filter-chip shrink-0">{categoryLabel(category)}</button>;
                })}
              </div>}

              {seller.products.length > 0 ? filteredProducts.length > 0 ? <>
                <div className="mb-3 flex items-center justify-between gap-2 text-[10px] text-[var(--rm-muted)]"><span>{filteredProducts.length} matching {filteredProducts.length === 1 ? "product" : "products"}</span>{(productSearch || activeProductCategory !== "All") && <button type="button" onClick={() => { setProductSearch(""); setActiveProductCategory("All"); }} className="font-bold text-[var(--rm-coral-dark)] hover:underline">Reset</button>}</div>
                <div className="rm-product-grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 xl:gap-4">
                  {filteredProducts.map((product) => <ProductCard key={product.id} product={product} sellerCategory={seller.category} saved={Boolean(savedListingIds[savedKey("PRODUCT", product.id)])} saving={savingListingKey === savedKey("PRODUCT", product.id)} savedLoading={savedListingsLoading} onSave={(type, listingId) => { void toggleSaved(type, listingId); }} />)}
                </div>
              </> : <div className="rm-empty-state min-h-[170px] rounded-xl border border-dashed border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)] px-4 py-7 sm:min-h-[220px] sm:py-10"><Search size={26} className="mx-auto text-[var(--rm-subtle)]" /><p className="mt-3 text-sm font-bold text-[var(--rm-text)]">No matching products</p><p className="mt-1 text-[11px] text-[var(--rm-subtle)]">Try another search or category.</p><button type="button" onClick={() => { setProductSearch(""); setActiveProductCategory("All"); }} className="mt-4 rounded-lg border border-[var(--rm-border)] bg-white px-4 py-2 text-[10px] font-bold text-[var(--rm-coral-dark)]">Reset filters</button></div> : <div className="rm-empty-state min-h-[170px] rounded-xl border border-dashed border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)] px-4 py-7 sm:min-h-[220px] sm:py-10"><Package size={30} className="mx-auto text-[var(--rm-subtle)]" /><p className="mt-3 text-sm font-bold text-[var(--rm-text)]">No products listed yet</p><p className="mt-1 text-[11px] text-[var(--rm-subtle)]">Contact the seller to ask what is currently available.</p></div>}
            </section>


            <section id="seller-reviews" className="scroll-mt-24 border-t border-[var(--rm-border)] pt-6 sm:scroll-mt-28 sm:pt-8">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--rm-coral-dark)]">Buyer feedback</p><h2 className="rm-section-title mt-1">Ratings &amp; reviews</h2><p className="rm-section-subtitle mt-1">Reviews shared by ReMarket buyer accounts.</p></div></div>
              {reviewSuccess && <p role="status" className="mb-4 rounded-lg border border-[var(--rm-green-bg)] bg-[var(--rm-green-bg)] px-4 py-3 text-[11px] font-semibold text-[var(--rm-green)]">{reviewSuccess}</p>}
              {reviewError && <p role="alert" className="mb-4 rounded-lg border border-[var(--rm-border-strong)] bg-[var(--rm-coral-soft)] px-4 py-3 text-[11px] font-semibold text-[var(--rm-coral-dark)]">{reviewError}</p>}
              <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="rm-panel bg-[var(--rm-surface-muted)] p-4"><div className="text-center"><p className="text-3xl font-extrabold text-[var(--rm-coral-dark)]">{seller.reviewCount > 0 ? seller.averageRating.toFixed(1) : "—"}</p><div className="mt-2"><RatingStars rating={seller.averageRating} size={17} /></div><p className="mt-2 text-[10px] text-[var(--rm-muted)]">{seller.reviewCount} {seller.reviewCount === 1 ? "review" : "reviews"}</p></div>
                    <div className="mt-5 space-y-2">{([5, 4, 3, 2, 1] as const).map((rating) => { const count = ratingBreakdown[rating], percent = seller.reviewCount > 0 ? Math.min(100, Math.round((count / seller.reviewCount) * 100)) : 0; return <div key={rating} className="flex items-center gap-2"><span className="w-3 text-right text-[10px] font-bold text-[var(--rm-muted)]">{rating}</span><Star size={11} className="fill-[#FFB300] text-[#FFB300]" /><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--rm-border-strong)]"><div className="h-full rounded-full bg-[var(--rm-coral)]" style={{ width: `${percent}%` }} /></div><span className="w-6 text-right text-[9px] text-[var(--rm-muted)]">{count}</span></div>; })}</div>
                  </div>
                  <div className="rm-panel min-w-0 p-3.5 sm:p-4">{currentUserLoading ? <div className="flex min-h-28 items-center justify-center gap-2 text-[11px] text-[var(--rm-muted)]"><LoaderCircle size={15} className="animate-spin text-[var(--rm-coral)]" />Checking your account...</div> : currentUserRole === "BUYER" ? <form onSubmit={submitReview}><h3 className="text-sm font-bold text-[var(--rm-coral-dark)]">Leave a review</h3><p className="mt-1 text-[10px] leading-5 text-[var(--rm-muted)]">Share your experience with this business.</p><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--rm-muted)]">Your rating</p><div className="mt-2 flex flex-wrap items-center gap-2"><div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`Rate ${rating} out of 5`} aria-pressed={reviewRating === rating} onClick={() => setReviewRating(rating)} className="rounded-lg p-1 hover:bg-[var(--rm-coral-soft)]"><Star size={21} className={rating <= reviewRating ? "fill-[#FFB300] text-[#FFB300]" : "text-[var(--rm-border-strong)]"} /></button>)}</div><span className="text-[10px] text-[var(--rm-muted)]"><RatingLabel rating={reviewRating} /></span></div><textarea aria-label="Write your business review" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={4} maxLength={2000} placeholder="What was your experience with this business?" className="rm-textarea mt-4 w-full text-[12px] leading-5" /><div className="mt-1 text-right text-[9px] text-[var(--rm-subtle)]">{reviewComment.length}/2000</div><button type="submit" disabled={reviewSubmitting} className="rm-button rm-button-primary mt-3 w-full disabled:opacity-60">{reviewSubmitting ? <><LoaderCircle size={14} className="animate-spin" />Submitting...</> : "Submit review"}</button></form> : currentUserRole === null ? <div className="py-3 text-center"><Star size={22} className="mx-auto text-[var(--rm-coral)]" /><h3 className="mt-3 text-sm font-bold text-[var(--rm-coral-dark)]">Sign in to leave a review</h3><p className="mt-1 text-[10px] text-[var(--rm-muted)]">Buyer accounts can share their experience.</p><div className="mt-4 flex justify-center gap-2"><Link href={`/buyer/login?callbackUrl=${encodeURIComponent(`/seller/${id}#seller-reviews`)}`} className="rm-button rm-button-primary">Sign in</Link><Link href="/buyer/signup" className="rm-button rm-button-secondary">Create account</Link></div></div> : <div className="py-5 text-center"><Star size={22} className="mx-auto text-[var(--rm-muted)]" /><h3 className="mt-3 text-sm font-bold text-[var(--rm-coral-dark)]">Buyer reviews only</h3><p className="mt-1 text-[10px] text-[var(--rm-muted)]">Only buyer accounts can submit reviews.</p></div>}</div>
                </div>
                <div className="space-y-3">{reviewsLoading ? <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)]"><span className="flex items-center gap-2 text-[11px] text-[var(--rm-muted)]"><LoaderCircle size={15} className="animate-spin text-[var(--rm-coral)]" />Loading reviews...</span></div> : reviews.length === 0 ? <div className="rm-empty-state min-h-[170px] rounded-xl border border-dashed border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)] px-4 py-7 sm:min-h-[220px] sm:py-10"><Star size={26} className="mx-auto text-[var(--rm-subtle)]" /><p className="mt-3 text-sm font-bold text-[var(--rm-text)]">No reviews yet</p><p className="mt-1 text-[10px] text-[var(--rm-subtle)]">Be the first customer to rate this business.</p></div> : reviews.map((review) => {
                  const own = currentUserRole === "BUYER" && review.isOwnReview, editing = editingReviewId === review.id;
                  return <article key={review.id} className="rm-panel min-w-0 p-3 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFE0D6] text-[10px] font-extrabold text-[var(--rm-coral-dark)]">{initials(review.user.name)}</div><div><p className="text-[11px] font-bold text-[var(--rm-ink)]">{review.user.name}</p><p className="text-[9px] text-[var(--rm-subtle)]">{formatReviewDate(review.createdAt)}{review.updatedAt !== review.createdAt ? " · Edited" : ""}</p></div></div>
                    {!editing ? <><div className="mt-3"><RatingStars rating={review.rating} size={14} /></div>{review.comment && <p className="mt-3 whitespace-pre-wrap break-words text-[11px] leading-6 text-[var(--rm-text)]">{review.comment}</p>}</> : <div className="mt-3"><div className="flex items-center gap-2">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`Change rating to ${rating}`} onClick={() => setEditingRating(rating)}><Star size={19} className={rating <= editingRating ? "fill-[#FFB300] text-[#FFB300]" : "text-[var(--rm-border-strong)]"} /></button>)}<span className="text-[10px] text-[var(--rm-muted)]"><RatingLabel rating={editingRating} /></span></div><textarea aria-label={`Edit review by ${review.user.name}`} value={editingComment} onChange={(event) => setEditingComment(event.target.value)} maxLength={2000} rows={4} className="rm-textarea mt-3 w-full text-[12px] leading-5" /><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={cancelEditReview} disabled={reviewUpdatingId === review.id} className="rm-button rm-button-secondary">Cancel</button><button type="button" onClick={() => void updateReview(review.id)} disabled={reviewUpdatingId === review.id} className="rm-button rm-button-primary disabled:opacity-60">{reviewUpdatingId === review.id ? "Saving..." : "Save changes"}</button></div></div>}</div>
                    {own && !editing && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => beginEditReview(review)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold text-[var(--rm-muted)] hover:bg-[var(--rm-coral-soft)]"><Pencil size={12} />Edit</button><button type="button" onClick={() => void deleteReview(review.id)} disabled={reviewDeletingId === review.id} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold text-[var(--rm-coral-dark)] hover:bg-[var(--rm-coral-soft)] disabled:opacity-60">{reviewDeletingId === review.id ? <LoaderCircle size={12} className="animate-spin" /> : <Trash2 size={12} />}Delete</button></div>}</div></article>;
                })}
                  {reviewsHasMore && !reviewsLoading && <div className="flex justify-center pt-2"><button type="button" onClick={() => void loadMoreReviews()} disabled={reviewsLoadingMore} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--rm-border)] bg-white px-5 py-2.5 text-[10px] font-bold text-[var(--rm-coral-dark)] hover:bg-[var(--rm-cream)] disabled:opacity-60">{reviewsLoadingMore ? <><LoaderCircle size={13} className="animate-spin" />Loading more...</> : "Load more reviews"}</button></div>}
                </div>
              </div>
            </section>
          </div>

          <aside className="order-2 min-w-0 space-y-3 sm:space-y-4 lg:order-none">
            <section id="seller-contact" className="rm-panel scroll-mt-24 min-w-0 p-3.5 sm:scroll-mt-28 sm:p-5 lg:sticky lg:top-[130px]">
              <div className="flex items-center gap-2.5 border-b border-[var(--rm-border)] pb-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]"><MessageCircle size={17} /></div><div><h2 className="text-sm font-extrabold text-[var(--rm-ink)]">Contact this seller</h2><p className="mt-0.5 text-[10px] text-[var(--rm-muted)]">Ask about products</p></div></div>
              <div className="mt-3 space-y-2">{seller.showContactInfo && seller.socialLinks.length > 0 ? seller.socialLinks.map((link) => {
                if (link.platform === "DIRECTIONS") return null;
                const url = buildContactUrl(link.platform, link.handle);
                if (url === "#") return null;
                const isPhone = link.platform === "PHONE";
                const label = link.platform === "WHATSAPP" ? "WhatsApp" : link.platform === "PHONE" ? "Call seller" : link.platform === "INSTAGRAM" ? "Instagram" : link.platform === "TIKTOK" ? "TikTok" : link.platform === "FACEBOOK" ? "Facebook" : link.platform;
                return <a key={link.id} href={url} target={isPhone ? undefined : "_blank"} rel={isPhone ? undefined : "noopener noreferrer"} onClick={() => trackContact(link.platform)} className="rm-button rm-button-secondary w-full justify-between text-left"><span className="flex items-center gap-2"><ContactIcon platform={link.platform} />{label}</span><ExternalLink size={12} className="text-[var(--rm-subtle)]" /></a>;
              }) : <p className="rounded-lg bg-[var(--rm-surface-muted)] px-3 py-3 text-[10px] leading-5 text-[var(--rm-muted)]">{seller.showContactInfo ? "No contact details have been added yet." : "This seller has chosen not to display contact details publicly."}</p>}
                {directionsUrl !== "#" && <button type="button" onClick={openDirections} disabled={directionsLoading} className="rm-button rm-button-secondary w-full justify-between text-left disabled:opacity-60"><span className="flex items-center gap-2"><MapPin size={14} />{directionsLoading ? "Opening directions..." : "Get directions"}</span><ExternalLink size={12} /></button>}
              </div>
              {(seller.location?.area || seller.location?.address || seller.location?.street) && <div className="mt-4 rounded-lg bg-[var(--rm-surface-muted)] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--rm-subtle)]">Business location</p><p className="mt-1.5 flex items-start gap-2 text-[10px] font-semibold leading-5 text-[var(--rm-text)]"><MapPin size={13} className="mt-0.5 shrink-0 text-[var(--rm-coral)]" /><span>{[seller.location?.area, seller.location?.street, seller.location?.address].filter(Boolean).join(" · ")}</span></p></div>}
              <p className="mt-3 text-[9px] leading-4 text-[var(--rm-muted)]">Contact information is shown according to the seller's public contact settings.</p>
            </section>

            <section id="seller-about" className="rm-panel scroll-mt-24 min-w-0 p-3.5 sm:scroll-mt-28 sm:p-5">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--rm-coral-dark)]">Store information</p>
              <h2 className="mt-1 text-sm font-extrabold text-[var(--rm-ink)]">About {seller.name}</h2>
              <p className="mt-3 whitespace-pre-line text-[11px] leading-6 text-[var(--rm-text)]">{seller.description || "Explore products from this local business. Contact the seller for details about current offers and availability."}</p>
              {(seller.businessCategories.length > 0 || seller.categories.length > 0) && <div className="mt-4 border-t border-[var(--rm-border)] pt-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--rm-subtle)]">Categories</p><div className="mt-2 flex flex-wrap gap-1.5">{seller.businessCategories.length > 0 ? seller.businessCategories.map((category) => <Link key={category.id ?? categoryLabel(category)} href={categoryHref(category)} className="rounded-md px-2.5 py-1.5 text-[9px] font-bold text-[var(--rm-text)] transition hover:ring-1 hover:ring-[var(--rm-coral)]" style={{ backgroundColor: getCategoryColor(category.name) }}>{categoryLabel(category)}</Link>) : seller.categories.map((category) => <span key={category} className="rounded-md px-2.5 py-1.5 text-[9px] font-bold text-[var(--rm-text)]" style={{ backgroundColor: getCategoryColor(category) }}>{category}</span>)}</div></div>}
            </section>
          </aside>
        </div>
      </div>
    </>}
    <footer className="w-full border-t border-[var(--rm-border)] bg-[var(--rm-surface-muted)] px-4 py-4 text-center text-[10px] font-medium text-[var(--rm-muted)] sm:px-6 sm:py-5 xl:px-10 2xl:px-14">ReMarket · Find it nearby</footer>
  </main><MobileBottomNav /></>;
}

export default function SellerPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  return <SellerPageContent key={id} id={id} />;
}
