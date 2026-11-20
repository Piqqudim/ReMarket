"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronLeft, ChevronRight,
  Heart, Image as ImageIcon, LoaderCircle, MapPin, Package,
  Share2, ShoppingCart, Store, X,
} from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import AddToCartButton from "@/components/cart/AddToCartButton";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type ProductImage = { id: string; url: string; publicId: string | null; sortOrder: number };
type CategoryParent = { id: string; name: string; imageUrl: string | null; iconKey: string | null };
type ProductCategory = {
  id?: string;
  name: string;
  parentId: string | null;
  parent: CategoryParent | null;
  imageUrl: string | null;
  iconKey: string | null;
  sortOrder: number | null;
} | null;
type ProductSeller = {
  id: string;
  name: string;
  ownerName: string | null;
  imageUrl: string | null;
  verification: string | null;
  verified: boolean;
  location: { area: string | null; street: string | null } | null;
};
type ProductDetail = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  availability: Availability;
  stockQuantity: number | null;
  imageUrl: string | null;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
  category: ProductCategory;
  images: ProductImage[];
  seller: ProductSeller;
};
type RelatedProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  availability: Availability;
  stockQuantity: number | null;
  imageUrl: string | null;
  images: ProductImage[];
  category: ProductCategory;
};
type CartFeedback = { productId: string; kind: "success" | "error"; message: string } | null;

