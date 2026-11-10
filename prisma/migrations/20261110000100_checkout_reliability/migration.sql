
-- =====================================================
-- REMARKET CHECKOUT RELIABILITY MIGRATION
-- =====================================================

-- 1. Create delivery fee status enum

DO $$
BEGIN
    CREATE TYPE "DeliveryFeeStatus" AS ENUM (
        'UNCONFIRMED',
        'CONFIRMED'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- 2. Add checkout idempotency key to Order

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS
"checkoutIdempotencyKey" TEXT;


-- 3. Create unique index for checkout idempotency

CREATE UNIQUE INDEX IF NOT EXISTS
"Order_checkoutIdempotencyKey_key"
ON "Order" ("checkoutIdempotencyKey");


-- 4. Add delivery fee confirmation status

ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS
"deliveryFeeStatus" "DeliveryFeeStatus"
NOT NULL DEFAULT 'UNCONFIRMED';


-- 5. Add inventory release tracking to SellerOrder

ALTER TABLE "SellerOrder"
ADD COLUMN IF NOT EXISTS
"inventoryReleasedAt" TIMESTAMP(3);


-- 6. Add inventory reservation tracking to OrderItem

ALTER TABLE "OrderItem"
ADD COLUMN IF NOT EXISTS
"inventoryReserved" BOOLEAN
NOT NULL DEFAULT FALSE;


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

SELECT
    'ReMarket checkout reliability migration completed'
    AS result;
