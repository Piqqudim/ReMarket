import { NextResponse } from "next/server";

import { requireSellerAccount } from "@/lib/seller-auth";
import { PaystackError, resolvePaystackBankAccount } from "@/lib/paystack";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const MAX_BODY_BYTES = 4 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const auth = await requireSellerAccount();
  if (!auth.authorized) return auth.response;

  const length = request.headers.get("content-length");
  if (length && Number(length) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413, headers: noStore });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413, headers: noStore });
    }
    body = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400, headers: noStore });
  }

  if (!isRecord(body) || typeof body.accountNumber !== "string" || typeof body.bankCode !== "string") {
    return NextResponse.json({ error: "A bank code and 10-digit account number are required." }, { status: 400, headers: noStore });
  }

  const accountNumber = body.accountNumber.trim();
  const bankCode = body.bankCode.trim();
  if (!/^\d{10}$/.test(accountNumber) || !/^\d{2,10}$/.test(bankCode)) {
    return NextResponse.json({ error: "Enter a valid 10-digit account number and select a valid bank." }, { status: 400, headers: noStore });
  }

  try {
    const resolved = await resolvePaystackBankAccount({ accountNumber, bankCode });
    return NextResponse.json(
      {
        success: true,
        accountName: resolved.account_name,
        accountNumberLast4: resolved.account_number.slice(-4),
        bankCode,
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("SELLER_PAYOUT_ACCOUNT_RESOLVE_ERROR:", error);
    const status = error instanceof PaystackError ? error.status : 502;
    return NextResponse.json(
      { error: error instanceof PaystackError ? error.message : "Unable to verify this bank account." },
      { status, headers: noStore },
    );
  }
}
