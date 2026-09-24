/**
 * Office → PDF conversion (V2-48) — the "document conversion" black box
 * from BLACK-BOXES.md (#1).
 *
 * PrintLoop only prints PDF + images. A student uploading .docx / .pptx
 * / .xlsx had no path: countPages can't paginate an office file without
 * rendering it, and the render pipeline only speaks PDF. We delegate the
 * hard part — faithfully rendering arbitrary office formats — to a
 * sealed converter and get a PDF back.
 *
 * Provider-gated exactly like the geocoder (GEOCODER=fixture|nominatim)
 * and the printer transport:
 *
 *   DOC_CONVERTER = gotenberg | soffice | none   (default: auto)
 *   GOTENBERG_URL = http://localhost:3000        (when gotenberg)
 *   LIBREOFFICE_BIN = /usr/bin/soffice           (optional override)
 *   DOC_CONVERT_TIMEOUT_MS = 60000
 *
 * Auto-resolution: if DOC_CONVERTER is unset, we use gotenberg when
 * GOTENBERG_URL is set, else none. `none` means office uploads are
 * rejected with a clear message (today's behaviour) — nothing breaks
 * when the black box isn't wired up.
 *
 * Recommended provider: **Gotenberg** (a Docker image wrapping
 * LibreOffice over HTTP). It's stateless and concurrency-safe, unlike a
 * bare `soffice` CLI which serialises on a single user profile lock.
 * docker-compose.yml provisions it.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const execFileAsync = promisify(execFile);

/** Thrown when an office file could not be converted to PDF. */
export class OfficeConversionError extends Error {
  code = 'OFFICE_CONVERSION_FAILED';
  constructor(msg: string) {
    super(msg);
  }
}

/** Office formats we route through the converter. */
export const OFFICE_EXT = [
  'doc', 'docx', 'rtf', 'odt', 'txt',
  'ppt', 'pptx', 'odp',
  'xls', 'xlsx', 'ods', 'csv',
];

const OFFICE_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/csv',
]);

function extOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

/** Is this upload an office document we'd route through the converter? */
export function isOfficeDocument(fileName?: string, mime?: string): boolean {
  if (fileName && OFFICE_EXT.includes(extOf(fileName))) return true;
  if (mime && OFFICE_MIMES.has(mime.toLowerCase())) return true;
  return false;
}

type Provider = 'gotenberg' | 'soffice';

/** Resolve the active provider from env, or null when disabled. */
function provider(): Provider | null {
  const raw = String(process.env.DOC_CONVERTER || '').trim().toLowerCase();
  if (raw === 'none') return null;
  if (raw === 'gotenberg') return 'gotenberg';
  if (raw === 'soffice' || raw === 'libreoffice') return 'soffice';
  // Auto: gotenberg if a URL is configured, else off.
  if (!raw && process.env.GOTENBERG_URL) return 'gotenberg';
  return null;
}

/** Is office→PDF conversion configured at all? */
export function conversionEnabled(): boolean {
  return provider() !== null;
}

/** Human label of accepted upload types, widened when conversion is on. */
export function acceptedDocsLabel(): string {
  return conversionEnabled()
    ? 'PDF, JPG, PNG, Word, PowerPoint, Excel'
    : 'PDF, JPG, PNG';
}

function timeoutMs(): number {
  return Math.max(10_000, Number(process.env.DOC_CONVERT_TIMEOUT_MS) || 60_000);
}

