"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BadgeCheck, Check, ChevronRight, MapPin, Package,
  Search, Share2, ShoppingCart, Star,
} from "lucide-react";
import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import HomeCartSidebar from "@/components/cart/HomeCartSideBar";
import {
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type RecentProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  rating: number | null;
  reviewCount: number;
  stockQuantity: number | null;
  availability: Availability;
  imageUrl: string | null;
  category: string | null;
  area: string | null;
  verified: boolean;
};
type JsonResult = Record<string, unknown> | null;
type FeedResult = { data: JsonResult; failed: boolean };
type CartFeedback = { productId: string; kind: "success" | "error"; message: string } | null;
type HomeCategory = ReMarketCategory & {
  parentId: string | null;
  imageUrl: string | null;
  sortOrder: number;
};
type HomeCategoryNode = HomeCategory & { children: HomeCategoryNode[] };

const PRODUCT_FEED_URL = "/api/recent-products?page=1&pageSize=12";
const MAX_HOME_PRODUCTS = 12;
const MAX_HOME_CATEGORIES = 10;
const CART_CHANGED_EVENT = "remarket-cart-changed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function parseAvailability(value: unknown): Availability {
  return value === "AVAILABLE" || value === "UNAVAILABLE" || value === "ASK_SELLER"
    ? value
    : "ASK_SELLER";
}

function parseCategoryName(value: unknown): string | null {
  if (typeof value === "string") return cleanString(value);
  return isRecord(value) ? cleanString(value.name) : null;
}

function canAddProductToCart(
  product: Pick<RecentProduct, "availability" | "price" | "stockQuantity">,
): boolean {
  return product.availability === "AVAILABLE" && product.price !== null &&
    product.price > 0 && product.stockQuantity !== 0;
}

function parseRecentProduct(value: unknown): RecentProduct | null {
  if (!isRecord(value)) return null;
  const id = cleanString(value.id);
  const name = cleanString(value.name);
  if (!id || !name) return null;

  const price = parseOptionalNumber(value.price);
  const candidateOriginalPrice = parseOptionalNumber(value.originalPrice);
  const originalPrice = price !== null && candidateOriginalPrice !== null && candidateOriginalPrice > price
    ? candidateOriginalPrice
    : null;
  const seller = isRecord(value.seller) ? value.seller : isRecord(value.business) ? value.business : null;
  const location = seller && isRecord(seller.location) ? seller.location : null;
  const rawRating = parseOptionalNumber(value.rating) ?? parseOptionalNumber(value.averageRating);
  const rating = rawRating !== null && rawRating <= 5 ? rawRating : null;
  const rawReviewCount = parseOptionalNumber(value.reviewCount) ?? parseOptionalNumber(value.reviewsCount);

  return {
    id,
    name,
    description: cleanString(value.description),
    price,
    originalPrice,
    rating,
    reviewCount: rawReviewCount === null ? 0 : Math.floor(rawReviewCount),
    stockQuantity: parseOptionalNumber(value.stockQuantity),
    availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl),
    category: parseCategoryName(value.category),
    area: location ? cleanString(location.area) : null,
    verified: seller?.verified === true || seller?.verification === "VERIFIED",
  };
}

function parseHomeCategoryRecords(value: unknown): Array<{
  id: string;
  name: string;
  iconKey: string | null;
  isActive: boolean;
  sortOrder: number;
  parentId: string | null;
  imageUrl: string | null;
}> {
  const records: Array<{
    id: string;
    name: string;
    iconKey: string | null;
    isActive: boolean;
    sortOrder: number;
    parentId: string | null;
    imageUrl: string | null;
  }> = [];

  function visit(items: unknown[], inheritedParentId: string | null = null) {
    for (const item of items) {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") continue;
      const id = item.id.trim();
      const name = item.name.trim();
      if (!id || !name) continue;

      const parentId = inheritedParentId ?? cleanString(item.parentId);
      records.push({
        id,
        name,
        iconKey: cleanString(item.iconKey),
        isActive: typeof item.isActive === "boolean" ? item.isActive : true,
        sortOrder: typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder) ? item.sortOrder : 0,
        parentId,
        imageUrl: cleanString(item.imageUrl),
      });

      if (Array.isArray(item.children)) visit(item.children, id);
    }
  }

  if (Array.isArray(value)) visit(value);
  return records;
}

