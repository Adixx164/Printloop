import { Request, Response, Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { resolveTenant } from '../middleware/tenant.middleware';
import { PaystackService } from '../services/paystack.service';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';

const router = Router();
const paystack = new PaystackService();
const hasPaystack = Boolean(process.env.PAYSTACK_SECRET_KEY);

/**
 * POST /api/payments/initialize-job-payment
 * Begin a direct paystack print-job payment.
 * Body: { jobId: string }
 */
router.post('/initialize-job-payment', authenticate, resolveTenant, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const jobId = String(req.body?.jobId || '').trim();
    if (!jobId) {
      res.status(400).json({ success: false, message: 'jobId is required' });
      return;
    }

    const jobRepo = AppDataSource.getRepository(PrintJob);
    const job = await jobRepo.findOne({ where: { id: jobId, userId: user.id } });
    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found' });
      return;
    }

    if (job.status !== PrintJobStatus.PENDING) {
      res.status(400).json({ success: false, message: 'Job is not in PENDING state' });
      return;
    }

    const amount = Number(job.cost);
    if (amount <= 0) {
      res.status(400).json({ success: false, message: 'Job has zero cost' });
      return;
    }

    if (!hasPaystack) {
      const reference = `DEV_JOB_${job.id}_${Date.now()}`;
      res.json({
        success: true,
        data: {
          authorizationUrl: `https://checkout.paystack.com/mock_${reference}`,
          reference,
          mock: true,
        },
      });
      return;
    }

    const data = await paystack.initializeJobPayment(
      user.id,
      job.id,
      amount,
      user.email,
      req.tenant || undefined,
    );
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Job payment init error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to initialize job payment' });
  }
});

/**
 * POST /api/payments/webhook
 * Paystack server-to-server callback. Verifies the HMAC-SHA512 signature
 * against the RAW request body (captured by app.ts), then dispatches:
 *   - charge.success → mark the print-job paid + capture the saved-card
 *     authorization code for delta charges (V2-53)
 *   - transfer.* → tenant payouts (Dimension 15)
 */
router.post('/webhook', async (req: Request, res: Response) => {
  await handleWebhook(req, res);
});

// Alias for /api/webhooks/paystack (legacy path used by Paystack config)
router.post('/paystack', async (req: Request, res: Response) => {
  await handleWebhook(req, res);
});

async function handleWebhook(req: Request, res: Response) {
  try {
    const signature = req.header('x-paystack-signature');
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody) {
      // The raw-body capture in app.ts didn't fire — refuse rather than
      // verify against a re-serialised JSON copy (different bytes).
      res.status(400).json({ success: false, message: 'Raw body unavailable' });
      return;
    }
    if (!paystack.verifyWebhookSignature(rawBody, signature)) {
      res.status(401).json({ success: false, message: 'Invalid signature' });
      return;
    }
    const result = await paystack.handleWebhook(req.body);
    // Always 200 once verified — Paystack will keep retrying any non-2xx,
    // and we've already recorded what we needed to (or chosen to ignore).
    res.json({ success: true, ...result });
} catch (error: any) {
      console.error('Payment webhook error:', error);
      res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
  }

export default router;
