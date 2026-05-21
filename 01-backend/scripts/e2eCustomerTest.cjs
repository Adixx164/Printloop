/* Real CUSTOMER flow: register → JWT → multipart upload → kiosk → byte-exact. */
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
  let d;
  try { d = await r.json(); } catch { d = null; }
  return { status: r.status, data: d };
}

(async () => {
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage([595, 842]);
  const f = await pdf.embedFont(StandardFonts.HelveticaBold);
  pg.drawText('PrintLoop CUSTOMER e2e', { x: 60, y: 760, size: 22, font: f });
  pg.drawText(new Date().toISOString(), { x: 60, y: 720, size: 10 });
  const bytes = Buffer.from(await pdf.save());
  const srcHash = sha(bytes);
  console.log(`1. PDF ${bytes.length}B sha ${srcHash.slice(0, 12)}…`);

  // 2. Real customer registration → JWT
  const email = `cust${Date.now()}@printloop.test`;
  const reg = await j('POST', '/customer/auth/register', {
    firstName: 'Real', lastName: 'Customer', email, phoneNumber: '+2348000000123', password: 'Passw0rd!',
  });
  const tok = reg.data?.data?.tokens?.accessToken;
  console.log(`2. Registered ${email} → JWT ${tok ? tok.slice(0, 14) + '…' : 'NONE'} (${reg.status})`);

  // 3. Multipart upload to the REAL customer endpoint
  const fd = new FormData();
  fd.append('file', new Blob([bytes], { type: 'application/pdf' }), 'customer.pdf');
  fd.append('fileName', 'customer.pdf');
  fd.append('pageCount', '1');
  fd.append('paymentMethod', 'wallet');
  fd.append('jobType', 'single');
  fd.append('printConfiguration', JSON.stringify({ copies: 1, paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300 }));
  const cr = await fetch(B + '/customer/print-jobs', {
    method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd,
  });
  const cj = await cr.json().catch(() => null);
  const code = cj?.data?.job?.code;
  console.log(`3. Real PrintJob created — code=${code} cost=₦${cj?.data?.job?.cost} (${cr.status})`);

  // 4. Confirm it shows in the customer's real job list
  const list = await j('GET', '/customer/print-jobs', null, { Authorization: `Bearer ${tok}` });
  const mine = (list.data?.data?.jobs || []).some((x) => x.code === code);
  console.log(`4. GET /customer/print-jobs contains it: ${mine}`);

  // 5. Admin: aim a kiosk at the virtual printer
  const al = await j('POST', '/admin/auth/login', { email: 'admin@printloop.test', password: 'Admin1234!' });
  const AH = { Authorization: `Bearer ${al.data?.data?.tokens?.accessToken}` };
  const ks = await j('GET', '/admin/kiosks', null, AH);
  const k = (ks.data?.data?.kiosks || [])[0];
  await j('PATCH', `/admin/kiosks/${k.id}`, { ipAddress: '127.0.0.1' }, AH);
  const rk = await j('POST', `/admin/kiosks/${k.id}/regenerate-key`, {}, AH);
  const kioskKey = rk.data?.data?.kiosk?.apiKey;
  await j('PATCH', '/admin/settings/ippPort', { value: '6310' }, AH);
  await j('PATCH', '/admin/settings/ippSecure', { value: 'false' }, AH);
  console.log(`5. Kiosk "${k.name}" → 127.0.0.1, key ${kioskKey ? kioskKey.slice(0, 10) + '…' : 'NONE'}`);

  // 6. Release at the kiosk
  const before = new Set(fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []);
  const rel = await j('POST', '/printer/complete', { code }, { 'X-Kiosk-Key': kioskKey });
  console.log(`6. /printer/complete → ${rel.status} transport=${rel.data?.data?.transport} mock=${rel.data?.data?.mock}`);

  await new Promise((r) => setTimeout(r, 1500));
  const fresh = (fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []).filter((x) => !before.has(x));
  if (fresh.length) {
    const got = fs.readFileSync(path.join(PRINTED, fresh[0]));
    const exact = got.length === bytes.length && sha(got) === srcHash;
    console.log(`7. PRINTED ${fresh[0]} (${got.length}B, validPDF=${got.subarray(0, 5).toString() === '%PDF-'})`);
    console.log(exact ? `8. ✅ BYTE-EXACT customer flow (${sha(got).slice(0, 12)}…)` : `8. ❌ NOT byte-exact`);
  } else {
    console.log('7. ❌ Nothing printed — check vprinter.');
  }
})().catch((e) => { console.error('E2E error:', e); process.exit(1); });