const MAX_RELATED_PRODUCTS = 6;
const SAVED_ITEMS_CHANGED_EVENT = "remarket-saved-items-changed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cleanString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}
function nullableNumber(value: unknown): number | null {
  let parsed: number;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && value.trim()) parsed = Number(value.trim().replace(/,/g, ""));
  else return null;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function parseAvailability(value: unknown): Availability {
  return value === "AVAILABLE" || value === "UNAVAILABLE" || value === "ASK_SELLER" ? value : "ASK_SELLER";
}
function isProductUnavailable(product: { availability: Availability; stockQuantity: number | null }): boolean {
  return product.availability === "UNAVAILABLE" || product.stockQuantity === 0;
}
function canAddProductToCart(product: { price: number | null; availability: Availability; stockQuantity: number | null }): boolean {
  return product.availability === "AVAILABLE" && product.price !== null && Number.isSafeInteger(product.price) && product.price > 0 && product.stockQuantity !== 0 && (product.stockQuantity === null || (Number.isSafeInteger(product.stockQuantity) && product.stockQuantity > 0));
}
function getSellerProfileHref(businessId: string): string {
  return `/seller/${encodeURIComponent(businessId)}`;
}
function parseImages(value: unknown): ProductImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.url !== "string" || !item.url.trim()) return [];
    return [{ id: typeof item.id === "string" ? item.id : `image-${index}`, url: item.url.trim(), publicId: cleanString(item.publicId), sortOrder: typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder) ? item.sortOrder : index }];
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}
function parseCategory(value: unknown): ProductCategory {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  const rawParent = isRecord(value.parent) ? value.parent : null;
  const parent = rawParent && typeof rawParent.id === "string" && typeof rawParent.name === "string"
    ? {
        id: rawParent.id,
        name: rawParent.name,
        imageUrl: cleanString(rawParent.imageUrl),
        iconKey: cleanString(rawParent.iconKey),
      }
    : null;
  return {
    id: cleanString(value.id) ?? undefined,
    name: value.name,
    parentId: cleanString(value.parentId),
    parent,
    imageUrl: cleanString(value.imageUrl),
    iconKey: cleanString(value.iconKey),
    sortOrder: typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder) ? value.sortOrder : null,
  };
}
function parseProduct(value: unknown): ProductDetail | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const rawBusiness = isRecord(value.business) ? value.business : null;
  const rawSeller = isRecord(value.seller) ? value.seller : rawBusiness;
  if (!rawSeller) return null;
  const nestedBusiness = isRecord(rawSeller.business) ? rawSeller.business : null;
  const sellerId = cleanString(rawSeller.businessId) ?? cleanString(nestedBusiness?.id) ?? cleanString(rawBusiness?.id) ?? cleanString(rawSeller.id);
  if (!sellerId) return null;
  const rawLocation = isRecord(rawSeller.location) ? rawSeller.location : rawBusiness && isRecord(rawBusiness.location) ? rawBusiness.location : null;
  const verification = cleanString(rawSeller.verification) ?? cleanString(rawBusiness?.verification);
  const price = nullableNumber(value.price);
  const candidateOriginalPrice = nullableNumber(value.originalPrice);
  const rawKeywords = Array.isArray(value.keywords) ? value.keywords : [];
  return {
    id: value.id,
    name: value.name,
    description: cleanString(value.description),
    price,
    originalPrice: price !== null && candidateOriginalPrice !== null && candidateOriginalPrice > price ? candidateOriginalPrice : null,
    availability: parseAvailability(value.availability),
    stockQuantity: nullableNumber(value.stockQuantity),
    imageUrl: cleanString(value.imageUrl),
    keywords: rawKeywords.filter((item): item is string => typeof item === "string" && item.trim().length > 0),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    category: parseCategory(value.category),
    images: parseImages(value.images),
    seller: {
      id: sellerId,
      name: cleanString(rawSeller.name) ?? cleanString(rawBusiness?.name) ?? "Local seller",
      ownerName: cleanString(rawSeller.ownerName) ?? cleanString(rawBusiness?.ownerName),
      imageUrl: cleanString(rawSeller.imageUrl) ?? cleanString(rawBusiness?.imageUrl),
      verification,
      verified: rawSeller.verified === true || rawBusiness?.verification === "VERIFIED" || verification === "VERIFIED",
      location: rawLocation ? { area: cleanString(rawLocation.area), street: cleanString(rawLocation.street) } : null,
    },
  };
}
function parseRelatedProducts(value: unknown): RelatedProduct[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RelatedProduct[] => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    const price = nullableNumber(item.price);
    const candidateOriginalPrice = nullableNumber(item.originalPrice);
    return [{
      id: item.id,
      name: item.name,
      description: cleanString(item.description),
      price,
      originalPrice: price !== null && candidateOriginalPrice !== null && candidateOriginalPrice > price ? candidateOriginalPrice : null,
      availability: parseAvailability(item.availability),
      stockQuantity: nullableNumber(item.stockQuantity),
      imageUrl: cleanString(item.imageUrl),
      images: parseImages(item.images),
      category: parseCategory(item.category),
    }];
  });
}
function formatNaira(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`;
}
function formatProductPrice(price: number | null): string {
  return price !== null ? formatNaira(price) : "Price not listed";
}
function getDiscountPercentage(price: number | null, originalPrice: number | null): number | null {
  if (price === null || originalPrice === null || price <= 0 || originalPrice <= price) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}
function formatCategoryName(category: ProductCategory): string {
  if (!category) return "Not specified";
  return category.parent?.name ? `${category.parent.name} · ${category.name}` : category.name;
}
function categoryHref(category: ProductCategory): string {
  if (!category) return "/shop";
  const params = new URLSearchParams({ category: category.name });
  if (category.id) params.set("categoryId", category.id);
  return `/shop?${params.toString()}`;
}
function ProductPrice({ price, originalPrice, large = false }: { price: number | null; originalPrice: number | null; large?: boolean }) {
  const discount = getDiscountPercentage(price, originalPrice);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={large ? "text-[29px] font-black tracking-tight text-[#9F2D18] sm:text-[34px]" : "text-sm font-extrabold text-[#9F2D18]"}>{formatProductPrice(price)}</span>
        {discount !== null && originalPrice !== null && <span className="text-xs text-[#91877E] line-through">{formatNaira(originalPrice)}</span>}
      </div>
      {discount !== null && <span className="mt-1.5 inline-flex rounded-md bg-[#FFF0EA] px-2 py-1 text-[10px] font-bold text-[#C13D23]">Save {discount}%</span>}
    </div>
  );
}
function findSavedProduct(value: unknown, productId: string): { found: boolean; savedListingId: string | null } {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findSavedProduct(item, productId);
      if (result.found) return result;
    }
    return { found: false, savedListingId: null };
  }
  if (!isRecord(value)) return { found: false, savedListingId: null };
  const listing = isRecord(value.listing) ? value.listing : null;
  if (value.type === "PRODUCT" && listing?.id === productId) return { found: true, savedListingId: cleanString(value.id) };
  const nestedProduct = isRecord(value.product) ? value.product : null;
  const matches = value.productId === productId || value.listingId === productId || nestedProduct?.id === productId;
  if (matches) return { found: true, savedListingId: cleanString(value.savedListingId) ?? cleanString(value.savedId) ?? cleanString(value.id) };
  for (const collection of [value.items, value.savedListings, value.savedProducts, value.products, value.results, value.saved, value.data]) {
    if (Array.isArray(collection) || isRecord(collection)) {
      const result = findSavedProduct(collection, productId);
      if (result.found) return result;
    }
  }
  return { found: false, savedListingId: null };
}
function extractCreatedSavedId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["item", "savedListing", "savedItem", "saved"]) {
    if (isRecord(value[key])) {
      const id = cleanString(value[key].id);
      if (id) return id;
    }
  }
  return cleanString(value.savedListingId) ?? cleanString(value.savedId);
}
function getAvailability(product: { availability: Availability; stockQuantity: number | null }) {
  if (isProductUnavailable(product)) return { label: "Out of stock", description: "This product is currently unavailable.", className: "bg-[#FEE2E2] text-[#B42318]" };
  if (product.availability === "AVAILABLE") return {
    label: "Available",
    description: "This product is currently marked as available.",
    className: "bg-[#DCFCE7] text-[#166534]",
  };
  return { label: "Confirm availability", description: "Availability needs to be confirmed before online checkout.", className: "bg-[#FEF3C7] text-[#92400E]" };
}
function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

function ProductTile({ product, adding, feedback, onAddToCart }: {
  product: RelatedProduct;
  adding: boolean;
  feedback: CartFeedback;
  onAddToCart: (product: RelatedProduct) => void;
}) {
  const image = product.imageUrl ?? product.images[0]?.url ?? null;
  const unavailable = !canAddProductToCart(product);
  const href = `/product/${encodeURIComponent(product.id)}`;
  const isSuccess = feedback?.productId === product.id && feedback.kind === "success";
  const isError = feedback?.productId === product.id && feedback.kind === "error";

  return (
    <article className="group flex w-[188px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[#EAE6DF] bg-white transition hover:border-[#FFB39F] hover:shadow-[0_5px_18px_rgba(23,32,42,0.07)] sm:w-[210px]">
      <Link href={href} aria-label={`View ${product.name}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-[#FCFAF6] p-3">
          {image ? (
            <img src={image} alt={product.name} loading="lazy" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.035]" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#B6A99E]"><Package className="h-10 w-10" /></div>
          )}
          {isProductUnavailable(product) && (
            <span className="absolute left-2 top-2 rounded-full bg-[#17202A]/85 px-2 py-1 text-[9px] font-bold text-white">Out of stock</span>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-3">
        {product.category && <p className="mb-1 truncate text-[9px] font-semibold uppercase tracking-wide text-[#8A6252]">{formatCategoryName(product.category)}</p>}
        <Link href={href} className="line-clamp-2 min-h-10 text-xs font-semibold leading-5 text-[#292522] hover:text-[#9F2D18]">{product.name}</Link>
        <div className="mt-2"><ProductPrice price={product.price} originalPrice={product.originalPrice} /></div>
        <div className="mt-auto pt-3">
          <button
            type="button"
            disabled={unavailable || adding}
            onClick={() => onAddToCart(product)}
            aria-label={`Add ${product.name} to cart`}
            title={unavailable ? "This product is not available for online checkout" : "Add to cart"}
            className={`flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 disabled:cursor-not-allowed ${isSuccess ? "bg-[#DCFCE7] text-[#166534]" : unavailable ? "bg-[#EEEAE6] text-[#8A8077]" : "bg-[#FF5A36] text-white hover:bg-[#E94E2C]"}`}
          >
            {adding ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : isSuccess ? <Check className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
            {adding ? "Adding…" : isSuccess ? "Added to cart" : unavailable ? "Unavailable" : "Add to cart"}
          </button>
          {isError && <p role="alert" className="mt-2 text-[9px] leading-4 text-[#B42318]">{feedback?.message}</p>}
        </div>
      </div>
    </article>
  );
}

function ProductPageContent({ id }: { id: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const [saved, setSaved] = useState(false);
  const [savedListingId, setSavedListingId] = useState<string | null>(null);
  const [savedLoading, setSavedLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState("");
  const [savedFeedbackError, setSavedFeedbackError] = useState(false);
  const [addingRelatedProductId, setAddingRelatedProductId] = useState<string | null>(null);
  const [relatedCartFeedback, setRelatedCartFeedback] = useState<CartFeedback>(null);

  useEffect(() => {
    if (!id) {
      setProduct(null); setRelatedProducts([]); setError("Product not found."); setLoading(false);
      return;
    }
    const controller = new AbortController();
    async function loadProduct() {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(id)}`, {
          method: "GET", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to load this product.");
        if (!isRecord(payload)) throw new Error("Product information is not available.");
        const normalized = parseProduct(payload.product);
        if (!normalized) throw new Error("Product information is not available.");
        if (controller.signal.aborted) return;
        setProduct(normalized);
        setRelatedProducts(parseRelatedProducts(payload.relatedProducts).filter((item, index, all) => item.id !== normalized.id && all.findIndex((candidate) => candidate.id === item.id) === index).slice(0, MAX_RELATED_PRODUCTS));
        setActiveImageIndex(0); setImageViewerOpen(false); setShareFeedback(""); setRelatedCartFeedback(null);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setProduct(null); setRelatedProducts([]);
          setError(loadError instanceof Error ? loadError.message : "Unable to load this product.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadProduct();
    return () => controller.abort();
  }, [id]);

  const images = useMemo(() => {
    if (!product) return [];
    return Array.from(new Set([product.imageUrl, ...product.images.map((item) => item.url)].filter((image): image is string => typeof image === "string" && image.trim().length > 0)));
  }, [product]);
  function showPreviousImage() { if (images.length > 1) setActiveImageIndex((current) => current === 0 ? images.length - 1 : current - 1); }
  function showNextImage() { if (images.length > 1) setActiveImageIndex((current) => current === images.length - 1 ? 0 : current + 1); }

  useEffect(() => {
    if (!imageViewerOpen || images.length === 0) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setImageViewerOpen(false);
      if (event.key === "ArrowLeft") setActiveImageIndex((current) => current === 0 ? images.length - 1 : current - 1);
      if (event.key === "ArrowRight") setActiveImageIndex((current) => current === images.length - 1 ? 0 : current + 1);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [imageViewerOpen, images.length]);

  useEffect(() => {
    if (!id) {
      setSavedLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadSavedStatus(showLoading: boolean) {
      if (showLoading) setSavedLoading(true);
      try {
        const response = await fetch("/api/saved?type=PRODUCT", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          if (!controller.signal.aborted) {
            setSaved(false);
            setSavedListingId(null);
          }
          return;
        }
        if (!response.ok) return;

        const result = findSavedProduct(await response.json(), id);
        if (controller.signal.aborted) return;
        setSaved(result.found);
        setSavedListingId(result.savedListingId);
      } catch (loadError) {
        if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
          console.error("Saved product status error:", loadError);
        }
      } finally {
        if (showLoading && !controller.signal.aborted) setSavedLoading(false);
      }
    }

    const refreshSavedStatus = () => { void loadSavedStatus(false); };
    void loadSavedStatus(true);
    window.addEventListener(SAVED_ITEMS_CHANGED_EVENT, refreshSavedStatus);
    window.addEventListener("storage", refreshSavedStatus);

    return () => {
      controller.abort();
      window.removeEventListener(SAVED_ITEMS_CHANGED_EVENT, refreshSavedStatus);
      window.removeEventListener("storage", refreshSavedStatus);
    };
  }, [id]);

  async function addRelatedProductToCart(relatedProduct: RelatedProduct) {
    if (addingRelatedProductId || !canAddProductToCart(relatedProduct)) return;
    setAddingRelatedProductId(relatedProduct.id); setRelatedCartFeedback(null);
    try {
      const response = await fetch("/api/cart/items", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ productId: relatedProduct.id, quantity: 1 }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        router.push(`/buyer/login?callbackUrl=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
        return;
      }
      if (!response.ok) throw new Error(isRecord(payload) ? cleanString(payload.error) ?? cleanString(payload.message) ?? "Unable to add this product to your cart." : "Unable to add this product to your cart.");
      setRelatedCartFeedback({ productId: relatedProduct.id, kind: "success", message: "Added to cart" });
      window.dispatchEvent(new Event("remarket-cart-changed"));
    } catch (cartError) {
      setRelatedCartFeedback({ productId: relatedProduct.id, kind: "error", message: cartError instanceof Error ? cartError.message : "Unable to add this product to your cart." });
    } finally { setAddingRelatedProductId(null); }
  }

  async function toggleSavedProduct() {
    if (!product || saving) return;
    setSavedFeedback(""); setSavedFeedbackError(false); setSaving(true);
    try {
      if (saved) {
        let recordId = savedListingId;
        if (!recordId) {
          const savedResponse = await fetch("/api/saved?type=PRODUCT", { method: "GET", cache: "no-store", headers: { Accept: "application/json" } });
          if (savedResponse.status === 401 || savedResponse.status === 403) { router.push(`/buyer/login?callbackUrl=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
          if (!savedResponse.ok) throw new Error("Unable to retrieve your saved product.");
          const record = findSavedProduct(await savedResponse.json(), product.id);
          recordId = record.savedListingId;
          if (!record.found || !recordId) throw new Error("The saved product record could not be identified. Refresh and try again.");
        }
        const response = await fetch(`/api/saved/${encodeURIComponent(recordId)}`, { method: "DELETE", headers: { Accept: "application/json" } });
        const payload: unknown = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) { router.push(`/buyer/login?callbackUrl=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`); return; }
        if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to remove this product from Saved.");
        setSaved(false); setSavedListingId(null); setSavedFeedback("Product removed from your Saved products.");
      } else {
        const response = await fetch("/api/saved", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ type: "PRODUCT", listingId: product.id }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) {
          router.push(`/buyer/login?callbackUrl=${encodeURIComponent(`/product/${product.id}`)}`); return;
        }
        if (!response.ok) throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to save this product.");
        setSaved(true);
        let recordId = extractCreatedSavedId(payload);
        if (!recordId) {
          const refreshResponse = await fetch("/api/saved?type=PRODUCT", { method: "GET", cache: "no-store", headers: { Accept: "application/json" } });
          if (refreshResponse.ok) recordId = findSavedProduct(await refreshResponse.json(), product.id).savedListingId;
        }
        setSavedListingId(recordId); setSavedFeedback("Product added to your Saved products.");
      }
      window.dispatchEvent(new Event(SAVED_ITEMS_CHANGED_EVENT));
    } catch (saveError) {
      console.error("Product save action error:", saveError); setSavedFeedbackError(true);
      setSavedFeedback(saveError instanceof Error ? saveError.message : "Unable to update your Saved products.");
    } finally { setSaving(false); }
  }

  async function shareProduct() {
    if (!product || typeof window === "undefined") return;
    const url = window.location.href;
    setShareFeedback("");
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: `${product.name} | ReMarket`, text: `Discover ${product.name} on ReMarket.`, url }); setShareFeedback("Thanks for sharing this product."); return; }
      catch (shareError) { if (shareError instanceof Error && shareError.name === "AbortError") return; }
    }
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); setShareFeedback("Product link copied. You can now share it."); return; }
    } catch (copyError) { console.error("Product link copy error:", copyError); }
    setShareFeedback("Copy the product page address from your browser.");
  }

  if (loading) return <><SiteHeader searchMode="PRODUCTS" /><main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28"><div role="status" className="flex items-center gap-3 text-sm font-semibold text-[#756B61]"><LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />Loading product...</div></main><MobileBottomNav /></>;
  if (error || !product) return <><SiteHeader searchMode="PRODUCTS" /><main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28"><section className="w-full max-w-md rounded-2xl border border-[#F0C9BF] bg-[#FFF1ED] p-7 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#9F2D18]"><Package className="h-7 w-7" /></div><h1 className="mt-4 text-lg font-extrabold text-[#17202A]">Product not available</h1><p className="mt-2 text-sm leading-6 text-[#756B61]">{error || "This product may have been removed or is no longer available."}</p><Link href="/shop" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94E2C]"><ArrowLeft className="h-4 w-4" />Back to Products</Link></section></main><MobileBottomNav /></>;

  const availability = getAvailability(product);
  const listedDate = formatDate(product.createdAt);
  const area = product.seller.location?.area;
  const sellerProfileHref = getSellerProfileHref(product.seller.id);
  const categoryParts = product.category?.parent && product.category.parent.id !== product.category.id ? [product.category.parent, product.category] : product.category ? [product.category] : [];

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />
      <main id="main-content" className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10">
        <div className="mx-auto max-w-[1500px] px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pt-7">
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-[11px] text-[#756B61]">
            <Link href="/" className="hover:text-[#9F2D18]">Home</Link><ChevronRight className="h-3 w-3 shrink-0" /><Link href="/shop" className="hover:text-[#9F2D18]">Products</Link>
            {categoryParts.map((item, index) => {
              const isCurrent = index === categoryParts.length - 1;
              const href = isCurrent ? categoryHref(product.category) : item.id ? `/shop?categoryId=${encodeURIComponent(item.id)}&category=${encodeURIComponent(item.name)}` : "/shop";
              return <span key={`${item.id}-${item.name}`} className="flex min-w-0 items-center gap-2"><ChevronRight className="h-3 w-3 shrink-0" /><Link href={href} className={`truncate ${isCurrent ? "font-semibold text-[#9F2D18]" : "hover:text-[#9F2D18]"}`}>{item.name}</Link></span>;
            })}
            <span className="flex min-w-0 items-center gap-2" aria-current="page"><ChevronRight className="h-3 w-3 shrink-0" /><span className="max-w-[220px] truncate font-semibold text-[#514840]">{product.name}</span></span>
          </nav>

          <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] xl:gap-10">
            <section className="min-w-0">
              <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[78px_minmax(0,1fr)]">
                {images.length > 1 && <div className="order-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:order-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">{images.map((image, index) => <button key={`${product.id}-image-${index}`} type="button" onClick={() => setActiveImageIndex(index)} aria-label={`Show product image ${index + 1}`} aria-pressed={activeImageIndex === index} className={`h-[66px] w-[66px] shrink-0 overflow-hidden rounded-xl border-2 bg-white transition sm:h-[74px] sm:w-[74px] ${activeImageIndex === index ? "border-[#FF5A36]" : "border-[#EAE6DF] hover:border-[#FFB39F]"}`}><img src={image} alt="" loading="lazy" className="h-full w-full object-contain" /></button>)}</div>}
                <div className="order-1 min-w-0 lg:order-2"><div className="relative overflow-hidden rounded-[22px] border border-[#EAE6DF] bg-[#FCFAF6]"><div className="relative flex aspect-square max-h-[680px] items-center justify-center">
                  {images[activeImageIndex] ? <img src={images[activeImageIndex]} alt={product.name} fetchPriority="high" className="h-full w-full object-contain" /> : <div className="flex flex-col items-center gap-3 text-[#B6A99E]"><ImageIcon className="h-14 w-14" /><span className="text-xs font-semibold">No product image available</span></div>}
                  {images.length > 0 && <button type="button" onClick={() => setImageViewerOpen(true)} className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full border border-[#EAE6DF] bg-white/95 px-3 py-2 text-[10px] font-bold text-[#514840] shadow-sm hover:text-[#9F2D18]"><ImageIcon className="h-3.5 w-3.5" />View images</button>}
                  {images.length > 1 && <><button type="button" onClick={showPreviousImage} aria-label="Previous product image" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#EAE6DF] bg-white/95 text-[#514840] shadow-sm hover:text-[#9F2D18]"><ChevronLeft className="h-5 w-5" /></button><button type="button" onClick={showNextImage} aria-label="Next product image" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#EAE6DF] bg-white/95 text-[#514840] shadow-sm hover:text-[#9F2D18]"><ChevronRight className="h-5 w-5" /></button><span className="absolute left-3 top-3 rounded-full bg-[#17202A]/75 px-3 py-1.5 text-[10px] font-bold text-white">{activeImageIndex + 1} / {images.length}</span></>}
                </div></div><p className="mt-2 text-[10px] text-[#91877E]">Product images provided by the seller.</p></div>
              </div>
            </section>

            <section className="min-w-0 lg:sticky lg:top-[148px] lg:self-start"><div className="rounded-[22px] border border-[#EAE6DF] bg-white p-5 shadow-[0_5px_24px_rgba(23,32,42,0.045)] sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                {product.seller.verified && <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2.5 py-1.5 text-[10px] font-bold text-[#166534]"><BadgeCheck className="h-3.5 w-3.5" />Verified seller</span>}
              </div>
              <h1 className="mt-4 break-words text-[25px] font-extrabold leading-tight tracking-tight text-[#17202A] sm:text-[31px]">{product.name}</h1>
              <div className="mt-5"><ProductPrice price={product.price} originalPrice={product.originalPrice} large /></div>
              <div className="mt-5 flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${availability.className}`}>{availability.label}</span></div>
              <p className="mt-2 text-[11px] leading-5 text-[#756B61]">{availability.description}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void toggleSavedProduct()} disabled={saving || savedLoading} aria-pressed={saved} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${saved ? "border-[#FFB39F] bg-[#FFF1ED] text-[#9F2D18]" : "border-[#EAE6DF] bg-white text-[#514840] hover:border-[#FFB39F] hover:text-[#9F2D18]"}`}>
                  {saving || savedLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Heart className="h-4 w-4" fill={saved ? "currentColor" : "none"} />}{saved ? "Saved" : "Save product"}
                </button>
                <button type="button" onClick={() => void shareProduct()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 py-2.5 text-xs font-bold text-[#514840] hover:border-[#FFB39F] hover:text-[#9F2D18]"><Share2 className="h-4 w-4" />Share</button>
              </div>
              {savedFeedback && <div role={savedFeedbackError ? "alert" : "status"} className={`mt-3 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-[11px] leading-5 ${savedFeedbackError ? "border-red-200 bg-red-50 text-red-700" : "border-[#FFD9CE] bg-[#FFF1ED] text-[#9F2D18]"}`}><span>{savedFeedback}</span><button type="button" onClick={() => setSavedFeedback("")} aria-label="Dismiss message"><X className="h-4 w-4" /></button></div>}
              {shareFeedback && <p role="status" className="mt-3 text-[11px] text-[#137A59]">{shareFeedback}</p>}
              <div className="my-6 h-px bg-[#F0ECE7]" />
              <div><h2 className="mb-3 text-sm font-extrabold text-[#292522]">Purchase this product</h2><AddToCartButton productId={product.id} availability={product.availability} price={product.price} stockQuantity={product.stockQuantity} /></div>
              <div className="mt-5 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-3.5"><div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE6DF] bg-white text-[#9F2D18]">{product.seller.imageUrl ? <img src={product.seller.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Store className="h-5 w-5" />}</div>
                <div className="min-w-0 flex-1"><p className="text-[9px] font-medium uppercase tracking-wide text-[#91877E]">Sold by</p><div className="mt-0.5 flex min-w-0 items-center gap-1.5"><p className="truncate text-xs font-bold text-[#514840]">{product.seller.name}</p></div><p className="mt-1 flex items-center gap-1 text-[10px] text-[#91877E]"><MapPin className="h-3 w-3 shrink-0 text-[#FF5A36]" /><span className="truncate">{area ?? "Location not listed"}</span></p></div>
              </div><Link href={sellerProfileHref} className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#FFD1C5] bg-white px-4 py-2.5 text-xs font-bold text-[#9F2D18] hover:border-[#FF5A36] hover:bg-[#FFF1ED]">View Seller<ArrowRight className="h-4 w-4" /></Link></div>
            </div></section>
          </div>

          <section className="mt-8 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 rounded-[22px] border border-[#EAE6DF] bg-white p-5 sm:p-7"><div className="border-b border-[#F0ECE7] pb-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9F2D18]">Product information</p><h2 className="mt-2 text-xl font-extrabold tracking-tight text-[#401B13]">About this product</h2></div>
              <div className="mt-5"><h3 className="text-sm font-extrabold text-[#292522]">Description</h3>{product.description ? <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-7 text-[#6F675F]">{product.description}</p> : <p className="mt-3 text-xs leading-6 text-[#8B847E]">No product description has been provided yet.</p>}</div>
              {product.keywords.length > 0 && <div className="mt-6 border-t border-[#F0ECE7] pt-5"><h3 className="text-xs font-extrabold text-[#292522]">Product tags</h3><div className="mt-3 flex flex-wrap gap-2">{product.keywords.map((keyword, index) => <span key={`${product.id}-${keyword}-${index}`} className="rounded-full bg-[#F5F2ED] px-3 py-1.5 text-[10px] font-semibold text-[#6F675F]">{keyword}</span>)}</div></div>}
            </div>
            <aside className="h-fit rounded-[22px] border border-[#EAE6DF] bg-[#FCFAF6] p-5"><h2 className="text-sm font-extrabold text-[#292522]">Product details</h2><div className="mt-4 divide-y divide-[#EAE6DF]">
              <div className="flex items-start justify-between gap-3 py-3"><span className="text-[11px] text-[#756B61]">Stock quantity</span><span className="text-right text-[11px] font-semibold text-[#514840]">{product.stockQuantity === null ? "Not specified" : `${product.stockQuantity} units`}</span></div>
              {listedDate && <div className="flex items-start justify-between gap-3 py-3"><span className="text-[11px] text-[#756B61]">Date listed</span><span className="text-right text-[11px] font-semibold text-[#514840]">{listedDate}</span></div>}
            </div></aside>
          </section>

          {relatedProducts.length > 0 && <section className="mt-10"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9F2D18]">Continue shopping</p><h2 className="mt-1 text-xl font-extrabold tracking-tight text-[#401B13] sm:text-2xl">You may also like</h2><p className="mt-1 text-xs text-[#756B61]">Explore other products available on ReMarket.</p></div><Link href="/shop" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-[#9F2D18] hover:bg-[#FFF1ED]">Explore products<ArrowRight className="h-3.5 w-3.5" /></Link></div>
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Similar products">{relatedProducts.slice(0, MAX_RELATED_PRODUCTS).map((related) => <ProductTile key={related.id} product={related} adding={addingRelatedProductId === related.id} feedback={relatedCartFeedback} onAddToCart={addRelatedProductToCart} />)}</div>
          </section>}
          <footer className="mt-10 flex items-center justify-center gap-3 pb-4 text-[10px] text-[#9B9188]"><span className="h-px w-12 bg-[#EAE6DF]" /><span>ReMarket · Find it nearby</span><span className="h-px w-12 bg-[#EAE6DF]" /></footer>
        </div>
      </main>

      {imageViewerOpen && images.length > 0 && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#17120F]/95 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setImageViewerOpen(false); }}><button type="button" aria-label="Close image viewer" onClick={() => setImageViewerOpen(false)} className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20"><X className="h-5 w-5" /></button><div className="relative flex h-full w-full max-w-[1200px] items-center justify-center"><img src={images[activeImageIndex]} alt={product.name} className="max-h-[85dvh] max-w-full object-contain" />{images.length > 1 && <><button type="button" onClick={showPreviousImage} aria-label="Previous image" className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"><ChevronLeft className="h-6 w-6" /></button><button type="button" onClick={showNextImage} aria-label="Next image" className="absolute right-0 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"><ChevronRight className="h-6 w-6" /></button></>}<div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-xs font-bold text-white">{activeImageIndex + 1} / {images.length}</div></div></div>}
      <MobileBottomNav />
    </>
  );
}

export default function ProductPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] ?? "" : "";
  return <ProductPageContent key={id} id={id} />;
}
