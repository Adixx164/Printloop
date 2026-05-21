import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../config/redis';

const redisStore = () =>
  new RedisStore({
    sendCommand: (...args: string[]) => (redisClient as any).sendCommand(args),
  });

/**
 * General API rate limit: 100 requests per minute per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

/**
 * Strict limit for login: 5 attempts per minute
 */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  message: {
    success: false,
    message: 'Too many login attempts. Try again in 1 minute.',
    code: 'LOGIN_RATE_LIMIT',
  },
});

/**
 * OTP / password reset: 3 per minute, 10 per hour
 */
export const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  message: {
    success: false,
    message: 'Too many OTP requests. Try again later.',
    code: 'OTP_RATE_LIMIT',
  },
});

/**
 * Code validation: 10 attempts per minute
 * Prevents brute-force on print codes
 */
export const codeValidationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  // Use kiosk ID + IP combo for keying
  keyGenerator: (req) => {
    const kioskId = (req as any).kiosk?.id || 'unknown';
    return `code-validation:${kioskId}:${req.ip}`;
  },
  message: {
    success: false,
    message: 'Too many code attempts. Slow down.',
    code: 'CODE_RATE_LIMIT',
  },
});

/**
 * Per-kiosk rate limit: 1000 requests per hour
 */
export const kioskLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore(),
  keyGenerator: (req) => {
    const kioskId = (req as any).kiosk?.id;
    return kioskId ? `kiosk:${kioskId}` : `ip:${req.ip}`;
  },
});
