import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus, JobType } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { User } from '../entities/user.entity';
import { DocumentEdit, DocumentEditStatus } from '../entities/documentEdit.entity';
import { EditPricingConfig } from '../entities/editPricingConfig.entity';
import { saveBuffer } from '../utils/fileStore';
import {
  isPrintableDocument,
  countPages,
  flattenAnnotations,
  UnsupportedDocumentError,
} from '../services/documentConvert.service';
import {
  isOfficeDocument,
  conversionEnabled,
  convertOfficeToPdf,
  acceptedDocsLabel,
  OfficeConversionError,
} from '../services/documentConversion.service';
import { getUploadLimits } from '../utils/limits';
import { applyPromotion } from '../services/promotion.service';
import { computeCost, type PrintConfiguration } from '../services/pricing.service';
import { checkUploadLimit, validateFileSize } from '../services/abuseLimits.service';
import { PricingConfig } from '../entities/pricingConfig.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import { Tenant } from '../entities/tenant.entity';
import { ShopReview } from '../entities/shopReview.entity';
import { Dispute, DisputeStatus } from '../entities/dispute.entity';
import { Payment } from '../entities/payment.entity';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function formatJob(j: PrintJob) {
  const title = (j.fileName || 'Document').replace(/\.[^.]+$/, '');
  const cfg: any = j.printConfiguration || {};
  return {
    id: j.id,
    fileName: j.fileName,
    title,
    code: j.code,
    cost: Number(j.cost),
    finalCost: j.finalCost == null ? null : Number(j.finalCost),
    shortfall: j.finalCost == null ? 0 : Math.max(0, Number(j.finalCost) - Number(j.cost)),
    status: j.status,
    jobType: j.jobType,
    pageCount: j.totalPages,
    printConfiguration: cfg,
    createdAt: j.createdAt,
    expiresAt: j.expiresAt,
    qrPayload: `printloop://release/${j.code}`,
    meta: `${j.totalPages}pp · ${cfg.paper || 'A4'} · ${cfg.color === 'color' ? 'Colour' : 'B&W'} · ${cfg.qualityDpi || 300}dpi`,
  };
}

/**
 * POST /api/customer/print-jobs  (multipart: file + fields)
 * Real flow: store the document, create a real PrintJob the kiosk can
 * fetch & print. Auth handled by the parent router (authenticate).
 */
