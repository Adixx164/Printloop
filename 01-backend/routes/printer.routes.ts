import { Request, Response, Router } from 'express';
import { kioskAuth } from '../middleware/kioskAuth.middleware';
import { bruteForceProtection } from '../middleware/bruteForce.middleware';
import { heartbeat, updateProgress, validateCode, getJob } from '../controllers/printerExtensions.controller';
import { PrinterServiceExtensions } from '../services/printerExtensions.service';
import { GroupSessionService } from '../services/groupSession.service';
import { IppService, type PrintOptions } from '../services/ipp.service';
import { evaluatePrintPolicy, ippConnectionPrefs } from '../services/printPolicy.service';
import { AppDataSource } from '../config/database';
import { PrintJob } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { File } from '../entities/file.entity';
import { loadDocumentBytes } from '../utils/fileStore';
import { ensurePdf, UnsupportedDocumentError } from '../services/documentConvert.service';

const router = Router();
const printerExt = new PrinterServiceExtensions();
const groupSvc = new GroupSessionService();
const ipp = new IppService();

function parsePages(cfg: any): number[] | null {
  if (!cfg || cfg.pages !== 'range' || !cfg.pageRange) return null;
  const out: number[] = [];
  for (const chunk of String(cfg.pageRange).split(',')) {
    const m = chunk.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) for (let p = +m[1]; p <= +m[2]; p++) out.push(p);
    else if (/^\d+$/.test(chunk.trim())) out.push(+chunk.trim());
  }
  return out.length ? out : null;
}

// All printer endpoints require a valid kiosk API key (X-Kiosk-Key header)
router.get('/heartbeat', kioskAuth, heartbeat);
router.post('/validate-code', kioskAuth, bruteForceProtection, validateCode);
router.post('/get-job', kioskAuth, getJob);
router.patch('/progress', kioskAuth, updateProgress);

/**
 * Release a SINGLE job to the physical printer.
 * Pipeline: load job → print-script policy (block/mutate) → IPP/IPPS
 * dispatch to the kiosk's printer → mark complete.
 */
