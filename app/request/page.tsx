"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Plus,
  Image as ImageIcon,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  MapPin,
  Phone,
  Store,
  Search,
  Loader2,
  X,
  Sparkles,
  MessageCircle,
  ShieldCheck,
  Clock3,
  RotateCcw,
  Save,
  ArrowRight,
  Lightbulb,
  PackageCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Requests", href: "/my-requests", icon: ClipboardList },
  { label: "Saved", href: "/saved", icon: Heart },
] as const;

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_PRISMA_INT = 2_147_483_647;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const REQUEST_DRAFT_KEY = "remarket:request-draft:v1";

const REQUEST_IDEAS = [
  "School shoes",
  "Phone accessories",
  "Laptop repair",
  "School supplies",
  "Clothes for an event",
  "Room furniture",
] as const;

type Category = { id: string; name: string };
type RequestMatch = {
  id: string;
  score: number;
  business: { id: string; name: string; area: string; verified: boolean };
};
type CreatedRequest = {
  requestCode: string;
  query: string;
  category?: string | null;
  matches: RequestMatch[];
};
type RequestDraft = {
  version: 1;
  query: string;
  category: string;
  budget: string;
  locationArea: string;
  quantity: string;
  description: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getApiError(data: unknown, fallback: string): string {
  return isRecord(data) && typeof data.error === "string" && data.error.trim()
    ? data.error.trim()
    : fallback;
}

function isCategory(value: unknown): value is Category {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id.trim().length > 0 &&
    typeof value.name === "string" && value.name.trim().length > 0;
}

function isRequestMatch(value: unknown): value is RequestMatch {
  if (!isRecord(value) || !isRecord(value.business)) return false;
  const business = value.business;
  return typeof value.id === "string" &&
    typeof value.score === "number" && Number.isFinite(value.score) &&
    typeof business.id === "string" && typeof business.name === "string" &&
    typeof business.area === "string" && typeof business.verified === "boolean";
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function hasDraftContent(draft: RequestDraft): boolean {
  return Boolean(
    draft.query.trim() || draft.category.trim() || draft.budget.trim() ||
    draft.locationArea.trim() || draft.description.trim() || draft.quantity !== "1",
  );
}

const inputClass =
  "w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm text-[#17202A] outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:opacity-60";
const labelClass = "mb-2 block text-sm font-bold text-[#17202A]";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#E94D2C] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-3 text-sm font-semibold text-[#6F675F] transition hover:border-[#F1B6A5] hover:bg-[#FFF7ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/15 disabled:cursor-not-allowed disabled:opacity-60";

export default function RequestPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [budget, setBudget] = useState("");
  const [locationArea, setLocationArea] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdRequest, setCreatedRequest] = useState<CreatedRequest | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftWasRestored, setDraftWasRestored] = useState(false);

  const completedFields = [query.trim().length > 0, Boolean(category), Boolean(locationArea.trim()), Boolean(buyerContact.trim())].filter(Boolean).length;
  const formProgress = Math.round((completedFields / 4) * 100);
  const draft = useMemo<RequestDraft>(() => ({
    version: 1,
    query,
    category,
    budget,
    locationArea,
    quantity,
    description,
  }), [query, category, budget, locationArea, quantity, description]);

  const loadCategories = useCallback(async (signal: AbortSignal) => {
    setLoadingCategories(true);
    setCategoryError("");
    try {
      const response = await fetch("/api/categories", { cache: "no-store", signal });
      const data = await readJsonSafely(response);
      if (!response.ok) throw new Error(getApiError(data, "Unable to load categories."));
      if (!isRecord(data) || !Array.isArray(data.categories)) {
        throw new Error("The categories response is invalid.");
      }
      const activeCategories = data.categories.filter(isCategory).map((item) => ({
        id: item.id,
        name: item.name.trim(),
      }));
      if (!signal.aborted) setCategories(activeCategories);
    } catch (loadError) {
      if (signal.aborted) return;
      console.error("Load request categories error:", loadError);
      setCategories([]);
      setCategoryError("Categories are temporarily unavailable. You can still send a request without one.");
    } finally {
      if (!signal.aborted) setLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadCategories(controller.signal);
    return () => controller.abort();
  }, [loadCategories]);

  /*
   * Retention: restore an unfinished request on this device.
   * The buyer's phone number and uploaded image URL are deliberately
   * excluded from the draft for privacy and to avoid stale uploads.
   */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REQUEST_DRAFT_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed) && parsed.version === 1) {
          const restored: RequestDraft = {
            version: 1,
            query: typeof parsed.query === "string" ? parsed.query.slice(0, 200) : "",
            category: typeof parsed.category === "string" ? parsed.category.slice(0, 120) : "",
            budget: typeof parsed.budget === "string" ? parsed.budget.slice(0, 20) : "",
            locationArea: typeof parsed.locationArea === "string" ? parsed.locationArea.slice(0, 120) : "",
            quantity: typeof parsed.quantity === "string" ? parsed.quantity.slice(0, 12) : "1",
            description: typeof parsed.description === "string" ? parsed.description.slice(0, 2000) : "",
          };
          if (hasDraftContent(restored)) {
            setQuery(restored.query);
            setCategory(restored.category);
            setBudget(restored.budget);
            setLocationArea(restored.locationArea);
            setQuantity(restored.quantity || "1");
            setDescription(restored.description);
            setDraftWasRestored(true);
            setDraftStatus("Draft restored on this device");
          }
        }
      }
    } catch (storageError) {
      console.warn("Unable to restore request draft:", storageError);
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    if (createdRequest) {
      try { window.localStorage.removeItem(REQUEST_DRAFT_KEY); } catch { /* Storage may be disabled. */ }
      setDraftStatus("");
      return;
    }
    if (!hasDraftContent(draft)) {
      try { window.localStorage.removeItem(REQUEST_DRAFT_KEY); } catch { /* Storage may be disabled. */ }
      setDraftStatus("");
      return;
    }
    setDraftStatus("Saving draft…");
    const timeoutId = window.setTimeout(() => {
      try {
        window.localStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify(draft));
        setDraftStatus("Draft saved on this device · contact number is not saved");
      } catch (storageError) {
        console.warn("Unable to save request draft:", storageError);
        setDraftStatus("Draft could not be saved on this device");
      }
    }, 450);
    return () => window.clearTimeout(timeoutId);
  }, [draft, draftReady, createdRequest]);

  function updateQuery(value: string) {
    setQuery(value);
    setError("");
  }

  function startWithIdea(idea: string) {
    setQuery(idea);
    setError("");
    document.getElementById("query")?.focus({ preventScroll: true });
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setError("");
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError("The image must be 5 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await readJsonSafely(response);
      if (!response.ok) throw new Error(getApiError(data, "Unable to upload image."));
      if (!isRecord(data) || typeof data.url !== "string" || !isHttpUrl(data.url.trim())) {
        throw new Error("The upload did not return a valid image URL.");
      }
      setImageUrl(data.url.trim());
    } catch (uploadError) {
      console.error("Request image upload error:", uploadError);
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || uploading) return;
    setError("");

    if (!query.trim()) { setError("Tell us what you are looking for."); return; }
    if (!buyerContact.trim()) { setError("Add your WhatsApp number or phone number."); return; }
    if (query.trim().length > 200) { setError("Keep the request title under 200 characters."); return; }
    if (buyerContact.trim().length > 40) { setError("Your contact number is too long."); return; }

    const quantityNumber = Number(quantity);
    if (!Number.isSafeInteger(quantityNumber) || quantityNumber < 1 || quantityNumber > MAX_PRISMA_INT) {
      setError("Quantity must be a valid whole number of at least 1.");
      return;
    }

    const budgetNumber = budget.trim() ? Number(budget) : undefined;
    if (budgetNumber !== undefined && (!Number.isSafeInteger(budgetNumber) || budgetNumber < 0 || budgetNumber > MAX_PRISMA_INT)) {
      setError("Enter a valid whole-number budget in naira.");
      return;
    }
    if (description.trim().length > 2000) { setError("Keep the extra details under 2,000 characters."); return; }
    if (locationArea.trim().length > 120) { setError("Keep your area under 120 characters."); return; }
    if (imageUrl && !isHttpUrl(imageUrl)) { setError("The uploaded image URL is invalid. Remove it and upload the image again."); return; }

    setLoading(true);
    try {
      const response = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          category: category || undefined,
          budget: budgetNumber,
          locationArea: locationArea.trim() || undefined,
          quantity: quantityNumber,
          description: description.trim() || undefined,
          imageUrl: imageUrl || undefined,
          buyerContact: buyerContact.trim(),
        }),
      });
      const data = await readJsonSafely(response);
      if (!response.ok) throw new Error(getApiError(data, "Unable to create request."));
      if (!isRecord(data) || !isRecord(data.request)) {
        throw new Error("The server did not return a valid request. Check My Requests before submitting again.");
      }

      const requestData = data.request;
      const requestCode = requestData.requestCode;

      if (typeof requestCode !== "string" || !requestCode.trim()) {
        throw new Error("The server did not return a request code. Check My Requests before submitting again.");
      }

      const matches = Array.isArray(requestData.matches) ? requestData.matches.filter(isRequestMatch) : [];
      setCreatedRequest({
        requestCode: requestCode.trim(),
        query: typeof requestData.query === "string" ? requestData.query : query.trim(),
        category: typeof requestData.category === "string" ? requestData.category : null,
        matches,
      });
      setDraftWasRestored(false);
    } catch (submitError) {
      console.error("Create request error:", submitError);
      setError(submitError instanceof Error ? submitError.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setQuery("");
    setCategory("");
    setBudget("");
    setLocationArea("");
    setQuantity("1");
    setDescription("");
    setBuyerContact("");
    setImageUrl("");
    setError("");
    setCreatedRequest(null);
    setDraftWasRestored(false);
    setDraftStatus("");
    try { window.localStorage.removeItem(REQUEST_DRAFT_KEY); } catch { /* Storage may be disabled. */ }
  }

  return (
    <div className="min-h-dvh w-full bg-[#FFF7ED]">
      <div className="flex min-h-dvh w-full flex-col bg-[#FFFDFC]">
        <header className="sticky top-0 z-30 flex h-[66px] shrink-0 items-center justify-between gap-2 border-b border-[#EAE6DF] bg-white/95 px-4 backdrop-blur sm:px-6">
          <Link href="/" className="shrink-0 text-xl font-black tracking-tight text-[#17202A]" aria-label="ReMarket home">
            Re<span className="text-[#FF5A36]">Market</span>
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-4 lg:flex xl:gap-7">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Requests";
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 whitespace-nowrap text-sm font-semibold transition ${active ? "text-[#FF5A36]" : "text-[#6F675F] hover:text-[#17202A]"}`}><Icon size={17} />{item.label}</Link>;
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/search" aria-label="Search ReMarket" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0D9] text-[#9F2D18] transition hover:bg-[#FFE0D6] sm:hidden"><Search size={19} /></Link>
            <Link href="/request" aria-label="Request something" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white transition hover:opacity-90 sm:hidden"><Plus size={20} /></Link>
            <Link href="/request" className="hidden items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 sm:flex"><Plus size={17} />Request something</Link>
          </div>
        </header>

        <div className="flex min-h-[calc(100dvh-66px)] flex-1">
          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] p-3 lg:block">
            <nav aria-label="Sidebar navigation" className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.label === "Requests";
                return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? "bg-[#FFE0D6] text-[#9F2D18]" : "text-[#6F675F] hover:bg-white hover:text-[#17202A]"}`}><Icon size={18} />{item.label}</Link>;
              })}
            </nav>
            <div className="mt-8 rounded-2xl bg-[#FFF0D9] p-4"><p className="text-sm font-bold text-[#9F2D18]">Cannot find it?</p><p className="mt-1 text-xs leading-5 text-[#7C5B4E]">Tell nearby sellers what you need.</p></div>
            <div className="mt-3 rounded-2xl border border-[#E8E4DE] bg-white p-4"><div className="flex items-center gap-2 text-[#FF5A36]"><Clock3 size={16} /><p className="text-xs font-bold">Come back anytime</p></div><p className="mt-2 text-xs leading-5 text-[#7C746C]">Your submitted requests stay available in My Requests.</p><Link href="/my-requests" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#9F2D18]">View requests <ArrowRight size={13} /></Link></div>
          </aside>

          <main className="min-w-0 flex-1 pb-28 lg:pb-8">
            {createdRequest ? (
              <SuccessView request={createdRequest} onNewRequest={resetForm} />
            ) : (
              <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
                <div className="mb-6">
                  <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#8A8178] transition hover:text-[#17202A]"><ArrowLeft size={16} />Back home</Link>
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:items-end">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-[#F1D4C8] bg-[#FFF5EF] px-3 py-1.5 text-[11px] font-bold text-[#9F2D18]"><Sparkles size={14} />A better way to find what you need</div>
                      <h1 className="mt-3 text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl lg:text-4xl">Tell us what you need.</h1>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-[#7C746C]">Describe the item or service. ReMarket can help connect your request with nearby businesses.</p>
                    </div>
                    <div className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-[#17202A]">Your request checklist</p><p className="mt-1 text-[11px] text-[#8A8178]">A few details make your request clearer.</p></div><span className="text-sm font-black text-[#9F2D18]">{completedFields}/4</span></div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F0E5DF]"><div className="h-full rounded-full bg-[#FF5A36] transition-all duration-300" style={{ width: `${formProgress}%` }} /></div>
                      <p className="mt-2 text-[10px] text-[#8A8178]">{formProgress === 100 ? "Great — your main details are ready." : "Add your item, category, area and contact to complete the checklist."}</p>
                    </div>
                  </div>
                </div>

                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  <div className="flex items-start gap-3 rounded-2xl border border-[#EAE6DF] bg-white p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]"><MapPin size={18} /></span><div><p className="text-xs font-bold text-[#17202A]">Keep it local</p><p className="mt-1 text-[11px] leading-5 text-[#8A8178]">Add your area so nearby sellers are easier to identify.</p></div></div>
                  <div className="flex items-start gap-3 rounded-2xl border border-[#EAE6DF] bg-white p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E7F0FF] text-[#3566B8]"><MessageCircle size={18} /></span><div><p className="text-xs font-bold text-[#17202A]">Be specific</p><p className="mt-1 text-[11px] leading-5 text-[#8A8178]">Mention size, colour, model or service details.</p></div></div>
                  <div className="flex items-start gap-3 rounded-2xl border border-[#EAE6DF] bg-white p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#DDF5EA] text-[#137A59]"><ShieldCheck size={18} /></span><div><p className="text-xs font-bold text-[#17202A]">Stay in control</p><p className="mt-1 text-[11px] leading-5 text-[#8A8178]">Keep your request code to check your request later.</p></div></div>
                </div>

                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <form onSubmit={handleSubmit} className="min-w-0 rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm sm:p-6">
                    <div className="mb-5 flex items-start justify-between gap-3 border-b border-[#F0ECE7] pb-4"><div><h2 className="text-base font-black text-[#17202A]">Build your request</h2><p className="mt-1 text-xs leading-5 text-[#8A8178]">Required: item or service, and a contact number.</p></div><span className="rounded-full bg-[#FCFAF6] px-3 py-1 text-[10px] font-bold text-[#7C746C]">Free to submit</span></div>

                    {error && <div role="alert" aria-live="polite" className="mb-5 flex items-start gap-2 rounded-xl border border-[#F5C4B3] bg-[#FFF0EE] px-4 py-3 text-sm font-medium text-[#9F2D18]"><X size={17} className="mt-0.5 shrink-0" /><p>{error}</p></div>}
                    {draftWasRestored && <div role="status" className="mb-5 flex items-start gap-2 rounded-xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-3 text-xs text-[#137A59]"><RotateCcw size={16} className="mt-0.5 shrink-0" /><p><strong>Your draft is back.</strong> We restored the request details saved on this device. Your contact number and uploaded photo were not saved.</p></div>}

                    <div className="space-y-5">
                      <div>
                        <label htmlFor="query" className={labelClass}>What are you looking for? <span className="text-[#FF5A36]">*</span></label>
                        <input id="query" name="query" value={query} onChange={(event) => updateQuery(event.target.value)} maxLength={200} required autoComplete="off" placeholder="e.g. black school shoes, phone screen repair" className={inputClass} />
                        <div className="mt-2 flex items-center justify-between gap-2"><p className="text-[10px] text-[#8A8178]">Short and specific works best.</p><span className="text-[10px] tabular-nums text-[#A69D94]">{query.length}/200</span></div>
                        <div className="mt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#A69D94]">Need an idea?</p><div className="flex flex-wrap gap-2">{REQUEST_IDEAS.map((idea) => <button key={idea} type="button" onClick={() => startWithIdea(idea)} className="rounded-full border border-[#E8E4DE] bg-white px-3 py-2 text-[11px] font-semibold text-[#6F675F] transition hover:border-[#F1B6A5] hover:bg-[#FFF5EF] hover:text-[#9F2D18]">{idea}</button>)}</div></div>
                      </div>

                      <div>
                        <label htmlFor="category" className={labelClass}>Category <span className="font-normal text-[#A69D94]">(optional)</span></label>
                        <select id="category" name="category" value={category} onChange={(event) => setCategory(event.target.value)} disabled={loadingCategories} className={inputClass}>
                          <option value="">{loadingCategories ? "Loading categories…" : "Choose a category"}</option>
                          {categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                        </select>
                        {categoryError && <p role="status" className="mt-2 text-xs text-[#9F2D18]">{categoryError}</p>}
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="min-w-0"><label htmlFor="budget" className={labelClass}>Budget <span className="font-normal text-[#A69D94]">(optional)</span></label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8A8178]">₦</span><input id="budget" name="budget" type="number" min="0" max={MAX_PRISMA_INT} step="1" inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Your budget" className={`${inputClass} pl-9`} /></div><p className="mt-1.5 text-[10px] leading-4 text-[#A69D94]">A budget can help clarify your request.</p></div>
                        <div className="min-w-0"><label htmlFor="quantity" className={labelClass}>Quantity</label><input id="quantity" name="quantity" type="number" min="1" max={MAX_PRISMA_INT} step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} required className={inputClass} /><p className="mt-1.5 text-[10px] leading-4 text-[#A69D94]">How many do you need?</p></div>
                      </div>

                      <div><label htmlFor="locationArea" className={labelClass}>Your area <span className="font-normal text-[#A69D94]">(helps with nearby sellers)</span></label><div className="relative"><MapPin size={17} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8A8178]" /><input id="locationArea" name="locationArea" value={locationArea} onChange={(event) => setLocationArea(event.target.value)} maxLength={120} placeholder="e.g. Ogba, Epe, Yaba" className={`${inputClass} pl-11`} /></div></div>

                      <div><div className="mb-2 flex items-center justify-between gap-2"><label htmlFor="description" className={`${labelClass} mb-0`}>More details <span className="font-normal text-[#A69D94]">(optional)</span></label><span className="text-[10px] tabular-nums text-[#A69D94]">{description.length}/2000</span></div><textarea id="description" name="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} placeholder="Add colour, size, brand, model or anything else sellers should know." className={`${inputClass} resize-y`} /><div className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-[#8A8178]"><Lightbulb size={14} className="mt-0.5 shrink-0 text-[#FF5A36]" /><span>Example: “Size 42, black, comfortable for daily use.” The extra detail helps make your request clearer.</span></div></div>

                      <div>
                        <label htmlFor="request-image" className={labelClass}>Add a photo <span className="font-normal text-[#A69D94]">(optional)</span></label>
                        <div className="rounded-xl border border-dashed border-[#D8D1C9] bg-[#FCFAF6] p-4 transition hover:border-[#FF5A36]">
                          <label htmlFor="request-image" className={`flex items-center gap-3 ${uploading ? "cursor-wait" : "cursor-pointer"}`}>
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]">{uploading ? <Loader2 size={19} className="animate-spin" /> : <ImageIcon size={19} />}</div>
                            <div className="min-w-0"><p className="text-sm font-bold text-[#17202A]">{uploading ? "Uploading…" : imageUrl ? "Photo added" : "Choose a photo"}</p><p className="mt-0.5 text-xs leading-5 text-[#8A8178]">JPG, PNG or WebP, up to 5 MB.</p></div>
                          </label>
                          {imageUrl && <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#E8E4DE] pt-3"><a href={imageUrl} target="_blank" rel="noreferrer" className="break-all text-xs font-semibold text-[#9F2D18] underline">View uploaded photo</a><button type="button" onClick={() => setImageUrl("")} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#8A8178] hover:text-[#9F2D18]"><X size={13} />Remove</button></div>}
                          <input id="request-image" name="request-image" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || loading} onChange={handleImageUpload} className="sr-only" />
                        </div>
                      </div>

                      <div className="rounded-2xl bg-[#FFF0D9] p-4 sm:p-5"><div className="mb-3 flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#9F2D18]"><Phone size={17} /></span><div><h3 className="text-sm font-bold text-[#9F2D18]">How can sellers contact you?</h3><p className="mt-1 text-xs leading-5 text-[#7C5B4E]">Use a number where you can be reached about this request.</p></div></div><label htmlFor="buyerContact" className="mb-2 block text-xs font-bold text-[#9F2D18]">WhatsApp or phone number <span className="text-[#FF5A36]">*</span></label><input id="buyerContact" name="buyerContact" type="tel" autoComplete="tel" value={buyerContact} onChange={(event) => setBuyerContact(event.target.value)} maxLength={40} required placeholder="e.g. 08012345678" className="w-full rounded-xl border border-[#F5D6B4] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:ring-4 focus:ring-[#FF5A36]/10" /><p className="mt-2 text-[10px] leading-4 text-[#7C5B4E]">Your contact number is not included in this device's saved draft.</p></div>

                      <div className="rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-3"><div className="flex items-start gap-2"><Save size={15} className="mt-0.5 shrink-0 text-[#8A8178]" /><div><p className="text-[11px] font-bold text-[#6F675F]">Your draft</p><p aria-live="polite" className="mt-1 text-[10px] leading-4 text-[#8A8178]">{draftStatus || (draftReady ? "Start typing and your request details will be saved on this device." : "Preparing your draft…")}</p></div></div></div>

                      <button type="submit" disabled={loading || uploading || !draftReady} className={`${primaryButtonClass} min-h-12 w-full px-5 py-3.5`}>
                        {loading ? <><Loader2 size={17} className="animate-spin" />Sending request…</> : uploading ? "Please wait for the photo upload…" : <><Plus size={18} />Send request <ArrowRight size={17} /></>}
                      </button>
                      <p className="text-center text-[10px] leading-4 text-[#A69D94]">After submitting, keep your request code and revisit My Requests to check its status.</p>
                    </div>
                  </form>

                  <aside className="space-y-4 xl:sticky xl:top-24">
                    <div className="rounded-2xl border border-[#F1D4C8] bg-gradient-to-br from-[#FFF5EF] via-white to-[#FCFAF6] p-5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white"><Sparkles size={19} /></div><h2 className="mt-4 text-sm font-black text-[#17202A]">Make your request stand out</h2><p className="mt-2 text-xs leading-5 text-[#7C746C]">A clear request helps businesses understand what you need without guessing.</p><div className="mt-4 space-y-3">{[{title: "Name the item", text: "Use the product or service name."}, {title: "Share useful details", text: "Add size, model, colour or preferred type."}, {title: "Add your area", text: "Help narrow it down to your part of town."}].map((tip, index) => <div key={tip.title} className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-black text-[#9F2D18]">{index + 1}</span><div><p className="text-xs font-bold text-[#17202A]">{tip.title}</p><p className="mt-1 text-[11px] leading-5 text-[#8A8178]">{tip.text}</p></div></div>)}</div></div>
                    <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5"><div className="flex items-center gap-2"><PackageCheck size={18} className="text-[#137A59]" /><h2 className="text-sm font-bold text-[#17202A]">After you submit</h2></div><div className="mt-4 space-y-4"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#DDF5EA] text-[#137A59]"><CheckCircle2 size={16} /></span><div><p className="text-xs font-bold text-[#17202A]">Keep your request code</p><p className="mt-1 text-[11px] leading-5 text-[#8A8178]">Use it to identify your request when checking back.</p></div></div><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E7F0FF] text-[#3566B8]"><ClipboardList size={16} /></span><div><p className="text-xs font-bold text-[#17202A]">Check My Requests</p><p className="mt-1 text-[11px] leading-5 text-[#8A8178]">Return to see the request information available to you.</p><Link href="/my-requests" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#9F2D18]">Go to My Requests <ArrowRight size={13} /></Link></div></div></div></div>
                  </aside>
                </div>
              </div>
            )}
          </main>
        </div>

        <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#EAE6DF] bg-white/95 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"><div className="mx-auto flex max-w-md items-center justify-around">{NAV_ITEMS.map((item) => { const Icon = item.icon; const active = item.label === "Requests"; return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-w-[60px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-semibold transition ${active ? "bg-[#FFE0D6] text-[#FF5A36]" : "text-[#8A8178] hover:bg-[#FCFAF6]"}`}><Icon size={18} />{item.label}</Link>; })}</div></nav>
      </div>
    </div>
  );
}

function SuccessView({ request, onNewRequest }: { request: CreatedRequest; onNewRequest: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  async function copyRequestCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(request.requestCode);
      } else {
        throw new Error("Clipboard unavailable");
      }
      setCopied(true);
      setCopyMessage("Request code copied. Keep it somewhere you can find it.");
    } catch {
      setCopied(false);
      setCopyMessage("Copy was unavailable. Select the code and copy it manually.");
    }
  }

  async function shareRequestCode() {
    const text = `I submitted a ReMarket request for: ${request.query}. My request code is ${request.requestCode}. Check requests at ${window.location.origin}/my-requests`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "My ReMarket request", text });
        setCopyMessage("Request details shared.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopyMessage("Request details copied so you can share them.");
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      setCopyMessage("Sharing was unavailable. You can still copy your request code above.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[26px] border border-[#EAE6DF] bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#FFF5EF] via-white to-[#FCFAF6] px-5 py-8 text-center sm:px-8 sm:py-10"><div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-[#FFE0D6]/70" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-16 -left-6 h-36 w-36 rounded-full bg-[#DDF5EA]/70" /><div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#DDF5EA] text-[#238B5B] shadow-sm"><CheckCircle2 size={34} /></div><p className="relative mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-[#137A59]">Request received</p><h1 className="relative mt-2 text-2xl font-black text-[#17202A] sm:text-3xl">You're one step closer.</h1><p className="relative mx-auto mt-2 max-w-lg text-sm leading-6 text-[#7C746C]">Your request has been created. Keep the code below and return to My Requests to check the information available about it.</p></div>

        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
          <div className="min-w-0">
            <div className="rounded-2xl border border-[#F1D4C8] bg-[#FFF5EF] p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#9F2D18]">Your request code</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="break-all text-2xl font-black tracking-wider text-[#17202A]">{request.requestCode}</span><button type="button" onClick={() => void copyRequestCode()} aria-label="Copy request code" className="rounded-lg border border-[#E8E4DE] bg-white p-2 text-[#8A8178] transition hover:text-[#FF5A36]">{copied ? <Check size={17} className="text-[#238B5B]" /> : <Copy size={17} />}</button></div><p aria-live="polite" className="mt-2 text-xs leading-5 text-[#7C5B4E]">{copyMessage || "Save this code so you can identify your request later."}</p><button type="button" onClick={() => void shareRequestCode()} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#9F2D18]"><MessageCircle size={14} />Share request details</button></div>
            <div className="mt-5"><p className="text-sm font-bold text-[#17202A]">Your request</p><div className="mt-3 rounded-xl bg-[#FCFAF6] p-4"><p className="break-words font-bold text-[#17202A]">{request.query}</p>{request.category && <p className="mt-1 text-xs text-[#8A8178]">{request.category}</p>}</div></div>
          </div>
          <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5"><h2 className="text-sm font-black text-[#17202A]">What to do next</h2><div className="mt-4 space-y-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0D9] text-[#9F2D18]"><Save size={17} /></span><div><p className="text-xs font-bold text-[#17202A]">Save your code</p><p className="mt-1 text-[11px] leading-5 text-[#8A8178]">Keep it in your notes or copy it now.</p></div></div><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E7F0FF] text-[#3566B8]"><ClipboardList size={17} /></span><div><p className="text-xs font-bold text-[#17202A]">Check back later</p><p className="mt-1 text-[11px] leading-5 text-[#8A8178]">My Requests is the place to review your requests.</p></div></div><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#DDF5EA] text-[#137A59]"><Search size={17} /></span><div><p className="text-xs font-bold text-[#17202A]">Keep discovering</p><p className="mt-1 text-[11px] leading-5 text-[#8A8178]">Browse products and nearby businesses while you wait.</p></div></div></div><Link href="/my-requests" className={`${primaryButtonClass} mt-5 w-full`}>Check my requests <ArrowRight size={16} /></Link><Link href="/search" className={`${secondaryButtonClass} mt-2 w-full`}>Explore ReMarket</Link></div>

          <div className="lg:col-span-2">{request.matches.length > 0 ? <div className="rounded-2xl border border-[#EAE6DF] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-black text-[#17202A]">Potential matches</h2><p className="mt-1 text-xs text-[#8A8178]">These businesses were returned with your request.</p></div><span className="rounded-full bg-[#EFFBF6] px-3 py-1.5 text-xs font-bold text-[#137A59]">{request.matches.length} found</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{request.matches.slice(0, 3).map((match) => <Link key={match.id} href={`/seller/${encodeURIComponent(match.business.id)}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#EAE6DF] p-3 transition hover:border-[#FF5A36] hover:bg-[#FFFCFA]"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]"><Store size={18} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#17202A]">{match.business.name}</p><p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[#8A8178]"><MapPin size={12} className="shrink-0" /><span className="truncate">{match.business.area}</span></p></div>{match.business.verified && <span className="shrink-0 rounded-full bg-[#E7F0FF] px-2 py-1 text-[10px] font-bold text-[#3566B8]">Verified</span>}</Link>)}</div></div> : <div className="rounded-2xl bg-[#FCFAF6] p-5 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#8A8178]"><Search size={18} /></div><p className="mt-3 text-sm font-bold text-[#17202A]">No potential matches were returned yet</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#8A8178]">You can still review your request later in My Requests. You may also browse ReMarket to look around.</p><Link href="/shop" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#9F2D18]">Browse products <ArrowRight size={13} /></Link></div>}</div>

          <div className="flex flex-col gap-3 border-t border-[#EAE6DF] pt-5 sm:flex-row lg:col-span-2"><Link href="/my-requests" className={`${primaryButtonClass} min-h-11 flex-1`}>Check my requests <ArrowRight size={16} /></Link><button type="button" onClick={onNewRequest} className={`${secondaryButtonClass} min-h-11 flex-1`}><Plus size={16} />Make another request</button></div>
        </div>
      </div>
    </div>
  );
}
