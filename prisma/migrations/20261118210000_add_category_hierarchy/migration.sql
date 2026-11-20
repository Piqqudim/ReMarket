-- ReMarket category images and parent/child category hierarchy.
-- Existing categories remain root categories because parentId is nullable.
-- Safe to re-run: columns, index, and foreign key are checked before creation.

BEGIN;

-- 1. Add the optional category image URL and parent category ID.
ALTER TABLE "Category"
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "parentId" TEXT;

-- 2. Create the composite index.
CREATE INDEX IF NOT EXISTS "Category_parentId_isActive_sortOrder_idx"
  ON "Category" ("parentId", "isActive", "sortOrder");

-- 3. Add the self-referencing foreign key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Category_parentId_fkey'
      AND conrelid = '"Category"'::regclass
  ) THEN
    ALTER TABLE "Category"
      ADD CONSTRAINT "Category_parentId_fkey"
      FOREIGN KEY ("parentId")
      REFERENCES "Category" ("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;