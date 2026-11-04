
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  MapPin,
  Heart,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  Clock3,
  BadgeCheck,
  CalendarCheck,
  BriefcaseBusiness,
  Sparkles,
  Loader2,
  RefreshCw,
  ArrowRight,
  HandHelping,
  Home,
  Monitor,
  UserRound,
  ImageIcon,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type ServiceImage = {
  id?: string;
  url: string;
  sortOrder?: number;
};

type ServiceSeller = {
  id: string;
  name: string;
  ownerName?: string | null;
  imageUrl?: string | null;
  verification?: string | null;
  verified?: boolean;
  availability?: string | null;
  location?: {
    area?: string | null;
    street?: string | null;
  } | null;
};

type Service = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | string | null;
  priceMin?: number | string | null;
  priceMax?: number | string | null;
  durationMinutes?: number | null;
  fulfillmentType?: string | null;
  availability?: string | null;
  imageUrl?: string | null;
  images?: ServiceImage[];
  category?: {
    id?: string;
    name?: string;
  } | null;
  seller?: ServiceSeller | null;
};

type SavedServiceMap = Record<string, string>;

type ServiceResponse = {
  services?: Service[];
  total?: number;
  totalPages?: number;
  page?: number;
  error?: string;
};

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 12;

const FULFILLMENT_OPTIONS = [
  { value: "AT_PROVIDER", label: "At provider's location" },
  { value: "AT_CUSTOMER", label: "At my location" },
  { value: "REMOTE", label: "Online / Remote" },
  { value: "FLEXIBLE", label: "Flexible" },
];

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asId(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value
    : "";
}

function getServiceImage(service: Service): string | null {
  if (service.imageUrl) return service.imageUrl;

  const firstImage = service.images?.find((image) => image.url);
  return firstImage?.url ?? null;
}

function getServicePrice(service: Service): string {
  const price = Number(service.price);
  const min = Number(service.priceMin);
  const max = Number(service.priceMax);

  const hasPrice =
    service.price !== null &&
    service.price !== undefined &&
    service.price !== "";

  const hasMin =
    service.priceMin !== null &&
    service.priceMin !== undefined &&
    service.priceMin !== "";

  const hasMax =
    service.priceMax !== null &&
    service.priceMax !== undefined &&
    service.priceMax !== "";

  const format = (amount: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);

  if (hasMin && hasMax && Number.isFinite(min) && Number.isFinite(max)) {
    if (min === max) return format(min);
    return `From ${format(min)}`;
  }

  if (hasMin && Number.isFinite(min)) {
    return `From ${format(min)}`;
  }

  if (hasPrice && Number.isFinite(price)) {
    return format(price);
  }

  if (hasMax && Number.isFinite(max)) {
    return `Up to ${format(max)}`;
  }

  return "Price on request";
}

function formatDuration(minutes?: number | null): string | null {
  if (!minutes || minutes <= 0) return null;

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = minutes / 60;

  if (Number.isInteger(hours)) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  const wholeHours = Math.floor(hours);
  const remainingMinutes = minutes % 60;

  return remainingMinutes
    ? `${wholeHours}h ${remainingMinutes}m`
    : `${wholeHours}h`;
}

function getFulfillmentLabel(value?: string | null): string {
  switch (value) {
    case "AT_PROVIDER":
      return "At provider's location";
    case "AT_CUSTOMER":
      return "At your location";
    case "REMOTE":
      return "Online service";
    case "FLEXIBLE":
      return "Flexible location";
    default:
      return "Location confirmed with provider";
  }
}

function getFulfillmentIcon(value?: string | null) {
  switch (value) {
    case "REMOTE":
      return Monitor;
    case "AT_CUSTOMER":
      return Home;
    default:
      return MapPin;
  }
}

function getAvailabilityLabel(value?: string | null): string {
  switch (value) {
    case "AVAILABLE":
      return "Available";
    case "UNAVAILABLE":
      return "Currently unavailable";
    case "ASK_SELLER":
    default:
      return "Confirm availability";
  }
}

