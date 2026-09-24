import { Link } from "react-router-dom";
import {
  useGetTenantMeQuery,
  useGetTenantBalanceQuery,
  useListTransactionsQuery,
  useGetOpsSummaryQuery,
} from "@/store/services/saasApi";
import GoLiveWizard from "@/components/GoLiveWizard";

export default function OperatorConsolePage() {
  const me = useGetTenantMeQuery();
  const balance = useGetTenantBalanceQuery();
  const transactions = useListTransactionsQuery({ limit: 10 });
  // V2-39 — live "how's my shop today" snapshot (kiosks, jobs, revenue).
  const ops = useGetOpsSummaryQuery(undefined, { pollingInterval: 30_000 });

  if (me.isLoading || balance.isLoading) {
    return <p className="p-8 text-fog pl-serif italic">Loading operator console…</p>;
  }
  if (me.isError || !me.data) {
    return (
      <p className="p-8 text-persimmon font-semibold">
        Could not load your operator console.
      </p>
    );
  }

  const tenant = me.data;
  const bal = balance.data;
  const ngn = (n: number) => `₦${Number(n || 0).toLocaleString()}`;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <div className="editorial-label text-persimmon mb-1">▸ OPERATOR CONSOLE</div>
        <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl leading-none tracking-tight">
          {tenant.name}
        </h1>
        <p className="mt-1 text-sm text-ink/60 font-mono">
          {tenant.slug}.printloop.app
        </p>
      </div>

      {/* Guided go-live wizard (V2-41) — gated by real backend flags. */}
      <GoLiveWizard />

      {/* Live "how's my shop today" — V2-39 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="pl-serif font-extrabold text-xl">Today at a glance</h2>
          <span className="text-[11px] text-ink/40 font-mono">
            {ops.isFetching ? "refreshing…" : "live · every 30s"}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <OperatorCard
            title="Revenue today"
            value={ops.data ? ngn(ops.data.revenueTodayGross) : "—"}
            accent
          />
          <OperatorCard
            title="Jobs today"
            value={ops.data ? String(ops.data.jobsToday) : "—"}
          />
          <OperatorCard
            title="In progress"
            value={ops.data ? String(ops.data.activeJobs) : "—"}
            warn={Boolean(ops.data && ops.data.stuckRenders > 0)}
            sub={
              ops.data && ops.data.stuckRenders > 0
                ? `${ops.data.stuckRenders} stuck`
                : undefined
            }
          />
          <OperatorCard
            title="Printers online"
            value={
              ops.data
                ? `${ops.data.onlineCount}/${ops.data.kioskCount}`
                : "—"
            }
            warn={Boolean(
              ops.data && ops.data.kioskCount > 0 && ops.data.onlineCount === 0,
            )}
          />
        </div>
      </div>

      {/* Go-live status banner */}
      {ops.data && (
        <div
          className={`border-2 rounded-pl p-4 flex flex-wrap items-center justify-between gap-3 ${
            ops.data.liveGate.isDiscoverable
              ? "border-sage bg-sage/10"
              : ops.data.liveGateMet
              ? "border-ochre bg-ochre/10"
              : "border-ink bg-paper-light"
          }`}
        >
          <div>
            <div className="font-bold">
              {ops.data.liveGate.isDiscoverable
                ? "✓ You're live on the marketplace"
                : ops.data.liveGateMet
                ? "Ready to go live — flip the switch in Printers"
                : "Not yet visible to customers"}
            </div>
            <div className="text-xs text-ink/60 mt-1">
              {gateHint(ops.data.liveGate)}
            </div>
          </div>
          <Link to="/saas/operator/printers" className="pl-btn-dark !py-2 !px-4 !text-xs">
            Manage printers →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <OperatorCard
          title="Available balance"
          value={bal ? ngn(bal.availableBalance) : "—"}
        />
        <OperatorCard
          title="Pending payout"
          value={bal ? ngn(bal.pendingPayout) : "—"}
        />
        <OperatorCard
          title="Recent volume"
          value={
            transactions.data && transactions.data.items.length
              ? `${transactions.data.items.length} transactions`
              : "No transactions yet"
          }
        />
      </div>

      <div className="border-2 border-ink rounded-pl p-5 bg-paper-light">
        <h2 className="pl-serif font-extrabold text-xl mb-2">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <ActionLink to="/saas/operator/printers" label="Manage printers" />
          <ActionLink to="/saas/settings/branding" label="Edit branding" />
          <ActionLink to="/saas/payouts" label="Manage payouts" />
          <ActionLink to="/saas/transactions" label="View transactions" />
        </div>
      </div>
    </div>
  );
}

function OperatorCard({
  title,
  value,
  accent,
  warn,
  sub,
}: {
  title: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
  sub?: string;
}) {
  const tone = accent
    ? "border-ink bg-ink text-paper"
    : warn
    ? "border-persimmon bg-persimmon/5 text-ink"
    : "border-ink bg-paper-light text-ink";
  return (
    <div className={`rounded-pl p-4 sm:p-5 border-2 ${tone}`}>
      <div className="editorial-label opacity-70 text-[10px]">
        {title.toUpperCase()}
      </div>
      <div className="font-mono text-2xl font-bold mt-1">{value}</div>
      {sub && (
        <div className="text-[11px] font-bold text-persimmon mt-0.5">{sub}</div>
      )}
    </div>
  );
}

/** Human "what's left before customers can find you" line. */
function gateHint(g: {
  locationSet: boolean;
  statusActive: boolean;
  testPrintDone: boolean;
  kioskOnline: boolean;
  isDiscoverable: boolean;
}): string {
  if (g.isDiscoverable) return "Customers can find you on the /find map.";
  const missing: string[] = [];
  if (!g.statusActive) missing.push("account activation");
  if (!g.locationSet) missing.push("a shop address");
  if (!g.testPrintDone) missing.push("a confirmed test print");
  if (!g.kioskOnline) missing.push("a printer online now");
  if (missing.length === 0)
    return "All checks pass — turn on discoverability in Printers.";
  return `Still needed: ${missing.join(", ")}.`;
}

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="block border-2 border-ink rounded-pl px-4 py-3 font-bold hover:border-sage hover:text-sage"
    >
      {label} →
    </Link>
  );
}
