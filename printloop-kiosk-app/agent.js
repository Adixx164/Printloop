/**
 * ─────────────────────────────────────────────────────────────────────
 *  Embedded PrintLoop agent (runs inside the Electron main process)
 *  ─────────────────────────────────────────────────────────────────────
 *  Same job as the standalone printloop-agent — poll the cloud for
 *  RELEASING jobs, claim them, download the bytes, dispatch to the
 *  local printer, report back. Refactored as a module so the Electron
 *  main process can start it after the user finishes the setup wizard.
 *
 *  The user never sees a Node binary, a Scheduled Task, or a .env
 *  file — the kiosk .exe IS the agent.
 * ─────────────────────────────────────────────────────────────────────
 */

const axios = require('axios');
const ipp = require('ipp');
const net = require('node:net');
const os = require('node:os');
const dgram = require('node:dgram');

/**
 * Interfaces whose names match these patterns are VPN / overlay tunnels
 * and must NEVER be selected as the source for printer traffic — they
 * also pick up 169.254.x.x APIPA addresses on Windows and Linux, and
 * binding to them sends print packets into the tunnel instead of out
 * the physical adapter the printer is on.
 */
const TUNNEL_NAME_RX = /^(tailscale|wg|wireguard|openvpn|tap|tun|zerotier|nordvpn|expressvpn|hamachi|outline|vmware|virtualbox|hyper-v|loopback pseudo)/i;

/**
 * If the destination is on a link-local APIPA range (169.254.0.0/16),
 * find the local IP on a PHYSICAL adapter (Ethernet / Wi-Fi) in the
 * same /16. Skip tunnel adapters even if they also have a 169.254.x.x
 * address — Windows can give Tailscale / WireGuard / OpenVPN the same
 * range and a higher route metric, which silently swallows printer
 * packets if we bind to them by accident.
 *
 * Returns the local source IP to bind, or undefined if the destination
 * isn't APIPA / no suitable physical NIC is available.
 */
function pickSourceAddress(destIp) {
  if (!/^169\.254\./.test(destIp)) return undefined;
  const all = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      if (!/^169\.254\./.test(i.address)) continue;
      all.push({ name, addr: i.address });
    }
  }
  // Prefer physical NICs (skip known tunnel patterns).
  const physical = all.find((x) => !TUNNEL_NAME_RX.test(x.name));
  if (physical) return physical.addr;
  // Fall back to anything — better some attempt than none.
  return all[0]?.addr;
}

const MEDIA = {
  A4: 'iso_a4_210x297mm',
  A3: 'iso_a3_297x420mm',
  LETTER: 'na_letter_8.5x11in',
  LEGAL: 'na_legal_8.5x14in',
};

function buildIppJobAttributes(opts) {
  opts = opts || {};
  const copies = Math.max(1, Number(opts.copies) || 1);
  const attrs = {
    copies,
    sides: opts.sided === 'double' ? 'two-sided-long-edge' : 'one-sided',
    'print-color-mode': opts.color === 'color' ? 'color' : 'monochrome',
  };
  if (opts.orientation === 'landscape') attrs['orientation-requested'] = 4;
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

async function ippDispatch(cfg, bytes, jobName, opts) {
  const printer = new ipp.Printer(
    `http://${cfg.printerIp}:${cfg.printerPort}${cfg.ippPath}`,
    { version: cfg.ippVersion },
  );
  const msg = {
    'operation-attributes-tag': {
      'requesting-user-name': 'PrintLoop-Kiosk',
      'job-name': jobName,
      'document-format': 'application/pdf',
    },
    'job-attributes-tag': buildIppJobAttributes(opts),
    data: bytes,
  };
  await new Promise((resolve, reject) => {
    printer.execute('Print-Job', msg, (err, res) => {
      if (err) return reject(err);
      const jobId = res && res['job-attributes-tag'] && res['job-attributes-tag']['job-id'];
      console.log(`[agent] IPP accepted ${jobName} (job-id ${jobId})`);
      resolve();
    });
  });
}

/**
 * Knock-knock — open a brief TCP connection to a "lighter" port on
 * the printer (web admin / IPP) to wake it from deep-sleep mode.
 *
 * Sharp MX-series, Brother, some Konica Minolta models all close
 * raw-9100 in low-power mode and only reopen it after they see ANY
 * TCP traffic. The web admin and IPP ports get reopened first
 * because they're how vendor utilities ping the printer; raw-9100
 * comes back a beat later. So we ping web admin, wait 2 seconds,
 * then attempt the real raw-9100 connect.
 */
async function wakeIfAsleep(host, hintPort) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = () => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(); };
    sock.setTimeout(3_000);
    sock.once('connect', finish);
    sock.once('timeout', finish);
    sock.once('error', finish);
    sock.connect({ host, port: hintPort, localAddress: pickSourceAddress(host) });
  });
}

