"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  MapPin,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Star,
} from "lucide-react";

import AddToCartButton from "@/components/cart/AddToCartButton";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import SiteHeader from "@/components/layout/SiteHeader";

type ProductAvailability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";

type ProductImage = { id: string; url: string; sortOrder: number };
type ProductCategory = { id: string; name: string; parent?: { id: string; name: string } | null } | null;
type SocialLink = { id: string; platform: string; handle: string };
type RelatedProduct = {
  id: string;
  name: string;
  price: number | null;
  originalPrice: number | null;
  imageUrl: string | null;
  availability: ProductAvailability;
  stockQuantity: number | null;
  category: ProductCategory;
};
type ProductDetails = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  stockQuantity: number | null;
  availability: ProductAvailability;
  imageUrl: string | null;
  rating: number | null;
  reviewCount: number;
  hasShippingMeasurements: boolean;
  isPurchaseReady: boolean;
  category: ProductCategory;
  images: ProductImage[];
  seller: {
    id: string;
    name: string;
    ownerName: string | null;
    description: string | null;
    imageUrl: string | null;
    verification: string;
    verified: boolean;
    showContactInfo: boolean;
    location: { area: string; street?: string | null; address?: string | null } | null;
    socialLinks: SocialLink[];
  };
};

type ProductResponse = { product?: ProductDetails | null; relatedProducts?: RelatedProduct[]; error?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatNaira(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Price not listed";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function safeProduct(value: unknown): ProductDetails | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const seller = isRecord(value.seller) ? value.seller : null;
  if (!seller || typeof seller.id !== "string" || typeof seller.name !== "string") return null;
  const availability = value.availability === "AVAILABLE" || value.availability === "UNAVAILABLE"
    ? value.availability
    : "ASK_SELLER";
  const images = Array.isArray(value.images)
    ? value.images.flatMap((item, index) => {
        if (!isRecord(item) || typeof item.url !== "string") return [];
        return [{ id: typeof item.id === "string" ? item.id : `image-${index}`, url: item.url, sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index }];
      })
    : [];
  const location = isRecord(seller.location) && typeof seller.location.area === "string"
    ? {
        area: seller.location.area,
        street: typeof seller.location.street === "string" ? seller.location.street : null,
        address: typeof seller.location.address === "string" ? seller.location.address : null,
      }
    : null;
  const socialLinks = Array.isArray(seller.socialLinks)
    ? seller.socialLinks.flatMap((item, index) => {
        if (!isRecord(item) || typeof item.platform !== "string" || typeof item.handle !== "string") return [];
        return [{ id: typeof item.id === "string" ? item.id : `social-${index}`, platform: item.platform, handle: item.handle }];
      })
    : [];
  const categoryRaw = isRecord(value.category) ? value.category : null;
  const category: ProductCategory = categoryRaw && typeof categoryRaw.id === "string" && typeof categoryRaw.name === "string"
    ? { id: categoryRaw.id, name: categoryRaw.name, parent: isRecord(categoryRaw.parent) && typeof categoryRaw.parent.id === "string" && typeof categoryRaw.parent.name === "string" ? { id: categoryRaw.parent.id, name: categoryRaw.parent.name } : null }
    : null;
  const price = typeof value.price === "number" && Number.isFinite(value.price) ? value.price : null;
  const originalPrice = typeof value.originalPrice === "number" && Number.isFinite(value.originalPrice) ? value.originalPrice : null;
  const rating = typeof value.rating === "number" && Number.isFinite(value.rating) ? value.rating : null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : null,
    price,
    originalPrice,
    stockQuantity: typeof value.stockQuantity === "number" && Number.isSafeInteger(value.stockQuantity) ? value.stockQuantity : null,
    availability,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
    rating,
    reviewCount: typeof value.reviewCount === "number" && Number.isSafeInteger(value.reviewCount) ? value.reviewCount : 0,
    hasShippingMeasurements: value.hasShippingMeasurements === true,
    isPurchaseReady: value.isPurchaseReady === true,
    category,
    images,
    seller: {
      id: seller.id,
      name: seller.name,
      ownerName: typeof seller.ownerName === "string" ? seller.ownerName : null,
      description: typeof seller.description === "string" ? seller.description : null,
      imageUrl: typeof seller.imageUrl === "string" ? seller.imageUrl : null,
      verification: typeof seller.verification === "string" ? seller.verification : "UNVERIFIED",
      verified: seller.verified === true,
      showContactInfo: seller.showContactInfo === true,
      location,
      socialLinks,
    },
  };
}

