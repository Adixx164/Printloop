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

export const watermarkQueue = makeQueue('watermark-pdf');
export const fileCleanupQueue = makeQueue('file-cleanup');
export const emailQueue = makeQueue('email');
export const smsQueue = makeQueue('sms');
export const scheduledQueue = makeQueue('scheduled');

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
  console.log('✓ Scheduled jobs initialized');
}
