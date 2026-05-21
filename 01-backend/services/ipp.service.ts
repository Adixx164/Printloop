import ipp from 'ipp';
import axios from 'axios';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface PrintOptions {
  copies?: number;
  /** 'single' | 'double' (long-edge duplex) */
  sided?: 'single' | 'double';
  color?: 'bw' | 'color';
  paper?: string; // A4 | A3 | Letter | Legal
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
   *  CUPS queues = /printers/<queue-name>. */
  path?: string;
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
      { uri: `ipps://${printerIp}:${port}${path}` } as any
    );
  }
  const port = opts.port || 631;
  return new ipp.Printer(`http://${printerIp}:${port}${path}`);
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
