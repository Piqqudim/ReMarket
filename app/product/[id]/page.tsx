"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Heart,
  Home,
  MapPin,
  Package,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Store,
  LoaderCircle,
  Image as ImageIcon,
} from "lucide-react";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type Verification = "VERIFIED" | "UNVERIFIED";

type ProductImage = {
  id: string;
  url: string;
  sortOrder: number;
};

type ProductCategory = {
  id?: string;
  name: string;
} | null;

type ProductBusiness = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  imageUrl: string | null;
  availability: Availability;
  verification: Verification;
  verified: boolean;
  location: {
    area: string | null;
    street: string | null;
  } | null;
  categories: Array<{ id: string; name: string }>;
};

type ProductDetail = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: Availability;
  imageUrl: string | null;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
  category: ProductCategory;
  images: ProductImage[];
  business: ProductBusiness;
};

type RelatedProduct = {
  id: string;
  name: string;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: Availability;
  imageUrl: string | null;
  images: ProductImage[];
  category: { name: string } | null;
};

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Requests", href: "/my-requests", icon: ClipboardList },
  { label: "Saved", href: "/saved", icon: Heart },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseAvailability(value: unknown): Availability {
  if (value === "AVAILABLE" || value === "UNAVAILABLE") return value;
  return "ASK_SELLER";
}

function parseImages(value: unknown): ProductImage[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.url !== "string" || !item.url.trim()) {
      return [];
    }

    return [{
      id: typeof item.id === "string" ? item.id : `image-${index}`,
      url: item.url,
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index,
    }];
  });
}

function parseProduct(value: unknown): ProductDetail | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }

  if (!isRecord(value.business) || typeof value.business.id !== "string" || typeof value.business.name !== "string") {
    return null;
  }

  const rawBusiness = value.business;
  const rawLocation = isRecord(rawBusiness.location) ? rawBusiness.location : null;
  const rawCategory = isRecord(value.category) && typeof value.category.name === "string"
    ? { id: typeof value.category.id === "string" ? value.category.id : undefined, name: value.category.name }
    : null;

  const categories = Array.isArray(rawBusiness.categories)
    ? rawBusiness.categories.flatMap((item) => {
        if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
        return [{ id: item.id, name: item.name }];
      })
    : [];

  const keywords = Array.isArray(value.keywords)
    ? value.keywords.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id: value.id,
    name: value.name,
    description: nullableString(value.description),
    price: nullableNumber(value.price),
    priceMin: nullableNumber(value.priceMin),
    priceMax: nullableNumber(value.priceMax),
    availability: parseAvailability(value.availability),
    imageUrl: nullableString(value.imageUrl),
    keywords,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    category: rawCategory,
    images: parseImages(value.images),
    business: {
      id: rawBusiness.id,
      name: rawBusiness.name,
      ownerName: nullableString(rawBusiness.ownerName),
      description: nullableString(rawBusiness.description),
      imageUrl: nullableString(rawBusiness.imageUrl),
      availability: parseAvailability(rawBusiness.availability),
      verification: rawBusiness.verification === "VERIFIED" ? "VERIFIED" : "UNVERIFIED",
      verified: rawBusiness.verified === true || rawBusiness.verification === "VERIFIED",
      location: rawLocation
        ? {
            area: nullableString(rawLocation.area),
            street: nullableString(rawLocation.street),
          }
        : null,
      categories,
    },
  };
}

function parseRelatedProducts(value: unknown): RelatedProduct[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    const category = isRecord(item.category) && typeof item.category.name === "string"
      ? { name: item.category.name }
      : null;

    return [{
      id: item.id,
      name: item.name,
      price: nullableNumber(item.price),
      priceMin: nullableNumber(item.priceMin),
      priceMax: nullableNumber(item.priceMax),
      availability: parseAvailability(item.availability),
      imageUrl: nullableString(item.imageUrl),
      images: parseImages(item.images),
      category,
    }];
  });
}

