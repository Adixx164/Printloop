import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';

const PROCESSED_PREFIX = 'webhook:processed:';
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Idempotency guard for Paystack webhooks
 * 
 * Paystack will retry webhook events multiple times. Without an idempotency
 * check, duplicate events could:
 *   - Mark a payment complete twice
 *   - Generate duplicate notifications
 *   - Double-credit a wallet
 * 
 * This middleware uses Redis to track processed event IDs. When the same
 * event arrives again, it returns 200 silently without re-processing.
 * 
 * Usage:
 *   router.post('/webhook/paystack', paystackWebhookIdempotency, webhookController);
 */
export const paystackWebhookIdempotency = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const event = req.body;

    // Paystack sends an `id` field on every event
    const eventId = event?.id || event?.data?.id;
    const eventReference = event?.data?.reference;

    if (!eventId && !eventReference) {
      // No idempotency key — pass through (signature validation will catch malformed events)
      next();
      return;
    }

    const idempotencyKey = `${PROCESSED_PREFIX}${eventId || eventReference}`;

    // Check if we've already processed this event
    const existing = await redisClient.get(idempotencyKey);

    if (existing) {
      console.log(`Duplicate webhook event ignored: ${idempotencyKey}`);
      // Return 200 silently — don't process again
      res.status(200).json({
        success: true,
        message: 'Event already processed',
        duplicate: true,
      });
      return;
    }

    // Mark as processed BEFORE running the handler
    // This prevents race conditions if the same event arrives in parallel
    await redisClient.setEx(
      idempotencyKey,
      IDEMPOTENCY_TTL_SECONDS,
      new Date().toISOString()
    );

    next();
  } catch (error) {
    console.error('Webhook idempotency middleware error:', error);
    // Fail open — don't block legitimate webhooks if Redis is down
    next();
  }
};

/**
 * Generic idempotency middleware for any endpoint
 * Reads X-Idempotency-Key header from request
 * 
 * Usage:
 *   router.post('/payments/charge', idempotencyMiddleware, chargeController);
 */
export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const idempotencyKey = req.headers['x-idempotency-key'] as string;

    if (!idempotencyKey) {
      next();
      return;
    }

    const cacheKey = `idempotency:${idempotencyKey}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      const cachedResponse = JSON.parse(cached);
      res.status(cachedResponse.statusCode).json(cachedResponse.body);
      return;
    }

    // Wrap res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      const responseData = {
        statusCode: res.statusCode,
        body,
      };
      redisClient
        .setEx(cacheKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(responseData))
        .catch(err => console.error('Idempotency cache set error:', err));
      return originalJson(body);
    };

    next();
  } catch (error) {
    console.error('Idempotency middleware error:', error);
    next();
  }
};
