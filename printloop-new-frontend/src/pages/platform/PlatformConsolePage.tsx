import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { RootState } from "@/store";
import { setCredentials } from "@/store/features/auth/authSlice";
import {
  useListTenantsQuery,
  useSuspendTenantMutation,
  useReactivateTenantMutation,
  useImpersonateTenantMutation,
  useHardDeleteTenantMutation,
  type PlatformTenant,
} from "@/store/services/platformApi";
import HowPrintLoopWorks from "@/components/HowPrintLoopWorks";

const STATUS_FILTERS = ["", "trial", "active", "suspended", "closed"] as const;
type ConsoleView = "tenants" | "how";

/**
 * `/platform` — PrintLoop operator console (Dimension 11).
 *
 * SUPER_ADMIN only. The backend enforces it (requirePlatformAdmin);
 * we also gate client-side so a non-platform user gets a clear
 * message instead of a wall of 403s.
 */
export default function PlatformConsolePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const role = useSelector((s: RootState) => s.auth.user?.role);

  const [view, setView] = useState<ConsoleView>("tenants");
  const [status, setStatus] = useState<string>("");
  const { data, isLoading, isError } = useListTenantsQuery(
    status ? { status, limit: 100 } : { limit: 100 },
  );
  const [suspend] = useSuspendTenantMutation();
  const [reactivate] = useReactivateTenantMutation();
  const [impersonate, impState] = useImpersonateTenantMutation();
  const [hardDelete] = useHardDeleteTenantMutation();

  if (role !== "super_admin") {
    return (
      <div className="max-w-md mx-auto p-12 text-center">
        <h1 className="text-2xl font-bold">Platform console</h1>
        <p className="text-gray-600 mt-3">
          This area is for PrintLoop platform administrators only.
        </p>
      </div>
    );
  }

  const onImpersonate = async (t: PlatformTenant) => {
    try {
      const res = await impersonate({ id: t.id, ttl: 3600 }).unwrap();
      // Back up the platform-admin session, swap in the impersonation
      // token, and jump to the tenant dashboard. The ImpersonationBanner
      // reads the new token's claim + offers Exit.
      const current = localStorage.getItem("pl_auth");
      if (current) localStorage.setItem("pl_platform_session", current);
      dispatch(setCredentials({ tokens: { accessToken: res.token } }));
      navigate("/saas/dashboard");
    } catch {
      /* surfaced via impState */
    }
  };

  const onHardDelete = async (t: PlatformTenant) => {
    const ok = window.confirm(
      `Hard-delete ${t.slug}? This wipes ALL their data irreversibly.`,
    );
    if (!ok) return;
    const force = t.status !== "closed";
    try {
      await hardDelete({ id: t.id, force }).unwrap();
    } catch (e: any) {
      window.alert(e?.data?.message || "Delete failed");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      {/* Console tab nav (V2-37) */}
      <nav className="flex gap-1 border-b">
        <TabButton
          active={view === "tenants"}
          onClick={() => setView("tenants")}
        >
          Tenants
        </TabButton>
        <TabButton active={view === "how"} onClick={() => setView("how")}>
          How it works
        </TabButton>
      </nav>

      {view === "how" && <HowPrintLoopWorks />}

      {view === "tenants" && (
        <>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tenants</h1>
        <select
          className="border rounded px-3 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All statuses" : s}
            </option>
          ))}
        </select>
      </div>

      {impState.isError && (
        <p className="text-red-600 text-sm">
          {(impState.error as any)?.data?.message || "Impersonation failed."}
        </p>
      )}
      {isLoading && <p className="text-gray-500">Loading…</p>}
      {isError && (
        <p className="text-red-600">Failed to load tenants.</p>
      )}

      {data && (
        <table className="w-full text-sm border-collapse">
          <thead className="text-left text-gray-500 border-b">
            <tr>
              <th className="py-2">Business</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Commission</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((t) => (
              <tr key={t.id} className="border-b last:border-0 align-top">
                <td className="py-2 font-medium">{t.name}</td>
                <td className="font-mono text-xs">{t.slug}</td>
                <td>
                  <StatusPill status={t.status} />
                  {t.suspendReason && (
                    <div className="text-xs text-gray-400 max-w-[180px]">
                      {t.suspendReason}
                    </div>
                  )}
                </td>
                <td>{(t.commissionPct * 100).toFixed(1)}%</td>
                <td className="text-xs text-gray-500">
                  {new Date(t.createdAt).toLocaleDateString()}
                </td>
                <td className="text-right space-x-2 whitespace-nowrap">
                  {t.status === "suspended" ? (
                    <button
                      onClick={() => reactivate({ id: t.id })}
                      className="text-green-700 text-xs"
                    >
                      Reactivate
                    </button>
                  ) : t.status !== "closed" ? (
                    <button
                      onClick={() => {
                        const reason =
                          window.prompt("Suspend reason (optional):") ||
                          undefined;
                        suspend({ id: t.id, reason });
                      }}
                      className="text-yellow-700 text-xs"
                    >
                      Suspend
                    </button>
                  ) : null}
                  <button
                    onClick={() => onImpersonate(t)}
                    className="text-[#225275] text-xs"
                  >
                    Impersonate
                  </button>
                  <button
                    onClick={() => onHardDelete(t)}
                    className="text-red-600 text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
        active
          ? "border-[#225275] text-[#225275]"
          : "border-transparent text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "active"
      ? "bg-green-100 text-green-800"
      : status === "suspended"
      ? "bg-yellow-100 text-yellow-800"
      : status === "closed"
      ? "bg-red-100 text-red-800"
      : "bg-blue-100 text-blue-800";
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${color}`}>{status}</span>
  );
}
