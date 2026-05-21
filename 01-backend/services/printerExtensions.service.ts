import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import { GroupSessionService } from './groupSession.service';
import { fileCleanupQueue } from '../workers/queues';

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

  async validateCode(code: string): Promise<{
    success: boolean;
    type?: 'single' | 'group_batch';
    message: string;
    data?: any;
  }> {
    const job = await this.printJobRepo.findOne({ where: { code } });
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

  async getJob(code: string): Promise<{
    success: boolean;
    type?: 'single' | 'group_batch';
    data?: any;
    message: string;
  }> {
    const job = await this.printJobRepo.findOne({ where: { code } });
    if (job) {
      const file = job.fileId
        ? await this.fileRepo.findOne({ where: { id: job.fileId } })
        : null;
      return {
        success: true,
        type: 'single',
        message: 'Job retrieved',
        data: {
          jobId: job.id,
          code: job.code,
          fileURL: file?.watermarkedUrl || file?.fileURL || null,
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
            fileURL: f.fileURL,
            participantName: f.participantName,
            watermarkId: f.watermarkId,
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
  }): Promise<{ success: boolean; message: string }> {
    const job = await this.printJobRepo.findOne({ where: { code: input.code } });
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
  }): Promise<{ success: boolean; message: string; data?: any }> {
    const job = await this.printJobRepo.findOne({ where: { code: input.code } });
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

    return {
      success: true,
      message: 'Job completed and cleanup scheduled',
      data: { jobId: job.id, completedAt: job.completedAt },
    };
  }
}
