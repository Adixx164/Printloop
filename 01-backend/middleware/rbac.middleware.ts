import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../entities/user.entity';

/**
 * Fine-grained admin permissions. Stored on User.adminPrivileges as an
 * array of these string values. SUPER_ADMIN implicitly has all of them.
 */
export enum Permission {
  // Dashboard
  VIEW_DASHBOARD = 'view_dashboard',

  // Kiosks
  VIEW_KIOSKS = 'view_kiosks',
  MANAGE_KIOSKS = 'manage_kiosks',

  // Jobs
  VIEW_JOBS = 'view_jobs',
  REQUEUE_JOBS = 'requeue_jobs',
  CANCEL_JOBS = 'cancel_jobs',

  // Pricing
  VIEW_PRICING = 'view_pricing',
  MANAGE_PRICING = 'manage_pricing',

  // Promotions
  VIEW_PROMOTIONS = 'view_promotions',
  MANAGE_PROMOTIONS = 'manage_promotions',

  // Refunds / transactions
  VIEW_TRANSACTIONS = 'view_transactions',
  ISSUE_REFUNDS = 'issue_refunds',

  // Users
  VIEW_USERS = 'view_users',
  MANAGE_USERS = 'manage_users',
  BLOCK_USERS = 'block_users',

  // Reports
  VIEW_REPORTS = 'view_reports',
  EXPORT_REPORTS = 'export_reports',

  // Settings & roles
  VIEW_SETTINGS = 'view_settings',
  MANAGE_SETTINGS = 'manage_settings',
  MANAGE_ROLES = 'manage_roles',

  // Audit
  VIEW_AUDIT_LOG = 'view_audit_log',

  // Super admin (all)
  SUPER_ADMIN = 'super_admin',
}

export interface AuthedAdmin {
  id: string;
  userId: string;
  role: UserRole;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AuthedAdmin;
    }
  }
}

/**
 * Resolve the effective permission set for a user.
 * SUPER_ADMIN → every Permission. ADMIN → whatever is stored on
 * adminPrivileges. Regular users → none.
 */
function permissionsForUser(user: any): string[] {
  if (!user) return [];
  if (user.role === UserRole.SUPER_ADMIN) {
    return Object.values(Permission);
  }
  if (user.role === UserRole.ADMIN) {
    return Array.isArray(user.adminPrivileges) ? user.adminPrivileges : [];
  }
  return [];
}

/**
 * Require the authenticated user to be an admin AND hold ALL of the
 * given permissions. Must run after the JWT auth middleware (which sets
 * req.user). Populates req.admin for downstream handlers.
 */
export const requirePermission = (...required: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
      return;
    }

    const permissions = permissionsForUser(user);
    const isSuper = user.role === UserRole.SUPER_ADMIN;

    if (!isSuper) {
      const missing = required.filter((p) => !permissions.includes(p));
      if (missing.length > 0) {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          required,
          missing,
        });
        return;
      }
    }

    req.admin = {
      id: user.id,
      userId: user.id,
      role: user.role,
      permissions,
    };

    next();
  };
};

/**
 * Require ANY one of the given permissions (super admin always passes).
 */
export const requireAnyPermission = (...allowed: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
      return;
    }

    const permissions = permissionsForUser(user);
    const isSuper = user.role === UserRole.SUPER_ADMIN;

    if (!isSuper && !allowed.some((p) => permissions.includes(p))) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    req.admin = {
      id: user.id,
      userId: user.id,
      role: user.role,
      permissions,
    };

    next();
  };
};
