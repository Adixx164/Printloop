import { Link } from "react-router-dom";
import {
  useGetTenantMeQuery,
  useGetTenantBalanceQuery,
  useListTransactionsQuery,
} from "@/store/services/saasApi";

/**
 * `/saas/dashboard` — printshop owner home.
 *
 * Restyled (V2-38) to the editorial-brutalist system the customer app
 * uses: Fraunces headlines, Ink/Paper/Persimmon palette, hard-shadow
 * buttons (`pl-btn-*`), `border-2 border-ink` cards. The balance card
 * still honours the tenant's brand primary colour (`--pl-brand-primary`)
 * with an Ink fallback instead of the old navy.
 */
export default function DashboardHomePage() {
  const me = useGetTenantMeQuery();
  const balance = useGetTenantBalanceQuery();
  const transactions = useListTransactionsQuery({ limit: 10 });

  if (me.isLoading || balance.isLoading) {
    return (
      <div className="p-8 pl-serif italic text-fog">Loading…</div>
    );
  }
  if (me.isError || !me.data) {
    return (
      <div className="p-8 pl-serif text-persimmon font-semibold">
        Could not load your shop.
      </div>
    );
  }

  const tenant = me.data;
  const bal = balance.data;
  const ngn = (n: number) => `₦${n.toLocaleString()}`;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Masthead */}
      <div>
        <div className="editorial-label text-persimmon mb-1">▸ YOUR SHOP</div>
        <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl leading-none tracking-tight">
          {tenant.name}
        </h1>
        <p className="mt-1 text-sm text-ink/60 font-mono">
          {tenant.slug}.printloop.app
          {tenant.status === "trial" && (
            <span className="ml-2 px-2 py-0.5 bg-ochre/20 text-ochre rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial">
              Trial
            </span>
          )}
        </p>
      </div>

      {/* Balance card — brand-primary with Ink fallback. */}
      <div
        className="text-paper rounded-pl-lg p-6 border-2 border-ink"
        style={{ backgroundColor: "var(--pl-brand-primary, #1A1410)" }}
      >
        <div className="editorial-label opacity-70">Available to pay out</div>
        <div className="pl-serif font-extrabold text-5xl mt-1 tracking-tight">
          {bal ? ngn(bal.availableBalance) : "—"}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 text-sm">
          <Stat label="Pending payout" value={bal ? ngn(bal.pendingPayout) : "—"} />
          <Stat
            label="Lifetime commission paid"
            value={bal ? ngn(bal.lifetimeCommissionPaidToPlatform) : "—"}
          />
          <Stat
            label="Your commission %"
            value={bal ? `${(bal.commissionPct * 100).toFixed(1)}%` : "—"}
          />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/saas/payouts"
            className="pl-btn bg-paper text-ink hover:!shadow-[5px_5px_0_#d14b2c]"
          >
            Manage payouts <span className="font-extrabold">→</span>
          </Link>
          <Link
            to="/saas/settings"
            className="pl-btn bg-transparent text-paper border-paper hover:!shadow-[5px_5px_0_#d14b2c]"
          >
            Settings <span className="font-extrabold">→</span>
          </Link>
        </div>
      </div>

      {/* Onboarding checklist */}
      <Card>
        <SectionHeading>Setup checklist</SectionHeading>
        <ChecklistItem
          done={tenant.onboarding.subaccountSet}
          title="Add your Paystack subaccount"
          subtitle="So we can split customer payments to your account automatically"
          cta={tenant.onboarding.subaccountSet ? "Done" : "Set up subaccount"}
          to="/saas/setup/subaccount?wizard=1"
        />
        <ChecklistItem
          done={tenant.onboarding.bankAccountSet}
          title="Add a payout bank account"
          subtitle="Where we'll send your earnings every Friday"
          cta={tenant.onboarding.bankAccountSet ? "Done" : "Add bank account"}
          to="/saas/setup/bank-account?wizard=1"
        />
        <ChecklistItem
          done={tenant.onboarding.brandingSet}
          title="Customize your branding"
          subtitle="Your logo, colors, and support info on customer receipts"
          cta={tenant.onboarding.brandingSet ? "Done" : "Set up branding"}
          to="/saas/settings/branding?wizard=1"
        />
        <ChecklistItem
          done={tenant.onboarding.locationSet}
          title="Set your shop address"
          subtitle="So students can find you on the map"
          cta={tenant.onboarding.locationSet ? "Done" : "Set address"}
          to="/saas/settings"
        />
        {tenant.onboarding.subaccountSet && tenant.onboarding.bankAccountSet && tenant.onboarding.brandingSet && tenant.onboarding.locationSet && (
          <p className="text-sage font-semibold text-sm mt-3 pl-serif italic">
            ✓ All set — customers' payments split automatically and your
            weekly payout is on its way.
          </p>
        )}
      </Card>

      {/* Recent revenue */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionHeading className="mb-0">Recent revenue</SectionHeading>
          <Link
            to="/saas/transactions"
            className="text-sm font-bold text-persimmon border-b-2 border-persimmon"
          >
            View all →
          </Link>
        </div>
        {transactions.isLoading && (
          <p className="text-fog text-sm pl-serif italic">Loading…</p>
        )}
        {transactions.data && transactions.data.items.length === 0 && (
          <p className="text-fog text-sm">
            No transactions yet. They'll appear here once customers start
            printing.
          </p>
        )}
        {transactions.data && transactions.data.items.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left editorial-label text-ink/50 border-b-2 border-ink">
                <th className="py-2">When</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Our cut</th>
              </tr>
            </thead>
            <tbody>
              {transactions.data.items.map((tx) => (
                <tr key={tx.id} className="border-b border-paper-deep last:border-0">
                  <td className="py-2.5">
                    {new Date(tx.createdAt).toLocaleString()}
                  </td>
                  <td className="capitalize font-semibold">{tx.type}</td>
                  <td className="font-mono">{ngn(tx.amount)}</td>
                  <td className="font-mono text-ink/60">
                    {ngn(tx.commissionAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Shared editorial primitives (local to the SaaS surface) ──────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper-light border-2 border-ink rounded-pl p-5 sm:p-6">
      {children}
    </div>
  );
}

function SectionHeading({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`pl-serif font-extrabold text-xl mb-4 ${className}`}>
      {children}
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="opacity-70 text-xs uppercase tracking-wider">{label}</div>
      <div className="font-bold text-lg mt-0.5">{value}</div>
    </div>
  );
}

function ChecklistItem(props: {
  done: boolean;
  title: string;
  subtitle: string;
  cta: string;
  to: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-t-2 border-paper-deep first:border-t-0">
      <div
        className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
          props.done
            ? "bg-sage text-white border-sage"
            : "bg-paper border-ink text-transparent"
        }`}
      >
        {props.done ? "✓" : ""}
      </div>
      <div className="flex-1">
        <div className="font-bold">{props.title}</div>
        <div className="text-sm text-ink/60">{props.subtitle}</div>
      </div>
      {!props.done && (
        <Link
          to={props.to}
          className="shrink-0 text-persimmon text-sm font-bold border-b-2 border-persimmon whitespace-nowrap"
        >
          {props.cta} →
        </Link>
      )}
    </div>
  );
}
