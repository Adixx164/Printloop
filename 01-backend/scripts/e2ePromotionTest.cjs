/* Promotion concurrency end-to-end:
 *   - admin creates a promo with maxUses=3
 *   - 10 concurrent customer prints redeem the same code
 *   - DB usageCount MUST end at exactly 3 (no overshoot)
 *   - the 3rd-to-last redemption that wins gets a discount; the rest get
 *     {discount:0, reason:'exhausted'} and pay full price
 *
 * Proves the bounds-check vs increment race in promotion.service.ts is
 * closed by the conditional UPDATE.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const B = 'http://localhost:4000/api';
const DB_PATH = path.resolve(__dirname, '..', 'data', 'printloop.sqlite');

let sqlite3;
try { sqlite3 = require('sqlite3'); } catch { sqlite3 = null; }
function sqlGet(sql, params) {
  return new Promise((resolve, reject) => {
    if (!sqlite3) return resolve(null);
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY);
    db.get(sql, params, (err, row) => { db.close(); err ? reject(err) : resolve(row); });
  });
}

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
  // 1. Admin login → create promo (maxUses=3, 50% off so the discount is
  //    obvious in the cost).
  const al = await jr('POST', '/admin/auth/login', {
    email: 'admin@printloop.test', password: 'Admin1234!',
  });
  const AH = { Authorization: `Bearer ${al.data?.data?.tokens?.accessToken}` };
  if (!AH.Authorization?.startsWith('Bearer')) {
    console.error('FAIL — admin login did not return a token');
    process.exit(1);
  }

  const code = `RACE${Date.now().toString(36).toUpperCase()}`;
  const promo = await jr(
    'POST',
    '/admin/promotions',
    {
      code,
      name: 'Race test',
      discountType: 'percentage',
      discountValue: 50,
      status: 'active',
      maxUses: 3,
    },
    AH,
  );
  const promoId = promo.data?.data?.promotion?.id;
  console.log(`1. Created promo ${code} maxUses=3 → id=${promoId?.slice(0, 8)}… (${promo.status})`);

  // 2. Register 10 customers + multipart bodies.
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage([595, 842]);
  pg.drawText('promo race', { x: 60, y: 760, size: 20, font: await pdf.embedFont(StandardFonts.HelveticaBold) });
  const bytes = Buffer.from(await pdf.save());

  const users = await Promise.all(
    Array.from({ length: 10 }, async (_, i) => {
      const email = `promo${Date.now()}_${i}@printloop.test`;
      const reg = await jr('POST', '/customer/auth/register', {
        firstName: 'Promo', lastName: `User${i}`, email,
        phoneNumber: `+234800000${(1000 + i).toString().slice(0, 4)}`,
        password: 'Passw0rd!',
      });
      return reg.data?.data?.tokens?.accessToken;
    }),
  );
  console.log(`2. Registered ${users.filter(Boolean).length}/10 customers`);

  // 3. Fire 10 parallel uploads, each redeeming the promo.
  const fire = (jwt) => {
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: 'application/pdf' }), 'race.pdf');
    fd.append('fileName', 'race.pdf');
    fd.append('pageCount', '1');
    fd.append('paymentMethod', 'wallet');
    fd.append('jobType', 'single');
    fd.append('promotionCode', code);
    fd.append('printConfiguration', JSON.stringify({
      copies: 1, paper: 'A4', color: 'color', sided: 'single', qualityDpi: 300,
    }));
    return fetch(B + '/customer/print-jobs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: fd,
    }).then((r) => r.json());
  };
  const results = await Promise.all(users.map((j) => fire(j)));
  const ok = results.filter((x) => x?.success).length;
  console.log(`3. 10 concurrent prints → ${ok}/10 succeeded`);

  // 4. Inspect the promo row — usageCount must be 3, not 4+.
  const row = await sqlGet(`SELECT usageCount FROM promotions WHERE id = ?`, [promoId]);
  const usage = Number(row?.usageCount ?? -1);
  console.log(`4. DB usageCount=${usage} (expect 3) ${usage === 3 ? 'PASS' : 'FAIL'}`);

  // 5. Sanity-check the costs. The test uploads 1 page · 1 copy · A4 color
  //    simplex 300dpi. Matrix lookup → ₦200/page → ₦200 baseline. The 50%
  //    discount uses Math.floor → ₦100. The 3 redemptions that win the
  //    race pay ₦100; the other 7 pay full ₦200.
  const full = 200;
  const discounted = full - Math.floor((full * 50) / 100); // 100
  const discountedCount = results.filter((x) => x?.data?.job?.cost === discounted).length;
  const fullCount = results.filter((x) => x?.data?.job?.cost === full).length;
  console.log(`5. discounted ₦${discounted}: ${discountedCount} jobs · full ₦${full}: ${fullCount} jobs`);
  if (discountedCount !== 3) {
    console.error(`   ❌ wrong number of discounted jobs (got ${discountedCount}, expected 3)`);
    process.exit(1);
  }
  if (fullCount !== 7) {
    console.error(`   ❌ wrong number of full-price jobs (got ${fullCount}, expected 7)`);
    process.exit(1);
  }

  if (usage === 3 && discountedCount === 3) {
    console.log('6. ✅ Promotion race closed — exactly 3 redemptions, no overshoot');
  } else {
    process.exit(1);
  }
})().catch((e) => { console.error(e); process.exit(1); });
