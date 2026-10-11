import { Worker, Queue, Job } from 'bullmq';
import { config } from './config';
import { logger } from './utils/logger';
import { downloadFromS3, uploadToS3, generateRenderKey, writeTempFile, deleteTempFile, getPresignedUrl } from './utils/s3';
import { pdfToPwgRaster, normalizeToPdfA, generatePreviewImages } from './pipeline/render';
import * as fs from 'fs/promises';
import * as path from 'path';
import express from 'express';
import { renderMetricsRegistry, renderJobsTotal, renderDuration, renderRetriesTotal, renderQueueDepth, stuckRendersGauge } from './metrics';

async function updateQueueDepth(queue: Queue) {
  try {
    const [waiting, active, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
    ]);
    renderQueueDepth.set({ status: 'waiting' }, waiting);
    renderQueueDepth.set({ status: 'active' }, active);
    renderQueueDepth.set({ status: 'delayed' }, delayed);
  } catch (err) {
    logger.warn({ err }, 'Failed to update queue depth');
  }
}

export interface RenderJobData {
  printJobId: string;
  fileId: string;
  tenantId: string;
  printerProfileId?: string;
  sourceFileUrl?: string;
  fileName?: string;
  printConfiguration?: any;
  watermarkId?: string;
  printerProfile?: {
    dpi?: number;
    color?: boolean;
    pageSize?: string;
    duplex?: boolean;
  };
}

export interface RenderCallbackPayload {
  printJobId: string;
  renderedKey: string;
  renderedPdfUrl: string;
  previewImageUrls: string[];
  pageCount: number;
  bytes: number;
  durationMs?: number;
}

export interface RenderFailurePayload {
  printJobId: string;
  errorMessage: string;
}

