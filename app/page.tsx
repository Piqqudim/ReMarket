"use client";

import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { getSession, signOut } from "next-auth/react";
import Link from "next/link";
import {
  Home,
  ShoppingBag,
  Wrench,
  UserCircle,
  Search,
  ArrowRight,
  Package,
  Loader2,
  LogOut,
  Share2,
  Store,
  Sparkles,
} from "lucide-react";

import NotificationBell from "@/components/NotificationBell";

type AccountRole = "ADMIN" | "BUYER" | "SELLER";

type HomepageAccount = {
  id: string | null;
  name: string | null;
  email: string | null;
  role: AccountRole | null;
};

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

const PRODUCT_FEED_URL =
  "/api/recent-products?page=1&pageSize=8";

/*
 * The service feed is expected to return:
 *
 * {
 *   services: [
 *     {
 *       id, name, description, price, priceMin, priceMax,
 *       imageUrl, category, business
 *     }
 *   ]
 * }
 *
 * If this endpoint has not been implemented yet, the homepage
 * will display the service empty state instead of fake listings.
 */
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
  if (typeof value !== "string") {
    return null;
  }

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
  if (!isRecord(value)) {
    return null;
  }

  if (
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
      : null,
  };
}

function parseRecentService(
  value: unknown,
): RecentService | null {
  if (!isRecord(value)) {
    return null;
  }

  const id =
    typeof value.id === "string"
      ? value.id
      : null;

  const name =
    cleanString(value.name) ??
    cleanString(value.title);

  if (!id || !name) {
    return null;
  }

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
      : null,
  };
}

async function fetchHomepageJson(
  url: string,
  signal: AbortSignal,
  label: string,
): Promise<JsonResult> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal,
    });

    // A missing service endpoint should not break the homepage.
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `${label} returned HTTP ${response.status}.`,
      );
    }

    const data: unknown = await response.json();

    return isRecord(data) ? data : null;
  } catch (error) {
    if (!signal.aborted) {
      console.error(`Failed to load ${label}:`, error);
    }

    return null;
  }
}

function parseAccountRole(
  value: unknown,
): AccountRole | null {
  if (
    value === "ADMIN" ||
    value === "BUYER" ||
    value === "SELLER"
  ) {
    return value;
  }

  return null;
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}

