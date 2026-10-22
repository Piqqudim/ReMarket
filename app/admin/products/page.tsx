"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  ExternalLink,
  Eye,
  Filter,
  LayoutDashboard,
  Megaphone,
  Package,
  Pencil,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  Tags,
  Trash2,
  X,
} from "lucide-react";

type ProductStatus = "ACTIVE" | "INACTIVE" | "PENDING";
type ProductAvailability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: ProductAvailability;
  status: ProductStatus;
  imageUrl: string | null;
  deletedAt: string | null;
  business: {
    id: string;
    name: string;
    area: string;
    deletedAt: string | null;
  };
  category: string | null;
  updatedAt: string;
};

type ProductChanges = {
  availability?: ProductAvailability;
  status?: ProductStatus;
};

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Content", href: "/admin/content", icon: Megaphone },
  { label: "Deletion requests", href: "/admin/business-deletion-requests", icon: Trash2 },
];

const inputClass =
  "h-11 w-full min-w-0 rounded-xl border border-[#E7DED5] bg-white px-3 text-sm text-[#28221E] outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:ring-4 focus:ring-[#FF5A36]/10";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiError(data: unknown, fallback: string): string {
  return isRecord(data) && typeof data.error === "string" && data.error.trim()
    ? data.error
    : fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isProductStatus(value: unknown): value is ProductStatus {
  return value === "ACTIVE" || value === "INACTIVE" || value === "PENDING";
}

function isAvailability(value: unknown): value is ProductAvailability {
  return value === "AVAILABLE" || value === "ASK_SELLER" || value === "UNAVAILABLE";
}

function normalizeProduct(value: unknown): Product | null {
  if (!isRecord(value) || !isRecord(value.business)) return null;
  const business = value.business;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof business.id !== "string" ||
    typeof business.name !== "string" ||
    !isProductStatus(value.status) ||
    !isAvailability(value.availability)
  ) {
    return null;
  }

  const nullableNumber = (input: unknown): number | null =>
    typeof input === "number" && Number.isFinite(input) ? input : null;

  const nullableString = (input: unknown): string | null =>
    typeof input === "string" && input.trim() ? input : null;

  const rawCategory = value.category;
  const category = typeof rawCategory === "string"
    ? rawCategory
    : isRecord(rawCategory) && typeof rawCategory.name === "string"
      ? rawCategory.name
      : null;

  return {
    id: value.id,
    name: value.name,
    description: nullableString(value.description),
    price: nullableNumber(value.price),
    priceMin: nullableNumber(value.priceMin),
    priceMax: nullableNumber(value.priceMax),
    availability: value.availability,
    status: value.status,
    imageUrl: nullableString(value.imageUrl),
    deletedAt: nullableString(value.deletedAt),
    business: {
      id: business.id,
      name: business.name,
      area: typeof business.area === "string" ? business.area : "Area not provided",
      deletedAt: nullableString(business.deletedAt),
    },
    category,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

function formatDate(value: string): string {
  if (!value) return "Date unavailable";
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

function availabilityLabel(value: ProductAvailability): string {
  switch (value) {
    case "AVAILABLE": return "Available";
    case "ASK_SELLER": return "Ask seller";
    default: return "Unavailable";
  }
}

function statusStyle(value: ProductStatus): string {
  switch (value) {
    case "ACTIVE": return "border-[#BFE8D7] bg-[#E9F8F1] text-[#18714D]";
    case "PENDING": return "border-[#F3D89A] bg-[#FFF7DF] text-[#91680C]";
    default: return "border-[#E4DDD6] bg-[#F5F2EE] text-[#71675F]";
  }
}

function availabilityStyle(value: ProductAvailability): string {
  switch (value) {
    case "AVAILABLE": return "bg-[#E9F8F1] text-[#18714D]";
    case "UNAVAILABLE": return "bg-[#FFF0ED] text-[#AD3A2A]";
    default: return "bg-[#FFF7DF] text-[#91680C]";
  }
}

function priceLabel(product: Product): string {
  if (product.price !== null) return `₦${product.price.toLocaleString("en-NG")}`;
  if (product.priceMin !== null && product.priceMax !== null) {
    return `₦${product.priceMin.toLocaleString("en-NG")} – ₦${product.priceMax.toLocaleString("en-NG")}`;
  }
  if (product.priceMin !== null) return `From ₦${product.priceMin.toLocaleString("en-NG")}`;
  if (product.priceMax !== null) return `Up to ₦${product.priceMax.toLocaleString("en-NG")}`;
  return "Price on request";
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [availability, setAvailability] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadProducts = useCallback(async (signal?: AbortSignal, manual = false) => {
    try {
      setLoading(true);
      setError("");
      if (manual) setRefreshing(true);

      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      if (availability) params.set("availability", availability);

      const response = await fetch(`/api/admin/products?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });
      const data = await readJson(response);

      if (!response.ok) throw new Error(apiError(data, "Unable to load products."));
      if (!isRecord(data) || !Array.isArray(data.products)) {
        throw new Error("The products response was invalid.");
      }

      const nextProducts = data.products
        .map(normalizeProduct)
        .filter((product): product is Product => product !== null);

      if (!signal?.aborted) {
        setProducts(nextProducts);
        setSuccess("");
      }
    } catch (loadError) {
      if (signal?.aborted) return;
      console.error("Load admin products error:", loadError);
      setError(loadError instanceof Error ? loadError.message : "We couldn't load the products.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [query, status, availability]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadProducts(controller.signal), 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadProducts]);

  const summary = useMemo(() => ({
    total: products.length,
    active: products.filter((product) => product.status === "ACTIVE").length,
    pending: products.filter((product) => product.status === "PENDING").length,
    unavailable: products.filter((product) => product.availability === "UNAVAILABLE").length,
  }), [products]);

  async function updateProduct(product: Product, changes: ProductChanges) {
    if (product.deletedAt || product.business.deletedAt) {
      setError(product.deletedAt
        ? "This product has been deleted and cannot be updated."
        : "This product belongs to a deleted business and cannot be updated.");
      return;
    }

    setUpdatingId(product.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/businesses/${encodeURIComponent(product.business.id)}/products/${encodeURIComponent(product.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        },
      );
      const data = await readJson(response);
      if (!response.ok) throw new Error(apiError(data, "Unable to update product."));

      const updatedAt = isRecord(data) && isRecord(data.product) && typeof data.product.updatedAt === "string"
        ? data.product.updatedAt
        : new Date().toISOString();

      setProducts((current) => current.map((item) => item.id === product.id
        ? { ...item, ...changes, updatedAt }
        : item));
      setSuccess(`${product.name} was updated successfully.`);
    } catch (updateError) {
      console.error("Update admin product error:", updateError);
      setError(updateError instanceof Error ? updateError.message : "We couldn't update that product.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F7F3ED] text-[#28221E]">
      <div className="flex min-h-dvh w-full">
        {/* Desktop rail: owns the viewport height, without narrowing the page on tablets. */}
        <aside className="sticky top-0 hidden h-dvh w-[228px] shrink-0 flex-col border-r border-[#E9DED3] bg-[#FFFEFC] xl:flex">
          <div className="border-b border-[#EEE5DC] px-5 py-6">
            <Link href="/admin" className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF5A36] text-lg font-black text-white shadow-[0_8px_18px_rgba(255,90,54,0.22)]">R</span>
              <span className="min-w-0"><span className="block text-base font-black tracking-tight">ReMarket</span><span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#A69A8F]">Admin studio</span></span>
            </Link>
          </div>

          <nav aria-label="Admin navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
            <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A69A8F]">Workspace</p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin/products";
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#746960] hover:bg-[#F8F2EC] hover:text-[#28221E]"}`}>
                <Icon className={`h-[18px] w-[18px] ${active ? "text-[#FF5A36]" : "text-[#A69A8F] group-hover:text-[#9F2D18]"}`} />
                <span className="min-w-0 flex-1">{item.label}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />}
              </Link>;
            })}
          </nav>

          <div className="border-t border-[#EEE5DC] p-4">
            <div className="rounded-2xl bg-[#FFF5EE] p-4">
              <div className="flex items-center gap-2 text-[#9F2D18]"><Activity size={16} /><span className="text-xs font-black">Catalog pulse</span></div>
              <p className="mt-2 text-xs leading-5 text-[#806D60]">Review product availability and listing status to keep local discovery useful.</p>
              <Link href="/admin/businesses" className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-[#9F2D18] hover:underline">Manage businesses <ArrowRight size={13} /></Link>
            </div>
          </div>
        </aside>

        <section className="flex min-h-dvh min-w-0 flex-1 flex-col">
          {/* Header stays inside the content column; the page itself remains the only vertical scroller. */}
          <header className="sticky top-0 z-30 border-b border-[#E9DED3] bg-[#FFFEFC]/95 px-4 py-3 backdrop-blur-md sm:px-6 xl:px-8">
            <div className="flex min-h-[42px] min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Link href="/admin" aria-label="Back to admin overview" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E9DED3] bg-white text-[#75695F] transition hover:border-[#FFB6A4] hover:text-[#9F2D18] xl:hidden"><ArrowLeft size={17} /></Link>
                <div className="min-w-0"><p className="hidden text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A69A8F] sm:block">Marketplace operations / Catalog</p><h1 className="truncate text-lg font-black tracking-tight sm:mt-0.5 sm:text-xl">Product control room</h1></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-full border border-[#D7EADF] bg-[#F0FAF4] px-3 py-2 text-[11px] font-extrabold text-[#18714D] md:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#2D9A6B]" />Admin workspace</span>
                <button type="button" onClick={() => void loadProducts(undefined, true)} disabled={loading || refreshing} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E9DED3] bg-white px-3 text-xs font-extrabold text-[#62574E] transition hover:border-[#FFB6A4] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-60" aria-label="Refresh products">
                  <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /><span className="hidden sm:inline">Refresh</span>
                </button>
                <Link href="/" className="hidden h-10 items-center gap-2 rounded-xl bg-[#28221E] px-3 text-xs font-extrabold text-white transition hover:bg-[#4A3B32] sm:inline-flex">Marketplace <ExternalLink size={14} /></Link>
              </div>
            </div>
          </header>

          <div className="w-full flex-1 px-4 py-5 sm:px-6 sm:py-7 xl:px-8">
            <div className="mx-auto w-full max-w-[1700px]">
              {/* Tablet/mobile navigation: single horizontal rail, never a 2-row grid that forces the page wider/taller. */}
              <nav aria-label="Admin sections" className="mb-6 flex w-full items-center gap-2 overflow-x-auto pb-1 xl:hidden">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = item.href === "/admin/products";
                  return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition ${active ? "border-[#FF5A36] bg-[#FF5A36] text-white shadow-[0_6px_14px_rgba(255,90,54,0.18)]" : "border-[#E9DED3] bg-white text-[#746960] hover:border-[#FFB6A4] hover:text-[#9F2D18]"}`}><Icon size={15} /><span>{item.label}</span></Link>;
                })}
              </nav>

              {/* Intro */}
              <section className="relative mb-6 overflow-hidden rounded-[26px] bg-[#2B231F] px-5 py-6 text-white shadow-[0_16px_38px_rgba(54,40,30,0.12)] sm:px-7 sm:py-7 xl:px-8">
                <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-white/[0.045]" />
                <div className="pointer-events-none absolute -bottom-20 right-28 h-44 w-44 rounded-full bg-[#FF5A36]/15 blur-2xl" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0 max-w-3xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FFC2B3]"><Package size={13} /> ReMarket catalog</div>
                    <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl xl:text-[34px]">Products, at a glance.</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Keep listings useful and accurate. Search the catalog, review pending items, and update availability without leaving this workspace.</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4 lg:min-w-[220px]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF5A36] text-white"><Tags size={20} /></div>
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/50">Current result set</p><p className="mt-1 text-2xl font-black tabular-nums">{loading ? "—" : summary.total.toLocaleString("en-NG")}</p></div>
                  </div>
                </div>
              </section>

              {/* Result-set indicators; labels deliberately make it clear these describe the fetched/filtered results. */}
              <section aria-label="Product result summary" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <MetricCard label="Products shown" value={summary.total} caption="Matching current filters" icon={Package} tone="orange" />
                <MetricCard label="Active shown" value={summary.active} caption="Live within results" icon={CheckCircle2} tone="green" />
                <MetricCard label="Pending shown" value={summary.pending} caption="Needs review" icon={Clock3} tone="gold" />
                <MetricCard label="Unavailable shown" value={summary.unavailable} caption="Marked unavailable" icon={AlertCircle} tone="rose" />
              </section>

              {/* Filters */}
              <section className="mb-5 rounded-[22px] border border-[#E9DED3] bg-white p-4 shadow-[0_5px_18px_rgba(70,48,30,0.035)] sm:p-5">
                <div className="mb-3 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF0E8] text-[#9F2D18]"><SlidersHorizontal size={16} /></span><div><h3 className="text-sm font-black">Find a product</h3><p className="text-[11px] text-[#9A8D82]">Filters update automatically</p></div><span className="ml-auto hidden items-center gap-1.5 text-[10px] font-bold text-[#9A8D82] sm:inline-flex"><Filter size={13} /> CATALOG FILTERS</span></div>
                <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(150px,190px)_minmax(170px,210px)]">
                  <div className="relative min-w-0"><Search size={17} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A69A8F]" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product or business name…" aria-label="Search products or businesses" className={`${inputClass} pl-10 pr-10`} />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[#9A8D82] hover:bg-[#F7F1EB] hover:text-[#9F2D18]"><X size={14} /></button>}</div>
                  <FilterSelect value={status} onChange={setStatus} label="Product status" options={[["", "All statuses"], ["ACTIVE", "Active"], ["INACTIVE", "Inactive"], ["PENDING", "Pending review"]]} />
                  <FilterSelect value={availability} onChange={setAvailability} label="Product availability" options={[["", "All availability"], ["AVAILABLE", "Available"], ["ASK_SELLER", "Ask seller"], ["UNAVAILABLE", "Unavailable"]]} />
                </div>
                {(query || status || availability) && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold text-[#9A8D82]">Active filters:</span>{query && <FilterChip label={`Search: ${query}`} onRemove={() => setQuery("")} />}{status && <FilterChip label={`Status: ${status.toLowerCase()}`} onRemove={() => setStatus("")} />}{availability && <FilterChip label={`Availability: ${availabilityLabel(availability as ProductAvailability).toLowerCase()}`} onRemove={() => setAvailability("")} />}<button type="button" onClick={() => { setQuery(""); setStatus(""); setAvailability(""); }} className="ml-auto text-[11px] font-extrabold text-[#9F2D18] hover:underline">Clear all</button></div>}
              </section>

              {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#F2C7BC] bg-[#FFF0ED] px-4 py-3.5 text-sm text-[#9F2D18]"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div className="min-w-0 flex-1"><p className="font-bold">Something needs attention</p><p className="mt-0.5 leading-5">{error}</p></div><button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="rounded-lg p-1 hover:bg-white/70"><X size={16} /></button></div>}
              {success && <div role="status" aria-live="polite" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#C7E9D7] bg-[#EFFAF4] px-4 py-3 text-sm text-[#18714D]"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><p className="font-semibold">{success}</p><button type="button" onClick={() => setSuccess("")} aria-label="Dismiss success message" className="ml-auto rounded-lg p-1 hover:bg-white/70"><X size={15} /></button></div>}

              {/* Catalog */}
              <section className="overflow-hidden rounded-[22px] border border-[#E9DED3] bg-white shadow-[0_5px_18px_rgba(70,48,30,0.035)]">
                <div className="flex flex-col gap-3 border-b border-[#EEE5DC] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F7F1EB] text-[#9F2D18]"><Package size={18} /></div><div className="min-w-0"><h3 className="text-sm font-black">Catalog listings</h3><p className="mt-0.5 text-xs text-[#968A80]">{loading ? "Refreshing listings…" : `${products.length.toLocaleString("en-NG")} matching ${products.length === 1 ? "listing" : "listings"}`}</p></div></div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-[#968A80]"><span className="inline-flex h-2 w-2 rounded-full bg-[#32A36F]" /> Updates are saved to the server</div>
                </div>

                {loading ? <LoadingState /> : products.length === 0 ? <EmptyState hasFilters={Boolean(query || status || availability)} onClear={() => { setQuery(""); setStatus(""); setAvailability(""); }} /> : <>
                  {/* Desktop table only starts at large widths; tablet uses cards to avoid forced horizontal scrolling. */}
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full min-w-[920px] border-collapse text-left">
                      <thead className="bg-[#FCFAF6]"><tr className="border-b border-[#EEE5DC] text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#9A8D82]"><th className="px-5 py-3.5">Product listing</th><th className="px-4 py-3.5">Business</th><th className="px-4 py-3.5">Price</th><th className="px-4 py-3.5">Availability</th><th className="px-4 py-3.5">Status</th><th className="px-5 py-3.5 text-right">Actions</th></tr></thead>
                      <tbody className="divide-y divide-[#F0E9E2]">{products.map((product) => <ProductRow key={product.id} product={product} updating={updatingId === product.id} onUpdate={updateProduct} />)}</tbody>
                    </table>
                  </div>

                  <div className="hidden divide-y divide-[#EEE5DC] md:block lg:hidden">{products.map((product) => <ProductWideCard key={product.id} product={product} updating={updatingId === product.id} onUpdate={updateProduct} />)}</div>
                  <div className="divide-y divide-[#EEE5DC] md:hidden">{products.map((product) => <ProductMobileCard key={product.id} product={product} updating={updatingId === product.id} onUpdate={updateProduct} />)}</div>
                </>}
                <div className="flex flex-col gap-2 border-t border-[#EEE5DC] bg-[#FFFEFC] px-4 py-3.5 text-[11px] text-[#968A80] sm:flex-row sm:items-center sm:justify-between sm:px-5"><span>Showing all results returned by the current product API.</span><Link href="/admin/businesses" className="inline-flex items-center gap-1.5 font-extrabold text-[#9F2D18] hover:underline">View businesses <ArrowRight size={13} /></Link></div>
              </section>

              <footer className="flex flex-col gap-2 py-6 text-[10px] font-semibold text-[#A69A8F] sm:flex-row sm:items-center sm:justify-between"><span>ReMarket · Admin Studio</span><span>Product moderation and availability</span></footer>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  icon: typeof Package;
  tone: "orange" | "green" | "gold" | "rose";
}) {
  const palette = {
    orange: "bg-[#FFF0E8] text-[#9F2D18]",
    green: "bg-[#E9F8F1] text-[#18714D]",
    gold: "bg-[#FFF7DF] text-[#91680C]",
    rose: "bg-[#FFF0ED] text-[#AD3A2A]",
  }[tone];
  return <article className="min-w-0 rounded-2xl border border-[#E9DED3] bg-white p-4 shadow-[0_4px_14px_rgba(70,48,30,0.025)] sm:p-5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-bold text-[#8D8177] sm:text-xs">{label}</p><p className="mt-2 text-2xl font-black tracking-tight text-[#28221E] sm:text-[28px]">{value.toLocaleString("en-NG")}</p></div><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${palette}`}><Icon size={17} /></span></div><p className="mt-3 truncate text-[10px] font-semibold text-[#A69A8F] sm:text-[11px]">{caption}</p></article>;
}

function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: [string, string][] }) {
  return <div className="relative min-w-0"><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className={`${inputClass} appearance-none pr-9 font-semibold`}><>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</></select><ChevronDown size={15} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8D8177]" /></div>;
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#E9DED3] bg-[#FCFAF6] py-1 pl-2.5 pr-1 text-[10px] font-bold text-[#71675F]"><span className="max-w-[220px] truncate">{label}</span><button type="button" onClick={onRemove} aria-label={`Remove ${label} filter`} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md hover:bg-[#FFF0E8] hover:text-[#9F2D18]"><X size={12} /></button></span>;
}

