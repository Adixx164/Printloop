import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useSignupTenantMutation,
  useCheckSlugMutation,
} from "@/store/services/saasApi";
import { Reveal } from "@/components/ui/scrollFx";

/**
 * `/saas/signup` — anonymous tenant sign-up.
 *
 * Captures the minimum for `POST /api/saas/signup`: business name +
 * slug + owner identity. On success, the backend returns the
 * tenant's login URL on its own subdomain — we route the browser
 * there.
 *
 * Slug availability is checked live as the owner types, debounced
 * 400ms. The reserved-slug list lives server-side; this page just
 * surfaces the response.
 */
export default function SignupPage() {
  const navigate = useNavigate();
  const [signup, signupState] = useSignupTenantMutation();
  const [checkSlug] = useCheckSlugMutation();

  const [form, setForm] = useState({
    businessName: "",
    slug: "",
    ownerFirstName: "",
    ownerLastName: "",
    ownerEmail: "",
    ownerPhone: "",
    ownerPassword: "",
  });
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [debounceTimer, setDebounceTimer] = useState<number | null>(null);

  const onSlugChange = (value: string) => {
    setForm((f) => ({ ...f, slug: value }));
    if (debounceTimer) window.clearTimeout(debounceTimer);
    if (!value) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const t = window.setTimeout(async () => {
      try {
        const r = await checkSlug({ slug: value }).unwrap();
        if (r.available) setSlugStatus("available");
        else if (r.reason === "invalid-format") setSlugStatus("invalid");
        else setSlugStatus("taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 400);
    setDebounceTimer(t as unknown as number);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await signup(form).unwrap();
      // Redirect to the tenant's subdomain login. In dev (no real
      // wildcard DNS), navigate to the shop sign-in page.
      if (window.location.hostname.includes("printloop")) {
        window.location.href = r.loginUrl;
      } else {
        navigate(`/saas/verify-email?welcome=1&slug=${r.tenantSlug}`);
      }
    } catch (err) {
      // Error surfaced via signupState.error below.
      console.error(err);
    }
  };

  // After verification, the verify-email page redirects to /saas/login
  // with welcome=1&slug=... which shows a welcome banner. After login,
  // the SaasShell loads and the dashboard shows the onboarding checklist.
  // The first step (subaccount) links with ?wizard=1 to chain the flow.

  const slugMsg: Record<typeof slugStatus, string | null> = {
    idle: null,
    checking: "Checking…",
    available: "✓ Available",
    taken: "Already taken",
    invalid: "Must be 3–30 chars, lowercase letters / digits / dashes",
  };

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <Reveal variant="rise">
        <div className="editorial-label text-persimmon mb-1">▸ FOR PRINT SHOPS</div>
      </Reveal>
      <Reveal variant="wipe" delay={100}>
        <h1 className="pl-serif font-extrabold text-4xl tracking-tight mb-2">
          Start your <em className="italic text-persimmon">PrintLoop</em> business
        </h1>
      </Reveal>
      <Reveal variant="rise" delay={220}>
        <p className="text-ink/60 mb-8">
          ₦0 to sign up. We earn 10% on every print you process. No card,
          no monthly fee — payouts to your bank account every Friday.
        </p>
      </Reveal>
      <Reveal variant="rise" delay={320}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Business name"
          value={form.businessName}
          onChange={(v) => setForm({ ...form, businessName: v })}
          required
        />
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-1">
            Subdomain
          </label>
          <div className="flex items-center gap-2">
            <input
              className="pl-input flex-1"
              value={form.slug}
              onChange={(e) => onSlugChange(e.target.value.toLowerCase())}
              placeholder="kampala-prints"
              required
            />
            <span className="text-ink/50 text-sm font-mono">.printloop.app</span>
          </div>
          {slugMsg[slugStatus] && (
            <p
              className={`text-sm mt-1 font-semibold ${
                slugStatus === "available"
                  ? "text-sage"
                  : slugStatus === "checking"
                  ? "text-fog"
                  : "text-persimmon"
              }`}
            >
              {slugMsg[slugStatus]}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Your first name"
            value={form.ownerFirstName}
            onChange={(v) => setForm({ ...form, ownerFirstName: v })}
            required
          />
          <Field
            label="Your last name"
            value={form.ownerLastName}
            onChange={(v) => setForm({ ...form, ownerLastName: v })}
            required
          />
        </div>
        <Field
          label="Email"
          type="email"
          value={form.ownerEmail}
          onChange={(v) => setForm({ ...form, ownerEmail: v })}
          required
        />
        <Field
          label="Phone (+234…)"
          value={form.ownerPhone}
          onChange={(v) => setForm({ ...form, ownerPhone: v })}
          required
        />
        <Field
          label="Password (10+ chars)"
          type="password"
          value={form.ownerPassword}
          onChange={(v) => setForm({ ...form, ownerPassword: v })}
          required
        />

        {signupState.isError && (
          <p className="text-persimmon text-sm font-semibold">
            {(signupState.error as any)?.data?.message ||
              "Signup failed. Try again."}
          </p>
        )}

        <button
          type="submit"
          disabled={signupState.isLoading || slugStatus === "taken" || slugStatus === "invalid"}
          className="w-full pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signupState.isLoading ? "Creating your business…" : "Create my PrintLoop"}
        </button>
        <p className="text-xs text-ink/50 text-center">
          By signing up you agree to our Terms of Service. We email you a
          6-digit code to verify your address.
        </p>
      </form>
      </Reveal>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider mb-1">
        {props.label}
      </label>
      <input
        className="pl-input"
        value={props.value}
        type={props.type || "text"}
        required={props.required}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
