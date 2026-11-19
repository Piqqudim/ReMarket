"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Activity, ArrowRight, BadgeCheck, Building2, ChartNoAxesCombined,
  ChevronLeft, ChevronRight, Contact, CreditCard, Eye, ExternalLink,
  History, LayoutDashboard, LogOut, MapPin, Package, Phone, RefreshCw,
  ShoppingCart, Store, Tags, Trash2, Truck, UserRound, Users, Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

type ContactActivity = {
  WHATSAPP: number; PHONE: number; INSTAGRAM: number;
  TIKTOK: number; FACEBOOK: number; DIRECTIONS: number;
};

const DEFAULT_CONTACT_ACTIVITY: ContactActivity = {
  WHATSAPP: 0, PHONE: 0, INSTAGRAM: 0, TIKTOK: 0, FACEBOOK: 0, DIRECTIONS: 0,
};

type CountByStatus = { status: string; count: number };
type RecentOrder = {
  id: string; orderCode: string; status: string; itemsSubtotal: number;
  deliveryFee: number; deliveryFeeStatus: string; totalAmount: number;
  currency: string; createdAt: string;
  buyer: { id: string; name: string | null; email: string };
  sellerOrderCount: number;
};
type Overview = {
  stats: {
    businesses: number; activeBusinesses: number; deletedBusinesses: number;
    products: number; activeProducts: number; buyers: number; sellers: number;
    orders: number; completedOrders: number; cancelledOrders: number;
    businessViews: number; contacts: number;
  };
  operations: {
    pendingSellerOrders: number; unconfirmedDeliveryFees: number;
    pendingPayments: number; pendingDeletionRequests: number;
    categories: number; activeCategories: number;
  };
  orderStatusCounts: CountByStatus[];
  paymentStatusCounts: CountByStatus[];
  contactActivity: ContactActivity;
  recentOrders: RecentOrder[];
  generatedAt: string;
};
type RegisteredBusiness = {
  id: string; name: string; verification: string; status: string;
  area: string | null; onboardedAt: string; deletedAt: string | null;
};
type AdminNavItem = { label: string; href: string; icon: LucideIcon; available: boolean };

