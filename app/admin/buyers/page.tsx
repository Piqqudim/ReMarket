"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, ArrowRight, ChartNoAxesCombined, ChevronLeft, ChevronRight,
  CreditCard, History, LayoutDashboard, LogOut, Package, RefreshCw,
  Search, ShoppingCart, Store, Tags, Trash2, Truck, UserRound, Users, Wallet,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

type BuyerStatus = "ACTIVE" | "SUSPENDED";
type Buyer = {
  id: string;
  name: string | null;
  email: string;
  role: "BUYER";
  accountStatus: BuyerStatus;
  suspendedAt: string | null;
  createdAt: string;
  orderCount: number;
};
type BuyersResponse = {
  success: boolean;
  buyers: Buyer[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  counts: { total: number; active: number; suspended: number };
  filters: { q: string; status: "ALL" | BuyerStatus };
  generatedAt: string;
};

const PAGE_SIZE = 25;
const NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, available: true },
  { label: "Businesses", href: "/admin/businesses", icon: Store, available: true },
  { label: "Buyers", href: "/admin/buyers", icon: Users, available: true },
  { label: "Products", href: "/admin/products", icon: Package, available: true },
  { label: "Categories", href: "/admin/categories", icon: Tags, available: true },
  { label: "Orders", href: "/admin/orders", icon: ShoppingCart, available: true },
  { label: "Delivery", href: "/admin/delivery", icon: Truck, available: false },
  { label: "Payments", href: "/admin/payments", icon: CreditCard, available: false },
  { label: "Finance", href: "/admin/finance", icon: Wallet, available: false },
  { label: "Analytics", href: "/admin/analytics", icon: ChartNoAxesCombined, available: false },
  { label: "Audit logs", href: "/admin/audit-logs", icon: History, available: true },
  { label: "Announcements", href: "/admin/announcements", icon: Activity, available: true },
  { label: "Deletion requests", href: "/admin/business-deletion-requests", icon: Trash2, available: true },
];
const MOBILE_NAV = NAV.filter(({ label, available }) => available && ["Overview", "Businesses", "Buyers", "Products", "Orders"].includes(label));
const NO_STORE: RequestCache = "no-store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusClass(status: BuyerStatus): string {
  return status === "ACTIVE" ? "bg-[#E7F7EF] text-[#287A4B]" : "bg-[#FCE8E6] text-[#B42318]";
}

