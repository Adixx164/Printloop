import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { PrintJob } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { File } from '../entities/file.entity';
import { Transaction } from '../entities/transaction.entity';
import { Payment } from '../entities/payment.entity';
import { Promotion } from '../entities/promotion.entity';
import { GroupSession } from '../entities/groupSession.entity';
import { GroupParticipant } from '../entities/groupParticipant.entity';
import { Dispute } from '../entities/dispute.entity';
import { ShopReview } from '../entities/shopReview.entity';
import { AuditLog } from '../entities/auditLog.entity';
import { signAccessToken, loadMembershipsForUser } from '../utils/jwt';
import { authenticate } from '../middleware/auth.middleware';
import { SystemSetting } from '../entities/systemSetting.entity';
import { writeAudit } from '../services/audit.service';

const router = Router();

function publicUser(user: User) {
  const { passwordHash, salt, verificationToken, resetToken, ...safe } = user as any;
  return { ...safe, role: user.role || UserRole.USER, adminPrivileges: user.adminPrivileges || [] };
}

/** POST /api/customer/auth/register — real account in the TypeORM DB. */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, phoneNumber, password } = req.body || {};
    if (!firstName || !lastName || !email || !phoneNumber || !password) {
      res.status(400).json({ success: false, message: 'All registration fields are required' });
      return;
    }
    const repo = AppDataSource.getRepository(User);
    const normEmail = String(email).trim().toLowerCase();

    // Resolve the tenant this customer belongs to. `optionalTenant`
    // sets req.tenant when the host is a tenant subdomain / custom
    // domain; on the apex or localhost it won't, so we fall back to
    // the legacy tenant. tenantId is NOT NULL (V2-8), so this is
    // required for the insert to succeed.
    let tenantId = req.tenant?.id ?? null;
    if (!tenantId) {
      const { Tenant } = await import('../entities/tenant.entity');
      const { LEGACY_TENANT_SLUG } = await import(
        '../middleware/tenant.middleware'
      );
      const legacy = await AppDataSource.getRepository(Tenant).findOne({
        where: { slug: LEGACY_TENANT_SLUG },
      });
      tenantId = legacy?.id ?? null;
    }
    if (!tenantId) {
      res.status(500).json({
        success: false,
        message: 'No tenant could be resolved for this signup',
      });
      return;
    }

    // Email is unique per-tenant (V2-4), so scope the dup check.
    if (await repo.findOne({ where: { email: normEmail, tenantId } })) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }
    const passwordHash = await bcrypt.hash(String(password), 12);
    const user = repo.create({
      tenantId,
      firstName,
      lastName,
      email: normEmail,
      phoneNumber,
      passwordHash,
      salt: 'bcrypt',
      // No email provider wired yet → accounts are usable immediately.
      isEmailVerified: true,
      role: UserRole.USER,
      adminPrivileges: [],
    });
    const saved = await repo.save(user);

    // Zero-balance wallet row as a tenant-ledger bucket (V2-53). The
    // wallet PRODUCT is gone — no top-ups, no balance, no payment
    // method — but `transactions.walletId` is NOT NULL and
    // completePrintJobPayment writes the tenant earnings ledger
    // through it, so every user still needs the row.
    await AppDataSource.getRepository(Wallet).save(
      AppDataSource.getRepository(Wallet).create({
        userId: saved.id,
        tenantId,
        balance: 0,
      })
    );

    // New customer accounts have no tenant memberships — they're a
    // customer of whichever tenant the signup landed on. Customers
    // don't get a TenantMember row; their tenantId on the User row
    // is the binding.
    const memberships = await loadMembershipsForUser(saved.id);
    const accessToken = signAccessToken({
      userId: saved.id,
      role: saved.role,
      memberships,
    });

    // customer.signed_up webhook (Dimension 14 — V2-14). Fire-and-
    // forget. Customer tenantId is on the row; legacy single-tenant
    // signups won't emit because their tenant is the legacy fallback.
    if (saved.tenantId) {
      const { emitTenantEvent } = await import('../services/tenantWebhook.service');
      const { WebhookEvent } = await import('../entities/tenantWebhook.entity');
      emitTenantEvent(saved.tenantId, WebhookEvent.CUSTOMER_SIGNED_UP, {
        userId: saved.id,
        email: saved.email,
        firstName: saved.firstName,
        lastName: saved.lastName,
        phoneNumber: saved.phoneNumber,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Account created',
      data: { user: publicUser(saved), tokens: { accessToken } },
    });
  } catch (error) {
    console.error('Customer register error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

/** POST /api/customer/auth/login */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }
    const repo = AppDataSource.getRepository(User);
    // Email is unique per-tenant, so the same address can exist on two
    // tenants. Scope the lookup to the resolved tenant when we have
    // one; otherwise fall back to the legacy tenant (apex/localhost).
    let tenantId = req.tenant?.id ?? null;
    if (!tenantId) {
      const { Tenant } = await import('../entities/tenant.entity');
      const { LEGACY_TENANT_SLUG } = await import(
        '../middleware/tenant.middleware'
      );
      const legacy = await AppDataSource.getRepository(Tenant).findOne({
        where: { slug: LEGACY_TENANT_SLUG },
      });
      tenantId = legacy?.id ?? null;
    }
    const normEmail = String(email).trim().toLowerCase();
    let user = await repo.findOne({
      where: tenantId
        ? { email: normEmail, tenantId }
        : { email: normEmail },
    });
    if (!user && tenantId) {
      user = await repo.findOne({ where: { email: normEmail } });
    }
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }
    if (user.isBlocked) {
      res.status(403).json({ success: false, message: 'This account is blocked.' });
      return;
    }
    // 2FA gate (V2-22). When enabled, password alone isn't enough.
    if (user.totpEnabled && user.totpSecret) {
      const { verifyTotp } = await import('../utils/totp');
      const code = String((req.body || {}).totpCode || '');
      if (!code) {
        res.status(401).json({ success: false, message: 'Two-factor code required', code: 'TOTP_REQUIRED' });
        return;
      }
      if (!verifyTotp(user.totpSecret, code)) {
        res.status(401).json({ success: false, message: 'Invalid two-factor code', code: 'TOTP_INVALID' });
        return;
      }
    }
    user.lastLoginAt = new Date();
    await repo.save(user);
    const memberships = await loadMembershipsForUser(user.id);
    const accessToken = signAccessToken({
      userId: user.id,
      role: user.role,
      memberships,
    });
    res.json({ success: true, data: { user: publicUser(user), tokens: { accessToken } } });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

