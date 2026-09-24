/**
 * Background job queues. BullMQ requires Redis; when Redis isn't configured
 * we export no-op queue stubs so the app runs cleanly in local dev — jobs are
 * logged and skipped instead of crashing on a missing connection.
 */
import { Queue, type QueueOptions } from 'bullmq';
import { REDIS_ENABLED } from '../config/redis';

export interface JobQueue {
  add(name: string, data?: any, opts?: any): Promise<{ id: string }>;
}

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

const defaultJobOptions: QueueOptions['defaultJobOptions'] = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

function makeQueue(name: string): JobQueue {
  if (REDIS_ENABLED) {
    return new Queue(name, {
      connection: redisConnection,
      defaultJobOptions,
    }) as unknown as JobQueue;
  }
  return {
    async add(jobName: string) {
      console.log(`[queue:${name}] skipped "${jobName}" (Redis disabled)`);
      return { id: `noop-${Date.now()}` };
    },
  };
}

export const fileCleanupQueue = makeQueue('file-cleanup');
export const scheduledQueue = makeQueue('scheduled');
/**
 * Render queue — consumed by the standalone render-worker service
 * (see ../render-worker/). Each job normalises an uploaded document
 * to PWG-Raster via ghostscript + cups-filters and stores the
 * spool-ready artifact for the kiosk to pull. See
 * ../ARCHITECTURE.md (cloud render → kiosk spool).
 *
 * Job payload: { printJobId, tenantId, sourceFileKey, printerProfileId | null }
 */
export const renderQueue = makeQueue('render');
/**
 * Webhook delivery queue (Dimension 14 — V2-15). Each job is one
 * outbound POST to one tenant webhook endpoint. BullMQ's retry +
 * backoff (defaultJobOptions: 3 attempts, exponential) gives us
 * at-least-once delivery for free. Consumed by
 * `workers/webhook.worker.ts`.
 *
 * Job payload:
 *   { webhookId, url, secret, event, body } — body is the
 *   pre-serialised JSON string so the HMAC signature the worker
 *   computes matches the bytes it sends.
 */
export const webhookQueue = makeQueue('webhook-deliveries');
/**
 * Notification queue — for async push/email notifications (edit flow, etc.)
 */
export const notificationQueue = makeQueue('notifications');

/**
 * Register repeatable scheduled jobs. No-op when Redis is disabled.
 * Call once on server startup.
 */
export async function initScheduledJobs(): Promise<void> {
  if (!REDIS_ENABLED) {
    console.log('Scheduled jobs: skipped (Redis disabled)');
    return;
  }
  await scheduledQueue.add(
    'auto-close-group-sessions',
    {},
    { repeat: { every: 15 * 60 * 1000 }, jobId: 'auto-close-group-sessions' }
  );
  await scheduledQueue.add(
    'mark-offline-kiosks',
    {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'mark-offline-kiosks' }
  );
  await scheduledQueue.add(
    'daily-cleanup',
    {},
    { repeat: { pattern: '0 3 * * *' }, jobId: 'daily-cleanup' }
  );
  // Database backup (SQLite `VACUUM INTO` / Postgres `pg_dump`) — fires
  // daily at 02:30 UTC, before daily-cleanup, so backups run on a calm
  // DB. Rotation keeps the newest `BACKUP_KEEP` (default 14) files.
  await scheduledQueue.add(
    'db-backup',
    {},
    { repeat: { pattern: '30 2 * * *' }, jobId: 'db-backup' }
  );
  // Payouts to tenants (Dimension 15) — fires daily at 04:00 UTC,
  // after daily-cleanup. The job's own per-schedule filter
  // (PayoutSchedule.cadence + dayOfWeek) decides which tenants get
  // a transfer today; daily-cadence tenants fire every day.
  await scheduledQueue.add(
    'process-payouts',
    {},
    { repeat: { pattern: '0 4 * * *' }, jobId: 'process-payouts' }
  );
  // Stuck-RENDERING sweep — fires every 10 minutes. Tight cadence
  // because the customer is at a kiosk waiting; we want to unstick
  // within one pickup window. The 15-minute threshold inside
  // reconcileStuckRenders keeps it from misfiring on legitimately
  // slow renders.
  await scheduledQueue.add(
    'reconcile-stuck-renders',
    {},
    {
      repeat: { every: 10 * 60 * 1000 },
      jobId: 'reconcile-stuck-renders',
    },
  );
  console.log('✓ Scheduled jobs initialized');
}
