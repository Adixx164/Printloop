/**
 * In-app "How PrintLoop works" visual documentation (V2-37).
 *
 * Renders the marketplace flow diagrams from HOW-PRINTLOOP-WORKS.md as
 * native React/CSS — no mermaid dependency, no runtime diagram parsing.
 * Mounted as a tab inside the platform console (SUPER_ADMIN only) so
 * operators and investors have the operating model one click away.
 *
 * Pure presentational — no props, no data fetching.
 */

const INK = "#1A1410";
const PAPER = "#F8F4ED";
const PERSIMMON = "#D14B2C";
const OCHRE = "#C7944A";
const SAGE = "#6B7A5C";
const FOG = "#888888";

export default function HowPrintLoopWorks() {
  return (
    <div className="space-y-10 pb-12">
      <header>
        <div
          className="text-[11px] font-extrabold tracking-[0.08em] mb-1"
          style={{ color: PERSIMMON }}
        >
          ▸ OPERATING MODEL
        </div>
        <h1
          className="text-3xl font-extrabold"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          How PrintLoop works
        </h1>
        <p className="text-sm mt-2 max-w-2xl" style={{ color: FOG }}>
          A two-sided marketplace — the Uber model for printing. PrintLoop
          owns no printers; it's the platform that matches users to
          printshops in real time, authenticates the handoff with a code,
          and takes a commission per transaction.
        </p>
      </header>

      <Pillars />
      <Marketplace />
      <UserJourney />
      <Lifecycle />
      <MoneyFlow />
      <TrustLoop />
      <OneLine />
    </div>
  );
}

/* ── Shared primitives ────────────────────────────────────────────── */

function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-bold mb-4">
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: INK }}
      >
        {n}
      </span>
      {children}
    </h2>
  );
}

