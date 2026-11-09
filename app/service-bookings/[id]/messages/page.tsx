import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  MessageSquare,
  ShoppingBag,
} from "lucide-react";

export default function ServiceBookingMessagesPage() {
  return (
    <main className="min-h-dvh bg-[#FFF7ED] text-[#292421]">
      <header className="border-b border-[#EAE6DF] bg-white">
        <div className="mx-auto flex max-w-6xl items-center
          justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-lg font-black tracking-tight
              text-[#9F2D18]"
          >
            ReMarket
          </Link>

          <nav className="flex items-center gap-4 text-sm
            font-semibold text-[#6F675F]">
            <Link href="/" className="hover:text-[#FF5A36]">
              Home
            </Link>
            <Link href="/shop" className="hover:text-[#FF5A36]">
              Shop
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto flex min-h-[75dvh] max-w-2xl
        flex-col items-center justify-center px-5 py-14 text-center">
        <div className="flex h-16 w-16 items-center justify-center
          rounded-2xl bg-[#FFE7DE] text-[#9F2D18]">
          <MessageSquare className="h-8 w-8" />
        </div>

        <p className="mt-6 text-xs font-bold uppercase
          tracking-[0.18em] text-[#FF5A36]">
          ReMarket Services
        </p>

        <h1 className="mt-3 text-3xl font-black
          tracking-tight sm:text-4xl">
          Booking messages are coming soon
        </h1>

        <p className="mt-4 max-w-lg text-sm leading-7
          text-[#81766D] sm:text-base">
          We are preparing the service-booking experience,
          including conversations between buyers and sellers.
          This feature is not available yet.
        </p>

        <div className="mt-8 flex items-center gap-2 rounded-xl
          border border-[#EAE6DF] bg-white px-4 py-3
          text-xs font-semibold text-[#6F675F]">
          <Clock3 className="h-4 w-4 text-[#FF5A36]" />
          Service bookings and messaging are not active yet.
        </div>

        <div className="mt-8 flex w-full max-w-sm flex-col
          gap-3 sm:flex-row">
          <Link
            href="/shop"
            className="inline-flex min-h-12 flex-1 items-center
              justify-center gap-2 rounded-xl bg-[#FF5A36]
              px-5 text-sm font-bold text-white
              transition hover:bg-[#E94C2A]"
          >
            <ShoppingBag className="h-4 w-4" />
            Explore products
          </Link>

          <Link
            href="/"
            className="inline-flex min-h-12 flex-1 items-center
              justify-center gap-2 rounded-xl border
              border-[#EAE6DF] bg-white px-5 text-sm
              font-bold text-[#514940] transition
              hover:border-[#FF5A36]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
