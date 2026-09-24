/**
 * Office→PDF conversion E2E (V2-48) — proves the black box is wired into
 * the real upload ingest, end to end, WITHOUT needing LibreOffice.
 *
 * A stub "Gotenberg" HTTP server stands in for the converter: it accepts
 * the multipart POST the service makes and returns a known **2-page**
 * PDF. The backend is launched with DOC_CONVERTER=gotenberg pointed at
 * the stub, so a customer uploading a `.docx` exercises:
 *   gate accepts office → convertOfficeToPdf → flatten → countPages → price → job + code
 * We assert the job is created with a 6-char code AND a page count of 2
 * — which can ONLY come from the converted PDF, since the uploaded
 * "docx" bytes are gibberish a PDF parser would reject.
 *
 * Self-contained: own backend on a random port, own stub on a random
 * port, SEED_DEMO=1 (legacy tenant → offline guard skipped),
 * DISABLE_RATE_LIMIT=1, SMTP_HOST=''.
 */
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 5000 + Math.floor(Math.random() * 4000);
const STUB_PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(__dirname, '..', 'data', `officeconv-e2e-${process.pid}.sqlite`);
const SERVER = path.resolve(__dirname, '..', 'server.ts');

function ok(m) { process.stdout.write(`ok   ${m}\n`); }
function fail(m) { process.stdout.write(`FAIL: ${m}\n`); process.exit(1); }
function assert(c, m) { c ? ok(m) : fail(m); }

// A minimal but valid TWO-page PDF the stub converter returns.
const TWO_PAGE_PDF = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
  '2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<<>>>>endobj\n' +
  '4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<<>>>>endobj\n' +
  'trailer<</Size 5/Root 1 0 R>>\n%%EOF\n',
  'utf8',
);

async function jr(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = null; try { d = await r.json(); } catch { /* */ }
  return { status: r.status, data: d };
}

async function waitFor(url, ms = 25_000) {
  const s = Date.now();
  while (Date.now() - s < ms) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  try { fs.unlinkSync(DB_FILE); } catch { /* */ }

  // Stub Gotenberg: any POST → the 2-page PDF; GET /health → 200.
  let convertHits = 0;
  const stub = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.statusCode = 200; return res.end('ok');
    }
    if (req.method === 'POST' && req.url.startsWith('/forms/libreoffice/convert')) {
      // drain body, then return the PDF
      req.on('data', () => {});
      req.on('end', () => {
        convertHits++;
        res.setHeader('Content-Type', 'application/pdf');
        res.end(TWO_PAGE_PDF);
      });
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise((r) => stub.listen(STUB_PORT, r));
  ok(`stub converter up on :${STUB_PORT}`);

  const env = {
    ...process.env,
    DATABASE_FILE: DB_FILE, PORT: String(PORT),
    SEED_DEMO: '1', DISABLE_RATE_LIMIT: '1', GEOCODER: 'fixture', SMTP_HOST: '',
    DOC_CONVERTER: 'gotenberg', GOTENBERG_URL: `http://localhost:${STUB_PORT}`,
  };
  const server = spawn('npx', ['tsx', SERVER], {
    env, cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'], shell: true,
  });
  let log = '';
  server.stdout.on('data', (c) => (log += c.toString()));
  server.stderr.on('data', (c) => (log += c.toString()));
  const cleanup = () => {
    try { server.kill('SIGKILL'); } catch { /* */ }
    try { stub.close(); } catch { /* */ }
    setTimeout(() => { try { fs.unlinkSync(DB_FILE); } catch { /* */ } }, 500);
  };

  try {
    if (!(await waitFor(`http://localhost:${PORT}/health`))) { process.stdout.write(log); fail('server boot'); }
    ok('server up');

    // Register a customer on the legacy tenant.
    const email = `office-${process.pid}@example.test`;
    const reg = await jr('POST', '/customer/auth/register', {
      firstName: 'Off', lastName: 'Ice', email,
      phoneNumber: '+2348010000000', password: 'CustomerPass2026!',
    });
    const token = reg.data?.data?.tokens?.accessToken;
    assert(!!token, `register → token (${reg.status})`);
    const auth = { Authorization: `Bearer ${token}` };

    // Fund the wallet.
    const topup = await jr('POST', '/wallet/top-up', { amount: 2000 }, auth);
    assert(topup.status === 200, `wallet top-up → ${topup.status}`);

    // Upload a ".docx" (gibberish bytes) paying from wallet. The stub
    // converter turns it into the 2-page PDF.
    const fd = new FormData();
    fd.set(
      'file',
      new Blob([Buffer.from('PK not-a-real-docx')], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      'thesis.docx',
    );
    fd.set('paymentMethod', 'wallet');
    fd.set('printConfiguration', JSON.stringify({
      copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300,
    }));
    const res = await fetch(`${B}/customer/print-jobs`, { method: 'POST', headers: { ...auth }, body: fd });
    const out = await res.json().catch(() => null);
    if (res.status !== 201) process.stdout.write(`create body: ${JSON.stringify(out)}\n`);
    assert(res.status === 201, `upload .docx + create job → 201 (got ${res.status})`);

    const job = out?.data?.job;
    assert(!!job, 'job returned');
    assert(typeof job.code === 'string' && job.code.length === 6, `6-char release code (${job.code})`);
    const pages = Number(job.totalPages ?? job.pageCount);
    assert(pages === 2, `page count came from the CONVERTED pdf = 2 (got ${pages})`);
    assert(convertHits >= 1, `converter was actually called (hits=${convertHits})`);

    process.stdout.write('\nALL OFFICE-CONVERT CHECKS PASSED\n');
    cleanup();
    process.exit(0);
  } catch (err) {
    process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write('\n--- server log (tail) ---\n' + log.slice(-2500) + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
