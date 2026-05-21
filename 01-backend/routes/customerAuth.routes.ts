import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { signAccessToken } from '../utils/jwt';
import { authenticate } from '../middleware/auth.middleware';
import { SystemSetting } from '../entities/systemSetting.entity';

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
    if (await repo.findOne({ where: { email: normEmail } })) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = repo.create({
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

    // Optional signup bonus (real Wallet entity).
    let bonus = 0;
    try {
      const row = await AppDataSource.getRepository(SystemSetting).findOne({
        where: { key: 'newUserSignupBonus' },
      });
      bonus = Number(row?.value) || 0;
    } catch {
      /* settings optional */
    }
    await AppDataSource.getRepository(Wallet).save(
      AppDataSource.getRepository(Wallet).create({ userId: saved.id, balance: bonus })
    );

    const accessToken = signAccessToken({ userId: saved.id, role: saved.role });
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
    const user = await repo.findOne({ where: { email: String(email).trim().toLowerCase() } });
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }
    if (user.isBlocked) {
      res.status(403).json({ success: false, message: 'This account is blocked.' });
      return;
    }
    user.lastLoginAt = new Date();
    await repo.save(user);
    const accessToken = signAccessToken({ userId: user.id, role: user.role });
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

export default router;
