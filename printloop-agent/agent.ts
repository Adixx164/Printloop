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

// ─ Config ───────────────────────────────────────────────────────────
interface Config {
  baseUrl: string;
  kioskKey: string;
  printerIp: string;
  printerPort: number;
  transport: 'ipp' | 'raw9100';
  rawPort: number;
  ippPath: string;
  ippVersion: '1.0' | '1.1' | '2.0';
  pollMs: number;
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
  const transport = process.env.PRINTER_TRANSPORT === 'raw9100' ? 'raw9100' : 'ipp';
  const versionRaw = String(process.env.IPP_VERSION || '2.0').trim();
  const version: '1.0' | '1.1' | '2.0' =
    versionRaw === '1.0' ? '1.0' : versionRaw === '1.1' ? '1.1' : '2.0';
  return {
    baseUrl: need('PRINTLOOP_BASE_URL').replace(/\/+$/, ''),
    kioskKey: need('KIOSK_API_KEY'),
    printerIp: need('PRINTER_IP'),
    printerPort: Number(process.env.PRINTER_PORT) || 631,
    transport,
    rawPort: Number(process.env.PRINTER_RAW_PORT) || 9100,
    ippPath: process.env.IPP_PATH || '/ipp/print',
    ippVersion: version,
    pollMs: Math.max(1000, Number(process.env.POLL_INTERVAL_MS) || 4000),
  };
}

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
  return attrs;
}

/** IPP Print-Job over HTTP. */
async function ippDispatch(
  cfg: Config,
  bytes: Buffer,
  jobName: string,
  opts: ReadyJobItem['printConfiguration'],
): Promise<void> {
  const printer = new ipp.Printer(
    `http://${cfg.printerIp}:${cfg.printerPort}${cfg.ippPath}`,
    { version: cfg.ippVersion } as any,
  );
  const msg = {
    'operation-attributes-tag': {
      'requesting-user-name': 'PrintLoop-Agent',
      'job-name': jobName,
      'document-format': 'application/pdf',
    },
    'job-attributes-tag': buildIppJobAttributes(opts),
    data: bytes,
  };
  await new Promise<void>((resolve, reject) => {
    printer.execute('Print-Job' as any, msg, (err: Error, res: any) => {
      if (err) return reject(err);
      const jobId = res?.['job-attributes-tag']?.['job-id'];
      console.log(`[agent] IPP accepted ${jobName} (job-id ${jobId})`);
      resolve();
    });
  });
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
): Promise<void> {
  const UEL = '\x1B%-12345X';
  const safe = (s: string) =>
    String(s || '').replace(/[^A-Za-z0-9 _.\-]/g, '_').slice(0, 80) || 'PrintLoop';
  const copies = Math.max(1, Math.min(99, Number(opts.copies) || 1));
  const sided = opts.sided === 'double';
  const colour = opts.color === 'color';
  const landscape = opts.orientation === 'landscape';
  const paper = String(opts.paper || 'A4').toUpperCase();

  const pjl: string[] = [
    UEL + '@PJL',
    `@PJL JOB NAME="${safe(jobName)}"`,
    `@PJL SET COPIES=${copies}`,
    `@PJL SET DUPLEX=${sided ? 'ON' : 'OFF'}`,
    ...(sided ? [`@PJL SET BINDING=LONGEDGE`] : []),
    `@PJL SET RENDERMODE=${colour ? 'COLOR' : 'GRAYSCALE'}`,
    `@PJL SET PAPER=${paper}`,
    `@PJL SET ORIENTATION=${landscape ? 'LANDSCAPE' : 'PORTRAIT'}`,
    `@PJL ENTER LANGUAGE=PDF`,
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

async function dispatchToPrinter(
  cfg: Config,
  bytes: Buffer,
  jobName: string,
  opts: ReadyJobItem['printConfiguration'],
): Promise<void> {
  if (cfg.transport === 'raw9100') {
    await rawDispatch(cfg, bytes, jobName, opts);
  } else {
    await ippDispatch(cfg, bytes, jobName, opts);
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

  // 2. For each item: download, dispatch.
  let printed = 0;
  let lastError = '';
  for (const item of job.items) {
    try {
      const fileResp = await axios.get(item.downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 60_000,
      });
      const bytes = Buffer.from(fileResp.data);
      const jobName =
        job.items.length === 1 ? `${job.code}` : `${job.code} · ${item.fileName}`;
      await dispatchToPrinter(cfg, bytes, jobName, item.printConfiguration || {});
      printed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = `${item.fileName}: ${msg}`;
      console.error(`[agent] item failed — ${lastError}`);
    }
  }

  // 3. Report back. We only mark FAILED if EVERY item failed; partial
  //    success still counts as DONE so the customer isn't charged twice
  //    while half their batch is at the printer.
  const allFailed = printed === 0;
  const endpoint = allFailed ? 'failed' : 'complete';
  const body = allFailed ? { reason: lastError || 'agent dispatch failed' } : {};
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
