import { Link, useLocation } from "react-router-dom";

export interface BottomTab {
  label: string;
  to: string;
}

interface BottomTabBarProps {
  /** 3–5 tabs. More than 5 won't fit comfortably on a phone. */
  tabs: BottomTab[];
}

/**
 * Fixed bottom-tab bar shown ONLY on phones (md:hidden). Persistent
 * one-tap access to the most-used pages. Stays out of the way of
 * iOS/Android home-bar via `pb-safe`-style padding.
 *
 * The main content area must reserve space for this bar — see
 * `pb-[72px] md:pb-0` on the `<main>` element.
 */
export function BottomTabBar({ tabs }: BottomTabBarProps) {
  const location = useLocation();
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-30 bg-paper border-t-2 border-ink md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => {
          const active = location.pathname === tab.to;
          return (
            <li key={tab.to} className="border-r-2 border-ink last:border-r-0">
              <Link
                to={tab.to}
                className={`flex items-center justify-center px-2 py-3 text-[10px] font-bold tracking-editorial uppercase transition-colors ${
                  active ? "bg-persimmon text-paper" : "text-ink hover:bg-ink hover:text-paper"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
