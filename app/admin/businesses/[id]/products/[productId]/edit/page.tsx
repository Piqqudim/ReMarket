"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  ChevronRight,
  ClipboardList,
  Eye,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Package,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  X,
} from "lucide-react";

import ProductImageUpload from "@/components/ProductImageUpload";
import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ReMarketCategory,
} from "@/lib/categories";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type BusinessStatus = "ACTIVE" | "INACTIVE" | "PENDING";

type ProductImage = {
  id: string;
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: Availability;
  keywords: string[];
  imageUrl: string | null;
  status: BusinessStatus;
  images: ProductImage[];
  deletedAt: string | null;
};

type ApiCategory = {
  id: string;
  name: string;
  iconKey?: string;
  isActive?: boolean;
  sortOrder?: number;
};

type AdminNavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const ADMIN_NAV: AdminNavItem[] = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Content", href: "/admin/content", icon: Megaphone },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiCategory(value: unknown): value is ApiCategory {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function isAvailability(value: unknown): value is Availability {
  return value === "AVAILABLE" || value === "ASK_SELLER" || value === "UNAVAILABLE";
}

function isBusinessStatus(value: unknown): value is BusinessStatus {
  return value === "ACTIVE" || value === "INACTIVE" || value === "PENDING";
}

function getString(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === "string" ? record[key] as string : null;
}

function getNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readOptionalInteger(value: string): number | null | "INVALID" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return "INVALID";
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : "INVALID";
}

function formatPriceInput(value: number | null): string {
  return value === null ? "" : String(value);
}

function formatNaira(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Price on request";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeProductImage(value: unknown, fallbackIndex: number): ProductImage | null {
  if (!isRecord(value)) return null;
  const url = getString(value, "url");
  if (!url) return null;

  const id = getString(value, "id") ?? `${fallbackIndex}-${url}`;
  const publicId = getString(value, "publicId");
  const rawSortOrder = getNumber(value, "sortOrder");

  return {
    id,
    url,
    publicId,
    sortOrder:
      rawSortOrder !== null && Number.isInteger(rawSortOrder)
        ? rawSortOrder
        : fallbackIndex,
  };
}

function normalizeProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null;

  const id = getString(value, "id");
  const name = getString(value, "name");
  if (!id || !name) return null;

  const rawImages = Array.isArray(value.images) ? value.images : [];
  const images = rawImages
    .map((image, index) => normalizeProductImage(image, index))
    .filter((image): image is ProductImage => image !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const imageUrl = getString(value, "imageUrl");
  if (images.length === 0 && imageUrl) {
    images.push({ id: `legacy-${id}`, url: imageUrl, publicId: null, sortOrder: 0 });
  }

  const keywords = Array.isArray(value.keywords)
    ? value.keywords.filter((item): item is string => typeof item === "string")
    : [];

  const category = isRecord(value.category) ? value.category : null;

  return {
    id,
    name,
    description: getString(value, "description"),
    categoryId: getString(value, "categoryId"),
    categoryName: category && typeof category.name === "string" ? category.name : null,
    price: getNumber(value, "price"),
    priceMin: getNumber(value, "priceMin"),
    priceMax: getNumber(value, "priceMax"),
    availability: isAvailability(value.availability) ? value.availability : "ASK_SELLER",
    keywords,
    imageUrl,
    status: isBusinessStatus(value.status) ? value.status : "ACTIVE",
    images,
    deletedAt: getString(value, "deletedAt"),
  };
}

function normalizeBusinessProducts(value: unknown): Product[] {
  if (!isRecord(value) || !Array.isArray(value.products)) return [];
  return value.products
    .map(normalizeProduct)
    .filter((product): product is Product => product !== null);
}