router.post('/print-jobs', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: 'A document file is required' });
      return;
    }
    // Pre-pay offline guard (V2-32). For marketplace tenants only —
    // legacy single-tenant deployments skip so existing flows keep
    // working unchanged. If the chosen shop has dropped offline since
    // the customer started, we'd rather 409 cleanly than collect
    // money for a job that can't print.
    const offlineReason = await assertTenantHasOnlineKiosk(req);
    if (offlineReason) {
      res.status(409).json({
        success: false,
        message: offlineReason,
        code: 'SHOP_OFFLINE',
      });
      return;
    }
    const isOffice =
      conversionEnabled() && isOfficeDocument(file.originalname || '', file.mimetype);
    if (!isPrintableDocument(file.originalname || '', file.mimetype) && !isOffice) {
      res.status(415).json({
        success: false,
        message: `Unsupported file type. PrintLoop prints ${acceptedDocsLabel()} only.`,
        code: 'UNSUPPORTED_DOCUMENT',
      });
      return;
    }

    let cfg: any = {};
    try {
      cfg = req.body.printConfiguration ? JSON.parse(req.body.printConfiguration) : {};
    } catch {
      cfg = {};
    }
    const printConfiguration: PrintConfiguration = {
      copies: Math.max(1, Number(cfg.copies) || 1),
      paper: cfg.paper || 'A4',
      color: cfg.color === 'color' ? 'color' : 'bw',
      sided: cfg.sided === 'double' ? 'double' : 'single',
      qualityDpi: ([100, 300, 600].includes(Number(cfg.qualityDpi))
        ? Number(cfg.qualityDpi)
        : 300) as 100 | 300 | 600,
      orientation: cfg.orientation === 'landscape' ? 'landscape' : 'portrait',
    };
    // Authoritative limits + page count (never trust the client — it sets price).
    const limits = await getUploadLimits();
    // File size sanity check (50 MB absolute cap)
    const sizeCheck = validateFileSize(file.size);
    if (!sizeCheck.valid) {
      res.status(413).json({
        success: false,
        message: sizeCheck.message,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }
    // Tenant-level upload bytes in last 24h (abuse limit)
    if (req.tenant?.id) {
      const uploadLimit = await checkUploadLimit(req.tenant.id, file.size);
      if (!uploadLimit.allowed) {
        res.status(429).json({
          success: false,
          message: `Upload limit exceeded. You've used ${(uploadLimit.usedBytes / 1024 / 1024 / 1024).toFixed(2)} GB of ${(uploadLimit.limitBytes / 1024 / 1024 / 1024).toFixed(0)} GB daily allowance. Resets at midnight UTC.`,
          code: 'UPLOAD_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((uploadLimit.resetAt.getTime() - Date.now()) / 1000),
        });
        return;
      }
    }
    if (file.size > limits.maxFileBytes) {
      res.status(413).json({
        success: false,
        message: `File too large. Max ${Math.round(limits.maxFileBytes / 1048576)} MB.`,
        code: 'FILE_TOO_LARGE',
      });
      return;
    }
    // Office formats (Word / PowerPoint / Excel) → PDF via the conversion
    // black box (V2-48) BEFORE anything downstream, so page-count, pricing,
    // render and the agent all see a real PDF. PDFs/images skip this.
    let sourceBytes = file.buffer;
    if (isOffice) {
      try {
        sourceBytes = await convertOfficeToPdf(file.buffer, file.originalname || 'document');
      } catch (e: any) {
        res.status(e instanceof OfficeConversionError ? 422 : 500).json({
          success: false,
          message: 'We could not convert that document. Please upload a PDF, or try again.',
          code: 'OFFICE_CONVERSION_FAILED',
        });
        return;
      }
    }
    // Bake annotations (signatures, form fills) into the page bytes BEFORE
    // counting and storing, so a broken printer RIP can't move or drop them.
    // No-annotation PDFs (and images) pass through byte-exact; any failure
    // yields the original bytes — the upload never breaks.
    const pdfBytes = await flattenAnnotations(sourceBytes);
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
    const jobType =
      req.body.jobType === 'personal_batch' ? JobType.PERSONAL_BATCH : JobType.SINGLE;
    // V2-XX — Document Editing Service
    const editingRequired = req.body.editingRequired === 'true' || req.body.editingRequired === true;
    const editingInstructions = req.body.editingInstructions?.trim() || null;

    const baseCost = await computeCost({
      pageCount,
      copies: printConfiguration.copies,
      paper: printConfiguration.paper,
      color: printConfiguration.color,
      sided: printConfiguration.sided,
      qualityDpi: printConfiguration.qualityDpi,
    });
    const promo = await applyPromotion(baseCost, req.body.promotionCode, {
      pageCount,
      perPageBw: 5,
    });
    const cost = promo.cost;

    // Persist the (flattened) bytes — served at /api/files, fetched by the kiosk.
    const stored = await saveBuffer(pdfBytes, file.originalname || req.body.fileName || 'document.pdf');
    const savedFile = await AppDataSource.getRepository(File).save(
      AppDataSource.getRepository(File).create({
        tenantId: req.tenant?.id ?? null,
        fileName: file.originalname || 'document',
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: pdfBytes.length,
        fileURL: stored.url,
        pageCount,
      })
    );

    const jobRepo = AppDataSource.getRepository(PrintJob);
    const job = jobRepo.create();
    Object.assign(job, {
      userId: user.id,
      tenantId: req.tenant?.id ?? null,
      fileId: savedFile.id,
      fileName: file.originalname || 'document',
      // Payment happens via Paystack checkout (V2-53 — no wallet); the
      // release code is minted by completePrintJobPayment on charge.success.
      code: null,
      cost,
      totalPages: pageCount,
      jobType,
      // V2-XX — Document Editing Service
      editingRequired,
      editingInstructions,
      // Created in PENDING; completePrintJobPayment (Paystack webhook)
      // promotes it to RENDERING (render-worker) or READY (fallback).
      // If editingRequired, status will be AWAITING_EDIT after payment
      status: editingRequired ? PrintJobStatus.AWAITING_EDIT : PrintJobStatus.PENDING,
      printConfiguration,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const saved = await jobRepo.save(job);

    // V2-XX — If editing required, create DocumentEdit record and notify shop
    if (editingRequired && req.tenant?.id) {
      try {
        const editPricingRepo = AppDataSource.getRepository(EditPricingConfig);
        const editPricing = await editPricingRepo.findOne({ where: { tenantId: req.tenant.id } });

        if (editPricing?.editingEnabled) {
          const editRepo = AppDataSource.getRepository(DocumentEdit);
          const edit = editRepo.create({
            printJobId: saved.id,
            shopId: req.tenant.id,
            editedBy: '', // Will be set when shop starts editing
            editOperations: [],
            originalDocumentMeta: {
              pageCount,
              fileSize: pdfBytes.length,
              fileName: file.originalname || 'document',
            },
            editedDocumentMeta: null,
            baseEditFee: Number(editPricing.baseFee),
            perPageFee: Number(editPricing.perPageFee),
            complexityFee: 0,
            shopAdjustedFee: 0,
            totalEditFee: Number(editPricing.baseFee) + Number(editPricing.perPageFee) * pageCount,
            status: DocumentEditStatus.PENDING_SHOP,
            shopNotes: null,
            customerRejectionReason: null,
            approvedBy: null,
            approvedAt: null,
            completedAt: null,
          });
          await editRepo.save(edit);

          // Notify shop of new edit job
          const { notificationQueue } = await import('../workers/queues');
          await notificationQueue.add('new-edit-job', {
            shopId: req.tenant.id,
            printJobId: saved.id,
            editId: edit.id,
            customerName: `${user.firstName} ${user.lastName}`,
            customerEmail: user.email,
          });
        }
      } catch (editErr) {
        console.error('Failed to create edit job:', editErr);
        // Don't fail the print job creation if edit job creation fails
      }
    }

    res.status(201).json({
      success: true,
      data: { job: formatJob(saved) },
    });
  } catch (error) {
    console.error('Customer create print job error:', error);
    res.status(500).json({ success: false, message: 'Failed to create print job' });
  }
});

/**
 * POST /api/customer/print-jobs/batch  (multipart: files[] + items JSON)
 * Real multi-file / ONE-code job: a single PrintJob (the release code) with
 * one PrintJobItem per document, each keeping its own settings.
 */
/**
 * Pre-pay offline guard (V2-32). Returns a user-facing message when
 * the customer's chosen shop has no kiosk online; null when we
 * should let the request through.
 *
 * Skips when there's no req.tenant (cross-tenant routes), and skips
 * for the legacy tenant — single-tenant deployments don't have the
 * marketplace contract where customers explicitly picked a shop.
 */
async function assertTenantHasOnlineKiosk(req: Request): Promise<string | null> {
  const t = req.tenant;
  if (!t) return null;
  const { LEGACY_TENANT_SLUG } = await import('../middleware/tenant.middleware');
  if (t.slug === LEGACY_TENANT_SLUG) return null;

  // Operator-controlled availability (V2-57): a shop that's CLOSED
  // rejects new uploads outright — the student gets a clear reason
  // instead of paying into a queue that won't print.
  if (t.availability === 'closed') {
    return "This shop is currently closed. Check back soon or try another nearby shop.";
  }

  const kiosks = await AppDataSource.getRepository(Kiosk).find({
    where: { tenantId: t.id },
  });
  const cutoff = Date.now() - 5 * 60 * 1000;
  const online = kiosks.some(
    (k) =>
      k.status === KioskStatus.ACTIVE &&
      (process.env.SEED_DEMO === '1' ||
        process.env.NODE_ENV !== 'production' ||
        (k.lastSeenAt && new Date(k.lastSeenAt).getTime() > cutoff)),
  );
  if (online) return null;
  return "This shop just went offline. Try another nearby shop or wait a few minutes.";
}

router.post('/print-jobs/batch', upload.array('files', 50), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) {
      res.status(400).json({ success: false, message: 'At least one document is required' });
      return;
    }
    // Pre-pay offline guard (V2-32) — same as /print-jobs.
    const offlineReason = await assertTenantHasOnlineKiosk(req);
    if (offlineReason) {
      res.status(409).json({
        success: false,
        message: offlineReason,
        code: 'SHOP_OFFLINE',
      });
      return;
    }
    const officeOk = conversionEnabled();
    const bad = files.find(
      (f) =>
        !isPrintableDocument(f.originalname || '', f.mimetype) &&
        !(officeOk && isOfficeDocument(f.originalname || '', f.mimetype)),
    );
    if (bad) {
      res.status(415).json({
        success: false,
        message: `"${bad.originalname}" is not supported. PrintLoop prints ${acceptedDocsLabel()} only.`,
        code: 'UNSUPPORTED_DOCUMENT',
      });
      return;
    }
    let items: any[] = [];
    try {
      items = req.body.items ? JSON.parse(req.body.items) : [];
    } catch {
      items = [];
    }
    const collate = req.body.collate !== 'false';

    // Authoritative validation pre-pass — fail before we create any rows.
    const limits = await getUploadLimits();
    const perFile: Array<{ pages: number; bytes: Buffer }> = [];
    for (const f of files) {
      if (f.size > limits.maxFileBytes) {
        res.status(413).json({
          success: false,
          message: `"${f.originalname}" is too large. Max ${Math.round(limits.maxFileBytes / 1048576)} MB.`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
      // Office → PDF (V2-48) first, then bake annotations once here; carry
      // the flattened bytes into the persist pass below so the stored file
      // matches the counted pages.
      let src = f.buffer;
      if (officeOk && isOfficeDocument(f.originalname || '', f.mimetype)) {
        try {
          src = await convertOfficeToPdf(f.buffer, f.originalname || 'document');
        } catch (e: any) {
          res.status(e instanceof OfficeConversionError ? 422 : 500).json({
            success: false,
            message: `We could not convert "${f.originalname}". Please upload a PDF, or try again.`,
            code: 'OFFICE_CONVERSION_FAILED',
          });
          return;
        }
      }
      const bytes = await flattenAnnotations(src);
      let pages: number;
      try {
        pages = await countPages(bytes, f.originalname || 'document.pdf');
      } catch (e: any) {
        res.status(e instanceof UnsupportedDocumentError ? 415 : 422).json({
          success: false,
          message: `"${f.originalname}": ${e?.message || 'Could not read the document.'}`,
          code: e?.code || 'UNREADABLE_DOCUMENT',
        });
        return;
      }
      if (pages > limits.maxPages) {
        res.status(413).json({
          success: false,
          message: `"${f.originalname}" has ${pages} pages; the limit is ${limits.maxPages}.`,
          code: 'TOO_MANY_PAGES',
        });
        return;
      }
      perFile.push({ pages, bytes });
    }

    const fileRepo = AppDataSource.getRepository(File);
    const itemRepo = AppDataSource.getRepository(PrintJobItem);
    const jobRepo = AppDataSource.getRepository(PrintJob);

    const job = jobRepo.create();
    Object.assign(job, {
      userId: user.id,
      tenantId: req.tenant?.id ?? null,
      fileId: null,
      fileName: `${files.length} document${files.length === 1 ? '' : 's'} (batch)`,
      // Payment happens via Paystack checkout (V2-53 — no wallet); the
      // release code is minted by completePrintJobPayment on charge.success.
      code: null,
      cost: 0,
      totalPages: 0,
      jobType: JobType.PERSONAL_BATCH,
      // Batch parent has no file of its own — the items each carry a
      // file. Parent stays PENDING until paid; per-item rendering is
      // enqueued separately when the items table gets its own
      // tenantId + render-enqueue retrofit (deferred — see JOURNAL Phase V2-6).
      status: PrintJobStatus.PENDING,
      printConfiguration: { collate } as any,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const savedJob = await jobRepo.save(job);

    let totalCost = 0;
    let totalPages = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const meta = items[i] || {};
      const cfg = {
        copies: Math.max(1, Number(meta.printConfiguration?.copies) || 1),
        paper: meta.printConfiguration?.paper || 'A4',
        color: (meta.printConfiguration?.color === 'color' ? 'color' : 'bw') as 'bw' | 'color',
        sided: (meta.printConfiguration?.sided === 'double' ? 'double' : 'single') as
          | 'single'
          | 'double',
        qualityDpi: ([100, 300, 600].includes(Number(meta.printConfiguration?.qualityDpi))
          ? Number(meta.printConfiguration?.qualityDpi)
          : 300) as 100 | 300 | 600,
        orientation: (meta.printConfiguration?.orientation === 'landscape'
          ? 'landscape'
          : 'portrait') as 'portrait' | 'landscape',
      };
      const pages = perFile[i].pages; // authoritative (server-derived)
      const bytes = perFile[i].bytes; // flattened in the validation pass
      const cost = await computeCost({ pageCount: pages, ...cfg });
      totalCost += cost;
      totalPages += pages;

      const stored = await saveBuffer(bytes, f.originalname || meta.fileName || `doc-${i + 1}.pdf`);
      const savedFile = await fileRepo.save(
        fileRepo.create({
          tenantId: req.tenant?.id ?? null,
          fileName: f.originalname || `doc-${i + 1}`,
          mimeType: f.mimetype || 'application/octet-stream',
          sizeBytes: bytes.length,
          fileURL: stored.url,
          pageCount: pages,
        })
      );
      const it = itemRepo.create();
      Object.assign(it, {
        printJobId: savedJob.id,
        tenantId: req.tenant?.id ?? null,
        fileId: savedFile.id,
        fileName: f.originalname || `doc-${i + 1}`,
        order: i,
        totalPages: pages,
        cost,
        printConfiguration: cfg,
      });
      await itemRepo.save(it);
    }

    // Promotion applies once against the whole batch total — single redemption
    // per code per batch, so the usage counter stays meaningful.
    const promo = await applyPromotion(totalCost, req.body.promotionCode, {
      pageCount: totalPages,
      perPageBw: 5,
    });
    savedJob.cost = promo.cost;
    savedJob.totalPages = totalPages;
    await jobRepo.save(savedJob);

    res.status(201).json({
      success: true,
      data: { job: { ...formatJob(savedJob), items: files.length } },
    });
  } catch (error) {
    console.error('Customer batch job error:', error);
    res.status(500).json({ success: false, message: 'Failed to create batch job' });
  }
});

/** GET /api/customer/print-jobs — the signed-in user's jobs. */
router.get('/print-jobs', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const status = req.query.status?.toString();
    // userId narrows to *this* customer's jobs; tenantId narrows to
    // jobs the resolved tenant owns. With tenantId NOT NULL the
    // tenant filter is required for correctness even though userId
    // alone would never leak across tenants (one User belongs to
    // one tenant) — leaving the filter in for defence-in-depth and
    // index coverage.
    const where: any = { userId: user.id };
    if (req.tenant) where.tenantId = req.tenant.id;
    const [jobs, tenants] = await Promise.all([
      AppDataSource.getRepository(PrintJob).find({
        where,
        order: { createdAt: 'DESC' },
        take: 100,
      }),
      AppDataSource.getRepository(Tenant).find({
        select: ['id', 'slug', 'name'],
      }),
    ]);

    const tenantMap = new Map<string, { slug: string; name: string }>();
    for (const t of tenants) {
      tenantMap.set(t.id, { slug: t.slug, name: t.name });
    }

    const mapped = jobs
      .map((j) => {
        const base = formatJob(j);
        const tInfo = j.tenantId ? tenantMap.get(j.tenantId) : null;
        return {
          ...base,
          tenantId: j.tenantId,
          tenantSlug: tInfo?.slug || null,
          tenantName: tInfo?.name || null,
        };
      })
      .filter((j) => !status || status === 'all' || j.status === status);
    res.json({ success: true, data: { jobs: mapped, total: mapped.length } });
  } catch (error) {
    console.error('Customer list jobs error:', error);
    res.status(500).json({ success: false, message: 'Failed to list jobs' });
  }
});

