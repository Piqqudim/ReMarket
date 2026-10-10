"use client";

import Link from "next/link";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
  Loader2,
} from "lucide-react";

import {
  getSavedBusinesses,
  removeSavedBusiness,
  SAVED_BUSINESSES_CHANGED_EVENT,
  SAVED_BUSINESSES_KEY,
  type SavedBusiness,
} from "@/lib/saved";

const NAV_ITEMS = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Shop",
    href: "/shop",
    icon: ShoppingBag,
  },
  {
    label: "Requests",
    href: "/my-requests",
    icon: ClipboardList,
  },
  {
    label: "Saved",
    href: "/saved",
    icon: Heart,
  },
];

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return initials || "R";
}

function getAvailabilityLabel(
  availability?: string
): string {
  switch (availability) {
    case "AVAILABLE":
      return "Available";

    case "UNAVAILABLE":
      return "Unavailable";

    default:
      return "Ask seller";
  }
}

function getAvailabilityDot(
  availability?: string
): string {
  switch (availability) {
    case "AVAILABLE":
      return "bg-green-500";

    case "UNAVAILABLE":
      return "bg-red-400";

    default:
      return "bg-yellow-400";
  }
}

/*
 * -----------------------------------------
 * SAVED BUSINESS SNAPSHOT
 * -----------------------------------------
 *
 * Used to detect changes to the saved list
 * while an API validation request is running.
 */

function getSavedBusinessIdsSignature(
  businesses: SavedBusiness[]
): string {
  return JSON.stringify(
    businesses
      .map((business) => business.id)
      .sort()
  );
}

/*
 * -----------------------------------------
 * VALIDATE SAVED BUSINESSES
 * -----------------------------------------
 *
 * Remove businesses only when the public API
 * explicitly reports that the resource is gone.
 *
 * Temporary server errors, rate limits, network
 * failures and unexpected response formats must
 * not erase locally saved businesses.
 */

