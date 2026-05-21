import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { PrintJob, PrintJobStatus, JobType } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import { Wallet } from '../entities/wallet.entity';
import { saveBuffer } from '../utils/fileStore';
import {
  isPrintableDocument,
  ALLOWED_LABEL,
  countPages,
  UnsupportedDocumentError,
} from '../services/documentConvert.service';
import { getUploadLimits } from '../utils/limits';
import { applyPromotion } from '../services/promotion.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(n = 6): string {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

/**
 * Pull the print token off the request. CUPS device URIs end up as
 *   `Authorization: Bearer <token>` once our CUPS backend script translates
 * the URI; we also accept `?token=` for testability + lpadmin convenience.
 */
function extractToken(req: Request): string | null {
  const auth = req.header('authorization') || '';
  const m = auth.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  if (m) return m[1];
  const q = req.query?.token;
  if (typeof q === 'string' && q) return q;
  const h = req.header('x-printloop-token');
  if (h) return h;
  return null;
}

/**
 * Cost copied from customerPrint.routes — the CUPS path is a real customer
 * print, just with a different ingress. Kept inline (not exported) so the
 * pricing change here doesn't accidentally drift from the wallet path.
 */
function priceOf(pages: number, c: any): number {
  const copies = Math.max(1, Number(c.copies) || 1);
  const perPage = c.color === 'color' ? 25 : 5;
  const duplex = c.sided === 'double' ? 0.85 : 1;
  const quality = c.qualityDpi === 600 ? 1.2 : c.qualityDpi === 100 ? 0.8 : 1;
  return Math.max(5, Math.round(Math.max(1, pages) * copies * perPage * duplex * quality));
}

/**
 * Parse the CUPS `options` blob — a space-separated list like
 *   `media=A4 sides=two-sided-long-edge print-color-mode=color copies=2`.
 * We accept both IPP attribute names and PPD-ish synonyms; unknowns are
 * silently ignored so a chatty driver doesn't break the print.
 */
export function parseCupsOptions(raw: string | undefined): {
  paper: 'A4' | 'A3' | 'Letter' | 'Legal';
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  copies: number;
  qualityDpi: 100 | 300 | 600;
} {
  const out: Record<string, string> = {};
  const s = String(raw || '');
  // CUPS quotes values with spaces using single quotes; we don't need full
  // shell parsing here, just key=value tokens.
  const re = /([A-Za-z][\w-]*)=("[^"]*"|'[^']*'|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out[m[1].toLowerCase()] = m[2].replace(/^['"]|['"]$/g, '');
  }
  const mediaRaw = (out['media'] || out['pagesize'] || 'A4').toLowerCase();
  let paper: 'A4' | 'A3' | 'Letter' | 'Legal' = 'A4';
  if (mediaRaw.includes('a3')) paper = 'A3';
  else if (mediaRaw.includes('legal')) paper = 'Legal';
  else if (mediaRaw.includes('letter')) paper = 'Letter';
  else paper = 'A4';

  const sidesRaw = (out['sides'] || out['duplex'] || '').toLowerCase();
  const sided: 'single' | 'double' = sidesRaw.startsWith('two-sided') || sidesRaw === 'duplexnotumble' || sidesRaw === 'duplextumble' ? 'double' : 'single';

  const colorRaw = (
    out['print-color-mode'] ||
    out['colormodel'] ||
    out['outputmode'] ||
    ''
  ).toLowerCase();
  const color: 'bw' | 'color' = /color|rgb|cmyk/.test(colorRaw) ? 'color' : 'bw';

  const copies = Math.max(1, Math.min(99, parseInt(out['copies'] || '1', 10) || 1));

  const qRaw = (out['print-quality'] || out['quality'] || '').toLowerCase();
  let qualityDpi: 100 | 300 | 600 = 300;
  if (qRaw === '3' || qRaw === 'draft' || qRaw === 'low') qualityDpi = 100;
  else if (qRaw === '5' || qRaw === 'high' || qRaw === 'best') qualityDpi = 600;
  else qualityDpi = 300;

  return { paper, color, sided, copies, qualityDpi };
}

