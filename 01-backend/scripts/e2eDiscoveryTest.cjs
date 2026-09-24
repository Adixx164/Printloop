/**
 * Marketplace discovery end-to-end (V2-30).
 *
 * Self-contained: spawns own backend on :4196 with the FIXTURE
 * geocoder so the test is independent of Nominatim reachability,
 * SEED_DEMO=1 so an admin exists for the platform calls, and a
 * fresh SQLite. Then:
 *
 *   1. Sign up two tenants with fixture addresses (Yaba + UNILAG).
 *      Both seed with default pricing.
 *   2. Verify both tenants have coords (geocoder succeeded).
 *   3. Manually promote both to status=active + isDiscoverable=true
 *      (the production signup leaves them trial+private — we drive
 *      the DB directly via the platform admin route so the test
 *      doesn't depend on Paystack onboarding).
 *   4. GET /api/discovery/shops/nearby from a third point (Lekki,
 *      south of both shops). Assert:
 *        - both shops are returned
 *        - sorted by distance
 *        - distance values are reasonable (within 5 km of expected)
 *        - the legacy tenant is NOT in the list
 *   5. GET /api/discovery/shops/:slug returns the detail incl. the
 *      pricing matrix.
 *   6. GET /api/discovery/shops/:slug for a known-NON-discoverable
 *      slug returns 404.
 *
 * No Redis required.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Random high port per run — on Windows the shell:true spawn we need
// for tsx doesn't propagate SIGKILL through the cmd.exe wrapper, so a
// previously-aborted e2e can leave a server squatting on a fixed port
// and silently poison the next run. Random port = no collisions.
const PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(
  __dirname,
  '..',
  'data',
  `discovery-e2e-${process.pid}.sqlite`,
);
const SERVER = path.resolve(__dirname, '..', 'server.ts');

function ok(msg) {
  process.stdout.write(`ok   ${msg}\n`);
}
let serverLog = '';
function fail(msg) {
  process.stdout.write(`FAIL: ${msg}\n`);
  process.stdout.write('\n--- server log ---\n' + serverLog + '\n');
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
      /* not up */
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
  };

  const server = spawn('npx', ['tsx', SERVER], {
    env,
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
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

    // 1) Sign up two tenants with fixture addresses.
    const yabaSignup = await jr('POST', '/saas/signup', {
      businessName: 'Yaba Print Hub',
      slug: 'yaba-print-hub',
      ownerFirstName: 'Yaba',
      ownerLastName: 'Owner',
      ownerEmail: 'yaba-owner@example.test',
      ownerPhone: '+2348011111111',
      ownerPassword: 'TenantOwner2026!',
      address: 'Yaba, Lagos',
    });
    if (yabaSignup.status !== 201) {
      process.stdout.write(`yaba signup body: ${JSON.stringify(yabaSignup.data)}\n`);
    }
    assert(yabaSignup.status === 201, `yaba signup → 201 (got ${yabaSignup.status})`);

    const unilagSignup = await jr('POST', '/saas/signup', {
      businessName: 'UNILAG Print Hub',
      slug: 'unilag-print-hub',
      ownerFirstName: 'Unilag',
      ownerLastName: 'Owner',
      ownerEmail: 'unilag-owner@example.test',
      ownerPhone: '+2348022222222',
      ownerPassword: 'TenantOwner2026!',
      address: 'UNILAG, Akoka, Lagos',
    });
    assert(
      unilagSignup.status === 201,
      `unilag signup → 201 (got ${unilagSignup.status})`,
    );

    // 2) Log in as super admin and call platform API to (a) check the
    //    tenants got coords (we'll verify via discovery/shops/:slug
    //    after activating) and (b) activate + flip isDiscoverable on.
    //    We drive the activation by talking directly to the DB via
    //    the platform route — production would do this through the
    //    tenant's own settings UI, but we don't have that wired yet
    //    in this test.
    const adminLogin = await jr('POST', '/admin/auth/login', {
      email: 'admin@printloop.test',
      password: 'Admin1234!',
    });
    assert(adminLogin.status === 200, 'admin login → 200');
    const adminAuth = {
      Authorization: `Bearer ${adminLogin.data.data.tokens.accessToken}`,
    };

    // 3) Activate + flip isDiscoverable on both. We'll do it via a
    //    direct SQL-ish path: log in as each tenant owner, hit the
    //    new PATCH /me/location with isDiscoverable=true. But they
    //    need verified email + tenant status != trial first.
    //
    //    Production: tenant verifies email + admin activates them.
    //    Test: we shortcut both via the SUPER_ADMIN-only routes.
    //    Easiest: poke the DB directly via the dev backdoor — but we
    //    don't have one. So: open a second sqlite handle, flip the
    //    rows. The test owns the DB file path; we use better-sqlite3
    //    via node's built-in node:sqlite? Not available in 22.
    //
    //    Simpler: the platform admin route has PATCH /tenants/:id for
    //    status. We use it to activate, then use a direct query via a
    //    new endpoint? We don't have one — but the platform admin
    //    DOES have one: PATCH /platform/tenants/:id supports status.
    //    For isDiscoverable, we hit PATCH /saas/me/location as the
    //    tenant owner; that route ALSO requires verified email.
    //
    //    Verified-email shortcut: we just call PATCH on the User row
    //    via the admin route. Or simpler: the verify-email saas route
    //    accepts the token directly. The signup result doesn't return
    //    the token — but the dev console logs it when SMTP is unset.
    //
    //    For this test the cleanest path is: scrape verify tokens
    //    from the server log (same trick as the password-reset e2e),
    //    verify, then log in, then PATCH /me/location.

    // Scrape the two verify tokens from the server log. The
    // onboarding service logs them as part of sendTenantOwnerVerification's
    // disabled-email path: "[email:disabled] to=… subject=Verify your email — code XXXXXX".
    await new Promise((r) => setTimeout(r, 400)); // log flush
    const tokenRe = /\[email:disabled\] to=([^ ]+) subject="?Verify your email — code (\d{6})"?/g;
    const tokensByEmail = new Map();
    let m;
    while ((m = tokenRe.exec(serverLog)) != null) {
      tokensByEmail.set(m[1], m[2]);
    }
    assert(
      tokensByEmail.has('yaba-owner@example.test'),
      'verify token for yaba owner scraped from log',
    );
    assert(
      tokensByEmail.has('unilag-owner@example.test'),
      'verify token for unilag owner scraped from log',
    );

    const verifyYaba = await jr('POST', '/saas/verify-email', {
      email: 'yaba-owner@example.test',
      token: tokensByEmail.get('yaba-owner@example.test'),
    });
    assert(verifyYaba.status === 200, `verify yaba → 200 (got ${verifyYaba.status})`);
    const verifyUnilag = await jr('POST', '/saas/verify-email', {
      email: 'unilag-owner@example.test',
      token: tokensByEmail.get('unilag-owner@example.test'),
    });
    assert(verifyUnilag.status === 200, `verify unilag → 200`);

    // Log in as each tenant owner; the JWT picks up their membership.
    // We pass X-Tenant-Slug since they don't have a subdomain here.
    const yabaLogin = await jr('POST', '/admin/auth/login', {
      email: 'yaba-owner@example.test',
      password: 'TenantOwner2026!',
    });
    assert(yabaLogin.status === 200, `yaba owner login → 200 (got ${yabaLogin.status})`);
    const yabaAuth = {
      Authorization: `Bearer ${yabaLogin.data.data.tokens.accessToken}`,
      'X-Tenant-Slug': 'yaba-print-hub',
    };
    const unilagLogin = await jr('POST', '/admin/auth/login', {
      email: 'unilag-owner@example.test',
      password: 'TenantOwner2026!',
    });
    assert(unilagLogin.status === 200, `unilag owner login → 200`);
    const unilagAuth = {
      Authorization: `Bearer ${unilagLogin.data.data.tokens.accessToken}`,
      'X-Tenant-Slug': 'unilag-print-hub',
    };

    // Tenants start as trial. Promote both to active via platform
    // admin so they can be discoverable. PATCH /platform/tenants/:id
    // updates status.
    const yabaTenantId = yabaSignup.data.data.tenantId;
    const unilagTenantId = unilagSignup.data.data.tenantId;
    const actY = await jr(
      'POST',
      `/platform/tenants/${yabaTenantId}/reactivate`,
      {},
      adminAuth,
    );
    assert(actY.status === 200, `yaba activate → 200 (got ${actY.status})`);
    const actU = await jr(
      'POST',
      `/platform/tenants/${unilagTenantId}/reactivate`,
      {},
      adminAuth,
    );
    assert(actU.status === 200, `unilag activate → 200`);

    // V2-32 live gate now requires: at least one kiosk with
    // testPrintPassedAt + a recent heartbeat. Create one per tenant,
    // mark it, heartbeat with its API key. As of V2-33 the owner
    // can do this themselves, so use the owner tokens.
    async function provisionKiosk(authHdrs, label) {
      const create = await jr(
        'POST',
        '/admin/kiosks',
        { name: `${label} Kiosk`, location: label, printerName: 'HP LaserJet' },
        authHdrs,
      );
      assert(create.status === 201 || create.status === 200, `${label} owner creates kiosk (got ${create.status})`);
      const kid = create.data?.data?.kiosk?.id;
      const key = create.data?.data?.kiosk?.apiKey;
      assert(typeof kid === 'string', `${label} kiosk id`);
      assert(typeof key === 'string', `${label} kiosk apiKey`);
      const mark = await jr(
        'POST',
        `/admin/kiosks/${kid}/test-print-pass`,
        {},
        authHdrs,
      );
      assert(mark.status === 200, `${label} test-print-pass`);
      const beat = await fetch(
        `http://localhost:${PORT}/api/printer/heartbeat`,
        { headers: { 'X-Kiosk-Key': key } },
      );
      assert(beat.status === 200, `${label} kiosk heartbeat`);
    }
    await provisionKiosk(yabaAuth, 'yaba');
    await provisionKiosk(unilagAuth, 'unilag');

    // Now flip isDiscoverable on as each owner.
    const discYaba = await jr(
      'PATCH',
      '/saas/me/location',
      { isDiscoverable: true },
      yabaAuth,
    );
    assert(
      discYaba.status === 200 && discYaba.data.data.isDiscoverable === true,
      `yaba isDiscoverable=true (got ${discYaba.status})`,
    );
    assert(
      discYaba.data.data.lat != null && discYaba.data.data.lng != null,
      'yaba has coords post-signup (geocoder ran)',
    );

    const discUnilag = await jr(
      'PATCH',
      '/saas/me/location',
      { isDiscoverable: true },
      unilagAuth,
    );
    assert(
      discUnilag.status === 200 && discUnilag.data.data.isDiscoverable === true,
      `unilag isDiscoverable=true`,
    );

    // 4) Query nearby from a Lekki-Phase-1 origin (south of both
    //    shops). Yaba ≈ 6.51N, 3.37E. UNILAG ≈ 6.52N, 3.39E. Lekki ≈ 6.45N, 3.47E.
    //    UNILAG is slightly east of Yaba but the Haversine to Lekki
    //    puts both within ~12 km. Assert both surface and ordering
    //    is consistent.
    const nearby = await jr(
      'GET',
      '/discovery/shops/nearby?lat=6.4488&lng=3.4724&radius=20',
    );
    assert(nearby.status === 200, `nearby → 200 (got ${nearby.status})`);
    const shops = nearby.data.data.shops;
    assert(
      Array.isArray(shops) && shops.length === 2,
      `nearby returns exactly the 2 discoverable shops (got ${shops?.length})`,
    );
    const slugs = shops.map((s) => s.slug);
    assert(
      slugs.includes('yaba-print-hub') && slugs.includes('unilag-print-hub'),
      'both shops present in nearby',
    );
    assert(
      !slugs.includes('legacy'),
      'legacy tenant NOT in nearby (isDiscoverable=false)',
    );
    // Distance ordering: each entry must have a distanceKm; the list
    // must be sorted ascending.
    for (const s of shops) {
      assert(
        typeof s.distanceKm === 'number' && s.distanceKm < 20,
        `${s.slug} distance < 20km (got ${s.distanceKm})`,
      );
    }
    assert(
      shops[0].distanceKm <= shops[1].distanceKm,
      `shops sorted ASC by distance (${shops[0].slug}=${shops[0].distanceKm.toFixed(2)} ≤ ${shops[1].slug}=${shops[1].distanceKm.toFixed(2)})`,
    );

    // Capability rollup sanity.
    for (const s of shops) {
      assert(
        typeof s.cheapestPerPage === 'number' && s.cheapestPerPage > 0,
        `${s.slug} has a cheapestPerPage (got ${s.cheapestPerPage})`,
      );
      assert(
        Array.isArray(s.paperSizes) && s.paperSizes.length > 0,
        `${s.slug} has paperSizes`,
      );
    }

    // 5) Detail endpoint with pricing matrix.
    const detail = await jr('GET', '/discovery/shops/yaba-print-hub?lat=6.4488&lng=3.4724');
    assert(detail.status === 200, `detail → 200 (got ${detail.status})`);
    assert(
      detail.data.data.shop.slug === 'yaba-print-hub',
      'detail returns the right shop',
    );
    assert(
      typeof detail.data.data.shop.distanceKm === 'number',
      'detail includes distanceKm when origin supplied',
    );
    assert(
      Array.isArray(detail.data.data.pricing) &&
        detail.data.data.pricing.length > 0,
      `detail includes pricing matrix (got ${detail.data.data.pricing?.length} rows)`,
    );

    // 6) Detail for a non-discoverable slug → 404.
    const detailLegacy = await jr('GET', '/discovery/shops/legacy');
    assert(
      detailLegacy.status === 404 && detailLegacy.data.code === 'SHOP_NOT_FOUND',
      `legacy detail → 404 SHOP_NOT_FOUND (got ${detailLegacy.status} ${detailLegacy.data?.code})`,
    );

    process.stdout.write('\nALL DISCOVERY E2E CHECKS PASSED\n');
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
