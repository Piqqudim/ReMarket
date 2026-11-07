
"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

import type { LucideIcon } from "lucide-react";

import {
  LayoutDashboard,
  Store,
  Package,
  ClipboardList,
  CalendarDays,
  Megaphone,
  UserRound,
  Trash2,
  LogOut,
  ArrowRight,
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  Clock3,
  MessageSquare,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Eye,
  CalendarClock,
  Banknote,
  User,
  Building2,
  FileText,
} from "lucide-react";

import NotificationBell from "@/components/NotificationBell";

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

type Person = {
  id: string;
  name: string | null;
  email?: string | null;
  role?: string;
};

type BusinessInfo = {
  id: string;
  name: string;
  area?: string | null;
  street?: string | null;
  address?: string | null;
  status?: string;
  verification?: string;
  location?: {
    area: string;
    street: string | null;
    address?: string | null;
  } | null;
};

type ServiceInfo = {
  id: string;
  name: string;
  description?: string | null;

  price: number | null;
  priceMin: number | null;
  priceMax: number | null;

  availability: string;
  bookingType?: string;
  fulfillmentType: string;
  durationMinutes: number | null;

  status?: string;
  deletedAt?: string | null;

  imageUrl?: string | null;

  images?: {
    id: string;
    url: string;
    sortOrder: number;
  }[];

  business: BusinessInfo;
};

type AdminBooking = {
  id: string;
  bookingCode: string | null;

  serviceId: string;

  buyerId: string;
  sellerId: string | null;

  bookingType: "REQUEST" | "APPOINTMENT";
  status: BookingStatus;

  requestedFor: string | null;
  scheduledFor: string | null;

  quantity: number;

  contactPhone: string | null;
  buyerMessage: string | null;

  fulfillmentType: string | null;
  fulfillmentAddress: string | null;

  quotedPrice: number | null;
  quoteMessage: string | null;
  quoteSentAt: string | null;

  agreedPrice: number | null;
  quoteAcceptedAt: string | null;

  currency: string;

  acceptedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;

  declineReason: string | null;
  cancellationReason: string | null;

  createdAt: string;
  updatedAt: string;

  buyer: Person;
  seller: Person | null;

  service: ServiceInfo;

  _count: {
    messages: number;
  };
};

type BookingMessage = {
  id: string;
  body: string;
  readAt: string | null;
  createdAt: string;

  sender: {
    id: string;
    name: string | null;
    role: string;
  };
};

type BookingDetail = Omit<AdminBooking, "_count"> & {
  merchantNote: string | null;
  cancelledById: string | null;
  messages: BookingMessage[];
};

type StatusSummaryItem = {
  status: BookingStatus;
  count: number;
};

