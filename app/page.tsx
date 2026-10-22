"use client";
import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {useRouter} from "next/navigation";
import { getSession, signOut } from "next-auth/react";
import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Search,
  UserCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Navigation,
  MoreHorizontal,
  Package,
  MapPin,
  Bookmark,
  Store,
  Loader2,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";
import {
  getSavedBusinesses,
  saveBusiness,
  removeSavedBusiness,
  SAVED_BUSINESSES_CHANGED_EVENT,
} from "@/lib/saved";
import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ReMarketCategory,
} from "@/lib/categories";
type FeaturedBusiness = {
  id: string;
  name: string;
  ownerName?: string | null;
  description?: string | null;
  imageUrl?: string | null;
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
  imageUrl?: string | null;
};
type RecentProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
  imageUrl: string | null;
  createdAt: string;
  category: { id: string; name: string } | null;
  business: {
    id: string;
    name: string;
    availability: "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
    verification: "VERIFIED" | "UNVERIFIED";
    location: { area: string; street: string | null } | null;
  };
};
/*
 * -----------------------------------------
 * DISTANCE PRESENTATION
 * -----------------------------------------
 *
 * The Near Me API uses Haversine distance
 * for first-stage nearby filtering.
 *
 * This formatter keeps that distinction clear
 * and presents the value in a user-friendly way.
 *
 * It does NOT describe the value as driving
 * distance.
 */
