"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

type Status = "checking" | "unsupported" | "denied" | "off" | "on" | "error";

function decodeApplicationServerKey(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const raw = atob(padded);
  const result = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) result[index] = raw.charCodeAt(index);
  return result;
}

function toBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export default function BrowserPushControl() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !window.isSecureContext) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      const response = await fetch("/api/notifications/push-subscriptions", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to check your saved browser subscription.");
      const saved = await response.json() as { hasSubscription?: boolean };
      setStatus(subscription && saved.hasSubscription ? "on" : "off");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function enable() {
    setBusy(true); setMessage("");
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
      if (!publicKey) throw new Error("Browser Push is not configured yet. Please contact ReMarket support.");
      if (!window.isSecureContext) throw new Error("Browser notifications require a secure HTTPS connection.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        setMessage(permission === "denied" ? "Browser notifications are blocked in your browser settings." : "Permission was not granted.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeApplicationServerKey(publicKey) as BufferSource });
      }
      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) throw new Error("The browser returned an incomplete push subscription.");
      const response = await fetch("/api/notifications/push-subscriptions", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ subscription: { endpoint: serialized.endpoint, expirationTime: subscription.expirationTime, keys: serialized.keys } }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = data && typeof data === "object" && typeof (data as Record<string, unknown>).error === "string" ? (data as Record<string, string>).error : "Unable to save your browser subscription.";
        throw new Error(error);
      }
      setStatus("on"); setMessage("Browser notifications are enabled on this device.");
    } catch (error) {
      setStatus("error"); setMessage(error instanceof Error ? error.message : "Unable to enable browser notifications.");
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      const endpoint = subscription?.endpoint;
      const response = await fetch("/api/notifications/push-subscriptions", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify(endpoint ? { endpoint } : {}),
      });
      if (!response.ok) throw new Error("ReMarket could not update your browser subscription. It remains enabled; please try again.");
      if (subscription) await subscription.unsubscribe();
      setStatus("off"); setMessage("Browser notifications have been disabled on this device.");
    } catch (error) {
      setStatus("error"); setMessage(error instanceof Error ? error.message : "Unable to disable browser notifications.");
    } finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4 sm:p-5" aria-labelledby="browser-push-heading">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]"><BellRing className="h-5 w-5"/></div>
        <div className="min-w-0"><h2 id="browser-push-heading" className="text-base font-bold text-[#17202A]">Browser push</h2><p className="mt-1 text-xs leading-5 text-[#756B61]">Receive ReMarket order and review alerts on this browser, even when the website is not open. You choose whether to enable it.</p><div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[#756B61]"><ShieldCheck className="h-3.5 w-3.5 text-[#287A4B]"/>You can turn this off at any time.</div></div>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <span className={`text-[10px] font-bold ${status === "on" ? "text-[#287A4B]" : status === "denied" || status === "error" ? "text-[#9F2D18]" : "text-[#756B61]"}`} role="status">{status === "checking" ? "Checking…" : status === "on" ? "Enabled on this browser" : status === "denied" ? "Blocked by browser" : status === "unsupported" ? "Not supported here" : status === "error" ? "Needs attention" : "Not enabled"}</span>
        {status === "on" ? <button type="button" onClick={() => void disable()} disabled={busy} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#EAE6DF] bg-white px-4 text-xs font-bold text-[#9F2D18] hover:bg-[#FFF7F4] disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : "Turn off"}</button> : <button type="button" onClick={() => void enable()} disabled={busy || status === "checking" || status === "unsupported" || status === "denied"} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-xs font-bold text-white hover:bg-[#E94A28] disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle2 className="h-4 w-4"/>}Enable browser push</button>}
      </div>
    </div>
    {message && <p role="status" className="mt-3 rounded-xl bg-[#FCFAF6] p-3 text-xs leading-5 text-[#756B61]">{message}</p>}
    {status === "denied" && <p className="mt-2 text-[10px] leading-4 text-[#9F2D18]">Allow notifications for this site in your browser settings, then reload this page.</p>}
  </section>;
}