async function validateSavedBusinesses(
  saved: SavedBusiness[]
): Promise<SavedBusiness[]> {
  if (saved.length === 0) {
    return [];
  }

  const results = await Promise.all(
    saved.map(async (business) => {
      try {
        const response = await fetch(
          `/api/businesses/${encodeURIComponent(
            business.id
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        /*
         * The API uses 404 for a business that
         * is no longer publicly available.
         *
         * 410 also explicitly indicates that
         * a resource is gone.
         */
        if (
          response.status === 404 ||
          response.status === 410
        ) {
          return null;
        }

        /*
         * Do not treat every unsuccessful
         * response as a deleted business.
         *
         * For example, a 500 or 429 must not
         * cause the saved item to be removed.
         */
        if (!response.ok) {
          return business;
        }

        const data = await response.json();

        /*
         * Unexpected successful responses should
         * not cause saved data to be deleted.
         */
        if (
          data?.business?.id !== business.id
        ) {
          console.warn(
            `Unexpected response while validating saved business ${business.id}.`
          );

          return business;
        }

        return business;
      } catch (error) {
        /*
         * Preserve the local business when a
         * network problem prevents validation.
         */
        console.error(
          `Unable to validate saved business ${business.id}:`,
          error
        );

        return business;
      }
    })
  );

  return results.filter(
    (
      business
    ): business is SavedBusiness =>
      business !== null
  );
}

/*
 * -----------------------------------------
 * SAVED PAGE
 * -----------------------------------------
 */

export default function SavedPage() {
  const [savedBusinesses, setSavedBusinesses] =
    useState<SavedBusiness[]>([]);

  /*
   * loaded means the local list has been read.
   * It does not mean API validation has ended.
   */
  const [loaded, setLoaded] = useState(false);

  const [checkingSaved, setCheckingSaved] =
    useState(false);

  /*
   * Every new load receives a newer request ID.
   * Older requests cannot overwrite newer state.
   */
  const validationRunRef = useRef(0);

  /*
   * -----------------------------------------
   * LOAD SAVED BUSINESSES
   * -----------------------------------------
   */

  const loadSavedBusinesses = useCallback(
    async function loadSavedBusinesses() {
      const runId =
        ++validationRunRef.current;

      /*
       * Read and display the locally saved list
       * before starting network validation.
       */
      const saved = getSavedBusinesses();

      setSavedBusinesses(saved);
      setLoaded(true);

      if (saved.length === 0) {
        setCheckingSaved(false);
        return;
      }

      setCheckingSaved(true);

      const originalSignature =
        getSavedBusinessIdsSignature(saved);

      try {
        const validBusinesses =
          await validateSavedBusinesses(saved);

        /*
         * A newer load or saved-list change has
         * occurred while this request was running.
         * Do not let this stale result overwrite it.
         */
        if (
          runId !== validationRunRef.current
        ) {
          return;
        }

        /*
         * Check the current local list again before
         * updating storage. This avoids restoring
         * businesses that the user has since removed
         * or overwriting a more recent saved list.
         */
        const latestSaved =
          getSavedBusinesses();

        const latestSignature =
          getSavedBusinessIdsSignature(
            latestSaved
          );

        if (
          latestSignature !==
          originalSignature
        ) {
          setSavedBusinesses(latestSaved);
          return;
        }

        /*
         * Persist the cleanup only when the API
         * explicitly identified unavailable records.
         */
        const removedStaleBusinesses =
          validBusinesses.length !== saved.length;

        if (removedStaleBusinesses) {
          try {
            localStorage.setItem(
              SAVED_BUSINESSES_KEY,
              JSON.stringify(validBusinesses)
            );
          } catch (storageError) {
            /*
             * A storage failure should not prevent
             * the current page from displaying the
             * businesses that passed validation.
             */
            console.error(
              "Unable to update saved businesses in local storage:",
              storageError
            );
          }
        }

        setSavedBusinesses(validBusinesses);
      } catch (error) {
        /*
         * Keep the latest local list if validation
         * unexpectedly fails.
         */
        console.error(
          "Unable to validate saved businesses:",
          error
        );

        if (
          runId === validationRunRef.current
        ) {
          setSavedBusinesses(
            getSavedBusinesses()
          );
        }
      } finally {
        /*
         * An older run must not stop the loading
         * indicator belonging to a newer run.
         */
        if (
          runId === validationRunRef.current
        ) {
          setCheckingSaved(false);
          setLoaded(true);
        }
      }
    },
    []
  );

  /*
   * -----------------------------------------
   * INITIAL LOAD AND CROSS-PAGE SYNC
   * -----------------------------------------
   */

  useEffect(() => {
    function handleSavedBusinessesChanged() {
      void loadSavedBusinesses();
    }

    window.addEventListener(
      SAVED_BUSINESSES_CHANGED_EVENT,
      handleSavedBusinessesChanged
    );

    window.addEventListener(
      "storage",
      handleSavedBusinessesChanged
    );

    void loadSavedBusinesses();

    return () => {
      window.removeEventListener(
        SAVED_BUSINESSES_CHANGED_EVENT,
        handleSavedBusinessesChanged
      );

      window.removeEventListener(
        "storage",
        handleSavedBusinessesChanged
      );

      /*
       * Invalidate outstanding requests when
       * this page unmounts.
       */
      validationRunRef.current += 1;
    };
  }, [loadSavedBusinesses]);

  /*
   * -----------------------------------------
   * REMOVE A SAVED BUSINESS
   * -----------------------------------------
   */

  function removeSaved(id: string) {
    removeSavedBusiness(id);

    setSavedBusinesses((current) =>
      current.filter(
        (business) => business.id !== id
      )
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED] px-3 py-3 sm:px-4 lg:px-6">
      <div className="mx-auto min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-[0_8px_30px_rgba(159,45,24,0.08)]">

        {/* HEADER */}

        <header className="flex h-[66px] items-center justify-between gap-2 border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
              <Store
                size={19}
                strokeWidth={2.5}
              />
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

          {/* DESKTOP HEADER NAVIGATION */}

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-4 lg:flex xl:gap-6"
          >
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/saved";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    active ? "page" : undefined
                  }
                  className={`whitespace-nowrap text-sm font-medium transition ${
                    active
                      ? "font-bold text-[#FF5A36]"
                      : "text-[#6F675F] hover:text-[#FF5A36]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* HEADER ACTIONS */}

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/request"
              className="hidden rounded-xl bg-[#FF5A36] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94C2A] sm:block sm:px-4 sm:text-sm"
            >
              Request something
            </Link>

            <Link
              href="/search"
              aria-label="Search ReMarket"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0D9] text-[#9F2D18] transition hover:bg-[#FFE0D6] sm:hidden"
            >
              <Search size={19} />
            </Link>
          </div>
        </header>

        <div className="flex min-h-[calc(100vh-90px)]">

          {/* DESKTOP SIDEBAR */}

          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 lg:block">
            <nav
              aria-label="Sidebar navigation"
              className="space-y-1"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                const active =
                  item.href === "/saved";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={
                      active ? "page" : undefined
                    }
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
                Can&apos;t find it nearby? Send a
                request and let sellers find you.
              </p>

              <Link
                href="/my-requests"
                className="mt-3 inline-flex items-center text-xs font-bold text-[#FF5A36]"
              >
                Make a request

                <ChevronRight size={14} />
              </Link>
            </div>
          </aside>

          {/* MAIN CONTENT */}

          <main className="min-w-0 flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-7 lg:pb-8">
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
                    Businesses you want to come
                    back to.
                  </p>
                </div>

                {savedBusinesses.length > 0 && (
                  <div className="self-start rounded-full bg-[#FFF0D9] px-3 py-1.5 text-xs font-bold text-[#9F2D18] sm:self-auto">
                    {savedBusinesses.length}{" "}
                    {savedBusinesses.length === 1
                      ? "saved business"
                      : "saved businesses"}
                  </div>
                )}
              </div>

              {/* INITIAL LOADING STATE */}

              {!loaded && (
                <div className="mt-8 flex min-h-[160px] items-center justify-center rounded-2xl border border-[#EAE6DF] bg-white p-8 text-center">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#756B61]">
                    <Loader2
                      size={16}
                      className="animate-spin text-[#FF5A36]"
                    />

                    Loading saved businesses...
                  </div>
                </div>
              )}

              {/* EMPTY STATE */}

              {loaded &&
                savedBusinesses.length === 0 && (
                  <div className="mt-7 flex min-h-[360px] flex-col items-center justify-center rounded-[20px] border border-dashed border-[#E4DED6] bg-[#FCFAF6] px-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#FF5A36]">
                      <Heart size={28} />
                    </div>

                    <h2 className="mt-5 text-lg font-extrabold text-[#17202A]">
                      Nothing saved yet
                    </h2>

                    <p className="mt-2 max-w-sm text-sm leading-6 text-[#756B61]">
                      When you find a business you
                      like, save it here so you can
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
                )}

              {/* SAVED BUSINESSES */}

              {loaded &&
                savedBusinesses.length > 0 && (
                  <>
                    {checkingSaved && (
                      <div
                        role="status"
                        className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FCFAF6] px-3 py-1.5 text-[11px] font-semibold text-[#8A8178]"
                      >
                        <Loader2
                          size={12}
                          className="animate-spin text-[#FF5A36]"
                        />

                        Checking saved businesses...
                      </div>
                    )}

                    <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {savedBusinesses.map(
                        (business) => (
                          <article
                            key={business.id}
                            className="group min-w-0 overflow-hidden rounded-[18px] border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(23,32,42,0.07)]"
                          >
                            {/* BUSINESS INFORMATION */}

                            <div className="flex items-start justify-between gap-2 p-4">
                              <Link
                                href={`/seller/${business.id}`}
                                className="flex min-w-0 flex-1 gap-3"
                              >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FFE0D6] text-sm font-extrabold text-[#9F2D18]">
                                  {business.imageUrl ? (
                                    <img
                                      src={business.imageUrl}
                                      alt={business.name}
                                      loading="lazy"
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    getInitials(
                                      business.name
                                    )
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <h2 className="truncate text-sm font-extrabold text-[#17202A]">
                                    {business.name}
                                  </h2>

                                  <p className="mt-0.5 truncate text-xs text-[#8A8178]">
                                    {business.category}
                                  </p>

                                  <div className="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-[#756B61]">
                                    <MapPin
                                      size={12}
                                      className="shrink-0"
                                    />

                                    <span className="truncate">
                                      {business.area}
                                    </span>
                                  </div>
                                </div>
                              </Link>

                              <button
                                type="button"
                                onClick={() =>
                                  removeSaved(
                                    business.id
                                  )
                                }
                                aria-label={`Remove ${business.name} from saved`}
                                className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#A39A91] transition hover:bg-[#FFF0D9] hover:text-[#9F2D18]"
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>

                            {/* AVAILABILITY AND VERIFICATION */}

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F0ECE7] px-4 py-3">
                              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#756B61]">
                                  <span
                                    className={`h-2 w-2 shrink-0 rounded-full ${getAvailabilityDot(
                                      business.availability
                                    )}`}
                                  />

                                  {getAvailabilityLabel(
                                    business.availability
                                  )}
                                </span>

                                {business.verified && (
                                  <span className="rounded-full bg-[#DDF5EA] px-2 py-1 text-[10px] font-bold text-[#24734A]">
                                    Verified
                                  </span>
                                )}
                              </div>

                              <Link
                                href={`/seller/${business.id}`}
                                className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#FF5A36] transition hover:text-[#9F2D18]"
                              >
                                View seller

                                <ChevronRight size={14} />
                              </Link>
                            </div>
                          </article>
                        )
                      )}
                    </div>
                  </>
                )}
            </section>
          </main>
        </div>

        {/* MOBILE / TABLET BOTTOM NAVIGATION */}

        <nav
          aria-label="Mobile navigation"
          className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-3 right-3 z-50 mx-auto flex max-w-md items-center justify-around rounded-2xl border border-[#EAE6DF] bg-white/95 px-2 py-2 shadow-[0_8px_30px_rgba(23,32,42,0.12)] backdrop-blur lg:hidden"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            const active =
              item.href === "/saved";

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  active ? "page" : undefined
                }
                className={`flex min-w-[60px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-bold transition ${
                  active
                    ? "bg-[#FFE0D6] text-[#9F2D18]"
                    : "text-[#8A8178] hover:bg-[#FCFAF6]"
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