import { useRef } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { Marquee } from "@/components/layout/Marquee";
import { EditorialFooter } from "@/components/layout/EditorialFooter";
import {
  Reveal,
  Counter,
  ScrollProgress,
  Magnetic,
  useInView,
  useParallax,
  usePinScrub,
  usePrefersReducedMotion,
  useScrollScrub,
  useScrollSpin,
} from "@/components/ui/scrollFx";
import Paper3D from "@/components/ui/Paper3D";

/**
 * Landing page (V2-43/43b): scroll-driven editorial motion.
 * Sticky masthead + reading-progress bar, typeset hero (each word
 * pressed on like movable type), parallax ornaments + ghost issue
 * number, scroll-spun stamp badge, velocity-reactive marquee, a
 * scroll-scrubbed connector that draws the loop across the three
 * steps, count-up stats, magnetic CTAs — all from scrollFx.tsx,
 * no animation libraries.
 */

/** Hero headline as movable type: each word stamps in, staggered. */
const HERO_WORDS: { w?: string; br?: boolean; cls?: string }[] = [
  { w: "Your" },
  { w: "campus" },
  { w: "printing," },
  { br: true },
  { w: "finally", cls: "italic text-persimmon font-semibold" },
  { w: "done" },
  { w: "right." },
];

/** Circular rubber-stamp badge that rotates as the reader scrolls. */
function LoopStamp() {
  const ref = useScrollSpin(0.06, -8);
  return (
    <div
      ref={ref}
      className="hidden lg:block absolute right-4 top-10 w-36 h-36 pointer-events-none select-none"
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120" className="w-full h-full">
        <defs>
          <path
            id="loop-stamp-circle"
            d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"
          />
        </defs>
        <circle cx="60" cy="60" r="56" fill="none" stroke="#1A1410" strokeWidth="2" />
        <circle
          cx="60"
          cy="60"
          r="31"
          fill="none"
          stroke="#D14B2C"
          strokeWidth="1.5"
          strokeDasharray="3 4"
        />
        <text fontSize="10.5" fontWeight="700" letterSpacing="2.4" fill="#D14B2C">
          <textPath href="#loop-stamp-circle">UPLOAD · PAY · COLLECT · REPEAT ·</textPath>
        </text>
        <text
          x="60"
          y="65"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fill="#1A1410"
          fontFamily="Fraunces, serif"
          fontStyle="italic"
        >
          est. ’26
        </text>
      </svg>
    </div>
  );
}

/**
 * Scroll-scrubbed dispatch route across the three step cards: the
 * ochre line draws itself as the section travels the viewport, and a
 * persimmon node pops at each stop. Desktop only — on mobile the
 * cards stack and the route has nothing to connect.
 */
