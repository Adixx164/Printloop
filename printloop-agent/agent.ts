/**
 * ─────────────────────────────────────────────────────────────────────
 *  PrintLoop on-site agent
 *  ─────────────────────────────────────────────────────────────────────
 *  Runs on a machine that sits on the same LAN as the printer (the
 *  kiosk PC, or any always-on box that can reach the printer's IP).
 *
 *  Loop:
 *    1.  GET  /api/agent/jobs/ready    — poll for RELEASING jobs
 *    2.  POST /api/agent/jobs/:id/start — claim the job (atomic)
 *    3.  GET  <signed downloadUrl>      — pull the document bytes
 *    4.  Dispatch bytes to the LAN printer (IPP or raw-9100 + PJL)
 *    5.  POST /api/agent/jobs/:id/complete OR /failed — report back
 *
 *  This lets PrintLoop run the backend in the cloud (Railway, Vercel,
 *  whatever) while keeping the printer on a private LAN that the cloud
 *  cannot reach. The agent only ever opens OUTBOUND HTTPS, so no VPN
 *  / port-forward / tunnel is needed.
 *
 *  Auth: the same long-lived X-Kiosk-Key the in-browser kiosk panel
 *  uses. File downloads use a short-lived signed JWT the backend
 *  embeds in `downloadUrl` — never the kiosk key.
 *
 *  Config: see .env.example. Edit a .env file and run `npm start`.
 * ─────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import ipp from 'ipp';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

// ─ Config ───────────────────────────────────────────────────────────
interface Config {
  baseUrl: string;
  kioskKey: string;
  printerIp: string;
  printerPort: number;
  transport: 'ipp' | 'raw9100' | 'spooler';
  rawPort: number;
  ippPath: string;
  ippVersion: '1.0' | '1.1' | '2.0';
  pollMs: number;
  printerName: string;
  spoolerCommand?: string;
  /** How long to wait for the printer to confirm a job (V2-44). */
  confirmTimeoutMs: number;
  /** CONFIRM_DISABLE=1 skips confirmation polling entirely. */
  confirmDisabled: boolean;
}

/**
 * What the agent could PROVE about a dispatched job (V2-44 job-truth,
 * the savapage-cups-notifier lesson — "accepted by the spooler" is
 * not "printed").
 *
 *   ipp-job-state — polled IPP Get-Job-Attributes until job-state
 *                   reached `completed` (confirmed) or we timed out.
 *   queue-drain   — watched the OS spooler queue empty out cleanly.
 *   none          — raw-9100 has no feedback channel; we sent bytes.
 */
interface Confirmation {
  state: 'confirmed' | 'unconfirmed';
  method: 'ipp-job-state' | 'queue-drain' | 'none';
  detail?: string;
}

