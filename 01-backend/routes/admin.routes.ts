import { Router, type Request, type Response } from 'express';
import { AppDataSource } from '../config/database';
import { Permission, requirePermission } from '../middleware/rbac.middleware';
import { AdminDashboardService } from '../services/adminDashboard.service';
import { User, UserRole } from '../entities/user.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Payment } from '../entities/payment.entity';
import { Promotion } from '../entities/promotion.entity';
import { PricingConfig, PaperSize, ColorType } from '../entities/pricingConfig.entity';
import { SystemSetting } from '../entities/systemSetting.entity';
import { AuditLog } from '../entities/auditLog.entity';
import { GroupSession } from '../entities/groupSession.entity';
import { BlogPost, BlogPostStatus } from '../entities/blogPost.entity';
import { PrinterProfile, type PrinterCapabilities } from '../entities/printerProfile.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';

const router = Router();
const dashboardService = new AdminDashboardService();

// ── Helpers ──────────────────────────────────────────────────────────────

import { writeAudit } from '../services/audit.service';

function paginate(query: any) {
  const page = Math.max(1, parseInt(String(query.page || '1')));
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '50'))));
  return { page, limit, skip: (page - 1) * limit };
}

const SENSITIVE_USER_FIELDS = ['passwordHash', 'salt', 'verificationToken', 'resetToken'];

/** Remove credential material before a user object leaves the admin API. */
function scrubUser<T extends Record<string, any> | null | undefined>(u: T): T {
  if (!u || typeof u !== 'object') return u;
  const copy: any = { ...u };
  for (const f of SENSITIVE_USER_FIELDS) delete copy[f];
  return copy;
}

// ── Dashboard ────────────────────────────────────────────────────────────
router.get(
  '/dashboard/stats',
  requirePermission(Permission.VIEW_DASHBOARD),
  async (req: Request, res: Response) => {
    try {
      if (!req.tenant) {
        res.status(400).json({ success: false, message: 'Tenant context required' });
        return;
      }
      const stats = await dashboardService.getStats(req.tenant);
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to load dashboard stats' });
    }
  }
);

// ── Jobs ─────────────────────────────────────────────────────────────────
router.get(
  '/jobs',
  requirePermission(Permission.VIEW_JOBS),
  async (req: Request, res: Response) => {
    try {
      const { status, kioskId, userId, jobType, search, fromDate, toDate } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);

      const repo = AppDataSource.getRepository(PrintJob);
      const qb = repo.createQueryBuilder('job').leftJoinAndSelect('job.user', 'user');

      // Tenant scope first — everything else AND-chains onto it.
      if (req.tenant) qb.andWhere('job.tenantId = :__tid', { __tid: req.tenant.id });
      if (status) qb.andWhere('job.status = :status', { status });
      if (kioskId) qb.andWhere('job.kioskId = :kioskId', { kioskId });
      if (userId) qb.andWhere('job.userId = :userId', { userId });
      if (jobType) qb.andWhere('job.jobType = :jobType', { jobType });
      if (fromDate) qb.andWhere('job.createdAt >= :fromDate', { fromDate });
      if (toDate) qb.andWhere('job.createdAt <= :toDate', { toDate });
      if (search) {
        qb.andWhere(
          '(LOWER(job.fileName) LIKE :q OR LOWER(job.code) LIKE :q OR LOWER(user.email) LIKE :q)',
          { q: `%${search.toLowerCase()}%` }
        );
      }

      qb.orderBy('job.createdAt', 'DESC').skip(skip).take(limit);
      const [jobs, total] = await qb.getManyAndCount();
      const safeJobs = jobs.map((j: any) => ({ ...j, user: scrubUser(j.user) }));

      res.json({
        success: true,
        data: { jobs: safeJobs, total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('List jobs error:', error);
      res.status(500).json({ success: false, message: 'Failed to list jobs' });
    }
  }
);

router.patch(
  '/jobs/:id/requeue',
  requirePermission(Permission.REQUEUE_JOBS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PrintJob);
      const where = req.tenant
        ? { id: req.params.id, tenantId: req.tenant.id }
        : { id: req.params.id };
      const job = await repo.findOne({ where });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      if (job.status !== PrintJobStatus.FAILED) {
        res.status(400).json({ success: false, message: `Cannot requeue a job with status: ${job.status}` });
        return;
      }
      job.status = PrintJobStatus.READY;
      job.completedAt = null as any;
      await repo.save(job);
      await writeAudit(req, 'job.requeued', `job:${job.id}`, { code: job.code });
      res.json({ success: true, data: { job } });
    } catch (error) {
      console.error('Requeue job error:', error);
      res.status(500).json({ success: false, message: 'Failed to requeue job' });
    }
  }
);

/**
 * POST /api/admin/jobs/:id/accept — the Bolt-style accept window
 * (V2-58). The operator accepts a paid job that's waiting in
 * awaiting_accept; it becomes READY (releasable at the kiosk). Jobs
 * rerouted to this shop get their ledger credit here.
 */
