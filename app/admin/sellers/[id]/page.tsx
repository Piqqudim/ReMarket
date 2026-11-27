"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { signOut } from "@/lib/client-auth";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, Building2, ChartNoAxesCombined,
  ChevronLeft, ChevronRight, CreditCard, ExternalLink, History, LayoutDashboard,
  LogOut, MapPin, Package, Phone, RefreshCw, ShoppingCart, Store, Tags,
  Trash2, Truck, UserRound, Users, Wallet, Image as ImageIcon, ShieldAlert, ShieldCheck, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

type SellerProduct = {
  id: string; name: string; description: string | null; price: number | null;
  priceMin: number | null; priceMax: number | null; availability: string;
  status: string; imageUrl: string | null; stockQuantity: number | null;
  deletedAt: string | null; createdAt: string; updatedAt: string;
  category: { id: string; name: string } | null;
  images: { id: string; url: string; sortOrder: number }[];
};
type SellerOrder = {
  id: string; sellerOrderCode: string; status: string; subtotal: number;
  sellerNote: string | null; createdAt: string; updatedAt: string;
  items: { productId: string | null; productName: string; unitPrice: number; quantity: number; lineTotal: number }[];
  order: {
    id: string; orderCode: string; status: string; totalAmount: number;
    currency: string; createdAt: string;
    buyer: { id: string; name: string | null; email: string };
  };
};
type SellerBusiness = {
  id: string; name: string; ownerName: string | null; description: string | null;
  phone: string | null; imageUrl: string | null; availability: string;
  status: string; verification: string; priceMin: number | null; priceMax: number | null;
  deletedAt: string | null; createdAt: string;
  location: { id: string; area: string; street: string | null; address: string | null; verification: string } | null;
  categories: { id: string; name: string }[];
  socialLinks: { platform: string; handle: string }[];
};
type Seller = {
  id: string; name: string | null; email: string; role: string;
  accountStatus: "ACTIVE" | "SUSPENDED"; suspendedAt: string | null;
  createdAt: string; business: SellerBusiness | null;
};
type SellerResponse = {
  success: boolean; seller: Seller;
  counts: { products: number; activeProducts: number; sellerOrders: number; completedSellerOrders: number };
  products: SellerProduct[];
  productPagination: { page: number; pageSize: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
  sellerOrders: SellerOrder[];
  orderPagination: { page: number; pageSize: number; total: number; totalPages: number; hasPreviousPage: boolean; hasNextPage: boolean };
  generatedAt: string;
};
type SellerAuditEntry = {
  id: string; action: string; entityType: string; entityId: string;
  reason: string | null; createdAt: string;
  admin: { id: string; name: string | null; email: string | null };
};

const PAGE_SIZE = 10;
const NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard, available: true },
  { label: "Businesses", href: "/admin/businesses", icon: Store, available: true },
  { label: "Buyers", href: "/admin/buyers", icon: Users, available: true },
  { label: "Sellers", href: "/admin/sellers", icon: UserRound, available: true },
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
const MOBILE_NAV = NAV.filter(({ label, available }) => available && ["Overview", "Businesses", "Buyers", "Sellers", "Products", "Orders"].includes(label));
const noStore = { cache: "no-store" as RequestCache };

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
function formatMoney(value: number, currency = "NGN"): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Amount unavailable";
  try { return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString("en-NG")}`; }
}
function displayStatus(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}
function statusClass(value: string): string {
  if (["ACTIVE", "VERIFIED", "AVAILABLE", "COMPLETED", "DELIVERED"].includes(value)) return "bg-[#E7F7EF] text-[#287A4B]";
  if (["SUSPENDED", "INACTIVE", "UNVERIFIED", "UNAVAILABLE", "CANCELLED", "REJECTED"].includes(value)) return "bg-[#FCE8E6] text-[#B42318]";
  if (["PENDING", "PENDING_ACCEPTANCE", "ASK_SELLER", "PLACED"].includes(value)) return "bg-[#FFF0D9] text-[#9F5A18]";
  return "bg-[#EAF1FA] text-[#355C88]";
}
function Badge({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(value)}`}>{displayStatus(value)}</span>;
}
function Stat({ label, value, icon: Icon, note }: { label: string; value: number; icon: LucideIcon; note?: string }) {
  return <div className="rounded-2xl border border-[#E8DED3] bg-white p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-[#6F675F]">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value.toLocaleString("en-NG")}</p></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><Icon className="h-5 w-5" /></span></div>{note && <p className="mt-2 text-xs text-[#8B8178]">{note}</p>}</div>;
}
function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    SELLER_ACCOUNT_SUSPENDED_BY_ADMIN: "Seller account suspended",
    SELLER_ACCOUNT_RESTORED_BY_ADMIN: "Seller account restored",
  };
  return labels[action] ?? displayStatus(action);
}

