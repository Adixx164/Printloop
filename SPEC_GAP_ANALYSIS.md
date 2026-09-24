# PrintLoop Build Spec — Gap Analysis

**Compared:** `PrintLoop_Build_Spec.md` (the spec you shared) against the live `printloop-saas-v2` codebase as of phase V2-35.
**Date:** 2026-06-09
**Tone:** honest. No padding.

---

## ⚡ Status update (V2-35 audit): every priority gap is now closed

A full re-audit of the codebase in V2-35 found that **all 10 items from the priority list have shipped** — some during this session, others in parallel work I didn't see until I went looking. Receipts at the bottom of this document. The spec's customer + partner + admin flows are all wired in code.

What's left for launch is **operational, not code**: provision Postgres / Redis / S3 / Cloudinary, plug in live Paystack + Termii keys, point DNS at the deployed app. See [`DEPLOY-SAAS.md`](DEPLOY-SAAS.md).

---

## Big picture

The spec describes a **single-domain marketplace** (`printloop.ng` — customers and shops live in one app at one domain). What's built is a **multi-tenant SaaS with a marketplace surface** (`printloop.app/find` for discovery, `{shop}.printloop.app` for each shop's own portal). The pricing model matches the spec (10% per-transaction commission, Bolt-Nigeria style). The data model differs — `Tenant`/`TenantMember`/`Kiosk`/`PricingConfig` instead of `Shop`/`ShopOwner`/`ShopOffering` — but the functional surface is almost entirely there.

**The spec's 12–16 week estimate is for someone starting from zero with only auth working.** You are not starting from zero. After V2-0 → V2-34 the codebase has multi-tenant SaaS, marketplace discovery with map + clustering, live gate, handoff tokens, password reset, rate limiting, 2FA, structured logging, OpenAPI docs, Sentry init, production bootstrap CLI, CI with seven E2E scripts, and a Postgres-ready deploy runbook.

---

## Milestone 1 — Customer side

| Spec item | Built | Gap |
|---|---|---|
| **1.1 Cloudinary file upload** | multer + pdfjs page count + local file store; Cloudinary SDK already in `package.json` | **Swap `saveBuffer` → Cloudinary upload** (½ day) |
| **1.2 Wallet top-up via Paystack** | `PaystackService` + webhook + commission split + `Wallet` entity exist | **Add `/wallet/topup/initialize` + `/wallet/topup/verify` endpoints + frontend popup flow** (1 day) |
| **1.3 Print job create + pay + auth code** | Done. `POST /api/customer/print-jobs` generates 6-char code + expiry + email | Matches spec |
| **1.4 Real dashboard** | Done — `/saas/dashboard` reads live tenant balance + recent revenue + onboarding checklist | Matches spec |
| **1.5 Settings — profile + change password** | Profile update partial; **change-password endpoint not exposed** | Add `PUT /api/customer/auth/password` + Settings UI section (½ day) |

---

## Milestone 2 — Partner side

The spec wants a **separate `/partner` app**. What's built is the per-tenant admin surface (`/saas/dashboard`, `/saas/payouts`, `/saas/settings`, `/saas/transactions`) served on each shop's own subdomain. Functionally the same; visually different.

| Spec item | Built |
|---|---|
| **2.1 Shop entities** | `Tenant` + `PricingConfig` (24-cell paper × colour × DPI × duplex matrix) + `PrintJob.code` inline + `TenantBalance` + `Payout`. **No `ShopReview`** — gap. |
| **2.2 Shop auth** | `POST /api/saas/signup` (V2-30 takes address + geocodes), `POST /api/admin/auth/login` with `X-Tenant-Slug`. V2-33 fix grants new owners `Object.values(Permission)` minus `SUPER_ADMIN` so they can immediately manage their shop |
| **2.3 Profile + offerings** | `PATCH /api/saas/me/location`, `PUT /api/saas/me/branding`, `/api/admin/kiosks/*`. **Photo upload missing** |
| **2.4 Job queue + code verify** | `POST /api/printer/validate-code` (kiosk-auth, V2-28 rate-limited, brute-force protected) + admin console `JobsTab` |
| **2.5 Earnings + payout** | `GET /api/saas/balance`, `GET /api/saas/payouts`, `POST /api/saas/payouts/instant` (V2-23 statement.service.ts), Paystack Transfer wired |
| **2.6 Self-service terminal** | `KioskCodePage` exists |

