"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  Gift,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

type JsonRecord = Record<string, unknown>;
type ReferralHistoryItem = {
  id: string;
  role: string;
  status: string;
  createdAt: string | null;
  qualifiedAt: string | null;
};
type ReferralRewardItem = {
  id: string;
  type: string;
  status: string;
  quantity: number;
  milestone: number | null;
  grantedAt: string | null;
};
type ReferralDashboardData = {
  referralCode: string;
  totalReferrals: number;
  pendingReferrals: number;
  qualifiedReferrals: number;
  rejectedReferrals: number;
  referrals: ReferralHistoryItem[];
  rewards: ReferralRewardItem[];
};
type AccountRole = "BUYER" | "SELLER";

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(record: JsonRecord | null, keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(record: JsonRecord | null, keys: string[], fallback: number): number {
  if (!record) return fallback;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }
  }
  return fallback;
}

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function readableLabel(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeDashboard(payload: unknown): ReferralDashboardData {
  const response = asRecord(payload);
  const dashboard = asRecord(response?.dashboard) ?? response;
  const stats = asRecord(dashboard?.stats);
  const rawReferrals = asArray(dashboard?.referrals ?? dashboard?.referralHistory);
  const rawRewards = asArray(dashboard?.rewards ?? dashboard?.referralRewards);

  const referrals = rawReferrals.flatMap((value, index) => {
    const item = asRecord(value);
    if (!item) return [];
    return [{
      id: firstString(item, ["id"]) ?? `referral-${index}`,
      role: firstString(item, ["referredRole", "role"]) ?? "ACCOUNT",
      status: firstString(item, ["status"]) ?? "PENDING",
      createdAt: firstString(item, ["createdAt"]),
      qualifiedAt: firstString(item, ["qualifiedAt"]),
    }];
  });

  const rewards = rawRewards.flatMap((value, index) => {
    const item = asRecord(value);
    if (!item) return [];
    const milestoneValue = item.milestone;
    return [{
      id: firstString(item, ["id"]) ?? `reward-${index}`,
      type: firstString(item, ["type"]) ?? "REFERRAL_REWARD",
      status: firstString(item, ["status"]) ?? "GRANTED",
      quantity: firstNumber(item, ["quantity"], 1),
      milestone: typeof milestoneValue === "number" && Number.isFinite(milestoneValue) ? milestoneValue : null,
      grantedAt: firstString(item, ["grantedAt", "createdAt"]),
    }];
  });

  return {
    referralCode: firstString(dashboard, ["referralCode", "code"]) ?? "",
    totalReferrals: firstNumber(stats, ["totalReferrals", "total", "totalCount"], referrals.length),
    pendingReferrals: firstNumber(stats, ["pendingReferrals", "pending", "pendingCount"], referrals.filter((item) => item.status === "PENDING").length),
    qualifiedReferrals: firstNumber(stats, ["qualifiedReferrals", "qualified", "qualifiedCount"], referrals.filter((item) => item.status === "QUALIFIED").length),
    rejectedReferrals: firstNumber(stats, ["rejectedReferrals", "rejected", "rejectedCount"], referrals.filter((item) => item.status === "REJECTED").length),
    referrals,
    rewards,
  };
}

function statusClass(status: string): string {
  switch (status) {
    case "QUALIFIED":
    case "GRANTED":
    case "APPROVED":
      return "bg-[#EAF8EF] text-[#197449]";
    case "REJECTED":
    case "REVOKED":
    case "FAILED":
      return "bg-[#FFF0EE] text-[#C33C2A]";
    default:
      return "bg-[#FFF5E7] text-[#98631C]";
  }
}

function rewardDescription(reward: ReferralRewardItem): string {
  switch (reward.type) {
    case "PRODUCT_SLOTS":
      return `${reward.quantity} bonus product slot${reward.quantity === 1 ? "" : "s"}`;
    case "BUYER_MILESTONE":
      return reward.milestone ? `Buyer referral milestone ${reward.milestone}` : "Buyer referral milestone";
    default:
      return readableLabel(reward.type);
  }
}

async function copyText(value: string): Promise<boolean> {
  if (!value || typeof window === "undefined") return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Use the legacy clipboard fallback below.
  }

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea?.remove();
  }
}

