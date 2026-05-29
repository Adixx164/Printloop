# PrintLoop → SaaS for Printing Businesses — Roadmap

A complete-detail plan for converting the current single-tenant
PrintLoop deployment into a multi-tenant SaaS that printing
businesses (campus print shops, copy centres, university libraries,
even small chains) can subscribe to and run their own self-service
printing network on top of.

This is a **strategic document** that overlays on the
implementation reality captured in `JOURNAL.md` (what we've built)
and `BACKEND-GUIDE.md` (how it's wired). Keep all three in sync:
when you ship a SaaS dimension, update the roadmap's status and
add a phase entry to the journal.

---

## Executive summary

**Current state:** PrintLoop is a single-tenant production
deployment serving one operator. One Railway backend, one Vercel
frontend, one SQLite database, one Paystack merchant account, one
business name baked into the UI and emails. Customers, kiosks,
printers, pricing, branding, and payments all belong to that one
operator.

**SaaS target state:** Any printing business can sign up, get a
provisioned tenant (`{theirname}.printloop.app` plus optional
custom domain), configure their pricing + branding + kiosks +
Paystack subaccount, hand `PrintLoop Kiosk Setup.exe` to their
staff, and start charging their own customers — while we (the SaaS
operator) charge them a subscription fee per kiosk + per print job.

**Effort estimate:** 5–8 months of focused work for a 2–3 engineer
team. The single biggest line item is adding `tenantId` to every
entity + query in the backend (4–6 weeks alone). After that the
work is mostly additive: onboarding, billing, branding, operations.

**Critical paths first:**
1. Multi-tenancy foundation (everything else assumes this).
2. Database move from SQLite to Postgres.
3. Self-serve sign-up + first-admin flow.
4. SaaS-side billing (Stripe Connect or a metered subscription).

Everything else (white-label branding, custom domains, advanced
operations tooling) is incremental polish on top.

---

## Table of contents

1. [Current state — single-tenant reality check](#1-current-state--single-tenant-reality-check)
2. [The 14 dimensions of the SaaS transformation](#2-the-14-dimensions-of-the-saas-transformation)
3. [Phased delivery plan](#3-phased-delivery-plan)
4. [Tech stack changes](#4-tech-stack-changes)
5. [Pricing & cost model](#5-pricing--cost-model)
6. [Risks, tradeoffs, and decisions to make first](#6-risks-tradeoffs-and-decisions-to-make-first)
7. [Open questions to answer before starting](#7-open-questions-to-answer-before-starting)
8. [Maintenance rule](#8-maintenance-rule)

---

## 1) Current state — single-tenant reality check

What "single-tenant" means in our codebase today, concretely:

**Database (SQLite, `01-backend/data/printloop.sqlite`):**
- One `users` table — everyone is a customer/admin of the same
  organization.
- One `kiosks` table — every kiosk belongs to the same operator.
- One `print_jobs` table, one `wallets` table, one `transactions`
  table — no concept of "this row belongs to Business A."
- One `pricing_configs` table — all 24 cells of the matrix apply
  to every customer.
- One `system_settings` table — `companyName`, `supportEmail`,
  `paystackEnabled`, IPP defaults, `printDispatchMode`, branding —
  all globally scoped.

**Backend (`01-backend/`):**
- `JWT_SECRET` is a single value for the entire deployment.
- `PAYSTACK_SECRET_KEY` is a single merchant.
- `app.ts`'s CORS is keyed off `ALLOWED_ORIGINS` — assumes one
  set of legitimate origins.
- Every entity in `entities/` is missing a `tenantId` column.
- Every TypeORM `findOne` / `find` query is "all rows of this
  type," not "all rows of this type for this tenant."
- The seed script (`config/seed.ts`) creates a hard-coded admin
  and demo kiosk row that wouldn't make sense in a multi-tenant
  world.

**Frontend (`printloop-new-frontend/`):**
- "PrintLoop" wordmark hard-coded in the header, footer, and
  email templates.
- The persimmon + ochre + sage palette is hard-coded in
  `tailwind.config.js` and `index.css`.
- The customer app and admin console are deployed at the same
  Vercel URL; no per-tenant routing.

**Kiosk app (`printloop-kiosk-app/`):**
- The Setup.exe is per-deployment — it points at one cloud URL
  and uses one kiosk API key. Distributing to multiple businesses
  means each business gets a setup wizard pointed at the same
  Railway URL, just with their own kiosk key. Fine for
  single-tenant; needs per-tenant URLs for SaaS.

**Operator concerns:**
- One Railway container running everything.
- One Vercel project for the frontend.
- One Paystack account collecting all revenue.
- No "Login as Business A's admin to debug" tooling.
- No way to suspend a tenant for non-payment.

This is a perfectly fine setup for ONE operator running ONE
printing business. It's the floor we're building up from.

---

## 2) The 14 dimensions of the SaaS transformation

Each dimension is a workstream — most have crisp scope and clear
file lists. Effort estimates assume 1 engineer working full-time
on that dimension; in practice many can be parallelized.

### Dimension 1 — Multi-tenancy in the data model

**The single biggest change.** Every business-owned row needs a
`tenantId`, every query needs a tenant filter, every index needs
`tenantId` as the leading column.

**Affected entities** (in `01-backend/entities/`):
- `user.entity.ts`, `wallet.entity.ts`, `transaction.entity.ts`,
  `payment.entity.ts` — customers belong to a tenant.
- `kiosk.entity.ts` — kiosks belong to a tenant.
- `printJob.entity.ts`, `printJobItem.entity.ts` — jobs belong
  to a tenant.
- `file.entity.ts` — uploaded documents belong to a tenant.
- `pricingConfig.entity.ts` — each tenant has their own 24-cell
  matrix.
- `promotion.entity.ts` — each tenant runs their own promo codes.
- `systemSetting.entity.ts` — most settings become per-tenant
  (`companyName`, `paystackEnabled`, `printDispatchMode`,
  `defaultPaperSize`, …). A small set stays global (e.g. the
  SaaS-platform-wide rate limits, feature flags).
- `auditLog.entity.ts` — events are tagged with the tenant they
  happened in, plus an optional "SaaS operator acting as" actor.
- `groupSession.entity.ts`, `groupParticipant.entity.ts` —
  belong to a tenant.

**New entities:**
- `tenant.entity.ts` — the root of the tenant tree. Columns:
  `name`, `slug` (URL-safe identifier — e.g. `kampala-prints`),
  `customDomain` (nullable), `subscriptionStatus`, `planId`,
  `createdAt`, `suspendedAt`, `suspendReason`.
- `tenantMember.entity.ts` — links a User to a Tenant with a
  role (`owner`, `admin`, `staff`). A SaaS-platform-level User
  can be a member of multiple tenants.

**Query layer changes:**
- A `withTenant(qb, tenantId)` helper that injects
  `WHERE entity.tenantId = :tid` into every query. Wrap every
  `Repository.find*` call.
- TypeORM has subscribers — we can use `BeforeInsert` to populate
  `tenantId` from a request-scoped async-context store.
- All cross-tenant queries (the SaaS operator's dashboard) go
  through a separate `platformDb` accessor that explicitly skips
  the filter.

**Migrations:**
- Add `tenantId UUID NOT NULL` to every affected table.
- Backfill: assign all existing rows to a default tenant
  (`legacy-tenant` or the original operator's tenant slug).
- Add compound indexes: every existing index gets `tenantId`
  prepended for query performance.

**Effort:** 4–6 weeks for an engineer who knows TypeORM.

### Dimension 2 — Tenant resolution per request

Every request needs to know which tenant it's serving.

**Resolution sources (in priority order):**
1. **JWT claim** — admin / customer tokens carry `tenantId`.
   Mandatory for authed routes.
2. **Subdomain** — `kampala-prints.printloop.app` resolves to
   the tenant with slug `kampala-prints`. Used for the customer-
   facing app + kiosk setup wizard.
3. **Custom domain** — `print.kampala-uni.ac.ug` maps to a tenant
   via a `customDomain` lookup table.
4. **`X-Tenant-Slug` header** — for API clients and the kiosk
   agent.

**Middleware** (new file `01-backend/middleware/tenant.middleware.ts`):
- Resolves the tenant exactly once per request and attaches it
  as `req.tenant` (typed).
- 404s if no tenant resolves (with a friendly "tenant not found"
  HTML for browser flows, JSON for API).
- Validates the tenant is not suspended.

**Frontend:**
- Sniff `window.location.hostname` to derive the tenant slug.
- Add a `<TenantContext>` provider that fetches `/api/tenant/me`
  on bootstrap and exposes branding + currency + flags.

**Effort:** 1 week.

### Dimension 3 — Database move from SQLite → Postgres

SQLite served us well in single-tenant. Multi-tenant SaaS needs:
- Concurrent writers (multiple Railway instances serving requests).
- Replication / backups (managed service does both).
- JSONB for `printConfiguration` etc. (richer querying than
  SQLite's `simple-json`).
- Row-level security as a defence-in-depth layer (Postgres can
  enforce `tenantId` matching at the engine — see optional
  Dimension 4 below).

**Migration:**
- Switch `01-backend/config/database.ts` from `sqlite` driver to
  `postgres`.
- Update `package.json`: replace `sqlite3` with `pg` + `@types/pg`.
- Stop running `synchronize:true` in production. Adopt
  `typeorm-extension`'s migration runner or stay with TypeORM's
  built-in `migration:run`.
- Write the first proper migration set: take the current schema
  + add `tenantId` everywhere.
- Provisioning: use Railway Postgres, Neon, Supabase, or AWS RDS.

**Effort:** 2 weeks (driver switch + migrations setup + one
production-data export/import cycle).

### Dimension 4 — Tenant isolation guarantees (defence in depth)

Even with `tenantId` on every query, a single missed filter could
leak data across tenants. Defence-in-depth options:

**Postgres Row-Level Security (RLS):**
- Each table has a policy: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`.
- The tenant middleware sets `SET LOCAL app.current_tenant_id = '...'` on every transaction.
- Even if a route forgets to filter, Postgres returns zero rows.

**Connection-per-tenant (heavier):**
- Each request gets a connection from a tenant-specific pool.
- Pre-set `search_path` to a tenant-specific schema.
- Strong isolation, but kills connection-pool efficiency at scale.

**Recommendation:** start with RLS on the high-risk tables
(`users`, `wallets`, `print_jobs`, `files`) and rely on the
query-layer filter elsewhere. Pure RLS is more work to debug
than to enforce, so don't blanket-enable it.

**Effort:** 1 week.

### Dimension 5 — Onboarding flow

The path from "I'm a print shop owner who heard about PrintLoop"
to "I've got a kiosk running."

**Marketing site** (separate, but linked):
- `printloop.app` — hero, pricing, demo, sign-up CTA.
- Doesn't need to live in this repo; can be a static Next.js
  on Vercel.

**Sign-up flow** (in the customer-frontend repo at
`printloop-new-frontend/`):
- `POST /api/saas/signup` — accepts business name + owner email
  + password + chosen slug. Validates slug uniqueness + format
  (lowercase a–z, digits, dashes, 3–30 chars).
- Sends email verification to the owner.
- On verification, provisions:
  - A new `tenants` row.
  - A new `users` row (the first owner).
  - A `tenant_members` row linking them as `owner`.
  - Seeds the tenant's `pricing_configs` with the default 24-cell
    matrix.
  - Creates 1 demo kiosk row so the dashboard isn't empty.
  - Creates the tenant's wallet ledger.
  - Lands them on the dashboard.

**Tenant setup wizard** (new page in the customer-frontend):
- Logo upload.
- Color theme picker (constrained to brand-safe palettes for v1).
- Business address + support email + support phone.
- Paystack public/secret key (or "Connect with Paystack" OAuth
  if we go that route — see Dimension 9).
- Currency selection.
- Default pricing (let them tweak the 24-cell matrix).
- Print policy defaults.
- First kiosk row (which prints the activation code for the
  Setup.exe wizard).

**Effort:** 4 weeks.

### Dimension 6 — Identity & access (tenant roles)

The current admin model (`UserRole.{customer | admin | super_admin}`
+ `adminPrivileges[]`) needs to be extended for tenants.

**New role model:**
- **Platform roles** (the SaaS operator):
  - `platform_admin` — full god mode, can impersonate any tenant.
  - `platform_support` — read-only access across tenants, can
    log audit actions but can't modify.
- **Tenant roles** (per-tenant via `tenant_members`):
  - `owner` — can manage billing, delete the tenant, add other
    owners.
  - `admin` — can manage kiosks, pricing, settings, customers.
  - `staff` — can view jobs and process refunds but not change
    billing / branding.
- **Customer role** — same as today, but scoped to one tenant.

**JWT shape:**
```json
{
  "userId": "uuid",
  "role": "platform_admin" | "customer" | null,
  "memberships": [
    { "tenantId": "uuid", "role": "owner" | "admin" | "staff" }
  ],
  "iat": 0,
  "exp": 0
}
```

**Refactor:**
- `middleware/rbac.middleware.ts` — `requirePermission(p)` checks
  the user's membership on the request's tenant.
- New `middleware/tenantMembership.middleware.ts` — 403s if the
  user has no membership on the resolved tenant.
- Customer accounts are per-tenant. The same email can have a
  customer account on Tenant A AND Tenant B with different
  wallets, different passwords, different histories.

**Effort:** 2 weeks.

### Dimension 7 — White-label branding

Each tenant's customer-facing UI should look like theirs, not ours.

**Brand surface to externalise** (move from hard-coded to
tenant-scoped):
- Wordmark (text or logo image).
- Primary, secondary, accent colors (3 color variables drive
  most of the UI via Tailwind).
- Favicon + theme-color meta.
- Email templates' `from` name, header logo, footer signature.
- Receipt PDF header.
- Default greeting in SMS / email.
- "About" / "Terms" / "Privacy" links.
- Support phone + email shown to customers.

**Implementation:**
- New `tenant_brandings.tenant_id` table with the above fields.
- API: `GET /api/tenant/me/branding` (anonymous-readable — public
  brand info on the landing page).
- Frontend: `<BrandProvider>` sets CSS variables on `:root` at
  mount; everything in `index.css` already uses CSS variables, so
  swapping is cheap.
- Email templates: switch from a hardcoded mustache template to
  a tenant-conditional one. Use Resend/Mailgun's per-domain
  template features OR keep templates in-repo and inject tenant
  fields.
- The kiosk touchscreen UI (`printloop-kiosk/index.html`) reads
  the tenant brand on first heartbeat and caches it in
  localStorage — already half there since we cache the cloud URL
  + kiosk key already.

**Effort:** 3 weeks.

### Dimension 8 — Custom domains

Tenants want `print.kampala-uni.ac.ug`, not `kampala-uni.printloop.app`.

**The TLS / DNS dance:**
- Tenant adds a CNAME record: `print.kampala-uni.ac.ug` →
  `domains.printloop.app`.
- Our edge (Caddy, Vercel, Cloudflare, Traefik — pick one)
  detects the host, looks up the tenant, fetches/renews a
  Let's Encrypt certificate on-demand.
- Tenant-resolution middleware uses the `Host` header.

**Easiest implementations (in order of cost vs flexibility):**
1. **Vercel custom domains** — supports per-tenant domains
   natively if the customer frontend is on Vercel. Each tenant
   adds their domain via the admin UI; we hit Vercel's API to
   register it. Limits: max ~50 domains on Pro plan, custom
   pricing above.
2. **Cloudflare for SaaS** — built for exactly this. CNAME
   flattening, custom hostname API, automatic TLS. Likely the
   cleanest answer at scale.
3. **Self-hosted Caddy** — runs on Railway, handles ACME
   automatically with the `on-demand-tls` directive. Free, more
   ops burden.
4. **Self-hosted Traefik** — same idea, slightly more complex
   config.

**Effort:** 2 weeks (Vercel/Cloudflare); 4 weeks (self-host
Caddy).

### Dimension 9 — Payments — three layers, not one

There are now THREE payment flows to think about:

**A. Customer pays tenant** (already exists).
- Currently the tenant's Paystack secret key is in the backend
  `.env`.
- SaaS: each tenant brings their own Paystack subaccount.
  - Option A.1: **Paystack Connect / Paystack Split** —
    payments go to the tenant's subaccount, we (the SaaS) take a
    platform fee. Paystack supports this natively.
  - Option A.2: each tenant configures their own Paystack secret
    key in the tenant settings, and customer payments flow
    directly to them. We never touch the money. Simpler for v1.
- Multi-currency: Paystack supports NGN, USD, GHS, ZAR, KES.
  The `currency` setting becomes per-tenant.

**B. SaaS bills the tenant** (new).
- Subscription plans: Starter (1 kiosk, 200 jobs/mo, $19/mo),
  Pro (5 kiosks, 2000 jobs/mo, $79/mo), Enterprise (custom).
- OR usage-based: $5 per kiosk-month + $0.01 per print job.
- OR hybrid: small base fee + per-print.
- **Stripe Billing** is the standard answer. Webhook integration
  for `invoice.payment_succeeded`, `customer.subscription.updated`,
  `invoice.payment_failed`.
- Need: `subscription.entity.ts`, `invoice.entity.ts`,
  `usage_event.entity.ts` (one row per print, batched into
  invoices).
- New routes: `/api/saas/billing/portal` (Stripe customer portal
  link), `/api/saas/billing/webhook`, `/api/saas/usage/summary`.

**C. International tenants** — Stripe (USA/EU), Paystack (Africa),
Razorpay (India), MercadoPago (LatAm). The SaaS subscription
billing in (B) probably picks ONE processor (Stripe) and the
customer-payments processor in (A) is what varies by tenant.

**Effort:** 4 weeks (Stripe Billing for B + tenant-scoped
Paystack keys for A; multi-processor for A in (C) defers to v2).

### Dimension 10 — Plan-limit enforcement

Subscriptions only matter if we enforce them.

**Limits to enforce:**
- **Kiosks per tenant** — count rows in `kiosks WHERE tenant_id =
  :t`. Reject the next `POST /api/admin/kiosks` if at limit.
- **Print jobs per month** — count rows in `print_jobs WHERE
  tenant_id = :t AND createdAt >= start_of_month`. Reject the
  next customer upload if over (with a friendly "Your printing
  business has hit its monthly quota — admin needs to upgrade").
- **Active customers** (if billed on customer count).
- **Storage** (uploaded files).

**Implementation:**
- New service `services/limits.service.ts`: `enforceLimit
  (tenantId, kind)` — checks the current usage against the plan.
- Inject into every quota-relevant route handler.
- Background job that recomputes monthly counters at the start
  of each billing period.

**Soft limits vs hard limits:**
- Approaching a limit (80%) → email warning to tenant admins.
- At the limit → reject with HTTP 402 (Payment Required).
- 5%-over grace for active jobs already in flight, to avoid
  dropping a customer's print mid-flow.

**Effort:** 2 weeks.

### Dimension 11 — Operations tooling for the SaaS operator

Once you have 50 tenants you can't manage them by SSHing into
Railway and running ad-hoc SQL.

**Platform admin console** (new, at `console.printloop.app`):
- List all tenants with status indicators.
- Click into a tenant: usage, revenue, kiosks online, recent
  errors.
- "Impersonate as tenant admin" — issues a short-lived
  platform-scoped JWT with an `impersonating: tenantId` claim.
  Audit log records every impersonated action.
- Tenant suspend / reactivate.
- Refund issued from the platform (if a tenant disputes a
  billing charge).
- Force-refresh a tenant's branding cache.

**Per-tenant health dashboard:**
- Kiosk online %.
- Average print-completion time.
- Error rate (jobs marked FAILED / total).
- Wallet balance distribution.

**Logging + metrics:**
- Every log line carries `tenantId`. Use a structured logger
  (`pino`) instead of `console.log`.
- Send to Datadog / BetterStack / Axiom.
- Alarms on tenant-level error rates, not just global.

**Effort:** 4 weeks.

### Dimension 12 — Infrastructure for scale

Today: one Railway container, one SQLite file, one Redis instance.

**At scale (~50 tenants, ~5000 daily prints):**
- **API tier:** 2–3 stateless Node instances behind a load
  balancer. Railway supports horizontal scaling but Fly.io,
  Render, or a Kubernetes cluster all work.
- **Database:** managed Postgres — Neon, Supabase, Railway
  Postgres, or AWS RDS. ~$25–$100/mo for the volume PrintLoop
  is likely to see.
- **File storage:** S3 (or any S3-compatible — Cloudflare R2,
  Backblaze B2). Cloudinary stays for image transforms if used.
  Move `data/uploads/` off the API container's disk.
- **Redis:** managed — Upstash, Railway Redis. Required for
  rate-limit state, BullMQ, idempotency cache.
- **Background workers:** separate processes (1–2 instances)
  consuming the BullMQ queue.
- **CDN:** Cloudflare in front of the frontend + uploaded
  documents (with signed URLs).
- **Email:** managed transactional sender — Resend, Postmark,
  SendGrid. SMTP_*/sendmail won't scale.
- **Monitoring:** Sentry for errors, Plausible/PostHog for
  product analytics, BetterStack/UptimeRobot for uptime,
  Logflare/Axiom for logs.
- **Secrets:** Doppler / 1Password Secrets / AWS Secrets Manager
  instead of `.env` files on the container.

**Estimated monthly infra cost at ~50 tenants:** $200–$400/mo.

**Effort:** 2 weeks of migration work + ongoing tuning.

### Dimension 13 — Compliance & legal

The minute you're storing personal data for someone else's
customers, you're on the hook.

**Must-have for launch:**
- Terms of Service that the tenant signs at sign-up (covering:
  who owns the data, our role as data processor, suspension
  policy, refund policy, SLA).
- Privacy Policy (for the SaaS), separate from each tenant's
  customer-facing privacy policy.
- DPA (Data Processing Agreement) — boilerplate signed at
  sign-up. Critical for EU tenants.
- Cookie banner on the SaaS marketing site.
- "Export my data" + "Delete my account" flows for tenant
  customers (GDPR + Nigeria NDPR).

**Should-have:**
- SOC 2 Type I — usually takes 3–6 months of operational
  evidence + an audit. Required for selling to enterprises.
- Penetration test — yearly, ~$5–$15k.
- Bug bounty (HackerOne / Bugcrowd).

**Must-not-have:**
- Card numbers in our DB. Stripe/Paystack tokenize. We never
  see raw PANs.
- Plaintext passwords. Already bcrypt-hashed in `user.entity.ts`.

**Effort:** ongoing — start with ToS + PP + DPA before sign-up
goes live (~2 weeks of legal review).

### Dimension 14 — Customer experience polish

Things that don't move the SaaS architecture but make the
customer-facing surface a real product.

- **Per-tenant 2FA** — TOTP for tenant admins. Required for SOC
  2.
- **Customer mobile app** — wrap the customer flow in
  Capacitor or React Native for App Store / Play Store
  presence. Nice-to-have for v2.
- **Walk-in customer flow** — a "guest" tier that pays per-job
  with no account (pay → get code → print → walk away). Already
  half-supported via the group-batch flow.
- **API for tenants** — let larger tenants integrate with their
  own systems (e.g. a campus LMS pushing print jobs from
  assignments). Document at `developer.printloop.app`.
- **Webhooks for tenants** — `job.completed`, `job.failed`,
  `customer.signed_up` — so the tenant's other systems can
  react.
- **Reports** — CSV exports, PDF month-end reports.
- **Customer support inbox** per tenant — branded support email
  forwarded to a shared inbox we monitor.

**Effort:** ongoing v2/v3.

---

## 3) Phased delivery plan

Sequential rollout with each phase landing a usable milestone.
Numbers are rough engineer-weeks; small team estimates.

### Phase A — Multi-tenant foundation (8–12 weeks)

**Goal:** the code can house multiple tenants safely. No
self-serve yet.

- Dimension 1 (data model + tenantId everywhere): 5w
- Dimension 2 (tenant resolution middleware): 1w
- Dimension 3 (Postgres migration): 2w
- Dimension 4 (RLS on high-risk tables): 1w
- Dimension 6 (tenant roles): 2w
- One "platform" admin creates tenants manually via SQL or the
  console.

**Milestone:** internal demo — provision two tenants by hand,
verify A can't see B's data, kiosk app works against either
tenant's URL.

### Phase B — Self-serve onboarding (6–8 weeks)

**Goal:** anyone can sign up at the marketing site.

- Dimension 5 (sign-up flow + setup wizard): 4w
- Dimension 7 (basic white-label branding — logo + colors): 2w
- Marketing site: 2w (Next.js static + copywriting).

**Milestone:** a third party can sign up, configure their
tenant, install the kiosk app, and print a real test page —
without anyone on the SaaS team touching their setup.

### Phase C — Billing (4–6 weeks)

**Goal:** tenants pay us; we can enforce plan limits.

- Dimension 9.B (Stripe Billing for the SaaS subscription): 3w
- Dimension 9.A (tenant-scoped Paystack keys for their
  customers): 1w
- Dimension 10 (plan-limit enforcement): 2w

**Milestone:** a tenant signs up on a free trial, gets to the
end of trial, enters Stripe card details, gets billed monthly.
A second tenant hits their kiosk limit, sees the upgrade prompt.

### Phase D — Branding + custom domains (4–6 weeks)

**Goal:** tenants don't have to show "printloop.app" to their
customers.

- Dimension 7 (full white-label, email templates): 1w
- Dimension 8 (custom domains via Cloudflare for SaaS or Vercel
  Custom Domains): 2w
- Dimension 14 (tenant mobile-friendly polish): 1w

**Milestone:** a tenant points `print.kampala-uni.ac.ug` at us,
their customers see their logo + their colors + receive emails
from `noreply@print.kampala-uni.ac.ug`.

### Phase E — Operations + scale (4–6 weeks)

**Goal:** we can run 50+ tenants without firefighting.

- Dimension 11 (platform admin console): 4w
- Dimension 12 (infra split: API, workers, managed DB +
  Redis): 2w
- Structured logging + monitoring: 1w

**Milestone:** Sentry alerts when a tenant's kiosk fleet goes
offline. Impersonation works. Suspended tenants can't issue
print jobs.

### Phase F — Compliance + polish (ongoing)

- Dimension 13 (ToS / PP / DPA before public launch).
- 2FA for admins.
- API + webhooks for power-user tenants.
- SOC 2 if pursuing enterprise.

### Phase G — Growth features (v2+)

- Mobile apps.
- Walk-in customer flow.
- Multi-currency processors.
- Resale / referral programme for tenant onboarders.
- AI features (auto-classify uploads, smart pricing, fraud
  detection).

---

## 4) Tech stack changes

**Stays the same:**
- Express + TypeORM backend. Battle-tested for this scale.
- React + Vite + RTK Query frontend. Already mobile-responsive.
- Electron-bundled kiosk app. Works.
- BullMQ workers. Standard.

**Changes:**
- SQLite → **Postgres** (Neon or Railway Postgres).
- In-memory rate-limits → **Redis-backed** (Upstash or Railway
  Redis).
- File storage on disk → **S3-compatible** (Cloudflare R2 or AWS
  S3) plus Cloudinary kept for image transforms.
- SMTP → **Resend** or **Postmark** (transactional). Stays SMTP
  if you prefer.
- `.env` files → **Doppler** or **AWS Secrets Manager** in
  production.
- `console.log` → **pino** with structured fields. Pipe to
  Axiom / BetterStack.
- Sentry for errors. PostHog or Plausible for product analytics.

**New surfaces:**
- `printloop-marketing/` — Next.js static site for
  `printloop.app`. Public-facing pricing, features, sign-up.
- `printloop-platform-console/` — internal-only Vite app at
  `console.printloop.app` for the SaaS operator to manage all
  tenants. Could be folded into the existing admin console
  with a `platform_admin` role gate, but a separate codebase
  prevents accidental scope creep.

**No change but worth standardising:**
- Migration tooling: TypeORM's CLI is fine but consider
  Atlas or Drizzle Kit for cleaner diffing.
- API documentation: OpenAPI spec generated from the route
  definitions. `tsoa` or `nestjs/swagger` make this easy.

---

## 5) Pricing & cost model

A model to anchor the conversation. Adjust to your unit
economics.

### Tenant-facing pricing

| Tier | Price/month | Kiosks | Jobs/month | Notes |
|---|---|---|---|---|
| **Free trial** | $0 (14 days) | 1 | 50 | Includes everything; expires. |
| **Starter** | $19 | 1 | 200 | Single-shop owner. |
| **Growth** | $79 | 5 | 2,000 | Small chain or department. |
| **Pro** | $249 | 25 | 10,000 | University / large network. |
| **Enterprise** | Talk to sales | Unlimited | Unlimited | Volume + SLA + custom domain (if not by default). |

**Overage:** $0.005–$0.01 per print job above the plan limit
(soft cap; tenant warned at 80%).

**Add-ons** (rev-share or per-tenant):
- Custom domain on Starter: $5/mo.
- White-glove kiosk setup (we install + ship): $250 one-time
  per kiosk.
- SLA / support tier: +$200/mo for 99.9% + 4-hour response.

### Tenant collecting from THEIR customers

Tenants charge their own customers via Paystack (NGN) or Stripe
(USD/EUR). Money flows directly to the tenant's account.

**Optional platform fee** on customer payments (if you want
revenue beyond the subscription): 1–2% of the customer's print
spend, deducted via Paystack Split.

### Infrastructure cost per tenant (rough)

| Item | Cost |
|---|---|
| Managed Postgres slice (shared) | ~$0.50–$2 per tenant per month |
| Redis | ~$0.10 |
| S3 storage (avg 100 MB / tenant) | ~$0.003 |
| Bandwidth | ~$0.10 |
| Email (Resend 3000 emails/mo) | ~$0.40 |
| **Total infra** | **~$1–$3 per tenant per month** |

Sentry, PostHog, BetterStack are fixed monthly costs that don't
scale per-tenant.

**Gross margin on Starter ($19) tier:** ~$15/mo per tenant
once mature. Healthy.

---

## 6) Risks, tradeoffs, and decisions to make first

**Single biggest risk: a missed `tenantId` filter that leaks
data across tenants.** Mitigations:
1. Postgres RLS on the high-risk tables (Dimension 4).
2. Automated tests that fire a request as Tenant A and assert
   Tenant B's data is invisible.
3. A linting rule that flags raw `repo.find()` calls without
   the tenant-aware helper.

**Decision: shared-schema vs schema-per-tenant vs DB-per-tenant.**
- Shared-schema (what this roadmap assumes) — easiest, scales
  best, requires discipline.
- Schema-per-tenant — Postgres feature, hard isolation at the
  cost of migration pain (DDL on N schemas).
- DB-per-tenant — strongest isolation, complete operational
  overhead per tenant. Only worth it for ~$10k+/mo enterprise
  tenants with strict compliance demands.
- **Recommendation:** shared-schema for v1, offer DB-per-tenant
  as an Enterprise add-on later.

**Decision: build the SaaS sign-up + billing as separate apps
vs fold into existing customer-frontend.**
- Separate: clean separation of "marketing/sign-up" from
  "tenant customer flow." Easier mental model.
- Folded: less code duplication, single auth surface.
- **Recommendation:** separate marketing site (different domain
  anyway), but the sign-up form + the tenant settings live in the
  customer-frontend's admin section (gated to `owner` role).

**Decision: support both Paystack and Stripe simultaneously
from day 1, or Paystack-only for v1.**
- Paystack-only is faster. The existing code is already wired
  for it; we already have Nigerian customers.
- But: limits the SaaS to African tenants until v2.
- **Recommendation:** Paystack-only for the **tenant collecting
  from THEIR customers** in v1; Stripe for the **SaaS billing
  tenants** from day 1 (Stripe is universally available and the
  cleanest subscription tool).

**Decision: free trial vs paid-from-day-1.**
- Free trial reduces friction, increases sign-up. Industry
  standard.
- Paid-from-day-1 filters serious tenants from tire-kickers.
- **Recommendation:** 14-day free trial with a credit card
  required upfront. Forces commitment without billing on day 1.

**Decision: do we white-label the kiosk Setup.exe too?**
- v1: keep "PrintLoop Kiosk Setup.exe" — operators get used to
  the SaaS brand.
- v2: optional white-label .exe build (Enterprise add-on) —
  each tenant gets their own branded installer. Doable with
  electron-builder's per-build branding overrides.
- **Recommendation:** v1 keep generic, v2 white-label.

**Trade-off: aggressive feature parity with single-tenant.**
- The current single-tenant deployment has features (CUPS
  ingress, group printing, the brutalist editorial design)
  that may not be universally desired by SaaS tenants.
- Avoid the temptation to remove anything during the SaaS
  migration; keep all current features + add the multi-tenant
  layer. Decommission individual features only once we have
  usage data showing nobody uses them.

---

## 7) Open questions to answer before starting

These are the calls only you (the product owner) can make. The
answers shape everything downstream.

1. **Who's the target customer?** Campus print shops?
   University libraries? Photocopy centres? Each has different
   feature priorities (e.g. campus shops care about group
   printing, libraries care about access control).
2. **What's the first geography?** Nigeria (where the existing
   single-tenant deployment lives), Africa more broadly, or
   global? This drives the Paystack vs Stripe call.
3. **Self-serve only, or assisted sales?** Self-serve scales but
   needs more polish; assisted sales gets you the first 10
   customers faster but doesn't scale.
4. **Bring-your-own-domain on every tier, or only Pro+?** Custom
   domains add operational cost; locking them to Pro+ funnels
   revenue.
5. **Charge tenants per kiosk, per job, or hybrid?** Per-kiosk
   maps to their actual infra; per-job maps to their actual
   revenue.
6. **Whose Paystack account collects customer payments?** Each
   tenant's directly, or our split-account with a fee, or a
   choice per tenant?
7. **Multi-language?** v1 English-only, v2 add others as demand
   appears. Affects email + kiosk UI but not architecture.
8. **Will you sell to government / education / large
   enterprise?** If yes, SOC 2 and procurement processes are on
   the v1+ horizon. If no, you can punt that to v3.
9. **How important is GDPR / EU launch?** If you want any EU
   tenants, the DPA + GDPR delete/export flows have to be on day
   1.
10. **Do tenants need their own admin sub-roles?** v1 the role
    set (`owner` / `admin` / `staff`) is fine for most tenants.
    v2 some larger tenants may want custom roles — defer until
    asked.

Park each of these in the journal as a "decision to revisit"
entry; they don't all need answers today, but the v1 / v2 split
above implicitly answers most of them.

---

## 8) Maintenance rule

This roadmap is a strategy document, not a changelog — but it
still needs upkeep:

- **When a dimension lands**, update its section with the
  status: `### Dimension 1 — Multi-tenancy in the data model
  [✅ Shipped 2026-MM-DD — commit abc1234]`. Don't delete the
  original prose; just add the status banner.
- **When you change scope**, strike with `~~text~~` and
  explain why inline. Future maintainers should see the original
  reasoning even when it's been revised.
- **When a new dimension emerges** that the current 14 don't
  cover, add it as Dimension 15+, update the table of contents,
  and write a journal phase entry pointing at it.
- **When you ship a phase**, the phase header gets a "shipped
  XX/XX, commit `abc1234`" footnote.

Keep this file the strategic narrative; let `JOURNAL.md`
capture the day-to-day execution and `BACKEND-GUIDE.md` describe
the implementation reality. The three files together form a
self-contained history of "what we're building, what we built,
and why."
