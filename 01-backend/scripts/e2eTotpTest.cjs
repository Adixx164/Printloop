/* 2FA (TOTP) end-to-end (V2-22).
 *
 *   1. admin login (no 2FA yet) → token.
 *   2. /me/2fa/setup → secret + otpauth URL.
 *   3. /me/2fa/enable with a freshly-computed code → enabled.
 *   4. login WITHOUT a code → 401 TOTP_REQUIRED.
 *   5. login WITH a computed code → 200.
 *   6. /me/2fa/disable with a code → disabled; login works code-free again.
 *
 * Computes codes with the same RFC 6238 logic the server uses (a tiny
 * inline TOTP so the test doesn't import TS). Backend must be on :4000.
 */
const crypto = require('node:crypto');
const B = 'http://localhost:4000/api';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret, atMs = Date.now()) {
  const counter = Math.floor(atMs / 1000 / 30);
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return (bin % 1e6).toString().padStart(6, '0');
}

async function jr(method, url, body, headers) {
  const r = await fetch(B + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d; try { d = await r.json(); } catch { d = null; }
  return { status: r.status, data: d };
}
function assert(cond, msg) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); }
  console.log(`ok   ${msg}`);
}

(async () => {
  const EMAIL = 'admin@printloop.test';
  const PW = 'Admin1234!';

  const login1 = await jr('POST', '/admin/auth/login', { email: EMAIL, password: PW });
  assert(login1.status === 200, `initial admin login (got ${login1.status})`);
  const auth = { Authorization: `Bearer ${login1.data.data.tokens.accessToken}` };

  const setup = await jr('POST', '/saas/me/2fa/setup', null, auth);
  assert(setup.status === 200 && setup.data.data.secret, '2fa setup returns secret');
  const secret = setup.data.data.secret;
  assert(/^otpauth:\/\/totp\//.test(setup.data.data.otpauthUrl), 'otpauth url well-formed');

  const enable = await jr('POST', '/saas/me/2fa/enable', { code: totp(secret) }, auth);
  assert(enable.status === 200 && enable.data.data.enabled === true, '2fa enabled with valid code');

  const noCode = await jr('POST', '/admin/auth/login', { email: EMAIL, password: PW });
  assert(noCode.status === 401 && noCode.data.code === 'TOTP_REQUIRED', 'login without code → 401 TOTP_REQUIRED');

  const withCode = await jr('POST', '/admin/auth/login', { email: EMAIL, password: PW, totpCode: totp(secret) });
  assert(withCode.status === 200, `login with code → 200 (got ${withCode.status})`);

  const badCode = await jr('POST', '/admin/auth/login', { email: EMAIL, password: PW, totpCode: '000000' });
  assert(badCode.status === 401 && badCode.data.code === 'TOTP_INVALID', 'login with wrong code → 401 TOTP_INVALID');

  // Disable (use a fresh token from the with-code login).
  const auth2 = { Authorization: `Bearer ${withCode.data.data.tokens.accessToken}` };
  const disable = await jr('POST', '/saas/me/2fa/disable', { code: totp(secret) }, auth2);
  assert(disable.status === 200 && disable.data.data.enabled === false, '2fa disabled with code');

  const after = await jr('POST', '/admin/auth/login', { email: EMAIL, password: PW });
  assert(after.status === 200, 'login code-free after disable → 200');

  console.log('\nALL 2FA E2E CHECKS PASSED');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
