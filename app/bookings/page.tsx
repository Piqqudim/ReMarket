
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardList,
  Loader2,
  MapPin,
  MessageSquareText,
  RefreshCw,
  Search,
  X,
  XCircle,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

/*
 * =========================================================
 * TYPES
 * =========================================================
 */

type BookingStatus =
  | "PENDING"
  | "AWAITING_BUYER"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DECLINED"
  | "CANCELLED";

type BookingFilter =
  | "ALL"
  | "NEEDS_RESPONSE"
  | "PENDING"
  | "ACTIVE"
  | "COMPLETED"
  | "CLOSED";

type BuyerBookingAction =
  | "ACCEPT_QUOTE"
  | "REJECT_QUOTE"
  | "CANCEL_BOOKING";

type BookingLocation = {
  area: string | null;
  street: string | null;
};

type BookingService = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
  businessName: string;
  ownerName: string | null;
  location: BookingLocation | null;
};

type ServiceBooking = {
  id: string;
  bookingCode: string | null;
  status: BookingStatus;
  bookingType: "REQUEST" | "APPOINTMENT";

  requestedFor: string | null;
  scheduledFor: string | null;

  quantity: number;
  contactPhone: string | null;

  fulfillmentType: string | null;
  fulfillmentAddress: string | null;

  buyerMessage: string | null;

  quotedPrice: number | null;
  quoteMessage: string | null;
  quoteSentAt: string | null;

  agreedPrice: number | null;
  quoteAcceptedAt: string | null;

  currency: string;

  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;

  cancelledAt: string | null;
  cancellationReason: string | null;

  startedAt: string | null;
  completedAt: string | null;

  createdAt: string;
  updatedAt: string;

  service: BookingService;
};

type BookingSummary = {
  total: number;
  PENDING: number;
  AWAITING_BUYER: number;
  ACCEPTED: number;
  IN_PROGRESS: number;
  COMPLETED: number;
  DECLINED: number;
  CANCELLED: number;
};

type Pagination = {
  page: number;
  totalPages: number;
  total: number | null;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type ApiPayload = Record<string, unknown>;

/*
 * =========================================================
 * CONSTANTS
 * =========================================================
 */

const PAGE_SIZE = 20;
const MAX_REASON_LENGTH = 2_000;

const EMPTY_SUMMARY: BookingSummary = {
  total: 0,
  PENDING: 0,
  AWAITING_BUYER: 0,
  ACCEPTED: 0,
  IN_PROGRESS: 0,
  COMPLETED: 0,
  DECLINED: 0,
  CANCELLED: 0,
};

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  totalPages: 1,
  total: null,
  hasNextPage: false,
  hasPreviousPage: false,
};

/*
 * =========================================================
 * GENERAL HELPERS
 * =========================================================
 */

function isRecord(value: unknown): value is ApiPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getString(
  value: unknown,
  fallback: string | null = null,
): string | null {
  if (typeof value !== "string") {
    return fallback;
  }

  const cleaned = value.trim();

  return cleaned.length > 0
    ? cleaned
    : fallback;
}

