"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownUp,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  ClipboardList,
  ExternalLink,
  Filter,
  LayoutDashboard,
  MapPin,
  Megaphone,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
  Trash2,
  UserRound,
  X,
  Loader2,
  LucideIcon
} from "lucide-react";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";
type FilterStatus = "ALL" | RequestStatus;
type SortOrder = "NEWEST" | "OLDEST";

type DeletionRequest = {
  id: string;
  businessId: string;
  requestedById: string;
  reason: string | null;
  status: RequestStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  business: {
    id: string;
    name: string;
    ownerId: string | null;
    ownerName: string | null;
    status: "ACTIVE" | "INACTIVE" | "PENDING";
    verification: "UNVERIFIED" | "VERIFIED";
    deletedAt: string | null;
    location: { id: string; area: string } | null;
  };
  requestedBy: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  };
  reviewedBy: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
};

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Content", href: "/admin/content", icon: Megaphone },
  { label: "Deletion requests", href: "/admin/business-deletion-requests", icon: Trash2 },
];

const FILTERS: { label: string; value: FilterStatus; icon: LucideIcon }[] = [
  { label: "All requests", value: "ALL", icon: ClipboardList },
  { label: "Pending", value: "PENDING", icon: Clock3 },
  { label: "Approved", value: "APPROVED", icon: CheckCircle2 },
  { label: "Rejected", value: "REJECTED", icon: X },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusDetails(status: RequestStatus) {
  switch (status) {
    case "PENDING":
      return {
        label: "Awaiting review",
        className: "border-amber-200 bg-amber-50 text-amber-800",
        dotClass: "bg-amber-500",
        icon: Clock3,
      };
    case "APPROVED":
      return {
        label: "Approved",
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        dotClass: "bg-emerald-500",
        icon: CheckCircle2,
      };
    case "REJECTED":
      return {
        label: "Rejected",
        className: "border-rose-200 bg-rose-50 text-rose-800",
        dotClass: "bg-rose-500",
        icon: X,
      };
  }
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone: "coral" | "amber" | "green" | "slate";
}) {
  const tones = {
    coral: "bg-[#FFF0E8] text-[#A83B24] ring-[#F6D5CA]",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <div className="group min-w-0 rounded-2xl border border-[#E8E0D7] bg-white p-4 shadow-[0_2px_10px_rgba(36,31,27,0.025)] transition duration-200 hover:-translate-y-0.5 hover:border-[#F0C5B8] hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#82776D]">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-[#1B2730] tabular-nums">{value.toLocaleString("en-NG")}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[#9A8F85]">{hint}</p>
    </div>
  );
}

export default function BusinessDeletionRequestsPage() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("NEWEST");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadRequests = useCallback(async (signal?: AbortSignal, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      // Load the complete request queue once so the summary metrics and filters
      // are based on the same dataset. The existing endpoint remains unchanged.
      const response = await fetch("/api/admin/business-deletion-requests", {
        method: "GET",
        cache: "no-store",
        signal,
      });

      const data: unknown = await response.json();

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/admin/login";
        return;
      }

      const record = data && typeof data === "object" && !Array.isArray(data)
        ? data as Record<string, unknown>
        : null;

      if (!response.ok) {
        throw new Error(
          typeof record?.error === "string"
            ? record.error
            : "Unable to load deletion requests."
        );
      }

      setRequests(Array.isArray(record?.requests) ? record.requests as DeletionRequest[] : []);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      console.error("Deletion request page load error:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load deletion requests.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadRequests(controller.signal);
    return () => controller.abort();
  }, [loadRequests]);

  const counts = useMemo(() => ({
    ALL: requests.length,
    PENDING: requests.filter((item) => item.status === "PENDING").length,
    APPROVED: requests.filter((item) => item.status === "APPROVED").length,
    REJECTED: requests.filter((item) => item.status === "REJECTED").length,
  }), [requests]);

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return requests
      .filter((request) => filter === "ALL" || request.status === filter)
      .filter((request) => {
        if (!normalizedQuery) return true;
        const searchable = [
          request.business.name,
          request.business.ownerName,
          request.business.location?.area,
          request.requestedBy.name,
          request.requestedBy.email,
          request.reason,
          request.status,
        ].filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "NEWEST" ? dateB - dateA : dateA - dateB;
      });
  }, [requests, filter, query, sortOrder]);

  async function reviewRequest(requestId: string, nextStatus: "APPROVED" | "REJECTED") {
    const request = requests.find((item) => item.id === requestId);
    if (!request || request.status !== "PENDING" || reviewingId) return;

    const actionLabel = nextStatus === "APPROVED" ? "approve" : "reject";
    const confirmation = nextStatus === "APPROVED"
      ? `Approve the deletion request for "${request.business.name}"? This will soft-delete the business and remove it from public discovery.`
      : `Reject the deletion request for "${request.business.name}"? The business will remain unchanged.`;

    if (!window.confirm(confirmation)) return;

    setReviewingId(requestId);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/business-deletion-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, status: nextStatus }),
      });
      const data: unknown = await response.json();
      const record = data && typeof data === "object" && !Array.isArray(data)
        ? data as Record<string, unknown>
        : null;

      if (response.status === 401 || response.status === 403) {
        window.location.href = "/admin/login";
        return;
      }
      if (!response.ok) {
        throw new Error(typeof record?.error === "string" ? record.error : `Unable to ${actionLabel} the deletion request.`);
      }

      setSuccess(nextStatus === "APPROVED"
        ? `Deletion approved for ${request.business.name}. The business was soft-deleted.`
        : `Deletion request for ${request.business.name} was rejected.`);
      await loadRequests(undefined, true);
    } catch (reviewError) {
      console.error("Deletion request review error:", reviewError);
      setError(reviewError instanceof Error ? reviewError.message : `Unable to ${actionLabel} the deletion request.`);
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F5F1EB] text-[#1B2730]">
      <div className="flex min-h-dvh w-full">
        {/* Full-height desktop navigation */}
        <aside className="sticky top-0 hidden h-dvh w-[238px] shrink-0 flex-col border-r border-white/10 bg-[#17242D] text-white lg:flex">
          <Link href="/admin" className="flex h-[78px] items-center gap-3 border-b border-white/10 px-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#FF6547] text-lg font-black shadow-lg shadow-[#FF6547]/20">R</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-black tracking-tight">ReMarket</span>
              <span className="mt-0.5 block text-[10px] font-medium tracking-[0.16em] text-white/45">ADMIN WORKSPACE</span>
            </span>
          </Link>
          <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Admin navigation">
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Workspace</p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin/business-deletion-requests";
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition ${active ? "bg-[#FF6547] text-white shadow-lg shadow-black/10" : "text-white/65 hover:bg-white/[0.07] hover:text-white"}`}>
                  <Icon className="h-[17px] w-[17px] shrink-0" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {active && <ArrowRight className="h-3.5 w-3.5" />}
                </Link>
              );
            })}
          </nav>
          <div className="m-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-center gap-2 text-[#FF9D85]"><ShieldAlert className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.12em]">Trust & safety</span></div>
            <p className="mt-2 text-xs leading-5 text-white/55">Review merchant requests carefully. Approved requests soft-delete the business but keep its record.</p>
          </div>
          <div className="border-t border-white/10 px-6 py-4 text-[10px] font-medium text-white/30">ReMarket · Merchant operations</div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex min-h-[68px] items-center justify-between gap-3 border-b border-[#E5DDD4] bg-[#FFFDFC]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" aria-label="Back to admin" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8E0D7] bg-white text-[#62584F] lg:hidden"><ArrowRight className="h-4 w-4 rotate-180" /></Link>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9B8F84]">Merchant operations / Trust desk</p>
                <h1 className="truncate text-base font-black tracking-tight sm:text-lg">Business deletion requests</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href="/" className="hidden items-center gap-2 rounded-xl border border-[#E8E0D7] bg-white px-3.5 py-2.5 text-xs font-bold text-[#62584F] transition hover:border-[#F0B7A8] sm:inline-flex"><ExternalLink className="h-3.5 w-3.5" /> Marketplace</Link>
              <button type="button" onClick={() => void loadRequests(undefined, true)} disabled={refreshing || loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#17242D] px-3.5 text-xs font-bold text-white transition hover:bg-[#253843] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh queue</span><span className="sm:hidden">Refresh</span>
              </button>
            </div>
          </header>

          <div className="mx-auto w-full max-w-[1800px] px-4 pb-10 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
            {/* Compact horizontal navigation for tablet and mobile */}
            <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden" aria-label="Admin navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/business-deletion-requests";
                return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-bold transition ${active ? "bg-[#FF6547] text-white shadow-sm" : "border border-[#E8E0D7] bg-white text-[#6F655C] hover:border-[#F0B7A8]"}`}><Icon className="h-3.5 w-3.5" />{item.label}</Link>;
              })}
            </nav>

            {/* Distinctive queue header */}
            <section className="relative isolate overflow-hidden rounded-[26px] bg-[#17242D] text-white shadow-[0_12px_40px_rgba(23,36,45,0.12)]">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border-[36px] border-[#FF6547]/15" />
              <div aria-hidden="true" className="pointer-events-none absolute right-28 top-24 h-24 w-24 rounded-full bg-[#FF6547]/10 blur-2xl" />
              <div className="relative grid gap-7 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:p-9">
                <div className="min-w-0 max-w-3xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/75"><span className="h-1.5 w-1.5 rounded-full bg-[#FF8A6F]" /> Trust desk <span className="text-white/30">/</span> Review queue</div>
                  <h2 className="mt-4 text-2xl font-black leading-tight tracking-tight sm:text-3xl lg:text-[38px]">Every request deserves<br className="hidden sm:block" /> a careful review.</h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-white/60">Review seller requests to remove a business from ReMarket. Check the reason, confirm the business, and record a clear decision.</p>
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-white/55">
                    <span className="inline-flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5 text-[#FF9A82]" /> Approval soft-deletes the business</span>
                    <span className="inline-flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-[#FF9A82]" /> Existing record is retained</span>
                  </div>
                </div>
                <div className="flex items-end justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 sm:min-w-[190px] lg:min-w-[215px] lg:flex-col lg:items-start lg:p-5">
                  <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">Requests in queue</p><p className="mt-1 text-4xl font-black tabular-nums">{loading ? "—" : counts.ALL.toLocaleString("en-NG")}</p></div>
                  <div className="flex items-center gap-2 rounded-full bg-[#FF6547]/15 px-3 py-1.5 text-[10px] font-bold text-[#FFB29F]"><Clock3 className="h-3.5 w-3.5" /> {counts.PENDING} pending</div>
                </div>
              </div>
            </section>

            {success && <div role="status" className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 flex-1 font-semibold">{success}</p><button type="button" onClick={() => setSuccess("")} aria-label="Dismiss success message"><X className="h-4 w-4" /></button></div>}
            {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p className="font-bold">We couldn't complete that action</p><p className="mt-0.5 text-xs leading-5">{error}</p></div><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}

            {/* Live summary */}
            <section className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4 sm:gap-4" aria-label="Request summary">
              <StatCard label="All requests" value={counts.ALL} hint="All submitted deletion requests" icon={ClipboardList} tone="slate" />
              <StatCard label="Awaiting review" value={counts.PENDING} hint="Requests still needing a decision" icon={Clock3} tone="amber" />
              <StatCard label="Approved" value={counts.APPROVED} hint="Requests approved by an admin" icon={CheckCircle2} tone="green" />
              <StatCard label="Rejected" value={counts.REJECTED} hint="Requests declined by an admin" icon={X} tone="coral" />
            </section>

            {/* Search and filter workspace */}
            <section className="mt-7" aria-label="Filter requests">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[#9F3F29]"><Filter className="h-4 w-4" /><p className="text-[10px] font-black uppercase tracking-[0.16em]">Queue controls</p></div>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-[#1B2730]">Review the queue</h2>
                  <p className="mt-1 text-xs leading-5 text-[#897E74]">Search by business, seller, location or reason. Choose a status to narrow the list.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_170px] xl:w-[510px] xl:shrink-0">
                  <label className="relative block min-w-0">
                    <span className="sr-only">Search requests</span><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A8F85]" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search requests..." className="h-11 w-full rounded-xl border border-[#E4DBD1] bg-white pl-10 pr-3 text-sm outline-none transition placeholder:text-[#B0A59A] focus:border-[#F28B72] focus:ring-4 focus:ring-[#FF6547]/10" />
                  </label>
                  <label className="relative block">
                    <span className="sr-only">Sort requests</span><ArrowDownUp className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A8F85]" />
                    <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)} className="h-11 w-full appearance-none rounded-xl border border-[#E4DBD1] bg-white pl-10 pr-3 text-xs font-bold text-[#51483F] outline-none focus:border-[#F28B72] focus:ring-4 focus:ring-[#FF6547]/10"><option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option></select>
                  </label>
                </div>
              </div>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {FILTERS.map((item) => {
                  const Icon = item.icon;
                  const active = filter === item.value;
                  return <button key={item.value} type="button" onClick={() => setFilter(item.value)} aria-pressed={active} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition ${active ? "border-[#17242D] bg-[#17242D] text-white shadow-sm" : "border-[#E4DBD1] bg-white text-[#6F655C] hover:border-[#F0B7A8] hover:text-[#9F3F29]"}`}><Icon className="h-3.5 w-3.5" />{item.label}<span className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-white/15 text-white" : "bg-[#F5F1EB] text-[#7C7167]"}`}>{counts[item.value]}</span></button>;
                })}
                {(query || filter !== "ALL") && <button type="button" onClick={() => { setQuery(""); setFilter("ALL"); }} className="inline-flex shrink-0 items-center gap-1.5 px-2 text-xs font-bold text-[#9F3F29] hover:underline"><X className="h-3.5 w-3.5" />Clear</button>}
              </div>
            </section>

            {/* Responsive request cards */}
            <section className="mt-5" aria-label="Deletion request results">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-[#796F65]">Showing <span className="font-black text-[#1B2730]">{loading ? "—" : filteredRequests.length}</span> of {loading ? "—" : requests.length} requests</p>
                <span className="hidden items-center gap-1.5 text-[10px] font-semibold text-[#9A8F85] sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#FF8D72]" /> Updates after each decision</span>
              </div>

              {loading ? (
                <div className="grid gap-4 2xl:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl border border-[#E6DED5] bg-white" />)}</div>
              ) : filteredRequests.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[#DCCFC2] bg-white px-5 py-14 text-center sm:py-16">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#A83B24]"><Search className="h-6 w-6" /></div>
                  <h3 className="mt-4 text-base font-black text-[#1B2730]">{requests.length === 0 ? "Your queue is clear" : "No matching requests"}</h3>
                  <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-[#8F847A]">{requests.length === 0 ? "There are no business deletion requests at the moment. New submissions will appear here." : "Try another search term or clear the selected filters to see more requests."}</p>
                  {(query || filter !== "ALL") && <button type="button" onClick={() => { setQuery(""); setFilter("ALL"); }} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#17242D] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#253843]">Clear filters <ArrowRight className="h-3.5 w-3.5" /></button>}
                </div>
              ) : (
                <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-2">
                  {filteredRequests.map((request) => {
                    const status = statusDetails(request.status);
                    const StatusIcon = status.icon;
                    const isReviewing = reviewingId === request.id;
                    const sellerName = request.requestedBy.name?.trim() || request.business.ownerName?.trim() || "Seller name unavailable";
                    return (
                      <article key={request.id} className="group min-w-0 overflow-hidden rounded-[22px] border border-[#E5DDD3] bg-white shadow-[0_3px_14px_rgba(36,31,27,0.025)] transition duration-200 hover:border-[#EFC2B5] hover:shadow-[0_12px_32px_rgba(36,31,27,0.07)]">
                        <div className="flex items-start gap-3 border-b border-[#F0EAE3] bg-gradient-to-r from-white to-[#FFFCF9] p-4 sm:p-5">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#FFF0E8] text-[#A83B24] ring-1 ring-[#F7D8CE]"><Store className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.className}`}><StatusIcon className="h-3 w-3" />{status.label}</span>
                              {request.business.deletedAt && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600"><Trash2 className="h-3 w-3" />Already deleted</span>}
                            </div>
                            <h3 className="mt-2 break-words text-base font-black leading-6 tracking-tight text-[#1B2730] sm:text-lg">{request.business.name}</h3>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#8A8076]">
                              <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{request.business.location?.area || "Location not set"}</span>
                              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDate(request.createdAt)}</span>
                            </div>
                          </div>
                          <Link href={`/admin/businesses/${request.business.id}`} aria-label={`View ${request.business.name}`} className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-[#E7DED5] bg-white px-3 py-2 text-[10px] font-bold text-[#62584F] transition hover:border-[#F0B7A8] hover:text-[#9F3F29] sm:inline-flex">View <ExternalLink className="h-3 w-3" /></Link>
                        </div>

                        <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:p-5">
                          <div className="min-w-0 rounded-2xl bg-[#F8F5F0] p-3.5 sm:p-4">
                            <div className="flex items-center gap-2 text-[#8A7D72]"><UserRound className="h-3.5 w-3.5" /><p className="text-[10px] font-black uppercase tracking-[0.14em]">Requested by</p></div>
                            <p className="mt-2 break-words text-sm font-bold text-[#293640]">{sellerName}</p>
                            <p className="mt-1 break-all text-[11px] leading-5 text-[#8A8076]">{request.requestedBy.email}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              <span className="rounded-md border border-[#E6DDD3] bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#7D7166]">{request.requestedBy.role}</span>
                              <span className={`rounded-md px-2 py-1 text-[9px] font-bold ${request.business.verification === "VERIFIED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{request.business.verification}</span>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9A8F85]">Seller's reason</p>
                            <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-[#5F564E]">{request.reason?.trim() || "No reason was provided with this request."}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[#9A8F85]">
                              <span className="rounded-lg bg-[#F5F1EB] px-2.5 py-1.5 font-semibold">Business status: {request.business.status}</span>
                              <span className="rounded-lg bg-[#F5F1EB] px-2.5 py-1.5 font-semibold">Role: {request.requestedBy.role}</span>
                            </div>
                          </div>
                        </div>

                        {request.status === "PENDING" ? (
                          <div className="flex flex-col gap-3 border-t border-[#F0EAE3] bg-[#FFFCF9] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <p className="max-w-md text-[10px] leading-5 text-[#95897E]">Approving will soft-delete this business. Review the request before deciding.</p>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                              <button type="button" disabled={Boolean(reviewingId)} onClick={() => void reviewRequest(request.id, "REJECTED")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50">{isReviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}Reject</button>
                              <button type="button" disabled={Boolean(reviewingId)} onClick={() => void reviewRequest(request.id, "APPROVED")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#FF6547] px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#EB5639] disabled:cursor-wait disabled:opacity-50">{isReviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Approve deletion</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 border-t border-[#F0EAE3] bg-[#FFFCF9] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <p className="text-[11px] leading-5 text-[#81766C]">Reviewed {formatDate(request.reviewedAt)}{request.reviewedBy ? ` by ${request.reviewedBy.name || request.reviewedBy.email}` : ""}</p>
                            <Link href={`/admin/businesses/${request.business.id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#9F3F29] hover:underline sm:justify-end">Open business record <ArrowRight className="h-3.5 w-3.5" /></Link>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <footer className="mt-8 flex flex-col gap-2 border-t border-[#E5DDD4] pt-4 text-[10px] leading-5 text-[#9A8F85] sm:flex-row sm:items-center sm:justify-between">
              <p>ReMarket Trust Desk · Business deletion workflow</p>
              <p className="inline-flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Decisions update the existing business record; they do not permanently erase it.</p>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
