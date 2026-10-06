"use client";

import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Store,
  ArrowLeft,
  LoaderCircle,
  CircleAlert,
  CheckCircle2,
  ShieldCheck,
  Clock3,
  XCircle,
  Send,
  RefreshCw,
} from "lucide-react";

import NotificationBell from "@/components/NotificationBell";

type ClaimStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

type ClaimRequest = {
  id: string;
  businessId: string;
  reason: string | null;
  status: ClaimStatus;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  business?: {
    id: string;
    name: string;
  } | null;
};

type ClaimsResponse = {
  requests?: ClaimRequest[];
  claims?: ClaimRequest[];
  claimRequests?: ClaimRequest[];
  request?: ClaimRequest | null;
  error?: string;
};

function getStatusClasses(
  status: ClaimStatus
) {
  switch (status) {
    case "PENDING":
      return "bg-[#FFF5D9] text-[#9A6700]";

    case "APPROVED":
      return "bg-[#E7F0FF] text-[#3566B8]";

    case "REJECTED":
      return "bg-[#FFF0EE] text-[#C5402D]";
  }
}

function getStatusIcon(
  status: ClaimStatus
) {
  switch (status) {
    case "PENDING":
      return (
        <Clock3 className="h-4 w-4" />
      );

    case "APPROVED":
      return (
        <ShieldCheck className="h-4 w-4" />
      );

    case "REJECTED":
      return (
        <XCircle className="h-4 w-4" />
      );
  }
}

