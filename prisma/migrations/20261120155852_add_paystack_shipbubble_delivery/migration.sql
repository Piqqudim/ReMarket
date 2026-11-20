/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `Category` table. All the data in the column will be lost.
  - You are about to drop the column `parentId` on the `Category` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DeliveryQuoteStatus" AS ENUM ('OPEN', 'SELECTED', 'CONSUMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('BOOKING_PENDING', 'PENDING', 'CONFIRMED', 'COURIER_ASSIGNED', 'AWAITING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNING', 'RETURNED', 'CANCELLED', 'FAILED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_PAYMENT';

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_parentId_fkey";

-- DropIndex
DROP INDEX "Category_parentId_isActive_sortOrder_idx";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "pickupContactName" TEXT,
ADD COLUMN     "pickupPhone" TEXT,
ADD COLUMN     "shipbubblePickupAddressCode" INTEGER,
ADD COLUMN     "shipbubblePickupValidatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "imageUrl",
DROP COLUMN "parentId";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "authorizationUrl" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "initializedAt" TIMESTAMP(3),
ADD COLUMN     "providerAccessCode" TEXT,
ADD COLUMN     "providerTransactionId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "shippingHeightCm" DOUBLE PRECISION,
ADD COLUMN     "shippingLengthCm" DOUBLE PRECISION,
ADD COLUMN     "shippingWeightKg" DOUBLE PRECISION,
ADD COLUMN     "shippingWidthCm" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "DeliveryQuote" (
    "id" TEXT NOT NULL,
    "quoteCode" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "orderId" TEXT,
    "status" "DeliveryQuoteStatus" NOT NULL DEFAULT 'OPEN',
    "deliveryRecipient" TEXT NOT NULL,
    "deliveryEmail" TEXT NOT NULL,
    "deliveryPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "deliveryArea" TEXT NOT NULL,
    "deliveryLandmark" TEXT,
    "deliveryNotes" TEXT,
    "receiverAddressCode" INTEGER NOT NULL,
    "receiverAddressData" JSONB,
    "cartFingerprint" TEXT NOT NULL,
    "itemsSubtotal" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "selectedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryQuotePackage" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "senderAddressCode" INTEGER NOT NULL,
    "requestToken" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "packageWeightKg" DOUBLE PRECISION NOT NULL,
    "packageLengthCm" DOUBLE PRECISION NOT NULL,
    "packageWidthCm" DOUBLE PRECISION NOT NULL,
    "packageHeightCm" DOUBLE PRECISION NOT NULL,
    "packageAmount" INTEGER NOT NULL,
    "availableRates" JSONB NOT NULL,
    "selectedCourierId" TEXT,
    "selectedCourierName" TEXT,
    "selectedServiceCode" TEXT,
    "selectedDeliveryFee" INTEGER,
    "selectedDeliveryEta" TEXT,
    "selectedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryQuotePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "sellerOrderId" TEXT NOT NULL,
    "quotePackageId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SHIPBUBBLE',
    "providerOrderId" TEXT,
    "courierId" TEXT,
    "courierName" TEXT,
    "trackingCode" TEXT,
    "trackingUrl" TEXT,
    "waybillUrl" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'BOOKING_PENDING',
    "shippingFee" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "estimatedDelivery" TEXT,
    "rawResponse" JSONB,
    "failureReason" TEXT,
    "bookedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "inTransitAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentTrackingEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "providerEventKey" TEXT,
    "status" "ShipmentStatus" NOT NULL,
    "statusLabel" TEXT NOT NULL,
    "message" TEXT,
    "location" TEXT,
    "occurredAt" TIMESTAMP(3),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipbubbleAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addressHash" TEXT NOT NULL,
    "addressCode" INTEGER NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressText" TEXT NOT NULL,
    "formattedAddress" TEXT,
    "state" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipbubbleAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryQuote_quoteCode_key" ON "DeliveryQuote"("quoteCode");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryQuote_orderId_key" ON "DeliveryQuote"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryQuote_buyerId_status_createdAt_idx" ON "DeliveryQuote"("buyerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryQuote_status_expiresAt_idx" ON "DeliveryQuote"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "DeliveryQuotePackage_businessId_expiresAt_idx" ON "DeliveryQuotePackage"("businessId", "expiresAt");

-- CreateIndex
CREATE INDEX "DeliveryQuotePackage_sellerId_createdAt_idx" ON "DeliveryQuotePackage"("sellerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryQuotePackage_quoteId_businessId_key" ON "DeliveryQuotePackage"("quoteId", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_quotePackageId_key" ON "Shipment"("quotePackageId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_providerOrderId_key" ON "Shipment"("providerOrderId");

-- CreateIndex
CREATE INDEX "Shipment_sellerOrderId_status_idx" ON "Shipment"("sellerOrderId", "status");

-- CreateIndex
CREATE INDEX "Shipment_provider_status_createdAt_idx" ON "Shipment"("provider", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentTrackingEvent_shipmentId_occurredAt_idx" ON "ShipmentTrackingEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "ShipmentTrackingEvent_status_occurredAt_idx" ON "ShipmentTrackingEvent"("status", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentTrackingEvent_shipmentId_providerEventKey_key" ON "ShipmentTrackingEvent"("shipmentId", "providerEventKey");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_eventKey_key" ON "WebhookReceipt"("eventKey");

-- CreateIndex
CREATE INDEX "WebhookReceipt_provider_receivedAt_idx" ON "WebhookReceipt"("provider", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookReceipt_processedAt_receivedAt_idx" ON "WebhookReceipt"("processedAt", "receivedAt");

-- CreateIndex
CREATE INDEX "ShipbubbleAddress_userId_updatedAt_idx" ON "ShipbubbleAddress"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipbubbleAddress_userId_addressHash_key" ON "ShipbubbleAddress"("userId", "addressHash");

-- CreateIndex
CREATE UNIQUE INDEX "ShipbubbleAddress_addressCode_key" ON "ShipbubbleAddress"("addressCode");

-- CreateIndex
CREATE INDEX "FinancialAccount_type_isActive_idx" ON "FinancialAccount"("type", "isActive");

-- AddForeignKey
ALTER TABLE "DeliveryQuote" ADD CONSTRAINT "DeliveryQuote_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryQuote" ADD CONSTRAINT "DeliveryQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryQuotePackage" ADD CONSTRAINT "DeliveryQuotePackage_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "DeliveryQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryQuotePackage" ADD CONSTRAINT "DeliveryQuotePackage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryQuotePackage" ADD CONSTRAINT "DeliveryQuotePackage_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_quotePackageId_fkey" FOREIGN KEY ("quotePackageId") REFERENCES "DeliveryQuotePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentTrackingEvent" ADD CONSTRAINT "ShipmentTrackingEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipbubbleAddress" ADD CONSTRAINT "ShipbubbleAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
