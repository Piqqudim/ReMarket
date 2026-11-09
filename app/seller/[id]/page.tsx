"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSession } from "next-auth/react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Music2,
  Package,
  Phone,
  Share2,
  ShoppingBag,
  Star,
  Store,
  Trash2,
  Wrench,
  Search,
  Pencil,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import { trackContactEvent } from "@/lib/contact-event";

/* =========================================================
   TYPES
========================================================= */

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type Verification = "VERIFIED" | "UNVERIFIED";
type ReMarketRole = "ADMIN" | "SELLER" | "BUYER";
type SavedListingType = "PRODUCT" | "SERVICE";
type SavedListingIds = Record<string, string>;

type ProductImage = {
  id?: string;
  url: string;
  publicId?: string | null;
  sortOrder?: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  availability: Availability;
  imageUrl: string | null;
  images: ProductImage[];
  category: { id?: string; name: string } | null;
  keywords: string[];
};

type Service = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
  fulfillmentType: "AT_PROVIDER" | "AT_CUSTOMER" | "REMOTE" | "FLEXIBLE";
  availability: Availability;
  imageUrl: string | null;
  images: ProductImage[];
  category: { id?: string; name: string; iconKey?: string | null } | null;
  keywords: string[];
};

type SocialLink = { id: string; platform: string; handle: string };
type SellerLocation = {
  id?: string;
  area: string;
  street?: string | null;
  address?: string | null;
  hasDirections?: boolean;
} | null;

type Seller = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  location: SellerLocation;
  availability: Availability;
  verification: Verification;
  verified: boolean;
  category: string | null;
  categories: string[];
  productCount: number;
  products: Product[];
  serviceCount: number;
  services: Service[];
  showContactInfo: boolean;
  socialLinks: SocialLink[];
  imageUrl: string | null;
  averageRating: number;
  reviewCount: number;
};

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  isOwnReview: boolean;
  user: { name: string };
};

type RatingBreakdown = { 1: number; 2: number; 3: number; 4: number; 5: number };

/* =========================================================
   CONSTANTS AND SMALL HELPERS
========================================================= */

const CATEGORY_COLORS: Record<string, string> = {
  fashion: "#FFE0D6",
  electronics: "#DDF5EA",
  food: "#FFF0C7",
  beauty: "#E7E5FF",
  textiles: "#F9DCE8",
  services: "#E4E9EF",
};

const EMPTY_BREAKDOWN: RatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

type ContactEventPlatform = Parameters<typeof trackContactEvent>[0]["platform"];

function isContactEventPlatform(value: string): value is ContactEventPlatform {
  return (
    value === "WHATSAPP" ||
    value === "INSTAGRAM" ||
    value === "TIKTOK" ||
    value === "FACEBOOK" ||
    value === "PHONE" ||
    value === "DIRECTIONS"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown, fallback: string | null = null): string | null {
  return typeof value === "string" ? value : fallback;
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function getCategoryColor(category?: string | null): string {
  if (!category) return "#E4E9EF";
  return CATEGORY_COLORS[category.trim().toLowerCase()] ?? "#E4E9EF";
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "R";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function money(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function isAvailability(value: unknown): Availability {
  return value === "AVAILABLE" || value === "UNAVAILABLE" ? value : "ASK_SELLER";
}

function productOriginalPrice(price: number | null, originalPrice: number | null): number | null {
  return price !== null && price > 0 && originalPrice !== null && originalPrice > price
    ? originalPrice
    : null;
}

function discountPercent(price: number | null, originalPrice: number | null): number | null {
  const validOriginal = productOriginalPrice(price, originalPrice);
  if (price === null || validOriginal === null) return null;
  return Math.round(((validOriginal - price) / validOriginal) * 100);
}

function formatProductPrice(product: Pick<Product, "price" | "originalPrice">): string {
  return product.price !== null && product.price > 0 ? money(product.price) : "Ask seller";
}

function formatServicePrice(service: Pick<Service, "price" | "priceMin" | "priceMax">): string {
  if (service.price !== null && service.price > 0) return money(service.price);
  if (service.priceMin !== null && service.priceMax !== null) {
    if (service.priceMin === service.priceMax) return money(service.priceMin);
    return `${money(service.priceMin)} – ${money(service.priceMax)}`;
  }
  if (service.priceMin !== null) return `From ${money(service.priceMin)}`;
  if (service.priceMax !== null) return `Up to ${money(service.priceMax)}`;
  return "Ask seller";
}

function getProductImages(listing: { images?: ProductImage[]; imageUrl?: string | null }): ProductImage[] {
  const images = Array.isArray(listing.images)
    ? listing.images
        .filter((image) => image && typeof image.url === "string" && image.url.trim())
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];
  if (images.length > 0) return images;
  return listing.imageUrl ? [{ url: listing.imageUrl }] : [];
}

function getAvailabilityLabel(availability: Availability): string {
  if (availability === "AVAILABLE") return "Available";
  if (availability === "UNAVAILABLE") return "Unavailable";
  return "Ask seller";
}

function getAvailabilityClass(availability: Availability): string {
  if (availability === "AVAILABLE") return "bg-[#E4F7EC] text-[#237A48]";
  if (availability === "UNAVAILABLE") return "bg-[#F3ECEA] text-[#8B6960]";
  return "bg-[#FFF0D9] text-[#9F2D18]";
}

function formatDuration(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function getFulfillmentLabel(type: Service["fulfillmentType"]): string {
  switch (type) {
    case "AT_PROVIDER": return "At seller's location";
    case "AT_CUSTOMER": return "At customer's location";
    case "REMOTE": return "Remote service";
    default: return "Flexible location";
  }
}

function normalizeNigerianPhone(value: string): string {
  let clean = value.trim();
  if (!clean) return "";
  if (clean.startsWith("00")) clean = `+${clean.slice(2)}`;
  if (clean.startsWith("+")) {
    const digits = clean.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }
  const digits = clean.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return "";
}

function safeExternalUrl(value: string, domains: string[]): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
    return url.protocol === "https:" && allowed ? url.toString() : "#";
  } catch {
    return "#";
  }
}

function buildContactUrl(platform: string, handle: string): string {
  const clean = handle.trim().replace(/^@/, "");
  if (!clean) return "#";
  const isUrl = clean.startsWith("http://") || clean.startsWith("https://");

  switch (platform) {
    case "WHATSAPP": {
      if (isUrl) return safeExternalUrl(clean, ["wa.me", "api.whatsapp.com"]);
      const phone = normalizeNigerianPhone(clean);
      return phone ? `https://wa.me/${phone.slice(1)}` : "#";
    }
    case "INSTAGRAM":
      return isUrl ? safeExternalUrl(clean, ["instagram.com"]) : `https://www.instagram.com/${encodeURIComponent(clean)}`;
    case "TIKTOK":
      return isUrl ? safeExternalUrl(clean, ["tiktok.com"]) : `https://www.tiktok.com/@${encodeURIComponent(clean)}`;
    case "FACEBOOK":
      return isUrl ? safeExternalUrl(clean, ["facebook.com", "fb.com"]) : `https://www.facebook.com/${encodeURIComponent(clean)}`;
    case "PHONE": {
      const phone = normalizeNigerianPhone(clean);
      return phone ? `tel:${phone}` : "#";
    }
    default:
      return "#";
  }
}

function savedKey(type: SavedListingType, id: string): string {
  return `${type}:${id}`;
}

function parseSavedPage(payload: unknown, type: SavedListingType): SavedListingIds {
  const result: SavedListingIds = {};
  if (!isRecord(payload) || !Array.isArray(payload.items)) return result;
  for (const raw of payload.items) {
    if (!isRecord(raw) || raw.type !== type || !isRecord(raw.listing)) continue;
    if (typeof raw.id === "string" && typeof raw.listing.id === "string") {
      result[savedKey(type, raw.listing.id)] = raw.id;
    }
  }
  return result;
}

async function loadSavedType(type: SavedListingType, signal: AbortSignal): Promise<SavedListingIds> {
  const response = await fetch(`/api/saved?type=${type}&page=1&limit=50`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  if (response.status === 401 || response.status === 403) return {};
  if (!response.ok) throw new Error(`Unable to load saved ${type.toLowerCase()} listings.`);
  const payload: unknown = await response.json();
  const result = parseSavedPage(payload, type);
  const pagination = isRecord(payload) && isRecord(payload.pagination) ? payload.pagination : null;
  const totalPages = pagination && typeof pagination.totalPages === "number"
    ? Math.max(1, Math.floor(pagination.totalPages))
    : 1;
  for (let start = 2; start <= totalPages; start += 4) {
    const pages = Array.from({ length: Math.min(4, totalPages - start + 1) }, (_, index) => start + index);
    const pageResults = await Promise.all(pages.map(async (page) => {
      const pageResponse = await fetch(`/api/saved?type=${type}&page=${page}&limit=50`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      if (!pageResponse.ok) throw new Error(`Unable to load saved ${type.toLowerCase()} listings.`);
      return parseSavedPage(await pageResponse.json(), type);
    }));
    pageResults.forEach((pageResult) => Object.assign(result, pageResult));
  }
  return result;
}

function parseImages(value: unknown): ProductImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((image): ProductImage[] => {
    if (!isRecord(image) || typeof image.url !== "string" || !image.url.trim()) return [];
    return [{
      id: typeof image.id === "string" ? image.id : undefined,
      url: image.url,
      publicId: typeof image.publicId === "string" ? image.publicId : null,
      sortOrder: typeof image.sortOrder === "number" ? image.sortOrder : 0,
    }];
  }).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function parseProduct(raw: unknown): Product | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const price = getNumber(raw.price);
  const original = getNumber(raw.originalPrice);
  const rawCategory = isRecord(raw.category) ? raw.category : null;
  return {
    id: raw.id,
    name: raw.name,
    description: getString(raw.description),
    price,
    originalPrice: productOriginalPrice(price, original),
    availability: isAvailability(raw.availability),
    imageUrl: getString(raw.imageUrl),
    images: parseImages(raw.images),
    category: rawCategory && typeof rawCategory.name === "string"
      ? { id: getString(rawCategory.id) ?? undefined, name: rawCategory.name }
      : null,
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.filter((word): word is string => typeof word === "string" && word.trim().length > 0)
      : [],
  };
}

function parseService(raw: unknown): Service | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const rawCategory = isRecord(raw.category) ? raw.category : null;
  const fulfillmentType: Service["fulfillmentType"] =
    raw.fulfillmentType === "AT_PROVIDER" || raw.fulfillmentType === "AT_CUSTOMER" || raw.fulfillmentType === "REMOTE"
      ? raw.fulfillmentType
      : "FLEXIBLE";
  return {
    id: raw.id,
    name: raw.name,
    description: getString(raw.description),
    price: getNumber(raw.price),
    priceMin: getNumber(raw.priceMin),
    priceMax: getNumber(raw.priceMax),
    durationMinutes: getNumber(raw.durationMinutes),
    fulfillmentType,
    availability: isAvailability(raw.availability),
    imageUrl: getString(raw.imageUrl),
    images: parseImages(raw.images),
    category: rawCategory && typeof rawCategory.name === "string"
      ? { id: getString(rawCategory.id) ?? undefined, name: rawCategory.name, iconKey: getString(rawCategory.iconKey) }
      : null,
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.filter((word): word is string => typeof word === "string" && word.trim().length > 0)
      : [],
  };
}

function formatReviewDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  return parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function RatingStars({ rating, size = 15 }: { rating: number; size?: number }) {
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={size} className={star <= Math.round(rating) ? "fill-[#FFB300] text-[#FFB300]" : "text-[#D8D1CA]"} />
      ))}
    </div>
  );
}

