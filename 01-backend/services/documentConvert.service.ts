import { PDFDocument } from 'pdf-lib';

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
