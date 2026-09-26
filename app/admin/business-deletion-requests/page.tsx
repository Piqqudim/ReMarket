"use client";

import {
  AlertCircle,
  Check,
  ChevronLeft,
  Clock3,
  Loader2,
  RefreshCw,
  Store,
  UserRound,
  X,
} from "lucide-react";

import Link from "next/link";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

type RequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

type FilterStatus =
  | "ALL"
  | RequestStatus;

type DeletionRequest = {
  id: string;
  businessId: string;
  requestedById: string;
  reason: string | null;
  status: RequestStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;

  business: {
    id: string;
    name: string;
    ownerId: string | null;
    ownerName: string | null;
    status: "ACTIVE" | "INACTIVE" | "PENDING";
    verification: "UNVERIFIED" | "VERIFIED";
    deletedAt: string | null;
    location: {
      id: string;
      area: string;
    } | null;
  };

  requestedBy: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  };

  reviewedBy: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
};

const FILTERS: Array<{
  label: string;
  value: FilterStatus;
}> = [
  {
    label: "All",
    value: "ALL",
  },
  {
    label: "Pending",
    value: "PENDING",
  },
  {
    label: "Approved",
    value: "APPROVED",
  },
  {
    label: "Rejected",
    value: "REJECTED",
  },
];

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function getStatusStyles(status: RequestStatus) {
  switch (status) {
    case "PENDING":
      return {
        label: "Pending",
        className:
          "border-amber-200 bg-amber-50 text-amber-700",
      };

    case "APPROVED":
      return {
        label: "Approved",
        className:
          "border-emerald-200 bg-emerald-50 text-emerald-700",
      };

    case "REJECTED":
      return {
        label: "Rejected",
        className:
          "border-red-200 bg-red-50 text-red-700",
      };
  }
}