router.post(
  '/jobs/:id/accept',
  requirePermission(Permission.REQUEUE_JOBS),
  async (req: Request, res: Response) => {
    try {
      const { acceptJob } = await import('../services/acceptWindow.service');
      const job = await AppDataSource.getRepository(PrintJob).findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      const result = await acceptJob(job.id);
      if (!result.accepted) {
        res.status(400).json({
          success: false,
          message: `Job cannot be accepted (${result.reason})`,
        });
        return;
      }
      await writeAudit(req, 'job.accepted', `job:${job.id}`, { code: job.code });
      res.json({ success: true, data: { status: PrintJobStatus.READY } });
    } catch (error: any) {
      console.error('Accept job error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to accept job' });
    }
  },
);

/**
 * POST /api/admin/jobs/:id/release — operator "one-tap print"
 * (V2-57). Marks a READY job RELEASING and binds it to the tenant's
 * first ACTIVE kiosk; the on-site agent polls /api/agent/jobs/ready
 * and silent-prints it via the kiosk-pull path. Same atomic
 * READY→RELEASING transition the kiosk code entry uses.
 */
router.post(
  '/jobs/:id/release',
  requirePermission(Permission.REQUEUE_JOBS),
  async (req: Request, res: Response) => {
    try {
      const jobRepo = AppDataSource.getRepository(PrintJob);
      const job = await jobRepo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      if (job.status !== PrintJobStatus.READY) {
        res.status(400).json({
          success: false,
          message: `Only READY jobs can be released (status: ${job.status})`,
          code: 'JOB_NOT_RELEASABLE',
        });
        return;
      }

      const kioskRepo = AppDataSource.getRepository(Kiosk);
      const kiosk = await kioskRepo
        .createQueryBuilder('k')
        .where('k.tenantId = :tenantId', { tenantId: req.tenant!.id })
        .andWhere('k.status = :active', { active: KioskStatus.ACTIVE })
        .orderBy('k.createdAt', 'ASC')
        .getOne();
      if (!kiosk) {
        res.status(409).json({
          success: false,
          message: 'No active kiosk for this shop — add one or check the fleet.',
          code: 'KIOSK_NO_PRINTER',
        });
        return;
      }

      const upd = await jobRepo
        .createQueryBuilder()
        .update(PrintJob)
        .set({ status: PrintJobStatus.RELEASING, kioskId: kiosk.id })
        .where('id = :id AND status = :ready', {
          id: job.id,
          ready: PrintJobStatus.READY,
        })
        .execute();
      if ((upd.affected ?? 0) !== 1) {
        res.status(409).json({
          success: false,
          message: 'Job is no longer releasable (already in flight).',
          code: 'JOB_NOT_RELEASABLE',
        });
        return;
      }

      await writeAudit(req, 'job.released', `job:${job.id}`, {
        code: job.code,
        kioskId: kiosk.id,
      });
      res.json({
        success: true,
        message: 'Released — the kiosk is printing it now.',
        data: { status: PrintJobStatus.RELEASING, kioskId: kiosk.id },
      });
    } catch (error: any) {
      console.error('Release job error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to release job' });
    }
  },
);

router.patch(
  '/jobs/:id/status',
  requirePermission(Permission.REQUEUE_JOBS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PrintJob);
      const where = req.tenant
        ? { id: req.params.id, tenantId: req.tenant.id }
        : { id: req.params.id };
      const job = await repo.findOne({ where });
      if (!job) {
        res.status(404).json({ success: false, message: 'Job not found' });
        return;
      }
      const next = String(req.body.status);
      if (!Object.values(PrintJobStatus).includes(next as PrintJobStatus)) {
        res.status(400).json({ success: false, message: 'Invalid status' });
        return;
      }
      const prev = job.status;
      job.status = next as PrintJobStatus;
      if (next === PrintJobStatus.DONE) job.completedAt = new Date();
      await repo.save(job);
      await writeAudit(req, 'job.status_changed', `job:${job.id}`, { from: prev, to: next });
      res.json({ success: true, data: { job } });
    } catch (error) {
      console.error('Update job status error:', error);
      res.status(500).json({ success: false, message: 'Failed to update job status' });
    }
  }
);

// ── Group sessions (admin viewer) ────────────────────────────────────────
router.get(
  '/group-sessions',
  requirePermission(Permission.VIEW_JOBS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(GroupSession);
      const sessions = await repo.find({
        where: req.tenant ? { tenantId: req.tenant.id } : {},
        order: { createdAt: 'DESC' },
        take: 100,
      });
      res.json({ success: true, data: { sessions } });
    } catch (error) {
      console.error('List group sessions error:', error);
      res.status(500).json({ success: false, message: 'Failed to list sessions' });
    }
  }
);

