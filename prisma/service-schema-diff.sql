-- CreateEnum
CREATE TYPE "ServiceBookingType" AS ENUM ('REQUEST', 'APPOINTMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceBookingStatus" ADD VALUE 'AWAITING_BUYER';
ALTER TYPE "ServiceBookingStatus" ADD VALUE 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "bookingType" "ServiceBookingType" NOT NULL DEFAULT 'REQUEST';

-- AlterTable
ALTER TABLE "ServiceBooking" ADD COLUMN     "agreedPrice" INTEGER,
ADD COLUMN     "bookingCode" TEXT,
ADD COLUMN     "bookingType" "ServiceBookingType" NOT NULL DEFAULT 'REQUEST',
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "fulfillmentAddress" TEXT,
ADD COLUMN     "fulfillmentType" "ServiceFulfillmentType",
ADD COLUMN     "merchantNote" TEXT,
ADD COLUMN     "quoteAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "quoteMessage" TEXT,
ADD COLUMN     "quoteSentAt" TIMESTAMP(3),
ADD COLUMN     "quotedPrice" INTEGER,
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SavedListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT,
    "serviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedListing_userId_createdAt_idx" ON "SavedListing"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedListing_productId_idx" ON "SavedListing"("productId");

-- CreateIndex
CREATE INDEX "SavedListing_serviceId_idx" ON "SavedListing"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedListing_userId_productId_key" ON "SavedListing"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedListing_userId_serviceId_key" ON "SavedListing"("userId", "serviceId");

-- CreateIndex
CREATE INDEX "Service_bookingType_idx" ON "Service"("bookingType");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceBooking_bookingCode_key" ON "ServiceBooking"("bookingCode");

-- CreateIndex
CREATE INDEX "ServiceBooking_sellerId_status_createdAt_idx" ON "ServiceBooking"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceBooking_scheduledFor_idx" ON "ServiceBooking"("scheduledFor");

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListing" ADD CONSTRAINT "SavedListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListing" ADD CONSTRAINT "SavedListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListing" ADD CONSTRAINT "SavedListing_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
