"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
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
  SearchCheck,
  FileCheck2,
  LockKeyhole,
  ExternalLink,
  Info,
} from "lucide-react";

import NotificationBell from "@/components/NotificationBell";

type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

type ClaimRequest = {
  id: string;
  businessId: string;
  reason: string | null;
  status: ClaimStatus;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  business?: { id: string; name: string } | null;
};

type ClaimsResponse = {
  requests?: unknown;
  claims?: unknown;
  claimRequests?: unknown;
  request?: unknown;
  error?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClaimStatus(value: unknown): value is ClaimStatus {
  return value === "PENDING" || value === "APPROVED" || value === "REJECTED";
}

function normalizeClaimRequest(value: unknown): ClaimRequest | null {
  if (!isRecord(value)) return null;

  if (
    typeof value.id !== "string" ||
    typeof value.businessId !== "string" ||
    !isClaimStatus(value.status) ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  let business: ClaimRequest["business"] = null;
  if (
    isRecord(value.business) &&
    typeof value.business.id === "string" &&
    typeof value.business.name === "string"
  ) {
    business = { id: value.business.id, name: value.business.name };
  }

  return {
    id: value.id,
    businessId: value.businessId,
    reason: typeof value.reason === "string" ? value.reason : null,
    status: value.status,
    reviewedAt: typeof value.reviewedAt === "string" ? value.reviewedAt : null,
    createdAt: value.createdAt,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : value.createdAt,
    business,
  };
}

function getApiError(data: unknown, fallback: string): string {
  return isRecord(data) && typeof data.error === "string" && data.error.trim()
    ? data.error
    : fallback;
}

function getStatusClasses(status: ClaimStatus): string {
  switch (status) {
    case "PENDING":
      return "border-[#F1DCA1] bg-[#FFF5D9] text-[#8A5D00]";
    case "APPROVED":
      return "border-[#C7DAFF] bg-[#E7F0FF] text-[#315EA8]";
    case "REJECTED":
      return "border-[#F1D0CA] bg-[#FFF0EE] text-[#B9382A]";
  }
}

function getStatusIcon(status: ClaimStatus) {
  switch (status) {
    case "PENDING":
      return <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />;
    case "APPROVED":
      return <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />;
    case "REJECTED":
      return <XCircle aria-hidden="true" className="h-3.5 w-3.5" />;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Accept either an ID or a ReMarket public seller URL.
 * The API receives only the extracted business ID.
 * This is a usability helper, not an ownership/security check.
 */
function normalizeBusinessReference(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value || value.length > 500) return null;

  const looksLikeUrl = /^https?:\/\//i.test(value) || value.startsWith("/");
  if (!looksLikeUrl) {
    if (/[\s/?#]/.test(value)) return null;
    return value.length <= 200 ? value : null;
  }

  try {
    const url = new URL(value, window.location.origin);
    const host = url.hostname.toLowerCase();
    const currentHost = window.location.hostname.toLowerCase();
    const isRemarketHost =
      host === currentHost ||
      host === "remarket.com.ng" ||
      host.endsWith(".remarket.com.ng");

    if (!isRemarketHost) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts[0] !== "seller") return null;

    const id = decodeURIComponent(parts[1]).trim();
    if (!id || id.length > 200 || /[\s/?#]/.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

export default function SellerClaimsPage() {
  const router = useRouter();
  const requestSequenceRef = useRef(0);

  const [claims, setClaims] = useState<ClaimRequest[]>([]);
  const [businessReference, setBusinessReference] = useState("");
  const [reason, setReason] = useState("");
  const [confirmedAuthority, setConfirmedAuthority] = useState(false);

  // Keep the page gated until the authenticated claim-history request completes.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadClaims = useCallback(
    async (showRefreshing = false) => {
      const requestId = ++requestSequenceRef.current;

      if (showRefreshing) setRefreshing(true);
      else setLoading(true);

      setHistoryError("");
      setError("");

      try {
        const response = await fetch("/api/seller/business-claim-requests", {
          cache: "no-store",
        });

        let data: ClaimsResponse | null = null;
        try {
          data = (await response.json()) as ClaimsResponse;
        } catch {
          data = null;
        }

        if (requestId !== requestSequenceRef.current) return;

        if (response.status === 401 || response.status === 403) {
          setRedirecting(true);
          router.replace("/seller/login");
          return;
        }

        if (!response.ok) {
          throw new Error(getApiError(data, "Unable to load your claim requests."));
        }

        const rawClaims = data?.requests ?? data?.claims ?? data?.claimRequests ?? [];
        if (!Array.isArray(rawClaims)) {
          throw new Error("The claim requests response is invalid.");
        }

        const normalizedClaims = rawClaims
          .map(normalizeClaimRequest)
          .filter((claim): claim is ClaimRequest => claim !== null);

        if (requestId !== requestSequenceRef.current) return;
        setClaims(normalizedClaims);
        setHistoryError("");
      } catch (loadError) {
        if (requestId !== requestSequenceRef.current) return;
        console.error("Seller claims load error:", loadError);
        setHistoryError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your claim requests."
        );
      } finally {
        if (requestId === requestSequenceRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [router]
  );

  useEffect(() => {
    void loadClaims();
    return () => {
      requestSequenceRef.current += 1;
    };
  }, [loadClaims]);

  const pendingCount = claims.filter((claim) => claim.status === "PENDING").length;
  const approvedCount = claims.filter((claim) => claim.status === "APPROVED").length;
  const rejectedCount = claims.filter((claim) => claim.status === "REJECTED").length;

  const normalizedBusinessId = normalizeBusinessReference(businessReference);
  const hasPendingClaimForInput = Boolean(
    normalizedBusinessId &&
      claims.some(
        (claim) =>
          claim.businessId === normalizedBusinessId &&
          claim.status === "PENDING"
      )
  );

  async function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");
    setSuccess("");

    const cleanReason = reason.trim();
    const cleanBusinessId = normalizeBusinessReference(businessReference);

    if (!cleanBusinessId) {
      setError(
        "Enter a valid ReMarket business ID or paste a public business page link from ReMarket."
      );
      return;
    }

    if (!confirmedAuthority) {
      setError(
        "Confirm that you own this business or are authorized to represent it before submitting the claim."
      );
      return;
    }

    if (cleanReason.length < 20) {
      setError(
        "Please explain why you are authorized to claim this business in at least 20 characters so an admin can review your request."
      );
      return;
    }

    if (cleanReason.length > 1000) {
      setError("Your reason must not exceed 1000 characters.");
      return;
    }

    if (
      claims.some(
        (claim) =>
          claim.businessId === cleanBusinessId &&
          claim.status === "PENDING"
      )
    ) {
      setError(
        "You already have a pending claim for this business. Refresh your claim history to check its latest status."
      );
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/seller/business-claim-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: cleanBusinessId,
          reason: cleanReason,
        }),
      });

      let data: ClaimsResponse | null = null;
      try {
        data = (await response.json()) as ClaimsResponse;
      } catch {
        data = null;
      }

      if (response.status === 401 || response.status === 403) {
        setRedirecting(true);
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(getApiError(data, "Unable to submit your claim request."));
        return;
      }

      setBusinessReference("");
      setReason("");
      setConfirmedAuthority(false);
      setSuccess(
        "Your claim was submitted. The business will not change ownership unless an authorized admin approves the request."
      );

      // Refresh in the background so a successful submit does not hide the page.
      await loadClaims(true);
    } catch (submitError) {
      console.error("Seller claim submission error:", submitError);
      setError("Something went wrong while submitting your claim. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || redirecting) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#FFF7ED] px-4 py-8">
        <div className="flex items-center gap-3 rounded-2xl border border-[#EAE6DF] bg-white px-5 py-4 text-sm font-medium text-gray-600 shadow-sm">
          <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-[#FF5A36]" />
          {redirecting ? "Redirecting to seller login..." : "Checking your seller access..."}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh w-full min-w-0 overflow-x-clip bg-[#FFF7ED]">
      <div className="mx-auto min-h-dvh w-full min-w-0 max-w-[1500px] px-2 py-2 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
        <div className="min-h-[calc(100dvh-16px)] w-full min-w-0 overflow-hidden rounded-[18px] border border-[#FF5A36]/80 bg-[#FFFDFC] shadow-sm sm:min-h-[calc(100dvh-32px)] sm:rounded-[22px] lg:min-h-[calc(100dvh-40px)]">
          <header className="flex min-h-[66px] items-center justify-between gap-3 border-b border-[#EAE6DF] bg-white px-3 sm:px-6">
            <Link href="/seller" className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
                <Store aria-hidden="true" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight text-[#17202A]">ReMarket</p>
                <p className="text-[10px] leading-none text-gray-400">Seller Portal</p>
              </div>
            </Link>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <NotificationBell />
              <Link
                href="/seller"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20 sm:px-3.5"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </div>
          </header>

          <div className="w-full min-w-0 px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-8 xl:px-10">
            <div className="mx-auto w-full min-w-0 max-w-[1180px]">
              {/* Intro */}
              <section className="relative mb-6 overflow-hidden rounded-[24px] border border-[#F2D8CB] bg-white p-5 shadow-sm sm:p-7 lg:p-8">
                <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-[#FFF0E8] sm:h-64 sm:w-64" />
                <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-center">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#FFD7C8] bg-[#FFF7F2] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#A93D24]">
                      <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                      Business ownership
                    </div>
                    <h1 className="mt-3 text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl lg:text-[2.15rem]">
                      Business claims
                    </h1>
                    <p className="mt-2 max-w-[680px] text-sm leading-6 text-gray-600 sm:text-[15px]">
                      Request access to manage an eligible business listing. Every claim is reviewed, and submitting a request does not transfer ownership.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1.5"><LockKeyhole aria-hidden="true" className="h-4 w-4 text-[#FF5A36]" /> Seller account required</span>
                      <span className="inline-flex items-center gap-1.5"><FileCheck2 aria-hidden="true" className="h-4 w-4 text-[#FF5A36]" /> Admin review required</span>
                    </div>
                  </div>
                  <div className="relative grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2.5">
                    <div className="rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-3 sm:p-4">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-gray-500 sm:text-[10px]">Total</p>
                      <p className="mt-1 text-xl font-black tabular-nums text-[#17202A] sm:text-2xl">{claims.length}</p>
                      <p className="mt-0.5 hidden text-[11px] text-gray-500 sm:block">All requests</p>
                    </div>
                    <div className="rounded-2xl border border-[#F1DCA1] bg-[#FFFBEE] p-3 sm:p-4">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#8A5D00] sm:text-[10px]">Pending</p>
                      <p className="mt-1 text-xl font-black tabular-nums text-[#8A5D00] sm:text-2xl">{pendingCount}</p>
                      <p className="mt-0.5 hidden text-[11px] text-[#8A5D00] sm:block">Awaiting review</p>
                    </div>
                    <div className="rounded-2xl border border-[#C7DAFF] bg-[#F3F7FF] p-3 sm:p-4">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#315EA8] sm:text-[10px]">Approved</p>
                      <p className="mt-1 text-xl font-black tabular-nums text-[#315EA8] sm:text-2xl">{approvedCount}</p>
                      <p className="mt-0.5 hidden text-[11px] text-[#315EA8] sm:block">Approved claims</p>
                    </div>
                  </div>
                </div>
              </section>

              {error && (
                <div role="alert" aria-live="polite" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#FFB8B0] bg-[#FFF0EE] px-4 py-4">
                  <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#E33B22]" />
                  <p className="min-w-0 flex-1 break-words text-sm text-[#B9382A]">{error}</p>
                </div>
              )}

              {success && (
                <div role="status" aria-live="polite" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-4">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#137A59]" />
                  <p className="min-w-0 flex-1 break-words text-sm text-[#137A59]">{success}</p>
                </div>
              )}

              <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)]">
                {/* Claim form */}
                <section className="min-w-0 max-w-full overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                  <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                        <ShieldCheck aria-hidden="true" className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-[#17202A]">Request a business claim</h2>
                        <p className="mt-1 text-xs leading-5 text-gray-500">Share the listing and explain why you are authorized to manage it.</p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={submitClaim} className="space-y-5 px-5 py-6 sm:px-6" noValidate>
                    <div>
                      <label htmlFor="business-reference" className="mb-2 block text-xs font-bold text-gray-700">Business ID or public page link</label>
                      <div className="relative">
                        <SearchCheck aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#FF694F]" />
                        <input
                          id="business-reference"
                          name="businessReference"
                          type="text"
                          value={businessReference}
                          onChange={(event) => {
                            setBusinessReference(event.target.value);
                            setError("");
                            setSuccess("");
                          }}
                          placeholder="Paste /seller/business-id or the ID"
                          maxLength={500}
                          autoComplete="url"
                          required
                          disabled={submitting}
                          aria-describedby="business-reference-help"
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white pl-11 pr-4 text-sm text-[#17202A] outline-none transition placeholder:text-gray-400 focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
                        />
                      </div>
                      <p id="business-reference-help" className="mt-2 text-[11px] leading-5 text-gray-500">
                        Open the public business page and copy its URL, or enter the business ID. The link is converted to an ID before submission.
                      </p>
                      {businessReference.trim() && normalizedBusinessId && (
                        <p className="mt-2 break-all rounded-lg bg-[#F4FBF7] px-3 py-2 text-[11px] text-[#137A59]">
                          Business reference recognized: <span className="font-semibold">{normalizedBusinessId}</span>
                        </p>
                      )}
                      {hasPendingClaimForInput && (
                        <p role="status" className="mt-2 rounded-lg border border-[#F1DCA1] bg-[#FFFBEE] px-3 py-2 text-[11px] leading-5 text-[#8A5D00]">
                          You already have a pending request for this business. Refresh your history instead of sending another one.
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label htmlFor="claim-reason" className="block text-xs font-bold text-gray-700">Why are you authorized to claim it?</label>
                        <span className="shrink-0 text-[10px] tabular-nums text-gray-400">{reason.length}/1000</span>
                      </div>
                      <textarea
                        id="claim-reason"
                        name="reason"
                        value={reason}
                        onChange={(event) => {
                          setReason(event.target.value);
                          setError("");
                          setSuccess("");
                        }}
                        rows={5}
                        maxLength={1000}
                        placeholder="For example, explain your role in the business and how an admin can verify it. Do not include passwords or one-time codes."
                        required
                        disabled={submitting}
                        aria-describedby="claim-reason-help"
                        className="w-full min-w-0 resize-y rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm leading-6 text-[#17202A] outline-none transition placeholder:text-gray-400 focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
                      />
                      <p id="claim-reason-help" className="mt-2 text-[11px] leading-5 text-gray-500">
                        Give enough detail for a reviewer to investigate. This explanation supports review but does not prove ownership by itself.
                      </p>
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#F0D7C9] bg-[#FFF9F5] p-4 transition hover:border-[#FFB39F]">
                      <input
                        type="checkbox"
                        checked={confirmedAuthority}
                        onChange={(event) => {
                          setConfirmedAuthority(event.target.checked);
                          setError("");
                        }}
                        disabled={submitting}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF5A36] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20"
                      />
                      <span className="min-w-0 text-xs leading-5 text-gray-700">
                        <span className="font-bold text-[#17202A]">Authority confirmation</span><br />
                        I confirm that I own this business or have permission to represent it, and I understand ReMarket may request further evidence before a claim is approved.
                      </span>
                    </label>

                    <div className="border-t border-[#EAE6DF] pt-5">
                      <button
                        type="submit"
                        disabled={submitting || hasPendingClaimForInput}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#E94B2B] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {submitting ? (
                          <><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> Submitting claim...</>
                        ) : (
                          <><Send aria-hidden="true" className="h-4 w-4" /> Submit for admin review</>
                        )}
                      </button>
                      <p className="mt-3 text-center text-[10px] leading-5 text-gray-400">
                        Submitting a request does not grant access or change business ownership.
                      </p>
                    </div>
                  </form>
                </section>

                {/* Review process and claim history */}
                <div className="min-w-0 space-y-5">
                  <section className="rounded-[22px] border border-[#E8E4DE] bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0F5FF] text-[#3566B8]">
                        <LockKeyhole aria-hidden="true" className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-[#17202A]">How verification works</h2>
                        <p className="mt-1 text-[11px] text-gray-500">A claim is a request, not instant access.</p>
                      </div>
                    </div>
                    <div className="mt-5 space-y-4">
                      <div className="flex gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0EB] text-xs font-black text-[#FF5A36]">1</div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#17202A]">Submit the exact listing</p>
                          <p className="mt-1 text-xs leading-5 text-gray-500">Use the business page URL or ID and explain your relationship to the business.</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0EB] text-xs font-black text-[#FF5A36]">2</div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#17202A]">Admin checks the claim</p>
                          <p className="mt-1 text-xs leading-5 text-gray-500">The reviewer should independently verify the claimant and business before making an ownership decision.</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0EB] text-xs font-black text-[#FF5A36]">3</div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#17202A]">Track the decision here</p>
                          <p className="mt-1 text-xs leading-5 text-gray-500">Your request appears in the history below with its latest status.</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] p-3">
                      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" />
                      <p className="text-[11px] leading-5 text-gray-600">Never enter a password or one-time code in a claim reason. ReMarket should verify claims through its approved review process.</p>
                    </div>
                  </section>

                  <section className="min-w-0 overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-[#EAE6DF] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#FF5A36]">Claim history</p>
                        <h2 className="mt-1 text-lg font-bold text-[#17202A]">Your requests</h2>
                        <p className="mt-1 text-xs leading-5 text-gray-500">Review the latest status of each request.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadClaims(true)}
                        disabled={refreshing || loading}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-[#E8E4DE] bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
                      >
                        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                        {refreshing ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>

                    <div className="p-4 sm:p-5">
                      {historyError ? (
                        <div className="rounded-2xl border border-[#F1D0CA] bg-[#FFF6F4] px-4 py-6 text-center">
                          <CircleAlert aria-hidden="true" className="mx-auto h-7 w-7 text-[#C5402D]" />
                          <h3 className="mt-3 text-sm font-bold text-[#17202A]">Claim history unavailable</h3>
                          <p className="mx-auto mt-1 max-w-[360px] text-xs leading-5 text-gray-600">{historyError}</p>
                          <button
                            type="button"
                            onClick={() => void loadClaims(true)}
                            disabled={refreshing}
                            className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2 text-xs font-bold text-white hover:bg-[#E94B2B] disabled:opacity-60"
                          >
                            {refreshing ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                            Try again
                          </button>
                        </div>
                      ) : claims.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FCFAF6] px-5 py-10 text-center sm:py-12">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
                            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
                          </div>
                          <h3 className="mt-4 text-sm font-bold text-[#17202A]">No claim requests yet</h3>
                          <p className="mx-auto mt-1 max-w-[330px] text-xs leading-5 text-gray-500">When you submit a claim, its status will appear here so you can follow the review.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {claims.map((claim) => (
                            <article key={claim.id} className="min-w-0 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4 transition hover:border-[#DDCFC7]">
                              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="min-w-0 break-words text-sm font-bold text-[#17202A]">{claim.business?.name ?? "Business claim"}</h3>
                                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${getStatusClasses(claim.status)}`}>
                                      {getStatusIcon(claim.status)}{claim.status}
                                    </span>
                                  </div>
                                  <p className="mt-2 break-all text-[10px] leading-5 text-gray-400">Business ID: {claim.businessId}</p>
                                  <p className="mt-0.5 text-[10px] text-gray-400">Submitted {formatDate(claim.createdAt)}</p>
                                  {claim.reviewedAt && <p className="mt-0.5 text-[10px] text-gray-400">Reviewed {formatDate(claim.reviewedAt)}</p>}
                                  {claim.reason && (
                                    <div className="mt-3 rounded-xl border border-[#EAE6DF] bg-white p-3">
                                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-gray-400">Submitted explanation</p>
                                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-gray-600">{claim.reason}</p>
                                    </div>
                                  )}
                                  {claim.status === "PENDING" && (
                                    <p className="mt-3 text-[11px] leading-5 text-[#8A5D00]">Your request is awaiting review. Submitting again is not necessary.</p>
                                  )}
                                  {claim.status === "APPROVED" && (
                                    <p className="mt-3 text-[11px] leading-5 text-[#315EA8]">Your claim has been approved. Visit the listing to check its current status.</p>
                                  )}
                                  {claim.status === "REJECTED" && (
                                    <p className="mt-3 text-[11px] leading-5 text-[#B9382A]">This claim was rejected. Review the business details before submitting any new request.</p>
                                  )}
                                </div>
                                <Link
                                  href={`/seller/${encodeURIComponent(claim.businessId)}`}
                                  className="inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2 text-[11px] font-bold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20 sm:w-auto"
                                >
                                  View business <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Link href="/seller" className="rounded-2xl border border-[#E8E4DE] bg-white p-4 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20">
                      <p className="text-xs font-bold text-[#17202A]">Seller dashboard</p>
                      <p className="mt-1 text-[11px] leading-5 text-gray-500">Manage your business and products.</p>
                    </Link>
                    <Link href="/seller/profile" className="rounded-2xl border border-[#E8E4DE] bg-white p-4 transition hover:border-[#FFB39F] hover:bg-[#FFF7ED] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20">
                      <p className="text-xs font-bold text-[#17202A]">Seller profile</p>
                      <p className="mt-1 text-[11px] leading-5 text-gray-500">Update your account information.</p>
                    </Link>
                  </div>
                </div>
              </div>

              <footer className="mt-6 flex flex-col gap-2 border-t border-[#EAE6DF] pt-4 text-[10px] leading-5 text-gray-400 sm:flex-row sm:items-center sm:justify-between">
                <span>ReMarket Seller Portal</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" /> Claims remain subject to admin verification.</span>
              </footer>

              {rejectedCount > 0 && (
                <p className="sr-only">You have {rejectedCount} rejected claim requests.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
