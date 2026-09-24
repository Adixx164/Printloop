import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { Payment } from '../entities/payment.entity';
import { completePrintJobPayment } from '../services/payments.service';

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

// Set BEFORE the static imports load database.ts — without this every
// test file binds to the same default sqlite and they fight each other
// (and the dev server) with SQLITE_BUSY. vi.hoisted runs pre-import.
const testDbFile = vi.hoisted(() => {
  const file = process.cwd() + "/data/cups-billing-test.sqlite";
  process.env.DATABASE_FILE = file;
  return file;
});

// Unique per run — the dev DB is shared across test runs, so fixed
// references would collide.
const run1 = Date.now();
const run2 = run1 + 1;

describe('CUPS billing (V2-55)', () => {
  let tenantId: string;
  let userId: string;

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
      name: 'CUPS Test Tenant',
      slug: `cups-test-tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      address: '123 Test St',
      lat: 6.5244,
      lng: 3.3792,
      isDiscoverable: true,
      commissionPct: 0.1,
    });
    await tenantRepo.save(tenant);
    tenantId = tenant.id;

    const userRepo = AppDataSource.getRepository(User);
    const user = userRepo.create({
      tenantId,
      firstName: 'CUPS',
      lastName: 'User',
      email: `cups-${Date.now()}@test.com`,
      phoneNumber: '08000000002',
      passwordHash: 'x',
      salt: 'x',
      printToken: `test-token-${Date.now()}`,
    });
    await userRepo.save(user);
    userId = user.id;

    // Zero-balance ledger bucket (transactions.walletId is NOT NULL).
    await AppDataSource.getRepository(Wallet).save(
      AppDataSource.getRepository(Wallet).create({ tenantId, userId, balance: 0 }),
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

  it('reuses the pre-minted CUPS code, creates the Payment, and promotes the job', async () => {
    const jobRepo = AppDataSource.getRepository(PrintJob);
    const code1 = `AB${String(Date.now()).slice(-6)}`;
    // The CUPS route mints the code at submission so `lpq` shows it
    // before payment. completePrintJobPayment must NOT replace it.
    const job = jobRepo.create({
      userId,
      tenantId,
      fileId: '00000000-0000-0000-0000-000000000000',
      fileName: 'cups-test.pdf',
      code: code1,
      cost: 500,
      totalPages: 5,
      jobType: 'single',
      status: PrintJobStatus.PENDING,
      printConfiguration: {
        copies: 1,
        paper: 'A4',
        color: 'bw',
        sided: 'single',
        qualityDpi: 300,
      },
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });
    await jobRepo.save(job);

    const res = await completePrintJobPayment(job.id, 'JOB_REF_$run1', {
      authorizationCode: 'AUTH_$run1',
    });
    expect(res.success).toBe(true);
    expect(res.code).toBe(code1);

    const fresh = await jobRepo.findOne({ where: { id: job.id } });
    expect(fresh!.code).toBe(code1);
    expect(fresh!.paymentReference).toBe('JOB_REF_$run1');
    // Render enqueued post-payment (mocked queue) → RENDERING.
    expect(fresh!.status).toBe(PrintJobStatus.RENDERING);

    const payment = await AppDataSource.getRepository(Payment).findOne({
      where: { reference: 'JOB_REF_$run1' },
    });
    expect(payment).toBeDefined();
    expect(Number(payment!.amount)).toBe(500);
    expect(payment!.method).toBe('card');
    expect(payment!.authorizationCode).toBe('AUTH_$run1');
    expect(payment!.userId).toBe(userId);
  });

  it('is idempotent: a second webhook keeps the code and does not double-pay', async () => {
    const jobRepo = AppDataSource.getRepository(PrintJob);
    const code2 = `XY${String(Date.now()).slice(-6)}`;
    const job = jobRepo.create({
      userId,
      tenantId,
      fileId: '00000000-0000-0000-0000-000000000000',
      fileName: 'cups-retry.pdf',
      code: code2,
      cost: 300,
      totalPages: 3,
      jobType: 'single',
      status: PrintJobStatus.PENDING,
      printConfiguration: {
        copies: 1,
        paper: 'A4',
        color: 'bw',
        sided: 'single',
        qualityDpi: 300,
      },
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    });
    await jobRepo.save(job);

    await completePrintJobPayment(job.id, 'JOB_REF_$run2');
    const res = await completePrintJobPayment(job.id, 'JOB_REF_$run2DUP');
    expect(res.success).toBe(true);
    expect(res.code).toBe(code2);

    const fresh = await jobRepo.findOne({ where: { id: job.id } });
    expect(fresh!.code).toBe(code2);
    expect(fresh!.paymentReference).toBe('JOB_REF_$run2'); // first one wins

    const payments = await AppDataSource.getRepository(Payment).find({
      where: { userId },
    });
    expect(payments.filter((p) => p.reference === 'JOB_REF_$run2').length).toBe(1);
    expect(payments.filter((p) => p.reference === 'JOB_REF_$run2DUP').length).toBe(0);
  });
});


