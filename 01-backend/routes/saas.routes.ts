import { Request, Response, Router } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { saveBuffer } from '../utils/fileStore.js';
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotp,
} from '../utils/totp';
import { PayoutSchedule } from '../entities/payoutSchedule.entity';
import { Payout, PayoutTrigger, PayoutStatus } from '../entities/payout.entity';
import { Transaction } from '../entities/transaction.entity';
import {
  signupTenant,
  verifyOwnerEmail,
  resendOwnerVerification,
  SlugUnavailableError,
  EmailTakenError,
  ValidationError,
} from '../services/onboarding.service';
import {
  getAvailableBalance,
  initiatePayout,
} from '../services/payout.service';
import { PaystackService } from '../services/paystack.service';
import { KioskService } from '../services/kiosk.service';
import { authenticate } from '../middleware/auth.middleware';
import { resolveTenant } from '../middleware/tenant.middleware';
import { requireVerifiedEmail } from '../middleware/verifiedEmail.middleware';
import editorRoutes from './editor.routes';

const router = Router();
const paystack = new PaystackService();
const kioskService = new KioskService();
const INSTANT_PAYOUT_FEE_NAIRA = 100;

/**
 * Public projection of a kiosk for the tenant operator console.
 * Never leaks the apiKey on reads — it's disclosed only on create /
 * regenerate (the pairing moments).
 */
function publicKiosk(k: Kiosk) {
  const ONLINE_MS = 5 * 60 * 1000;
  const online =
    k.status === KioskStatus.ACTIVE &&
    k.lastSeenAt &&
    Date.now() - new Date(k.lastSeenAt).getTime() < ONLINE_MS;
  return {
    id: k.id,
    name: k.name,
    location: k.location ?? null,
    printerName: k.printerName ?? null,
    status: k.status,
    online: Boolean(online),
    lastSeenAt: k.lastSeenAt ?? null,
    testPrintPassedAt: k.testPrintPassedAt ?? null,
    totalJobsPrinted: k.totalJobsPrinted ?? 0,
    // V2-44 — agent-discovered hardware capabilities (null = unknown).
    capColor: k.capColor ?? null,
    capDuplex: k.capDuplex ?? null,
    capA3: k.capA3 ?? null,
    capUpdatedAt: k.capUpdatedAt ?? null,
    createdAt: k.createdAt,
  };
}

/**
 * Load a kiosk and assert it belongs to the resolved tenant. Returns
 * the kiosk, or null when it doesn't exist OR isn't this tenant's —
 * callers respond 404 either way so a tenant can't probe foreign IDs.
 */
async function ownedKiosk(req: Request, id: string): Promise<Kiosk | null> {
  return kioskService.getKioskById(id, req.tenant!.id);
}

/**
 * POST /api/saas/signup
 *
 * Self-serve tenant creation. Anonymous — no auth header.
 *
 * Body:
 *   { businessName, slug, ownerFirstName, ownerLastName,
 *     ownerEmail, ownerPhone, ownerPassword }
 *
 * Returns: { tenantId, tenantSlug, ownerEmail, loginUrl }
 *
 * On success the owner can immediately log in via
 * POST /api/customer/auth/login (or /api/admin/auth/login) against
 * the tenant subdomain.
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const result = await signupTenant({
      businessName: req.body?.businessName,
      slug: req.body?.slug,
      ownerFirstName: req.body?.ownerFirstName,
      ownerLastName: req.body?.ownerLastName,
      ownerEmail: req.body?.ownerEmail,
      ownerPhone: req.body?.ownerPhone,
      ownerPassword: req.body?.ownerPassword,
      address: req.body?.address,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof SlugUnavailableError) {
      res.status(409).json({
        success: false,
        message: err.message,
        code: 'SLUG_TAKEN',
      });
      return;
    }
    if (err instanceof EmailTakenError) {
      res.status(409).json({
        success: false,
        message: err.message,
        code: 'EMAIL_TAKEN',
      });
      return;
    }
    console.error('Signup error:', err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Signup failed',
    });
  }
});

/**
 * POST /api/saas/check-slug
 *
 * Live availability check while the owner types. Returns
 * { available: boolean, reason?: string } — no error states.
 */
router.post('/check-slug', async (req: Request, res: Response) => {
  const slug = String(req.body?.slug || '').toLowerCase().trim();
  if (!slug) {
    res.json({ available: false, reason: 'empty' });
    return;
  }
  if (!/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) {
    res.json({ available: false, reason: 'invalid-format' });
    return;
  }
  const existing = await AppDataSource.getRepository(Tenant).findOne({
    where: { slug },
  });
  res.json({ available: !existing });
});

/**
 * POST /api/saas/verify-email
 *
 * Anonymous. Body: { token, email? }. The email is optional but
 * recommended — it narrows the lookup so a guessed 6-digit token
 * has to coincide with a known address to land. Returns
 * { verified: boolean, tenantSlug? } so the frontend can redirect
 * to the right subdomain.
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token || '').trim();
    const email = req.body?.email
      ? String(req.body.email).trim()
      : undefined;
    const result = await verifyOwnerEmail({ token, email });
    if (!result.verified) {
      res
        .status(400)
        .json({ success: false, message: 'Invalid or expired token' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('Verify-email error:', err);
    res
      .status(500)
      .json({ success: false, message: err?.message || 'Verification failed' });
  }
});

/**
 * POST /api/saas/resend-verification
 *
 * Anonymous. Body: { email, tenantSlug? }. Re-issues the token
 * (the previous one becomes invalid) and resends the email. Always
 * 200 — we don't tell the caller whether the email matches a known
 * account, to avoid leaking which addresses are signed up.
 */
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim();
    const tenantSlug = req.body?.tenantSlug
      ? String(req.body.tenantSlug).trim()
      : undefined;
    if (!email) {
      res.status(400).json({ success: false, message: 'email is required' });
      return;
    }
    await resendOwnerVerification({ email, tenantSlug });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Resend-verification error:', err);
    // Still 200 to the client — don't leak which addresses exist.
    res.json({ success: true });
  }
});

/**
 * POST /api/saas/setup/paystack-subaccount
 *
 * Creates a Paystack Subaccount for the resolved tenant and stores
 * the returned subaccount_code on tenant.paystackSubaccountCode.
 * After this, customer charges use Paystack Split automatically.
 *
 * Auth: tenant owner only.
 * Body: { businessName, settlementBank, accountNumber, percentageCharge? }
 */
router.post(
  '/setup/paystack-subaccount',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { businessName, settlementBank, accountNumber, percentageCharge } =
        req.body || {};
      if (!businessName || !settlementBank || !accountNumber) {
        res.status(400).json({
          success: false,
          message: 'businessName, settlementBank, accountNumber are required',
        });
        return;
      }
      const created = await paystack.createSubaccount({
        businessName,
        settlementBank,
        accountNumber,
        percentageCharge,
      });
      tenant.paystackSubaccountCode = created.subaccountCode;
      await AppDataSource.getRepository(Tenant).save(tenant);
      res.json({
        success: true,
        data: {
          subaccountCode: created.subaccountCode,
          accountName: created.accountName,
        },
      });
    } catch (err: any) {
      console.error('Subaccount setup error:', err?.response?.data || err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Subaccount setup failed',
      });
    }
  },
);

/**
 * POST /api/saas/setup/bank-account
 *
 * Creates a Paystack Transfer Recipient for the tenant's payout
 * destination. Stores recipientCode + bank fields on PayoutSchedule
 * (which was seeded at signup with the default weekly cadence).
 *
 * Auth: tenant owner only.
 * Body: { accountName, accountNumber, bankCode }
 */
router.post(
  '/setup/bank-account',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { accountName, accountNumber, bankCode } = req.body || {};
      if (!accountName || !accountNumber || !bankCode) {
        res.status(400).json({
          success: false,
          message: 'accountName, accountNumber, bankCode are required',
        });
        return;
      }
      const { recipientCode } = await paystack.createTransferRecipient({
        name: accountName,
        accountNumber,
        bankCode,
      });
      const scheduleRepo = AppDataSource.getRepository(PayoutSchedule);
      let schedule = await scheduleRepo.findOne({
        where: { tenantId: tenant.id },
      });
      if (!schedule) {
        // Defensive — signup seeds one, but if the row was deleted we
        // recreate it with default cadence.
        schedule = scheduleRepo.create({
          tenantId: tenant.id,
        });
      }
      schedule.accountName = accountName;
      schedule.accountNumber = accountNumber;
      schedule.bankCode = bankCode;
      schedule.recipientCode = recipientCode;
      await scheduleRepo.save(schedule);
      res.json({
        success: true,
        data: { recipientCode, accountName, bankCode },
      });
    } catch (err: any) {
      console.error('Bank account setup error:', err?.response?.data || err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Bank account setup failed',
      });
    }
  },
);