function formatNaira(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`;
}

function formatPrice(product: Pick<ProductDetail, "price" | "priceMin" | "priceMax">): string {
  if (product.price !== null) return formatNaira(product.price);
  if (product.priceMin !== null && product.priceMax !== null) {
    if (product.priceMin === product.priceMax) return formatNaira(product.priceMin);
    return `${formatNaira(product.priceMin)} – ${formatNaira(product.priceMax)}`;
  }
  if (product.priceMin !== null) return `From ${formatNaira(product.priceMin)}`;
  if (product.priceMax !== null) return `Up to ${formatNaira(product.priceMax)}`;
  return "Price unavailable";
}

function availabilityLabel(value: Availability): string {
  if (value === "AVAILABLE") return "Available";
  if (value === "UNAVAILABLE") return "Currently unavailable";
  return "Ask about availability";
}

function availabilityClass(value: Availability): string {
  if (value === "AVAILABLE") return "bg-[#DDF5EA] text-[#137A59]";
  if (value === "UNAVAILABLE") return "bg-[#FDE8E5] text-[#A33A2B]";
  return "bg-[#FFF0C7] text-[#8B6414]";
}

function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ProductTile({ product }: { product: RelatedProduct }) {
  const image = product.images[0]?.url ?? product.imageUrl;
  return (
    <Link
      href={`/product/${encodeURIComponent(product.id)}`}
      className="group overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:border-[#FFB39F] hover:shadow-[0_8px_24px_rgba(23,32,42,0.07)]"
    >
      <div className="aspect-square overflow-hidden bg-[#FCFAF6]">
        {image ? (
          <img src={image} alt={product.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full items-center justify-center text-[#B6A99E]"><Package size={30} /></div>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-10 text-[12px] font-bold text-[#292522]">{product.name}</p>
        {product.category && <p className="mt-1 truncate text-[10px] text-[#8B847E]">{product.category.name}</p>}
        <p className="mt-2 text-[13px] font-black text-[#9F2D18]">{formatPrice(product)}</p>
      </div>
    </Link>
  );
}

function ProductPageContent({ id }: { id: string }) {
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<RelatedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [shareFeedback, setShareFeedback] = useState("");

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    async function loadProduct() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/products/${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          const message = isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Unable to load this product.";
          throw new Error(message);
        }

        if (!isRecord(payload)) throw new Error("Product information is not available.");
        const normalizedProduct = parseProduct(payload.product);
        if (!normalizedProduct) throw new Error("Product information is not available.");

        if (controller.signal.aborted) return;
        setProduct(normalizedProduct);
        setRelatedProducts(parseRelatedProducts(payload.relatedProducts));
        setActiveImageIndex(0);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setProduct(null);
          setRelatedProducts([]);
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
    const fromGallery = product.images.map((item) => item.url);
    const candidates = fromGallery.length > 0 ? fromGallery : product.imageUrl ? [product.imageUrl] : [];
    return Array.from(new Set(candidates.filter(Boolean)));
  }, [product]);

  async function shareProduct() {
    if (!product || typeof window === "undefined") return;
    const url = window.location.href;
    const shareData = {
      title: product.name,
      text: `View ${product.name} on ReMarket.`,
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShareFeedback("Share menu opened.");
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback("Product link copied.");
    } catch {
      setShareFeedback("Copy this page link from your browser address bar.");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-0 md:p-3">
        <div className="mx-auto flex min-h-screen max-w-[1500px] items-center justify-center bg-[#FFFDFC] md:min-h-[calc(100vh-24px)] md:rounded-[22px] md:border md:border-[#FF5A36]">
          <div className="flex items-center gap-3 text-sm font-semibold text-[#756B61]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" /> Loading product...
          </div>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-0 md:p-3">
        <div className="mx-auto flex min-h-screen max-w-[1500px] items-center justify-center bg-[#FFFDFC] p-5 md:min-h-[calc(100vh-24px)] md:rounded-[22px] md:border md:border-[#FF5A36]">
          <div className="w-full max-w-md rounded-2xl border border-[#F0C9BF] bg-[#FFF1ED] p-7 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#9F2D18]"><Package size={22} /></div>
            <h1 className="mt-4 text-lg font-black text-[#17202A]">Product not available</h1>
            <p className="mt-2 text-sm leading-6 text-[#756B61]">{error || "This product may have been removed or is no longer available."}</p>
            <Link href="/shop" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-bold text-white">
              <ArrowLeft size={15} /> Back to Shop
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const business = product.business;
  const mainImage = images[activeImageIndex] ?? null;
  const locationLabel = [business.location?.street, business.location?.area].filter(Boolean).join(", ");
  const formattedCreatedAt = formatDate(product.createdAt);

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-0 md:p-3">
      <div className="mx-auto min-h-screen max-w-[1500px] overflow-hidden border-[#FF5A36] bg-[#FFFDFC] shadow-[0_8px_30px_rgba(159,45,24,0.06)] md:min-h-[calc(100vh-24px)] md:rounded-[22px] md:border">
        <header className="flex h-[66px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="ReMarket home">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF5A36] text-white"><Search size={19} strokeWidth={2.5} /></div>
            <div className="hidden sm:block">
              <div className="text-[17px] font-black tracking-tight text-[#17202A]">ReMarket</div>
              <div className="text-[10px] font-medium text-[#8C8580]">Find it nearby</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} className={`flex items-center gap-2 text-[13px] font-semibold transition ${item.href === "/shop" ? "text-[#9F2D18]" : "text-[#68615C] hover:text-[#FF5A36]"}`}><Icon size={17} />{item.label}</Link>;
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/request" className="rounded-xl bg-[#FF5A36] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#E94E2C] sm:px-4 sm:text-xs">Request something</Link>
          </div>
        </header>

        <div className="flex">
          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 md:block">
            <p className="mb-5 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#A29B94]">Browse</p>
            <nav className="space-y-1" aria-label="Sidebar navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${item.href === "/shop" ? "bg-[#FFE0D6] text-[#9F2D18]" : "text-[#68615C] hover:bg-white hover:text-[#FF5A36]"}`}><Icon size={17} />{item.label}</Link>;
              })}
            </nav>
            <div className="mt-8 rounded-2xl bg-[#FFF0D9] p-3">
              <p className="text-[11px] font-bold text-[#9F2D18]">Looking for something?</p>
              <p className="mt-1 text-[10px] leading-5 text-[#756B61]">Send a request and discover businesses that may have what you need.</p>
              <Link href="/request" className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#9F2D18]">Make a request <ArrowRight size={12} /></Link>
            </div>
          </aside>

          <section className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 md:pb-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <Link href="/shop" className="inline-flex items-center gap-2 text-[12px] font-bold text-[#746D67] transition hover:text-[#9F2D18]"><ArrowLeft size={15} /> Back to Shop</Link>
              <button type="button" onClick={() => void shareProduct()} className="inline-flex items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 py-2.5 text-[11px] font-bold text-[#5F5852] transition hover:border-[#FFB39F] hover:text-[#9F2D18]">
                <Share2 size={15} /> Share product
              </button>
            </div>
            {shareFeedback && <p role="status" className="mb-3 text-right text-[10px] font-semibold text-[#137A59]">{shareFeedback}</p>}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
              <div className="min-w-0">
                <div className="overflow-hidden rounded-[20px] border border-[#EAE6DF] bg-white">
                  <div className="flex aspect-square max-h-[650px] items-center justify-center bg-[#FCFAF6]">
                    {mainImage ? <img src={mainImage} alt={product.name} className="h-full w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-[#B6A99E]"><ImageIcon size={42} /><span className="text-xs font-semibold">No product image</span></div>}
                  </div>
                </div>
                {images.length > 1 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Product images">
                    {images.map((image, index) => (
                      <button key={`${product.id}-image-${index}`} type="button" onClick={() => setActiveImageIndex(index)} aria-label={`Show product image ${index + 1}`} aria-pressed={activeImageIndex === index} className={`h-[76px] w-[76px] shrink-0 overflow-hidden rounded-xl border-2 bg-white ${activeImageIndex === index ? "border-[#FF5A36]" : "border-[#EAE6DF]"}`}>
                        <img src={image} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-w-0 rounded-[20px] border border-[#EAE6DF] bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  {product.category && <span className="rounded-full bg-[#FFF0E9] px-3 py-1.5 text-[10px] font-bold text-[#9F2D18]">{product.category.name}</span>}
                  <span className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${availabilityClass(product.availability)}`}>{availabilityLabel(product.availability)}</span>
                </div>
                <h1 className="mt-4 break-words text-[25px] font-black leading-tight tracking-tight text-[#17202A] sm:text-[30px]">{product.name}</h1>
                <p className="mt-4 text-[25px] font-black tracking-tight text-[#9F2D18] sm:text-[29px]">{formatPrice(product)}</p>
                {formattedCreatedAt && <p className="mt-2 text-[10px] text-[#A29B94]">Listed {formattedCreatedAt}</p>}

                <div className="mt-6 border-t border-[#F0ECE6] pt-5">
                  <h2 className="text-[13px] font-black text-[#292522]">Product details</h2>
                  {product.description ? (
                    <p className="mt-3 whitespace-pre-wrap break-words text-[12px] leading-6 text-[#6F675F]">{product.description}</p>
                  ) : (
                    <p className="mt-3 text-[12px] leading-6 text-[#8B847E]">The seller has not added a product description yet.</p>
                  )}
                </div>

                {product.keywords.length > 0 && (
                  <div className="mt-5 border-t border-[#F0ECE6] pt-5">
                    <h2 className="text-[12px] font-black text-[#292522]">Related search terms</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.keywords.map((keyword) => <span key={`${product.id}-${keyword}`} className="rounded-full bg-[#F5F2ED] px-3 py-1.5 text-[10px] font-semibold text-[#6F675F]">{keyword}</span>)}
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-4">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck size={17} className="mt-0.5 shrink-0 text-[#9F2D18]" />
                    <div>
                      <p className="text-[11px] font-bold text-[#5E4730]">Buying through ReMarket</p>
                      <p className="mt-1 text-[10px] leading-5 text-[#796B5C]">In-app product ordering and checkout are not available yet. This page provides listing information while the marketplace purchase flow is being built.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <section className="mt-6 rounded-[20px] border border-[#EAE6DF] bg-white p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#EAE6DF] bg-[#FFF0E9] text-[#9F2D18]">
                    {business.imageUrl ? <img src={business.imageUrl} alt={business.name} className="h-full w-full object-cover" /> : <Store size={23} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-[14px] font-black text-[#17202A]">{business.name}</h2>
                      {business.verified && <span className="inline-flex items-center gap-1 rounded-full bg-[#DDF5EA] px-2 py-1 text-[9px] font-bold text-[#137A59]"><CheckCircle2 size={11} /> Verified</span>}
                    </div>
                    {business.ownerName && <p className="mt-1 truncate text-[10px] text-[#8B847E]">{business.ownerName}</p>}
                    {locationLabel && <p className="mt-1 flex items-center gap-1 text-[10px] text-[#8B847E]"><MapPin size={11} className="shrink-0 text-[#FF5A36]" /><span className="truncate">{locationLabel}</span></p>}
                  </div>
                </div>
                <Link href={`/seller/${encodeURIComponent(business.id)}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-[11px] font-bold text-white transition hover:bg-[#E94E2C]">
                  View business profile <ArrowRight size={14} />
                </Link>
              </div>
              {business.description && <p className="mt-4 max-w-3xl text-[11px] leading-5 text-[#756B61]">{business.description}</p>}
              {business.categories.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{business.categories.map((category) => <span key={category.id} className="rounded-full bg-[#FCFAF6] px-2.5 py-1 text-[9px] font-semibold text-[#6F675F]">{category.name}</span>)}</div>}
            </section>

            {relatedProducts.length > 0 && (
              <section className="mt-8">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-black text-[#17202A]">More from this business</h2>
                    <p className="mt-1 text-[11px] text-[#8B847E]">Explore other active products listed by {business.name}.</p>
                  </div>
                  <Link href={`/seller/${encodeURIComponent(business.id)}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#9F2D18]">View all products <ArrowRight size={13} /></Link>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {relatedProducts.map((related) => <ProductTile key={related.id} product={related} />)}
                </div>
              </section>
            )}
          </section>
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#EAE6DF] bg-white/95 px-3 py-2 backdrop-blur md:hidden" aria-label="Mobile navigation">
          <div className="mx-auto flex max-w-md items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[9px] font-bold transition ${item.href === "/shop" ? "text-[#9F2D18]" : "text-[#8A837D] hover:text-[#FF5A36]"}`}><Icon size={18} />{item.label}</Link>;
            })}
          </div>
        </nav>
      </div>
    </main>
  );
}

export default function ProductPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  return <ProductPageContent key={id} id={id} />;
}
