import { Link } from "react-router-dom";
import { useState } from "react";
import {
  TransactionRow,
  useListTransactionsQuery,
} from "@/store/services/saasApi";

export default function TransactionsPage() {
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const currentCursor = cursorStack[cursorStack.length - 1];
  const transactions = useListTransactionsQuery({
    limit: 50,
    before: currentCursor ?? undefined,
  });

  const items = transactions.data?.items ?? [];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            to="/saas/dashboard"
            className="text-sm font-bold text-persimmon border-b-2 border-persimmon"
          >
            ← Dashboard
          </Link>
          <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl tracking-tight mt-2">
            Transactions
          </h1>
          <p className="text-ink/60">
            Customer print revenue, platform commission, and your net.
          </p>
        </div>
        <div className="text-xs text-ink/50 font-mono">
          {transactions.isFetching ? "Refreshing…" : "Latest 50 rows"}
        </div>
      </div>

      <div className="bg-paper-light border-2 border-ink rounded-pl overflow-hidden">
        {transactions.isLoading && (
          <p className="p-6 text-fog text-sm pl-serif italic">Loading…</p>
        )}
        {transactions.isError && (
          <p className="p-6 text-persimmon text-sm font-semibold">
            Could not load transactions.
          </p>
        )}
        {!transactions.isLoading && !transactions.isError && items.length === 0 && (
          <p className="p-6 text-fog text-sm">
            No transactions yet. Customer print revenue will appear here.
          </p>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left editorial-label text-ink/50 border-b-2 border-ink bg-paper-warm">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">Commission</th>
                  <th className="px-4 py-3 text-right">Net</th>
                  <th className="px-4 py-3 text-right">Balance after</th>
                  <th className="px-4 py-3">Reference</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <TransactionTableRow key={tx.id} tx={tx} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={cursorStack.length === 1 || transactions.isFetching}
          onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
          className="pl-btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Newer
        </button>
        <button
          type="button"
          disabled={!transactions.data?.nextCursor || transactions.isFetching}
          onClick={() =>
            setCursorStack((stack) => [
              ...stack,
              transactions.data?.nextCursor ?? null,
            ])
          }
          className="pl-btn-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Older →
        </button>
      </div>
    </div>
  );
}

function TransactionTableRow({ tx }: { tx: TransactionRow }) {
  const netAmount = tx.amount - tx.commissionAmount;

  return (
    <tr className="border-b border-paper-deep last:border-0">
      <td className="px-4 py-3 whitespace-nowrap">
        {new Date(tx.createdAt).toLocaleString()}
      </td>
      <td className="px-4 py-3 capitalize">{tx.type}</td>
      <td className="px-4 py-3 min-w-48">{tx.description || "-"}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {formatMoney(tx.amount)}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {formatMoney(tx.commissionAmount)}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {formatMoney(netAmount)}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {formatMoney(tx.balanceAfter)}
      </td>
      <td className="px-4 py-3 text-ink/50 font-mono max-w-48 truncate">
        {tx.reference || "-"}
      </td>
    </tr>
  );
}

function formatMoney(amount: number) {
  return `NGN ${amount.toLocaleString()}`;
}
