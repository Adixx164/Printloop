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
