"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  MapPin,
  Package,
  Share2,
  ShoppingCart,
  Star,
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
type CartFeedback = {
  productId: string;
  kind: "success" | "error";
  message: string;
} | null;

type HomeCategory = ReMarketCategory & {
  parentId: string | null;
  imageUrl: string | null;
  sortOrder: number;
};
type HomeCategoryNode = HomeCategory & { children: HomeCategoryNode[] };

const PRODUCT_FEED_URL = "/api/recent-products?page=1&pageSize=12";
const MAX_HOME_PRODUCTS = 12;
const MAX_HOME_CATEGORIES = 8;
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
  return product.availability === "AVAILABLE" &&
    product.price !== null &&
    product.price > 0 &&
    product.stockQuantity !== 0;
}

function isProductOutOfStock(
  product: Pick<RecentProduct, "availability" | "stockQuantity">,
): boolean {
  return product.availability === "UNAVAILABLE" || product.stockQuantity === 0;
}

function parseRecentProduct(value: unknown): RecentProduct | null {
  if (!isRecord(value)) return null;

  const id = cleanString(value.id);
  const name = cleanString(value.name);
  if (!id || !name) return null;

  const price = parseOptionalNumber(value.price);
  const candidateOriginalPrice = parseOptionalNumber(value.originalPrice);
  const originalPrice =
    price !== null && candidateOriginalPrice !== null && candidateOriginalPrice > price
      ? candidateOriginalPrice
      : null;

  const seller = isRecord(value.seller)
    ? value.seller
    : isRecord(value.business)
      ? value.business
      : null;
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
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") {
        continue;
      }

      const id = item.id.trim();
      const name = item.name.trim();
      if (!id || !name) continue;

      const parentId = inheritedParentId ?? cleanString(item.parentId);
      records.push({
        id,
        name,
        iconKey: cleanString(item.iconKey),
        isActive: typeof item.isActive === "boolean" ? item.isActive : true,
        sortOrder: typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
          ? item.sortOrder
          : 0,
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
    const response = await fetch(PRODUCT_FEED_URL, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });

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
  if (
    product.price === null ||
    product.originalPrice === null ||
    product.originalPrice <= product.price
  ) {
    return null;
  }

  return Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100);
}

function getStockLabel(product: RecentProduct): { label: string; className: string } {
  if (isProductOutOfStock(product)) {
    return { label: "Out of stock", className: "bg-[#FCE8E6] text-[#A12A20]" };
  }

  if (product.availability === "AVAILABLE") {
    return { label: "In stock", className: "bg-[#EAF5ED] text-[#176B48]" };
  }

  return { label: "Check availability", className: "bg-[#FFF4DE] text-[#805D16]" };
}

function ProductPrice({ product }: { product: RecentProduct }) {
  return (
    <div className="rm-product-price-row min-w-0">
      <span className="rm-product-price">
        {product.price !== null ? formatNaira(product.price) : "Ask seller"}
      </span>
      {product.originalPrice !== null && (
        <span className="rm-product-old-price">
          {formatNaira(product.originalPrice)}
        </span>
      )}
    </div>
  );
}

function ProductRating({ product }: { product: RecentProduct }) {
  if (product.rating === null || product.reviewCount < 1) return null;

  const filledStars = Math.round(product.rating);
  return (
    <div
      className="rm-product-rating mt-1 min-w-0"
      aria-label={`${product.rating.toFixed(1)} out of 5 stars from ${product.reviewCount} reviews`}
    >
      <span className="flex shrink-0 items-center gap-px">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            className={index < filledStars
              ? "h-3 w-3 fill-[#E7A52E] text-[#E7A52E]"
              : "h-3 w-3 fill-none text-[#C9C1B9]"}
            aria-hidden="true"
          />
        ))}
      </span>
      <span className="truncate">
        {product.rating.toFixed(1)} ({product.reviewCount})
      </span>
    </div>
  );
}