/**
 * GET /api/customer/print-token
 * Return the current print token (used by laptops printing via CUPS).
 * Null when the user has never minted one. We never *show* the token after
 * the first reveal in the UI; rotation is the recovery path.
 */
router.get('/print-token', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const fresh = await AppDataSource.getRepository(User).findOne({
      where: { id: user.id },
      select: ['id', 'printToken'],
    });
    res.json({
      success: true,
      data: { hasToken: !!fresh?.printToken, token: fresh?.printToken || null },
    });
  } catch (err) {
    console.error('Print-token read error:', err);
    res.status(500).json({ success: false, message: 'Failed to read print token' });
  }
});

/**
 * POST /api/customer/print-token/rotate
 * Mint or replace the print token. Old token is immediately invalid — any
 * CUPS queue still using it will start failing with 401, prompting the user
 * to copy the new device URI into their laptop.
 */
router.post('/print-token/rotate', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const repo = AppDataSource.getRepository(User);
    const token = crypto.randomBytes(40).toString('hex'); // 80 chars hex
    await repo.update({ id: user.id }, { printToken: token });
    res.json({ success: true, data: { token } });
  } catch (err) {
    console.error('Print-token rotate error:', err);
    res.status(500).json({ success: false, message: 'Failed to rotate print token' });
  }
});

