/**
 * scrollFx — PrintLoop's dependency-free scroll-animation kit (V2-43).
 *
 * Editorial-brutalist motion: blocks stamp onto the page like type on
 * a press — no misty fades, no springy bounces. Everything is
 * IntersectionObserver + requestAnimationFrame, transforms only (no
 * layout thrash), and every effect collapses to a static page under
 * `prefers-reduced-motion: reduce`.
 *
 *   <Reveal variant="rise|left|right|stamp|wipe|fade" delay={ms}>…
 *   <Counter to={47} prefix="₦" />        count-up once when seen
 *   useParallax(factor)                   ref — drifts at factor × scrollY
 *   useScrollSpin(degPerPx, baseDeg)      ref — rotates with scroll
 *   <ScrollProgress />                    reading-progress bar (masthead)
 *
 * The reveal CSS lives in index.css under `.pl-reveal` — variant
 * classes are the hidden states; `[data-shown]` is the resting state.
 */
import { ReactNode, useEffect, useRef, useState } from "react";

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type RevealVariant = "rise" | "left" | "right" | "stamp" | "wipe" | "fade" | "flip" | "scale" | "blur" | "rotate-in" | "slide-up";

/**
 * Bare in-view detector for custom reveal markup (e.g. the typeset
 * headline, where each word carries its own delay). Same IO settings
 * as <Reveal>.
 */
export function useInView(opts: { threshold?: number; once?: boolean } = {}) {
  const { threshold = 0.15, once = true } = opts;
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          if (once) io.disconnect();
        } else if (!once) {
          setShown(false);
        }
      },
      { threshold, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold]);

  return { ref, shown };
}

export function Reveal({
  children,
  variant = "rise",
  delay = 0,
  once = true,
  threshold = 0.15,
  className = "",
}: {
  children: ReactNode;
  variant?: RevealVariant;
  /** Transition delay in ms — stagger siblings with i * 100–150. */
  delay?: number;
  /** false → also un-reveals when scrolled back out. */
  once?: boolean;
  threshold?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          if (once) io.disconnect();
        } else if (!once) {
          setShown(false);
        }
      },
      // -10% bottom margin: reveal starts once the element is properly
      // inside the viewport, not the instant a pixel peeks in.
      { threshold, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, threshold]);

  return (
    <div
      ref={ref}
      data-shown={shown ? "" : undefined}
      className={`pl-reveal pl-reveal-${variant} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** Count-up number that runs once when it scrolls into view. */
export function Counter({
  to,
  prefix = "",
  suffix = "",
  duration = 1400,
  className = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(() => (reducedMotion() ? to : 0));

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
          setVal(Math.round(to * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [to, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

/**
 * rAF-throttled scroll-linked transform. `compute` is kept in a ref so
 * the listener binds once and never churns on re-render.
 */
function useScrollTransform(compute: (scrollY: number) => string) {
  const ref = useRef<HTMLDivElement>(null);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      if (ref.current) {
        ref.current.style.transform = computeRef.current(window.scrollY);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}

/** Decorative drift: element translates at `factor` × scrollY. */
export function useParallax(factor: number) {
  return useScrollTransform((y) => `translate3d(0, ${(y * factor).toFixed(1)}px, 0)`);
}

/**
 * Scroll-scrubbed progress: `onProgress(0..1)` fires (rAF-throttled)
 * as the element travels through the viewport — 0 when its top enters
 * at the bottom edge, 1 when its bottom leaves at the top. Drives
 * draw-on SVG paths and other scrubbed scenes. Under reduced motion
 * the callback fires once with 1 (fully drawn, static).
 */
export function useScrollScrub(onProgress: (p: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onProgress);
  cb.current = onProgress;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      cb.current(1);
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = r.height + vh;
      const p = total > 0 ? Math.min(1, Math.max(0, (vh - r.top) / total)) : 1;
      cb.current(p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}

/**
 * Pinned-scene progress. Put the ref on a tall "track" section whose
 * child is `position: sticky; top: 0; height: 100vh`. Reports 0 the
 * moment the track's top reaches the viewport top (the pin engages)
 * and 1 when its bottom meets the viewport bottom (the pin releases) —
 * i.e. exactly the stretch of scroll the visitor spends "held" on the
 * scene. Continuous and reversible; rAF-throttled. Under reduced
 * motion fires once with 1 (callers should render a static fallback
 * instead anyway — see usePrefersReducedMotion).
 */
export function usePinScrub(onProgress: (p: number) => void) {
  const ref = useRef<HTMLElement>(null);
  const cb = useRef(onProgress);
  cb.current = onProgress;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      cb.current(1);
      return;
    }
    let raf = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      cb.current(span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 1);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return ref as React.RefObject<HTMLDivElement>;
}

/**
 * Render-time reduced-motion check, for swapping a scrubbed scene out
 * for static markup entirely (CSS alone can't change the React tree).
 * Read once per mount — OS-level toggles mid-session are rare enough
 * that a live listener isn't worth the churn.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(reducedMotion);
  return reduced;
}

/**
 * Magnetic hover: the wrapper leans toward the pointer (desktop /
 * fine-pointer only — inert on touch and under reduced motion). Wrap
 * a button rather than restyling it, so the button's own hover
 * transform keeps working.
 */
export function Magnetic({
  children,
  strength = 0.22,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * strength;
      const dy = (e.clientY - (r.top + r.height / 2)) * strength;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        });
      }
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.style.transform = "translate(0px, 0px)";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [strength]);

  return (
    <div ref={ref} className={`transition-transform duration-200 ease-expressive ${className}`}>
      {children}
    </div>
  );
}

/** Scroll-linked rotation — the rubber-stamp badge. */
export function useScrollSpin(degPerPx: number, baseDeg = 0) {
  return useScrollTransform((y) => `rotate(${(baseDeg + y * degPerPx).toFixed(2)}deg)`);
}

/**
 * Reading-progress bar. Mount directly under a sticky masthead — the
 * persimmon bar tracks how far down the page the reader is.
 */
export function ScrollProgress({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (ref.current) ref.current.style.transform = `scaleX(${p.toFixed(4)})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`h-[3px] bg-paper ${className}`} aria-hidden="true">
      <div
        ref={ref}
        className="h-full w-full bg-persimmon origin-left"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
