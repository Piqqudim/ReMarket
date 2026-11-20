import { randomUUID } from "node:crypto";
import {
  Prisma,
  SellerPayoutStatus,
  SellerSettlementStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  initiatePaystackTransfer,
  verifyPaystackTransfer,
} from "@/lib/paystack";

type TransactionClient = Prisma.TransactionClient;

const COMMISSION_RATE_BPS = 500;
const MAX_AUTOMATIC_PAYOUT_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000;
const RECONCILE_AFTER_MS = 5 * 60 * 1000;

export type SettlementCreationResult = {
  settlementId: string;
  payoutId: string | null;
  status: SellerSettlementStatus;
  grossSalesAmount: number;
  commissionRateBps: number;
  commissionAmount: number;
  netPayoutAmount: number;
};

function createTransferReference(): string {
  // Each new Paystack transfer attempt receives a unique reference.
  return `rmkt_payout_${randomUUID().replace(/-/g, "")}`;
}

function calculateCommission(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("Seller order subtotal is not a valid whole-naira amount.");
  }
  // Seller order amounts are stored as Prisma Int values, so this product
  // remains within JavaScript's safe-integer range. Round to the nearest naira.
  const numerator = amount * COMMISSION_RATE_BPS + 5_000;
  if (!Number.isSafeInteger(numerator)) {
    throw new Error("Seller order subtotal is too large to calculate safely.");
  }
  return Math.floor(numerator / 10_000);
}

