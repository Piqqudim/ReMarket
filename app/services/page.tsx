"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
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
  showContactInfo?: boolean;
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
  images: ServiceImage[];
  category?: {
    id?: string;
    name?: string;
  } | null;
  seller?: ServiceSeller | null;
};

type SavedServiceMap = Record<string, string>;

type ServiceCategory = {
  id: string;
  name: string;
  count: number;
};

type ServiceResponse = {
  services?: unknown[];
  total?: number;
  totalPages?: number;
  page?: number;
  error?: string;
};

type DraftFilters = {
  minPrice: string;
  maxPrice: string;
  availability: string;
  fulfillmentType: string;
  verifiedOnly: boolean;
};

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 12;

const FULFILLMENT_OPTIONS = [
  { value: "AT_PROVIDER", label: "At provider's location" },
  { value: "AT_CUSTOMER", label: "At my location" },
  { value: "REMOTE", label: "Online / Remote" },
  { value: "FLEXIBLE", label: "Flexible" },
] as const;

const INITIAL_FILTERS: DraftFilters = {
  minPrice: "",
  maxPrice: "",
  availability: "",
  fulfillmentType: "",
  verifiedOnly: false,
};

/* -------------------------------------------------------------------------- */
/* GENERAL HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asId(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "";
}

function asNullableText(value: unknown): string | null {
  return asText(value) || null;
}

function asPrice(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

function parseServiceCategory(value: unknown): Service["category"] {
  if (!isRecord(value)) return null;

  const id = asId(value.id);
  const name = asText(value.name);

  if (!id && !name) return null;

  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
  };
}

function parseServiceSeller(value: unknown): ServiceSeller | null {
  if (!isRecord(value)) return null;

  const id = asId(value.id);
  const name = asText(value.name);

  if (!id && !name) return null;

  const rawLocation = isRecord(value.location)
    ? value.location
    : null;

  const verification = asNullableText(value.verification);

  return {
    id,
    name: name || "Local service provider",
    ownerName: asNullableText(value.ownerName),
    imageUrl: asNullableText(value.imageUrl),
    verification,
    verified:
      value.verified === true ||
      verification === "VERIFIED",
    availability: asNullableText(value.availability),
    showContactInfo: value.showContactInfo === true,
    location: rawLocation
      ? {
          area: asNullableText(rawLocation.area),
          street: asNullableText(rawLocation.street),
        }
      : null,
  };
}

/**
 * The service API may call its ownership relation `seller` or `business`.
 * Normalise either public response shape so the page does not discard valid
 * service records because of a field-name difference.
 */
function parseService(value: unknown): Service | null {
  if (!isRecord(value)) return null;

  const id = asId(value.id);
  const name = asText(value.name);

  if (!id || !name) return null;

  const rawSeller = isRecord(value.seller)
    ? value.seller
    : isRecord(value.business)
      ? value.business
      : null;

  const rawImages = Array.isArray(value.images)
    ? value.images
    : [];

  const images: ServiceImage[] = rawImages
    .filter(isRecord)
    .map((image) => ({
      ...(asId(image.id) ? { id: asId(image.id) } : {}),
      url: asText(image.url),
      sortOrder:
        typeof image.sortOrder === "number" &&
        Number.isFinite(image.sortOrder)
          ? image.sortOrder
          : 0,
    }))
    .filter((image) => image.url.length > 0)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const durationMinutes = asOptionalNumber(value.durationMinutes);

  return {
    id,
    name,
    description: asNullableText(value.description),
    price: asPrice(value.price),
    priceMin: asPrice(value.priceMin),
    priceMax: asPrice(value.priceMax),
    durationMinutes:
      durationMinutes !== null && durationMinutes > 0
        ? durationMinutes
        : null,
    fulfillmentType: asNullableText(value.fulfillmentType),
    availability: asNullableText(value.availability),
    imageUrl:
      asNullableText(value.imageUrl) ??
      images[0]?.url ??
      null,
    images,
    category: parseServiceCategory(value.category),
    seller: rawSeller ? parseServiceSeller(rawSeller) : null,
  };
}

