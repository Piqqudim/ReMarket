
-- Create AdminAuditLog table
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx"
ON "AdminAuditLog"("adminId", "createdAt");

CREATE INDEX "AdminAuditLog_entityType_entityId_createdAt_idx"
ON "AdminAuditLog"("entityType", "entityId", "createdAt");

CREATE INDEX "AdminAuditLog_action_createdAt_idx"
ON "AdminAuditLog"("action", "createdAt");

-- Link audit records to Admin users
ALTER TABLE "AdminAuditLog"
ADD CONSTRAINT "AdminAuditLog_adminId_fkey"
FOREIGN KEY ("adminId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