// ── Pricing ──────────────────────────────────────────────────────────────
router.get(
  '/pricing',
  requirePermission(Permission.VIEW_PRICING),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PricingConfig);
      const configs = await repo.find({
        where: req.tenant ? { tenantId: req.tenant.id } : {},
        order: { paperSize: 'ASC', colorType: 'ASC' },
      });
      res.json({ success: true, data: { configs } });
    } catch (error) {
      console.error('List pricing error:', error);
      res.status(500).json({ success: false, message: 'Failed to load pricing' });
    }
  }
);

router.patch(
  '/pricing/:id',
  requirePermission(Permission.MANAGE_PRICING),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PricingConfig);
      const where = req.tenant
        ? { id: req.params.id, tenantId: req.tenant.id }
        : { id: req.params.id };
      const config = await repo.findOne({ where });
      if (!config) {
        res.status(404).json({ success: false, message: 'Pricing config not found' });
        return;
      }
      const {
        pricePerPage,
        duplexMultiplier,
        highResolutionMultiplier,
        isActive,
        notes,
        // per-cell prices (nullable — sending `null` clears a cell so it
        // falls back to the legacy multiplier path)
        price100Simplex,
        price300Simplex,
        price600Simplex,
        price100Duplex,
        price300Duplex,
        price600Duplex,
      } = req.body;
      if (pricePerPage !== undefined) config.pricePerPage = pricePerPage;
      if (duplexMultiplier !== undefined) config.duplexMultiplier = duplexMultiplier;
      if (highResolutionMultiplier !== undefined) config.highResolutionMultiplier = highResolutionMultiplier;
      if (isActive !== undefined) config.isActive = isActive;
      if (notes !== undefined) config.notes = notes;
      if (price100Simplex !== undefined) config.price100Simplex = price100Simplex === null ? null : Number(price100Simplex);
      if (price300Simplex !== undefined) config.price300Simplex = price300Simplex === null ? null : Number(price300Simplex);
      if (price600Simplex !== undefined) config.price600Simplex = price600Simplex === null ? null : Number(price600Simplex);
      if (price100Duplex !== undefined) config.price100Duplex = price100Duplex === null ? null : Number(price100Duplex);
      if (price300Duplex !== undefined) config.price300Duplex = price300Duplex === null ? null : Number(price300Duplex);
      if (price600Duplex !== undefined) config.price600Duplex = price600Duplex === null ? null : Number(price600Duplex);
      await repo.save(config);
      await writeAudit(req, 'pricing.updated', `pricing:${config.id}`, req.body);
      res.json({ success: true, data: { config } });
    } catch (error) {
      console.error('Update pricing error:', error);
      res.status(500).json({ success: false, message: 'Failed to update pricing' });
    }
  }
);

router.post(
  '/pricing',
  requirePermission(Permission.MANAGE_PRICING),
  async (req: Request, res: Response) => {
    try {
      const {
        paperSize,
        colorType,
        pricePerPage,
        duplexMultiplier,
        highResolutionMultiplier,
        notes,
        price100Simplex,
        price300Simplex,
        price600Simplex,
        price100Duplex,
        price300Duplex,
        price600Duplex,
      } = req.body || {};

      if (!Object.values(PaperSize).includes(paperSize)) {
        res.status(400).json({ success: false, message: `paperSize must be one of: ${Object.values(PaperSize).join(', ')}` });
        return;
      }
      if (!Object.values(ColorType).includes(colorType)) {
        res.status(400).json({ success: false, message: `colorType must be one of: ${Object.values(ColorType).join(', ')}` });
        return;
      }

      const repo = AppDataSource.getRepository(PricingConfig);
      const tenantId = req.tenant?.id ?? null;
      const existingWhere = tenantId
        ? { tenantId, paperSize, colorType }
        : { paperSize, colorType };
      const existing = await repo.findOne({ where: existingWhere as any });
      if (existing) {
        res.status(409).json({ success: false, message: 'A config for this paper size + colour already exists' });
        return;
      }

      const config = repo.create({
        tenantId,
        paperSize,
        colorType,
        pricePerPage: Number(pricePerPage) || 0,
        duplexMultiplier: duplexMultiplier !== undefined ? Number(duplexMultiplier) : 1.0,
        highResolutionMultiplier:
          highResolutionMultiplier !== undefined ? Number(highResolutionMultiplier) : 1.0,
        isActive: true,
        currency: 'NGN',
        notes: notes ?? null,
        price100Simplex: price100Simplex != null ? Number(price100Simplex) : null,
        price300Simplex: price300Simplex != null ? Number(price300Simplex) : null,
        price600Simplex: price600Simplex != null ? Number(price600Simplex) : null,
        price100Duplex: price100Duplex != null ? Number(price100Duplex) : null,
        price300Duplex: price300Duplex != null ? Number(price300Duplex) : null,
        price600Duplex: price600Duplex != null ? Number(price600Duplex) : null,
      });
      const saved = await repo.save(config);
      await writeAudit(req, 'pricing.created', `pricing:${saved.id}`, { paperSize, colorType, pricePerPage });
      res.status(201).json({ success: true, data: { config: saved } });
    } catch (error) {
      console.error('Create pricing error:', error);
      res.status(500).json({ success: false, message: 'Failed to create pricing config' });
    }
  }
);

