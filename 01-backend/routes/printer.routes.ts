import { Request, Response, Router } from 'express';
import { kioskAuth } from '../middleware/kioskAuth.middleware';
import { bruteForceProtection } from '../middleware/bruteForce.middleware';
import { heartbeat, updateProgress, validateCode, getJob } from '../controllers/printerExtensions.controller';
import { PrinterServiceExtensions } from '../services/printerExtensions.service';
import { GroupSessionService } from '../services/groupSession.service';
import { IppService, type PrintOptions } from '../services/ipp.service';
import { evaluatePrintPolicy, ippConnectionPrefs, printDispatchMode } from '../services/printPolicy.service';
import { AppDataSource } from '../config/database';
import { PrintJob, PrintJobStatus } from '../entities/printJob.entity';
import { PrintJobItem } from '../entities/printJobItem.entity';
import { File } from '../entities/file.entity';
import { loadDocumentBytes } from '../utils/fileStore';
import { ensurePdf, toGrayscale, UnsupportedDocumentError } from '../services/documentConvert.service';

const router = Router();
const printerExt = new PrinterServiceExtensions();
const groupSvc = new GroupSessionService();
const ipp = new IppService();

/**
 * Dispatch a print job over whichever transport the admin has selected
 * for this PrintLoop install. Default is IPP Print-Job; admins switch
 * to `raw9100` for printers whose IPP layer accepts envelopes but then
 * silently drops the payload (Sharp MX-series is the canonical case).
 */
async function dispatchPrint(
  printerIp: string,
  source: any,
  jobName: string,
  opts: PrintOptions,
  transport: 'ipp' | 'raw9100',
  rawPort: number,
): Promise<any> {
  if (transport === 'raw9100') {
    return ipp.rawPrint(printerIp, source, jobName, opts, rawPort);
  }
  return ipp.printJob(printerIp, source, jobName, opts);
}

/**
 * Force grayscale on the cloud-push path when the (policy-resolved)
 * colour isn't 'color'. The printer's PJL colour directives are
 * unreliable for PDF input — the Sharp ignores them and prints the
 * PDF's own colour space — so we strip the colour from the bytes
 * server-side via Ghostscript, the same guarantee the kiosk-pull
 * download endpoint applies. No-op (returns the original bytes) if
 * Ghostscript isn't installed on the host.
 */