function Box({
  label,
  sub,
  color = INK,
  filled = false,
}: {
  label: string;
  sub?: string;
  color?: string;
  filled?: boolean;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-center border-2"
      style={{
        borderColor: color,
        backgroundColor: filled ? color : "#fff",
        color: filled ? "#fff" : INK,
        minWidth: 120,
      }}
    >
      <div className="font-bold text-sm leading-tight">{label}</div>
      {sub && (
        <div
          className="text-[11px] mt-0.5 leading-tight"
          style={{ color: filled ? "rgba(255,255,255,0.85)" : FOG }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function Arrow({ label, vertical = false }: { label?: string; vertical?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center ${vertical ? "flex-col py-1" : "px-1"}`}
      style={{ color: FOG }}
    >
      {label && (
        <span className="text-[10px] font-semibold whitespace-nowrap">{label}</span>
      )}
      <span className="text-lg leading-none">{vertical ? "↓" : "→"}</span>
    </div>
  );
}

/* ── 1. Three pillars ─────────────────────────────────────────────── */

function Pillars() {
  const pillars = [
    {
      t: "Marketplace connectivity",
      d: "Map discovery + real-time matching of users to nearby shops.",
      c: PERSIMMON,
    },
    {
      t: "Commission revenue",
      d: "10–15% of every print, taken via Paystack split before payout.",
      c: OCHRE,
    },
    {
      t: "Data-driven optimization",
      d: "Ranking, pricing & fraud signals from every transaction.",
      c: SAGE,
    },
  ];
  return (
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {pillars.map((p) => (
        <div
          key={p.t}
          className="rounded-lg border-2 p-4"
          style={{ borderColor: p.c, backgroundColor: "#fff" }}
        >
          <div
            className="w-8 h-1.5 rounded mb-3"
            style={{ backgroundColor: p.c }}
          />
          <div className="font-bold text-sm">{p.t}</div>
          <div className="text-xs mt-1" style={{ color: FOG }}>
            {p.d}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ── 2. Two-sided marketplace swimlanes ───────────────────────────── */

function Marketplace() {
  return (
    <section>
      <SectionTitle n="1">The two-sided marketplace</SectionTitle>
      <div className="rounded-lg border-2 p-4" style={{ borderColor: INK, backgroundColor: PAPER }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          {/* Demand */}
          <Lane title="DEMAND" color={PERSIMMON}>
            <Box label="User" sub="student · lecturer · business" color={PERSIMMON} filled />
          </Lane>

          {/* Platform */}
          <Lane title="PRINTLOOP PLATFORM" color={INK}>
            <div className="grid grid-cols-2 gap-2 w-full">
              <Box label="Discovery" sub="map · match" color={INK} />
              <Box label="Payments" sub="escrow" color={INK} />
              <Box label="Code auth" sub="6-char" color={INK} />
              <Box label="Ratings" sub="1–5★" color={INK} />
              <Box label="Commission" sub="10–15%" color={INK} />
              <Box label="Data/ML" sub="optimize" color={INK} />
            </div>
          </Lane>

          {/* Supply */}
          <Lane title="SUPPLY" color={SAGE}>
            <Box label="Printshop" sub="owns printer + kiosk PC" color={SAGE} filled />
          </Lane>
        </div>
        <p className="text-[11px] mt-3 text-center" style={{ color: FOG }}>
          PrintLoop sits in the middle: it never touches a printer — it matches,
          authenticates, settles, and rates.
        </p>
      </div>
    </section>
  );
}

function Lane({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="text-[10px] font-extrabold tracking-[0.08em]"
        style={{ color }}
      >
        {title}
      </div>
      <div className="w-full flex justify-center">{children}</div>
    </div>
  );
}

/* ── 3. User journey (numbered steps) ─────────────────────────────── */

function UserJourney() {
  const steps = [
    "Open app, share location",
    "See nearby shops on a map",
    "Pick a shop (price · rating · online)",
    "Upload document(s)",
    "Configure: copies, colour, size, sides",
    "Review live total + pay in-app",
    "Get 6-char code (app + SMS + email)",
    "App shows ETA to walk to the shop",
    "Shop is notified you're arriving",
    "Show code → shop verifies → prints",
    "Rate the shop 1–5★",
    "Money released to shop minus commission",
  ];
  return (
    <section>
      <SectionTitle n="2">The user journey</SectionTitle>
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {steps.map((s, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-lg border p-2.5 bg-white"
            style={{ borderColor: "#e5e0d6" }}
          >
            <span
              className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: i >= 9 ? SAGE : PERSIMMON }}
            >
              {i + 1}
            </span>
            <span className="text-sm leading-tight pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] mt-2" style={{ color: FOG }}>
        Steps 7–9 are the Uber-style live handoff: code issued, walk-time ETA,
        shop pinged on approach. The user walks to the shop (no courier in the
        current model).
      </p>
    </section>
  );
}

/* ── 4. Job lifecycle state machine ───────────────────────────────── */

function Lifecycle() {
  const happy = [
    { s: "PENDING", d: "created, awaiting pay" },
    { s: "RENDERING", d: "paid, normalising file" },
    { s: "READY", d: "print-ready, awaiting pickup" },
    { s: "RELEASING", d: "code entered at shop" },
    { s: "PRINTING", d: "agent dispatched it" },
    { s: "DONE", d: "printed ✓" },
  ];
  return (
    <section>
      <SectionTitle n="3">Job lifecycle</SectionTitle>
      <div className="rounded-lg border-2 p-4 overflow-x-auto" style={{ borderColor: INK, backgroundColor: "#fff" }}>
        <div className="flex items-center gap-1 min-w-max">
          {happy.map((st, i) => (
            <div key={st.s} className="flex items-center gap-1">
              <Box label={st.s} sub={st.d} color={st.s === "DONE" ? SAGE : INK} filled={st.s === "DONE"} />
              {i < happy.length - 1 && <Arrow />}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-4 text-xs" style={{ color: FOG }}>
          <span className="flex items-center gap-1">
            <Dot c={PERSIMMON} /> FAILED / EXPIRED → auto-refund to wallet
          </span>
          <span className="flex items-center gap-1">
            <Dot c={OCHRE} /> Escrow: money releases to shop only at DONE
          </span>
        </div>
      </div>
    </section>
  );
}

function Dot({ c }: { c: string }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full"
      style={{ backgroundColor: c }}
    />
  );
}

/* ── 5. Money flow ────────────────────────────────────────────────── */

function MoneyFlow() {
  return (
    <section>
      <SectionTitle n="4">The money flow</SectionTitle>
      <div className="rounded-lg border-2 p-4" style={{ borderColor: INK, backgroundColor: PAPER }}>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Box label="User pays ₦1,000" color={INK} filled />
          <Arrow label="Paystack split" />
          <div className="flex flex-col gap-2">
            <Box label="₦900 → Printshop" sub="90% — subaccount" color={SAGE} />
            <Box label="₦100 → PrintLoop" sub="10% commission" color={PERSIMMON} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
          <RevCard t="Commission" d="10–15% per print, taken before payout" c={PERSIMMON} />
          <RevCard t="Wallet float" d="interest on prepaid balances" c={OCHRE} />
          <RevCard t="Premium placement" d="shops pay to rank higher on the map" c={SAGE} />
        </div>
      </div>
    </section>
  );
}

function RevCard({ t, d, c }: { t: string; d: string; c: string }) {
  return (
    <div className="rounded border p-2.5 bg-white" style={{ borderColor: "#e5e0d6" }}>
      <div className="flex items-center gap-1.5">
        <Dot c={c} />
        <span className="font-bold text-sm">{t}</span>
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: FOG }}>
        {d}
      </div>
    </div>
  );
}

/* ── 6. Trust loop ────────────────────────────────────────────────── */

function TrustLoop() {
  return (
    <section>
      <SectionTitle n="5">Trust &amp; accountability</SectionTitle>
      <div className="rounded-lg border-2 p-4" style={{ borderColor: INK, backgroundColor: "#fff" }}>
        <div className="flex flex-wrap items-center gap-1">
          <Box label="Print done" color={SAGE} filled />
          <Arrow />
          <Box label="Rate 1–5★" color={INK} />
          <Arrow />
          <Box label="Avg rating" sub="recomputed" color={INK} />
          <Arrow />
          <Box label="Map ranking" sub="best shops surface" color={INK} />
        </div>
        <div className="flex flex-wrap items-center gap-1 mt-3">
          <Box label="Low rating / failures" color={PERSIMMON} />
          <Arrow label="flag" />
          <Box label="Admin review" sub="/platform disputes" color={PERSIMMON} />
          <Arrow label="resolve" />
          <Box label="Coach · suspend · refund" color={INK} />
        </div>
        <p className="text-[11px] mt-3" style={{ color: FOG }}>
          Every print ends with a rating. Ratings drive ranking; poor shops get
          flagged for coaching or suspension. Disputes resolve case-by-case
          (refund user / pay shop / split).
        </p>
      </div>
    </section>
  );
}

/* ── 7. One-liner ─────────────────────────────────────────────────── */

function OneLine() {
  return (
    <section>
      <div
        className="rounded-lg p-4 text-center text-sm"
        style={{ backgroundColor: INK, color: PAPER }}
      >
        <strong>In one line:</strong> user finds a nearby shop on a map → uploads
        + pays in-app → gets a code → walks over → shows the code → shop prints
        it → user rates the shop → PrintLoop keeps a commission and pays the shop
        the rest.
      </div>
      <p className="text-[11px] mt-2 text-center" style={{ color: FOG }}>
        Full reference: <code>HOW-PRINTLOOP-WORKS.md</code> in the repo (Mermaid
        source diagrams).
      </p>
    </section>
  );
}