function LoadingState() {
  return <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[150px] animate-pulse rounded-2xl border border-[#EEE5DC] bg-[#FCFAF6]" />)}</div>;
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return <div className="px-5 py-14 text-center sm:py-16"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#FF5A36]"><Package size={25} /></div><h3 className="mt-4 text-base font-black text-[#28221E]">{hasFilters ? "No matching products" : "Your catalog is quiet"}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#8D8177]">{hasFilters ? "Try removing a filter or changing the search to see more listings." : "Products added by ReMarket businesses will appear here."}</p>{hasFilters && <button type="button" onClick={onClear} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-[#E94B29]">Clear filters <X size={14} /></button>}</div>;
}

function ProductRow({ product, updating, onUpdate }: { product: Product; updating: boolean; onUpdate: (product: Product, changes: ProductChanges) => void | Promise<void> }) {
  const locked = Boolean(product.deletedAt || product.business.deletedAt);
  return <tr className={`transition hover:bg-[#FFFCF8] ${locked ? "bg-[#FCFAF6]" : ""}`}><td className="px-5 py-4"><div className="flex min-w-0 items-center gap-3"><ProductImage product={product} /><div className="min-w-0"><p className="max-w-[260px] truncate text-sm font-extrabold text-[#28221E]">{product.name}</p><p className="mt-1 text-[11px] text-[#A1968C]">{product.category || "No category"}{product.deletedAt ? " · Deleted" : ""}</p></div></div></td><td className="px-4 py-4"><Link href={`/admin/businesses/${encodeURIComponent(product.business.id)}`} className="block max-w-[200px] truncate text-xs font-extrabold text-[#4D4139] hover:text-[#9F2D18]">{product.business.name}</Link><p className="mt-1 truncate text-[11px] text-[#A1968C]">{product.business.area}</p>{product.business.deletedAt && <p className="mt-1 text-[10px] font-bold text-[#AD3A2A]">Business deleted</p>}</td><td className="whitespace-nowrap px-4 py-4 text-xs font-extrabold text-[#28221E]">{priceLabel(product)}</td><td className="px-4 py-4"><AvailabilityButton product={product} updating={updating} locked={locked} onUpdate={onUpdate} /></td><td className="px-4 py-4"><StatusButton product={product} updating={updating} locked={locked} onUpdate={onUpdate} /></td><td className="px-5 py-4"><ProductActions product={product} locked={locked} /></td></tr>;
}

function ProductWideCard({ product, updating, onUpdate }: { product: Product; updating: boolean; onUpdate: (product: Product, changes: ProductChanges) => void | Promise<void> }) {
  const locked = Boolean(product.deletedAt || product.business.deletedAt);
  return <article className={`p-4 transition hover:bg-[#FFFCF8] sm:p-5 ${locked ? "bg-[#FCFAF6]" : ""}`}><div className="flex min-w-0 items-start gap-4"><ProductImage product={product} large /><div className="min-w-0 flex-1"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-black text-[#28221E]">{product.name}</h3>{product.deletedAt && <RecordBadge label="Deleted product" tone="muted" />}{product.business.deletedAt && <RecordBadge label="Deleted business" tone="rose" />}</div><Link href={`/admin/businesses/${encodeURIComponent(product.business.id)}`} className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-bold text-[#9F2D18] hover:underline"><Store size={12} />{product.business.name}</Link><p className="mt-1 text-[11px] text-[#9A8D82]">{product.business.area} · {product.category || "No category"}</p><p className="mt-2 text-sm font-black text-[#9F2D18]">{priceLabel(product)}</p></div><div className="flex flex-wrap gap-2 xl:justify-end"><StatusButton product={product} updating={updating} locked={locked} onUpdate={onUpdate} /><AvailabilityButton product={product} updating={updating} locked={locked} onUpdate={onUpdate} /></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#F0E9E2] pt-3"><p className="flex items-center gap-1.5 text-[10px] font-semibold text-[#A1968C]"><Clock3 size={12} /> Updated {formatDate(product.updatedAt)}</p><ProductActions product={product} locked={locked} /></div></div></div></article>;
}

function ProductMobileCard({ product, updating, onUpdate }: { product: Product; updating: boolean; onUpdate: (product: Product, changes: ProductChanges) => void | Promise<void> }) {
  const locked = Boolean(product.deletedAt || product.business.deletedAt);
  return <article className={`p-4 ${locked ? "bg-[#FCFAF6]" : ""}`}><div className="flex min-w-0 items-start gap-3"><ProductImage product={product} large /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start gap-1.5"><h3 className="min-w-0 flex-1 break-words text-sm font-black text-[#28221E]">{product.name}</h3>{product.deletedAt && <RecordBadge label="Deleted" tone="muted" />}</div><Link href={`/admin/businesses/${encodeURIComponent(product.business.id)}`} className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-bold text-[#9F2D18]"><Store size={12} className="shrink-0" /><span className="truncate">{product.business.name}</span></Link><p className="mt-1 truncate text-[11px] text-[#9A8D82]">{product.business.area} · {product.category || "No category"}</p><p className="mt-2 text-base font-black text-[#9F2D18]">{priceLabel(product)}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><StatusButton product={product} updating={updating} locked={locked} onUpdate={onUpdate} /><AvailabilityButton product={product} updating={updating} locked={locked} onUpdate={onUpdate} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#F0E9E2] pt-3"><p className="flex items-center gap-1 text-[10px] font-semibold text-[#A1968C]"><Clock3 size={12} /> {formatDate(product.updatedAt)}</p><ProductActions product={product} locked={locked} /></div></article>;
}

function ProductImage({ product, large = false }: { product: Product; large?: boolean }) {
  const size = large ? "h-[58px] w-[58px] sm:h-[68px] sm:w-[68px]" : "h-12 w-12";
  if (product.imageUrl && /^https?:\/\//i.test(product.imageUrl)) {
    return <img src={product.imageUrl} alt="" loading="lazy" className={`${size} shrink-0 rounded-2xl border border-[#EEE5DC] bg-[#FCFAF6] object-cover`} />;
  }
  return <div className={`${size} flex shrink-0 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#FF5A36]`}><Package size={large ? 22 : 19} /></div>;
}

function ProductActions({ product, locked }: { product: Product; locked: boolean }) {
  return <div className="flex flex-wrap items-center gap-2">{locked ? <span title="Deleted products or products belonging to deleted businesses cannot be edited." className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#F0ECE7] px-3 text-[11px] font-extrabold text-[#A1968C]"><Pencil size={13} /> Edit locked</span> : <Link href={`/admin/businesses/${encodeURIComponent(product.business.id)}/products/${encodeURIComponent(product.id)}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#FF5A36] px-3 text-[11px] font-extrabold text-white transition hover:bg-[#E94B29]"><Pencil size={13} /> Edit product</Link>}<Link href={`/admin/businesses/${encodeURIComponent(product.business.id)}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E9DED3] bg-white px-3 text-[11px] font-extrabold text-[#71675F] transition hover:border-[#FFB6A4] hover:text-[#9F2D18]"><Eye size={13} /> Business <ArrowRight size={12} /></Link></div>;
}

function AvailabilityButton({ product, updating, locked, onUpdate }: { product: Product; updating: boolean; locked: boolean; onUpdate: (product: Product, changes: ProductChanges) => void | Promise<void> }) {
  const next: ProductAvailability = product.availability === "AVAILABLE" ? "ASK_SELLER" : product.availability === "ASK_SELLER" ? "UNAVAILABLE" : "AVAILABLE";
  return <button type="button" disabled={updating || locked} title={locked ? "Deleted records cannot be updated." : `Change availability from ${availabilityLabel(product.availability)} to ${availabilityLabel(next)}`} onClick={() => void onUpdate(product, { availability: next })} className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-[11px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${availabilityStyle(product.availability)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{availabilityLabel(product.availability)}<ChevronDown size={12} /></button>;
}

function StatusButton({ product, updating, locked, onUpdate }: { product: Product; updating: boolean; locked: boolean; onUpdate: (product: Product, changes: ProductChanges) => void | Promise<void> }) {
  const next: ProductStatus = product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  return <button type="button" disabled={updating || locked} title={locked ? "Deleted records cannot be updated." : `Change status from ${product.status.toLowerCase()} to ${next.toLowerCase()}`} onClick={() => void onUpdate(product, { status: next })} className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${statusStyle(product.status)}`}>{product.status === "ACTIVE" ? <Check size={12} /> : product.status === "PENDING" ? <Clock3 size={12} /> : <X size={12} />}{product.status === "PENDING" ? "Pending review" : product.status === "ACTIVE" ? "Active" : "Inactive"}<ChevronDown size={12} /></button>;
}

function RecordBadge({ label, tone }: { label: string; tone: "muted" | "rose" }) {
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide ${tone === "rose" ? "bg-[#FFF0ED] text-[#AD3A2A]" : "bg-[#F0ECE7] text-[#71675F]"}`}>{label}</span>;
}
