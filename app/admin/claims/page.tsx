"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  Megaphone,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import NotificationBell from "@/components/NotificationBell";

type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";
type Filter = "ALL" | ClaimStatus;

type ClaimRequest = {
  id: string;
  businessId: string;
  requestedById: string;
  reason: string | null;
  status: ClaimStatus;
  createdAt: string;
  reviewedAt: string | null;
  business: {
    id: string;
    name: string;
    ownerId: string | null;
    ownerName: string | null;
    status: string;
    verification: string;
    deletedAt: string | null;
    location: { id: string; area: string | null } | null;
  };
  requestedBy: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  };
  reviewedBy: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
  } | null;
};

type ClaimsResponse = { requests: ClaimRequest[]; total?: number };
type ActionResponse = { message?: string; error?: string; claim?: ClaimRequest };

const ADMIN_NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Content", href: "/admin/content", icon: Megaphone },
  { label: "Claims", href: "/admin/claims", icon: UserRound },
  { label: "Deletion", href: "/admin/business-deletion-requests", icon: Trash2 },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isClaimStatus(value: unknown): value is ClaimStatus {
  return value === "PENDING" || value === "APPROVED" || value === "REJECTED";
}

function isPerson(value: unknown): value is ClaimRequest["requestedBy"] {
  return isRecord(value) && typeof value.id === "string" &&
    (value.name === null || typeof value.name === "string") &&
    (value.email === null || typeof value.email === "string") &&
    typeof value.role === "string";
}

function normalizeClaim(value: unknown): ClaimRequest | null {
  if (!isRecord(value) || !isRecord(value.business) || !isPerson(value.requestedBy)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.businessId !== "string" ||
    typeof value.requestedById !== "string" ||
    !isClaimStatus(value.status) ||
    typeof value.createdAt !== "string"
  ) return null;

  const business = value.business;
  if (typeof business.id !== "string" || typeof business.name !== "string") return null;
  const rawLocation = isRecord(business.location) && typeof business.location.id === "string"
    ? { id: business.location.id, area: nullableString(business.location.area) }
    : null;
  const rawReviewedBy = value.reviewedBy;
  const reviewedBy = isPerson(rawReviewedBy) ? rawReviewedBy : null;

  return {
    id: value.id,
    businessId: value.businessId,
    requestedById: value.requestedById,
    reason: nullableString(value.reason),
    status: value.status,
    createdAt: value.createdAt,
    reviewedAt: nullableString(value.reviewedAt),
    business: {
      id: business.id,
      name: business.name,
      ownerId: nullableString(business.ownerId),
      ownerName: nullableString(business.ownerName),
      status: typeof business.status === "string" ? business.status : "UNKNOWN",
      verification: typeof business.verification === "string" ? business.verification : "UNVERIFIED",
      deletedAt: nullableString(business.deletedAt),
      location: rawLocation,
    },
    requestedBy: value.requestedBy,
    reviewedBy,
  };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}

function statusMeta(status: ClaimStatus) {
  switch (status) {
    case "PENDING": return { label: "Needs review", classes: "bg-[#FFF0D9] text-[#945116]", Icon: Clock3 };
    case "APPROVED": return { label: "Approved", classes: "bg-[#DDF5EA] text-[#137A59]", Icon: CheckCircle2 };
    case "REJECTED": return { label: "Rejected", classes: "bg-[#FCE8E6] text-[#B42318]", Icon: X };
  }
}

