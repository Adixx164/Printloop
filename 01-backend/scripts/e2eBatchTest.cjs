/* Real BATCH: 2 files → ONE code → kiosk prints both byte-exact. */
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
async function mkPdf(label) {
  const p = await PDFDocument.create();
  const pg = p.addPage([595, 842]);
  const f = await p.embedFont(StandardFonts.HelveticaBold);
  pg.drawText(label, { x: 60, y: 760, size: 20, font: f });
  pg.drawText(new Date().toISOString(), { x: 60, y: 720, size: 10 });
  return Buffer.from(await p.save());
}

(async () => {
  const a = await mkPdf('BATCH DOC A');
  const b = await mkPdf('BATCH DOC B — different content');
  const want = new Set([sha(a), sha(b)]);
  console.log(`1. 2 PDFs — A ${a.length}B/${sha(a).slice(0,10)}  B ${b.length}B/${sha(b).slice(0,10)}`);

  const email = `batch${Date.now()}@printloop.test`;
  const reg = await j('POST', '/customer/auth/register', { firstName: 'Batch', lastName: 'User', email, phoneNumber: '+2348000000999', password: 'Passw0rd!' });
  const tok = reg.data?.data?.tokens?.accessToken;
  console.log(`2. Registered → JWT ${tok ? 'ok' : 'NONE'}`);

  const fd = new FormData();
  fd.append('files', new Blob([a], { type: 'application/pdf' }), 'docA.pdf');
  fd.append('files', new Blob([b], { type: 'application/pdf' }), 'docB.pdf');
  fd.append('items', JSON.stringify([
    { fileName: 'docA.pdf', pageCount: 1, printConfiguration: { copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300 } },
    { fileName: 'docB.pdf', pageCount: 1, printConfiguration: { copies: 1, paper: 'A4', color: 'color', sided: 'double', qualityDpi: 600 } },
  ]));
  fd.append('collate', 'true');
  fd.append('paymentMethod', 'wallet');
  const cr = await fetch(B + '/customer/print-jobs/batch', { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd });
  const cj = await cr.json().catch(() => null);
  const code = cj?.data?.job?.code;
  console.log(`3. ONE batch code=${code} items=${cj?.data?.job?.items} cost=₦${cj?.data?.job?.cost} (${cr.status})`);

  const al = await j('POST', '/admin/auth/login', { email: 'admin@printloop.test', password: 'Admin1234!' });
  const AH = { Authorization: `Bearer ${al.data?.data?.tokens?.accessToken}` };
  const ks = await j('GET', '/admin/kiosks', null, AH);
  const k = (ks.data?.data?.kiosks || [])[0];
  await j('PATCH', `/admin/kiosks/${k.id}`, { ipAddress: '127.0.0.1' }, AH);
  const rk = await j('POST', `/admin/kiosks/${k.id}/regenerate-key`, {}, AH);
  const kioskKey = rk.data?.data?.kiosk?.apiKey;
  await j('PATCH', '/admin/settings/ippPort', { value: '6310' }, AH);
  await j('PATCH', '/admin/settings/ippSecure', { value: 'false' }, AH);
  console.log(`4. Kiosk "${k.name}" → 127.0.0.1`);

  const before = new Set(fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []);
  const rel = await j('POST', '/printer/complete', { code }, { 'X-Kiosk-Key': kioskKey });
  console.log(`5. /printer/complete → ${rel.status} batch=${rel.data?.data?.batch} printed=${rel.data?.data?.printed}/${rel.data?.data?.total} transport=${rel.data?.data?.transport}`);

  await new Promise((r) => setTimeout(r, 1800));
  const fresh = (fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []).filter((x) => !before.has(x));
  const hashes = fresh.map((x) => sha(fs.readFileSync(path.join(PRINTED, x))));
  const bothExact = fresh.length === 2 && hashes.every((h) => want.has(h)) && new Set(hashes).size === 2;
  console.log(`6. ${fresh.length} files printed: ${fresh.join(', ')}`);
  console.log(bothExact ? '7. ✅ BOTH documents BYTE-EXACT under ONE code' : `7. ❌ mismatch — got ${hashes.map((h)=>h.slice(0,10))}`);
})().catch((e) => { console.error('E2E error:', e); process.exit(1); });