export default function AdminSellerProfilePage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const sellerId = typeof params?.id === "string" ? params.id : "";
  const [data, setData] = useState<SellerResponse | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [accountTarget, setAccountTarget] = useState<"ACTIVE" | "SUSPENDED" | null>(null);
  const [accountReason, setAccountReason] = useState("");
  const [accountUpdating, setAccountUpdating] = useState(false);
  const [accountActionError, setAccountActionError] = useState("");
  const [accountActionSuccess, setAccountActionSuccess] = useState("");
  const [auditEntries, setAuditEntries] = useState<SellerAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState("");
  const [auditReloadKey, setAuditReloadKey] = useState(0);

  useEffect(() => {
    if (!sellerId) return;
    const controller = new AbortController();
    let cancelled = false;
    async function loadSeller() {
      setLoading(true); setError("");
      try {
        const query = new URLSearchParams({ productPage: String(productPage), productPageSize: String(PAGE_SIZE), orderPage: String(orderPage), orderPageSize: String(PAGE_SIZE) });
        const response = await fetch(`/api/admin/sellers/${encodeURIComponent(sellerId)}?${query}`, { ...noStore, signal: controller.signal });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Unable to load seller details.");
        if (!isRecord(result) || !isRecord(result.seller) || !isRecord(result.counts) || !Array.isArray(result.products) || !Array.isArray(result.sellerOrders) || !isRecord(result.productPagination) || !isRecord(result.orderPagination)) throw new Error("The seller profile response was incomplete.");
        if (!cancelled) setData(result as unknown as SellerResponse);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Admin seller profile loading error:", loadError);
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load seller details.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void loadSeller();
    return () => { cancelled = true; controller.abort(); };
  }, [sellerId, productPage, orderPage, reloadKey]);

  useEffect(() => {
    if (!sellerId) return;
    const controller = new AbortController();
    let cancelled = false;

    async function loadSellerAuditHistory() {
      setAuditLoading(true);
      setAuditError("");
      try {
        const query = new URLSearchParams({
          entityType: "USER",
          entityId: sellerId,
          page: "1",
          pageSize: "10",
        });
        const response = await fetch(`/api/admin/audit-logs?${query.toString()}`, {
          method: "GET", cache: "no-store", signal: controller.signal,
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok || !isRecord(result) || result.success !== true || !Array.isArray(result.entries)) {
          throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Unable to load seller account history.");
        }
        const entries = result.entries.filter((entry): entry is SellerAuditEntry => {
          if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.action !== "string" || typeof entry.entityType !== "string" || typeof entry.entityId !== "string" || typeof entry.createdAt !== "string") return false;
          if (entry.admin !== null && !isRecord(entry.admin)) return false;
          return true;
        }).map((entry) => ({
          ...entry,
          reason: typeof entry.reason === "string" ? entry.reason : null,
          admin: isRecord(entry.admin)
            ? {
                id: typeof entry.admin.id === "string" ? entry.admin.id : "",
                name: typeof entry.admin.name === "string" ? entry.admin.name : null,
                email: typeof entry.admin.email === "string" ? entry.admin.email : null,
              }
            : { id: "", name: null, email: null },
        } as SellerAuditEntry));
        if (!cancelled) setAuditEntries(entries);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Seller audit history loading error:", loadError);
        if (!cancelled) {
          setAuditEntries([]);
          setAuditError(loadError instanceof Error ? loadError.message : "Unable to load seller account history.");
        }
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    }

    void loadSellerAuditHistory();
    return () => { cancelled = true; controller.abort(); };
  }, [sellerId, auditReloadKey, reloadKey]);

  async function handleLogout() {
    try { await signOut({ callbackUrl: "/admin/login" }); }
    catch (logoutError) { console.error("Admin logout error:", logoutError); }
  }

  function openAccountAction(target: "ACTIVE" | "SUSPENDED") {
    setAccountTarget(target);
    setAccountReason("");
    setAccountActionError("");
    setAccountActionSuccess("");
  }

  async function submitAccountAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sellerId || !accountTarget) return;
    const reason = accountReason.trim();
    if (reason.length < 10 || reason.length > 500) {
      setAccountActionError("The reason must be between 10 and 500 characters.");
      return;
    }

    setAccountUpdating(true);
    setAccountActionError("");
    try {
      const response = await fetch(`/api/admin/sellers/${encodeURIComponent(sellerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ accountStatus: accountTarget, reason }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Unable to update seller account.");
      }
      if (!isRecord(result) || !isRecord(result.seller)) {
        throw new Error("The account update response was incomplete.");
      }

      const updatedStatus = result.seller.accountStatus === "ACTIVE" || result.seller.accountStatus === "SUSPENDED"
        ? result.seller.accountStatus
        : accountTarget;
      const suspendedAt = typeof result.seller.suspendedAt === "string" ? result.seller.suspendedAt : null;
      setData((current) => current ? {
        ...current,
        seller: { ...current.seller, accountStatus: updatedStatus, suspendedAt },
      } : current);
      setAccountActionSuccess(updatedStatus === "SUSPENDED" ? "Seller account suspended successfully." : "Seller account restored successfully.");
      setAccountTarget(null);
      setAccountReason("");
      setReloadKey((key) => key + 1);
    } catch (actionError) {
      setAccountActionError(actionError instanceof Error ? actionError.message : "Unable to update seller account.");
    } finally {
      setAccountUpdating(false);
    }
  }

  const seller = data?.seller;
  const business = seller?.business;
  const productPagination = data?.productPagination;
  const orderPagination = data?.orderPagination;

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#FAF6EF] text-[#2E241F]">
      <div className="flex min-h-dvh w-full">
        <aside className="hidden w-64 shrink-0 border-r border-[#E8DED3] bg-[#FFFDFC] lg:block">
          <div className="sticky top-0 flex h-dvh flex-col">
            <div className="border-b border-[#E8DED3] px-6 py-6"><Link href="/admin" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#9F2D18] text-sm font-bold text-white">R</span><span><span className="block font-semibold">ReMarket</span><span className="block text-xs text-[#8B8178]">Founder Admin</span></span></Link></div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6" aria-label="Admin navigation">
              {NAV.map(({ label, href, icon: Icon, available }) => {
                const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                if (!available) return <div key={href} className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#B5AAA1]" aria-disabled="true" title="This Admin module will be implemented in a later step."><Icon className="h-4 w-4" /><span className="flex-1">{label}</span><span className="rounded-full bg-[#F4EFEA] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#9A9087]">Soon</span></div>;
                return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB]"}`}><Icon className="h-4 w-4" /><span>{label}</span></Link>;
              })}
            </nav>
            <div className="border-t border-[#E8DED3] px-4 py-4"><p className="mb-3 px-2 text-xs text-[#8B8178]">Founder access</p><button type="button" onClick={() => void handleLogout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#9F2D18] hover:bg-[#FFF0E8]"><LogOut className="h-4 w-4" />Log out</button></div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-3 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:py-8 lg:pb-8">
            <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div><Link href="/admin/sellers" className="inline-flex items-center gap-2 text-xs font-semibold text-[#9F2D18] hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Back to Sellers</Link><p className="mt-4 text-sm font-medium text-[#9F2D18]">Marketplace operations / Sellers</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Seller profile</h1><p className="mt-2 text-sm text-[#766C63]">Review seller account, business information, products and seller orders.</p></div>
              <div className="flex items-center justify-end gap-2"><NotificationBell /><button type="button" onClick={() => void handleLogout()} className="inline-flex items-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-3 py-2 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18]"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Log out</span></button></div>
            </header>

            {accountActionSuccess && <div className="mb-5 rounded-xl border border-[#CBE8D6] bg-[#F0FAF4] px-4 py-3 text-sm font-medium text-[#287A4B]" role="status">{accountActionSuccess}</div>}
            {error && <div className="mb-6 rounded-2xl border border-[#F1C5BF] bg-[#FFF4F2] px-5 py-4"><p className="text-sm font-medium text-[#B42318]">{error}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#9F2D18] hover:underline"><RefreshCw className="h-3.5 w-3.5" />Try again</button></div>}

            {loading ? <div className="space-y-5" aria-label="Loading seller profile"><div className="h-40 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" /><div className="h-28 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" /><div className="h-80 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" /></div> : seller && data ? (
              <>
                <section className="rounded-2xl border border-[#E8DED3] bg-white p-5 sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]"><UserRound className="h-6 w-6" /></span><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{seller.name || "Name not provided"}</h2><p className="mt-1 break-all text-sm text-[#766C63]">{seller.email}</p><p className="mt-2 break-all font-mono text-[10px] text-[#9A9087]">{seller.id}</p><div className="mt-3 flex flex-wrap gap-2"><Badge value={seller.role} /><Badge value={seller.accountStatus} />{seller.suspendedAt && <span className="text-xs text-[#8B8178]">Suspended {formatDateTime(seller.suspendedAt)}</span>}</div></div></div>
                    <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
                      <div className="rounded-xl bg-[#FAF6EF] px-4 py-3"><p className="text-[11px] font-medium uppercase tracking-wide text-[#8B8178]">Registered</p><p className="mt-1 text-sm font-semibold">{formatDateTime(seller.createdAt)}</p></div>
                      {seller.accountStatus === "ACTIVE" ? (
                        <button type="button" onClick={() => openAccountAction("SUSPENDED")} className="inline-flex items-center gap-2 rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] px-4 py-2.5 text-xs font-semibold text-[#B42318] transition hover:bg-[#FCE8E6]">
                          <ShieldAlert className="h-4 w-4" /> Suspend seller
                        </button>
                      ) : (
                        <button type="button" onClick={() => openAccountAction("ACTIVE")} className="inline-flex items-center gap-2 rounded-xl border border-[#CBE8D6] bg-[#F0FAF4] px-4 py-2.5 text-xs font-semibold text-[#287A4B] transition hover:bg-[#E7F7EF]">
                          <ShieldCheck className="h-4 w-4" /> Restore seller
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat label="Products" value={data.counts.products} icon={Package} note="All seller products, including removed listings" />
                  <Stat label="Active products" value={data.counts.activeProducts} icon={BadgeCheck} note="Active and not soft-deleted" />
                  <Stat label="Seller orders" value={data.counts.sellerOrders} icon={ShoppingCart} note="Orders assigned to this seller" />
                  <Stat label="Completed orders" value={data.counts.completedSellerOrders} icon={BadgeCheck} note="Seller orders marked completed" />
                </section>

                <section className="mt-6">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div><h2 className="text-lg font-semibold text-[#2E241F]">Seller activity &amp; performance</h2><p className="mt-1 text-sm text-[#766C63]">Recent catalogue changes, seller orders and recorded Admin account actions.</p></div>
                    <Link href="/admin/audit-logs" className="inline-flex items-center gap-1 text-xs font-semibold text-[#9F2D18] hover:underline">Open audit logs <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><div className="flex items-center gap-2 text-[#9F2D18]"><Package className="h-4 w-4" /><span className="text-xs font-semibold">Active catalogue</span></div><p className="mt-2 text-2xl font-semibold tabular-nums text-[#2E241F]">{data.counts.activeProducts.toLocaleString("en-NG")} <span className="text-sm font-medium text-[#8B8178]">/ {data.counts.products.toLocaleString("en-NG")}</span></p><p className="mt-1 text-xs text-[#8B8178]">Active products out of all seller listings</p></div>
                    <div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><div className="flex items-center gap-2 text-[#9F2D18]"><ShoppingCart className="h-4 w-4" /><span className="text-xs font-semibold">Completed seller orders</span></div><p className="mt-2 text-2xl font-semibold tabular-nums text-[#2E241F]">{data.counts.completedSellerOrders.toLocaleString("en-NG")} <span className="text-sm font-medium text-[#8B8178]">/ {data.counts.sellerOrders.toLocaleString("en-NG")}</span></p><p className="mt-1 text-xs text-[#8B8178]">Completed out of all assigned seller orders</p></div>
                    <div className="rounded-2xl border border-[#E8DED3] bg-white p-4"><div className="flex items-center gap-2 text-[#9F2D18]"><History className="h-4 w-4" /><span className="text-xs font-semibold">Recorded Admin actions</span></div><p className="mt-2 text-2xl font-semibold tabular-nums text-[#2E241F]">{auditLoading ? "—" : auditEntries.length.toLocaleString("en-NG")}</p><p className="mt-1 text-xs text-[#8B8178]">Latest 10 account audit records loaded below</p></div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <section className="overflow-hidden rounded-2xl border border-[#E8DED3] bg-white">
                      <div className="flex items-center justify-between border-b border-[#E8DED3] px-4 py-4 sm:px-5"><div><h3 className="text-sm font-semibold text-[#2E241F]">Recent product activity</h3><p className="mt-1 text-xs text-[#8B8178]">Latest product records by update time</p></div><Package className="h-4 w-4 text-[#9F2D18]" /></div>
                      {data.products.length === 0 ? <p className="px-5 py-8 text-center text-xs text-[#8B8178]">No product activity is available.</p> : <div className="divide-y divide-[#F0EAE4]">{data.products.slice(0, 5).map((product) => <div key={product.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2E241F]">{product.name}</p><p className="mt-1 text-[11px] text-[#8B8178]">Updated {formatDateTime(product.updatedAt)}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><Badge value={product.deletedAt ? "DELETED" : product.status} /><span className="text-[10px] text-[#8B8178]">{product.category?.name || "Uncategorised"}</span></div></div>)}</div>}
                    </section>
                    <section className="overflow-hidden rounded-2xl border border-[#E8DED3] bg-white">
                      <div className="flex items-center justify-between border-b border-[#E8DED3] px-4 py-4 sm:px-5"><div><h3 className="text-sm font-semibold text-[#2E241F]">Recent seller orders</h3><p className="mt-1 text-xs text-[#8B8178]">Latest orders assigned to this seller</p></div><ShoppingCart className="h-4 w-4 text-[#9F2D18]" /></div>
                      {data.sellerOrders.length === 0 ? <p className="px-5 py-8 text-center text-xs text-[#8B8178]">No seller orders are available.</p> : <div className="divide-y divide-[#F0EAE4]">{data.sellerOrders.slice(0, 5).map((order) => <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2E241F]">{order.sellerOrderCode}</p><p className="mt-1 truncate text-[11px] text-[#8B8178]">{order.order.buyer.name || order.order.buyer.email} · {formatDateTime(order.createdAt)}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><Badge value={order.status} /><span className="text-[10px] font-semibold text-[#6F675F]">{formatMoney(order.subtotal, order.order.currency)}</span></div></div>)}</div>}
                    </section>
                  </div>

                  <section className="mt-4 overflow-hidden rounded-2xl border border-[#E8DED3] bg-white">
                    <div className="flex flex-col gap-3 border-b border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h3 className="text-sm font-semibold text-[#2E241F]">Seller account history</h3><p className="mt-1 text-xs text-[#8B8178]">Administrative account status changes recorded for this seller.</p></div><button type="button" onClick={() => setAuditReloadKey((value) => value + 1)} disabled={auditLoading} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? "animate-spin" : ""}`} />Refresh history</button></div>
                    {auditError ? <div className="m-4 rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] p-4"><p className="text-xs text-[#B42318]">{auditError}</p><button type="button" onClick={() => setAuditReloadKey((value) => value + 1)} className="mt-2 text-xs font-semibold text-[#9F2D18] hover:underline">Try again</button></div> : auditLoading ? <div className="space-y-3 p-4">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-[#F7F1EB]" />)}</div> : auditEntries.length === 0 ? <div className="px-5 py-8 text-center"><History className="mx-auto h-7 w-7 text-[#B8AEA5]" /><p className="mt-2 text-xs font-semibold text-[#6F675F]">No Admin account actions recorded</p><p className="mt-1 text-[11px] text-[#8B8178]">Future suspension and restoration actions will appear here.</p></div> : <div className="divide-y divide-[#F0EAE4]">{auditEntries.map((entry) => <article key={entry.id} className="px-4 py-4 sm:px-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-sm font-semibold text-[#2E241F]">{auditActionLabel(entry.action)}</p><p className="mt-1 text-[11px] text-[#8B8178]">By {entry.admin.name || entry.admin.email || "Admin"} · {formatDateTime(entry.createdAt)}</p>{entry.reason && <p className="mt-2 text-xs leading-5 text-[#6F675F]">Reason: {entry.reason}</p>}</div><Badge value={entry.action.includes("SUSPENDED") ? "SUSPENDED" : entry.action.includes("RESTORED") ? "ACTIVE" : entry.entityType} /></div></article>)}</div>}
                  </section>
                </section>

                <section className="mt-5 rounded-2xl border border-[#E8DED3] bg-white p-5 sm:p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Business profile</h2><p className="mt-1 text-xs text-[#8B8178]">The business linked to this seller account.</p></div>{business && <Link href={`/admin/businesses/${encodeURIComponent(business.id)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#9F2D18] hover:underline">Open business <ExternalLink className="h-3.5 w-3.5" /></Link>}</div>
                  {!business ? <div className="rounded-xl bg-[#FAF6EF] px-4 py-8 text-center"><Building2 className="mx-auto h-8 w-8 text-[#B8AEA5]" /><p className="mt-2 text-sm font-semibold text-[#6F675F]">No business linked to this seller</p></div> : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold">{business.name}</h3><p className="mt-1 text-xs text-[#8B8178]">{business.ownerName || seller.name || "Owner not provided"}</p></div><div className="flex flex-wrap gap-2"><Badge value={business.status} /><Badge value={business.verification} />{business.deletedAt && <Badge value="DELETED" />}</div></div>
                      {business.description && <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-[#6F675F]">{business.description}</p>}
                      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-xl bg-[#FAF6EF] p-4"><p className="text-xs text-[#8B8178]">Location</p><p className="mt-2 flex items-start gap-2 text-sm font-medium"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D18]" />{business.location?.address || [business.location?.street, business.location?.area].filter(Boolean).join(", ") || "Not provided"}</p>{business.location?.verification && <div className="mt-2"><Badge value={business.location.verification} /></div>}</div>
                        <div className="rounded-xl bg-[#FAF6EF] p-4"><p className="text-xs text-[#8B8178]">Contact</p><p className="mt-2 flex items-center gap-2 break-all text-sm font-medium"><Phone className="h-4 w-4 shrink-0 text-[#9F2D18]" />{business.phone || "Not provided"}</p>{business.socialLinks.length > 0 && <div className="mt-3 space-y-1">{business.socialLinks.map((link) => <p key={link.platform} className="break-all text-xs text-[#6F675F]">{displayStatus(link.platform)}: {link.handle}</p>)}</div>}</div>
                        <div className="rounded-xl bg-[#FAF6EF] p-4"><p className="text-xs text-[#8B8178]">Availability and price range</p><div className="mt-2"><Badge value={business.availability} /></div><p className="mt-2 text-sm font-medium">{business.priceMin !== null || business.priceMax !== null ? `${business.priceMin !== null ? formatMoney(business.priceMin) : "From unspecified"} – ${business.priceMax !== null ? formatMoney(business.priceMax) : "No maximum"}` : "No price range set"}</p></div>
                      </div>
                      <div className="mt-4"><p className="text-xs font-semibold text-[#6F675F]">Categories</p><div className="mt-2 flex flex-wrap gap-2">{business.categories.length ? business.categories.map((category) => <span key={category.id} className="rounded-full bg-[#F7F1EB] px-3 py-1.5 text-xs font-medium text-[#6F675F]">{category.name}</span>) : <span className="text-xs text-[#8B8178]">No categories assigned</span>}</div></div>
                    </>
                  )}
                </section>

                <section className="mt-5 overflow-hidden rounded-2xl border border-[#E8DED3] bg-white">
                  <div className="flex flex-col gap-2 border-b border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="font-semibold">Products</h2><p className="mt-1 text-xs text-[#8B8178]">Seller catalogue, newest updates first.</p></div><span className="text-xs text-[#8B8178]">{data.counts.products.toLocaleString("en-NG")} total</span></div>
                  {data.products.length === 0 ? <div className="px-5 py-12 text-center"><Package className="mx-auto h-8 w-8 text-[#B8AEA5]" /><p className="mt-3 text-sm font-semibold text-[#6F675F]">No products found</p></div> : (
                    <>
                      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#FAF6EF] text-xs text-[#766C63]"><tr><th className="px-5 py-3">Product</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3">Availability</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Updated</th></tr></thead><tbody className="divide-y divide-[#F0EAE4]">{data.products.map((product) => <tr key={product.id} className="hover:bg-[#FFFCF9]"><td className="px-5 py-3"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F7F1EB] text-[#9A9087]">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-0" /> : <ImageIcon className="h-4 w-4" />}</span><div className="min-w-0"><p className="max-w-64 truncate font-semibold">{product.name}</p>{product.deletedAt && <span className="text-[10px] font-semibold text-[#B42318]">Removed {formatDate(product.deletedAt)}</span>}</div></div></td><td className="px-5 py-3 text-xs text-[#6F675F]">{product.category?.name || "Uncategorised"}</td><td className="px-5 py-3 whitespace-nowrap text-xs font-semibold">{product.price !== null ? formatMoney(product.price) : product.priceMin !== null || product.priceMax !== null ? `${product.priceMin !== null ? formatMoney(product.priceMin) : "—"} – ${product.priceMax !== null ? formatMoney(product.priceMax) : "—"}` : "Not set"}</td><td className="px-5 py-3 text-xs">{product.stockQuantity === null ? "Not tracked" : product.stockQuantity.toLocaleString("en-NG")}</td><td className="px-5 py-3"><Badge value={product.availability} /></td><td className="px-5 py-3"><Badge value={product.deletedAt ? "DELETED" : product.status} /></td><td className="px-5 py-3 whitespace-nowrap text-xs text-[#766C63]">{formatDate(product.updatedAt)}</td></tr>)}</tbody></table></div>
                      <div className="divide-y divide-[#F0EAE4] md:hidden">{data.products.map((product) => <article key={product.id} className="p-4"><div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F7F1EB] text-[#9A9087]">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain p-0" /> : <ImageIcon className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{product.name}</p><p className="mt-1 text-xs text-[#8B8178]">{product.category?.name || "Uncategorised"}</p><div className="mt-2 flex flex-wrap gap-1.5"><Badge value={product.deletedAt ? "DELETED" : product.status} /><Badge value={product.availability} /></div></div></div><div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-[#6F675F]"><span>{product.price !== null ? formatMoney(product.price) : product.priceMin !== null || product.priceMax !== null ? `${product.priceMin !== null ? formatMoney(product.priceMin) : "—"} – ${product.priceMax !== null ? formatMoney(product.priceMax) : "—"}` : "Price not set"}</span><span>Stock: {product.stockQuantity === null ? "Not tracked" : product.stockQuantity.toLocaleString("en-NG")}</span></div></article>)}</div>
                    </>
                  )}
                  <div className="flex flex-col gap-3 border-t border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-xs text-[#8B8178]">Showing {data.productPagination.total ? ((productPagination?.page ?? 1) - 1) * PAGE_SIZE + 1 : 0}–{Math.min((productPagination?.page ?? 1) * PAGE_SIZE, productPagination?.total ?? 0)} of {productPagination?.total ?? 0} products</p><div className="flex items-center justify-between gap-2 sm:justify-end"><button type="button" onClick={() => setProductPage((value) => Math.max(1, value - 1))} disabled={!productPagination?.hasPreviousPage || loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#6F675F]">Page {productPagination?.page ?? 1} of {Math.max(1, productPagination?.totalPages ?? 0)}</span><button type="button" onClick={() => setProductPage((value) => value + 1)} disabled={!productPagination?.hasNextPage || loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></div>
                </section>

                <section className="mt-5 overflow-hidden rounded-2xl border border-[#E8DED3] bg-white">
                  <div className="flex flex-col gap-2 border-b border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="font-semibold">Seller orders</h2><p className="mt-1 text-xs text-[#8B8178]">Orders assigned to this seller, newest first.</p></div><span className="text-xs text-[#8B8178]">{data.counts.sellerOrders.toLocaleString("en-NG")} total</span></div>
                  {data.sellerOrders.length === 0 ? <div className="px-5 py-12 text-center"><ShoppingCart className="mx-auto h-8 w-8 text-[#B8AEA5]" /><p className="mt-3 text-sm font-semibold text-[#6F675F]">No seller orders found</p></div> : (
                    <>
                      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#FAF6EF] text-xs text-[#766C63]"><tr><th className="px-5 py-3">Seller order</th><th className="px-5 py-3">Buyer</th><th className="px-5 py-3">Items</th><th className="px-5 py-3">Subtotal</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Parent order</th></tr></thead><tbody className="divide-y divide-[#F0EAE4]">{data.sellerOrders.map((order) => <tr key={order.id} className="hover:bg-[#FFFCF9]"><td className="px-5 py-4"><p className="font-semibold">{order.sellerOrderCode}</p><p className="mt-1 text-[10px] text-[#8B8178]">{order.order.orderCode}</p></td><td className="px-5 py-4"><p className="text-xs font-semibold">{order.order.buyer.name || "Name not provided"}</p><p className="mt-1 text-[11px] text-[#8B8178]">{order.order.buyer.email}</p></td><td className="px-5 py-4 text-xs">{order.items.reduce((sum, item) => sum + item.quantity, 0)} units / {order.items.length} lines</td><td className="px-5 py-4 whitespace-nowrap text-xs font-semibold">{formatMoney(order.subtotal, order.order.currency)}</td><td className="px-5 py-4"><Badge value={order.status} /></td><td className="px-5 py-4 whitespace-nowrap text-xs text-[#766C63]">{formatDate(order.createdAt)}</td><td className="px-5 py-4"><Link href="/admin/orders" className="text-xs font-semibold text-[#9F2D18] hover:underline">View orders <ArrowRight className="inline h-3 w-3" /></Link></td></tr>)}</tbody></table></div>
                      <div className="divide-y divide-[#F0EAE4] md:hidden">{data.sellerOrders.map((order) => <article key={order.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all text-sm font-semibold">{order.sellerOrderCode}</p><p className="mt-1 text-xs text-[#8B8178]">{order.order.orderCode}</p></div><Badge value={order.status} /></div><p className="mt-3 text-xs font-medium">{order.order.buyer.name || order.order.buyer.email}</p><div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[#6F675F]"><span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} units</span><span className="font-semibold">{formatMoney(order.subtotal, order.order.currency)}</span><span>{formatDate(order.createdAt)}</span></div><Link href="/admin/orders" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#9F2D18]">Open order directory <ArrowRight className="h-3.5 w-3.5" /></Link></article>)}</div>
                    </>
                  )}
                  <div className="flex flex-col gap-3 border-t border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-xs text-[#8B8178]">Showing {data.orderPagination.total ? ((orderPagination?.page ?? 1) - 1) * PAGE_SIZE + 1 : 0}–{Math.min((orderPagination?.page ?? 1) * PAGE_SIZE, orderPagination?.total ?? 0)} of {orderPagination?.total ?? 0} seller orders</p><div className="flex items-center justify-between gap-2 sm:justify-end"><button type="button" onClick={() => setOrderPage((value) => Math.max(1, value - 1))} disabled={!orderPagination?.hasPreviousPage || loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#6F675F]">Page {orderPagination?.page ?? 1} of {Math.max(1, orderPagination?.totalPages ?? 0)}</span><button type="button" onClick={() => setOrderPage((value) => value + 1)} disabled={!orderPagination?.hasNextPage || loading} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] px-3 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></div>
                </section>

                <div className="mt-5 rounded-2xl border border-[#E8DED3] bg-[#FFFDFC] px-5 py-4"><p className="text-sm font-semibold">Profile data refreshed</p><p className="mt-1 text-xs text-[#8B8178]">{formatDateTime(data.generatedAt)}</p></div>
              </>
            ) : !error ? <div className="rounded-2xl border border-[#E8DED3] bg-white px-5 py-12 text-center"><UserRound className="mx-auto h-8 w-8 text-[#B8AEA5]" /><p className="mt-3 text-sm font-semibold text-[#6F675F]">Seller not found</p><Link href="/admin/sellers" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#9F2D18]">Back to sellers <ArrowRight className="h-3.5 w-3.5" /></Link></div> : null}
          </div>
        </main>
      </div>

      {accountTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#2E241F]/45 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="seller-account-dialog-title" className="w-full max-w-lg rounded-2xl border border-[#E8DED3] bg-[#FFFDFC] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9F2D18]">Seller account management</p>
                <h2 id="seller-account-dialog-title" className="mt-1 text-lg font-semibold text-[#2E241F]">{accountTarget === "SUSPENDED" ? "Suspend seller account?" : "Restore seller account?"}</h2>
                <p className="mt-2 text-sm leading-6 text-[#766C63]">{accountTarget === "SUSPENDED" ? "The seller will be blocked from starting or continuing authenticated seller sessions after the next authentication check." : "The seller will be able to sign in again, subject to the normal account checks."}</p>
              </div>
              <button type="button" onClick={() => { if (!accountUpdating) setAccountTarget(null); }} disabled={accountUpdating} aria-label="Close dialog" className="rounded-lg p-2 text-[#8B8178] hover:bg-[#F7F1EB] disabled:opacity-40"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 rounded-xl border border-[#E8DED3] bg-[#FAF6EF] px-3 py-3 text-xs leading-5 text-[#6F675F]">This changes the seller account status only. It does not automatically deactivate or reactivate the linked business.</div>
            <form onSubmit={submitAccountAction} className="mt-5 space-y-3">
              <label htmlFor="seller-account-reason" className="block text-sm font-semibold text-[#4B4038]">Reason <span className="font-normal text-[#8B8178]">(required, 10–500 characters)</span></label>
              <textarea id="seller-account-reason" value={accountReason} onChange={(event) => setAccountReason(event.target.value)} minLength={10} maxLength={500} rows={4} required placeholder={accountTarget === "SUSPENDED" ? "Explain why this seller account is being suspended..." : "Explain why this seller account is being restored..."} className="w-full resize-y rounded-xl border border-[#E8DED3] bg-white px-3 py-3 text-sm text-[#2E241F] outline-none transition placeholder:text-[#A69B91] focus:border-[#D58A75] focus:ring-2 focus:ring-[#FFF0E8]" />
              <div className="flex items-center justify-between text-[11px] text-[#8B8178]"><span>Reason is stored in Admin Audit Logs.</span><span className="tabular-nums">{accountReason.trim().length}/500</span></div>
              {accountActionError && <p className="rounded-lg border border-[#F1C5BF] bg-[#FFF4F2] px-3 py-2 text-xs text-[#B42318]" role="alert">{accountActionError}</p>}
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setAccountTarget(null)} disabled={accountUpdating} className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E8DED3] px-4 text-xs font-semibold text-[#6F675F] hover:bg-[#F7F1EB] disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={accountUpdating || accountReason.trim().length < 10 || accountReason.trim().length > 500} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${accountTarget === "SUSPENDED" ? "bg-[#B42318] hover:bg-[#941D14]" : "bg-[#287A4B] hover:bg-[#21643E]"}`}>
                  {accountUpdating ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : accountTarget === "SUSPENDED" ? <ShieldAlert className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {accountUpdating ? "Saving..." : accountTarget === "SUSPENDED" ? "Confirm suspension" : "Confirm restoration"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E8DED3] bg-[#FFFDFC]/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(46,36,31,0.08)] backdrop-blur lg:hidden" aria-label="Mobile Admin navigation">
        <div className="mx-auto grid w-full max-w-xl grid-cols-6 gap-1">{MOBILE_NAV.map(({ label, href, icon: Icon }) => { const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[10px] font-semibold transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB]"}`}><Icon className="h-4 w-4 shrink-0" /><span className="leading-tight">{label}</span></Link>; })}</div>
      </nav>
    </div>
  );
}