/**
 * GET /api/customer/pricing
 * Live pricing matrix the customer UI uses to show prices. Same data
 * the admin edits — single source of truth. Each row carries the
 * per-cell prices (₦/page for {100,300,600}dpi × {simplex,duplex}) and
 * the legacy multiplier fields so a client can fall back when a cell is
 * blank. The /api/customer/print-jobs/quote endpoint below is the
 * authoritative calc for any displayed total.
 */
router.get('/pricing', async (_req: Request, res: Response) => {
  try {
    const rows = await AppDataSource.getRepository(PricingConfig).find({
      where: { isActive: true },
    });
    res.json({
      success: true,
      data: {
        currency: 'NGN',
        floor: 5,
        // V2-48 — does this shop's server have an office→PDF converter?
        // The upload UI uses this to offer Word/PowerPoint/Excel.
        officeConversion: conversionEnabled(),
        configs: rows.map((r) => ({
          paperSize: r.paperSize,
          colorType: r.colorType,
          pricePerPage: Number(r.pricePerPage),
          duplexMultiplier: Number(r.duplexMultiplier),
          highResolutionMultiplier: Number(r.highResolutionMultiplier),
          price100Simplex: r.price100Simplex == null ? null : Number(r.price100Simplex),
          price300Simplex: r.price300Simplex == null ? null : Number(r.price300Simplex),
          price600Simplex: r.price600Simplex == null ? null : Number(r.price600Simplex),
          price100Duplex: r.price100Duplex == null ? null : Number(r.price100Duplex),
          price300Duplex: r.price300Duplex == null ? null : Number(r.price300Duplex),
          price600Duplex: r.price600Duplex == null ? null : Number(r.price600Duplex),
        })),
      },
    });
  } catch (err) {
    console.error('Customer pricing read error:', err);
    res.status(500).json({ success: false, message: 'Failed to read pricing' });
  }
});

