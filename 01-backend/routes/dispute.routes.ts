import { Router, type Request, type Response } from 'express';
import { AppDataSource } from '../config/database';
import { Dispute, DisputeStatus } from '../entities/dispute.entity';
import { authenticate } from '../middleware/auth.middleware';
import { resolveTenant } from '../middleware/tenant.middleware';
import { requirePermission, Permission } from '../middleware/rbac.middleware';

const router = Router();

/**
 * GET /api/admin/disputes
 *
 * List all disputes for the resolved tenant.
 */
router.get(
  '/',
  authenticate,
  resolveTenant,
  requirePermission(Permission.VIEW_JOBS),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenant!.id;
      const disputeRepo = AppDataSource.getRepository(Dispute);
      const disputes = await disputeRepo.find({
        where: { tenantId },
        relations: ['user', 'printJob'],
        order: { createdAt: 'DESC' },
      });
      res.json({ success: true, data: disputes });
    } catch (error: any) {
      console.error('List disputes error:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to list disputes.' });
    }
  }
);

/**
 * POST /api/admin/disputes/:id/resolve
 *
 * Resolve a dispute as resolved or rejected. V2-53: refunds are
 * eliminated — resolving marks the dispute closed with the notes; no
 * money movement happens here.
 * Body: { status: 'resolved' | 'rejected', resolutionNotes: string }
 */
router.post(
  '/:id/resolve',
  authenticate,
  resolveTenant,
  requirePermission(Permission.ISSUE_REFUNDS),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenant!.id;
      const disputeId = req.params.id;
      const { status, resolutionNotes } = req.body || {};

      if (!status || ![DisputeStatus.RESOLVED, DisputeStatus.REJECTED].includes(status)) {
        res.status(400).json({ success: false, message: 'Status must be resolved or rejected.' });
        return;
      }

      const disputeRepo = AppDataSource.getRepository(Dispute);
      const dispute = await disputeRepo.findOne({
        where: { id: disputeId, tenantId },
        relations: ['printJob'],
      });

      if (!dispute) {
        res.status(404).json({ success: false, message: 'Dispute not found.' });
        return;
      }

      if (dispute.status !== DisputeStatus.PENDING) {
        res.status(400).json({ success: false, message: 'Dispute has already been resolved or rejected.' });
        return;
      }

      dispute.status = status;
      dispute.resolutionNotes =
        resolutionNotes || (status === DisputeStatus.RESOLVED ? 'Resolved by admin' : 'Dispute rejected by admin');

      await disputeRepo.save(dispute);
      res.json({ success: true, data: dispute });
    } catch (error: any) {
      console.error('Resolve dispute error:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to resolve dispute.' });
    }
  }
);

export default router;
