"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession, signOut } from "next-auth/react";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  Loader2,
  LogOut,
  MapPin,
  Search,
  ShoppingBag,
  ShoppingCart,
  Store,
  UserCircle,
} from "lucide-react";

import NotificationBell from "@/components/NotificationBell";

type AccountRole = "ADMIN" | "BUYER" | "SELLER";
type DiscoveryMode = "ALL" | "PRODUCTS" | "SERVICES";
type SiteHeaderProps = { searchMode?: DiscoveryMode };

type HeaderAccount = {
  id: string | null;
  name: string | null;
  email: string | null;
  role: AccountRole | null;
};

type HeaderCategory = {
  id: string;
  name: string;
  iconKey?: string;
  imageUrl?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  children: HeaderCategory[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAccountRole(value: unknown): AccountRole | null {
  return value === "ADMIN" || value === "BUYER" || value === "SELLER"
    ? value
    : null;
}

function parseCartCount(value: unknown): number {
  if (!isRecord(value)) return 0;
  const count = value.itemCount;
  return typeof count === "number" && Number.isFinite(count)
    ? Math.max(0, Math.floor(count))
    : 0;
}

function parseHeaderCategory(value: unknown): HeaderCategory | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }

  const children = Array.isArray(value.children)
    ? value.children
        .map(parseHeaderCategory)
        .filter((item): item is HeaderCategory => item !== null)
    : [];

  return {
    id: value.id,
    name: value.name,
    iconKey: typeof value.iconKey === "string" ? value.iconKey : undefined,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : null,
    parentId: typeof value.parentId === "string" ? value.parentId : null,
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : 0,
    children,
  };
}

function sortCategoryTree(categories: HeaderCategory[]): HeaderCategory[] {
  return [...categories]
    .sort((a, b) => {
      const difference = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      return difference || a.name.localeCompare(b.name);
    })
    .map((category) => ({
      ...category,
      children: sortCategoryTree(category.children),
    }));
}

function buildCategoryTree(payload: unknown): HeaderCategory[] {
  if (!isRecord(payload)) return [];

  if (Array.isArray(payload.navigationCategories)) {
    const nested = payload.navigationCategories
      .map(parseHeaderCategory)
      .filter((item): item is HeaderCategory => item !== null);

    if (nested.length > 0) return sortCategoryTree(nested);
  }

  if (!Array.isArray(payload.categories)) return [];

  const flat = payload.categories
    .map(parseHeaderCategory)
    .filter((item): item is HeaderCategory => item !== null);

  const byId = new Map<string, HeaderCategory>(
    flat.map((category) => [category.id, { ...category, children: [] }]),
  );
  const roots: HeaderCategory[] = [];

  for (const source of flat) {
    const current = byId.get(source.id);
    if (!current) continue;

    const parent = current.parentId ? byId.get(current.parentId) : undefined;
    if (parent && parent.id !== current.id) {
      parent.children.push(current);
    } else {
      roots.push(current);
    }
  }

  return sortCategoryTree(roots.length > 0 ? roots : flat);
}

function categorySearchHref(category: HeaderCategory): string {
  const params = new URLSearchParams({
    type: "product",
    category: category.name,
    categoryId: category.id,
  });
  return `/search?${params.toString()}`;
}

