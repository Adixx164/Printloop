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
import { Wallet } from '../entities/wallet.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';

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
  async (_req: Request, res: Response) => {
    try {
      const stats = await dashboardService.getStats();
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
      const job = await repo.findOne({ where: { id: req.params.id } });
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

router.patch(
  '/jobs/:id/status',
  requirePermission(Permission.REQUEUE_JOBS),
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PrintJob);
      const job = await repo.findOne({ where: { id: req.params.id } });
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
  async (_req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(GroupSession);
      const sessions = await repo.find({ order: { createdAt: 'DESC' }, take: 100 });
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
  async (_req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(PricingConfig);
      const configs = await repo.find({ order: { paperSize: 'ASC', colorType: 'ASC' } });
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
      const config = await repo.findOne({ where: { id: req.params.id } });
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
      const existing = await repo.findOne({ where: { paperSize, colorType } });
      if (existing) {
        res.status(409).json({ success: false, message: 'A config for this paper size + colour already exists' });
        return;
      }

      const config = repo.create({
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
      const config = await repo.findOne({ where: { id: req.params.id } });
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
  async (_req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Promotion);
      const promotions = await repo.find({ order: { createdAt: 'DESC' } });
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
      const promotion = await repo.findOne({ where: { id: req.params.id } });
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

router.post(
  '/refunds',
  requirePermission(Permission.ISSUE_REFUNDS),
  async (req: Request, res: Response) => {
    try {
      const { paymentId, amount, reason, refundType = 'WALLET' } = req.body || {};
      const paymentRepo = AppDataSource.getRepository(Payment);
      const payment = await paymentRepo.findOne({ where: { id: paymentId } });

      if (!payment) {
        res.status(404).json({ success: false, message: 'Payment not found' });
        return;
      }
      if (payment.status !== 'SUCCESS') {
        res.status(400).json({ success: false, message: 'Can only refund successful payments' });
        return;
      }
      if (payment.refundedAt) {
        res.status(400).json({ success: false, message: 'Payment already refunded' });
        return;
      }

      const refundAmount = Number(amount) || Number(payment.amount);
      if (refundAmount > Number(payment.amount)) {
        res.status(400).json({ success: false, message: 'Refund exceeds original payment' });
        return;
      }

      if (refundType === 'WALLET') {
        const walletRepo = AppDataSource.getRepository(Wallet);
        const txRepo = AppDataSource.getRepository(Transaction);
        const wallet = await walletRepo.findOne({ where: { userId: payment.userId } });
        if (!wallet) {
          res.status(404).json({ success: false, message: 'User wallet not found' });
          return;
        }
        wallet.balance = Number(wallet.balance) + refundAmount;
        await walletRepo.save(wallet);
        await txRepo.save(
          txRepo.create({
            walletId: wallet.id,
            type: TransactionType.REFUND,
            amount: refundAmount,
            description: `Refund: ${reason || 'admin refund'}`,
            balanceAfter: wallet.balance,
            reference: payment.reference,
          } as any)
        );
      }

      payment.refundedAt = new Date();
      payment.refundReason = reason || null;
      payment.refundAmount = refundAmount;
      payment.refundType = refundType;
      payment.refundedBy = req.admin?.id || null;
      await paymentRepo.save(payment);

      await writeAudit(req, 'refund.issued', `payment:${payment.id}`, { refundAmount, refundType, reason });
      res.json({
        success: true,
        message: refundType === 'WALLET' ? 'Wallet refund issued' : 'Bank refund recorded',
        data: { refundAmount, refundType },
      });
    } catch (error) {
      console.error('Refund error:', error);
      res.status(500).json({ success: false, message: 'Refund failed' });
    }
  }
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
      const user = await repo.findOne({ where: { id: req.params.id } });
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      const jobRepo = AppDataSource.getRepository(PrintJob);
      const paymentRepo = AppDataSource.getRepository(Payment);

      const [totalJobs, spent, recentJobs] = await Promise.all([
        jobRepo.count({ where: { userId: user.id } }),
        paymentRepo
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.userId = :id AND p.status = :s', { id: user.id, s: 'SUCCESS' })
          .getRawOne(),
        jobRepo.find({ where: { userId: user.id }, order: { createdAt: 'DESC' }, take: 10 }),
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
      const user = await repo.findOne({ where: { id: req.params.id } });
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
      const user = await repo.findOne({ where: { id: req.params.id } });
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
      const user = await repo.findOne({ where: { id: req.params.id } });
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
