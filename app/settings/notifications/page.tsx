"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Bell, CheckCircle2, Info, Loader2, Mail, Radio, ShieldCheck, UserRound } from "lucide-react";
import BrowserPushControl from "@/components/notifications/BrowserPushControl";

type Channel = "inApp" | "email" | "push";
type Preference = {
  notificationType: string;
  inApp: boolean;
  push: boolean;
  email: boolean;
  customized: boolean;
  updatedAt: string | null;
};
type ApiResponse = { error?: unknown; preferences?: unknown; preference?: unknown };

const GROUP_ORDER = ["Orders and delivery", "Product reviews", "Marketplace activity", "Requests", "Service bookings", "ReMarket announcements", "Account and other updates"];
const CHANNELS: Array<{ key: Channel; label: string; icon: typeof Bell }> = [
  { key: "inApp", label: "In-app", icon: Bell },
  { key: "email", label: "Email", icon: Mail },
  { key: "push", label: "Browser push", icon: Radio },
];

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readableError(value: unknown, fallback: string) { return isRecord(value) && typeof value.error === "string" ? value.error : fallback; }
function isPreference(value: unknown): value is Preference {
  return isRecord(value) && typeof value.notificationType === "string" && typeof value.inApp === "boolean" && typeof value.email === "boolean" && typeof value.push === "boolean" && typeof value.customized === "boolean" && (typeof value.updatedAt === "string" || value.updatedAt === null);
}
function labelFor(type: string) {
  const known: Record<string, string> = {
    ORDER_PLACED: "Order placed", ORDER_ACCEPTED: "Seller accepted order", ORDER_REJECTED: "Seller rejected order", ORDER_STATUS_UPDATED: "Order and delivery updates", ORDER_CANCELLED: "Order cancelled",
    REVIEW_RECEIVED: "New product review", REVIEW_INVITATION: "Product review invitation", REVIEW_REPLIED: "Seller responded to your review", REVIEW_REPORTED: "Product review reported", REVIEW_REMOVED: "Product review moderated",
    PAYMENT_SUCCESS: "Payment confirmed", PAYMENT_FAILED: "Payment issue", SYSTEM_ANNOUNCEMENT: "ReMarket announcements",
  };
  return known[type] ?? type.split("_").filter(Boolean).map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(" ");
}
function descriptionFor(type: string) {
  if (type.startsWith("ORDER_") || type.startsWith("PAYMENT_")) return "Important updates about your purchases, order processing and delivery.";
  if (type.startsWith("REVIEW_")) return "Product review invitations, new feedback and seller responses.";
  if (type.startsWith("SERVICE_BOOKING_")) return "Updates about service bookings and booking conversations.";
  if (type.startsWith("REQUEST_")) return "Updates about buyer requests and seller responses.";
  if (type.startsWith("SYSTEM_")) return "Important announcements and platform information from ReMarket.";
  return "Updates related to your ReMarket account and marketplace activity.";
}
function groupFor(type: string) {
  if (type.startsWith("ORDER_") || type.startsWith("PAYMENT_")) return "Orders and delivery";
  if (type.startsWith("REVIEW_")) return "Product reviews";
  if (type.startsWith("SERVICE_BOOKING_")) return "Service bookings";
  if (type.startsWith("REQUEST_")) return "Requests";
  if (type.startsWith("SYSTEM_")) return "ReMarket announcements";
  if (/BUSINESS|PRODUCT|SERVICE|CLAIM/.test(type)) return "Marketplace activity";
  return "Account and other updates";
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKeys, setSavingKeys] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const account = session?.user as ({ name?: string | null; role?: string } | undefined);
  const accountLabel = account?.role === "SELLER" ? "Seller account" : account?.role === "ADMIN" ? "Admin account" : "Buyer account";
  const backHref = account?.role === "SELLER" ? "/seller/profile" : account?.role === "ADMIN" ? "/admin" : "/profile";

  const loadPreferences = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/notifications/preferences", { cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readableError(data, "Unable to load notification preferences."));
      if (!isRecord(data) || !Array.isArray(data.preferences)) throw new Error("The server returned invalid notification preferences.");
      setPreferences(data.preferences.filter(isPreference));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notification preferences.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace(`/buyer/login?callbackUrl=${encodeURIComponent("/settings/notifications")}`);
    else if (status === "authenticated") void loadPreferences();
  }, [status, router, loadPreferences]);

  async function updatePreference(type: string, channel: Channel, enabled: boolean) {
    const key = `${type}:${channel}`;
    if (savingKeys.includes(key)) return;
    setSavingKeys((items) => [...items, key]); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ notificationType: type, [channel]: enabled }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readableError(data, "Unable to save this preference."));
      if (!isRecord(data) || !isPreference(data.preference)) throw new Error("The updated preference was not returned by the server.");
      setPreferences((items) => items.map((item) => item.notificationType === type ? { ...item, ...data.preference as Preference } : item));
      setSuccess(`${labelFor(type)} · ${CHANNELS.find((item) => item.key === channel)?.label} preference saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this preference.");
    } finally { setSavingKeys((items) => items.filter((item) => item !== key)); }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Preference[]>();
    for (const item of preferences) {
      const group = groupFor(item.notificationType);
      map.set(group, [...(map.get(group) ?? []), item]);
    }
    return GROUP_ORDER.filter((name) => map.has(name)).map((name) => ({ name, items: map.get(name) ?? [] }));
  }, [preferences]);

  if (status === "loading" || status === "unauthenticated") return <main className="flex min-h-dvh items-center justify-center bg-[#FCFAF6] text-sm text-[#756B61]"><Loader2 className="mr-2 h-4 w-4 animate-spin text-[#FF5A36]"/>Loading your account…</main>;

  return <main className="min-h-dvh bg-[#FCFAF6] px-3 py-5 text-[#17202A] sm:px-6 sm:py-8">
    <div className="mx-auto w-full max-w-5xl">
      <Link href={backHref} className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[#756B61] hover:text-[#9F2D18]"><ArrowLeft className="h-4 w-4"/>Back to account</Link>
      <section className="overflow-hidden rounded-[26px] border border-[#EAE6DF] bg-white shadow-[0_8px_30px_rgba(23,32,42,0.04)]">
        <header className="bg-[#17202A] px-5 py-7 text-white sm:px-8 sm:py-9">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFD3C6]">{accountLabel}</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Notification settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Choose how ReMarket sends you order, delivery, product review and account updates. Your settings are saved automatically.</p>
        </header>
        <div className="space-y-5 p-4 sm:p-7">
          {success && <p role="status" className="flex items-center gap-2 rounded-xl border border-[#BFE3CE] bg-[#EEF9F2] px-4 py-3 text-sm font-semibold text-[#287A4B]"><CheckCircle2 className="h-4 w-4 shrink-0"/>{success}</p>}
          {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-[#F1D0C8] bg-[#FFF0ED] px-4 py-3 text-sm font-semibold text-[#9F2D18]"><Info className="h-4 w-4 shrink-0"/>{error}</p>}
          <BrowserPushControl />
          <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div><h2 className="text-base font-bold">Notification categories</h2><p className="mt-1 text-xs leading-5 text-[#756B61]">Control the in-app bell, email and browser push independently for each event type.</p></div>
              <p className="text-[10px] text-[#8A8178]">Email and browser push are off until you enable them.</p>
            </div>
            {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#756B61]"><Loader2 className="h-5 w-5 animate-spin text-[#FF5A36]"/>Loading preferences…</div> : preferences.length === 0 ? <div className="py-10 text-center text-sm text-[#756B61]">No notification categories were returned.</div> : <div className="mt-5 space-y-6">
              {grouped.map((group) => <div key={group.name}>
                <h3 className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#8A8178]">{group.name}</h3>
                <div className="divide-y divide-[#EAE6DF] rounded-xl border border-[#EAE6DF]">
                  {group.items.map((item) => <div key={item.notificationType} className="grid gap-3 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4">
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-[#17202A]">{labelFor(item.notificationType)}</p>{item.customized && <span className="rounded-full bg-[#F2EEE8] px-2 py-0.5 text-[9px] font-bold text-[#756B61]">Customized</span>}</div><p className="mt-1 text-xs leading-5 text-[#756B61]">{descriptionFor(item.notificationType)}</p></div>
                    <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-4">
                      {CHANNELS.map((channel) => {
                        const Icon = channel.icon; const enabled = item[channel.key]; const key = `${item.notificationType}:${channel.key}`; const saving = savingKeys.includes(key);
                        return <button key={channel.key} type="button" role="switch" aria-checked={enabled} aria-label={`${enabled ? "Disable" : "Enable"} ${channel.label} for ${labelFor(item.notificationType)}`} disabled={saving} onClick={() => void updatePreference(item.notificationType, channel.key, !enabled)} className="flex min-w-[68px] flex-col items-center gap-1.5 rounded-xl px-2 py-2 text-[9px] font-bold text-[#756B61] hover:bg-[#FCFAF6] disabled:opacity-50">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${enabled ? "bg-[#FFF0E9] text-[#9F2D18]" : "bg-[#F2EEE8] text-[#8A8178]"}`}>{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Icon className="h-4 w-4"/>}</span>
                          <span>{channel.label}</span><span className={`h-1.5 w-7 rounded-full ${enabled ? "bg-[#FF5A36]" : "bg-[#D7D0C8]"}`}/>
                        </button>;
                      })}
                    </div>
                  </div>)}
                </div>
              </div>)}
            </div>}
          </section>
          <section className="flex items-start gap-3 rounded-2xl border border-[#F1D5D0] bg-[#FFF9F7] p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]"/><div><h2 className="text-sm font-bold">Important account and order information</h2><p className="mt-1 text-xs leading-5 text-[#756B61]">Notification preferences do not change orders, payments or account activity. ReMarket keeps your order and payment records even when you turn off an alert. Browser push is sent only to browsers you have explicitly enabled.</p></div></section>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EAE6DF] pt-4 text-xs text-[#756B61]"><div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-[#9F2D18]"/><span>{account?.name?.trim() || "ReMarket user"}</span></div><Link href={backHref} className="font-bold text-[#9F2D18] hover:text-[#FF5A36]">Back to account</Link></div>
        </div>
      </section>
    </div>
  </main>;
}
