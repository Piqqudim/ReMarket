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
  Package,
  Clock3,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import {
  getSavedBusinesses,
  removeSavedBusiness,
  SAVED_BUSINESSES_CHANGED_EVENT,
  SAVED_BUSINESSES_KEY,
  SAVED_ITEMS_CHANGED_EVENT,
  getSavedProducts,
  removeSavedProduct,
  getSavedServices,
  removeSavedService,
  type SavedBusiness,
  type SavedProduct,
  type SavedService,
} from "@/lib/saved";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Requests", href: "/my-requests", icon: ClipboardList },
  { label: "Saved", href: "/saved", icon: Heart },
];

type SavedTab = "businesses" | "products" | "services";

type PriceFields = {
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
};

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

function getAvailabilityLabel(availability?: string): string {
  switch (availability) {
    case "AVAILABLE":
      return "Available";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return "Ask seller";
  }
}

function getAvailabilityDot(availability?: string): string {
  switch (availability) {
    case "AVAILABLE":
      return "bg-green-500";
    case "UNAVAILABLE":
      return "bg-red-400";
    default:
      return "bg-yellow-400";
  }
}

function formatNaira(value?: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return `₦${new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function getPriceLabel(item: PriceFields): string {
  const exactPrice = formatNaira(item.price);

  if (exactPrice !== null) {
    return exactPrice;
  }

  const minimum = formatNaira(item.priceMin);
  const maximum = formatNaira(item.priceMax);

  if (minimum && maximum) {
    return minimum === maximum ? minimum : `${minimum} – ${maximum}`;
  }

  if (minimum) return `From ${minimum}`;
  if (maximum) return `Up to ${maximum}`;

  return "Price not listed";
}

function formatDuration(durationMinutes?: number | null): string | null {
  if (
    typeof durationMinutes !== "number" ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }

  if (durationMinutes < 60) {
    return `${durationMinutes} min`;
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function getFulfillmentLabel(value?: string): string | null {
  if (!value) return null;

  switch (value.toUpperCase()) {
    case "IN_PERSON":
      return "In person";
    case "ONLINE":
      return "Online";
    case "BOTH":
      return "Online and in person";
    default:
      return value
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}

function getSavedBusinessesSignature(businesses: SavedBusiness[]): string {
  return JSON.stringify(
    [...businesses].sort((a, b) => a.id.localeCompare(b.id))
  );
}

/**
 * A saved business is removed only when the public endpoint explicitly
 * reports that it is no longer available. Temporary failures preserve it.
 */
async function validateSavedBusinesses(
  saved: SavedBusiness[],
  signal: AbortSignal
): Promise<SavedBusiness[]> {
  if (saved.length === 0) return [];

  const results = await Promise.all(
    saved.map(async (business) => {
      try {
        const response = await fetch(
          `/api/businesses/${encodeURIComponent(business.id)}`,
          {
            method: "GET",
            cache: "no-store",
            signal,
          }
        );

        if (response.status === 404 || response.status === 410) {
          return null;
        }

        if (!response.ok) {
          return business;
        }

        let data: { business?: { id?: unknown } } | null = null;

        try {
          data = await response.json();
        } catch {
          return business;
        }

        if (data?.business?.id !== business.id) {
          console.warn(
            `Unexpected response while validating saved business ${business.id}.`
          );
          return business;
        }

        return business;
      } catch (error) {
        if (!signal.aborted) {
          console.error(
            `Unable to validate saved business ${business.id}:`,
            error
          );
        }
        return business;
      }
    })
  );

  return results.filter(
    (business): business is SavedBusiness => business !== null
  );
}

function getSellerHref(businessId?: string): string | null {
  if (!businessId?.trim()) return null;
  return `/seller/${encodeURIComponent(businessId)}`;
}

export default function SavedPage() {
  const [savedBusinesses, setSavedBusinesses] = useState<SavedBusiness[]>([]);
  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  const [savedServices, setSavedServices] = useState<SavedService[]>([]);
  const [activeTab, setActiveTab] = useState<SavedTab>("businesses");
  const [loaded, setLoaded] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(false);

  const validationRunRef = useRef(0);
  const validationControllerRef = useRef<AbortController | null>(null);
  const userSelectedTabRef = useRef(false);

  /**
   * Read all three saved collections together. Only the initial page load
   * validates businesses against the public API; item-change events simply
   * refresh local state so saving a product does not revalidate every seller.
   */
  const loadSavedItems = useCallback(
    async function loadSavedItems(validateBusinesses = false) {
      validationControllerRef.current?.abort();
      validationControllerRef.current = null;

      const runId = ++validationRunRef.current;
      const businesses = getSavedBusinesses();
      const products = getSavedProducts();
      const services = getSavedServices();

      setSavedBusinesses(businesses);
      setSavedProducts(products);
      setSavedServices(services);
      setLoaded(true);

      if (!userSelectedTabRef.current) {
        if (businesses.length > 0) {
          setActiveTab("businesses");
        } else if (products.length > 0) {
          setActiveTab("products");
        } else if (services.length > 0) {
          setActiveTab("services");
        } else {
          setActiveTab("businesses");
        }
      }

      if (!validateBusinesses || businesses.length === 0) {
        setCheckingSaved(false);
        return;
      }

      setCheckingSaved(true);

      const controller = new AbortController();
      validationControllerRef.current = controller;
      const originalSignature = getSavedBusinessesSignature(businesses);

      try {
        const validBusinesses = await validateSavedBusinesses(
          businesses,
          controller.signal
        );

        if (runId !== validationRunRef.current || controller.signal.aborted) {
          return;
        }

        const latestBusinesses = getSavedBusinesses();
        const latestSignature = getSavedBusinessesSignature(latestBusinesses);

        if (latestSignature !== originalSignature) {
          setSavedBusinesses(latestBusinesses);
          return;
        }

        if (validBusinesses.length !== businesses.length) {
          try {
            localStorage.setItem(
              SAVED_BUSINESSES_KEY,
              JSON.stringify(validBusinesses)
            );

            // Keep older business-only listeners in other parts of the app informed.
            window.dispatchEvent(new Event(SAVED_BUSINESSES_CHANGED_EVENT));
          } catch (storageError) {
            console.error(
              "Unable to update saved businesses in local storage:",
              storageError
            );
          }
        }

        setSavedBusinesses(validBusinesses);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Unable to validate saved businesses:", error);
          if (runId === validationRunRef.current) {
            setSavedBusinesses(getSavedBusinesses());
          }
        }
      } finally {
        if (runId === validationRunRef.current) {
          setCheckingSaved(false);
          if (validationControllerRef.current === controller) {
            validationControllerRef.current = null;
          }
        }
      }
    },
    []
  );

  useEffect(() => {
    const handleSavedItemsChanged = () => {
      void loadSavedItems(false);
    };

    window.addEventListener(
      SAVED_ITEMS_CHANGED_EVENT,
      handleSavedItemsChanged
    );
    window.addEventListener("storage", handleSavedItemsChanged);

    void loadSavedItems(true);

    return () => {
      window.removeEventListener(
        SAVED_ITEMS_CHANGED_EVENT,
        handleSavedItemsChanged
      );
      window.removeEventListener("storage", handleSavedItemsChanged);

      validationRunRef.current += 1;
      validationControllerRef.current?.abort();
      validationControllerRef.current = null;
    };
  }, [loadSavedItems]);

  const businessCount = savedBusinesses.length;
  const productCount = savedProducts.length;
  const serviceCount = savedServices.length;
  const totalSavedCount = businessCount + productCount + serviceCount;

  function selectTab(tab: SavedTab) {
    userSelectedTabRef.current = true;
    setActiveTab(tab);
  }

  function handleRemoveBusiness(id: string) {
    removeSavedBusiness(id);
    setSavedBusinesses((current) =>
      current.filter((business) => business.id !== id)
    );
  }

  function handleRemoveProduct(id: string) {
    removeSavedProduct(id);
    setSavedProducts((current) =>
      current.filter((product) => product.id !== id)
    );
  }

  function handleRemoveService(id: string) {
    removeSavedService(id);
    setSavedServices((current) =>
      current.filter((service) => service.id !== id)
    );
  }

  const tabs: { id: SavedTab; label: string; count: number; icon: LucideIcon }[] = [
    { id: "businesses", label: "Businesses", count: businessCount, icon: Store },
    { id: "products", label: "Products", count: productCount, icon: Package },
    { id: "services", label: "Services", count: serviceCount, icon: ClipboardList },
  ];

  return (
    <div className="min-h-dvh w-full bg-[#FFF7ED]">
      <div className="min-h-dvh w-full bg-[#FFFDFC]">
        {/* HEADER */}
        <header className="flex h-[66px] items-center justify-between gap-2 border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
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

          {/* DESKTOP HEADER NAVIGATION */}
          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-4 lg:flex xl:gap-6"
          >
            {NAV_ITEMS.map((item) => {
              const active = item.href === "/saved";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
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

        <div className="flex min-h-[calc(100dvh-66px)]">
          {/* DESKTOP SIDEBAR */}
          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 lg:block">
            <nav aria-label="Sidebar navigation" className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/saved";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
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
                Can&apos;t find it nearby? Send a request and let sellers find you.
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
                    Keep businesses, products and services you like in one place.
                  </p>
                </div>

                {totalSavedCount > 0 && (
                  <div className="self-start rounded-full bg-[#FFF0D9] px-3 py-1.5 text-xs font-bold text-[#9F2D18] sm:self-auto">
                    {totalSavedCount} {totalSavedCount === 1 ? "saved item" : "saved items"}
                  </div>
                )}
              </div>

              {/* SAVED CATEGORY TABS */}
              <div
                role="tablist"
                aria-label="Saved item types"
                className="mt-6 flex w-full gap-2 overflow-x-auto border-b border-[#EAE6DF] pb-2"
              >
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      id={`saved-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`saved-panel-${tab.id}`}
                      onClick={() => selectTab(tab.id)}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${
                        active
                          ? "bg-[#FFE0D6] text-[#9F2D18]"
                          : "text-[#756B61] hover:bg-[#FCFAF6] hover:text-[#9F2D18]"
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${
                          active
                            ? "bg-white/80 text-[#9F2D18]"
                            : "bg-[#F3EFE9] text-[#756B61]"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {!loaded && (
                <div className="mt-8 flex min-h-[160px] items-center justify-center rounded-2xl border border-[#EAE6DF] bg-white p-8 text-center">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#756B61]">
                    <Loader2 size={16} className="animate-spin text-[#FF5A36]" />
                    Loading your saved items...
                  </div>
                </div>
              )}

              {/* BUSINESSES TAB */}
              {loaded && activeTab === "businesses" && (
                <div
                  id="saved-panel-businesses"
                  role="tabpanel"
                  aria-labelledby="saved-tab-businesses"
                >
                  {checkingSaved && savedBusinesses.length > 0 && (
                    <div
                      role="status"
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#FCFAF6] px-3 py-1.5 text-[11px] font-semibold text-[#8A8178]"
                    >
                      <Loader2 size={12} className="animate-spin text-[#FF5A36]" />
                      Checking saved businesses...
                    </div>
                  )}

                  {savedBusinesses.length === 0 ? (
                    <div className="mt-7 flex min-h-[320px] flex-col items-center justify-center rounded-[20px] border border-dashed border-[#E4DED6] bg-[#FCFAF6] px-6 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#FF5A36]">
                        <Store size={28} />
                      </div>
                      <h2 className="mt-5 text-lg font-extrabold text-[#17202A]">
                        No saved businesses yet
                      </h2>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-[#756B61]">
                        Save businesses you may want to contact or visit later. They will appear here.
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
                    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {savedBusinesses.map((business) => (
                        <article
                          key={business.id}
                          className="group min-w-0 overflow-hidden rounded-[18px] border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(23,32,42,0.07)]"
                        >
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
                                  getInitials(business.name)
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h2 className="truncate text-sm font-extrabold text-[#17202A]">
                                  {business.name}
                                </h2>
                                <p className="mt-0.5 truncate text-xs text-[#8A8178]">
                                  {business.category || "Local business"}
                                </p>
                                <div className="mt-1.5 flex min-w-0 items-center gap-1 text-xs text-[#756B61]">
                                  <MapPin size={12} className="shrink-0" />
                                  <span className="truncate">{business.area || "Location not listed"}</span>
                                </div>
                              </div>
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleRemoveBusiness(business.id)}
                              aria-label={`Remove ${business.name} from saved`}
                              className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#A39A91] transition hover:bg-[#FFF0D9] hover:text-[#9F2D18]"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F0ECE7] px-4 py-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#756B61]">
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${getAvailabilityDot(
                                    business.availability
                                  )}`}
                                />
                                {getAvailabilityLabel(business.availability)}
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
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* PRODUCTS TAB */}
              {loaded && activeTab === "products" && (
                <div
                  id="saved-panel-products"
                  role="tabpanel"
                  aria-labelledby="saved-tab-products"
                >
                  {savedProducts.length === 0 ? (
                    <div className="mt-7 flex min-h-[320px] flex-col items-center justify-center rounded-[20px] border border-dashed border-[#E4DED6] bg-[#FCFAF6] px-6 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#FF5A36]">
                        <Package size={28} />
                      </div>
                      <h2 className="mt-5 text-lg font-extrabold text-[#17202A]">
                        No saved products yet
                      </h2>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-[#756B61]">
                        Save products you are interested in and return to them here.
                      </p>
                      <Link
                        href="/shop"
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#E94C2A]"
                      >
                        Explore products
                        <ChevronRight size={16} />
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {savedProducts.map((product) => {
                        const sellerHref = getSellerHref(product.businessId);

                        return (
                          <article
                            key={product.id}
                            className="group min-w-0 overflow-hidden rounded-[18px] border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(23,32,42,0.07)]"
                          >
                            <div className="relative flex h-44 items-center justify-center overflow-hidden bg-[#FCFAF6]">
                              {product.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                />
                              ) : (
                                <Package size={34} className="text-[#D1C5B9]" />
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveProduct(product.id)}
                                aria-label={`Remove ${product.name} from saved`}
                                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-[#A39A91] shadow-sm transition hover:bg-[#FFF0D9] hover:text-[#9F2D18]"
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>

                            <div className="p-4">
                              <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#A39A91]">
                                {product.category || "Product"}
                              </p>
                              <h2 className="mt-1 line-clamp-2 min-h-10 text-sm font-extrabold text-[#17202A]">
                                {product.name}
                              </h2>
                              <p className="mt-2 text-base font-extrabold text-[#9F2D18]">
                                {getPriceLabel(product)}
                              </p>
                              <div className="mt-2 flex min-w-0 items-center gap-1 text-xs text-[#756B61]">
                                <MapPin size={12} className="shrink-0" />
                                <span className="truncate">
                                  {product.area || "Location not listed"}
                                </span>
                              </div>
                              <div className="mt-4 border-t border-[#F0ECE7] pt-3">
                                {sellerHref ? (
                                  <Link
                                    href={sellerHref}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-[#FF5A36] transition hover:text-[#9F2D18]"
                                  >
                                    {product.businessName || "View seller"}
                                    <ChevronRight size={14} />
                                  </Link>
                                ) : (
                                  <span className="text-xs text-[#A39A91]">
                                    Seller profile not available
                                  </span>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SERVICES TAB */}
              {loaded && activeTab === "services" && (
                <div
                  id="saved-panel-services"
                  role="tabpanel"
                  aria-labelledby="saved-tab-services"
                >
                  {savedServices.length === 0 ? (
                    <div className="mt-7 flex min-h-[320px] flex-col items-center justify-center rounded-[20px] border border-dashed border-[#E4DED6] bg-[#FCFAF6] px-6 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#FF5A36]">
                        <ClipboardList size={28} />
                      </div>
                      <h2 className="mt-5 text-lg font-extrabold text-[#17202A]">
                        No saved services yet
                      </h2>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-[#756B61]">
                        Save services you may want to enquire about or book later.
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
                    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {savedServices.map((service) => {
                        const sellerHref = getSellerHref(service.businessId);
                        const duration = formatDuration(service.durationMinutes);
                        const fulfillment = getFulfillmentLabel(service.fulfillmentType);

                        return (
                          <article
                            key={service.id}
                            className="group min-w-0 overflow-hidden rounded-[18px] border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(23,32,42,0.07)]"
                          >
                            <div className="relative flex h-44 items-center justify-center overflow-hidden bg-[#FCFAF6]">
                              {service.imageUrl ? (
                                <img
                                  src={service.imageUrl}
                                  alt={service.name}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                />
                              ) : (
                                <ClipboardList size={34} className="text-[#D1C5B9]" />
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveService(service.id)}
                                aria-label={`Remove ${service.name} from saved`}
                                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-[#A39A91] shadow-sm transition hover:bg-[#FFF0D9] hover:text-[#9F2D18]"
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>

                            <div className="p-4">
                              <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#A39A91]">
                                {service.category || "Service"}
                              </p>
                              <h2 className="mt-1 line-clamp-2 min-h-10 text-sm font-extrabold text-[#17202A]">
                                {service.name}
                              </h2>
                              <p className="mt-2 text-base font-extrabold text-[#9F2D18]">
                                {getPriceLabel(service)}
                              </p>

                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#756B61]">
                                {duration && (
                                  <span className="inline-flex items-center gap-1">
                                    <Clock3 size={12} />
                                    {duration}
                                  </span>
                                )}
                                {fulfillment && (
                                  <span className="inline-flex items-center gap-1">
                                    <CalendarDays size={12} />
                                    {fulfillment}
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 flex min-w-0 items-center gap-1 text-xs text-[#756B61]">
                                <MapPin size={12} className="shrink-0" />
                                <span className="truncate">
                                  {service.area || "Location not listed"}
                                </span>
                              </div>

                              <div className="mt-4 border-t border-[#F0ECE7] pt-3">
                                {sellerHref ? (
                                  <Link
                                    href={sellerHref}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-[#FF5A36] transition hover:text-[#9F2D18]"
                                  >
                                    {service.businessName || "View service provider"}
                                    <ChevronRight size={14} />
                                  </Link>
                                ) : (
                                  <span className="text-xs text-[#A39A91]">
                                    Service provider profile not available
                                  </span>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
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
            const active = item.href === "/saved";

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
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
