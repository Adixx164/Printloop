/**
 * Agent job-truth E2E (V2-44, P1+P2) — runs the REAL agent binary
 * against a mock IPP printer and a mock cloud API. No backend, no
 * Redis, no real printer; CI-portable.
 *
 * Scenarios:
 *   A. ipp / job completes  → POST /complete {confirmation:'confirmed',
 *      method:'ipp-job-state'}; capability report arrives with
 *      colour/duplex/A3 parsed from Get-Printer-Attributes.
 *   B. ipp / job aborted    → POST /failed {reason: …aborted…}.
 *   C. raw9100              → bytes land on the socket; POST /complete
 *      {confirmation:'unconfirmed', method:'none'}.
 *
 * The mock printer speaks just enough IPP (via the same `ipp` lib the
 * agent uses): Print-Job → job-id; Get-Job-Attributes → scripted
 * job-state sequence; Get-Printer-Attributes → capability set.
 */
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');
const ipp = require('ipp');

const AGENT_DIR = path.resolve(__dirname, '..');
const rnd = () => 5000 + Math.floor(Math.random() * 4000);

function ok(m) { process.stdout.write(`ok   ${m}\n`); }
function fail(m) { process.stdout.write(`FAIL: ${m}\n`); process.exit(1); }
function assert(c, m) { c ? ok(m) : fail(m); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal one-page PDF for the download endpoint.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF\n');

/** Mock IPP printer. jobStates = array the Get-Job-Attributes polls walk. */
function mockIppPrinter(port, jobStates) {
  let stateIdx = 0;
  const seen = { printJob: 0, getJob: 0, getPrinter: 0 };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let parsed;
      try { parsed = ipp.parse(Buffer.concat(chunks)); } catch (e) { res.statusCode = 400; return res.end(); }
      const op = String(parsed.operation || '');
      let reply;
      if (op === 'Print-Job' || op === '2') {
        seen.printJob++;
        reply = {
          version: '2.0', statusCode: 'successful-ok', id: parsed.id,
          'operation-attributes-tag': { 'attributes-charset': 'utf-8', 'attributes-natural-language': 'en' },
          'job-attributes-tag': { 'job-id': 77, 'job-state': 'processing' },
        };
      } else if (op === 'Get-Job-Attributes' || op === '9') {
        seen.getJob++;
        const state = jobStates[Math.min(stateIdx, jobStates.length - 1)];
        stateIdx++;
        reply = {
          version: '2.0', statusCode: 'successful-ok', id: parsed.id,
          'operation-attributes-tag': { 'attributes-charset': 'utf-8', 'attributes-natural-language': 'en' },
          'job-attributes-tag': {
            'job-id': 77, 'job-state': state,
            ...(state === 'aborted' ? { 'job-state-reasons': 'aborted-by-system' } : {}),
          },
        };
      } else if (op === 'Get-Printer-Attributes' || op === '11') {
        seen.getPrinter++;
        reply = {
          version: '2.0', statusCode: 'successful-ok', id: parsed.id,
          'operation-attributes-tag': { 'attributes-charset': 'utf-8', 'attributes-natural-language': 'en' },
          'printer-attributes-tag': {
            'color-supported': true,
            'print-color-mode-supported': ['monochrome', 'color'],
            'sides-supported': ['one-sided', 'two-sided-long-edge'],
            'media-supported': ['iso_a4_210x297mm', 'iso_a3_297x420mm', 'na_letter_8.5x11in'],
          },
        };
      } else {
        reply = {
          version: '2.0', statusCode: 'successful-ok', id: parsed.id,
          'operation-attributes-tag': { 'attributes-charset': 'utf-8', 'attributes-natural-language': 'en' },
        };
      }
      const buf = ipp.serialize(reply);
      res.setHeader('Content-Type', 'application/ipp');
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, seen })));
}

/** Mock cloud API: serves one ready job, captures complete/failed/caps. */
function mockCloud(port, jobId) {
  const captured = { complete: null, failed: null, caps: null, started: 0 };
  let served = false;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};
      const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
      const u = String(req.url);
      if (u === '/api/agent/jobs/ready') {
        const jobs = served ? [] : [{
          id: jobId, code: 'TRUTH1', jobType: 'document', totalPages: 1, updatedAt: new Date().toISOString(),
          items: [{ fileId: 'f1', fileName: 'doc.pdf', downloadUrl: `http://localhost:${port}/file.pdf`, printConfiguration: { copies: 1 }, totalPages: 1 }],
        }];
        return send(200, { success: true, data: { jobs } });
      }
      if (u === '/file.pdf') { res.setHeader('Content-Type', 'application/pdf'); return res.end(PDF); }
      if (u === `/api/agent/jobs/${jobId}/start`) { served = true; captured.started++; return send(200, { success: true }); }
      if (u === `/api/agent/jobs/${jobId}/complete`) { captured.complete = body; return send(200, { success: true }); }
      if (u === `/api/agent/jobs/${jobId}/failed`) { captured.failed = body; return send(200, { success: true }); }
      if (u === '/api/agent/printer/capabilities') { captured.caps = body; return send(200, { success: true }); }
      send(404, { success: false });
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, captured })));
}