// ── Gotenberg (HTTP) ───────────────────────────────────────────────────
async function convertViaGotenberg(buffer: Buffer, fileName: string): Promise<Buffer> {
  const base = String(process.env.GOTENBERG_URL || '').replace(/\/+$/, '');
  if (!base) {
    throw new OfficeConversionError('GOTENBERG_URL is not set.');
  }
  const url = `${base}/forms/libreoffice/convert`;
  const form = new FormData();
  // Gotenberg keys the conversion off the uploaded file's extension.
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_') || 'document';
  form.set('files', new Blob([new Uint8Array(buffer)]), safeName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const res = await fetch(url, { method: 'POST', body: form, signal: controller.signal });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new OfficeConversionError(`Gotenberg returned ${res.status}. ${detail}`);
    }
    const pdf = Buffer.from(await res.arrayBuffer());
    if (pdf.length === 0) throw new OfficeConversionError('Gotenberg returned an empty PDF.');
    return pdf;
  } catch (err: any) {
    if (err instanceof OfficeConversionError) throw err;
    const reason = err?.name === 'AbortError' ? 'timed out' : err?.message || String(err);
    throw new OfficeConversionError(`Gotenberg request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

// ── LibreOffice CLI (soffice) ──────────────────────────────────────────
let cachedSofficeBin: string | null | undefined;

function sofficeCandidates(): string[] {
  const override = process.env.LIBREOFFICE_BIN;
  if (override) return [override];
  if (process.platform === 'win32') {
    return [
      'soffice',
      'C:/Program Files/LibreOffice/program/soffice.exe',
      'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
    ];
  }
  return ['soffice', 'libreoffice'];
}

async function resolveSofficeBin(): Promise<string | null> {
  if (cachedSofficeBin !== undefined) return cachedSofficeBin;
  for (const bin of sofficeCandidates()) {
    try {
      await execFileAsync(bin, ['--version'], { timeout: 8000 });
      cachedSofficeBin = bin;
      return bin;
    } catch {
      /* try next */
    }
  }
  cachedSofficeBin = null;
  return null;
}

async function convertViaSoffice(buffer: Buffer, fileName: string): Promise<Buffer> {
  const bin = await resolveSofficeBin();
  if (!bin) {
    throw new OfficeConversionError(
      'LibreOffice (soffice) not found. Install it or set DOC_CONVERTER=gotenberg.',
    );
  }
  const stamp = crypto.randomBytes(8).toString('hex');
  const workDir = path.join(os.tmpdir(), `pl-doc-${stamp}`);
  const ext = extOf(fileName) || 'bin';
  const inPath = path.join(workDir, `in.${ext}`);
  const outPath = path.join(workDir, 'in.pdf');
  try {
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(inPath, buffer);
    await execFileAsync(
      bin,
      [
        '--headless', '--nologo', '--nofirststartwizard',
        // Per-call profile dir avoids the single-instance lock that makes
        // concurrent soffice calls fail. Still serialise-prone — Gotenberg
        // is preferred under real load.
        `-env:UserInstallation=file://${workDir.replace(/\\/g, '/')}/profile`,
        '--convert-to', 'pdf', '--outdir', workDir, inPath,
      ],
      { timeout: timeoutMs(), maxBuffer: 64 * 1024 * 1024 },
    );
    const pdf = await fs.readFile(outPath).catch(() => null);
    if (!pdf || pdf.length === 0) {
      throw new OfficeConversionError('LibreOffice produced no PDF.');
    }
    return pdf;
  } catch (err: any) {
    if (err instanceof OfficeConversionError) throw err;
    throw new OfficeConversionError(`LibreOffice conversion failed: ${err?.message || err}`);
  } finally {
    fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Convert an office document to PDF using the configured provider.
 * Throws OfficeConversionError when conversion is disabled or fails —
 * callers map that to a 422 with a clear "we couldn't convert" message.
 */
export async function convertOfficeToPdf(buffer: Buffer, fileName: string): Promise<Buffer> {
  const p = provider();
  if (!p) {
    throw new OfficeConversionError('Office conversion is not enabled on this server.');
  }
  return p === 'gotenberg'
    ? convertViaGotenberg(buffer, fileName)
    : convertViaSoffice(buffer, fileName);
}

/**
 * Ops diagnostic: can the configured converter actually be reached?
 * Surfaced via the super-admin spike/diag endpoint so a deploy can
 * confirm the black box is wired before the first office upload.
 */
export async function convertOfficeAvailable(): Promise<boolean> {
  const p = provider();
  if (!p) return false;
  if (p === 'soffice') return (await resolveSofficeBin()) !== null;
  try {
    const base = String(process.env.GOTENBERG_URL || '').replace(/\/+$/, '');
    if (!base) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/health`, { signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
    return res.ok;
  } catch {
    return false;
  }
}
