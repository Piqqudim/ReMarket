"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import {
  ArrowLeft,
  BarChart3,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Eye,
  LayoutDashboard,
  Loader2,
  MapPin,
  Megaphone,
  Package,
  PackagePlus,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Tags,
  X,
} from "lucide-react";

import ProductImageUpload from "@/components/ProductImageUpload";
import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

type ProductAvailability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type ProductStatus = "ACTIVE" | "INACTIVE" | "PENDING";

type AdminBusinessResponse = {
  business?: {
    id?: string;
    name?: string;
    deletedAt?: string | null;
  };
  error?: string;
};

type CategoryResponse = {
  categories?: unknown;
  error?: string;
};

type ApiErrorResponse = { error?: string };

const ADMIN_NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Content", href: "/admin/content", icon: Megaphone },
];

function formatNaira(value: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiCategory(value: unknown): value is ApiCategory {
  return isObject(value) && typeof value.id === "string" && typeof value.name === "string";
}

function FieldLabel({ children, optional = false }: { children: ReactNode; optional?: boolean }) {
  return (
    <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[#4C4540]">
      <span>{children}</span>
      {optional && <span className="text-[10px] font-medium text-[#A39A91]">Optional</span>}
    </span>
  );
}

function SectionTitle({
  number,
  title,
  description,
  icon: Icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: typeof Package;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#FFF0E8] text-[#A63D25] ring-1 ring-[#F6D7CC]">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.14em] text-[#B2A69B]">STEP {number}</span>
          <h2 className="text-sm font-bold text-[#202A32] sm:text-[15px]">{title}</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-[#82776E]">{description}</p>
      </div>
    </div>
  );
}

function CompletionItem({ label, complete }: { label: string; complete: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${complete ? "bg-[#DDF4E7] text-[#247849]" : "bg-[#F0ECE6] text-[#B4A99F]"}`}>
        {complete ? <Check className="h-2.5 w-2.5" /> : <span className="h-1 w-1 rounded-full bg-current" />}
      </span>
      <span className={complete ? "text-[#4C6257]" : "text-[#968A80]"}>{label}</span>
    </div>
  );
}

export default function NewProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const businessId = params.id;

  const [businessName, setBusinessName] = useState("");
  const [businessDeletedAt, setBusinessDeletedAt] = useState<string | null>(null);
  const [categories, setCategories] = useState<ReMarketCategory[]>(DEFAULT_CATEGORIES);
  const [usingCategoryFallback, setUsingCategoryFallback] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [availability, setAvailability] = useState<ProductAvailability>("ASK_SELLER");
  const [status, setStatus] = useState<ProductStatus>("ACTIVE");
  const [keywords, setKeywords] = useState("");
  const [images, setImages] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showTips, setShowTips] = useState(false);

  const businessDeleted = Boolean(businessDeletedAt);
  const selectedCategory = categories.find((category) => category.id === categoryId);
  const keywordList = useMemo(
    () => keywords.split(",").map((item) => item.trim()).filter(Boolean),
    [keywords],
  );

  const completionItems = useMemo(
    () => [
      { label: "Product name", complete: Boolean(name.trim()) },
      { label: "Product photos", complete: images.length > 0 },
      { label: "Description", complete: Boolean(description.trim()) },
      { label: "Category", complete: Boolean(categoryId && !usingCategoryFallback) },
      { label: "Price information", complete: Boolean(price.trim() || priceMin.trim() || priceMax.trim()) },
    ],
    [name, images, description, categoryId, usingCategoryFallback, price, priceMin, priceMax],
  );
  const completionCount = completionItems.filter((item) => item.complete).length;
  const completionPercent = Math.round((completionCount / completionItems.length) * 100);

  const priceSummary = useMemo(() => {
    const exact = price.trim() ? Number(price) : null;
    const min = priceMin.trim() ? Number(priceMin) : null;
    const max = priceMax.trim() ? Number(priceMax) : null;

    if (exact !== null && Number.isFinite(exact) && exact >= 0) return formatNaira(exact);
    if (min !== null && Number.isFinite(min) && max !== null && Number.isFinite(max) && min >= 0 && max >= min) {
      return `${formatNaira(min)} – ${formatNaira(max)}`;
    }
    if (min !== null && Number.isFinite(min) && min >= 0) return `From ${formatNaira(min)}`;
    if (max !== null && Number.isFinite(max) && max >= 0) return `Up to ${formatNaira(max)}`;
    return "Ask for price";
  }, [price, priceMin, priceMax]);

  useEffect(() => {
    if (!businessId) return;

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

        const businessData: unknown = await businessResponse.json();
        const categoriesData: unknown = await categoriesResponse.json();

        if (!businessResponse.ok) {
          const message = isObject(businessData) && typeof businessData.error === "string"
            ? businessData.error
            : "Unable to load business.";
          throw new Error(message);
        }

        const businessPayload = isObject(businessData) && isObject(businessData.business)
          ? businessData.business
          : null;

        if (!businessPayload || typeof businessPayload.name !== "string") {
          throw new Error("Business information is unavailable.");
        }

        setBusinessName(businessPayload.name);
        setBusinessDeletedAt(typeof businessPayload.deletedAt === "string" ? businessPayload.deletedAt : null);

        const categoryPayload: CategoryResponse = isObject(categoriesData)
          ? categoriesData as CategoryResponse
          : {};
        const backendCategories = categoriesResponse.ok && Array.isArray(categoryPayload.categories)
          ? categoryPayload.categories.filter(isApiCategory)
          : [];
        const mergedCategories = mergeCategories(backendCategories);

        if (mergedCategories.length > 0 && backendCategories.length > 0) {
          setCategories(mergedCategories);
          setUsingCategoryFallback(false);
        } else {
          setCategories(DEFAULT_CATEGORIES);
          setUsingCategoryFallback(true);
          setCategoryId("");
        }
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        console.error("New product load error:", loadError);
        setError(loadError instanceof Error ? loadError.message : "Unable to load product form.");
        setCategories(DEFAULT_CATEGORIES);
        setUsingCategoryFallback(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [businessId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!businessId) {
      setError("The business ID is missing. Return to the business page and try again.");
      return;
    }
    if (businessDeleted) {
      setError("This business has been deleted and cannot receive new products until it is restored.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Product name is required.");
      return;
    }

    const parsedPrice = price.trim() ? Number(price.trim()) : null;
    const parsedPriceMin = priceMin.trim() ? Number(priceMin.trim()) : null;
    const parsedPriceMax = priceMax.trim() ? Number(priceMax.trim()) : null;

    const priceValues: [string, number | null][] = [
      ["Exact price", parsedPrice],
      ["Minimum price", parsedPriceMin],
      ["Maximum price", parsedPriceMax],
    ];
    for (const [label, value] of priceValues) {
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        setError(`${label} must be a valid non-negative whole number in naira.`);
        return;
      }
    }
    if (parsedPriceMin !== null && parsedPriceMax !== null && parsedPriceMin > parsedPriceMax) {
      setError("Minimum price cannot be greater than maximum price.");
      return;
    }
    const selectedCategoryId = usingCategoryFallback ? null : categoryId.trim() || null;
    setSaving(true);

    try {
      const response = await fetch(`/api/admin/businesses/${businessId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || null,
          categoryId: selectedCategoryId,
          price: parsedPrice,
          priceMin: parsedPriceMin,
          priceMax: parsedPriceMax,
          availability,
          status,
          keywords: keywordList,
          images,
        }),
      });

      const data: unknown = await response.json();
      if (!response.ok) {
        const message = isObject(data) && typeof data.error === "string"
          ? data.error
          : "Unable to create product.";
        throw new Error(message);
      }

      router.push(`/admin/businesses/${businessId}`);
    } catch (submitError) {
      console.error("Create product error:", submitError);
      setError(submitError instanceof Error ? submitError.message : "Unable to create product.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center overflow-x-clip bg-[#F5F1EB] p-4 text-[#202A32]">
        <div className="flex w-full max-w-sm flex-col items-center rounded-3xl border border-[#E9DFD4] bg-white p-8 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#FF5A36]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <p className="mt-4 text-sm font-bold">Opening your product workspace</p>
          <p className="mt-1 text-xs text-[#8E8278]">Loading business details and categories…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh w-full overflow-x-clip bg-[#F5F1EB] text-[#202A32]">
      {/* Desktop admin navigation */}
      <aside className="sticky top-0 hidden h-dvh w-[224px] shrink-0 flex-col border-r border-[#E8DED3] bg-[#FFFDFC] lg:flex xl:w-[244px]">
        <div className="border-b border-[#EEE5DC] px-5 py-5">
          <Link href="/admin" className="flex items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#FF5A36] text-base font-black text-white shadow-[0_8px_18px_rgba(255,90,54,0.24)]">R</span>
            <span className="min-w-0">
              <span className="block text-sm font-black tracking-tight text-[#1D2932]">ReMarket</span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9B8E82]">Admin workspace</span>
            </span>
          </Link>
        </div>
        <div className="px-4 pt-6">
          <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#B1A69C]">Workspace</p>
          <nav className="mt-3 space-y-1" aria-label="Admin navigation">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Products";
              return (
                <Link key={item.href} href={item.href} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-semibold transition ${active ? "bg-[#FFF0E8] text-[#A43C24]" : "text-[#766C63] hover:bg-[#F8F3ED] hover:text-[#202A32]"}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#FF5A36]" : "text-[#A49A90] group-hover:text-[#766C63]"}`} />
                  <span className="min-w-0 flex-1">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="overflow-hidden rounded-2xl bg-[#202D37] p-4 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-[#FF9A7C]"><Sparkles className="h-4 w-4" /></div>
            <p className="mt-3 text-xs font-bold">Good listings get discovered.</p>
            <p className="mt-1 text-[10px] leading-5 text-white/60">Clear names, useful photos and accurate prices help buyers decide.</p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-[#E8DED3] bg-[#FFFDFC]/95 backdrop-blur-xl">
          <div className="flex min-h-[66px] items-center justify-between gap-3 px-4 sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href={`/admin/businesses/${businessId}`} aria-label="Back to business" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8DED3] bg-white text-[#665D55] transition hover:border-[#FFB49F] hover:text-[#A43C24]">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#A1958A]">Business catalogue</p>
                <p className="truncate text-sm font-bold text-[#202A32]">{businessName || "New product"}</p>
              </div>
            </div>
            <Link href={`/admin/businesses/${businessId}`} className="hidden items-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-3 py-2 text-xs font-semibold text-[#746A61] transition hover:bg-[#FAF5EF] sm:inline-flex">
              <Store className="h-3.5 w-3.5" /> Business profile
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F6EC] px-2.5 py-1.5 text-[10px] font-bold text-[#247849] sm:hidden"><span className="h-1.5 w-1.5 rounded-full bg-[#299B5D]" /> Admin</span>
          </div>
          {/* Mobile / tablet navigation: scrolls instead of squeezing labels */}
          <nav className="flex gap-1 overflow-x-auto border-t border-[#F0E9E1] px-3 py-2 lg:hidden" aria-label="Mobile admin navigation">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Products";
              return (
                <Link key={item.href} href={item.href} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-[11px] font-semibold transition ${active ? "bg-[#FFE5DB] text-[#9F2D18]" : "text-[#776C63] hover:bg-white"}`}>
                  <Icon className="h-3.5 w-3.5" />{item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <div className="mx-auto w-full max-w-[1720px] px-3 pb-10 pt-4 sm:px-5 sm:pt-6 lg:px-7 xl:px-9 xl:pb-14">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[#92867C]">
            <Link href="/admin/businesses" className="transition hover:text-[#A43C24]">Businesses</Link>
            <ChevronRight className="h-3 w-3" />
            <Link href={`/admin/businesses/${businessId}`} className="max-w-[180px] truncate transition hover:text-[#A43C24]">{businessName || "Business"}</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="font-semibold text-[#4F4740]">Add product</span>
          </div>

          {/* Hero */}
          <section className="relative isolate mb-5 overflow-hidden rounded-[24px] bg-[#202D37] px-5 py-6 text-white shadow-[0_16px_36px_rgba(32,45,55,0.12)] sm:px-7 sm:py-7 xl:px-9 xl:py-8">
            <div className="pointer-events-none absolute -right-10 -top-16 -z-10 h-64 w-64 rounded-full border-[36px] border-white/[0.035]" />
            <div className="pointer-events-none absolute right-28 top-16 -z-10 h-28 w-28 rounded-full bg-[#FF5A36]/20 blur-2xl sm:right-52" />
            <div className="pointer-events-none absolute bottom-0 right-0 -z-10 h-24 w-2/5 bg-gradient-to-l from-[#FF5A36]/10 to-transparent" />
            <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#FFC1AC]">
                  <Sparkles className="h-3.5 w-3.5" /> Product launchpad
                </div>
                <h1 className="mt-4 max-w-2xl text-[clamp(1.8rem,4.2vw,3.15rem)] font-black leading-[1.04] tracking-[-0.045em]">
                  Put something good <span className="text-[#FF9878]">on the map.</span>
                </h1>
                <p className="mt-3 max-w-xl text-xs leading-6 text-white/65 sm:text-sm">
                  Create a clear product listing for <span className="font-semibold text-white">{businessName || "this business"}</span>. Add real photos, helpful details and accurate pricing so nearby buyers know what to ask for.
                </p>
                {businessDeleted ? (
                  <div className="mt-5 inline-flex items-start gap-2 rounded-xl border border-red-200/20 bg-red-400/10 px-3 py-2.5 text-xs text-red-100">
                    <X className="mt-0.5 h-4 w-4 shrink-0" /> This business is deleted. Restore it before adding products.
                  </div>
                ) : (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-lg bg-white/[0.08] px-3 py-2 text-[10px] font-semibold text-white/80"><ShieldCheck className="h-3.5 w-3.5 text-[#8FE0AD]" /> Admin-created listing</span>
                    <span className="inline-flex items-center gap-2 rounded-lg bg-white/[0.08] px-3 py-2 text-[10px] font-semibold text-white/80"><MapPin className="h-3.5 w-3.5 text-[#FFAD93]" /> Local discovery ready</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 xl:w-[270px] xl:shrink-0">
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 sm:p-4">
                  <PackagePlus className="h-5 w-5 text-[#FF9878]" />
                  <p className="mt-4 text-xl font-black">01</p>
                  <p className="mt-1 text-[10px] text-white/55">New listing</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 sm:p-4">
                  <BarChart3 className="h-5 w-5 text-[#8FE0AD]" />
                  <p className="mt-4 text-xl font-black">{completionPercent}%</p>
                  <p className="mt-1 text-[10px] text-white/55">Setup progress</p>
                </div>
              </div>
            </div>
          </section>

          {error && (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#F0BEB5] bg-[#FFF2EF] px-4 py-3.5 text-xs font-medium text-[#9F2D18]">
              <X className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0 flex-1 leading-5">{error}</p>
              <button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="rounded-md p-1 hover:bg-[#FFE0D9]"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {usingCategoryFallback && (
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#EFD6A9] bg-[#FFF8E9] px-4 py-3.5 text-xs text-[#8B641D]">
              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0"><p className="font-bold">Categories are temporarily unavailable</p><p className="mt-1 leading-5">You can still create the product without a category. Built-in display categories will not be submitted as database IDs.</p></div>
            </div>
          )}

          <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px] 2xl:grid-cols-[minmax(0,1fr)_390px] 2xl:gap-7">
            <form onSubmit={submit} className="min-w-0 space-y-4">
              {/* Product details */}
              <section className="rounded-[22px] border border-[#E7DED4] bg-[#FFFDFC] p-4 shadow-[0_4px_14px_rgba(46,36,31,0.025)] sm:p-6">
                <SectionTitle number="01" title="Product details" description="Give buyers the basics first. A specific name is easier to discover than a general one." icon={Package} />
                <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className="min-w-0 sm:col-span-2">
                    <FieldLabel>Product name</FieldLabel>
                    <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required disabled={businessDeleted || saving} placeholder="e.g. Men's everyday sneakers" className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E7DED4] bg-white px-3.5 text-sm text-[#202A32] outline-none transition placeholder:text-[#B6AAA0] focus:border-[#FF8D70] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F5F1EB]" />
                    <div className="mt-1.5 flex justify-between gap-2 text-[10px] text-[#A49A90]"><span>Use the name buyers would search for.</span><span>{name.length}/100</span></div>
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <FieldLabel optional>Description</FieldLabel>
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} maxLength={800} disabled={businessDeleted || saving} placeholder="What makes this product useful? Add details such as material, size, model, colour or what is included." className="mt-2 min-h-[110px] w-full min-w-0 resize-y rounded-xl border border-[#E7DED4] bg-white px-3.5 py-3 text-sm leading-6 text-[#202A32] outline-none transition placeholder:text-[#B6AAA0] focus:border-[#FF8D70] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F5F1EB]" />
                    <div className="mt-1.5 flex justify-between gap-2 text-[10px] text-[#A49A90]"><span>Keep it accurate and easy to scan.</span><span>{description.length}/800</span></div>
                  </div>
                </div>
              </section>

              {/* Product images */}
              <section className="rounded-[22px] border border-[#E7DED4] bg-[#FFFDFC] p-4 shadow-[0_4px_14px_rgba(46,36,31,0.025)] sm:p-6">
                <SectionTitle number="02" title="Product photos" description="Real, clear photos help buyers recognise the item before they contact the seller." icon={Eye} />
                <div className="mt-5 min-w-0 rounded-2xl border border-dashed border-[#E4C8BC] bg-[#FFFAF6] p-3 sm:p-4">
                  <ProductImageUpload value={images} onChange={setImages} disabled={saving || businessDeleted} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#9A8E83]"><span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#2C8A55]" /> The first image is used as the cover.</span><span>{images.length} {images.length === 1 ? "image added" : "images added"}</span></div>
              </section>

              {/* Category and pricing */}
              <section className="rounded-[22px] border border-[#E7DED4] bg-[#FFFDFC] p-4 shadow-[0_4px_14px_rgba(46,36,31,0.025)] sm:p-6">
                <SectionTitle number="03" title="Category & pricing" description="Help the product appear in relevant discovery results, with a price buyers can understand." icon={Tags} />
                <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className="min-w-0 sm:col-span-2">
                    <FieldLabel optional>Category</FieldLabel>
                    <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={saving || businessDeleted || usingCategoryFallback} className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E7DED4] bg-white px-3.5 text-sm text-[#202A32] outline-none focus:border-[#FF8D70] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F5F1EB]">
                      <option value="">No category selected</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                    <p className="mt-1.5 text-[10px] leading-5 text-[#A49A90]">Choose the closest available category. Leave blank if none fits.</p>
                  </div>
                  <div className="min-w-0">
                    <FieldLabel optional>Exact price (₦)</FieldLabel>
                    <input type="number" min={0} step={1} inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value)} disabled={businessDeleted || saving} placeholder="e.g. 15000" className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E7DED4] bg-white px-3.5 text-sm outline-none focus:border-[#FF8D70] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F5F1EB]" />
                    <p className="mt-1.5 text-[10px] text-[#A49A90]">Use this for a single fixed price.</p>
                  </div>
                  <div className="hidden sm:block" />
                  <div className="min-w-0">
                    <FieldLabel optional>Minimum price (₦)</FieldLabel>
                    <input type="number" min={0} step={1} inputMode="numeric" value={priceMin} onChange={(event) => setPriceMin(event.target.value)} disabled={businessDeleted || saving} placeholder="e.g. 12000" className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E7DED4] bg-white px-3.5 text-sm outline-none focus:border-[#FF8D70] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F5F1EB]" />
                  </div>
                  <div className="min-w-0">
                    <FieldLabel optional>Maximum price (₦)</FieldLabel>
                    <input type="number" min={0} step={1} inputMode="numeric" value={priceMax} onChange={(event) => setPriceMax(event.target.value)} disabled={businessDeleted || saving} placeholder="e.g. 18000" className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E7DED4] bg-white px-3.5 text-sm outline-none focus:border-[#FF8D70] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F5F1EB]" />
                  </div>
                  <div className="sm:col-span-2 rounded-xl border border-[#EEE3D8] bg-[#FAF6F0] px-3.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A1958A]">Buyer-facing price preview</span><span className="text-sm font-black text-[#A43C24]">{priceSummary}</span></div>
                    <p className="mt-1 text-[10px] leading-5 text-[#94877C]">Use either an exact price or a minimum/maximum range. You can leave pricing blank if buyers need to enquire.</p>
                  </div>
                </div>
              </section>

              {/* Status */}
              <section className="rounded-[22px] border border-[#E7DED4] bg-[#FFFDFC] p-4 shadow-[0_4px_14px_rgba(46,36,31,0.025)] sm:p-6">
                <SectionTitle number="04" title="Availability & listing status" description="Set the state that best reflects whether buyers can enquire about this product now." icon={BarChart3} />
                <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <FieldLabel>Availability</FieldLabel>
                    <select value={availability} onChange={(event) => setAvailability(event.target.value as ProductAvailability)} disabled={businessDeleted || saving} className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E7DED4] bg-white px-3.5 text-sm outline-none focus:border-[#FF8D70] disabled:bg-[#F5F1EB]">
                      <option value="AVAILABLE">Available</option>
                      <option value="ASK_SELLER">Ask seller</option>
                      <option value="UNAVAILABLE">Unavailable</option>
                    </select>
                    <p className="mt-1.5 text-[10px] text-[#A49A90]">This describes current stock or availability.</p>
                  </div>
                  <div className="min-w-0">
                    <FieldLabel>Listing status</FieldLabel>
                    <select value={status} onChange={(event) => setStatus(event.target.value as ProductStatus)} disabled={businessDeleted || saving} className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E7DED4] bg-white px-3.5 text-sm outline-none focus:border-[#FF8D70] disabled:bg-[#F5F1EB]">
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="PENDING">Pending</option>
                    </select>
                    <p className="mt-1.5 text-[10px] text-[#A49A90]">Use inactive if the listing should stay hidden.</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold ${status === "ACTIVE" ? "bg-[#E6F6EC] text-[#247849]" : status === "PENDING" ? "bg-[#FFF2D9] text-[#94621B]" : "bg-[#F0ECE6] text-[#766C63]"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status.charAt(0) + status.slice(1).toLowerCase()} listing</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold ${availability === "AVAILABLE" ? "bg-[#E6F6EC] text-[#247849]" : availability === "ASK_SELLER" ? "bg-[#FFF2D9] text-[#94621B]" : "bg-[#FCE9E6] text-[#A43C24]"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{availability === "ASK_SELLER" ? "Ask seller" : availability.charAt(0) + availability.slice(1).toLowerCase()} availability</span>
                </div>
              </section>

              {/* Keywords */}
              <section className="rounded-[22px] border border-[#E7DED4] bg-[#FFFDFC] p-4 shadow-[0_4px_14px_rgba(46,36,31,0.025)] sm:p-6">
                <SectionTitle number="05" title="Search keywords" description="Add phrases people might use when searching. Separate each keyword with a comma." icon={Search} />
                <div className="mt-5 min-w-0">
                  <FieldLabel optional>Keywords</FieldLabel>
                  <input value={keywords} onChange={(event) => setKeywords(event.target.value)} disabled={businessDeleted || saving} placeholder="e.g. sneakers, shoes, footwear, casual" className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E7DED4] bg-white px-3.5 text-sm outline-none transition placeholder:text-[#B6AAA0] focus:border-[#FF8D70] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-[#F5F1EB]" />
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {keywordList.length > 0 ? keywordList.slice(0, 12).map((keyword, index) => <span key={`${keyword}-${index}`} className="rounded-full border border-[#E9DED4] bg-[#FAF6F0] px-2.5 py-1 text-[10px] font-medium text-[#75685F]">{keyword}</span>) : <span className="text-[10px] text-[#AA9D91]">Your keywords will appear here as you type.</span>}
                  </div>
                </div>
              </section>

              {/* Form actions */}
              <div className="flex flex-col-reverse gap-2 rounded-[22px] border border-[#E7DED4] bg-[#FFFDFC] p-3 shadow-[0_4px_14px_rgba(46,36,31,0.025)] sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <Link href={`/admin/businesses/${businessId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E7DED4] bg-white px-4 py-3 text-xs font-bold text-[#74695F] transition hover:bg-[#FAF6F0]">
                  <ArrowLeft className="h-3.5 w-3.5" /> Cancel
                </Link>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <p className="hidden text-[10px] text-[#A49A90] md:block">You can edit this listing later.</p>
                  <button type="submit" disabled={saving || businessDeleted} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-extrabold text-white shadow-[0_8px_18px_rgba(255,90,54,0.20)] transition hover:-translate-y-0.5 hover:bg-[#E94F2D] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {businessDeleted ? "Restore business first" : saving ? "Creating product…" : "Create product"}
                  </button>
                </div>
              </div>
            </form>

            {/* Live preview and completion checklist */}
            <aside className="hidden min-w-0 space-y-4 xl:block">
              <div className="sticky top-[86px] space-y-4">
                <section className="overflow-hidden rounded-[22px] border border-[#E7DED4] bg-[#FFFDFC] shadow-[0_8px_26px_rgba(46,36,31,0.04)]">
                  <div className="flex items-center justify-between border-b border-[#F0E8E0] px-4 py-3.5">
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#A1958A]">Live buyer preview</p><p className="mt-0.5 text-xs font-semibold text-[#4C4540]">This updates as you type</p></div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#A43C24]"><Eye className="h-4 w-4" /></span>
                  </div>
                  <div className="p-4">
                    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_18%_15%,#FFE9DE,transparent_48%),linear-gradient(140deg,#F8EDE2,#F3F0E9)]">
                      {images[0] ? <img src={images[0]} alt={name || "Product preview"} className="h-full w-full object-contain p-2" /> : <div className="flex flex-col items-center text-[#C2856C]"><div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/70 bg-white/70 shadow-sm"><Package className="h-8 w-8" /></div><p className="mt-3 text-[10px] font-semibold">Your cover photo goes here</p></div>}
                      <span className="absolute left-3 top-3 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[9px] font-bold text-[#6B5D52]">ReMarket find</span>
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div className="min-w-0"><h3 className="break-words text-base font-black leading-5 text-[#202A32]">{name.trim() || "Your product name"}</h3><p className="mt-1 text-[10px] text-[#91857B]">{selectedCategory?.name || "Category not selected"}</p></div>
                      <span className="shrink-0 rounded-xl bg-[#FFF0E8] px-2.5 py-2 text-[11px] font-black text-[#A43C24]">{priceSummary}</span>
                    </div>
                    <p className="mt-3 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-5 text-[#7D7269]">{description.trim() || "A helpful product description will appear here, including details that help buyers decide whether it is right for them."}</p>
                    {keywordList.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{keywordList.slice(0, 4).map((keyword, index) => <span key={`${keyword}-${index}`} className="rounded-full bg-[#F4F0EA] px-2 py-1 text-[9px] text-[#766A60]">#{keyword.replace(/\s+/g, "-")}</span>)}</div>}
                    <div className="mt-4 flex items-center justify-between border-t border-[#F0E8E0] pt-3 text-[10px] text-[#978B80]"><span className="inline-flex min-w-0 items-center gap-1.5"><Store className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{businessName || "Business"}</span></span><span className={`shrink-0 rounded-full px-2 py-1 font-bold ${status === "ACTIVE" ? "bg-[#E6F6EC] text-[#247849]" : status === "PENDING" ? "bg-[#FFF2D9] text-[#94621B]" : "bg-[#F0ECE6] text-[#766C63]"}`}>{status}</span></div>
                  </div>
                </section>

                <section className="rounded-[22px] border border-[#E7DED4] bg-[#FFFDFC] p-4 shadow-[0_8px_26px_rgba(46,36,31,0.035)]">
                  <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#A1958A]">Listing checklist</p><p className="mt-1 text-sm font-bold text-[#202A32]">Make it easy to choose</p></div><span className="text-lg font-black text-[#A43C24]">{completionPercent}%</span></div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F0E9E1]"><div className="h-full rounded-full bg-gradient-to-r from-[#FF5A36] to-[#FFAA85] transition-all duration-300" style={{ width: `${completionPercent}%` }} /></div>
                  <div className="mt-4 space-y-3">{completionItems.map((item) => <CompletionItem key={item.label} label={item.label} complete={item.complete} />)}</div>
                  <button type="button" onClick={() => setShowTips((current) => !current)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#E8DED4] bg-[#FAF6F0] px-3 py-2.5 text-[10px] font-bold text-[#75685F] transition hover:border-[#FFB49F] hover:text-[#A43C24]"><CircleHelp className="h-3.5 w-3.5" /> {showTips ? "Hide listing tips" : "Show listing tips"}</button>
                  {showTips && <div className="mt-3 rounded-xl border border-[#F0DFD2] bg-[#FFFAF5] p-3 text-[10px] leading-5 text-[#766A60]"><p className="font-bold text-[#51463D]">A useful listing checklist</p><p className="mt-1">Use a recognisable product name, upload a clear cover image, describe the condition or key features, select a matching category and keep price details accurate.</p></div>}
                </section>

                <div className="rounded-2xl bg-[#202D37] p-4 text-white">
                  <div className="flex items-center gap-2 text-[#FF9878]"><MapPin className="h-4 w-4" /><p className="text-xs font-bold">Local discovery</p></div>
                  <p className="mt-2 text-[11px] leading-5 text-white/65">This product will be attached to {businessName || "the selected business"}, helping buyers discover it through the business listing.</p>
                </div>
              </div>
            </aside>

            {/* Compact mobile preview */}
            <section className="min-w-0 rounded-[22px] border border-[#E7DED4] bg-[#FFFDFC] p-4 xl:hidden">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#A1958A]">Live preview</p><p className="mt-1 text-sm font-bold text-[#202A32]">{name.trim() || "Your product name"}</p><p className="mt-1 text-xs font-semibold text-[#A43C24]">{priceSummary}</p></div><div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F8EDE2]">{images[0] ? <img src={images[0]} alt={name || "Product"} className="h-full w-full object-contain p-1" /> : <Package className="h-6 w-6 text-[#C2856C]" />}</div></div>
              <div className="mt-4 flex items-center justify-between gap-3"><div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[#F0E9E1]"><div className="h-full rounded-full bg-[#FF5A36] transition-all" style={{ width: `${completionPercent}%` }} /></div><span className="shrink-0 text-[10px] font-bold text-[#8D7E72]">{completionCount}/5 details</span></div>
            </section>
          </div>

          <footer className="mt-6 flex flex-col gap-2 border-t border-[#E5DACE] py-4 text-[10px] text-[#9A8E83] sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-[#568669]" /> Admin changes are saved to the selected business catalogue.</p>
            <Link href={`/admin/businesses/${businessId}`} className="inline-flex items-center gap-1.5 font-semibold text-[#776A60] hover:text-[#A43C24]">Return to business <ChevronRight className="h-3 w-3" /></Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
