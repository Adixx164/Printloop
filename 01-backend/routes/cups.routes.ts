import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { PrintJob, PrintJobStatus, JobType } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import { saveBuffer } from '../utils/fileStore';
import {
  isPrintableDocument,
  ALLOWED_LABEL,
  countPages,
  flattenAnnotations,
  UnsupportedDocumentError,
} from '../services/documentConvert.service';
import { getUploadLimits } from '../utils/limits';
import { applyPromotion } from '../services/promotion.service';
import { computeCost, type PrintConfiguration } from '../services/pricing.service';
import { PaystackService } from '../services/paystack.service';
import { makeCode } from '../utils/releaseCode';
import type { Tenant } from '../entities/tenant.entity';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Init the Paystack hosted checkout for a CUPS job (V2-55). Null when
 * Paystack isn't configured (local dev) or the init fails — the job
 * stays PENDING either way, so nothing prints unpaid.
 */
async function initCheckout(
  user: User,
  jobId: string,
  cost: number,
  tenant: Tenant | undefined,
): Promise<string | null> {
  if (!process.env.PAYSTACK_SECRET_KEY) return null;
  try {
    const paystack = new PaystackService();
    const data = await paystack.initializeJobPayment(
      user.id,
      jobId,
      cost,
      user.email,
      tenant ?? undefined,
    );
    return data?.authorization_url ?? null;
  } catch (err: any) {
    console.warn('[cups] checkout init failed:', err?.message);
    return null;
  }
}

/** The plain-text line the CUPS backend puts on the job's state message. */
function cupsStatusMessage(
  code: string | null,
  cost: number,
  payUrl: string | null,
): string {
  if (payUrl) {
    return `PrintLoop release code: ${code} (₦${cost}). Pay at: ${payUrl}`;
  }
  return `PrintLoop release code: ${code} (₦${cost})`;
}

/** One-shot warning if anyone tries the legacy `?token=` path in prod. */
let warnedQueryTokenInProd = false;

/**
 * Pull the print token off the request. CUPS device URIs end up as
 *   `Authorization: Bearer <token>` once our CUPS backend script translates
 * the URI. `X-PrintLoop-Token` is the safe header fallback. `?token=` is
 * only honoured in non-production builds — production proxies log query
 * strings, leaking the credential.
 */