function getNumber(
  value: unknown,
  fallback: number | null = null,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  /*
   * Prisma Decimal values can be serialized as strings.
   */

  if (
    typeof value === "string" &&
    value.trim() !== ""
  ) {
    const parsed = Number(value.trim());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function getDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString();
}

function getNestedRecord(
  value: unknown,
): ApiPayload | null {
  return isRecord(value) ? value : null;
}

function getBookingCollection(
  payload: ApiPayload,
): unknown[] {
  if (Array.isArray(payload.bookings)) {
    return payload.bookings;
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  if (isRecord(payload.data)) {
    if (Array.isArray(payload.data.bookings)) {
      return payload.data.bookings;
    }

    if (Array.isArray(payload.data.items)) {
      return payload.data.items;
    }
  }

  return [];
}

function isBookingStatus(
  value: unknown,
): value is BookingStatus {
  return (
    value === "PENDING" ||
    value === "AWAITING_BUYER" ||
    value === "ACCEPTED" ||
    value === "IN_PROGRESS" ||
    value === "COMPLETED" ||
    value === "DECLINED" ||
    value === "CANCELLED"
  );
}

/*
 * =========================================================
 * BOOKING SUMMARY
 * =========================================================
 *
 * The buyer API returns all-time status counts.
 * Invalid or incomplete summary data is not treated as
 * an authoritative all-time summary.
 * =========================================================
 */

function parseBookingSummary(
  value: unknown,
): BookingSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const keys = [
    "total",
    "PENDING",
    "AWAITING_BUYER",
    "ACCEPTED",
    "IN_PROGRESS",
    "COMPLETED",
    "DECLINED",
    "CANCELLED",
  ] as const;

  const counts: Partial<BookingSummary> = {};

  for (const key of keys) {
    const amount = getNumber(value[key]);

    if (
      amount === null ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    ) {
      return null;
    }

    counts[key] = amount;
  }

  return counts as BookingSummary;
}

function calculatePageSummary(
  bookings: ServiceBooking[],
): BookingSummary {
  return {
    total: bookings.length,

    PENDING: bookings.filter(
      (booking) => booking.status === "PENDING",
    ).length,

    AWAITING_BUYER: bookings.filter(
      (booking) => booking.status === "AWAITING_BUYER",
    ).length,

    ACCEPTED: bookings.filter(
      (booking) => booking.status === "ACCEPTED",
    ).length,

    IN_PROGRESS: bookings.filter(
      (booking) => booking.status === "IN_PROGRESS",
    ).length,

    COMPLETED: bookings.filter(
      (booking) => booking.status === "COMPLETED",
    ).length,

    DECLINED: bookings.filter(
      (booking) => booking.status === "DECLINED",
    ).length,

    CANCELLED: bookings.filter(
      (booking) => booking.status === "CANCELLED",
    ).length,
  };
}

/*
 * =========================================================
 * BOOKING RESPONSE NORMALIZATION
 * =========================================================
 */

function parseBooking(
  value: unknown,
): ServiceBooking | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isRecord(value.service)
  ) {
    return null;
  }

  const rawService = value.service;

  /*
   * The current buyer API returns provider information
   * inside service.seller.
   *
   * service.business is retained as a fallback for older
   * response formats.
   */

  const rawBusiness =
    getNestedRecord(rawService.seller) ??
    getNestedRecord(rawService.business);

  const rawLocation = rawBusiness
    ? getNestedRecord(rawBusiness.location)
    : null;

  const rawImages = Array.isArray(rawService.images)
    ? rawService.images
    : [];

  const firstImage = rawImages.find(
    (image) =>
      isRecord(image) &&
      typeof image.url === "string",
  );

  const serviceImage =
    getString(rawService.imageUrl) ??
    (
      isRecord(firstImage)
        ? getString(firstImage.url)
        : null
    );

  const businessName =
    getString(rawBusiness?.name) ??
    getString(rawService.businessName) ??
    getString(value.sellerName) ??
    "Service provider";

  const location: BookingLocation | null =
    rawLocation
      ? {
          area: getString(rawLocation.area),

          street:
            getString(rawLocation.street) ??
            getString(rawLocation.address),
        }
      : null;

  const status = isBookingStatus(value.status)
    ? value.status
    : "PENDING";

  const bookingType =
    value.bookingType === "APPOINTMENT"
      ? "APPOINTMENT"
      : "REQUEST";

  return {
    id: value.id,

    bookingCode: getString(value.bookingCode),

    status,
    bookingType,

    requestedFor: getDate(value.requestedFor),
    scheduledFor: getDate(value.scheduledFor),

    quantity: Math.max(
      1,
      getNumber(value.quantity, 1) ?? 1,
    ),

    contactPhone: getString(value.contactPhone),

    fulfillmentType: getString(value.fulfillmentType),

    fulfillmentAddress: getString(
      value.fulfillmentAddress,
    ),

    buyerMessage: getString(value.buyerMessage),

    quotedPrice: getNumber(value.quotedPrice),
    quoteMessage: getString(value.quoteMessage),
    quoteSentAt: getDate(value.quoteSentAt),

    agreedPrice: getNumber(value.agreedPrice),
    quoteAcceptedAt: getDate(value.quoteAcceptedAt),

    currency: getString(value.currency, "NGN") ?? "NGN",

    acceptedAt: getDate(value.acceptedAt),
    declinedAt: getDate(value.declinedAt),
    declineReason: getString(value.declineReason),

    cancelledAt: getDate(value.cancelledAt),

    cancellationReason: getString(
      value.cancellationReason,
    ),

    startedAt: getDate(value.startedAt),
    completedAt: getDate(value.completedAt),

    createdAt:
      getDate(value.createdAt) ??
      new Date().toISOString(),

    updatedAt:
      getDate(value.updatedAt) ??
      new Date().toISOString(),

    service: {
      id: getString(rawService.id, "") ?? "",

      name:
        getString(
          rawService.name,
          "Service booking",
        ) ?? "Service booking",

      description: getString(rawService.description),

      imageUrl: serviceImage,

      price: getNumber(rawService.price),
      priceMin: getNumber(rawService.priceMin),
      priceMax: getNumber(rawService.priceMax),

      durationMinutes: getNumber(
        rawService.durationMinutes,
      ),

      businessName,

      ownerName: getString(rawBusiness?.ownerName),

      location,
    },
  };
}

/*
 * =========================================================
 * FORMATTING
 * =========================================================
 */

function formatDate(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDateOnly(value: string | null): string {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
  }).format(date);
}

function formatMoney(
  amount: number | null,
  currency = "NGN",
): string {
  if (amount === null) {
    return "Awaiting quotation";
  }

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-NG")}`;
  }
}

function formatFulfillment(
  value: string | null,
): string {
  switch (value) {
    case "AT_PROVIDER":
      return "Visit provider";

    case "AT_CUSTOMER":
      return "Provider visits you";

    case "REMOTE":
      return "Remote service";

    case "FLEXIBLE":
      return "Flexible arrangement";

    default:
      return "Not specified";
  }
}

function getBookingReference(
  booking: ServiceBooking,
): string {
  return (
    booking.bookingCode ??
    `RM-SVC-${booking.id.slice(-8).toUpperCase()}`
  );
}

function getConversationHref(
  bookingId: string,
): string {
  return (
    `/service-bookings/${encodeURIComponent(
      bookingId,
    )}/messages`
  );
}

function getStatusLabel(
  status: BookingStatus,
): string {
  switch (status) {
    case "PENDING":
      return "Awaiting provider";

    case "AWAITING_BUYER":
      return "Your response needed";

    case "ACCEPTED":
      return "Confirmed";

    case "IN_PROGRESS":
      return "In progress";

    case "COMPLETED":
      return "Completed";

    case "DECLINED":
      return "Declined";

    case "CANCELLED":
      return "Cancelled";
  }
}

function getStatusClasses(
  status: BookingStatus,
): string {
  switch (status) {
    case "PENDING":
      return "border-[#F3D9A7] bg-[#FFF8E8] text-[#976515]";

    case "AWAITING_BUYER":
      return "border-[#FFD2C5] bg-[#FFF0EB] text-[#B53A20]";

    case "ACCEPTED":
    case "COMPLETED":
      return "border-[#BFE7D0] bg-[#EFFBF4] text-[#147A50]";

    case "IN_PROGRESS":
      return "border-[#C9DDF6] bg-[#F0F6FF] text-[#315F9B]";

    case "DECLINED":
    case "CANCELLED":
      return "border-[#E8D5D1] bg-[#FAF2F0] text-[#9F2D18]";
  }
}

function getBookingDescription(
  booking: ServiceBooking,
): string {
  switch (booking.status) {
    case "PENDING":
      return "Your booking has been sent. The provider has not responded yet.";

    case "AWAITING_BUYER":
      return "The provider has sent a quotation. Review it and respond.";

    case "ACCEPTED":
      return booking.bookingType === "APPOINTMENT"
        ? "Your appointment has been accepted."
        : "Your booking has been accepted.";

    case "IN_PROGRESS":
      return "The provider has started working on your service.";

    case "COMPLETED":
      return "This service booking has been marked as completed.";

    case "DECLINED":
      return "The provider declined this booking.";

    case "CANCELLED":
      return "This booking has been cancelled.";
  }
}

