/**
 * Customer revenue path E2E (V2-42) — the money path the whole product
 * exists to serve.
 *
 *   register → wallet top-up → upload + create print job (pay from
 *   wallet) → receive a 6-char release code → wallet debited.
 *
 * Self-contained: own backend on a random port, SMTP_HOST='' so any
 * verification log is harmless, SEED_DEMO=1 (legacy tenant exists),
 * DISABLE_RATE_LIMIT=1. The customer registers on the legacy tenant
 * (no subdomain), so the V2-32 pre-pay offline guard is skipped by
 * design — exactly the single-tenant path.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(__dirname, '..', 'data', `revpath-e2e-${process.pid}.sqlite`);
const SERVER = path.resolve(__dirname, '..', 'server.ts');

function ok(m) { process.stdout.write(`ok   ${m}\n`); }
function fail(m) { process.stdout.write(`FAIL: ${m}\n`); process.exit(1); }
function assert(c, m) { c ? ok(m) : fail(m); }

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

// A minimal valid single-page PDF.
function tinyPdf() {
  return Buffer.from(
    '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<<>>>>endobj\n' +
    'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n',
    'utf8',
  );
}

async function main() {
  try { fs.unlinkSync(DB_FILE); } catch { /* */ }
  const env = {
    ...process.env,
    DATABASE_FILE: DB_FILE, PORT: String(PORT),
    SEED_DEMO: '1', DISABLE_RATE_LIMIT: '1', GEOCODER: 'fixture', SMTP_HOST: '',
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
    setTimeout(() => { try { fs.unlinkSync(DB_FILE); } catch { /* */ } }, 500);
  };

  try {
    if (!(await waitFor(`http://localhost:${PORT}/health`))) { process.stdout.write(log); fail('server boot'); }
    ok('server up');

    // 1. Register a customer (legacy tenant — no subdomain).
    const email = `cust-${process.pid}@example.test`;
    const reg = await jr('POST', '/customer/auth/register', {
      firstName: 'Cust', lastName: 'Omer', email,
      phoneNumber: '+2348010000000', password: 'CustomerPass2026!',
    });
    assert(reg.status === 201 || reg.status === 200, `register → ${reg.status}`);
    const token = reg.data?.data?.tokens?.accessToken;
    assert(!!token, 'register returns an access token');
    const auth = { Authorization: `Bearer ${token}` };

    // 2. Wallet starts empty, then top up ₦2000.
    const w0 = await jr('GET', '/wallet', undefined, auth);
    assert(w0.status === 200, `GET /wallet → ${w0.status}`);
    const startBal = Number(w0.data?.data?.balance ?? 0);
    ok(`starting wallet balance = ₦${startBal}`);

    const topup = await jr('POST', '/wallet/top-up', { amount: 2000 }, auth);
    assert(topup.status === 200, `top-up → ${topup.status}`);
    const afterTopup = Number(topup.data?.data?.balance ?? 0);
    assert(afterTopup === startBal + 2000, `wallet credited to ₦${afterTopup} (was ₦${startBal})`);

    // 3. Upload a PDF + create the job, paying from wallet.
    const fd = new FormData();
    fd.set('file', new Blob([tinyPdf()], { type: 'application/pdf' }), 'document.pdf');
    fd.set('paymentMethod', 'wallet');
    fd.set('printConfiguration', JSON.stringify({
      copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300,
    }));
    const createRes = await fetch(`${B}/customer/print-jobs`, {
      method: 'POST', headers: { ...auth }, body: fd,
    });
    const create = await createRes.json().catch(() => null);
    if (createRes.status !== 201) process.stdout.write(`create body: ${JSON.stringify(create)}\n`);
    assert(createRes.status === 201, `create+pay print job → ${createRes.status}`);
    const job = create?.data?.job;
    assert(!!job, 'job returned');
    const code = job.code;
    assert(typeof code === 'string' && code.length === 6, `received a 6-char release code (${code})`);
    assert(['rendering', 'ready', 'pending'].includes(String(job.status).toLowerCase()), `job status is ${job.status}`);

    // 4. Wallet debited by the job cost.
    const w1 = await jr('GET', '/wallet', undefined, auth);
    const endBal = Number(w1.data?.data?.balance ?? 0);
    assert(endBal < afterTopup, `wallet debited: ₦${afterTopup} → ₦${endBal} (cost ₦${afterTopup - endBal})`);

    // 5. The job shows in the customer's job list with the code.
    const jobs = await jr('GET', '/customer/print-jobs', undefined, auth);
    assert(jobs.status === 200, `GET /print-jobs → ${jobs.status}`);
    const list = jobs.data?.data?.jobs ?? jobs.data?.data ?? jobs.data?.jobs ?? [];
    assert(Array.isArray(list) && list.some((j) => j.code === code), 'job appears in the customer job list');

    process.stdout.write('\nALL CUSTOMER REVENUE-PATH CHECKS PASSED\n');
    cleanup();
    process.exit(0);
  } catch (err) {
    process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write('\n--- server log (tail) ---\n' + log.slice(-3000) + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
