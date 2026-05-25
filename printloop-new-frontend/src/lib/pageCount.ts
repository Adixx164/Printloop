import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Authoritative-on-the-client page count. Mirrors the server's
 * `countPages` (see `01-backend/services/documentConvert.service.ts`)
 * so what we show in the preview matches what the server bills.
 *
 *  • PDF      → pdf.js numPages (exact)
 *  • Image    → 1
 *  • Unknown  → `{ pageCount: 0, rangeable: false, supported: false }` so
 *               UIs can reject the file with a clear message.
 *
 * Office formats (DOCX/PPTX/etc.) intentionally not supported here. The
 * server doesn't accept them either — users export to PDF first.
 *
 * `rangeable` flags whether the page-range selector should be enabled
 * (only true when we have a per-page enumeration we can trust — PDF).
 */
export type PageCountResult = {
  pageCount: number;
  rangeable: boolean;
  supported: boolean;
  source: "pdf" | "image" | "unknown";
};

function extOf(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}

async function countPdf(file: File): Promise<PageCountResult> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  return { pageCount: pdf.numPages, rangeable: true, supported: true, source: "pdf" };
}

export async function detectPages(file: File): Promise<PageCountResult> {
  const ext = extOf(file.name);
  const mime = (file.type || "").toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return countPdf(file);
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || mime.startsWith("image/")) {
    return { pageCount: 1, rangeable: false, supported: true, source: "image" };
  }
  return { pageCount: 0, rangeable: false, supported: false, source: "unknown" };
}