/**
 * GET /api/saas/me
 *
 * Returns the resolved tenant's public-facing config: name, slug,
 * commission %, payout cadence, onboarding completion flags. Used by
 * the tenant admin dashboard to render a "next steps" checklist.
 */
router.get(
  '/me',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const { TenantBranding } = await import('../entities/tenantBranding.entity');
    const [schedule, branding] = await Promise.all([
      AppDataSource.getRepository(PayoutSchedule).findOne({
        where: { tenantId: tenant.id },
      }),
      AppDataSource.getRepository(TenantBranding).findOne({
        where: { tenantId: tenant.id },
      }),
    ]);
    // "Branding done" = the owner saved anything that visibly changes the
    // shop (wordmark, logo, or a brand colour). V2-41 — replaces the
    // hard-coded `false` the operator console used to show.
    const brandingSet = Boolean(
      branding &&
        (branding.wordmark ||
          branding.logoUrl ||
          branding.primaryColor),
    );
    res.json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        commissionPct: Number(tenant.commissionPct),
        customDomain: tenant.customDomain,
        // Marketplace discovery (V2-30).
        address: tenant.address,
        lat: tenant.lat,
        lng: tenant.lng,
        isDiscoverable: Boolean(tenant.isDiscoverable),
        // Operator-controlled availability (V2-57): open | busy | closed.
        availability: tenant.availability,
        onboarding: {
          subaccountSet: Boolean(tenant.paystackSubaccountCode),
          bankAccountSet: Boolean(schedule?.recipientCode),
          brandingSet,
          // The marketplace "ready" gate isn't strictly checked anywhere;
          // surfaced so the UI can show a setup checklist for it.
          locationSet: Boolean(tenant.lat != null && tenant.lng != null),
        },
        payoutSchedule: schedule
          ? {
              cadence: schedule.cadence,
              dayOfWeek: schedule.dayOfWeek,
              minPayoutAmount: Number(schedule.minPayoutAmount),
              accountName: schedule.accountName,
              accountNumber: schedule.accountNumber,
              bankCode: schedule.bankCode,
            }
          : null,
      },
    });
  },
);

/**
 * GET /api/saas/ops/summary  (V2-39 — turnkey operator console)
 *
 * The "how's my shop doing today" snapshot a non-technical shop owner
 * sees on the operator console: kiosk fleet health (online/offline,
 * test-print status), today's job volume + revenue, in-flight jobs,
 * stuck renders, and the marketplace live-gate state. One query bundle,
 * no developer required.
 */
router.get(
  '/ops/summary',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const now = Date.now();
      const ONLINE_MS = 5 * 60 * 1000;
      const STUCK_MS = 10 * 60 * 1000;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { PrintJob, PrintJobStatus } = await import(
        '../entities/printJob.entity'
      );
      const kioskRepo = AppDataSource.getRepository(Kiosk);
      const jobRepo = AppDataSource.getRepository(PrintJob);
      const txRepo = AppDataSource.getRepository(Transaction);

      const [kiosks, jobsToday, activeJobs, stuckList, revenueRow] =
        await Promise.all([
          kioskRepo.find({ where: { tenantId: tenant.id } }),
          jobRepo
            .createQueryBuilder('j')
            .where('j.tenantId = :tid', { tid: tenant.id })
            .andWhere('j.createdAt >= :s', { s: startOfToday.toISOString() })
            .getCount(),
          jobRepo
            .createQueryBuilder('j')
            .where('j.tenantId = :tid', { tid: tenant.id })
            .andWhere('j.status IN (:...st)', {
              st: [
                PrintJobStatus.RENDERING,
                PrintJobStatus.READY,
                PrintJobStatus.RELEASING,
                PrintJobStatus.PRINTING,
              ],
            })
            .getCount(),
          jobRepo
            .createQueryBuilder('j')
            .where('j.tenantId = :tid', { tid: tenant.id })
            .andWhere('j.status = :r', { r: PrintJobStatus.RENDERING })
            .getMany(),
          txRepo
            .createQueryBuilder('tx')
            .select(`COALESCE(SUM(CAST(tx.amount AS REAL)), 0)`, 'gross')
            .addSelect(
              `COALESCE(SUM(CAST(tx.commissionAmount AS REAL)), 0)`,
              'commission',
            )
            .where('tx.tenantId = :tid', { tid: tenant.id })
            .andWhere('tx.createdAt >= :s', { s: startOfToday.toISOString() })
            .getRawOne<{ gross: string; commission: string }>(),
        ]);

      const kioskRows = kiosks.map((k) => {
        const online =
          k.status === KioskStatus.ACTIVE &&
          k.lastSeenAt &&
          now - new Date(k.lastSeenAt).getTime() < ONLINE_MS;
        return {
          id: k.id,
          name: k.name,
          location: k.location ?? null,
          printerName: k.printerName ?? null,
          status: k.status,
          online: Boolean(online),
          lastSeenAt: k.lastSeenAt ?? null,
          testPrintPassedAt: k.testPrintPassedAt ?? null,
          totalJobsPrinted: k.totalJobsPrinted ?? 0,
        };
      });

      const onlineCount = kioskRows.filter((k) => k.online).length;
      const testPrintReady = kioskRows.some((k) => k.testPrintPassedAt);
      const stuckRenders = stuckList.filter(
        (j) => now - new Date(j.createdAt).getTime() > STUCK_MS,
      ).length;

      // Live-gate echo so the console can show "what's left before
      // customers can find you" without re-deriving the rules.
      const liveGate = {
        locationSet: tenant.lat != null && tenant.lng != null,
        statusActive: tenant.status === TenantStatus.ACTIVE,
        testPrintDone: testPrintReady,
        kioskOnline: onlineCount > 0,
        isDiscoverable: Boolean(tenant.isDiscoverable),
      };
      const liveGateMet =
        liveGate.locationSet &&
        liveGate.statusActive &&
        liveGate.testPrintDone &&
        liveGate.kioskOnline;

      res.json({
        success: true,
        data: {
          kiosks: kioskRows,
          kioskCount: kioskRows.length,
          onlineCount,
          jobsToday,
          activeJobs,
          stuckRenders,
          revenueTodayGross: Number(revenueRow?.gross ?? 0),
          commissionTodayPaid: Number(revenueRow?.commission ?? 0),
          liveGate,
          liveGateMet,
        },
      });
    } catch (err: any) {
      console.error('[saas/ops/summary] error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Ops summary failed' });
    }
  },
);

// ── Self-service kiosks/printers (V2-40) ────────────────────────────────
//
// Tenant-native printer management. These are deliberately SEPARATE from
// the SUPER_ADMIN-scope /api/admin/kiosks surface: every read and write
// here is hard-filtered to req.tenant.id, so even a privilege
// mis-grant can't expose another shop's hardware. The operator console
// talks to these, not /admin/kiosks.

/** GET /api/saas/kiosks — this tenant's printers (apiKey never disclosed). */
router.get(
  '/kiosks',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const kiosks = await kioskService.listKiosks({ tenantId: req.tenant!.id });
      res.json({ success: true, data: { kiosks: kiosks.map(publicKiosk) } });
    } catch (err: any) {
      console.error('[saas/kiosks:list]', err);
      res.status(500).json({ success: false, message: 'Could not list printers' });
    }
  },
);

/** POST /api/saas/kiosks — add a printer. Returns the apiKey ONCE (pairing). */
router.post(
  '/kiosks',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const name = String((req.body || {}).name || '').trim();
      if (!name) {
        res.status(400).json({ success: false, message: 'Printer name is required' });
        return;
      }
      const kiosk = await kioskService.createKiosk({
        name,
        tenantId: req.tenant!.id,
        location: req.body?.location?.trim() || undefined,
        printerName: req.body?.printerName?.trim() || undefined,
      });
      // apiKey disclosed here only — it's the QR pairing secret.
      res.status(201).json({
        success: true,
        data: { kiosk: { ...publicKiosk(kiosk), apiKey: kiosk.apiKey } },
      });
    } catch (err: any) {
      console.error('[saas/kiosks:create]', err);
      res.status(500).json({ success: false, message: 'Could not add printer' });
    }
  },
);

