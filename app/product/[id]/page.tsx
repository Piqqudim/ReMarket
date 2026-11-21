"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Store,
  UserRound,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  LoaderCircle,
  CircleAlert,
  CheckCircle2,
  Home,
} from "lucide-react";

/**
 * Only permit safe seller-portal routes.
 *
 * Examples:
 * /seller
 * /seller/abc123
 * /seller/abc123?tab=products
 *
 * External destinations and paths outside the seller
 * portal fall back to /seller.
 */
function getSafeCallbackUrl(value: string | null): string {
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
    const parsedUrl = new URL(value, baseUrl);
    const isSellerRoute =
      parsedUrl.pathname === "/seller" ||
      parsedUrl.pathname.startsWith("/seller/");

    if (parsedUrl.origin !== baseUrl || !isSellerRoute) {
      return fallback;
    }

    return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
  } catch {
    return fallback;
  }
}

type SignupResponse = {
  error?: unknown;
};

function SellerSignupContent() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();

  /** Preserve the seller page that initiated the signup flow. */
  const callbackUrl = getSafeCallbackUrl(
    searchParams.get("callbackUrl")
  );

  /** Optional referral code validated by the signup API. */
  const referralCode = searchParams.get("ref")?.trim() ?? "";

  /** Preserve the original destination when sending the seller to login. */
  const loginUrl = `/seller/login?callbackUrl=${encodeURIComponent(
    callbackUrl
  )}`;

  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
      }
    };
  }, []);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading || completed) return;

    clearMessages();

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setError("Name is required.");
      return;
    }

    if (!cleanEmail) {
      setError("Email is required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    let signupSucceeded = false;

    try {
      const response = await fetch("/api/seller/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          password,
          ...(referralCode ? { referralCode } : {}),
        }),
      });

      let data: SignupResponse | null = null;

      try {
        data = (await response.json()) as SignupResponse;
      } catch {
        data = null;
      }

      if (!response.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Unable to create your seller account. Please try again."
        );
        return;
      }

      signupSucceeded = true;
      setCompleted(true);
      setSuccess(
        "Your seller account has been created. Redirecting to login..."
      );

      redirectTimer.current = window.setTimeout(() => {
        router.push(loginUrl);
      }, 800);
    } catch (signupError) {
      console.error("Seller signup error:", signupError);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);

      // Keep the form locked after a successful registration.
      if (!signupSucceeded) {
        setCompleted(false);
      }
    }
  }

  return (
    <div className="rm-storefront min-h-screen">
      {/* Shared site header with a direct route back to the homepage. */}
      <header className="rm-site-header">
        <div className="rm-container flex min-h-[64px] items-center justify-between gap-4 sm:min-h-[72px]">
          <Link href="/" className="rm-brand" aria-label="ReMarket home">
            <span className="rm-brand-mark">
              <Store aria-hidden="true" className="h-[19px] w-[19px]" />
            </span>
            <span>
              Re<span className="text-[var(--rm-coral)]">Market</span>
            </span>
          </Link>

          <Link
            href="/"
            className="rm-button rm-button-secondary min-h-10 gap-2 px-3 sm:px-4"
          >
            <Home aria-hidden="true" className="h-4 w-4" />
            <span>Home</span>
          </Link>
        </div>
      </header>

      <main className="rm-container flex min-h-[calc(100dvh-65px)] items-center justify-center py-8 sm:min-h-[calc(100dvh-73px)] sm:py-12">
        <section className="w-full max-w-[560px]">
          {/* Page introduction */}
          <div className="mb-6 text-center sm:mb-8">
            <span className="mb-3 inline-flex items-center rounded-full border border-[var(--rm-border)] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rm-coral-dark)] sm:text-[11px]">
              Seller portal
            </span>
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.04em] text-[var(--rm-ink)] sm:text-[32px]">
              Start selling on ReMarket
            </h1>
            <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-6 text-[var(--rm-muted)] sm:text-[14px]">
              Create your account to list products and manage your business.
            </p>
          </div>

          {/* Signup panel uses the shared global.css panel and form styles. */}
          <div className="rm-panel overflow-hidden shadow-[var(--rm-shadow-card)]">
            <div className="border-b border-[var(--rm-border)] bg-white px-5 py-5 sm:px-8 sm:py-6">
              <h2 className="text-[20px] font-bold tracking-[-0.025em] text-[var(--rm-ink)] sm:text-[22px]">
                Create your seller account
              </h2>
              <p className="mt-1.5 text-[12px] leading-5 text-[var(--rm-muted)] sm:text-[13px]">
                Enter your details below to get started.
              </p>
            </div>

            <div className="bg-white px-5 py-5 sm:px-8 sm:py-7">
              <form onSubmit={submit} className="space-y-4 sm:space-y-5">
                {/* Full name */}
                <div>
                  <label htmlFor="name" className="rm-field-label">
                    Full name
                  </label>
                  <div className="relative">
                    <UserRound
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[var(--rm-subtle)]"
                    />
                    <input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Your full name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        clearMessages();
                      }}
                      autoComplete="name"
                      maxLength={100}
                      required
                      disabled={loading || completed}
                      className="rm-input h-11 pl-10 pr-3.5"
                    />
                  </div>
                </div>

                {/* Email address */}
                <div>
                  <label htmlFor="email" className="rm-field-label">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[var(--rm-subtle)]"
                    />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@business.com"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        clearMessages();
                      }}
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={254}
                      required
                      disabled={loading || completed}
                      className="rm-input h-11 pl-10 pr-3.5"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="rm-field-label">
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[var(--rm-subtle)]"
                    />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        clearMessages();
                      }}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      disabled={loading || completed}
                      className="rm-input h-11 pl-10 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={loading || completed}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--rm-muted)] transition-colors hover:text-[var(--rm-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" className="h-[17px] w-[17px]" />
                      ) : (
                        <Eye aria-hidden="true" className="h-[17px] w-[17px]" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-[var(--rm-muted)]">
                    Use at least 8 characters.
                  </p>
                </div>

                {/* Confirm password */}
                <div>
                  <label htmlFor="confirmPassword" className="rm-field-label">
                    Confirm password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[var(--rm-subtle)]"
                    />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Enter your password again"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        clearMessages();
                      }}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      disabled={loading || completed}
                      className="rm-input h-11 pl-10 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword((current) => !current)
                      }
                      disabled={loading || completed}
                      aria-label={
                        showConfirmPassword
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                      aria-pressed={showConfirmPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--rm-muted)] transition-colors hover:text-[var(--rm-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {showConfirmPassword ? (
                        <EyeOff aria-hidden="true" className="h-[17px] w-[17px]" />
                      ) : (
                        <Eye aria-hidden="true" className="h-[17px] w-[17px]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex items-start gap-2.5 rounded-[10px] border border-[var(--rm-red)] bg-[var(--rm-red-bg)] px-3.5 py-3 text-[12px] leading-5 text-[var(--rm-red)]"
                  >
                    <CircleAlert
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <p className="break-words">{error}</p>
                  </div>
                )}

                {/* Success message */}
                {success && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-start gap-2.5 rounded-[10px] border border-[var(--rm-green)] bg-[var(--rm-green-bg)] px-3.5 py-3 text-[12px] leading-5 text-[var(--rm-green)]"
                  >
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <p>{success}</p>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || completed}
                  className="rm-button rm-button-primary mt-1 min-h-12 w-full justify-center rounded-[10px] text-[14px] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <LoaderCircle
                        aria-hidden="true"
                        className="h-[17px] w-[17px] animate-spin"
                      />
                      Creating account...
                    </>
                  ) : completed ? (
                    <>
                      <CheckCircle2 aria-hidden="true" className="h-[17px] w-[17px]" />
                      Account created
                    </>
                  ) : (
                    <>
                      Create account
                      <ArrowRight aria-hidden="true" className="h-[17px] w-[17px]" />
                    </>
                  )}
                </button>
              </form>

              {/* Existing seller login */}
              <p className="mt-6 text-center text-[12px] leading-5 text-[var(--rm-muted)] sm:mt-7 sm:text-[13px]">
                Already have a seller account?{" "}
                <button
                  type="button"
                  onClick={() => router.push(loginUrl)}
                  disabled={loading || completed}
                  className="font-bold text-[var(--rm-coral-dark)] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Log in
                </button>
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] text-[var(--rm-muted)]">
            Powered by your local marketplace.
          </p>
        </section>
      </main>
    </div>
  );
}

