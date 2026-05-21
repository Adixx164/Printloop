import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../config/redis';
import { AppDataSource } from '../config/database';
import { AuditLog } from '../entities/auditLog.entity';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 10 * 60; // 10 minutes
const LOCKOUT_SECONDS = 30 * 60; // 30 minute lockout after exceeding

const ATTEMPT_KEY_PREFIX = 'brute:code-attempt:';
const LOCKOUT_KEY_PREFIX = 'brute:code-lockout:';

/**
 * Brute-force protection middleware for print code validation
 * 
 * Tracks failed code attempts per IP. After 5 failures in 10 minutes,
 * locks out the IP for 30 minutes.
 * 
 * Usage:
 *   router.post('/printer/validate-code', kioskAuth, bruteForceProtection, validateCode);
 */
export const bruteForceProtection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const ip = req.ip || 'unknown';
    const lockoutKey = `${LOCKOUT_KEY_PREFIX}${ip}`;

    // Check if IP is locked out
    const lockedUntil = await redisClient.get(lockoutKey);
    if (lockedUntil) {
      const ttl = await redisClient.ttl(lockoutKey);
      res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`,
        code: 'BRUTE_FORCE_LOCKOUT',
        lockedSeconds: ttl,
      });
      return;
    }

    // Wrap response to track failures
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // If validation failed (success: false), increment counter
      if (body && body.success === false) {
        recordFailure(ip).catch(err =>
          console.error('Brute force counter error:', err)
        );
      } else if (body && body.success === true) {
        // Reset on success
        redisClient.del(`${ATTEMPT_KEY_PREFIX}${ip}`).catch(() => {});
      }
      return originalJson(body);
    };

    next();
  } catch (error) {
    console.error('Brute force middleware error:', error);
    // Fail open
    next();
  }
};

/**
 * Record a failed attempt and lock out if threshold exceeded
 */
async function recordFailure(ip: string): Promise<void> {
  const attemptKey = `${ATTEMPT_KEY_PREFIX}${ip}`;
  const lockoutKey = `${LOCKOUT_KEY_PREFIX}${ip}`;

  const attempts = await redisClient.incr(attemptKey);
  if (attempts === 1) {
    await redisClient.expire(attemptKey, WINDOW_SECONDS);
  }

  if (attempts >= MAX_ATTEMPTS) {
    // Lock out
    await redisClient.setEx(lockoutKey, LOCKOUT_SECONDS, '1');
    await redisClient.del(attemptKey);

    // Log to audit
    try {
      const auditRepo = AppDataSource.getRepository(AuditLog);
      await auditRepo.save({
        action: 'BRUTE_FORCE_LOCKOUT',
        ipAddress: ip,
        userType: 'ANONYMOUS',
        resourceType: 'print_code',
        payload: { attempts, windowSeconds: WINDOW_SECONDS, lockoutSeconds: LOCKOUT_SECONDS },
        timestamp: new Date(),
      } as any);
    } catch (err) {
      console.error('Audit log error:', err);
    }

    console.warn(`[BruteForce] IP ${ip} locked out for ${LOCKOUT_SECONDS}s after ${attempts} failures`);
  }
}