function canBuyerCancelBooking(
  status: BookingStatus,
): boolean {
  return (
    status === "PENDING" ||
    status === "ACCEPTED"
  );
}

/*
 * =========================================================
 * MAIN PAGE
 * =========================================================
 */

export default function BuyerBookingsPage() {
  const router = useRouter();

  /*
   * -------------------------------------------------------
   * STATE
   * -------------------------------------------------------
   */

  const [bookings, setBookings] = useState<ServiceBooking[]>([]);

  const [summary, setSummary] =
    useState<BookingSummary>(EMPTY_SUMMARY);

  const [summaryAvailable, setSummaryAvailable] =
    useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [filter, setFilter] = useState<BookingFilter>("ALL");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);

  const [pagination, setPagination] =
    useState<Pagination>(EMPTY_PAGINATION);

  const [selectedBookingId, setSelectedBookingId] =
    useState<string | null>(null);

  const [actionLoading, setActionLoading] =
    useState<BuyerBookingAction | null>(null);

  const [responseReason, setResponseReason] = useState("");
  const [actionError, setActionError] = useState("");

  /*
   * -------------------------------------------------------
   * LOAD BOOKINGS
   * -------------------------------------------------------
   *
   * API:
   * GET /api/service-bookings?page=1&pageSize=20
   *
   * The API returns all-time summary counts separately
   * from the paginated booking records.
   * -------------------------------------------------------
   */

  const loadBookings = useCallback(
    async (manualRefresh = false) => {
      if (manualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });

        const response = await fetch(
          `/api/service-bookings?${params.toString()}`,
          {
            method: "GET",

            headers: {
              Accept: "application/json",
            },

            cache: "no-store",
          },
        );

        const payload: unknown = await response
          .json()
          .catch(() => null);

        /*
         * AUTHENTICATION
         */

        if (response.status === 401) {
          router.push(
            `/buyer/login?callbackUrl=${encodeURIComponent(
              "/bookings",
            )}`,
          );

          return;
        }

        if (response.status === 403) {
          throw new Error(
            "Your account does not have permission to view these bookings.",
          );
        }

        if (!response.ok) {
          const message =
            isRecord(payload) &&
            typeof payload.error === "string"
              ? payload.error
              : "Unable to load your service bookings.";

          throw new Error(message);
        }

        if (!isRecord(payload)) {
          throw new Error(
            "The bookings server returned an invalid response.",
          );
        }

        /*
         * NORMALIZE BOOKINGS
         */

        const parsedBookings = getBookingCollection(payload)
          .map(parseBooking)
          .filter(
            (booking): booking is ServiceBooking =>
              booking !== null,
          );

        setBookings(parsedBookings);

        /*
         * ALL-TIME BOOKING SUMMARY
         */

        const serverSummary = parseBookingSummary(
          payload.summary,
        );

        if (serverSummary) {
          setSummary(serverSummary);
          setSummaryAvailable(true);
        } else {
          /*
           * Fallback for an older API response.
           * This counts only bookings on the loaded page.
           */

          setSummary(
            calculatePageSummary(parsedBookings),
          );

          setSummaryAvailable(false);
        }

        /*
         * PAGINATION
         */

        const rawPagination =
          getNestedRecord(payload.pagination) ??
          getNestedRecord(payload.meta);

        const returnedPage = Math.max(
          1,
          Math.floor(
            getNumber(
              payload.page,
              getNumber(rawPagination?.page, page),
            ) ?? page,
          ),
        );

        const total = getNumber(
          payload.total,
          getNumber(rawPagination?.total),
        );

        const inferredTotalPages =
          total !== null
            ? Math.max(1, Math.ceil(total / PAGE_SIZE))
            : 1;

        const totalPages = Math.max(
          1,
          Math.floor(
            getNumber(
              payload.totalPages,
              getNumber(
                rawPagination?.totalPages,
                inferredTotalPages,
              ),
            ) ?? inferredTotalPages,
          ),
        );

        const hasNextPage =
          typeof payload.hasNextPage === "boolean"
            ? payload.hasNextPage
            : typeof rawPagination?.hasMore === "boolean"
              ? rawPagination.hasMore
              : returnedPage < totalPages;

        const hasPreviousPage =
          typeof payload.hasPreviousPage === "boolean"
            ? payload.hasPreviousPage
            : returnedPage > 1;

        setPagination({
          page: returnedPage,
          totalPages,
          total,
          hasNextPage,
          hasPreviousPage,
        });
      } catch (loadError) {
        console.error(
          "Buyer service bookings error:",
          loadError,
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your bookings.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, router],
  );

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  /*
   * -------------------------------------------------------
   * SELECTED BOOKING
   * -------------------------------------------------------
   */

  const selectedBooking = useMemo(
    () =>
      bookings.find(
        (booking) => booking.id === selectedBookingId,
      ) ?? null,
    [bookings, selectedBookingId],
  );

  /*
   * -------------------------------------------------------
   * SUMMARY COUNTS
   * -------------------------------------------------------
   */

  const counts = useMemo(
    () => ({
      all: summary.total,

      needsResponse: summary.AWAITING_BUYER,

      active:
        summary.ACCEPTED +
        summary.IN_PROGRESS,

      completed: summary.COMPLETED,

      closed:
        summary.DECLINED +
        summary.CANCELLED,
    }),
    [summary],
  );

  /*
   * -------------------------------------------------------
   * FILTER BOOKINGS
   * -------------------------------------------------------
   *
   * Filtering is applied to the currently loaded page.
   * Pagination still covers the buyer's complete history.
   * -------------------------------------------------------
   */

  const visibleBookings = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return bookings.filter((booking) => {
      let matchesFilter = true;

      switch (filter) {
        case "NEEDS_RESPONSE":
          matchesFilter =
            booking.status === "AWAITING_BUYER";
          break;

        case "PENDING":
          matchesFilter =
            booking.status === "PENDING";
          break;

        case "ACTIVE":
          matchesFilter =
            booking.status === "ACCEPTED" ||
            booking.status === "IN_PROGRESS";
          break;

        case "COMPLETED":
          matchesFilter =
            booking.status === "COMPLETED";
          break;

        case "CLOSED":
          matchesFilter =
            booking.status === "DECLINED" ||
            booking.status === "CANCELLED";
          break;

        case "ALL":
          matchesFilter = true;
          break;
      }

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchable = [
        booking.bookingCode,
        booking.id,
        booking.service.name,
        booking.service.businessName,
        booking.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [bookings, filter, search]);

  /*
   * =======================================================
   * BUYER BOOKING ACTIONS
   * =======================================================
   *
   * API:
   * PATCH /api/service-bookings/[id]/buyer-action
   *
   * Actions:
   * ACCEPT_QUOTE
   * REJECT_QUOTE
   * CANCEL_BOOKING
   * =======================================================
   */

  async function respondToBooking(
    action: BuyerBookingAction,
    booking: ServiceBooking,
  ) {
    if (actionLoading !== null) {
      return;
    }

    setActionError("");
    setNotice("");

    let confirmationMessage = "";

    if (action === "ACCEPT_QUOTE") {
      confirmationMessage =
        `Accept the quotation of ${formatMoney(
          booking.quotedPrice,
          booking.currency,
        )} for ${booking.service.name}?`;
    } else if (action === "REJECT_QUOTE") {
      confirmationMessage =
        `Decline the provider's quotation for ${booking.service.name}? This will cancel the booking.`;
    } else {
      confirmationMessage =
        `Cancel your booking for ${booking.service.name}?`;
    }

    const confirmed = window.confirm(
      confirmationMessage,
    );

    if (!confirmed) {
      return;
    }

    setActionLoading(action);

    try {
      const response = await fetch(
        `/api/service-bookings/${encodeURIComponent(
          booking.id,
        )}/buyer-action`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },

          body: JSON.stringify({
            action,
            reason:
              responseReason.trim() || undefined,
          }),
        },
      );

      const payload: unknown = await response
        .json()
        .catch(() => null);

      if (response.status === 401) {
        router.push(
          `/buyer/login?callbackUrl=${encodeURIComponent(
            "/bookings",
          )}`,
        );

        return;
      }

      if (!response.ok) {
        const message =
          isRecord(payload) &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to update this booking.";

        throw new Error(message);
      }

      setNotice(
        isRecord(payload) &&
        typeof payload.message === "string"
          ? payload.message
          : action === "ACCEPT_QUOTE"
            ? "Quotation accepted."
            : action === "REJECT_QUOTE"
              ? "Quotation declined."
              : "Booking cancelled.",
      );

      setResponseReason("");
      setActionError("");

      /*
       * Reload booking details and all-time summary.
       */

      await loadBookings(true);
    } catch (responseError) {
      console.error(
        "Buyer booking action error:",
        responseError,
      );

      setActionError(
        responseError instanceof Error
          ? responseError.message
          : "Unable to submit your response.",
      );
    } finally {
      setActionLoading(null);
    }
  }

  /*
   * =======================================================
   * FILTER AND PAGINATION
   * =======================================================
   */

  function changeFilter(nextFilter: BookingFilter) {
    setFilter(nextFilter);
    setSelectedBookingId(null);
    setActionError("");
    setResponseReason("");
  }

  function goToPage(nextPage: number) {
    if (
      nextPage < 1 ||
      nextPage > pagination.totalPages
    ) {
      return;
    }

    setSelectedBookingId(null);

    setPage(nextPage);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  /*
   * =======================================================
   * EMPTY STATE
   * =======================================================
   */

  function renderEmptyState(): ReactNode {
    const hasFilters =
      filter !== "ALL" ||
      search.trim().length > 0;

    return (
      <div className="rounded-2xl border border-dashed border-[#EAE6DF] bg-[#FFFDFC] px-5 py-14 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF0EB] text-[#FF5A36]">
          <ClipboardList className="h-7 w-7" />
        </div>

        <h3 className="mt-5 text-lg font-bold text-[#2B211B]">
          {hasFilters
            ? "No matching bookings"
            : "No service bookings yet"}
        </h3>

        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#82766C]">
          {hasFilters
            ? "Try another search term or choose a different booking filter."
            : "When you book a service on ReMarket, your booking details and updates will appear here."}
        </p>

        {hasFilters ? (
          <button
            type="button"
            onClick={() => {
              setFilter("ALL");
              setSearch("");
            }}
            className="mt-5 rounded-xl border border-[#EAE6DF] bg-white px-5 py-2.5 text-sm font-semibold text-[#514840] transition hover:bg-[#FCFAF6]"
          >
            Clear filters
          </button>
        ) : (
          <Link
            href="/search?type=service"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#E94A28]"
          >
            Explore services
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    );
  }

  /*
   * =======================================================
   * BOOKING CARD
   * =======================================================
   */

  function renderBookingCard(
    booking: ServiceBooking,
  ) {
    const isAwaitingResponse =
      booking.status === "AWAITING_BUYER";

    return (
      <article
        key={booking.id}
        className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] transition hover:border-[#F5B5A4] hover:shadow-sm"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] sm:h-24 sm:w-24">
              {booking.service.imageUrl ? (
                <img
                  src={booking.service.imageUrl}
                  alt={booking.service.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#B7A89D]">
                  <ClipboardList className="h-8 w-8" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold sm:text-xs ${getStatusClasses(
                    booking.status,
                  )}`}
                >
                  {getStatusLabel(booking.status)}
                </span>

                <span className="text-[10px] text-[#91877E] sm:text-xs">
                  {booking.bookingType === "APPOINTMENT"
                    ? "Appointment"
                    : "Service request"}
                </span>
              </div>

              <h3 className="mt-2 truncate text-sm font-bold text-[#2B211B] sm:text-base">
                {booking.service.name}
              </h3>

              <p className="mt-1 truncate text-xs text-[#766B62]">
                {booking.service.businessName}
              </p>

              <p className="mt-2 text-[10px] text-[#9A9087] sm:text-xs">
                Reference: {getBookingReference(booking)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#F0ECE6] pt-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[#9A9087]">
                Booking date
              </p>

              <p className="mt-1 text-xs font-semibold text-[#514840]">
                {formatDateOnly(booking.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[#9A9087]">
                {booking.scheduledFor
                  ? "Confirmed date"
                  : "Preferred date"}
              </p>

              <p className="mt-1 text-xs font-semibold text-[#514840]">
                {formatDate(
                  booking.scheduledFor ??
                    booking.requestedFor,
                )}
              </p>
            </div>
          </div>

          {isAwaitingResponse &&
            booking.quotedPrice !== null && (
              <div className="mt-4 rounded-xl border border-[#FFD2C5] bg-[#FFF3EF] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#A3422C]">
                  Quotation awaiting your response
                </p>

                <p className="mt-1 text-lg font-extrabold text-[#9F2D18]">
                  {formatMoney(
                    booking.quotedPrice,
                    booking.currency,
                  )}
                </p>
              </div>
            )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] text-[#9A9087]">
                {booking.agreedPrice !== null
                  ? "Agreed amount"
                  : "Latest quotation"}
              </p>

              <p className="mt-0.5 text-sm font-bold text-[#2B211B]">
                {formatMoney(
                  booking.agreedPrice ??
                    booking.quotedPrice,
                  booking.currency,
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedBookingId(booking.id);
                setResponseReason("");
                setActionError("");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-xs font-bold text-[#514840] transition hover:border-[#FFB5A1] hover:text-[#9F2D18]"
            >
              View details
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* SHARED CONVERSATION */}

          <Link
            href={getConversationHref(booking.id)}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#FFD2C5] bg-[#FFF5F1] px-4 py-2.5 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFEAE2]"
          >
            <MessageSquareText className="h-4 w-4" />
            Open conversation
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {isAwaitingResponse && (
          <div className="flex items-center gap-2 border-t border-[#F4DCD5] bg-[#FFF9F6] px-4 py-3 text-xs font-semibold text-[#9F2D18] sm:px-5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            A quotation needs your attention.
          </div>
        )}
      </article>
    );
  }

  /*
   * =======================================================
   * BOOKING TIMELINE
   * =======================================================
   */

  function renderTimeline(
    booking: ServiceBooking,
  ) {
    const events = [
      {
        label: "Booking submitted",
        date: booking.createdAt,
        completed: true,
      },
      {
        label: booking.quoteSentAt
          ? "Quotation sent"
          : "Provider response",

        date:
          booking.quoteSentAt ??
          booking.acceptedAt ??
          booking.declinedAt,

        completed: Boolean(
          booking.quoteSentAt ||
            booking.acceptedAt ||
            booking.declinedAt,
        ),
      },
      {
        label: "Booking accepted",
        date: booking.acceptedAt,
        completed: Boolean(booking.acceptedAt),
      },
      {
        label: "Service started",
        date: booking.startedAt,
        completed: Boolean(booking.startedAt),
      },
      {
        label: "Service completed",
        date: booking.completedAt,
        completed: Boolean(booking.completedAt),
      },
    ];

    return (
      <div className="space-y-4">
        {events.map((event, index) => (
          <div
            key={`${event.label}-${index}`}
            className="flex items-start gap-3"
          >
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  event.completed
                    ? "bg-[#E9F8EF] text-[#168354]"
                    : "bg-[#F1EEE9] text-[#A69B91]"
                }`}
              >
                {event.completed ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Clock3 className="h-4 w-4" />
                )}
              </div>

              {index !== events.length - 1 && (
                <div className="mt-1 h-5 w-px bg-[#EAE6DF]" />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <p
                className={`text-xs font-semibold ${
                  event.completed
                    ? "text-[#514840]"
                    : "text-[#A49A90]"
                }`}
              >
                {event.label}
              </p>

              <p className="mt-1 text-[10px] text-[#9A9087]">
                {event.completed
                  ? formatDate(event.date)
                  : "Not yet"}
              </p>
            </div>
          </div>
        ))}

        {(booking.status === "DECLINED" ||
          booking.status === "CANCELLED") && (
          <div className="rounded-xl border border-[#E8D5D1] bg-[#FAF2F0] p-3">
            <p className="text-xs font-bold text-[#9F2D18]">
              {getStatusLabel(booking.status)}
            </p>

            <p className="mt-1 text-xs text-[#756B61]">
              {booking.status === "DECLINED"
                ? booking.declineReason ||
                  "The provider declined this booking."
                : booking.cancellationReason ||
                  "This booking was cancelled."}
            </p>
          </div>
        )}
      </div>
    );
  }

  /*
   * =======================================================
   * BOOKING DETAILS MODAL
   * =======================================================
   */

  function renderBookingDetails(): ReactNode {
    if (!selectedBooking) {
      return null;
    }

    const booking = selectedBooking;

    const awaitingQuote =
      booking.status === "AWAITING_BUYER" &&
      booking.quotedPrice !== null &&
      booking.quoteSentAt !== null &&
      booking.quoteAcceptedAt === null;

    const canCancel = canBuyerCancelBooking(
      booking.status,
    );

    return (
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-details-title"
      >
        <div className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[#EAE6DF] bg-[#FFFDFC] shadow-2xl sm:rounded-3xl">
          {/* MODAL HEADER */}

          <div className="flex items-center justify-between border-b border-[#EAE6DF] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#A0968D]">
                Service booking details
              </p>

              <h2
                id="booking-details-title"
                className="mt-1 truncate text-base font-extrabold text-[#2B211B] sm:text-lg"
              >
                {booking.service.name}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedBookingId(null);
                setActionError("");
                setResponseReason("");
              }}
              aria-label="Close booking details"
              className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#EAE6DF] text-[#71675E] transition hover:bg-[#FCFAF6]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* MODAL CONTENT */}

          <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
            {/* STATUS */}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${getStatusClasses(
                  booking.status,
                )}`}
              >
                {getStatusLabel(booking.status)}
              </span>

              <span className="text-[10px] text-[#91877E]">
                {getBookingReference(booking)}
              </span>
            </div>

            {/* SERVICE AND PROVIDER */}

            <div className="flex items-center gap-3 rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white">
                {booking.service.imageUrl ? (
                  <img
                    src={booking.service.imageUrl}
                    alt={booking.service.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#B7A89D]">
                    <ClipboardList className="h-6 w-6" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#2B211B]">
                  {booking.service.name}
                </p>

                <p className="mt-1 truncate text-xs text-[#756B62]">
                  {booking.service.businessName}
                </p>

                <p className="mt-1 text-[10px] text-[#9A9087]">
                  {booking.bookingType === "APPOINTMENT"
                    ? "Appointment booking"
                    : "Service request"}
                </p>
              </div>

              <Link
                href={`/service/${encodeURIComponent(
                  booking.service.id,
                )}`}
                className="shrink-0 text-xs font-bold text-[#E94A28] hover:underline"
              >
                View service
              </Link>
            </div>

            {/* STATUS DESCRIPTION */}

            <div className="rounded-xl border border-[#EAE6DF] bg-white p-4">
              <p className="text-xs leading-6 text-[#6F655C]">
                {getBookingDescription(booking)}
              </p>
            </div>

            {/* SHARED CONVERSATION */}

            <Link
              href={getConversationHref(booking.id)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#FFD2C5] bg-[#FFF5F1] px-4 py-3 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFEAE2]"
            >
              <MessageSquareText className="h-4 w-4" />
              Open booking conversation
              <ArrowRight className="h-4 w-4" />
            </Link>

            {/* QUOTATION PANEL */}

            {awaitingQuote && (
              <section className="rounded-2xl border border-[#FFC9B9] bg-[#FFF5F1] p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[#A43B22]">
                  <MessageSquareText className="h-5 w-5" />

                  <h3 className="text-sm font-extrabold">
                    Provider quotation
                  </h3>
                </div>

                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-[#9F604F]">
                  Amount quoted
                </p>

                <p className="mt-1 text-2xl font-extrabold text-[#9F2D18]">
                  {formatMoney(
                    booking.quotedPrice,
                    booking.currency,
                  )}
                </p>

                {booking.quoteMessage && (
                  <div className="mt-4 rounded-xl border border-[#F5D9D0] bg-white/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#9A746B]">
                      Provider's message
                    </p>

                    <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[#514840]">
                      {booking.quoteMessage}
                    </p>
                  </div>
                )}

                <p className="mt-3 text-[10px] text-[#9A746B]">
                  Sent {formatDate(booking.quoteSentAt)}
                </p>

                <div className="mt-5">
                  <label
                    htmlFor="quotation-response"
                    className="mb-2 block text-xs font-bold text-[#514840]"
                  >
                    Reason (optional)
                  </label>

                  <textarea
                    id="quotation-response"
                    value={responseReason}
                    onChange={(event) =>
                      setResponseReason(
                        event.target.value.slice(
                          0,
                          MAX_REASON_LENGTH,
                        ),
                      )
                    }
                    rows={3}
                    maxLength={MAX_REASON_LENGTH}
                    placeholder="Add a reason for declining this quotation..."
                    className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-white px-3 py-3 text-xs text-[#514840] outline-none transition placeholder:text-[#B3A69B] focus:border-[#FF9B82] focus:ring-2 focus:ring-[#FF5A36]/10"
                  />

                  <p className="mt-1 text-right text-[10px] text-[#A0968D]">
                    {responseReason.length}/{MAX_REASON_LENGTH}
                  </p>
                </div>

                {actionError && (
                  <div
                    role="alert"
                    className="mt-3 rounded-xl border border-[#E9C6BF] bg-white p-3 text-xs text-[#9F2D18]"
                  >
                    {actionError}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={actionLoading !== null}
                    onClick={() =>
                      void respondToBooking(
                        "REJECT_QUOTE",
                        booking,
                      )
                    }
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E8C9C1] bg-white px-4 py-3 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFF0EB] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === "REJECT_QUOTE" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}

                    Decline quotation
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading !== null}
                    onClick={() =>
                      void respondToBooking(
                        "ACCEPT_QUOTE",
                        booking,
                      )
                    }
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-bold text-white transition hover:bg-[#E94A28] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {actionLoading === "ACCEPT_QUOTE" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}

                    Accept quotation
                  </button>
                </div>
              </section>
            )}

            {/* GENERAL BOOKING CANCELLATION */}

            {canCancel && (
              <section className="rounded-2xl border border-[#E8D5D1] bg-[#FAF6F4] p-4 sm:p-5">
                <div className="flex items-center gap-2 text-[#9F2D18]">
                  <XCircle className="h-5 w-5" />

                  <h3 className="text-sm font-extrabold">
                    Cancel this booking
                  </h3>
                </div>

                <p className="mt-2 text-xs leading-6 text-[#756B61]">
                  You can cancel this booking before the provider
                  starts the service. The provider will be notified.
                </p>

                <div className="mt-4">
                  <label
                    htmlFor="booking-cancel-reason"
                    className="mb-2 block text-xs font-bold text-[#514840]"
                  >
                    Reason (optional)
                  </label>

                  <textarea
                    id="booking-cancel-reason"
                    value={responseReason}
                    onChange={(event) =>
                      setResponseReason(
                        event.target.value.slice(
                          0,
                          MAX_REASON_LENGTH,
                        ),
                      )
                    }
                    rows={2}
                    maxLength={MAX_REASON_LENGTH}
                    placeholder="Tell the provider why you are cancelling..."
                    className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-white px-3 py-3 text-xs text-[#514840] outline-none transition placeholder:text-[#B3A69B] focus:border-[#FF9B82] focus:ring-2 focus:ring-[#FF5A36]/10"
                  />
                </div>

                {actionError && (
                  <div
                    role="alert"
                    className="mt-3 rounded-xl border border-[#E9C6BF] bg-white p-3 text-xs text-[#9F2D18]"
                  >
                    {actionError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={actionLoading !== null}
                  onClick={() =>
                    void respondToBooking(
                      "CANCEL_BOOKING",
                      booking,
                    )
                  }
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#DDBDB5] bg-white px-4 py-3 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFF0EB] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionLoading === "CANCEL_BOOKING" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}

                  Cancel booking
                </button>
              </section>
            )}

            {/* ACCEPTED QUOTATION */}

            {!awaitingQuote &&
              booking.agreedPrice !== null && (
                <div className="rounded-2xl border border-[#BFE7D0] bg-[#F0FBF5] p-4">
                  <div className="flex items-center gap-2 text-[#147A50]">
                    <BadgeCheck className="h-5 w-5" />

                    <p className="text-xs font-bold">
                      Agreed service amount
                    </p>
                  </div>

                  <p className="mt-2 text-xl font-extrabold text-[#147A50]">
                    {formatMoney(
                      booking.agreedPrice,
                      booking.currency,
                    )}
                  </p>

                  {booking.quoteAcceptedAt && (
                    <p className="mt-1 text-[10px] text-[#5C8871]">
                      Accepted {formatDate(booking.quoteAcceptedAt)}
                    </p>
                  )}
                </div>
              )}

            {/* APPOINTMENT DETAILS */}

            {booking.bookingType === "APPOINTMENT" && (
              <section>
                <h3 className="text-sm font-extrabold text-[#2B211B]">
                  Appointment information
                </h3>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[#EAE6DF] bg-white p-3">
                    <div className="flex items-center gap-2 text-[#9A9087]">
                      <CalendarDays className="h-4 w-4" />

                      <span className="text-[10px] font-bold uppercase tracking-wide">
                        Preferred date
                      </span>
                    </div>

                    <p className="mt-2 text-xs font-bold text-[#514840]">
                      {formatDate(booking.requestedFor)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#BFE7D0] bg-[#F0FBF5] p-3">
                    <div className="flex items-center gap-2 text-[#4A8968]">
                      <CalendarDays className="h-4 w-4" />

                      <span className="text-[10px] font-bold uppercase tracking-wide">
                        Confirmed appointment
                      </span>
                    </div>

                    <p className="mt-2 text-xs font-bold text-[#147A50]">
                      {formatDate(booking.scheduledFor)}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* BOOKING INFORMATION */}

            <section>
              <h3 className="text-sm font-extrabold text-[#2B211B]">
                Booking information
              </h3>

              <div className="mt-3 divide-y divide-[#F0ECE6] rounded-xl border border-[#EAE6DF] bg-white px-4">
                <div className="flex items-start justify-between gap-3 py-3">
                  <span className="text-xs text-[#91877E]">
                    Booking created
                  </span>

                  <span className="text-right text-xs font-semibold text-[#514840]">
                    {formatDate(booking.createdAt)}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3 py-3">
                  <span className="text-xs text-[#91877E]">
                    Quantity
                  </span>

                  <span className="text-xs font-semibold text-[#514840]">
                    {booking.quantity}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3 py-3">
                  <span className="text-xs text-[#91877E]">
                    Fulfillment
                  </span>

                  <span className="text-right text-xs font-semibold text-[#514840]">
                    {formatFulfillment(
                      booking.fulfillmentType,
                    )}
                  </span>
                </div>

                {booking.contactPhone && (
                  <div className="flex items-start justify-between gap-3 py-3">
                    <span className="text-xs text-[#91877E]">
                      Contact phone
                    </span>

                    <span className="text-right text-xs font-semibold text-[#514840]">
                      {booking.contactPhone}
                    </span>
                  </div>
                )}

                {booking.fulfillmentAddress && (
                  <div className="py-3">
                    <span className="text-xs text-[#91877E]">
                      Service address
                    </span>

                    <p className="mt-1 text-xs font-semibold leading-5 text-[#514840]">
                      {booking.fulfillmentAddress}
                    </p>
                  </div>
                )}

                {booking.service.location && (
                  <div className="flex items-start gap-2 py-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#9A9087]" />

                    <div>
                      <p className="text-xs text-[#91877E]">
                        Provider location
                      </p>

                      <p className="mt-1 text-xs font-semibold text-[#514840]">
                        {[
                          booking.service.location.street,
                          booking.service.location.area,
                        ]
                          .filter(Boolean)
                          .join(", ") ||
                          "Location not provided"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* ORIGINAL BUYER MESSAGE */}

            {booking.buyerMessage && (
              <section>
                <h3 className="text-sm font-extrabold text-[#2B211B]">
                  Your original request
                </h3>

                <div className="mt-3 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-4">
                  <p className="whitespace-pre-wrap text-xs leading-6 text-[#655B52]">
                    {booking.buyerMessage}
                  </p>
                </div>
              </section>
            )}

            {/* BOOKING TIMELINE */}

            <section>
              <h3 className="mb-4 text-sm font-extrabold text-[#2B211B]">
                Booking progress
              </h3>

              {renderTimeline(booking)}
            </section>

            {/* SERVICE DESCRIPTION */}

            {booking.service.description && (
              <section>
                <h3 className="text-sm font-extrabold text-[#2B211B]">
                  About this service
                </h3>

                <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-[#756B61]">
                  {booking.service.description}
                </p>
              </section>
            )}
          </div>

          {/* MODAL FOOTER */}

          <div className="flex items-center justify-between gap-3 border-t border-[#EAE6DF] bg-[#FCFAF6] px-5 py-4 sm:px-6">
            <Link
              href="/search?type=service"
              className="text-xs font-semibold text-[#8B7F75] hover:text-[#9F2D18]"
            >
              Explore more services
            </Link>

            <button
              type="button"
              onClick={() => {
                setSelectedBookingId(null);
                setActionError("");
                setResponseReason("");
              }}
              className="rounded-xl bg-[#FF5A36] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94A28]"
            >
              Close details
            </button>
          </div>
        </div>
      </div>
    );
  }

  /*
   * =======================================================
   * PAGE RENDER
   * =======================================================
   */

  return (
    <div className="min-h-dvh bg-[#FFF7ED] text-[#2B211B]">
      <SiteHeader />

      <main className="mx-auto min-h-[70dvh] w-full max-w-7xl px-4 pb-28 pt-7 sm:px-6 lg:px-8 lg:pb-12 lg:pt-10">
        {/* PAGE HEADING */}

        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#8C7F75] transition hover:text-[#9F2D18]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to ReMarket
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFE5DC] text-[#FF5A36]">
                <ClipboardList className="h-6 w-6" />
              </div>

              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-[#2B211B] sm:text-3xl">
                  My Bookings
                </h1>

                <p className="mt-1 text-xs text-[#81766D] sm:text-sm">
                  Manage your service requests and appointments.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadBookings(true)}
            disabled={loading || refreshing}
            className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-[#EAE6DF] bg-[#FFFDFC] px-4 py-2.5 text-xs font-bold text-[#514840] transition hover:border-[#F3B7A6] disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                refreshing ? "animate-spin" : ""
              }`}
            />

            Refresh
          </button>
        </div>

        {/* SUCCESS NOTICE */}

        {notice && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#BFE7D0] bg-[#F0FBF5] p-4 text-xs text-[#176C49]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />

            <p className="flex-1">{notice}</p>

            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss message"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* SUMMARY CARDS */}

        <section className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[
            {
              label: summaryAvailable
                ? "All bookings"
                : "Loaded bookings",

              value: counts.all,
              icon: ClipboardList,
              style: "bg-[#FFFDFC] text-[#514840]",
            },
            {
              label: "Needs response",
              value: counts.needsResponse,
              icon: AlertCircle,
              style: "bg-[#FFF0EB] text-[#A43B22]",
            },
            {
              label: "Active",
              value: counts.active,
              icon: Clock3,
              style: "bg-[#F0F6FF] text-[#315F9B]",
            },
            {
              label: "Completed",
              value: counts.completed,
              icon: CheckCircle2,
              style: "bg-[#EFFBF4] text-[#147A50]",
            },
            {
              label: "Closed",
              value: counts.closed,
              icon: XCircle,
              style: "bg-[#FAF2F0] text-[#9F2D18]",
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold text-[#91877E] sm:text-xs">
                    {item.label}
                  </p>

                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl ${item.style}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                </div>

                <p className="mt-3 text-2xl font-extrabold tabular-nums text-[#2B211B]">
                  {loading ? "—" : item.value}
                </p>
              </div>
            );
          })}
        </section>

        {!loading && (
          <p className="mt-2 text-[10px] text-[#9A9087]">
            {summaryAvailable
              ? "Summary totals include all your bookings across every page."
              : "Summary counts are based on the bookings currently loaded."}
          </p>
        )}

        {/* BOOKINGS AREA */}

        <section className="mt-7">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-lg font-extrabold text-[#2B211B]">
                Your service bookings
              </h2>

              <p className="mt-1 text-xs text-[#91877E]">
                View booking progress, provider quotations and appointment dates.
              </p>
            </div>

            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0968D]" />

              <input
                type="search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search by service or reference..."
                className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FFFDFC] pl-10 pr-4 text-xs text-[#514840] outline-none transition placeholder:text-[#B3A69B] focus:border-[#FF9B82] focus:ring-2 focus:ring-[#FF5A36]/10"
              />
            </div>
          </div>

          {/* FILTER TABS */}

          <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
            {(
              [
                ["ALL", "All"],
                ["NEEDS_RESPONSE", "Needs response"],
                ["PENDING", "Pending"],
                ["ACTIVE", "Active"],
                ["COMPLETED", "Completed"],
                ["CLOSED", "Closed"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeFilter(value)}
                aria-pressed={filter === value}
                className={`shrink-0 rounded-full border px-4 py-2.5 text-xs font-bold transition ${
                  filter === value
                    ? "border-[#FF5A36] bg-[#FF5A36] text-white"
                    : "border-[#EAE6DF] bg-[#FFFDFC] text-[#766B62] hover:border-[#F4B7A6]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ERROR STATE */}

          {error && (
            <div className="mt-5 rounded-2xl border border-[#E9C6BF] bg-[#FFF5F2] p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#B23A24]" />

                <div className="flex-1">
                  <h3 className="text-sm font-bold text-[#9F2D18]">
                    Unable to load bookings
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-[#80665F]">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() => void loadBookings(true)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#FF5A36] px-4 py-2 text-xs font-bold text-white hover:bg-[#E94A28]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Try again
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* LOADING STATE */}

          {loading && !error && (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="animate-pulse rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-5"
                >
                  <div className="flex gap-4">
                    <div className="h-20 w-20 rounded-xl bg-[#F0ECE6]" />

                    <div className="flex-1 space-y-3">
                      <div className="h-4 w-28 rounded bg-[#F0ECE6]" />
                      <div className="h-4 w-3/4 rounded bg-[#F0ECE6]" />
                      <div className="h-3 w-1/2 rounded bg-[#F0ECE6]" />
                    </div>
                  </div>

                  <div className="mt-5 h-12 rounded-xl bg-[#F0ECE6]" />
                </div>
              ))}
            </div>
          )}

          {/* BOOKING RESULTS */}

          {!loading &&
            !error &&
            visibleBookings.length > 0 && (
              <>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {visibleBookings.map(renderBookingCard)}
                </div>

                {/* PAGINATION */}

                <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[#91877E]">
                    Page {pagination.page}

                    {pagination.total !== null
                      ? ` • ${pagination.total} bookings`
                      : ""}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        !pagination.hasPreviousPage ||
                        loading ||
                        refreshing
                      }
                      onClick={() =>
                        goToPage(page - 1)
                      }
                      className="flex h-10 items-center gap-1 rounded-xl border border-[#EAE6DF] bg-[#FFFDFC] px-3 text-xs font-bold text-[#514840] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>

                    <span className="px-2 text-xs font-bold text-[#514840]">
                      {pagination.page} / {pagination.totalPages}
                    </span>

                    <button
                      type="button"
                      disabled={
                        !pagination.hasNextPage ||
                        loading ||
                        refreshing
                      }
                      onClick={() =>
                        goToPage(page + 1)
                      }
                      className="flex h-10 items-center gap-1 rounded-xl border border-[#EAE6DF] bg-[#FFFDFC] px-3 text-xs font-bold text-[#514840] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}

          {/* EMPTY STATE */}

          {!loading &&
            !error &&
            visibleBookings.length === 0 &&
            renderEmptyState()}
        </section>
      </main>

      {/* BOOKING DETAILS MODAL */}

      {selectedBooking && renderBookingDetails()}

      <MobileBottomNav />
    </div>
  );
}
