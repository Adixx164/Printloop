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

// V2-36 — bootstrap Sentry BEFORE React mounts so init-time errors
// (broken env, missing globals) still get captured. The init is a
// safe no-op when VITE_SENTRY_DSN is unset, so dev runs cost nothing.
initSentryIfConfigured();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
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
  </React.StrictMode>
);
