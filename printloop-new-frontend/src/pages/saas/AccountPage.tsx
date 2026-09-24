import { useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { RootState } from "@/store";
import { CONFIG } from "@/constants/config";
import {
  useGetTenantMeQuery,
  useCloseTenantMutation,
} from "@/store/services/saasApi";

/**
 * `/saas/settings/account` — data export (Dimension 13) + danger-zone
 * close. Export is a raw authenticated fetch because it streams a
 * file attachment, not JSON the RTK cache should hold.
 */
export default function AccountPage() {
  const navigate = useNavigate();
  const { data: me } = useGetTenantMeQuery();
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const [closeTenant, closeState] = useCloseTenantMutation();

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [reason, setReason] = useState("");

  const onExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch(`${CONFIG.apiBaseUrl}/saas/me/export`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(`Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `printloop-export-${me?.slug ?? "tenant"}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setExportError(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Month-end statement download (V2-24). Defaults to last month —
  // the typical "close the books" target.
  const [stmtMonth, setStmtMonth] = useState(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [stmtBusy, setStmtBusy] = useState(false);
  const [stmtError, setStmtError] = useState<string | null>(null);

  const onStatement = async () => {
    setStmtBusy(true);
    setStmtError(null);
    try {
      const res = await fetch(
        `${CONFIG.apiBaseUrl}/saas/me/statement?month=${encodeURIComponent(stmtMonth)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error(`Statement failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `printloop-statement-${me?.slug ?? "tenant"}-${stmtMonth}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setStmtError(e?.message || "Statement failed");
    } finally {
      setStmtBusy(false);
    }
  };

  const onClose = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await closeTenant({ confirmSlug, reason: reason || undefined }).unwrap();
      // Tenant is now CLOSED — bounce to a goodbye state.
      navigate("/saas/closed");
    } catch {
      /* surfaced below */
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">
          Account &amp; data
        </h2>
        <p className="text-sm text-ink/60">
          Export everything we hold for your business, or close your
          account.
        </p>
      </div>

      <section className="border-2 border-ink rounded-pl p-4 space-y-3 bg-paper-light">
        <h3 className="font-bold">Month-end statement</h3>
        <p className="text-sm text-ink/60">
          A CSV of your transactions (gross, our commission, your net)
          and payouts for the month — for your accountant.
        </p>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider mb-1">
              Month
            </label>
            <input
              type="month"
              className="pl-input"
              value={stmtMonth}
              onChange={(e) => setStmtMonth(e.target.value)}
            />
          </div>
          <button
            onClick={onStatement}
            disabled={stmtBusy}
            className="pl-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stmtBusy ? "Preparing…" : "Download statement (CSV)"}
          </button>
        </div>
        {stmtError && <p className="text-persimmon text-sm font-semibold">{stmtError}</p>}
      </section>

      <section className="border-2 border-ink rounded-pl p-4 space-y-3 bg-paper-light">
        <h3 className="font-bold">Export your data</h3>
        <p className="text-sm text-ink/60">
          Downloads a JSON archive of your tenant, customers, kiosks,
          print jobs, payments, payouts, and audit log. Credentials are
          stripped.
        </p>
        <button
          onClick={onExport}
          disabled={exporting}
          className="pl-btn-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? "Preparing…" : "Download export (JSON)"}
        </button>
        {exportError && <p className="text-persimmon text-sm font-semibold">{exportError}</p>}
      </section>

      <section className="border-2 border-persimmon rounded-pl p-4 space-y-3 bg-persimmon/5">
        <h3 className="font-bold text-persimmon uppercase tracking-wider text-sm">
          ▸ Danger zone
        </h3>
        <p className="text-sm text-ink/70">
          Closing your account stops all printing immediately and starts
          a 30-day cooling-off window, after which your data is deleted.
          Type your subdomain{" "}
          <code className="font-mono bg-paper-warm px-1 rounded">{me?.slug}</code>{" "}
          to confirm.
        </p>
        <form onSubmit={onClose} className="space-y-3">
          <input
            className="pl-input"
            placeholder={me?.slug || "your-subdomain"}
            value={confirmSlug}
            onChange={(e) => setConfirmSlug(e.target.value)}
          />
          <input
            className="pl-input"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {closeState.isError && (
            <p className="text-persimmon text-sm font-semibold">
              {(closeState.error as any)?.data?.message || "Close failed."}
            </p>
          )}
          <button
            type="submit"
            disabled={closeState.isLoading || confirmSlug !== me?.slug}
            className="pl-btn !bg-persimmon !text-paper !border-persimmon disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {closeState.isLoading ? "Closing…" : "Close this account"}
          </button>
        </form>
      </section>
    </div>
  );
}
