ALTER TABLE "Product"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Product_status_deletedAt_createdAt_idx"
ON "Product"("status", "deletedAt", "createdAt");