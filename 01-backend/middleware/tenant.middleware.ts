import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { UserRole } from '../entities/user.entity';

/**
 * Slug of the legacy tenant that owns every pre-multi-tenancy row.
 * Seeded by config/seed.ts on first boot. The tenant-resolution
 * middleware falls back to this slug when no other source resolves —
 * this keeps the existing single-tenant deployment working while we
 * cut over to true multi-tenancy.
 *
 * Once Phase A is complete and every route is tenant-aware, the
 * fallback gets ripped out and unresolved tenants return 404.
 */
export const LEGACY_TENANT_SLUG = 'legacy';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: Tenant;
    }
  }
}

/**
 * Resolve `req.tenant` exactly once per request, in this priority order:
 *   1. Custom domain            - `tenant.customDomain` lookup.
 *   2. Owned-apex subdomain     - `{slug}.printloop.app`.
 *   3. `X-Tenant-Slug` header   - for API clients + the kiosk agent.
 *   4. Authenticated user       - `user.tenantId` or JWT memberships.
 *   5. Fallback                 - the LEGACY_TENANT_SLUG row, so
 *                                  pre-multi-tenancy code paths keep
 *                                  working during the cutover.
 *
 * When the request is already authenticated, the resolved tenant must
 * match `user.tenantId` or one JWT membership. SUPER_ADMIN is the only
 * bypass. This prevents a tenant admin from spoofing another tenant via
 * Host / X-Tenant-Slug while still allowing unauthenticated appliance
 * routes to resolve by header.
 *
 * A resolved-but-suspended tenant 403s rather than 404s so the tenant
 * admin can still hit the billing screen and reactivate.
 */
export const resolveTenant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const slug = pickTenantSlug(req);
    const customDomain = pickCustomDomain(req);
    const requestedExplicitTenant = Boolean(slug || customDomain);
    const authenticatedTenantId = pickAuthenticatedTenantId(req);

    const repo = AppDataSource.getRepository(Tenant);
    let tenant: Tenant | null = null;

    if (customDomain) {
      tenant = await repo.findOne({ where: { customDomain } });
    }
    if (!tenant && slug) {
      tenant = await repo.findOne({ where: { slug } });
    }
    if (!tenant && requestedExplicitTenant) {
      res.status(404).json({
        success: false,
        message: 'Tenant not found',
      });
      return;
    }
    if (!tenant && authenticatedTenantId) {
      tenant = await repo.findOne({ where: { id: authenticatedTenantId } });
    }
    // V2-57: a stale X-Tenant-Slug (left over from the student app's
    // shop pick, for example) can resolve to a tenant the authenticated
    // user isn't a member of — which would 403 the shop console even
    // though they're logging into their OWN shop. When the explicit
    // slug resolves to an inaccessible tenant, fall back to the
    // authenticated user's own tenant. The access check below still
    // guards the final choice, so spoofing is never granted — the user
    // simply always acts on their own tenant.
    if (
      tenant &&
      authenticatedTenantId &&
      !requestCanAccessTenant(req, tenant)
    ) {
      const ownTenant = await repo.findOne({ where: { id: authenticatedTenantId } });
      if (ownTenant) tenant = ownTenant;
    }
    if (!tenant) {
      // Final fallback: the legacy tenant. Returning 404 here would
      // break every route that hasn't been retrofitted with explicit
      // tenant awareness yet, so we soften it during the cutover.
      tenant = await repo.findOne({ where: { slug: LEGACY_TENANT_SLUG } });
    }

    if (!tenant) {
      res.status(404).json({
        success: false,
        message: 'Tenant not found',
      });
      return;
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      res.status(403).json({
        success: false,
        message: 'Tenant is suspended',
        reason: tenant.suspendReason ?? undefined,
      });
      return;
    }

    if (tenant.status === TenantStatus.CLOSED) {
      res.status(410).json({
        success: false,
        message: 'Tenant has been closed',
      });
      return;
    }

    if (!requestCanAccessTenant(req, tenant)) {
      res.status(403).json({
        success: false,
        message: 'Not a member of this tenant',
        code: 'NOT_TENANT_MEMBER',
      });
      return;
    }

    req.tenant = tenant;
    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({ success: false, message: 'Tenant resolution failed' });
  }
};