const REGISTERED_BUSINESSES_PAGE_SIZE = 6;
const ADMIN_NAV: AdminNavItem[] = [
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
const MOBILE_NAV = ADMIN_NAV.filter(({ label }) =>
  ["Overview", "Businesses", "Buyers", "Sellers", "Products", "Categories", "Orders", "Audit logs"].includes(label),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRegisteredBusiness(value: unknown): RegisteredBusiness | null {
  if (!isRecord(value)) return null;
  const { id, name, status, verification } = value;
  const onboardedAt = typeof value.onboardedAt === "string"
    ? value.onboardedAt
    : typeof value.createdAt === "string" ? value.createdAt : null;
  if (typeof id !== "string" || typeof name !== "string" ||
      typeof status !== "string" || typeof verification !== "string" || !onboardedAt) return null;
  const location = isRecord(value.location) ? value.location : null;
  return {
    id, name, status, verification, onboardedAt,
    area: location && typeof location.area === "string" ? location.area
      : typeof value.area === "string" ? value.area : null,
    deletedAt: typeof value.deletedAt === "string" ? value.deletedAt : null,
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
  });
}
function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}
function formatMoney(amount: number, currency = "NGN"): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(amount);
}
function businessStatusClass(status: string): string {
  if (status === "ACTIVE") return "bg-[#E7F7EF] text-[#287A4B]";
  if (status === "PENDING") return "bg-[#FFF0D9] text-[#9F5A18]";
  return "bg-[#F0ECE7] text-[#6F675F]";
}
function verificationClass(verification: string): string {
  return verification === "VERIFIED" ? "bg-[#E7F7EF] text-[#287A4B]" : "bg-[#F0ECE7] text-[#6F675F]";
}
function orderStatusClass(status: string): string {
  if (["COMPLETED", "DELIVERED"].includes(status)) return "bg-[#E7F7EF] text-[#287A4B]";
  if (["CANCELLED", "PARTIALLY_CANCELLED", "REJECTED"].includes(status)) return "bg-[#FCE8E6] text-[#B42318]";
  if (["PENDING_ACCEPTANCE", "PLACED", "PARTIALLY_ACCEPTED"].includes(status)) return "bg-[#FFF0D9] text-[#9F5A18]";
  return "bg-[#EAF1FA] text-[#355C88]";
}
function paymentStatusClass(status: string): string {
  if (status === "SUCCESS") return "bg-[#E7F7EF] text-[#287A4B]";
  if (["FAILED", "CANCELLED", "REFUNDED"].includes(status)) return "bg-[#FCE8E6] text-[#B42318]";
  return "bg-[#FFF0D9] text-[#9F5A18]";
}
function displayStatus(value: string): string {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function StatCard({ label, value, icon: Icon, href, description }: {
  label: string; value: number; icon: LucideIcon; href?: string; description?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-[#E8DED3] bg-white p-5 transition hover:border-[#D8C9BC]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#6F675F]">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-[#2E241F]">{value.toLocaleString("en-NG")}</p>
          {description && <p className="mt-2 text-xs text-[#8B8178]">{description}</p>}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><Icon className="h-5 w-5" /></div>
      </div>
      {href && <div className="mt-4 flex items-center gap-1 text-xs font-medium text-[#9F2D18]">View details <ArrowRight className="h-3.5 w-3.5" /></div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function OperationCard({ label, value, description, icon: Icon, href, attention = false, available = true }: {
  label: string; value: number; description: string; icon: LucideIcon;
  href?: string; attention?: boolean; available?: boolean;
}) {
  const content = (
    <div className={`h-full rounded-2xl border bg-white p-5 transition ${attention ? "border-[#F1D1C9]" : "border-[#E8DED3]"} ${href ? "hover:border-[#D8C9BC]" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#6F675F]">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-[#2E241F]">{value.toLocaleString("en-NG")}</p>
          <p className="mt-2 text-xs leading-5 text-[#8B8178]">{description}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${attention ? "bg-[#FFF0E8] text-[#9F2D18]" : "bg-[#F7F1EB] text-[#6F675F]"}`}><Icon className="h-5 w-5" /></div>
      </div>
      {href && available && <div className="mt-4 flex items-center gap-1 text-xs font-medium text-[#9F2D18]">View details <ArrowRight className="h-3.5 w-3.5" /></div>}
    </div>
  );
  return href && available ? <Link href={href}>{content}</Link> : content;
}

function ContactActivityCard({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-[#E8DED3] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><Icon className="h-5 w-5" /></div>
        <span className="text-2xl font-semibold tabular-nums text-[#2E241F]">{value.toLocaleString("en-NG")}</span>
      </div>
      <p className="mt-4 text-sm font-medium text-[#6F675F]">{label}</p>
    </div>
  );
}

function SectionHeading({ title, description, href, linkLabel = "View all" }: {
  title: string; description?: string; href?: string; linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-[#2E241F]">{title}</h2>
        {description && <p className="mt-1 text-sm text-[#766C63]">{description}</p>}
      </div>
      {href && <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-[#9F2D18] hover:underline">{linkLabel} <ArrowRight className="h-3.5 w-3.5" /></Link>}
    </div>
  );
}

export default function AdminPage() {
  const pathname = usePathname();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [registeredBusinesses, setRegisteredBusinesses] = useState<RegisteredBusiness[]>([]);
  const [businessDirectoryLoading, setBusinessDirectoryLoading] = useState(true);
  const [businessDirectoryError, setBusinessDirectoryError] = useState("");
  const [businessPage, setBusinessPage] = useState(1);
  const [businessDirectoryTotal, setBusinessDirectoryTotal] = useState(0);
  const [businessDirectoryTotalPages, setBusinessDirectoryTotalPages] = useState(0);
  const [businessReloadKey, setBusinessReloadKey] = useState(0);
  const contactActivity = data?.contactActivity ?? DEFAULT_CONTACT_ACTIVITY;

  async function handleLogout() {
    try { await signOut({ callbackUrl: "/admin/login" }); }
    catch (logoutError) { console.error("Admin logout error:", logoutError); }
  }

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function loadOverview() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/overview", { method: "GET", cache: "no-store", signal: controller.signal });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = isRecord(result) && typeof result.error === "string" ? result.error : "Unable to load the Admin overview.";
          throw new Error(message);
        }
        if (!isRecord(result) || !isRecord(result.stats) || !isRecord(result.operations)) throw new Error("The Admin overview response is incomplete.");
        if (!cancelled) setData(result as unknown as Overview);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Admin overview loading error:", loadError);
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "We couldn't load the Admin dashboard.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void loadOverview();
    return () => { cancelled = true; controller.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function loadRegisteredBusinesses() {
      setBusinessDirectoryLoading(true);
      setBusinessDirectoryError("");
      try {
        const params = new URLSearchParams({ deleted: "ALL", page: String(businessPage), pageSize: String(REGISTERED_BUSINESSES_PAGE_SIZE), sort: "onboardedAt" });
        const response = await fetch(`/api/admin/businesses?${params.toString()}`, { method: "GET", cache: "no-store", signal: controller.signal });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = isRecord(result) && typeof result.error === "string" ? result.error : "Unable to load registered businesses.";
          throw new Error(message);
        }
        if (!isRecord(result) || !Array.isArray(result.businesses) || !isRecord(result.pagination)) throw new Error("The registered-business response was invalid.");
        const pagination = result.pagination;
        if (typeof pagination.page !== "number" || typeof pagination.total !== "number" || typeof pagination.totalPages !== "number" || !Number.isInteger(pagination.page) || !Number.isInteger(pagination.total) || !Number.isInteger(pagination.totalPages) || pagination.total < 0 || pagination.totalPages < 0) throw new Error("The registered-business pagination was invalid.");
        const businesses = result.businesses.map(normalizeRegisteredBusiness).filter((business): business is RegisteredBusiness => business !== null);
        if (cancelled) return;
        setRegisteredBusinesses(businesses);
        setBusinessDirectoryTotal(pagination.total);
        setBusinessDirectoryTotalPages(pagination.totalPages);
        if (pagination.totalPages > 0 && businessPage > pagination.totalPages) setBusinessPage(pagination.totalPages);
        else if (pagination.totalPages === 0 && businessPage !== 1) setBusinessPage(1);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Registered business loading error:", loadError);
        if (!cancelled) {
          setRegisteredBusinesses([]);
          setBusinessDirectoryTotal(0);
          setBusinessDirectoryTotalPages(0);
          setBusinessDirectoryError(loadError instanceof Error ? loadError.message : "We couldn't load registered businesses.");
        }
      } finally { if (!cancelled) setBusinessDirectoryLoading(false); }
    }
    void loadRegisteredBusinesses();
    return () => { cancelled = true; controller.abort(); };
  }, [businessReloadKey, businessPage]);

  const businessTotalPages = Math.max(1, businessDirectoryTotalPages);
  const safeBusinessPage = Math.min(businessPage, businessTotalPages);
  const businessStartIndex = businessDirectoryTotal === 0 ? 0 : (safeBusinessPage - 1) * REGISTERED_BUSINESSES_PAGE_SIZE;
  const businessEndIndex = Math.min(safeBusinessPage * REGISTERED_BUSINESSES_PAGE_SIZE, businessDirectoryTotal);

  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#FAF6EF] text-[#2E241F]">
      <div className="flex min-h-dvh w-full">
        <aside className="hidden w-64 shrink-0 border-r border-[#E8DED3] bg-[#FFFDFC] lg:block">
          <div className="sticky top-0 flex h-dvh flex-col">
            <div className="border-b border-[#E8DED3] px-6 py-6">
              <Link href="/admin" className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#9F2D18] text-sm font-bold text-white">R</div>
                <div><p className="font-semibold text-[#2E241F]">ReMarket</p><p className="text-xs text-[#8B8178]">Founder Admin</p></div>
              </Link>
            </div>
            <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
              <div>
                <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9A9087]">Marketplace operations</p>
                <div className="space-y-1">
                  {ADMIN_NAV.map((item) => {
                    const Icon = item.icon;
                    const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                    if (!item.available) return (
                      <div key={item.href} className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#B5AAA1]" title="This Admin module will be implemented in a later step." aria-disabled="true">
                        <Icon className="h-4 w-4" /><span className="flex-1">{item.label}</span>
                        <span className="rounded-full bg-[#F4EFEA] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#9A9087]">Soon</span>
                      </div>
                    );
                    return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB] hover:text-[#2E241F]"}`}>
                      <Icon className="h-4 w-4" /><span>{item.label}</span>
                    </Link>;
                  })}
                </div>
              </div>
            </nav>
            <div className="border-t border-[#E8DED3] px-4 py-4">
              <div className="mb-4 px-2"><p className="text-xs text-[#9A9087]">ReMarket Admin</p><p className="mt-1 text-sm font-medium text-[#4B4038]">Founder access</p></div>
              <button type="button" onClick={() => void handleLogout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-[#9F2D18] transition hover:bg-[#FFF0E8]"><LogOut className="h-4 w-4" /><span>Log out</span></button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-3 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:py-8 lg:pb-8">
            <div className="mb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[#9F2D18]">Marketplace operations</p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#2E241F] sm:text-3xl">Overview</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766C63]">Monitor ReMarket buyers, sellers, products and orders from one place. Payment and delivery integrations will be connected after their operational workflows are implemented.</p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <NotificationBell />
                  <button type="button" onClick={() => void handleLogout()} className="inline-flex items-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-3 py-2 text-xs font-semibold text-[#6F675F] transition hover:border-[#D8C9BC] hover:bg-[#FFF0E8] hover:text-[#9F2D18]" aria-label="Log out" title="Log out"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Log out</span></button>
                </div>
              </div>
            </div>

            {error && <div className="mb-6 rounded-2xl border border-[#F1C5BF] bg-[#FFF4F2] px-5 py-4"><p className="text-sm font-medium text-[#B42318]">{error}</p></div>}
            {loading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" />)}</div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" />)}</div>
                <div className="h-72 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" />
              </div>
            ) : data ? (
              <>
                <section>
                  <SectionHeading title="Marketplace overview" description="Current account, business, product and order totals." />
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                    <StatCard label="Buyers" value={data.stats.buyers} icon={Users} description="Registered buyer accounts" />
                    <StatCard label="Sellers" value={data.stats.sellers} icon={UserRound} description="Registered seller accounts" />
                    <StatCard label="Businesses" value={data.stats.businesses} icon={Store} href="/admin/businesses" description={`${data.stats.activeBusinesses.toLocaleString("en-NG")} active businesses`} />
                    <StatCard label="Products" value={data.stats.products} icon={Package} href="/admin/products" description={`${data.stats.activeProducts.toLocaleString("en-NG")} active products`} />
                    <StatCard label="Orders" value={data.stats.orders} icon={ShoppingCart} description="All parent checkout orders" />
                    <StatCard label="Completed orders" value={data.stats.completedOrders} icon={BadgeCheck} description="Orders marked completed" />
                    <StatCard label="Cancelled orders" value={data.stats.cancelledOrders} icon={Trash2} description="Cancelled or partly cancelled" />
                    <StatCard label="Business views" value={data.stats.businessViews} icon={Eye} description="Recorded business profile views" />
                  </div>
                </section>

                <section className="mt-8">
                  <SectionHeading title="Attention required" description="Operational items that may need the founder's review." />
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                    <OperationCard label="Seller orders awaiting acceptance" value={data.operations.pendingSellerOrders} description="Seller orders still waiting for a response." icon={ShoppingCart} attention={data.operations.pendingSellerOrders > 0} available={false} />
                    <OperationCard label="Unconfirmed delivery fees" value={data.operations.unconfirmedDeliveryFees} description="Orders whose delivery fee is not confirmed." icon={Truck} attention={data.operations.unconfirmedDeliveryFees > 0} available={false} />
                    <OperationCard label="Pending payment records" value={data.operations.pendingPayments} description="Payment records awaiting a final status. Not proof of collection." icon={CreditCard} attention={data.operations.pendingPayments > 0} available={false} />
                    <OperationCard label="Business deletion requests" value={data.operations.pendingDeletionRequests} description="Requests waiting for founder review." icon={Trash2} href="/admin/business-deletion-requests" attention={data.operations.pendingDeletionRequests > 0} />
                    <OperationCard label="Categories" value={data.operations.categories} description={`${data.operations.activeCategories.toLocaleString("en-NG")} active categories.`} icon={Tags} href="/admin/categories" />
                    <OperationCard label="Active categories" value={data.operations.activeCategories} description="Categories currently available to sellers." icon={Tags} href="/admin/categories" />
                  </div>
                </section>

                <section className="mt-8">
                  <SectionHeading title="Order status" description="Parent checkout orders grouped by their current status." href="/admin/orders" />
                  {data.orderStatusCounts.length === 0 ? (
                    <div className="rounded-2xl border border-[#E8DED3] bg-white px-5 py-10 text-center"><ShoppingCart className="mx-auto h-8 w-8 text-[#B8AEA5]" /><p className="mt-3 text-sm font-medium text-[#6F675F]">No orders have been recorded yet</p></div>
                  ) : <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    {data.orderStatusCounts.map((item) => <div key={item.status} className="rounded-2xl border border-[#E8DED3] bg-white p-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${orderStatusClass(item.status)}`}>{displayStatus(item.status)}</span><p className="mt-3 text-2xl font-semibold tabular-nums text-[#2E241F]">{item.count.toLocaleString("en-NG")}</p></div>)}
                  </div>}
                </section>

                <section className="mt-8">
                  <SectionHeading title="Payment records" description="Database payment statuses. Provider processing is not connected yet." />
                  {data.paymentStatusCounts.length === 0 ? (
                    <div className="rounded-2xl border border-[#E8DED3] bg-white px-5 py-8 text-center"><CreditCard className="mx-auto h-7 w-7 text-[#B8AEA5]" /><p className="mt-3 text-sm font-medium text-[#6F675F]">No payment records yet</p></div>
                  ) : <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                    {data.paymentStatusCounts.map((item) => <div key={item.status} className="rounded-2xl border border-[#E8DED3] bg-white p-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${paymentStatusClass(item.status)}`}>{displayStatus(item.status)}</span><p className="mt-3 text-2xl font-semibold tabular-nums text-[#2E241F]">{item.count.toLocaleString("en-NG")}</p></div>)}
                  </div>}
                </section>

                <section className="mt-8">
                  <SectionHeading title="Seller contact activity" description="Recorded buyer actions on business contact options." />
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                    <ContactActivityCard label="WhatsApp" value={contactActivity.WHATSAPP} icon={Contact} />
                    <ContactActivityCard label="Phone" value={contactActivity.PHONE} icon={Phone} />
                    <ContactActivityCard label="Instagram" value={contactActivity.INSTAGRAM} icon={ExternalLink} />
                    <ContactActivityCard label="TikTok" value={contactActivity.TIKTOK} icon={Activity} />
                    <ContactActivityCard label="Facebook" value={contactActivity.FACEBOOK} icon={ExternalLink} />
                    <ContactActivityCard label="Directions" value={contactActivity.DIRECTIONS} icon={MapPin} />
                  </div>
                  <p className="mt-2 text-xs text-[#9A9087]">Total recorded contact events: {data.stats.contacts.toLocaleString("en-NG")}</p>
                </section>

                <section className="mt-8 grid gap-6 xl:grid-cols-2">
                  <div className="min-w-0 rounded-2xl border border-[#E8DED3] bg-white">
                    <div className="flex items-center justify-between border-b border-[#E8DED3] px-5 py-4">
                      <div><h2 className="font-semibold text-[#2E241F]">Recent orders</h2><p className="mt-1 text-xs text-[#8B8178]">Latest buyer checkouts across ReMarket</p></div>
                      <Link href="/admin/orders" className="flex items-center gap-1 text-xs font-medium text-[#9F2D18] hover:underline">View orders <ArrowRight className="h-3.5 w-3.5" /></Link>
                    </div>
                    <div className="divide-y divide-[#E8DED3]">
                      {data.recentOrders.length === 0 ? <div className="px-5 py-10 text-center"><ShoppingCart className="mx-auto h-8 w-8 text-[#B8AEA5]" /><p className="mt-3 text-sm font-medium text-[#6F675F]">No orders yet</p><p className="mt-1 text-xs text-[#8B8178]">New buyer checkouts will appear here.</p></div> : data.recentOrders.map((order) => (
                        <div key={order.id} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2E241F]">{order.orderCode}</p><p className="mt-1 truncate text-xs text-[#8B8178]">{order.buyer.name || order.buyer.email}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${orderStatusClass(order.status)}`}>{displayStatus(order.status)}</span></div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8B8178]"><span>{order.sellerOrderCount} seller {order.sellerOrderCount === 1 ? "order" : "orders"}</span><span className="font-semibold text-[#2E241F]">{formatMoney(order.totalAmount, order.currency)}</span></div>
                          {order.deliveryFeeStatus === "UNCONFIRMED" && <p className="mt-2 text-[11px] font-medium text-[#9F5A18]">Delivery fee not confirmed</p>}
                          <p className="mt-2 text-[11px] text-[#9A9087]">{formatDateTime(order.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-2xl border border-[#E8DED3] bg-white">
                    <div className="flex flex-col gap-3 border-b border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0"><h2 className="font-semibold text-[#2E241F]">Registered businesses</h2><p className="mt-1 text-xs leading-5 text-[#8B8178]">Recently onboarded businesses, newest first.</p></div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => setBusinessReloadKey((key) => key + 1)} disabled={businessDirectoryLoading} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-3 text-xs font-semibold text-[#6F675F] transition hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${businessDirectoryLoading ? "animate-spin" : ""}`} />Refresh</button>
                        <Link href="/admin/businesses" className="inline-flex h-9 items-center gap-1 rounded-xl bg-[#FFF0E8] px-3 text-xs font-semibold text-[#9F2D18] hover:bg-[#FFE3D7]">Manage <ArrowRight className="h-3.5 w-3.5" /></Link>
                      </div>
                    </div>
                    {businessDirectoryLoading ? (
                      <div className="space-y-3 p-4 sm:p-5" aria-label="Loading registered businesses">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[68px] animate-pulse rounded-xl bg-[#F7F1EB]" />)}</div>
                    ) : businessDirectoryError ? (
                      <div className="p-5"><div className="rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] p-4"><p className="text-sm font-semibold text-[#B42318]">Unable to load businesses</p><p className="mt-1 text-xs leading-5 text-[#8B8178]">{businessDirectoryError}</p><button type="button" onClick={() => setBusinessReloadKey((key) => key + 1)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#9F2D18] ring-1 ring-[#F1C5BF] hover:bg-[#FFF0E8]"><RefreshCw className="h-3.5 w-3.5" />Try again</button></div></div>
                    ) : registeredBusinesses.length === 0 ? (
                      <div className="px-5 py-10 text-center"><Building2 className="mx-auto h-8 w-8 text-[#B8AEA5]" /><p className="mt-3 text-sm font-medium text-[#6F675F]">No registered businesses yet</p></div>
                    ) : (
                      <>
                        <div className="divide-y divide-[#E8DED3]">
                          {registeredBusinesses.map((business) => (
                            <div key={business.id} className="min-w-0 px-4 py-4 sm:px-5">
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0 flex-1"><Link href={`/admin/businesses/${encodeURIComponent(business.id)}`} className="block truncate text-sm font-semibold text-[#2E241F] hover:text-[#9F2D18] hover:underline" title={business.name}>{business.name}</Link><p className="mt-1 truncate text-xs text-[#8B8178]">{business.area || "Area not provided"}<span className="px-1.5">·</span>{formatDate(business.onboardedAt)}</p></div>
                                <Link href={`/admin/businesses/${encodeURIComponent(business.id)}`} aria-label={`View ${business.name}`} title="View business" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E8DED3] text-[#6F675F] hover:border-[#D8C9BC] hover:bg-[#FFF0E8] hover:text-[#9F2D18]"><ExternalLink className="h-3.5 w-3.5" /></Link>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${verificationClass(business.verification)}`}>{business.verification}</span>
                                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${businessStatusClass(business.status)}`}>{business.status}</span>
                                {business.deletedAt && <span className="rounded-full bg-[#FCE8E6] px-2 py-1 text-[10px] font-semibold text-[#B42318]">Deleted</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col gap-3 border-t border-[#E8DED3] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                          <p className="text-xs text-[#8B8178]" aria-live="polite">Showing {businessStartIndex === 0 && businessDirectoryTotal === 0 ? 0 : businessStartIndex + 1}–{businessEndIndex} of {businessDirectoryTotal} businesses</p>
                          <div className="flex items-center justify-between gap-2 sm:justify-end">
                            <button type="button" onClick={() => setBusinessPage((page) => Math.max(1, page - 1))} disabled={safeBusinessPage <= 1} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] bg-white px-3 text-xs font-semibold text-[#6F675F] transition hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
                            <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-[#6F675F]">Page {safeBusinessPage} of {businessTotalPages}</span>
                            <button type="button" onClick={() => setBusinessPage((page) => Math.min(businessTotalPages, page + 1))} disabled={safeBusinessPage >= businessTotalPages} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED3] bg-white px-3 text-xs font-semibold text-[#6F675F] transition hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </section>

                <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-[#E8DED3] bg-[#FFFDFC] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-semibold text-[#2E241F]">Dashboard data refreshed</p><p className="mt-1 text-xs text-[#8B8178]">{formatDateTime(data.generatedAt)}</p></div>
                  <Link href="/admin/businesses" className="inline-flex items-center gap-2 text-xs font-semibold text-[#9F2D18] hover:underline">Manage marketplace <ArrowRight className="h-3.5 w-3.5" /></Link>
                </div>
              </>
            ) : null}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 overflow-x-auto border-t border-[#E8DED3] bg-[#FFFDFC]/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(46,36,31,0.08)] backdrop-blur lg:hidden" aria-label="Mobile Admin navigation">
        <div className="mx-auto flex w-full max-w-xl min-w-max gap-1">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
            if (!item.available) return <div key={item.href} className="flex min-h-[48px] min-w-[64px] flex-1 cursor-not-allowed flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[10px] font-semibold text-[#B5AAA1]" aria-disabled="true" title="Coming soon"><Icon className="h-4 w-4 shrink-0" /><span className="leading-tight">{item.label}</span></div>;
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-[48px] min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[10px] font-semibold transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#6F675F] hover:bg-[#F7F1EB]"}`}><Icon className="h-4 w-4 shrink-0" /><span className="leading-tight">{item.label}</span></Link>;
          })}
        </div>
      </nav>
    </div>
  );
}
