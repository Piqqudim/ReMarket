"use client";

import { useState, type FormEvent } from "react";
import { getSession, signIn, signOut } from "next-auth/react";
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
} from "lucide-react";

export default function BuyerLogin() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function clearError() {
    if (error) setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

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

    // If authentication succeeds but the session cannot be verified as a
    // BUYER session, clear it rather than leaving another role signed in.
    let cleanupRequired = false;

    try {
      const result = await signIn("credentials", {
        email: trimmedEmail,
        password,
        redirect: false,
        callbackUrl: "/",
      });

      if (!result || result.error || result.ok !== true) {
        setError("Invalid email or password.");
        return;
      }

      cleanupRequired = true;
      const session = await getSession();

      // This client-side check improves the buyer login experience. Server-side
      // authorization must still enforce role restrictions on protected routes.
      if (!session?.user || session.user.role !== "BUYER") {
        await signOut({ redirect: false });
        cleanupRequired = false;
        setError(
          "Unable to sign in with this account on the buyer login page."
        );
        return;
      }

      cleanupRequired = false;
      router.replace("/");
      router.refresh();
    } catch (loginError) {
      console.error("Buyer login error:", loginError);

      // Fail closed if credentials were accepted but session verification failed.
      if (cleanupRequired) {
        try {
          await signOut({ redirect: false });
        } catch (signOutError) {
          console.error(
            "Unable to clear unverified login session:",
            signOutError
          );
        }
      }

      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="rm-storefront flex min-h-dvh flex-col">
      <header className="border-b border-[var(--rm-border)] bg-white shadow-[var(--rm-shadow-header)]">
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

      <section className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:px-6 sm:py-12">
        <div className="w-full max-w-[460px]">
          <div className="rm-panel overflow-hidden shadow-[var(--rm-shadow-card)]">
            <div className="border-b border-[var(--rm-border)] px-5 py-6 sm:px-7 sm:py-7">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--rm-coral-dark)]">
                Buyer account
              </p>
              <h1 className="text-[25px] font-bold leading-tight tracking-[-0.035em] text-[var(--rm-ink)] sm:text-[28px]">
                Welcome back
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--rm-muted)]">
                Sign in to leave ratings and reviews.
              </p>
            </div>

            <div className="px-5 py-6 sm:px-7 sm:py-7">
              <form
                onSubmit={submit}
                aria-busy={loading}
                className="space-y-5"
              >
                <div>
                  <label htmlFor="email" className="rm-field-label">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[var(--rm-muted)]"
                      strokeWidth={1.9}
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
                      className="rm-input pl-10"
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
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[var(--rm-muted)]"
                      strokeWidth={1.9}
                    />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        clearError();
                      }}
                      autoComplete="current-password"
                      required
                      disabled={loading}
                      aria-invalid={Boolean(error)}
                      className="rm-input pl-10 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((current) => !current)
                      }
                      disabled={loading}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-[var(--rm-muted)] hover:bg-[var(--rm-surface-muted)] hover:text-[var(--rm-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {showPassword ? (
                        <EyeOff
                          aria-hidden="true"
                          className="h-[17px] w-[17px]"
                        />
                      ) : (
                        <Eye
                          aria-hidden="true"
                          className="h-[17px] w-[17px]"
                        />
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
                      strokeWidth={2}
                    />
                    <p className="min-w-0 break-words">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="rm-button rm-button-primary min-h-[46px] w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <LoaderCircle
                        aria-hidden="true"
                        className="h-4 w-4 animate-spin"
                      />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Log in
                      <ArrowRight
                        aria-hidden="true"
                        className="h-4 w-4"
                      />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 border-t border-[var(--rm-border)] pt-5 text-center">
                <p className="text-sm text-[var(--rm-muted)]">
                  Don&apos;t have a buyer account?{" "}
                  <Link
                    href="/buyer/signup"
                    className="font-bold text-[var(--rm-coral-dark)] hover:text-[var(--rm-coral)] hover:underline hover:underline-offset-2"
                  >
                    Create one
                  </Link>
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-[var(--rm-muted)]">
            ReMarket · Discover products from businesses around you.
          </p>
        </div>
      </section>
    </main>
  );
}
