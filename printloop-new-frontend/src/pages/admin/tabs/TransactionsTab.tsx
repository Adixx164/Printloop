import { useState } from "react";
import { useGetTransactionsQuery } from "@/store/services/adminApi";

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-emerald-600/15 text-emerald-600 border border-emerald-600/30",
  PENDING: "bg-amber-500/15 text-amber-500 border border-amber-500/30",
  FAILED: "bg-indigo-600/15 text-indigo-600 border border-indigo-600/30",
};

export default function TransactionsTab() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching } = useGetTransactionsQuery({ status, page, limit: 25 });

  const txns: any[] = data?.transactions || [];
  const total: number = data?.total || 0;
  const totalPages: number = data?.totalPages || 1;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <div className="editorial-label text-indigo-600 mb-1">ADMIN CONSOLE</div>
        <h1 className="pl-serif text-4xl font-bold text-gray-900 mb-1">Transactions</h1>
        <p className="pl-serif italic text-gray-50/60">
          Payments captured across the platform.
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
                ? "bg-gray-900 text-gray-50 border-gray-900"
                : "border-gray-900/20 text-gray-900 hover:border-gray-900"
            }`}
          >
            {s || "ALL"}
          </button>
        ))}
      </div>

      <div className="border-2 border-gray-900 overflow-hidden">
        <div className="bg-gray-900 text-gray-50 px-5 py-3 flex justify-between items-center">
          <div className="editorial-label">
            {isLoading || isFetching ? "LOADING…" : `TRANSACTIONS — ${total} TOTAL`}
          </div>
          {totalPages > 1 && (
            <div className="text-xs text-gray-50/60">
              Page {page} / {totalPages}
            </div>
          )}
        </div>
        <div className="overflow-x-auto bg-gray-100">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-900/20 bg-gray-900/5 text-gray-50/70">
                <th className="p-3 font-semibold">Reference</th>
                <th className="p-3 font-semibold">User</th>
                <th className="p-3 font-semibold">Description</th>
                <th className="p-3 font-semibold text-right">Amount</th>
                <th className="p-3 font-semibold">Method</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold whitespace-nowrap">Date</th>
              </tr>
            </thead>
            <tbody>
              {(isLoading || isFetching) && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500 italic">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && !isFetching && txns.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500 italic">
                    No transactions found.
                  </td>
                </tr>
              )}
              {txns.map((t) => {
                const u = t.user || {};
                return (
                  <tr
                    key={t.id}
                    className="border-b border-gray-900/10 last:border-0 hover:bg-gray-900/5"
                  >
                    <td className="p-3 pl-mono text-xs">{t.reference || "—"}</td>
                    <td className="p-3">
                      <div className="font-bold text-gray-900 text-xs">
                        {u.firstName ? `${u.firstName} ${u.lastName}` : "—"}
                      </div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </td>
                    <td className="p-3 text-xs text-gray-500 max-w-[200px] truncate">
                      {t.description || "—"}
                    </td>
                    <td className="p-3 pl-mono font-bold text-right">
                      ₦{Number(t.amount || 0).toLocaleString()}
                    </td>
                    <td className="p-3 text-xs text-gray-500 uppercase">{t.method}</td>
                    <td className="p-3">
                      <span
                        className={`pl-pill text-[10px] font-bold uppercase ${
                          STATUS_STYLES[t.status] || "bg-gray-900/10"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString()}
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
          <span className="px-4 py-2 text-xs font-bold border-2 border-gray-900 bg-gray-50">
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
