import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, stat, mkdir, copyFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path, { join, dirname, extname, basename } from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

const exec = promisify(execFile);

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
const bucket = process.env.S3_BUCKET;

export type RenderInput = {
  printJobId: string;
  tenantId: string;
  sourceFileKey: string;
  sourceFileUrl: string | null;
  fileName: string;
  printConfiguration?: {
    copies: number;
    paper: string;
    color: 'bw' | 'color';
    sided: 'single' | 'double';
    qualityDpi: 100 | 300 | 600;
    orientation?: 'portrait' | 'landscape';
  };
  watermarkId?: string | null;
  printerProfileId: string | null;
  /**
   * Resolved printer-profile render options (V2-56). Set by the
   * backend's enqueue when the tenant has a profile: the worker
   * rasterizes at the profile's DPI/colour and fits pages to its
   * paper size instead of blindly honouring the job's settings.
   * Null → legacy behaviour (job's own settings).
   */
  printerProfile?: {
    dpi: number;
    color: boolean;
    paperSize: string | null;
  } | null;
};

export type RenderResult = {
  printJobId: string;
  renderedKey: string;
  renderedPdfUrl: string;
  previewImageUrls: string[];
  pageCount: number;
  bytes: number;
  durationMs: number;
};

async function fetchToFile(key: string, dest: string): Promise<void> {
  if (!bucket) throw new Error("S3_BUCKET is required for direct S3 download");
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  await writeFile(dest, Buffer.from(bytes));
}

async function downloadSourceFile(url: string | null, key: string, dest: string): Promise<void> {
  if (url && /^https?:\/\//i.test(url)) {
    console.log(`[worker] Downloading source file from URL: ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch source file from URL ${url}: status ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    await writeFile(dest, Buffer.from(arrayBuffer));
    return;
  }
  // Fallback to S3 direct download
  console.log(`[worker] Downloading source file from S3 fallback: ${key}`);
  await fetchToFile(key, dest);
}

async function uploadFile(key: string, src: string, contentType: string): Promise<void> {
  if (!bucket) {
    const uploadDir = process.env.LOCAL_UPLOAD_DIR || join(process.cwd(), "..", "01-backend", "data", "uploads");
    const dest = join(uploadDir, key);
    console.log(`[worker] Local upload fallback: writing to ${dest}`);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    return;
  }
  const body = await readFile(src);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

function getUrl(key: string): string {
  if (bucket) {
    const region = process.env.AWS_REGION ?? "us-east-1";
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  } else {
    const apiBase = (process.env.PRINTLOOP_API_URL || "http://localhost:4000").replace(/\/$/, "");
    return `${apiBase}/api/files/${key}`;
  }
}

async function resolveGsBinary(): Promise<string> {
  const candidates = process.env.GHOSTSCRIPT_BIN 
    ? [process.env.GHOSTSCRIPT_BIN] 
    : (process.platform === 'win32' ? ['gswin64c', 'gswin32c', 'gs'] : ['gs']);

  for (const bin of candidates) {
    try {
      await exec(bin, ["--version"]);
      return bin;
    } catch {
      // ignore
    }
  }
  return "gs";
}

// Normalise to PDF/A via Ghostscript — strips weird embedded streams
// that break older printers and re-encodes images consistently.
async function toPdfA(gsBin: string, src: string, dst: string): Promise<void> {
  await exec(gsBin, [
    "-dPDFA=2",
    "-dBATCH",
    "-dNOPAUSE",
    "-sProcessColorModel=DeviceRGB",
    "-sDEVICE=pdfwrite",
    "-sPDFACompatibilityPolicy=1",
    `-sOutputFile=${dst}`,
    src,
  ]);
}

async function toGrayscale(gsBin: string, src: string, dst: string): Promise<void> {
  await exec(gsBin, [
    "-sDEVICE=pdfwrite",
    "-sColorConversionStrategy=Gray",
    "-dProcessColorModel=/DeviceGray",
    "-dNOPAUSE",
    "-dBATCH",
    "-dSAFER",
    "-dQUIET",
    `-sOutputFile=${dst}`,
    src,
  ]);
}

// PDF → PWG-Raster via cups-filters' pdftopwg. Default 600dpi colour.
async function pdfToPwg(
  src: string,
  dst: string,
  opts: { dpi?: number; color?: boolean } = {}
): Promise<void> {
  const dpi = opts.dpi ?? 600;
  const docType = opts.color === false ? "Black_1" : "SRGB_8";

  return new Promise((resolve, reject) => {
    const cmd = process.platform === "win32" ? "pdftopwg.exe" : "pdftopwg";
    const env = {
      ...process.env,
      PPD: "",
      PWG_RASTER_DOCUMENT_RESOLUTION: String(dpi),
      PWG_RASTER_DOCUMENT_TYPE: docType,
    };

    const proc = spawn(cmd, [], { env, stdio: ["pipe", "pipe", "inherit"] });

    const readStream = createReadStream(src);
    const writeStream = createWriteStream(dst);

    readStream.on("error", (err) => reject(err));
    writeStream.on("error", (err) => reject(err));
    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pdftopwg exited with code ${code}`));
      }
    });

    readStream.pipe(proc.stdin);
    proc.stdout.pipe(writeStream);
  });
}

