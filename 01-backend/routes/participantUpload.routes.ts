import { Request, Response, Router } from 'express';
import { GroupSessionService } from '../services/groupSession.service';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus, JobType } from '../entities/printJob.entity';
import { File } from '../entities/file.entity';
import { GroupSessionStatus } from '../entities/groupSession.entity';
import { saveBase64 } from '../utils/fileStore.js';
import {
  isPrintableDocument,
  ALLOWED_LABEL,
  countPages,
  UnsupportedDocumentError,
} from '../services/documentConvert.service';
import { getUploadLimits } from '../utils/limits';
import { applyPromotion } from '../services/promotion.service';
import { computeCost } from '../services/pricing.service';
import { makeCode } from '../utils/releaseCode';

const router = Router();
const groupService = new GroupSessionService();

/**
 * POST /api/participant-upload/upload
 * A group-session participant submits their document.
 *
 * Headers:  X-Upload-Token: <token returned by /join>
 * Body:     fileURL, fileName, pageCount, mimeType?, sizeBytes?, printConfiguration?
 */
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const uploadToken = req.headers['x-upload-token'] as string;
    if (!uploadToken) {
      res.status(401).json({ success: false, message: 'Upload token required' });
      return;
    }

    const result = await groupService.getParticipantByToken(uploadToken);
    if (!result) {
      res.status(401).json({ success: false, message: 'Invalid upload token' });
      return;
    }

    const { participant, session } = result;

    if (session.status !== GroupSessionStatus.OPEN) {
      res.status(400).json({ success: false, message: 'Group session is closed' });
      return;
    }
    if (new Date() > session.deadline) {
      res.status(400).json({ success: false, message: 'Deadline has passed' });
      return;
    }

    const { fileURL, fileBase64, fileName, pageCount, mimeType, sizeBytes, printConfiguration } =
      req.body || {};
    if ((!fileURL && !fileBase64) || !fileName || !pageCount) {
      res.status(400).json({
        success: false,
        message: 'fileName, pageCount and one of fileURL/fileBase64 are required',
      });
      return;
    }
    if (!isPrintableDocument(String(fileName), mimeType)) {
      res.status(415).json({
        success: false,
        message: `Unsupported file type. PrintLoop prints ${ALLOWED_LABEL} only.`,
        code: 'UNSUPPORTED_DOCUMENT',
      });
      return;
    }
    // Authoritative server-side page count + limits — never trust the client
    // (it drives the participant's price). When real bytes are present we
    // parse them; with a bare fileURL we can only clamp the supplied count.
    const limits = await getUploadLimits();
    let buffer: Buffer | null = null;
    if (fileBase64) {
      buffer = Buffer.from(String(fileBase64).replace(/^data:.*?;base64,/, ''), 'base64');
      if (buffer.length > limits.maxFileBytes) {
        res.status(413).json({
          success: false,
          message: `File too large. Max ${Math.round(limits.maxFileBytes / 1048576)} MB.`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
    }
    let authoritativePages: number;
    try {
      authoritativePages = buffer
        ? await countPages(buffer, String(fileName))
        : Math.max(1, Math.min(limits.maxPages, Number(pageCount) || 1));
    } catch (e: any) {
      res.status(e instanceof UnsupportedDocumentError ? 415 : 422).json({
        success: false,
        message: e?.message || 'Could not read the document.',
        code: e?.code || 'UNREADABLE_DOCUMENT',
      });
      return;
    }
    if (authoritativePages > limits.maxPages) {
      res.status(413).json({
        success: false,
        message: `Document has ${authoritativePages} pages; the limit is ${limits.maxPages}.`,
        code: 'TOO_MANY_PAGES',
      });
      return;
    }

    // Real bytes win: persist them so the kiosk/IPP service can fetch them.
    const stored = fileBase64 ? saveBase64(fileBase64, fileName) : null;
    const effectiveFileURL = stored ? stored.url : fileURL;
    const effectiveSize = stored ? stored.sizeBytes : Number(sizeBytes) || 0;

    // Enforced sessions force the host's OUTPUT STYLE settings (paper,
    // colour, sides, quality). Copies and page range are *always*
    // participant-controlled — the host enforcing "everyone duplex A4
    // colour" shouldn't also dictate how many copies of your own doc
    // you want. So we layer: enforced fields come from `opts`; copies
    // (and range) come from the participant's `printConfiguration`.
    const opts = session.defaultOptions;
    const styleOverride = opts.enforce
      ? {}
      : {
          paper: (printConfiguration as any)?.paper,
          color: (printConfiguration as any)?.color,
          sided: (printConfiguration as any)?.sided,
          qualityDpi: (printConfiguration as any)?.qualityDpi,
          orientation: (printConfiguration as any)?.orientation,
        };
    const effective = {
      paper: styleOverride.paper ?? opts.paper,
      color: styleOverride.color ?? opts.color,
      sided: styleOverride.sided ?? opts.sided,
      qualityDpi: styleOverride.qualityDpi ?? opts.qualityDpi,
      orientation:
        (styleOverride.orientation ?? (opts as any).orientation) === 'landscape'
          ? 'landscape'
          : 'portrait',
    };
    const requestedCopies = Math.max(
      1,
      Math.min(99, Number((printConfiguration as any)?.copies) || 1),
    );

    const baseCost = await computeCost({
      pageCount: authoritativePages,
      paper: effective.paper,
      color: effective.color,
      sided: effective.sided,
      qualityDpi: effective.qualityDpi,
      copies: requestedCopies,
    });
    const promo = await applyPromotion(baseCost, req.body?.promotionCode, {
      pageCount: authoritativePages,
      perPageBw: 5,
    });
    const cost = promo.cost;

    const fileRepo = AppDataSource.getRepository(File);
    const jobRepo = AppDataSource.getRepository(PrintJob);

    const savedFile = await fileRepo.save(
      fileRepo.create({
        fileURL: effectiveFileURL,
        fileName,
        mimeType: mimeType || 'application/pdf',
        sizeBytes: effectiveSize,
        pageCount: authoritativePages,
        participantId: participant.id,
      })
    );

    const savedJob = await jobRepo.save(
      jobRepo.create({
        userId: participant.userId ?? null,
        jobType: JobType.GROUP_BATCH,
        groupSessionId: session.id,
        // Watermarking removed from group printing.
        watermarkId: null,
        fileId: savedFile.id,
        printConfiguration: {
          // Copies honour the participant's chosen count (default 1) —
          // the host only dictates output style, not how many to print.
          copies: requestedCopies,
          paper: effective.paper,
          color: effective.color,
          sided: effective.sided,
          qualityDpi: effective.qualityDpi,
          orientation: effective.orientation as 'portrait' | 'landscape',
        },
        totalPages: authoritativePages,
        cost,
        status: PrintJobStatus.PENDING,
        code: `GP${makeCode(6)}`,
      })
    );

    await groupService.linkFileToParticipant(uploadToken, savedJob.id, savedFile.id);

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        printJob: { id: savedJob.id, code: savedJob.code, cost, totalPages: Number(pageCount) },
        nextStep: 'payment',
      },
    });
  } catch (error: any) {
    console.error('Participant upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
});

export default router;
