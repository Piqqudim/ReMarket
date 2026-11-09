
-- Add optional original price to products.
-- Existing products retain NULL and their current selling prices.

ALTER TABLE "Product"
ADD COLUMN "originalPrice" INTEGER;


-- Create product reviews.
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);


-- One review per buyer per product.
CREATE UNIQUE INDEX "ProductReview_productId_userId_key"
ON "ProductReview"("productId", "userId");


-- Review lookup indexes.
CREATE INDEX "ProductReview_productId_createdAt_idx"
ON "ProductReview"("productId", "createdAt");

CREATE INDEX "ProductReview_userId_createdAt_idx"
ON "ProductReview"("userId", "createdAt");


-- Connect reviews to products.
ALTER TABLE "ProductReview"
ADD CONSTRAINT "ProductReview_productId_fkey"
FOREIGN KEY ("productId")
REFERENCES "Product"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;


-- Connect reviews to buyers.
ALTER TABLE "ProductReview"
ADD CONSTRAINT "ProductReview_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
