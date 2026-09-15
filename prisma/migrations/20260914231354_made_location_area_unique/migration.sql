/*
  Warnings:

  - A unique constraint covering the columns `[area]` on the table `Location` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Location_area_key" ON "Location"("area");