/**
 * Like resolveTenant but never blocks. Useful for marketing / sign-up
 * routes that may run with no resolvable tenant. Sets req.tenant when
 * possible; sets nothing otherwise.
 */
export const optionalTenant = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const slug = pickTenantSlug(req);
    const customDomain = pickCustomDomain(req);
    if (!slug && !customDomain) return next();
    const repo = AppDataSource.getRepository(Tenant);
    const tenant =
      (customDomain && (await repo.findOne({ where: { customDomain } }))) ||
      (slug && (await repo.findOne({ where: { slug } })));
    if (
      tenant &&
      tenant.status !== TenantStatus.SUSPENDED &&
      tenant.status !== TenantStatus.CLOSED &&
      requestCanAccessTenant(req, tenant)
    ) {
      req.tenant = tenant;
    }
    next();
  } catch {
    next();
  }
};

export function requestCanAccessTenant(req: Request, tenant: Tenant): boolean {
  const user = (req as any).user;
  if (!user) return true;
  if (user.role === UserRole.SUPER_ADMIN) return true;

  const isCustomerRoute = 
    req.baseUrl.startsWith('/api/customer') || 
    req.baseUrl.startsWith('/api/wallet') || 
    req.baseUrl.startsWith('/api/payments') ||
    req.path.startsWith('/customer') ||
    req.path.startsWith('/wallet') ||
    req.path.startsWith('/payments');

  if (isCustomerRoute) {
    return true;
  }

  if (user.role === UserRole.USER) {
    return false;
  }

  if (user.tenantId && user.tenantId === tenant.id) return true;
  const memberships = req.tenantMemberships || [];
  return memberships.some((m) => m.tenantId === tenant.id);
}

function pickAuthenticatedTenantId(req: Request): string | null {
  const user = (req as any).user;
  if (user?.tenantId) return user.tenantId;
  return req.tenantMemberships?.[0]?.tenantId ?? null;
}

function pickTenantSlug(req: Request): string | null {
  // Subdomain only applies to apexes we own. A custom domain like
  // print.example.edu must not be parsed as slug "print".
  const host = (req.header('host') || '').toLowerCase().split(':')[0];
  const apex = ownedApexForHost(host);
  if (host && apex && host !== apex) {
    const suffix = `.${apex}`;
    const sub = host.endsWith(suffix) ? host.slice(0, -suffix.length) : '';
    if (sub && sub !== 'www' && sub !== 'api') {
      return sub;
    }
  }

  // X-Tenant-Slug header - API clients + kiosk agent.
  const header = (req.header('x-tenant-slug') || '').toLowerCase().trim();
  if (header) return header;

  return null;
}

function pickCustomDomain(req: Request): string | null {
  const host = (req.header('host') || '').toLowerCase().split(':')[0];
  if (!host || isApexOrLocal(host)) return null;
  // Anything that doesn't end with our apex domain is treated as a
  // potential custom domain. Apex list is intentionally explicit so
  // a typo doesn't open a wildcard.
  const ourApexes = configuredApexes();
  if (ourApexes.some((apex) => host === apex || host.endsWith('.' + apex))) {
    return null;
  }
  return host;
}

function configuredApexes(): string[] {
  return (process.env.PRINTLOOP_APEX_DOMAINS || 'printloop.app,printloop.test')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function ownedApexForHost(host: string): string | null {
  if (!host || isLocalHost(host)) return null;
  return configuredApexes().find((apex) => host.endsWith(`.${apex}`)) ?? null;
}

function isApexOrLocal(host: string): boolean {
  return isLocalHost(host) || configuredApexes().includes(host);
}

function isLocalHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}