function sortHomeCategoryNodes(nodes: HomeCategoryNode[]) {
  nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  for (const node of nodes) sortHomeCategoryNodes(node.children);
}

function parseHomeCategories(value: unknown): HomeCategoryNode[] {
  const records = parseHomeCategoryRecords(value);
  const apiCategories: ApiCategory[] = records.map((item) => ({
    id: item.id,
    name: item.name,
    iconKey: item.iconKey,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
  }));
  const merged = mergeCategories(apiCategories);
  const mergedById = new Map(merged.map((category) => [category.id, category]));
  const nodes = new Map<string, HomeCategoryNode>();

  for (const item of records) {
    const display = mergedById.get(item.id);
    if (!display) continue;
    nodes.set(item.id, {
      ...display,
      parentId: item.parentId,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
      children: [],
    });
  }

  const roots: HomeCategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  sortHomeCategoryNodes(roots);
  return roots;
}

async function fetchHomepageProducts(signal: AbortSignal): Promise<FeedResult> {
  try {
    const response = await fetch(PRODUCT_FEED_URL, { cache: "no-store", signal });
    if (response.status === 404) return { data: null, failed: false };
    if (!response.ok) {
      console.error(`Homepage products returned HTTP ${response.status}.`);
      return { data: null, failed: true };
    }
    const data: unknown = await response.json();
    if (!isRecord(data)) return { data: null, failed: true };
    return { data, failed: false };
  } catch (error) {
    if (!signal.aborted) console.error("Failed to load homepage products:", error);
    return { data: null, failed: !signal.aborted };
  }
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function getDiscountPercentage(product: RecentProduct): number | null {
  if (product.price === null || product.originalPrice === null || product.originalPrice <= product.price) return null;
  return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
}

function getStockLabel(product: RecentProduct): { label: string; className: string } {
  if (product.availability === "UNAVAILABLE" || product.stockQuantity === 0) {
    return { label: "Out of stock", className: "bg-[#F3E8E8] text-[#9F2D18]" };
  }
  if (product.availability === "AVAILABLE") {
    return {
      label: product.stockQuantity !== null ? `${product.stockQuantity} available` : "Available",
      className: "bg-[#DDF5EA] text-[#137A59]",
    };
  }
  return { label: "Confirm availability", className: "bg-[#FFF0C7] text-[#8A671D]" };
}

function ProductPrice({ product }: { product: RecentProduct }) {
  const discount = getDiscountPercentage(product);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span className="text-[13px] font-extrabold leading-5 text-[#9F2D18] sm:text-sm">
          {product.price !== null ? formatNaira(product.price) : "Price unavailable"}
        </span>
        {product.originalPrice !== null && (
          <span className="text-[9px] text-[#958B83] line-through sm:text-[10px]">
            {formatNaira(product.originalPrice)}
          </span>
        )}
      </div>
      {discount !== null && (
        <span className="mt-0.5 inline-flex rounded bg-[#FFF0EA] px-1.5 py-0.5 text-[8px] font-bold text-[#9F2D18]">
          {discount}% off
        </span>
      )}
    </div>
  );
}

function ProductRating({ product }: { product: RecentProduct }) {
  if (product.rating === null || product.reviewCount < 1) return null;
  const filledStars = Math.round(product.rating);
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1" aria-label={`${product.rating.toFixed(1)} out of 5 stars from ${product.reviewCount} reviews`}>
      <span className="flex shrink-0 items-center gap-[1px]">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} className={`h-2.5 w-2.5 ${index < filledStars ? "fill-[#F5B942] text-[#F5B942]" : "fill-none text-[#C8BFB5]"}`} aria-hidden="true" />
        ))}
      </span>
      <span className="truncate text-[8px] text-[#756B61]">{product.rating.toFixed(1)} ({product.reviewCount})</span>
    </div>
  );
}

