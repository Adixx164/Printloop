import { useEffect, useRef } from "react";
import { useScrollScrub } from "@/components/ui/scrollFx";

/**
 * Paper3D (V2-45) — a CSS-3D stack of printed sheets that turns on a
 * turntable as you scroll while the top proof lifts off toward the
 * viewer. Real perspective + `transform-style: preserve-3d`, GPU-
 * composited, NO WebGL/Three.js — chosen to stay smooth on a low-end
 * campus Android. Paper only, no printer.
 *
 *   • scroll position (useScrollScrub, 0..1 as the scene crosses the
 *     viewport) drives BOTH the turntable rotateY and the top sheet's
 *     lift — that's the "3D scroll".
 *   • depth comes from sheets layered in Z (a receding stack), not a
 *     fake drop shadow.
 *   • fine pointer (desktop) leans the stage toward the cursor; inert
 *     on touch + reduced motion (where useScrollScrub fires once at
 *     p=1 → finished state, static).
 *
 * Per-frame work is direct style mutation via refs — no React
 * re-renders inside the scroll/pointer loop.
 */

const SW = 152; // sheet width
const SH = 210; // sheet height (≈ √2 A-series ratio)

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clampPart = (n: number) => Math.max(-1, Math.min(1, n));

export default function Paper3D() {
  const stageRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  const progress = useRef(0);
  const tilt = useRef({ x: 0, y: 0 });

  const apply = () => {
    const p = progress.current;

    // Turntable: −20° → +20° across the scroll, plus pointer lean.
    const ry = -20 + p * 40 + tilt.current.x;
    const rx = 15 + tilt.current.y;
    if (stageRef.current) {
      stageRef.current.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    }

    // Top sheet peels up off the stack and forward toward the viewer.
    const e = clamp01((p - 0.05) / 0.8);
    const ease = 1 - Math.pow(1 - e, 3);
    if (topRef.current) {
      const ty = -ease * 120; // lifts up off the stack
      const tz = 12 + ease * 70; // already proud of the stack, comes forward
      const rxS = -ease * 12; // leans its top edge back toward the viewer
      const rzS = -ease * 5; // slight peel skew
      topRef.current.style.transform =
        `translate(-50%,-50%) translateY(${ty.toFixed(1)}px) translateZ(${tz.toFixed(1)}px) rotateX(${rxS.toFixed(1)}deg) rotateZ(${rzS.toFixed(1)}deg)`;
    }
    if (shadowRef.current) {
      shadowRef.current.style.opacity = String(0.18 * (1 - ease * 0.45));
      shadowRef.current.style.transform =
        `translate(-50%,-50%) rotateX(90deg) translateZ(-${(SH / 2).toFixed(0)}px) scale(${(1 - ease * 0.25).toFixed(3)})`;
    }
  };

  const scrubRef = useScrollScrub((p) => {
    progress.current = p;
    apply();
  });

  // Pointer lean (fine-pointer only; off on touch + reduced motion).
  useEffect(() => {
    const el = scrubRef.current;
    if (!el) return;
    if (reduced() || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const nx = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const ny = (ev.clientY - (r.top + r.height / 2)) / (r.height / 2);
      tilt.current = { x: clampPart(nx) * 12, y: -clampPart(ny) * 7 };
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(); });
    };
    const onLeave = () => {
      tilt.current = { x: 0, y: 0 };
      apply();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The receding stack behind the top sheet — pure Z-depth.
  const backSheets = [1, 2, 3];

  return (
    <div
      ref={scrubRef}
      className="relative mx-auto select-none"
      style={{ height: 360, perspective: "1100px", perspectiveOrigin: "50% 42%" }}
      aria-hidden="true"
    >
      <div
        ref={stageRef}
        className="pl-3d absolute left-1/2 top-1/2"
        style={{
          width: 0,
          height: 0,
          transform: "rotateX(15deg) rotateY(-20deg)",
          transition: "transform 120ms linear",
        }}
      >
        {/* Floor contact shadow under the stack. */}
        <div
          ref={shadowRef}
          className="pl-face"
          style={{
            width: SW,
            height: SH,
            background: "#1A1410",
            filter: "blur(12px)",
            borderRadius: 8,
            transform: `translate(-50%,-50%) rotateX(90deg) translateZ(-${SH / 2}px)`,
            opacity: 0.18,
          }}
        />

        {/* Receding stack (back → front), each pushed deeper in Z. */}
        {backSheets.map((i) => (
          <div
            key={i}
            className="pl-face border-2 border-ink rounded-sm"
            style={{
              width: SW,
              height: SH,
              background: i % 2 ? "#FBF6EC" : "#FFFEFA",
              transform: `translate(-50%,-50%) translateZ(${-i * 16}px) translateY(${i * 5}px) translateX(${i * 5}px) rotateZ(${i * 1.4}deg)`,
            }}
          >
            <div className="absolute inset-0 p-3 flex flex-col gap-2 opacity-50">
              <div className="h-1.5 bg-ink/15 rounded-full w-3/4" />
              <div className="h-1.5 bg-ink/15 rounded-full w-full" />
              <div className="h-1.5 bg-ink/15 rounded-full w-2/3" />
            </div>
          </div>
        ))}

        {/* The top sheet — the live proof, lifts off on scroll. */}
        <div
          ref={topRef}
          className="pl-face border-2 border-ink rounded-sm overflow-hidden"
          style={{
            width: SW,
            height: SH,
            background: "#FFFEFA",
            boxShadow: "6px 6px 0 rgba(26,20,16,0.18)",
            transform: "translate(-50%,-50%) translateY(0px) translateZ(12px) rotateX(0deg) rotateZ(0deg)",
          }}
        >
          <div className="absolute inset-0 p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="editorial-label text-persimmon text-[8px]">▸ PROOF</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-persimmon animate-blink" />
            </div>
            <div className="h-1.5 bg-ink/20 rounded-full w-full" />
            <div className="h-1.5 bg-ink/20 rounded-full w-4/5" />
            <div className="h-1.5 bg-ink/20 rounded-full w-full" />
            <div className="h-1.5 bg-ink/20 rounded-full w-2/3" />
            <div className="h-1.5 bg-ink/20 rounded-full w-3/4" />
            <div className="mt-auto flex items-center justify-between">
              <span className="pl-serif font-extrabold text-ink text-xs leading-none">
                PrintLoop<span className="text-persimmon">.</span>
              </span>
              <span className="pl-mono text-[9px] font-bold bg-ink text-paper px-1.5 py-0.5">
                RDY · 7F3K9Q
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