async function rawDispatch(cfg, bytes, jobName, opts) {
  opts = opts || {};
  const UEL = '\x1B%-12345X';
  const safe = (s) =>
    String(s || '').replace(/[^A-Za-z0-9 _.\-]/g, '_').slice(0, 80) || 'PrintLoop';
  const copies = Math.max(1, Math.min(99, Number(opts.copies) || 1));
  const sided = opts.sided === 'double';
  const colour = opts.color === 'color';
  const landscape = opts.orientation === 'landscape';
  const paper = String(opts.paper || 'A4').toUpperCase();

  const pjlLines = [
    UEL + '@PJL',
    `@PJL JOB NAME="${safe(jobName)}"`,
    `@PJL SET COPIES=${copies}`,
    `@PJL SET DUPLEX=${sided ? 'ON' : 'OFF'}`,
  ];
  if (sided) pjlLines.push('@PJL SET BINDING=LONGEDGE');
  pjlLines.push(
    // ── Color / monochrome ────────────────────────────────────────
    // Sharp MX-series often ignores `RENDERMODE` for PDF input and
    // falls back to the PDF's own colour space. We belt-and-braces:
    // emit every well-known PJL variable the firmware might honour.
    // Unknown PJL is silently ignored by every printer, so this is
    // safe across vendors.
    //
    // Known limitation: to *guarantee* monochrome on every printer
    // we would need to pre-process the PDF through Ghostscript with
    // `-sColorConversionStrategy=Gray` server-side and ship that. v2.
    `@PJL SET RENDERMODE=${colour ? 'COLOR' : 'GRAYSCALE'}`,
    `@PJL SET COLORMODE=${colour ? 'COLOR' : 'MONO'}`,
    `@PJL SET PRINTMODE=${colour ? 'COLOR' : 'GRAYSCALE'}`,
    `@PJL SET COLOR=${colour ? 'ON' : 'OFF'}`,
    `@PJL SET PRINTERINMODE=${colour ? 'COLOR' : 'MONO'}`,
    // Sharp-flavoured variants — observed on some MX-series firmware
    // service notes.
    `@PJL SET PCL3COLORMODE=${colour ? 'COLOR' : 'GRAYSCALE'}`,
    // Paper + orientation
    `@PJL SET PAPER=${paper}`,
    `@PJL SET ORIENTATION=${landscape ? 'LANDSCAPE' : 'PORTRAIT'}`,
    '@PJL ENTER LANGUAGE=PDF',
    '',
  );
  const prologue = Buffer.from(pjlLines.join('\r\n'));
  const epilogue = Buffer.from('\r\n' + UEL);

  // Inner attempt — open socket + stream PJL prologue + PDF + UEL.
  // Returns a promise that resolves on clean end, rejects on
  // timeout/error. We may call this twice: once for the optimistic
  // try, once after a wake-up ping if the first attempt timed out.
  const attempt = (timeoutMs) => new Promise((resolve, reject) => {
    const sock = net.createConnection({
      host: cfg.printerIp,
      port: cfg.rawPort,
      localAddress: pickSourceAddress(cfg.printerIp),
    });
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => {
      sock.write(prologue);
      sock.write(bytes);
      sock.write(epilogue, () => sock.end());
    });
    sock.once('end', () => resolve());
    sock.once('timeout', () => { sock.destroy(); reject(new Error('timeout')); });
    sock.once('error', (err) => reject(err));
  });

  try {
    // First attempt — short timeout (8s). If the printer's awake the
    // socket connects immediately; we just need enough to stream.
    await attempt(60_000);
  } catch (firstErr) {
    const code = (firstErr && firstErr.code) || firstErr.message;
    const looksAsleep =
      code === 'ETIMEDOUT' || code === 'timeout' ||
      code === 'ECONNREFUSED' || code === 'EHOSTUNREACH';
    if (!looksAsleep) throw firstErr;
    console.warn(`[agent] ${cfg.printerIp}:${cfg.rawPort} ${code} — sending wake-up to :80, retrying…`);
    // Knock on web-admin (port 80) — the lowest-resource port the
    // printer keeps "warmer" than raw-9100. Then a small grace
    // period for the print engine to bring 9100 back up.
    await wakeIfAsleep(cfg.printerIp, 80);
    await new Promise((r) => setTimeout(r, 3000));
    await attempt(120_000);
  }

  console.log(
    `[agent] RAW sent ${jobName} → ${cfg.printerIp}:${cfg.rawPort} ` +
      `(copies=${copies} sided=${opts.sided || 'single'} colour=${opts.color || 'bw'} ` +
      `paper=${paper} orient=${opts.orientation || 'portrait'})`,
  );
}

