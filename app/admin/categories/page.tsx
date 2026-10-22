"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownUp,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Building2,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Coffee,
  Cpu,
  Dumbbell,
  Eye,
  Filter,
  Gift,
  Heart,
  Home,
  Laptop,
  Layers3,
  LoaderCircle,
  MapPin,
  Megaphone,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Scissors,
  Shirt,
  Smartphone,
  Sparkles,
  Store,
  Tag,
  TrendingUp,
  Users,
  Utensils,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  DEFAULT_CATEGORIES,
  getCategoryIcon,
  type ReMarketCategory,
} from "@/lib/categories";

type Category = {
  id: string;
  name: string;
  iconKey: string;
  isActive: boolean;
  sortOrder: number;
  _count: {
    business: number;
    products: number;
    requests: number;
  };
};

type CategoryStatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "UNUSED";
type CategorySort = "ORDER" | "NAME" | "BUSINESSES" | "PRODUCTS" | "REQUESTS";

type IconTone = {
  background: string;
  text: string;
  selectedBackground: string;
  selectedText: string;
};

type IconDefinition = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: IconTone;
};

type ApiResponse = {
  error?: unknown;
  categories?: unknown;
  category?: unknown;
};

const TONES = {
  coral: { background: "bg-[#FFE0D6]", text: "text-[#9F2D18]", selectedBackground: "bg-[#FFE0D6]", selectedText: "text-[#9F2D18]" },
  pink: { background: "bg-[#FCE7F3]", text: "text-[#BE185D]", selectedBackground: "bg-[#FBCFE8]", selectedText: "text-[#9D174D]" },
  sky: { background: "bg-[#E0F2FE]", text: "text-[#0369A1]", selectedBackground: "bg-[#BAE6FD]", selectedText: "text-[#075985]" },
  violet: { background: "bg-[#EDE9FE]", text: "text-[#6D28D9]", selectedBackground: "bg-[#DDD6FE]", selectedText: "text-[#5B21B6]" },
  cyan: { background: "bg-[#CFFAFE]", text: "text-[#0E7490]", selectedBackground: "bg-[#A5F3FC]", selectedText: "text-[#155E75]" },
  orange: { background: "bg-[#FFEDD5]", text: "text-[#C2410C]", selectedBackground: "bg-[#FED7AA]", selectedText: "text-[#9A3412]" },
  amber: { background: "bg-[#FEF3C7]", text: "text-[#B45309]", selectedBackground: "bg-[#FDE68A]", selectedText: "text-[#92400E]" },
  purple: { background: "bg-[#F3E8FF]", text: "text-[#7E22CE]", selectedBackground: "bg-[#E9D5FF]", selectedText: "text-[#6B21A8]" },
  rose: { background: "bg-[#FFE4E6]", text: "text-[#BE123C]", selectedBackground: "bg-[#FECDD3]", selectedText: "text-[#9F1239]" },
  teal: { background: "bg-[#CCFBF1]", text: "text-[#0F766E]", selectedBackground: "bg-[#99F6E4]", selectedText: "text-[#115E59]" },
  slate: { background: "bg-[#F1F5F9]", text: "text-[#475569]", selectedBackground: "bg-[#E2E8F0]", selectedText: "text-[#334155]" },
  blue: { background: "bg-[#DBEAFE]", text: "text-[#1D4ED8]", selectedBackground: "bg-[#BFDBFE]", selectedText: "text-[#1E40AF]" },
  stone: { background: "bg-[#F5F5F4]", text: "text-[#57534E]", selectedBackground: "bg-[#E7E5E4]", selectedText: "text-[#44403C]" },
  green: { background: "bg-[#D1FAE5]", text: "text-[#047857]", selectedBackground: "bg-[#A7F3D0]", selectedText: "text-[#065F46]" },
  lime: { background: "bg-[#ECFCCB]", text: "text-[#4D7C0F]", selectedBackground: "bg-[#D9F99D]", selectedText: "text-[#3F6212]" },
} satisfies Record<string, IconTone>;

