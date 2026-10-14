/*
  Warnings:

  - A unique constraint covering the columns `[referralCode]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReferralRewardType" AS ENUM ('PRODUCT_SLOTS', 'BUYER_MILESTONE');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('GRANTED', 'REVOKED');

-- AlterTable
ALTER TABLE "BusinessViewEvent" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "referrerRole" "Role" NOT NULL,
    "referredRole" "Role" NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "qualifiedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referralId" TEXT,
    "type" "ReferralRewardType" NOT NULL,
    "status" "ReferralRewardStatus" NOT NULL DEFAULT 'GRANTED',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "milestone" INTEGER,
    "rewardKey" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_status_idx" ON "Referral"("referrerId", "status");

-- CreateIndex
CREATE INDEX "Referral_status_createdAt_idx" ON "Referral"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Referral_referredRole_status_idx" ON "Referral"("referredRole", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_rewardKey_key" ON "ReferralReward"("rewardKey");

-- CreateIndex
CREATE INDEX "ReferralReward_userId_status_idx" ON "ReferralReward"("userId", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_type_status_idx" ON "ReferralReward"("type", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_referralId_idx" ON "ReferralReward"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referralId_type_key" ON "ReferralReward"("referralId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_userId_type_milestone_key" ON "ReferralReward"("userId", "type", "milestone");

-- CreateIndex
CREATE INDEX "BusinessViewEvent_userId_createdAt_idx" ON "BusinessViewEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessViewEvent_userId_businessId_createdAt_idx" ON "BusinessViewEvent"("userId", "businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessViewEvent" ADD CONSTRAINT "BusinessViewEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
