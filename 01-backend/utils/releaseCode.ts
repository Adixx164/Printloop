import crypto from 'node:crypto';

/**
 * Release-code alphabet for kiosk codes. Crockford-style — no 0/O/1/I/L
 * confusion, no vowels that accidentally spell words. Single source of
 * truth so all ingress paths (web, batch, group, CUPS) produce codes
 * the kiosk keypad can render.
 */
export const RELEASE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Cryptographically random release code, default 6 chars. Uses a single
 * `randomBytes` syscall (cheaper than per-char) and modulo-reduces each
 * byte into the alphabet. The bias from `byte % 32` is exactly zero on
 * a 32-symbol alphabet (256 / 32 = 8 evenly), so no rejection-sampling
 * loop is needed.
 */
export function makeCode(n = 6): string {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += RELEASE_CODE_ALPHABET[b[i] % RELEASE_CODE_ALPHABET.length];
  return s;
}
