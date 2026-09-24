import { NavLink, Outlet, Link } from "react-router-dom";

/**
 * `/saas/settings/*` shell — left-rail tab nav + outlet for the
 * branding / domains / webhooks / security / account sub-pages.
 *
 * Restyled (V2-38) to the editorial-brutalist system: Fraunces
 * heading, Ink/Persimmon active-tab treatment, brutalist rail.
 */
const TABS = [
  { to: "/saas/settings/branding", label: "Branding" },
  { to: "/saas/settings/domains", label: "Custom domain" },
  { to: "/saas/settings/webhooks", label: "Webhooks" },
  { to: "/saas/settings/security", label: "Security (2FA)" },
  { to: "/saas/operator", label: "Operator console" },
  { to: "/saas/settings/account", label: "Account & data" },
];

export default function SettingsLayout() {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="editorial-label text-persimmon mb-1">▸ SHOP SETTINGS</div>
          <h1 className="pl-serif font-extrabold text-3xl sm:text-4xl leading-none tracking-tight">
            Settings
          </h1>
        </div>
        <Link
          to="/saas/dashboard"
          className="text-sm font-bold text-persimmon border-b-2 border-persimmon whitespace-nowrap"
        >
          ← Dashboard
        </Link>
      </div>
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
        <nav className="sm:w-52 shrink-0 flex sm:flex-col gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-pl-sm text-sm font-bold border-2 whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-ink text-paper border-ink"
                    : "bg-transparent text-ink/70 border-transparent hover:border-ink hover:text-ink"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
