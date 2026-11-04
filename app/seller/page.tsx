
"use client";

import {
  useCallback, useEffect, useMemo, useRef, useState,
  type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode,
} from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ProductImageUpload from "@/components/ProductImageUpload";
import SellerServiceManager from "@/components/SellerServiceManager";
import { validateProductPricing } from "@/lib/product-pricing";
import NotificationBell from "@/components/NotificationBell";
import {
  Store, MapPin, ChevronDown, Phone, Package, LogOut,
  ExternalLink, LoaderCircle, Plus, CheckCircle2, AlertCircle,
  Pencil, X, Trash2, AlertTriangle, UserRound, ShieldCheck,
  Share2, Copy, ArrowRight, Circle, ClipboardCheck,
  LockKeyhole, Globe, CalendarDays, Clock3, RefreshCw,
  MessageSquare, Check, Ban, ChevronLeft, ChevronRight,
  Bookmark, BriefcaseBusiness,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* TYPES AND CONSTANTS                                                        */
/* -------------------------------------------------------------------------- */

const MAX_ACTIVE_PRODUCTS = 100;
const DEFAULT_COUNTRY = "Nigeria";
const BOOKING_PAGE_SIZE = 12;

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type RecordStatus = "ACTIVE" | "INACTIVE" | "PENDING";
type VerificationStatus = "VERIFIED" | "UNVERIFIED";
type SocialPlatform = "WHATSAPP" | "INSTAGRAM" | "TIKTOK" | "FACEBOOK" | "PHONE" | "DIRECTIONS";
type BusinessSharePlatform = "WHATSAPP" | "FACEBOOK" | "LINKEDIN" | "X";
type BookingStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "COMPLETED";
type BookingFilter = "ALL" | BookingStatus;

type SellerCategory = { id: string; name: string };
type SellerSocialLink = { id: string; platform: SocialPlatform; handle: string };
type SellerProductImage = { id: string; url: string; publicId: string | null; sortOrder: number };

type SellerProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: Availability;
  imageUrl: string | null;
  images: SellerProductImage[];
  status: RecordStatus;
  deletedAt: string | null;
  category: SellerCategory | null;
};

type SellerBusiness = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  status: RecordStatus;
  verification: VerificationStatus;
  availability: Availability;
  phone: string | null;
  imageUrl: string | null;
  socialLinks: SellerSocialLink[];
  priceMin: number | null;
  priceMax: number | null;
  deletedAt: string | null;
  showContactInfo?: boolean;
  location: {
    id: string;
    area: string;
    address: string | null;
    verification: VerificationStatus;
  } | null;
  categories: { category: SellerCategory }[];
  products: SellerProduct[];
};

type DeletionRequest = {
  id: string;
  businessId: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BusinessForm = {
  name: string;
  ownerName: string;
  description: string;
  area: string;
  houseNumber: string;
  street: string;
  city: string;
  categoryId: string;
  availability: Availability;
  priceMin: string;
  priceMax: string;
  showContactInfo: boolean;
};

type ProductForm = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  priceMin: string;
  priceMax: string;
  availability: Availability;
  images: string[];
};

type ProductCapacity = {
  maxActiveProducts: number;
  baseMaxActiveProducts: number;
  referralBonusSlots: number;
};

type SellerBooking = {
  id: string;
  status: BookingStatus;
  requestedFor: string | null;
  quantity: number;
  contactPhone: string | null;
  buyerMessage: string | null;
  createdAt: string;
  messageCount: number;
  buyer: { id: string; name: string; email: string | null };
  service: { id: string; name: string };
};

type BookingSummary = {
  total: number;
  PENDING: number;
  ACCEPTED: number;
  DECLINED: number;
  CANCELLED: number;
  COMPLETED: number;
};

type ApiBusinessResponse = { business?: SellerBusiness | null; error?: unknown };
type ApiCategoriesResponse = { categories?: SellerCategory[] };
type ApiDeletionResponse = { request?: DeletionRequest | null; error?: unknown };
type ApiErrorResponse = { error?: unknown };
type ApiSellerProductsResponse = {
  maxActiveProducts?: unknown;
  baseMaxActiveProducts?: unknown;
  referralBonusSlots?: unknown;
  error?: unknown;
};

const EMPTY_BOOKING_SUMMARY: BookingSummary = {
  total: 0,
  PENDING: 0,
  ACCEPTED: 0,
  DECLINED: 0,
  CANCELLED: 0,
  COMPLETED: 0,
};

const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "PHONE", label: "Phone" },
  { value: "DIRECTIONS", label: "Directions" },
];

const AREA_DATA = [
  ["Agege", "Agege, Orile Agege, Dopemu, Oko-Oba, Isale Odo, Keke"],
  ["Ajeromi-Ifelodun", "Ajegunle, Tolu, Olodi, Alaba Oro, Awodi-Ora, Layeni, Mosafejo"],
  ["Alimosho", "Alimosho, Egbeda, Akowonjo, Shasha, Idimu, Egbe, Ikotun, Ijegun, Igando, Iyana-Ipaja, Ayobo, Abule Egba, Aboru, Meiran, Oke-Odo, Pleasure"],
  ["Amuwo-Odofin", "Amuwo, Festac, Mile 2, Satellite Town, Kirikiri, Irede, Ibeshe"],
  ["Apapa", "Apapa, Apapa Wharf, Iganmu, Ijora, Liverpool, Tin Can"],
  ["Badagry", "Badagry, Badagry West, Olorunda, Oko-Afo"],
  ["Epe", "Epe, Eredo, Ikosi-Ejinrin"],
  ["Eti-Osa", "Ikoyi, Obalende, Victoria Island, Oniru, Lekki Phase 1, Ikate, Jakande, Osapa London, Agungi, Igbo-Efon, Idado, Chevron, Ikota, VGC, Ajah, Badore, Sangotedo"],
  ["Ibeju-Lekki", "Ibeju-Lekki, Abijo, Awoyaya, Lakowe, Bogije, Eleko, Akodo"],
  ["Ifako-Ijaiye", "Ifako, Ijaiye, Ojokoro, Oke-Ira, Agbado"],
  ["Ikeja", "Ikeja, Ikeja GRA, Alausa, Allen Avenue, Oregun, Opebi, Ogba, Ojodu, Onigbongbo, Computer Village, Airport Road"],
  ["Ikorodu", "Ikorodu, Ikorodu North, Ikorodu West, Igbogbo, Baiyeku, Ijede, Imota, Odogunyan, Itamaga, Agric"],
  ["Kosofe", "Kosofe, Ketu, Agboyi, Ojota, Gbagada, Anthony, Maryland, Magodo, Isheri, Mile 12"],
  ["Lagos Island", "Lagos Island, Idumota, Balogun, Marina, Broad Street, Isale Eko, Lafiaji, Onikan, Epetedo, Okepopo"],
  ["Lagos Mainland", "Yaba, Ebute Metta, Akoka, Sabo, Alagomeji, Adekunle, Abule Oja, Onike, Iwaya, Makoko, Jibowu, Oyingbo, Tejuosho"],
  ["Mushin", "Mushin, Papa Ajao, Idi-Araba, Ilupeju, Odi-Olowo, Ojuwoye"],
  ["Ojo", "Ojo, Iba, Iyana-Iba, Ajangbadi, Oto-Awori, Alaba"],
  ["Oshodi-Isolo", "Oshodi, Isolo, Ejigbo, Okota, Ajao Estate, Mafoluku, Ago Palace"],
  ["Shomolu", "Shomolu, Bariga, Pedro, Onipanu, Palmgrove, Fadeyi"],
  ["Surulere", "Surulere, Ojuelegba, Lawanson, Itire, Aguda, Coker, Ijeshatedo"],
] as const;

const LAGOS_AREA_GROUPS = AREA_DATA.map(([lga, areas]) => ({
  lga,
  areas: areas.split(", ").map((area) => area.trim()),
}));

const INITIAL_BUSINESS_FORM: BusinessForm = {
  name: "",
  ownerName: "",
  description: "",
  area: "",
  houseNumber: "",
  street: "",
  city: "",
  categoryId: "",
  availability: "ASK_SELLER",
  priceMin: "",
  priceMax: "",
  showContactInfo: false,
};

const INITIAL_PRODUCT_FORM: ProductForm = {
  name: "",
  description: "",
  categoryId: "",
  price: "",
  priceMin: "",
  priceMax: "",
  availability: "ASK_SELLER",
  images: [],
};

const INITIAL_SOCIAL_VALUES: Record<SocialPlatform, string> = {
  WHATSAPP: "",
  INSTAGRAM: "",
  TIKTOK: "",
  FACEBOOK: "",
  PHONE: "",
  DIRECTIONS: "",
};

const inputClass =
  "h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition placeholder:text-gray-400 focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-gray-50";

const labelClass = "mb-2 block text-xs font-bold text-gray-700";

const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20 disabled:cursor-not-allowed disabled:opacity-50";

const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25 disabled:cursor-not-allowed disabled:opacity-60";

/* -------------------------------------------------------------------------- */
/* GENERAL HELPERS                                                            */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getResponseError(data: unknown, fallback: string): string {
  return isRecord(data) && typeof data.error === "string" && data.error.trim()
    ? data.error
    : fallback;
}

function parseProductCapacity(data: unknown): ProductCapacity | null {
  if (!isRecord(data)) return null;

  const { maxActiveProducts, baseMaxActiveProducts, referralBonusSlots } = data;

  if (
    typeof maxActiveProducts !== "number" ||
    !Number.isSafeInteger(maxActiveProducts) ||
    maxActiveProducts < 0 ||
    typeof baseMaxActiveProducts !== "number" ||
    !Number.isSafeInteger(baseMaxActiveProducts) ||
    baseMaxActiveProducts < 0 ||
    typeof referralBonusSlots !== "number" ||
    !Number.isSafeInteger(referralBonusSlots) ||
    referralBonusSlots < 0 ||
    baseMaxActiveProducts + referralBonusSlots !== maxActiveProducts
  ) {
    return null;
  }

  return {
    maxActiveProducts,
    baseMaxActiveProducts,
    referralBonusSlots,
  };
}

function getSocialValue(links: SellerSocialLink[] | undefined, platform: SocialPlatform): string {
  return links?.find((link) => link.platform === platform)?.handle ?? "";
}

function getSocialValues(
  links: SellerSocialLink[] | undefined,
  fallbackPhone?: string | null,
): Record<SocialPlatform, string> {
  return {
    WHATSAPP: getSocialValue(links, "WHATSAPP"),
    INSTAGRAM: getSocialValue(links, "INSTAGRAM"),
    TIKTOK: getSocialValue(links, "TIKTOK"),
    FACEBOOK: getSocialValue(links, "FACEBOOK"),
    PHONE: getSocialValue(links, "PHONE") || fallbackPhone?.trim() || "",
    DIRECTIONS: getSocialValue(links, "DIRECTIONS"),
  };
}

function buildSocialLinks(values: Record<SocialPlatform, string>) {
  return SOCIAL_PLATFORMS
    .map(({ value }) => ({
      platform: value,
      handle: values[value].trim(),
    }))
    .filter((item) => item.handle);
}

function looksLikeHouseNumber(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return Boolean(normalized) && (
    /^\d+[a-z]?\b/.test(normalized) ||
    /^(shop|house|building|block|plot|suite|unit|flat)\b/.test(normalized)
  );
}

function parseLocationAddress(address: string | null | undefined, area: string) {
  const trimmed = typeof address === "string" ? address.trim() : "";

  if (!trimmed) {
    return { houseNumber: "", street: "", city: "" };
  }

  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);

  const withoutCountry = parts.at(-1)?.toLowerCase() === DEFAULT_COUNTRY.toLowerCase()
    ? parts.slice(0, -1)
    : parts;

  let areaIndex = -1;

  withoutCountry.forEach((part, index) => {
    if (area.trim() && part.toLowerCase() === area.trim().toLowerCase()) {
      areaIndex = index;
    }
  });

  if (areaIndex < 0) {
    return { houseNumber: "", street: withoutCountry.join(", "), city: "" };
  }

  const beforeArea = withoutCountry.slice(0, areaIndex);
  const city = withoutCountry.slice(areaIndex + 1).join(", ");

  if (!beforeArea.length) {
    return { houseNumber: "", street: "", city };
  }

  if (beforeArea.length === 1) {
    return { houseNumber: "", street: beforeArea[0], city };
  }

  if (looksLikeHouseNumber(beforeArea[0])) {
    return {
      houseNumber: beforeArea[0],
      street: beforeArea.slice(1).join(", "),
      city,
    };
  }

  return {
    houseNumber: "",
    street: beforeArea.join(", "),
    city,
  };
}