function extractToken(req: Request): string | null {
  const auth = req.header('authorization') || '';
  const m = auth.match(/^Bearer\s+([A-Za-z0-9._-]+)$/);
  if (m) return m[1];
  const h = req.header('x-printloop-token');
  if (h) return h;
  const q = req.query?.token;
  if (typeof q === 'string' && q) {
    if (process.env.NODE_ENV === 'production') {
      if (!warnedQueryTokenInProd) {
        console.warn(
          '[cups] refusing ?token= in production — tokens in URLs land in access logs. Use Authorization: Bearer.',
        );
        warnedQueryTokenInProd = true;
      }
      return null;
    }
    return q;
  }
  return null;
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
  orientation: 'portrait' | 'landscape';
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

  // IPP orientation-requested: 3 = portrait, 4 = landscape, 5 = reverse
  // landscape, 6 = reverse portrait. PPD synonyms vary; accept the common
  // ones. Anything we can't classify defaults to portrait.
  const oRaw = (out['orientation-requested'] || out['orientation'] || '').toLowerCase();
  const orientation: 'portrait' | 'landscape' =
    oRaw === '4' || oRaw === '5' || /landscape/.test(oRaw) ? 'landscape' : 'portrait';

  return { paper, color, sided, copies, qualityDpi, orientation };
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
    // Bake annotations (signatures) into the bytes before counting/storing so
    // the printer RIP can't move or drop them. Byte-exact passthrough when
    // there are none; original bytes on any failure — the job never breaks.
    const pdfBytes = await flattenAnnotations(file.buffer);
    let pageCount: number;
    try {
      pageCount = await countPages(pdfBytes, file.originalname || 'document.pdf');
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
    // CUPS sometimes splits "copies" off the options blob into its own arg.
    // `cups.copies` is already ≥1 from parseCupsOptions; take whichever
    // is larger so the user doesn't get stuck on 1.
    const explicitCopies = parseInt(req.body?.copies || '1', 10) || 1;
    const copies = Math.max(cups.copies, explicitCopies);
    const printConfiguration: PrintConfiguration = {
      copies,
      paper: cups.paper,
      color: cups.color,
      sided: cups.sided,
      qualityDpi: cups.qualityDpi,
      orientation: cups.orientation,
    };
    const baseCost = await computeCost({
      pageCount,
      copies: printConfiguration.copies,
      paper: printConfiguration.paper,
      color: printConfiguration.color,
      sided: printConfiguration.sided,
      qualityDpi: printConfiguration.qualityDpi,
    });
    const promo = await applyPromotion(baseCost, req.body?.promotionCode, {
      pageCount,
      perPageBw: 5,
    });
    const cost = promo.cost;

    // Idempotency: if the same client retries the same print (CUPS resends
    // on `exit 4`), we return the existing PrintJob instead of creating a
    // duplicate. Key is bound to userId, so distinct users using the same
    // header value can't collide.
    const idempotencyKey =
      req.header('idempotency-key') ||
      (typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : '') ||
      '';
    const jobRepo = AppDataSource.getRepository(PrintJob);
    if (idempotencyKey) {
      const existing = await jobRepo.findOne({
        where: { userId: user.id, idempotencyKey },
      });
      if (existing) {
        // The same CUPS job was seen before (retry after `exit 4`).
        // Return its code + cost, and a fresh checkout link if it still
        // hasn't been paid (V2-55: CUPS jobs bill via Paystack like web
        // jobs — no wallet anymore).
        let payUrl: string | null = null;
        if (existing.status === PrintJobStatus.PENDING) {
          payUrl = await initCheckout(user, existing.id, Number(existing.cost), req.tenant);
        }
        res.json({
          success: true,
          data: {
            code: existing.code,
            cost: Number(existing.cost),
            pages: existing.totalPages,
            copies: (existing.printConfiguration as any)?.copies ?? copies,
            config: existing.printConfiguration,
            payUrl,
            message: cupsStatusMessage(existing.code, Number(existing.cost), payUrl),
            idempotent: true,
          },
        });
        return;
      }
    }

    const stored = await saveBuffer(pdfBytes, file.originalname || req.body?.title || 'document.pdf');
    const savedFile = await AppDataSource.getRepository(File).save(
      AppDataSource.getRepository(File).create({
        tenantId: req.tenant?.id ?? user.tenantId ?? null,
        fileName: file.originalname || req.body?.title || 'document',
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: pdfBytes.length,
        fileURL: stored.url,
        pageCount,
      }),
    );

    // Billing note (V2-53/55): the wallet is gone. CUPS-ingress jobs are
    // created with their release code and a cost estimate, but stay
    // PENDING — the Paystack webhook pays them exactly like web jobs
    // (completePrintJobPayment reuses the pre-minted code), and the
    // release gate charges the saved card for any final-cost delta.
    // Rendering starts after payment, not at creation.
    const job = jobRepo.create();
    Object.assign(job, {
      userId: user.id,
      tenantId: req.tenant?.id ?? user.tenantId ?? null,
      fileId: savedFile.id,
      fileName: req.body?.title || file.originalname || 'document',
      code: makeCode(6),
      cost,
      totalPages: pageCount,
      jobType: JobType.SINGLE,
      // Created PENDING; the Paystack webhook (completePrintJobPayment)
      // promotes it to RENDERING → READY after the customer pays, the
      // same path web jobs take. No render at creation (V2-55).
      status: PrintJobStatus.PENDING,
      printConfiguration,
      idempotencyKey: idempotencyKey || null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const saved = await jobRepo.save(job);

    // V2-55: bill like a web job — init the Paystack hosted checkout and
    // hand the link back with the code. Best-effort: no Paystack key
    // (local dev) → payUrl null and the job waits for payment anyway.
    const payUrl = await initCheckout(user, saved.id, cost, req.tenant);

    // text/plain message the CUPS backend pipes onto job-state-message so it
    // surfaces in `lpq -l` and the system print queue UI.
    const message = cupsStatusMessage(saved.code, cost, payUrl);
    res.json({
      success: true,
      data: {
        code: saved.code,
        cost,
        pages: pageCount,
        copies,
        config: printConfiguration,
        payUrl,
        message,
      },
    });
  } catch (error: any) {
    console.error('CUPS ingress error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Print failed' });
  }
});

export default router;
