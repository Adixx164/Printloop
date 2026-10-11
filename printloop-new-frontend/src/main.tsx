import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { store } from "@/store";
import App from "@/App";
import BrandProvider from "@/components/BrandProvider";
import { SentryErrorBoundary } from "@/components/SentryErrorBoundary";
import { SentryAuthListener } from "@/components/SentryAuthListener";
import { initSentryIfConfigured } from "@/lib/sentry";
import "@/index.css";

class TempErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[TempErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
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
          <div style={{ maxWidth: 600, width: "100%", textAlign: "center" }}>
            <h1
              style={{
                fontFamily: "Fraunces, serif",
                fontWeight: 800,
                fontSize: 32,
                lineHeight: 1.1,
                margin: "0 0 16px",
              }}
            >
              Render Error Caught
            </h1>
            <pre
              style={{
                background: "#fff",
                border: "2px solid #1A1410",
                padding: "16px",
                borderRadius: "4px",
                textAlign: "left",
                fontSize: 12,
                fontFamily: "JetBrains Mono, monospace",
                overflow: "auto",
                maxHeight: "400px",
                whiteSpace: "pre-wrap",
              }}
            >
              {this.state.error?.message}
              {this.state.error?.stack && "\n\n" + this.state.error.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: "16px",
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
              RELOAD PAGE
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// V2-36 — bootstrap Sentry BEFORE React mounts so init-time errors
// (broken env, missing globals) still get captured. The init is a
// safe no-op when VITE_SENTRY_DSN is unset, so dev runs cost nothing.
initSentryIfConfigured();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TempErrorBoundary>
      <SentryErrorBoundary>
        <Provider store={store}>
          <BrowserRouter>
            {/* Keeps Sentry's user context in sync with the auth slice
                (login → setUser, logout → null). Renders nothing. */}
            <SentryAuthListener />
            <BrandProvider>
              <App />
            </BrandProvider>
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  background: "#1A1410",
                  color: "#F8F4ED",
                  border: "2px solid #1A1410",
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  letterSpacing: "0.04em",
                },
              }}
            />
          </BrowserRouter>
        </Provider>
      </SentryErrorBoundary>
    </TempErrorBoundary>
  </React.StrictMode>
);