import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { config } from '../config/index';

let sentryInitialized = false;

export function initSentry(): void {
  if (sentryInitialized) return;
  if (!config.sentry.dsn) {
    console.log('[Sentry] DSN not configured — error reporting disabled');
    return;
  }

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.app.env,
    release: config.app.version,
    tracesSampleRate: config.sentry.tracesSampleRate,
    profilesSampleRate: config.sentry.profilesSampleRate,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      nodeProfilingIntegration(),
    ],
    beforeSend(event, hint) {
      // Filter out known noisy errors in development
      if (config.app.env !== 'production') {
        const error = hint.originalException;
        if (error instanceof Error) {
          // Skip validation errors, auth errors, etc.
          if (error.message.includes('ValidationError') ||
              error.message.includes('Unauthorized') ||
              error.message.includes('RATE_LIMIT')) {
            return null;
          }
        }
      }
      return event;
    },
    initialScope: {
      tags: {
        service: 'printloop-api',
      },
    },
  });

  sentryInitialized = true;
  console.log('[Sentry] Initialized');
}

export function captureException(error: unknown, context?: Record<string, unknown>): string | undefined {
  if (!sentryInitialized || !config.sentry.dsn) return undefined;
  return Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>): string | undefined {
  if (!sentryInitialized || !config.sentry.dsn) return undefined;
  return Sentry.captureMessage(message, { level, extra: context });
}

export function setUserContext(user: { id: string; email?: string; role?: string; tenantId?: string }): void {
  if (!sentryInitialized || !config.sentry.dsn) return;
  Sentry.setUser(user);
}

export function clearUserContext(): void {
  if (!sentryInitialized || !config.sentry.dsn) return;
  Sentry.setUser(null);
}

export function addBreadcrumb(breadcrumb: { category: string; message: string; level?: 'info' | 'warning' | 'error' }): void {
  if (!sentryInitialized || !config.sentry.dsn) return;
  Sentry.addBreadcrumb(breadcrumb);
}

export function startSpan(name: string, op: string, callback: (span: unknown) => void): void {
  if (!sentryInitialized || !config.sentry.dsn) {
    callback({} as any);
    return;
  }
  Sentry.startSpan({ name, op }, (span) => {
    callback(span);
  });
}

export const sentryMiddleware = Sentry.expressErrorHandler();