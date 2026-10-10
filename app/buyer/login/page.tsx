"use client";

import {
  useState,
  type FormEvent,
} from "react";

import {
  getSession,
  signIn,
  signOut,
} from "next-auth/react";

import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  Store,
  Mail,
  LockKeyhole,
  Eye,
  EyeOff,
  ArrowRight,
  LoaderCircle,
  CircleAlert,
} from "lucide-react";

export default function BuyerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] =
    useState(false);

  const router = useRouter();

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

    /*
     * If credentials are accepted but the session
     * cannot be confirmed as a BUYER session, sign
     * out rather than leaving another role logged in
     * through this buyer-specific login page.
     */
    let cleanupRequired = false;

    try {
      const result = await signIn("credentials", {
        email: trimmedEmail,
        password,
        redirect: false,
        callbackUrl: "/",
      });

      if (
        !result ||
        result.error ||
        result.ok !== true
      ) {
        setError("Invalid email or password.");
        return;
      }

      cleanupRequired = true;

      const session = await getSession();

      /*
       * This page is specifically for buyers.
       * ADMIN and SELLER accounts must use their
       * appropriate login flows.
       *
       * The server must still enforce role-based
       * access independently of this client check.
       */
      if (
        !session?.user ||
        session.user.role !== "BUYER"
      ) {
        await signOut({
          redirect: false,
        });

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
      console.error(
        "Buyer login error:",
        loginError
      );

      /*
       * Fail closed if authentication succeeded
       * but session verification failed.
       */
      if (cleanupRequired) {
        try {
          await signOut({
            redirect: false,
          });
        } catch (signOutError) {
          console.error(
            "Unable to clear unverified login session:",
            signOutError
          );
        }
      }

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function clearError() {
    if (error) {
      setError("");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FFF0DC] px-4 py-8 sm:px-6 sm:py-10">

      {/* TOP-LEFT DECORATIVE SHAPE */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-100px] top-16 h-56 w-56 rounded-full bg-[#FF9A6B] opacity-80 sm:left-10 sm:top-24 sm:h-72 sm:w-72"
      />

      {/* TOP-RIGHT DECORATIVE DOTS */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-12 grid grid-cols-4 gap-2 opacity-50 sm:right-16 sm:top-24 sm:gap-3"
      >
        {Array.from({ length: 16 }).map(
          (_, index) => (
            <span
              key={index}
              className="h-2 w-2 rounded-full bg-[#F89B68]"
            />
          )
        )}
      </div>

      {/* BOTTOM-LEFT DECORATIVE DOTS */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-12 left-5 grid grid-cols-4 gap-2 opacity-50 sm:bottom-24 sm:left-16 sm:gap-3"
      >
        {Array.from({ length: 16 }).map(
          (_, index) => (
            <span
              key={index}
              className="h-2 w-2 rounded-full bg-[#F89B68]"
            />
          )
        )}
      </div>

      {/* BOTTOM-RIGHT DECORATIVE SHAPE */}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-100px] right-[-100px] h-56 w-64 rotate-[-20deg] rounded-[50%] bg-[#FF9A6B] opacity-80 sm:bottom-[-50px] sm:right-[-40px] sm:h-72 sm:w-[23rem]"
      />

      {/* MAIN CONTENT */}

      <section className="relative z-[15] flex w-full max-w-[655px] flex-col items-center">

        {/* BRAND */}

        <div className="mb-7 flex flex-col items-center text-center sm:mb-10">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#FF563F] shadow-[0_12px_30px_rgba(255,86,63,0.25)] sm:h-28 sm:w-28 sm:rounded-[26px]">
            <Store
              className="h-11 w-11 text-white sm:h-16 sm:w-16"
              strokeWidth={1.8}
            />
          </div>

          <h1 className="text-[38px] font-semibold leading-none tracking-[-2px] text-[#111C27] sm:text-[52px]">
            Re
            <span className="text-[#FF563F]">
              Market
            </span>
          </h1>

          <p className="mt-3 text-base font-normal text-[#718096] sm:mt-4 sm:text-[22px]">
            Buyer Account
          </p>
        </div>

        {/* LOGIN CARD */}

        <div className="w-full min-w-0 rounded-[24px] bg-white px-5 py-7 shadow-[0_20px_60px_rgba(80,50,20,0.10)] sm:rounded-[28px] sm:px-14 sm:py-12">

          {/* CARD HEADING */}

          <div className="mb-7 sm:mb-9">
            <h2 className="text-[26px] font-semibold leading-tight text-[#111C27] sm:text-[32px]">
              Welcome back
            </h2>

            <p className="mt-3 text-base text-[#718096] sm:text-[19px]">
              Sign in to leave ratings and reviews
            </p>
          </div>

          {/* LOGIN FORM */}

          <form
            onSubmit={submit}
            aria-busy={loading}
            className="space-y-6 sm:space-y-7"
          >

            {/* EMAIL */}

            <div>
              <label
                htmlFor="email"
                className="mb-3 block text-[16px] font-semibold text-[#111C27] sm:text-[17px]"
              >
                Email address
              </label>

              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FF694F] sm:left-5"
                  strokeWidth={2}
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
                  required
                  disabled={loading}
                  aria-invalid={Boolean(error)}
                  className="h-[58px] w-full rounded-[14px] border border-[#D9DEE5] bg-white pl-12 pr-4 text-base text-[#111C27] outline-none transition-all placeholder:text-[#8491A3] focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-[#F8F8F7] sm:h-[64px] sm:pl-14 sm:pr-5 sm:text-[17px]"
                />
              </div>
            </div>

            {/* PASSWORD */}

            <div>
              <label
                htmlFor="password"
                className="mb-3 block text-[16px] font-semibold text-[#111C27] sm:text-[17px]"
              >
                Password
              </label>

              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FF694F] sm:left-5"
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
                    clearError();
                  }}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  aria-invalid={Boolean(error)}
                  className="h-[58px] w-full rounded-[14px] border border-[#D9DEE5] bg-white pl-12 pr-12 text-base text-[#111C27] outline-none transition-all placeholder:text-[#8491A3] focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-[#F8F8F7] sm:h-[64px] sm:pl-14 sm:pr-14 sm:text-[17px]"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  disabled={loading}
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  aria-pressed={showPassword}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#718096] transition-colors hover:text-[#111C27] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF694F] disabled:cursor-not-allowed disabled:opacity-50 sm:right-5"
                >
                  {showPassword ? (
                    <EyeOff
                      className="h-5 w-5"
                      strokeWidth={2}
                    />
                  ) : (
                    <Eye
                      className="h-5 w-5"
                      strokeWidth={2}
                    />
                  )}
                </button>
              </div>
            </div>

            {/* LOGIN ERROR */}

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-start gap-3 rounded-[14px] border border-[#FFB8B0] bg-[#FFF0EE] px-4 py-4 sm:gap-4 sm:px-5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EF3F3F] text-white">
                  <CircleAlert
                    className="h-4 w-4"
                    strokeWidth={2.3}
                  />
                </div>

                <p className="min-w-0 flex-1 break-words pt-1 text-sm text-[#E33B22] sm:text-base">
                  {error}
                </p>
              </div>
            )}

            {/* LOGIN BUTTON */}

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-[60px] w-full items-center justify-center gap-3 rounded-[14px] bg-[#FF563F] px-4 py-3 text-base font-semibold text-white shadow-[0_10px_25px_rgba(255,86,63,0.22)] transition-all hover:bg-[#F44D37] hover:shadow-[0_14px_30px_rgba(255,86,63,0.28)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF694F]/30 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[66px] sm:text-[19px]"
            >
              {loading ? (
                <>
                  <LoaderCircle
                    className="h-6 w-6 animate-spin"
                    strokeWidth={2}
                  />

                  Signing in...
                </>
              ) : (
                <>
                  Log in

                  <ArrowRight
                    className="h-6 w-6"
                    strokeWidth={2}
                  />
                </>
              )}
            </button>
          </form>

          {/* BUYER SIGNUP */}

          <div className="mt-7 text-center sm:mt-8">
            <p className="text-sm text-[#718096] sm:text-[15px]">
              Don&apos;t have a buyer account?{" "}

              <Link
                href="/buyer/signup"
                className="font-semibold text-[#FF563F] transition-colors hover:text-[#F44D37] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF694F]"
              >
                Create one
              </Link>
            </p>
          </div>

          {/* FOOTER */}

          <div className="mt-8 flex items-center gap-3 sm:mt-10 sm:gap-5">
            <div className="h-px min-w-0 flex-1 bg-[#D9DEE5]" />

            <p className="text-center text-[11px] text-[#718096] sm:whitespace-nowrap sm:text-[15px]">
              Powered by your local marketplace
            </p>

            <div className="h-px min-w-0 flex-1 bg-[#D9DEE5]" />
          </div>
        </div>
      </section>
    </main>
  );
}