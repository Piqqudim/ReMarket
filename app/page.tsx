"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Package,
  Share2,
  ShoppingBag,
  Sparkles,
  Wrench,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

type DiscoveryMode = "ALL" | "PRODUCTS" | "SERVICES";

type RecentProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
  imageUrl: string | null;
  category: string | null;
  businessName: string | null;
};

type RecentService = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  imageUrl: string | null;
  category: string | null;
  businessName: string | null;
};

type JsonResult = Record<string, unknown> | null;

type FeedResult = {
  data: JsonResult;
  failed: boolean;
};

const PRODUCT_FEED_URL =
  "/api/recent-products?page=1&pageSize=8";

const SERVICE_FEED_URL =
  "/api/recent-services?page=1&pageSize=8";

const MAX_HOME_PRODUCTS = 8;
const MAX_HOME_SERVICES = 8;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const cleaned = value.trim();
  return cleaned || null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value;
}

function parseAvailability(
  value: unknown,
): RecentProduct["availability"] {
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
  if (typeof value === "string") {
    return cleanString(value);
  }

  if (isRecord(value)) {
    return cleanString(value.name);
  }

  return null;
}

function parseRecentProduct(
  value: unknown,
): RecentProduct | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }

  const business = isRecord(value.business)
    ? value.business
    : null;

  return {
    id: value.id,
    name: value.name,
    description: cleanString(value.description),
    price: parseOptionalNumber(value.price),
    priceMin: parseOptionalNumber(value.priceMin),
    priceMax: parseOptionalNumber(value.priceMax),
    availability: parseAvailability(value.availability),
    imageUrl: cleanString(value.imageUrl),
    category: parseCategoryName(value.category),
    businessName: business
      ? cleanString(business.name)
      : cleanString(value.businessName),
  };
}

function parseRecentService(
  value: unknown,
): RecentService | null {
  if (!isRecord(value)) return null;

  const id =
    typeof value.id === "string" ? value.id : null;

  const name =
    cleanString(value.name) ??
    cleanString(value.title);

  if (!id || !name) return null;

  const business = isRecord(value.business)
    ? value.business
    : null;

  return {
    id,
    name,
    description: cleanString(value.description),
    price: parseOptionalNumber(value.price),
    priceMin: parseOptionalNumber(value.priceMin),
    priceMax: parseOptionalNumber(value.priceMax),
    imageUrl:
      cleanString(value.imageUrl) ??
      cleanString(value.coverImage),
    category: parseCategoryName(value.category),
    businessName: business
      ? cleanString(business.name)
      : cleanString(value.businessName),
  };
}

async function fetchHomepageJson(
  url: string,
  signal: AbortSignal,
  label: string,
): Promise<FeedResult> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal,
    });

    // A not-yet-created feed endpoint is treated separately
    // from a server error.
    if (response.status === 404) {
      return {
        data: null,
        failed: false,
      };
    }

    if (!response.ok) {
      console.error(
        `${label} returned HTTP ${response.status}.`,
      );

      return {
        data: null,
        failed: true,
      };
    }

    const data: unknown = await response.json();

    if (!isRecord(data)) {
      return {
        data: null,
        failed: true,
      };
    }

    return {
      data,
      failed: false,
    };
  } catch (error) {
    if (!signal.aborted) {
      console.error(`Failed to load ${label}:`, error);
    }

    return {
      data: null,
      failed: !signal.aborted,
    };
  }
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function formatPrice(
  listing: {
    price: number | null;
    priceMin: number | null;
    priceMax: number | null;
  },
  fallback: string,
): string {
  if (listing.price !== null) {
    return formatNaira(listing.price);
  }

  if (
    listing.priceMin !== null &&
    listing.priceMax !== null
  ) {
    if (listing.priceMin === listing.priceMax) {
      return formatNaira(listing.priceMin);
    }

    return `${formatNaira(listing.priceMin)} – ${formatNaira(listing.priceMax)}`;
  }

  if (listing.priceMin !== null) {
    return `From ${formatNaira(listing.priceMin)}`;
  }

  if (listing.priceMax !== null) {
    return `Up to ${formatNaira(listing.priceMax)}`;
  }

  return fallback;
}

