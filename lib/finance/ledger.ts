import {
  FinancialJournalStatus,
  LedgerAccountType,
  Prisma,
  Role,
} from "@prisma/client";

import { writeAdminAuditLog } from "@/lib/admin-audit";

/**
 * All exported functions accept a Prisma transaction client.
 * Call them inside prisma.$transaction(async (tx) => ...).
 * This keeps journal changes and their audit records atomic.
 */
type FinanceTransaction = Prisma.TransactionClient;
type MoneyInput = string;

type JournalLineInput = {
  accountId: string;
  debit?: MoneyInput;
  credit?: MoneyInput;
  description?: string | null;
  orderId?: string | null;
  sellerId?: string | null;
};

export type CreateDraftJournalInput = {
  reference: string;
  createdById: string;
  lines: JournalLineInput[];
  sourceType?: string;
  sourceId?: string | null;
  description?: string | null;
  currency?: string;
  idempotencyKey?: string | null;
};

export class FinancialLedgerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FinancialLedgerError";
    this.code = code;
  }
}

const MAX_REFERENCE_LENGTH = 100;
const MAX_SOURCE_TYPE_LENGTH = 50;
const MAX_SOURCE_ID_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_LINE_DESCRIPTION_LENGTH = 500;
const MAX_LINES = 200;
const MAX_CURRENCY_LENGTH = 3;
const MAX_ACCOUNT_ID_LENGTH = 100;
const MAX_ADMIN_ID_LENGTH = 100;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

function requiredText(value: string, field: string, maxLength: number): string {
  const result = value.trim();
  if (!result) throw new FinancialLedgerError("INVALID_INPUT", `${field} is required.`);
  if (result.length > maxLength) throw new FinancialLedgerError("INVALID_INPUT", `${field} is too long.`);
  return result;
}

function optionalText(value: string | null | undefined, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  const result = value.trim();
  if (result.length > maxLength) throw new FinancialLedgerError("INVALID_INPUT", `${field} is too long.`);
  return result || null;
}

function parseMoney(value: MoneyInput | undefined, field: string): Prisma.Decimal {
  const input = value === undefined ? "0.00" : value;
  if (typeof input !== "string" || !AMOUNT_PATTERN.test(input.trim())) {
    throw new FinancialLedgerError("INVALID_AMOUNT", `${field} must be a non-negative decimal string with no more than 2 decimal places.`);
  }

  const amount = new Prisma.Decimal(input.trim());
  if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
    throw new FinancialLedgerError("INVALID_AMOUNT", `${field} is invalid.`);
  }
  return amount.toDecimalPlaces(2);
}

function formatMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function normalizeLine(line: JournalLineInput, index: number) {
  const accountId = requiredText(line.accountId, `Line ${index + 1} accountId`, MAX_ACCOUNT_ID_LENGTH);
  const debit = parseMoney(line.debit, `Line ${index + 1} debit`);
  const credit = parseMoney(line.credit, `Line ${index + 1} credit`);
  const debitPositive = debit.greaterThan(0);
  const creditPositive = credit.greaterThan(0);

  if (debitPositive === creditPositive) {
    throw new FinancialLedgerError("INVALID_JOURNAL_LINE", `Line ${index + 1} must contain either a debit or a credit, but not both.`);
  }

  return {
    accountId,
    debit,
    credit,
    description: optionalText(line.description, `Line ${index + 1} description`, MAX_LINE_DESCRIPTION_LENGTH),
    orderId: optionalText(line.orderId, `Line ${index + 1} orderId`, MAX_SOURCE_ID_LENGTH),
    sellerId: optionalText(line.sellerId, `Line ${index + 1} sellerId`, MAX_SOURCE_ID_LENGTH),
  };
}

function normalizeLines(lines: JournalLineInput[]) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > MAX_LINES) {
    throw new FinancialLedgerError("INVALID_LINES", `A journal must contain between 2 and ${MAX_LINES} lines.`);
  }

  const normalized = lines.map(normalizeLine);
  const debitTotal = normalized.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
  const creditTotal = normalized.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0));

  if (!debitTotal.greaterThan(0) || !creditTotal.greaterThan(0) || !debitTotal.equals(creditTotal)) {
    throw new FinancialLedgerError("UNBALANCED_JOURNAL", "Total debits must equal total credits and both totals must be greater than zero.");
  }

  return { lines: normalized, debitTotal, creditTotal };
}