function spawnAgent(env) {
  const child = spawn('npx', ['tsx', 'agent.ts'], {
    cwd: AGENT_DIR, env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'], shell: true,
  });
  let log = '';
  child.stdout.on('data', (c) => (log += c.toString()));
  child.stderr.on('data', (c) => (log += c.toString()));
  return { child, getLog: () => log };
}

function killTree(child) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } else {
      child.kill('SIGKILL');
    }
  } catch { /* already gone */ }
}

async function waitFor(predicate, ms, what) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (predicate()) return true;
    await sleep(300);
  }
  fail(`timeout waiting for ${what}`);
}

async function scenarioIpp(name, jobStates, expect) {
  const ippPort = rnd(); const cloudPort = rnd();
  const printer = await mockIppPrinter(ippPort, jobStates);
  const cloud = await mockCloud(cloudPort, `job-${name}`);
  const agent = spawnAgent({
    PRINTLOOP_BASE_URL: `http://localhost:${cloudPort}`,
    KIOSK_API_KEY: 'test-key',
    PRINTER_TRANSPORT: 'ipp',
    PRINTER_IP: '127.0.0.1',
    PRINTER_PORT: String(ippPort),
    IPP_PATH: '/ipp/print',
    POLL_INTERVAL_MS: '600',
    CONFIRM_TIMEOUT_MS: '20000',
  });
  try {
    await waitFor(
      () => cloud.captured.complete || cloud.captured.failed,
      40_000,
      `${name}: agent callback`,
    );
    expect(cloud.captured, printer.seen, agent.getLog());
  } finally {
    killTree(agent.child);
    printer.server.close();
    cloud.server.close();
  }
}

async function main() {
  // ── A: printer completes the job ─────────────────────────────────
  await scenarioIpp('a', ['processing', 'processing', 'completed'], (cap, seen) => {
    assert(!!cap.complete, 'A: /complete called');
    assert(cap.complete.confirmation === 'confirmed', `A: confirmation=confirmed (got ${cap.complete.confirmation})`);
    assert(cap.complete.method === 'ipp-job-state', `A: method=ipp-job-state (got ${cap.complete.method})`);
    assert(seen.getJob >= 2, `A: agent actually polled job state (${seen.getJob} polls)`);
    assert(!!cap.caps, 'A: capability report arrived');
    assert(cap.caps.color === true, 'A: caps.color=true (from print-color-mode-supported)');
    assert(cap.caps.duplex === true, 'A: caps.duplex=true (two-sided-long-edge)');
    assert(cap.caps.a3 === true, 'A: caps.a3=true (iso_a3 in media-supported)');
  });

  // ── B: printer aborts the job (jam / cancel at panel) ───────────
  await scenarioIpp('b', ['processing', 'aborted'], (cap) => {
    assert(!!cap.failed, 'B: /failed called (not /complete)');
    assert(!cap.complete, 'B: /complete NOT called');
    assert(/aborted/i.test(String(cap.failed.reason || '')), `B: reason mentions abort (got "${cap.failed.reason}")`);
  });

  // ── C: raw9100 — fire-and-forget honesty ─────────────────────────
  {
    const rawPort = rnd(); const cloudPort = rnd();
    let rawBytes = 0;
    const rawServer = net.createServer((sock) => {
      sock.on('data', (d) => (rawBytes += d.length));
      sock.on('error', () => undefined);
    });
    await new Promise((r) => rawServer.listen(rawPort, r));
    const cloud = await mockCloud(cloudPort, 'job-c');
    const agent = spawnAgent({
      PRINTLOOP_BASE_URL: `http://localhost:${cloudPort}`,
      KIOSK_API_KEY: 'test-key',
      PRINTER_TRANSPORT: 'raw9100',
      PRINTER_IP: '127.0.0.1',
      PRINTER_RAW_PORT: String(rawPort),
      POLL_INTERVAL_MS: '600',
    });
    try {
      await waitFor(() => cloud.captured.complete, 40_000, 'C: /complete');
      assert(rawBytes > PDF.length, `C: PJL+document bytes hit the raw socket (${rawBytes}b)`);
      assert(cloud.captured.complete.confirmation === 'unconfirmed', 'C: confirmation=unconfirmed');
      assert(cloud.captured.complete.method === 'none', 'C: method=none (no feedback channel)');
    } finally {
      killTree(agent.child);
      rawServer.close();
      cloud.server.close();
    }
  }

  process.stdout.write('\nALL AGENT JOB-TRUTH CHECKS PASSED\n');
  process.exit(0);
}

main().catch((err) => {
  process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
