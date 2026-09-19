-- AddForeignKey
ALTER TABLE "BuyerRequest" ADD CONSTRAINT "BuyerRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
