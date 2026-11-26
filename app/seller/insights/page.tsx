"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Eye,
  Package,
  RefreshCw,
  ShoppingBag,
  Users,
} from "lucide-react";

type JsonRecord = Record<string, unknown>;
type Analytics = {
  business: { name: string };
  period: { from: string; to: string; timezone: string; days: number };
  views: { allTime: number; period: number; uniqueVisitorsAllTime: number; uniqueVisitorsPeriod: number };
  contacts: {
    allTime: number;
    period: number;
    allTimeByPlatform: Record<string, number>;
    periodByPlatform: Record<string, number>;
    allTimeContactRate: number;
    periodContactRate: number;
    contactRateDefinition: string;
  };
  products: { total: number; active: number; inactive: number; pending: number; deleted: number };
  inventory: { trackedProducts: number; untrackedProducts: number; inStockProducts: number; outOfStockProducts: number; totalTrackedUnits: number };
  orders: {
    allTime: { total: number; byStatus: Record<string, number> };
    period: { total: number; byStatus: Record<string, number> };
    orderDefinition: string;
    financialStatus: string;
  };
};

type LoadState = "loading" | "ready" | "error";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeRate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function parseCountMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, safeCount(count)]));
}

function parseAnalytics(value: unknown): Analytics | null {
  if (!isRecord(value)) return null;
  const business = isRecord(value.business) ? value.business : {};
  const period = isRecord(value.period) ? value.period : {};
  const views = isRecord(value.views) ? value.views : {};
  const contacts = isRecord(value.contacts) ? value.contacts : {};
  const products = isRecord(value.products) ? value.products : {};
  const inventory = isRecord(value.inventory) ? value.inventory : {};
  const orders = isRecord(value.orders) ? value.orders : {};
  const allTimeOrders = isRecord(orders.allTime) ? orders.allTime : {};
  const periodOrders = isRecord(orders.period) ? orders.period : {};

  if (typeof period.from !== "string" || typeof period.to !== "string") return null;

  return {
    business: { name: typeof business.name === "string" ? business.name : "Your store" },
    period: {
      from: period.from,
      to: period.to,
      timezone: typeof period.timezone === "string" ? period.timezone : "Africa/Lagos",
      days: safeCount(period.days) || 30,
    },
    views: {
      allTime: safeCount(views.allTime),
      period: safeCount(views.period),
      uniqueVisitorsAllTime: safeCount(views.uniqueVisitorsAllTime),
      uniqueVisitorsPeriod: safeCount(views.uniqueVisitorsPeriod),
    },
    contacts: {
      allTime: safeCount(contacts.allTime),
      period: safeCount(contacts.period),
      allTimeByPlatform: parseCountMap(contacts.allTimeByPlatform),
      periodByPlatform: parseCountMap(contacts.periodByPlatform),
      allTimeContactRate: safeRate(contacts.allTimeContactRate),
      periodContactRate: safeRate(contacts.periodContactRate),
      contactRateDefinition: typeof contacts.contactRateDefinition === "string" ? contacts.contactRateDefinition : "Contact clicks per 100 business views.",
    },
    products: {
      total: safeCount(products.total),
      active: safeCount(products.active),
      inactive: safeCount(products.inactive),
      pending: safeCount(products.pending),
      deleted: safeCount(products.deleted),
    },
    inventory: {
      trackedProducts: safeCount(inventory.trackedProducts),
      untrackedProducts: safeCount(inventory.untrackedProducts),
      inStockProducts: safeCount(inventory.inStockProducts),
      outOfStockProducts: safeCount(inventory.outOfStockProducts),
      totalTrackedUnits: safeCount(inventory.totalTrackedUnits),
    },
    orders: {
      allTime: { total: safeCount(allTimeOrders.total), byStatus: parseCountMap(allTimeOrders.byStatus) },
      period: { total: safeCount(periodOrders.total), byStatus: parseCountMap(periodOrders.byStatus) },
      orderDefinition: typeof orders.orderDefinition === "string" ? orders.orderDefinition : "Counts seller order records.",
      financialStatus: typeof orders.financialStatus === "string" ? orders.financialStatus : "Order counts are not confirmed payments or revenue.",
    },
  };
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  }).format(parsed);
}

function formatMetric(value: number): string {
  return value.toLocaleString("en-NG");
}

