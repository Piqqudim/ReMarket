"use client";

import Link from "next/link";
import {
  useCallback,
  useState,
  type FormEvent,
} from "react";
import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Search,
  MapPin,
  Store,
  CheckCircle2,
  Clock3,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Plus,
  ExternalLink,
  Sparkles,
  CircleHelp,
  PackageCheck,
  Circle,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Requests", href: "/my-requests", icon: ClipboardList },
  { label: "Saved", href: "/saved", icon: Heart },
] as const;

type RequestMatch = {
  id: string;
  score: number;
  business: {
    id: string;
    name: string;
    area: string;
    verified: boolean;
  };
};

type RequestRecord = {
  id: string;
  requestCode: string;
  query: string;
  category?: string | null;
  budget?: number | null;
  locationArea?: string | null;
  quantity?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  status: string;
  buyerContact: string;
  createdAt: string;
  matches: RequestMatch[];
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New request",
  MATCHED: "Sellers matched",
  CONTACTED: "Seller contacted",
  FULFILLED: "Fulfilled",
  UNFULFILLED: "No match yet",
  CLOSED: "Closed",
};

const STATUS_HELP: Record<string, string> = {
  NEW: "Your request is in the system. Check again to see whether matching sellers have been found.",
  MATCHED: "Potential sellers have been matched to your request. Open their profiles to learn more.",
  CONTACTED: "A seller has been marked as having contacted you. Check the contact details you provided.",
  FULFILLED: "This request has been marked as fulfilled. Need anything else? Start another request.",
  UNFULFILLED: "No suitable seller match has been recorded yet. You can still browse nearby listings or make a clearer new request.",
  CLOSED: "This request is closed. You can still create a new request for another item or service.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestMatch(value: unknown): value is RequestMatch {
  if (!isRecord(value) || !isRecord(value.business)) return false;
  const business = value.business;
  return (
    typeof value.id === "string" &&
    typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    typeof business.id === "string" &&
    typeof business.name === "string" &&
    typeof business.area === "string" &&
    typeof business.verified === "boolean"
  );
}

function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeRequest(value: unknown): RequestRecord | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.requestCode !== "string" ||
    !value.requestCode.trim() ||
    typeof value.query !== "string" ||
    typeof value.status !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  const matches = Array.isArray(value.matches)
    ? value.matches.filter(isRequestMatch)
    : [];

  return {
    id: value.id,
    requestCode: value.requestCode.trim(),
    query: value.query,
    category: typeof value.category === "string" ? value.category : null,
    budget: typeof value.budget === "number" && Number.isFinite(value.budget) ? value.budget : null,
    locationArea: typeof value.locationArea === "string" ? value.locationArea : null,
    quantity: typeof value.quantity === "number" && Number.isFinite(value.quantity) ? value.quantity : null,
    description: typeof value.description === "string" ? value.description : null,
    imageUrl: isSafeHttpUrl(value.imageUrl) ? value.imageUrl : null,
    status: value.status,
    buyerContact: typeof value.buyerContact === "string" ? value.buyerContact : "",
    createdAt: value.createdAt,
    matches,
  };
}

