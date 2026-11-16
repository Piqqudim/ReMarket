CREATE TYPE "UserAccountStatus" AS ENUM (
    'ACTIVE',
    'SUSPENDED'
);

ALTER TABLE "User"
ADD COLUMN "accountStatus" "UserAccountStatus"
NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "User"
ADD COLUMN "suspendedAt" TIMESTAMP(3);