/** PATCH /api/saas/kiosks/:id/status — pause / activate (ownership-checked). */
router.patch(
  '/kiosks/:id/status',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const want = String((req.body || {}).status || '').toUpperCase();
    if (!(want in KioskStatus)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }
    const updated = await kioskService.updateKioskStatus(
      k.id,
      KioskStatus[want as keyof typeof KioskStatus],
    );
    res.json({ success: true, data: updated ? publicKiosk(updated) : null });
  },
);

/** POST /api/saas/kiosks/:id/regenerate-key — rotate the pairing key. */
router.post(
  '/kiosks/:id/regenerate-key',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const updated = await kioskService.regenerateApiKey(k.id);
    res.json({
      success: true,
      data: { id: k.id, apiKey: updated?.apiKey },
    });
  },
);

/** POST /api/saas/kiosks/:id/test-print — confirm a successful test page. */
router.post(
  '/kiosks/:id/test-print',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const repo = AppDataSource.getRepository(Kiosk);
    k.testPrintPassedAt = new Date();
    await repo.save(k);
    res.json({
      success: true,
      data: { id: k.id, testPrintPassedAt: k.testPrintPassedAt },
    });
  },
);

/** DELETE /api/saas/kiosks/:id — remove (soft-disable), ownership-checked. */
router.delete(
  '/kiosks/:id',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    const k = await ownedKiosk(req, req.params.id);
    if (!k) {
      res.status(404).json({ success: false, message: 'Printer not found' });
      return;
    }
    const ok = await kioskService.deleteKiosk(k.id);
    res.json({ success: ok });
  },
);

/**
 * GET /api/saas/balance
 *
 * Tenant's available + pending payout balance, plus lifetime
 * commission stats. The home-screen widget on the tenant admin
 * dashboard reads this.
 */
router.get(
  '/balance',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const txRepo = AppDataSource.getRepository(Transaction);
      const payoutRepo = AppDataSource.getRepository(Payout);

      const [available, lifetime, pending] = await Promise.all([
        getAvailableBalance(tenant.id),
        txRepo
          .createQueryBuilder('tx')
          .select(
            `COALESCE(SUM(CAST(tx.commissionAmount AS REAL)), 0)`,
            'total',
          )
          .where('tx.tenantId = :tid', { tid: tenant.id })
          .getRawOne<{ total: string }>(),
        payoutRepo
          .createQueryBuilder('p')
          .select(`COALESCE(SUM(CAST(p.amount AS REAL)), 0)`, 'total')
          .where('p.tenantId = :tid', { tid: tenant.id })
          .andWhere('p.status IN (:...states)', {
            states: [PayoutStatus.PENDING, PayoutStatus.PROCESSING],
          })
          .getRawOne<{ total: string }>(),
      ]);

      res.json({
        success: true,
        data: {
          currency: 'NGN',
          availableBalance: available,
          pendingPayout: Number(pending?.total ?? 0),
          lifetimeCommissionPaidToPlatform: Number(lifetime?.total ?? 0),
          commissionPct: Number(tenant.commissionPct),
        },
      });
    } catch (err: any) {
      console.error('Balance read error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Failed to read balance' });
    }
  },
);

/**
 * GET /api/saas/payouts?limit=20&before=ISO_DATE
 *
 * Paginated payout history for the tenant admin dashboard. Sorted
 * by createdAt DESC. `before` is a cursor — pass the createdAt of
 * the last row from the previous page.
 */
router.get(
  '/payouts',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit ?? 20)));
      const before = req.query?.before ? new Date(String(req.query.before)) : null;
      const qb = AppDataSource.getRepository(Payout)
        .createQueryBuilder('p')
        .where('p.tenantId = :tid', { tid: tenant.id })
        .orderBy('p.createdAt', 'DESC')
        .limit(limit);
      if (before && !Number.isNaN(before.getTime())) {
        qb.andWhere('p.createdAt < :before', { before });
      }
      const rows = await qb.getMany();
      res.json({
        success: true,
        data: {
          items: rows.map((p) => ({
            id: p.id,
            amount: Number(p.amount),
            feeAmount: Number(p.feeAmount),
            currency: p.currency,
            status: p.status,
            trigger: p.trigger,
            reference: p.paystackTransferReference,
            failureReason: p.failureReason,
            requestedAt: p.requestedAt,
            paidAt: p.paidAt,
            createdAt: p.createdAt,
          })),
          nextCursor:
            rows.length === limit ? rows[rows.length - 1].createdAt : null,
        },
      });
    } catch (err: any) {
      console.error('Payouts list error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Failed to list payouts' });
    }
  },
);

/**
 * GET /api/saas/transactions?limit=50&before=ISO_DATE
 *
 * Paginated commission-bearing transactions (the gross-revenue
 * feed) for the tenant admin dashboard. Sorted by createdAt DESC.
 */
router.get(
  '/transactions',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 50)));
      const before = req.query?.before ? new Date(String(req.query.before)) : null;
      const qb = AppDataSource.getRepository(Transaction)
        .createQueryBuilder('tx')
        .where('tx.tenantId = :tid', { tid: tenant.id })
        .orderBy('tx.createdAt', 'DESC')
        .limit(limit);
      if (before && !Number.isNaN(before.getTime())) {
        qb.andWhere('tx.createdAt < :before', { before });
      }
      const rows = await qb.getMany();
      res.json({
        success: true,
        data: {
          items: rows.map((tx) => ({
            id: tx.id,
            type: tx.type,
            amount: Number(tx.amount),
            commissionAmount: Number(tx.commissionAmount),
            description: tx.description,
            balanceAfter: Number(tx.balanceAfter),
            reference: tx.reference,
            createdAt: tx.createdAt,
          })),
          nextCursor:
            rows.length === limit ? rows[rows.length - 1].createdAt : null,
        },
      });
    } catch (err: any) {
      console.error('Transactions list error:', err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Failed to list transactions',
      });
    }
  },
);

/**
 * POST /api/saas/payouts/instant
 *
 * Owner-triggered payout outside the schedule. A flat ₦100 fee is
 * deducted from the payout amount. The tenant must have a verified
 * Paystack subaccount and a bank account on their PayoutSchedule.
 *
 * Returns 402 if available balance < (minPayoutAmount + fee).
 */
router.post(
  '/payouts/instant',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const scheduleRepo = AppDataSource.getRepository(PayoutSchedule);
      const schedule = await scheduleRepo.findOne({
        where: { tenantId: tenant.id },
      });
      if (!schedule?.recipientCode) {
        res.status(409).json({
          success: false,
          message: 'Add a bank account before requesting a payout',
          code: 'NO_BANK_ACCOUNT',
        });
        return;
      }

      const available = await getAvailableBalance(tenant.id);
      const minRequired =
        Number(schedule.minPayoutAmount) + INSTANT_PAYOUT_FEE_NAIRA;
      if (available < minRequired) {
        res.status(402).json({
          success: false,
          message: `Available balance is ₦${available}; minimum for instant payout is ₦${minRequired} (includes ₦${INSTANT_PAYOUT_FEE_NAIRA} fee)`,
          code: 'INSUFFICIENT_BALANCE',
          data: {
            available,
            minRequired,
            fee: INSTANT_PAYOUT_FEE_NAIRA,
          },
        });
        return;
      }

      // Net payout = available - instant fee. The fee is recorded
      // on payout.feeAmount so the dashboard can show it.
      const netPayout = available - INSTANT_PAYOUT_FEE_NAIRA;
      const payout = await initiatePayout({
        tenantId: tenant.id,
        amount: netPayout,
        recipientCode: schedule.recipientCode,
        trigger: PayoutTrigger.INSTANT,
        notes: `Instant payout (fee ₦${INSTANT_PAYOUT_FEE_NAIRA})`,
      });
      // Backfill the fee onto the row so the dashboard reflects it.
      payout.feeAmount = INSTANT_PAYOUT_FEE_NAIRA;
      await AppDataSource.getRepository(Payout).save(payout);

      res.status(201).json({
        success: true,
        data: {
          id: payout.id,
          amount: Number(payout.amount),
          feeAmount: Number(payout.feeAmount),
          status: payout.status,
          reference: payout.paystackTransferReference,
        },
      });
    } catch (err: any) {
      console.error('Instant-payout error:', err?.response?.data || err);
      res.status(500).json({
        success: false,
        message: err?.message || 'Instant payout failed',
      });
    }
  },
);

