import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireSellerAccount } from "@/lib/seller-auth";
import { prisma } from "@/lib/prisma";
import {
  createPaystackTransferRecipient,
  listPaystackBanks,
  PaystackError,
  resolvePaystackBankAccount,
} from "@/lib/paystack";
import {
  initiateQueuedSellerPayout,
  queueAwaitingSellerSettlements,
} from "@/lib/seller-settlement";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
const MAX_BODY_BYTES = 4 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFingerprintSecret(): string {
  const secret = process.env.PAYOUT_ACCOUNT_FINGERPRINT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new PaystackError("PAYOUT_ACCOUNT_FINGERPRINT_SECRET must be configured with at least 32 characters.", 503);
  }
  return secret;
}

function makeAccountFingerprint(sellerId: string, bankCode: string, accountNumber: string): string {
  return createHmac("sha256", getFingerprintSecret())
    .update(`${sellerId}:${bankCode}:${accountNumber}`)
    .digest("hex");
}

function publicAccount(account: {
  id: string;
  bankName: string;
  bankCode: string;
  accountName: string;
  accountNumberLast4: string;
  currency: string;
  verifiedAt: Date;
  updatedAt: Date;
}) {
  return {
    id: account.id,
    bankName: account.bankName,
    bankCode: account.bankCode,
    accountName: account.accountName,
    accountNumberLast4: account.accountNumberLast4,
    currency: account.currency,
    verifiedAt: account.verifiedAt,
    updatedAt: account.updatedAt,
  };
}

