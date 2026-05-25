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
const DB_PATH = path.resolve(__dirname, '..', 'data', 'printloop.sqlite');

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

// --- SQLite helpers (used by the concurrency + idempotency blocks) ---
let sqlite3;
try { sqlite3 = require('sqlite3'); } catch { sqlite3 = null; }
function sqlGet(sql, params) {
  return new Promise((resolve, reject) => {
    if (!sqlite3) return resolve(null);
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    db.get(sql, params, (err, row) => { db.close(); err ? reject(err) : resolve(row); });
  });
}
function sqlAll(sql, params) {
  return new Promise((resolve, reject) => {
    if (!sqlite3) return resolve([]);
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    db.all(sql, params, (err, rows) => { db.close(); err ? reject(err) : resolve(rows); });
  });
}
function sqlRun(sql, params) {
  return new Promise((resolve, reject) => {
    if (!sqlite3) return resolve(null);
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
    db.run(sql, params, function (err) { db.close(); err ? reject(err) : resolve(this.changes); });
  });
}

// Credit the wallet via the verified Paystack webhook — re-uses the
// production path so we don't need an admin top-up endpoint.
async function topUpWallet(userId, naira) {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_WEBHOOK_SECRET not set');
  const ref = `TOPUP_${userId}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const payload = {
    event: 'charge.success',
    data: { reference: ref, amount: naira * 100, metadata: { userId, type: 'wallet_topup' } },
  };
  const raw = Buffer.from(JSON.stringify(payload));
  const sig = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  const r = await fetch(B + '/payments/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
    body: raw,
  });
  if (r.status !== 200) throw new Error(`top-up webhook returned ${r.status}`);
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
  // Matrix lookup: A4 color duplex 300dpi = ₦250/page × 1pg × 2 copies = ₦500
  const expectCost = 250 * 1 * 2;
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

  // ───────────────────────────────────────────────────────────────────
  // IDEMPOTENCY: same payload, same Idempotency-Key, twice → ONE PrintJob.
  // ───────────────────────────────────────────────────────────────────
  console.log('\n--- Idempotency ---');
  const idemKey = `cups-test-idem-${Date.now()}`;
  const idemHeaders = { Authorization: `Bearer ${printToken}`, 'Idempotency-Key': idemKey };
  const a = await fetch(B + '/cups/print', { method: 'POST', headers: idemHeaders, body: cupsForm('idem.pdf') });
  const aBody = await a.json();
  const b = await fetch(B + '/cups/print', { method: 'POST', headers: idemHeaders, body: cupsForm('idem.pdf') });
  const bBody = await b.json();
  const sameCode = aBody?.data?.code && aBody.data.code === bBody?.data?.code;
  console.log(`12. two POSTs with same Idempotency-Key → codes ${aBody?.data?.code} / ${bBody?.data?.code} ${sameCode ? 'PASS' : 'FAIL'}`);
  console.log(`    second response was marked idempotent=${bBody?.data?.idempotent} ${bBody?.data?.idempotent === true ? 'PASS' : 'FAIL'}`);
  const jobsForKey = await sqlAll(
    `SELECT id FROM print_jobs WHERE idempotencyKey = ?`,
    [idemKey],
  );
  console.log(`    DB rows for that key: ${jobsForKey.length} (expect 1) ${jobsForKey.length === 1 ? 'PASS' : 'FAIL'}`);

  // ───────────────────────────────────────────────────────────────────
  // WALLET RACE: fund wallet for exactly 3 prints, fire 5 in parallel,
  // assert balance ends at zero — not negative — proving the atomic
  // debit closed the read-modify-write race.
  // ───────────────────────────────────────────────────────────────────
  console.log('\n--- Wallet race ---');
  // Fresh user so the signup bonus + previous prints don't interfere.
  const raceEmail = `cupsrace${Date.now()}@printloop.test`;
  const raceReg = await jr('POST', '/customer/auth/register', {
    firstName: 'Race', lastName: 'Tester', email: raceEmail,
    phoneNumber: '+2348000000777', password: 'Passw0rd!',
  });
  const raceTok = raceReg.data?.data?.tokens?.accessToken;
  const raceUserId = raceReg.data?.data?.user?.id;
  const raceRot = await jr('POST', '/customer/print-token/rotate', {}, { Authorization: `Bearer ${raceTok}` });
  const racePrintToken = raceRot.data?.data?.token;
  // Each /cups/print posted below costs ₦43 (1pg · 2 copies · color ·
  // duplex). Fund the wallet for exactly 3 to leave clear evidence if a
  // 4th sneaks through.
  // Matrix: A4 color duplex 300dpi = ₦250/pg × 1pg × 2 copies = ₦500
  const UNIT = 500;
  // Force the wallet to exactly 3 × UNIT — the signup bonus would
  // otherwise leave it with enough for 4+ debits and the race window
  // we're trying to test would never get hit.
  await sqlRun(`UPDATE wallets SET balance = ? WHERE userId = ?`, [3 * UNIT, raceUserId]);
  const startBal = (await sqlGet(`SELECT balance FROM wallets WHERE userId = ?`, [raceUserId]))?.balance ?? 0;
  console.log(`13. wallet pinned at ₦${startBal} (= 3 × ₦${UNIT})`);

  // 5 parallel prints — only 3 should debit; the other 2 should still
  // create PrintJob rows (best-effort billing matches the customer app)
  // but leave the wallet at zero. The pre-fix code would have let all 5
  // pass the balance check and double-spent.
  const fires = Array.from({ length: 5 }, (_, i) =>
    fetch(B + '/cups/print', {
      method: 'POST',
      headers: { Authorization: `Bearer ${racePrintToken}` },
      body: cupsForm(`race-${i}.pdf`),
    }).then((res) => res.json()),
  );
  const results = await Promise.all(fires);
  const ok = results.filter((x) => x?.success).length;
  const endBal = (await sqlGet(`SELECT balance FROM wallets WHERE userId = ?`, [raceUserId]))?.balance ?? 0;
  const expected = startBal - 3 * UNIT;
  console.log(`14. 5 parallel POSTs → ${ok} succeeded, wallet ₦${startBal} → ₦${endBal} (expect ₦${expected})`);
  if (Number(endBal) === Number(expected)) {
    console.log('15. ✅ Wallet race closed — exactly 3 debits, no overshoot');
  } else {
    console.error(`15. ❌ Wallet race — got ₦${endBal}, expected ₦${expected}. Overshoot = double-spend.`);
    process.exit(1);
  }
  // Should never go negative.
  if (Number(endBal) < 0) {
    console.error('    ❌ Wallet went NEGATIVE — debit was applied without bounds check.');
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
