/**
 * Error reporting (V2-34) — Sentry SDK, init-gated by env.
 *
 * Production deployments set SENTRY_DSN and get full exception
 * capture; dev runs leave it unset and we no-op with a single log
 * line so nobody thinks the SDK is broken when no errors appear in
 * the dashboard.
 *
 * Why server-side only: backend errors are the higher-value signal
 * for a SaaS. The frontend can be added later via @sentry/react if
 * the user picks Sentry — keeping the SDK choice open until then.
 */
import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentryIfConfigured(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[sentry] disabled (no SENTRY_DSN set).');
    initialized = true;
    return;
  }
  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || undefined,
      // Sensible defaults — adjust per traffic.
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      profilesSampleRate: Number(
        process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 0,
      ),
      // Defence-in-depth: never let the SDK exfiltrate a token by
      // accident. The HTTP integration strips Authorization on the
      // request crumb by default, but we belt-and-braces it.
      sendDefaultPii: false,
    });
    console.log(
      `[sentry] enabled (env=${process.env.NODE_ENV || 'development'}, ` +
        `release=${process.env.APP_VERSION || 'unset'}).`,
    );
    initialized = true;
  } catch (err) {
    console.warn('[sentry] init threw — continuing without error reporting:', err);
    initialized = true;
  }
}

/**
 * Capture an exception explicitly (use sparingly — the auto-handlers
 * already cover unhandled paths). Returns the Sentry event ID for
 * inclusion in user-facing error responses.
 */
export function reportError(err: unknown, context?: Record<string, unknown>): string | undefined {
  if (!process.env.SENTRY_DSN) return undefined;
  try {
    return Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    return undefined;
  }
}

export { Sentry };
