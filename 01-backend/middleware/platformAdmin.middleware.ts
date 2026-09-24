import { Request, Response, NextFunction } from 'express';
import { User, UserRole } from '../entities/user.entity';

/**
 * Gate for platform-level endpoints (Dimension 11).
 *
 * Distinct from tenant-admin auth: a tenant admin is bound to a
 * specific tenant via `TenantMember` and can only act on that
 * tenant's data. A platform admin (PrintLoop's own staff) has
 * `UserRole.SUPER_ADMIN` and can list, suspend, impersonate, etc.
 * across every tenant.
 *
 * Must run after `authenticate`. Refuses every non-SUPER_ADMIN with
 * 403 — no PLATFORM_SUPPORT split yet; that's a v2 split when we
 * hire more than one platform-side operator.
 */
export const requirePlatformAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    res
      .status(401)
      .json({ success: false, message: 'Authentication required' });
    return;
  }
  if (user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({
      success: false,
      message: 'Platform admin access required',
      code: 'NOT_PLATFORM_ADMIN',
    });
    return;
  }
  next();
};
