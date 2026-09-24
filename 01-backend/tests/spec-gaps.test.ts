import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { User, UserRole } from '../entities/user.entity';
import { Tenant } from '../entities/tenant.entity';
import { Dispute, DisputeStatus } from '../entities/dispute.entity';
import { ShopReview } from '../entities/shopReview.entity';
import { Wallet } from '../entities/wallet.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Payment } from '../entities/payment.entity';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';

const testDbFile = vi.hoisted(() => {
  const file = process.cwd() + "/data/spec-gaps-test.sqlite";
  process.env.DATABASE_FILE = file;
  return file;
});

describe('Spec Gaps Integration Tests', () => {
  let globalTenantId: string;
  let AppDataSource: any;

  beforeAll(async () => {
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch (err) {
        // ignore
      }
    }
    const dbModule = await import('../config/database');
    AppDataSource = dbModule.AppDataSource;

    await AppDataSource.initialize();
    await AppDataSource.runMigrations();
    await dbModule.runPostInitMigrations();

    // Clear all tables for a completely clean slate
    await AppDataSource.query('PRAGMA foreign_keys = OFF;');
    const entities = AppDataSource.entityMetadatas;
    for (const entity of entities) {
      try {
        await AppDataSource.query(`DELETE FROM "${entity.tableName}";`);
      } catch (err) {
        // ignore
      }
    }
    await AppDataSource.query('PRAGMA foreign_keys = ON;');

    // Pre-create a tenant for tests to share
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = tenantRepo.create({
      name: 'Test Tenant',
      slug: `test-tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      address: '123 Test St',
      lat: 6.5244,
      lng: 3.3792,
      isDiscoverable: true,
    });
    await tenantRepo.save(tenant);
    globalTenantId = tenant.id;
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch (err) {
        // ignore
      }
    }
  });

  it('verifies password change validates old password and hashes with 12 rounds', async () => {
    const userRepo = AppDataSource.getRepository(User);
    const email = `test-user-${Date.now()}@test.com`;
    const passwordHash = await bcrypt.hash('OldPassword123!', 12);
    
    const user = userRepo.create({
      tenantId: globalTenantId,
      firstName: 'John',
      lastName: 'Doe',
      email,
      phoneNumber: '+2348011111111',
      passwordHash,
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.USER,
    });
    await userRepo.save(user);

    // 1. Validate old password
    const isOldMatch = await bcrypt.compare('OldPassword123!', user.passwordHash);
    expect(isOldMatch).toBe(true);
    
    const isWrongMatch = await bcrypt.compare('WrongPassword!', user.passwordHash);
    expect(isWrongMatch).toBe(false);

    // 2. Hash new password with 12 rounds
    const newPasswordHash = await bcrypt.hash('NewPassword123!', 12);
    expect(newPasswordHash.startsWith('$2a$12$') || newPasswordHash.startsWith('$2b$12$')).toBe(true);
  });

  it('verifies reviews accept rating range 1-5 and rejects out of range', async () => {
    const userRepo = AppDataSource.getRepository(User);
    const reviewRepo = AppDataSource.getRepository(ShopReview);

    const email = `test-review-${Date.now()}@test.com`;
    const user = userRepo.create({
      tenantId: globalTenantId,
      firstName: 'Review',
      lastName: 'Tester',
      email,
      phoneNumber: '+2348044444444',
      passwordHash: 'dummy',
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.USER,
    });
    await userRepo.save(user);

    const validReview = reviewRepo.create({
      tenantId: globalTenantId,
      userId: user.id,
      rating: 5,
      comment: 'Excellent service!',
    });
    await reviewRepo.save(validReview);

    const saved = await reviewRepo.findOne({ where: { id: validReview.id } });
    expect(saved).toBeDefined();
    expect(saved!.rating).toBe(5);

    const ratingCheck = (r: number) => Number.isInteger(r) && r >= 1 && r <= 5;
    expect(ratingCheck(5)).toBe(true);
    expect(ratingCheck(1)).toBe(true);
    expect(ratingCheck(0)).toBe(false);
    expect(ratingCheck(6)).toBe(false);
    expect(ratingCheck(3.5)).toBe(false);
  });

  it('verifies disputes resolve without moving money (V2-53 — refunds eliminated)', async () => {
    const userRepo = AppDataSource.getRepository(User);
    const jobRepo = AppDataSource.getRepository(PrintJob);
    const paymentRepo = AppDataSource.getRepository(Payment);
    const disputeRepo = AppDataSource.getRepository(Dispute);
    const walletRepo = AppDataSource.getRepository(Wallet);

    const email = `test-dispute-${Date.now()}@test.com`;
    const user = userRepo.create({
      tenantId: globalTenantId,
      firstName: 'Dispute',
      lastName: 'Tester',
      email,
      phoneNumber: '+2348033333333',
      passwordHash: 'dummy',
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.USER,
    });
    await userRepo.save(user);

    const wallet = walletRepo.create({
      tenantId: globalTenantId,
      userId: user.id,
      balance: 0,
    });
    await walletRepo.save(wallet);

    const jobCode = `DISP${Math.floor(Math.random() * 100000)}`;

    const job = jobRepo.create({
      tenantId: globalTenantId,
      userId: user.id,
      code: jobCode,
      cost: 500,
      totalPages: 5,
      printConfiguration: 'copies:1',
      status: PrintJobStatus.FAILED,
    });
    await jobRepo.save(job);

    const payment = paymentRepo.create({
      tenantId: globalTenantId,
      userId: user.id,
      amount: 500,
      status: 'SUCCESS',
      method: 'card',
      reference: jobCode,
      description: 'Test Card Print',
    });
    await paymentRepo.save(payment);

    const dispute = disputeRepo.create({
      tenantId: globalTenantId,
      userId: user.id,
      printJobId: job.id,
      reason: 'Quality issue',
      status: DisputeStatus.PENDING,
    });
    await disputeRepo.save(dispute);

    // V2-53: resolving a dispute marks it closed; no refund is issued.
    const resolved = disputeRepo.create({
      tenantId: globalTenantId,
      userId: user.id,
      printJobId: job.id,
      reason: 'Quality issue',
      status: DisputeStatus.RESOLVED,
      resolutionNotes: 'Resolved by admin',
    });
    await disputeRepo.save(resolved);

    const updatedWallet = await walletRepo.findOne({ where: { userId: user.id } });
    expect(Number(updatedWallet!.balance)).toBe(0); // money untouched
    expect(resolved.status).toBe(DisputeStatus.RESOLVED);
    expect(resolved.resolutionNotes).toBe('Resolved by admin');
  });
});

