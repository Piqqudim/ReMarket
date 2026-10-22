"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import NotificationBell from "@/components/NotificationBell";

import {
  Store,
  UserRound,
  Mail,
  ArrowLeft,
  LoaderCircle,
  CheckCircle2,
  CircleAlert,
  Save,
  Gift,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  LayoutDashboard,
  ExternalLink,
} from "lucide-react";

type SellerProfile = {
  id: string;
  name: string | null;
  email: string;
};

type ProfileResponse = {
  profile?: unknown;
  user?: unknown;
  id?: unknown;
  name?: unknown;
  email?: unknown;
  error?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Normalize the profile returned by the API.
 * The fallback supports successful PATCH responses that return only
 * a message or a partial profile object.
 */
function normalizeSellerProfile(
  data: ProfileResponse | null,
  fallback?: SellerProfile
): SellerProfile | null {
  if (!data) return fallback ?? null;

  const candidate = data.profile ?? data.user ?? data;
  if (!isRecord(candidate)) return fallback ?? null;

  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id
      : fallback?.id;

  const email =
    typeof candidate.email === "string" && candidate.email.trim()
      ? candidate.email
      : fallback?.email;

  let name: string | null;
  if (typeof candidate.name === "string") {
    name = candidate.name;
  } else if (candidate.name === null) {
    name = null;
  } else {
    name = fallback?.name ?? null;
  }

  if (!id || !email) return fallback ?? null;

  return { id, name, email };
}

async function readProfileResponse(
  response: Response
): Promise<ProfileResponse | null> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? (value as ProfileResponse) : null;
  } catch {
    return null;
  }
}

function getInitials(name: string | null, email: string): string {
  const cleanName = name?.trim();

  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }

  return email.trim().slice(0, 2).toUpperCase() || "RM";
}

