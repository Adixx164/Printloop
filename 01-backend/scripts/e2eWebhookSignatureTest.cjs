/* Paystack webhook end-to-end:
 *   - missing signature → 401
 *   - bad signature     → 401
 *   - good signature    → 200 + wallet credited
 *   - replay reference  → 200 idempotent (no double-credit)
 *   - charge.failed     → 200 reversed (wallet debited back, refund tx)
 *
 * Requires the backend to be running on :4000 with the same HMAC secret
 * (PAYSTACK_WEBHOOK_SECRET, or PAYSTACK_SECRET_KEY as fallback) that this
 * script signs with. Reads 01-backend/.env to keep that aligned.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const B = 'http://localhost:4000/api';
const DB_PATH = path.resolve(__dirname, '..', 'data', 'printloop.sqlite');

// Tiny SQLite reader — we only need the real Wallet.balance for assertions.
// The /api/wallet endpoint is the legacy mock store, NOT the real Wallet
// the Paystack webhook updates. Uses node-sqlite3 (already pulled in by
// TypeORM) so this script needs zero extra deps.
let sqlite3;
try {
  sqlite3 = require('sqlite3');
} catch {
  sqlite3 = null;
}
function realWalletBalance(userId) {
  if (!sqlite3 || !fs.existsSync(DB_PATH)) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
    });
    db.get('SELECT balance FROM wallets WHERE userId = ?', [userId], (err, row) => {
      db.close();
      if (err) return reject(err);
      resolve(row ? Number(row.balance) : null);
    });
  });
}

function loadSecret() {
  const fromEnv = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
  if (fromEnv) return fromEnv;
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return null;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const pick = (k) => {
    const ln = lines.find((l) => l.startsWith(`${k}=`));
    if (!ln) return null;
    const v = ln.slice(k.length + 1).trim();
    return v ? v : null;
  };
  return pick('PAYSTACK_WEBHOOK_SECRET') || pick('PAYSTACK_SECRET_KEY');
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

async function postRaw(url, rawBody, headers) {
  const r = await fetch(B + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: rawBody,
  });
  let d;
  try { d = await r.json(); } catch { d = null; }
  return { status: r.status, data: d };
}

(async () => {
  const secret = loadSecret();
  if (!secret) {
    console.log('SKIP — no PAYSTACK_WEBHOOK_SECRET or PAYSTACK_SECRET_KEY set in env or 01-backend/.env');
    console.log('       (set either var with any value on both the backend and this shell)');
    process.exit(0);
  }
  console.log(`0. HMAC secret loaded (${secret.slice(0, 6)}…, ${secret.length} chars)`);

  // 1. Register a real customer + grab their wallet (post-signup balance).
  const email = `wh${Date.now()}@printloop.test`;
  const reg = await jr('POST', '/customer/auth/register', {
    firstName: 'Webhook', lastName: 'Tester', email,
    phoneNumber: '+2348000000999', password: 'Passw0rd!',
  });
  const tok = reg.data?.data?.tokens?.accessToken;
  const userId = reg.data?.data?.user?.id;
  if (!tok || !userId) {
    console.error('FAIL — registration did not return tokens.accessToken / user.id');
    console.error(JSON.stringify(reg, null, 2));
    process.exit(1);
  }
  const startBal = await realWalletBalance(userId);
  if (startBal === null) {
    console.log('SKIP — sqlite3 not available or DB missing — cannot read real wallet for assertion');
    process.exit(0);
  }
  console.log(`1. Registered ${email}; userId=${userId.slice(0, 8)}… startBal=₦${startBal}`);

  const reference = `TOPUP_${userId}_${Date.now()}`;
  const success = {
    event: 'charge.success',
    data: {
      reference,
      amount: 150000, // ₦1500 in kobo
      metadata: { userId, type: 'wallet_topup' },
    },
  };
  const rawSuccess = Buffer.from(JSON.stringify(success));
  const sigSuccess = crypto.createHmac('sha512', secret).update(rawSuccess).digest('hex');

  // 2. No signature → 401
  const a = await postRaw('/payments/webhook', rawSuccess);
  console.log(`2. no signature → ${a.status} (expect 401) ${a.status === 401 ? 'PASS' : 'FAIL'}`);

  // 3. Bad signature → 401
  const b = await postRaw('/payments/webhook', rawSuccess, { 'x-paystack-signature': 'deadbeef' });
  console.log(`3. bad signature → ${b.status} (expect 401) ${b.status === 401 ? 'PASS' : 'FAIL'}`);

  // 4. Good signature → 200 + wallet credited
  const c = await postRaw('/payments/webhook', rawSuccess, { 'x-paystack-signature': sigSuccess });
  console.log(`4. good sig charge.success → ${c.status} action=${c.data?.action}`);
  const bal1 = await realWalletBalance(userId);
  const credited = bal1 - startBal;
  console.log(`   wallet ₦${startBal} → ₦${bal1} (Δ=₦${credited}, expect ₦1500) ${credited === 1500 ? 'PASS' : 'FAIL'}`);

  // 5. Replay same payload → idempotent
  const d = await postRaw('/payments/webhook', rawSuccess, { 'x-paystack-signature': sigSuccess });
  const bal2 = await realWalletBalance(userId);
  console.log(`5. replay → ${d.status} action=${d.data?.action} bal=₦${bal2} (expect unchanged ₦${bal1}) ${bal2 === bal1 ? 'PASS' : 'FAIL'}`);

  // 6. charge.failed on same reference → reversal
  const failed = {
    event: 'charge.failed',
    data: { reference, amount: 150000, metadata: { userId, type: 'wallet_topup' } },
  };
  const rawFailed = Buffer.from(JSON.stringify(failed));
  const sigFailed = crypto.createHmac('sha512', secret).update(rawFailed).digest('hex');
  const e = await postRaw('/payments/webhook', rawFailed, { 'x-paystack-signature': sigFailed });
  const bal3 = await realWalletBalance(userId);
  console.log(`6. charge.failed → ${e.status} action=${e.data?.action} bal=₦${bal3} (expect ₦${startBal}) ${bal3 === startBal ? 'PASS' : 'FAIL'}`);

  // 7. Reversal idempotency
  const f = await postRaw('/payments/webhook', rawFailed, { 'x-paystack-signature': sigFailed });
  const bal4 = await realWalletBalance(userId);
  console.log(`7. failed-replay → ${f.status} action=${f.data?.action} bal=₦${bal4} (expect ₦${bal3}) ${bal4 === bal3 ? 'PASS' : 'FAIL'}`);
})().catch((e) => { console.error(e); process.exit(1); });