function RatingLabel({ rating }: { rating: number }) {
  const labels = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  return <span>{labels[rating] ?? "Select a rating"}</span>;
}

function ContactIcon({ platform }: { platform: string }) {
  switch (platform) {
    case "WHATSAPP": return <MessageCircle size={16} />;
    case "PHONE": return <Phone size={16} />;
    case "INSTAGRAM": return <ExternalLink size={16} />;
    case "FACEBOOK": return <ExternalLink size={16} />;
    case "TIKTOK": return <Music2 size={16} />;
    default: return <ExternalLink size={16} />;
  }
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

  const products = Array.isArray(raw.products) ? raw.products.map(parseProduct).filter((item): item is Product => item !== null) : [];
  const services = Array.isArray(raw.services) ? raw.services.map(parseService).filter((item): item is Service => item !== null) : [];
  const rawLocation = isRecord(raw.location) ? raw.location : null;
  const location: SellerLocation = rawLocation ? {
    id: getString(rawLocation.id) ?? undefined,
    area: getString(rawLocation.area, "") ?? "",
    street: getString(rawLocation.street),
    address: getString(rawLocation.address),
    hasDirections: rawLocation.hasDirections === true,
  } : null;
  const links = Array.isArray(raw.socialLinks) ? raw.socialLinks.flatMap((entry): SocialLink[] => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.platform !== "string" || typeof entry.handle !== "string") return [];
    return [{ id: entry.id, platform: entry.platform, handle: entry.handle }];
  }) : [];
  const verification: Verification = raw.verification === "VERIFIED" ? "VERIFIED" : "UNVERIFIED";
  const productCount = typeof raw.productCount === "number" && Number.isInteger(raw.productCount) && raw.productCount >= 0 ? raw.productCount : products.length;
  const serviceCount = typeof raw.serviceCount === "number" && Number.isInteger(raw.serviceCount) && raw.serviceCount >= 0 ? raw.serviceCount : services.length;
  const averageRating = typeof raw.averageRating === "number" && Number.isFinite(raw.averageRating) ? Math.max(0, Math.min(5, raw.averageRating)) : 0;
  const reviewCount = typeof raw.reviewCount === "number" && Number.isInteger(raw.reviewCount) && raw.reviewCount >= 0 ? raw.reviewCount : 0;
  return {
    id: raw.id,
    name: getString(raw.name, "ReMarket Seller") ?? "ReMarket Seller",
    ownerName: getString(raw.ownerName),
    description: getString(raw.description),
    location,
    availability: isAvailability(raw.availability),
    verification,
    verified: raw.verified === true || verification === "VERIFIED",
    category: getString(raw.category) ?? categories[0] ?? null,
    categories,
    productCount,
    products,
    serviceCount,
    services,
    showContactInfo: raw.showContactInfo === true,
    socialLinks: links,
    imageUrl: getString(raw.imageUrl),
    averageRating,
    reviewCount,
  };
}

/* =========================================================
   SAVE LISTING BUTTON
========================================================= */

