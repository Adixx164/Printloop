import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGetBrandingQuery,
  useUpdateBrandingMutation,
  type BrandingPatch,
} from "@/store/services/saasApi";

/**
 * `/saas/settings/branding` — white-label editor (Dimension 7).
 * Live colour swatches; everything optional (blank = platform
 * default).
 */
export default function BrandingPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useGetBrandingQuery();
  const [save, saveState] = useUpdateBrandingMutation();
  const [form, setForm] = useState<BrandingPatch>({});

  useEffect(() => {
    if (data) {
      setForm({
        wordmark: data.wordmark ?? "",
        tagline: data.tagline ?? "",
        logoUrl: data.logoUrl ?? "",
        faviconUrl: data.faviconUrl ?? "",
        primaryColor: data.primaryColor ?? "",
        secondaryColor: data.secondaryColor ?? "",
        accentColor: data.accentColor ?? "",
        emailFromName: data.emailFromName ?? "",
        supportEmail: data.supportEmail ?? "",
        supportPhone: data.supportPhone ?? "",
      });
    }
  }, [data]);

  if (isLoading) return <p className="text-fog pl-serif italic">Loading…</p>;

  const set = (k: keyof BrandingPatch, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const [wizardMode, setWizardMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wizard') === '1') setWizardMode(true);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Send empty strings as null-clears (backend treats "" as clear).
    await save(form).unwrap().catch(() => {});
    if (wizardMode) {
      navigate("/saas/dashboard");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <h2 className="pl-serif font-extrabold text-2xl tracking-tight">Branding</h2>
      <p className="text-sm text-ink/60">
        How your customers see your print business. Leave blank to use
        PrintLoop defaults.
      </p>

      <Text label="Wordmark" value={form.wordmark} onChange={(v) => set("wordmark", v)} placeholder="Your business name" />
      <Text label="Tagline" value={form.tagline} onChange={(v) => set("tagline", v)} placeholder="Print, pay, pick up." />
      <Text label="Logo URL" value={form.logoUrl} onChange={(v) => set("logoUrl", v)} placeholder="https://…/logo.png" />
      <Text label="Favicon URL" value={form.faviconUrl} onChange={(v) => set("faviconUrl", v)} placeholder="https://…/favicon.ico" />

      <div className="grid grid-cols-3 gap-4">
        <Color label="Primary" value={form.primaryColor} onChange={(v) => set("primaryColor", v)} />
        <Color label="Secondary" value={form.secondaryColor} onChange={(v) => set("secondaryColor", v)} />
        <Color label="Accent" value={form.accentColor} onChange={(v) => set("accentColor", v)} />
      </div>

      <Text label="Email 'from' name" value={form.emailFromName} onChange={(v) => set("emailFromName", v)} placeholder="Kampala Prints" />
      <div className="grid grid-cols-2 gap-4">
        <Text label="Support email" value={form.supportEmail} onChange={(v) => set("supportEmail", v)} placeholder="help@…" />
        <Text label="Support phone" value={form.supportPhone} onChange={(v) => set("supportPhone", v)} placeholder="+234…" />
      </div>

      {saveState.isError && (
        <p className="text-persimmon text-sm font-semibold">
          {(saveState.error as any)?.data?.message || "Could not save."}
        </p>
      )}
      {saveState.isSuccess && (
        <p className="text-sage text-sm font-semibold pl-serif italic">Saved.</p>
      )}
      <button
        type="submit"
        disabled={saveState.isLoading}
        className="pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saveState.isLoading ? "Saving…" : "Save branding"}
      </button>
    </form>
  );
}

function Text(props: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider mb-1">
        {props.label}
      </label>
      <input
        className="pl-input"
        value={props.value ?? ""}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

function Color(props: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(props.value ?? "");
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider mb-1">
        {props.label}
      </label>
      <div className="flex items-center gap-2">
        <span
          className="w-9 h-9 rounded-pl-sm border-2 border-ink shrink-0"
          style={{ background: valid ? (props.value as string) : "#ffffff" }}
        />
        <input
          className="pl-input flex-1 font-mono"
          value={props.value ?? ""}
          placeholder="#1A1410"
          onChange={(e) => props.onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
