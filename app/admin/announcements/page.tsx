"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  Bell,
  Check,
  ChevronLeft,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Package,
  Send,
  ShieldCheck,
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
}[] = [
  {
    value: "EVERYONE",
    label: "Everyone",
    description: "Buyers, sellers, and admin accounts.",
    icon: Users,
  },
  {
    value: "BUYERS",
    label: "Buyers",
    description: "Accounts registered as buyers.",
    icon: Users,
  },
  {
    value: "SELLERS",
    label: "Sellers",
    description: "Accounts registered as sellers.",
    icon: Store,
  },
  {
    value: "ADMINS",
    label: "Admins",
    description: "ReMarket administrator accounts.",
    icon: ShieldCheck,
  },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Businesses", href: "/admin/businesses", icon: Store },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Requests", href: "/admin/requests", icon: ClipboardList },
  { label: "Content", href: "/admin/content", icon: Megaphone },
  { label: "Announcements", href: "/admin/announcements", icon: Bell },
  {
    label: "Deletion requests",
    href: "/admin/business-deletion-requests",
    icon: Trash2,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (isRecord(data) && typeof data.error === "string") {
    return data.error;
  }

  return fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

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

function getAudienceLabel(
  audience: Announcement["audience"]
): string {
  return (
    AUDIENCES.find((item) => item.value === audience)?.label ??
    "Selected users"
  );
}

function getPriorityStyle(priority: Priority): string {
  switch (priority) {
    case "LOW":
      return "bg-[#EAE6DF] text-[#6F675F]";
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
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Modern browsers support getRandomValues even where randomUUID
  // is unavailable. Keep this as an RFC 4122 version 4 UUID.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export default function AdminAnnouncementsPage() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("EVERYONE");
  const [priority, setPriority] = useState<Priority>("NORMAL");

  const [audienceCounts, setAudienceCounts] =
    useState<AudienceCounts>(INITIAL_COUNTS);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Reuse this key after uncertain network/server failures. The key is
  // invalidated whenever any payload field is deliberately edited.
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
        throw new Error(
          getErrorMessage(data, "Unable to load announcements.")
        );
      }

      if (
        !isRecord(data) ||
        !Array.isArray(data.announcements) ||
        !isRecord(data.audienceCounts)
      ) {
        throw new Error(
          "The server returned an invalid announcement response."
        );
      }

      const rawCounts = data.audienceCounts;
      const counts: AudienceCounts = {
        EVERYONE:
          typeof rawCounts.EVERYONE === "number" ? rawCounts.EVERYONE : 0,
        BUYERS:
          typeof rawCounts.BUYERS === "number" ? rawCounts.BUYERS : 0,
        SELLERS:
          typeof rawCounts.SELLERS === "number" ? rawCounts.SELLERS : 0,
        ADMINS:
          typeof rawCounts.ADMINS === "number" ? rawCounts.ADMINS : 0,
      };

      setAnnouncements(data.announcements as Announcement[]);
      setAudienceCounts(counts);
    } catch (loadError) {
      console.error("Admin announcements load error:", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load announcements."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

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

    if (audienceCounts[audience] < 1) {
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
      attempt = {
        fingerprint,
        key: createUuid(),
      };
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
        throw new Error(
          getErrorMessage(data, "Unable to send the announcement.")
        );
      }

      if (!isRecord(data) || typeof data.recipientCount !== "number") {
        // Keep the attempt key. If the server committed the send but the
        // response body was malformed, the next attempt can safely retry it.
        throw new Error(
          "The response did not include the recipient count. Retry safely or refresh announcement history before sending again."
        );
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
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send the announcement. Retry using the same details to avoid duplicate sending."
      );
      // Do not clear sendAttemptRef here: retries of identical details
      // reuse the same Idempotency-Key if the original outcome is uncertain.
    } finally {
      setSending(false);
    }
  }

  const selectedCount = audienceCounts[audience];

  return (
    <main className="min-h-screen bg-[#FFF7ED] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:min-h-[calc(100vh-40px)]">
        <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] lg:block">
          <div className="flex h-[66px] items-center border-b border-[#EAE6DF] px-5">
            <Link href="/admin" className="text-xl font-black tracking-tight">
              <span className="text-[#FF5A36]">Re</span>
              <span className="text-[#17202A]">Market</span>
            </Link>
          </div>

          <nav className="space-y-1 p-3">
            <p className="mb-3 px-3 pt-2 text-[11px] font-bold uppercase tracking-wider text-[#A39A91]">
              Admin
            </p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin/announcements";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#FFE0D6] text-[#9F2D18]"
                      : "text-[#6F675F] hover:bg-[#FFF0D9]"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[66px] items-center justify-between border-b border-[#EAE6DF] px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/admin"
                aria-label="Back to admin"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FCFAF6] text-[#6F675F] lg:hidden"
              >
                <ChevronLeft size={18} />
              </Link>
              <div>
                <p className="text-xs font-medium text-[#8A8178]">Admin</p>
                <h1 className="text-lg font-black text-[#17202A]">Announcements</h1>
              </div>
            </div>
            <Link
              href="/"
              className="rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
            >
              Marketplace
            </Link>
          </header>

          <div className="p-4 sm:p-6">
            <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/announcements";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                      active
                        ? "bg-[#FF5A36] text-white"
                        : "bg-[#FCFAF6] text-[#6F675F]"
                    }`}
                  >
                    <Icon size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl">
                  Notify ReMarket users
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#81776F]">
                  Send an in-app announcement to buyers, sellers, admins, or everyone.
                  Sending here does not publish social media content.
                </p>
              </div>
            </div>

            {success && (
              <div role="status" className="mb-5 flex items-center gap-3 rounded-2xl border border-[#BFE3CE] bg-[#EEF9F2] px-4 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D9F1E3] text-[#287A4B]">
                  <Check size={15} />
                </div>
                <p className="min-w-0 flex-1 text-sm font-semibold text-[#287A4B]">{success}</p>
                <button type="button" onClick={() => setSuccess("")} aria-label="Dismiss success message" className="text-[#287A4B]">
                  <X size={16} />
                </button>
              </div>
            )}

            {error && (
              <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#F2C7BC] bg-[#FFF0ED] px-4 py-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#9F2D18]" />
                <p className="min-w-0 flex-1 text-sm font-semibold text-[#9F2D18]">{error}</p>
                <button type="button" onClick={() => setError("")} aria-label="Dismiss error message" className="shrink-0 text-[#9F2D18]">
                  <X size={17} />
                </button>
              </div>
            )}

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
              <section className="min-w-0 rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-6">
                {!confirming ? (
                  <form onSubmit={reviewAnnouncement}>
                    <div className="mb-5 flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]">
                        <Megaphone size={22} />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-[#17202A]">Compose announcement</h3>
                        <p className="mt-1 text-sm leading-5 text-[#81776F]">Review the audience carefully before sending.</p>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <label htmlFor="announcement-title" className="mb-1.5 block text-xs font-bold text-[#6F675F]">Announcement title</label>
                        <input
                          id="announcement-title"
                          required
                          maxLength={TITLE_MAX_LENGTH}
                          value={title}
                          onChange={(event) => updateTitle(event.target.value)}
                          placeholder="e.g. Discover more nearby businesses"
                          className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3.5 text-sm text-[#17202A] outline-none transition focus:border-[#FF5A36]"
                        />
                        <p className="mt-1 text-right text-[11px] text-[#A39A91]">{title.length}/{TITLE_MAX_LENGTH}</p>
                      </div>

                      <div>
                        <label htmlFor="announcement-message" className="mb-1.5 block text-xs font-bold text-[#6F675F]">Message</label>
                        <textarea
                          id="announcement-message"
                          required
                          maxLength={MESSAGE_MAX_LENGTH}
                          rows={6}
                          value={message}
                          onChange={(event) => updateMessage(event.target.value)}
                          placeholder="Write the message users will see in their ReMarket notifications..."
                          className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3.5 py-3 text-sm leading-6 text-[#17202A] outline-none transition focus:border-[#FF5A36]"
                        />
                        <p className="mt-1 text-right text-[11px] text-[#A39A91]">{message.length}/{MESSAGE_MAX_LENGTH}</p>
                      </div>

                      <fieldset>
                        <legend className="mb-2 text-xs font-bold text-[#6F675F]">Who should receive it?</legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {AUDIENCES.map((item) => {
                            const Icon = item.icon;
                            const selected = audience === item.value;
                            return (
                              <label
                                key={item.value}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                                  selected
                                    ? "border-[#FF5A36] bg-[#FFF0ED]"
                                    : "border-[#EAE6DF] bg-[#FCFAF6] hover:bg-[#FFF7ED]"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="announcement-audience"
                                  value={item.value}
                                  checked={selected}
                                  onChange={() => updateAudience(item.value)}
                                  className="mt-1 h-4 w-4 accent-[#FF5A36]"
                                />
                                <Icon size={18} className={`mt-0.5 shrink-0 ${selected ? "text-[#9F2D18]" : "text-[#8A8178]"}`} />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-bold text-[#17202A]">{item.label}</span>
                                  <span className="mt-1 block text-xs leading-5 text-[#81776F]">{item.description}</span>
                                  <span className="mt-2 block text-xs font-extrabold text-[#9F2D18]">
                                    {loading ? "Counting recipients..." : `${formatNumber(audienceCounts[item.value])} eligible`}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#8A8178]">
                          Users who disabled in-app system announcements are excluded. Counts are estimates and may change before sending.
                        </p>
                      </fieldset>

                      <div>
                        <label htmlFor="announcement-priority" className="mb-1.5 block text-xs font-bold text-[#6F675F]">Priority</label>
                        <select
                          id="announcement-priority"
                          value={priority}
                          onChange={(event) => updatePriority(event.target.value as Priority)}
                          className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3.5 text-sm text-[#17202A] outline-none focus:border-[#FF5A36]"
                        >
                          {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                        <p className="mt-1 text-xs leading-5 text-[#8A8178]">Use Critical only when the information genuinely requires urgent attention.</p>
                      </div>
                    </div>

                    <div className="mt-6 border-t border-[#EAE6DF] pt-5">
                      <button
                        type="submit"
                        disabled={loading || sending || !title.trim() || !message.trim() || selectedCount < 1}
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-sm font-extrabold text-white transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                      >
                        <Send size={16} />
                        Review announcement
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <div className="mb-5 flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]"><ShieldCheck size={22} /></div>
                      <div>
                        <h3 className="text-lg font-black text-[#17202A]">Confirm before sending</h3>
                        <p className="mt-1 text-sm leading-5 text-[#81776F]">This action creates an in-app notification for each eligible recipient.</p>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">Title</p>
                        <p className="mt-1 break-words font-bold text-[#17202A]">{title.trim()}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">Message</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#6F675F]">{message.trim()}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#EAE6DF] bg-white px-3 py-1.5 text-xs font-bold text-[#6F675F]">{getAudienceLabel(audience)}</span>
                        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${getPriorityStyle(priority)}`}>{priority} priority</span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-[#EAE6DF] p-4">
                      <p className="text-xs font-bold text-[#6F675F]">Estimated recipients</p>
                      <p className="mt-1 text-3xl font-black tracking-tight text-[#17202A]">{formatNumber(selectedCount)}</p>
                      <p className="mt-1 text-xs leading-5 text-[#81776F]">The server recalculates recipients when you send. This message will not be published on social platforms.</p>
                    </div>

                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => { setConfirming(false); clearMessages(); }}
                        className="h-11 rounded-xl border border-[#EAE6DF] bg-white px-5 text-sm font-bold text-[#6F675F] transition hover:bg-[#FCFAF6] disabled:opacity-50"
                      >Back to edit</button>
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void sendAnnouncement()}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-sm font-extrabold text-white transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {sending ? "Sending..." : "Confirm and send"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <aside className="min-w-0 space-y-5">
                <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FCFAF6] text-[#6F675F]"><Bell size={20} /></div>
                    <div>
                      <h3 className="font-black text-[#17202A]">What this sends</h3>
                      <p className="mt-1 text-sm leading-6 text-[#81776F]">Each eligible user receives the title and message in their ReMarket in-app notification list.</p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-[#EAE6DF] pt-4">
                    <p className="text-xs leading-5 text-[#8A8178]">Push notifications, email, WhatsApp and SMS are not sent by this page. It does not publish content on social media.</p>
                  </div>
                </section>

                <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><History size={18} className="text-[#FF5A36]" /><h3 className="font-black text-[#17202A]">Announcement history</h3></div>
                    <button type="button" disabled={loading} onClick={() => void loadAnnouncements()} aria-label="Refresh announcement history" className="rounded-lg border border-[#EAE6DF] p-2 text-[#6F675F] transition hover:bg-[#FCFAF6] disabled:opacity-50">
                      {loading ? <Loader2 size={15} className="animate-spin" /> : <History size={15} />}
                    </button>
                  </div>

                  {loading ? (
                    <div className="py-10 text-center">
                      <Loader2 size={24} className="mx-auto animate-spin text-[#FF5A36]" />
                      <p className="mt-3 text-sm text-[#8A8178]">Loading announcement history...</p>
                    </div>
                  ) : announcements.length === 0 ? (
                    <div className="rounded-xl bg-[#FCFAF6] px-4 py-8 text-center">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]"><FileText size={21} /></div>
                      <p className="mt-3 text-sm font-bold text-[#17202A]">No announcements yet</p>
                      <p className="mt-1 text-xs leading-5 text-[#8A8178]">Sent announcements will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {announcements.map((announcement) => (
                        <article key={announcement.id} className="rounded-xl border border-[#EAE6DF] p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#DDF5EA] px-2.5 py-1 text-[10px] font-extrabold text-[#137A59]">In-app</span>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${getPriorityStyle(announcement.priority)}`}>{announcement.priority}</span>
                          </div>
                          <h4 className="mt-3 break-words text-sm font-black text-[#17202A]">{announcement.title}</h4>
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[#6F675F]">{announcement.message.length > 180 ? `${announcement.message.slice(0, 180)}…` : announcement.message}</p>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#EAE6DF] pt-3">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6F675F]"><Users size={13} />{formatNumber(announcement.recipientCount)} recipients</span>
                            <span className="text-[10px] text-[#A39A91]">{getAudienceLabel(announcement.audience)}</span>
                          </div>
                          <p className="mt-2 text-[10px] leading-4 text-[#A39A91]">Sent {formatDate(announcement.createdAt)}{announcement.createdBy?.name ? ` · By ${announcement.createdBy.name}` : ""}</p>
                        </article>
                      ))}
                    </div>
                  )}
                  <p className="mt-4 text-[11px] leading-5 text-[#A39A91]">Showing up to 25 recent announcements.</p>
                </section>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
