import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export class PaystackError extends Error {
  status: number;
  providerMessage?: string;

  constructor(message: string, status = 502, providerMessage?: string) {
    super(message);
    this.name = "PaystackError";
    this.status = status;
    this.providerMessage = providerMessage;
  }
}

export type PaystackInitializeResult = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export type PaystackVerifiedTransaction = {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  channel: string;
  customer?: {
    email?: string;
    customer_code?: string;
  };
  metadata?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSecretKey(): string {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    throw new PaystackError(
      "Paystack is not configured. Add PAYSTACK_SECRET_KEY to the server environment.",
      503,
    );
  }
  return secret;
}

async function paystackRequest<T>(path: string, init: RequestInit): Promise<T> {
  const secret = getSecretKey();
  let response: Response;

  try {
    response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch (error) {
    throw new PaystackError(
      error instanceof Error ? error.message : "Unable to reach Paystack.",
      502,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !isRecord(payload) ||
    payload.status !== true ||
    !("data" in payload) ||
    payload.data === null ||
    payload.data === undefined
  ) {
    const providerMessage = isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : undefined;
    throw new PaystackError(
      providerMessage || "Paystack could not complete the request.",
      response.status || 502,
      providerMessage,
    );
  }

  return payload.data as T;
}

/**
 * Paystack expects the amount in the smallest currency unit: kobo for NGN.
 * The caller must convert whole naira to kobo before calling this function.
 */
export async function initializePaystackTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}) {
  if (!/^\S+@\S+\.\S+$/.test(input.email)) {
    throw new PaystackError("A valid buyer email is required for Paystack.", 400);
  }
  if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo < 100) {
    throw new PaystackError("Payment amount must be a valid amount in kobo.", 400);
  }
  if (!/^[a-zA-Z0-9.\-=]+$/.test(input.reference) || input.reference.length > 100) {
    throw new PaystackError("The payment reference contains unsupported characters.", 400);
  }
  let callback: URL;
  try {
    callback = new URL(input.callbackUrl);
  } catch {
    throw new PaystackError("A valid absolute callback URL is required.", 400);
  }
  if (callback.protocol !== "https:" && callback.hostname !== "localhost") {
    throw new PaystackError("The payment callback URL must use HTTPS.", 400);
  }

  return paystackRequest<PaystackInitializeResult>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: callback.toString(),
      channels: ["card", "bank_transfer", "ussd"],
      metadata: JSON.stringify(input.metadata),
    }),
  });
}

export async function verifyPaystackTransaction(reference: string) {
  if (!reference || reference.length > 120 || !/^[a-zA-Z0-9.\-=]+$/.test(reference)) {
    throw new PaystackError("Invalid Paystack transaction reference.", 400);
  }

  return paystackRequest<PaystackVerifiedTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
}


export type PaystackBank = {
  name: string;
  code: string;
  active?: boolean;
  country?: string;
  currency?: string;
  type?: string;
};

export type PaystackResolvedBankAccount = {
  account_number: string;
  account_name: string;
};

export type PaystackTransferRecipient = {
  recipient_code: string;
  name: string;
  type: string;
  currency: string;
  active?: boolean;
  details?: {
    account_number?: string;
    account_name?: string | null;
    bank_code?: string;
    bank_name?: string;
  };
};

export type PaystackTransfer = {
  amount: number;
  currency: string;
  reference: string;
  status: string;
  transfer_code?: string;
  recipient?: string | { recipient_code?: string; name?: string };
  failures?: unknown;
};

/** Returns the available Nigerian transfer banks and their Paystack codes. */
export async function listPaystackBanks() {
  const banks = await paystackRequest<PaystackBank[]>(
    "/bank?country=nigeria&currency=NGN&perPage=100",
    { method: "GET" },
  );
  if (!Array.isArray(banks)) {
    throw new PaystackError("Paystack returned an invalid bank list.", 502);
  }
  return banks.filter((bank) =>
    bank &&
    typeof bank.name === "string" &&
    typeof bank.code === "string" &&
    bank.code.trim() &&
    bank.active !== false,
  );
}

/** Resolves a Nigerian bank account before a transfer recipient is created. */
export async function resolvePaystackBankAccount(input: {
  accountNumber: string;
  bankCode: string;
}) {
  if (!/^\d{10}$/.test(input.accountNumber) || !/^\d{2,10}$/.test(input.bankCode)) {
    throw new PaystackError("Enter a valid 10-digit account number and bank code.", 400);
  }
  const query = new URLSearchParams({
    account_number: input.accountNumber,
    bank_code: input.bankCode,
  });
  const result = await paystackRequest<PaystackResolvedBankAccount>(
    `/bank/resolve?${query.toString()}`,
    { method: "GET" },
  );
  if (
    !result ||
    typeof result.account_name !== "string" ||
    !result.account_name.trim() ||
    typeof result.account_number !== "string" ||
    result.account_number !== input.accountNumber
  ) {
    throw new PaystackError("Paystack could not verify the bank account details.", 422);
  }
  return result;
}