/**
 * POST /api/customer/print-jobs/quote
 * Authoritative server-side price quote — same `computeCost` the job-
 * creation path uses, so the number the customer sees here is the
 * number that will be debited. Promotional code is optional; an
 * invalid code returns the un-discounted price + a `reason` flag.
 */
router.post('/print-jobs/quote', async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const pageCount = Math.max(1, Number(b.pageCount) || 1);
    const copies = Math.max(1, Number(b.copies) || 1);
    const paper = b.paper || 'A4';
    const color: 'bw' | 'color' = b.color === 'color' ? 'color' : 'bw';
    const sided: 'single' | 'double' = b.sided === 'double' ? 'double' : 'single';
    const qualityDpi: 100 | 300 | 600 = [100, 300, 600].includes(Number(b.qualityDpi))
      ? (Number(b.qualityDpi) as 100 | 300 | 600)
      : 300;
    const baseCost = await computeCost({ pageCount, copies, paper, color, sided, qualityDpi });
    const promo = await applyPromotion(baseCost, b.promotionCode, {
      pageCount,
      perPageBw: 5,
    });
    res.json({
      success: true,
      data: {
        baseCost,
        cost: promo.cost,
        discount: promo.discount,
        promoCode: promo.code || null,
        promoReason: promo.reason || null,
        config: { paper, color, sided, qualityDpi, copies },
        pageCount,
      },
    });
  } catch (err) {
    console.error('Quote error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute quote' });
  }
});

