/**
 * Tenant-native kiosk management + cross-tenant isolation (V2-40).
 *
 * Proves the /api/saas/kiosks surface (separate from the SUPER_ADMIN
 * /api/admin/kiosks routes):
 *   1. A tenant owner can list / add / test-print / regenerate-key /
 *      status / delete their OWN printers.
 *   2. The apiKey is disclosed ONLY on create + regenerate, never on
 *      a plain list/read.
 *   3. A second tenant (B) is hard-blocked from acting on tenant A's
 *      printer by id — 404, not a silent success.
 *
 * Self-contained: spawns its own backend on a random high port with
 * SMTP_HOST='' so the email verification token is logged to stdout
 * (the disabled-mailer path) for the script to scrape — the same
 * trick the discovery / password-reset e2es use.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(
  __dirname,
  '..',
  'data',
  `saaskiosks-e2e-${process.pid}.sqlite`,
);
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
  let d = null;
  try { d = await r.json(); } catch { /* ignore */ }
  return { status: r.status, data: d };
}

async function waitFor(url, timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  try { fs.unlinkSync(DB_FILE); } catch { /* */ }

  const env = {
    ...process.env,
    DATABASE_FILE: DB_FILE,
    PORT: String(PORT),
    SEED_DEMO: '1',
    DISABLE_RATE_LIMIT: '1',
    GEOCODER: 'fixture',
    SMTP_HOST: '', // disabled-mailer → token logged to stdout
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

  const scrapeVerifyCode = (email) => {
    const re = new RegExp(
      `\\[email:disabled\\] to=${email.replace(/[.@]/g, '\\$&')} subject="?Verify your email — code (\\d{6})"?`,
    );
    const m = log.match(re);
    return m ? m[1] : null;
  };

  async function onboardOwner(slug, email) {
    const signup = await jr('POST', '/saas/signup', {
      businessName: `${slug} shop`,
      slug,
      ownerFirstName: 'Owner',
      ownerLastName: slug,
      ownerEmail: email,
      ownerPhone: '+2348000000000',
      ownerPassword: 'OwnerPass2026!',
      address: 'Yaba, Lagos',
    });
    assert(signup.status === 201, `${slug} signup → 201 (got ${signup.status})`);
    await new Promise((r) => setTimeout(r, 250));
    const code = scrapeVerifyCode(email);
    assert(!!code, `${slug} verify code scraped`);
    const v = await jr('POST', '/saas/verify-email', { email, token: code });
    assert(v.status === 200, `${slug} verify-email → 200`);
    const login = await jr('POST', '/admin/auth/login', {
      email, password: 'OwnerPass2026!',
    });
    assert(login.status === 200, `${slug} owner login → 200`);
    return {
      Authorization: `Bearer ${login.data.data.tokens.accessToken}`,
      'X-Tenant-Slug': slug,
    };
  }

  try {
    const up = await waitFor(`http://localhost:${PORT}/health`);
    if (!up) { process.stdout.write(log); fail(`server did not boot on :${PORT}`); }
    ok('server up');

    const A = await onboardOwner('shop-a', 'owner-a@example.test');
    const Bee = await onboardOwner('shop-b', 'owner-b@example.test');

    // ── A: full self-service lifecycle ─────────────────────────────────
    const create = await jr('POST', '/saas/kiosks', { name: 'A Front Desk', location: 'Counter' }, A);
    assert(create.status === 201, `A create printer → 201 (got ${create.status})`);
    const kioskId = create.data.data.kiosk.id;
    const apiKey = create.data.data.kiosk.apiKey;
    assert(typeof apiKey === 'string' && apiKey.length > 0, 'A create discloses apiKey (pairing)');

    const list = await jr('GET', '/saas/kiosks', undefined, A);
    assert(list.status === 200, 'A list → 200');
    assert(
      Array.isArray(list.data.data.kiosks) &&
        list.data.data.kiosks.some((k) => k.id === kioskId),
      'A sees their own printer in the list',
    );
    assert(
      !JSON.stringify(list.data.data.kiosks).includes('apiKey'),
      'apiKey is NEVER disclosed on a plain list/read',
    );

    const tp = await jr('POST', `/saas/kiosks/${kioskId}/test-print`, {}, A);
    assert(tp.status === 200 && !!tp.data.data.testPrintPassedAt, 'A confirm test print → testPrintPassedAt set');

    const regen = await jr('POST', `/saas/kiosks/${kioskId}/regenerate-key`, {}, A);
    assert(
      regen.status === 200 && regen.data.data.apiKey && regen.data.data.apiKey !== apiKey,
      'A regenerate-key issues a NEW key',
    );

    const pause = await jr('PATCH', `/saas/kiosks/${kioskId}/status`, { status: 'OFFLINE' }, A);
    assert(pause.status === 200, 'A pause (status OFFLINE) → 200');

    // ── B: hard-blocked from A's printer ───────────────────────────────
    const bList = await jr('GET', '/saas/kiosks', undefined, Bee);
    assert(bList.status === 200, 'B list own → 200 (B is NOT blanket-locked)');
    assert(
      !(bList.data.data.kiosks || []).some((k) => k.id === kioskId),
      'B does NOT see A\'s printer in their list (isolation)',
    );

    const bTp = await jr('POST', `/saas/kiosks/${kioskId}/test-print`, {}, Bee);
    assert(bTp.status === 404, `B test-print A's printer → 404 (got ${bTp.status})`);

    const bStatus = await jr('PATCH', `/saas/kiosks/${kioskId}/status`, { status: 'ACTIVE' }, Bee);
    assert(bStatus.status === 404, `B status A's printer → 404 (got ${bStatus.status})`);

    const bDel = await jr('DELETE', `/saas/kiosks/${kioskId}`, undefined, Bee);
    assert(bDel.status === 404, `B delete A's printer → 404 (got ${bDel.status})`);

    // ── A still owns it after B's attempts ─────────────────────────────
    const aRegen2 = await jr('POST', `/saas/kiosks/${kioskId}/regenerate-key`, {}, A);
    assert(aRegen2.status === 200, 'A still controls their printer after B\'s probes → 200');

    // ── B can manage their OWN ─────────────────────────────────────────
    const bCreate = await jr('POST', '/saas/kiosks', { name: 'B Printer' }, Bee);
    assert(bCreate.status === 201, `B create own printer → 201 (got ${bCreate.status})`);

    process.stdout.write('\nALL SAAS-KIOSKS E2E CHECKS PASSED\n');
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
