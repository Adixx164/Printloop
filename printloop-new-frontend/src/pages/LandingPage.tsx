import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { Marquee } from "@/components/layout/Marquee";
import { EditorialFooter } from "@/components/layout/EditorialFooter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      <Marquee
        items={[
          { text: "● 12 STATIONS LIVE", accent: true },
          { text: "★ NOW SERVING UNILAG · YABA · LASU · OAU · COVENANT" },
          { text: "FREE TOP-UP ON FIRST PRINT" },
          { text: "● 47 PRINTS THIS HOUR", accent: true },
          { text: "VOL. I · ISSUE 09 · LAGOS" },
        ]}
      />

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="bg-paper border-b-2 border-ink px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex justify-between items-center gap-3">
        <div className="font-serif font-extrabold text-[22px] sm:text-[26px] lg:text-[28px] tracking-tight">
          PrintLoop<span className="text-persimmon">.</span>
        </div>
        <div className="flex gap-2">
          <Link to={ROUTES.AUTH.LOGIN} className="pl-btn-ghost text-[11px] sm:text-xs px-3 sm:px-4 py-2">
            SIGN IN
          </Link>
          <Link to={ROUTES.AUTH.REGISTER} className="pl-btn-primary text-[11px] sm:text-xs px-3 sm:px-4 py-2">
            REGISTER <span className="hidden sm:inline">→</span>
          </Link>
        </div>
      </div>

      <main className="flex-1">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 relative overflow-hidden">
          <div className="absolute -right-20 top-12 w-48 h-48 sm:w-72 sm:h-72 rounded-full bg-persimmon/8 pointer-events-none" />
          <div className="absolute -left-20 bottom-12 w-40 h-40 sm:w-60 sm:h-60 rounded-full bg-ochre/12 pointer-events-none" />

          <div className="relative z-10">
            <div className="editorial-label text-persimmon mb-3">▸ THE PRINTLOOP DISPATCH</div>
            <h1 className="pl-serif font-extrabold text-[40px] leading-[1.02] sm:text-[56px] sm:leading-[0.98] lg:text-[78px] lg:leading-[0.92] tracking-tight mb-4 sm:mb-5 max-w-4xl">
              Your campus printing,
              <br />
              <em className="italic text-persimmon font-semibold">finally</em> done right.
            </h1>
            <p className="pl-serif italic text-base sm:text-lg lg:text-xl text-ink/70 max-w-2xl mb-6 sm:mb-7 leading-snug">
              Upload from your phone. Pay online. Walk into any PrintLoop station and your prints
              are waiting. No queue. No haggling.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={ROUTES.AUTH.REGISTER}
                className="pl-btn-primary text-sm sm:text-base px-5 sm:px-7 py-3.5 sm:py-4 justify-center"
              >
                BEGIN YOUR ACCOUNT <span className="font-extrabold">→</span>
              </Link>
              <Link
                to={ROUTES.AUTH.LOGIN}
                className="pl-btn-ghost text-sm sm:text-base px-5 sm:px-7 py-3.5 sm:py-4 justify-center"
              >
                SIGN IN
              </Link>
            </div>
          </div>
        </section>

        {/* ── How it works ───────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 border-t-2 border-ink">
          <div className="editorial-label text-persimmon mb-2">▸ HOW IT WORKS</div>
          <h2 className="pl-serif font-bold text-[28px] sm:text-[36px] lg:text-[42px] leading-tight tracking-tight mb-6 sm:mb-9">
            Three moves. <em className="italic text-ochre">A small ritual.</em>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { n: "01", t: "Upload from your phone", b: "PDFs, Word docs, images. Up to 50MB. We handle the rest." },
              { n: "02", t: "Pay online, get your code", b: "Paystack. ₦5/page for B&W. ₦25/page for colour. Honest pricing." },
              { n: "03", t: "Walk in, type, collect", b: "Six characters at any PrintLoop tablet. Your prints are out by the time you're done." },
            ].map((step) => (
              <div key={step.n} className="border-2 border-ink p-5 sm:p-6">
                <div className="editorial-folio not-italic mb-3">
                  <span className="italic text-2xl">{step.n}</span>
                </div>
                <h3 className="pl-serif font-bold text-xl sm:text-2xl leading-tight tracking-tight mb-2">
                  {step.t}
                </h3>
                <p className="pl-serif italic text-ink/70 text-sm leading-snug">{step.b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer CTA ─────────────────────────────────────────────── */}
        <section className="bg-ink text-paper py-10 sm:py-14 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <div className="editorial-label text-persimmon mb-3">▸ JOIN THE LOOP</div>
            <h2 className="pl-serif font-bold text-[30px] sm:text-[38px] lg:text-[44px] leading-tight tracking-tight mb-3">
              Stop queueing. Start printing.
            </h2>
            <p className="pl-serif italic text-base sm:text-lg opacity-80 mb-6 sm:mb-7 max-w-xl mx-auto">
              Twelve stations across Lagos. More opening monthly.
            </p>
            <Link
              to={ROUTES.AUTH.REGISTER}
              className="pl-btn-primary text-sm sm:text-base px-6 sm:px-7 py-3.5 sm:py-4 inline-block"
            >
              CREATE YOUR ACCOUNT →
            </Link>
          </div>
        </section>
      </main>

      <EditorialFooter inverse />
    </div>
  );
}
