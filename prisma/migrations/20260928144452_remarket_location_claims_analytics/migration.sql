-- CreateEnum
CREATE TYPE "LocationVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ClaimRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "BusinessDeletionRequest" DROP CONSTRAINT "BusinessDeletionRequest_businessId_fkey";

-- DropForeignKey
ALTER TABLE "BusinessDeletionRequest" DROP CONSTRAINT "BusinessDeletionRequest_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "BuyerRequest" DROP CONSTRAINT "BuyerRequest_categoryId_fkey";

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "address" TEXT,
ADD COLUMN     "verification" "LocationVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';

-- CreateTable
CREATE TABLE "BusinessViewEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessViewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessClaimRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT,
    "status" "ClaimRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessClaimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessViewEvent_businessId_idx" ON "BusinessViewEvent"("businessId");

-- CreateIndex
CREATE INDEX "BusinessViewEvent_businessId_createdAt_idx" ON "BusinessViewEvent"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessViewEvent_businessId_visitorId_idx" ON "BusinessViewEvent"("businessId", "visitorId");

-- CreateIndex
CREATE INDEX "BusinessViewEvent_visitorId_createdAt_idx" ON "BusinessViewEvent"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessClaimRequest_businessId_status_idx" ON "BusinessClaimRequest"("businessId", "status");

-- CreateIndex
CREATE INDEX "BusinessClaimRequest_requestedById_idx" ON "BusinessClaimRequest"("requestedById");

-- CreateIndex
CREATE INDEX "BusinessClaimRequest_reviewedById_idx" ON "BusinessClaimRequest"("reviewedById");

-- CreateIndex
CREATE INDEX "BusinessClaimRequest_status_idx" ON "BusinessClaimRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessClaimRequest_businessId_requestedById_status_key" ON "BusinessClaimRequest"("businessId", "requestedById", "status");

-- CreateIndex
CREATE INDEX "Location_verification_idx" ON "Location"("verification");

-- AddForeignKey
ALTER TABLE "BuyerRequest" ADD CONSTRAINT "BuyerRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessViewEvent" ADD CONSTRAINT "BusinessViewEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDeletionRequest" ADD CONSTRAINT "BusinessDeletionRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDeletionRequest" ADD CONSTRAINT "BusinessDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClaimRequest" ADD CONSTRAINT "BusinessClaimRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClaimRequest" ADD CONSTRAINT "BusinessClaimRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClaimRequest" ADD CONSTRAINT "BusinessClaimRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
