BEGIN;

ALTER TABLE "Location"
ADD COLUMN IF NOT EXISTS "state" TEXT,
ADD COLUMN IF NOT EXISTS "lga" TEXT;

CREATE INDEX IF NOT EXISTS "Location_state_idx"
ON "Location"("state");

CREATE INDEX IF NOT EXISTS "Location_state_lga_idx"
ON "Location"("state", "lga");

CREATE INDEX IF NOT EXISTS "Location_state_lga_area_idx"
ON "Location"("state", "lga", "area");

COMMIT;