/**
 * ─────────────────────────────────────────────────────────────────────
 *  PrintLoop — printer auto-discovery
 *  ─────────────────────────────────────────────────────────────────────
 *  Three discovery sources, layered for resilience:
 *
 *    1. mDNS / Bonjour  — modern printers (IPP-Everywhere / AirPrint)
 *                         advertise `_ipp._tcp` and `_pdl-datastream._tcp`
 *                         (raw-9100). Returns IP + model + capabilities
 *                         instantly, no scan needed.
 *    2. TCP port scan   — sweep the local /24 for ports 631 / 9100.
 *                         Catches older / quirky printers that don't
 *                         advertise (Sharp MX-series being one).
 *    3. IPP enrichment  — for each candidate, run Get-Printer-Attributes
 *                         to learn the model name and supported PDLs.
 *
 *  The discovery returns a deduplicated list of:
 *
 *    {
 *      ip, name, model, transport, port, ippPath, ippVersion,
 *      source: 'mdns' | 'scan',
 *    }
 *
 *  The setup wizard renders each one as a click-to-fill card.
 * ─────────────────────────────────────────────────────────────────────
 */

const net = require('node:net');
const os = require('node:os');
const ipp = require('ipp');
const { Bonjour } = require('bonjour-service');

/** Local /24 hosts the agent could plausibly reach. */
function localSubnetHosts() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      // We only auto-scan a /24 to keep latency sane and avoid scanning
      // corporate /16s. If a printer is on a different subnet, the
      // operator can still type the IP manually.
      const m = i.address.match(/^(\d+\.\d+\.\d+)\.(\d+)$/);
      if (!m) continue;
      const prefix = m[1];
      for (let n = 2; n <= 254; n++) {
        if (`${prefix}.${n}` === i.address) continue; // skip self
        out.push(`${prefix}.${n}`);
      }
      return out; // only scan the first non-internal IPv4 we find
    }
  }
  return out;
}

/** Quick TCP-connect probe. */
function probe(host, port, timeout = 700) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (open) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(open); };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, host);
  });
}

/** mDNS / Bonjour discovery. Returns within `timeoutMs`. */
function discoverMdns(timeoutMs = 2500) {
  return new Promise((resolve) => {
    const bj = new Bonjour();
    const results = [];
    const seen = new Set();

    function record(svc, transport) {
      const ip =
        (svc.addresses && svc.addresses.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a))) ||
        svc.referer?.address || null;
      if (!ip) return;
      const key = `${ip}|${transport}`;
      if (seen.has(key)) return;
      seen.add(key);
      const txt = svc.txt || {};
      const model = txt.ty || txt.product || svc.name || null;
      results.push({
        ip,
        port: svc.port,
        name: svc.name,
        model,
        transport,
        ippPath: txt.rp ? `/${String(txt.rp).replace(/^\/+/, '')}` : '/ipp/print',
        ippVersion: '2.0',
        source: 'mdns',
        raw: { service: svc.type, fqdn: svc.fqdn, txt },
      });
    }

    const ippSearch = bj.find({ type: 'ipp' });
    ippSearch.on('up', (svc) => record(svc, 'ipp'));
    const ippsSearch = bj.find({ type: 'ipps' });
    ippsSearch.on('up', (svc) => record(svc, 'ipp'));
    const rawSearch = bj.find({ type: 'pdl-datastream' });
    rawSearch.on('up', (svc) => record(svc, 'raw9100'));

    setTimeout(() => {
      try { bj.destroy(); } catch {}
      resolve(results);
    }, timeoutMs);
  });
}

/** Sweep the local /24 for printer ports. */
async function discoverPortScan(progress) {
  const hosts = localSubnetHosts();
  const PORTS = [631, 9100];
  const out = [];
  let done = 0;
  // Parallel chunks of 48 keeps it under 3s on a typical /24.
  for (let i = 0; i < hosts.length; i += 48) {
    const chunk = hosts.slice(i, i + 48);
    const r = await Promise.all(
      chunk.flatMap((h) => PORTS.map((p) => probe(h, p).then((open) => ({ host: h, port: p, open })))),
    );
    for (const x of r) if (x.open) out.push(x);
    done += chunk.length;
    if (progress) progress({ done, total: hosts.length });
  }
  return out;
}

