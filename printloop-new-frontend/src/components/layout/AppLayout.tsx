import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Marquee } from "@/components/layout/Marquee";
import { EditorialFooter } from "@/components/layout/EditorialFooter";
import { MobileNav, type MobileNavItem } from "@/components/layout/MobileNav";
import { BottomTabBar, type BottomTab } from "@/components/layout/BottomTabBar";
import { ROUTES } from "@/constants/routes";
import { useDispatch, useSelector } from "react-redux";
import { logOut } from "@/store/features/auth/authSlice";
import type { RootState } from "@/store";

/**
 * Full nav set — appears on desktop and in the mobile drawer.
 * `BOTTOM_TABS` is a 4-item subset (the most-used pages) that
 * surfaces as the phone's persistent bottom-tab bar.
 */
const NAV_ITEMS: MobileNavItem[] = [
  { label: "Dashboard", to: ROUTES.APP.DASHBOARD },
  { label: "New print", to: ROUTES.APP.NEW_PRINT },
  { label: "Batch", to: ROUTES.APP.BATCH_PRINT },
  { label: "Groups", to: ROUTES.APP.GROUP_PRINT },
  { label: "My jobs", to: ROUTES.APP.PRINT_JOBS },
  { label: "Wallet", to: ROUTES.APP.WALLET },
  { label: "Stations", to: ROUTES.APP.STATIONS },
];

const BOTTOM_TABS: BottomTab[] = [
  { label: "Home", to: ROUTES.APP.DASHBOARD },
  { label: "Print", to: ROUTES.APP.NEW_PRINT },
  { label: "Jobs", to: ROUTES.APP.PRINT_JOBS },
  { label: "Wallet", to: ROUTES.APP.WALLET },
];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s: RootState) => s.auth.user) as any;
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    dispatch(logOut());
    navigate(ROUTES.AUTH.LOGIN);
  };

  const firstName = user?.firstName ? user.firstName.toUpperCase() : "ACCOUNT";
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Account";

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

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="bg-paper border-b-2 border-ink px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-4">
        {/* Logo + (desktop) horizontal nav */}
        <div className="flex items-center gap-4 lg:gap-8 min-w-0">
          <Link
            to={ROUTES.APP.DASHBOARD}
            className="font-serif font-extrabold text-[20px] sm:text-[22px] lg:text-[26px] tracking-tight flex-shrink-0"
          >
            PrintLoop<span className="text-persimmon">.</span>
          </Link>
          <nav className="hidden lg:flex gap-1 flex-wrap">
            {NAV_ITEMS.map((it) => {
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

        {/* Right rail: desktop account chip + sign-out, mobile menu button */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Desktop only */}
          <span className="hidden lg:inline text-[10px] tracking-editorial font-bold truncate max-w-[140px]">
            {firstName}
          </span>
          <button
            onClick={handleLogout}
            className="hidden lg:inline-block text-[10px] font-bold tracking-editorial border-2 border-ink px-3 py-1.5 hover:bg-ink hover:text-paper transition-all"
          >
            SIGN OUT
          </button>

          {/* Mobile / tablet menu button */}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="lg:hidden text-[10px] font-bold tracking-editorial border-2 border-ink px-3 py-2 hover:bg-ink hover:text-paper transition-all"
          >
            MENU
          </button>
        </div>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────────────── */}
      <MobileNav
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={NAV_ITEMS}
        userLabel={fullName}
        footerAction={{ label: "Sign out", onClick: handleLogout }}
      />

      {/* ── Main content ──────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-[88px] md:pb-8">
        <Outlet />
      </main>

      {/* Footer only shown above the tab bar on phones via reserved padding;
          on desktop it sits below the content directly. */}
      <div className="hidden md:block">
        <EditorialFooter inverse />
      </div>

      {/* ── Bottom tab bar (phone only) ───────────────────────────── */}
      <BottomTabBar tabs={BOTTOM_TABS} />
    </div>
  );
}
