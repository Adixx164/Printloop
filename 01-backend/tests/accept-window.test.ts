import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import { User, UserRole } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { PricingConfig, PaperSize, ColorType } from '../entities/pricingConfig.entity';
import { TenantBalance } from '../entities/tenantBalance.entity';
import { completePrintJobPayment } from '../services/payments.service';
import { applyRenderResult } from '../services/renderEnqueue.service';
import { enforceAcceptWindow, acceptJob } from '../services/acceptWindow.service';

const { mockRenderAdd, mockScheduledAdd } = vi.hoisted(() => ({
  mockRenderAdd: vi.fn().mockResolvedValue({ id: 'mock-render' }),
  mockScheduledAdd: vi.fn().mockResolvedValue({ id: 'mock-scheduled' }),
}));

vi.mock('../workers/queues', () => {
  return {
    renderQueue: { add: mockRenderAdd },
    scheduledQueue: { add: mockScheduledAdd },
  };
});

vi.mock('../config/redis', () => {
  return {
    REDIS_ENABLED: true,
  };
});

// Mock SMS and Email services to avoid timeouts
vi.mock('../services/sms.service', () => {
  return {
    SMSService: vi.fn().mockImplementation(() => ({
      sendPrintJobCode: vi.fn().mockResolvedValue({ success: true }),
      sendOTP: vi.fn().mockResolvedValue({ success: true }),
    })),
  };
});

vi.mock('../services/email.service', () => {
  return {
    EmailService: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockResolvedValue(true),
      sendPrintJobReceipt: vi.fn().mockResolvedValue(true),
      sendGroupInvitation: vi.fn().mockResolvedValue(true),
      sendTenantOwnerVerification: vi.fn().mockResolvedValue(true),
      sendPasswordReset: vi.fn().mockResolvedValue(true),
    })),
  };
});

const testDbFile = vi.hoisted(() => {
  const file = process.cwd() + '/data/accept-window-test.sqlite';
  process.env.DATABASE_FILE = file;
  return file;
});

const run = Date.now();

