import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { logOut } from "@/store/features/auth/authSlice";
import {
  useGetDashboardStatsQuery,
  useGetAdminUsersQuery,
  useGetPricingQuery,
  useUpdatePricingConfigMutation,
  useCreatePricingConfigMutation,
  useDeletePricingConfigMutation,
  useGetAuditLogsQuery,
  useSetUserRoleMutation,
  useSetUserPrivilegesMutation,
  useBlockUserMutation,
} from "@/store/services/adminApi";
import { RootState } from "@/store";
import { ROUTES } from "@/constants/routes";
import PrintersTab from "@/pages/admin/tabs/PrintersTab";
import JobsTab from "@/pages/admin/tabs/JobsTab";
import ReportsTab from "@/pages/admin/tabs/ReportsTab";
import OptionsTab from "@/pages/admin/tabs/OptionsTab";
import TransactionsTab from "@/pages/admin/tabs/TransactionsTab";
import PromotionsTab from "@/pages/admin/tabs/PromotionsTab";

// ─── Types ─────────────────────────────────────────────────────────────────
type Tab =
  | "dashboard"
  | "users"
  | "printers"
  | "jobs"
  | "pricing"
  | "transactions"
  | "promotions"
  | "reports"
  | "options"
  | "appLog";

const tabs: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "users", label: "Users & Admins" },
  { key: "printers", label: "Printers (Kiosks)" },
  { key: "jobs", label: "Print Jobs" },
  { key: "pricing", label: "Pricing & Charging" },
  { key: "transactions", label: "Transactions" },
  { key: "promotions", label: "Promotions" },
  { key: "reports", label: "Reports" },
  { key: "options", label: "Options" },
  { key: "appLog", label: "App Log" },
];

// Permissions an admin can be granted (mirrors backend Permission enum).
const ALL_PRIVILEGES = [
  "view_dashboard",
  "view_jobs",
  "requeue_jobs",
  "view_kiosks",
  "manage_kiosks",
  "view_pricing",
  "manage_pricing",
  "view_promotions",
  "manage_promotions",
  "view_transactions",
  "issue_refunds",
  "view_users",
  "manage_users",
  "block_users",
  "view_reports",
  "export_reports",
  "view_settings",
  "manage_settings",
  "manage_roles",
  "view_audit_log",
] as const;

function AdminTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-2 border-ink overflow-hidden">
      <div className="bg-ink text-paper px-5 py-3">
        <div className="editorial-label">{title}</div>
      </div>
      <div className="overflow-x-auto bg-paper-light">{children}</div>
    </div>
  );
}

function StatTile({
  label,
  value,
  dark,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  dark?: boolean;
  accent?: "sage" | "ochre";
}) {
  const bg = dark
    ? "bg-ink text-paper"
    : accent === "sage"
    ? "bg-sage text-paper"
    : "border-2 border-ink bg-paper-light text-ink";
  const labelClass =
    dark || accent === "sage" ? "text-paper/70" : accent === "ochre" ? "text-ochre" : "text-fog";
  return (
    <div className={`p-5 ${bg}`}>
      <div className={`editorial-label mb-2 ${labelClass}`}>{label}</div>
      <div className="pl-mono text-3xl font-bold">{value}</div>
    </div>
  );
}