function formatDate(
  value: string
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
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

export default function SellerClaimsPage() {
  const router = useRouter();

  const [claims, setClaims] =
    useState<ClaimRequest[]>([]);

  const [businessId, setBusinessId] =
    useState("");

  const [reason, setReason] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const loadClaims =
    useCallback(
      async (
        showRefreshing = false
      ) => {
        if (showRefreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError("");

        try {
          const response =
            await fetch(
              "/api/seller/business-claim-requests",
              {
                cache: "no-store",
              }
            );

          let data:
            | ClaimsResponse
            | null = null;

          try {
            data =
              (await response.json()) as ClaimsResponse;
          } catch {
            data = null;
          }

          if (
            response.status === 401 ||
            response.status === 403
          ) {
            router.replace(
              "/seller/login"
            );
            return;
          }

          if (!response.ok) {
            throw new Error(
              typeof data?.error ===
                "string"
                ? data.error
                : "Unable to load your claim requests."
            );
          }

          const loadedClaims =
            data?.requests ??
            data?.claims ??
            data?.claimRequests ??
            [];

          setClaims(
            Array.isArray(
              loadedClaims
            )
              ? loadedClaims
              : []
          );
        } catch (loadError) {
          console.error(
            "Seller claims load error:",
            loadError
          );

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load your claim requests."
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [router]
    );

  useEffect(() => {
    void loadClaims();
  }, [loadClaims]);

  async function submitClaim(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setError("");
    setSuccess("");

    const cleanBusinessId =
      businessId.trim();

    const cleanReason =
      reason.trim();

    if (!cleanBusinessId) {
      setError(
        "Business ID is required."
      );
      return;
    }

    setSubmitting(true);

    try {
      const response =
        await fetch(
          "/api/seller/business-claim-requests",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              businessId:
                cleanBusinessId,
              reason:
                cleanReason ||
                null,
            }),
          }
        );

      let data:
        | ClaimsResponse
        | null = null;

      try {
        data =
          (await response.json()) as ClaimsResponse;
      } catch {
        data = null;
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        router.replace(
          "/seller/login"
        );
        return;
      }

      if (!response.ok) {
        setError(
          typeof data?.error ===
            "string"
            ? data.error
            : "Unable to submit your claim request."
        );
        return;
      }

      setBusinessId("");
      setReason("");

      setSuccess(
        "Your business claim request has been submitted for admin review."
      );

      await loadClaims();
    } catch (submitError) {
      console.error(
        "Seller claim submission error:",
        submitError
      );

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCount =
    claims.filter(
      (claim) =>
        claim.status ===
        "PENDING"
    ).length;

  const approvedCount =
    claims.filter(
      (claim) =>
        claim.status ===
        "APPROVED"
    ).length;

  return (
    <main className="min-h-screen bg-[#FFF7ED]">
      <div className="mx-auto min-h-screen w-full max-w-[1500px] px-3 py-3 sm:px-5 sm:py-5">
        <div className="min-h-[calc(100vh-24px)] overflow-hidden rounded-[18px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:rounded-[22px] lg:min-h-[calc(100vh-40px)]">

          {/* Header */}

          <header className="flex min-h-[66px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
            <Link
              href="/seller"
              className="flex items-center gap-2.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
                <Store className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-bold tracking-tight text-[#17202A]">
                  ReMarket
                </p>

                <p className="text-[10px] leading-none text-gray-400">
                  Seller Portal
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <NotificationBell />

              <Link
                href="/seller"
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
              >
                <ArrowLeft className="h-4 w-4" />

                <span className="hidden sm:inline">
                  Dashboard
                </span>
              </Link>
            </div>
          </header>

          {/* Content */}

          <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="mx-auto max-w-[1100px]">

              {/* Heading */}

              <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
                    Business ownership
                  </p>

                  <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#17202A] sm:text-3xl">
                    Business claims
                  </h1>

                  <p className="mt-2 max-w-[650px] text-sm leading-6 text-gray-500">
                    Submit a request to claim a business on ReMarket and track admin review.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void loadClaims(
                      true
                    )
                  }
                  disabled={
                    refreshing ||
                    loading
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      refreshing
                        ? "animate-spin"
                        : ""
                    }`}
                  />

                  Refresh
                </button>
              </div>

              {/* Feedback */}

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-[#FFB8B0] bg-[#FFF0EE] px-4 py-4"
                >
                  <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#E33B22]" />

                  <p className="text-sm text-[#E33B22]">
                    {error}
                  </p>
                </div>
              )}

              {success && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-4"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#137A59]" />

                  <p className="text-sm text-[#137A59]">
                    {success}
                  </p>
                </div>
              )}

              {/* Summary */}

              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E8E4DE]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Total claims
                  </p>

                  <p className="mt-2 text-2xl font-black text-[#17202A]">
                    {claims.length}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E8E4DE]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Pending
                  </p>

                  <p className="mt-2 text-2xl font-black text-[#9A6700]">
                    {pendingCount}
                  </p>
                </div>

                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E8E4DE]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Approved
                  </p>

                  <p className="mt-2 text-2xl font-black text-[#3566B8]">
                    {approvedCount}
                  </p>
                </div>
              </div>

              {/* Submit claim */}

              <section className="rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                      <ShieldCheck className="h-5 w-5" />
                    </div>

                    <div>
                      <h2 className="text-lg font-bold text-[#17202A]">
                        Claim a business
                      </h2>

                      <p className="mt-1 text-xs text-gray-500">
                        Submit the business you want to claim for admin review.
                      </p>
                    </div>
                  </div>
                </div>

                <form
                  onSubmit={
                    submitClaim
                  }
                  className="space-y-5 px-5 py-6 sm:px-6"
                >
                  <div>
                    <label
                      htmlFor="business-id"
                      className="mb-2 block text-xs font-bold text-gray-700"
                    >
                      Business ID
                    </label>

                    <input
                      id="business-id"
                      type="text"
                      value={
                        businessId
                      }
                      onChange={(
                        event
                      ) => {
                        setBusinessId(
                          event.target
                            .value
                        );

                        setError("");
                        setSuccess("");
                      }}
                      placeholder="Paste the ReMarket business ID"
                      required
                      disabled={
                        submitting
                      }
                      className="h-12 w-full rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                    />

                    <p className="mt-2 text-[11px] leading-5 text-gray-400">
                      The business must currently be unowned and active.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="claim-reason"
                      className="mb-2 block text-xs font-bold text-gray-700"
                    >
                      Reason
                    </label>

                    <textarea
                      id="claim-reason"
                      value={reason}
                      onChange={(
                        event
                      ) => {
                        setReason(
                          event.target
                            .value
                        );

                        setError("");
                        setSuccess("");
                      }}
                      rows={4}
                      placeholder="Tell the admin why you are the owner of this business."
                      disabled={
                        submitting
                      }
                      className="w-full resize-none rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                    />
                  </div>

                  <div className="flex justify-end border-t border-[#EAE6DF] pt-5">
                    <button
                      type="submit"
                      disabled={
                        submitting
                      }
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Submit claim
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </section>

              {/* Claim history */}

              <section className="mt-5 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
                    History
                  </p>

                  <h2 className="mt-1 text-lg font-bold text-[#17202A]">
                    Your claim requests
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    Track the businesses you have requested to claim.
                  </p>
                </div>

                <div className="p-5 sm:p-6">
                  {loading ? (
                    <div className="flex items-center justify-center rounded-2xl bg-[#FCFAF6] px-5 py-12">
                      <div className="flex items-center gap-3 text-sm font-medium text-gray-600">
                        <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
                        Loading claim requests...
                      </div>
                    </div>
                  ) : claims.length ===
                    0 ? (
                    <div className="rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FCFAF6] px-5 py-12 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
                        <ShieldCheck className="h-6 w-6" />
                      </div>

                      <h3 className="mt-4 text-sm font-bold text-[#17202A]">
                        No claim requests yet
                      </h3>

                      <p className="mx-auto mt-1 max-w-[430px] text-xs leading-5 text-gray-500">
                        When you submit a business ownership claim, its status will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {claims.map(
                        (
                          claim
                        ) => (
                          <article
                            key={
                              claim.id
                            }
                            className="rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm font-bold text-[#17202A]">
                                    {claim.business?.name ??
                                      "Business claim"}
                                  </h3>

                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${getStatusClasses(
                                      claim.status
                                    )}`}
                                  >
                                    {getStatusIcon(
                                      claim.status
                                    )}

                                    {
                                      claim.status
                                    }
                                  </span>
                                </div>

                                <p className="mt-2 text-[11px] text-gray-400">
                                  Business ID:{" "}
                                  {
                                    claim.businessId
                                  }
                                </p>

                                <p className="mt-1 text-[11px] text-gray-400">
                                  Submitted{" "}
                                  {formatDate(
                                    claim.createdAt
                                  )}
                                </p>

                                {claim.reviewedAt && (
                                  <p className="mt-1 text-[11px] text-gray-400">
                                    Reviewed{" "}
                                    {formatDate(
                                      claim.reviewedAt
                                    )}
                                  </p>
                                )}

                                {claim.reason && (
                                  <div className="mt-3 rounded-xl bg-white p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                                      Reason
                                    </p>

                                    <p className="mt-1 text-xs leading-5 text-gray-600">
                                      {
                                        claim.reason
                                      }
                                    </p>
                                  </div>
                                )}
                              </div>

                              <Link
                                href={`/seller/${claim.businessId}`}
                                className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white px-3 py-2 text-[11px] font-bold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                              >
                                View business
                              </Link>
                            </div>
                          </article>
                        )
                      )}
                    </div>
                  )}
                </div>
              </section>

            </div>
          </div>
        </div>
      </div>
    </main>
  );
}