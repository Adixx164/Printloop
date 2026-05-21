import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { User } from '../entities/user.entity';
import { verifyToken } from '../utils/jwt';

/**
 * Verifies the Bearer JWT, loads the user, and attaches it to req.user.
 * Downstream RBAC middleware (requirePermission) reads req.user.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired token' });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: payload.userId } });

    if (!user) {
      res.status(401).json({ success: false, message: 'User no longer exists' });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({ success: false, message: 'Account is blocked' });
      return;
    }

    (req as any).user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
};

/** Alias for `authenticate` — clearer intent on customer (non-admin) routes. */
export const authenticateUser = authenticate;

/**
 * Attaches req.user when a valid Bearer token is present, but never blocks.
 * Used by endpoints that work for both guests and signed-in users
 * (e.g. joining a group session).
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return next();

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return next();
    }

    const user = await AppDataSource.getRepository(User).findOne({
      where: { id: payload.userId },
    });
    if (user && !user.isBlocked) (req as any).user = user;
    next();
  } catch {
    next();
  }
};