// ── Data export + delete (Dimension 13 / GDPR / NDPR — V2-14) ────────────

/**
 * POST /api/saas/me/export — full tenant export.
 *
 * Returns a single JSON document with every tenant-scoped row.
 * Sensitive credentials (password hashes, salts, tokens) stripped.
 * Audit-logged so the trail captures who pulled an export.
 */
router.post(
  '/me/export',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { exportTenant } = await import('../services/tenantExport.service');
      const archive = await exportTenant(req.tenant!.id);
      const { writeAudit } = await import('../services/audit.service');
      await writeAudit(req, 'tenant.export', `tenant:${req.tenant!.id}`, {
        slug: req.tenant!.slug,
        rowsApprox:
          archive.users.length +
          archive.printJobs.length +
          archive.transactions.length,
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="printloop-export-${req.tenant!.slug}-${new Date()
          .toISOString()
          .slice(0, 10)}.json"`,
      );
      res.send(JSON.stringify(archive, null, 2));
    } catch (err: any) {
      console.error('Export error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Export failed' });
    }
  },
);

/**
 * DELETE /api/saas/me — schedule tenant deletion (status → CLOSED).
 *
 * Body: { confirmSlug: string, reason?: string }. Type the tenant
 * slug to confirm. 30-day cooling-off then ops hard-deletes.
 */
router.delete(
  '/me',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const confirmSlug = String(req.body?.confirmSlug || '').trim();
      const reason = String(req.body?.reason || '').slice(0, 255) || null;
      const tenant = req.tenant!;
      if (confirmSlug !== tenant.slug) {
        res.status(400).json({
          success: false,
          message: `Type "${tenant.slug}" in the confirmSlug field to delete this tenant`,
          code: 'CONFIRM_SLUG_MISMATCH',
        });
        return;
      }
      if (tenant.status === TenantStatus.CLOSED) {
        res
          .status(409)
          .json({ success: false, message: 'Tenant already closed' });
        return;
      }
      const { closeTenant } = await import('../services/tenantDelete.service');
      await closeTenant(tenant.id, reason || 'Owner-initiated close');
      const { writeAudit } = await import('../services/audit.service');
      await writeAudit(req, 'tenant.close', `tenant:${tenant.id}`, {
        slug: tenant.slug,
        reason,
      });
      res.json({
        success: true,
        message:
          'Tenant closed. 30-day cooling-off window started. Contact support to reverse, otherwise data will be deleted.',
        data: { id: tenant.id, status: TenantStatus.CLOSED },
      });
    } catch (err: any) {
      console.error('Tenant close error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Close failed' });
    }
  },
);

// ── White-label branding (Dimension 7 — V2-13) ───────────────────────────

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const URL_RE = /^https?:\/\/.+/i;

/** GET /api/saas/me/branding — owner reads. Empty defaults if not yet set. */
router.get(
  '/me/branding',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    const { TenantBranding } = await import('../entities/tenantBranding.entity');
    const repo = AppDataSource.getRepository(TenantBranding);
    const row =
      (await repo.findOne({ where: { tenantId: req.tenant!.id } })) ??
      repo.create({ tenantId: req.tenant!.id });
    res.json({ success: true, data: row });
  },
);

/** PUT /api/saas/me/branding — upsert, with format validation. */
router.put(
  '/me/branding',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      for (const f of ['primaryColor', 'secondaryColor', 'accentColor']) {
        if (body[f] != null && !COLOR_RE.test(String(body[f]))) {
          res.status(400).json({
            success: false,
            message: `${f} must be a 7-char #RRGGBB hex (got "${body[f]}")`,
          });
          return;
        }
      }
      for (const f of ['logoUrl', 'faviconUrl']) {
        if (body[f] != null && !URL_RE.test(String(body[f]))) {
          res.status(400).json({
            success: false,
            message: `${f} must be an http(s):// URL`,
          });
          return;
        }
      }
      const { TenantBranding } = await import('../entities/tenantBranding.entity');
      const repo = AppDataSource.getRepository(TenantBranding);
      let row = await repo.findOne({ where: { tenantId: req.tenant!.id } });
      if (!row) row = repo.create({ tenantId: req.tenant!.id });
      const fields = [
        'wordmark',
        'tagline',
        'logoUrl',
        'faviconUrl',
        'primaryColor',
        'secondaryColor',
        'accentColor',
        'emailFromName',
        'supportEmail',
        'supportPhone',
      ] as const;
      for (const f of fields) {
        if (f in body) (row as any)[f] = body[f] === '' ? null : body[f];
      }
      const saved = await repo.save(row);
      res.json({ success: true, data: saved });
    } catch (err: any) {
      console.error('Branding update error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Failed to save branding' });
    }
  },
);

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/** POST /api/saas/me/photos — upload shop photo */
router.post(
  '/me/photos',
  authenticate,
  resolveTenant,
  photoUpload.single('photo'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'No image file uploaded' });
        return;
      }
      if (!file.mimetype.startsWith('image/')) {
        res.status(400).json({ success: false, message: 'Uploaded file must be an image' });
        return;
      }
      const stored = await saveBuffer(file.buffer, file.originalname);
      const tenant = req.tenant!;
      tenant.photos = tenant.photos || [];
      tenant.photos.push(stored.url);
      await AppDataSource.getRepository(Tenant).save(tenant);
      res.json({ success: true, photos: tenant.photos });
    } catch (err: any) {
      console.error('Photo upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to upload photo' });
    }
  }
);

/** DELETE /api/saas/me/photos — delete shop photo */
router.delete(
  '/me/photos',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { url } = req.body || {};
      if (!url) {
        res.status(400).json({ success: false, message: 'Photo URL is required' });
        return;
      }
      const tenant = req.tenant!;
      if (!tenant.photos || !tenant.photos.includes(url)) {
        res.status(404).json({ success: false, message: 'Photo not found in shop profile' });
        return;
      }
      tenant.photos = tenant.photos.filter(p => p !== url);
      await AppDataSource.getRepository(Tenant).save(tenant);
      res.json({ success: true, photos: tenant.photos });
    } catch (err: any) {
      console.error('Photo delete error:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to delete photo' });
    }
  }
);

// ── Marketplace location + discoverability (V2-30 + V2-32 live gate) ────

/**
 * "Live gate" predicates for marketplace opt-in. Returns null when
 * the tenant is allowed to flip isDiscoverable=true; otherwise a
 * structured reason the UI can render against.
 *
 * Coords + status + test-print + online kiosk — see the saas.routes
 * PATCH /me/location handler for the order they fire in.
 */
const LIVE_ONLINE_WINDOW_MS = 5 * 60 * 1000;
async function assertLiveGateMet(
  tenant: Tenant,
): Promise<{ code: string; message: string } | null> {
  if (tenant.lat == null || tenant.lng == null) {
    return {
      code: 'LOCATION_MISSING',
      message:
        'Set a shop address first — discoverability needs coordinates.',
    };
  }
  if (tenant.status !== TenantStatus.ACTIVE) {
    return {
      code: 'TENANT_NOT_ACTIVE',
      message:
        'Your account is still in trial. A PrintLoop operator will activate it after verification.',
    };
  }
  const kiosks = await AppDataSource.getRepository(Kiosk).find({
    where: { tenantId: tenant.id },
  });
  if (!kiosks.some((k) => k.testPrintPassedAt != null)) {
    return {
      code: 'TEST_PRINT_MISSING',
      message:
        'Run a test print first — at least one kiosk needs to confirm it printed successfully.',
    };
  }
  const cutoff = Date.now() - LIVE_ONLINE_WINDOW_MS;
  const onlineNow = kiosks.some(
    (k) =>
      k.status === KioskStatus.ACTIVE &&
      k.lastSeenAt &&
      new Date(k.lastSeenAt).getTime() > cutoff,
  );
  if (!onlineNow) {
    return {
      code: 'NO_KIOSK_ONLINE',
      message:
        'No kiosk is online right now. Bring your kiosk app online and try again.',
    };
  }
  return null;
}

