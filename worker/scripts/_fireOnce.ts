/**
 * Tiny harness (V2-41): runs the REAL worker units — RenderPipeline.mock()
 * then postRenderSuccess() — exactly as index.ts does after a job, but
 * without BullMQ/Redis. Proves the dedup + callback wiring deterministically.
 *
 * Reads PRINTLOOP_API_URL + RENDER_CALLBACK_SECRET + E2E_PRINT_JOB_ID from
 * env (the .cjs orchestrator sets them). callback.ts reads its env at
 * import time, so they must be set before this module loads — they are.
 */
import { RenderPipeline } from '../src/executor.js';
import { postRenderSuccess } from '../src/callback.js';

async function main() {
  const printJobId = process.env.E2E_PRINT_JOB_ID || 'fire-once';
  const pipeline = new RenderPipeline({
    bucket: 'e2e',
    layerKey: (tenantId, jobId) => `renders/${tenantId}/${jobId}.pwg`,
  });
  const result = await pipeline.mock({
    printJobId,
    tenantId: 'e2e-tenant',
    sourceFileKey: 'e2e/source.pdf',
    fileName: 'document.pdf',
    printConfiguration: { copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300, pages: 3 } as any,
    printerProfileId: null,
  });
  await postRenderSuccess({
    printJobId,
    renderedKey: result.renderedKey,
    renderedPdfUrl: result.renderedPdfUrl ?? `s3://${result.renderedKey}`,
    previewImageUrls: result.previewImageUrls ?? [],
    pageCount: result.pageCount,
    bytes: result.bytes,
    durationMs: result.durationMs,
  });
  // eslint-disable-next-line no-console
  console.log(`[fire-once] sent callback for ${printJobId} (pages=${result.pageCount})`);
}

main().then(() => process.exit(0)).catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[fire-once] failed:', e);
  process.exit(1);
});
