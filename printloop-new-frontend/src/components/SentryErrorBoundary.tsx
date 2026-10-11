import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";

/**
 * Whole-app error boundary wrapping <App /> (V2-36).
 *
 * Catches render exceptions, reports them to Sentry (when configured),
 * and shows a recoverable fallback UI so the customer isn't left
 * staring at a white screen.
 *
 * Resets when the user clicks "Reload" — which forces a hard
 * navigation, the cleanest way to recover from a corrupted store /
 * route state in production.
 */
export function SentryErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ eventId, resetError }) => (
        <ErrorFallback eventId={eventId} resetError={resetError} />
      )}
      showDialog={false}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

function ErrorFallback(props: {
  eventId: string | null;
  resetError: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-paper text-ink font-sans">
      <div className="max-w-[480px] w-full">
        <div className="editorial-label text-process mb-2">
          ▸ SOMETHING BROKE
        </div>
        <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl leading-tight mb-3">
          The page couldn&apos;t finish loading.
        </h1>
        <p className="text-sm leading-relaxed text-ink/80 mb-4">
          We&apos;ve been told. A reload usually fixes it. If the same
          screen comes back, copy the reference below and send it to
          support — we&apos;ll find what broke.
        </p>
        {props.eventId && (
          <p className="pl-mono text-xs bg-paper-light border-2 border-ink p-3 mb-4 break-all">
            Reference: {props.eventId}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              props.resetError();
              window.location.reload();
            }}
            className="pl-btn bg-ink text-paper-light"
          >
            RELOAD →
          </button>
          <a
            href="/"
            className="pl-btn bg-transparent text-ink border-ink"
          >
            BACK TO HOME
          </a>
        </div>
      </div>
    </div>
  );
}
