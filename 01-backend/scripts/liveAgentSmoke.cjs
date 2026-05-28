/**
 * Live smoke test for the kiosk-pull pipeline END-TO-END:
 *   real customer upload → kiosk POST /printer/complete → agent
 *   claims → agent dispatches to printer → bytes hit data/printed.
 *
 *   node scripts/liveAgentSmoke.cjs
 *
 * Pre-reqs (already true in this session):
 *   • dev backend on :4000
 *   • printDispatchMode = kiosk-pull
 *   • virtualPrinter on :6310 (or real printer; agent's .env decides)
 *   • printloop-agent running, configured to dispatch to that printer
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const B = 'http://localhost:4000/api';
const PRINTED = path.resolve(__dirname, '..', 'data', 'printed');

async function j(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d; try { d = await r.json(); } catch { d = null; }
  return { status: r.status, data: d };
}

(async () => {
  // 1. PDF.
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage([595, 842]);
  const f = await pdf.embedFont(StandardFonts.HelveticaBold);
  pg.drawText('PrintLoop — live agent smoke', { x: 60, y: 760, size: 22, font: f });
  pg.drawText(`ts=${new Date().toISOString()}`, { x: 60, y: 720, size: 10 });
  const bytes = Buffer.from(await pdf.save());
  const srcHash = sha(bytes);
  console.log(`1. PDF ${bytes.length}B sha ${srcHash.slice(0, 12)}…`);

  // 2. Register a customer.
  const email = `live${Date.now()}@printloop.test`;
  const reg = await j('POST', '/customer/auth/register', {
    firstName: 'Live', lastName: 'Smoke', email, phoneNumber: '+2348000000125', password: 'Passw0rd!',
  });
  const tok = reg.data?.data?.tokens?.accessToken;
  console.log(`2. Registered ${email} (${reg.status})`);

  // 3. Upload.
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: 'application/pdf' }), 'live.pdf');
  fd.append('fileName', 'live.pdf');
  fd.append('pageCount', '1');
  fd.append('paymentMethod', 'wallet');
  fd.append('jobType', 'single');
  fd.append('printConfiguration', JSON.stringify({ copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300 }));
  const cr = await fetch(B + '/customer/print-jobs', { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd });
  const cj = await cr.json().catch(() => null);
  const code = cj?.data?.job?.code;
  const jobId = cj?.data?.job?.id;
  if (!code) throw new Error(`upload failed: ${cr.status} ${JSON.stringify(cj)}`);
  console.log(`3. Job code=${code} cost=₦${cj?.data?.job?.cost} (${cr.status})`);

  // 4. Admin: get kiosk key.
  const al = await j('POST', '/admin/auth/login', { email: 'admin@printloop.test', password: 'Admin1234!' });
  const AH = { Authorization: `Bearer ${al.data?.data?.tokens?.accessToken}` };
  const ks = await j('GET', '/admin/kiosks', null, AH);
  const k = (ks.data?.data?.kiosks || [])[0];
  // Read the current key (do NOT regenerate — would invalidate the running agent).
  const detail = await j('GET', `/admin/kiosks/${k.id}`, null, AH);
  const kioskKey = detail.data?.data?.kiosk?.apiKey;
  console.log(`4. Kiosk ${k.name}, current key=${kioskKey ? kioskKey.slice(0, 12) + '…' : '(redacted — use a regen)'}`);

  // 5. Kiosk hits /printer/complete — should mark RELEASING (kiosk-pull).
  if (!kioskKey) {
    console.log('   ⚠ kiosk key not exposed by GET — falling back to env or skipping the POST.');
    console.log('   Tip: regenerate from the admin and pass via KIOSK_API_KEY env.');
  }
  const envKey = process.env.KIOSK_API_KEY || kioskKey;
  const before = new Set(fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []);
  const rel = await j('POST', '/printer/complete', { code }, { 'X-Kiosk-Key': envKey });
  console.log(`5. /printer/complete → ${rel.status}  mode=${rel.data?.data?.mode}  status=${rel.data?.data?.status}`);

  // 6. Poll for agent to do its work. Agent polls every 3s, then needs
  //    a beat for the IPP dispatch + virtual printer to write the file.
  console.log('6. Waiting for the agent to pick it up + dispatch…');
  const deadline = Date.now() + 30_000;
  let fresh = [];
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    fresh = (fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []).filter((x) => !before.has(x));
    if (fresh.length) break;
  }
  if (!fresh.length) {
    console.log('   ❌ Nothing showed up in data/printed/ within 30s.');
    process.exit(1);
  }
  const fp = path.join(PRINTED, fresh[0]);
  const got = fs.readFileSync(fp);
  const exact = got.length === bytes.length && sha(got) === srcHash;
  console.log(`7. ${fresh[0]}  ${got.length}B sha ${sha(got).slice(0, 12)}…`);
  console.log(exact ? '8. ✅ LIVE AGENT DISPATCH — BYTE-EXACT through agent → IPP → virtual printer' : '8. ❌ bytes did not match');

  // 9. Final state should be DONE (or PRINTING if the agent's /complete
  //    POST hasn't returned yet).
  const final = await j('GET', `/customer/print-jobs`, null, { Authorization: `Bearer ${tok}` });
  const ours = (final.data?.data?.jobs || []).find((x) => x.code === code);
  console.log(`9. Job ${code} status = ${ours?.status || '(unknown)'}`);
})().catch((e) => { console.error('Smoke error:', e); process.exit(1); });
