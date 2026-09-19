"use client";

import {
  ReactNode,
  SyntheticEvent,
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Search,
  UserCircle,
  ArrowRight,
  Navigation,
  MoreHorizontal,
  Package,
  MapPin,
  Star,
  Bookmark,
  Utensils,
  Sparkles,
  Shirt,
  Store,
  Briefcase,
  Loader2,
  Layers3,
  Plug,
} from "lucide-react";

import Link from "next/link";

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

type Category = {
  id: string;
  name: string;
};

type Business = {
  id: string;
  name: string;

  location: {
    area?: string | null;
    address?: string | null;
  } | null;

  products: {
    id: string;
    name: string;
  }[];

  categories: {
    category: {
      id: string;
      name: string;
    };
  }[];

  socialLinks: {
    platform: string;
    handle: string;
  }[];
};

type FeaturedBusiness = {
  id: string;
  name: string;
  ownerName?: string | null;
  description?: string | null;
  area: string;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  verification:
    | "VERIFIED"
    | "UNVERIFIED";
  category: string;
  categories: string[];
  productCount: number;
  products: {
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
  }[];
  socialLinks: {
    platform: string;
    handle: string;
  }[];
};

type NearbyBusiness = {
  id: string;
  name: string;
  area: string | null;
  distanceKm: number | null;
  category: string | null;
  productCount: number;
  verified: boolean;
  availability?: string;
};

const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "fashion",
    name: "Fashion",
  },
  {
    id: "electronics",
    name: "Electronics",
  },
  {
    id: "food",
    name: "Food",
  },
  {
    id: "beauty",
    name: "Beauty",
  },
  {
    id: "textiles",
    name: "Textiles",
  },
  {
    id: "services",
    name: "Services",
  },
];

function getCategoryStyle(name: string) {
  return (
    CATEGORY_STYLE[name] ?? {
      bg: "#EEF1F4",
      icon: <MoreHorizontal className="h-6 w-6" />,
    }
  );
}

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

