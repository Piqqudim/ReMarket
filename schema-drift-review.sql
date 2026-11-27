-- DropForeignKey
ALTER TABLE "FinancialJournal" DROP CONSTRAINT "FinancialJournal_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "FinancialJournal" DROP CONSTRAINT "FinancialJournal_createdById_fkey";

-- DropForeignKey
ALTER TABLE "FinancialJournal" DROP CONSTRAINT "FinancialJournal_reversesJournalId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialJournalLine" DROP CONSTRAINT "FinancialJournalLine_accountId_fkey";

-- DropForeignKey
ALTER TABLE "FinancialJournalLine" DROP CONSTRAINT "FinancialJournalLine_journalId_fkey";

-- DropIndex
DROP INDEX "Category_parentId_isActive_sortOrder_idx";

-- DropIndex
DROP INDEX "NotificationDelivery_channel_status_idx";

-- DropIndex
DROP INDEX "NotificationDelivery_status_idx";

-- DropIndex
DROP INDEX "ProductReview_productId_createdAt_idx";

-- DropTable
DROP TABLE "FinancialAccount";

-- DropTable
DROP TABLE "FinancialJournal";

-- DropTable
DROP TABLE "FinancialJournalLine";

-- DropEnum
DROP TYPE "FinancialJournalStatus";

-- DropEnum
DROP TYPE "LedgerAccountType";
