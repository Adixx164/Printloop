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
        <div className="min-h-screen flex items-center justify-center p-6 bg-paper text-ink font-sans">
          <div className="max-w-[600px] w-full text-center">
            <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl leading-tight mb-4">
              Render Error Caught
            </h1>
            <pre className="bg-paper-light border-2 border-ink rounded-sm p-4 text-left text-xs pl-mono overflow-auto max-h-[400px] whitespace-pre-wrap">
              {this.state.error?.message}
              {this.state.error?.stack && "\n\n" + this.state.error.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 pl-btn bg-ink text-paper-light"
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
                className: "pl-btn bg-ink text-paper-light font-semibold text-sm",
              }}
            />
          </BrowserRouter>
        </Provider>
      </SentryErrorBoundary>
    </TempErrorBoundary>
  </React.StrictMode>
);