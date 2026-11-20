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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") ?? searchParams.get("trxref") ?? "";
  const [state, setState] = useState<"VERIFYING" | "SUCCESS" | "PENDING" | "FAILED" | "REVIEW" | "ERROR">("VERIFYING");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef(false);

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

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void verify();
  }, [verify, attempt]);

  const isSuccessful = state === "SUCCESS";
  const isReview = state === "REVIEW";
  const isWorking = state === "VERIFYING";

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />
      <main className="min-h-[70vh] bg-[#FCFAF6] px-4 pb-28 pt-10 text-[#17202A] lg:pb-12">
        <section className="mx-auto max-w-xl overflow-hidden rounded-[26px] border border-[#EAE6DF] bg-white shadow-[0_8px_35px_rgba(23,32,42,0.05)]">
          <div className={`px-6 py-9 text-center sm:px-10 ${isSuccessful ? "bg-gradient-to-br from-[#F0FBF5] to-[#FFFDFC]" : isReview ? "bg-gradient-to-br from-[#FFF8EC] to-[#FFFDFC]" : "bg-gradient-to-br from-[#FFF1ED] to-[#FFFDFC]"}`}>
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${isSuccessful ? "bg-[#DCFCE7] text-[#16845D]" : isReview ? "bg-[#FFF0C9] text-[#96610D]" : "bg-[#FFF1ED] text-[#9F2D18]"}`}>
              {isWorking ? <LoaderCircle className="h-10 w-10 animate-spin" /> : isSuccessful ? <CheckCircle2 className="h-11 w-11" /> : isReview ? <AlertCircle className="h-10 w-10" /> : state === "PENDING" ? <LoaderCircle className="h-10 w-10" /> : <ShieldCheck className="h-10 w-10" />}
            </div>
            <p className={`mt-5 text-[10px] font-extrabold uppercase tracking-[0.16em] ${isSuccessful ? "text-[#16845D]" : isReview ? "text-[#96610D]" : "text-[#9F2D18]"}`}>
              {isWorking ? "Verifying with Paystack" : isSuccessful ? "Payment confirmed" : isReview ? "Payment needs review" : state === "PENDING" ? "Payment processing" : state === "FAILED" ? "Payment not completed" : "Verification unavailable"}
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-[#401B13] sm:text-3xl">
              {isWorking ? "Checking your payment" : isSuccessful ? "Thank you for your order" : isReview ? "We received your payment" : state === "PENDING" ? "Your payment is still processing" : state === "FAILED" ? "Your payment was not confirmed" : "We couldn't verify your payment yet"}
            </h1>
            <p className="mx-auto mt-3 max-w-md text-xs leading-6 text-[#756B61]">
              {isWorking
                ? "Please keep this page open while ReMarket confirms the transaction directly with Paystack."
                : result?.message ?? error ?? (state === "PENDING" ? "Paystack has not returned a final transaction status. You can check again shortly." : "Please try verification again. Do not make another payment while this one is still being checked.")}
            </p>
          </div>

          <div className="space-y-5 p-5 sm:p-8">
            {result?.order?.orderCode && (
              <div className="rounded-2xl border border-[#FFD9CE] bg-[#FFF1ED] p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#91877E]">ReMarket order reference</p>
                <p className="mt-2 break-all text-xl font-black text-[#9F2D18]">{result.order.orderCode}</p>
              </div>
            )}

            {isSuccessful && result?.order?.id && (
              <Link href={`/orders/${encodeURIComponent(result.order.id)}`} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C]">
                View your order <ArrowRight className="h-4 w-4" />
              </Link>
            )}

            {isReview && (
              <div className="rounded-2xl border border-[#F0D7B3] bg-[#FFF8EC] p-4 text-[11px] leading-6 text-[#796B5C]">
                Your payment is recorded, but ReMarket has paused seller fulfilment while the order is reviewed. Please keep the order reference above and contact ReMarket support. Do not pay again.
              </div>
            )}

            {(state === "PENDING" || state === "FAILED" || state === "ERROR") && (
              <button type="button" onClick={() => { startedRef.current = true; setAttempt((value) => value + 1); void verify(); }} disabled={isWorking} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white transition hover:bg-[#E94E2C] disabled:cursor-not-allowed disabled:opacity-60">
                <RefreshCw className="h-4 w-4" />
                Check payment again
              </button>
            )}

            {!isSuccessful && !isReview && (
              <Link href="/cart" className="flex justify-center text-xs font-bold text-[#9F2D18] hover:text-[#FF5A36]">
                Return to cart
              </Link>
            )}

            <Link href="/" className="flex justify-center text-xs font-bold text-[#756B61] hover:text-[#9F2D18]">
              Return to ReMarket home
            </Link>
          </div>
        </section>
      </main>
      <MobileBottomNav />
    </>
  );
}

export default function PaystackPaymentCallbackPage() {
  return (
    <Suspense fallback={
      <>
        <SiteHeader searchMode="PRODUCTS" />
        <main className="flex min-h-[70vh] items-center justify-center bg-[#FCFAF6] px-4 pb-28">
          <div className="flex items-center gap-3 rounded-2xl border border-[#EAE6DF] bg-white px-6 py-5 text-xs font-semibold text-[#756B61]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
            Loading payment confirmation...
          </div>
        </main>
        <MobileBottomNav />
      </>
    }>
      <PaymentCallbackContent />
    </Suspense>
  );
}