function getAvailabilityClasses(value?: string | null): string {
  switch (value) {
    case "AVAILABLE":
      return "bg-green-50 text-green-700";
    case "UNAVAILABLE":
      return "bg-red-50 text-red-700";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

/**
 * The saved API may return records with a nested service, or a serviceId.
 * This parser supports those common response shapes without assuming that
 * a service's own ID is the SavedListing ID.
 */
function parseSavedServices(data: unknown): SavedServiceMap {
  const result: SavedServiceMap = {};
  const visited = new Set<object>();

  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;

    if (visited.has(value as object)) return;
    visited.add(value as object);

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, unknown>;

    const nestedService =
      record.service ??
      record.savedService ??
      record.listing ??
      record.item;

    const nestedServiceObject =
      nestedService && typeof nestedService === "object"
        ? (nestedService as Record<string, unknown>)
        : null;

    const type = asText(
      record.type ?? record.listingType ?? record.entityType
    ).toUpperCase();

    const serviceId =
      asId(record.serviceId) ||
      asId(record.listingId) ||
      asId(nestedServiceObject?.id) ||
      (type === "SERVICE" ? asId(record.id) : "");

    const savedRecordId =
      asId(record.savedListingId) ||
      asId(record.savedItemId) ||
      asId(record.savedId) ||
      (nestedServiceObject ? asId(record.id) : "") ||
      (type === "SERVICE" ? asId(record.id) : "");

    if (serviceId && savedRecordId) {
      result[serviceId] = savedRecordId;
    }

    Object.values(record).forEach(visit);
  }

  visit(data);

  return result;
}

function getApiError(data: unknown): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error?: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }

  return "Something went wrong. Please try again.";
}

/* -------------------------------------------------------------------------- */
/* SERVICE CARD                                                               */
/* -------------------------------------------------------------------------- */