function ProductPrice({
  product,
}: {
  product: RecentProduct;
}) {
  return (
    <p className="mt-2 line-clamp-1 text-[11px] font-extrabold text-[#9F2D18] sm:text-sm">
      {formatPrice(product, "Price unavailable")}
    </p>
  );
}

function ServicePrice({
  service,
}: {
  service: RecentService;
}) {
  return (
    <p className="mt-2 line-clamp-1 text-[11px] font-extrabold text-[#9F2D18] sm:text-sm">
      {formatPrice(service, "Contact for price")}
    </p>
  );
}

export default function HomePage() {
  const [discoveryMode, setDiscoveryMode] =
    useState<DiscoveryMode>("ALL");

  const [products, setProducts] =
    useState<RecentProduct[]>([]);

  const [services, setServices] =
    useState<RecentService[]>([]);

  const [productsLoading, setProductsLoading] =
    useState(true);

  const [servicesLoading, setServicesLoading] =
    useState(true);

  const [productsFailed, setProductsFailed] =
    useState(false);

  const [servicesFailed, setServicesFailed] =
    useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  const [shareFeedback, setShareFeedback] =
    useState("");

  /*
   * -----------------------------------------
   * LOAD PRODUCT AND SERVICE FEEDS
   * -----------------------------------------
   */
  useEffect(() => {
    const controller = new AbortController();

    setProductsLoading(true);
    setServicesLoading(true);
    setProductsFailed(false);
    setServicesFailed(false);

    async function loadHomepageFeeds() {
      const [productResult, serviceResult] =
        await Promise.all([
          fetchHomepageJson(
            PRODUCT_FEED_URL,
            controller.signal,
            "homepage products",
          ),
          fetchHomepageJson(
            SERVICE_FEED_URL,
            controller.signal,
            "homepage services",
          ),
        ]);

      if (controller.signal.aborted) return;

      const rawProducts = Array.isArray(
        productResult.data?.products,
      )
        ? productResult.data.products
        : [];

      const parsedProducts = rawProducts
        .map(parseRecentProduct)
        .filter(
          (item): item is RecentProduct =>
            item !== null,
        )
        .slice(0, MAX_HOME_PRODUCTS);

      const rawServices = Array.isArray(
        serviceResult.data?.services,
      )
        ? serviceResult.data.services
        : [];

      const parsedServices = rawServices
        .map(parseRecentService)
        .filter(
          (item): item is RecentService =>
            item !== null,
        )
        .slice(0, MAX_HOME_SERVICES);

      setProducts(parsedProducts);
      setServices(parsedServices);

      setProductsFailed(productResult.failed);
      setServicesFailed(serviceResult.failed);

      setProductsLoading(false);
      setServicesLoading(false);
    }

    void loadHomepageFeeds();

    return () => {
      controller.abort();
    };
  }, [reloadKey]);

  /*
   * -----------------------------------------
   * SHARE REMARKET
   * -----------------------------------------
   */
  async function handleShareReMarket() {
    const shareUrl = "https://remarket.com.ng";

    const shareData = {
      title: "ReMarket — Find it nearby",
      text: "Discover products and services around you on ReMarket.",
      url: shareUrl,
    };

    setShareFeedback("");

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share(shareData);

        setShareFeedback("Thanks for sharing ReMarket.");
        return;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);

        setShareFeedback(
          "ReMarket link copied. Share it with someone.",
        );

        return;
      }
    } catch (error) {
      console.error("Unable to copy ReMarket link:", error);
    }

    setShareFeedback(
      `Copy this website address to share: ${shareUrl}`,
    );
  }

  /*
   * -----------------------------------------
   * DISCOVERY FILTERS
   * -----------------------------------------
   */
  const discoveryFilters: {
    label: string;
    value: DiscoveryMode;
  }[] = [
    { label: "All", value: "ALL" },
    { label: "Products", value: "PRODUCTS" },
    { label: "Services", value: "SERVICES" },
  ];

  const showProducts =
    discoveryMode === "ALL" ||
    discoveryMode === "PRODUCTS";

  const showServices =
    discoveryMode === "ALL" ||
    discoveryMode === "SERVICES";

  function retryFeeds() {
    setReloadKey((current) => current + 1);
  }

  return (
    <>
      <SiteHeader searchMode={discoveryMode} />

      <main
        id="main-content"
        className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-8"
      >
        <div className="mx-auto max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-7 xl:px-10">
          {/* =====================================
              HERO
             ===================================== */}
          <section className="relative isolate overflow-hidden rounded-[26px] border border-[#FFE0D5] bg-gradient-to-r from-[#FFF0E7] via-[#FFF4EC] to-[#FFE0D4] px-5 py-7 sm:px-8 sm:py-9 lg:min-h-[300px] lg:px-11 lg:py-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-28 hidden h-[420px] w-[420px] rounded-full bg-[#FF5A36]/10 lg:block"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-8 bottom-[-170px] hidden h-[330px] w-[330px] rounded-full bg-[#FF8A65]/20 lg:block"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-[18%] top-12 hidden h-16 w-16 rotate-12 rounded-2xl border border-[#FF8B6E]/30 lg:block"
            />

            <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="max-w-[680px]">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FFD1C5] bg-white/80 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#9F2D18] shadow-sm sm:text-[11px]">
                  <Sparkles
                    className="h-3.5 w-3.5 text-[#FF5A36]"
                    aria-hidden="true"
                  />
                  Discover on ReMarket
                </div>

                <h1 className="max-w-[620px] text-[32px] font-extrabold leading-[1.08] tracking-tight text-[#401B13] sm:text-[42px] lg:text-[48px]">
                  Discover Local
                  <span className="block text-[#FF5A36]">
                    Products &amp; Services
                  </span>
                </h1>

                <p className="mt-4 max-w-[510px] text-sm leading-6 text-[#66564C] sm:text-base sm:leading-7">
                  Shop what you need. Book the services
                  you love. Discover more possibilities
                  around you with ReMarket.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {discoveryFilters.map((filter) => {
                    const isActive =
                      discoveryMode === filter.value;

                    return (
                      <button
                        key={filter.value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() =>
                          setDiscoveryMode(filter.value)
                        }
                        className={`inline-flex min-h-10 items-center justify-center rounded-full px-5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 ${
                          isActive
                            ? "bg-[#FF5A36] text-white shadow-sm"
                            : "border border-[#F3D6CA] bg-white/85 text-[#4D342B] hover:border-[#FF9A81] hover:bg-white"
                        }`}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Desktop decorative visual */}
              <div
                aria-hidden="true"
                className="relative hidden min-h-[220px] items-center justify-center lg:flex"
              >
                <div className="absolute h-[240px] w-[240px] rounded-full bg-[#FFB18F]/35" />

                <div className="relative flex h-[170px] w-[170px] items-center justify-center rounded-[42px] border border-white/80 bg-white/75 shadow-[0_20px_50px_rgba(159,45,24,0.10)] backdrop-blur">
                  <div className="flex h-[110px] w-[110px] items-center justify-center rounded-[32px] bg-[#FF5A36] text-white shadow-lg">
                    <ShoppingBag className="h-14 w-14" />
                  </div>
                </div>

                <div className="absolute right-[10%] top-[5%] flex h-16 w-16 items-center justify-center rounded-2xl border border-[#FFD1C5] bg-white text-[#9F2D18] shadow-md">
                  <Wrench className="h-8 w-8" />
                </div>

                <div className="absolute bottom-[2%] left-[12%] flex h-16 w-16 items-center justify-center rounded-2xl border border-[#FFD1C5] bg-white text-[#9F2D18] shadow-md">
                  <Package className="h-8 w-8" />
                </div>

                <span className="absolute right-[7%] top-[55%] h-3 w-3 rounded-full bg-[#FF5A36]" />
                <span className="absolute left-[20%] top-[10%] h-2.5 w-2.5 rounded-full bg-[#FF9A81]" />
              </div>
            </div>
          </section>

          {/* =====================================
              RECENT PRODUCTS
             ===================================== */}
          {showProducts && (
            <section
              id="recent-products"
              className="mt-8 scroll-mt-24 sm:mt-10"
              aria-labelledby="recent-products-heading"
            >
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFD9CE] bg-[#FFF1ED] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#9F2D18]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />
                    Discover products
                  </div>

                  <h2
                    id="recent-products-heading"
                    className="text-xl font-extrabold tracking-tight text-[#401B13] sm:text-2xl"
                  >
                    Recently Added Products
                  </h2>

                  <p className="mt-1 text-xs text-[#756B61] sm:text-sm">
                    Explore products listed on ReMarket.
                  </p>
                </div>

                <Link
                  href="/shop"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFF1ED]"
                >
                  View all
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {productsLoading && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`product-skeleton-${index}`}
                      className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white"
                      aria-hidden="true"
                    >
                      <div className="aspect-square animate-pulse bg-[#F2EEE9]" />

                      <div className="space-y-2 p-3">
                        <div className="h-3 w-4/5 animate-pulse rounded bg-[#F2EEE9]" />
                        <div className="h-3 w-2/5 animate-pulse rounded bg-[#F2EEE9]" />
                        <div className="h-2.5 w-3/5 animate-pulse rounded bg-[#F2EEE9]" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!productsLoading && productsFailed && (
                <div className="rounded-2xl border border-[#F2D2C9] bg-[#FFF7F4] px-5 py-8 text-center">
                  <p className="text-sm font-bold text-[#9F2D18]">
                    We couldn't load products.
                  </p>

                  <p className="mt-1 text-xs text-[#756B61]">
                    Please try again.
                  </p>

                  <button
                    type="button"
                    onClick={retryFeeds}
                    className="mt-4 rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!productsLoading &&
                !productsFailed &&
                products.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {products.map((product) => (
                      <Link
                        key={product.id}
                        href={`/product/${product.id}`}
                        aria-label={`View ${product.name}`}
                        className="group min-w-0 overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_4px_18px_rgba(23,32,42,0.04)] transition hover:-translate-y-1 hover:border-[#FFD0C3] hover:shadow-[0_12px_28px_rgba(23,32,42,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                      >
                        <div className="relative aspect-square overflow-hidden bg-[#FCFAF6]">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#C3B9AE]">
                              <Package className="h-12 w-12" />
                            </div>
                          )}

                          {product.category && (
                            <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full border border-white/70 bg-white/95 px-2.5 py-1 text-[9px] font-bold text-[#9F2D18] shadow-sm">
                              {product.category}
                            </span>
                          )}
                        </div>

                        <div className="p-3 sm:p-3.5">
                          <p className="line-clamp-2 min-h-9 text-xs font-bold leading-4 text-[#17202A] transition group-hover:text-[#9F2D18] sm:text-sm">
                            {product.name}
                          </p>

                          <ProductPrice product={product} />

                          {product.availability === "UNAVAILABLE" && (
                            <span className="mt-2 inline-flex rounded-full bg-[#FEE2E2] px-2 py-1 text-[9px] font-semibold text-[#B42318]">
                              Unavailable
                            </span>
                          )}

                          {product.businessName && (
                            <p className="mt-2 truncate border-t border-[#F0ECE7] pt-2 text-[10px] text-[#756B61] sm:text-[11px]">
                              {product.businessName}
                            </p>
                          )}

                          <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#FF5A36] transition group-hover:gap-2">
                            View product
                            <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

              {!productsLoading &&
                !productsFailed &&
                products.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-9 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm">
                      <Package className="h-6 w-6" />
                    </div>

                    <p className="mt-3 text-sm font-bold text-[#17202A]">
                      No products to display yet
                    </p>

                    <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#756B61]">
                      Products will appear here as businesses
                      publish their listings.
                    </p>

                    <Link
                      href="/shop"
                      className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28]"
                    >
                      Browse products
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
            </section>
          )}

          {/* =====================================
              RECENT SERVICES
             ===================================== */}
          {showServices && (
            <section
              id="recent-services"
              className="mt-9 scroll-mt-24 sm:mt-11"
              aria-labelledby="recent-services-heading"
            >
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFD9CE] bg-[#FFF1ED] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#9F2D18]">
                    <Wrench className="h-3 w-3" aria-hidden="true" />
                    Find a service
                  </div>

                  <h2
                    id="recent-services-heading"
                    className="text-xl font-extrabold tracking-tight text-[#401B13] sm:text-2xl"
                  >
                    Recently Added Services
                  </h2>

                  <p className="mt-1 text-xs text-[#756B61] sm:text-sm">
                    Find service providers for the things
                    you need done.
                  </p>
                </div>

                <Link
                  href="/services"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFF1ED]"
                >
                  View all
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {servicesLoading && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`service-skeleton-${index}`}
                      className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white"
                      aria-hidden="true"
                    >
                      <div className="aspect-[4/3] animate-pulse bg-[#F2EEE9]" />

                      <div className="space-y-2 p-3">
                        <div className="h-3 w-4/5 animate-pulse rounded bg-[#F2EEE9]" />
                        <div className="h-3 w-2/5 animate-pulse rounded bg-[#F2EEE9]" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!servicesLoading && servicesFailed && (
                <div className="rounded-2xl border border-[#F2D2C9] bg-[#FFF7F4] px-5 py-8 text-center">
                  <p className="text-sm font-bold text-[#9F2D18]">
                    We couldn't load services.
                  </p>

                  <p className="mt-1 text-xs text-[#756B61]">
                    Please try again.
                  </p>

                  <button
                    type="button"
                    onClick={retryFeeds}
                    className="mt-4 rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28]"
                  >
                    Try again
                  </button>
                </div>
              )}

              {!servicesLoading &&
                !servicesFailed &&
                services.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {services.map((service) => (
                      <Link
                        key={service.id}
                        href={`/services/${service.id}`}
                        aria-label={`View ${service.name}`}
                        className="group min-w-0 overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_4px_18px_rgba(23,32,42,0.04)] transition hover:-translate-y-1 hover:border-[#FFD0C3] hover:shadow-[0_12px_28px_rgba(23,32,42,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                      >
                        <div className="relative aspect-[4/3] overflow-hidden bg-[#FCFAF6]">
                          {service.imageUrl ? (
                            <img
                              src={service.imageUrl}
                              alt={service.name}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#C3B9AE]">
                              <Wrench className="h-11 w-11" />
                            </div>
                          )}

                          {service.category && (
                            <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full border border-white/70 bg-white/95 px-2.5 py-1 text-[9px] font-bold text-[#9F2D18] shadow-sm">
                              {service.category}
                            </span>
                          )}
                        </div>

                        <div className="p-3 sm:p-3.5">
                          <p className="line-clamp-2 min-h-9 text-xs font-bold leading-4 text-[#17202A] transition group-hover:text-[#9F2D18] sm:text-sm">
                            {service.name}
                          </p>

                          <ServicePrice service={service} />

                          {service.businessName && (
                            <p className="mt-2 truncate border-t border-[#F0ECE7] pt-2 text-[10px] text-[#756B61] sm:text-[11px]">
                              {service.businessName}
                            </p>
                          )}

                          <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#FF5A36] transition group-hover:gap-2">
                            View service
                            <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

              {!servicesLoading &&
                !servicesFailed &&
                services.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-9 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm">
                      <Wrench className="h-6 w-6" />
                    </div>

                    <p className="mt-3 text-sm font-bold text-[#17202A]">
                      No services to display yet
                    </p>

                    <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#756B61]">
                      Services will appear here as providers
                      publish their listings.
                    </p>

                    <Link
                      href="/services"
                      className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28]"
                    >
                      Explore services
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}
            </section>
          )}

          {/* =====================================
              INVITE / SHARE
             ===================================== */}
          <section className="relative mt-9 overflow-hidden rounded-[22px] bg-gradient-to-r from-[#FF713F] via-[#FF5A36] to-[#F04B2B] px-5 py-6 text-white shadow-[0_12px_30px_rgba(255,90,54,0.14)] sm:mt-11 sm:px-8 sm:py-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border-[28px] border-white/10"
            />

            <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20">
                  <Share2 className="h-7 w-7" />
                </div>

                <div>
                  <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">
                    Invite Friends, Grow ReMarket
                  </h2>

                  <p className="mt-1 max-w-lg text-xs leading-5 text-white/90 sm:text-sm">
                    Share ReMarket and help more people
                    discover products and services nearby.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleShareReMarket()}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-xs font-extrabold text-[#9F2D18] transition hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF5A36]"
              >
                Invite Now
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {shareFeedback && (
              <p
                role="status"
                className="relative z-10 mt-3 text-xs text-white"
              >
                {shareFeedback}
              </p>
            )}
          </section>

          {/* =====================================
              FOOTER
             ===================================== */}
          <footer className="mt-9 flex items-center justify-center gap-3 pb-3 text-[10px] text-[#9B9188]">
            <span className="h-px w-12 bg-[#EAE6DF]" />
            <span>
              ReMarket · Shop. Discover. Support Local.
            </span>
            <span className="h-px w-12 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>

      <MobileBottomNav />
    </>
  );
}