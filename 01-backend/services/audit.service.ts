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
    let actorName = user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
        (user.email || 'admin')
      : 'system';
    // Impersonation surfacing (Dimension 11 — V2-15). When a platform
    // admin is acting as a tenant via an impersonation token, the
    // JWT carries `impersonating.actorUserId`. Tag the audit row so
    // the trail reads "[impersonated by <id>]" instead of pinning the
    // action on the tenant as if they did it themselves.
    const memberships = req.tenantMemberships;
    const impersonatorId = (req as any).impersonatingActorUserId;
    if (impersonatorId) {
      actorName = `${actorName} [impersonated by platform:${impersonatorId}]`;
    }
    void memberships; // referenced for future per-membership tagging
    await repo.save(
      repo.create({
        // Stamp the resolved tenant on every audit row. Platform-level
        // actions targeting a tenant (e.g. suspending) carry the
        // targeted tenant's id. Boot/migration logs that run before
        // tenant resolution leave this NULL.
        tenantId: req.tenant?.id ?? null,
        actorId: (req as any).admin?.id || user?.id || null,
        actorName,
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
