
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
  CalendarDays,
  Loader2,
  LogOut,
  MessageCircle,
  Search,
  ShoppingBag,
  Store,
  UserCircle,
} from "lucide-react";

import NotificationBell from "@/components/NotificationBell";

type AccountRole = "ADMIN" | "BUYER" | "SELLER";
type DiscoveryMode = "ALL" | "PRODUCTS" | "SERVICES";

type SiteHeaderProps = {
  searchMode?: DiscoveryMode;
};

type HeaderAccount = {
  id: string | null;
  name: string | null;
  email: string | null;
  role: AccountRole | null;
};

function parseAccountRole(value: unknown): AccountRole | null {
  if (
    value === "ADMIN" ||
    value === "BUYER" ||
    value === "SELLER"
  ) {
    return value;
  }

  return null;
}

export default function SiteHeader({
  searchMode = "ALL",
}: SiteHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [searchQuery, setSearchQuery] = useState("");

  const [account, setAccount] =
    useState<HeaderAccount | null>(null);

  const [accountLoading, setAccountLoading] =
    useState(true);

  const [sessionError, setSessionError] =
    useState(false);

  const [accountMenuOpen, setAccountMenuOpen] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [accountMenuError, setAccountMenuError] =
    useState("");

  const accountMenuRef =
    useRef<HTMLDivElement | null>(null);

  const requestVersionRef = useRef(0);

  /*
   * =========================================
   * ACCOUNT SESSION
   * =========================================
   */

  useEffect(() => {
    let cancelled = false;

    async function refreshAccount() {
      const requestVersion =
        ++requestVersionRef.current;

      try {
        const session = await getSession();

        if (
          cancelled ||
          requestVersion !== requestVersionRef.current
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
          setAccount(null);
          setSessionError(false);
          return;
        }

        setAccount({
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

        setSessionError(false);
      } catch (error) {
        console.error(
          "Header session error:",
          error,
        );

        if (!cancelled) {
          setSessionError(true);
        }
      } finally {
        if (
          !cancelled &&
          requestVersion === requestVersionRef.current
        ) {
          setAccountLoading(false);
        }
      }
    }

    function handleWindowFocus() {
      void refreshAccount();
    }

    void refreshAccount();

    window.addEventListener(
      "focus",
      handleWindowFocus,
    );

    return () => {
      cancelled = true;

      requestVersionRef.current += 1;

      window.removeEventListener(
        "focus",
        handleWindowFocus,
      );
    };
  }, []);

  /*
   * =========================================
   * ACCOUNT MENU BEHAVIOUR
   * =========================================
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

  /*
   * Close the menu when navigating to another page.
   */

  useEffect(() => {
    setAccountMenuOpen(false);
    setAccountMenuError("");
  }, [pathname]);

  function closeAccountMenu() {
    setAccountMenuOpen(false);
    setAccountMenuError("");
  }

  /*
   * =========================================
   * SEARCH
   * =========================================
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

    if (searchMode === "PRODUCTS") {
      params.set("type", "product");
    } else if (searchMode === "SERVICES") {
      params.set("type", "service");
    }

    closeAccountMenu();

    router.push(`/search?${params.toString()}`);
  }

  function renderSearchForm() {
    return (
      <form
        onSubmit={handleSearch}
        role="search"
        className="flex h-12 w-full items-center rounded-full border border-[#EAE6DF] bg-[#FCFAF6] p-1.5 transition focus-within:border-[#FF9A81] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#FF5A36]/10"
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
          placeholder="Search products or services..."
          aria-label="Search ReMarket"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-[#17202A] outline-none placeholder:text-[#91877E]"
        />

        <button
          type="submit"
          aria-label="Search"
          disabled={!searchQuery.trim()}
          className="flex h-9 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF5A36] text-white transition hover:bg-[#E94A28] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2"
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
   * =========================================
   * LOGOUT
   * =========================================
   */

  async function handleLogout() {
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

      setAccount(null);
      setSessionError(false);
      setAccountMenuOpen(false);

      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Logout failed:", error);

      setAccountMenuError(
        "We couldn't log you out. Please try again.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

  /*
   * =========================================
   * NAVIGATION ACTIVE STATES
   * =========================================
   */

  const productsActive =
    pathname === "/shop" ||
    pathname.startsWith("/shop/") ||
    pathname.startsWith("/product/");

  const servicesActive =
    pathname === "/services" ||
    pathname.startsWith("/services/");

  function desktopLinkClass(
    active: boolean,
  ) {
    return `rounded-full px-3 py-2.5 text-sm font-semibold transition ${
      active
        ? "bg-[#FFF1ED] text-[#9F2D18]"
        : "text-[#514840] hover:bg-[#FFF1ED] hover:text-[#9F2D18]"
    }`;
  }

  /*
   * =========================================
   * ACCOUNT MENU CONTENT
   * =========================================
   */

  const accountMenuContent = (
    <div
      role="group"
      aria-label="Account options"
      className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-[0_14px_40px_rgba(23,32,42,0.16)]"
    >
      {accountLoading ? (
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
      ) : account ? (
        <>
          <div className="border-b border-[#EAE6DF] bg-[#FCFAF6] p-4">
            <p className="truncate text-sm font-bold text-[#17202A]">
              {account.name ||
                account.email ||
                "My account"}
            </p>

            {account.name && account.email && (
              <p className="mt-0.5 truncate text-xs text-[#756B61]">
                {account.email}
              </p>
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

          {/* ADMIN NAVIGATION */}

          {account.role === "ADMIN" ? (
            <Link
              href="/admin"
              onClick={closeAccountMenu}
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
            >
              <Store
                className="h-4 w-4 text-[#FF5A36]"
                aria-hidden="true"
              />
              Admin dashboard
            </Link>
          ) : account.role === "SELLER" ? (
            /* SELLER NAVIGATION */
            <>
              <Link
                href="/seller"
                onClick={closeAccountMenu}
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
                onClick={closeAccountMenu}
                className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
              >
                <UserCircle
                  className="h-4 w-4 text-[#756B61]"
                  aria-hidden="true"
                />
                Business profile
              </Link>
            </>
          ) : (
            /* BUYER PROFILE */
            <Link
              href="/profile"
              onClick={closeAccountMenu}
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
            >
              <UserCircle
                className="h-4 w-4 text-[#FF5A36]"
                aria-hidden="true"
              />
              My profile
            </Link>
          )}

          {/* BUYER BOOKINGS */}

          {account.role === "BUYER" && (
            <Link
              href="/bookings"
              onClick={closeAccountMenu}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold transition hover:bg-[#FCFAF6] hover:text-[#9F2D18] ${
                pathname === "/bookings" ||
                pathname.startsWith("/bookings/")
                  ? "bg-[#FFF7F4] text-[#9F2D18]"
                  : "text-[#17202A]"
              }`}
            >
              <CalendarDays
                className="h-4 w-4 text-[#FF5A36]"
                aria-hidden="true"
              />
              My bookings
            </Link>
          )}

          {/* SAVED LISTINGS */}

          {account.role !== "ADMIN" && (
            <Link
              href="/saved"
              onClick={closeAccountMenu}
              className="flex items-center gap-3 px-4 py-3 text-sm text-[#17202A] transition hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
            >
              <ShoppingBag
                className="h-4 w-4 text-[#756B61]"
                aria-hidden="true"
              />
              Saved listings
            </Link>
          )}

          {/* SELLER ONBOARDING */}

          {account.role === "BUYER" && (
            <div className="border-t border-[#EAE6DF] p-3">
              <Link
                href="/profile#seller-onboarding"
                onClick={closeAccountMenu}
                className="flex items-center justify-between gap-3 rounded-xl bg-[#FFF0D9] p-3 transition hover:bg-[#FFE0D6]"
              >
                <span>
                  <span className="block text-xs font-bold text-[#9F2D18]">
                    Have a business?
                  </span>

                  <span className="mt-1 block text-[11px] text-[#756B61]">
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

          {/* LOGOUT */}

          <div className="border-t border-[#EAE6DF] p-2">
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
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

              {loggingOut ? "Logging out..." : "Log out"}
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
        /* SIGNED-OUT NAVIGATION */
        <>
          <div className="border-b border-[#EAE6DF] bg-[#FCFAF6] p-4">
            <p className="text-sm font-bold text-[#17202A]">
              Welcome to ReMarket
            </p>

            <p className="mt-1 text-xs leading-5 text-[#756B61]">
              Sign in to access your account and saved listings.
            </p>

            {sessionError && (
              <p
                role="alert"
                className="mt-2 text-[11px] leading-4 text-[#9F2D18]"
              >
                We could not verify your session. Refresh the page if
                you have already signed in.
              </p>
            )}
          </div>

          <Link
            href="/buyer/login"
            onClick={closeAccountMenu}
            className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-[#17202A] transition hover:bg-[#FCFAF6]"
          >
            <UserCircle
              className="h-4 w-4 text-[#FF5A36]"
              aria-hidden="true"
            />
            Sign in
          </Link>

          <div className="border-t border-[#EAE6DF] p-3">
            <Link
              href="/buyer/signup"
              onClick={closeAccountMenu}
              className="flex min-h-10 items-center justify-center rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94A28]"
            >
              Create an account
            </Link>

            <Link
              href="/seller/signup"
              onClick={closeAccountMenu}
              className="mt-2 flex min-h-10 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFF7ED]"
            >
              Register as a seller
            </Link>
          </div>
        </>
      )}
    </div>
  );

  /*
   * =========================================
   * HEADER
   * =========================================
   */

  return (
    <header className="sticky top-0 z-40 border-b border-[#EAE6DF] bg-white/95 shadow-[0_2px_12px_rgba(23,32,42,0.035)] backdrop-blur">
      <div
        className="
          mx-auto grid max-w-[1600px]
          grid-cols-[minmax(0,1fr)_auto]
          items-center gap-x-3 gap-y-3
          px-4 py-3
          sm:px-6
          lg:flex lg:min-h-[76px] lg:gap-4
          lg:px-6 lg:py-0
          xl:gap-6 xl:px-10
        "
      >
        {/* LOGO */}

        <Link
          href="/"
          aria-label="ReMarket home"
          className="order-1 flex min-w-0 items-center gap-2.5 lg:w-[170px] lg:shrink-0 xl:w-[190px]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
            <ShoppingBag
              className="h-5 w-5"
              aria-hidden="true"
            />
          </span>

          <span className="truncate text-xl font-extrabold tracking-tight text-[#9F2D18] lg:text-[21px]">
            ReMarket
          </span>
        </Link>

        {/* DESKTOP NAVIGATION */}

        <nav
          aria-label="Main navigation"
          className="order-2 hidden shrink-0 items-center gap-1 lg:flex"
        >
          <Link
            href="/"
            aria-current={
              pathname === "/" ? "page" : undefined
            }
            className={desktopLinkClass(pathname === "/")}
          >
            Home
          </Link>

          <Link
            href="/shop"
            aria-current={
              productsActive ? "page" : undefined
            }
            className={desktopLinkClass(productsActive)}
          >
            Products
          </Link>

          <Link
            href="/services"
            aria-current={
              servicesActive ? "page" : undefined
            }
            className={desktopLinkClass(servicesActive)}
          >
            Services
          </Link>
        </nav>

        {/* SEARCH */}

        <div className="order-3 col-span-2 min-w-0 lg:col-span-1 lg:min-w-[180px] lg:flex-1">
          {renderSearchForm()}
        </div>

        {/* MESSAGES, NOTIFICATIONS AND ACCOUNT */}

        <div className="order-2 flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 lg:order-4">
          <Link
            href="/messages"
            aria-label="Messages"
            title="Messages"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 ${
              pathname === "/messages" ||
              pathname.startsWith("/messages/")
                ? "bg-[#FFF1ED] text-[#9F2D18]"
                : "text-[#5F554D] hover:bg-[#FFF1ED] hover:text-[#9F2D18]"
            }`}
          >
            <MessageCircle
              className="h-5 w-5"
              aria-hidden="true"
            />
          </Link>

          <NotificationBell />

          {/* SINGLE ACCOUNT MENU */}

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
              aria-label="Open account menu"
              aria-expanded={accountMenuOpen}
              aria-haspopup="true"
              className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2 ${
                account
                  ? "bg-[#FFE0D6] text-[#9F2D18]"
                  : "bg-[#FCFAF6] text-[#5F554D] hover:bg-[#FFF0D9]"
              }`}
            >
              {account?.role === "SELLER" ? (
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
              <div className="absolute right-0 top-full z-[90] mt-2 w-72 max-w-[calc(100vw-2rem)]">
                {accountMenuContent}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
