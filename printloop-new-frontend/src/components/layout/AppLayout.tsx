import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Marquee } from "@/components/layout/Marquee";
import { EditorialFooter } from "@/components/layout/EditorialFooter";
import { ROUTES } from "@/constants/routes";
import { useDispatch, useSelector } from "react-redux";
import { logOut } from "@/store/features/auth/authSlice";
import type { RootState } from "@/store";

const navItems = [
  { label: "Dashboard", to: ROUTES.APP.DASHBOARD },
  { label: "New print", to: ROUTES.APP.NEW_PRINT },
  { label: "Batch", to: ROUTES.APP.BATCH_PRINT },
  { label: "Groups", to: ROUTES.APP.GROUP_PRINT },
  { label: "My jobs", to: ROUTES.APP.PRINT_JOBS },
  { label: "Wallet", to: ROUTES.APP.WALLET },
  { label: "Stations", to: ROUTES.APP.STATIONS },
];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s: RootState) => s.auth.user) as any;

  const handleLogout = () => {
    dispatch(logOut());
    navigate(ROUTES.AUTH.LOGIN);
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <Marquee
        items={[
          { text: "★ PRINTLOOP — VOL. I · ISSUE 09 · LAGOS, NIGERIA" },
          { text: "● 12 STATIONS LIVE", accent: true },
          { text: "YABA · UNILAG · UI · OAU · LASU · COVENANT" },
          { text: "NEW: GROUP PRINTING" },
          { text: "● 47 PRINTS THIS HOUR", accent: true },
          { text: "FREE TOP-UP ON FIRST PRINT" },
        ]}
      />

      <div className="bg-paper border-b-2 border-ink px-8 py-4 flex justify-between items-center gap-4">
        <div className="flex items-center gap-8">
          <Link to={ROUTES.APP.DASHBOARD} className="font-serif font-extrabold text-[26px] tracking-tight">
            PrintLoop<span className="text-persimmon">.</span>
          </Link>
          <nav className="flex gap-1 flex-wrap">
            {navItems.map((it) => {
              const active = location.pathname === it.to;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-2 transition-all ${
                    active
                      ? "bg-persimmon text-paper border-ink"
                      : "border-transparent text-ink hover:bg-ink hover:text-paper hover:border-ink"
                  }`}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-editorial font-bold">
            {user?.firstName ? `${user.firstName.toUpperCase()}` : "ACCOUNT"}
          </span>
          <button
            onClick={handleLogout}
            className="text-[10px] font-bold tracking-editorial border-2 border-ink px-3 py-1.5 hover:bg-ink hover:text-paper transition-all"
          >
            SIGN OUT
          </button>
        </div>
      </div>

      <main className="flex-1 w-full max-w-6xl mx-auto px-8 py-8">
        <Outlet />
      </main>

      <EditorialFooter inverse />
    </div>
  );
}
