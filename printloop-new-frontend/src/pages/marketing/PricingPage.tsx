import { Link } from "react-router-dom";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { EditorialFooter } from "@/components/layout/EditorialFooter";
import { Reveal } from "@/components/ui/scrollFx";

/**
 * Marketing Pricing page (V2-54). Example matrix only — every
 * PrintLoop shop sets its own public pricing; the real numbers live
 * on each shop's page (/find/:slug) and in the checkout.
 */

const TIERS = [
  {
    name: "Students & everyone",
    tag: "per-page matrix",
    price: "₦5",
    unit: "/ page, B&W",
    note: "From — every shop publishes its own matrix.",
    items: [
      "B&W from ₦5/page (simplex, 300dpi)",
      "Colour from ₦25/page",
      "A4 · A3 · Letter",
      "100 / 300 / 600 dpi quality tiers",
      "Duplex pricing, clearly published",
      "Office + image files converted free",
    ],
    cta: "START PRINTING",
    to: "/find",
  },
  {
    name: "Course reps & clubs",
    tag: "recommended",
    price: "₦0",
    unit: "to create a group",
    note: "Group printing costs nothing extra — everyone pays for their own pages.",
    items: [
      "Group sessions with deadlines",
      "One shareable link for the whole class",
      "Per-member documents + settings",
      "One release code for the batch",
      "Batch jobs: up to 40 files, per-file config",
      "Collated, upload-order output",
    ],
    cta: "TRY GROUP PRINTING",
    to: "/groups",
  },
  {
    name: "Print shops",
    tag: "saas",
    price: "10%",
    unit: "platform commission",
    note: "Handled by Paystack split at the moment of charge — nothing to invoice.",
    items: [
      "Public shop page + pricing matrix",
      "Customer orders + kiosk app",
      "Driverless printer support (CUPS/IPP)",
      "Multi-tenant dashboard + analytics",
      "Scheduled payouts to your bank",
      "White-label branding & custom domain",
    ],
    cta: "START A SHOP",
    to: "/saas/signup",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <PublicHeader />
      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <Reveal variant="rise">
            <div className="editorial-label text-persimmon mb-3">▸ PRICING</div>
            <h1 className="pl-serif font-extrabold text-[38px] leading-[1.02] sm:text-[54px] sm:leading-[0.98] tracking-tight mb-5 max-w-3xl">
              Honest per-page prices,{" "}
              <em className="italic text-persimmon font-semibold">published before you pay.</em>
            </h1>
            <p className="pl-serif italic text-ink/60 text-sm sm:text-base max-w-2xl">
              No hidden markups. The shop's matrix is public, the checkout shows the exact
              number, and the final page count is reconciled to your saved card.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
            {TIERS.map((t, i) => (
              <Reveal key={t.name} variant="rise">
                <div
                  className={`border-4 border-ink p-6 flex flex-col h-full ${
                    i === 1 ? "bg-ink text-paper" : "bg-paper-light"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="editorial-label text-persimmon">{t.tag}</span>
                    <span className={`pl-mono text-[10px] ${i === 1 ? "text-paper/50" : "text-ink/40"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h2 className="pl-serif text-xl font-bold mb-1">{t.name}</h2>
                  <div className="mb-1">
                    <span className="pl-mono text-4xl font-bold">{t.price}</span>
                    <span className={`text-xs ml-1 ${i === 1 ? "text-paper/60" : "text-ink/55"}`}>
                      {t.unit}
                    </span>
                  </div>
                  <p className={`pl-serif italic text-xs mb-4 ${i === 1 ? "text-paper/60" : "text-ink/55"}`}>
                    {t.note}
                  </p>
                  <ul className="space-y-2 text-sm flex-1 mb-6">
                    {t.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="text-persimmon font-bold mt-px">▸</span>
                        <span className={i === 1 ? "text-paper/85" : ""}>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={t.to}
                    className={`text-center font-bold text-xs tracking-editorial py-3 border-2 ${
                      i === 1
                        ? "bg-persimmon text-paper border-persimmon hover:bg-paper hover:text-ink hover:border-paper"
                        : "bg-ink text-paper border-ink hover:bg-persimmon hover:border-persimmon"
                    }`}
                  >
                    {t.cta} →
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="border-2 border-ochre/60 bg-ochre/10 p-5 mt-8 text-sm pl-serif">
            <span className="font-bold">Fine print:</span> gateway processing fees (Paystack)
            apply on top of the per-page price. Office documents are priced on the
            <span className="font-bold"> confirmed</span> converted page count — differences
            are settled against your saved card, and overpayments are written off in your
            favour. Shops set their own matrix; the numbers above are the platform defaults.
          </div>
        </section>
      </main>
      <EditorialFooter />
    </div>
  );
}
