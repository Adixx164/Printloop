/**
 * End-to-end: kiosk-pull architecture.
 *
 * Proves the new agent-pull pipeline:
 *   customer upload (READY) → /printer/complete (RELEASING) →
 *   /agent/jobs/ready (visible) → /agent/start (PRINTING) →
 *   /agent/file (byte-exact download) → /agent/complete (DONE)
 *
 * Unlike e2ePrintTest / e2eCustomerTest this does NOT need
 * virtualPrinter.cjs — the agent is the thing doing dispatch, and
 * we're testing the cloud half of the contract. The agent's own
 * IPP/raw-9100 dispatch is the same code as the backend's, already
 * exercised by the other tests.
 *
 * Pre-req: dev backend running on :4000.
 *
 *   node scripts/e2eAgentPullTest.cjs
 */
const crypto = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const B = 'http://localhost:4000/api';

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

async function fetchBytes(url, headers) {
  const r = await fetch(url, { headers: headers || {} });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get('content-type') };
}

(async () => {
  // 1. Generate a small PDF whose bytes we can compare end-to-end.
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  pg.drawText('PrintLoop AGENT-PULL e2e', { x: 60, y: 760, size: 22, font });
  pg.drawText(`ts=${new Date().toISOString()}`, { x: 60, y: 720, size: 10 });
  const srcBytes = Buffer.from(await pdf.save());
  const srcHash = sha(srcBytes);
  console.log(`1. PDF ${srcBytes.length}B sha ${srcHash.slice(0, 12)}…`);

  // 2. Customer register → JWT.
  const email = `pull${Date.now()}@printloop.test`;
  const reg = await j('POST', '/customer/auth/register', {
    firstName: 'Pull', lastName: 'Tester', email, phoneNumber: '+2348000000124', password: 'Passw0rd!',
  });
  const tok = reg.data?.data?.tokens?.accessToken;
  if (!tok) throw new Error(`register failed: ${reg.status}`);
  console.log(`2. Registered ${email} → JWT (${reg.status})`);

  // 3. Multipart upload (real customer single-file path).
  const fd = new FormData();
  fd.append('file', new Blob([srcBytes], { type: 'application/pdf' }), 'pull.pdf');
  fd.append('fileName', 'pull.pdf');
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

  // 4. Admin: ensure a kiosk + flip printDispatchMode to kiosk-pull.
  const al = await j('POST', '/admin/auth/login', { email: 'admin@printloop.test', password: 'Admin1234!' });
  const AH = { Authorization: `Bearer ${al.data?.data?.tokens?.accessToken}` };
  const ks = await j('GET', '/admin/kiosks', null, AH);
  const k = (ks.data?.data?.kiosks || [])[0];
  const rk = await j('POST', `/admin/kiosks/${k.id}/regenerate-key`, {}, AH);
  const kioskKey = rk.data?.data?.kiosk?.apiKey;
  if (!kioskKey) throw new Error('no kiosk key');
  // Switch to kiosk-pull mode for this test, restore at the end.
  await j('PATCH', '/admin/settings/printDispatchMode', { value: 'kiosk-pull' }, AH);
  console.log(`4. Kiosk "${k.name}" key=${kioskKey.slice(0, 10)}…, printDispatchMode=kiosk-pull`);

  // Wait for settings cache TTL (printPolicy.service caches for 20s).
  // For the test we don't want to sleep 20s, so the FIRST call after
  // the PATCH may still see 'cloud-push' — restart the backend or wait.
  // Cheaper: poll the agent endpoint until it sees the job, with a
  // longer ceiling that accommodates the cache.
  await new Promise((r) => setTimeout(r, 21_000));

  // 5. Release at the kiosk — should mark RELEASING, NOT dispatch.
  const rel = await j('POST', '/printer/complete', { code }, { 'X-Kiosk-Key': kioskKey });
  console.log(`5. /printer/complete → ${rel.status} mode=${rel.data?.data?.mode} status=${rel.data?.data?.status}`);
  if (rel.status !== 200 || rel.data?.data?.status !== 'releasing') {
    console.log('   ❌ Expected status=releasing in kiosk-pull mode.');
  }

  // 6. Agent polls /jobs/ready.
  const ready = await j('GET', '/agent/jobs/ready', null, { 'X-Kiosk-Key': kioskKey });
  const jobs = ready.data?.data?.jobs || [];
  const ours = jobs.find((x) => x.id === jobId);
  console.log(`6. /agent/jobs/ready → ${ready.status}  jobs=${jobs.length}  has-our-job=${!!ours}`);
  if (!ours) {
    console.log('   ❌ Our job not in the ready list.');
    // Try restoring mode and exit.
    await j('PATCH', '/admin/settings/printDispatchMode', { value: 'cloud-push' }, AH);
    process.exit(1);
  }
  const item = ours.items?.[0];
  console.log(`   item.fileName=${item?.fileName} downloadUrl?=${!!item?.downloadUrl}`);

  // 7. Agent claims the job atomically.
  const claim = await j('POST', `/agent/jobs/${ours.id}/start`, {}, { 'X-Kiosk-Key': kioskKey });
  console.log(`7. /agent/start → ${claim.status}`);

  // 8. Agent downloads bytes via signed URL — byte-exact?
  const dl = await fetchBytes(item.downloadUrl);
  const dlHash = sha(dl.bytes);
  const exact = dl.bytes.length === srcBytes.length && dlHash === srcHash;
  console.log(`8. download ${dl.bytes.length}B sha ${dlHash.slice(0, 12)}…  ${exact ? '✅ BYTE-EXACT' : '❌ MISMATCH'}`);

  // 9. Agent reports complete.
  const done = await j('POST', `/agent/jobs/${ours.id}/complete`, {}, { 'X-Kiosk-Key': kioskKey });
  console.log(`9. /agent/complete → ${done.status} success=${done.data?.success}`);

  // 10. Race-claim check: a SECOND /start must 409, not 200.
  const race = await j('POST', `/agent/jobs/${ours.id}/start`, {}, { 'X-Kiosk-Key': kioskKey });
  console.log(`10. second /agent/start → ${race.status}  ${race.status === 409 ? '✅ correctly rejected' : '❌ expected 409'}`);

  // 11. Restore the setting so other tests don't pick up kiosk-pull mode.
  await j('PATCH', '/admin/settings/printDispatchMode', { value: 'cloud-push' }, AH);
  console.log('11. Restored printDispatchMode=cloud-push.');

  console.log('');
  console.log(exact && claim.status === 200 && done.status === 200 && race.status === 409
    ? '✅ KIOSK-PULL e2e PASSED'
    : '❌ KIOSK-PULL e2e FAILED — review output above.');
})().catch((e) => { console.error('E2E error:', e); process.exit(1); });
