"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

type VerifyResult = {
  success?: boolean;
  paymentStatus?: "SUCCESS" | "FAILED" | "CANCELLED" | "PENDING";
  orderStatus?: string;
  order?: { id: string; orderCode: string };
  payment?: { reference: string; status: string; paidAt: string | null };
  requiresManualReview?: boolean;
  message?: string;
  error?: string;
};

type PaymentState = "VERIFYING" | "SUCCESS" | "PENDING" | "FAILED" | "REVIEW" | "ERROR";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") ?? searchParams.get("trxref") ?? "";
  const [state, setState] = useState<PaymentState>("VERIFYING");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const lastAutoVerifiedReference = useRef<string | null>(null);

  const verify = useCallback(async () => {
    if (!reference) {
      setState("ERROR");
      setError("The payment reference is missing. Please open your ReMarket orders or contact support.");
      return;
    }

    setState("VERIFYING");
    setError("");

    try {
      const response = await fetch(
        `/api/payments/paystack/verify?reference=${encodeURIComponent(reference)}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );

      const payload: unknown = await response.json().catch(() => null);
      if (!isRecord(payload)) {
        throw new Error("We received an unexpected payment verification response.");
      }
      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "We could not verify your payment.");
      }

      const parsed = payload as VerifyResult;
      setResult(parsed);

      if (parsed.requiresManualReview) {
        setState("REVIEW");
      } else if (parsed.paymentStatus === "SUCCESS" && parsed.success === true) {
        setState("SUCCESS");
      } else if (parsed.paymentStatus === "FAILED" || parsed.paymentStatus === "CANCELLED") {
        setState("FAILED");
      } else {
        setState("PENDING");
      }
    } catch (verificationError) {
      setState("ERROR");
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "Payment verification is temporarily unavailable. Try again.",
      );
    }
  }, [reference]);

  // Prevent duplicate automatic requests in React Strict Mode, while allowing
  // a new reference in the URL to be checked if the route is reused.
  useEffect(() => {
    if (lastAutoVerifiedReference.current === reference) return;
    lastAutoVerifiedReference.current = reference;
    void verify();
  }, [reference, verify]);

  const isSuccessful = state === "SUCCESS";
  const isReview = state === "REVIEW";
  const isWorking = state === "VERIFYING";
  const isPending = state === "PENDING";
  const isFailed = state === "FAILED";

  const statusLabel = isWorking
    ? "Verifying with Paystack"
    : isSuccessful
      ? "Payment confirmed"
      : isReview
        ? "Payment needs review"
        : isPending
          ? "Payment processing"
          : isFailed
            ? "Payment not completed"
            : "Verification unavailable";

  const heading = isWorking
    ? "Checking your payment"
    : isSuccessful
      ? "Thank you for your order"
      : isReview
        ? "We received your payment"
        : isPending
          ? "Your payment is still processing"
          : isFailed
            ? "Your payment was not confirmed"
            : "We couldn't verify your payment yet";

  const description = isWorking
    ? "Please keep this page open while ReMarket confirms the transaction directly with Paystack."
    : state === "ERROR"
      ? error || "Payment verification is temporarily unavailable. Try again."
      : result?.message ?? (isPending
        ? "Paystack has not returned a final transaction status. You can check again shortly."
        : isFailed
          ? "The payment was not completed. You can check the status again before trying another payment."
          : "Please contact ReMarket support if you need help with this payment.");

  const statusTone = isSuccessful
    ? "success"
    : isReview
      ? "warning"
      : isFailed || state === "ERROR"
        ? "danger"
        : "neutral";

  const StatusIcon = isWorking || isPending
    ? LoaderCircle
    : isSuccessful
      ? CheckCircle2
      : isReview || isFailed
        ? AlertCircle
        : ShieldCheck;

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />
      <main className="rm-storefront min-h-[70vh] px-4 py-8 pb-28 sm:px-6 sm:py-12 lg:pb-12">
        <div className="mx-auto w-full max-w-[640px]">
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-xs text-[var(--rm-muted)]">
            <Link href="/" className="hover:text-[var(--rm-coral-dark)]">Home</Link>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-[var(--rm-ink)]">Payment confirmation</span>
          </nav>

          <section className="rm-panel overflow-hidden" aria-live="polite" aria-busy={isWorking}>
            <div className="border-b border-[var(--rm-border)] px-5 py-8 text-center sm:px-9 sm:py-10">
              <div
                className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${
                  statusTone === "success"
                    ? "bg-[var(--rm-green-bg)] text-[var(--rm-green)]"
                    : statusTone === "warning"
                      ? "bg-[var(--rm-yellow-bg)] text-[var(--rm-yellow)]"
                      : statusTone === "danger"
                        ? "bg-[var(--rm-red-bg)] text-[var(--rm-red)]"
                        : "bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]"
                }`}
              >
                <StatusIcon className={`h-8 w-8 ${isWorking || isPending ? "animate-spin" : ""}`} aria-hidden="true" />
              </div>

              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--rm-muted)]">
                {statusLabel}
              </p>
              <h1 className="mt-2 text-2xl font-bold leading-tight tracking-[-0.035em] text-[var(--rm-ink)] sm:text-[30px]">
                {heading}
              </h1>
              <p className="mx-auto mt-3 max-w-[460px] text-sm leading-6 text-[var(--rm-muted)]">
                {description}
              </p>
            </div>

            <div className="space-y-5 p-5 sm:p-8">
              {result?.order?.orderCode && (
                <div className="rounded-[var(--rm-radius-md)] border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] px-4 py-4 text-center">
                  <p className="text-[11px] font-semibold text-[var(--rm-muted)]">ReMarket order reference</p>
                  <p className="mt-1 break-all text-xl font-bold tracking-wide text-[var(--rm-coral-dark)]">
                    {result.order.orderCode}
                  </p>
                </div>
              )}

              {isSuccessful && result?.order?.id && (
                <Link
                  href={`/orders/${encodeURIComponent(result.order.id)}`}
                  className="rm-button rm-button-primary min-h-12 w-full"
                >
                  View your order <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}

              {isReview && (
                <div className="rounded-[var(--rm-radius-md)] border border-[#ead7ad] bg-[var(--rm-yellow-bg)] p-4 text-sm leading-6 text-[#76551b]">
                  Your payment is recorded, but ReMarket has paused seller fulfilment while the order is reviewed. Keep the order reference above and contact ReMarket support. Do not pay again.
                </div>
              )}

              {(isPending || isFailed || state === "ERROR") && (
                <button
                  type="button"
                  onClick={() => void verify()}
                  disabled={isWorking}
                  className="rm-button rm-button-primary min-h-12 w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isWorking
                    ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                  Check payment again
                </button>
              )}

              {!isSuccessful && !isReview && (
                <Link href="/cart" className="rm-button rm-button-secondary min-h-11 w-full">
                  Return to cart
                </Link>
              )}

              <div className="flex items-start gap-2 rounded-[var(--rm-radius-md)] bg-[var(--rm-surface-muted)] p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rm-green)]" aria-hidden="true" />
                <p className="text-xs leading-5 text-[var(--rm-muted)]">
                  Do not make another payment while this transaction is pending or being verified. ReMarket checks the payment status with Paystack.
                </p>
              </div>

              <div className="flex flex-col items-center gap-3 border-t border-[var(--rm-border)] pt-5 sm:flex-row sm:justify-between">
                <Link href="/" className="rm-text-link">
                  Return to ReMarket home
                </Link>
                {!isSuccessful && !isReview && (
                  <span className="text-xs text-[var(--rm-muted)]">Need help? Contact ReMarket support.</span>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
      <MobileBottomNav />
    </>
  );
}

export default function PaystackPaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <>
          <SiteHeader searchMode="PRODUCTS" />
          <main className="rm-storefront flex min-h-[70vh] items-center justify-center px-4 pb-28 pt-10">
            <div className="rm-panel flex w-full max-w-sm items-center justify-center gap-3 px-6 py-5 text-sm font-semibold text-[var(--rm-muted)]">
              <LoaderCircle className="h-5 w-5 animate-spin text-[var(--rm-coral)]" aria-hidden="true" />
              Loading payment confirmation...
            </div>
          </main>
          <MobileBottomNav />
        </>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}
