import { Worker } from 'bullmq';
import { RenderPipeline } from './executor.js';
import { postRenderSuccess, postRenderFailure } from './callback.js';
import type { RenderManifest } from './types';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

const worker = new Worker(
  'render',
  async (job) => {
    const manifest = job.data as RenderManifest;

    const pipeline = new RenderPipeline({
      bucket: process.env.S3_BUCKET || 'printloop-dev',
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      layerKey: (tenantId, jobId) => `renders/${tenantId}/${jobId}.pwg`,
    });

    const useOpenPrinting = process.env.RENDER_USE_OPENPRINTING === 'true';

    const result = useOpenPrinting
      ? await pipeline.run(manifest)
      : await pipeline.mock(manifest);

    await Promise.all([
      job.updateProgress(100),
      job.log(
        `render-done key=${result.renderedKey} pages=${result.pageCount} bytes=${result.bytes}`,
      ),
    ]);

    // V2-41 — tell the API the render is ready. Without this the
    // PrintJob stays stuck in RENDERING forever. HMAC-signed,
    // fail-open (a callback failure doesn't fail the BullMQ job).
    await postRenderSuccess({
      printJobId: manifest.printJobId,
      renderedKey: result.renderedKey,
      renderedPdfUrl: result.renderedPdfUrl ?? `s3://${result.renderedKey}`,
      previewImageUrls: result.previewImageUrls ?? [],
      pageCount: result.pageCount,
      bytes: result.bytes,
      durationMs: result.durationMs,
    });

    return result;
  },
  { connection, concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10) },
);

worker.on('ready', () => {
  // eslint-disable-next-line no-console
  console.log(
    `[render-worker] ready — consuming 'render' queue on ${connection.host}:${connection.port}`,
  );
});

// Fail fast + clearly on the most common dev snag: an old Redis.
// BullMQ requires Redis >= 5.0; a stock Windows Redis is 3.x and would
// otherwise crash-loop with a stack trace on every reconnect. Give the
// operator one actionable line instead.
let redisVersionWarned = false;
worker.on('error', (err) => {
  const msg = err?.message || String(err);
  if (/Redis version needs to be/.test(msg)) {
    if (redisVersionWarned) return;
    redisVersionWarned = true;
    // eslint-disable-next-line no-console
    console.error(
      `\n[render-worker] FATAL: ${msg}\n` +
        `  BullMQ needs Redis >= 5.0. Start one with:\n` +
        `    docker run -d -p 6379:6379 redis:7-alpine\n` +
        `  (the repo's docker-compose.yml already provisions Redis 7), then re-run.\n`,
    );
    worker.close().finally(() => process.exit(1));
    return;
  }
  // eslint-disable-next-line no-console
  console.error('[render-worker] error:', msg);
});

worker.on('failed', async (job, err) => {
  if (!job) return;
  await job.log(`render-failed error=${err?.message || err}`);
  // Tell the API so the customer's job moves to FAILED and the money
  // can be refunded, instead of hanging in RENDERING.
  const manifest = job.data as RenderManifest;
  if (manifest?.printJobId) {
    await postRenderFailure({
      printJobId: manifest.printJobId,
      errorMessage: err?.message || String(err),
    });
  }
});

process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});
