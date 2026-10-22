"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Eye,
  LayoutDashboard,
  MapPin,
  Megaphone,
  Package,
  Phone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Store,
  Trash2,
  Users,
  X,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";

type RequestStatus =
  | "NEW"
  | "MATCHED"
  | "CONTACTED"
  | "FULFILLED"
  | "UNFULFILLED"
  | "CLOSED";

type BusinessMatch = {
  id: string;
  score: number;
  addedManually: boolean;
  business: {
    id: string;
    name: string;
    area: string | null;
    verification: "VERIFIED" | "UNVERIFIED";
    verified: boolean;
    status: "ACTIVE" | "INACTIVE" | "PENDING";
  };
};

type AdminRequest = {
  id: string;
  requestCode: string;
  query: string;
  category: { id: string; name: string } | null;
  budget: number | null;
  locationArea: string | null;
  quantity: number | null;
  description: string | null;
  imageUrl: string | null;
  status: RequestStatus;
  buyerContact: string;
  createdAt: string;
  matches: BusinessMatch[];
};

type FilterStatus = "" | RequestStatus;

const STATUS_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "NEW", label: "New" },
  { value: "MATCHED", label: "Matched" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "UNFULFILLED", label: "Unfulfilled" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "CLOSED", label: "Closed" },
];

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Content", href: "/admin/content", icon: Megaphone },
  { label: "Deletion requests", href: "/admin/business-deletion-requests", icon: Trash2 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStatusClass(status: RequestStatus): string {
  switch (status) {
    case "NEW": return "border-sky-200 bg-sky-50 text-sky-700";
    case "MATCHED": return "border-violet-200 bg-violet-50 text-violet-700";
    case "CONTACTED": return "border-amber-200 bg-amber-50 text-amber-800";
    case "FULFILLED": return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "UNFULFILLED": return "border-rose-200 bg-rose-50 text-rose-700";
    case "CLOSED": return "border-stone-200 bg-stone-100 text-stone-600";
  }
}

function getStatusLabel(status: RequestStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNaira(value: number): string {
  return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(value)}`;
}

function normalizeRequests(value: unknown): AdminRequest[] {
  if (!isRecord(value) || !Array.isArray(value.requests)) return [];
  return value.requests.filter(isRecord).flatMap((raw) => {
    if (
      typeof raw.id !== "string" ||
      typeof raw.requestCode !== "string" ||
      typeof raw.query !== "string" ||
      typeof raw.createdAt !== "string" ||
      typeof raw.buyerContact !== "string" ||
      !["NEW", "MATCHED", "CONTACTED", "FULFILLED", "UNFULFILLED", "CLOSED"].includes(String(raw.status))
    ) return [];

    const category = isRecord(raw.category) && typeof raw.category.id === "string" && typeof raw.category.name === "string"
      ? { id: raw.category.id, name: raw.category.name }
      : null;
    const matches: BusinessMatch[] = Array.isArray(raw.matches)
      ? raw.matches.filter(isRecord).flatMap((match) => {
          const business = isRecord(match.business) ? match.business : null;
          if (!business || typeof match.id !== "string" || typeof business.id !== "string" || typeof business.name !== "string") return [];
          const verification = business.verification === "VERIFIED" ? "VERIFIED" : "UNVERIFIED";
          const businessStatus = business.status === "ACTIVE" || business.status === "INACTIVE" ? business.status : "PENDING";
          return [{
            id: match.id,
            score: typeof match.score === "number" && Number.isFinite(match.score) ? match.score : 0,
            addedManually: match.addedManually === true,
            business: {
              id: business.id,
              name: business.name,
              area: typeof business.area === "string" ? business.area : null,
              verification,
              verified: business.verified === true || verification === "VERIFIED",
              status: businessStatus,
            },
          }];
        })
      : [];

    return [{
      id: raw.id,
      requestCode: raw.requestCode,
      query: raw.query,
      category,
      budget: typeof raw.budget === "number" && Number.isFinite(raw.budget) ? raw.budget : null,
      locationArea: typeof raw.locationArea === "string" ? raw.locationArea : null,
      quantity: typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : null,
      description: typeof raw.description === "string" ? raw.description : null,
      imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
      status: raw.status as RequestStatus,
      buyerContact: raw.buyerContact,
      createdAt: raw.createdAt,
      matches,
    }];
  });
}

function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${getStatusClass(status)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        status === "NEW" ? "bg-sky-500" : status === "MATCHED" ? "bg-violet-500" : status === "CONTACTED" ? "bg-amber-500" : status === "FULFILLED" ? "bg-emerald-500" : status === "UNFULFILLED" ? "bg-rose-500" : "bg-stone-400"
      }`} />
      {getStatusLabel(status)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof ClipboardList;
  tone: "coral" | "blue" | "violet" | "green";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass = {
    coral: "bg-[#FFF0E8] text-[#A83D24]",
    blue: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
    green: "bg-emerald-50 text-emerald-700",
  }[tone];
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}><Icon size={19} /></span>
        <span className="text-2xl font-black tracking-tight text-[#17202A]">{value.toLocaleString("en-NG")}</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#7B7169]">{label}</span>
        {onClick && <ArrowRight size={14} className="text-[#A39A91]" />}
      </div>
    </>
  );
  const className = `w-full rounded-2xl border p-4 text-left transition ${active ? "border-[#FF8F73] bg-[#FFF7F3] shadow-sm" : "border-[#E7DED5] bg-white hover:-translate-y-0.5 hover:border-[#F5B19F] hover:shadow-sm"}`;
  return onClick ? <button type="button" onClick={onClick} className={className}>{content}</button> : <div className={className}>{content}</div>;
}

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<FilterStatus>("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<AdminRequest | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const loadRequests = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (status) params.set("status", status);
      const query = params.toString();
      const response = await fetch(query ? `/api/admin/requests?${query}` : "/api/admin/requests", {
        method: "GET",
        cache: "no-store",
        signal,
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = isRecord(data) && typeof data.error === "string" ? data.error : "Unable to load buyer requests.";
        throw new Error(message);
      }
      if (!isRecord(data) || !Array.isArray(data.requests)) {
        throw new Error("The server returned an invalid requests response.");
      }
      setRequests(normalizeRequests(data));
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      console.error("Admin request load error:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load buyer requests.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, status]);

  useEffect(() => {
    const controller = new AbortController();
    void loadRequests(controller.signal);
    return () => controller.abort();
  }, [loadRequests, refreshKey]);

  const counts = useMemo(() => ({
    all: requests.length,
    fresh: requests.filter((item) => item.status === "NEW").length,
    matched: requests.filter((item) => item.status === "MATCHED").length,
    contacted: requests.filter((item) => item.status === "CONTACTED").length,
    completed: requests.filter((item) => item.status === "FULFILLED").length,
  }), [requests]);

  async function updateStatus(requestId: string, newStatus: RequestStatus) {
    const currentRequest = requests.find((item) => item.id === requestId);
    if (!currentRequest || updatingId) return;
    if (newStatus === "CLOSED" && currentRequest.status !== "CLOSED") {
      const confirmed = window.confirm(`Close request ${currentRequest.requestCode}? You can still view its record afterwards.`);
      if (!confirmed) return;
    }

    setUpdatingId(requestId);
    setError("");
    try {
      const response = await fetch(`/api/admin/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "Unable to update request status.");
      }
      const returned = isRecord(data) && isRecord(data.request) ? normalizeRequests({ requests: [data.request] })[0] : undefined;
      const updated = returned ? { ...currentRequest, ...returned, matches: returned.matches.length ? returned.matches : currentRequest.matches } : { ...currentRequest, status: newStatus };
      setRequests((current) => current.flatMap((item) => {
        if (item.id !== requestId) return [item];
        if (status && updated.status !== status) return [];
        return [updated];
      }));
      setSelectedRequest((current) => current?.id === requestId ? updated : current);
    } catch (updateError) {
      console.error("Admin request status update error:", updateError);
      setError(updateError instanceof Error ? updateError.message : "Unable to update request status.");
    } finally {
      setUpdatingId(null);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDebouncedSearch(search.trim());
    setRefreshKey((value) => value + 1);
  }

  const activeFilter: FilterStatus = status;

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F6F1EA] text-[#17202A]">
      <div className="flex min-h-dvh w-full">
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-[#E8DFD5] bg-[#FFFCF8] lg:flex">
          <div className="flex h-[76px] shrink-0 items-center border-b border-[#E8DFD5] px-6">
            <Link href="/admin" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#FF5A36] text-lg font-black text-white shadow-sm">R</span>
              <span><span className="block text-[17px] font-black tracking-tight">ReMarket</span><span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.17em] text-[#9B9188]">Admin workspace</span></span>
            </Link>
          </div>
          <div className="px-4 pt-6"><p className="px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#A39A91]">Operations</p></div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin/requests";
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition ${active ? "bg-[#FFE4DA] text-[#9F2D18] shadow-sm" : "text-[#6F675F] hover:bg-[#F7F0E8] hover:text-[#17202A]"}`}><Icon size={18} className={active ? "text-[#FF5A36]" : "text-[#92877E] group-hover:text-[#FF5A36]"} /><span className="min-w-0 flex-1">{item.label}</span>{active && <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />}</Link>;
            })}
          </nav>
          <div className="m-4 rounded-2xl bg-[#202D37] p-4 text-white"><div className="flex items-center gap-2 text-[#FFAC95]"><Sparkles size={16} /><span className="text-[10px] font-extrabold uppercase tracking-[0.14em]">Demand signals</span></div><p className="mt-2 text-xs leading-5 text-white/75">Buyer requests show what people are trying to find nearby.</p></div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[66px] items-center justify-between border-b border-[#E8DFD5] bg-[#FFFCF8]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3"><Link href="/admin" aria-label="Back to admin" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8DFD5] bg-white text-[#6F675F] lg:hidden"><LayoutDashboard size={17} /></Link><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#9A8F85]">Admin / Marketplace demand</p><h1 className="truncate text-[15px] font-black sm:text-base">Buyer request desk</h1></div></div>
            <Link href="/" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#E5DCD2] bg-white px-3 py-2 text-[11px] font-bold text-[#665D55] transition hover:border-[#FFB29D] hover:text-[#9F2D18] sm:px-4 sm:text-xs"><Eye size={15} /><span className="hidden sm:inline">View marketplace</span><span className="sm:hidden">Market</span></Link>
          </header>

          <div className="mx-auto w-full max-w-[1760px] px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pt-6 md:px-7 lg:px-9 lg:pb-10">
            <section className="relative isolate overflow-hidden rounded-[26px] bg-[#202D37] p-5 text-white shadow-[0_20px_60px_rgba(27,39,48,0.12)] sm:p-7 xl:p-8">
              <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-24 -z-10 h-72 w-72 rounded-full border-[38px] border-white/[0.045]" />
              <div aria-hidden="true" className="pointer-events-none absolute right-20 top-16 -z-10 h-32 w-32 rounded-full bg-[#FF5A36]/20 blur-3xl" />
              <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl"><div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FFC0AE]"><Sparkles size={13} /> Buyer demand intelligence</div><h2 className="mt-4 text-[clamp(1.8rem,4vw,3.25rem)] font-black leading-[1.04] tracking-[-0.045em]">Turn buyer needs into<br className="hidden sm:block" /> <span className="text-[#FF9275]">real local matches.</span></h2><p className="mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-[15px]">Review what buyers are looking for, track every request, and connect people with businesses that can help.</p></div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[470px] xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-white/55">In this view</p><p className="mt-1 text-2xl font-black">{counts.all}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-white/55">New</p><p className="mt-1 text-2xl font-black text-[#9BD8FA]">{counts.fresh}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-white/55">Matched</p><p className="mt-1 text-2xl font-black text-[#D1B5FF]">{counts.matched}</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 sm:p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-white/55">Fulfilled</p><p className="mt-1 text-2xl font-black text-[#A6E9C4]">{counts.completed}</p></div>
                </div>
              </div>
            </section>

            {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-[#F2C7BC] bg-[#FFF0ED] px-4 py-3.5 text-sm text-[#9F2D18]"><AlertCircle size={18} className="mt-0.5 shrink-0" /><p className="min-w-0 flex-1 font-medium">{error}</p><button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="shrink-0"><X size={17} /></button></div>}

            <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
              <MetricCard label="All results" value={requests.length} icon={ClipboardList} tone="coral" active={!status} onClick={() => setStatus("")} />
              <MetricCard label="New requests" value={counts.fresh} icon={Clock3} tone="blue" active={status === "NEW"} onClick={() => setStatus("NEW")} />
              <MetricCard label="Matched" value={counts.matched} icon={Users} tone="violet" active={status === "MATCHED"} onClick={() => setStatus("MATCHED")} />
              <MetricCard label="Contacted" value={counts.contacted} icon={Phone} tone="coral" active={status === "CONTACTED"} onClick={() => setStatus("CONTACTED")} />
              <MetricCard label="Fulfilled" value={counts.completed} icon={CheckCircle2} tone="green" active={status === "FULFILLED"} onClick={() => setStatus("FULFILLED")} />
            </section>

            <section className="mt-5 rounded-[22px] border border-[#E7DED5] bg-white p-3.5 shadow-[0_4px_22px_rgba(44,35,28,0.03)] sm:p-4">
              <form onSubmit={submitSearch} className="flex flex-col gap-3 lg:flex-row">
                <div className="relative min-w-0 flex-1"><Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A39A91]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search request code, product, buyer contact…" aria-label="Search buyer requests" className="h-12 w-full rounded-xl border border-[#EAE2D9] bg-[#FCFAF7] pl-10 pr-10 text-sm outline-none transition placeholder:text-[#A39A91] focus:border-[#FF8F73] focus:bg-white focus:ring-4 focus:ring-[#FF5A36]/[0.08]" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#8B8178] hover:bg-white"><X size={15} /></button>}</div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 lg:flex">
                  <label className="relative min-w-0"><span className="sr-only">Filter request status</span><select value={status} onChange={(event) => setStatus(event.target.value as FilterStatus)} className="h-12 w-full appearance-none rounded-xl border border-[#EAE2D9] bg-[#FCFAF7] pl-3.5 pr-10 text-sm font-semibold text-[#625950] outline-none focus:border-[#FF8F73] lg:min-w-[175px]">{STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8B8178]" /></label>
                  <button type="submit" disabled={loading} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#E94F2D] disabled:cursor-not-allowed disabled:opacity-60"><Search size={16} /><span className="hidden sm:inline">Search</span></button>
                  <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} aria-label="Refresh requests" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#EAE2D9] bg-white px-3.5 text-sm font-bold text-[#6D6259] transition hover:border-[#FFB19B] hover:text-[#9F2D18] disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /><span className="hidden xl:inline">Refresh</span></button>
                </div>
              </form>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1"><div className="flex items-center gap-2 text-[11px] font-medium text-[#8B8178]"><SlidersHorizontal size={13} />{status ? `Filtered by ${getStatusLabel(status)}` : "All request statuses"}{debouncedSearch ? ` · Search: “${debouncedSearch}”` : ""}</div><div className="text-[11px] font-semibold text-[#8B8178]">{loading ? "Updating results…" : `${requests.length} ${requests.length === 1 ? "request" : "requests"} loaded`}</div></div>
            </section>

            <div className="mb-3 mt-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A39A91]">Request queue</p><h3 className="mt-1 text-xl font-black tracking-tight text-[#17202A]">Buyer requests <span className="ml-1 text-[#A39A91]">({requests.length})</span></h3></div><p className="text-xs text-[#8B8178]">Open a request to inspect its details and business matches.</p></div>

            {loading ? <div className="grid gap-4 2xl:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-[22px] border border-[#E7DED5] bg-white p-5"><div className="h-4 w-36 rounded bg-[#EEE7E0]" /><div className="mt-5 h-6 w-3/4 rounded bg-[#F2ECE6]" /><div className="mt-3 h-4 w-full rounded bg-[#F2ECE6]" /><div className="mt-2 h-4 w-1/2 rounded bg-[#F2ECE6]" /></div>)}</div> : requests.length === 0 ? <div className="rounded-[24px] border border-dashed border-[#DCCFC3] bg-white px-5 py-16 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#A83D24]"><ClipboardList size={25} /></div><h3 className="mt-4 text-base font-black text-[#17202A]">No requests found</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#81776F]">Try another search or status filter. New buyer requests will appear here when they are submitted.</p><button type="button" onClick={() => { setSearch(""); setStatus(""); setRefreshKey((value) => value + 1); }} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-[#E94F2D]">Clear filters <X size={14} /></button></div> : <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
              {requests.map((item) => {
                const isUpdating = updatingId === item.id;
                return <article key={item.id} className="group min-w-0 overflow-hidden rounded-[22px] border border-[#E7DED5] bg-white shadow-[0_5px_24px_rgba(44,35,28,0.025)] transition duration-200 hover:-translate-y-0.5 hover:border-[#F0B4A3] hover:shadow-[0_14px_34px_rgba(44,35,28,0.07)]">
                  <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
                    <div className="flex min-w-0 items-start gap-3.5">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-[74px] w-[74px] shrink-0 rounded-2xl border border-[#EEE6DD] bg-[#FCFAF7] object-cover sm:h-[88px] sm:w-[88px]" /> : <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#B04A30] sm:h-[88px] sm:w-[88px]"><ImageIcon size={27} /></div>}
                      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-[#FCF2E9] px-2.5 py-1 text-[10px] font-black tracking-wide text-[#9F2D18]">{item.requestCode}</span><RequestStatusBadge status={item.status} /></div><h4 className="mt-2 break-words text-[17px] font-black leading-snug tracking-tight text-[#17202A] sm:text-lg">{item.query}</h4>{item.category && <p className="mt-1 text-xs font-semibold text-[#8D8177]">{item.category.name}</p>}</div>
                    </div>
                    {item.description && <p className="line-clamp-2 break-words text-sm leading-6 text-[#766C63]">{item.description}</p>}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {item.budget !== null && <div className="rounded-xl bg-[#FCFAF7] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#A39A91]">Budget</p><p className="mt-1 break-words text-sm font-black text-[#17202A]">{formatNaira(item.budget)}</p></div>}
                      {item.quantity !== null && <div className="rounded-xl bg-[#FCFAF7] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#A39A91]">Quantity</p><p className="mt-1 text-sm font-black text-[#17202A]">{item.quantity}</p></div>}
                      <div className="rounded-xl bg-[#FCFAF7] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#A39A91]">Matches</p><p className="mt-1 text-sm font-black text-[#17202A]">{item.matches.length} {item.matches.length === 1 ? "business" : "businesses"}</p></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-[#8B8178]">{item.locationArea && <span className="inline-flex items-center gap-1.5"><MapPin size={13} className="text-[#FF5A36]" />{item.locationArea}</span>}<span className="inline-flex items-center gap-1.5"><Clock3 size={13} />{formatDate(item.createdAt)}</span></div>
                    {item.matches.length > 0 && <div className="border-t border-[#F0EAE3] pt-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#7A7067]"><Users size={14} />Suggested businesses</span><button type="button" onClick={() => setSelectedRequest(item)} className="text-[11px] font-bold text-[#9F2D18] hover:underline">View all</button></div><div className="flex flex-wrap gap-2">{item.matches.slice(0, 3).map((match) => <Link key={match.id} href={`/admin/businesses/${match.business.id}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#E9E1D8] bg-[#FFFCF8] px-3 py-1.5 text-[11px] font-semibold text-[#665C53] transition hover:border-[#FFAD96] hover:text-[#9F2D18]"><span className="max-w-[180px] truncate">{match.business.name}</span>{match.business.verified && <BadgeCheck size={13} className="shrink-0 text-emerald-600" />}</Link>)}</div></div>}
                    <div className="flex flex-col gap-2 border-t border-[#F0EAE3] pt-4 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setSelectedRequest(item)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E7DED5] bg-white px-4 text-xs font-extrabold text-[#665C53] transition hover:border-[#FFB19B] hover:bg-[#FFFAF6] hover:text-[#9F2D18]"><Eye size={15} />View details <ArrowRight size={14} /></button><label className="relative min-w-0 sm:min-w-[170px]"><span className="sr-only">Update status for {item.requestCode}</span><select value={item.status} disabled={isUpdating || Boolean(updatingId)} onChange={(event) => void updateStatus(item.id, event.target.value as RequestStatus)} className="h-10 w-full appearance-none rounded-xl border border-[#E7DED5] bg-[#FCFAF7] pl-3 pr-9 text-xs font-bold text-[#665C53] outline-none transition focus:border-[#FF8F73] disabled:opacity-60">{STATUS_OPTIONS.filter((option) => option.value !== "").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8177]" />{isUpdating && <Loader2 size={13} className="absolute right-8 top-1/2 -translate-y-1/2 animate-spin text-[#FF5A36]" />}</label></div>
                  </div>
                </article>;
              })}
            </div>}
            <p className="mt-5 text-[10px] leading-5 text-[#A39A91]">Counts and results reflect the requests returned by the current API query. Status changes are saved through the existing admin requests endpoint.</p>
          </div>
        </div>

        <nav aria-label="Mobile admin navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E4DACE] bg-[#FFFCF8]/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(31,40,46,0.07)] backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin/requests";
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-w-[76px] shrink-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[9px] font-extrabold transition sm:min-w-[88px] sm:text-[10px] ${active ? "bg-[#FFE4DA] text-[#9F2D18]" : "text-[#766C63] hover:bg-[#F6EEE6]"}`}><Icon size={17} /><span className="max-w-full truncate">{item.label}</span></Link>;
            })}
          </div>
        </nav>
      </div>

      {selectedRequest && <RequestDetailsModal request={selectedRequest} onClose={() => setSelectedRequest(null)} onStatusChange={(nextStatus) => void updateStatus(selectedRequest.id, nextStatus)} updating={updatingId === selectedRequest.id} />}
    </main>
  );
}

function RequestDetailsModal({
  request,
  onClose,
  onStatusChange,
  updating,
}: {
  request: AdminRequest;
  onClose: () => void;
  onStatusChange: (status: RequestStatus) => void;
  updating: boolean;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#17202A]/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="request-modal-title" className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[26px] border border-white/70 bg-[#FFFCF8] shadow-2xl sm:max-h-[min(88dvh,850px)] sm:rounded-[26px]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E8DFD5] bg-white px-4 py-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#A83D24]"><ClipboardList size={19} /></span><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#A39A91]">{request.requestCode}</p><h2 id="request-modal-title" className="mt-0.5 truncate text-lg font-black text-[#17202A]">Request details</h2></div></div><button type="button" onClick={onClose} aria-label="Close request details" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8DFD5] bg-white text-[#6F675F] hover:bg-[#F7F0E8]"><X size={18} /></button></header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><RequestStatusBadge status={request.status} />{request.category && <span className="rounded-full bg-[#F0EBE4] px-2.5 py-1 text-[11px] font-bold text-[#6F675F]">{request.category.name}</span>}</div><h3 className="mt-3 break-words text-2xl font-black leading-tight tracking-tight text-[#17202A]">{request.query}</h3>{request.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#6F675F]">{request.description}</p>}</div>{request.imageUrl && <img src={request.imageUrl} alt="Requested item" className="max-h-52 w-full rounded-2xl border border-[#E8DFD5] bg-white object-contain sm:w-44" />}</div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{request.budget !== null && <DetailFact label="Budget" value={formatNaira(request.budget)} />}{request.quantity !== null && <DetailFact label="Quantity" value={String(request.quantity)} />}{request.locationArea && <DetailFact label="Location" value={request.locationArea} />}{request.buyerContact && <DetailFact label="Buyer contact" value={request.buyerContact} />}</div>
        <div className="mt-5 rounded-2xl border border-[#E8DFD5] bg-white p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-black text-[#17202A]">Matched businesses</h3><span className="rounded-full bg-[#F5EFE8] px-2.5 py-1 text-[11px] font-extrabold text-[#6F675F]">{request.matches.length}</span></div>{request.matches.length === 0 ? <p className="mt-3 rounded-xl bg-[#FCFAF7] p-4 text-sm text-[#81776F]">No businesses have been matched to this request yet.</p> : <div className="mt-3 space-y-2">{request.matches.map((match) => <div key={match.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#EEE6DD] p-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F6F0E9] text-[#7D7066]"><Building2 size={16} /></span><div className="min-w-0"><Link href={`/admin/businesses/${match.business.id}`} className="block truncate text-sm font-bold text-[#17202A] hover:text-[#9F2D18]">{match.business.name}</Link><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[#8B8178]">{match.business.area && <span>{match.business.area}</span>}{match.business.verified && <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck size={12} />Verified</span>}{match.addedManually && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-bold text-violet-700">Manual match</span>}</div></div></div><div className="shrink-0 text-right"><p className="text-base font-black text-[#17202A]">{match.score}</p><p className="text-[9px] font-bold uppercase tracking-wide text-[#A39A91]">Match score</p></div></div>)}</div>}</div>
        <p className="mt-4 inline-flex items-center gap-2 text-[11px] text-[#8B8178]"><Clock3 size={13} />Submitted {formatDate(request.createdAt)}</p>
      </div>
      <footer className="flex shrink-0 flex-col gap-2 border-t border-[#E8DFD5] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-[11px] font-medium text-[#8B8178]">Update the request lifecycle status.</p><div className="flex min-w-0 flex-col gap-2 sm:flex-row"><label className="relative min-w-0"><span className="sr-only">Change request status</span><select value={request.status} disabled={updating} onChange={(event) => onStatusChange(event.target.value as RequestStatus)} className="h-10 w-full appearance-none rounded-xl border border-[#E8DFD5] bg-[#FCFAF7] pl-3 pr-9 text-xs font-bold text-[#625950] sm:min-w-[165px]">{STATUS_OPTIONS.filter((option) => option.value !== "").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8178]" /></label><button type="button" onClick={onClose} className="h-10 rounded-xl bg-[#202D37] px-5 text-xs font-extrabold text-white transition hover:bg-[#2C404D]">Done</button></div></footer>
    </section>
  </div>;
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-[#E8DFD5] bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#A39A91]">{label}</p><p className="mt-1 break-words text-sm font-bold text-[#17202A]">{value}</p></div>;
}