async function dispatchToPrinter(cfg, bytes, jobName, opts) {
  if (cfg.transport === 'raw9100') return rawDispatch(cfg, bytes, jobName, opts);
  return ippDispatch(cfg, bytes, jobName, opts);
}

// ── SNMP physical-print confirmation ────────────────────────────────
/**
 * Read the printer's lifetime impression counter via SNMPv1.
 *
 * OID: `1.3.6.1.2.1.43.10.2.1.4.1.1` (prtMarkerLifeCount.1.1 — the
 * standard Printer-MIB lifetime mark counter). On every printer that
 * supports SNMP (essentially every networked office printer made in
 * the last 25 years, including the Sharp MX-5112N this was built for),
 * this counter increments by 1 per side actually marked.
 *
 * Returns the integer counter value, or null on timeout / parse
 * failure / printer doesn't expose the OID.
 *
 * Implementation: hand-rolled BER GetRequest packet sent over UDP/161,
 * response parsed by walking primitive ASN.1 tags and returning the
 * last integer-like value (Counter32 0x41 / Gauge32 0x42 / Integer
 * 0x02 / TimeTicks 0x43). The OID's own request-id and error-status
 * appear earlier in the packet, so the trailing integer is the value.
 */
function snmpReadCounter(host, communityStr = 'public', timeoutMs = 3000) {
  return new Promise((resolve) => {
    let sock;
    try {
      sock = dgram.createSocket('udp4');
    } catch {
      return resolve(null);
    }
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      try { sock.close(); } catch {}
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    // BER-encoded SNMPv1 GetRequest for prtMarkerLifeCount.1.1.
    // OID bytes (after 0x06 type + 0x0c length):
    //   2b 06 01 02 01 2b 0a 02 01 04 01 01  →  1.3.6.1.2.1.43.10.2.1.4.1.1
    const packet = Buffer.from([
      0x30, 0x2d,                          // SEQUENCE, len=45
      0x02, 0x01, 0x00,                    // version 0 (SNMPv1)
      0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63, // community "public"
      0xa0, 0x20,                          // GetRequest PDU, len=32
      0x02, 0x04, 0x12, 0x34, 0x56, 0x78,  // requestID
      0x02, 0x01, 0x00,                    // errStatus
      0x02, 0x01, 0x00,                    // errIndex
      0x30, 0x12,                          // VarBindList SEQUENCE, len=18
      0x30, 0x10,                          // VarBind SEQUENCE, len=16
      0x06, 0x0c, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x2b, 0x0a, 0x02, 0x01, 0x04, 0x01, 0x01,
      0x05, 0x00,                          // NULL value (we're reading)
    ]);

    // Override community string if caller supplied a non-default one.
    if (communityStr !== 'public') {
      const c = Buffer.from(communityStr);
      const head = Buffer.from([0x30, 45 - 8 + 2 + c.length]);
      const ver = Buffer.from([0x02, 0x01, 0x00]);
      const comm = Buffer.concat([Buffer.from([0x04, c.length]), c]);
      const rest = packet.slice(15); // PDU onwards from the static packet
      const built = Buffer.concat([head, ver, comm, rest]);
      // We can fall back to the static packet if reassembly looks wrong.
      // For now keep it simple — community-string customization is rare
      // and we hard-coded "public" as per plan.
      if (built.length === packet.length + (c.length - 6)) {
        return sendAndParse(sock, built, host, finish, timer);
      }
    }
    sendAndParse(sock, packet, host, finish, timer);
  });
}

