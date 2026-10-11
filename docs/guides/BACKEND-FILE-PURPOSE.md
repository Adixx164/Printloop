# PrintLoop Backend — File Purpose Guide

*Every file in `01-backend/`, `render-worker/`, `printloop-agent/`, and `worker/` — what it does and why it exists. Written in plain English.*

---

## 01-backend/ — Main API Server

The Express + TypeORM application that runs in the cloud. It handles all HTTP requests from the web app, kiosk panels, on-site agents, and external integrations (Paystack, CUPS, campus LMS).

### Root Files

| File | Purpose |
|------|---------|
| `app.ts` | **Main entry point.** Creates the Express app, wires up CORS, JSON parsing, health check, rate limiters, tenant resolution, and mounts every route group in the correct order. The comments explain *why* each middleware sits where it does (e.g., appliance CORS before global CORS, tenant middleware after auth). |
| `worker.ts` | **Background worker runner.** Starts BullMQ workers (scheduled jobs, webhook deliveries, watermark rendering, file cleanup) inside the same process as the API. Useful for single-server deploys; in production these run as separate processes. |
| `vitest.config.ts` | Test runner config for the backend unit/integration tests. |
| `BACKEND-GUIDE.md` | Human-readable docs for backend developers — how to run, test, migrate, debug. |
| `DIRECTORY_MAPPING.md` | Map of where each feature lives (routes → services → entities). |
| `.env` / `.env.example` / `.env.production.example` | Environment variable templates. `.env` is your local secrets; the `.example` files show what's required. |
| `.dockerignore` | Files to exclude from Docker builds (node_modules, logs, test DBs). |
| `Dockerfile` / `Dockerfile.prod` | Container images. `Dockerfile` for dev (hot reload), `Dockerfile.prod` for production (multi-stage, non-root user). |
| `start.sh` | Helper script to run migrations then start the server in one command. |
| `backend.out.log` / `backend.err.log` | Stdout/stderr capture when running via PM2 or similar. |

---

### config/ — Configuration & Bootstrapping

| File | Purpose |
|------|---------|
| `index.ts` | Central config object. Reads all `process.env` once, applies defaults, validates types, exports a single `config` object used everywhere. |
| `database.ts` | **TypeORM DataSource setup.** The most important file for DB. It: (1) lists all 37 entities, (2) maintains TWO migration chains — SQLite (incremental, 24 files) for local dev and Postgres (single consolidated baseline) for production, (3) auto-selects driver from `DATABASE_URL`, (4) runs `runPostInitMigrations()` on boot for one-shot data fixes (promo code uppercase, pricing backfill, review photo column). |
| `validateEnv.ts` | **Production boot gate.** In `NODE_ENV=production`, refuses to start if required secrets are missing or unsafe (short JWT secret, dev fallback secret, `SEED_DEMO=1`, `DISABLE_RATE_LIMIT=1`). Dev/test skip this entirely. |
| `settings.ts` | Runtime-editable system settings (stored in `system_settings` table). Provides `getSetting()` / `setSetting()` with in-memory cache + DB persistence. |
| `seed.ts` | Creates the **legacy tenant** (`slug: 'legacy'`) and a default admin user on first boot so the old single-tenant deployment keeps working during the multi-tenancy cutover. |
| `redis.ts` | Redis client + BullMQ connection factory. Exports `REDIS_ENABLED` flag (false in dev without Redis) so the code can gracefully degrade (skip queues, skip accept-window, skip render-worker). |

---

### entities/ — Database Tables (37 total)

Every customer-facing table has `tenantId NOT NULL`. Multi-tenancy is enforced at the schema level.

