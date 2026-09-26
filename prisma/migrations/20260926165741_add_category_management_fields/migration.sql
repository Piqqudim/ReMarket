-- DropIndex
DROP INDEX "Location_area_key";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "iconKey" TEXT NOT NULL DEFAULT 'Store',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "AdminNote_businessId_idx" ON "AdminNote"("businessId");

-- CreateIndex
CREATE INDEX "AdminNote_requestId_idx" ON "AdminNote"("requestId");

-- CreateIndex
CREATE INDEX "Business_ownerId_idx" ON "Business"("ownerId");

-- CreateIndex
CREATE INDEX "Business_locationId_idx" ON "Business"("locationId");

-- CreateIndex
CREATE INDEX "BusinessCategory_categoryId_idx" ON "BusinessCategory"("categoryId");

-- CreateIndex
CREATE INDEX "BusinessSocialLink_businessId_platform_idx" ON "BusinessSocialLink"("businessId", "platform");

-- CreateIndex
CREATE INDEX "BuyerRequest_categoryId_idx" ON "BuyerRequest"("categoryId");

-- CreateIndex
CREATE INDEX "Category_isActive_sortOrder_idx" ON "Category"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ContactEvent_businessId_idx" ON "ContactEvent"("businessId");

-- CreateIndex
CREATE INDEX "ContactEvent_businessId_platform_idx" ON "ContactEvent"("businessId", "platform");

-- CreateIndex
CREATE INDEX "ContactEvent_createdAt_idx" ON "ContactEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Location_area_idx" ON "Location"("area");

-- CreateIndex
CREATE INDEX "Location_lat_long_idx" ON "Location"("lat", "long");

-- CreateIndex
CREATE INDEX "Match_businessId_idx" ON "Match"("businessId");

-- CreateIndex
CREATE INDEX "SearchEvent_createdAt_idx" ON "SearchEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SearchEvent_category_idx" ON "SearchEvent"("category");
