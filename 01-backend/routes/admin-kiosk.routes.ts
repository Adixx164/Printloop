import { Router } from 'express';
import {
  createKiosk,
  listKiosks,
  getKiosk,
  updateKioskStatus,
  updateKiosk,
  regenerateApiKey,
  getOfflineKiosks,
  deleteKiosk,
} from '../controllers/kiosk.controller';
import { Permission, requirePermission } from '../middleware/rbac.middleware';

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
router.delete('/:id', requirePermission(Permission.MANAGE_KIOSKS), deleteKiosk);

export default router;
