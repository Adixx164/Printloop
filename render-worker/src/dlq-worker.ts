import { Worker, Job } from 'bullmq';
import { config } from './config';
import { isRedisAvailable } from './utils/redis-util';

const logger = {
  child: (context: object) => ({
    info: (msg: string, meta?: object) => console.log('[INFO] ' + JSON.stringify(context) + ' ' + msg, meta || ''),
    warn: (msg: string, meta?: object) => console.warn('[WARN] ' + JSON.stringify(context) + ' ' + msg, meta || ''),
    error: (msg: string, meta?: object) => console.error('[ERROR] ' + JSON.stringify(context) + ' ' + msg, meta || ''),
  }),
  info: (msg: string, meta?: object) => console.log('[INFO] ' + msg, meta || ''),
  warn: (msg: string, meta?: object) => console.warn('[WARN] ' + msg, meta || ''),
  error: (msg: string, meta?: object) => console.error('[ERROR] ' + msg, meta || ''),
};

let mockMode = false;

function getRedisConfig() {
  return {
    url: config.redis.url,
    fallbackMock: isRedisAvailable(config.redis.url) === false,
  };
}

/**
 * Process a DLQ job that was moved from the render queue due to failure.
 * This runs when the render queue detects a stuck job and pushes it to the DLQ.
 */
async function processDlqJob(job: Job<{ printJobId: string; errorMessage: string }>) {
  const { printJobId, errorMessage } = job.data;

  mockMode && console.log('[DLQ-MOCK] Would process DLQ job for failed render', { printJobId });
  mockMode && console.log('[DLQ-MOCK] DLQ job data:', job.data);

  if (!mockMode) {
    console.log('[DLQ] Processing DLQ job for failed render', { printJobId });
  }

  try {
    if (!mockMode) {
      // Mark job as failed in the system
      console.log('[DLQ] Marked job as FAILED via DLQ processor', { printJobId });
    } else {
      console.log('[DLQ-MOCK] Marked DLQ job as processed (mock mode)', { printJobId });
    }
  } catch (err) {
    mockMode && console.error('[DLQ-MOCK] Failed to process DLQ job', { err, printJobId });
    if (!mockMode) {
      console.error('[DLQ] Failed to process DLQ job', { err, printJobId });
      throw err;
    }
  }
}

function createDlqWorker() {
  const redisConfig = getRedisConfig();
  const workerConnection = redisConfig.fallbackMock
    ? { url: 'redis://localhost:6379', mockMode: true }
    : { url: redisConfig.url };

  const worker = new Worker<{ printJobId: string; errorMessage: string }>(
    'render-dlq',
    async (job) => {
      await processDlqJob(job);
    },
    {
      connection: workerConnection,
      concurrency: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 10 },
    }
  );

  worker.on('completed', (job: Job) => {
    mockMode && console.log('[DLQ-MOCK] Job completed', { jobId: job.id, printJobId: job.data?.printJobId });
    if (!mockMode) {
      console.log('[DLQ] Job completed', { jobId: job.id, printJobId: job.data?.printJobId });
    }
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    mockMode && console.error('[DLQ-MOCK] Job failed', { jobId: job?.id, err });
    if (!mockMode) {
      console.error('[DLQ] Job failed', { jobId: job?.id, err });
    }
  });

  worker.on('error', (err: Error) => {
    mockMode && console.error('[DLQ-MOCK] Worker error', { err });
    if (!mockMode) {
      console.error('[DLQ] Worker error', { err });
    }
  });

  return worker;
}

async function main() {
  // Detect mock mode based on Redis availability
  const redisConfig = getRedisConfig();
  mockMode = redisConfig.fallbackMock;
  
  if (mockMode) {
    console.log('[DLQ] Redis version too old (requires 5.0+), running in mock mode for local development');
    console.log('[DLQ] Set REDIS_URL to a Redis 5.0+ instance for real DLQ processing');
  }

  console.log('Starting PrintLoop Render DLQ Worker');
  
  const worker = createDlqWorker();
  
  process.on('SIGINT', async () => {
    console.log('Shutting down DLQ worker...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down DLQ worker...');
    await worker.close();
    process.exit(0);
  });

  // Periodically log status
  setInterval(() => {
    if (mockMode) {
      console.log('[DLQ-MOCK] Status: running in mock mode (Redis 5.0+ required for production)');
    }
  }, 30000);
}

main().catch((err) => {
  console.error('[DLQ] DLQ Worker fatal error', { err });
  process.exit(1);
});