function EnvTile({
  emoji,
  value,
  label,
  color,
}: {
  emoji: string;
  value: string;
  label: string;
  color: "sage" | "fog" | "ochre";
}) {
  const map = {
    sage: "border-2 border-sage bg-sage/10 text-sage",
    fog: "border-2 border-fog bg-fog/10 text-fog",
    ochre: "border-2 border-ochre bg-ochre/10 text-ochre",
  };
  return (
    <div className={`p-5 text-center ${map[color]}`}>
      <div className="text-4xl mb-2">{emoji}</div>
      <div className="pl-mono text-2xl font-bold">{value}</div>
      <div className="editorial-label opacity-70 mt-1">{label}</div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
function DashboardTab() {
  const { data, isLoading } = useGetDashboardStatsQuery();
  const { data: audit } = useGetAuditLogsQuery({ limit: 6 });

  if (isLoading || !data)
    return <div className="text-center italic opacity-50 mt-20">Loading dashboard…</div>;

  const byDay: any[] = data.revenue?.byDay || [];
  const maxRev = Math.max(...byDay.map((r) => Number(r.revenue) || 0), 1);
  const logs: any[] = audit?.logs || [];
  const pagesToday = Number(data.pages?.today || 0);

  return (
    <div className="max-w-5xl space-y-7">
      <div>
        <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
        <h1 className="pl-serif text-4xl font-bold text-ink mb-1">Dashboard</h1>
        <p className="pl-serif italic text-ink/60">
          System overview, fleet health, and environmental impact.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border-2 border-ink">
        <StatTile label="TOTAL USERS" value={data.users?.total ?? "—"} accent="sage" />
        <div className="border-l-2 border-ink">
          <StatTile
            label="PRINTERS ONLINE"
            value={
              <>
                {data.kiosks?.online ?? "—"}
                <span className="text-sm font-normal opacity-50 ml-1">
                  / {data.kiosks?.total ?? 0}
                </span>
              </>
            }
            dark
          />
        </div>
        <div className="border-l-2 border-ink">
          <StatTile label="PAGES TODAY" value={pagesToday} />
        </div>
        <div className="border-l-2 border-ink">
          <StatTile
            label="TODAY'S REVENUE"
            value={`₦${Number(data.revenue?.today || 0).toLocaleString()}`}
            accent="ochre"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border-2 border-ink p-4">
          <div className="editorial-label text-fog mb-1">JOBS TOTAL</div>
          <div className="pl-mono text-2xl font-bold">{data.jobs?.total ?? 0}</div>
        </div>
        <div className="border-2 border-ink p-4">
          <div className="editorial-label text-fog mb-1">PENDING NOW</div>
          <div className="pl-mono text-2xl font-bold">{data.jobs?.pendingNow ?? 0}</div>
        </div>
        <div className="border-2 border-ink p-4">
          <div className="editorial-label text-fog mb-1">FAILED TODAY</div>
          <div className="pl-mono text-2xl font-bold text-persimmon">
            {data.jobs?.failedToday ?? 0}
          </div>
        </div>
        <div className="border-2 border-ink p-4">
          <div className="editorial-label text-fog mb-1">BLOCKED USERS</div>
          <div className="pl-mono text-2xl font-bold">{data.users?.blocked ?? 0}</div>
        </div>
      </div>

      <div>
        <div className="editorial-label text-ink/50 mb-3">ENVIRONMENTAL IMPACT · TODAY</div>
        <div className="grid grid-cols-3 gap-4">
          <EnvTile emoji="🌳" value={(pagesToday / 8333).toFixed(3)} label="TREES CONSUMED" color="sage" />
          <EnvTile emoji="☁️" value={`${(pagesToday * 0.0054).toFixed(2)} kg`} label="CO₂ PRODUCED" color="fog" />
          <EnvTile emoji="⚡" value={`${(pagesToday * 0.0023).toFixed(2)} kWh`} label="ENERGY USED" color="ochre" />
        </div>
      </div>

      <div className="border-2 border-ink bg-paper-light p-5">
        <div className="editorial-label text-persimmon mb-4">DAILY REVENUE · LAST 30 DAYS</div>
        <div className="flex items-end gap-1 h-32">
          {byDay.length === 0 && (
            <div className="text-fog italic text-sm">No revenue in this period.</div>
          )}
          {byDay.map((row) => (
            <div
              key={row.date}
              className="flex-1 bg-sage/80 hover:bg-persimmon transition-colors"
              style={{ height: `${Math.max(5, (Number(row.revenue) / maxRev) * 100)}%` }}
              title={`${row.date}: ₦${Number(row.revenue).toLocaleString()} · ${row.jobCount} txns`}
            />
          ))}
        </div>
      </div>

      <AdminTable title="RECENT AUDIT ENTRIES">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink/20 bg-ink/5 text-ink/70">
              <th className="p-3 font-semibold">Time</th>
              <th className="p-3 font-semibold">Actor</th>
              <th className="p-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-fog italic text-center">
                  No audit entries yet.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-ink/10 last:border-0 hover:bg-ink/5">
                <td className="p-3 text-ink/60 whitespace-nowrap text-xs">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="p-3 font-bold">{log.actorName}</td>
                <td className="p-3 pl-mono text-[10px] uppercase">{log.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTable>
    </div>
  );
}

// ─── Users & Admins ────────────────────────────────────────────────────────
function UsersTab({ canManageAdmins }: { canManageAdmins: boolean }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAdminUsersQuery({ search, page, limit: 25 });
  const [setUserRole] = useSetUserRoleMutation();
  const [setUserPrivileges] = useSetUserPrivilegesMutation();
  const [blockUser] = useBlockUserMutation();

  const users: any[] = data?.users || [];
  const totalPages: number = data?.totalPages || 1;

  const handleRole = async (id: string, name: string, role: string) => {
    if (!confirm(`Set ${name}'s role to "${role}"?`)) return;
    try {
      await setUserRole({ id, role }).unwrap();
      toast.success(`${name} → ${role}`);
    } catch (e: any) {
      toast.error(e?.data?.message || "Failed to update role");
    }
  };

  const handlePriv = async (id: string, current: string[], priv: string) => {
    const next = current.includes(priv)
      ? current.filter((p) => p !== priv)
      : [...current, priv];
    try {
      await setUserPrivileges({ id, privileges: next }).unwrap();
      toast.success("Privileges updated.");
    } catch (e: any) {
      toast.error(e?.data?.message || "Failed to update privileges");
    }
  };

  const handleBlock = async (id: string, name: string, isBlocked: boolean) => {
    let reason: string | undefined;
    if (isBlocked) {
      reason = prompt(`Reason for blocking ${name}?`) || undefined;
      if (reason === undefined) return;
    } else if (!confirm(`Unblock ${name}?`)) return;
    try {
      await blockUser({ id, isBlocked, reason }).unwrap();
      toast.success(`${name} ${isBlocked ? "blocked" : "unblocked"}.`);
    } catch (e: any) {
      toast.error(e?.data?.message || "Failed to update user");
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex justify-between items-end gap-4">
        <div>
          <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
          <h1 className="pl-serif text-4xl font-bold text-ink mb-1">Users & Admins</h1>
          <p className="pl-serif italic text-ink/60">Manage roles, privileges, and accounts.</p>
        </div>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search users..."
          className="pl-input w-64"
        />
      </div>

      <AdminTable title={`USERS — ${data?.total ?? 0} ACCOUNTS`}>
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-ink/5 border-b border-ink/20 text-ink/70">
              <th className="p-3 font-semibold">User</th>
              <th className="p-3 font-semibold">Role</th>
              <th className="p-3 font-semibold">Privileges</th>
              <th className="p-3 font-semibold">Status</th>
              <th className="p-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-fog italic">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-fog italic">
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u) => {
              const name = `${u.firstName} ${u.lastName}`;
              const privs: string[] = u.adminPrivileges || [];
              return (
                <tr key={u.id} className="border-b border-ink/10 last:border-0 hover:bg-ink/5">
                  <td className="p-3">
                    <div className="font-bold text-ink">{name}</div>
                    <div className="text-xs text-fog">{u.email}</div>
                  </td>
                  <td className="p-3">
                    <span
                      className={`pl-pill ${
                        u.role === "super_admin"
                          ? "bg-sage text-paper"
                          : u.role === "admin"
                          ? "bg-ochre text-paper"
                          : "bg-ink/10 text-ink"
                      }`}
                    >
                      {String(u.role || "user").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="p-3 max-w-[260px]">
                    {u.role === "user" ? (
                      <span className="text-xs text-fog italic">None</span>
                    ) : u.role === "super_admin" ? (
                      <span className="text-xs font-bold text-sage">Full Access</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {ALL_PRIVILEGES.map((priv) => (
                          <label
                            key={priv}
                            className="flex items-center gap-1 text-[9px] bg-ink/5 border border-ink/15 px-1 py-0.5 cursor-pointer hover:bg-ink/10"
                            title={priv}
                          >
                            <input
                              type="checkbox"
                              checked={privs.includes(priv)}
                              onChange={() => handlePriv(u.id, privs, priv)}
                              disabled={!canManageAdmins}
                              className="accent-sage w-2.5 h-2.5"
                            />
                            {priv.replace("manage_", "m:").replace("view_", "v:")}
                          </label>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    {u.isBlocked ? (
                      <span className="pl-pill bg-persimmon text-paper text-[10px]">BLOCKED</span>
                    ) : (
                      <span className="pl-pill bg-sage/15 text-sage text-[10px]">ACTIVE</span>
                    )}
                  </td>
                  <td className="p-3 text-right space-x-2 whitespace-nowrap">
                    {canManageAdmins && u.role === "user" && (
                      <button
                        onClick={() => handleRole(u.id, name, "admin")}
                        className="text-xs text-sage hover:underline font-bold"
                      >
                        Make Admin
                      </button>
                    )}
                    {canManageAdmins && u.role === "admin" && (
                      <button
                        onClick={() => handleRole(u.id, name, "user")}
                        className="text-xs text-ochre hover:underline font-bold"
                      >
                        Demote
                      </button>
                    )}
                    {canManageAdmins && (
                      <button
                        onClick={() => handleBlock(u.id, name, !u.isBlocked)}
                        className="text-xs text-persimmon hover:underline font-bold"
                      >
                        {u.isBlocked ? "Unblock" : "Block"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AdminTable>

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

// ─── Pricing & Charging ────────────────────────────────────────────────────
const PAPER_SIZES = ["A4", "A3", "LETTER", "LEGAL"];
const COLOR_TYPES = ["BLACK_WHITE", "COLOR"];
const money = (n: number) =>
  `₦${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// The six per-cell fields plus the legacy fallback. Editing any single
// cell only sends that cell; the rest of the row is untouched. Values
// stored as strings so the input can hold the empty state.
const CELL_KEYS = [
  "price100Simplex",
  "price300Simplex",
  "price600Simplex",
  "price100Duplex",
  "price300Duplex",
  "price600Duplex",
] as const;
type CellKey = (typeof CELL_KEYS)[number];

function PricingCard({
  c,
  canManage,
  onSaved,
}: {
  c: any;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [updateConfig, { isLoading: saving }] = useUpdatePricingConfigMutation();
  const [deleteConfig] = useDeletePricingConfigMutation();

  const initCells = (): Record<CellKey, string> => {
    const out: any = {};
    for (const k of CELL_KEYS) out[k] = c[k] == null ? "" : String(c[k]);
    return out;
  };
  const [cells, setCells] = useState<Record<CellKey, string>>(initCells);
  const [meta, setMeta] = useState({
    isActive: !!c.isActive,
    notes: c.notes || "",
  });

  const cellsDirty = CELL_KEYS.some(
    (k) => String(c[k] ?? "") !== String(cells[k] ?? ""),
  );
  const dirty =
    cellsDirty || !!c.isActive !== meta.isActive || (c.notes || "") !== meta.notes;

  const save = async () => {
    try {
      const payload: any = {
        id: c.id,
        isActive: meta.isActive,
        notes: meta.notes,
      };
      for (const k of CELL_KEYS) {
        const v = cells[k].trim();
        payload[k] = v === "" ? null : Number(v);
      }
      await updateConfig(payload).unwrap();
      toast.success(`${c.paperSize} · ${c.colorType} pricing saved.`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.data?.message || "Failed to save pricing");
    }
  };

  const remove = async () => {
    if (!confirm(`Delete pricing for ${c.paperSize} · ${c.colorType}?`)) return;
    try {
      await deleteConfig(c.id).unwrap();
      toast.success("Pricing config deleted.");
    } catch (e: any) {
      toast.error(e?.data?.message || "Failed to delete");
    }
  };

  const cell = (k: CellKey) => (
    <input
      type="number"
      step="1"
      value={cells[k]}
      onChange={(e) => setCells((f) => ({ ...f, [k]: e.target.value }))}
      disabled={!canManage}
      placeholder="—"
      className={`pl-input pl-mono text-center !py-2 !text-sm w-full ${
        String(c[k] ?? "") !== String(cells[k] ?? "") ? "border-ochre" : ""
      }`}
    />
  );

  return (
    <div className="border-2 border-ink p-5 space-y-4 bg-paper-light">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="pl-serif text-xl font-bold text-ink">{c.paperSize}</span>
          <span className="pl-pill bg-ink/10 text-ink text-[10px] uppercase">
            {String(c.colorType).replace("_", " ")}
          </span>
          <span
            className={`pl-pill text-[10px] uppercase ${
              meta.isActive ? "bg-sage/15 text-sage" : "bg-ink/10 text-fog"
            }`}
          >
            {meta.isActive ? "active" : "inactive"}
          </span>
        </div>
        {canManage && (
          <button
            onClick={remove}
            className="text-xs text-persimmon font-bold hover:underline"
          >
            DELETE
          </button>
        )}
      </div>

      {/* 6-cell pricing matrix. Rows: simplex/duplex; columns: 100/300/600 dpi. */}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr className="text-fog">
              <th className="text-left editorial-label text-[10px] py-1 px-2">₦ / PAGE</th>
              <th className="editorial-label text-[10px] py-1">100 DPI</th>
              <th className="editorial-label text-[10px] py-1">300 DPI</th>
              <th className="editorial-label text-[10px] py-1">600 DPI</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="editorial-label text-[10px] text-ink py-1 px-2">SIMPLEX</td>
              <td>{cell("price100Simplex")}</td>
              <td>{cell("price300Simplex")}</td>
              <td>{cell("price600Simplex")}</td>
            </tr>
            <tr>
              <td className="editorial-label text-[10px] text-ink py-1 px-2">DUPLEX</td>
              <td>{cell("price100Duplex")}</td>
              <td>{cell("price300Duplex")}</td>
              <td>{cell("price600Duplex")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <label className="editorial-label text-[10px] block mb-1 text-fog">NOTES</label>
        <input
          value={meta.notes}
          onChange={(e) => setMeta((f) => ({ ...f, notes: e.target.value }))}
          disabled={!canManage}
          placeholder="Optional internal note"
          className="pl-input text-sm w-full"
        />
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap border-t border-ink/15 pt-3">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={meta.isActive}
              onChange={(e) => setMeta((f) => ({ ...f, isActive: e.target.checked }))}
              disabled={!canManage}
              className="accent-sage w-4 h-4"
            />
            <span className="text-xs font-bold text-ink">Active</span>
          </label>
          <div className="text-xs text-fog">
            Per-page price. Blank cell = falls back to {money(c.pricePerPage)} ×
            multipliers.
          </div>
        </div>
        {canManage && (
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`text-xs font-bold px-4 py-2 border-2 transition-colors ${
              dirty && !saving
                ? "border-sage bg-sage text-paper"
                : "border-ink/20 text-fog cursor-not-allowed"
            }`}
          >
            {saving ? "SAVING…" : "SAVE"}
          </button>
        )}
      </div>
    </div>
  );
}

function PricingTab({ canManage }: { canManage: boolean }) {
  const { data, isLoading, refetch } = useGetPricingQuery();
  const [createConfig, { isLoading: creating }] = useCreatePricingConfigMutation();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    paperSize: "A4",
    colorType: "BLACK_WHITE",
    // Per-cell prices — blank means "use the legacy multiplier path".
    price100Simplex: "",
    price300Simplex: "",
    price600Simplex: "",
    price100Duplex: "",
    price300Duplex: "",
    price600Duplex: "",
  });

  const configs: any[] = data?.configs || [];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const numericOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
      const payload: any = {
        paperSize: addForm.paperSize,
        colorType: addForm.colorType,
        // pricePerPage mirrors the 300dpi-simplex cell — the existing
        // `pricePerPage` field stays in sync for any legacy reader.
        pricePerPage: Number(addForm.price300Simplex) || 0,
        duplexMultiplier: 1.0,
        highResolutionMultiplier: 1.0,
        price100Simplex: numericOrNull(addForm.price100Simplex),
        price300Simplex: numericOrNull(addForm.price300Simplex),
        price600Simplex: numericOrNull(addForm.price600Simplex),
        price100Duplex: numericOrNull(addForm.price100Duplex),
        price300Duplex: numericOrNull(addForm.price300Duplex),
        price600Duplex: numericOrNull(addForm.price600Duplex),
      };
      await createConfig(payload).unwrap();
      toast.success(`Added pricing for ${addForm.paperSize} · ${addForm.colorType}.`);
      setShowAdd(false);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to create pricing config");
    }
  };

  if (isLoading)
    return <div className="text-center italic opacity-50 py-20">Loading pricing…</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
          <h1 className="pl-serif text-4xl font-bold text-ink mb-1">Charging & Pricing</h1>
          <p className="pl-serif italic text-ink/60">
            Per-page price for every (DPI × simplex/duplex) combination, per paper &amp;
            colour. Leave a cell blank to fall back to the legacy multiplier.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="pl-btn bg-sage text-paper border-sage hover:bg-ink hover:border-ink"
          >
            {showAdd ? "CANCEL" : "+ ADD PRICING"}
          </button>
        )}
      </div>

      {showAdd && canManage && (
        <form onSubmit={handleAdd} className="border-2 border-sage p-5 bg-sage/5 space-y-3">
          <div className="editorial-label text-sage mb-2">NEW PRICING CONFIG</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="editorial-label text-[10px] block mb-1">PAPER</label>
              <select
                className="pl-input"
                value={addForm.paperSize}
                onChange={(e) => setAddForm((f) => ({ ...f, paperSize: e.target.value }))}
              >
                {PAPER_SIZES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="editorial-label text-[10px] block mb-1">COLOUR</label>
              <select
                className="pl-input"
                value={addForm.colorType}
                onChange={(e) => setAddForm((f) => ({ ...f, colorType: e.target.value }))}
              >
                {COLOR_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {p.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* 6-cell matrix — same layout as the per-row editor below. */}
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr className="text-fog">
                  <th className="text-left editorial-label text-[10px] py-1 px-2">
                    ₦ / PAGE
                  </th>
                  <th className="editorial-label text-[10px] py-1">100 DPI</th>
                  <th className="editorial-label text-[10px] py-1">300 DPI</th>
                  <th className="editorial-label text-[10px] py-1">600 DPI</th>
                </tr>
              </thead>
              <tbody>
                {(["Simplex", "Duplex"] as const).map((sided) => (
                  <tr key={sided}>
                    <td className="editorial-label text-[10px] text-ink py-1 px-2">
                      {sided.toUpperCase()}
                    </td>
                    {(["100", "300", "600"] as const).map((dpi) => {
                      const k = `price${dpi}${sided}` as keyof typeof addForm;
                      return (
                        <td key={dpi}>
                          <input
                            type="number"
                            step="1"
                            placeholder="—"
                            className="pl-input pl-mono text-center !py-2 !text-sm w-full"
                            value={(addForm as any)[k]}
                            onChange={(e) =>
                              setAddForm((f) => ({ ...f, [k]: e.target.value }))
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="pl-btn bg-sage text-paper border-sage"
          >
            {creating ? "ADDING…" : "ADD CONFIG →"}
          </button>
        </form>
      )}

      {configs.length === 0 ? (
        <div className="border-2 border-ink/20 bg-ink/5 p-8 text-center text-fog italic">
          No pricing configs yet.{" "}
          {canManage && "Use “+ ADD PRICING” to create your first one."}
        </div>
      ) : (
        <div className="space-y-4">
          {[...configs]
            .sort((a, b) =>
              `${a.paperSize}${a.colorType}`.localeCompare(`${b.paperSize}${b.colorType}`)
            )
            .map((c) => (
              <PricingCard key={c.id} c={c} canManage={canManage} onSaved={refetch} />
            ))}
        </div>
      )}

      {!canManage && (
        <div className="border-2 border-ink/20 bg-ink/5 p-4 text-sm text-fog italic text-center">
          You need the <strong className="text-ink">manage_pricing</strong> privilege to edit
          pricing.
        </div>
      )}
    </div>
  );
}

// ─── App Log ───────────────────────────────────────────────────────────────
function AppLogTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useGetAuditLogsQuery({ page, limit: 50 });
  const logs: any[] = data?.logs || [];
  const totalPages: number = data?.totalPages || 1;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <div className="editorial-label text-persimmon mb-1">ADMIN CONSOLE</div>
        <h1 className="pl-serif text-4xl font-bold text-ink mb-1">App Log</h1>
        <p className="pl-serif italic text-ink/60">
          Append-only audit log of administrative actions.
        </p>
      </div>

      <AdminTable title="AUDIT LOG — READ ONLY">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink/20 bg-ink/5 text-ink/70">
              <th className="p-3 font-semibold whitespace-nowrap">Time</th>
              <th className="p-3 font-semibold">Actor</th>
              <th className="p-3 font-semibold">Action</th>
              <th className="p-3 font-semibold">Target</th>
              <th className="p-3 font-semibold">Detail</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-fog italic">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-fog italic">
                  No audit entries.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-ink/10 last:border-0 hover:bg-ink/5">
                <td className="p-3 text-fog whitespace-nowrap text-xs">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="p-3 font-bold text-ink">{log.actorName}</td>
                <td className="p-3 pl-mono text-[10px] uppercase text-persimmon">{log.action}</td>
                <td className="p-3 text-xs text-fog">{log.target}</td>
                <td
                  className="p-3 text-fog max-w-xs truncate"
                  title={JSON.stringify(log.detail)}
                >
                  {log.detail ? JSON.stringify(log.detail) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTable>

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

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function AdminConsolePage() {
  const currentUser = useSelector((state: RootState) => state.auth.user) as any;
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("dashboard");

  const isSuperAdmin = currentUser?.role === "super_admin";
  const privs: string[] = currentUser?.adminPrivileges || [];
  const can = (p: string) => isSuperAdmin || privs.includes(p);
  const canManageAdmins = isSuperAdmin || privs.includes("manage_roles") || privs.includes("manage_users");

  const handleSignOut = () => {
    dispatch(logOut());
    navigate(ROUTES.ADMIN.LOGIN);
    toast.success("Signed out of admin console.");
  };

  const content = useMemo(() => {
    switch (tab) {
      case "dashboard":
        return <DashboardTab />;
      case "users":
        return <UsersTab canManageAdmins={canManageAdmins} />;
      case "printers":
        return <PrintersTab canManage={can("manage_kiosks")} />;
      case "jobs":
        return <JobsTab canManage={can("requeue_jobs")} />;
      case "pricing":
        return <PricingTab canManage={can("manage_pricing")} />;
      case "transactions":
        return <TransactionsTab canRefund={can("issue_refunds")} />;
      case "promotions":
        return <PromotionsTab canManage={can("manage_promotions")} />;
      case "reports":
        return <ReportsTab />;
      case "options":
        return <OptionsTab canManage={can("manage_settings")} />;
      case "appLog":
        return <AppLogTab />;
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, canManageAdmins, isSuperAdmin, privs.join(",")]);

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-sage text-paper flex-shrink-0 flex flex-col overflow-y-auto">
        <div className="px-5 py-6 border-b border-paper/10">
          <div className="editorial-label text-paper/50 mb-1">PRINTLOOP ADMIN</div>
          <div className="pl-serif text-xl font-bold leading-tight">
            {currentUser?.firstName || "System"} {currentUser?.lastName || "Admin"}
          </div>
          <div className="text-[11px] text-paper/60 mt-1 uppercase tracking-wider font-semibold">
            {isSuperAdmin ? "Super Administrator" : "Administrator"}
          </div>
        </div>

        <nav className="py-2 flex-1">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`w-full text-left px-5 py-3 flex items-center gap-3 transition-colors text-sm font-medium ${
                tab === item.key
                  ? "bg-paper text-sage font-bold"
                  : "text-paper/80 hover:bg-ink/20 hover:text-paper"
              }`}
            >
              <span className="text-base">■</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-paper/10 space-y-2">
          <div className="editorial-label text-paper/40 mb-3">V1 · TYPEORM</div>
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 text-xs font-bold text-persimmon/90 hover:bg-persimmon hover:text-paper transition-colors border border-persimmon/30"
          >
            SIGN OUT →
          </button>
        </div>
      </aside>

      <main className="flex-1 bg-paper overflow-y-auto p-8 animate-fadein">{content}</main>
    </div>
  );
}