function ProductCard({
  product, adding, feedback, onAddToCart,
}: {
  product: RecentProduct;
  adding: boolean;
  feedback: CartFeedback;
  onAddToCart: (product: RecentProduct) => void;
}) {
  const canAdd = canAddProductToCart(product);
  const stock = getStockLabel(product);
  const discount = getDiscountPercentage(product);
  const productHref = `/product/${encodeURIComponent(product.id)}`;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-[#EAE6DF] bg-white shadow-[0_2px_9px_rgba(23,32,42,0.035)] transition hover:-translate-y-0.5 hover:border-[#FFD0C3] hover:shadow-[0_6px_16px_rgba(23,32,42,0.07)]">
      <Link href={productHref} aria-label={`View ${product.name}`} className="relative block aspect-[4/3] overflow-hidden bg-[#FCFAF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF5A36]">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[#C3B9AE]"><Package className="h-7 w-7" /></span>
        )}
        {discount !== null && <span className="absolute bottom-1.5 left-1.5 rounded bg-[#9F2D18] px-1.5 py-0.5 text-[8px] font-bold text-white">-{discount}%</span>}
        <span className={`absolute right-1.5 top-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-full px-1.5 py-0.5 text-[8px] font-bold ${stock.className}`}>{stock.label}</span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col p-2 sm:p-2.5">
        <div className="flex min-h-3.5 items-center justify-between gap-1.5">
          <p className="truncate text-[8px] font-bold uppercase tracking-wide text-[#9F2D18]">{product.category ?? "Product"}</p>
          {product.verified && <span title="Verified seller" aria-label="Verified seller" className="inline-flex shrink-0 items-center gap-0.5 text-[8px] font-semibold text-[#137A59]"><BadgeCheck className="h-3 w-3" />Verified</span>}
        </div>
        <Link href={productHref} className="mt-1 line-clamp-2 min-h-8 text-[11px] font-semibold leading-4 text-[#26313B] transition hover:text-[#9F2D18] sm:text-xs">{product.name}</Link>
        <div className="mt-1.5"><ProductPrice product={product} /></div>
        <ProductRating product={product} />

        <div className="mt-auto border-t border-[#F0ECE7] pt-2">
          <div className="flex min-w-0 items-center justify-between gap-1.5">
            <p className="flex min-w-0 items-center gap-0.5 text-[8px] text-[#8A8077]"><MapPin className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{product.area ?? "Nearby listing"}</span></p>
            <Link href={productHref} className="shrink-0 text-[9px] font-bold text-[#9F2D18] hover:text-[#FF5A36]">Details</Link>
          </div>
          <button
            type="button"
            disabled={!canAdd || adding}
            onClick={() => onAddToCart(product)}
            className={`mt-2 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[9px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 sm:text-[10px] ${!canAdd ? "cursor-not-allowed bg-[#EEEAE6] text-[#A69B91]" : "bg-[#FF5A36] text-white hover:bg-[#E94A28] active:scale-[0.99]"}`}
            aria-label={canAdd ? `Add ${product.name} to cart` : `${product.name} is not available for online checkout`}
            title={canAdd ? "Add to cart" : "This product requires confirmed availability and a fixed price."}
          >
            {adding ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : feedback?.productId === product.id && feedback.kind === "success" ? <Check className="h-3 w-3" /> : <ShoppingCart className="h-3 w-3" />}
            {!canAdd ? "Unavailable" : adding ? "Adding..." : "Add to cart"}
          </button>
          {feedback?.productId === product.id && feedback.kind === "error" && <p role="alert" className="mt-1 text-[8px] leading-3 text-[#B42318]">{feedback.message}</p>}
          {feedback?.productId === product.id && feedback.kind === "success" && <p role="status" className="mt-1 text-[8px] leading-3 text-[#267344]">{feedback.message}</p>}
        </div>
      </div>
    </article>
  );
}

function getCategoryHref(category: HomeCategory): string {
  const params = new URLSearchParams({ type: "product", categoryId: category.id, category: category.name });
  return `/search?${params.toString()}`;
}