router.delete(
  '/pricing/:id',
  requirePermission(Permission.MANAGE_PRICING),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PricingConfig);
      const where = req.tenant
        ? { id: req.params.id, tenantId: req.tenant.id }
        : { id: req.params.id };
      const config = await repo.findOne({ where });
      if (!config) {
        res.status(404).json({ success: false, message: 'Pricing config not found' });
        return;
      }
      await repo.remove(config);
      await writeAudit(req, 'pricing.deleted', `pricing:${req.params.id}`, {
        paperSize: config.paperSize,
        colorType: config.colorType,
      });
      res.json({ success: true, message: 'Pricing config deleted' });
    } catch (error) {
      console.error('Delete pricing error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete pricing config' });
    }
  }
);

// ── Promotions ───────────────────────────────────────────────────────────
router.get(
  '/promotions',
  requirePermission(Permission.VIEW_PROMOTIONS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Promotion);
      const promotions = await repo.find({
        where: req.tenant ? { tenantId: req.tenant.id } : {},
        order: { createdAt: 'DESC' },
      });
      res.json({ success: true, data: { promotions } });
    } catch (error) {
      console.error('List promotions error:', error);
      res.status(500).json({ success: false, message: 'Failed to load promotions' });
    }
  }
);

router.post(
  '/promotions',
  requirePermission(Permission.MANAGE_PROMOTIONS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Promotion);
      // Normalize the code at write time so `applyPromotion` can use the
      // unique index on `code` directly (no UPPER() functional lookup).
      const body = { ...(req.body || {}) };
      if (typeof body.code === 'string') body.code = body.code.trim().toUpperCase();
      // Stamp tenant — promotions are scoped per-tenant (each tenant
      // runs their own promo codes).
      body.tenantId = req.tenant?.id ?? null;
      const promotion = repo.create(body as Partial<Promotion>);
      const saved = await repo.save(promotion);
      await writeAudit(req, 'promotion.created', `promotion:${(saved as any).id}`, body);
      res.status(201).json({ success: true, data: { promotion: saved } });
    } catch (error) {
      console.error('Create promotion error:', error);
      res.status(400).json({ success: false, message: 'Failed to create promotion' });
    }
  }
);

router.patch(
  '/promotions/:id',
  requirePermission(Permission.MANAGE_PROMOTIONS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Promotion);
      const where = req.tenant
        ? { id: req.params.id, tenantId: req.tenant.id }
        : { id: req.params.id };
      const promotion = await repo.findOne({ where });
      if (!promotion) {
        res.status(404).json({ success: false, message: 'Promotion not found' });
        return;
      }
      const body = { ...(req.body || {}) };
      if (typeof body.code === 'string') body.code = body.code.trim().toUpperCase();
      Object.assign(promotion, body);
      const saved = await repo.save(promotion);
      await writeAudit(req, 'promotion.updated', `promotion:${promotion.id}`, body);
      res.json({ success: true, data: { promotion: saved } });
    } catch (error) {
      console.error('Update promotion error:', error);
      res.status(400).json({ success: false, message: 'Failed to update promotion' });
    }
  }
);