/**
 * PATCH /api/saas/me/location
 *
 * Body: { address?, isDiscoverable? }
 *
 *  - `address` — when set, we re-geocode it and stamp lat/lng.
 *    Setting an empty string clears the address (and lat/lng).
 *  - `isDiscoverable` — opt in / out of the public /find list.
 *    Refuses to flip TRUE until lat/lng are set (no point in
 *    being "discoverable" with no coordinates to sort by).
 *
 * Returns the updated tenant row's location projection.
 */
// ── Campus LMS trusted link (V2-44, P3) ──────────────────────────────
/**
 * GET /api/saas/me/lms — status only. The key itself is never
 * re-disclosed on reads (same discipline as kiosk apiKeys): it shows
 * exactly once, on regenerate.
 */
router.get(
  '/me/lms',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const row = await AppDataSource.getRepository(Tenant).findOneOrFail({
        where: { id: req.tenant!.id },
      });
      res.json({ success: true, data: { keySet: Boolean(row.lmsKey) } });
    } catch (err: any) {
      console.error('[saas/me/lms]', err?.message);
      res.status(500).json({ success: false, message: 'Could not load LMS link status' });
    }
  },
);

/**
 * POST /api/saas/me/lms/regenerate — mint (or rotate) the campus LMS
 * key and return the ready-to-paste URL ONCE. Rotating immediately
 * invalidates the previous link everywhere it was embedded.
 */
router.post(
  '/me/lms/regenerate',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Tenant);
      const row = await repo.findOneOrFail({ where: { id: req.tenant!.id } });
      row.lmsKey = randomBytes(24).toString('hex');
      await repo.save(row);

      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
      const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
      const url =
        `${proto}://${host}/api/integrations/lms/handoff` +
        `?slug=${encodeURIComponent(row.slug)}&key=${row.lmsKey}`;
      res.json({
        success: true,
        data: {
          key: row.lmsKey,
          url,
          // Moodle/Canvas admins who can template the student's email
          // into a URL get one-tap sign-in; paste this variant there.
          urlWithEmail: `${url}&email={{student_email}}`,
        },
      });
    } catch (err: any) {
      console.error('[saas/me/lms/regenerate]', err?.message);
      res.status(500).json({ success: false, message: 'Could not generate LMS link' });
    }
  },
);

router.patch(
  '/me/location',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const body = req.body || {};
      const tenantRepo = AppDataSource.getRepository(Tenant);
      const row = await tenantRepo.findOneOrFail({ where: { id: tenant.id } });

      if ('address' in body) {
        const raw = body.address == null ? '' : String(body.address);
        const trimmed = raw.trim();
        if (!trimmed) {
          row.address = null;
          row.lat = null;
          row.lng = null;
        } else if (trimmed !== row.address) {
          row.address = trimmed;
          // Re-geocode only on change. The geocoder fails open
          // (logs + leaves prior coords); we explicitly null them
          // here so the row stays self-consistent.
          row.lat = null;
          row.lng = null;
          try {
            const { getGeocoder } = await import('../services/geocoding.service');
            const coords = await getGeocoder().geocode(trimmed);
            if (coords) {
              row.lat = coords.lat;
              row.lng = coords.lng;
            }
          } catch (err) {
            console.warn('[me/location] geocode threw, continuing:', err);
          }
        }
      }

      if ('isDiscoverable' in body) {
        const want = Boolean(body.isDiscoverable);
        if (want) {
          // Live gate (V2-32). We're about to put this shop in front
          // of real customers; require proof that:
          //   1. coords exist (sorting works),
          //   2. tenant is past TRIAL,
          //   3. at least one kiosk has passed a test print,
          //   4. at least one kiosk is currently online.
          // Each failure has its own reason so the UI can act on it.
          const reason = await assertLiveGateMet(row);
          if (reason) {
            res.status(400).json({
              success: false,
              message: reason.message,
              code: 'LIVE_GATE_NOT_MET',
              reason: reason.code,
            });
            return;
          }
        }
        row.isDiscoverable = want;
      }

      const saved = await tenantRepo.save(row);
      res.json({
        success: true,
        data: {
          address: saved.address,
          lat: saved.lat,
          lng: saved.lng,
          isDiscoverable: Boolean(saved.isDiscoverable),
        },
      });
    } catch (err: any) {
      console.error('[me/location] error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Update failed' });
    }
  },
);

/**
 * PATCH /api/saas/me/availability — operator-controlled shop state
 * (V2-57). Body: { availability: 'open' | 'busy' | 'closed' }.
 *   open   → taking orders (default)
 *   busy   → taking orders, flagged on the student map
 *   closed → rejecting new uploads, hidden from the map list
 */
router.patch(
  '/me/availability',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { availability } = req.body || {};
      if (!['open', 'busy', 'closed'].includes(availability)) {
        res.status(400).json({
          success: false,
          message: "availability must be 'open', 'busy' or 'closed'",
        });
        return;
      }
      const tenantRepo = AppDataSource.getRepository(Tenant);
      const row = await tenantRepo.findOneOrFail({ where: { id: req.tenant!.id } });
      row.availability = availability;
      const saved = await tenantRepo.save(row);
      res.json({ success: true, data: { availability: saved.availability } });
    } catch (err: any) {
      console.error('[me/availability] error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Update failed' });
    }
  },
);

// ── Tenant webhooks (Dimension 14 — V2-14, routes landed V2-16) ──────────

/** GET /api/saas/me/webhooks — list (secret masked). */
router.get(
  '/me/webhooks',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    const { TenantWebhook } = await import('../entities/tenantWebhook.entity');
    const rows = await AppDataSource.getRepository(TenantWebhook).find({
      where: { tenantId: req.tenant!.id },
      order: { createdAt: 'DESC' },
    });
    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, secret: '***' })),
    });
  },
);

/** POST /api/saas/me/webhooks — create; returns secret ONCE. */
router.post(
  '/me/webhooks',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { TenantWebhook, WebhookEvent } = await import(
        '../entities/tenantWebhook.entity'
      );
      const { generateWebhookSecret } = await import(
        '../services/tenantWebhook.service'
      );
      const { name, url, events } = req.body || {};
      if (!name || !url) {
        res
          .status(400)
          .json({ success: false, message: 'name and url are required' });
        return;
      }
      if (!/^https?:\/\/.+/i.test(String(url))) {
        res
          .status(400)
          .json({ success: false, message: 'url must be http(s)://...' });
        return;
      }
      const allowed = Object.values(WebhookEvent) as string[];
      const cleaned: any[] = Array.isArray(events)
        ? events.filter((e: string) => allowed.includes(e))
        : [];
      const repo = AppDataSource.getRepository(TenantWebhook);
      const row = repo.create({
        tenantId: req.tenant!.id,
        name: String(name).slice(0, 100),
        url: String(url).slice(0, 1024),
        secret: generateWebhookSecret(),
        events: cleaned,
        isActive: true,
      });
      const saved = await repo.save(row);
      res.status(201).json({ success: true, data: saved });
    } catch (err: any) {
      console.error('Webhook create error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Create failed' });
    }
  },
);

/** PATCH /api/saas/me/webhooks/:id — toggle/rename/edit events. */
router.patch(
  '/me/webhooks/:id',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { TenantWebhook, WebhookEvent } = await import(
        '../entities/tenantWebhook.entity'
      );
      const repo = AppDataSource.getRepository(TenantWebhook);
      const row = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!row) {
        res.status(404).json({ success: false, message: 'Webhook not found' });
        return;
      }
      const { name, events, isActive } = req.body || {};
      if (name != null) row.name = String(name).slice(0, 100);
      if (Array.isArray(events)) {
        const allowed = Object.values(WebhookEvent) as string[];
        row.events = events.filter((e: string) => allowed.includes(e)) as any;
      }
      if (typeof isActive === 'boolean') row.isActive = isActive;
      const saved = await repo.save(row);
      res.json({ success: true, data: { ...saved, secret: '***' } });
    } catch (err: any) {
      console.error('Webhook patch error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Update failed' });
    }
  },
);