function SaveButton({
  type,
  listingId,
  saved,
  busy,
  disabled,
  onClick,
}: {
  type: SavedListingType;
  listingId: string;
  saved: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: (type: SavedListingType, id: string) => void;
}) {
  const label = type === "PRODUCT" ? "product" : "service";
  return (
    <button
      type="button"
      onClick={() => onClick(type, listingId)}
      disabled={busy || disabled}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${label} from Saved` : `Save ${label}`}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white/95 shadow-sm transition disabled:cursor-wait disabled:opacity-60 ${saved ? "border-[#FFB39F] text-[#9F2D18]" : "border-[#EAE6DF] text-[#756B61] hover:border-[#FFB39F] hover:text-[#9F2D18]"}`}
    >
      {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Heart size={17} fill={saved ? "currentColor" : "none"} />}
    </button>
  );
}

/* =========================================================
   PRODUCT AND SERVICE CARDS
========================================================= */

function ProductCard({
  product,
  sellerCategory,
  saved,
  saving,
  savedLoading,
  onSave,
}: {
  product: Product;
  sellerCategory: string | null;
  saved: boolean;
  saving: boolean;
  savedLoading: boolean;
  onSave: (type: SavedListingType, id: string) => void;
}) {
  const images = getProductImages(product);
  const originalPrice = productOriginalPrice(product.price, product.originalPrice);
  const discount = discountPercent(product.price, originalPrice);
  return (
    <article className="group min-w-0 overflow-hidden rounded-[18px] border border-[#EAE6DF] bg-white transition duration-200 hover:-translate-y-1 hover:border-[#F4B7A8] hover:shadow-[0_14px_34px_rgba(64,27,19,0.09)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#FCFAF6]">
        <Link href={`/product/${encodeURIComponent(product.id)}`} aria-label={`View ${product.name}`} className="block h-full w-full">
          {images[0] ? (
            <img src={images[0].url} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]" />
          ) : (
            <div className="flex h-full items-center justify-center" style={{ backgroundColor: getCategoryColor(product.category?.name ?? sellerCategory) }}>
              <Package size={34} className="text-[#9F2D18]" />
            </div>
          )}
        </Link>
        {discount !== null && (
          <span className="absolute left-3 top-3 rounded-full bg-[#9F2D18] px-2.5 py-1 text-[10px] font-extrabold text-white shadow-sm">-{discount}%</span>
        )}
        <div className="absolute right-3 top-3">
          <SaveButton type="PRODUCT" listingId={product.id} saved={saved} busy={saving} disabled={savedLoading} onClick={onSave} />
        </div>
        <span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[9px] font-bold shadow-sm ${getAvailabilityClass(product.availability)}`}>
          {getAvailabilityLabel(product.availability)}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 min-h-[40px] text-[13px] font-extrabold leading-5 text-[#292522]">
              <Link href={`/product/${encodeURIComponent(product.id)}`} className="transition hover:text-[#9F2D18]">{product.name}</Link>
            </h3>
            {product.category?.name && <p className="mt-1 text-[10px] font-semibold text-[#91877E]">{product.category.name}</p>}
          </div>
        </div>
        {product.description && <p className="mt-2 line-clamp-2 min-h-[36px] text-[10px] leading-[18px] text-[#817970]">{product.description}</p>}
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[15px] font-black text-[#9F2D18]">{formatProductPrice(product)}</span>
          {originalPrice !== null && <span className="text-[10px] font-semibold text-[#A69D94] line-through">{money(originalPrice)}</span>}
        </div>
        {product.keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {product.keywords.slice(0, 3).map((keyword) => <span key={`${product.id}-${keyword}`} className="rounded-full bg-[#F5F1EC] px-2 py-1 text-[9px] font-semibold text-[#756B61]">{keyword}</span>)}
          </div>
        )}
        <Link href={`/product/${encodeURIComponent(product.id)}`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#FFF0E9] px-3 py-2 text-[10px] font-extrabold text-[#9F2D18] transition hover:bg-[#FFE2D8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]">
          View product <ArrowRight size={13} />
        </Link>
      </div>
    </article>
  );
}

function ServiceCard({
  service,
  saved,
  saving,
  savedLoading,
  onSave,
}: {
  service: Service;
  saved: boolean;
  saving: boolean;
  savedLoading: boolean;
  onSave: (type: SavedListingType, id: string) => void;
}) {
  const images = getProductImages(service);
  const duration = formatDuration(service.durationMinutes);
  return (
    <article className="group min-w-0 overflow-hidden rounded-[18px] border border-[#EAE6DF] bg-white transition duration-200 hover:-translate-y-1 hover:border-[#F4B7A8] hover:shadow-[0_14px_34px_rgba(64,27,19,0.09)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#FCFAF6]">
        {images[0] ? <img src={images[0].url} alt={service.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.035]" /> : (
          <div className="flex h-full items-center justify-center bg-[#F2EDE7]"><Wrench size={34} className="text-[#9F2D18]" /></div>
        )}
        <div className="absolute right-3 top-3"><SaveButton type="SERVICE" listingId={service.id} saved={saved} busy={saving} disabled={savedLoading} onClick={onSave} /></div>
        <span className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[9px] font-bold shadow-sm ${getAvailabilityClass(service.availability)}`}>{getAvailabilityLabel(service.availability)}</span>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 min-h-[40px] text-[13px] font-extrabold leading-5 text-[#292522]">{service.name}</h3>
        {service.category?.name && <p className="mt-1 text-[10px] font-semibold text-[#91877E]">{service.category.name}</p>}
        {service.description && <p className="mt-2 line-clamp-2 min-h-[36px] text-[10px] leading-[18px] text-[#817970]">{service.description}</p>}
        <p className="mt-3 text-[15px] font-black text-[#9F2D18]">{formatServicePrice(service)}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[#FCFAF6] px-2.5 py-1 text-[9px] font-semibold text-[#746D67]">{getFulfillmentLabel(service.fulfillmentType)}</span>
          {duration && <span className="inline-flex items-center gap-1 rounded-full bg-[#FCFAF6] px-2.5 py-1 text-[9px] font-semibold text-[#746D67]"><Clock3 size={10} />{duration}</span>}
        </div>
        <a href="#seller-contact" className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[#FFF0E9] px-3 py-2 text-[10px] font-extrabold text-[#9F2D18] transition hover:bg-[#FFE2D8]">Contact about this service</a>
      </div>
    </article>
  );
}

/* =========================================================
   SELLER PROFILE PAGE
========================================================= */

function SellerPageContent({ id }: { id: string }) {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [savedListingIds, setSavedListingIds] = useState<SavedListingIds>({});
  const [savedListingsLoading, setSavedListingsLoading] = useState(true);
  const [savingListingKey, setSavingListingKey] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState("");
  const [savedAuthRequired, setSavedAuthRequired] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<ReMarketRole | null>(null);
  const [currentUserLoading, setCurrentUserLoading] = useState(true);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsLoadingMore, setReviewsLoadingMore] = useState(false);
  const [reviewsHasMore, setReviewsHasMore] = useState(false);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewError, setReviewError] = useState("");
  const [reviewSuccess, setReviewSuccess] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingRating, setEditingRating] = useState(0);
  const [editingComment, setEditingComment] = useState("");
  const [reviewUpdatingId, setReviewUpdatingId] = useState<string | null>(null);
  const [reviewDeletingId, setReviewDeletingId] = useState<string | null>(null);
  const [ratingBreakdown, setRatingBreakdown] = useState<RatingBreakdown>(EMPTY_BREAKDOWN);
  const reviewRequestId = useRef(0);

  const [shareNotice, setShareNotice] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [activeProductCategory, setActiveProductCategory] = useState("All");

  useEffect(() => {
    const controller = new AbortController();
    async function loadSaved() {
      setSavedListingsLoading(true);
      try {
        const [products, services] = await Promise.all([
          loadSavedType("PRODUCT", controller.signal),
          loadSavedType("SERVICE", controller.signal),
        ]);
        if (!controller.signal.aborted) setSavedListingIds({ ...products, ...services });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.error("Seller saved listings load error:", err);
        }
      } finally {
        if (!controller.signal.aborted) setSavedListingsLoading(false);
      }
    }
    void loadSaved();
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const session = await getSession();
        if (cancelled) return;
        const role = session?.user?.role;
        setCurrentUserRole(role === "ADMIN" || role === "SELLER" || role === "BUYER" ? role : null);
      } catch (err) {
        console.error("Seller page session lookup error:", err);
        if (!cancelled) setCurrentUserRole(null);
      } finally {
        if (!cancelled) setCurrentUserLoading(false);
      }
    }
    void loadUser();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadSeller() {
      setLoading(true);
      setError("");
      setNotFound(false);
      try {
        const response = await fetch(`/api/businesses/${encodeURIComponent(id)}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          if (response.status === 404) setNotFound(true);
          throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to load seller.");
        }
        const raw = isRecord(payload) && "business" in payload ? payload.business : payload;
        const normalized = normalizeSeller(raw);
        if (!normalized) throw new Error("Seller information was not found.");
        if (!controller.signal.aborted) setSeller(normalized);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Seller page error:", err);
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load seller.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    if (id) void loadSeller();
    return () => controller.abort();
  }, [id]);

  const loadReviews = useCallback(async (page = 1, append = false) => {
    if (!id) return;
    const requestId = ++reviewRequestId.current;
    try {
      if (!append) setReviewsLoading(true);
      setReviewError("");
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews?page=${page}&pageSize=10`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to load reviews.");
      if (requestId !== reviewRequestId.current) return;
      const data = isRecord(payload) ? payload : {};
      const rawReviews = Array.isArray(data.reviews) ? data.reviews : [];
      const normalized = rawReviews.flatMap((raw): Review[] => {
        if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.rating !== "number" || !isRecord(raw.user)) return [];
        const rating = Number.isInteger(raw.rating) ? Math.min(5, Math.max(1, raw.rating)) : 0;
        if (rating < 1) return [];
        return [{
          id: raw.id,
          rating,
          comment: getString(raw.comment),
          createdAt: getString(raw.createdAt, "") ?? "",
          updatedAt: getString(raw.updatedAt, "") ?? "",
          isOwnReview: raw.isOwnReview === true,
          user: { name: getString(raw.user.name, "ReMarket user") ?? "ReMarket user" },
        }];
      });
      const average = typeof data.averageRating === "number" && Number.isFinite(data.averageRating) ? Math.max(0, Math.min(5, data.averageRating)) : 0;
      const count = typeof data.reviewCount === "number" && Number.isInteger(data.reviewCount) && data.reviewCount >= 0 ? data.reviewCount : normalized.length;
      const breakdown: RatingBreakdown = { ...EMPTY_BREAKDOWN };
      const rawRatingBreakdown = data.ratingBreakdown;
      if (isRecord(rawRatingBreakdown)) {
        ([1, 2, 3, 4, 5] as const).forEach((rating) => {
          const value = rawRatingBreakdown[String(rating)];
          if (typeof value === "number" && Number.isInteger(value) && value >= 0) breakdown[rating] = value;
        });
      } else {
        normalized.forEach((review) => { breakdown[review.rating as 1 | 2 | 3 | 4 | 5] += 1; });
      }
      if (requestId !== reviewRequestId.current) return;
      setReviews((current) => append ? [...current, ...normalized] : normalized);
      setReviewsPage(typeof data.page === "number" && Number.isInteger(data.page) ? data.page : page);
      setReviewsHasMore(data.hasMore === true);
      setRatingBreakdown(breakdown);
      setSeller((current) => current ? { ...current, averageRating: average, reviewCount: count } : current);
    } catch (err) {
      if (requestId !== reviewRequestId.current) return;
      console.error("Reviews load error:", err);
      setReviewError(err instanceof Error ? err.message : "Unable to load reviews.");
    } finally {
      if (requestId === reviewRequestId.current && !append) setReviewsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadReviews();
    return () => { reviewRequestId.current += 1; };
  }, [loadReviews]);

  const loadMoreReviews = async () => {
    if (reviewsLoadingMore || reviewsLoading || !reviewsHasMore) return;
    setReviewsLoadingMore(true);
    try { await loadReviews(reviewsPage + 1, true); }
    finally { setReviewsLoadingMore(false); }
  };

  async function toggleSaved(type: SavedListingType, listingId: string) {
    const key = savedKey(type, listingId);
    if (savingListingKey) return;
    const existingId = savedListingIds[key];
    setSavingListingKey(key);
    setSavedNotice("");
    setSavedAuthRequired(false);
    try {
      if (existingId) {
        const response = await fetch(`/api/saved/${encodeURIComponent(existingId)}`, { method: "DELETE", cache: "no-store", headers: { Accept: "application/json" } });
        const payload: unknown = await response.json().catch(() => null);
        if (response.status === 401) { setSavedAuthRequired(true); throw new Error("Sign in again to manage your saved listings."); }
        if (response.status === 404) {
          setSavedListingIds((current) => { const next = { ...current }; delete next[key]; return next; });
          setSavedNotice("This item was already removed from Saved.");
          return;
        }
        if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to remove this listing from Saved.");
        setSavedListingIds((current) => { const next = { ...current }; delete next[key]; return next; });
        setSavedNotice(type === "PRODUCT" ? "Product removed from Saved." : "Service removed from Saved.");
        return;
      }
      const response = await fetch("/api/saved", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ type, listingId }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401) { setSavedAuthRequired(true); throw new Error("Sign in to save products and services."); }
      if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to save this listing.");
      const item = isRecord(payload) && isRecord(payload.item) ? payload.item : null;
      if (!item || typeof item.id !== "string") throw new Error("The saved listing ID was not returned. Refresh and try again.");
      setSavedListingIds((current) => ({ ...current, [key]: item.id as string }));
      setSavedNotice(isRecord(payload) && payload.alreadySaved === true ? "This item is already in Saved." : type === "PRODUCT" ? "Product added to Saved." : "Service added to Saved.");
    } catch (err) {
      console.error("Saved listing action error:", err);
      setSavedNotice(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSavingListingKey(null);
    }
  }

  function trackContact(platform: string) {
    if (!seller?.id || !isContactEventPlatform(platform)) return;
    void trackContactEvent({ businessId: seller.id, platform });
  }

  const directionsUrl = seller?.id && (seller.location?.hasDirections || seller.location?.address)
    ? `/api/businesses/${encodeURIComponent(seller.id)}/directions`
    : "#";

  function openDirections() {
    if (!seller || directionsUrl === "#" || directionsLoading) return;
    trackContact("DIRECTIONS");
    setDirectionsLoading(true);
    const opened = window.open("about:blank", "_blank");
    if (opened) opened.opener = null;
    const navigate = (position?: GeolocationPosition) => {
      const url = new URL(directionsUrl, window.location.origin);
      if (position) {
        url.searchParams.set("originLat", String(position.coords.latitude));
        url.searchParams.set("originLng", String(position.coords.longitude));
      }
      if (opened && !opened.closed) opened.location.href = url.toString();
      else window.location.assign(url.toString());
      setDirectionsLoading(false);
    };
    if (!navigator.geolocation) { navigate(); return; }
    navigator.geolocation.getCurrentPosition(navigate, () => navigate(), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  async function shareSeller() {
    if (!seller) return;
    const shareData = { title: seller.name, text: `Discover ${seller.name} on ReMarket.`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        setShareNotice("Seller link copied.");
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") setShareNotice("Unable to share this seller right now.");
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewSubmitting || !seller) return;
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
      setReviewRating(0); setReviewComment(""); setReviewSuccess("Your review was submitted successfully.");
      await loadReviews();
    } catch (err) { setReviewError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setReviewSubmitting(false); }
  }

  function beginEditReview(review: Review) {
    setReviewError(""); setReviewSuccess(""); setEditingReviewId(review.id); setEditingRating(review.rating); setEditingComment(review.comment ?? "");
  }

  function cancelEditReview() {
    if (reviewUpdatingId) return;
    setEditingReviewId(null); setEditingRating(0); setEditingComment(""); setReviewError("");
  }

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
      setEditingReviewId(null); setEditingRating(0); setEditingComment(""); setReviewSuccess("Your review was updated successfully.");
      await loadReviews();
    } catch (err) { setReviewError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setReviewUpdatingId(null); }
  }

  async function deleteReview(reviewId: string) {
    if (reviewDeletingId || currentUserRole !== "BUYER") return;
    if (!window.confirm("Delete your review from this business?")) return;
    setReviewDeletingId(reviewId); setReviewError(""); setReviewSuccess("");
    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews/${encodeURIComponent(reviewId)}`, { method: "DELETE" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to delete your review.");
      if (editingReviewId === reviewId) cancelEditReview();
      setReviewSuccess("Your review was deleted successfully.");
      await loadReviews();
    } catch (err) { setReviewError(err instanceof Error ? err.message : "Something went wrong. Please try again."); }
    finally { setReviewDeletingId(null); }
  }

  const productCategories = useMemo(() => {
    const unique = new Set<string>();
    seller?.products.forEach((product) => { if (product.category?.name) unique.add(product.category.name); });
    return [...unique];
  }, [seller?.products]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return (seller?.products ?? []).filter((product) => {
      const matchesCategory = activeProductCategory === "All" || product.category?.name === activeProductCategory;
      const searchable = [product.name, product.description ?? "", product.category?.name ?? "", ...product.keywords].join(" ").toLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [seller?.products, productSearch, activeProductCategory]);

  if (!id) {
    return (
      <>
        <SiteHeader searchMode="ALL" />
        <main className="flex min-h-[65vh] w-full items-center justify-center bg-[#FFF7ED] px-4 py-12">
          <div className="max-w-md rounded-3xl border border-[#F0C9BF] bg-white p-8 text-center shadow-sm">
            <Store size={34} className="mx-auto text-[#9F2D18]" />
            <h1 className="mt-4 text-xl font-black text-[#401B13]">Seller not found</h1>
            <p className="mt-2 text-sm leading-6 text-[#756B61]">We couldn&apos;t find the seller you&apos;re looking for.</p>
            <Link href="/shop" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white">Browse products <ArrowRight size={15} /></Link>
          </div>
        </main>
        <MobileBottomNav />
      </>
    );
  }

  return (
    <>
      <SiteHeader searchMode="ALL" />
      <main id="main-content" className="min-h-screen w-full overflow-x-clip bg-[#FFFDFC] pb-24 text-[#292522] lg:pb-10">
        {loading ? (
          <div className="mx-auto w-full px-4 py-10 sm:px-6 xl:px-10 2xl:px-14">
            <div className="h-[260px] animate-pulse rounded-[26px] bg-[#F2EDE7]" />
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-2xl bg-[#F2EDE7]" />)}
            </div>
          </div>
        ) : error || !seller ? (
          <div className="mx-auto flex min-h-[65vh] w-full items-center justify-center px-4 py-12">
            <section className="w-full max-w-lg rounded-3xl border border-[#F0C9BF] bg-[#FFF8F5] p-8 text-center">
              <Store size={34} className="mx-auto text-[#9F2D18]" />
              <h1 className="mt-4 text-xl font-black text-[#401B13]">{notFound ? "Seller not found" : "Unable to load seller"}</h1>
              <p className="mt-2 text-sm leading-6 text-[#756B61]">{notFound ? "This seller profile may have been removed or is no longer available." : error || "We could not load this seller profile."}</p>
              {!notFound && <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl border border-[#EAE6DF] bg-white px-5 py-3 text-xs font-bold text-[#756B61]">Try again</button>}
              <Link href="/shop" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white">Back to Shop <ArrowRight size={14} /></Link>
            </section>
          </div>
        ) : (
          <>
            {/* WIDE SELLER BILLBOARD / IDENTITY */}
            <section className="relative isolate w-full overflow-hidden border-b border-[#EAE6DF] bg-[#401B13] text-white">
              <div className="pointer-events-none absolute inset-0 -z-10 opacity-90" style={{ backgroundImage: "radial-gradient(circle at 12% 20%, rgba(255,90,54,.62), transparent 34%), radial-gradient(circle at 88% 10%, rgba(255,210,184,.18), transparent 26%), linear-gradient(115deg, #401B13 0%, #6F271A 54%, #9F2D18 100%)" }} />
              <div className="pointer-events-none absolute -right-24 -top-36 -z-10 h-[420px] w-[420px] rounded-full border border-white/10" />
              <div className="pointer-events-none absolute -right-8 -top-20 -z-10 h-[290px] w-[290px] rounded-full border border-white/10" />
              <div className="mx-auto flex w-full flex-col gap-7 px-4 py-8 sm:px-6 sm:py-10 xl:px-10 xl:py-12 2xl:px-14">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">
                  <Store size={13} /> ReMarket storefront <span className="text-white/35">/</span> Local business
                </div>
                <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
                  <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[25px] border-4 border-white/20 bg-[#FFF0E9] text-2xl font-black text-[#9F2D18] shadow-[0_14px_34px_rgba(0,0,0,.18)] sm:h-28 sm:w-28">
                      {seller.imageUrl ? <img src={seller.imageUrl} alt={`${seller.name} logo`} className="h-full w-full object-cover" /> : getInitials(seller.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h1 className="break-words text-3xl font-black tracking-tight sm:text-4xl xl:text-[44px]">{seller.name}</h1>
                        {seller.verified && <span title="Verified business" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#16845D]"><BadgeCheck size={19} /></span>}
                      </div>
                      {seller.ownerName && <p className="mt-1 text-sm text-white/70">Owned by {seller.ownerName}</p>}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {seller.category && <span className="rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-bold text-white">{seller.category}</span>}
                        <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${seller.availability === "AVAILABLE" ? "bg-[#E4F7EC] text-[#237A48]" : seller.availability === "UNAVAILABLE" ? "bg-white/15 text-white/80" : "bg-[#FFF0D9] text-[#9F2D18]"}`}>{getAvailabilityLabel(seller.availability)}</span>
                        {seller.verified && <span className="inline-flex items-center gap-1 rounded-full bg-[#E4F7EC] px-3 py-1.5 text-[10px] font-bold text-[#237A48]"><CheckCircle2 size={12} /> Verified business</span>}
                      </div>
                      {seller.location?.area && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-white/75"><MapPin size={14} />{seller.location.area}{seller.location.street ? ` · ${seller.location.street}` : ""}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <a href="#seller-contact" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-extrabold text-[#9F2D18] shadow-sm transition hover:bg-[#FFF0E9]"><MessageCircle size={15} /> Contact seller</a>
                    <button type="button" onClick={() => void shareSeller()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-3 text-xs font-bold text-white transition hover:bg-white/20"><Share2 size={15} /> Share store</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-white/15 pt-5 sm:grid-cols-4">
                  <div><p className="text-2xl font-black">{seller.productCount}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">Products</p></div>
                  <div><p className="text-2xl font-black">{seller.serviceCount}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">Services</p></div>
                  <div><p className="text-2xl font-black">{seller.reviewCount > 0 ? seller.averageRating.toFixed(1) : "—"}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">Average rating</p></div>
                  <div><p className="text-2xl font-black">{seller.reviewCount}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">Customer reviews</p></div>
                </div>
              </div>
            </section>

            {/* STORE SECTION NAVIGATION — replaces the old desktop sidebar */}
            <nav aria-label="Seller storefront sections" className="relative z-10 w-full border-b border-[#EAE6DF] bg-white shadow-[0_3px_12px_rgba(64,27,19,.035)]">
              <div className="mx-auto flex w-full items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 xl:px-10 2xl:px-14">
                <a href="#seller-products" className="shrink-0 rounded-full bg-[#FFF0E9] px-4 py-2 text-[11px] font-extrabold text-[#9F2D18]">Products</a>
                <a href="#seller-services" className="shrink-0 rounded-full px-4 py-2 text-[11px] font-bold text-[#625B55] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]">Services</a>
                <a href="#seller-about" className="shrink-0 rounded-full px-4 py-2 text-[11px] font-bold text-[#625B55] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]">About</a>
                <a href="#seller-contact" className="shrink-0 rounded-full px-4 py-2 text-[11px] font-bold text-[#625B55] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]">Contact & location</a>
                <a href="#seller-reviews" className="shrink-0 rounded-full px-4 py-2 text-[11px] font-bold text-[#625B55] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]">Reviews ({seller.reviewCount})</a>
                <span className="ml-auto hidden shrink-0 text-[10px] font-semibold text-[#A29B94] xl:inline">Find it nearby</span>
              </div>
            </nav>

            <div className="mx-auto w-full px-4 py-7 sm:px-6 xl:px-10 xl:py-9 2xl:px-14">
              {savedNotice && (
                <div role="status" aria-live="polite" className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-[#F0C9BF] bg-[#FFF1ED] px-4 py-3 text-[11px] font-semibold text-[#9F2D18]">
                  <Heart size={15} /><span>{savedNotice}</span>
                  {savedAuthRequired && <Link href={`/buyer/login?callbackUrl=${encodeURIComponent(`/seller/${id}`)}`} className="font-extrabold underline underline-offset-2">Sign in</Link>}
                </div>
              )}
              {shareNotice && <p role="status" className="mb-5 rounded-xl bg-[#FCFAF6] px-4 py-3 text-[11px] font-semibold text-[#756B61]">{shareNotice}</p>}

              {/* STORE OVERVIEW / CATEGORY NAV */}
              <section id="seller-about" className="scroll-mt-20 grid gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
                <div className="rounded-[22px] border border-[#EAE6DF] bg-white p-5 shadow-[0_4px_18px_rgba(64,27,19,.035)] sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF5A36]">About this business</p><h2 className="mt-1 text-xl font-black text-[#401B13]">Get to know {seller.name}</h2></div>
                    {seller.verified && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E4F7EC] px-3 py-1.5 text-[10px] font-bold text-[#237A48]"><BadgeCheck size={13} /> Verified on ReMarket</span>}
                  </div>
                  <p className="mt-4 whitespace-pre-line text-[13px] leading-7 text-[#68615C]">{seller.description || "Explore products and services from this nearby business. Contact the seller for more information about current offers and availability."}</p>
                  {seller.categories.length > 0 && (
                    <div className="mt-6 border-t border-[#F0ECE7] pt-5">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#A29B94]">Shop by category</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {seller.categories.map((category) => <span key={category} className="rounded-full px-3.5 py-2 text-[10px] font-bold text-[#514B46]" style={{ backgroundColor: getCategoryColor(category) }}>{category}</span>)}
                      </div>
                    </div>
                  )}
                </div>
                <aside id="seller-contact" className="scroll-mt-20 rounded-[22px] border border-[#F0D7B3] bg-[#FFF8EC] p-5 sm:p-6">
                  <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#9F2D18]"><MessageCircle size={19} /></div><div><h2 className="text-sm font-black text-[#401B13]">Contact this seller</h2><p className="mt-0.5 text-[10px] text-[#887967]">Ask about a product or service</p></div></div>
                  <div className="mt-5 space-y-2">
                    {seller.showContactInfo && seller.socialLinks.length > 0 ? seller.socialLinks.map((link) => {
                      if (link.platform === "DIRECTIONS") return null;
                      const url = buildContactUrl(link.platform, link.handle);
                      if (url === "#") return null;
                      const isPhone = link.platform === "PHONE";
                      const label = link.platform === "WHATSAPP" ? "WhatsApp" : link.platform === "PHONE" ? "Call seller" : link.platform === "INSTAGRAM" ? "Instagram" : link.platform === "TIKTOK" ? "TikTok" : link.platform === "FACEBOOK" ? "Facebook" : link.platform;
                      return <a key={link.id} href={url} target={isPhone ? undefined : "_blank"} rel={isPhone ? undefined : "noopener noreferrer"} onClick={() => trackContact(link.platform)} className="flex min-h-11 items-center justify-between rounded-xl border border-[#F0D7B3] bg-white px-3.5 py-3 text-[11px] font-extrabold text-[#514B46] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"><span className="flex items-center gap-2.5"><ContactIcon platform={link.platform} />{label}</span><ExternalLink size={13} className="text-[#A29B94]" /></a>;
                    }) : <p className="rounded-xl border border-white/80 bg-white/75 px-3.5 py-3 text-[11px] leading-5 text-[#817970]">{seller.showContactInfo ? "No contact details have been added yet." : "This seller has chosen not to display contact details publicly."}</p>}
                    {directionsUrl !== "#" && <button type="button" onClick={openDirections} disabled={directionsLoading} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-[#F0D7B3] bg-white px-3.5 py-3 text-[11px] font-extrabold text-[#514B46] transition hover:border-[#FFB39F] hover:text-[#9F2D18] disabled:opacity-60"><span className="flex items-center gap-2.5"><MapPin size={16} />{directionsLoading ? "Opening directions..." : "Get directions"}</span><ExternalLink size={13} /></button>}
                  </div>
                  {(seller.location?.area || seller.location?.address) && <div className="mt-4 rounded-xl bg-white/80 p-3"><p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#A29B94]">Business location</p><p className="mt-1 flex items-start gap-2 text-[11px] font-semibold leading-5 text-[#625B55]"><MapPin size={14} className="mt-0.5 shrink-0 text-[#FF5A36]" /><span>{[seller.location?.area, seller.location?.street, seller.location?.address].filter(Boolean).join(" · ")}</span></p></div>}
                  <p className="mt-3 text-[9px] leading-5 text-[#8B7D6C]">Contact information is shown according to the seller&apos;s public contact settings.</p>
                </aside>
              </section>

              {/* PRODUCTS */}
              <section id="seller-products" className="scroll-mt-20 mt-8">
                <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF5A36]">Explore this store</p><h2 className="mt-1 text-2xl font-black tracking-tight text-[#401B13]">Products</h2><p className="mt-1 text-[11px] text-[#8B847E]">{seller.productCount} {seller.productCount === 1 ? "product" : "products"} listed by {seller.name}</p></div>
                  {seller.products.length > 0 && (
                    <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3.5 shadow-sm xl:max-w-[360px]">
                      <Search size={16} className="shrink-0 text-[#9B9188]" />
                      <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={`Search ${seller.name}'s products`} aria-label="Search this seller's products" className="w-full bg-transparent text-[11px] text-[#292522] outline-none placeholder:text-[#A69D94]" />
                    </label>
                  )}
                </div>
                {productCategories.length > 0 && seller.products.length > 0 && (
                  <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                    {["All", ...productCategories].map((category) => (
                      <button key={category} type="button" onClick={() => setActiveProductCategory(category)} aria-pressed={activeProductCategory === category} className={`shrink-0 rounded-full border px-3.5 py-2 text-[10px] font-bold transition ${activeProductCategory === category ? "border-[#FF5A36] bg-[#FFF0E9] text-[#9F2D18]" : "border-[#EAE6DF] bg-white text-[#756B61] hover:border-[#FFB39F] hover:text-[#9F2D18]"}`}>{category === "All" ? "All products" : category}</button>
                    ))}
                  </div>
                )}
                {seller.products.length > 0 ? (
                  filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {filteredProducts.map((product) => <ProductCard key={product.id} product={product} sellerCategory={seller.category} saved={Boolean(savedListingIds[savedKey("PRODUCT", product.id)])} saving={savingListingKey === savedKey("PRODUCT", product.id)} savedLoading={savedListingsLoading} onSave={(type, listingId) => { void toggleSaved(type, listingId); }} />)}
                    </div>
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-[#DDD6CE] bg-[#FCFAF6] px-5 py-12 text-center"><Search size={27} className="mx-auto text-[#AAA29B]" /><p className="mt-3 text-sm font-extrabold text-[#625B55]">No matching products</p><p className="mt-1 text-[11px] text-[#928A83]">Try another search or category.</p><button type="button" onClick={() => { setProductSearch(""); setActiveProductCategory("All"); }} className="mt-4 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2 text-[10px] font-bold text-[#9F2D18]">Clear filters</button></div>
                  )
                ) : (
                  <div className="rounded-[22px] border border-dashed border-[#DDD6CE] bg-[#FCFAF6] px-5 py-14 text-center"><Package size={30} className="mx-auto text-[#AAA29B]" /><p className="mt-3 text-sm font-extrabold text-[#625B55]">No products listed yet</p><p className="mt-1 text-[11px] text-[#928A83]">Contact the seller to ask what they currently have.</p></div>
                )}
              </section>

              {/* SERVICES */}
              <section id="seller-services" className="scroll-mt-20 mt-10 border-t border-[#EAE6DF] pt-8">
                <div className="mb-5 flex items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF5A36]">More from this business</p><h2 className="mt-1 text-2xl font-black tracking-tight text-[#401B13]">Services</h2><p className="mt-1 text-[11px] text-[#8B847E]">{seller.serviceCount} {seller.serviceCount === 1 ? "service" : "services"} offered</p></div><Wrench size={23} className="text-[#FF5A36]" /></div>
                {seller.services.length > 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{seller.services.map((service) => <ServiceCard key={service.id} service={service} saved={Boolean(savedListingIds[savedKey("SERVICE", service.id)])} saving={savingListingKey === savedKey("SERVICE", service.id)} savedLoading={savedListingsLoading} onSave={(type, listingId) => { void toggleSaved(type, listingId); }} />)}</div> : <div className="rounded-[22px] border border-dashed border-[#DDD6CE] bg-[#FCFAF6] px-5 py-12 text-center"><Wrench size={28} className="mx-auto text-[#AAA29B]" /><p className="mt-3 text-sm font-extrabold text-[#625B55]">No services listed yet</p><p className="mt-1 text-[11px] text-[#928A83]">This seller has not published any services.</p></div>}
              </section>

              {/* REVIEWS */}
              <section id="seller-reviews" className="scroll-mt-20 mt-10 border-t border-[#EAE6DF] pt-8">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FF5A36]">Customer feedback</p><h2 className="mt-1 text-2xl font-black tracking-tight text-[#401B13]">Ratings &amp; reviews</h2><p className="mt-1 text-[11px] text-[#8B847E]">Feedback shared by ReMarket buyer accounts.</p></div>{seller.reviewCount > 0 && <div className="inline-flex items-center gap-2 self-start rounded-full bg-[#FFF7ED] px-3 py-2 sm:self-auto"><RatingStars rating={seller.averageRating} size={14} /><span className="text-xs font-black text-[#292522]">{seller.averageRating.toFixed(1)}</span><span className="text-[10px] text-[#8B847E]">({seller.reviewCount})</span></div>}</div>
                {reviewSuccess && <p role="status" className="mb-4 rounded-xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-3 text-[11px] font-semibold text-[#137A59]">{reviewSuccess}</p>}
                {reviewError && <p role="alert" className="mb-4 rounded-xl border border-[#F0C9BF] bg-[#FFF1ED] px-4 py-3 text-[11px] font-semibold text-[#9F2D18]">{reviewError}</p>}
                <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="space-y-4">
                    <div className="rounded-[20px] border border-[#EAE6DF] bg-[#FCFAF6] p-5">
                      <div className="text-center"><p className="text-4xl font-black text-[#401B13]">{seller.reviewCount > 0 ? seller.averageRating.toFixed(1) : "—"}</p><div className="mt-2"><RatingStars rating={seller.averageRating} size={18} /></div><p className="mt-2 text-[10px] text-[#8B847E]">{seller.reviewCount} {seller.reviewCount === 1 ? "review" : "reviews"}</p></div>
                      <div className="mt-6 space-y-2">{([5, 4, 3, 2, 1] as const).map((rating) => { const count = ratingBreakdown[rating]; const percent = seller.reviewCount > 0 ? Math.min(100, Math.round((count / seller.reviewCount) * 100)) : 0; return <div key={rating} className="flex items-center gap-2"><span className="w-3 text-right text-[10px] font-bold text-[#756B61]">{rating}</span><Star size={11} className="fill-[#FFB300] text-[#FFB300]" /><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E7E0D8]"><div className="h-full rounded-full bg-[#FF5A36]" style={{ width: `${percent}%` }} /></div><span className="w-6 text-right text-[9px] text-[#8B847E]">{count}</span></div>; })}</div>
                    </div>
                    <div className="rounded-[20px] border border-[#EAE6DF] bg-white p-5">
                      {currentUserLoading ? <div className="flex min-h-28 items-center justify-center gap-2 text-[11px] text-[#817970]"><LoaderCircle size={15} className="animate-spin text-[#FF5A36]" />Checking your account...</div> : currentUserRole === "BUYER" ? <form onSubmit={submitReview}><h3 className="text-sm font-black text-[#401B13]">Leave a review</h3><p className="mt-1 text-[10px] leading-5 text-[#8B847E]">Share your experience with this business.</p><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8C8580]">Your rating</p><div className="mt-2 flex flex-wrap items-center gap-2"><div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`Rate ${rating} out of 5`} aria-pressed={reviewRating === rating} onClick={() => setReviewRating(rating)} className="rounded-lg p-1 hover:bg-[#FFF0E9]"><Star size={22} className={rating <= reviewRating ? "fill-[#FFB300] text-[#FFB300]" : "text-[#D6CFC8]"} /></button>)}</div><span className="text-[10px] text-[#8B847E]"><RatingLabel rating={reviewRating} /></span></div><textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={4} maxLength={2000} placeholder="What was your experience with this business?" className="mt-4 w-full resize-none rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 py-3 text-[11px] leading-5 outline-none focus:border-[#FF9B86] focus:bg-white" /><div className="mt-1 text-right text-[9px] text-[#A29B94]">{reviewComment.length}/2000</div><button type="submit" disabled={reviewSubmitting} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[11px] font-bold text-white disabled:opacity-60">{reviewSubmitting ? <><LoaderCircle size={14} className="animate-spin" />Submitting...</> : "Submit review"}</button></form> : currentUserRole === null ? <div className="py-3 text-center"><Star size={22} className="mx-auto text-[#FF5A36]" /><h3 className="mt-3 text-sm font-black text-[#401B13]">Sign in to leave a review</h3><p className="mt-1 text-[10px] text-[#8B847E]">Buyer accounts can share their experience.</p><div className="mt-4 flex justify-center gap-2"><Link href={`/buyer/login?callbackUrl=${encodeURIComponent(`/seller/${id}#seller-reviews`)}`} className="rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[10px] font-bold text-white">Sign in</Link><Link href="/buyer/signup" className="rounded-xl border border-[#EAE6DF] px-4 py-2.5 text-[10px] font-bold text-[#756B61]">Create account</Link></div></div> : <div className="py-5 text-center"><Star size={22} className="mx-auto text-[#8B6960]" /><h3 className="mt-3 text-sm font-black text-[#401B13]">Buyer reviews only</h3><p className="mt-1 text-[10px] text-[#8B847E]">Only buyer accounts can submit reviews.</p></div>}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {reviewsLoading ? <div className="flex min-h-40 items-center justify-center rounded-[20px] border border-dashed border-[#DDD6CE] bg-[#FCFAF6]"><span className="flex items-center gap-2 text-[11px] text-[#817970]"><LoaderCircle size={15} className="animate-spin text-[#FF5A36]" />Loading reviews...</span></div> : reviews.length === 0 ? <div className="rounded-[20px] border border-dashed border-[#DDD6CE] bg-[#FCFAF6] px-5 py-12 text-center"><Star size={26} className="mx-auto text-[#B7AFA7]" /><p className="mt-3 text-sm font-bold text-[#625B55]">No reviews yet</p><p className="mt-1 text-[10px] text-[#928A83]">Be the first customer to rate this business.</p></div> : reviews.map((review) => {
                      const own = currentUserRole === "BUYER" && review.isOwnReview;
                      const editing = editingReviewId === review.id;
                      return <article key={review.id} className="rounded-[18px] border border-[#EAE6DF] bg-white p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFE0D6] text-[10px] font-black text-[#9F2D18]">{initials(review.user.name)}</div><div><p className="text-[11px] font-bold text-[#3D3834]">{review.user.name}</p><p className="text-[9px] text-[#A29B94]">{formatReviewDate(review.createdAt)}{review.updatedAt !== review.createdAt ? " · Edited" : ""}</p></div></div>
                        {!editing ? <><div className="mt-3"><RatingStars rating={review.rating} size={14} /></div>{review.comment && <p className="mt-3 whitespace-pre-wrap break-words text-[11px] leading-6 text-[#68615C]">{review.comment}</p>}</> : <div className="mt-3"><div className="flex items-center gap-2">{[1, 2, 3, 4, 5].map((rating) => <button key={rating} type="button" aria-label={`Change rating to ${rating}`} onClick={() => setEditingRating(rating)}><Star size={19} className={rating <= editingRating ? "fill-[#FFB300] text-[#FFB300]" : "text-[#D6CFC8]"} /></button>)}<span className="text-[10px] text-[#8B847E]"><RatingLabel rating={editingRating} /></span></div><textarea value={editingComment} onChange={(event) => setEditingComment(event.target.value)} maxLength={2000} rows={4} className="mt-3 w-full resize-none rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 py-3 text-[11px] leading-5 outline-none focus:border-[#FF9B86]" /><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={cancelEditReview} disabled={reviewUpdatingId === review.id} className="rounded-lg border border-[#EAE6DF] px-3 py-2 text-[10px] font-bold text-[#756B61]">Cancel</button><button type="button" onClick={() => void updateReview(review.id)} disabled={reviewUpdatingId === review.id} className="rounded-lg bg-[#FF5A36] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-60">{reviewUpdatingId === review.id ? "Saving..." : "Save changes"}</button></div></div>}
                      </div>{own && !editing && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => beginEditReview(review)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold text-[#746D67] hover:bg-[#FFF0E9]"><Pencil size={12} />Edit</button><button type="button" onClick={() => void deleteReview(review.id)} disabled={reviewDeletingId === review.id} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold text-[#9F2D18] hover:bg-[#FFF1ED] disabled:opacity-60">{reviewDeletingId === review.id ? <LoaderCircle size={12} className="animate-spin" /> : <Trash2 size={12} />}Delete</button></div>}</div></article>;
                    })}
                    {reviewsHasMore && !reviewsLoading && <div className="flex justify-center pt-2"><button type="button" onClick={() => void loadMoreReviews()} disabled={reviewsLoadingMore} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-5 py-2.5 text-[10px] font-bold text-[#9F2D18] hover:bg-[#FFF7ED] disabled:opacity-60">{reviewsLoadingMore ? <><LoaderCircle size={13} className="animate-spin" />Loading more...</> : "Load more reviews"}</button></div>}
                  </div>
                </div>
              </section>

              {/* FOOTER CTA */}
              <section className="mt-10 rounded-[24px] border border-[#F0C9BF] bg-[#FFF1ED] px-5 py-6 sm:flex sm:items-center sm:justify-between sm:gap-5 sm:px-7">
                <div><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#FF5A36]">Need something else?</p><h2 className="mt-1 text-lg font-black text-[#401B13]">Can&apos;t find what you need?</h2><p className="mt-1 text-[11px] leading-5 text-[#756B61]">Send a request and let ReMarket help you discover it nearby.</p></div>
                <Link href="/request" className="mt-4 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-[11px] font-extrabold text-white transition hover:bg-[#E94E2C] sm:mt-0">Make a request <ArrowRight size={14} /></Link>
              </section>
            </div>
          </>
        )}
        <footer className="w-full border-t border-[#EAE6DF] bg-[#FCFAF6] px-4 py-5 text-center text-[10px] font-medium text-[#9B9188] sm:px-6 xl:px-10 2xl:px-14">ReMarket · Find it nearby</footer>
      </main>
      <MobileBottomNav />
    </>
  );
}

export default function SellerPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  return <SellerPageContent key={id} id={id} />;
}
