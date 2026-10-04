-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "street" TEXT;

-- CreateIndex
CREATE INDEX "Location_street_idx" ON "Location"("street");
