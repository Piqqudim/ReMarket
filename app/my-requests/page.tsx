"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Plus,
  MapPin,
  Package,
  ChevronRight,
  Clock3,
  CheckCircle2,
  MessageCircle,
  XCircle,
  Loader2,
  Search,
} from "lucide-react";

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

type RequestStatus =
  | "NEW"
  | "MATCHED"
  | "CONTACTED"
  | "FULFILLED"
  | "UNFULFILLED"
  | "CLOSED";

type BuyerRequest = {
  id: string;
  query: string;
  category?: string | null;
  budget?: number | null;
  locationArea?: string | null;
  quantity?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  status: RequestStatus;
  createdAt: string;

  matches?: Array<{
    id: string;
    score: number;
    business: {
      id: string;
      name: string;
      verification: string;
      location?: {
        area: string;
      } | null;
    };
  }>;
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return `₦${value.toLocaleString("en-NG")}`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStatusInfo(status: RequestStatus) {
  switch (status) {
    case "MATCHED":
      return {
        label: "Matched",
        icon: CheckCircle2,
        className:
          "bg-[#E7F7ED] text-[#18794E]",
      };

    case "CONTACTED":
      return {
        label: "Contacted",
        icon: MessageCircle,
        className:
          "bg-[#E7E5FF] text-[#5146A6]",
      };

    case "FULFILLED":
      return {
        label: "Fulfilled",
        icon: CheckCircle2,
        className:
          "bg-[#DDF5EA] text-[#18794E]",
      };

    case "UNFULFILLED":
      return {
        label: "Not fulfilled",
        icon: XCircle,
        className:
          "bg-[#FFE4DE] text-[#A83A25]",
      };

    case "CLOSED":
      return {
        label: "Closed",
        icon: XCircle,
        className:
          "bg-[#EAE6DF] text-[#66615B]",
      };

    case "NEW":
    default:
      return {
        label: "Finding sellers",
        icon: Clock3,
        className:
          "bg-[#FFF0C7] text-[#8A6412]",
      };
  }
}

function RequestCard({
  request,
}: {
  request: BuyerRequest;
}) {
  const status = getStatusInfo(request.status);
  const StatusIcon = status.icon;

  const matches = request.matches ?? [];

  return (
    <article
      className="
        rounded-[18px]
        border border-[#EAE6DF]
        bg-white
        p-4
        shadow-[0_4px_18px_rgba(23,32,42,0.04)]
        transition
        hover:-translate-y-[1px]
        hover:shadow-[0_8px_24px_rgba(23,32,42,0.07)]
      "
    >
      <div className="flex gap-4">
        {/* Image / Icon */}
        <div
          className="
            flex
            h-16
            w-16
            shrink-0
            items-center
            justify-center
            overflow-hidden
            rounded-[14px]
            bg-[#FFF0D9]
          "
        >
          {request.imageUrl ? (
            <img
              src={request.imageUrl}
              alt={request.query}
              className="h-full w-full object-cover"
            />
          ) : (
            <Package
              size={26}
              strokeWidth={1.8}
              className="text-[#FF5A36]"
            />
          )}
        </div>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-[#17202A]">
                {request.query}
              </h2>

              {request.category && (
                <p className="mt-0.5 text-[12px] text-[#77716A]">
                  {request.category}
                </p>
              )}
            </div>

            <span
              className={`
                inline-flex
                items-center
                gap-1.5
                rounded-full
                px-2.5
                py-1
                text-[11px]
                font-bold
                ${status.className}
              `}
            >
              <StatusIcon size={13} />
              {status.label}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-[#6F6A64]">
            {request.locationArea && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} />
                {request.locationArea}
              </span>
            )}

            {request.budget !== null &&
              request.budget !== undefined && (
                <span className="inline-flex items-center gap-1">
                  Budget {formatMoney(request.budget)}
                </span>
              )}

            {request.quantity !== null &&
              request.quantity !== undefined && (
                <span className="inline-flex items-center gap-1">
                  Qty {request.quantity}
                </span>
              )}

            <span className="inline-flex items-center gap-1">
              <Clock3 size={13} />
              {formatDate(request.createdAt)}
            </span>
          </div>

          {request.description && (
            <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-[#55504A]">
              {request.description}
            </p>
          )}

          {/* Matches */}
          {matches.length > 0 && (
            <div className="mt-4 border-t border-[#EEEAE4] pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A847D]">
                Sellers found
              </p>

              <div className="flex flex-wrap gap-2">
                {matches.slice(0, 3).map((match) => (
                  <Link
                    key={match.id}
                    href={`/seller/${match.business.id}`}
                    className="
                      inline-flex
                      items-center
                      gap-1.5
                      rounded-full
                      border border-[#EAE6DF]
                      bg-[#FCFAF6]
                      px-3
                      py-1.5
                      text-[12px]
                      font-semibold
                      text-[#33302C]
                      transition
                      hover:border-[#FFB39F]
                      hover:bg-[#FFF7ED]
                    "
                  >
                    {match.business.name}

                    {match.business.verification ===
                      "VERIFIED" && (
                      <CheckCircle2
                        size={12}
                        className="text-[#18794E]"
                      />
                    )}
                  </Link>
                ))}

                {matches.length > 3 && (
                  <span className="px-1 py-1.5 text-[11px] font-semibold text-[#8A847D]">
                    +{matches.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Bottom action */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#99928A]">
              Request #{request.id.slice(-6)}
            </span>

            {matches.length > 0 && (
              <Link
                href={`/my-requests/${request.id}`}
                className="
                  inline-flex
                  items-center
                  gap-1
                  text-[12px]
                  font-bold
                  text-[#FF5A36]
                  hover:text-[#D94727]
                "
              >
                View matches
                <ChevronRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<
    BuyerRequest[]
  >([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    async function loadRequests() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          "/api/requests",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            "Unable to load requests"
          );
        }

        const data = await response.json();

        setRequests(
          Array.isArray(data.requests)
            ? data.requests
            : []
        );
      } catch (error) {
        console.error(
          "My requests error:",
          error
        );

        setError(
          "We couldn't load your requests right now."
        );
      } finally {
        setLoading(false);
      }
    }

    loadRequests();
  }, []);

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-0 md:p-4">
      <div
        className="
          mx-auto
          min-h-screen
          max-w-[1500px]
          overflow-hidden
          rounded-none
          border-[#FF5A36]
          bg-[#FFFDFC]
          shadow-none

          md:min-h-[calc(100vh-32px)]
          md:rounded-[22px]
          md:border
          md:shadow-[0_12px_40px_rgba(159,45,24,0.08)]
        "
      >
        {/* Header */}
        <header
          className="
            flex
            h-[66px]
            items-center
            justify-between
            border-b
            border-[#EAE6DF]
            bg-white
            px-4
            md:px-6
          "
        >
          <Link
            href="/"
            className="flex items-center gap-2"
          >
            <div
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-[11px]
                bg-[#FF5A36]
                text-white
              "
            >
              <Search size={19} />
            </div>

            <div className="leading-none">
              <div className="text-[17px] font-extrabold tracking-tight text-[#17202A]">
                ReMarket
              </div>

              <div className="mt-1 text-[10px] font-medium text-[#8A847D]">
                Find it nearby
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/request"
              className="
                inline-flex
                items-center
                gap-2
                rounded-[11px]
                bg-[#FF5A36]
                px-4
                py-2.5
                text-[12px]
                font-bold
                text-white
                transition
                hover:bg-[#E94D2D]
              "
            >
              <Plus size={15} />
              Request something
            </Link>
          </div>
        </header>

        <div className="flex min-h-[calc(100vh-66px)]">
          {/* Desktop Sidebar */}
          <aside
            className="
              hidden
              w-[190px]
              shrink-0
              border-r
              border-[#EAE6DF]
              bg-[#FCFAF6]
              px-3
              py-4
              md:block
            "
          >
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                const active =
                  item.href ===
                  "/my-requests";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex
                      items-center
                      gap-3
                      rounded-[11px]
                      px-3
                      py-2.5
                      text-[12px]
                      font-semibold
                      transition
                      ${
                        active
                          ? "bg-[#FFE0D6] text-[#9F2D18]"
                          : "text-[#6F6A64] hover:bg-[#F3EEE7] hover:text-[#292622]"
                      }
                    `}
                  >
                    <Icon size={17} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 rounded-[14px] bg-[#FFF0D9] p-3">
              <p className="text-[12px] font-bold text-[#7E321F]">
                Can't find it?
              </p>

              <p className="mt-1 text-[11px] leading-4 text-[#91644F]">
                Tell ReMarket what you need and
                we'll look for sellers nearby.
              </p>

              <Link
                href="/request"
                className="
                  mt-3
                  inline-flex
                  items-center
                  gap-1
                  text-[11px]
                  font-bold
                  text-[#FF5A36]
                "
              >
                Make a request
                <ChevronRight size={13} />
              </Link>
            </div>
          </aside>

          {/* Main */}
          <section className="min-w-0 flex-1 px-4 py-5 pb-24 md:px-6 md:py-6 md:pb-6">
            <div className="mx-auto max-w-[1050px]">
              {/* Heading */}
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF5A36]">
                    Your activity
                  </p>

                  <h1 className="mt-1 text-[25px] font-extrabold tracking-tight text-[#17202A]">
                    My Requests
                  </h1>

                  <p className="mt-1 max-w-[600px] text-[13px] leading-5 text-[#77716A]">
                    Keep track of the things you've
                    asked ReMarket to find nearby.
                  </p>
                </div>

                <Link
                  href="/request"
                  className="
                    inline-flex
                    w-fit
                    items-center
                    gap-2
                    rounded-[11px]
                    bg-[#FF5A36]
                    px-4
                    py-2.5
                    text-[12px]
                    font-bold
                    text-white
                    transition
                    hover:bg-[#E94D2D]
                  "
                >
                  <Plus size={15} />
                  New request
                </Link>
              </div>

              {/* Content */}
              <div className="mt-6">
                {loading ? (
                  <div className="flex min-h-[300px] items-center justify-center">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-[#77716A]">
                      <Loader2
                        size={18}
                        className="animate-spin"
                      />
                      Loading your requests...
                    </div>
                  </div>
                ) : error ? (
                  <div className="rounded-[18px] border border-[#F0C7BE] bg-[#FFF1ED] p-6 text-center">
                    <p className="text-[14px] font-bold text-[#9F2D18]">
                      Something went wrong
                    </p>

                    <p className="mt-1 text-[12px] text-[#8C6257]">
                      {error}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        window.location.reload()
                      }
                      className="
                        mt-4
                        rounded-[10px]
                        bg-[#FF5A36]
                        px-4
                        py-2
                        text-[12px]
                        font-bold
                        text-white
                      "
                    >
                      Try again
                    </button>
                  </div>
                ) : requests.length === 0 ? (
                  <div
                    className="
                      flex
                      min-h-[360px]
                      flex-col
                      items-center
                      justify-center
                      rounded-[20px]
                      border
                      border-dashed
                      border-[#E5DED4]
                      bg-[#FCFAF6]
                      px-6
                      text-center
                    "
                  >
                    <div
                      className="
                        flex
                        h-16
                        w-16
                        items-center
                        justify-center
                        rounded-full
                        bg-[#FFE0D6]
                        text-[#FF5A36]
                      "
                    >
                      <ClipboardList
                        size={28}
                        strokeWidth={1.8}
                      />
                    </div>

                    <h2 className="mt-4 text-[17px] font-bold text-[#17202A]">
                      No requests yet
                    </h2>

                    <p className="mt-1 max-w-[400px] text-[12px] leading-5 text-[#77716A]">
                      Can't find what you're looking
                      for? Create a request and let
                      nearby sellers find you.
                    </p>

                    <Link
                      href="/request"
                      className="
                        mt-5
                        inline-flex
                        items-center
                        gap-2
                        rounded-[11px]
                        bg-[#FF5A36]
                        px-4
                        py-2.5
                        text-[12px]
                        font-bold
                        text-white
                      "
                    >
                      <Plus size={15} />
                      Request something
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {requests.map((request) => (
                      <RequestCard
                        key={request.id}
                        request={request}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav
          className="
            fixed
            bottom-0
            left-0
            right-0
            z-40
            border-t
            border-[#EAE6DF]
            bg-white/95
            px-2
            py-2
            backdrop-blur
            md:hidden
          "
        >
          <div className="mx-auto flex max-w-[500px] items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              const active =
                item.href === "/my-requests";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex
                    min-w-[62px]
                    flex-col
                    items-center
                    gap-1
                    rounded-[10px]
                    px-2
                    py-1.5
                    text-[10px]
                    font-semibold
                    ${
                      active
                        ? "text-[#FF5A36]"
                        : "text-[#77716A]"
                    }
                  `}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </main>
  );
}