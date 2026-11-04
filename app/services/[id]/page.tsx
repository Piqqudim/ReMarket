
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  ImageIcon,
  Loader2,
  MapPin,
  Share2,
  ShieldCheck,
  Store,
  X,
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
  description?: string | null;
  imageUrl?: string | null;
  verification?: string | null;
  verified?: boolean;
  availability?: string | null;
  location?: {
    area?: string | null;
    street?: string | null;
  } | null;
  categories?: Array<{ id?: string; name: string }> | string[];
};

type Service = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
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

type BookingResult = {
  id: string;
  status: string;
  requestedFor?: string;
  createdAt?: string;
};

type SavedMap = Record<string, string>;

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function formatPrice(service: Service): string {
  const format = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(value);

  const price = service.price;
  const min = service.priceMin;
  const max = service.priceMax;

  if (min != null && max != null) {
    if (min === max) return format(min);
    return `From ${format(min)}`;
  }

  if (min != null) return `From ${format(min)}`;
  if (price != null) return format(price);
  if (max != null) return `Up to ${format(max)}`;

  return "Price on request";
}

function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) {
    return "Confirm with provider";
  }

  if (minutes < 60) {
    return `${minutes} minutes`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (!remaining) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${hours}h ${remaining}m`;
}

function fulfillmentLabel(value?: string | null): string {
  switch (value) {
    case "AT_PROVIDER":
      return "At the provider's location";
    case "AT_CUSTOMER":
      return "Provider comes to you";
    case "REMOTE":
      return "Online / Remote";
    case "FLEXIBLE":
      return "Flexible location";
    default:
      return "Confirm location with provider";
  }
}

function availabilityLabel(value?: string | null): string {
  switch (value) {
    case "AVAILABLE":
      return "Available";
    case "UNAVAILABLE":
      return "Currently unavailable";
    default:
      return "Confirm availability";
  }
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

function getGallery(service: Service): string[] {
  const gallery = (service.images ?? [])
    .filter(
      (image) =>
        typeof image.url === "string" && image.url.trim().length > 0
    )
    .sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    )
    .map((image) => image.url);

  if (service.imageUrl && !gallery.includes(service.imageUrl)) {
    gallery.unshift(service.imageUrl);
  }

  return Array.from(new Set(gallery));
}

function normalizeService(
  raw: Record<string, unknown>
): Service | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  const name = typeof raw.name === "string" ? raw.name : "";

  if (!id || !name) return null;

  const rawSeller =
    (raw.seller && typeof raw.seller === "object"
      ? raw.seller
      : raw.business) as Record<string, unknown> | undefined;

  let seller: ServiceSeller | null = null;

  if (rawSeller && typeof rawSeller.id === "string") {
    const rawLocation =
      rawSeller.location && typeof rawSeller.location === "object"
        ? (rawSeller.location as Record<string, unknown>)
        : null;

    seller = {
      id: rawSeller.id,
      name:
        typeof rawSeller.name === "string"
          ? rawSeller.name
          : "Service provider",
      ownerName:
        typeof rawSeller.ownerName === "string"
          ? rawSeller.ownerName
          : null,
      description:
        typeof rawSeller.description === "string"
          ? rawSeller.description
          : null,
      imageUrl:
        typeof rawSeller.imageUrl === "string"
          ? rawSeller.imageUrl
          : null,
      verification:
        typeof rawSeller.verification === "string"
          ? rawSeller.verification
          : null,
      verified:
        rawSeller.verified === true ||
        rawSeller.verification === "VERIFIED",
      availability:
        typeof rawSeller.availability === "string"
          ? rawSeller.availability
          : null,
      location: rawLocation
        ? {
            area:
              typeof rawLocation.area === "string"
                ? rawLocation.area
                : null,
            street:
              typeof rawLocation.street === "string"
                ? rawLocation.street
                : null,
          }
        : null,
      categories: Array.isArray(rawSeller.categories)
        ? (rawSeller.categories as ServiceSeller["categories"])
        : [],
    };
  }

  const rawCategory =
    raw.category && typeof raw.category === "object"
      ? (raw.category as Record<string, unknown>)
      : null;

  const rawImages = Array.isArray(raw.images)
    ? raw.images
        .filter(
          (image): image is Record<string, unknown> =>
            Boolean(image) && typeof image === "object"
        )
        .map((image) => ({
          id:
            typeof image.id === "string"
              ? image.id
              : undefined,
          url:
            typeof image.url === "string"
              ? image.url
              : "",
          sortOrder:
            typeof image.sortOrder === "number"
              ? image.sortOrder
              : 0,
        }))
        .filter((image) => image.url)
    : [];

  return {
    id,
    name,
    description:
      typeof raw.description === "string"
        ? raw.description
        : null,
    price:
      typeof raw.price === "number"
        ? raw.price
        : null,
    priceMin:
      typeof raw.priceMin === "number"
        ? raw.priceMin
        : null,
    priceMax:
      typeof raw.priceMax === "number"
        ? raw.priceMax
        : null,
    durationMinutes:
      typeof raw.durationMinutes === "number"
        ? raw.durationMinutes
        : null,
    fulfillmentType:
      typeof raw.fulfillmentType === "string"
        ? raw.fulfillmentType
        : null,
    availability:
      typeof raw.availability === "string"
        ? raw.availability
        : null,
    imageUrl:
      typeof raw.imageUrl === "string"
        ? raw.imageUrl
        : null,
    images: rawImages,
    category: rawCategory
      ? {
          id:
            typeof rawCategory.id === "string"
              ? rawCategory.id
              : undefined,
          name:
            typeof rawCategory.name === "string"
              ? rawCategory.name
              : undefined,
        }
      : null,
    seller,
  };
}

/* Supports saved-list records containing a nested service or serviceId. */
function parseSavedMap(data: unknown): SavedMap {
  const result: SavedMap = {};
  const seen = new Set<object>();

  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (seen.has(value as object)) return;

    seen.add(value as object);

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, unknown>;

    const nested =
      record.service ??
      record.savedService ??
      record.listing ??
      record.item;

    const nestedRecord =
      nested && typeof nested === "object"
        ? (nested as Record<string, unknown>)
        : null;

    const type = String(
      record.type ??
        record.listingType ??
        record.entityType ??
        ""
    ).toUpperCase();

    const serviceId =
      (typeof record.serviceId === "string" &&
        record.serviceId) ||
      (typeof record.listingId === "string" &&
        record.listingId) ||
      (typeof nestedRecord?.id === "string" &&
        nestedRecord.id) ||
      (type === "SERVICE" &&
      typeof record.id === "string"
        ? record.id
        : "");

    const savedId =
      (typeof record.savedListingId === "string" &&
        record.savedListingId) ||
      (typeof record.savedId === "string" &&
        record.savedId) ||
      (nestedRecord && typeof record.id === "string"
        ? record.id
        : "");

    if (serviceId && savedId) {
      result[serviceId] = savedId;
    }

    Object.values(record).forEach(visit);
  }

  visit(data);
  return result;
}

function toLocalDateTimeInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;

  return new Date(date.getTime() - offset)
    .toISOString()
    .slice(0, 16);
}

/* -------------------------------------------------------------------------- */
/* PAGE                                                                       */
/* -------------------------------------------------------------------------- */

export default function ServiceDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const serviceId = params.id;
  const bookingFormRef = useRef<HTMLDivElement>(null);

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [activeImage, setActiveImage] = useState(0);

  const [savedId, setSavedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  const [requestedFor, setRequestedFor] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [buyerMessage, setBuyerMessage] = useState("");

  const [minimumDateTime, setMinimumDateTime] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] =
    useState<BookingResult | null>(null);

  const [savedLoaded, setSavedLoaded] = useState(false);

  const images = useMemo(
    () => (service ? getGallery(service) : []),
    [service]
  );

  const currentImage = images[activeImage] ?? null;

  /* ------------------------------------------------------------------------ */
  /* DATE/TIME CONSTRAINT                                                     */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    setMinimumDateTime(
      toLocalDateTimeInput(
        new Date(Date.now() + 5 * 60 * 1000)
      )
    );
  }, []);

  /* ------------------------------------------------------------------------ */
  /* LOAD SERVICE DETAILS                                                     */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!serviceId) return;

    const controller = new AbortController();

    async function loadService() {
      setLoading(true);
      setPageError("");

      try {
        const response = await fetch(
          `/api/services/${encodeURIComponent(serviceId)}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data: unknown = await response.json();

        if (!response.ok) {
          throw new Error(getApiError(data));
        }

        if (!data || typeof data !== "object") {
          throw new Error(
            "Service information is unavailable."
          );
        }

        const record = data as Record<string, unknown>;

        const rawService =
          record.service && typeof record.service === "object"
            ? (record.service as Record<string, unknown>)
            : record;

        const normalized = normalizeService(rawService);

        if (!normalized) {
          throw new Error(
            "The requested service could not be found."
          );
        }

        setService(normalized);
        setActiveImage(0);
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error("Service details load error:", error);

        setPageError(
          error instanceof Error
            ? error.message
            : "Unable to load this service."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadService();

    return () => controller.abort();
  }, [serviceId]);

  /* ------------------------------------------------------------------------ */
  /* LOAD SAVED SERVICES                                                      */
  /* ------------------------------------------------------------------------ */

  const loadSaved = useCallback(async () => {
    try {
      const response = await fetch("/api/saved", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) return;

      const data: unknown = await response.json();
      const map = parseSavedMap(data);

      setSavedId(map[serviceId] ?? "");
    } catch (error) {
      console.error(
        "Unable to load saved service state:",
        error
      );
    } finally {
      setSavedLoaded(true);
    }
  }, [serviceId]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  /* ------------------------------------------------------------------------ */
  /* SAVE / UNSAVE SERVICE                                                    */
  /* ------------------------------------------------------------------------ */

  async function toggleSave() {
    if (!service || saving) return;

    setSaving(true);

    try {
      if (savedId) {
        const response = await fetch(
          `/api/saved/${encodeURIComponent(savedId)}`,
          {
            method: "DELETE",
          }
        );

        if (response.status === 401) {
          router.push(
            `/buyer/login?callbackUrl=${encodeURIComponent(
              `/service/${serviceId}`
            )}`
          );
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(getApiError(data));
        }

        setSavedId("");
      } else {
        const response = await fetch("/api/saved", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "SERVICE",
            listingId: service.id,
          }),
        });

        if (response.status === 401) {
          router.push(
            `/buyer/login?callbackUrl=${encodeURIComponent(
              `/service/${serviceId}`
            )}`
          );
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(getApiError(data));
        }

        await loadSaved();
      }
    } catch (error) {
      console.error("Save service error:", error);

      setPageError(
        error instanceof Error
          ? error.message
          : "Unable to update saved services."
      );
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* SHARE SERVICE                                                            */
  /* ------------------------------------------------------------------------ */

  async function shareService() {
    if (!service) return;

    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: service.name,
          text: `View ${service.name} on ReMarket.`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setShareMessage("Service link copied.");

        window.setTimeout(
          () => setShareMessage(""),
          2500
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        setShareMessage("Service link copied.");

        window.setTimeout(
          () => setShareMessage(""),
          2500
        );
      } catch {
        setShareMessage("Unable to share this link.");
      }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* BOOKING REQUEST                                                          */
  /* ------------------------------------------------------------------------ */

  function startBooking() {
    bookingFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  async function submitBooking(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!service || submitting) return;

    setBookingError("");

    if (service.availability === "UNAVAILABLE") {
      setBookingError(
        "This service is currently unavailable. Please check back later."
      );
      return;
    }

    /*
     * The API allows requestedFor to be optional.
     * Only validate it when the customer enters a date.
     */
    let requestedDate: Date | null = null;

    if (requestedFor.trim()) {
      const selectedDate = new Date(requestedFor);

      if (
        Number.isNaN(selectedDate.getTime()) ||
        selectedDate.getTime() <= Date.now()
      ) {
        setBookingError(
          "Choose a valid date and time in the future."
        );
        return;
      }

      requestedDate = selectedDate;
    }

    /*
     * The API accepts a quantity between 1 and 1,000.
     */
    const parsedQuantity = Number(quantity);

    if (
      !Number.isSafeInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > 1000
    ) {
      setBookingError(
        "Quantity must be between 1 and 1,000."
      );
      return;
    }

    /*
     * Phone number is optional.
     * When provided, validate it as a Nigerian number.
     */
    const phone = contactPhone.trim();

    if (phone.length > 32) {
      setBookingError(
        "Your phone number must not exceed 32 characters."
      );
      return;
    }

    if (phone) {
      const cleaned = phone.replace(/[^\d+]/g, "");

      let normalizedPhone = cleaned;

      if (cleaned.startsWith("00")) {
        normalizedPhone = `+${cleaned.slice(2)}`;
      } else if (cleaned.startsWith("+")) {
        normalizedPhone = cleaned;
      } else if (cleaned.startsWith("234")) {
        normalizedPhone = `+${cleaned}`;
      } else if (cleaned.startsWith("0")) {
        normalizedPhone = `+234${cleaned.slice(1)}`;
      } else {
        normalizedPhone = `+234${cleaned}`;
      }

      if (!/^\+234\d{10}$/.test(normalizedPhone)) {
        setBookingError(
          "Enter a valid Nigerian phone number."
        );
        return;
      }
    }

    if (buyerMessage.length > 2000) {
      setBookingError(
        "Your message must not exceed 2,000 characters."
      );
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/service-bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceId: service.id,

          // An empty date is omitted from the request.
          requestedFor: requestedDate
            ? requestedDate.toISOString()
            : undefined,

          quantity: parsedQuantity,

          // The API accepts an optional contact phone.
          contactPhone: phone || undefined,

          buyerMessage: buyerMessage.trim(),
        }),
      });

      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        router.push(
          `/buyer/login?callbackUrl=${encodeURIComponent(
            `/service/${serviceId}`
          )}`
        );
        return;
      }

      if (!response.ok) {
        throw new Error(getApiError(data));
      }

      const rawBooking =
        data &&
        typeof data === "object" &&
        "booking" in data
          ? (
              data as {
                booking?: Record<string, unknown>;
              }
            ).booking
          : undefined;

      if (
        !rawBooking ||
        typeof rawBooking.id !== "string"
      ) {
        throw new Error(
          "The request response was incomplete. Check your bookings before trying again."
        );
      }

      setBookingSuccess({
        id: rawBooking.id,
        status:
          typeof rawBooking.status === "string"
            ? rawBooking.status
            : "PENDING",
        requestedFor:
          typeof rawBooking.requestedFor === "string"
            ? rawBooking.requestedFor
            : undefined,
        createdAt:
          typeof rawBooking.createdAt === "string"
            ? rawBooking.createdAt
            : undefined,
      });

      setBuyerMessage("");
      setQuantity("1");
      setRequestedFor("");
      setContactPhone("");
    } catch (error) {
      console.error("Booking request error:", error);

      setBookingError(
        error instanceof Error
          ? error.message
          : "Unable to submit your booking request."
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* LOADING VIEW                                                             */
  /* ------------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#FFF7ED]">
        <SiteHeader searchMode="SERVICES" />

        <main className="mx-auto max-w-6xl px-4 py-20 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#FF5A36]" />

          <p className="mt-4 text-sm text-[#81766D]">
            Loading service details...
          </p>
        </main>

        <MobileBottomNav />
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* ERROR VIEW                                                               */
  /* ------------------------------------------------------------------------ */

  if (pageError || !service) {
    return (
      <div className="min-h-dvh bg-[#FFF7ED]">
        <SiteHeader searchMode="SERVICES" />

        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <div className="rounded-2xl border border-[#EAE6DF] bg-white p-8">
            <h1 className="text-xl font-extrabold text-[#292421]">
              Service unavailable
            </h1>

            <p className="mt-2 text-sm text-[#81766D]">
              {pageError ||
                "We couldn't find this service."}
            </p>

            <Link
              href="/services"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white hover:bg-[#E94C2A]"
            >
              <ArrowLeft className="h-4 w-4" />
              Browse services
            </Link>
          </div>
        </main>

        <MobileBottomNav />
      </div>
    );
  }

  const seller = service.seller;
  const isUnavailable =
    service.availability === "UNAVAILABLE";

  /* ------------------------------------------------------------------------ */
  /* BOOKING SUCCESS VIEW                                                     */
  /* ------------------------------------------------------------------------ */

  if (bookingSuccess) {
    return (
      <div className="min-h-dvh bg-[#FFF7ED]">
        <SiteHeader searchMode="SERVICES" />

        <main className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
          <div className="rounded-3xl border border-[#EAE6DF] bg-white p-6 text-center shadow-sm sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <h1 className="mt-5 text-2xl font-extrabold text-[#292421]">
              Booking request sent
            </h1>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#81766D]">
              Your request has been recorded. The provider
              needs to review and accept it before your
              booking is confirmed.
            </p>

            <div className="mt-6 rounded-2xl bg-[#FCFAF6] p-4 text-left">
              <div className="flex justify-between gap-4 border-b border-[#EAE6DF] pb-3">
                <span className="text-xs text-[#81766D]">
                  Service
                </span>

                <span className="text-right text-sm font-bold text-[#292421]">
                  {service.name}
                </span>
              </div>

              <div className="flex justify-between gap-4 border-b border-[#EAE6DF] py-3">
                <span className="text-xs text-[#81766D]">
                  Preferred date
                </span>

                <span className="text-right text-sm font-semibold text-[#292421]">
                  {bookingSuccess.requestedFor
                    ? new Date(
                        bookingSuccess.requestedFor
                      ).toLocaleString("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Not specified"}
                </span>
              </div>

              <div className="flex justify-between gap-4 pt-3">
                <span className="text-xs text-[#81766D]">
                  Request status
                </span>

                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                  Pending provider response
                </span>
              </div>

              <p className="mt-4 break-all border-t border-[#EAE6DF] pt-3 text-[11px] text-[#81766D]">
                Request ID: {bookingSuccess.id}
              </p>
            </div>

            <p className="mt-5 text-xs leading-5 text-[#81766D]">
              No payment has been taken. You will need to
              wait for the provider to accept your request.
            </p>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/services"
                className="rounded-xl border border-[#EAE6DF] px-5 py-3 text-sm font-bold text-[#6F675F] hover:bg-[#FCFAF6]"
              >
                Browse more services
              </Link>

              <Link
                href="/account"
                className="rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white hover:bg-[#E94C2A]"
              >
                Go to my account
              </Link>
            </div>
          </div>
        </main>

        <MobileBottomNav />
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* MAIN VIEW                                                                */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-dvh bg-[#FFF7ED]">
      <SiteHeader searchMode="SERVICES" />

      <main className="mx-auto max-w-[1250px] px-4 pb-32 pt-5 sm:px-6 lg:px-8 lg:pb-12">
        {/* TOP NAVIGATION */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/services"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#81766D] transition hover:text-[#9F2D18]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to services
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shareService}
              aria-label="Share service"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white text-[#6F675F] transition hover:text-[#FF5A36]"
            >
              <Share2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={toggleSave}
              disabled={saving || !savedLoaded}
              aria-label={
                savedId
                  ? "Remove saved service"
                  : "Save service"
              }
              aria-pressed={Boolean(savedId)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white transition disabled:opacity-50 ${
                savedId
                  ? "text-[#FF5A36]"
                  : "text-[#6F675F] hover:text-[#FF5A36]"
              }`}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Heart
                  className={`h-4 w-4 ${
                    savedId ? "fill-current" : ""
                  }`}
                />
              )}
            </button>
          </div>
        </div>

        {shareMessage && (
          <p className="mb-3 text-right text-xs font-semibold text-[#9F2D18]">
            {shareMessage}
          </p>
        )}

        {/* MAIN CONTENT */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_370px]">
          <div className="min-w-0">
            {/* IMAGE GALLERY */}
            <section className="overflow-hidden rounded-3xl border border-[#EAE6DF] bg-white p-2 shadow-sm">
              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-[#FCFAF6] sm:aspect-[16/9]">
                {currentImage ? (
                  <img
                    src={currentImage}
                    alt={service.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[#C4A99F]">
                    <ImageIcon className="h-12 w-12" />
                    <span className="text-xs">
                      No service image available
                    </span>
                  </div>
                )}

                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveImage((current) =>
                          current === 0
                            ? images.length - 1
                            : current - 1
                        )
                      }
                      aria-label="Previous image"
                      className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#292421] shadow-sm hover:bg-white"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setActiveImage((current) =>
                          current === images.length - 1
                            ? 0
                            : current + 1
                        )
                      }
                      aria-label="Next image"
                      className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#292421] shadow-sm hover:bg-white"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>

                    <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white">
                      {activeImage + 1} / {images.length}
                    </span>
                  </>
                )}
              </div>

              {images.length > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto p-1">
                  {images.map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      aria-label={`View image ${index + 1}`}
                      aria-pressed={activeImage === index}
                      className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                        activeImage === index
                          ? "border-[#FF5A36]"
                          : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* SERVICE INFORMATION */}
            <section className="mt-5 rounded-3xl border border-[#EAE6DF] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                {service.category?.name && (
                  <span className="rounded-full bg-[#FFF0E9] px-3 py-1.5 text-xs font-bold text-[#9F2D18]">
                    {service.category.name}
                  </span>
                )}

                {seller?.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified provider
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight text-[#292421] sm:text-3xl">
                    {service.name}
                  </h1>

                  {seller && (
                    <Link
                      href={`/business/${encodeURIComponent(
                        seller.id
                      )}`}
                      className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#81766D] transition hover:text-[#9F2D18]"
                    >
                      <Store className="h-4 w-4 text-[#FF5A36]" />
                      {seller.name}

                      {seller.verified && (
                        <BadgeCheck className="h-4 w-4 text-green-600" />
                      )}
                    </Link>
                  )}
                </div>

                <div className="rounded-2xl bg-[#FFF7ED] px-4 py-3 sm:text-right">
                  <p className="text-[11px] font-semibold text-[#81766D]">
                    Service price
                  </p>

                  <p className="mt-1 text-xl font-extrabold text-[#9F2D18]">
                    {formatPrice(service)}
                  </p>
                </div>
              </div>

              {/* SERVICE DETAILS */}
              <div className="mt-5 grid gap-3 border-y border-[#F0ECE6] py-4 sm:grid-cols-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#FF5A36]">
                    <MapPin className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-xs font-bold text-[#292421]">
                      Location
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[#81766D]">
                      {seller?.location?.area ||
                        "Ask provider for location"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#FF5A36]">
                    <Clock3 className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-xs font-bold text-[#292421]">
                      Duration
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[#81766D]">
                      {formatDuration(service.durationMinutes)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#FF5A36]">
                    <CalendarDays className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-xs font-bold text-[#292421]">
                      Availability
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[#81766D]">
                      {availabilityLabel(service.availability)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#FF5A36]">
                    <Store className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-xs font-bold text-[#292421]">
                      Service method
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[#81766D]">
                      {fulfillmentLabel(service.fulfillmentType)}
                    </p>
                  </div>
                </div>
              </div>

              {/* SERVICE DESCRIPTION */}
              <div className="mt-5">
                <h2 className="text-base font-extrabold text-[#292421]">
                  About this service
                </h2>

                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#6F675F]">
                  {service.description ||
                    "The provider has not added a detailed description yet. Send a booking request to confirm the service details."}
                </p>
              </div>

              {/* PROVIDER DESCRIPTION */}
              {seller?.description && (
                <div className="mt-6 border-t border-[#F0ECE6] pt-5">
                  <h2 className="text-base font-extrabold text-[#292421]">
                    About the provider
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-[#6F675F]">
                    {seller.description}
                  </p>

                  <Link
                    href={`/business/${encodeURIComponent(
                      seller.id
                    )}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#9F2D18] hover:underline"
                  >
                    View provider profile
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </section>

            {/* TRUST INFORMATION */}
            <section className="mt-5 rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" />

                <div>
                  <h3 className="text-sm font-bold text-[#292421]">
                    Booking through ReMarket
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-[#81766D]">
                    Your request is sent to the service provider.
                    The booking remains pending until the provider
                    accepts it. Submitting a request does not mean
                    that your appointment is confirmed.
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* BOOKING PANEL                                                    */}
          {/* ---------------------------------------------------------------- */}

          <aside className="lg:sticky lg:top-24">
            <div
              ref={bookingFormRef}
              className="scroll-mt-24 rounded-3xl border border-[#EAE6DF] bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#81766D]">
                    Request this service
                  </p>

                  <h2 className="mt-1 text-xl font-extrabold text-[#292421]">
                    Book a service
                  </h2>
                </div>

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#FF5A36]">
                  <CalendarDays className="h-5 w-5" />
                </div>
              </div>

              <p className="mt-3 text-sm leading-6 text-[#81766D]">
                Send a booking request to the provider. You
                can include your preferred date, quantity and
                additional details.
              </p>

              <div className="mt-5 rounded-2xl bg-[#FCFAF6] p-4">
                <p className="text-xs font-semibold text-[#81766D]">
                  Price
                </p>

                <p className="mt-1 text-xl font-extrabold text-[#9F2D18]">
                  {formatPrice(service)}
                </p>

                <p className="mt-1 text-[11px] text-[#81766D]">
                  Final details can be confirmed with the provider.
                </p>
              </div>

              {isUnavailable ? (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-bold text-red-700">
                    This service is currently unavailable.
                  </p>

                  <p className="mt-1 text-xs leading-5 text-red-600">
                    Booking requests are temporarily disabled.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={submitBooking}
                  className="mt-5 space-y-4"
                >
                  {/* PREFERRED DATE */}
                  <div>
                    <label
                      htmlFor="booking-date"
                      className="mb-2 block text-xs font-bold text-[#514940]"
                    >
                      Preferred date and time
                      <span className="ml-1 font-normal text-[#A49A91]">
                        (optional)
                      </span>
                    </label>

                    <input
                      id="booking-date"
                      type="datetime-local"
                      min={minimumDateTime}
                      value={requestedFor}
                      onChange={(event) =>
                        setRequestedFor(event.target.value)
                      }
                      className="h-12 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm text-[#292421] outline-none focus:border-[#FF5A36]"
                    />

                    <p className="mt-1 text-[10px] text-[#A49A91]">
                      You can leave this blank if you have
                      not decided on a date.
                    </p>
                  </div>

                  {/* QUANTITY */}
                  <div>
                    <label
                      htmlFor="booking-quantity"
                      className="mb-2 block text-xs font-bold text-[#514940]"
                    >
                      Number of people / items
                    </label>

                    <input
                      id="booking-quantity"
                      type="number"
                      min="1"
                      max="1000"
                      step="1"
                      required
                      value={quantity}
                      onChange={(event) =>
                        setQuantity(event.target.value)
                      }
                      className="h-12 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm text-[#292421] outline-none focus:border-[#FF5A36]"
                    />
                  </div>

                  {/* CONTACT PHONE */}
                  <div>
                    <label
                      htmlFor="booking-phone"
                      className="mb-2 block text-xs font-bold text-[#514940]"
                    >
                      Contact phone number
                      <span className="ml-1 font-normal text-[#A49A91]">
                        (optional)
                      </span>
                    </label>

                    <input
                      id="booking-phone"
                      type="tel"
                      autoComplete="tel"
                      maxLength={32}
                      value={contactPhone}
                      onChange={(event) =>
                        setContactPhone(event.target.value)
                      }
                      placeholder="e.g. 08012345678"
                      className="h-12 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm text-[#292421] outline-none focus:border-[#FF5A36]"
                    />

                    <p className="mt-1 text-[10px] text-[#A49A91]">
                      Provide a number the service provider
                      can use to reach you.
                    </p>
                  </div>

                  {/* ADDITIONAL DETAILS */}
                  <div>
                    <label
                      htmlFor="booking-message"
                      className="mb-2 block text-xs font-bold text-[#514940]"
                    >
                      Additional details
                      <span className="ml-1 font-normal text-[#A49A91]">
                        (optional)
                      </span>
                    </label>

                    <textarea
                      id="booking-message"
                      rows={4}
                      maxLength={2000}
                      value={buyerMessage}
                      onChange={(event) =>
                        setBuyerMessage(event.target.value)
                      }
                      placeholder="Tell the provider anything they should know before accepting your request..."
                      className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-3 text-sm text-[#292421] outline-none focus:border-[#FF5A36]"
                    />

                    <p className="mt-1 text-right text-[10px] text-[#A49A91]">
                      {buyerMessage.length}/2000
                    </p>
                  </div>

                  {/* AVAILABILITY NOTICE */}
                  {service.availability !== "AVAILABLE" && (
                    <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      The provider needs to confirm availability
                      before this booking can be accepted.
                    </div>
                  )}

                  {/* BOOKING ERROR */}
                  {bookingError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700"
                    >
                      <X className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{bookingError}</span>
                    </div>
                  )}

                  {/* SUBMIT BUTTON */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-bold text-white transition hover:bg-[#E94C2A] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending request...
                      </>
                    ) : (
                      <>
                        <CalendarDays className="h-4 w-4" />
                        Send booking request
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* PAYMENT NOTICE */}
              <div className="mt-4 border-t border-[#F0ECE6] pt-4">
                <p className="text-center text-[11px] leading-5 text-[#81766D]">
                  No payment is collected at this stage. Your
                  booking is only confirmed after the provider
                  accepts it.
                </p>
              </div>
            </div>
          </aside>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* MOBILE BOOKING ACTION                                              */}
        {/* ------------------------------------------------------------------ */}

        {!isUnavailable && (
          <div className="fixed inset-x-0 bottom-[68px] z-30 border-t border-[#EAE6DF] bg-white/95 p-3 backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] text-[#81766D]">
                  Service price
                </p>

                <p className="truncate text-base font-extrabold text-[#9F2D18]">
                  {formatPrice(service)}
                </p>
              </div>

              <button
                type="button"
                onClick={startBooking}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-sm font-bold text-white hover:bg-[#E94C2A]"
              >
                Request booking
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      <MobileBottomNav />
    </div>
  );
}