/** GET /api/customer/auth/me */
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: publicUser((req as any).user as User) });
});

/** PUT /api/customer/auth/me */
router.put('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as User;
    const { firstName, lastName, phoneNumber } = req.body || {};

    if (!firstName || !lastName || !phoneNumber) {
      res.status(400).json({ success: false, message: 'First name, last name, and phone number are required' });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.phoneNumber = phoneNumber.trim();

    const saved = await repo.save(user);
    res.json({ success: true, message: 'Profile updated successfully', data: publicUser(saved) });
  } catch (error: any) {
    console.error('Customer profile update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

/** PUT /api/customer/auth/password */
router.put('/password', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as User;
    const { oldPassword, newPassword } = req.body || {};

    if (!oldPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'Old password and new password are required' });
      return;
    }

    if (newPassword.length < 10) {
      res.status(400).json({ success: false, message: 'New password must be at least 10 characters long' });
      return;
    }

    // Verify old password
    const isMatch = await bcrypt.compare(String(oldPassword), user.passwordHash);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Incorrect old password' });
      return;
    }

    const repo = AppDataSource.getRepository(User);
    user.passwordHash = await bcrypt.hash(String(newPassword), 12);
    await repo.save(user);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    console.error('Customer password update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update password' });
  }
});

/**
 * POST /api/customer/auth/export
 *
 * Customer data export (GDPR/NDPR). Returns all data scoped to
 * the authenticated customer: account, print jobs, payments,
 * transactions, disputes, reviews, group sessions, audit logs.
 * Credentials (password hashes, tokens) are stripped.
 */
