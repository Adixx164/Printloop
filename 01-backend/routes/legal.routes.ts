import { Router, type Request, type Response } from 'express';

const router = Router();

/**
 * GET /api/legal/dpa
 *
 * Data Processing Agreement (DPA) — public read.
 * Returns the DPA as plain text (Markdown) for display or PDF generation.
 * Standard DPA covering GDPR Art. 28 + NDPR requirements.
 */
router.get('/dpa', async (req: Request, res: Response) => {
  const dpa = `# PrintLoop Data Processing Agreement

**Version:** 1.0 | **Effective:** 2026-08-30

---

## 1. Parties

**Controller:** The Tenant (the printing business using PrintLoop), referred to as the "Controller".

**Processor:** PrintLoop (the SaaS platform operator), referred to as the "Processor".

**Contact:** PrintLoop, Lagos, Nigeria | privacy@printloop.ng

---

## 2. Scope and Duration

This Agreement applies to all personal data processed by the Processor on behalf of the Controller through the PrintLoop platform (API, customer app, tenant admin, kiosk app, render worker). It remains in force for the duration of the SaaS subscription and for 30 days after termination (cooling-off period for data export/deletion).

---

## 3. Categories of Data Subjects

- **Customers:** end-users who upload documents, pay, and collect prints.
- **Tenant staff:** admins, operators who manage the tenant account.
- **Tenant owners:** the natural persons who signed up the tenant.

---

## 4. Categories of Personal Data

| Category | Examples |
|----------|----------|
| Identity | Name, email, phone number |
| Account | Hashed password, TOTP secret, verification tokens |
| Print jobs | Uploaded documents, page counts, settings, timestamps |
| Payments | Paystack refs, amounts, authorization codes (saved card) |
| Location | Shop address, geocoded coordinates |
| Audit | Administrative actions, login/logout, IP addresses |

---

## 5. Purposes of Processing

The Processor processes personal data only for:

1. **Service delivery:** Upload → pay → print workflow.
2. **Payments:** Paystack Split (commission + tenant share).
3. **Communications:** Job-ready codes (SMS/email), receipts, password reset.
4. **Security:** Rate limiting, fraud detection, audit logging.
5. **Legal compliance:** Tax records (7 years), AML, consumer protection.
6. **Analytics:** Aggregated, pseudonymous usage metrics (opt-in).

---

## 6. Processor Obligations (GDPR Art. 28 / NDPR Sec. 2.3)

The Processor shall:

1. Process only on documented instructions from the Controller.
2. Ensure all personnel are under confidentiality obligations.
3. Implement appropriate technical and organizational measures:
   - bcrypt (cost 12) for passwords
   - RS256 JWT (15m access, 7d refresh, rotation)
   - TLS 1.2+ everywhere; HSTS, CSP, CSRF
   - Encryption at rest (managed Postgres, S3 SSE-S3)
   - Rate limits per tenant/IP; brute-force protection
4. Not engage sub-processors without prior written consent. Current approved sub-processors:
   - **Paystack** (payments, splits, payouts)
   - **Termii** (SMS delivery — Nigeria only)
   - **AWS/Cloudflare/Railway** (hosting, S3, CDN, email via Resend, error tracking via Sentry)
   - **OpenStreetMap/Nominatim** (geocoding)
5. Assist the Controller with data subject rights requests (export, deletion, rectification) within 30 days.
6. Notify the Controller of any personal data breach within 24 hours of discovery.
7. On termination: return or delete all personal data within 30 days (cooling-off).

---

## 7. International Transfers

- Core infrastructure (API, DB, render worker): EU (Frankfurt) and US (Virginia).
- Paystack data: Nigeria.
- Sub-processors rely on SCCs (Standard Contractual Clauses) or adequacy decisions.
- Controller may request copies of SCCs at privacy@printloop.ng.

---

## 8. Data Retention

| Data | Retention |
|------|-----------|
| Account data | Active + 30 days post-closure |
| Print jobs + documents | 24h after completion/expiry |
| Transactions + audit logs | 7 years (tax/AML) |
| Kiosk heartbeats | 30 days |
| Backups | 14 daily (SQLite) / PITR (Postgres) |

---

## 9. Data Subject Rights Support

The Processor provides APIs for the Controller to fulfill:
- **Access/Export:** \`POST /api/saas/me/export\` (tenant), \`POST /api/customer/auth/export\` (customer)
- **Deletion:** \`DELETE /api/saas/me\` (tenant), \`DELETE /api/customer/auth/me\` (customer) — 30-day cooling-off
- **Rectification:** \`PUT /api/customer/auth/me\`, \`PUT /api/saas/me/branding\`
- **Restriction/Objection:** Account closure + cooling-off

---

## 10. Security Measures

- Passwords: bcrypt cost 12
- JWT: RS256, 15m access / 7d refresh, rotation + reuse detection
- TLS 1.2+; HSTS, CSP, CSRF protection
- Database encryption at rest (managed Postgres); S3 SSE-S3 for artifacts
- Rate limits per tenant/IP; brute-force protection on pickup codes
- Sentry error tracking (no PII in events)
- Penetration testing: annually

---

## 11. Audit & Compliance

- All administrative actions audit-logged (who, what, when, tenant).
- Platform admin console provides fleet-wide reliability metrics.
- Processor maintains records of processing activities (ROPA).
- Controller may audit Processor with 30 days' notice.

---

## 12. Liability & Indemnification

- Each party's aggregate liability capped at the total commission paid in the 12 months preceding the claim.
- Processor indemnifies Controller for sub-processor breaches.
- Controller indemnifies Processor for customer-uploaded content disputes.

---

## 13. Governing Law & Disputes

Governing law: Federal Republic of Nigeria.
Disputes: Binding arbitration in Lagos (LCA Rules).
Either party may seek injunctive relief in any competent court.

---

## 14. Termination

Either party may terminate with 30 days' written notice.
On termination: Processor stops processing, returns/deletes data per Section 6(7).

---

## 15. General

- Entire agreement between parties regarding data processing.
- Amendments only in writing signed by both parties.
- If any provision is unenforceable, the remainder stands.

---

**Signed on behalf of PrintLoop (Processor):**

Abdurrahman Bello, Data Protection Officer
privacy@printloop.ng

**Signed on behalf of the Controller (Tenant):**

[To be accepted by tenant admin at onboarding]`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'inline; filename="printloop-dpa-v1.0.md"',
  );
  res.send(dpa);
});