router.post('/complete', kioskAuth, async (req: Request, res: Response) => {
  try {
    const code = req.body.code || req.body.jobNumber;
    const { cost, totalPages } = req.body;
    const kiosk = (req as any).kiosk;
    if (!code) {
      res.status(400).json({ success: false, message: 'code is required' });
      return;
    }
    if (!kiosk?.ipAddress) {
      res.status(409).json({
        success: false,
        message: 'This kiosk has no printer address configured.',
        code: 'KIOSK_NO_PRINTER',
      });
      return;
    }

    const jobRepo = AppDataSource.getRepository(PrintJob);
    const job = await jobRepo.findOne({ where: { code } });
    if (!job) {
      res.status(404).json({ success: false, message: 'Job not found' });
      return;
    }

    const cfg: any = job.printConfiguration || {};

    // ── Personal batch: ONE code → many documents, each its own settings ─
    const items = await AppDataSource.getRepository(PrintJobItem).find({
      where: { printJobId: job.id },
      order: { order: 'ASC' },
    });
    if (items.length) {
      const prefs = await ippConnectionPrefs();
      const collate = cfg.collate !== false;
      const fileRepo = AppDataSource.getRepository(File);

      // Policy pre-pass — block the whole release if any item is denied.
      const planned: Array<{ it: PrintJobItem; pol: any }> = [];
      for (const it of items) {
        const ic: any = it.printConfiguration || {};
        const pol = await evaluatePrintPolicy({
          totalPages: it.totalPages || 1,
          copies: ic.copies || 1,
          color: ic.color === 'color' ? 'color' : 'bw',
          sided: ic.sided === 'double' ? 'double' : 'single',
          paper: ic.paper || 'A4',
          fileName: it.fileName,
          jobType: job.jobType,
        });
        if (!pol.allow) {
          res.status(403).json({
            success: false,
            message: `${it.fileName}: ${pol.deniedReason || 'Blocked by print policy.'}`,
            code: 'PRINT_POLICY_DENIED',
          });
          return;
        }
        planned.push({ it, pol });
      }

      let printed = 0;
      for (const { it, pol } of planned) {
        const f = await fileRepo.findOne({ where: { id: it.fileId } });
        const url = f?.watermarkedUrl || f?.fileURL;
        if (!url) continue;
        let src: any = { url };
        try {
          const b = await loadDocumentBytes(url);
          if (b) {
            const pdf = await ensurePdf(b, f?.fileName || it.fileName || 'doc.pdf');
            src = { buffer: pdf.buffer };
          }
        } catch (e: any) {
          if (e instanceof UnsupportedDocumentError) {
            res.status(415).json({ success: false, message: e.message, code: e.code });
            return;
          }
          res.status(422).json({
            success: false,
            message: `${it.fileName} could not be prepared for printing.`,
            code: 'CONVERT_FAILED',
          });
          return;
        }
        const opts: PrintOptions = {
          copies: pol.mutated.copies,
          sided: pol.mutated.sided,
          color: pol.mutated.color,
          paper: pol.mutated.paper || 'A4',
          collate,
          requestingUser: 'PrintLoop-Kiosk',
          secure: prefs.secure,
          port: prefs.port,
          tlsRejectUnauthorized: prefs.rejectUnauthorized,
          path: prefs.path,
        };
        try {
          await ipp.printJob(kiosk.ipAddress, src, `${job.code} · ${it.fileName}`, opts);
          printed++;
        } catch (e: any) {
          console.error(`[printer/complete batch] IPP error for ${it.fileName}:`, e?.message);
        }
      }

      const result = await printerExt.completePrintJob({
        code,
        kioskId: kiosk.id,
        kioskName: kiosk.name,
        cost: Number(job.cost) || 0,
        totalPages: job.totalPages || 0,
      });
      res.status(result.success ? 200 : 404).json({
        ...result,
        data: {
          ...(result.data || {}),
          batch: true,
          printed,
          total: items.length,
          transport: prefs.secure ? 'ipps' : 'ipp',
          policyNotes: planned[0]?.pol?.notes,
        },
      });
      return;
    }

    // ── Print-script policy (authoritative, before dispatch) ────────────
    const policy = await evaluatePrintPolicy({
      totalPages: job.totalPages || Number(totalPages) || 1,
      copies: cfg.copies || 1,
      color: cfg.color === 'color' ? 'color' : 'bw',
      sided: cfg.sided === 'double' ? 'double' : 'single',
      paper: cfg.paper || 'A4',
      fileName: job.fileName,
      jobType: job.jobType,
    });
    if (!policy.allow) {
      res.status(403).json({
        success: false,
        message: policy.deniedReason || 'Blocked by print policy.',
        code: 'PRINT_POLICY_DENIED',
      });
      return;
    }

    // ── Resolve the document ────────────────────────────────────────────
    const file = job.fileId
      ? await AppDataSource.getRepository(File).findOne({ where: { id: job.fileId } })
      : null;
    const fileUrl =
      file?.watermarkedUrl || file?.fileURL || `local://${encodeURIComponent(job.fileName || job.code)}.pdf`;

    // ── IPP / IPPS dispatch with the (possibly mutated) options ─────────
    const prefs = await ippConnectionPrefs();
    const opts: PrintOptions = {
      copies: policy.mutated.copies,
      sided: policy.mutated.sided,
      color: policy.mutated.color,
      paper: policy.mutated.paper || 'A4',
      collate: cfg.collate !== false,
      pages: parsePages(cfg),
      requestingUser: 'PrintLoop-Kiosk',
      secure: prefs.secure,
      port: prefs.port,
      tlsRejectUnauthorized: prefs.rejectUnauthorized,
      path: prefs.path,
    };

    // Printers speak PDF — fetch the real bytes and convert if needed.
    let source: any = { url: fileUrl };
    try {
      const bytes = await loadDocumentBytes(fileUrl);
      if (bytes) {
        const pdf = await ensurePdf(bytes, file?.fileName || job.fileName || `${job.code}.pdf`);
        source = { buffer: pdf.buffer };
      }
    } catch (e: any) {
      if (e instanceof UnsupportedDocumentError) {
        res.status(415).json({ success: false, message: e.message, code: e.code });
        return;
      }
      console.error(`[printer/complete] convert error for ${code}:`, e?.message);
      res.status(422).json({
        success: false,
        message: 'This document could not be prepared for printing.',
        code: 'CONVERT_FAILED',
      });
      return;
    }

    let dispatch: any;
    try {
      dispatch = await ipp.printJob(kiosk.ipAddress, source, job.fileName || job.code, opts);
    } catch (e: any) {
      console.error(`[printer/complete] IPP error for ${code}:`, e?.message);
      res.status(502).json({
        success: false,
        message: 'The printer did not accept the job. Try again or use another kiosk.',
        code: 'PRINTER_ERROR',
      });
      return;
    }

    // ── Mark complete + schedule cleanup ────────────────────────────────
    const result = await printerExt.completePrintJob({
      code,
      kioskId: kiosk.id,
      kioskName: kiosk.name,
      cost: Number(cost) || Number(job.cost) || 0,
      totalPages: Number(totalPages) || job.totalPages || 0,
    });

    res.status(result.success ? 200 : 404).json({
      ...result,
      data: {
        ...(result.data || {}),
        transport: prefs.secure ? 'ipps' : 'ipp',
        mock: !!dispatch?.mock,
        policyNotes: policy.notes,
      },
    });
  } catch (error: any) {
    console.error('Complete print job error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete job' });
  }
});

