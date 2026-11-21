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
  Trash2,
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
  imageUrl: string | null;
  parentId: string | null;
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
  success?: boolean;
  usage?: unknown;
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
  { key: "Building2", label: "Business", icon: Building2, tone: TONES.blue },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCategory(value: unknown): Category | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  const count = isRecord(value._count) ? value._count : {};
  return {
    id: value.id,
    name: value.name,
    iconKey: typeof value.iconKey === "string" && value.iconKey.trim() ? value.iconKey : "Store",
    imageUrl: typeof value.imageUrl === "string" && value.imageUrl.trim() ? value.imageUrl.trim() : null,
    parentId: typeof value.parentId === "string" && value.parentId.trim() ? value.parentId : null,
    isActive: typeof value.isActive === "boolean" ? value.isActive : true,
    sortOrder: nonNegativeInteger(value.sortOrder),
    _count: {
      business: nonNegativeInteger(count.business),
      products: nonNegativeInteger(count.products),
      requests: nonNegativeInteger(count.requests),
    },
  };
}

function createFallbackAdminCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((category: ReMarketCategory, index) => ({
    id: category.id,
    name: category.name,
    iconKey: category.iconKey,
    imageUrl: null,
    parentId: null,
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

async function readApiResponse(response: Response): Promise<ApiResponse> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value as ApiResponse : {};
  } catch {
    return {};
  }
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
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState("Store");
  const [imageUrl, setImageUrl] = useState("");
  const [parentId, setParentId] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
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
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(errorMessage(data, "Unable to load categories."));
      if (!Array.isArray(data.categories)) throw new Error("The categories endpoint returned an unexpected response.");
      const normalized = data.categories
        .map(normalizeCategory)
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
    const businessCoverage = categories.length
      ? Math.round((categories.filter((item) => item._count.business > 0).length / categories.length) * 100)
      : 0;
    return { totalBusinesses, totalProducts, totalRequests, active, inactive, inUse, unused, businessCoverage };
  }, [categories]);

  const sortedCategories = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const result = categories.filter((category) => {
      const parentName = categories.find((item) => item.id === category.parentId)?.name ?? "";
      const matchesSearch = !needle || `${category.name} ${category.iconKey} ${parentName}`.toLocaleLowerCase().includes(needle);
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

  const SelectedIcon = getIcon(iconKey);
  const selectedTone = getTone(iconKey);
  const editingCategory = categories.find((category) => category.id === editingId) ?? null;
  const editingCategoryHasChildren = Boolean(editingId && categories.some((category) => category.parentId === editingId));
  const activeParentCategories = categories.filter((category) => category.parentId === null && category.isActive && category.id !== editingId);
  const currentParent = parentId ? categories.find((category) => category.id === parentId) : null;
  const parentOptions = currentParent && !activeParentCategories.some((category) => category.id === currentParent.id)
    ? [...activeParentCategories, currentParent]
    : activeParentCategories;
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setIconKey("Store");
    setImageUrl("");
    setParentId("");
    setSortOrder(String(categories.length));
    setIsActive(true);
    setShowIconPicker(false);
    setError("");
    setEditorOpen(false);
  }

  function startEdit(category: Category) {
    if (usingFallback) return;
    setEditingId(category.id);
    setName(category.name);
    setIconKey(category.iconKey || "Store");
    setImageUrl(category.imageUrl ?? "");
    setParentId(category.parentId ?? "");
    setSortOrder(String(category.sortOrder));
    setIsActive(category.isActive);
    setShowIconPicker(false);
    setEditorOpen(true);
    setError("");
    setSuccess("");
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (usingFallback) {
      setError("Categories could not be loaded from the database. Refresh the page before saving.");
      return;
    }
    const trimmedName = name.trim();
    const parsedSortOrder = Number(sortOrder);
    if (!trimmedName) return setError("Category name is required.");
    if (trimmedName.length > 50) return setError("Category name must be 50 characters or less.");
    if (!Number.isSafeInteger(parsedSortOrder) || parsedSortOrder < 0) return setError("Sort order must be a whole number of 0 or greater.");
    if (parentId && parentId === editingId) return setError("A category cannot be its own parent.");
    if (editingCategoryHasChildren && parentId) return setError("A category with subcategories must remain a top-level category.");
    if (parentId && !parentOptions.some((category) => category.id === parentId)) return setError("Choose a valid top-level parent category.");
    if (parentId && currentParent && !currentParent.isActive && isActive) return setError("Activate the parent category before activating this subcategory.");
    if (imageUrl.trim()) {
      try {
        const parsedImageUrl = new URL(imageUrl.trim());
        if ((parsedImageUrl.protocol !== "https:" && parsedImageUrl.protocol !== "http:") || parsedImageUrl.username || parsedImageUrl.password) throw new Error("Unsupported URL");
      } catch {
        return setError("Category image must be a valid HTTP or HTTPS URL.");
      }
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const endpoint = editingId ? `/api/admin/categories/${encodeURIComponent(editingId)}` : "/api/admin/categories";
      const payload: Record<string, unknown> = {
        name: trimmedName,
        iconKey,
        imageUrl: imageUrl.trim() || null,
        sortOrder: parsedSortOrder,
        isActive,
      };
      // Do not resend an unchanged parentId. This allows an existing inactive
      // child under an inactive parent to have its other fields edited safely.
      const originalParentId = editingCategory?.parentId ?? null;
      if (!editingId || (parentId || null) !== originalParentId) payload.parentId = parentId || null;

      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readApiResponse(response);
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
    if (usingFallback || processingId || saving) return;
    setProcessingId(category.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/categories/${encodeURIComponent(category.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(errorMessage(data, "Unable to update category."));
      const updated = normalizeCategory(data.category);
      if (updated) setCategories((current) => current.map((item) => item.id === category.id ? updated : item));
      else await loadCategories(true);
      setSuccess(`“${category.name}” is now ${category.isActive ? "inactive" : "active"}.`);
    } catch (toggleError) {
      console.error("Admin category toggle error:", toggleError);
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update category.");
    } finally {
      setProcessingId(null);
    }
  }

  function canDeleteCategory(category: Category): boolean {
    const hasChildren = categories.some((item) => item.parentId === category.id);
    const hasVisibleUsage = category._count.business + category._count.products + category._count.requests > 0;
    return !hasChildren && !hasVisibleUsage;
  }

  async function deleteCategory() {
    if (!deleteTarget || usingFallback || processingId) return;
    const target = deleteTarget;
    setProcessingId(target.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/categories/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(errorMessage(data, "Unable to delete category."));
      setCategories((current) => current.filter((item) => item.id !== target.id));
      setSuccess(`“${target.name}” was deleted.`);
      setDeleteTarget(null);
      if (editingId === target.id) resetForm();
    } catch (deleteError) {
      console.error("Admin category delete error:", deleteError);
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete category.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F7F3EE] text-[#24201C]">
      <div className="flex min-h-dvh w-full">
        <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-[#E8E0D7] bg-[#FFFDFC] xl:flex">
          <Link href="/admin" className="flex h-[78px] items-center gap-3 border-b border-[#EEE7DF] px-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#FF5A36] text-lg font-black text-white">R</span>
            <span>
              <span className="block text-sm font-extrabold tracking-tight">ReMarket</span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A8E83]">Admin workspace</span>
            </span>
          </Link>
          <div className="px-4 pt-6">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[#A59A90]">Manage marketplace</p>
            <nav className="mt-3 space-y-1" aria-label="Admin navigation">
              {MOBILE_NAV.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/categories";
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#665E57] hover:bg-[#F7F2EC]"}`}>
                    <Icon className="h-[17px] w-[17px]" />{item.label}
                    {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />}
                  </Link>
                );
              })}
              <Link href="/admin/requests" className="flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold text-[#665E57] transition hover:bg-[#F7F2EC]">
                <Megaphone className="h-[17px] w-[17px]" />Buyer requests
              </Link>
            </nav>
          </div>
          <div className="mt-auto p-4">
            <div className="rounded-2xl bg-[#17202A] p-4 text-white">
              <div className="flex items-center gap-2 text-[#FFB19B]"><Activity className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">Category coverage</span></div>
              <p className="mt-3 text-2xl font-bold tabular-nums">{loading || usingFallback ? "—" : `${metrics.businessCoverage}%`}</p>
              <p className="mt-1 text-[11px] leading-5 text-white/65">Categories with at least one listed business.</p>
            </div>
            <p className="px-2 pt-4 text-[10px] font-medium text-[#A59A90]">ReMarket · Operations</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 border-b border-[#E8E0D7] bg-[#FFFDFC]/95 backdrop-blur-xl">
            <div className="mx-auto flex min-h-[64px] w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 xl:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <Link href="/admin" aria-label="Back to admin overview" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#EAE3DA] bg-white text-[#675D54] transition hover:border-[#FFB49F] hover:text-[#9F2D18]">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <div className="min-w-0">
                  <p className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-[#A1968C] sm:block">Marketplace controls / Taxonomy</p>
                  <h1 className="truncate text-[15px] font-extrabold tracking-tight text-[#17202A] sm:mt-0.5 sm:text-lg">Categories</h1>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden items-center gap-2 rounded-full border border-[#E8E1D8] bg-white px-3 py-2 text-[11px] font-semibold text-[#6F675F] lg:inline-flex">
                  <span className={`h-2 w-2 rounded-full ${usingFallback ? "bg-amber-500" : "bg-emerald-500"}`} />
                  {usingFallback ? "Fallback data" : "Connected"}
                </span>
                <button type="button" onClick={() => void loadCategories(true)} disabled={refreshing || loading}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E8E1D8] bg-white px-3 text-xs font-bold text-[#574E47] transition hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>
            <nav className="hidden gap-1 overflow-x-auto border-t border-[#F0EAE2] px-4 py-2 md:flex xl:hidden" aria-label="Admin sections">
              {MOBILE_NAV.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/categories";
                return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#746A61] hover:bg-[#F7F2EC]"}`}>
                  <Icon className="h-3.5 w-3.5" />{item.label}
                </Link>;
              })}
            </nav>
          </header>

          <div className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 md:pb-10 xl:px-8">
            <section className="flex flex-col gap-4 rounded-[22px] border border-[#EAE1D7] bg-[#FFFDFC] p-4 shadow-[0_3px_14px_rgba(55,38,25,0.025)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A0958B]"><Layers3 className="h-3.5 w-3.5 text-[#FF5A36]" />Marketplace structure</div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-[#24201C] sm:text-2xl">Organise your categories</h2>
                <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[#82776D] sm:text-sm">Create and maintain the categories buyers use to discover products and services. Keep the list clear and easy to manage.</p>
              </div>
              <button type="button" onClick={() => { resetForm(); setEditorOpen(true); }} disabled={usingFallback}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-extrabold text-white shadow-[0_6px_16px_rgba(255,90,54,0.16)] transition hover:bg-[#ED4F2F] disabled:cursor-not-allowed disabled:opacity-50">
                <Plus className="h-4 w-4" />Add category
              </button>
            </section>

            {usingFallback && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900">
              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0"><p className="text-xs font-extrabold">Live categories could not be loaded</p><p className="mt-1 text-xs leading-5 text-amber-800">The page is showing static fallback definitions. Usage counts are not live, and editing is disabled until the categories API works. Refresh to try again.</p></div>
              <button type="button" onClick={() => void loadCategories(true)} className="ml-auto shrink-0 text-xs font-bold underline underline-offset-2">Retry</button>
            </div>}
            {error && !editorOpen && <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-[#F0C5BE] bg-[#FFF3F0] px-4 py-3.5 text-[#9F2D18]"><X className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 flex-1 text-xs font-semibold leading-5">{error}</p><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}
            {success && <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 flex-1 text-xs font-semibold leading-5">{success}</p><button type="button" onClick={() => setSuccess("")} aria-label="Dismiss success"><X className="h-4 w-4" /></button></div>}

            <section className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard label="Total categories" value={loading || usingFallback ? "—" : categories.length} note="Parent and subcategories" icon={Layers3} accent="coral" />
              <MetricCard label="Active" value={loading || usingFallback ? "—" : metrics.active} note="Available to buyers" icon={CheckCircle2} accent="green" />
              <MetricCard label="Businesses" value={loading || usingFallback ? "—" : metrics.totalBusinesses} note="Assigned to categories" icon={Building2} accent="violet" />
              <MetricCard label="Products" value={loading || usingFallback ? "—" : metrics.totalProducts} note="Listed under categories" icon={Package} accent="sky" />
            </section>

            <section id="category-library" className="mt-5 overflow-hidden rounded-[22px] border border-[#E8DFD5] bg-[#FFFDFC] shadow-[0_4px_18px_rgba(55,38,25,0.035)]">
              <div className="border-b border-[#EEE7DF] p-4 sm:p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A0958B]">Category library</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-lg font-extrabold tracking-tight">All categories</h2><span className="rounded-full bg-[#F3EDE6] px-2.5 py-1 text-[10px] font-extrabold text-[#6D6258]">{loading ? "Loading" : `${sortedCategories.length} shown`}</span></div>
                    <p className="mt-1 text-xs leading-5 text-[#8A7E73]">Search, filter and update your marketplace categories.</p>
                  </div>
                  <p className="mt-2 text-[11px] font-medium text-[#9A8E83] sm:mt-0">{usingFallback ? "Live usage unavailable" : `${metrics.active} active · ${metrics.inactive} inactive`}</p>
                </div>

                <div className="mt-4 grid gap-2.5 md:grid-cols-[minmax(0,1fr)_170px_190px]">
                  <label className="relative block min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A79B90]" />
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search categories or parent names…" aria-label="Search categories"
                      className="h-11 w-full rounded-xl border border-[#E8DFD5] bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-[#B1A69B] focus:border-[#FF947C] focus:ring-4 focus:ring-[#FF5A36]/10" />
                  </label>
                  <label className="relative block">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A79B90]" />
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CategoryStatusFilter)} aria-label="Filter by category status"
                      className="h-11 w-full appearance-none rounded-xl border border-[#E8DFD5] bg-white pl-9 pr-8 text-xs font-bold text-[#5E554E] outline-none focus:border-[#FF947C]">
                      <option value="ALL">All categories</option><option value="ACTIVE">Active only</option><option value="INACTIVE">Inactive only</option><option value="UNUSED">No activity</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A79B90]" />
                  </label>
                  <label className="relative block">
                    <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A79B90]" />
                    <select value={sortBy} onChange={(event) => setSortBy(event.target.value as CategorySort)} aria-label="Sort categories"
                      className="h-11 w-full appearance-none rounded-xl border border-[#E8DFD5] bg-white pl-9 pr-8 text-xs font-bold text-[#5E554E] outline-none focus:border-[#FF947C]">
                      <option value="ORDER">Display order</option><option value="NAME">Name A–Z</option><option value="BUSINESSES">Most businesses</option><option value="PRODUCTS">Most products</option><option value="REQUESTS">Most requests</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A79B90]" />
                  </label>
                </div>
              </div>

              <div className="hidden grid-cols-[minmax(0,1fr)_112px_230px_190px] items-center gap-4 border-b border-[#EEE7DF] bg-[#FCF8F3] px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#9A8E83] lg:grid">
                <span>Category</span><span>Status</span><span>Marketplace usage</span><span className="text-right">Actions</span>
              </div>

              {loading ? <div className="flex min-h-[250px] flex-col items-center justify-center gap-3 px-6 py-12"><LoaderCircle className="h-7 w-7 animate-spin text-[#FF5A36]" /><p className="text-xs font-semibold text-[#8D8176]">Loading categories…</p></div>
                : sortedCategories.length === 0 ? <div className="flex min-h-[250px] flex-col items-center justify-center px-6 py-12 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]"><Search className="h-5 w-5" /></span>
                  <h3 className="mt-4 text-sm font-extrabold">No matching categories</h3>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-[#8D8176]">Try a different search or filter, or add a new category.</p>
                  <button type="button" onClick={() => { setSearch(""); setStatusFilter("ALL"); }} className="mt-4 rounded-xl border border-[#E8DFD5] bg-white px-3.5 py-2.5 text-xs font-bold text-[#5E554E] hover:border-[#FFB49F]">Clear filters</button>
                </div>
                : <div className="divide-y divide-[#EFE8E0]">
                  {sortedCategories.map((category) => {
                    const Icon = getIcon(category.iconKey);
                    const tone = getTone(category.iconKey);
                    const totalUsage = category._count.business + category._count.products + category._count.requests;
                    const childCount = categories.filter((item) => item.parentId === category.id).length;
                    const hasChildren = childCount > 0;
                    const canDelete = canDeleteCategory(category);
                    const isProcessing = processingId === category.id;
                    return (
                      <article key={category.id} className={`grid gap-3 p-4 transition hover:bg-[#FFFCF8] sm:p-5 lg:grid-cols-[minmax(0,1fr)_112px_230px_190px] lg:items-center lg:gap-4 ${category.parentId ? "border-l-[3px] border-l-[#FFB49F] bg-[#FFFCF8] pl-4 sm:pl-6" : ""} ${editingId === category.id ? "bg-[#FFF7F2]" : ""}`}>
                        <div className="flex min-w-0 items-start gap-3">
                          {category.imageUrl ? <img src={category.imageUrl} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover" /> : <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.background} ${tone.text}`}><Icon className="h-5 w-5" /></span>}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="break-words text-sm font-extrabold text-[#28231F]">{category.name}</h3>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-extrabold lg:hidden ${category.isActive ? "bg-emerald-50 text-emerald-700" : "bg-[#F0ECE7] text-[#7E746B]"}`}><span className={`h-1.5 w-1.5 rounded-full ${category.isActive ? "bg-emerald-500" : "bg-[#A39A91]"}`} />{category.isActive ? "ACTIVE" : "INACTIVE"}</span>
                              {category.parentId && <span className="rounded-full bg-[#FFF0E8] px-2 py-1 text-[9px] font-extrabold text-[#9F2D18]">SUBCATEGORY</span>}
                              {hasChildren && <span className="rounded-full bg-[#EAF1F8] px-2 py-1 text-[9px] font-extrabold text-[#365C7E]">{childCount} CHILD{childCount === 1 ? "" : "REN"}</span>}
                              {totalUsage === 0 && !usingFallback && <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-extrabold text-amber-700">NO ACTIVITY</span>}
                            </div>
                            <p className="mt-1.5 text-[11px] leading-4 text-[#9B9085]">{category.parentId ? `Subcategory of ${categoryNameById.get(category.parentId) ?? "another category"}` : "Top-level category"} <span className="px-1">·</span> Order {category.sortOrder}</p>
                          </div>
                        </div>

                        <div className="hidden lg:block">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-extrabold ${category.isActive ? "bg-emerald-50 text-emerald-700" : "bg-[#F0ECE7] text-[#7E746B]"}`}><span className={`h-1.5 w-1.5 rounded-full ${category.isActive ? "bg-emerald-500" : "bg-[#A39A91]"}`} />{category.isActive ? "Active" : "Inactive"}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#F1EBE4] pt-3 lg:border-0 lg:pt-0">
                          <div className="min-w-[68px]"><p className="text-[9px] font-semibold text-[#9A8F84]">Businesses</p><p className="mt-0.5 text-sm font-extrabold tabular-nums text-[#342C25]">{usingFallback ? "—" : category._count.business.toLocaleString("en-NG")}</p></div>
                          <div className="min-w-[58px]"><p className="text-[9px] font-semibold text-[#9A8F84]">Products</p><p className="mt-0.5 text-sm font-extrabold tabular-nums text-[#342C25]">{usingFallback ? "—" : category._count.products.toLocaleString("en-NG")}</p></div>
                          <div className="min-w-[58px]"><p className="text-[9px] font-semibold text-[#9A8F84]">Requests</p><p className="mt-0.5 text-sm font-extrabold tabular-nums text-[#342C25]">{usingFallback ? "—" : category._count.requests.toLocaleString("en-NG")}</p></div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-[#F1EBE4] pt-3 lg:border-0 lg:pt-0">
                          <button type="button" onClick={() => startEdit(category)} disabled={usingFallback || saving || Boolean(processingId)} title="Edit category" aria-label={`Edit ${category.name}`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#EAE2D9] bg-white px-3 text-[11px] font-bold text-[#74695F] transition hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /><span>Edit</span></button>
                          <button type="button" onClick={() => void toggleCategory(category)} disabled={usingFallback || saving || Boolean(processingId)} title={category.isActive ? "Deactivate category" : "Activate category"} aria-label={`${category.isActive ? "Deactivate" : "Activate"} ${category.name}`} className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border bg-white px-3 text-[11px] font-bold transition disabled:opacity-40 ${category.isActive ? "border-[#EAE2D9] text-[#74695F] hover:border-rose-200 hover:text-rose-700" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>{isProcessing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : category.isActive ? <Eye className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}<span>{category.isActive ? "Hide" : "Show"}</span></button>
                          <button type="button" onClick={() => setDeleteTarget(category)} disabled={usingFallback || saving || Boolean(processingId) || !canDelete} title={hasChildren ? "Remove subcategories before deleting this parent." : totalUsage > 0 ? "This category is connected to marketplace records." : "Delete category"} aria-label={`Delete ${category.name}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#EAE2D9] bg-white text-[#A1968C] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </article>
                    );
                  })}
                </div>}

              <div className="flex flex-col gap-2 border-t border-[#EEE7DF] bg-[#FCF8F3] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-[10px] leading-4 text-[#93877B]">{usingFallback ? "Live category usage is unavailable." : `Showing ${sortedCategories.length} of ${categories.length}. Categories with linked records or subcategories cannot be deleted.`}</p>
                <Link href="/admin/businesses" className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-[#9F2D18] hover:underline">Review businesses <ArrowUpRight className="h-3.5 w-3.5" /></Link>
              </div>
            </section>

            <footer className="mt-6 flex flex-col gap-2 border-t border-[#E6DDD3] py-5 text-[10px] leading-5 text-[#9B8F84] sm:flex-row sm:items-center sm:justify-between">
              <p>ReMarket Category Management · Keep discovery organised and useful.</p>
              <p className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" />{usingFallback ? "Using static fallback" : "Connected to admin category data"}</p>
            </footer>
          </div>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E5DCD1] bg-[#FFFDFC]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(44,32,22,0.07)] backdrop-blur-xl md:hidden" aria-label="Mobile admin navigation">
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-1">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/admin/categories";
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-center text-[9px] font-extrabold transition sm:text-[10px] ${active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#766B61] hover:bg-[#F7F2EC]"}`}><Icon className="h-4 w-4 shrink-0" /><span className="max-w-full truncate leading-tight">{item.label}</span></Link>;
          })}
        </div>
      </nav>

      {editorOpen && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#17202A]/55 p-2 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) resetForm(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="category-editor-title" className="flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[24px] border border-[#E7DDD2] bg-[#FFFDFC] shadow-2xl sm:max-h-[92dvh] sm:rounded-[24px]">
          <div className="flex items-start justify-between gap-3 border-b border-[#EEE7DF] px-5 py-4 sm:px-6">
            <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A0958B]">Category details</p><h2 id="category-editor-title" className="mt-1 text-lg font-black tracking-tight text-[#28221E]">{editingId ? "Edit category" : "Add a category"}</h2><p className="mt-1 text-xs leading-5 text-[#82776D]">Set the name, hierarchy and how buyers see this category.</p></div>
            <button type="button" onClick={resetForm} disabled={saving} aria-label="Close category editor" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#EAE2D9] bg-white text-[#74695F] hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:opacity-50"><X className="h-4 w-4" /></button>
          </div>

          <form onSubmit={submitForm} className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-5 p-5 sm:p-6">
              <div className="flex items-center gap-3 rounded-2xl border border-[#EEE4D9] bg-[#FCF7F1] p-3.5">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl ${selectedTone.background} ${selectedTone.text}`}>{imageUrl.trim() ? <img src={imageUrl.trim()} alt="" className="h-full w-full object-cover" /> : <SelectedIcon className="h-6 w-6" />}</span>
                <div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#9D9084]">Buyer-facing preview</p><p className="mt-1 truncate text-sm font-extrabold text-[#28231F]">{name.trim() || "Your category name"}</p><p className="mt-0.5 text-[10px] text-[#85796F]">{parentId ? `Subcategory of ${categoryNameById.get(parentId) ?? "selected category"}` : "Top-level category"} · {isActive ? "Active" : "Inactive"}</p></div>
              </div>

              {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-[#F0C5BE] bg-[#FFF3F0] px-3.5 py-3 text-xs font-semibold leading-5 text-[#9F2D18]"><X className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 flex-1">{error}</p><button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="category-name" className="text-xs font-bold text-[#4D453E]">Category name</label>
                  <input id="category-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Furniture & Home" maxLength={50} required disabled={usingFallback || saving} className="mt-2 h-11 w-full rounded-xl border border-[#E6DED5] bg-white px-3.5 text-sm text-[#17202A] outline-none transition placeholder:text-[#B1A69B] focus:border-[#FF947C] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F4F0EB]" />
                  <p className="mt-1.5 text-right text-[10px] text-[#A3988E]">{name.length}/50 characters</p>
                </div>
                <div>
                  <label htmlFor="category-parent" className="text-xs font-bold text-[#4D453E]">Category level</label>
                  <select id="category-parent" value={parentId} onChange={(event) => setParentId(event.target.value)} disabled={usingFallback || saving || editingCategoryHasChildren} className="mt-2 h-11 w-full rounded-xl border border-[#E6DED5] bg-white px-3.5 text-sm text-[#17202A] outline-none transition focus:border-[#FF947C] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F4F0EB]">
                    <option value="">Top-level category</option>{parentOptions.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}{!parent.isActive ? " (inactive parent)" : ""}</option>)}
                  </select>
                  <p className="mt-1.5 text-[10px] leading-4 text-[#9A8E83]">{editingCategoryHasChildren ? "This category has subcategories and must remain top-level." : "Choose a parent to make this a subcategory. Only two levels are supported."}</p>
                </div>
              </div>

              <div>
                <label htmlFor="category-image" className="text-xs font-bold text-[#4D453E]">Category image URL <span className="font-normal text-[#9A8E83]">(optional)</span></label>
                <input id="category-image" type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://example.com/category-image.jpg" disabled={usingFallback || saving} className="mt-2 h-11 w-full rounded-xl border border-[#E6DED5] bg-white px-3.5 text-sm text-[#17202A] outline-none transition placeholder:text-[#B1A69B] focus:border-[#FF947C] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F4F0EB]" />
                <p className="mt-1.5 text-[10px] text-[#9A8E83]">Use a publicly accessible HTTP or HTTPS image URL.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-[#4D453E]">Category icon</label>
                <button type="button" disabled={usingFallback || saving} aria-expanded={showIconPicker} onClick={() => setShowIconPicker((current) => !current)} className="mt-2 flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#E6DED5] bg-white px-3 text-sm transition hover:border-[#FFB49F] disabled:bg-[#F4F0EB]">
                  <span className="flex min-w-0 items-center gap-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selectedTone.background} ${selectedTone.text}`}><SelectedIcon className="h-4 w-4" /></span><span className="truncate font-semibold">{ICONS.find((item) => item.key === iconKey)?.label ?? iconKey}</span></span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#9A8F84] transition ${showIconPicker ? "rotate-180" : ""}`} />
                </button>
                {showIconPicker && <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[#E6DED5] bg-white p-2"><div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {ICONS.map((item) => { const Icon = item.icon; const selected = item.key === iconKey; return <button key={item.key} type="button" onClick={() => { setIconKey(item.key); setShowIconPicker(false); }} aria-pressed={selected} className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1 py-2 transition ${selected ? "border-[#FFB49F] bg-[#FFF0E8]" : "border-transparent hover:border-[#EEE4D9] hover:bg-[#FCF7F1]"}`}><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.tone.background} ${item.tone.text}`}><Icon className="h-4 w-4" /></span><span className="max-w-full truncate text-[9px] font-bold text-[#625850]">{item.label}</span></button>; })}
                </div></div>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="category-order" className="text-xs font-bold text-[#4D453E]">Display order</label>
                  <input id="category-order" type="number" min={0} step={1} inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} disabled={usingFallback || saving} className="mt-2 h-11 w-full rounded-xl border border-[#E6DED5] bg-white px-3 text-sm outline-none focus:border-[#FF947C] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F4F0EB]" />
                  <p className="mt-1.5 text-[10px] leading-4 text-[#9A8E83]">Lower numbers appear first.</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-[#4D453E]">Buyer visibility</span>
                  <button type="button" disabled={usingFallback || saving} onClick={() => setIsActive((current) => !current)} aria-pressed={isActive} className={`mt-2 flex h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 transition disabled:opacity-60 ${isActive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-[#E4DDD5] bg-[#F5F2EE] text-[#6D655D]"}`}>
                    <span className="flex items-center gap-2 text-xs font-extrabold"><span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-[#9A9087]"}`} />{isActive ? "Active · visible to buyers" : "Inactive · hidden from buyers"}</span>
                    <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${isActive ? "bg-emerald-500" : "bg-[#C7BEB4]"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${isActive ? "left-[18px]" : "left-0.5"}`} /></span>
                  </button>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[#EEE7DF] bg-[#FFFDFC]/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-[10px] leading-4 text-[#9A8E83]">{editingId ? "Your changes will update this category." : "New categories become part of ReMarket discovery."}</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button type="button" onClick={resetForm} disabled={saving} className="min-h-10 rounded-xl border border-[#E2D8CD] bg-white px-4 py-2.5 text-xs font-bold text-[#655C54] hover:bg-[#F8F3ED] disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={saving || usingFallback} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#ED4F2F] disabled:cursor-not-allowed disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{saving ? "Saving…" : editingId ? "Save changes" : "Create category"}</button>
              </div>
            </div>
          </form>
        </section>
      </div>}

      {deleteTarget && <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[#17202A]/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !processingId) setDeleteTarget(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="delete-category-title" className="w-full max-w-md rounded-3xl border border-[#E7DDD2] bg-[#FFFDFC] p-5 shadow-2xl sm:p-6">
          <div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFF0ED] text-[#AD3A2A]"><Trash2 className="h-5 w-5" /></span><div className="min-w-0"><h2 id="delete-category-title" className="text-lg font-black text-[#28221E]">Delete this category?</h2><p className="mt-2 text-sm leading-6 text-[#776C63]">You are about to permanently delete <strong>“{deleteTarget.name}”</strong>. This action cannot be undone.</p></div></div>
          <div className="mt-4 rounded-2xl bg-[#F8F4EF] p-3 text-xs leading-5 text-[#71675F]"><p>Only categories without products, businesses, buyer requests or subcategories can be deleted.</p><p className="mt-1">If this category is still connected to other records, the server will reject the deletion and explain why.</p></div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setDeleteTarget(null)} disabled={Boolean(processingId)} className="rounded-xl border border-[#E2D8CD] bg-white px-4 py-3 text-sm font-bold text-[#655C54] hover:bg-[#F8F3ED] disabled:opacity-50">Cancel</button><button type="button" onClick={() => void deleteCategory()} disabled={Boolean(processingId)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#B73728] px-4 py-3 text-sm font-bold text-white hover:bg-[#9F2D18] disabled:opacity-50">{processingId === deleteTarget.id && <LoaderCircle className="h-4 w-4 animate-spin" />}{processingId === deleteTarget.id ? "Deleting…" : "Delete category"}</button></div>
        </section>
      </div>}
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
  return <div className="min-w-0 rounded-2xl border border-[#E8DFD5] bg-[#FFFDFC] p-3.5 shadow-[0_3px_12px_rgba(55,38,25,0.025)] sm:p-4"><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-bold text-[#82776D] sm:text-[11px]">{label}</span><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}><Icon className="h-4 w-4" /></span></div><p className="mt-2 text-2xl font-black tracking-tight text-[#24201C] tabular-nums sm:text-[28px]">{typeof value === "number" ? value.toLocaleString("en-NG") : value}</p><div className="mt-1.5 flex min-w-0 items-center gap-1.5"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} /><p className="truncate text-[9px] leading-4 text-[#9A8F84] sm:text-[10px]">{note}</p></div></div>;
}