/** Creates a Paystack beneficiary. The raw account number is sent only to Paystack. */
export async function createPaystackTransferRecipient(input: {
  accountName: string;
  accountNumber: string;
  bankCode: string;
  description?: string;
}) {
  if (!input.accountName.trim() || !/^\d{10}$/.test(input.accountNumber) || !/^\d{2,10}$/.test(input.bankCode)) {
    throw new PaystackError("Verified bank account details are required.", 400);
  }
  const result = await paystackRequest<PaystackTransferRecipient>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: input.accountName.trim(),
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
      ...(input.description ? { description: input.description.slice(0, 100) } : {}),
    }),
  });
  if (!result || typeof result.recipient_code !== "string" || !result.recipient_code.trim()) {
    throw new PaystackError("Paystack did not return a valid transfer recipient.", 502);
  }
  return result;
}

/**
 * Initiates a transfer from the ReMarket Paystack balance. NGN amounts are
 * expressed in kobo. Final success is determined from transfer webhooks.
 */
export async function initiatePaystackTransfer(input: {
  amountKobo: number;
  recipientCode: string;
  reference: string;
  reason: string;
}) {
  if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo <= 0) {
    throw new PaystackError("Transfer amount must be a positive integer in kobo.", 400);
  }
  if (!/^RCP_[A-Za-z0-9]+$/.test(input.recipientCode)) {
    throw new PaystackError("Invalid Paystack transfer recipient code.", 400);
  }
  if (!/^[a-z0-9_-]{16,50}$/.test(input.reference)) {
    throw new PaystackError("Transfer reference must be 16–50 lowercase letters, numbers, hyphens or underscores.", 400);
  }
  return paystackRequest<PaystackTransfer>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: input.amountKobo,
      currency: "NGN",
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason.slice(0, 100),
    }),
  });
}

/** Reads the provider's current transfer status for reconciliation. */
export async function verifyPaystackTransfer(reference: string) {
  if (!/^[a-z0-9_-]{16,50}$/.test(reference)) {
    throw new PaystackError("Invalid transfer reference.", 400);
  }
  return paystackRequest<PaystackTransfer>(
    `/transfer/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
}

function safeHexEqual(expectedHex: string, receivedHex: string): boolean {
  if (!/^[a-f0-9]{128}$/i.test(receivedHex)) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Supports the current Paystack-Signature (whsec_) format and the legacy
 * x-paystack-signature format. Always pass the exact raw request body.
 */
export function verifyPaystackWebhookSignature(input: {
  rawBody: Buffer;
  currentSignature?: string | null;
  legacySignature?: string | null;
  nowSeconds?: number;
}): boolean {
  const webhookSecrets = [
    process.env.PAYSTACK_WEBHOOK_SECRET?.trim(),
    process.env.PAYSTACK_WEBHOOK_SECRET_PREVIOUS?.trim(),
  ].filter((secret): secret is string => Boolean(secret));

  if (input.currentSignature && webhookSecrets.length > 0) {
    const pieces = input.currentSignature.split(",").map((part) => part.trim());
    const timestampPart = pieces.find((part) => part.startsWith("t="));
    const timestampValue = timestampPart?.slice(2) ?? "";
    if (!/^\d+$/.test(timestampValue)) return false;

    const timestamp = Number(timestampValue);
    const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 300) return false;

    const signatures = pieces
      .filter((part) => part.startsWith("v1="))
      .map((part) => {
        const value = part.slice(3);
        const separator = value.indexOf(":");
        return separator >= 0 ? value.slice(separator + 1) : value;
      })
      .filter((value) => /^[a-f0-9]{128}$/i.test(value));

    if (signatures.length === 0) return false;

    for (const secret of webhookSecrets) {
      const expected = createHmac("sha512", secret)
        .update(`${timestamp}.`)
        .update(input.rawBody)
        .digest("hex");
      for (const signature of signatures) {
        if (safeHexEqual(expected, signature)) return true;
      }
    }
    // Do not accept a bad current signature merely because a legacy header
    // is also present. Configure both secrets during a signing-key rotation.
    return false;
  }

  // Legacy Paystack signature: HMAC-SHA512(raw body, secret key).
  const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (secretKey && input.legacySignature) {
    const expected = createHmac("sha512", secretKey)
      .update(input.rawBody)
      .digest("hex");
    return safeHexEqual(expected, input.legacySignature);
  }

  return false;
}
