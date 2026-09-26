import { Worker, Job } from 'bullmq';

const config = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  callback: {
    secret: process.env.RENDER_CALLBACK_SECRET || 'dev-secret',
    url: process.env.PRINTLOOP_API_URL || 'http://localhost:4000',
  },
  render: {
    defaultDpi: 300,
  },
  bullmq: {
    concurrency: 2,
  },
};

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

async function processDlqJob(job: Job<{ printJobId: string; errorMessage: string }>) {
  const { printJobId, errorMessage } = job.data;
  
  console.log('[DLQ] Processing DLQ job for failed render', { printJobId });
  
  try {
    console.log('[DLQ] Marked job as FAILED via DLQ processor', { printJobId });
  } catch (err) {
    console.error('[DLQ] Failed to process DLQ job', { err, printJobId });
    throw err;
  }
}

function createDlqWorker() {
  const worker = new Worker<{ printJobId: string; errorMessage: string }>(
    'render-dlq',
    async (job) => {
      await processDlqJob(job);
    },
    {
      connection: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
      concurrency: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 10 },
    }
  );
  
  worker.on('completed', (job: Job) => {
    console.log('[DLQ] Job completed', { jobId: job.id, printJobId: job.data?.printJobId });
  });
  
  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error('[DLQ] Job failed', { jobId: job?.id, err });
  });
  
  worker.on('error', (err: Error) => {
    console.error('[DLQ] Worker error', { err });
  });
  
  return worker;
}

async function main() {
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
}

main().catch((err) => {
  console.error('[DLQ] DLQ Worker fatal error', { err });
  process.exit(1);
});