/** DELETE /api/saas/me/webhooks/:id */
router.delete(
  '/me/webhooks/:id',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { TenantWebhook } = await import('../entities/tenantWebhook.entity');
      const repo = AppDataSource.getRepository(TenantWebhook);
      const row = await repo.findOne({
        where: { id: req.params.id, tenantId: req.tenant!.id },
      });
      if (!row) {
        res.status(404).json({ success: false, message: 'Webhook not found' });
        return;
      }
      await repo.remove(row);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Webhook delete error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Delete failed' });
    }
  },
);

// ── Custom domains (Dimension 8 — V2-16) ─────────────────────────────────

/** GET /api/saas/me/domains — list this tenant's domain claims. */
router.get(
  '/me/domains',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    const { listDomains } = await import('../services/customDomain.service');
    const rows = await listDomains(req.tenant!.id);
    res.json({ success: true, data: rows });
  },
);

/** POST /api/saas/me/domains — claim. Returns the TXT + CNAME to publish. */
router.post(
  '/me/domains',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { claimDomain } = await import('../services/customDomain.service');
      const result = await claimDomain(req.tenant!.id, req.body?.domain);
      res.status(201).json({
        success: true,
        data: {
          id: result.row.id,
          domain: result.row.domain,
          status: result.row.status,
          dns: {
            txt: result.txtRecord,
            cname: { name: result.row.domain, value: result.cname },
          },
        },
      });
    } catch (err: any) {
      if (err?.name === 'DomainError') {
        res
          .status(err.httpStatus || 400)
          .json({ success: false, message: err.message, code: err.code });
        return;
      }
      console.error('Domain claim error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Claim failed' });
    }
  },
);

/** POST /api/saas/me/domains/:id/verify — run the DNS TXT check. */
router.post(
  '/me/domains/:id/verify',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { verifyDomain } = await import('../services/customDomain.service');
      const result = await verifyDomain(req.tenant!.id, req.params.id);
      if (!result.verified) {
        res.status(422).json({
          success: false,
          message: result.reason || 'Verification failed',
          code: 'DOMAIN_NOT_VERIFIED',
        });
        return;
      }
      res.json({ success: true, data: { verified: true } });
    } catch (err: any) {
      if (err?.name === 'DomainError') {
        res
          .status(err.httpStatus || 400)
          .json({ success: false, message: err.message, code: err.code });
        return;
      }
      console.error('Domain verify error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Verify failed' });
    }
  },
);

/** DELETE /api/saas/me/domains/:id */
router.delete(
  '/me/domains/:id',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { removeDomain } = await import('../services/customDomain.service');
      await removeDomain(req.tenant!.id, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      if (err?.name === 'DomainError') {
        res
          .status(err.httpStatus || 400)
          .json({ success: false, message: err.message, code: err.code });
        return;
      }
      console.error('Domain delete error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Delete failed' });
    }
  },
);

// ── Month-end statement CSV (V2-23, Dimension 14 reports) ────────────────

/**
 * GET /api/saas/me/statement?month=YYYY-MM
 * Streams a CSV of the tenant's transactions + payouts for the month
 * with summary totals. Defaults to the current month.
 */
router.get(
  '/me/statement',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const { parseMonth, buildMonthlyStatementCsv } = await import(
        '../services/statement.service'
      );
      const m = parseMonth(req.query?.month as string | undefined);
      const { csv, filename } = await buildMonthlyStatementCsv(
        req.tenant!.id,
        req.tenant!.slug,
        m,
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      console.error('Statement error:', err);
      res
        .status(500)
        .json({ success: false, message: err?.message || 'Statement failed' });
    }
  },
);

// ── Two-factor auth (TOTP — V2-22) ───────────────────────────────────────

/**
 * POST /api/saas/me/2fa/setup — begin enrolment.
 * Generates a secret (stored, but totpEnabled stays false) and
 * returns the otpauth:// URL for the authenticator app + the raw
 * secret for manual entry. Idempotent: re-running before enable
 * rotates the secret.
 */
router.post(
  '/me/2fa/setup',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      const repo = AppDataSource.getRepository(User);
      if (user.totpEnabled) {
        res.status(409).json({
          success: false,
          message: '2FA already enabled; disable it first to re-enrol',
          code: 'TOTP_ALREADY_ENABLED',
        });
        return;
      }
      const secret = generateTotpSecret();
      user.totpSecret = secret;
      await repo.save(user);
      res.json({
        success: true,
        data: {
          secret,
          otpauthUrl: buildOtpAuthUrl({
            secret,
            accountName: user.email,
            issuer: 'PrintLoop',
          }),
        },
      });
    } catch (err: any) {
      console.error('2FA setup error:', err);
      res.status(500).json({ success: false, message: '2FA setup failed' });
    }
  },
);

/**
 * POST /api/saas/me/2fa/enable — confirm enrolment with a live code.
 * Body: { code }. Flips totpEnabled only when the code verifies, so a
 * mistyped/desynced authenticator can never lock the user out.
 */
router.post(
  '/me/2fa/enable',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      const repo = AppDataSource.getRepository(User);
      if (!user.totpSecret) {
        res.status(400).json({
          success: false,
          message: 'Run 2FA setup first',
          code: 'TOTP_NOT_SET_UP',
        });
        return;
      }
      const code = String(req.body?.code || '');
      if (!verifyTotp(user.totpSecret, code)) {
        res.status(422).json({
          success: false,
          message: 'Code did not verify — check your authenticator clock',
          code: 'TOTP_INVALID',
        });
        return;
      }
      user.totpEnabled = true;
      await repo.save(user);
      res.json({ success: true, data: { enabled: true } });
    } catch (err: any) {
      console.error('2FA enable error:', err);
      res.status(500).json({ success: false, message: '2FA enable failed' });
    }
  },
);

/**
 * POST /api/saas/me/2fa/disable — turn off 2FA.
 * Body: { code }. Requires a current code so a hijacked *session*
 * (without the device) can't strip 2FA.
 */
router.post(
  '/me/2fa/disable',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as User;
      const repo = AppDataSource.getRepository(User);
      if (!user.totpEnabled || !user.totpSecret) {
        res.json({ success: true, data: { enabled: false } });
        return;
      }
      const code = String(req.body?.code || '');
      if (!verifyTotp(user.totpSecret, code)) {
        res.status(422).json({
          success: false,
          message: 'Current 2FA code required to disable',
          code: 'TOTP_INVALID',
        });
        return;
      }
      user.totpEnabled = false;
      user.totpSecret = null;
await repo.save(user);
      res.json({ success: true, data: { enabled: false } });
    } catch (err: any) {
      console.error('2FA disable error:', err);
      res.status(500).json({ success: false, message: '2FA disable failed' });
    }
  },
);

/**
 * DOCUMENT EDITING SERVICE FLOW (V2-XX — Edit & Print feature)
 * 
 * Flow:
 * 1. Customer uploads document with editing_required=true + editing_instructions
 * 2. PrintJob status: AWAITING_EDIT → shop picks up edit
 * 3. Shop uploads edited document via /saas/edit/:jobId/upload
 * 4. Shop marks edit complete via /saas/edit/:jobId/complete
 * 5. PrintJob status: EDIT_COMPLETE → customer reviews
 * 6. Customer confirms satisfaction via /saas/edit/:jobId/confirm
 * 7. PrintJob status: AWAITING_PAYMENT → customer pays via bank transfer
 * 8. Shop confirms payment via /saas/edit/:jobId/confirm-payment
 * 9. PrintJob status: PAID → proceeds to normal print flow (RENDERING, etc.)
 */

import { DocumentEdit, DocumentEditStatus } from '../entities/documentEdit.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { EditPricingConfig, EditComplexityTier } from '../entities/editPricingConfig.entity';
import { notificationQueue } from '../workers/queues';
import { etherpadService } from '../services/etherpad.service';

