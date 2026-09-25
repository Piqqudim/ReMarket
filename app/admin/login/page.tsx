"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
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

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();

  const submit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
        callbackUrl: "/admin",
      });

      if (!result || result.error) {
        setError("Invalid email or password");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FFF0DC] px-4 py-10 sm:px-6">
      {/* Top-left decorative shape */}
      <div className="absolute left-[-80px] top-16 h-64 w-64 rounded-full bg-[#FF9A6B] opacity-80 sm:left-10 sm:top-24 sm:h-72 sm:w-72" />

      {/* Top-right dots */}
      <div className="absolute right-6 top-16 grid grid-cols-4 gap-2.5 opacity-50 sm:right-16 sm:top-24 sm:gap-3">
        {Array.from({ length: 16 }).map((_, index) => (
          <span
            key={index}
            className="h-2 w-2 rounded-full bg-[#F89B68]"
          />
        ))}
      </div>

      {/* Bottom-left dots */}
      <div className="absolute bottom-16 left-6 grid grid-cols-4 gap-2.5 opacity-50 sm:bottom-24 sm:left-16 sm:gap-3">
        {Array.from({ length: 16 }).map((_, index) => (
          <span
            key={index}
            className="h-2 w-2 rounded-full bg-[#F89B68]"
          />
        ))}
      </div>

      {/* Bottom-right decorative shape */}
      <div className="absolute bottom-[-80px] right-[-70px] h-64 w-80 rotate-[-20deg] rounded-[50%] bg-[#FF9A6B] opacity-80 sm:bottom-[-50px] sm:right-[-40px] sm:h-72 sm:w-[23rem]" />

      {/* Main content */}
      <section className="relative z-[15] flex w-full max-w-[655px] flex-col items-center">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center text-center sm:mb-10">
          {/* Store icon */}
          <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-[26px] bg-[#FF563F] shadow-[0_12px_30px_rgba(255,86,63,0.25)] sm:h-28 sm:w-28">
            <Store className="h-14 w-14 text-white sm:h-16 sm:w-16" strokeWidth={1.8} />
          </div>

          {/* Brand name */}
          <h1 className="text-[42px] font-semibold leading-none tracking-[-2px] text-[#111C27] sm:text-[52px]">
            Re<span className="text-[#FF563F]">Market</span>
          </h1>

          <p className="mt-3 text-[18px] font-normal text-[#718096] sm:mt-4 sm:text-[22px]">
            Marketplace Administration
          </p>
        </div>

        {/* Login card */}
        <div className="w-full rounded-[28px] bg-white px-6 py-8 shadow-[0_20px_60px_rgba(80,50,20,0.10)] sm:px-14 sm:py-12">
          {/* Header */}
          <div className="mb-8 sm:mb-9">
            <h2 className="text-[28px] font-semibold leading-tight text-[#111C27] sm:text-[32px]">
              Welcome back
            </h2>

            <p className="mt-3 text-[17px] text-[#718096] sm:text-[19px]">
              Sign in to manage your marketplace
            </p>
          </div>

          {/* Form */}
          <form onSubmit={submit} className="space-y-6 sm:space-y-7">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-3 block text-[16px] font-semibold text-[#111C27] sm:text-[17px]"
              >
                Email address
              </label>

              <div className="relative">
                <Mail
                  className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FF694F]"
                  strokeWidth={2}
                />

                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  disabled={loading}
                  className="h-[64px] w-full rounded-[14px] border border-[#D9DEE5] bg-white pl-14 pr-5 text-[17px] text-[#111C27] outline-none transition-all placeholder:text-[#8491A3] focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-[#F8F8F7]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-3 block text-[16px] font-semibold text-[#111C27] sm:text-[17px]"
              >
                Password
              </label>

              <div className="relative">
                <LockKeyhole
                  className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FF694F]"
                  strokeWidth={2}
                />

                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError("");
                  }}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                  className="h-[64px] w-full rounded-[14px] border border-[#D9DEE5] bg-white pl-14 pr-14 text-[17px] text-[#111C27] outline-none transition-all placeholder:text-[#8491A3] focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-[#F8F8F7]"
                />

                {/* Password visibility */}
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={loading}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-[#718096] transition-colors hover:text-[#111C27] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" strokeWidth={2} />
                  ) : (
                    <Eye className="h-5 w-5" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="flex items-center gap-4 rounded-[14px] border border-[#FFB8B0] bg-[#FFF0EE] px-5 py-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EF3F3F] text-white">
                  <CircleAlert className="h-4 w-4" strokeWidth={2.3} />
                </div>

                <p className="text-[15px] text-[#E33B22] sm:text-[16px]">
                  {error}
                </p>
              </div>
            )}

            {/* Login button */}
            <button
              type="submit"
              disabled={loading}
              className="flex h-[66px] w-full items-center justify-center gap-3 rounded-[14px] bg-[#FF563F] text-[18px] font-semibold text-white shadow-[0_10px_25px_rgba(255,86,63,0.22)] transition-all hover:bg-[#F44D37] hover:shadow-[0_14px_30px_rgba(255,86,63,0.28)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:text-[19px]"
            >
              {loading ? (
                <>
                  <LoaderCircle className="h-6 w-6 animate-spin" strokeWidth={2} />
                  Signing in...
                </>
              ) : (
                <>
                  Log in
                  <ArrowRight className="h-6 w-6" strokeWidth={2} />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 flex items-center gap-4 sm:mt-10 sm:gap-5">
            <div className="h-px flex-1 bg-[#D9DEE5]" />

            <p className="whitespace-nowrap text-[12px] text-[#718096] sm:text-[15px]">
              Powered by your local marketplace
            </p>

            <div className="h-px flex-1 bg-[#D9DEE5]" />
          </div>
        </div>
      </section>
    </main>
  );
}