type BookingSummary = {
  total: number;
  byStatus: StatusSummaryItem[];
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type BookingFilters = {
  q: string;
  status: string;
  from: string;
  to: string;
  sellerId: string;
  serviceId: string;
};

const BOOKING_STATUSES: BookingStatus[] = [
  "PENDING",
  "AWAITING_BUYER",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
  "DECLINED",
  "CANCELLED",
];

const EMPTY_FILTERS: BookingFilters = {
  q: "",
  status: "ALL",
  from: "",
  to: "",
  sellerId: "",
  serviceId: "",
};

/*
 * =========================================================
 * ADMIN NAVIGATION
 * =========================================================
 */

const ADMIN_NAV: {
  label: string;
  href: string;
  icon: LucideIcon;
}[] = [
  {
    label: "Overview",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Businesses",
    href: "/admin/businesses",
    icon: Store,
  },
  {
    label: "Products",
    href: "/admin/products",
    icon: Package,
  },
  {
    label: "Service bookings",
    href: "/admin/bookings",
    icon: CalendarDays,
  },
  {
    label: "Requests",
    href: "/admin/requests",
    icon: ClipboardList,
  },
  {
    label: "Content",
    href: "/admin/content",
    icon: Megaphone,
  },
  {
    label: "Claims",
    href: "/admin/claims",
    icon: UserRound,
  },
  {
    label: "Deletion requests",
    href: "/admin/business-deletion-requests",
    icon: Trash2,
  },
];

/*
 * =========================================================
 * ADMIN BOOKING TRANSITIONS
 * =========================================================
 */

const ALLOWED_TRANSITIONS: Record<
  BookingStatus,
  BookingStatus[]
> = {
  PENDING: [
    "ACCEPTED",
    "DECLINED",
    "CANCELLED",
  ],

  AWAITING_BUYER: [
    "ACCEPTED",
    "DECLINED",
    "CANCELLED",
  ],

  ACCEPTED: [
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ],

  IN_PROGRESS: [
    "COMPLETED",
    "CANCELLED",
  ],

  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
};

function getAllowedTransitions(
  booking: BookingDetail
): BookingStatus[] {
  let allowed = [
    ...ALLOWED_TRANSITIONS[booking.status],
  ];

  /*
   * Do not allow an administrator to bypass
   * an outstanding seller quotation.
   */

  const outstandingQuotation =
    booking.status === "AWAITING_BUYER" &&
    booking.quoteSentAt !== null &&
    booking.quotedPrice !== null &&
    booking.quoteAcceptedAt === null;

  if (outstandingQuotation) {
    allowed = allowed.filter(
      (status) => status !== "ACCEPTED"
    );
  }

  /*
   * An appointment must have a confirmed scheduled date
   * before it can be accepted by the administrator UI.
   */

  if (
    booking.bookingType === "APPOINTMENT" &&
    !booking.scheduledFor
  ) {
    allowed = allowed.filter(
      (status) => status !== "ACCEPTED"
    );
  }

  return allowed;
}

/*
 * =========================================================
 * GENERAL HELPERS
 * =========================================================
 */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function formatDate(
  value: string | null | undefined
): string {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
}

function formatDateTime(
  value: string | null | undefined
): string {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

function formatMoney(
  amount: number | null | undefined,
  currency = "NGN"
): string {
  if (amount === null || amount === undefined) {
    return "Not quoted";
  }

  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG")}`;
  }
}

function formatStatus(
  status: string
): string {
  return status
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatFulfillment(
  value: string | null | undefined
): string {
  if (!value) {
    return "Not specified";
  }

  const labels: Record<string, string> = {
    AT_PROVIDER: "At provider's location",
    AT_CUSTOMER: "At customer's location",
    REMOTE: "Remote service",
    FLEXIBLE: "Flexible arrangement",
  };

  return labels[value] ?? value;
}

function statusClass(status: string): string {
  switch (status) {
    case "COMPLETED":
    case "ACCEPTED":
      return "bg-[#E7F7EF] text-[#287A4B]";

    case "IN_PROGRESS":
      return "bg-[#E9F1FF] text-[#2457A7]";

    case "AWAITING_BUYER":
    case "PENDING":
      return "bg-[#FFF0D9] text-[#9F5A18]";

    case "DECLINED":
    case "CANCELLED":
      return "bg-[#FCE8E6] text-[#B42318]";

    default:
      return "bg-[#F0ECE7] text-[#6F675F]";
  }
}

function statusDot(status: string): string {
  switch (status) {
    case "COMPLETED":
    case "ACCEPTED":
      return "bg-[#287A4B]";

    case "IN_PROGRESS":
      return "bg-[#2457A7]";

    case "PENDING":
    case "AWAITING_BUYER":
      return "bg-[#C47B24]";

    case "DECLINED":
    case "CANCELLED":
      return "bg-[#B42318]";

    default:
      return "bg-[#8B8178]";
  }
}

function getBookingLocation(
  business: BusinessInfo
): string {
  const parts = [
    business.street,
    business.area,
  ].filter(
    (value): value is string =>
      typeof value === "string" &&
      value.trim().length > 0
  );

  return parts.length
    ? parts.join(", ")
    : "Location not provided";
}

function getStatusCount(
  summary: BookingSummary | null,
  status: BookingStatus
): number {
  return (
    summary?.byStatus.find(
      (item) => item.status === status
    )?.count ?? 0
  );
}

function getName(
  person: Person | null | undefined
): string {
  return person?.name?.trim() || "Name unavailable";
}

/*
 * =========================================================
 * STATUS BADGE
 * =========================================================
 */

function StatusBadge({
  status,
}: {
  status: BookingStatus;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold ${statusClass(
        status
      )}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${statusDot(
          status
        )}`}
      />

      {formatStatus(status)}
    </span>
  );
}

/*
 * =========================================================
 * OVERVIEW CARD
 * =========================================================
 */

function SummaryCard({
  label,
  value,
  icon: Icon,
  active,
  onClick,
  color = "normal",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
  color?: "normal" | "attention";
}) {
  const content = (
    <div
      className={`rounded-2xl border bg-white p-4 transition ${
        active
          ? "border-[#FF5A36] ring-2 ring-[#FF5A36]/10"
          : color === "attention"
            ? "border-[#F1D1C9]"
            : "border-[#E8DED3]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-5 text-[#766C63]">
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-[#2E241F]">
            {value.toLocaleString("en-NG")}
          </p>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            color === "attention"
              ? "bg-[#FFF0E8] text-[#9F2D18]"
              : "bg-[#F7F1EB] text-[#9F2D18]"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {onClick && (
        <p className="mt-3 text-[11px] font-semibold text-[#9F2D18]">
          Filter bookings
        </p>
      )}
    </div>
  );

  if (!onClick) {
    return content;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left"
    >
      {content}
    </button>
  );
}

/*
 * =========================================================
 * DETAIL ROW
 * =========================================================
 */

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {Icon && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F7F1EB] text-[#9F2D18]">
          <Icon className="h-4 w-4" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-[#8B8178]">
          {label}
        </p>

        <p className="mt-1 break-words text-sm font-medium text-[#3D332D]">
          {value}
        </p>
      </div>
    </div>
  );
}

/*
 * =========================================================
 * ADMIN PAGE
 * =========================================================
 */

export default function AdminBookingsPage() {
  const pathname = usePathname();

  /*
   * -------------------------------------------------------
   * LIST STATE
   * -------------------------------------------------------
   */

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [summary, setSummary] = useState<BookingSummary | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const [draftFilters, setDraftFilters] =
    useState<BookingFilters>({ ...EMPTY_FILTERS });

  const [appliedFilters, setAppliedFilters] =
    useState<BookingFilters>({ ...EMPTY_FILTERS });

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  /*
   * -------------------------------------------------------
   * DETAIL STATE
   * -------------------------------------------------------
   */

  const [selectedBookingId, setSelectedBookingId] =
    useState<string | null>(null);

  const [detail, setDetail] =
    useState<BookingDetail | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [detailReloadVersion, setDetailReloadVersion] =
    useState(0);

  /*
   * -------------------------------------------------------
   * ADMIN STATUS UPDATE STATE
   * -------------------------------------------------------
   */

  const [nextStatus, setNextStatus] =
    useState<BookingStatus | "">("");

  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusSuccess, setStatusSuccess] = useState("");

  /*
   * -------------------------------------------------------
   * LOGOUT
   * -------------------------------------------------------
   */

  async function handleLogout() {
    try {
      await signOut({
        callbackUrl: "/admin/login",
      });
    } catch (logoutError) {
      console.error(
        "Admin logout error:",
        logoutError
      );
    }
  }

  /*
   * -------------------------------------------------------
   * LOAD ADMIN BOOKINGS
   * -------------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    const controller = new AbortController();

    async function loadBookings() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "20",
        });

        if (appliedFilters.q.trim()) {
          params.set("q", appliedFilters.q.trim());
        }

        if (
          appliedFilters.status &&
          appliedFilters.status !== "ALL"
        ) {
          params.set(
            "status",
            appliedFilters.status
          );
        }

        if (appliedFilters.from) {
          params.set("from", appliedFilters.from);
        }

        if (appliedFilters.to) {
          params.set("to", appliedFilters.to);
        }

        if (appliedFilters.sellerId.trim()) {
          params.set(
            "sellerId",
            appliedFilters.sellerId.trim()
          );
        }

        if (appliedFilters.serviceId.trim()) {
          params.set(
            "serviceId",
            appliedFilters.serviceId.trim()
          );
        }

        const response = await fetch(
          `/api/admin/bookings?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const result: unknown =
          await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            isRecord(result) &&
            typeof result.error === "string"
              ? result.error
              : "Unable to load service bookings.";

          throw new Error(message);
        }

        if (
          !isRecord(result) ||
          !Array.isArray(result.bookings) ||
          !isRecord(result.summary) ||
          !isRecord(result.pagination)
        ) {
          throw new Error(
            "The admin booking response is invalid."
          );
        }

        if (cancelled) {
          return;
        }

        setBookings(
          result.bookings as unknown as AdminBooking[]
        );

        setSummary(
          result.summary as unknown as BookingSummary
        );

        setPagination(
          result.pagination as unknown as Pagination
        );

        setGeneratedAt(
          typeof result.generatedAt === "string"
            ? result.generatedAt
            : null
        );

        /*
         * Handle a page that no longer exists after
         * records have been removed or filters changed.
         */

        const responsePagination =
          result.pagination as unknown as Pagination;

        if (
          responsePagination.totalPages > 0 &&
          page > responsePagination.totalPages
        ) {
          setPage(responsePagination.totalPages);
        } else if (
          responsePagination.totalPages === 0 &&
          page !== 1
        ) {
          setPage(1);
        }
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(
          "Admin booking list error:",
          loadError
        );

        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load service bookings."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadBookings();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [page, appliedFilters, reloadVersion]);

  /*
   * -------------------------------------------------------
   * LOAD BOOKING DETAILS
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!selectedBookingId) {
      return;
    }

    let cancelled = false;

    const controller = new AbortController();

    async function loadBookingDetail() {
      setDetailLoading(true);
      setDetailError("");
      setStatusError("");
      setStatusSuccess("");
      setDetail(null);
      setNextStatus("");

      try {
        const response = await fetch(
          `/api/admin/bookings/${encodeURIComponent(
            selectedBookingId!
          )}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const result: unknown =
          await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            isRecord(result) &&
            typeof result.error === "string"
              ? result.error
              : "Unable to load booking details.";

          throw new Error(message);
        }

        if (
          !isRecord(result) ||
          !isRecord(result.booking)
        ) {
          throw new Error(
            "The booking details response is invalid."
          );
        }

        if (cancelled) {
          return;
        }

        const booking =
          result.booking as unknown as BookingDetail;

        setDetail(booking);

        const allowed =
          getAllowedTransitions(booking);

        setNextStatus(allowed[0] ?? "");
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(
          "Admin booking detail error:",
          loadError
        );

        if (!cancelled) {
          setDetailError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load booking details."
          );
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadBookingDetail();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedBookingId, detailReloadVersion]);

  /*
   * -------------------------------------------------------
   * FILTER ACTIONS
   * -------------------------------------------------------
   */

  function handleApplyFilters(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      draftFilters.from &&
      draftFilters.to &&
      draftFilters.from > draftFilters.to
    ) {
      setError(
        "The start date cannot be later than the end date."
      );

      return;
    }

    setError("");
    setPage(1);
    setAppliedFilters({ ...draftFilters });
    setReloadVersion((value) => value + 1);
  }

  function handleClearFilters() {
    setDraftFilters({ ...EMPTY_FILTERS });
    setAppliedFilters({ ...EMPTY_FILTERS });
    setPage(1);
    setError("");
    setReloadVersion((value) => value + 1);
  }

  function handleStatusCardClick(
    status: BookingStatus | "ALL"
  ) {
    const updated: BookingFilters = {
      ...appliedFilters,
      status,
    };

    setDraftFilters(updated);
    setAppliedFilters(updated);
    setPage(1);
    setReloadVersion((value) => value + 1);
  }

  function updateDraftFilter<K extends keyof BookingFilters>(
    key: K,
    value: BookingFilters[K]
  ) {
    setDraftFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  /*
   * -------------------------------------------------------
   * OPEN AND CLOSE DETAIL PANEL
   * -------------------------------------------------------
   */

  function openBookingDetails(bookingId: string) {
    setDetail(null);
    setDetailError("");
    setSelectedBookingId(bookingId);
  }

  function closeBookingDetails() {
    if (savingStatus) {
      return;
    }

    setSelectedBookingId(null);
    setDetail(null);
    setStatusError("");
    setStatusSuccess("");
  }

  /*
   * -------------------------------------------------------
   * ADMIN STATUS UPDATE
   * -------------------------------------------------------
   */

  async function handleStatusUpdate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!detail || !nextStatus || savingStatus) {
      return;
    }

    const allowed = getAllowedTransitions(detail);

    if (!allowed.includes(nextStatus)) {
      setStatusError(
        "This status transition is not allowed."
      );

      return;
    }

    setSavingStatus(true);
    setStatusError("");
    setStatusSuccess("");

    try {
      const response = await fetch(
        `/api/admin/bookings/${encodeURIComponent(
          detail.id
        )}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            status: nextStatus,
          }),
        }
      );

      const result: unknown =
        await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          isRecord(result) &&
          typeof result.error === "string"
            ? result.error
            : "Unable to update booking status.";

        throw new Error(message);
      }

      setStatusSuccess(
        "Booking status updated successfully."
      );

      /*
       * Reload details from the server rather than
       * assuming the PATCH response contains every field.
       */

      setDetailReloadVersion((value) => value + 1);

      /*
       * Refresh the list and its summary.
       */

      setReloadVersion((value) => value + 1);
    } catch (updateError) {
      console.error(
        "Admin booking status update error:",
        updateError
      );

      setStatusError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update booking status."
      );
    } finally {
      setSavingStatus(false);
    }
  }

  /*
   * -------------------------------------------------------
   * PAGINATION
   * -------------------------------------------------------
   */

  const totalPages = Math.max(
    1,
    pagination?.totalPages ?? 0
  );

  const currentPage = Math.min(
    page,
    totalPages
  );

  const totalRecords =
    pagination?.total ?? 0;

  const startRecord =
    totalRecords === 0
      ? 0
      : (currentPage - 1) * (pagination?.limit ?? 20) + 1;

  const endRecord = Math.min(
    currentPage * (pagination?.limit ?? 20),
    totalRecords
  );

  /*
   * -------------------------------------------------------
   * ADMIN DETAIL CONTENT
   * -------------------------------------------------------
   */

  const allowedDetailTransitions = detail
    ? getAllowedTransitions(detail)
    : [];

  const hasPendingQuotation =
    detail?.status === "AWAITING_BUYER" &&
    detail.quoteSentAt !== null &&
    detail.quotedPrice !== null &&
    detail.quoteAcceptedAt === null;

  const bookingLocation = detail
    ? getBookingLocation(detail.service.business)
    : "";

  /*
   * =======================================================
   * RENDER
   * =======================================================
   */

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#FAF6EF] text-[#2E241F]">
      <div className="flex min-h-dvh w-full">

        {/* =================================================
            DESKTOP SIDEBAR
        ================================================= */}

        <aside className="hidden w-64 shrink-0 border-r border-[#E8DED3] bg-[#FFFDFC] lg:block">
          <div className="sticky top-0 flex h-dvh flex-col">

            <div className="border-b border-[#E8DED3] px-6 py-6">
              <Link
                href="/admin"
                className="flex items-center gap-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#9F2D18] text-sm font-bold text-white">
                  R
                </div>

                <div>
                  <p className="font-semibold text-[#2E241F]">
                    ReMarket
                  </p>

                  <p className="text-xs text-[#8B8178]">
                    Admin
                  </p>
                </div>
              </Link>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-6">
              <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9A9087]">
                Dashboard
              </p>

              <div className="space-y-1">
                {ADMIN_NAV.map((item) => {
                  const Icon = item.icon;

                  const active =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname === item.href ||
                        pathname.startsWith(
                          `${item.href}/`
                        );

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                        active
                          ? "bg-[#FFF0E8] text-[#9F2D18]"
                          : "text-[#6F675F] hover:bg-[#F7F1EB] hover:text-[#2E241F]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />

                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="border-t border-[#E8DED3] px-4 py-4">
              <div className="mb-4 px-2">
                <p className="text-xs text-[#9A9087]">
                  ReMarket Admin
                </p>

                <p className="mt-1 text-sm font-medium text-[#4B4038]">
                  Service management
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-[#9F2D18] transition hover:bg-[#FFF0E8]"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </div>
        </aside>

        {/* =================================================
            MAIN CONTENT
        ================================================= */}

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-3 pt-5 pb-36 sm:px-6 sm:pt-6 lg:px-8 lg:py-8 lg:pb-8">

            {/* HEADER */}

            <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#9F2D18]">
                  Admin Dashboard
                </p>

                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#2E241F] sm:text-3xl">
                  Service bookings
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766C63]">
                  Monitor buyer service requests, seller
                  responses, quotations, appointments
                  and booking activity across ReMarket.
                </p>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                <NotificationBell />

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-3 py-2 text-xs font-semibold text-[#6F675F] transition hover:border-[#D8C9BC] hover:bg-[#FFF0E8] hover:text-[#9F2D18]"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    Log out
                  </span>
                </button>
              </div>
            </div>

            {/* ERROR */}

            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#F1C5BF] bg-[#FFF4F2] p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#B42318]" />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#B42318]">
                    Unable to load bookings
                  </p>

                  <p className="mt-1 text-sm text-[#766C63]">
                    {error}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setReloadVersion((value) => value + 1)
                  }
                  className="shrink-0 text-xs font-semibold text-[#9F2D18] hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            {/* =================================================
                SUMMARY
            ================================================= */}

            <section>
              <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[#2E241F]">
                    Booking overview
                  </h2>

                  <p className="text-xs leading-5 text-[#8B8178]">
                    Counts reflect the current search, date,
                    seller and service filters.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setReloadVersion((value) => value + 1)
                  }
                  disabled={loading}
                  className="inline-flex items-center gap-2 self-start rounded-xl border border-[#E8DED3] bg-white px-3 py-2 text-xs font-semibold text-[#6F675F] transition hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:opacity-50 sm:self-auto"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      loading ? "animate-spin" : ""
                    }`}
                  />
                  Refresh
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">

                <SummaryCard
                  label="All matching bookings"
                  value={summary?.total ?? 0}
                  icon={CalendarDays}
                  active={appliedFilters.status === "ALL"}
                  onClick={() => handleStatusCardClick("ALL")}
                />

                <SummaryCard
                  label="Pending"
                  value={getStatusCount(summary, "PENDING")}
                  icon={Clock3}
                  active={appliedFilters.status === "PENDING"}
                  onClick={() => handleStatusCardClick("PENDING")}
                  color="attention"
                />

                <SummaryCard
                  label="Awaiting buyer"
                  value={getStatusCount(summary, "AWAITING_BUYER")}
                  icon={AlertCircle}
                  active={appliedFilters.status === "AWAITING_BUYER"}
                  onClick={() => handleStatusCardClick("AWAITING_BUYER")}
                  color="attention"
                />

                <SummaryCard
                  label="Accepted"
                  value={getStatusCount(summary, "ACCEPTED")}
                  icon={CheckCircle2}
                  active={appliedFilters.status === "ACCEPTED"}
                  onClick={() => handleStatusCardClick("ACCEPTED")}
                />

                <SummaryCard
                  label="In progress"
                  value={getStatusCount(summary, "IN_PROGRESS")}
                  icon={CalendarClock}
                  active={appliedFilters.status === "IN_PROGRESS"}
                  onClick={() => handleStatusCardClick("IN_PROGRESS")}
                />

                <SummaryCard
                  label="Completed"
                  value={getStatusCount(summary, "COMPLETED")}
                  icon={CheckCircle2}
                  active={appliedFilters.status === "COMPLETED"}
                  onClick={() => handleStatusCardClick("COMPLETED")}
                />

                <SummaryCard
                  label="Declined"
                  value={getStatusCount(summary, "DECLINED")}
                  icon={AlertCircle}
                  active={appliedFilters.status === "DECLINED"}
                  onClick={() => handleStatusCardClick("DECLINED")}
                />

                <SummaryCard
                  label="Cancelled"
                  value={getStatusCount(summary, "CANCELLED")}
                  icon={X}
                  active={appliedFilters.status === "CANCELLED"}
                  onClick={() => handleStatusCardClick("CANCELLED")}
                />
              </div>
            </section>

            {/* =================================================
                FILTERS
            ================================================= */}

            <section className="mt-7 rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]">
                  <Filter className="h-4 w-4" />
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-[#2E241F]">
                    Search and filters
                  </h2>

                  <p className="text-xs text-[#8B8178]">
                    Narrow down the bookings you want to inspect.
                  </p>
                </div>
              </div>

              <form onSubmit={handleApplyFilters}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">

                  {/* SEARCH */}

                  <label className="block xl:col-span-2">
                    <span className="mb-1.5 block text-xs font-semibold text-[#6F675F]">
                      Search bookings
                    </span>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9087]" />

                      <input
                        type="search"
                        value={draftFilters.q}
                        onChange={(event) =>
                          updateDraftFilter(
                            "q",
                            event.target.value
                          )
                        }
                        placeholder="Booking reference, buyer, seller, service or phone"
                        className="h-11 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] pl-10 pr-3 text-sm text-[#2E241F] outline-none transition placeholder:text-[#AAA097] focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
                      />
                    </div>
                  </label>

                  {/* STATUS */}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#6F675F]">
                      Booking status
                    </span>

                    <select
                      value={draftFilters.status}
                      onChange={(event) =>
                        updateDraftFilter(
                          "status",
                          event.target.value
                        )
                      }
                      className="h-11 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] px-3 text-sm text-[#2E241F] outline-none focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
                    >
                      <option value="ALL">
                        All statuses
                      </option>

                      {BOOKING_STATUSES.map((status) => (
                        <option
                          key={status}
                          value={status}
                        >
                          {formatStatus(status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* FROM */}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#6F675F]">
                      From date
                    </span>

                    <input
                      type="date"
                      value={draftFilters.from}
                      onChange={(event) =>
                        updateDraftFilter(
                          "from",
                          event.target.value
                        )
                      }
                      className="h-11 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] px-3 text-sm text-[#2E241F] outline-none focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </label>

                  {/* TO */}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#6F675F]">
                      To date
                    </span>

                    <input
                      type="date"
                      value={draftFilters.to}
                      onChange={(event) =>
                        updateDraftFilter(
                          "to",
                          event.target.value
                        )
                      }
                      className="h-11 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] px-3 text-sm text-[#2E241F] outline-none focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </label>

                  {/* SELLER ID */}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#6F675F]">
                      Seller account ID
                    </span>

                    <input
                      type="text"
                      value={draftFilters.sellerId}
                      onChange={(event) =>
                        updateDraftFilter(
                          "sellerId",
                          event.target.value
                        )
                      }
                      placeholder="Optional seller ID"
                      className="h-11 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] px-3 text-sm text-[#2E241F] outline-none placeholder:text-[#AAA097] focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </label>

                  {/* SERVICE ID */}

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#6F675F]">
                      Service ID
                    </span>

                    <input
                      type="text"
                      value={draftFilters.serviceId}
                      onChange={(event) =>
                        updateDraftFilter(
                          "serviceId",
                          event.target.value
                        )
                      }
                      placeholder="Optional service ID"
                      className="h-11 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] px-3 text-sm text-[#2E241F] outline-none placeholder:text-[#AAA097] focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0EAE4] pt-4">
                  <p className="text-xs text-[#8B8178]">
                    Filters are applied when you select Apply filters.
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="rounded-xl border border-[#E8DED3] bg-white px-4 py-2.5 text-xs font-semibold text-[#6F675F] transition hover:bg-[#F7F1EB]"
                    >
                      Clear
                    </button>

                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#E84B2C]"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Apply filters
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* =================================================
                BOOKING LIST
            ================================================= */}

            <section className="mt-7 overflow-hidden rounded-2xl border border-[#E8DED3] bg-white">

              <div className="flex flex-col gap-2 border-b border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <h2 className="font-semibold text-[#2E241F]">
                    All service bookings
                  </h2>

                  <p className="mt-1 text-xs text-[#8B8178]">
                    Review booking details and operational activity.
                  </p>
                </div>

                <div className="text-xs font-medium text-[#6F675F]">
                  {totalRecords.toLocaleString("en-NG")} matching records
                </div>
              </div>

              {/* LOADING */}

              {loading && bookings.length === 0 ? (
                <div className="space-y-4 p-5">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-28 animate-pulse rounded-xl bg-[#F7F1EB]"
                    />
                  ))}
                </div>
              ) : bookings.length === 0 ? (
                <div className="px-5 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]">
                    <CalendarDays className="h-7 w-7" />
                  </div>

                  <h3 className="mt-4 text-sm font-semibold text-[#2E241F]">
                    No service bookings found
                  </h3>

                  <p className="mx-auto mt-2 max-w-md text-xs leading-6 text-[#8B8178]">
                    There are no bookings matching your
                    current filters. Try changing your
                    search or clearing the filters.
                  </p>

                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="mt-4 rounded-xl bg-[#FFF0E8] px-4 py-2.5 text-xs font-semibold text-[#9F2D18] hover:bg-[#FFE3D7]"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  {/* MOBILE BOOKING CARDS */}

                  <div className="divide-y divide-[#E8DED3] lg:hidden">
                    {bookings.map((booking) => (
                      <article
                        key={booking.id}
                        className="p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#2E241F]">
                              {booking.bookingCode || booking.id}
                            </p>

                            <p className="mt-1 text-[11px] text-[#8B8178]">
                              {formatDateTime(booking.createdAt)}
                            </p>
                          </div>

                          <StatusBadge status={booking.status} />
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9A9087]">
                              Buyer
                            </p>

                            <p className="mt-1 truncate text-xs font-semibold text-[#3D332D]">
                              {getName(booking.buyer)}
                            </p>

                            <p className="mt-1 truncate text-[11px] text-[#8B8178]">
                              {booking.buyer.email || "No email"}
                            </p>
                          </div>

                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9A9087]">
                              Service
                            </p>

                            <p className="mt-1 truncate text-xs font-semibold text-[#3D332D]">
                              {booking.service.name}
                            </p>

                            <p className="mt-1 truncate text-[11px] text-[#8B8178]">
                              {booking.service.business.name}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-[#766C63]">
                          <span className="rounded-lg bg-[#F7F1EB] px-2 py-1">
                            {booking.bookingType}
                          </span>

                          <span className="rounded-lg bg-[#F7F1EB] px-2 py-1">
                            Qty: {booking.quantity}
                          </span>

                          <span className="inline-flex items-center gap-1 rounded-lg bg-[#F7F1EB] px-2 py-1">
                            <MessageSquare className="h-3 w-3" />
                            {booking._count.messages}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            openBookingDetails(booking.id)
                          }
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#E8DED3] bg-[#FFFDFC] px-3 py-3 text-xs font-semibold text-[#9F2D18] transition hover:bg-[#FFF0E8]"
                        >
                          <Eye className="h-4 w-4" />
                          View booking details
                        </button>
                      </article>
                    ))}
                  </div>

                  {/* DESKTOP TABLE */}

                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[1050px] text-left">
                      <thead className="bg-[#FCFAF6]">
                        <tr className="border-b border-[#E8DED3] text-[11px] font-semibold uppercase tracking-wide text-[#8B8178]">
                          <th className="px-5 py-4">
                            Booking
                          </th>

                          <th className="px-5 py-4">
                            Buyer
                          </th>

                          <th className="px-5 py-4">
                            Service / Provider
                          </th>

                          <th className="px-5 py-4">
                            Date
                          </th>

                          <th className="px-5 py-4">
                            Status
                          </th>

                          <th className="px-5 py-4">
                            Messages
                          </th>

                          <th className="px-5 py-4 text-right">
                            Action
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-[#E8DED3]">
                        {bookings.map((booking) => (
                          <tr
                            key={booking.id}
                            className="transition hover:bg-[#FFFCF8]"
                          >
                            <td className="px-5 py-4">
                              <p className="max-w-[170px] truncate text-xs font-semibold text-[#2E241F]">
                                {booking.bookingCode || booking.id}
                              </p>

                              <p className="mt-1 text-[11px] text-[#8B8178]">
                                {booking.bookingType}
                              </p>
                            </td>

                            <td className="px-5 py-4">
                              <p className="max-w-[170px] truncate text-xs font-semibold text-[#3D332D]">
                                {getName(booking.buyer)}
                              </p>

                              <p className="mt-1 max-w-[170px] truncate text-[11px] text-[#8B8178]">
                                {booking.buyer.email || "No email"}
                              </p>
                            </td>

                            <td className="px-5 py-4">
                              <p className="max-w-[190px] truncate text-xs font-semibold text-[#3D332D]">
                                {booking.service.name}
                              </p>

                              <p className="mt-1 max-w-[190px] truncate text-[11px] text-[#8B8178]">
                                {booking.service.business.name}
                              </p>
                            </td>

                            <td className="px-5 py-4">
                              <p className="text-xs font-medium text-[#3D332D]">
                                {formatDate(booking.createdAt)}
                              </p>

                              <p className="mt-1 text-[11px] text-[#8B8178]">
                                {booking.quantity} requested
                              </p>
                            </td>

                            <td className="px-5 py-4">
                              <StatusBadge status={booking.status} />
                            </td>

                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6F675F]">
                                <MessageSquare className="h-3.5 w-3.5" />

                                {booking._count.messages}
                              </span>
                            </td>

                            <td className="px-5 py-4 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  openBookingDetails(booking.id)
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8DED3] px-3 py-2 text-xs font-semibold text-[#9F2D18] transition hover:border-[#F1B5A5] hover:bg-[#FFF0E8]"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* PAGINATION */}

              <div className="flex flex-col gap-3 border-t border-[#E8DED3] bg-[#FCFAF6] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-xs text-[#8B8178]">
                  Showing {startRecord.toLocaleString("en-NG")}–
                  {endRecord.toLocaleString("en-NG")} of{" "}
                  {totalRecords.toLocaleString("en-NG")} bookings
                </p>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) =>
                        Math.max(1, current - 1)
                      )
                    }
                    disabled={
                      loading ||
                      !pagination?.hasPreviousPage
                    }
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] bg-white px-3 text-xs font-semibold text-[#6F675F] transition hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>

                  <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#6F675F]">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) =>
                        Math.min(totalPages, current + 1)
                      )
                    }
                    disabled={
                      loading ||
                      !pagination?.hasNextPage
                    }
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] bg-white px-3 text-xs font-semibold text-[#6F675F] transition hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </section>

            {/* LAST UPDATED */}

            {generatedAt && (
              <p className="mt-4 text-right text-[11px] text-[#9A9087]">
                Last refreshed: {formatDateTime(generatedAt)}
              </p>
            )}
          </div>
        </main>
      </div>

      {/* =====================================================
          MOBILE ADMIN NAVIGATION
      ===================================================== */}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8DED3] bg-[#FFFDFC]/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(46,36,31,0.08)] backdrop-blur lg:hidden"
        aria-label="Mobile admin navigation"
      >
        <div className="mx-auto grid w-full max-w-3xl grid-cols-4 gap-1">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;

            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[10px] font-semibold transition ${
                  active
                    ? "bg-[#FFF0E8] text-[#9F2D18]"
                    : "text-[#6F675F] hover:bg-[#F7F1EB]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />

                <span className="leading-tight">
                  {item.label === "Service bookings"
                    ? "Bookings"
                    : item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* =====================================================
          BOOKING DETAILS MODAL
      ===================================================== */}

      {selectedBookingId && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-[#2E241F]/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeBookingDetails();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-details-title"
            className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-[#FAF6EF] shadow-2xl sm:rounded-3xl"
          >
            {/* MODAL HEADER */}

            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#E8DED3] bg-[#FFFDFC] px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#9F2D18]">
                  Admin booking details
                </p>

                <h2
                  id="booking-details-title"
                  className="mt-1 truncate text-lg font-semibold text-[#2E241F] sm:text-xl"
                >
                  {detail?.bookingCode ||
                    selectedBookingId}
                </h2>

                {detail && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={detail.status} />

                    <span className="text-[11px] text-[#8B8178]">
                      Created {formatDate(detail.createdAt)}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={closeBookingDetails}
                disabled={savingStatus}
                aria-label="Close booking details"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E8DED3] bg-white text-[#6F675F] transition hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* MODAL BODY */}

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">

              {detailLoading && !detail && (
                <div className="space-y-4">
                  <div className="h-24 animate-pulse rounded-2xl bg-white" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="h-64 animate-pulse rounded-2xl bg-white" />
                    <div className="h-64 animate-pulse rounded-2xl bg-white" />
                  </div>
                </div>
              )}

              {detailError && (
                <div className="rounded-2xl border border-[#F1C5BF] bg-[#FFF4F2] p-4">
                  <p className="text-sm font-semibold text-[#B42318]">
                    Unable to load booking
                  </p>

                  <p className="mt-1 text-sm text-[#766C63]">
                    {detailError}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setDetailReloadVersion((value) => value + 1)
                    }
                    className="mt-3 text-xs font-semibold text-[#9F2D18] hover:underline"
                  >
                    Try again
                  </button>
                </div>
              )}

              {detail && (
                <div className="space-y-5">

                  {/* STATUS MANAGEMENT */}

                  <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]">
                        <Filter className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-[#2E241F]">
                          Manage booking status
                        </h3>

                        <p className="mt-1 text-xs leading-5 text-[#8B8178]">
                          Administrators can only select
                          permitted lifecycle transitions.
                        </p>
                      </div>
                    </div>

                    {hasPendingQuotation && (
                      <div className="mt-4 rounded-xl border border-[#F1D8B1] bg-[#FFF8EB] p-3">
                        <p className="text-xs font-semibold text-[#9F5A18]">
                          Buyer response required
                        </p>

                        <p className="mt-1 text-xs leading-5 text-[#766C63]">
                          This booking has an outstanding
                          seller quotation. The buyer must
                          respond before it can be accepted.
                        </p>
                      </div>
                    )}

                    {detail.bookingType === "APPOINTMENT" &&
                      !detail.scheduledFor && (
                        <div className="mt-4 rounded-xl border border-[#F1D8B1] bg-[#FFF8EB] p-3">
                          <p className="text-xs font-semibold text-[#9F5A18]">
                            Appointment not confirmed
                          </p>

                          <p className="mt-1 text-xs leading-5 text-[#766C63]">
                            The seller must confirm the
                            appointment date through the
                            seller booking workflow before
                            the administrator can mark it accepted.
                          </p>
                        </div>
                      )}

                    {statusError && (
                      <div className="mt-4 rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] p-3">
                        <p className="text-xs text-[#B42318]">
                          {statusError}
                        </p>
                      </div>
                    )}

                    {statusSuccess && (
                      <div className="mt-4 rounded-xl border border-[#CDE8D7] bg-[#F0FAF4] p-3">
                        <p className="text-xs text-[#287A4B]">
                          {statusSuccess}
                        </p>
                      </div>
                    )}

                    {allowedDetailTransitions.length > 0 ? (
                      <form
                        onSubmit={handleStatusUpdate}
                        className="mt-4 flex flex-col gap-3 sm:flex-row"
                      >
                        <select
                          value={nextStatus}
                          onChange={(event) =>
                            setNextStatus(
                              event.target.value as BookingStatus
                            )
                          }
                          disabled={savingStatus}
                          required
                          className="h-11 min-w-0 flex-1 rounded-xl border border-[#E8DED3] bg-[#FFFDFC] px-3 text-sm text-[#2E241F] outline-none focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10 disabled:opacity-60"
                        >
                          <option value="" disabled>
                            Select next status
                          </option>

                          {allowedDetailTransitions.map((status) => (
                            <option
                              key={status}
                              value={status}
                            >
                              {formatStatus(status)}
                            </option>
                          ))}
                        </select>

                        <button
                          type="submit"
                          disabled={
                            savingStatus || !nextStatus
                          }
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-xs font-semibold text-white transition hover:bg-[#E84B2C] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingStatus ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Updating
                            </>
                          ) : (
                            <>
                              Update status
                              <ArrowRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </form>
                    ) : (
                      <p className="mt-4 rounded-xl bg-[#F7F1EB] p-3 text-xs text-[#766C63]">
                        No further administrator status
                        transitions are available for this booking.
                      </p>
                    )}
                  </section>

                  {/* SERVICE AND BOOKING */}

                  <div className="grid gap-4 lg:grid-cols-2">

                    <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-[#9F2D18]" />

                        <h3 className="text-sm font-semibold text-[#2E241F]">
                          Service details
                        </h3>
                      </div>

                      <div className="space-y-1">
                        <DetailRow
                          label="Service"
                          value={detail.service.name}
                          icon={FileText}
                        />

                        <DetailRow
                          label="Business"
                          value={detail.service.business.name}
                          icon={Store}
                        />

                        <DetailRow
                          label="Service ID"
                          value={detail.service.id}
                        />

                        <DetailRow
                          label="Booking type"
                          value={detail.bookingType}
                        />

                        <DetailRow
                          label="Business location"
                          value={bookingLocation}
                          icon={MapPin}
                        />

                        <DetailRow
                          label="Service availability"
                          value={detail.service.availability}
                        />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <User className="h-4 w-4 text-[#9F2D18]" />

                        <h3 className="text-sm font-semibold text-[#2E241F]">
                          Participants
                        </h3>
                      </div>

                      <div className="space-y-1">
                        <DetailRow
                          label="Buyer"
                          value={getName(detail.buyer)}
                          icon={UserRound}
                        />

                        <DetailRow
                          label="Buyer email"
                          value={detail.buyer.email || "Not provided"}
                          icon={Mail}
                        />

                        <DetailRow
                          label="Buyer contact phone"
                          value={detail.contactPhone || "Not provided"}
                          icon={Phone}
                        />

                        <DetailRow
                          label="Assigned seller"
                          value={
                            detail.seller
                              ? getName(detail.seller)
                              : "Not assigned / legacy booking"
                          }
                          icon={Store}
                        />

                        <DetailRow
                          label="Seller email"
                          value={
                            detail.seller?.email ||
                            "Not available"
                          }
                          icon={Mail}
                        />

                        {detail.seller && (
                          <DetailRow
                            label="Seller account ID"
                            value={detail.seller.id}
                          />
                        )}
                      </div>
                    </section>

                    {/* APPOINTMENT AND FULFILLMENT */}

                    <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-[#9F2D18]" />

                        <h3 className="text-sm font-semibold text-[#2E241F]">
                          Schedule and fulfillment
                        </h3>
                      </div>

                      <div className="space-y-1">
                        <DetailRow
                          label="Requested date"
                          value={formatDateTime(detail.requestedFor)}
                          icon={Clock3}
                        />

                        <DetailRow
                          label="Confirmed date"
                          value={formatDateTime(detail.scheduledFor)}
                          icon={CalendarDays}
                        />

                        <DetailRow
                          label="Quantity"
                          value={String(detail.quantity)}
                        />

                        <DetailRow
                          label="Fulfillment method"
                          value={formatFulfillment(detail.fulfillmentType)}
                        />

                        <DetailRow
                          label="Fulfillment address"
                          value={detail.fulfillmentAddress || "Not provided"}
                          icon={MapPin}
                        />

                        <DetailRow
                          label="Service duration"
                          value={
                            detail.service.durationMinutes
                              ? `${detail.service.durationMinutes} minutes`
                              : "Not specified"
                          }
                        />
                      </div>
                    </section>

                    {/* QUOTATION */}

                    <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <Banknote className="h-4 w-4 text-[#9F2D18]" />

                        <h3 className="text-sm font-semibold text-[#2E241F]">
                          Quotation and agreed price
                        </h3>
                      </div>

                      <div className="space-y-1">
                        <DetailRow
                          label="Quoted amount"
                          value={formatMoney(
                            detail.quotedPrice,
                            detail.currency
                          )}
                        />

                        <DetailRow
                          label="Quotation sent"
                          value={formatDateTime(detail.quoteSentAt)}
                          icon={Clock3}
                        />

                        <DetailRow
                          label="Quotation message"
                          value={detail.quoteMessage || "No quotation message"}
                        />

                        <DetailRow
                          label="Agreed amount"
                          value={formatMoney(
                            detail.agreedPrice,
                            detail.currency
                          )}
                        />

                        <DetailRow
                          label="Quotation accepted"
                          value={formatDateTime(detail.quoteAcceptedAt)}
                          icon={CheckCircle2}
                        />

                        <DetailRow
                          label="Currency"
                          value={detail.currency}
                        />
                      </div>
                    </section>

                  </div>

                  {/* BOOKING MESSAGE */}

                  <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                    <div className="mb-3 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-[#9F2D18]" />

                      <h3 className="text-sm font-semibold text-[#2E241F]">
                        Initial buyer enquiry
                      </h3>
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-7 text-[#5B5048]">
                      {detail.buyerMessage ||
                        "The buyer did not include an initial message."}
                    </p>
                  </section>

                  {/* REASONS */}

                  {(detail.declineReason ||
                    detail.cancellationReason) && (
                    <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                      <h3 className="text-sm font-semibold text-[#2E241F]">
                        Booking notes and reasons
                      </h3>

                      {detail.declineReason && (
                        <div className="mt-3 rounded-xl bg-[#FFF4F2] p-3">
                          <p className="text-xs font-semibold text-[#B42318]">
                            Decline reason
                          </p>

                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#766C63]">
                            {detail.declineReason}
                          </p>
                        </div>
                      )}

                      {detail.cancellationReason && (
                        <div className="mt-3 rounded-xl bg-[#FFF8EB] p-3">
                          <p className="text-xs font-semibold text-[#9F5A18]">
                            Cancellation reason
                          </p>

                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#766C63]">
                            {detail.cancellationReason}
                          </p>
                        </div>
                      )}
                    </section>
                  )}

                  {/* LIFECYCLE */}

                  <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-[#2E241F]">
                      Booking timeline
                    </h3>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        {
                          label: "Created",
                          value: detail.createdAt,
                        },
                        {
                          label: "Accepted",
                          value: detail.acceptedAt,
                        },
                        {
                          label: "Declined",
                          value: detail.declinedAt,
                        },
                        {
                          label: "Cancelled",
                          value: detail.cancelledAt,
                        },
                        {
                          label: "Started",
                          value: detail.startedAt,
                        },
                        {
                          label: "Completed",
                          value: detail.completedAt,
                        },
                        {
                          label: "Last updated",
                          value: detail.updatedAt,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl bg-[#FCFAF6] p-3"
                        >
                          <p className="text-[11px] text-[#8B8178]">
                            {item.label}
                          </p>

                          <p className="mt-1 text-xs font-semibold text-[#3D332D]">
                            {formatDateTime(item.value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* MERCHANT NOTE */}

                  {detail.merchantNote && (
                    <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                      <h3 className="text-sm font-semibold text-[#2E241F]">
                        Private merchant note
                      </h3>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#766C63]">
                        {detail.merchantNote}
                      </p>

                      <p className="mt-2 text-[11px] text-[#9A9087]">
                        This note is visible to authorized administrators only.
                      </p>
                    </section>
                  )}

                  {/* CONVERSATION HISTORY */}

                  <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#2E241F]">
                          Conversation history
                        </h3>

                        <p className="mt-1 text-xs text-[#8B8178]">
                          Latest messages available to administrators.
                        </p>
                      </div>

                      <span className="rounded-full bg-[#FFF0E8] px-3 py-1 text-[11px] font-semibold text-[#9F2D18]">
                        {detail.messages.length} messages
                      </span>
                    </div>

                    {detail.messages.length === 0 ? (
                      <div className="py-8 text-center">
                        <MessageSquare className="mx-auto h-7 w-7 text-[#B8AEA5]" />

                        <p className="mt-3 text-xs text-[#8B8178]">
                          No conversation messages yet.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {[...detail.messages]
                          .reverse()
                          .map((message) => {
                            const isBuyer =
                              message.sender.role === "BUYER";

                            return (
                              <div
                                key={message.id}
                                className={`flex ${
                                  isBuyer
                                    ? "justify-start"
                                    : "justify-end"
                                }`}
                              >
                                <div
                                  className={`max-w-[90%] rounded-2xl p-3 sm:max-w-[75%] ${
                                    isBuyer
                                      ? "bg-[#F7F1EB]"
                                      : "bg-[#FFF0E8]"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-[11px] font-semibold text-[#6F675F]">
                                      {message.sender.name ||
                                        (isBuyer
                                          ? "Buyer"
                                          : "Seller")}
                                      <span className="ml-2 rounded-full bg-white/70 px-2 py-0.5 text-[9px] uppercase">
                                        {message.sender.role}
                                      </span>
                                    </p>

                                    <p className="text-[10px] text-[#9A9087]">
                                      {formatDateTime(message.createdAt)}
                                    </p>
                                  </div>

                                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#3D332D]">
                                    {message.body}
                                  </p>

                                  {message.readAt && (
                                    <p className="mt-2 text-right text-[10px] text-[#8B8178]">
                                      Read {formatDateTime(message.readAt)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </section>

                  {/* INTERNAL IDS */}

                  <section className="rounded-2xl border border-[#E8DED3] bg-[#FCFAF6] p-4">
                    <h3 className="text-xs font-semibold text-[#6F675F]">
                      Internal references
                    </h3>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] text-[#9A9087]">
                          Booking ID
                        </p>

                        <p className="mt-1 break-all text-xs font-medium text-[#4B4038]">
                          {detail.id}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] text-[#9A9087]">
                          Service ID
                        </p>

                        <p className="mt-1 break-all text-xs font-medium text-[#4B4038]">
                          {detail.serviceId}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] text-[#9A9087]">
                          Buyer ID
                        </p>

                        <p className="mt-1 break-all text-xs font-medium text-[#4B4038]">
                          {detail.buyerId}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] text-[#9A9087]">
                          Seller ID
                        </p>

                        <p className="mt-1 break-all text-xs font-medium text-[#4B4038]">
                          {detail.sellerId ||
                            detail.service.business.id}
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#E8DED3] bg-[#FFFDFC] px-4 py-3 sm:px-6">
              <p className="hidden text-[11px] text-[#8B8178] sm:block">
                ReMarket administration
              </p>

              <button
                type="button"
                onClick={closeBookingDetails}
                disabled={savingStatus}
                className="ml-auto rounded-xl border border-[#E8DED3] bg-white px-5 py-2.5 text-xs font-semibold text-[#6F675F] transition hover:bg-[#F7F1EB] disabled:opacity-50"
              >
                Close details
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
