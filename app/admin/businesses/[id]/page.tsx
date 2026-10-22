"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  ImagePlus,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

type Category = { id: string; name: string };
type ProductImage = { id: string; url: string; publicId: string | null; sortOrder: number };
type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type BusinessStatus = "ACTIVE" | "INACTIVE" | "PENDING";
type Verification = "VERIFIED" | "UNVERIFIED";
type SocialPlatform = "WHATSAPP" | "INSTAGRAM" | "TIKTOK" | "FACEBOOK" | "PHONE" | "DIRECTIONS";
type SocialLink = { id: string; platform: SocialPlatform; handle: string };
type Product = {
  id: string; name: string; description: string | null; price: number | null;
  priceMin: number | null; priceMax: number | null; availability: Availability;
  imageUrl: string | null; images: ProductImage[]; deletedAt: string | null;
  status: BusinessStatus; category: Category | null;
};
type Business = {
  id: string; name: string; ownerName: string | null; description: string | null;
  imageUrl: string | null; phone: string | null; priceMin: number | null; priceMax: number | null;
  availability: Availability; status: BusinessStatus; verification: Verification;
  onboardedAt: string; deletedAt: string | null;
  location: { id: string; area: string; street: string | null; address: string | null; lat: number | null; long: number | null } | null;
  categories: Category[]; socialLinks: SocialLink[]; products: Product[];
};
type Metric = { label: string; value: number };
type EditableSocialLink = { id: string; platform: SocialPlatform; handle: string };

const COUNTRY = "Nigeria";
const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" }, { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" }, { value: "FACEBOOK", label: "Facebook" },
  { value: "PHONE", label: "Phone" }, { value: "DIRECTIONS", label: "Directions" },
];
const ADMIN_NAV = [
  { label: "Overview", href: "/admin", icon: Activity },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: CircleHelp },
  { label: "Content", href: "/admin/content", icon: Sparkles },
  { label: "Claims", href: "/admin/claims", icon: ShieldCheck },
];

const LAGOS_AREA_GROUPS = [
  { lga: "Agege", areas: ["Agege", "Orile Agege", "Dopemu", "Oko-Oba", "Isale Odo", "Keke"] },
  { lga: "Ajeromi-Ifelodun", areas: ["Ajegunle", "Tolu", "Olodi", "Alaba Oro", "Awodi-Ora", "Layeni", "Mosafejo"] },
  { lga: "Alimosho", areas: ["Alimosho", "Egbeda", "Akowonjo", "Shasha", "Idimu", "Egbe", "Ikotun", "Ijegun", "Igando", "Iyana-Ipaja", "Ayobo", "Abule Egba", "Aboru", "Meiran", "Oke-Odo", "Pleasure"] },
  { lga: "Amuwo-Odofin", areas: ["Amuwo", "Festac", "Mile 2", "Satellite Town", "Kirikiri", "Irede", "Ibeshe"] },
  { lga: "Apapa", areas: ["Apapa", "Apapa Wharf", "Iganmu", "Ijora", "Liverpool", "Tin Can"] },
  { lga: "Badagry", areas: ["Badagry", "Badagry West", "Olorunda", "Oko-Afo"] },
  { lga: "Epe", areas: ["Epe", "Eredo", "Ikosi-Ejinrin"] },
  { lga: "Eti-Osa", areas: ["Ikoyi", "Obalende", "Victoria Island", "Oniru", "Lekki Phase 1", "Ikate", "Jakande", "Osapa London", "Agungi", "Igbo-Efon", "Idado", "Chevron", "Ikota", "VGC", "Ajah", "Badore", "Sangotedo"] },
  { lga: "Ibeju-Lekki", areas: ["Ibeju-Lekki", "Abijo", "Awoyaya", "Lakowe", "Bogije", "Eleko", "Akodo"] },
  { lga: "Ifako-Ijaiye", areas: ["Ifako", "Ijaiye", "Ojokoro", "Oke-Ira", "Agbado"] },
  { lga: "Ikeja", areas: ["Ikeja", "Ikeja GRA", "Alausa", "Allen Avenue", "Oregun", "Opebi", "Ogba", "Ojodu", "Onigbongbo", "Computer Village", "Airport Road"] },
  { lga: "Ikorodu", areas: ["Ikorodu", "Ikorodu North", "Ikorodu West", "Igbogbo", "Baiyeku", "Ijede", "Imota", "Odogunyan", "Itamaga", "Agric"] },
  { lga: "Kosofe", areas: ["Kosofe", "Ketu", "Agboyi", "Ojota", "Gbagada", "Anthony", "Maryland", "Magodo", "Isheri", "Mile 12"] },
  { lga: "Lagos Island", areas: ["Lagos Island", "Idumota", "Balogun", "Marina", "Broad Street", "Isale Eko", "Lafiaji", "Onikan", "Epetedo", "Okepopo"] },
  { lga: "Lagos Mainland", areas: ["Yaba", "Ebute Metta", "Akoka", "Sabo", "Alagomeji", "Adekunle", "Abule Oja", "Onike", "Iwaya", "Makoko", "Jibowu", "Oyingbo", "Tejuosho"] },
  { lga: "Mushin", areas: ["Mushin", "Papa Ajao", "Idi-Araba", "Ilupeju", "Odi-Olowo", "Ojuwoye"] },
  { lga: "Ojo", areas: ["Ojo", "Iba", "Iyana-Iba", "Ajangbadi", "Oto-Awori", "Alaba"] },
  { lga: "Oshodi-Isolo", areas: ["Oshodi", "Isolo", "Ejigbo", "Okota", "Ajao Estate", "Mafoluku", "Ago Palace"] },
  { lga: "Shomolu", areas: ["Shomolu", "Bariga", "Pedro", "Onipanu", "Palmgrove", "Fadeyi"] },
  { lga: "Surulere", areas: ["Surulere", "Ojuelegba", "Lawanson", "Itire", "Aguda", "Coker", "Ijeshatedo"] },
] as const;

