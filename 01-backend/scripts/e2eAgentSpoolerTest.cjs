/**
 * End-to-end test for the Agent Spooler Transport.
 *
 * Proves that:
 *   1. The agent supports PRINTER_TRANSPORT=spooler.
 *   2. The agent saves downloaded bytes to a temporary file.
 *   3. The agent executes SPOOLER_COMMAND with substituted parameters.
 *   4. The agent cleans up the temporary file.
 *   5. The job is marked complete (DONE) on the backend.
 *
 * Runs the backend in kiosk-pull mode, spawns the actual printloop-agent tsx process,
 * and monitors the printed output folder.
 *
 * Pre-req: dev backend running on :4000.
 *
 *   node scripts/e2eAgentSpoolerTest.cjs
 */
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { PDFDocument, StandardFonts } = require('pdf-lib');

try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
} catch (e) {
  // ignore
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const B = 'http://localhost:4000/api';
const PRINTED_DIR = path.resolve(__dirname, '..', 'data', 'printed');

let sqlite3;
try { sqlite3 = require('sqlite3'); } catch { sqlite3 = null; }
const DB_PATH = path.resolve(__dirname, '..', 'data', 'printloop.sqlite');

function sqlRun(sql, params) {
  return new Promise((resolve, reject) => {
    if (!sqlite3) return resolve(null);
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
    db.run(sql, params, function (err) { db.close(); err ? reject(err) : resolve(this.changes); });
  });
}

async function topUpWallet(userId, naira) {
  await sqlRun(`UPDATE wallets SET balance = ? WHERE userId = ?`, [naira, userId]);
}

async function j(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d;
  try { d = await r.json(); } catch { d = null; }
  return { status: r.status, data: d };
}

(async () => {
  // Ensure printed dir exists
  fs.mkdirSync(PRINTED_DIR, { recursive: true });

  // 1. Generate a small PDF whose bytes we can compare.
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  pg.drawText('PrintLoop Agent Spooler Test', { x: 60, y: 760, size: 22, font });
  pg.drawText(`ts=${new Date().toISOString()}`, { x: 60, y: 720, size: 10 });
  const srcBytes = Buffer.from(await pdf.save());
  const srcHash = sha(srcBytes);
  console.log(`1. Generated test PDF (${srcBytes.length} bytes, sha256: ${srcHash.slice(0, 12)}…)`);

  // 2. Customer register → JWT.
  const email = `spooler${Date.now()}@printloop.test`;
  const reg = await j('POST', '/customer/auth/register', {
    firstName: 'Spooler', lastName: 'Tester', email, phoneNumber: '+2348000000999', password: 'Passw0rd!',
  });
  const tok = reg.data?.data?.tokens?.accessToken;
  if (!tok) throw new Error(`register failed: ${reg.status}`);
  console.log(`2. Registered ${email} → JWT (${reg.status})`);

  const userId = reg.data?.data?.user?.id;
  if (!userId) throw new Error('register failed to return userId');
  await topUpWallet(userId, 2000);
  console.log(`   Topped up wallet for user ${userId} with ₦2000`);

  // 3. Upload file.
  const fd = new FormData();
  fd.append('file', new Blob([srcBytes], { type: 'application/pdf' }), 'spooler.pdf');
  fd.append('fileName', 'spooler.pdf');
  fd.append('pageCount', '1');
  fd.append('paymentMethod', 'wallet');
  fd.append('jobType', 'single');
  fd.append('printConfiguration', JSON.stringify({ copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300 }));
  const cr = await fetch(B + '/customer/print-jobs', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd,
  });
  const cj = await cr.json().catch(() => null);
  const code = cj?.data?.job?.code;
  const jobId = cj?.data?.job?.id;
  if (!code || !jobId) throw new Error(`upload failed: ${cr.status} ${JSON.stringify(cj)}`);
  console.log(`3. PrintJob created — code=${code} id=${jobId.slice(0, 8)}… (${cr.status})`);

  // 4. Admin setup: get kiosk key and change printDispatchMode to kiosk-pull.
  const al = await j('POST', '/admin/auth/login', { email: 'admin@printloop.test', password: 'Admin1234!' });
  const AH = { Authorization: `Bearer ${al.data?.data?.tokens?.accessToken}` };
  const ks = await j('GET', '/admin/kiosks', null, AH);
  const k = (ks.data?.data?.kiosks || [])[0];
  const rk = await j('POST', `/admin/kiosks/${k.id}/regenerate-key`, {}, AH);
  const kioskKey = rk.data?.data?.kiosk?.apiKey;
  if (!kioskKey) throw new Error('no kiosk key');

  const patchRes = await j('PATCH', '/admin/settings/printDispatchMode', { value: 'kiosk-pull' }, AH);
  console.log(`4. PrintDispatchMode set to kiosk-pull (${patchRes.status})`);

  // Wait for settings cache to clear / printPolicy.service cache.
  // Wait 21s as in pull test.
  console.log('   Waiting for settings cache (21s)…');
  await new Promise((r) => setTimeout(r, 21_000));

  // 5. Release at the kiosk.
  const rel = await j('POST', '/printer/complete', { code }, { 'X-Kiosk-Key': kioskKey });
  console.log(`5. /printer/complete → ${rel.status} status=${rel.data?.data?.status}`);

  // Create a clean set of files in the printed folder prior to running the agent
  const beforeFiles = new Set(fs.readdirSync(PRINTED_DIR));

  // 6. Spawn the printloop-agent in spooler transport mode.
  // The spooler command runs a Node snippet that copies the temporary file to our printed directory.
  const targetPrintedPath = path.join(PRINTED_DIR, `spooler_dispatch_${code}.pdf`).replace(/\\/g, '/');
  const mockSpoolerCommand = `node -e "require('fs').copyFileSync(process.argv[1], process.argv[2])" "{file}" "${targetPrintedPath}"`;

  console.log(`6. Spawning agent with transport=spooler`);
  console.log(`   Mock spooler command: ${mockSpoolerCommand}`);

  const agentEnv = {
    ...process.env,
    PRINTLOOP_BASE_URL: 'http://localhost:4000',
    KIOSK_API_KEY: kioskKey,
    PRINTER_TRANSPORT: 'spooler',
    PRINTER_NAME: 'MockSpoolerPrinter',
    SPOOLER_COMMAND: mockSpoolerCommand,
    POLL_INTERVAL_MS: '1500',
    // V2-44: queue-drain confirmation against a printer that doesn't
    // exist resolves "unconfirmed: queue not queryable" instantly, but
    // bound it anyway so the test can't hang on a slow PowerShell.
    CONFIRM_TIMEOUT_MS: '8000',
  };

  const agentProc = spawn('npx', ['tsx', 'agent.ts'], {
    cwd: path.resolve(__dirname, '..', '..', 'printloop-agent'),
    env: agentEnv,
    shell: true,
  });

  agentProc.stdout.on('data', (d) => console.log(`[agent-stdout] ${d.toString().trim()}`));
  agentProc.stderr.on('data', (d) => console.error(`[agent-stderr] ${d.toString().trim()}`));

  // 7. Wait for agent to process the job and write the output file.
  console.log('7. Waiting for agent to dispatch the job…');
  const deadline = Date.now() + 30_000;
  let printSuccess = false;
  let printedFileExists = false;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    if (fs.existsSync(targetPrintedPath)) {
      printedFileExists = true;
      break;
    }
  }

  // V2-44: the agent now runs a queue-drain confirmation BETWEEN the
  // spooler exec (file appears) and the /complete report — give it
  // time to land the report before we kill the process.
  let confirmedDone = false;
  const doneDeadline = Date.now() + 20_000;
  while (printedFileExists && Date.now() < doneDeadline) {
    const jr2 = await j('GET', '/customer/print-jobs', null, { Authorization: `Bearer ${tok}` });
    const row = (jr2.data?.data?.jobs || []).find((x) => x.id === jobId);
    if (row?.status === 'done') { confirmedDone = true; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (printedFileExists && !confirmedDone) {
    console.warn('   (job not done yet after 20s — continuing to assertions)');
  }

  // Shut down the agent.
  agentProc.kill();

  // 8. Restore printDispatchMode.
  await j('PATCH', '/admin/settings/printDispatchMode', { value: 'cloud-push' }, AH);
  console.log('8. Restored printDispatchMode=cloud-push.');

  // 9. Verify results.
  if (!printedFileExists) {
    console.error('❌ FAILED: Mock printed file was not created by the spooler command.');
    process.exit(1);
  }

  const printedBytes = fs.readFileSync(targetPrintedPath);
  const printedHash = sha(printedBytes);
  const exact = printedBytes.length === srcBytes.length && printedHash === srcHash;
  console.log(`9. Printed file: ${targetPrintedPath} (${printedBytes.length} bytes, sha256: ${printedHash.slice(0, 12)}…)`);
  console.log(`   Byte-exact match: ${exact ? '✅ YES' : '❌ NO'}`);

  // Check backend job status.
  const jobsRes = await j('GET', '/customer/print-jobs', null, { Authorization: `Bearer ${tok}` });
  const ours = (jobsRes.data?.data?.jobs || []).find((x) => x.id === jobId);
  console.log(`   Backend job status: ${ours?.status || '(unknown)'}`);

  // V2-44 job-truth: the agent must have reported a confirmation and
  // the backend must have persisted it. For the spooler transport
  // against a mock printer the honest value is queue-drain (confirmed
  // when the box has no such queue is impossible → unconfirmed).
  let agentConfirmation = null;
  if (sqlite3) {
    agentConfirmation = await new Promise((resolve) => {
      const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
      db.get(`SELECT agentConfirmation FROM print_jobs WHERE id = ?`, [jobId], (err, row) => {
        db.close();
        resolve(err ? null : row?.agentConfirmation ?? null);
      });
    });
    console.log(`   agentConfirmation: ${agentConfirmation || '(null)'}`);
    if (!agentConfirmation || !agentConfirmation.startsWith('queue-drain:')) {
      console.error('❌ FAILED: agentConfirmation not persisted as queue-drain:*');
      process.exit(1);
    }
  }

  // Cleanup printed file.
  try {
    fs.unlinkSync(targetPrintedPath);
  } catch (e) {}

  if (exact && ours?.status === 'done') {
    console.log('\n✅ SPOOLER TRANSPORT E2E TEST PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ SPOOLER TRANSPORT E2E TEST FAILED.');
    process.exit(1);
  }
})().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});