function MetricCard({ label, value, icon, tone }: {
  label: string;
  value: number;
  icon: ReactNode;
  tone: "orange" | "amber" | "green" | "red";
}) {
  const toneClasses = {
    orange: "bg-[#FFF0E9] text-[#FF5A36]",
    amber: "bg-[#FFF5E7] text-[#98631C]",
    green: "bg-[#EAF8EF] text-[#197449]",
    red: "bg-[#FFF0EE] text-[#C33C2A]",
  };
  return (
    <article className="min-w-0 rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm sm:p-5">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[tone]}`}>{icon}</div>
      <p className="mt-4 text-2xl font-bold tabular-nums text-[#17202A] sm:text-3xl">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs font-medium text-[#718096] sm:text-sm">{label}</p>
    </article>
  );
}

export default function ReferralDashboardPage() {
  const [dashboard, setDashboard] = useState<ReferralDashboardData | null>(null);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isNoticeError, setIsNoticeError] = useState(false);
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const [referralResponse, sessionResponse] = await Promise.all([
        fetch("/api/referrals", { method: "GET", cache: "no-store", credentials: "same-origin" }),
        fetch("/api/auth/session", { method: "GET", cache: "no-store", credentials: "same-origin" }),
      ]);

      const [referralPayload, sessionPayload]: [unknown, unknown] = await Promise.all([
        referralResponse.json().catch(() => null),
        sessionResponse.json().catch(() => null),
      ]);
      if (requestId !== requestIdRef.current) return;

      if (referralResponse.status === 401 || referralResponse.status === 403) {
        setDashboard(null);
        setError("Please sign in to view your referrals.");
        return;
      }

      if (!referralResponse.ok) {
        const record = asRecord(referralPayload);
        setDashboard(null);
        setError(firstString(record, ["error"]) ?? "Unable to load your referral dashboard.");
        return;
      }

      const sessionRecord = asRecord(sessionPayload);
      const sessionUser = asRecord(sessionRecord?.user);
      const sessionRole = firstString(sessionUser, ["role"]);
      const normalizedRole: AccountRole | null = sessionRole === "BUYER" || sessionRole === "SELLER" ? sessionRole : null;
      setRole(normalizedRole);
      setDashboard(normalizeDashboard(referralPayload));
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      console.error("Referral dashboard loading error:", loadError);
      setDashboard(null);
      setError("Something went wrong while loading your referrals. Please try again.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadDashboard]);

  const referralLink = typeof window !== "undefined" && dashboard?.referralCode && role
    ? `${window.location.origin}${role === "SELLER" ? "/seller/signup" : "/buyer/signup"}?ref=${encodeURIComponent(dashboard.referralCode)}`
    : "";

  const shareMessage = role === "SELLER"
    ? "Join ReMarket and make your business easier to discover. Sign up using my referral link:"
    : "Discover local businesses and products on ReMarket. Create your buyer account using my referral link:";

  const whatsappLink = referralLink
    ? `https://wa.me/?text=${encodeURIComponent(`${shareMessage} ${referralLink}`)}`
    : "";
  const backHref = role === "SELLER" ? "/seller" : "/";

  async function handleCopy(value: string, label: string) {
    const copied = await copyText(value);
    setIsNoticeError(!copied);
    setNotice(copied ? `${label} copied.` : "Copying failed. Select the text and copy it manually.");
  }

  function renderStatus(status: string) {
    return <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${statusClass(status)}`}>{readableLabel(status)}</span>;
  }

  return (
    <main className="min-h-dvh overflow-x-clip bg-[#FCFAF6] px-3 py-4 text-[#17202A] sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <Link href={backHref} className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[#718096] transition-colors hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to {role === "SELLER" ? "seller dashboard" : "ReMarket"}
        </Link>

        <header className="relative mb-6 overflow-hidden rounded-[26px] bg-[#17202A] px-5 py-7 text-white sm:mb-8 sm:px-8 sm:py-9 lg:px-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-52 w-52 rounded-full border-[28px] border-white/5 sm:h-72 sm:w-72" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-[#FF5A36]/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#FFD3C6]">
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> ReMarket referrals
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">Refer. Grow. Earn.</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">Invite people to ReMarket with one link. Follow each referral and see eligible rewards here.</p>
            </div>
            <button type="button" onClick={() => void loadDashboard()} disabled={loading} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto">
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </header>

        {notice && <p role={isNoticeError ? "alert" : "status"} aria-live="polite" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${isNoticeError ? "border-[#FFB8B0] bg-[#FFF0EE] text-[#C33C2A]" : "border-[#BDE8D8] bg-[#EFFBF6] text-[#197449]"}`}>{notice}</p>}

        {loading ? (
          <div role="status" className="flex min-h-56 items-center justify-center gap-3 rounded-2xl border border-[#EAE6DF] bg-white px-4">
            <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-[#FF5A36]" />
            <span className="text-sm text-[#718096]">Loading your referral dashboard...</span>
          </div>
        ) : error ? (
          <section role="alert" className="rounded-2xl border border-[#FFB8B0] bg-white p-5 sm:p-8">
            <div className="flex items-start gap-3">
              <CircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#E33B22]" />
              <div className="min-w-0">
                <h2 className="font-bold">Unable to load referrals</h2>
                <p className="mt-2 break-words text-sm leading-6 text-[#718096]">{error}</p>
                {error.toLowerCase().includes("sign in") && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href="/buyer/login" className="inline-flex min-h-10 items-center gap-2 font-semibold text-[#FF563F] hover:underline">Buyer sign in <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                    <Link href="/seller/login" className="inline-flex min-h-10 items-center gap-2 font-semibold text-[#FF563F] hover:underline">Seller sign in <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                  </div>
                )}
                <button type="button" onClick={() => void loadDashboard()} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#D9DEE5] px-4 text-sm font-semibold transition-colors hover:bg-[#FCFAF6]">Try again</button>
              </div>
            </div>
          </section>
        ) : dashboard ? (
          <>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:gap-6">
              <section className="min-w-0 rounded-[24px] border border-[#EAE6DF] bg-white p-5 shadow-sm sm:p-7 lg:p-8">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#FF5A36]"><Share2 aria-hidden="true" className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold">Your invite link</h2>
                    <p className="mt-1 text-sm leading-6 text-[#718096]">The easiest way to invite someone is to send them this link.</p>
                  </div>
                </div>

                {dashboard.referralCode ? (
                  <>
                    <div className="mt-6">
                      <label htmlFor="referral-code" className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#718096]">Referral code</label>
                      <div className="flex min-w-0 gap-2">
                        <div id="referral-code" className="flex min-h-12 min-w-0 flex-1 items-center break-all rounded-xl border border-[#D9DEE5] bg-[#FCFAF6] px-4 font-mono text-base font-bold tracking-wide">{dashboard.referralCode}</div>
                        <button type="button" onClick={() => void handleCopy(dashboard.referralCode, "Referral code")} aria-label="Copy referral code" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D9DEE5] text-[#718096] transition hover:border-[#FF5A36] hover:bg-[#FFF7ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"><Copy aria-hidden="true" className="h-4 w-4" /></button>
                      </div>
                    </div>

                    {referralLink ? (
                      <div className="mt-5">
                        <label htmlFor="referral-link" className="mb-2 block text-xs font-bold uppercase tracking-wide text-[#718096]">Signup link</label>
                        <input id="referral-link" readOnly value={referralLink} onFocus={(event) => event.currentTarget.select()} className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-[#FCFAF6] px-3 text-xs text-[#536273] outline-none focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 sm:px-4 sm:text-sm" />
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <button type="button" onClick={() => void handleCopy(referralLink, "Referral link")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-bold text-white transition hover:bg-[#E94B2B] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25"><Copy aria-hidden="true" className="h-4 w-4" /> Copy invite link</button>
                          {whatsappLink ? <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm font-bold text-[#17202A] transition hover:bg-[#FCFAF6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25"><MessageCircle aria-hidden="true" className="h-4 w-4 text-[#197449]" /> Share on WhatsApp <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-4 rounded-xl bg-[#FFF5E7] p-3 text-sm leading-6 text-[#98631C]">Your account type could not be confirmed, so we cannot build the correct signup link. Refresh after signing in again.</p>
                    )}
                  </>
                ) : (
                  <p className="mt-5 rounded-xl bg-[#FFF5E7] p-4 text-sm leading-6 text-[#98631C]">Your referral code is not available from the referral API yet. Your API should return the code associated with your signed-in account.</p>
                )}

                <div className="mt-6 rounded-2xl bg-[#FCFAF6] p-4 sm:p-5">
                  <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck aria-hidden="true" className="h-4 w-4 text-[#FF5A36]" /> Rewards are condition-based</p>
                  <p className="mt-2 text-sm leading-6 text-[#718096]">Rewards should be added only after ReMarket confirms the referral meets every eligibility rule. Eligible rewards are intended to be issued automatically, without manual admin approval.</p>
                </div>
              </section>

              <aside className="min-w-0 rounded-[24px] border border-[#EAE6DF] bg-white p-5 shadow-sm sm:p-7 lg:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#FF5A36]"><Gift aria-hidden="true" className="h-5 w-5" /></div>
                  <div><h2 className="font-bold">How rewards work</h2><p className="mt-1 text-xs text-[#718096]">Clear rules, no guesswork</p></div>
                </div>
                {role === "SELLER" ? (
                  <div className="mt-5 rounded-2xl border border-[#FFD4C8] bg-[#FFF8F5] p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#9F2D18]">Seller referral reward</p>
                    <div className="mt-2 flex items-end gap-2"><span className="text-4xl font-black tracking-tight text-[#FF5A36]">+2</span><span className="pb-1 text-sm font-semibold text-[#17202A]">product slots</span></div>
                    <p className="mt-2 text-sm leading-6 text-[#718096]">Two additional product slots are the target reward for a qualifying seller referral. The system must confirm the referral qualifies before adding them.</p>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#718096]">Buyer referrals</p>
                    <p className="mt-2 text-sm leading-6 text-[#718096]">Invite buyers with your referral link. Any buyer benefits should appear here only after the referral service records that they have been earned.</p>
                  </div>
                )}
                <ol className="mt-5 space-y-4">
                  <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0E9] text-xs font-bold text-[#FF5A36]">1</span><div><p className="text-sm font-semibold">Share your personal link</p><p className="mt-1 text-xs leading-5 text-[#718096]">Send it directly to someone who is new to ReMarket.</p></div></li>
                  <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF0E9] text-xs font-bold text-[#FF5A36]">2</span><div><p className="text-sm font-semibold">They complete the required steps</p><p className="mt-1 text-xs leading-5 text-[#718096]">The referral service checks eligibility and prevents duplicate or self-referrals.</p></div></li>
                  <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF8EF] text-xs font-bold text-[#197449]">3</span><div><p className="text-sm font-semibold">Eligible rewards are recorded</p><p className="mt-1 text-xs leading-5 text-[#718096]">The server records the qualification and grants the reward once, without requiring an admin to approve each reward.</p></div></li>
                </ol>
              </aside>
            </div>

            <section className="mt-6 sm:mt-8">
              <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#FF5A36]">Your activity</p><h2 className="mt-1 text-xl font-bold sm:text-2xl">Referral progress</h2></div></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <MetricCard label="Total referrals" value={dashboard.totalReferrals} tone="orange" icon={<Users aria-hidden="true" className="h-5 w-5" />} />
                <MetricCard label="Pending" value={dashboard.pendingReferrals} tone="amber" icon={<Clock3 aria-hidden="true" className="h-5 w-5" />} />
                <MetricCard label="Qualified" value={dashboard.qualifiedReferrals} tone="green" icon={<CheckCircle2 aria-hidden="true" className="h-5 w-5" />} />
                <MetricCard label="Not qualified" value={dashboard.rejectedReferrals} tone="red" icon={<CircleAlert aria-hidden="true" className="h-5 w-5" />} />
              </div>
            </section>

            <section className="mt-8">
              <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#FF5A36]"><Gift aria-hidden="true" className="h-5 w-5" /></div><div><h2 className="text-xl font-bold">Your rewards</h2><p className="mt-1 text-sm text-[#718096]">Only rewards recorded by ReMarket are shown here.</p></div></div>
              <div className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">
                {dashboard.rewards.length ? <div className="divide-y divide-[#EAE6DF]">{dashboard.rewards.map((reward) => <article key={reward.id} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FCFAF6] text-[#FF5A36]"><Gift aria-hidden="true" className="h-4 w-4" /></div><div className="min-w-0"><p className="break-words font-semibold">{rewardDescription(reward)}</p><p className="mt-1 text-sm text-[#718096]">Recorded {formatDate(reward.grantedAt)}</p></div></div>{renderStatus(reward.status)}</article>)}</div> : <div className="px-5 py-9 text-center"><Gift aria-hidden="true" className="mx-auto h-8 w-8 text-[#B1A79B]" /><p className="mt-3 font-semibold">No rewards yet</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718096]">Share your invite link. When the referral service confirms a qualifying referral and records its reward, it will appear here.</p></div>}
              </div>
            </section>

            <section className="mt-8">
              <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#FF5A36]">Recent activity</p><h2 className="mt-1 text-xl font-bold sm:text-2xl">Referral history</h2></div>
              <div className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">
                {dashboard.referrals.length ? <div className="divide-y divide-[#EAE6DF]">{dashboard.referrals.map((referral) => <article key={referral.id} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="min-w-0"><p className="break-words font-semibold">{readableLabel(referral.role)} referral</p><p className="mt-1 text-sm text-[#718096]">Joined {formatDate(referral.createdAt)}</p>{referral.qualifiedAt && <p className="mt-1 text-sm text-[#718096]">Qualified {formatDate(referral.qualifiedAt)}</p>}</div>{renderStatus(referral.status)}</article>)}</div> : <div className="px-5 py-9 text-center"><Users aria-hidden="true" className="mx-auto h-8 w-8 text-[#B1A79B]" /><p className="mt-3 font-semibold">No referrals yet</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718096]">Copy your link and share it with someone who has not joined ReMarket.</p></div>}
              </div>
            </section>
          </>
        ) : <section className="rounded-2xl border border-[#EAE6DF] bg-white p-6 text-sm text-[#718096]">No referral dashboard data is available.</section>}

        <footer className="mt-8 border-t border-[#EAE6DF] py-5 text-xs leading-5 text-[#8491A3]">Referral counts and rewards are based on data returned by ReMarket. A displayed reward target does not mean a reward has been granted; the backend must verify eligibility and record the grant.</footer>
      </div>
    </main>
  );
}