function loadConfig(): Config {
  const need = (k: string): string => {
    const v = process.env[k];
    if (!v) {
      console.error(`[agent] FATAL: env var ${k} is required. See .env.example.`);
      process.exit(1);
    }
    return v;
  };
  const rawTransport = String(process.env.PRINTER_TRANSPORT || 'ipp').trim().toLowerCase();
  const transport: 'ipp' | 'raw9100' | 'spooler' =
    rawTransport === 'raw9100' ? 'raw9100' : rawTransport === 'spooler' ? 'spooler' : 'ipp';

  const versionRaw = String(process.env.IPP_VERSION || '2.0').trim();
  const version: '1.0' | '1.1' | '2.0' =
    versionRaw === '1.0' ? '1.0' : versionRaw === '1.1' ? '1.1' : '2.0';

  const printerName = process.env.PRINTER_NAME || process.env.PRINTER_IP || 'default';
  const printerIp = transport === 'spooler' ? printerName : need('PRINTER_IP');

  return {
    baseUrl: need('PRINTLOOP_BASE_URL').replace(/\/+$/, ''),
    kioskKey: need('KIOSK_API_KEY'),
    printerIp,
    printerPort: Number(process.env.PRINTER_PORT) || 631,
    transport,
    rawPort: Number(process.env.PRINTER_RAW_PORT) || 9100,
    ippPath: process.env.IPP_PATH || '/ipp/print',
    ippVersion: version,
    pollMs: Math.max(1000, Number(process.env.POLL_INTERVAL_MS) || 4000),
    printerName,
    spoolerCommand: process.env.SPOOLER_COMMAND,
    confirmTimeoutMs: Math.max(5_000, Number(process.env.CONFIRM_TIMEOUT_MS) || 90_000),
    confirmDisabled: process.env.CONFIRM_DISABLE === '1',
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─ Cloud API client ─────────────────────────────────────────────────
interface ReadyJobItem {
  fileId: string;
  fileName: string;
  downloadUrl: string;
  printConfiguration: {
    copies?: number;
    sided?: 'single' | 'double';
    color?: 'bw' | 'color';
    paper?: string;
    orientation?: 'portrait' | 'landscape';
    qualityDpi?: 100 | 300 | 600;
    collate?: boolean;
  };
}

interface ReadyJob {
  id: string;
  code: string;
  jobType: string;
  totalPages: number;
  updatedAt: string;
  items: ReadyJobItem[];
}

function cloudApi(cfg: Config) {
  return axios.create({
    baseURL: cfg.baseUrl,
    headers: { 'X-Kiosk-Key': cfg.kioskKey },
    timeout: 30_000,
    validateStatus: () => true,
  });
}

// ─ Printer dispatch ─────────────────────────────────────────────────
const MEDIA: Record<string, string> = {
  A4: 'iso_a4_210x297mm',
  A3: 'iso_a3_297x420mm',
  LETTER: 'na_letter_8.5x11in',
  LEGAL: 'na_legal_8.5x14in',
};

function buildIppJobAttributes(opts: ReadyJobItem['printConfiguration']) {
  const copies = Math.max(1, Number(opts.copies) || 1);
  const attrs: Record<string, any> = {
    copies,
    sides: opts.sided === 'double' ? 'two-sided-long-edge' : 'one-sided',
    'print-color-mode': opts.color === 'color' ? 'color' : 'monochrome',
    ...(opts.orientation === 'landscape' ? { 'orientation-requested': 4 } : {}),
  };
  const media = MEDIA[String(opts.paper || 'A4').toUpperCase()];
  if (media) attrs.media = media;
  if (copies > 1) {
    const collate = opts.collate !== false;
    attrs['multiple-document-handling'] = collate
      ? 'separate-documents-collated-copies'
      : 'separate-documents-uncollated-copies';
    attrs['sheet-collate'] = collate ? 'collated' : 'uncollated';
  }
  // Print quality enum: 3 = draft, 4 = normal, 5 = high.
  const q = Number(opts.qualityDpi) || 300;
  attrs['print-quality'] = q <= 100 ? 3 : q >= 600 ? 5 : 4;
  return attrs;
}

function ippPrinter(cfg: Config) {
  return new ipp.Printer(
    `http://${cfg.printerIp}:${cfg.printerPort}${cfg.ippPath}`,
    { version: cfg.ippVersion } as any,
  );
}

/** IPP Print-Job over HTTP. Returns the printer-assigned job-id. */
async function ippDispatch(
  cfg: Config,
  bytes: Buffer,
  jobName: string,
  opts: ReadyJobItem['printConfiguration'],
  contentType: string,
): Promise<number | undefined> {
  const printer = ippPrinter(cfg);
  const msg = {
    'operation-attributes-tag': {
      'requesting-user-name': 'PrintLoop-Agent',
      'job-name': jobName,
      'document-format': contentType,
    },
    'job-attributes-tag': buildIppJobAttributes(opts),
    data: bytes,
  };
  return new Promise<number | undefined>((resolve, reject) => {
    printer.execute('Print-Job' as any, msg, (err: Error, res: any) => {
      if (err) return reject(err);
      const jobId = res?.['job-attributes-tag']?.['job-id'];
      console.log(`[agent] IPP accepted ${jobName} (job-id ${jobId})`);
      resolve(typeof jobId === 'number' ? jobId : undefined);
    });
  });
}

/**
 * V2-44 job-truth: poll IPP Get-Job-Attributes until the printer says
 * the job reached a terminal state.
 *
 *   completed          → confirmed.
 *   canceled / aborted → throws (the item FAILED at the printer —
 *                        paper jam, cancel at the panel, etc.).
 *   timeout / printer doesn't support job queries → unconfirmed.
 *
 * job-state arrives as the RFC 8011 enum — the ipp lib usually decodes
 * to the keyword string, but some firmwares leave it numeric; handle
 * both.
 */
async function confirmIppJob(cfg: Config, jobId: number): Promise<Confirmation> {
  const STATE_NAMES: Record<number, string> = {
    3: 'pending', 4: 'pending-held', 5: 'processing',
    6: 'processing-stopped', 7: 'canceled', 8: 'aborted', 9: 'completed',
  };
  const deadline = Date.now() + cfg.confirmTimeoutMs;
  let lastState = 'unknown';
  while (Date.now() < deadline) {
    let attrs: any = null;
    try {
      attrs = await new Promise<any>((resolve, reject) => {
        ippPrinter(cfg).execute(
          'Get-Job-Attributes' as any,
          {
            'operation-attributes-tag': {
              'requesting-user-name': 'PrintLoop-Agent',
              'job-id': jobId,
            },
          },
          (err: Error, res: any) => (err ? reject(err) : resolve(res)),
        );
      });
    } catch (err) {
      // Printer refuses job queries (some budget firmwares). Honest
      // answer: we couldn't verify — NOT a failure.
      const msg = err instanceof Error ? err.message : String(err);
      return {
        state: 'unconfirmed',
        method: 'ipp-job-state',
        detail: `job query unsupported (${msg.slice(0, 80)})`,
      };
    }
    const tag = attrs?.['job-attributes-tag'] || {};
    const raw = tag['job-state'];
    lastState =
      typeof raw === 'number' ? (STATE_NAMES[raw] || `state-${raw}`) : String(raw || 'unknown');
    if (lastState === 'completed') {
      return { state: 'confirmed', method: 'ipp-job-state' };
    }
    if (lastState === 'canceled' || lastState === 'aborted') {
      const reasons = tag['job-state-reasons'];
      const why = Array.isArray(reasons) ? reasons.join(',') : String(reasons || '');
      throw new Error(`printer reported job ${lastState}${why ? ` (${why})` : ''}`);
    }
    await sleep(2_500);
  }
  return {
    state: 'unconfirmed',
    method: 'ipp-job-state',
    detail: `still ${lastState} after ${Math.round(cfg.confirmTimeoutMs / 1000)}s`,
  };
}

/**
 * V2-44 job-truth for the OS-spooler transport: watch the printer's
 * queue until it drains. Deliberately NEVER fails the job — on a busy
 * shop queue another customer's stuck job would otherwise fail ours.
 * Outcomes: confirmed (queue emptied cleanly) or unconfirmed (timeout,
 * error-state jobs present, or the queue can't be queried).
 */
async function confirmSpoolerDrain(cfg: Config): Promise<Confirmation> {
  const deadline = Date.now() + cfg.confirmTimeoutMs;
  const printer = cfg.printerName.replace(/['"]/g, '');
  const queryOnce = (): Promise<{ count: number; errored: boolean } | null> =>
    new Promise((resolve) => {
      const cmd =
        process.platform === 'win32'
          ? `powershell -NoProfile -NonInteractive -Command "$j = @(Get-PrintJob -PrinterName '${printer}' -ErrorAction Stop); ($j.Count.ToString() + '|' + (($j | ForEach-Object { $_.JobStatus }) -join ','))"`
          : `lpstat -o '${printer}'`;
      exec(cmd, { timeout: 15_000 }, (error, stdout) => {
        if (process.platform === 'win32') {
          if (error) return resolve(null);
          const [countRaw, statuses = ''] = String(stdout).trim().split('|');
          const count = Number(countRaw);
          if (!Number.isFinite(count)) return resolve(null);
          resolve({ count, errored: /error|offline|paperout|jam/i.test(statuses) });
        } else {
          // lpstat -o exits 0 with one line per queued job; empty = drained.
          if (error) return resolve(null);
          const lines = String(stdout).split('\n').filter((l) => l.trim().length > 0);
          resolve({ count: lines.length, errored: false });
        }
      });
    });

  let sawErrorState = false;
  while (Date.now() < deadline) {
    const q = await queryOnce();
    if (q === null) {
      return {
        state: 'unconfirmed',
        method: 'queue-drain',
        detail: 'queue not queryable',
      };
    }
    if (q.count === 0 && !sawErrorState) {
      return { state: 'confirmed', method: 'queue-drain' };
    }
    if (q.errored) sawErrorState = true;
    await sleep(2_500);
  }
  return {
    state: 'unconfirmed',
    method: 'queue-drain',
    detail: sawErrorState ? 'queue had error-state jobs' : 'queue did not drain in time',
  };
}

/**
 * Raw-9100 (JetDirect) with a PJL prologue. Used when the printer's
 * IPP filter silently drops anonymous jobs (Sharp MX-series, etc.).
 * Same prologue the backend's cloud-push path uses.
 */
async function rawDispatch(
  cfg: Config,
  bytes: Buffer,
  jobName: string,
  opts: ReadyJobItem['printConfiguration'],
  contentType: string,
): Promise<void> {
  const UEL = '\x1B%-12345X';
  const safe = (s: string) =>
    String(s || '').replace(/[^A-Za-z0-9 _.\-]/g, '_').slice(0, 80) || 'PrintLoop';
  const copies = Math.max(1, Math.min(99, Number(opts.copies) || 1));
  const sided = opts.sided === 'double';
  const colour = opts.color === 'color';
  const landscape = opts.orientation === 'landscape';
  const paper = String(opts.paper || 'A4').toUpperCase();
  const qualityDpi = Number(opts.qualityDpi) || 300;
  const resolution = qualityDpi >= 600 ? 600 : 300;
  const economy = qualityDpi <= 100;

  const enterLanguage = contentType === 'image/pwg-raster' ? 'PWGRASTER' : 'PDF';
  const pjl: string[] = [
    UEL + '@PJL',
    `@PJL JOB NAME="${safe(jobName)}"`,
    `@PJL SET COPIES=${copies}`,
    `@PJL SET DUPLEX=${sided ? 'ON' : 'OFF'}`,
    ...(sided ? [`@PJL SET BINDING=LONGEDGE`] : []),
    `@PJL SET RENDERMODE=${colour ? 'COLOR' : 'GRAYSCALE'}`,
    `@PJL SET PAPER=${paper}`,
    `@PJL SET ORIENTATION=${landscape ? 'LANDSCAPE' : 'PORTRAIT'}`,
    `@PJL SET RESOLUTION=${resolution}`,
    `@PJL SET ECONOMODE=${economy ? 'ON' : 'OFF'}`,
    `@PJL ENTER LANGUAGE=${enterLanguage}`,
    '',
  ];
  const prologue = Buffer.from(pjl.join('\r\n'));
  const epilogue = Buffer.from('\r\n' + UEL);

  await new Promise<void>((resolve, reject) => {
    const sock = net.createConnection(cfg.rawPort, cfg.printerIp);
    sock.setTimeout(120_000);
    sock.once('connect', () => {
      sock.write(prologue);
      sock.write(bytes);
      sock.write(epilogue, () => sock.end());
    });
    sock.once('end', () => {
      console.log(
        `[agent] RAW sent ${jobName} → ${cfg.printerIp}:${cfg.rawPort} ` +
          `(copies=${copies} sided=${opts.sided || 'single'} colour=${opts.color || 'bw'} ` +
          `paper=${paper} orient=${opts.orientation || 'portrait'})`,
      );
      resolve();
    });
    sock.once('timeout', () => {
      sock.destroy();
      reject(new Error('Raw print timeout'));
    });
    sock.once('error', reject);
  });
}

/** OS local spooler dispatch. Writes file to disk, runs CLI command, and deletes file. */
async function spoolerDispatch(
  cfg: Config,
  bytes: Buffer,
  jobName: string,
  opts: ReadyJobItem['printConfiguration'],
  contentType: string,
): Promise<void> {
  const tempDir = os.tmpdir();
  const ext = contentType.includes('pwg-raster') ? '.pwg' : '.pdf';
  const tempFilePath = path.join(
    tempDir,
    `printloop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`
  );

  await fs.promises.writeFile(tempFilePath, bytes);
  console.log(`[agent] Spooler: wrote ${bytes.length} bytes to temp file ${tempFilePath}`);

  let cmdTemplate = cfg.spoolerCommand;
  if (!cmdTemplate) {
    if (process.platform === 'win32') {
      cmdTemplate = `powershell -Command "Start-Process -FilePath '{file}' -Verb PrintTo '{printer}'"`;
    } else {
      cmdTemplate = `lp -d '{printer}' '{file}'`;
    }
  }

  const printerVal = cfg.printerName.replace(/['"]/g, '');
  const fileVal = tempFilePath.replace(/\\/g, '/'); // forward slashes are safer across shells
  const jobVal = jobName.replace(/[^A-Za-z0-9 _.\-]/g, '_').slice(0, 80);

  const command = cmdTemplate
    .replace(/{file}/g, fileVal)
    .replace(/{printer}/g, printerVal)
    .replace(/{jobName}/g, jobVal);

  console.log(`[agent] Spooler executing: ${command}`);

  try {
    await new Promise<void>((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`[agent] Spooler exec error:`, error);
          console.error(`[agent] Spooler stderr:`, stderr);
          console.log(`[agent] Spooler stdout:`, stdout);
          return reject(
            new Error(`Spooler command failed with code ${error.code}: ${stderr || error.message}`)
          );
        }
        if (stdout.trim()) {
          console.log(`[agent] Spooler execution stdout:`, stdout.trim());
        }
        resolve();
      });
    });
  } finally {
    try {
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
        console.log(`[agent] Spooler: cleaned up temp file ${tempFilePath}`);
      }
    } catch (cleanupErr) {
      console.warn(`[agent] Spooler cleanup failed for ${tempFilePath}:`, cleanupErr);
    }
  }
}

async function dispatchToPrinter(
  cfg: Config,
  bytes: Buffer,
  jobName: string,
  opts: ReadyJobItem['printConfiguration'],
  contentType: string,
): Promise<Confirmation> {
  if (cfg.transport === 'raw9100') {
    await rawDispatch(cfg, bytes, jobName, opts, contentType);
    // JetDirect is fire-and-forget — no job feedback exists. Be honest.
    return { state: 'unconfirmed', method: 'none', detail: 'raw9100 has no feedback channel' };
  }
  if (cfg.transport === 'spooler') {
    await spoolerDispatch(cfg, bytes, jobName, opts, contentType);
    if (cfg.confirmDisabled) {
      return { state: 'unconfirmed', method: 'queue-drain', detail: 'confirmation disabled' };
    }
    return confirmSpoolerDrain(cfg);
  }
  const jobId = await ippDispatch(cfg, bytes, jobName, opts, contentType);
  if (cfg.confirmDisabled) {
    return { state: 'unconfirmed', method: 'ipp-job-state', detail: 'confirmation disabled' };
  }
  if (jobId === undefined) {
    return { state: 'unconfirmed', method: 'ipp-job-state', detail: 'printer returned no job-id' };
  }
  // Throws if the printer reports canceled/aborted — the caller counts
  // the item as failed (this is the whole point of job-truth).
  return confirmIppJob(cfg, jobId);
}

// ─ Printer capability discovery (V2-44, P2) ─────────────────────────
/**
 * Query IPP Get-Printer-Attributes and report hardware capabilities to
 * the cloud, so the shop's marketplace card (colour / A3 badges) tells
 * the truth without the owner typing anything. IPP transport only —
 * the OS spooler hides the wire protocol and raw-9100 can't be asked.
 */
async function queryPrinterCapabilities(cfg: Config): Promise<{
  color: boolean | null;
  duplex: boolean | null;
  a3: boolean | null;
  media: string[];
} | null> {
  if (cfg.transport !== 'ipp') return null;
  try {
    const res = await new Promise<any>((resolve, reject) => {
      ippPrinter(cfg).execute(
        'Get-Printer-Attributes' as any,
        {
          'operation-attributes-tag': {
            'requesting-user-name': 'PrintLoop-Agent',
            'requested-attributes': [
              'color-supported',
              'print-color-mode-supported',
              'sides-supported',
              'media-supported',
            ],
          },
        },
        (err: Error, r: any) => (err ? reject(err) : resolve(r)),
      );
    });
    const tag = res?.['printer-attributes-tag'] || {};
    const asArray = (v: unknown): string[] =>
      v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : [String(v)];

    const colorModes = asArray(tag['print-color-mode-supported']);
    const colorSupported = tag['color-supported'];
    const color =
      typeof colorSupported === 'boolean'
        ? colorSupported
        : colorModes.length
          ? colorModes.includes('color')
          : null;

    const sides = asArray(tag['sides-supported']);
    const duplex = sides.length ? sides.some((s) => s.startsWith('two-sided')) : null;

    const media = asArray(tag['media-supported']);
    const a3 = media.length ? media.some((m) => /iso[_-]?a3/i.test(m)) : null;

    return { color, duplex, a3, media: media.slice(0, 50) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[agent] capability query failed (non-fatal): ${msg}`);
    return null;
  }
}

async function reportCapabilities(cfg: Config, api: ReturnType<typeof cloudApi>): Promise<void> {
  const caps = await queryPrinterCapabilities(cfg);
  if (!caps) return;
  const resp = await api.post('/api/agent/printer/capabilities', caps);
  if (resp.status === 200) {
    console.log(
      `[agent] reported printer capabilities: colour=${caps.color} duplex=${caps.duplex} a3=${caps.a3}`,
    );
  } else {
    console.warn(`[agent] capability report rejected: ${resp.status} ${resp.data?.message || ''}`);
  }
}

// ─ Job processing ───────────────────────────────────────────────────
async function processJob(cfg: Config, api: ReturnType<typeof cloudApi>, job: ReadyJob): Promise<void> {
  // 1. Atomic claim. If another agent already won, the API returns 409
  //    and we silently move on.
  const claim = await api.post(`/api/agent/jobs/${job.id}/start`, {});
  if (claim.status !== 200) {
    if (claim.status !== 409) {
      console.warn(`[agent] could not claim ${job.code}: ${claim.status} ${claim.data?.message || ''}`);
    }
    return;
  }
  console.log(`[agent] claimed ${job.code} (${job.items.length} item${job.items.length === 1 ? '' : 's'})`);

  // 2. For each item: download, dispatch, confirm (V2-44 job-truth).
  let printed = 0;
  let lastError = '';
  const confirmations: Confirmation[] = [];
  for (const item of job.items) {
    try {
      const fileResp = await axios.get(item.downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 60_000,
      });
      const bytes = Buffer.from(fileResp.data);
      const contentType = String(fileResp.headers['content-type'] || 'application/pdf');
      const jobName =
        job.items.length === 1 ? `${job.code}` : `${job.code} · ${item.fileName}`;
      const conf = await dispatchToPrinter(
        cfg, bytes, jobName, item.printConfiguration || {}, contentType,
      );
      confirmations.push(conf);
      printed++;
      console.log(
        `[agent] ${jobName}: ${conf.state} via ${conf.method}${conf.detail ? ` — ${conf.detail}` : ''}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = `${item.fileName}: ${msg}`;
      console.error(`[agent] item failed — ${lastError}`);
    }
  }

  // 3. Report back. We only mark FAILED if EVERY item failed; partial
  //    success still counts as DONE so the customer isn't charged twice
  //    while half their batch is at the printer. The confirmation
  //    summary rides along so the backend can record what was PROVEN
  //    (printer said done) vs merely dispatched.
  const allFailed = printed === 0;
  const endpoint = allFailed ? 'failed' : 'complete';
  const allConfirmed =
    confirmations.length > 0 && confirmations.every((c) => c.state === 'confirmed');
  const method = confirmations.find((c) => c.method !== 'none')?.method || 'none';
  const detail = confirmations
    .map((c) => c.detail)
    .filter(Boolean)
    .join('; ')
    .slice(0, 200) || undefined;
  const body = allFailed
    ? { reason: lastError || 'agent dispatch failed' }
    : {
        confirmation: allConfirmed ? 'confirmed' : 'unconfirmed',
        method,
        ...(detail ? { detail } : {}),
      };
  const report = await api.post(`/api/agent/jobs/${job.id}/${endpoint}`, body);
  if (report.status !== 200) {
    console.error(
      `[agent] failed to report ${endpoint} for ${job.code}: ${report.status} ${report.data?.message || ''}`,
    );
  } else {
    console.log(`[agent] reported ${endpoint} for ${job.code} (${printed}/${job.items.length})`);
  }
}

// ─ Poll loop ────────────────────────────────────────────────────────
async function pollOnce(cfg: Config, api: ReturnType<typeof cloudApi>): Promise<void> {
  const resp = await api.get('/api/agent/jobs/ready');
  if (resp.status === 401) {
    console.error('[agent] cloud rejected our kiosk key (401). Check KIOSK_API_KEY in .env.');
    return;
  }
  if (resp.status !== 200) {
    console.warn(`[agent] /jobs/ready returned ${resp.status} ${resp.data?.message || ''}`);
    return;
  }
  const jobs: ReadyJob[] = resp.data?.data?.jobs || [];
  if (!jobs.length) return;
  for (const job of jobs) {
    try {
      await processJob(cfg, api, job);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[agent] processJob crashed for ${job.code}: ${msg}`);
    }
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const api = cloudApi(cfg);
  console.log('[agent] PrintLoop on-site agent starting');
  console.log(`         base : ${cfg.baseUrl}`);
  console.log(`         poll : every ${cfg.pollMs}ms`);
  console.log(`     printer  : ${cfg.printerIp}  (${cfg.transport === 'raw9100' ? `raw9100 :${cfg.rawPort}` : `ipp :${cfg.printerPort}${cfg.ippPath} v${cfg.ippVersion}`})`);

  // Quick connectivity probe — fails fast on bad kiosk key / wrong URL.
  try {
    const probe = await api.get('/api/agent/jobs/ready');
    if (probe.status === 401) {
      console.error('[agent] startup probe: 401 — KIOSK_API_KEY is wrong or kiosk is disabled.');
      process.exit(2);
    }
    if (probe.status >= 500) {
      console.warn(`[agent] startup probe: ${probe.status} — backend may be warming up.`);
    } else {
      console.log(`[agent] startup probe OK (${probe.status}). Entering poll loop.`);
    }
  } catch (err) {
    const e = err as AxiosError;
    console.warn(`[agent] startup probe failed (${e.code || e.message}). Will retry in the poll loop.`);
  }

  // V2-44 (P2): tell the cloud what this printer can actually do —
  // colour / duplex / A3 — straight from IPP Get-Printer-Attributes.
  // Once at startup, refreshed every 6h (toner modules and trays
  // change rarely). Non-fatal on every path.
  reportCapabilities(cfg, api).catch(() => undefined);
  setInterval(() => reportCapabilities(cfg, api).catch(() => undefined), 6 * 60 * 60 * 1000);

  // Polling timer with overlap prevention. If a poll takes longer than
  // pollMs (e.g. a large batch printing), we wait for it before starting
  // the next one — no piling up.
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await pollOnce(cfg, api);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[agent] poll error: ${msg}`);
    } finally {
      running = false;
    }
  }, cfg.pollMs);
}

main().catch((err) => {
  console.error('[agent] fatal:', err);
  process.exit(1);
});
