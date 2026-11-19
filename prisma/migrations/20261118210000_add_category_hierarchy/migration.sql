ALTER TABLE "Category"
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "parentId" TEXT;

CREATE INDEX "Category_parentId_isActive_sortOrder_idx"
ON "Category"("parentId", "isActive", "sortOrder");

ALTER TABLE "Category"
ADD CONSTRAINT "Category_parentId_fkey"
FOREIGN KEY ("parentId")
REFERENCES "Category"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;