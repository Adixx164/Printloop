import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus, JobType } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { Wallet } from '../entities/wallet.entity';
import { User } from '../entities/user.entity';
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

function priceOf(pages: number, c: any): number {
  const copies = Math.max(1, Number(c.copies) || 1);
  const perPage = c.color === 'color' ? 25 : 5;
  const duplex = c.sided === 'double' ? 0.85 : 1;
  const quality = c.qualityDpi === 600 ? 1.2 : c.qualityDpi === 100 ? 0.8 : 1;
  return Math.max(5, Math.round(Math.max(1, pages) * copies * perPage * duplex * quality));
}

function formatJob(j: PrintJob) {
  const title = (j.fileName || 'Document').replace(/\.[^.]+$/, '');
  const cfg: any = j.printConfiguration || {};
  return {
    id: j.id,
    fileName: j.fileName,
    title,
    code: j.code,
    cost: Number(j.cost),
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
    if (!isPrintableDocument(file.originalname || '', file.mimetype)) {
      res.status(415).json({
        success: false,
        message: `Unsupported file type. PrintLoop prints ${ALLOWED_LABEL} only.`,
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
    const printConfiguration = {
      copies: Math.max(1, Number(cfg.copies) || 1),
      paper: cfg.paper || 'A4',
      color: cfg.color === 'color' ? 'color' : 'bw',
      sided: (cfg.sided === 'double' ? 'double' : 'single') as 'single' | 'double',
      qualityDpi: ([100, 300, 600].includes(Number(cfg.qualityDpi))
        ? Number(cfg.qualityDpi)
        : 300) as 100 | 300 | 600,
    };
    // Authoritative limits + page count (never trust the client — it sets price).
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
    const jobType =
      req.body.jobType === 'personal_batch' ? JobType.PERSONAL_BATCH : JobType.SINGLE;
    const paymentMethod = req.body.paymentMethod === 'paystack' ? 'paystack' : 'wallet';
    const baseCost = priceOf(pageCount, printConfiguration);
    const promo = await applyPromotion(baseCost, req.body.promotionCode, {
      pageCount,
      perPageBw: 5,
    });
    const cost = promo.cost;

    // Persist the real bytes (served at /api/files, fetched by the kiosk).
    const stored = saveBuffer(file.buffer, file.originalname || req.body.fileName || 'document.pdf');
    const savedFile = await AppDataSource.getRepository(File).save(
      AppDataSource.getRepository(File).create({
        fileName: file.originalname || 'document',
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        fileURL: stored.url,
        pageCount,
      })
    );

    // Best-effort real wallet debit (real settlement = Paystack item, later).
    if (paymentMethod === 'wallet') {
      const wRepo = AppDataSource.getRepository(Wallet);
      const wallet = await wRepo.findOne({ where: { userId: user.id } });
      if (wallet && Number(wallet.balance) >= cost) {
        wallet.balance = Number(wallet.balance) - cost;
        await wRepo.save(wallet);
      }
    }

    const jobRepo = AppDataSource.getRepository(PrintJob);
    const job = jobRepo.create();
    Object.assign(job, {
      userId: user.id,
      fileId: savedFile.id,
      fileName: file.originalname || 'document',
      code: makeCode(6),
      cost,
      totalPages: pageCount,
      jobType,
      status: PrintJobStatus.READY, // paid & releasable at a kiosk
      printConfiguration,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const saved = await jobRepo.save(job);

    res.status(201).json({ success: true, data: { job: formatJob(saved) } });
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
router.post('/print-jobs/batch', upload.array('files', 50), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) {
      res.status(400).json({ success: false, message: 'At least one document is required' });
      return;
    }
    const bad = files.find((f) => !isPrintableDocument(f.originalname || '', f.mimetype));
    if (bad) {
      res.status(415).json({
        success: false,
        message: `"${bad.originalname}" is not supported. PrintLoop prints ${ALLOWED_LABEL} only.`,
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
    const paymentMethod = req.body.paymentMethod === 'paystack' ? 'paystack' : 'wallet';

    // Authoritative validation pre-pass — fail before we create any rows.
    const limits = await getUploadLimits();
    const perFile: Array<{ pages: number }> = [];
    for (const f of files) {
      if (f.size > limits.maxFileBytes) {
        res.status(413).json({
          success: false,
          message: `"${f.originalname}" is too large. Max ${Math.round(limits.maxFileBytes / 1048576)} MB.`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
      let pages: number;
      try {
        pages = await countPages(f.buffer, f.originalname || 'document.pdf');
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
      perFile.push({ pages });
    }

    const fileRepo = AppDataSource.getRepository(File);
    const itemRepo = AppDataSource.getRepository(PrintJobItem);
    const jobRepo = AppDataSource.getRepository(PrintJob);

    const jobId = makeCode(6);
    const job = jobRepo.create();
    Object.assign(job, {
      userId: user.id,
      fileId: null,
      fileName: `${files.length} document${files.length === 1 ? '' : 's'} (batch)`,
      code: jobId,
      cost: 0,
      totalPages: 0,
      jobType: JobType.PERSONAL_BATCH,
      status: PrintJobStatus.READY,
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
      };
      const pages = perFile[i].pages; // authoritative (server-derived)
      const cost = priceOf(pages, cfg);
      totalCost += cost;
      totalPages += pages;

      const stored = saveBuffer(f.buffer, f.originalname || meta.fileName || `doc-${i + 1}.pdf`);
      const savedFile = await fileRepo.save(
        fileRepo.create({
          fileName: f.originalname || `doc-${i + 1}`,
          mimeType: f.mimetype || 'application/octet-stream',
          sizeBytes: f.size,
          fileURL: stored.url,
          pageCount: pages,
        })
      );
      const it = itemRepo.create();
      Object.assign(it, {
        printJobId: savedJob.id,
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

    if (paymentMethod === 'wallet') {
      const wRepo = AppDataSource.getRepository(Wallet);
      const wallet = await wRepo.findOne({ where: { userId: user.id } });
      if (wallet && Number(wallet.balance) >= promo.cost) {
        wallet.balance = Number(wallet.balance) - promo.cost;
        await wRepo.save(wallet);
      }
    }

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
    const jobs = await AppDataSource.getRepository(PrintJob).find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const mapped = jobs
      .map(formatJob)
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

/** GET /api/customer/print-jobs/options — pricing/options for the UI. */
router.get('/print-jobs/options', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      paperSizes: ['A4', 'A3', 'Letter'],
      colors: ['bw', 'color'],
      sides: ['single', 'double'],
      qualityOptions: [100, 300, 600],
      paymentMethods: ['wallet', 'paystack'],
      pricing: { bwPerPage: 5, colorPerPage: 25, duplexDiscount: 0.85 },
    },
  });
});

export default router;