function CategoryTile({ category }: { category: HomeCategoryNode }) {
  const Icon = category.icon;
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-[#EEE8E1] bg-white transition hover:border-[#FFC2B2] hover:shadow-sm">
      <Link href={getCategoryHref(category)} className="group flex min-w-0 items-center gap-2.5 px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF5A36]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ backgroundColor: category.bg }}>
          {category.imageUrl ? (
            <img src={category.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <Icon className="h-5 w-5 text-[#6F5144]" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-bold text-[#401B13] group-hover:text-[#9F2D18]">{category.name}</span>
          <span className="mt-0.5 block text-[9px] text-[#81766D]">{category.children.length ? `${category.children.length} subcategories` : "Browse products"}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#A69B91] transition group-hover:translate-x-0.5 group-hover:text-[#9F2D18]" />
      </Link>
      {category.children.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-[#F0ECE7] px-3 py-2.5">
          {category.children.map((child) => (
            <Link key={child.id} href={getCategoryHref(child)} className="max-w-full rounded-full border border-[#EEE8E1] bg-[#FCFAF6] px-2.5 py-1 text-[9px] font-medium text-[#62574E] transition hover:border-[#FFC2B2] hover:bg-[#FFF1ED] hover:text-[#9F2D18]">
              <span className="block truncate">{child.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [products, setProducts] = useState<RecentProduct[]>([]);
  const [categories, setCategories] = useState<HomeCategoryNode[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsFailed, setProductsFailed] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<CartFeedback>(null);
  const [shareFeedback, setShareFeedback] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setProductsLoading(true);
    setProductsFailed(false);

    async function loadHomepageProducts() {
      const result = await fetchHomepageProducts(controller.signal);
      if (controller.signal.aborted) return;
      const rawProducts = Array.isArray(result.data?.products) ? result.data.products : [];
      const parsedProducts = rawProducts.map(parseRecentProduct)
        .filter((item): item is RecentProduct => item !== null)
        .slice(0, MAX_HOME_PRODUCTS);
      setProducts(parsedProducts);
      setProductsFailed(result.failed);
      setProductsLoading(false);
    }

    void loadHomepageProducts();
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch("/api/categories?type=product", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load categories.");
        const data: unknown = await response.json();
        if (!isRecord(data)) throw new Error("Invalid categories response.");

        const navigationCategories = Array.isArray(data.navigationCategories) && data.navigationCategories.length > 0
          ? data.navigationCategories
          : data.categories;
        if (!controller.signal.aborted) {
          setCategories(parseHomeCategories(navigationCategories).slice(0, MAX_HOME_CATEGORIES));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Unable to load homepage categories:", error);
          setCategories([]);
        }
      } finally {
        if (!controller.signal.aborted) setCategoriesLoading(false);
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, []);

  async function handleAddToCart(product: RecentProduct) {
    if (addingProductId || !canAddProductToCart(product)) return;
    setAddingProductId(product.id);
    setCartFeedback(null);

    try {
      const response = await fetch("/api/cart/items", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const serverMessage = isRecord(result) ? cleanString(result.error) ?? cleanString(result.message) : null;
        let message = serverMessage ?? "Unable to add this product to your cart.";
        if (response.status === 401) message = "Sign in to add products to your cart.";
        else if (response.status === 403) message = "Your account cannot add products to the cart.";
        else if (response.status === 409) message = serverMessage ?? "This product is no longer available.";
        throw new Error(message);
      }
      setCartFeedback({ productId: product.id, kind: "success", message: "Added to cart" });
      window.dispatchEvent(new Event(CART_CHANGED_EVENT));
    } catch (error) {
      setCartFeedback({
        productId: product.id,
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to add this product to your cart.",
      });
    } finally {
      setAddingProductId(null);
    }
  }

  async function handleShareReMarket() {
    const shareUrl = "https://remarket.com.ng";
    const shareData = {
      title: "ReMarket — Find it nearby",
      text: "Discover products available around you on ReMarket.",
      url: shareUrl,
    };
    setShareFeedback("");

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        setShareFeedback("Thanks for sharing ReMarket.");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback("ReMarket link copied. Share it with someone.");
        return;
      }
    } catch (error) {
      console.error("Unable to copy ReMarket link:", error);
    }
    setShareFeedback(`Copy this website address to share: ${shareUrl}`);
  }

  const retryProducts = () => setReloadKey((current) => current + 1);
  const productGridClass = "grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";
  const categoryGridClass = "grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3";

  return (
    <div className="remarket-home-page min-h-dvh bg-[#FFF7ED]">
      <SiteHeader searchMode="PRODUCTS" />
      <main id="main-content" className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-8">
        <div className="mx-auto max-w-[1600px] px-3 pb-7 pt-4 sm:px-5 sm:pt-5 lg:pl-7 lg:pr-[340px] lg:pt-6 xl:pl-8 xl:pr-[340px]">
          <section className="mt-1" aria-labelledby="categories-heading">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#9F2D18]">Explore the catalogue</p>
                <h2 id="categories-heading" className="mt-1 text-lg font-extrabold tracking-tight text-[#401B13] sm:text-xl">Shop by category</h2>
              </div>
              <Link href="/shop" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#9F2D18] hover:text-[#FF5A36] sm:text-[11px]">
                All products <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {categoriesLoading ? (
              <div className={categoryGridClass}>
                {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[105px] animate-pulse rounded-lg border border-[#EAE6DF] bg-white" />)}
              </div>
            ) : categories.length > 0 ? (
              <div className={categoryGridClass}>
                {categories.map((category) => <CategoryTile key={category.id} category={category} />)}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-4">
                <p className="text-xs text-[#756B61]">Browse the full product catalogue to explore available categories.</p>
                <Link href="/shop" className="text-xs font-bold text-[#9F2D18]">Browse products <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link>
              </div>
            )}
          </section>

          {products.some((product) => getDiscountPercentage(product) !== null) && (
            <section className="mt-7" aria-labelledby="special-prices-heading">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#9F2D18]">Marked-down listings</p>
                  <h2 id="special-prices-heading" className="mt-1 text-lg font-extrabold tracking-tight text-[#401B13] sm:text-xl">Special prices</h2>
                  <p className="mt-1 text-[10px] text-[#756B61] sm:text-[11px]">Products with a listed original price above their current price.</p>
                </div>
                <Link href="/shop" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-[#9F2D18] hover:text-[#FF5A36] sm:text-[11px]">Explore <ChevronRight className="h-3.5 w-3.5" /></Link>
              </div>
              <div className={productGridClass}>
                {products.filter((product) => getDiscountPercentage(product) !== null).slice(0, 6).map((product) => (
                  <ProductCard key={`price-highlight-${product.id}`} product={product} adding={addingProductId === product.id} feedback={cartFeedback} onAddToCart={handleAddToCart} />
                ))}
              </div>
            </section>
          )}

          <section id="recent-products" className="mt-7 scroll-mt-24 sm:mt-9" aria-labelledby="recent-products-heading">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFD9CE] bg-[#FFF1ED] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.13em] text-[#9F2D18]"><span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />Recently listed</div>
                <h2 id="recent-products-heading" className="text-lg font-extrabold tracking-tight text-[#401B13] sm:text-xl">Fresh finds for you</h2>
                <p className="mt-1 text-[10px] text-[#756B61] sm:text-xs">The latest products added to ReMarket.</p>
              </div>
              <Link href="/shop" className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-bold text-[#9F2D18] transition hover:bg-[#FFF1ED] sm:text-xs">View all <ArrowRight className="h-3 w-3" /></Link>
            </div>

            {productsLoading && (
              <div className={productGridClass}>
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={`home-product-skeleton-${index}`} className="overflow-hidden rounded-lg border border-[#EAE6DF] bg-white">
                    <div className="aspect-[4/3] animate-pulse bg-[#F2EEE9]" />
                    <div className="space-y-2 p-2.5"><div className="h-2.5 w-4/5 animate-pulse rounded bg-[#F2EEE9]" /><div className="h-3 w-2/5 animate-pulse rounded bg-[#F2EEE9]" /><div className="h-7 w-full animate-pulse rounded-md bg-[#F2EEE9]" /></div>
                  </div>
                ))}
              </div>
            )}

            {!productsLoading && productsFailed && (
              <div className="rounded-2xl border border-[#F2D2C9] bg-[#FFF7F4] px-5 py-8 text-center">
                <p className="text-sm font-bold text-[#9F2D18]">We couldn't load products.</p>
                <p className="mt-1 text-xs text-[#756B61]">Please try again.</p>
                <button type="button" onClick={retryProducts} className="mt-4 rounded-lg bg-[#FF5A36] px-5 py-2 text-xs font-bold text-white hover:bg-[#E94A28]">Try again</button>
              </div>
            )}

            {!productsLoading && !productsFailed && products.length > 0 && (
              <div className={productGridClass}>
                {products.map((product) => <ProductCard key={product.id} product={product} adding={addingProductId === product.id} feedback={cartFeedback} onAddToCart={handleAddToCart} />)}
              </div>
            )}

            {!productsLoading && !productsFailed && products.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-9 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#FF5A36] shadow-sm"><Package className="h-5 w-5" /></div>
                <p className="mt-3 text-sm font-bold text-[#17202A]">No products to display yet</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#756B61]">New products will appear here when they are published.</p>
                <Link href="/shop" className="mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[#FF5A36] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#E94A28]">Explore products <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            )}
          </section>

          <section className="mt-7 grid gap-2 sm:mt-9 sm:grid-cols-3 sm:gap-3">
            <div className="flex items-center gap-3 rounded-lg border border-[#EEE8E1] bg-[#FCFAF6] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF0E9] text-[#9F2D18]"><Search className="h-4 w-4" /></span>
              <div><p className="text-[11px] font-bold text-[#514840]">Search products</p><p className="mt-0.5 text-[9px] leading-4 text-[#81766D]">Find items by name or category.</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-[#EEE8E1] bg-[#FCFAF6] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF0E9] text-[#9F2D18]"><MapPin className="h-4 w-4" /></span>
              <div><p className="text-[11px] font-bold text-[#514840]">Find it nearby</p><p className="mt-0.5 text-[9px] leading-4 text-[#81766D]">Explore products by area.</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-[#EEE8E1] bg-[#FCFAF6] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF0E9] text-[#9F2D18]"><ShoppingCart className="h-4 w-4" /></span>
              <div><p className="text-[11px] font-bold text-[#514840]">Build your cart</p><p className="mt-0.5 text-[9px] leading-4 text-[#81766D]">Keep selected products together.</p></div>
            </div>
          </section>

          <section className="relative mt-7 overflow-hidden rounded-xl bg-gradient-to-r from-[#FF713F] via-[#FF5A36] to-[#F04B2B] px-4 py-5 text-white shadow-[0_8px_22px_rgba(255,90,54,0.12)] sm:mt-9 sm:px-7 sm:py-6">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border-[28px] border-white/10" />
            <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20 sm:h-12 sm:w-12"><Share2 className="h-5 w-5 sm:h-6 sm:w-6" /></div>
                <div><h2 className="text-base font-extrabold tracking-tight sm:text-lg">Good finds are worth sharing</h2><p className="mt-1 max-w-lg text-[10px] leading-4 text-white/90 sm:text-xs sm:leading-5">Share ReMarket and help more people discover products around them.</p></div>
              </div>
              <button type="button" onClick={() => void handleShareReMarket()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-[10px] font-extrabold text-[#9F2D18] transition hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF5A36] sm:text-xs">Share ReMarket <ArrowRight className="h-3.5 w-3.5" /></button>
            </div>
            {shareFeedback && <p role="status" className="relative z-10 mt-3 text-[10px] text-white">{shareFeedback}</p>}
          </section>

          <footer className="mt-7 flex items-center justify-center gap-3 pb-3 text-[9px] text-[#9B9188]">
            <span className="h-px w-10 bg-[#EAE6DF]" /><span>ReMarket · Find it nearby</span><span className="h-px w-10 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>
      <MobileBottomNav />
      <HomeCartSidebar />
    </div>
  );
}
