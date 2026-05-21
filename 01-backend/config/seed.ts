import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { AppDataSource } from './database';
import { User, UserRole } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { Kiosk, KioskStatus } from '../entities/kiosk.entity';
import { PricingConfig, PaperSize, ColorType } from '../entities/pricingConfig.entity';
import { ensureSystemSettings } from './settings';
import { Payment } from '../entities/payment.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { Promotion } from '../entities/promotion.entity';
import { AuditLog } from '../entities/auditLog.entity';
import { GroupSession, GroupSessionStatus } from '../entities/groupSession.entity';

function code(len = 6) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () => a[Math.floor(Math.random() * a.length)]).join('');
}

/**
 * Idempotent boot seed. Runs only when the users table is empty so the
 * admin console has real data to work with on first launch.
 *
 * Default super admin: admin@printloop.test / Admin1234!
 */
export async function runSeed(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User);
  if ((await userRepo.count()) > 0) {
    console.log('Seed: users already present, skipping.');
    return;
  }

  console.log('Seed: empty database — seeding demo data...');

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  // ── Users ──────────────────────────────────────────────────────────────
  const admin = await userRepo.save(
    userRepo.create({
      firstName: 'Print',
      lastName: 'Admin',
      email: 'admin@printloop.test',
      phoneNumber: '+2348000000001',
      passwordHash: hash('Admin1234!'),
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.SUPER_ADMIN,
      adminPrivileges: [],
    })
  );

  const opsAdmin = await userRepo.save(
    userRepo.create({
      firstName: 'Ops',
      lastName: 'Manager',
      email: 'ops@printloop.test',
      phoneNumber: '+2348000000002',
      passwordHash: hash('Admin1234!'),
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.ADMIN,
      adminPrivileges: ['view_dashboard', 'view_jobs', 'requeue_jobs', 'view_kiosks', 'manage_kiosks'] as any,
    })
  );

  const demo = await userRepo.save(
    userRepo.create({
      firstName: 'Demo',
      lastName: 'Student',
      email: 'student@printloop.test',
      phoneNumber: '+2348000000000',
      passwordHash: hash('Password1!'),
      salt: 'bcrypt',
      isEmailVerified: true,
      role: UserRole.USER,
      adminPrivileges: [],
    })
  );

  const walletRepo = AppDataSource.getRepository(Wallet);
  await walletRepo.save(walletRepo.create({ userId: demo.id, balance: 2450 }));
  await walletRepo.save(walletRepo.create({ userId: opsAdmin.id, balance: 0 }));

  // ── Kiosks ─────────────────────────────────────────────────────────────
  const kioskRepo = AppDataSource.getRepository(Kiosk);
  const kioskSeed = [
    { name: 'Yaba Central', location: 'Yaba, Lagos', campus: 'Yaba', status: KioskStatus.ACTIVE },
    { name: 'UNILAG — Faculty of Arts', location: 'Akoka', campus: 'UNILAG', status: KioskStatus.ACTIVE },
    { name: 'UNILAG — Sports Centre', location: 'Akoka', campus: 'UNILAG', status: KioskStatus.MAINTENANCE },
    { name: 'Bariga Print Hub', location: 'Bariga', campus: 'Bariga', status: KioskStatus.OFFLINE },
  ];
  const kiosks: Kiosk[] = [];
  for (const k of kioskSeed) {
    kiosks.push(
      await kioskRepo.save(
        kioskRepo.create({
          ...k,
          apiKey: `KSK_${randomBytes(18).toString('base64url')}`,
          printerModel: 'HP LaserJet Pro M404n',
          ipAddress: `192.168.1.${100 + kiosks.length}`,
          lastSeenAt: new Date(),
          totalJobsPrinted: Math.floor(Math.random() * 400) + 50,
          totalPagesPrinted: Math.floor(Math.random() * 4000) + 500,
        })
      )
    );
  }

  // ── Pricing configs ────────────────────────────────────────────────────
  const pricingRepo = AppDataSource.getRepository(PricingConfig);
  await pricingRepo.save([
    pricingRepo.create({ paperSize: PaperSize.A4, colorType: ColorType.BLACK_WHITE, pricePerPage: 5, duplexMultiplier: 0.85, highResolutionMultiplier: 1.2 }),
    pricingRepo.create({ paperSize: PaperSize.A4, colorType: ColorType.COLOR, pricePerPage: 25, duplexMultiplier: 0.85, highResolutionMultiplier: 1.2 }),
    pricingRepo.create({ paperSize: PaperSize.A3, colorType: ColorType.BLACK_WHITE, pricePerPage: 15, duplexMultiplier: 0.85, highResolutionMultiplier: 1.2 }),
    pricingRepo.create({ paperSize: PaperSize.A3, colorType: ColorType.COLOR, pricePerPage: 50, duplexMultiplier: 0.85, highResolutionMultiplier: 1.2 }),
  ]);

  // ── System settings (delegated to the shared, idempotent catalog) ──────
  await ensureSystemSettings();

  // ── Payments + print jobs spread across the last 30 days ───────────────
  const paymentRepo = AppDataSource.getRepository(Payment);
  const jobRepo = AppDataSource.getRepository(PrintJob);
  const statuses = [PrintJobStatus.DONE, PrintJobStatus.DONE, PrintJobStatus.READY, PrintJobStatus.FAILED];

  for (let d = 29; d >= 0; d--) {
    const when = new Date();
    when.setDate(when.getDate() - d);
    const jobsThatDay = 1 + ((d * 7) % 4);
    for (let n = 0; n < jobsThatDay; n++) {
      const pages = 2 + ((d + n) % 18);
      const cost = pages * 5;
      const status = statuses[(d + n) % statuses.length];
      const kiosk = kiosks[(d + n) % kiosks.length];

      const job = await jobRepo.save(
        jobRepo.create({
          userId: demo.id,
          fileName: `Document ${d}-${n}.pdf`,
          code: code(),
          cost,
          totalPages: pages,
          jobType: 'single',
          status,
          printConfiguration: { copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300 },
          kioskId: kiosk.id,
          printerId: kiosk.id,
          expiresAt: new Date(when.getTime() + 24 * 3600 * 1000),
          completedAt: status === PrintJobStatus.DONE ? when : (null as any),
        })
      );
      await AppDataSource.query(
        'UPDATE print_jobs SET createdAt = ?, updatedAt = ? WHERE id = ?',
        [when.toISOString(), when.toISOString(), job.id]
      );

      if (status === PrintJobStatus.DONE) {
        const pay = await paymentRepo.save(
          paymentRepo.create({
            userId: demo.id,
            amount: cost,
            status: 'SUCCESS',
            method: 'wallet',
            reference: job.code,
            description: job.fileName,
          })
        );
        await AppDataSource.query(
          'UPDATE payments SET createdAt = ?, updatedAt = ? WHERE id = ?',
          [when.toISOString(), when.toISOString(), pay.id]
        );
      }
    }
  }

  // ── Promotions ─────────────────────────────────────────────────────────
  const promoRepo = AppDataSource.getRepository(Promotion);
  await promoRepo.save([
    promoRepo.create({ code: 'EXAMWEEK', name: 'Exam week boost', description: '20 free pages after 100', discountType: 'free_pages', discountValue: 20, status: 'active', usageCount: 44 }),
    promoRepo.create({ code: 'FIRST2FREE', name: 'First two pages free', description: 'First print credit', discountType: 'free_pages', discountValue: 2, status: 'inactive', usageCount: 128 }),
  ]);

  // ── Group session ──────────────────────────────────────────────────────
  const sessionRepo = AppDataSource.getRepository(GroupSession);
  await sessionRepo.save(
    sessionRepo.create({
      hostUserId: demo.id,
      groupName: 'CSC 301 Assignment 2',
      deadline: new Date(Date.now() + 8 * 3600 * 1000),
      status: GroupSessionStatus.OPEN,
      shareUrl: '/groups/csc-301-assignment-2/join',
      defaultOptions: { paper: 'A4', color: 'bw', sided: 'double', qualityDpi: 300, enforce: true },
    })
  );

  // ── Audit log seed ─────────────────────────────────────────────────────
  const auditRepo = AppDataSource.getRepository(AuditLog);
  await auditRepo.save([
    auditRepo.create({ actorId: admin.id, actorName: 'Print Admin', action: 'system.seeded', target: 'system', detail: { note: 'Initial demo data' }, ipAddress: '127.0.0.1' }),
    auditRepo.create({ actorId: opsAdmin.id, actorName: 'Ops Manager', action: 'kiosk.status_changed', target: `kiosk:${kiosks[3].id}`, detail: { to: 'OFFLINE' }, ipAddress: '127.0.0.1' }),
  ]);

  console.log('Seed: done. Admin login → admin@printloop.test / Admin1234!');
}
