import { FinancialJournalStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { createDraftJournal, FinancialLedgerError } from "@/lib/finance/ledger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;
const MAX_QUERY_LENGTH = 100;
const MAX_ID_LENGTH = 100;
const MAX_SOURCE_TYPE_LENGTH = 50;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_LINES = 200;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type JournalLineInput = {
  accountId: string;
  debit: string;
  credit: string;
  description?: string | null;
  orderId?: string | null;
  sellerId?: string | null;
};

type CreateJournalBody = {
  reference: string;
  sourceType: string;
  sourceId?: string | null;
  description?: string | null;
  currency: string;
  idempotencyKey?: string | null;
  lines: JournalLineInput[];
};

const journalInclude = {
  lines: {
    orderBy: { createdAt: "asc" as const },
    include: {
      account: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          currency: true,
        },
      },
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.FinancialJournalInclude;

type JournalWithRelations = Prisma.FinancialJournalGetPayload<{
  include: typeof journalInclude;
}>;

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: noStore },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unsupported field(s): ${unknown.join(", ")}.`);
  }
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number | null {
  if (value === null) return fallback;
  const cleaned = value.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) return null;
  return parsed;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${field} cannot exceed ${maxLength} characters.`);
  }
  return cleaned;
}

function cleanOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string or null.`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${field} cannot exceed ${maxLength} characters.`);
  }
  return cleaned || null;
}

function decimalString(value: unknown, field: string): string {
  // Decimal strings avoid floating-point rounding before Prisma.Decimal parses them.
  if (typeof value !== "string") {
    throw new Error(`${field} must be supplied as a decimal string.`);
  }
  const cleaned = value.trim();
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`${field} must be a non-negative amount with at most 2 decimal places.`);
  }
  return cleaned;
}

function parseCreateJournalBody(value: unknown): CreateJournalBody {
  if (!isRecord(value)) throw new Error("Request body must be a JSON object.");
  rejectUnknownFields(
    value,
    ["reference", "sourceType", "sourceId", "description", "currency", "idempotencyKey", "lines"],
    "Request body",
  );

  const reference = requiredText(value.reference, "reference", 100);
  const sourceType = value.sourceType === undefined
    ? "MANUAL"
    : requiredText(value.sourceType, "sourceType", MAX_SOURCE_TYPE_LENGTH);
  const sourceId = cleanOptionalText(value.sourceId, "sourceId", MAX_ID_LENGTH);
  const description = cleanOptionalText(value.description, "description", 2_000);
  const currency = (
    value.currency === undefined
      ? "NGN"
      : requiredText(value.currency, "currency", 3)
  ).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("currency must be a 3-letter ISO currency code.");
  }

  const idempotencyKey = cleanOptionalText(value.idempotencyKey, "idempotencyKey", 200);
  if (!Array.isArray(value.lines) || value.lines.length < 2 || value.lines.length > MAX_LINES) {
    throw new Error(`lines must contain between 2 and ${MAX_LINES} journal lines.`);
  }

  const lines = value.lines.map((rawLine, index): JournalLineInput => {
    if (!isRecord(rawLine)) throw new Error(`lines[${index}] must be an object.`);
    rejectUnknownFields(
      rawLine,
      ["accountId", "debit", "credit", "description", "orderId", "sellerId"],
      `lines[${index}]`,
    );

    const accountId = requiredText(rawLine.accountId, `lines[${index}].accountId`, MAX_ID_LENGTH);
    const debit = decimalString(rawLine.debit, `lines[${index}].debit`);
    const credit = decimalString(rawLine.credit, `lines[${index}].credit`);
    const description = cleanOptionalText(rawLine.description, `lines[${index}].description`, 500);
    const orderId = cleanOptionalText(rawLine.orderId, `lines[${index}].orderId`, MAX_ID_LENGTH);
    const sellerId = cleanOptionalText(rawLine.sellerId, `lines[${index}].sellerId`, MAX_ID_LENGTH);

    return {
      accountId,
      debit,
      credit,
      ...(description !== undefined ? { description } : {}),
      ...(orderId !== undefined ? { orderId } : {}),
      ...(sellerId !== undefined ? { sellerId } : {}),
    };
  });

  return {
    reference,
    sourceType,
    ...(sourceId !== undefined ? { sourceId } : {}),
    ...(description !== undefined ? { description } : {}),
    currency,
    ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    lines,
  };
}

async function readJsonBody(request: Request): Promise<
  | { valid: true; value: unknown }
  | { valid: false; reason: "TOO_LARGE" | "INVALID_JSON" }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      return { valid: false, reason: "INVALID_JSON" };
    }
    if (declaredLength > MAX_BODY_BYTES) return { valid: false, reason: "TOO_LARGE" };
  }

  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return { valid: false, reason: "TOO_LARGE" };
    }
    return { valid: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { valid: false, reason: "INVALID_JSON" };
  }
}

