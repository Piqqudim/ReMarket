-- CreateTable
CREATE TABLE "BusinessReview" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessReview_businessId_idx" ON "BusinessReview"("businessId");

-- CreateIndex
CREATE INDEX "BusinessReview_userId_idx" ON "BusinessReview"("userId");

-- CreateIndex
CREATE INDEX "BusinessReview_createdAt_idx" ON "BusinessReview"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessReview_businessId_userId_key" ON "BusinessReview"("businessId", "userId");

-- AddForeignKey
ALTER TABLE "BusinessReview" ADD CONSTRAINT "BusinessReview_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessReview" ADD CONSTRAINT "BusinessReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