function buildLocationAddressPreview(
  area: string,
  houseNumber: string,
  street: string,
  city: string,
): string {
  return [
    houseNumber.trim(),
    street.trim(),
    area.trim(),
    city.trim(),
    DEFAULT_COUNTRY,
  ].filter(Boolean).join(", ");
}

function getInitialBusinessForm(business: SellerBusiness): BusinessForm {
  const parsed = parseLocationAddress(
    business.location?.address,
    business.location?.area ?? "",
  );

  return {
    name: business.name ?? "",
    ownerName: business.ownerName ?? "",
    description: business.description ?? "",
    area: business.location?.area ?? "",
    houseNumber: parsed.houseNumber,
    street: parsed.street,
    city: parsed.city,
    categoryId: business.categories?.[0]?.category?.id ?? "",
    availability: business.availability ?? "ASK_SELLER",
    priceMin: business.priceMin != null ? String(business.priceMin) : "",
    priceMax: business.priceMax != null ? String(business.priceMax) : "",
    showContactInfo: business.showContactInfo === true,
  };
}

function getStatusClasses(status: string): string {
  if (
    status === "ACTIVE" ||
    status === "ACCEPTED" ||
    status === "COMPLETED"
  ) {
    return "bg-[#DDF5EA] text-[#137A59]";
  }

  if (status === "PENDING") {
    return "bg-[#FFF5D9] text-[#9A6700]";
  }

  if (status === "APPROVED") {
    return "bg-[#E7F0FF] text-[#3566B8]";
  }

  return "bg-[#FFF0EE] text-[#C5402D]";
}

function formatAvailability(value: Availability): string {
  return value === "AVAILABLE"
    ? "Available"
    : value === "UNAVAILABLE"
      ? "Unavailable"
      : "Ask seller";
}