function formatStatus(status: string): string {
  if (STATUS_LABELS[status]) return STATUS_LABELS[status];
  return status.replace(/_/g, " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}

function statusClass(status: string): string {
  switch (status) {
    case "MATCHED": return "border-[#BDE8D8] bg-[#DDF5EA] text-[#237A50]";
    case "CONTACTED": return "border-[#DAD7FF] bg-[#E7E5FF] text-[#5149A5]";
    case "FULFILLED": return "border-[#BDE8D8] bg-[#DDF5EA] text-[#237A50]";
    case "UNFULFILLED": return "border-[#F5C4B3] bg-[#FFE0D6] text-[#9F2D18]";
    case "CLOSED": return "border-[#D9DEE5] bg-[#E4E9EF] text-[#5E6872]";
    default: return "border-[#F0DFA8] bg-[#FFF0C7] text-[#8A6710]";
  }
}

function formatRequestDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNaira(value: number): string {
  return `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function getApiError(data: unknown, fallback: string): string {
  if (isRecord(data) && typeof data.error === "string" && data.error.trim()) return data.error;
  return fallback;
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Attempt the fallback for browsers where the Clipboard API is unavailable.
  }

  let input: HTMLTextAreaElement | null = null;
  try {
    input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input?.remove();
  }
}

/* -----------------------------------------
 * MY REQUESTS PAGE
 * ----------------------------------------- */

export default function MyRequestsPage() {
  const [lookup, setLookup] = useState("");
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const searchRequests = useCallback(async (value: string, keepPreviousResults = false) => {
    if (loading) return;
    const normalizedValue = value.trim();
    setError("");

    if (!normalizedValue) {
      setError("Enter your request code or WhatsApp number.");
      if (!keepPreviousResults) {
        setRequests([]);
        setSearched(false);
      }
      return;
    }

    if (!keepPreviousResults) {
      setRequests([]);
      setSearched(false);
    }

    setLoading(true);
    try {
      // Preserve the existing /api/request lookup contract.
      const isCode = /^RM-[A-Z0-9]{4}$/i.test(normalizedValue);
      const params = new URLSearchParams(
        isCode ? { code: normalizedValue.toUpperCase() } : { contact: normalizedValue },
      );
      const response = await fetch(`/api/request?${params.toString()}`, { cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getApiError(data, "Unable to find your requests."));
      }
      if (!isRecord(data)) {
        throw new Error("The server returned an invalid response.");
      }

      let rawRequests: unknown[] = [];
      if (Array.isArray(data.requests)) rawRequests = data.requests;
      else if (data.request) rawRequests = [data.request];

      const validRequests = rawRequests
        .map(normalizeRequest)
        .filter((request): request is RequestRecord => request !== null)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setRequests(validRequests);
      setSearched(true);
      setLastChecked(new Date().toISOString());
    } catch (lookupError) {
      console.error("Find requests error:", lookupError);
      setError(lookupError instanceof Error ? lookupError.message : "Unable to find your requests.");
      if (!keepPreviousResults) {
        setRequests([]);
        setSearched(false);
      }
    } finally {
      setLoading(false);
    }
  }, [loading]);

  async function findRequests(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await searchRequests(lookup, false);
  }

  const totalMatches = requests.reduce((total, request) => total + request.matches.length, 0);
  const openRequests = requests.filter((request) => !["FULFILLED", "UNFULFILLED", "CLOSED"].includes(request.status)).length;

  return (
    <div className="min-h-dvh w-full overflow-x-clip bg-[#FFF7ED] sm:px-5 sm:py-5">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1500px] flex-col overflow-hidden rounded-none border-0 bg-[#FFFDFC] shadow-none sm:min-h-[calc(100dvh-40px)] sm:rounded-[22px] sm:border sm:border-[#F0DDD4] sm:shadow-sm">
        <header className="flex h-[66px] shrink-0 items-center justify-between gap-2 border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
          <Link href="/" className="shrink-0 text-xl font-black tracking-tight text-[#17202A]" aria-label="ReMarket home">
            Re<span className="text-[#FF5A36]">Market</span>
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-4 lg:flex xl:gap-7">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Requests";
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 whitespace-nowrap text-sm font-semibold transition ${active ? "text-[#FF5A36]" : "text-[#6F675F] hover:text-[#17202A]"}`}>
                  <Icon size={17} />{item.label}
                </Link>
              );
            })}
          </nav>
          <Link href="/request" className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94D2B] sm:px-4 sm:text-sm">
            <Plus size={17} />New request
          </Link>
        </header>

        <div className="flex flex-1">
          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] p-3 lg:block">
            <nav aria-label="Sidebar navigation" className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.label === "Requests";
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? "bg-[#FFE0D6] text-[#9F2D18]" : "text-[#6F675F] hover:bg-white hover:text-[#17202A]"}`}>
                    <Icon size={18} />{item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-8 rounded-2xl border border-[#F1D5C8] bg-[#FFF0D9] p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#FF5A36]"><Clock3 size={18} /></div>
              <p className="mt-3 text-sm font-bold text-[#9F2D18]">Keep your request moving</p>
              <p className="mt-1 text-xs leading-5 text-[#7C5B4E]">Check for seller matches and keep your request code handy.</p>
            </div>
            <div className="mt-3 rounded-2xl border border-[#EAE6DF] bg-white p-4">
              <p className="text-xs font-bold text-[#17202A]">Need something else?</p>
              <Link href="/request" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[#C34429] hover:underline">Create another request <ArrowUpRight size={13} /></Link>
            </div>
          </aside>

          <main className="min-w-0 flex-1 pb-28 lg:pb-8">
            <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#8A8178] transition hover:text-[#17202A]"><ArrowLeft size={16} />Back home</Link>

              <section className="relative mb-6 overflow-hidden rounded-[26px] border border-[#F0D8CC] bg-gradient-to-br from-[#FFF2E9] via-white to-[#FFF8ED] p-5 sm:p-7">
                <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-[#FF5A36]/[0.07]" />
                <div className="pointer-events-none absolute bottom-[-50px] right-28 h-32 w-32 rounded-full bg-[#EABF8F]/[0.12]" />
                <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F1D1C2] bg-white/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.13em] text-[#B94128]"><Sparkles size={13} />Your request tracker</span>
                    <h1 className="mt-3 text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl">Keep an eye on what you need.</h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-[#7C746C]">Look up a request to see its latest status and any sellers matched to it. Come back whenever you need to check for updates.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                    <div className="rounded-2xl border border-white bg-white/85 p-3.5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8A8178]">Requests found</p><p className="mt-1 text-2xl font-black tabular-nums text-[#17202A]">{searched ? requests.length : "—"}</p></div>
                    <div className="rounded-2xl border border-white bg-white/85 p-3.5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8A8178]">Potential matches</p><p className="mt-1 text-2xl font-black tabular-nums text-[#C34429]">{searched ? totalMatches : "—"}</p></div>
                  </div>
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(250px,0.65fr)]">
                <div className="min-w-0">
                  <form onSubmit={findRequests} className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]"><Search size={19} /></div>
                      <div><h2 className="text-sm font-black text-[#17202A]">Find your requests</h2><p className="mt-1 text-xs leading-5 text-[#8A8178]">Use the request code from your confirmation screen or the contact number you submitted.</p></div>
                    </div>
                    <label htmlFor="request-lookup" className="mb-2 block text-sm font-bold text-[#17202A]">Request code or WhatsApp number</label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="relative min-w-0 flex-1">
                        <Search size={18} aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8A8178]" />
                        <input id="request-lookup" name="lookup" type="text" value={lookup} onChange={(event) => setLookup(event.target.value)} autoComplete="off" maxLength={100} placeholder="e.g. RM-7K4P or 08012345678" aria-describedby="request-lookup-help" className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white" />
                      </div>
                      <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#E94D2B] disabled:cursor-not-allowed disabled:opacity-60">
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}{loading ? "Searching..." : "Find requests"}
                      </button>
                    </div>
                    <p id="request-lookup-help" className="mt-2 text-xs leading-5 text-[#8A8178]">Request codes look like <span className="rounded bg-[#FCFAF6] px-1.5 py-0.5 font-bold text-[#6F675F]">RM-7K4P</span>. Contact numbers should match the one you submitted.</p>
                    {error && <div role="alert" aria-live="polite" className="mt-4 flex items-start gap-2 rounded-xl border border-[#F5C4B3] bg-[#FFF0EE] px-4 py-3 text-sm font-medium text-[#9F2D18]"><AlertCircle size={17} className="mt-0.5 shrink-0" /> <span>{error}</span></div>}
                    {lastChecked && searched && <p className="mt-3 text-[11px] text-[#8A8178]">Last checked: {formatRequestDate(lastChecked)}</p>}
                  </form>

                  {searched && requests.length === 0 && !error && (
                    <div className="mt-5 rounded-2xl border border-[#EAE6DF] bg-white p-7 text-center shadow-sm sm:p-9">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0D9] text-[#FF5A36]"><ClipboardList size={25} /></div>
                      <h2 className="mt-4 text-lg font-black text-[#17202A]">No requests found yet</h2>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#8A8178]">Double-check the code or contact number. Use the same number you entered when submitting your request.</p>
                      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row"><button type="button" onClick={() => void searchRequests(lookup, false)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-3 text-sm font-bold text-[#6F675F] hover:bg-[#FCFAF6] disabled:opacity-60"><RefreshCw size={15} />Try again</button><Link href="/request" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-bold text-white hover:bg-[#E94D2B]"><Plus size={16} />Create a request</Link></div>
                    </div>
                  )}

                  {searched && requests.length > 0 && (
                    <section className="mt-5 space-y-4" aria-labelledby="request-results-heading">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#C34429]">Your activity</p><h2 id="request-results-heading" className="mt-1 text-xl font-black text-[#17202A]">Your requests</h2><p className="mt-1 text-xs text-[#8A8178]">{requests.length} {requests.length === 1 ? "request" : "requests"} · {openRequests} still in progress</p></div>
                        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void searchRequests(lookup, true)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2.5 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6] disabled:opacity-60">{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Check for updates</button><Link href="/request" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94D2B]"><Plus size={14} />New request</Link></div>
                      </div>
                      {requests.map((request) => <RequestCard key={request.id} request={request} />)}
                      <div className="rounded-2xl border border-[#F0D8CC] bg-gradient-to-r from-[#FFF4EC] to-[#FFFAF3] p-4 sm:p-5">
                        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#FF5A36]"><Sparkles size={19} /></div><div className="min-w-0"><h3 className="text-sm font-black text-[#17202A]">Still looking for something?</h3><p className="mt-1 text-xs leading-5 text-[#7C746C]">Browse what local sellers have listed, or send a new request if you need a different item or service.</p><div className="mt-3 flex flex-wrap gap-2"><Link href="/shop" className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8DAD2] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] hover:border-[#FF5A36]"><ShoppingBag size={14} />Browse products</Link><Link href="/search" className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8DAD2] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] hover:border-[#FF5A36]"><Search size={14} />Search nearby</Link></div></div></div>
                      </div>
                    </section>
                  )}
                </div>

                <aside className="space-y-4">
                  <section className="rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#DDF5EA] text-[#237A50]"><PackageCheck size={20} /></div>
                    <h2 className="mt-3 text-sm font-black text-[#17202A]">What happens next?</h2>
                    <div className="mt-4 space-y-4">
                      <div className="flex gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0D9] text-[11px] font-black text-[#9F2D18]">1</div><div><p className="text-xs font-bold text-[#17202A]">Your request is recorded</p><p className="mt-1 text-xs leading-5 text-[#8A8178]">Keep your request code so you can find it again.</p></div></div>
                      <div className="flex gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0D9] text-[11px] font-black text-[#9F2D18]">2</div><div><p className="text-xs font-bold text-[#17202A]">Check potential matches</p><p className="mt-1 text-xs leading-5 text-[#8A8178]">Matched seller profiles appear with your request when available.</p></div></div>
                      <div className="flex gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0D9] text-[11px] font-black text-[#9F2D18]">3</div><div><p className="text-xs font-bold text-[#17202A]">Return to check the status</p><p className="mt-1 text-xs leading-5 text-[#8A8178]">Use this page to look up your request again. This page does not send automatic alerts.</p></div></div>
                    </div>
                  </section>
                  <section className="rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-5">
                    <div className="flex items-center gap-2"><CircleHelp size={17} className="text-[#C34429]" /><h2 className="text-sm font-black text-[#17202A]">How to get better matches</h2></div>
                    <p className="mt-2 text-xs leading-5 text-[#8A8178]">Specific details help describe what you need. Include the product name, size or model, your area and a realistic budget when you know it.</p>
                    <Link href="/request" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#B94128] hover:underline">Write a new request <ArrowUpRight size={13} /></Link>
                  </section>
                </aside>
              </div>
            </div>
          </main>
        </div>

        <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#EAE6DF] bg-white/95 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-md items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Requests";
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-w-[60px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-semibold transition ${active ? "bg-[#FFE0D6] text-[#FF5A36]" : "text-[#8A8178] hover:bg-[#FCFAF6]"}`}><Icon size={18} />{item.label}</Link>;
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

