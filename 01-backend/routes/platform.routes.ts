import { Request, Response, Router } from 'express';
import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { TenantMember, TenantMemberRole } from '../entities/tenantMember.entity';
import { Kiosk } from '../entities/kiosk.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { authenticate } from '../middleware/auth.middleware';
import { requirePlatformAdmin } from '../middleware/platformAdmin.middleware';
import { writeAudit } from '../services/audit.service';
import { signAccessToken } from '../utils/jwt';

const router = Router();

/**
 * Platform admin console API (Dimension 11). Cross-tenant by
 * definition — no `resolveTenant` here. SUPER_ADMIN only.
 *
 * Today: list tenants, suspend, reactivate. Future additions
 * (deferred to next sessions): impersonation token mint, per-tenant
 * usage rollup, fleet-wide kiosk health.
 */

router.use(authenticate, requirePlatformAdmin);

/** GET /api/platform/tenants */
router.get('/tenants', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 50)));
    const before = req.query?.before
      ? new Date(String(req.query.before))
      : null;
    const status = (req.query?.status as string) || undefined;
    const qb = AppDataSource.getRepository(Tenant)
      .createQueryBuilder('t')
      .orderBy('t.createdAt', 'DESC')
      .limit(limit);
    if (status) qb.andWhere('t.status = :s', { s: status });
    if (before && !Number.isNaN(before.getTime())) {
      qb.andWhere('t.createdAt < :before', { before });
    }
    const rows = await qb.getMany();
    res.json({
      success: true,
      data: {
        items: rows.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          status: t.status,
          commissionPct: Number(t.commissionPct),
          customDomain: t.customDomain,
          paystackSubaccountCode: t.paystackSubaccountCode,
          suspendedAt: t.suspendedAt,
          suspendReason: t.suspendReason,
          createdAt: t.createdAt,
        })),
        nextCursor:
          rows.length === limit ? rows[rows.length - 1].createdAt : null,
      },
    });
  } catch (err: any) {
    console.error('[platform] list tenants:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to list tenants' });
  }
});

/** GET /api/platform/tenants/:id */
router.get('/tenants/:id', async (req: Request, res: Response) => {
  try {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: req.params.id },
    });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    res.json({ success: true, data: tenant });
  } catch (err: any) {
    console.error('[platform] get tenant:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to load tenant' });
  }
});

/**
 * POST /api/platform/tenants/:id/suspend
 * Body: { reason?: string }
 *
 * `tenant.middleware.resolveTenant` already enforces 403 on
 * `status=SUSPENDED`; flipping the column is enough to lock the
 * tenant out across every authed route. The tenant admin's
 * /api/saas/me still returns 403, so the tenant dashboard will
 * surface the suspension banner.
 */
router.post('/tenants/:id/suspend', async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    if (tenant.status === TenantStatus.SUSPENDED) {
      res.status(409).json({
        success: false,
        message: 'Tenant is already suspended',
      });
      return;
    }
    const reason = String(req.body?.reason || '').slice(0, 255) || null;
    tenant.status = TenantStatus.SUSPENDED;
    tenant.suspendedAt = new Date();
    tenant.suspendReason = reason;
    await repo.save(tenant);
    await writeAudit(req, 'tenant.suspended', `tenant:${tenant.id}`, {
      reason,
      slug: tenant.slug,
    });
    res.json({
      success: true,
      data: {
        id: tenant.id,
        status: tenant.status,
        suspendedAt: tenant.suspendedAt,
        suspendReason: tenant.suspendReason,
      },
    });
  } catch (err: any) {
    console.error('[platform] suspend:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to suspend tenant' });
  }
});

/** POST /api/platform/tenants/:id/reactivate */
router.post('/tenants/:id/reactivate', async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Tenant);
    const tenant = await repo.findOne({ where: { id: req.params.id } });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    if (tenant.status === TenantStatus.CLOSED) {
      res.status(409).json({
        success: false,
        message: 'Tenant is closed and cannot be reactivated',
      });
      return;
    }
    tenant.status = TenantStatus.ACTIVE;
    tenant.suspendedAt = null;
    tenant.suspendReason = null;
    await repo.save(tenant);
    await writeAudit(req, 'tenant.reactivated', `tenant:${tenant.id}`, {
      slug: tenant.slug,
    });
    res.json({
      success: true,
      data: { id: tenant.id, status: tenant.status },
    });
  } catch (err: any) {
    console.error('[platform] reactivate:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to reactivate tenant' });
  }
});

/**
 * POST /api/platform/tenants/:id/impersonate
 *
 * Mints a short-lived JWT that lets the platform admin act as a
 * tenant admin on this tenant. The token carries:
 *   - `userId`        — the platform admin's real userId.
 *   - `role`          — preserved as `super_admin`.
 *   - `memberships`   — synthesised: `[{ tenantId, role: 'owner' }]`
 *                       so RBAC checks see the platform admin as an
 *                       owner of the target tenant.
 *   - `impersonating` — `{ tenantId, actorUserId }` so audit logs
 *                       can attribute mutations to the real human.
 *
 * Default lifetime: 1 hour. Override via `?ttl=900` (seconds), max 4h.
 * Use cases: customer-support session, debugging a stuck payout,
 * reproducing a tenant's bug.
 *
 * Audit-logged on issue (the impersonation action itself); every
 * subsequent action under the token gets stamped via writeAudit's
 * existing actor field — V2-14 leaves a follow-up to surface
 * `impersonating.actorUserId` in the audit log's actorName when
 * present.
 */