async function countPagesFromPwg(pwgPath: string): Promise<number> {
  const buf = await readFile(pwgPath);
  let pages = 0;
  for (let i = 0; i <= buf.length - 4; i++) {
    if (
      buf[i] === 0x52 &&
      buf[i + 1] === 0x61 &&
      buf[i + 2] === 0x53 &&
      buf[i + 3] === 0x32
    ) {
      pages++;
      i += 3;
    }
  }
  return pages;
}

async function convertOfficeToPdf(src: string, outDir: string): Promise<string> {
  try {
    await exec("soffice", [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      outDir,
      src
    ]);
  } catch (err: any) {
    if (err.code === 'ENOENT' || err.message?.includes('ENOENT') || err.message?.includes('not found') || err.message?.includes('is not recognized')) {
      console.warn("[worker] LibreOffice (soffice) not found on PATH, checking standard paths...");
      const winPaths = [
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
      ];
      let success = false;
      for (const p of winPaths) {
        try {
          await exec(p, [
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            outDir,
            src
          ]);
          success = true;
          break;
        } catch {
          // try next
        }
      }
      if (!success) {
        throw new Error(
          "LibreOffice (soffice) is required for office document conversion but was not found. " +
          "Please install LibreOffice or configure the worker environment."
        );
      }
    } else {
      throw err;
    }
  }

  const baseName = basename(src, extname(src));
  return join(outDir, `${baseName}.pdf`);
}

