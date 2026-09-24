import { Link } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { EditorialFooter } from "@/components/layout/EditorialFooter";
import { Counter, Reveal } from "@/components/ui/scrollFx";

/**
 * Marketing Features page (V2-54), modelled on the smartedu.ng
 * feature-section rhythm: hero → alternating feature blocks with a
 * stats/visual column → closing CTA. All editorial-brutalist.
 */

const FEATURES: {
  n: string;
  label: string;
  title: string;
  copy: string;
  bullets: string[];
  stat: { value: number; suffix: string; label: string };
}[] = [
  {
    n: "01",
    label: "UPLOAD FROM ANYWHERE",
    title: "Your phone is the print queue.",
    copy: "PDF, Word, PowerPoint, Excel or image — upload from your phone in the app or a browser tab. No app install, no USB stick, no lab computer.",
    bullets: ["PDF, DOCX, PPTX, XLSX, JPG, PNG", "Server-side conversion + page count", "50 MB files, 300+ page documents"],
    stat: { value: 50, suffix: "MB", label: "max file size" },
  },
  {
    n: "02",
    label: "HONEST, PUBLIC PRICING",
    title: "The price is on the wall before you pay.",
    copy: "Every PrintLoop shop publishes its pricing matrix — per page, per copy, per colour. What you see at checkout is exactly what the machine charges.",
    bullets: ["24-cell matrix: paper × colour × quality × sides", "Estimates for Office files, confirmed after conversion", "Final cost reconciled to your saved card"],
    stat: { value: 5, suffix: "₦/pp", label: "from B&W A4 simplex" },
  },
  {
    n: "03",
    label: "ONE CODE, INSTANT COLLECT",
    title: "A six-digit key to your prints.",
    copy: "Pay once, get your release code by SMS and email. Walk into any PrintLoop station, type the code, and your prints are already spooling.",
    bullets: ["6-digit code + QR on your receipt", "24-hour validity", "Files stay private until YOU release them"],
    stat: { value: 6, suffix: "digits", label: "your print token" },
  },
  {
    n: "04",
    label: "GROUP & BATCH PRINTING",
    title: "One link, one code, every classmate.",
    copy: "Course reps collect an entire class's submissions through one shareable link. Everyone configures and pays for their own pages; you collect with a single code.",
    bullets: ["Group sessions with deadlines", "Per-file settings in one batch job", "Collated output, upload order"],
    stat: { value: 40, suffix: "files", label: "per batch job" },
  },
  {
    n: "05",
    label: "PAYSTACK PAYMENTS",
    title: "Pay the way that works for you.",
    copy: "Secure checkout via Paystack — card, transfer or USSD. If the final page count costs more than the estimate, the difference is charged to your saved card at the kiosk. No cash, no credit.",
    bullets: ["Card · transfer · USSD · bank", "Saved-card reconciliation on the delta", "Receipts and codes by SMS + email"],
    stat: { value: 0, suffix: "cash", label: "handled at the counter" },
  },
  {
    n: "06",
    label: "FOR PRINT SHOPS",
    title: "A marketplace, a dashboard, a payout.",
    copy: "PrintLoop is a SaaS platform for print businesses: list your shop, take customer orders online, run kiosks, and get paid out with commission handled by Paystack split.",
    bullets: ["Shop page + public pricing matrix", "Kiosk app with driverless printer support", "Dashboard, analytics and scheduled payouts"],
    stat: { value: 10, suffix: "%", label: "platform commission" },
  },
];

function FeatureBlock({ f, flip }: { f: (typeof FEATURES)[number]; flip: boolean }) {
  return (
    <section className={`grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center py-10 lg:py-14`}>
      <div className={flip ? "lg:order-2" : ""}>
        <Reveal variant="rise">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <div className="editorial-label text-persimmon">§ {f.n} · {f.label}</div>
          </div>
          <h2 className="pl-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">
            {f.title}
          </h2>
          <p className="pl-serif italic text-ink/65 text-sm sm:text-base leading-relaxed mb-5">
            {f.copy}
          </p>
          <ul className="space-y-2 mb-6">
            {f.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm">
                <span className="text-persimmon font-bold mt-px">▸</span>
                <span className="font-medium">{b}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      {/* Visual column — a stamped "paper card" so the page needs no images. */}
      <div className={flip ? "lg:order-1" : ""}>
        <Reveal variant="rise">
          <div className="border-4 border-ink bg-paper-light p-6 sm:p-8 shadow-[6px_6px_0_#1A1410] relative">
            <div className="absolute -top-3 right-4 bg-persimmon text-paper text-[10px] font-bold tracking-editorial px-2.5 py-1">
              PRINTLOOP · {f.label}
            </div>
            <div className="pl-mono text-6xl sm:text-7xl font-bold leading-none mb-4">
              <Counter to={f.stat.value} />
              <span className="text-persimmon">{f.stat.suffix}</span>
            </div>
            <div className="editorial-label text-ink/55">{f.stat.label}</div>
            <div className="mt-6 pt-4 border-t-2 border-ink/15 flex items-center gap-2 text-[10px] pl-mono text-ink/50">
              <span className="w-1.5 h-1.5 rounded-full bg-persimmon animate-blink" />
              READY AT EVERY STATION
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <PublicHeader />
      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute -right-6 -top-6 pl-serif font-extrabold text-[160px] leading-none text-transparent pointer-events-none select-none"
            style={{ WebkitTextStroke: "2px rgba(26, 20, 16, 0.09)" }}
          >
            §01
          </div>
          <Reveal variant="rise">
            <div className="editorial-label text-persimmon mb-3">▸ THE PRINTLOOP PLATFORM</div>
            <h1 className="pl-serif font-extrabold text-[38px] leading-[1.02] sm:text-[54px] sm:leading-[0.98] tracking-tight mb-5 max-w-3xl">
              Everything between{" "}
              <em className="italic text-persimmon font-semibold">upload</em> and{" "}
              <em className="italic text-persimmon font-semibold">paper</em>.
            </h1>
            <p className="pl-serif italic text-ink/60 text-sm sm:text-base max-w-2xl">
              One platform for students, course reps and print shops. From phone upload to the
              printer tray — priced honestly, paid securely, released by code.
            </p>
          </Reveal>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          {FEATURES.map((f, i) => (
            <div key={f.n} className="border-t-2 border-ink">
              <FeatureBlock f={f} flip={i % 2 === 1} />
            </div>
          ))}
          <div className="border-t-2 border-ink" />
        </section>

        <section className="bg-ink text-paper">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
            <Reveal variant="rise">
              <h2 className="pl-serif text-2xl sm:text-4xl font-bold tracking-tight mb-3">
                Your next print is <em className="italic text-persimmon">one upload away.</em>
              </h2>
              <p className="pl-serif italic text-paper/60 text-sm sm:text-base mb-6">
                Register free. Find a station near you. Print from your phone.
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Link to={ROUTES.AUTH.REGISTER} className="pl-btn-primary px-6 py-3 text-sm">
                  REGISTER FREE →
                </Link>
                <Link to="/find" className="pl-btn-light px-6 py-3 text-sm">
                  FIND A STATION
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <EditorialFooter />
    </div>
  );
}
