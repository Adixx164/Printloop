/**
 * Single-use handoff tokens (V2-44).
 *
 * LMS trusted-link handoffs mint JWTs carrying a `jti`. The first
 * /handoff/verify consumes the jti here; a second verify of the same
 * token is rejected — a student forwarding their personalised link
 * around the class group-chat shouldn't mint infinite sessions.
 *
 * In-memory by design: tokens live 5 minutes, so a process restart
 * losing the set only re-opens a sub-5-minute window. Marketplace
 * handoff tokens (V2-32) carry no jti and are unaffected.
 */
const consumed = new Map<string, number>(); // jti → expiry (ms epoch)

const SWEEP_EVERY = 200;
let opsSinceSweep = 0;

function sweep(): void {
  const now = Date.now();
  for (const [jti, exp] of consumed) {
    if (exp <= now) consumed.delete(jti);
  }
}

/**
 * Returns true when the jti is fresh (and marks it consumed),
 * false when it has been seen before.
 */
export function consumeJtiOnce(jti: string, expSeconds: number | undefined): boolean {
  if (++opsSinceSweep >= SWEEP_EVERY) {
    opsSinceSweep = 0;
    sweep();
  }
  if (consumed.has(jti)) return false;
  const expMs = expSeconds ? expSeconds * 1000 : Date.now() + 10 * 60 * 1000;
  consumed.set(jti, expMs);
  return true;
}
