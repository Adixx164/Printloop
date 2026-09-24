/**
 * Tenant-owner self-serve end-to-end (V2-33).
 *
 * V2-32's polish e2e found that the freshly-signed-up tenant owner
 * couldn't manage their own kiosks — `signupTenant` was stamping
 * `adminPrivileges: []`, so the RBAC middleware blocked every
 * MANAGE_* call. The polish test worked around it with SUPER_ADMIN +
 * X-Tenant-Slug; this one DOES NOT — it only ever uses the tenant
 * owner's token. If any of these calls 403s, V2-33 regressed.
 *
 * Flow (every call as the owner, no platform admin):
 *   1. Sign up → 201
 *   2. Verify email (token scraped from log)
 *   3. Owner logs in
 *   4. Owner creates a kiosk → 201
 *   5. Owner edits the kiosk → 200
 *   6. Owner regenerates the kiosk API key → 200
 *   7. Owner stamps test-print-pass → 200
 *   8. Owner reads /api/saas/me → 200 (the saas/me path doesn't
 *      need the Permission grant — tenant membership is enough —
 *      but we sanity-check the tenant-membership path too)
 *
 * Platform admin is invoked ONCE, to reactivate the tenant from
 * TRIAL to ACTIVE — that's a SUPER_ADMIN action by design (tenants
 * don't self-activate from trial).
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
  `tenantowner-e2e-${process.pid}.sqlite`,
);
const SERVER = path.resolve(__dirname, '..', 'server.ts');

function ok(msg) {
  process.stdout.write(`ok   ${msg}\n`);
}
function fail(msg) {
  process.stdout.write(`FAIL: ${msg}\n`);
  process.exit(1);
}
function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

async function jr(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = null;
  try {
    d = await r.json();
  } catch {
    /* ignore */
  }
  return { status: r.status, data: d };
}

