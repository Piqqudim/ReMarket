CREATE TYPE "LedgerAccountType" AS ENUM (
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE'
);

CREATE TYPE "FinancialJournalStatus" AS ENUM (
  'DRAFT',
  'POSTED'
);

CREATE TABLE "FinancialAccount" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(30) NOT NULL,
  "name" TEXT NOT NULL,
  "type" "LedgerAccountType" NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
  "isSystem" BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialJournal" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "sourceType" VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
  "sourceId" VARCHAR(100),
  "description" TEXT,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
  "status" "FinancialJournalStatus" NOT NULL DEFAULT 'DRAFT',
  "idempotencyKey" TEXT,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "postedAt" TIMESTAMP(3),
  "reversesJournalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialJournal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialJournalLine" (
  "id" TEXT NOT NULL,
  "journalId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "orderId" TEXT,
  "sellerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialJournalLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancialJournalLine_nonnegative_amounts_check"
    CHECK ("debit" >= 0 AND "credit" >= 0),
  CONSTRAINT "FinancialJournalLine_one_side_only_check"
    CHECK (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
);

CREATE UNIQUE INDEX "FinancialAccount_code_key" ON "FinancialAccount"("code");
CREATE UNIQUE INDEX "FinancialJournal_reference_key" ON "FinancialJournal"("reference");
CREATE UNIQUE INDEX "FinancialJournal_idempotencyKey_key" ON "FinancialJournal"("idempotencyKey");
CREATE UNIQUE INDEX "FinancialJournal_reversesJournalId_key" ON "FinancialJournal"("reversesJournalId");

CREATE INDEX "FinancialJournal_status_createdAt_idx" ON "FinancialJournal"("status", "createdAt");
CREATE INDEX "FinancialJournal_sourceType_sourceId_idx" ON "FinancialJournal"("sourceType", "sourceId");
CREATE INDEX "FinancialJournal_createdById_createdAt_idx" ON "FinancialJournal"("createdById", "createdAt");
CREATE INDEX "FinancialJournal_approvedById_createdAt_idx" ON "FinancialJournal"("approvedById", "createdAt");
CREATE INDEX "FinancialJournalLine_journalId_idx" ON "FinancialJournalLine"("journalId");
CREATE INDEX "FinancialJournalLine_accountId_createdAt_idx" ON "FinancialJournalLine"("accountId", "createdAt");
CREATE INDEX "FinancialJournalLine_orderId_idx" ON "FinancialJournalLine"("orderId");
CREATE INDEX "FinancialJournalLine_sellerId_idx" ON "FinancialJournalLine"("sellerId");

ALTER TABLE "FinancialJournal"
  ADD CONSTRAINT "FinancialJournal_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancialJournal"
  ADD CONSTRAINT "FinancialJournal_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinancialJournal"
  ADD CONSTRAINT "FinancialJournal_reversesJournalId_fkey"
  FOREIGN KEY ("reversesJournalId") REFERENCES "FinancialJournal"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialJournalLine"
  ADD CONSTRAINT "FinancialJournalLine_journalId_fkey"
  FOREIGN KEY ("journalId") REFERENCES "FinancialJournal"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialJournalLine"
  ADD CONSTRAINT "FinancialJournalLine_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