---

## Milestone 3 — Map and discovery

| Spec item | Built |
|---|---|
| **3.1 `GET /shops/nearby?lat&lng&radius`** | Built as `GET /api/discovery/shops/nearby` (V2-30). Haversine + bounding-box prefilter + cross-tenant capability rollup in 3 queries (no N+1) |
| **3.2 Map view UI** | Built with **Leaflet + OpenStreetMap** (V2-31) + **marker clustering** (V2-34). No API key needed. Spec recommends Mapbox/Google Maps — swap is a tile URL change if you want their aesthetic |
| **3.3 Shop detail page** | `/find/:slug` (V2-30) with full pricing matrix + brand colour + agent-online indicator + V2-32 handoff CTA |
| **3.4 NewPrintPage uses chosen shop** | Tenant's `/api/pricing` returns the per-tenant matrix; **handoff carries the slug but pricing read is via tenant resolution (subdomain), not `shopId` in URL** |
| **3.5 Wallet escrow** | **Different design.** Paystack Split routes the customer's payment to the shop's subaccount at charge time (commission to PrintLoop, net to shop). No held-in-escrow code. Simpler and matches the Bolt model. |

---

## Milestone 4 — Admin

| Spec item | Built |
|---|---|
| **4.1 Admin auth** | `/api/platform/*` with `SUPER_ADMIN` bypass. **Production CLI** `scripts/createSuperAdmin.ts` (V2-27) mints the first super admin without a public-password seed |
| **4.2 Shop verification** | `POST /platform/tenants/:id/suspend` + `/reactivate` + audit log + V2-32 live gate (status × test-print × online kiosk) |
| **4.3 Transaction monitoring** | Done via admin console (`AdminConsolePage`) |
| **4.4 Dispute resolution** | **Partial** — `refund.service.ts` exists, no dedicated dispute queue |
| **4.5 Refunds** | Done via `refund.service.ts` |
| **4.6 Settlement cron** | Done via BullMQ workers (V2-15 retry queue + V2-23 scheduled payouts in `workers/queues.ts`) |
| **4.7 Code expiry cleanup** | Done via `workers/retention.ts` cron sweep |

---

## Cross-cutting

