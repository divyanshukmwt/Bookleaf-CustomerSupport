import type { Prisma } from '@prisma/client';
import { logger } from '../config/logger';
import { prisma } from './prisma';

// Records admin/author actions in audit_logs. Auditing must never break the request it describes.
export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  logger.info({ event: `audit.${action}`, actorId, entityType, entityId }, 'audit event');
  try {
    await prisma.auditLog.create({ data: { actorId, action, entityType, entityId, metadata } });
  } catch (err) {
    logger.error({ err, action }, 'failed to write audit log');
  }
}