export default function SiteHeader(_props: SiteHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState("");
  const [account, setAccount] = useState<HeaderAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountMenuError, setAccountMenuError] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [categories, setCategories] = useState<HeaderCategory[]>([]);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [mobileCategoryId, setMobileCategoryId] = useState<string | null>(null);

  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function refreshAccount() {
      const requestVersion = ++requestVersionRef.current;
      try {
        const session = await getSession();
        if (cancelled || requestVersion !== requestVersionRef.current) return;

        const rawUser = session?.user as
          | { id?: unknown; name?: unknown; email?: unknown; role?: unknown }
          | undefined;

        if (!rawUser) {
          setAccount(null);
          setSessionError(false);
          return;
        }

        setAccount({
          id: typeof rawUser.id === "string" ? rawUser.id : null,
          name: typeof rawUser.name === "string" ? rawUser.name : null,
          email: typeof rawUser.email === "string" ? rawUser.email : null,
          role: parseAccountRole(rawUser.role),
        });
        setSessionError(false);
      } catch (error) {
        console.error("Header session error:", error);
        if (!cancelled) setSessionError(true);
      } finally {
        if (!cancelled && requestVersion === requestVersionRef.current) {
          setAccountLoading(false);
        }
      }
    }

    const handleWindowFocus = () => void refreshAccount();
    void refreshAccount();
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      cancelled = true;
      requestVersionRef.current += 1;
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch(
          "/api/categories?type=product&includeEmpty=true",
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Category request failed (${response.status}).`);
        }

        const data: unknown = await response.json();
        if (!controller.signal.aborted) setCategories(buildCategoryTree(data));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Header category navigation error:", error);
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (account?.role !== "BUYER") {
      setCartCount(0);
      return;
    }

    let cancelled = false;

    async function refreshCartCount() {
      try {
        const response = await fetch("/api/cart", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (response.status === 401 || response.status === 403) {
          if (!cancelled) setCartCount(0);
          return;
        }
        if (!response.ok) throw new Error(`Cart request failed (${response.status}).`);

        const data: unknown = await response.json();
        if (!cancelled) setCartCount(parseCartCount(data));
      } catch (error) {
        console.error("Header cart count error:", error);
      }
    }

    const handleCartChanged = () => void refreshCartCount();
    window.addEventListener("remarket-cart-changed", handleCartChanged);
    window.addEventListener("focus", handleCartChanged);
    void refreshCartCount();

    return () => {
      cancelled = true;
      window.removeEventListener("remarket-cart-changed", handleCartChanged);
      window.removeEventListener("focus", handleCartChanged);
    };
  }, [account?.role]);

  useEffect(() => {
    if (!accountMenuOpen) return;

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
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    setAccountMenuOpen(false);
    setAccountMenuError("");
    setOpenCategoryId(null);
    setMobileCategoryId(null);
  }, [pathname]);

  function closeAccountMenu() {
    setAccountMenuOpen(false);
    setAccountMenuError("");
  }

  function closeCategoryMenus() {
    setOpenCategoryId(null);
    setMobileCategoryId(null);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    const params = new URLSearchParams({ q: query, type: "product" });
    closeAccountMenu();
    closeCategoryMenus();
    router.push(`/search?${params.toString()}`);
  }

  function renderSearchForm() {
    return (
      <form
        onSubmit={handleSearch}
        role="search"
        className="flex h-12 w-full items-center rounded-full border border-[#EAE6DF] bg-[#FCFAF6] p-1.5 transition focus-within:border-[#FF9A81] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#FF5A36]/10"
      >
        <Search className="ml-3 h-5 w-5 shrink-0 text-[#81766C]" aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search products nearby..."
          aria-label="Search products"
          autoComplete="off"
          maxLength={100}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#17202A] outline-none placeholder:text-[#91877E]"
        />
        <button
          type="submit"
          aria-label="Search products"
          disabled={!searchQuery.trim()}
          className="flex h-9 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF5A36] text-white transition hover:bg-[#E94A28] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    );
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setAccountMenuError("");

    try {
      await signOut({ redirect: false, callbackUrl: "/" });
      setAccount(null);
      setSessionError(false);
      setAccountMenuOpen(false);
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);
      setAccountMenuError("We couldn't log you out. Please try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  const productsActive =
    pathname === "/shop" ||
    pathname.startsWith("/shop/") ||
    pathname.startsWith("/product/") ||
    pathname === "/search" ||
    pathname.startsWith("/search/");
  const showDesktopNavigation = pathname !== "/";

  function desktopLinkClass(active: boolean) {
    return `rounded-full px-3 py-2.5 text-sm font-semibold transition ${
      active
        ? "bg-[#FFF1ED] text-[#9F2D18]"
        : "text-[#514840] hover:bg-[#FFF1ED] hover:text-[#9F2D18]"
    }`;
  }

  const activeCategory = categories.find((category) => category.id === openCategoryId);

  const accountMenuContent = (
    <div
      role="group"
      aria-label="Account options"
      className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_14px_40px_rgba(23,32,42,0.16)]"
    >
      {accountLoading ? (
        <div role="status" className="flex items-center gap-2 p-4 text-sm text-[#756B61]">
          <Loader2 className="h-4 w-4 animate-spin text-[#FF5A36]" aria-hidden="true" />
          Checking your account...
        </div>
      ) : account ? (
        <>
          <div className="border-b border-[#EAE6DF] bg-[#FCFAF6] p-4">
            <p className="truncate text-sm font-bold text-[#17202A]">
              {account.name || account.email || "My account"}
            </p>
            {account.name && account.email && (
              <p className="mt-0.5 truncate text-xs text-[#756B61]">{account.email}</p>
            )}
            <span className="mt-2 inline-flex rounded-full bg-[#FFE0D6] px-2.5 py-1 text-[10px] font-bold text-[#9F2D18]">
              {account.role === "ADMIN"
                ? "Administrator"
                : account.role === "SELLER"
                  ? "Seller account"
                  : account.role === "BUYER"
                    ? "Buyer account"
                    : "Account"}
            </span>
            {account.role === null && (
              <p className="mt-2 text-[11px] leading-4 text-[#756B61]">
                Your account role could not be identified.
              </p>
            )}
          </div>

          {account.role === "ADMIN" ? (
            <Link href="/admin" onClick={closeAccountMenu} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]">
              <Store className="h-4 w-4 text-[#FF5A36]" aria-hidden="true" />
              Admin dashboard
            </Link>
          ) : account.role === "SELLER" ? (
            <>
              <Link href="/seller" onClick={closeAccountMenu} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]">
                <Store className="h-4 w-4 text-[#FF5A36]" aria-hidden="true" />
                Seller dashboard
              </Link>
              <Link href="/seller/profile" onClick={closeAccountMenu} className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]">
                <UserCircle className="h-4 w-4 text-[#756B61]" aria-hidden="true" />
                Seller profile
              </Link>
            </>
          ) : (
            <Link href="/profile" onClick={closeAccountMenu} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]">
              <UserCircle className="h-4 w-4 text-[#FF5A36]" aria-hidden="true" />
              My profile
            </Link>
          )}

          {account.role !== "ADMIN" && (
            <Link href="/saved" onClick={closeAccountMenu} className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]">
              <ShoppingBag className="h-4 w-4 text-[#756B61]" aria-hidden="true" />
              Saved products
            </Link>
          )}

          {account.role === "BUYER" && (
            <div className="border-t border-[#EAE6DF] p-3">
              <Link href="/profile#seller-onboarding" onClick={closeAccountMenu} className="flex items-center justify-between gap-3 rounded-xl bg-[#FFF0D9] p-3 transition hover:bg-[#FFE0D6]">
                <span>
                  <span className="block text-xs font-bold text-[#9F2D18]">Sell on ReMarket</span>
                  <span className="mt-1 block text-[11px] text-[#756B61]">Start listing your products.</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-[#9F2D18]" aria-hidden="true" />
              </Link>
            </div>
          )}

          <div className="border-t border-[#EAE6DF] p-2">
            <button type="button" disabled={loggingOut} onClick={() => void handleLogout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFF0D9] disabled:cursor-not-allowed disabled:opacity-60">
              {loggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="h-4 w-4" aria-hidden="true" />
              )}
              {loggingOut ? "Logging out..." : "Log out"}
            </button>
            {accountMenuError && (
              <p role="alert" className="px-3 pb-2 text-xs leading-5 text-red-600">{accountMenuError}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="border-b border-[#EAE6DF] bg-[#FCFAF6] p-4">
            <p className="text-sm font-bold text-[#17202A]">Welcome to ReMarket</p>
            <p className="mt-1 text-xs leading-5 text-[#756B61]">
              Sign in to access your account and saved products.
            </p>
            {sessionError && (
              <p role="alert" className="mt-2 text-[11px] leading-4 text-[#9F2D18]">
                We could not verify your session. Refresh the page if you have already signed in.
              </p>
            )}
          </div>
          <Link href="/buyer/login" onClick={closeAccountMenu} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6]">
            <UserCircle className="h-4 w-4 text-[#FF5A36]" aria-hidden="true" />
            Sign in
          </Link>
          <div className="border-t border-[#EAE6DF] p-3">
            <Link href="/buyer/signup" onClick={closeAccountMenu} className="flex min-h-10 items-center justify-center rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94A28]">
              Create an account
            </Link>
            <Link href="/seller/signup" onClick={closeAccountMenu} className="mt-2 flex min-h-10 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFF7ED]">
              Register as a seller
            </Link>
          </div>
        </>
      )}
    </div>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-[#EAE6DF] bg-white/95 shadow-[0_2px_12px_rgba(23,32,42,0.035)] backdrop-blur">
      <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6 lg:flex lg:min-h-[76px] lg:gap-4 lg:px-6 lg:py-0 xl:gap-6 xl:px-10">
        <Link href="/" aria-label="ReMarket home" className="order-1 flex min-w-0 items-center gap-2.5 lg:w-[170px] lg:shrink-0 xl:w-[190px]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="truncate text-xl font-extrabold tracking-tight text-[#9F2D18] lg:text-[21px]">ReMarket</span>
        </Link>

        {showDesktopNavigation && (
          <nav aria-label="Main navigation" className="order-2 hidden shrink-0 items-center gap-1 lg:flex">
            <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={desktopLinkClass(pathname === "/")}>Home</Link>
            <Link href="/shop" aria-current={productsActive ? "page" : undefined} className={desktopLinkClass(productsActive)}>Products</Link>
          </nav>
        )}

        <div className="order-3 col-span-2 min-w-0 lg:col-span-1 lg:min-w-[180px] lg:flex-1">{renderSearchForm()}</div>

        <div className="order-2 flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 lg:order-4">
          <Link href="/cart" aria-label={`Shopping cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`} title="Shopping cart" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#FCFAF6] text-[#5F554D] transition hover:bg-[#FFF0D9] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2">
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-[#FF5A36] px-1 text-[9px] font-extrabold leading-none text-white">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
          <NotificationBell />
          <div ref={accountMenuRef} className="relative shrink-0">
            <button type="button" onClick={() => { setAccountMenuError(""); setAccountMenuOpen((open) => !open); }} aria-label="Open account menu" aria-expanded={accountMenuOpen} aria-haspopup="true" className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 ${account ? "bg-[#FFE0D6] text-[#9F2D18]" : "bg-[#FCFAF6] text-[#5F554D] hover:bg-[#FFF0D9]"}`}>
              {account?.role === "SELLER" ? <Store className="h-5 w-5" aria-hidden="true" /> : <UserCircle className="h-6 w-6" aria-hidden="true" />}
            </button>
            {accountMenuOpen && (
              <div className="absolute right-0 top-full z-[90] mt-2 w-72 max-w-[calc(100vw-2rem)]">{accountMenuContent}</div>
            )}
          </div>
        </div>
      </div>

      <div className="relative hidden border-t border-[#F0ECE7] bg-[#FFFDFC] lg:block">
        <nav
          aria-label="Product categories"
          className="relative mx-auto max-w-[1600px] px-6 xl:px-10"
          onMouseLeave={() => setOpenCategoryId(null)}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
              setOpenCategoryId(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpenCategoryId(null);
          }}
        >
          <div className="flex h-[50px] items-center gap-1">
            <span className="mr-2 shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-[#91877E]">Categories</span>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => {
                const isOpen = openCategoryId === category.id;
                return (
                  <div key={category.id} className="flex shrink-0 items-center" onMouseEnter={() => setOpenCategoryId(category.id)} onFocus={() => setOpenCategoryId(category.id)}>
                    <Link href={categorySearchHref(category)} onClick={closeCategoryMenus} className={`rounded-full px-3 py-2 text-[13px] font-semibold transition ${isOpen ? "bg-[#FFF0EB] text-[#9F2D18]" : "text-[#514840] hover:bg-[#FFF0EB] hover:text-[#9F2D18]"}`}>
                      {category.name}
                    </Link>
                    <button type="button" aria-label={`Open ${category.name} category menu`} aria-expanded={isOpen} onClick={() => setOpenCategoryId((current) => current === category.id ? null : category.id)} className={`-ml-2 mr-1 flex h-7 w-6 items-center justify-center rounded-full transition hover:bg-[#FFF0EB] ${isOpen ? "text-[#9F2D18]" : "text-[#81766C]"}`}>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-2 border-l border-[#EAE6DF] pl-3">
              <Link href="/shop" className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold text-[#514840] transition hover:bg-[#FFF0EB] hover:text-[#9F2D18]">
                <MapPin className="h-3.5 w-3.5 text-[#FF5A36]" aria-hidden="true" />Nearby
              </Link>
              <Link href="/saved" className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold text-[#514840] transition hover:bg-[#FFF0EB] hover:text-[#9F2D18]">
                <Bookmark className="h-3.5 w-3.5 text-[#FF5A36]" aria-hidden="true" />Saved
              </Link>
            </div>
          </div>

          {activeCategory && (
            <div className="absolute left-1/2 top-full z-[80] w-screen max-w-[1600px] -translate-x-1/2 px-4 sm:px-6" onMouseEnter={() => setOpenCategoryId(activeCategory.id)}>
              <div className="overflow-hidden rounded-b-2xl border border-[#EAE6DF] border-t-[#F4E6E0] bg-white shadow-[0_22px_45px_rgba(23,32,42,0.14)]">
                <div className="grid grid-cols-12 gap-6 p-6 xl:p-8">
                  <div className="col-span-3 rounded-2xl bg-[#FFF7ED] p-5">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                      <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#A16A58]">Explore category</p>
                    <h3 className="mt-1 text-xl font-extrabold text-[#9F2D18]">{activeCategory.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#756B61]">Discover products listed by businesses on ReMarket.</p>
                    <Link href={categorySearchHref(activeCategory)} onClick={closeCategoryMenus} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28]">
                      Shop {activeCategory.name}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="col-span-9">
                    <div className="flex items-center justify-between border-b border-[#F0ECE7] pb-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-[#17202A]">Browse {activeCategory.name}</h3>
                        <p className="mt-1 text-xs text-[#81766C]">Choose a category to explore its products.</p>
                      </div>
                      <Link href={categorySearchHref(activeCategory)} onClick={closeCategoryMenus} className="text-xs font-bold text-[#9F2D18] transition hover:text-[#FF5A36]">View all</Link>
                    </div>

                    {activeCategory.children.length > 0 ? (
                      <div className="grid grid-cols-3 gap-x-6 gap-y-2 pt-4 xl:grid-cols-4">
                        {activeCategory.children.map((child) => (
                          <Link key={child.id} href={categorySearchHref(child)} onClick={closeCategoryMenus} className="group flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[#514840] transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]">
                            <span className="min-w-0 truncate">{child.name}</span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#B7A99D] transition group-hover:translate-x-0.5 group-hover:text-[#FF5A36]" aria-hidden="true" />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-dashed border-[#EAE6DF] bg-[#FCFAF6] p-5">
                        <p className="text-sm font-semibold text-[#514840]">Explore {activeCategory.name}</p>
                        <p className="mt-1 text-xs leading-5 text-[#81766C]">Browse all available products in this category.</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-[#F0ECE7] bg-[#FCFAF6] px-6 py-3 xl:px-8">
                  <p className="text-[11px] text-[#81766C]">Find products from businesses near you.</p>
                  <Link href="/shop" onClick={closeCategoryMenus} className="text-[11px] font-bold text-[#9F2D18] hover:text-[#FF5A36]">Explore ReMarket</Link>
                </div>
              </div>
            </div>
          )}
        </nav>
      </div>

      <div className="border-t border-[#EAE6DF] bg-[#FFFDFC] lg:hidden">
        <div className="px-3 sm:px-6">
          <div className="flex min-h-[48px] items-center gap-2">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[#91877E]">Shop</span>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => {
                const isExpanded = mobileCategoryId === category.id;
                return (
                  <div key={category.id} className="flex shrink-0 items-center rounded-full border border-[#EAE6DF] bg-white">
                    <Link href={categorySearchHref(category)} onClick={closeCategoryMenus} className="py-2 pl-3 text-xs font-semibold text-[#514840] transition hover:text-[#9F2D18]">{category.name}</Link>
                    <button type="button" aria-label={`Show ${category.name} subcategories`} aria-expanded={isExpanded} onClick={() => setMobileCategoryId((current) => current === category.id ? null : category.id)} className="flex h-8 w-8 items-center justify-center rounded-full text-[#81766C] transition hover:bg-[#FFF0EB] hover:text-[#9F2D18]">
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
            <Link href="/saved" aria-label="Saved products" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF0EB] text-[#9F2D18]">
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {categories.map((category) => {
            if (mobileCategoryId !== category.id) return null;
            return (
              <div key={category.id} className="border-t border-[#F0ECE7] py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-extrabold text-[#9F2D18]">{category.name}</h3>
                  <Link href={categorySearchHref(category)} onClick={closeCategoryMenus} className="text-[11px] font-bold text-[#9F2D18]">View all</Link>
                </div>
                {category.children.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 pb-2">
                    {category.children.map((child) => (
                      <Link key={child.id} href={categorySearchHref(child)} onClick={closeCategoryMenus} className="flex min-h-10 items-center justify-between gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-medium text-[#514840] transition hover:border-[#FFB5A2] hover:bg-[#FFF7ED] hover:text-[#9F2D18]">
                        <span className="min-w-0 truncate">{child.name}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-[#B7A99D]" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link href={categorySearchHref(category)} onClick={closeCategoryMenus} className="flex min-h-10 items-center justify-between rounded-xl bg-[#FFF7ED] px-3 py-2 text-xs font-semibold text-[#9F2D18]">
                    Browse {category.name}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between border-t border-[#F0ECE7] py-2">
            <Link href="/shop" className="flex items-center gap-1.5 py-1 text-[11px] font-semibold text-[#756B61] hover:text-[#9F2D18]">
              <MapPin className="h-3.5 w-3.5 text-[#FF5A36]" aria-hidden="true" />Find products nearby
            </Link>
            <Link href="/shop" className="text-[11px] font-bold text-[#9F2D18]">Explore all products</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
