"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Compass,
  ExternalLink,
  Eye,
  FileText,
  Globe2,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  MapPin,
  Megaphone,
  MessageCircle,
  Package,
  Phone,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  X,
} from "lucide-react";

import ImageUpload from "@/components/ImageUpload";
import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

type Category = ReMarketCategory;
type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type BusinessStatus = "ACTIVE" | "INACTIVE" | "PENDING";
type VerificationStatus = "VERIFIED" | "UNVERIFIED";
type SocialPlatform = "WHATSAPP" | "INSTAGRAM" | "TIKTOK" | "FACEBOOK" | "PHONE" | "DIRECTIONS";

type SocialLinkInput = {
  platform: SocialPlatform;
  handle: string;
};

const ADMIN_NAV = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: FileText },
  { label: "Content studio", href: "/admin/content", icon: Megaphone },
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

const DEFAULT_COUNTRY = "Nigeria";
const INPUT_CLASS = "mt-2 h-11 w-full min-w-0 rounded-xl border border-[#E7E0D8] bg-white px-3.5 text-sm text-[#202A34] outline-none transition placeholder:text-[#ADA49A] focus:border-[#FF7657] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-[#F4F0EB]";
const LABEL_CLASS = "block text-xs font-bold tracking-[0.01em] text-[#4E5A63]";

