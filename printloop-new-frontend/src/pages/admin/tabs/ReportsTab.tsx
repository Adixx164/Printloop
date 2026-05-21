import { useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import { RootState } from "@/store";
import { CONFIG } from "@/constants/config";
import { useGetRevenueReportQuery, useGetKioskReportQuery } from "@/store/services/adminApi";

const PERIODS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "365 days", days: 365 },
];

export default function ReportsTab() {
  const [days, setDays] = useState(30);
  const [view, setView] = useState<"revenue" | "kiosks">("revenue");
  const token = useSelector((s: RootState) => s.auth.accessToken);

  const { data: revenue, isLoading: loadingRev } = useGetRevenueReportQuery({ days });
  const { data: kiosksData, isLoading: loadingKiosks } = useGetKioskReportQuery();

  const rows: any[] = revenue?.rows || [];
  const summary = revenue?.summary || {};
  const kiosks: any[] = kiosksData?.kiosks || [];

  const maxRevenue = Math.max(...rows.map((r) => Number(r.revenue) || 0), 1);

  const handleCsvExport = async () => {
    try {
      const res = await fetch(
        `${CONFIG.apiBaseUrl}/admin/reports/revenue?format=csv&days=${days}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `revenue-${days}d.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded.");
    } catch (e: any) {
      toast.error(`Export failed: ${e.message}`);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
          <h1 className="pl-serif text-4xl font-bold text-ink mb-1">Reports</h1>
          <p className="pl-serif italic text-ink/60">
            Revenue analytics and kiosk performance.
          </p>
        </div>
        <button onClick={handleCsvExport} className="pl-btn bg-ink text-paper border-ink text-xs">
          ↓ EXPORT CSV
        </button>
      </div>

      <div className="flex gap-0 border-2 border-ink w-fit">
        {(["revenue", "kiosks"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
              view === v ? "bg-ink text-paper" : "text-ink hover:bg-ink/10"
            }`}
          >
            {v === "revenue" ? "Revenue" : "By Kiosk"}
          </button>
        ))}
      </div>

      {view === "revenue" && (
        <>
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`text-xs font-bold px-3 py-1.5 border-2 transition-colors ${
                  days === p.days
                    ? "bg-persimmon text-paper border-persimmon"
                    : "border-ink/20 text-ink hover:border-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {!loadingRev && (
            <div className="grid grid-cols-2 border-2 border-ink">
              {[
                {
                  label: "TOTAL REVENUE",
                  value: `₦${Number(summary.totalRevenue || 0).toLocaleString()}`,
                },
                {
                  label: "TOTAL TRANSACTIONS",
                  value: Number(summary.totalTransactions || 0).toLocaleString(),
                },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className={`p-5 ${i > 0 ? "border-l-2 border-ink" : ""} ${
                    i === 0 ? "bg-sage text-paper" : "bg-paper-light"
                  }`}
                >
                  <div
                    className={`editorial-label mb-1 ${
                      i === 0 ? "text-paper/60" : "text-ink/50"
                    }`}
                  >
                    {s.label}
                  </div>
                  <div className="pl-mono text-3xl font-bold">{s.value}</div>
                  <div
                    className={`editorial-label mt-1 ${i === 0 ? "text-paper/40" : "text-fog"}`}
                  >
                    LAST {days} DAYS
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingRev && rows.length > 0 && (
            <div className="border-2 border-ink bg-paper-light p-5">
              <div className="editorial-label text-persimmon mb-4">
                DAILY REVENUE — LAST {days} DAYS
              </div>
              <div className="flex items-end gap-px h-36 overflow-x-auto">
                {rows.map((r) => (
                  <div
                    key={r.date}
                    title={`${r.date}\n₦${r.revenue} · ${r.transactions} txns`}
                    className="flex-1 min-w-[3px] bg-sage hover:bg-persimmon transition-colors cursor-default"
                    style={{
                      height: `${Math.max(2, (Number(r.revenue) / maxRevenue) * 100)}%`,
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-fog mt-2">
                <span>{rows[0]?.date}</span>
                <span>{rows[rows.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {!loadingRev && (
            <div className="border-2 border-ink overflow-hidden">
              <div className="bg-ink text-paper px-5 py-3">
                <div className="editorial-label">DAILY BREAKDOWN TABLE</div>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-ink/5">
                    <tr className="border-b border-ink/20 text-ink/70">
                      <th className="p-3 font-semibold">Date</th>
                      <th className="p-3 font-semibold text-right">Transactions</th>
                      <th className="p-3 font-semibold text-right">Revenue (₦)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-fog italic">
                          No revenue in this period.
                        </td>
                      </tr>
                    )}
                    {[...rows].reverse().map((r) => (
                      <tr
                        key={r.date}
                        className="border-b border-ink/10 last:border-0 hover:bg-ink/5"
                      >
                        <td className="p-3 pl-mono text-sm">{r.date}</td>
                        <td className="p-3 text-right pl-mono">{r.transactions}</td>
                        <td className="p-3 text-right pl-mono font-bold">
                          {Number(r.revenue) > 0
                            ? `₦${Number(r.revenue).toLocaleString()}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {view === "kiosks" && (
        <>
          {loadingKiosks ? (
            <div className="text-center italic opacity-50 py-12">Loading kiosk data…</div>
          ) : (
            <div className="border-2 border-ink overflow-hidden">
              <div className="bg-ink text-paper px-5 py-3">
                <div className="editorial-label">KIOSK PERFORMANCE REPORT</div>
              </div>
              <div className="overflow-x-auto bg-paper-light">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink/20 bg-ink/5 text-ink/70">
                      <th className="p-3 font-semibold">Kiosk ID</th>
                      <th className="p-3 font-semibold text-right">Total Jobs</th>
                      <th className="p-3 font-semibold text-right">Total Pages</th>
                      <th className="p-3 font-semibold text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kiosks.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-fog italic">
                          No kiosk activity.
                        </td>
                      </tr>
                    )}
                    {[...kiosks]
                      .sort((a, b) => Number(b.revenue) - Number(a.revenue))
                      .map((k) => (
                        <tr
                          key={k.kioskId || "unknown"}
                          className="border-b border-ink/10 last:border-0 hover:bg-ink/5"
                        >
                          <td className="p-3 pl-mono text-xs">{k.kioskId || "—"}</td>
                          <td className="p-3 text-right pl-mono font-bold">{k.totalJobs}</td>
                          <td className="p-3 text-right pl-mono font-bold">{k.totalPages}</td>
                          <td className="p-3 text-right pl-mono font-bold">
                            {Number(k.revenue) > 0
                              ? `₦${Number(k.revenue).toLocaleString()}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
