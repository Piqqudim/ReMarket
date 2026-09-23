"use client";

import React, {
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
  Navigation,
  Loader2,
  Bookmark,
  Package,
  ArrowRight,
  Search,
} from "lucide-react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  getSavedBusinesses,
  isBusinessSaved,
  saveBusiness,
  removeSavedBusiness,
  SAVED_BUSINESSES_CHANGED_EVENT,
} from "@/lib/saved";

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
  ownerName: string | null;
  description: string | null;
  imageUrl: string | null;
  area: string;
  location: {
    id: string;
    area: string;
    lat: number | null;
    long: number | null;
  } | null;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  verification:
    | "VERIFIED"
    | "UNVERIFIED";
  verified: boolean;
  categories: {
    category: {
      id: string;
      name: string;
    };
  }[];
  products: Product[];
  socialLinks: {
    id: string;
    platform: string;
    handle: string;
  }[];
  distanceKm: number | null;
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

function getProductImage(
  product: Product
): string | null {
  return (
    product.images?.[0]?.url ??
    product.imageUrl ??
    null
  );
}

export default function NearMePage() {
  const router =
    useRouter();

  const [area, setArea] =
    useState("");

  const [businesses, setBusinesses] =
    useState<Business[]>([]);

  const [mode, setMode] =
    useState<
      "none" | "area" | "gps"
    >("none");

  const [loading, setLoading] =
    useState(false);

  const [locating, setLocating] =
    useState(false);

  const [error, setError] =
    useState("");

  const [savedBusinesses, setSavedBusinesses] =
    useState<
      Record<string, boolean>
    >({});

  function syncSavedBusinesses() {
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

  useEffect(() => {
    syncSavedBusinesses();

    window.addEventListener(
      SAVED_BUSINESSES_CHANGED_EVENT,
      syncSavedBusinesses
    );

    return () => {
      window.removeEventListener(
        SAVED_BUSINESSES_CHANGED_EVENT,
        syncSavedBusinesses
      );
    };
  }, []);

  async function loadByArea(
    selectedArea: string
  ) {
    const trimmedArea =
      selectedArea.trim();

    if (!trimmedArea) {
      setBusinesses([]);
      setMode("none");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params =
        new URLSearchParams();

      params.set(
        "area",
        trimmedArea
      );

      const response =
        await fetch(
          `/api/near-me?${params.toString()}`,
          {
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error ===
            "string"
            ? data.error
            : "Unable to load nearby businesses."
        );
      }

      setBusinesses(
        Array.isArray(
          data.businesses
        )
          ? data.businesses
          : []
      );

      setMode(
        data.mode ===
          "area"
          ? "area"
          : "none"
      );
    } catch (error) {
      console.error(
        "Area near-me error:",
        error
      );

      setBusinesses([]);
      setMode("none");

      setError(
        error instanceof Error
          ? error.message
          : "Unable to load nearby businesses."
      );
    } finally {
      setLoading(false);
    }
  }

  function submitArea(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    void loadByArea(area);
  }

  function useCurrentLocation() {
    if (
      !navigator.geolocation
    ) {
      setError(
        "Location services are not available in this browser."
      );
      return;
    }

    setLocating(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const params =
            new URLSearchParams();

          params.set(
            "lat",
            String(
              position.coords
                .latitude
            )
          );

          params.set(
            "lng",
            String(
              position.coords
                .longitude
            )
          );

          const response =
            await fetch(
              `/api/near-me?${params.toString()}`,
              {
                cache:
                  "no-store",
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              typeof data?.error ===
                "string"
                ? data.error
                : "Unable to find businesses near you."
            );
          }

          setBusinesses(
            Array.isArray(
              data.businesses
            )
              ? data.businesses
              : []
          );

          setMode(
            data.mode ===
              "gps"
              ? "gps"
              : "none"
          );
        } catch (error) {
          console.error(
            "GPS near-me error:",
            error
          );

          setBusinesses([]);
          setMode("none");

          setError(
            error instanceof Error
              ? error.message
              : "Unable to find businesses near you."
          );
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        console.error(
          "Geolocation error:",
          geoError
        );

        setLocating(false);

        setError(
          "We couldn't access your current location. Enter an area instead."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
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

    const category =
      business.categories?.[0]
        ?.category?.name ??
      "Services";

    saveBusiness({
      id: business.id,
      name: business.name,
      area:
        business.area ??
        "Local",
      category,
      verified:
        business.verified,
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
            </aside>

            <div className="min-w-0 flex-1">
              <div className="px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-6 lg:pb-8">

                <section className="rounded-[18px] bg-[#FF5A36] px-5 py-6 text-white shadow-soft sm:px-7 sm:py-7">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                    Near You
                  </p>

                  <h1 className="mt-2 text-[26px] font-bold leading-tight sm:text-[30px]">
                    Find local businesses nearby
                  </h1>

                  <p className="mt-2 max-w-[560px] text-xs leading-5 text-white/80 sm:text-sm">
                    Search by area or use your current location to discover businesses around you.
                  </p>

                  <form
                    onSubmit={
                      submitArea
                    }
                    className="mt-5 flex h-[48px] max-w-[720px] items-center rounded-full bg-white p-1.5"
                  >
                    <MapPin className="ml-3 h-[18px] w-[18px] text-gray-500" />

                    <input
                      value={area}
                      onChange={(
                        event
                      ) =>
                        setArea(
                          event.target
                            .value
                        )
                      }
                      placeholder="Enter an area, e.g. Ogba"
                      className="min-w-0 flex-1 bg-transparent px-3 text-xs text-gray-800 outline-none placeholder:text-gray-400"
                    />

                    <button
                      type="submit"
                      disabled={
                        loading
                      }
                      className="rounded-full bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-60"
                    >
                      Search
                    </button>
                  </form>

                  <button
                    type="button"
                    onClick={
                      useCurrentLocation
                    }
                    disabled={
                      locating
                    }
                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/15 px-3.5 py-2.5 text-[11px] font-bold text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-60"
                  >
                    {locating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Navigation className="h-4 w-4" />
                    )}

                    {locating
                      ? "Finding you..."
                      : "Use my current location"}
                  </button>
                </section>

                <section className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-[#17202A]">
                        {mode ===
                        "gps"
                          ? "Businesses near you"
                          : mode ===
                              "area"
                            ? `Businesses around ${area.trim()}`
                            : "Nearby businesses"}
                      </h2>

                      <p className="mt-0.5 text-xs text-muted">
                        {loading
                          ? "Finding local businesses..."
                          : businesses.length
                            ? `${businesses.length} ${
                                businesses.length ===
                                1
                                  ? "business"
                                  : "businesses"
                              } found`
                            : "Choose an area or use your current location"}
                      </p>
                    </div>

                    {mode !==
                      "none" && (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            "/shop"
                          )
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#9F2D18]"
                      >
                        Browse all
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {error && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                      {error}
                    </div>
                  )}

                  {loading && (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                            className="h-[240px] animate-pulse rounded-xl border border-[#E8E4DE] bg-white"
                          />
                        )
                      )}
                    </div>
                  )}

                  {!loading &&
                    !error &&
                    businesses.length ===
                      0 &&
                    mode !==
                      "none" && (
                      <div className="mt-5 rounded-xl border border-[#E8E4DE] bg-white px-5 py-12 text-center">
                        <Search className="mx-auto h-8 w-8 text-gray-300" />

                        <p className="mt-3 text-sm font-semibold text-gray-700">
                          No nearby businesses found
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                          Try another area.
                        </p>
                      </div>
                    )}

                  {!loading &&
                    !error &&
                    businesses.length >
                      0 && (
                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {businesses.map(
                          (business) => {
                            const category =
                              business.categories?.[0]
                                ?.category?.name ??
                              "Services";

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
                                  href={`/seller/${business.id}`}
                                  className="relative flex h-[110px] items-center justify-center overflow-hidden bg-[#FFE0D6]"
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
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80">
                                      <Store className="h-7 w-7 text-gray-700" />
                                    </div>
                                  )}

                                  {business.distanceKm !==
                                    null && (
                                    <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-bold text-[#9F2D18] shadow-sm">
                                      {
                                        business.distanceKm
                                      }{" "}
                                      km
                                    </span>
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
                                        href={`/seller/${business.id}`}
                                        className="truncate text-sm font-bold text-[#17202A] hover:text-[#9F2D18]"
                                      >
                                        {
                                          business.name
                                        }
                                      </Link>

                                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">
                                        <span>
                                          {
                                            category
                                          }
                                        </span>

                                        <span>
                                          ·
                                        </span>

                                        <span className="flex min-w-0 items-center gap-1 truncate">
                                          <MapPin className="h-3 w-3 shrink-0" />
                                          {
                                            business.area
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
                                          : "text-gray-500"
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

                                  {product && (
                                    <div className="mt-3 flex items-center gap-2.5 border-t border-[#F0ECE6] pt-3">
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
                                  )}

                                  <Link
                                    href={`/seller/${business.id}`}
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

                  {mode ===
                    "none" &&
                    !loading && (
                      <div className="mt-5 rounded-xl border border-[#E8E4DE] bg-white px-5 py-12 text-center">
                        <MapPin className="mx-auto h-8 w-8 text-gray-300" />

                        <p className="mt-3 text-sm font-semibold text-gray-700">
                          Tell us where you are
                        </p>

                        <p className="mt-1 text-xs leading-5 text-gray-400">
                          Enter an area or use your current location to discover local businesses.
                        </p>
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
                      className="flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-gray-500"
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