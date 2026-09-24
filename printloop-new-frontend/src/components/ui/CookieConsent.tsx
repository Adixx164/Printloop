"use client";

import { useEffect, useState } from "react";

/**
 * Cookie consent banner (GDPR/NDPR/CCPA).
 * Only strictly necessary cookies are used (auth tokens, tenant context).
 * Banner appears once per device; "Accept" dismisses, "Reject" blocks
 * non-essential (currently none). Consent stored in localStorage.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("pl_cookie_consent");
    if (!consent) setShow(true);
  }, []);

  const accept = () => {
    localStorage.setItem("pl_cookie_consent", JSON.stringify({
      necessary: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    }));
    setShow(false);
  };

  const reject = () => {
    localStorage.setItem("pl_cookie_consent", JSON.stringify({
      necessary: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString(),
    }));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 sm:max-w-md z-50 animate-slide-up"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="bg-paper border-2 border-ink rounded-pl p-4 sm:p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="shrink-0 text-2xl">🍪</div>
          <div className="flex-1">
            <h3 className="font-bold text-sm sm:text-base">
              We respect your privacy
            </h3>
            <p className="text-ink/70 text-sm sm:text-base mt-1">
              PrintLoop uses only <strong>strictly necessary cookies</strong>:
              authentication tokens (HttpOnly, Secure) and tenant context
              (sessionStorage). We do <strong>not</strong> use analytics,
              advertising, or tracking cookies.
            </p>
            <p className="text-ink/60 text-xs mt-2">
              See our <a href="/privacy" className="text-persimmon underline hover:text-persimmon/80">
                Privacy Policy
              </a> for details.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={accept}
            className="pl-btn-primary text-sm !py-2 !px-4"
          >
            Accept
          </button>
          <button
            onClick={reject}
            className="pl-btn-ghost text-sm !py-2 !px-4"
          >
            Reject non-essential
          </button>
        </div>
      </div>
    </div>
  );
}