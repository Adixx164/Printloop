import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { File } from '../entities/file.entity';
import { Kiosk } from '../entities/kiosk.entity';
import { kioskAuth } from '../middleware/kioskAuth.middleware';
import { loadDocumentBytes } from '../utils/fileStore';
import {
  ensurePdf,
  extractPages,
  parsePageRange,
  UnsupportedDocumentError,
} from '../services/documentConvert.service';
import { PrinterServiceExtensions } from '../services/printerExtensions.service';
import { JWT_SECRET } from '../utils/jwt';

const router = Router();
const printerExt = new PrinterServiceExtensions();

/**
 * ─────────────────────────────────────────────────────────────────────
 *  Agent-pull API
 *  ─────────────────────────────────────────────────────────────────────
 *  This router serves the "kiosk agent" — a small Node process that
 *  runs on each on-site machine and bridges cloud-stored jobs to the
 *  local LAN printer. The agent polls /jobs/ready, downloads the file
 *  via /jobs/:id/file, dispatches over IPP / raw-9100 on the LAN, and
 *  reports back via /complete or /failed.
 *
 *  This lets us run the BACKEND in the cloud (Railway) while the
 *  PRINTER stays on a private LAN that the cloud can't reach. No
 *  VPN / tunnel / port-forward is required — the agent only ever
 *  makes outbound HTTPS calls.
 *
 *  All endpoints (except /file) authenticate via the kiosk's X-Kiosk-
 *  Key. The file download uses a short-lived signed JWT so the kiosk
 *  agent can stream bytes without the API key being included in the
 *  download URL (it ends up in HTTP logs, etc.).
 * ─────────────────────────────────────────────────────────────────────
 */

const FILE_TOKEN_TTL_SECONDS = 5 * 60; // 5 min — generous for slow LAN

function buildFileToken(jobId: string, kioskId: string): string {
  return jwt.sign(
    { kind: 'agent-file-download', jobId, kioskId },
    JWT_SECRET,
    { expiresIn: FILE_TOKEN_TTL_SECONDS },
  );
}

function verifyFileToken(
  token: string,
  expectedJobId: string,
): { kioskId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (
      decoded?.kind !== 'agent-file-download' ||
      decoded?.jobId !== expectedJobId
    ) {
      return null;
    }
    return { kioskId: decoded.kioskId };
  } catch {
    return null;
  }
}

function publicBaseUrl(req: Request): string {
  // Honour X-Forwarded-Proto / Host (Railway, behind a reverse proxy
  // that terminates TLS). Falls back to the request's own values.
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
  return `${proto}://${host}`;
}

/**
 * GET /api/agent/jobs/ready
 *
 * Returns all jobs marked RELEASING that this kiosk should claim. The
 * agent polls this every few seconds. Filtered to jobs whose
 * `kioskId` matches the authenticated kiosk (single-kiosk-per-agent),
 * or jobs with no kiosk binding (any agent can grab them — useful for
 * single-kiosk installs where the kiosk-ID convention isn't worth it).
 */
router.get('/jobs/ready', kioskAuth, async (req: Request, res: Response) => {
  try {
    const kiosk = req.kiosk as Kiosk;
    const repo = AppDataSource.getRepository(PrintJob);
    const jobs = await repo.find({
      where: [
        { status: PrintJobStatus.RELEASING, kioskId: kiosk.id },
        { status: PrintJobStatus.RELEASING, kioskId: null as any },
      ],
      order: { updatedAt: 'ASC' },
      take: 10,
    });

    // For each job, gather the file metadata + a signed download URL.
    // Personal-batch jobs have items[]; everything else has a single
    // fileId. We surface BOTH shapes so the agent can iterate.
    const base = publicBaseUrl(req);
    const out = await Promise.all(
      jobs.map(async (job) => {
        let items: Array<{
          fileId: string;
          fileName: string;
          downloadUrl: string;
          printConfiguration: any;
          totalPages: number;
        }>;
        // Helper: effective page count after applying the customer's
        // page-range selection. The agent's SNMP confirmation expects
        // `totalPages × copies` impressions, so we must report what
        // will ACTUALLY print, not the document's underlying length.
        const effectivePages = (docTotal: number, cfg: any): number => {
          const total = Math.max(1, Number(docTotal) || 1);
          if (!cfg || cfg.pages !== 'range' || !cfg.pageRange) return total;
          const picked = parsePageRange(String(cfg.pageRange), total);
          return picked.length > 0 ? picked.length : total;
        };

        if (job.jobType === 'personal_batch') {
          const rows = await AppDataSource.getRepository(PrintJobItem).find({
            where: { printJobId: job.id },
            order: { order: 'ASC' },
          });
          items = rows.map((it) => ({
            fileId: it.fileId,
            fileName: it.fileName,
            downloadUrl: `${base}/api/agent/jobs/${job.id}/file?item=${encodeURIComponent(
              it.id,
            )}&t=${encodeURIComponent(buildFileToken(job.id, kiosk.id))}`,
            printConfiguration: it.printConfiguration,
            // Effective page count for the agent's SNMP-based
            // physical-print confirm. expectedPages on the agent =
            // totalPages × printConfiguration.copies.
            totalPages: effectivePages(it.totalPages, it.printConfiguration),
          }));
        } else {
          items = [
            {
              fileId: job.fileId,
              fileName: job.fileName || 'document.pdf',
              downloadUrl: `${base}/api/agent/jobs/${job.id}/file?t=${encodeURIComponent(
                buildFileToken(job.id, kiosk.id),
              )}`,
              printConfiguration: job.printConfiguration,
              totalPages: effectivePages(job.totalPages, job.printConfiguration),
            },
          ];
        }
        return {
          id: job.id,
          code: job.code,
          jobType: job.jobType,
          totalPages: job.totalPages,
          updatedAt: job.updatedAt,
          items,
        };
      }),
    );

    res.json({ success: true, data: { jobs: out } });
  } catch (err: any) {
    console.error('[agent] /jobs/ready error:', err?.message);
    res.status(500).json({ success: false, message: 'Failed to list ready jobs' });
  }
});

