import { Worker, Job } from 'bullmq';
import { deliverWebhook } from '../services/tenantWebhook.service';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

/**
 * Webhook delivery worker (Dimension 14 — V2-15).
 *
 * Consumes `webhook-deliveries`. Each job is one signed POST to one
 * tenant endpoint. `deliverWebhook` throws on non-2xx, which makes
 * BullMQ retry per the queue's defaultJobOptions (3 attempts,
 * exponential backoff). After the final attempt the job lands in
 * the failed set; the webhook row's `lastFailureAt/Reason` is
 * stamped on every attempt so the tenant dashboard shows the most
 * recent error.
 */
export const webhookWorker = new Worker(
  'webhook-deliveries',
  async (job: Job) => {
    const { webhookId, url, secret, event, body } = job.data;
    await deliverWebhook({ webhookId, url, secret, event, body });
    return { delivered: true };
  },
  { connection: redisConnection, concurrency: 5 },
);

webhookWorker.on('failed', (job, err) => {
  console.error(
    `[webhook-worker] delivery ${job?.id} failed (attempt ${job?.attemptsMade}):`,
    err?.message,
  );
});
