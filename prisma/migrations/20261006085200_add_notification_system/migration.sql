-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REQUEST_CREATED', 'REQUEST_MATCHED', 'REQUEST_RESPONDED', 'REQUEST_UPDATED', 'REQUEST_FULFILLED', 'REQUEST_CLOSED', 'REQUEST_UNFULFILLED', 'BUSINESS_APPROVED', 'BUSINESS_REJECTED', 'BUSINESS_UPDATED', 'BUSINESS_VERIFIED', 'BUSINESS_DEACTIVATED', 'BUSINESS_DELETION_REQUESTED', 'BUSINESS_DELETION_APPROVED', 'BUSINESS_DELETION_REJECTED', 'BUSINESS_REPORTED', 'CLAIM_SUBMITTED', 'CLAIM_APPROVED', 'CLAIM_REJECTED', 'PRODUCT_ADDED', 'PRODUCT_UPDATED', 'PRODUCT_REMOVED', 'PRODUCT_AVAILABILITY_CHANGED', 'REVIEW_RECEIVED', 'REVIEW_REPLIED', 'REVIEW_REPORTED', 'REVIEW_REMOVED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PREMIUM_ACTIVATED', 'PREMIUM_EXPIRING', 'PREMIUM_EXPIRED', 'SECURITY_ALERT', 'SYSTEM_ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "NotificationAudience" AS ENUM ('EVERYONE', 'BUYERS', 'SELLERS', 'ADMINS', 'SELECTED_USERS');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "announcementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT false,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "audience" "NotificationAudience" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "createdById" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_type_idx" ON "Notification"("userId", "type");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_announcementId_idx" ON "Notification"("announcementId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_status_idx" ON "NotificationDelivery"("channel", "status");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_idx" ON "NotificationDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "NotificationPreference_notificationType_idx" ON "NotificationPreference"("notificationType");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_notificationType_key" ON "NotificationPreference"("userId", "notificationType");

-- CreateIndex
CREATE INDEX "NotificationAnnouncement_audience_idx" ON "NotificationAnnouncement"("audience");

-- CreateIndex
CREATE INDEX "NotificationAnnouncement_createdById_idx" ON "NotificationAnnouncement"("createdById");

-- CreateIndex
CREATE INDEX "NotificationAnnouncement_createdAt_idx" ON "NotificationAnnouncement"("createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "NotificationAnnouncement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationAnnouncement" ADD CONSTRAINT "NotificationAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
