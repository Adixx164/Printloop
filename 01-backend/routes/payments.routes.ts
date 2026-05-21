import { Request, Response, Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { PaystackService } from '../services/paystack.service';

const router = Router();
const paystack = new PaystackService();
const hasPaystack = Boolean(process.env.PAYSTACK_SECRET_KEY);

/**
 * POST /api/payments/initialize
 * Begin a wallet top-up. With a real Paystack key we hand back a hosted
 * checkout URL; without one (local dev) we return a mock URL so the flow
 * is still exercisable end-to-end.
 */
router.post('/initialize', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const amount = Number(req.body?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ success: false, message: 'A positive amount is required' });
      return;
    }

    if (!hasPaystack) {
      const reference = `DEV_${user.id}_${Date.now()}`;
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

    const data = await paystack.initializeTopUp(user.id, amount, user.email);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Payment init error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to initialize payment' });
  }
});

/**
 * POST /api/payments/webhook
 * Paystack server-to-server callback. Verifies the HMAC-SHA512 signature
 * against the RAW request body (captured by app.ts), then dispatches:
 *   - charge.success → credit wallet (idempotent on reference)
 *   - charge.failed / charge.dispute → reverse a prior credit if any
 */
router.post('/webhook', async (req: Request, res: Response) => {
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
});

export default router;
