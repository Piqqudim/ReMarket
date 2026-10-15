-- CreateEnum
CREATE TYPE "AdminContentPlatform" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "AdminContentStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateTable
CREATE TABLE "AdminContent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imagePublicId" TEXT,
    "linkUrl" TEXT,
    "platforms" "AdminContentPlatform"[] DEFAULT ARRAY[]::"AdminContentPlatform"[],
    "status" "AdminContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminContent_status_updatedAt_idx" ON "AdminContent"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AdminContent_createdById_createdAt_idx" ON "AdminContent"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminContent" ADD CONSTRAINT "AdminContent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