async function maybeGrayscale(buffer: Buffer, color: string | undefined): Promise<Buffer> {
  return color && color !== 'color' ? toGrayscale(buffer) : buffer;
}

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

    // In kiosk-pull mode the agent — not the backend — opens the socket to
    // the printer, so the kiosk row needs no `ipAddress`. Only enforce it
    // for cloud-push, where this process literally dials the printer's LAN IP.
    const dispatchMode = await printDispatchMode();
    if (dispatchMode === 'cloud-push' && !kiosk?.ipAddress) {
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

    // ── Kiosk-pull short-circuit ────────────────────────────────────────
    // Mark the job RELEASING + bind it to this kiosk so its on-site agent
    // can claim it via /api/agent/jobs/ready, download the bytes, and
    // dispatch over its own LAN. We still run policy here so the agent
    // can't print something the admin has blocked — mutations get
    // persisted onto printConfiguration before the agent sees the job.
    if (dispatchMode === 'kiosk-pull') {
      const items = await AppDataSource.getRepository(PrintJobItem).find({
        where: { printJobId: job.id },
        order: { order: 'ASC' },
      });

      // Per-document policy evaluation (single + batch alike). On a block
      // we abort the whole release exactly like cloud-push does.
      if (items.length) {
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
          // Persist any mutations so the agent fetches the corrected config.
          it.printConfiguration = {
            ...ic,
            copies: pol.mutated.copies,
            sided: pol.mutated.sided,
            color: pol.mutated.color,
            paper: pol.mutated.paper || ic.paper || 'A4',
          };
        }
        await AppDataSource.getRepository(PrintJobItem).save(items);
      } else {
        const pol = await evaluatePrintPolicy({
          totalPages: job.totalPages || Number(totalPages) || 1,
          copies: cfg.copies || 1,
          color: cfg.color === 'color' ? 'color' : 'bw',
          sided: cfg.sided === 'double' ? 'double' : 'single',
          paper: cfg.paper || 'A4',
          fileName: job.fileName,
          jobType: job.jobType,
        });
        if (!pol.allow) {
          res.status(403).json({
            success: false,
            message: pol.deniedReason || 'Blocked by print policy.',
            code: 'PRINT_POLICY_DENIED',
          });
          return;
        }
        job.printConfiguration = {
          ...cfg,
          copies: pol.mutated.copies,
          sided: pol.mutated.sided,
          color: pol.mutated.color,
          paper: pol.mutated.paper || cfg.paper || 'A4',
        };
      }

      // Atomic transition READY → RELEASING. The conditional update means
      // two kiosks racing on the same code can't both win.
      const upd = await jobRepo
        .createQueryBuilder()
        .update(PrintJob)
        .set({ status: PrintJobStatus.RELEASING, kioskId: kiosk.id, printConfiguration: job.printConfiguration })
        .where('id = :id AND status = :ready', { id: job.id, ready: PrintJobStatus.READY })
        .execute();
      if ((upd.affected ?? 0) !== 1) {
        res.status(409).json({
          success: false,
          message: 'Job is no longer releasable (already in flight or completed).',
          code: 'JOB_NOT_RELEASABLE',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Released to on-site agent. The kiosk will dispatch to the printer shortly.',
        data: {
          mode: 'kiosk-pull',
          status: PrintJobStatus.RELEASING,
          batch: !!items.length,
          total: items.length || 1,
        },
      });
      return;
    }

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
        // Watermarking is removed — always serve the original URL.
        const url = f?.fileURL;
        if (!url) continue;
        let src: any = { url };
        try {
          const b = await loadDocumentBytes(url);
          if (b) {
            const pdf = await ensurePdf(b, f?.fileName || it.fileName || 'doc.pdf');
            src = { buffer: await maybeGrayscale(pdf.buffer, pol.mutated.color) };
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
          // Orientation lives on the saved printConfiguration — policy
          // doesn't mutate it, so we read it directly off the item.
          orientation:
            (it.printConfiguration as any)?.orientation === 'landscape'
              ? 'landscape'
              : 'portrait',
          collate,
          requestingUser: 'PrintLoop-Kiosk',
          secure: prefs.secure,
          port: prefs.port,
          tlsRejectUnauthorized: prefs.rejectUnauthorized,
          path: prefs.path,
          version: prefs.version,
        };
        try {
          await dispatchPrint(kiosk.ipAddress, src, `${job.code} · ${it.fileName}`, opts, prefs.transport, prefs.rawPort);
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
      file?.fileURL || `local://${encodeURIComponent(job.fileName || job.code)}.pdf`;

    // ── IPP / IPPS dispatch with the (possibly mutated) options ─────────
    const prefs = await ippConnectionPrefs();
    const opts: PrintOptions = {
      copies: policy.mutated.copies,
      sided: policy.mutated.sided,
      color: policy.mutated.color,
      paper: policy.mutated.paper || 'A4',
      orientation: cfg.orientation === 'landscape' ? 'landscape' : 'portrait',
      collate: cfg.collate !== false,
      pages: parsePages(cfg),
      requestingUser: 'PrintLoop-Kiosk',
      secure: prefs.secure,
      port: prefs.port,
      tlsRejectUnauthorized: prefs.rejectUnauthorized,
      path: prefs.path,
      version: prefs.version,
    };

    // Printers speak PDF — fetch the real bytes and convert if needed.
    let source: any = { url: fileUrl };
    try {
      const bytes = await loadDocumentBytes(fileUrl);
      if (bytes) {
        const pdf = await ensurePdf(bytes, file?.fileName || job.fileName || `${job.code}.pdf`);
        source = { buffer: await maybeGrayscale(pdf.buffer, policy.mutated.color) };
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
      dispatch = await dispatchPrint(kiosk.ipAddress, source, job.fileName || job.code, opts, prefs.transport, prefs.rawPort);
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

    // Group-batch is a fan-out across participant uploads; the kiosk-pull
    // pipeline only supports single PrintJob rows today. Tell the caller
    // up-front rather than silently failing inside the dispatch loop.
    const dispatchMode = await printDispatchMode();
    if (dispatchMode === 'kiosk-pull') {
      res.status(501).json({
        success: false,
        message:
          'Group-batch release is not yet supported in kiosk-pull mode. Switch printDispatchMode to "cloud-push" for group sessions.',
        code: 'GROUP_BATCH_PULL_UNSUPPORTED',
      });
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
        orientation:
          (f.printConfig as any)?.orientation === 'landscape' ? 'landscape' : 'portrait',
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
          const pdf = await ensurePdf(bytes, `${f.participantName || 'document'}.pdf`);
          src = { buffer: await maybeGrayscale(pdf.buffer, pol.mutated.color) };
        }
        await dispatchPrint(
          kiosk.ipAddress,
          src,
          `${f.participantName} · ${data.session.groupName || 'batch'}`,
          opts,
          prefs.transport,
          prefs.rawPort,
        );
        printed++;
      } catch (e: any) {
        console.error(`[printer/complete-batch] error for ${f.participantName}:`, e?.message);
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