function StepConnector() {
  const lineRef = useRef<SVGPathElement>(null);
  const dotsRef = useRef<(SVGCircleElement | null)[]>([]);
  const NODES: { x: number; y: number }[] = [
    { x: 16, y: 26 },
    { x: 350, y: 16 },
    { x: 684, y: 22 },
  ];
  const ref = useScrollScrub((p) => {
    // Map the middle stretch of the section's travel to 0..1 so the
    // draw happens while the cards are actually on screen.
    const draw = Math.min(1, Math.max(0, (p - 0.18) / 0.42));
    if (lineRef.current) lineRef.current.style.strokeDashoffset = String(1 - draw);
    [0.12, 0.55, 0.96].forEach((t, i) => {
      const d = dotsRef.current[i];
      if (!d) return;
      const on = draw >= t;
      d.style.opacity = on ? "1" : "0";
      d.style.transform = on ? "scale(1)" : "scale(0.2)";
    });
  });
  return (
    <div ref={ref} className="hidden md:block mb-3" aria-hidden="true">
      <svg viewBox="0 0 700 36" className="w-full h-9 overflow-visible" fill="none">
        <path
          ref={lineRef}
          d="M16 26 C 130 2, 250 32, 350 16 C 460 0, 570 34, 684 22"
          stroke="#C7944A"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset="1"
        />
        {NODES.map((n, i) => (
          <circle
            key={n.x}
            ref={(el) => {
              dotsRef.current[i] = el;
            }}
            cx={n.x}
            cy={n.y}
            r="5"
            fill="#D14B2C"
            stroke="#1A1410"
            strokeWidth="1.5"
            style={{
              opacity: 0,
              transform: "scale(0.2)",
              transformOrigin: `${n.x}px ${n.y}px`,
              transition: "opacity 300ms, transform 300ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

/**
 * The pinned scene (V2-43c): a 260vh track whose sticky stage holds
 * the viewport while the visitor's scroll plays the product demo —
 * a document flies from a phone, gets stamped with its 6-char code
 * at the Paystack gate, and lands in the printer tray. Reversible
 * (scroll back = rewind). Desktop md+ only; mobile and
 * reduced-motion users get the static three-card spread instead.
 * All per-frame work is direct style mutation via refs — no React
 * re-renders inside the scrub.
 */
const STATION_X = [16.66, 50, 83.33]; // % across the route, on card centers

function PinnedMethod() {
  const paper = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLDivElement>(null);
  const ready = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const moveNo = useRef<HTMLSpanElement>(null);
  const texts = useRef<(HTMLDivElement | null)[]>([]);
  const dots = useRef<(HTMLDivElement | null)[]>([]);

  const ref = usePinScrub((s) => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    if (paper.current) {
      const x = lerp(STATION_X[0], STATION_X[2], s);
      const arc = Math.sin(s * Math.PI) * -34;
      paper.current.style.left = `${x.toFixed(2)}%`;
      paper.current.style.transform = `translateX(-50%) translateY(${arc.toFixed(1)}px) rotate(${lerp(-6, 4, s).toFixed(1)}deg)`;
    }
    const idx = s < 1 / 3 ? 0 : s < 2 / 3 ? 1 : 2;
    texts.current.forEach((t, i) => {
      if (!t) return;
      t.style.opacity = i === idx ? "1" : "0.35";
      t.style.transform = i === idx ? "translateY(0)" : "translateY(6px)";
    });
    dots.current.forEach((d, i) => {
      if (d) d.style.background = i <= idx ? "#D14B2C" : "#EEE7D9";
    });
    if (moveNo.current) moveNo.current.textContent = `MOVE 0${idx + 1} / 03`;
    if (fill.current) fill.current.style.transform = `scaleX(${s.toFixed(4)})`;
    if (chip.current) {
      const on = s >= 0.5;
      chip.current.style.opacity = on ? "1" : "0";
      chip.current.style.transform = on
        ? "rotate(-6deg) scale(1)"
        : "rotate(-6deg) scale(1.5)";
    }
    if (ready.current) {
      const on = s >= 0.93;
      ready.current.style.opacity = on ? "1" : "0";
      ready.current.style.transform = on
        ? "translateX(-50%) translateY(0)"
        : "translateX(-50%) translateY(8px)";
    }
    if (hint.current) hint.current.style.opacity = s < 0.04 ? "1" : "0";
  });

  return (
    <section ref={ref} className="hidden md:block relative h-[260vh] border-t-2 border-ink">
      <div className="sticky top-0 h-screen overflow-hidden flex items-center">
        <div className="max-w-5xl mx-auto w-full px-6 lg:px-8 pt-14">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <div className="editorial-label text-persimmon">▸ HOW IT WORKS — ONE CONTINUOUS SHOT</div>
            <span ref={moveNo} className="pl-mono text-[11px] tracking-wider text-ink/40">
              MOVE 01 / 03
            </span>
          </div>
          <h2 className="pl-serif font-bold text-[28px] lg:text-[40px] leading-tight tracking-tight mb-8">
            Three moves. <em className="italic text-ochre">A small ritual.</em>
          </h2>

          {/* The route: phone → Paystack gate → printer tray */}
          <div className="relative h-48 mb-6">
            <div className="absolute left-[8%] right-[8%] top-[108px] h-[2px] bg-ink/15" />

            {/* Phone */}
            <div className="absolute -translate-x-1/2" style={{ left: `${STATION_X[0]}%`, top: 36 }}>
              <div className="w-12 h-[76px] border-2 border-ink rounded-lg bg-paper-light flex items-start justify-center pt-2">
                <div className="w-5 h-1 bg-ink/30 rounded-full" />
              </div>
            </div>
            {/* Paystack gate */}
            <div className="absolute -translate-x-1/2" style={{ left: `${STATION_X[1]}%`, top: 36 }}>
              <div className="w-16 h-[76px] border-2 border-ink bg-paper-light flex flex-col items-center justify-center gap-1.5">
                <span className="pl-serif font-extrabold text-2xl leading-none">₦</span>
                <div className="w-8 h-1 bg-ink/30" />
              </div>
            </div>
            {/* Printer + tray slot */}
            <div className="absolute -translate-x-1/2" style={{ left: `${STATION_X[2]}%`, top: 60 }}>
              <div className="w-24 h-[52px] border-2 border-ink bg-paper-light relative">
                <div className="absolute left-2 right-2 bottom-2 h-1.5 bg-ink" />
                <div className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full bg-persimmon animate-blink" />
              </div>
            </div>

            {/* The travelling document */}
            <div
              ref={paper}
              className="absolute top-[64px] w-12 h-16 bg-paper-light border-2 border-ink rounded-sm shadow-[4px_4px_0_#1A1410] z-10 p-1.5"
              style={{ left: `${STATION_X[0]}%`, transform: "translateX(-50%) rotate(-6deg)" }}
            >
              <div className="w-full h-1 bg-ink/20 mb-1" />
              <div className="w-3/4 h-1 bg-ink/20 mb-1" />
              <div className="w-full h-1 bg-ink/20" />
              <div
                ref={chip}
                className="absolute -right-4 -top-3 pl-mono text-[10px] font-bold bg-ink text-paper px-1.5 py-0.5 transition-all duration-300"
                style={{ opacity: 0, transform: "rotate(-6deg) scale(1.5)" }}
              >
                K7DQ2A
              </div>
            </div>

            {/* Collection moment */}
            <div
              ref={ready}
              className="absolute transition-all duration-300"
              style={{ left: `${STATION_X[2]}%`, top: 134, opacity: 0, transform: "translateX(-50%) translateY(8px)" }}
            >
              <span className="pl-pill pl-pill-ready whitespace-nowrap">READY · K7DQ2A</span>
            </div>
          </div>

          {/* Step copy — active stage lifts, others dim */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            {STEPS.map((step, i) => (
              <div
                key={step.n}
                ref={(el) => {
                  texts.current[i] = el;
                }}
                className="transition-all duration-300"
                style={{ opacity: i === 0 ? 1 : 0.35 }}
              >
                <div className="editorial-folio not-italic mb-2">
                  <span className="italic text-xl">{step.n}</span>
                </div>
                <h3 className="pl-serif font-bold text-lg lg:text-xl leading-tight tracking-tight mb-1.5">
                  {step.t}
                </h3>
                <p className="pl-serif italic text-ink/70 text-sm leading-snug mb-2">{step.b}</p>
                <div className="pl-mono text-[10px] tracking-wider text-ink/40">{step.foot}</div>
              </div>
            ))}
          </div>

          {/* Scene progress rail */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-[3px] bg-paper-deep relative overflow-hidden">
              <div
                ref={fill}
                className="absolute inset-0 bg-persimmon origin-left"
                style={{ transform: "scaleX(0)" }}
              />
            </div>
            {STEPS.map((step, i) => (
              <div
                key={step.n}
                ref={(el) => {
                  dots.current[i] = el;
                }}
                className="w-2.5 h-2.5 rounded-full border-2 border-ink transition-colors duration-300"
                style={{ background: i === 0 ? "#D14B2C" : "#EEE7D9" }}
              />
            ))}
          </div>
        </div>

        <div
          ref={hint}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 editorial-label text-ink/50 transition-opacity duration-500"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-persimmon animate-blink" />
          KEEP SCROLLING — THE SCENE PLAYS ITSELF
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    t: "Upload from your phone",
    b: "PDFs, Word docs, images. Up to 50MB. We handle the rest.",
    foot: "PDF · DOCX · PPTX · JPG",
  },
  {
    n: "02",
    t: "Pay online, get your code",
    b: "Paystack. ₦5/page for B&W. ₦25/page for colour. Honest pricing.",
    foot: "PAYSTACK SECURED · CARD / TRANSFER / USSD",
  },
  {
    n: "03",
    t: "Walk in, type, collect",
    b: "Six characters at any PrintLoop tablet. Your prints are out by the time you're done.",
    foot: "AVG WAIT — 00:00:41",
  },
];

const STATS: { to: number; prefix?: string; suffix?: string; label: string }[] = [
  { to: 12, label: "STATIONS LIVE ACROSS LAGOS" },
  { to: 47, label: "PRINTS IN THE LAST HOUR" },
  { to: 5, prefix: "₦", label: "PER B&W PAGE — HONEST" },
  { to: 6, label: "CHARACTERS TO COLLECT" },
];

// Internal dividers for the boxed stats strip: 2×2 on mobile, 1×4 on md+.
const STAT_BORDERS = [
  "border-r-2 border-b-2 md:border-b-0",
  "border-b-2 md:border-b-0 md:border-r-2",
  "border-r-2",
  "",
];

export default function LandingPage() {
  const driftSlow = useParallax(-0.06);
  const driftFast = useParallax(0.09);
  const ghostDrift = useParallax(0.12);
  const heroType = useInView({ threshold: 0.2 });
  // Reduced-motion visitors get the static card spread at every width
  // instead of the pinned scene (a 260vh track with no animation would
  // just be dead scroll for them).
  const reduced = usePrefersReducedMotion();

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <Marquee
        reactive
        items={[
          { text: "● 12 STATIONS LIVE", accent: true },
          { text: "★ NOW SERVING UNILAG · YABA · LASU · OAU · COVENANT" },
          { text: "FREE TOP-UP ON FIRST PRINT" },
          { text: "● 47 PRINTS THIS HOUR", accent: true },
          { text: "VOL. I · ISSUE 09 · LAGOS" },
        ]}
      />

      {/* ── Masthead — sticky, with reading progress ───────────────── */}
      <div className="sticky top-0 z-40">
        <div className="bg-paper border-b-2 border-ink px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="font-serif font-extrabold text-[22px] sm:text-[26px] lg:text-[28px] tracking-tight">
            PrintLoop<span className="text-persimmon">.</span>
          </div>
          <nav className="order-3 sm:order-none w-full sm:w-auto flex items-center gap-1 overflow-x-auto">
            {[
              ["Features", "/features"],
              ["Pricing", "/pricing"],
              ["About", "/about"],
              ["Blog", "/blog"],
              ["Contact", "/contact"],
            ].map(([label, to]) => (
              <Link
                key={to}
                to={to}
                className="text-[11px] sm:text-xs font-bold tracking-editorial uppercase px-2.5 py-1.5 whitespace-nowrap border-2 border-transparent text-ink/70 hover:text-ink hover:border-persimmon transition-all"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex gap-2">
            <Link to={ROUTES.AUTH.LOGIN} className="pl-btn-ghost text-[11px] sm:text-xs px-3 sm:px-4 py-2">
              SIGN IN
            </Link>
            <Link to={ROUTES.AUTH.REGISTER} className="pl-btn-primary text-[11px] sm:text-xs px-3 sm:px-4 py-2">
              REGISTER <span className="hidden sm:inline">→</span>
            </Link>
          </div>
        </div>
        <ScrollProgress />
      </div>

      <main className="flex-1">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 relative overflow-hidden">
          <div
            ref={driftSlow}
            className="absolute -right-20 top-12 w-48 h-48 sm:w-72 sm:h-72 rounded-full bg-persimmon/8 pointer-events-none"
          />
          <div
            ref={driftFast}
            className="absolute -left-20 bottom-12 w-40 h-40 sm:w-60 sm:h-60 rounded-full bg-ochre/12 pointer-events-none"
          />
          <div
            ref={ghostDrift}
            aria-hidden="true"
            className="absolute -right-4 -bottom-12 pl-serif font-extrabold text-[140px] sm:text-[200px] leading-none text-transparent pointer-events-none select-none"
            style={{ WebkitTextStroke: "2px rgba(26, 20, 16, 0.09)" }}
          >
            Nº09
          </div>
          <LoopStamp />

          <div className="relative z-10">
            <Reveal variant="rise">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <div className="editorial-label text-persimmon">▸ THE PRINTLOOP DISPATCH</div>
                <div className="editorial-label text-ink/35 hidden sm:block">§ 01 · FRONT PAGE</div>
              </div>
            </Reveal>
            <h1
              ref={heroType.ref}
              data-shown={heroType.shown ? "" : undefined}
              className="pl-typeset pl-serif font-extrabold text-[40px] leading-[1.02] sm:text-[56px] sm:leading-[0.98] lg:text-[78px] lg:leading-[0.92] tracking-tight mb-4 sm:mb-5 max-w-4xl"
            >
              {HERO_WORDS.map((t, i) =>
                t.br ? (
                  <br key={i} />
                ) : (
                  <span key={i}>
                    <span
                      className={`pl-word ${t.cls ?? ""}`}
                      style={{ "--w": i } as React.CSSProperties}
                    >
                      {t.w}
                    </span>{" "}
                  </span>
                ),
              )}
            </h1>
            <Reveal variant="rise" delay={520}>
              <p className="pl-serif italic text-base sm:text-lg lg:text-xl text-ink/70 max-w-2xl mb-6 sm:mb-7 leading-snug">
                Upload from your phone. Pay online. Walk into any PrintLoop station and your prints
                are waiting. No queue. No haggling.
              </p>
            </Reveal>
            <Reveal variant="rise" delay={640}>
              <div className="flex flex-col sm:flex-row gap-3">
                <Magnetic>
                  <Link
                    to={ROUTES.AUTH.REGISTER}
                    className="pl-btn-primary w-full text-sm sm:text-base px-5 sm:px-7 py-3.5 sm:py-4 justify-center"
                  >
                    BEGIN YOUR ACCOUNT <span className="font-extrabold">→</span>
                  </Link>
                </Magnetic>
                <Magnetic>
                  <Link
                    to={ROUTES.AUTH.LOGIN}
                    className="pl-btn-ghost w-full text-sm sm:text-base px-5 sm:px-7 py-3.5 sm:py-4 justify-center"
                  >
                    SIGN IN
                  </Link>
                </Magnetic>
              </div>
            </Reveal>
            <Reveal variant="fade" delay={900}>
              <div className="mt-10 flex items-center gap-2 editorial-label text-ink/50">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-persimmon animate-blink" />
                SCROLL FOR THE FULL STORY ↓
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Stats strip — counts up as it enters ──────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 sm:pb-12">
          <div className="border-2 border-ink grid grid-cols-2 md:grid-cols-4 bg-paper-light">
            {STATS.map((s, i) => (
              <Reveal
                key={s.label}
                variant="rise"
                delay={i * 110}
                className={`p-5 sm:p-7 text-center border-ink ${STAT_BORDERS[i]}`}
              >
                <div className="pl-serif font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight mb-1">
                  <Counter to={s.to} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div className="editorial-label text-ink/50 text-[9px] sm:text-[10px]">{s.label}</div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── The proof — CSS-3D paper stack, scroll-driven ─────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 border-t-2 border-ink overflow-hidden">
          <Reveal variant="rise">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <div className="editorial-label text-persimmon">▸ THE PROOF</div>
              <div className="editorial-label text-ink/35 hidden sm:block">§ 1B · IN 3D</div>
            </div>
          </Reveal>
          <Reveal variant="wipe" delay={100}>
            <h2 className="pl-serif font-bold text-[24px] sm:text-[32px] lg:text-[38px] leading-tight tracking-tight mb-2 max-w-2xl">
              A fresh proof, <em className="italic text-ochre">off the top.</em>
            </h2>
          </Reveal>
          <Reveal variant="fade" delay={220}>
            <p className="pl-serif italic text-ink/60 text-sm sm:text-base mb-2 max-w-xl">
              Scroll to lift the top sheet — and drag your cursor to turn the stack.
            </p>
          </Reveal>
          <Paper3D />
        </section>

        {/* ── How it works ───────────────────────────────────────────
            Desktop: the pinned one-continuous-shot scene. Mobile and
            reduced-motion: the static three-card spread (with the
            scrubbed connector, which renders fully drawn under
            reduced motion). */}
        {!reduced && <PinnedMethod />}
        <div className={reduced ? "" : "md:hidden"}>
          <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 border-t-2 border-ink">
            <Reveal variant="rise">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div className="editorial-label text-persimmon">▸ HOW IT WORKS</div>
                <div className="editorial-label text-ink/35 hidden sm:block">§ 02 · THE METHOD</div>
              </div>
            </Reveal>
            <Reveal variant="wipe" delay={100}>
              <h2 className="pl-serif font-bold text-[28px] sm:text-[36px] lg:text-[42px] leading-tight tracking-tight mb-6 sm:mb-9">
                Three moves. <em className="italic text-ochre">A small ritual.</em>
              </h2>
            </Reveal>

            <StepConnector />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {STEPS.map((step, i) => (
                <Reveal key={step.n} variant="rise" delay={i * 140}>
                  <div className="border-2 border-ink p-5 sm:p-6 h-full bg-paper-light transition-all duration-150 ease-out hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[5px_5px_0_#1A1410]">
                    <div className="editorial-folio not-italic mb-3">
                      <span className="italic text-2xl">{step.n}</span>
                    </div>
                    <h3 className="pl-serif font-bold text-xl sm:text-2xl leading-tight tracking-tight mb-2">
                      {step.t}
                    </h3>
                    <p className="pl-serif italic text-ink/70 text-sm leading-snug mb-4">{step.b}</p>
                    <div className="pl-mono text-[10px] tracking-wider text-ink/40 border-t border-ink/15 pt-3">
                      {step.foot}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        </div>

        {/* ── Pull quote ─────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t-2 border-ink text-center relative overflow-hidden">
          <Reveal variant="fade">
            <div className="editorial-folio text-3xl mb-4">❦</div>
          </Reveal>
          <Reveal variant="wipe" delay={120}>
            <blockquote className="pl-serif italic font-semibold text-2xl sm:text-3xl lg:text-4xl leading-tight tracking-tight max-w-3xl mx-auto">
              “Uploaded from the back of a danfo at Ojuelegba. By the time I reached Yaba, my
              project was stapled and waiting.”
            </blockquote>
          </Reveal>
          <Reveal variant="rise" delay={300}>
            <div className="editorial-label text-ink/50 mt-5">
              — FINAL-YEAR STUDENT, UNILAG · § 03 · LETTERS
            </div>
          </Reveal>
        </section>

        {/* ── For print shops — the other side of the loop ──────────── */}
        <section className="bg-ink text-paper border-t-2 border-ink overflow-hidden">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 grid md:grid-cols-[1fr_auto] gap-8 items-center">
            <Reveal variant="left">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <div className="editorial-label text-ochre">▸ FOR PRINT SHOPS</div>
                <div className="editorial-label text-paper/30 hidden sm:block">§ 04 · TRADE PAGES</div>
              </div>
              <h2 className="pl-serif font-bold text-[28px] sm:text-[36px] lg:text-[42px] leading-tight tracking-tight mb-3">
                Own a printer? <em className="italic text-persimmon">Run the loop.</em>
              </h2>
              <p className="pl-serif italic text-base sm:text-lg opacity-80 max-w-xl mb-4 leading-snug">
                We bring the customers, the payments, and the queue — you press print. PrintLoop
                takes 10% only when you earn. Setup is a web wizard, not an IT project.
              </p>
              <div className="pl-mono text-[10px] tracking-wider opacity-50">
                PAYSTACK SPLIT · WEEKLY PAYOUTS · QR PAIRING
              </div>
            </Reveal>
            <Reveal variant="right" delay={150} className="flex flex-col gap-3 md:min-w-[230px]">
              <Magnetic>
                <Link
                  to="/saas/signup"
                  className="pl-btn-primary w-full text-sm px-6 py-3.5 justify-center"
                >
                  OPEN YOUR SHOP →
                </Link>
              </Magnetic>
              <Magnetic>
                <Link
                  to="/find"
                  className="pl-btn w-full bg-transparent text-paper border-paper text-sm px-6 py-3.5 justify-center hover:shadow-[5px_5px_0_#D14B2C]"
                >
                  FIND A STATION
                </Link>
              </Magnetic>
            </Reveal>
          </div>
        </section>

        {/* ── Footer CTA ─────────────────────────────────────────────── */}
        <section className="bg-ink text-paper py-10 sm:py-14 px-4 sm:px-6 lg:px-8 border-t border-paper/15">
          <div className="max-w-5xl mx-auto text-center">
            <Reveal variant="rise">
              <div className="editorial-label text-persimmon mb-3">▸ JOIN THE LOOP</div>
            </Reveal>
            <Reveal variant="stamp" delay={120}>
              <h2 className="pl-serif font-bold text-[30px] sm:text-[38px] lg:text-[44px] leading-tight tracking-tight mb-3">
                Stop queueing. Start printing.
              </h2>
            </Reveal>
            <Reveal variant="rise" delay={260}>
              <p className="pl-serif italic text-base sm:text-lg opacity-80 mb-6 sm:mb-7 max-w-xl mx-auto">
                Twelve stations across Lagos. More opening monthly.
              </p>
            </Reveal>
            <Reveal variant="rise" delay={380}>
              <Magnetic className="inline-block">
                <Link
                  to={ROUTES.AUTH.REGISTER}
                  className="pl-btn-primary text-sm sm:text-base px-6 sm:px-7 py-3.5 sm:py-4 inline-block"
                >
                  CREATE YOUR ACCOUNT →
                </Link>
              </Magnetic>
            </Reveal>
          </div>
        </section>
      </main>

      <EditorialFooter inverse />
    </div>
  );
}
