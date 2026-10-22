"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  Bell,
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Package,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Users,
  X,
} from "lucide-react";

type Audience = "EVERYONE" | "BUYERS" | "SELLERS" | "ADMINS";
type Priority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

type Announcement = {
  id: string;
  title: string;
  message: string;
  audience: Audience | "SELECTED_USERS";
  priority: Priority;
  createdAt: string;
  recipientCount: number;
  createdBy: {
    id: string;
    name: string | null;
  };
};

type AudienceCounts = Record<Audience, number>;

type AnnouncementPayload = {
  title: string;
  message: string;
  audience: Audience;
  priority: Priority;
};

type SendAttempt = {
  fingerprint: string;
  key: string;
};

const INITIAL_COUNTS: AudienceCounts = {
  EVERYONE: 0,
  BUYERS: 0,
  SELLERS: 0,
  ADMINS: 0,
};

const TITLE_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 5000;

const AUDIENCES: {
  value: Audience;
  label: string;
  description: string;
  icon: typeof Users;
  tone: string;
  selectedTone: string;
}[] = [
  {
    value: "EVERYONE",
    label: "Everyone",
    description: "All eligible ReMarket accounts.",
    icon: Users,
    tone: "bg-[#E8F0FF] text-[#315DA8]",
    selectedTone: "border-[#9CB9F5] bg-[#F0F5FF]",
  },
  {
    value: "BUYERS",
    label: "Buyers",
    description: "People looking for nearby products and services.",
    icon: Search,
    tone: "bg-[#E1F5EA] text-[#1D8057]",
    selectedTone: "border-[#91D7B4] bg-[#F0FBF5]",
  },
  {
    value: "SELLERS",
    label: "Sellers",
    description: "Businesses sharing products on ReMarket.",
    icon: Store,
    tone: "bg-[#FFE5DC] text-[#A63E25]",
    selectedTone: "border-[#FFB29C] bg-[#FFF4F0]",
  },
  {
    value: "ADMINS",
    label: "Admins",
    description: "ReMarket administrator accounts.",
    icon: ShieldCheck,
    tone: "bg-[#F0E8FF] text-[#7650B5]",
    selectedTone: "border-[#CBB4F6] bg-[#F8F4FF]",
  },
];

const PRIORITIES: { value: Priority; label: string; description: string }[] = [
  { value: "LOW", label: "Low", description: "Helpful, non-urgent updates" },
  { value: "NORMAL", label: "Normal", description: "Everyday announcements" },
  { value: "HIGH", label: "High", description: "Important information" },
  { value: "CRITICAL", label: "Critical", description: "Urgent, action-worthy alerts" },
];

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Content", href: "/admin/content", icon: Megaphone },
  { label: "Announcements", href: "/admin/announcements", icon: Bell },
  { label: "Deletion requests", href: "/admin/business-deletion-requests", icon: Trash2 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (isRecord(data) && typeof data.error === "string") return data.error;
  return fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-NG").format(value);
}

function getAudienceLabel(audience: Announcement["audience"]): string {
  return AUDIENCES.find((item) => item.value === audience)?.label ?? "Selected users";
}

function getPriorityStyle(priority: Priority): string {
  switch (priority) {
    case "LOW":
      return "bg-[#ECE9E4] text-[#6F675F]";
    case "HIGH":
      return "bg-[#FFF0C7] text-[#8A671D]";
    case "CRITICAL":
      return "bg-[#FFE0D6] text-[#9F2D18]";
    default:
      return "bg-[#DDF5EA] text-[#137A59]";
  }
}

function makeFingerprint(payload: AnnouncementPayload): string {
  return JSON.stringify({
    title: payload.title,
    message: payload.message,
    audience: payload.audience,
    priority: payload.priority,
  });
}

function createUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

function SectionHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon: typeof Bell;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0E8] text-[#9F2D18]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        {eyebrow && <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#A39A91]">{eyebrow}</p>}
        <h2 className="text-base font-black tracking-tight text-[#17202A] sm:text-lg">{title}</h2>
        {description && <p className="mt-1 text-xs leading-5 text-[#81776F]">{description}</p>}
      </div>
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("EVERYONE");
  const [priority, setPriority] = useState<Priority>("NORMAL");

  const [audienceCounts, setAudienceCounts] = useState<AudienceCounts>(INITIAL_COUNTS);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [historySearch, setHistorySearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const sendAttemptRef = useRef<SendAttempt | null>(null);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/announcements", {
        method: "GET",
        cache: "no-store",
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Unable to load announcements."));
      }

      if (!isRecord(data) || !Array.isArray(data.announcements) || !isRecord(data.audienceCounts)) {
        throw new Error("The server returned an invalid announcement response.");
      }

      const rawCounts = data.audienceCounts;
      const counts: AudienceCounts = {
        EVERYONE: typeof rawCounts.EVERYONE === "number" ? rawCounts.EVERYONE : 0,
        BUYERS: typeof rawCounts.BUYERS === "number" ? rawCounts.BUYERS : 0,
        SELLERS: typeof rawCounts.SELLERS === "number" ? rawCounts.SELLERS : 0,
        ADMINS: typeof rawCounts.ADMINS === "number" ? rawCounts.ADMINS : 0,
      };

      setAnnouncements(data.announcements as Announcement[]);
      setAudienceCounts(counts);
    } catch (loadError) {
      console.error("Admin announcements load error:", loadError);
      setError(loadError instanceof Error ? loadError.message : "Unable to load announcements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  const selectedCount = audienceCounts[audience];
  const filteredAnnouncements = useMemo(() => {
    const normalized = historySearch.trim().toLowerCase();
    if (!normalized) return announcements;
    return announcements.filter((item) =>
      `${item.title} ${item.message} ${getAudienceLabel(item.audience)} ${item.priority} ${item.createdBy?.name ?? ""}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [announcements, historySearch]);

  const completionChecks = [
    { label: "Add a clear title", done: title.trim().length >= 5 },
    { label: "Write the message", done: message.trim().length >= 20 },
    { label: "Choose an audience", done: selectedCount > 0 && !loading },
    { label: "Review delivery details", done: confirming },
  ];
  const completion = Math.round((completionChecks.filter((item) => item.done).length / completionChecks.length) * 100);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function invalidateSendAttempt() {
    sendAttemptRef.current = null;
  }

  function updateTitle(value: string) {
    invalidateSendAttempt();
    setTitle(value);
  }

  function updateMessage(value: string) {
    invalidateSendAttempt();
    setMessage(value);
  }

  function updateAudience(value: Audience) {
    invalidateSendAttempt();
    setAudience(value);
  }

  function updatePriority(value: Priority) {
    invalidateSendAttempt();
    setPriority(value);
  }

  function reviewAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearMessages();
    if (sending) return;
    if (!title.trim()) {
      setError("Enter an announcement title.");
      return;
    }
    if (!message.trim()) {
      setError("Enter an announcement message.");
      return;
    }
    if (loading) {
      setError("Wait until recipient counts finish loading before sending.");
      return;
    }
    if (selectedCount < 1) {
      setError("There are currently no eligible recipients for this audience.");
      return;
    }
    setConfirming(true);
  }

  async function sendAnnouncement() {
    if (sending || !confirming) return;
    clearMessages();
    setSending(true);

    const payload: AnnouncementPayload = {
      title: title.trim(),
      message: message.trim(),
      audience,
      priority,
    };
    const fingerprint = makeFingerprint(payload);
    let attempt = sendAttemptRef.current;
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = { fingerprint, key: createUuid() };
      sendAttemptRef.current = attempt;
    }

    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.key,
        },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Unable to send the announcement."));
      }

      if (!isRecord(data) || typeof data.recipientCount !== "number") {
        throw new Error("The response did not include the recipient count. Refresh announcement history before sending again.");
      }

      const sentCount = data.recipientCount;
      const alreadySent = data.alreadySent === true;
      setSuccess(
        alreadySent
          ? `This announcement had already been sent. Confirmed ${formatNumber(sentCount)} ${sentCount === 1 ? "recipient" : "recipients"}.`
          : `Announcement sent successfully to ${formatNumber(sentCount)} ${sentCount === 1 ? "recipient" : "recipients"}.`
      );
      setTitle("");
      setMessage("");
      setAudience("EVERYONE");
      setPriority("NORMAL");
      setConfirming(false);
      invalidateSendAttempt();
      await loadAnnouncements();
    } catch (sendError) {
      console.error("Admin announcement send error:", sendError);
      setError(sendError instanceof Error ? sendError.message : "Unable to send the announcement. Retry using the same details to avoid duplicate sending.");
      // Keep the idempotency key after uncertain failures so the same payload can be retried safely.
    } finally {
      setSending(false);
    }
  }

  const selectedAudience = AUDIENCES.find((item) => item.value === audience) ?? AUDIENCES[0];
  const SelectedAudienceIcon = selectedAudience.icon;

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F6F1EB] text-[#17202A]">
      <div className="flex min-h-dvh w-full">
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col bg-[#172630] text-white lg:flex">
          <div className="border-b border-white/10 px-6 py-6">
            <Link href="/admin" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FF5A36] text-sm font-black text-white shadow-lg shadow-[#FF5A36]/20">R</span>
              <span>
                <span className="block text-lg font-black tracking-tight">ReMarket</span>
                <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.19em] text-white/45">Admin workspace</span>
              </span>
            </Link>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/35">Workspace</p>
            <div className="space-y-1.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/announcements";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-bold transition ${active ? "bg-[#FF5A36] text-white shadow-lg shadow-black/10" : "text-white/65 hover:bg-white/8 hover:text-white"}`}
                  >
                    <Icon size={17} />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {active && <ChevronRight size={15} />}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="m-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-[#FF9A7F]"><Sparkles size={16} /><span className="text-[11px] font-extrabold">Thoughtful communication</span></div>
            <p className="mt-2 text-xs leading-5 text-white/55">Keep announcements clear, useful, and relevant to the people receiving them.</p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-[#E8DFD5] bg-[#FFFDFC]/95 px-4 backdrop-blur-md sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" aria-label="Back to admin" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F4EEE7] text-[#6F675F] lg:hidden">
                <ChevronRight className="rotate-180" size={18} />
              </Link>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A39A91]">Admin / Communications</p>
                <h1 className="truncate text-base font-black text-[#17202A] sm:text-lg">Announcement studio</h1>
              </div>
            </div>
            <Link href="/" className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#E8DFD5] bg-white px-3 py-2 text-[11px] font-bold text-[#6F675F] transition hover:border-[#FFB49F] hover:text-[#9F2D18] sm:px-4 sm:text-xs">Marketplace <ChevronRight size={14} /></Link>
          </header>

          <nav aria-label="Admin navigation" className="sticky top-[68px] z-20 border-b border-[#E8DFD5] bg-[#F6F1EB]/95 px-3 py-2 backdrop-blur-md lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/announcements";
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-[11px] font-bold ${active ? "bg-[#FF5A36] text-white shadow-sm" : "bg-white text-[#6F675F]"}`}>
                    <Icon size={14} />{item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="w-full min-w-0 px-3 py-4 sm:px-5 sm:py-6 xl:px-8 xl:py-8 2xl:px-10">
            <section className="relative isolate overflow-hidden rounded-[28px] bg-[#172630] px-5 py-6 text-white shadow-xl shadow-[#172630]/10 sm:px-7 sm:py-8 xl:px-9 xl:py-10">
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border-[36px] border-[#FF5A36]/20" />
              <div aria-hidden="true" className="pointer-events-none absolute right-28 top-16 h-20 w-20 rounded-full bg-[#FF5A36]/20 blur-2xl" />
              <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-end">
                <div className="min-w-0">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#FFC0AE]"><Sparkles size={13} /> ReMarket communications</div>
                  <h2 className="max-w-3xl text-3xl font-black leading-[1.05] tracking-tight sm:text-4xl xl:text-5xl">Say something <span className="text-[#FF8B6D]">worth opening.</span></h2>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">Create useful in-app announcements, choose the right audience, and preview exactly what your message will look like before you send it.</p>
                  <a href="#announcement-composer" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-xs font-extrabold text-white shadow-lg shadow-black/15 transition hover:bg-[#F04F2D]">Create announcement <Send size={15} /></a>
                </div>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
                  <div className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-white/55"><Users size={15} /><span className="text-[10px] font-bold uppercase tracking-wide">Selected audience</span></div>
                    <p className="mt-2 text-3xl font-black tracking-tight">{loading ? "—" : formatNumber(selectedCount)}</p>
                    <p className="mt-1 text-[11px] text-white/50">eligible recipients estimated</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-white/55"><History size={15} /><span className="text-[10px] font-bold uppercase tracking-wide">Recent history</span></div>
                    <p className="mt-2 text-3xl font-black tracking-tight">{loading ? "—" : formatNumber(announcements.length)}</p>
                    <p className="mt-1 text-[11px] text-white/50">announcements returned by API</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {AUDIENCES.map((item) => {
                const Icon = item.icon;
                const active = audience === item.value;
                return (
                  <button key={item.value} type="button" onClick={() => updateAudience(item.value)} className={`group min-w-0 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${active ? `${item.selectedTone} shadow-sm` : "border-[#E8DFD5] bg-[#FFFDFC] hover:border-[#D7C9BC]"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}><Icon size={17} /></span>
                      {active && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FF5A36] text-white"><Check size={12} /></span>}
                    </div>
                    <p className="mt-3 truncate text-sm font-black text-[#17202A]">{item.label}</p>
                    <p className="mt-1 text-2xl font-black tracking-tight text-[#17202A]">{loading ? "—" : formatNumber(audienceCounts[item.value])}</p>
                    <p className="mt-1 text-[10px] font-semibold text-[#8A8178]">eligible accounts</p>
                  </button>
                );
              })}
            </div>

            {success && (
              <div role="status" className="mt-5 flex items-start gap-3 rounded-2xl border border-[#BFE3CE] bg-[#EEF9F2] px-4 py-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#D9F1E3] text-[#287A4B]"><Check size={16} /></div>
                <p className="min-w-0 flex-1 pt-1 text-sm font-bold text-[#287A4B]">{success}</p>
                <button type="button" onClick={() => setSuccess("")} aria-label="Dismiss success message" className="rounded-lg p-1 text-[#287A4B] hover:bg-[#D9F1E3]"><X size={16} /></button>
              </div>
            )}
            {error && (
              <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-[#F2C7BC] bg-[#FFF0ED] px-4 py-3.5">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#9F2D18]" />
                <p className="min-w-0 flex-1 text-sm font-semibold text-[#9F2D18]">{error}</p>
                <button type="button" onClick={() => setError("")} aria-label="Dismiss error message" className="shrink-0 rounded-lg p-1 text-[#9F2D18] hover:bg-[#FFE0D6]"><X size={17} /></button>
              </div>
            )}

            <div className="mt-6 grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] 2xl:gap-7">
              <section id="announcement-composer" className="min-w-0 scroll-mt-36 overflow-hidden rounded-[24px] border border-[#E8DFD5] bg-[#FFFDFC] shadow-sm">
                <div className="border-b border-[#EEE5DC] px-4 py-5 sm:px-6">
                  <div className="flex items-start justify-between gap-3">
                    <SectionHeading eyebrow="Compose · step 01" title={confirming ? "Ready for final review" : "Build your announcement"} description={confirming ? "Check the audience and message before committing." : "A few clear details help users understand what matters."} icon={confirming ? ShieldCheck : Megaphone} />
                    <span className="shrink-0 rounded-xl bg-[#F6F1EB] px-2.5 py-1.5 text-[10px] font-extrabold text-[#6F675F]">{completion}% ready</span>
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#F0E8DF]"><div className="h-full rounded-full bg-gradient-to-r from-[#FF7E5F] to-[#FF5A36] transition-all duration-300" style={{ width: `${completion}%` }} /></div>
                </div>

                {!confirming ? (
                  <form onSubmit={reviewAnnouncement} className="space-y-6 p-4 sm:p-6">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <label htmlFor="announcement-title" className="text-xs font-extrabold text-[#51473F]">Announcement title</label>
                        <span className={`text-[10px] font-bold ${title.length > TITLE_MAX_LENGTH - 15 ? "text-[#B42318]" : "text-[#A39A91]"}`}>{title.length}/{TITLE_MAX_LENGTH}</span>
                      </div>
                      <input id="announcement-title" required maxLength={TITLE_MAX_LENGTH} value={title} onChange={(event) => updateTitle(event.target.value)} placeholder="e.g. More nearby finds are waiting for you" className="h-12 w-full min-w-0 rounded-xl border border-[#E8DFD5] bg-[#FBF8F4] px-3.5 text-sm text-[#17202A] outline-none transition placeholder:text-[#B9AFA4] focus:border-[#FF8B6D] focus:bg-white focus:ring-4 focus:ring-[#FF5A36]/10" />
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <label htmlFor="announcement-message" className="text-xs font-extrabold text-[#51473F]">Message</label>
                        <span className={`text-[10px] font-bold ${message.length > MESSAGE_MAX_LENGTH - 200 ? "text-[#B42318]" : "text-[#A39A91]"}`}>{message.length.toLocaleString("en-NG")}/{MESSAGE_MAX_LENGTH.toLocaleString("en-NG")}</span>
                      </div>
                      <textarea id="announcement-message" required maxLength={MESSAGE_MAX_LENGTH} rows={7} value={message} onChange={(event) => updateMessage(event.target.value)} placeholder="Write a useful, friendly message. Be clear about what users should know or do next..." className="min-h-[170px] w-full min-w-0 resize-y rounded-xl border border-[#E8DFD5] bg-[#FBF8F4] px-3.5 py-3 text-sm leading-6 text-[#17202A] outline-none transition placeholder:text-[#B9AFA4] focus:border-[#FF8B6D] focus:bg-white focus:ring-4 focus:ring-[#FF5A36]/10" />
                      <div className="mt-2 flex flex-wrap items-start justify-between gap-2 text-[10px] leading-5 text-[#988D82]"><span>Tip: put the most important information first.</span><span>In-app message only</span></div>
                    </div>

                    <fieldset>
                      <legend className="mb-2 text-xs font-extrabold text-[#51473F]">Choose the audience</legend>
                      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                        {AUDIENCES.map((item) => {
                          const Icon = item.icon;
                          const selected = audience === item.value;
                          return (
                            <label key={item.value} className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${selected ? item.selectedTone : "border-[#E8DFD5] bg-white hover:border-[#D7C9BC] hover:bg-[#FBF8F4]"}`}>
                              <input type="radio" name="announcement-audience" value={item.value} checked={selected} onChange={() => updateAudience(item.value)} className="mt-1 h-4 w-4 shrink-0 accent-[#FF5A36]" />
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.tone}`}><Icon size={17} /></span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center justify-between gap-1"><span className="text-sm font-black text-[#17202A]">{item.label}</span><span className="text-xs font-black text-[#9F2D18]">{loading ? "—" : formatNumber(audienceCounts[item.value])}</span></span>
                                <span className="mt-1 block text-[11px] leading-5 text-[#81776F]">{item.description}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[10px] leading-5 text-[#8A8178]">Recipient counts are estimates. Users who disabled in-app system announcements are excluded when supported by the server; the server recalculates the final recipient list before sending.</p>
                    </fieldset>

                    <fieldset>
                      <legend className="mb-2 text-xs font-extrabold text-[#51473F]">Set priority</legend>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {PRIORITIES.map((item) => {
                          const selected = priority === item.value;
                          return (
                            <button key={item.value} type="button" onClick={() => updatePriority(item.value)} aria-pressed={selected} className={`min-w-0 rounded-xl border px-3 py-3 text-left transition ${selected ? "border-[#FF9A80] bg-[#FFF0E9] shadow-sm" : "border-[#E8DFD5] bg-white hover:bg-[#FBF8F4]"}`}>
                              <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold ${getPriorityStyle(item.value)}`}>{item.label}</span>
                              <span className="mt-2 block text-[10px] leading-4 text-[#81776F]">{item.description}</span>
                            </button>
                          );
                        })}
                      </div>
                      {priority === "CRITICAL" && <p className="mt-2 rounded-xl border border-[#F2C7BC] bg-[#FFF4F1] px-3 py-2 text-[11px] leading-5 text-[#9F2D18]">Critical priority should be reserved for genuinely urgent information.</p>}
                    </fieldset>

                    <div className="flex flex-col gap-3 border-t border-[#EEE5DC] pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-[11px] leading-5 text-[#8A8178]">You will review the final message before sending.</p>
                      <button type="submit" disabled={loading || sending || !title.trim() || !message.trim() || selectedCount < 1} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#FF5A36]/15 transition hover:-translate-y-0.5 hover:bg-[#E94B2D] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
                        Review announcement <ChevronRight size={16} />
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-4 sm:p-6">
                    <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#CBE7D7] bg-[#F1FBF5] px-3.5 py-3 text-xs font-bold text-[#287A4B]"><ShieldCheck size={17} /> Final review · ready to send</div>
                    <div className="rounded-2xl border border-[#E8DFD5] bg-[#FBF8F4] p-4 sm:p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FF5A36] text-white"><Bell size={19} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-extrabold uppercase tracking-wide text-[#9F2D18]">ReMarket notice</span><span className={`rounded-full px-2 py-1 text-[9px] font-extrabold ${getPriorityStyle(priority)}`}>{priority}</span></div>
                          <h3 className="mt-2 break-words text-lg font-black text-[#17202A]">{title.trim()}</h3>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#62584F]">{message.trim()}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-[#E8DFD5] p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-[#968B80]">Audience</p><p className="mt-1 text-sm font-black text-[#17202A]">{getAudienceLabel(audience)}</p></div>
                      <div className="rounded-2xl border border-[#E8DFD5] p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-[#968B80]">Estimated reach</p><p className="mt-1 text-2xl font-black text-[#17202A]">{formatNumber(selectedCount)}</p></div>
                    </div>
                    <p className="mt-4 text-[11px] leading-5 text-[#8A8178]">The server recalculates recipients when you send. This creates in-app notifications only; it does not send push notifications, email, SMS or WhatsApp messages.</p>
                    <div className="mt-6 flex flex-col-reverse gap-2 border-t border-[#EEE5DC] pt-5 sm:flex-row sm:justify-end">
                      <button type="button" disabled={sending} onClick={() => { setConfirming(false); clearMessages(); }} className="min-h-11 rounded-xl border border-[#E8DFD5] bg-white px-5 text-sm font-bold text-[#6F675F] transition hover:bg-[#F6F1EB] disabled:opacity-50">Back to edit</button>
                      <button type="button" disabled={sending || selectedCount < 1} onClick={() => void sendAnnouncement()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-sm font-extrabold text-white shadow-lg shadow-[#FF5A36]/15 transition hover:bg-[#E94B2D] disabled:cursor-not-allowed disabled:opacity-60">
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {sending ? "Sending announcement…" : "Confirm and send"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <aside className="min-w-0 space-y-5">
                <section className="overflow-hidden rounded-[24px] border border-[#E8DFD5] bg-[#FFFDFC] shadow-sm">
                  <div className="border-b border-[#EEE5DC] px-4 py-4 sm:px-5">
                    <SectionHeading eyebrow="Live preview" title="The message in context" description="This preview updates while you compose." icon={Radio} />
                  </div>
                  <div className="p-4 sm:p-5">
                    <div className="mx-auto max-w-[440px] overflow-hidden rounded-[25px] border border-[#E8DFD5] bg-[#F7F3ED] p-3 shadow-inner">
                      <div className="rounded-[19px] bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-2.5 border-b border-[#F0ECE6] pb-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF5A36] text-white"><Bell size={17} /></div>
                          <div className="min-w-0 flex-1"><p className="text-xs font-black text-[#17202A]">ReMarket</p><p className="mt-0.5 text-[10px] text-[#A39A91]">In-app announcement · just now</p></div>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-extrabold ${getPriorityStyle(priority)}`}>{priority}</span>
                        </div>
                        <p className="mt-4 break-words text-sm font-black leading-5 text-[#17202A]">{title.trim() || "Your announcement title appears here"}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[#6F675F]">{message.trim() || "Your message will appear here. Keep it clear and useful for the people receiving it."}</p>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#F0ECE6] pt-3"><span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#6F675F]"><Users size={12} />{getAudienceLabel(audience)}</span><span className="text-[10px] font-bold text-[#9F2D18]">{loading ? "Counting…" : `${formatNumber(selectedCount)} eligible`}</span></div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl bg-[#F6F1EB] p-4">
                      <div className="flex items-center justify-between gap-3"><p className="text-xs font-black text-[#17202A]">Readiness checklist</p><span className="text-xs font-black text-[#9F2D18]">{completion}%</span></div>
                      <div className="mt-3 space-y-2.5">
                        {completionChecks.map((item) => (
                          <div key={item.label} className="flex items-center gap-2.5 text-xs"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${item.done ? "bg-[#DDF5EA] text-[#137A59]" : "bg-white text-[#B7ADA2]"}`}>{item.done ? <Check size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span><span className={item.done ? "font-bold text-[#51473F]" : "text-[#8A8178]"}>{item.label}</span></div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[24px] border border-[#E8DFD5] bg-white p-4 sm:p-5">
                  <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F0FF] text-[#315DA8]"><ShieldCheck size={19} /></div><div><h3 className="text-sm font-black text-[#17202A]">Know what you are sending</h3><p className="mt-1 text-xs leading-5 text-[#81776F]">This tool creates announcements inside ReMarket. It does not publish social content or automatically send external messages.</p></div></div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-bold"><div className="rounded-xl bg-[#F6F1EB] px-3 py-2.5 text-[#6F675F]">In-app notification <Check className="ml-1 inline h-3 w-3 text-[#287A4B]" /></div><div className="rounded-xl bg-[#F6F1EB] px-3 py-2.5 text-[#6F675F]">Email / SMS <X className="ml-1 inline h-3 w-3 text-[#9F2D18]" /></div></div>
                </section>

                <section className="min-w-0 overflow-hidden rounded-[24px] border border-[#E8DFD5] bg-[#FFFDFC] shadow-sm">
                  <div className="border-b border-[#EEE5DC] p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <SectionHeading eyebrow="Recent activity" title="Announcement history" description="Review recent messages that have already been sent." icon={History} />
                      <button type="button" disabled={loading} onClick={() => void loadAnnouncements()} aria-label="Refresh announcement history" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8DFD5] bg-white text-[#6F675F] transition hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:opacity-50">{loading ? <Loader2 size={15} className="animate-spin" /> : <History size={15} />}</button>
                    </div>
                    <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39A91]" /><input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search recent announcements" aria-label="Search announcement history" className="h-10 w-full rounded-xl border border-[#E8DFD5] bg-[#FBF8F4] pl-9 pr-3 text-xs outline-none focus:border-[#FF8B6D]" /></div>
                  </div>
                  <div className="max-h-[850px] space-y-3 overflow-y-auto p-3 sm:p-4">
                    {loading ? (
                      <div className="py-10 text-center"><Loader2 size={24} className="mx-auto animate-spin text-[#FF5A36]" /><p className="mt-3 text-xs text-[#8A8178]">Loading announcement history…</p></div>
                    ) : filteredAnnouncements.length === 0 ? (
                      <div className="rounded-2xl bg-[#F6F1EB] px-4 py-9 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]"><FileText size={21} /></div><p className="mt-3 text-sm font-black text-[#17202A]">{historySearch ? "No matching announcements" : "No announcements yet"}</p><p className="mt-1 text-xs leading-5 text-[#8A8178]">{historySearch ? "Try a different title, message or audience." : "After the first send, recent announcements will appear here."}</p></div>
                    ) : (
                      filteredAnnouncements.map((announcement) => (
                        <article key={announcement.id} className="rounded-2xl border border-[#E8DFD5] bg-white p-3.5 transition hover:border-[#D6C7B9] hover:shadow-sm sm:p-4">
                          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#DDF5EA] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide text-[#137A59]">In-app</span><span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold ${getPriorityStyle(announcement.priority)}`}>{announcement.priority}</span><span className="ml-auto text-[10px] text-[#A39A91]">{formatDate(announcement.createdAt)}</span></div>
                          <h3 className="mt-3 break-words text-sm font-black text-[#17202A]">{announcement.title}</h3>
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[#6F675F]">{announcement.message.length > 170 ? `${announcement.message.slice(0, 170)}…` : announcement.message}</p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#F0ECE6] pt-3"><span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#6F675F]"><Users size={12} />{formatNumber(announcement.recipientCount)} recipients</span><span className="rounded-full bg-[#F6F1EB] px-2.5 py-1 text-[9px] font-bold text-[#6F675F]">{getAudienceLabel(announcement.audience)}</span></div>
                          {announcement.createdBy?.name && <p className="mt-2 text-[10px] text-[#A39A91]">Created by {announcement.createdBy.name}</p>}
                        </article>
                      ))
                    )}
                  </div>
                  <div className="border-t border-[#EEE5DC] px-4 py-3 text-[10px] text-[#A39A91]">Showing up to 25 recent announcements, as returned by the API.</div>
                </section>
              </aside>
            </div>

            <footer className="mt-8 flex flex-col gap-2 border-t border-[#E4DBD0] py-5 text-[10px] leading-5 text-[#A39A91] sm:flex-row sm:items-center sm:justify-between"><span className="inline-flex items-center gap-2"><ShieldCheck size={13} /> Admin communication tools · Review before sending</span><span>Recipient counts are estimates and may change before delivery.</span></footer>
          </div>
        </section>
      </div>
    </main>
  );
}
