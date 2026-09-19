// app/shop/page.tsx
"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Search,
  MapPin,
  ChevronRight,
  Shirt,
  Plug,
  Utensils,
  Sparkles,
  Layers3,
  Briefcase,
  MoreHorizontal,
  Store,
  Bookmark,
  CheckCircle2,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  availability?: string;
  imageUrl?: string | null;
};

type Business = {
  id: string;
  name: string;
  location?: {
    area?: string | null;
    address?: string | null;
  } | null;
  categories?: {
    category: {
      id: string;
      name: string;
    };
  }[];
  products?: Product[];
  verification?: string;
  availability?: string;
};

/* -------------------------------------------------------------------------- */
/* ReMarket category styling                                                  */
/* -------------------------------------------------------------------------- */

const CATEGORY_STYLE: Record<
  string,
  {
    bg: string;
    icon: ReactNode;
  }
> = {
  Fashion: {
    bg: "#FFE0D6",
    icon: <Shirt className="h-6 w-6" />,
  },

  Electronics: {
    bg: "#DDF5EA",
    icon: <Plug className="h-6 w-6" />,
  },

  Food: {
    bg: "#FFF0C7",
    icon: <Utensils className="h-6 w-6" />,
  },

  Beauty: {
    bg: "#E7E5FF",
    icon: <Sparkles className="h-6 w-6" />,
  },

  Textiles: {
    bg: "#F9DCE8",
    icon: <Layers3 className="h-6 w-6" />,
  },

  Services: {
    bg: "#E4E9EF",
    icon: <Briefcase className="h-6 w-6" />,
  },
};