function SectionHeading({
  number,
  title,
  subtitle,
  icon: Icon,
}: {
  number: string;
  title: string;
  subtitle: string;
  icon: typeof Store;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0E9] text-[#B84228] ring-1 ring-[#F5D3C8]">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#B84228]">Step {number}</span>
          <span className="h-1 w-1 rounded-full bg-[#D6C9BF]" />
          <h2 className="text-base font-black tracking-tight text-[#202A34]">{title}</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-[#847A70]">{subtitle}</p>
      </div>
    </div>
  );
}

function Field({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 ${className}`}>{children}</div>;
}

export default function NewBusinessPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [availability, setAvailability] = useState<Availability>("ASK_SELLER");
  const [status, setStatus] = useState<BusinessStatus>("ACTIVE");
  const [verification, setVerification] = useState<VerificationStatus>("UNVERIFIED");
  const [imageUrl, setImageUrl] = useState("");
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [usingCategoryFallback, setUsingCategoryFallback] = useState(true);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLinkInput[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadCategories() {
      try {
        const response = await fetch("/api/categories", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unable to load categories.");
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid categories response.");
        const payload = data as { categories?: unknown };
        const backendCategories = Array.isArray(payload.categories)
          ? payload.categories.filter((item): item is ApiCategory => {
              if (!item || typeof item !== "object" || Array.isArray(item)) return false;
              const record = item as Record<string, unknown>;
              return typeof record.id === "string" && typeof record.name === "string";
            })
          : [];
        const mergedCategories = mergeCategories(backendCategories);
        if (mergedCategories.length > 0) {
          setCategories(mergedCategories);
          setUsingCategoryFallback(false);
        } else {
          setCategories(DEFAULT_CATEGORIES);
          setUsingCategoryFallback(true);
        }
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        console.error("Categories error:", loadError);
        setCategories(DEFAULT_CATEGORIES);
        setUsingCategoryFallback(true);
      } finally {
        if (!controller.signal.aborted) setLoadingCategories(false);
      }
    }
    void loadCategories();
    return () => controller.abort();
  }, []);

  const composedAddress = useMemo(() => [houseNumber.trim(), street.trim(), area.trim(), city.trim(), DEFAULT_COUNTRY].filter(Boolean).join(", "), [houseNumber, street, area, city]);
  const chosenCategories = useMemo(() => categories.filter((category) => selectedCategoryIds.includes(category.id)), [categories, selectedCategoryIds]);
  const completion = useMemo(() => {
    const checks = [Boolean(name.trim()), Boolean(street.trim()), Boolean(area.trim()), Boolean(city.trim()), Boolean(description.trim()), Boolean(imageUrl.trim()), selectedCategoryIds.length > 0, Boolean(phone.trim())];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [name, street, area, city, description, imageUrl, selectedCategoryIds, phone]);

  function toggleCategory(categoryId: string) {
    if (usingCategoryFallback) {
      setError("Categories could not be loaded from the database. Refresh and try again before assigning categories.");
      return;
    }
    setError("");
    setSelectedCategoryIds((current) => current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]);
  }

  function addSocialLink() {
    setSocialLinks((current) => [...current, { platform: "WHATSAPP", handle: "" }]);
  }

  function updateSocialLink(index: number, field: "platform" | "handle", value: string) {
    setSocialLinks((current) => current.map((link, linkIndex) => {
      if (linkIndex !== index) return link;
      if (field === "platform") return { ...link, platform: value as SocialPlatform };
      return { ...link, handle: value };
    }));
  }

  function removeSocialLink(index: number) {
    setSocialLinks((current) => current.filter((_, linkIndex) => linkIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const trimmedName = name.trim();
    const trimmedArea = area.trim();
    const trimmedHouseNumber = houseNumber.trim();
    const trimmedStreet = street.trim();
    const trimmedCity = city.trim();
    const address = [trimmedHouseNumber, trimmedStreet, trimmedArea, trimmedCity, DEFAULT_COUNTRY].filter(Boolean).join(", ");

    if (!trimmedName) return setError("Business name is required.");
    if (!trimmedArea) return setError("Business area is required.");
    if (!trimmedStreet) return setError("Street, road, or close is required.");

    const parsedPriceMin = priceMin.trim() ? Number(priceMin) : null;
    const parsedPriceMax = priceMax.trim() ? Number(priceMax) : null;
    if (parsedPriceMin !== null && (!Number.isInteger(parsedPriceMin) || parsedPriceMin < 0)) return setError("Minimum price must be a valid non-negative whole number.");
    if (parsedPriceMax !== null && (!Number.isInteger(parsedPriceMax) || parsedPriceMax < 0)) return setError("Maximum price must be a valid non-negative whole number.");
    if (parsedPriceMin !== null && parsedPriceMax !== null && parsedPriceMin > parsedPriceMax) return setError("Minimum price cannot be greater than maximum price.");

    const categoryIds = usingCategoryFallback ? [] : selectedCategoryIds;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          ownerName: ownerName.trim() || null,
          description: description.trim() || null,
          houseNumber: trimmedHouseNumber,
          street: trimmedStreet,
          area: trimmedArea,
          city: trimmedCity,
          address,
          phone: phone.trim() || null,
          priceMin: parsedPriceMin,
          priceMax: parsedPriceMax,
          availability,
          status,
          verification,
          imageUrl: imageUrl.trim() || null,
          categoryIds,
          socialLinks: socialLinks.map((link) => ({ platform: link.platform, handle: link.handle.trim() })).filter((link) => link.handle),
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const apiError = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).error : null;
        throw new Error(typeof apiError === "string" ? apiError : "Unable to create business.");
      }
      const createdBusiness = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).business : null;
      const createdBusinessId = createdBusiness && typeof createdBusiness === "object" && !Array.isArray(createdBusiness) ? (createdBusiness as Record<string, unknown>).id : null;
      if (typeof createdBusinessId !== "string") throw new Error("Business was created but no business ID was returned.");
      router.push(`/admin/businesses/${createdBusinessId}`);
    } catch (submitError) {
      console.error("Create business error:", submitError);
      setError(submitError instanceof Error ? submitError.message : "Unable to create business.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  const addressPreview = composedAddress || "Your business address will appear here";
  const pricePreview = priceMin || priceMax
    ? `₦${priceMin ? Number(priceMin).toLocaleString("en-NG") : "—"} – ₦${priceMax ? Number(priceMax).toLocaleString("en-NG") : "—"}`
    : "Ask seller for pricing";

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F4F0EA] text-[#202A34]">
      <div className="flex min-h-dvh w-full">
        {/* Desktop admin navigation */}
        <aside className="sticky top-0 hidden h-dvh w-[228px] shrink-0 flex-col border-r border-[#E6DED4] bg-[#FFFDFC] lg:flex">
          <Link href="/admin" className="flex h-[76px] shrink-0 items-center gap-3 border-b border-[#EEE7DF] px-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-[#FF5A36] text-base font-black text-white shadow-[0_7px_18px_rgba(255,90,54,0.22)]">R</span>
            <span className="min-w-0"><span className="block text-[15px] font-black tracking-tight text-[#202A34]">ReMarket</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#988D82]">Admin workspace</span></span>
          </Link>
          <div className="px-4 pt-6"><p className="px-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#A79C91]">Workspace</p>
            <nav className="mt-3 space-y-1">
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/businesses";
                return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-bold transition ${active ? "bg-[#FFF0E9] text-[#AD3A22]" : "text-[#777067] hover:bg-[#F8F3ED] hover:text-[#202A34]"}`}><Icon className="h-[17px] w-[17px] shrink-0" />{item.label}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />}</Link>;
              })}
            </nav>
          </div>
          <div className="mt-auto p-4">
            <div className="overflow-hidden rounded-2xl bg-[#202D37] p-4 text-white">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10"><Sparkles className="h-4 w-4 text-[#FF9B7D]" /></div>
              <p className="mt-3 text-xs font-extrabold">Help local shops get found.</p>
              <p className="mt-1 text-[10px] leading-4 text-white/60">Every accurate listing makes nearby discovery better.</p>
              <Link href="/admin/businesses" className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-[#FFB29D]">View directory <ArrowUpRight className="h-3 w-3" /></Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 flex h-[66px] items-center justify-between border-b border-[#E6DED4] bg-[#FFFDFC]/95 px-4 backdrop-blur-xl sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin/businesses" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E6DED4] bg-white text-[#686158] transition hover:border-[#FFB59E] hover:text-[#B84228]" aria-label="Back to businesses"><ArrowLeft className="h-4 w-4" /></Link>
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#A0958A]">Merchant directory / New listing</p><p className="truncate text-sm font-black text-[#202A34]">Add a business</p></div>
            </div>
            <Link href="/" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#E6DED4] bg-white px-3 py-2 text-[11px] font-bold text-[#686158] transition hover:bg-[#F8F3ED]">Marketplace <ExternalLink className="h-3.5 w-3.5" /></Link>
          </header>

          {/* Tablet navigation stays horizontal and scrollable rather than squeezed. */}
          <nav aria-label="Admin navigation" className="sticky top-[66px] z-30 flex gap-1 overflow-x-auto border-b border-[#E6DED4] bg-[#FFFDFC]/95 px-3 py-2 backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin/businesses";
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-xl px-3 text-[11px] font-bold transition ${active ? "bg-[#FFF0E9] text-[#AD3A22]" : "text-[#777067] hover:bg-[#F8F3ED]"}`}><Icon className="h-3.5 w-3.5" />{item.label}</Link>;
            })}
          </nav>

          <div className="mx-auto w-full max-w-[1700px] px-3 pb-8 pt-4 sm:px-5 sm:pb-10 sm:pt-6 lg:px-7 xl:px-9">
            {/* Editorial hero */}
            <section className="relative isolate overflow-hidden rounded-[25px] bg-[#202D37] px-5 py-6 text-white shadow-[0_16px_40px_rgba(32,45,55,0.12)] sm:px-7 sm:py-7 xl:px-9 xl:py-8">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 h-64 w-64 rounded-full border-[34px] border-white/[0.045] sm:h-80 sm:w-80" />
              <div aria-hidden="true" className="pointer-events-none absolute right-[18%] top-[-68px] -z-10 h-44 w-44 rotate-12 rounded-[38px] border border-[#FF9679]/20 sm:h-56 sm:w-56" />
              <div className="relative flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
                <div className="max-w-2xl">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#FFB39D]"><Sparkles className="h-3.5 w-3.5" /> Give a local business a home online</div>
                  <h1 className="mt-4 max-w-2xl text-[28px] font-black leading-[1.04] tracking-[-0.045em] sm:text-4xl xl:text-[44px]">Bring a new business <span className="text-[#FF9879]">into the picture.</span></h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-white/65 sm:text-[15px]">Create a useful, accurate listing so buyers can discover what is nearby and know how to reach the seller.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 xl:w-[320px] xl:shrink-0">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FF9679]/15 text-[#FFB39D]"><CheckCircle2 className="h-4 w-4" /></div><p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">Setup progress</p><div className="mt-1 flex items-end justify-between gap-2"><strong className="text-2xl font-black tabular-nums">{completion}%</strong><span className="pb-1 text-[10px] text-white/50">of 8 details</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#FF9679] transition-all duration-300" style={{ width: `${completion}%` }} /></div></div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white"><MapPin className="h-4 w-4" /></div><p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">Address format</p><p className="mt-1 text-sm font-extrabold">Street-first</p><p className="mt-1 text-[10px] leading-4 text-white/50">Clear details improve discovery.</p></div>
                </div>
              </div>
            </section>

            {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-[#F0C4B9] bg-[#FFF1EC] px-4 py-3.5 text-sm text-[#9D3520]"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0" /><p className="min-w-0 flex-1 leading-5">{error}</p><button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="rounded-lg p-1 hover:bg-[#FBE1D9]"><X className="h-4 w-4" /></button></div>}

            <form onSubmit={submit} className="mt-5 grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_310px] 2xl:gap-6">
              <div className="min-w-0 space-y-5">
                {/* BUSINESS DETAILS */}
                <section id="details" className="scroll-mt-36 overflow-visible rounded-[22px] border border-[#E7DFD6] bg-[#FFFDFC] shadow-[0_4px_20px_rgba(62,49,38,0.025)]">
                  <div className="border-b border-[#EEE7DF] px-4 py-5 sm:px-6"><SectionHeading number="01" title="Business details" subtitle="Start with the name buyers will recognize and a clear explanation of what they can find." icon={Store} /></div>
                  <div className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6">
                    <Field><label className={LABEL_CLASS}>Business name <span className="text-[#D84B2E]">*</span></label><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mandy Treasures" maxLength={100} required className={INPUT_CLASS} /></Field>
                    <Field><label className={LABEL_CLASS}>Owner or contact name <span className="font-medium text-[#A49A8F]">(optional)</span></label><input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Who should buyers ask for?" maxLength={100} className={INPUT_CLASS} /></Field>
                    <Field className="sm:col-span-2"><div className="flex items-center justify-between gap-3"><label className={LABEL_CLASS}>Short description</label><span className="text-[10px] tabular-nums text-[#A69B90]">{description.length}/500</span></div><textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 500))} placeholder="What does this business sell or offer? Mention useful details that make it easy for a buyer to choose." rows={4} className="mt-2 min-h-[104px] w-full resize-y rounded-xl border border-[#E7E0D8] bg-white px-3.5 py-3 text-sm text-[#202A34] outline-none transition placeholder:text-[#ADA49A] focus:border-[#FF7657] focus:ring-4 focus:ring-[#FF5A36]/10" /></Field>
                </div></section>

                {/* IMAGE */}
                <section id="image" className="scroll-mt-36 overflow-hidden rounded-[22px] border border-[#E7DFD6] bg-[#FFFDFC] shadow-[0_4px_20px_rgba(62,49,38,0.025)]">
                  <div className="border-b border-[#EEE7DF] px-4 py-5 sm:px-6"><SectionHeading number="02" title="Make it recognizable" subtitle="Add a business image buyers can associate with the shop. Clear, real photos are best." icon={ImageIcon} /></div>
                  <div className="p-4 sm:p-6"><div className="max-w-2xl"><ImageUpload value={imageUrl || undefined} onChange={setImageUrl} disabled={saving} /></div><div className="mt-3 flex items-start gap-2 rounded-xl bg-[#F8F4EE] px-3.5 py-3 text-[11px] leading-5 text-[#7C7268]"><ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#B84228]" /><p>This image appears in the buyer-facing business listing. Use a photo the business owner has permission to share.</p></div></div>
                </section>

                {/* LOCATION */}
                <section id="location" className="scroll-mt-36 overflow-visible rounded-[22px] border border-[#E7DFD6] bg-[#FFFDFC] shadow-[0_4px_20px_rgba(62,49,38,0.025)]">
                  <div className="border-b border-[#EEE7DF] px-4 py-5 sm:px-6"><SectionHeading number="03" title="Pin down the location" subtitle="Accurate street and area details help buyers distinguish nearby businesses—even when streets have similar names." icon={Compass} /></div>
                  <div className="p-4 sm:p-6">
                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field><label className={LABEL_CLASS}>House / shop / building number</label><input value={houseNumber} onChange={(event) => setHouseNumber(event.target.value)} placeholder="e.g. Shop 12 or 18B" className={INPUT_CLASS} /><p className="mt-1.5 text-[10px] text-[#9C9186]">Optional if the place has no number.</p></Field>
                      <Field><label className={LABEL_CLASS}>Street / road / close <span className="text-[#D84B2E">*</span></label><input value={street} onChange={(event) => setStreet(event.target.value)} placeholder="e.g. Awolowo Road" required className={INPUT_CLASS} /></Field>
                      <Field><label className={LABEL_CLASS}>City <span className="text-[#D84B2E">*</span></label><input value={city} onChange={(event) => setCity(event.target.value)} placeholder="e.g. Lagos or Epe" className={INPUT_CLASS} /></Field>
                      <Field><label className={LABEL_CLASS}>Area / neighbourhood <span className="text-[#D84B2E">*</span></label><div className="relative"><select value={area} onChange={(event) => setArea(event.target.value)} required className={`${INPUT_CLASS} appearance-none pr-10`}><option value="">Choose an area</option>{LAGOS_AREA_GROUPS.map((group) => <optgroup key={group.lga} label={group.lga}>{group.areas.map((item) => <option key={`${group.lga}-${item}`} value={item}>{item}</option>)}</optgroup>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-[22px] h-4 w-4 text-[#978C81]" /></div></Field>
                      <Field className="sm:col-span-2"><label className={LABEL_CLASS}>Country</label><div className="relative"><Globe2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A8F84]" /><input value={DEFAULT_COUNTRY} readOnly className={`${INPUT_CLASS} bg-[#F7F3EE] pl-10`} /></div></Field>
                    </div>
                    <div className="mt-5 overflow-hidden rounded-2xl border border-[#E7DFD6] bg-[#F8F4EE]">
                      <div className="flex items-start gap-3 p-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#B84228] shadow-sm"><MapPin className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#968A7E]">Address preview</p><p className="mt-1 break-words text-sm font-bold leading-6 text-[#293540]">{addressPreview}</p><p className="mt-1 text-[10px] leading-4 text-[#8B8075]">Saved in this order: house or shop number, street, area, city, country.</p></div></div>
                    </div>
                    <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-[#83796F]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#54866C]" /><p>The admin device's GPS location is not used. The API can resolve coordinates from the address supplied here.</p></div>
                  </div>
                </section>

                {/* CATEGORIES */}
                <section id="categories" className="scroll-mt-36 overflow-visible rounded-[22px] border border-[#E7DFD6] bg-[#FFFDFC] shadow-[0_4px_20px_rgba(62,49,38,0.025)]">
                  <div className="border-b border-[#EEE7DF] px-4 py-5 sm:px-6"><SectionHeading number="04" title="What does this business offer?" subtitle="Choose every relevant category so buyers can find this business through discovery and filters." icon={Package} /></div>
                  <div className="p-4 sm:p-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-[#83796F]">{selectedCategoryIds.length} selected</span>{!usingCategoryFallback && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#488163]"><CheckCircle2 className="h-3.5 w-3.5" /> Database categories loaded</span>}</div>
                    {usingCategoryFallback && !loadingCategories && <div className="mb-4 rounded-xl border border-[#F0D3A9] bg-[#FFF8E9] px-3.5 py-3 text-[11px] leading-5 text-[#8A5B15]">Showing built-in category names because the category API is unavailable. These fallback IDs cannot be saved. Restore API access before assigning categories.</div>}
                    {loadingCategories ? <div className="flex items-center gap-2 rounded-xl bg-[#F8F4EE] px-4 py-5 text-xs text-[#83796F]"><Loader2 className="h-4 w-4 animate-spin text-[#FF5A36]" /> Loading categories…</div> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{categories.map((item) => { const active = selectedCategoryIds.includes(item.id); return <button key={item.id} type="button" disabled={usingCategoryFallback} aria-pressed={active} onClick={() => toggleCategory(item.id)} className={`group flex min-h-[52px] min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${usingCategoryFallback ? "cursor-not-allowed border-[#E7E0D8] bg-[#F7F3EE] text-[#A79C91]" : active ? "border-[#F5AE9B] bg-[#FFF0E9] text-[#A83B24] shadow-[0_2px_8px_rgba(255,90,54,0.07)]" : "border-[#E7E0D8] bg-white text-[#626B70] hover:border-[#F2B6A4] hover:bg-[#FFFAF7]"}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white text-[#B84228]" : "bg-[#F7F2EC] text-[#7D776E] group-hover:text-[#B84228]"}`}><Package className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate text-[11px] font-bold">{item.name}</span>{active && <Check className="h-4 w-4 shrink-0" />}</button>; })}</div>}
                  </div>
                </section>

                {/* CONTACT AND PRICING */}
                <section id="contact" className="scroll-mt-36 overflow-visible rounded-[22px] border border-[#E7DFD6] bg-[#FFFDFC] shadow-[0_4px_20px_rgba(62,49,38,0.025)]">
                  <div className="border-b border-[#EEE7DF] px-4 py-5 sm:px-6"><SectionHeading number="05" title="Contact and pricing" subtitle="Give buyers a way to ask questions and a helpful starting point for prices." icon={MessageCircle} /></div>
                  <div className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-6">
                    <Field className="sm:col-span-3"><label className={LABEL_CLASS}>Business phone number</label><div className="relative"><Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A8F84]" /><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. 0803 000 0000" inputMode="tel" className={`${INPUT_CLASS} pl-10`} /></div></Field>
                    <Field><label className={LABEL_CLASS}>Lowest price (₦)</label><input value={priceMin} onChange={(event) => setPriceMin(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="Optional" className={INPUT_CLASS} /></Field>
                    <Field><label className={LABEL_CLASS}>Highest price (₦)</label><input value={priceMax} onChange={(event) => setPriceMax(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="Optional" className={INPUT_CLASS} /></Field>
                    <div className="flex min-w-0 flex-col justify-end rounded-xl bg-[#F8F4EE] px-3.5 py-3"><span className="text-[10px] font-bold uppercase tracking-wide text-[#968A7E]">Price preview</span><span className="mt-1 break-words text-sm font-black text-[#293540]">{pricePreview}</span></div>
                  </div>
                </section>

                {/* STATUS */}
                <section id="status" className="scroll-mt-36 overflow-visible rounded-[22px] border border-[#E7DFD6] bg-[#FFFDFC] shadow-[0_4px_20px_rgba(62,49,38,0.025)]">
                  <div className="border-b border-[#EEE7DF] px-4 py-5 sm:px-6"><SectionHeading number="06" title="Listing status" subtitle="Choose how the listing should appear immediately after creation." icon={BadgeCheck} /></div>
                  <div className="grid min-w-0 grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-6">
                    <Field><label className={LABEL_CLASS}>Availability</label><div className="relative"><select value={availability} onChange={(event) => setAvailability(event.target.value as Availability)} className={`${INPUT_CLASS} appearance-none pr-9`}><option value="AVAILABLE">Available</option><option value="ASK_SELLER">Ask seller first</option><option value="UNAVAILABLE">Unavailable</option></select><ChevronDown className="pointer-events-none absolute right-3 top-[22px] h-4 w-4 text-[#978C81]" /></div></Field>
                    <Field><label className={LABEL_CLASS}>Business status</label><div className="relative"><select value={status} onChange={(event) => setStatus(event.target.value as BusinessStatus)} className={`${INPUT_CLASS} appearance-none pr-9`}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="PENDING">Pending review</option></select><ChevronDown className="pointer-events-none absolute right-3 top-[22px] h-4 w-4 text-[#978C81]" /></div></Field>
                    <Field><label className={LABEL_CLASS}>Verification</label><div className="relative"><select value={verification} onChange={(event) => setVerification(event.target.value as VerificationStatus)} className={`${INPUT_CLASS} appearance-none pr-9`}><option value="UNVERIFIED">Not verified</option><option value="VERIFIED">Verified</option></select><ChevronDown className="pointer-events-none absolute right-3 top-[22px] h-4 w-4 text-[#978C81]" /></div></Field>
                    <div className="sm:col-span-3 flex items-start gap-2.5 rounded-xl border border-[#E6EDE5] bg-[#F3F8F1] px-3.5 py-3 text-[11px] leading-5 text-[#55745D]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Only mark a business as verified after the relevant checks have actually been completed.</p></div>
                  </div>
                </section>

                {/* SOCIAL LINKS */}
                <section id="social" className="scroll-mt-36 overflow-visible rounded-[22px] border border-[#E7DFD6] bg-[#FFFDFC] shadow-[0_4px_20px_rgba(62,49,38,0.025)]">
                  <div className="flex flex-col gap-4 border-b border-[#EEE7DF] px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><SectionHeading number="07" title="Social and contact links" subtitle="Optional ways for buyers to connect directly with this business." icon={Globe2} /><button type="button" onClick={addSocialLink} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E7DFD6] bg-white px-3.5 text-xs font-bold text-[#5F675F] transition hover:border-[#F2B6A4] hover:bg-[#FFF8F4] hover:text-[#A83B24]"><Plus className="h-4 w-4" /> Add a link</button></div>
                  <div className="space-y-3 p-4 sm:p-6">{socialLinks.length === 0 ? <div className="rounded-2xl border border-dashed border-[#DDD4C9] bg-[#FAF7F2] px-4 py-7 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#A48E7D] shadow-sm"><Globe2 className="h-5 w-5" /></div><p className="mt-3 text-xs font-bold text-[#5F675F]">No extra links added</p><p className="mt-1 text-[11px] text-[#968A7E]">Add WhatsApp, Instagram, TikTok, Facebook, phone or directions.</p></div> : socialLinks.map((link, index) => <div key={index} className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-[#E7DFD6] bg-[#FAF7F2] p-3 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-center"><div className="relative min-w-0"><select aria-label={`Platform for link ${index + 1}`} value={link.platform} onChange={(event) => updateSocialLink(index, "platform", event.target.value as SocialPlatform)} className="h-11 w-full appearance-none rounded-xl border border-[#E7E0D8] bg-white px-3 pr-9 text-xs font-semibold text-[#4E5A63] outline-none focus:border-[#FF7657]"><option value="WHATSAPP">WhatsApp</option><option value="INSTAGRAM">Instagram</option><option value="TIKTOK">TikTok</option><option value="FACEBOOK">Facebook</option><option value="PHONE">Phone</option><option value="DIRECTIONS">Directions</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#978C81]" /></div><input aria-label={`Link value ${index + 1}`} value={link.handle} onChange={(event) => updateSocialLink(index, "handle", event.target.value)} placeholder="Handle, phone number or URL" className="h-11 min-w-0 rounded-xl border border-[#E7E0D8] bg-white px-3 text-xs outline-none focus:border-[#FF7657]" /><button type="button" onClick={() => removeSocialLink(index)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold text-[#A34A36] transition hover:bg-[#FFF0E9] sm:h-11" aria-label={`Remove link ${index + 1}`}><Trash2 className="h-3.5 w-3.5" /><span className="sm:hidden">Remove link</span></button></div>)}</div>
                </section>

                <div className="flex flex-col-reverse gap-2 border-t border-[#E2D9CF] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] leading-5 text-[#968A7E]">Review the address and category selections before saving.</p><div className="flex flex-col-reverse gap-2 sm:flex-row"><Link href="/admin/businesses" className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E3DBD1] bg-white px-5 text-xs font-bold text-[#6C655D] transition hover:bg-[#F8F3ED]">Cancel</Link><button type="submit" disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-xs font-extrabold text-white shadow-[0_7px_18px_rgba(255,90,54,0.20)] transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}{saving ? "Creating listing…" : "Create business"}</button></div></div>
              </div>

              {/* Live preview / checklist. Becomes a compact bottom section on smaller screens. */}
              <aside className="min-w-0 space-y-4 xl:sticky xl:top-[146px] xl:max-h-[calc(100dvh-164px)] xl:overflow-y-auto xl:pb-2">
                <section className="overflow-hidden rounded-[22px] border border-[#E1D8CE] bg-[#FFFDFC] shadow-[0_8px_26px_rgba(62,49,38,0.05)]">
                  <div className="flex items-center justify-between border-b border-[#EEE7DF] px-4 py-4"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#A1968A]">Live preview</p><p className="mt-1 text-sm font-black text-[#202A34]">Buyer view</p></div><span className="inline-flex items-center gap-1 rounded-full bg-[#F0F7F1] px-2.5 py-1 text-[9px] font-bold text-[#518064]"><Eye className="h-3 w-3" /> Preview</span></div>
                  <div className="p-4">
                    <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-[#F5EDE4] sm:h-44 xl:h-36">{imageUrl ? <img src={imageUrl} alt="Business preview" className="h-full w-full object-cover" /> : <div className="flex flex-col items-center gap-2 text-[#B9A99B]"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80"><Store className="h-7 w-7" /></div><span className="text-[10px] font-bold">Business image preview</span></div>}<span className="absolute left-3 top-3 rounded-full border border-white/60 bg-white/90 px-2.5 py-1 text-[9px] font-extrabold text-[#9D432B] backdrop-blur">ReMarket listing</span></div>
                    <div className="mt-4 flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-base font-black leading-5 text-[#202A34]">{name.trim() || "Your business name"}</h3><p className="mt-1 text-[11px] text-[#8C8176]">{ownerName.trim() || "Business owner"}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold ${status === "ACTIVE" ? "bg-[#E7F7EF] text-[#287A4B]" : status === "PENDING" ? "bg-[#FFF1D8] text-[#9A6318]" : "bg-[#F0ECE7] text-[#6F675F]"}`}>{status === "ACTIVE" ? "Active" : status === "PENDING" ? "Pending" : "Inactive"}</span></div>
                    <p className="mt-3 line-clamp-3 min-h-[42px] break-words text-xs leading-5 text-[#6D6A65]">{description.trim() || "A short, useful description will help buyers understand what this business offers."}</p>
                    <div className="mt-4 flex items-start gap-2 rounded-xl bg-[#F8F4EE] p-3"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B84228]" /><p className="min-w-0 break-words text-[10px] leading-4 text-[#6D6A65]">{addressPreview}</p></div>
                    <div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] font-semibold text-[#8A8178]">Indicative price</span><span className="text-right text-[11px] font-black text-[#202A34]">{pricePreview}</span></div>
                    {chosenCategories.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{chosenCategories.slice(0, 4).map((category) => <span key={category.id} className="max-w-full truncate rounded-full bg-[#FFF0E9] px-2.5 py-1 text-[9px] font-bold text-[#A83B24]">{category.name}</span>)}{chosenCategories.length > 4 && <span className="rounded-full bg-[#F3EEE7] px-2.5 py-1 text-[9px] font-bold text-[#786F65]">+{chosenCategories.length - 4}</span>}</div>}
                    <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-[#EEE7DF] p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-[#A1968A]">Availability</p><p className="mt-1 text-[11px] font-extrabold text-[#3D4A54]">{availability === "AVAILABLE" ? "Available" : availability === "ASK_SELLER" ? "Ask seller" : "Unavailable"}</p></div><div className="rounded-xl border border-[#EEE7DF] p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-[#A1968A]">Verification</p><p className="mt-1 inline-flex items-center gap-1 text-[11px] font-extrabold text-[#3D4A54]">{verification === "VERIFIED" ? <><BadgeCheck className="h-3.5 w-3.5 text-[#287A4B]" /> Verified</> : "Not verified"}</p></div></div>
                  </div>
                </section>

                <section className="rounded-[22px] border border-[#E1D8CE] bg-[#FFFDFC] p-4 shadow-[0_4px_18px_rgba(62,49,38,0.025)]">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#A1968A]">Listing checklist</p><h3 className="mt-1 text-sm font-black text-[#202A34]">Make it easier to discover</h3></div><span className="text-lg font-black tabular-nums text-[#B84228]">{completion}%</span></div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#F0E9E1]"><div className="h-full rounded-full bg-[#FF7657] transition-all duration-300" style={{ width: `${completion}%` }} /></div>
                  <div className="mt-4 space-y-3">
                    {[{ label: "Business name", ok: Boolean(name.trim()) }, { label: "Street address", ok: Boolean(street.trim() && area.trim() && city.trim()) }, { label: "Description", ok: Boolean(description.trim()) }, { label: "Business image", ok: Boolean(imageUrl.trim()) }, { label: "At least one category", ok: selectedCategoryIds.length > 0 }, { label: "Contact phone", ok: Boolean(phone.trim()) }].map((item) => <div key={item.label} className="flex items-center gap-2.5"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${item.ok ? "bg-[#E7F7EF] text-[#287A4B]" : "bg-[#F3EEE7] text-[#A1968A]"}`}>{item.ok ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span><span className={`text-[11px] font-semibold ${item.ok ? "text-[#53615A]" : "text-[#8C8176]"}`}>{item.label}</span></div>)}
                  </div>
                  {usingCategoryFallback && !loadingCategories && <p className="mt-4 rounded-xl bg-[#FFF8E9] p-3 text-[10px] leading-4 text-[#8A5B15]">Category data is in fallback mode. Reload the page when the category API is available before selecting database categories.</p>}
                  <div className="mt-4 rounded-xl bg-[#202D37] p-3.5 text-white"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#FF9B7D]" /><p className="text-[11px] font-extrabold">Small details make a difference</p></div><p className="mt-1.5 text-[10px] leading-4 text-white/60">A precise location, relevant categories and a real image help customers decide whether to contact the business.</p></div>
                </section>
              </aside>
            </form>
            <footer className="mt-8 flex flex-col gap-2 border-t border-[#E4DBD1] py-5 text-[10px] text-[#9A8F84] sm:flex-row sm:items-center sm:justify-between"><span>ReMarket Admin · Business onboarding</span><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Listing information is saved through the admin API.</span></footer>
          </div>
        </div>
      </div>
    </main>
  );
}
