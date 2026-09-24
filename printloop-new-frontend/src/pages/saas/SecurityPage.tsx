import { useState } from "react";
import {
  useGetTenantMeQuery,
  useSetup2faMutation,
  useEnable2faMutation,
  useDisable2faMutation,
} from "@/store/services/saasApi";

/**
 * `/saas/settings/security` — 2FA (TOTP) enrolment (V2-24).
 *
 * Flow: Setup → shows the secret + otpauth URL → user adds it to an
 * authenticator → enters a live code → Enable. Disable also requires
 * a current code (so a hijacked session can't strip 2FA).
 *
 * NOTE: tenant.onboarding from /me doesn't carry the 2FA flag yet, so
 * we track enrolment state locally across the setup→enable steps;
 * a page reload resets the view but the backend remains the source of
 * truth (enable is idempotent on a valid code).
 */
export default function SecurityPage() {
  const me = useGetTenantMeQuery();
  const [setup, setupState] = useSetup2faMutation();
  const [enable, enableState] = useEnable2faMutation();
  const [disable, disableState] = useDisable2faMutation();

  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const onSetup = async () => {
    try {
      const r = await setup().unwrap();
      setSecret(r.secret);
      setOtpauth(r.otpauthUrl);
    } catch {
      /* surfaced below */
    }
  };

  const onEnable = async () => {
    try {
      await enable({ code }).unwrap();
      setEnabled(true);
      setSecret(null);
      setOtpauth(null);
      setCode("");
    } catch {
      /* surfaced below */
    }
  };

  const onDisable = async () => {
    try {
      await disable({ code }).unwrap();
      setEnabled(false);
      setCode("");
    } catch {
      /* surfaced below */
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">
          Security — Two-factor auth
        </h2>
        <p className="text-sm text-ink/60">
          Add a time-based code (TOTP) on top of your password. Works
          with Google Authenticator, Authy, 1Password, etc.
        </p>
      </div>

      {enabled === true && (
        <div className="bg-sage/15 border-2 border-sage rounded-pl p-4">
          <p className="font-bold text-sage">✓ Two-factor is on.</p>
          <p className="text-sm text-ink/60 mt-1">
            You'll be asked for a code at every login.
          </p>
        </div>
      )}

      {/* Step 1: setup */}
      {!secret && enabled !== true && (
        <div className="border-2 border-ink rounded-pl p-4 space-y-3 bg-paper-light">
          <h3 className="font-bold">Turn on 2FA</h3>
          <button
            onClick={onSetup}
            disabled={setupState.isLoading}
            className="pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {setupState.isLoading ? "Starting…" : "Begin setup"}
          </button>
          {setupState.isError && (
            <p className="text-persimmon text-sm font-semibold">
              {(setupState.error as any)?.data?.message || "Setup failed."}
            </p>
          )}
        </div>
      )}

      {/* Step 2: show secret + confirm with a code */}
      {secret && (
        <div className="border-2 border-ink rounded-pl p-4 space-y-3 bg-paper-light">
          <h3 className="font-bold">Add this to your authenticator</h3>
          <p className="text-sm text-ink/60">
            Scan the otpauth link or type the secret manually, then
            enter the 6-digit code it shows.
          </p>
          <div className="bg-paper-warm border-2 border-ink rounded-pl-sm p-2 font-mono text-xs break-all">
            <div>
              <span className="text-ink/40">secret </span>
              {secret}
            </div>
            <div className="mt-1">
              <span className="text-ink/40">otpauth </span>
              {otpauth}
            </div>
          </div>
          <input
            className="pl-input tracking-[0.3em] text-center text-lg w-40 font-mono"
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          {enableState.isError && (
            <p className="text-persimmon text-sm font-semibold">
              {(enableState.error as any)?.data?.message ||
                "Code didn't verify."}
            </p>
          )}
          <div>
            <button
              onClick={onEnable}
              disabled={enableState.isLoading || code.length !== 6}
              className="pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enableState.isLoading ? "Verifying…" : "Verify & enable"}
            </button>
          </div>
        </div>
      )}

      {/* Disable */}
      {enabled !== false && !secret && (
        <details className="border-2 border-ink rounded-pl p-4 bg-paper-light">
          <summary className="font-bold cursor-pointer text-ink/70">
            Already enrolled? Disable 2FA
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-sm text-ink/60">
              Enter a current code to turn 2FA off.
            </p>
            <input
              className="pl-input tracking-[0.3em] text-center text-lg w-40 font-mono"
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {disableState.isError && (
              <p className="text-persimmon text-sm font-semibold">
                {(disableState.error as any)?.data?.message ||
                  "Could not disable."}
              </p>
            )}
            <div>
              <button
                onClick={onDisable}
                disabled={disableState.isLoading || code.length !== 6}
                className="pl-btn !bg-persimmon !text-paper !border-persimmon disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Disable 2FA
              </button>
            </div>
          </div>
        </details>
      )}

      <p className="text-xs text-ink/40">
        Signed in as {me.data?.name ?? "your tenant"}.
      </p>
    </div>
  );
}
