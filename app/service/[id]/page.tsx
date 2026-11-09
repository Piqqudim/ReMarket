import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  ShoppingBag,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

export default function ServiceDetailsComingSoonPage() {
  return (
    <div className="min-h-dvh bg-[#FFF7ED]">
      <SiteHeader searchMode="SERVICES" />

      <main
        id="main-content"
        className="flex min-h-[70vh] items-center px-4 py-12"
      >
        <section
          className="mx-auto w-full max-w-2xl rounded-[28px]"
          aria-labelledby="coming-soon-title"
        >
          <div className="overflow-hidden rounded-[28px] border">
            <div className="h-2 bg-[#FF5A36]" />

            <div className="bg-white px-6 py-12 text-center sm:px-10">
              <div className="mx-auto flex h-20 w-20 items-center
                justify-center rounded-3xl bg-[#FFF0E9] text-[#9F2D18]">
                <CalendarClock className="h-10 w-10" />
              </div>

              <p className="mt-6 text-[10px] font-extrabold
                uppercase tracking-[0.18em] text-[#FF5A36]">
                ReMarket services
              </p>

              <span className="mt-3 inline-flex rounded-full
                bg-[#FFF0E9] px-3 py-1.5 text-[10px]
                font-extrabold uppercase tracking-wide text-[#9F2D18]">
                Coming soon
              </span>

              <h1
                id="coming-soon-title"
                className="mt-5 text-2xl font-black tracking-tight
                  text-[#401B13] sm:text-3xl"
              >
                Service bookings are on the way.
              </h1>

              <p className="mx-auto mt-4 max-w-lg text-sm
                leading-7 text-[#756B61]">
                We are preparing a better way to discover local
                services, review providers and send booking
                requests through ReMarket. Service pages and
                bookings will return in a future update.
              </p>

              <div className="mx-auto mt-7 max-w-md rounded-2xl
                border border-[#EAE6DF] bg-[#FCFAF6] p-4 text-left">
                <div className="flex items-start gap-3">
                  <BriefcaseBusiness className="mt-0.5 h-5 w-5
                    shrink-0 text-[#FF5A36]" />
                  <div>
                    <p className="text-xs font-extrabold
                      text-[#401B13]">
                      What is coming?
                    </p>
                    <p className="mt-1 text-xs leading-6
                      text-[#756B61]">
                      Service discovery, provider details and
                      booking requests in one place.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col justify-center
                gap-3 sm:flex-row">
                <Link
                  href="/shop"
                  className="inline-flex min-h-12 items-center
                    justify-center gap-2 rounded-xl bg-[#FF5A36]
                    px-6 py-3 text-xs font-extrabold text-white
                    transition hover:bg-[#E94E2A]"
                >
                  <ShoppingBag className="h-4 w-4" />
                  Explore products
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href="/"
                  className="inline-flex min-h-12 items-center
                    justify-center gap-2 rounded-xl border
                    border-[#EAE6DF] bg-white px-6 py-3
                    text-xs font-bold text-[#756B61]
                    transition hover:border-[#FFB39F]
                    hover:text-[#9F2D18]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to home
                </Link>
              </div>

              <p className="mt-7 text-[10px] text-[#A29B94]">
                ReMarket · Find it nearby
              </p>
            </div>
          </div>
        </section>
      </main>

      <MobileBottomNav />
    </div>
  );
}
