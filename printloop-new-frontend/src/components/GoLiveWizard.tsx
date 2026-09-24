import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  useGetTenantMeQuery,
  useGetOpsSummaryQuery,
  useSetDiscoverableMutation,
} from "@/store/services/saasApi";

/**
 * Guided "go live" wizard (V2-41) for the operator console.
 *
 * Three gated steps — Payments → Branding → Printer & test print —
 * each lit from REAL backend flags (no hard-coded `false`). The final
 * "Go live" action flips marketplace discoverability; the backend
 * enforces the live gate, so this can only succeed once everything
 * actually passes. Replaces the passive checklist.
 */
export default function GoLiveWizard() {
  const me = useGetTenantMeQuery();
  const ops = useGetOpsSummaryQuery();
  const [setDiscoverable, discState] = useSetDiscoverableMutation();

  const ob = me.data?.onboarding;
  const gate = ops.data?.liveGate;
  const isLive = Boolean(me.data?.isDiscoverable || gate?.isDiscoverable);

  const steps: WizardStep[] = [
    {
      key: "payments",
      n: 1,
      title: "Payments",
      blurb: "Connect Paystack so customer payments split to you automatically.",
      done: Boolean(ob?.subaccountSet && ob?.bankAccountSet),
      partial: Boolean(ob?.subaccountSet || ob?.bankAccountSet),
      actions: [
        { label: ob?.subaccountSet ? "Subaccount ✓" : "Set up subaccount", to: "/saas/setup/subaccount", muted: ob?.subaccountSet },
        { label: ob?.bankAccountSet ? "Bank account ✓" : "Add bank account", to: "/saas/setup/bank-account", muted: ob?.bankAccountSet },
      ],
    },
    {
      key: "branding",
      n: 2,
      title: "Branding",
      blurb: "Add your logo, colours, and support details so the shop looks like yours.",
      done: Boolean(ob?.brandingSet),
      actions: [
        { label: ob?.brandingSet ? "Edit branding" : "Add branding", to: "/saas/settings/branding", muted: ob?.brandingSet },
      ],
    },
    {
      key: "printer",
      n: 3,
      title: "Printer & test print",
      blurb: "Add a printer, pair the kiosk PC, and confirm a successful test page.",
      done: Boolean(gate?.testPrintDone && gate?.kioskOnline),
      partial: Boolean((ops.data?.kioskCount ?? 0) > 0),
      actions: [
        {
          label:
            (ops.data?.kioskCount ?? 0) > 0
              ? `Manage printers (${ops.data?.onlineCount ?? 0}/${ops.data?.kioskCount} online)`
              : "Add your first printer",
          to: "/saas/operator/printers",
          muted: false,
        },
      ],
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const progress = Math.round((doneCount / steps.length) * 100);
  const canGoLive = Boolean(ops.data?.liveGateMet) && !isLive;

  const onGoLive = async () => {
    try {
      await setDiscoverable({ isDiscoverable: true }).unwrap();
      toast.success("You're live — customers can find you on the map.");
    } catch (err: any) {
      const reason = err?.data?.reason || err?.data?.message;
      toast.error(reason ? `Not yet: ${reason}` : "Couldn't go live yet.");
    }
  };

  return (
    <div className="border-2 border-ink rounded-pl p-5 bg-paper-light">
      <div className="flex items-center justify-between mb-1">
        <h2 className="pl-serif font-extrabold text-xl">Go live in 3 steps</h2>
        <span className="text-sm font-bold">{progress}%</span>
      </div>
      <div className="h-2 border-2 border-ink bg-paper mb-5">
        <div
          className="h-full bg-sage transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="space-y-3">
        {steps.map((s, i) => {
          const prevDone = i === 0 || steps[i - 1].done;
          return <StepRow key={s.key} step={s} active={prevDone && !s.done} />;
        })}
      </ol>

      {/* Go-live control */}
      <div className="mt-5 pt-4 border-t-2 border-paper-deep">
        {isLive ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-bold text-sage">
              ✓ You're live on the marketplace.
            </div>
            <Link to="/find" className="text-sm font-bold text-persimmon border-b-2 border-persimmon">
              See your /find listing →
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-ink/60">
              {canGoLive
                ? "All checks pass — you're ready."
                : "Finish the steps above to unlock go-live."}
            </div>
            <button
              type="button"
              onClick={onGoLive}
              disabled={!canGoLive || discState.isLoading}
              className="pl-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {discState.isLoading ? "Going live…" : "Go live →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface WizardAction {
  label: string;
  to: string;
  muted?: boolean;
}
interface WizardStep {
  key: string;
  n: number;
  title: string;
  blurb: string;
  done: boolean;
  partial?: boolean;
  actions: WizardAction[];
}

function StepRow({ step, active }: { step: WizardStep; active: boolean }) {
  return (
    <li
      className={`flex items-start gap-3 border-2 rounded-pl p-3 transition-all ${
        step.done
          ? "border-sage bg-sage/5"
          : active
          ? "border-ink bg-paper"
          : step.partial
          ? "border-ochre/60 bg-ochre/5"
          : "border-ink/40 bg-paper"
      }`}
    >
      <div
        className={`shrink-0 mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
          step.done
            ? "bg-sage text-paper border-sage"
            : "bg-paper border-ink text-ink"
        }`}
      >
        {step.done ? "✓" : step.n}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold">{step.title}</div>
        <div className="text-xs text-ink/60">{step.blurb}</div>
        {!step.done && (
          <div className="flex flex-wrap gap-2 mt-2">
            {step.actions.map((a) => (
              <Link
                key={a.to + a.label}
                to={a.to}
                className={
                  a.muted
                    ? "text-[11px] font-bold text-sage"
                    : "pl-btn-dark !px-3 !py-1.5 !text-xs"
                }
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
