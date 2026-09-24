/**
 * createSuperAdmin CLI — end-to-end (V2-27).
 *
 * Self-contained: spawns its own API on a unique port + temp SQLite
 * file with SEED_DEMO unset, then proves the full bootstrap loop:
 *
 *   1. With SEED_DEMO unset on a fresh DB, the legacy demo accounts
 *      (admin@printloop.test / Admin1234!) DO NOT EXIST — the seed
 *      gate from V2-27 is honoured.
 *   2. createSuperAdmin.ts mints a new SUPER_ADMIN.
 *   3. Login with the minted account succeeds and reports
 *      role=super_admin.
 *   4. Re-running the CLI with the same email is idempotent (exit 0,
 *      "already a SUPER_ADMIN").
 *   5. Re-running with --reset-password rotates the password; the old
 *      password no longer works, the new one does.
 *
 * Runs without external setup — kill the backend on exit. CI invokes
 * this through .github/workflows/ci.yml's backend-e2e job.
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Random high port — see e2eDiscoveryTest.cjs for the Windows
// shell:true / leftover-server rationale.
const PORT = 5000 + Math.floor(Math.random() * 4000);
const B = `http://localhost:${PORT}/api`;
const DB_FILE = path.resolve(
  __dirname,
  '..',
  'data',
  `cli-e2e-${process.pid}.sqlite`,
);
// We invoke tsx via npx so the resolver picks up both Unix
// (node_modules/.bin/tsx) and Windows (node_modules/.bin/tsx.cmd)
// shims without us having to branch on os.platform().
const CLI = path.resolve(__dirname, 'createSuperAdmin.ts');
const SERVER = path.resolve(__dirname, '..', 'server.ts');

const EMAIL = 'cli-e2e@example.com';
const PW1 = 'FirstPassword2026!';
const PW2 = 'RotatedPassword2027!';

function log(line) {
  process.stdout.write(line + '\n');
}
function ok(msg) {
  log(`ok   ${msg}`);
}
function fail(msg) {
  log(`FAIL: ${msg}`);
  process.exit(1);
}
function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

async function jr(method, url, body) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
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

function runCli(args) {
  // Inherit DATABASE_FILE so the CLI hits the same DB the server is
  // running against. SEED_DEMO is deliberately NOT set.
  const env = { ...process.env, DATABASE_FILE: DB_FILE };
  env.SEED_DEMO = '0';
  const res = spawnSync('npx', ['tsx', CLI, ...args], {
    env,
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..'),
    shell: true,
  });
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
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
  // Fresh DB. The server will create the schema + legacy tenant on
  // boot; no demo data because SEED_DEMO is unset.
  try {
    fs.unlinkSync(DB_FILE);
  } catch {
    /* ok if it doesn't exist */
  }

  const serverEnv = { ...process.env, DATABASE_FILE: DB_FILE, PORT: String(PORT) };
  serverEnv.SEED_DEMO = '0';
  const server = spawn('npx', ['tsx', SERVER], {
    env: serverEnv,
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
      fail(`server failed to come up on :${PORT} within timeout`);
    }
    ok('server up on test port');

    // 1) SEED_DEMO unset → seeded demo admin must NOT work.
    const demoLogin = await jr('POST', '/admin/auth/login', {
      email: 'admin@printloop.test',
      password: 'Admin1234!',
    });
    assert(
      demoLogin.status === 401 || demoLogin.status === 400,
      `seeded demo admin login is rejected when SEED_DEMO unset (got ${demoLogin.status})`,
    );

    // 2) Mint a new SUPER_ADMIN with the CLI.
    const create = runCli([EMAIL, PW1, '--first-name=Cli', '--last-name=E2E']);
    if (create.code !== 0) {
      process.stdout.write(create.stdout);
      process.stderr.write(create.stderr);
      fail(`createSuperAdmin first run exit ${create.code}`);
    }
    ok('CLI first run: exit 0');
    assert(
      /Created:/.test(create.stdout),
      'CLI first run reports "Created"',
    );
    assert(
      /Linked as OWNER/.test(create.stdout),
      'CLI first run links as OWNER of legacy tenant',
    );

    // 3) Login with the new account.
    const login1 = await jr('POST', '/admin/auth/login', {
      email: EMAIL,
      password: PW1,
    });
    assert(login1.status === 200, `login with minted account → 200 (got ${login1.status})`);
    assert(
      login1.data &&
        login1.data.data &&
        login1.data.data.user &&
        login1.data.data.user.role === 'super_admin',
      'minted account has role=super_admin',
    );

    // 4) Idempotency — running the same command again is a no-op,
    //    exits 0, says "already a SUPER_ADMIN".
    const create2 = runCli([EMAIL, PW1]);
    assert(create2.code === 0, `CLI re-run idempotent (exit ${create2.code})`);
    assert(
      /already a SUPER_ADMIN/.test(create2.stdout),
      'CLI re-run reports "already a SUPER_ADMIN"',
    );

    // 5) Rotate the password. Old PW1 must stop working; new PW2 must work.
    const rotate = runCli([EMAIL, PW2, '--reset-password']);
    assert(rotate.code === 0, `CLI --reset-password (exit ${rotate.code})`);
    assert(
      /password rotated/.test(rotate.stdout),
      'CLI --reset-password reports "password rotated"',
    );

    const loginOld = await jr('POST', '/admin/auth/login', {
      email: EMAIL,
      password: PW1,
    });
    assert(
      loginOld.status === 401 || loginOld.status === 400,
      `old password rejected after rotate (got ${loginOld.status})`,
    );
    const loginNew = await jr('POST', '/admin/auth/login', {
      email: EMAIL,
      password: PW2,
    });
    assert(loginNew.status === 200, `new password works after rotate (got ${loginNew.status})`);

    log('\nALL createSuperAdmin CLI E2E CHECKS PASSED');
    cleanup();
    process.exit(0);
  } catch (err) {
    log(`uncaught: ${err && err.stack ? err.stack : err}`);
    process.stdout.write('\n--- server log ---\n' + serverLog + '\n');
    cleanup();
    process.exit(1);
  }
}

main();
