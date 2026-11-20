import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { confirmPaystackPayment } from "@/lib/paystack-payment-confirmation";
import { verifyPaystackWebhookSignature } from "@/lib/paystack";
import { applyPaystackTransferWebhook } from "@/lib/seller-settlement";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const noStore = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let rawBody: Buffer;
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_WEBHOOK_BYTES) {
      return NextResponse.json({ error: "Invalid webhook body size." }, { status: 413, headers: noStore });
    }
    rawBody = Buffer.from(bytes);
  } catch {
    return NextResponse.json({ error: "Unable to read webhook body." }, { status: 400, headers: noStore });
  }

  const signatureValid = verifyPaystackWebhookSignature({
    rawBody,
    currentSignature: request.headers.get("paystack-signature"),
    legacySignature: request.headers.get("x-paystack-signature"),
  });

  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid Paystack webhook signature." }, { status: 401, headers: noStore });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid webhook JSON." }, { status: 400, headers: noStore });
  }

  if (!isRecord(event) || typeof event.event !== "string" || !isRecord(event.data)) {
    return NextResponse.json({ error: "Invalid Paystack event payload." }, { status: 400, headers: noStore });
  }

  const data = event.data;

  // Seller transfers are tracked separately from buyer charge events.
  // A transfer is marked PAID only after this signed final-status webhook
  // (or an explicit Paystack transfer verification during reconciliation).
  if (
    event.event === "transfer.success" ||
    event.event === "transfer.failed" ||
    event.event === "transfer.reversed"
  ) {
    try {
      const result = await applyPaystackTransferWebhook({
        event: event.event,
        data,
      });
      return NextResponse.json(
        { received: true, processed: true, transfer: result },
        { status: 200, headers: noStore },
      );
    } catch (error) {
      console.error("PAYSTACK_TRANSFER_WEBHOOK_PROCESSING_ERROR:", error);
      return NextResponse.json(
        { error: "Paystack transfer webhook processing failed. The event can be retried." },
        { status: 500, headers: noStore },
      );
    }
  }

  // Other signed Paystack events are acknowledged. Buyer charge success is
  // independently verified against Paystack's transaction verify endpoint.
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true, ignored: true }, { status: 200, headers: noStore });
  }

  const reference = typeof data.reference === "string" ? data.reference.trim() : "";
  if (!reference || reference.length > 120) {
    return NextResponse.json({ error: "Paystack success event has no valid reference." }, { status: 400, headers: noStore });
  }

  const providerTransactionId =
    typeof data.id === "number" || typeof data.id === "string"
      ? String(data.id)
      : reference;
  const eventKey = `PAYSTACK:charge.success:${providerTransactionId}`;

  // Persist only the fields needed for reconciliation; do not retain the
  // full provider payload, which may contain unnecessary payment metadata.
  const safePayload: Prisma.InputJsonValue = {
    event: "charge.success",
    data: {
      id: providerTransactionId,
      reference,
      status: typeof data.status === "string" ? data.status : null,
      amount: typeof data.amount === "number" ? data.amount : null,
      currency: typeof data.currency === "string" ? data.currency : null,
      paid_at: typeof data.paid_at === "string" ? data.paid_at : null,
      channel: typeof data.channel === "string" ? data.channel : null,
    },
  };

  try {
    const result = await confirmPaystackPayment(reference, {
      webhookReceipt: { eventKey, payload: safePayload },
    });

    if (result.paymentStatus !== "SUCCESS") {
      // Paystack says the charge succeeded but its verify endpoint has not yet
      // returned success. Do not acknowledge this delivery; allow a retry.
      return NextResponse.json(
        { received: true, processed: false, message: "Payment verification is not final yet." },
        { status: 503, headers: noStore },
      );
    }

    return NextResponse.json(
      {
        received: true,
        processed: true,
        paymentStatus: result.paymentStatus,
        requiresManualReview: result.requiresManualReview,
      },
      { status: 200, headers: noStore },
    );
  } catch (error) {
    console.error("PAYSTACK_WEBHOOK_PROCESSING_ERROR:", error);
    // A non-2xx response asks Paystack to retry a transient processing failure.
    return NextResponse.json(
      { error: "Paystack webhook processing failed. The event can be retried." },
      { status: 500, headers: noStore },
    );
  }
}