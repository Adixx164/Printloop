/**
 * Client-side JWT payload decode (no verification — display only).
 * Used to read the `impersonating` claim so the UI can show the
 * "acting as <tenant>" banner. Never trust this for auth decisions;
 * the backend verifies the signature on every request.
 */
export interface DecodedToken {
  userId?: string;
  role?: string;
  memberships?: { tenantId: string; role: string }[];
  impersonating?: { tenantId: string; actorUserId: string };
  exp?: number;
  iat?: number;
}

export function decodeToken(token: string | null): DecodedToken | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as DecodedToken;
  } catch {
    return null;
  }
}
