import type { Request } from 'express';
import { AppDataSource } from '../config/database';
import { AuditLog } from '../entities/auditLog.entity';

/**
 * Append an admin audit-log row. Best-effort: a failed write here must
 * never bubble out and abort the actual admin mutation (the action was
 * still authorised + executed). Logs the failure to stderr so it shows up
 * in observability without breaking the response.
 */
export async function writeAudit(
  req: Request,
  action: string,
  target: string,
  detail?: any,
): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(AuditLog);
    const user = (req as any).user;
    await repo.save(
      repo.create({
        actorId: (req as any).admin?.id || user?.id || null,
        actorName: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || (user.email || 'admin') : 'system',
        action,
        target,
        detail: detail ?? null,
        ipAddress: req.ip || (req.socket as any)?.remoteAddress || null,
      } as any),
    );
  } catch (err) {
    console.error('Audit write failed:', err);
  }
}