async function wrapImageInPdf(imagePath: string, extension: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const imageBytes = await readFile(imagePath);
  let img;
  if (extension === '.png') {
    img = await pdfDoc.embedPng(imageBytes);
  } else {
    img = await pdfDoc.embedJpg(imageBytes);
  }
  const A4 = { w: 595.28, h: 841.89 };
  const scale = Math.min(A4.w / img.width, A4.h / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  const page = pdfDoc.addPage([A4.w, A4.h]);
  page.drawImage(img, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h });
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function parsePageRange(rangeStr: string | undefined | null, totalPages: number): number[] {
  if (!rangeStr || typeof rangeStr !== 'string') return [];
  const cap = Math.max(0, Math.floor(totalPages) || 0);
  if (cap === 0) return [];
  const seen = new Set<number>();
  for (const chunk of rangeStr.split(',')) {
    const piece = chunk.trim();
    if (!piece) continue;
    const openEnd = piece.match(/^(\d+)\s*-\s*$/);
    if (openEnd) {
      for (let p = +openEnd[1]; p <= cap; p++) {
        if (p >= 1) seen.add(p);
      }
      continue;
    }
    const closed = piece.match(/^(\d+)\s*-\s*(\d+)$/);
    if (closed) {
      const lo = Math.max(1, +closed[1]);
      const hi = Math.min(cap, +closed[2]);
      for (let p = lo; p <= hi; p++) seen.add(p);
      continue;
    }
    if (/^\d+$/.test(piece)) {
      const p = +piece;
      if (p >= 1 && p <= cap) seen.add(p);
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
}

const PAPER_DIMS: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  LETTER: [612, 792],
  LEGAL: [612, 1008],
};

/**
 * Fit every page of the document onto the target sheet, scale-to-fit
 * and centred (V2-56 — printer-profile paper size). Pages already on
 * the target pass through byte-identical page geometry.
 */
async function fitToPaper(
  pdfDoc: PDFDocument,
  paperSize: string,
): Promise<PDFDocument> {
  const dims = PAPER_DIMS[String(paperSize).toUpperCase()];
  if (!dims) return pdfDoc;

  const [sheetW, sheetH] = dims;
  const pages = pdfDoc.getPages();
  const needsFit = pages.some((p) => {
    const { width, height } = p.getSize();
    return Math.round(width) !== sheetW || Math.round(height) !== sheetH;
  });
  if (!needsFit) return pdfDoc;

  const fittedDoc = await PDFDocument.create();
  const embedded = await fittedDoc.embedPages(pages);
  for (let i = 0; i < pages.length; i++) {
    const { width: w, height: h } = pages[i].getSize();
    const scale = Math.min(sheetW / w, sheetH / h);
    const dw = w * scale;
    const dh = h * scale;
    const page = fittedDoc.addPage([sheetW, sheetH]);
    page.drawPage(embedded[i], {
      x: (sheetW - dw) / 2,
      y: (sheetH - dh) / 2,
      width: dw,
      height: dh,
    });
  }
  return fittedDoc;
}

async function processPdf(
  inputBytes: Buffer,
  cfg: any,
  watermarkId: string | null | undefined,
  printerProfile?: { paperSize?: string | null } | null
): Promise<Buffer> {
  let pdfDoc = await PDFDocument.load(inputBytes, { updateMetadata: false });

  // 1. Page range slicing
  if (cfg && cfg.pages === 'range' && cfg.pageRange) {
    const total = pdfDoc.getPageCount();
    const wanted = parsePageRange(String(cfg.pageRange), total);
    if (wanted.length > 0) {
      const slicedDoc = await PDFDocument.create();
      const indices = wanted
        .filter((p) => p >= 1 && p <= total)
        .map((p) => p - 1);
      
      if (indices.length > 0) {
        const copied = await slicedDoc.copyPages(pdfDoc, indices);
        for (const page of copied) {
          slicedDoc.addPage(page);
        }
        pdfDoc = slicedDoc;
      }
    }
  }

  // 2. Watermark
  if (watermarkId) {
    const pages = pdfDoc.getPages();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 10;
    const padding = 20;
    for (const page of pages) {
      const { width, height } = page.getSize();
      const textWidth = helveticaFont.widthOfTextAtSize(watermarkId, fontSize);
      page.drawText(watermarkId, {
        x: width - textWidth - padding,
        y: padding,
        size: fontSize,
        font: helveticaFont,
        color: rgb(0.4, 0.4, 0.4),
        opacity: 0.6,
      });
    }
  }

  // 3. Orientation fitting
  if (cfg && (cfg.orientation === 'landscape' || cfg.orientation === 'portrait')) {
    const target = cfg.orientation;
    const wantLandscape = target === 'landscape';
    const pages = pdfDoc.getPages();
    const needsFit = pages.some((p) => {
      const { width, height } = p.getSize();
      return width !== height && (width > height) !== wantLandscape;
    });

    if (needsFit) {
      const fittedDoc = await PDFDocument.create();
      const embedded = await fittedDoc.embedPages(pages);
      for (let i = 0; i < pages.length; i++) {
        const { width: w, height: h } = pages[i].getSize();
        const pageLandscape = w > h;
        if (w === h || pageLandscape === wantLandscape) {
          const p = fittedDoc.addPage([w, h]);
          p.drawPage(embedded[i], { x: 0, y: 0, width: w, height: h });
        } else {
          const long = Math.max(w, h);
          const short = Math.min(w, h);
          const sheetW = wantLandscape ? long : short;
          const sheetH = wantLandscape ? short : long;
          const scale = Math.min(sheetW / w, sheetH / h);
          const dw = w * scale;
          const dh = h * scale;
          const p = fittedDoc.addPage([sheetW, sheetH]);
          p.drawPage(embedded[i], {
            x: (sheetW - dw) / 2,
            y: (sheetH - dh) / 2,
            width: dw,
            height: dh,
          });
        }
      }
      pdfDoc = fittedDoc;
    }
  }

  // 3.5. Fit to the printer profile's paper size (V2-56) — runs after
  // orientation so landscape pages land on the landscape sheet.
  if (printerProfile?.paperSize) {
    pdfDoc = await fitToPaper(pdfDoc, printerProfile.paperSize);
  }

  const resultBytes = await pdfDoc.save();
  return Buffer.from(resultBytes);
}

let cachedFontUrl: string | undefined;
function standardFontDataUrl(): string {
  if (cachedFontUrl) return cachedFontUrl;
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve("pdfjs-dist/package.json");
  cachedFontUrl = pathToFileURL(join(dirname(pkgJson), "standard_fonts") + path.sep).href;
  return cachedFontUrl;
}

if (typeof (Promise as any).withResolvers !== "function") {
  (Promise as any).withResolvers = function () {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

async function generatePreviews(pdfBuffer: Buffer, limit = 3): Promise<Buffer[]> {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    standardFontDataUrl: standardFontDataUrl(),
    isEvalSupported: false,
  }).promise;

  const previewBuffers: Buffer[] = [];
  const totalPages = doc.numPages;
  const pagesToRender = Math.min(totalPages, limit);

  try {
    for (let i = 1; i <= pagesToRender; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 150 / 72 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx as any,
        viewport,
      }).promise;

      page.cleanup();
      const jpgBuf = canvas.toBuffer("image/jpeg", 80);
      previewBuffers.push(jpgBuf);
    }
  } finally {
    await doc.cleanup();
    await doc.destroy();
  }

  return previewBuffers;
}

