"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock3,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Store,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import NotificationBell from "@/components/NotificationBell";

type ClaimStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

type ClaimRequest = {
  id: string;
  businessId: string;
  requestedById: string;
  reason: string | null;
  status: ClaimStatus;
  createdAt: string;
  reviewedAt: string | null;
  business: {
    id: string;
    name: string;
    ownerId: string | null;
    ownerName: string | null;
    status: string;
    verification: string;
    deletedAt: string | null;
    location: {
      id: string;
      area: string | null;
    } | null;
  };
  requestedBy: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  };
  reviewedBy: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  } | null;
};

type ClaimsResponse = {
  requests: ClaimRequest[];
  total: number;
};

type ActionResponse = {
  message?: string;
  error?: string;
  claim?: ClaimRequest;
};

type Filter =
  | "ALL"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

function formatDate(
  value: string | null
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(
    "en-NG",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function formatDateTime(
  value: string | null
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString(
    "en-NG",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

function statusClasses(
  status: ClaimStatus
): string {
  switch (status) {
    case "PENDING":
      return "bg-[#FFF0D9] text-[#9F5A18]";

    case "APPROVED":
      return "bg-[#E7F7EF] text-[#287A4B]";

    case "REJECTED":
      return "bg-[#FCE8E6] text-[#B42318]";
  }
}

function getStatusIcon(
  status: ClaimStatus
) {
  switch (status) {
    case "PENDING":
      return Clock3;

    case "APPROVED":
      return Check;

    case "REJECTED":
      return X;
  }
}

function getSellerName(
  claim: ClaimRequest
): string {
  return (
    claim.requestedBy.name?.trim() ||
    claim.requestedBy.email?.trim() ||
    "Unknown seller"
  );
}

export default function AdminClaimsPage() {
  const [claims, setClaims] =
    useState<ClaimRequest[]>([]);

  const [filter, setFilter] =
    useState<Filter>("PENDING");

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const loadClaims =
    useCallback(
      async (
        showInitialLoading = false
      ) => {
        try {
          if (showInitialLoading) {
            setLoading(true);
          } else {
            setRefreshing(true);
          }

          setError("");

          const response =
            await fetch(
              "/api/admin/business-claim-requests",
              {
                method: "GET",
                cache: "no-store",
              }
            );

          if (!response.ok) {
            let message =
              "Unable to load business claim requests.";

            try {
              const data =
                (await response.json()) as {
                  error?: string;
                };

              if (
                typeof data.error ===
                "string"
              ) {
                message =
                  data.error;
              }
            } catch {
              // Keep the default error message.
            }

            throw new Error(message);
          }

          const data =
            (await response.json()) as ClaimsResponse;

          if (
            !data ||
            !Array.isArray(
              data.requests
            )
          ) {
            throw new Error(
              "Invalid claim request response."
            );
          }

          setClaims(
            data.requests
          );
        } catch (loadError) {
          console.error(
            "Admin claims load error:",
            loadError
          );

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load business claim requests."
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      []
    );

  useEffect(() => {
    void loadClaims(true);
  }, [loadClaims]);

  const filteredClaims =
    useMemo(() => {
      if (filter === "ALL") {
        return claims;
      }

      return claims.filter(
        (claim) =>
          claim.status ===
          filter
      );
    }, [claims, filter]);

  const counts = useMemo(() => {
    return {
      ALL: claims.length,
      PENDING: claims.filter(
        (claim) =>
          claim.status ===
          "PENDING"
      ).length,
      APPROVED: claims.filter(
        (claim) =>
          claim.status ===
          "APPROVED"
      ).length,
      REJECTED: claims.filter(
        (claim) =>
          claim.status ===
          "REJECTED"
      ).length,
    };
  }, [claims]);

  async function reviewClaim(
    claim: ClaimRequest,
    nextStatus:
      | "APPROVED"
      | "REJECTED"
  ) {
    if (
      processingId ||
      claim.status !== "PENDING"
    ) {
      return;
    }

    const sellerName =
      getSellerName(claim);

    const confirmationMessage =
      nextStatus === "APPROVED"
        ? `Approve the claim from ${sellerName} for "${claim.business.name}"? This will make the seller the business owner.`
        : `Reject the claim from ${sellerName} for "${claim.business.name}"?`;

    const confirmed =
      window.confirm(
        confirmationMessage
      );

    if (!confirmed) {
      return;
    }

    setProcessingId(
      claim.id
    );

    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          "/api/admin/claims",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              requestId:
                claim.id,
              status:
                nextStatus,
            }),
          }
        );

      const data =
        (await response.json()) as ActionResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Unable to ${nextStatus.toLowerCase()} the claim.`
        );
      }

      setSuccess(
        nextStatus ===
          "APPROVED"
          ? `"${claim.business.name}" has been assigned to ${sellerName}.`
          : `The claim for "${claim.business.name}" has been rejected.`
      );

      await loadClaims(false);
    } catch (reviewError) {
      console.error(
        "Admin claim review error:",
        reviewError
      );

      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "Unable to update the claim request."
      );
    } finally {
      setProcessingId(
        null
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF6EF] text-[#2E241F]">
      <div className="flex min-h-screen">
        {/* Sidebar */}

        <aside className="hidden w-64 shrink-0 border-r border-[#E8DED3] bg-[#FFFDFC] lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
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

            <nav className="flex-1 px-4 py-6">
              <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9A9087]">
                Dashboard
              </p>

              <div className="space-y-1">
                <Link
                  href="/admin"
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#6F675F] transition hover:bg-[#F7F1EB] hover:text-[#2E241F]"
                >
                  <Store className="h-4 w-4" />
                  <span>Overview</span>
                </Link>

                <Link
                  href="/admin/businesses"
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#6F675F] transition hover:bg-[#F7F1EB] hover:text-[#2E241F]"
                >
                  <Store className="h-4 w-4" />
                  <span>Businesses</span>
                </Link>

                <Link
                  href="/admin/products"
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#6F675F] transition hover:bg-[#F7F1EB] hover:text-[#2E241F]"
                >
                  <Store className="h-4 w-4" />
                  <span>Products</span>
                </Link>

                <Link
                  href="/admin/requests"
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#6F675F] transition hover:bg-[#F7F1EB] hover:text-[#2E241F]"
                >
                  <Store className="h-4 w-4" />
                  <span>Requests</span>
                </Link>

                <Link
                  href="/admin/claims"
                  className="flex items-center gap-3 rounded-xl bg-[#FFF0E8] px-3 py-3 text-sm font-medium text-[#9F2D18]"
                >
                  <UserRound className="h-4 w-4" />
                  <span>Claims</span>
                </Link>

                <Link
                  href="/admin/business-deletion-requests"
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#6F675F] transition hover:bg-[#F7F1EB] hover:text-[#2E241F]"
                >
                  <Store className="h-4 w-4" />
                  <span>
                    Deletion requests
                  </span>
                </Link>
              </div>
            </nav>

            <div className="border-t border-[#E8DED3] px-6 py-5">
              <p className="text-xs text-[#9A9087]">
                ReMarket Admin
              </p>

              <p className="mt-1 text-sm font-medium text-[#4B4038]">
                Business claims
              </p>
            </div>
          </div>
        </aside>

        {/* Main */}

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            {/* Header */}

            <div className="mb-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-2 text-xs font-medium text-[#9F2D18] hover:underline"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to dashboard
                  </Link>

                  <p className="mt-4 text-sm font-medium text-[#9F2D18]">
                    Admin
                  </p>

                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#2E241F] sm:text-3xl">
                    Business claims
                  </h1>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766C63]">
                    Review seller requests
                    to claim ownership of
                    existing ReMarket
                    businesses.
                  </p>
                </div>

                <div className="shrink-0">
                  <NotificationBell />
                </div>
              </div>
            </div>

            {/* Alerts */}

            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#F1C5BF] bg-[#FFF4F2] px-4 py-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B42318]" />

                <p className="text-sm font-medium text-[#B42318]">
                  {error}
                </p>
              </div>
            )}

            {success && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#CBE7D7] bg-[#F1FBF5] px-4 py-4">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#287A4B]" />

                <p className="text-sm font-medium text-[#287A4B]">
                  {success}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setSuccess("")
                  }
                  className="ml-auto shrink-0 text-xs font-semibold text-[#287A4B] hover:underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Summary cards */}

            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {(
                [
                  [
                    "ALL",
                    "All claims",
                  ],
                  [
                    "PENDING",
                    "Pending",
                  ],
                  [
                    "APPROVED",
                    "Approved",
                  ],
                  [
                    "REJECTED",
                    "Rejected",
                  ],
                ] as const
              ).map(
                ([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setFilter(
                        value
                      )}
                    className={`rounded-2xl border p-4 text-left transition ${
                      filter === value
                        ? "border-[#F1C5BF] bg-[#FFF0E8]"
                        : "border-[#E8DED3] bg-white hover:border-[#D8C9BC]"
                    }`}
                  >
                    <p className="text-xs font-medium text-[#6F675F]">
                      {label}
                    </p>

                    <p className="mt-2 text-2xl font-semibold text-[#2E241F]">
                      {counts[value]}
                    </p>
                  </button>
                )
              )}
            </section>

            {/* Toolbar */}

            <section className="mt-6 rounded-2xl border border-[#E8DED3] bg-white">
              <div className="flex flex-col gap-3 border-b border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <h2 className="font-semibold text-[#2E241F]">
                    {filter === "ALL"
                      ? "All claim requests"
                      : `${filter.charAt(0)}${filter.slice(1).toLowerCase()} claim requests`}
                  </h2>

                  <p className="mt-1 text-xs text-[#8B8178]">
                    {filteredClaims.length}{" "}
                    {filteredClaims.length ===
                    1
                      ? "request"
                      : "requests"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void loadClaims(
                      false
                    )}
                  disabled={
                    refreshing ||
                    Boolean(
                      processingId
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E5DDD5] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#5B514A] transition hover:bg-[#FAF6EF] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      refreshing
                        ? "animate-spin"
                        : ""
                    }`}
                  />

                  Refresh
                </button>
              </div>

              {/* Loading */}

              {loading && (
                <div className="flex min-h-[300px] items-center justify-center px-5 py-16">
                  <div className="flex items-center gap-2 text-sm text-[#766C63]">
                    <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
                    Loading claim requests...
                  </div>
                </div>
              )}

              {/* Empty */}

              {!loading &&
                filteredClaims.length ===
                  0 && (
                  <div className="px-5 py-16 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]">
                      <UserRound className="h-6 w-6" />
                    </div>

                    <p className="mt-4 text-base font-semibold text-[#2E241F]">
                      {filter ===
                      "PENDING"
                        ? "No pending claims"
                        : "No claims found"}
                    </p>

                    <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[#8B8178]">
                      {filter ===
                      "PENDING"
                        ? "New seller ownership requests will appear here."
                        : "There are no claim requests in this category yet."}
                    </p>
                  </div>
                )}

              {/* Claims */}

              {!loading &&
                filteredClaims.length >
                  0 && (
                  <div className="divide-y divide-[#E8DED3]">
                    {filteredClaims.map(
                      (claim) => {
                        const StatusIcon =
                          getStatusIcon(
                            claim.status
                          );

                        const isProcessing =
                          processingId ===
                          claim.id;

                        const sellerName =
                          getSellerName(
                            claim
                          );

                        return (
                          <article
                            key={
                              claim.id
                            }
                            className="px-4 py-5 sm:px-5 sm:py-6"
                          >
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                              {/* Main details */}

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClasses(
                                      claim.status
                                    )}`}
                                  >
                                    <StatusIcon className="h-3 w-3" />
                                    {
                                      claim.status
                                    }
                                  </span>

                                  <span className="text-xs text-[#9A9087]">
                                    Submitted{" "}
                                    {formatDate(
                                      claim.createdAt
                                    )}
                                  </span>
                                </div>

                                {/* Business */}

                                <div className="mt-4 rounded-2xl border border-[#E8DED3] bg-[#FFFDFC] p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]">
                                      <Store className="h-5 w-5" />
                                    </div>

                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-[#2E241F]">
                                        {
                                          claim
                                            .business
                                            .name
                                        }
                                      </p>

                                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8B8178]">
                                        {claim
                                          .business
                                          .location
                                          ?.area && (
                                          <>
                                            <span className="inline-flex items-center gap-1">
                                              <MapPin className="h-3 w-3" />
                                              {
                                                claim
                                                  .business
                                                  .location
                                                  .area
                                              }
                                            </span>

                                            <span>
                                              •
                                            </span>
                                          </>
                                        )}

                                        <span>
                                          Business status:{" "}
                                          {
                                            claim
                                              .business
                                              .status
                                          }
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Seller */}

                                <div className="mt-3 rounded-2xl border border-[#E8DED3] bg-white p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F7F1EB] text-[#6F675F]">
                                      <UserRound className="h-5 w-5" />
                                    </div>

                                    <div className="min-w-0">
                                      <p className="text-xs font-medium uppercase tracking-wide text-[#9A9087]">
                                        Seller
                                      </p>

                                      <p className="mt-1 text-sm font-semibold text-[#2E241F]">
                                        {
                                          sellerName
                                        }
                                      </p>

                                      {claim
                                        .requestedBy
                                        .email && (
                                        <p className="mt-1 break-all text-xs text-[#8B8178]">
                                          {
                                            claim
                                              .requestedBy
                                              .email
                                          }
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Reason */}

                                <div className="mt-3 rounded-2xl border border-[#E8DED3] bg-white p-4">
                                  <div className="flex items-start gap-3">
                                    <FileIcon />

                                    <div className="min-w-0">
                                      <p className="text-xs font-medium uppercase tracking-wide text-[#9A9087]">
                                        Claim reason
                                      </p>

                                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#5E554E]">
                                        {claim.reason?.trim() ||
                                          "No reason was provided."}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                {/* Review details */}

                                {claim.status !==
                                  "PENDING" && (
                                  <div className="mt-3 rounded-2xl bg-[#FAF6EF] px-4 py-3">
                                    <p className="text-xs text-[#766C63]">
                                      Reviewed{" "}
                                      {formatDateTime(
                                        claim.reviewedAt
                                      )}
                                      {claim
                                        .reviewedBy
                                        ?.name
                                        ? ` by ${claim.reviewedBy.name}`
                                        : ""}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Actions */}

                              <div className="w-full shrink-0 lg:w-52">
                                {claim.status ===
                                "PENDING" ? (
                                  <div className="space-y-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void reviewClaim(
                                          claim,
                                          "APPROVED"
                                        )
                                      }
                                      disabled={
                                        Boolean(
                                          processingId
                                        )
                                      }
                                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#287A4B] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
                                    >
                                      {isProcessing &&
                                      processingId ===
                                        claim.id ? (
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Check className="h-4 w-4" />
                                      )}

                                      Approve claim
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        void reviewClaim(
                                          claim,
                                          "REJECTED"
                                        )
                                      }
                                      disabled={
                                        Boolean(
                                          processingId
                                        )
                                      }
                                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#E5BBB5] bg-white px-4 py-3 text-sm font-semibold text-[#B42318] transition hover:bg-[#FFF4F2] disabled:cursor-wait disabled:opacity-50"
                                    >
                                      {isProcessing &&
                                      processingId ===
                                        claim.id ? (
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <X className="h-4 w-4" />
                                      )}

                                      Reject claim
                                    </button>
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border border-[#E8DED3] bg-[#FAF6EF] p-4">
                                    <p className="text-xs font-medium text-[#6F675F]">
                                      This claim has
                                      already been
                                      reviewed.
                                    </p>

                                    <p className="mt-2 text-xs leading-5 text-[#8B8178]">
                                      No further action
                                      is available.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      }
                    )}
                  </div>
                )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function FileIcon() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F7F1EB] text-[#6F675F]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h5" />
      </svg>
    </div>
  );
}