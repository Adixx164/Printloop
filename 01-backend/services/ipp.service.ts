import ipp from 'ipp';
import axios from 'axios';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export interface PrintOptions {
  copies?: number;
  /** 'single' | 'double' (long-edge duplex) */
  sided?: 'single' | 'double';
  color?: 'bw' | 'color';
  paper?: string; // A4 | A3 | Letter | Legal
  /** Portrait (default) or landscape. Maps to IPP orientation-requested
   *  (3 = portrait, 4 = landscape). */
  orientation?: 'portrait' | 'landscape';
  collate?: boolean;
  /** 1-based pages to print, e.g. [2,3,10,11,12] */
  pages?: number[] | null;
  requestingUser?: string;
  /** IPPS (IPP over TLS) */
  secure?: boolean;
  port?: number;
  /** verify the printer's TLS cert (false for self-signed appliances) */
  tlsRejectUnauthorized?: boolean;
  /** IPP request path. IPP Everywhere/AirPrint = /ipp/print;
   *  CUPS queues = /printers/<queue-name>; Sharp MX-series = /ipp/lp. */
  path?: string;
  /** IPP protocol version sent in requests. Default '2.0' (IPP-Everywhere).
   *  Older / vendor-quirky firmwares need '1.1' — Sharp MX-series for one
   *  rejects 2.0 with `server-error-version-not-supported`. */
  version?: '1.0' | '1.1' | '2.0';
}

let cachedCa: Buffer | null | undefined;
function loadCa(): Buffer | undefined {
  if (cachedCa !== undefined) return cachedCa ?? undefined;
  const p = process.env.IPP_CA_CERT;
  try {
    cachedCa = p && fs.existsSync(p) ? fs.readFileSync(p) : null;
  } catch {
    cachedCa = null;
  }
  return cachedCa ?? undefined;
}

/** Build an ipp.Printer for either IPP (http) or IPPS (https + TLS opts). */
function buildPrinter(printerIp: string, opts: PrintOptions): any {
  const path = opts.path || '/ipp/print';
  const version = opts.version || '2.0';
  if (opts.secure) {
    const port = opts.port || 631;
    return new ipp.Printer(
      {
        protocol: 'https:',
        hostname: printerIp,
        host: `${printerIp}:${port}`,
        port,
        path,
        rejectUnauthorized: opts.tlsRejectUnauthorized === true,
        ca: loadCa(),
      } as any,
      { uri: `ipps://${printerIp}:${port}${path}`, version } as any,
    );
  }
  const port = opts.port || 631;
  return new ipp.Printer(`http://${printerIp}:${port}${path}`, { version } as any);
}

export type PrintSource =
  | { url: string }
  | { base64: string }
  | { buffer: Buffer };

const MEDIA: Record<string, string> = {
  A4: 'iso_a4_210x297mm',
  A3: 'iso_a3_297x420mm',
  LETTER: 'na_letter_8.5x11in',
  LEGAL: 'na_legal_8.5x14in',
};

/** Collapse a sorted page list into IPP rangeOfInteger pairs. */
function toPageRanges(pages?: number[] | null): Array<[number, number]> | undefined {
  if (!pages || !pages.length) return undefined;
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push([start, prev]);
      start = prev = sorted[i];
    }
  }
  ranges.push([start, prev]);
  return ranges;
}

export class IppService {
  /** Resolve a print source to raw bytes. Returns null for schemes we can't
   *  fetch (local://, dev://) so callers can degrade gracefully in dev. */
  private async resolveBytes(src: PrintSource): Promise<Buffer | null> {
    if ('buffer' in src) return src.buffer;
    if ('base64' in src) {
      const b64 = src.base64.replace(/^data:.*?;base64,/, '');
      return Buffer.from(b64, 'base64');
    }
    const url = src.url || '';
    // Local delivery: file:// URL or an absolute on-disk path (kiosk-attached
    // printers, or our own /api/files store mounted on the same box).
    if (url.startsWith('file://')) {
      try {
        return fs.readFileSync(fileURLToPath(url));
      } catch {
        return null;
      }
    }
    if (/^([a-zA-Z]:[\\/]|\/)/.test(url) && fs.existsSync(url)) {
      try {
        return fs.readFileSync(url);
      } catch {
        return null;
      }
    }
    if (!/^https?:\/\//i.test(url)) {
      console.warn(`[IPP] Non-fetchable file URL "${url}" — skipping byte fetch (dev mode).`);
      return null;
    }
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
  }