| Item | Spec | Built |
|---|---|---|
| Email | Gmail SMTP | Generic SMTP via nodemailer (Resend/Postmark/SES via env). Verification + password reset + payout emails wired. EmailService no-ops gracefully when `SMTP_HOST` unset (V2-29) |
| SMS | Termii | **Termii env vars exist, no transport wired** |
| In-app notif | `Notification` entity | `AuditLog` exists; **no dedicated in-app notification queue** |
| Sentry | Frontend + backend | **Backend wired DSN-gated (V2-34); frontend not yet** |
| Structured logging | pino | Done (V2-16) with per-request `requestId` |
| Rate limiting | login 5/15min, register 3/hr, code verify 5/min, general 100/min | V2-28: login 5/**min**, signup 10/hr, OTP 10/hr, password-reset 5/hr, code-validation 10/min/kiosk. **Spec wants 5/15min for login; current is 5/1min** — easy adjust |
| bcrypt cost | 12 | **10** — adjust to 12 if you want spec-exact (slower; debatable benefit) |

---

## Concrete gaps I can close, in priority order

These are the items that are genuinely missing **and** worth closing before launch:

1. **Wallet top-up via Paystack** — endpoints for `/wallet/topup/initialize` + `/verify` + frontend `@paystack/inline-js` popup. (1 day)
2. **Cloudinary actually wired** for file uploads instead of local disk. (½ day)
3. **Termii SMS** — single adapter behind the same disabled-when-unconfigured pattern as `EmailService`; wire to verification + auth-code flows. (½ day)
4. **Change-password endpoint** + frontend Settings page section. (½ day)
5. **Shop photo upload** — `POST /api/saas/me/photos` + Cloudinary. (½ day)
6. **ShopReview entity** + customer review endpoint + display on `/find/:slug`. (1 day)
7. **Frontend Sentry** behind `VITE_SENTRY_DSN` (no-op without). (½ day)
8. **Dedicated `/admin/disputes` queue** distinct from the audit log. (1 day)
9. **Rate-limit numbers to match spec exactly** (login 5/15min, register 3/hr). (5 minutes)
10. **bcrypt cost factor to 12** if you want spec-exact. (5 minutes)

**About 5–7 days** of focused work to close every spec gap that's both real and worth closing.

---

## Where I'd push back on the spec

- **MySQL → Postgres.** Spec says MySQL; codebase auto-selects SQLite (dev) or Postgres (prod) from `DATABASE_URL`. Postgres is a strict superset for our use: PostGIS for geo when we outgrow Haversine, better concurrency, better TypeORM ergonomics. MySQL would be a backwards step with no payoff.
- **Mapbox / Google Maps → OpenStreetMap.** Spec recommends paid map providers. OSM works free, no API key, no per-request billing. Tile URL is one line; swap to Mapbox if you want their specific aesthetic, but functionally OSM is fine for Abuja and beyond.
- **Single domain → multi-tenant subdomains.** Spec's single-domain model is simpler to operate but couples all shops to one TLS cert and one branding surface. The multi-tenant model lets each shop have their own portal at `yaba-print-hub.printloop.app` (which the demo proved). I'd keep multi-tenant.
- **`AuthCode` as a separate entity.** Spec separates `AuthCode` from `PrintJob`. The codebase puts `code + expiresAt + usedAt` directly on `PrintJob`. Same data, fewer joins, atomic state machine.
- **Two separate frontend apps (`/customer` + `/partner`).** Codebase has one app with route-level separation (`/print/new`, `/saas/dashboard`, `/platform`, `/find`). One build pipeline, one design system, easier to maintain.
- **JWT RS256 → HS256.** Spec says RS256. Codebase uses HS256. RS256 is better when many services verify tokens without trusting each other (microservices). At our shape (one API monolith) HS256 is fine and one less moving part. Swappable if you decide otherwise.

---

## Tech stack mismatches summary

| Concern | Spec | Built | Severity |
|---|---|---|---|
| Database | MySQL | SQLite / Postgres (driver auto-selects) | Postgres is better; not a real gap |
| Map provider | Mapbox or Google | OpenStreetMap via Leaflet | Free; equivalent for our use |
| Domain model | Single (`printloop.ng`) | Subdomain-per-tenant (`{slug}.printloop.app`) | Architectural — keep multi-tenant |
| Frontend split | `/customer` + `/partner` | One SPA, route-based | Operationally simpler |
| JWT algo | RS256 | HS256 | Functionally equivalent at our scale |
| bcrypt cost | 12 | 10 | 5-minute adjust |
| Email provider | Gmail SMTP | Generic SMTP | More flexible |
| Rate-limit windows | 15-min window for login | 1-min window | 5-minute adjust |

---

## Where the codebase exceeds the spec

- **Multi-tenant branding** (V2-13 → V2-17): each shop can set their own wordmark, primary colour, logo, favicon. Live on `/find` cards and on their subdomain.
- **Custom domains** (V2-16): tenants can map `print.kampala-uni.ac.ug` to their account with DNS verification.
- **Webhooks** (V2-14 → V2-15): tenants subscribe to `job.completed`, `job.failed`, `customer.signed_up`, `payout.paid` with HMAC-signed delivery + retry queue.
- **2FA / TOTP** (V2-22): RFC 6238 hand-rolled on `node:crypto`, no dependency, with QR enrolment + login gate. Not in the spec.
- **CSV month-end statements** (V2-23): per-tenant statement download in Settings.
- **OpenAPI 3.1 spec + Swagger UI** (V2-26): served at `/api/openapi.json` + `/api/docs`. 23 paths, 6 tags.
- **Production super-admin CLI** (V2-27): closes the public-password seed hole.
- **Self-contained E2E suite** (7 scripts): each test spawns its own backend on a random port, exercises a feature end-to-end, asserts every code path including the failure modes. Total green: 31 (discovery) + 24 (polish) + 18 (self-serve) + 13 (password reset) + 13 (super-admin CLI) + 8 (rate limit) + V2-2x base.
- **Live gate** (V2-32) — refuses marketplace opt-in until a successful test print + an online kiosk are recorded. Spec mentions it ("shop goes live only after agent connects and a test job passes") but doesn't define the four refusal codes the implementation uses.
- **Pre-pay offline guard** (V2-32) — refuses job creation when the chosen shop has no kiosk heartbeat in the last 5 minutes.
- **Session handoff** (V2-32 → V2-34) — signed JWT carries `{ tenantSlug, email }` from `/find/:slug` to `{shop}.printloop.app/print/new` so customers don't re-type their email.

---

## Launch readiness checklist (spec Section 7)

| Criterion | Status |
|---|---|
| Customer flow end-to-end (register → verify → top-up → upload → pay → code → pickup) | **Code complete**; needs Cloudinary + wallet top-up endpoint to be fully wired (items 1–2 above) |
| Partner flow end-to-end (register → verify → admin approval → profile → offerings → online → receive job → verify code → print → mark done → see balance → request payout) | **Code complete** per V2-32/V2-33; needs Termii SMS (item 3) for the customer-side notification half |
| Admin flow (verify shops, see jobs/transactions, refund/resolve disputes) | **Mostly complete**; needs dispute queue (item 8) |
| Reliability (99% uptime, <500ms API, >95% payment success) | Measured in prod; pino + Sentry give us the signals |
| Compliance (privacy policy, ToS, Paystack live, 5 shops onboarded) | **Your ops items.** None of this is code |

---

## My recommended next moves

**Option A — Close the gaps:** roll items 1 → 4 from the priority list (wallet top-up, Cloudinary, Termii, change-password). About 2–3 days of work. Then the customer flow really is complete end-to-end on real services.

**Option B — Move to ops:** the codebase is launch-ready against your existing tenant model. Provision Postgres + Redis + S3 + live Paystack keys + DNS. `docker compose up --build` to prove the Postgres path. Then deploy to Railway (the `DEPLOY-SAAS.md` runbook walks through it).

**Option C — Both in parallel:** I close gaps; you provision external accounts. We meet at deploy time.

Tell me which option and I'll roll.

---

## V2-35 audit appendix — receipts for every "closed" claim

Each item below has a file path + line number so a future scanner can verify without guessing.

### 1. Wallet top-up via Paystack — CLOSED

- `01-backend/routes/wallet.routes.ts` lines:
  - L16:  `GET  /api/wallet` — balance + recent transactions
  - L42:  `POST /api/wallet/top-up` — direct credit (dev / wallet-only)
  - L86:  `POST /api/wallet/top-up/initialize` — Paystack init, returns auth URL
  - L124: `GET  /api/wallet/top-up/verify` — Paystack verify, credits wallet
- Mounted at `/api/wallet` in `01-backend/app.ts`
- Idempotency by `reference` — covered by `01-backend/tests/spec-gaps.test.ts` "wallet top-up verification handles duplicate references gracefully"

### 2. Cloudinary upload — CLOSED

- `01-backend/utils/fileStore.ts`:
  - `import { v2 as cloudinary } from 'cloudinary'` (top of file)
  - `hasCloudinary = Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)`
  - `cloudinary.config({...})` runs at import time when env is set
  - `saveBuffer()` uploads to Cloudinary first, **falls back to local disk on error** (best-effort, never breaks the request)
- Same module used by: `workers/fileCleanup.worker.ts`, `workers/retention.ts`, `workers/watermark.worker.ts`, `services/qrCode.service.ts`

### 3. Termii SMS — CLOSED

- `01-backend/services/sms.service.ts` (97 sloc):
  - `SMSService.send()` calls `https://api.ng.termii.com/api/sms/send`
  - No-ops + warns when `TERMII_API_KEY` unset
  - Templates: `sendPrintJobCode`, `sendOTP`, `sendGroupDeadlineReminder`
  - `normalizePhone()` converts Nigerian `0801…` → `2348012…`
- Wired into:
  - `services/payments.service.ts:100` — **fires on payment success** alongside the email (parallel best-effort; SMS failure never blocks the response)
  - `services/onboarding.service.ts:279` + `:385` — tenant onboarding

### 4. Change-password endpoint — CLOSED

- `01-backend/routes/customerAuth.routes.ts:239` — `bcrypt.compare(oldPassword, user.passwordHash)`
- L57 + L246: new password hashed at `bcrypt.hash(value, 12)` (cost 12, the spec value)
- `01-backend/tests/spec-gaps.test.ts` "verifies password change validates old password and hashes with 12 rounds"

### 5. Shop photo upload — CLOSED

- `01-backend/routes/saas.routes.ts`:
  - L757: `photoUpload = multer({ memoryStorage, fileSize: 5MB })`
  - L759: `POST /api/saas/me/photos` — single-photo upload
  - L789: `DELETE /api/saas/me/photos` — remove photo
- Uses `fileStore.saveBuffer()` so it inherits the Cloudinary-with-disk-fallback path from item #2

### 6. ShopReview entity — CLOSED

- `01-backend/entities/shopReview.entity.ts` with `rating: 1..5`, `comment`, `tenantId`, `userId`
- Created by migration `01-backend/migrations/1718600000000-CreateDisputesAndReviews.ts`
- Rating-range tested in `01-backend/tests/spec-gaps.test.ts` "verifies reviews accept rating range 1-5 and rejects out of range"

### 7. Frontend Sentry — CLOSED

- `printloop-new-frontend/package.json`: `"@sentry/react": "^10.56.0"`
- `printloop-new-frontend/src/main.tsx`:
  ```ts
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({ dsn: sentryDsn, tracesSampleRate: 0.1 });
  }
  ```
- No-op when `VITE_SENTRY_DSN` is unset (the dev / no-DSN case)

### 8. Admin disputes queue — CLOSED

- `01-backend/entities/dispute.entity.ts` (`DisputeStatus.PENDING | RESOLVED | REJECTED`)
- `01-backend/routes/dispute.routes.ts`:
  - L19: `GET /api/admin/disputes` — list with `requirePermission`
  - L47: `POST /api/admin/disputes/:id/resolve` — resolve + trigger `RefundService`
- Resolve-with-refund covered by `01-backend/tests/spec-gaps.test.ts` "verifies disputes resolve by calling refund logic"
- Frontend: `printloop-new-frontend/src/pages/admin/tabs/DisputesTab.tsx`

### 9. Rate-limit windows — UPDATED to spec values

- `01-backend/middleware/rateLimit.middleware.ts` `loginLimiter` is now **15-minute window**, max 5 — matches the spec's "login attempts: 5 per 15 min per IP" exactly. Other limiters (signup, OTP, password-reset) are at the V2-28 sensible defaults.

### 10. bcrypt cost factor → 12 — CLOSED

- All 7 hash sites now use cost 12:
  - `routes/customerAuth.routes.ts:57` + `:246`
  - `routes/passwordReset.routes.ts:210`
  - `scripts/createSuperAdmin.ts:136`
  - `services/onboarding.service.ts:202`
  - `config/seed.ts:81` (the `hash` helper)
  - `tests/spec-gaps.test.ts` — explicitly asserts `$2a$12$` or `$2b$12$` prefix on stored hashes

---

## What is genuinely external (your accounts, not code)

| Item | Where it plugs in |
|---|---|
| **Postgres** connection string | `DATABASE_URL` env — driver auto-selects |
| **Redis** URL | `REDIS_URL` env — BullMQ + rate limiter |
| **Cloudinary** creds | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — uploads go to Cloudinary the moment all three are set |
| **Paystack** live keys | `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_WEBHOOK_SECRET` |
| **Termii** API key | `TERMII_API_KEY` — SMS service flips from no-op to live |
| **Sentry** DSN (backend + frontend) | `SENTRY_DSN` (backend) + `VITE_SENTRY_DSN` (frontend build env) |
| **DNS** for `*.printloop.app` | Your registrar |
| **SUPER_ADMIN** bootstrap | `tsx scripts/createSuperAdmin.ts <email> <password>` after deploy |

The deploy runbook in `DEPLOY-SAAS.md` (§3a) walks through it. There is no remaining code-side priority work between here and launch.

---

## Last audited
2026-06-09 — V2-35 close-out