/* -----------------------------------------
 * REQUEST STATUS JOURNEY
 * ----------------------------------------- */

function RequestStatusJourney({ status }: { status: string }) {
  const matched = ["MATCHED", "CONTACTED", "FULFILLED"].includes(status);
  const contacted = ["CONTACTED", "FULFILLED"].includes(status);
  const terminal = ["FULFILLED", "UNFULFILLED", "CLOSED"].includes(status);
  const steps = [
    { label: "Request received", done: true },
    { label: "Finding sellers", done: matched, current: status === "NEW" },
    { label: "Seller response", done: contacted, current: status === "MATCHED" },
    { label: status === "FULFILLED" ? "Fulfilled" : status === "UNFULFILLED" ? "No match recorded" : status === "CLOSED" ? "Closed" : "Outcome", done: terminal, current: status === "CONTACTED" },
  ];

  return (
    <div className="mt-4 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-4">
      <div className="mb-3 flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8A8178]">Request journey</p><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(status)}`}>{formatStatus(status)}</span></div>
      <div className="grid grid-cols-4 gap-2">
        {steps.map((step, index) => (
          <div key={step.label} className="min-w-0">
            <div className="flex items-center">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-[#DDF5EA] text-[#237A50]" : step.current ? "bg-[#FFE0D6] text-[#B94128] ring-2 ring-[#FF5A36]/15" : "border border-[#E0DAD3] bg-white text-[#B8AEA4]"}`}>
                {step.done ? <CheckCircle2 size={15} /> : step.current ? <Clock3 size={14} /> : <Circle size={13} />}
              </span>
              {index < steps.length - 1 && <span className={`ml-1 h-px flex-1 ${step.done && steps[index + 1].done ? "bg-[#9DDCC4]" : "bg-[#E5DED7]"}`} />}
            </div>
            <p className={`mt-2 break-words text-[10px] leading-4 ${step.done || step.current ? "font-bold text-[#4F4943]" : "text-[#A69D94]"}`}>{step.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#7C746C]">{STATUS_HELP[status] ?? "Check this request again for the latest status recorded by ReMarket."}</p>
    </div>
  );
}

