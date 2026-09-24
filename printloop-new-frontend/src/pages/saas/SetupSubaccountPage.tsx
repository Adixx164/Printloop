import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSetupPaystackSubaccountMutation } from "@/store/services/saasApi";

/**
 * `/saas/setup/subaccount` — create the Paystack subaccount that
 * receives the tenant's share of every customer payment.
 *
 * After this is set, every customer charge goes through Paystack
 * Split: PrintLoop's commission lands in our main account, the
 * remainder lands in this subaccount. The bank-account step is
 * separate (Transfer Recipient — for actual disbursement).
 */
export default function SetupSubaccountPage() {
  const navigate = useNavigate();
  const [setupSubaccount, state] = useSetupPaystackSubaccountMutation();
  const [form, setForm] = useState({
    businessName: "",
    settlementBank: "",
    accountNumber: "",
  });
  const [wizardMode, setWizardMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wizard') === '1') setWizardMode(true);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setupSubaccount(form).unwrap();
      if (wizardMode) {
        navigate("/saas/setup/bank-account?wizard=1");
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
        Paystack subaccount
      </h1>
      <p className="text-ink/60 mb-6">
        We create a Paystack subaccount in your business's name. Every
        customer payment routes here automatically — PrintLoop's
        commission is deducted by Paystack at the moment of charge.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Business name (as Paystack sees you)"
          value={form.businessName}
          onChange={(v) => setForm({ ...form, businessName: v })}
          required
        />
        <Field
          label="Settlement bank code"
          value={form.settlementBank}
          onChange={(v) => setForm({ ...form, settlementBank: v })}
          placeholder="e.g. 058 for GTBank"
          required
        />
        <Field
          label="Account number"
          value={form.accountNumber}
          onChange={(v) => setForm({ ...form, accountNumber: v.replace(/\D/g, "") })}
          maxLength={10}
          required
        />
        {state.isError && (
          <p className="text-persimmon text-sm font-semibold">
            {(state.error as any)?.data?.message || "Could not create subaccount."}
          </p>
        )}
        <button
          type="submit"
          disabled={state.isLoading}
          className="w-full pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.isLoading ? "Creating…" : "Create subaccount"}
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