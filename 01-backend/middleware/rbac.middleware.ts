import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../entities/user.entity';
import { TenantMemberRole } from '../entities/tenantMember.entity';

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

  // Blog (V2-54)
  MANAGE_BLOG = 'manage_blog',

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
 *
 * **Tenant-aware as of V2-9.** When `req.tenant` is set (which it is
 * on all `/api/admin/*` routes after `resolveTenant`), this also
 * verifies the user has a TenantMember row for that tenant. Without
 * the membership check, a global admin on Tenant A could send
 * `X-Tenant-Slug: tenant-b` and successfully manage Tenant B.
 *
 * SUPER_ADMIN bypasses the membership check — they're a
 * platform-level role allowed to act on any tenant for support.
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

    // Tenant-membership guard. Skipped for SUPER_ADMIN (platform
    // role) and for routes that didn't resolve a tenant.
    if (!isSuper && req.tenant) {
      const memberships = req.tenantMemberships || [];
      const hasMembership = memberships.some(
        (m) => m.tenantId === req.tenant!.id,
      );
      if (!hasMembership) {
        res.status(403).json({
          success: false,
          message: 'Not a member of this tenant',
          code: 'NOT_TENANT_MEMBER',
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
 * Require the authenticated user to be a member of the resolved
 * tenant (`req.tenant`), optionally with one of the given tenant
 * roles. Use on tenant-admin-facing routes that aren't gated by a
 * platform Permission — e.g. `/api/saas/me`, `/api/saas/payouts`.
 *
 * Platform SUPER_ADMIN always passes (impersonation / support).
 */
export const requireTenantMembership = (
  ...allowedRoles: TenantMemberRole[]
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }
    if (!req.tenant) {
      res.status(400).json({
        success: false,
        message: 'Tenant could not be resolved for this request',
      });
      return;
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      next();
      return;
    }
    const memberships = req.tenantMemberships || [];
    const membership = memberships.find(
      (m) => m.tenantId === req.tenant!.id,
    );
    if (!membership) {
      res.status(403).json({
        success: false,
        message: 'Not a member of this tenant',
        code: 'NOT_TENANT_MEMBER',
      });
      return;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
      res.status(403).json({
        success: false,
        message: `Tenant role '${membership.role}' is not authorised; need one of ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_TENANT_ROLE',
      });
      return;
    }
    next();
  };
};