/**
 * Release a GROUP BATCH (one batch code → every paid participant file),
 * each dispatched to the printer in turn.
 */
router.post('/complete-batch', kioskAuth, async (req: Request, res: Response) => {
  try {
    const code = req.body.code;
    const kiosk = (req as any).kiosk;
    if (!code) {
      res.status(400).json({ success: false, message: 'code is required' });
      return;
    }
    if (!kiosk?.ipAddress) {
      res.status(409).json({ success: false, message: 'This kiosk has no printer address configured.', code: 'KIOSK_NO_PRINTER' });
      return;
    }

    const data = await groupSvc.getBatchPrintData(code);
    if (!data) {
      res.status(404).json({ success: false, message: 'Batch code not found or session not closed.' });
      return;
    }

    const prefs = await ippConnectionPrefs();
    const sessDefaults: any = data.session.defaultOptions || {};

    // Per-document policy pre-pass — each participant's OWN settings (falls
    // back to the host/session defaults only when a participant has none).
    const planned: Array<{ f: any; pol: any }> = [];
    for (const f of data.files) {
      const ic: any = f.printConfig || sessDefaults || {};
      const pol = await evaluatePrintPolicy({
        totalPages: f.totalPages || 1,
        copies: ic.copies || 1,
        color: ic.color === 'color' ? 'color' : 'bw',
        sided: ic.sided === 'double' ? 'double' : 'single',
        paper: ic.paper || 'A4',
        fileName: f.participantName,
        jobType: 'group_batch',
      });
      if (!pol.allow) {
        res.status(403).json({
          success: false,
          message: `${f.participantName}: ${pol.deniedReason || 'Blocked by print policy.'}`,
          code: 'PRINT_POLICY_DENIED',
        });
        return;
      }
      planned.push({ f, pol });
    }

    let printed = 0;
    for (const { f, pol } of planned) {
      const opts: PrintOptions = {
        copies: pol.mutated.copies,
        sided: pol.mutated.sided,
        color: pol.mutated.color,
        paper: pol.mutated.paper || 'A4',
        collate: true, // a participant's own set prints collated
        requestingUser: 'PrintLoop-Kiosk',
        secure: prefs.secure,
        port: prefs.port,
        tlsRejectUnauthorized: prefs.rejectUnauthorized,
        path: prefs.path,
      };
      console.log(
        `[printer/complete-batch] ${f.participantName}: ${opts.color}/${opts.sided}/${opts.paper} x${opts.copies}`
      );
      try {
        let src: any = { url: f.fileURL };
        const bytes = await loadDocumentBytes(f.fileURL);
        if (bytes) {
          const pdf = await ensurePdf(bytes, `${f.participantName || f.watermarkId}.pdf`);
          src = { buffer: pdf.buffer };
        }
        await ipp.printJob(
          kiosk.ipAddress,
          src,
          `${f.participantName} · ${data.session.groupName || 'batch'}`,
          opts
        );
        printed++;
      } catch (e: any) {
        console.error(`[printer/complete-batch] error for ${f.watermarkId}:`, e?.message);
      }
    }

    res.json({
      success: true,
      message: `Batch dispatched (${printed}/${data.files.length}).`,
      data: {
        printed,
        total: data.files.length,
        transport: prefs.secure ? 'ipps' : 'ipp',
        policyNotes: planned[0]?.pol?.notes,
      },
    });
  } catch (error: any) {
    console.error('Complete batch error:', error);
    res.status(500).json({ success: false, message: 'Failed to release batch' });
  }
});

export default router;