function sellerName(claim: ClaimRequest): string {
  return claim.requestedBy.name?.trim() || claim.requestedBy.email?.trim() || "Unknown seller";
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function apiError(data: unknown, fallback: string): string {
  return isRecord(data) && typeof data.error === "string" && data.error.trim()
    ? data.error
    : fallback;
}

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<ClaimRequest[]>([]);
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadClaims = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError("");

    try {
      const response = await fetch("/api/admin/business-claim-requests", {
        method: "GET",
        cache: "no-store",
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(apiError(data, "Unable to load business claim requests."));
      if (!isRecord(data) || !Array.isArray(data.requests)) {
        throw new Error("The server returned an invalid claim request response.");
      }
      const validClaims = data.requests.map(normalizeClaim).filter((claim): claim is ClaimRequest => claim !== null);
      setClaims(validClaims);
      setLastUpdated(new Date().toISOString());
    } catch (loadError) {
      console.error("Admin claims load error:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load business claim requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadClaims(true); }, [loadClaims]);

  const counts = useMemo(() => ({
    ALL: claims.length,
    PENDING: claims.filter((claim) => claim.status === "PENDING").length,
    APPROVED: claims.filter((claim) => claim.status === "APPROVED").length,
    REJECTED: claims.filter((claim) => claim.status === "REJECTED").length,
  }), [claims]);

  const filteredClaims = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return claims.filter((claim) => {
      const matchesStatus = filter === "ALL" || claim.status === filter;
      if (!matchesStatus) return false;
      if (!needle) return true;
      return [
        claim.business.name,
        claim.business.location?.area ?? "",
        sellerName(claim),
        claim.requestedBy.email ?? "",
        claim.reason ?? "",
      ].some((field) => field.toLowerCase().includes(needle));
    });
  }, [claims, filter, search]);

  async function reviewClaim(claim: ClaimRequest, nextStatus: "APPROVED" | "REJECTED") {
    if (processingId || claim.status !== "PENDING") return;
    const name = sellerName(claim);
    const action = nextStatus === "APPROVED" ? "Approve" : "Reject";
    const prompt = nextStatus === "APPROVED"
      ? `Approve the claim from ${name} for “${claim.business.name}”? This will assign the business to this seller.`
      : `Reject the claim from ${name} for “${claim.business.name}”?`;
    if (!window.confirm(prompt)) return;

    setProcessingId(claim.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/business-claim-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: claim.id, status: nextStatus }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(apiError(data, `Unable to ${action.toLowerCase()} the claim.`));
      setSuccess(nextStatus === "APPROVED"
        ? `“${claim.business.name}” has been assigned to ${name}.`
        : `The claim for “${claim.business.name}” has been rejected.`);
      await loadClaims(false);
    } catch (reviewError) {
      console.error("Admin claim review error:", reviewError);
      setError(reviewError instanceof Error ? reviewError.message : "Unable to update the claim request.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="min-h-dvh w-full overflow-x-clip bg-[#F7F1EB] text-[#2E241F]">
      <div className="flex min-h-dvh w-full">
        {/* Full-height desktop navigation */}
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-[#E8DED3] bg-[#FFFDFC] lg:flex">
          <div className="border-b border-[#E8DED3] px-5 py-5">
            <Link href="/admin" className="flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF5A36] text-lg font-black text-white shadow-sm">R</div>
              <div className="min-w-0"><p className="font-black tracking-tight text-[#2E241F]">ReMarket</p><p className="mt-0.5 text-[11px] text-[#8B8178]">Admin workspace</p></div>
            </Link>
          </div>
          <div className="px-4 pt-6"><p className="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#A0968D]">Operations</p></div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label="Admin navigation">
            <div className="space-y-1">
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/claims";
                return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? "bg-[#17202A] text-white shadow-sm" : "text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18]"}`}>
                  <Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{item.label === "Deletion" ? "Deletion requests" : item.label}</span>{active && <ChevronRight className="h-4 w-4 opacity-80" />}
                </Link>;
              })}
            </div>
          </nav>
          <div className="border-t border-[#E8DED3] p-4">
            <div className="rounded-2xl bg-[#FFF0E8] p-4"><div className="flex items-center gap-2 text-[#9F2D18]"><ShieldCheck className="h-4 w-4" /><span className="text-xs font-black">Trust desk</span></div><p className="mt-2 text-[11px] leading-5 text-[#7C5B4E]">Review ownership claims carefully before assigning a business.</p></div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Top utility bar */}
          <header className="sticky top-0 z-30 flex min-h-[64px] items-center justify-between gap-3 border-b border-[#E8DED3] bg-[#FFFDFC]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" aria-label="Back to admin overview" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8DED3] bg-white text-[#6F675F] transition hover:bg-[#FFF0E8] lg:hidden"><ArrowLeft className="h-4 w-4" /></Link>
              <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9F2D18]">Trust & ownership</p><h1 className="truncate text-base font-black sm:text-lg">Business claims</h1></div>
            </div>
            <div className="flex shrink-0 items-center gap-2"><span className="hidden text-right sm:block"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#A0968D]">Last checked</span><span className="block text-xs font-semibold text-[#6F675F]">{lastUpdated ? new Date(lastUpdated).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : "—"}</span></span><NotificationBell /><button type="button" aria-label="Refresh claims" onClick={() => void loadClaims(false)} disabled={refreshing || Boolean(processingId)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8DED3] bg-white text-[#6F675F] transition hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /></button></div>
          </header>

          {/* Tablet navigation; phone uses the bottom dock */}
          <nav aria-label="Admin sections" className="hidden gap-1 overflow-x-auto border-b border-[#E8DED3] bg-[#FFFDFC] px-4 py-2 sm:flex lg:hidden sm:px-6">
            {ADMIN_NAV.map((item) => { const Icon = item.icon; const active = item.href === "/admin/claims"; return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${active ? "bg-[#17202A] text-white" : "text-[#6F675F] hover:bg-[#FFF0E8]"}`}><Icon className="h-3.5 w-3.5" />{item.label}</Link>; })}
          </nav>

          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 pb-32 sm:px-6 sm:py-6 lg:px-8 lg:py-8 lg:pb-10">
            {/* Editorial hero */}
            <section className="relative isolate mb-6 overflow-hidden rounded-[24px] bg-[#17202A] text-white shadow-sm sm:mb-7">
              <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-64 w-64 rounded-full border-[36px] border-[#FF5A36]/20" />
              <div className="pointer-events-none absolute -bottom-24 right-[22%] -z-10 h-48 w-48 rounded-full bg-[#FF5A36]/10 blur-2xl" />
              <div className="grid gap-5 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-end lg:p-8">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#FFD0C2]"><ShieldCheck className="h-3.5 w-3.5" />ReMarket trust desk</div>
                  <h2 className="mt-4 max-w-3xl text-2xl font-black leading-tight tracking-tight sm:text-3xl lg:text-4xl">Every claim deserves a <span className="text-[#FF8A6D]">careful review.</span></h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Verify who is asking to manage an existing business. Review the business, seller details and reason before approving ownership.</p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:min-w-[190px]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white"><ClipboardCheck className="h-5 w-5" /></div>
                  <div><p className="text-2xl font-black tabular-nums">{loading ? "—" : counts.PENDING}</p><p className="text-xs font-medium text-white/65">Awaiting review</p></div>
                </div>
              </div>
            </section>

            {/* Feedback */}
            {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#F1C5BF] bg-[#FFF4F2] px-4 py-3.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B42318]" /><p className="min-w-0 flex-1 text-sm font-semibold text-[#B42318]">{error}</p><button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="text-[#B42318]"><X className="h-4 w-4" /></button></div>}
            {success && <div role="status" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#CBE7D7] bg-[#F1FBF5] px-4 py-3.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#287A4B]" /><p className="min-w-0 flex-1 text-sm font-semibold text-[#287A4B]">{success}</p><button type="button" onClick={() => setSuccess("")} aria-label="Dismiss success" className="text-[#287A4B]"><X className="h-4 w-4" /></button></div>}

            {/* Filter cards */}
            <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" aria-label="Claim status filters">
              {([
                ["ALL", "All claims", ClipboardList, "View the full queue"],
                ["PENDING", "Pending", Clock3, "Needs your attention"],
                ["APPROVED", "Approved", CheckCircle2, "Ownership assigned"],
                ["REJECTED", "Rejected", X, "Not approved"],
              ] as const).map(([value, label, Icon, hint]) => {
                const active = filter === value;
                return <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={active} className={`group min-w-0 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20 sm:p-5 ${active ? "border-[#17202A] bg-[#17202A] text-white shadow-sm" : "border-[#E8DED3] bg-white text-[#2E241F] hover:border-[#FFB49F] hover:shadow-sm"}`}>
                  <div className="flex items-start justify-between gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? "bg-white/10 text-[#FF9B83]" : "bg-[#FFF0E8] text-[#9F2D18]"}`}><Icon className="h-4 w-4" /></span><span className={`text-2xl font-black tabular-nums sm:text-3xl ${active ? "text-white" : "text-[#2E241F]"}`}>{loading ? "—" : counts[value]}</span></div>
                  <p className="mt-3 text-sm font-black">{label}</p><p className={`mt-1 hidden text-[10px] leading-4 sm:block ${active ? "text-white/60" : "text-[#91877E]"}`}>{hint}</p>
                </button>;
              })}
            </section>

            {/* Queue / search */}
            <section className="overflow-hidden rounded-[24px] border border-[#E8DED3] bg-white shadow-sm">
              <div className="border-b border-[#E8DED3] p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><ClipboardList className="h-4 w-4" /></span><h2 className="text-base font-black sm:text-lg">{filter === "ALL" ? "All claim requests" : `${filter.charAt(0)}${filter.slice(1).toLowerCase()} claims`}</h2></div><p className="mt-2 text-xs leading-5 text-[#8B8178]">{filteredClaims.length} {filteredClaims.length === 1 ? "request" : "requests"}{search.trim() ? " matching your search" : " in this view"}</p></div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 flex-1 sm:min-w-[220px] xl:w-[300px] xl:flex-none"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0968D]" /><input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={120} aria-label="Search claims" placeholder="Search business, seller or reason…" className="h-11 w-full rounded-xl border border-[#E8DED3] bg-[#FCFAF6] pl-10 pr-3 text-sm outline-none transition placeholder:text-[#A0968D] focus:border-[#FF5A36] focus:bg-white focus:ring-4 focus:ring-[#FF5A36]/10" /></div>
                    <button type="button" onClick={() => void loadClaims(false)} disabled={refreshing || Boolean(processingId)} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-3.5 text-xs font-bold text-[#6F675F] transition hover:border-[#FFB49F] hover:bg-[#FFF7ED] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh queue</button>
                  </div>
                </div>
              </div>

              {loading ? <div className="flex min-h-[260px] items-center justify-center p-8"><div className="flex items-center gap-3 text-sm font-semibold text-[#766C63]"><LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />Loading ownership claims…</div></div> : filteredClaims.length === 0 ? <div className="px-5 py-14 text-center sm:py-16"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]"><BadgeCheck className="h-6 w-6" /></div><h3 className="mt-4 text-base font-black">{search.trim() ? "No claims match that search" : filter === "PENDING" ? "Your review queue is clear" : "No claims in this category"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#8B8178]">{search.trim() ? "Try a business name, seller name, email or a phrase from the claim reason." : filter === "PENDING" ? "New seller ownership claims will appear here when they are submitted." : "Choose another status to review claims in a different stage."}</p>{search.trim() && <button type="button" onClick={() => setSearch("")} className="mt-4 rounded-xl border border-[#E8DED3] px-4 py-2 text-xs font-bold text-[#6F675F] hover:bg-[#FFF7ED]">Clear search</button>}</div> : <div className="divide-y divide-[#EEE6DE]">
                {filteredClaims.map((claim) => {
                  const meta = statusMeta(claim.status);
                  const StatusIcon = meta.Icon;
                  const isProcessing = processingId === claim.id;
                  const name = sellerName(claim);
                  const businessDeleted = Boolean(claim.business.deletedAt);
                  return <article key={claim.id} className="p-4 transition hover:bg-[#FFFEFC] sm:p-5 lg:p-6">
                    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-7">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide ${meta.classes}`}><StatusIcon className="h-3.5 w-3.5" />{meta.label}</span><span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#91877E]"><Clock3 className="h-3.5 w-3.5" />Submitted {formatDate(claim.createdAt)}</span>{businessDeleted && <span className="rounded-full bg-[#FCE8E6] px-2.5 py-1 text-[10px] font-bold text-[#B42318]">Business deleted</span>}</div>

                        <div className="mt-4 flex min-w-0 items-start gap-3 sm:gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#17202A] text-[#FF9B83]"><Store className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1"><h3 className="break-words text-lg font-black leading-snug tracking-tight text-[#17202A] sm:text-xl">{claim.business.name}</h3><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-[#7C726A]">{claim.business.location?.area && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" />{claim.business.location.area}</span>}<span>Business status: <strong className="font-bold text-[#514740]">{claim.business.status}</strong></span><span>Verification: <strong className="font-bold text-[#514740]">{claim.business.verification}</strong></span></div></div>
                          <Link href={`/admin/businesses/${encodeURIComponent(claim.business.id)}`} className="hidden shrink-0 items-center gap-1 text-xs font-bold text-[#9F2D18] hover:underline sm:inline-flex">Open business<ArrowRight className="h-3.5 w-3.5" /></Link>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="min-w-0 rounded-2xl border border-[#E8DED3] bg-[#FCFAF6] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#A0968D]">Claim requested by</p><div className="mt-2 flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#6F675F]"><UserRound className="h-4 w-4" /></div><div className="min-w-0"><p className="break-words text-sm font-black text-[#2E241F]">{name}</p>{claim.requestedBy.email && <p className="mt-1 break-all text-xs text-[#7C726A]">{claim.requestedBy.email}</p>}<p className="mt-1 text-[10px] text-[#A0968D]">Account role: {claim.requestedBy.role}</p></div></div></div>
                          <div className="min-w-0 rounded-2xl border border-[#E8DED3] bg-white p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#A0968D]">Reason for claiming</p><div className="mt-2 flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><FileText className="h-4 w-4" /></div><p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-[#5E554E]">{claim.reason?.trim() || "No reason was provided."}</p></div></div>
                        </div>

                        {claim.status !== "PENDING" && <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[#F7F1EB] px-3.5 py-3 text-xs text-[#766C63]"><CheckCircle2 className="h-3.5 w-3.5" />Reviewed {formatDateTime(claim.reviewedAt)}{claim.reviewedBy?.name ? ` by ${claim.reviewedBy.name}` : ""}</div>}
                        <Link href={`/admin/businesses/${encodeURIComponent(claim.business.id)}`} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#9F2D18] sm:hidden">Open business record<ArrowRight className="h-3.5 w-3.5" /></Link>
                      </div>

                      <div className="min-w-0 xl:border-l xl:border-[#EEE6DE] xl:pl-6">
                        {claim.status === "PENDING" ? <div className="rounded-2xl border border-[#E8DED3] bg-[#FCFAF6] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#A0968D]">Review decision</p><p className="mt-2 text-sm font-black">Confirm ownership?</p><p className="mt-1 text-xs leading-5 text-[#7C726A]">Approving assigns this existing business to the claimant. Review the details first.</p><div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1"><button type="button" onClick={() => void reviewClaim(claim, "APPROVED")} disabled={Boolean(processingId) || businessDeleted} title={businessDeleted ? "Restore the deleted business before approving this claim." : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#16724C] px-3 py-2.5 text-sm font-black text-white transition hover:bg-[#105D3D] disabled:cursor-not-allowed disabled:opacity-45">{isProcessing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve claim</button><button type="button" onClick={() => void reviewClaim(claim, "REJECTED")} disabled={Boolean(processingId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E6BDB6] bg-white px-3 py-2.5 text-sm font-black text-[#B42318] transition hover:bg-[#FFF4F2] disabled:cursor-not-allowed disabled:opacity-45">{isProcessing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}Reject claim</button></div>{businessDeleted && <p className="mt-3 text-[11px] leading-5 text-[#B42318]">This business is soft-deleted. Restore it before approving the ownership claim.</p>}</div> : <div className="rounded-2xl border border-[#E8DED3] bg-[#FCFAF6] p-4"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${claim.status === "APPROVED" ? "bg-[#DDF5EA] text-[#137A59]" : "bg-[#FCE8E6] text-[#B42318]"}`}><StatusIcon className="h-5 w-5" /></div><p className="mt-3 text-sm font-black">{claim.status === "APPROVED" ? "Ownership assigned" : "Claim rejected"}</p><p className="mt-1 text-xs leading-5 text-[#7C726A]">This request has already been reviewed. No further decision is available here.</p><p className="mt-3 text-[10px] font-semibold text-[#A0968D]">Reviewed {formatDate(claim.reviewedAt)}</p></div>}
                      </div>
                    </div>
                  </article>;
                })}
              </div>}
              {!loading && filteredClaims.length > 0 && <div className="flex flex-col gap-2 border-t border-[#E8DED3] bg-[#FCFAF6] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-[11px] text-[#8B8178]">Showing {filteredClaims.length} claim{filteredClaims.length === 1 ? "" : "s"}. Refresh to check for newly submitted requests.</p><button type="button" onClick={() => void loadClaims(false)} disabled={refreshing || Boolean(processingId)} className="inline-flex items-center justify-center gap-2 self-start text-xs font-black text-[#9F2D18] hover:underline disabled:opacity-50 sm:self-auto"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Check for updates</button></div>}
            </section>

            <p className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-[#8B8178]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />For ownership safety, confirm the claimant's relationship to the business before approving. An approved claim changes business ownership on the server.</p>
          </div>
        </main>
      </div>

      {/* Compact mobile dock; page content includes enough bottom padding to stay clear of it. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8DED3] bg-[#FFFDFC]/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(46,36,31,0.08)] backdrop-blur lg:hidden" aria-label="Mobile admin navigation">
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-1">
          {[
            ADMIN_NAV[0],
            ADMIN_NAV[1],
            ADMIN_NAV[5],
            ADMIN_NAV[6],
          ].map((item) => { const Icon = item.icon; const active = item.href === "/admin/claims"; const label = item.href === "/admin/business-deletion-requests" ? "Deletion" : item.label; return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-[46px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[10px] font-black transition ${active ? "bg-[#17202A] text-white" : "text-[#6F675F] hover:bg-[#FFF0E8]"}`}><Icon className="h-4 w-4 shrink-0" /><span className="max-w-full truncate leading-tight">{label}</span></Link>; })}
        </div>
      </nav>
    </div>
  );
}
