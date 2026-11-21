"use client";

import {
  Suspense,
  useState,
  type FormEvent,
} from "react";

import { signIn } from "next-auth/react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import Link from "next/link";

import {
  Store,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Home,
  LoaderCircle,
  CircleAlert,
} from "lucide-react";

/**
 * Only permit safe, same-origin internal callback paths.
 *
 * Examples:
 * /seller
 * /seller/business-id
 * /seller/business-id?tab=products
 *
 * External URLs, protocol-relative URLs, backslashes,
 * control characters, and invalid URLs fall back to /seller.
 */
function getSafeCallbackUrl(
  value: string | null
): string {
  const fallback = "/seller";
  const baseUrl = "https://remarket.invalid";

  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return fallback;
  }

  try {
    const parsedUrl = new URL(
      value,
      baseUrl
    );

    if (
      parsedUrl.origin !== baseUrl ||
      !parsedUrl.pathname.startsWith("/") ||
      parsedUrl.pathname.startsWith("//")
    ) {
      return fallback;
    }

    return (
      parsedUrl.pathname +
      parsedUrl.search +
      parsedUrl.hash
    );
  } catch {
    return fallback;
  }
}

function SellerLoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Preserve the page the seller originally came from.
   *
   * Example:
   * /seller/login?callbackUrl=/seller/business-id
   */
  const callbackUrl = getSafeCallbackUrl(
    searchParams.get("callbackUrl")
  );

  /**
   * Preserve the callback when the seller goes
   * from login to signup.
   */
  const signupUrl =
    `/seller/signup?callbackUrl=${encodeURIComponent(
      callbackUrl
    )}`;

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) {
      return;
    }

    const trimmedEmail = email.trim();

    setError("");

    if (!trimmedEmail) {
      setError("Email address is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);

    try {
      const result = await signIn(
        "credentials",
        {
          email: trimmedEmail,
          password,
          redirect: false,
          callbackUrl,
        }
      );

      if (
        !result ||
        result.error ||
        result.ok !== true
      ) {
        setError(
          "Invalid email or password."
        );

        return;
      }

      /**
       * Return to the validated internal path
       * rather than always redirecting to /seller.
       */
      router.push(callbackUrl);
      router.refresh();
    } catch (loginError) {
      console.error(
        "Seller login error:",
        loginError
      );

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="rm-storefront flex min-h-dvh w-full items-center justify-center bg-[var(--rm-cream)] px-4 py-5 sm:px-6 sm:py-8">
      <section className="flex w-full max-w-[470px] flex-col">
        <nav aria-label="Main navigation" className="mb-4 flex items-center justify-start">
          <Link
            href="/"
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--rm-border)] bg-white/90 px-3.5 py-2 text-xs font-bold text-[var(--rm-text)] shadow-sm transition hover:border-[var(--rm-coral)] hover:bg-white hover:text-[var(--rm-coral-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rm-coral)] focus-visible:ring-offset-2"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            <Home aria-hidden="true" className="h-4 w-4" />
            Home
          </Link>
        </nav>
        {/* Brand */}

        <div className="mb-4 flex flex-col items-center text-center sm:mb-5">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--rm-coral)] shadow-[0_8px_20px_rgba(255,90,54,0.20)] sm:h-16 sm:w-16">
            <Store
              className="h-7 w-7 text-white sm:h-8 sm:w-8"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </div>

          <h1 className="text-[32px] font-extrabold leading-none tracking-[-1.5px] text-[var(--rm-ink)] sm:text-[36px]">
            Re
            <span className="text-[var(--rm-coral)]">
              Market
            </span>
          </h1>

          <p className="mt-2 text-[13px] font-medium text-[var(--rm-muted)] sm:text-sm">
            Seller Portal
          </p>
        </div>

        {/* Login card */}

        <div className="rm-panel w-full rounded-2xl bg-white px-5 py-6 shadow-[0_12px_36px_rgba(23,32,42,0.08)] sm:px-8 sm:py-8">
          {/* Header */}

          <div className="mb-6">
            <h2 className="text-2xl font-extrabold leading-tight tracking-tight text-[var(--rm-ink)] sm:text-[27px]">
              Welcome back
            </h2>

            <p className="mt-2 text-[13px] leading-5 text-[var(--rm-muted)] sm:text-sm">
              Sign in to manage your business
            </p>
          </div>

          {/* Form */}

          <form
            onSubmit={submit}
            className="space-y-4 sm:space-y-5"
          >
            {/* Email */}

            <div>
              <label
                htmlFor="email"
                className="rm-field-label mb-2 text-xs"
              >
                Email address
              </label>

              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--rm-coral)]"
                  strokeWidth={2}
                />

                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);

                    if (error) {
                      setError("");
                    }
                  }}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  disabled={loading}
                  className="rm-input h-12 w-full rounded-lg bg-white pl-11 pr-4 text-sm placeholder:text-[var(--rm-subtle)] disabled:cursor-not-allowed disabled:bg-[var(--rm-surface-muted)]"
                />
              </div>
            </div>

            {/* Password */}

            <div>
              <label
                htmlFor="password"
                className="rm-field-label mb-2 text-xs"
              >
                Password
              </label>

              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--rm-coral)]"
                  strokeWidth={2}
                />

                <input
                  id="password"
                  name="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);

                    if (error) {
                      setError("");
                    }
                  }}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="rm-input h-12 w-full rounded-lg bg-white pl-11 pr-12 text-sm placeholder:text-[var(--rm-subtle)] disabled:cursor-not-allowed disabled:bg-[var(--rm-surface-muted)]"
                />

                <button
                  type="button"
                  onClick={() => {
                    setShowPassword(
                      (current) => !current
                    );
                  }}
                  disabled={loading}
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  aria-pressed={showPassword}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-[var(--rm-muted)] transition-colors hover:bg-[var(--rm-surface-muted)] hover:text-[var(--rm-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff
                      aria-hidden="true"
                      className="h-5 w-5"
                      strokeWidth={2}
                    />
                  ) : (
                    <Eye
                      aria-hidden="true"
                      className="h-5 w-5"
                      strokeWidth={2}
                    />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-3 rounded-xl border border-[var(--rm-red-bg)] bg-[var(--rm-red-bg)]/70 px-3 py-3"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--rm-red)] text-white">
                  <CircleAlert
                    aria-hidden="true"
                    className="h-4 w-4"
                    strokeWidth={2.3}
                  />
                </div>

                <p className="min-w-0 break-words pt-0.5 text-xs leading-5 text-[var(--rm-red)]">
                  {error}
                </p>
              </div>
            )}

            {/* Login button */}

            <button
              type="submit"
              disabled={loading}
              className="rm-button rm-button-primary h-12 w-full rounded-lg text-sm shadow-[0_7px_18px_rgba(255,90,54,0.18)] transition hover:shadow-[0_9px_22px_rgba(255,90,54,0.22)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className="h-6 w-6 animate-spin"
                    strokeWidth={2}
                  />

                  Signing in...
                </>
              ) : (
                <>
                  Log in

                  <ArrowRight
                    aria-hidden="true"
                    className="h-6 w-6"
                    strokeWidth={2}
                  />
                </>
              )}
            </button>
          </form>

          {/* Seller signup */}

          <div className="mt-5 text-center">
            <p className="text-xs leading-5 text-[var(--rm-muted)] sm:text-[13px]">
              Don&apos;t have a seller account?{" "}

              <Link
                href={signupUrl}
                className="font-bold text-[var(--rm-coral-dark)] transition-colors hover:text-[var(--rm-coral)] focus-visible:rounded-sm"
              >
                Create one
              </Link>
            </p>
          </div>

          {/* Footer */}

          <div className="mt-6 flex items-center gap-3">
            <div
              aria-hidden="true"
              className="h-px flex-1 bg-[var(--rm-border)]"
            />

            <p className="whitespace-nowrap text-[9px] text-[var(--rm-subtle)] sm:text-[10px]">
              Powered by your local marketplace
            </p>

            <div
              aria-hidden="true"
              className="h-px flex-1 bg-[var(--rm-border)]"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

export default function SellerLogin() {
  return (
    <Suspense
      fallback={
        <main className="rm-storefront flex min-h-dvh items-center justify-center bg-[var(--rm-cream)] px-4">
          <div className="flex items-center gap-3 text-xs font-semibold text-[var(--rm-muted)]">
            <LoaderCircle
              aria-hidden="true"
              className="h-5 w-5 animate-spin text-[var(--rm-coral)]"
              strokeWidth={2}
            />

            Loading seller login...
          </div>
        </main>
      }
    >
      <SellerLoginContent />
    </Suspense>
  );
}