/* -----------------------------------------
 * REQUEST CARD
 * ----------------------------------------- */

function RequestCard({ request }: { request: RequestRecord }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function handleCopyCode() {
    const didCopy = await copyText(request.requestCode);
    setCopied(didCopy);
    setCopyError(!didCopy);
    if (didCopy) window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white shadow-sm transition hover:border-[#E8C8BA]">
      <div className="border-b border-[#EAE6DF] bg-gradient-to-r from-white to-[#FFFAF5] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-[#EAE6DF] bg-white px-3 py-1.5 text-xs font-black tracking-wide text-[#17202A]">{request.requestCode}</span>
              <button type="button" onClick={() => void handleCopyCode()} className="inline-flex items-center gap-1 rounded-lg border border-[#EAE6DF] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#6F675F] transition hover:border-[#FF5A36] hover:text-[#B94128]" aria-label={`Copy request code ${request.requestCode}`}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy code"}</button>
              <span className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${statusClass(request.status)}`}>{formatStatus(request.status)}</span>
            </div>
            <h2 className="mt-3 break-words text-lg font-black text-[#17202A] sm:text-xl">{request.query}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#8A8178]">
              {request.category && <span className="rounded-md bg-[#FCFAF6] px-2 py-1">{request.category}</span>}
              {request.locationArea && <span className="flex items-center gap-1"><MapPin size={13} />{request.locationArea}</span>}
              {request.quantity != null && <span>{`Qty: ${request.quantity}`}</span>}
              {request.budget != null && <span>{`Budget: ${formatNaira(request.budget)}`}</span>}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#8A8178]"><Clock3 size={13} /><span>Submitted {formatRequestDate(request.createdAt)}</span></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-bold text-[#6F675F]"><Store size={15} className="text-[#FF5A36]" />{request.matches.length} {request.matches.length === 1 ? "potential match" : "potential matches"}</div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <RequestStatusJourney status={request.status} />

        {request.description && <div className="mt-4 rounded-xl border border-[#EAE6DF] bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wide text-[#8A8178]">Your details</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#6F675F]">{request.description}</p></div>}

        {request.imageUrl && <div className="mt-4"><a href={request.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-bold text-[#9F2D18] underline underline-offset-2"><ExternalLink size={14} />View request photo</a></div>}

        <div className="mt-5 border-t border-[#EAE6DF] pt-5">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-[#17202A]">Potential seller matches</h3><p className="mt-1 text-xs text-[#8A8178]">Explore a seller profile to see what they offer.</p></div><span className="rounded-full bg-[#FCFAF6] px-2.5 py-1 text-xs font-bold text-[#6F675F]">{request.matches.length}</span></div>
          {request.matches.length === 0 ? (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-dashed border-[#DDD5CD] bg-[#FCFAF6] p-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#C34429]"><Clock3 size={17} /></div><div><p className="text-sm font-bold text-[#6F675F]">No seller matches yet</p><p className="mt-1 text-xs leading-5 text-[#8A8178]">You can check again later. Adding a clear description, location or budget to a future request may help explain what you need.</p></div></div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {request.matches.slice(0, 6).map((match) => (
                <Link key={match.id} href={`/seller/${encodeURIComponent(match.business.id)}`} className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#EAE6DF] p-3 transition hover:border-[#FF5A36] hover:bg-[#FFF7ED]">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]"><Store size={18} /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#17202A]">{match.business.name}</p><p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[#8A8178]"><MapPin size={12} className="shrink-0" /><span className="truncate">{match.business.area}</span></p></div>
                  {match.business.verified && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#DDF5EA] px-2 py-1 text-[9px] font-bold text-[#237A50]"><CheckCircle2 size={11} />Verified</span>}
                  <ArrowUpRight size={15} className="shrink-0 text-[#A69D94] transition group-hover:text-[#B94128]" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {copyError && <p role="status" className="mt-3 text-xs text-[#9F2D18]">Could not copy automatically. Please select and copy the code.</p>}

        <div className="mt-5 flex flex-col gap-2 border-t border-[#EAE6DF] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-5 text-[#8A8178]">Keep this code to find the same request later.</p>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void handleCopyCode()} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2.5 text-xs font-bold text-[#6F675F] hover:border-[#FF5A36] hover:text-[#B94128]">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Code copied" : "Copy request code"}</button><Link href="/shop" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FF5A36] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#E94D2B]"><ShoppingBag size={14} />Browse products</Link></div>
        </div>
      </div>
    </article>
  );
}
