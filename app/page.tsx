"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  MapPin,
  Package,
  Search,
  Share2,
  ShoppingCart,
  Sparkles,
  Star,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
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

type FeedResult = {
  data: JsonResult;
  failed: boolean;
};

type CartFeedback = {
  productId: string;
  kind: "success" | "error";
  message: string;
} | null;

type HomeCategory = ReMarketCategory;

const PRODUCT_FEED_URL = "/api/recent-products?page=1&pageSize=12";
const MAX_HOME_PRODUCTS = 12;

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
  if (
    value === "AVAILABLE" ||
    value === "UNAVAILABLE" ||
    value === "ASK_SELLER"
  ) {
    return value;
  }
  return "ASK_SELLER";
}

function parseCategoryName(value: unknown): string | null {
  if (typeof value === "string") return cleanString(value);
  if (isRecord(value)) return cleanString(value.name);
  return null;
}

function parseRecentProduct(value: unknown): RecentProduct | null {
  if (!isRecord(value)) return null;

  const id = cleanString(value.id);
  const name = cleanString(value.name);
  if (!id || !name) return null;

  const price = parseOptionalNumber(value.price);
  const candidateOriginalPrice = parseOptionalNumber(value.originalPrice);
  const originalPrice =
    price !== null &&
    candidateOriginalPrice !== null &&
    candidateOriginalPrice > price
      ? candidateOriginalPrice
      : null;

  const seller = isRecord(value.seller)
    ? value.seller
    : isRecord(value.business)
      ? value.business
      : null;
  const location = seller && isRecord(seller.location)
    ? seller.location
    : null;

  const rawRating =
    parseOptionalNumber(value.rating) ??
    parseOptionalNumber(value.averageRating);
  const rating = rawRating !== null && rawRating <= 5
    ? rawRating
    : null;
  const rawReviewCount =
    parseOptionalNumber(value.reviewCount) ??
    parseOptionalNumber(value.reviewsCount);

  return {
    id,
    name,
    description: cleanString(value.description),
    price,
    originalPrice,
    rating,
    reviewCount: rawReviewCount === null
      ? 0
      : Math.floor(rawReviewCount),
    stockQuantity: parseOptionalNumber(value.stockQuantity),
    availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl),
    category: parseCategoryName(value.category),
    area: location ? cleanString(location.area) : null,
    verified:
      seller?.verified === true ||
      seller?.verification === "VERIFIED",
  };
}

