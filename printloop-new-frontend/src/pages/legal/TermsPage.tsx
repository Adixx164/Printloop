import { Link } from "react-router-dom";

/**
 * `/terms` — PrintLoop Terms of Service (public).
 * Covers: platform rules, tenant obligations, customer terms,
 * payments, refunds, liability, termination, governing law.
 */
export default function TermsPage() {
  const lastUpdated = "2026-08-30";

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20 space-y-10">
      <header>
        <Link to="/" className="font-serif font-extrabold text-[22px] tracking-tight mb-8 inline-block">
          PrintLoop<span className="text-persimmon">.</span>
        </Link>
        <div className="editorial-label text-persimmon mb-2">▸ LEGAL</div>
        <h1 className="pl-serif font-extrabold text-4xl sm:text-5xl tracking-tight">
          Terms of Service
        </h1>
        <p className="text-sm text-ink/60 mt-2">Last updated: {lastUpdated}</p>
      </header>

      <section className="prose prose-ink max-w-none space-y-8">
        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">1. Agreement to terms</h2>
        <p>
          By accessing or using PrintLoop ("the Platform", "we", "us", "our"),
          you agree to be bound by these Terms of Service ("Terms") and our
          <Link to="/privacy" className="text-persimmon underline">Privacy Policy</Link>.
          If you do not agree, do not use the Platform.
        </p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">2. Definitions</h2>
        <dl className="space-y-3 text-sm">
          <dt className="font-bold"><strong>"Platform"</strong></dt>
          <dd>The PrintLoop SaaS (API, customer app, tenant admin, kiosk app, render worker).</dd>
          <dt className="font-bold"><strong>"Tenant"</strong></dt>
          <dd>A printing business that subscribes to the Platform and operates kiosks.</dd>
          <dt className="font-bold"><strong>"Customer"</strong></dt>
          <dd>An end-user who uploads documents, pays, and collects prints at a kiosk.</dd>
          <dt className="font-bold"><strong>"Kiosk"</strong></dt>
          <dd>The physical self-service terminal (PrintLoop Kiosk App + printer).</dd>
          <dt className="font-bold"><strong>"Commission"</strong></dt>
          <dd>The percentage of each customer payment retained by PrintLoop (default 10%).</dd>
          <dt className="font-bold"><strong>"Payout"</strong></dt>
          <dd>Transfer of the tenant's net earnings to their bank account via Paystack.</dd>
        </dl>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">3. Tenant obligations</h2>
        <p>By registering as a Tenant, you agree to:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>Provide accurate business information and keep it updated.</li>
          <li>Configure a Paystack subaccount and a valid Nigerian bank account for payouts.</li>
          <li>Set fair, transparent pricing (the 24-cell matrix is yours to edit).</li>
          <li>Maintain kiosks in working order; run a test print before going live.</li>
          <li>Comply with Nigerian law (tax, consumer protection, data protection).</li>
          <li>Not resell or sub-license the Platform; not reverse-engineer the kiosk app.</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">4. Customer terms</h2>
        <p>By uploading a document and paying, the Customer agrees:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>The document is their own work or they have the right to print it.</li>
          <li>The final page count (from the render worker) determines the final cost; overpayments are not refunded, underpayments are collected at the kiosk via saved card.</li>
          <li>The 6-character code is the sole proof of payment — treat it like cash.</li>
          <li>Prints must be collected within 24 hours; expired jobs are auto-deleted.</li>
          <li>No illegal, obscene, or copyrighted-without-permission content.</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">5. Payments & commission</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>All customer payments are processed via <strong>Paystack</strong>.</li>
          <li>At the moment of charge, Paystack Split routes:
            <ul className="list-disc list-inside ml-6 mt-1">
              <li><strong>{100 - 10}%</strong> (net of commission) → Tenant's Paystack subaccount.</li>
              <li><strong>10%</strong> (default) → PrintLoop main account.</li>
            </ul>
          </li>
          <li>Commission rate is per-tenant (default 10%, range 7–15%).</li>
          <li>No monthly fees, no per-kiosk fees, no subscription.</li>
          <li>Refunds: if a print fails, the full amount is refunded to the customer; PrintLoop's commission is reversed automatically.</li>
          <li>Chargebacks: Paystack reverses both halves; we maintain a ~1% reserve.</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">6. Payouts to tenants</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>Scheduled weekly (Friday), minimum ₦5,000. Instant payout available for ₦100 fee.</li>
          <li>Tenant must have a verified Paystack Transfer Recipient (bank account).</li>
          <li>Payouts are initiated by PrintLoop; status tracked in the tenant dashboard.</li>
          <li>Failed transfers are retried; funds remain in the tenant's Paystack subaccount.</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">7. White-label branding</h2>
        <p>Tenants may customize wordmark, logo, colours, email templates, support
          contact. Branding applies to the customer app, receipts, emails.
          PrintLoop branding is never shown to the tenant's customers.</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">8. Custom domains</h2>
        <p>Tenants may add a custom domain (e.g. <code>print.university.edu.ng</code>).
          They must publish a TXT record for ownership proof and a CNAME pointing
          to <code>domains.printloop.app</code>. TLS is provisioned automatically
          via Cloudflare for SaaS.</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">9. Intellectual property</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>PrintLoop owns all rights to the Platform, API, kiosk app, render worker, design system.</li>
          <li>Tenants retain ownership of their uploaded documents, logos, branding assets.</li>
          <li>Customers retain ownership of their documents. PrintLoop claims no rights.</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">10. Suspension & termination</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>PrintLoop may suspend a tenant for: non-payment of commission reserve, material breach, legal order, or prolonged inactivity (30 days no payouts).</li>
          <li>Tenant may close their account anytime → 30-day cooling-off → hard delete.</li>
          <li>On termination: kiosks stop accepting jobs; outstanding payouts are processed; data deleted after 30 days.</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">11. Disclaimer of warranties</h2>
        <p>The Platform is provided "as is" and "as available". We do not warrant
          uninterrupted, error-free, or secure operation. Print quality depends
          on the tenant's printer hardware and supplies — PrintLoop is not liable
          for toner, paper, or mechanical failures.</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">12. Limitation of liability</h2>
        <p>To the maximum extent permitted by law, PrintLoop's aggregate liability
          for any claim arising from these Terms shall not exceed the total
          commission paid by the tenant in the 12 months preceding the claim.
          In no event shall we be liable for indirect, incidental, or consequential
          damages (lost profits, data loss, business interruption).</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">13. Indemnification</h2>
        <p>Tenants indemnify PrintLoop against claims arising from their use of
          the Platform (customer disputes, copyright infringement, regulatory
          violations). Customers indemnify tenants for illegal content they upload.</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">14. Governing law & disputes</h2>
        <p>These Terms are governed by the laws of the Federal Republic of Nigeria.
          Disputes are resolved by binding arbitration in Lagos (LCA Rules).
          Either party may seek injunctive relief in any competent court.</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">15. Changes</h2>
        <p>We may update these Terms. Material changes are emailed 30 days in
          advance and posted here with a new "Last updated" date. Continued use
          after the effective date constitutes acceptance.</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">16. Contact</h2>
        <p>
          Questions about these Terms? Email
          <a href="mailto:legal@printloop.ng" className="text-persimmon underline">legal@printloop.ng</a>
          or write to PrintLoop, Lagos, Nigeria.
        </p>
      </section>

      <footer className="border-t-2 border-ink pt-8 text-center text-sm text-ink/60">
        <Link to="/privacy" className="text-persimmon underline hover:text-persimmon/80 mr-4">
          Privacy Policy
        </Link>
        <Link to="/contact" className="text-persimmon underline hover:text-persimmon/80">
          Contact us
        </Link>
      </footer>
    </div>
  );
}