/**
 * Render-worker callback gate (V2-41) — "does printing actually work".
 *
 * Proves the worker → API callback wiring index.ts gained: the (mock)
 * pipeline runs and fires postRenderSuccess, and the callback arrives
 * HMAC-SHA256-signed with RENDER_CALLBACK_SECRET over the raw body —
 * verified here exactly as routes/render.routes.ts does on the API.
 *
 * Runs the REAL worker units (RenderPipeline.mock + postRenderSuccess)
 * via a tsx harness, no BullMQ/Redis needed — so it's deterministic and
 * CI-portable. The backend half (callback → PrintJob status flip) is
 * covered by 01-backend/tests/render-pipeline.test.ts.
 *
 * Note on Redis: the live BullMQ consumer needs Redis >= 5.0. A common
 * Windows dev box ships Redis 3.x (BullMQ refuses it). docker-compose
 * provides Redis 7 for the real boot; this gate intentionally doesn't
 * depend on the BullMQ layer (bullmq's own tested code).
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');

const SECRET = 'render-worker-e2e-secret';
const CB_PORT = 5000 + Math.floor(Math.random() * 4000);
const PRINT_JOB_ID = `e2e-job-${process.pid}`;

function ok(m) { process.stdout.write(`ok   ${m}\n`); }
function fail(m) { process.stdout.write(`FAIL: ${m}\n`); process.exit(1); }
function assert(c, m) { c ? ok(m) : fail(m); }

async function main() {
  // Capture server standing in for the PrintLoop API. Verifies the HMAC
  // signature exactly like routes/render.routes.ts does.
  let captured = null;
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const sig = req.headers['x-render-signature'] || '';
      const expected = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
      let body = null;
      try { body = JSON.parse(raw.toString('utf8')); } catch { /* */ }
      captured = { path: req.url, sigOk: sig === expected, body };
      res.statusCode = 200;
      res.end(JSON.stringify({ success: true }));
    });
  });
  await new Promise((r) => server.listen(CB_PORT, r));
  ok(`capture API up on :${CB_PORT}`);

  // Run the real worker units (mock pipeline → postRenderSuccess) via tsx.
  const workerDir = path.resolve(__dirname, '..');
  const harness = spawn('npx', ['tsx', 'scripts/_fireOnce.ts'], {
    cwd: workerDir,
    env: {
      ...process.env,
      PRINTLOOP_API_URL: `http://localhost:${CB_PORT}`,
      RENDER_CALLBACK_SECRET: SECRET,
      E2E_PRINT_JOB_ID: PRINT_JOB_ID,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  let hlog = '';
  harness.stdout.on('data', (c) => (hlog += c.toString()));
  harness.stderr.on('data', (c) => (hlog += c.toString()));

  const cleanup = () => { try { server.close(); } catch { /* */ } };

  try {
    // Wait for the harness to fire + the callback to land.
    const waitStart = Date.now();
    while (!captured && Date.now() - waitStart < 30_000) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!captured) {
      process.stdout.write('\n--- harness log ---\n' + hlog + '\n');
    }
    assert(!!captured, 'API received the render callback');
    assert(captured.path === '/api/render/callback', `callback hit /api/render/callback (got ${captured && captured.path})`);
    assert(captured.sigOk, 'callback HMAC-SHA256 signature verifies against RENDER_CALLBACK_SECRET');
    assert(captured.body && captured.body.printJobId === PRINT_JOB_ID, 'callback carries the right printJobId');
    assert(captured.body && typeof captured.body.pageCount === 'number' && captured.body.pageCount > 0, `callback carries pageCount (got ${captured.body && captured.body.pageCount})`);
    assert(captured.body && typeof captured.body.renderedKey === 'string', 'callback carries renderedKey');
    assert(Array.isArray(captured.body.previewImageUrls), 'callback carries previewImageUrls[] (unified shape)');

    process.stdout.write('\nALL RENDER-WORKER E2E CHECKS PASSED\n');
    cleanup();
    process.exit(0);
  } catch (err) {
    process.stdout.write(`uncaught: ${err && err.stack ? err.stack : err}\n`);
    cleanup();
    process.exit(1);
  }
}

main();