function prettyStatus(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SummaryCard({ title, value, description, icon }: { title: string; value: string; description: string; icon: ReactNode }) {
  return (
    <section className="rm-panel min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--rm-muted)]">{title}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--rm-ink)] sm:text-3xl">{value}</p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--rm-muted)]">{description}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]">{icon}</span>
      </div>
    </section>
  );
}

function MetricLine({ label, value }: { label: string; value: number | string }) {
  const displayValue = typeof value === "number" ? formatMetric(value) : value;
  return <div className="flex items-center justify-between gap-3 border-b border-[var(--rm-border)] py-2.5 last:border-0"><span className="text-xs text-[var(--rm-muted)]">{label}</span><span className="text-sm font-bold tabular-nums text-[var(--rm-ink)]">{displayValue}</span></div>;
}

export default function SellerInsightsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState("loading");
      setError("");
      try {
        const response = await fetch("/api/seller/analytics", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) {
          window.location.assign("/seller/login");
          return;
        }
        if (!response.ok) {
          throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to load seller insights.");
        }
        const parsed = parseAnalytics(payload);
        if (!parsed) throw new Error("The analytics response was incomplete. Please refresh and try again.");
        if (controller.signal.aborted) return;
        setAnalytics(parsed);
        setState("ready");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load seller insights.");
        setState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [refreshKey]);

  const platformRows = Object.entries(analytics?.contacts.periodByPlatform ?? {}).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  const orderRows = Object.entries(analytics?.orders.period.byStatus ?? {}).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);

  return (
    <main className="min-h-dvh bg-[var(--rm-page)] pb-10">
      <header className="sticky top-0 z-40 border-b border-[var(--rm-border)] bg-[var(--rm-surface)]">
        <div className="rm-container flex min-h-[66px] items-center justify-between gap-3">
          <Link href="/seller" className="flex min-w-0 items-center gap-2.5" aria-label="ReMarket seller dashboard">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--rm-coral)] text-white"><ShoppingBag className="h-5 w-5" /></span>
            <span><span className="block text-sm font-extrabold text-[var(--rm-ink)]">ReMarket</span><span className="block text-[10px] text-[var(--rm-muted)]">Seller workspace</span></span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Seller workspace">
            <Link href="/seller" className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--rm-text)] hover:bg-[var(--rm-surface-muted)]">Overview</Link>
            <Link href="/seller#products-section" className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--rm-text)] hover:bg-[var(--rm-surface-muted)]">Products</Link>
            <Link href="/seller/orders" className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--rm-text)] hover:bg-[var(--rm-surface-muted)]">Orders</Link>
            <Link href="/seller/payout-settings" className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--rm-text)] hover:bg-[var(--rm-surface-muted)]">Payouts & delivery</Link>
            <span aria-current="page" className="rounded-lg bg-[var(--rm-coral-soft)] px-3 py-2 text-xs font-bold text-[var(--rm-coral-dark)]">Insights</span>
          </nav>
          <div className="flex items-center gap-2"><NotificationBell /><Link href="/seller" className="rm-button rm-button-secondary min-h-10 px-3"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Dashboard</span></Link></div>
        </div>
      </header>

      <div className="rm-container py-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--rm-coral-dark)]">Seller performance</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--rm-ink)] sm:text-3xl">Insights</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--rm-muted)]">Understand how buyers discover your store and interact with your listings.</p>
          </div>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={state === "loading"} className="rm-button rm-button-secondary min-h-10 self-start sm:self-auto"><RefreshCw className={`h-4 w-4 ${state === "loading" ? "animate-spin" : ""}`} />Refresh insights</button>
        </div>

        {state === "loading" && <div className="rm-panel flex min-h-56 items-center justify-center gap-3 text-sm text-[var(--rm-muted)]" role="status"><RefreshCw className="h-5 w-5 animate-spin text-[var(--rm-coral)]" />Loading your insights…</div>}
        {state === "error" && <section className="rm-panel p-6" role="alert"><h2 className="text-base font-bold text-[var(--rm-ink)]">Insights could not be loaded</h2><p className="mt-2 text-sm text-[var(--rm-muted)]">{error}</p><button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="rm-button rm-button-primary mt-4">Try again</button></section>}

        {state === "ready" && analytics && <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface)] px-4 py-3">
            <p className="text-xs font-semibold text-[var(--rm-ink)]">{analytics.business.name}</p>
            <p className="text-[11px] text-[var(--rm-muted)]">Reporting period: {formatDate(analytics.period.from)} – {formatDate(analytics.period.to)} · Africa/Lagos</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard title="Store views" value={formatMetric(analytics.views.period)} description={`${formatMetric(analytics.views.uniqueVisitorsPeriod)} unique visitors in this period`} icon={<Eye className="h-5 w-5" />} />
            <SummaryCard title="Contact activity" value={formatMetric(analytics.contacts.period)} description="Recorded contact clicks in this period" icon={<Activity className="h-5 w-5" />} />
            <SummaryCard title="Contact rate" value={`${analytics.contacts.periodContactRate.toFixed(2)}%`} description="Contact clicks per 100 store views" icon={<Users className="h-5 w-5" />} />
            <SummaryCard title="Orders" value={formatMetric(analytics.orders.period.total)} description="Seller order records in this period; not confirmed revenue" icon={<ShoppingBag className="h-5 w-5" />} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="rm-panel p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[var(--rm-coral)]" /><h2 className="text-sm font-extrabold text-[var(--rm-ink)]">Store activity</h2></div>
              <MetricLine label="All-time store views" value={analytics.views.allTime} />
              <MetricLine label="All-time unique visitors" value={analytics.views.uniqueVisitorsAllTime} />
              <MetricLine label="All-time contact activity" value={analytics.contacts.allTime} />
              <MetricLine label="All-time contact rate" value={`${analytics.contacts.allTimeContactRate.toFixed(2)}%`} />
              <p className="mt-3 rounded-lg bg-[var(--rm-surface-muted)] p-3 text-[11px] leading-5 text-[var(--rm-muted)]">{analytics.contacts.contactRateDefinition}</p>
            </section>

            <section className="rm-panel p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-[var(--rm-coral)]" /><h2 className="text-sm font-extrabold text-[var(--rm-ink)]">How buyers contacted you</h2></div>
              {platformRows.length ? platformRows.map(([platform, count]) => <MetricLine key={platform} label={prettyStatus(platform)} value={count} />) : <p className="rounded-lg bg-[var(--rm-surface-muted)] p-3 text-xs text-[var(--rm-muted)]">No contact activity has been recorded for this period.</p>}
            </section>

            <section className="rm-panel p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-[var(--rm-coral)]" /><h2 className="text-sm font-extrabold text-[var(--rm-ink)]">Products and inventory</h2></div>
              <MetricLine label="Non-deleted products" value={analytics.products.total} />
              <MetricLine label="Active products" value={analytics.products.active} />
              <MetricLine label="Inactive products" value={analytics.products.inactive} />
              <MetricLine label="Pending products" value={analytics.products.pending} />
              <MetricLine label="Tracked products" value={analytics.inventory.trackedProducts} />
              <MetricLine label="Products without stock tracking" value={analytics.inventory.untrackedProducts} />
              <MetricLine label="Out-of-stock products" value={analytics.inventory.outOfStockProducts} />
              <MetricLine label="Tracked units remaining" value={analytics.inventory.totalTrackedUnits} />
            </section>

            <section className="rm-panel p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-[var(--rm-coral)]" /><h2 className="text-sm font-extrabold text-[var(--rm-ink)]">Order activity</h2></div>
              <MetricLine label="Orders in this period" value={analytics.orders.period.total} />
              <MetricLine label="All-time orders" value={analytics.orders.allTime.total} />
              {orderRows.length ? orderRows.map(([status, count]) => <MetricLine key={status} label={prettyStatus(status)} value={count} />) : <p className="mt-2 text-xs text-[var(--rm-muted)]">No orders were recorded in this reporting period.</p>}
              <p className="mt-3 rounded-lg bg-[var(--rm-surface-muted)] p-3 text-[11px] leading-5 text-[var(--rm-muted)]">{analytics.orders.financialStatus} Revenue, payment confirmation, seller proceeds and payout status are deliberately not inferred from order counts.</p>
            </section>
          </div>

          <div className="mt-5 flex flex-wrap gap-2"><Link href="/seller#products-section" className="rm-button rm-button-secondary">Manage products</Link><Link href="/seller/orders" className="rm-button rm-button-secondary">View orders</Link><Link href="/seller/payout-settings" className="rm-button rm-button-secondary">Payouts & delivery</Link></div>
        </>}
      </div>
    </main>
  );
}
