import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/user.entity';
import { signAccessToken } from '../utils/jwt';
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

    user.lastLoginAt = new Date();
    await userRepo.save(user);

    const accessToken = signAccessToken({ userId: user.id, role: user.role });

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
