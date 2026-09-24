import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { Payment } from '../entities/payment.entity';
import { PricingConfig, PaperSize, ColorType } from '../entities/pricingConfig.entity';
import { applyRenderResult } from '../services/renderEnqueue.service';
import { settleShortfall, shortfallFor } from '../services/costReconciliation.service';

// V2-53: no wallet debits/refunds — deltas charge the saved card.
const { mockCharge } = vi.hoisted(() => ({ mockCharge: vi.fn() }));

vi.mock('../services/paystack.service', () => ({
  PaystackService: class {
    async chargeAuthorization(opts: any): Promise<any> {
      return mockCharge(opts);
    }
  },
}));

vi.mock('../workers/queues', () => {
  return {
    renderQueue: {
      add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    },
  };
});

vi.mock('../config/redis', () => {
  return {
    REDIS_ENABLED: true,
  };
});

const testDbFile = vi.hoisted(() => {
  const file = process.cwd() + "/data/cost-reconciliation-test.sqlite";
  process.env.DATABASE_FILE = file;
  return file;
});

describe('Cost Reconciliation — card-only (V2-53)', () => {
  let tenantId: string;
  let userId: string;
  let walletId: string;
  let paymentRefSeq = 0;

  const cfg = { copies: 1, paper: 'A4', color: 'color' as const, sided: 'single' as const, qualityDpi: 600 as const };

  async function makeJob(opts: {
    cost: number;
    estimatedPages: number;
    authorizationCode?: string | null;
    withPayment?: boolean;
  }): Promise<{ job: PrintJob; payment: Payment | null }> {
    const jobRepo = AppDataSource.getRepository(PrintJob);
    const paymentRef = `JOB_${Date.now()}_${paymentRefSeq++}`;
    const job = jobRepo.create({
      userId,
      tenantId,
      fileId: '00000000-0000-0000-0000-000000000000',
      fileName: 'test.pdf',
      code: null,
      paymentReference: opts.withPayment ? paymentRef : null,
      cost: opts.cost,
      totalPages: opts.estimatedPages,
      // Jobs enter the pipeline PENDING and are flipped to RENDERING by
      // enqueueRender; the tests skip enqueue and call the callback
      // directly, so create them already in RENDERING.
      status: PrintJobStatus.RENDERING,
      printConfiguration: cfg,
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });
    await jobRepo.save(job);

    let payment: Payment | null = null;
    if (opts.withPayment) {
      const paymentRepo = AppDataSource.getRepository(Payment);
      payment = paymentRepo.create({
        tenantId,
        userId,
        amount: opts.cost,
        status: 'SUCCESS',
        method: 'card',
        reference: paymentRef,
        description: 'test payment',
        authorizationCode:
          opts.authorizationCode === undefined ? 'AUTH_TEST_123' : opts.authorizationCode,
      } as any) as unknown as Payment;
      await paymentRepo.save(payment);
    }
    return { job, payment };
  }

  beforeAll(async () => {
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch {}
    }

    const dbModule = await import('../config/database');
    await AppDataSource.initialize();
    await AppDataSource.runMigrations();
    await dbModule.runPostInitMigrations();

    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = tenantRepo.create({
      name: 'Reconcile Test Tenant',
      slug: `reconcile-test-tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      address: '123 Test St',
      lat: 6.5244,
      lng: 3.3792,
      isDiscoverable: true,
      commissionPct: 0.1, // 10% — fraction, not percentage
    });
    await tenantRepo.save(tenant);
    tenantId = tenant.id;

    // Pricing matrix fixture — mirrors the production backfill's
    // A4/COLOR row (₦300/page at 600dpi simplex), which the per-file
    // fresh DB doesn't have (the dev seed only runs on the shared DB).
    await AppDataSource.getRepository(PricingConfig).save(
      AppDataSource.getRepository(PricingConfig).create({
        tenantId,
        paperSize: PaperSize.A4,
        colorType: ColorType.COLOR,
        isActive: true,
        pricePerPage: 200,
        price100Simplex: 100,
        price300Simplex: 200,
        price600Simplex: 300,
        price100Duplex: 150,
        price300Duplex: 250,
        price600Duplex: 350,
      }),
    );

    const userRepo = AppDataSource.getRepository(User);
    const user = userRepo.create({
      tenantId,
      firstName: 'Test',
      lastName: 'Customer',
      email: `reconcile-${Date.now()}@test.com`,
      phoneNumber: '08000000000',
      passwordHash: 'x',
      salt: 'x',
    });
    await userRepo.save(user);
    userId = user.id;

    // Zero-balance ledger bucket — never debited or credited again.
    const walletRepo = AppDataSource.getRepository(Wallet);
    const wallet = walletRepo.create({ tenantId, userId, balance: 0 });
    await walletRepo.save(wallet);
    walletId = wallet.id;
  });

  beforeEach(() => {
    mockCharge.mockReset();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch {}
    }
  });

  async function walletBalance(): Promise<number> {
    const w = await AppDataSource.getRepository(Wallet).findOne({ where: { id: walletId } });
    return Number(w!.balance);
  }

  async function transactions(): Promise<Transaction[]> {
    return AppDataSource.getRepository(Transaction).find({
      where: { walletId },
      order: { createdAt: 'ASC' },
    });
  }

  it('overpaid job → written off (no refund, wallet untouched, ledger only)', async () => {
    // runPostInitMigrations seeds the A4/COLOR/600-simplex cell at
    // ₦300/page → 5 pages estimated = ₦1500
    const { job } = await makeJob({ cost: 1500, estimatedPages: 5, withPayment: true });

    const walletBefore = await walletBalance();
    expect(walletBefore).toBe(0);

    const res = await applyRenderResult({
      printJobId: job.id,
      renderedKey: `renders/${tenantId}/${job.id}.pwg`,
      renderedPdfUrl: `http://x/renders/${tenantId}/${job.id}.pdf`,
      previewImageUrls: [],
      // Renderer counted 3 pages, not 5 → final cost ₦900 vs ₦1500 paid
      pageCount: 3,
      bytes: 2048,
    });
    expect(res.updated).toBe(true);
    expect(res.action).toBe('write-off');

    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    expect(fresh!.status).toBe(PrintJobStatus.READY);
    expect(Number(fresh!.finalCost)).toBe(900);
    expect(fresh!.costReconciledAt).toBeDefined();

    // No refund anywhere: wallet untouched, no REFUND transactions,
    // payment not marked.
    expect(await walletBalance()).toBe(0);
    expect((await transactions()).length).toBe(0);
    const payment = await AppDataSource.getRepository(Payment).findOne({
      where: { userId },
    });
    expect(payment!.refundedAt).toBeNull();
    expect(payment!.refundAmount).toBeNull();
  });

  it('underpaid job → shortfall recorded, NO charge at callback, job READY', async () => {
    const { job } = await makeJob({ cost: 900, estimatedPages: 3, withPayment: true });
    const res = await applyRenderResult({
      printJobId: job.id,
      renderedKey: `renders/${tenantId}/${job.id}.pwg`,
      renderedPdfUrl: `http://x/renders/${tenantId}/${job.id}.pdf`,
      previewImageUrls: [],
      // Renderer counted 7 pages → final cost ₦2100 vs ₦900 paid
      pageCount: 7,
      bytes: 4096,
    });
    expect(res.updated).toBe(true);
    expect(res.action).toBe('shortfall');
    expect(mockCharge).not.toHaveBeenCalled();

    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    expect(fresh!.status).toBe(PrintJobStatus.READY);
    expect(Number(fresh!.finalCost)).toBe(2100);
    expect(shortfallFor(fresh!)).toBe(1200);
  });

  it('release gate charges the saved card when the final cost is higher', async () => {
    mockCharge.mockResolvedValueOnce({ status: 'success', gateway_response: 'Approved' });

    const { job } = await makeJob({ cost: 900, estimatedPages: 3, withPayment: true });
    await applyRenderResult({
      printJobId: job.id,
      renderedKey: `renders/${tenantId}/${job.id}.pwg`,
      renderedPdfUrl: `http://x/renders/${tenantId}/${job.id}.pdf`,
      previewImageUrls: [],
      pageCount: 7,
      bytes: 4096,
    });

    const settlement = await settleShortfall(job.id);
    expect(settlement.settled).toBe(true);
    expect(settlement.shortfall).toBe(1200);

    // Charge hit the card for exactly the delta, with the tenant split
    expect(mockCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        amountNaira: 1200,
        authorizationCode: 'AUTH_TEST_123',
        reference: expect.stringMatching(/^DELTA_/),
      }),
    );

    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    // paid is now final → gate no longer fires
    expect(Number(fresh!.cost)).toBe(2100);
    expect(shortfallFor(fresh!)).toBe(0);

    // PRINT transaction recorded on the ledger bucket with commission
    const tx = (await transactions()).find(
      (t) => t.type === TransactionType.PRINT && Number(t.amount) === 1200,
    );
    expect(tx).toBeDefined();
    expect(Number(tx!.commissionAmount)).toBe(120); // 10% of ₦1200

    // Payment row bumped to the final collected amount
    const payment = await AppDataSource.getRepository(Payment).findOne({
      where: { reference: fresh!.paymentReference! },
    });
    expect(Number(payment!.amount)).toBe(2100);

    // Re-settling is a no-op (and never re-charges the card)
    const again = await settleShortfall(job.id);
    expect(again.settled).toBe(false);
    expect(again.reason).toBe('no-shortfall');
    expect(mockCharge).toHaveBeenCalledTimes(1);
  });

  it('release gate blocks when no card is on file', async () => {
    const { job } = await makeJob({
      cost: 900,
      estimatedPages: 3,
      withPayment: true,
      authorizationCode: null,
    });
    await applyRenderResult({
      printJobId: job.id,
      renderedKey: `renders/${tenantId}/${job.id}.pwg`,
      renderedPdfUrl: `http://x/renders/${tenantId}/${job.id}.pdf`,
      previewImageUrls: [],
      pageCount: 7,
      bytes: 4096,
    });

    const settlement = await settleShortfall(job.id);
    expect(settlement.settled).toBe(false);
    expect(settlement.reason).toBe('no-card-on-file');
    expect(settlement.shortfall).toBe(1200);
    expect(mockCharge).not.toHaveBeenCalled();

    // Job stays READY and unpaid — release is blocked until admin sorts it
    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    expect(fresh!.status).toBe(PrintJobStatus.READY);
    expect(shortfallFor(fresh!)).toBe(1200);
  });

  it('release gate blocks when the card charge is declined', async () => {
    mockCharge.mockResolvedValueOnce({ status: 'failed', gateway_response: 'Declined' });

    const { job } = await makeJob({ cost: 900, estimatedPages: 3, withPayment: true });
    await applyRenderResult({
      printJobId: job.id,
      renderedKey: `renders/${tenantId}/${job.id}.pwg`,
      renderedPdfUrl: `http://x/renders/${tenantId}/${job.id}.pdf`,
      previewImageUrls: [],
      pageCount: 7,
      bytes: 4096,
    });

    const settlement = await settleShortfall(job.id);
    expect(settlement.settled).toBe(false);
    expect(settlement.reason).toBe('charge-failed');
    expect(settlement.shortfall).toBe(1200);

    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    expect(fresh!.status).toBe(PrintJobStatus.READY);
    expect(Number(fresh!.cost)).toBe(900); // not settled
  });

  it('jobs with no payment row (CUPS ingress) pass the gate uncharged', async () => {
    const { job } = await makeJob({ cost: 900, estimatedPages: 3, withPayment: false });
    await applyRenderResult({
      printJobId: job.id,
      renderedKey: `renders/${tenantId}/${job.id}.pwg`,
      renderedPdfUrl: `http://x/renders/${tenantId}/${job.id}.pdf`,
      previewImageUrls: [],
      pageCount: 7,
      bytes: 4096,
    });

    const settlement = await settleShortfall(job.id);
    expect(settlement.settled).toBe(false);
    expect(settlement.reason).toBe('no-payment');
    expect(mockCharge).not.toHaveBeenCalled();
  });

  it('exact match → no write-off, no shortfall', async () => {
    const { job } = await makeJob({ cost: 1500, estimatedPages: 5, withPayment: true });
    const res = await applyRenderResult({
      printJobId: job.id,
      renderedKey: `renders/${tenantId}/${job.id}.pwg`,
      renderedPdfUrl: `http://x/renders/${tenantId}/${job.id}.pdf`,
      previewImageUrls: [],
      pageCount: 5,
      bytes: 2048,
    });
    expect(res.updated).toBe(true);
    expect(res.action).toBe('none');

    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    expect(Number(fresh!.finalCost)).toBe(1500);
    expect(shortfallFor(fresh!)).toBe(0);
    expect(fresh!.costReconciledAt).toBeDefined();
  });
});

