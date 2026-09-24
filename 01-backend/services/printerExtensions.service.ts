import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import { GroupSessionService } from './groupSession.service';
import { fileCleanupQueue } from '../workers/queues';
import { emitTenantEvent } from './tenantWebhook.service';
import { WebhookEvent } from '../entities/tenantWebhook.entity';
import { checkPickupLimit } from './abuseLimits.service';

/**
 * Kiosk-facing helpers: validate a release code, fetch the job/files to
 * print, track partial-print progress, and finalise a completed job.
 * Works for both single jobs (by `code`) and group batches (by batch code).
 */
export class PrinterServiceExtensions {
  private printJobRepo: Repository<PrintJob>;
  private fileRepo: Repository<File>;
  private groupService: GroupSessionService;

  constructor() {
    this.printJobRepo = AppDataSource.getRepository(PrintJob);
    this.fileRepo = AppDataSource.getRepository(File);
    this.groupService = new GroupSessionService();
  }

  /**
   * **Tenant-scoped as of V2-12.** Pass the authenticating kiosk's
   * `tenantId` so we never validate a code that belongs to a
   * different tenant — even if the global `code` collision space
   * ever lets two tenants share a code.
   */
  async validateCode(code: string, tenantId?: string | null): Promise<{
    success: boolean;
    type?: 'single' | 'group_batch';
    message: string;
    data?: any;
    code?: string;
    retryAfter?: number;
  }> {
    const where = tenantId ? { code, tenantId } : { code };
    const job = await this.printJobRepo.findOne({ where });
    if (job) {
      if (job.status === PrintJobStatus.DONE) {
        return { success: false, message: 'This job has already been printed' };
      }
      if (job.status === PrintJobStatus.PENDING) {
        return { success: false, message: 'Payment not yet confirmed for this job' };
      }
      if (job.status !== PrintJobStatus.READY) {
        return { success: false, message: `Job is ${job.status} and cannot be printed` };
      }
      // Per-customer pickup attempt limit (abuse prevention, V2-13)
      if (tenantId && job.userId) {
        const pickupLimit = await checkPickupLimit(tenantId, job.userId);
        if (!pickupLimit.allowed) {
          return {
            success: false,
            message: `Too many pickup attempts. Limit is ${pickupLimit.limit} per hour. Try again at ${pickupLimit.resetAt.toISOString()}`,
            code: 'PICKUP_LIMIT_EXCEEDED',
            retryAfter: Math.ceil((pickupLimit.resetAt.getTime() - Date.now()) / 1000),
          };
        }
      }
      return {
        success: true,
        type: 'single',
        message: 'Code validated',
        data: { code: job.code, jobId: job.id },
      };
    }

    const batchData = await this.groupService.getBatchPrintData(code);
    if (batchData) {
      return {
        success: true,
        type: 'group_batch',
        message: 'Group batch validated',
        data: {
          sessionId: batchData.session.id,
          groupName: batchData.session.groupName,
          fileCount: batchData.files.length,
        },
      };
    }

    return { success: false, message: 'Invalid code' };
  }

  async getJob(code: string, tenantId?: string | null): Promise<{
    success: boolean;
    type?: 'single' | 'group_batch';
    data?: any;
    message: string;
  }> {
    const where = tenantId ? { code, tenantId } : { code };
    const job = await this.printJobRepo.findOne({ where });
    if (job) {
      const file = job.fileId
        ? await this.fileRepo.findOne({
            where: tenantId
              ? { id: job.fileId, tenantId }
              : { id: job.fileId },
          })
        : null;
      return {
        success: true,
        type: 'single',
        message: 'Job retrieved',
        data: {
          jobId: job.id,
          code: job.code,
          fileURL: null, // HIDE DOWNLOAD URL (V2-12)
          fileName: file?.fileName || job.fileName || null,
          totalPages: job.totalPages,
          printConfig: job.printConfiguration,
          cost: job.cost,
          customerInfo: { userId: job.userId },
          pagesCompleted: job.pagesCompleted || 0,
        },
      };
    }

    const batchData = await this.groupService.getBatchPrintData(code);
    if (batchData) {
      return {
        success: true,
        type: 'group_batch',
        message: 'Group batch retrieved',
        data: {
          sessionId: batchData.session.id,
          groupName: batchData.session.groupName,
          defaultOptions: batchData.session.defaultOptions,
          files: batchData.files.map((f) => ({
            fileId: f.fileId,
            fileURL: null, // HIDE DOWNLOAD URL (V2-12)
            participantName: f.participantName,
            printConfig: f.printConfig,
          })),
        },
      };
    }

    return { success: false, message: 'Code not found' };
  }

  async updateProgress(input: {
    code: string;
    pagesCompleted: number;
    kioskId: string;
    tenantId?: string | null;
  }): Promise<{ success: boolean; message: string }> {
    const where = input.tenantId
      ? { code: input.code, tenantId: input.tenantId }
      : { code: input.code };
    const job = await this.printJobRepo.findOne({ where });
    if (!job) return { success: false, message: 'Job not found' };

    job.pagesCompleted = input.pagesCompleted;
    job.status = PrintJobStatus.PRINTING;
    job.printerId = input.kioskId;
    await this.printJobRepo.save(job);
    return { success: true, message: 'Progress updated' };
  }

  async completePrintJob(input: {
    code: string;
    kioskId: string;
    kioskName: string;
    cost: number;
    totalPages: number;
    tenantId?: string | null;
  }): Promise<{ success: boolean; message: string; data?: any }> {
    const where = input.tenantId
      ? { code: input.code, tenantId: input.tenantId }
      : { code: input.code };
    const job = await this.printJobRepo.findOne({ where });
    if (!job) return { success: false, message: 'Job not found' };

    job.status = PrintJobStatus.DONE;
    job.completedAt = new Date();
    job.cost = input.cost;
    job.totalPages = input.totalPages;
    job.pagesCompleted = input.totalPages;
    job.printerId = input.kioskId;
    job.printerName = input.kioskName;
    await this.printJobRepo.save(job);

    await fileCleanupQueue.add(
      'cleanup',
      { printJobId: job.id, fileIds: job.fileId ? [job.fileId] : [] },
      { delay: 24 * 60 * 60 * 1000 }
    );

    // Emit job.completed webhook (Dimension 14 — V2-14). Fire-and-
    // forget; subscriber-side failures don't block the response.
    if (job.tenantId) {
      emitTenantEvent(job.tenantId, WebhookEvent.JOB_COMPLETED, {
        printJobId: job.id,
        code: job.code,
        cost: Number(job.cost),
        totalPages: job.totalPages,
        completedAt: job.completedAt,
        kioskId: input.kioskId,
        kioskName: input.kioskName,
      });
    }

    return {
      success: true,
      message: 'Job completed and cleanup scheduled',
      data: { jobId: job.id, completedAt: job.completedAt },
    };
  }
}
