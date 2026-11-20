import { LedgerAccountType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { writeAdminAuditLog } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const SYSTEM_ACCOUNTS = [
  { code: "1000", name: "Payment Provider Clearing", type: LedgerAccountType.ASSET, currency: "NGN" },
  { code: "1100", name: "Platform Receivable", type: LedgerAccountType.ASSET, currency: "NGN" },
  { code: "1200", name: "Delivery Fee Receivable", type: LedgerAccountType.ASSET, currency: "NGN" },
  { code: "2000", name: "Seller Payables", type: LedgerAccountType.LIABILITY, currency: "NGN" },
  { code: "2100", name: "Buyer Refunds Payable", type: LedgerAccountType.LIABILITY, currency: "NGN" },
  { code: "2200", name: "Delivery Provider Payables", type: LedgerAccountType.LIABILITY, currency: "NGN" },
  { code: "3000", name: "Retained Earnings", type: LedgerAccountType.EQUITY, currency: "NGN" },
  { code: "4000", name: "Marketplace Commission Revenue", type: LedgerAccountType.REVENUE, currency: "NGN" },
  { code: "4100", name: "Sponsored Product Revenue", type: LedgerAccountType.REVENUE, currency: "NGN" },
  { code: "5000", name: "Payment Processing Fees", type: LedgerAccountType.EXPENSE, currency: "NGN" },
  { code: "5100", name: "Delivery Subsidy Expense", type: LedgerAccountType.EXPENSE, currency: "NGN" },
] as const;

type SystemAccount = (typeof SYSTEM_ACCOUNTS)[number];
type AccountShape = Pick<SystemAccount, "code" | "name" | "type" | "currency"> & { isSystem: boolean };

class SystemAccountConflictError extends Error {
  constructor() {
    super("A predefined account code is already used by a different account.");
    this.name = "SystemAccountConflictError";
  }
}

class SystemAccountInitializationError extends Error {
  constructor() {
    super("The system chart of accounts could not be fully initialized.");
    this.name = "SystemAccountInitializationError";
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: noStore },
  );
}

function assertSystemAccountMatches(expected: SystemAccount, actual: AccountShape | undefined) {
  if (
    !actual ||
    actual.name !== expected.name ||
    actual.type !== expected.type ||
    actual.currency !== expected.currency ||
    actual.isSystem !== true
  ) {
    throw new SystemAccountConflictError();
  }
}

/** GET /api/admin/finance/accounts — lists the chart of accounts. */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const accounts = await prisma.financialAccount.findMany({
      orderBy: [{ code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        currency: true,
        isSystem: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { journalLines: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        accounts,
        count: accounts.length,
        generatedAt: new Date().toISOString(),
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("Admin financial accounts GET error:", error);
    return jsonError("Unable to load the chart of accounts.", 500);
  }
}

/**
 * POST /api/admin/finance/accounts
 * Idempotently initializes the predefined system accounts only.
 * Arbitrary account creation is deliberately not exposed by this route.
 */
export async function POST() {
  try {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;

    const result = await prisma.$transaction(
      async (tx) => {
        const codes = SYSTEM_ACCOUNTS.map((account) => account.code);
        const existing = await tx.financialAccount.findMany({
          where: { code: { in: codes } },
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            currency: true,
            isSystem: true,
          },
        });
        const existingByCode = new Map(existing.map((account) => [account.code, account]));

        for (const expected of SYSTEM_ACCOUNTS) {
          const found = existingByCode.get(expected.code);
          if (found) assertSystemAccountMatches(expected, found);
        }

        const missing = SYSTEM_ACCOUNTS.filter((account) => !existingByCode.has(account.code));
        let insertedCount = 0;

        if (missing.length > 0) {
          const inserted = await tx.financialAccount.createMany({
            data: missing.map((account) => ({
              ...account,
              isSystem: true,
              isActive: true,
            })),
            skipDuplicates: true,
          });
          insertedCount = inserted.count;
        }

        // Re-read and validate every predefined code, including records that
        // may have been created concurrently while createMany was running.
        const allAccounts = await tx.financialAccount.findMany({
          where: { code: { in: codes } },
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            currency: true,
            isSystem: true,
          },
          orderBy: { code: "asc" },
        });
        const allByCode = new Map(allAccounts.map((account) => [account.code, account]));

        if (allAccounts.length !== SYSTEM_ACCOUNTS.length) {
          throw new SystemAccountInitializationError();
        }
        for (const expected of SYSTEM_ACCOUNTS) {
          assertSystemAccountMatches(expected, allByCode.get(expected.code));
        }

        if (insertedCount > 0) {
          await writeAdminAuditLog(tx, {
            adminId: auth.user.id,
            action: "FINANCIAL_CHART_OF_ACCOUNTS_INITIALIZED",
            entityType: "FINANCIAL_CHART",
            entityId: "SYSTEM_CHART_OF_ACCOUNTS",
            beforeData: { accountCount: existing.length } as Prisma.InputJsonValue,
            afterData: {
              accountCount: allAccounts.length,
              missingAtStartCodes: missing.map((account) => account.code),
            } as Prisma.InputJsonValue,
            metadata: {
              currency: "NGN",
              createdCount: insertedCount,
            } as Prisma.InputJsonValue,
          });
        }

        return { accounts: allAccounts, createdCount: insertedCount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(
      {
        success: true,
        message: result.createdCount > 0
          ? "The system chart of accounts was initialized."
          : "The system chart of accounts is already initialized.",
        createdCount: result.createdCount,
        accounts: result.accounts,
      },
      {
        status: result.createdCount > 0 ? 201 : 200,
        headers: noStore,
      },
    );
  } catch (error) {
    if (error instanceof SystemAccountConflictError) {
      return jsonError(
        "A predefined account code is already used by a different account. Review the chart before continuing.",
        409,
      );
    }
    if (error instanceof SystemAccountInitializationError) {
      return jsonError(
        "The chart of accounts could not be fully initialized. No partial initialization was committed.",
        409,
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    ) {
      return jsonError(
        "The chart of accounts changed during initialization. Refresh and try again.",
        409,
      );
    }

    console.error("Admin financial accounts POST error:", error);
    return jsonError("Unable to initialize the chart of accounts.", 500);
  }
}
