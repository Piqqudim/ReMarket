-- ReMarket: Product Reviews + Email/Browser Push Notification schema update
-- Corrected to preserve existing financial tables, financial foreign keys,
-- historical product reviews, and existing non-obsolete indexes.
-- PostgreSQL / Supabase. Review and back up the database before execution.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES AND VALUES
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    CREATE TYPE "ProductReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    CREATE TYPE "ProductReviewReportStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

ALTER TYPE "NotificationDeliveryStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REVIEW_INVITATION';

-- ---------------------------------------------------------------------------
-- 2. NOTIFICATION DELIVERY QUEUE COLUMNS
-- ---------------------------------------------------------------------------

ALTER TABLE "NotificationDelivery"
    ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

-- Existing rows need a value before updatedAt can be made NOT NULL.
UPDATE "NotificationDelivery"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "NotificationDelivery"
    ALTER COLUMN "updatedAt" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. PRODUCT REVIEW EVOLUTION
-- ---------------------------------------------------------------------------

ALTER TABLE "ProductReview"
    ADD COLUMN IF NOT EXISTS "orderItemId" TEXT,
    ADD COLUMN IF NOT EXISTS "productName" TEXT,
    ADD COLUMN IF NOT EXISTS "sellerId" TEXT,
    ADD COLUMN IF NOT EXISTS "sellerRespondedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "sellerResponse" TEXT,
    ADD COLUMN IF NOT EXISTS "sellerResponseById" TEXT,
    -- Old reviews have no verifiable order item, so start them hidden.
    ADD COLUMN IF NOT EXISTS "status" "ProductReviewStatus" NOT NULL DEFAULT 'HIDDEN';

-- Preserve the product name on old reviews, including reviews whose product
-- listing was removed before this migration.
UPDATE "ProductReview" AS pr
SET "productName" = COALESCE(
    (SELECT p."name" FROM "Product" AS p WHERE p."id" = pr."productId"),
    'Previously listed product'
)
WHERE pr."productName" IS NULL OR BTRIM(pr."productName") = '';

ALTER TABLE "ProductReview"
    ALTER COLUMN "productName" SET NOT NULL,
    ALTER COLUMN "productId" DROP NOT NULL;

-- Legacy reviews cannot be presented as verified purchases because they do
-- not reference an OrderItem. Preserve their records, but hide them publicly.
-- The default for future reviews remains PUBLISHED, matching the application.
UPDATE "ProductReview"
SET "status" = 'HIDDEN'
WHERE "status" IS NULL
   OR ("orderItemId" IS NULL AND "status" = 'PUBLISHED');

ALTER TABLE "ProductReview"
    ALTER COLUMN "status" SET NOT NULL,
    ALTER COLUMN "status" SET DEFAULT 'PUBLISHED';

-- Where a review already has an orderItemId (for example, if an earlier
-- interrupted attempt partially applied), recover the seller from the order.
UPDATE "ProductReview" AS pr
SET "sellerId" = so."sellerId"
FROM "OrderItem" AS oi
JOIN "SellerOrder" AS so ON so."id" = oi."sellerOrderId"
WHERE pr."orderItemId" = oi."id"
  AND pr."sellerId" IS NULL;

-- Change the old product/user uniqueness rule to one review per purchased item.
DROP INDEX IF EXISTS "ProductReview_productId_userId_key";

-- Change only the ProductReview relations whose delete behavior is intentionally
-- different in the updated Prisma schema. Financial relations are untouched.
ALTER TABLE "ProductReview"
    DROP CONSTRAINT IF EXISTS "ProductReview_productId_fkey";
ALTER TABLE "ProductReview"
    DROP CONSTRAINT IF EXISTS "ProductReview_userId_fkey";

