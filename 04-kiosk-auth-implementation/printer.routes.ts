import { Router } from 'express';
import { kioskAuth } from '../../middleware/kioskAuth.middleware';
import {
  validateCode,
  getJob,
  startPrintJob,
  completePrintJob,
  failPrintJob,
  getReadyJobs,
  getJobStatus,
} from '../controllers/printer.controller';

const router = Router();

/**
 * Printer / Kiosk API Routes
 * All routes now require X-Kiosk-Key header for authentication
 * 
 * Example request:
 * POST /printer/validate-code
 * Headers:
 *   X-Kiosk-Key: your-kiosk-api-key-here
 *   Content-Type: application/json
 * Body:
 *   { "code": "AB1234" }
 */

// Validate print code
router.post('/validate-code', kioskAuth, validateCode);

// Get job details
router.post('/get-job', kioskAuth, getJob);

// Start printing
router.post('/start', kioskAuth, startPrintJob);

// Complete print job
router.post('/complete', kioskAuth, completePrintJob);

// Mark job as failed
router.post('/fail', kioskAuth, failPrintJob);

// Get list of ready jobs (for polling)
router.get('/ready-jobs', kioskAuth, getReadyJobs);

// Get job status by code (lightweight check)
router.get('/status/:code', kioskAuth, getJobStatus);

export default router;