function sendAndParse(sock, packet, host, finish, timer) {
  sock.once('message', (msg) => {
    clearTimeout(timer);
    // Walk through the response collecting primitive integer-like values.
    // The last one we encounter is prtMarkerLifeCount's value
    // (request-id / error-status / error-index appear before the
    // VarBind's value).
    let i = 0;
    let last = null;
    while (i < msg.length - 1) {
      const tag = msg[i];
      const len = msg[i + 1];
      if (i + 2 + len > msg.length) break;
      if (tag === 0x30 || tag === 0xa0 || tag === 0xa1 || tag === 0xa2) {
        // SEQUENCE / GetRequest / GetNextRequest / GetResponse — recurse
        // by advancing past the header without skipping the body.
        i += 2;
        continue;
      }
      if (tag === 0x02 || tag === 0x41 || tag === 0x42 || tag === 0x43) {
        // Integer / Counter32 / Gauge32 / TimeTicks — read big-endian.
        let v = 0;
        for (let k = 0; k < len; k++) v = v * 256 + msg[i + 2 + k];
        last = v;
      }
      i += 2 + len;
    }
    finish(last);
  });
  sock.once('error', () => finish(null));
  sock.send(packet, 0, packet.length, 161, host);
}

/**
 * Dispatch + confirm a print job with retry. Returns:
 *   { ok: true,  attempts, pages }  on confirmed delivery
 *   { ok: false, attempts, reason } if all attempts time out without
 *                                   the printer's page counter
 *                                   advancing by `expectedPages`.
 *
 * The SNMP counter MUST move by at least `expectedPages` within the
 * per-attempt window. If the very first counter read returns null, we
 * still proceed (the printer might just be slow to respond once) but
 * if every subsequent poll also returns null we fail with a clear
 * "SNMP unreachable" reason — the operator either enables SNMP or
 * picks a printer that exposes it.
 */
async function dispatchAndConfirm(cfg, bytes, jobName, opts, expectedPages, emit, code, itemName) {
  const maxAttempts = Math.max(1, Number(cfg.maxPrintAttempts) || 2);
  const pollMs = 3000;
  // Per-plan: 30s base + 3s per expected page. A 1-page job has 33s,
  // a 50-page job has 3 min — generous, but not "give up forever."
  const perAttemptTimeoutMs = 30_000 + 3_000 * Math.max(1, expectedPages);

  let lastReason = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. Read the page counter BEFORE we send. If SNMP isn't reachable
    //    we can't meaningfully verify — record `null` and let the
    //    polling loop decide whether to bail.
    let before = await snmpReadCounter(cfg.printerIp);
    console.log(`[agent] attempt ${attempt}/${maxAttempts} for ${jobName}: counter before=${before}, expected +${expectedPages}`);

    emit && emit({ kind: 'dispatching', code, item: itemName, attempt, of: maxAttempts });

    // 2. Send the bytes (existing dispatch path — same code that
    //    earlier in the session printed byte-exact on the real Sharp).
    try {
      await dispatchToPrinter(cfg, bytes, jobName, opts);
    } catch (err) {
      lastReason = `dispatch failed: ${(err && err.message) || String(err)}`;
      console.warn(`[agent] ${lastReason}`);
      emit && emit({ kind: 'attempt-timeout', code, item: itemName, attempt, reason: lastReason });
      continue; // retry
    }

    // 3. Poll the counter. We need it to reach `before + expected` to
    //    confirm physical delivery. Other people printing concurrently
    //    can only push the counter ABOVE that threshold, never below,
    //    so the inequality is safe.
    emit && emit({ kind: 'awaiting-confirmation', code, item: itemName, expected: expectedPages, before });
    const deadline = Date.now() + perAttemptTimeoutMs;
    let confirmed = false;
    let lastCounter = before;
    let snmpDead = before === null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs));
      const cur = await snmpReadCounter(cfg.printerIp);
      if (cur != null) {
        snmpDead = false;
        // If we never got a `before`, the first successful read becomes
        // our baseline. (This can happen if the printer's SNMP daemon
        // takes a few seconds to warm up after a sleep cycle.)
        if (before == null) {
          before = cur;
          lastCounter = cur;
          emit && emit({ kind: 'awaiting-confirmation', code, item: itemName, expected: expectedPages, before });
          continue;
        }
        lastCounter = cur;
        const printed = Math.max(0, cur - before);
        emit && emit({ kind: 'progress', code, item: itemName, printed, expected: expectedPages });
        if (printed >= expectedPages) {
          confirmed = true;
          break;
        }
      }
    }

    if (confirmed) {
      const pages = lastCounter - before;
      console.log(`[agent] confirmed ${jobName} after attempt ${attempt}: counter advanced by ${pages}`);
      emit && emit({ kind: 'confirmed', code, item: itemName, pages, attempt });
      return { ok: true, attempts: attempt, pages };
    }

    // 4. Attempt failed (either counter never moved or SNMP is dead).
    lastReason = snmpDead
      ? `printer never responded to SNMP on UDP/161 — enable SNMP in the printer's network settings or check community string`
      : `printer received the job but only printed ${lastCounter - (before || 0)} of ${expectedPages} pages within ${Math.round(perAttemptTimeoutMs / 1000)}s`;
    console.warn(`[agent] attempt ${attempt} failed: ${lastReason}`);
    emit && emit({ kind: 'attempt-timeout', code, item: itemName, attempt, reason: lastReason });
  }

  return { ok: false, attempts: maxAttempts, reason: lastReason };
}