function getCategoryList(value: unknown): { categories: ReMarketCategory[]; fallback: boolean } {
  const rawCategories = isRecord(value) ? value.categories : undefined;
  if (!Array.isArray(rawCategories)) return { categories: DEFAULT_CATEGORIES, fallback: true };
  const backendCategories = rawCategories.filter(isApiCategory);
  if (backendCategories.length === 0) return { categories: DEFAULT_CATEGORIES, fallback: true };
  return {
    categories: mergeCategories(backendCategories as Parameters<typeof mergeCategories>[0]),
    fallback: false,
  };
}

function getStatusStyle(status: BusinessStatus): string {
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "PENDING") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-stone-100 text-stone-600 ring-stone-200";
}

function getAvailabilityLabel(availability: Availability): string {
  if (availability === "AVAILABLE") return "Available";
  if (availability === "UNAVAILABLE") return "Unavailable";
  return "Ask seller";
}

export default function EditProductPage() {
  const params = useParams<{ id: string; productId: string }>();
  const router = useRouter();
  const businessId = params.id;
  const productId = params.productId;

  const [businessName, setBusinessName] = useState("");
  const [businessDeletedAt, setBusinessDeletedAt] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<ReMarketCategory[]>(DEFAULT_CATEGORIES);
  const [categoriesFallback, setCategoriesFallback] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [availability, setAvailability] = useState<Availability>("ASK_SELLER");
  const [status, setStatus] = useState<BusinessStatus>("ACTIVE");
  const [keywords, setKeywords] = useState("");
  const [images, setImages] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!businessId || !productId) return;

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [businessResponse, categoriesResponse] = await Promise.all([
          fetch(`/api/admin/businesses/${businessId}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/categories", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        const [businessData, categoriesData] = await Promise.all([
          readJson(businessResponse),
          readJson(categoriesResponse),
        ]);

        if (!businessResponse.ok) {
          throw new Error(
            isRecord(businessData) && typeof businessData.error === "string"
              ? businessData.error
              : "Unable to load business.",
          );
        }

        if (!isRecord(businessData) || !isRecord(businessData.business)) {
          throw new Error("Unable to load business.");
        }

        const business = businessData.business;
        const foundProduct = normalizeBusinessProducts(business).find(
          (item) => item.id === productId,
        );

        if (!foundProduct) throw new Error("Product not found.");

        setBusinessName(typeof business.name === "string" ? business.name : "");
        setBusinessDeletedAt(
          typeof business.deletedAt === "string" ? business.deletedAt : null,
        );
        setProduct(foundProduct);
        setName(foundProduct.name);
        setDescription(foundProduct.description ?? "");
        setCategoryId(foundProduct.categoryId ?? "");
        setPrice(formatPriceInput(foundProduct.price));
        setPriceMin(formatPriceInput(foundProduct.priceMin));
        setPriceMax(formatPriceInput(foundProduct.priceMax));
        setAvailability(foundProduct.availability);
        setStatus(foundProduct.status);
        setKeywords(foundProduct.keywords.join(", "));
        setImages(foundProduct.images.map((image) => image.url));

        const categoryState = categoriesResponse.ok
          ? getCategoryList(categoriesData)
          : { categories: DEFAULT_CATEGORIES, fallback: true };
        setCategories(categoryState.categories);
        setCategoriesFallback(categoryState.fallback);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        console.error("Edit product load error:", loadError);
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load product.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [businessId, productId]);

  const businessDeleted = Boolean(businessDeletedAt);
  const productDeleted = Boolean(product?.deletedAt);
  const editingDisabled = businessDeleted || productDeleted;

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId),
    [categories, categoryId],
  );

  const displayCategoryName = categoriesFallback
    ? product?.categoryName ?? (product?.categoryId ? "Existing category" : "Uncategorised")
    : selectedCategory?.name ?? "Uncategorised";

  const currentImages = useMemo(() => images.filter(Boolean), [images]);
  const previewImage = currentImages[0] ?? product?.imageUrl ?? null;
  const completionItems = useMemo(
    () => [
      { label: "Product name", complete: Boolean(name.trim()) },
      { label: "Product description", complete: Boolean(description.trim()) },
      { label: "Product photos", complete: currentImages.length > 0 },
      { label: "Category", complete: Boolean(categoryId || product?.categoryId) },
      { label: "Price information", complete: Boolean(price.trim() || priceMin.trim() || priceMax.trim()) },
      { label: "Search keywords", complete: Boolean(keywords.trim()) },
    ],
    [name, description, currentImages.length, categoryId, product?.categoryId, price, priceMin, priceMax, keywords],
  );
  const completionPercent = Math.round(
    (completionItems.filter((item) => item.complete).length / completionItems.length) * 100,
  );

  function parsePriceField(value: string, label: string): number | null {
    const parsed = readOptionalInteger(value);
    if (parsed === "INVALID") throw new Error(`${label} must be a whole number.`);
    return parsed;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!product) {
      setError("Product could not be loaded.");
      return;
    }
    if (editingDisabled) {
      setError(productDeleted ? "This product has been deleted." : "This business has been deleted.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Product name is required.");
      return;
    }

    let parsedPrice: number | null;
    let parsedPriceMin: number | null;
    let parsedPriceMax: number | null;
    try {
      parsedPrice = parsePriceField(price, "Exact price");
      parsedPriceMin = parsePriceField(priceMin, "Minimum price");
      parsedPriceMax = parsePriceField(priceMax, "Maximum price");
    } catch (priceError) {
      setError(priceError instanceof Error ? priceError.message : "Price values are invalid.");
      return;
    }

    if (parsedPrice !== null && parsedPrice < 0) {
      setError("Exact price cannot be negative.");
      return;
    }
    if (parsedPriceMin !== null && parsedPriceMin < 0) {
      setError("Minimum price cannot be negative.");
      return;
    }
    if (parsedPriceMax !== null && parsedPriceMax < 0) {
      setError("Maximum price cannot be negative.");
      return;
    }
    if (parsedPriceMin !== null && parsedPriceMax !== null && parsedPriceMin > parsedPriceMax) {
      setError("Minimum price cannot be greater than maximum price.");
      return;
    }

    setSaving(true);

    const keywordValues = keywords
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const response = await fetch(
        `/api/admin/businesses/${businessId}/products/${productId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            description: description.trim() || null,
            // If the category service is down, preserve the current database ID.
            categoryId: categoriesFallback ? product.categoryId : categoryId || null,
            price: parsedPrice,
            priceMin: parsedPriceMin,
            priceMax: parsedPriceMax,
            availability,
            status,
            keywords: keywordValues,
            images: currentImages,
          }),
        },
      );

      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Unable to update product.",
        );
      }

      setSuccess("Product changes saved successfully.");
      router.push(`/admin/businesses/${businessId}`);
      router.refresh();
    } catch (submitError) {
      console.error("Update product error:", submitError);
      setError(
        submitError instanceof Error ? submitError.message : "Unable to update product.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (!product || editingDisabled) return;
    const confirmed = window.confirm(
      "Delete this product? The product will be soft-deleted and kept in the admin record.",
    );
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/businesses/${businessId}/products/${productId}`,
        { method: "DELETE" },
      );
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Unable to delete product.",
        );
      }
      router.push(`/admin/businesses/${businessId}`);
      router.refresh();
    } catch (deleteError) {
      console.error("Delete product error:", deleteError);
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete product.",
      );
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#F5F0E9] p-4 text-[#6F675F]">
        <div className="flex items-center gap-3 rounded-2xl border border-[#E8DFD5] bg-white px-5 py-4 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-[#FF5A36]" />
          <span className="text-sm font-semibold">Preparing product workspace…</span>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-dvh bg-[#F5F0E9] p-4 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <Link
            href={`/admin/businesses/${businessId}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#6F675F] hover:text-[#9F2D18]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to business
          </Link>
          <div className="mt-6 rounded-3xl border border-[#E8DFD5] bg-white p-8 text-center shadow-sm sm:p-12">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]"><Package className="h-7 w-7" /></div>
            <h1 className="mt-4 text-xl font-black text-[#202D37]">Product unavailable</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#81776F]">{error || "The product could not be found for this business."}</p>
            <Link href={`/admin/businesses/${businessId}`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-bold text-white">Return to business <ChevronRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F5F0E9] text-[#202D37]">
      <div className="flex min-h-dvh w-full">
        <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-[#E5DCD1] bg-[#FFFCF8] lg:flex">
          <Link href="/admin" className="flex h-[76px] items-center gap-3 border-b border-[#EAE1D7] px-5">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#FF5A36] text-lg font-black text-white shadow-sm">R</span>
            <span><span className="block text-[15px] font-black tracking-tight">ReMarket</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9A8E83]">Admin workspace</span></span>
          </Link>
          <div className="px-4 pt-6"><p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#A39A91]">Workspace</p></div>
          <nav className="mt-3 space-y-1 px-3">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Businesses";
              return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? "bg-[#FFE4DB] text-[#9F2D18]" : "text-[#72685F] hover:bg-[#F7F0E8]"}`}><Icon className="h-[17px] w-[17px]" /><span>{item.label}</span></Link>;
            })}
          </nav>
          <div className="mt-auto p-4"><div className="rounded-2xl bg-[#202D37] p-4 text-white"><Sparkles className="h-5 w-5 text-[#FF9A7C]" /><p className="mt-3 text-sm font-bold">Make every listing count.</p><p className="mt-1 text-[11px] leading-5 text-white/65">Clear product details help buyers find the right item.</p></div></div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-[#E9E0D7] bg-[#FFFDFC]/95 backdrop-blur-xl">
            <div className="flex h-[66px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <Link href={`/admin/businesses/${businessId}`} aria-label="Back to business" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#E7DED4] bg-white text-[#665D55] transition hover:border-[#FFB49F] hover:text-[#9F2D18]"><ArrowLeft className="h-4 w-4" /></Link>
                <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9A8E83]">Merchant catalogue</p><p className="truncate text-sm font-black">Edit product</p></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/seller/${businessId}`} target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-xl border border-[#E7DED4] bg-white px-3 py-2 text-xs font-bold text-[#645B53] hover:border-[#FFB49F] sm:inline-flex"><Eye className="h-3.5 w-3.5" />Public view</Link>
                {!editingDisabled && <button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={deleting || saving} className="inline-flex items-center gap-2 rounded-xl border border-[#F0C6BD] bg-[#FFF5F2] px-3 py-2 text-xs font-bold text-[#A33122] transition hover:bg-[#FFE9E3] disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Delete product</span><span className="sm:hidden">Delete</span></button>}
              </div>
            </div>
            <nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto border-t border-[#F0E9E1] px-3 py-2 lg:hidden">
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/businesses";
                return <Link key={item.href} href={item.href} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${active ? "bg-[#FFE4DB] text-[#9F2D18]" : "text-[#766C63] hover:bg-[#F8F2EB]"}`}><Icon className="h-3.5 w-3.5" />{item.label}</Link>;
              })}
            </nav>
          </header>

          <div className="mx-auto w-full max-w-[1680px] px-3 pb-10 pt-4 sm:px-5 sm:pt-6 lg:px-8 lg:pb-12">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-[#93877C]"><Link href="/admin/businesses" className="hover:text-[#9F2D18]">Businesses</Link><ChevronRight className="h-3 w-3" /><Link href={`/admin/businesses/${businessId}`} className="max-w-[220px] truncate hover:text-[#9F2D18]">{businessName || "Business"}</Link><ChevronRight className="h-3 w-3" /><span className="text-[#9F2D18]">Product editor</span></div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl lg:text-4xl">Give your product <span className="text-[#FF5A36]">a fresh look.</span></h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7D736B]">Edit the details buyers see, sharpen its search keywords, and keep availability up to date.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-[#E6DCD1] bg-white px-4 py-3 shadow-sm"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><Package className="h-4 w-4" /></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#A3988D]">Business</p><p className="max-w-[220px] truncate text-sm font-bold text-[#202D37]">{businessName || "Current business"}</p></div></div>
            </div>

            {businessDeleted && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>{productDeleted ? "This product has been soft-deleted and can no longer be edited." : "This business has been deleted and its products can no longer be edited."}</p></div>}
            {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#F0C4BB] bg-[#FFF2EF] px-4 py-3 text-sm text-[#9F2D18]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 flex-1">{error}</p><button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="shrink-0 rounded-lg p-1 hover:bg-[#FFE3DC]"><X className="h-4 w-4" /></button></div>}
            {success && <div role="status" className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><Check className="h-4 w-4" />{success}</div>}

            <section className="mb-5 overflow-hidden rounded-[28px] bg-[#202D37] text-white shadow-[0_20px_60px_rgba(32,45,55,0.12)]">
              <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center lg:p-8">
                <div className="pointer-events-none absolute -right-10 -top-24 h-64 w-64 rounded-full border-[35px] border-white/[0.04]" />
                <div className="relative min-w-0"><div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#FFD1C3]"><Sparkles className="h-3.5 w-3.5" /> Listing quality studio</div><h2 className="mt-4 max-w-3xl text-2xl font-black tracking-tight sm:text-3xl">Make this product easier to <span className="text-[#FF9B7E]">discover.</span></h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Keep product information clear and accurate so shoppers can decide whether to contact the seller.</p><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80">{currentImages.length} photo{currentImages.length === 1 ? "" : "s"}</span><span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80">{keywords.split(",").map((item) => item.trim()).filter(Boolean).length} search keyword{keywords.split(",").map((item) => item.trim()).filter(Boolean).length === 1 ? "" : "s"}</span><span className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80">{displayCategoryName}</span></div></div>
                <div className="relative rounded-2xl border border-white/10 bg-white/[0.07] p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-white/70">Listing completeness</span><span className="text-xl font-black text-[#FF9B7E]">{completionPercent}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#FF805F] transition-all duration-300" style={{ width: `${completionPercent}%` }} /></div><p className="mt-3 text-[11px] leading-5 text-white/55">{completionItems.filter((item) => item.complete).length} of {completionItems.length} helpful details filled in.</p></div>
              </div>
            </section>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
              <form onSubmit={submit} className="order-2 min-w-0 space-y-5 xl:order-none">
                <section className="rounded-[24px] border border-[#E7DDD2] bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]"><Package className="h-5 w-5" /></div><div><h2 className="text-base font-black">01 · Product details</h2><p className="mt-1 text-xs leading-5 text-[#8B8178]">Start with the name buyers will search for.</p></div></div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Field label="Product name" value={name} onChange={setName} placeholder="e.g. Men's everyday sneakers" disabled={editingDisabled || saving || deleting} required />
                    <div><label className="text-xs font-bold text-[#5E554E]" htmlFor="product-status">Listing status</label><select id="product-status" value={status} onChange={(event) => { if (isBusinessStatus(event.target.value)) setStatus(event.target.value); }} disabled={editingDisabled || saving || deleting} className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E6DDD4] bg-[#FFFCF8] px-3 text-sm outline-none transition focus:border-[#FF8F73] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F5F1EC]"><option value="ACTIVE">Active · visible</option><option value="PENDING">Pending review</option><option value="INACTIVE">Inactive · hidden</option></select></div>
                    <div className="md:col-span-2"><label htmlFor="product-description" className="text-xs font-bold text-[#5E554E]">Description</label><textarea id="product-description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={editingDisabled || saving || deleting} rows={4} placeholder="What makes this product useful? Add materials, sizes, condition, or other details buyers should know." className="mt-2 w-full resize-y rounded-xl border border-[#E6DDD4] bg-[#FFFCF8] px-3.5 py-3 text-sm leading-6 outline-none transition placeholder:text-[#B6AAA0] focus:border-[#FF8F73] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F5F1EC]" /><p className="mt-1.5 text-right text-[10px] text-[#A3988D]">{description.length} characters</p></div>
                  </div>
                </section>

                <section className="rounded-[24px] border border-[#E7DDD2] bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#EAF4FF] text-[#275B94]"><Eye className="h-5 w-5" /></div><div><h2 className="text-base font-black">02 · Product photos</h2><p className="mt-1 text-xs leading-5 text-[#8B8178]">Use clear images that show the real product. The first image is the cover.</p></div></div>
                  <div className="mt-5"><ProductImageUpload value={images} onChange={setImages} disabled={editingDisabled || saving || deleting} /></div>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#F8F4EF] px-3.5 py-3"><span className="text-xs font-semibold text-[#6F675F]">Photos selected</span><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#9F2D18]">{currentImages.length}</span></div>
                </section>

                <section className="rounded-[24px] border border-[#E7DDD2] bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#E9F8F0] text-[#287A4B]"><BarChart3 className="h-5 w-5" /></div><div><h2 className="text-base font-black">03 · Category & pricing</h2><p className="mt-1 text-xs leading-5 text-[#8B8178]">Help buyers understand what it is and what it costs.</p></div></div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div><label htmlFor="product-category" className="text-xs font-bold text-[#5E554E]">Category</label>{categoriesFallback ? <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">{displayCategoryName}<p className="mt-1 text-[11px] leading-5 text-amber-800">Category service is unavailable. The saved category will be preserved when you save.</p></div> : <select id="product-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={editingDisabled || saving || deleting} className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E6DDD4] bg-[#FFFCF8] px-3 text-sm outline-none focus:border-[#FF8F73] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F5F1EC]"><option value="">No category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>}</div>
                    <Field label="Exact price (₦)" value={price} onChange={setPrice} placeholder="Leave blank for price on request" inputMode="numeric" disabled={editingDisabled || saving || deleting} />
                    <Field label="Minimum price (₦)" value={priceMin} onChange={setPriceMin} placeholder="Optional" inputMode="numeric" disabled={editingDisabled || saving || deleting} />
                    <Field label="Maximum price (₦)" value={priceMax} onChange={setPriceMax} placeholder="Optional" inputMode="numeric" disabled={editingDisabled || saving || deleting} />
                  </div>
                  {price.trim() && <p className="mt-3 rounded-xl bg-[#F8F4EF] px-3 py-2 text-xs font-semibold text-[#6F675F]">Price preview: <span className="text-[#9F2D18]">{formatNaira(Number(price))}</span></p>}
                </section>

                <section className="rounded-[24px] border border-[#E7DDD2] bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#F1EAFE] text-[#6F45B8]"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="text-base font-black">04 · Availability & discovery</h2><p className="mt-1 text-xs leading-5 text-[#8B8178]">Keep availability current and add phrases people may search for.</p></div></div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><label htmlFor="product-availability" className="text-xs font-bold text-[#5E554E]">Availability</label><select id="product-availability" value={availability} onChange={(event) => { if (isAvailability(event.target.value)) setAvailability(event.target.value); }} disabled={editingDisabled || saving || deleting} className="mt-2 h-12 w-full rounded-xl border border-[#E6DDD4] bg-[#FFFCF8] px-3 text-sm outline-none focus:border-[#FF8F73] disabled:bg-[#F5F1EC]"><option value="AVAILABLE">Available now</option><option value="ASK_SELLER">Ask seller</option><option value="UNAVAILABLE">Currently unavailable</option></select></div><div><label htmlFor="product-keywords" className="text-xs font-bold text-[#5E554E]">Search keywords</label><input id="product-keywords" value={keywords} onChange={(event) => setKeywords(event.target.value)} disabled={editingDisabled || saving || deleting} placeholder="sneakers, shoes, footwear" className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E6DDD4] bg-[#FFFCF8] px-3 text-sm outline-none placeholder:text-[#B6AAA0] focus:border-[#FF8F73] disabled:bg-[#F5F1EC]" /></div></div><p className="mt-2 text-[11px] text-[#A3988D]">Separate keywords with commas. Only use terms that accurately describe the product.</p>
                </section>

                <div className="sticky bottom-2 z-20 rounded-2xl border border-[#E4DACE] bg-[#FFFCF8]/95 p-3 shadow-[0_8px_28px_rgba(32,45,55,0.12)] backdrop-blur-xl sm:bottom-4 sm:p-4">
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={editingDisabled || deleting || saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#F0C6BD] bg-white px-4 py-3 text-xs font-bold text-[#A33122] hover:bg-[#FFF2EF] disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-4 w-4" />Delete product</button><div className="grid grid-cols-2 gap-2 sm:flex"><Link href={`/admin/businesses/${businessId}`} className="inline-flex items-center justify-center rounded-xl border border-[#E3D9CE] bg-white px-4 py-3 text-xs font-bold text-[#655C54] hover:bg-[#F8F3ED]">Cancel</Link><button type="submit" disabled={editingDisabled || saving || deleting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#E94B2D] disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Saving…" : "Save changes"}</button></div></div>
                </div>
              </form>

              <aside className="order-first min-w-0 space-y-5 xl:sticky xl:top-[88px] xl:order-none xl:self-start">
                <section className="overflow-hidden rounded-[24px] border border-[#E7DDD2] bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#EEE6DE] px-4 py-4 sm:px-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A3988D]">Buyer preview</p><h2 className="mt-1 text-sm font-black">Your listing card</h2></div><span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F7EE] px-2.5 py-1 text-[10px] font-bold text-[#287A4B]"><span className="h-1.5 w-1.5 rounded-full bg-[#2E9A5B]" />Live</span></div>
                  <div className="p-4 sm:p-5"><div className="overflow-hidden rounded-2xl border border-[#ECE4DB] bg-[#FFFCF8]"><div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-[radial-gradient(circle_at_20%_10%,#FFE4D8,transparent_44%),linear-gradient(135deg,#F9F0E7,#E8E4DE)]">{previewImage ? <img src={previewImage} alt={name || "Product preview"} className="h-full w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-[#A99A8C]"><Package className="h-12 w-12" /><span className="text-xs font-semibold">Add a photo to preview</span></div>}<span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-[#6D6259] shadow-sm">ReMarket find</span><span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm ${status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : status === "PENDING" ? "bg-amber-50 text-amber-800" : "bg-stone-100 text-stone-600"}`}>{status.toLowerCase()}</span></div><div className="p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-[#A3988D]">{displayCategoryName}</p><h3 className="mt-1 break-words text-base font-black text-[#202D37]">{name.trim() || "Your product name"}</h3><p className="mt-2 line-clamp-3 min-h-[3.75rem] whitespace-pre-wrap break-words text-xs leading-5 text-[#7B7168]">{description.trim() || "A clear product description will appear here so buyers know what you offer."}</p><div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-[#ECE4DB] pt-3"><div><p className="text-[10px] text-[#A3988D]">Price</p><p className="mt-1 text-lg font-black text-[#9F2D18]">{price.trim() && Number.isFinite(Number(price)) ? formatNaira(Number(price)) : priceMin.trim() || priceMax.trim() ? `${priceMin.trim() ? formatNaira(Number(priceMin)) : ""}${priceMin.trim() && priceMax.trim() ? " – " : ""}${priceMax.trim() ? formatNaira(Number(priceMax)) : ""}` : "Ask for price"}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${availability === "AVAILABLE" ? "bg-emerald-50 text-emerald-700" : availability === "UNAVAILABLE" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{getAvailabilityLabel(availability)}</span></div>{keywords.trim() && <div className="mt-3 flex flex-wrap gap-1.5">{keywords.split(",").map((word) => word.trim()).filter(Boolean).slice(0, 5).map((word, index) => <span key={`${word}-${index}`} className="rounded-full bg-[#F1ECE6] px-2 py-1 text-[10px] font-medium text-[#6F675F]">{word}</span>)}</div>}</div></div><div className="mt-4 grid grid-cols-3 gap-2"><MiniStat value={String(currentImages.length)} label="Photos" /><MiniStat value={String(keywords.split(",").map((word) => word.trim()).filter(Boolean).length)} label="Keywords" /><MiniStat value={completionPercent + "%"} label="Complete" /></div></div>
                </section>

                <section className="rounded-[24px] border border-[#E7DDD2] bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center gap-2"><Check className="h-4 w-4 text-[#2D8A54]" /><h2 className="text-sm font-black">Listing checklist</h2></div><p className="mt-1 text-xs leading-5 text-[#8B8178]">A quick quality check before saving.</p><div className="mt-4 space-y-3">{completionItems.map((item) => <div key={item.label} className="flex items-center gap-3"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${item.complete ? "bg-[#E4F6EA] text-[#237B47]" : "bg-[#F2EEE8] text-[#AA9E92]"}`}>{item.complete ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span><span className={`text-xs ${item.complete ? "font-semibold text-[#4D5E53]" : "text-[#8B8178]"}`}>{item.label}</span></div>)}</div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#F0EAE3]"><div className="h-full rounded-full bg-[#FF7756] transition-all duration-300" style={{ width: `${completionPercent}%` }} /></div></section>

                <section className="rounded-[24px] bg-[#FFF0E8] p-4 sm:p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#9F2D18]"><Sparkles className="h-4 w-4" /></div><div><h2 className="text-sm font-black text-[#733322]">Small details, better discovery</h2><p className="mt-2 text-xs leading-5 text-[#865A4C]">Use a specific product name, realistic prices, clear photos, and a few relevant keywords. Avoid adding claims that you cannot verify.</p></div></div></section>
              </aside>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#18242D]/55 p-4 backdrop-blur-sm"><div role="dialog" aria-modal="true" aria-labelledby="delete-product-title" className="w-full max-w-md rounded-3xl border border-[#E7DDD2] bg-[#FFFCF8] p-5 shadow-2xl sm:p-6"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFE7E1] text-[#A33122]"><AlertTriangle className="h-5 w-5" /></div><div><h2 id="delete-product-title" className="text-lg font-black">Delete this product?</h2><p className="mt-2 text-sm leading-6 text-[#776C63]">“{product.name}” will be soft-deleted and retained in the admin record. You can return to the business after the operation.</p></div></div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="rounded-xl border border-[#E2D8CD] bg-white px-4 py-3 text-sm font-bold text-[#655C54] hover:bg-[#F8F3ED] disabled:opacity-50">Keep product</button><button type="button" onClick={() => void deleteProduct()} disabled={deleting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#B73728] px-4 py-3 text-sm font-bold text-white hover:bg-[#9F2D18] disabled:opacity-50">{deleting && <Loader2 className="h-4 w-4 animate-spin" />}{deleting ? "Deleting…" : "Delete product"}</button></div></div></div>}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "search" | "email" | "url";
}) {
  return (
    <div className="min-w-0">
      <label className="text-xs font-bold text-[#5E554E]">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        inputMode={inputMode}
        className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E6DDD4] bg-[#FFFCF8] px-3.5 text-sm text-[#202D37] outline-none transition placeholder:text-[#B6AAA0] focus:border-[#FF8F73] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F5F1EC] disabled:text-[#9A8E83]"
      />
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl bg-[#F8F4EF] px-2 py-3 text-center"><p className="text-sm font-black text-[#202D37]">{value}</p><p className="mt-1 text-[10px] font-semibold text-[#93877C]">{label}</p></div>;
}
