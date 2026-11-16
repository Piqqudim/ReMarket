import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import  { prisma }from "@/lib/prisma";
import {
  FinancialLedgerError,
  postApprovedJournal,
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
      code.includes("NOT_APPROVED")
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
    : "Unable to post the financial journal.";
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

/**
 * POST /api/admin/finance/ledger/[id]/post
 * Posts a previously approved journal. The ledger service verifies that the
 * posting administrator is the recorded checker and writes the audit entry.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
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
        { error: "A valid journal ID is required." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await postApprovedJournal(tx, {
          journalId: journalId.trim(),
          adminId: auth.adminId,
        });

        const postedJournal = await tx.financialJournal.findUnique({
          where: { id: journalId.trim() },
          include: journalInclude,
        });

        if (!postedJournal) {
          throw new FinancialLedgerError(
            "The posted journal could not be found.",
            "NOT_FOUND",
          );
        }

        if (postedJournal.status !== "POSTED" || !postedJournal.postedAt) {
          throw new FinancialLedgerError(
            "The journal was not posted successfully.",
            "POST_FAILED",
          );
        }

        return postedJournal;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(
      {
        success: true,
        message: "Journal posted successfully. Its entries are now included in account balances.",
        journal: serializeJournal(result),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status = errorStatus(error);

    if (status >= 500) {
      console.error("Admin financial journal posting failed:", error);
      return NextResponse.json(
        { error: "Unable to post the financial journal. Please check the server logs." },
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