export async function renderToPwgRaster(
  input: RenderInput
): Promise<RenderResult> {
  const t0 = Date.now();
  const work = await mkdtemp(join(tmpdir(), "render-"));
  const ext = extname(input.fileName || "document.pdf").toLowerCase();
  const rawSrc = join(work, `raw_src${ext}`);
  
  await downloadSourceFile(input.sourceFileUrl, input.sourceFileKey, rawSrc);

  const officeExtensions = [".docx", ".doc", ".pptx", ".ppt", ".odt", ".odp", ".xlsx", ".xls", ".ods"];
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];

  let normalizedPdfPath = rawSrc;
  if (officeExtensions.includes(ext)) {
    console.log(`[worker] Office document detected: converting ${ext} to PDF via LibreOffice...`);
    normalizedPdfPath = await convertOfficeToPdf(rawSrc, work);
  } else if (imageExtensions.includes(ext)) {
    console.log(`[worker] Image file detected: wrapping ${ext} into PDF...`);
    const wrappedPdf = await wrapImageInPdf(rawSrc, ext);
    normalizedPdfPath = join(work, "wrapped_image.pdf");
    await writeFile(normalizedPdfPath, wrappedPdf);
  }

  // Apply configurations inside PDF Document (plus the printer
  // profile's paper fit — V2-56).
  console.log(`[worker] Loading and modifying PDF with configurations...`);
  const rawPdfBytes = await readFile(normalizedPdfPath);
  const processedPdfBytes = await processPdf(
    rawPdfBytes,
    input.printConfiguration,
    input.watermarkId,
    input.printerProfile,
  );
  const processedPdfPath = join(work, "processed.pdf");
  await writeFile(processedPdfPath, processedPdfBytes);

  // Normalize to PDF/A (RGB) and convert color mode
  const finalPdfPath = join(work, "final.pdf");
  const gsBin = await resolveGsBinary();
  console.log(`[worker] Running Ghostscript normalisation...`);
  await toPdfA(gsBin, processedPdfPath, finalPdfPath);

  // B&W requested (by the customer OR by a mono printer profile —
  // V2-56): convert the PDF to grayscale via Ghostscript so both the
  // raster and the stored PDF artifact are true mono.
  const forceGray = input.printConfiguration?.color === "bw" || input.printerProfile?.color === false;
  if (forceGray) {
    console.log(`[worker] B&W requested: converting PDF to grayscale via Ghostscript...`);
    const grayPdfPath = join(work, "gray.pdf");
    await toGrayscale(gsBin, finalPdfPath, grayPdfPath);
    await copyFile(grayPdfPath, finalPdfPath);
  }

  // Convert to PWG-raster. With a printer profile (V2-56) the DPI and
  // colour mode come from the profile's resolved options — the
  // backend clamped them to the machine's capabilities — otherwise the
  // customer's own settings apply (legacy behaviour).
  console.log(`[worker] Converting PDF to PWG-raster...`);
  const pwg = join(work, "out.pwg");
  const qualityDpi = input.printerProfile?.dpi ?? input.printConfiguration?.qualityDpi ?? 600;
  const isColor =
    input.printerProfile?.color ?? input.printConfiguration?.color !== "bw";
  await pdfToPwg(finalPdfPath, pwg, { dpi: qualityDpi, color: isColor });

  const pageCount = await countPagesFromPwg(pwg);
  const st = await stat(pwg);

  // Upload outputs
  const renderedKey = `renders/${input.tenantId}/${input.printJobId}.pwg`;
  const pdfKey = `renders/${input.tenantId}/${input.printJobId}.pdf`;

  console.log(`[worker] Uploading rendered PWG-raster and PDF...`);
  await uploadFile(renderedKey, pwg, "application/vnd.cups-pwg-raster");
  await uploadFile(pdfKey, finalPdfPath, "application/pdf");

  const previewImageUrls: string[] = [];
  try {
    console.log(`[worker] Generating JPEG previews...`);
    const finalPdfBytes = await readFile(finalPdfPath);
    const previews = await generatePreviews(finalPdfBytes, 3);
    for (let i = 0; i < previews.length; i++) {
      const previewKey = `renders/${input.tenantId}/${input.printJobId}_preview_${i}.jpg`;
      const tempPreviewPath = join(work, `preview_${i}.jpg`);
      await writeFile(tempPreviewPath, previews[i]);
      await uploadFile(previewKey, tempPreviewPath, "image/jpeg");
      previewImageUrls.push(getUrl(previewKey));
    }
  } catch (err) {
    console.error("[worker] Failed to generate preview JPEGs:", err);
  }

  const renderedPdfUrl = getUrl(pdfKey);

  return {
    printJobId: input.printJobId,
    renderedKey,
    renderedPdfUrl,
    previewImageUrls,
    pageCount,
    bytes: st.size,
    durationMs: Date.now() - t0,
  };
}
