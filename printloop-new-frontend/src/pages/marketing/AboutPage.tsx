import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { EditorialFooter } from "@/components/layout/EditorialFooter";
import { Counter, Reveal } from "@/components/ui/scrollFx";

/**
 * Marketing About page (V2-54): the story, the loop, and stats —
 * smartedu.ng-style "one platform, four perspectives" rhythm.
 */

const PERSPECTIVES = [
  {
    n: "01",
    who: "FOR STUDENTS",
    title: "Print from class, collect when you're free.",
    copy: "Upload from your phone between lectures. Pay with your bank or card. Walk past the shop whenever it suits you and type in your code.",
    items: ["No queues at the lab", "Codes valid for 24 hours", "Private files — released only by you"],
  },
  {
    n: "02",
    who: "FOR COURSE REPS",
    title: "Collect the whole class with one link.",
    copy: "One group link, every submission, one release code at the kiosk. Deadlines, per-person settings and payments handled automatically.",
    items: ["Up to 40 files per batch", "Collated output in upload order", "Everyone pays their own pages"],
  },
  {
    n: "03",
    who: "FOR PRINT SHOPS",
    title: "Turn walk-ins into online orders.",
    copy: "List your shop, publish your pricing matrix, and take orders from customers who are already at your door — or ten kilometres away.",
    items: ["Marketplace discovery + map", "Kiosk app, driverless printer support", "Payouts with Paystack split commission"],
  },
  {
    n: "04",
    who: "FOR THE PLATFORM",
    title: "Every print, recorded. Every station, ready.",
    copy: "Multi-tenant SaaS from day one: white-label branding, custom domains, webhooks, analytics — built for print businesses in any country.",
    items: ["Tenant-scoped data model", "Cloud render → kiosk spool pipeline", "Observability + audit trail on every action"],
  },
];

const STATS = [
  { value: 5, suffix: "min", label: "phone to paper" },
  { value: 40, suffix: "files", label: "per batch job" },
  { value: 24, suffix: "hrs", label: "code validity" },
  { value: 0, suffix: "cash", label: "at the counter" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <PublicHeader />
      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <Reveal variant="rise">
            <div className="editorial-label text-indigo-600 mb-3">▸ ABOUT PRINTLOOP</div>
            <h1 className="pl-serif font-extrabold text-[38px] leading-[1.02] sm:text-[54px] sm:leading-[0.98] tracking-tight mb-5 max-w-3xl">
              Campus printing, rebuilt like a{" "}
              <em className="italic text-indigo-600 font-semibold">public service.</em>
            </h1>
            <p className="pl-serif italic text-gray-50/60 text-sm sm:text-base max-w-2xl">
              PrintLoop started with a simple observation: Nigerian students spend hours of
              their week queuing at print labs for a 10-minute job. The fix isn't a faster
              printer — it's a better loop. Upload anywhere. Pay once. Collect by code.
            </p>
          </Reveal>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
            {STATS.map((s) => (
              <Reveal key={s.label} variant="rise">
                <div className="border-4 border-gray-900 bg-gray-100 p-5 text-center">
                  <div className="pl-mono text-4xl sm:text-5xl font-bold leading-none mb-2">
                    <Counter to={s.value} />
                    <span className="text-indigo-600">{s.suffix}</span>
                  </div>
                  <div className="editorial-label text-gray-50/55">{s.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          {PERSPECTIVES.map((p) => (
            <Reveal key={p.n} variant="rise">
              <div className="border-t-2 border-gray-900 py-10 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
                <div>
                  <div className="pl-mono text-4xl font-bold text-gray-50/15">{p.n}</div>
                  <div className="editorial-label text-indigo-600 mt-2">{p.who}</div>
                </div>
                <div>
                  <h2 className="pl-serif text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                    {p.title}
                  </h2>
                  <p className="pl-serif italic text-gray-50/65 text-sm sm:text-base leading-relaxed mb-4">
                    {p.copy}
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {p.items.map((i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-indigo-600 font-bold mt-px">▸</span>
                        <span className="font-medium">{i}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
          <div className="border-t-2 border-ink" />
        </section>

        <section className="bg-gray-900 text-gray-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
            <Reveal variant="rise">
              <h2 className="pl-serif text-2xl sm:text-4xl font-bold tracking-tight mb-3">
                Read how it works, <em className="italic text-indigo-600">in full.</em>
              </h2>
              <p className="pl-serif italic text-gray-50/60 text-sm sm:text-base mb-6">
                Guides, updates and the occasional rant about lab printers.
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Link to="/blog" className="pl-btn-primary px-6 py-3 text-sm">
                  VISIT THE BLOG →
                </Link>
                <Link to="/contact" className="pl-btn-light px-6 py-3 text-sm">
                  CONTACT US
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