  private buildJobAttributes(opts: PrintOptions) {
    const copies = Math.max(1, Number(opts.copies) || 1);
    const attrs: Record<string, any> = {
      copies,
      sides: opts.sided === 'double' ? 'two-sided-long-edge' : 'one-sided',
      'print-color-mode': opts.color === 'color' ? 'color' : 'monochrome',
      // IPP orientation-requested enum: 3 = portrait, 4 = landscape.
      // Portrait is the default; we only emit the attribute when the
      // user explicitly chose landscape so older / simpler printers
      // don't reject the job over an unrecognised value.
      ...(opts.orientation === 'landscape'
        ? { 'orientation-requested': 4 }
        : {}),
    };
    const media = MEDIA[String(opts.paper || 'A4').toUpperCase()];
    if (media) attrs.media = media;

    if (copies > 1) {
      attrs['multiple-document-handling'] = opts.collate
        ? 'separate-documents-collated-copies'
        : 'separate-documents-uncollated-copies';
      attrs['sheet-collate'] = opts.collate ? 'collated' : 'uncollated';
    }

    const ranges = toPageRanges(opts.pages);
    if (ranges) {
      attrs['page-ranges'] = ranges.map(([lower, upper]) => ({ lower, upper }));
    }
    return attrs;
  }

  /**
   * Dispatch a document to an IPP printer with full job options.
   * Resolves with the IPP response (or a mock id in dev when the file
   * URL isn't fetchable) so the release flow never hard-fails.
   */
  async printJob(
    printerIp: string,
    source: PrintSource,
    jobName: string,
    opts: PrintOptions = {}
  ): Promise<any> {
    const scheme = opts.secure ? 'ipps' : 'ipp';
    const port = opts.port || 631;
    const printerUrl = `${scheme}://${printerIp}:${port}${opts.path || '/ipp/print'}`;
    const bytes = await this.resolveBytes(source);

    if (!bytes) {
      // Dev/mock: we can't actually fetch the file, but we still log the
      // exact attributes (and transport) that WOULD be sent.
      const attrs = this.buildJobAttributes(opts);
      console.log(`[IPP] (dev) Would print "${jobName}" → ${printerUrl}`, attrs);
      return { mock: true, 'job-attributes-tag': { 'job-id': `mock-${Date.now()}` }, attrs };
    }

    const printer = buildPrinter(printerIp, opts);
    const msg = {
      'operation-attributes-tag': {
        'requesting-user-name': opts.requestingUser || 'PrintLoop',
        'job-name': jobName,
        'document-format': 'application/pdf',
      },
      'job-attributes-tag': this.buildJobAttributes(opts),
      data: bytes,
    };

    return new Promise((resolve, reject) => {
      printer.execute('Print-Job' as any, msg, (err: Error, res: any) => {
        if (err) {
          console.error('[IPP] Print error:', err.message);
          return reject(err);
        }
        const jobId = res?.['job-attributes-tag']?.['job-id'];
        console.log(`[IPP] Job accepted by ${printerUrl} — job-id ${jobId}`);
        resolve(res);
      });
    });
  }

  /**
   * Dispatch to a raw-socket (port 9100 / "JetDirect") printer.
   *
   * Used when the printer's IPP layer silently drops jobs — Sharp MX-
   * series is the canonical example: `/ipp/lp` returns
   * `successful-ok` to anonymous Print-Job operations but the auth
   * filter then discards the payload. Raw socket bypasses the IPP
   * stack entirely, so anonymous jobs print.
   *
   * Options (copies / duplex / colour / paper / orientation) are sent
   * as a PJL prologue ahead of the PDF bytes. Every print engine made
   * in the last 20 years parses PJL; unrecognised commands are silently
   * ignored, so this is safe across vendors.
   */
  async rawPrint(
    printerIp: string,
    source: PrintSource,
    jobName: string,
    opts: PrintOptions = {},
    port = 9100,
  ): Promise<any> {
    const bytes = await this.resolveBytes(source);
    if (!bytes) {
      console.log(`[RAW] (dev) Would raw-print "${jobName}" → ${printerIp}:${port}`);
      return { mock: true };
    }

    // ── PJL prologue ─────────────────────────────────────────────────
    // UEL (Universal Exit Language) brackets the job:
    //   ESC%-12345X  starts a PJL session
    //   @PJL …       commands
    //   @PJL ENTER LANGUAGE=PDF
    //   <PDF bytes>
    //   ESC%-12345X  end of job
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
      // Sharp + most vendors auto-detect the document language, but
      // ENTER LANGUAGE=PDF makes intent explicit.
      `@PJL ENTER LANGUAGE=PDF`,
      '', // blank line then PDF body
    ];
    const prologue = Buffer.from(pjl.join('\r\n'));
    const epilogue = Buffer.from('\r\n' + UEL);