function cloudApi(cfg) {
  return axios.create({
    baseURL: cfg.baseUrl,
    headers: { 'X-Kiosk-Key': cfg.kioskKey },
    timeout: 30_000,
    validateStatus: () => true,
  });
}

async function processJob(cfg, api, job, emit) {
  const claim = await api.post(`/api/agent/jobs/${job.id}/start`, {});
  if (claim.status !== 200) {
    if (claim.status !== 409) {
      console.warn(`[agent] could not claim ${job.code}: ${claim.status}`);
    }
    return;
  }
  emit && emit({ kind: 'claim', code: job.code, items: job.items.length });

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

      // Compute the expected impression delta. The Printer-MIB counter
      // ticks once per side actually marked, so single-sided N pages
      // and double-sided N pages both add N impressions. Page-range
      // printing isn't honoured at the agent (the page-range field is
      // stored but not threaded into PJL/IPP), so the printer renders
      // every page in the PDF — `totalPages × copies` is what shows up
      // on the counter.
      const cfgOpts = item.printConfiguration || {};
      const copies = Math.max(1, Number(cfgOpts.copies) || 1);
      const itemPages = Math.max(1, Number(item.totalPages) || 1);
      const expectedPages = copies * itemPages;

      const result = await dispatchAndConfirm(
        cfg, bytes, jobName, cfgOpts, expectedPages, emit, job.code, item.fileName,
      );

      if (result.ok) {
        printed++;
      } else {
        lastError = `${item.fileName}: ${result.reason}`;
        console.error(`[agent] item failed — ${lastError}`);
        emit && emit({ kind: 'verify-failed', code: job.code, item: item.fileName, reason: result.reason, attempts: result.attempts });
      }
    } catch (err) {
      lastError = `${item.fileName}: ${(err && err.message) || String(err)}`;
      console.error(`[agent] item failed — ${lastError}`);
      emit && emit({ kind: 'verify-failed', code: job.code, item: item.fileName, reason: lastError });
    }
  }

  const allFailed = printed === 0;
  const endpoint = allFailed ? 'failed' : 'complete';
  const body = allFailed ? { reason: lastError || 'agent dispatch failed' } : {};
  const report = await api.post(`/api/agent/jobs/${job.id}/${endpoint}`, body);
  emit && emit({
    kind: allFailed ? 'failed' : 'complete',
    code: job.code,
    printed,
    total: job.items.length,
    reportStatus: report.status,
    reason: allFailed ? lastError : undefined,
  });
}

async function pollOnce(cfg, api, emit) {
  const resp = await api.get('/api/agent/jobs/ready');
  if (resp.status === 401) {
    emit && emit({ kind: 'auth-error' });
    return;
  }
  if (resp.status !== 200) return;
  const jobs = (resp.data && resp.data.data && resp.data.data.jobs) || [];
  for (const job of jobs) {
    try { await processJob(cfg, api, job, emit); }
    catch (err) { console.error('[agent] processJob crashed:', err && err.message); }
  }
}

