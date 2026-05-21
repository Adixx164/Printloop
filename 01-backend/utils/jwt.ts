import jwt, { type SignOptions } from 'jsonwebtoken';

/**
 * JWT secret. Falls back to a dev constant so the server runs without a
 * .env file in local development. Always override via env in production.
 */
export const JWT_SECRET: string =
  process.env.JWT_SECRET || 'printloop-dev-secret-please-change-32chars-minimum';

export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JwtPayload {
  userId: string;
  role?: string;
}

export function signAccessToken(payload: JwtPayload): string {
  const opts: SignOptions = { expiresIn: JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, JWT_SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
