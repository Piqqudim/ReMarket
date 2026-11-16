import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  createDraftJournal,
  FinancialLedgerError,
} from "@/lib/finance/ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    orderBy: { createdAt: "asc" },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getAdminId(context: unknown): string | null {
  // Supports common requireAdmin() result shapes without assuming that the
  // helper returns a specific session wrapper.
  if (!isRecord(context)) return null;
  const directCandidates = [context.id, context.adminId, context.userId];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  for (const key of ["user", "admin", "session"]) {
    const nested = context[key];
    if (!isRecord(nested)) continue;
    const candidates = [nested.id, nested.adminId, nested.userId];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    if (isRecord(nested.user) && typeof nested.user.id === "string") {
      return nested.user.id;
    }
  }
  return null;
}

async function authorizeAdmin() {
  const context = await requireAdmin();
  if (context instanceof Response) {
    return { response: context as Response, adminId: null as string | null };
  }

  const adminId = getAdminId(context);
  if (!adminId) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized. An administrator session is required." },
        { status: 401 },
      ) as Response,
      adminId: null as string | null,
    };
  }
  return { response: null, adminId };
}

function cleanOptionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${field} cannot exceed ${maxLength} characters.`);
  }
  return cleaned || null;
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

function decimalString(value: unknown, field: string): string {
  // Amounts must remain decimal strings so JSON number conversion cannot
  // introduce binary floating-point rounding.
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

  const reference = requiredText(value.reference, "reference", 120);
  const sourceType = value.sourceType === undefined
    ? "MANUAL"
    : requiredText(value.sourceType, "sourceType", 50);
  const sourceId = cleanOptionalText(value.sourceId, "sourceId", 100);
  const description = cleanOptionalText(value.description, "description", 1000);
  const currency = (value.currency === undefined
    ? "NGN"
    : requiredText(value.currency, "currency", 3)).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("currency must be a 3-letter ISO currency code.");
  }

  const idempotencyKey = cleanOptionalText(value.idempotencyKey, "idempotencyKey", 200);
  if (!Array.isArray(value.lines) || value.lines.length < 2 || value.lines.length > 200) {
    throw new Error("lines must contain between 2 and 200 journal lines.");
  }

  const lines = value.lines.map((rawLine, index): JournalLineInput => {
    if (!isRecord(rawLine)) throw new Error(`lines[${index}] must be an object.`);
    const accountId = requiredText(rawLine.accountId, `lines[${index}].accountId`, 100);
    const debit = decimalString(rawLine.debit, `lines[${index}].debit`);
    const credit = decimalString(rawLine.credit, `lines[${index}].credit`);
    const lineDescription = cleanOptionalText(
      rawLine.description,
      `lines[${index}].description`,
      500,
    );
    const orderId = cleanOptionalText(rawLine.orderId, `lines[${index}].orderId`, 100);
    const sellerId = cleanOptionalText(rawLine.sellerId, `lines[${index}].sellerId`, 100);

    return {
      accountId,
      debit,
      credit,
      ...(lineDescription !== undefined ? { description: lineDescription } : {}),
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

function ledgerErrorStatus(error: unknown): number {
  if (error instanceof FinancialLedgerError) {
    const code = String((error as Error & { code?: string }).code ?? "").toUpperCase();
    if (code.includes("NOT_FOUND")) return 404;
    if (code.includes("FORBIDDEN") || code.includes("UNAUTHORIZED")) return 403;
    if (code.includes("CONFLICT") || code.includes("DUPLICATE")) return 409;
    return 400;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") return 409;
    if (error.code === "P2025") return 404;
  }
  return 500;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function parseDateBoundary(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;
  const input = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`
    : value;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type JournalAmountLine = {
  debit: Prisma.Decimal | string | number;
  credit: Prisma.Decimal | string | number;
};

function amountTotal(lines: JournalAmountLine[], field: "debit" | "credit") {
  return lines.reduce(
    (total, line) => total.plus(line[field]),
    new Prisma.Decimal(0),
  ).toFixed(2);
}

