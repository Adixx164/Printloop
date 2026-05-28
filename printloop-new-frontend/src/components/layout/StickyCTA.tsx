import type { ReactNode } from "react";

interface StickyCTAProps {
  /** Optional summary line shown above the button — usually a cost. */
  summary?: ReactNode;
  /** Action button (any clickable element). */
  action: ReactNode;
  /** Only sticks on mobile by default. Set true to stick on all sizes. */
  alwaysSticky?: boolean;
}

/**
 * Bottom-sticky summary + CTA panel — phone-first pattern. Used on
 * long forms (new print, batch, group setup) so the primary action
 * is always one tap away.
 *
 * On mobile this floats above the BottomTabBar via z-index. On
 * tablet+ it falls back to flowing inline at the end of the form
 * (unless `alwaysSticky`).
 */
export function StickyCTA({ summary, action, alwaysSticky }: StickyCTAProps) {
  const base =
    "left-0 right-0 z-20 bg-paper-light border-t-2 border-ink px-4 py-3 flex flex-col gap-2";
  const positioning = alwaysSticky
    ? "fixed bottom-[72px] sm:bottom-0"
    : "fixed bottom-[72px] md:static md:bottom-auto md:border-t-0 md:px-0 md:py-4 md:bg-transparent";
  return (
    <div
      className={`${base} ${positioning}`}
      style={{
        paddingBottom: alwaysSticky
          ? "calc(12px + env(safe-area-inset-bottom, 0px))"
          : undefined,
      }}
    >
      {summary && (
        <div className="text-sm flex items-center justify-between gap-3">
          {summary}
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2 md:gap-3 md:justify-end">{action}</div>
    </div>
  );
}
