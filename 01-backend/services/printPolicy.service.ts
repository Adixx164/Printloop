import { AppDataSource } from '../config/database';
import { SystemSetting } from '../entities/systemSetting.entity';

/**
 * Server-side print-script policy engine (PaperCut "print scripts" style).
 * Every release is evaluated before it reaches the printer: a policy can
 * BLOCK the job or silently MUTATE it (force mono, force duplex, clamp
 * copies). All rules are admin-configurable via System Settings.
 */

export interface PolicyJob {
  totalPages: number;
  copies: number;
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  paper: string;
  fileName?: string;
  jobType?: string;
}

export interface PolicyResult {
  allow: boolean;
  deniedReason?: string;
  mutated: PolicyJob;
  notes: string[];
}

let cache: { at: number; map: Record<string, string> } = { at: 0, map: {} };
const TTL_MS = 20_000;

async function settingsMap(): Promise<Record<string, string>> {
  if (Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const rows = await AppDataSource.getRepository(SystemSetting).find();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    cache = { at: Date.now(), map };
  } catch {
    /* keep stale cache on error */
  }
  return cache.map;
}

const num = (v: string | undefined, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const bool = (v: string | undefined) => v === 'true' || v === '1';

export async function evaluatePrintPolicy(job: PolicyJob): Promise<PolicyResult> {
  const s = await settingsMap();
  const notes: string[] = [];
  const mutated: PolicyJob = { ...job };

  if (!bool(s.policyEnabled)) {
    return { allow: true, mutated, notes: ['policy disabled'] };
  }

  const sheets = Math.max(1, mutated.totalPages) * Math.max(1, mutated.copies);

  // ── Hard blocks ────────────────────────────────────────────────────────
  const maxPages = num(s.policyMaxPagesPerJob, 0);
  if (maxPages > 0 && mutated.totalPages > maxPages) {
    return {
      allow: false,
      deniedReason: `Job exceeds the ${maxPages}-page limit (${mutated.totalPages}).`,
      mutated,
      notes,
    };
  }

  const blocked = (s.policyBlockedFileTypes || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (blocked.length && mutated.fileName) {
    const ext = mutated.fileName.split('.').pop()?.toLowerCase() || '';
    if (blocked.includes(ext)) {
      return { allow: false, deniedReason: `.${ext} files are not allowed at kiosks.`, mutated, notes };
    }
  }

  if (bool(s.policyDenyColor) && mutated.color === 'color') {
    return { allow: false, deniedReason: 'Colour printing is currently disabled by policy.', mutated, notes };
  }

  // ── Silent mutations ───────────────────────────────────────────────────
  const maxCopies = num(s.policyMaxCopiesPerJob, 0);
  if (maxCopies > 0 && mutated.copies > maxCopies) {
    notes.push(`copies clamped ${mutated.copies}→${maxCopies}`);
    mutated.copies = maxCopies;
  }

  const monoOver = num(s.policyForceMonochromeOverPages, 0);
  if (monoOver > 0 && mutated.color === 'color' && sheets >= monoOver) {
    notes.push(`forced monochrome (≥${monoOver} sheets)`);
    mutated.color = 'bw';
  }

  const duplexOver = num(s.policyForceDuplexOverPages, 0);
  if (duplexOver > 0 && mutated.sided === 'single' && mutated.totalPages >= duplexOver) {
    notes.push(`forced duplex (≥${duplexOver} pages)`);
    mutated.sided = 'double';
  }

  return { allow: true, mutated, notes };
}

/** IPPS / TLS connection prefs (admin + env configurable). */
export async function ippConnectionPrefs(): Promise<{
  secure: boolean;
  port?: number;
  rejectUnauthorized: boolean;
  path: string;
  version: '1.0' | '1.1' | '2.0';
  /**
   * Transport for the print job:
   *   'ipp'      — standard IPP Print-Job over HTTP (default)
   *   'raw9100'  — TCP raw socket on port 9100 with PJL options,
   *                used when the printer's IPP filter silently drops
   *                anonymous jobs (Sharp MX-series being the classic
   *                example).
   */
  transport: 'ipp' | 'raw9100';
  /** Port the raw-socket transport uses (default 9100). */
  rawPort: number;
}> {
  const s = await settingsMap();
  const secure = bool(s.ippSecure) || process.env.IPP_SECURE === 'true';
  const port =
    num(s.ippPort, 0) || (process.env.IPP_PORT ? Number(process.env.IPP_PORT) : 0) || undefined;
  // Appliance printers usually carry self-signed certs → default to not
  // rejecting unless the admin explicitly turns verification on.
  const rejectUnauthorized =
    bool(s.ippTlsRejectUnauthorized) || process.env.IPP_TLS_REJECT_UNAUTHORIZED === 'true';
  const rawPath = (s.ippPath && String(s.ippPath).trim()) || process.env.IPP_PATH || '/ipp/print';
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  // Default IPP 2.0 (IPP-Everywhere). Sharp MX-series and other older /
  // vendor-quirky firmwares reject 2.0 with `server-error-version-not-
  // supported`; setting `ippVersion=1.1` in admin → Settings fixes that.
  const versionRaw = String(s.ippVersion || process.env.IPP_VERSION || '2.0').trim();
  const version: '1.0' | '1.1' | '2.0' =
    versionRaw === '1.0' ? '1.0' : versionRaw === '1.1' ? '1.1' : '2.0';
  const transportRaw = String(s.ippTransport || process.env.IPP_TRANSPORT || 'ipp').trim();
  const transport: 'ipp' | 'raw9100' = transportRaw === 'raw9100' ? 'raw9100' : 'ipp';
  const rawPort = num(s.ippRawPort, 0) || Number(process.env.IPP_RAW_PORT) || 9100;
  return { secure, port, rejectUnauthorized, path, version, transport, rawPort };
}
