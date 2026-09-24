import { Request, Response, Router } from 'express';
import crypto from 'node:crypto';
import {
  applyRenderResult,
  applyRenderFailure,
} from '../services/renderEnqueue.service';

const router = Router();

/**
 * Render-worker callback (Phase A — cloud render → kiosk spool).
 *
 * The standalone render-worker (../render-worker/) POSTs here after
 * it finishes normalising a PrintJob to PWG-Raster. We don't trust
 * the network — every call is HMAC-SHA256 signed against the raw
 * request body using `RENDER_CALLBACK_SECRET`.
 *
 * The render worker computes the signature as:
 *
 *   hex(HMAC-SHA256(RENDER_CALLBACK_SECRET, raw_body_bytes))
 *
 * and sends it in the `X-Render-Signature` header. Without a secret
 * configured, the endpoint refuses every request (no permissive
 * default — we'd rather break the dev flow than risk a public
 * unauthenticated way to flip job statuses).
 *
 * Two endpoints:
 *   POST /api/render/callback   — success path: artifact ready
 *   POST /api/render/failure    — error path: render failed
 *
 * Mounted from app.ts at /api/render with no tenant middleware —
 * the render-worker is a platform-level service, not tenant-scoped.
 */

function verifySignature(req: Request): boolean {
  const secret = process.env.RENDER_CALLBACK_SECRET;
  if (!secret) return false;
  const raw: Buffer | undefined = (req as any).rawBody;
  if (!raw) return false;
  const sig = req.header('x-render-signature') || '';
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * POST /api/render/callback
 *
 * Body: { printJobId, renderedKey, pageCount, bytes, durationMs? }
 *
 * Flips PrintJob status RENDERING → READY and persists the
 * rendered artifact metadata. Returns 200 on success, 4xx on bad
 * input / signature, never 5xx for application-level mismatches
 * (e.g. job-not-found) — those are 200s with `updated: false` so
 * the render-worker doesn't retry indefinitely.
 */
router.post('/callback', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    res.status(401).json({ success: false, message: 'Invalid signature' });
    return;
  }
  const { printJobId, renderedKey, renderedPdfUrl, previewImageUrls, pageCount, bytes, durationMs } =
    req.body || {};
  if (!printJobId || !renderedKey || !renderedPdfUrl || !Array.isArray(previewImageUrls) || typeof pageCount !== 'number') {
    res.status(400).json({
      success: false,
      message: 'printJobId, renderedKey, renderedPdfUrl, previewImageUrls, pageCount are required',
    });
    return;
  }
  try {
    const result = await applyRenderResult({
      printJobId,
      renderedKey,
      renderedPdfUrl,
      previewImageUrls,
      pageCount,
      bytes: Number(bytes || 0),
      durationMs: durationMs ? Number(durationMs) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Render callback error:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Callback failed' });
  }
});

/**
 * POST /api/render/failure
 *
 * Body: { printJobId, errorMessage }
 *
 * Render worker hit an error it can't recover from (e.g. PDF
 * malformed, ghostscript crashed). Flips RENDERING → FAILED so the
 * job won't be picked up at a kiosk (V2-53: refunds are eliminated —
 * the shop resolves failed jobs with the customer directly).
 */
router.post('/failure', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    res.status(401).json({ success: false, message: 'Invalid signature' });
    return;
  }
  const { printJobId, errorMessage } = req.body || {};
  if (!printJobId) {
    res.status(400).json({
      success: false,
      message: 'printJobId is required',
    });
    return;
  }
  try {
    const result = await applyRenderFailure({
      printJobId,
      errorMessage: String(errorMessage || 'Unknown render error'),
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Render failure callback error:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Callback failed' });
  }
});

export default router;