/**
 * POST /api/cups/print
 * Ingress for the CUPS-printloop backend script. Auth is the user's
 * printToken (Bearer / ?token / X-PrintLoop-Token). Body is multipart:
 *   - file:    the PDF/JPG/PNG bytes
 *   - title:   the print-job title from CUPS (optional)
 *   - copies:  number of copies (optional, also read from options)
 *   - options: the raw CUPS option string (parsed)
 *
 * Response (200): JSON with the release code + a plain-text message field
 * the backend script copies onto CUPS's job-state-message so users can see
 * the code in `lpq` / GNOME's print queue.
 */
router.post('/print', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ success: false, message: 'Print token required' });
      return;
    }
    const user = await AppDataSource.getRepository(User).findOne({
      where: { printToken: token },
    });
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid print token' });
      return;
    }
    if (user.isBlocked) {
      res.status(403).json({ success: false, message: 'Account is blocked' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'A document file is required' });
      return;
    }
    if (!isPrintableDocument(file.originalname || '', file.mimetype)) {
      res.status(415).json({
        success: false,
        message: `Unsupported file type. PrintLoop prints ${ALLOWED_LABEL} only.`,
        code: 'UNSUPPORTED_DOCUMENT',
      });
      return;
    }

    const limits = await getUploadLimits();
    if (file.size > limits.maxFileBytes) {
      res.status(413).json({
        success: false,
        message: `File too large. Max ${Math.round(limits.maxFileBytes / 1048576)} MB.`,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }
    let pageCount: number;
    try {
      pageCount = await countPages(file.buffer, file.originalname || 'document.pdf');
    } catch (e: any) {
      res.status(e instanceof UnsupportedDocumentError ? 415 : 422).json({
        success: false,
        message: e?.message || 'Could not read the document.',
        code: e?.code || 'UNREADABLE_DOCUMENT',
      });
      return;
    }
    if (pageCount > limits.maxPages) {
      res.status(413).json({
        success: false,
        message: `Document has ${pageCount} pages; the limit is ${limits.maxPages}.`,
        code: 'TOO_MANY_PAGES',
      });
      return;
    }

    const cups = parseCupsOptions(req.body?.options);
    // CUPS sometimes splits "copies" off the options blob into its own arg —
    // honour whichever is larger so the user doesn't get stuck on 1.
    const copies = Math.max(cups.copies, Math.max(1, parseInt(req.body?.copies || '1', 10) || 1));
    const printConfiguration = {
      copies,
      paper: cups.paper,
      color: cups.color,
      sided: cups.sided,
      qualityDpi: cups.qualityDpi,
    };
    const baseCost = priceOf(pageCount, printConfiguration);
    const promo = await applyPromotion(baseCost, req.body?.promotionCode, {
      pageCount,
      perPageBw: 5,
    });
    const cost = promo.cost;

    const stored = saveBuffer(file.buffer, file.originalname || req.body?.title || 'document.pdf');
    const savedFile = await AppDataSource.getRepository(File).save(
      AppDataSource.getRepository(File).create({
        fileName: file.originalname || req.body?.title || 'document',
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        fileURL: stored.url,
        pageCount,
      }),
    );

    // Best-effort wallet debit — match the customer-app behaviour. Unfunded
    // job still releases at the kiosk; collections is a separate problem.
    const wRepo = AppDataSource.getRepository(Wallet);
    const wallet = await wRepo.findOne({ where: { userId: user.id } });
    if (wallet && Number(wallet.balance) >= cost) {
      wallet.balance = Number(wallet.balance) - cost;
      await wRepo.save(wallet);
    }

    const jobRepo = AppDataSource.getRepository(PrintJob);
    const job = jobRepo.create();
    Object.assign(job, {
      userId: user.id,
      fileId: savedFile.id,
      fileName: req.body?.title || file.originalname || 'document',
      code: makeCode(6),
      cost,
      totalPages: pageCount,
      jobType: JobType.SINGLE,
      status: PrintJobStatus.READY,
      printConfiguration,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const saved = await jobRepo.save(job);

    // text/plain message the CUPS backend pipes onto job-state-message so it
    // surfaces in `lpq -l` and the system print queue UI.
    const message = `PrintLoop release code: ${saved.code} (₦${cost})`;
    res.json({
      success: true,
      data: {
        code: saved.code,
        cost,
        pages: pageCount,
        copies,
        config: printConfiguration,
        message,
      },
    });
  } catch (error: any) {
    console.error('CUPS ingress error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Print failed' });
  }
});

export default router;