-- ---------------------------------------------------------------------------
-- 4. NEW NOTIFICATION AND REVIEW TABLES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "NotificationDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "expirationTime" TIMESTAMP(3),
    "userAgent" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductReviewReport" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ProductReviewReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductReviewReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductReviewModerationLog" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "previousStatus" "ProductReviewStatus",
    "newStatus" "ProductReviewStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductReviewModerationLog_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 5. INDEXES
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "NotificationDeliveryAttempt_deliveryId_createdAt_idx"
    ON "NotificationDeliveryAttempt"("deliveryId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDeliveryAttempt_deliveryId_attemptNumber_key"
    ON "NotificationDeliveryAttempt"("deliveryId", "attemptNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key"
    ON "PushSubscription"("endpoint");

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_updatedAt_idx"
    ON "PushSubscription"("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "ProductReviewReport_status_createdAt_idx"
    ON "ProductReviewReport"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "ProductReviewReport_reviewId_createdAt_idx"
    ON "ProductReviewReport"("reviewId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ProductReviewReport_reviewId_reporterId_key"
    ON "ProductReviewReport"("reviewId", "reporterId");

CREATE INDEX IF NOT EXISTS "ProductReviewModerationLog_reviewId_createdAt_idx"
    ON "ProductReviewModerationLog"("reviewId", "createdAt");

CREATE INDEX IF NOT EXISTS "ProductReviewModerationLog_moderatorId_createdAt_idx"
    ON "ProductReviewModerationLog"("moderatorId", "createdAt");

CREATE INDEX IF NOT EXISTS "Category_parentId_idx"
    ON "Category"("parentId");

CREATE INDEX IF NOT EXISTS "NotificationDelivery_channel_status_nextAttemptAt_idx"
    ON "NotificationDelivery"("channel", "status", "nextAttemptAt");

CREATE INDEX IF NOT EXISTS "NotificationDelivery_status_nextAttemptAt_idx"
    ON "NotificationDelivery"("status", "nextAttemptAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ProductReview_orderItemId_key"
    ON "ProductReview"("orderItemId");

CREATE INDEX IF NOT EXISTS "ProductReview_productId_status_createdAt_idx"
    ON "ProductReview"("productId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "ProductReview_sellerId_status_createdAt_idx"
    ON "ProductReview"("sellerId", "status", "createdAt");

-- Keep the pre-existing Category, NotificationDelivery and ProductReview
-- non-unique indexes. They are harmless and dropping them is unnecessary.

-- ---------------------------------------------------------------------------
-- 6. FOREIGN KEYS
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationDeliveryAttempt_deliveryId_fkey' AND conrelid = '"NotificationDeliveryAttempt"'::regclass) THEN
        ALTER TABLE "NotificationDeliveryAttempt"
            ADD CONSTRAINT "NotificationDeliveryAttempt_deliveryId_fkey"
            FOREIGN KEY ("deliveryId") REFERENCES "NotificationDelivery"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey' AND conrelid = '"PushSubscription"'::regclass) THEN
        ALTER TABLE "PushSubscription"
            ADD CONSTRAINT "PushSubscription_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_productId_fkey' AND conrelid = '"ProductReview"'::regclass) THEN
        ALTER TABLE "ProductReview"
            ADD CONSTRAINT "ProductReview_productId_fkey"
            FOREIGN KEY ("productId") REFERENCES "Product"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_orderItemId_fkey' AND conrelid = '"ProductReview"'::regclass) THEN
        ALTER TABLE "ProductReview"
            ADD CONSTRAINT "ProductReview_orderItemId_fkey"
            FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_userId_fkey' AND conrelid = '"ProductReview"'::regclass) THEN
        ALTER TABLE "ProductReview"
            ADD CONSTRAINT "ProductReview_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_sellerId_fkey' AND conrelid = '"ProductReview"'::regclass) THEN
        ALTER TABLE "ProductReview"
            ADD CONSTRAINT "ProductReview_sellerId_fkey"
            FOREIGN KEY ("sellerId") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_sellerResponseById_fkey' AND conrelid = '"ProductReview"'::regclass) THEN
        ALTER TABLE "ProductReview"
            ADD CONSTRAINT "ProductReview_sellerResponseById_fkey"
            FOREIGN KEY ("sellerResponseById") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReviewReport_reviewId_fkey' AND conrelid = '"ProductReviewReport"'::regclass) THEN
        ALTER TABLE "ProductReviewReport"
            ADD CONSTRAINT "ProductReviewReport_reviewId_fkey"
            FOREIGN KEY ("reviewId") REFERENCES "ProductReview"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReviewReport_reporterId_fkey' AND conrelid = '"ProductReviewReport"'::regclass) THEN
        ALTER TABLE "ProductReviewReport"
            ADD CONSTRAINT "ProductReviewReport_reporterId_fkey"
            FOREIGN KEY ("reporterId") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReviewModerationLog_reviewId_fkey' AND conrelid = '"ProductReviewModerationLog"'::regclass) THEN
        ALTER TABLE "ProductReviewModerationLog"
            ADD CONSTRAINT "ProductReviewModerationLog_reviewId_fkey"
            FOREIGN KEY ("reviewId") REFERENCES "ProductReview"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductReviewModerationLog_moderatorId_fkey' AND conrelid = '"ProductReviewModerationLog"'::regclass) THEN
        ALTER TABLE "ProductReviewModerationLog"
            ADD CONSTRAINT "ProductReviewModerationLog_moderatorId_fkey"
            FOREIGN KEY ("moderatorId") REFERENCES "User"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END
$$;

COMMIT;

-- IMPORTANT:
-- This script intentionally does NOT drop FinancialAccount, FinancialJournal,
-- FinancialJournalLine, their enum types, or their foreign keys.
-- It also preserves old review records, backfills productName, and hides legacy
-- reviews without an OrderItem so they are not presented as verified purchases.
