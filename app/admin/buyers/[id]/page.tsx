"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { signOut } from "@/lib/client-auth";
import { useEffect, useState } from "react";
import {
  Activity, ArrowLeft, BadgeCheck, Building2, ChartNoAxesCombined,
  ChevronLeft, ChevronRight, CreditCard, History, LayoutDashboard, LogOut,
  Package, RefreshCw, ShoppingCart, Store, Tags, Trash2, Truck, UserRound,
  Users, Wallet, ShieldAlert, ShieldCheck, X,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

type Buyer = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  accountStatus: "ACTIVE" | "SUSPENDED";
  suspendedAt: string | null;
};

type BuyerOrder = {
  id: string;
  orderCode: string;
  status: string;
  itemsSubtotal: number;
  deliveryFee: number;
  deliveryFeeStatus: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  sellerOrderCount: number;
};

type BuyerResponse = {
  success: boolean;
  buyer: Buyer;
  orders: BuyerOrder[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  generatedAt: string;
};

const PAGE_SIZE = 10;
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
const MOBILE_NAV = NAV.filter(({ label, available }) =>
  available && ["Overview", "Businesses", "Buyers", "Products", "Orders"].includes(label),
);
const noStore = { cache: "no-store" as RequestCache };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function formatMoney(value: number, currency = "NGN"): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Amount unavailable";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-NG")}`;
  }
}

function displayStatus(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(status: string): string {
  if (["COMPLETED", "DELIVERED"].includes(status)) return "bg-[#E7F7EF] text-[#287A4B]";
  if (["CANCELLED", "PARTIALLY_CANCELLED", "REJECTED"].includes(status)) return "bg-[#FCE8E6] text-[#B42318]";
  if (["PLACED", "PENDING_ACCEPTANCE", "PARTIALLY_ACCEPTED"].includes(status)) return "bg-[#FFF0D9] text-[#9F5A18]";
  return "bg-[#EAF1FA] text-[#355C88]";
}

export default function AdminBuyerProfilePage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const buyerId = typeof params?.id === "string" ? params.id : "";
  const [data, setData] = useState<BuyerResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [accountAction, setAccountAction] = useState<"ACTIVE" | "SUSPENDED" | null>(null);
  const [accountReason, setAccountReason] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountNotice, setAccountNotice] = useState("");

  useEffect(() => {
    if (!buyerId) return;
    const controller = new AbortController();
    let cancelled = false;

    async function loadBuyer() {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        const response = await fetch(`/api/admin/buyers/${encodeURIComponent(buyerId)}?${query}`, {
          ...noStore, signal: controller.signal,
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = isRecord(result) && typeof result.error === "string"
            ? result.error : "Unable to load buyer details.";
          throw new Error(message);
        }
        if (!isRecord(result) || !isRecord(result.buyer) || !Array.isArray(result.orders) || !isRecord(result.pagination)) {
          throw new Error("The buyer profile response was incomplete.");
        }
        if (!cancelled) setData(result as unknown as BuyerResponse);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Admin buyer profile loading error:", loadError);
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load buyer details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadBuyer();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [buyerId, page, reloadKey]);

  async function handleLogout() {
    try {
      await signOut({ callbackUrl: "/admin/login" });
    } catch (logoutError) {
      console.error("Admin logout error:", logoutError);
    }
  }

  async function submitAccountAction() {
    if (!buyerId || !accountAction) return;
    const reason = accountReason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setAccountError("Enter a reason between 10 and 500 characters.");
      return;
    }

    setAccountSaving(true);
    setAccountError("");
    setAccountNotice("");
    try {
      const response = await fetch(`/api/admin/buyers/${encodeURIComponent(buyerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ accountStatus: accountAction, reason }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = isRecord(result) && typeof result.error === "string"
          ? result.error : "Unable to update this buyer account.";
        throw new Error(message);
      }
      if (!isRecord(result) || !isRecord(result.buyer)) {
        throw new Error("The account update response was invalid.");
      }
      const updatedBuyer = result.buyer as unknown as Buyer;
      setData((current) => current ? { ...current, buyer: updatedBuyer } : current);
      setAccountNotice(accountAction === "SUSPENDED"
        ? "Buyer account suspended successfully. The action has been recorded in Audit Logs."
        : "Buyer account restored successfully. The action has been recorded in Audit Logs.");
      setAccountAction(null);
      setAccountReason("");
    } catch (actionError) {
      setAccountError(actionError instanceof Error ? actionError.message : "Unable to update this buyer account.");
    } finally {
      setAccountSaving(false);
    }
  }

  const buyer = data?.buyer;
  const pagination = data?.pagination;

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
                <Link href="/admin" className="inline-flex items-center gap-2 text-xs font-semibold text-[#9F2D18] hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Back to Admin</Link>
                <p className="mt-4 text-sm font-medium text-[#9F2D18]">Marketplace operations / Buyers</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Buyer profile</h1>
                <p className="mt-2 text-sm text-[#766C63]">View account details and the buyer’s ReMarket order history.</p>
              </div>
              <div className="flex items-center justify-end gap-2">
                <NotificationBell />
                <button type="button" onClick={() => void handleLogout()} className="inline-flex items-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-3 py-2 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18]"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Log out</span></button>
              </div>
            </header>

            {error && <div className="mb-6 rounded-2xl border border-[#F1C5BF] bg-[#FFF4F2] px-5 py-4"><p className="text-sm font-medium text-[#B42318]">{error}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#9F2D18] hover:underline"><RefreshCw className="h-3.5 w-3.5" />Try again</button></div>}

            {loading ? (
              <div className="space-y-5" aria-label="Loading buyer profile">
                <div className="h-40 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" />
                <div className="h-24 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" />
                <div className="h-80 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" />
              </div>
            ) : buyer ? (
              <>
                <section className="rounded-2xl border border-[#E8DED3] bg-white p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]"><UserRound className="h-7 w-7" /></div>
                      <div className="min-w-0">
                        <h2 className="break-words text-xl font-semibold text-[#2E241F]">{buyer.name || "Name not provided"}</h2>
                        <p className="mt-1 break-all text-sm text-[#766C63]">{buyer.email}</p>
                        <p className="mt-2 text-xs text-[#9A9087]">Buyer ID: <span className="font-mono">{buyer.id}</span></p>
                      </div>
                    </div>
                    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${buyer.accountStatus === "SUSPENDED" ? "bg-[#FCE8E6] text-[#B42318]" : "bg-[#E7F7EF] text-[#287A4B]"}`}>
                      {buyer.accountStatus === "SUSPENDED" ? <ShieldAlert className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                      {buyer.accountStatus === "SUSPENDED" ? "Suspended" : "Active account"}
                    </span>
                  </div>
                  <div className="mt-6 grid gap-4 border-t border-[#F0EAE4] pt-5 sm:grid-cols-2">
                    <div><p className="text-xs text-[#8B8178]">Registered</p><p className="mt-1 text-sm font-semibold">{formatDateTime(buyer.createdAt)}</p></div>
                    <div><p className="text-xs text-[#8B8178]">Account status</p><p className={`mt-1 text-sm font-semibold ${buyer.accountStatus === "SUSPENDED" ? "text-[#B42318]" : "text-[#287A4B]"}`}>{buyer.accountStatus === "SUSPENDED" ? "Suspended" : "Active"}</p></div>
                    {buyer.suspendedAt && <div><p className="text-xs text-[#8B8178]">Suspended on</p><p className="mt-1 text-sm font-semibold">{formatDateTime(buyer.suspendedAt)}</p></div>}
                  </div>
                  <div className="mt-5 flex flex-col gap-3 border-t border-[#F0EAE4] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="max-w-xl"><p className="text-sm font-semibold">Account controls</p><p className="mt-1 text-xs leading-5 text-[#8B8178]">Suspension prevents the buyer from signing in. Every status change requires a reason and is recorded in Admin Audit Logs.</p></div>
                    <button type="button" onClick={() => { setAccountAction(buyer.accountStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"); setAccountReason(""); setAccountError(""); }} className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition ${buyer.accountStatus === "SUSPENDED" ? "bg-[#FFF0E8] text-[#9F2D18] hover:bg-[#FFE3D7]" : "border border-[#F1C5BF] bg-white text-[#B42318] hover:bg-[#FFF4F2]"}`}>
                      {buyer.accountStatus === "SUSPENDED" ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                      {buyer.accountStatus === "SUSPENDED" ? "Restore buyer" : "Suspend buyer"}
                    </button>
                  </div>
                </section>
                {accountNotice && <div className="mt-4 rounded-xl border border-[#CDE8D7] bg-[#F2FBF5] px-4 py-3 text-sm text-[#287A4B]" role="status">{accountNotice}</div>}

                <section className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#E8DED3] bg-white p-5">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-[#6F675F]">Total orders</p><p className="mt-2 text-3xl font-semibold tabular-nums">{(pagination?.total ?? 0).toLocaleString("en-NG")}</p></div><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><ShoppingCart className="h-5 w-5" /></div></div>
                    <p className="mt-2 text-xs text-[#8B8178]">All checkout orders placed by this buyer.</p>
                  </div>
                  <div className="rounded-2xl border border-[#E8DED3] bg-white p-5">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-[#6F675F]">Orders on this page</p><p className="mt-2 text-3xl font-semibold tabular-nums">{data?.orders.length ?? 0}</p></div><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F7F1EB] text-[#6F675F]"><Package className="h-5 w-5" /></div></div>
                    <p className="mt-2 text-xs text-[#8B8178]">Showing the latest {PAGE_SIZE} records per page.</p>
                  </div>
                </section>

                <section className="mt-8">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div><h2 className="text-lg font-semibold">Order history</h2><p className="mt-1 text-sm text-[#766C63]">The buyer’s checkout records, newest first.</p></div>
                    <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading} className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-xl border border-[#E8DED3] bg-white px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:opacity-50 sm:self-auto"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-[#E8DED3] bg-white">
                    {!data?.orders.length ? (
                      <div className="px-5 py-12 text-center"><ShoppingCart className="mx-auto h-8 w-8 text-[#B8AEA5]" /><p className="mt-3 text-sm font-semibold text-[#6F675F]">No orders yet</p><p className="mt-1 text-xs text-[#8B8178]">Orders placed by this buyer will appear here.</p></div>
                    ) : (
                      <>
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full min-w-[760px] text-left text-sm">
                            <thead className="bg-[#FAF6EF] text-xs text-[#766C63]"><tr><th className="px-5 py-3 font-semibold">Order</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Seller orders</th><th className="px-5 py-3 font-semibold">Subtotal</th><th className="px-5 py-3 font-semibold">Delivery</th><th className="px-5 py-3 font-semibold">Total</th><th className="px-5 py-3 font-semibold">Placed</th></tr></thead>
                            <tbody className="divide-y divide-[#F0EAE4]">
                              {data.orders.map((order) => <tr key={order.id} className="align-top hover:bg-[#FFFCF9]"><td className="px-5 py-4"><p className="font-semibold text-[#2E241F]">{order.orderCode}</p><p className="mt-1 text-[11px] text-[#9A9087]">{order.id}</p></td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(order.status)}`}>{displayStatus(order.status)}</span></td><td className="px-5 py-4 tabular-nums">{order.sellerOrderCount}</td><td className="px-5 py-4 whitespace-nowrap">{formatMoney(order.itemsSubtotal, order.currency)}</td><td className="px-5 py-4 whitespace-nowrap"><p>{formatMoney(order.deliveryFee, order.currency)}</p><p className="mt-1 text-[10px] text-[#8B8178]">{displayStatus(order.deliveryFeeStatus)}</p></td><td className="px-5 py-4 whitespace-nowrap font-semibold">{formatMoney(order.totalAmount, order.currency)}</td><td className="px-5 py-4 whitespace-nowrap text-xs text-[#766C63]">{formatDateTime(order.createdAt)}</td></tr>)}
                            </tbody>
                          </table>
                        </div>
                        <div className="divide-y divide-[#E8DED3] md:hidden">
                          {data.orders.map((order) => <article key={order.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-sm font-semibold">{order.orderCode}</p><p className="mt-1 text-[11px] text-[#9A9087]">{formatDateTime(order.createdAt)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(order.status)}`}>{displayStatus(order.status)}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-[#8B8178]">Subtotal</p><p className="mt-1 font-semibold">{formatMoney(order.itemsSubtotal, order.currency)}</p></div><div><p className="text-[#8B8178]">Delivery</p><p className="mt-1 font-semibold">{formatMoney(order.deliveryFee, order.currency)}</p></div><div><p className="text-[#8B8178]">Seller orders</p><p className="mt-1 font-semibold">{order.sellerOrderCount}</p></div><div><p className="text-[#8B8178]">Order total</p><p className="mt-1 font-semibold">{formatMoney(order.totalAmount, order.currency)}</p></div></div><p className="mt-3 text-[11px] text-[#8B8178]">Delivery fee: {displayStatus(order.deliveryFeeStatus)}</p></article>)}
                        </div>
                      </>
                    )}
                    <div className="flex flex-col gap-3 border-t border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <p className="text-xs text-[#8B8178]">{pagination?.total ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, pagination.total)} of ${pagination.total} orders` : "0 orders"}</p>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={!pagination?.hasPreviousPage || loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] bg-white px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
                        <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#6F675F]">Page {pagination?.page ?? 1} of {Math.max(1, pagination?.totalPages ?? 0)}</span>
                        <button type="button" onClick={() => setPage((value) => value + 1)} disabled={!pagination?.hasNextPage || loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] bg-white px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="mt-6 rounded-2xl border border-[#E8DED3] bg-[#FFFDFC] px-5 py-4"><p className="text-xs text-[#8B8178]">Profile data refreshed</p><p className="mt-1 text-sm font-medium">{data?.generatedAt ? formatDateTime(data.generatedAt) : "Date unavailable"}</p></div>
              </>
            ) : !error ? (
              <div className="rounded-2xl border border-[#E8DED3] bg-white px-5 py-12 text-center"><Building2 className="mx-auto h-8 w-8 text-[#B8AEA5]" /><p className="mt-3 text-sm font-semibold">Buyer profile unavailable</p></div>
            ) : null}
          </div>
        </main>
      </div>

      {accountAction && buyer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2E241F]/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !accountSaving) setAccountAction(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="account-action-title" className="w-full max-w-lg rounded-2xl border border-[#E8DED3] bg-[#FFFDFC] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9F2D18]">Buyer account management</p>
                <h2 id="account-action-title" className="mt-1 text-xl font-semibold text-[#2E241F]">{accountAction === "SUSPENDED" ? "Suspend this buyer?" : "Restore this buyer?"}</h2>
                <p className="mt-2 text-sm leading-6 text-[#766C63]">{accountAction === "SUSPENDED" ? `This will prevent ${buyer.email} from signing in to ReMarket.` : `This will allow ${buyer.email} to sign in to ReMarket again.`}</p>
              </div>
              <button type="button" onClick={() => setAccountAction(null)} disabled={accountSaving} aria-label="Close" className="rounded-lg p-2 text-[#8B8178] hover:bg-[#F7F1EB] disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>
            <label htmlFor="account-action-reason" className="mt-5 block text-sm font-semibold text-[#2E241F]">Reason <span className="font-normal text-[#8B8178]">(10–500 characters)</span></label>
            <textarea id="account-action-reason" value={accountReason} onChange={(event) => setAccountReason(event.target.value)} maxLength={500} rows={4} placeholder={accountAction === "SUSPENDED" ? "Explain why this account is being suspended..." : "Explain why this account is being restored..."} className="mt-2 w-full resize-y rounded-xl border border-[#E8DED3] bg-white px-3 py-3 text-sm text-[#2E241F] outline-none transition placeholder:text-[#A79D94] focus:border-[#9F2D18] focus:ring-2 focus:ring-[#9F2D18]/10" />
            <div className="mt-1 flex items-center justify-between text-[11px] text-[#8B8178]"><span>The reason will be saved in the audit history.</span><span className="tabular-nums">{accountReason.trim().length}/500</span></div>
            {accountError && <p className="mt-3 rounded-lg border border-[#F1C5BF] bg-[#FFF4F2] px-3 py-2 text-xs text-[#B42318]" role="alert">{accountError}</p>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setAccountAction(null)} disabled={accountSaving} className="h-10 rounded-xl border border-[#E8DED3] bg-white px-4 text-xs font-semibold text-[#6F675F] hover:bg-[#F7F1EB] disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void submitAccountAction()} disabled={accountSaving || accountReason.trim().length < 10 || accountReason.trim().length > 500} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${accountAction === "SUSPENDED" ? "bg-[#B42318] hover:bg-[#921D14]" : "bg-[#9F2D18] hover:bg-[#842515]"}`}>
                {accountSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : accountAction === "SUSPENDED" ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {accountSaving ? "Saving..." : accountAction === "SUSPENDED" ? "Confirm suspension" : "Confirm restoration"}
              </button>
            </div>
          </section>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E8DED3] bg-[#FFFDFC]/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(46,36,31,0.08)] backdrop-blur lg:hidden" aria-label="Mobile Admin navigation">
        <div className="mx-auto grid w-full max-w-xl grid-cols-5 gap-1">
          {MOBILE_NAV.map(({ label, href, icon: Icon }) => {
            const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[10px] font-semibold ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB]"}`}><Icon className="h-4 w-4 shrink-0" /><span className="leading-tight">{label}</span></Link>;
          })}
        </div>
      </nav>
    </div>
  );
}
