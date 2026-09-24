import jwt, { type SignOptions } from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { TenantMember, TenantMemberRole } from '../entities/tenantMember.entity';

/**
 * JWT secret. Falls back to a dev constant so the server runs without a
 * .env file in local development. Always override via env in production.
 */
export const JWT_SECRET: string =
  process.env.JWT_SECRET || 'printloop-dev-secret-please-change-32chars-minimum';

export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Strict secret accessor for the anonymous token surfaces (marketplace
 * + LMS handoff). Unlike `JWT_SECRET` — which carries a dev fallback so
 * the server boots without a .env — this REFUSES a missing or weak
 * secret, so a misconfigured production can never mint guessable
 * handoff tokens. Single source for the check that used to be copy-
 * pasted into discovery.routes + integrations.routes.
 */
export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'JWT_SECRET is required (≥16 chars) — used to sign handoff tokens.',
    );
  }
  return s;
}

/**
 * A single tenant membership embedded in the JWT. Roles match
 * `TenantMemberRole` enum values (owner / admin / staff).
 *
 * Why in the JWT vs DB lookup per-request: per-request lookup adds a
 * SQL roundtrip to every authed call. JWT staleness window is bounded
 * by token lifetime (default 7d); a revoked membership becomes
 * effective after the user logs out + back in, or after a forced
 * refresh. That's acceptable for v1; v2 can move to a Redis-cached
 * lookup if real-time revocation becomes a requirement.
 */
export interface JwtTenantMembership {
  tenantId: string;
  role: TenantMemberRole;
}

export interface JwtPayload {
  userId: string;
  role?: string;
  /** Tenant memberships at token-issue time. May be stale. */
  memberships?: JwtTenantMembership[];
  /**
   * Impersonation marker (Dimension 11 — V2-14). When set, a platform
   * admin is acting as this tenant; every audit log entry emitted
   * during the session is tagged so the trail shows "real platform
   * admin acted on behalf of tenant X" instead of "tenant X did it".
   */
  impersonating?: {
    tenantId: string;
    /** The real platform-admin userId issuing the action. */
    actorUserId: string;
  };
}

export function signAccessToken(
  payload: JwtPayload,
  options?: { expiresIn?: string | number },
): string {
  const opts: SignOptions = {
    expiresIn:
      (options?.expiresIn ?? JWT_EXPIRES_IN) as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, JWT_SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/**
 * Convenience: load a user's tenant memberships from the DB so the
 * login route can stamp them on a freshly-issued JWT.
 */
export async function loadMembershipsForUser(
  userId: string,
): Promise<JwtTenantMembership[]> {
  const rows = await AppDataSource.getRepository(TenantMember).find({
    where: { userId },
  });
  return rows.map((r) => ({ tenantId: r.tenantId, role: r.role }));
}