/** POST /api/saas/edit-pricing — Create/update edit pricing config for this shop. */
router.post(
  '/edit-pricing',
  authenticate,
  requireVerifiedEmail,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const {
        baseFee,
        perPageFee,
        complexityTierFees,
        maxShopAdjustmentPct,
        editingEnabled,
        bankAccountName,
        bankAccountNumber,
        bankName,
        bankSortCode,
      } = req.body || {};

      const repo = AppDataSource.getRepository(EditPricingConfig);
      let config = await repo.findOne({ where: { tenantId: tenant.id } });

      if (!config) {
        config = repo.create({ tenantId: tenant.id });
      }

      if (baseFee !== undefined) config.baseFee = baseFee;
      if (perPageFee !== undefined) config.perPageFee = perPageFee;
      if (complexityTierFees !== undefined) config.complexityTierFees = complexityTierFees;
      if (maxShopAdjustmentPct !== undefined) config.maxShopAdjustmentPct = maxShopAdjustmentPct;
      if (editingEnabled !== undefined) config.editingEnabled = editingEnabled;
      if (bankAccountName !== undefined) config.bankAccountName = bankAccountName;
      if (bankAccountNumber !== undefined) config.bankAccountNumber = bankAccountNumber;
      if (bankName !== undefined) config.bankName = bankName;
      if (bankSortCode !== undefined) config.bankSortCode = bankSortCode;

      await repo.save(config);

      res.json({ success: true, data: config });
    } catch (err: any) {
      console.error('[saas/edit-pricing] error:', err);
      res.status(500).json({ success: false, message: err?.message || 'Failed to save edit pricing' });
    }
  },
);

/** GET /api/saas/edit-pricing — Get this shop's edit pricing config. */
router.get(
  '/edit-pricing',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const repo = AppDataSource.getRepository(EditPricingConfig);
      const config = await repo.findOne({ where: { tenantId: tenant.id } });

      if (!config) {
        // Return defaults if not configured
        res.json({
          success: true,
          data: {
            baseFee: 500,
            perPageFee: 100,
            complexityTierFees: {},
            maxShopAdjustmentPct: 0,
            editingEnabled: true,
            bankAccountName: null,
            bankAccountNumber: null,
            bankName: null,
            bankSortCode: null,
          },
        });
        return;
      }

      res.json({ success: true, data: config });
    } catch (err: any) {
      console.error('[saas/edit-pricing:get] error:', err);
      res.status(500).json({ success: false, message: 'Failed to get edit pricing' });
    }
  },
);

/** GET /api/saas/edit-queue — List edit jobs for this shop (pending/in-progress). */
router.get(
  '/edit-queue',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const status = req.query.status as DocumentEditStatus | undefined;
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));

      const qb = AppDataSource.getRepository(DocumentEdit)
        .createQueryBuilder('de')
        .leftJoinAndSelect('de.printJob', 'pj')
        .leftJoinAndSelect('pj.user', 'u')
        .where('de.shopId = :tid', { tid: tenant.id });

      if (status) {
        qb.andWhere('de.status = :status', { status });
      } else {
        qb.andWhere('de.status IN (:...statuses)', {
          statuses: [DocumentEditStatus.PENDING_SHOP, DocumentEditStatus.IN_PROGRESS],
        });
      }

      qb.orderBy('de.createdAt', 'ASC').limit(limit);

      const edits = await qb.getMany();

      res.json({
        success: true,
        data: {
          items: edits.map((e) => ({
            id: e.id,
            printJobId: e.printJobId,
            status: e.status,
            editOperations: e.editOperations,
            originalDocumentMeta: e.originalDocumentMeta,
            editedDocumentMeta: e.editedDocumentMeta,
            totalEditFee: e.totalEditFee,
            shopNotes: e.shopNotes,
            customerRejectionReason: e.customerRejectionReason,
            createdAt: e.createdAt,
            printJob: e.printJob
              ? {
                  id: e.printJob.id,
                  code: e.printJob.code,
                  status: e.printJob.status,
                  customerName: e.printJob.user
                    ? `${e.printJob.user.firstName} ${e.printJob.user.lastName}`
                    : 'Unknown',
                  customerEmail: e.printJob.user?.email,
                  originalDocumentUrl: e.printJob.renderedPdfUrl,
                  editingInstructions: e.printJob.editingInstructions,
                  pageCount: e.printJob.totalPages,
                  colorMode: e.printJob.printConfiguration?.color,
                  paperSize: e.printJob.printConfiguration?.paper,
                }
              : null,
          })),
        },
      });
    } catch (err: any) {
      console.error('[saas/edit-queue] error:', err);
      res.status(500).json({ success: false, message: 'Failed to list edit queue' });
    }
  },
);

/** POST /api/saas/edit/:jobId/start — Shop claims an edit job (moves to IN_PROGRESS). */
router.post(
  '/edit/:jobId/start',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_SHOP) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot start` });
        return;
      }

      // Update edit status
      edit.status = DocumentEditStatus.IN_PROGRESS;
      edit.editedBy = user.id;
      await editRepo.save(edit);

      // Update print job status
      const job = edit.printJob;
      job.status = PrintJobStatus.AWAITING_EDIT;
      await jobRepo.save(job);

      // Create Etherpad pad with original document content
      const padId = `edit-${edit.id}`;
      let editorUrl = '';
      try {
        // Get original document text - for now use instructions + placeholder
        // In production, you'd extract text from the PDF
        const initialText = edit.printJob.editingInstructions
          ? `Editing Instructions:\n${edit.printJob.editingInstructions}\n\n---\nOriginal Document: ${edit.printJob.fileName || 'document.pdf'}\nPages: ${edit.printJob.totalPages}\n\n[Document content would be extracted from PDF here]`
          : `Editing document: ${edit.printJob.fileName || 'document.pdf'}\nPages: ${edit.printJob.totalPages}\n\n[Document content would be extracted from PDF here]`;

        await etherpadService.createPad(padId, initialText);

        // Build editor URL - use public URL in production
        const etherpadUrl = process.env.ETHERPAD_URL || 'http://localhost:9001';
        editorUrl = `${etherpadUrl}/p/${padId}?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false`;

        // Store pad ID in edit record for later retrieval
        edit.editOperations = [{ type: 'etherpad_created', padId, createdAt: new Date().toISOString() }];
        await editRepo.save(edit);
      } catch (e: any) {
        console.error('[saas/edit/start] Etherpad error:', e);
        // Don't fail if Etherpad is unavailable - shop can still edit manually
      }

      // Notify customer that edit has started
      await notificationQueue.add('edit-started', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
        shopName: tenant.name,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, editorUrl } });
    } catch (err: any) {
      console.error('[saas/edit/start] error:', err);
      res.status(500).json({ success: false, message: 'Failed to start edit' });
    }
  },
);

/** POST /api/saas/edit/:jobId/upload — Shop uploads edited document. */
router.post(
  '/edit/:jobId/upload',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { jobId } = req.params;
      const { documentUrl, pageCount, fileSize, editOperations, shopNotes } = req.body || {};

      if (!documentUrl) {
        res.status(400).json({ success: false, message: 'Edited document URL is required' });
        return;
      }

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.IN_PROGRESS) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot upload` });
        return;
      }

      // Update edit record
      edit.editedDocumentMeta = { pageCount: pageCount || 0, fileSize: fileSize || 0 };
      edit.editOperations = editOperations || [];
      edit.shopNotes = shopNotes || null;
      edit.status = DocumentEditStatus.PENDING_CUSTOMER;
      await editRepo.save(edit);

      // Update print job
      const job = edit.printJob;
      job.editedDocumentUrl = documentUrl;
      job.status = PrintJobStatus.EDIT_COMPLETE;
      await jobRepo.save(job);

      // Notify customer that edited document is ready for review
      await notificationQueue.add('edit-complete', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
        editedDocumentUrl: documentUrl,
        shopName: tenant.name,
        totalEditFee: edit.totalEditFee,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status } });
    } catch (err: any) {
      console.error('[saas/edit/upload] error:', err);
      res.status(500).json({ success: false, message: 'Failed to upload edited document' });
    }
  },
);

