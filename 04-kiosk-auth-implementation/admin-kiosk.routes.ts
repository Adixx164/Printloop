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
// import { adminAuth } from '../../middleware/adminAuth.middleware'; // TODO: Add admin auth when implemented

const router = Router();

/**
 * Admin Kiosk Management Routes
 * 
 * TODO: Uncomment adminAuth middleware when admin authentication is implemented
 * All routes should be protected with admin authentication
 */

// Create new kiosk
router.post('/', /* adminAuth, */ createKiosk);

// List all kiosks (with optional filters)
router.get('/', /* adminAuth, */ listKiosks);

// Get offline kiosks
router.get('/offline', /* adminAuth, */ getOfflineKiosks);

// Get single kiosk by ID
router.get('/:id', /* adminAuth, */ getKiosk);

// Update kiosk status
router.patch('/:id/status', /* adminAuth, */ updateKioskStatus);

// Update kiosk details
router.patch('/:id', /* adminAuth, */ updateKiosk);

// Regenerate API key for kiosk
router.post('/:id/regenerate-key', /* adminAuth, */ regenerateApiKey);

// Delete kiosk (soft delete)
router.delete('/:id', /* adminAuth, */ deleteKiosk);

export default router;