| Entity | What It Represents |
|--------|-------------------|
| `tenant.entity.ts` | A print shop / organization. Has `slug` (subdomain), `customDomain`, `status` (active/suspended/closed), `balance` (denormalised wallet rollup). |
| `tenantMember.entity.ts` | Many-to-many: User ↔ Tenant with `role` (OWNER, ADMIN, STAFF). |
| `tenantBranding.entity.ts` | White-label: colours, logo, favemark, wordmark per tenant (Dimension 7). |
| `tenantWebhook.entity.ts` | Outbound webhooks per tenant (Dimension 14) — events like `job_completed`, `job_failed`, `payout_initiated`. |
| `tenantDomain.entity.ts` | Custom domains per tenant (Dimension 8) with DNS verification status. |
| `tenantBalance.entity.ts` | **Denormalised rollup** — current wallet balance per tenant for O(1) dashboard reads (V2-8). Updated by triggers in `wallet.service.ts`. |
| `user.entity.ts` | Platform users. `role`: `SUPER_ADMIN` (platform console), `TENANT_ADMIN`, `TENANT_STAFF`, `USER` (customer). TOTP secret for 2FA. |
| `kiosk.entity.ts` | A physical print station. `apiKey` (KSK_...) authenticates the kiosk panel + on-site agent. `isPublic` controls marketplace visibility. |
| `printerProfile.entity.ts` | **Printer capabilities** (V2-56): resolved DPI, colour mode, paper size. Pinned to a PrintJob so the render worker rasterizes at the *printer's* limits, not the customer's wishful settings. |
| `pricingConfig.entity.ts` | Price matrix per tenant: paper (A4/A3/Letter/Legal) × colour (BW/Color) × 6 cells (100/300/600 DPI × simplex/duplex). Admin-editable. |
| `editPricingConfig.entity.ts` | Per-shop pricing for the "Edit & Print" service (separate from print pricing). |
| `printJob.entity.ts` | **Core domain object.** One customer order. Status enum: `PENDING` → `RENDERING` → `READY` / `AWAITING_ACCEPT` → `RELEASING` → `COMPLETED` / `FAILED` / `EXPIRED`. Tracks `finalCost` (authoritative after render), `requiresAccept` (marketplace), `printerProfileId` (job pinning). |
| `printJobItem.entity.ts` | Line items inside a PrintJob (batch uploads, participant uploads). Each has its own file + config + cost. |
| `documentEdit.entity.ts` | Edit & Print workflow: tracks each edit step (crop, rotate, reorder, delete pages) on a source file. |
| `file.entity.ts` | Uploaded documents. Stores S3 key, original filename, MIME, size, watermarked URL. |
| `wallet.entity.ts` | Per-tenant wallet (NGN). Balance in kobo (integer, no floating point). |
| `transaction.entity.ts` | Wallet ledger: `TOPUP`, `PAYMENT`, `REFUND`, `PAYOUT`, `ADJUSTMENT`. Immutable audit trail. |
| `payment.entity.ts` | Paystack payment records. `authorizationCode` for saved-card reuse (V2-53). |
| `payout.entity.ts` / `payoutSchedule.entity.ts` | Shop owner withdrawals. Schedule = recurring (weekly/monthly) or manual. |
| `promotion.entity.ts` | Discount codes. `code` (uppercased), `percentOff` or `amountOff`, usage limits. |
| `groupSession.entity.ts` / `groupParticipant.entity.ts` | "Group Print" — one student pays, shares a link, classmates upload. Session tracks total pages/cost; participants each have a file + config. |
| `dispute.entity.ts` / `shopReview.entity.ts` | Customer ↔ shop disputes (refund requests) and public reviews with optional photo. |
| `blogPost.entity.ts` | Tenant-owned marketing blog posts (V2-54). Published = public on marketplace. |
| `auditLog.entity.ts` | Immutable admin action log (who did what, when, IP). |
| `systemSetting.entity.ts` | Platform-wide toggles (maintenance mode, feature flags). |

---

### middleware/ — Request Pipeline Guards

| File | Purpose |
|------|---------|
| `tenant.middleware.ts` | **The multi-tenancy gatekeeper.** Resolves `req.tenant` in priority order: custom domain → owned-apex subdomain (`shop.printloop.app`) → `X-Tenant-Slug` header (agent/kiosk) → authenticated user's tenant/JWT memberships → legacy fallback. Enforces: suspended=403, closed=410, non-member=403. SUPER_ADMIN bypasses. |
| `auth.middleware.ts` | JWT verification. Attaches `req.user` (id, role, tenantId, tenantMemberships). Handles access + refresh tokens. |
| `rbac.middleware.ts` | Role-based access control. `requireRole('TENANT_ADMIN')`, `requireSuperAdmin()`, etc. |
| `rateLimit.middleware.ts` | Per-(tenant, IP) sliding window limiters (Redis-backed). Login=5/min, signup=10/hr, OTP=10/hr, password reset=5/hr. Disabled via `DISABLE_RATE_LIMIT=1`. |
| `kioskAuth.middleware.ts` | Validates `X-Kiosk-Key` header for appliance routes (`/api/printer`, `/api/agent`, `/api/participant-upload`). Loads kiosk by API key, attaches `req.kiosk`. |
| `platformAdmin.middleware.ts` | Shortcut: `authenticate` + `requireSuperAdmin` in one. |
| `verifiedEmail.middleware.ts` | Blocks unverified emails from sensitive actions. |
| `bruteForce.middleware.ts` | Tracks failed logins per IP/email, locks out after threshold. |
| `requestContext.middleware.ts` | Adds `req.requestId` (UUID) + `req.log` (pino child logger) to every request. Emits one structured access line on `finish`. Mounted FIRST so even rejected preflights are traceable. |

