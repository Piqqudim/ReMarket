"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
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

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const cleanEmail = email.trim().toLowerCase();
    setError("");

    if (!cleanEmail) {
      setError("Email address is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: cleanEmail,
        password,
        redirect: false,
        callbackUrl: "/admin",
      });

      if (!result || result.error || result.ok !== true) {
        setError("Invalid email or password.");
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch (loginError) {
      console.error("Admin login error:", loginError);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[#FCFAF6] px-4 py-6 text-[#17202A] sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-6xl flex-col">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#625B54] hover:bg-[#F2ECE5] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to home</span>
          </Link>

          <span className="hidden text-xs font-medium text-[#958A80] sm:inline">
            Administrator access
          </span>
        </header>

        <section className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <div className="w-full max-w-[440px]">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF5A36] text-white">
                <Store className="h-7 w-7" strokeWidth={1.9} aria-hidden="true" />
              </div>
              <p className="text-2xl font-extrabold tracking-tight text-[#17202A]">
                Re<span className="text-[#FF5A36]">Market</span>
              </p>
              <p className="mt-1.5 text-sm text-[#81766D]">Marketplace administration</p>
            </div>

            <div className="rounded-2xl border border-[#EAE6DF] bg-white p-6 shadow-[0_8px_30px_rgba(40,31,22,0.06)] sm:p-8">
              <div className="mb-7">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#B14A31]">
                  Admin portal
                </p>
                <h1 className="mt-2 text-[26px] font-bold tracking-tight text-[#17202A] sm:text-[28px]">
                  Sign in
                </h1>
                <p className="mt-2 text-sm leading-6 text-[#81766D]">
                  Enter your administrator details to continue to the ReMarket dashboard.
                </p>
              </div>

              <form onSubmit={submit} aria-busy={loading} className="space-y-5">
                <div>
                  <label
                    htmlFor="admin-email"
                    className="mb-2 block text-sm font-semibold text-[#39332E]"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <Mail
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#A1968C]"
                    />
                    <input
                      id="admin-email"
                      name="email"
                      type="email"
                      placeholder="you@business.com"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (error) setError("");
                      }}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={254}
                      required
                      disabled={loading}
                      className="h-12 w-full rounded-xl border border-[#DED8D0] bg-white pl-11 pr-3.5 text-sm text-[#17202A] outline-none placeholder:text-[#AAA198] focus:border-[#FF7A5E] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F8F6F3]"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-password"
                    className="mb-2 block text-sm font-semibold text-[#39332E]"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#A1968C]"
                    />
                    <input
                      id="admin-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (error) setError("");
                      }}
                      autoComplete="current-password"
                      required
                      disabled={loading}
                      className="h-12 w-full rounded-xl border border-[#DED8D0] bg-white pl-11 pr-12 text-sm text-[#17202A] outline-none placeholder:text-[#AAA198] focus:border-[#FF7A5E] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F8F6F3]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      disabled={loading}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#81766D] hover:bg-[#F5F1EC] hover:text-[#39332E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {showPassword ? (
                        <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" />
                      ) : (
                        <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex items-start gap-2.5 rounded-xl border border-[#F0C5BE] bg-[#FFF3F0] px-3.5 py-3 text-sm text-[#9F2D18]"
                  >
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p className="min-w-0 flex-1 leading-5">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-bold text-white hover:bg-[#E94F2E] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="h-[18px] w-[18px]" aria-hidden="true" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in to admin</span>
                      <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 border-t border-[#F0ECE6] pt-5">
                <p className="text-center text-xs leading-5 text-[#92877D]">
                  This area is for authorised ReMarket administrators only.
                </p>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-[#A1968C]">
              ReMarket · Find it nearby
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
