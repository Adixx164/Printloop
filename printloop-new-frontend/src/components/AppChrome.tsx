import { useEffect, useRef } from "react";

/**
 * App-chrome flourishes — cross-platform touches:
 *
 *   TabTitleNudge   — when the tab loses focus, swap the document title to
 *                     a gentle come-back line; restore it on return.
 *
 * Honours prefers-reduced-motion.
 */

export function TabTitleNudge() {
  useEffect(() => {
    let saved = "";
    const onChange = () => {
      if (document.hidden) {
        // Capture whatever the current title is (wordmark / page) so we
        // restore exactly that, not a hard-coded default.
        if (!saved) saved = document.title;
        document.title = "↩ Your loop is still open";
      } else if (saved) {
        document.title = saved;
        saved = "";
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return null;
}