/** POST /api/saas/edit/:jobId/complete — Shop marks edit as complete (exports from Etherpad). */
router.post(
  '/edit/:jobId/complete',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.IN_PROGRESS && edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot complete` });
        return;
      }

      const job = edit.printJob;

      // Export from Etherpad as PDF
      const padId = `edit-${edit.id}`;
      let documentUrl = job.editedDocumentUrl;
      let pageCount = 0;
      let fileSize = 0;

      try {
        const pdfBuffer = await etherpadService.exportAsPDF(padId);
        
        // Save PDF to file store
        const { saveBuffer } = await import('../utils/fileStore');
        const stored = await saveBuffer(pdfBuffer, `edited-${edit.printJobId}.pdf`);
        documentUrl = stored.url;
        fileSize = pdfBuffer.length;
        
        // Estimate page count (rough: ~3KB per page for text PDF)
        pageCount = Math.max(1, Math.ceil(fileSize / 3000));
        
        edit.editedDocumentMeta = { pageCount, fileSize };
      } catch (e: any) {
        console.error('[saas/edit/complete] Etherpad export error:', e);
        // If Etherpad export fails, require manual upload
        if (!job.editedDocumentUrl) {
          res.status(400).json({ 
            success: false, 
            message: 'Could not export from Etherpad. Please upload the edited PDF manually.' 
          });
          return;
        }
      }

      edit.editOperations = [
        ...(edit.editOperations || []),
        { type: 'etherpad_exported', padId, exportedAt: new Date().toISOString() }
      ];
      edit.status = DocumentEditStatus.PENDING_CUSTOMER;
      await editRepo.save(edit);

      job.editedDocumentUrl = documentUrl;
      job.status = PrintJobStatus.EDIT_COMPLETE;
      await jobRepo.save(job);

      // Notify customer
      await notificationQueue.add('edit-complete', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
        editedDocumentUrl: documentUrl,
        shopName: tenant.name,
        totalEditFee: edit.totalEditFee,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, documentUrl } });
    } catch (err: any) {
      console.error('[saas/edit/complete] error:', err);
      res.status(500).json({ success: false, message: 'Failed to complete edit' });
    }
  },
);

/** POST /api/saas/edit/:jobId/confirm — Customer confirms satisfaction with edited document. */
router.post(
  '/edit/:jobId/confirm',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      // Verify ownership
      if (edit.printJob.userId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot confirm` });
        return;
      }

      edit.status = DocumentEditStatus.APPROVED;
      edit.approvedBy = user.id;
      edit.approvedAt = new Date();
      await editRepo.save(edit);

      const job = edit.printJob;
      job.status = PrintJobStatus.AWAITING_PAYMENT;
      await jobRepo.save(job);

      // Notify shop that customer approved, now awaiting payment
      await notificationQueue.add('edit-approved', {
        shopId: edit.shopId,
        printJobId: job.id,
        editId: edit.id,
        customerName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, printJobStatus: job.status } });
    } catch (err: any) {
      console.error('[saas/edit/confirm] error:', err);
      res.status(500).json({ success: false, message: 'Failed to confirm edit' });
    }
  },
);

/** POST /api/saas/edit/:jobId/reject — Customer rejects edited document. */
router.post(
  '/edit/:jobId/reject',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;
      const { reason } = req.body || {};

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      // Verify ownership
      if (edit.printJob.userId !== user.id) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (edit.status !== DocumentEditStatus.PENDING_CUSTOMER) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot reject` });
        return;
      }

      edit.status = DocumentEditStatus.REJECTED;
      edit.customerRejectionReason = reason || 'Customer rejected the edited document';
      await editRepo.save(edit);

      const job = edit.printJob;
      job.status = PrintJobStatus.AWAITING_EDIT; // Back to shop for re-edit
      await jobRepo.save(job);

      // Notify shop that customer rejected
      await notificationQueue.add('edit-rejected', {
        shopId: edit.shopId,
        printJobId: job.id,
        editId: edit.id,
        reason: edit.customerRejectionReason,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status } });
    } catch (err: any) {
      console.error('[saas/edit/reject] error:', err);
      res.status(500).json({ success: false, message: 'Failed to reject edit' });
    }
  },
);

/** POST /api/saas/edit/:jobId/confirm-payment — Shop confirms customer has paid via bank transfer. */
router.post(
  '/edit/:jobId/confirm-payment',
  authenticate,
  resolveTenant,
  async (req: Request, res: Response) => {
    try {
      const tenant = req.tenant!;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const jobRepo = AppDataSource.getRepository(PrintJob);

      const edit = await editRepo.findOne({
        where: { printJobId: jobId, shopId: tenant.id },
        relations: ['printJob'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      if (edit.status !== DocumentEditStatus.APPROVED) {
        res.status(400).json({ success: false, message: `Edit job is ${edit.status}, cannot confirm payment` });
        return;
      }

      const job = edit.printJob;
      if (job.status !== PrintJobStatus.AWAITING_PAYMENT) {
        res.status(400).json({ success: false, message: `Print job is ${job.status}, cannot confirm payment` });
        return;
      }

      edit.status = DocumentEditStatus.COMPLETED;
      edit.completedAt = new Date();
      await editRepo.save(edit);

      job.status = PrintJobStatus.PAID;
      await jobRepo.save(job);

      // Notify customer that payment confirmed, job proceeding to print
      await notificationQueue.add('edit-payment-confirmed', {
        userId: job.userId,
        printJobId: job.id,
        editId: edit.id,
      });

      res.json({ success: true, data: { editId: edit.id, status: edit.status, printJobStatus: job.status } });
    } catch (err: any) {
      console.error('[saas/edit/confirm-payment] error:', err);
      res.status(500).json({ success: false, message: 'Failed to confirm payment' });
    }
  },
);

/** GET /api/saas/edit/:jobId — Get edit job details (for shop or customer). */
router.get(
  '/edit/:jobId',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as any;
      const { jobId } = req.params;

      const editRepo = AppDataSource.getRepository(DocumentEdit);
      const edit = await editRepo.findOne({
        where: { printJobId: jobId },
        relations: ['printJob', 'printJob.user', 'shop'],
      });

      if (!edit) {
        res.status(404).json({ success: false, message: 'Edit job not found' });
        return;
      }

      const isShop = edit.shopId === req.tenant?.id;
      const isCustomer = edit.printJob.userId === user.id;

      if (!isShop && !isCustomer) {
        res.status(403).json({ success: false, message: 'Not authorized' });
        return;
      }

      // Include bank details only for customer viewing payment screen
      let bankDetails = null;
      if (isCustomer && edit.printJob.status === PrintJobStatus.AWAITING_PAYMENT) {
        const pricingRepo = AppDataSource.getRepository(EditPricingConfig);
        const pricing = await pricingRepo.findOne({ where: { tenantId: edit.shopId } });
        if (pricing) {
          bankDetails = {
            accountName: pricing.bankAccountName,
            accountNumber: pricing.bankAccountNumber,
            bankName: pricing.bankName,
            sortCode: pricing.bankSortCode,
          };
        }
      }

      res.json({
        success: true,
        data: {
          id: edit.id,
          printJobId: edit.printJobId,
          status: edit.status,
          editOperations: edit.editOperations,
          originalDocumentMeta: edit.originalDocumentMeta,
          editedDocumentMeta: edit.editedDocumentMeta,
          baseEditFee: edit.baseEditFee,
          perPageFee: edit.perPageFee,
          complexityFee: edit.complexityFee,
          shopAdjustedFee: edit.shopAdjustedFee,
          totalEditFee: edit.totalEditFee,
          shopNotes: edit.shopNotes,
          customerRejectionReason: edit.customerRejectionReason,
          approvedAt: edit.approvedAt,
          completedAt: edit.completedAt,
          createdAt: edit.createdAt,
          bankDetails,
          // Etherpad editor URL for shop
          editorUrl: isShop && (edit.status === DocumentEditStatus.IN_PROGRESS || edit.status === DocumentEditStatus.PENDING_CUSTOMER)
            ? `${process.env.ETHERPAD_URL || 'http://localhost:9001'}/p/edit-${edit.id}?showControls=true&showChat=true&showLineNumbers=true&useMonospaceFont=false`
            : null,
          printJob: edit.printJob
            ? {
                id: edit.printJob.id,
                code: edit.printJob.code,
                status: edit.printJob.status,
                documentUrl: edit.printJob.renderedPdfUrl,
                editedDocumentUrl: edit.printJob.editedDocumentUrl,
                editingInstructions: edit.printJob.editingInstructions,
                pageCount: edit.printJob.totalPages,
                colorMode: edit.printJob.printConfiguration?.color,
                paperSize: edit.printJob.printConfiguration?.paper,
              }
            : null,
        },
      });
    } catch (err: any) {
      console.error('[saas/edit/get] error:', err);
      res.status(500).json({ success: false, message: 'Failed to get edit job' });
    }
  },
);

// Mount editor routes
router.use('/editor', editorRoutes);

export default router;
