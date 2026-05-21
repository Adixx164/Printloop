/* CUPS-ingress end-to-end:
 *   1. register a real customer + mint a print token
 *   2. POST /api/cups/print with no/bad token → 401
 *   3. POST /api/cups/print with good token + a real PDF → 200 + code
 *   4. the new code shows up in the customer's job list
 *   5. point a kiosk at the virtual printer, release the code, assert
 *      the printed bytes are byte-exact sha256 of the original PDF
 *
 * Proves the CUPS path lands in the same kiosk pipeline as the web app.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const B = 'http://localhost:4000/api';
const PRINTED = path.resolve(__dirname, '..', 'data', 'printed');

async function jr(method, url, body, headers) {
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
  // 1. Make a small one-page PDF (we'll need byte-exact later).
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage([595, 842]);
  const f = await pdf.embedFont(StandardFonts.HelveticaBold);
  pg.drawText('PrintLoop CUPS e2e', { x: 60, y: 760, size: 22, font: f });
  pg.drawText(new Date().toISOString(), { x: 60, y: 720, size: 10 });
  const bytes = Buffer.from(await pdf.save());
  const srcHash = sha(bytes);
  console.log(`1. PDF ${bytes.length}B sha ${srcHash.slice(0, 12)}…`);

  // 2. Real customer registration → JWT.
  const email = `cups${Date.now()}@printloop.test`;
  const reg = await jr('POST', '/customer/auth/register', {
    firstName: 'Cups',
    lastName: 'User',
    email,
    phoneNumber: '+2348000000321',
    password: 'Passw0rd!',
  });
  const tok = reg.data?.data?.tokens?.accessToken;
  if (!tok) {
    console.error('FAIL — registration did not return accessToken');
    console.error(JSON.stringify(reg, null, 2));
    process.exit(1);
  }
  console.log(`2. Registered ${email} → JWT ${tok.slice(0, 14)}… (${reg.status})`);

  // 3. Rotate a print token.
  const rotate = await jr('POST', '/customer/print-token/rotate', {}, {
    Authorization: `Bearer ${tok}`,
  });
  const printToken = rotate.data?.data?.token;
  if (!printToken) {
    console.error('FAIL — rotate did not return a token');
    console.error(JSON.stringify(rotate, null, 2));
    process.exit(1);
  }
  console.log(`3. printToken ${printToken.slice(0, 12)}… (${rotate.status})`);

  // helper — build the CUPS multipart body
  const cupsForm = (filename = 'cups.pdf') => {
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
    fd.append('title', 'CUPS e2e doc');
    fd.append('copies', '2');
    fd.append(
      'options',
      'media=A4 sides=two-sided-long-edge print-color-mode=color print-quality=4 copies=2',
    );
    return fd;
  };

  // 4. No token → 401
  let r = await fetch(B + '/cups/print', { method: 'POST', body: cupsForm() });
  console.log(`4. no token → ${r.status} (expect 401) ${r.status === 401 ? 'PASS' : 'FAIL'}`);

  // 5. Bad token → 401
  r = await fetch(B + '/cups/print', {
    method: 'POST',
    headers: { Authorization: 'Bearer garbage-nope-not-a-real-token' },
    body: cupsForm(),
  });
  console.log(`5. bad token → ${r.status} (expect 401) ${r.status === 401 ? 'PASS' : 'FAIL'}`);

  // 6. Good token → 200 + a fresh release code
  r = await fetch(B + '/cups/print', {
    method: 'POST',
    headers: { Authorization: `Bearer ${printToken}` },
    body: cupsForm(),
  });
  const body = await r.json().catch(() => null);
  const code = body?.data?.code;
  const cfg = body?.data?.config || {};
  console.log(`6. good token → ${r.status} code=${code} cost=₦${body?.data?.cost} pages=${body?.data?.pages}`);
  const cfgOk =
    cfg.paper === 'A4' && cfg.sided === 'double' && cfg.color === 'color' && cfg.copies === 2;
  console.log(`   parsed CUPS opts paper=${cfg.paper} sided=${cfg.sided} color=${cfg.color} copies=${cfg.copies} ${cfgOk ? 'PASS' : 'FAIL'}`);
  // 1 page · 2 copies · ₦25/pg color · 0.85 duplex · 1.0 quality = 42.5 → 43
  const expectCost = Math.max(5, Math.round(1 * 2 * 25 * 0.85 * 1));
  console.log(`   cost ₦${body?.data?.cost} (expect ₦${expectCost}) ${body?.data?.cost === expectCost ? 'PASS' : 'FAIL'}`);

  // 7. The code is in the customer's job list (status=ready)
  const list = await jr('GET', '/customer/print-jobs', null, { Authorization: `Bearer ${tok}` });
  const mine = (list.data?.data?.jobs || []).find((x) => x.code === code);
  console.log(`7. list contains code=${code}: ${!!mine} status=${mine?.status ?? '—'} ${mine && mine.status === 'ready' ? 'PASS' : 'FAIL'}`);

  // 8. Admin: aim kiosk at the virtual printer + release the code
  const al = await jr('POST', '/admin/auth/login', {
    email: 'admin@printloop.test',
    password: 'Admin1234!',
  });
  const AH = { Authorization: `Bearer ${al.data?.data?.tokens?.accessToken}` };
  const ks = await jr('GET', '/admin/kiosks', null, AH);
  const k = (ks.data?.data?.kiosks || [])[0];
  await jr('PATCH', `/admin/kiosks/${k.id}`, { ipAddress: '127.0.0.1' }, AH);
  const rk = await jr('POST', `/admin/kiosks/${k.id}/regenerate-key`, {}, AH);
  const kioskKey = rk.data?.data?.kiosk?.apiKey;
  await jr('PATCH', '/admin/settings/ippPort', { value: '6310' }, AH);
  await jr('PATCH', '/admin/settings/ippSecure', { value: 'false' }, AH);
  console.log(`8. Kiosk "${k.name}" → 127.0.0.1, key ${kioskKey ? kioskKey.slice(0, 10) + '…' : 'NONE'}`);

  const before = new Set(fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []);
  const rel = await jr('POST', '/printer/complete', { code }, { 'X-Kiosk-Key': kioskKey });
  console.log(`9. /printer/complete → ${rel.status} transport=${rel.data?.data?.transport} mock=${rel.data?.data?.mock}`);
  await new Promise((r2) => setTimeout(r2, 1500));
  const fresh = (fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []).filter((x) => !before.has(x));
  if (!fresh.length) {
    console.error('FAIL — no new file appeared in data/printed/');
    process.exit(1);
  }
  const got = fs.readFileSync(path.join(PRINTED, fresh[0]));
  const gotHash = sha(got);
  console.log(`10. PRINTED ${fresh[0]} (${got.length}B, sha ${gotHash.slice(0, 12)}…)`);
  if (gotHash === srcHash) {
    console.log('11. ✅ BYTE-EXACT CUPS → kiosk → virtual-printer path');
  } else {
    console.error('11. ❌ HASH MISMATCH — the CUPS path mutated the bytes somewhere');
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