export default function AdminBuyersPage() {
  const pathname = usePathname();
  const [data, setData] = useState<BuyersResponse | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | BuyerStatus>("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadBuyers() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status });
        if (appliedQuery) params.set("q", appliedQuery);
        const response = await fetch(`/api/admin/buyers?${params.toString()}`, { cache: NO_STORE, signal: controller.signal });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = isRecord(result) && typeof result.error === "string" ? result.error : "Unable to load buyers.";
          throw new Error(message);
        }
        if (!isRecord(result) || !Array.isArray(result.buyers) || !isRecord(result.pagination) || !isRecord(result.counts)) {
          throw new Error("The buyers response was incomplete.");
        }
        const pagination = result.pagination;
        if (typeof pagination.page !== "number" || typeof pagination.total !== "number" || typeof pagination.totalPages !== "number") {
          throw new Error("The buyers pagination data was invalid.");
        }
        if (!cancelled) {
          setData(result as unknown as BuyersResponse);
          if (pagination.totalPages > 0 && page > pagination.totalPages) setPage(pagination.totalPages);
          else if (pagination.totalPages === 0 && page !== 1) setPage(1);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Admin buyers loading error:", loadError);
        if (!cancelled) {
          setData(null);
          setError(loadError instanceof Error ? loadError.message : "Unable to load buyers.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBuyers();
    return () => { cancelled = true; controller.abort(); };
  }, [page, appliedQuery, status, reloadKey]);

  async function handleLogout() {
    try {
      await signOut({ callbackUrl: "/admin/login" });
    } catch (logoutError) {
      console.error("Admin logout error:", logoutError);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  }

  function clearFilters() {
    setQuery("");
    setAppliedQuery("");
    setStatus("ALL");
    setPage(1);
  }

  const buyers = data?.buyers ?? [];
  const pagination = data?.pagination;
  const counts = data?.counts;
  const total = pagination?.total ?? 0;
  const start = total === 0 ? 0 : ((pagination?.page ?? page) - 1) * PAGE_SIZE + 1;
  const end = Math.min((pagination?.page ?? page) * PAGE_SIZE, total);
  const ordersOnPage = useMemo(() => buyers.reduce((sum, buyer) => sum + (Number.isFinite(buyer.orderCount) ? buyer.orderCount : 0), 0), [buyers]);

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#FAF6EF] text-[#2E241F]">
      <div className="flex min-h-dvh w-full">
        <aside className="hidden w-64 shrink-0 border-r border-[#E8DED3] bg-[#FFFDFC] lg:block">
          <div className="sticky top-0 flex h-dvh flex-col">
            <div className="border-b border-[#E8DED3] px-6 py-6">
              <Link href="/admin" className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#9F2D18] text-sm font-bold text-white">R</span>
                <span><span className="block font-semibold">ReMarket</span><span className="block text-xs text-[#8B8178]">Founder Admin</span></span>
              </Link>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6" aria-label="Admin navigation">
              {NAV.map(({ label, href, icon: Icon, available }) => {
                const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                if (!available) return <div key={href} className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#B5AAA1]" aria-disabled="true" title="This Admin module will be implemented in a later step."><Icon className="h-4 w-4" /><span className="flex-1">{label}</span><span className="rounded-full bg-[#F4EFEA] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#9A9087]">Soon</span></div>;
                return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB]"}`}><Icon className="h-4 w-4" /><span>{label}</span></Link>;
              })}
            </nav>
            <div className="border-t border-[#E8DED3] px-4 py-4">
              <p className="mb-3 px-2 text-xs text-[#8B8178]">Founder access</p>
              <button type="button" onClick={() => void handleLogout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#9F2D18] hover:bg-[#FFF0E8]"><LogOut className="h-4 w-4" />Log out</button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-3 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:py-8 lg:pb-8">
            <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-[#9F2D18]">Marketplace operations / Buyers</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Buyers</h1>
                <p className="mt-2 text-sm text-[#766C63]">Search buyer accounts, check account status and review ReMarket order activity.</p>
              </div>
              <div className="flex items-center justify-end gap-2"><NotificationBell /><button type="button" onClick={() => void handleLogout()} className="inline-flex items-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-3 py-2 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18]"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Log out</span></button></div>
            </header>

            <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: "Registered buyers", value: counts?.total, icon: Users, description: "All buyer accounts" },
                { label: "Active buyers", value: counts?.active, icon: UserRound, description: "Accounts currently active" },
                { label: "Suspended buyers", value: counts?.suspended, icon: Users, description: "Accounts currently restricted" },
                { label: "Orders on this page", value: ordersOnPage, icon: ShoppingCart, description: "Combined buyer order count" },
              ].map(({ label, value, icon: Icon, description }) => (
                <div key={label} className="rounded-2xl border border-[#E8DED3] bg-white p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-medium text-[#6F675F] sm:text-sm">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{loading && !data ? "—" : (value ?? 0).toLocaleString("en-NG")}</p></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><Icon className="h-5 w-5" /></span></div>
                  <p className="mt-2 text-[11px] text-[#8B8178]">{description}</p>
                </div>
              ))}
            </section>

            <section className="overflow-hidden rounded-2xl border border-[#E8DED3] bg-white">
              <div className="flex flex-col gap-3 border-b border-[#E8DED3] p-4 sm:p-5">
                <div><h2 className="font-semibold">Buyer directory</h2><p className="mt-1 text-xs text-[#8B8178]">Search by buyer name or email and filter by account status.</p></div>
                <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative min-w-0 flex-1"><span className="sr-only">Search buyers</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9087]" /><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="Search name or email" className="h-10 w-full rounded-xl border border-[#E8DED3] bg-[#FFFEFC] pl-9 pr-3 text-sm outline-none transition placeholder:text-[#A69B91] focus:border-[#D58A75] focus:ring-2 focus:ring-[#FFF0E8]" /></label>
                  <label className="sm:w-44"><span className="sr-only">Filter by account status</span><select value={status} onChange={(event) => { setStatus(event.target.value as "ALL" | BuyerStatus); setPage(1); }} className="h-10 w-full rounded-xl border border-[#E8DED3] bg-[#FFFEFC] px-3 text-sm text-[#4B4038] outline-none focus:border-[#D58A75] focus:ring-2 focus:ring-[#FFF0E8]"><option value="ALL">All accounts</option><option value="ACTIVE">Active only</option><option value="SUSPENDED">Suspended only</option></select></label>
                  <button type="submit" disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#9F2D18] px-4 text-xs font-semibold text-white transition hover:bg-[#862512] disabled:cursor-not-allowed disabled:opacity-60"><Search className="h-3.5 w-3.5" />Search</button>
                  <button type="button" onClick={clearFilters} disabled={loading && !appliedQuery && status === "ALL"} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E8DED3] px-4 text-xs font-semibold text-[#6F675F] hover:bg-[#F7F1EB] disabled:opacity-50">Clear</button>
                  <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading} aria-label="Refresh buyers" title="Refresh" className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E8DED3] px-3 text-[#6F675F] hover:bg-[#F7F1EB] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
                </form>
              </div>

              {error && <div className="m-4 rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] p-4 sm:m-5"><p className="text-sm font-semibold text-[#B42318]">Unable to load buyers</p><p className="mt-1 text-xs text-[#8B8178]">{error}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#9F2D18] hover:underline"><RefreshCw className="h-3.5 w-3.5" />Try again</button></div>}

              {loading ? (
                <div className="space-y-3 p-4 sm:p-5" aria-label="Loading buyers">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[76px] animate-pulse rounded-xl bg-[#F7F1EB]" />)}</div>
              ) : !error && buyers.length === 0 ? (
                <div className="px-5 py-14 text-center"><UserRound className="mx-auto h-9 w-9 text-[#B8AEA5]" /><p className="mt-3 text-sm font-semibold text-[#6F675F]">{appliedQuery || status !== "ALL" ? "No matching buyers" : "No buyers registered yet"}</p><p className="mt-1 text-xs text-[#8B8178]">{appliedQuery || status !== "ALL" ? "Try changing your search or account-status filter." : "Buyer accounts will appear here when people register."}</p></div>
              ) : !error ? (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="bg-[#FAF6EF] text-xs text-[#766C63]"><tr><th className="px-5 py-3 font-semibold">Buyer</th><th className="px-5 py-3 font-semibold">Email</th><th className="px-5 py-3 font-semibold">Account status</th><th className="px-5 py-3 font-semibold">Orders</th><th className="px-5 py-3 font-semibold">Registered</th><th className="px-5 py-3 text-right font-semibold">Profile</th></tr></thead>
                      <tbody className="divide-y divide-[#F0EAE4]">{buyers.map((buyer) => <tr key={buyer.id} className="hover:bg-[#FFFCF9]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><UserRound className="h-4 w-4" /></span><div className="min-w-0"><p className="font-semibold text-[#2E241F]">{buyer.name || "Name not provided"}</p><p className="mt-1 max-w-52 truncate font-mono text-[10px] text-[#9A9087]" title={buyer.id}>{buyer.id}</p></div></div></td><td className="px-5 py-4 text-[#6F675F]">{buyer.email}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(buyer.accountStatus)}`}>{buyer.accountStatus}</span>{buyer.suspendedAt && <p className="mt-1 text-[10px] text-[#8B8178]">Since {formatDate(buyer.suspendedAt)}</p>}</td><td className="px-5 py-4 tabular-nums">{buyer.orderCount.toLocaleString("en-NG")}</td><td className="whitespace-nowrap px-5 py-4 text-xs text-[#766C63]">{formatDate(buyer.createdAt)}</td><td className="px-5 py-4 text-right"><Link href={`/admin/buyers/${encodeURIComponent(buyer.id)}`} className="inline-flex items-center gap-1 rounded-lg bg-[#FFF0E8] px-3 py-2 text-xs font-semibold text-[#9F2D18] hover:bg-[#FFE3D7]">View <ArrowRight className="h-3.5 w-3.5" /></Link></td></tr>)}</tbody>
                    </table>
                  </div>
                  <div className="divide-y divide-[#F0EAE4] md:hidden">{buyers.map((buyer) => <article key={buyer.id} className="p-4"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><UserRound className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-semibold">{buyer.name || "Name not provided"}</p><span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ${statusClass(buyer.accountStatus)}`}>{buyer.accountStatus}</span></div><p className="mt-1 break-all text-xs text-[#766C63]">{buyer.email}</p></div></div><div className="mt-3 flex items-center justify-between gap-3"><div className="text-xs text-[#8B8178]"><p>{buyer.orderCount.toLocaleString("en-NG")} {buyer.orderCount === 1 ? "order" : "orders"}</p><p className="mt-1">Joined {formatDate(buyer.createdAt)}</p>{buyer.suspendedAt && <p className="mt-1 text-[#B42318]">Suspended {formatDate(buyer.suspendedAt)}</p>}</div><Link href={`/admin/buyers/${encodeURIComponent(buyer.id)}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#FFF0E8] px-3 py-2 text-xs font-semibold text-[#9F2D18]">Profile <ArrowRight className="h-3.5 w-3.5" /></Link></div></article>)}</div>
                  <div className="flex flex-col gap-3 border-t border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-xs text-[#8B8178]" aria-live="polite">Showing {start}–{end} of {total.toLocaleString("en-NG")} buyers</p><div className="flex items-center justify-between gap-2 sm:justify-end"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={!pagination?.hasPreviousPage || loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#6F675F]">Page {pagination?.page ?? 1} of {Math.max(1, pagination?.totalPages ?? 0)}</span><button type="button" onClick={() => setPage((value) => value + 1)} disabled={!pagination?.hasNextPage || loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></div>
                </>
              ) : null}
            </section>
            <p className="mt-4 text-xs text-[#9A9087]">Buyer information is shown for marketplace administration. Account restrictions are managed from each buyer&apos;s profile.</p>
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E8DED3] bg-[#FFFDFC]/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(46,36,31,0.08)] backdrop-blur lg:hidden" aria-label="Mobile Admin navigation">
        <div className="mx-auto grid w-full max-w-xl grid-cols-5 gap-1">{MOBILE_NAV.map(({ label, href, icon: Icon }) => { const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[10px] font-semibold transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB]"}`}><Icon className="h-4 w-4 shrink-0" /><span className="leading-tight">{label}</span></Link>; })}</div>
      </nav>
    </div>
  );
}