function parseHomeCategories(value: unknown): HomeCategory[] {
  if (!Array.isArray(value)) return [];

  const categories: ApiCategory[] = value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.name !== "string"
    ) {
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

async function fetchHomepageProducts(signal: AbortSignal): Promise<FeedResult> {
  try {
    const response = await fetch(PRODUCT_FEED_URL, {
      cache: "no-store",
      signal,
    });

    if (response.status === 404) {
      return { data: null, failed: false };
    }

    if (!response.ok) {
      console.error(`Homepage products returned HTTP ${response.status}.`);
      return { data: null, failed: true };
    }

    const data: unknown = await response.json();
    if (!isRecord(data)) return { data: null, failed: true };
    return { data, failed: false };
  } catch (error) {
    if (!signal.aborted) {
      console.error("Failed to load homepage products:", error);
    }
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

  return Math.round(
    ((product.originalPrice - product.price) / product.originalPrice) * 100,
  );
}

function getStockLabel(product: RecentProduct): {
  label: string;
  className: string;
} {
  if (
    product.availability === "UNAVAILABLE" ||
    product.stockQuantity === 0
  ) {
    return {
      label: "Out of stock",
      className: "bg-[#F3E8E8] text-[#9F2D18]",
    };
  }

  if (product.availability === "AVAILABLE") {
    return {
      label: product.stockQuantity !== null
        ? `${product.stockQuantity} available`
        : "Available",
      className: "bg-[#DDF5EA] text-[#137A59]",
    };
  }

  return {
    label: "Confirm availability",
    className: "bg-[#FFF0C7] text-[#8A671D]",
  };
}

function ProductPrice({ product }: { product: RecentProduct }) {
  const discount = getDiscountPercentage(product);

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[15px] font-extrabold leading-5 text-[#9F2D18] sm:text-base">
          {product.price !== null ? formatNaira(product.price) : "Price unavailable"}
        </span>
        {product.originalPrice !== null && (
          <span className="text-[10px] text-[#958B83] line-through sm:text-xs">
            {formatNaira(product.originalPrice)}
          </span>
        )}
      </div>
      {discount !== null && (
        <span className="mt-1 inline-flex rounded-md bg-[#FFF0EA] px-1.5 py-0.5 text-[9px] font-bold text-[#9F2D18]">
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
    <div
      className="mt-1.5 flex min-w-0 items-center gap-1"
      aria-label={`${product.rating.toFixed(1)} out of 5 stars from ${product.reviewCount} reviews`}
    >
      <span className="flex shrink-0 items-center gap-[1px]">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            className={`h-3 w-3 ${
              index < filledStars
                ? "fill-[#F5B942] text-[#F5B942]"
                : "fill-none text-[#C8BFB5]"
            }`}
            aria-hidden="true"
          />
        ))}
      </span>
      <span className="truncate text-[9px] text-[#756B61]">
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
  const unavailable =
    product.availability === "UNAVAILABLE" ||
    product.stockQuantity === 0;
  const stock = getStockLabel(product);
  const discount = getDiscountPercentage(product);
  const productHref = `/product/${encodeURIComponent(product.id)}`;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#EAE6DF] bg-white shadow-[0_3px_12px_rgba(23,32,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#FFD0C3] hover:shadow-[0_8px_22px_rgba(23,32,42,0.08)]">
      <Link
        href={productHref}
        aria-label={`View ${product.name}`}
        className="relative block aspect-square overflow-hidden bg-[#FCFAF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF5A36]"
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[#C3B9AE]">
            <Package className="h-10 w-10" />
          </span>
        )}

        {discount !== null && (
          <span className="absolute bottom-2 left-2 rounded-md bg-[#9F2D18] px-2 py-1 text-[9px] font-bold text-white">
            -{discount}%
          </span>
        )}

        <span className={`absolute right-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full px-2 py-1 text-[9px] font-bold ${stock.className}`}>
          {stock.label}
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-3.5">
        <div className="flex min-h-4 items-center justify-between gap-2">
          <p className="truncate text-[9px] font-bold uppercase tracking-wide text-[#9F2D18]">
            {product.category ?? "Product"}
          </p>
          {product.verified && (
            <span
              title="Verified seller"
              aria-label="Verified seller"
              className="inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold text-[#137A59]"
            >
              <BadgeCheck className="h-3.5 w-3.5" />
              Verified
            </span>
          )}
        </div>

        <Link
          href={productHref}
          className="mt-1 line-clamp-2 min-h-10 text-xs font-semibold leading-[18px] text-[#26313B] transition hover:text-[#9F2D18] sm:text-[13px]"
        >
          {product.name}
        </Link>

        <div className="mt-2">
          <ProductPrice product={product} />
        </div>

        <ProductRating product={product} />

        <div className="mt-auto border-t border-[#F0ECE7] pt-2.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1 text-[9px] text-[#8A8077] sm:text-[10px]">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{product.area ?? "Nearby listing"}</span>
            </p>
            <Link
              href={productHref}
              className="shrink-0 text-[10px] font-bold text-[#9F2D18] hover:text-[#FF5A36]"
            >
              Details
            </Link>
          </div>

          <button
            type="button"
            disabled={unavailable || adding}
            onClick={() => onAddToCart(product)}
            className={`mt-2.5 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 sm:text-xs ${
              unavailable
                ? "cursor-not-allowed bg-[#EEEAE6] text-[#A69B91]"
                : "bg-[#FF5A36] text-white hover:bg-[#E94A28] active:scale-[0.99]"
            }`}
            aria-label={
              unavailable
                ? `${product.name} is out of stock`
                : `Add ${product.name} to cart`
            }
          >
            {adding ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : feedback?.productId === product.id && feedback.kind === "success" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <ShoppingCart className="h-3.5 w-3.5" />
            )}
            {unavailable ? "Unavailable" : adding ? "Adding..." : "Add to cart"}
          </button>

          {feedback?.productId === product.id && feedback.kind === "error" && (
            <p role="alert" className="mt-1.5 text-[9px] leading-4 text-[#B42318]">
              {feedback.message}
            </p>
          )}
          {feedback?.productId === product.id && feedback.kind === "success" && (
            <p role="status" className="mt-1.5 text-[9px] leading-4 text-[#267344]">
              {feedback.message}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function CategoryTile({ category }: { category: HomeCategory }) {
  const Icon = category.icon;
  const href = `/search?type=product&category=${encodeURIComponent(category.name)}`;

  return (
    <Link
      href={href}
      className="group flex min-w-[112px] flex-col items-center gap-2 rounded-xl border border-[#EEE8E1] bg-white px-3 py-4 text-center transition hover:-translate-y-0.5 hover:border-[#FFC2B2] hover:shadow-sm sm:min-w-0"
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full transition group-hover:scale-105"
        style={{ backgroundColor: category.bg }}
      >
        <Icon className="h-5 w-5 text-[#6F5144]" />
      </span>
      <span className="line-clamp-2 text-[10px] font-semibold text-[#514840] sm:text-xs">
        {category.name}
      </span>
    </Link>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [products, setProducts] = useState<RecentProduct[]>([]);
  const [categories, setCategories] = useState<HomeCategory[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsFailed, setProductsFailed] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
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

      const rawProducts = Array.isArray(result.data?.products)
        ? result.data.products
        : [];
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
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load categories.");

        const data: unknown = await response.json();
        if (!isRecord(data)) throw new Error("Invalid categories response.");

        if (!controller.signal.aborted) {
          setCategories(parseHomeCategories(data.categories).slice(0, 10));
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
    if (
      addingProductId ||
      product.availability === "UNAVAILABLE" ||
      product.stockQuantity === 0
    ) {
      return;
    }

    setAddingProductId(product.id);
    setCartFeedback(null);

    try {
      const response = await fetch("/api/cart/items", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });

      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const serverMessage = isRecord(result)
          ? cleanString(result.error) ?? cleanString(result.message)
          : null;
        let message = serverMessage ?? "Unable to add this product to your cart.";

        if (response.status === 401) {
          message = "Sign in to add products to your cart.";
        } else if (response.status === 403) {
          message = "Your account cannot add products to the cart.";
        } else if (response.status === 409) {
          message = serverMessage ?? "This product is no longer available.";
        }
        throw new Error(message);
      }

      setCartFeedback({
        productId: product.id,
        kind: "success",
        message: "Added to cart",
      });
    } catch (error) {
      setCartFeedback({
        productId: product.id,
        kind: "error",
        message: error instanceof Error
          ? error.message
          : "Unable to add this product to your cart.",
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

  function submitHomepageSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    router.push(`/search?${new URLSearchParams({ q: query, type: "product" })}`);
  }

  function retryProducts() {
    setReloadKey((current) => current + 1);
  }

  const heroProduct = products[0] ?? null;
  const secondaryHeroProduct = products[1] ?? null;

  return (
    <div className="min-h-dvh bg-[#FFF7ED]">
      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-8"
      >
        <div className="mx-auto max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-7 xl:px-10">
          {/* SHOPPING INTRO / HERO */}
          <section className="relative isolate overflow-hidden rounded-[24px] border border-[#F7D9CE] bg-gradient-to-br from-[#FFF1E8] via-[#FFF8F2] to-[#FFE3D8] px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#FF5A36]/10"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-32 right-[20%] h-64 w-64 rounded-full bg-white/70"
            />

            <div className="relative z-10 grid items-center gap-7 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="max-w-[690px]">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD2C5] bg-white/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[#9F2D18] shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-[#FF5A36]" />
                  ReMarket · Find it nearby
                </div>

                <h1 className="mt-4 max-w-[620px] text-[30px] font-extrabold leading-[1.08] tracking-tight text-[#401B13] sm:text-[40px] lg:text-[48px]">
                  Discover products.
                  <span className="block text-[#FF5A36]">Find them closer.</span>
                </h1>
                <p className="mt-3 max-w-[510px] text-sm leading-6 text-[#66564C] sm:text-base sm:leading-7">
                  Search for what you need, compare listed prices and check availability around your area.
                </p>

                <form
                  onSubmit={submitHomepageSearch}
                  role="search"
                  className="mt-5 flex h-[54px] w-full max-w-[620px] items-center rounded-full border border-[#F0D8CE] bg-white p-1.5 shadow-[0_8px_24px_rgba(159,45,24,0.08)] transition focus-within:border-[#FF9A81] focus-within:ring-2 focus-within:ring-[#FF5A36]/10"
                >
                  <Search className="ml-3 h-5 w-5 shrink-0 text-[#81766C]" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="What are you looking for?"
                    aria-label="Search products"
                    maxLength={100}
                    className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#17202A] outline-none placeholder:text-[#91877E]"
                  />
                  <button
                    type="submit"
                    disabled={!searchQuery.trim()}
                    className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-[#FF5A36] px-4 text-xs font-bold text-white transition hover:bg-[#E94A28] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
                  >
                    Search <ArrowRight className="h-4 w-4" />
                  </button>
                </form>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-medium text-[#756B61] sm:text-xs">
                  <span className="inline-flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-[#FF5A36]" /> Search products</span>
                  <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#FF5A36]" /> Explore nearby options</span>
                  <span className="inline-flex items-center gap-1.5"><ShoppingCart className="h-3.5 w-3.5 text-[#FF5A36]" /> Add to cart</span>
                </div>
              </div>

              {/* REAL PRODUCT PREVIEW: no invented promotion or stock claim */}
              <div className="relative hidden min-h-[250px] items-center justify-center lg:flex">
                <div className="absolute h-[250px] w-[250px] rounded-full bg-[#FFC4AE]/50" />
                {heroProduct ? (
                  <Link
                    href={`/product/${encodeURIComponent(heroProduct.id)}`}
                    className="absolute left-[7%] top-[8%] z-10 w-[205px] rotate-[-5deg] overflow-hidden rounded-2xl border border-white bg-white p-2 shadow-[0_18px_45px_rgba(104,53,35,0.18)] transition hover:rotate-0"
                  >
                    <div className="aspect-square overflow-hidden rounded-xl bg-[#FCFAF6]">
                      {heroProduct.imageUrl ? (
                        <img src={heroProduct.imageUrl} alt={heroProduct.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[#C3B9AE]"><Package className="h-12 w-12" /></div>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-1 text-[10px] font-semibold text-[#514840]">{heroProduct.name}</p>
                    <p className="mt-1 text-sm font-extrabold text-[#9F2D18]">{heroProduct.price !== null ? formatNaira(heroProduct.price) : "View product"}</p>
                  </Link>
                ) : (
                  <div className="absolute left-[7%] top-[8%] flex h-[205px] w-[205px] rotate-[-5deg] items-center justify-center rounded-2xl border border-white bg-white text-[#FF5A36] shadow-lg">
                    <Package className="h-16 w-16" />
                  </div>
                )}

                {secondaryHeroProduct ? (
                  <Link
                    href={`/product/${encodeURIComponent(secondaryHeroProduct.id)}`}
                    className="absolute bottom-[5%] right-[4%] z-20 w-[155px] rotate-[6deg] overflow-hidden rounded-2xl border border-white bg-white p-2 shadow-[0_16px_36px_rgba(104,53,35,0.15)] transition hover:rotate-0"
                  >
                    <div className="aspect-square overflow-hidden rounded-xl bg-[#FCFAF6]">
                      {secondaryHeroProduct.imageUrl ? (
                        <img src={secondaryHeroProduct.imageUrl} alt={secondaryHeroProduct.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[#C3B9AE]"><Package className="h-10 w-10" /></div>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-1 text-[10px] font-semibold text-[#514840]">{secondaryHeroProduct.name}</p>
                    <p className="mt-1 text-xs font-extrabold text-[#9F2D18]">{secondaryHeroProduct.price !== null ? formatNaira(secondaryHeroProduct.price) : "View product"}</p>
                  </Link>
                ) : (
                  <div className="absolute bottom-[5%] right-[4%] flex h-[155px] w-[155px] rotate-[6deg] items-center justify-center rounded-2xl border border-white bg-white text-[#9F2D18] shadow-lg">
                    <ShoppingCart className="h-12 w-12" />
                  </div>
                )}
                <span className="absolute right-[8%] top-[4%] z-30 rounded-full border border-[#FFD2C5] bg-white px-3 py-2 text-[10px] font-bold text-[#9F2D18] shadow-md">
                  Fresh finds
                </span>
              </div>
            </div>
          </section>

          {/* CATEGORY DISCOVERY */}
          <section className="mt-7 sm:mt-9" aria-labelledby="categories-heading">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#9F2D18]">Explore the catalogue</p>
                <h2 id="categories-heading" className="mt-1 text-lg font-extrabold tracking-tight text-[#401B13] sm:text-xl">
                  Shop by category
                </h2>
              </div>
              <Link href="/shop" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#9F2D18] hover:text-[#FF5A36]">
                All products <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {categoriesLoading ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div key={index} className="h-[105px] animate-pulse rounded-xl border border-[#EAE6DF] bg-white" />
                ))}
              </div>
            ) : categories.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 lg:grid-cols-10">
                {categories.map((category) => (
                  <CategoryTile key={category.id} category={category} />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-4">
                <p className="text-xs text-[#756B61]">Browse the full product catalogue to explore available categories.</p>
                <Link href="/shop" className="text-xs font-bold text-[#9F2D18]">Browse products <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link>
              </div>
            )}
          </section>

          {/* REAL DISCOUNTS ONLY: uses originalPrice when it exceeds price */}
          {products.some(
            (product) => getDiscountPercentage(product) !== null,
          ) && (
            <section className="mt-8" aria-labelledby="special-prices-heading">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#9F2D18]">Marked-down listings</p>
                  <h2 id="special-prices-heading" className="mt-1 text-lg font-extrabold tracking-tight text-[#401B13] sm:text-xl">
                    Special prices
                  </h2>
                  <p className="mt-1 text-[11px] text-[#756B61] sm:text-xs">
                    Products with a listed original price above their current price.
                  </p>
                </div>
                <Link href="/shop" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#9F2D18] hover:text-[#FF5A36]">
                  Explore <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {products
                  .filter((product) => getDiscountPercentage(product) !== null)
                  .slice(0, 6)
                  .map((product) => (
                    <ProductCard
                      key={`price-highlight-${product.id}`}
                      product={product}
                      adding={addingProductId === product.id}
                      feedback={cartFeedback}
                      onAddToCart={handleAddToCart}
                    />
                  ))}
              </div>
            </section>
          )}

          {/* RECENTLY ADDED PRODUCTS */}
          <section id="recent-products" className="mt-8 scroll-mt-24 sm:mt-10" aria-labelledby="recent-products-heading">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFD9CE] bg-[#FFF1ED] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-[#9F2D18]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" /> Recently listed
                </div>
                <h2 id="recent-products-heading" className="text-xl font-extrabold tracking-tight text-[#401B13] sm:text-2xl">
                  Fresh finds for you
                </h2>
                <p className="mt-1 text-[11px] text-[#756B61] sm:text-sm">
                  The latest products added to ReMarket.
                </p>
              </div>
              <Link href="/shop" className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFF1ED]">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {productsLoading && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div key={`home-product-skeleton-${index}`} className="overflow-hidden rounded-xl border border-[#EAE6DF] bg-white">
                    <div className="aspect-square animate-pulse bg-[#F2EEE9]" />
                    <div className="space-y-2 p-3">
                      <div className="h-3 w-4/5 animate-pulse rounded bg-[#F2EEE9]" />
                      <div className="h-3 w-2/5 animate-pulse rounded bg-[#F2EEE9]" />
                      <div className="h-8 w-full animate-pulse rounded-lg bg-[#F2EEE9]" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!productsLoading && productsFailed && (
              <div className="rounded-2xl border border-[#F2D2C9] bg-[#FFF7F4] px-5 py-9 text-center">
                <p className="text-sm font-bold text-[#9F2D18]">We couldn't load products.</p>
                <p className="mt-1 text-xs text-[#756B61]">Please try again.</p>
                <button type="button" onClick={retryProducts} className="mt-4 rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]">
                  Try again
                </button>
              </div>
            )}

            {!productsLoading && !productsFailed && products.length > 0 && (
              <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
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
              <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm">
                  <Package className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-bold text-[#17202A]">No products to display yet</p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#756B61]">
                  New products will appear here when they are published.
                </p>
                <Link href="/shop" className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28]">
                  Explore products <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </section>

          {/* RE-MARKET VALUE / DISCOVERY STRIP */}
          <section className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-[#EEE8E1] bg-[#FCFAF6] p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]"><Search className="h-5 w-5" /></span>
              <div><p className="text-xs font-bold text-[#514840]">Search products</p><p className="mt-0.5 text-[10px] leading-4 text-[#81766D]">Find items by name or category.</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[#EEE8E1] bg-[#FCFAF6] p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]"><MapPin className="h-5 w-5" /></span>
              <div><p className="text-xs font-bold text-[#514840]">Find it nearby</p><p className="mt-0.5 text-[10px] leading-4 text-[#81766D]">Explore products by area.</p></div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[#EEE8E1] bg-[#FCFAF6] p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]"><ShoppingCart className="h-5 w-5" /></span>
              <div><p className="text-xs font-bold text-[#514840]">Build your cart</p><p className="mt-0.5 text-[10px] leading-4 text-[#81766D]">Keep selected products together.</p></div>
            </div>
          </section>

          {/* INVITE / SHARE */}
          <section className="relative mt-8 overflow-hidden rounded-[22px] bg-gradient-to-r from-[#FF713F] via-[#FF5A36] to-[#F04B2B] px-5 py-6 text-white shadow-[0_12px_30px_rgba(255,90,54,0.14)] sm:mt-10 sm:px-8 sm:py-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border-[28px] border-white/10" />
            <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
                  <Share2 className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">Good finds are worth sharing</h2>
                  <p className="mt-1 max-w-lg text-xs leading-5 text-white/90 sm:text-sm">
                    Share ReMarket and help more people discover products around them.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleShareReMarket()}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-xs font-extrabold text-[#9F2D18] transition hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF5A36]"
              >
                Share ReMarket <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            {shareFeedback && <p role="status" className="relative z-10 mt-3 text-xs text-white">{shareFeedback}</p>}
          </section>

          <footer className="mt-8 flex items-center justify-center gap-3 pb-3 text-[10px] text-[#9B9188]">
            <span className="h-px w-12 bg-[#EAE6DF]" />
            <span>ReMarket · Find it nearby</span>
            <span className="h-px w-12 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
