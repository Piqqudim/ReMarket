"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";

type SettlementStatus =
  | "AWAITING_PAYOUT_ACCOUNT"
  | "READY"
  | "PAYOUT_PENDING"
  | "PAID"
  | "FAILED"
  | "REQUIRES_REVIEW";

type PayoutStatus = "QUEUED" | "INITIATING" | "PENDING" | "SUCCESS" | "FAILED" | "REVERSED" | "REQUIRES_REVIEW";

type Settlement = {
  id: string;
  sellerOrderId: string;
  sellerId: string;
  grossSalesAmount: number;
  commissionRateBps: number;
  commissionAmount: number;
  adjustmentAmount: number;
  netPayoutAmount: number;
  currency: string;
  status: SettlementStatus;
  deliveryConfirmedAt: string;
  paidAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  seller: { id: string; name: string | null; email: string | null };
  sellerOrder: {
    id: string;
    sellerOrderCode: string;
    status: string;
    subtotal: number;
    business: { id: string; name: string };
    order: { id: string; orderCode: string; status: string; paidAt: string | null };
  };
  payout: null | {
    id: string;
    provider: string;
    reference: string;
    providerTransferCode: string | null;
    amount: number;
    currency: string;
    status: PayoutStatus;
    attemptCount: number;
    lastAttemptAt: string | null;
    nextAttemptAt: string | null;
    submittedAt: string | null;
    paidAt: string | null;
    reversedAt: string | null;
    failureReason: string | null;
    payoutAccount: { bankName: string; accountName: string; accountNumberLast4: string };
    attempts: Array<{
      attemptNumber: number;
      reference: string;
      providerTransferCode: string | null;
      status: PayoutStatus;
      failureReason: string | null;
      submittedAt: string | null;
      paidAt: string | null;
      reversedAt: string | null;
    }>;
  };
};

