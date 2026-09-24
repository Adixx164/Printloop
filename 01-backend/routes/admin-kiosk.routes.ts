import { Router, type Request, type Response } from 'express';
import {
  createKiosk,
  listKiosks,
  getKiosk,
  updateKioskStatus,
  updateKiosk,
  regenerateApiKey,
  getOfflineKiosks,
  deleteKiosk,
  testKioskConnection,
} from '../controllers/kiosk.controller';
import { Permission, requirePermission } from '../middleware/rbac.middleware';
import { AppDataSource } from '../config/database.js';
import { Kiosk } from '../entities/kiosk.entity.js';

const router = Router();

/**
 * Admin Kiosk Management Routes.
 * Mounted under /api/admin/kiosks behind the JWT `authenticate` middleware,
 * so every handler here additionally enforces kiosk permissions.
 */

// List / read — requires VIEW_KIOSKS
router.get('/', requirePermission(Permission.VIEW_KIOSKS), listKiosks);
router.get('/offline', requirePermission(Permission.VIEW_KIOSKS), getOfflineKiosks);
router.get('/:id', requirePermission(Permission.VIEW_KIOSKS), getKiosk);

// Mutations — require MANAGE_KIOSKS
router.post('/', requirePermission(Permission.MANAGE_KIOSKS), createKiosk);
router.patch('/:id/status', requirePermission(Permission.MANAGE_KIOSKS), updateKioskStatus);
router.patch('/:id', requirePermission(Permission.MANAGE_KIOSKS), updateKiosk);
router.post('/:id/regenerate-key', requirePermission(Permission.MANAGE_KIOSKS), regenerateApiKey);
// Probe printer reachability (TCP connect on common print ports). Read-
// only operation; gated on VIEW_KIOSKS so support staff can use it.
router.post('/:id/test-connection', requirePermission(Permission.VIEW_KIOSKS), testKioskConnection);

/**
 * POST /api/admin/kiosks/:id/test-print-pass (V2-32).
 *
 * Tenant admin records that a successful test print came out of
 * this kiosk's printer — the "live gate" sign-off. Pure marker
 * write; the kiosk software doesn't auto-detect, the human ran a
 * test page and confirmed it on paper.
 *
 * Tenant-scoped via resolveTenant in the mount; we additionally
 * verify the kiosk belongs to req.tenant so a token from tenant A
 * can't stamp tenant B's kiosk.
 */
router.post(
  '/:id/test-print-pass',
  requirePermission(Permission.MANAGE_KIOSKS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Kiosk);
      const kiosk = await repo.findOne({ where: { id: req.params.id } });
      if (!kiosk) {
        res
          .status(404)
          .json({ success: false, message: 'Kiosk not found' });
        return;
      }
      if (req.tenant && kiosk.tenantId !== req.tenant.id) {
        res.status(404).json({ success: false, message: 'Kiosk not found' });
        return;
      }
      kiosk.testPrintPassedAt = new Date();
      await repo.save(kiosk);
      res.json({
        success: true,
        data: { id: kiosk.id, testPrintPassedAt: kiosk.testPrintPassedAt },
      });
    } catch (err: any) {
      console.error('[kiosks/test-print-pass] error:', err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to mark test print passed',
      });
    }
  },
);

router.delete('/:id', requirePermission(Permission.MANAGE_KIOSKS), deleteKiosk);

export default router;
