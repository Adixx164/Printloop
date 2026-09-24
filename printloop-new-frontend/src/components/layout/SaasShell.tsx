import { useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useDispatch } from "react-redux";
import { logOut } from "@/store/features/auth/authSlice";
import {
  useGetTenantMeQuery,
  useSetTenantAvailabilityMutation,
} from "@/store/services/saasApi";

/**
 * Shop console shell (V2-57) — the "driver app" frame for
 * printshop operators: shop nav, an operator-controlled availability
 * toggle (open / busy / closed, reflected on the student map), and
 * sign out. Wraps /saas/* pages.
 */

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: "/saas/dashboard", label: "Dashboard", end: true },
  { to: "/saas/queue", label: "Job Queue" },
  { to: "/saas/operator", label: "Overview" },
  { to: "/saas/transactions", label: "Transactions" },
  { to: "/saas/payouts", label: "Payouts" },
  { to: "/saas/settings", label: "Settings" },
];

const AVAILABILITY: Record<string, { label: string; cls: string }> = {
  open: { label: "OPEN", cls: "bg-sage text-paper" },
  busy: { label: "BUSY", cls: "bg-ochre text-paper" },
  closed: { label: "CLOSED", cls: "bg-persimmon text-paper" },
};

export function SaasShell() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const me = useGetTenantMeQuery();
  const [setAvailability] = useSetTenantAvailabilityMutation();

  const tenant = me.data;
  const availability: "open" | "busy" | "closed" = tenant?.availability ?? "open";

  // The shop console resolves its tenant from the signed-in user; a
  // leftover shop selection from the student app must never leak in.
  useEffect(() => {
    sessionStorage.removeItem("activeTenantSlug");
    sessionStorage.removeItem("reviewedPricesForTenant");
  }, []);

  const toggle = async (next: "open" | "busy" | "closed") => {
    try {
      await setAvailability({ availability: next }).unwrap();
      toast.success(
        next === "open"
          ? "Shop is open — taking orders."
          : next === "busy"
            ? "Marked busy — still taking orders."
            : "Shop closed — new uploads are blocked.",
      );
    } catch (err: any) {
      toast.error(err?.data?.message || "Could not update availability");
    }
  };

  const handleLogout = () => {
    dispatch(logOut());
    navigate("/saas/login");
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper">
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <Link to="/saas/dashboard" className="font-serif font-extrabold text-[22px] tracking-tight">
            PrintLoop<span className="text-persimmon">.</span>
            <span className="ml-2 text-[10px] font-bold tracking-editorial align-middle text-ink/50">
              SHOP CONSOLE
            </span>
          </Link>

          <nav className="order-3 sm:order-none w-full sm:w-auto flex items-center gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `text-[11px] sm:text-xs font-bold tracking-editorial uppercase px-2.5 py-1.5 whitespace-nowrap border-2 transition-all ${
                    isActive
                      ? "border-ink bg-ink text-paper"
                      : "border-transparent text-ink/60 hover:text-ink hover:border-ink/40"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Operator availability toggle (V2-57) — open/busy/closed. */}
            <div className="flex border-2 border-ink">
              {(["open", "busy", "closed"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => toggle(a)}
                  title={`Set shop ${a}`}
                  className={`px-2.5 py-1.5 text-[10px] font-bold tracking-editorial uppercase transition-all ${
                    availability === a ? AVAILABILITY[a].cls : "bg-paper text-ink/40 hover:text-ink"
                  }`}
                >
                  {AVAILABILITY[a].label}
                </button>
              ))}
            </div>
            <button
              onClick={handleLogout}
              className="text-[11px] font-bold tracking-editorial uppercase px-2.5 py-1.5 border-2 border-ink/30 text-ink/60 hover:border-persimmon hover:text-persimmon"
            >
              SIGN OUT
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
