import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import { AppDataSource } from '../config/database';
import { Tenant, TenantStatus } from '../entities/tenant.entity';
import { User, UserRole } from '../entities/user.entity';
import { TenantMember, TenantMemberRole } from '../entities/tenantMember.entity';
import { resolveTenant, optionalTenant } from '../middleware/tenant.middleware';
import {
  Permission,
  requirePermission,
  requireTenantMembership,
} from '../middleware/rbac.middleware';

const testDbFile = vi.hoisted(() => {
  const file = process.cwd() + '/data/tenant-isolation-test.sqlite';
  process.env.DATABASE_FILE = file;
  return file;
});

const run = Date.now();

function mkRes() {
  const res: any = { statusCode: 0, body: null };
  res.status = (code: number) => {
    res.statusCode = code;
    return {
      json: (b: any) => {
        res.body = b;
        return res;
      },
    };
  };
  return res;
}

function mkReq(user: any, headers: Record<string, string> = {}): any {
  return {
    header: (name: string): string | undefined => headers[name.toLowerCase()] ?? undefined,
    baseUrl: '',
    path: '/',
    user,
    tenantMemberships: [],
  };
}

describe('Tenant isolation (cross-tenant guard rails)', () => {
  let tenantA: Tenant;
  let tenantB: Tenant;
  let tenantSuspended: Tenant;
  let ownerA: User;
  let outsider: User;
  let superAdmin: User;
  let spoiled: User;

  beforeAll(async () => {
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch {}
    }

    const dbModule = await import('../config/database');
    await AppDataSource.initialize();
    await AppDataSource.runMigrations();
    await dbModule.runPostInitMigrations();

    const tenantRepo = AppDataSource.getRepository(Tenant);
    tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'Isolation A',
        slug: `iso-a-${run}`,
        address: 'A',
        isDiscoverable: true,
        status: TenantStatus.ACTIVE,
      }),
    );
    tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'Isolation B',
        slug: `iso-b-${run}`,
        address: 'B',
        isDiscoverable: true,
        status: TenantStatus.ACTIVE,
      }),
    );
    tenantSuspended = await tenantRepo.save(
      tenantRepo.create({
        name: 'Isolation Suspended',
        slug: `iso-susp-${run}`,
        address: 'S',
        isDiscoverable: false,
        status: TenantStatus.SUSPENDED,
      }),
    );

    const userRepo = AppDataSource.getRepository(User);
    const mkUser = async (role: UserRole, tenantId: string | null, tag: string) =>
      userRepo.save(
        userRepo.create({
          tenantId,
          firstName: 'Isolation',
          lastName: tag,
          email: `iso-${tag}-${run}@test.com`,
          phoneNumber: '08000000001',
          passwordHash: '$2b$12$testhashplaceholder0000000000000000000000000000000000',
          salt: 'test-salt',
          role,
          adminPrivileges: [Permission.VIEW_JOBS as any],
        }),
      );
    ownerA = await mkUser(UserRole.ADMIN, tenantA.id, 'owner-a');
    outsider = await mkUser(UserRole.ADMIN, tenantA.id, 'outsider');
    superAdmin = await mkUser(UserRole.SUPER_ADMIN, tenantA.id, 'super');
    spoiled = await mkUser(UserRole.USER, tenantA.id, 'spoiled');

    const memberRepo = AppDataSource.getRepository(TenantMember);
    await memberRepo.save(
      memberRepo.create({
        tenantId: tenantA.id,
        userId: ownerA.id,
        role: TenantMemberRole.OWNER,
      }),
    );
    await memberRepo.save(
      memberRepo.create({
        tenantId: tenantA.id,
        userId: outsider.id,
        role: TenantMemberRole.STAFF,
      }),
    );
    // ownerA is also staff of tenantB — but NOT a member of B.
  });

  afterAll(async () => {
    if (await AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    try {
      fs.unlinkSync(testDbFile);
    } catch {}
  });

  describe('resolveTenant', () => {
    it('resolves X-Tenant-Slug to a tenant the admin belongs to', async () => {
      const req = mkReq(ownerA, { 'x-tenant-slug': tenantA.slug });
      req.tenantMemberships = [
        { tenantId: tenantA.id, role: TenantMemberRole.OWNER },
      ];
      const res = mkRes();
      const next = vi.fn();
      await resolveTenant(req, res, next);
      expect(res.statusCode).toBe(0);
      expect(next).toHaveBeenCalled();
      expect(req.tenant?.id).toBe(tenantA.id);
    });

    it('never lets an authenticated admin resolve a tenant they are not a member of', async () => {
      const req = mkReq(ownerA, { 'x-tenant-slug': tenantB.slug });
      req.tenantMemberships = [
        { tenantId: tenantA.id, role: TenantMemberRole.OWNER },
      ];
      const res = mkRes();
      const next = vi.fn();
      await resolveTenant(req, res, next);
      expect(res.statusCode).not.toBe(403);
      expect(req.tenant?.id).not.toBe(tenantB.id);
    });

    it('404s an explicitly requested tenant that does not exist', async () => {
      const req = mkReq(null, { 'x-tenant-slug': 'no-such-tenant-anywhere' });
      const res = mkRes();
      const next = vi.fn();
      await resolveTenant(req, res, next);
      expect(res.statusCode).toBe(404);
      expect(next).not.toHaveBeenCalled();
    });

    it('403s a suspended tenant', async () => {
      const req = mkReq(null, { 'x-tenant-slug': tenantSuspended.slug });
      const res = mkRes();
      const next = vi.fn();
      await resolveTenant(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body?.message).toBe('Tenant is suspended');
      expect(next).not.toHaveBeenCalled();
    });

    it('optionalTenant passes through untouched when nothing resolvable', async () => {
      const req = mkReq(null, { 'x-tenant-slug': 'nope-nope' });
      const res = mkRes();
      const next = vi.fn();
      await optionalTenant(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.tenant).toBeUndefined();
    });
  });

  describe('requirePermission tenant-membership guard (second layer)', () => {
    it('member admin with the right permission passes', async () => {
      const req = mkReq(ownerA);
      req.tenant = tenantA;
      req.tenantMemberships = [
        { tenantId: tenantA.id, role: TenantMemberRole.OWNER },
      ];
      const res = mkRes();
      const next = vi.fn();
      await requirePermission(Permission.VIEW_JOBS)(req, res, next);
      expect(res.statusCode).toBe(0);
      expect(next).toHaveBeenCalled();
      expect(req.admin?.role).toBe(UserRole.ADMIN);
    });

    it('blocks a member admin from acting on another tenant (X-Tenant-Slug spoof)', async () => {
      const req = mkReq(ownerA);
      req.tenant = tenantB;
      req.tenantMemberships = [
        { tenantId: tenantA.id, role: TenantMemberRole.OWNER },
      ];
      const res = mkRes();
      const next = vi.fn();
      await requirePermission(Permission.VIEW_JOBS)(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body?.code).toBe('NOT_TENANT_MEMBER');
      expect(next).not.toHaveBeenCalled();
    });

    it('403s when a required permission is missing', async () => {
      const req = mkReq(ownerA);
      req.tenant = tenantA;
      req.tenantMemberships = [
        { tenantId: tenantA.id, role: TenantMemberRole.OWNER },
      ];
      const res = mkRes();
      const next = vi.fn();
      await requirePermission(Permission.MANAGE_SETTINGS)(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body?.message).toBe('Insufficient permissions');
      expect(next).not.toHaveBeenCalled();
    });

    it('SUPER_ADMIN bypasses the membership check for support', async () => {
      const req = mkReq(superAdmin);
      req.tenant = tenantB;
      const res = mkRes();
      const next = vi.fn();
      await requirePermission(Permission.VIEW_JOBS)(req, res, next);
      expect(res.statusCode).toBe(0);
      expect(next).toHaveBeenCalled();
    });

    it('403s a plain customer (USER) even with a matched slug', async () => {
      const req = mkReq(spoiled);
      req.tenant = tenantA;
      const res = mkRes();
      const next = vi.fn();
      await requirePermission(Permission.VIEW_JOBS)(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('401s when unauthenticated', async () => {
      const req = mkReq(undefined);
      req.tenant = tenantA;
      const res = mkRes();
      const next = vi.fn();
      await requirePermission(Permission.VIEW_JOBS)(req, res, next);
      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireTenantMembership', () => {
    it('passes an OWNER on their own tenant', async () => {
      const req = mkReq(ownerA);
      req.tenant = tenantA;
      req.tenantMemberships = [
        { tenantId: tenantA.id, role: TenantMemberRole.OWNER },
      ];
      const res = mkRes();
      const next = vi.fn();
      await requireTenantMembership(TenantMemberRole.OWNER)(req, res, next);
      expect(res.statusCode).toBe(0);
      expect(next).toHaveBeenCalled();
    });

    it('rejects a non-member (403 NOT_TENANT_MEMBER)', async () => {
      const req = mkReq(outsider);
      req.tenant = tenantB;
      req.tenantMemberships = [
        { tenantId: tenantA.id, role: TenantMemberRole.STAFF },
      ];
      const res = mkRes();
      const next = vi.fn();
      await requireTenantMembership()(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body?.code).toBe('NOT_TENANT_MEMBER');
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects a role below the required one', async () => {
      const req = mkReq(outsider);
      req.tenant = tenantA;
      req.tenantMemberships = [
        { tenantId: tenantA.id, role: TenantMemberRole.STAFF },
      ];
      const res = mkRes();
      const next = vi.fn();
      await requireTenantMembership(TenantMemberRole.OWNER)(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body?.code).toBe('INSUFFICIENT_TENANT_ROLE');
      expect(next).not.toHaveBeenCalled();
    });

    it('SUPER_ADMIN passes regardless of membership', async () => {
      const req = mkReq(superAdmin);
      req.tenant = tenantB;
      const res = mkRes();
      const next = vi.fn();
      await requireTenantMembership()(req, res, next);
      expect(res.statusCode).toBe(0);
      expect(next).toHaveBeenCalled();
    });
  });
});