/**
 * GET /api/agent/jobs/:id/file?t=<signed-token>&item=<item-id?>
 *
 * Streams the document bytes for the given job (or batch item). Token
 * auth instead of kiosk-key so the URL can be passed around safely
 * inside the agent without leaking the long-lived kiosk credential.
 */
router.get('/jobs/:id/file', async (req: Request, res: Response) => {
  try {
    const token = String(req.query.t || '');
    const claims = verifyFileToken(token, req.params.id);
    if (!claims) {
      res.status(401).json({ success: false, message: 'Invalid or expired file token' });
      return;
    }

    // Resolve fileId + the relevant printConfiguration. For personal-
    // batch each item has its own settings; for single-file jobs the
    // settings live on the PrintJob row itself.
    let fileId: string | undefined;
    let cfg: any = {};
    if (req.query.item) {
      const item = await AppDataSource.getRepository(PrintJobItem).findOne({
        where: { id: String(req.query.item), printJobId: req.params.id },
      });
      if (!item) {
        res.status(404).json({ success: false, message: 'Item not found' });
        return;
      }
      fileId = item.fileId;
      cfg = item.printConfiguration || {};
    } else {
      const job = await AppDataSource.getRepository(PrintJob).findOne({
        where: { id: req.params.id },
      });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      fileId = job.fileId;
      cfg = job.printConfiguration || {};
    }
    const file = await AppDataSource.getRepository(File).findOne({ where: { id: fileId } });
    if (!file?.fileURL) {
      res.status(404).json({ success: false, message: 'File missing' });
      return;
    }
    const rawBytes = await loadDocumentBytes(file.fileURL);
    if (!rawBytes) {
      res.status(502).json({ success: false, message: 'File not retrievable' });
      return;
    }

    // ── 1. Always hand the agent a PDF. ─────────────────────────────
    // The agent's raw-9100 transport sends bytes after
    // "@PJL ENTER LANGUAGE=PDF", so JPG / PNG would arrive as garbage
    // to the printer. `ensurePdf` passthrough for PDFs (byte-exact)
    // and A4-wraps images via pdf-lib.
    let pdfBytes: Buffer;
    try {
      const ensured = await ensurePdf(rawBytes, file.fileName || 'document.pdf');
      pdfBytes = ensured.buffer;
    } catch (e: any) {
      if (e instanceof UnsupportedDocumentError) {
        res.status(415).json({ success: false, message: e.message, code: e.code });
        return;
      }
      console.error('[agent] ensurePdf failed:', e?.message);
      res.status(502).json({ success: false, message: 'Document could not be prepared for printing.' });
      return;
    }

    // ── 2. Apply page range if the customer chose one. ──────────────
    // The agent's raw-9100 path has no way to express "print page 5
    // only" — it sends whatever bytes it gets. We do the slicing here
    // so the printer physically produces only the pages the customer
    // selected and paid for. parsePageRange handles "1-3,5,7-".
    if (cfg && cfg.pages === 'range' && cfg.pageRange) {
      try {
        // We trust the stored totalPages over re-parsing; pdf-lib does
        // its own count inside extractPages but we pass the raw range
        // string + the document's total so out-of-bounds entries
        // clip cleanly.
        const { PDFDocument } = await import('pdf-lib');
        const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false }).catch(() => null);
        const total = doc ? doc.getPageCount() : 0;
        const wanted = parsePageRange(String(cfg.pageRange), total);
        if (wanted.length > 0) {
          pdfBytes = await extractPages(pdfBytes, wanted);
        }
      } catch (e: any) {
        // If page-range slicing fails (malformed PDF, etc.), fall
        // back to the full document. The agent's logs will show the
        // mismatch between expected page count and what the SNMP
        // counter advances, which surfaces to the operator.
        console.warn('[agent] page-range slice failed, sending full document:', e?.message);
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(pdfBytes.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${(file.fileName || 'document.pdf').replace(/"/g, '')}.pdf"`,
    );
    res.send(pdfBytes);
  } catch (err: any) {
    console.error('[agent] /jobs/:id/file error:', err?.message);
    res.status(500).json({ success: false, message: 'Failed to read file' });
  }
});

/**
 * POST /api/agent/jobs/:id/start
 *
 * Agent claims a RELEASING job and moves it to PRINTING. Done with a
 * conditional UPDATE so two agents can't both claim the same job.
 */
router.post('/jobs/:id/start', kioskAuth, async (req: Request, res: Response) => {
  try {
    const kiosk = req.kiosk as Kiosk;
    const result = await AppDataSource.getRepository(PrintJob)
      .createQueryBuilder()
      .update(PrintJob)
      .set({ status: PrintJobStatus.PRINTING, kioskId: kiosk.id })
      .where('id = :id AND status = :releasing', {
        id: req.params.id,
        releasing: PrintJobStatus.RELEASING,
      })
      .execute();
    if ((result.affected ?? 0) !== 1) {
      res.status(409).json({
        success: false,
        message: 'Job is no longer claimable (already started or completed)',
      });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[agent] /jobs/:id/start error:', err?.message);
    res.status(500).json({ success: false, message: 'Failed to claim job' });
  }
});

/**
 * POST /api/agent/jobs/:id/complete
 *
 * Agent reports the print landed at the printer. We mark DONE, bump
 * the kiosk's counters, and queue cleanup of the file. Same downstream
 * effect as the old cloud-push /printer/complete.
 */
router.post('/jobs/:id/complete', kioskAuth, async (req: Request, res: Response) => {
  try {
    const kiosk = req.kiosk as Kiosk;
    const job = await AppDataSource.getRepository(PrintJob).findOne({
      where: { id: req.params.id },
    });
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }
    if (job.kioskId && job.kioskId !== kiosk.id) {
      res.status(403).json({ success: false, message: 'Job belongs to another kiosk' });
      return;
    }
    // Reuse the existing completion path so kiosk counters, cleanup
    // scheduling, and audit log entries all stay consistent with the
    // cloud-push mode.
    const result = await printerExt.completePrintJob({
      code: job.code,
      kioskId: kiosk.id,
      kioskName: kiosk.name,
      cost: Number(job.cost) || 0,
      totalPages: job.totalPages || 0,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[agent] /jobs/:id/complete error:', err?.message);
    res.status(500).json({ success: false, message: 'Failed to mark complete' });
  }
});

/**
 * POST /api/agent/jobs/:id/failed
 *
 * Agent reports the print failed at the printer (offline, paper jam,
 * IPP error). We mark FAILED and surface the reason in the audit log;
 * the user's wallet is auto-refunded by the existing job-cleanup
 * worker the same way a stuck cloud-push job would be.
 */
router.post('/jobs/:id/failed', kioskAuth, async (req: Request, res: Response) => {
  try {
    const kiosk = req.kiosk as Kiosk;
    const reason = String(req.body?.reason || 'agent reported failure').slice(0, 280);
    const repo = AppDataSource.getRepository(PrintJob);
    const result = await repo
      .createQueryBuilder()
      .update(PrintJob)
      .set({ status: PrintJobStatus.FAILED })
      .where('id = :id AND (kioskId = :kid OR kioskId IS NULL)', {
        id: req.params.id,
        kid: kiosk.id,
      })
      .execute();
    if ((result.affected ?? 0) !== 1) {
      res.status(404).json({ success: false, message: 'Job not found or claimed by another kiosk' });
      return;
    }
    console.error(`[agent] job ${req.params.id} FAILED: ${reason}`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[agent] /jobs/:id/failed error:', err?.message);
    res.status(500).json({ success: false, message: 'Failed to mark failed' });
  }
});

export default router;
