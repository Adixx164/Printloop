/* End-to-end: real PDF → participant upload → kiosk release → virtual printer. */
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
  let data;
  try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
}

(async () => {
  // 1. Make a real 1-page PDF
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText('PrintLoop end-to-end test', { x: 60, y: 760, size: 22, font });
  page.drawText('If you can read this from data/printed, IPP works.', { x: 60, y: 720, size: 12 });
  page.drawText(new Date().toISOString(), { x: 60, y: 690, size: 10 });
  const pdfBytes = Buffer.from(await pdf.save());
  const b64 = pdfBytes.toString('base64');
  const srcHash = sha(pdfBytes);
  console.log(`1. Generated test PDF (${pdfBytes.length} bytes, sha256 ${srcHash.slice(0, 12)}…)`);

  // 2. Guest group session
  const deadline = new Date(Date.now() + 2 * 864e5).toISOString();
  const host = 'e2e-host-' + Date.now();
  const c = await j('POST', '/groups', { groupName: 'E2E Print', deadline, hostId: host, defaultOptions: { paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300, enforce: false } });
  const shareId = c.data?.data?.shareId;
  console.log(`2. Group created — shareId=${shareId}`);

  // 3. Join
  const jn = await j('POST', `/groups/${shareId}/join`, { name: 'E2E Tester', email: `e2e${Date.now()}@test.ng` });
  const uploadToken = jn.data?.data?.uploadToken;
  console.log(`3. Joined — uploadToken=${uploadToken ? uploadToken.slice(0, 12) + '…' : 'NONE'}`);

  // 4. Participant upload WITH REAL BYTES
  const up = await j('POST', '/participant-upload/upload', { fileBase64: b64, fileName: 'e2e-test.pdf', pageCount: 1 }, { 'X-Upload-Token': uploadToken });
  const code = up.data?.data?.printJob?.code;
  console.log(`4. Uploaded real PDF — printJob code=${code}  (${up.status})`);

  // 5. Admin: point a kiosk at the virtual printer + set IPP port
  const login = await j('POST', '/admin/auth/login', { email: 'admin@printloop.test', password: 'Admin1234!' });
  const tok = login.data?.data?.tokens?.accessToken;
  const AH = { Authorization: `Bearer ${tok}` };
  const ks = await j('GET', '/admin/kiosks', null, AH);
  const kiosk = (ks.data?.data?.kiosks || [])[0];
  await j('PATCH', `/admin/kiosks/${kiosk.id}`, { ipAddress: '127.0.0.1' }, AH);
  const rk = await j('POST', `/admin/kiosks/${kiosk.id}/regenerate-key`, {}, AH);
  const kioskKey = rk.data?.data?.kiosk?.apiKey;
  await j('PATCH', '/admin/settings/ippPort', { value: '6310' }, AH);
  await j('PATCH', '/admin/settings/ippSecure', { value: 'false' }, AH);
  console.log(`5. Kiosk "${kiosk.name}" → 127.0.0.1, key=${kioskKey ? kioskKey.slice(0, 10) + '…' : 'NONE'}, ippPort=6310`);

  // 6. Release to the (virtual) printer
  const before = new Set(fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []);
  const rel = await j('POST', '/printer/complete', { code }, { 'X-Kiosk-Key': kioskKey });
  console.log(`6. /printer/complete → ${rel.status}  transport=${rel.data?.data?.transport}  mock=${rel.data?.data?.mock}  msg="${rel.data?.message}"`);

  // 7. Did a document physically land in data/printed?
  await new Promise((r) => setTimeout(r, 1500));
  const after = fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : [];
  const fresh = after.filter((f) => !before.has(f));
  if (fresh.length) {
    const fp = path.join(PRINTED, fresh[0]);
    const got = fs.readFileSync(fp);
    const isPdf = got.subarray(0, 5).toString() === '%PDF-';
    const exact = got.length === pdfBytes.length && sha(got) === srcHash;
    console.log(
      `7. PRINTED → data/printed/${fresh[0]}  (${got.length} bytes, validPDF=${isPdf})`
    );
    console.log(
      exact
        ? `8. ✅ BYTE-EXACT — received sha256 matches source (${sha(got).slice(0, 12)}…)`
        : `8. ❌ NOT byte-exact — src ${pdfBytes.length}B/${srcHash.slice(0, 12)} vs got ${got.length}B/${sha(got).slice(0, 12)}`
    );
  } else {
    console.log('7. ❌ No new file in data/printed — check virtual printer log.');
  }
})().catch((e) => { console.error('E2E error:', e); process.exit(1); });