function ProductCard({
  product,
  adding,
  feedback,
  onAddToCart,
}: {
  product: RecentProduct;
  adding: boolean;
  feedback: CartFeedback;
  onAddToCart: (product: RecentProduct) => void;
}) {
  const canAdd = canAddProductToCart(product);
  const soldOut = isProductOutOfStock(product);
  const stock = getStockLabel(product);
  const discount = getDiscountPercentage(product);
  const productHref = `/product/${encodeURIComponent(product.id)}`;
  const currentFeedback = feedback?.productId === product.id ? feedback : null;

  return (
    <article className="group rm-product-card flex h-full flex-col">
      <Link
        href={productHref}
        aria-label={`View ${product.name}`}
        className="rm-product-media focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF5A36]"
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-contain p-2.5 sm:p-3"
            style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[#B9AEA4]">
            <Package className="h-9 w-9" aria-hidden="true" />
          </span>
        )}

        <span className={`rm-product-badge absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate ${stock.className}`}>
          {stock.label}
        </span>

        {discount !== null && (
          <span className="rm-product-badge rm-product-badge-sale absolute right-2 top-2">
            -{discount}%
          </span>
        )}
      </Link>

      <div className="rm-product-details flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-5 items-center justify-between gap-2">
          <p className="rm-product-category min-w-0">
            {product.category ?? "Products"}
          </p>
          {product.verified && (
            <span
              title="Verified seller"
              aria-label="Verified seller"
              className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-[#176B48]"
            >
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Verified</span>
            </span>
          )}
        </div>

        <Link
          href={productHref}
          className="rm-product-title mt-1 hover:text-[#9F2D18]"
        >
          {product.name}
        </Link>

        <div className="mt-1.5">
          <ProductPrice product={product} />
          <ProductRating product={product} />
        </div>

        <div className="mt-auto pt-3">
          <div className="rm-product-meta mb-2 min-w-0 justify-start">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#9A8B80]" aria-hidden="true" />
            <span className="rm-product-seller">{product.area ?? "Area not listed"}</span>
          </div>

          {canAdd ? (
            <button
              type="button"
              disabled={adding}
              onClick={() => onAddToCart(product)}
              className="rm-button rm-button-primary w-full disabled:cursor-wait disabled:opacity-70 focus-visible:ring-2 focus-visible:ring-offset-2"
              aria-label={`Add ${product.name} to cart`}
            >
              {adding ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : currentFeedback?.kind === "success" ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {adding ? "Adding..." : currentFeedback?.kind === "success" ? "Added" : "Add to cart"}
            </button>
          ) : soldOut ? (
            <button
              type="button"
              disabled
              className="rm-button rm-button-secondary w-full opacity-65"
            >
              Out of stock
            </button>
          ) : (
            <Link
              href={productHref}
              className="rm-button rm-button-secondary w-full text-[#9F2D18] hover:text-[#9F2D18]"
            >
              {product.price === null ? "Check price" : "Confirm availability"}
            </Link>
          )}

          {currentFeedback?.kind === "error" && (
            <p role="alert" className="mt-1.5 text-[11px] leading-4 text-[#B42318]">
              {currentFeedback.message}
            </p>
          )}
          {currentFeedback?.kind === "success" && (
            <p role="status" className="mt-1.5 text-[11px] leading-4 text-[#176B48]">
              {currentFeedback.message}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function getCategoryHref(category: HomeCategory): string {
  const params = new URLSearchParams({
    type: "product",
    categoryId: category.id,
    category: category.name,
  });
  return `/search?${params.toString()}`;
}

function CategoryTile({ category }: { category: HomeCategoryNode }) {
  const Icon = category.icon;

  return (
    <Link
      href={getCategoryHref(category)}
      className="rm-category-tile group"
    >
      <span
        className="rm-category-icon overflow-hidden"
        style={{ backgroundColor: category.bg }}
      >
        {category.imageUrl ? (
          <img src={category.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" style={{ width: "100%", height: "100%", display: "block", objectFit: "cover" }} />
        ) : (
          <Icon className="h-5 w-5 text-[#6F5144]" aria-hidden="true" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="rm-category-name block group-hover:text-[#9F2D18]">
          {category.name}
        </span>
        <span className="mt-0.5 block text-[10px] text-[#81766D]">
          {category.children.length > 0 ? `${category.children.length} subcategories` : "Browse products"}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#A69B91] group-hover:text-[#9F2D18]" aria-hidden="true" />
    </Link>
  );
}

function ProductSkeleton() {
  return (
    <div className="rm-product-card overflow-hidden">
      <div className="rm-product-media animate-pulse" />
      <div className="rm-product-details space-y-2">
        <div className="h-3 w-2/5 rounded bg-[#F2EEE9]" />
        <div className="h-3 w-4/5 rounded bg-[#F2EEE9]" />
        <div className="h-4 w-1/2 rounded bg-[#F2EEE9]" />
        <div className="h-9 w-full rounded-md bg-[#F2EEE9]" />
      </div>
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
      const parsedProducts = rawProducts
        .map(parseRecentProduct)
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
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) throw new Error("Unable to load categories.");
        const data: unknown = await response.json();
        if (!isRecord(data)) throw new Error("Invalid categories response.");

        const navigationCategories =
          Array.isArray(data.navigationCategories) && data.navigationCategories.length > 0
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
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });

      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const serverMessage = isRecord(result)
          ? cleanString(result.error) ?? cleanString(result.message)
          : null;
        let message = serverMessage ?? "Unable to add this product to your cart.";

        if (response.status === 401) message = "Sign in to add products to your cart.";
        else if (response.status === 403) message = "Your account cannot add products to the cart.";
        else if (response.status === 409) message = serverMessage ?? "This product is no longer available.";

        throw new Error(message);
      }

      setCartFeedback({ productId: product.id, kind: "success", message: "Added to cart." });
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

  const productGridClass =
    "rm-product-grid min-w-0 grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
  const categoryGridClass =
    "rm-category-grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4";

  return (
    <div className="rm-storefront remarket-home-page min-h-dvh">
      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh overflow-x-clip bg-[var(--rm-surface)] pb-28 text-[var(--rm-ink)] lg:pb-8"
      >
        <div className="mx-auto w-full max-w-[1680px] px-3 pb-8 pt-4 sm:px-5 sm:pt-6 lg:pl-7 lg:pr-[340px] xl:pt-7">
          <section className="rm-section mb-7 flex flex-col gap-4 border-b border-[var(--rm-border)] pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[var(--rm-coral-dark)]">ReMarket / Shop products</p>
              <h1 className="mt-1.5 text-2xl font-bold leading-tight tracking-tight text-[var(--rm-ink)] sm:text-[30px]">
                Discover products from local businesses
              </h1>
              <p className="rm-section-subtitle mt-2 max-w-2xl text-sm leading-6">
                Browse products listed by businesses around you and add available items to your cart.
              </p>
            </div>
            <Link
              href="/shop"
              className="rm-button rm-button-secondary shrink-0 self-start sm:self-auto"
            >
              Browse all products
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          <section aria-labelledby="categories-heading" className="rm-section mb-9">
            <div className="rm-section-heading">
              <div>
                <h2 id="categories-heading" className="rm-section-title">
                  Shop by category
                </h2>
                <p className="rm-section-subtitle">
                  Choose a category to narrow down the catalogue.
                </p>
              </div>
              <Link
                href="/shop"
                className="rm-text-link shrink-0"
              >
                All categories
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {categoriesLoading ? (
              <div className={categoryGridClass}>
                {Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={`home-category-skeleton-${index}`}
                    className="h-[66px] rounded-lg border border-[#EAE6DF] bg-[#F8F6F2]"
                  />
                ))}
              </div>
            ) : categories.length > 0 ? (
              <div className={categoryGridClass}>
                {categories.map((category) => (
                  <CategoryTile key={category.id} category={category} />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-4">
                <p className="text-xs text-[#756B61]">
                  Browse the product catalogue to explore available categories.
                </p>
                <Link href="/shop" className="text-xs font-semibold text-[#9F2D18]">
                  Browse products <ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>

          <section
            id="recent-products"
            className="rm-section scroll-mt-28"
            aria-labelledby="recent-products-heading"
          >
            <div className="rm-section-heading border-b border-[var(--rm-border)] pb-3">
              <div className="min-w-0">
                <h2 id="recent-products-heading" className="rm-section-title">
                  Recently listed
                </h2>
                <p className="rm-section-subtitle">
                  The latest products added to ReMarket.
                </p>
              </div>
              <Link
                href="/shop"
                className="rm-text-link shrink-0"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {productsLoading && (
              <div className={productGridClass}>
                {Array.from({ length: MAX_HOME_PRODUCTS }).map((_, index) => (
                  <ProductSkeleton key={`home-product-skeleton-${index}`} />
                ))}
              </div>
            )}

            {!productsLoading && productsFailed && (
              <div className="rounded-lg border border-[#F2D2C9] bg-[#FFF7F4] px-5 py-8 text-center">
                <p className="text-sm font-semibold text-[#9F2D18]">We couldn’t load products.</p>
                <p className="mt-1 text-xs text-[#756B61]">Please try again.</p>
                <button
                  type="button"
                  onClick={retryProducts}
                  className="rm-button rm-button-primary mt-4"
                >
                  Try again
                </button>
              </div>
            )}

            {!productsLoading && !productsFailed && products.length > 0 && (
              <div className={productGridClass}>
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    adding={addingProductId === product.id}
                    feedback={cartFeedback}
                    onAddToCart={handleAddToCart}
                  />
                ))}
              </div>
            )}

            {!productsLoading && !productsFailed && products.length === 0 && (
              <div className="rm-empty-state rm-panel rounded-lg border-dashed bg-[var(--rm-surface-muted)] px-5 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[#FF5A36]">
                  <Package className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold text-[#202A33]">No products to display yet</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#756B61]">
                  New products will appear here when sellers publish their listings.
                </p>
                <Link
                  href="/shop"
                  className="rm-button rm-button-primary mt-4"
                >
                  Explore products
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>

          <footer className="mt-10 flex flex-col gap-3 border-t border-[#EAE6DF] pt-5 text-xs text-[#81766D] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[#514840]">ReMarket</p>
              <p className="mt-0.5">Find it nearby.</p>
            </div>

            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <button
                type="button"
                onClick={() => void handleShareReMarket()}
                className="rm-button rm-button-quiet min-h-9 px-2.5 text-[var(--rm-coral-dark)]"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                Share ReMarket
              </button>
              {shareFeedback && (
                <p role="status" className="max-w-full break-words text-[11px] text-[#71675F]">
                  {shareFeedback}
                </p>
              )}
            </div>
          </footer>
        </div>
      </main>

      <MobileBottomNav />
      <HomeCartSidebar />
    </div>
  );
}