function safeRelated(value: unknown): RelatedProduct[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    const categoryRaw = isRecord(item.category) ? item.category : null;
    const category: ProductCategory = categoryRaw && typeof categoryRaw.id === "string" && typeof categoryRaw.name === "string"
      ? { id: categoryRaw.id, name: categoryRaw.name }
      : null;
    return [{
      id: item.id,
      name: item.name,
      price: typeof item.price === "number" ? item.price : null,
      originalPrice: typeof item.originalPrice === "number" ? item.originalPrice : null,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
      availability: item.availability === "AVAILABLE" || item.availability === "UNAVAILABLE" ? item.availability : "ASK_SELLER",
      stockQuantity: typeof item.stockQuantity === "number" ? item.stockQuantity : null,
      category,
    }];
  });
}

function contactHref(link: SocialLink): string | null {
  const value = link.handle.trim();
  if (!value) return null;
  if (link.platform === "WHATSAPP") {
    const digits = value.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  }
  if (link.platform === "PHONE") return `tel:${value}`;
  if (/^https:\/\//i.test(value)) return value;
  return null;
}

export default function ProductDetailsClient({ productId }: { productId: string }) {
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [related, setRelated] = useState<RelatedProduct[]>([]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : "We could not load this product.";
          throw new Error(message);
        }
        if (!isRecord(payload)) throw new Error("The server returned an invalid product response.");
        const parsed = safeProduct(payload.product);
        if (!parsed) throw new Error("This product is unavailable or its details are incomplete.");
        if (controller.signal.aborted) return;
        setProduct(parsed);
        setRelated(safeRelated(payload.relatedProducts));
        setSelectedImage(0);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load this product.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [productId, retryVersion]);

  const images = useMemo(() => {
    if (!product) return [];
    const ordered = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder);
    if (ordered.length) return ordered;
    return product.imageUrl ? [{ id: "cover", url: product.imageUrl, sortOrder: 0 }] : [];
  }, [product]);

  const selected = images[selectedImage] ?? images[0];
  const discount = product?.price !== null && product?.price !== undefined && product?.originalPrice !== null && product?.originalPrice !== undefined && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;

  return (
    <div className="rm-storefront min-h-dvh bg-[var(--rm-page)] pb-24 lg:pb-10">
      <SiteHeader searchMode="PRODUCTS" />
      <main id="main-content" className="rm-container py-5 sm:py-8">
        <Link href="/shop" className="rm-text-link mb-5 inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" /> Back to products</Link>

        {loading ? (
          <div role="status" aria-busy="true" className="rm-panel flex min-h-[420px] items-center justify-center gap-3 text-sm text-[var(--rm-muted)]">
            <RefreshCw className="h-5 w-5 animate-spin text-[var(--rm-coral)]" /> Loading product details…
          </div>
        ) : error || !product ? (
          <section className="rm-panel mx-auto flex min-h-[360px] max-w-2xl flex-col items-center justify-center px-6 py-12 text-center" role="alert">
            <PackageCheck className="h-10 w-10 text-[var(--rm-coral)]" />
            <h1 className="mt-4 text-xl font-extrabold text-[var(--rm-ink)]">Product unavailable</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-[var(--rm-muted)]">{error || "This product could not be found."}</p>
            <button type="button" onClick={() => setRetryVersion((version) => version + 1)} className="rm-button rm-button-primary mt-5">Try again</button>
            <Link href="/shop" className="rm-text-link mt-4">Browse products</Link>
          </section>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-10">
              <section className="min-w-0" aria-label="Product images">
                <div className="overflow-hidden rounded-3xl border border-[var(--rm-border)] bg-white">
                  <div className="relative flex aspect-square items-center justify-center bg-[var(--rm-surface-muted)] p-0">
                    {selected ? <img src={selected.url} alt={product.name} className="absolute inset-0 block h-full w-full min-h-0 min-w-0 object-contain object-center" /> : <div className="flex flex-col items-center gap-2 text-[var(--rm-muted)]"><ImageIcon className="h-12 w-12" /><span className="text-xs">No product image</span></div>}
                    {images.length > 1 && <>
                      <button type="button" aria-label="Previous product image" onClick={() => setSelectedImage((current) => (current - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-[var(--rm-border)] bg-white/95 text-[var(--rm-ink)] shadow-sm"><ChevronLeft className="h-5 w-5" /></button>
                      <button type="button" aria-label="Next product image" onClick={() => setSelectedImage((current) => (current + 1) % images.length)} className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-[var(--rm-border)] bg-white/95 text-[var(--rm-ink)] shadow-sm"><ChevronRight className="h-5 w-5" /></button>
                    </>}
                  </div>
                  {images.length > 1 && <div className="flex gap-2 overflow-x-auto border-t border-[var(--rm-border)] bg-white p-3" aria-label="Choose product image">
                    {images.map((image, index) => <button key={image.id} type="button" onClick={() => setSelectedImage(index)} aria-label={`View product image ${index + 1}`} aria-pressed={selectedImage === index} className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-[var(--rm-surface-muted)] p-0 ${selectedImage === index ? "border-[var(--rm-coral)]" : "border-transparent"}`}><img src={image.url} alt="" className="block h-full w-full object-contain object-center" /></button>)}
                  </div>}
                </div>
              </section>

              <section className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {product.category && <span className="rounded-full bg-[var(--rm-coral-soft)] px-3 py-1.5 text-[11px] font-bold text-[var(--rm-coral-dark)]">{product.category.parent?.name ? `${product.category.parent.name} · ` : ""}{product.category.name}</span>}
                  {product.seller.verified && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--rm-green-bg)] px-3 py-1.5 text-[11px] font-bold text-[var(--rm-green)]"><BadgeCheck className="h-3.5 w-3.5" /> Verified business</span>}
                </div>
                <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-[var(--rm-ink)] sm:text-3xl">{product.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--rm-muted)]">
                  {product.rating !== null && product.reviewCount > 0 ? <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--rm-ink)]"><Star className="h-4 w-4 fill-current text-amber-500" />{product.rating.toFixed(1)} <span className="font-normal text-[var(--rm-muted)]">({product.reviewCount} reviews)</span></span> : <span>Not yet reviewed</span>}
                  {product.stockQuantity === 0 ? <span className="font-semibold text-[var(--rm-red)]">Out of stock</span> : product.stockQuantity === null ? <span>Stock not tracked</span> : <span>{product.stockQuantity} available</span>}
                </div>

                <div className="mt-6 rounded-2xl border border-[var(--rm-border)] bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <p className="text-2xl font-black tracking-tight text-[var(--rm-coral-dark)] sm:text-3xl">{formatNaira(product.price)}</p>
                    {discount !== null && product.originalPrice !== null && <><span className="text-sm text-[var(--rm-muted)] line-through">{formatNaira(product.originalPrice)}</span><span className="rounded-md bg-[var(--rm-coral-soft)] px-2 py-1 text-[10px] font-extrabold text-[var(--rm-coral-dark)]">{discount}% OFF</span></>}
                  </div>
                  <p className="mt-2 text-xs text-[var(--rm-muted)]">The current selling price is used at checkout. Original price is shown only as a discount reference.</p>
                  <div className="mt-5">
                    {product.isPurchaseReady ? <AddToCartButton productId={product.id} availability={product.availability} price={product.price} stockQuantity={product.stockQuantity} /> : <div className="rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-3 text-xs leading-5 text-[var(--rm-muted)]">
                      {product.availability !== "AVAILABLE" ? "This product is not currently marked as available for purchase." : product.stockQuantity === 0 ? "This product is currently out of stock." : !product.price || product.price <= 0 ? "A fixed selling price has not been provided, so checkout is unavailable." : "The seller has not completed the package measurements required for delivery checkout."}
                    </div>}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-[var(--rm-border)] bg-white p-4 sm:p-5">
                  <h2 className="text-sm font-extrabold text-[var(--rm-ink)]">Product description</h2>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--rm-muted)]">{product.description?.trim() || "The seller has not added a description for this product yet."}</p>
                </div>

                <div className="mt-5 rounded-2xl border border-[var(--rm-border)] bg-white p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--rm-surface-muted)]">{product.seller.imageUrl ? <img src={product.seller.imageUrl} alt="" className="h-full w-full object-cover" /> : <ShieldCheck className="h-6 w-6 text-[var(--rm-coral)]" />}</div>
                      <div className="min-w-0"><Link href={`/seller/${encodeURIComponent(product.seller.id)}`} className="break-words text-sm font-extrabold text-[var(--rm-ink)] hover:text-[var(--rm-coral-dark)]">{product.seller.name}</Link><p className="mt-1 text-xs text-[var(--rm-muted)]">{product.seller.verified ? "Verified business" : "ReMarket business"}</p></div>
                    </div>
                    <Link href={`/seller/${encodeURIComponent(product.seller.id)}`} className="rm-button rm-button-secondary shrink-0">View store</Link>
                  </div>
                  {product.seller.location?.area && <p className="mt-4 flex items-center gap-2 text-xs text-[var(--rm-muted)]"><MapPin className="h-4 w-4 shrink-0 text-[var(--rm-coral)]" />{product.seller.location.area}{product.seller.showContactInfo && product.seller.location.street ? ` · ${product.seller.location.street}` : ""}</p>}
                  {product.seller.showContactInfo && product.seller.socialLinks.map((link) => {
                    const href = contactHref(link);
                    return href ? <a key={link.id} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined} className="mt-3 mr-2 inline-flex rounded-lg border border-[var(--rm-border)] px-3 py-2 text-xs font-bold text-[var(--rm-coral-dark)] hover:bg-[var(--rm-coral-soft)]">{link.platform === "WHATSAPP" ? "WhatsApp" : link.platform === "PHONE" ? "Call seller" : link.platform}</a> : null;
                  })}
                </div>
              </section>
            </div>

            {related.length > 0 && <section className="mt-12" aria-labelledby="related-products-heading">
              <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--rm-coral)]">Keep exploring</p><h2 id="related-products-heading" className="mt-1 text-xl font-extrabold text-[var(--rm-ink)]">Related products</h2></div><Link href="/shop" className="rm-text-link">View all products</Link></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {related.map((item) => <Link key={item.id} href={`/product/${encodeURIComponent(item.id)}`} className="group overflow-hidden rounded-2xl border border-[var(--rm-border)] bg-white transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="rm-product-media">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="rm-product-image" /> : <div className="grid h-full w-full place-items-center text-[var(--rm-muted)]"><ImageIcon className="h-8 w-8" /></div>}</div>
                  <div className="p-3"><p className="line-clamp-2 min-h-10 text-xs font-bold text-[var(--rm-ink)] group-hover:text-[var(--rm-coral-dark)]">{item.name}</p><p className="mt-2 text-sm font-extrabold text-[var(--rm-coral-dark)]">{formatNaira(item.price)}</p></div>
                </Link>)}
              </div>
            </section>}
          </>
        )}
      </main>
      <MobileBottomNav />
    </div>
  );
}
