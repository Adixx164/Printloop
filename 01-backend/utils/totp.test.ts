import { describe, it, expect } from 'vitest';
import {
  selfTestTotp,
  generateTotpSecret,
  totpAt,
  verifyTotp,
  buildOtpAuthUrl,
} from './totp';

describe('TOTP (RFC 6238)', () => {
  it('passes all RFC 6238 Appendix-B SHA-1 vectors', () => {
    expect(selfTestTotp()).toBe(true);
  });

  it('verifies a freshly-computed code', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, totpAt(secret))).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = generateTotpSecret();
    const real = totpAt(secret);
    const wrong = real === '000000' ? '111111' : '000000';
    expect(verifyTotp(secret, wrong)).toBe(false);
  });

  it('rejects malformed input', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '12345')).toBe(false);
  });

  it('accepts a code from the previous step (±1 window, clock skew)', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const prevStepCode = totpAt(secret, now - 30_000);
    expect(verifyTotp(secret, prevStepCode, { atMs: now })).toBe(true);
  });

  it('rejects a code two steps old (outside the window)', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const oldCode = totpAt(secret, now - 90_000);
    // Only fails if that old code differs from current/±1 — almost
    // always true; guard the rare collision.
    const current = new Set([
      totpAt(secret, now - 30_000),
      totpAt(secret, now),
      totpAt(secret, now + 30_000),
    ]);
    if (!current.has(oldCode)) {
      expect(verifyTotp(secret, oldCode, { atMs: now })).toBe(false);
    }
  });

  it('builds a scannable otpauth URL', () => {
    const url = buildOtpAuthUrl({ secret: 'ABC234', accountName: 'a@b.test' });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain('secret=ABC234');
    expect(url).toContain('issuer=PrintLoop');
  });
});