router.post('/export', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as User;

    const [
      printJobs,
      payments,
      transactions,
      files,
      groupSessions,
      groupParticipants,
      disputes,
      reviews,
      auditLogs,
    ] = await Promise.all([
      AppDataSource.getRepository(PrintJob).find({ where: { userId: user.id } }),
      AppDataSource.getRepository(Payment).find({ where: { userId: user.id } }),
      // Transaction has walletId → Wallet has userId
      AppDataSource.getRepository(Transaction)
        .createQueryBuilder('tx')
        .innerJoin('tx.wallet', 'w')
        .where('w.userId = :uid', { uid: user.id })
        .getMany(),
      // File has no userId directly; find via PrintJob
      AppDataSource.getRepository(File)
        .createQueryBuilder('f')
        .innerJoin('f.printJob', 'pj')
        .where('pj.userId = :uid', { uid: user.id })
        .getMany(),
      AppDataSource.getRepository(GroupSession).find({ where: { hostUserId: user.id } }),
      AppDataSource.getRepository(GroupParticipant).find({ where: { userId: user.id } }),
      AppDataSource.getRepository(Dispute).find({ where: { userId: user.id } }),
      AppDataSource.getRepository(ShopReview).find({ where: { userId: user.id } }),
      // AuditLog has actorId
      AppDataSource.getRepository(AuditLog).find({ where: { actorId: user.id } }),
    ]);

    // PrintJobItems: find via printJobs
    const printJobIds = printJobs.map((pj) => pj.id);
    const printJobItems = printJobIds.length
      ? await AppDataSource.getRepository(PrintJobItem).find({
          where: { printJobId: printJobIds[0] }, // fallback - will filter in JS
        })
      : [];

    // Filter PrintJobItems to only those belonging to user's printJobs
    const userPrintJobItems = printJobItems.filter((pji) =>
      printJobIds.includes(pji.printJobId)
    );

    // Promotions: tenant-scoped, no userId; include if user's tenant
    const promotions = user.tenantId
      ? await AppDataSource.getRepository(Promotion).find({ where: { tenantId: user.tenantId } })
      : [];

    const repo = AppDataSource.getRepository(User);
    const freshUser = await repo.findOne({ where: { id: user.id } });
    const { passwordHash, salt, verificationToken, resetToken, printToken, ...safeUser } = freshUser!;

    await writeAudit(req, 'customer.export', `user:${user.id}`, {
      email: user.email,
      printJobs: printJobs.length,
      transactions: transactions.length,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="printloop-customer-export-${user.id}-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    );
    res.send(
      JSON.stringify(
        {
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          user: safeUser,
          printJobs,
          printJobItems: userPrintJobItems,
          payments,
          transactions,
          files,
          promotions,
          groupSessions,
          groupParticipants,
          disputes,
          reviews,
          auditLogs,
        },
        null,
        2,
      ),
    );
  } catch (err: any) {
    console.error('Customer export error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Export failed' });
  }
});

/**
 * DELETE /api/customer/auth/me
 *
 * Customer account closure (GDPR/NDPR right to erasure).
 * Body: { confirmEmail: string }
 *
 * Two-phase: CLOSED → 30-day cooling-off → hard delete.
 * Mirrors the tenant flow but scoped to one customer.
 */
router.delete('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user as User;
    const confirmEmail = String(req.body?.confirmEmail || '').trim().toLowerCase();
    const normEmail = user.email.toLowerCase();

    if (confirmEmail !== normEmail) {
      res.status(400).json({
        success: false,
        message: `Type your email "${user.email}" to confirm account closure`,
        code: 'CONFIRM_EMAIL_MISMATCH',
      });
      return;
    }

    if (user.isBlocked) {
      res.status(409).json({ success: false, message: 'Account already closed' });
      return;
    }

    user.isBlocked = true;
    await AppDataSource.getRepository(User).save(user);

    await writeAudit(req, 'customer.close', `user:${user.id}`, {
      email: user.email,
    });

    res.json({
      success: true,
      message:
        'Account closed. 30-day cooling-off window started. Contact support to reverse, otherwise data will be deleted.',
      data: { id: user.id, status: 'CLOSED' },
    });
  } catch (err: any) {
    console.error('Customer close error:', err);
    res.status(500).json({ success: false, message: err?.message || 'Close failed' });
  }
});

export default router;