---

### routes/ — HTTP Endpoints (25 route groups)

Mounted in `app.ts` with precise middleware order.

| Route File | Prefix | Auth | Tenant | Purpose |
|------------|--------|------|--------|---------|
| `openapi.ts` | `/api` | ❌ | ❌ | OpenAPI 3.1 spec + Swagger UI (`/api/openapi.json`, `/api/docs`). |
| `discovery.routes.ts` | `/api/discovery` | ❌ | ❌ | **Marketplace** — customers browse shops, filter by campus, see public branding/pricing. Cross-tenant by design. |
| `integrations.routes.ts` | `/api/integrations` | ❌ | ❌ | Campus LMS trusted-link handoff (V2-44). No PrintLoop session. |
| `saas.routes.ts` | `/api/saas` | ✅ (signup/login) | optional | Tenant onboarding: signup → email verify → setup wizard (branding, pricing, kiosk, domain). |
| `platform.routes.ts` | `/api/platform` | ✅ | ❌ | **SUPER_ADMIN console** — list/suspend/close tenants, view platform metrics, impersonate. Cross-tenant. |
| `render.routes.ts` | `/api/render` | HMAC | ❌ | Render-worker callbacks: `POST /callback` (success), `POST /failure` (error). Signed with `RENDER_CALLBACK_SECRET`. |
| `adminAuth.routes.ts` | `/api/admin/auth` | ❌ | optional | Admin login, 2FA, password reset, me. |
| `admin-kiosk.routes.ts` | `/api/admin/kiosks` | ✅ | ✅ | CRUD kiosks, regenerate API key, test printer connection, toggle public. |
| `admin.routes.ts` | `/api/admin` | ✅ | ✅ | Tenant admin dashboard: jobs, wallet, payouts, promotions, branding, webhooks, domains, staff, disputes, reviews, blog, printer profiles, pricing matrix, availability. |
| `spike.routes.ts` | `/api/admin/spike` | ✅ | ✅ | **Dev-only** render spike (Option A) — enabled via `ENABLE_SPIKE_RENDER=1`. |
| `printer.routes.ts` | `/api/printer` | Kiosk key | ✅ | Kiosk panel: status, job list, accept/reject (marketplace), release, test print. |
| `agent.routes.ts` | `/api/agent` | Kiosk key | ✅ | **On-site agent API** — poll ready jobs, claim, complete/fail, report printer capabilities. |
| `cups.routes.ts` | `/api/cups` | Token | ✅ | **CUPS ingress** — laptop adds PrintLoop as a network printer; CUPS backend POSTs PDF here. |
| `customerAuth.routes.ts` | `/api/customer/auth` | ❌ | optional | Customer register, login, verify email, refresh, logout, me. |
| `customerPrint.routes.ts` | `/api/customer` | ✅ | ✅ | Customer upload, preflight (page count + cost estimate), create job (single + batch), wallet top-up, job history, group sessions. |
| `participantUpload.routes.ts` | `/api/participant-upload` | Upload token | ✅ | Group Print participant upload endpoint (short-lived token from session). |
| `payments.routes.ts` | `/api/payments` | mixed | optional | Paystack initialize/verify/webhook. Webhook derives tenant from metadata. |
| `publicPricing.routes.ts` | `/api/pricing` | ❌ | optional | Public pricing matrix for landing page / group upload — no JWT needed. |
| `publicBranding.routes.ts` | `/api/branding` | ❌ | optional | Public branding (colours, logo, wordmark) for first-paint brand swap. |
| `legal.routes.ts` | `/api/legal` | ❌ | ❌ | DPA, Terms, Privacy — public, no auth. |
| `preflight.routes.ts` | `/api/preflight` | ❌ | optional | Upload file → get page count + cost estimate without creating a job. |
| `blog.routes.ts` | `/api/blog` | ❌ | ❌ | Published tenant blog posts (marketplace content). |
| `dispute.routes.ts` | `/api/disputes` | ✅ | ✅ | Customer opens dispute, shop responds, admin mediates. |
| `files.routes.ts` | `/api/files` | ❌ | ❌ | Static file serving (S3 signed URLs or local fallback). Kiosk/agent downloads rendered artifacts here. |
| `passwordReset.routes.ts` | `/api/auth` | ❌ | optional | Forgot/reset password flow (V2-29). |
| `groupSession.routes.ts` | `/api/groups` | ✅ | ✅ | Group Print session CRUD (distinct from legacy mock). |
| `devApi.routes.ts` | `/api` | ❌ | optional | **Legacy mock API** — stations, options, old customer flow. Mounted LAST so real routes win. |