export default function SellerProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setRedirecting(false);
      setError("");
      setSuccess("");

      try {
        const response = await fetch("/api/seller/profile", {
          cache: "no-store",
        });
        const data = await readProfileResponse(response);

        if (response.status === 401 || response.status === 403) {
          if (!cancelled) {
            setRedirecting(true);
            router.replace("/seller/login");
          }
          return;
        }

        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Unable to load your profile. Please try again."
          );
        }

        const loadedProfile = normalizeSellerProfile(data);
        if (!loadedProfile) {
          throw new Error("Seller profile could not be found.");
        }

        if (cancelled) return;

        setProfile(loadedProfile);
        setName(loadedProfile.name ?? "");
      } catch (loadError) {
        console.error("Seller profile load error:", loadError);

        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your profile. Please try again."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router, loadAttempt]);

  const cleanName = name.trim();
  const savedName = profile?.name?.trim() ?? "";
  const hasChanges = Boolean(profile && cleanName !== savedName);
  const basicsComplete = Boolean(profile?.email.trim() && savedName);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving || !profile || !hasChanges) return;

    setError("");
    setSuccess("");

    if (!cleanName) {
      setError("Please enter your name before saving.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/seller/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName }),
      });
      const data = await readProfileResponse(response);

      if (response.status === 401 || response.status === 403) {
        setRedirecting(true);
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Unable to update your profile. Please try again."
        );
        return;
      }

      const updatedProfile = normalizeSellerProfile(data, {
        ...profile,
        name: cleanName,
      }) ?? { ...profile, name: cleanName };

      setProfile(updatedProfile);
      setName(updatedProfile.name ?? cleanName);
      setSuccess("Your profile has been updated successfully.");
    } catch (saveError) {
      console.error("Seller profile update error:", saveError);
      setError("We couldn't save your changes. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function retryLoadProfile() {
    setError("");
    setSuccess("");
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  if (loading || redirecting) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#FFF7ED] px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#EAE6DF] bg-white px-5 py-4 text-sm font-medium text-gray-600 shadow-sm">
          <LoaderCircle
            aria-hidden="true"
            className="h-5 w-5 animate-spin text-[#FF5A36]"
          />
          {redirecting ? "Redirecting to login..." : "Loading your profile..."}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#FFF7ED]">
      <div className="mx-auto min-h-dvh w-full max-w-[1600px] sm:px-4 sm:py-4 lg:px-6 lg:py-6">
        <div className="min-h-dvh overflow-hidden bg-[#FFFDFC] sm:min-h-[calc(100dvh-2rem)] sm:rounded-[24px] sm:border sm:border-[#EAE6DF] sm:shadow-sm lg:min-h-[calc(100dvh-3rem)]">
          {/* Header */}
          <header className="flex min-h-[66px] items-center justify-between gap-3 border-b border-[#EAE6DF] bg-white px-4 sm:px-6 lg:px-8">
            <Link
              href="/seller"
              className="flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
                <Store aria-hidden="true" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight text-[#17202A]">ReMarket</p>
                <p className="text-[10px] leading-none text-gray-400">Seller Portal</p>
              </div>
            </Link>

            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell />
              <Link
                href="/seller"
                aria-label="Back to seller dashboard"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs font-semibold text-gray-700 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20 sm:px-3.5"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </div>
          </header>

          <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 xl:px-10">
            <div className="mx-auto max-w-[1180px]">
              {/* Page heading */}
              <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD9CD] bg-[#FFF0EB] px-3 py-1.5">
                    <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-[#FF5A36]" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9F2D18]">
                      Account settings
                    </p>
                  </div>
                  <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#17202A] sm:text-3xl lg:text-[34px]">
                    Seller profile
                  </h1>
                  <p className="mt-2 max-w-[620px] text-sm leading-6 text-gray-500">
                    Keep your account details up to date. Your name helps us personalise your seller experience.
                  </p>
                </div>

                {profile && (
                  <div className="flex w-fit max-w-full items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2.5 shadow-sm">
                    <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-[#137A59]" />
                    <span className="text-xs font-semibold text-gray-600">Seller account</span>
                  </div>
                )}
              </div>

              {!profile ? (
                <section className="rounded-[22px] border border-[#E8E4DE] bg-white px-5 py-8 shadow-sm sm:px-6 sm:py-10">
                  <div className="mx-auto flex max-w-[480px] flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0EB] text-[#E33B22]">
                      <CircleAlert aria-hidden="true" className="h-6 w-6" />
                    </div>
                    <h2 className="mt-4 text-lg font-bold text-[#17202A]">Unable to load your profile</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-500" role="alert">
                      {error || "Your account information could not be loaded. Please try again."}
                    </p>
                    <button
                      type="button"
                      onClick={retryLoadProfile}
                      className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25 sm:w-auto"
                    >
                      <ArrowLeft aria-hidden="true" className="h-4 w-4 rotate-180" />
                      Try again
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  {/* Feedback messages */}
                  {error && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="mb-5 flex items-start gap-3 rounded-2xl border border-[#FFB8B0] bg-[#FFF0EE] px-4 py-4"
                    >
                      <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#E33B22]" />
                      <p className="text-sm leading-5 text-[#E33B22]">{error}</p>
                    </div>
                  )}

                  {success && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="mb-5 flex items-start gap-3 rounded-2xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-4"
                    >
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#137A59]" />
                      <p className="text-sm leading-5 text-[#137A59]">{success}</p>
                    </div>
                  )}

                  <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(270px,0.85fr)] lg:items-start xl:gap-6">
                    {/* Main account form */}
                    <section className="min-w-0 overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                      <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                            <UserRound aria-hidden="true" className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-lg font-bold text-[#17202A]">Account information</h2>
                            <p className="mt-1 text-xs leading-5 text-gray-500">Edit the personal details connected to your seller account.</p>
                          </div>
                        </div>
                      </div>

                      <form onSubmit={saveProfile} className="space-y-5 px-5 py-6 sm:px-6 sm:py-7">
                        <div>
                          <label htmlFor="seller-profile-name" className="mb-2 block text-xs font-bold text-gray-700">
                            Full name <span className="text-[#C5402D]" aria-hidden="true">*</span>
                          </label>
                          <div className="relative">
                            <UserRound aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#FF694F]" />
                            <input
                              id="seller-profile-name"
                              name="name"
                              type="text"
                              autoComplete="name"
                              value={name}
                              onChange={(event) => {
                                setName(event.target.value);
                                setError("");
                                setSuccess("");
                              }}
                              disabled={saving}
                              required
                              aria-describedby="seller-profile-name-help"
                              className="h-12 w-full rounded-xl border border-[#D9DEE5] bg-white pl-11 pr-4 text-sm text-[#17202A] outline-none transition placeholder:text-gray-400 hover:border-[#C8CDD5] focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
                            />
                          </div>
                          <p id="seller-profile-name-help" className="mt-2 text-[11px] leading-5 text-gray-400">
                            Use the name you want associated with your seller account.
                          </p>
                        </div>

                        <div>
                          <label htmlFor="seller-profile-email" className="mb-2 block text-xs font-bold text-gray-700">
                            Email address
                          </label>
                          <div className="relative">
                            <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                              id="seller-profile-email"
                              name="email"
                              type="email"
                              autoComplete="email"
                              value={profile.email}
                              readOnly
                              aria-describedby="seller-profile-email-help"
                              className="h-12 w-full rounded-xl border border-[#D9DEE5] bg-[#F8F8F7] pl-11 pr-4 text-sm text-gray-500 outline-none"
                            />
                          </div>
                          <p id="seller-profile-email-help" className="mt-2 text-[11px] leading-5 text-gray-400">
                            Your email address is read-only here.
                          </p>
                        </div>

                        <div className="rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                            <p className="text-[11px] leading-5 text-gray-500">
                              Changes to your name will be saved to your seller account. Your business name and business contact details are managed separately from this page.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-gray-400" aria-live="polite">
                            {saving
                              ? "Saving your changes…"
                              : hasChanges
                                ? "You have unsaved changes."
                                : "Your profile is up to date."}
                          </p>
                          <button
                            type="submit"
                            disabled={saving || !hasChanges || !cleanName}
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#F24B2C] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25 disabled:cursor-not-allowed disabled:bg-[#F7B6A7] disabled:shadow-none sm:w-auto"
                          >
                            {saving ? (
                              <>
                                <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
                                Saving…
                              </>
                            ) : (
                              <>
                                <Save aria-hidden="true" className="h-4 w-4" />
                                Save changes
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </section>

                    {/* Desktop-friendly profile and navigation sidebar */}
                    <aside className="min-w-0 space-y-5">
                      <section className="overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                        <div className="h-2 bg-gradient-to-r from-[#FF5A36] via-[#FF8B67] to-[#F7C9A9]" />
                        <div className="p-5 sm:p-6">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Your account</p>
                          <div className="mt-4 flex items-center gap-3">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EB] text-lg font-bold text-[#9F2D18] ring-4 ring-[#FFF7ED]">
                              {getInitials(profile.name, profile.email)}
                            </div>
                            <div className="min-w-0">
                              <h2 className="break-words text-base font-bold text-[#17202A]">
                                {profile.name?.trim() || "Add your name"}
                              </h2>
                              <p className="mt-1 break-all text-xs leading-5 text-gray-500">{profile.email}</p>
                            </div>
                          </div>

                          <div className="mt-5 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-3.5">
                            <div className="flex items-center gap-2">
                              {basicsComplete ? (
                                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[#137A59]" />
                              ) : (
                                <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-[#B7791F]" />
                              )}
                              <p className="text-xs font-bold text-[#17202A]">
                                {basicsComplete ? "Basic details complete" : "Complete your basic details"}
                              </p>
                            </div>
                            <p className="mt-1.5 pl-6 text-[11px] leading-5 text-gray-500">
                              {basicsComplete
                                ? "Your name and account email are available on this profile."
                                : "Add your name to finish the basic account details."}
                            </p>
                          </div>
                        </div>
                      </section>

                      <section className="rounded-[22px] border border-[#E8E4DE] bg-white p-5 shadow-sm sm:p-6">
                        <div className="mb-4">
                          <h2 className="text-sm font-bold text-[#17202A]">Quick links</h2>
                          <p className="mt-1 text-xs leading-5 text-gray-500">Jump straight to another part of your seller account.</p>
                        </div>

                        <div className="space-y-2.5">
                          <Link
                            href="/seller"
                            className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#EAE6DF] bg-white p-3.5 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36] transition group-hover:bg-[#FFE3D8]">
                              <LayoutDashboard aria-hidden="true" className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-[#17202A]">Business dashboard</span>
                              <span className="mt-1 block text-[11px] leading-5 text-gray-500">Manage your business and products.</span>
                            </span>
                            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-[#9F2D18]" />
                          </Link>

                          <Link
                            href="/seller/claims"
                            className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#EAE6DF] bg-white p-3.5 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF4FF] text-[#3566B8] transition group-hover:bg-[#E0EAFF]">
                              <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-[#17202A]">Business claims</span>
                              <span className="mt-1 block text-[11px] leading-5 text-gray-500">View or submit ownership claims.</span>
                            </span>
                            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-[#9F2D18]" />
                          </Link>

                          <Link
                            href="/referrals"
                            className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#EAE6DF] bg-white p-3.5 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF2D9] text-[#9A6700] transition group-hover:bg-[#FFE9B8]">
                              <Gift aria-hidden="true" className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-[#17202A]">Refer &amp; Earn</span>
                              <span className="mt-1 block text-[11px] leading-5 text-gray-500">Share your referral link and track eligible rewards.</span>
                            </span>
                            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-[#9F2D18]" />
                          </Link>
                        </div>
                      </section>

                      <div className="rounded-2xl border border-[#FFD9CD] bg-[#FFF0EB] p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#FF5A36]">
                            <Store aria-hidden="true" className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#9F2D18]">Keep your shop up to date</p>
                            <p className="mt-1 text-[11px] leading-5 text-[#8B5142]">Your seller profile details are separate from your public business details.</p>
                            <Link href="/seller" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#9F2D18] underline decoration-[#DDA08E] underline-offset-4 hover:text-[#6F1E12]">
                              Open dashboard
                              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </aside>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