function getDistanceLabel(
  distanceKm: number | null
): string | null {
  if (
    typeof distanceKm !== "number" ||
    !Number.isFinite(distanceKm) ||
    distanceKm < 0
  ) {
    return null;
  }
  if (distanceKm < 1) {
    const distanceMetres =
      Math.round(
        distanceKm * 1000
      );
    if (distanceMetres < 1) {
      return "Less than 1 m away";
    }
    return `${distanceMetres.toLocaleString()} m away`;
  }
  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km away`;
  }
  return `${Math.round(
    distanceKm
  ).toLocaleString()} km away`;
}

function formatRecentProductPrice(product: RecentProduct): string {
  const formatNaira = (amount: number) =>
    `₦${amount.toLocaleString("en-NG")}`;

  if (product.price !== null) {
    return formatNaira(product.price);
  }

  if (product.priceMin !== null && product.priceMax !== null) {
    if (product.priceMin === product.priceMax) {
      return formatNaira(product.priceMin);
    }
    return `${formatNaira(product.priceMin)} – ${formatNaira(product.priceMax)}`;
  }

  if (product.priceMin !== null) {
    return `From ${formatNaira(product.priceMin)}`;
  }

  if (product.priceMax !== null) {
    return `Up to ${formatNaira(product.priceMax)}`;
  }

  return "Ask seller for price";
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
type HomepageAccountRole = "ADMIN" | "BUYER" | "SELLER";

type HomepageAccount = {
  id: string | null;
  name: string | null;
  email: string | null;
  role: HomepageAccountRole | null;
};

function parseHomepageAccountRole(
  value: unknown
): HomepageAccountRole | null {
  if (value === "ADMIN" || value === "BUYER" || value === "SELLER") {
    return value;
  }

  return null;
}

/*
 * -----------------------------------------
 * SAVED BUSINESS STORE
 * -----------------------------------------
 *
 * The snapshot is represented as a stable
 * primitive string so useSyncExternalStore
 * can safely detect changes.
 */
function getSavedBusinessIdsSnapshot(): string {
  if (
    typeof window === "undefined"
  ) {
    return "";
  }
  const saved =
    getSavedBusinesses();
  return saved
    .map(
      (business) =>
        business.id
    )
    .sort()
    .join("|");
}
function subscribeSavedBusinesses(
  onStoreChange: () => void
) {
  window.addEventListener(
    SAVED_BUSINESSES_CHANGED_EVENT,
    onStoreChange
  );
  window.addEventListener(
    "storage",
    onStoreChange
  );
  return () => {
    window.removeEventListener(
      SAVED_BUSINESSES_CHANGED_EVENT,
      onStoreChange
    );
    window.removeEventListener(
      "storage",
      onStoreChange
    );
  };
}
export default function HomePage() {
  const [q, setQ] =
    useState("");
  const [
    categories,
    setCategories,
  ] =
    useState<ReMarketCategory[]>(
      DEFAULT_CATEGORIES
    );
  const [
    featuredBusinesses,
    setFeaturedBusinesses,
  ] =
    useState<FeaturedBusiness[]>(
      []
    );
  const [recentProducts, setRecentProducts] =
    useState<RecentProduct[]>([]);
  const [recentProductsLoading, setRecentProductsLoading] =
    useState(true);
  const [
    businessLoading,
    setBusinessLoading,
  ] =
    useState(true);
  const [activeFeaturedIndex, setActiveFeaturedIndex] =
    useState(0);
  const [featuredAutoplayPaused, setFeaturedAutoplayPaused] =
    useState(false);
  const [featuredHovered, setFeaturedHovered] =
    useState(false);
  const [
    nearbyBusinesses,
    setNearbyBusiness,
  ] =
    useState<NearbyBusiness[]>(
      []
    );
  const [
    nearbyLoading,
    setNearbyLoading,
  ] =
    useState(false);
  const [
    nearbyLocationRequested,
    setNearbyLocationRequested,
  ] =
    useState(false);
  const [
    nearbyError,
    setNearbyError,
  ] =
    useState("");
  const router =
    useRouter();

  /*
   * -----------------------------------------
   * ACCOUNT SESSION AND HEADER MENU
   * -----------------------------------------
   */
  const [currentAccount, setCurrentAccount] =
    useState<HomepageAccount | null>(null);
  const [accountStatusLoading, setAccountStatusLoading] =
    useState(true);
  const [accountSessionError, setAccountSessionError] =
    useState(false);
  const [accountMenuOpen, setAccountMenuOpen] =
    useState(false);
  const [loggingOut, setLoggingOut] =
    useState(false);
  const [accountMenuError, setAccountMenuError] =
    useState("");
  const accountMenuRef =
    useRef<HTMLDivElement | null>(null);
  const accountRequestVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function refreshAccountSession() {
      const requestVersion =
        ++accountRequestVersionRef.current;

      try {
        const session = await getSession();

        if (
          cancelled ||
          requestVersion !== accountRequestVersionRef.current
        ) {
          return;
        }

        const rawUser = session?.user as
          | (Record<string, unknown> & {
              id?: unknown;
              name?: unknown;
              email?: unknown;
              role?: unknown;
            })
          | undefined;

        if (!rawUser) {
          setCurrentAccount(null);
          setAccountSessionError(false);
          return;
        }

        setCurrentAccount({
          id: typeof rawUser.id === "string" ? rawUser.id : null,
          name: typeof rawUser.name === "string" ? rawUser.name : null,
          email: typeof rawUser.email === "string" ? rawUser.email : null,
          role: parseHomepageAccountRole(rawUser.role),
        });
        setAccountSessionError(false);
      } catch (error) {
        console.error(
          "Unable to load homepage account session:",
          error
        );

        if (!cancelled) {
          setAccountSessionError(true);
        }
      } finally {
        if (
          !cancelled &&
          requestVersion === accountRequestVersionRef.current
        ) {
          setAccountStatusLoading(false);
        }
      }
    }

    function handleWindowFocus() {
      void refreshAccountSession();
    }

    void refreshAccountSession();
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      cancelled = true;
      accountRequestVersionRef.current += 1;
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        accountMenuRef.current &&
        !accountMenuRef.current.contains(target)
      ) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  const accountDestination =
    currentAccount?.role === "SELLER"
      ? "/seller"
      : currentAccount?.role === "ADMIN"
        ? "/admin"
        : "/profile";

  async function handleAccountLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setAccountMenuError("");

    try {
      await signOut({
        redirect: false,
        callbackUrl: "/",
      });

      setCurrentAccount(null);
      setAccountSessionError(false);
      setAccountMenuOpen(false);
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Homepage logout failed:", error);
      setAccountMenuError(
        "We couldn't log you out. Please try again."
      );
    } finally {
      setLoggingOut(false);
    }
  }

  /*
   * -----------------------------------------
   * SAVED BUSINESSES
   * -----------------------------------------
   */
  const savedBusinessIdsSnapshot =
    useSyncExternalStore(
      subscribeSavedBusinesses,
      getSavedBusinessIdsSnapshot,
      () => ""
    );
  const savedBusinessIds =
    useMemo(
      () =>
        new Set(
          savedBusinessIdsSnapshot
            ? savedBusinessIdsSnapshot.split(
              "|"
            )
            : []
        ),
      [savedBusinessIdsSnapshot]
    );
  /*
   * -----------------------------------------
   * CATEGORY VISUAL
   * -----------------------------------------
   */
  function getCategoryVisual(
    name: string
  ) {
    const category =
      categories.find(
        (item) =>
          item.name
            .trim()
            .toLowerCase() ===
          name
            .trim()
            .toLowerCase()
      );
    if (!category) {
      return {
        bg: "#EEF1F4",
        icon: (
          <MoreHorizontal className="h-6 w-6" />
        ),
      };
    }
    const Icon =
      category.icon;
    return {
      bg: category.bg,
      icon: (
        <Icon className="h-6 w-6" />
      ),
    };
  }
  /*
   * -----------------------------------------
   * LOAD HOMEPAGE DATA
   * -----------------------------------------
   */
  useEffect(() => {
    let cancelled =
      false;
    async function loadHomeData() {
      try {
        const [
          categoriesResponse,
          featuredResponse,
          recentProductsResponse,
        ] =
          await Promise.all([
            fetch(
              "/api/categories",
              {
                cache:
                  "no-store",
              }
            ).catch((error) => {
              console.error("Failed to load homepage categories", error);
              return null;
            }),
            fetch(
              "/api/featured",
              {
                cache:
                  "no-store",
              }
            ).catch((error) => {
              console.error("Failed to load featured businesses", error);
              return null;
            }),
            fetch(
              "/api/recent-products?page=1&pageSize=8",
              {
                cache:
                  "no-store",
              }
            ).catch((error) => {
              console.error("Failed to load recently added products", error);
              return null;
            }),
          ]);
        /*
         * Categories
         */
        if (
          categoriesResponse?.ok
        ) {
          const categoryData =
            await categoriesResponse.json();
          const backendCategories =
            Array.isArray(
              categoryData.categories
            )
              ? categoryData.categories
              : [];
          const mergedCategories =
            mergeCategories(
              backendCategories
            );
          if (
            mergedCategories.length >
            0 &&
            !cancelled
          ) {
            setCategories(
              mergedCategories
            );
          }
        }
        /*
         * Featured businesses
         */
        if (
          featuredResponse?.ok
        ) {
          const featuredData =
            await featuredResponse.json();
          if (!cancelled) {
            setFeaturedBusinesses(
              Array.isArray(
                featuredData.businesses
              )
                ? featuredData.businesses.slice(
                  0,
                  5
                )
                : []
            );
          }
        }
        /*
         * Recently added products.
         * This is a separate public feed from the random featured-business list.
         */
        if (recentProductsResponse?.ok) {
          const recentProductsData = await recentProductsResponse.json();
          if (!cancelled) {
            setRecentProducts(
              Array.isArray(recentProductsData.products)
                ? recentProductsData.products.slice(0, 8)
                : []
            );
          }
        }
      } catch (
      error
      ) {
        console.error(
          "Failed to load homepage data",
          error
        );
      } finally {
        if (!cancelled) {
          setBusinessLoading(
            false
          );
          setRecentProductsLoading(false);
        }
      }
    }
    void loadHomeData();
    return () => {
      cancelled = true;
    };
  }, []);
  /*
   * -----------------------------------------
   * FEATURED BUSINESS SLIDESHOW
   * -----------------------------------------
   * Auto-advances gently, pauses while hovered or
   * manually paused, and respects reduced-motion settings.
   */
  useEffect(() => {
    if (featuredBusinesses.length === 0) {
      setActiveFeaturedIndex(0);
      return;
    }
    if (activeFeaturedIndex >= featuredBusinesses.length) {
      setActiveFeaturedIndex(0);
    }
  }, [featuredBusinesses.length, activeFeaturedIndex]);

  useEffect(() => {
    if (
      featuredBusinesses.length < 2 ||
      featuredAutoplayPaused ||
      featuredHovered ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setActiveFeaturedIndex((currentIndex) =>
        (currentIndex + 1) % featuredBusinesses.length
      );
    }, 5500);

    return () => window.clearInterval(intervalId);
  }, [featuredBusinesses.length, featuredAutoplayPaused, featuredHovered]);
  /*
   * -----------------------------------------
   * CATEGORY
   * -----------------------------------------
   */
  function handleCategory(
    category: string
  ) {
    router.push(
      `/shop?category=${encodeURIComponent(
        category
      )}`
    );
  }
  /*
   * -----------------------------------------
   * SAVE / UNSAVE BUSINESS
   * -----------------------------------------
   */
  function handleSaveBusiness(
    event: MouseEvent<HTMLButtonElement>,
    business: FeaturedBusiness,
    category: string,
    location: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    const alreadySaved =
      savedBusinessIds.has(
        business.id
      );
    if (alreadySaved) {
      removeSavedBusiness(
        business.id
      );
      return;
    }
    saveBusiness({
      id: business.id,
      name: business.name,
      area: location,
      category,
      verified:
        business.verification ===
        "VERIFIED",
      availability:
        business.availability,
      imageUrl:
        business.imageUrl ??
        null,
    });
  }
  /*
   * -----------------------------------------
   * FIND NEARBY BUSINESSES
   * -----------------------------------------
   */
  const loadNearbyBusinesses =
    () => {
      if (
        !navigator.geolocation
      ) {
        setNearbyError(
          "Location is not supported by this browser"
        );
        setNearbyLocationRequested(
          true
        );
        return;
      }
      setNearbyLocationRequested(
        true
      );
      setNearbyLoading(
        true
      );
      setNearbyError("");
      /*
       * Clear previous nearby results
       * before starting a new search.
       */
      setNearbyBusiness([]);
      navigator.geolocation.getCurrentPosition(
        async (
          position
        ) => {
          try {
            const {
              latitude,
              longitude,
            } =
              position.coords;
            const response =
              await fetch(
                `/api/near-me?lat=${latitude}&lng=${longitude}`,
                {
                  cache:
                    "no-store",
                }
              );
            if (!response.ok) {
              throw new Error(
                "Failed to load nearby businesses"
              );
            }
            const data =
              await response.json();
            /*
             * GPS can succeed even when
             * there are no businesses nearby.
             *
             * An empty array is therefore
             * not treated as an error.
             */
            setNearbyBusiness(
              Array.isArray(
                data.businesses
              )
                ? data.businesses.slice(
                  0,
                  4
                )
                : []
            );
          } catch (
          error
          ) {
            console.error(
              "Failed to load nearby businesses:",
              error
            );
            setNearbyError(
              "We couldn't load nearby sellers right now"
            );
          } finally {
            setNearbyLoading(
              false
            );
          }
        },
        (
          error
        ) => {
          console.error(
            "Geolocation error:",
            error
          );
          setNearbyError(
            "Allow location access to discover sellers near you"
          );
          setNearbyLoading(
            false
          );
        },
        {
          enableHighAccuracy:
            false,
          timeout: 100000,
          maximumAge: 300000,
        }
      );
    };
  /*
   * -----------------------------------------
   * SEARCH
   * -----------------------------------------
   */
  const submit = (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    const query =
      q.trim();
    if (!query) {
      return;
    }
    router.push(
      `/search?q=${encodeURIComponent(
        query
      )}`
    );
  };

  const accountMenu = (
    <div ref={accountMenuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setAccountMenuError("");
          setAccountMenuOpen((open) => !open);
        }}
        aria-label={currentAccount ? "Open account menu" : "Login or create an account"}
        aria-expanded={accountMenuOpen}
        aria-haspopup="menu"
        title={currentAccount ? "My account" : "Login or create an account"}
        className={`flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 ${
          currentAccount ? "bg-[#FFE0D6] text-[#9F2D18]" : "bg-gray-100 text-gray-700 hover:bg-[#FFF0D9]"
        }`}
      >
        {currentAccount?.role === "SELLER" ? (
          <Store className="h-5 w-5" aria-hidden="true" />
        ) : (
          <UserCircle className="h-6 w-6" aria-hidden="true" />
        )}
      </button>

      {accountMenuOpen && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-full z-[80] mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_14px_40px_rgba(23,32,42,0.16)]"
        >
          {accountStatusLoading ? (
            <div role="status" className="flex items-center gap-2 p-4 text-sm text-[#756B61]">
              <Loader2 className="h-4 w-4 animate-spin text-[#FF5A36]" aria-hidden="true" />
              Checking your account...
            </div>
          ) : currentAccount ? (
            <>
              <div className="border-b border-[#EAE6DF] bg-[#FCFAF6] p-4">
                <p className="truncate text-sm font-bold text-[#17202A]">
                  {currentAccount.name || currentAccount.email || "My account"}
                </p>
                {currentAccount.name && currentAccount.email && (
                  <p className="mt-0.5 truncate text-xs text-[#756B61]">
                    {currentAccount.email}
                  </p>
                )}
                <span className="mt-2 inline-flex rounded-full bg-[#FFE0D6] px-2.5 py-1 text-[10px] font-bold text-[#9F2D18]">
                  {currentAccount.role === "ADMIN"
                    ? "Administrator"
                    : currentAccount.role === "SELLER"
                      ? "Seller account"
                      : currentAccount.role === "BUYER"
                        ? "Buyer account"
                        : "Account"}
                </span>
                {currentAccount.role === null && (
                  <p className="mt-2 text-[11px] leading-4 text-[#756B61]">
                    Your session has no recognized account role. Some account links may be unavailable.
                  </p>
                )}
              </div>

              {currentAccount.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                >
                  <Store className="h-4 w-4 text-[#FF5A36]" aria-hidden="true" />
                  Admin dashboard
                </Link>
              ) : currentAccount.role === "SELLER" ? (
                <>
                  <Link
                    href="/seller"
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                  >
                    <Store className="h-4 w-4 text-[#FF5A36]" aria-hidden="true" />
                    Seller dashboard
                  </Link>
                  <Link
                    href="/seller/profile"
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                  >
                    <UserCircle className="h-4 w-4 text-[#756B61]" aria-hidden="true" />
                    Seller profile
                  </Link>
                </>
              ) : (
                <Link
                  href="/profile"
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                >
                  <UserCircle className="h-4 w-4 text-[#FF5A36]" aria-hidden="true" />
                  My profile
                </Link>
              )}

              {currentAccount.role !== "ADMIN" && (
                <>
                  <Link
                    href="/my-requests"
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                  >
                    <ClipboardList className="h-4 w-4 text-[#756B61]" aria-hidden="true" />
                    My requests
                  </Link>
                  <Link
                    href="/saved"
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                  >
                    <Heart className="h-4 w-4 text-[#756B61]" aria-hidden="true" />
                    Saved items
                  </Link>
                </>
              )}

              {currentAccount.role === "BUYER" && (
                <div className="border-t border-[#EAE6DF] p-3">
                  <Link
                    href="/profile#seller-onboarding"
                    role="menuitem"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center justify-between gap-3 rounded-xl bg-[#FFF0D9] p-3 transition hover:bg-[#FFE0D6]"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-[#9F2D18]">Have a business?</span>
                      <span className="mt-1 block text-[11px] leading-4 text-[#756B61]">Start selling on ReMarket.</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#9F2D18]" aria-hidden="true" />
                  </Link>
                </div>
              )}

              <div className="border-t border-[#EAE6DF] p-2">
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={() => { void handleAccountLogout(); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFF0D9] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loggingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  )}
                  {loggingOut ? "Logging out..." : "Log out"}
                </button>
                {accountMenuError && (
                  <p role="alert" className="px-3 pb-2 text-xs leading-5 text-red-600">
                    {accountMenuError}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-[#EAE6DF] bg-[#FCFAF6] p-4">
                <p className="text-sm font-bold text-[#17202A]">Welcome to ReMarket</p>
                <p className="mt-1 text-xs leading-5 text-[#756B61]">
                  Sign in to access your account, manage your activity, and find your saved items.
                </p>
                {accountSessionError && (
                  <p role="alert" className="mt-2 text-[11px] leading-4 text-[#9F2D18]">
                    We could not verify your session. Refresh this page if you have already signed in.
                  </p>
                )}
              </div>
              <Link
                href="/buyer/login"
                role="menuitem"
                onClick={() => setAccountMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6]"
              >
                <UserCircle className="h-4 w-4 text-[#FF5A36]" aria-hidden="true" />
                Buyer login
              </Link>
              <Link
                href="/seller/login"
                role="menuitem"
                onClick={() => setAccountMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6]"
              >
                <Store className="h-4 w-4 text-[#756B61]" aria-hidden="true" />
                Seller login
              </Link>
              <div className="border-t border-[#EAE6DF] p-3">
                <Link
                  href="/buyer/signup"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex min-h-10 items-center justify-center rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94A28]"
                >
                  Create buyer account
                </Link>
                <Link
                  href="/seller/signup"
                  onClick={() => setAccountMenuOpen(false)}
                  className="mt-2 flex min-h-10 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFF7ED]"
                >
                  Register as a seller
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#FFFDFC]">
      <div className="min-h-dvh w-full">
        <div className="min-h-dvh w-full bg-[#FFFDFC]">
          {/* Header */}
          <header className="flex h-[64px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6 lg:h-[66px] lg:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
                <Store className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight text-[#17202A]">
                  ReMarket
                </p>
                <p className="truncate text-[10px] leading-none text-muted sm:text-[10px]">
                  Find it nearby
                </p>
              </div>
            </div>
            {/* Desktop Navigation */}
            <nav className="hidden items-center gap-1 xl:flex">
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
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    {
                      item.label
                    }
                  </button>
                )
              )}
            </nav>
            {/* Right Action */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              {/* Search */}
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
              {/* Saved */}
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
              {/* Notifications */}
              <div className="shrink-0">
                <NotificationBell />
              </div>
              {/* Account menu: visible on mobile and desktop. */}
              {accountMenu}
              {/* Request */}
              <button
                type="button"
                onClick={() =>
                  router.push(
                    "/request"
                  )
                }
                className="shrink-0 whitespace-nowrap rounded-xl bg-[#FF5A36] px-2.5 py-2.5 text-[10px] font-bold text-white shadow-sm transition hover:opacity-90 sm:px-4 sm:text-xs"
              >
                <span className="sm:hidden">
                  Request
                </span>
                <span className="hidden sm:inline">
                  Request something
                </span>
              </button>
            </div>
          </header>
          {/* Left Sidebar */}
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
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition hover:bg-white"
                      >
                        <Icon className="h-[18px] w-[18px]" />
                        <span>
                          {
                            item.label
                          }
                        </span>
                      </button>
                    );
                  }
                )}
              </nav>
              <div className="my-5 h-px bg-[#E7E2DB]" />
              <div>
                <p className="px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Categories
                </p>
                <div className="mt-3 space-y-1">
                  {categories.map(
                    (category) => {
                      const Icon =
                        category.icon;
                      return (
                        <button
                          key={
                            category.id
                          }
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
                                category.bg,
                            }}
                          >
                            <Icon className="h-4 w-4 text-[#9F2D18]" />
                          </span>
                          <span className="truncate text-xs font-medium text-gray-700">
                            {
                              category.name
                            }
                          </span>
                        </button>
                      );
                    }
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        "/shop"
                      )
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
                  {/* Signed-in account shortcut */}
                  {!accountStatusLoading && currentAccount && (
                    <Link
                      href={accountDestination}
                      aria-label={
                        currentAccount.role === "SELLER"
                          ? "Open seller dashboard"
                          : currentAccount.role === "ADMIN"
                            ? "Open admin dashboard"
                            : "Open my profile"
                      }
                      title={
                        currentAccount.role === "SELLER"
                          ? "Seller dashboard"
                          : currentAccount.role === "ADMIN"
                            ? "Admin dashboard"
                            : "My profile"
                      }
                      className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#FF5A36] sm:right-5 sm:top-5"
                    >
                      {currentAccount.role === "SELLER" ? (
                        <Store className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <UserCircle className="h-5 w-5" aria-hidden="true" />
                      )}
                    </Link>
                  )}
                  <div className="absolute -right-16 -top-24 h-[260px] w-[260px] rounded-full bg-white/5">
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
                      Search sellers, discover products and connect with people nearby without the hassle.
                    </p>
                    <form
                      onSubmit={
                        submit
                      }
                      className="mt-5 flex h-[48px] w-full max-w-[455px] items-center rounded-full bg-white p-1.5 shadow-sm"
                    >
                      <Search className="ml-3 h-[18px] w-[18px] shrink-0 text-gray-500" />
                      <input
                        id="homepage-search"
                        value={q}
                        onChange={(
                          event
                        ) =>
                          setQ(
                            event.target
                              .value
                          )
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
                        router.push(
                          "/shop"
                        )
                      }
                      className="flex items-center gap-1 text-xs font-medium text-[#9F2D18]"
                    >
                      View all
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                    {categories.map(
                      (category) => {
                        const Icon =
                          category.icon;
                        return (
                          <button
                            key={
                              category.id
                            }
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
                                  category.bg,
                              }}
                            >
                              <Icon className="h-6 w-6" />
                            </span>
                            <span className="mt-3 max-w-full truncate text-xs font-medium text-gray-800">
                              {
                                category.name
                              }
                            </span>
                          </button>
                        );
                      }
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          "/shop"
                        )
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
                        Can&apos;t find what you need?
                      </h2>
                      <p className="mt-0.5 text-[11px] text-gray-600">
                        Tell us what you are looking for and we will help find matching sellers.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        "/request"
                      )
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
                    <Link
                      href="/near-me"
                      className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[#9F2D18]"
                    >
                      View All
                      <ArrowRight size={14} />
                    </Link>
                  </div>
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
                              Allow location access to see local sellers closest to you.
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
                  {!!nearbyError &&
                    !nearbyLoading && (
                      <div className="mt-4 rounded-2xl border border-orange-100 bg-white p-5 text-center shadow-card">
                        <MapPin
                          size={22}
                          className="mx-auto text-[#FF5A36]"
                        />
                        <p className="mt-3 text-sm font-semibold">
                          We couldn&apos;t find your location
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {
                            nearbyError
                          }
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
                  {!nearbyLoading &&
                    nearbyLocationRequested &&
                    !nearbyError &&
                    nearbyBusinesses.length ===
                    0 && (
                      <div className="mt-4 rounded-2xl border border-orange-100 bg-white p-6 text-center shadow-card">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-[#FF5A36]">
                          <MapPin size={21} />
                        </div>
                        <p className="mt-3 text-sm font-bold">
                          No businesses found near you yet
                        </p>
                        <p className="mx-auto mt-1 max-w-[380px] text-xs leading-5 text-muted">
                          We don&apos;t have businesses registered around your current location yet. You can explore all businesses or search for another area.
                        </p>
                        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                          <Link
                            href="/near-me"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-white transition hover:opacity-90"
                          >
                            Open Near Me
                            <ArrowRight size={14} />
                          </Link>
                          <Link
                            href="/shop"
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-[#9F2D18] transition hover:bg-orange-50"
                          >
                            Browse all businesses
                          </Link>
                          <Link
                            href="#recent-products"
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-[#9F2D18] transition hover:bg-orange-50"
                          >
                            See recently added products
                          </Link>
                        </div>
                      </div>
                    )}
                  {!nearbyLoading &&
                    nearbyBusinesses.length >
                    0 && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {nearbyBusinesses.map(
                          (
                            business
                          ) => {
                            const distanceLabel =
                              getDistanceLabel(
                                business.distanceKm
                              );
                            return (
                              <Link
                                key={
                                  business.id
                                }
                                href={`/seller/${business.id}`}
                                className="group rounded-2xl border border-orange-100 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-orange-100">
                                      {business.imageUrl ? (
                                        <img
                                          src={
                                            business.imageUrl
                                          }
                                          alt={
                                            business.name
                                          }
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#9F2D18]">
                                          {business.name
                                            .slice(
                                              0,
                                              2
                                            )
                                            .toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-bold">
                                        {
                                          business.name
                                        }
                                      </p>
                                      <p className="mt-0.5 truncate text-[11px] text-muted">
                                        {
                                          business.category ??
                                          "Local business"
                                        }
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
                                      {
                                        business.area
                                      }
                                    </span>
                                  )}
                                  {distanceLabel !==
                                    null && (
                                      <>
                                        {business.area && (
                                          <span className="text-gray-300">
                                            ·
                                          </span>
                                        )}
                                        <span className="shrink-0">
                                          {
                                            distanceLabel
                                          }
                                        </span>
                                      </>
                                    )}
                                </div>
                                <div className="mt-2 text-[11px] text-muted">
                                  {
                                    business.productCount
                                  }{" "}
                                  {business.productCount ===
                                    1
                                    ? "product"
                                    : "products"}
                                </div>
                              </Link>
                            );
                          }
                        )}
                      </div>
                    )}
                  {!nearbyLoading &&
                    nearbyBusinesses.length >
                    0 && (
                      <Link
                        href="/near-me"
                        className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-orange-100 bg-white py-3 text-xs font-semibold text-[#9F2D18] transition hover:bg-orange-50"
                      >
                        Explore all nearby businesses
                        <ArrowRight size={14} />
                      </Link>
                    )}
                </section>
                {/* Recently Added Products */}
                <section
                  id="recent-products"
                  className="mt-8 scroll-mt-5"
                  aria-labelledby="recent-products-heading"
                >
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div>
                      <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFD9CE] bg-[#FFF1ED] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#9F2D18]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />
                        Fresh listings
                      </div>
                      <h2
                        id="recent-products-heading"
                        className="text-lg font-bold tracking-tight text-[#17202A] sm:text-xl"
                      >
                        Recently added products
                      </h2>
                      <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                        See what local businesses have listed recently.
                      </p>
                    </div>
                    <Link
                      href="/shop"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#EAE6DF] bg-white px-3 py-2 text-[11px] font-semibold text-[#9F2D18] transition hover:border-[#FFB9A7] hover:bg-[#FFF7F4] sm:px-4 sm:text-xs"
                    >
                      Browse products
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  {recentProductsLoading && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={`recent-product-skeleton-${index}`}
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

                  {!recentProductsLoading && recentProducts.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {recentProducts.map((product) => {
                        const productImage = product.imageUrl;
                        const productArea = product.business.location?.area;
                        const availabilityLabel =
                          product.availability === "AVAILABLE"
                            ? "Available"
                            : product.availability === "UNAVAILABLE"
                              ? "Unavailable"
                              : "Ask seller";

                        return (
                          <Link
                            key={product.id}
                            href={`/seller/${product.business.id}`}
                            aria-label={`View ${product.name} from ${product.business.name}`}
                            className="group min-w-0 overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_4px_18px_rgba(23,32,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#FFD0C3] hover:shadow-[0_10px_28px_rgba(23,32,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                          >
                            <div className="relative aspect-square overflow-hidden bg-[#FCFAF6]">
                              {productImage ? (
                                <img
                                  src={productImage}
                                  alt={product.name}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[#C3B9AE]">
                                  <Package className="h-10 w-10" />
                                </div>
                              )}
                              <span className="absolute left-2 top-2 rounded-full border border-white/80 bg-white/95 px-2 py-1 text-[9px] font-bold text-[#9F2D18] shadow-sm">
                                New listing
                              </span>
                            </div>
                            <div className="p-3 sm:p-3.5">
                              <p className="line-clamp-2 min-h-9 text-xs font-bold leading-4 text-[#17202A] transition group-hover:text-[#9F2D18] sm:text-sm">
                                {product.name}
                              </p>
                              <p className="mt-2 line-clamp-1 text-[11px] font-bold text-[#9F2D18] sm:text-xs">
                                {formatRecentProductPrice(product)}
                              </p>
                              <div className="mt-3 border-t border-[#F0ECE7] pt-2.5">
                                <p className="truncate text-[10px] font-semibold text-[#4C5560] sm:text-[11px]">
                                  {product.business.name}
                                </p>
                                <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-gray-500">
                                  <MapPin className="h-3 w-3 shrink-0 text-[#FF5A36]" />
                                  <span className="truncate">
                                    {productArea || "Location not added"}
                                  </span>
                                </p>
                                <p className="mt-2 text-[9px] font-medium text-gray-500">
                                  {availabilityLabel}
                                  {product.category?.name ? ` · ${product.category.name}` : ""}
                                </p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {!recentProductsLoading && recentProducts.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-7 text-center">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm">
                        <Package className="h-5 w-5" />
                      </div>
                      <p className="mt-3 text-sm font-bold text-[#17202A]">
                        New products are coming
                      </p>
                      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-gray-500">
                        As local businesses add listings, they will appear here. You can still browse businesses or search for a product.
                      </p>
                      <Link
                        href="/shop"
                        className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28]"
                      >
                        Browse ReMarket
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )}
                </section>
                {/* Featured Businesses Slideshow */}
                <section
                  className="mt-7"
                  aria-label="Featured businesses"
                  aria-roledescription="carousel"
                  onMouseEnter={() => setFeaturedHovered(true)}
                  onMouseLeave={() => setFeaturedHovered(false)}
                >
                  <div className="mb-4 flex items-end justify-between gap-3">
                    <div>
                      <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFD9CE] bg-[#FFF1ED] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#9F2D18]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />
                        Local spotlight
                      </div>
                      <h2 className="text-lg font-bold tracking-tight text-[#17202A] sm:text-xl">
                        Featured businesses
                      </h2>
                      <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                        Get to know local businesses and what they offer.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push("/shop")}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#EAE6DF] bg-white px-3 py-2 text-[11px] font-semibold text-[#9F2D18] transition hover:border-[#FFB9A7] hover:bg-[#FFF7F4] sm:px-4 sm:text-xs"
                    >
                      View all
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {businessLoading && (
                    <div className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-sm">
                      <div className="grid animate-pulse md:grid-cols-[0.95fr_1.05fr]">
                        <div className="min-h-[220px] bg-[#F2EEE8] sm:min-h-[270px]" />
                        <div className="flex flex-col justify-center gap-4 p-5 sm:p-8">
                          <div className="h-3 w-28 rounded bg-gray-200" />
                          <div className="h-6 w-3/4 rounded bg-gray-200" />
                          <div className="h-3 w-full rounded bg-gray-100" />
                          <div className="h-3 w-2/3 rounded bg-gray-100" />
                          <div className="mt-2 h-10 w-36 rounded-xl bg-gray-200" />
                        </div>
                      </div>
                    </div>
                  )}

                  {!businessLoading && featuredBusinesses.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-white px-5 py-10 text-center sm:py-12">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF1ED] text-[#FF5A36]">
                        <Store className="h-7 w-7" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-[#17202A]">
                        No businesses to feature yet
                      </p>
                      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-gray-500">
                        Local businesses will appear here as their profiles are added to ReMarket.
                      </p>
                    </div>
                  )}

                  {!businessLoading && featuredBusinesses.length > 0 && (() => {
                    const business = featuredBusinesses[activeFeaturedIndex] ?? featuredBusinesses[0];
                    const category = business.category || business.categories?.[0] || "Services";
                    const style = getCategoryVisual(category);
                    const location = business.area || "Local";
                    const isSaved = savedBusinessIds.has(business.id);
                    const availabilityLabel = business.availability === "AVAILABLE"
                      ? "Available"
                      : business.availability === "UNAVAILABLE"
                        ? "Check later"
                        : "Ask the seller";

                    return (
                      <div className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_10px_35px_rgba(23,32,42,0.06)] transition-shadow duration-300 hover:shadow-[0_14px_42px_rgba(23,32,42,0.09)]">
                        <div className="grid md:grid-cols-[0.95fr_1.05fr]">
                          <Link
                            href={`/seller/${business.id}`}
                            aria-label={`View ${business.name}`}
                            className="group relative isolate flex min-h-[220px] items-center justify-center overflow-hidden sm:min-h-[280px] md:min-h-[318px]"
                            style={{ backgroundColor: style.bg }}
                          >
                            {business.imageUrl ? (
                              <img
                                src={business.imageUrl}
                                alt={business.name}
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                              />
                            ) : (
                              <div className="flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/70 bg-white/75 text-[#17202A]/70 shadow-lg backdrop-blur-sm sm:h-28 sm:w-28">
                                <Store className="h-11 w-11 sm:h-12 sm:w-12" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#17202A]/65 via-[#17202A]/10 to-[#17202A]/5" />
                            <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-white/40 bg-white/90 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#17202A] shadow-sm backdrop-blur-sm sm:left-5 sm:top-5">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />
                              Business spotlight
                            </div>
                            <div className="absolute inset-x-4 bottom-4 text-left sm:inset-x-5 sm:bottom-5">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">Discover around you</p>
                              <p className="mt-1 line-clamp-1 text-xl font-bold tracking-tight text-white drop-shadow sm:text-2xl">
                                {business.name}
                              </p>
                            </div>
                          </Link>

                          <div className="flex min-w-0 flex-col justify-between p-5 sm:p-7 lg:p-8">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full px-3 py-1 text-[10px] font-semibold text-[#17202A]" style={{ backgroundColor: style.bg }}>
                                  {category}
                                </span>
                                {business.verification === "VERIFIED" && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-[#DDF5EA] px-2.5 py-1 text-[10px] font-semibold text-[#137A59]">
                                    <span aria-hidden="true">✓</span> Verified
                                  </span>
                                )}
                              </div>
                              <Link
                                href={`/seller/${business.id}`}
                                className="mt-4 block text-xl font-bold leading-tight tracking-tight text-[#17202A] transition hover:text-[#9F2D18] sm:text-2xl lg:text-[28px]"
                              >
                                {business.name}
                              </Link>
                              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#FF5A36]" />
                                <span className="truncate">{location}</span>
                              </p>
                              <p className="mt-4 line-clamp-3 text-sm leading-6 text-gray-600">
                                {business.description?.trim() || `Discover products and services from ${business.name} on ReMarket. Contact the business directly to confirm details and availability.`}
                              </p>
                            </div>

                            <div className="mt-6">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#F0ECE7] pt-4 text-[11px] text-gray-500">
                                <span className="inline-flex items-center gap-1.5">
                                  <Package className="h-3.5 w-3.5 text-[#FF5A36]" />
                                  <strong className="font-semibold text-[#17202A]">{business.productCount}</strong>
                                  {business.productCount === 1 ? "listing" : "listings"}
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${business.availability === "AVAILABLE" ? "bg-[#1B9A6C]" : business.availability === "UNAVAILABLE" ? "bg-gray-400" : "bg-[#E2A32B]"}`} />
                                  {availabilityLabel}
                                </span>
                              </div>
                              <div className="mt-4 flex items-center gap-3">
                                <Link
                                  href={`/seller/${business.id}`}
                                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#E94A28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 sm:flex-none sm:min-w-[170px]"
                                >
                                  Explore business
                                  <ArrowRight className="h-4 w-4" />
                                </Link>
                                <button
                                  type="button"
                                  aria-label={isSaved ? `Remove ${business.name} from saved` : `Save ${business.name}`}
                                  aria-pressed={isSaved}
                                  onClick={(event) => handleSaveBusiness(event, business, category, location)}
                                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 ${isSaved ? "border-[#FFD1C5] bg-[#FFF1ED] text-[#FF5A36]" : "border-[#EAE6DF] bg-white text-gray-500 hover:border-[#FFB9A7] hover:text-[#9F2D18]"}`}
                                >
                                  <Bookmark className="h-4 w-4" fill={isSaved ? "currentColor" : "none"} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {featuredBusinesses.length > 1 && (
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0ECE7] bg-[#FCFAF6] px-4 py-3 sm:px-5">
                            <div className="flex items-center gap-2" aria-label={`Slide ${activeFeaturedIndex + 1} of ${featuredBusinesses.length}`}>
                              <span className="font-mono text-xs font-bold tabular-nums text-[#9F2D18]">{String(activeFeaturedIndex + 1).padStart(2, "0")}</span>
                              <span className="text-xs text-gray-400">/ {String(featuredBusinesses.length).padStart(2, "0")}</span>
                              <div className="ml-2 flex items-center gap-1.5" aria-label="Choose featured business">
                                {featuredBusinesses.map((item, index) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    aria-label={`Show featured business ${index + 1}: ${item.name}`}
                                    aria-current={index === activeFeaturedIndex ? "true" : undefined}
                                    onClick={() => setActiveFeaturedIndex(index)}
                                    className={`h-1.5 rounded-full transition-all duration-300 ${index === activeFeaturedIndex ? "w-7 bg-[#FF5A36]" : "w-1.5 bg-[#D8D2CA] hover:bg-[#B7ADA1]"}`}
                                  />
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                aria-label={featuredAutoplayPaused ? "Resume slideshow" : "Pause slideshow"}
                                aria-pressed={featuredAutoplayPaused}
                                onClick={() => setFeaturedAutoplayPaused((paused) => !paused)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#EAE6DF] bg-white text-gray-600 transition hover:border-[#FFB9A7] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                              >
                                {featuredAutoplayPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                aria-label="Previous featured business"
                                onClick={() => setActiveFeaturedIndex((index) => (index - 1 + featuredBusinesses.length) % featuredBusinesses.length)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#EAE6DF] bg-white text-[#17202A] transition hover:border-[#FFB9A7] hover:bg-[#FFF1ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                aria-label="Next featured business"
                                onClick={() => setActiveFeaturedIndex((index) => (index + 1) % featuredBusinesses.length)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#EAE6DF] bg-white text-[#17202A] transition hover:border-[#FFB9A7] hover:bg-[#FFF1ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
          {/* Mobile Navigation */}
          <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden">
            <div className="grid w-full grid-cols-4">
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
                      className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 ${item.label ===
                        "Home"
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