async function assertAdmin(tx: FinanceTransaction, adminId: string): Promise<string> {
  const id = requiredText(adminId, "Admin ID", MAX_ADMIN_ID_LENGTH);
  const user = await tx.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user || user.role !== Role.ADMIN) {
    throw new FinancialLedgerError("ADMIN_REQUIRED", "A valid Admin account is required for this financial operation.");
  }
  return id;
}

async function validateAccounts(
  tx: FinanceTransaction,
  lines: ReturnType<typeof normalizeLines>["lines"],
  currency: string,
  allowInactive: boolean,
) {
  const ids = [...new Set(lines.map((line) => line.accountId))];
  const accounts = await tx.financialAccount.findMany({
    where: { id: { in: ids } },
    select: { id: true, code: true, name: true, type: true, currency: true, isActive: true },
  });
  const byId = new Map(accounts.map((account) => [account.id, account]));

  for (const id of ids) {
    const account = byId.get(id);
    if (!account) throw new FinancialLedgerError("ACCOUNT_NOT_FOUND", `Financial account ${id} was not found.`);
    if (!allowInactive && !account.isActive) {
      throw new FinancialLedgerError("ACCOUNT_INACTIVE", `Financial account ${account.code} is inactive.`);
    }
    if (account.currency !== currency) {
      throw new FinancialLedgerError("CURRENCY_MISMATCH", `Financial account ${account.code} uses ${account.currency}, not ${currency}.`);
    }
  }

  return byId;
}

