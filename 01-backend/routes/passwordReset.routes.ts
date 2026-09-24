/**
 * Password reset (V2-29).
 *
 * Two routes — mounted at /api/auth so the frontend's existing
 * `auth/forgot-password` and `auth/reset-password` RTK Query
 * mutations call them without any frontend change. Mounted BEFORE
 * devApi.routes.ts so the real implementation wins over the
 * security-broken dev mock that used to live at the same path.
 *
 *   POST /api/auth/forgot-password { email }
 *     Always returns 200 with an opaque body — never reveals whether
 *     the email is registered. Anti-enumeration matters here because
 *     the reset surface is anonymous: leaking "this email is in our
 *     system" hands attackers a working customer list.
 *
 *   POST /api/auth/reset-password { email, token, password }
 *     Validates token + expiry, hashes + saves the new password,
 *     clears the token so it can't be reused.
 *
 * Token design: `${secret}.${expiresAtMs}` where `secret` is 32
 * hex chars from crypto.randomBytes. We store the same string on
 * user.resetToken — no schema change needed. Validation parses,
 * checks expiry, then constant-time compares the stored secret with
 * the submitted secret. Expiry is 60 minutes.
 */
import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppDataSource } from '../config/database.js';
import { User } from '../entities/user.entity.js';
import { Tenant } from '../entities/tenant.entity.js';
import { LEGACY_TENANT_SLUG } from '../middleware/tenant.middleware.js';
import { EmailService } from '../services/email.service.js';

const router = Router();
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const ANTI_ENUMERATION_OK = {
  success: true,
  message:
    'If that email is registered, a password-reset link has been sent.',
};

/**
 * Resolve which tenant a forgot/reset is scoped to. Mirrors the
 * customer-login pattern: req.tenant if a subdomain/header resolved
 * one, else the legacy tenant. Email is unique per-(email, tenant),
 * so the same person on two tenants gets two independent reset
 * lifecycles.
 */
async function resolveTenantId(req: Request): Promise<string | null> {
  if (req.tenant?.id) return req.tenant.id;
  const legacy = await AppDataSource.getRepository(Tenant).findOne({
    where: { slug: LEGACY_TENANT_SLUG },
  });
  return legacy?.id ?? null;
}

function mintToken(): { token: string; expiresAtMs: number } {
  const secret = randomBytes(32).toString('hex');
  const expiresAtMs = Date.now() + RESET_TTL_MS;
  return { token: `${secret}.${expiresAtMs}`, expiresAtMs };
}

function parseToken(token: string): { secret: string; expiresAtMs: number } | null {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const secret = token.slice(0, dot);
  const expiresAtMs = Number(token.slice(dot + 1));
  if (!secret || !Number.isFinite(expiresAtMs)) return null;
  return { secret, expiresAtMs };
}

/**
 * Constant-time equality on the stored vs. submitted secret half.
 * Length-mismatch returns false without comparing.
 */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  return timingSafeEqual(aBuf, bBuf);
}

/** POST /api/auth/forgot-password */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email || !/.+@.+\..+/.test(email)) {
      // Still respond opaquely so the response shape never leaks
      // validation outcomes for known-vs-unknown emails.
      res.json(ANTI_ENUMERATION_OK);
      return;
    }
    const tenantId = await resolveTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: tenantId ? { email, tenantId } : { email },
    });

    if (user && !user.isBlocked) {
      const { token } = mintToken();
      user.resetToken = token;
      await userRepo.save(user);

      const frontendUrl =
        process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl =
        `${frontendUrl.replace(/\/$/, '')}/reset-password` +
        `?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

      // Best-effort email. When SMTP is unconfigured (dev) the
      // EmailService logs a no-op line that the e2e scrapes for
      // the token; in production it actually sends.
      try {
        const mailer = new EmailService();
        await mailer.sendPasswordReset({
          to: email,
          firstName: user.firstName || '',
          resetUrl,
          token,
        });
      } catch (mailErr) {
        // Email failure must NOT change the response shape — we
        // already minted the token; the user can retry.
        console.error('[forgot-password] email send threw:', mailErr);
      }

      // Dev-mode token log so QA + tests can complete the flow
      // without a real inbox. Stripped under NODE_ENV=production.
      if (process.env.NODE_ENV !== 'production') {
        console.log(
          `[forgot-password] minted token for ${email}: ${token}`,
        );
      }
    }

    res.json(ANTI_ENUMERATION_OK);
  } catch (err) {
    console.error('[forgot-password] error:', err);
    // Even on error we keep the opaque success — internal failures
    // should never become an enumeration oracle.
    res.json(ANTI_ENUMERATION_OK);
  }
});

/** POST /api/auth/reset-password */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const token = String(body.token || '');
    const password = String(body.password || '');

    if (!email || !token || !password) {
      res.status(400).json({
        success: false,
        message: 'Email, token, and new password are required.',
      });
      return;
    }
    if (password.length < 10) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 10 characters.',
      });
      return;
    }
    const parsed = parseToken(token);
    if (!parsed) {
      res.status(400).json({
        success: false,
        message: 'Reset link is invalid.',
        code: 'TOKEN_MALFORMED',
      });
      return;
    }
    if (parsed.expiresAtMs < Date.now()) {
      res.status(400).json({
        success: false,
        message: 'Reset link has expired. Request a new one.',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    const tenantId = await resolveTenantId(req);
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: tenantId ? { email, tenantId } : { email },
    });
    if (!user || !user.resetToken) {
      res.status(400).json({
        success: false,
        message: 'Reset link is invalid.',
        code: 'TOKEN_INVALID',
      });
      return;
    }
    const stored = parseToken(user.resetToken);
    if (!stored || !secretsMatch(stored.secret, parsed.secret)) {
      res.status(400).json({
        success: false,
        message: 'Reset link is invalid.',
        code: 'TOKEN_INVALID',
      });
      return;
    }

    user.passwordHash = bcrypt.hashSync(password, 12);
    user.salt = 'bcrypt';
    // Single-use: clear immediately so the same link can't be
    // replayed. The frontend submits ONCE; if it races we'd rather
    // fail-closed than allow a second password set.
    user.resetToken = null as any;
    await userRepo.save(user);

    res.json({
      success: true,
      message: 'Password has been reset. You can sign in with your new password.',
    });
  } catch (err) {
    console.error('[reset-password] error:', err);
    res.status(500).json({
      success: false,
      message: 'Could not reset password.',
    });
  }
});

export default router;