function formatProductPrice(
  product: RecentProduct,
): string {
  if (product.price !== null) {
    return formatNaira(product.price);
  }

  if (
    product.priceMin !== null &&
    product.priceMax !== null
  ) {
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

  return "Price unavailable";
}

function formatServicePrice(
  service: RecentService,
): string {
  if (service.price !== null) {
    return formatNaira(service.price);
  }

  if (
    service.priceMin !== null &&
    service.priceMax !== null
  ) {
    if (service.priceMin === service.priceMax) {
      return formatNaira(service.priceMin);
    }

    return `${formatNaira(service.priceMin)} – ${formatNaira(service.priceMax)}`;
  }

  if (service.priceMin !== null) {
    return `From ${formatNaira(service.priceMin)}`;
  }

  if (service.priceMax !== null) {
    return `Up to ${formatNaira(service.priceMax)}`;
  }

  return "Contact for price";
}

export default function HomePage() {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
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

  const [shareFeedback, setShareFeedback] = useState("");

  const [currentAccount, setCurrentAccount] =
    useState<HomepageAccount | null>(null);
  const [accountStatusLoading, setAccountStatusLoading] =
    useState(true);
  const [accountSessionError, setAccountSessionError] =
    useState(false);

  const [accountMenuOpen, setAccountMenuOpen] =
    useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountMenuError, setAccountMenuError] =
    useState("");

  const accountMenuRef =
    useRef<HTMLDivElement | null>(null);
  const accountRequestVersionRef = useRef(0);

  /*
   * -----------------------------------------
   * LOAD PRODUCT AND SERVICE FEEDS
   * -----------------------------------------
   *
   * Products and services load independently.
   * If one endpoint fails, the other section can
   * still display its available listings.
   */
  useEffect(() => {
    const controller = new AbortController();

    async function loadHomepageFeeds() {
      const [productData, serviceData] =
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

      if (controller.signal.aborted) {
        return;
      }

      const rawProducts = Array.isArray(
        productData?.products,
      )
        ? productData.products
        : [];

      const parsedProducts = rawProducts
        .map(parseRecentProduct)
        .filter(
          (item): item is RecentProduct =>
            item !== null,
        )
        .slice(0, MAX_HOME_PRODUCTS);

      setProducts(parsedProducts);
      setProductsLoading(false);

      const rawServices = Array.isArray(
        serviceData?.services,
      )
        ? serviceData.services
        : [];

      const parsedServices = rawServices
        .map(parseRecentService)
        .filter(
          (item): item is RecentService =>
            item !== null,
        )
        .slice(0, MAX_HOME_SERVICES);

      setServices(parsedServices);
      setServicesLoading(false);
    }

    void loadHomepageFeeds().catch((error) => {
      if (controller.signal.aborted) {
        return;
      }

      console.error(
        "Unexpected homepage loading error:",
        error,
      );

      setProducts([]);
      setServices([]);
      setProductsLoading(false);
      setServicesLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, []);

  /*
   * -----------------------------------------
   * ACCOUNT SESSION
   * -----------------------------------------
   */
  useEffect(() => {
    let cancelled = false;

    async function refreshAccountSession() {
      const requestVersion =
        ++accountRequestVersionRef.current;

      try {
        const session = await getSession();

        if (
          cancelled ||
          requestVersion !==
            accountRequestVersionRef.current
        ) {
          return;
        }

        const rawUser = session?.user as
          | {
              id?: unknown;
              name?: unknown;
              email?: unknown;
              role?: unknown;
            }
          | undefined;

        if (!rawUser) {
          setCurrentAccount(null);
          setAccountSessionError(false);
          return;
        }

        setCurrentAccount({
          id:
            typeof rawUser.id === "string"
              ? rawUser.id
              : null,
          name:
            typeof rawUser.name === "string"
              ? rawUser.name
              : null,
          email:
            typeof rawUser.email === "string"
              ? rawUser.email
              : null,
          role: parseAccountRole(rawUser.role),
        });

        setAccountSessionError(false);
      } catch (error) {
        console.error(
          "Unable to load homepage account session:",
          error,
        );

        if (!cancelled) {
          setAccountSessionError(true);
        }
      } finally {
        if (
          !cancelled &&
          requestVersion ===
            accountRequestVersionRef.current
        ) {
          setAccountStatusLoading(false);
        }
      }
    }

    function handleWindowFocus() {
      void refreshAccountSession();
    }

    void refreshAccountSession();

    window.addEventListener(
      "focus",
      handleWindowFocus,
    );

    return () => {
      cancelled = true;
      accountRequestVersionRef.current += 1;

      window.removeEventListener(
        "focus",
        handleWindowFocus,
      );
    };
  }, []);

  /*
   * Close the account menu when the user
   * clicks outside it or presses Escape.
   */
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

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [accountMenuOpen]);

  const accountDestination =
    currentAccount?.role === "SELLER"
      ? "/seller"
      : currentAccount?.role === "ADMIN"
        ? "/admin"
        : "/profile";

  /*
   * -----------------------------------------
   * SEARCH
   * -----------------------------------------
   */
  function handleSearch(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const query = searchQuery.trim();

    if (!query) {
      return;
    }

    const params = new URLSearchParams({
      q: query,
    });

    if (discoveryMode === "PRODUCTS") {
      params.set("type", "product");
    } else if (discoveryMode === "SERVICES") {
      params.set("type", "service");
    }

    router.push(`/search?${params.toString()}`);
  }

  function renderSearchForm(
    variant: "desktop" | "mobile",
  ) {
    return (
      <form
        onSubmit={handleSearch}
        role="search"
        className={`flex h-12 items-center rounded-full border border-[#EAE6DF] bg-[#FCFAF6] p-1.5 transition focus-within:border-[#FF9A81] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#FF5A36]/10 ${
          variant === "desktop"
            ? "w-full max-w-[590px]"
            : "w-full"
        }`}
      >
        <Search
          className="ml-3 h-5 w-5 shrink-0 text-[#81766C]"
          aria-hidden="true"
        />

        <input
          type="search"
          value={searchQuery}
          onChange={(event) =>
            setSearchQuery(event.target.value)
          }
          placeholder="Search for products or services..."
          aria-label="Search for products or services"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#17202A] outline-none placeholder:text-[#91877E]"
        />

        <button
          type="submit"
          aria-label="Search ReMarket"
          className="flex h-9 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF5A36] text-white transition hover:bg-[#E94A28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2"
        >
          <Search
            className="h-4 w-4"
            aria-hidden="true"
          />
        </button>
      </form>
    );
  }

  /*
   * -----------------------------------------
   * ACCOUNT ACTIONS
   * -----------------------------------------
   */
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
      console.error(
        "Homepage logout failed:",
        error,
      );

      setAccountMenuError(
        "We couldn't log you out. Please try again.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

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

        setShareFeedback(
          "Thanks for sharing ReMarket.",
        );

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
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(
          shareUrl,
        );

        setShareFeedback(
          "ReMarket link copied. Share it with someone.",
        );

        return;
      }
    } catch (error) {
      console.error(
        "Unable to copy the ReMarket link:",
        error,
      );
    }

    setShareFeedback(
      `Copy this website address to share: ${shareUrl}`,
    );
  }

  /*
   * -----------------------------------------
   * ACCOUNT MENU
   * -----------------------------------------
   */
  const accountMenu = (
    <div
      ref={accountMenuRef}
      className="relative shrink-0"
    >
      <button
        type="button"
        onClick={() => {
          setAccountMenuError("");
          setAccountMenuOpen((open) => !open);
        }}
        aria-label={
          currentAccount
            ? "Open account menu"
            : "Login or create an account"
        }
        aria-expanded={accountMenuOpen}
        aria-haspopup="menu"
        title={
          currentAccount
            ? "My account"
            : "Login or create an account"
        }
        className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 ${
          currentAccount
            ? "bg-[#FFE0D6] text-[#9F2D18]"
            : "bg-[#FCFAF6] text-[#5F554D] hover:bg-[#FFF0D9]"
        }`}
      >
        {currentAccount?.role === "SELLER" ? (
          <Store
            className="h-5 w-5"
            aria-hidden="true"
          />
        ) : (
          <UserCircle
            className="h-6 w-6"
            aria-hidden="true"
          />
        )}
      </button>

      {accountMenuOpen && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-full z-[90] mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_14px_40px_rgba(23,32,42,0.16)]"
        >
          {accountStatusLoading ? (
            <div
              role="status"
              className="flex items-center gap-2 p-4 text-sm text-[#756B61]"
            >
              <Loader2
                className="h-4 w-4 animate-spin text-[#FF5A36]"
                aria-hidden="true"
              />
              Checking your account...
            </div>
          ) : currentAccount ? (
            <>
              <div className="border-b border-[#EAE6DF] bg-[#FCFAF6] p-4">
                <p className="truncate text-sm font-bold text-[#17202A]">
                  {currentAccount.name ||
                    currentAccount.email ||
                    "My account"}
                </p>

                {currentAccount.name &&
                  currentAccount.email && (
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
                    Your session has no recognized
                    account role. Some account links
                    may be unavailable.
                  </p>
                )}
              </div>

              {currentAccount.role === "ADMIN" ? (
                <Link
                  href="/admin"
                  role="menuitem"
                  onClick={() =>
                    setAccountMenuOpen(false)
                  }
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                >
                  <Store
                    className="h-4 w-4 text-[#FF5A36]"
                    aria-hidden="true"
                  />
                  Admin dashboard
                </Link>
              ) : currentAccount.role === "SELLER" ? (
                <>
                  <Link
                    href="/seller"
                    role="menuitem"
                    onClick={() =>
                      setAccountMenuOpen(false)
                    }
                    className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                  >
                    <Store
                      className="h-4 w-4 text-[#FF5A36]"
                      aria-hidden="true"
                    />
                    Seller dashboard
                  </Link>

                  <Link
                    href="/seller/profile"
                    role="menuitem"
                    onClick={() =>
                      setAccountMenuOpen(false)
                    }
                    className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                  >
                    <UserCircle
                      className="h-4 w-4 text-[#756B61]"
                      aria-hidden="true"
                    />
                    Seller profile
                  </Link>
                </>
              ) : (
                <Link
                  href="/profile"
                  role="menuitem"
                  onClick={() =>
                    setAccountMenuOpen(false)
                  }
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                >
                  <UserCircle
                    className="h-4 w-4 text-[#FF5A36]"
                    aria-hidden="true"
                  />
                  My profile
                </Link>
              )}

              {currentAccount.role !== "ADMIN" && (
                <>
                  <Link
                    href="/my-requests"
                    role="menuitem"
                    onClick={() =>
                      setAccountMenuOpen(false)
                    }
                    className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                  >
                    <Package
                      className="h-4 w-4 text-[#756B61]"
                      aria-hidden="true"
                    />
                    My requests
                  </Link>

                  <Link
                    href="/saved"
                    role="menuitem"
                    onClick={() =>
                      setAccountMenuOpen(false)
                    }
                    className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                  >
                    <ShoppingBag
                      className="h-4 w-4 text-[#756B61]"
                      aria-hidden="true"
                    />
                    Saved items
                  </Link>
                </>
              )}

              {currentAccount.role === "BUYER" && (
                <div className="border-t border-[#EAE6DF] p-3">
                  <Link
                    href="/profile#seller-onboarding"
                    role="menuitem"
                    onClick={() =>
                      setAccountMenuOpen(false)
                    }
                    className="flex items-center justify-between gap-3 rounded-xl bg-[#FFF0D9] p-3 transition hover:bg-[#FFE0D6]"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-[#9F2D18]">
                        Have a business?
                      </span>

                      <span className="mt-1 block text-[11px] leading-4 text-[#756B61]">
                        Start selling on ReMarket.
                      </span>
                    </span>

                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-[#9F2D18]"
                      aria-hidden="true"
                    />
                  </Link>
                </div>
              )}

              <div className="border-t border-[#EAE6DF] p-2">
                <button
                  type="button"
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={() => {
                    void handleAccountLogout();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFF0D9] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loggingOut ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <LogOut
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  )}

                  {loggingOut
                    ? "Logging out..."
                    : "Log out"}
                </button>

                {accountMenuError && (
                  <p
                    role="alert"
                    className="px-3 pb-2 text-xs leading-5 text-red-600"
                  >
                    {accountMenuError}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-[#EAE6DF] bg-[#FCFAF6] p-4">
                <p className="text-sm font-bold text-[#17202A]">
                  Welcome to ReMarket
                </p>

                <p className="mt-1 text-xs leading-5 text-[#756B61]">
                  Sign in to access your account,
                  manage your activity and find your
                  saved items.
                </p>

                {accountSessionError && (
                  <p
                    role="alert"
                    className="mt-2 text-[11px] leading-4 text-[#9F2D18]"
                  >
                    We could not verify your
                    session. Refresh this page if
                    you have already signed in.
                  </p>
                )}
              </div>

              <Link
                href="/buyer/login"
                role="menuitem"
                onClick={() =>
                  setAccountMenuOpen(false)
                }
                className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6]"
              >
                <UserCircle
                  className="h-4 w-4 text-[#FF5A36]"
                  aria-hidden="true"
                />
                Buyer login
              </Link>

              <Link
                href="/seller/login"
                role="menuitem"
                onClick={() =>
                  setAccountMenuOpen(false)
                }
                className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6]"
              >
                <Store
                  className="h-4 w-4 text-[#756B61]"
                  aria-hidden="true"
                />
                Seller login
              </Link>

              <div className="border-t border-[#EAE6DF] p-3">
                <Link
                  href="/buyer/signup"
                  onClick={() =>
                    setAccountMenuOpen(false)
                  }
                  className="flex min-h-10 items-center justify-center rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94A28]"
                >
                  Create buyer account
                </Link>

                <Link
                  href="/seller/signup"
                  onClick={() =>
                    setAccountMenuOpen(false)
                  }
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

  /*
   * -----------------------------------------
   * DISCOVERY FILTERS
   * -----------------------------------------
   */
  const discoveryFilters: {
    label: string;
    value: DiscoveryMode;
  }[] = [
    {
      label: "All",
      value: "ALL",
    },
    {
      label: "Products",
      value: "PRODUCTS",
    },
    {
      label: "Services",
      value: "SERVICES",
    },
  ];

  const showProducts =
    discoveryMode === "ALL" ||
    discoveryMode === "PRODUCTS";

  const showServices =
    discoveryMode === "ALL" ||
    discoveryMode === "SERVICES";

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-24 text-[#17202A] lg:pb-0">
      {/* =====================================
          HEADER
          Google Play-inspired search layout
         ===================================== */}
      <header className="sticky top-0 z-40 border-b border-[#EAE6DF] bg-white/95 shadow-[0_2px_12px_rgba(23,32,42,0.035)] backdrop-blur">
        {/* Desktop header */}
        <div className="mx-auto hidden min-h-[76px] max-w-[1600px] items-center gap-7 px-6 lg:flex xl:px-10">
          <Link
            href="/"
            aria-label="ReMarket home"
            className="flex w-[205px] shrink-0 items-center gap-3"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
              <ShoppingBag
                className="h-6 w-6"
                aria-hidden="true"
              />
            </span>

            <span className="text-[22px] font-extrabold tracking-tight text-[#9F2D18]">
              ReMarket
            </span>
          </Link>

          <div className="flex min-w-0 flex-1 items-center justify-center">
            {renderSearchForm("desktop")}
          </div>

          <nav
            aria-label="Main navigation"
            className="flex shrink-0 items-center gap-2"
          >
            <Link
              href="/shop"
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-[#514840] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18]"
            >
              Products
            </Link>

            <Link
              href="/services"
              className="rounded-full px-4 py-2.5 text-sm font-semibold text-[#514840] transition hover:bg-[#FFF1ED] hover:text-[#9F2D18]"
            >
              Services
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <NotificationBell />
            {accountMenu}
          </div>
        </div>

        {/* Mobile header */}
        <div className="mx-auto max-w-[900px] px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              aria-label="ReMarket home"
              className="flex min-w-0 items-center gap-2.5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                <ShoppingBag
                  className="h-5 w-5"
                  aria-hidden="true"
                />
              </span>

              <span className="truncate text-xl font-extrabold tracking-tight text-[#9F2D18]">
                ReMarket
              </span>
            </Link>

            <div className="flex shrink-0 items-center gap-3">
              <NotificationBell />
              {accountMenu}
            </div>
          </div>

          <div className="mt-3">
            {renderSearchForm("mobile")}
          </div>
        </div>
      </header>

      {/* =====================================
          PAGE CONTENT
         ===================================== */}
      <div className="mx-auto max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-7 xl:px-10">
        {/* =====================================
            HERO
           ===================================== */}
        <section className="relative isolate overflow-hidden rounded-[26px] border border-[#FFE0D5] bg-gradient-to-r from-[#FFF0E7] via-[#FFF4EC] to-[#FFE0D4] px-5 py-7 sm:px-8 sm:py-9 lg:min-h-[300px] lg:px-11 lg:py-10">
          {/* Decorative background shapes */}
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

            {/* Decorative product and service visual */}
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
            POPULAR PRODUCTS
           ===================================== */}
        {showProducts && (
          <section
            id="popular-products"
            className="mt-8 scroll-mt-24 sm:mt-10"
            aria-labelledby="popular-products-heading"
          >
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFD9CE] bg-[#FFF1ED] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#9F2D18]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />
                  Discover products
                </div>

                <h2
                  id="popular-products-heading"
                  className="text-xl font-extrabold tracking-tight text-[#401B13] sm:text-2xl"
                >
                  Popular Products
                </h2>

                <p className="mt-1 text-xs text-[#756B61] sm:text-sm">
                  Explore products available on ReMarket.
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
                {Array.from({ length: 4 }).map(
                  (_, index) => (
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
                  ),
                )}
              </div>
            )}

            {!productsLoading && products.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
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

                      <p className="mt-2 line-clamp-1 text-[11px] font-extrabold text-[#9F2D18] sm:text-sm">
                        {formatProductPrice(product)}
                      </p>

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

            {!productsLoading && products.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-9 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm">
                  <Package className="h-6 w-6" />
                </div>

                <p className="mt-3 text-sm font-bold text-[#17202A]">
                  Products will appear here
                </p>

                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#756B61]">
                  As products are added to ReMarket,
                  you will be able to discover them here.
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
            OUR SERVICES
           ===================================== */}
        {showServices && (
          <section
            id="our-services"
            className="mt-9 scroll-mt-24 sm:mt-11"
            aria-labelledby="our-services-heading"
          >
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#FFD9CE] bg-[#FFF1ED] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#9F2D18]">
                  <Wrench
                    className="h-3 w-3"
                    aria-hidden="true"
                  />
                  Find a service
                </div>

                <h2
                  id="our-services-heading"
                  className="text-xl font-extrabold tracking-tight text-[#401B13] sm:text-2xl"
                >
                  Our Services
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
                {Array.from({ length: 4 }).map(
                  (_, index) => (
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
                  ),
                )}
              </div>
            )}

            {!servicesLoading && services.length > 0 && (
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

                      <p className="mt-2 line-clamp-1 text-[11px] font-extrabold text-[#9F2D18] sm:text-sm">
                        {formatServicePrice(service)}
                      </p>

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

            {!servicesLoading && services.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#E8E4DE] bg-[#FCFAF6] px-5 py-9 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm">
                  <Wrench className="h-6 w-6" />
                </div>

                <p className="mt-3 text-sm font-bold text-[#17202A]">
                  Services are coming to ReMarket
                </p>

                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#756B61]">
                  Service listings will appear here as
                  providers add their services.
                </p>
              </div>
            )}
          </section>
        )}

        {/* =====================================
            SHARE / INVITE
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
              onClick={() => {
                void handleShareReMarket();
              }}
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

      {/* =====================================
          MOBILE BOTTOM NAVIGATION
          Exactly four tabs:
          Home / Products / Services / Account
         ===================================== */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[#EAE6DF] bg-white/95 px-2 pt-2 backdrop-blur lg:hidden"
        style={{
          paddingBottom:
            "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto grid w-full max-w-[600px] grid-cols-4">
          <Link
            href="/"
            aria-current="page"
            className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl text-[#FF5A36]"
          >
            <Home
              className="h-5 w-5"
              aria-hidden="true"
            />
            <span className="text-[10px] font-bold">
              Home
            </span>
          </Link>

          <Link
            href="/shop"
            className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl text-[#756B61] transition hover:bg-[#FFF7F4] hover:text-[#9F2D18]"
          >
            <ShoppingBag
              className="h-5 w-5"
              aria-hidden="true"
            />
            <span className="text-[10px] font-semibold">
              Products
            </span>
          </Link>

          <Link
            href="/services"
            className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl text-[#756B61] transition hover:bg-[#FFF7F4] hover:text-[#9F2D18]"
          >
            <Wrench
              className="h-5 w-5"
              aria-hidden="true"
            />
            <span className="text-[10px] font-semibold">
              Services
            </span>
          </Link>

          <Link
            href={
              currentAccount
                ? accountDestination
                : "/buyer/login"
            }
            className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl text-[#756B61] transition hover:bg-[#FFF7F4] hover:text-[#9F2D18]"
          >
            <UserCircle
              className="h-5 w-5"
              aria-hidden="true"
            />
            <span className="text-[10px] font-semibold">
              Account
            </span>
          </Link>
        </div>
      </nav>
    </main>
  );
}