function SellerSignupFallback() {
  return (
    <div className="rm-storefront min-h-screen">
      <header className="rm-site-header">
        <div className="rm-container flex min-h-[64px] items-center justify-between gap-4 sm:min-h-[72px]">
          <Link href="/" className="rm-brand" aria-label="ReMarket home">
            <span className="rm-brand-mark">
              <Store aria-hidden="true" className="h-[19px] w-[19px]" />
            </span>
            <span>
              Re<span className="text-[var(--rm-coral)]">Market</span>
            </span>
          </Link>
          <Link href="/" className="rm-button rm-button-secondary min-h-10 gap-2 px-3 sm:px-4">
            <Home aria-hidden="true" className="h-4 w-4" />
            <span>Home</span>
          </Link>
        </div>
      </header>
      <main className="rm-container flex min-h-[calc(100dvh-65px)] items-center justify-center py-10">
        <div className="flex items-center gap-3 text-[13px] font-semibold text-[var(--rm-muted)]">
          <LoaderCircle
            aria-hidden="true"
            className="h-5 w-5 animate-spin text-[var(--rm-coral)]"
          />
          Loading seller signup...
        </div>
      </main>
    </div>
  );
}

export default function SellerSignup() {
  return (
    <Suspense fallback={<SellerSignupFallback />}>
      <SellerSignupContent />
    </Suspense>
  );
}