function getCategoryStyle(name?: string) {
  if (!name) {
    return {
      bg: "#F1F1F1",
      icon: <MoreHorizontal className="h-6 w-6" />,
    };
  }

  return (
    CATEGORY_STYLE[name] ?? {
      bg: "#F1F1F1",
      icon: <MoreHorizontal className="h-6 w-6" />,
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatPrice(product: Product) {
  const min = product.priceMin ?? product.price;
  const max = product.priceMax ?? product.price;

  if (min == null && max == null) {
    return "Ask seller";
  }

  if (min != null && max != null && min !== max) {
    return `₦${min.toLocaleString()} - ₦${max.toLocaleString()}`;
  }

  return `₦${(min ?? max)!.toLocaleString()}`;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ShopPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQuery = searchParams.get("q") ?? "";
  const initialCategory = searchParams.get("category") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [categories, setCategories] = useState<Category[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);

  const [activeCategory, setActiveCategory] =
    useState(initialCategory);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCategories, setShowCategories] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Load categories                                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const response = await fetch("/api/categories", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load categories");
        }

        const data = await response.json();

        if (!cancelled) {
          setCategories(
            Array.isArray(data.categories)
              ? data.categories
              : []
          );
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
        }
      }
    }

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Load businesses                                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller = new AbortController();

    async function loadShop() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();

        if (query.trim()) {
          params.set("q", query.trim());
        }

        if (activeCategory) {
          params.set("category", activeCategory);
        }

        const response = await fetch(
          `/api/browse?${params.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error("Unable to load shop");
        }

        const data = await response.json();

        setBusinesses(
          Array.isArray(data.businesses)
            ? data.businesses
            : []
        );
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }

        setError(
          "We couldn't load the shop right now."
        );
      } finally {
        setLoading(false);
      }
    }

    loadShop();

    return () => {
      controller.abort();
    };
  }, [query, activeCategory]);

  /* ------------------------------------------------------------------------ */
  /* Search                                                                   */
  /* ------------------------------------------------------------------------ */

  function handleSearch(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (activeCategory) {
      params.set("category", activeCategory);
    }

    router.push(
      params.toString()
        ? `/shop?${params.toString()}`
        : "/shop"
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Category selection                                                       */
  /* ------------------------------------------------------------------------ */

  function selectCategory(category: string) {
    setActiveCategory(category);

    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    if (category) {
      params.set("category", category);
    }

    router.push(
      params.toString()
        ? `/shop?${params.toString()}`
        : "/shop"
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] px-2 py-2 sm:px-4 sm:py-4">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-[0_12px_40px_rgba(159,45,24,0.08)]">
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                           */}
        {/* ---------------------------------------------------------------- */}

        <header className="flex h-[66px] shrink-0 items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF5A36] text-sm font-black text-white">
              R
            </div>

            <div className="hidden sm:block">
              <div className="text-[17px] font-extrabold tracking-tight text-[#17202A]">
                ReMarket
              </div>

              <div className="text-[10px] font-medium text-[#8A8178]">
                Find it nearby
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 lg:flex">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/shop";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 text-sm font-semibold transition ${
                    active
                      ? "text-[#FF5A36]"
                      : "text-[#6F6A64] hover:text-[#17202A]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/my-requests"
            className="rounded-xl bg-[#FF5A36] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#E94D2C] sm:px-4 sm:text-sm"
          >
            Request something
          </Link>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* -------------------------------------------------------------- */}
          {/* Sidebar                                                        */}
          {/* -------------------------------------------------------------- */}

          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] p-4 lg:block">
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/shop";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? "bg-[#FFE0D6] text-[#9F2D18]"
                        : "text-[#6F6A64] hover:bg-white hover:text-[#17202A]"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="my-5 h-px bg-[#EAE6DF]" />

            <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9A9188]">
              Categories
            </div>

            <div className="space-y-1">
              {categories.slice(0, categories.length).map((category) => {
                const style = getCategoryStyle(category.name);
                const active =
                  activeCategory === category.name;

                return (
                  <button
                    key={category.id}
                    onClick={() =>
                      selectCategory(
                        active ? "" : category.name
                      )
                    }
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                      active
                        ? "bg-white text-[#9F2D18]"
                        : "text-[#6F6A64] hover:bg-white"
                    }`}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg"
                      style={{ backgroundColor: style.bg }}
                    >
                      {style.icon}
                    </span>

                    <span>{category.name}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* -------------------------------------------------------------- */}
          {/* Main                                                           */}
          {/* -------------------------------------------------------------- */}

          <section className="min-w-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-7 lg:pb-7">
            {/* Page heading */}

            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[#FF5A36]">
                  <ShoppingBag className="h-4 w-4" />
                  Local shop
                </div>

                <h1 className="text-2xl font-extrabold tracking-tight text-[#17202A] sm:text-3xl">
                  Shop nearby
                </h1>

                <p className="mt-1 text-sm text-[#817970]">
                  Discover products and local businesses around you.
                </p>
              </div>

              <button
                onClick={() =>
                  setShowCategories((value) => !value)
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-sm font-bold text-[#4D4843] transition hover:border-[#FF5A36] hover:text-[#9F2D18] lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Categories
              </button>
            </div>

            {/* Search */}

            <form
              onSubmit={handleSearch}
              className="mb-5 flex items-center gap-2 rounded-2xl border border-[#E8E4DE] bg-white p-2 shadow-[0_4px_18px_rgba(23,32,42,0.04)]"
            >
              <Search className="ml-2 h-5 w-5 shrink-0 text-[#8C847C]" />

              <input
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search products or businesses..."
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-[#17202A] outline-none placeholder:text-[#AAA29A]"
              />

              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    router.push(
                      activeCategory
                        ? `/shop?category=${encodeURIComponent(
                            activeCategory
                          )}`
                        : "/shop"
                    );
                  }}
                  className="rounded-lg p-2 text-[#8C847C] transition hover:bg-[#FFF7ED] hover:text-[#17202A]"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <button
                type="submit"
                className="rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94D2C]"
              >
                Search
              </button>
            </form>

            {/* Mobile categories */}

            {showCategories && (
              <div className="mb-5 rounded-2xl border border-[#E8E4DE] bg-white p-4 lg:hidden">
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[#8C847C]">
                  Browse categories
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <button
                    onClick={() => {
                      selectCategory("");
                      setShowCategories(false);
                    }}
                    className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ${
                      !activeCategory
                        ? "border-[#FF5A36] bg-[#FFE0D6] text-[#9F2D18]"
                        : "border-[#E8E4DE] text-[#625C56]"
                    }`}
                  >
                    All
                  </button>

                  {categories.slice(0, categories.length).map((category) => {
                    const style = getCategoryStyle(
                      category.name
                    );

                    return (
                      <button
                        key={category.id}
                        onClick={() => {
                          selectCategory(category.name);
                          setShowCategories(false);
                        }}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ${
                          activeCategory === category.name
                            ? "border-[#FF5A36] text-[#9F2D18]"
                            : "border-[#E8E4DE] text-[#625C56]"
                        }`}
                        style={{
                          backgroundColor:
                            activeCategory === category.name
                              ? style.bg
                              : "#FFFFFF",
                        }}
                      >
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg"
                          style={{
                            backgroundColor: style.bg,
                          }}
                        >
                          {style.icon}
                        </span>

                        {category.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active category */}

            {(activeCategory || query) && (
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[#8A8178]">
                  Showing:
                </span>

                {query && (
                  <span className="rounded-full bg-[#FFF0D9] px-3 py-1.5 text-xs font-bold text-[#9F2D18]">
                    “{query}”
                  </span>
                )}

                {activeCategory && (
                  <button
                    onClick={() => selectCategory("")}
                    className="rounded-full bg-[#FFE0D6] px-3 py-1.5 text-xs font-bold text-[#9F2D18]"
                  >
                    {activeCategory} ×
                  </button>
                )}
              </div>
            )}

            {/* Results heading */}

            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight text-[#17202A]">
                  {activeCategory
                    ? `${activeCategory} businesses`
                    : "Businesses near you"}
                </h2>

                {!loading && (
                  <p className="mt-0.5 text-xs text-[#8C847C]">
                    {businesses.length}{" "}
                    {businesses.length === 1
                      ? "business"
                      : "businesses"}{" "}
                    found
                  </p>
                )}
              </div>

              <div className="hidden items-center gap-1 text-xs font-semibold text-[#8C847C] sm:flex">
                <Store className="h-4 w-4" />
                Local sellers
              </div>
            </div>

            {/* Loading */}

            {loading && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((item) => (
                  <div
                    key={item}
                    className="h-[280px] animate-pulse rounded-2xl border border-[#EAE6DF] bg-white"
                  />
                ))}
              </div>
            )}

            {/* Error */}

            {!loading && error && (
              <div className="rounded-2xl border border-[#E8E4DE] bg-white p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFE0D6] text-[#9F2D18]">
                  <Store className="h-6 w-6" />
                </div>

                <h3 className="font-bold text-[#17202A]">
                  Something went wrong
                </h3>

                <p className="mt-1 text-sm text-[#817970]">
                  {error}
                </p>
              </div>
            )}

            {/* Empty */}

            {!loading &&
              !error &&
              businesses.length === 0 && (
                <div className="rounded-2xl border border-[#E8E4DE] bg-white px-6 py-12 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFE0D6] text-[#9F2D18]">
                    <Search className="h-6 w-6" />
                  </div>

                  <h3 className="text-lg font-extrabold text-[#17202A]">
                    Nothing found yet
                  </h3>

                  <p className="mx-auto mt-1 max-w-md text-sm text-[#817970]">
                    Try another search or browse a different
                    category.
                  </p>

                  <button
                    onClick={() => {
                      setQuery("");
                      setActiveCategory("");
                      router.push("/shop");
                    }}
                    className="mt-5 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94D2C]"
                  >
                    Browse everything
                  </button>
                </div>
              )}

            {/* Business grid */}

            {!loading &&
              !error &&
              businesses.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {businesses.map((business) => {
                    const category =
                      business.categories?.[0]?.category
                        ?.name ?? "Other";

                    const style =
                      getCategoryStyle(category);

                    const productCount =
                      business.products?.length ?? 0;

                    const verified =
                      business.verification ===
                      "VERIFIED";

                    return (
                      <article
                        key={business.id}
                        className="group overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:border-[#FFB29E] hover:shadow-[0_10px_30px_rgba(159,45,24,0.08)]"
                      >
                        {/* Category header */}

                        <div
                          className="relative flex h-[92px] items-center justify-between px-5"
                          style={{
                            backgroundColor: style.bg,
                          }}
                        >
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-[#9F2D18]">
                            {style.icon}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#9F2D18]">
                              Active
                            </span>

                            <button
                              type="button"
                              aria-label={`Save ${business.name}`}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-[#776F68] transition hover:bg-white hover:text-[#FF5A36]"
                            >
                              <Bookmark className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Content */}

                        <div className="p-5">
                          <div className="mb-3 flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0D9] text-xs font-extrabold text-[#9F2D18]">
                              {getInitials(
                                business.name
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <h3 className="truncate text-[15px] font-extrabold text-[#17202A]">
                                  {business.name}
                                </h3>

                                {verified && (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 fill-[#FF5A36] text-white" />
                                )}
                              </div>

                              <p className="mt-0.5 text-xs font-semibold text-[#8A8178]">
                                {category}
                              </p>
                            </div>
                          </div>

                          <div className="mb-4 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-[#756D65]">
                              <MapPin className="h-3.5 w-3.5 text-[#FF5A36]" />

                              <span className="truncate">
                                {business.location?.area ??
                                  "Location not added"}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-[#756D65]">
                              <ShoppingBag className="h-3.5 w-3.5 text-[#FF5A36]" />

                              <span>
                                {productCount}{" "}
                                {productCount === 1
                                  ? "product"
                                  : "products"}
                              </span>
                            </div>
                          </div>

                          <Link
                            href={`/seller/${business.id}`}
                            className="flex w-full items-center justify-between rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] px-3.5 py-2.5 text-xs font-extrabold text-[#4D4843] transition hover:border-[#FF5A36] hover:bg-[#FFE0D6] hover:text-[#9F2D18]"
                          >
                            <span>View seller</span>

                            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
          </section>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Mobile bottom navigation                                        */}
        {/* ---------------------------------------------------------------- */}

        <nav className="fixed bottom-3 left-1/2 z-40 flex w-[calc(100%-24px)] max-w-md -translate-x-1/2 items-center justify-around rounded-2xl border border-[#E8E4DE] bg-white/95 p-2 shadow-[0_10px_35px_rgba(23,32,42,0.12)] backdrop-blur lg:hidden">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/shop";

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold ${
                  active
                    ? "bg-[#FFE0D6] text-[#9F2D18]"
                    : "text-[#827A72]"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </main>
  );
}