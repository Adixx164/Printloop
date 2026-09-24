import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from "react-router-dom";

/**
 * Frontend error reporting (V2-36).
 *
 * Boots once at app start. Reads VITE_SENTRY_DSN; if unset, every
 * Sentry API on this file is a safe no-op (the SDK itself short-
 * circuits when there's no DSN). Dev runs therefore cost nothing.
 *
 * Wired in src/main.tsx — `initSentryIfConfigured()` runs BEFORE the
 * React root mounts so it can capture errors during initial render.
 *
 * What we capture:
 *   • Uncaught render errors via <Sentry.ErrorBoundary> in App.tsx
 *   • Route transitions as performance traces (React Router v6
 *     integration — wraps useLocation + useNavigationType from
 *     react-router-dom so spans match actual navigations)
 *   • User context + tenant tag, kept in sync via SentryAuthListener
 *
 * What we don't:
 *   • PII — sendDefaultPii: false; user object is { id, email } only
 *   • Reset-password tokens / handoff tokens — beforeSend strips
 *     query strings on URLs that match /reset-password or /login
 */

let initialized = false;

export function initSentryIfConfigured(): void {
  if (initialized) return;
  initialized = true;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // Match the backend's log line shape so devs see the same signal.
    // eslint-disable-next-line no-console
    console.log("[sentry] disabled (no VITE_SENTRY_DSN set).");
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_APP_VERSION as string) || undefined,
    // Performance — 10% trace sample by default; override via env.
    tracesSampleRate: Number(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
    ),
    // Replay — costs storage; off by default. Set to 0.1 or higher
    // to capture the click stream of failed sessions.
    replaysOnErrorSampleRate: Number(
      import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? 0,
    ),
    replaysSessionSampleRate: Number(
      import.meta.env.VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? 0,
    ),
    // PII — never on by default. Login emails arrive via the auth
    // listener with explicit consent of being our own field.
    sendDefaultPii: false,
    integrations: [
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      // Replay integration only spins up if either sample rate > 0.
      Sentry.replayIntegration({
        // Masking — never capture password / handoff inputs verbatim.
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event) {
      // Strip query strings on sensitive routes so a leaked
      // handoff/reset token can't ride along on an error event.
      const url = event.request?.url ?? "";
      if (
        /\/(reset-password|login|find\/[^/]+)/.test(url) &&
        event.request
      ) {
        event.request.query_string = undefined;
        event.request.url = url.split("?")[0];
      }
      return event;
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[sentry] enabled (env=${import.meta.env.MODE}).`);
}

/**
 * Set the Sentry user context. Called by SentryAuthListener whenever
 * the Redux auth slice transitions from logged-out to logged-in.
 *
 * Only the user's id + email are sent. We deliberately do NOT pass
 * the JWT or any privilege list — Sentry events are not the place
 * for credentials.
 */
export function setSentryUser(user: {
  id?: string;
  email?: string;
  role?: string;
} | null): void {
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    email: user.email,
    // Role as a tag — non-PII; useful for "show me errors hitting
    // platform admins only".
  });
  if (user.role) Sentry.setTag("user.role", user.role);
}

/**
 * Tag the resolved tenant on every subsequent event. Called when the
 * BrandProvider receives a tenant payload (subdomain / custom domain
 * resolution). Lets you filter Sentry issues to a single shop.
 */
export function setSentryTenant(slug: string | null): void {
  Sentry.setTag("tenant.slug", slug ?? "none");
}
