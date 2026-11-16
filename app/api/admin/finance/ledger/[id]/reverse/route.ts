import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  createReversalDraft,
  FinancialLedgerError,
} from "@/lib/finance/ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
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
  if (!isRecord(context)) return null;

  const directCandidates = [context.id, context.adminId, context.userId];
  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  for (const key of ["user", "admin", "session"]) {
    const nested = context[key];
    if (!isRecord(nested)) continue;

    const candidates = [nested.id, nested.adminId, nested.userId];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    if (
      isRecord(nested.user) &&
      typeof nested.user.id === "string" &&
      nested.user.id.trim()
    ) {
      return nested.user.id.trim();
    }
  }

  return null;
}

async function authorizeAdmin(): Promise<
  | { response: Response; adminId: null }
  | { response: null; adminId: string }
> {
  const adminContext = await requireAdmin();
  if (adminContext instanceof Response) {
    return { response: adminContext, adminId: null };
  }

  const adminId = getAdminId(adminContext);
  if (!adminId) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized. An administrator session is required." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
      adminId: null,
    };
  }

  return { response: null, adminId };
}

function errorStatus(error: unknown): number {
  if (error instanceof FinancialLedgerError) {
    const code = String(
      (error as Error & { code?: string }).code ?? "",
    ).toUpperCase();

    if (code.includes("NOT_FOUND")) return 404;
    if (code.includes("FORBIDDEN") || code.includes("UNAUTHORIZED")) return 403;
    if (
      code.includes("CONFLICT") ||
      code.includes("DUPLICATE") ||
      code.includes("ALREADY") ||
      code.includes("NOT_POSTED") ||
      code.includes("REVERSAL_EXISTS")
    ) {
      return 409;
    }
    return 400;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") return 409;
    if (error.code === "P2025") return 404;
  }

  return 500;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to create the financial journal reversal.";
}

function serializeJournal(journal: JournalWithRelations) {
  const debitTotal = journal.lines.reduce(
    (total, line) => total.plus(line.debit),
    new Prisma.Decimal(0),
  );
  const creditTotal = journal.lines.reduce(
    (total, line) => total.plus(line.credit),
    new Prisma.Decimal(0),
  );

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
    approvedAt: journal.approvedAt,
    postedAt: journal.postedAt,
    reversesJournalId: journal.reversesJournalId,
    createdAt: journal.createdAt,
    createdBy: journal.createdBy,
    approvedBy: journal.approvedBy,
    debitTotal: debitTotal.toFixed(2),
    creditTotal: creditTotal.toFixed(2),
    balanced: debitTotal.equals(creditTotal),
    lines: journal.lines.map((line) => ({
      id: line.id,
      accountId: line.accountId,
      account: line.account,
      debit: line.debit.toFixed(2),
      credit: line.credit.toFixed(2),
      description: line.description,
      orderId: line.orderId,
      sellerId: line.sellerId,
    })),
  };
}

function parseReference(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("reference is required for the reversal journal.");
  }

  const reference = value.trim();
  if (reference.length > 120) {
    throw new Error("reference cannot exceed 120 characters.");
  }

  return reference;
}

/**
 * POST /api/admin/finance/ledger/[id]/reverse
 * Creates a new DRAFT reversal for a POSTED journal. The original journal is
 * immutable; the reversal must pass through the normal approval and posting
 * workflow before it affects account balances.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await authorizeAdmin();
    if (auth.response) return auth.response;

    const { id: journalId } = await context.params;
    if (
      typeof journalId !== "string" ||
      !journalId.trim() ||
      journalId.length > 100
    ) {
      return NextResponse.json(
        { error: "A valid original journal ID is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!isRecord(rawBody)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    let reference: string;
    try {
      reference = parseReference(rawBody.reference);
    } catch (error) {
      return NextResponse.json(
        { error: getErrorMessage(error) },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await createReversalDraft(tx, {
          journalId: journalId.trim(),
          reference,
          createdById: auth.adminId,
        });

        const reversalJournal = await tx.financialJournal.findUnique({
          where: { reversesJournalId: journalId.trim() },
          include: journalInclude,
        });

        if (!reversalJournal) {
          throw new FinancialLedgerError(
            "The reversal draft could not be found after creation.",
            "REVERSAL_NOT_FOUND",
          );
        }

        if (reversalJournal.status !== "DRAFT") {
          throw new FinancialLedgerError(
            "A reversal must begin in DRAFT status and follow the approval workflow.",
            "INVALID_REVERSAL_STATUS",
          );
        }

        return reversalJournal;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(
      {
        success: true,
        message:
          "Reversal draft created. The original journal remains unchanged; a different administrator must approve the reversal before it can be posted.",
        reversal: serializeJournal(result),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = errorStatus(error);

    if (status >= 500) {
      console.error("Admin financial journal reversal failed:", error);
      return NextResponse.json(
        { error: "Unable to create the journal reversal. Please check the server logs." },
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