type ApiResponse = {
  success: boolean;
  settlements: Settlement[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
  statusCounts: Record<SettlementStatus, number>;
};

const STATUSES: Array<{ value: "ALL" | SettlementStatus; label: string }> = [
  { value: "ALL", label: "All settlements" },
  { value: "AWAITING_PAYOUT_ACCOUNT", label: "Awaiting bank account" },
  { value: "READY", label: "Ready for payout" },
  { value: "PAYOUT_PENDING", label: "Payout pending" },
  { value: "PAID", label: "Paid" },
  { value: "FAILED", label: "Failed" },
  { value: "REQUIRES_REVIEW", label: "Requires review" },
];

function formatCurrency(value: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function readable(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function statusClass(value: string) {
  if (value === "PAID" || value === "SUCCESS") return "bg-[#E7F7EF] text-[#287A4B]";
  if (value === "FAILED" || value === "REVERSED") return "bg-[#FCE8E6] text-[#B42318]";
  if (value === "REQUIRES_REVIEW") return "bg-[#FFF0D9] text-[#9F5A18]";
  return "bg-[#EAF1FF] text-[#315DA8]";
}

function CountCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Wallet }) {
  return <div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs text-[#766C63]">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#2E241F]">{value.toLocaleString("en-NG")}</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><Icon className="h-5 w-5" /></span></div></div>;
}

export default function AdminSettlementsPage() {
  const pathname = usePathname();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [counts, setCounts] = useState<Record<SettlementStatus, number>>({
    AWAITING_PAYOUT_ACCOUNT: 0, READY: 0, PAYOUT_PENDING: 0, PAID: 0, FAILED: 0, REQUIRES_REVIEW: 0,
  });
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | SettlementStatus>("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setQuery(queryInput.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  const load = useCallback(async (signal: AbortSignal) => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (query) params.set("q", query);
    if (status !== "ALL") params.set("status", status);
    const response = await fetch(`/api/admin/settlements?${params.toString()}`, { cache: "no-store", signal });
    const value: unknown = await response.json().catch(() => null);
    const payload = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to load seller settlements.");
    if (!Array.isArray(payload.settlements) || typeof payload.pagination !== "object" || payload.pagination === null) {
      throw new Error("The seller settlements response was invalid.");
    }
    const data = payload as unknown as ApiResponse;
    setSettlements(data.settlements);
    setCounts(data.statusCounts ?? { AWAITING_PAYOUT_ACCOUNT: 0, READY: 0, PAYOUT_PENDING: 0, PAID: 0, FAILED: 0, REQUIRES_REVIEW: 0 });
    setTotal(data.pagination.total);
    setTotalPages(data.pagination.totalPages);
    if (data.pagination.totalPages > 0 && page > data.pagination.totalPages) setPage(data.pagination.totalPages);
  }, [page, query, status]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function run() {
      setLoading(true); setError("");
      try { await load(controller.signal); }
      catch (reason) {
        if (controller.signal.aborted) return;
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Unable to load seller settlements.");
          setSettlements([]); setTotal(0); setTotalPages(0);
        }
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    }
    void run();
    return () => { cancelled = true; controller.abort(); };
  }, [load, reloadKey]);

  const pendingCount = counts.AWAITING_PAYOUT_ACCOUNT + counts.READY + counts.PAYOUT_PENDING;
  const reviewCount = counts.REQUIRES_REVIEW + counts.FAILED;

  const navItems = [
    { label: "Overview", href: "/admin", icon: Activity },
    { label: "Businesses", href: "/admin/businesses", icon: Store },
    { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
    { label: "Settlements", href: "/admin/settlements", icon: Wallet },
  ];

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#FAF6EF] text-[#2E241F]">
      <div className="flex min-h-dvh w-full">
        <aside className="hidden w-64 shrink-0 border-r border-[#E8DED3] bg-[#FFFDFC] lg:block"><div className="sticky top-0 flex h-dvh flex-col"><div className="border-b border-[#E8DED3] px-6 py-6"><Link href="/admin" className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#9F2D18] text-sm font-bold text-white">R</div><div><p className="font-semibold">ReMarket</p><p className="text-xs text-[#8B8178]">Admin</p></div></Link></div><nav className="flex-1 space-y-1 px-4 py-6"><p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9A9087]">Marketplace operations</p>{navItems.map((item) => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB]"}`}><Icon className="h-4 w-4" />{item.label}</Link>; })}</nav><div className="border-t border-[#E8DED3] px-6 py-4"><p className="text-xs text-[#9A9087]">Founder access</p><p className="mt-1 text-sm font-medium text-[#4B4038]">Marketplace operations</p></div></div></aside>

        <main className="min-w-0 flex-1"><div className="mx-auto w-full max-w-7xl px-3 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/admin/orders" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8B8178] hover:text-[#9F2D18]"><ArrowLeft className="h-3.5 w-3.5" />Admin orders</Link><p className="text-sm font-medium text-[#9F2D18]">Marketplace finance operations</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Seller settlements</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#766C63]">Read-only monitoring of seller proceeds, ReMarket commission and Paystack transfer results.</p></div><button type="button" onClick={() => { setRefreshing(true); setReloadKey((value) => value + 1); }} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl border border-[#E8DED3] bg-white px-4 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:opacity-60 sm:self-auto"><RefreshCw className={`h-4 w-4 ${refreshing || loading ? "animate-spin" : ""}`} />Refresh</button></div>

          <div className="mb-5 rounded-2xl border border-[#F1D1C9] bg-[#FFF7F3] p-4"><div className="flex items-start gap-3"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" /><div><p className="text-sm font-semibold text-[#7C2C1A]">Automatic settlement controls</p><p className="mt-1 text-xs leading-5 text-[#8B5A4C]">A seller settlement is created after the buyer confirms delivery for that seller order. The 5% commission is deducted from product sales, not charged to the buyer. Paystack must confirm a transfer before a settlement is marked paid. This page does not provide a manual payout override.</p></div></div></div>

          <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4"><CountCard label="All settlements" value={Object.values(counts).reduce((sum, value) => sum + value, 0)} icon={Wallet} /><CountCard label="Awaiting account / ready / pending" value={pendingCount} icon={CreditCard} /><CountCard label="Paid" value={counts.PAID} icon={ShoppingBag} /><CountCard label="Failed / review" value={reviewCount} icon={Activity} /></section>

          <section className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-base font-semibold">Settlement directory</h2><p className="mt-1 text-xs text-[#8B8178]">Search by seller, seller order, parent order or transfer reference.</p></div><label className="relative min-w-[220px] flex-1 xl:w-80 xl:flex-none"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9087]" /><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search seller or order..." className="h-10 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] pl-9 pr-3 text-sm outline-none placeholder:text-[#A0968E] focus:border-[#FF8A70]" /></label></div>
            <div className="mt-4 flex flex-col gap-2 border-b border-[#F0E9E2] pb-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex items-center gap-2 text-xs text-[#766C63]"><span className="font-semibold">Status</span><select value={status} onChange={(event) => { setStatus(event.target.value as "ALL" | SettlementStatus); setPage(1); }} className="h-9 rounded-lg border border-[#E8DED3] bg-white px-3 text-xs outline-none focus:border-[#FF8A70]">{STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><p className="text-xs text-[#8B8178]">{total.toLocaleString("en-NG")} matching settlements</p></div>
            {error && <div role="alert" className="mt-4 rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] p-3 text-sm text-[#B42318]">{error}</div>}
            {loading ? <div className="mt-4 space-y-3">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-[#F7F1EB]" />)}</div> : error ? null : settlements.length === 0 ? <div className="py-14 text-center"><Wallet className="mx-auto h-8 w-8 text-[#A0968E]" /><p className="mt-3 text-sm font-semibold">No settlements found</p><p className="mt-1 text-xs text-[#8B8178]">Settlements appear after buyers confirm delivery of seller orders.</p></div> : <div className="mt-4 space-y-3">{settlements.map((item) => <article key={item.id} className="rounded-xl border border-[#E8DED3] bg-[#FFFEFC] p-4 sm:p-5"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><p className="break-all text-xs font-semibold text-[#9F2D18]">{item.sellerOrder.sellerOrderCode}</p><p className="mt-1 text-sm font-semibold text-[#2E241F]">{item.seller.name || item.seller.email || "Seller account"}</p><p className="mt-1 text-xs text-[#766C63]">{item.sellerOrder.business.name} · Parent order {item.sellerOrder.order.orderCode}</p><p className="mt-1 text-[11px] text-[#8B8178]">Buyer confirmed delivery: {formatDate(item.deliveryConfirmedAt)}</p></div><span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(item.status)}`}>{readable(item.status)}</span></div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#F0E9E2] pt-3 sm:grid-cols-4"><div><p className="text-[10px] text-[#8B8178]">Product sales</p><p className="mt-1 text-sm font-semibold">{formatCurrency(item.grossSalesAmount, item.currency)}</p></div><div><p className="text-[10px] text-[#8B8178]">ReMarket commission ({(item.commissionRateBps / 100).toFixed(2)}%)</p><p className="mt-1 text-sm font-semibold text-[#B42318]">−{formatCurrency(item.commissionAmount, item.currency)}</p></div><div><p className="text-[10px] text-[#8B8178]">Adjustments</p><p className="mt-1 text-sm font-semibold">{formatCurrency(item.adjustmentAmount, item.currency)}</p></div><div><p className="text-[10px] text-[#8B8178]">Seller proceeds</p><p className="mt-1 text-sm font-semibold text-[#287A4B]">{formatCurrency(item.netPayoutAmount, item.currency)}</p></div></div>
                <div className="mt-3 rounded-xl bg-[#F7F1EB] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-[#4B4038]">Paystack payout</p>{item.payout ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(item.payout.status)}`}>{readable(item.payout.status)}</span> : <span className="rounded-full bg-[#F0ECE7] px-2.5 py-1 text-[10px] font-semibold text-[#6F675F]">Not created</span>}</div>{item.payout ? <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><p className="text-[#6F675F]">Bank: <span className="font-semibold text-[#2E241F]">{item.payout.payoutAccount.bankName} · •••• {item.payout.payoutAccount.accountNumberLast4}</span></p><p className="break-all text-[#6F675F]">Transfer reference: <span className="font-medium text-[#2E241F]">{item.payout.reference}</span></p><p className="text-[#6F675F]">Attempts: <span className="font-semibold text-[#2E241F]">{item.payout.attemptCount}</span></p><p className="text-[#6F675F]">Paid at: <span className="font-semibold text-[#2E241F]">{formatDate(item.payout.paidAt)}</span></p></div> : <p className="mt-2 text-xs leading-5 text-[#6F675F]">The seller has not saved a verified payout account, or a payout record has not yet been created.</p>}{(item.failureReason || item.payout?.failureReason) && <p className="mt-2 rounded-lg bg-[#FFF4F2] p-2.5 text-xs leading-5 text-[#B42318]">{item.failureReason || item.payout?.failureReason}</p>}</div>
                {item.payout?.attempts?.length ? <details className="mt-3 rounded-xl border border-[#E8DED3] p-3"><summary className="cursor-pointer text-xs font-semibold text-[#6F675F]">Transfer attempt history ({item.payout.attempts.length})</summary><div className="mt-3 space-y-2">{item.payout.attempts.map((attempt) => <div key={`${attempt.attemptNumber}-${attempt.reference}`} className="flex flex-col gap-1 border-t border-[#F0E9E2] pt-2 text-xs sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-[#4B4038]">Attempt {attempt.attemptNumber} · {readable(attempt.status)}</p><p className="mt-1 break-all text-[10px] text-[#8B8178]">{attempt.reference}</p>{attempt.failureReason && <p className="mt-1 text-[11px] text-[#B42318]">{attempt.failureReason}</p>}</div><p className="text-[10px] text-[#8B8178]">{formatDate(attempt.paidAt || attempt.submittedAt)}</p></div>)}</div></details> : null}
              </article>)}</div>}
            {!loading && !error && totalPages > 1 && <div className="mt-5 flex items-center justify-between border-t border-[#F0E9E2] pt-4"><p className="text-xs text-[#8B8178]">Page {page} of {totalPages} · Showing {settlements.length} of {total}</p><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></div>}
          </section>
        </div></main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E8DED3] bg-[#FFFDFC]/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(46,36,31,0.08)] backdrop-blur lg:hidden" aria-label="Mobile Admin navigation"><div className="mx-auto grid w-full max-w-xl grid-cols-4 gap-1">{navItems.map((item) => { const Icon = item.icon; const active = pathname === item.href; return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[10px] font-semibold ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F]"}`}><Icon className="h-4 w-4" /><span>{item.label}</span></Link>; })}</div></nav>
    </div>
  );
}
