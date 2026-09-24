// ── Option A render spike (docs/OPENPRINTING-INTEGRATION.md) ───────────────
//
// A throwaway, SUPER-ADMIN-only tool to render an uploaded PDF to the
// printer's native language (PostScript / PCL) with colour, resolution,
// duplex and copies baked in — so we can print PCL vs PostScript on the Sharp
// and pick a language before touching the live dispatch path.
//
// Safety:
//   • mounted in app.ts ONLY when `ENABLE_SPIKE_RENDER=1` (off in prod → the
//     route does not exist at all),
//   • behind `authenticate` (JWT) at the mount, plus a super-admin role check
//     here (defence in depth),
//   • input is a multipart PDF only (no filesystem paths → no traversal),
//   • `execFile` with array args (no shell), allow-listed lang/colour/dpi,
//     clamped copies, temp files cleaned up in `renderToPrinterLanguage`.
//
// Remove this file (and its app.ts mount) once the real `renderNative` lands.

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { UserRole } from '../entities/user.entity';
import {
  isPrintableDocument,
  isPdf,
  renderToPrinterLanguage,
  ghostscriptAvailable,
  rasterRenderAvailable,
  type PrinterLang,
} from '../services/documentConvert.service';
import {
  convertOfficeAvailable,
  conversionEnabled,
} from '../services/documentConversion.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** `authenticate` (mounted upstream) has already attached req.user. */
function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user || user.role !== UserRole.SUPER_ADMIN) {
    res.status(403).json({ success: false, message: 'Super admin only' });
    return;
  }
  next();
}

/**
 * GET /api/admin/spike/diag
 * Reports whether the server-side print toolchain is actually available, so a
 * silent degradation (missing Ghostscript / @napi-rs/canvas binary on a fresh
 * deploy) is visible BEFORE a customer hits it.
 */
router.get('/diag', requireSuperAdmin, async (_req: Request, res: Response) => {
  const [ghostscript, rasterRender, officeConvert] = await Promise.all([
    ghostscriptAvailable(),
    rasterRenderAvailable(),
    convertOfficeAvailable(),
  ]);
  res.json({
    success: true,
    data: {
      ghostscript, // grayscale (toGrayscale) + the render spike below
      rasterRender, // signature flatten (pdfjs-dist + @napi-rs/canvas)
      officeConvertEnabled: conversionEnabled(), // V2-48 — DOC_CONVERTER set?
      officeConvert, // V2-48 — converter actually reachable right now?
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
    },
  });
});

/**
 * POST /api/admin/spike/render?lang=pcl|ps&color=bw|color&dpi=600&duplex=1&copies=1
 * Body: multipart/form-data with `file` = the PDF. Streams back the rendered
 * PostScript / PCL as a download to print on the Sharp (raw 9100).
 */
router.post('/render', requireSuperAdmin, upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file || !isPdf(file.buffer) || !isPrintableDocument(file.originalname || 'x.pdf', file.mimetype)) {
    res.status(400).json({ success: false, message: 'Attach a PDF as form field `file`.' });
    return;
  }
  const lang: PrinterLang = req.query.lang === 'ps' ? 'ps' : 'pcl';
  const color = req.query.color === 'color' ? 'color' : 'bw';
  const dpi = Number(req.query.dpi) || 600;
  const duplex = req.query.duplex === '1' || req.query.duplex === 'true';
  const copies = Number(req.query.copies) || 1;

  const out = await renderToPrinterLanguage(file.buffer, { lang, color, dpi, duplex, copies });
  if (!out) {
    res.status(500).json({
      success: false,
      message: 'Render failed — is Ghostscript installed? Check GET /api/admin/spike/diag.',
    });
    return;
  }

  const base = (file.originalname || 'document').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60);
  res.setHeader('Content-Type', lang === 'ps' ? 'application/postscript' : 'application/vnd.hp-pcl');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${base}-${color}-${dpi}${duplex ? '-duplex' : ''}.${lang}"`,
  );
  res.send(out);
});

export default router;
