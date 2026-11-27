"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";

type Delivery = {
  id: string; channel: string; status: string; attemptCount: number; nextAttemptAt: string; lastAttemptAt: string | null; sentAt: string | null; failedAt: string | null; providerMessageId: string | null; error: string | null; createdAt: string;
  notification: { type: string; title: string; user: { id: string; name: string | null } };
  attempts: Array<{ attemptNumber: number; status: string; error: string | null; createdAt: string; providerMessageId: string | null }>;
};
type Payload = { deliveries: Delivery[]; total: number; page: number; pageSize: number; totalPages: number; summary: { queued: number; failed: number; processing: number } };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function date(value: string | null) { return value ? new Date(value).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "—"; }

export default function AdminNotificationDeliveriesPage() {
  const [channel, setChannel] = useState("ALL"); const [statusFilter, setStatusFilter] = useState("ALL"); const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<Payload | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/notification-deliveries?channel=${channel}&status=${statusFilter}&page=${page}`, { cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(data) || !Array.isArray(data.deliveries) || !isRecord(data.summary)) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "Unable to load notification delivery records.");
      setPayload(data as unknown as Payload);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load notification delivery records."); }
    finally { setLoading(false); }
  }, [channel, statusFilter, page]);
  useEffect(() => { void load(); }, [load]);
  return <div className="mx-auto max-w-7xl p-4 sm:p-6">
    <header className="rounded-2xl border border-[#EAE6DF] bg-white p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#FF5A36]">Operations</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-[#2E241F]"><Bell className="h-6 w-6 text-[#9F2D18]"/>Notification deliveries</h1><p className="mt-1 text-sm text-[#756B61]">Inspect email and browser push delivery attempts without exposing addresses or push subscription credentials.</p></div><button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] px-3 text-xs font-bold"><RefreshCw className="h-4 w-4"/>Refresh</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{[{label:"Queued",value:payload?.summary.queued??0},{label:"Processing",value:payload?.summary.processing??0},{label:"Failed",value:payload?.summary.failed??0}].map((item)=><div key={item.label} className="rounded-xl bg-[#FCFAF6] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8A8178]">{item.label}</p><p className="mt-1 text-2xl font-black text-[#9F2D18]">{item.value}</p></div>)}</div>
    </header>
    <div className="mt-5 flex flex-wrap gap-3"><label className="text-xs font-bold text-[#514840]">Channel <select value={channel} onChange={(event)=>{setPage(1);setChannel(event.target.value);}} className="ml-2 h-10 rounded-xl border border-[#EAE6DF] bg-white px-3"><option value="ALL">Email + Browser push</option><option value="EMAIL">Email</option><option value="PUSH">Browser push</option></select></label><label className="text-xs font-bold text-[#514840]">Status <select value={statusFilter} onChange={(event)=>{setPage(1);setStatusFilter(event.target.value);}} className="ml-2 h-10 rounded-xl border border-[#EAE6DF] bg-white px-3">{["ALL","PENDING","PROCESSING","SENT","FAILED","CANCELLED"].map((value)=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label></div>
    {error&&<p role="alert" className="mt-4 rounded-xl bg-[#FFF0ED] px-4 py-3 text-sm font-semibold text-[#9F2D18]">{error}</p>}
    {loading?<div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[#756B61]"><Loader2 size={18} className="animate-spin"/>Loading delivery records…</div>:!payload?.deliveries.length?<div className="mt-5 rounded-2xl border border-dashed border-[#D9D0C7] bg-white p-10 text-center text-sm text-[#756B61]">No delivery records match these filters.</div>:<div className="mt-5 space-y-3">{payload.deliveries.map((item)=><article key={item.id} className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#9F2D18]">{item.channel} · {item.notification.type}</p><h2 className="mt-1 break-words text-sm font-extrabold text-[#2E241F]">{item.notification.title}</h2><p className="mt-1 text-xs text-[#756B61]">Recipient: {item.notification.user.name || "ReMarket account"} · Created {date(item.createdAt)}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-extrabold ${item.status==="FAILED"?"bg-[#FFF0ED] text-[#9F2D18]":item.status==="SENT"?"bg-[#EEF9F2] text-[#287A4B]":"bg-[#F3EFE9] text-[#756B61]"}`}>{item.status}</span></div><div className="mt-3 grid gap-2 text-[10px] text-[#756B61] sm:grid-cols-3"><p>Attempts: <strong className="text-[#514840]">{item.attemptCount}</strong></p><p>Last attempt: <strong className="text-[#514840]">{date(item.lastAttemptAt)}</strong></p><p>Accepted/sent: <strong className="text-[#514840]">{date(item.sentAt)}</strong></p></div>{item.error&&<p className="mt-3 rounded-xl bg-[#FFF9F7] p-3 text-xs leading-5 text-[#9F2D18]">{item.error}</p>}{item.attempts.length>0&&<details className="mt-3 border-t border-[#EAE6DF] pt-3"><summary className="cursor-pointer text-xs font-bold text-[#514840]">Recent attempts ({item.attempts.length})</summary><div className="mt-2 space-y-2">{item.attempts.map((attempt)=><div key={attempt.attemptNumber} className="rounded-lg bg-[#FCFAF6] p-2 text-[10px] text-[#756B61]"><p>Attempt {attempt.attemptNumber} · {attempt.status} · {date(attempt.createdAt)}</p>{attempt.error&&<p className="mt-1 break-words text-[#9F2D18]">{attempt.error}</p>}</div>)}</div></details>}</article>)}</div>}
    {payload&&payload.totalPages>1&&<div className="mt-5 flex items-center justify-between"><button type="button" disabled={page<=1||loading} onClick={()=>setPage((value)=>Math.max(1,value-1))} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#EAE6DF] bg-white px-3 text-xs font-bold disabled:opacity-40"><ChevronLeft size={15}/>Previous</button><p className="text-xs text-[#756B61]">Page {page} of {payload.totalPages}</p><button type="button" disabled={page>=payload.totalPages||loading} onClick={()=>setPage((value)=>value+1)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#EAE6DF] bg-white px-3 text-xs font-bold disabled:opacity-40">Next<ChevronRight size={15}/></button></div>}
  </div>;
}