export async function GET() {
  const auth = await requireSellerAccount();
  if (!auth.authorized) return auth.response;

  try {
    const [account, settlements] = await Promise.all([
      prisma.sellerPayoutAccount.findFirst({
        where: { sellerId: auth.user.id, isActive: true },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          bankName: true,
          bankCode: true,
          accountName: true,
          accountNumberLast4: true,
          currency: true,
          verifiedAt: true,
          updatedAt: true,
        },
      }),
      prisma.sellerSettlement.findMany({
        where: { sellerId: auth.user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          grossSalesAmount: true,
          commissionRateBps: true,
          commissionAmount: true,
          adjustmentAmount: true,
          netPayoutAmount: true,
          currency: true,
          status: true,
          deliveryConfirmedAt: true,
          paidAt: true,
          failureReason: true,
          sellerOrder: { select: { sellerOrderCode: true } },
          payout: {
            select: {
              status: true,
              reference: true,
              providerTransferCode: true,
              attemptCount: true,
              failureReason: true,
              paidAt: true,
              attempts: {
                orderBy: { attemptNumber: "desc" },
                take: 3,
                select: {
                  attemptNumber: true,
                  reference: true,
                  status: true,
                  failureReason: true,
                  submittedAt: true,
                  paidAt: true,
                  reversedAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        payoutAccount: account ? publicAccount(account) : null,
        settlements,
        transfersEnabled: process.env.PAYSTACK_TRANSFERS_ENABLED?.trim().toLowerCase() === "true",
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("SELLER_PAYOUT_ACCOUNT_GET_ERROR:", error);
    return NextResponse.json({ error: "Unable to load payout information." }, { status: 500, headers: noStore });
  }
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

  if (
    !isRecord(body) ||
    typeof body.accountNumber !== "string" ||
    typeof body.bankCode !== "string" ||
    body.confirmAccountName !== true
  ) {
    return NextResponse.json(
      { error: "A bank code, account number and confirmation of the resolved account name are required." },
      { status: 400, headers: noStore },
    );
  }

  const accountNumber = body.accountNumber.trim();
  const bankCode = body.bankCode.trim();
  if (!/^\d{10}$/.test(accountNumber) || !/^\d{2,10}$/.test(bankCode)) {
    return NextResponse.json({ error: "Enter a valid bank and 10-digit account number." }, { status: 400, headers: noStore });
  }

  try {
    // Resolve again server-side immediately before recipient creation. The
    // account number is never persisted by ReMarket.
    const [resolved, banks] = await Promise.all([
      resolvePaystackBankAccount({ accountNumber, bankCode }),
      listPaystackBanks(),
    ]);
    const bank = banks.find((item) => item.code === bankCode);
    if (!bank) {
      return NextResponse.json({ error: "The selected bank is not supported for Paystack transfers." }, { status: 400, headers: noStore });
    }

    const recipient = await createPaystackTransferRecipient({
      accountName: resolved.account_name,
      accountNumber,
      bankCode,
      description: `ReMarket seller ${auth.user.id.slice(0, 24)}`,
    });
    const fingerprint = makeAccountFingerprint(auth.user.id, bankCode, accountNumber);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      await tx.sellerPayoutAccount.updateMany({
        where: { sellerId: auth.user.id, isActive: true },
        data: { isActive: false },
      });

      const existing = await tx.sellerPayoutAccount.findUnique({
        where: { accountFingerprint: fingerprint },
        select: { id: true },
      });

      const saved = existing
        ? await tx.sellerPayoutAccount.update({
            where: { id: existing.id },
            data: {
              recipientCode: recipient.recipient_code,
              bankCode,
              bankName: bank.name,
              accountName: resolved.account_name,
              accountNumberLast4: accountNumber.slice(-4),
              currency: "NGN",
              isActive: true,
              verifiedAt: now,
            },
            select: {
              id: true,
              bankName: true,
              bankCode: true,
              accountName: true,
              accountNumberLast4: true,
              currency: true,
              verifiedAt: true,
              updatedAt: true,
            },
          })
        : await tx.sellerPayoutAccount.create({
            data: {
              sellerId: auth.user.id,
              provider: "PAYSTACK",
              recipientCode: recipient.recipient_code,
              accountFingerprint: fingerprint,
              bankCode,
              bankName: bank.name,
              accountName: resolved.account_name,
              accountNumberLast4: accountNumber.slice(-4),
              currency: "NGN",
              isActive: true,
              verifiedAt: now,
            },
            select: {
              id: true,
              bankName: true,
              bankCode: true,
              accountName: true,
              accountNumberLast4: true,
              currency: true,
              verifiedAt: true,
              updatedAt: true,
            },
          });

      // Queued payouts have not been sent and can use this newly verified
      // account. A conclusively failed payout can also use the new account for
      // its already-scheduled retry. Pending/initiating/review transfers keep
      // their existing recipient because their provider outcome may be unknown.
      await tx.sellerPayout.updateMany({
        where: { sellerId: auth.user.id, status: "QUEUED" },
        data: { payoutAccountId: saved.id },
      });
      await tx.sellerPayout.updateMany({
        where: {
          sellerId: auth.user.id,
          status: "FAILED",
          nextAttemptAt: { not: null },
        },
        data: { payoutAccountId: saved.id },
      });

      const queuedPayoutIds = await queueAwaitingSellerSettlements(tx, auth.user.id, saved.id);
      return { payoutAccount: saved, queuedPayoutIds };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const payoutResults = [];
    for (const payoutId of result.queuedPayoutIds) {
      payoutResults.push(await initiateQueuedSellerPayout(payoutId));
    }

    return NextResponse.json(
      {
        success: true,
        message: "Your bank account has been verified and saved for seller payouts.",
        payoutAccount: result.payoutAccount,
        queuedSettlements: result.queuedPayoutIds.length,
        payoutResults,
        transfersEnabled: process.env.PAYSTACK_TRANSFERS_ENABLED?.trim().toLowerCase() === "true",
      },
      { status: 200, headers: noStore },
    );
  } catch (error) {
    console.error("SELLER_PAYOUT_ACCOUNT_SAVE_ERROR:", error);
    const status = error instanceof PaystackError
      ? error.status
      : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
        ? 409
        : 500;
    return NextResponse.json(
      { error: error instanceof PaystackError ? error.message : "Unable to verify and save the payout account." },
      { status, headers: noStore },
    );
  }
}