const ICONS: IconDefinition[] = [
  { key: "Store", label: "Store", icon: Store, tone: TONES.coral },
  { key: "Shirt", label: "Fashion", icon: Shirt, tone: TONES.pink },
  { key: "Smartphone", label: "Phone", icon: Smartphone, tone: TONES.sky },
  { key: "Laptop", label: "Laptop", icon: Laptop, tone: TONES.violet },
  { key: "Cpu", label: "Electronics", icon: Cpu, tone: TONES.cyan },
  { key: "Utensils", label: "Food", icon: Utensils, tone: TONES.orange },
  { key: "Coffee", label: "Cafe", icon: Coffee, tone: TONES.amber },
  { key: "Sparkles", label: "Beauty", icon: Sparkles, tone: TONES.purple },
  { key: "Scissors", label: "Salon", icon: Scissors, tone: TONES.rose },
  { key: "Layers3", label: "Textiles", icon: Layers3, tone: TONES.teal },
  { key: "Wrench", label: "Services", icon: Wrench, tone: TONES.slate },
  { key: "Briefcase", label: "Business", icon: Briefcase, tone: TONES.blue },
  { key: "Building2", label: "Building", icon: Building2, tone: TONES.stone },
  { key: "Home", label: "Home", icon: Home, tone: TONES.green },
  { key: "Car", label: "Automotive", icon: Car, tone: TONES.rose },
  { key: "MapPin", label: "Location", icon: MapPin, tone: TONES.sky },
  { key: "Package", label: "Package", icon: Package, tone: TONES.violet },
  { key: "Gift", label: "Gift", icon: Gift, tone: TONES.pink },
  { key: "Dumbbell", label: "Fitness", icon: Dumbbell, tone: TONES.lime },
  { key: "Camera", label: "Camera", icon: Camera, tone: TONES.slate },
  { key: "Heart", label: "Care", icon: Heart, tone: TONES.rose },
];

const DEFAULT_TONE = TONES.coral;

const MOBILE_NAV = [
  { label: "Overview", href: "/admin", icon: BarChart3 },
  { label: "Businesses", href: "/admin/businesses", icon: Building2 },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Categories", href: "/admin/categories", icon: Layers3 },
];

function nonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function normalizeCategory(value: unknown): Category | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;
  const count = item._count && typeof item._count === "object"
    ? item._count as Record<string, unknown>
    : {};
  return {
    id: item.id,
    name: item.name,
    iconKey: typeof item.iconKey === "string" && item.iconKey.trim() ? item.iconKey : "Store",
    isActive: typeof item.isActive === "boolean" ? item.isActive : true,
    sortOrder: nonNegativeInteger(item.sortOrder),
    _count: {
      business: nonNegativeInteger(count.business),
      products: nonNegativeInteger(count.products),
      requests: nonNegativeInteger(count.requests),
    },
  };
}

function createFallbackAdminCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((category: ReMarketCategory, index: number) => ({
    id: category.id,
    name: category.name,
    iconKey: category.iconKey,
    isActive: true,
    sortOrder: index,
    _count: { business: 0, products: 0, requests: 0 },
  }));
}

function getIcon(iconKey?: string | null): LucideIcon {
  return getCategoryIcon(iconKey);
}

function getTone(iconKey?: string | null): IconTone {
  return ICONS.find((item) => item.key === iconKey)?.tone ?? DEFAULT_TONE;
}

