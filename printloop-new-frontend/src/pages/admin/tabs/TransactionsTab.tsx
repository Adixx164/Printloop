import { useState } from "react";
import { toast } from "sonner";
import { useGetTransactionsQuery, useIssueRefundMutation } from "@/store/services/adminApi";

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-sage/15 text-sage border border-sage/30",
  PENDING: "bg-ochre/15 text-ochre border border-ochre/30",
  FAILED: "bg-persimmon/15 text-persimmon border border-persimmon/30",
};

export default function TransactionsTab({ canRefund }: { canRefund: boolean }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useGetTransactionsQuery({ status, page, limit: 25 });
  const [issueRefund] = useIssueRefundMutation();

  const txns: any[] = data?.transactions || [];
  const total: number = data?.total || 0;
  const totalPages: number = data?.totalPages || 1;

  const handleRefund = async (t: any) => {
    const reason = prompt(
      `Refund ₦${Number(t.amount).toLocaleString()} for "${t.description || t.reference}"?\nEnter a reason:`
    );
    if (!reason) return;
    try {
      await issueRefund({ paymentId: t.id, reason, refundType: "WALLET" }).unwrap();
      toast.success("Refund issued to wallet.");
    } catch (e: any) {
      toast.error(e?.data?.message || "Refund failed");
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
        <h1 className="pl-serif text-4xl font-bold text-ink mb-1">Transactions</h1>
        <p className="pl-serif italic text-ink/60">
          Payments captured across the platform. Issue wallet refunds where needed.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["", "SUCCESS", "PENDING", "FAILED"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`text-xs font-bold px-3 py-1.5 border-2 transition-colors uppercase ${
              status === s
                ? "bg-ink text-paper border-ink"
                : "border-ink/20 text-ink hover:border-ink"
            }`}
          >
            {s || "ALL"}
          </button>
        ))}
      </div>

      <div className="border-2 border-ink overflow-hidden">
        <div className="bg-ink text-paper px-5 py-3 flex justify-between items-center">
          <div className="editorial-label">
            {isLoading || isFetching ? "LOADING…" : `TRANSACTIONS — ${total} TOTAL`}
          </div>
          {totalPages > 1 && (
            <div className="text-xs text-paper/60">
              Page {page} / {totalPages}
            </div>
          )}
        </div>
        <div className="overflow-x-auto bg-paper-light">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 bg-ink/5 text-ink/70">
                <th className="p-3 font-semibold">Reference</th>
                <th className="p-3 font-semibold">User</th>
                <th className="p-3 font-semibold">Description</th>
                <th className="p-3 font-semibold text-right">Amount</th>
                <th className="p-3 font-semibold">Method</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold whitespace-nowrap">Date</th>
                <th className="p-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(isLoading || isFetching) && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-fog italic">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && !isFetching && txns.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-fog italic">
                    No transactions found.
                  </td>
                </tr>
              )}
              {txns.map((t) => {
                const u = t.user || {};
                const refunded = !!t.refundedAt;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-ink/10 last:border-0 hover:bg-ink/5"
                  >
                    <td className="p-3 pl-mono text-xs">{t.reference || "—"}</td>
                    <td className="p-3">
                      <div className="font-bold text-ink text-xs">
                        {u.firstName ? `${u.firstName} ${u.lastName}` : "—"}
                      </div>
                      <div className="text-xs text-fog">{u.email}</div>
                    </td>
                    <td className="p-3 text-xs text-fog max-w-[200px] truncate">
                      {t.description || "—"}
                    </td>
                    <td className="p-3 pl-mono font-bold text-right">
                      ₦{Number(t.amount || 0).toLocaleString()}
                      {refunded && (
                        <div className="text-[10px] text-persimmon font-normal">
                          refunded ₦{Number(t.refundAmount || 0).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-fog uppercase">{t.method}</td>
                    <td className="p-3">
                      <span
                        className={`pl-pill text-[10px] font-bold uppercase ${
                          STATUS_STYLES[t.status] || "bg-ink/10"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-fog whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      {canRefund && t.status === "SUCCESS" && !refunded ? (
                        <button
                          onClick={() => handleRefund(t)}
                          className="text-xs text-persimmon font-bold hover:underline"
                        >
                          REFUND
                        </button>
                      ) : refunded ? (
                        <span className="text-[10px] text-fog italic">refunded</span>
                      ) : (
                        <span className="text-fog">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="pl-btn-ghost text-xs px-4 py-2 disabled:opacity-30"
          >
            ← PREV
          </button>
          <span className="px-4 py-2 text-xs font-bold border-2 border-ink bg-paper">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="pl-btn-ghost text-xs px-4 py-2 disabled:opacity-30"
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  );
}