/**
 * GET /api/customer/stations
 * The customer-facing "Find a station" directory. Real `Kiosk` rows
 * filtered by `isPublic = true`, ordered by name. Replaces the legacy
 * mock array under /api/stations so admin-added kiosks immediately
 * appear on the customer site.
 *
 * `status` is derived from the persisted Kiosk.status (ACTIVE / OFFLINE
 * / MAINTENANCE / DISABLED) AND a freshness check on lastSeenAt — a
 * kiosk that hasn't pinged in 5+ minutes is reported "offline" to the
 * customer even if its persisted status is still ACTIVE.
 */
router.get('/stations', async (_req: Request, res: Response) => {
  try {
    const rows = await AppDataSource.getRepository(Kiosk).find({
      where: { isPublic: true },
      order: { name: 'ASC' },
    });
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;
    res.json({
      success: true,
      data: {
        stations: rows.map((k) => {
          const fresh = k.lastSeenAt && now - new Date(k.lastSeenAt).getTime() < fiveMin;
          const status =
            k.status === KioskStatus.ACTIVE && fresh
              ? 'online'
              : k.status === KioskStatus.MAINTENANCE
                ? 'maintenance'
                : 'offline';
          return {
            id: k.id,
            name: k.name,
            area: k.location || k.campus || '',
            campus: k.campus || null,
            status,
            mapsUrl: k.mapsUrl || null,
            queue: 0, // populated by a future per-kiosk queue endpoint
            lastSeenAt: k.lastSeenAt,
          };
        }),
      },
    });
  } catch (err) {
    console.error('Customer stations read error:', err);
    res.status(500).json({ success: false, message: 'Failed to read stations' });
  }
});

