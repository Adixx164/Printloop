import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSetupBankAccountMutation } from "@/store/services/saasApi";

/**
 * `/saas/setup/bank-account` — bank account form.
 *
 * Bank code is the Paystack-recognised code (e.g. '058' for GTB).
 * In a future iteration we'd populate this from `GET /bank` so the
 * tenant picks from a list; for v1 the owner types the code.
 */
export default function SetupBankPage() {
  const navigate = useNavigate();
  const [setupBank, state] = useSetupBankAccountMutation();
  const [form, setForm] = useState({
    accountName: "",
    accountNumber: "",
    bankCode: "",
  });
  const [wizardMode, setWizardMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wizard') === '1') setWizardMode(true);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setupBank(form).unwrap();
      if (wizardMode) {
        navigate("/saas/settings/branding?wizard=1");
      } else {
        navigate("/saas/dashboard");
      }
    } catch {
      // Error surfaced below.
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6">
      <div className="editorial-label text-persimmon mb-1">▸ ONBOARDING</div>
      <h1 className="pl-serif font-extrabold text-3xl tracking-tight mb-2">
        Bank account for payouts
      </h1>
      <p className="text-ink/60 mb-6">
        We send your earnings here every Friday (or sooner if you
        request an instant payout). Must be a Nigerian Naira account.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Account holder name"
          value={form.accountName}
          onChange={(v) => setForm({ ...form, accountName: v })}
          placeholder="As shown on your bank statement"
          required
        />
        <Field
          label="Account number (10 digits)"
          value={form.accountNumber}
          onChange={(v) => setForm({ ...form, accountNumber: v.replace(/\D/g, "") })}
          maxLength={10}
          required
        />
        <Field
          label="Bank code"
          value={form.bankCode}
          onChange={(v) => setForm({ ...form, bankCode: v })}
          placeholder="e.g. 058 (GTBank), 011 (First Bank)"
          required
        />
        {state.isError && (
          <p className="text-persimmon text-sm font-semibold">
            {(state.error as any)?.data?.message || "Could not save bank account."}
          </p>
        )}
        <button
          type="submit"
          disabled={state.isLoading}
          className="w-full pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.isLoading ? "Saving…" : "Save bank account"}
        </button>
      </form>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider mb-1">
        {props.label}
      </label>
      <input
        className="pl-input"
        value={props.value}
        placeholder={props.placeholder}
        required={props.required}
        maxLength={props.maxLength}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}