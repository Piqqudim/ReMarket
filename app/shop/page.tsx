"use client";

import {
  useEffect,
  useState,

} from "react";

import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  UserCircle,
  Store,
  MapPin,
  Search,
  Bookmark,
  Package,
  ArrowRight,
  Shirt,
  Plug,
  Utensils,
  Sparkles,
  Layers3,
  Briefcase,
  MoreHorizontal,
} from "lucide-react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  getSavedBusinesses,
  isBusinessSaved,
  saveBusiness,
  removeSavedBusiness,
  SAVED_BUSINESSES_CHANGED_EVENT,
} from "@/lib/saved";

type Category = {
  id: string;
  name: string;
};

type ProductImage = {
  id: string;
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  imageUrl: string | null;
  keywords: string[];
  images: ProductImage[];
};

type Business = {
  id: string;
  name: string;
  ownerName?: string | null;
  description: string | null;
  imageUrl: string | null;

  location: {
    id: string;
    area: string;
    lat: number | null;
    long: number | null;
  } | null;

  area?: string;

  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";

  verification:
    | "VERIFIED"
    | "UNVERIFIED";

  categories: {
    category: Category;
  }[];

  products: Product[];

  socialLinks: {
    id: string;
    platform: string;
    handle: string;
  }[];
};

const CATEGORY_STYLE: Record<
  string,
  {
    bg: string;
    icon: React.ReactNode;
  }
> = {
  Fashion: {
    bg: "#FFE0D6",
    icon: <Shirt className="h-5 w-5" />,
  },

  Electronics: {
    bg: "#DDF5EA",
    icon: <Plug className="h-5 w-5" />,
  },

  Food: {
    bg: "#FFF0C7",
    icon: <Utensils className="h-5 w-5" />,
  },

  Beauty: {
    bg: "#E7E5FF",
    icon: <Sparkles className="h-5 w-5" />,
  },

  Textiles: {
    bg: "#F9DCE8",
    icon: <Layers3 className="h-5 w-5" />,
  },

  Services: {
    bg: "#E4E9EF",
    icon: <Briefcase className="h-5 w-5" />,
  },
};

const NAV_ITEMS = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Shop",
    href: "/shop",
    icon: ShoppingBag,
  },
  {
    label: "Requests",
    href: "/my-requests",
    icon: ClipboardList,
  },
  {
    label: "Saved",
    href: "/saved",
    icon: Heart,
  },
];

function getCategoryStyle(
  name: string
) {
  return (
    CATEGORY_STYLE[name] ?? {
      bg: "#EEF1F4",
      icon: (
        <MoreHorizontal className="h-5 w-5" />
      ),
    }
  );
}

function getProductImage(
  product: Product
): string | null {
  return (
    product.images?.[0]?.url ??
    product.imageUrl ??
    null
  );
}

function formatPrice(
  product: Product
): string {
  if (
    product.price !== null
  ) {
    return `₦${product.price.toLocaleString()}`;
  }

  if (
    product.priceMin !==
      null &&
    product.priceMax !==
      null
  ) {
    return `₦${product.priceMin.toLocaleString()} - ₦${product.priceMax.toLocaleString()}`;
  }

  if (
    product.priceMin !==
    null
  ) {
    return `From ₦${product.priceMin.toLocaleString()}`;
  }

  if (
    product.priceMax !==
    null
  ) {
    return `Up to ₦${product.priceMax.toLocaleString()}`;
  }

  return "Ask seller";
}

