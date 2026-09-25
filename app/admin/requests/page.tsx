"use client";

import {
  ClipboardList,
  Home,
  Package,
  Search,
  Store,
  Users,
  X,
  CheckCircle2,
  Clock3,
  Phone,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

type RequestStatus =
  | "NEW"
  | "MATCHED"
  | "CONTACTED"
  | "FULFILLED"
  | "UNFULFILLED"
  | "CLOSED";

type BusinessMatch = {
  id: string;
  score: number;
  addedManually: boolean;
  business: {
    id: string;
    name: string;
    area: string | null;
    verification: "VERIFIED" | "UNVERIFIED";
    verified: boolean;
    status: "ACTIVE" | "INACTIVE" | "PENDING";
  };
};

type AdminRequest = {
  id: string;
  requestCode: string;
  query: string;
  category: {
    id: string;
    name: string;
  } | null;
  budget: number | null;
  locationArea: string | null;
  quantity: number | null;
  description: string | null;
  imageUrl: string | null;
  status: RequestStatus;
  buyerContact: string;
  createdAt: string;
  matches: BusinessMatch[];
};

const STATUS_OPTIONS: {
  value: "" | RequestStatus;
  label: string;
}[] = [
  { value: "", label: "All statuses" },
  { value: "NEW", label: "New" },
  { value: "MATCHED", label: "Matched" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "FULFILLED", label: "Fulfilled" },
  {
    value: "UNFULFILLED",
    label: "Unfulfilled",
  },
  { value: "CLOSED", label: "Closed" },
];

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/admin",
    icon: Home,
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

function getStatusClass(
  status: RequestStatus
) {
  switch (status) {
    case "NEW":
      return "bg-blue-50 text-blue-700 border-blue-200";

    case "MATCHED":
      return "bg-purple-50 text-purple-700 border-purple-200";

    case "CONTACTED":
      return "bg-orange-50 text-orange-700 border-orange-200";

    case "FULFILLED":
      return "bg-green-50 text-green-700 border-green-200";

    case "UNFULFILLED":
      return "bg-red-50 text-red-700 border-red-200";

    case "CLOSED":
      return "bg-gray-100 text-gray-700 border-gray-200";

    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

function getStatusLabel(
  status: RequestStatus
) {
  switch (status) {
    case "NEW":
      return "New";

    case "MATCHED":
      return "Matched";

    case "CONTACTED":
      return "Contacted";

    case "FULFILLED":
      return "Fulfilled";

    case "UNFULFILLED":
      return "Unfulfilled";

    case "CLOSED":
      return "Closed";

    default:
      return status;
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<
    AdminRequest[]
  >([]);

  const [search, setSearch] = useState("");

  const [status, setStatus] = useState<
    "" | RequestStatus
  >("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedRequest, setSelectedRequest] =
    useState<AdminRequest | null>(null);

  const [updatingId, setUpdatingId] =
    useState<string | null>(null);

  const loadRequests = useCallback(
    async (currentSearch: string) => {
      try {
        const params = new URLSearchParams();

        if (currentSearch.trim()) {
          params.set(
            "q",
            currentSearch.trim()
          );
        }

        if (status) {
          params.set("status", status);
        }

        const queryString =
          params.toString();

        const response = await fetch(
          queryString
            ? `/api/admin/requests?${queryString}`
            : "/api/admin/requests",
          {
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to load requests"
          );
        }

        setRequests(
          Array.isArray(data.requests)
            ? data.requests
            : []
        );

        setError("");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load requests"
        );
      } finally {
        setLoading(false);
      }
    },
    [status]
  );

  useEffect(() => {
    void loadRequests(search);
  }, [loadRequests, search]);

  async function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");

    await loadRequests(search);
  }

  function handleStatusChange(
    nextStatus: "" | RequestStatus
  ) {
    setLoading(true);
    setError("");
    setStatus(nextStatus);
  }

  async function updateStatus(
    requestId: string,
    newStatus: RequestStatus
  ) {
    try {
      setUpdatingId(requestId);
      setError("");

      const response = await fetch(
        `/api/admin/requests/${requestId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to update request"
        );
      }

      const updatedRequest =
        data.request as AdminRequest;

      setRequests((current) =>
        current.map((item) =>
          item.id === requestId
            ? updatedRequest
            : item
        )
      );

      setSelectedRequest((current) =>
        current?.id === requestId
          ? updatedRequest
          : current
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update request"
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] text-[#17202A]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col overflow-hidden border-x border-[#FF5A36] bg-[#FFFDFC] shadow-sm lg:my-4 lg:min-h-[calc(100vh-2rem)] lg:rounded-[22px] lg:border">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#EAE6DF] bg-white px-4 lg:px-6">
          <Link
            href="/admin"
            className="flex items-center gap-2"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF5A36] text-sm font-black text-white">
              R
            </div>

            <div>
              <div className="text-base font-black tracking-tight">
                ReMarket
              </div>

              <div className="text-[11px] font-medium text-gray-500">
                Admin
              </div>
            </div>
          </Link>

          <Link
            href="/"
            className="rounded-xl border border-[#EAE6DF] px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-[#FFF7ED]"
          >
            View marketplace
          </Link>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] p-3 lg:block">
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                const active =
                  item.href ===
                  "/admin/requests";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      active
                        ? "bg-[#FFE0D6] text-[#9F2D18]"
                        : "text-gray-600 hover:bg-white"
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>

          <section className="min-w-0 flex-1 overflow-y-auto p-4 pb-24 lg:p-6 lg:pb-6">
            <div className="mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-sm font-semibold text-[#FF5A36]">
                    Admin
                  </p>

                  <h1 className="text-2xl font-black tracking-tight">
                    Requests
                  </h1>

                  <p className="mt-1 text-sm text-gray-500">
                    Manage buyer requests and
                    their matched businesses.
                  </p>
                </div>

                <div className="hidden rounded-2xl bg-[#FFF0D9] px-4 py-3 sm:block">
                  <div className="text-xs font-semibold text-gray-500">
                    Total requests
                  </div>

                  <div className="mt-1 text-xl font-black">
                    {requests.length}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>{error}</span>

                <button
                  type="button"
                  onClick={() =>
                    setError("")
                  }
                  className="shrink-0"
                  aria-label="Dismiss error"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            <div className="mb-5 rounded-2xl border border-[#EAE6DF] bg-white p-4">
              <form
                onSubmit={handleSearch}
                className="flex flex-col gap-3 lg:flex-row"
              >
                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />

                  <input
                    value={search}
                    onChange={(event) =>
                      setSearch(
                        event.target.value
                      )
                    }
                    placeholder="Search request code, item, contact..."
                    className="w-full rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] py-3 pl-10 pr-3 text-sm outline-none transition focus:border-[#FF5A36]"
                  />
                </div>

                <select
                  value={status}
                  onChange={(event) =>
                    handleStatusChange(
                      event.target
                        .value as
                        | ""
                        | RequestStatus
                    )
                  }
                  className="rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] px-3 py-3 text-sm font-medium outline-none focus:border-[#FF5A36]"
                >
                  {STATUS_OPTIONS.map(
                    (option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    )
                  )}
                </select>

                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#e94d2c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading
                    ? "Loading..."
                    : "Search"}
                </button>
              </form>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-10 text-center">
                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-[#FF5A36] border-t-transparent" />

                <p className="text-sm text-gray-500">
                  Loading requests...
                </p>
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#EAE6DF] bg-white p-10 text-center">
                <ClipboardList
                  size={32}
                  className="mx-auto mb-3 text-gray-400"
                />

                <h2 className="font-bold">
                  No requests found
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Try another search or status
                  filter.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-[#EAE6DF] bg-white p-4 transition hover:shadow-sm"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg bg-[#FFF0D9] px-2.5 py-1 text-xs font-black text-[#9F2D18]">
                            {item.requestCode}
                          </span>

                          <span
                            className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${getStatusClass(
                              item.status
                            )}`}
                          >
                            {getStatusLabel(
                              item.status
                            )}
                          </span>

                          {item.category && (
                            <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
                              {
                                item.category
                                  .name
                              }
                            </span>
                          )}
                        </div>

                        <h2 className="mt-3 text-lg font-black">
                          {item.query}
                        </h2>

                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                            {item.description}
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                          {item.budget !==
                            null && (
                            <span>
                              Budget: ₦
                              {item.budget.toLocaleString()}
                            </span>
                          )}

                          {item.quantity !==
                            null && (
                            <span>
                              Quantity:{" "}
                              {item.quantity}
                            </span>
                          )}

                          {item.locationArea && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={13} />
                              {
                                item.locationArea
                              }
                            </span>
                          )}

                          <span>
                            {formatDate(
                              item.createdAt
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedRequest(
                              item
                            )
                          }
                          className="rounded-xl border border-[#E8E4DE] px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-[#FFF7ED]"
                        >
                          View details
                        </button>

                        <select
                          value={item.status}
                          disabled={
                            updatingId ===
                            item.id
                          }
                          onChange={(event) =>
                            updateStatus(
                              item.id,
                              event.target
                                .value as RequestStatus
                            )
                          }
                          className="rounded-xl border border-[#E8E4DE] bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#FF5A36]"
                        >
                          {STATUS_OPTIONS.filter(
                            (option) =>
                              option.value !==
                              ""
                          ).map(
                            (option) => (
                              <option
                                key={
                                  option.value
                                }
                                value={
                                  option.value
                                }
                              >
                                {option.label}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>

                    {item.matches.length >
                      0 && (
                      <div className="mt-4 border-t border-[#F0ECE6] pt-4">
                        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-gray-500">
                          <Users size={14} />

                          {item.matches.length}{" "}
                          matched{" "}
                          {item.matches
                            .length === 1
                            ? "business"
                            : "businesses"}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {item.matches
                            .slice(0, 5)
                            .map(
                              (match) => (
                                <Link
                                  key={
                                    match.id
                                  }
                                  href={`/admin/businesses/${match.business.id}`}
                                  className="rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 py-2 text-xs font-semibold transition hover:border-[#FF5A36]"
                                >
                                  {
                                    match
                                      .business
                                      .name
                                  }
                                </Link>
                              )
                            )}
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#EAE6DF] bg-white px-2 py-2 lg:hidden">
          <div className="mx-auto flex max-w-[600px] justify-around">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              const active =
                item.href ===
                "/admin/requests";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-w-[70px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold ${
                    active
                      ? "bg-[#FFE0D6] text-[#9F2D18]"
                      : "text-gray-500"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-[#EAE6DF] bg-white px-5 py-4">
              <div>
                <div className="text-xs font-bold text-[#FF5A36]">
                  {
                    selectedRequest.requestCode
                  }
                </div>

                <h2 className="mt-1 text-lg font-black">
                  Request details
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedRequest(
                    null
                  )
                }
                className="rounded-xl p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close request details"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Request
                </p>

                <p className="mt-1 text-xl font-black">
                  {selectedRequest.query}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-[#FCFAF6] p-3">
                  <div className="text-xs font-semibold text-gray-400">
                    Status
                  </div>

                  <div
                    className={`mt-2 inline-flex rounded-lg border px-2.5 py-1 text-xs font-bold ${getStatusClass(
                      selectedRequest.status
                    )}`}
                  >
                    {getStatusLabel(
                      selectedRequest.status
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-[#FCFAF6] p-3">
                  <div className="text-xs font-semibold text-gray-400">
                    Buyer contact
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-sm font-bold">
                    <Phone size={15} />
                    {
                      selectedRequest.buyerContact
                    }
                  </div>
                </div>

                {selectedRequest.budget !==
                  null && (
                  <div className="rounded-xl bg-[#FCFAF6] p-3">
                    <div className="text-xs font-semibold text-gray-400">
                      Budget
                    </div>

                    <div className="mt-2 text-sm font-bold">
                      ₦
                      {selectedRequest.budget.toLocaleString()}
                    </div>
                  </div>
                )}

                {selectedRequest.quantity !==
                  null && (
                  <div className="rounded-xl bg-[#FCFAF6] p-3">
                    <div className="text-xs font-semibold text-gray-400">
                      Quantity
                    </div>

                    <div className="mt-2 text-sm font-bold">
                      {
                        selectedRequest.quantity
                      }
                    </div>
                  </div>
                )}

                {selectedRequest.locationArea && (
                  <div className="rounded-xl bg-[#FCFAF6] p-3 sm:col-span-2">
                    <div className="text-xs font-semibold text-gray-400">
                      Location
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-sm font-bold">
                      <MapPin size={15} />
                      {
                        selectedRequest.locationArea
                      }
                    </div>
                  </div>
                )}
              </div>

              {selectedRequest.description && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Description
                  </p>

                  <p className="mt-2 rounded-xl bg-[#FCFAF6] p-4 text-sm leading-6 text-gray-700">
                    {
                      selectedRequest.description
                    }
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                    Matched businesses
                  </p>

                  <span className="text-xs font-semibold text-gray-400">
                    {
                      selectedRequest.matches
                        .length
                    }
                  </span>
                </div>

                {selectedRequest.matches
                  .length === 0 ? (
                  <div className="mt-2 rounded-xl bg-[#FCFAF6] p-4 text-sm text-gray-500">
                    No businesses matched
                    this request yet.
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedRequest.matches.map(
                      (match) => (
                        <div
                          key={match.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#EAE6DF] p-3"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/admin/businesses/${match.business.id}`}
                              className="font-bold hover:text-[#FF5A36]"
                            >
                              {
                                match.business
                                  .name
                              }
                            </Link>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                              {match.business
                                .area && (
                                <span>
                                  {
                                    match
                                      .business
                                      .area
                                  }
                                </span>
                              )}

                              {match.business
                                .verified && (
                                <span className="inline-flex items-center gap-1 text-green-600">
                                  <CheckCircle2
                                    size={
                                      12
                                    }
                                  />
                                  Verified
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-sm font-black">
                              {
                                match.score
                              }
                            </div>

                            <div className="text-[10px] font-semibold text-gray-400">
                              match score
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-[#EAE6DF] pt-4">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Clock3 size={14} />
                  Created{" "}
                  {formatDate(
                    selectedRequest.createdAt
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}