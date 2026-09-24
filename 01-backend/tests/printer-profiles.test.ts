import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { AppDataSource } from '../config/database';
import { Tenant } from '../entities/tenant.entity';
import { PrinterProfile } from '../entities/printerProfile.entity';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import {
  resolveProfileRenderOpts,
  resolveProfileForJob,
} from '../services/printerProfile.service';
import { enqueueRender } from '../services/renderEnqueue.service';

const { mockQueueAdd } = vi.hoisted(() => ({ mockQueueAdd: vi.fn() }));

vi.mock('../workers/queues', () => {
  return {
    renderQueue: {
      add: mockQueueAdd,
    },
  };
});

vi.mock('../config/redis', () => {
  return {
    REDIS_ENABLED: true,
  };
});

const testDbFile = vi.hoisted(() => {
  const file = process.cwd() + '/data/printer-profiles-test.sqlite';
  process.env.DATABASE_FILE = file;
  return file;
});

describe('Printer profiles (V2-56)', () => {
  let tenantId: string;

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
    const tenant = tenantRepo.create({
      name: 'Profile Test Tenant',
      slug: `profile-test-tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      address: '123 Test St',
      lat: 6.5244,
      lng: 3.3792,
      isDiscoverable: true,
    });
    await tenantRepo.save(tenant);
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch {}
    }
  });

  // ── Pure mapping logic ────────────────────────────────────────────────

  it('caps DPI at the profile max, never above', () => {
    const opts = resolveProfileRenderOpts(
      { capabilities: { maxDpi: 300, colorMode: 'color', paperSize: 'A4', duplex: true } },
      { qualityDpi: 600, color: 'color' },
    );
    expect(opts.dpi).toBe(300);
    expect(opts.color).toBe(true);
    expect(opts.paperSize).toBe('A4');
  });

  it('keeps the customer DPI when below the cap', () => {
    const opts = resolveProfileRenderOpts(
      { capabilities: { maxDpi: 600, colorMode: 'color', paperSize: null, duplex: true } },
      { qualityDpi: 300, color: 'color' },
    );
    expect(opts.dpi).toBe(300);
  });

  it('forces grayscale on a mono-only printer even when colour was paid for', () => {
    const opts = resolveProfileRenderOpts(
      { capabilities: { maxDpi: 600, colorMode: 'bw', paperSize: null, duplex: true } },
      { qualityDpi: 600, color: 'color' },
    );
    expect(opts.color).toBe(false);
  });

  it('falls back to the job settings with no profile', () => {
    const opts = resolveProfileRenderOpts(null, { qualityDpi: 600, color: 'color' });
    expect(opts.dpi).toBe(600);
    expect(opts.color).toBe(true);
    expect(opts.paperSize).toBeNull();
  });

  it('defaults to 300dpi colour when nothing is set anywhere', () => {
    const opts = resolveProfileRenderOpts(null, null);
    expect(opts.dpi).toBe(300);
    expect(opts.color).toBe(true);
  });

  // ── DB resolution + enqueue payload ──────────────────────────────────

  it('resolves the tenant default profile and passes its opts in the render payload', async () => {
    const repo = AppDataSource.getRepository(PrinterProfile);
    await repo.save(
      repo.create({
        tenantId,
        displayName: 'Back Mono HP',
        capabilities: { maxDpi: 300, colorMode: 'bw', paperSize: 'A4', duplex: true },
        isDefault: true,
      }),
    );

    const resolved = await resolveProfileForJob({ tenantId });
    expect(resolved).not.toBeNull();
    expect(resolved!.isDefault).toBe(true);

    const fileRepo = AppDataSource.getRepository(File);
    const file = await fileRepo.save(
      fileRepo.create({
        tenantId,
        fileName: 'profile.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        fileURL: 'http://localhost:4000/api/files/profile.pdf',
        pageCount: 2,
      }),
    );
    const job = await AppDataSource.getRepository(PrintJob).save(
      AppDataSource.getRepository(PrintJob).create({
        userId: null,
        tenantId,
        fileId: file.id,
        fileName: 'profile.pdf',
        cost: 100,
        totalPages: 2,
        status: PrintJobStatus.PENDING,
        printConfiguration: {
          copies: 1,
          paper: 'A4',
          color: 'color',
          sided: 'single',
          qualityDpi: 600,
        },
        expiresAt: new Date(Date.now() + 3600 * 1000),
      }),
    );

    await enqueueRender(job.id);

    const payload = mockQueueAdd.mock.calls[0][1];
    expect(payload.printJobId).toBe(job.id);
    expect(payload.printerProfileId).toBe(resolved!.id);
    expect(payload.printerProfile).toEqual({
      dpi: 300, // capped from 600
      color: false, // mono-only printer, colour paid for
      paperSize: 'A4',
    });
  });

  it('a pinned profile wins over the tenant default', async () => {
    const repo = AppDataSource.getRepository(PrinterProfile);
    const pinned = await repo.save(
      repo.create({
        tenantId,
        displayName: 'Front Colour Canon',
        capabilities: { maxDpi: 600, colorMode: 'color', paperSize: null, duplex: true },
        isDefault: false,
      }),
    );

    const resolved = await resolveProfileForJob({ tenantId, printerProfileId: pinned.id });
    expect(resolved!.id).toBe(pinned.id);
  });
});
