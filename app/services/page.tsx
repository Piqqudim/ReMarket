import Link from "next/link";

import {
  ArrowRight,
  Clock3,
  Home,
  ShoppingBag,
  Sparkles,
  Wrench,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import ServicesDiscoveryPage from
  "@/components/services/ServicesDiscoveryPage";

/* Keep the existing discovery page for a later launch. */
const SERVICES_FEATURE_ENABLED = false;

export default function ServicesPage() {
  if (SERVICES_FEATURE_ENABLED) {
    return <ServicesDiscoveryPage />;
  }

  return (
    <div className="min-h-dvh bg-[#FFF7ED]">
      <SiteHeader searchMode="SERVICES" />

      <main
        className="px-4 pb-28 pt-8 sm:px-6 lg:px-8 lg:pb-14"
      >
        <section className="mx-auto w-full max-w-5xl">
          <div
            className="overflow-hidden rounded-[28px] border
              border-[#F1DDD3] bg-white shadow-sm"
          >
            <div className="h-2 bg-[#FF5A36]" />

            <div
              className="grid items-center gap-8 px-5 py-12
                sm:px-10 sm:py-16
                lg:grid-cols-[1fr_260px] lg:px-14"
            >
              <div>
                <span
                  className="inline-flex items-center gap-2
                    rounded-full bg-[#FFF0E9] px-3 py-2
                    text-xs font-bold text-[#9F2D18]"
                >
                  <Sparkles className="h-4 w-4" />
                  ReMarket services
                </span>

                <h1
                  className="mt-5 max-w-2xl text-3xl font-black
                    tracking-tight text-[#401B13]
                    sm:text-4xl lg:text-5xl"
                >
                  Services are coming soon.
                </h1>

                <p
                  className="mt-4 max-w-xl text-sm leading-7
                    text-[#756B61] sm:text-base"
                >
                  We are preparing a better way to discover
                  local professionals and service providers
                  around you. Service discovery will be
                  available in a future ReMarket update.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/shop"
                    className="inline-flex min-h-12 items-center
                      justify-center gap-2 rounded-xl
                      bg-[#FF5A36] px-6 py-3 text-sm
                      font-bold text-white transition
                      hover:bg-[#E94E2A]"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Explore products
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  <Link
                    href="/"
                    className="inline-flex min-h-12 items-center
                      justify-center gap-2 rounded-xl
                      border border-[#EAE6DF] bg-white
                      px-6 py-3 text-sm font-bold
                      text-[#756B61] transition
                      hover:border-[#FFB39F]
                      hover:bg-[#FCFAF6]
                      hover:text-[#9F2D18]"
                  >
                    <Home className="h-4 w-4" />
                    Back to home
                  </Link>
                </div>
              </div>

              <div
                className="mx-auto flex h-48 w-48 items-center
                  justify-center rounded-[36px] bg-[#FFF0E9]
                  text-[#9F2D18] sm:h-56 sm:w-56"
              >
                <div
                  className="relative flex h-28 w-28 items-center
                    justify-center rounded-[28px] bg-white
                    shadow-sm"
                >
                  <Wrench
                    className="h-14 w-14"
                    strokeWidth={1.5}
                  />

                  <span
                    className="absolute -right-3 -top-3 flex
                      h-11 w-11 items-center justify-center
                      rounded-2xl bg-[#FF5A36] text-white
                      shadow-sm"
                  >
                    <Clock3 className="h-5 w-5" />
                  </span>
                </div>
              </div>
            </div>

            <div
              className="border-t border-[#F0ECE6]
                bg-[#FCFAF6] px-5 py-4 text-center sm:px-8"
            >
              <p className="text-xs leading-6 text-[#756B61]">
                We are working on it. Thank you for
                exploring ReMarket.
              </p>
            </div>
          </div>
        </section>
      </main>

      <MobileBottomNav />
    </div>
  );
}