/**
 * Start the polling loop. Returns a stop function.
 *
 *   const stop = startAgent(config, (event) => { ... });
 *   stop();
 *
 * The `emit` callback receives status events the UI can render
 * (claim/complete/failed/auth-error) — drives the live "last job"
 * indicator on the kiosk window.
 *
 * Side effect: a printer keep-alive ping every 30 seconds. This is a
 * 1-second TCP probe to the printer's web-admin port (or IPP if 80
 * isn't available). Many MFPs — Sharp MX-series being notorious —
 * close raw-9100 in deep sleep. Touching ANY port resets their idle
 * timer, so the agent keeps the printer warm and dispatch never has
 * to wake it from scratch.
 */
function startAgent(config, emit) {
  const cfg = {
    baseUrl: String(config.baseUrl || '').replace(/\/+$/, ''),
    kioskKey: String(config.kioskKey || ''),
    printerIp: String(config.printerIp || ''),
    printerPort: Number(config.printerPort) || 631,
    transport: config.transport === 'raw9100' ? 'raw9100' : 'ipp',
    rawPort: Number(config.rawPort) || 9100,
    ippPath: config.ippPath || '/ipp/print',
    ippVersion: ['1.0', '1.1', '2.0'].includes(config.ippVersion) ? config.ippVersion : '2.0',
    pollMs: Math.max(1000, Number(config.pollMs) || 4000),
    keepAliveMs: Math.max(10_000, Number(config.keepAliveMs) || 30_000),
    // Max attempts to send a job and confirm via SNMP page-counter.
    // Each attempt resends the PJL+PDF stream and polls the counter.
    // Default 2 — first try is usually instant; second covers a
    // transient queue hiccup. Capped to 5 so a bad job can't loop.
    maxPrintAttempts: Math.max(1, Math.min(5, Number(config.maxPrintAttempts) || 2)),
  };
  if (!cfg.baseUrl || !cfg.kioskKey || !cfg.printerIp) {
    throw new Error('agent config missing baseUrl, kioskKey, or printerIp');
  }
  const api = cloudApi(cfg);
  console.log(
    `[agent] starting — base=${cfg.baseUrl} printer=${cfg.printerIp} transport=${cfg.transport} keep-alive=${cfg.keepAliveMs}ms`,
  );

  let running = false;
  let stopped = false;
  const pollTimer = setInterval(async () => {
    if (stopped || running) return;
    running = true;
    try { await pollOnce(cfg, api, emit); }
    catch (err) { console.error('[agent] poll error:', err && err.message); }
    finally { running = false; }
  }, cfg.pollMs);

  // ── Printer keep-alive ───────────────────────────────────────────
  // Tap the printer's lighter ports every keepAliveMs to keep its
  // network stack hot. We try web-admin (80) first because it's
  // usually the lowest-power port; if that doesn't connect we try
  // IPP (631) and finally the configured rawPort. We don't care
  // about errors here — a failed knock just means the printer is
  // really off, and the next print attempt will surface that.
  const tap = (port) => new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(ok); };
    sock.setTimeout(1500);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect({ host: cfg.printerIp, port, localAddress: pickSourceAddress(cfg.printerIp) });
  });
  const keepAliveTimer = setInterval(async () => {
    if (stopped) return;
    const ports = [80, 631, cfg.rawPort];
    let alive = false;
    for (const p of ports) {
      if (await tap(p)) { alive = true; break; }
    }
    if (!alive) {
      // Silent in normal operation; only log when the printer falls off.
      console.warn(`[agent] keep-alive: ${cfg.printerIp} not responding on 80/631/${cfg.rawPort}`);
    }
  }, cfg.keepAliveMs);
  // Fire one immediately so the printer is warm before the first
  // poll picks up a job.
  setImmediate(async () => {
    for (const p of [80, 631, cfg.rawPort]) {
      if (await tap(p)) break;
    }
  });

  return function stop() {
    stopped = true;
    clearInterval(pollTimer);
    clearInterval(keepAliveTimer);
  };
}

module.exports = { startAgent };