function isKnownArea(area: string) {
  const normalized = area.trim().toLowerCase();
  return normalized.length > 0 && LAGOS_AREA_GROUPS.some((group) => group.areas.some((item) => item.toLowerCase() === normalized));
}
function looksLikeHouseNumber(value: string) {
  const normalized = value.trim().toLowerCase();
  return !!normalized && (/^\d+[a-z]?\b/.test(normalized) || /^(shop|house|building|block|plot|suite|unit|flat)\b/.test(normalized));
}
function parseLocationAddress(address: string | null | undefined, area: string) {
  const fallback = { houseNumber: "", street: "", city: "" };
  let parts = typeof address === "string" ? address.trim().split(",").map((part) => part.trim()).filter(Boolean) : [];
  if (parts.at(-1)?.toLowerCase() === COUNTRY.toLowerCase()) parts = parts.slice(0, -1);
  if (!parts.length) return fallback;
  const normalizedArea = area.trim().toLowerCase();
  let areaIndex = -1;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i].toLowerCase() === normalizedArea && normalizedArea) { areaIndex = i; break; }
  }
  if (areaIndex < 0) return { houseNumber: "", street: parts.join(", "), city: "" };
  const before = parts.slice(0, areaIndex);
  const city = parts.slice(areaIndex + 1).join(", ");
  if (!before.length) return { houseNumber: "", street: "", city };
  if (before.length === 1) return { houseNumber: "", street: before[0], city };
  if (looksLikeHouseNumber(before[0])) return { houseNumber: before[0], street: before[1], city: before.slice(2).join(", ") || city };
  return { houseNumber: "", street: before[0], city: before.slice(1).join(", ") || city };
}
function makeSocialLink(platform: SocialPlatform = "WHATSAPP", handle = ""): EditableSocialLink {
  return { id: `social-${Date.now()}-${Math.random().toString(36).slice(2)}`, platform, handle };
}
function initialSocialLinks(links: SocialLink[], phone: string | null): EditableSocialLink[] {
  if (links.length) {
    const mapped = links.map((item) => ({ id: item.id, platform: item.platform, handle: item.handle }));
    if (!mapped.some((item) => item.platform === "PHONE") && phone) mapped.push(makeSocialLink("PHONE", phone));
    return mapped;
  }
  return SOCIAL_PLATFORMS.map(({ value }) => makeSocialLink(value, value === "PHONE" ? phone ?? "" : ""));
}
function displayError(data: unknown, fallback: string) {
  if (data && typeof data === "object" && !Array.isArray(data) && typeof (data as Record<string, unknown>).error === "string") return (data as Record<string, unknown>).error as string;
  return fallback;
}
function collectMetrics(value: unknown, path: string[] = [], output: Metric[] = []): Metric[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/^(id|.*Id|businessId|requestId|productId|createdAt|updatedAt|deletedAt|lat|long|latitude|longitude|price|priceMin|priceMax|score)$/i.test(key)) continue;
    const metricKey = /count|total|views?|contacts?|products?|matches?|requests?|visitors?|active|deleted|whatsapp|phone|instagram|tiktok|facebook|directions/i.test(key);
    if (typeof nested === "number" && Number.isFinite(nested) && metricKey) {
      const label = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      output.push({ label, value: nested });
    } else if (nested && typeof nested === "object" && !Array.isArray(nested)) collectMetrics(nested, [...path, key], output);
  }
  return output;
}
function SectionHeading({ eyebrow, title, description, icon: Icon }: { eyebrow?: string; title: string; description?: string; icon?: LucideIcon }) {
  return <div className="mb-5 flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]">{Icon ? <Icon className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#B05A43]">{eyebrow ?? "Business workspace"}</p><h2 className="mt-1 text-base font-extrabold tracking-tight text-[#17202A] sm:text-lg">{title}</h2>{description && <p className="mt-1 max-w-3xl text-xs leading-5 text-[#7E766F]">{description}</p>}</div></div>;
}
function Field({ label, value, onChange, type = "text", placeholder, required, multiline, step, min, disabled }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; multiline?: boolean; step?: string; min?: string; disabled?: boolean }) {
  const classes = "mt-2 w-full min-w-0 rounded-xl border border-[#E5DDD5] bg-white px-3.5 py-3 text-sm text-[#17202A] outline-none transition placeholder:text-[#B6ADA4] focus:border-[#FF8B6C] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F4F0EB]";
  return <div className="min-w-0"><label className="text-xs font-semibold text-[#51483F]">{label}{required && <span className="ml-1 text-[#C4452D">*</span>}</label>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} disabled={disabled} rows={4} className={`${classes} resize-y`} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} step={step} min={min} disabled={disabled} className={classes} />}</div>;
}
function SelectField({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return <div className="min-w-0"><label className="text-xs font-semibold text-[#51483F]">{label}</label><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E5DDD5] bg-white px-3 text-sm font-medium text-[#17202A] outline-none focus:border-[#FF8B6C] disabled:bg-[#F4F0EB]">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

export default function BusinessDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const businessId = params.id;
  const [business, setBusiness] = useState<Business | null>(null);
  const [categories, setCategories] = useState<ReMarketCategory[]>(DEFAULT_CATEGORIES);
  const [usingCategoryFallback, setUsingCategoryFallback] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [analytics, setAnalytics] = useState<unknown>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const analyticsMetrics = useMemo(() => {
    const seen = new Set<string>();
    return collectMetrics(analytics).filter((metric) => {
      const key = `${metric.label}:${metric.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [analytics]);

  const loadBusiness = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError("");
    try {
      const [businessResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/admin/businesses/${businessId}`, { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" }),
      ]);
      const businessData: unknown = await businessResponse.json();
      const categoriesData: unknown = await categoriesResponse.json();
      if (!businessResponse.ok) throw new Error(displayError(businessData, "Unable to load business."));
      const record = businessData as { business?: Business };
      setBusiness(record.business ?? null);
      const rawCategories = categoriesData && typeof categoriesData === "object" ? (categoriesData as { categories?: unknown }).categories : null;
      const backendCategories = categoriesResponse.ok && Array.isArray(rawCategories) ? rawCategories as ApiCategory[] : [];
      const merged = mergeCategories(backendCategories);
      if (merged.length) { setCategories(merged); setUsingCategoryFallback(false); }
      else { setCategories(DEFAULT_CATEGORIES); setUsingCategoryFallback(true); }
    } catch (loadError) {
      console.error("Business details load error:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load business.");
    } finally { setLoading(false); }
  }, [businessId]);

  const loadAnalytics = useCallback(async () => {
    if (!businessId) return;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const response = await fetch(`/api/admin/businesses/${businessId}/analytics`, { cache: "no-store" });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(displayError(data, "Unable to load business analytics."));
      setAnalytics(data);
    } catch (loadError) {
      console.error("Business analytics load error:", loadError);
      setAnalytics(null);
      setAnalyticsError(loadError instanceof Error ? loadError.message : "Unable to load business analytics.");
    } finally { setAnalyticsLoading(false); }
  }, [businessId]);

  useEffect(() => { void loadBusiness(); }, [loadBusiness]);
  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  async function deleteBusiness() {
    if (!business) return;
    setDeleting(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/admin/businesses/${business.id}`, { method: "DELETE" });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(displayError(data, "Unable to delete business."));
      const returned = data && typeof data === "object" ? (data as { business?: { deletedAt?: string | null } }).business : undefined;
      setBusiness((current) => current ? { ...current, deletedAt: returned?.deletedAt ?? new Date().toISOString() } : current);
      setShowDeleteConfirmation(false);
      setSuccess(`${business.name} was moved to deleted businesses.`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to delete business.");
    } finally { setDeleting(false); }
  }

  async function restoreBusiness() {
    if (!business) return;
    setRestoring(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/admin/businesses/${business.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: true }) });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(displayError(data, "Unable to restore business."));
      const returned = data && typeof data === "object" ? (data as { business?: Partial<Business> }).business : undefined;
      setBusiness((current) => current ? { ...current, ...returned, deletedAt: null } : current);
      setSuccess(`${business.name} was restored successfully.`);
      void loadAnalytics();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to restore business.");
    } finally { setRestoring(false); }
  }

  if (loading) return <AdminShell active="Businesses"><div className="flex min-h-[55vh] items-center justify-center"><div className="flex items-center gap-3 rounded-2xl border border-[#E8DFD5] bg-white px-5 py-4 text-sm font-medium text-[#746A61]"><Loader2 className="h-5 w-5 animate-spin text-[#FF5A36]" /> Loading business workspace…</div></div></AdminShell>;
  if (!business) return <AdminShell active="Businesses"><div className="mx-auto max-w-3xl px-4 py-12"><div className="rounded-3xl border border-[#E8DFD5] bg-white p-8 text-center sm:p-12"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]"><Store className="h-7 w-7" /></div><h1 className="mt-4 text-xl font-extrabold text-[#17202A]">Business not found</h1><p className="mt-2 text-sm text-[#786E65]">{error || "This business may have been removed or you may not have access to it."}</p><Link href="/admin/businesses" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" />Back to businesses</Link></div></div></AdminShell>;

  return <AdminShell active="Businesses">
    <div className="mx-auto w-full max-w-[1680px] px-3 pb-12 pt-4 sm:px-5 sm:pt-6 xl:px-8">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <Link href="/admin/businesses" className="inline-flex items-center gap-2 text-xs font-bold text-[#9F2D18] transition hover:gap-3"><ArrowLeft className="h-4 w-4" />All businesses</Link>
          <div className="mt-4 flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#FFE1D7] text-[#9F2D18] ring-4 ring-white shadow-sm sm:h-16 sm:w-16">{business.imageUrl ? <img src={business.imageUrl} alt="" className="h-full w-full object-cover" /> : <Store className="h-7 w-7" />}</div>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl">{business.name}</h1>{business.deletedAt && <Badge tone="red">Deleted</Badge>}</div><p className="mt-1 max-w-2xl text-sm leading-6 text-[#746A61]">Manage the listing, location, discovery categories, products and public visibility for this business.</p><div className="mt-3 flex flex-wrap gap-2"><Badge tone={business.status === "ACTIVE" ? "green" : business.status === "PENDING" ? "amber" : "gray"}>{business.status}</Badge><Badge tone={business.verification === "VERIFIED" ? "blue" : "gray"}>{business.verification}</Badge><Badge tone="gray">{business.products.length} products</Badge><Badge tone="gray">Added {new Date(business.onboardedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</Badge></div></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:max-w-[520px] xl:justify-end">
          {!business.deletedAt ? <>
            <Link href={`/seller/${business.id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#E6DDD3] bg-white px-3.5 py-2.5 text-xs font-bold text-[#5E554E] transition hover:border-[#FFAC95] sm:flex-none"><ExternalLink className="h-4 w-4" />Public page</Link>
            <Link href={`/admin/businesses/${business.id}/products/new`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-3.5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#E94F2D] sm:flex-none"><Plus className="h-4 w-4" />Add product</Link>
            <button type="button" disabled={deleting || restoring} onClick={() => setShowDeleteConfirmation(true)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[#F0C4BA] bg-[#FFF4F1] px-3.5 py-2.5 text-xs font-bold text-[#A23824] transition hover:bg-[#FFE7E0] disabled:opacity-50 sm:flex-none"><Trash2 className="h-4 w-4" />Delete</button>
          </> : <button type="button" disabled={restoring || deleting} onClick={() => void restoreBusiness()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#DFF5E9] px-4 py-2.5 text-xs font-extrabold text-[#237548] disabled:opacity-50"><RotateCcw className="h-4 w-4" />{restoring ? "Restoring…" : "Restore business"}</button>}
        </div>
      </div>

      {business.deletedAt && <div className="mb-5 flex gap-3 rounded-2xl border border-[#F0C4BA] bg-[#FFF4F1] p-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#B13E27]" /><div><p className="text-sm font-extrabold text-[#9F2D18]">This business is soft-deleted</p><p className="mt-1 text-xs leading-5 text-[#8F3F30]">It remains in the Admin system, but should not appear in customer-facing discovery. Restore it before making normal listing changes.</p></div></div>}
      {success && <Notice tone="green" message={success} onDismiss={() => setSuccess("")} />}
      {error && <Notice tone="red" message={error} onDismiss={() => setError("")} />}

      <BusinessEditor business={business} categories={categories} usingCategoryFallback={usingCategoryFallback} onBusinessUpdated={(updated) => setBusiness((current) => current ? { ...current, ...updated } : current)} onError={setError} onSuccess={setSuccess} router={router} />

      <section className="mt-6 rounded-3xl border border-[#E6DDD3] bg-white p-4 shadow-[0_12px_40px_rgba(44,35,27,0.04)] sm:p-6 xl:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#B45A42]">Signals, not guesses</p><h2 className="mt-1 text-xl font-black tracking-tight text-[#17202A]">Business analytics</h2><p className="mt-1 text-xs leading-5 text-[#786E65]">Activity returned by the existing analytics endpoint.</p></div><button type="button" disabled={analyticsLoading} onClick={() => void loadAnalytics()} className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-[#E6DDD3] bg-[#FCFAF7] px-3.5 py-2.5 text-xs font-bold text-[#5E554E] disabled:opacity-50 sm:self-auto"><RotateCcw className={`h-3.5 w-3.5 ${analyticsLoading ? "animate-spin" : ""}`} />Refresh analytics</button></div>
        {analyticsLoading ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{[1,2,3,4].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl bg-[#F5F1EC]" />)}</div> : analyticsError ? <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#F0C4BA] bg-[#FFF4F1] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-[#9F2D18]">{analyticsError}</p><button type="button" onClick={() => void loadAnalytics()} className="rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white">Try again</button></div> : analyticsMetrics.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-[#E5DDD5] bg-[#FCFAF7] px-5 py-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]"><BarChart3 className="h-6 w-6" /></div><p className="mt-3 text-sm font-extrabold text-[#342B25]">No analytics recorded yet</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#82776D]">As ReMarket records views, contacts, products and request matching, the available metrics will appear here.</p></div> : <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{analyticsMetrics.map((metric, index) => <div key={`${metric.label}-${metric.value}-${index}`} className="rounded-2xl border border-[#E6DDD3] bg-[#FFFEFC] p-4"><div className="flex items-center justify-between gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><BarChart3 className="h-4 w-4" /></span><span className="text-xl font-black tabular-nums text-[#17202A] sm:text-2xl">{metric.value.toLocaleString("en-NG")}</span></div><p className="mt-4 text-xs font-semibold text-[#736960]">{metric.label}</p></div>)}</div>}
      </section>
    </div>
    {showDeleteConfirmation && <DeleteConfirmationModal business={business} loading={deleting} onCancel={() => setShowDeleteConfirmation(false)} onConfirm={() => void deleteBusiness()} />}
  </AdminShell>;
}

function AdminShell({ active, children }: { active: string; children: ReactNode }) {
  return <main className="min-h-dvh w-full overflow-x-clip bg-[#F5F1EB] text-[#17202A]"><div className="flex min-h-dvh w-full">
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-[#E4DAD0] bg-[#FFFEFC] xl:flex"><Link href="/admin" className="flex h-[76px] shrink-0 items-center gap-3 border-b border-[#EAE2D9] px-5"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF5A36] text-base font-black text-white shadow-sm">R</span><span><span className="block text-base font-black tracking-tight">ReMarket</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A0988E]">Admin studio</span></span></Link><nav className="flex-1 space-y-1 overflow-y-auto p-3 pt-5"><p className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#AAA095]">Workspace</p>{ADMIN_NAV.map((item) => { const Icon = item.icon; const isActive = item.label === active; return <Link key={item.href} href={item.href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition ${isActive ? "bg-[#FFF0E8] text-[#9F2D18] shadow-sm" : "text-[#6F675F] hover:bg-[#F7F2EC]"}`}><Icon className="h-4 w-4 shrink-0" />{item.label}{isActive && <ChevronRight className="ml-auto h-3.5 w-3.5" />}</Link>; })}</nav><div className="border-t border-[#EAE2D9] p-4"><div className="rounded-2xl bg-[#F7F2EC] p-3"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#FF5A36]"/><p className="text-xs font-extrabold">Local discovery</p></div><p className="mt-1 text-[10px] leading-4 text-[#81766C]">Keep business information accurate and easy to find.</p></div></div></aside>
    <div className="flex min-h-dvh min-w-0 flex-1 flex-col"><header className="sticky top-0 z-30 flex h-[62px] shrink-0 items-center justify-between border-b border-[#E6DDD3] bg-[#FFFEFC]/95 px-3 backdrop-blur-xl sm:px-5 xl:h-[70px] xl:px-8"><div className="flex min-w-0 items-center gap-3"><Link href="/admin" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E5DDD5] bg-white text-[#5E554E] xl:hidden" aria-label="Back to admin"><ArrowLeft className="h-4 w-4"/></Link><div className="min-w-0"><p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-[#B45A42]">ReMarket / Admin</p><p className="truncate text-sm font-black">Business workspace</p></div></div><Link href="/" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[#E5DDD5] bg-white px-3 text-[10px] font-bold text-[#5E554E] transition hover:border-[#FFAC95] sm:text-xs"><ExternalLink className="h-3.5 w-3.5"/>Marketplace</Link></header><nav aria-label="Admin navigation" className="sticky top-[62px] z-20 flex shrink-0 gap-1 overflow-x-auto border-b border-[#E6DDD3] bg-[#FFFEFC] px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:hidden">{ADMIN_NAV.map((item) => {const Icon = item.icon; return <Link key={item.href} href={item.href} aria-current={item.label === active ? "page" : undefined} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[10px] font-bold transition sm:text-xs ${item.label === active ? "bg-[#FFF0E8] text-[#9F2D18]" : "text-[#766C63] hover:bg-[#F7F2EC]"}`}><Icon className="h-3.5 w-3.5"/>{item.label}</Link>;})}</nav><div className="min-w-0 flex-1">{children}</div></div>
  </div></main>;
}

function Badge({ tone, children }: { tone: "green" | "red" | "amber" | "blue" | "gray"; children: ReactNode }) {
  const classes = { green: "bg-[#E2F6E9] text-[#247547]", red: "bg-[#FFF0ED] text-[#A23824]", amber: "bg-[#FFF2D9] text-[#925B16]", blue: "bg-[#E7F0FF] text-[#315EA8]", gray: "bg-[#F0ECE7] text-[#655B52]" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide ${classes[tone]}`}>{children}</span>;
}
function Notice({ tone, message, onDismiss }: { tone: "green" | "red"; message: string; onDismiss: () => void }) {
  const green = tone === "green";
  return <div className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 ${green ? "border-[#BFE3CE] bg-[#EEF9F2] text-[#287A4B]" : "border-[#F0C4BA] bg-[#FFF4F1] text-[#9F2D18]"}`}><span className="mt-0.5">{green ? <Check className="h-4 w-4"/> : <AlertTriangle className="h-4 w-4"/>}</span><p className="min-w-0 flex-1 text-xs font-semibold leading-5">{message}</p><button type="button" onClick={onDismiss} aria-label="Dismiss message"><X className="h-4 w-4"/></button></div>;
}

type BusinessEditorProps = { business: Business; categories: ReMarketCategory[]; usingCategoryFallback: boolean; onBusinessUpdated: (updated: Partial<Business>) => void; onError: (message: string) => void; onSuccess: (message: string) => void; router: ReturnType<typeof useRouter> };
function BusinessEditor({ business, categories, usingCategoryFallback, onBusinessUpdated, onError, onSuccess, router }: BusinessEditorProps) {
  const deleted = Boolean(business.deletedAt);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [name, setName] = useState(business.name);
  const [ownerName, setOwnerName] = useState(business.ownerName ?? "");
  const [description, setDescription] = useState(business.description ?? "");
  const [imageUrl, setImageUrl] = useState(business.imageUrl ?? "");
  const initialAddress = parseLocationAddress(business.location?.address, business.location?.area ?? "");
  const [houseNumber, setHouseNumber] = useState(initialAddress.houseNumber);
  const [street, setStreet] = useState(business.location?.street ?? initialAddress.street);
  const [city, setCity] = useState(initialAddress.city);
  const [area, setArea] = useState(business.location?.area ?? "");
  const [lat, setLat] = useState(business.location?.lat == null ? "" : String(business.location.lat));
  const [long, setLong] = useState(business.location?.long == null ? "" : String(business.location.long));
  const [locationStatus, setLocationStatus] = useState(business.location?.lat != null && business.location?.long != null ? "Exact business coordinates are already saved." : "GPS capture is optional. Use it when the device is physically at the business.");
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [priceMin, setPriceMin] = useState(business.priceMin == null ? "" : String(business.priceMin));
  const [priceMax, setPriceMax] = useState(business.priceMax == null ? "" : String(business.priceMax));
  const [availability, setAvailability] = useState<Availability>(business.availability);
  const [status, setStatus] = useState<BusinessStatus>(business.status);
  const [verification, setVerification] = useState<Verification>(business.verification);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(business.categories.map((category) => category.id));
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>(() => initialSocialLinks(business.socialLinks, business.phone));
  const [showAllProducts, setShowAllProducts] = useState(false);
  const composedAddress = [houseNumber.trim(), street.trim(), area.trim(), city.trim(), COUNTRY].filter(Boolean).join(", ");
  const completion = [!!name.trim(), !!description.trim(), !!imageUrl, !!street.trim(), !!area.trim(), !!city.trim(), selectedCategoryIds.length > 0, socialLinks.some((link) => link.handle.trim().length > 0)].filter(Boolean).length;
  const completionPct = Math.round(completion / 8 * 100);
  const selectedCategories = categories.filter((category) => selectedCategoryIds.includes(category.id));

  function toggleCategory(id: string) {
    if (usingCategoryFallback || deleted) return;
    setSelectedCategoryIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function updateSocial(id: string, field: "platform" | "handle", value: string) {
    if (deleted) return;
    setSocialLinks((current) => current.map((link) => link.id === id ? { ...link, [field]: value } : link));
  }
  function addSocialLink() { if (!deleted) setSocialLinks((current) => [...current, makeSocialLink()]); }
  function removeSocialLink(id: string) { if (!deleted) setSocialLinks((current) => current.filter((link) => link.id !== id)); }

  async function uploadImage(file: File) {
    if (deleted) return;
    if (!file.type.startsWith("image/") || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { onError("Choose a JPEG, PNG or WebP image."); return; }
    if (file.size > 5 * 1024 * 1024) { onError("Business image must be 5MB or smaller."); return; }
    setUploadingImage(true); onError("");
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || typeof (data as { url?: unknown }).url !== "string") throw new Error(displayError(data, "Unable to upload business image."));
      setImageUrl((data as { url: string }).url);
      onSuccess("Image uploaded. Save changes to update the business listing.");
    } catch (uploadError) { onError(uploadError instanceof Error ? uploadError.message : "Unable to upload business image."); }
    finally { setUploadingImage(false); }
  }
  function captureLocation() {
    if (deleted) return;
    if (!navigator.geolocation) { onError("Location is not supported by this browser."); return; }
    setCapturingLocation(true); onError(""); setLocationStatus("Waiting for location permission…");
    navigator.geolocation.getCurrentPosition((position) => {
      const latitude = position.coords.latitude; const longitude = position.coords.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) { setLocationStatus("The browser returned invalid coordinates."); setCapturingLocation(false); return; }
      setLat(String(latitude)); setLong(String(longitude)); setLocationStatus("Coordinates captured. Save the business to keep this update."); setCapturingLocation(false);
    }, (geoError) => {
      console.error("Location capture error:", geoError);
      setLocationStatus("Could not capture location. Check browser permission and try again.");
      onError("Allow location access and use this only when the device is physically at the business."); setCapturingLocation(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); onError(""); onSuccess("");
    const n = name.trim(); const a = area.trim(); const st = street.trim();
    if (!n) { onError("Business name is required."); document.getElementById("basics")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (!a) { onError("Business area is required."); document.getElementById("location")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (!st) { onError("Street, road or close is required."); document.getElementById("location")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const min = priceMin.trim() ? Number(priceMin) : null; const max = priceMax.trim() ? Number(priceMax) : null;
    if (min !== null && (!Number.isInteger(min) || min < 0)) { onError("Minimum price must be a valid non-negative integer."); return; }
    if (max !== null && (!Number.isInteger(max) || max < 0)) { onError("Maximum price must be a valid non-negative integer."); return; }
    if (min !== null && max !== null && min > max) { onError("Minimum price cannot be greater than maximum price."); return; }
    const latitude = lat.trim() ? Number(lat) : null; const longitude = long.trim() ? Number(long) : null;
    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) { onError("Saved business latitude is invalid."); return; }
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) { onError("Saved business longitude is invalid."); return; }
    if ((latitude === null) !== (longitude === null)) { onError("Both coordinates must be available together, or both must be empty."); return; }
    const social = socialLinks.map((link) => ({ platform: link.platform, handle: link.handle.trim() })).filter((link) => link.handle);
    const address = [houseNumber.trim(), st, a, city.trim(), COUNTRY].filter(Boolean).join(", ");
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/businesses/${business.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: n, ownerName: ownerName.trim() || null, description: description.trim() || null, imageUrl: imageUrl.trim() || null,
        houseNumber: houseNumber.trim(), street: st, area: a, city: city.trim(), address,
        lat: latitude, long: longitude, priceMin: min, priceMax: max, availability, status, verification,
        categoryIds: usingCategoryFallback ? business.categories.map((category) => category.id) : selectedCategoryIds,
        socialLinks: social,
      }) });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(displayError(data, "Unable to update business."));
      const returned = data && typeof data === "object" ? (data as { business?: Business }).business : undefined;
      if (returned) {
        onBusinessUpdated(returned);
        setName(returned.name); setOwnerName(returned.ownerName ?? ""); setDescription(returned.description ?? ""); setImageUrl(returned.imageUrl ?? "");
        const parsed = parseLocationAddress(returned.location?.address, returned.location?.area ?? "");
        setHouseNumber(parsed.houseNumber); setStreet(returned.location?.street ?? parsed.street); setCity(parsed.city); setArea(returned.location?.area ?? "");
        setLat(returned.location?.lat == null ? "" : String(returned.location.lat)); setLong(returned.location?.long == null ? "" : String(returned.location.long));
        setAvailability(returned.availability); setStatus(returned.status); setVerification(returned.verification);
        setSelectedCategoryIds(returned.categories.map((category) => category.id)); setSocialLinks(initialSocialLinks(returned.socialLinks, returned.phone));
        setLocationStatus(returned.location?.lat != null && returned.location.long != null ? "Business coordinates are saved." : "No exact business coordinates have been captured yet.");
      }
      onSuccess("Changes saved. The business profile has been updated."); router.refresh();
    } catch (saveError) { console.error("Business update error:", saveError); onError(saveError instanceof Error ? saveError.message : "Unable to update business."); }
    finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="grid min-w-0 grid-cols-1 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_310px]">
    <div className="min-w-0 space-y-5">
      <section id="basics" className="scroll-mt-28 rounded-3xl border border-[#E6DDD3] bg-white p-4 shadow-[0_12px_40px_rgba(44,35,27,0.04)] sm:p-6"><SectionHeading eyebrow="01 / Profile" title="The business at a glance" description="Give buyers enough information to recognise this business and understand what it offers." icon={Building2}/><div className="grid min-w-0 gap-4 sm:grid-cols-2"><Field label="Business name" value={name} onChange={setName} required disabled={deleted || saving}/><Field label="Owner name" value={ownerName} onChange={setOwnerName} placeholder="Business owner's name" disabled={deleted || saving}/><div className="sm:col-span-2"><Field label="Description" value={description} onChange={setDescription} placeholder="What does this business sell or help customers do?" multiline disabled={deleted || saving}/><p className="mt-1 text-right text-[10px] text-[#A69B91]">{description.length} characters</p></div></div>
        <div className="mt-5 rounded-2xl border border-dashed border-[#E5DDD5] bg-[#FCFAF7] p-3 sm:p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="h-28 w-full shrink-0 overflow-hidden rounded-xl bg-[#EEE7DE] sm:h-28 sm:w-36">{imageUrl ? <img src={imageUrl} alt={`${name || "Business"} preview`} className="h-full w-full object-cover"/> : <div className="flex h-full min-h-28 items-center justify-center text-[#A59A90]"><ImagePlus className="h-8 w-8"/></div>}</div><div className="min-w-0 flex-1"><p className="text-sm font-extrabold text-[#2E241F]">{imageUrl ? "Your listing has a cover image" : "Add a recognisable business image"}</p><p className="mt-1 text-xs leading-5 text-[#84796F]">Use a clear shop, storefront or brand image. JPEG, PNG and WebP, up to 5MB.</p><label className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#F0C6B9] bg-white px-3.5 py-2.5 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFF0E8] ${deleted || saving || uploadingImage ? "pointer-events-none opacity-50" : ""}`}><Upload className="h-4 w-4"/>{uploadingImage ? "Uploading image…" : imageUrl ? "Change image" : "Upload image"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={deleted || saving || uploadingImage} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadImage(file); }}/></label></div></div></div>
      </section>

      <section id="location" className="scroll-mt-28 rounded-3xl border border-[#E6DDD3] bg-white p-4 shadow-[0_12px_40px_rgba(44,35,27,0.04)] sm:p-6"><SectionHeading eyebrow="02 / Findability" title="Pinpoint the location" description="Accurate area and street details help buyers distinguish similar business names and nearby streets." icon={MapPin}/><div className="grid min-w-0 gap-4 sm:grid-cols-2"><Field label="House / shop / building number" value={houseNumber} onChange={setHouseNumber} placeholder="e.g. Shop 12" disabled={deleted || saving}/><Field label="Street / road / close" value={street} onChange={setStreet} placeholder="e.g. Adewale Close" required disabled={deleted || saving}/><Field label="City" value={city} onChange={setCity} placeholder="e.g. Lagos or Epe" disabled={deleted || saving}/><div className="min-w-0"><label className="text-xs font-semibold text-[#51483F]">Area / neighbourhood <span className="text-[#C4452D">*</span></label><select value={area} onChange={(event) => setArea(event.target.value)} required disabled={deleted || saving} className="mt-2 h-12 w-full min-w-0 rounded-xl border border-[#E5DDD5] bg-white px-3 text-sm text-[#17202A] outline-none focus:border-[#FF8B6C] disabled:bg-[#F4F0EB]"><option value="">Select an area</option>{area && !isKnownArea(area) && <option value={area}>{area} (current)</option>}{LAGOS_AREA_GROUPS.map((group) => <optgroup key={group.lga} label={group.lga}>{group.areas.map((item) => <option key={`${group.lga}-${item}`} value={item}>{item}</option>)}</optgroup>)}</select></div></div>
        {(houseNumber || street || area || city) && <div className="mt-4 rounded-2xl bg-[#F8F4EF] p-4"><p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#9A8F84]">Address preview</p><p className="mt-2 break-words text-sm font-bold leading-6 text-[#342B25]">{composedAddress || "Complete the address fields to preview the saved address."}</p><p className="mt-1 text-[10px] text-[#93877C]">House / Shop, Street, Area, City, Nigeria</p></div>}
        <div className="mt-4 rounded-2xl border border-[#E6DDD3] bg-[#FCFAF7] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-extrabold text-[#342B25]"><Navigation className="h-4 w-4 text-[#FF5A36]"/>Exact business coordinates</div><p className="mt-1 text-xs leading-5 text-[#84796F]">{locationStatus}</p></div><button type="button" disabled={deleted || saving || capturingLocation} onClick={() => { if (!navigator.geolocation) { onError("Location is not supported by this browser."); return; } setCapturingLocation(true); onError(""); setLocationStatus("Waiting for location permission…"); navigator.geolocation.getCurrentPosition((position) => { setLat(String(position.coords.latitude)); setLong(String(position.coords.longitude)); setLocationStatus("Coordinates captured. Save changes to keep this update."); setCapturingLocation(false); }, (geoError) => { console.error("Location capture error:", geoError); setLocationStatus("Could not capture location. Check browser permissions and try again."); onError("Use location capture only when the device is physically at the business."); setCapturingLocation(false); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }); }} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#17202A] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#2A3A48] disabled:opacity-50">{capturingLocation ? <Loader2 className="h-4 w-4 animate-spin"/> : <Navigation className="h-4 w-4"/>}{capturingLocation ? "Capturing…" : "Capture location"}</button></div><p className="mt-3 text-[10px] leading-5 text-[#988D82]">Only capture GPS when you are physically at the business location. Coordinates are managed internally and should not be exposed publicly as raw values.</p></div>
      </section>

      <section className="rounded-3xl border border-[#E6DDD3] bg-white p-4 shadow-[0_12px_40px_rgba(44,35,27,0.04)] sm:p-6"><SectionHeading eyebrow="03 / Discovery" title="Categories and pricing" description="Help customers find this business through relevant category pages and a useful price guide." icon={Sparkles}/><p className="mb-3 text-xs font-semibold text-[#5E554E]">Assigned categories <span className="font-normal text-[#998E83]">({selectedCategoryIds.length} selected)</span></p>{usingCategoryFallback && <p className="mb-3 rounded-xl bg-[#FFF2D9] px-3 py-2.5 text-xs leading-5 text-[#925B16]">The category API is unavailable. Existing database category IDs will be preserved; fallback categories cannot be assigned.</p>}<div id="categories" className="scroll-mt-28 flex flex-wrap gap-2">{categories.map((category) => {const selected = selectedCategoryIds.includes(category.id); return <button type="button" key={category.id} disabled={deleted || saving || usingCategoryFallback} onClick={() => toggleCategory(category.id)} className={`max-w-full rounded-full border px-3.5 py-2.5 text-xs font-bold transition ${selected ? "border-[#FFB49F] bg-[#FFF0E8] text-[#9F2D18]" : "border-[#E6DDD3] bg-white text-[#6E645A] hover:border-[#FFB49F] hover:bg-[#FCFAF7]"} disabled:cursor-not-allowed disabled:opacity-50`}>{selected && <Check className="mr-1 inline h-3.5 w-3.5"/>}{category.name}</button>; })}</div><div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2"><Field label="Minimum price (₦)" value={priceMin} onChange={setPriceMin} type="number" min="0" step="1" placeholder="Optional" disabled={deleted || saving}/><Field label="Maximum price (₦)" value={priceMax} onChange={setPriceMax} type="number" min="0" step="1" placeholder="Optional" disabled={deleted || saving}/></div><p className="mt-2 text-[10px] leading-5 text-[#93877C]">Use a price range only if it meaningfully describes this business. Leave it blank when pricing depends on the product or seller.</p></section>

      <section className="rounded-3xl border border-[#E6DDD3] bg-white p-4 shadow-[0_12px_40px_rgba(44,35,27,0.04)] sm:p-6"><SectionHeading eyebrow="04 / Trust and availability" title="Set public listing status" description="Control whether the listing is active, its verification label and how buyers should check availability." icon={ShieldCheck}/><div className="grid min-w-0 gap-4 sm:grid-cols-3"><SelectField label="Availability" value={availability} disabled={deleted || saving} onChange={(value) => setAvailability(value as Availability)} options={[{ value: "AVAILABLE", label: "Available" }, { value: "ASK_SELLER", label: "Ask seller" }, { value: "UNAVAILABLE", label: "Unavailable" }]}/><SelectField label="Business status" value={status} disabled={deleted || saving} onChange={(value) => setStatus(value as BusinessStatus)} options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }, { value: "PENDING", label: "Pending" }]}/><SelectField label="Verification" value={verification} disabled={deleted || saving} onChange={(value) => setVerification(value as Verification)} options={[{ value: "VERIFIED", label: "Verified" }, { value: "UNVERIFIED", label: "Unverified" }]}/></div>{deleted && <p className="mt-3 text-xs text-[#A23824]">Restore the business before changing its normal public listing settings.</p>}</section>

      <section id="contacts" className="scroll-mt-28 rounded-3xl border border-[#E6DDD3] bg-white p-4 shadow-[0_12px_40px_rgba(44,35,27,0.04)] sm:p-6"><div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><SectionHeading eyebrow="05 / Reach the seller" title="Contact and social links" description="Add the ways customers can contact this business or get directions." icon={ExternalLink}/><button type="button" disabled={deleted || saving} onClick={addSocialLink} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E6DDD3] bg-[#FCFAF7] px-3.5 py-2.5 text-xs font-extrabold text-[#5E554E] transition hover:border-[#FFAC95] disabled:opacity-50"><Plus className="h-4 w-4"/>Add link</button></div><div className="space-y-3">{socialLinks.map((link) => <div key={link.id} className="grid min-w-0 gap-3 rounded-2xl border border-[#E8DFD5] bg-[#FFFEFC] p-3 sm:grid-cols-[minmax(140px,0.36fr)_minmax(0,1fr)_auto] sm:items-end"><SelectField label="Platform" value={link.platform} disabled={deleted || saving} onChange={(value) => updateSocial(link.id, "platform", value as SocialPlatform)} options={SOCIAL_PLATFORMS.map((platform) => ({ value: platform.value, label: platform.label }))}/><Field label="Link, handle or phone number" value={link.handle} disabled={deleted || saving} onChange={(value) => updateSocial(link.id, "handle", value)} placeholder={link.platform === "PHONE" || link.platform === "WHATSAPP" ? "080…" : link.platform === "DIRECTIONS" ? "https://maps.google.com/…" : "@username or URL"}/><button type="button" disabled={deleted || saving || socialLinks.length <= 1} onClick={() => removeSocialLink(link.id)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#F0C4BA] bg-[#FFF4F1] px-3 text-xs font-bold text-[#9F2D18] disabled:opacity-40"><Trash2 className="h-4 w-4"/>Remove</button></div>)}</div></section>

      <section id="products" className="scroll-mt-28 rounded-3xl border border-[#E6DDD3] bg-white p-4 shadow-[0_12px_40px_rgba(44,35,27,0.04)] sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><SectionHeading eyebrow="06 / Catalogue" title={`Products (${business.products.length})`} description="Review the products currently attached to this business. Edit products individually." icon={Package}/>{!deleted && <Link href={`/admin/businesses/${business.id}/products/new`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-3.5 py-2.5 text-xs font-extrabold text-white hover:bg-[#E94F2D]"><Plus className="h-4 w-4"/>Add product</Link>}</div>{business.products.length === 0 ? <div className="rounded-2xl border border-dashed border-[#E5DDD5] bg-[#FCFAF7] px-4 py-9 text-center"><Package className="mx-auto h-7 w-7 text-[#A89D92]"/><p className="mt-3 text-sm font-extrabold text-[#42372F]">No products attached yet</p><p className="mt-1 text-xs text-[#8A7F74]">Add a product to make this business more useful to nearby buyers.</p></div> : <><div className="grid gap-3 md:grid-cols-2">{business.products.slice(0, showAllProducts ? undefined : 4).map((product) => <article key={product.id} className="flex min-w-0 gap-3 rounded-2xl border border-[#E8DFD5] bg-[#FFFEFC] p-3"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#F0EAE2]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center text-[#A89D92]"><Package className="h-5 w-5"/></div>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-extrabold text-[#342B25]">{product.name}</p><Badge tone={product.deletedAt ? "red" : product.status === "ACTIVE" ? "green" : product.status === "PENDING" ? "amber" : "gray"}>{product.deletedAt ? "Deleted" : product.status}</Badge></div><p className="mt-1 text-[10px] text-[#8B8075]">{product.category?.name ?? "No category"} · {product.availability === "ASK_SELLER" ? "Ask seller" : product.availability === "AVAILABLE" ? "Available" : "Unavailable"}</p><p className="mt-2 text-xs font-bold text-[#5C5046]">{product.price != null ? `₦${product.price.toLocaleString("en-NG")}` : product.priceMin != null || product.priceMax != null ? `₦${product.priceMin?.toLocaleString("en-NG") ?? "—"} – ₦${product.priceMax?.toLocaleString("en-NG") ?? "—"}` : "Price not listed"}</p></div><Link href={`/admin/businesses/${business.id}/products/${product.id}/edit`} aria-label={`Edit ${product.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-xl border border-[#E5DDD5] bg-white text-[#655B52] hover:border-[#FFAC95] hover:text-[#9F2D18]"><ArrowUpRight className="h-4 w-4"/></Link></article>)}</div>{business.products.length > 4 && <button type="button" onClick={() => setShowAllProducts((current) => !current)} className="mt-4 w-full rounded-xl border border-[#E5DDD5] px-4 py-2.5 text-xs font-bold text-[#5E554E] hover:bg-[#FCFAF7]">{showAllProducts ? "Show fewer products" : `Show all ${business.products.length} products`}</button>}</>}</section>

      <div className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-2xl border border-[#E3D9CF] bg-[#FFFEFC]/95 p-3 shadow-[0_12px_35px_rgba(44,35,27,0.12)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-4"><p className="hidden text-xs text-[#7F746A] sm:block">Changes stay local until you save.</p><div className="grid grid-cols-2 gap-2 sm:flex"><Link href="/admin/businesses" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5DDD5] bg-white px-4 text-xs font-bold text-[#655B52]">Cancel</Link><button type="submit" disabled={saving || uploadingImage || deleted} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#E94F2D] disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}{saving ? "Saving…" : "Save changes"}</button></div></div>
    </div>

    <aside className="sticky top-[150px] hidden min-w-0 space-y-4 2xl:block"><div className="overflow-hidden rounded-3xl border border-[#E6DDD3] bg-white shadow-[0_12px_40px_rgba(44,35,27,0.04)]"><div className="bg-[#17202A] p-5 text-white"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#FFC4B3]">Buyer view preview</p><ArrowUpRight className="h-4 w-4 text-[#FFC4B3]"/></div><div className="mt-4 aspect-[16/9] overflow-hidden rounded-2xl bg-white/10">{imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center"><Store className="h-10 w-10 text-white/60"/></div>}</div><h3 className="mt-4 break-words text-lg font-black">{name || "Business name"}</h3><p className="mt-1 text-xs text-white/65">{area || "Area"}{city ? `, ${city}` : ""}</p><p className="mt-3 line-clamp-4 text-xs leading-5 text-white/80">{description || "A clear description helps buyers understand this business before they contact the seller."}</p><div className="mt-4 flex flex-wrap gap-1.5">{selectedCategories.length ? selectedCategories.slice(0, 4).map((category) => <span key={category.id} className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/90">{category.name}</span>) : <span className="text-[10px] text-white/50">No categories selected</span>}</div><div className="mt-4 border-t border-white/15 pt-4"><p className="text-[10px] font-bold uppercase tracking-wide text-white/50">Price guide</p><p className="mt-1 text-sm font-extrabold">{priceMin || priceMax ? `₦${priceMin || "—"} – ₦${priceMax || "—"}` : "Contact seller for pricing"}</p></div></div><div className="p-5"><div className="flex items-center justify-between"><p className="text-xs font-extrabold text-[#342B25]">Listing setup</p><p className="text-xs font-black text-[#9F2D18]">{completionPct}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F0EAE2]"><div className="h-full rounded-full bg-[#FF5A36] transition-all" style={{ width: `${completionPct}%` }}/></div><div className="mt-4 space-y-2.5">{[{ ok: !!name.trim(), label: "Business name" }, { ok: !!description.trim(), label: "Description" }, { ok: !!imageUrl, label: "Business image" }, { ok: !!street.trim() && !!area.trim(), label: "Street and area" }, { ok: selectedCategoryIds.length > 0, label: "At least one category" }, { ok: socialLinks.some((link) => link.handle.trim()), label: "Contact or social link" }].map((item) => <div key={item.label} className="flex items-center gap-2 text-xs"><span className={`flex h-5 w-5 items-center justify-center rounded-full ${item.ok ? "bg-[#E3F6EA] text-[#287A4B]" : "bg-[#F2EEE9] text-[#A59A90]"}`}>{item.ok ? <Check className="h-3 w-3"/> : <span className="h-1.5 w-1.5 rounded-full bg-current"/>}</span><span className={item.ok ? "font-semibold text-[#51483F]" : "text-[#92877C]"}>{item.label}</span></div>)}</div></div></div><div className="rounded-3xl border border-[#E6DDD3] bg-[#FFF9F4] p-5"><div className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-[#9F2D18]"/><p className="text-xs font-extrabold text-[#342B25]">Helpful reminder</p></div><p className="mt-2 text-xs leading-5 text-[#786E65]">Confirm the seller's area and street before saving. Nearby discovery works best when location details are specific and accurate.</p><Link href={`/seller/${business.id}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-[#9F2D18]">Preview public listing <ArrowUpRight className="h-3.5 w-3.5"/></Link></div></aside>
  </form>;
}

function DeleteConfirmationModal({ business, loading, onCancel, onConfirm }: { business: Business; loading: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div role="presentation" className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[#17202A]/55 p-3 backdrop-blur-sm sm:p-5"><div role="dialog" aria-modal="true" aria-labelledby="delete-business-title" className="my-auto w-full max-w-md rounded-3xl border border-[#E5DDD5] bg-[#FFFEFC] p-5 shadow-2xl sm:p-6"><div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0ED] text-[#A23824]"><AlertTriangle className="h-5 w-5"/></div><div className="min-w-0 flex-1"><h2 id="delete-business-title" className="text-lg font-black text-[#17202A]">Delete this business?</h2><p className="mt-2 text-sm leading-6 text-[#6F655C]"><strong className="text-[#342B25]">{business.name}</strong> will be removed from customer-facing results. Its data remains in the Admin system and can be restored later.</p></div><button type="button" onClick={onCancel} disabled={loading} aria-label="Close confirmation" className="rounded-lg p-1 text-[#84796F] hover:bg-[#F2EEE9]"><X className="h-4 w-4"/></button></div><div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" disabled={loading} onClick={onCancel} className="min-h-11 rounded-xl border border-[#E5DDD5] bg-white px-4 text-xs font-bold text-[#5E554E]">Keep business</button><button type="button" disabled={loading} onClick={onConfirm} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#B83E27] px-4 text-xs font-extrabold text-white disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin"/>}{loading ? "Deleting…" : "Confirm delete"}</button></div></div></div>;
}
