"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, RefreshCw, Search, Wallet } from "lucide-react";

type PaymentRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  provider: string | null;
  providerReference: string | null;
  providerTransactionId: string | null;
  providerVerified: boolean;
  initializedAt: string | null;
  expiresAt: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  order: {
    id: string;
    orderCode: string;
    status: string;
    totalAmount: number;
    currency: string;
    paidAt: string | null;
    buyer: { id: string; name: string | null; email: string };
  };
};
type PaymentResponse = {
  success: boolean;
  payments: PaymentRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  statusCounts: Record<string, number>;
  error?: string;
};

const STATUSES = ["", "PENDING", "INITIATED", "SUCCESS", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"];

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(amount);
}
function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}
function readable(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function statusClasses(status: string) {
  if (status === "SUCCESS") return "bg-[#E8F6EE] text-[#167344]";
  if (["FAILED", "CANCELLED"].includes(status)) return "bg-[#FCE8E6] text-[#B42318]";
  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(status)) return "bg-[#F1EAFE] text-[#6941A5]";
  return "bg-[#FFF0D9] text-[#9F5A18]";
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (appliedQuery) params.set("q", appliedQuery);
    if (status) params.set("status", status);
    try {
      const response = await fetch(`/api/admin/payments?${params.toString()}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null) as PaymentResponse | null;
      if (!response.ok || !payload?.success || !Array.isArray(payload.payments)) {
        throw new Error(payload?.error || "Unable to load payment records.");
      }
      setPayments(payload.payments);
      setCounts(payload.statusCounts || {});
      setTotal(payload.pagination?.total ?? 0);
      setTotalPages(payload.pagination?.totalPages ?? 0);
    } catch (loadError) {
      if (signal.aborted) return;
      setPayments([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to load payment records.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, appliedQuery, status]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  const totalRecords = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const successful = counts.SUCCESS ?? 0;
  const pending = (counts.PENDING ?? 0) + (counts.INITIATED ?? 0);
  const failed = (counts.FAILED ?? 0) + (counts.CANCELLED ?? 0);

  function applySearch() { setPage(1); setAppliedQuery(query.trim()); }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 pb-12 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#FF5A36]">Finance workspace</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#2E241F] sm:text-3xl">Payments</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#766C63]">Review payment attempts, provider references and verified outcomes recorded by ReMarket. This workspace is read-only; payment states must be confirmed through the provider workflow.</p></div>
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-4 text-sm font-semibold text-[#514840] hover:bg-[#FFF7F0] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Payment status summary">
        {[{ label: "Payment records", value: totalRecords, icon: CreditCard }, { label: "Successful", value: successful, icon: Wallet }, { label: "Pending / initiated", value: pending, icon: RefreshCw }, { label: "Failed / cancelled", value: failed, icon: CreditCard }].map((item) => { const Icon = item.icon; return <article key={item.label} className="rounded-2xl border border-[#E8DED3] bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[#766C63]">{item.label}</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><Icon className="h-4 w-4" /></span></div><p className="mt-2 text-2xl font-extrabold tabular-nums text-[#2E241F]">{item.value.toLocaleString("en-NG")}</p></article>; })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#E8DED3] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#F0E9E2] p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 gap-2"><label className="relative min-w-0 flex-1"><span className="sr-only">Search payments</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8178]" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }} placeholder="Reference, order code or buyer email" className="min-h-10 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] pl-9 pr-3 text-sm outline-none focus:border-[#FF5A36]" /></label><button type="button" onClick={applySearch} className="min-h-10 rounded-xl bg-[#9F2D18] px-4 text-sm font-semibold text-white hover:bg-[#842512]">Search</button></div>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#766C63]"><span>Status</span><select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="min-h-10 rounded-xl border border-[#E8DED3] bg-white px-3 text-sm text-[#2E241F] outline-none focus:border-[#FF5A36]">{STATUSES.map((value) => <option key={value || "ALL"} value={value}>{value ? readable(value) : "All statuses"}</option>)}</select></label>
        </div>
        {error && <div role="alert" className="m-4 rounded-xl border border-[#F1D1CC] bg-[#FFF4F2] p-3 text-sm text-[#B42318]">{error}</div>}
        {loading ? <div className="p-10 text-center text-sm text-[#766C63]">Loading payment records…</div> : payments.length === 0 ? <div className="p-10 text-center"><CreditCard className="mx-auto h-8 w-8 text-[#B8AEA4]" /><h2 className="mt-3 text-sm font-bold text-[#2E241F]">No payment records found</h2><p className="mt-1 text-xs text-[#766C63]">Try a different search or status filter. No sample transactions are displayed.</p></div> : <>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] text-left"><thead className="bg-[#FCFAF6] text-[11px] uppercase tracking-wide text-[#766C63]"><tr><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Buyer / Order</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Status / Verification</th><th className="px-4 py-3">Paid / Created</th></tr></thead><tbody className="divide-y divide-[#F0E9E2]">{payments.map((payment) => <tr key={payment.id} className="align-top hover:bg-[#FFFCF8]"><td className="px-4 py-4"><p className="max-w-[230px] break-all text-xs font-semibold text-[#2E241F]">{payment.providerReference || "No provider reference"}</p><p className="mt-1 text-[10px] text-[#8B8178]">{payment.method ? readable(payment.method) : "Method pending"}</p></td><td className="px-4 py-4"><p className="text-xs font-bold text-[#2E241F]">{payment.order.orderCode}</p><p className="mt-1 text-xs text-[#766C63]">{payment.order.buyer.name || payment.order.buyer.email}</p><p className="mt-1 text-[10px] text-[#8B8178]">Order status: {readable(payment.order.status)}</p></td><td className="px-4 py-4"><p className="text-sm font-extrabold text-[#9F2D18]">{formatMoney(payment.amount, payment.currency)}</p><p className="mt-1 text-[10px] text-[#8B8178]">Order: {formatMoney(payment.order.totalAmount, payment.order.currency)}</p></td><td className="px-4 py-4"><p className="text-xs font-semibold text-[#2E241F]">{payment.provider || "Not specified"}</p><p className="mt-1 max-w-[180px] break-all text-[10px] text-[#8B8178]">{payment.providerTransactionId || "No transaction ID"}</p></td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses(payment.status)}`}>{readable(payment.status)}</span><p className={`mt-2 text-[10px] font-semibold ${payment.providerVerified ? "text-[#167344]" : "text-[#8B8178]"}`}>{payment.providerVerified ? "Server verified" : "Not provider-verified"}</p>{payment.failureReason && <p title={payment.failureReason} className="mt-2 max-w-[180px] truncate text-[10px] text-[#B42318]">{payment.failureReason}</p>}</td><td className="px-4 py-4"><p className="text-xs text-[#2E241F]">{formatDate(payment.paidAt)}</p><p className="mt-1 text-[10px] text-[#8B8178]">Created {formatDate(payment.createdAt)}</p></td></tr>)}</tbody></table></div>
          <div className="divide-y divide-[#F0E9E2] md:hidden">{payments.map((payment) => <article key={payment.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-xs font-bold text-[#2E241F]">{payment.providerReference || "No provider reference"}</p><p className="mt-1 text-xs text-[#766C63]">{payment.order.orderCode} · {payment.order.buyer.name || payment.order.buyer.email}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses(payment.status)}`}>{readable(payment.status)}</span></div><p className={`text-[10px] font-semibold ${payment.providerVerified ? "text-[#167344]" : "text-[#8B8178]"}`}>{payment.providerVerified ? "Server verified" : "Not provider-verified"}</p><div className="flex items-end justify-between gap-3"><div><p className="text-lg font-extrabold text-[#9F2D18]">{formatMoney(payment.amount, payment.currency)}</p><p className="mt-1 text-[10px] text-[#8B8178]">{payment.provider || "Provider not specified"} · {payment.method ? readable(payment.method) : "Method pending"}</p></div><p className="text-right text-[10px] text-[#8B8178]">{formatDate(payment.paidAt || payment.createdAt)}</p></div>{payment.failureReason && <p className="rounded-lg bg-[#FFF4F2] p-2 text-xs text-[#B42318]">{payment.failureReason}</p>}</article>)}</div>
          <div className="flex items-center justify-between gap-3 border-t border-[#F0E9E2] px-4 py-3"><p className="text-xs text-[#8B8178]">Showing {payments.length} of {total} records · Page {page} of {Math.max(totalPages, 1)}</p><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#E8DED3] px-3 text-xs font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#E8DED3] px-3 text-xs font-semibold disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></div>
        </>}
      </section>
      <p className="mt-4 text-xs leading-5 text-[#8B8178]">Payment records are read from the existing payment ledger. This page does not mark payments as successful, initiate transfers, or change financial records.</p>
    </main>
  );
}
