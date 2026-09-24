import { useEffect } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { setSentryUser } from "@/lib/sentry";

/**
 * Bridges the Redux auth slice to Sentry's user context (V2-36).
 *
 * Mounted once near the root of App.tsx. Subscribes to auth.user;
 * whenever the slice changes (login → logged-in, logout → null,
 * token-refresh → updated id) it calls Sentry.setUser so subsequent
 * errors carry the right identity.
 *
 * Doesn't render anything.
 */
export function SentryAuthListener() {
  const user = useSelector((s: RootState) => s.auth.user);
  useEffect(() => {
    setSentryUser(user || null);
  }, [user?.id, user?.email, user?.role]);
  return null;
}