describe('Accept window (V2-58)', () => {
  let shopA: Tenant;
  let shopB: Tenant;
  let shopC: Tenant; // fresh tenant for the ledger-reversal test (no cross-test contamination)
  let customer: User;
  let wallet: Wallet;

  async function makeJob(
    tenantId: string,
    opts: { status: PrintJobStatus; code?: string },
  ): Promise<PrintJob> {
    return AppDataSource.getRepository(PrintJob).save(
      AppDataSource.getRepository(PrintJob).create({
        userId: customer.id,
        tenantId,
        fileId: '00000000-0000-0000-0000-000000000000',
        fileName: 'accept-test.pdf',
        code: opts.code ?? null,
        cost: 500,
        totalPages: 5,
        status: opts.status,
        requiresAccept: true,
        printConfiguration: {
          copies: 1,
          paper: 'A4',
          color: 'bw',
          sided: 'single',
          qualityDpi: 300,
        },
        expiresAt: new Date(Date.now() + 3600 * 1000),
      }),
    );
  }

  async function balanceOf(tenantId: string): Promise<number> {
    const row = await AppDataSource.getRepository(TenantBalance).findOne({
      where: { tenantId },
    });
    return Number(row?.lifetimeTenantNet ?? 0);
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
    shopA = await tenantRepo.save(
      tenantRepo.create({
        name: 'Shop A (origin)',
        slug: `shop-a-${run}`,
        address: 'Lagos A',
        lat: 6.5244,
        lng: 3.3792,
        isDiscoverable: true,
        commissionPct: 0.1,
        status: TenantStatus.ACTIVE,
      }),
    );
    shopB = await tenantRepo.save(
      tenantRepo.create({
        name: 'Shop B (nearest)',
        slug: `shop-b-${run}`,
        address: 'Lagos B',
        lat: 6.53,
        lng: 3.38,
        isDiscoverable: true,
        commissionPct: 0.1,
        status: TenantStatus.ACTIVE,
      }),
    );
    shopC = await tenantRepo.save(
      tenantRepo.create({
        name: 'Shop C (far origin)',
        slug: `shop-c-${run}`,
        address: 'Ikeja C',
        lat: 6.6,
        lng: 3.4,
        isDiscoverable: true,
        commissionPct: 0.1,
        status: TenantStatus.ACTIVE,
      }),
    );

    const userRepo = AppDataSource.getRepository(User);
    customer = await userRepo.save(
      userRepo.create({
        tenantId: shopA.id,
        firstName: 'Accept',
        lastName: 'Tester',
        email: `accept-${run}@test.com`,
        phoneNumber: '08000000000',
        passwordHash: '$2b$12$testhashplaceholder0000000000000000000000000000000000',
        salt: 'test-salt',
        role: UserRole.USER,
      }),
    );
    const walletRepo = AppDataSource.getRepository(Wallet);
    wallet = await walletRepo.save(
      walletRepo.create({
        tenantId: shopA.id,
        userId: customer.id,
        balance: 0,
      }),
    );

    // Shop B has an online kiosk (NODE_ENV=test → always online).
    await AppDataSource.getRepository(Kiosk).save(
      AppDataSource.getRepository(Kiosk).create({
        tenantId: shopB.id,
        name: 'B Kiosk',
        status: KioskStatus.ACTIVE,
        apiKey: `KSK_B_${run}`,
      }),
    );

    // Deactivate any seed rows, then seed the only active A4/bw pricing
    // cell so the render callback reconciles 5 pages @ ₦100 = ₦500.
    await AppDataSource.getRepository(PricingConfig)
      .createQueryBuilder()
      .update()
      .set({ isActive: false })
      .execute();
    await AppDataSource.getRepository(PricingConfig).save(
      AppDataSource.getRepository(PricingConfig).create({
        tenantId: shopA.id,
        paperSize: PaperSize.A4,
        colorType: ColorType.BLACK_WHITE,
        pricePerPage: 100,
        price300Simplex: 100,
        isActive: true,
      }),
    );
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

  it('a paid job for a marketplace shop becomes awaiting_accept after render', async () => {
    const job = await makeJob(shopA.id, { status: PrintJobStatus.PENDING });
    const res = await completePrintJobPayment(job.id, `REF_${run}_1`);
    expect(res.success).toBe(true);

    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    // Render enqueued (mocked) → RENDERING; requiresAccept stamped.
    expect(fresh!.requiresAccept).toBe(true);
    expect(fresh!.status).toBe(PrintJobStatus.RENDERING);
    // Accept window armed.
    expect(mockScheduledAdd).toHaveBeenCalledWith(
      'accept-window',
      { printJobId: job.id },
      expect.objectContaining({ delay: 120_000, jobId: `accept-window:${job.id}` }),
    );

    // Render completes → lands in awaiting_accept (not READY).
    const cb = await applyRenderResult({
      printJobId: job.id,
      renderedKey: `renders/${shopA.id}/${job.id}.pwg`,
      renderedPdfUrl: `http://x/renders/${job.id}.pdf`,
      previewImageUrls: [],
      pageCount: 5,
      bytes: 100,
    });
    expect(cb.updated).toBe(true);
    const after = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    expect(after!.status).toBe(PrintJobStatus.AWAITING_ACCEPT);
    expect(Number(after!.finalCost)).toBe(500);
  });

  it('an unaccepted job reroutes to the nearest open shop and reverses the ledger', async () => {
    // Fresh shop so the ledger starts at zero regardless of earlier tests.
    const job = await makeJob(shopC.id, { status: PrintJobStatus.AWAITING_ACCEPT });
    job.requiresAccept = true;
    await AppDataSource.getRepository(PrintJob).save(job);

    // Shop C was credited at payment; simulate that ledger entry.
    const { applyTransactionDelta } = await import('../services/tenantBalance.service');
    await applyTransactionDelta(shopC.id, 500, 50);
    expect(await balanceOf(shopC.id)).toBe(450);

    const result = await enforceAcceptWindow(job.id);
    expect(result.action).toBe('rerouted');
    expect(result.toTenantId).toBe(shopB.id);

    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    expect(fresh!.tenantId).toBe(shopB.id);
    expect(fresh!.reroutedFromTenantId).toBe(shopC.id);
    expect(fresh!.status).toBe(PrintJobStatus.AWAITING_ACCEPT);

    // Shop C's credit was reversed (450 → 0); window re-armed for B.
    expect(await balanceOf(shopC.id)).toBe(0);
    expect(mockScheduledAdd).toHaveBeenCalledWith(
      'accept-window',
      { printJobId: job.id },
      expect.objectContaining({ jobId: `accept-window:${job.id}` }),
    );
  });

  it('accepting a rerouted job makes it READY and credits the new shop', async () => {
    const job = await makeJob(shopB.id, { status: PrintJobStatus.AWAITING_ACCEPT });
    job.reroutedFromTenantId = shopA.id;
    await AppDataSource.getRepository(PrintJob).save(job);

    const res = await acceptJob(job.id);
    expect(res.accepted).toBe(true);

    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    expect(fresh!.status).toBe(PrintJobStatus.READY);
    expect(fresh!.reroutedFromTenantId).toBeNull();

    // The accepting shop gets the credit (500 - 10% = 450 net).
    expect(await balanceOf(shopB.id)).toBe(450);
  });

  it('auto-accepts when no other shop can take the job', async () => {
    // A job on shop A, but make shop B closed so no candidate exists.
    const bRepo = AppDataSource.getRepository(Tenant);
    const b = await bRepo.findOne({ where: { id: shopB.id } });
    b!.availability = 'closed';
    await bRepo.save(b!);

    const job = await makeJob(shopA.id, { status: PrintJobStatus.AWAITING_ACCEPT });
    const result = await enforceAcceptWindow(job.id);
    expect(result.action).toBe('auto-accepted');

    const fresh = await AppDataSource.getRepository(PrintJob).findOne({ where: { id: job.id } });
    expect(fresh!.status).toBe(PrintJobStatus.READY);
    expect(fresh!.tenantId).toBe(shopA.id);
  });

  it('is a no-op on jobs not in awaiting_accept', async () => {
    const job = await makeJob(shopA.id, { status: PrintJobStatus.READY });
    const result = await enforceAcceptWindow(job.id);
    expect(result.action).toBe('noop');
  });

  it('accepting twice is rejected', async () => {
    const job = await makeJob(shopA.id, { status: PrintJobStatus.AWAITING_ACCEPT });
    const first = await acceptJob(job.id);
    const second = await acceptJob(job.id);
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe('bad-status:ready');
  });
});
