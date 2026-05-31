import { PDFDocument, PDFName, PDFArray, PDFDict, type PDFPage } from 'pdf-lib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

/** Thrown when an upload/job is not a PDF or supported image. */
export class UnsupportedDocumentError extends Error {
  code = 'UNSUPPORTED_DOCUMENT';
  constructor(msg: string) {
    super(msg);
  }
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg'];
export const ALLOWED_LABEL = 'PDF, JPG, PNG';

function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}
function isPdf(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * AUTHORITATIVE page count from the actual bytes — never trust a
 * client-supplied count (it drives pricing/policy). Images = 1 page;
 * PDFs are parsed. Encrypted/garbled PDFs throw UnsupportedDocumentError.
 *
 * Office formats (DOCX/PPTX/etc.) are not supported. Their page counts
 * can't be derived deterministically without rendering through Word /
 * PowerPoint (which we don't run), so accepting them would mean trusting
 * a number we can't verify. Users export to PDF first.
 */
export async function countPages(input: Buffer, fileName: string): Promise<number> {
  const ext = extOf(fileName);
  if (IMAGE_EXT.includes(ext) && !isPdf(input)) return 1;
  try {
    const pdf = await PDFDocument.load(input, {
      updateMetadata: false,
      ignoreEncryption: false,
    });
    const n = pdf.getPageCount();
    if (!Number.isFinite(n) || n < 1) throw new Error('no pages');
    return n;
  } catch {
    throw new UnsupportedDocumentError(
      `Could not read "${fileName}". It must be an unencrypted PDF or a JPG/PNG image.`
    );
  }
}

/** Upload-gate: is this a printable document (PDF or JPG/PNG)? */
export function isPrintableDocument(fileName: string, mime?: string): boolean {
  const ext = extOf(fileName || '');
  if (ext === 'pdf' || IMAGE_EXT.includes(ext)) return true;
  const m = (mime || '').toLowerCase();
  return m === 'application/pdf' || m === 'image/png' || m === 'image/jpeg' || m === 'image/jpg';
}

async function imageToPdf(buf: Buffer, ext: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const img = ext === 'png' ? await pdf.embedPng(buf) : await pdf.embedJpg(buf);
  // Fit the image inside an A4 page, preserving aspect ratio.
  const A4 = { w: 595.28, h: 841.89 };
  const scale = Math.min(A4.w / img.width, A4.h / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  const page = pdf.addPage([A4.w, A4.h]);
  page.drawImage(img, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
  return Buffer.from(await pdf.save());
}

/**
 * Guarantee a print-ready PDF. PrintLoop accepts ONLY PDF and images:
 *   - PDF      → passthrough (byte-exact, untouched)
 *   - PNG/JPG  → wrapped to an A4 PDF (pdf-lib, no external deps)
 * Anything else throws UnsupportedDocumentError so callers can return a
 * clear kiosk/API message.
 */
export async function ensurePdf(
  input: Buffer,
  fileName: string
): Promise<{ buffer: Buffer; converted: boolean; from: string }> {
  const ext = extOf(fileName);
  if (isPdf(input) || ext === 'pdf') {
    return { buffer: input, converted: false, from: 'pdf' };
  }
  if (IMAGE_EXT.includes(ext)) {
    return { buffer: await imageToPdf(input, ext), converted: true, from: ext };
  }
  throw new UnsupportedDocumentError(
    `Unsupported file type ".${ext || 'unknown'}". PrintLoop prints ${ALLOWED_LABEL} only.`
  );
}

/**
 * Parse a user-supplied page-range expression into a sorted, deduped
 * 1-based page index list, clipped to the document's actual page
 * count. Examples (totalPages = 10):
 *   "1"        → [1]
 *   "1-3"      → [1, 2, 3]
 *   "1,3,5"    → [1, 3, 5]
 *   "2-4,7,9-" → [2, 3, 4, 7] + [9, 10]   (open-ended right side)
 *   "0,15,1-3" → [1, 2, 3]                 (clips zero + over-range)
 *   ""         → []                        (caller treats as "no range")
 *
 * Returns an empty array when the input is empty / unparseable so the
 * caller can fall back to "print every page."
 */
export function parsePageRange(rangeStr: string | undefined | null, totalPages: number): number[] {
  if (!rangeStr || typeof rangeStr !== 'string') return [];
  const cap = Math.max(0, Math.floor(totalPages) || 0);
  if (cap === 0) return [];
  const seen = new Set<number>();
  for (const chunk of rangeStr.split(',')) {
    const piece = chunk.trim();
    if (!piece) continue;
    // Open-ended right side: "9-" → 9..totalPages
    const openEnd = piece.match(/^(\d+)\s*-\s*$/);
    if (openEnd) {
      for (let p = +openEnd[1]; p <= cap; p++) {
        if (p >= 1) seen.add(p);
      }
      continue;
    }
    // Closed range: "2-4"
    const closed = piece.match(/^(\d+)\s*-\s*(\d+)$/);
    if (closed) {
      const lo = Math.max(1, +closed[1]);
      const hi = Math.min(cap, +closed[2]);
      for (let p = lo; p <= hi; p++) seen.add(p);
      continue;
    }
    // Single page: "5"
    if (/^\d+$/.test(piece)) {
      const p = +piece;
      if (p >= 1 && p <= cap) seen.add(p);
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/**
 * Build a new PDF containing only the requested pages (1-based) from
 * the source PDF, in the order given. Returns the original buffer
 * unchanged if `pageNumbers` is empty, contains every page in order,
 * or is invalid — so callers can pass it the customer's selection
 * without pre-checking.
 *
 * Used by the agent-pull download endpoint to honor
 * `printConfiguration.pages === 'range'` server-side — the printer
 * receives only the pages the customer paid for.
 */
export async function extractPages(input: Buffer, pageNumbers: number[]): Promise<Buffer> {
  if (!pageNumbers || pageNumbers.length === 0) return input;
  const source = await PDFDocument.load(input, { updateMetadata: false }).catch(() => null);
  if (!source) return input;
  const total = source.getPageCount();
  // Clamp + 0-index. If the result would be the full document in order,
  // skip the copy — saves CPU + keeps the original byte stream which
  // is the format the printer's seen working with.
  const indices = pageNumbers
    .filter((p) => Number.isFinite(p) && p >= 1 && p <= total)
    .map((p) => Math.floor(p) - 1);
  if (indices.length === 0) return input;
  const isIdentity = indices.length === total && indices.every((v, i) => v === i);
  if (isIdentity) return input;

  const out = await PDFDocument.create();
  const copied = await out.copyPages(source, indices);
  for (const page of copied) out.addPage(page);
  return Buffer.from(await out.save());
}

// ── Annotation flattening (rasterize annotated pages) ──────────────────
//
// Why this exists: signatures and form fills created by Preview, Adobe,
// or phone apps are stored as /Ink, /FreeText, /Stamp, or /Widget
// annotations layered ON TOP of the page — they live in the page's
// /Annots array, NOT in its content stream. Many office-printer RIPs
// (the Sharp MX-5112N among them) mis-place or silently drop these
// annotations on paper even though they sit correctly on screen — a
// signature jumps out of its box, or vanishes entirely.
//
// We first tried a pure-vector fix (re-inline each appearance's operators
// into the page content with the transform baked into a `cm`). It was
// verified pixel-perfect in a spec-compliant renderer (PDF.js) yet STILL
// mangled by the real print paths: the Sharp moved it, and Edge's print
// engine dropped it. The one representation a broken RIP physically
// cannot misplace is a flat raster, so that is what we ship.
//
// Strategy: any page that carries a visible annotation is rendered with
// its annotations baked in (pdfjs-dist + @napi-rs/canvas, both prebuilt
// for Railway's Linux) to a RASTER_DPI image and rebuilt as an image-only
// page. Pages with no visible annotation are copied through untouched, so
// ordinary text pages stay crisp vector. A document with NO annotations
// anywhere is returned BYTE-EXACT — the common case pays nothing.
//
// Graceful by design (mirrors toGrayscale): a non-PDF, an unreadable /
// encrypted PDF, or ANY error during rendering returns the ORIGINAL bytes.

/** Render resolution for flattened pages. 200 DPI keeps form text crisp
 *  to the eye while holding an A4 colour page near ~240 KB. */
const RASTER_DPI = 200;

/** pdfjs-dist is a heavy ESM module; import it once, lazily, on first use. */
let pdfjsModule: any;
async function loadPdfjs(): Promise<any> {
  if (pdfjsModule) return pdfjsModule;
  // pdfjs-dist v4 calls Promise.withResolvers (Node 22+); the backend runs
  // Node 20, so polyfill it before the module's top-level code touches it.
  if (typeof (Promise as any).withResolvers !== 'function') {
    (Promise as any).withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
  pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsModule;
}

/** file:// URL to pdfjs-dist's bundled standard_fonts dir, resolved off the
 *  package location (NOT process.cwd) so it works regardless of the launch
 *  directory on Windows or Railway. */
let cachedFontUrl: string | undefined;
function standardFontDataUrl(): string {
  if (cachedFontUrl) return cachedFontUrl;
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve('pdfjs-dist/package.json');
  cachedFontUrl = pathToFileURL(path.join(path.dirname(pkgJson), 'standard_fonts') + path.sep).href;
  return cachedFontUrl;
}

/** 0-based indices of pages carrying a visible annotation. /Link and /Popup
 *  never paint on the page, so a page bearing only those is treated as clean
 *  and left as crisp vector. (pdf-lib's typed `lookup(name, Type)` THROWS on a
 *  missing or mistyped key, so every lookup is wrapped.) */
function annotatedPageIndices(pdf: PDFDocument): Set<number> {
  const result = new Set<number>();
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    let annots: PDFArray | undefined;
    try {
      annots = pages[i].node.lookup(PDFName.of('Annots'), PDFArray);
    } catch {
      annots = undefined;
    }
    if (!annots || annots.size() === 0) continue;
    for (let a = 0; a < annots.size(); a++) {
      let dict: PDFDict | undefined;
      try {
        dict = pdf.context.lookup(annots.get(a), PDFDict);
      } catch {
        dict = undefined;
      }
      const subtype = dict?.lookup(PDFName.of('Subtype'))?.toString();
      if (subtype && subtype !== '/Popup' && subtype !== '/Link') {
        result.add(i);
        break;
      }
    }
  }
  return result;
}

/**
 * Render every annotated page (annotations baked in) to a RASTER_DPI PNG and
 * rebuild it as an image-only page at the original page's point size; copy the
 * remaining pages through as untouched vector. Returns the new PDF bytes.
 *
 * Page count and physical page geometry are preserved exactly, so the SNMP
 * page-count math and per-page pricing downstream are unaffected.
 */
async function rasterizeAnnotatedPages(
  input: Buffer,
  src: PDFDocument,
  annotated: Set<number>,
): Promise<Buffer> {
  const pdfjs = await loadPdfjs();
  const { createCanvas } = await import('@napi-rs/canvas');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(input),
    standardFontDataUrl: standardFontDataUrl(),
    isEvalSupported: false, // keep it sandbox-safe; fine for our forms
  }).promise;

  try {
    const out = await PDFDocument.create();
    const count = src.getPageCount();
    const scale = RASTER_DPI / 72;

    // Deep-copy every vector (un-annotated) page in ONE batch so pdf-lib
    // de-duplicates shared resources, then slot them back at their indices.
    const vectorIdx: number[] = [];
    for (let i = 0; i < count; i++) if (!annotated.has(i)) vectorIdx.push(i);
    const copied = vectorIdx.length ? await out.copyPages(src, vectorIdx) : [];
    const vectorPage = new Map<number, PDFPage>();
    vectorIdx.forEach((origIdx, k) => vectorPage.set(origIdx, copied[k]));

    for (let i = 0; i < count; i++) {
      const vec = vectorPage.get(i);
      if (vec) {
        out.addPage(vec);
        continue;
      }
      const page = await doc.getPage(i + 1);
      const ptsViewport = page.getViewport({ scale: 1 }); // page size in PDF points
      const pxViewport = page.getViewport({ scale }); // render size in pixels
      const canvas = createCanvas(Math.ceil(pxViewport.width), Math.ceil(pxViewport.height));
      const cctx = canvas.getContext('2d');
      cctx.fillStyle = 'white';
      cctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvasContext: cctx as any,
        viewport: pxViewport,
        annotationMode: pdfjs.AnnotationMode.ENABLE, // bake annotations into pixels
      }).promise;
      page.cleanup();
      const img = await out.embedPng(canvas.toBuffer('image/png'));
      const p = out.addPage([ptsViewport.width, ptsViewport.height]);
      p.drawImage(img, { x: 0, y: 0, width: ptsViewport.width, height: ptsViewport.height });
    }

    return Buffer.from(await out.save());
  } finally {
    await doc.cleanup();
    await doc.destroy();
  }
}

/**
 * Bake annotations (signatures, form fills) into the pages that carry them so
 * a broken print RIP can't move or drop them, and return the rewritten PDF.
 *
 * Graceful by design (mirrors {@link toGrayscale}): a non-PDF input, an
 * encrypted/unreadable PDF, a PDF with NO visible annotations, or ANY error
 * during rendering returns the ORIGINAL bytes — the no-annotation common case
 * is handed back BYTE-EXACT (never re-serialized), so it pays nothing and
 * can't be altered. Uploads never break on account of this step.
 */
export async function flattenAnnotations(input: Buffer): Promise<Buffer> {
  if (!isPdf(input)) return input;

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(input, { updateMetadata: false });
  } catch {
    // Encrypted or malformed — leave it for the downstream pipeline.
    return input;
  }

  const annotated = annotatedPageIndices(src);
  if (annotated.size === 0) return input; // nothing to bake → byte-exact

  try {
    return await rasterizeAnnotatedPages(input, src, annotated);
  } catch (e: any) {
    console.warn('[documentConvert] flattenAnnotations failed, sending original:', e?.message);
    return input;
  }
}

// ── Ghostscript grayscale enforcement ─────────────────────────────────
//
// Why this exists: the Sharp MX-5112N (like many office MFPs) ignores
// the PJL color directives the agent emits (@PJL SET RENDERMODE=GRAYSCALE
// and 5 sibling hints) for PDF input — it prints whatever color space
// the PDF carries. The ONLY firmware-proof way to honor a customer's
// "black & white" choice is to strip the color from the bytes before
// they ever reach the printer. Ghostscript's pdfwrite device with
// `-sColorConversionStrategy=Gray` remaps every color object to
// DeviceGray in a single pass, vector and raster alike.

/**
 * Candidate Ghostscript executables by platform. Linux/macOS expose the
 * binary as `gs`; Windows ships `gswin64c` / `gswin32c` (the `c` suffix
 * is the console build — the non-`c` ones pop a GUI window). An explicit
 * GHOSTSCRIPT_BIN env var wins so a deploy can pin an absolute path.
 */
function gsCandidates(): string[] {
  const override = process.env.GHOSTSCRIPT_BIN;
  if (override) return [override];
  if (process.platform === 'win32') return ['gswin64c', 'gswin32c'];
  return ['gs'];
}

// Probe result is cached for the life of the process: undefined = not
// yet probed, string = the working binary, null = none found.
let cachedGsBin: string | null | undefined;

async function resolveGsBinary(): Promise<string | null> {
  if (cachedGsBin !== undefined) return cachedGsBin;
  for (const bin of gsCandidates()) {
    try {
      await execFileAsync(bin, ['--version'], { timeout: 5000 });
      cachedGsBin = bin;
      return bin;
    } catch {
      // Try the next candidate name.
    }
  }
  cachedGsBin = null;
  return null;
}

/** True iff a Ghostscript binary is callable on this host. */
export async function ghostscriptAvailable(): Promise<boolean> {
  return (await resolveGsBinary()) !== null;
}

/**
 * Force a PDF to grayscale via Ghostscript, returning the converted
 * bytes. Page count and dimensions are preserved (so the SNMP
 * physical-print confirmation's expected-page math is unchanged).
 *
 * Graceful by design: if Ghostscript isn't installed, or the conversion
 * errors for ANY reason, we return the ORIGINAL bytes and log a warning.
 * A color print is a far better failure mode than a failed print — the
 * customer still gets their document and the operator sees the warning
 * and installs gs. We run with `-dSAFER` because the input is an
 * untrusted user-supplied PDF.
 */
export async function toGrayscale(pdfBytes: Buffer): Promise<Buffer> {
  const bin = await resolveGsBinary();
  if (!bin) {
    console.warn(
      '[documentConvert] Ghostscript not found — cannot force grayscale; ' +
        'sending original (color) PDF. Install ghostscript to enable B&W enforcement.',
    );
    return pdfBytes;
  }

  const stamp = crypto.randomBytes(8).toString('hex');
  const inPath = path.join(os.tmpdir(), `pl-gs-${stamp}-in.pdf`);
  const outPath = path.join(os.tmpdir(), `pl-gs-${stamp}-out.pdf`);

  try {
    await fs.writeFile(inPath, pdfBytes);
    await execFileAsync(
      bin,
      [
        '-sDEVICE=pdfwrite',
        '-sColorConversionStrategy=Gray',
        '-dProcessColorModel=/DeviceGray',
        '-dNOPAUSE',
        '-dBATCH',
        '-dSAFER',
        '-dQUIET',
        `-sOutputFile=${outPath}`,
        inPath,
      ],
      { timeout: 120000, maxBuffer: 64 * 1024 * 1024 },
    );
    const out = await fs.readFile(outPath);
    if (!out || out.length === 0) throw new Error('Ghostscript produced an empty file');
    return out;
  } catch (e: any) {
    console.warn('[documentConvert] grayscale conversion failed, sending original:', e?.message);
    return pdfBytes;
  } finally {
    fs.unlink(inPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
  }
}

// ── Landscape orientation (scale-to-fit, no content rotation) ──────────
//
// Why this exists: when a customer picks "landscape" for a portrait
// document, the only thing the agent does is send a PJL
// `SET ORIENTATION=LANDSCAPE` hint — and the Sharp MX-5112N ignores that
// hint for PDF input (the same firmware quirk that forced grayscale and
// signature flattening into the bytes). The printer DOES obey the PDF's
// own page geometry, so orientation has to be baked in there too.
//
// The customer's expectation (confirmed against a real proposal): the
// upright page is **scaled to fit a rotated (landscape) sheet, NOT turned
// on its side.** So for every portrait page we build a landscape-shaped
// page of the same paper size (the long edge becomes the width) and draw
// the original page into it, scaled to fit (contain) and centred — the
// letterboxed result the customer asked for, with even margins left/right.
// Already-landscape (or square) pages are left exactly as they are.
//
// Page COUNT is preserved (so the SNMP physical-print confirmation math is
// unchanged). Graceful by design (mirrors toGrayscale): a non-PDF, an
// unreadable PDF, a document that is already landscape on every page, or
// ANY error returns the ORIGINAL bytes — a portrait print beats a failed
// print.
export async function fitToLandscape(input: Buffer): Promise<Buffer> {
  if (!isPdf(input)) return input;

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(input, { updateMetadata: false });
  } catch {
    return input;
  }

  try {
    const pages = src.getPages();
    // Nothing to do if every page is already landscape (or square).
    const hasPortrait = pages.some((p) => {
      const { width, height } = p.getSize();
      return height > width;
    });
    if (!hasPortrait) return input;

    const out = await PDFDocument.create();
    // Embed every source page once (batched so shared resources dedupe),
    // then place each onto a fresh page.
    const embedded = await out.embedPages(pages);
    for (let i = 0; i < pages.length; i++) {
      const { width: w, height: h } = pages[i].getSize();
      if (w >= h) {
        // Already landscape (or square): copy 1:1 onto a same-size page.
        const p = out.addPage([w, h]);
        p.drawPage(embedded[i], { x: 0, y: 0, width: w, height: h });
        continue;
      }
      // Portrait → landscape sheet of the same paper size (swap W/H), with
      // the upright page contained inside it: scale to fit, no rotation, no
      // crop, centred — even pillarbox margins on the left and right.
      const landW = h;
      const landH = w;
      const scale = Math.min(landW / w, landH / h);
      const dw = w * scale;
      const dh = h * scale;
      const p = out.addPage([landW, landH]);
      p.drawPage(embedded[i], {
        x: (landW - dw) / 2,
        y: (landH - dh) / 2,
        width: dw,
        height: dh,
      });
    }
    return Buffer.from(await out.save());
  } catch (e: any) {
    console.warn('[documentConvert] fitToLandscape failed, sending original:', e?.message);
    return input;
  }
}
