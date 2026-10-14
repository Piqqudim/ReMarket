
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

/**
 * Normalize the profile returned by the API.
 *
 * The fallback is used when an update response contains
 * only partial profile information.
 */
function normalizeSellerProfile(
  data: ProfileResponse | null,
  fallback?: SellerProfile
): SellerProfile | null {
  if (!data) {
    return fallback ?? null;
  }

  const candidate =
    data.profile ??
    data.user ??
    data;

  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return fallback ?? null;
  }

  const record =
    candidate as Record<string, unknown>;

  const id =
    typeof record.id === "string" &&
    record.id.trim()
      ? record.id
      : fallback?.id;

  const email =
    typeof record.email === "string" &&
    record.email.trim()
      ? record.email
      : fallback?.email;

  let name: string | null;

  if (typeof record.name === "string") {
    name = record.name;
  } else if (record.name === null) {
    name = null;
  } else {
    name = fallback?.name ?? null;
  }

  if (!id || !email) {
    return fallback ?? null;
  }

  return {
    id,
    name,
    email,
  };
}

export default function SellerProfilePage() {
  const router = useRouter();

  const [profile, setProfile] =
    useState<SellerProfile | null>(null);

  const [name, setName] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [redirecting, setRedirecting] =
    useState(false);

  const [loadAttempt, setLoadAttempt] =
    useState(0);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          "/api/seller/profile",
          {
            cache: "no-store",
          }
        );

        let data: ProfileResponse | null = null;

        try {
          data =
            (await response.json()) as ProfileResponse;
        } catch {
          data = null;
        }

        if (
          response.status === 401 ||
          response.status === 403
        ) {
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
              : "Unable to load your profile."
          );
        }

        const loadedProfile =
          normalizeSellerProfile(data);

        if (!loadedProfile) {
          throw new Error(
            "Seller profile could not be found."
          );
        }

        if (cancelled) {
          return;
        }

        setProfile(loadedProfile);

        setName(
          loadedProfile.name ?? ""
        );
      } catch (loadError) {
        console.error(
          "Seller profile load error:",
          loadError
        );

        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your profile."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router, loadAttempt]);

  async function saveProfile(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (saving || !profile) {
      return;
    }

    setError("");
    setSuccess("");

    const cleanName = name.trim();

    if (!cleanName) {
      setError("Name is required.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        "/api/seller/profile",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: cleanName,
          }),
        }
      );

      let data: ProfileResponse | null = null;

      try {
        data =
          (await response.json()) as ProfileResponse;
      } catch {
        data = null;
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        setRedirecting(true);
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Unable to update your profile."
        );

        return;
      }

      const updatedProfile =
        normalizeSellerProfile(
          data,
          {
            ...profile,
            name: cleanName,
          }
        ) ?? {
          ...profile,
          name: cleanName,
        };

      setProfile(updatedProfile);

      setName(
        updatedProfile.name ?? cleanName
      );

      setSuccess(
        "Your profile has been updated successfully."
      );
    } catch (saveError) {
      console.error(
        "Seller profile update error:",
        saveError
      );

      setError(
        "Something went wrong. Please try again."
      );
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
      <main className="min-h-screen bg-[#FFF7ED]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1500px] items-center justify-center px-4">
          <div className="flex items-center gap-3 text-sm font-medium text-gray-600">
            <LoaderCircle
              aria-hidden="true"
              className="h-5 w-5 animate-spin text-[#FF5A36]"
            />

            {redirecting
              ? "Redirecting to login..."
              : "Loading your profile..."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED]">
      <div className="mx-auto min-h-screen w-full max-w-[1500px] px-3 py-3 sm:px-5 sm:py-5">
        <div className="min-h-[calc(100vh-24px)] overflow-hidden rounded-[18px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:rounded-[22px] lg:min-h-[calc(100vh-40px)]">

          {/* Header */}

          <header className="flex min-h-[66px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
            <Link
              href="/seller"
              className="flex items-center gap-2.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
                <Store
                  aria-hidden="true"
                  className="h-5 w-5"
                />
              </div>

              <div>
                <p className="text-sm font-bold tracking-tight text-[#17202A]">
                  ReMarket
                </p>

                <p className="text-[10px] leading-none text-gray-400">
                  Seller Portal
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <NotificationBell />

              <Link
                href="/seller"
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
              >
                <ArrowLeft
                  aria-hidden="true"
                  className="h-4 w-4"
                />

                <span className="hidden sm:inline">
                  Dashboard
                </span>
              </Link>
            </div>
          </header>

          {/* Content */}

          <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="mx-auto max-w-[900px]">

              {/* Heading */}

              <div className="mb-7">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
                  Account settings
                </p>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#17202A] sm:text-3xl">
                  Seller profile
                </h1>

                <p className="mt-2 max-w-[650px] text-sm leading-6 text-gray-500">
                  Manage the account information connected to your seller profile.
                </p>
              </div>

              {/* Feedback */}

              {profile && error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-[#FFB8B0] bg-[#FFF0EE] px-4 py-4"
                >
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#E33B22]"
                  />

                  <p className="text-sm text-[#E33B22]">
                    {error}
                  </p>
                </div>
              )}

              {profile && success && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-4"
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#137A59]"
                  />

                  <p className="text-sm text-[#137A59]">
                    {success}
                  </p>
                </div>
              )}

              {!profile ? (
                /* Failed profile load */

                <section className="rounded-[22px] border border-[#E8E4DE] bg-white px-5 py-8 shadow-sm sm:px-6">
                  <div className="mx-auto flex max-w-[480px] flex-col items-center text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#E33B22]">
                      <CircleAlert
                        aria-hidden="true"
                        className="h-6 w-6"
                      />
                    </div>

                    <h2 className="mt-4 text-lg font-bold text-[#17202A]">
                      Unable to load your profile
                    </h2>

                    <p
                      className="mt-2 text-sm leading-6 text-gray-500"
                      role="alert"
                    >
                      {error ||
                        "Your account information could not be loaded. Please try again."}
                    </p>

                    <button
                      type="button"
                      onClick={retryLoadProfile}
                      className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25"
                    >
                      <ArrowLeft
                        aria-hidden="true"
                        className="h-4 w-4 rotate-180"
                      />

                      Try again
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  {/* Profile */}

                  <section className="rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                    <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                          <UserRound
                            aria-hidden="true"
                            className="h-5 w-5"
                          />
                        </div>

                        <div>
                          <h2 className="text-lg font-bold text-[#17202A]">
                            Account information
                          </h2>

                          <p className="mt-1 text-xs text-gray-500">
                            Your seller account details.
                          </p>
                        </div>
                      </div>
                    </div>

                    <form
                      onSubmit={saveProfile}
                      className="space-y-5 px-5 py-6 sm:px-6"
                    >
                      {/* Name */}

                      <div>
                        <label
                          htmlFor="seller-profile-name"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Full name
                        </label>

                        <div className="relative">
                          <UserRound
                            aria-hidden="true"
                            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#FF694F]"
                          />

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
                            className="h-12 w-full rounded-xl border border-[#D9DEE5] bg-white pl-11 pr-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                          />
                        </div>
                      </div>

                      {/* Email */}

                      <div>
                        <label
                          htmlFor="seller-profile-email"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Email address
                        </label>

                        <div className="relative">
                          <Mail
                            aria-hidden="true"
                            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                          />

                          <input
                            id="seller-profile-email"
                            name="email"
                            type="email"
                            value={profile.email}
                            readOnly
                            className="h-12 w-full rounded-xl border border-[#D9DEE5] bg-[#F8F8F7] pl-11 pr-4 text-sm text-gray-500 outline-none"
                          />
                        </div>

                        <p className="mt-2 text-[11px] text-gray-400">
                          Your email address is read-only.
                        </p>
                      </div>

                      {/* Save */}

                      <div className="flex justify-end border-t border-[#EAE6DF] pt-5">
                        <button
                          type="submit"
                          disabled={saving}
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {saving ? (
                            <>
                              <LoaderCircle
                                aria-hidden="true"
                                className="h-4 w-4 animate-spin"
                              />

                              Saving...
                            </>
                          ) : (
                            <>
                              <Save
                                aria-hidden="true"
                                className="h-4 w-4"
                              />

                              Save changes
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </section>

                  {/* Navigation */}

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <Link
                      href="/seller"
                      className="rounded-2xl border border-[#E8E4DE] bg-white p-4 transition hover:bg-[#FFF7ED]"
                    >
                      <p className="text-sm font-bold text-[#17202A]">
                        Business dashboard
                      </p>

                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Manage your business and products.
                      </p>
                    </Link>

                    <Link
                      href="/seller/claims"
                      className="rounded-2xl border border-[#E8E4DE] bg-white p-4 transition hover:bg-[#FFF7ED]"
                    >
                      <p className="text-sm font-bold text-[#17202A]">
                        Business claims
                      </p>

                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        View and submit ownership claims.
                      </p>
                    </Link>

                    {/* New referral navigation */}

                    <Link
                      href="/referrals"
                      className="group rounded-2xl border border-[#E8E4DE] bg-white p-4 transition hover:border-[#FF5A36]/40 hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36] transition group-hover:bg-[#FFE3D8]">
                          <Gift
                            aria-hidden="true"
                            className="h-5 w-5"
                          />
                        </div>

                        <div>
                          <p className="text-sm font-bold text-[#17202A]">
                            Refer &amp; Earn
                          </p>

                          <p className="mt-1 text-xs leading-5 text-gray-500">
                            Share your referral link, track invited sellers, and view your earned product-slot rewards.
                          </p>
                        </div>
                      </div>
                    </Link>
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
