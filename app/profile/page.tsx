
"use client";

import {
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
  CheckCircle2,
  ChevronRight,
  Heart,
  Loader2,
  Package,
  Search,
  ShoppingBag,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

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

type AccountActionProps = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  accent?: "orange" | "green" | "neutral";
  detail?: string;
};

type AccountDetailProps = {
  label: string;
  value: string;
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

/* -------------------------------------------------------------------------- */
/* ACCOUNT ACTION CARD                                                       */
/* -------------------------------------------------------------------------- */

function AccountActionCard({
  href,
  title,
  description,
  icon,
  accent = "orange",
  detail,
}: AccountActionProps) {
  const accentClasses = {
    orange: "bg-[#FFF0E9] text-[#9F2D18]",
    green: "bg-[#EAF7F0] text-[#137A59]",
    neutral: "bg-[#F3F0EA] text-[#685E55]",
  };

  return (
    <Link
      href={href}
      className="group flex min-w-0 items-start gap-3
        rounded-xl border border-[#EAE6DF] bg-white p-4
        transition duration-200
        hover:-translate-y-0.5 hover:border-[#FFD0C3]
        hover:shadow-[0_8px_22px_rgba(23,32,42,0.055)]
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-[#FF5A36] sm:p-5"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center
          justify-center rounded-xl ${accentClasses[accent]}`}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[#292421]">
          {title}
        </span>

        <span className="mt-1 block text-[11px] leading-5 text-[#81766D] sm:text-xs">
          {description}
        </span>

        {detail && (
          <span className="mt-2 block text-[10px] font-semibold text-[#9F2D18]">
            {detail}
          </span>
        )}
      </span>

      <ChevronRight
        className="mt-1 h-4 w-4 shrink-0 text-[#A49A91]
          transition group-hover:translate-x-0.5
          group-hover:text-[#9F2D18]"
        aria-hidden="true"
      />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* ACCOUNT DETAIL                                                             */
/* -------------------------------------------------------------------------- */

function AccountDetail({
  label,
  value,
}: AccountDetailProps) {
  return (
    <div className="min-w-0 py-3 first:pt-0 last:pb-0">
      <dt
        className="text-[10px] font-bold uppercase
          tracking-[0.1em] text-[#A49A91]"
      >
        {label}
      </dt>

      <dd className="mt-1 break-words text-sm font-semibold text-[#514940]">
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BUYER PROFILE PAGE                                                         */
/* -------------------------------------------------------------------------- */

export default function BuyerProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const user = session?.user as ProfileSessionUser | undefined;
  const role = user?.role;

  const displayName =
    user?.name?.trim() || "ReMarket buyer";

  const email =
    user?.email?.trim() || "Email not available";

  const firstName =
    displayName.split(/\s+/)[0] || "there";

  const [showSellerConfirmation, setShowSellerConfirmation] =
    useState(false);

  const [switchingToSeller, setSwitchingToSeller] =
    useState(false);

  const [sellerSwitchError, setSellerSwitchError] =
    useState("");

  /* ---------------------------------------------------------------------- */
  /* ROLE-BASED REDIRECT                                                    */
  /* ---------------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------------- */
  /* SWITCH BUYER ACCOUNT TO SELLER                                         */
  /* ---------------------------------------------------------------------- */

  async function startSelling() {
    if (switchingToSeller) return;

    setSwitchingToSeller(true);
    setSellerSwitchError("");

    try {
      const response = await fetch(
        "/api/account/become-seller",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        },
      );

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

  /* ---------------------------------------------------------------------- */
  /* LOADING AND REDIRECT STATES                                            */
  /* ---------------------------------------------------------------------- */

  if (
    status === "loading" ||
    status === "unauthenticated" ||
    role === "SELLER" ||
    role === "ADMIN"
  ) {
    return (
      <div className="min-h-dvh bg-[#FFFDFC]">
        <SiteHeader searchMode="PRODUCTS" />

        <main
          className="flex min-h-[60vh] items-center
            justify-center px-4"
        >
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

        <MobileBottomNav />
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* PROFILE PAGE                                                           */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="min-h-dvh bg-[#FCFAF6] text-[#292421]">
      {/* SHARED REMARKET HEADER */}

      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh pb-28 lg:pb-10"
      >
        <div
          className="mx-auto w-full max-w-[1440px]
            px-3 py-5 sm:px-6 sm:py-7 lg:px-8"
        >
          {/* BREADCRUMB */}

          <nav
            aria-label="Breadcrumb"
            className="mb-5 flex items-center gap-2
              text-[10px] font-medium text-[#948A81]"
          >
            <Link
              href="/"
              className="transition hover:text-[#9F2D18]"
            >
              Home
            </Link>

            <ChevronRight className="h-3 w-3" />

            <span className="font-bold text-[#9F2D18]">
              My account
            </span>
          </nav>

          {/* BUYER ACCOUNT INTRODUCTION */}

          <section
            className="relative overflow-hidden rounded-2xl
              border border-[#F0DDD4]
              bg-gradient-to-r from-[#FFF0E9]
              via-[#FFF7ED] to-[#FCFAF6]
              p-4 sm:p-6 lg:p-7"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute
                -right-16 -top-20 h-52 w-52
                rounded-full bg-[#FF5A36]/[0.06]"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute
                -bottom-24 right-[22%] h-40 w-40
                rounded-full bg-white/60"
            />

            <div
              className="relative z-10 flex flex-col
                gap-5 sm:flex-row sm:items-center
                sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div
                  className="flex h-14 w-14 shrink-0
                    items-center justify-center
                    rounded-2xl bg-[#FF5A36]
                    text-white shadow-sm sm:h-16 sm:w-16"
                >
                  <UserRound className="h-7 w-7 sm:h-8 sm:w-8" />
                </div>

                <div className="min-w-0">
                  <div
                    className="inline-flex items-center
                      gap-1.5 text-[9px] font-bold
                      uppercase tracking-[0.13em]
                      text-[#9F2D18]"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Buyer account
                  </div>

                  <h1
                    className="mt-1 break-words text-xl
                      font-extrabold tracking-tight
                      text-[#401B13] sm:text-2xl"
                  >
                    Welcome back, {firstName}
                  </h1>

                  <p className="mt-1 break-all text-[11px] text-[#756B61] sm:text-xs">
                    {email}
                  </p>
                </div>
              </div>

              <Link
                href="/shop"
                className="inline-flex min-h-10
                  shrink-0 items-center justify-center
                  gap-2 rounded-lg bg-[#FF5A36]
                  px-4 py-2.5 text-xs font-bold
                  text-white shadow-sm transition
                  hover:bg-[#E94A28]"
              >
                Start shopping
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          {/* SHOPPING DASHBOARD */}

          <section
            className="mt-7"
            aria-labelledby="shopping-heading"
          >
            <div className="mb-3">
              <p
                className="text-[9px] font-bold uppercase
                  tracking-[0.14em] text-[#9F2D18]"
              >
                Your shopping
              </p>

              <h2
                id="shopping-heading"
                className="mt-1 text-lg font-extrabold
                  tracking-tight text-[#292421] sm:text-xl"
              >
                Your account activity
              </h2>

              <p className="mt-1 text-[11px] text-[#81766D] sm:text-xs">
                Quickly access your shopping and account activities.
              </p>
            </div>

            <div
              className="grid grid-cols-1 gap-3
                sm:grid-cols-2 xl:grid-cols-4"
            >
              <AccountActionCard
                href="/orders"
                title="My orders"
                description="View your purchases and follow their order updates."
                icon={<Package className="h-5 w-5" />}
                accent="orange"
                detail="View order history"
              />

              <AccountActionCard
                href="/cart"
                title="Shopping cart"
                description="Review the products you have added to your cart."
                icon={<ShoppingBag className="h-5 w-5" />}
                accent="green"
                detail="Continue to cart"
              />

              <AccountActionCard
                href="/saved"
                title="Saved products"
                description="Revisit products you have bookmarked for later."
                icon={<Heart className="h-5 w-5" />}
                accent="orange"
                detail="View saved collection"
              />

              <AccountActionCard
                href="/shop"
                title="Discover products"
                description="Explore products listed by businesses around you."
                icon={<Search className="h-5 w-5" />}
                accent="neutral"
                detail="Explore the catalogue"
              />
            </div>
          </section>

          {/* ACCOUNT MANAGEMENT */}

          <div
            className="mt-8 grid items-start gap-5
              lg:grid-cols-[minmax(0,1fr)_340px]"
          >
            {/* LEFT: ACCOUNT PREFERENCES */}

            <section
              className="min-w-0"
              aria-labelledby="preferences-heading"
            >
              <div className="mb-3">
                <p
                  className="text-[9px] font-bold uppercase
                    tracking-[0.14em] text-[#9F2D18]"
                >
                  Manage your account
                </p>

                <h2
                  id="preferences-heading"
                  className="mt-1 text-lg font-extrabold
                    tracking-tight text-[#292421]"
                >
                  Account preferences
                </h2>
              </div>

              <div
                className="overflow-hidden rounded-xl
                  border border-[#EAE6DF] bg-white"
              >
                <Link
                  href="/settings/notifications"
                  className="group flex min-w-0 items-center
                    gap-3 px-4 py-4 transition
                    hover:bg-[#FFF7ED] sm:px-5"
                >
                  <span
                    className="flex h-10 w-10 shrink-0
                      items-center justify-center
                      rounded-xl bg-[#FFF0E9] text-[#9F2D18]"
                  >
                    <Bell className="h-5 w-5" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[#292421]">
                      Notification settings
                    </span>

                    <span className="mt-1 block text-[10px] leading-5 text-[#81766D] sm:text-xs">
                      Manage the updates and notifications you receive.
                    </span>
                  </span>

                  <ChevronRight
                    className="h-4 w-4 shrink-0
                      text-[#A49A91] transition
                      group-hover:translate-x-0.5
                      group-hover:text-[#9F2D18]"
                  />
                </Link>
              </div>

              {/* SELLER ONBOARDING */}

              <section
                className="mt-5 overflow-hidden
                  rounded-xl border border-[#F1D4C8]
                  bg-white"
                aria-labelledby="seller-onboarding-heading"
              >
                <div
                  className="flex items-center gap-3
                    border-b border-[#F5E7E1]
                    bg-[#FFF7F2] px-4 py-4 sm:px-5"
                >
                  <span
                    className="flex h-10 w-10 shrink-0
                      items-center justify-center
                      rounded-xl bg-[#FFE0D6]
                      text-[#9F2D18]"
                  >
                    <Store className="h-5 w-5" />
                  </span>

                  <div>
                    <h2
                      id="seller-onboarding-heading"
                      className="text-sm font-extrabold text-[#292421]"
                    >
                      Have a business?
                    </h2>

                    <p className="mt-0.5 text-[10px] text-[#81766D]">
                      You can also sell on ReMarket.
                    </p>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <p className="text-xs leading-5 text-[#756B61]">
                    Create a seller profile to start listing
                    your products and help more people discover
                    your business.
                  </p>

                  {!showSellerConfirmation ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSellerSwitchError("");
                        setShowSellerConfirmation(true);
                      }}
                      className="mt-4 inline-flex min-h-10
                        w-full items-center justify-center
                        gap-2 rounded-lg bg-[#FF5A36]
                        px-4 py-2.5 text-xs font-bold
                        text-white transition hover:bg-[#E94A28]
                        focus-visible:outline-none
                        focus-visible:ring-2
                        focus-visible:ring-[#FF5A36]
                        focus-visible:ring-offset-2"
                    >
                      Start selling
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <div
                      className="mt-4 rounded-xl
                        border border-[#EAE6DF]
                        bg-[#FCFAF6] p-3"
                    >
                      <p className="text-xs font-bold text-[#292421]">
                        Switch this account to Seller?
                      </p>

                      <p className="mt-1 text-[11px] leading-5 text-[#81766D]">
                        ReMarket currently uses one account
                        role at a time. You will sign in again
                        after the change.
                      </p>

                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          disabled={switchingToSeller}
                          onClick={() => void startSelling()}
                          className="inline-flex min-h-10
                            items-center justify-center gap-2
                            rounded-lg bg-[#FF5A36] px-3 py-2
                            text-xs font-bold text-white
                            disabled:cursor-not-allowed
                            disabled:opacity-60"
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
                          onClick={() =>
                            setShowSellerConfirmation(false)
                          }
                          className="min-h-9 rounded-lg
                            border border-[#EAE6DF]
                            bg-white px-3 py-2
                            text-xs font-semibold
                            text-[#756B61] transition
                            hover:bg-[#FFF7ED]
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
                      className="mt-3 rounded-lg
                        border border-[#F1D5D0]
                        bg-[#FFF0EE] px-3 py-2.5
                        text-xs leading-5 text-[#9F2D18]"
                    >
                      {sellerSwitchError}
                    </p>
                  )}
                </div>
              </section>
            </section>

            {/* RIGHT: ACCOUNT INFORMATION */}

            <aside className="min-w-0 space-y-4">
              <section
                className="rounded-xl border
                  border-[#EAE6DF] bg-white p-4 sm:p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-extrabold text-[#292421]">
                    Personal information
                  </h2>

                  <span
                    className="rounded-full bg-[#EAF7F0]
                      px-2.5 py-1 text-[9px]
                      font-bold text-[#137A59]"
                  >
                    Buyer
                  </span>
                </div>

                <dl className="mt-4 divide-y divide-[#F0ECE6]">
                  <AccountDetail
                    label="Full name"
                    value={displayName}
                  />

                  <AccountDetail
                    label="Email address"
                    value={email}
                  />
                </dl>

                <div
                  className="mt-3 border-t
                    border-[#F0ECE6] pt-3"
                >
                  <p className="text-[10px] leading-5 text-[#81766D]">
                    Your information is linked to the ReMarket
                    account you used to sign in.
                  </p>
                </div>
              </section>

              {/* SHOPPING REMINDER */}

              <section
                className="rounded-xl border
                  border-[#EAE6DF] bg-white p-4 sm:p-5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex h-9 w-9
                      items-center justify-center
                      rounded-lg bg-[#FFF0E9]
                      text-[#9F2D18]"
                  >
                    <ShoppingBag className="h-4 w-4" />
                  </span>

                  <h2 className="text-sm font-extrabold text-[#292421]">
                    Keep shopping
                  </h2>
                </div>

                <p className="mt-3 text-[11px] leading-5 text-[#756B61]">
                  Find products from businesses around you.
                  Compare listings and save products you want
                  to revisit.
                </p>

                <Link
                  href="/shop"
                  className="mt-4 inline-flex min-h-9
                    w-full items-center justify-center
                    gap-2 rounded-lg border
                    border-[#FFD0C3] bg-[#FFF7F2]
                    px-3 py-2 text-[10px]
                    font-bold text-[#9F2D18]
                    transition hover:bg-[#FFE8DF]"
                >
                  Browse products
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </section>
            </aside>
          </div>

          {/* FOOTER */}

          <footer
            className="mt-8 border-t border-[#EAE6DF]
              pt-4 text-center"
          >
            <p className="text-[10px] text-[#A49A91]">
              ReMarket · Find it nearby
            </p>
          </footer>
        </div>
      </main>

      {/* SHARED REMARKET MOBILE NAVIGATION */}

      <MobileBottomNav />
    </div>
  );
}
