import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/user.entity';
import { signAccessToken, loadMembershipsForUser } from '../utils/jwt';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

function publicUser(user: User) {
  const { passwordHash, salt, verificationToken, resetToken, ...safe } = user as any;
  return {
    ...safe,
    role: user.role || UserRole.USER,
    adminPrivileges: user.adminPrivileges || [],
  };
}

/**
 * POST /api/admin/auth/login
 * Admin-gated login. Rejects users without ADMIN / SUPER_ADMIN role.
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { email: String(email).trim().toLowerCase() } });

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ success: false, message: 'Access denied. Admin credentials required.' });
      return;
    }

    // 2FA gate (V2-22) — admin/platform accounts are highest-value.
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
    await userRepo.save(user);

    // Admins authenticate per-platform but their tenant membership
    // set determines which tenant data they can see. Memberships are
    // baked into the JWT so RBAC checks don't need a DB round-trip.
    const memberships = await loadMembershipsForUser(user.id);
    const accessToken = signAccessToken({
      userId: user.id,
      role: user.role,
      memberships,
    });

    res.json({
      success: true,
      data: {
        user: publicUser(user),
        tokens: { accessToken },
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

/**
 * GET /api/admin/auth/me — current authenticated admin profile.
 */
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({ success: false, message: 'Admin access required' });
    return;
  }
  res.json({ success: true, data: publicUser(user) });
});

export default router;
