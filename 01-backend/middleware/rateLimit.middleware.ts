import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { RedisStore } from 'rate-limit-redis';
import { redisClient, REDIS_ENABLED } from '../config/redis';

/**
 * IPv6-safe IP token. express-rate-limit warns when a custom
 * keyGenerator uses raw `req.ip` because an IPv6 caller can vary
 * the suffix to evade the limit; `ipKeyGenerator` collapses the
 * /64 prefix so the limiter sees one identity. We pass `req.ip`
 * through it before building the tenant-prefixed key.
 */
function ipToken(req: Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

/**
 * Build a RedisStore only when Redis is actually reachable. With the
 * dev stub (REDIS_ENABLED=false), rate-limit-redis tries to warm an
 * incr Lua script at store-init time, fails because `sendCommand`
 * doesn't exist, and floods the boot log. Returning `undefined`
 * causes express-rate-limit to use its in-memory MemoryStore — fine
 * for single-process dev (and `shouldSkip()` no-ops requests anyway).
 */
const redisStore = () => {
  if (!REDIS_ENABLED) return undefined;
  return new RedisStore({
    sendCommand: (...args: string[]) => (redisClient as any).sendCommand(args),
  });
};

/**
 * Skip clause shared by every limiter (V2-28).
 *
 *  - `DISABLE_RATE_LIMIT=1` → escape hatch for the integration test
 *    suite, which would otherwise exhaust the 5-req/min login quota
 *    well inside a single run.
 *  - `REDIS_ENABLED === false` → dev convenience: when no Redis URL
 *    is configured, the redisClient is a no-op stub with no
 *    `sendCommand` method, and trying to use it would throw on the
 *    first request. Graceful degrade matches the pattern in
 *    config/redis.ts (Redis is optional in dev).
 *
 * Production deployments set REDIS_URL, leave DISABLE_RATE_LIMIT
 * unset, and get the full enforcement.
 */
function shouldSkip(): boolean {
  return process.env.DISABLE_RATE_LIMIT === '1' || !REDIS_ENABLED;
}

/**
 * Tenant-aware key generator (V2-13). Prefixes every key with the
 * resolved tenant id so Tenant A's traffic can't exhaust Tenant B's
 * quota. Falls back to `global` when no tenant resolved — those
 * routes are the marketing / sign-up surface, intentionally shared.
 */
function tenantKey(req: Request, base: string): string {
  const tid = req.tenant?.id || 'global';
  return `${tid}:${base}`;
}

/**
 * General API rate limit: 100 requests per minute per (tenant, IP).
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `api:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
} as Partial<Options>);

/**
 * Strict limit for login: 5 attempts per (tenant, IP) per 15 minutes.
 * Protects against credential stuffing on /api/customer/auth/login
 * and /api/admin/auth/login.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `login:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many login attempts. Try again in 15 minutes.',
    code: 'LOGIN_RATE_LIMIT',
  },
} as Partial<Options>);

/**
 * Tenant signup + customer registration: 3 per (tenant, IP) per
 * hour. Stops automated tenant-creation spam (every new tenant
 * provisions DB rows + Paystack accounts + DNS — expensive) without
 * blocking real campus admins who legitimately try a few times.
 */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `signup:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many signup attempts. Try again in an hour.',
    code: 'SIGNUP_RATE_LIMIT',
  },
} as Partial<Options>);

/**
 * OTP / email-verification: 10 per (tenant, IP) per hour.
 */
export const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `otp:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many OTP requests. Try again later.',
    code: 'OTP_RATE_LIMIT',
  },
} as Partial<Options>);

/**
 * Password reset: 5 per (tenant, IP) per hour. Tighter than OTP
 * because reset tokens unlock account recovery — abuse here can
 * facilitate takeover via email-server compromise.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  skip: shouldSkip,
  keyGenerator: (req) => tenantKey(req, `pwreset:${ipToken(req)}`),
  message: {
    success: false,
    message: 'Too many password reset requests. Try again in an hour.',
    code: 'PASSWORD_RESET_RATE_LIMIT',
  },
} as Partial<Options>);