/**
 * GET /api/admin/finance/ledger
 * Read-only journal history with filters and pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin();
    if (auth.response) return auth.response;

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(params.get("pageSize") ?? "25", 10) || 25),
    );
    const q = params.get("q")?.trim();
    const status = params.get("status")?.trim().toUpperCase();
    const currency = params.get("currency")?.trim().toUpperCase();
    const sourceType = params.get("sourceType")?.trim();
    const accountId = params.get("accountId")?.trim();
    const orderId = params.get("orderId")?.trim();
    const sellerId = params.get("sellerId")?.trim();
    const from = parseDateBoundary(params.get("from"));
    const to = parseDateBoundary(params.get("to"), true);

    if (status && status !== "ALL" && status !== "DRAFT" && status !== "POSTED") {
      return NextResponse.json({ error: "status must be ALL, DRAFT or POSTED." }, { status: 400 });
    }
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ error: "currency must be a 3-letter code." }, { status: 400 });
    }
    if (params.has("from") && !from) {
      return NextResponse.json({ error: "from must be a valid date." }, { status: 400 });
    }
    if (params.has("to") && !to) {
      return NextResponse.json({ error: "to must be a valid date." }, { status: 400 });
    }
    if (from && to && from > to) {
      return NextResponse.json({ error: "from cannot be later than to." }, { status: 400 });
    }

    const filters: Prisma.FinancialJournalWhereInput[] = [];
    if (status && status !== "ALL") {
      filters.push({ status: status as "DRAFT" | "POSTED" });
    }
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

    const where: Prisma.FinancialJournalWhereInput = filters.length
      ? { AND: filters }
      : {};

    // Separate count queries avoid Prisma groupBy generic inference issues
    // while keeping the status totals consistent with the active filters.
    const draftWhere: Prisma.FinancialJournalWhereInput = {
      AND: [...filters, { status: "DRAFT" }],
    };
    const postedWhere: Prisma.FinancialJournalWhereInput = {
      AND: [...filters, { status: "POSTED" }],
    };

    const totalPromise: Promise<number> = prisma.financialJournal.count({ where });
    const draftCountPromise: Promise<number> = prisma.financialJournal.count({
      where: draftWhere,
    });
    const postedCountPromise: Promise<number> = prisma.financialJournal.count({
      where: postedWhere,
    });
    const journalsPromise: Promise<JournalWithRelations[]> =
      prisma.financialJournal.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: journalInclude,
      });

    const [total, draftCount, postedCount, journals] = await Promise.all([
      totalPromise,
      draftCountPromise,
      postedCountPromise,
      journalsPromise,
    ]);

    const serialized = journals.map((journal: JournalWithRelations) => {
      const lines = journal.lines;
      const serializedJournal = serializeJournal(journal);
      return {
        ...serializedJournal,
        createdBy: journal.createdBy,
        approvedBy: journal.approvedBy,
        debitTotal: amountTotal(lines, "debit"),
        creditTotal: amountTotal(lines, "credit"),
        balanced: amountTotal(lines, "debit") === amountTotal(lines, "credit"),
      };
    });

    return NextResponse.json(
      {
        success: true,
        journals: serialized,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
        summary: {
          total,
          draftCount,
          postedCount,
          pageDebitTotal: journals.reduce(
            (sum: Prisma.Decimal, journal: JournalWithRelations) =>
              sum.plus(amountTotal(journal.lines, "debit")),
            new Prisma.Decimal(0),
          ).toFixed(2),
          pageCreditTotal: journals.reduce(
            (sum: Prisma.Decimal, journal: JournalWithRelations) =>
              sum.plus(amountTotal(journal.lines, "credit")),
            new Prisma.Decimal(0),
          ).toFixed(2),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Admin financial ledger GET failed:", error);
    return NextResponse.json(
      { error: "Unable to load financial journal history." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/**
 * POST /api/admin/finance/ledger
 * Creates a DRAFT journal only. Approval and posting are separate actions.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeAdmin();
    if (auth.response) return auth.response;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }

    let body: CreateJournalBody;
    try {
      body = parseCreateJournalBody(rawBody);
    } catch (error) {
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 400 });
    }

    const headerKey = request.headers.get("idempotency-key")?.trim();
    if (headerKey) {
      if (headerKey.length > 200) {
        return NextResponse.json(
          { error: "Idempotency-Key header cannot exceed 200 characters." },
          { status: 400 },
        );
      }
      if (body.idempotencyKey && body.idempotencyKey !== headerKey) {
        return NextResponse.json(
          { error: "The idempotency key in the header and body must match." },
          { status: 400 },
        );
      }
      body.idempotencyKey = headerKey;
    }

    const result = await prisma.$transaction((tx: Prisma.TransactionClient) =>
      createDraftJournal(tx, {
        ...body,
        createdById: auth.adminId!,
      }),
    );

    // createDraftJournal returns { journal, alreadyExists }.
    const replayed = result.alreadyExists;

    return NextResponse.json(
      {
        success: true,
        replayed,
        message: replayed
          ? "The existing draft journal was returned for this idempotency key."
          : "Draft journal created. A different administrator must approve it before posting.",
        journal: serializeJournal(result.journal),
      },
      {
        status: replayed ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const status = ledgerErrorStatus(error);
    if (status >= 500) {
      console.error("Admin financial journal creation failed:", error);
      return NextResponse.json(
        { error: "Unable to create the financial journal. Please check the server logs." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        error: getErrorMessage(error),
        ...(error instanceof FinancialLedgerError
          ? { code: (error as Error & { code?: string }).code }
          : {}),
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