function sortedLineFingerprint(lines: Array<{
  accountId: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  description: string | null;
  orderId: string | null;
  sellerId: string | null;
}>) {
  return lines.map((line) => ({
    accountId: line.accountId,
    debit: formatMoney(line.debit),
    credit: formatMoney(line.credit),
    description: line.description ?? null,
    orderId: line.orderId ?? null,
    sellerId: line.sellerId ?? null,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function journalSnapshot(journal: {
  id: string;
  reference: string;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  currency: string;
  status: FinancialJournalStatus;
  createdById: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  postedAt: Date | null;
  reversesJournalId: string | null;
  createdAt: Date;
  lines: Array<{
    id?: string;
    accountId: string;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    description: string | null;
    orderId: string | null;
    sellerId: string | null;
  }>;
}): Prisma.InputJsonObject {
  return {
    id: journal.id,
    reference: journal.reference,
    sourceType: journal.sourceType,
    sourceId: journal.sourceId,
    description: journal.description,
    currency: journal.currency,
    status: journal.status,
    createdById: journal.createdById,
    approvedById: journal.approvedById,
    approvedAt: journal.approvedAt?.toISOString() ?? null,
    postedAt: journal.postedAt?.toISOString() ?? null,
    reversesJournalId: journal.reversesJournalId,
    createdAt: journal.createdAt.toISOString(),
    lines: journal.lines.map((line) => ({
      ...(line.id ? { id: line.id } : {}),
      accountId: line.accountId,
      debit: formatMoney(line.debit),
      credit: formatMoney(line.credit),
      description: line.description,
      orderId: line.orderId,
      sellerId: line.sellerId,
    })),
  };
}

function buildCreateFingerprint(input: {
  sourceType: string;
  sourceId: string | null;
  description: string | null;
  currency: string;
  createdById: string;
  reversesJournalId: string | null;
  lines: ReturnType<typeof normalizeLines>["lines"];
}) {
  return JSON.stringify({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    description: input.description,
    currency: input.currency,
    createdById: input.createdById,
    reversesJournalId: input.reversesJournalId,
    lines: sortedLineFingerprint(input.lines),
  });
}

async function createDraftJournalInternal(
  tx: FinanceTransaction,
  input: CreateDraftJournalInput,
  reversesJournalId: string | null,
  allowInactiveAccounts: boolean,
) {
  const reference = requiredText(input.reference, "Journal reference", MAX_REFERENCE_LENGTH);
  const createdById = await assertAdmin(tx, input.createdById);
  const sourceType = requiredText(input.sourceType ?? "MANUAL", "Source type", MAX_SOURCE_TYPE_LENGTH);
  const sourceId = optionalText(input.sourceId, "Source ID", MAX_SOURCE_ID_LENGTH);
  const description = optionalText(input.description, "Journal description", MAX_DESCRIPTION_LENGTH);
  const currency = requiredText(input.currency ?? "NGN", "Currency", MAX_CURRENCY_LENGTH).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new FinancialLedgerError("INVALID_CURRENCY", "Currency must be a 3-letter code.");

  const idempotencyKey = optionalText(input.idempotencyKey, "Idempotency key", MAX_IDEMPOTENCY_KEY_LENGTH);
  const normalized = normalizeLines(input.lines);
  const fingerprint = buildCreateFingerprint({
    sourceType, sourceId, description, currency, createdById,
    reversesJournalId, lines: normalized.lines,
  });

  if (idempotencyKey) {
    const existing = await tx.financialJournal.findUnique({
      where: { idempotencyKey },
      include: { lines: true },
    });
    if (existing) {
      const existingFingerprint = buildCreateFingerprint({
        sourceType: existing.sourceType,
        sourceId: existing.sourceId,
        description: existing.description,
        currency: existing.currency,
        createdById: existing.createdById ?? "",
        reversesJournalId: existing.reversesJournalId,
        lines: existing.lines,
      });
      if (existingFingerprint !== fingerprint) {
        throw new FinancialLedgerError("IDEMPOTENCY_CONFLICT", "This idempotency key was already used for a different financial journal.");
      }
      return { journal: existing, alreadyExists: true };
    }
  }

  await validateAccounts(tx, normalized.lines, currency, allowInactiveAccounts);

  const journal = await tx.financialJournal.create({
    data: {
      reference,
      sourceType,
      sourceId,
      description,
      currency,
      status: FinancialJournalStatus.DRAFT,
      idempotencyKey,
      createdById,
      reversesJournalId,
      lines: {
        create: normalized.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          orderId: line.orderId,
          sellerId: line.sellerId,
        })),
      },
    },
    include: { lines: true },
  });

  await writeAdminAuditLog(tx, {
    adminId: createdById,
    action: reversesJournalId ? "FINANCIAL_REVERSAL_DRAFT_CREATED" : "FINANCIAL_JOURNAL_DRAFT_CREATED",
    entityType: "FINANCIAL_JOURNAL",
    entityId: journal.id,
    afterData: journalSnapshot(journal),
    metadata: {
      reference,
      sourceType,
      sourceId,
      currency,
      debitTotal: formatMoney(normalized.debitTotal),
      creditTotal: formatMoney(normalized.creditTotal),
      lineCount: normalized.lines.length,
      reversesJournalId,
    },
  });

  return { journal, alreadyExists: false };
}

/**
 * Creates a DRAFT journal. This does not affect account balances.
 * Amounts must be decimal strings (for example "1250.00"), never JS floats.
 */
export async function createDraftJournal(
  tx: FinanceTransaction,
  input: CreateDraftJournalInput,
) {
  return createDraftJournalInternal(tx, input, null, false);
}

/**
 * Approves a DRAFT journal. The approver must be a different Admin
 * from the creator. Approval is recorded but does not post the journal.
 */
export async function approveDraftJournal(
  tx: FinanceTransaction,
  input: { journalId: string; approverId: string },
) {
  const journalId = requiredText(input.journalId, "Journal ID", MAX_REFERENCE_LENGTH);
  const approverId = await assertAdmin(tx, input.approverId);
  const journal = await tx.financialJournal.findUnique({
    where: { id: journalId },
    include: { lines: true },
  });
  if (!journal) throw new FinancialLedgerError("JOURNAL_NOT_FOUND", "Financial journal was not found.");

  if (journal.status === FinancialJournalStatus.POSTED) {
    if (journal.approvedById === approverId) return { journal, alreadyApproved: true };
    throw new FinancialLedgerError("JOURNAL_ALREADY_POSTED", "This journal has already been posted.");
  }
  if (!journal.createdById) throw new FinancialLedgerError("MISSING_MAKER", "This journal has no recorded creator and cannot be approved.");
  if (journal.createdById === approverId) throw new FinancialLedgerError("MAKER_CHECKER_REQUIRED", "The creator cannot approve their own financial journal.");
  if (journal.approvedById) {
    if (journal.approvedById === approverId) return { journal, alreadyApproved: true };
    throw new FinancialLedgerError("ALREADY_APPROVED", "This journal has already been approved by another Admin.");
  }

  const totals = normalizeLines(journal.lines.map((line) => ({
    accountId: line.accountId,
    debit: formatMoney(line.debit),
    credit: formatMoney(line.credit),
    description: line.description,
    orderId: line.orderId,
    sellerId: line.sellerId,
  })));
  await validateAccounts(tx, totals.lines, journal.currency, journal.reversesJournalId !== null);

  const now = new Date();
  const update = await tx.financialJournal.updateMany({
    where: { id: journal.id, status: FinancialJournalStatus.DRAFT, approvedById: null, approvedAt: null },
    data: { approvedById: approverId, approvedAt: now },
  });
  if (update.count !== 1) throw new FinancialLedgerError("JOURNAL_STATE_CONFLICT", "The journal changed during approval. Refresh and try again.");

  const approved = await tx.financialJournal.findUniqueOrThrow({ where: { id: journal.id }, include: { lines: true } });
  await writeAdminAuditLog(tx, {
    adminId: approverId,
    action: "FINANCIAL_JOURNAL_APPROVED",
    entityType: "FINANCIAL_JOURNAL",
    entityId: journal.id,
    beforeData: journalSnapshot(journal),
    afterData: journalSnapshot(approved),
    metadata: { reference: journal.reference, createdById: journal.createdById },
  });

  return { journal: approved, alreadyApproved: false };
}

/**
 * Posts an approved DRAFT journal. The posting Admin must be the recorded
 * checker (and therefore must differ from createdById). Posted journals
 * are immutable; correct them with a reversal journal instead.
 */
export async function postApprovedJournal(
  tx: FinanceTransaction,
  input: { journalId: string; adminId: string },
) {
  const journalId = requiredText(input.journalId, "Journal ID", MAX_REFERENCE_LENGTH);
  const adminId = await assertAdmin(tx, input.adminId);
  const journal = await tx.financialJournal.findUnique({
    where: { id: journalId },
    include: { lines: true },
  });
  if (!journal) throw new FinancialLedgerError("JOURNAL_NOT_FOUND", "Financial journal was not found.");
  if (journal.status === FinancialJournalStatus.POSTED) return { journal, alreadyPosted: true };
  if (!journal.createdById || !journal.approvedById || !journal.approvedAt) {
    throw new FinancialLedgerError("JOURNAL_NOT_APPROVED", "The journal must be approved before it can be posted.");
  }
  if (journal.createdById === journal.approvedById) {
    throw new FinancialLedgerError("MAKER_CHECKER_REQUIRED", "The creator cannot approve their own financial journal.");
  }
  if (journal.approvedById !== adminId) {
    throw new FinancialLedgerError("APPROVER_REQUIRED", "Only the recorded approving Admin can post this journal.");
  }

  const totals = normalizeLines(journal.lines.map((line) => ({
    accountId: line.accountId,
    debit: formatMoney(line.debit),
    credit: formatMoney(line.credit),
    description: line.description,
    orderId: line.orderId,
    sellerId: line.sellerId,
  })));
  await validateAccounts(tx, totals.lines, journal.currency, journal.reversesJournalId !== null);

  const postedAt = new Date();
  const update = await tx.financialJournal.updateMany({
    where: {
      id: journal.id,
      status: FinancialJournalStatus.DRAFT,
      approvedById: adminId,
      approvedAt: { not: null },
    },
    data: { status: FinancialJournalStatus.POSTED, postedAt },
  });
  if (update.count !== 1) throw new FinancialLedgerError("JOURNAL_STATE_CONFLICT", "The journal changed during posting. Refresh and try again.");

  const posted = await tx.financialJournal.findUniqueOrThrow({ where: { id: journal.id }, include: { lines: true } });
  await writeAdminAuditLog(tx, {
    adminId,
    action: "FINANCIAL_JOURNAL_POSTED",
    entityType: "FINANCIAL_JOURNAL",
    entityId: journal.id,
    beforeData: journalSnapshot(journal),
    afterData: journalSnapshot(posted),
    metadata: {
      reference: journal.reference,
      debitTotal: formatMoney(totals.debitTotal),
      creditTotal: formatMoney(totals.creditTotal),
      lineCount: totals.lines.length,
    },
  });

  return { journal: posted, alreadyPosted: false };
}

/**
 * Creates a DRAFT reversal for an already-posted journal.
 * The reversal must then be approved and posted through the normal
 * maker-checker functions. An original journal can only be reversed once.
 */
export async function createReversalDraft(
  tx: FinanceTransaction,
  input: {
    journalId: string;
    reference: string;
    createdById: string;
    idempotencyKey?: string | null;
    description?: string | null;
  },
) {
  const originalId = requiredText(input.journalId, "Original journal ID", MAX_REFERENCE_LENGTH);
  const original = await tx.financialJournal.findUnique({
    where: { id: originalId },
    include: { lines: true },
  });
  if (!original) throw new FinancialLedgerError("JOURNAL_NOT_FOUND", "Original financial journal was not found.");
  if (original.status !== FinancialJournalStatus.POSTED || !original.postedAt) {
    throw new FinancialLedgerError("JOURNAL_NOT_POSTED", "Only a posted journal can be reversed.");
  }

  const existingReversal = await tx.financialJournal.findUnique({
    where: { reversesJournalId: original.id },
    include: { lines: true },
  });
  if (existingReversal) {
    if (input.idempotencyKey && existingReversal.idempotencyKey === input.idempotencyKey.trim()) {
      return { journal: existingReversal, alreadyExists: true };
    }
    throw new FinancialLedgerError("ALREADY_REVERSED", "This journal already has a reversal journal.");
  }

  const lines: JournalLineInput[] = original.lines.map((line) => ({
    accountId: line.accountId,
    debit: formatMoney(line.credit),
    credit: formatMoney(line.debit),
    description: line.description ? `Reversal: ${line.description}` : `Reversal of ${original.reference}`,
    orderId: line.orderId,
    sellerId: line.sellerId,
  }));

  const result = await createDraftJournalInternal(tx, {
    reference: input.reference,
    createdById: input.createdById,
    sourceType: "REVERSAL",
    sourceId: original.id,
    description: optionalText(input.description, "Reversal description", MAX_DESCRIPTION_LENGTH)
      ?? `Reversal of journal ${original.reference}`,
    currency: original.currency,
    idempotencyKey: input.idempotencyKey,
    lines,
  }, original.id, true);

  return result;
}

/**
 * Returns posted totals and the normal-side balance for one account.
 * Asset/expense balances are debit minus credit; liability/equity/revenue
 * balances are credit minus debit. Amounts are returned as exact strings.
 */
export async function getFinancialAccountBalance(
  tx: FinanceTransaction,
  accountIdInput: string,
) {
  const accountId = requiredText(accountIdInput, "Account ID", MAX_ACCOUNT_ID_LENGTH);
  const account = await tx.financialAccount.findUnique({
    where: { id: accountId },
    select: { id: true, code: true, name: true, type: true, currency: true, isActive: true },
  });
  if (!account) throw new FinancialLedgerError("ACCOUNT_NOT_FOUND", "Financial account was not found.");

  const totals = await tx.financialJournalLine.aggregate({
    where: {
      accountId,
      journal: { is: { status: FinancialJournalStatus.POSTED } },
    },
    _sum: { debit: true, credit: true },
  });

  const debits = totals._sum.debit ?? new Prisma.Decimal(0);
  const credits = totals._sum.credit ?? new Prisma.Decimal(0);
  const debitNormal = account.type === LedgerAccountType.ASSET || account.type === LedgerAccountType.EXPENSE;
  const balance = debitNormal ? debits.minus(credits) : credits.minus(debits);

  return {
    account,
    debitTotal: formatMoney(debits),
    creditTotal: formatMoney(credits),
    balance: formatMoney(balance),
    normalBalance: debitNormal ? "DEBIT" : "CREDIT",
  };
}

/** Returns exact journal totals after checking that the lines balance. */
export function getBalancedJournalTotals(lines: JournalLineInput[]) {
  const result = normalizeLines(lines);
  return {
    debitTotal: formatMoney(result.debitTotal),
    creditTotal: formatMoney(result.creditTotal),
    lineCount: result.lines.length,
  };
}
