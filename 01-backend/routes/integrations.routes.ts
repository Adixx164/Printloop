/**
 * External integrations (V2-44) — currently the campus LMS
 * trusted-link handoff (plan P3, Tier 1).
 *
 * The whole integration is THIS endpoint plus a per-tenant key. A
 * Moodle/Canvas admin pastes one URL behind a course button using the
 * LMS's built-in link/HTML feature — no plugin is written, published,
 * or GPL'd; PrintLoop stays fully closed-source:
 *
 *   GET /api/integrations/lms/handoff
 *       ?slug=<tenantSlug>&key=<lmsKey>[&email=…][&format=json]
 *
 * Validates the key (constant-time), mints a SINGLE-USE 5-minute
 * handoff token (the V2-32 machinery + a jti), and 302-redirects the
 * student into the shop's login with everything pre-filled. LMSes
 * that can template the student's email into the URL get one-tap
 * sign-in; those that can't still deep-land on the right shop.
 *
 * Anonymous + cross-tenant by nature (the LMS server/browser calls it
 * with no PrintLoop session) — mounted before tenant resolution, like
 * /api/discovery.
 */
import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppDataSource } from '../config/database.js';
import { Tenant, TenantStatus } from '../entities/tenant.entity.js';
import { getJwtSecret } from '../utils/jwt.js';

const router = Router();
const HANDOFF_TTL_SECONDS = 5 * 60;

/** Constant-time string compare; length mismatch returns false. */
function keysMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

router.get('/lms/handoff', async (req: Request, res: Response) => {
  try {
    const slug = String(req.query.slug || '').trim().toLowerCase();
    const key = String(req.query.key || '');
    const emailRaw = String(req.query.email || '').trim().toLowerCase();
    const email = /.+@.+\..+/.test(emailRaw) ? emailRaw : undefined;

    if (!slug || !key) {
      res.status(400).json({
        success: false,
        message: 'slug and key query params are required.',
        code: 'PARAMS_REQUIRED',
      });
      return;
    }

    const tenant = await AppDataSource.getRepository(Tenant).findOne({ where: { slug } });
    // One opaque 401 for "no such shop", "no key configured", and
    // "wrong key" — a probing caller learns nothing about which.
    if (
      !tenant ||
      tenant.status !== TenantStatus.ACTIVE ||
      !tenant.lmsKey ||
      !keysMatch(tenant.lmsKey, key)
    ) {
      res.status(401).json({
        success: false,
        message: 'LMS link is not valid for this shop.',
        code: 'LMS_KEY_INVALID',
      });
      return;
    }

    // Single-use: the jti is consumed by /api/discovery/handoff/verify
    // on first landing; replays of the same minted token get rejected.
    const token = jwt.sign(
      {
        kind: 'handoff',
        tenantSlug: tenant.slug,
        ...(email ? { email } : {}),
        jti: randomBytes(12).toString('hex'),
      },
      getJwtSecret(),
      { expiresIn: HANDOFF_TTL_SECONDS },
    );

    const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const url =
      `${frontend}/auth/login?slug=${encodeURIComponent(tenant.slug)}` +
      `&handoff=${encodeURIComponent(token)}`;

    if (String(req.query.format || '') === 'json') {
      res.json({ success: true, data: { url, token, expiresIn: HANDOFF_TTL_SECONDS } });
      return;
    }
    res.redirect(302, url);
  } catch (err: any) {
    console.error('[integrations/lms] handoff error:', err?.message);
    res.status(500).json({ success: false, message: 'Could not start LMS handoff.' });
  }
});

export default router;
