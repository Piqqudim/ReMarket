
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ImageIcon,
  Loader2,
  MessageCircle,
  Package,
  RefreshCw,
  Store,
  XCircle,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

type Booking = {
  id: string;
  status: string;
  requestedFor: string | null;
  quantity: number;
  contactPhone: string | null;
  buyerMessage: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;

  service: {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    priceMin: number | null;
    priceMax: number | null;
    durationMinutes: number | null;
    fulfillmentType: string;
    availability: string;
    imageUrl: string | null;
    category: {
      id: string;
      name: string;
      iconKey?: string;
    } | null;
    images: {
      id: string;
      url: string;
      sortOrder: number;
    }[];
    seller: {
      id: string;
      name: string;
      ownerName: string | null;
      imageUrl: string | null;
      verification: string;
      verified: boolean;
      location: {
        area: string;
        street: string | null;
      } | null;
    };
  };

};

type BookingResponse = {
  bookings?: Booking[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  error?: string;
};

const PAGE_SIZE = 12;

function formatMoney(
  price: number | null,
  min: number | null,
  max: number | null
) {
  const format = (amount: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);

  if (min !== null && max !== null) {
    return min === max
      ? format(min)
      : `From ${format(min)}`;
  }

  if (min !== null) return `From ${format(min)}`;
  if (price !== null) return format(price);
  if (max !== null) return `Up to ${format(max)}`;

  return "Price on request";
}

function formatDate(value: string | null) {
  if (!value) return "Not specified";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not specified";
  }

  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusDetails(status: string) {
  switch (status) {
    case "ACCEPTED":
      return {
        label: "Accepted",
        description: "The provider accepted your request.",
        className: "bg-green-50 text-green-700",
        icon: CheckCircle2,
      };

    case "DECLINED":
      return {
        label: "Declined",
        description: "The provider declined this request.",
        className: "bg-red-50 text-red-700",
        icon: XCircle,
      };

    case "CANCELLED":
      return {
        label: "Cancelled",
        description: "This booking has been cancelled.",
        className: "bg-gray-100 text-gray-700",
        icon: XCircle,
      };

    case "COMPLETED":
      return {
        label: "Completed",
        description: "This service booking is completed.",
        className: "bg-blue-50 text-blue-700",
        icon: CheckCircle2,
      };

    case "PENDING":
    default:
      return {
        label: "Awaiting provider",
        description: "Your request is waiting for a response.",
        className: "bg-amber-50 text-amber-700",
        icon: Clock3,
      };
  }
}

function getServiceImage(booking: Booking) {
  return (
    booking.service.imageUrl ||
    booking.service.images?.[0]?.url ||
    null
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  const status = statusDetails(booking.status);
  const StatusIcon = status.icon;
  const image = getServiceImage(booking);

  const canOpenConversation =
    booking.status === "ACCEPTED" ||
    booking.status === "COMPLETED" ||
    booking.messageCount > 0;

  const location =
    booking.service.seller.location?.area ||
    "Location to be confirmed";

  return (
    <article className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-sm">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* SERVICE IMAGE */}
          <Link
            href={`/service/${encodeURIComponent(
              booking.service.id
            )}`}
            className="h-32 w-full shrink-0 overflow-hidden rounded-xl bg-[#FCFAF6] sm:h-28 sm:w-36"
          >
            {image ? (
              <img
                src={image}
                alt={booking.service.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[#C4A99F]">
                <ImageIcon className="h-9 w-9" />
              </div>
            )}
          </Link>

          {/* SERVICE INFORMATION */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-full bg-[#FFF0E9] px-2.5 py-1 text-[10px] font-bold text-[#9F2D18]">
                {booking.service.category?.name || "Service"}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${status.className}`}
              >
                <StatusIcon className="h-3.5 w-3.5" />
                {status.label}
              </span>
            </div>

            <Link
              href={`/service/${encodeURIComponent(
                booking.service.id
              )}`}
              className="mt-2 block text-base font-extrabold text-[#292421] hover:text-[#FF5A36]"
            >
              {booking.service.name}
            </Link>

            <Link
              href={`/business/${encodeURIComponent(
                booking.service.seller.id
              )}`}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#81766D] hover:text-[#9F2D18]"
            >
              <Store className="h-3.5 w-3.5" />
              {booking.service.seller.name}
            </Link>

            <p className="mt-2 text-sm font-bold text-[#9F2D18]">
              {formatMoney(
                booking.service.price,
                booking.service.priceMin,
                booking.service.priceMax
              )}
            </p>
          </div>
        </div>

        {/* BOOKING DETAILS */}
        <div className="mt-4 grid gap-3 border-t border-[#F0ECE6] pt-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#A49A91]">
              Preferred date
            </p>
            <p className="mt-1 text-xs font-semibold text-[#514940]">
              {formatDate(booking.requestedFor)}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#A49A91]">
              Quantity
            </p>
            <p className="mt-1 text-xs font-semibold text-[#514940]">
              {booking.quantity}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#A49A91]">
              Provider location
            </p>
            <p className="mt-1 text-xs font-semibold text-[#514940]">
              {location}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#A49A91]">
              Request submitted
            </p>
            <p className="mt-1 text-xs font-semibold text-[#514940]">
              {formatDate(booking.createdAt)}
            </p>
          </div>
        </div>

        {booking.buyerMessage && (
          <div className="mt-4 rounded-xl bg-[#FCFAF6] p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#81766D]">
              Your message
            </p>
            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-[#514940]">
              {booking.buyerMessage}
            </p>
          </div>
        )}

        {/* STATUS EXPLANATION */}
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#FCFAF6] p-3">
          <StatusIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" />
          <p className="text-xs leading-5 text-[#6F675F]">
            {status.description}
          </p>
        </div>

        {/* ACTIONS */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/service/${encodeURIComponent(
              booking.service.id
            )}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] px-4 py-2 text-xs font-bold text-[#6F675F] hover:bg-[#FCFAF6]"
          >
            View service
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          {canOpenConversation && (
            <Link
              href={`/service-bookings/${encodeURIComponent(
                booking.id
              )}/messages`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2 text-xs font-bold text-white hover:bg-[#E94C2A]"
            >
              <MessageCircle className="h-4 w-4" />
              Open conversation
              {booking.messageCount > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                  {booking.messageCount}
                </span>
              )}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export default function BuyerBookingsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const role = (
    session?.user as
      | { role?: string }
      | undefined
  )?.role;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (sessionStatus === "loading") return;

    if (sessionStatus === "unauthenticated") {
      router.replace(
        `/buyer/login?callbackUrl=${encodeURIComponent("/bookings")}`
      );
      return;
    }

    if (role === "SELLER") {
      router.replace("/seller");
      return;
    }

    if (role === "ADMIN") {
      router.replace("/admin");
      return;
    }

    const controller = new AbortController();

    async function loadBookings() {
      setLoading(true);
      setLoadError("");

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });

        const response = await fetch(
          `/api/service-bookings?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data = (await response.json()) as BookingResponse;

        if (!response.ok) {
          throw new Error(
            data.error || "Unable to load your bookings."
          );
        }

        setBookings(
          Array.isArray(data.bookings) ? data.bookings : []
        );
        setTotal(typeof data.total === "number" ? data.total : 0);
        setTotalPages(
          typeof data.totalPages === "number"
            ? data.totalPages
            : 0
        );
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error("Buyer bookings error:", error);

        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load your bookings."
        );
        setBookings([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadBookings();

    return () => controller.abort();
  }, [sessionStatus, role, router, page, retry]);

  if (
    sessionStatus === "loading" ||
    sessionStatus === "unauthenticated" ||
    role === "SELLER" ||
    role === "ADMIN"
  ) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#FFF7ED]">
        <Loader2 className="h-7 w-7 animate-spin text-[#FF5A36]" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#FFF7ED]">
      <SiteHeader searchMode="SERVICES" />

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
        {/* PAGE HEADER */}
        <div className="mb-6">
          <Link
            href="/profile"
            className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#81766D] hover:text-[#9F2D18]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to profile
          </Link>

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#FFF0E9] px-3 py-1.5 text-xs font-bold text-[#9F2D18]">
                <CalendarDays className="h-3.5 w-3.5" />
                Buyer account
              </div>

              <h1 className="text-2xl font-extrabold text-[#292421] sm:text-3xl">
                My service bookings
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[#81766D]">
                Follow your service requests and see when providers respond.
              </p>
            </div>

            <div className="rounded-xl border border-[#EAE6DF] bg-white px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#A49A91]">
                Total requests
              </p>
              <p className="mt-1 text-xl font-extrabold text-[#9F2D18]">
                {total}
              </p>
            </div>
          </div>
        </div>

        {/* RESULTS */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-64 animate-pulse rounded-2xl border border-[#EAE6DF] bg-white"
              />
            ))}
          </div>
        ) : loadError ? (
          <section className="rounded-2xl border border-[#EAE6DF] bg-white px-5 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E9] text-[#FF5A36]">
              <RefreshCw className="h-6 w-6" />
            </div>

            <h2 className="mt-4 text-lg font-bold text-[#292421]">
              Couldn't load your bookings
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-[#81766D]">
              {loadError}
            </p>

            <button
              type="button"
              onClick={() => setRetry((current) => current + 1)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white hover:bg-[#E94A28]"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </section>
        ) : bookings.length === 0 ? (
          <section className="rounded-2xl border border-[#EAE6DF] bg-white px-5 py-14 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF0E9] text-[#FF5A36]">
              <Package className="h-8 w-8" />
            </div>

            <h2 className="mt-4 text-lg font-bold text-[#292421]">
              No service bookings yet
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#81766D]">
              When you request a service from a provider, your booking will appear here.
            </p>

            <Link
              href="/services"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white hover:bg-[#E94A28]"
            >
              Explore services
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs text-[#81766D]">
                Showing {bookings.length} of {total} booking requests
              </p>

              <button
                type="button"
                onClick={() => setRetry((current) => current + 1)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#9F2D18] hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>

            <div className="space-y-4">
              {bookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EAE6DF] bg-white px-4 py-3">
                <p className="text-xs text-[#81766D]">
                  Page <strong>{page}</strong> of{" "}
                  <strong>{totalPages}</strong>
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                    disabled={page <= 1 || loading}
                    className="rounded-xl border border-[#EAE6DF] px-4 py-2.5 text-xs font-bold text-[#6F675F] hover:bg-[#FCFAF6] disabled:opacity-40"
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) =>
                        Math.min(totalPages, current + 1)
                      )
                    }
                    disabled={page >= totalPages || loading}
                    className="rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* FOOTER GUIDANCE */}
        <div className="mt-7 rounded-2xl border border-[#F1DDD3] bg-[#FFF0E9] p-5">
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" />
            <div>
              <h2 className="text-sm font-bold text-[#292421]">
                Need to discuss a booking?
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#766B62]">
                Open the conversation attached to an eligible booking to communicate with the service provider.
              </p>
            </div>
          </div>
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