/**
 * GET /api/customer/print-jobs/options — UI metadata.
 * Kept for backward compat. Static pricing was removed (it lied — the
 * admin matrix is the source of truth); UIs should read the live matrix
 * from GET /api/customer/pricing instead.
 */
router.get('/print-jobs/options', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      paperSizes: ['A4', 'A3', 'Letter'],
      colors: ['bw', 'color'],
      sides: ['single', 'double'],
      qualityOptions: [100, 300, 600],
      paymentMethods: ['paystack'],
    },
  });
});

/**
 * POST /api/customer/shops/:slug/reviews
 *
 * Authenticated customer submits/updates a review for a print shop.
 * Body: { rating: number, comment?: string }
 */
router.post('/shops/:slug/reviews', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const { rating, comment, photoUrl } = req.body || {};

    if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5 stars.',
      });
      return;
    }

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = await tenantRepo.findOne({ where: { slug } });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Shop not found.' });
      return;
    }

    const reviewRepo = AppDataSource.getRepository(ShopReview);
    let review = await reviewRepo.findOne({
      where: { tenantId: tenant.id, userId: user.id },
    });

    if (review) {
      review.rating = rating;
      review.comment = comment === undefined ? review.comment : (comment || null);
      review.photoUrl = photoUrl === undefined ? review.photoUrl : (photoUrl || null);
    } else {
      review = reviewRepo.create({
        tenantId: tenant.id,
        userId: user.id,
        rating,
        comment: comment || null,
        photoUrl: photoUrl || null,
      });
    }

    const saved = await reviewRepo.save(review);
    res.status(201).json({ success: true, data: saved });
  } catch (error: any) {
    console.error('Submit review error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to submit review.' });
  }
});

/**
 * POST /api/customer/disputes
 *
 * Customer raises a dispute (complaint) for a specific print job.
 * Body: { printJobId: string, reason: string }
 */
router.post('/disputes', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { printJobId, reason } = req.body || {};

    if (!printJobId || !reason) {
      res.status(400).json({ success: false, message: 'printJobId and reason are required.' });
      return;
    }

    const jobRepo = AppDataSource.getRepository(PrintJob);
    const job = await jobRepo.findOne({
      where: { id: printJobId, userId: user.id },
    });

    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    const disputeRepo = AppDataSource.getRepository(Dispute);
    const existing = await disputeRepo.findOne({
      where: { printJobId },
    });

    if (existing) {
      res.status(409).json({ success: false, message: 'A dispute has already been filed for this print job.' });
      return;
    }

    const dispute = disputeRepo.create({
      tenantId: job.tenantId!,
      userId: user.id,
      printJobId,
      reason,
      status: DisputeStatus.PENDING,
    });

    const saved = await disputeRepo.save(dispute);
    res.status(201).json({ success: true, data: saved });
  } catch (error: any) {
    console.error('Submit dispute error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Failed to submit dispute.' });
  }
});

export default router;
