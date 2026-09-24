import { useEffect, useRef } from "react";

/**
 * News-ticker tape. Two modes:
 *  - default: pure-CSS loop (animate-marquee), used app-wide.
 *  - reactive: rAF-driven so the tape speeds up with scroll velocity —
 *    the press runs faster when the reader rushes. Landing page only.
 *    Under prefers-reduced-motion the tape simply holds still.
 */
export function Marquee({
  items,
  reactive = false,
}: {
  items: { text: string; accent?: boolean }[];
  reactive?: boolean;
}) {
  const tape = [...items, ...items];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reactive) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    let x = 0;
    let vel = 0;
    let lastY = window.scrollY;
    let raf = 0;
    const tick = () => {
      const y = window.scrollY;
      // Smoothed |scroll velocity| → extra tape speed, capped so a
      // page-jump doesn't turn the ticker into a blur.
      vel += (Math.abs(y - lastY) - vel) * 0.12;
      lastY = y;
      x -= 0.55 + Math.min(vel * 0.18, 3.2);
      const half = el.scrollWidth / 2;
      if (half > 0 && -x >= half) x += half;
      el.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reactive]);

  return (
    <div className="bg-ink text-paper py-2 overflow-hidden border-b-2 border-persimmon">
      <div
        ref={ref}
        className={`flex gap-12 whitespace-nowrap ${reactive ? "" : "animate-marquee"}`}
      >
        {tape.map((item, i) => (
          <span
            key={i}
            className={`text-[10px] tracking-editorial font-bold ${item.accent ? "text-persimmon" : ""}`}
          >
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}
