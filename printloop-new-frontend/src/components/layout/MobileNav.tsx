import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";

export interface MobileNavItem {
  label: string;
  to: string;
}

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  items: MobileNavItem[];
  /** Optional name shown above the nav block (e.g. user's first name). */
  userLabel?: string;
  /** Optional secondary action rendered at the bottom of the drawer. */
  footerAction?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Mobile-only navigation drawer. Slides in from the right, full
 * height, with a backdrop. Uses the brutalist aesthetic — 2px ink
 * borders, hard offset shadow on the drawer, all-caps labels.
 *
 * Auto-closes when the route changes or the user taps the backdrop.
 * Locks body scroll while open and traps focus inside the drawer.
 */
export function MobileNav({ open, onClose, items, userLabel, footerAction }: MobileNavProps) {
  const location = useLocation();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Close on route change.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Lock body scroll while drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink/70 backdrop-blur-sm transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer */}
      <aside
        aria-hidden={!open}
        aria-label="Site navigation"
        className={`fixed top-0 right-0 z-50 h-full w-[82vw] max-w-[340px] bg-paper border-l-2 border-ink shadow-[-8px_0_0_0_#1A1410] transition-transform duration-200 ease-out md:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header strip */}
          <div className="flex items-center justify-between px-5 py-4 border-b-2 border-ink">
            <span className="editorial-label">Menu</span>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close menu"
              className="text-[10px] font-bold tracking-editorial border-2 border-ink px-3 py-1.5 hover:bg-ink hover:text-paper transition-all"
            >
              CLOSE
            </button>
          </div>

          {/* User strip */}
          {userLabel && (
            <div className="px-5 py-3 border-b-2 border-ink bg-paper-warm">
              <div className="editorial-label text-fog">Signed in as</div>
              <div className="font-bold text-base mt-0.5">{userLabel}</div>
            </div>
          )}

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1.5">
            {items.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={`block px-4 py-3.5 text-sm font-bold uppercase tracking-wider border-2 rounded-md transition-all ${
                    active
                      ? "bg-persimmon text-paper border-ink shadow-[3px_3px_0_#1A1410]"
                      : "border-ink/15 text-ink hover:bg-ink hover:text-paper hover:border-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Footer action */}
          {footerAction && (
            <div className="p-3 border-t-2 border-ink">
              <button
                onClick={() => {
                  onClose();
                  footerAction.onClick();
                }}
                className="w-full px-4 py-3 bg-ink text-paper text-xs font-bold tracking-editorial uppercase rounded-md hover:bg-persimmon transition-colors"
              >
                {footerAction.label}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