export default function ShopPage() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const initialQuery =
    searchParams.get("q") ??
    "";

  const initialCategory =
    searchParams.get(
      "category"
    ) ?? "";

  const [query, setQuery] =
    useState(initialQuery);

  const [category, setCategory] =
    useState(initialCategory);

  const [categories, setCategories] =
    useState<Category[]>(
      []
    );

  const [businesses, setBusinesses] =
    useState<Business[]>(
      []
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [savedBusinesses, setSavedBusinesses] =
    useState<
      Record<string, boolean>
    >({});

  useEffect(() => {
    setQuery(initialQuery);
    setCategory(initialCategory);
  }, [
    initialQuery,
    initialCategory,
  ]);

  useEffect(() => {
    function syncSaved() {
      const saved =
        getSavedBusinesses();

      const next: Record<
        string,
        boolean
      > = {};

      for (const business of saved) {
        next[business.id] = true;
      }

      setSavedBusinesses(next);
    }

    syncSaved();

    window.addEventListener(
      SAVED_BUSINESSES_CHANGED_EVENT,
      syncSaved
    );

    return () => {
      window.removeEventListener(
        SAVED_BUSINESSES_CHANGED_EVENT,
        syncSaved
      );
    };
  }, []);

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadCategories() {
      try {
        const response =
          await fetch(
            "/api/categories",
            {
              cache:
                "no-store",
              signal:
                controller.signal,
            }
          );

        if (!response.ok) {
          throw new Error(
            "Unable to load categories."
          );
        }

        const data =
          await response.json();

        setCategories(
          Array.isArray(
            data.categories
          )
            ? data.categories
            : []
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "Shop categories error:",
          error
        );
      }
    }

    void loadCategories();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadBusinesses() {
      setLoading(true);
      setError("");

      try {
        const params =
          new URLSearchParams();

        if (
          initialQuery.trim()
        ) {
          params.set(
            "q",
            initialQuery.trim()
          );
        }

        if (initialCategory) {
          params.set(
            "category",
            initialCategory
          );
        }

        const response =
          await fetch(
            `/api/browse?${params.toString()}`,
            {
              cache:
                "no-store",
              signal:
                controller.signal,
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            typeof data?.error ===
              "string"
              ? data.error
              : "Unable to load businesses."
          );
        }

        setBusinesses(
          Array.isArray(
            data.businesses
          )
            ? data.businesses
            : []
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "Shop loading error:",
          error
        );

        setError(
          error instanceof Error
            ? error.message
            : "Unable to load businesses."
        );
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }

    void loadBusinesses();

    return () => {
      controller.abort();
    };
  }, [
    initialQuery,
    initialCategory,
  ]);

  function submitSearch(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const params =
      new URLSearchParams();

    if (query.trim()) {
      params.set(
        "q",
        query.trim()
      );
    }

    if (category) {
      params.set(
        "category",
        category
      );
    }

    const queryString =
      params.toString();

    router.push(
      queryString
        ? `/shop?${queryString}`
        : "/shop"
    );
  }

  function selectCategory(
    nextCategory: string
  ) {
    setCategory(nextCategory);

    const params =
      new URLSearchParams();

    if (query.trim()) {
      params.set(
        "q",
        query.trim()
      );
    }

    if (nextCategory) {
      params.set(
        "category",
        nextCategory
      );
    }

    const queryString =
      params.toString();

    router.push(
      queryString
        ? `/shop?${queryString}`
        : "/shop"
    );
  }

  function toggleSaved(
    business: Business
  ) {
    if (
      isBusinessSaved(
        business.id
      )
    ) {
      removeSavedBusiness(
        business.id
      );
      return;
    }

    const categoryName =
      business.categories?.[0]
        ?.category?.name ??
      "Services";

    saveBusiness({
      id: business.id,
      name: business.name,
      area:
        business.location
          ?.area ??
        business.area ??
        "Local",
      category:
        categoryName,
      verified:
        business.verification ===
        "VERIFIED",
      availability:
        business.availability,
      imageUrl:
        business.imageUrl,
    });
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED]">
      <div className="mx-auto min-h-screen w-full max-w-[1500px] px-3 py-3 sm:px-5 sm:py-5">
        <div className="min-h-[calc(100vh-24px)] overflow-hidden rounded-[18px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:rounded-[22px] lg:min-h-[calc(100vh-40px)]">

          <header className="flex h-[64px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6 lg:h-[66px]">
            <Link
              href="/"
              className="flex items-center gap-2.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                <Store className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-bold">
                  ReMarket
                </p>

                <p className="text-[10px] text-muted">
                  Find it nearby
                </p>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map(
                (item) => (
                  <button
                    key={
                      item.label
                    }
                    type="button"
                    onClick={() =>
                      router.push(
                        item.href
                      )
                    }
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    {
                      item.label
                    }
                  </button>
                )
              )}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/saved"
                  )
                }
                className="hidden h-9 w-9 items-center justify-center rounded-full hover:bg-gray-50 sm:flex"
                aria-label="Saved"
              >
                <Heart className="h-[19px] w-[19px] text-gray-700" />
              </button>

              <button
                type="button"
                className="hidden h-9 w-9 items-center justify-center rounded-full bg-gray-100 sm:flex"
                aria-label="Profile"
              >
                <UserCircle className="h-6 w-6 text-gray-700" />
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/request"
                  )
                }
                className="rounded-xl bg-[#FF5A36] px-3.5 py-2.5 text-[11px] font-bold text-white sm:px-4 sm:text-xs"
              >
                Request something
              </button>
            </div>
          </header>

          <div className="flex">
            <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 lg:block">
              <nav className="space-y-1">
                {NAV_ITEMS.map(
                  (item) => {
                    const Icon =
                      item.icon;

                    return (
                      <button
                        key={
                          item.label
                        }
                        type="button"
                        onClick={() =>
                          router.push(
                            item.href
                          )
                        }
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${
                          item.label ===
                          "Shop"
                            ? "bg-white text-[#9F2D18]"
                            : "text-gray-700"
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        {
                          item.label
                        }
                      </button>
                    );
                  }
                )}
              </nav>

              <div className="my-5 h-px bg-[#E7E2DB]" />

              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                Categories
              </p>

              <div className="mt-3 space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    selectCategory(
                      ""
                    )
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-medium ${
                    !category
                      ? "bg-white text-[#9F2D18]"
                      : "text-gray-700 hover:bg-white"
                  }`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100">
                    <Store className="h-4 w-4 text-gray-500" />
                  </span>

                  All
                </button>

                {categories
                  .slice(0, 6)
                  .map(
                    (item) => {
                      const style =
                        getCategoryStyle(
                          item.name
                        );

                      const active =
                        category ===
                        item.name;

                      return (
                        <button
                          key={
                            item.id
                          }
                          type="button"
                          onClick={() =>
                            selectCategory(
                              item.name
                            )
                          }
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${
                            active
                              ? "bg-white text-[#9F2D18]"
                              : "text-gray-700 hover:bg-white"
                          }`}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                            style={{
                              backgroundColor:
                                style.bg,
                            }}
                          >
                            <span className="scale-[0.65]">
                              {
                                style.icon
                              }
                            </span>
                          </span>

                          <span className="truncate text-xs font-medium">
                            {
                              item.name
                            }
                          </span>
                        </button>
                      );
                    }
                  )}
              </div>
            </aside>

            <div className="min-w-0 flex-1">
              <div className="px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-6 lg:pb-8">
                <section className="rounded-[18px] bg-[#FF5A36] px-5 py-6 text-white sm:px-7 sm:py-7">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                    Shop ReMarket
                  </p>

                  <h1 className="mt-2 text-[26px] font-bold sm:text-[30px]">
                    Find local sellers
                  </h1>

                  <p className="mt-2 max-w-[560px] text-xs leading-5 text-white/80 sm:text-sm">
                    Discover real businesses and what they sell.
                  </p>

                  <form
                    onSubmit={
                      submitSearch
                    }
                    className="mt-5 flex h-[48px] max-w-[720px] items-center rounded-full bg-white p-1.5"
                  >
                    <Search className="ml-3 h-[18px] w-[18px] text-gray-500" />

                    <input
                      value={query}
                      onChange={(
                        event
                      ) =>
                        setQuery(
                          event.target
                            .value
                        )
                      }
                      placeholder="What are you looking for?"
                      className="min-w-0 flex-1 bg-transparent px-3 text-xs text-gray-800 outline-none placeholder:text-gray-400"
                    />

                    <button
                      type="submit"
                      className="rounded-full bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white"
                    >
                      Search
                    </button>
                  </form>
                </section>

                <section className="mt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-[#17202A]">
                        {category
                          ? category
                          : "All businesses"}
                      </h2>

                      <p className="mt-0.5 text-xs text-muted">
                        {loading
                          ? "Loading businesses..."
                          : `${businesses.length} ${
                              businesses.length ===
                              1
                                ? "business"
                                : "businesses"
                            }`}
                      </p>
                    </div>
                  </div>
                </section>

                <section className="mt-4">
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                      {error}
                    </div>
                  )}

                  {loading && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        1,
                        2,
                        3,
                        4,
                      ].map(
                        (item) => (
                          <div
                            key={
                              item
                            }
                            className="h-[250px] animate-pulse rounded-xl border border-[#E8E4DE] bg-white"
                          />
                        )
                      )}
                    </div>
                  )}

                  {!loading &&
                    !error &&
                    businesses.length ===
                      0 && (
                      <div className="rounded-xl border border-[#E8E4DE] bg-white px-5 py-12 text-center">
                        <Search className="mx-auto h-8 w-8 text-gray-300" />

                        <p className="mt-3 text-sm font-semibold text-gray-700">
                          No businesses found
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          Try another search or category.
                        </p>
                      </div>
                    )}

                  {!loading &&
                    !error &&
                    businesses.length >
                      0 && (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {businesses.map(
                          (business) => {
                            const categoryName =
                              business.categories?.[0]
                                ?.category?.name ??
                              "Services";

                            const style =
                              getCategoryStyle(
                                categoryName
                              );

                            const saved =
                              Boolean(
                                savedBusinesses[
                                  business.id
                                ]
                              );

                            const product =
                              business.products?.[0] ??
                              null;

                            const productImage =
                              product
                                ? getProductImage(
                                    product
                                  )
                                : null;

                            return (
                              <article
                                key={
                                  business.id
                                }
                                className="overflow-hidden rounded-xl border border-[#E8E4DE] bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                              >
                                <Link
                                  href={`/business/${business.id}`}
                                  className="relative flex h-[116px] items-center justify-center overflow-hidden"
                                  style={{
                                    backgroundColor:
                                      style.bg,
                                  }}
                                >
                                  {business.imageUrl ? (
                                    <img
                                      src={
                                        business.imageUrl
                                      }
                                      alt={
                                        business.name
                                      }
                                      className="absolute inset-0 h-full w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/75">
                                      <Store className="h-7 w-7 text-gray-700" />
                                    </div>
                                  )}

                                  <span className="absolute right-3 top-3 rounded-full bg-[#DDF5EA] px-2.5 py-1 text-[9px] font-semibold text-[#137A59]">
                                    {business.availability ===
                                    "AVAILABLE"
                                      ? "Available"
                                      : "Active"}
                                  </span>
                                </Link>

                                <div className="p-3.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <Link
                                        href={`/business/${business.id}`}
                                        className="block truncate text-sm font-bold text-[#17202A] hover:text-[#9F2D18]"
                                      >
                                        {
                                          business.name
                                        }
                                      </Link>

                                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">
                                        <span>
                                          {
                                            categoryName
                                          }
                                        </span>

                                        <span>
                                          ·
                                        </span>

                                        <span className="flex min-w-0 items-center gap-1 truncate">
                                          <MapPin className="h-3 w-3 shrink-0" />
                                          {
                                            business
                                              .location
                                              ?.area ??
                                            "Local"
                                          }
                                        </span>
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      aria-label={
                                        saved
                                          ? `Remove ${business.name} from saved businesses`
                                          : `Save ${business.name}`
                                      }
                                      aria-pressed={
                                        saved
                                      }
                                      onClick={(
                                        event
                                      ) => {
                                        event.preventDefault();
                                        event.stopPropagation();

                                        toggleSaved(
                                          business
                                        );
                                      }}
                                      className={`shrink-0 ${
                                        saved
                                          ? "text-[#9F2D18]"
                                          : "text-gray-500 hover:text-[#9F2D18]"
                                      }`}
                                    >
                                      <Bookmark
                                        className="h-4 w-4"
                                        fill={
                                          saved
                                            ? "currentColor"
                                            : "none"
                                        }
                                      />
                                    </button>
                                  </div>

                                  <div className="mt-3 flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <Package className="h-4 w-4 text-gray-400" />

                                      <span className="text-[10px] font-semibold text-gray-600">
                                        {
                                          business.products.length
                                        }{" "}
                                        products
                                      </span>
                                    </div>
                                  </div>

                                  {product && (
                                    <div className="mt-3 border-t border-[#F0ECE6] pt-3">
                                      <div className="flex items-center gap-2.5">
                                        {productImage ? (
                                          <img
                                            src={
                                              productImage
                                            }
                                            alt={
                                              product.name
                                            }
                                            className="h-10 w-10 rounded-lg object-cover"
                                          />
                                        ) : (
                                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FCFAF6] text-gray-400">
                                            <Package className="h-4 w-4" />
                                          </div>
                                        )}

                                        <div className="min-w-0">
                                          <p className="truncate text-[10px] font-semibold text-gray-600">
                                            {
                                              product.name
                                            }
                                          </p>

                                          <p className="mt-1 text-[10px] text-gray-400">
                                            {formatPrice(
                                              product
                                            )}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  <Link
                                    href={`/business/${business.id}`}
                                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFF1ED] py-2.5 text-[11px] font-bold text-[#9F2D18]"
                                  >
                                    Browse
                                    <ArrowRight className="h-3.5 w-3.5" />
                                  </Link>
                                </div>
                              </article>
                            );
                          }
                        )}
                      </div>
                    )}
                </section>

                <footer className="mt-7 flex items-center justify-center gap-3 text-[10px] text-gray-400">
                  <span className="h-px w-16 bg-gray-200" />
                  <span>
                    ReMarket · Find it nearby
                  </span>
                  <span className="h-px w-16 bg-gray-200" />
                </footer>
              </div>
            </div>
          </div>

          <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(6px,safe-area-inset-bottom)] pt-1.5 backdrop-blur lg:hidden">
            <div className="mx-auto grid max-w-md grid-cols-4">
              {NAV_ITEMS.map(
                (item) => {
                  const Icon =
                    item.icon;

                  return (
                    <button
                      key={
                        item.label
                      }
                      type="button"
                      onClick={() =>
                        router.push(
                          item.href
                        )
                      }
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 ${
                        item.label ===
                        "Shop"
                          ? "text-[#9F2D18]"
                          : "text-gray-500"
                      }`}
                    >
                      <Icon className="h-[19px] w-[19px]" />

                      <span className="text-[9px] font-medium">
                        {
                          item.label
                        }
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}