function errorMessage(data: ApiResponse, fallback: string): string {
  return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>(createFallbackAdminCategories());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState("Store");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CategoryStatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<CategorySort>("ORDER");

  const loadCategories = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/categories", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      let data: ApiResponse = {};
      try {
        data = (await response.json()) as ApiResponse;
      } catch {
        throw new Error("The categories endpoint returned an unreadable response.");
      }
      if (!response.ok) throw new Error(errorMessage(data, "Unable to load categories."));

      if (!Array.isArray(data.categories)) {
        throw new Error("The categories endpoint returned an unexpected response.");
      }

      const normalized = data.categories
        .map((item) => normalizeCategory(item))
        .filter((item): item is Category => item !== null);
      setCategories(normalized);
      setUsingFallback(false);
    } catch (loadError) {
      console.error("Admin categories load error:", loadError);
      setCategories(createFallbackAdminCategories());
      setUsingFallback(true);
      setError(loadError instanceof Error ? loadError.message : "Unable to load categories.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const metrics = useMemo(() => {
    const totalBusinesses = categories.reduce((sum, item) => sum + item._count.business, 0);
    const totalProducts = categories.reduce((sum, item) => sum + item._count.products, 0);
    const totalRequests = categories.reduce((sum, item) => sum + item._count.requests, 0);
    const active = categories.filter((item) => item.isActive).length;
    const inactive = categories.length - active;
    const inUse = categories.filter((item) => item._count.business + item._count.products + item._count.requests > 0).length;
    const unused = categories.length - inUse;
    const businessCoverage = categories.length ? Math.round((categories.filter((item) => item._count.business > 0).length / categories.length) * 100) : 0;
    return { totalBusinesses, totalProducts, totalRequests, active, inactive, inUse, unused, businessCoverage };
  }, [categories]);

  const sortedCategories = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const result = categories.filter((category) => {
      const matchesSearch = !needle || `${category.name} ${category.iconKey}`.toLocaleLowerCase().includes(needle);
      const matchesStatus = statusFilter === "ALL"
        || (statusFilter === "ACTIVE" && category.isActive)
        || (statusFilter === "INACTIVE" && !category.isActive)
        || (statusFilter === "UNUSED" && category._count.business + category._count.products + category._count.requests === 0);
      return matchesSearch && matchesStatus;
    });
    result.sort((a, b) => {
      switch (sortBy) {
        case "NAME": return a.name.localeCompare(b.name);
        case "BUSINESSES": return b._count.business - a._count.business || a.name.localeCompare(b.name);
        case "PRODUCTS": return b._count.products - a._count.products || a.name.localeCompare(b.name);
        case "REQUESTS": return b._count.requests - a._count.requests || a.name.localeCompare(b.name);
        default: return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
      }
    });
    return result;
  }, [categories, search, sortBy, statusFilter]);

  const maxBusinesses = Math.max(1, ...categories.map((item) => item._count.business));
  const maxProducts = Math.max(1, ...categories.map((item) => item._count.products));
  const SelectedIcon = getIcon(iconKey);
  const selectedTone = getTone(iconKey);

  function resetForm() {
    setEditingId(null);
    setName("");
    setIconKey("Store");
    setSortOrder(String(categories.length));
    setIsActive(true);
    setShowIconPicker(false);
  }

  function startEdit(category: Category) {
    if (usingFallback) return;
    setEditingId(category.id);
    setName(category.name);
    setIconKey(category.iconKey || "Store");
    setSortOrder(String(category.sortOrder));
    setIsActive(category.isActive);
    setShowIconPicker(false);
    setError("");
    setSuccess("");
    document.getElementById("category-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (usingFallback) {
      setError("Categories could not be loaded from the database. Refresh the page before saving.");
      return;
    }
    const trimmedName = name.trim();
    const parsedSortOrder = Number(sortOrder);
    if (!trimmedName) {
      setError("Category name is required.");
      return;
    }
    if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) {
      setError("Sort order must be a whole number of 0 or greater.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const endpoint = editingId ? `/api/admin/categories/${editingId}` : "/api/admin/categories";
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: trimmedName, iconKey, sortOrder: parsedSortOrder, isActive }),
      });
      let data: ApiResponse = {};
      try { data = (await response.json()) as ApiResponse; } catch { /* handled below */ }
      if (!response.ok) throw new Error(errorMessage(data, "Unable to save category."));

      setSuccess(editingId ? `“${trimmedName}” was updated.` : `“${trimmedName}” was added to your categories.`);
      resetForm();
      await loadCategories(true);
    } catch (submitError) {
      console.error("Admin category save error:", submitError);
      setError(submitError instanceof Error ? submitError.message : "Unable to save category.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategory(category: Category) {
    if (usingFallback || processingId) return;
    setProcessingId(category.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      let data: ApiResponse = {};
      try { data = (await response.json()) as ApiResponse; } catch { /* handled below */ }
      if (!response.ok) throw new Error(errorMessage(data, "Unable to update category."));

      const updated = normalizeCategory(data.category);
      if (updated) {
        setCategories((current) => current.map((item) => item.id === category.id ? updated : item));
      } else {
        await loadCategories(true);
      }
      setSuccess(`“${category.name}” is now ${category.isActive ? "inactive" : "active"}.`);
    } catch (toggleError) {
      console.error("Admin category toggle error:", toggleError);
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update category.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F5F0E9] text-[#17202A]">
      <div className="flex min-h-dvh w-full">
        <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-[#E5DCD1] bg-[#FFFDFC] xl:flex">
          <Link href="/admin" className="flex h-[82px] items-center gap-3 border-b border-[#EAE3DA] px-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#FF5A36] text-lg font-black text-white shadow-[0_8px_18px_rgba(255,90,54,0.22)]">R</span>
            <span><span className="block text-sm font-extrabold tracking-tight">ReMarket</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A8E83]">Admin workspace</span></span>
          </Link>
          <div className="px-4 pt-6">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#A59A90]">Manage marketplace</p>
            <nav className="mt-3 space-y-1">
              {MOBILE_NAV.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/categories";
                return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#665E57] hover:bg-[#F7F2EC]"}`}><Icon className="h-[17px] w-[17px]" />{item.label}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />}</Link>;
              })}
              <Link href="/admin/requests" className="flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold text-[#665E57] transition hover:bg-[#F7F2EC]"><Megaphone className="h-[17px] w-[17px]" />Buyer requests</Link>
            </nav>
          </div>
          <div className="mt-auto p-4">
            <div className="rounded-2xl bg-[#17202A] p-4 text-white">
              <div className="flex items-center gap-2 text-[#FFB19B]"><Activity className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.15em]">Category health</span></div>
              <p className="mt-3 text-2xl font-bold tabular-nums">{usingFallback ? "—" : `${metrics.businessCoverage}%`}</p>
              <p className="mt-1 text-[11px] leading-5 text-white/65">Categories with at least one listed business.</p>
            </div>
            <p className="px-2 pt-4 text-[10px] font-medium text-[#A59A90]">ReMarket · Operations</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-[#E5DCD1] bg-[#FFFDFC]/95 backdrop-blur-xl">
            <div className="mx-auto flex min-h-[68px] w-full max-w-[1800px] items-center justify-between gap-3 px-4 sm:px-6 xl:px-8 2xl:px-10">
              <div className="flex min-w-0 items-center gap-3">
                <Link href="/admin" aria-label="Back to admin overview" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#EAE3DA] bg-white text-[#675D54] transition hover:border-[#FFB49F] hover:text-[#9F2D18]"><ArrowLeft className="h-4 w-4" /></Link>
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#A1968C]">Marketplace controls <span className="px-1 text-[#D0C4B8]">/</span> Taxonomy</p><h1 className="truncate text-base font-extrabold tracking-tight text-[#17202A] sm:text-lg">Category operations</h1></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden items-center gap-2 rounded-full border border-[#E8E1D8] bg-white px-3 py-2 text-[11px] font-semibold text-[#6F675F] sm:inline-flex"><span className={`h-2 w-2 rounded-full ${usingFallback ? "bg-amber-500" : "bg-emerald-500"}`} />{usingFallback ? "Offline data" : "Live category data"}</span>
                <button type="button" onClick={() => void loadCategories(true)} disabled={refreshing || loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E8E1D8] bg-white px-3 text-xs font-bold text-[#574E47] transition hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /><span className="hidden sm:inline">Refresh data</span><span className="sm:hidden">Refresh</span></button>
              </div>
            </div>
            <nav className="hidden gap-1 overflow-x-auto border-t border-[#F0EAE2] px-3 py-2 md:flex xl:hidden" aria-label="Admin sections">
              {MOBILE_NAV.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/categories";
                return <Link key={item.href} href={item.href} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#746A61] hover:bg-[#F7F2EC]"}`}><Icon className="h-3.5 w-3.5" />{item.label}</Link>;
              })}
            </nav>
          </header>

          <div className="mx-auto w-full max-w-[1800px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:pb-10 xl:px-8 2xl:px-10">
            <section className="relative isolate overflow-hidden rounded-[24px] bg-[#17202A] px-5 py-6 text-white shadow-[0_18px_50px_rgba(23,32,42,0.10)] sm:px-8 sm:py-8 xl:px-10 xl:py-9">
              <div className="pointer-events-none absolute -right-10 -top-24 -z-10 h-64 w-64 rounded-full border-[34px] border-white/[0.04] sm:right-8 sm:top-[-118px] sm:h-80 sm:w-80" />
              <div className="pointer-events-none absolute bottom-[-86px] right-[22%] -z-10 h-48 w-48 rounded-full bg-[#FF5A36]/15 blur-3xl" />
              <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)] lg:items-end">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.17em] text-[#FFC1AF]"><Layers3 className="h-3.5 w-3.5" />Discovery architecture</div>
                  <h2 className="mt-4 max-w-2xl text-[clamp(1.65rem,3.5vw,3.15rem)] font-black leading-[1.04] tracking-[-0.045em]">Help buyers find<br className="hidden sm:block" /> the right <span className="text-[#FF866A]">things nearby.</span></h2>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-white/65 sm:text-[15px]">Shape how people explore local businesses, products and services. Keep the categories useful, easy to scan and connected to real marketplace activity.</p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => { resetForm(); document.getElementById("category-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(255,90,54,0.2)] transition hover:bg-[#F04F2E]"><Plus className="h-4 w-4" />Create category</button>
                    <a href="#category-library" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-xs font-bold text-white/85 transition hover:bg-white/[0.07]"><Eye className="h-4 w-4" />Explore library</a>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-white/60">Total categories</span><Tag className="h-4 w-4 text-[#FF9A82]" /></div><p className="mt-3 text-3xl font-black tabular-nums">{loading || usingFallback ? "—" : categories.length}</p><p className="mt-1 text-[10px] text-white/45">Across buyer discovery</p></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-white/60">In active use</span><TrendingUp className="h-4 w-4 text-[#FF9A82]" /></div><p className="mt-3 text-3xl font-black tabular-nums">{loading || usingFallback ? "—" : metrics.inUse}</p><p className="mt-1 text-[10px] text-white/45">Business, product or request activity</p></div>
                  <div className="col-span-2 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-4 sm:px-5"><div className="min-w-0"><p className="text-[11px] font-semibold text-white/60">Business coverage</p><p className="mt-1 text-sm font-bold">{usingFallback ? "Waiting for live data" : `${metrics.businessCoverage}% of categories have businesses`}</p></div><div className="w-28 shrink-0 sm:w-36"><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#FF866A] transition-all" style={{ width: `${usingFallback ? 0 : metrics.businessCoverage}%` }} /></div><p className="mt-1.5 text-right text-[10px] text-white/45">{loading ? "Loading…" : usingFallback ? "Unavailable" : `${categories.filter((item) => item._count.business > 0).length} of ${categories.length}`}</p></div></div>
                </div>
              </div>
            </section>

            {usingFallback && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0"><p className="text-xs font-extrabold">Showing fallback category definitions</p><p className="mt-1 text-xs leading-5 text-amber-800">The admin categories API could not be loaded. Counts shown in this fallback are not live usage statistics, and editing is disabled until live data loads. Refresh to retry.</p></div><button type="button" onClick={() => void loadCategories(true)} className="ml-auto shrink-0 text-xs font-bold underline underline-offset-2">Retry</button></div>}
            {error && <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-[#F0C5BE] bg-[#FFF3F0] px-4 py-3.5 text-[#9F2D18]"><X className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 flex-1 text-xs font-semibold leading-5">{error}</p><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}
            {success && <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 flex-1 text-xs font-semibold leading-5">{success}</p><button type="button" onClick={() => setSuccess("")} aria-label="Dismiss success"><X className="h-4 w-4" /></button></div>}

            <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <MetricCard label="Active" value={loading || usingFallback ? "—" : metrics.active} note="Visible to buyers" icon={CheckCircle2} accent="green" />
              <MetricCard label="Inactive" value={loading || usingFallback ? "—" : metrics.inactive} note="Hidden from selection" icon={Eye} accent="slate" />
              <MetricCard label="Businesses" value={loading || usingFallback ? "—" : metrics.totalBusinesses} note="Assigned to categories" icon={Building2} accent="coral" />
              <MetricCard label="Products" value={loading || usingFallback ? "—" : metrics.totalProducts} note="Grouped by category" icon={Package} accent="violet" />
              <MetricCard label="Buyer requests" value={loading || usingFallback ? "—" : metrics.totalRequests} note={`${loading ? "Loading" : metrics.unused} unused categories`} icon={Users} accent="sky" />
            </section>

            <div className="mt-5 grid min-w-0 gap-5 2xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.62fr)]">
              <section id="category-editor" className="min-w-0 scroll-mt-28 self-start overflow-visible rounded-[22px] border border-[#E8DFD5] bg-[#FFFDFC] shadow-[0_4px_18px_rgba(55,38,25,0.035)]">
                <div className="flex items-start justify-between gap-3 border-b border-[#EEE7DF] px-5 py-5 sm:px-6">
                  <div><p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-[#A0958B]">Category workbench</p><h2 className="mt-1.5 text-lg font-extrabold tracking-tight">{editingId ? "Edit category" : "Build a category"}</h2><p className="mt-1 text-xs leading-5 text-[#8A7E73]">Set its label, icon and discovery order.</p></div>
                  {editingId && <button type="button" onClick={resetForm} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#E9E1D8] bg-white px-2.5 py-2 text-[11px] font-bold text-[#6F675F] hover:border-[#FFB49F]"><X className="h-3.5 w-3.5" />Cancel</button>}
                </div>
                <form onSubmit={submitForm} className="space-y-5 p-5 sm:p-6">
                  <div className="rounded-2xl border border-dashed border-[#E7D9CE] bg-[#FCF7F1] p-4">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[17px] ${selectedTone.background} ${selectedTone.text}`}><SelectedIcon className="h-7 w-7" /></span>
                      <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#9D9084]">Buyer-facing preview</p><p className="mt-1 truncate text-base font-extrabold">{name.trim() || "Your category name"}</p><p className="mt-1 text-[11px] text-[#85796F]">{isActive ? "Active · can appear in buyer selection" : "Inactive · hidden from buyer selection"}</p></div>
                      <span className="rounded-full border border-[#E9DED3] bg-white px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[#756A60]">{sortOrder === "" ? "Order —" : `Order ${sortOrder}`}</span>
                    </div>
                  </div>
                  <div><label htmlFor="category-name" className="text-xs font-bold text-[#4D453E]">Category name</label><input id="category-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Furniture & Home" maxLength={50} required disabled={usingFallback || saving} className="mt-2 h-11 w-full rounded-xl border border-[#E6DED5] bg-white px-3.5 text-sm text-[#17202A] outline-none transition placeholder:text-[#B1A69B] focus:border-[#FF947C] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F4F0EB]" /><p className="mt-1.5 text-right text-[10px] text-[#A3988E]">{name.length}/50 characters</p></div>
                  <div className="relative"><label className="text-xs font-bold text-[#4D453E]">Category icon</label><button type="button" disabled={usingFallback || saving} aria-expanded={showIconPicker} onClick={() => setShowIconPicker((current) => !current)} className="mt-2 flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#E6DED5] bg-white px-3 text-sm transition hover:border-[#FFB49F] disabled:bg-[#F4F0EB]"><span className="flex min-w-0 items-center gap-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selectedTone.background} ${selectedTone.text}`}><SelectedIcon className="h-4 w-4" /></span><span className="truncate font-semibold">{ICONS.find((item) => item.key === iconKey)?.label ?? iconKey}</span></span><ChevronDown className={`h-4 w-4 shrink-0 text-[#9A8F84] transition ${showIconPicker ? "rotate-180" : ""}`} /></button>
                    {showIconPicker && <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[300px] overflow-y-auto rounded-2xl border border-[#E6DED5] bg-white p-2.5 shadow-[0_18px_45px_rgba(45,32,20,0.16)]"><div className="grid grid-cols-3 gap-2 sm:grid-cols-4 2xl:grid-cols-3">{ICONS.map((item) => {const Icon = item.icon; const selected = item.key === iconKey;return <button key={item.key} type="button" onClick={() => {setIconKey(item.key);setShowIconPicker(false);}} aria-pressed={selected} className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2.5 transition ${selected ? "border-[#FFB49F] bg-[#FFF0E8]" : "border-transparent hover:border-[#EEE4D9] hover:bg-[#FCF7F1]"}`}><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tone.background} ${item.tone.text}`}><Icon className="h-[18px] w-[18px]" /></span><span className="max-w-full truncate text-[10px] font-bold text-[#625850]">{item.label}</span></button>;})}</div></div>}
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3"><div><label htmlFor="category-order" className="text-xs font-bold text-[#4D453E]">Display order</label><input id="category-order" type="number" min={0} step={1} inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} disabled={usingFallback || saving} className="mt-2 h-11 w-full rounded-xl border border-[#E6DED5] bg-white px-3 text-sm outline-none focus:border-[#FF947C] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F4F0EB]" /><p className="mt-1.5 text-[10px] leading-4 text-[#9A8E83]">Lower numbers appear first.</p></div><div><span className="text-xs font-bold text-[#4D453E]">Buyer visibility</span><button type="button" disabled={usingFallback || saving} onClick={() => setIsActive((current) => !current)} aria-pressed={isActive} className={`mt-2 flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 transition disabled:opacity-60 ${isActive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-[#E4DDD5] bg-[#F5F2EE] text-[#6D655D]"}`}><span className="flex items-center gap-2 text-xs font-extrabold"><span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-[#9A9087]"}`} />{isActive ? "Active" : "Inactive"}</span><span className={`relative h-5 w-9 rounded-full transition ${isActive ? "bg-emerald-500" : "bg-[#C7BEB4]"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${isActive ? "left-[18px]" : "left-0.5"}`} /></span></button><p className="mt-1.5 text-[10px] leading-4 text-[#9A8E83]">{isActive ? "Available for buyer discovery." : "Hidden from buyer selection."}</p></div></div>
                  <div className="flex flex-col-reverse gap-2 border-t border-[#F0E9E1] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] leading-4 text-[#9A8E83]">{editingId ? "Changes update this category." : "New categories are added to ReMarket discovery."}</p><button type="submit" disabled={saving || usingFallback} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-extrabold text-white shadow-[0_6px_15px_rgba(255,90,54,0.16)] transition hover:bg-[#ED4F2F] disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "Saving category…" : editingId ? "Save changes" : "Create category"}</button></div>
                </form>
              </section>

              <section id="category-library" className="min-w-0 overflow-hidden rounded-[22px] border border-[#E8DFD5] bg-[#FFFDFC] shadow-[0_4px_18px_rgba(55,38,25,0.035)]">
                <div className="border-b border-[#EEE7DF] px-5 py-5 sm:px-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.17em] text-[#A0958B]">Taxonomy library</p><div className="mt-1.5 flex flex-wrap items-center gap-2"><h2 className="text-lg font-extrabold tracking-tight">All categories</h2><span className="rounded-full bg-[#F3EDE6] px-2 py-1 text-[10px] font-extrabold text-[#6D6258]">{loading ? "…" : sortedCategories.length} shown</span></div><p className="mt-1 text-xs leading-5 text-[#8A7E73]">Usage counts reflect categories connected to businesses, products and buyer requests.</p></div><div className="flex shrink-0 items-center gap-2 rounded-xl border border-[#EEE5DA] bg-[#FCF7F1] px-3 py-2"><Activity className="h-4 w-4 text-[#FF5A36]" /><div><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#9B8E82]">In active use</p><p className="text-xs font-extrabold text-[#302821]">{usingFallback ? "—" : `${metrics.inUse} / ${categories.length}`}</p></div></div></div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]"><label className="relative block min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A79B90]" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search category name or icon…" aria-label="Search categories" className="h-11 w-full rounded-xl border border-[#E8DFD5] bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-[#B1A69B] focus:border-[#FF947C] focus:ring-4 focus:ring-[#FF5A36]/10" /></label><label className="relative block"><ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A79B90]" /><select value={sortBy} onChange={(event) => setSortBy(event.target.value as CategorySort)} aria-label="Sort categories" className="h-11 w-full appearance-none rounded-xl border border-[#E8DFD5] bg-white pl-9 pr-8 text-xs font-bold text-[#5E554E] outline-none focus:border-[#FF947C]"><option value="ORDER">Display order</option><option value="NAME">Name A–Z</option><option value="BUSINESSES">Most businesses</option><option value="PRODUCTS">Most products</option><option value="REQUESTS">Most requests</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A79B90]" /></label></div>
                  <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1"><Filter className="h-3.5 w-3.5 shrink-0 text-[#A2968A]" />{([{ value: "ALL", label: "All" }, { value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }, { value: "UNUSED", label: "No activity" }] as const).map((item) => <button key={item.value} type="button" onClick={() => setStatusFilter(item.value)} aria-pressed={statusFilter === item.value} className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-extrabold transition ${statusFilter === item.value ? "bg-[#17202A] text-white" : "bg-[#F5F0E9] text-[#71665C] hover:bg-[#ECE4DA]"}`}>{item.label}{item.value === "ALL" ? ` · ${categories.length}` : item.value === "ACTIVE" ? ` · ${metrics.active}` : item.value === "INACTIVE" ? ` · ${metrics.inactive}` : ` · ${usingFallback ? "—" : metrics.unused}`}</button>)}</div>
                </div>

                {loading ? <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-6 py-12"><LoaderCircle className="h-7 w-7 animate-spin text-[#FF5A36]" /><p className="text-xs font-semibold text-[#8D8176]">Loading category activity…</p></div> : sortedCategories.length === 0 ? <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]"><Search className="h-6 w-6" /></span><h3 className="mt-4 text-sm font-extrabold">No matching categories</h3><p className="mt-1 max-w-sm text-xs leading-5 text-[#8D8176]">Try another search or filter. You can also create a new category from the workbench.</p><button type="button" onClick={() => {setSearch("");setStatusFilter("ALL");}} className="mt-4 rounded-xl border border-[#E8DFD5] bg-white px-3.5 py-2.5 text-xs font-bold text-[#5E554E] hover:border-[#FFB49F]">Clear filters</button></div> : <div className="divide-y divide-[#EFE8E0]">
                  {sortedCategories.map((category) => {
                    const Icon = getIcon(category.iconKey);
                    const tone = getTone(category.iconKey);
                    const totalUsage = category._count.business + category._count.products + category._count.requests;
                    const isProcessing = processingId === category.id;
                    const businessWidth = Math.min(100, Math.round((category._count.business / maxBusinesses) * 100));
                    const productWidth = Math.min(100, Math.round((category._count.products / maxProducts) * 100));
                    return <article key={category.id} className={`px-4 py-4 transition hover:bg-[#FFFCF8] sm:px-5 ${editingId === category.id ? "bg-[#FFF7F2]" : ""}`}>
                      <div className="flex min-w-0 items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] ${tone.background} ${tone.text}`}><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="max-w-full break-words text-sm font-extrabold text-[#28231F]">{category.name}</h3><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-extrabold ${category.isActive ? "bg-emerald-50 text-emerald-700" : "bg-[#F0ECE7] text-[#7E746B]"}`}><span className={`h-1.5 w-1.5 rounded-full ${category.isActive ? "bg-emerald-500" : "bg-[#A39A91]"}`} />{category.isActive ? "ACTIVE" : "INACTIVE"}</span>{totalUsage === 0 && !usingFallback && <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-extrabold text-amber-700">NO ACTIVITY</span>}</div><p className="mt-1 text-[10px] text-[#9B9085]">Icon: {category.iconKey} <span className="px-1">·</span> Display order {category.sortOrder}</p></div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => startEdit(category)} disabled={usingFallback || saving || Boolean(processingId)} title="Edit category" aria-label={`Edit ${category.name}`} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#EAE2D9] bg-white text-[#74695F] transition hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void toggleCategory(category)} disabled={usingFallback || saving || Boolean(processingId)} title={category.isActive ? "Deactivate category" : "Activate category"} aria-label={`${category.isActive ? "Deactivate" : "Activate"} ${category.name}`} className={`flex h-9 w-9 items-center justify-center rounded-xl border bg-white transition disabled:opacity-40 ${category.isActive ? "border-[#EAE2D9] text-[#74695F] hover:border-rose-200 hover:text-rose-700" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>{isProcessing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : category.isActive ? <Eye className="h-4 w-4" /> : <Check className="h-4 w-4" />}</button></div></div>
                      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3"><UsageMetric icon={Building2} label="Businesses" value={usingFallback ? "—" : category._count.business} tone="coral" /><UsageMetric icon={Package} label="Products" value={usingFallback ? "—" : category._count.products} tone="violet" /><UsageMetric icon={Users} label="Requests" value={usingFallback ? "—" : category._count.requests} tone="sky" /></div>
                      {!usingFallback && <div className="mt-3 grid gap-2 sm:grid-cols-2"><div><div className="mb-1 flex items-center justify-between gap-2"><span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#9A8F84]">Business activity</span><span className="text-[10px] font-bold tabular-nums text-[#6C6258]">{category._count.business}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#F0EAE2]"><div className="h-full rounded-full bg-[#FF8B70] transition-all" style={{ width: `${businessWidth}%` }} /></div></div><div><div className="mb-1 flex items-center justify-between gap-2"><span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#9A8F84]">Product activity</span><span className="text-[10px] font-bold tabular-nums text-[#6C6258]">{category._count.products}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#F0EAE2]"><div className="h-full rounded-full bg-[#9F8AEF] transition-all" style={{ width: `${productWidth}%` }} /></div></div></div>}
                    </article>;
                  })}
                </div>}
                <div className="flex flex-col gap-2 border-t border-[#EEE7DF] bg-[#FCF8F3] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-[10px] font-medium text-[#93877B]">{usingFallback ? "Live category usage is unavailable." : `Showing ${sortedCategories.length} of ${categories.length} categories · Counts are returned by the admin API.`}</p><Link href="/admin/businesses" className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-[#9F2D18] hover:underline">Review businesses <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
              </section>
            </div>

            <footer className="mt-7 flex flex-col gap-2 border-t border-[#E6DDD3] py-5 text-[10px] leading-5 text-[#9B8F84] sm:flex-row sm:items-center sm:justify-between"><p>ReMarket Category Operations <span className="px-1.5">·</span> Keep discovery organized and useful.</p><p className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />{usingFallback ? "Using static fallback" : "Connected to admin category data"}</p></footer>
          </div>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E5DCD1] bg-[#FFFDFC]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(44,32,22,0.07)] backdrop-blur-xl md:hidden" aria-label="Mobile admin navigation"><div className="mx-auto grid max-w-xl grid-cols-4 gap-1">{MOBILE_NAV.map((item) => {const Icon = item.icon;const active = item.href === "/admin/categories";return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[9px] font-extrabold transition sm:text-[10px] ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#766B61] hover:bg-[#F7F2EC]"}`}><Icon className="h-4 w-4 shrink-0" /><span className="max-w-full truncate leading-tight">{item.label}</span></Link>;})}</div></nav>
    </main>
  );
}

function MetricCard({ label, value, note, icon: Icon, accent }: { label: string; value: number | string; note: string; icon: LucideIcon; accent: "green" | "slate" | "coral" | "violet" | "sky" }) {
  const styles = {
    green: { icon: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
    slate: { icon: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
    coral: { icon: "bg-[#FFF0E8] text-[#9F2D18]", dot: "bg-[#FF5A36]" },
    violet: { icon: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
    sky: { icon: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  }[accent];
  return <div className="min-w-0 rounded-2xl border border-[#E8DFD5] bg-[#FFFDFC] p-3.5 shadow-[0_3px_12px_rgba(55,38,25,0.025)] sm:p-4"><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold text-[#82776D] sm:text-[11px]">{label}</span><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}><Icon className="h-4 w-4" /></span></div><p className="mt-2 text-2xl font-black tracking-tight text-[#24201C] tabular-nums sm:text-[28px]">{typeof value === "number" ? value.toLocaleString() : value}</p><div className="mt-1.5 flex min-w-0 items-center gap-1.5"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} /><p className="truncate text-[9px] leading-4 text-[#9A8F84] sm:text-[10px]">{note}</p></div></div>;
}

function UsageMetric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number | string; tone: "coral" | "violet" | "sky" }) {
  const styles = {
    coral: "bg-[#FFF5F0] text-[#A33C25]",
    violet: "bg-violet-50 text-violet-700",
    sky: "bg-sky-50 text-sky-700",
  }[tone];
  return <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#F0E9E1] bg-white px-2.5 py-2.5 sm:px-3"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${styles}`}><Icon className="h-3.5 w-3.5" /></span><div className="min-w-0"><p className="truncate text-[9px] font-semibold text-[#9A8F84]">{label}</p><p className="mt-0.5 text-sm font-extrabold tabular-nums text-[#342C25]">{typeof value === "number" ? value.toLocaleString() : value}</p></div></div>;
}
