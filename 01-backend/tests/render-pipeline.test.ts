import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import { Tenant } from '../entities/tenant.entity';
import { enqueueRender, applyRenderResult, applyRenderFailure } from '../services/renderEnqueue.service';
import agentRouter from '../routes/agent.routes';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils/jwt';

// Mock queues and redis config to allow test coverage without Redis
vi.mock('../workers/queues', () => {
  return {
    renderQueue: {
      add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
    },
  };
});

vi.mock('../config/redis', () => {
  return {
    REDIS_ENABLED: true,
  };
});

const testDbFile = vi.hoisted(() => {
  const file = process.cwd() + "/data/render-pipeline-test.sqlite";
  process.env.DATABASE_FILE = file;
  return file;
});

// Import the mocked renderQueue so we can assert on it
import { renderQueue } from '../workers/queues';

describe('Render Pipeline & Agent Integration Tests', () => {
  let globalTenantId: string;

  beforeAll(async () => {
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch (err) {}
    }

    const dbModule = await import('../config/database');
    await AppDataSource.initialize();
    await AppDataSource.runMigrations();
    await dbModule.runPostInitMigrations();

    // Setup tenant
    const tenantRepo = AppDataSource.getRepository(Tenant);
    const tenant = tenantRepo.create({
      name: 'Render Test Tenant',
      slug: `render-test-tenant-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      address: '123 Test St',
      lat: 6.5244,
      lng: 3.3792,
      isDiscoverable: true,
    });
    await tenantRepo.save(tenant);
    globalTenantId = tenant.id;
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
      } catch (err) {}
    }
  });

  it('correctly handles full render lifecycle (enqueue, callback, download)', async () => {
    const fileRepo = AppDataSource.getRepository(File);
    const jobRepo = AppDataSource.getRepository(PrintJob);

    // Create a mock file
    const file = fileRepo.create({
      tenantId: globalTenantId,
      fileName: 'test_doc.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 1024,
      fileURL: 'http://localhost:4000/api/files/test_doc.docx',
      pageCount: 5,
    });
    await fileRepo.save(file);

    // Create a mock print job
    const job = jobRepo.create({
      tenantId: globalTenantId,
      fileId: file.id,
      fileName: file.fileName,
      cost: 10.50,
      totalPages: 5,
      status: PrintJobStatus.PENDING,
      printConfiguration: {
        copies: 1,
        paper: 'A4',
        color: 'color',
        sided: 'single',
        qualityDpi: 600,
      },
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });
    await jobRepo.save(job);

    // 1. Enqueue job
    const enqueueRes = await enqueueRender(job.id);
    expect(enqueueRes.enqueued).toBe(true);

    const enqueuedJob = await jobRepo.findOne({ where: { id: job.id } });
    expect(enqueuedJob!.status).toBe(PrintJobStatus.RENDERING);
    expect(enqueuedJob!.renderingStatus).toBe('processing');
    expect(enqueuedJob!.renderingStartedAt).toBeDefined();
    expect(enqueuedJob!.renderingError).toBeNull();

    // Verify queue call
    expect(renderQueue.add).toHaveBeenCalledWith('render', expect.objectContaining({
      printJobId: job.id,
      sourceFileUrl: file.fileURL,
      fileName: file.fileName,
      watermarkId: null,
    }));

    // 2. Callback success
    const callbackRes = await applyRenderResult({
      printJobId: job.id,
      renderedKey: `renders/${globalTenantId}/${job.id}.pwg`,
      renderedPdfUrl: `http://localhost:4000/api/files/renders/${globalTenantId}/${job.id}.pdf`,
      previewImageUrls: [
        `http://localhost:4000/api/files/renders/${globalTenantId}/${job.id}_preview_0.jpg`
      ],
      pageCount: 6, // Authoritative count
      bytes: 20485,
    });
    expect(callbackRes.updated).toBe(true);

    const completedJob = await jobRepo.findOne({ where: { id: job.id } });
    expect(completedJob!.status).toBe(PrintJobStatus.READY);
    expect(completedJob!.totalPages).toBe(6);
    expect(completedJob!.renderedKey).toBe(`renders/${globalTenantId}/${job.id}.pwg`);
    expect(completedJob!.renderedPdfUrl).toBe(`http://localhost:4000/api/files/renders/${globalTenantId}/${job.id}.pdf`);
    expect(completedJob!.previewImageUrls).toContain(`http://localhost:4000/api/files/renders/${globalTenantId}/${job.id}_preview_0.jpg`);
    expect(completedJob!.renderingStatus).toBe('ready');
    expect(completedJob!.renderingCompletedAt).toBeDefined();

    // 3. Test agent API download serves the pre-rendered file directly
    // Generate a temporary mock file on disk where the static server would serve it
    const uploadsDir = path.resolve(__dirname, '../data/uploads');
    const renderedPwgDir = path.join(uploadsDir, 'renders', globalTenantId);
    fs.mkdirSync(renderedPwgDir, { recursive: true });
    
    const pwgFilePath = path.join(renderedPwgDir, `${job.id}.pwg`);
    const mockPwgBytes = Buffer.from('RaS2MockPwgRasterFormatData');
    fs.writeFileSync(pwgFilePath, mockPwgBytes);

    try {
      // Create valid download token
      const token = jwt.sign(
        { kind: 'agent-file-download', jobId: job.id, kioskId: 'mock-kiosk-id' },
        JWT_SECRET,
        { expiresIn: 60 }
      );

      let responseHeaders: Record<string, string> = {};
      let responseBody: any = null;
      let responseStatus = 200;

      const mockReq = {
        params: { id: job.id },
        query: { t: token },
        headers: {},
        header: (name: string) => ''
      } as unknown as Request;

      const mockRes = {
        setHeader: (name: string, value: string) => {
          responseHeaders[name.toLowerCase()] = value;
        },
        status: (code: number) => {
          responseStatus = code;
          return mockRes;
        },
        send: (data: any) => {
          responseBody = data;
        },
        json: (data: any) => {
          responseBody = data;
        }
      } as unknown as Response;

      // Find the route handler for GET /jobs/:id/file
      const layer = agentRouter.stack.find((l: any) => l.route?.path === '/jobs/:id/file');
      expect(layer).toBeDefined();
      expect(layer?.route).toBeDefined();
      const handler = layer!.route!.stack[0].handle;

      await handler(mockReq, mockRes, () => {});

      expect(responseStatus).toBe(200);
      expect(responseHeaders['content-type']).toBe('image/pwg-raster');
      expect(responseBody.toString()).toBe('RaS2MockPwgRasterFormatData');
    } finally {
      // Cleanup file on disk
      try {
        fs.unlinkSync(pwgFilePath);
      } catch (err) {}
    }
  });

  it('correctly handles render failures', async () => {
    const jobRepo = AppDataSource.getRepository(PrintJob);

    // Create a mock print job
    const job = jobRepo.create({
      tenantId: globalTenantId,
      fileId: '00000000-0000-0000-0000-000000000000',
      fileName: 'bad_file.pdf',
      cost: 5.00,
      totalPages: 1,
      status: PrintJobStatus.PENDING,
      printConfiguration: {
        copies: 1,
        paper: 'A4',
        color: 'bw',
        sided: 'single',
        qualityDpi: 300,
      },
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });
    await jobRepo.save(job);

    // Enqueue
    await enqueueRender(job.id);

    // Trigger failure callback
    const failRes = await applyRenderFailure({
      printJobId: job.id,
      errorMessage: 'Ghostscript failed to parse corrupt PDF',
    });
    expect(failRes.updated).toBe(true);

    const failedJob = await jobRepo.findOne({ where: { id: job.id } });
    expect(failedJob!.status).toBe(PrintJobStatus.FAILED);
    expect(failedJob!.renderingStatus).toBe('failed');
    expect(failedJob!.renderingError).toBe('Ghostscript failed to parse corrupt PDF');
    expect(failedJob!.renderingCompletedAt).toBeDefined();
  });
});

