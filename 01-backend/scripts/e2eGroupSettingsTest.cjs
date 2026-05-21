/* Group batch: two participants pick DIFFERENT settings → one batch code →
   kiosk prints both byte-exact, each with its own settings. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const sqlite3 = require('sqlite3');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const B = 'http://localhost:4000/api';
const PRINTED = path.resolve(__dirname, '..', 'data', 'printed');
const DB = path.resolve(__dirname, '..', 'data', 'printloop.sqlite');

async function j(method, url, body, headers) {
  const r = await fetch(B + url, {
    method, headers: { 'Content-Type': 'application/json', ...(headers || {}) },
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
const run = (db, sql, args) =>
  new Promise((res, rej) => db.run(sql, args, function (e) { e ? rej(e) : res(this.changes); }));

(async () => {
  const a = await mkPdf('GROUP P1 — Amina');
  const b = await mkPdf('GROUP P2 — Bola (different)');
  const want = new Set([sha(a), sha(b)]);
  console.log(`1. 2 PDFs — A ${a.length}B/${sha(a).slice(0,10)}  B ${b.length}B/${sha(b).slice(0,10)}`);

  // 2. Guest session, host does NOT enforce → participants choose their own
  const deadline = new Date(Date.now() + 2 * 864e5).toISOString();
  const host = 'grp-host-' + Date.now();
  const c = await j('POST', '/groups', {
    groupName: 'Settings Parity', deadline, hostId: host,
    defaultOptions: { paper: 'A4', color: 'bw', sided: 'single', qualityDpi: 300, enforce: false },
  });
  const shareId = c.data?.data?.shareId;
  const sessionId = c.data?.data?.session?.id;
  console.log(`2. Session shareId=${shareId}`);

  // 3. Two participants, different settings
  const join = async (name, email) => {
    const r = await j('POST', `/groups/${shareId}/join`, { name, email });
    return r.data?.data?.uploadToken;
  };
  const t1 = await join('Amina', `amina${Date.now()}@t.ng`);
  await j('POST', '/participant-upload/upload',
    { fileBase64: a.toString('base64'), fileName: 'amina.pdf', pageCount: 2,
      printConfiguration: { color: 'bw', sided: 'single', qualityDpi: 300, paper: 'A4' } },
    { 'X-Upload-Token': t1 });
  const t2 = await join('Bola', `bola${Date.now()}@t.ng`);
  await j('POST', '/participant-upload/upload',
    { fileBase64: b.toString('base64'), fileName: 'bola.pdf', pageCount: 3,
      printConfiguration: { color: 'color', sided: 'double', qualityDpi: 600, paper: 'A4' } },
    { 'X-Upload-Token': t2 });
  console.log('3. P1 bw/single, P2 color/double uploaded');

  // 4. Mark participants PAID (no guest-payment rail yet — test harness)
  const db = new sqlite3.Database(DB);
  const n = await run(db, "UPDATE group_participants SET status='PAID' WHERE groupSessionId=?", [sessionId]);
  db.close();
  console.log(`4. Marked ${n} participants PAID`);

  // 5. Host closes → batch code
  const cl = await j('POST', `/groups/${sessionId}/close`, { hostId: host });
  const batchCode = cl.data?.data?.batchCode;
  console.log(`5. Closed → batchCode=${batchCode}`);

  // 6. Admin → kiosk at virtual printer
  const al = await j('POST', '/admin/auth/login', { email: 'admin@printloop.test', password: 'Admin1234!' });
  const AH = { Authorization: `Bearer ${al.data?.data?.tokens?.accessToken}` };
  const ks = await j('GET', '/admin/kiosks', null, AH);
  const k = (ks.data?.data?.kiosks || [])[0];
  await j('PATCH', `/admin/kiosks/${k.id}`, { ipAddress: '127.0.0.1' }, AH);
  const rk = await j('POST', `/admin/kiosks/${k.id}/regenerate-key`, {}, AH);
  const kioskKey = rk.data?.data?.kiosk?.apiKey;
  await j('PATCH', '/admin/settings/ippPort', { value: '6310' }, AH);
  await j('PATCH', '/admin/settings/ippSecure', { value: 'false' }, AH);

  // 7. Release the batch
  const before = new Set(fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []);
  const rel = await j('POST', '/printer/complete-batch', { code: batchCode }, { 'X-Kiosk-Key': kioskKey });
  console.log(`6. /printer/complete-batch → ${rel.status} printed=${rel.data?.data?.printed}/${rel.data?.data?.total} transport=${rel.data?.data?.transport}`);

  await new Promise((r) => setTimeout(r, 2000));
  const fresh = (fs.existsSync(PRINTED) ? fs.readdirSync(PRINTED) : []).filter((x) => !before.has(x));
  const hashes = fresh.map((x) => sha(fs.readFileSync(path.join(PRINTED, x))));
  const bothExact = fresh.length === 2 && hashes.every((h) => want.has(h)) && new Set(hashes).size === 2;
  console.log(`7. ${fresh.length} printed: ${fresh.join(', ')}`);
  console.log(bothExact
    ? '8. ✅ BOTH byte-exact under ONE group code (see backend log for per-participant settings)'
    : `8. ❌ mismatch — got ${hashes.map((h) => h.slice(0, 10))}`);
})().catch((e) => { console.error('E2E error:', e); process.exit(1); });
