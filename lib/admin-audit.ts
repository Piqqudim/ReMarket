import type { Prisma } from "@prisma/client";

type AdminAuditLogClient = Pick<Prisma.TransactionClient, "adminAuditLog">;

export type AdminAuditLogInput = {
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

function requiredText(value: string, field: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Admin audit log ${field} is required.`);
  if (normalized.length > maxLength) throw new Error(`Admin audit log ${field} is too long.`);
  return normalized;
}

export async function writeAdminAuditLog(
  db: AdminAuditLogClient,
  input: AdminAuditLogInput,
) {
  const adminId = requiredText(input.adminId, "adminId", 100);
  const action = requiredText(input.action, "action", 100);
  const entityType = requiredText(input.entityType, "entityType", 50);
  const entityId = requiredText(input.entityId, "entityId", 100);

  let reason: string | null | undefined;

  if (input.reason !== undefined) {
    reason = input.reason === null ? null : input.reason.trim() || null;
    if (reason && reason.length > 1000) {
      throw new Error("Admin audit log reason must not exceed 1000 characters.");
    }
  }

  return db.adminAuditLog.create({
    data: {
      adminId,
      action,
      entityType,
      entityId,
      ...(reason !== undefined ? { reason } : {}),
      ...(input.beforeData !== undefined ? { beforeData: input.beforeData } : {}),
      ...(input.afterData !== undefined ? { afterData: input.afterData } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}