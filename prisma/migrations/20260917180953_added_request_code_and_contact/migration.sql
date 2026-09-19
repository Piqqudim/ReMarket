/*
  Warnings:

  - The values [UNAVALIABLE] on the enum `Availability` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[requestCode]` on the table `BuyerRequest` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `requestCode` to the `BuyerRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Availability_new" AS ENUM ('AVAILABLE', 'ASK_SELLER', 'UNAVAILABLE');
ALTER TABLE "Business" ALTER COLUMN "availability" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "availability" DROP DEFAULT;
ALTER TABLE "Business" ALTER COLUMN "availability" TYPE "Availability_new" USING ("availability"::text::"Availability_new");
ALTER TABLE "Product" ALTER COLUMN "availability" TYPE "Availability_new" USING ("availability"::text::"Availability_new");
ALTER TYPE "Availability" RENAME TO "Availability_old";
ALTER TYPE "Availability_new" RENAME TO "Availability";
DROP TYPE "Availability_old";
ALTER TABLE "Business" ALTER COLUMN "availability" SET DEFAULT 'ASK_SELLER';
ALTER TABLE "Product" ALTER COLUMN "availability" SET DEFAULT 'ASK_SELLER';
COMMIT;

-- AlterTable
ALTER TABLE "BuyerRequest" ADD COLUMN     "requestCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BuyerRequest_requestCode_key" ON "BuyerRequest"("requestCode");

-- CreateIndex
CREATE INDEX "BuyerRequest_buyerContact_idx" ON "BuyerRequest"("buyerContact");
