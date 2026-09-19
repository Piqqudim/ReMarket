"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Search,
  MapPin,
  ChevronRight,
  Trash2,
  Store,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Requests", href: "/my-requests", icon: ClipboardList },
  { label: "Saved", href: "/saved", icon: Heart },
];

type SavedBusiness = {
  id: string;
  name: string;
  area: string;
  category: string;
  verified?: boolean;
  availability?: string;
};

const STORAGE_KEY = "remarket-saved-businesses";

export default function SavedPage() {
  const [savedBusinesses, setSavedBusinesses] = useState<SavedBusiness[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored) {
        setSavedBusinesses(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Unable to load saved businesses:", error);
    } finally {
      setLoaded(true);
    }
  }, []);

  function removeSaved(id: string) {
    const updated = savedBusinesses.filter(
      (business) => business.id !== id
    );

    setSavedBusinesses(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED] px-3 py-3 sm:px-4 lg:px-6">
      <div className="mx-auto min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-[0_8px_30px_rgba(159,45,24,0.08)]">
        {/* Header */}
        <header className="flex h-[66px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
              <Store size={19} strokeWidth={2.5} />
            </div>

            <div>
              <div className="text-[18px] font-extrabold tracking-tight text-[#17202A]">
                ReMarket
              </div>
              <div className="-mt-1 text-[10px] font-medium text-[#8A8178]">
                Find it nearby
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-6 md:flex">
            <Link
              href="/"
              className="text-sm font-medium text-[#6F675F] transition hover:text-[#FF5A36]"
            >
              Home
            </Link>

            <Link
              href="/shop"
              className="text-sm font-medium text-[#6F675F] transition hover:text-[#FF5A36]"
            >
              Shop
            </Link>

            <Link
              href="/my-requests"
              className="text-sm font-medium text-[#6F675F] transition hover:text-[#FF5A36]"
            >
              Requests
            </Link>

            <Link
              href="/saved"
              className="text-sm font-bold text-[#FF5A36]"
            >
              Saved
            </Link>
          </div>

          <Link
            href="/request"
            className="hidden rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94C2A] sm:block"
          >
            Request something
          </Link>

          <Link
            href="/search"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0D9] text-[#9F2D18] sm:hidden"
          >
            <Search size={19} />
          </Link>
        </header>

        <div className="flex min-h-[calc(100vh-90px)]">
          {/* Sidebar */}
          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 md:block">
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/saved";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? "bg-[#FFE0D6] text-[#9F2D18]"
                        : "text-[#6F675F] hover:bg-white hover:text-[#9F2D18]"
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-8 rounded-2xl bg-[#FFF0D9] p-4">
              <div className="text-sm font-bold text-[#9F2D18]">
                Looking for something?
              </div>

              <p className="mt-1 text-xs leading-5 text-[#756B61]">
                Can't find it nearby? Send a request and let sellers find you.
              </p>

              <Link
                href="/my-requests"
                className="mt-3 inline-flex text-xs font-bold text-[#FF5A36]"
              >
                Make a request
                <ChevronRight size={14} />
              </Link>
            </div>
          </aside>

          {/* Main */}
          <main className="min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 lg:px-7">
            <section>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#FF5A36]">
                    Your collection
                  </p>

                  <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#17202A] sm:text-3xl">
                    Saved
                  </h1>

                  <p className="mt-1 text-sm text-[#756B61]">
                    Businesses you want to come back to.
                  </p>
                </div>

                {savedBusinesses.length > 0 && (
                  <div className="rounded-full bg-[#FFF0D9] px-3 py-1.5 text-xs font-bold text-[#9F2D18]">
                    {savedBusinesses.length} saved
                  </div>
                )}
              </div>

              {!loaded ? (
                <div className="mt-8 rounded-2xl border border-[#EAE6DF] bg-white p-8 text-center">
                  <p className="text-sm font-medium text-[#756B61]">
                    Loading saved businesses...
                  </p>
                </div>
              ) : savedBusinesses.length === 0 ? (
                <div className="mt-7 flex min-h-[360px] flex-col items-center justify-center rounded-[20px] border border-dashed border-[#E4DED6] bg-[#FCFAF6] px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#FF5A36]">
                    <Heart size={28} />
                  </div>

                  <h2 className="mt-5 text-lg font-extrabold text-[#17202A]">
                    Nothing saved yet
                  </h2>

                  <p className="mt-2 max-w-sm text-sm leading-6 text-[#756B61]">
                    When you find a business you like, save it here so you can
                    easily find it again.
                  </p>

                  <Link
                    href="/shop"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#E94C2A]"
                  >
                    Explore nearby
                    <ChevronRight size={16} />
                  </Link>
                </div>
              ) : (
                <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {savedBusinesses.map((business) => (
                    <article
                      key={business.id}
                      className="group overflow-hidden rounded-[18px] border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(23,32,42,0.07)]"
                    >
                      <div className="flex items-start justify-between p-4">
                        <Link
                          href={`/seller/${business.id}`}
                          className="flex min-w-0 flex-1 gap-3"
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-sm font-extrabold text-[#9F2D18]">
                            {business.name
                              .split(" ")
                              .slice(0, 2)
                              .map((word) => word[0])
                              .join("")
                              .toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <h2 className="truncate text-sm font-extrabold text-[#17202A]">
                              {business.name}
                            </h2>

                            <p className="mt-0.5 text-xs text-[#8A8178]">
                              {business.category}
                            </p>

                            <div className="mt-1.5 flex items-center gap-1 text-xs text-[#756B61]">
                              <MapPin size={12} />
                              <span className="truncate">
                                {business.area}
                              </span>
                            </div>
                          </div>
                        </Link>

                        <button
                          type="button"
                          onClick={() => removeSaved(business.id)}
                          aria-label={`Remove ${business.name} from saved`}
                          className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#A39A91] transition hover:bg-[#FFF0D9] hover:text-[#9F2D18]"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between border-t border-[#F0ECE7] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#756B61]">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                business.availability === "AVAILABLE"
                                  ? "bg-green-500"
                                  : business.availability === "UNAVAILABLE"
                                  ? "bg-red-400"
                                  : "bg-yellow-400"
                              }`}
                            />
                            {business.availability === "AVAILABLE"
                              ? "Available"
                              : business.availability === "UNAVAILABLE"
                              ? "Unavailable"
                              : "Ask seller"}
                          </span>

                          {business.verified && (
                            <span className="rounded-full bg-[#DDF5EA] px-2 py-1 text-[10px] font-bold text-[#24734A]">
                              Verified
                            </span>
                          )}
                        </div>

                        <Link
                          href={`/seller/${business.id}`}
                          className="flex items-center gap-1 text-xs font-bold text-[#FF5A36]"
                        >
                          View seller
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-3 left-3 right-3 z-50 mx-auto flex max-w-md items-center justify-around rounded-2xl border border-[#EAE6DF] bg-white/95 px-2 py-2 shadow-[0_8px_30px_rgba(23,32,42,0.12)] backdrop-blur md:hidden">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/saved";

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold ${
                  active
                    ? "bg-[#FFE0D6] text-[#9F2D18]"
                    : "text-[#8A8178]"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}