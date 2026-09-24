import { renderQueue } from '../workers/queues';
import { REDIS_ENABLED } from '../config/redis';
import { PrintJob, PrintJobStatus, JobType } from '../entities/printJob.entity';
import { AppDataSource } from '../config/database';
import { applyRenderCostReconciliation } from './costReconciliation.service';

/**
 * Enqueue a render job for a paid PrintJob and flip its status to
 * RENDERING. The standalone render-worker service consumes the
 * queue (see ../render-worker/), normalises the source PDF to
 * PWG-Raster, stores the artifact, and calls back to
 * `POST /api/render/callback` to flip status RENDERING → READY.
 *
 * Idempotent: rejects on non-PENDING. Callers can fire and forget.
 *
 * **Redis-aware fallback.** When Redis is disabled (dev / single-
 * tenant deployment without a render-worker running), the function
 * returns `{enqueued: false, reason: 'render-disabled'}` and leaves
 * the job in its previous state. Callers must handle this by
 * promoting the job straight to READY themselves — see
 * `enqueueRenderOrReady()` below for the convenient form.
 */
export async function enqueueRender(printJobId: string): Promise<{
  enqueued: boolean;
  reason?: string;
}> {
  if (!REDIS_ENABLED) {
    return { enqueued: false, reason: 'render-disabled' };
  }

  const repo = AppDataSource.getRepository(PrintJob);
  const job = await repo.findOne({ where: { id: printJobId }, relations: ['file'] });
  if (!job) return { enqueued: false, reason: 'not-found' };

  // Batch parents carry no file of their own (the items do) — a render
  // job for the parent would fetch nothing and fail. Per-item rendering
  // is a deferred retrofit (JOURNAL V2-6); parents promote straight to
  // READY via enqueueRenderOrReady's fallback.
  if (job.jobType === JobType.PERSONAL_BATCH) {
    return { enqueued: false, reason: 'batch-parent' };
  }

  const TRIGGER_STATES = new Set<PrintJobStatus>([
    PrintJobStatus.PENDING,
    // V2-58: marketplace jobs pause in awaiting_accept; rendering runs
    // during the accept window so the job is spool-ready the moment the
    // operator accepts.
    PrintJobStatus.AWAITING_ACCEPT,
  ]);
  if (!TRIGGER_STATES.has(job.status)) {
    return { enqueued: false, reason: `bad-status:${job.status}` };
  }

  // Flip status BEFORE enqueueing so a concurrent caller won't
  // double-enqueue. If the queue.add throws we revert.
  const prevStatus = job.status;
  job.status = PrintJobStatus.RENDERING;
  job.renderingStatus = 'processing';
  job.renderingStartedAt = new Date();
  job.renderingError = null;
  job.renderingCompletedAt = null;
  await repo.save(job);

  try {
    const fileURL = job.file?.watermarkedUrl || job.file?.fileURL || null;
    const fileName = job.fileName || job.file?.fileName || 'document.pdf';

    // V2-56: resolve the printer profile (job-pinned, else the tenant's
    // default) and hand the worker its resolved render options — the
    // worker is DB-free and only ever sees capabilities in the payload.
    const { resolveProfileForJob, resolveProfileRenderOpts } = await import(
      './printerProfile.service'
    );
    const profile = await resolveProfileForJob({
      tenantId: job.tenantId,
      printerProfileId: job.printerProfileId,
    });
    const profileOpts = profile
      ? resolveProfileRenderOpts(profile, job.printConfiguration)
      : null;

    await renderQueue.add('render', {
      printJobId: job.id,
      tenantId: job.tenantId,
      sourceFileKey: job.fileId,
      sourceFileUrl: fileURL,
      fileName: fileName,
      printConfiguration: job.printConfiguration,
      watermarkId: job.watermarkId,
      printerProfileId: profile?.id ?? null,
      printerProfile: profileOpts,
    });
    return { enqueued: true };
  } catch (err) {
    job.status = prevStatus;
    job.renderingStatus = 'pending';
    job.renderingStartedAt = null;
    await repo.save(job);
    throw err;
  }
}

/**
 * Convenience for the "I just finished paying for this PrintJob, get
 * it printable" path. Tries to enqueue a render job; if Redis is
 * disabled or any rejection comes back, falls through to setting
 * status=READY directly so the kiosk pickup flow still works on
 * single-tenant deployments that don't run a render-worker.
 *
 * Returns the path that was taken so callers can log accordingly.
 */
export async function enqueueRenderOrReady(printJobId: string): Promise<{
  path: 'rendering' | 'ready-direct';
  reason?: string;
}> {
  const result = await enqueueRender(printJobId);
  if (result.enqueued) return { path: 'rendering' };

  // Render-worker not available — promote straight to READY. This
  // matches the legacy single-tenant behaviour; V2-58 marketplace jobs
  // land in awaiting_accept instead (the operator accepts from the
  // shop console).
  const repo = AppDataSource.getRepository(PrintJob);
  const job = await repo.findOne({ where: { id: printJobId } });
  if (!job) return { path: 'ready-direct', reason: 'not-found' };
  if (job.status === PrintJobStatus.PENDING) {
    job.status = job.requiresAccept
      ? PrintJobStatus.AWAITING_ACCEPT
      : PrintJobStatus.READY;
    await repo.save(job);
  }
  return { path: 'ready-direct', reason: result.reason };
}

