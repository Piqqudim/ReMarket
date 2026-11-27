"use client";

import { signOut as nextAuthSignOut } from "next-auth/react";

/**
 * Revoke the current browser's push subscription before ending the session.
 * This prevents private order/review alerts from continuing to appear on a
 * shared browser after the account signs out. Other registered devices remain
 * subscribed to the account.
 */
async function revokeCurrentBrowserPushSubscription(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (!subscription) return;

    const response = await fetch("/api/notifications/push-subscriptions", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    // Keep browser and database state aligned. If server revocation fails,
    // a later explicit opt-in from another account can safely transfer the
    // single browser endpoint to that authenticated account.
    if (response.ok) await subscription.unsubscribe().catch(() => false);
  } catch {
    // Sign-out must remain available even when browser push cleanup fails.
  }
}

export async function signOut(...args: Parameters<typeof nextAuthSignOut>) {
  await revokeCurrentBrowserPushSubscription();
  return nextAuthSignOut(...args);
}