---

### services/ — Business Logic (30 services)

Each service encapsulates one domain. Controllers are thin; they call services.

| Service | Purpose |
|---------|---------|
| `renderEnqueue.service.ts` | **Cloud render pipeline.** `enqueueRender()` → BullMQ `render` queue → render-worker consumes → `POST /api/render/callback` → `applyRenderResult()` flips `RENDERING→READY`, runs **cost reconciliation** (authoritative page count drives final price; overpay→wallet refund, underpay→kiosk collects). `reconcileStuckRenders()` cron fixes orphaned jobs. |
| `pricing.service.ts` | **Single source of truth for pricing.** `computeCost()` used by *every* ingress (web, batch, participant, CUPS). Reads active `PricingConfig` row, picks exact (DPI, duplex) cell if populated, else falls back to legacy multiplier, else flat-rate `priceOf()`. Guarantees identical prices across all channels. |
| `kiosk.service.ts` | Kiosk CRUD, API key gen/rotate, connection probe (TCP 631/6310/9100), offline detection, print counters. |
| `printerProfile.service.ts` | Resolves printer profile for a job (pinned → tenant default). Converts profile caps → render options (DPI, colour, paper) for the worker. |
| `costReconciliation.service.ts` | Applies render-authoritative page count to `PrintJob.finalCost`. Atomic: status flip + wallet refund + webhook in one transaction. |
| `tenantWebhook.service.ts` | Delivers tenant-configured webhooks with HMAC signature, retry/backoff, dead-letter logging. |
| `tenantBalance.service.ts` | Maintains denormalised `TenantBalance` rollup on every wallet transaction. |
| `tenantExport.service.ts` / `tenantDelete.service.ts` | GDPR/closure: export all tenant data (ZIP) or hard-delete tenant (cascades). |
| `onboarding.service.ts` | SaaS setup wizard steps: branding → pricing → kiosk → domain → go-live. |
| `customDomain.service.ts` | DNS verification (TXT record), SSL provisioning (Let's Encrypt via ACME), domain activation. |
| `paystack.service.ts` | Paystack wrapper: initialize, verify, webhook signature check, list banks, resolve account. |
| `payments.service.ts` | Orchestrates payment flow: initialize → redirect → webhook → wallet credit → job promotion. |
| `payout.service.ts` | Initiates shop owner payouts (Paystack transfers), updates `Payout` rows, emits webhooks. |
| `commission.service.ts` | Platform commission calculation (percentage + flat fee) on each completed job. |
| `promotion.service.ts` | Promo code validation, usage tracking, expiry. |
| `printPolicy.service.ts` | Shop print policy: max pages, max file size, allowed paper/colour/duplex, accept window. |
| `preflight.service.ts` | PDF analysis: page count, dimensions, colour detection, cost estimate. |
| `documentConvert.service.ts` / `documentConversion.service.ts` | Office (LibreOffice) + image → PDF conversion. Used by render-worker and preflight. |
| `acceptWindow.service.ts` | Marketplace accept window logic: job pauses in `AWAITING_ACCEPT`, operator accepts/declines, auto-expire after configurable minutes. |
| `groupSession.service.ts` | Group Print orchestration: session create, participant join, cost split, owner pays. |
| `kioskAlert.service.ts` | Monitors kiosk heartbeats, fires `kiosk_offline` webhook/email after threshold. |
| `ipp.service.ts` | Cloud IPP print path (legacy — prints directly from cloud to LAN printer via IPP). |
| `qrCode.service.ts` | Generates QR codes for job pickup, group join links, kiosk pairing. |
| `geocoding.service.ts` | Converts address → lat/lng for marketplace map (Nominatim / Google). |
| `email.service.ts` | Transactional emails (verify, reset, receipts, alerts) via Resend/SMTP. |
| `sms.service.ts` | SMS notifications (Termii) for critical alerts. |
| `sentry.service.ts` | Error reporting to Sentry (lazy import, no-op if DSN missing). |
| `audit.service.ts` | Writes `AuditLog` entries for admin actions. |
| `backup.service.ts` | Scheduled DB dump → S3 (SQLite file copy or pg_dump). |
| `abuseLimits.service.ts` | Per-tenant rate limits on expensive ops (render, conversion, uploads). |
| `statement.service.ts` | Generates wallet/transaction statements (CSV/PDF) for shop owners. |
| `etherpad.service.ts` | Real-time collaborative editing backend for "Edit & Print" (optional). |

---

### workers/ — Background Jobs (BullMQ)

Run via `worker.ts` or as separate processes.

| Worker | Queue | Purpose |
|--------|-------|---------|
| `scheduled.worker.ts` | `scheduled` | Cron-like jobs: `reconcileStuckRenders` (every 5min), `kioskOfflineCheck` (every 5min), `dailyPayouts` (06:00), `webhookRetry` (every 1min), `pricingBackfill` (weekly). |
| `webhook.worker.ts` | `webhooks` | Delivers tenant webhooks with exponential backoff (max 5 retries). |
| `watermark.worker.ts` | `watermark` | Applies text watermark to uploaded PDFs (offloads from request path). |
| `fileCleanup.worker.ts` | `file-cleanup` | Deletes orphaned S3 objects (temp uploads, failed renders) older than 24h. |
| `retention.ts` | `retention` | Data retention policies: delete completed jobs > 90 days, audit logs > 1 year (configurable). |
| `queues.ts` | — | Exports all BullMQ queue instances + typed job interfaces for type-safe `queue.add()`. |

---

### utils/ — Shared Helpers

| File | Purpose |
|------|---------|
| `fileStore.ts` | Abstracts file storage: S3 (prod) or local filesystem (dev). `uploadFile()`, `getSignedUrl()`, `deleteFile()`. |
| `jwt.ts` | Access/refresh token generation, verification, rotation. |
| `totp.ts` | TOTP (2FA) generation + verification (RFC 6238). |
| `logger.ts` | Pino logger with pretty-print in dev, JSON in prod. Child loggers per request. |
| `observability.ts` | Sentry wrapper (`reportError`, `setUserContext`). Lazy import so bundle stays slim if unused. |
| `limits.ts` | Abuse limit checkers (render/min, conversion/min, upload size). |
| `handoffOnce.ts` | Idempotency key helper — ensures an operation runs exactly once (used for webhook deduplication). |
| `releaseCode.ts` | Generates short alphanumeric pickup codes (e.g., `PL-7K9M`). |
| `s3.ts` | Low-level S3 client (used by render-worker + fileStore). |

---

### tests/ — Backend Test Suite (13 files)

| Test File | What It Tests |
|-----------|---------------|
| `accept-window.test.ts` | Marketplace accept window: pause, accept, decline, auto-expire. |
| `backup.test.ts` | DB dump → S3, restore verification. |
| `cost-reconciliation.test.ts` | Render page count → finalCost, overpay refund, underpay shortfall. |
| `cups-billing.test.ts` | CUPS ingress pricing matches web pricing exactly. |
| `document-conversion.test.ts` | Office → PDF, image → PDF, page count accuracy. |
| `printer-profiles.test.ts` | Profile resolution (pinned → default), render option clamping. |
| `render-pipeline.test.ts` | Full render flow: enqueue → worker → callback → status flip. |
| `spec-gaps.test.ts` | Contract tests: every route returns expected OpenAPI shape. |
| `tenant-isolation.test.ts` | **Critical** — Tenant A cannot read/write Tenant B data via any route. |
| `transports.test.ts` | IPP, raw-9100, spooler dispatch + confirmation logic. |
| `validateEnv.test.ts` | Production boot gate catches all misconfigurations. |
| `totp.test.ts` | 2FA enrol, verify, backup codes. |
| `virtual-printer.test.ts` | Mock printer for CI — accepts IPP/raw/spooler, returns controllable responses. |

---

### migrations/ — Schema History (24 files)

**Two parallel chains** — auto-selected by driver:

| Chain | Files | Description |
|-------|-------|-------------|
| **SQLite (local dev)** | 1700000000000 → 1721000000000 | 24 incremental files. Each is SQLite-dialect (PRAGMA, table-rewrite for NOT NULL). Run in order on every boot via `migrationsRun: true`. |
| **Postgres (production)** | 1718100000000 (`PostgresBaseline`) + 11 guarded incrementals | Single baseline builds full final schema in pg-native DDL. Later incrementals use `IF NOT EXISTS` / column-existence checks so they're safe in both chains. |

Key milestones:
- `1717100000000-CreateSaasFoundation` — Tenant, TenantMember, Payout, PayoutSchedule
- `1717200000000-AddTenantIdColumns` — Adds `tenantId NOT NULL` to every customer table
- `1717700000000-TightenTenantIdNotNull` — Enforces NOT NULL (backfills legacy rows to `legacy` tenant)
- `1717400000000-AddRenderingStatus` — `RENDERING` status + render tracking fields
- `1720300000000-CreatePrinterProfiles` — Printer capability profiles (V2-56)
- `1720900000000-CreateDocumentEditsTable` — Edit & Print workflow
- `1721000000000-CreateEditPricingConfigsTable` — Edit service pricing

---

## render-worker/ — Cloud Render Consumer

Standalone Node service (Docker, Railway, Fly). Consumes `render` queue, produces PWG-Raster + PDF + previews, callbacks to backend.

| File | Purpose |
|------|---------|
| `src/worker.ts` | BullMQ worker entry. Creates `RenderPipeline`, runs job, calls `postRenderSuccess`/`postRenderFailure` (HMAC-signed). Handles Redis version check (needs ≥5.0). |
| `src/pipeline/render.ts` | **542 lines — the render engine.** Downloads source (S3/URL), converts Office/images→PDF (LibreOffice), applies print config (page range, watermark, orientation, printer-profile paper fit), normalises to PDF/A (Ghostscript), converts to PWG-Raster (`pdftopwg`), generates JPEG previews (pdf.js + canvas), uploads artifacts to S3, returns metadata (pageCount, bytes, duration). |
| `src/utils/logger.ts` | Pino logger (same as backend). |
| `src/utils/s3.ts` | S3 upload/download (shared with backend's `utils/s3.ts`). |
| `src/config/index.ts` | Reads env, exports typed config object. |
| `Dockerfile` | Multi-stage: installs Ghostscript, LibreOffice, cups-filters (`pdftopwg`), Node deps. Runs as non-root. |

**Vendor binaries** (read-only, in `vendor/openprinting/`): Ghostscript, LibreOffice, cups-filters (`pdftopwg`), pdf.js fonts. Refreshed via `tools/refresh-vendor.ps1`.

---

## printloop-agent/ — On-Site Print Agent

Runs on the shop's LAN-connected PC (Windows/Linux). Polls cloud for jobs, prints to local printer, reports results. **Only outbound HTTPS** — no VPN/port-forward needed.

| File | Purpose |
|------|---------|
| `agent.ts` | **718 lines — the entire agent.** Config from `.env`. Loop: poll `/api/agent/jobs/ready` → claim → download file → dispatch via **IPP** (preferred), **raw-9100** (JetDirect + PJL), or **spooler** (OS print queue: `lp` / `Start-Process -Verb PrintTo`) → **job-truth confirmation** (poll IPP job-state until `completed`, or watch OS queue drain) → report `complete`/`failed` with confirmation summary. Also reports printer capabilities (colour/duplex/A3) via IPP Get-Printer-Attributes at startup + every 6h. |
| `install.ps1` / `install.sh` | Installs as system service (Windows: NSSM; Linux: systemd). |
| `build-installer-exe.ps1` | Builds Windows `Setup.exe` via electron-builder (for non-technical shop install). |
| `scripts/e2eJobTruth.cjs` | E2E test: submits job → agent prints → verifies confirmation. |

---

## worker/ — Legacy Render Worker (Deprecated)

**Replaced by `render-worker/`** (TypeScript, OpenPrinting-based). Kept for reference / migration.

| File | Purpose |
|------|---------|
| `src/index.ts` | BullMQ worker — same pattern as render-worker but uses internal `executor.ts`. |
| `src/executor.ts` | `RenderPipeline` class — orchestrates download → process → upload. |
| `src/pipeline/render.ts` | Legacy render logic: pdf-lib + pdfjs + `@napi-rs/canvas` + Ghostscript + `pdftopwg`. Similar to new worker but different PDF processing path. |
| `src/callback.ts` | `postRenderSuccess` / `postRenderFailure` — HMAC callback to backend. |
| `src/types.ts` | Shared `RenderManifest` / `RenderResult` types. |
| `scripts/_fireOnce.ts` | One-shot script to manually trigger a render job. |
| `scripts/e2eRenderWorker.cjs` | E2E test for legacy worker. |

---

## How They Work Together

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Customer   │────▶│  01-backend │────▶│  BullMQ (Redis)  │
│  uploads    │     │  API        │     │  'render' queue  │
└─────────────┘     └──────┬──────┘     └────────┬─────────┘
                           │                      │
                    enqueueRender()               │
                           │                      ▼
                    ┌──────┴──────┐     ┌──────────────────┐
                    │  PrintJob   │     │  render-worker   │
                    │  status=    │     │  (cloud)         │
                    │  RENDERING  │     │  PDF → PWG-Raster│
                    └─────────────┘     └────────┬─────────┘
                                                 │
                                          POST /api/render/callback
                                                 │
                                                 ▼
                    ┌─────────────┐     ┌──────────────────┐
                    │   Kiosk     │◀───▶│  printloop-agent │
                    │  (shop PC)  │     │  (on-site LAN)   │
                    └─────────────┘     └──────────────────┘
                           │                      │
                    polls /api/printer      polls /api/agent/jobs/ready
                           │                      │
                           ▼                      ▼
                    Operator accepts        Dispatches to printer
                    (marketplace)           (IPP / raw9100 / spooler)
                           │                      │
                           └──────────┬───────────┘
                                      ▼
                               Job COMPLETED
                               Wallet settled
                               Webhook fired
```

---

## Key Design Decisions (Why It's Built This Way)

1. **Multi-tenancy at schema level** — Every customer table has `tenantId NOT NULL`. No "tenantId optional" leaks. The middleware enforces it; the DB enforces it.

2. **Two migration chains** — SQLite for zero-setup local dev; Postgres for horizontal scaling. The `database.ts` driver switch is the *only* place that knows which chain to run.

3. **Cloud render, local spool** — Heavy Ghostscript/LibreOffice/cups-filters runs in `render-worker` (Linux containers, scalable). The on-site `printloop-agent` just pushes bytes to the LAN printer — no compiler toolchain needed on the shop PC.

4. **Job-truth (V2-44)** — "Accepted by spooler" ≠ "Printed". The agent polls IPP `job-state` until `completed` or watches the OS queue drain. Only then reports `confirmed`. Raw-9100 is honest: `unconfirmed, method=none`.

5. **Pricing single source** — `pricing.service.ts::computeCost()` is the *only* price calculator. Every ingress (web, batch, participant, CUPS) calls it. No drift possible.

6. **Cost reconciliation at render** — Customer pays on *estimated* pages. Render produces *actual* pages. `applyRenderResult()` reconciles atomically: overpay → wallet refund; underpay → kiosk collects shortfall on release.

7. **Graceful degradation** — `REDIS_ENABLED=false` (dev without Redis) → queues disabled, accept-window disabled, render-worker skipped → jobs go `PENDING → READY` directly. Single-tenant deployments work without Redis.

8. **Legacy fallback tenant** — `slug: 'legacy'` seeded on first boot. The tenant middleware falls back to it so pre-multi-tenancy code paths don't 404 during cutover. Will be removed once every route is tenant-aware.

---

## Files NOT Covered Here (Intentionally)

- `printloop-new-frontend/` — React frontend (separate codebase)
- `printloop-kiosk-app/` — Electron kiosk UI (separate)
- `printloop-kiosk/` — Old HTML kiosk (reference only)
- `03-document-preview-component/` — Spike component (partly merged into frontend)
- `vendor/openprinting/` — 26 read-only OpenPrinting repos (Ghostscript, cups-filters, etc.)
- `tools/` — Build/ops scripts (Windows-flavoured)
- `docs/` — Internal docs
- Root markdown files (`ARCHITECTURE.md`, `SAAS-ROADMAP.md`, `JOURNAL.md`, etc.)

---

*Generated from codebase scan on 2026-09-13. Update when files change.*