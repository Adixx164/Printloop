import {
  useGetTenantBalanceQuery,
  useGetTenantMeQuery,
  useListPayoutsQuery,
  useRequestInstantPayoutMutation,
} from "@/store/services/saasApi";

/**
 * `/saas/payouts` — payout history + instant payout button.
 *
 * Restyled (V2-38) to the editorial-brutalist system.
 *
 * Instant payout deducts a flat ₦100 fee from the available balance;
 * the backend enforces a minimum (minPayoutAmount + fee) before
 * accepting. The button is disabled when the balance is below the
 * minimum or when the tenant hasn't added a bank account yet.
 */
export default function PayoutsPage() {
  const me = useGetTenantMeQuery();
  const balance = useGetTenantBalanceQuery();
  const payouts = useListPayoutsQuery({ limit: 50 });
  const [requestInstant, instantState] = useRequestInstantPayoutMutation();

  const ngn = (n: number) => `₦${n.toLocaleString()}`;
  const INSTANT_FEE = 100;
  const minRequired =
    (me.data?.payoutSchedule?.minPayoutAmount ?? 5000) + INSTANT_FEE;
  const canInstant =
    balance.data &&
    me.data?.onboarding.bankAccountSet &&
    balance.data.availableBalance >= minRequired;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <div className="editorial-label text-persimmon mb-1">▸ EARNINGS</div>
        <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl leading-none tracking-tight">
          Payouts
        </h1>
      </div>

      <div className="bg-paper-light border-2 border-ink rounded-pl p-5 sm:p-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="editorial-label text-ink/50">Available now</div>
            <div className="pl-serif font-extrabold text-4xl tracking-tight mt-0.5">
              {balance.data ? ngn(balance.data.availableBalance) : "—"}
            </div>
            <div className="text-xs text-ink/50 mt-1 font-mono">
              Pending: {balance.data ? ngn(balance.data.pendingPayout) : "—"}
            </div>
          </div>
          <div className="text-right">
            <button
              onClick={() => requestInstant()}
              disabled={!canInstant || instantState.isLoading}
              className="pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {instantState.isLoading
                ? "Sending…"
                : `Pay out now (₦${INSTANT_FEE} fee)`}
            </button>
            <p className="text-xs text-ink/50 mt-2">
              Or wait for the automatic{" "}
              {me.data?.payoutSchedule?.cadence ?? "weekly"} payout
            </p>
          </div>
        </div>
        {instantState.isError && (
          <p className="text-persimmon text-sm mt-3 font-semibold">
            {(instantState.error as any)?.data?.message ||
              "Instant payout failed."}
          </p>
        )}
        {!me.data?.onboarding.bankAccountSet && (
          <p className="text-ochre text-sm mt-3 font-semibold">
            Add a bank account before requesting a payout.
          </p>
        )}
      </div>

      <div className="bg-paper-light border-2 border-ink rounded-pl p-5 sm:p-6">
        <h2 className="pl-serif font-extrabold text-xl mb-4">Payout history</h2>
        {payouts.isLoading && (
          <p className="text-fog text-sm pl-serif italic">Loading…</p>
        )}
        {payouts.data && payouts.data.items.length === 0 && (
          <p className="text-fog text-sm">No payouts yet.</p>
        )}
        {payouts.data && payouts.data.items.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left editorial-label text-ink/50 border-b-2 border-ink">
                <th className="py-2">When</th>
                <th>Amount</th>
                <th>Fee</th>
                <th>Trigger</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payouts.data.items.map((p) => (
                <tr key={p.id} className="border-b border-paper-deep last:border-0">
                  <td className="py-2.5">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="font-mono">{ngn(p.amount)}</td>
                  <td className="font-mono text-ink/60">
                    {p.feeAmount ? ngn(p.feeAmount) : "—"}
                  </td>
                  <td className="capitalize">{p.trigger}</td>
                  <td>
                    <StatusPill status={p.status} />
                    {p.failureReason && (
                      <div className="text-xs text-persimmon mt-0.5">
                        {p.failureReason}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "paid"
      ? "bg-sage/20 text-sage"
      : status === "failed" || status === "cancelled"
      ? "bg-persimmon/15 text-persimmon"
      : "bg-ochre/20 text-ochre";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-pl-sm text-[10px] font-bold uppercase tracking-editorial ${color}`}
    >
      {status}
    </span>
  );
}