async function callbackToBackend(payload: RenderCallbackPayload): Promise<void> {
  const crypto = await import('crypto');
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', config.callback.secret)
    .update(body)
    .digest('hex');

  const response = await fetch(config.callback.url.replace('/callback', '/callback'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Render-Signature': signature,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Callback failed: ${response.status} ${text}`);
  }
}

async function callbackFailureToBackend(payload: RenderFailurePayload): Promise<void> {
  const crypto = await import('crypto');
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', config.callback.secret)
    .update(body)
    .digest('hex');

  const response = await fetch(config.callback.url.replace('/callback', '/failure'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Render-Signature': signature,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failure callback failed: ${response.status} ${text}`);
  }
}

async function processRenderJob(job: Job<RenderJobData>) {
  const { printJobId, fileId, tenantId, printerProfileId, printerProfile, sourceFileUrl, fileName, printConfiguration } = job.data;
  const attempt = job.attemptsMade + 1; // BullMQ tracks attemptsMade (0-indexed)
  const log = logger.child({ printJobId, tenantId, printerProfileId, attempt });
  
  // Track retry metric
  if (attempt > 1) {
    renderRetriesTotal.inc({ attempt: String(attempt) });
    log.info({ attempt, maxAttempts: config.bullmq.attempts }, 'Retry attempt');
  }
  
  log.info('Starting render job');
  
  const startTime = Date.now();
  
  await job.updateProgress(5);
  
  const pdfBuffer = await downloadFromS3(fileId);
  log.info({ size: pdfBuffer.length }, 'Downloaded PDF from S3');
  
  await job.updateProgress(10);
  
  const pdfPath = await writeTempFile(pdfBuffer, 'pdf');
  
  try {
    await job.updateProgress(20);
    
    const normalizedPdfPath = await normalizeToPdfA(pdfPath);
    log.info('Normalized to PDF/A');
    
    await job.updateProgress(40);
    
    const renderOpts = {
      dpi: printerProfile?.dpi || config.render.defaultDpi,
      color: printerProfile?.color ?? true,
      pageSize: printerProfile?.pageSize || 'A4',
      duplex: printerProfile?.duplex ?? false,
    };
    
    const result = await pdfToPwgRaster(normalizedPdfPath, renderOpts);
    log.info({ pageCount: result.pageCount, colorPages: result.colorPages }, 'Rendered to PWG-Raster');
    
    await job.updateProgress(60);
    
    // Generate preview images (first 3 pages)
    const previewImagePaths = await generatePreviewImages(normalizedPdfPath, 3);
    const previewImageUrls: string[] = [];
    for (const imgPath of previewImagePaths) {
      const imgBuffer = await fs.readFile(imgPath);
      const imgKey = generateRenderKey(printJobId, `preview-${path.basename(imgPath)}`);
      await uploadToS3(imgKey, imgBuffer, 'image/jpeg');
      const url = await getPresignedUrl(imgKey, 86400); // 24 hours
      previewImageUrls.push(url);
      await deleteTempFile(imgPath);
    }
    log.info({ count: previewImageUrls.length }, 'Generated preview images');
    
    await job.updateProgress(70);
    
    await deleteTempFile(normalizedPdfPath);
    
    const renderedKey = generateRenderKey(printJobId);
    await uploadToS3(renderedKey, result.pwgBuffer, 'application/vnd.pwg-raster');
    log.info({ key: renderedKey }, 'Uploaded rendered artifact to S3');
    
    const renderedPdfUrl = await getPresignedUrl(renderedKey, 86400); // 24 hours
    
    await job.updateProgress(90);
    
    const durationMs = Date.now() - startTime;
    
    await callbackToBackend({
      printJobId,
      renderedKey,
      renderedPdfUrl,
      previewImageUrls,
      pageCount: result.pageCount,
      bytes: result.pwgBuffer.length,
      durationMs,
    });
    
    const durationSec = durationMs / 1000;
    renderDuration.observe({ status: 'success' }, durationSec);
    renderJobsTotal.inc({ status: 'success' });
    
    log.info({ durationMs }, 'Render callback sent to backend');
    
    await job.updateProgress(100);
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const durationSec = durationMs / 1000;
    renderDuration.observe({ status: 'failed' }, durationSec);
    renderJobsTotal.inc({ status: 'failed' });
    
    log.error({ err: error }, 'Render job failed');
    
    await callbackFailureToBackend({
      printJobId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    
    throw error;
  } finally {
    await deleteTempFile(pdfPath).catch(() => {});
  }
}

function createWorker() {
  const worker = new Worker<RenderJobData>(
    config.bullmq.queueName,
    async (job) => {
      await processRenderJob(job);
    },
    {
      connection: {
        url: config.redis.url,
      },
      concurrency: config.bullmq.concurrency,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Render job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Render job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  return worker;
}

async function main() {
  logger.info('Starting PrintLoop Render Worker');
  logger.info({ 
    queue: config.bullmq.queueName, 
    concurrency: config.bullmq.concurrency,
    redis: config.redis.url,
    s3Bucket: config.s3.bucket,
  }, 'Configuration');

  // Start metrics server
  const metricsApp = express();
  metricsApp.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', renderMetricsRegistry.contentType);
      res.end(await renderMetricsRegistry.metrics());
    } catch (err) {
      logger.error({ err }, 'Error generating metrics');
      res.status(500).send('Error generating metrics');
    }
  });

  const METRICS_PORT = parseInt(process.env.METRICS_PORT || '9091', 10);
  metricsApp.listen(METRICS_PORT, () => {
    logger.info({ port: METRICS_PORT }, 'Metrics server listening');
  });

  const worker = createWorker();

  // Periodic queue depth update
  const queue = new Queue(config.bullmq.queueName, { connection: { url: config.redis.url } });
  const depthInterval = setInterval(() => updateQueueDepth(queue), 10000);

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    clearInterval(depthInterval);
    await queue.close();
    await worker.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    clearInterval(depthInterval);
    await queue.close();
    await worker.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});