router.post('/tenants/:id/impersonate', async (req: Request, res: Response) => {
  try {
    const tenant = await AppDataSource.getRepository(Tenant).findOne({
      where: { id: req.params.id },
    });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    if (tenant.status === TenantStatus.CLOSED) {
      res.status(410).json({
        success: false,
        message: 'Cannot impersonate a closed tenant',
      });
      return;
    }
    const platformAdmin = (req as any).user;
    const ttlSeconds = Math.min(
      4 * 3600,
      Math.max(60, Number(req.query?.ttl ?? 3600)),
    );

    const token = signAccessToken(
      {
        userId: platformAdmin.id,
        role: platformAdmin.role,
        // Synthetic owner membership — bypasses tenant-membership
        // RBAC checks for the duration of the token. SUPER_ADMIN
        // already bypasses tenant.middleware's gate, but stamping
        // memberships keeps the rbac.middleware path uniform.
        memberships: [
          { tenantId: tenant.id, role: TenantMemberRole.OWNER },
        ],
        impersonating: {
          tenantId: tenant.id,
          actorUserId: platformAdmin.id,
        },
      },
      { expiresIn: ttlSeconds },
    );

    await writeAudit(req, 'tenant.impersonate.start', `tenant:${tenant.id}`, {
      slug: tenant.slug,
      ttlSeconds,
    });
    res.json({
      success: true,
      data: {
        token,
        ttlSeconds,
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
        },
      },
    });
  } catch (err: any) {
    console.error('[platform] impersonate:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Failed to mint token' });
  }
});

/**
 * DELETE /api/platform/tenants/:id?force=true
 *
 * Hard-delete — wipes every tenant-scoped row in FK-dependency
 * order, then the tenant row itself. Refuses unless the tenant is
 * CLOSED + past the 30-day cooling-off + zero outstanding balance,
 * UNLESS `?force=true` (ops cleanup of test tenants).
 *
 * This is the irreversible counterpart to the tenant-owner's
 * `DELETE /api/saas/me` (which only flips status=CLOSED). SUPER_ADMIN
 * only; audit-logged BEFORE the wipe so the trail survives.
 */
router.delete('/tenants/:id', async (req: Request, res: Response) => {
  try {
    const force = String(req.query?.force ?? '') === 'true';
    const { hardDeleteTenant } = await import(
      '../services/tenantDelete.service'
    );
    // Audit BEFORE the delete — once the rows are gone, a tenant-
    // scoped audit row would be orphaned. This one is platform-scoped
    // (tenantId stays null on the platform trail).
    await writeAudit(req, 'tenant.hard_delete', `tenant:${req.params.id}`, {
      force,
    });
    const result = await hardDeleteTenant(req.params.id, { force });
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[platform] hard-delete:', err);
    res.status(400).json({
      success: false,
      message: err?.message || 'Hard-delete failed',
    });
  }
});

/**
 * GET /api/platform/reliability
 *
 * Fleet-wide uptime and job execution metrics for the platform super admin (Dimension 11).
 */
router.get('/reliability', async (req: Request, res: Response) => {
  try {
    const kioskRepo = AppDataSource.getRepository(Kiosk);
    const jobRepo = AppDataSource.getRepository(PrintJob);

    // 1. Kiosk Heartbeats / Online Rates
    const allKiosks = await kioskRepo.find();
    const activeKiosks = allKiosks.filter(k => k.status !== 'DISABLED');
    
    // An active kiosk is considered online if lastSeenAt is within the last 15 minutes
    const cutoffTime = new Date(Date.now() - 15 * 60 * 1000);
    const onlineKiosks = activeKiosks.filter(k => k.lastSeenAt && new Date(k.lastSeenAt) >= cutoffTime);

    // 2. Job success/failure rates
    const completedCount = await jobRepo.count({ where: { status: PrintJobStatus.DONE } });
    const failedCount = await jobRepo.count({ where: { status: PrintJobStatus.FAILED } });
    const totalFinished = completedCount + failedCount;
    const failureRate = totalFinished > 0 ? (failedCount / totalFinished) * 100 : 0;
    const successRate = totalFinished > 0 ? (completedCount / totalFinished) * 100 : 0;

    // 3. Paid but unredeemed jobs
    const unredeemedReady = await jobRepo.count({ where: { status: PrintJobStatus.READY } });
    const unredeemedRendering = await jobRepo.count({ where: { status: PrintJobStatus.RENDERING } });
    const unredeemedReleasing = await jobRepo.count({ where: { status: PrintJobStatus.RELEASING } });
    const unredeemedPrinting = await jobRepo.count({ where: { status: PrintJobStatus.PRINTING } });
    const totalPaidUnredeemed = unredeemedReady + unredeemedRendering + unredeemedReleasing + unredeemedPrinting;

    res.json({
      success: true,
      data: {
        agentUptime: {
          totalActiveKiosks: activeKiosks.length,
          onlineKiosksCount: onlineKiosks.length,
          onlineRatePct: activeKiosks.length > 0 ? (onlineKiosks.length / activeKiosks.length) * 100 : 0,
        },
        jobSuccessRate: {
          completedJobsCount: completedCount,
          failedJobsCount: failedCount,
          successRatePct: successRate,
          failureRatePct: failureRate,
        },
        paidUnredeemed: {
          readyCount: unredeemedReady,
          renderingCount: unredeemedRendering,
          releasingCount: unredeemedReleasing,
          printingCount: unredeemedPrinting,
          totalPaidUnredeemed,
        }
      }
    });
  } catch (err: any) {
    console.error('[platform] reliability stats error:', err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Failed to compute reliability stats',
    });
  }
});

export default router;