function ServiceCard({
  service,
  saved,
  saving,
  onToggleSave,
}: {
  service: Service;
  saved: boolean;
  saving: boolean;
  onToggleSave: (service: Service) => void;
}) {
  const image = getServiceImage(service);
  const sellerName = service.seller?.name || "Local service provider";
  const area = service.seller?.location?.area;
  const Duration = formatDuration(service.durationMinutes);
  const FulfillmentIcon = getFulfillmentIcon(service.fulfillmentType);

  return (
    <article className="group overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:border-[#FFB5A3] hover:shadow-lg hover:shadow-[#9F2D18]/5">
      <div className="relative aspect-[16/10] overflow-hidden bg-[#FCFAF6]">
        {image ? (
          <img
            src={image}
            alt={service.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FFF0E9] to-[#FCFAF6]">
            <ImageIcon className="h-10 w-10 text-[#D9A394]" />
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {service.category?.name && (
            <span className="rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-[#6F675F] shadow-sm">
              {service.category.name}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onToggleSave(service)}
          disabled={saving}
          aria-label={saved ? "Remove saved service" : "Save service"}
          aria-pressed={saved}
          className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition hover:scale-105 disabled:cursor-wait disabled:opacity-60 ${
            saved ? "text-[#FF5A36]" : "text-[#6F675F] hover:text-[#FF5A36]"
          }`}
        >
          {saving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Heart className={`h-5 w-5 ${saved ? "fill-current" : ""}`} />
          )}
        </button>

        {service.seller?.verified && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#9F2D18] shadow-sm">
            <BadgeCheck className="h-3.5 w-3.5" />
            Verified provider
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/service/${encodeURIComponent(service.id)}`}
              className="line-clamp-1 text-base font-bold text-[#292421] transition hover:text-[#FF5A36]"
            >
              {service.name}
            </Link>

            <Link
              href={`/business/${encodeURIComponent(service.seller?.id || "")}`}
              className="mt-1 inline-block max-w-full truncate text-sm text-[#81766D] hover:text-[#9F2D18]"
            >
              {sellerName}
            </Link>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-sm font-extrabold text-[#9F2D18]">
              {getServicePrice(service)}
            </p>
          </div>
        </div>

        <p className="mb-3 line-clamp-2 min-h-10 text-sm leading-5 text-[#81766D]">
          {service.description || "View the service details for more information."}
        </p>

        <div className="space-y-2 border-t border-[#F0ECE6] pt-3 text-xs text-[#6F675F]">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#FF5A36]" />
            <span className="truncate">
              {area || getFulfillmentLabel(service.fulfillmentType)}
            </span>
          </div>

          {Duration && (
            <div className="flex items-center gap-2">
              <Clock3 className="h-3.5 w-3.5 shrink-0 text-[#FF5A36]" />
              <span>{Duration}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <FulfillmentIcon className="h-3.5 w-3.5 shrink-0 text-[#FF5A36]" />
            <span className="truncate">
              {getFulfillmentLabel(service.fulfillmentType)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getAvailabilityClasses(
              service.availability
            )}`}
          >
            {getAvailabilityLabel(service.availability)}
          </span>

          <Link
            href={`/service/${encodeURIComponent(service.id)}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#FF5A36] px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94C2A]"
          >
            View service
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* MAIN PAGE                                                                  */
/* -------------------------------------------------------------------------- */

export default function ServicesPage() {
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [savedServices, setSavedServices] = useState<SavedServiceMap>({});
  const [savingIds, setSavingIds] = useState<string[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");

  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [availability, setAvailability] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const loadServices = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError("");

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
          sort,
        });

        if (query.trim()) params.set("q", query.trim());
        if (location.trim()) params.set("location", location.trim());
        if (category.trim()) params.set("category", category.trim());
        if (minPrice.trim()) params.set("minPrice", minPrice.trim());
        if (maxPrice.trim()) params.set("maxPrice", maxPrice.trim());
        if (availability) params.set("availability", availability);
        if (fulfillmentType) {
          params.set("fulfillmentType", fulfillmentType);
        }
        if (verifiedOnly) params.set("verified", "true");

        const response = await fetch(`/api/services?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal,
        });

        const data = (await response.json()) as ServiceResponse;

        if (!response.ok) {
          throw new Error(getApiError(data));
        }

        setServices(Array.isArray(data.services) ? data.services : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
        setTotalPages(
          typeof data.totalPages === "number" ? data.totalPages : 0
        );
      } catch (error) {
        if (signal?.aborted) return;

        console.error("Services page error:", error);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load services. Please try again."
        );
        setServices([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [
      page,
      sort,
      query,
      location,
      category,
      minPrice,
      maxPrice,
      availability,
      fulfillmentType,
      verifiedOnly,
    ]
  );

  /* Load the current results whenever an applied filter changes. */
  useEffect(() => {
    const controller = new AbortController();

    void loadServices(controller.signal);

    return () => controller.abort();
  }, [loadServices]);

  /* Read saved services once, then keep the list in sync. */
  const loadSavedServices = useCallback(async () => {
    try {
      const response = await fetch("/api/saved", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) return;

      const data: unknown = await response.json();
      setSavedServices(parseSavedServices(data));
    } catch (error) {
      console.error("Unable to load saved services:", error);
    }
  }, []);

  useEffect(() => {
    void loadSavedServices();
  }, [loadSavedServices]);

  /* ------------------------------------------------------------------------ */
  /* SEARCH AND FILTERS                                                       */
  /* ------------------------------------------------------------------------ */

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setPage(1);
    setQuery(searchInput.trim());
    setLocation(locationInput.trim());
  }

  function selectCategory(value: string) {
    setPage(1);
    setCategory(value);
  }

  function clearFilters() {
    setSearchInput("");
    setLocationInput("");
    setQuery("");
    setLocation("");
    setCategory("");
    setMinPrice("");
    setMaxPrice("");
    setAvailability("");
    setFulfillmentType("");
    setVerifiedOnly(false);
    setSort("newest");
    setPage(1);
  }

  const categoryOptions = useMemo(() => {
    const names = services
      .map((service) => service.category?.name?.trim())
      .filter((name): name is string => Boolean(name));

    return Array.from(new Set(names)).slice(0, 8);
  }, [services]);

  const activeFilterCount = [
    category,
    minPrice,
    maxPrice,
    availability,
    fulfillmentType,
    verifiedOnly ? "verified" : "",
  ].filter(Boolean).length;

  /* ------------------------------------------------------------------------ */
  /* SAVE / UNSAVE                                                            */
  /* ------------------------------------------------------------------------ */

  async function toggleSavedService(service: Service) {
    if (!service.id || savingIds.includes(service.id)) return;

    setSaveError("");
    setSavingIds((current) => [...current, service.id]);

    try {
      const savedRecordId = savedServices[service.id];

      if (savedRecordId) {
        const response = await fetch(
          `/api/saved/${encodeURIComponent(savedRecordId)}`,
          {
            method: "DELETE",
            cache: "no-store",
          }
        );

        if (response.status === 401) {
          router.push(
            `/buyer/login?callbackUrl=${encodeURIComponent("/services")}`
          );
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(getApiError(data));
        }

        setSavedServices((current) => {
          const next = { ...current };
          delete next[service.id];
          return next;
        });
      } else {
        const response = await fetch("/api/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "SERVICE",
            listingId: service.id,
          }),
        });

        if (response.status === 401) {
          router.push(
            `/buyer/login?callbackUrl=${encodeURIComponent("/services")}`
          );
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => null);

          /*
           * A duplicate save may mean the service is already saved.
           * Refresh the saved list before showing an error.
           */
          if (response.status === 409) {
            await loadSavedServices();
            return;
          }

          throw new Error(getApiError(data));
        }

        const data: unknown = await response.json().catch(() => null);
        let createdMap = parseSavedServices(data);
        let createdId = createdMap[service.id];

        /*
         * Some save endpoints return the created record without a nested
         * service. Refreshing GET gives us the SavedListing ID needed later
         * to remove it safely.
         */
        if (!createdId) {
          const refresh = await fetch("/api/saved", {
            method: "GET",
            cache: "no-store",
          });

          if (refresh.ok) {
            const refreshedData: unknown = await refresh.json();
            createdMap = parseSavedServices(refreshedData);
            createdId = createdMap[service.id];
          }
        }

        if (createdId) {
          setSavedServices((current) => ({
            ...current,
            [service.id]: createdId,
          }));
        } else {
          /*
           * The server accepted the save, but did not expose the record ID.
           * Refresh the list and let its response determine the saved state.
           */
          await loadSavedServices();
        }
      }
    } catch (error) {
      console.error("Unable to update saved service:", error);
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to update your saved services."
      );
    } finally {
      setSavingIds((current) =>
        current.filter((id) => id !== service.id)
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* RENDER                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-dvh bg-[#FFF7ED]">
      <SiteHeader searchMode="SERVICES" />

      <main className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12">
        {/* PAGE INTRO */}
        <section className="mb-6 overflow-hidden rounded-3xl border border-[#F1DDD3] bg-gradient-to-r from-[#FFF0E9] via-[#FFF7ED] to-[#FCFAF6]">
          <div className="grid items-center gap-5 px-5 py-7 sm:px-8 sm:py-9 lg:grid-cols-[1fr_auto]">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-xs font-bold text-[#9F2D18]">
                <Sparkles className="h-3.5 w-3.5" />
                Local services, made easier to find
              </div>

              <h1 className="text-2xl font-extrabold tracking-tight text-[#292421] sm:text-3xl lg:text-4xl">
                Find the right service near you.
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-[#766B62] sm:text-base">
                Discover service providers around your area, compare their
                offerings and send a booking request when you find the right
                one.
              </p>
            </div>

            <div className="hidden h-28 w-28 items-center justify-center rounded-[28px] bg-white/80 text-[#FF5A36] shadow-sm sm:flex lg:h-32 lg:w-32">
              <HandHelping className="h-14 w-14" strokeWidth={1.5} />
            </div>
          </div>
        </section>

        {/* SEARCH */}
        <section className="mb-6 rounded-2xl border border-[#EAE6DF] bg-white p-3 shadow-sm sm:p-4">
          <form
            onSubmit={submitSearch}
            className="grid gap-2 lg:grid-cols-[1fr_0.7fr_auto]"
          >
            <label className="flex min-w-0 items-center gap-3 rounded-xl bg-[#FCFAF6] px-3.5 py-3">
              <Search className="h-5 w-5 shrink-0 text-[#FF5A36]" />
              <span className="min-w-0 flex-1">
                <span className="sr-only">Search services</span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="What service do you need?"
                  maxLength={100}
                  className="w-full bg-transparent text-sm text-[#292421] outline-none placeholder:text-[#A49A91]"
                />
              </span>
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  aria-label="Clear service search"
                  className="text-[#A49A91] hover:text-[#9F2D18]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>

            <label className="flex min-w-0 items-center gap-3 rounded-xl bg-[#FCFAF6] px-3.5 py-3">
              <MapPin className="h-5 w-5 shrink-0 text-[#FF5A36]" />
              <span className="min-w-0 flex-1">
                <span className="sr-only">Location</span>
                <input
                  value={locationInput}
                  onChange={(event) => setLocationInput(event.target.value)}
                  placeholder="Area or location"
                  maxLength={100}
                  className="w-full bg-transparent text-sm text-[#292421] outline-none placeholder:text-[#A49A91]"
                />
              </span>
              {locationInput && (
                <button
                  type="button"
                  onClick={() => setLocationInput("")}
                  aria-label="Clear location"
                  className="text-[#A49A91] hover:text-[#9F2D18]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>

            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 text-sm font-bold text-white transition hover:bg-[#E94C2A]"
            >
              <Search className="h-4 w-4" />
              Search services
            </button>
          </form>
        </section>

        {/* CATEGORY CHIPS */}
        {categoryOptions.length > 0 && (
          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-[#292421]">
                Browse categories
              </h2>
              {category && (
                <button
                  type="button"
                  onClick={() => selectCategory("")}
                  className="text-xs font-semibold text-[#9F2D18] hover:underline"
                >
                  Clear category
                </button>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => selectCategory("")}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${
                  !category
                    ? "border-[#FF5A36] bg-[#FF5A36] text-white"
                    : "border-[#EAE6DF] bg-white text-[#6F675F] hover:border-[#FFB5A3]"
                }`}
              >
                All services
              </button>

              {categoryOptions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => selectCategory(name)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${
                    category === name
                      ? "border-[#FF5A36] bg-[#FF5A36] text-white"
                      : "border-[#EAE6DF] bg-white text-[#6F675F] hover:border-[#FFB5A3]"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* RESULTS TOOLBAR */}
        <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#292421]">
              Services near you
            </h2>
            <p className="mt-1 text-xs text-[#81766D]">
              {loading
                ? "Finding services..."
                : `${total.toLocaleString()} ${
                    total === 1 ? "service" : "services"
                  } found`}
              {location ? ` in ${location}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              aria-expanded={showFilters}
              className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition ${
                showFilters || activeFilterCount > 0
                  ? "border-[#FFB5A3] bg-[#FFF0E9] text-[#9F2D18]"
                  : "border-[#EAE6DF] bg-white text-[#6F675F] hover:border-[#FFB5A3]"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A36] px-1 text-[10px] text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <label className="flex h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3">
              <span className="text-xs font-medium text-[#81766D]">
                Sort:
              </span>
              <select
                value={sort}
                onChange={(event) => {
                  setPage(1);
                  setSort(event.target.value);
                }}
                className="max-w-[125px] bg-transparent text-xs font-bold text-[#292421] outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="updated">Recently updated</option>
              </select>
            </label>
          </div>
        </section>

        {/* FILTER PANEL */}
        {showFilters && (
          <section className="mb-5 rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[#292421]">Refine your search</h3>
                <p className="mt-1 text-xs text-[#81766D]">
                  Narrow the results to what you need.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowFilters(false)}
                aria-label="Close filters"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#81766D] hover:bg-[#FCFAF6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="service-min-price"
                  className="mb-2 block text-xs font-bold text-[#6F675F]"
                >
                  Minimum price (₦)
                </label>
                <input
                  id="service-min-price"
                  type="number"
                  min="0"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                  placeholder="e.g. 5000"
                  className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm outline-none focus:border-[#FF5A36]"
                />
              </div>

              <div>
                <label
                  htmlFor="service-max-price"
                  className="mb-2 block text-xs font-bold text-[#6F675F]"
                >
                  Maximum price (₦)
                </label>
                <input
                  id="service-max-price"
                  type="number"
                  min="0"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="e.g. 50000"
                  className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm outline-none focus:border-[#FF5A36]"
                />
              </div>

              <div>
                <label
                  htmlFor="service-availability"
                  className="mb-2 block text-xs font-bold text-[#6F675F]"
                >
                  Availability
                </label>
                <select
                  id="service-availability"
                  value={availability}
                  onChange={(event) => setAvailability(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm outline-none focus:border-[#FF5A36]"
                >
                  <option value="">Any availability</option>
                  <option value="AVAILABLE">Available</option>
                  <option value="ASK_SELLER">Confirm with provider</option>
                  <option value="UNAVAILABLE">Unavailable</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="service-fulfillment"
                  className="mb-2 block text-xs font-bold text-[#6F675F]"
                >
                  Where is the service provided?
                </label>
                <select
                  id="service-fulfillment"
                  value={fulfillmentType}
                  onChange={(event) => setFulfillmentType(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm outline-none focus:border-[#FF5A36]"
                >
                  <option value="">Any location</option>
                  {FULFILLMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[#6F675F]">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(event) => setVerifiedOnly(event.target.checked)}
                className="h-4 w-4 accent-[#FF5A36]"
              />
              Show verified providers only
            </label>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-[#F0ECE6] pt-4">
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  setShowFilters(false);
                }}
                className="rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94C2A]"
              >
                Apply filters
              </button>

              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-[#EAE6DF] px-5 py-2.5 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
              >
                Clear all
              </button>
            </div>
          </section>
        )}

        {/* SAVE ERROR */}
        {saveError && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <span>{saveError}</span>
            <button
              type="button"
              onClick={() => setSaveError("")}
              aria-label="Dismiss message"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* RESULTS */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white"
              >
                <div className="aspect-[16/10] animate-pulse bg-[#F1ECE5]" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-[#F1ECE5]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-[#F1ECE5]" />
                  <div className="h-3 w-full animate-pulse rounded bg-[#F1ECE5]" />
                  <div className="h-9 w-full animate-pulse rounded-xl bg-[#F1ECE5]" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-[#EAE6DF] bg-white px-5 py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E9] text-[#FF5A36]">
              <RefreshCw className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-[#292421]">
              We couldn't load services
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-[#81766D]">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void loadServices()}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white hover:bg-[#E94C2A]"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-2xl border border-[#EAE6DF] bg-white px-5 py-14 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF0E9] text-[#FF5A36]">
              <BriefcaseBusiness className="h-7 w-7" />
            </div>

            <h3 className="text-lg font-bold text-[#292421]">
              No services found
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#81766D]">
              Try another service name or location, or clear some filters to
              see more providers.
            </p>

            <button
              type="button"
              onClick={clearFilters}
              className="mt-5 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#E94C2A]"
            >
              Clear search and filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  saved={Boolean(savedServices[service.id])}
                  saving={savingIds.includes(service.id)}
                  onToggleSave={toggleSavedService}
                />
              ))}
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EAE6DF] bg-white px-4 py-3">
                <p className="text-xs text-[#81766D]">
                  Page <strong className="text-[#292421]">{page}</strong> of{" "}
                  <strong className="text-[#292421]">{totalPages}</strong>
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="flex h-10 items-center gap-1 rounded-xl border border-[#EAE6DF] px-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                    disabled={page >= totalPages}
                    className="flex h-10 items-center gap-1 rounded-xl bg-[#FF5A36] px-3 text-xs font-bold text-white transition hover:bg-[#E94C2A] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* BUYER GUIDANCE */}
        <section className="mt-8 rounded-2xl border border-[#F1DDD3] bg-[#FFF0E9] p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#FF5A36]">
                <CalendarCheck className="h-5 w-5" />
              </div>

              <div>
                <h3 className="font-bold text-[#292421]">
                  Ready to book a service?
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-[#766B62]">
                  Open a service to review its details and send a booking
                  request. The provider will need to accept your request before
                  the booking is confirmed.
                </p>
              </div>
            </div>

            <Link
              href="/account"
              className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-[#9F2D18] hover:underline"
            >
              My account
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <MobileBottomNav />
    </div>
  );
}
