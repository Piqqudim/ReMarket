"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Heart,
  Home,
  Loader2,
  LogOut,
  Package,
  Search,
  ShoppingBag,
  Store,
  UserRound,
} from "lucide-react";

import {
  getSavedBusinesses,
  SAVED_BUSINESSES_CHANGED_EVENT,
} from "@/lib/saved";

type ProfileSessionUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string;
};

type ApiResponse = {
  error?: unknown;
  message?: unknown;
  role?: unknown;
  alreadySeller?: unknown;
};

type AccountLinkProps = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  detail?: string;
};

function errorMessage(
  value: unknown,
  fallback: string,
): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    value.error.trim()
  ) {
    return value.error;
  }

  return fallback;
}

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shop", label: "Shop", icon: Search },
  { href: "/my-requests", label: "Requests", icon: ClipboardList },
  { href: "/saved", label: "Saved", icon: Heart },
];

function AccountLink({
  href,
  title,
  description,
  icon,
  detail,
}: AccountLinkProps) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 items-center gap-3 border-b
        border-[#F0ECE6] px-4 py-4 last:border-b-0 transition
        hover:bg-[#FFF7ED] focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-inset
        focus-visible:ring-[#FF5A36] sm:px-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center
        justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]">
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#292421]">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-[#81766D]">
          {description}
        </span>
      </span>

      {detail && (
        <span className="hidden shrink-0 text-[11px] text-[#9F2D18] sm:block">
          {detail}
        </span>
      )}

      <ArrowRight
        className="h-4 w-4 shrink-0 text-[#A49A91] transition
          group-hover:translate-x-0.5 group-hover:text-[#9F2D18]"
        aria-hidden="true"
      />
    </Link>
  );
}

function ComingSoonLink() {
  return (
    <div
      aria-disabled="true"
      className="flex min-w-0 items-center gap-3 border-b
        border-[#F0ECE6] px-4 py-4 last:border-b-0 sm:px-5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center
        justify-center rounded-xl bg-[#F3F0EA] text-[#887D73]">
        <CalendarDays className="h-5 w-5" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#514940]">
          Service bookings
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-[#81766D]">
          Booking and provider conversations are not available yet.
        </span>
      </span>

      <span className="shrink-0 rounded-full bg-[#FFF0E9] px-2.5 py-1
        text-[10px] font-bold text-[#9F2D18]">
        Coming soon
      </span>
    </div>
  );
}

export default function BuyerProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const user = session?.user as ProfileSessionUser | undefined;
  const role = user?.role;

  const displayName = user?.name?.trim() || "ReMarket buyer";
  const email = user?.email?.trim() || "Email not available";

  const [savedCount, setSavedCount] = useState(0);
  const [showSellerConfirmation, setShowSellerConfirmation] =
    useState(false);
  const [switchingToSeller, setSwitchingToSeller] = useState(false);
  const [sellerSwitchError, setSellerSwitchError] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);

  const refreshSavedCount = useCallback(() => {
    setSavedCount(getSavedBusinesses().length);
  }, []);

  useEffect(() => {
    refreshSavedCount();

    window.addEventListener(
      SAVED_BUSINESSES_CHANGED_EVENT,
      refreshSavedCount,
    );
    window.addEventListener("storage", refreshSavedCount);

    return () => {
      window.removeEventListener(
        SAVED_BUSINESSES_CHANGED_EVENT,
        refreshSavedCount,
      );
      window.removeEventListener("storage", refreshSavedCount);
    };
  }, [refreshSavedCount]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        `/buyer/login?callbackUrl=${encodeURIComponent("/profile")}`,
      );
      return;
    }

    if (status !== "authenticated") return;

    if (role === "SELLER") {
      router.replace("/seller/profile");
    } else if (role === "ADMIN") {
      router.replace("/admin");
    }
  }, [role, router, status]);

  async function startSelling() {
    if (switchingToSeller) return;

    setSwitchingToSeller(true);
    setSellerSwitchError("");

    try {
      const response = await fetch("/api/account/become-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | ApiResponse
        | null;

      if (!response.ok) {
        setSellerSwitchError(
          errorMessage(
            data,
            "Unable to switch this account to seller.",
          ),
        );
        return;
      }

      await signOut({ redirect: false });
      router.replace("/seller/login?account=converted");
      router.refresh();
    } catch (error) {
      console.error("Start selling error:", error);
      setSellerSwitchError(
        "Something went wrong. Please try again.",
      );
    } finally {
      setSwitchingToSeller(false);
    }
  }

  async function logOut() {
    if (logoutPending) return;

    setLogoutPending(true);

    try {
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("Profile logout error:", error);
      setLogoutPending(false);
    }
  }

  if (
    status === "loading" ||
    status === "unauthenticated" ||
    role === "SELLER" ||
    role === "ADMIN"
  ) {
    return (
      <main className="flex min-h-dvh items-center justify-center
        bg-[#FFF7ED] px-4">
        <div
          className="flex items-center gap-2 text-sm text-[#756B61]"
          role="status"
        >
          <Loader2
            className="h-4 w-4 animate-spin text-[#FF5A36]"
            aria-hidden="true"
          />
          Loading your account...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#FFF7ED] pb-24 text-[#292421] lg:pb-10">
      {/* RE-MARKET PRIMARY NAVIGATION */}
      <header className="sticky top-0 z-40 border-b border-[#EAE6DF]
        bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-[64px] w-full max-w-[1440px]
          items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5"
            aria-label="ReMarket home"
          >
            <span className="flex h-9 w-9 items-center justify-center
              rounded-xl bg-[#FF5A36] text-white">
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-base font-extrabold tracking-tight
              text-[#292421]">
              ReMarket
            </span>
          </Link>

          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Main navigation"
          >
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-xl px-4 py-2.5 text-sm font-medium
                  text-[#625950] transition hover:bg-[#FFF7ED]
                  hover:text-[#9F2D18]"
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full bg-[#FFF0E9] px-3 py-1.5
              text-[11px] font-bold text-[#9F2D18] sm:inline-flex">
              Buyer account
            </span>
            <button
              type="button"
              onClick={() => void logOut()}
              disabled={logoutPending}
              className="inline-flex min-h-9 items-center gap-2 rounded-xl
                border border-[#EAE6DF] bg-white px-3 text-xs font-semibold
                text-[#756B61] transition hover:bg-[#FFF7ED]
                hover:text-[#9F2D18] disabled:opacity-60"
            >
              {logoutPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {logoutPending ? "Logging out..." : "Log out"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1180px] px-3 py-5
        sm:px-6 sm:py-7 lg:px-8">
        {/* COMPACT ACCOUNT IDENTITY */}
        <section className="rounded-2xl border border-[#EAE6DF]
          bg-white p-4 shadow-[0_2px_12px_rgba(41,36,33,0.03)]
          sm:p-5">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center
              justify-center rounded-full bg-[#FFF0E9] text-[#9F2D18]
              sm:h-14 sm:w-14">
              <UserRound className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]
                text-[#9F2D18]">
                My ReMarket account
              </p>
              <h1 className="mt-0.5 break-words text-lg font-bold
                text-[#292421] sm:text-xl">
                {displayName}
              </h1>
              <p className="mt-0.5 break-all text-xs text-[#81766D]">
                {email}
              </p>
            </div>

            <span className="hidden shrink-0 rounded-full border
              border-[#F1D4C8] bg-[#FFF7ED] px-3 py-1.5 text-[10px]
              font-bold text-[#9F2D18] sm:inline-flex">
              BUYER
            </span>
          </div>
        </section>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
          {/* ACCOUNT ACTIVITY */}
          <section className="min-w-0 space-y-5">
            <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[#292421]">
                    Your activity
                  </h2>
                  <p className="mt-1 text-xs text-[#81766D]">
                    Manage the things you save, request and discover.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border
                border-[#EAE6DF] bg-white">
                <AccountLink
                  href="/saved"
                  title="Saved businesses"
                  description="Businesses you have bookmarked."
                  icon={<Heart className="h-5 w-5" />}
                  detail={`${savedCount} saved`}
                />
                <AccountLink
                  href="/cart"
                  title="Shopping cart"
                  description="Review products you have added to your cart."
                  icon={<ShoppingBag className="h-5 w-5" />}
                />
                <AccountLink
                  href="/orders"
                  title="My product orders"
                  description="Review orders placed with local sellers."
                  icon={<Package className="h-5 w-5" />}
                />
                <AccountLink
                  href="/my-requests"
                  title="My requests"
                  description="Check the requests you have submitted."
                  icon={<ClipboardList className="h-5 w-5" />}
                />
                <AccountLink
                  href="/request"
                  title="Request an item"
                  description="Tell nearby businesses what you are looking for."
                  icon={<Search className="h-5 w-5" />}
                />
                <AccountLink
                  href="/shop"
                  title="Discover local sellers"
                  description="Explore products and businesses around you."
                  icon={<Store className="h-5 w-5" />}
                />
                <ComingSoonLink />
              </div>
            </div>

            {/* ACCOUNT PREFERENCES */}
            <div>
              <h2 className="mb-3 text-base font-bold text-[#292421]">
                Account preferences
              </h2>
              <div className="overflow-hidden rounded-2xl border
                border-[#EAE6DF] bg-white">
                <AccountLink
                  href="/settings/notifications"
                  title="Notification settings"
                  description="Choose the ReMarket updates you receive."
                  icon={<Bell className="h-5 w-5" />}
                />
              </div>
            </div>
          </section>

          {/* ACCOUNT DETAILS AND SELLER ENTRY */}
          <aside className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-[#EAE6DF]
              bg-white p-4 sm:p-5">
              <h2 className="text-sm font-bold text-[#292421]">
                Account details
              </h2>
              <dl className="mt-3 divide-y divide-[#F0ECE6]">
                <div className="py-3 first:pt-0">
                  <dt className="text-[10px] font-semibold uppercase
                    tracking-wide text-[#A49A91]">
                    Name
                  </dt>
                  <dd className="mt-1 break-words text-sm font-medium
                    text-[#514940]">
                    {displayName}
                  </dd>
                </div>
                <div className="py-3 last:pb-0">
                  <dt className="text-[10px] font-semibold uppercase
                    tracking-wide text-[#A49A91]">
                    Email address
                  </dt>
                  <dd className="mt-1 break-all text-sm font-medium
                    text-[#514940]">
                    {email}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-[#F0ECE6] pt-3
                text-[11px] leading-5 text-[#81766D]">
                These details are linked to the account you used to sign in.
              </p>
            </section>

            {/* SELLER ONBOARDING */}
            <section className="rounded-2xl border border-[#F1D4C8]
              bg-[#FFFDFC] p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center
                  justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]">
                  <Store className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-[#292421]">
                    Have a business?
                  </h2>
                  <p className="text-[10px] text-[#81766D]">
                    Start selling on ReMarket.
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs leading-5 text-[#756B61]">
                Use this account to create a seller profile. Your login
                details will remain the same.
              </p>

              {!showSellerConfirmation ? (
                <button
                  type="button"
                  onClick={() => {
                    setSellerSwitchError("");
                    setShowSellerConfirmation(true);
                  }}
                  className="mt-4 inline-flex min-h-10 w-full
                    items-center justify-center gap-2 rounded-xl
                    bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white
                    transition hover:bg-[#E94A28] focus-visible:outline-none
                    focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20"
                >
                  Start selling
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="mt-4 rounded-xl border border-[#EAE6DF]
                  bg-[#FCFAF6] p-3">
                  <p className="text-xs font-bold text-[#292421]">
                    Switch this account to Seller?
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-[#81766D]">
                    ReMarket currently uses one account role at a time.
                    You will sign in again after the change.
                  </p>
                  <div className="mt-3 grid gap-2">
                    <button
                      type="button"
                      disabled={switchingToSeller}
                      onClick={() => void startSelling()}
                      className="inline-flex min-h-10 items-center
                        justify-center gap-2 rounded-xl bg-[#FF5A36]
                        px-3 py-2 text-xs font-bold text-white
                        disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {switchingToSeller ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      {switchingToSeller
                        ? "Switching account..."
                        : "Confirm and continue"}
                    </button>
                    <button
                      type="button"
                      disabled={switchingToSeller}
                      onClick={() => setShowSellerConfirmation(false)}
                      className="min-h-9 rounded-xl border border-[#EAE6DF]
                        bg-white px-3 py-2 text-xs font-semibold
                        text-[#756B61] hover:bg-[#FFF7ED]
                        disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {sellerSwitchError && (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border border-[#F1D5D0]
                    bg-[#FFF0EE] px-3 py-2.5 text-xs leading-5
                    text-[#9F2D18]"
                >
                  {sellerSwitchError}
                </p>
              )}
            </section>
          </aside>
        </div>

        <footer className="mt-7 border-t border-[#EAE6DF] pt-4">
          <p className="text-center text-[11px] text-[#A49A91]">
            ReMarket · Find it nearby.
          </p>
        </footer>
      </div>

      {/* RE-MARKET MOBILE NAVIGATION */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid h-[68px]
          grid-cols-4 border-t border-[#EAE6DF] bg-white/95
          px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Mobile navigation"
      >
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center justify-center
              gap-1 text-[10px] font-medium text-[#756B61]
              transition hover:text-[#9F2D18]"
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