/**
 * Render-worker callback — flip RENDERING → READY and record the
 * rendered artifact metadata. Idempotent on (printJobId, status).
 *
 * Pricing reconciliation (V2-52) lives here too: the renderer's
 * authoritative page count drives `finalCost`; when the customer
 * overpaid, the delta is auto-refunded to their wallet atomically
 * with the status flip (see costReconciliation.service.ts). When
 * they underpaid, the shortfall is left on the job for the kiosk
 * release gate to collect.
 */
export async function applyRenderResult(opts: {
  printJobId: string;
  renderedKey: string;
  renderedPdfUrl: string;
  previewImageUrls: string[];
  pageCount: number;
  bytes: number;
  durationMs?: number;
}): Promise<import('./costReconciliation.service').RenderCostResult> {
  const repo = AppDataSource.getRepository(PrintJob);
  const job = await repo.findOne({ where: { id: opts.printJobId } });
  if (!job) return { updated: false, reason: 'not-found' };
  if (job.status !== PrintJobStatus.RENDERING) {
    return { updated: false, reason: `bad-status:${job.status}` };
  }
  // Page count is authoritative AFTER render — the customer's
  // initial estimate is replaced with the renderer's exact count.
  return applyRenderCostReconciliation(job, opts);
}

/**
 * Render-worker error path — flip RENDERING → FAILED.
 *
 * **Idempotent.** BullMQ retries a failed render up to 3 times by
 * default; each retry can re-POST `/api/render/failure`. The
 * guard `job.status !== RENDERING` makes the second call a no-op
 * (it'll see FAILED on the row and return `{updated: false,
 * reason: 'bad-status:failed'}`). Verified V2-7.
 */
export async function applyRenderFailure(opts: {
  printJobId: string;
  errorMessage: string;
}): Promise<{ updated: boolean; reason?: string }> {
  const repo = AppDataSource.getRepository(PrintJob);
  const job = await repo.findOne({ where: { id: opts.printJobId } });
  if (!job) return { updated: false, reason: 'not-found' };
  if (job.status !== PrintJobStatus.RENDERING) {
    return { updated: false, reason: `bad-status:${job.status}` };
  }
  job.status = PrintJobStatus.FAILED;
  job.renderingStatus = 'failed';
  job.renderingError = opts.errorMessage;
  job.renderingCompletedAt = new Date();
  await repo.save(job);
  // job.failed webhook (Dimension 14 — V2-15). Render-side failure.
  if (job.tenantId) {
    const { emitTenantEvent } = await import('./tenantWebhook.service');
    const { WebhookEvent } = await import('../entities/tenantWebhook.entity');
    emitTenantEvent(job.tenantId, WebhookEvent.JOB_FAILED, {
      printJobId: job.id,
      code: job.code,
      reason: opts.errorMessage,
      source: 'render',
    });
  }
  return { updated: true };
}

/**
 * Reconciliation: find PrintJobs stuck in RENDERING longer than the
 * threshold and either re-enqueue (when the render-worker is
 * available — caller's choice via the env flag) or flip to FAILED.
 *
 * Why this exists: the render-worker → backend callback is
 * fail-open (Phase V2-6) — a flaky POST after a successful render
 * leaves the PrintJob orphaned in RENDERING. This sweep catches
 * that drift.
 *
 * Threshold default: 15 minutes. Render times for typical
 * coursework PDFs are 2–10 seconds; 15min is generous enough to
 * never false-positive a legitimately slow render, tight enough to
 * unstick a customer within a kiosk pickup window.
 */
export async function reconcileStuckRenders(opts?: {
  /** ms — jobs older than this in RENDERING are considered stuck. */
  thresholdMs?: number;
  /** When true (default), tries to re-enqueue; falls through to FAILED
   *  the same way enqueueRenderOrReady does. When false, immediately
   *  flips to FAILED — useful for ops to manually fail a stuck job. */
  reenqueue?: boolean;
}): Promise<{
  found: number;
  reenqueued: number;
  failed: number;
  recovered: number;
}> {
  const thresholdMs = opts?.thresholdMs ?? 15 * 60 * 1000;
  const reenqueue = opts?.reenqueue ?? true;
  const cutoff = new Date(Date.now() - thresholdMs);

  const repo = AppDataSource.getRepository(PrintJob);
  const stuck = await repo
    .createQueryBuilder('pj')
    .where('pj.status = :s', { s: PrintJobStatus.RENDERING })
    .andWhere('pj.updatedAt < :cutoff', { cutoff: cutoff.toISOString() })
    .getMany();

  let reenqueued = 0;
  let failed = 0;
  let recovered = 0;

  for (const job of stuck) {
    try {
      if (!reenqueue) {
        const r = await applyRenderFailure({
          printJobId: job.id,
          errorMessage: 'Reconciliation: stuck in RENDERING',
        });
        if (r.updated) failed++;
        continue;
      }
      // Demote back to PENDING so enqueueRenderOrReady can promote
      // it again (either back to RENDERING or straight to READY).
      job.status = PrintJobStatus.PENDING;
      await repo.save(job);
      const r = await enqueueRenderOrReady(job.id);
      if (r.path === 'rendering') reenqueued++;
      else recovered++;
    } catch (err) {
      console.error(
        `[reconcile] failed to recover stuck job ${job.id}:`,
        err,
      );
    }
  }

  return {
    found: stuck.length,
    reenqueued,
    failed,
    recovered,
  };
}
