export class EmailDeliveryError extends Error {
  readonly retryable: boolean;
  readonly statusCode: number | null;
  constructor(message: string, options: { retryable: boolean; statusCode?: number | null }) {
    super(message);
    this.name = "EmailDeliveryError";
    this.retryable = options.retryable;
    this.statusCode = options.statusCode ?? null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

export function safeNotificationPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\u0000-\u001F\u007F]/.test(value)) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  if (!base) return null;
  try {
    const app = new URL(base);
    const result = new URL(value, app);
    return result.origin === app.origin ? `${result.pathname}${result.search}${result.hash}` : null;
  } catch { return null; }
}

export function safeNotificationUrl(value: unknown): string | null {
  const path = safeNotificationPath(value);
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  if (!path || !base) return null;
  try { const app = new URL(base); return new URL(path, app).toString(); } catch { return null; }
}

export async function sendNotificationEmail(input: { to: string; title: string; message: string; href?: unknown; idempotencyKey?: string }): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new EmailDeliveryError("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.", { retryable: false });
  const to = input.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new EmailDeliveryError("The account email address is invalid.", { retryable: false });
  const href = safeNotificationUrl(input.href);
  const title = input.title.slice(0, 180);
  const message = input.message.slice(0, 2_000);
  const settingsUrl = safeNotificationUrl("/settings/notifications");
  const cta = href ? `<p style="margin:28px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#FF5A36;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Open ReMarket</a></p>` : "";
  const settingsLink = settingsUrl ? `<p style="margin:22px 0 0;color:#8A8178;font-size:11px"><a href="${escapeHtml(settingsUrl)}" style="color:#9F2D18">Manage notification settings</a></p>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#FFF7ED;font-family:Arial,Helvetica,sans-serif;color:#2E241F"><div style="max-width:600px;margin:0 auto;padding:28px 16px"><div style="background:#9F2D18;color:#fff;padding:18px 22px;border-radius:16px 16px 0 0;font-weight:800;font-size:20px">ReMarket</div><main style="background:#FFFDFC;border:1px solid #EAE6DF;border-top:0;padding:28px 22px;border-radius:0 0 16px 16px"><h1 style="font-size:22px;line-height:1.3;margin:0 0 14px">${escapeHtml(title)}</h1><p style="font-size:15px;line-height:1.7;color:#62574F;margin:0">${escapeHtml(message).replace(/\n/g,"<br>")}</p>${cta}${settingsLink}<p style="margin:18px 0 0;color:#8A8178;font-size:11px;line-height:1.5">You received this transactional notification because of your ReMarket account preferences.</p></main></div></body></html>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) },
    body: JSON.stringify({ from, to: [to], subject: title, html, text: `${title}\n\n${message}${href ? `\n\nOpen ReMarket: ${href}` : ""}${settingsUrl ? `\n\nManage notification settings: ${settingsUrl}` : ""}` }),
    signal: AbortSignal.timeout(12_000),
  }).catch(() => { throw new EmailDeliveryError("The email provider could not be reached.", { retryable: true }); });
  const result: unknown = await response.json().catch(() => null);
  if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) throw new EmailDeliveryError(`The email provider returned ${response.status}.`, { retryable: true, statusCode: response.status });
  if (!response.ok) throw new EmailDeliveryError(`The email provider rejected the request (${response.status}).`, { retryable: false, statusCode: response.status });
  const id = typeof result === "object" && result !== null && "id" in result && typeof result.id === "string" ? result.id : null;
  return { id };
}