async function waitFor(url, timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  try {
    fs.unlinkSync(DB_FILE);
  } catch {
    /* ok */
  }

  const env = {
    ...process.env,
    DATABASE_FILE: DB_FILE,
    PORT: String(PORT),
    SEED_DEMO: '1',
    DISABLE_RATE_LIMIT: '1',
    GEOCODER: 'fixture',
    SMTP_HOST: '',
    JWT_SECRET: 'self-serve-e2e-signing-secret-32!',
  };

  const server = spawn('npx', ['tsx', SERVER], {
    env,
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  let serverLog = '';
  server.stdout.on('data', (c) => (serverLog += c.toString()));
  server.stderr.on('data', (c) => (serverLog += c.toString()));

  const cleanup = () => {
    try {
      server.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        fs.unlinkSync(DB_FILE);
      } catch {
        /* ignore */
      }
    }, 500);
  };

  try {
    const up = await waitFor(`http://localhost:${PORT}/health`);
    if (!up) {
      process.stdout.write(serverLog);
      fail(`server failed to come up on :${PORT}`);
    }
    ok('server up on test port');

    // 1) Sign up.
    const signup = await jr('POST', '/saas/signup', {
      businessName: 'Self Serve Shop',
      slug: 'self-serve-shop',
      ownerFirstName: 'Self',
      ownerLastName: 'Owner',
      ownerEmail: 'owner-selfserve@example.test',
      ownerPhone: '+2348011111119',
      ownerPassword: 'TenantOwner2026!',
      address: 'Yaba, Lagos',
    });
    assert(signup.status === 201, `signup → 201 (got ${signup.status})`);
    const tenantId = signup.data.data.tenantId;

    // 2) Scrape + verify email.
    await new Promise((r) => setTimeout(r, 300));
    const m = serverLog.match(
      /\[email:disabled\] to=owner-selfserve@example\.test subject="?Verify your email — code (\d{6})"?/,
    );
    assert(m && m[1], 'verify token logged');
    const verify = await jr('POST', '/saas/verify-email', {
      email: 'owner-selfserve@example.test',
      token: m[1],
    });
    assert(verify.status === 200, `verify → 200 (got ${verify.status})`);

    // 3) Owner login.
    const login = await jr('POST', '/admin/auth/login', {
      email: 'owner-selfserve@example.test',
      password: 'TenantOwner2026!',
    });
    assert(login.status === 200, 'owner login → 200');
    const ownerAuth = {
      Authorization: `Bearer ${login.data.data.tokens.accessToken}`,
      'X-Tenant-Slug': 'self-serve-shop',
    };

    // Sanity: the JWT carries adminPrivileges so the RBAC layer can
    // gate without a DB read on every request. Confirm role + a key
    // privilege round-trip through the login response.
    const ownerUser = login.data.data.user;
    assert(ownerUser.role === 'admin', `owner role=admin (got ${ownerUser.role})`);
    assert(
      Array.isArray(ownerUser.adminPrivileges) &&
        ownerUser.adminPrivileges.includes('manage_kiosks'),
      `owner has manage_kiosks privilege (V2-33 fix)`,
    );

    // 4) Owner reactivates themselves? No — that's a SUPER_ADMIN
    //    path by design. Use the platform admin ONCE to flip status.
    const platformLogin = await jr('POST', '/admin/auth/login', {
      email: 'admin@printloop.test',
      password: 'Admin1234!',
    });
    const platformAuth = {
      Authorization: `Bearer ${platformLogin.data.data.tokens.accessToken}`,
    };
    const react = await jr(
      'POST',
      `/platform/tenants/${tenantId}/reactivate`,
      {},
      platformAuth,
    );
    assert(react.status === 200, `platform reactivate → 200`);

    // 5) Owner creates a kiosk. THE CRITICAL ASSERTION — was 403
    //    before V2-33.
    const create = await jr(
      'POST',
      '/admin/kiosks',
      {
        name: 'Owner Self-Serve Kiosk',
        location: 'Yaba',
        printerName: 'HP LaserJet Pro',
      },
      ownerAuth,
    );
    assert(create.status === 201 || create.status === 200, `owner CREATES kiosk → 200/201 (got ${create.status})`);
    const kioskId = create.data?.data?.kiosk?.id;
    const apiKey = create.data?.data?.kiosk?.apiKey;
    assert(typeof kioskId === 'string', 'kiosk id returned');

    // 6) Owner edits the kiosk.
    const patch = await jr(
      'PATCH',
      `/admin/kiosks/${kioskId}`,
      { location: 'Yaba — Updated', printerModel: 'HP LaserJet Pro M404n' },
      ownerAuth,
    );
    assert(patch.status === 200, `owner EDITS kiosk → 200 (got ${patch.status})`);

    // 7) Owner regenerates the API key. Capture the new value —
    // the old `apiKey` we kept from step 5 is no longer valid.
    const regen = await jr(
      'POST',
      `/admin/kiosks/${kioskId}/regenerate-key`,
      {},
      ownerAuth,
    );
    assert(regen.status === 200, `owner regen API key → 200 (got ${regen.status})`);
    const rotatedKey =
      regen.data?.data?.apiKey ||
      regen.data?.data?.kiosk?.apiKey ||
      regen.data?.apiKey;
    assert(
      typeof rotatedKey === 'string' && rotatedKey !== apiKey,
      'regen returns a NEW apiKey (different from create)',
    );

    // 8) Owner marks test-print-pass.
    const mark = await jr(
      'POST',
      `/admin/kiosks/${kioskId}/test-print-pass`,
      {},
      ownerAuth,
    );
    assert(mark.status === 200, `owner marks test-print-pass → 200 (got ${mark.status})`);

    // 9) Owner reads /api/saas/me (tenant-membership path).
    const me = await jr('GET', '/saas/me', undefined, ownerAuth);
    assert(me.status === 200, `owner GET /saas/me → 200 (got ${me.status})`);
    assert(
      me.data.data.slug === 'self-serve-shop',
      'me returns the right slug',
    );

    // 10) Owner can flip isDiscoverable once the rest of the live
    //     gate is met. We've got: lat/lng (signup geocoded),
    //     status=ACTIVE (platform reactivate), testPrintPassedAt
    //     (just stamped), online kiosk (need a heartbeat). The
    //     kiosk hasn't heartbeated yet — apiKey we have, use it.
    const beat = await fetch(`http://localhost:${PORT}/api/printer/heartbeat`, {
      headers: { 'X-Kiosk-Key': rotatedKey },
    });
    assert(beat.status === 200, `kiosk heartbeat (with rotated key) → 200 (got ${beat.status})`);

    const flip = await jr(
      'PATCH',
      '/saas/me/location',
      { isDiscoverable: true },
      ownerAuth,
    );
    assert(
      flip.status === 200 && flip.data.data.isDiscoverable === true,
      `owner self-flips isDiscoverable=true (got ${flip.status})`,
    );

    process.stdout.write('\nALL TENANT OWNER SELF-SERVE CHECKS PASSED\n');
    cleanup();
    process.exit(0);
  } catch (err) {
    process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
    process.stdout.write('\n--- server log (tail) ---\n' + serverLog.slice(-4000) + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