// ── Transactions & refunds ───────────────────────────────────────────────
router.get(
  '/transactions',
  requirePermission(Permission.VIEW_TRANSACTIONS),
  async (req: Request, res: Response) => {
    try {
      const { method, status, userId, fromDate, toDate } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);

      const repo = AppDataSource.getRepository(Payment);
      const qb = repo.createQueryBuilder('p').leftJoinAndSelect('p.user', 'user');

      if (req.tenant) qb.andWhere('p.tenantId = :__tid', { __tid: req.tenant.id });
      if (method) qb.andWhere('p.method = :method', { method });
      if (status) qb.andWhere('p.status = :status', { status });
      if (userId) qb.andWhere('p.userId = :userId', { userId });
      if (fromDate) qb.andWhere('p.createdAt >= :fromDate', { fromDate });
      if (toDate) qb.andWhere('p.createdAt <= :toDate', { toDate });

      qb.orderBy('p.createdAt', 'DESC').skip(skip).take(limit);
      const [transactions, total] = await qb.getManyAndCount();
      const safeTx = transactions.map((t: any) => ({ ...t, user: scrubUser(t.user) }));
      res.json({
        success: true,
        data: { transactions: safeTx, total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('List transactions error:', error);
      res.status(500).json({ success: false, message: 'Failed to list transactions' });
    }
  }
);

// ── Blog (V2-54) ─────────────────────────────────────────────────────────
function slugify(input: string): string {
  return (
    String(input)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 140) || 'post'
  );
}

async function uniqueBlogSlug(
  repo: any,
  base: string,
  excludeId?: string,
): Promise<string> {
  const baseSlug = slugify(base);
  let candidate = baseSlug;
  let i = 2;
  for (;;) {
    const existing = await repo.findOne({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${baseSlug}-${i++}`;
  }
}

router.get(
  '/blog',
  requirePermission(Permission.MANAGE_BLOG),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(BlogPost);
      const posts = await repo.find({
        where: { tenantId: req.tenant!.id },
        order: { updatedAt: 'DESC' },
      });
      res.json({ success: true, data: posts });
    } catch (error: any) {
      console.error('List blog error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to list posts' });
    }
  },
);

router.post(
  '/blog',
  requirePermission(Permission.MANAGE_BLOG),
  async (req: Request, res: Response) => {
    try {
      const { title, excerpt, content, coverImageUrl, authorName, tags, status } = req.body || {};
      if (!title || !content) {
        res.status(400).json({ success: false, message: 'title and content are required' });
        return;
      }
      const repo = AppDataSource.getRepository(BlogPost);
      const post = repo.create({
        tenantId: req.tenant!.id,
        slug: await uniqueBlogSlug(repo, title),
        title: String(title).slice(0, 200),
        excerpt: excerpt ? String(excerpt).slice(0, 400) : null,
        content: String(content),
        coverImageUrl: coverImageUrl || null,
        authorName: authorName || null,
        tags: Array.isArray(tags) ? tags.slice(0, 10) : null,
        status: status === BlogPostStatus.PUBLISHED ? BlogPostStatus.PUBLISHED : BlogPostStatus.DRAFT,
        publishedAt:
          status === BlogPostStatus.PUBLISHED ? new Date() : null,
      });
      await repo.save(post);
      await writeAudit(req, 'blog.created', `post:${post.id}`, { slug: post.slug, title: post.title });
      res.status(201).json({ success: true, data: post });
    } catch (error: any) {
      console.error('Create blog error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to create post' });
    }
  },
);

router.patch(
  '/blog/:id',
  requirePermission(Permission.MANAGE_BLOG),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(BlogPost);
      const post = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!post) {
        res.status(404).json({ success: false, message: 'Post not found' });
        return;
      }
      const { title, excerpt, content, coverImageUrl, authorName, tags, status } = req.body || {};
      const wasPublished = post.status === BlogPostStatus.PUBLISHED;
      if (title) post.title = String(title).slice(0, 200);
      if (excerpt !== undefined) post.excerpt = excerpt ? String(excerpt).slice(0, 400) : null;
      if (content !== undefined) post.content = String(content);
      if (coverImageUrl !== undefined) post.coverImageUrl = coverImageUrl || null;
      if (authorName !== undefined) post.authorName = authorName || null;
      if (tags !== undefined) post.tags = Array.isArray(tags) ? tags.slice(0, 10) : null;
      if (status === BlogPostStatus.PUBLISHED && !wasPublished) {
        post.status = BlogPostStatus.PUBLISHED;
        post.publishedAt = post.publishedAt ?? new Date();
      } else if (status === BlogPostStatus.DRAFT) {
        post.status = BlogPostStatus.DRAFT;
        post.publishedAt = null;
      }
      await repo.save(post);
      await writeAudit(req, 'blog.updated', `post:${post.id}`, { slug: post.slug, title: post.title });
      res.json({ success: true, data: post });
    } catch (error: any) {
      console.error('Update blog error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to update post' });
    }
  },
);

router.delete(
  '/blog/:id',
  requirePermission(Permission.MANAGE_BLOG),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(BlogPost);
      const post = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!post) {
        res.status(404).json({ success: false, message: 'Post not found' });
        return;
      }
      await repo.remove(post);
      await writeAudit(req, 'blog.deleted', `post:${post.id}`, { slug: post.slug });
      res.json({ success: true, message: 'Post deleted' });
    } catch (error: any) {
      console.error('Delete blog error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to delete post' });
    }
  },
);

// ── Printer profiles (V2-56) ────────────────────────────────────────────
const PAPER_SIZES = ['A4', 'A3', 'LETTER', 'LEGAL'];
const DPI_CHOICES = [100, 300, 600];

function sanitizeCapabilities(raw: any): PrinterCapabilities | null {
  const maxDpi = DPI_CHOICES.includes(Number(raw?.maxDpi))
    ? (Number(raw?.maxDpi) as 100 | 300 | 600)
    : null;
  const colorMode = raw?.colorMode === 'bw' ? 'bw' : raw?.colorMode === 'color' ? 'color' : null;
  const paperSize = PAPER_SIZES.includes(String(raw?.paperSize).toUpperCase())
    ? (String(raw?.paperSize).toUpperCase() as PrinterCapabilities['paperSize'])
    : null;
  if (maxDpi == null || colorMode == null) return null;
  return {
    maxDpi,
    colorMode,
    paperSize,
    duplex: Boolean(raw?.duplex),
  };
}

async function clearOtherDefaults(
  repo: any,
  tenantId: string,
  excludeId?: string,
): Promise<void> {
  await repo
    .createQueryBuilder()
    .update(PrinterProfile)
    .set({ isDefault: false })
    .where('tenantId = :tenantId AND id != :id', {
      tenantId,
      id: excludeId ?? '00000000-0000-0000-0000-000000000000',
    })
    .execute();
}

router.get(
  '/printer-profiles',
  requirePermission(Permission.MANAGE_KIOSKS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PrinterProfile);
      const profiles = await repo.find({
        where: { tenantId: req.tenant!.id },
        order: { isDefault: 'DESC', createdAt: 'ASC' },
      });
      res.json({ success: true, data: profiles });
    } catch (error: any) {
      console.error('List printer profiles error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to list printer profiles' });
    }
  },
);

router.post(
  '/printer-profiles',
  requirePermission(Permission.MANAGE_KIOSKS),
  async (req: Request, res: Response) => {
    try {
      const { displayName, ippUri, driverKind, isDefault, capabilities } = req.body || {};
      if (!displayName) {
        res.status(400).json({ success: false, message: 'displayName is required' });
        return;
      }
      const caps = sanitizeCapabilities(capabilities);
      if (!caps) {
        res.status(400).json({
          success: false,
          message: 'capabilities.maxDpi (100|300|600) and capabilities.colorMode (bw|color) are required',
        });
        return;
      }
      const repo = AppDataSource.getRepository(PrinterProfile);
      if (isDefault) await clearOtherDefaults(repo, req.tenant!.id);
      const profile = await repo.save(
        repo.create({
          tenantId: req.tenant!.id,
          displayName: String(displayName).slice(0, 120),
          ippUri: ippUri || null,
          driverKind: String(driverKind || 'unknown').slice(0, 20),
          capabilities: caps,
          isDefault: Boolean(isDefault),
        }),
      );
      await writeAudit(req, 'printer_profile.created', `profile:${profile.id}`, {
        displayName: profile.displayName,
      });
      res.status(201).json({ success: true, data: profile });
    } catch (error: any) {
      console.error('Create printer profile error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to create printer profile' });
    }
  },
);

router.patch(
  '/printer-profiles/:id',
  requirePermission(Permission.MANAGE_KIOSKS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PrinterProfile);
      const profile = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!profile) {
        res.status(404).json({ success: false, message: 'Printer profile not found' });
        return;
      }
      const { displayName, ippUri, driverKind, isDefault, isActive, capabilities } =
        req.body || {};
      if (displayName !== undefined) profile.displayName = String(displayName).slice(0, 120);
      if (ippUri !== undefined) profile.ippUri = ippUri || null;
      if (driverKind !== undefined) profile.driverKind = String(driverKind).slice(0, 20);
      if (isActive !== undefined) profile.isActive = Boolean(isActive);
      if (capabilities) {
        const caps = sanitizeCapabilities(capabilities);
        if (!caps) {
          res.status(400).json({ success: false, message: 'Invalid capabilities' });
          return;
        }
        profile.capabilities = caps;
      }
      if (isDefault) {
        await clearOtherDefaults(repo, req.tenant!.id, profile.id);
        profile.isDefault = true;
      } else if (isDefault === false && profile.isDefault) {
        // Don't silently remove the last default; just allow it.
        profile.isDefault = false;
      }
      await repo.save(profile);
      await writeAudit(req, 'printer_profile.updated', `profile:${profile.id}`, {
        displayName: profile.displayName,
      });
      res.json({ success: true, data: profile });
    } catch (error: any) {
      console.error('Update printer profile error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to update printer profile' });
    }
  },
);

router.delete(
  '/printer-profiles/:id',
  requirePermission(Permission.MANAGE_KIOSKS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PrinterProfile);
      const profile = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!profile) {
        res.status(404).json({ success: false, message: 'Printer profile not found' });
        return;
      }
      await repo.remove(profile);
      await writeAudit(req, 'printer_profile.deleted', `profile:${profile.id}`, {
        displayName: profile.displayName,
      });
      res.json({ success: true, message: 'Printer profile deleted' });
    } catch (error: any) {
      console.error('Delete printer profile error:', error?.message);
      res.status(500).json({ success: false, message: 'Failed to delete printer profile' });
    }
  },
);

// ── Users ────────────────────────────────────────────────────────────────
router.get(
  '/users',
  requirePermission(Permission.VIEW_USERS),
  async (req: Request, res: Response) => {
    try {
      const { search } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);

      const repo = AppDataSource.getRepository(User);
      const qb = repo.createQueryBuilder('u');

      if (req.tenant) qb.andWhere('u.tenantId = :__tid', { __tid: req.tenant.id });
      if (search) {
        qb.where(
          '(LOWER(u.email) LIKE :q OR LOWER(u.firstName) LIKE :q OR LOWER(u.lastName) LIKE :q OR u.phoneNumber LIKE :p)',
          { q: `%${search.toLowerCase()}%`, p: `%${search}%` }
        );
      }

      qb.orderBy('u.createdAt', 'DESC').skip(skip).take(limit);
      const [users, total] = await qb.getManyAndCount();
      res.json({
        success: true,
        data: { users: users.map(scrubUser), total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({ success: false, message: 'Failed to list users' });
    }
  }
);

router.get(
  '/users/:id',
  requirePermission(Permission.VIEW_USERS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(User);
      const userWhere = req.tenant
        ? { id: req.params.id, tenantId: req.tenant.id }
        : { id: req.params.id };
      const user = await repo.findOne({ where: userWhere });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const jobRepo = AppDataSource.getRepository(PrintJob);
      const paymentRepo = AppDataSource.getRepository(Payment);

      const tid = req.tenant?.id;
      const [totalJobs, spent, recentJobs] = await Promise.all([
        jobRepo.count({ where: tid ? { userId: user.id, tenantId: tid } : { userId: user.id } }),
        (() => {
          const qb = paymentRepo
            .createQueryBuilder('p')
            .select('COALESCE(SUM(p.amount), 0)', 'total')
            .where('p.userId = :id AND p.status = :s', { id: user.id, s: 'SUCCESS' });
          if (tid) qb.andWhere('p.tenantId = :tid', { tid });
          return qb.getRawOne();
        })(),
        jobRepo.find({
          where: tid ? { userId: user.id, tenantId: tid } : { userId: user.id },
          order: { createdAt: 'DESC' },
          take: 10,
        }),
      ]);

      res.json({
        success: true,
        data: {
          user: scrubUser(user),
          stats: { totalJobs, totalSpent: parseFloat(spent?.total || '0') },
          recentJobs,
        },
      });
    } catch (error) {
      console.error('Load user error:', error);
      res.status(500).json({ success: false, message: 'Failed to load user' });
    }
  }
);

router.patch(
  '/users/:id/block',
  requirePermission(Permission.BLOCK_USERS),
  async (req: Request, res: Response) => {
    try {
      const { isBlocked, reason } = req.body || {};
      const repo = AppDataSource.getRepository(User);
      const userWhere = req.tenant
        ? { id: req.params.id, tenantId: req.tenant.id }
        : { id: req.params.id };
      const user = await repo.findOne({ where: userWhere });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      user.isBlocked = !!isBlocked;
      user.blockReason = isBlocked ? reason || null : null;
      await repo.save(user);
      await writeAudit(req, isBlocked ? 'user.blocked' : 'user.unblocked', `user:${user.id}`, { reason });
      res.json({ success: true, message: `User ${isBlocked ? 'blocked' : 'unblocked'}` });
    } catch (error) {
      console.error('Block user error:', error);
      res.status(500).json({ success: false, message: 'Failed to update user' });
    }
  }
);

router.patch(
  '/users/:id/role',
  requirePermission(Permission.MANAGE_USERS),
  async (req: Request, res: Response) => {
    try {
      const { role } = req.body || {};
      if (![UserRole.USER, UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(role)) {
        res.status(400).json({ success: false, message: 'Invalid role' });
        return;
      }
      const repo = AppDataSource.getRepository(User);
      const userWhere = req.tenant
        ? { id: req.params.id, tenantId: req.tenant.id }
        : { id: req.params.id };
      const user = await repo.findOne({ where: userWhere });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const prev = user.role;
      user.role = role;
      // Reset privileges when changing role tier (super admin needs none).
      user.adminPrivileges = role === UserRole.ADMIN ? user.adminPrivileges || [] : [];
      await repo.save(user);
      await writeAudit(req, 'user.role_changed', `user:${user.id}`, { from: prev, to: role });
      res.json({ success: true, data: { user: scrubUser(user) } });
    } catch (error) {
      console.error('Set user role error:', error);
      res.status(500).json({ success: false, message: 'Failed to update role' });
    }
  }
);

router.patch(
  '/users/:id/privileges',
  requirePermission(Permission.MANAGE_ROLES),
  async (req: Request, res: Response) => {
    try {
      const { privileges } = req.body || {};
      if (!Array.isArray(privileges)) {
        res.status(400).json({ success: false, message: 'privileges must be an array' });
        return;
      }
      const repo = AppDataSource.getRepository(User);
      const userWhere = req.tenant
        ? { id: req.params.id, tenantId: req.tenant.id }
        : { id: req.params.id };
      const user = await repo.findOne({ where: userWhere });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      if (user.role === UserRole.USER) {
        res.status(400).json({ success: false, message: 'User is not an admin' });
        return;
      }
      user.adminPrivileges = privileges;
      await repo.save(user);
      await writeAudit(req, 'user.privileges_changed', `user:${user.id}`, { privileges });
      res.json({ success: true, data: { user: scrubUser(user) } });
    } catch (error) {
      console.error('Set user privileges error:', error);
      res.status(500).json({ success: false, message: 'Failed to update privileges' });
    }
  }
);

// ── Reports ──────────────────────────────────────────────────────────────
router.get(
  '/reports/revenue',
  requirePermission(Permission.EXPORT_REPORTS),
  async (req: Request, res: Response) => {
    try {
      const { fromDate, toDate, format = 'json', days } = req.query as Record<string, string>;
      const repo = AppDataSource.getRepository(Payment);
      const qb = repo
        .createQueryBuilder('p')
        .select('DATE(p.createdAt)', 'date')
        .addSelect('COUNT(*)', 'transactions')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'revenue')
        .where('p.status = :s', { s: 'SUCCESS' });

      if (days) {
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));
        qb.andWhere('p.createdAt >= :since', { since });
      }
      if (fromDate) qb.andWhere('p.createdAt >= :fromDate', { fromDate });
      if (toDate) qb.andWhere('p.createdAt <= :toDate', { toDate });

      qb.groupBy('DATE(p.createdAt)').orderBy('DATE(p.createdAt)', 'ASC');
      const rows = await qb.getRawMany();

      if (format === 'csv') {
        const csv =
          'Date,Transactions,Revenue\n' +
          rows.map((r) => `${r.date},${r.transactions},${r.revenue}`).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="revenue-report.csv"');
        res.send(csv);
        return;
      }

      const summary = rows.reduce(
        (acc, r) => {
          acc.totalRevenue += parseFloat(r.revenue || '0');
          acc.totalTransactions += parseInt(r.transactions || '0');
          return acc;
        },
        { totalRevenue: 0, totalTransactions: 0 }
      );
      res.json({ success: true, data: { rows, summary } });
    } catch (error) {
      console.error('Revenue report error:', error);
      res.status(500).json({ success: false, message: 'Failed to generate report' });
    }
  }
);

router.get(
  '/reports/kiosks',
  requirePermission(Permission.VIEW_REPORTS),
  async (_req: Request, res: Response) => {
    try {
      const jobRepo = AppDataSource.getRepository(PrintJob);
      const rows = await jobRepo
        .createQueryBuilder('j')
        .select('j.kioskId', 'kioskId')
        .addSelect('COUNT(*)', 'totalJobs')
        .addSelect('COALESCE(SUM(j.totalPages), 0)', 'totalPages')
        .addSelect('COALESCE(SUM(j.cost), 0)', 'revenue')
        .groupBy('j.kioskId')
        .getRawMany();
      res.json({ success: true, data: { kiosks: rows } });
    } catch (error) {
      console.error('Kiosk report error:', error);
      res.status(500).json({ success: false, message: 'Failed to generate report' });
    }
  }
);

// ── System settings ──────────────────────────────────────────────────────
router.get(
  '/settings',
  requirePermission(Permission.VIEW_SETTINGS),
  async (_req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(SystemSetting);
      const settings = await repo.find({ order: { category: 'ASC', key: 'ASC' } });
      res.json({ success: true, data: { settings } });
    } catch (error) {
      console.error('List settings error:', error);
      res.status(500).json({ success: false, message: 'Failed to load settings' });
    }
  }
);

router.patch(
  '/settings/:key',
  requirePermission(Permission.MANAGE_SETTINGS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(SystemSetting);
      const setting = await repo.findOne({ where: { key: req.params.key } });
      if (!setting) {
        res.status(404).json({ success: false, message: 'Setting not found' });
        return;
      }
      if (setting.isReadOnly) {
        res.status(403).json({ success: false, message: 'Setting is read-only' });
        return;
      }
      setting.value = String(req.body.value);
      await repo.save(setting);
      await writeAudit(req, 'setting.updated', `setting:${setting.key}`, { value: setting.value });
      res.json({ success: true, data: { setting } });
    } catch (error) {
      console.error('Update setting error:', error);
      res.status(500).json({ success: false, message: 'Failed to update setting' });
    }
  }
);

// ── Audit log viewer ─────────────────────────────────────────────────────
router.get(
  '/audit-logs',
  requirePermission(Permission.VIEW_AUDIT_LOG),
  async (req: Request, res: Response) => {
    try {
      const { actorId, action, fromDate, toDate } = req.query as Record<string, string>;
      const { page, limit, skip } = paginate(req.query);

      const repo = AppDataSource.getRepository(AuditLog);
      const qb = repo.createQueryBuilder('log');

      if (actorId) qb.andWhere('log.actorId = :actorId', { actorId });
      if (action) qb.andWhere('log.action = :action', { action });
      if (fromDate) qb.andWhere('log.createdAt >= :fromDate', { fromDate });
      if (toDate) qb.andWhere('log.createdAt <= :toDate', { toDate });

      qb.orderBy('log.createdAt', 'DESC').skip(skip).take(limit);
      const [logs, total] = await qb.getManyAndCount();
      res.json({
        success: true,
        data: { logs, total, page, limit, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('List audit logs error:', error);
      res.status(500).json({ success: false, message: 'Failed to load audit logs' });
    }
  }
);

export default router;
