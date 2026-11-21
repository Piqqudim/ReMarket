"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Store,
  UserRound,
} from "lucide-react";

function getSignupError(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return fallback;
}

export default function BuyerSignup() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  function clearError() {
    if (error) setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    setError("");

    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    if (!trimmedEmail) {
      setError("Email address is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    // Do not trim passwords: spaces may be part of a valid password.
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // Referral codes are optional: /buyer/signup?ref=AB12CD34
      const referralCode =
        new URLSearchParams(window.location.search).get("ref")?.trim() ?? "";

      const response = await fetch("/api/buyer/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
          ...(referralCode ? { referralCode } : {}),
        }),
      });

      // Safely handle non-JSON API responses.
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          getSignupError(
            data,
            "Unable to create your account. Please try again."
          )
        );
        return;
      }

      // Keep the existing sign-in flow after account creation.
      router.push("/buyer/login");
    } catch (signupError) {
      console.error("Buyer signup error:", signupError);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="rm-storefront flex min-h-dvh flex-col">
      <header className="border-b border-[var(--rm-border)] bg-white">
        <div className="rm-container flex min-h-[64px] items-center justify-between gap-4">
          <Link href="/" className="rm-brand" aria-label="ReMarket home">
            <span className="rm-brand-mark" aria-hidden="true">
              <Store className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span>
              Re<span className="text-[var(--rm-coral)]">Market</span>
            </span>
          </Link>

          <Link href="/" className="rm-text-link">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to home</span>
          </Link>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-[500px]">
          <div
            className="rm-panel overflow-hidden"
            style={{ boxShadow: "var(--rm-shadow-card)" }}
          >
            <div className="border-b border-[var(--rm-border)] px-5 py-6 sm:px-8 sm:py-7">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--rm-coral-dark)]">
                Buyer account
              </p>
              <h1 className="text-[25px] font-bold leading-tight tracking-[-0.035em] text-[var(--rm-ink)] sm:text-[29px]">
                Create your account
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--rm-muted)]">
                Create a free buyer account to leave ratings and reviews.
              </p>
            </div>

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              <form onSubmit={submit} aria-busy={loading} className="space-y-5">
                <div>
                  <label htmlFor="name" className="rm-field-label">
                    Your name
                  </label>
                  <div className="relative">
                    <UserRound
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--rm-muted)]"
                    />
                    <input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Enter your name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        clearError();
                      }}
                      autoComplete="name"
                      maxLength={120}
                      required
                      disabled={loading}
                      aria-invalid={Boolean(error)}
                      className="rm-input h-12 pl-11 pr-3 disabled:cursor-not-allowed disabled:bg-[var(--rm-surface-muted)]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="rm-field-label">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--rm-muted)]"
                    />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        clearError();
                      }}
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={254}
                      required
                      disabled={loading}
                      aria-invalid={Boolean(error)}
                      className="rm-input h-12 pl-11 pr-3 disabled:cursor-not-allowed disabled:bg-[var(--rm-surface-muted)]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="rm-field-label">
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--rm-muted)]"
                    />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        clearError();
                      }}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      disabled={loading}
                      aria-invalid={Boolean(error)}
                      className="rm-input h-12 pl-11 pr-12 disabled:cursor-not-allowed disabled:bg-[var(--rm-surface-muted)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={loading}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--rm-muted)] hover:bg-[var(--rm-surface-muted)] hover:text-[var(--rm-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rm-coral)] disabled:opacity-50"
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" className="h-[18px] w-[18px]" />
                      ) : (
                        <Eye aria-hidden="true" className="h-[18px] w-[18px]" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--rm-muted)]">
                    Use at least 8 characters.
                  </p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="rm-field-label">
                    Confirm password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--rm-muted)]"
                    />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Enter your password again"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value);
                        clearError();
                      }}
                      autoComplete="new-password"
                      required
                      disabled={loading}
                      aria-invalid={Boolean(error)}
                      className="rm-input h-12 pl-11 pr-12 disabled:cursor-not-allowed disabled:bg-[var(--rm-surface-muted)]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword((current) => !current)
                      }
                      disabled={loading}
                      aria-label={
                        showConfirmPassword
                          ? "Hide confirmation password"
                          : "Show confirmation password"
                      }
                      aria-pressed={showConfirmPassword}
                      className="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--rm-muted)] hover:bg-[var(--rm-surface-muted)] hover:text-[var(--rm-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rm-coral)] disabled:opacity-50"
                    >
                      {showConfirmPassword ? (
                        <EyeOff aria-hidden="true" className="h-[18px] w-[18px]" />
                      ) : (
                        <Eye aria-hidden="true" className="h-[18px] w-[18px]" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex items-start gap-2.5 rounded-[var(--rm-radius-md)] border border-[#fecaca] bg-[var(--rm-red-bg)] px-3.5 py-3 text-sm text-[var(--rm-red)]"
                  >
                    <CircleAlert
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <p className="min-w-0 flex-1 break-words">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="rm-button rm-button-primary min-h-12 w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <LoaderCircle
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                      Creating account…
                    </>
                  ) : (
                    <>
                      Create account
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-[var(--rm-muted)]">
                Already have a buyer account?{" "}
                <Link
                  href="/buyer/login"
                  className="font-bold text-[var(--rm-coral-dark)] underline-offset-4 hover:text-[var(--rm-coral)] hover:underline"
                >
                  Log in
                </Link>
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-[var(--rm-muted)]">
            Powered by your local marketplace
          </p>
        </div>
      </section>
    </main>
  );
}
