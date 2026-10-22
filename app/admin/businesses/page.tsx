"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  Megaphone,
  Package,
  PackagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Trash2,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type BusinessStatus = "ACTIVE" | "INACTIVE" | "PENDING";
type VerificationStatus = "VERIFIED" | "UNVERIFIED";
type AvailabilityStatus = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type DeletionFilter = "ALL" | "ACTIVE" | "DELETED";
type SortMode = "updatedAt" | "onboardedAt";

type Business = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  area: string;
  status: BusinessStatus;
  verification: VerificationStatus;
  availability: AvailabilityStatus;
  phone: string | null;
  categories: { id: string; name: string }[];
  productCount: number;
  onboardedAt: string;
  deletedAt: string | null;
};

type BusinessChanges = Partial<
  Pick<Business, "status" | "verification" | "availability">
>;

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type SummaryMetrics = {
  all: number;
  active: number;
  pending: number;
  deleted: number;
};

type ApiPayload = {
  error?: string;
  message?: string;
  businesses?: unknown;
  pagination?: unknown;
  business?: unknown;
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
  { label: "Requests", href: "/admin/requests", icon: Users },
  { label: "Categories", href: "/admin/categories", icon: Building2 },
  { label: "Claims", href: "/admin/claims", icon: ShieldCheck },
  { label: "Content", href: "/admin/content", icon: Megaphone },
  { label: "Deletion", href: "/admin/business-deletion-requests", icon: Trash2 },
];

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readPayload(response: Response): Promise<ApiPayload> {
  const value: unknown = await response.json().catch(() => null);
  return isRecord(value) ? (value as ApiPayload) : {};
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function businessStatusLabel(status: BusinessStatus): string {
  if (status === "ACTIVE") return "Active";
  if (status === "PENDING") return "Pending";
  return "Inactive";
}

function availabilityLabel(availability: AvailabilityStatus): string {
  if (availability === "AVAILABLE") return "Available";
  if (availability === "ASK_SELLER") return "Ask seller";
  return "Unavailable";
}

function statusTone(status: BusinessStatus): string {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PENDING") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-stone-200 bg-stone-100 text-stone-600";
}

function availabilityTone(status: AvailabilityStatus): string {
  if (status === "AVAILABLE") return "bg-emerald-50 text-emerald-700";
  if (status === "ASK_SELLER") return "bg-sky-50 text-sky-700";
  return "bg-stone-100 text-stone-600";
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full appearance-none rounded-xl border border-[#E5DDD3] bg-white pl-3 pr-9 text-sm font-semibold text-[#4F463F] outline-none transition focus:border-[#FF7657] focus:ring-4 focus:ring-[#FF5A36]/10 sm:min-w-[148px]"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={`${label}-${optionValue}`} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#978B81]" />
    </label>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  selected,
  onClick,
  loading,
}: {
  label: string;
  value: number | null;
  hint: string;
  icon: LucideIcon;
  tone: "coral" | "green" | "amber" | "stone";
  selected?: boolean;
  onClick?: () => void;
  loading?: boolean;
}) {
  const colors = {
    coral: {
      icon: "bg-[#FFE5DC] text-[#A83B24]",
      selected: "border-[#FFAD98] ring-2 ring-[#FF5A36]/10",
    },
    green: {
      icon: "bg-emerald-100 text-emerald-700",
      selected: "border-emerald-300 ring-2 ring-emerald-500/10",
    },
    amber: {
      icon: "bg-amber-100 text-amber-800",
      selected: "border-amber-300 ring-2 ring-amber-500/10",
    },
    stone: {
      icon: "bg-stone-100 text-stone-700",
      selected: "border-stone-300 ring-2 ring-stone-500/10",
    },
  }[tone];

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.09em] text-[#8B8076] sm:text-[11px]">
          {label}
        </span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-2xl font-black tracking-tight text-[#202B35] sm:text-[28px]">
          {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded-lg bg-[#EEE8E1]" /> : value === null ? "—" : value.toLocaleString("en-NG")}
        </span>
        <span className="mb-1 text-[10px] font-medium text-[#9A8F85] sm:text-[11px]">{hint}</span>
      </div>
    </>
  );

  const className = `min-w-0 rounded-2xl border bg-white p-4 text-left shadow-[0_4px_20px_rgba(35,27,21,0.025)] transition sm:p-5 ${selected ? colors.selected : "border-[#EAE2D9] hover:-translate-y-0.5 hover:border-[#D9C7B7] hover:shadow-[0_10px_30px_rgba(35,27,21,0.06)]"}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={className} aria-pressed={selected}>
      {inner}
    </button>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function StateChip({ status }: { status: BusinessStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(status)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "ACTIVE" ? "bg-emerald-500" : status === "PENDING" ? "bg-amber-500" : "bg-stone-400"}`} />
      {businessStatusLabel(status)}
    </span>
  );
}

function VerificationChip({ verified }: { verified: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${verified ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-600"}`}>
      {verified ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      {verified ? "Verified" : "Unverified"}
    </span>
  );
}

function BusinessCard({
  business,
  updating,
  deleting,
  restoring,
  onUpdate,
  onDelete,
  onRestore,
}: {
  business: Business;
  updating: boolean;
  deleting: boolean;
  restoring: boolean;
  onUpdate: (id: string, changes: BusinessChanges) => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const deleted = Boolean(business.deletedAt);

  return (
    <article className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[22px] border bg-white shadow-[0_4px_22px_rgba(36,27,20,0.035)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_38px_rgba(36,27,20,0.08)] ${deleted ? "border-[#F1D2C9] bg-[#FFFCFA]" : "border-[#EAE2D9] hover:border-[#E3C4B5]"}`}>
      <div className={`h-1.5 w-full ${deleted ? "bg-[#D6A092]" : business.status === "ACTIVE" ? "bg-gradient-to-r from-[#FF5A36] via-[#FF8A64] to-[#FFD0B8]" : business.status === "PENDING" ? "bg-gradient-to-r from-amber-400 to-yellow-200" : "bg-stone-200"}`} />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${deleted ? "bg-[#F8E8E3] text-[#9F2D18]" : "bg-[#FFF0E8] text-[#A63D25]"}`}>
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="max-w-full break-words text-[15px] font-extrabold leading-5 text-[#202B35] sm:text-base">{business.name}</h3>
              {deleted && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF0ED] px-2 py-1 text-[10px] font-bold text-[#9F2D18]">
                  <Trash2 className="h-3 w-3" /> Deleted
                </span>
              )}
            </div>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[#8A7F75]">
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{business.ownerName?.trim() || "Owner not recorded"}</span>
            </p>
          </div>
          <Link
            href={`/admin/businesses/${business.id}`}
            aria-label={`View ${business.name}`}
            title="Open business details"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#EFE6DD] text-[#756B62] transition hover:border-[#FFAD98] hover:bg-[#FFF3EE] hover:text-[#9F2D18]"
          >
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <p className="mt-4 min-h-[38px] break-words text-xs leading-5 text-[#786E65]">
          {business.description?.trim() || "No business description has been added yet."}
        </p>

        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#F8F4EF] px-2.5 py-1 text-[11px] font-semibold text-[#72675D]">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#A24932]" />
            <span className="max-w-[180px] truncate">{business.area || "Location not set"}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F8F4EF] px-2.5 py-1 text-[11px] font-semibold text-[#72675D]">
            <Package className="h-3.5 w-3.5 text-[#A24932]" />
            {business.productCount} {business.productCount === 1 ? "product" : "products"}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {business.categories.slice(0, 3).map((category) => (
            <span key={category.id} className="max-w-full truncate rounded-lg border border-[#EEE7DF] bg-white px-2 py-1 text-[10px] font-semibold text-[#83776D]">
              {category.name}
            </span>
          ))}
          {business.categories.length > 3 && (
            <span className="rounded-lg bg-[#F8F4EF] px-2 py-1 text-[10px] font-bold text-[#83776D]">+{business.categories.length - 3}</span>
          )}
          {business.categories.length === 0 && <span className="text-[10px] text-[#A49A90]">No categories assigned</span>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#F0E9E1] pt-4">
          <StateChip status={business.status} />
          <VerificationChip verified={business.verification === "VERIFIED"} />
          {!deleted && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${availabilityTone(business.availability)}`}>
              {availabilityLabel(business.availability)}
            </span>
          )}
        </div>

        <div className="mt-auto pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-medium text-[#9B9086]">
            <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Added {formatDate(business.onboardedAt)}</span>
            {business.phone && <span className="max-w-full truncate">{business.phone}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={updating || deleting || restoring || deleted}
              onClick={() => onUpdate(business.id, { status: business.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}
              className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[#E9E0D7] bg-white px-2 py-2.5 text-[11px] font-bold text-[#62584F] transition hover:border-[#D8C1B1] hover:bg-[#FCF7F2] disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
              title={business.status === "ACTIVE" ? "Set business inactive" : "Activate business"}
            >
              {updating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
              {business.status === "ACTIVE" ? "Set inactive" : business.status === "PENDING" ? "Approve & activate" : "Activate"}
            </button>
            <button
              type="button"
              disabled={updating || deleting || restoring || deleted}
              onClick={() => onUpdate(business.id, { verification: business.verification === "VERIFIED" ? "UNVERIFIED" : "VERIFIED" })}
              className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[#E9E0D7] bg-white px-2 py-2.5 text-[11px] font-bold text-[#62584F] transition hover:border-[#D8C1B1] hover:bg-[#FCF7F2] disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
            >
              {updating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
              {business.verification === "VERIFIED" ? "Unverify" : "Verify"}
            </button>
            {!deleted && (
              <button
                type="button"
                disabled={updating || deleting || restoring}
                onClick={() => onUpdate(business.id, { availability: business.availability === "AVAILABLE" ? "ASK_SELLER" : business.availability === "ASK_SELLER" ? "UNAVAILABLE" : "AVAILABLE" })}
                className="col-span-2 inline-flex min-w-0 items-center justify-between gap-2 rounded-xl border border-[#E9E0D7] bg-[#FCFAF7] px-3 py-2.5 text-xs font-bold text-[#62584F] transition hover:border-[#D8C1B1] hover:bg-[#F8F1EA] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-[#A24932]" /> Buyer-facing availability</span>
                <span className="inline-flex items-center gap-1">{availabilityLabel(business.availability)} <ChevronDown className="h-3.5 w-3.5" /></span>
              </button>
            )}
            <Link
              href={`/admin/businesses/${business.id}`}
              className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#FFF0E8] px-2 py-2.5 text-[11px] font-extrabold text-[#9F2D18] transition hover:bg-[#FFE2D7] sm:text-xs"
            >
              <Eye className="h-3.5 w-3.5" /> View details
            </Link>
            {!deleted ? (
              <Link
                href={`/admin/businesses/${business.id}/products/new`}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#202B35] px-2 py-2.5 text-[11px] font-extrabold text-white transition hover:bg-[#344552] sm:text-xs"
              >
                <PackagePlus className="h-3.5 w-3.5" /> Add product
              </Link>
            ) : (
              <button
                type="button"
                disabled={updating || deleting || restoring}
                onClick={onRestore}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-2 py-2.5 text-[11px] font-extrabold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
              >
                {restoring ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Restore listing
              </button>
            )}
            {!deleted && (
              <button
                type="button"
                disabled={updating || deleting || restoring}
                onClick={onDelete}
                className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#F0C8BD] bg-[#FFF8F5] px-3 py-2 text-[11px] font-bold text-[#A23A25] transition hover:border-[#E2A496] hover:bg-[#FFF0EB] disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs"
              >
                {deleting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {deleting ? "Moving to deleted…" : "Move to deleted businesses"}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function DeleteConfirmationModal({
  business,
  loading,
  onCancel,
  onConfirm,
}: {
  business: Business;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#17202A]/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-business-title"
        className="w-full max-w-md overflow-hidden rounded-[26px] border border-white/60 bg-[#FFFDFC] shadow-2xl"
      >
        <div className="h-2 bg-gradient-to-r from-[#FF5A36] via-[#FF9675] to-[#FFD2BD]" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0ED] text-[#A83B24]">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 id="delete-business-title" className="text-lg font-black text-[#202B35]">Move this business to deleted?</h2>
              <p className="mt-2 break-words text-sm leading-6 text-[#74695F]">
                <strong className="text-[#202B35]">{business.name}</strong> will be removed from customer-facing results. This is a soft delete; its record remains in the system and can be restored later.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={loading} onClick={onCancel} className="h-11 rounded-xl border border-[#E6DDD4] bg-white px-4 text-sm font-bold text-[#62584F] hover:bg-[#F8F3EE] disabled:opacity-50">Keep business</button>
            <button type="button" disabled={loading} onClick={onConfirm} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#B83A23] px-4 text-sm font-extrabold text-white hover:bg-[#9F2D18] disabled:opacity-60">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {loading ? "Moving…" : "Confirm soft delete"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("");
  const [verification, setVerification] = useState("");
  const [deletionFilter, setDeletionFilter] = useState<DeletionFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("updatedAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  });
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmDeleteBusiness, setConfirmDeleteBusiness] = useState<Business | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadMetrics = useCallback(async (signal: AbortSignal) => {
    const fetchCount = async (params: URLSearchParams): Promise<number> => {
      params.set("page", "1");
      params.set("pageSize", "1");
      const response = await fetch(`/api/admin/businesses?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });
      const data = await readPayload(response);
      if (!response.ok) throw new Error(data.error || "Unable to load directory metrics.");
      if (isRecord(data.pagination) && typeof data.pagination.total === "number") {
        return data.pagination.total;
      }
      return Array.isArray(data.businesses) ? data.businesses.length : 0;
    };

    const makeParams = (deleted: DeletionFilter, businessStatus?: BusinessStatus) => {
      const params = new URLSearchParams({ deleted });
      if (businessStatus) params.set("status", businessStatus);
      return params;
    };

    const [all, active, pending, deleted] = await Promise.all([
      fetchCount(makeParams("ALL")),
      fetchCount(makeParams("ACTIVE", "ACTIVE")),
      fetchCount(makeParams("ACTIVE", "PENDING")),
      fetchCount(makeParams("DELETED")),
    ]);
    return { all, active, pending, deleted };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;

    async function run() {
      setMetricsLoading(true);
      try {
        const nextMetrics = await loadMetrics(controller.signal);
        if (current) setMetrics(nextMetrics);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Load business directory metrics error:", loadError);
        if (current) setMetrics(null);
      } finally {
        if (current) setMetricsLoading(false);
      }
    }

    void run();
    return () => {
      current = false;
      controller.abort();
    };
  }, [loadMetrics, metricsRefreshKey]);

  useEffect(() => {
    if (query.trim() !== debouncedQuery) return;

    const controller = new AbortController();
    let current = true;

    async function run() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          deleted: deletionFilter,
          page: String(page),
          pageSize: String(pageSize),
          sort,
        });
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (status) params.set("status", status);
        if (verification) params.set("verification", verification);

        const response = await fetch(`/api/admin/businesses?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await readPayload(response);
        if (!response.ok) throw new Error(data.error || "Unable to load businesses.");
        if (!Array.isArray(data.businesses)) throw new Error("The business directory response was invalid.");

        const nextPagination = isRecord(data.pagination) ? data.pagination : null;
        const nextPage = nextPagination && typeof nextPagination.page === "number" ? nextPagination.page : page;
        const nextPageSize = nextPagination && typeof nextPagination.pageSize === "number" ? nextPagination.pageSize : pageSize;
        const nextTotal = nextPagination && typeof nextPagination.total === "number" ? nextPagination.total : data.businesses.length;
        const nextTotalPages = nextPagination && typeof nextPagination.totalPages === "number" ? nextPagination.totalPages : (nextTotal > 0 ? 1 : 0);

        if (!current) return;
        setBusinesses(data.businesses as Business[]);
        setPagination({
          page: nextPage,
          pageSize: nextPageSize,
          total: nextTotal,
          totalPages: nextTotalPages,
          hasPreviousPage: nextPagination && typeof nextPagination.hasPreviousPage === "boolean" ? nextPagination.hasPreviousPage : nextPage > 1,
          hasNextPage: nextPagination && typeof nextPagination.hasNextPage === "boolean" ? nextPagination.hasNextPage : nextPage < nextTotalPages,
        });
        if (nextTotalPages > 0 && page > nextTotalPages) setPage(nextTotalPages);
        else if (nextTotalPages === 0 && page !== 1) setPage(1);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Load businesses error:", loadError);
        if (current) {
          setBusinesses([]);
          setPagination({ page, pageSize, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false });
          setError(loadError instanceof Error ? loadError.message : "We couldn't load the businesses.");
        }
      } finally {
        if (current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void run();
    return () => {
      current = false;
      controller.abort();
    };
  }, [query, debouncedQuery, status, verification, deletionFilter, sort, page, pageSize, listRefreshKey]);

  const startRecord = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const endRecord = Math.min(pagination.page * pagination.pageSize, pagination.total);

  function changeDeletionFilter(nextFilter: DeletionFilter) {
    setDeletionFilter(nextFilter);
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setStatus("");
    setVerification("");
    setDeletionFilter("ALL");
    setSort("updatedAt");
    setPage(1);
  }

  async function refreshDirectory() {
    setError("");
    setRefreshing(true);
    setListRefreshKey((value) => value + 1);
    setMetricsRefreshKey((value) => value + 1);
  }

  async function updateBusiness(id: string, changes: BusinessChanges) {
    if (updatingId || deletingId || restoringId) return;
    setUpdatingId(id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/businesses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const data = await readPayload(response);
      if (!response.ok) throw new Error(data.error || "Unable to update business.");
      setSuccess(data.message || "Business details updated successfully.");
      setListRefreshKey((value) => value + 1);
      setMetricsRefreshKey((value) => value + 1);
    } catch (updateError) {
      console.error("Update business error:", updateError);
      setError(updateError instanceof Error ? updateError.message : "We couldn't update that business.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteBusiness(business: Business) {
    if (deletingId || updatingId || restoringId) return;
    setDeletingId(business.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/businesses/${business.id}`, { method: "DELETE" });
      const data = await readPayload(response);
      if (!response.ok) throw new Error(data.error || "Unable to delete business.");
      setConfirmDeleteBusiness(null);
      setSuccess(`${business.name} was moved to deleted businesses. The record can be restored later.`);
      setListRefreshKey((value) => value + 1);
      setMetricsRefreshKey((value) => value + 1);
    } catch (deleteError) {
      console.error("Delete business error:", deleteError);
      setError(deleteError instanceof Error ? deleteError.message : "We couldn't delete that business.");
    } finally {
      setDeletingId(null);
    }
  }

  async function restoreBusiness(business: Business) {
    if (restoringId || updatingId || deletingId) return;
    setRestoringId(business.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/businesses/${business.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      const data = await readPayload(response);
      if (!response.ok) throw new Error(data.error || "Unable to restore business.");
      setSuccess(`${business.name} was restored successfully.`);
      setListRefreshKey((value) => value + 1);
      setMetricsRefreshKey((value) => value + 1);
    } catch (restoreError) {
      console.error("Restore business error:", restoreError);
      setError(restoreError instanceof Error ? restoreError.message : "We couldn't restore that business.");
    } finally {
      setRestoringId(null);
    }
  }

  const hasFilters = Boolean(query.trim() || status || verification || deletionFilter !== "ALL");
  const pageNumbers = useMemo(() => {
    const last = pagination.totalPages;
    if (last <= 5) return Array.from({ length: last }, (_, index) => index + 1);
    const first = Math.max(1, Math.min(page - 2, last - 4));
    return Array.from({ length: 5 }, (_, index) => first + index);
  }, [page, pagination.totalPages]);

  const visibleNav = NAV_ITEMS;

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F6F2EC] text-[#202B35]">
      <div className="flex min-h-dvh w-full">
        {/* Full-height desktop navigation */}
        <aside className="sticky top-0 hidden h-dvh w-[244px] shrink-0 flex-col bg-[#18242D] text-white xl:flex">
          <div className="flex h-[82px] items-center border-b border-white/10 px-6">
            <Link href="/admin" className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#FF5A36] text-lg font-black text-white shadow-[0_8px_22px_rgba(255,90,54,0.28)]">R</span>
              <span className="min-w-0">
                <span className="block text-[16px] font-black tracking-tight">ReMarket</span>
                <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Admin workspace</span>
              </span>
            </Link>
          </div>
          <div className="px-5 pt-7">
            <p className="px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/35">Manage platform</p>
          </div>
          <nav className="mt-3 flex-1 space-y-1 overflow-y-auto px-3 pb-5" aria-label="Admin navigation">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin/businesses";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group flex min-h-[45px] items-center gap-3 rounded-xl px-3.5 text-[13px] font-semibold transition ${active ? "bg-[#FF5A36] text-white shadow-[0_8px_22px_rgba(255,90,54,0.18)]" : "text-white/65 hover:bg-white/[0.07] hover:text-white"}`}
                >
                  <Icon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-white" : "text-white/45 group-hover:text-white"}`} />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </Link>
              );
            })}
          </nav>
          <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            <div className="flex items-center gap-2 text-[#FF9B7F]"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-extrabold uppercase tracking-[0.12em]">Merchant operations</span></div>
            <p className="mt-2 text-xs leading-5 text-white/55">Keep business listings accurate, visible and useful to nearby buyers.</p>
            <Link href="/admin/businesses/new" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-white transition hover:text-[#FFAD98]">Add a business <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
          <div className="flex h-[60px] items-center gap-3 border-t border-white/10 px-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10"><ShieldCheck className="h-4 w-4 text-[#FF9B7F]" /></div>
            <div><p className="text-xs font-bold">Trust & visibility</p><p className="mt-0.5 text-[10px] text-white/40">ReMarket administration</p></div>
          </div>
        </aside>

        <section className="flex min-h-dvh min-w-0 flex-1 flex-col">
          {/* Responsive top bar */}
          <header className="sticky top-0 z-30 flex h-[68px] shrink-0 items-center justify-between gap-3 border-b border-[#EAE2D9] bg-[#FFFDFC]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" aria-label="Back to admin overview" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#EAE2D9] bg-white text-[#756B62] transition hover:border-[#FFB19D] hover:text-[#9F2D18] xl:hidden">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <p className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-[#A0958A] sm:block">ReMarket / Admin</p>
                <h1 className="truncate text-[16px] font-black tracking-tight text-[#202B35] sm:mt-0.5 sm:text-lg">Business directory</h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => void refreshDirectory()} disabled={loading || refreshing} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#EAE2D9] bg-white px-3 text-xs font-bold text-[#6B6158] transition hover:border-[#D6C6B8] hover:bg-[#FCF8F4] disabled:cursor-wait disabled:opacity-55 sm:px-4">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <Link href="/" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#202B35] px-3 text-xs font-extrabold text-white transition hover:bg-[#344552] sm:px-4">Marketplace <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </div>
          </header>

          {/* Tablet / mobile navigation stays in document flow and scrolls horizontally */}
          <nav className="sticky top-[68px] z-20 border-b border-[#EAE2D9] bg-[#FFFDFC]/95 px-3 py-2 backdrop-blur-xl xl:hidden" aria-label="Admin navigation">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/businesses";
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold transition ${active ? "bg-[#FFE6DD] text-[#9F2D18]" : "text-[#776C62] hover:bg-[#F8F1E9]"}`}>
                    <Icon className="h-3.5 w-3.5" />{item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="min-w-0 flex-1 px-3 pb-10 pt-4 sm:px-5 sm:pt-6 lg:px-8 lg:pt-7 2xl:px-10">
            <div className="mx-auto w-full max-w-[1760px]">
              {/* Hero */}
              <section className="relative isolate overflow-hidden rounded-[24px] bg-[#202D37] px-5 py-6 text-white shadow-[0_14px_42px_rgba(31,43,53,0.12)] sm:px-7 sm:py-7 lg:px-9 lg:py-8">
                <div className="pointer-events-none absolute -right-10 -top-28 h-64 w-64 rounded-full border-[36px] border-white/[0.035] sm:right-10 sm:h-80 sm:w-80" />
                <div className="pointer-events-none absolute -bottom-28 right-[18%] h-56 w-56 rounded-full bg-[#FF5A36]/10 blur-3xl" />
                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#FF8D6D]" /> Merchant operations
                    </div>
                    <h2 className="mt-4 text-[28px] font-black leading-[1.05] tracking-[-0.04em] sm:text-4xl lg:text-[42px]">Every local business.<br /><span className="text-[#FF9B7F]">One clear view.</span></h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 sm:text-[15px]">Keep the ReMarket directory organised, verify real merchants, maintain availability, and help buyers discover the right businesses near them.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 lg:pb-1">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3.5 backdrop-blur sm:min-w-[138px]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/40">Results in view</p>
                      <p className="mt-1 text-2xl font-black">{loading ? "—" : pagination.total.toLocaleString("en-NG")}</p>
                      <p className="mt-0.5 text-[10px] text-white/45">match current filters</p>
                    </div>
                    <Link href="/admin/businesses/new" className="inline-flex h-[50px] items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(255,90,54,0.22)] transition hover:-translate-y-0.5 hover:bg-[#F04E2C]">
                      <Plus className="h-4 w-4" /> Add business
                    </Link>
                  </div>
                </div>
              </section>

              {/* Live directory metrics */}
              <section className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4 sm:gap-4" aria-label="Directory overview">
                <MetricCard label="All records" value={metrics?.all ?? null} hint="in directory" icon={Building2} tone="coral" loading={metricsLoading} onClick={() => { setStatus(""); setVerification(""); changeDeletionFilter("ALL"); }} selected={deletionFilter === "ALL" && !status && !verification} />
                <MetricCard label="Active businesses" value={metrics?.active ?? null} hint="status active" icon={CheckCircle2} tone="green" loading={metricsLoading} onClick={() => { setStatus("ACTIVE"); setVerification(""); changeDeletionFilter("ACTIVE"); }} selected={deletionFilter === "ACTIVE" && status === "ACTIVE" && !verification} />
                <MetricCard label="Pending status" value={metrics?.pending ?? null} hint="need review" icon={Clock3} tone="amber" loading={metricsLoading} onClick={() => { setStatus("PENDING"); setVerification(""); changeDeletionFilter("ACTIVE"); }} selected={deletionFilter === "ACTIVE" && status === "PENDING" && !verification} />
                <MetricCard label="Deleted records" value={metrics?.deleted ?? null} hint="restorable" icon={Trash2} tone="stone" loading={metricsLoading} onClick={() => { setStatus(""); setVerification(""); changeDeletionFilter("DELETED"); }} selected={deletionFilter === "DELETED" && !status && !verification} />
              </section>

              {success && (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-emerald-800" role="status">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100"><Check className="h-3.5 w-3.5" /></span>
                  <p className="min-w-0 flex-1 text-sm font-semibold leading-6">{success}</p>
                  <button type="button" onClick={() => setSuccess("")} aria-label="Dismiss success message" className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100"><X className="h-4 w-4" /></button>
                </div>
              )}
              {error && (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#F0C7BC] bg-[#FFF2EE] px-4 py-3.5 text-[#9F2D18]" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-6">{error}</p>
                  <button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="rounded-lg p-1 hover:bg-[#FFE5DD]"><X className="h-4 w-4" /></button>
                </div>
              )}

              {/* Search / filter workspace */}
              <section className="mt-6 overflow-visible rounded-[22px] border border-[#E9E1D8] bg-white shadow-[0_5px_24px_rgba(37,28,21,0.035)]">
                <div className="flex flex-col gap-4 border-b border-[#F0E9E1] px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#A63D25]"><SlidersHorizontal className="h-4 w-4" /></span>
                      <div>
                        <h3 className="text-sm font-black text-[#202B35] sm:text-base">Find and manage businesses</h3>
                        <p className="mt-0.5 text-xs text-[#93877D]">Search, filter and take action without leaving the directory.</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#8D8177]">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F8F4EF] px-3 py-1.5"><ArrowDownUp className="h-3.5 w-3.5" /> Sortable directory</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F8F4EF] px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Admin-only actions</span>
                  </div>
                </div>

                <div className="p-3 sm:p-4">
                  <div className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(145px,180px))]">
                    <label className="relative block min-w-0 sm:col-span-2 xl:col-span-1">
                      <span className="sr-only">Search businesses</span>
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9D9186]" />
                      <input
                        value={query}
                        onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                        maxLength={100}
                        placeholder="Search business, owner or description…"
                        className="h-11 w-full rounded-xl border border-[#E7DED4] bg-[#FCFAF7] pl-10 pr-10 text-sm text-[#202B35] outline-none transition placeholder:text-[#A69B91] focus:border-[#FF9376] focus:bg-white focus:ring-4 focus:ring-[#FF5A36]/10"
                      />
                      {query && <button type="button" onClick={() => { setQuery(""); setDebouncedQuery(""); setPage(1); }} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#958A80] hover:bg-[#F0E8E0]"><X className="h-3.5 w-3.5" /></button>}
                    </label>
                    <FilterSelect label="Deletion filter" value={deletionFilter} onChange={(value) => changeDeletionFilter(value as DeletionFilter)} options={[["ALL", "All records"], ["ACTIVE", "Not deleted"], ["DELETED", "Deleted only"]]} />
                    <FilterSelect label="Business status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[["", "Any status"], ["ACTIVE", "Active"], ["PENDING", "Pending"], ["INACTIVE", "Inactive"]]} />
                    <FilterSelect label="Verification status" value={verification} onChange={(value) => { setVerification(value); setPage(1); }} options={[["", "Any verification"], ["VERIFIED", "Verified"], ["UNVERIFIED", "Unverified"]]} />
                  </div>
                  <div className="mt-3 flex flex-col gap-3 border-t border-[#F2ECE5] pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A1968C]">Quick views</span>
                      {([
                        ["ALL", "All records"],
                        ["ACTIVE", "Not deleted"],
                        ["DELETED", "Deleted"],
                      ] as [DeletionFilter, string][]).map(([filter, label]) => (
                        <button key={filter} type="button" onClick={() => changeDeletionFilter(filter)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${deletionFilter === filter ? "bg-[#202B35] text-white" : "bg-[#F6F1EB] text-[#756A60] hover:bg-[#EEE5DA]"}`}>{label}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#84796F]">
                        <span>Sort</span>
                        <select value={sort} onChange={(event) => { setSort(event.target.value as SortMode); setPage(1); }} className="h-9 max-w-[170px] rounded-lg border border-[#E7DED4] bg-white px-2.5 text-xs font-bold text-[#5D534A] outline-none focus:border-[#FF9376]">
                          <option value="updatedAt">Recently updated</option>
                          <option value="onboardedAt">Newest onboarded</option>
                        </select>
                      </label>
                      {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFF0E8]"><RotateCcw className="h-3.5 w-3.5" /> Reset filters</button>}
                    </div>
                  </div>
                </div>
              </section>

              {/* Business directory */}
              <section className="mt-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black tracking-tight text-[#202B35] sm:text-xl">Business directory</h3>
                      <span className="rounded-full border border-[#E6DDD3] bg-white px-2.5 py-1 text-[10px] font-extrabold text-[#81756A]">{pagination.total.toLocaleString("en-NG")} results</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#93877D]">A responsive card view keeps each merchant’s status and actions easy to reach on every screen.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#84796F]">
                      <span>Per page</span>
                      <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-lg border border-[#E7DED4] bg-white px-2.5 text-xs font-bold text-[#5D534A] outline-none focus:border-[#FF9376]">
                        {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-[#8E8278]"><Store className="h-3.5 w-3.5" /> {businesses.length} loaded</span>
                  </div>
                </div>

                {loading ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[22px] border border-[#E9E1D8] bg-white px-5 py-12 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#FF5A36]"><LoaderCircle className="h-6 w-6 animate-spin" /></span>
                    <p className="mt-4 text-sm font-extrabold text-[#202B35]">Loading business directory</p>
                    <p className="mt-1 text-xs text-[#93877D]">Applying filters and refreshing the latest records.</p>
                  </div>
                ) : businesses.length === 0 ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[#DCCFC2] bg-white px-5 py-12 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#FFF0E8] text-[#A63D25]"><Search className="h-6 w-6" /></span>
                    <h4 className="mt-4 text-base font-black text-[#202B35]">{deletionFilter === "DELETED" ? "No deleted businesses" : "No businesses match this view"}</h4>
                    <p className="mt-1.5 max-w-md text-sm leading-6 text-[#8E8278]">{query ? "Try another search term or clear some filters to widen your results." : deletionFilter === "DELETED" ? "Soft-deleted businesses will appear here and can be restored." : "Once businesses are registered, they will appear here for review and management."}</p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {hasFilters && <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5DDD3] bg-white px-4 text-xs font-bold text-[#655A51] hover:bg-[#FAF5EF]"><RotateCcw className="h-3.5 w-3.5" /> Clear filters</button>}
                      {deletionFilter !== "DELETED" && <Link href="/admin/businesses/new" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-xs font-extrabold text-white hover:bg-[#E94B29]"><Plus className="h-3.5 w-3.5" /> Add business</Link>}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid min-w-0 grid-cols-1 gap-3.5 md:grid-cols-2 2xl:grid-cols-3 2xl:gap-4">
                      {businesses.map((business) => (
                        <BusinessCard
                          key={business.id}
                          business={business}
                          updating={updatingId === business.id}
                          deleting={deletingId === business.id}
                          restoring={restoringId === business.id}
                          onUpdate={updateBusiness}
                          onDelete={() => setConfirmDeleteBusiness(business)}
                          onRestore={() => void restoreBusiness(business)}
                        />
                      ))}
                    </div>
                    {pagination.totalPages > 1 && (
                      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#E9E1D8] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <p className="text-xs font-semibold text-[#8B8076]">Showing <span className="font-black text-[#202B35]">{startRecord.toLocaleString("en-NG")}–{endRecord.toLocaleString("en-NG")}</span> of <span className="font-black text-[#202B35]">{pagination.total.toLocaleString("en-NG")}</span> businesses</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button type="button" disabled={!pagination.hasPreviousPage || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E8DED5] bg-white px-3 text-xs font-bold text-[#665B52] hover:bg-[#FAF5EF] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span></button>
                          {pageNumbers.map((number) => (
                            <button key={number} type="button" aria-current={page === number ? "page" : undefined} onClick={() => setPage(number)} className={`h-9 min-w-9 rounded-xl px-2.5 text-xs font-extrabold transition ${page === number ? "bg-[#202B35] text-white" : "border border-[#E8DED5] bg-white text-[#665B52] hover:bg-[#FAF5EF]"}`}>{number}</button>
                          ))}
                          <button type="button" disabled={!pagination.hasNextPage || loading} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="inline-flex h-9 items-center gap-1 rounded-xl bg-[#FF5A36] px-3 text-xs font-extrabold text-white hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-40"><span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" /></button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>

              <footer className="mt-8 flex flex-col gap-2 border-t border-[#E6DDD3] py-5 text-[11px] text-[#9A8F85] sm:flex-row sm:items-center sm:justify-between">
                <p className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Administrative changes are applied to the ReMarket directory.</p>
                <p>Showing {businesses.length} on this page{pagination.total ? ` · ${pagination.total.toLocaleString("en-NG")} matching records` : ""}</p>
              </footer>
            </div>
          </div>
        </section>
      </div>

      {confirmDeleteBusiness && (
        <DeleteConfirmationModal
          business={confirmDeleteBusiness}
          loading={deletingId === confirmDeleteBusiness.id}
          onCancel={() => setConfirmDeleteBusiness(null)}
          onConfirm={() => void deleteBusiness(confirmDeleteBusiness)}
        />
      )}
    </main>
  );
}
