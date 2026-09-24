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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        backgroundColor: "#F8F4ED",
        color: "#1A1410",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "#D14B2C",
            marginBottom: 8,
          }}
        >
          ▸ SOMETHING BROKE
        </div>
        <h1
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 36,
            lineHeight: 1.05,
            margin: "0 0 12px",
          }}
        >
          The page couldn&apos;t finish loading.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.8 }}>
          We&apos;ve been told. A reload usually fixes it. If the same
          screen comes back, copy the reference below and send it to
          support — we&apos;ll find what broke.
        </p>
        {props.eventId && (
          <p
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 12,
              backgroundColor: "#fff",
              border: "2px solid #1A1410",
              padding: "10px 12px",
              margin: "16px 0",
              wordBreak: "break-all",
            }}
          >
            Reference: {props.eventId}
          </p>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              props.resetError();
              window.location.reload();
            }}
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.04em",
              backgroundColor: "#1A1410",
              color: "#F8F4ED",
              border: "2px solid #1A1410",
              padding: "12px 20px",
              cursor: "pointer",
            }}
          >
            RELOAD →
          </button>
          <a
            href="/"
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.04em",
              color: "#1A1410",
              border: "2px solid #1A1410",
              padding: "12px 20px",
              textDecoration: "none",
            }}
          >
            BACK TO HOME
          </a>
        </div>
      </div>
    </div>
  );
}