function retryAt(attemptCount: number): Date | null {
  return attemptCount < MAX_AUTOMATIC_PAYOUT_ATTEMPTS
    ? new Date(Date.now() + RETRY_DELAY_MS)
    : null;
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * Creates an immutable settlement snapshot inside the buyer-confirmation
 * transaction. It does not call Paystack from inside a database transaction.
 */
export async function createSettlementAfterBuyerConfirmation(
  tx: TransactionClient,
  sellerOrderId: string,
): Promise<SettlementCreationResult> {
  const existing = await tx.sellerSettlement.findUnique({
    where: { sellerOrderId },
    include: { payout: true },
  });

  if (existing) {
    return {
      settlementId: existing.id,
      payoutId: existing.payout?.id ?? null,
      status: existing.status,
      grossSalesAmount: existing.grossSalesAmount,
      commissionRateBps: existing.commissionRateBps,
      commissionAmount: existing.commissionAmount,
      netPayoutAmount: existing.netPayoutAmount,
    };
  }

  const sellerOrder = await tx.sellerOrder.findUnique({
    where: { id: sellerOrderId },
    select: {
      id: true,
      sellerId: true,
      sellerOrderCode: true,
      subtotal: true,
      status: true,
      completedAt: true,
      items: { select: { lineTotal: true } },
      order: {
        select: {
          id: true,
          orderCode: true,
          totalAmount: true,
          currency: true,
          paidAt: true,
          payments: {
            select: {
              amount: true,
              currency: true,
              provider: true,
              providerReference: true,
              providerTransactionId: true,
              status: true,
              paidAt: true,
            },
          },
        },
      },
    },
  });

  if (!sellerOrder) throw new Error("Seller order not found for settlement.");
  if (sellerOrder.status !== "COMPLETED" || !sellerOrder.completedAt) {
    throw new Error("Settlement can only be created after buyer-confirmed delivery.");
  }

  const lineTotalsAreValid = sellerOrder.items.every((item) =>
    Number.isSafeInteger(item.lineTotal) && item.lineTotal >= 0,
  );
  const itemTotal = sellerOrder.items.reduce(
    (sum, item) => sum + item.lineTotal,
    0,
  );
  if (
    !lineTotalsAreValid ||
    !Number.isSafeInteger(itemTotal) ||
    itemTotal !== sellerOrder.subtotal
  ) {
    throw new Error("Seller order subtotal does not match its stored product line totals. Manual reconciliation is required.");
  }

  const verifiedPayments = sellerOrder.order.payments.filter((payment) =>
    payment.provider === "PAYSTACK" &&
    payment.status === "SUCCESS" &&
    Boolean(payment.providerReference?.trim()) &&
    Boolean(payment.providerTransactionId?.trim()) &&
    payment.paidAt !== null &&
    payment.amount === sellerOrder.order.totalAmount &&
    payment.currency === sellerOrder.order.currency,
  );
  const hasVerifiedBuyerPayment =
    sellerOrder.order.paidAt !== null &&
    verifiedPayments.length === 1;

  if (!hasVerifiedBuyerPayment) {
    throw new Error(
      verifiedPayments.length > 1
        ? "Multiple successful Paystack charges exist for this order. Payment reconciliation is required before seller settlement."
        : "A single server-verified Paystack payment is required before seller settlement.",
    );
  }

  const grossSalesAmount = sellerOrder.subtotal;
  const commissionAmount = calculateCommission(grossSalesAmount);
  const netPayoutAmount = grossSalesAmount - commissionAmount;

  if (!Number.isSafeInteger(netPayoutAmount) || netPayoutAmount < 0) {
    throw new Error("Calculated seller payout amount is invalid.");
  }

  const payoutAccount = await tx.sellerPayoutAccount.findFirst({
    where: {
      sellerId: sellerOrder.sellerId,
      provider: "PAYSTACK",
      isActive: true,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const settlementStatus = payoutAccount
    ? SellerSettlementStatus.READY
    : SellerSettlementStatus.AWAITING_PAYOUT_ACCOUNT;

  const settlement = await tx.sellerSettlement.create({
    data: {
      sellerOrderId: sellerOrder.id,
      sellerId: sellerOrder.sellerId,
      grossSalesAmount,
      commissionRateBps: COMMISSION_RATE_BPS,
      commissionAmount,
      adjustmentAmount: 0,
      netPayoutAmount,
      currency: sellerOrder.order.currency,
      status: settlementStatus,
      deliveryConfirmedAt: sellerOrder.completedAt,
    },
  });

  let payoutId: string | null = null;
  let finalStatus: SellerSettlementStatus = settlementStatus;

  if (payoutAccount && netPayoutAmount > 0) {
    const reference = createTransferReference();
    const payout = await tx.sellerPayout.create({
      data: {
        settlementId: settlement.id,
        sellerId: sellerOrder.sellerId,
        payoutAccountId: payoutAccount.id,
        provider: "PAYSTACK",
        reference,
        amount: netPayoutAmount,
        currency: sellerOrder.order.currency,
        status: SellerPayoutStatus.QUEUED,
        attempts: {
          create: {
            attemptNumber: 1,
            reference,
            status: SellerPayoutStatus.QUEUED,
          },
        },
      },
      select: { id: true },
    });
    payoutId = payout.id;
  } else if (payoutAccount && netPayoutAmount === 0) {
    finalStatus = SellerSettlementStatus.REQUIRES_REVIEW;
    await tx.sellerSettlement.update({
      where: { id: settlement.id },
      data: {
        status: finalStatus,
        failureReason: "The calculated seller proceeds are zero; automatic payout was not initiated.",
      },
    });
  }

  return {
    settlementId: settlement.id,
    payoutId,
    status: finalStatus,
    grossSalesAmount,
    commissionRateBps: COMMISSION_RATE_BPS,
    commissionAmount,
    netPayoutAmount,
  };
}

/** Creates payout rows for completed settlements that were waiting for a payout account. */
export async function queueAwaitingSellerSettlements(
  tx: TransactionClient,
  sellerId: string,
  payoutAccountId: string,
): Promise<string[]> {
  const settlements = await tx.sellerSettlement.findMany({
    where: {
      sellerId,
      status: SellerSettlementStatus.AWAITING_PAYOUT_ACCOUNT,
      payout: { is: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sellerId: true,
      netPayoutAmount: true,
      currency: true,
    },
  });

  const payoutIds: string[] = [];
  for (const settlement of settlements) {
    if (!Number.isSafeInteger(settlement.netPayoutAmount) || settlement.netPayoutAmount <= 0) {
      await tx.sellerSettlement.update({
        where: { id: settlement.id },
        data: {
          status: SellerSettlementStatus.REQUIRES_REVIEW,
          failureReason: "The stored seller proceeds are not eligible for an automatic transfer.",
        },
      });
      continue;
    }

    const reference = createTransferReference();
    const payout = await tx.sellerPayout.create({
      data: {
        settlementId: settlement.id,
        sellerId: settlement.sellerId,
        payoutAccountId,
        provider: "PAYSTACK",
        reference,
        amount: settlement.netPayoutAmount,
        currency: settlement.currency,
        status: SellerPayoutStatus.QUEUED,
        attempts: {
          create: {
            attemptNumber: 1,
            reference,
            status: SellerPayoutStatus.QUEUED,
          },
        },
      },
      select: { id: true },
    });

    await tx.sellerSettlement.update({
      where: { id: settlement.id },
      data: { status: SellerSettlementStatus.READY, failureReason: null },
    });
    payoutIds.push(payout.id);
  }

  return payoutIds;
}

function settlementStatusForPayout(status: SellerPayoutStatus): SellerSettlementStatus {
  switch (status) {
    case SellerPayoutStatus.PENDING:
      return SellerSettlementStatus.PAYOUT_PENDING;
    case SellerPayoutStatus.SUCCESS:
      return SellerSettlementStatus.PAID;
    case SellerPayoutStatus.FAILED:
      return SellerSettlementStatus.FAILED;
    case SellerPayoutStatus.REVERSED:
    case SellerPayoutStatus.REQUIRES_REVIEW:
      return SellerSettlementStatus.REQUIRES_REVIEW;
    case SellerPayoutStatus.QUEUED:
    case SellerPayoutStatus.INITIATING:
    default:
      return SellerSettlementStatus.READY;
  }
}

async function setPayoutAndSettlementStatus(input: {
  payoutId: string;
  settlementId: string;
  attemptId: string;
  expectedPayoutStatus: SellerPayoutStatus;
  expectedAttemptStatus: SellerPayoutStatus;
  nextStatus: SellerPayoutStatus;
  providerTransferCode?: string | null;
  failureReason?: string | null;
  submittedAt?: Date | null;
  paidAt?: Date | null;
  reversedAt?: Date | null;
  nextAttemptAt?: Date | null;
}) {
  return prisma.$transaction(async (tx) => {
    const payoutUpdate = await tx.sellerPayout.updateMany({
      where: {
        id: input.payoutId,
        status: input.expectedPayoutStatus,
      },
      data: {
        status: input.nextStatus,
        ...(input.providerTransferCode !== undefined ? { providerTransferCode: input.providerTransferCode } : {}),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
        ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
        ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
        ...(input.reversedAt !== undefined ? { reversedAt: input.reversedAt } : {}),
        ...(input.nextAttemptAt !== undefined ? { nextAttemptAt: input.nextAttemptAt } : {}),
      },
    });

    if (payoutUpdate.count !== 1) {
      const current = await tx.sellerPayout.findUnique({
        where: { id: input.payoutId },
        select: { status: true },
      });
      return { changed: false, currentStatus: current?.status ?? "NOT_FOUND" };
    }

    const attemptUpdate = await tx.sellerPayoutAttempt.updateMany({
      where: { id: input.attemptId, status: input.expectedAttemptStatus },
      data: {
        status: input.nextStatus,
        ...(input.providerTransferCode !== undefined ? { providerTransferCode: input.providerTransferCode } : {}),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
        ...(input.submittedAt !== undefined ? { submittedAt: input.submittedAt } : {}),
        ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
        ...(input.reversedAt !== undefined ? { reversedAt: input.reversedAt } : {}),
      },
    });
    if (attemptUpdate.count !== 1) {
      throw new Error("The seller payout attempt changed during the status update.");
    }

    await tx.sellerSettlement.update({
      where: { id: input.settlementId },
      data: {
        status: settlementStatusForPayout(input.nextStatus),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
        ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
      },
    });

    return { changed: true, currentStatus: input.nextStatus };
  });
}

/**
 * Initiates a queued Paystack transfer. A provider's initiation response never
 * marks a payout as paid; only a signed final webhook or provider verification can.
 */
export async function initiateQueuedSellerPayout(payoutId: string) {
  if (process.env.PAYSTACK_TRANSFERS_ENABLED?.trim().toLowerCase() !== "true") {
    return {
      initiated: false,
      status: "QUEUED" as const,
      reason: "Paystack transfers are not enabled in the server environment.",
    };
  }

  const claimed = await prisma.$transaction(async (tx) => {
    const payout = await tx.sellerPayout.findUnique({
      where: { id: payoutId },
      include: {
        payoutAccount: { select: { recipientCode: true, isActive: true, verifiedAt: true } },
        settlement: { select: { id: true } },
        attempts: { orderBy: { attemptNumber: "desc" }, take: 1 },
      },
    });

    if (!payout || payout.status !== SellerPayoutStatus.QUEUED) {
      return { ok: false as const, status: payout?.status ?? "NOT_FOUND" };
    }

    const attempt = payout.attempts[0];
    if (!attempt || attempt.status !== SellerPayoutStatus.QUEUED || attempt.reference !== payout.reference) {
      await tx.sellerPayout.update({
        where: { id: payout.id },
        data: { status: SellerPayoutStatus.REQUIRES_REVIEW, failureReason: "The current transfer attempt is missing or inconsistent." },
      });
      await tx.sellerSettlement.update({
        where: { id: payout.settlementId },
        data: { status: SellerSettlementStatus.REQUIRES_REVIEW, failureReason: "The current transfer attempt is missing or inconsistent." },
      });
      return { ok: false as const, status: SellerPayoutStatus.REQUIRES_REVIEW };
    }

    const updated = await tx.sellerPayout.updateMany({
      where: { id: payout.id, status: SellerPayoutStatus.QUEUED, reference: attempt.reference },
      data: {
        status: SellerPayoutStatus.INITIATING,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
        failureReason: null,
      },
    });
    if (updated.count !== 1) return { ok: false as const, status: "CONFLICT" };

    const attemptUpdate = await tx.sellerPayoutAttempt.updateMany({
      where: { id: attempt.id, status: SellerPayoutStatus.QUEUED },
      data: { status: SellerPayoutStatus.INITIATING },
    });
    if (attemptUpdate.count !== 1) {
      throw new Error("The seller payout attempt changed during initiation.");
    }

    return {
      ok: true as const,
      payout: {
        id: payout.id,
        settlementId: payout.settlementId,
        amount: payout.amount,
        currency: payout.currency,
        reference: attempt.reference,
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        recipientCode: payout.payoutAccount.recipientCode,
        accountActive: payout.payoutAccount.isActive,
        accountVerifiedAt: payout.payoutAccount.verifiedAt,
      },
    };
  });

  if (!claimed.ok) {
    return { initiated: false, status: String(claimed.status), reason: "Payout was not in a claimable queued state." };
  }

  const payout = claimed.payout;
  if (!payout.accountActive || !payout.accountVerifiedAt) {
    const reason = "The seller's verified Paystack payout account is unavailable.";
    await setPayoutAndSettlementStatus({
      payoutId: payout.id,
      settlementId: payout.settlementId,
      attemptId: payout.attemptId,
      expectedPayoutStatus: SellerPayoutStatus.INITIATING,
      expectedAttemptStatus: SellerPayoutStatus.INITIATING,
      nextStatus: SellerPayoutStatus.REQUIRES_REVIEW,
      failureReason: reason,
    });
    return { initiated: false, status: "REQUIRES_REVIEW" as const, reason };
  }

  if (!Number.isSafeInteger(payout.amount) || payout.amount <= 0 || payout.amount > Math.floor(Number.MAX_SAFE_INTEGER / 100)) {
    const reason = "Stored payout amount is invalid.";
    await setPayoutAndSettlementStatus({
      payoutId: payout.id,
      settlementId: payout.settlementId,
      attemptId: payout.attemptId,
      expectedPayoutStatus: SellerPayoutStatus.INITIATING,
      expectedAttemptStatus: SellerPayoutStatus.INITIATING,
      nextStatus: SellerPayoutStatus.REQUIRES_REVIEW,
      failureReason: reason,
    });
    return { initiated: false, status: "REQUIRES_REVIEW" as const, reason };
  }

  try {
    const providerResult = await initiatePaystackTransfer({
      amountKobo: payout.amount * 100,
      recipientCode: payout.recipientCode,
      reference: payout.reference,
      reason: `ReMarket seller settlement ${payout.id}`,
    });

    const responseMatches =
      providerResult.reference === payout.reference &&
      providerResult.amount === payout.amount * 100 &&
      providerResult.currency === payout.currency;

    let nextStatus: SellerPayoutStatus;
    let failureReason: string | null = null;
    if (!responseMatches) {
      nextStatus = SellerPayoutStatus.REQUIRES_REVIEW;
      failureReason = "Paystack's transfer response did not match the stored payout amount, currency or reference.";
    } else if (providerResult.status.toLowerCase() === "otp") {
      nextStatus = SellerPayoutStatus.REQUIRES_REVIEW;
      failureReason = "Paystack requires OTP approval. Automated payouts require transfers to be enabled without per-transfer OTP approval.";
    } else if (providerResult.status.toLowerCase() === "failed") {
      nextStatus = SellerPayoutStatus.FAILED;
      failureReason = "Paystack returned a failed transfer status.";
    } else if (["pending", "success"].includes(providerResult.status.toLowerCase())) {
      nextStatus = SellerPayoutStatus.PENDING;
    } else {
      nextStatus = SellerPayoutStatus.REQUIRES_REVIEW;
      failureReason = `Unrecognized Paystack transfer status: ${providerResult.status.slice(0, 80)}.`;
    }

    const now = new Date();
    const nextAttemptAt = nextStatus === SellerPayoutStatus.FAILED
      ? retryAt(payout.attemptNumber)
      : null;

    const updateResult = await prisma.$transaction(async (tx) => {
      const payoutUpdate = await tx.sellerPayout.updateMany({
        where: {
          id: payout.id,
          reference: payout.reference,
          status: SellerPayoutStatus.INITIATING,
        },
        data: {
          status: nextStatus,
          providerTransferCode: providerResult.transfer_code ?? null,
          submittedAt: nextStatus === SellerPayoutStatus.PENDING ? now : null,
          failureReason,
          nextAttemptAt,
        },
      });
      if (payoutUpdate.count !== 1) {
        const current = await tx.sellerPayout.findUnique({ where: { id: payout.id }, select: { status: true } });
        return { changed: false, status: current?.status ?? "NOT_FOUND" };
      }

      const attemptUpdate = await tx.sellerPayoutAttempt.updateMany({
        where: { id: payout.attemptId, status: SellerPayoutStatus.INITIATING },
        data: {
          status: nextStatus,
          providerTransferCode: providerResult.transfer_code ?? null,
          submittedAt: nextStatus === SellerPayoutStatus.PENDING ? now : null,
          failureReason,
        },
      });
      if (attemptUpdate.count !== 1) {
        throw new Error("The current payout attempt changed before the Paystack response was recorded.");
      }
      await tx.sellerSettlement.update({
        where: { id: payout.settlementId },
        data: {
          status: settlementStatusForPayout(nextStatus),
          failureReason,
        },
      });
      return { changed: true, status: nextStatus };
    });

    return {
      initiated: true,
      status: String(updateResult.status),
      reason: failureReason,
    };
  } catch (error) {
    const providerStatus =
      typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
        ? error.status
        : 502;
    // A timeout/5xx can happen after Paystack accepted the request. Keep the
    // current reference and reconcile it; never create another transfer yet.
    // Timeouts, rate limits and duplicate-reference responses can be
    // ambiguous: Paystack may already have accepted the transfer. Never treat
    // these responses as proof that no transfer exists, and never auto-retry
    // them with a new reference until provider reconciliation is conclusive.
    const nextStatus = providerStatus >= 500 || [408, 409, 429].includes(providerStatus)
      ? SellerPayoutStatus.REQUIRES_REVIEW
      : SellerPayoutStatus.FAILED;
    const reason = error instanceof Error
      ? error.message.slice(0, 500)
      : "Paystack transfer initiation failed.";
    const statusResult = await setPayoutAndSettlementStatus({
      payoutId: payout.id,
      settlementId: payout.settlementId,
      attemptId: payout.attemptId,
      expectedPayoutStatus: SellerPayoutStatus.INITIATING,
      expectedAttemptStatus: SellerPayoutStatus.INITIATING,
      nextStatus,
      failureReason: reason,
      nextAttemptAt: nextStatus === SellerPayoutStatus.FAILED ? retryAt(payout.attemptNumber) : null,
    });
    return { initiated: false, status: String(statusResult.currentStatus), reason };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return isKnownRequestError(error, "P2002");
}

/** Applies a signed Paystack transfer webhook exactly once per event/reference. */
export async function applyPaystackTransferWebhook(input: {
  event: "transfer.success" | "transfer.failed" | "transfer.reversed";
  data: Record<string, unknown>;
}) {
  const reference = typeof input.data.reference === "string" ? input.data.reference.trim() : "";
  if (!reference || !/^[a-z0-9_-]{16,50}$/.test(reference)) {
    throw new Error("Paystack transfer webhook has an invalid reference.");
  }
  const providerAmount = input.data.amount;
  const currency = typeof input.data.currency === "string" ? input.data.currency.toUpperCase() : "";
  const transferCode = typeof input.data.transfer_code === "string" ? input.data.transfer_code : null;
  const eventKey = `PAYSTACK:${input.event}:${reference}`;
  const safePayload: Prisma.InputJsonValue = {
    event: input.event,
    data: {
      reference,
      amount: typeof providerAmount === "number" ? providerAmount : null,
      currency: currency || null,
      status: typeof input.data.status === "string" ? input.data.status : null,
      transfer_code: transferCode,
    },
  };

  try {
    return await prisma.$transaction(async (tx) => {
      const receipt = await tx.webhookReceipt.create({
        data: { provider: "PAYSTACK", eventKey, payload: safePayload },
        select: { id: true },
      });

      const attempt = await tx.sellerPayoutAttempt.findUnique({
        where: { reference },
        select: {
          id: true,
          payoutId: true,
          attemptNumber: true,
          status: true,
          payout: {
            select: {
              id: true,
              settlementId: true,
              reference: true,
              amount: true,
              currency: true,
              status: true,
              attemptCount: true,
            },
          },
        },
      });

      if (!attempt) {
        await tx.webhookReceipt.update({
          where: { id: receipt.id },
          data: { processedAt: new Date(), processingError: "No matching ReMarket payout attempt." },
        });
        return { matched: false, duplicate: false, status: "UNMATCHED" };
      }

      const payout = attempt.payout;
      const dataMatches =
        typeof providerAmount === "number" &&
        Number.isSafeInteger(providerAmount) &&
        providerAmount === payout.amount * 100 &&
        currency === payout.currency;

      if (!dataMatches) {
        const reason = "Paystack transfer webhook did not match the stored payout amount or currency.";
        await tx.sellerPayoutAttempt.update({
          where: { id: attempt.id },
          data: { status: SellerPayoutStatus.REQUIRES_REVIEW, failureReason: reason },
        });
        await tx.sellerPayout.update({
          where: { id: payout.id },
          data: { status: SellerPayoutStatus.REQUIRES_REVIEW, failureReason: reason },
        });
        await tx.sellerSettlement.update({
          where: { id: payout.settlementId },
          data: { status: SellerSettlementStatus.REQUIRES_REVIEW, failureReason: reason },
        });
        await tx.webhookReceipt.update({
          where: { id: receipt.id },
          data: { processedAt: new Date(), processingError: reason },
        });
        return { matched: true, duplicate: false, status: "REQUIRES_REVIEW" };
      }

      const isCurrentAttempt = payout.reference === reference;
      const now = new Date();
      let attemptStatus: SellerPayoutStatus;
      if (input.event === "transfer.success") attemptStatus = SellerPayoutStatus.SUCCESS;
      else if (input.event === "transfer.failed") attemptStatus = SellerPayoutStatus.FAILED;
      else attemptStatus = SellerPayoutStatus.REVERSED;

      const attemptReason = input.event === "transfer.failed"
        ? "Paystack reported that this transfer attempt failed."
        : input.event === "transfer.reversed"
          ? "Paystack reversed this transfer attempt."
          : null;

      const finalStatuses = new Set<SellerPayoutStatus>([
        SellerPayoutStatus.SUCCESS,
        SellerPayoutStatus.FAILED,
        SellerPayoutStatus.REVERSED,
      ]);
      const allowedSuccessToReversal =
        attempt.status === SellerPayoutStatus.SUCCESS &&
        attemptStatus === SellerPayoutStatus.REVERSED;
      const conflictingFinalEvent =
        finalStatuses.has(attempt.status) &&
        finalStatuses.has(attemptStatus) &&
        attempt.status !== attemptStatus &&
        !allowedSuccessToReversal;

      const otherSuccessfulAttempt = await tx.sellerPayoutAttempt.findFirst({
        where: {
          payoutId: payout.id,
          id: { not: attempt.id },
          status: SellerPayoutStatus.SUCCESS,
        },
        select: { id: true, attemptNumber: true },
      });

      const attemptConflictReason = conflictingFinalEvent
        ? "Paystack sent conflicting final statuses for the same transfer attempt. Manual investigation is required."
        : null;
      const attemptUpdate = await tx.sellerPayoutAttempt.updateMany({
        where: { id: attempt.id, status: attempt.status },
        data: conflictingFinalEvent
          ? { failureReason: attemptConflictReason }
          : {
              status: attemptStatus,
              providerTransferCode: transferCode ?? undefined,
              failureReason: attemptReason,
              paidAt: attemptStatus === SellerPayoutStatus.SUCCESS ? now : null,
              reversedAt: attemptStatus === SellerPayoutStatus.REVERSED ? now : null,
            },
      });
      if (attemptUpdate.count !== 1) {
        throw new Error("The payout attempt changed while processing the Paystack webhook.");
      }

      let payoutStatus = payout.status;
      let settlementStatus: SellerSettlementStatus | null = null;
      let payoutFailureReason: string | null | undefined;
      let nextAttemptAt: Date | null | undefined;
      let paidAt: Date | null | undefined;
      let reversedAt: Date | null | undefined;

      const duplicateSuccessfulTransfer = Boolean(otherSuccessfulAttempt) &&
        (attemptStatus === SellerPayoutStatus.SUCCESS ||
          attemptStatus === SellerPayoutStatus.REVERSED ||
          (isCurrentAttempt && attemptStatus === SellerPayoutStatus.FAILED));
      const needsReview = conflictingFinalEvent || duplicateSuccessfulTransfer;

      if (needsReview) {
        payoutStatus = SellerPayoutStatus.REQUIRES_REVIEW;
        settlementStatus = SellerSettlementStatus.REQUIRES_REVIEW;
        payoutFailureReason = attemptConflictReason ??
          `Another transfer attempt (attempt ${otherSuccessfulAttempt?.attemptNumber}) is already recorded as successful. Verify that the seller was not paid twice.`;
        nextAttemptAt = null;
        paidAt = null;
        reversedAt = attemptStatus === SellerPayoutStatus.REVERSED ? now : null;
      } else if (isCurrentAttempt) {
        payoutStatus = attemptStatus;
        settlementStatus = settlementStatusForPayout(attemptStatus);
        payoutFailureReason = attemptReason;
        nextAttemptAt = attemptStatus === SellerPayoutStatus.FAILED
          ? retryAt(payout.attemptCount)
          : null;
        paidAt = attemptStatus === SellerPayoutStatus.SUCCESS ? now : null;
        reversedAt = attemptStatus === SellerPayoutStatus.REVERSED ? now : null;
      } else if (attemptStatus === SellerPayoutStatus.SUCCESS || attemptStatus === SellerPayoutStatus.REVERSED) {
        // A transfer from an older attempt finalized after a newer attempt was
        // created. Stop claiming this settlement is cleanly paid or retryable.
        payoutStatus = SellerPayoutStatus.REQUIRES_REVIEW;
        settlementStatus = SellerSettlementStatus.REQUIRES_REVIEW;
        payoutFailureReason = "An earlier transfer attempt finalized after a newer attempt existed. Check for a duplicate or reversed payout before proceeding.";
        nextAttemptAt = null;
        paidAt = null;
        reversedAt = attemptStatus === SellerPayoutStatus.REVERSED ? now : null;
      }
      // A stale failed event is retained on its attempt but cannot overwrite
      // the status of a newer transfer attempt.

      if (payoutStatus !== payout.status || settlementStatus !== null) {
        await tx.sellerPayout.update({
          where: { id: payout.id },
          data: {
            status: payoutStatus,
            ...(transferCode && isCurrentAttempt ? { providerTransferCode: transferCode } : {}),
            ...(payoutFailureReason !== undefined ? { failureReason: payoutFailureReason } : {}),
            ...(nextAttemptAt !== undefined ? { nextAttemptAt } : {}),
            ...(paidAt !== undefined ? { paidAt } : {}),
            ...(reversedAt !== undefined ? { reversedAt } : {}),
          },
        });
        if (settlementStatus !== null) {
          await tx.sellerSettlement.update({
            where: { id: payout.settlementId },
            data: {
              status: settlementStatus,
              ...(payoutFailureReason !== undefined ? { failureReason: payoutFailureReason } : {}),
              ...(paidAt !== undefined ? { paidAt } : {}),
            },
          });
        }
      }

      await tx.webhookReceipt.update({ where: { id: receipt.id }, data: { processedAt: now, processingError: null } });
      return { matched: true, duplicate: false, status: payoutStatus };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existingReceipt = await prisma.webhookReceipt.findUnique({
        where: { eventKey },
        select: { id: true },
      });
      if (existingReceipt) {
        return { matched: true, duplicate: true, status: "DUPLICATE" };
      }
    }
    throw error;
  }
}

/** Reconciles the current transfer attempt against Paystack's verify endpoint. */
export async function reconcileSellerPayout(payoutId: string) {
  const payout = await prisma.sellerPayout.findUnique({
    where: { id: payoutId },
    include: { attempts: { orderBy: { attemptNumber: "desc" } } },
  });
  if (!payout) throw new Error("Seller payout not found.");

  const attempt = payout.attempts[0];
  if (!attempt || attempt.reference !== payout.reference) {
    const reason = "The current Paystack payout attempt could not be found.";
    await prisma.$transaction(async (tx) => {
      await tx.sellerPayout.update({ where: { id: payout.id }, data: { status: SellerPayoutStatus.REQUIRES_REVIEW, failureReason: reason } });
      await tx.sellerSettlement.update({ where: { id: payout.settlementId }, data: { status: SellerSettlementStatus.REQUIRES_REVIEW, failureReason: reason } });
    });
    return { status: SellerPayoutStatus.REQUIRES_REVIEW, reason };
  }

  let verified: Awaited<ReturnType<typeof verifyPaystackTransfer>>;
  try {
    verified = await verifyPaystackTransfer(attempt.reference);
  } catch (error) {
    // A transfer initiation can time out after Paystack accepted the request.
    // A failed status lookup does not prove that no transfer will settle, so
    // keep the same reference in review and never create a second transfer.
    const reason = error instanceof Error
      ? `Paystack transfer status could not be reconciled: ${error.message.slice(0, 350)}`
      : "Paystack transfer status could not be reconciled. Manual investigation is required.";
    await prisma.$transaction(async (tx) => {
      const update = await tx.sellerPayout.updateMany({
        where: { id: payout.id, reference: attempt.reference, status: payout.status },
        data: { status: SellerPayoutStatus.REQUIRES_REVIEW, failureReason: reason, nextAttemptAt: null },
      });
      if (update.count === 1) {
        await tx.sellerPayoutAttempt.updateMany({
          where: { id: attempt.id, status: attempt.status },
          data: { status: SellerPayoutStatus.REQUIRES_REVIEW, failureReason: reason },
        });
        await tx.sellerSettlement.update({
          where: { id: payout.settlementId },
          data: { status: SellerSettlementStatus.REQUIRES_REVIEW, failureReason: reason },
        });
      }
    });
    const current = await prisma.sellerPayout.findUnique({ where: { id: payout.id }, select: { status: true } });
    return { status: current?.status ?? SellerPayoutStatus.REQUIRES_REVIEW, reason };
  }
  if (
    verified.reference !== attempt.reference ||
    verified.amount !== payout.amount * 100 ||
    verified.currency !== payout.currency
  ) {
    const reason = "Paystack transfer verification does not match the stored payout.";
    await prisma.$transaction(async (tx) => {
      await tx.sellerPayoutAttempt.update({ where: { id: attempt.id }, data: { status: SellerPayoutStatus.REQUIRES_REVIEW, failureReason: reason } });
      await tx.sellerPayout.update({ where: { id: payout.id }, data: { status: SellerPayoutStatus.REQUIRES_REVIEW, failureReason: reason } });
      await tx.sellerSettlement.update({ where: { id: payout.settlementId }, data: { status: SellerSettlementStatus.REQUIRES_REVIEW, failureReason: reason } });
    });
    return { status: SellerPayoutStatus.REQUIRES_REVIEW, reason };
  }

  const providerStatus = verified.status.toLowerCase();
  const providerFinalStatus = providerStatus === "success"
    ? SellerPayoutStatus.SUCCESS
    : providerStatus === "failed"
      ? SellerPayoutStatus.FAILED
      : providerStatus === "reversed"
        ? SellerPayoutStatus.REVERSED
        : null;
  const otherSuccessfulAttempt = payout.attempts.find((item) =>
    item.id !== attempt.id && item.status === SellerPayoutStatus.SUCCESS,
  );
  const conflictingFinalStatus = Boolean(
    providerFinalStatus &&
    new Set<SellerPayoutStatus>([
      SellerPayoutStatus.SUCCESS,
      SellerPayoutStatus.FAILED,
      SellerPayoutStatus.REVERSED,
    ]).has(attempt.status) &&
    attempt.status !== providerFinalStatus &&
    !(attempt.status === SellerPayoutStatus.SUCCESS && providerFinalStatus === SellerPayoutStatus.REVERSED)
  );
  let status: SellerPayoutStatus;
  let paidAt: Date | null = null;
  let reversedAt: Date | null = null;
  let failureReason: string | null = null;
  let nextAttemptAt: Date | null = null;

  if (providerStatus === "success") {
    status = SellerPayoutStatus.SUCCESS;
    paidAt = new Date();
  } else if (providerStatus === "failed") {
    status = SellerPayoutStatus.FAILED;
    failureReason = "Paystack verification reports a failed transfer.";
    nextAttemptAt = retryAt(payout.attemptCount);
  } else if (providerStatus === "reversed") {
    status = SellerPayoutStatus.REVERSED;
    reversedAt = new Date();
    failureReason = "Paystack reports that the transfer was reversed. Investigation is required before retrying.";
  } else if (["pending", "received"].includes(providerStatus)) {
    status = SellerPayoutStatus.PENDING;
  } else {
    status = SellerPayoutStatus.REQUIRES_REVIEW;
    failureReason = providerStatus === "otp"
      ? "Paystack requires OTP approval; automated transfer approval is not enabled."
      : `Paystack returned an inconclusive transfer status: ${providerStatus.slice(0, 80)}.`;
  }

  if (otherSuccessfulAttempt || conflictingFinalStatus) {
    status = SellerPayoutStatus.REQUIRES_REVIEW;
    paidAt = null;
    reversedAt = null;
    nextAttemptAt = null;
    failureReason = conflictingFinalStatus
      ? "Paystack verification conflicts with a previously recorded final status for this transfer attempt. Manual investigation is required."
      : `Another transfer attempt (attempt ${otherSuccessfulAttempt?.attemptNumber}) is already recorded as successful. Verify that the seller was not paid twice.`;
  }

  const update = await prisma.$transaction(async (tx) => {
    const currentPayout = await tx.sellerPayout.updateMany({
      where: { id: payout.id, reference: attempt.reference, status: payout.status },
      data: {
        status,
        providerTransferCode: verified.transfer_code ?? null,
        paidAt,
        reversedAt,
        failureReason,
        nextAttemptAt,
      },
    });
    if (currentPayout.count !== 1) {
      const current = await tx.sellerPayout.findUnique({ where: { id: payout.id }, select: { status: true } });
      return { changed: false, status: current?.status ?? SellerPayoutStatus.REQUIRES_REVIEW };
    }
    const attemptUpdate = await tx.sellerPayoutAttempt.updateMany({
      where: { id: attempt.id, status: attempt.status },
      data: conflictingFinalStatus
        ? { failureReason }
        : {
            status: otherSuccessfulAttempt ? providerFinalStatus ?? status : status,
            providerTransferCode: verified.transfer_code ?? null,
            paidAt: otherSuccessfulAttempt ? (providerFinalStatus === SellerPayoutStatus.SUCCESS ? new Date() : null) : paidAt,
            reversedAt,
            failureReason,
            submittedAt: attempt.submittedAt ?? new Date(),
          },
    });
    if (attemptUpdate.count !== 1) {
      const current = await tx.sellerPayout.findUnique({ where: { id: payout.id }, select: { status: true } });
      return { changed: false, status: current?.status ?? SellerPayoutStatus.REQUIRES_REVIEW };
    }
    await tx.sellerSettlement.update({
      where: { id: payout.settlementId },
      data: {
        status: settlementStatusForPayout(status),
        paidAt,
        failureReason,
      },
    });
    return { changed: true, status };
  });

  return { status: update.status, reason: failureReason };
}

async function queueNextAttemptAfterConclusiveFailure(payoutId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.sellerPayout.findUnique({
      where: { id: payoutId },
      include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 1 } },
    });
    if (
      !payout ||
      payout.status !== SellerPayoutStatus.FAILED ||
      !payout.nextAttemptAt ||
      payout.nextAttemptAt > now ||
      payout.attemptCount >= MAX_AUTOMATIC_PAYOUT_ATTEMPTS
    ) return null;

    const latestAttempt = payout.attempts[0];
    if (!latestAttempt || latestAttempt.reference !== payout.reference || latestAttempt.status !== SellerPayoutStatus.FAILED) {
      return null;
    }

    const reference = createTransferReference();
    const update = await tx.sellerPayout.updateMany({
      where: {
        id: payout.id,
        status: SellerPayoutStatus.FAILED,
        reference: latestAttempt.reference,
        attemptCount: payout.attemptCount,
        nextAttemptAt: { lte: now },
      },
      data: {
        reference,
        providerTransferCode: null,
        status: SellerPayoutStatus.QUEUED,
        nextAttemptAt: null,
        failureReason: null,
      },
    });
    if (update.count !== 1) return null;

    await tx.sellerPayoutAttempt.create({
      data: {
        payoutId: payout.id,
        attemptNumber: payout.attemptCount + 1,
        reference,
        status: SellerPayoutStatus.QUEUED,
      },
    });
    await tx.sellerSettlement.update({
      where: { id: payout.settlementId },
      data: { status: SellerSettlementStatus.READY, failureReason: null },
    });
    return payout.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Runs queued/failed payouts and reconciles unknown outcomes from the provider. */
export async function runSellerPayoutQueue(limit = 25) {
  const now = new Date();
  const payouts = await prisma.sellerPayout.findMany({
    where: {
      OR: [
        { status: SellerPayoutStatus.QUEUED },
        {
          status: SellerPayoutStatus.FAILED,
          nextAttemptAt: { lte: now },
          attemptCount: { lt: MAX_AUTOMATIC_PAYOUT_ATTEMPTS },
        },
        {
          status: { in: [SellerPayoutStatus.INITIATING, SellerPayoutStatus.REQUIRES_REVIEW, SellerPayoutStatus.PENDING] },
          updatedAt: { lte: new Date(now.getTime() - RECONCILE_AFTER_MS) },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
    select: { id: true, status: true },
  });

  const results: Array<{ payoutId: string; status: string; message?: string }> = [];
  for (const payout of payouts) {
    try {
      if (payout.status === SellerPayoutStatus.QUEUED) {
        const initiated = await initiateQueuedSellerPayout(payout.id);
        results.push({ payoutId: payout.id, status: String(initiated.status), message: initiated.reason ?? undefined });
      } else if (payout.status === SellerPayoutStatus.FAILED) {
        const requeuedId = await queueNextAttemptAfterConclusiveFailure(payout.id, now);
        if (!requeuedId) continue;
        const initiated = await initiateQueuedSellerPayout(requeuedId);
        results.push({ payoutId: payout.id, status: String(initiated.status), message: initiated.reason ?? undefined });
      } else {
        const reconciled = await reconcileSellerPayout(payout.id);
        results.push({ payoutId: payout.id, status: String(reconciled.status), message: reconciled.reason ?? undefined });
      }
    } catch (error) {
      results.push({ payoutId: payout.id, status: "REQUIRES_REVIEW", message: error instanceof Error ? error.message : "Unable to reconcile payout." });
    }
  }
  return results;
}
