-- CreateEnum
CREATE TYPE "ServiceFulfillmentType" AS ENUM ('AT_PROVIDER', 'AT_CUSTOMER', 'REMOTE', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "ServiceBookingStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'COMPLETED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_ADDED';
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_REMOVED';
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_AVAILABILITY_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_BOOKING_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_BOOKING_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE_BOOKING_MESSAGE';

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "price" INTEGER,
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "durationMinutes" INTEGER,
    "fulfillmentType" "ServiceFulfillmentType" NOT NULL DEFAULT 'FLEXIBLE',
    "availability" "Availability" NOT NULL DEFAULT 'ASK_SELLER',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceImage" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBooking" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "status" "ServiceBookingStatus" NOT NULL DEFAULT 'PENDING',
    "requestedFor" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "contactPhone" TEXT,
    "buyerMessage" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBookingMessage" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceBookingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Service_businessId_idx" ON "Service"("businessId");

-- CreateIndex
CREATE INDEX "Service_businessId_status_deletedAt_idx" ON "Service"("businessId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "Service_categoryId_idx" ON "Service"("categoryId");

-- CreateIndex
CREATE INDEX "Service_status_deletedAt_createdAt_idx" ON "Service"("status", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Service_availability_idx" ON "Service"("availability");

-- CreateIndex
CREATE INDEX "Service_fulfillmentType_idx" ON "Service"("fulfillmentType");

-- CreateIndex
CREATE INDEX "ServiceImage_serviceId_idx" ON "ServiceImage"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceImage_serviceId_sortOrder_idx" ON "ServiceImage"("serviceId", "sortOrder");

-- CreateIndex
CREATE INDEX "ServiceBooking_serviceId_status_createdAt_idx" ON "ServiceBooking"("serviceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceBooking_buyerId_status_createdAt_idx" ON "ServiceBooking"("buyerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceBooking_status_createdAt_idx" ON "ServiceBooking"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceBooking_requestedFor_idx" ON "ServiceBooking"("requestedFor");

-- CreateIndex
CREATE INDEX "ServiceBookingMessage_bookingId_createdAt_idx" ON "ServiceBookingMessage"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceBookingMessage_senderId_createdAt_idx" ON "ServiceBookingMessage"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceBookingMessage_bookingId_readAt_idx" ON "ServiceBookingMessage"("bookingId", "readAt");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceImage" ADD CONSTRAINT "ServiceImage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingMessage" ADD CONSTRAINT "ServiceBookingMessage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBookingMessage" ADD CONSTRAINT "ServiceBookingMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
