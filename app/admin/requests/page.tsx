"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  Package,
  Search,
  Store,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

type RequestStatus =
  | "NEW"
  | "MATCHED"
  | "CONTACTED"
  | "FULFILLED"
  | "UNFULFILLED"
  | "CLOSED";

type RequestMatch = {
  id: string;
  score: number;
  business: {
    id: string;
    name: string;
    area: string;
    verified: boolean;
  };
};

type BuyerRequest = {
  id: string;
  requestCode: string;
  query: string;
  category: string | null;
  budget: number | null;
  locationArea: string | null;
  quantity: number | null;
  description: string | null;
  status: RequestStatus;
  buyerContact: string;
  createdAt: string;
  matches: RequestMatch[];
};

const NAV_ITEMS = [
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
    label: "Requests",
    href: "/admin/requests",
    icon: ClipboardList,
  },
];

const STATUSES: RequestStatus[] = [
  "NEW",
  "MATCHED",
  "CONTACTED",
  "FULFILLED",
  "UNFULFILLED",
  "CLOSED",
];

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<BuyerRequest[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadRequests() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (query.trim()) {
        params.set("q", query.trim());
      }

      if (status) {
        params.set("status", status);
      }

      const response = await fetch(
        `/api/admin/requests?${params.toString()}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load requests"
        );
      }

      setRequests(data.requests);
    } catch (error) {
      console.error(error);
      setError("We couldn't load the requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRequests();
    }, 250);

    return () => clearTimeout(timer);
  }, [query, status]);

  async function updateRequest(
    id: string,
    nextStatus: RequestStatus
  ) {
    try {
      setUpdatingId(id);
      setError("");

      const response = await fetch(
        `/api/admin/requests/${id}`,
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to update request"
        );
      }

      setRequests((current) =>
        current.map((request) =>
          request.id === id
            ? {
                ...request,
                ...data.request,
              }
            : request
        )
      );
    } catch (error) {
      console.error(error);
      setError("We couldn't update that request.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:min-h-[calc(100vh-40px)]">
        {/* Sidebar */}
        <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] lg:block">
          <div className="flex h-[66px] items-center border-b border-[#EAE6DF] px-5">
            <Link
              href="/admin"
              className="text-xl font-black tracking-tight"
            >
              <span className="text-[#FF5A36]">Re</span>
              <span className="text-[#17202A]">Market</span>
            </Link>
          </div>

          <nav className="space-y-1 p-3">
            <p className="mb-3 px-3 pt-2 text-[11px] font-bold uppercase tracking-wider text-[#A39A91]">
              Admin
            </p>

            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    item.href === "/admin/requests"
                      ? "bg-[#FFE0D6] text-[#9F2D18]"
                      : "text-[#6F675F] hover:bg-[#FFF0D9]"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <section className="min-w-0 flex-1">
          <header className="flex h-[66px] items-center justify-between border-b border-[#EAE6DF] px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FCFAF6] text-[#6F675F] lg:hidden"
                aria-label="Back to admin"
              >
                <ArrowLeft size={17} />
              </Link>

              <div>
                <p className="text-xs font-medium text-[#8A8178]">
                  Admin
                </p>

                <h1 className="text-lg font-black text-[#17202A]">
                  Requests
                </h1>
              </div>
            </div>

            <Link
              href="/"
              className="rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
            >
              Marketplace
            </Link>
          </header>

          <div className="p-4 sm:p-6">
            {/* Mobile navigation */}
            <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                      item.href === "/admin/requests"
                        ? "bg-[#FF5A36] text-white"
                        : "bg-[#FCFAF6] text-[#6F675F]"
                    }`}
                  >
                    <Icon size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-2xl font-black tracking-tight text-[#17202A]">
                Buyer requests
              </h2>

              <p className="mt-1 text-sm text-[#8A8178]">
                Monitor requests and see which businesses were matched.
              </p>
            </div>

            {/* Filters */}
            <div className="mb-5 rounded-2xl border border-[#EAE6DF] bg-white p-3">
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A39A91]"
                  />

                  <input
                    value={query}
                    onChange={(event) =>
                      setQuery(event.target.value)
                    }
                    placeholder="Search request code, item or contact..."
                    className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] pl-10 pr-4 text-sm text-[#17202A] outline-none placeholder:text-[#A39A91] focus:border-[#FF5A36]"
                  />
                </div>

                <FilterSelect
                  value={status}
                  onChange={setStatus}
                  options={[
                    ["", "All statuses"],
                    ...STATUSES.map((item) => [
                      item,
                      formatStatus(item),
                    ] as [string, string]),
                  ]}
                />
              </div>
            </div>

            {error && (
              <div className="mb-5 flex items-center justify-between rounded-2xl border border-[#F2C7BC] bg-[#FFF0ED] px-4 py-3">
                <p className="text-sm font-semibold text-[#9F2D18]">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                  className="text-[#9F2D18]"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            {loading ? (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-10 text-center">
                <p className="text-sm font-medium text-[#8A8178]">
                  Loading requests...
                </p>
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0C7] text-[#9F5A18]">
                  <ClipboardList size={22} />
                </div>

                <h3 className="mt-4 font-black text-[#17202A]">
                  No requests found
                </h3>

                <p className="mt-1 text-sm text-[#8A8178]">
                  Try changing your search or status filter.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    updating={
                      updatingId === request.id
                    }
                    onUpdate={updateRequest}
                  />
                ))}
              </div>
            )}

            <p className="mt-4 text-xs font-medium text-[#A39A91]">
              {requests.length} request
              {requests.length === 1 ? "" : "s"} shown
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function RequestCard({
  request,
  updating,
  onUpdate,
}: {
  request: BuyerRequest;
  updating: boolean;
  onUpdate: (
    id: string,
    status: RequestStatus
  ) => void;
}) {
  return (
    <article className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-[#FFE0D6] px-2.5 py-1 text-xs font-black text-[#9F2D18]">
              {request.requestCode}
            </span>

            <StatusBadge status={request.status} />
          </div>

          <h3 className="mt-3 text-lg font-black text-[#17202A]">
            {request.query}
          </h3>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8A8178]">
            {request.category && (
              <span>{request.category}</span>
            )}

            {request.locationArea && (
              <span>{request.locationArea}</span>
            )}

            {request.quantity != null && (
              <span>
                Qty: {request.quantity}
              </span>
            )}

            {request.budget != null && (
              <span>
                Budget: ₦
                {request.budget.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <StatusSelect
          value={request.status}
          disabled={updating}
          onChange={(value) =>
            onUpdate(request.id, value)
          }
        />
      </div>

      {request.description && (
        <div className="mt-4 rounded-xl bg-[#FCFAF6] p-3">
          <p className="text-xs font-bold text-[#8A8178]">
            Details
          </p>

          <p className="mt-1 text-sm leading-6 text-[#6F675F]">
            {request.description}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4 border-t border-[#EAE6DF] pt-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#A39A91]">
            Buyer contact
          </p>

          <p className="mt-1 text-sm font-semibold text-[#17202A]">
            {request.buyerContact}
          </p>
        </div>

        <div className="sm:text-right">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#A39A91]">
            Created
          </p>

          <p className="mt-1 text-sm text-[#6F675F]">
            {new Date(
              request.createdAt
            ).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Matches */}
      <div className="mt-4 border-t border-[#EAE6DF] pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-[#17202A]">
            Matched businesses
          </p>

          <span className="rounded-full bg-[#FCFAF6] px-2.5 py-1 text-[11px] font-bold text-[#6F675F]">
            {request.matches.length}
          </span>
        </div>

        {request.matches.length === 0 ? (
          <p className="mt-3 text-sm text-[#A39A91]">
            No businesses matched yet.
          </p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {request.matches.map((match) => (
              <Link
                key={match.id}
                href={`/seller/${match.business.id}`}
                className="rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-3 transition hover:border-[#FF5A36]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-[#17202A]">
                    {match.business.name}
                  </p>

                  {match.business.verified && (
                    <span className="shrink-0 text-[10px] font-bold text-[#FF5A36]">
                      Verified
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs text-[#8A8178]">
                  {match.business.area}
                </p>

                <p className="mt-2 text-[11px] font-bold text-[#FF5A36]">
                  Match score: {match.score}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function StatusBadge({
  status,
}: {
  status: RequestStatus;
}) {
  const classes: Record<RequestStatus, string> = {
    NEW: "bg-[#FFF0C7] text-[#9F5A18]",
    MATCHED: "bg-[#DDF5EA] text-[#287A4B]",
    CONTACTED: "bg-[#E7E5FF] text-[#554DA8]",
    FULFILLED: "bg-[#DDF5EA] text-[#287A4B]",
    UNFULFILLED: "bg-[#FFE0D6] text-[#9F2D18]",
    CLOSED: "bg-[#F0ECE7] text-[#6F675F]",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${classes[status]}`}
    >
      {formatStatus(status)}
    </span>
  );
}

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: RequestStatus;
  disabled: boolean;
  onChange: (value: RequestStatus) => void;
}) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value as RequestStatus
          )
        }
        className="h-10 appearance-none rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] pl-3 pr-9 text-xs font-bold text-[#6F675F] outline-none focus:border-[#FF5A36] disabled:opacity-50"
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {formatStatus(status)}
          </option>
        ))}
      </select>

      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8178]"
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-11 min-w-[155px] appearance-none rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] pl-3 pr-9 text-sm font-medium text-[#6F675F] outline-none focus:border-[#FF5A36]"
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8178]"
      />
    </div>
  );
}

function formatStatus(status: RequestStatus) {
  return status
    .toLowerCase()
    .replace("_", " ")
    .replace(/^\w/, (character) =>
      character.toUpperCase()
    );
}