    const total = prologue.length + bytes.length + epilogue.length;
    // ── SOCKS5 routing (for Tailscale userspace mode on Railway) ──────
    // tailscaled in userspace mode doesn't intercept raw net.Socket
    // calls — the kernel routes 192.168.x.x directly to the public
    // internet and the printer is unreachable. When TS_SOCKS5_PROXY is
    // set (start.sh in the Railway deploy), we open the socket via
    // Tailscale's local SOCKS5 proxy instead so the connection
    // actually flows through the tailnet to the user's home LAN.
    const sock = await this.openSocket(printerIp, port);
    return new Promise((resolve, reject) => {
      sock.setTimeout(120_000);
      // `openSocket` returns an already-connected socket (direct or
      // via SOCKS5), so write immediately rather than waiting on
      // a 'connect' event that has already fired.
      sock.write(prologue);
      sock.write(bytes);
      sock.write(epilogue, () => sock.end());
      sock.once('end', () => {
        console.log(
          `[RAW] Job sent to ${printerIp}:${port} — "${jobName}" ${total}B ` +
            `(copies=${copies} sided=${opts.sided || 'single'} ` +
            `colour=${opts.color || 'bw'} paper=${paper} orient=${opts.orientation || 'portrait'})`,
        );
        resolve({ raw: true, transport: 'raw9100', bytes: total });
      });
      sock.once('timeout', () => {
        sock.destroy();
        reject(new Error('Raw print timeout'));
      });
      sock.once('error', (e) => {
        console.error('[RAW] socket error:', (e as any).message);
        reject(e);
      });
    });
  }

  /**
   * Open a raw TCP socket to (host, port). When `TS_SOCKS5_PROXY` is
   * set (Railway + Tailscale userspace deploy), the socket is opened
   * through Tailscale's local SOCKS5 proxy so the connection routes
   * through the tailnet instead of the public internet — this is how
   * the cloud backend reaches the user's home LAN printer.
   *
   * Without the env var, this is a plain `net.createConnection` —
   * same behaviour the local dev backend has always had.
   */
  private async openSocket(host: string, port: number): Promise<net.Socket> {
    const proxy = process.env.TS_SOCKS5_PROXY;
    if (!proxy) {
      // Direct connect — wait for 'connect' so callers can write
      // immediately on return.
      return await new Promise<net.Socket>((resolve, reject) => {
        const s = net.createConnection(port, host);
        s.once('connect', () => resolve(s));
        s.once('error', reject);
      });
    }

    // SOCKS5 connect via Tailscale's local proxy. The `socks` package
    // does the handshake; the returned socket is a regular net.Socket.
    const [proxyHost, proxyPortStr] = proxy.split(':');
    const proxyPort = Number(proxyPortStr) || 1055;
    const { SocksClient } = await import('socks');
    const { socket } = await SocksClient.createConnection({
      proxy: { host: proxyHost || 'localhost', port: proxyPort, type: 5 },
      command: 'connect',
      destination: { host, port },
      timeout: 30_000,
    });
    return socket as net.Socket;
  }

  /** Query printer attributes / state (online, idle, stopped…). */
  async checkPrinterStatus(
    printerIp: string,
    opts: PrintOptions = {}
  ): Promise<{
    reachable: boolean;
    state?: string;
    reasons?: string[];
    raw?: any;
  }> {
    const printer = buildPrinter(printerIp, opts);
    const msg = {
      'operation-attributes-tag': {
        'requesting-user-name': 'PrintLoop',
        'requested-attributes': [
          'printer-state',
          'printer-state-reasons',
          'printer-is-accepting-jobs',
        ],
      },
    };
    return new Promise((resolve) => {
      try {
        printer.execute('Get-Printer-Attributes' as any, msg, (err: Error, res: any) => {
          if (err) {
            resolve({ reachable: false });
            return;
          }
          const p = res?.['printer-attributes-tag'] || {};
          resolve({
            reachable: true,
            state: p['printer-state'],
            reasons: ([] as string[]).concat(p['printer-state-reasons'] || []),
            raw: p,
          });
        });
      } catch {
        resolve({ reachable: false });
      }
    });
  }
}
