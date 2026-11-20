-- CreateEnum
CREATE TYPE "SellerSettlementStatus" AS ENUM ('AWAITING_PAYOUT_ACCOUNT', 'READY', 'PAYOUT_PENDING', 'PAID', 'FAILED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "SellerPayoutStatus" AS ENUM ('QUEUED', 'INITIATING', 'PENDING', 'SUCCESS', 'FAILED', 'REVERSED', 'REQUIRES_REVIEW');

-- CreateTable
CREATE TABLE "SellerPayoutAccount" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PAYSTACK',
    "recipientCode" TEXT NOT NULL,
    "accountFingerprint" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumberLast4" VARCHAR(4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerPayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerSettlement" (
    "id" TEXT NOT NULL,
    "sellerOrderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "grossSalesAmount" INTEGER NOT NULL,
    "commissionRateBps" INTEGER NOT NULL DEFAULT 500,
    "commissionAmount" INTEGER NOT NULL,
    "adjustmentAmount" INTEGER NOT NULL DEFAULT 0,
    "netPayoutAmount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "status" "SellerSettlementStatus" NOT NULL DEFAULT 'AWAITING_PAYOUT_ACCOUNT',
    "deliveryConfirmedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerPayout" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "payoutAccountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PAYSTACK',
    "reference" TEXT NOT NULL,
    "providerTransferCode" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NGN',
    "status" "SellerPayoutStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerPayoutAttempt" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "providerTransferCode" TEXT,
    "status" "SellerPayoutStatus" NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerPayoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerPayoutAccount_accountFingerprint_key" ON "SellerPayoutAccount"("accountFingerprint");

-- CreateIndex
CREATE INDEX "SellerPayoutAccount_sellerId_isActive_idx" ON "SellerPayoutAccount"("sellerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SellerSettlement_sellerOrderId_key" ON "SellerSettlement"("sellerOrderId");

-- CreateIndex
CREATE INDEX "SellerSettlement_sellerId_status_createdAt_idx" ON "SellerSettlement"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SellerSettlement_status_updatedAt_idx" ON "SellerSettlement"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerPayout_settlementId_key" ON "SellerPayout"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerPayout_reference_key" ON "SellerPayout"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "SellerPayout_providerTransferCode_key" ON "SellerPayout"("providerTransferCode");

-- CreateIndex
CREATE INDEX "SellerPayout_sellerId_status_createdAt_idx" ON "SellerPayout"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SellerPayout_status_nextAttemptAt_idx" ON "SellerPayout"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "SellerPayout_payoutAccountId_createdAt_idx" ON "SellerPayout"("payoutAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerPayoutAttempt_reference_key" ON "SellerPayoutAttempt"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "SellerPayoutAttempt_providerTransferCode_key" ON "SellerPayoutAttempt"("providerTransferCode");

-- CreateIndex
CREATE INDEX "SellerPayoutAttempt_payoutId_status_idx" ON "SellerPayoutAttempt"("payoutId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SellerPayoutAttempt_payoutId_attemptNumber_key" ON "SellerPayoutAttempt"("payoutId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "SellerPayoutAccount" ADD CONSTRAINT "SellerPayoutAccount_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerSettlement" ADD CONSTRAINT "SellerSettlement_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerSettlement" ADD CONSTRAINT "SellerSettlement_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerPayout" ADD CONSTRAINT "SellerPayout_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "SellerSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerPayout" ADD CONSTRAINT "SellerPayout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerPayout" ADD CONSTRAINT "SellerPayout_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "SellerPayoutAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerPayoutAttempt" ADD CONSTRAINT "SellerPayoutAttempt_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "SellerPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