/**
 * GET /api/legal/terms
 * GET /api/legal/privacy
 *
 * Serve the same content as the public /terms and /privacy pages
 * for API consumers / PDF generation.
 */
router.get('/terms', async (req: Request, res: Response) => {
  const terms = `# PrintLoop Terms of Service

**Version:** 1.0 | **Effective:** 2026-08-30

---

## 1. Agreement to terms
By accessing or using PrintLoop, you agree to be bound by these Terms and our Privacy Policy.

## 2. Definitions
- **Platform:** PrintLoop SaaS (API, customer app, tenant admin, kiosk app, render worker)
- **Tenant:** A printing business that subscribes and operates kiosks
- **Customer:** End-user who uploads, pays, collects prints
- **Kiosk:** Physical self-service terminal
- **Commission:** % of each customer payment retained by PrintLoop (default 10%)
- **Payout:** Transfer of tenant's net earnings via Paystack

## 3. Tenant obligations
Provide accurate info, configure Paystack subaccount + bank account, set fair pricing, maintain kiosks, comply with Nigerian law.

## 4. Customer terms
Upload own documents, final page count determines cost, 6-char code = proof of payment, collect within 24h, no illegal content.

## 5. Payments & commission
Paystack Split: 90% → tenant subaccount, 10% → PrintLoop. No monthly fees. Refunds = full amount, commission reversed.

## 6. Payouts
Weekly (Friday), min ₦5,000. Instant = ₦100 fee. Tenant must have verified Transfer Recipient.

## 7. White-label branding
Tenants customize wordmark, logo, colors, emails. PrintLoop branding never shown to tenant's customers.

## 8. Custom domains
CNAME to domains.printloop.app + TXT verification. TLS via Cloudflare for SaaS.

## 9. Intellectual property
PrintLoop owns Platform. Tenants own their content. Customers own their documents.

## 10. Suspension & termination
PrintLoop may suspend for non-payment, breach, legal order, inactivity. Tenant may close → 30-day cooling-off → hard delete.

## 11. Disclaimer
Platform "as is". Print quality depends on tenant's printer hardware/supplies.

## 12. Limitation of liability
Aggregate liability ≤ total commission paid in prior 12 months. No indirect/consequential damages.

## 13. Indemnification
Tenants indemnify PrintLoop for their use. Customers indemnify tenants for illegal uploads.

## 14. Governing law
Federal Republic of Nigeria. Arbitration in Lagos (LCA Rules).

## 15. Changes
30-day advance notice for material changes.

## 16. Contact
legal@printloop.ng`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="printloop-terms-v1.0.md"');
  res.send(terms);
});

router.get('/privacy', async (req: Request, res: Response) => {
  const privacy = `# PrintLoop Privacy Policy

**Version:** 1.0 | **Effective:** 2026-08-30

---

## 1. Who we are
PrintLoop, Lagos, Nigeria. DPO: Abdurrahman Bello | privacy@printloop.ng

## 2. Information we collect
- Account: name, email, phone, password hash
- Print jobs: documents, page counts, settings, timestamps
- Payments: Paystack refs, amounts, saved-card auth codes
- Tenant staff: business name, address, bank details, tax ID
- Generated: print codes, job statuses, audit logs
- Third parties: Paystack, Termii, geocoder

## 3. Lawful bases (GDPR Art. 6 / NDPR)
| Purpose | Basis |
|---------|-------|
| Service delivery | Contract (Art. 6(1)(b)) |
| Payments | Contract + Legal obligation |
| SMS/email codes | Legitimate interest |
| Fraud prevention | Legitimate interest |
| Legal compliance | Legal obligation |
| Analytics | Consent |

## 4. Data sharing
Paystack, Termii, sub-processors (AWS/Cloudflare/Railway), tenant operators (minimal), law enforcement.

## 5. International transfers
EU/US infrastructure; Paystack in Nigeria. SCCs or adequacy.

## 6. Retention
Account: active + 30 days. Print jobs: 24h. Transactions: 7 years. Heartbeats: 30 days. Backups: 14 days / PITR.

## 7. Your rights (GDPR 15–22 / NDPR 3.1)
Access, rectification, erasure, restriction, portability, object, withdraw consent. Email privacy@printloop.ng.

## 8. Cookies
Only strictly necessary: accessToken/refreshToken (HttpOnly, Secure), activeTenantSlug (sessionStorage). No analytics/tracking cookies.

## 9. Security
bcrypt 12, RS256 JWT, TLS 1.2+, encryption at rest, rate limits, Sentry (no PII).

## 10. Children
Not directed at under 16.

## 11. Changes
Posted here with updated date. Material changes emailed 30 days prior.

## 12. Contact & DPO
Abdurrahman Bello | privacy@printloop.ng | PrintLoop, Lagos, Nigeria`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="printloop-privacy-v1.0.md"');
  res.send(privacy);
});

export default router;