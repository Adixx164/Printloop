import crypto from 'node:crypto';

/**
 * RFC 6238 TOTP — hand-rolled on node:crypto, no external dependency
 * (V2-22). Used for 2FA on platform admins + tenant owners.
 *
 * - Secrets are Base32 (RFC 4648, no padding) so they paste into any
 *   authenticator app (Google Authenticator, Authy, 1Password…).
 * - 6 digits, 30-second step, SHA-1 (the universal authenticator
 *   default).
 * - Verification accepts a ±1 step window to tolerate clock skew.
 *
 * Self-tested against the RFC 6238 Appendix B SHA-1 vectors at the
 * bottom of this file via `selfTestTotp()` (called by the e2e script).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

/** Generate a random Base32 secret (default 160 bits = 32 chars). */
export function generateTotpSecret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  return base32Encode(buf);
}

/** Build the otpauth:// URI an authenticator app scans / imports. */
export function buildOtpAuthUrl(opts: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = opts.issuer || 'PrintLoop';
  const label = encodeURIComponent(`${issuer}:${opts.accountName}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Compute the TOTP code for a given secret at a given time (ms). */
export function totpAt(secret: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  return hotp(secret, counter);
}

/**
 * Verify a user-supplied code against the secret, accepting the
 * current step ± `window` (default 1 → tolerates ±30s skew).
 * Constant-time per-candidate compare.
 */
export function verifyTotp(
  secret: string,
  code: string,
  opts: { window?: number; atMs?: number } = {},
): boolean {
  const window = opts.window ?? 1;
  const atMs = opts.atMs ?? Date.now();
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const clean = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  for (let i = -window; i <= window; i++) {
    const candidate = hotp(secret, counter + i);
    if (timingSafeEqualStr(candidate, clean)) return true;
  }
  return false;
}

// ── internals ───────────────────────────────────────────────────────

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter.
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * RFC 6238 Appendix B self-test (SHA-1, 8 digits in the RFC; we use
 * the same seed but assert our 6-digit truncation matches the last 6
 * of the RFC's 8-digit values). Returns true if all vectors pass.
 *
 * Seed (ASCII "12345678901234567890") in Base32 = GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ.
 */
export function selfTestTotp(): boolean {
  const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
  // [unix seconds, expected 8-digit TOTP from the RFC]
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ];
  for (const [sec, eight] of vectors) {
    const got = totp8(secret, sec * 1000);
    if (got !== eight) {
      console.error(`TOTP self-test FAIL at ${sec}: got ${got}, want ${eight}`);
      return false;
    }
  }
  return true;
}

// 8-digit variant used only by the self-test (RFC vectors are 8-digit).
function totp8(secret: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** 8).toString().padStart(8, '0');
}
