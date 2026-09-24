import { Link } from "react-router-dom";

/**
 * `/privacy` — PrintLoop Privacy Policy (public).
 * Covers: data controller, lawful bases, categories, retention,
 * international transfers, data subject rights (GDPR/NDPR), DPO contact.
 */
export default function PrivacyPage() {
  const lastUpdated = "2026-08-30";

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20 space-y-10">
      <header>
        <Link to="/" className="font-serif font-extrabold text-[22px] tracking-tight mb-8 inline-block">
          PrintLoop<span className="text-persimmon">.</span>
        </Link>
        <div className="editorial-label text-persimmon mb-2">▸ LEGAL</div>
        <h1 className="pl-serif font-extrabold text-4xl sm:text-5xl tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-sm text-ink/60 mt-2">Last updated: {lastUpdated}</p>
      </header>

      <section className="prose prose-ink max-w-none space-y-6">
        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">1. Who we are</h2>
        <p>
          PrintLoop ("we", "us", "our") is the data controller for personal
          data processed through our self-service printing platform.
          Registered address: PrintLoop, Lagos, Nigeria. Contact:
          <a href="mailto:privacy@printloop.ng" className="text-persimmon underline hover:text-persimmon/80">
            privacy@printloop.ng
          </a>.
        </p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">2. Information we collect</h2>
        <h3 className="font-bold text-lg">2.1 Data you give us</h3>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Account data:</strong> name, email, phone, password hash (bcrypt).</li>
          <li><strong>Print jobs:</strong> uploaded documents, page counts, print settings, timestamps.</li>
          <li><strong>Payments:</strong> Paystack transaction refs, amounts, authorization codes (saved card).</li>
          <li><strong>Kiosk operators:</strong> business name, address, bank details, tax ID (via Paystack subaccount).</li>
        </ul>
        <h3 className="font-bold text-lg">2.2 Data we generate</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>Print codes, job statuses, page counts from render worker.</li>
          <li>Transaction ledger (gross, commission, net).</li>
          <li>Kiosk heartbeats, printer capabilities.</li>
          <li>Audit logs of administrative actions.</li>
        </ul>
        <h3 className="font-bold text-lg">2.3 Data from third parties</h3>
        <ul className="list-disc list-inside space-y-2">
          <li>Paystack: payment confirmation, customer email/phone, authorization codes.</li>
          <li>Termii: SMS delivery receipts.</li>
          <li>Geocoder (OpenStreetMap/Nominatim): shop coordinates from address.</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">3. Lawful bases (GDPR Art. 6 / NDPR Sec. 2.2)</h2>
        <table className="w-full text-sm border-collapse border-2 border-ink">
          <thead>
            <tr className="border-b-2 border-ink text-left editorial-label text-persimmon">
              <th className="py-2 px-3">Purpose</th>
              <th className="py-2 px-3">Lawful basis</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-paper-deep">
              <td className="py-2 px-3">Provide printing service (upload → pay → collect)</td>
              <td className="py-2 px-3">Contract (Art. 6(1)(b))</td>
            </tr>
            <tr className="border-b border-paper-deep">
              <td className="py-2 px-3">Process payments, issue receipts</td>
              <td className="py-2 px-3">Contract + Legal obligation (Art. 6(1)(b), (c))</td>
            </tr>
            <tr className="border-b border-paper-deep">
              <td className="py-2 px-3">Send job-ready codes via SMS/email</td>
              <td className="py-2 px-3">Legitimate interest (Art. 6(1)(f))</td>
            </tr>
            <tr className="border-b border-paper-deep">
              <td className="py-2 px-3">Fraud prevention, rate limiting</td>
              <td className="py-2 px-3">Legitimate interest (Art. 6(1)(f))</td>
            </tr>
            <tr className="border-b border-paper-deep">
              <td className="py-2 px-3">Comply with tax, anti-money-laundering laws</td>
              <td className="py-2 px-3">Legal obligation (Art. 6(1)(c))</td>
            </tr>
            <tr className="border-b border-paper-deep">
              <td className="py-2 px-3">Improve service, analytics</td>
              <td className="py-2 px-3">Consent (Art. 6(1)(a)) where required</td>
            </tr>
          </tbody>
        </table>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">4. Data sharing</h2>
        <p>We do <strong>not</strong> sell personal data. We share only with:</p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Paystack:</strong> to process payments, split commissions, route payouts.</li>
          <li><strong>Termii:</strong> to send SMS codes (Nigeria only).</li>
          <li><strong>Sub-processors (AWS/Cloudflare/Railway):</strong> hosting, S3 storage, CDN, email (Resend), error tracking (Sentry). All under DPA.</li>
          <li><strong>Tenant operators:</strong> customer name, job code, page count — only what they need to release the print.</li>
          <li><strong>Law enforcement:</strong> only when legally compelled.</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">5. International transfers</h2>
        <p>
          Our core infrastructure (API, database, render worker) runs in the EU
          (Frankfurt) and US (Virginia). Paystack data stays in Nigeria.
          Transfers rely on Standard Contractual Clauses (SCCs) or adequacy
          decisions. You can request a copy of the SCCs at privacy@printloop.ng.
        </p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">6. Retention</h2>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Account data:</strong> retained while account is active + 30 days after closure (cooling-off).</li>
          <li><strong>Print jobs + documents:</strong> deleted 24h after job completes or expires.</li>
          <li><strong>Transactions + audit logs:</strong> 7 years (tax / AML compliance).</li>
          <li><strong>Kiosk heartbeats:</strong> 30 days.</li>
          <li><strong>Backups:</strong> 14 daily snapshots (SQLite) / PITR (Postgres).</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">7. Your rights (GDPR Art. 15–22 / NDPR Sec. 3.1)</h2>
        <p>You can exercise these rights at any time by emailing
          <a href="mailto:privacy@printloop.ng" className="text-persimmon underline">privacy@printloop.ng</a>:</p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Access:</strong> receive a copy of your data (JSON export via /api/saas/me/export or /api/customer/export).</li>
          <li><strong>Rectification:</strong> correct inaccurate data.</li>
          <li><strong>Erasure:</strong> "right to be forgotten" — close account (30-day cooling-off then hard-delete).</li>
          <li><strong>Restriction:</strong> limit processing while a dispute is resolved.</li>
          <li><strong>Portability:</strong> receive your data in a machine-readable format (JSON).</li>
          <li><strong>Object:</strong> object to processing based on legitimate interest (e.g. analytics).</li>
          <li><strong>Withdraw consent:</strong> where we rely on consent (marketing emails).</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">8. Cookies & similar tech</h2>
        <p>We use only strictly necessary cookies:</p>
        <ul className="list-disc list-inside space-y-2">
          <li><code>accessToken</code> / <code>refreshToken</code> (HttpOnly, Secure, SameSite=Lax) — authentication.</li>
          <li><code>activeTenantSlug</code> (sessionStorage) — tenant context for the customer app.</li>
          <li>No analytics, advertising, or third-party tracking cookies.</li>
        </ul>
        <p>A cookie banner appears on first visit. You can reject non-essential cookies (currently none).</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">9. Security</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>Passwords: bcrypt (cost 12).</li>
          <li>JWT: RS256 (access 15m, refresh 7d, rotation + reuse detection).</li>
          <li>TLS 1.2+ everywhere; HSTS, CSP, CSRF protection.</li>
          <li>Database encryption at rest (managed Postgres); S3 SSE-S3 for artifacts.</li>
          <li>Rate limits per tenant/IP; brute-force protection on codes.</li>
          <li>Sentry error tracking (no PII in events).</li>
        </ul>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">10. Children</h2>
        <p>PrintLoop is not directed at children under 16. We do not knowingly
          collect data from minors. If you believe we have, contact us and we
          will delete it.</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">11. Changes to this policy</h2>
        <p>We will post updates here and bump the "Last updated" date. Material
          changes are emailed to active users 30 days in advance.</p>

        <h2 className="pl-serif font-extrabold text-2xl tracking-tight">12. Contact & DPO</h2>
        <p>
          Data Protection Officer: <strong>Abdurrahman Bello</strong><br />
          Email: <a href="mailto:privacy@printloop.ng" className="text-persimmon underline">privacy@printloop.ng</a><br />
          Postal: PrintLoop, Lagos, Nigeria
        </p>
      </section>

      <footer className="border-t-2 border-ink pt-8 text-center text-sm text-ink/60">
        <Link to="/terms" className="text-persimmon underline hover:text-persimmon/80 mr-4">
          Terms of Service
        </Link>
        <Link to="/contact" className="text-persimmon underline hover:text-persimmon/80">
          Contact us
        </Link>
      </footer>
    </div>
  );
}