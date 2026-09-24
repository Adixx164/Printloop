import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  useVerifyEmailMutation,
  useResendVerificationMutation,
} from "@/store/services/saasApi";

/**
 * `/saas/verify-email` — landing page for the verification link
 * the backend emails to new tenant owners.
 *
 * Auto-attempts verification if `?token=` is present; otherwise
 * shows a manual code-entry form. A resend button is always shown
 * as a fallback.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [verify, verifyState] = useVerifyEmailMutation();
  const [resend, resendState] = useResendVerificationMutation();

  const [token, setToken] = useState(params.get("token") || "");
  const [email, setEmail] = useState(params.get("email") || "");
  const [resendEmail, setResendEmail] = useState("");

  useEffect(() => {
    const initial = params.get("token");
    if (initial) {
      verify({ token: initial, email: params.get("email") || undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (verifyState.data?.verified) {
      const t = setTimeout(() => navigate("/saas/login"), 1500);
      return () => clearTimeout(t);
    }
  }, [verifyState.data, navigate]);

  if (verifyState.data?.verified) {
    return (
      <div className="max-w-md mx-auto p-8 text-center">
        <h1 className="pl-serif font-extrabold text-3xl text-sage">✓ Email verified</h1>
        <p className="text-ink/60 mt-2">Redirecting to login…</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-8 space-y-6">
      <div>
        <div className="editorial-label text-persimmon mb-1">▸ ONE LAST STEP</div>
        <h1 className="pl-serif font-extrabold text-3xl tracking-tight">Verify your email</h1>
        <p className="text-ink/60 mt-1">
          Enter the 6-digit code we sent to your inbox.
        </p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          verify({ token, email: email || undefined });
        }}
      >
        <input
          className="pl-input"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="pl-input text-2xl tracking-widest text-center font-mono"
          placeholder="123456"
          maxLength={6}
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
        />
        {verifyState.isError && (
          <p className="text-persimmon text-sm font-semibold">
            {(verifyState.error as any)?.data?.message || "Invalid or expired code."}
          </p>
        )}
        <button
          type="submit"
          disabled={verifyState.isLoading || token.length !== 6}
          className="w-full pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {verifyState.isLoading ? "Checking…" : "Verify"}
        </button>
      </form>

      <div className="border-t-2 border-paper-deep pt-4">
        <p className="text-sm text-ink/60 mb-2">Didn't get the email?</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            resend({ email: resendEmail });
          }}
        >
          <input
            className="pl-input flex-1"
            type="email"
            placeholder="your@email.com"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={resendState.isLoading}
            className="pl-btn-ghost !px-4 !py-2.5 disabled:opacity-50"
          >
            {resendState.isLoading ? "Sending…" : "Resend"}
          </button>
        </form>
        {resendState.isSuccess && (
          <p className="text-sage text-sm mt-2 font-semibold">
            If that email matches an account, we sent a new code.
          </p>
        )}
      </div>
    </div>
  );
}
