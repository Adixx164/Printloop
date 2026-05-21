import { Request, Response } from 'express';
import { PrinterServiceExtensions } from '../services/printerExtensions.service';

const printerExt = new PrinterServiceExtensions();

/**
 * GET /printer/heartbeat
 * Kiosk pings this endpoint every 30 seconds
 * The kioskAuth middleware automatically updates kiosk.lastSeenAt
 */
export const heartbeat = async (req: Request, res: Response): Promise<void> => {
  const kiosk = (req as any).kiosk;
  res.json({
    success: true,
    message: 'Heartbeat received',
    data: {
      kioskId: kiosk?.id,
      timestamp: new Date().toISOString(),
      serverTime: Date.now(),
    },
  });
};

/**
 * PATCH /printer/progress
 * Kiosk reports incremental page progress for partial-print resume
 */
export const updateProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.body.code || req.body.jobNumber;
    const { pagesCompleted } = req.body;
    const kiosk = (req as any).kiosk;

    if (!code || pagesCompleted === undefined) {
      res.status(400).json({
        success: false,
        message: 'code and pagesCompleted are required',
      });
      return;
    }

    const result = await printerExt.updateProgress({
      code,
      pagesCompleted,
      kioskId: kiosk?.id,
    });

    res.json(result);
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ success: false, message: 'Failed to update progress' });
  }
};

/**
 * POST /printer/validate-code
 * Validates code (single or group batch)
 */
export const validateCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ success: false, message: 'Code is required' });
      return;
    }

    const result = await printerExt.validateCode(code);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Validate code error:', error);
    res.status(500).json({ success: false, message: 'Failed to validate code' });
  }
};

/**
 * POST /printer/get-job
 * Returns full job details (single or batch with files[])
 */
export const getJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ success: false, message: 'Code is required' });
      return;
    }

    const result = await printerExt.getJob(code);
    if (!result.success) {
      res.status(404).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ success: false, message: 'Failed to get job' });
  }
};
