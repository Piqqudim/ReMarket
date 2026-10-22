"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Heart,
  Loader2,
  LogOut,
  MapPin,
  ShieldCheck,
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

function errorMessage(value: unknown, fallback: string): string {
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

export default function BuyerProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const user = session?.user as ProfileSessionUser | undefined;
  const role = user?.role;
  const displayName = user?.name?.trim() || "ReMarket buyer";
  const email = user?.email?.trim() || "Email not available";

  const [savedCount, setSavedCount] = useState(0);
  const [showSellerConfirmation, setShowSellerConfirmation] = useState(false);
  const [switchingToSeller, setSwitchingToSeller] = useState(false);
  const [sellerSwitchError, setSellerSwitchError] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);

  const refreshSavedCount = useCallback(() => {
    setSavedCount(getSavedBusinesses().length);
  }, []);

  useEffect(() => {
    refreshSavedCount();

    window.addEventListener(SAVED_BUSINESSES_CHANGED_EVENT, refreshSavedCount);
    window.addEventListener("storage", refreshSavedCount);

    return () => {
      window.removeEventListener(SAVED_BUSINESSES_CHANGED_EVENT, refreshSavedCount);
      window.removeEventListener("storage", refreshSavedCount);
    };
  }, [refreshSavedCount]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/buyer/login?callbackUrl=${encodeURIComponent("/profile")}`);
      return;
    }

    if (status !== "authenticated") {
      return;
    }

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

      const data = (await response.json().catch(() => null)) as ApiResponse | null;

      if (!response.ok) {
        setSellerSwitchError(
          errorMessage(data, "Unable to switch this account to seller.")
        );
        return;
      }

      // The role is stored in the JWT at sign-in, so re-authenticate to refresh it.
      await signOut({ redirect: false });
      router.replace("/seller/login?account=converted");
      router.refresh();
    } catch (error) {
      console.error("Start selling error:", error);
      setSellerSwitchError("Something went wrong. Please try again.");
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
      <main className="flex min-h-dvh items-center justify-center bg-[#FCFAF6] px-4">
        <div className="flex items-center gap-2 text-sm text-[#756B61]" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-[#FF5A36]" aria-hidden="true" />
          Loading your account...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#FCFAF6] px-3 py-4 text-[#17202A] sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/"
          className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[#756B61] transition hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to ReMarket
        </Link>

        <section className="overflow-hidden rounded-[26px] border border-[#EAE6DF] bg-white shadow-[0_8px_30px_rgba(23,32,42,0.04)]">
          <div className="relative overflow-hidden bg-[#17202A] px-5 py-7 text-white sm:px-8 sm:py-9">
            <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-24 h-44 w-44 rounded-full bg-[#FF5A36]/20 blur-3xl" />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#FF5A36] text-white shadow-lg shadow-black/10">
                <UserRound className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFD3C6]">Buyer account</p>
                <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">Your profile</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Manage your ReMarket activity and keep your account details close at hand.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-4 sm:p-7 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4 sm:p-5" aria-labelledby="identity-heading">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 id="identity-heading" className="text-base font-bold">Account information</h2>
                    <p className="mt-1 text-xs leading-5 text-[#756B61]">These details come from the account you signed in with.</p>
                  </div>
                </div>

                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0 rounded-xl bg-[#FCFAF6] p-3.5">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8A8178]">Name</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-[#17202A]">{displayName}</dd>
                  </div>
                  <div className="min-w-0 rounded-xl bg-[#FCFAF6] p-3.5">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8A8178]">Email address</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-[#17202A]">{email}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5" aria-labelledby="activity-heading">
                <div>
                  <h2 id="activity-heading" className="text-base font-bold">Your ReMarket activity</h2>
                  <p className="mt-1 text-xs leading-5 text-[#756B61]">Quick access to the things you save and the requests you track.</p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Link href="/saved" className="group rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]"><Heart className="h-5 w-5" aria-hidden="true" /></span>
                      <ArrowRight className="h-4 w-4 text-[#8A8178] transition group-hover:translate-x-0.5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-sm font-bold">Saved businesses</p>
                    <p className="mt-1 text-xs text-[#756B61]">{savedCount} saved {savedCount === 1 ? "business" : "businesses"} on this device</p>
                  </Link>

                  <Link href="/my-requests" className="group rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]"><ClipboardList className="h-5 w-5" aria-hidden="true" /></span>
                      <ArrowRight className="h-4 w-4 text-[#8A8178] transition group-hover:translate-x-0.5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-sm font-bold">My requests</p>
                    <p className="mt-1 text-xs leading-5 text-[#756B61]">Look up a request using its code or the contact details submitted.</p>
                  </Link>

                  <Link href="/shop" className="group rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F2EEE8] text-[#6F675F]"><Store className="h-5 w-5" aria-hidden="true" /></span>
                      <ArrowRight className="h-4 w-4 text-[#8A8178] transition group-hover:translate-x-0.5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-sm font-bold">Discover local sellers</p>
                    <p className="mt-1 text-xs leading-5 text-[#756B61]">Browse products and businesses around you.</p>
                  </Link>

                  <Link href="/request" className="group rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]"><MapPin className="h-5 w-5" aria-hidden="true" /></span>
                      <ArrowRight className="h-4 w-4 text-[#8A8178] transition group-hover:translate-x-0.5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-sm font-bold">Request an item</p>
                    <p className="mt-1 text-xs leading-5 text-[#756B61]">Tell ReMarket what you need and track it afterward.</p>
                  </Link>
                </div>
              </section>

              <section id="seller-onboarding" className="scroll-mt-6 rounded-2xl border border-[#F1D5D0] bg-[#FFF9F7] p-4 sm:p-5" aria-labelledby="seller-heading">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]"><Store className="h-5 w-5" aria-hidden="true" /></div>
                  <div className="min-w-0 flex-1">
                    <h2 id="seller-heading" className="text-base font-bold">Have a business?</h2>
                    <p className="mt-1 text-sm leading-6 text-[#756B61]">Start selling on ReMarket using this account. Your email, password and account ID will stay the same.</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[#EAE6DF] bg-white p-3.5">
                  <p className="text-xs font-bold text-[#17202A]">Before you continue</p>
                  <p className="mt-1 text-xs leading-5 text-[#756B61]">ReMarket currently stores one account role at a time. This action changes your role from Buyer to Seller. You will sign in again before setting up your business. Your saved businesses are stored on this device.</p>
                </div>

                {!showSellerConfirmation ? (
                  <button type="button" onClick={() => { setSellerSwitchError(""); setShowSellerConfirmation(true); }} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#E94A28] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25 sm:w-auto">
                    Start selling <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <div className="mt-4 rounded-xl border border-[#F1D5D0] bg-white p-4">
                    <p className="text-sm font-bold">Switch this account to Seller?</p>
                    <p className="mt-1 text-xs leading-5 text-[#756B61]">This updates the role on your existing account. No new account will be created.</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <button type="button" disabled={switchingToSeller} onClick={() => { void startSelling(); }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94A28] disabled:cursor-not-allowed disabled:opacity-60">
                        {switchingToSeller ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                        {switchingToSeller ? "Switching account..." : "Confirm and continue"}
                      </button>
                      <button type="button" disabled={switchingToSeller} onClick={() => setShowSellerConfirmation(false)} className="min-h-10 rounded-xl border border-[#EAE6DF] px-4 py-2.5 text-sm font-semibold text-[#756B61] transition hover:bg-[#FCFAF6] disabled:opacity-60">Cancel</button>
                    </div>
                  </div>
                )}

                {sellerSwitchError && <p role="alert" className="mt-3 rounded-xl border border-[#F1D0C8] bg-white px-3 py-2.5 text-xs leading-5 text-[#9F2D18]">{sellerSwitchError}</p>}
              </section>
            </div>

            <aside className="min-w-0 space-y-4">
              <section className="rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8A8178]">Signed in as</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFE0D6] text-[#9F2D18]"><UserRound className="h-5 w-5" aria-hidden="true" /></div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{displayName}</p>
                    <p className="truncate text-xs text-[#756B61]">Buyer account</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-[#EAE6DF] pt-3">
                  <button type="button" onClick={() => { void logOut(); }} disabled={logoutPending} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] px-3 py-2.5 text-sm font-semibold text-[#9F2D18] transition hover:bg-[#FFF0E9] disabled:opacity-60">
                    {logoutPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                    {logoutPending ? "Logging out..." : "Log out"}
                  </button>
                </div>
              </section>

              <p className="px-1 text-[11px] leading-5 text-[#8A8178]">ReMarket helps you discover local businesses and products. Saved items are currently stored in this browser, not synced to other devices.</p>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