/** Ask a candidate printer for its model + capabilities via IPP. Best-effort. */
function ippInterrogate(host, port = 631, paths = ['/ipp/print', '/ipp/lp', '/ipp', '/']) {
  return new Promise(async (resolve) => {
    for (const path of paths) {
      const url = `http://${host}:${port}${path}`;
      const printer = new ipp.Printer(url, { version: '1.1' });
      const msg = {
        'operation-attributes-tag': {
          'requesting-user-name': 'PrintLoop-Discover',
          'requested-attributes': [
            'printer-make-and-model',
            'printer-name',
            'printer-state',
            'printer-is-accepting-jobs',
            'document-format-supported',
          ],
        },
      };
      const r = await new Promise((r) =>
        printer.execute('Get-Printer-Attributes', msg, (err, res) => r({ err, res })),
      );
      if (!r.err) {
        const a = (r.res && r.res['printer-attributes-tag']) || {};
        return resolve({
          path,
          model: a['printer-make-and-model'] || a['printer-name'] || null,
          state: a['printer-state'] || null,
          formats: [].concat(a['document-format-supported'] || []),
        });
      }
      // Try next path
    }
    resolve(null);
  });
}

/**
 * Run the full discovery pipeline. Returns a deduplicated list of
 * printers. The IPP enrichment is fire-and-forget per printer with a
 * combined 4-second budget — anything that takes longer just doesn't
 * get a model name, but is still listed by IP.
 */
async function discoverAll(opts = {}) {
  const { mdnsTimeoutMs = 2500, enrich = true, progress = null } = opts;

  // Run mDNS and port scan in parallel.
  const [mdns, scan] = await Promise.all([
    discoverMdns(mdnsTimeoutMs).catch((e) => { console.warn('[discover] mDNS failed:', e.message); return []; }),
    discoverPortScan(progress).catch((e) => { console.warn('[discover] scan failed:', e.message); return []; }),
  ]);

  // Merge by IP. mDNS results take priority (richer metadata).
  const merged = new Map();
  for (const m of mdns) {
    const cur = merged.get(m.ip) || { ip: m.ip, sources: new Set() };
    cur.sources.add('mdns');
    cur.model = cur.model || m.model;
    cur.name = cur.name || m.name;
    if (m.transport === 'ipp') {
      cur.ippPort = m.port || 631;
      cur.ippPath = m.ippPath || cur.ippPath || '/ipp/print';
      cur.ippVersion = m.ippVersion || '2.0';
    }
    if (m.transport === 'raw9100') {
      cur.rawPort = m.port || 9100;
    }
    merged.set(m.ip, cur);
  }
  for (const s of scan) {
    const cur = merged.get(s.host) || { ip: s.host, sources: new Set() };
    cur.sources.add('scan');
    if (s.port === 631) cur.ippPort = cur.ippPort || 631;
    if (s.port === 9100) cur.rawPort = cur.rawPort || 9100;
    merged.set(s.host, cur);
  }

  // Enrich any candidate that doesn't have a model yet, using IPP if
  // it has an IPP port. We do this serially with a hard budget to
  // prevent slow printers from blocking the whole UI.
  if (enrich) {
    const candidates = Array.from(merged.values()).filter((c) => !c.model && c.ippPort);
    const budget = Date.now() + 4000;
    for (const c of candidates) {
      if (Date.now() > budget) break;
      const info = await ippInterrogate(c.ip, c.ippPort);
      if (info) {
        c.model = info.model;
        if (info.path) c.ippPath = info.path;
      }
    }
  }

  // Build the final list — pick a recommended transport per printer
  // based on what's available + the model hint. Sharp MX-series →
  // raw9100; everything else with /ipp/print → ipp; raw9100-only
  // (no IPP port) → raw9100.
  const list = Array.from(merged.values()).map((c) => {
    const sharpish = c.model && /Sharp|MX-\d+|MFP|copier/i.test(c.model);
    const hasIpp = !!c.ippPort;
    const hasRaw = !!c.rawPort;
    let transport = 'ipp';
    if (sharpish && hasRaw) transport = 'raw9100';
    else if (!hasIpp && hasRaw) transport = 'raw9100';
    else transport = 'ipp';
    return {
      ip: c.ip,
      model: c.model || '(unknown)',
      name: c.name || null,
      sources: Array.from(c.sources),
      transport,
      ippPort: c.ippPort || 631,
      ippPath: c.ippPath || '/ipp/print',
      ippVersion: c.ippVersion || (sharpish ? '1.1' : '2.0'),
      rawPort: c.rawPort || 9100,
    };
  });

  // Sort: known model first, then by IP numeric
  list.sort((a, b) => {
    if (a.model !== '(unknown)' && b.model === '(unknown)') return -1;
    if (a.model === '(unknown)' && b.model !== '(unknown)') return 1;
    const an = a.ip.split('.').map(Number);
    const bn = b.ip.split('.').map(Number);
    for (let i = 0; i < 4; i++) if (an[i] !== bn[i]) return an[i] - bn[i];
    return 0;
  });

  return list;
}

module.exports = { discoverAll };
