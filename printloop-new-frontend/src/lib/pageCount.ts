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
 * Office formats (DOCX/PPTX/etc.) are recognised as `source: "office"`,
 * supported but NOT page-countable in the browser — the server converts
 * them to PDF on upload (V2-48) and counts the real pages there. The UI
 * collects an APPROXIMATE page count for an estimate and shows the
 * authoritative price on the receipt. Offer them only when the shop's
 * server has a converter (the `/pricing` `officeConversion` flag).
 *
 * `rangeable` flags whether the page-range selector should be enabled
 * (only true when we have a per-page enumeration we can trust — PDF).
 */
export type PageCountResult = {
  pageCount: number;
  rangeable: boolean;
  supported: boolean;
  source: "pdf" | "image" | "office" | "unknown";
};

function extOf(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}

/** Office formats the server can convert to PDF (mirror of OFFICE_EXT). */
export const OFFICE_EXTS = [
  "doc", "docx", "rtf", "odt", "txt",
  "ppt", "pptx", "odp",
  "xls", "xlsx", "ods", "csv",
];

/** Is this filename an office document we'd route through conversion? */
export function isOfficeName(name: string): boolean {
  return OFFICE_EXTS.includes(extOf(name || ""));
}

/** File-picker `accept` string, widened with office types when enabled. */
export function uploadAccept(officeEnabled: boolean): string {
  const base = "application/pdf,image/png,image/jpeg";
  return officeEnabled
    ? base + "," + OFFICE_EXTS.map((e) => "." + e).join(",")
    : base;
}

let pdfjsLib: typeof import("pdfjs-dist") | null = null;
let pdfWorkerSrc: string | null = null;

async function ensurePdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (pdfjsLib) return pdfjsLib;
  const [lib, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjsLib = lib;
  pdfWorkerSrc = worker.default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  return pdfjsLib;
}

async function countPdf(file: File): Promise<PageCountResult> {
  const lib = await ensurePdfJs();
  const buf = new Uint8Array(await file.arrayBuffer());
  const pdf = await lib.getDocument({ data: buf }).promise;
  return { pageCount: pdf.numPages, rangeable: true, supported: true, source: "pdf" };
}

export async function detectPages(file: File): Promise<PageCountResult> {
  const ext = extOf(file.name);
  const mime = (file.type || "").toLowerCase();
  if (ext === "pdf" || mime === "application/pdf") return countPdf(file);
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || mime.startsWith("image/")) {
    return { pageCount: 1, rangeable: false, supported: true, source: "image" };
  }
  // Office: supported (server converts), but we can't count pages here.
  if (isOfficeName(file.name)) {
    return { pageCount: 0, rangeable: false, supported: true, source: "office" };
  }
  return { pageCount: 0, rangeable: false, supported: false, source: "unknown" };
}