function getBookingStatusLabel(status: BookingStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatBookingDate(value: string | null): string {
  if (!value) return "Date not specified";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date not specified"
    : date.toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function normalizeSellerBooking(value: unknown): SellerBooking | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  const service = isRecord(value.service) ? value.service : {};
  const buyer = isRecord(value.buyer) ? value.buyer : {};
  const count = isRecord(value._count) ? value._count : {};

  const rawStatus = typeof value.status === "string" ? value.status : "PENDING";

  const allowed: BookingStatus[] = [
    "PENDING",
    "ACCEPTED",
    "DECLINED",
    "CANCELLED",
    "COMPLETED",
  ];

  const status = allowed.includes(rawStatus as BookingStatus)
    ? rawStatus as BookingStatus
    : "PENDING";

  return {
    id: value.id,
    status,
    requestedFor: typeof value.requestedFor === "string" ? value.requestedFor : null,
    quantity: typeof value.quantity === "number" ? value.quantity : 1,
    contactPhone: typeof value.contactPhone === "string" ? value.contactPhone : null,
    buyerMessage: typeof value.buyerMessage === "string" ? value.buyerMessage : null,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    messageCount: typeof count.messages === "number"
      ? count.messages
      : typeof value.messageCount === "number"
        ? value.messageCount
        : 0,
    buyer: {
      id: typeof buyer.id === "string" ? buyer.id : "",
      name: typeof buyer.name === "string" ? buyer.name : "Customer",
      email: typeof buyer.email === "string" ? buyer.email : null,
    },
    service: {
      id: typeof service.id === "string" ? service.id : "",
      name: typeof service.name === "string" ? service.name : "Service",
    },
  };
}

function normalizeBookingSummary(value: unknown): BookingSummary {
  if (!isRecord(value)) return EMPTY_BOOKING_SUMMARY;

  const count = (key: keyof BookingSummary) =>
    typeof value[key] === "number" && Number.isSafeInteger(value[key])
      ? Math.max(0, value[key] as number)
      : 0;

  return {
    total: count("total"),
    PENDING: count("PENDING"),
    ACCEPTED: count("ACCEPTED"),
    DECLINED: count("DECLINED"),
    CANCELLED: count("CANCELLED"),
    COMPLETED: count("COMPLETED"),
  };
}

/* -------------------------------------------------------------------------- */
/* SELLER BOOKING INBOX                                                       */
/* -------------------------------------------------------------------------- */

function SellerBookingInbox() {
  const [bookings, setBookings] = useState<SellerBooking[]>([]);
  const [summary, setSummary] = useState<BookingSummary>(EMPTY_BOOKING_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [filter, setFilter] = useState<BookingFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBookings, setTotalBookings] = useState(0);
  const [updatingId, setUpdatingId] = useState("");

  const loadBookings = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);

    setLoadError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(BOOKING_PAGE_SIZE),
        status: filter,
      });

      const response = await fetch(
        `/api/seller/service-bookings?${params.toString()}`,
        { cache: "no-store" },
      );

      const data: unknown = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        throw new Error("Your seller session has expired. Please sign in again.");
      }

      if (response.status === 404) {
        throw new Error("The seller booking inbox API has not been added yet.");
      }

      if (!response.ok) {
        throw new Error(getResponseError(data, "Unable to load booking requests."));
      }

      if (!isRecord(data) || !Array.isArray(data.bookings)) {
        throw new Error("The booking response was invalid.");
      }

      const normalized = data.bookings
        .map(normalizeSellerBooking)
        .filter((booking): booking is SellerBooking => booking !== null);

      setBookings(normalized);
      setSummary(normalizeBookingSummary(data.summary));
      setTotalBookings(typeof data.total === "number" ? data.total : normalized.length);

      setTotalPages(
        typeof data.totalPages === "number" && Number.isFinite(data.totalPages)
          ? Math.max(1, data.totalPages)
          : 1,
      );
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to load booking requests.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  async function changeBookingStatus(
    id: string,
    status: "ACCEPTED" | "DECLINED",
  ) {
    if (updatingId) return;

    setUpdatingId(id);
    setActionError("");
    setActionMessage("");

    try {
      const response = await fetch(
        `/api/seller/service-bookings/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );

      const data: unknown = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        throw new Error("Your seller session has expired. Please sign in again.");
      }

      if (!response.ok) {
        throw new Error(getResponseError(data, "Unable to update this booking."));
      }

      setActionMessage(
        status === "ACCEPTED"
          ? "Booking accepted."
          : "Booking declined.",
      );

      await loadBookings(false);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to update this booking.",
      );
    } finally {
      setUpdatingId("");
    }
  }

  const filters: { value: BookingFilter; label: string }[] = [
    { value: "PENDING", label: "Pending" },
    { value: "ACCEPTED", label: "Accepted" },
    { value: "DECLINED", label: "Declined" },
    { value: "CANCELLED", label: "Cancelled" },
    { value: "COMPLETED", label: "Completed" },
    { value: "ALL", label: "All" },
  ];

  function getFilterCount(value: BookingFilter) {
    return value === "ALL" ? summary.total : summary[value];
  }

  return (
    <section
      id="service-bookings"
      className="mt-5 scroll-mt-24 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm"
    >
      <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
              Service management
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">Booking requests</h2>

              {summary.PENDING > 0 && (
                <span className="rounded-full bg-[#FFF5D9] px-2.5 py-1 text-[10px] font-bold text-[#9A6700]">
                  {summary.PENDING} pending
                </span>
              )}
            </div>

            <p className="mt-1 text-xs leading-5 text-gray-500">
              Review customer requests and respond to bookings for your services.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadBookings(false)}
            disabled={loading || refreshing}
            className={secondaryButtonClass}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setFilter(item.value);
                setPage(1);
                setActionError("");
                setActionMessage("");
              }}
              aria-pressed={filter === item.value}
              className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-bold transition ${
                filter === item.value
                  ? "bg-[#FF5A36] text-white"
                  : "border border-[#E8E4DE] bg-white text-gray-600 hover:bg-[#FFF7ED]"
              }`}
            >
              {item.label} ({getFilterCount(item.value)})
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {(actionError || actionMessage) && (
          <p
            role={actionError ? "alert" : "status"}
            className={`mb-4 rounded-xl px-3 py-2.5 text-xs ${
              actionError
                ? "border border-[#F1D5D0] bg-[#FFF0EE] text-[#C5402D]"
                : "border border-[#BDE8D8] bg-[#EFFBF6] text-[#137A59]"
            }`}
          >
            {actionError || actionMessage}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
            Loading booking requests...
          </div>
        ) : loadError ? (
          <div className="rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FCFAF6] px-5 py-8 text-center">
            <AlertCircle className="mx-auto h-7 w-7 text-[#C5402D]" />
            <p className="mt-3 text-sm font-bold text-gray-800">
              Booking inbox unavailable
            </p>
            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-gray-500">
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void loadBookings()}
              className={`${primaryButtonClass} mt-4`}
            >
              Try again
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FCFAF6] px-5 py-10 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-gray-300" />
            <h3 className="mt-3 text-sm font-bold text-gray-800">
              {filter === "PENDING"
                ? "No pending booking requests"
                : "No bookings in this category"}
            </h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              New requests from customers will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              {bookings.map((booking) => (
                <article
                  key={booking.id}
                  className="rounded-2xl border border-[#E8E4DE] bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-sm font-bold text-[#17202A]">
                          {booking.service.name}
                        </h3>

                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getStatusClasses(booking.status)}`}>
                          {getBookingStatusLabel(booking.status)}
                        </span>
                      </div>

                      <p className="mt-2 text-xs text-gray-500">
                        Request ID:{" "}
                        <span className="font-medium text-gray-700">
                          {booking.id}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      Requested {formatBookingDate(booking.createdAt)}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-xl bg-[#FCFAF6] p-3 sm:grid-cols-2">
                    <div className="flex items-start gap-2">
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A36]" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase text-gray-400">
                          Customer
                        </p>
                        <p className="mt-1 break-words text-xs font-bold text-gray-800">
                          {booking.buyer.name}
                        </p>
                        {booking.buyer.email && (
                          <p className="mt-0.5 break-all text-[11px] text-gray-500">
                            {booking.buyer.email}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A36]" />
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-gray-400">
                          Preferred date
                        </p>
                        <p className="mt-1 text-xs font-bold text-gray-800">
                          {formatBookingDate(booking.requestedFor)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Package className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A36]" />
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-gray-400">
                          Quantity
                        </p>
                        <p className="mt-1 text-xs font-bold text-gray-800">
                          {booking.quantity}
                        </p>
                      </div>
                    </div>

                    {booking.contactPhone && (
                      <div className="flex items-start gap-2">
                        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[#FF5A36]" />
                        <div>
                          <p className="text-[10px] font-semibold uppercase text-gray-400">
                            Contact phone
                          </p>
                          <p className="mt-1 text-xs font-bold text-gray-800">
                            {booking.contactPhone}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {booking.buyerMessage && (
                    <div className="mt-3 rounded-xl border border-[#E8E4DE] p-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Customer message
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-gray-700">
                        {booking.buyerMessage}
                      </p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-3 border-t border-[#F0ECE6] pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[11px] text-gray-500">
                      {booking.messageCount} booking{" "}
                      {booking.messageCount === 1 ? "message" : "messages"}
                    </span>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {(booking.status === "ACCEPTED" ||
                        booking.status === "COMPLETED" ||
                        booking.messageCount > 0) && (
                        <Link
                          href={`/service-bookings/${encodeURIComponent(booking.id)}/messages`}
                          className={`${secondaryButtonClass} min-h-10`}
                        >
                          <MessageSquare className="h-4 w-4" />
                          Open conversation
                        </Link>
                      )}

                      {booking.status === "PENDING" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={updatingId === booking.id}
                            onClick={() => void changeBookingStatus(booking.id, "DECLINED")}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#F1D5D0] px-4 text-xs font-bold text-[#C5402D] hover:bg-[#FFF0EE] disabled:opacity-50 sm:flex-none"
                          >
                            {updatingId === booking.id
                              ? <LoaderCircle className="h-4 w-4 animate-spin" />
                              : <Ban className="h-4 w-4" />}
                            Decline
                          </button>

                          <button
                            type="button"
                            disabled={updatingId === booking.id}
                            onClick={() => void changeBookingStatus(booking.id, "ACCEPTED")}
                            className={`${primaryButtonClass} min-h-10 flex-1 sm:flex-none`}
                          >
                            {updatingId === booking.id
                              ? <LoaderCircle className="h-4 w-4 animate-spin" />
                              : <Check className="h-4 w-4" />}
                            Accept booking
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-gray-500">
                          {booking.status === "ACCEPTED"
                            ? "This booking has been accepted."
                            : booking.status === "DECLINED"
                              ? "This booking was declined."
                              : booking.status === "CANCELLED"
                                ? "This booking was cancelled."
                                : "This booking is completed."}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-[#F0ECE6] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-gray-500">
                Showing {bookings.length} of {totalBookings} booking requests · Page {page} of {totalPages}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading || refreshing}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className={secondaryButtonClass}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>

                <button
                  type="button"
                  disabled={page >= totalPages || loading || refreshing}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  className={secondaryButtonClass}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* SELLER DASHBOARD                                                           */
/* -------------------------------------------------------------------------- */

export default function SellerDashboard() {
  const router = useRouter();

  const [business, setBusiness] = useState<SellerBusiness | null>(null);

  const [productCapacity, setProductCapacity] = useState<ProductCapacity>({
    maxActiveProducts: MAX_ACTIVE_PRODUCTS,
    baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS,
    referralBonusSlots: 0,
  });

  const [categories, setCategories] = useState<SellerCategory[]>([]);
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoadFailed, setDashboardLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [updatingProduct, setUpdatingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [submittingDeletionRequest, setSubmittingDeletionRequest] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showDeletionForm, setShowDeletionForm] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [categoryChanged, setCategoryChanged] = useState(false);
  const [socialValues, setSocialValues] = useState(INITIAL_SOCIAL_VALUES);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [businessForm, setBusinessForm] = useState(INITIAL_BUSINESS_FORM);
  const [productForm, setProductForm] = useState(INITIAL_PRODUCT_FORM);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [shareNoticeIsError, setShareNoticeIsError] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const dashboardProducts = useMemo(
    () => business?.products?.filter((product) => !product.deletedAt) ?? [],
    [business?.products],
  );

  const activeProductCount = dashboardProducts.filter(
    (product) => product.status === "ACTIVE",
  ).length;

  const reachedProductLimit =
    activeProductCount >= productCapacity.maxActiveProducts;

  const remainingProductSlots = Math.max(
    0,
    productCapacity.maxActiveProducts - activeProductCount,
  );

  const canShareBusiness = Boolean(
    business &&
    business.status === "ACTIVE" &&
    !business.deletedAt,
  );

  const profileIsComplete = Boolean(
    business?.name.trim() &&
    business.location?.area.trim() &&
    business.location?.address?.trim() &&
    (
      business.phone?.trim() ||
      business.socialLinks?.some(
        (link) => link.platform === "PHONE" || link.platform === "WHATSAPP",
      )
    ),
  );

  const onboardingSteps = [
    { label: "Create your business profile", done: Boolean(business) },
    { label: "Add your location and contact details", done: profileIsComplete },
    { label: "Add your first product", done: dashboardProducts.length > 0 },
    { label: "Make your profile public", done: canShareBusiness },
  ];

  const completedSteps = onboardingSteps.filter((step) => step.done).length;

  const nextAction = !business
    ? {
        title: "Set up your business",
        description: "Start with the basics. You can complete the optional details later.",
        label: "Create business",
      }
    : dashboardProducts.length === 0
      ? {
          title: "Add your first product",
          description: "Give nearby customers something specific to discover.",
          label: "Add first product",
        }
      : !profileIsComplete
        ? {
            title: "Complete your business profile",
            description: "Add a street address and a contact method so customers know how to reach you.",
            label: "Complete profile",
          }
        : !canShareBusiness
          ? {
              title: "Check your business status",
              description: "Your profile can be shared once it is active and publicly visible.",
              label: "View status",
            }
          : {
              title: "Help more people find you",
              description: "Share your public business profile with customers and local communities.",
              label: "Share business",
            };

  const clearFeedback = useCallback(() => {
    setError("");
    setSuccess("");
  }, []);

  /* ------------------------------------------------------------------------ */
  /* LOAD DASHBOARD                                                           */
  /* ------------------------------------------------------------------------ */

  const loadDashboard = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setDashboardLoadFailed(false);
    setRedirecting(false);
    setError("");

    try {
      const businessResponse = await fetch("/api/seller/business", {
        cache: "no-store",
        signal,
      });

      if (businessResponse.status === 401 || businessResponse.status === 403) {
        setRedirecting(true);
        router.replace("/seller/login");
        return;
      }

      if (!businessResponse.ok) {
        throw new Error("Unable to load seller business.");
      }

      const businessData = await readJsonSafely<ApiBusinessResponse>(businessResponse);

      if (
        !businessData ||
        !Object.prototype.hasOwnProperty.call(businessData, "business")
      ) {
        throw new Error("The seller business response was invalid.");
      }

      const loadedBusiness = businessData.business ?? null;

      const [
        categoriesResponse,
        deletionResponse,
        productsResponse,
      ] = await Promise.all([
        fetch("/api/categories", { cache: "no-store", signal }).catch(() => null),
        fetch("/api/seller/business/deletion-request", { cache: "no-store", signal }).catch(() => null),
        loadedBusiness
          ? fetch("/api/seller/products", { cache: "no-store", signal }).catch(() => null)
          : Promise.resolve(null),
      ]);

      const categoryData = categoriesResponse?.ok
        ? await readJsonSafely<ApiCategoriesResponse>(categoriesResponse)
        : null;

      const deletionData = deletionResponse?.ok
        ? await readJsonSafely<ApiDeletionResponse>(deletionResponse)
        : null;

      let loadedCapacity: ProductCapacity | null = null;

      if (loadedBusiness) {
        if (!productsResponse?.ok) {
          throw new Error("Unable to load product capacity. Please try again.");
        }

        loadedCapacity = parseProductCapacity(
          await readJsonSafely<ApiSellerProductsResponse>(productsResponse),
        );

        if (!loadedCapacity) {
          throw new Error("The seller product-capacity response was invalid.");
        }
      }

      if (signal.aborted) return;

      setBusiness(loadedBusiness);

      setProductCapacity(
        loadedCapacity ?? {
          maxActiveProducts: MAX_ACTIVE_PRODUCTS,
          baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS,
          referralBonusSlots: 0,
        },
      );

      setCategories(
        Array.isArray(categoryData?.categories)
          ? categoryData.categories
          : [],
      );

      setDeletionRequest(deletionData?.request ?? null);

      if (loadedBusiness) {
        setBusinessForm(getInitialBusinessForm(loadedBusiness));
        setSocialValues(
          getSocialValues(loadedBusiness.socialLinks, loadedBusiness.phone),
        );
      } else {
        setBusinessForm(INITIAL_BUSINESS_FORM);
        setSocialValues(INITIAL_SOCIAL_VALUES);
      }
    } catch (loadError) {
      if (signal.aborted) return;

      console.error("Seller dashboard load error:", loadError);
      setError("Unable to load your seller dashboard. Please try again.");
      setDashboardLoadFailed(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();

    void loadDashboard(controller.signal);

    return () => controller.abort();
  }, [loadDashboard, loadAttempt]);

  /* ------------------------------------------------------------------------ */
  /* FORM HELPERS                                                             */
  /* ------------------------------------------------------------------------ */

  function updateBusinessField<K extends keyof BusinessForm>(
    field: K,
    value: BusinessForm[K],
  ) {
    setBusinessForm((current) => ({
      ...current,
      [field]: value,
    }));

    clearFeedback();
  }

  function updateProductField<K extends keyof ProductForm>(
    field: K,
    value: ProductForm[K],
  ) {
    setProductForm((current) => ({
      ...current,
      [field]: value,
    }));

    clearFeedback();
  }

  function updateSocial(platform: SocialPlatform, value: string) {
    setSocialValues((current) => ({
      ...current,
      [platform]: value,
    }));

    clearFeedback();
  }

  function getBusinessFormPrices() {
    return {
      priceMin: businessForm.priceMin.trim() === ""
        ? null
        : Number(businessForm.priceMin),
      priceMax: businessForm.priceMax.trim() === ""
        ? null
        : Number(businessForm.priceMax),
    };
  }

  function validateBusinessPrices() {
    const { priceMin, priceMax } = getBusinessFormPrices();

    if (
      priceMin !== null &&
      (!Number.isSafeInteger(priceMin) || priceMin < 0)
    ) {
      setError("Minimum price must be a valid whole number.");
      return false;
    }

    if (
      priceMax !== null &&
      (!Number.isSafeInteger(priceMax) || priceMax < 0)
    ) {
      setError("Maximum price must be a valid whole number.");
      return false;
    }

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin > priceMax
    ) {
      setError("Minimum price cannot be greater than maximum price.");
      return false;
    }

    return true;
  }

  function validateBusinessLocation() {
    if (!businessForm.area.trim()) {
      setError("Business area is required.");
      return false;
    }

    if (!businessForm.street.trim()) {
      setError("Street, road, or close is required.");
      return false;
    }

    return true;
  }

  function buildBusinessLocationPayload() {
    return {
      area: businessForm.area.trim(),
      houseNumber: businessForm.houseNumber.trim(),
      street: businessForm.street.trim(),
      city: businessForm.city.trim(),
    };
  }

  function startEditingBusiness() {
    if (!business) return;

    clearFeedback();
    setBusinessForm(getInitialBusinessForm(business));
    setSocialValues(getSocialValues(business.socialLinks, business.phone));
    setCategoryChanged(false);
    setEditingBusiness(true);
  }

  function cancelEditingBusiness() {
    if (!business || savingBusiness) return;

    setBusinessForm(getInitialBusinessForm(business));
    setSocialValues(getSocialValues(business.socialLinks, business.phone));
    setCategoryChanged(false);
    setEditingBusiness(false);
    clearFeedback();
  }

  function applyBusinessToForm(updated: SellerBusiness) {
    setBusiness(updated);
    setBusinessForm(getInitialBusinessForm(updated));
    setSocialValues(getSocialValues(updated.socialLinks, updated.phone));
  }

  /* ------------------------------------------------------------------------ */
  /* CREATE BUSINESS                                                          */
  /* ------------------------------------------------------------------------ */

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingBusiness) return;

    clearFeedback();

    if (!businessForm.name.trim()) {
      setError("Business name is required.");
      return;
    }

    if (!validateBusinessLocation() || !validateBusinessPrices()) return;

    setSavingBusiness(true);

    try {
      const response = await fetch("/api/seller/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessForm.name.trim(),
          ownerName: businessForm.ownerName.trim(),
          description: businessForm.description.trim(),
          ...buildBusinessLocationPayload(),
          socialLinks: buildSocialLinks(socialValues),
          categoryIds: businessForm.categoryId
            ? [businessForm.categoryId]
            : [],
          availability: businessForm.availability,
          ...getBusinessFormPrices(),
          showContactInfo: businessForm.showContactInfo === true,
        }),
      });

      const data = await readJsonSafely<ApiBusinessResponse>(response);

      if (response.status === 401 || response.status === 403) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(getResponseError(data, "Unable to create your business."));
        return;
      }

      if (!data?.business) {
        setError(
          "The server accepted the request but did not return your business. Refresh the dashboard before trying again.",
        );
        setDashboardLoadFailed(true);
        return;
      }

      applyBusinessToForm(data.business);
      setSuccess("Your business has been created. Next, add your first product.");
      setShowShareOptions(false);
    } catch (createError) {
      console.error("Seller business creation error:", createError);
      setError(
        "We could not confirm the save. Refresh your dashboard before submitting the business again.",
      );
    } finally {
      setSavingBusiness(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* UPDATE BUSINESS                                                          */
  /* ------------------------------------------------------------------------ */

  async function updateBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingBusiness || !business) return;

    clearFeedback();

    if (!businessForm.name.trim()) {
      setError("Business name is required.");
      return;
    }

    if (!validateBusinessLocation() || !validateBusinessPrices()) return;

    setSavingBusiness(true);

    try {
      const body: Record<string, unknown> = {
        name: businessForm.name.trim(),
        ownerName: businessForm.ownerName.trim(),
        description: businessForm.description.trim(),
        ...buildBusinessLocationPayload(),
        socialLinks: buildSocialLinks(socialValues),
        availability: businessForm.availability,
        ...getBusinessFormPrices(),
        showContactInfo: businessForm.showContactInfo === true,
      };

      if (categoryChanged) {
        body.categoryIds = businessForm.categoryId
          ? [businessForm.categoryId]
          : [];
      }

      const response = await fetch("/api/seller/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await readJsonSafely<ApiBusinessResponse>(response);

      if (response.status === 401 || response.status === 403) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(getResponseError(data, "Unable to update your business."));
        return;
      }

      if (!data?.business) {
        setError(
          "The server did not return the updated business. Refresh to verify your changes.",
        );
        return;
      }

      applyBusinessToForm(data.business);
      setCategoryChanged(false);
      setEditingBusiness(false);
      setSuccess("Your business has been updated successfully.");
    } catch (updateError) {
      console.error("Seller business update error:", updateError);
      setError(
        "We could not confirm the update. Refresh your dashboard to verify your changes.",
      );
    } finally {
      setSavingBusiness(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* BUSINESS SHARING                                                         */
  /* ------------------------------------------------------------------------ */

  function getBusinessShareUrl() {
    if (!business || typeof window === "undefined") return "";

    return new URL(
      `/seller/${encodeURIComponent(business.id)}`,
      window.location.origin,
    ).toString();
  }

  function setShareMessage(message: string, isError = false) {
    setShareNotice(message);
    setShareNoticeIsError(isError);
  }

  async function copyBusinessShareLink() {
    if (!business || !canShareBusiness) {
      setShareMessage(
        "Your business must be active and publicly visible before it can be shared.",
        true,
      );
      return;
    }

    const url = getBusinessShareUrl();

    if (!url) {
      setShareMessage("Unable to create the business link.", true);
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(url);
      setShareMessage("Business profile link copied successfully.");
      return;
    } catch {
      // Use the fallback below.
    }

    let textarea: HTMLTextAreaElement | null = null;
    let copied = false;

    try {
      textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";

      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    } finally {
      textarea?.remove();
    }

    setShareMessage(
      copied
        ? "Business profile link copied successfully."
        : "Copying failed. Open your public business page and copy its URL from the address bar.",
      !copied,
    );
  }

  async function shareBusinessFromDevice() {
    if (!business || !canShareBusiness) {
      setShareMessage(
        "Your business must be active and publicly visible before it can be shared.",
        true,
      );
      return;
    }

    const url = getBusinessShareUrl();

    if (!url) {
      setShareMessage("Unable to create the business link.", true);
      return;
    }

    if (typeof navigator.share !== "function") {
      await copyBusinessShareLink();
      return;
    }

    try {
      await navigator.share({
        title: `${business.name} | ReMarket`,
        text: `Discover ${business.name} on ReMarket. Find it nearby.`,
        url,
      });

      setShareNotice("");
      setShareNoticeIsError(false);
    } catch (shareError) {
      if (
        shareError instanceof Error &&
        shareError.name === "AbortError"
      ) {
        return;
      }

      await copyBusinessShareLink();
    }
  }

  function getBusinessShareTarget(platform: BusinessSharePlatform) {
    if (!business || !canShareBusiness) return "";

    const url = getBusinessShareUrl();

    if (!url) return "";

    const encodedUrl = encodeURIComponent(url);
    const message = `Discover ${business.name} on ReMarket. Find it nearby.`;

    switch (platform) {
      case "WHATSAPP":
        return `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`;

      case "FACEBOOK":
        return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

      case "LINKEDIN":
        return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;

      case "X":
        return `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodedUrl}`;
    }
  }

  function openBusinessShareTarget(platform: BusinessSharePlatform) {
    const target = getBusinessShareTarget(platform);

    if (!target) {
      setShareMessage("Unable to create the sharing link.", true);
      return;
    }

    window.open(target, "_blank", "noopener,noreferrer");

    setShareMessage(
      `Continue sharing your business on ${platform}. If the new tab did not open, use Copy profile link instead.`,
    );
  }

  /* ------------------------------------------------------------------------ */
  /* PRODUCT FORM                                                             */
  /* ------------------------------------------------------------------------ */

  function resetProductForm() {
    setProductForm(INITIAL_PRODUCT_FORM);
  }

  function openProductForm() {
    if (reachedProductLimit || creatingProduct || updatingProduct) return;

    clearFeedback();
    setEditingProductId(null);
    resetProductForm();
    setShowProductForm(true);
  }

  function closeProductForm() {
    if (creatingProduct || updatingProduct) return;

    setShowProductForm(false);
    setEditingProductId(null);
    resetProductForm();
    clearFeedback();
  }

  function startEditingProduct(product: SellerProduct) {
    clearFeedback();

    setProductForm({
      name: product.name ?? "",
      description: product.description ?? "",
      categoryId: product.category?.id ?? "",
      price: product.price != null ? String(product.price) : "",
      priceMin: product.priceMin != null ? String(product.priceMin) : "",
      priceMax: product.priceMax != null ? String(product.priceMax) : "",
      availability: product.availability ?? "ASK_SELLER",
      images: product.images?.length
        ? [...product.images]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((image) => image.url)
        : product.imageUrl
          ? [product.imageUrl]
          : [],
    });

    setEditingProductId(product.id);
    setShowProductForm(true);
  }

  function getProductFormPrices() {
    return {
      price: productForm.price.trim() === ""
        ? null
        : Number(productForm.price),
      priceMin: productForm.priceMin.trim() === ""
        ? null
        : Number(productForm.priceMin),
      priceMax: productForm.priceMax.trim() === ""
        ? null
        : Number(productForm.priceMax),
    };
  }

  function validateProductForm() {
    if (!productForm.name.trim()) {
      setError("Product name is required.");
      return false;
    }

    const { price, priceMin, priceMax } = getProductFormPrices();
    const pricingError = validateProductPricing(price, priceMin, priceMax);

    if (pricingError) {
      setError(pricingError);
      return false;
    }

    return true;
  }

  /* ------------------------------------------------------------------------ */
  /* REFRESH BUSINESS                                                         */
  /* ------------------------------------------------------------------------ */

  const reloadBusiness = useCallback(async () => {
    const response = await fetch("/api/seller/business", {
      cache: "no-store",
    });

    if (response.status === 401 || response.status === 403) {
      router.replace("/seller/login");
      throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
      throw new Error("Unable to refresh the dashboard.");
    }

    const data = await readJsonSafely<ApiBusinessResponse>(response);

    if (
      !data ||
      !Object.prototype.hasOwnProperty.call(data, "business")
    ) {
      throw new Error("The seller business response was invalid.");
    }

    const refreshedBusiness = data.business ?? null;

    if (!refreshedBusiness) {
      setProductCapacity({
        maxActiveProducts: MAX_ACTIVE_PRODUCTS,
        baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS,
        referralBonusSlots: 0,
      });

      setBusiness(null);
      return null;
    }

    const productsResponse = await fetch("/api/seller/products", {
      cache: "no-store",
    });

    if (productsResponse.status === 401 || productsResponse.status === 403) {
      router.replace("/seller/login");
      throw new Error("Your session has expired. Please sign in again.");
    }

    if (!productsResponse.ok) {
      throw new Error("Unable to refresh product capacity.");
    }

    const refreshedCapacity = parseProductCapacity(
      await readJsonSafely<ApiSellerProductsResponse>(productsResponse),
    );

    if (!refreshedCapacity) {
      throw new Error("The seller product-capacity response was invalid.");
    }

    setBusiness(refreshedBusiness);
    setBusinessForm(getInitialBusinessForm(refreshedBusiness));
    setSocialValues(
      getSocialValues(refreshedBusiness.socialLinks, refreshedBusiness.phone),
    );
    setProductCapacity(refreshedCapacity);

    return refreshedBusiness;
  }, [router]);

  /* ------------------------------------------------------------------------ */
  /* CREATE PRODUCT                                                           */
  /* ------------------------------------------------------------------------ */

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (creatingProduct || !business || reachedProductLimit) return;

    clearFeedback();

    if (!validateProductForm()) return;

    setCreatingProduct(true);

    try {
      const response = await fetch("/api/seller/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name.trim(),
          description: productForm.description.trim(),
          categoryId: productForm.categoryId || null,
          ...getProductFormPrices(),
          availability: productForm.availability,
          images: productForm.images,
        }),
      });

      const data = await readJsonSafely<ApiErrorResponse>(response);

      if (response.status === 401 || response.status === 403) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(getResponseError(data, "Unable to create product."));
        return;
      }

      setShowProductForm(false);
      setEditingProductId(null);
      resetProductForm();

      try {
        await reloadBusiness();
        setSuccess("Product added successfully. Add another product or share your business.");
      } catch (refreshError) {
        console.error("Product was created but dashboard refresh failed:", refreshError);
        setSuccess(
          "Product saved successfully, but the dashboard could not refresh. Reload the page to see the latest product.",
        );
      }
    } catch (productError) {
      console.error("Seller product creation error:", productError);
      setError(
        "We could not confirm the product save. Refresh your dashboard before submitting it again.",
      );
    } finally {
      setCreatingProduct(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* UPDATE PRODUCT                                                           */
  /* ------------------------------------------------------------------------ */

  async function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (updatingProduct || !editingProductId) return;

    clearFeedback();

    if (!validateProductForm()) return;

    setUpdatingProduct(true);

    try {
      const response = await fetch(
        `/api/seller/products/${encodeURIComponent(editingProductId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: productForm.name.trim(),
            description: productForm.description.trim(),
            categoryId: productForm.categoryId || null,
            ...getProductFormPrices(),
            availability: productForm.availability,
            images: productForm.images,
          }),
        },
      );

      const data = await readJsonSafely<ApiErrorResponse>(response);

      if (response.status === 401 || response.status === 403) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(getResponseError(data, "Unable to update product."));
        return;
      }

      setShowProductForm(false);
      setEditingProductId(null);
      resetProductForm();

      try {
        await reloadBusiness();
        setSuccess("Product updated successfully.");
      } catch (refreshError) {
        console.error("Product updated but dashboard refresh failed:", refreshError);
        setSuccess(
          "Product updated, but the dashboard could not refresh. Reload the page to verify the change.",
        );
      }
    } catch (productError) {
      console.error("Seller product update error:", productError);
      setError(
        "We could not confirm the product update. Refresh your dashboard to verify the change.",
      );
    } finally {
      setUpdatingProduct(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* DELETE PRODUCT                                                           */
  /* ------------------------------------------------------------------------ */

  async function deleteProduct(product: SellerProduct) {
    if (
      deletingProductId ||
      !window.confirm(`Delete “${product.name}” from your active products?`)
    ) {
      return;
    }

    clearFeedback();
    setDeletingProductId(product.id);

    try {
      const response = await fetch(
        `/api/seller/products/${encodeURIComponent(product.id)}`,
        { method: "DELETE" },
      );

      const data = await readJsonSafely<ApiErrorResponse>(response);

      if (response.status === 401 || response.status === 403) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(getResponseError(data, "Unable to delete product."));
        return;
      }

      if (editingProductId === product.id) {
        resetProductForm();
        setEditingProductId(null);
        setShowProductForm(false);
      }

      try {
        await reloadBusiness();
        setSuccess("Product deleted successfully.");
      } catch (refreshError) {
        console.error("Product deleted but dashboard refresh failed:", refreshError);
        setSuccess(
          "Product deleted successfully, but the dashboard could not refresh. Reload the page to confirm the latest list.",
        );
      }
    } catch (deleteError) {
      console.error("Seller product deletion error:", deleteError);
      setError(
        "We could not confirm the deletion. Refresh your dashboard before trying again.",
      );
    } finally {
      setDeletingProductId(null);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* BUSINESS DELETION REQUEST                                                */
  /* ------------------------------------------------------------------------ */

  function openDeletionForm() {
    clearFeedback();
    setDeletionReason("");
    setShowDeletionForm(true);
  }

  function closeDeletionForm() {
    if (submittingDeletionRequest) return;

    setDeletionReason("");
    setShowDeletionForm(false);
    setError("");
  }

  async function submitDeletionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingDeletionRequest || !business) return;

    clearFeedback();
    setSubmittingDeletionRequest(true);

    try {
      const response = await fetch("/api/seller/business/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: deletionReason.trim(),
        }),
      });

      const data = await readJsonSafely<ApiDeletionResponse>(response);

      if (response.status === 401 || response.status === 403) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(getResponseError(data, "Unable to submit deletion request."));
        return;
      }

      setDeletionRequest(data?.request ?? null);
      setDeletionReason("");
      setShowDeletionForm(false);
      setSuccess(
        "Your business deletion request has been submitted for admin review. Your business is not deleted immediately.",
      );
    } catch (requestError) {
      console.error("Seller deletion request error:", requestError);
      setError(
        "We could not confirm your deletion request. Refresh the dashboard before submitting it again.",
      );
    } finally {
      setSubmittingDeletionRequest(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* ACCOUNT ACTIONS                                                          */
  /* ------------------------------------------------------------------------ */

  async function logout() {
    await signOut({
      callbackUrl: "/seller/login",
    });
  }

  function handleNextAction() {
    clearFeedback();

    if (!business) {
      document.getElementById("business-create-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      document.getElementById("create-business-name")?.focus({
        preventScroll: true,
      });

      return;
    }

    if (dashboardProducts.length === 0) {
      openProductForm();

      document.getElementById("products-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      return;
    }

    if (!profileIsComplete) {
      startEditingBusiness();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (canShareBusiness) {
      setShowShareOptions(true);
      setShareNotice("");
      setShareNoticeIsError(false);
    }

    document.getElementById("business-overview")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  /* ------------------------------------------------------------------------ */
  /* LOADING AND ERROR STATES                                                 */
  /* ------------------------------------------------------------------------ */

  if (loading || redirecting) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#FFFDFC] px-4">
        <div className="flex items-center gap-3 text-sm font-medium text-gray-600">
          <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
          {redirecting
            ? "Redirecting to login..."
            : "Loading seller dashboard..."}
        </div>
      </main>
    );
  }

  if (dashboardLoadFailed) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#FFFDFC] px-4 py-8">
        <section className="w-full max-w-[480px] rounded-[22px] border border-[#E8E4DE] bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF0EE] text-[#E33B22]">
            <AlertCircle className="h-6 w-6" />
          </div>

          <h1 className="mt-4 text-xl font-bold text-[#17202A]">
            Unable to load your dashboard
          </h1>

          <p role="alert" className="mt-2 text-sm leading-6 text-gray-500">
            {error || "Your business information could not be loaded."}
          </p>

          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className={`${primaryButtonClass} mt-5`}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* DASHBOARD UI                                                             */
  /* ------------------------------------------------------------------------ */

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#FFFDFC] text-[#17202A]">
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex min-h-[66px] w-full items-center justify-between gap-3 border-b border-[#EAE6DF] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <Link
          href="/seller"
          className="flex shrink-0 items-center gap-2.5"
          aria-label="ReMarket Seller Portal home"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
            <Store className="h-5 w-5" />
          </span>

          <span>
            <span className="block text-sm font-bold tracking-tight">
              ReMarket
            </span>
            <span className="block text-[10px] leading-none text-gray-400">
              Seller Portal
            </span>
          </span>
        </Link>

        {/* DESKTOP SELLER NAVIGATION */}
        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Seller navigation"
        >
          <Link
            href="/seller"
            className="inline-flex items-center gap-2 rounded-xl bg-[#FFF0E9] px-3 py-2.5 text-xs font-bold text-[#FF5A36]"
          >
            <Store className="h-4 w-4" />
            Dashboard
          </Link>

          {business && (
            <>
              <a
                href="#services-section"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
              >
                <BriefcaseBusiness className="h-4 w-4" />
                Services
              </a>

              <a
                href="#service-bookings"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
              >
                <CalendarDays className="h-4 w-4" />
                Bookings
              </a>

              <a
                href="#products-section"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
              >
                <Package className="h-4 w-4" />
                Products
              </a>
            </>
          )}
        </nav>

        {/* HEADER ACTIONS */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative z-[100] shrink-0">
            <NotificationBell />
          </div>

          {/* DESKTOP ACCOUNT MENU */}
          <details className="group relative hidden sm:block">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs font-bold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] [&::-webkit-details-marker]:hidden">
              <UserRound className="h-4 w-4" />
              <span>Account</span>
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>

            <div className="absolute right-0 top-full z-[120] mt-2 w-64 overflow-hidden rounded-2xl border border-[#E8E4DE] bg-white p-2 shadow-[0_18px_45px_rgba(23,32,42,0.16)]">
              <div className="border-b border-[#F0ECE6] px-3 py-3">
                <p className="text-xs font-bold text-[#17202A]">
                  Your ReMarket account
                </p>
                <p className="mt-1 text-[10px] leading-4 text-gray-400">
                  Manage your buyer and seller activities.
                </p>
              </div>

              <div className="grid gap-1 py-2">
                <Link
                  href="/account"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <UserRound className="h-4 w-4 text-gray-400" />
                  Account overview
                </Link>

                <Link
                  href="/saved"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <Bookmark className="h-4 w-4 text-gray-400" />
                  Saved items
                </Link>

                <Link
                  href="/seller/profile"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <Store className="h-4 w-4 text-gray-400" />
                  Seller profile
                </Link>

                <Link
                  href="/seller/claims"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <ShieldCheck className="h-4 w-4 text-gray-400" />
                  Business claims
                </Link>

                {business && (
                  <>
                    <a
                      href="#services-section"
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                    >
                      <BriefcaseBusiness className="h-4 w-4 text-gray-400" />
                      Manage services
                    </a>

                    <a
                      href="#service-bookings"
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                    >
                      <CalendarDays className="h-4 w-4 text-gray-400" />
                      Service booking requests
                    </a>

                    <a
                      href="#products-section"
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                    >
                      <Package className="h-4 w-4 text-gray-400" />
                      Manage products
                    </a>
                  </>
                )}
              </div>

              <div className="border-t border-[#F0ECE6] pt-2">
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[#C5402D] hover:bg-[#FFF0EE]"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          </details>

          <button
            type="button"
            onClick={logout}
            className={`${secondaryButtonClass} hidden !px-3 md:inline-flex`}
          >
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </button>

          {/* MOBILE MENU BUTTON */}
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E4DE] text-gray-600 sm:hidden"
          >
            <span className="text-lg leading-none">
              {mobileNavOpen ? "×" : "☰"}
            </span>
          </button>
        </div>

        {/* MOBILE SELLER AND ACCOUNT NAVIGATION */}
        {mobileNavOpen && (
          <nav
            className="absolute left-0 right-0 top-full z-[110] grid gap-1 border-b border-[#EAE6DF] bg-white p-3 shadow-lg sm:hidden"
            aria-label="Mobile account and seller navigation"
          >
            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Seller workspace
            </p>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/seller"
              className="rounded-xl bg-[#FFF0E9] px-4 py-3 text-sm font-bold text-[#FF5A36]"
            >
              Dashboard
            </Link>

            {business && (
              <>
                <a
                  onClick={() => setMobileNavOpen(false)}
                  href="#services-section"
                  className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
                >
                  Manage services
                </a>

                <a
                  onClick={() => setMobileNavOpen(false)}
                  href="#service-bookings"
                  className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
                >
                  Booking requests
                </a>

                <a
                  onClick={() => setMobileNavOpen(false)}
                  href="#products-section"
                  className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
                >
                  Manage products
                </a>
              </>
            )}

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/seller/profile"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Seller profile
            </Link>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/seller/claims"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Business claims
            </Link>

            <div className="my-1 border-t border-[#F0ECE6]" />

            <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Your account
            </p>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/account"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Account overview
            </Link>

            <Link
              onClick={() => setMobileNavOpen(false)}
              href="/saved"
              className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]"
            >
              Saved items
            </Link>

            <div className="my-1 border-t border-[#F0ECE6]" />

            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-bold text-[#C5402D] hover:bg-[#FFF0EE]"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </nav>
        )}
      </header>

      {/* DASHBOARD CONTENT */}
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
        <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
              Seller Dashboard
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
              Manage your business
            </h1>

            <p className="mt-2 max-w-[700px] text-sm leading-6 text-gray-500">
              Keep your details up to date, add products and services, and help nearby customers discover what you offer.
            </p>
          </div>

          {business && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${getStatusClasses(business.status)}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {business.status}
              </span>

              {business.verification === "VERIFIED" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F0FF] px-3 py-1.5 text-[11px] font-bold text-[#3566B8]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </span>
              )}

              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${business.showContactInfo === true ? "bg-[#DDF5EA] text-[#137A59]" : "bg-[#FFF0EE] text-[#9F2D18]"}`}>
                {business.showContactInfo === true
                  ? <Globe className="h-3.5 w-3.5" />
                  : <LockKeyhole className="h-3.5 w-3.5" />}
                Contact: {business.showContactInfo === true ? "Public" : "Private"}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-[#FFB8B0] bg-[#FFF0EE] px-4 py-4"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#E33B22]" />
            <p className="text-sm text-[#C5402D]">{error}</p>
          </div>
        )}

        {success && (
          <div
            role="status"
            aria-live="polite"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-4"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#137A59]" />
            <p className="text-sm text-[#137A59]">{success}</p>
          </div>
        )}

        {/* ONBOARDING */}
        <section className="mb-6 overflow-hidden rounded-[24px] border border-[#F1D4C8] bg-gradient-to-br from-[#FFF5EF] via-white to-[#FCFAF6] shadow-sm">
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-center lg:p-7">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FF5A36] text-white shadow-sm">
                <ClipboardCheck className="h-6 w-6" />
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#B94128]">
                  Your next step
                </p>

                <h2 className="mt-1 text-lg font-bold sm:text-xl">
                  {nextAction.title}
                </h2>

                <p className="mt-1 max-w-[600px] text-sm leading-6 text-gray-600">
                  {nextAction.description}
                </p>

                <button
                  type="button"
                  onClick={handleNextAction}
                  className={`${primaryButtonClass} mt-4 min-h-11 px-5`}
                >
                  {nextAction.label}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/90 bg-white/85 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold">Getting started</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    A quick guide to a useful seller profile
                  </p>
                </div>

                <span className="text-sm font-bold text-[#9F2D18]">
                  {completedSteps}/4
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F0E5DF]">
                <div
                  className="h-full rounded-full bg-[#FF5A36] transition-all duration-300"
                  style={{
                    width: `${(completedSteps / onboardingSteps.length) * 100}%`,
                  }}
                />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {onboardingSteps.map((step) => (
                  <div key={step.label} className="flex min-w-0 items-start gap-2 text-xs">
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-[#DDF5EA] text-[#137A59]" : "border border-[#D9DEE5] text-gray-300"}`}>
                      {step.done
                        ? <CheckCircle2 className="h-3.5 w-3.5" />
                        : <Circle className="h-2.5 w-2.5" />}
                    </span>

                    <span className={step.done
                      ? "text-gray-500 line-through decoration-gray-300"
                      : "font-medium text-gray-700"}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CREATE BUSINESS */}
        {!business && (
          <section
            id="business-create-form"
            className="scroll-mt-24 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm"
          >
            <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                  <Plus className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="text-lg font-bold">Add your business</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Start with the essential details. You can update the rest later.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={createBusiness} className="space-y-6 px-5 py-6 sm:px-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="create-business-name" className={labelClass}>
                    Business name <span className="text-[#FF5A36]">*</span>
                  </label>

                  <input
                    id="create-business-name"
                    className={inputClass}
                    value={businessForm.name}
                    onChange={(event) => updateBusinessField("name", event.target.value)}
                    maxLength={150}
                    placeholder="Your business name"
                    required
                    disabled={savingBusiness}
                  />
                </div>

                <div>
                  <label htmlFor="create-category" className={labelClass}>
                    Category
                  </label>

                  <select
                    id="create-category"
                    className={inputClass}
                    value={businessForm.categoryId}
                    onChange={(event) => updateBusinessField("categoryId", event.target.value)}
                    disabled={savingBusiness}
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <details className="group rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4" open>
                <summary className="cursor-pointer list-none text-sm font-bold">
                  <span className="flex items-center justify-between gap-3">
                    Location details
                    <span className="text-[11px] font-medium text-gray-400">
                      Area and street are required
                      <ArrowRight className="inline h-4 w-4 rotate-90" />
                    </span>
                  </span>
                </summary>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="create-area" className={labelClass}>
                      Area <span className="text-[#FF5A36]">*</span>
                    </label>

                    <AreaCombobox
                      id="create-area"
                      value={businessForm.area}
                      onChange={(value) => updateBusinessField("area", value)}
                      placeholder="Type or choose a Lagos area"
                      required
                      disabled={savingBusiness}
                    />

                    <p className="mt-1.5 text-[10px] leading-4 text-gray-500">
                      Browse areas by LGA, filter suggestions or enter a custom area.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="create-city" className={labelClass}>City</label>
                    <input
                      id="create-city"
                      className={inputClass}
                      value={businessForm.city}
                      onChange={(event) => updateBusinessField("city", event.target.value)}
                      placeholder="e.g. Lagos or Epe"
                      maxLength={100}
                      disabled={savingBusiness}
                    />
                  </div>

                  <div>
                    <label htmlFor="create-house-number" className={labelClass}>
                      House / shop number
                    </label>
                    <input
                      id="create-house-number"
                      className={inputClass}
                      value={businessForm.houseNumber}
                      onChange={(event) => updateBusinessField("houseNumber", event.target.value)}
                      placeholder="e.g. 12 or Shop 4"
                      maxLength={100}
                      disabled={savingBusiness}
                    />
                  </div>

                  <div>
                    <label htmlFor="create-street" className={labelClass}>
                      Street / road / close <span className="text-[#FF5A36]">*</span>
                    </label>
                    <input
                      id="create-street"
                      className={inputClass}
                      value={businessForm.street}
                      onChange={(event) => updateBusinessField("street", event.target.value)}
                      placeholder="e.g. Agidingbi Road"
                      maxLength={200}
                      required
                      disabled={savingBusiness}
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-[#E8E4DE] bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                    Address preview
                  </p>
                  <p className="mt-1 break-words text-xs leading-5 text-gray-600">
                    {buildLocationAddressPreview(
                      businessForm.area,
                      businessForm.houseNumber,
                      businessForm.street,
                      businessForm.city,
                    )}
                  </p>
                </div>
              </details>

              <details className="rounded-2xl border border-[#E8E4DE] p-4" open>
                <summary className="cursor-pointer list-none text-sm font-bold">
                  Optional profile details
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    Description, owner and contact links
                  </span>
                </summary>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="create-owner-name" className={labelClass}>
                      Owner name
                    </label>
                    <input
                      id="create-owner-name"
                      className={inputClass}
                      value={businessForm.ownerName}
                      onChange={(event) => updateBusinessField("ownerName", event.target.value)}
                      maxLength={100}
                      placeholder="Your name"
                      disabled={savingBusiness}
                    />
                  </div>

                  <div>
                    <label htmlFor="create-availability" className={labelClass}>
                      Availability
                    </label>
                    <select
                      id="create-availability"
                      className={inputClass}
                      value={businessForm.availability}
                      onChange={(event) => updateBusinessField("availability", event.target.value as Availability)}
                      disabled={savingBusiness}
                    >
                      <option value="ASK_SELLER">Ask seller</option>
                      <option value="AVAILABLE">Available</option>
                      <option value="UNAVAILABLE">Unavailable</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="create-description" className={labelClass}>
                      Business description
                    </label>
                    <textarea
                      id="create-description"
                      className="w-full resize-y rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm outline-none focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                      value={businessForm.description}
                      onChange={(event) => updateBusinessField("description", event.target.value)}
                      placeholder="Tell customers what your business offers"
                      rows={3}
                      maxLength={2000}
                      disabled={savingBusiness}
                    />
                  </div>

                  <ContactVisibility
                    id="create-show-contact"
                    value={businessForm.showContactInfo}
                    onChange={(value) => updateBusinessField("showContactInfo", value)}
                    disabled={savingBusiness}
                  />

                  {SOCIAL_PLATFORMS.map(({ value, label }) => (
                    <div key={value}>
                      <label htmlFor={`create-social-${value.toLowerCase()}`} className={labelClass}>
                        {label}
                      </label>
                      <input
                        id={`create-social-${value.toLowerCase()}`}
                        className={inputClass}
                        type={value === "PHONE" ? "tel" : "text"}
                        value={socialValues[value]}
                        onChange={(event) => updateSocial(value, event.target.value)}
                        placeholder={
                          value === "PHONE" || value === "WHATSAPP"
                            ? "080..."
                            : value === "DIRECTIONS"
                              ? "https://maps.google.com/..."
                              : "@username or URL"
                        }
                        disabled={savingBusiness}
                      />
                    </div>
                  ))}
                </div>
              </details>

              <details className="rounded-2xl border border-[#E8E4DE] p-4">
                <summary className="cursor-pointer list-none text-sm font-bold">
                  Optional price range
                  <span className="ml-1 text-xs font-normal text-gray-400">
                    For businesses that quote prices
                  </span>
                </summary>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {(["priceMin", "priceMax"] as const).map((field) => (
                    <div key={field}>
                      <label htmlFor={`create-${field}`} className={labelClass}>
                        {field === "priceMin" ? "Minimum" : "Maximum"} price (₦)
                      </label>
                      <input
                        id={`create-${field}`}
                        className={inputClass}
                        type="number"
                        min="0"
                        step="1"
                        value={businessForm[field]}
                        onChange={(event) => updateBusinessField(field, event.target.value)}
                        placeholder="Leave empty if not applicable"
                        disabled={savingBusiness}
                      />
                    </div>
                  ))}
                </div>
              </details>

              <div className="flex flex-col gap-3 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-gray-500">
                  You can edit these details after creating your profile.
                </p>

                <button
                  type="submit"
                  disabled={savingBusiness}
                  className={`${primaryButtonClass} min-h-12 w-full px-6 text-sm sm:w-auto`}
                >
                  {savingBusiness
                    ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Creating business...</>
                    : <><Plus className="h-4 w-4" /> Create business</>}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* EXISTING BUSINESS DASHBOARD */}
        {business && (
          <>
            {/* BUSINESS OVERVIEW */}
            <section
              id="business-overview"
              className="scroll-mt-24 rounded-[22px] border border-[#E8E4DE] bg-white p-5 shadow-sm sm:p-6 lg:p-7"
            >
              <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EB] text-[#FF5A36]">
                    <Store className="h-7 w-7" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words text-xl font-bold">
                        {business.name}
                      </h2>

                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getStatusClasses(business.status)}`}>
                        {business.status}
                      </span>

                      {business.verification === "VERIFIED" && (
                        <span className="rounded-full bg-[#E7F0FF] px-2.5 py-1 text-[10px] font-bold text-[#3566B8]">
                          Verified
                        </span>
                      )}
                    </div>

                    <p className="mt-1 max-w-3xl break-words text-sm leading-6 text-gray-500">
                      {business.description ||
                        "Add a short description to help customers understand what your business offers."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
                  <button
                    type="button"
                    onClick={startEditingBusiness}
                    className={secondaryButtonClass}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit details
                  </button>

                  <Link
                    href={`/seller/${encodeURIComponent(business.id)}`}
                    className={`${primaryButtonClass} min-h-10`}
                  >
                    Public page
                    <ExternalLink className="h-4 w-4" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setShowShareOptions((value) => !value);
                      setShareNotice("");
                      setShareNoticeIsError(false);
                    }}
                    disabled={!canShareBusiness}
                    aria-expanded={showShareOptions}
                    aria-controls="business-share-options"
                    className={`${secondaryButtonClass} col-span-2 sm:col-span-1`}
                  >
                    <Share2 className="h-4 w-4" />
                    Share business
                  </button>
                </div>
              </div>

              {/* SHARE OPTIONS */}
              {showShareOptions && canShareBusiness && (
                <div
                  id="business-share-options"
                  className="mt-5 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                      <Share2 className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-sm font-bold">Share your business</h3>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Help more customers discover {business.name} on ReMarket.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowShareOptions(false);
                        setShareNotice("");
                      }}
                      aria-label="Close sharing options"
                      className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E8E4DE] bg-white text-gray-500 hover:text-[#9F2D18]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void shareBusinessFromDevice()}
                      className={primaryButtonClass}
                    >
                      <Share2 className="h-4 w-4" />
                      More sharing options
                    </button>

                    <button
                      type="button"
                      onClick={() => void copyBusinessShareLink()}
                      className={secondaryButtonClass}
                    >
                      <Copy className="h-4 w-4" />
                      Copy profile link
                    </button>
                  </div>

                  <div className="mt-4 border-t border-[#E8E4DE] pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                      Share directly
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {([
                        ["WHATSAPP", "WhatsApp"],
                        ["FACEBOOK", "Facebook"],
                        ["LINKEDIN", "LinkedIn"],
                        ["X", "X"],
                      ] as const).map(([platform, label]) => (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => openBusinessShareTarget(platform)}
                          className={secondaryButtonClass}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>

                    <p className="mt-4 break-all text-[11px] leading-5 text-gray-500">
                      Profile link:{" "}
                      <span className="font-medium text-[#9F2D18]">
                        /seller/{business.id}
                      </span>
                    </p>
                  </div>

                  {shareNotice && (
                    <p
                      role={shareNoticeIsError ? "alert" : "status"}
                      aria-live="polite"
                      className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-5 ${
                        shareNoticeIsError
                          ? "border border-[#F1D5D0] bg-[#FFF0EE] text-[#C5402D]"
                          : "border border-[#BDE8D8] bg-[#EFFBF6] text-[#137A59]"
                      }`}
                    >
                      {shareNotice}
                    </p>
                  )}
                </div>
              )}

              {!canShareBusiness && (
                <p className="mt-3 text-xs leading-5 text-gray-500">
                  Sharing becomes available when your business is active and publicly visible.
                </p>
              )}

              {/* BUSINESS SUMMARY CARDS */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <OverviewCard
                  icon={<MapPin className="h-4 w-4" />}
                  title="Business address"
                  value={business.location?.area || "Not set"}
                  detail={
                    business.location?.address ||
                    "Add your street address to help customers find you."
                  }
                />

                <OverviewCard
                  icon={<Phone className="h-4 w-4" />}
                  title="Phone"
                  value={
                    business.phone ||
                    getSocialValue(business.socialLinks, "PHONE") ||
                    "Not set"
                  }
                />

                <OverviewCard
                  icon={<Package className="h-4 w-4" />}
                  title="Active products"
                  value={`${activeProductCount}/${productCapacity.maxActiveProducts}`}
                  detail={`${remainingProductSlots} slots remaining`}
                />

                <OverviewCard
                  icon={<Store className="h-4 w-4" />}
                  title="Availability"
                  value={formatAvailability(business.availability)}
                />
              </div>

              {/* CATEGORIES */}
              {business.categories.length > 0 && (
                <div className="mt-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Categories
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {business.categories.map(({ category }) => (
                      <span
                        key={category.id}
                        className="rounded-full border border-[#E8E4DE] bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
                      >
                        {category.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* CONTACT VISIBILITY */}
              <div className="mt-5 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    {business.showContactInfo === true
                      ? <Globe className="mt-0.5 h-5 w-5 shrink-0 text-[#137A59]" />
                      : <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" />}

                    <div>
                      <h3 className="text-sm font-bold">
                        Contact information visibility
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {business.showContactInfo === true
                          ? "Your contact links are set to public visibility."
                          : "Your contact links are private and should not be shown to public visitors."}
                      </p>
                    </div>
                  </div>

                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold ${
                    business.showContactInfo === true
                      ? "bg-[#DDF5EA] text-[#137A59]"
                      : "bg-[#FFF0EE] text-[#9F2D18]"
                  }`}>
                    {business.showContactInfo === true ? "PUBLIC" : "PRIVATE"}
                  </span>
                </div>
              </div>

              {/* CONTACT AND SOCIAL LINKS */}
              <div className="mt-5 border-t border-[#EAE6DF] pt-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Contact & social links
                </p>

                {business.socialLinks.length > 0 ? (
                  <>
                    <p className="mt-1 text-[11px] text-gray-400">
                      These are your saved contact details. Public visitors should only receive them when visibility is enabled.
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {business.socialLinks.map((link) => (
                        <div
                          key={link.id}
                          className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4"
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            {SOCIAL_PLATFORMS.find(
                              (platform) => platform.value === link.platform,
                            )?.label ?? link.platform}
                          </p>

                          <p className="mt-2 break-words text-sm font-semibold text-gray-800">
                            {link.handle}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    No contact or social links have been added yet.
                  </p>
                )}
              </div>

              {/* BUSINESS DELETION */}
              <div className="mt-6 border-t border-[#EAE6DF] pt-5">
                <div className="rounded-2xl border border-[#F1D5D0] bg-[#FFF9F7] p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EE] text-[#C5402D]">
                        <AlertTriangle className="h-5 w-5" />
                      </div>

                      <div>
                        <h3 className="text-sm font-bold">Business deletion</h3>
                        <p className="mt-1 max-w-[650px] text-xs leading-5 text-gray-500">
                          Deletion requires admin approval. Submitting a request does not remove your business immediately.
                        </p>
                      </div>
                    </div>

                    {deletionRequest && (
                      <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${getStatusClasses(deletionRequest.status)}`}>
                        {deletionRequest.status}
                      </span>
                    )}
                  </div>

                  {deletionRequest?.status === "PENDING" && (
                    <p className="mt-3 text-xs text-[#9A6700]">
                      Your request is waiting for admin review.
                    </p>
                  )}

                  {deletionRequest?.status === "APPROVED" && (
                    <p className="mt-3 text-xs text-[#3566B8]">
                      Your deletion request was approved by an admin.
                    </p>
                  )}

                  {deletionRequest?.status === "REJECTED" && (
                    <p className="mt-3 text-xs text-[#C5402D]">
                      Your previous request was rejected. You may submit a new request.
                    </p>
                  )}

                  {(!deletionRequest || deletionRequest.status === "REJECTED") && (
                    <button
                      type="button"
                      onClick={openDeletionForm}
                      className={`${secondaryButtonClass} mt-4 !border-[#E5B9B1] !text-[#C5402D]`}
                    >
                      <Trash2 className="h-4 w-4" />
                      Request business deletion
                    </button>
                  )}

                  {showDeletionForm && (
                    <form
                      onSubmit={submitDeletionRequest}
                      className="mt-4 rounded-2xl border border-[#F0CEC8] bg-white p-4"
                    >
                      <h4 className="text-sm font-bold">
                        Request business deletion
                      </h4>

                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Tell the admin why you want this business removed.
                      </p>

                      <label htmlFor="deletion-reason" className={`${labelClass} mt-4`}>
                        Reason (optional)
                      </label>

                      <textarea
                        id="deletion-reason"
                        className="w-full resize-none rounded-xl border border-[#D9DEE5] px-4 py-3 text-sm outline-none focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                        value={deletionReason}
                        onChange={(event) => setDeletionReason(event.target.value)}
                        rows={4}
                        maxLength={1000}
                        placeholder="Optional reason for your request"
                        disabled={submittingDeletionRequest}
                      />

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={closeDeletionForm}
                          disabled={submittingDeletionRequest}
                          className={secondaryButtonClass}
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </button>

                        <button
                          type="submit"
                          disabled={submittingDeletionRequest}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C5402D] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {submittingDeletionRequest
                            ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Submitting...</>
                            : <><Trash2 className="h-4 w-4" /> Submit request</>}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </section>

            {/* SERVICE MANAGEMENT */}
            <SellerServiceManager categories={categories} />

            {/* SERVICE BOOKING INBOX */}
            <SellerBookingInbox />

            {/* EDIT BUSINESS */}
            {editingBusiness && (
              <section className="mt-5 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-[#EAE6DF] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
                      Business settings
                    </p>
                    <h2 className="mt-1 text-lg font-bold">Edit your business</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Update the information customers see on ReMarket.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={cancelEditingBusiness}
                    disabled={savingBusiness}
                    className={secondaryButtonClass}
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>

                <form onSubmit={updateBusiness} className="space-y-5 px-5 py-6 sm:px-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="edit-business-name" className={labelClass}>
                        Business name
                      </label>
                      <input
                        id="edit-business-name"
                        className={inputClass}
                        value={businessForm.name}
                        onChange={(event) => updateBusinessField("name", event.target.value)}
                        maxLength={150}
                        required
                        disabled={savingBusiness}
                      />
                    </div>

                    <div>
                      <label htmlFor="edit-owner-name" className={labelClass}>
                        Owner name
                      </label>
                      <input
                        id="edit-owner-name"
                        className={inputClass}
                        value={businessForm.ownerName}
                        onChange={(event) => updateBusinessField("ownerName", event.target.value)}
                        maxLength={100}
                        disabled={savingBusiness}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="edit-description" className={labelClass}>
                      Description
                    </label>
                    <textarea
                      id="edit-description"
                      className="w-full resize-y rounded-xl border border-[#D9DEE5] px-4 py-3 text-sm outline-none focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                      value={businessForm.description}
                      onChange={(event) => updateBusinessField("description", event.target.value)}
                      rows={3}
                      maxLength={2000}
                      disabled={savingBusiness}
                    />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="edit-area" className={labelClass}>
                        Business area
                      </label>

                      <AreaCombobox
                        id="edit-area"
                        value={businessForm.area}
                        onChange={(value) => updateBusinessField("area", value)}
                        placeholder="Type or choose a Lagos area"
                        required
                        disabled={savingBusiness}
                      />

                      <p className="mt-1.5 text-[10px] leading-4 text-gray-500">
                        Browse areas by LGA or type to filter the list.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="edit-city" className={labelClass}>City</label>
                      <input
                        id="edit-city"
                        className={inputClass}
                        value={businessForm.city}
                        onChange={(event) => updateBusinessField("city", event.target.value)}
                        placeholder="Lagos or Epe"
                        maxLength={100}
                        disabled={savingBusiness}
                      />
                    </div>

                    <div>
                      <label htmlFor="edit-house-number" className={labelClass}>
                        House / shop number
                      </label>
                      <input
                        id="edit-house-number"
                        className={inputClass}
                        value={businessForm.houseNumber}
                        onChange={(event) => updateBusinessField("houseNumber", event.target.value)}
                        placeholder="e.g. 12 or Shop 4"
                        maxLength={100}
                        disabled={savingBusiness}
                      />
                    </div>

                    <div>
                      <label htmlFor="edit-street" className={labelClass}>
                        Street / road / close
                      </label>
                      <input
                        id="edit-street"
                        className={inputClass}
                        value={businessForm.street}
                        onChange={(event) => updateBusinessField("street", event.target.value)}
                        placeholder="e.g. Agidingbi Road"
                        maxLength={200}
                        required
                        disabled={savingBusiness}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#FF5A36]" />

                      <div>
                        <p className="text-xs font-bold">Address preview</p>
                        <p className="mt-2 break-words text-xs leading-5 text-gray-600">
                          {buildLocationAddressPreview(
                            businessForm.area,
                            businessForm.houseNumber,
                            businessForm.street,
                            businessForm.city,
                          )}
                        </p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          Country: Nigeria
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                    <p className="text-xs font-bold">Contact & social links</p>
                    <p className="mt-1 text-[10px] leading-5 text-gray-500">
                      Add useful ways for customers to reach your business.
                    </p>

                    <ContactVisibility
                      id="edit-show-contact"
                      value={businessForm.showContactInfo}
                      onChange={(value) => updateBusinessField("showContactInfo", value)}
                      disabled={savingBusiness}
                    />

                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {SOCIAL_PLATFORMS.map(({ value, label }) => (
                        <div key={value}>
                          <label htmlFor={`edit-social-${value.toLowerCase()}`} className={labelClass}>
                            {label}
                          </label>

                          <input
                            id={`edit-social-${value.toLowerCase()}`}
                            className={inputClass}
                            type={value === "PHONE" ? "tel" : "text"}
                            value={socialValues[value]}
                            onChange={(event) => updateSocial(value, event.target.value)}
                            placeholder={
                              value === "PHONE" || value === "WHATSAPP"
                                ? "080..."
                                : value === "DIRECTIONS"
                                  ? "https://maps.google.com/..."
                                  : "@username or URL"
                            }
                            disabled={savingBusiness}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label htmlFor="edit-category" className={labelClass}>
                        Category
                      </label>

                      <select
                        id="edit-category"
                        className={inputClass}
                        value={businessForm.categoryId}
                        onChange={(event) => {
                          updateBusinessField("categoryId", event.target.value);
                          setCategoryChanged(true);
                        }}
                        disabled={savingBusiness}
                      >
                        <option value="">Select category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="edit-availability" className={labelClass}>
                        Availability
                      </label>

                      <select
                        id="edit-availability"
                        className={inputClass}
                        value={businessForm.availability}
                        onChange={(event) => updateBusinessField("availability", event.target.value as Availability)}
                        disabled={savingBusiness}
                      >
                        <option value="ASK_SELLER">Ask seller</option>
                        <option value="AVAILABLE">Available</option>
                        <option value="UNAVAILABLE">Unavailable</option>
                      </select>
                    </div>

                    {(["priceMin", "priceMax"] as const).map((field) => (
                      <div key={field}>
                        <label htmlFor={`edit-${field}`} className={labelClass}>
                          {field === "priceMin" ? "Minimum" : "Maximum"} price (₦)
                        </label>

                        <input
                          id={`edit-${field}`}
                          type="number"
                          min="0"
                          step="1"
                          className={inputClass}
                          value={businessForm[field]}
                          onChange={(event) => updateBusinessField(field, event.target.value)}
                          disabled={savingBusiness}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end border-t border-[#EAE6DF] pt-5">
                    <button
                      type="submit"
                      disabled={savingBusiness}
                      className={`${primaryButtonClass} min-h-12 w-full px-6 text-sm sm:w-auto`}
                    >
                      {savingBusiness
                        ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Saving...</>
                        : <><CheckCircle2 className="h-4 w-4" /> Save changes</>}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* PRODUCT MANAGEMENT */}
            <section
              id="products-section"
              className="mt-5 scroll-mt-24 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm"
            >
              <div className="border-b border-[#E8E4DE] px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
                      Product management
                    </p>
                    <h2 className="mt-1 text-lg font-bold">Your products</h2>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Add the items customers can discover through your business page.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={showProductForm ? closeProductForm : openProductForm}
                    disabled={(reachedProductLimit && !showProductForm) || editingBusiness}
                    className={`${primaryButtonClass} min-h-11 shrink-0 disabled:bg-gray-200 disabled:text-gray-500`}
                  >
                    {showProductForm
                      ? <><X className="h-4 w-4" /> Close form</>
                      : <><Plus className="h-4 w-4" /> Add product</>}
                  </button>
                </div>

                {/* PRODUCT CAPACITY */}
                <div className="mt-5 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-[#FF5A36]" />
                        <p className="text-xs font-bold">Active product slots</p>
                      </div>

                      <p className="mt-1 text-[11px] text-gray-500">
                        {reachedProductLimit
                          ? "You have reached your active product limit."
                          : `${remainingProductSlots} active ${remainingProductSlots === 1 ? "slot" : "slots"} remaining.`}
                      </p>

                      <p className="mt-1 text-[10px] leading-4 text-gray-400">
                        {productCapacity.baseMaxActiveProducts} base slots
                        {productCapacity.referralBonusSlots > 0
                          ? ` + ${productCapacity.referralBonusSlots} referral bonus ${productCapacity.referralBonusSlots === 1 ? "slot" : "slots"}`
                          : " · No referral bonus slots yet"}
                      </p>
                    </div>

                    <p className={`text-sm font-bold ${reachedProductLimit ? "text-[#C5402D]" : "text-[#9F2D18]"}`}>
                      {activeProductCount}/{productCapacity.maxActiveProducts}
                    </p>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#EAE6DF]">
                    <div
                      className={`h-full rounded-full transition-all ${reachedProductLimit ? "bg-[#C5402D]" : "bg-[#FF5A36]"}`}
                      style={{
                        width: `${Math.min(
                          100,
                          (activeProductCount / Math.max(1, productCapacity.maxActiveProducts)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* PRODUCT FORM */}
              {showProductForm && (
                <form
                  onSubmit={editingProductId ? updateProduct : createProduct}
                  className="space-y-5 border-b border-[#EAE6DF] bg-[#FCFAF6] px-5 py-6 sm:px-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                        {editingProductId
                          ? <Pencil className="h-5 w-5" />
                          : <Plus className="h-5 w-5" />}
                      </div>

                      <div>
                        <h3 className="text-sm font-bold">
                          {editingProductId ? "Edit product" : "Add a product"}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-gray-500">
                          {editingProductId
                            ? "Update the information customers see."
                            : "Add the essentials first. You can add more products after saving."}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={closeProductForm}
                      disabled={creatingProduct || updatingProduct}
                      aria-label="Close product form"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white text-gray-500 hover:text-[#9F2D18] disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="product-name" className={labelClass}>
                        Product name <span className="text-[#FF5A36]">*</span>
                      </label>
                      <input
                        id="product-name"
                        className={inputClass}
                        value={productForm.name}
                        onChange={(event) => updateProductField("name", event.target.value)}
                        placeholder="e.g. Native fabric"
                        maxLength={150}
                        required
                        disabled={creatingProduct || updatingProduct}
                      />
                    </div>

                    <div>
                      <label htmlFor="product-category" className={labelClass}>
                        Category
                      </label>
                      <select
                        id="product-category"
                        className={inputClass}
                        value={productForm.categoryId}
                        onChange={(event) => updateProductField("categoryId", event.target.value)}
                        disabled={creatingProduct || updatingProduct}
                      >
                        <option value="">Select category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="product-description" className={labelClass}>
                      Description <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      id="product-description"
                      className="w-full resize-y rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                      value={productForm.description}
                      onChange={(event) => updateProductField("description", event.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Describe the product"
                      disabled={creatingProduct || updatingProduct}
                    />
                  </div>

                  <div className="grid gap-5 xl:grid-cols-2">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="product-price" className={labelClass}>
                          Exact price (₦)
                        </label>
                        <input
                          id="product-price"
                          className={inputClass}
                          type="number"
                          min="1"
                          step="1"
                          value={productForm.price}
                          onChange={(event) => updateProductField("price", event.target.value)}
                          placeholder="Enter fixed price"
                          disabled={creatingProduct || updatingProduct}
                        />
                        <p className="mt-1 text-[10px] text-gray-400">
                          Enter a fixed price or a minimum price below. A product cannot be saved without pricing.
                        </p>
                      </div>

                      <div>
                        <label htmlFor="product-availability" className={labelClass}>
                          Availability
                        </label>
                        <select
                          id="product-availability"
                          className={inputClass}
                          value={productForm.availability}
                          onChange={(event) => updateProductField("availability", event.target.value as Availability)}
                          disabled={creatingProduct || updatingProduct}
                        >
                          <option value="ASK_SELLER">Ask seller</option>
                          <option value="AVAILABLE">Available</option>
                          <option value="UNAVAILABLE">Unavailable</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="product-price-min" className={labelClass}>
                          Minimum price (₦) — use if no exact price
                        </label>
                        <input
                          id="product-price-min"
                          className={inputClass}
                          type="number"
                          min="1"
                          step="1"
                          value={productForm.priceMin}
                          onChange={(event) => updateProductField("priceMin", event.target.value)}
                          placeholder="Starting price"
                          disabled={creatingProduct || updatingProduct}
                        />
                      </div>

                      <div>
                        <label htmlFor="product-price-max" className={labelClass}>
                          Maximum price (₦)
                        </label>
                        <input
                          id="product-price-max"
                          className={inputClass}
                          type="number"
                          min="1"
                          step="1"
                          value={productForm.priceMax}
                          onChange={(event) => updateProductField("priceMax", event.target.value)}
                          placeholder="Optional upper limit"
                          disabled={creatingProduct || updatingProduct}
                        />
                      </div>
                    </div>

                    <div className="min-w-0 rounded-2xl border border-[#E8E4DE] bg-white p-4">
                      <p className="text-xs font-bold">Product images</p>
                      <p className="mt-1 text-[10px] leading-4 text-gray-500">
                        The first image becomes the cover image.
                      </p>

                      <div className="mt-3 min-w-0">
                        <ProductImageUpload
                          value={productForm.images}
                          onChange={(images) => updateProductField("images", images)}
                          disabled={creatingProduct || updatingProduct}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 border-t border-[#E5E0D8] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-gray-500">
                      {editingProductId
                        ? "Changes update this existing product."
                        : `${remainingProductSlots} active ${remainingProductSlots === 1 ? "slot" : "slots"} remaining.`}
                    </p>

                    <button
                      type="submit"
                      disabled={creatingProduct || updatingProduct}
                      className={`${primaryButtonClass} min-h-12 w-full px-6 text-sm sm:w-auto`}
                    >
                      {creatingProduct || updatingProduct
                        ? <><LoaderCircle className="h-4 w-4 animate-spin" /> {editingProductId ? "Saving..." : "Adding..."}</>
                        : <>{editingProductId
                            ? <CheckCircle2 className="h-4 w-4" />
                            : <Plus className="h-4 w-4" />}
                          {editingProductId ? "Save changes" : "Add product"}
                        </>}
                    </button>
                  </div>
                </form>
              )}

              {/* PRODUCT LIST */}
              <div className="p-5 sm:p-6">
                {dashboardProducts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FCFAF6] px-5 py-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
                      <Package className="h-6 w-6" />
                    </div>

                    <h3 className="mt-4 text-sm font-bold">No products yet</h3>
                    <p className="mx-auto mt-1 max-w-[430px] text-xs leading-5 text-gray-500">
                      Add your first product so customers can see what your business sells.
                    </p>

                    <button
                      type="button"
                      onClick={openProductForm}
                      disabled={reachedProductLimit || editingBusiness}
                      className={`${primaryButtonClass} mt-4 min-h-10`}
                    >
                      <Plus className="h-4 w-4" />
                      Add your first product
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {dashboardProducts.map((product) => {
                      const cover =
                        product.images
                          ?.slice()
                          .sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ||
                        product.imageUrl;

                      const priceLabel = product.price != null
                        ? `₦${product.price.toLocaleString("en-NG")}`
                        : product.priceMin != null && product.priceMax != null
                          ? `₦${product.priceMin.toLocaleString("en-NG")} – ₦${product.priceMax.toLocaleString("en-NG")}`
                          : product.priceMin != null
                            ? `From ₦${product.priceMin.toLocaleString("en-NG")}`
                            : product.priceMax != null
                              ? `Up to ₦${product.priceMax.toLocaleString("en-NG")}`
                              : "Price missing — edit listing";

                      return (
                        <article
                          key={product.id}
                          className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E8E4DE] bg-white transition hover:border-[#F1B6A5] hover:shadow-sm"
                        >
                          <div className="h-[170px] overflow-hidden bg-[#FCFAF6] sm:h-[180px]">
                            {cover ? (
                              <img
                                src={cover}
                                alt={product.name}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-gray-300">
                                <Package className="h-10 w-10" />
                              </div>
                            )}
                          </div>

                          <div className="flex flex-1 flex-col p-4">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="break-words text-sm font-bold">
                                  {product.name}
                                </h3>
                                <p className="mt-1 text-[11px] text-gray-500">
                                  {product.category?.name ?? "No category"}
                                </p>
                              </div>

                              <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${getStatusClasses(product.status)}`}>
                                {product.status}
                              </span>
                            </div>

                            <p className="mt-3 line-clamp-2 min-h-[34px] text-xs leading-5 text-gray-500">
                              {product.description || "No description added."}
                            </p>

                            <div className="mt-3 flex min-w-0 items-start justify-between gap-3">
                              <p className="break-words text-sm font-bold text-[#9F2D18]">
                                {priceLabel}
                              </p>
                              <span className="max-w-[46%] shrink-0 text-right text-[10px] font-medium text-gray-400">
                                {formatAvailability(product.availability)}
                              </span>
                            </div>

                            <div className="mt-auto flex gap-2 pt-4">
                              <button
                                type="button"
                                onClick={() => startEditingProduct(product)}
                                disabled={Boolean(deletingProductId) || editingBusiness}
                                className={`${secondaryButtonClass} min-w-0 flex-1`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => void deleteProduct(product)}
                                disabled={Boolean(deletingProductId) || editingBusiness}
                                aria-label={`Delete ${product.name}`}
                                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[#F1D5D0] px-3 py-2.5 text-xs font-semibold text-[#C5402D] transition hover:bg-[#FFF0EE] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {deletingProductId === product.id
                                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                                  : <Trash2 className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* FOOTER */}
        <footer className="mt-8 border-t border-[#EAE6DF] py-5">
          <div className="flex flex-col gap-2 text-[11px] text-gray-400 sm:flex-row sm:items-center sm:justify-between">
            <p>ReMarket Seller Portal · Find it nearby.</p>

            <div className="flex flex-wrap gap-4">
              <Link href="/account" className="hover:text-[#9F2D18]">
                Account
              </Link>
              <Link href="/saved" className="hover:text-[#9F2D18]">
                Saved items
              </Link>
              <Link href="/seller/profile" className="hover:text-[#9F2D18]">
                Profile settings
              </Link>
              <Link href="/seller/claims" className="hover:text-[#9F2D18]">
                Business claims
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="text-left hover:text-[#9F2D18]"
              >
                Sign out
              </button>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* SHARED DASHBOARD COMPONENTS                                                */
/* -------------------------------------------------------------------------- */

function OverviewCard({
  icon,
  title,
  value,
  detail,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4">
      <div className="flex items-center gap-2 text-gray-400">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">
          {title}
        </span>
      </div>

      <p className="mt-2 break-words text-sm font-semibold text-gray-800">
        {value}
      </p>

      {detail && (
        <p className="mt-1 break-words text-[11px] leading-5 text-gray-500">
          {detail}
        </p>
      )}
    </div>
  );
}

function ContactVisibility({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="sm:col-span-2 mt-2 rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          value
            ? "bg-[#DDF5EA] text-[#137A59]"
            : "bg-[#FFF0EE] text-[#9F2D18]"
        }`}>
          {value
            ? <Globe className="h-5 w-5" />
            : <LockKeyhole className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <label
            htmlFor={id}
            className="block cursor-pointer text-sm font-bold text-[#17202A]"
          >
            Show contact information publicly
          </label>

          <p className="mt-1 text-xs leading-5 text-gray-500">
            Allow customers visiting your public business page to see your phone number and contact links.
          </p>

          <p className="mt-2 text-[10px] font-semibold text-[#9F2D18]">
            Contact information is private by default.
          </p>
        </div>

        <input
          id={id}
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[#FF5A36]"
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AREA COMBOBOX                                                              */
/* -------------------------------------------------------------------------- */

type AreaComboboxProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

function AreaCombobox({
  id,
  value,
  onChange,
  placeholder = "Type or choose an area",
  required = false,
  disabled = false,
}: AreaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredGroups = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();

    return LAGOS_AREA_GROUPS.map((group) => ({
      lga: group.lga,
      areas: group.areas.filter((area) =>
        !query ||
        area.toLocaleLowerCase().includes(query) ||
        group.lga.toLocaleLowerCase().includes(query),
      ),
    })).filter((group) => group.areas.length > 0);
  }, [searchTerm]);

  const suggestions = useMemo(
    () => filteredGroups.flatMap((group) =>
      group.areas.map((area) => ({
        lga: group.lga,
        area,
      })),
    ),
    [filteredGroups],
  );

  useEffect(() => {
    if (!open) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      if (
        wrapperRef.current &&
        event.target instanceof Node &&
        !wrapperRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [open]);

  function showOptions(showAll = true) {
    setSearchTerm(showAll ? "" : value);
    setActiveIndex(0);
    setOpen(true);
  }

  function selectArea(area: string) {
    onChange(area);
    setSearchTerm("");
    setActiveIndex(0);
    setOpen(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (!open) {
        showOptions();
        return;
      }

      setActiveIndex((current) =>
        Math.min(current + 1, Math.max(0, suggestions.length - 1)),
      );

      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (event.key === "Enter" && open && suggestions.length > 0) {
      event.preventDefault();

      selectArea(
        suggestions[activeIndex]?.area ??
        suggestions[0].area,
      );
    }
  }

  let optionIndex = 0;

  return (
    <div ref={wrapperRef} className="relative z-40 min-w-0">
      <div className="relative min-w-0">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-required={required}
          autoComplete="off"
          className={inputClass.replace("px-4", "pl-4 pr-12")}
          value={value}
          onFocus={() => showOptions()}
          onClick={() => {
            if (!open) showOptions();
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setSearchTerm(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-label="Business area"
        />

        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? "Close area suggestions" : "Open area suggestions"}
          aria-controls={`${id}-options`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              setOpen(false);
            } else {
              showOptions();
              inputRef.current?.focus();
            }
          }}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition hover:bg-[#FFF0E9] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && !disabled && (
        <div
          id={`${id}-options`}
          role="listbox"
          aria-label="Suggested business areas by local government area"
          className="absolute left-0 right-0 top-full z-[60] mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-[#E8E4DE] bg-white p-2 shadow-[0_18px_45px_rgba(23,32,42,0.16)]"
        >
          <div className="sticky top-0 z-10 mb-1 flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
              {searchTerm.trim()
                ? "Matching areas"
                : "Browse by local government area"}
            </span>

            <span className="shrink-0 text-[10px] font-semibold text-[#9F2D18]">
              {suggestions.length} options
            </span>
          </div>

          {filteredGroups.length ? (
            filteredGroups.map((group) => (
              <div key={group.lga} className="mb-2 last:mb-0">
                <p className="sticky top-9 z-[5] rounded-md bg-[#FCFAF6] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                  {group.lga}
                </p>

                <div className="mt-1 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                  {group.areas.map((area) => {
                    const currentIndex = optionIndex++;
                    const selected =
                      value.trim().toLocaleLowerCase() === area.toLocaleLowerCase();
                    const highlighted = currentIndex === activeIndex;

                    return (
                      <button
                        key={`${group.lga}-${area}`}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setActiveIndex(currentIndex)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectArea(area)}
                        className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition ${
                          highlighted
                            ? "bg-[#FFF0E9] text-[#9F2D18]"
                            : selected
                              ? "bg-[#F1FBF6] font-bold text-[#137A59]"
                              : "text-gray-700 hover:bg-[#FCFAF6]"
                        }`}
                      >
                        <span className="min-w-0 break-words">{area}</span>

                        {selected && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-5 text-center">
              <MapPin className="mx-auto h-5 w-5 text-gray-300" />
              <p className="mt-2 text-xs font-semibold text-gray-700">
                No suggested areas match
              </p>
              <p className="mt-1 text-[11px] leading-5 text-gray-500">
                You can keep “{value.trim() || searchTerm.trim()}” as a custom area.
              </p>
            </div>
          )}

          <div className="mt-2 border-t border-[#F0ECE6] px-2 py-2 text-[10px] leading-4 text-gray-400">
            Choose a suggestion or keep typing a custom area. Use ↑ and ↓ to move through suggestions and Enter to select.
          </div>
        </div>
      )}
    </div>
  );
}