function getServiceImage(service: Service): string | null {
  return service.imageUrl ??
    service.images.find((image) => image.url)?.url ??
    null;
}

function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getServicePrice(service: Service): string {
  const price = service.price === null || service.price === undefined
    ? null
    : Number(service.price);
  const min = service.priceMin === null || service.priceMin === undefined
    ? null
    : Number(service.priceMin);
  const max = service.priceMax === null || service.priceMax === undefined
    ? null
    : Number(service.priceMax);

  if (price !== null && Number.isFinite(price)) {
    return formatNaira(price);
  }

  const hasMin = min !== null && Number.isFinite(min);
  const hasMax = max !== null && Number.isFinite(max);

  if (hasMin && hasMax) {
    if (min === max) return formatNaira(min);
    return `${formatNaira(min)} – ${formatNaira(max)}`;
  }

  if (hasMin) return `From ${formatNaira(min)}`;
  if (hasMax) return `Up to ${formatNaira(max)}`;

  return "Price on request";
}

function formatDuration(minutes?: number | null): string | null {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }

  if (minutes < 60) return `${minutes} min`;

  const wholeHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${wholeHours} ${wholeHours === 1 ? "hour" : "hours"}`;
  }

  return `${wholeHours}h ${remainingMinutes}m`;
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

function getApiError(data: unknown): string {
  if (isRecord(data) && typeof data.error === "string") {
    return data.error;
  }

  return "Something went wrong. Please try again.";
}

function parseCategoryList(data: unknown): ServiceCategory[] {
  if (!isRecord(data) || !Array.isArray(data.categories)) {
    return [];
  }

  const seen = new Set<string>();

  return data.categories
    .filter(isRecord)
    .filter((category) => category.isActive !== false)
    .map((category) => {
      const id = asId(category.id);
      const name = asText(category.name);
      const counts = isRecord(category._count)
        ? category._count
        : null;
      const count = counts && typeof counts.services === "number"
        ? counts.services
        : 0;

      return { id, name, count };
    })
    .filter((category) => {
      const key = category.name.toLocaleLowerCase();
      if (!category.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Supports common saved-list response shapes while mapping the service ID
 * to the SavedListing ID required by DELETE /api/saved/[id].
 */
function parseSavedServices(data: unknown): SavedServiceMap {
  const result: SavedServiceMap = {};
  const visited = new Set<object>();

  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (visited.has(value as object)) return;
    visited.add(value as object);

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, unknown>;
    const type = asText(
      record.type ?? record.listingType ?? record.entityType,
    ).toUpperCase();

    const nestedService =
      record.service ??
      record.savedService ??
      record.listing ??
      record.item;

    const nestedServiceObject = isRecord(nestedService)
      ? nestedService
      : null;

    const explicitlyOtherType =
      Boolean(type) && type !== "SERVICE";

    const serviceId = explicitlyOtherType
      ? ""
      : asId(record.serviceId) ||
        asId(record.listingId) ||
        (nestedServiceObject
          ? asId(nestedServiceObject.id)
          : "") ||
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

function getSavedRecordId(data: unknown): string | null {
  if (!isRecord(data)) return null;

  const nested = [
    data.savedListing,
    data.savedService,
    data.saved,
    data.item,
  ].find(isRecord);

  if (nested) {
    return asId(nested.id) || null;
  }

  return (
    asId(data.savedListingId) ||
    asId(data.savedItemId) ||
    asId(data.savedId) ||
    null
  );
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
  const duration = formatDuration(service.durationMinutes);
  const FulfillmentIcon = getFulfillmentIcon(service.fulfillmentType);

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white transition hover:-translate-y-0.5 hover:border-[#FFB5A3] hover:shadow-lg hover:shadow-[#9F2D18]/5">
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
          aria-label={
            saved
              ? `Remove ${service.name} from Saved`
              : `Save ${service.name}`
          }
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

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/service/${encodeURIComponent(service.id)}`}
              className="line-clamp-2 text-base font-bold text-[#292421] transition hover:text-[#FF5A36]"
            >
              {service.name}
            </Link>

            {/* Provider identity is displayed as listing context, not a separate
                public business-directory link. */}
            <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-[#81766D]">
              <span className="truncate">{sellerName}</span>
              {service.seller?.verified && (
                <BadgeCheck
                  className="h-3.5 w-3.5 shrink-0 text-[#2196C5]"
                  aria-label="Verified provider"
                />
              )}
            </p>
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
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#FF5A36]" />
            <span className="truncate">
              {area || getFulfillmentLabel(service.fulfillmentType)}
            </span>
          </div>

          {duration && (
            <div className="flex items-center gap-2">
              <Clock3 className="h-3.5 w-3.5 shrink-0 text-[#FF5A36]" />
              <span>{duration}</span>
            </div>
          )}

          <div className="flex min-w-0 items-center gap-2">
            <FulfillmentIcon className="h-3.5 w-3.5 shrink-0 text-[#FF5A36]" />
            <span className="truncate">
              {getFulfillmentLabel(service.fulfillmentType)}
            </span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getAvailabilityClasses(
              service.availability,
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
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [savedServices, setSavedServices] = useState<SavedServiceMap>({});
  const [savingIds, setSavingIds] = useState<string[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");

  const [draftFilters, setDraftFilters] =
    useState<DraftFilters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<DraftFilters>(INITIAL_FILTERS);

  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [filterError, setFilterError] = useState("");

  /* ------------------------------------------------------------------------ */
  /* LOAD SERVICE CATEGORIES                                                  */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch("/api/categories?type=service", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error("Unable to load service categories.");
        }

        const data: unknown = await response.json();
        if (controller.signal.aborted) return;

        setCategories(parseCategoryList(data));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Service category loading error:", error);
        setCategories([]);
      }
    }

    void loadCategories();
    return () => controller.abort();
  }, []);

  /* ------------------------------------------------------------------------ */
  /* LOAD SERVICES                                                            */
  /* ------------------------------------------------------------------------ */

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
        if (appliedFilters.minPrice.trim()) {
          params.set("minPrice", appliedFilters.minPrice.trim());
        }
        if (appliedFilters.maxPrice.trim()) {
          params.set("maxPrice", appliedFilters.maxPrice.trim());
        }
        if (appliedFilters.availability) {
          params.set("availability", appliedFilters.availability);
        }
        if (appliedFilters.fulfillmentType) {
          params.set("fulfillmentType", appliedFilters.fulfillmentType);
        }
        if (appliedFilters.verifiedOnly) {
          params.set("verified", "true");
        }

        const response = await fetch(`/api/services?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal,
          headers: { Accept: "application/json" },
        });

        const data: unknown = await response.json();

        if (!response.ok) {
          throw new Error(getApiError(data));
        }

        if (!isRecord(data)) {
          throw new Error("The services API returned an invalid response.");
        }

        const rawServices = Array.isArray(data.services)
          ? data.services
          : [];
        const parsedServices = rawServices
          .map(parseService)
          .filter((service): service is Service => service !== null);

        if (signal?.aborted) return;

        setServices(parsedServices);

        const reportedTotal =
          typeof data.total === "number" && Number.isFinite(data.total)
            ? Math.max(0, data.total)
            : parsedServices.length;

        const reportedPages =
          typeof data.totalPages === "number" &&
          Number.isFinite(data.totalPages)
            ? Math.max(1, data.totalPages)
            : Math.max(1, Math.ceil(reportedTotal / PAGE_SIZE));

        setTotal(reportedTotal);
        setTotalPages(reportedPages);

        if (page > reportedPages && reportedTotal > 0) {
          setPage(reportedPages);
        }
      } catch (error) {
        if (signal?.aborted) return;

        console.error("Services page error:", error);
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load services. Please try again.",
        );
        setServices([]);
        setTotal(0);
        setTotalPages(1);
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
      appliedFilters,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadServices(controller.signal);
    return () => controller.abort();
  }, [loadServices]);

  /* ------------------------------------------------------------------------ */
  /* LOAD SAVED SERVICES                                                      */
  /* ------------------------------------------------------------------------ */

  const loadSavedServices = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/saved", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });

      if (!response.ok) return;

      const data: unknown = await response.json();
      if (!signal?.aborted) {
        setSavedServices(parseSavedServices(data));
      }
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Unable to load saved services:", error);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSavedServices(controller.signal);

    function refreshSavedServices() {
      void loadSavedServices();
    }

    window.addEventListener("focus", refreshSavedServices);
    window.addEventListener("storage", refreshSavedServices);

    return () => {
      controller.abort();
      window.removeEventListener("focus", refreshSavedServices);
      window.removeEventListener("storage", refreshSavedServices);
    };
  }, [loadSavedServices]);

  /* ------------------------------------------------------------------------ */
  /* CATEGORY OPTIONS                                                         */
  /* ------------------------------------------------------------------------ */

  const fallbackCategoryNames = useMemo(() => {
    const names = services
      .map((service) => service.category?.name?.trim())
      .filter((name): name is string => Boolean(name));

    return Array.from(new Set(names));
  }, [services]);

  const categoryOptions = useMemo(() => {
    if (categories.length > 0) return categories;

    return fallbackCategoryNames.map((name) => ({
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      count: 0,
    }));
  }, [categories, fallbackCategoryNames]);

  /* ------------------------------------------------------------------------ */
  /* SEARCH AND FILTER ACTIONS                                                */
  /* ------------------------------------------------------------------------ */

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
    setLocation(locationInput.trim());
  }

  function selectCategory(value: string) {
    setPage(1);
    setCategory((current) => current === value ? "" : value);
  }

  function updateDraftFilter<K extends keyof DraftFilters>(
    key: K,
    value: DraftFilters[K],
  ) {
    setDraftFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function applyFilters() {
    const minimum = draftFilters.minPrice.trim()
      ? Number(draftFilters.minPrice)
      : null;
    const maximum = draftFilters.maxPrice.trim()
      ? Number(draftFilters.maxPrice)
      : null;

    if (
      (minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) ||
      (maximum !== null && (!Number.isFinite(maximum) || maximum < 0))
    ) {
      setFilterError("Enter valid non-negative prices.");
      return;
    }

    if (minimum !== null && maximum !== null && minimum > maximum) {
      setFilterError("Minimum price cannot be greater than maximum price.");
      return;
    }

    setFilterError("");
    setAppliedFilters({ ...draftFilters });
    setPage(1);
    setShowFilters(false);
  }

  function clearFilters() {
    setSearchInput("");
    setLocationInput("");
    setQuery("");
    setLocation("");
    setCategory("");
    setDraftFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setFilterError("");
    setSort("newest");
    setPage(1);
    setShowFilters(false);
  }

  const activeFilterCount = [
    category,
    appliedFilters.minPrice,
    appliedFilters.maxPrice,
    appliedFilters.availability,
    appliedFilters.fulfillmentType,
    appliedFilters.verifiedOnly ? "verified" : "",
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
            headers: { Accept: "application/json" },
          },
        );

        if (response.status === 401 || response.status === 403) {
          router.push(
            `/buyer/login?callbackUrl=${encodeURIComponent("/services")}`,
          );
          return;
        }

        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
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
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            type: "SERVICE",
            listingId: service.id,
          }),
        });

        if (response.status === 401 || response.status === 403) {
          router.push(
            `/buyer/login?callbackUrl=${encodeURIComponent("/services")}`,
          );
          return;
        }

        const data: unknown = await response.json().catch(() => null);

        if (response.status === 409) {
          await loadSavedServices();
          return;
        }

        if (!response.ok) {
          throw new Error(getApiError(data));
        }

        let savedId = getSavedRecordId(data);
        if (!savedId) {
          await loadSavedServices();
          savedId = null;
        }

        if (savedId) {
          setSavedServices((current) => ({
            ...current,
            [service.id]: savedId!,
          }));
        }
      }
    } catch (error) {
      console.error("Unable to update saved service:", error);
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to update your saved services.",
      );
    } finally {
      setSavingIds((current) =>
        current.filter((id) => id !== service.id),
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
                Discover services around your area, compare offerings and send
                a booking request when you find the right one.
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

        {/* SERVICE CATEGORIES FROM THE CATEGORY API */}
        {categoryOptions.length > 0 && (
          <section className="mb-6" aria-label="Service categories">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-[#292421]">
                Browse service categories
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

            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                aria-pressed={!category}
                onClick={() => selectCategory("")}
                className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${
                  !category
                    ? "border-[#FF5A36] bg-[#FF5A36] text-white"
                    : "border-[#EAE6DF] bg-white text-[#6F675F] hover:border-[#FFB5A3]"
                }`}
              >
                All services
              </button>

              {categoryOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={category === item.name}
                  onClick={() => selectCategory(item.name)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition ${
                    category === item.name
                      ? "border-[#FF5A36] bg-[#FF5A36] text-white"
                      : "border-[#EAE6DF] bg-white text-[#6F675F] hover:border-[#FFB5A3]"
                  }`}
                >
                  {item.name}
                  <span className="ml-1.5 text-[10px] opacity-70">
                    {item.count > 0 ? item.count : ""}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* RESULTS TOOLBAR */}
        <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#292421]">
              {category || "Services near you"}
            </h2>
            <p className="mt-1 text-xs text-[#81766D]">
              {loading
                ? "Finding services..."
                : `${total.toLocaleString("en-NG")} ${total === 1 ? "service" : "services"} found`}
              {location ? ` in ${location}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((current) => !current)}
              aria-expanded={showFilters}
              aria-controls="service-filter-panel"
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
              <span className="text-xs font-medium text-[#81766D]">Sort:</span>
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
          <section
            id="service-filter-panel"
            className="mb-5 rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[#292421]">Refine your search</h3>
                <p className="mt-1 text-xs text-[#81766D]">
                  Choose your preferred price, availability and service location.
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
                  step="1"
                  inputMode="numeric"
                  value={draftFilters.minPrice}
                  onChange={(event) => {
                    updateDraftFilter("minPrice", event.target.value);
                    setFilterError("");
                  }}
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
                  step="1"
                  inputMode="numeric"
                  value={draftFilters.maxPrice}
                  onChange={(event) => {
                    updateDraftFilter("maxPrice", event.target.value);
                    setFilterError("");
                  }}
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
                  value={draftFilters.availability}
                  onChange={(event) =>
                    updateDraftFilter("availability", event.target.value)
                  }
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
                  value={draftFilters.fulfillmentType}
                  onChange={(event) =>
                    updateDraftFilter("fulfillmentType", event.target.value)
                  }
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
                checked={draftFilters.verifiedOnly}
                onChange={(event) =>
                  updateDraftFilter("verifiedOnly", event.target.checked)
                }
                className="h-4 w-4 accent-[#FF5A36]"
              />
              Show verified providers only
            </label>

            {filterError && (
              <p role="alert" className="mt-3 text-xs font-medium text-red-600">
                {filterError}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2 border-t border-[#F0ECE6] pt-4">
              <button
                type="button"
                onClick={applyFilters}
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
                key={`service-skeleton-${index}`}
                className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white"
                aria-hidden="true"
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
              see more services.
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
                  Showing page <strong className="text-[#292421]">{page}</strong> of{" "}
                  <strong className="text-[#292421]">{totalPages}</strong>
                  <span className="ml-2">({total.toLocaleString("en-NG")} services)</span>
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1 || loading}
                    className="flex h-10 items-center gap-1 rounded-xl border border-[#EAE6DF] px-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>

                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages || loading}
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