function parseDateBoundary(value: string | null, endOfDay = false): Date | null {
  if (value === null) return null;
  const cleaned = value.trim();
  if (!cleaned) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const date = new Date(`${cleaned}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== cleaned) return null;
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  // Require an explicit timezone for timestamp filters so server timezone
  // settings cannot silently change the requested reporting interval.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(cleaned)) {
    return null;
  }
  const date = new Date(cleaned);
  return Number.isNaN(date.getTime()) ? null : date;
}

function decimalText(value: unknown): string {
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  if (value && typeof value === "object" && "toFixed" in value) {
    const toFixed = (value as { toFixed?: unknown }).toFixed;
    if (typeof toFixed === "function") return String(toFixed.call(value, 2));
  }
  return typeof value === "string" ? value : String(value ?? "0.00");
}

function serializeJournal(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return { value };
  const lines = Array.isArray(value.lines) ? value.lines : [];

  return {
    id: value.id,
    reference: value.reference,
    sourceType: value.sourceType,
    sourceId: value.sourceId ?? null,
    description: value.description ?? null,
    currency: value.currency,
    status: value.status,
    idempotencyKey: value.idempotencyKey ?? null,
    createdById: value.createdById ?? null,
    approvedById: value.approvedById ?? null,
    approvedAt: value.approvedAt ?? null,
    postedAt: value.postedAt ?? null,
    reversesJournalId: value.reversesJournalId ?? null,
    createdAt: value.createdAt ?? null,
    lines: lines.map((rawLine) => {
      if (!isRecord(rawLine)) return rawLine;
      const account = isRecord(rawLine.account) ? rawLine.account : null;
      return {
        id: rawLine.id,
        accountId: rawLine.accountId,
        account: account
          ? {
              id: account.id,
              code: account.code,
              name: account.name,
              type: account.type,
              currency: account.currency,
            }
          : undefined,
        debit: decimalText(rawLine.debit),
        credit: decimalText(rawLine.credit),
        description: rawLine.description ?? null,
        orderId: rawLine.orderId ?? null,
        sellerId: rawLine.sellerId ?? null,
      };
    }),
  };
}

type AmountLine = { debit: Prisma.Decimal; credit: Prisma.Decimal };

function amountTotal(lines: AmountLine[], field: "debit" | "credit"): string {
  return lines
    .reduce((total, line) => total.plus(line[field]), new Prisma.Decimal(0))
    .toFixed(2);
}

function ledgerErrorStatus(error: unknown): number {
  if (error instanceof FinancialLedgerError) {
    const code = error.code.toUpperCase();
    if (code.includes("NOT_FOUND")) return 404;
    if (code.includes("ADMIN_REQUIRED") || code.includes("FORBIDDEN") || code.includes("UNAUTHORIZED")) return 403;
    if (code.includes("CONFLICT") || code.includes("DUPLICATE") || code.includes("ALREADY")) return 409;
    return 400;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") return 409;
    if (error.code === "P2025") return 404;
  }
  return 500;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

/** GET /api/admin/finance/ledger — read-only, filtered journal history. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const params = request.nextUrl.searchParams;
    const page = parsePositiveInteger(params.get("page"), 1, MAX_PAGE);
    const pageSize = parsePositiveInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    if (page === null || pageSize === null) {
      return jsonError("Invalid pagination. Page must be positive and pageSize must be between 1 and 100.", 400);
    }

    const skip = (page - 1) * pageSize;
    if (!Number.isSafeInteger(skip)) return jsonError("The requested page is too large.", 400);

    const q = params.get("q")?.trim() ?? "";
    const status = params.get("status")?.trim().toUpperCase() ?? "";
    const currency = params.get("currency")?.trim().toUpperCase() ?? "";
    const sourceType = params.get("sourceType")?.trim() ?? "";
    const accountId = params.get("accountId")?.trim() ?? "";
    const orderId = params.get("orderId")?.trim() ?? "";
    const sellerId = params.get("sellerId")?.trim() ?? "";

    if (q.length > MAX_QUERY_LENGTH) return jsonError("Search query cannot exceed 100 characters.", 400);
    if (status && status !== "ALL" && status !== FinancialJournalStatus.DRAFT && status !== FinancialJournalStatus.POSTED) {
      return jsonError("status must be ALL, DRAFT or POSTED.", 400);
    }
    if (currency && !/^[A-Z]{3}$/.test(currency)) return jsonError("currency must be a 3-letter code.", 400);
    if (sourceType.length > MAX_SOURCE_TYPE_LENGTH) return jsonError("sourceType is too long.", 400);
    if (accountId.length > MAX_ID_LENGTH || orderId.length > MAX_ID_LENGTH || sellerId.length > MAX_ID_LENGTH) {
      return jsonError("Account, order and seller references cannot exceed 100 characters.", 400);
    }

    const fromPresent = params.has("from");
    const toPresent = params.has("to");
    const from = parseDateBoundary(params.get("from"));
    const to = parseDateBoundary(params.get("to"), true);
    if (fromPresent && !from) return jsonError("from must be a valid date or timezone-qualified timestamp.", 400);
    if (toPresent && !to) return jsonError("to must be a valid date or timezone-qualified timestamp.", 400);
    if (from && to && from > to) return jsonError("from cannot be later than to.", 400);

    const filters: Prisma.FinancialJournalWhereInput[] = [];
    if (status && status !== "ALL") filters.push({ status: status as FinancialJournalStatus });
    if (currency) filters.push({ currency });
    if (sourceType) filters.push({ sourceType: { equals: sourceType, mode: "insensitive" } });
    if (from || to) {
      filters.push({
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      });
    }
    if (accountId) filters.push({ lines: { some: { accountId } } });
    if (orderId) filters.push({ lines: { some: { orderId } } });
    if (sellerId) filters.push({ lines: { some: { sellerId } } });

    if (q) {
      filters.push({
        OR: [
          { reference: { contains: q, mode: "insensitive" } },
          { sourceType: { contains: q, mode: "insensitive" } },
          { sourceId: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { lines: { some: { account: { code: { contains: q, mode: "insensitive" } } } } },
          { lines: { some: { account: { name: { contains: q, mode: "insensitive" } } } } },
        ],
      });
    }

    const where: Prisma.FinancialJournalWhereInput = filters.length ? { AND: filters } : {};
    const [total, statusGroups, journals] = await Promise.all([
      prisma.financialJournal.count({ where }),
      prisma.financialJournal.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      prisma.financialJournal.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        include: journalInclude,
      }),
    ]);

    const statusCounts = { DRAFT: 0, POSTED: 0 };
    for (const group of statusGroups) {
      statusCounts[group.status] = group._count._all;
    }

    const serialized = journals.map((journal: JournalWithRelations) => ({
      ...serializeJournal(journal),
      createdBy: journal.createdBy,
      approvedBy: journal.approvedBy,
      debitTotal: amountTotal(journal.lines, "debit"),
      creditTotal: amountTotal(journal.lines, "credit"),
      balanced: amountTotal(journal.lines, "debit") === amountTotal(journal.lines, "credit"),
    }));

    return NextResponse.json(
      {
        success: true,
        journals: serialized,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasPreviousPage: page > 1,
          hasNextPage: page < Math.ceil(total / pageSize),
        },
        summary: {
          total,
          draftCount: statusCounts.DRAFT,
          postedCount: statusCounts.POSTED,
          pageDebitTotal: journals
            .reduce((sum, journal) => sum.plus(amountTotal(journal.lines, "debit")), new Prisma.Decimal(0))
            .toFixed(2),
          pageCreditTotal: journals
            .reduce((sum, journal) => sum.plus(amountTotal(journal.lines, "credit")), new Prisma.Decimal(0))
            .toFixed(2),
        },
        generatedAt: new Date().toISOString(),
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("Admin financial ledger GET failed:", error);
    return jsonError("Unable to load financial journal history.", 500);
  }
}

/** POST /api/admin/finance/ledger — creates a DRAFT journal only. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const bodyResult = await readJsonBody(request);
    if (!bodyResult.valid) {
      return bodyResult.reason === "TOO_LARGE"
        ? jsonError("Request body is too large.", 413)
        : jsonError("Request body must contain valid JSON.", 400);
    }

    let body: CreateJournalBody;
    try {
      body = parseCreateJournalBody(bodyResult.value);
    } catch (error) {
      return jsonError(errorMessage(error), 400);
    }

    const headerKey = request.headers.get("idempotency-key")?.trim();
    if (headerKey) {
      if (headerKey.length > 200) return jsonError("Idempotency-Key header cannot exceed 200 characters.", 400);
      if (body.idempotencyKey && body.idempotencyKey !== headerKey) {
        return jsonError("The idempotency key in the header and body must match.", 400);
      }
      body.idempotencyKey = headerKey;
    }

    const result = await prisma.$transaction((tx) =>
      createDraftJournal(tx, {
        ...body,
        createdById: auth.user.id,
      }),
    );

    return NextResponse.json(
      {
        success: true,
        replayed: result.alreadyExists,
        message: result.alreadyExists
          ? "The existing draft journal was returned for this idempotency key."
          : "Draft journal created. A different administrator must approve it before posting.",
        journal: serializeJournal(result.journal),
      },
      {
        status: result.alreadyExists ? 200 : 201,
        headers: noStore,
      },
    );
  } catch (error) {
    const status = ledgerErrorStatus(error);
    if (status >= 500) {
      console.error("Admin financial journal creation failed:", error);
      return jsonError("Unable to create the financial journal. Please check the server logs.", 500);
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage(error),
        ...(error instanceof FinancialLedgerError ? { code: error.code } : {}),
      },
      { status, headers: noStore },
    );
  }
}