function getInitials(
  name: string | null,
  fallback: string
) {
  const source =
    typeof name === "string" && name.trim()
      ? name.trim()
      : fallback;

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function BusinessDeletionRequestsPage() {
  const [requests, setRequests] =
    useState<DeletionRequest[]>([]);

  const [filter, setFilter] =
    useState<FilterStatus>("ALL");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [reviewingId, setReviewingId] =
    useState("");

  const loadRequests = useCallback(
    async (selectedFilter: FilterStatus) => {
      const controller =
        new AbortController();

      setLoading(true);
      setError("");

      try {
        const query =
          selectedFilter === "ALL"
            ? ""
            : `?status=${selectedFilter}`;

        const response = await fetch(
          `/api/admin/business-deletion-requests${query}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data =
          await response.json();

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          window.location.href =
            "/admin/login";
          return;
        }

        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Unable to load deletion requests."
          );
        }

        setRequests(
          Array.isArray(data?.requests)
            ? data.requests
            : []
        );
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Deletion request page load error:",
          loadError
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load deletion requests."
        );
      } finally {
        controller.abort();
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadRequests(filter);
  }, [filter, loadRequests]);

  async function reviewRequest(
    requestId: string,
    status: "APPROVED" | "REJECTED"
  ) {
    const request =
      requests.find(
        (item) => item.id === requestId
      );

    if (!request) {
      return;
    }

    const actionLabel =
      status === "APPROVED"
        ? "approve"
        : "reject";

    const confirmation =
      status === "APPROVED"
        ? `Approve the deletion request for "${request.business.name}"? This will soft-delete the business and remove it from public discovery.`
        : `Reject the deletion request for "${request.business.name}"? The business will remain active as it is.`;

    if (!window.confirm(confirmation)) {
      return;
    }

    setReviewingId(requestId);
    setError("");

    try {
      const response = await fetch(
        "/api/admin/business-deletion-requests",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            id: requestId,
            status,
          }),
        }
      );

      const data =
        await response.json();

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        window.location.href =
          "/admin/login";
        return;
      }

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Unable to ${actionLabel} the deletion request.`
        );
      }

      await loadRequests(filter);
    } catch (reviewError) {
      console.error(
        "Deletion request review error:",
        reviewError
      );

      setError(
        reviewError instanceof Error
          ? reviewError.message
          : `Unable to ${actionLabel} the deletion request.`
      );
    } finally {
      setReviewingId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
      <div className="mx-auto max-w-[1200px]">
        {/* Top bar */}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition hover:text-[#9F2D18]"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to dashboard
            </Link>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#9F2D18]">
                <Store className="h-5 w-5" />
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Admin
                </p>

                <h1 className="mt-0.5 text-xl font-bold text-[#17202A]">
                  Business deletion requests
                </h1>

                <p className="mt-1 text-xs text-gray-500">
                  Review seller requests to remove their
                  business from ReMarket.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              loadRequests(filter)
            }
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading
                  ? "animate-spin"
                  : ""
              }`}
            />
            Refresh
          </button>
        </div>

        {/* Filter */}

        <div className="mt-6 overflow-x-auto">
          <div className="inline-flex min-w-max rounded-xl border border-[#E8E4DE] bg-white p-1 shadow-sm">
            {FILTERS.map((item) => {
              const active =
                filter === item.value;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() =>
                    setFilter(item.value)
                  }
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                    active
                      ? "bg-[#FF5A36] text-white shadow-sm"
                      : "text-gray-600 hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error */}

        {error && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

            <div className="min-w-0">
              <p className="font-semibold">
                Unable to load this page
              </p>

              <p className="mt-0.5 text-xs">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Loading */}

        {loading && (
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-[170px] animate-pulse rounded-2xl border border-[#E8E4DE] bg-white"
              />
            ))}
          </div>
        )}

        {/* Empty */}

        {!loading &&
          !error &&
          requests.length === 0 && (
            <div className="mt-6 rounded-2xl border border-[#E8E4DE] bg-white px-5 py-14 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF7ED] text-[#FF5A36]">
                <Clock3 className="h-6 w-6" />
              </div>

              <h2 className="mt-4 text-sm font-bold text-[#17202A]">
                No deletion requests
              </h2>

              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-gray-500">
                There are no business deletion requests
                matching the selected filter.
              </p>
            </div>
          )}

        {/* Desktop table */}

        {!loading &&
          requests.length > 0 && (
            <>
              <div className="mt-6 hidden overflow-hidden rounded-2xl border border-[#E8E4DE] bg-white shadow-sm lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] border-collapse">
                    <thead>
                      <tr className="border-b border-[#EAE6DF] bg-[#FCFAF6]">
                        <th className="px-5 py-4 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                          Business
                        </th>

                        <th className="px-5 py-4 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                          Seller
                        </th>

                        <th className="px-5 py-4 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                          Location
                        </th>

                        <th className="px-5 py-4 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                          Reason
                        </th>

                        <th className="px-5 py-4 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                          Requested
                        </th>

                        <th className="px-5 py-4 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                          Status
                        </th>

                        <th className="px-5 py-4 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {requests.map((request) => {
                        const status =
                          getStatusStyles(
                            request.status
                          );

                        const isReviewing =
                          reviewingId ===
                          request.id;

                        return (
                          <tr
                            key={request.id}
                            className="border-b border-[#F0ECE6] last:border-b-0"
                          >
                            <td className="px-5 py-4 align-top">
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                                  <Store className="h-4 w-4" />
                                </div>

                                <div className="min-w-0">
                                  <p className="font-bold text-[#17202A]">
                                    {
                                      request
                                        .business
                                        .name
                                    }
                                  </p>

                                  <Link
                                    href={`/admin/businesses/${request.business.id}`}
                                    className="mt-1 inline-block text-[11px] font-semibold text-[#9F2D18] hover:underline"
                                  >
                                    View business
                                  </Link>
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-4 align-top">
                              <p className="text-xs font-semibold text-gray-700">
                                {
                                  request
                                    .requestedBy
                                    .name
                                }
                              </p>

                              <p className="mt-1 break-all text-[11px] text-gray-500">
                                {
                                  request
                                    .requestedBy
                                    .email
                                }
                              </p>
                            </td>

                            <td className="px-5 py-4 align-top">
                              <span className="text-xs text-gray-600">
                                {request.business.location
                                  ?.area ??
                                  "Location not set"}
                              </span>
                            </td>

                            <td className="max-w-[240px] px-5 py-4 align-top">
                              <p className="text-xs leading-5 text-gray-600">
                                {request.reason ||
                                  "No reason provided."}
                              </p>
                            </td>

                            <td className="px-5 py-4 align-top">
                              <span className="text-xs text-gray-600">
                                {formatDate(
                                  request.createdAt
                                )}
                              </span>
                            </td>

                            <td className="px-5 py-4 align-top">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.className}`}
                              >
                                {status.label}
                              </span>
                            </td>

                            <td className="px-5 py-4 align-top">
                              {request.status ===
                              "PENDING" ? (
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={
                                      isReviewing
                                    }
                                    onClick={() =>
                                      reviewRequest(
                                        request.id,
                                        "REJECTED"
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-[11px] font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isReviewing ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <X className="h-3.5 w-3.5" />
                                    )}
                                    Reject
                                  </button>

                                  <button
                                    type="button"
                                    disabled={
                                      isReviewing
                                    }
                                    onClick={() =>
                                      reviewRequest(
                                        request.id,
                                        "APPROVED"
                                      )
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF5A36] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#E94F2D] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isReviewing ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                    Approve
                                  </button>
                                </div>
                              ) : (
                                <div className="text-right text-[11px] text-gray-400">
                                  {request.reviewedAt
                                    ? `Reviewed ${formatDate(
                                        request.reviewedAt
                                      )}`
                                    : "Reviewed"}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile / tablet cards */}

              <div className="mt-6 space-y-3 lg:hidden">
                {requests.map((request) => {
                  const status =
                    getStatusStyles(
                      request.status
                    );

                  const isReviewing =
                    reviewingId ===
                    request.id;

                  return (
                    <article
                      key={request.id}
                      className="overflow-hidden rounded-2xl border border-[#E8E4DE] bg-white shadow-sm"
                    >
                      <div className="border-b border-[#EAE6DF] px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                              <Store className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                              <h2 className="truncate text-sm font-bold text-[#17202A]">
                                {
                                  request
                                    .business
                                    .name
                                }
                              </h2>

                              <p className="mt-1 text-[11px] text-gray-500">
                                {request.business.location
                                  ?.area ??
                                  "Location not set"}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-4 px-4 py-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FCFAF6] text-gray-500">
                            <UserRound className="h-4 w-4" />
                          </div>

                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">
                              Seller
                            </p>

                            <p className="mt-1 text-xs font-semibold text-gray-700">
                              {
                                request
                                  .requestedBy
                                  .name
                              }
                            </p>

                            <p className="mt-0.5 break-all text-[11px] text-gray-500">
                              {
                                request
                                  .requestedBy
                                  .email
                              }
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">
                            Reason
                          </p>

                          <p className="mt-1 text-xs leading-5 text-gray-600">
                            {request.reason ||
                              "No reason provided."}
                          </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">
                              Requested
                            </p>

                            <p className="mt-1 text-xs text-gray-600">
                              {formatDate(
                                request.createdAt
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">
                              Business status
                            </p>

                            <p className="mt-1 text-xs font-semibold text-gray-600">
                              {
                                request
                                  .business
                                  .status
                              }
                            </p>
                          </div>
                        </div>

                        <Link
                          href={`/admin/businesses/${request.business.id}`}
                          className="inline-flex text-[11px] font-bold text-[#9F2D18] hover:underline"
                        >
                          View business details
                        </Link>

                        {request.status ===
                        "PENDING" ? (
                          <div className="grid grid-cols-2 gap-2 border-t border-[#F0ECE6] pt-4">
                            <button
                              type="button"
                              disabled={
                                isReviewing
                              }
                              onClick={() =>
                                reviewRequest(
                                  request.id,
                                  "REJECTED"
                                )
                              }
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-[11px] font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isReviewing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                              Reject
                            </button>

                            <button
                              type="button"
                              disabled={
                                isReviewing
                              }
                              onClick={() =>
                                reviewRequest(
                                  request.id,
                                  "APPROVED"
                                )
                              }
                              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FF5A36] px-3 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#E94F2D] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isReviewing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </button>
                          </div>
                        ) : (
                          <div className="border-t border-[#F0ECE6] pt-4 text-[11px] text-gray-400">
                            Reviewed{" "}
                            {formatDate(
                              request.reviewedAt
                            )}
                            {request.reviewedBy
                              ? ` by ${
                                  request
                                    .reviewedBy
                                    .name ||
                                  request
                                    .reviewedBy
                                    .email
                                }`
                              : ""}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

        {/* Small footer note */}

        <div className="mt-6 flex items-start gap-2 text-[11px] leading-5 text-gray-400">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />

          <p>
            Approving a request soft-deletes the business.
            Rejection leaves the business unchanged.
          </p>
        </div>

        {/* Seller identity helper; keeps initials available
            without changing the established interface. */}

        {requests.length > 0 && (
          <span className="sr-only">
            {getInitials(
              requests[0].requestedBy.name,
              "Seller"
            )}
          </span>
        )}
      </div>
    </main>
  );
}