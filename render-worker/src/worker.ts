import { Worker, Queue } from 'bullmq';
import { config } from './config';
import { logger } from './utils/logger';
import { downloadFromS3, uploadToS3, generateRenderKey, writeTempFile, deleteTempFile, getPresignedUrl } from './utils/s3';
import { pdfToPwgRaster, normalizeToPdfA, generatePreviewImages } from './pipeline/render';
import * as fs from 'fs/promises';
import * as path from 'path';

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

async function processRenderJob(job: { data: RenderJobData; updateProgress: (n: number) => Promise<void> }) {
  const { printJobId, fileId, tenantId, printerProfileId, printerProfile, sourceFileUrl, fileName, printConfiguration } = job.data;
  const log = logger.child({ printJobId, tenantId, printerProfileId });
  
  log.info('Starting render job');
  
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
    
    await callbackToBackend({
      printJobId,
      renderedKey,
      renderedPdfUrl,
      previewImageUrls,
      pageCount: result.pageCount,
      bytes: result.pwgBuffer.length,
      durationMs: 0, // TODO: track actual duration
    });
    
    log.info('Render callback sent to backend');
    
    await job.updateProgress(100);
    
  } catch (error) {
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

  const worker = createWorker();

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    await worker.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});