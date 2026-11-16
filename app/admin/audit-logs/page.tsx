"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  FileClock,
  LayoutDashboard,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";

type AuditAdmin = {
  id: string;
  name: string | null;
  email: string | null;
};

type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  beforeData: unknown;
  afterData: unknown;
  metadata: unknown;
  createdAt: string;
  admin: AuditAdmin;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type AuditResponse = {
  success: boolean;
  entries: AuditEntry[];
  pagination: Pagination;
  error?: string;
};

type Filters = {
  search: string;
  action: string;
  entityType: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  action: "",
  entityType: "",
  from: "",
  to: "",
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) return "No data recorded";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unable to display this data";
  }
}

function displayName(admin: AuditAdmin) {
  return admin.name?.trim() || admin.email || "Unknown Admin";
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCurrentPage(entries: AuditEntry[]) {
  if (!entries.length) return;

  const rows = [
    [
      "Date",
      "Admin",
      "Admin email",
      "Action",
      "Entity type",
      "Entity ID",
      "Reason",
    ],
    ...entries.map((entry) => [
      formatDate(entry.createdAt),
      displayName(entry.admin),
      entry.admin.email ?? "",
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.reason ?? "",
    ]),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `remarket-audit-logs-page-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function DetailBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="min-w-0 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-3">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#6F625A]">
        {title}
      </h4>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs leading-5 text-[#40352F]">
        {formatJson(value)}
      </pre>
    </section>
  );
}

export default function AdminAuditLogsPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const updateDraft = useCallback(
    (key: keyof Filters, value: string) => {
      setDraftFilters((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadAuditLogs() {
      setLoading(true);
      setError(null);

      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value.trim()) query.set(key, value.trim());
      });

      try {
        const response = await fetch(`/api/admin/audit-logs?${query.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        const payload = (await response.json()) as AuditResponse;

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Unable to load audit history.");
        }

        setEntries(Array.isArray(payload.entries) ? payload.entries : []);
        setPagination(
          payload.pagination ?? {
            page,
            pageSize,
            total: 0,
            totalPages: 0,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        );
        setExpandedId(null);

        if (payload.pagination?.totalPages && page > payload.pagination.totalPages) {
          setPage(payload.pagination.totalPages);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Something went wrong while loading audit history.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAuditLogs();
    return () => controller.abort();
  }, [page, pageSize, appliedFilters, refreshKey]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  }

  const hasActiveFilters = Object.values(appliedFilters).some((value) => value.trim());
  const firstRecord = pagination.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(page * pageSize, pagination.total);

  return (
    <div className="min-h-screen bg-[#FAF6EF] text-[#2E241F]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[#EAE6DF] bg-[#FFFDFC] lg:flex lg:flex-col">
        <div className="border-b border-[#EAE6DF] px-6 py-6">
          <Link href="/admin" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
              <ShieldCheck size={21} />
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight">ReMarket</span>
              <span className="block text-xs font-medium text-[#8B7D73]">Admin workspace</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-6">
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[#74675E] transition hover:bg-[#FFF3EC] hover:text-[#9F2D18]"
          >
            <LayoutDashboard size={18} /> Overview
          </Link>
          <Link
            href="/admin/orders"
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-[#74675E] transition hover:bg-[#FFF3EC] hover:text-[#9F2D18]"
          >
            <ShoppingBag size={18} /> Orders
          </Link>
          <Link
            href="/admin/audit-logs"
            aria-current="page"
            className="flex items-center gap-3 rounded-xl bg-[#FFF0E8] px-4 py-3 text-sm font-bold text-[#9F2D18]"
          >
            <FileClock size={18} /> Audit logs
          </Link>
        </nav>

        <div className="border-t border-[#EAE6DF] px-6 py-4 text-xs leading-5 text-[#8B7D73]">
          Administrative activity is recorded for accountability and review.
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-[#EAE6DF] bg-[#FFFDFC]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18] lg:hidden">
                <ShieldCheck size={19} />
              </span>
              <div>
                <p className="text-sm font-bold">Admin workspace</p>
                <p className="text-xs text-[#8B7D73]">ReMarket operations</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-semibold text-[#74675E]">
              <ShieldCheck size={15} className="text-[#9F2D18]" /> Admin access
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#9F2D18]">
                <FileClock size={14} /> System records
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Admin audit logs</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#786B62]">
                Review administrative actions, who performed them, when they happened, and the recorded changes.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-sm font-semibold text-[#40352F] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => exportCurrentPage(entries)}
                disabled={!entries.length || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#E94C2B] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowDownToLine size={16} /> Export current page
              </button>
            </div>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4">
              <p className="text-xs font-semibold text-[#8B7D73]">Matching audit events</p>
              <p className="mt-2 text-2xl font-extrabold tabular-nums">{loading ? "—" : pagination.total.toLocaleString("en-NG")}</p>
            </div>
            <div className="rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4">
              <p className="text-xs font-semibold text-[#8B7D73]">Showing on this page</p>
              <p className="mt-2 text-2xl font-extrabold tabular-nums">{loading ? "—" : entries.length.toLocaleString("en-NG")}</p>
            </div>
            <div className="rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4">
              <p className="text-xs font-semibold text-[#8B7D73]">Current page</p>
              <p className="mt-2 text-2xl font-extrabold tabular-nums">{loading ? "—" : `${pagination.totalPages ? page : 0} / ${pagination.totalPages}`}</p>
            </div>
          </div>

          <form onSubmit={applyFilters} className="mb-6 rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal size={17} className="text-[#9F2D18]" />
              <h2 className="text-sm font-extrabold">Search and filter records</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <label className="sm:col-span-2 xl:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-[#6F625A]">Search logs</span>
                <span className="flex items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 focus-within:border-[#FF8A70]">
                  <Search size={16} className="shrink-0 text-[#9A8C82]" />
                  <input
                    value={draftFilters.search}
                    onChange={(event) => updateDraft("search", event.target.value)}
                    placeholder="Action, reason, Admin or entity ID"
                    maxLength={200}
                    className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#A99D94]"
                  />
                </span>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#6F625A]">Action</span>
                <input
                  value={draftFilters.action}
                  onChange={(event) => updateDraft("action", event.target.value)}
                  placeholder="e.g. ORDER_CANCELLED_BY_ADMIN"
                  maxLength={100}
                  className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3 text-sm outline-none transition focus:border-[#FF8A70]"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#6F625A]">Entity type</span>
                <select
                  value={draftFilters.entityType}
                  onChange={(event) => updateDraft("entityType", event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3 text-sm outline-none transition focus:border-[#FF8A70]"
                >
                  <option value="">All entity types</option>
                  <option value="ORDER">Order</option>
                  <option value="SELLER_ORDER">Seller order</option>
                  <option value="PRODUCT">Product</option>
                  <option value="SELLER">Seller</option>
                  <option value="BUYER">Buyer</option>
                  <option value="PAYMENT">Payment</option>
                  <option value="DELIVERY">Delivery</option>
                  <option value="PROMOTION">Promotion</option>
                  <option value="SETTINGS">Settings</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[#6F625A]">From</span>
                  <input
                    type="date"
                    value={draftFilters.from}
                    onChange={(event) => updateDraft("from", event.target.value)}
                    className="h-11 w-full min-w-0 rounded-xl border border-[#EAE6DF] bg-white px-2 text-xs outline-none transition focus:border-[#FF8A70]"
                  />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[#6F625A]">To</span>
                  <input
                    type="date"
                    value={draftFilters.to}
                    onChange={(event) => updateDraft("to", event.target.value)}
                    min={draftFilters.from || undefined}
                    className="h-11 w-full min-w-0 rounded-xl border border-[#EAE6DF] bg-white px-2 text-xs outline-none transition focus:border-[#FF8A70]"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#9F2D18] px-4 text-sm font-bold text-white transition hover:bg-[#842411]"
              >
                <Search size={15} /> Apply filters
              </button>
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters && !Object.values(draftFilters).some((value) => value.trim())}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 text-sm font-semibold text-[#6F625A] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <X size={15} /> Clear
              </button>
              {hasActiveFilters && (
                <span className="text-xs font-medium text-[#8B7D73]">Filters are applied to the audit history.</span>
              )}
            </div>
          </form>

          <section className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC]">
            <div className="flex flex-col gap-2 border-b border-[#EAE6DF] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-base font-extrabold">Activity history</h2>
                <p className="mt-1 text-xs text-[#8B7D73]">
                  {loading ? "Loading records…" : pagination.total ? `Showing ${firstRecord.toLocaleString("en-NG")}–${lastRecord.toLocaleString("en-NG")} of ${pagination.total.toLocaleString("en-NG")}` : "No matching records"}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-[#74675E]">
                Rows per page
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-9 rounded-lg border border-[#EAE6DF] bg-white px-2 text-sm text-[#2E241F] outline-none focus:border-[#FF8A70]"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            </div>

            {error && !loading && (
              <div className="m-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 text-sm text-red-800">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-800 hover:bg-red-100"
                >
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            )}

            {loading ? (
              <div className="space-y-3 p-4 sm:p-5">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-xl bg-[#F3EEE7]" />
                ))}
              </div>
            ) : error ? null : entries.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]">
                  <FileClock size={22} />
                </span>
                <h3 className="mt-4 text-sm font-extrabold">No audit records found</h3>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#8B7D73]">
                  Administrative actions will appear here when they are recorded. Try changing or clearing your filters.
                </p>
                {hasActiveFilters && (
                  <button type="button" onClick={clearFilters} className="mt-4 text-sm font-bold text-[#9F2D18] hover:underline">
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#EEE8E1]">
                {entries.map((entry) => {
                  const expanded = expandedId === entry.id;

                  return (
                    <article key={entry.id} className="px-4 py-4 transition hover:bg-[#FFFEFC] sm:px-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]">
                            <FileClock size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="break-all text-sm font-extrabold text-[#2E241F]">{entry.action.replaceAll("_", " ")}</h3>
                              <span className="rounded-full bg-[#F5EDE5] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#755E50]">
                                {entry.entityType.replaceAll("_", " ")}
                              </span>
                            </div>
                            <p className="mt-1 break-all text-xs text-[#786B62]">Entity ID: {entry.entityId}</p>
                            {entry.reason && (
                              <p className="mt-2 text-sm leading-5 text-[#51453E]">{entry.reason}</p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#8B7D73]">
                              <span className="inline-flex items-center gap-1.5">
                                <UserRound size={14} /> {displayName(entry.admin)}
                              </span>
                              {entry.admin.email && <span className="break-all">{entry.admin.email}</span>}
                              <span className="inline-flex items-center gap-1.5">
                                <Clock3 size={14} /> {formatDate(entry.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : entry.id)}
                          aria-expanded={expanded}
                          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-[#EAE6DF] bg-white px-3 text-xs font-bold text-[#6F625A] transition hover:border-[#FFB19E] hover:text-[#9F2D18]"
                        >
                          {expanded ? "Hide details" : "View details"}
                          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>
                      </div>

                      {expanded && (
                        <div className="mt-4 grid gap-3 border-t border-[#EEE8E1] pt-4 lg:grid-cols-3">
                          <DetailBlock title="Before" value={entry.beforeData} />
                          <DetailBlock title="After" value={entry.afterData} />
                          <DetailBlock title="Metadata" value={entry.metadata} />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-[#EAE6DF] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-[#8B7D73]">
                Page {pagination.totalPages ? page : 0} of {pagination.totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={!pagination.hasPreviousPage || loading}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#EAE6DF] bg-white px-3 text-xs font-bold text-[#51453E] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={15} /> Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!pagination.hasNextPage || loading}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#EAE6DF] bg-white px-3 text-xs font-bold text-[#51453E] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-[#EAE6DF] bg-[#FFFDFC] px-2 py-2 lg:hidden">
        <Link href="/admin" className="flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-semibold text-[#8B7D73]">
          <LayoutDashboard size={18} /> Overview
        </Link>
        <Link href="/admin/orders" className="flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-semibold text-[#8B7D73]">
          <ShoppingBag size={18} /> Orders
        </Link>
        <Link href="/admin/audit-logs" aria-current="page" className="flex flex-col items-center gap-1 rounded-lg bg-[#FFF0E8] py-2 text-[10px] font-bold text-[#9F2D18]">
          <FileClock size={18} /> Audit logs
        </Link>
      </nav>
    </div>
  );
}