export default function HomePage() {
  const [q, setQ] = useState("");

  const [categories, setCategories] =
    useState<Category[]>(DEFAULT_CATEGORIES);

  const [loadingCategories, setLoadingCategories] =
    useState(true);

  const [featuredBusinesses, setFeaturedBusinesses] =
    useState<FeaturedBusiness[]>([]);

  const [businessLoading, setBusinessLoading] =
    useState(true);

  const [nearbyBusinesses, setNearbyBusiness] =
    useState<NearbyBusiness[]>([]);

  const [nearbyLoading, setNearbyLoading] =
    useState(false);

  const [nearbyLocationRequested, setNearbyLocationRequested] =
    useState(false);

  const [nearbyError, setNearbyError] =
    useState("");

  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function loadHomeData() {
      try {
        const [
          categoriesResponse,
          featuredResponse,
        ] = await Promise.all([
          fetch("/api/categories", {
            cache: "no-store",
          }),

          fetch("/api/featured", {
            cache: "no-store",
          }),
        ]);

        /* Categories */

        if (categoriesResponse.ok) {
          const categoryData =
            await categoriesResponse.json();

          if (
            Array.isArray(categoryData.categories) &&
            categoryData.categories.length > 0 &&
            !cancelled
          ) {
            setCategories(
              categoryData.categories.slice(0, categoryData.categories.length)
            );
          }
        }

        /* Featured Businesses */

        if (featuredResponse.ok) {
          const featuredData =
            await featuredResponse.json();

          if (!cancelled) {
            setFeaturedBusinesses(
              Array.isArray(featuredData.businesses)
                ? featuredData.businesses.slice(0, 5)
                : []
            );
          }
        }
      } catch (error) {
        console.error(
          "Failed to load homepage data",
          error
        );
      } finally {
        if (!cancelled) {
          setLoadingCategories(false);
          setBusinessLoading(false);
        }
      }
    }

    loadHomeData();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleCategory(category: string) {
    router.push(
      `/shop?category=${encodeURIComponent(category)}`
    );
  }

  const loadNearbyBusinesses = () => {
    if (!navigator.geolocation) {
      setNearbyError(
        "Location is not supported by this browser"
      );
      setNearbyLocationRequested(true);
      return;
    }

    setNearbyLocationRequested(true);
    setNearbyLoading(true);
    setNearbyError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const {
            latitude,
            longitude,
          } = position.coords;

          const response = await fetch(
            `/api/near-me?lat=${latitude}&lng=${longitude}`,
            {
              cache: "no-store",
            }
          );

          if (!response.ok) {
            throw new Error(
              "Failed to load nearby businesses"
            );
          }

          const data =
            await response.json();

          setNearbyBusiness(
            (data.businesses ?? []).slice(0, 4)
          );
        } catch (error) {
          console.error(error);

          setNearbyError(
            "We couldn't load nearby sellers right now"
          );
        } finally {
          setNearbyLoading(false);
        }
      },

      () => {
        setNearbyError(
          "Allow location access to discover sellers near you"
        );

        setNearbyLoading(false);
      },

      {
        enableHighAccuracy: false,
        timeout: 100000,
        maximumAge: 300000,
      }
    );
  };

  const submit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const query = q.trim();

    if (!query) {
      return;
    }

    router.push(
      `/search?q=${encodeURIComponent(query)}`
    );
  };

  return (
    <main className="min-h-screen bg-[#FFF7ED]">
      <div className="mx-auto min-h-screen w-full max-w-[1500px] px-3 py-3 sm:px-5 sm:py-5">
        <div className="min-h-[calc(100vh-24px)] overflow-hidden rounded-[18px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:rounded-[22px] lg:min-h-[calc(100vh-40px)]">

          {/* Header */}

          <header className="flex h-[64px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6 lg:h-[66px] lg:px-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
                <Store className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-bold tracking-tight text-base">
                  ReMarket
                </p>

                <p className="text-[10px] leading-none text-muted sm:text-[10px]">
                  Find it nearby
                </p>
              </div>
            </div>

            {/* Desktop Navigation */}

            <nav className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() =>
                      router.push(item.href)
                    }
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Right Action */}

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  const input =
                    document.getElementById(
                      "homepage-search"
                    );

                  input?.focus();
                }}
                className="hidden h-9 w-9 items-center justify-center rounded-full hover:bg-gray-50 sm:flex"
                aria-label="Search"
              >
                <Search className="h-[19px] w-[19px] text-gray-700" />
              </button>

              <button
                type="button"
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
                  router.push("/request")
                }
                className="rounded-xl bg-[#FF5A36] px-3.5 py-2.5 text-[11px] font-bold text-white shadow-sm transition hover:opacity-90 sm:px-4 sm:text-xs"
              >
                Request something
              </button>
            </div>
          </header>

          {/* Left SideBar */}

          <div className="flex">
            <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 lg:block">
              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() =>
                        router.push(item.href)
                      }
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition hover:bg-white"
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="my-5 h-px bg-[#E7E2DB]" />

              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Categories
                </p>

                <div className="mt-3 space-y-1">
                  {categories.map((category) => {
                    const style =
                      getCategoryStyle(category.name);

                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() =>
                          handleCategory(
                            category.name
                          )
                        }
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white"
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor:
                              style.bg,
                          }}
                        >
                          <span className="scale-[0.65]">
                            {style.icon}
                          </span>
                        </span>

                        <span className="truncate text-xs font-medium text-gray-700">
                          {category.name}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() =>
                      router.push("/shop")
                    }
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100">
                      <MoreHorizontal className="h-4 w-4 text-gray-500" />
                    </span>

                    <span className="text-xs font-medium text-gray-700">
                      More
                    </span>
                  </button>
                </div>
              </div>
            </aside>

            {/* Page Content */}

            <div className="min-w-0 flex-1">
              <div className="px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-6 lg:pb-8">

                {/* Hero */}

                <section className="relative min-h-[260px] overflow-hidden rounded-[18px] bg-[#FF5A36] px-6 py-7 text-white shadow-soft sm:min-h-[275px] sm:px-8 sm:py-9 lg:min-h-[275px] lg:px-8">

                  <div className="absolute -right-16 -top-24 h-[260px] w-[260px] rounded-full bg-white/5">

                    <div className="pointer-events-none absolute right-6 top-7 hidden opacity-90 md:block lg:right-12">
                      <div className="pointer-events-none absolute right-6 top-7 hidden opacity-90 md:block lg:right-12">
                        <div className="relative h-[190px] w-[220px]">
                          <div className="absolute bottom-3 left-8 h-[110px] w-[105px] rotate-[-8deg] rounded-b-xl bg-white/70" />

                          <div className="absolute left-[55px] top-3 h-[80px] w-[65px] rounded-t-[40px] border-[10px] border-white/60 border-b-0" />

                          <div className="absolute bottom-0 right-3 flex h-[82px] w-[65px] rotate-[8deg] items-center justify-center rounded-[28px_28px_35px_35px] bg-white/40">
                            <div className="h-10 w-10 rounded-full border-[8px] border-white/90" />
                          </div>

                          <div className="absolute right-0 top-[95px] h-12 w-12 rotate-45 rounded-t-[28px] rounded-br-[28px] bg-white/70">
                            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF5A36]" />
                          </div>

                          <div className="absolute right-[105px] top-0 h-4 w-1 rotate-[-35deg] bg-white/70" />

                          <div className="absolute right-[130px] top-5 h-3 w-1 rotate-[-50deg] bg-white/70" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="relative z-10 max-w-[600px]">
                    <div className="mb-4 inline-flex items-center rounded-full bg-white px-4 py-2 text-[10px] font-medium text-[#9F2D18]">
                      Your local marketplace
                    </div>

                    <h1 className="max-w-[520px] text-[29px] font-bold leading-[1.1] tracking-tight sm:text-[34px] lg:text-[36px]">
                      Find what you need,
                      <br />
                      right around you
                    </h1>

                    <p className="mt-3 max-w-[470px] text-xs leading-5 text-white/85 sm:text-sm">
                      Search sellers,discover products and connect with people nearby without the hassle.
                    </p>

                    <form
                      onSubmit={submit}
                      className="mt-5 flex h-[48px] w-full max-w-[455px] items-center rounded-full bg-white p-1.5 shadow-sm"
                    >
                      <Search className="ml-3 h-[18px] w-[18px] shrink-0 text-gray-500" />

                      <input
                        id="homepage-search"
                        value={q}
                        onChange={(event) =>
                          setQ(event.target.value)
                        }
                        placeholder="What are you looking for?"
                        className="min-w-0 flex-1 bg-transparent px-3 text-xs text-gray-800 outline-none placeholder:text-gray-400"
                      />

                      <button
                        type="submit"
                        className="flex h-[38px] items-center rounded-full bg-[#FF5A36] px-5 text-xs font-bold text-white transition hover:opacity-90"
                      >
                        Search
                      </button>
                    </form>
                  </div>
                </section>

                {/* Categories */}

                <section className="mt-5 sm:mt-6">
                  <div className="mb-3 flex items-end justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-[#17202A]">
                        Explore categories
                      </h2>

                      <p className="mt-0.5 text-xs text-muted">
                        Start with something you need
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        router.push("/shop")
                      }
                      className="flex items-center gap-1 text-xs font-medium text-[#9F2D18]"
                    >
                      View all
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                    {categories.map((category) => {
                      const style =
                        getCategoryStyle(
                          category.name
                        );

                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() =>
                            handleCategory(
                              category.name
                            )
                          }
                          className="group flex min-h-[112px] flex-col items-center justify-center rounded-xl border border-[#E8E4DE] bg-white px-2 py-2 transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <span
                            className="flex h-[58px] w-[58px] items-center justify-center rounded-full transition group-hover:scale-105"
                            style={{
                              background:
                                style.bg,
                            }}
                          >
                            {style.icon}
                          </span>

                          <span className="mt-3 max-w-full truncate text-xs font-medium text-gray-800">
                            {category.name}
                          </span>
                        </button>
                      );
                    })}

                    {/* More */}

                    <button
                      type="button"
                      onClick={() =>
                        router.push("/shop")
                      }
                      className="group flex min-h-[112px] flex-col items-center justify-center rounded-xl border border-[#E8E4DE] bg-white px-2 py-3 transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#E9EDF0] transition group-hover:scale-105">
                        <MoreHorizontal className="h-6 w-6 text-gray-600" />
                      </span>

                      <span className="mt-3 text-xs font-medium text-gray-800">
                        More
                      </span>
                    </button>
                  </div>
                </section>

                {/* Request Banner */}

                <section className="mt-5 flex flex-col gap-4 rounded-xl border border-[#F4DFC3] bg-[#FFF0D9] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFE0AD]">
                      <ClipboardList className="h-5 w-5 text-[#A76013]" />
                    </div>

                    <div>
                      <h2 className="text-sm font-bold text-gray-800">
                        Can't find what you need?
                      </h2>

                      <p className="mt-0.5 text-[11px] text-gray-600">
                        Tell us what you are looking for and we will help find matching sellers.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      router.push("/request")
                    }
                    className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:opacity-90"
                  >
                    Submit a request
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </section>

                {/* Nearby Businesses */}

                <section className="mt-8">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-[#9F2D18]">
                          <MapPin size={16} />
                        </div>

                        <h2 className="text-lg font-bold">
                          Near you
                        </h2>
                      </div>

                      <p className="mt-1 text-xs text-muted">
                        Discover businesses closest to you
                      </p>
                    </div>

                    {nearbyBusinesses.length > 0 && (
                      <Link
                        href="/near-me"
                        className="flex items-center gap-1 text-xs font-semibold text-[#9F2D18]"
                      >
                        View All
                        <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>

                  {/* Location Button */}

                  {!nearbyLocationRequested &&
                    !nearbyLoading && (
                      <div className="mt-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-card">
                        <div className="flex flex-col items-center text-center sm:flex-row sm:text-left">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-[#FF5A36]">
                            <Navigation size={21} />
                          </div>

                          <div className="mt-3 sm:ml-4 sm:mt-0">
                            <p className="text-sm font-bold">
                              Find businesses near you
                            </p>

                            <p className="mt-1 text-xs leading-5 text-muted">
                              Allow location access to see local seller closest to you
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={
                              loadNearbyBusinesses
                            }
                            className="mt-4 w-full rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-semibold text-white transition hover:opacity-90 sm:ml-auto sm:mt-0 sm:w-auto"
                          >
                            Find near me
                          </button>
                        </div>
                      </div>
                    )}

                  {/* Loading */}

                  {nearbyLoading && (
                    <div className="mt-4 flex min-h-[150px] items-center justify-center rounded-2xl border border-orange-100 bg-white shadow-card">
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Loader2
                          size={17}
                          className="animate-spin text-[#FF5A36]"
                        />
                        Finding businesses near me
                      </div>
                    </div>
                  )}

                  {/* Error */}

                  {!!nearbyError &&
                    !nearbyLoading && (
                      <div className="mt-4 rounded-2xl border border-orange-100 bg-white p-5 text-center shadow-card">
                        <MapPin
                          size={22}
                          className="mx-auto text-[#FF5A36]"
                        />

                        <p className="mt-3 text-sm font-semibold">
                          We couldn't find your location
                        </p>

                        <p className="mt-1 text-xs text-muted">
                          {nearbyError}
                        </p>

                        <Link
                          href="/near-me"
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-white"
                        >
                          Open Near Me
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    )}

                  {/* Businesses */}

                  {!nearbyLoading &&
                    nearbyBusinesses.length > 0 && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {nearbyBusinesses.map(
                          (business) => (
                            <Link
                              key={business.id}
                              href={`/seller/${business.id}`}
                              className="group rounded-2xl border border-orange-100 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-[#9F2D18]">
                                    {business.name
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </div>

                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold">
                                      {business.name}
                                    </p>

                                    <p className="mt-0.5 truncate text-[11px] text-muted">
                                      {business.category ??
                                        "Local business"}
                                    </p>
                                  </div>
                                </div>

                                <Store
                                  size={16}
                                  className="shrink-0 text-gray-400 transition group-hover:text-[#FF5A36]"
                                />
                              </div>

                              <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
                                {business.area && (
                                  <span className="truncate">
                                    {business.area}
                                  </span>
                                )}

                                {business.distanceKm !==
                                  null && (
                                  <>
                                    <span className="text-gray-300">
                                      .
                                    </span>

                                    <span className="shrink-0">
                                      {business.distanceKm} km
                                    </span>
                                  </>
                                )}
                              </div>

                              <div className="mt-2 text-[11px] text-muted">
                                {business.productCount}{" "}
                                {business.productCount ===
                                1
                                  ? "product"
                                  : "products"}
                              </div>
                            </Link>
                          )
                        )}
                      </div>
                    )}

                  {/* View All */}

                  {!nearbyLoading &&
                    nearbyBusinesses.length > 0 && (
                      <Link
                        href="/near-me"
                        className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-orange-100 bg-white py-3 text-xs font-semibold text-[#9F2D18] transition hover:bg-orange-50"
                      >
                        Explore all nearby businesses
                        <ArrowRight size={14} />
                      </Link>
                    )}
                </section>

                {/* Featured Businesses */}

                <section className="mt-6">
                  <div className="mb-3 flex items-end justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-[#17202A]">
                        Featured businesses
                      </h2>

                      <p className="mt-0.5 text-xs text-muted">
                        Discover businesses on ReMarket
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        router.push("/shop")
                      }
                      className="flex items-center gap-1 text-xs font-medium text-[#9F2D18]"
                    >
                      View all
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Loading */}

                  {businessLoading && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[1, 2, 3, 4].map(
                        (item) => (
                          <div
                            key={item}
                            className="h-[180px] animate-pulse rounded-xl border border-[#E8E4DE] bg-white"
                          />
                        )
                      )}
                    </div>
                  )}

                  {/* Empty */}

                  {!businessLoading &&
                    featuredBusinesses.length ===
                      0 && (
                      <div className="rounded-xl border border-[#E8E4DE] bg-white px-5 py-10 text-center">
                        <Store className="mx-auto h-8 w-8 text-gray-300" />

                        <p className="mt-3 text-sm font-semibold text-gray-600">
                          No businesses available yet
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          Businesses will appear here when they are added to ReMarket.
                        </p>
                      </div>
                    )}

                  {/* Real Featured Businesses */}

                  {!businessLoading &&
                    featuredBusinesses.length >
                      0 && (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {featuredBusinesses.map(
                          (business) => {
                            const category =
                              business.category ||
                              business.categories?.[0] ||
                              "Services";

                            const style =
                              getCategoryStyle(
                                category
                              );

                            const location =
                              business.area ||
                              "Local";

                            return (
                              <article
                                key={business.id}
                                className="overflow-hidden rounded-xl border border-[#E8E4DE] bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                              >
                                {/* Business Visual */}

                                <Link
                                  href={`/seller/${business.id}`}
                                  className="relative flex h-[92px] items-center justify-center"
                                  style={{
                                    backgroundColor:
                                      style.bg,
                                  }}
                                >
                                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/75 shadow-sm">
                                    <Store className="h-7 w-7 text-gray-700" />
                                  </div>

                                  <span className="absolute right-3 top-3 rounded-full bg-[#DDF5EA] px-2.5 py-1 text-[9px] font-semibold text-[#137A59]">
                                    Active
                                  </span>
                                </Link>

                                <div className="p-3.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <Link
                                        href={`/seller/${business.id}`}
                                        className="block truncate text-sm font-bold text-[#17202A]"
                                      >
                                        {business.name}
                                      </Link>

                                      <p className="mt-1 truncate text-[10px] text-muted">
                                        {category} ·{" "}
                                        {location}
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      aria-label={`Save ${business.name}`}
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                      className="shrink-0 text-gray-500 transition hover:text-[#9F2D18]"
                                    >
                                      <Bookmark className="h-4 w-4" />
                                    </button>
                                  </div>

                                  <div className="mt-3 flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[#F2B52B]">
                                        <Star className="h-6 w-6" />
                                      </span>

                                      <span className="text-[11px] font-semibold text-gray-700">
                                        Local
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                      <Package className="h-3 w-3" />

                                      <span>
                                        {business.productCount}{" "}
                                        available
                                      </span>
                                    </div>
                                  </div>

                                  <Link
                                    href={`/seller/${business.id}`}
                                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFF1ED] py-2.5 text-[11px] font-bold text-[#9F2D18] transition hover:bg-[#FFE6DF]"
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

                {/* Footer */}

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

          {/* Mobile Button Navigation */}

          <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(6px,safe-area-inset-bottom)] pt-1.5 backdrop-blur lg:hidden">
            <div className="mx-auto grid max-w-md grid-cols-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() =>
                      router.push(item.href)
                    }
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 ${
                      item.label === "Home"
                        ? "text-[#9F2D18]"
                        : "text-gray-500"
                    }`}
                  >
                    <Icon className="h-[19px] w-[19px]" />

                    <span className="text-[9px] font-medium">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}