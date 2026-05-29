# PrintLoop Backend — File-by-File Guide

A living reference for every source file in `01-backend/`. Each entry
lists the file's job, what it exports, who calls it, and any
gotchas. Skim the table of contents to find what you need; the
sections are ordered by directory, then by importance within.

This file is a **living document**. When you add, rename, or
significantly change a backend file, append/update the matching
entry here in the same commit (the maintenance rule from
`JOURNAL.md` applies: never silently rewrite an entry — strike
through with `~~text~~` if correcting an honest mistake).

---

## Table of contents

1. [Top-level (entry points + configs)](#1-top-level-entry-points--configs)
2. [`config/` — runtime bootstrap](#2-config--runtime-bootstrap)
3. [`entities/` — TypeORM tables](#3-entities--typeorm-tables)
4. [`middleware/` — request-level guards](#4-middleware--request-level-guards)
5. [`middlewares/` — DEAD CODE](#5-middlewares--dead-code)
6. [`routes/` — HTTP surface](#6-routes--http-surface)
7. [`services/` — business logic](#7-services--business-logic)
8. [`controllers/` — thin HTTP→service adapters](#8-controllers--thin-httpservice-adapters)
9. [`utils/` — pure helpers](#9-utils--pure-helpers)
10. [`workers/` — BullMQ background jobs](#10-workers--bullmq-background-jobs)
11. [`migrations/` — TypeORM DDL](#11-migrations--typeorm-ddl)
12. [`scripts/` — operator + dev tooling](#12-scripts--operator--dev-tooling)
13. [`data/` — runtime state (gitignored)](#13-data--runtime-state-gitignored)

---

## 1) Top-level (entry points + configs)

### `server.ts` (~30 lines)
**The process entry point.** `tsx server.ts` from `npm start` /
`npm run dev` lands here. Bootstraps in order:

1. `AppDataSource.initialize()` — connect SQLite, sync schema
   (TypeORM `synchronize:true` is on; the production DB lives on
   the Railway volume so the sync survives container restarts).
2. `runPostInitMigrations()` — one-shot data normalizations
   (e.g. uppercase legacy promotion codes so the unique index
   lookup hits).
3. `runSeed()` — see `config/seed.ts`.
4. `ensureSystemSettings()` — see `config/settings.ts`.
5. `createApp()` → `app.listen(port)` on `PORT` (default 4000).

Logs `Database connected (SQLite) & schema synchronized.` then
`PrintLoop API listening on http://localhost:PORT` to confirm
boot. On any exception, prints the stack and `process.exit(1)`
so Railway's healthcheck flips the deploy to FAILED rather than
keeping a broken container alive.

### `app.ts` (~115 lines)
**The Express app builder.** Exports `createApp()` returning a
fully-configured `Application`. Owns:

- **Two CORS regimes:**
  - "Appliance" CORS (`origin: true`, mounted BEFORE the strict
    global) for `/api/printer`, `/api/agent`, and
    `/api/participant-upload` — these are header-key authed, not
    cookie authed, so reflecting any origin is safe.
  - Strict global CORS (`origin: ALLOWED_ORIGINS`,
    `credentials: true`) for the customer/admin browser flows.
- **JSON body parser with raw-body capture** — `verify` hook
  stashes `req.rawBody` so the Paystack webhook can verify the
  HMAC over the original bytes.
- **Health check** at `GET /health` (no auth) returning
  `{status:"ok",timestamp,version}`.
- **All route mounts**, in this order:
  - `/api/admin/auth` (public) → `/api/admin/kiosks` (authed) →
    `/api/admin` (authed) → `/api/groups` → `/api/participant-
    upload` → `/api/printer` → `/api/agent` → `/api/payments` →
    `/api/pricing` → `/api/cups` → `/api/customer/auth` →
    `/api/customer` (authed) → static `/api/files` from
    `UPLOAD_DIR` → `/api` (legacy dev mock).
- **404** + **error handler** at the bottom. Multer errors get
  mapped to 413 / 400; everything else returns 500.

### `package.json`
Scripts: `dev` (tsx watch), `start` (tsx run), `typecheck`
(`tsc --noEmit`). Runtime deps include Express, TypeORM, SQLite3,
BullMQ, Redis, IPP (`ipp`, `@types/ipp`), Paystack via Axios,
Nodemailer, multer, pdf-lib, qrcode. Note `tsx` and `typescript`
are in **`dependencies`** (not devDeps) — Railway's prod build
strips dev deps and `tsx server.ts` would fail without them.

### `.npmrc`
Single line: `legacy-peer-deps=true`. SQLite3 + TypeORM have a
peer-dependency conflict that Nixpacks installs hit on every
Railway build without this.

### `.env.example`
Template of every environment variable the backend reads, with
inline comments distinguishing **required** (JWT_SECRET,
PAYSTACK_SECRET_KEY, DATABASE_NAME) from **production-correctness**
(PAYSTACK_WEBHOOK_SECRET, REDIS_URL, SMTP_*, TERMII_*) from
**optional / mode-specific** (TS_AUTHKEY, IPP_*,
PRINT_DISPATCH_MODE, PUBLIC_BASE_URL). Includes stubs for unused
keys (STRIPE_*, FIREBASE_*) that lived in earlier specs but no
code reads.

### `tsconfig.json`
TypeScript compile options. `module:"ESNext"`,
`moduleResolution:"Bundler"`, `target:"ES2022"`,
`experimentalDecorators:true` + `emitDecoratorMetadata:true`
(required for TypeORM's `@Column`/`@Entity` decorators).
`noEmit:true` — the runtime is tsx, not tsc; tsc only typechecks.

### `start.sh`
**Railway boot script.** Tailscale is now **opt-in**: only fires
if `$TS_AUTHKEY` is set. When set, installs Tailscale onto
`$DATA_DIR/tailscale` (cached on the Railway volume across deploys),
starts `tailscaled --tun=userspace-networking --socks5-server=
127.0.0.1:1055 --port=0`, joins the tailnet with `--accept-routes
--accept-dns=false --reset`, and exports
`TS_SOCKS5_PROXY=127.0.0.1:1055` so the agent's `openSocket()`
routes through the tunnel. When unset, prints a friendly message
pointing at the `printDispatchMode = kiosk-pull` setting. Always
ends with `exec ./node_modules/.bin/tsx server.ts` (direct shim
call — `node ./node_modules/.bin/tsx` was a previous attempt that
failed because the shim is a shell script, not JS).

### `railway.toml`
Railway build config. `startCommand="bash start.sh"`,
`healthcheckTimeout=180` (Tailscale install on a cold volume can
exceed the 30 s default), `restartPolicyType="ON_FAILURE"`.

### `test.ts` (~50 lines)
A standalone smoke test of TypeORM connectivity. Runs the seed,
creates a temp user + wallet, asserts the rows survive a query.
Not part of the regular dev flow — kept around as a sanity check
for "is the DB even wired up?" diagnostics. Run with
`tsx test.ts`.

### `FOLDER_README.md` / `DIRECTORY_MAPPING.md`
Pre-session high-level orientation docs for the backend layout.
Useful for someone landing fresh on the codebase; superseded by
this file for file-by-file detail. Both are older and may name a
few directories or files that have since moved — trust this guide
over them when they disagree.

---

## 2) `config/` — runtime bootstrap

### `config/database.ts` (~103 lines)
**The TypeORM DataSource.** Exports `AppDataSource`, a SQLite
`DataSource` pointed at `process.env.DATABASE_FILE` (defaulted to
`data/printloop.sqlite` for local dev; on Railway the volume mount
puts this at `/app/data/printloop.sqlite`). `synchronize:true`,
`logging:false` (overridable via `DB_LOGGING=true`). Lists every
entity class explicitly so the metadata is reflected. Exports
`runPostInitMigrations()` — one-shot data normalizations that
schema sync can't do; today it uppercases legacy promotion codes
so the unique-index lookup in `promotion.service.ts` works.

### `config/redis.ts` (~75 lines)
Optional Redis connection for BullMQ. Reads `REDIS_URL` (Railway
addon-injected) or falls back to `REDIS_HOST`/`PORT`/`PASSWORD`.
Exports a singleton `IORedis` instance. If Redis is unreachable,
logs a warning and returns null — workers detect this and silently
skip rather than crash the API process. **Redis is not strictly
required to run the app**; file-cleanup and refund-on-expiry
just don't run without it.

### `config/seed.ts` (~228 lines)
**First-boot seed.** Exports `runSeed()` which runs idempotently
on every cold start. Creates if missing:

- A super-admin user (`admin@printloop.test` / `Admin1234!`) —
  default credentials, intended to be rotated immediately on a
  production deploy. The credentials are documented in this file
  because they're not secrets: they're the seed defaults, useful
  only on a fresh DB.
- A demo customer (`student@printloop.test` / `Password1!`) so
  the `LoginPage`'s "USE DEMO ACCOUNT" button works without a
  manual signup.
- A demo kiosk row so the admin Kiosks tab has something in it.
- The 24-cell pricing matrix (A4/A3 × BW/Color × 100/300/600
  qualities × simplex/duplex sided variants).

Logs "Seed: users already present, skipping." when nothing
needed to land. Never overwrites an existing row — once an admin
changes the demo passwords, the seed leaves them alone.

### `config/settings.ts` (~120 lines)
**The canonical SystemSettings catalog.** Exports
`DEFAULT_SETTINGS: DefaultSetting[]` — the full set of admin-
configurable knobs. Adding a new entry here makes it appear in
the admin Options tab on the next reboot. Exports
`ensureSystemSettings()` which:

1. Reads every row from the `system_settings` table.
2. Adds any catalog entry whose key isn't already present (never
   overwrites).
3. Force-reconciles a small set of "product constraint" settings
   that aren't tunable — e.g. `allowedFileTypes` is hard-coded
   to "PDF, JPG, PNG" because the renderer only handles those.

Catalog highlights:
- **Storage** — `documentRetentionHours`, `maxFileSizeMb`,
  `maxPagesPerFile`, `autoDeleteAfterPrint`.
- **Jobs** — `jobExpiryHours`, `maxCopiesPerJob`, `jobCodeLength`,
  `defaultPaperSize`, `defaultColorMode`,
  `allowGroupPrinting`, `maxGroupParticipants`.
- **Payments** — `walletMinTopUp`, `walletMaxTopUp`,
  `walletMaxBalance`, `newUserSignupBonus`, `paystackEnabled`,
  `currency`.
- **Notifications** — `emailNotificationsEnabled`,
  `smsNotificationsEnabled`, `lowBalanceThreshold`.
- **Branding** — `companyName`, `supportEmail`, `supportPhone`.
- **Printing** — policy keys (`policyEnabled`,
  `policyMaxPagesPerJob`, …), IPP transport keys (`ippSecure`,
  `ippPort`, `ippPath`, `ippVersion`, `ippTransport`,
  `ippRawPort`), and **`printDispatchMode`** — the
  `cloud-push` vs `kiosk-pull` toggle that decides whether
  `/printer/complete` IPP-dispatches itself or just marks the
  job RELEASING for the agent.
- **System** — `maintenanceMode`, `maintenanceMessage`,
  `appVersion`.

---

## 3) `entities/` — TypeORM tables

Each `.entity.ts` is a class decorated with `@Entity('table_name')`
and a set of `@Column` / `@ManyToOne` / `@Index` decorators.
TypeORM reflects them into SQLite columns at boot via
`synchronize:true`.

### `entities/user.entity.ts` (~99 lines)
**Customers and admins.** Soft-deletable. Columns:
`firstName`, `lastName`, `email` (unique), `phoneNumber`,
`passwordHash` + `salt`, `isEmailVerified`,
`emailVerificationToken`/`Expires`, `passwordResetToken`/`Expires`,
`role` (enum `customer` | `admin` | `super_admin`),
`adminPrivileges` (string[] via simple-array — see `AdminPrivilege`
enum: `manage_kiosks`, `manage_pricing`, `manage_promotions`,
`manage_settings`, `requeue_jobs`, `issue_refunds`,
`manage_users`, `manage_roles`), `isBlocked` + `blockReason`,
`printToken` (the CUPS print-token added earlier — unique, 96
chars, nullable), `lastLoginAt`, `createdAt`/`updatedAt`,
`deletedAt`. `@OneToOne` with `Wallet`.

### `entities/wallet.entity.ts` (~37 lines)
**Per-user prepaid balance.** Columns: `userId` (unique →
one-wallet-per-user), `balance` (decimal). `@OneToMany`
relation to `Transaction`. The `tryDebit` flow in
`services/wallet.service.ts` is a single conditional UPDATE on
this row so concurrent prints can't double-spend.

### `entities/transaction.entity.ts` (~50 lines)
**Wallet ledger.** Every credit (top-up, refund, bonus) and
every debit (print, batch, group) is a row here. Columns:
`walletId`, `type` (enum `topup` / `print` / `refund` /
`bonus`), `amount`, `description`, `relatedJobId` (nullable —
ties debits/refunds back to the PrintJob), `createdAt`.
The `WalletPage` UI reads these via `/api/wallet/transactions`.

### `entities/payment.entity.ts` (~72 lines)
**Paystack-side payment records.** Separate from the
`Transaction` ledger because Paystack carries metadata we
don't want polluting the simple `+/-` ledger view:
`paystackReference`, `authorizationCode`, `channel`,
`feesPaystack`, raw response JSON. Webhook events populate
this; the `tryDebit` ledger entry happens after Paystack
confirms.

### `entities/printJob.entity.ts` (~140 lines)
**The single most important table.** Every print sits here.
Columns:
- `user` / `userId` — nullable (group-batch guests can print
  without an account).
- `file` / `fileId`, `fileName`.
- `code` (unique, 6 chars) — the customer-facing release code.
- `cost`, `totalPages`, `pagesCompleted` (per-job page counter
  the agent could update post-confirmation; currently unused).
- `jobType` — `single` | `personal_batch` | `group_batch`.
- `status` — enum `PrintJobStatus`:
  ```
  PENDING  | READY  | RELEASING  | PRINTING  | DONE
  FAILED   | EXPIRED | REFUNDED
  ```
  RELEASING was added this session for kiosk-pull mode (the
  window between "kiosk typed the code" and "agent claimed it").
- `printConfiguration` (simple-json) — `copies`, `paper`,
  `color`, `sided`, `qualityDpi`, `orientation`.
- `kiosk` / `kioskId` — which kiosk this job is bound to (null
  until claimed).
- `printerId`, `printerName`.
- `groupSessionId` — for group-batch jobs.
- `watermarkId` — historical, no longer used.
- `idempotencyKey` — for CUPS-resubmit dedupe. Unique with
  `userId` via the partial index
  `print_jobs_user_idem_uniq (userId, idempotencyKey) WHERE
  idempotencyKey IS NOT NULL`.
- `expiresAt`, `completedAt`.

### `entities/printJobItem.entity.ts` (~49 lines)
**Per-document rows for personal_batch / group_batch.** A
single-document `PrintJob` doesn't use this table; only batches
fan out across `PrintJobItem` rows. Columns: `printJobId`,
`fileId`, `fileName`, `order`, `totalPages`,
`printConfiguration` (per-document settings — the whole point
of batch printing is allowing different config per file).
Added to the `/api/agent/jobs/ready` items response in Phase 15
so the agent can compute expected impressions.

### `entities/file.entity.ts` (~41 lines)
**Uploaded-document metadata.** Columns: `fileName`, `mimeType`,
`size`, `fileURL` (local path under `data/uploads/`, or a
Cloudinary URL if configured), `pageCount`, `uploadedAt`,
`expiresAt`. The actual bytes are NOT stored here; this just
describes where to find them.

### `entities/kiosk.entity.ts` (~97 lines)
**Physical kiosk records.** Each kiosk is a row with:
`name`, `area` / `campus`, `mapsUrl`,
`apiKey` (the `X-Kiosk-Key` header — generated by
`POST /admin/kiosks/:id/regenerate-key`), `ipAddress`
(printer's LAN IP for cloud-push mode), `status` (`online` /
`offline` / `maintenance`), `queue` (current backlog),
`lastSeenAt`, `lastHeartbeat`, `printsLifetime`, `pagesLifetime`.

### `entities/auditLog.entity.ts` (~40 lines)
**Append-only admin action log.** Columns: `actorId` /
`actorName`, `action` (e.g. `kiosk.regenerate-key`,
`settings.update`), `entityType` / `entityId`, `detail`
(simple-json freeform), `createdAt`. The admin Reports tab
reads from this.

### `entities/groupSession.entity.ts` (~74 lines)
**Group-print session.** A host opens a session, gets a
`shareId`, distributes the URL to participants, who upload
their own documents via `/api/participant-upload`. Columns:
`groupName`, `hostId`, `shareId`, `deadline`,
`defaultOptions` (the host's "everyone prints with these
settings, optionally enforced"), `enforced`, `closedAt`,
`batchToken`, `batchCode`. Closing the session generates a
single batch release code for the host.

### `entities/groupParticipant.entity.ts` (~84 lines)
**One row per joined participant.** Columns: `groupSessionId`,
`participantName`, `email`, `phone`, `uploadToken` (one-shot,
authenticates the upload), `fileId`, `printConfig` (their
personal selections within whatever the host allows), `paidAt`,
`cost`.

### `entities/pricingConfig.entity.ts` (~85 lines)
**The 24-cell pricing matrix.** Columns: `paper` (A4 / A3),
`color` (bw / color), `qualityDpi` (100/300/600), `sided`
(single / double), `pricePerPage`. The customer pricing
service reads this; the admin can update via
`PATCH /admin/pricing-configs/:id`.

### `entities/promotion.entity.ts` (~55 lines)
**Promo codes.** Columns: `code` (unique, always upper-cased
on write), `discountType` (`percent` / `flat`),
`discountValue`, `maxUses`, `usageCount`, `expiresAt`,
`isActive`. The atomic redemption logic in
`promotion.service.ts` increments `usageCount` via conditional
UPDATE so concurrent redemption can't overshoot `maxUses`.

### `entities/systemSetting.entity.ts` (~46 lines)
**Admin-editable runtime configuration.** Columns: `key`
(unique), `value` (string — typed at read time), `valueType`
(`string` / `number` / `boolean`), `category`, `description`,
`isReadOnly`, `createdAt` / `updatedAt`. See
`config/settings.ts` for the full catalog.

---

## 4) `middleware/` — request-level guards

### `middleware/auth.middleware.ts` (~86 lines)
**`authenticate` middleware.** Reads `Authorization: Bearer
<jwt>`, calls `verifyToken` from `utils/jwt.ts`, loads the user
from the DB, attaches it as `req.user`. 401s if the token is
missing / invalid / refers to a blocked user / refers to a
soft-deleted user. Mounted in front of every authed route in
`app.ts`.

### `middleware/kioskAuth.middleware.ts` (~123 lines)
**`kioskAuth` middleware.** Same idea as `authenticate` but for
the appliance routes. Reads `X-Kiosk-Key` (or query
`?kiosk_key=` as a fallback for QR-code flows), looks up the
matching `Kiosk` row, attaches it as `req.kiosk`. 401 if no
match. Used by `/api/printer`, `/api/agent`,
`/api/participant-upload`.

### `middleware/rbac.middleware.ts` (~166 lines) — **CANONICAL**
**Role-based access control.** Exports a `Permission` enum
(more granular than `AdminPrivilege` on the User entity —
includes things like `MANAGE_SETTINGS`, `MANAGE_KIOSKS`,
`MANAGE_PRICING`, `REQUEUE_JOBS`, `ISSUE_REFUNDS`,
`MANAGE_PROMOTIONS`, `MANAGE_USERS`, `MANAGE_ROLES`) and
`requirePermission(p)` middleware that 403s the request if the
authed user is not a super_admin AND doesn't carry the matching
`adminPrivileges` entry. Mounted per-handler on the admin
routes.

### `middleware/bruteForce.middleware.ts` (~101 lines)
**`bruteForceProtection` middleware.** In-memory throttle on
`POST /api/printer/validate-code` to prevent code-guessing
attacks. Tracks attempts per kiosk-key + per IP; after N failed
codes within a window, locks out for a back-off period (the
kiosk's lockout screen reads this).

### `middleware/rateLimit.middleware.ts` (~93 lines)
**Global / per-route rate limiters** built on `express-rate-
limit`. Backed by Redis via `rate-limit-redis` if Redis is up,
falls back to in-memory otherwise. Currently applied to the
auth endpoints + `/api/cups/print`.

### `middleware/idempotency.middleware.ts` (~119 lines)
**`Idempotency-Key` header support.** Caches successful
responses keyed on `(userId, key)` for a TTL; replays the cached
response on retry instead of re-running the handler. Used on
`/api/cups/print` so CUPS retries (exit code 4) don't create
duplicate `PrintJob` rows.

---

## 5) `middlewares/` — DEAD CODE

`middlewares/rbac.middleware.ts` is **not imported anywhere**.
The active RBAC is in the singular `middleware/` directory.
This folder is a duplicate from an earlier refactor that never
got cleaned up. Safe to delete (but doing so should be a
separate commit, not a drive-by). Listed here for completeness.

---

## 6) `routes/` — HTTP surface

### `routes/customerAuth.routes.ts`
**Public** customer authentication.
- `POST /api/customer/auth/register` — creates user + wallet
  (with `newUserSignupBonus` if non-zero), generates an email
  verification token, optionally returns the dev token in the
  response body so e2e tests can grab it.
- `POST /api/customer/auth/login` — issues JWT.
- `POST /api/customer/auth/forgot-password` — email link.
- `POST /api/customer/auth/reset-password` — consume reset
  token.
- `POST /api/customer/auth/verify-email` — consume verification
  code (6 digits).
- `POST /api/customer/auth/resend-verification`.
- `POST /api/customer/auth/refresh` — refresh-token rotation.

### `routes/customerPrint.routes.ts`
**Authed.** The customer's logged-in surface.
- `GET /api/customer/print-jobs` — list jobs.
- `POST /api/customer/print-jobs` — single-file upload
  (`paymentMethod: 'wallet'` or `'paystack'`).
- `POST /api/customer/print-jobs/batch` — multi-file upload
  for personal-batch printing.
- `GET /api/customer/wallet` — balance + transactions.
- `POST /api/customer/wallet/topup/initialize` — kicks off a
  Paystack payment, returns the redirect URL.
- `GET /api/customer/wallet/topup/verify` — Paystack
  redirect-back handler.
- `GET /api/customer/print-token` — fetches the customer's
  CUPS-ingress print token (no rotation; returns `null` if
  never minted).
- `POST /api/customer/print-token/rotate` — mints a fresh
  80-char hex token, invalidates the old.
- `GET /api/customer/promotions/preview` — apply-promo
  preview without persisting (atomic redemption only happens
  at job-creation time).

### `routes/agent.routes.ts` (NEW this session)
**X-Kiosk-Key authed.** The pull-side API for the on-site
agent.
- `GET /api/agent/jobs/ready` — RELEASING jobs visible to this
  kiosk. Each item includes `totalPages` (added in Phase 15
  for SNMP confirmation), a JWT-signed `downloadUrl`, and
  `printConfiguration`.
- `GET /api/agent/jobs/:id/file?t=<jwt>` — JWT-token-authed
  byte stream. Token TTL 5 min.
- `POST /api/agent/jobs/:id/start` — atomic claim
  (`UPDATE … WHERE status=RELEASING`). 409 on race.
- `POST /api/agent/jobs/:id/complete` — reuses
  `printerExt.completePrintJob()` for counters/cleanup/audit
  consistency.
- `POST /api/agent/jobs/:id/failed` — marks FAILED with a
  reason.

### `routes/printer.routes.ts`
**X-Kiosk-Key authed.** The cloud-push and kiosk-pull entry
point for the touchscreen UI.
- `GET /api/printer/heartbeat` — keepalive.
- `POST /api/printer/validate-code` (brute-force-throttled) —
  user types the release code; the kiosk gets back job info or
  a generic error.
- `POST /api/printer/get-job` — full job detail for the kiosk
  preview screen.
- `PATCH /api/printer/progress` — printing-progress updates.
- `POST /api/printer/complete` — release a single job.
  **Branches on `printDispatchMode`:** kiosk-pull → mark
  RELEASING + return immediately; cloud-push → run the full
  policy + IPP/raw-9100 dispatch as before.
- `POST /api/printer/complete-batch` — group-batch fan-out.
  Returns 501 with a clear message in kiosk-pull mode (agent
  doesn't claim batches yet).

### `routes/cups.routes.ts`
**printToken authed** (no JWT). The CUPS-ingress entry point.
- `POST /api/cups/print` — multipart upload accepting `file`
  and `options=` (PPD-style key=value pairs the script
  forwards). Token via `Authorization: Bearer …` or
  `X-PrintLoop-Token`. (`?token=` is accepted only when
  `NODE_ENV !== 'production'` — see Phase 12 of the journal.)
  Idempotency keyed on the request header.

### `routes/payments.routes.ts`
**Paystack webhook receiver** (`POST /api/payments/webhook`
with raw-body HMAC verification using `paystack-signature`
header and SHA-512 over `req.rawBody`) plus support endpoints.

### `routes/groupSession.routes.ts`
**Mixed auth.** Group-print host endpoints.
- `POST /api/groups` (no auth — host identifies via hostId
  cookie) — create a session, returns `shareId` + organizer
  view URL.
- `GET /api/groups/:shareId` — load session for a participant.
- `GET /api/groups/:shareId/host` — load session for the host
  (richer detail).
- `POST /api/groups/:shareId/join` — participant joins,
  returns one-shot `uploadToken`.
- `POST /api/groups/:shareId/close` — host closes the session,
  generates the batch release code.

### `routes/participantUpload.routes.ts`
**`X-Upload-Token` authed.** One-shot upload endpoint for
group participants. Pricing computed from the live matrix; the
job is created in READY state with the host's `defaultOptions`
honored.

### `routes/adminAuth.routes.ts`
**Public.** Admin login. Just `POST /api/admin/auth/login` and
`POST /api/admin/auth/logout`. Admin accounts are
DB-managed only (no signup endpoint).

### `routes/admin.routes.ts`
**JWT-authed + RBAC.** The admin console's main API. Includes
endpoints for users, jobs, transactions, refunds (calls
`refund.service.ts`), reports, promotions, pricing,
SystemSettings (`GET /api/admin/settings`,
`PATCH /api/admin/settings/:key` — the latter is what flips
`printDispatchMode` from the admin Options tab), app log,
audit log.

### `routes/admin-kiosk.routes.ts`
**JWT-authed + RBAC `MANAGE_KIOSKS`.** Kiosk CRUD plus
`POST /api/admin/kiosks/:id/regenerate-key`,
`POST /api/admin/kiosks/:id/test-ping`. Test ping calls the
kiosk's IP at the configured IPP port to verify reachability.

### `routes/publicPricing.routes.ts`
**Anonymous read.** `GET /api/pricing/configs` returns the
live 24-cell matrix for the landing-page + group-participant-
upload pricing previews. Same data the admin edits, no JWT
required.

### `routes/devApi.routes.ts`
**Legacy mock router.** Mounted last at `/api` as a catch-all
fallback for the original customer-app mock surface
(wallet/stations/options). Bridges JWT auth onto an
in-process JSON dev store. Used by older customer-frontend
endpoints that haven't been migrated to the real TypeORM
surfaces yet.

---

## 7) `services/` — business logic

Each service is a stateless module of pure functions (or
classes with no instance state worth speaking of) that
encapsulate a single domain.

### `services/ipp.service.ts` (~387 lines)
**`IppService` — the printer driver.** Two key methods:
- `printJob(printerIp, source, jobName, opts)` — standard
  IPP `Print-Job` op over the `ipp` library. Handles IPP /
  IPPS, custom paths, IPP version 1.0/1.1/2.0, page-range
  encoding, media (paper) → IPP media keyword mapping, color
  mode, collation.
- `rawPrint(printerIp, source, jobName, opts, rawPort=9100)`
  — TCP socket + PJL prologue (UEL + `@PJL SET COPIES /
  DUPLEX / BINDING / RENDERMODE / PAPER / ORIENTATION` +
  `@PJL ENTER LANGUAGE=PDF`) + PDF bytes + UEL epilogue.
  This is the path that actually prints on the Sharp.
- `checkPrinterStatus(printerIp, opts)` — IPP `Get-Printer-
  Attributes` for `printer-state` / `printer-state-reasons` /
  `printer-is-accepting-jobs`.

The `openSocket()` private method picks between direct
`net.createConnection` and SOCKS5 routing via the Tailscale
proxy when `TS_SOCKS5_PROXY` is set. `resolveBytes(source)`
handles `{url}`, `{base64}`, `{buffer}`, `file://`, and
absolute on-disk paths — degrades gracefully in dev when a
file URL isn't fetchable.

### `services/printPolicy.service.ts` (~167 lines)
**The print-script policy engine.** Exports:
- `evaluatePrintPolicy(job: PolicyJob)` — applies the admin's
  configured rules (block on > N pages, force monochrome over
  N sheets, force duplex, deny color, blocked file extensions)
  and returns `{allow, deniedReason?, mutated, notes}`. The
  `/printer/complete` handler honors the mutated job options.
- `ippConnectionPrefs()` — pulls IPP transport settings
  (`ippSecure`, `ippPort`, `ippPath`, `ippVersion`,
  `ippTransport`, `ippRawPort`, `ippTlsRejectUnauthorized`)
  from SystemSettings, falling back to env vars.
- `printDispatchMode()` — `'cloud-push' | 'kiosk-pull'`. Reads
  the `printDispatchMode` setting (or `PRINT_DISPATCH_MODE`
  env override).

All three use the same 20-second in-memory cache on
`SystemSetting` reads. **After a `PATCH /admin/settings/:key`,
there's up to 20 s of staleness** before the change is
observed — documented as a known issue in the journal's
"open items."

### `services/pricing.service.ts` (~291 lines)
**Per-job cost calculation.** Exports `priceOf(pages, cfg,
pricingRows?)` — single source of truth used by every ingress
path (`customerPrint`, `cups`, `participantUpload`). Reads the
24-cell `PricingConfig` matrix to pick the per-page rate,
multiplies by `pages × copies`, applies duplex / quality
modifiers, then optionally subtracts a promotion. Also
exports `PrintConfiguration` type used across the codebase.

### `services/wallet.service.ts` (~47 lines)
**Atomic debit + credit.** Exports `tryDebit(userId, amount)`
returning `{debited, balance|null}`. Single conditional UPDATE:
```sql
UPDATE wallets
SET balance = balance - ?
WHERE userId = ? AND balance >= ?
```
`debited:true` iff `result.affected === 1`. Closes the
classic TOCTOU race where two concurrent prints could
double-spend a wallet. Also exports `credit(userId, amount)`
for top-ups / refunds.

### `services/promotion.service.ts` (~93 lines)
**Promo code redemption.** Exports `applyPromotion(code,
baseCost)` returning `{cost, discount, applied, reason?}`.
Looks up the (now always-uppercased) code, validates active +
not expired + uses remaining, atomically increments
`usageCount` via:
```sql
UPDATE promotions SET usageCount = usageCount + 1
WHERE id = ? AND (maxUses IS NULL OR usageCount < maxUses)
```
Returns the original cost with `reason: 'exhausted'` if the
race was lost.

### `services/paystack.service.ts`
**Paystack HTTP client.** Exports `initializeTransaction`,
`verifyTransaction`, `refundTransaction`, and a webhook-
signature verifier (`verifyWebhookSignature(rawBody,
signatureHeader)` — HMAC-SHA512 over the raw bytes using
`PAYSTACK_WEBHOOK_SECRET` or `PAYSTACK_SECRET_KEY` as
fallback).

### `services/refund.service.ts` (~180 lines)
**Wallet-refund orchestration.** Exports `refundJob(jobId,
reason, actorId)` — credits the wallet, marks the job
REFUNDED, files an `AuditLog` entry, optionally also issues
a Paystack refund if the original payment came from a card
top-up (admin policy switch).

### `services/groupSession.service.ts`
**Group-print session domain.** Exports
`getBatchPrintData(batchCode)` (used by
`/printer/complete-batch`), `closeSession`, `joinSession`,
and the cost-calculation per participant that honors the
host's `enforced` flag.

### `services/documentConvert.service.ts`
**File validation + conversion + page-range slicing.** Exports:
- `ensurePdf(bytes, fileName)`:
  1. Validates the MIME type and extension are in the
     `PDF | JPG | PNG` allow-list.
  2. PDF passes through byte-exact.
  3. JPG / PNG gets wrapped into an A4 page via pdf-lib.
  4. Throws `UnsupportedDocumentError` (code `UNSUPPORTED_DOCUMENT`)
     on anything else — route handlers map to HTTP 415.
- `countPages(bytes, fileName)` — authoritative page count
  from the bytes themselves (never trust client-supplied
  counts; they drive pricing/policy).
- `parsePageRange(rangeStr, totalPages)` — parses a user
  range expression (`"1"`, `"1-3"`, `"1,3,5"`, `"2-4,7,9-"`),
  clipped to `[1..totalPages]`, deduped, sorted.
  Open-ended right side (`"9-"`) means "9 to end." Returns
  `[]` on empty / malformed input so callers fall back to
  "every page."
- `extractPages(input, pageNumbers)` — builds a fresh PDF
  containing only the requested 1-based pages in the given
  order via `pdf-lib.copyPages`. Returns the original buffer
  unchanged when the selection is the identity (every page in
  order) so the printer keeps seeing byte-exact bytes.
- `isPrintableDocument(fileName, mime?)` — upload-gate
  predicate.
- `toGrayscale(bytes)` — shells out to Ghostscript (`gs` /
  `gswin64c` / `gswin32c`, or `GHOSTSCRIPT_BIN`) to force the PDF
  to DeviceGray (`-sColorConversionStrategy=Gray`). This is the
  firmware-proof B&W path: the Sharp ignores PJL color directives
  for PDF input, so the only guarantee is to strip color from the
  bytes. Returns the **original** bytes (with a warning) if gs is
  absent or conversion fails — a color print beats a failed print.
  Page count is preserved (SNMP confirm math unchanged). Added
  Phase 18; needs `ghostscript` on the host (Railway gets it via
  `01-backend/nixpacks.toml`).
- `ghostscriptAvailable()` — probe helper (cached) for whether a
  `gs` binary is callable.
- `UnsupportedDocumentError` class + `ALLOWED_LABEL` constant.

Used by:
- `routes/customerPrint.routes.ts` — validates uploads,
  counts pages.
- `routes/cups.routes.ts` — same.
- `routes/participantUpload.routes.ts` — same.
- `routes/printer.routes.ts` — calls `ensurePdf` at dispatch
  time on the cloud-push path.
- `routes/agent.routes.ts` — calls `ensurePdf` +
  `extractPages` at the signed-download endpoint so the
  kiosk-pull agent always receives a print-ready PDF with the
  customer's page range already applied (added Phase 17).

### `services/kiosk.service.ts`
**Kiosk CRUD logic.** Wraps the TypeORM repo with the
"regenerate API key" + heartbeat-update + status-derivation
business rules. Called from the admin-kiosk routes and the
heartbeat handler in `printerExtensions.controller.ts`.

### `services/printerExtensions.service.ts` (~164 lines)
**The post-print cleanup orchestrator.** Exports
`completePrintJob({code, kioskId, kioskName, cost,
totalPages})` — flips the job to DONE, increments the kiosk's
`printsLifetime`/`pagesLifetime`, enqueues a `fileCleanup`
job in BullMQ if `autoDeleteAfterPrint` is on, writes an
`AuditLog` entry. Both `/printer/complete` (cloud-push) and
`/agent/jobs/:id/complete` (kiosk-pull) end here.

### `services/adminDashboard.service.ts`
**Reporting-tab aggregates.** Heavy SQL that the admin
Reports tab calls — daily-print counts, top stations,
revenue, wallet balances histogram, audit-log paging.

### `services/audit.service.ts`
**Append-only AuditLog writer.** Exports `audit(action,
actor, entityType?, entityId?, detail?)` — convenience helper
that handles the "actorName from actorId" lookup so call
sites don't repeat it.

### `services/email.service.ts`
**Transactional email.** Nodemailer-backed. Exports
`sendVerification`, `sendPasswordReset`, `sendReceipt`,
`sendRefund`, `sendGroupInvite`, `sendLowBalance`. Reads
`SMTP_*` env. If `emailNotificationsEnabled` is false in
SystemSettings, every send no-ops (with a log line).

### `services/sms.service.ts`
**Termii client.** Exports `sendSms(phoneNumber, message)`.
Reads `TERMII_API_KEY` and `TERMII_SENDER_ID`. If
`smsNotificationsEnabled` is false, no-ops.

### `services/qrCode.service.ts`
**QR code generation.** Exports `qrPng({payload, size})` and
`qrDataUrl(payload)`. Used by `/customer/print-jobs` to
embed kiosk-ready QR codes in receipts / the customer's
PrintJobs page.

---

## 8) `controllers/` — thin HTTP→service adapters

Each controller exports `(req, res, next)` handlers that
parse the request, call into a service, and serialize the
result. **Most are unsurprising glue.** The exceptions:

### `controllers/printerExtensions.controller.ts` (~101 lines)
The handlers wired into `/api/printer/heartbeat`,
`/validate-code`, `/get-job`, `/progress`. Contains the
brute-force-friendly response shaping (generic errors so a
guesser can't tell "wrong code" from "rate-limited" from
"job already done").

### `controllers/kiosk.controller.ts` (~453 lines)
The largest controller — handles the full kiosk CRUD,
heartbeat upserts, status transitions, queue updates, and
the test-ping logic. Called from `admin-kiosk.routes.ts`.

### `controllers/groupSession.controller.ts` (~184 lines)
Group-session CRUD + the deadline-passed transitions.

### `controllers/auth.controller.ts` (~82 lines)
Login / register / verify wrapping
`customerAuthRoutes`/`adminAuthRoutes`. Where `req.user` is
first attached on a successful auth.

### `controllers/admin.controller.ts` (~18 lines)
Just admin-listing stubs (most admin logic is in
`admin.routes.ts` directly).

### `controllers/adminPrivilege.controller.ts` (~67 lines)
GET/SET for the `adminPrivileges` array on a User row.

### `controllers/job.controller.ts` (~75 lines)
The shared listing handler used by the customer's PrintJobs
page and the admin Jobs tab (with different filters).

### `controllers/wallet.controller.ts` (~49 lines)
GET balance + transactions, POST top-up
(dev/mock path — production uses
`/customer/wallet/topup/initialize` + Paystack).

---

## 9) `utils/` — pure helpers

### `utils/env.ts` (~32 lines)
Zod schema validation of `process.env`. Exports
`validateEnv()` which logs every missing/invalid field then
`process.exit(1)`. Run on every cold boot. **Required:**
`JWT_SECRET` (≥32 chars), `PAYSTACK_SECRET_KEY` (starts with
`sk_`), `DATABASE_NAME`, `DATABASE_HOST`, `DATABASE_USER`.

### `utils/jwt.ts` (~24 lines)
Wraps `jsonwebtoken`. Exports `JWT_SECRET` (env + dev
fallback), `JWT_EXPIRES_IN`, `signAccessToken(payload)`,
`verifyToken(token)`. Used everywhere a JWT is read or
written (customer auth, admin auth, and the agent's signed
file-download URLs).

### `utils/releaseCode.ts` (~23 lines)
Exports `RELEASE_CODE_ALPHABET` (the 32-char Crockford-ish
set excluding ambiguous chars like `I`, `O`, `1`, `0`) and
`makeCode(n=6)`. Single source of truth — used by
`customerPrint`, `cups`, `participantUpload`, and group-batch.

### `utils/limits.ts` (~23 lines)
Exports `enforceFileLimits(fileSize, pageCount)` and
`getLimits()`. Reads `maxFileSizeMb` and `maxPagesPerFile`
from SystemSettings. Throws specific errors that route
handlers map to HTTP 413 / 422.

### `utils/fileStore.ts` (~77 lines)
**File persistence.** Exports `UPLOAD_DIR`, `saveBuffer(buf,
fileName)` (returns the path/URL), `loadDocumentBytes(url)`
(handles local paths + Cloudinary URLs + `file://` + base64),
`deleteFile(url)`. Cloudinary is used when
`CLOUDINARY_*` env is set; otherwise files land in
`data/uploads/`.

---

## 10) `workers/` — BullMQ background jobs

Workers attach to the Redis queue (see `config/redis.ts`).
**They silently no-op if Redis is unreachable** — the API
still serves requests, just without async background work.

### `workers/queues.ts` (~72 lines)
Exports the `Queue` instances. The producers (e.g.
`printerExtensions.service.ts`) push jobs here.

### `workers/fileCleanup.worker.ts` (~117 lines)
Removes uploaded files N hours after job completion (config:
`documentRetentionHours`) or immediately if
`autoDeleteAfterPrint` is on. Honours soft-delete semantics
(the `File` row stays for audit, just the bytes go).

### `workers/scheduled.worker.ts` (~101 lines)
Cron-like worker that runs every minute. Expires unclaimed
READY jobs after `jobExpiryHours` (auto-refunding the wallet
via `refund.service.ts`), prunes dead heartbeats, marks
stale kiosks `offline`.

### `workers/watermark.worker.ts` (~127 lines)
**Historical.** Group prints used to watermark each
participant's document. The watermark code path was removed
from the live flow earlier in the session (see
JOURNAL.md Phase 0 / pre-session tasks #30) but the worker
file is still here — it's a no-op now. Safe to delete; doing
so should be a separate commit.

---

## 11) `migrations/` — TypeORM DDL

The repo runs with `synchronize:true`, so migrations are
**not the primary schema-change path** — adding a column to
an entity and rebooting is. These two are kept for cases
where data migration (not just schema) is needed.

### `migrations/1714500000000-CreateKiosksTable.ts`
Initial Kiosks table — superseded by `synchronize:true`
once the `Kiosk` entity was added. Idempotent (checks if
the table exists first).

### `migrations/1714600000000-AddSchemaGapsAndNewEntities.ts`
Fills schema gaps for entities added between deploys —
also superseded by `synchronize:true`. Kept as a reference
for what DDL a fresh setup needs if you ever switch off
`synchronize`.

---

## 12) `scripts/` — operator + dev tooling

### `scripts/virtualPrinter.cjs` (~150 lines)
**A fake IPP printer.** Listens on `IPP_VPRINTER_PORT`
(default 6310) and:
1. Decodes incoming IPP `Print-Job` requests with the same
   `ipp` library the IppService uses (guaranteed wire-
   compatible).
2. Extracts the embedded document bytes.
3. Writes them to `data/printed/<timestamp>__<job-name>.pdf`.
4. Returns a proper IPP success response.

Used by every e2e test that needs a printer without a
physical device. Run with `node scripts/virtualPrinter.cjs`.

### `scripts/probePrinter.cjs`
Standalone Node script — pings a printer IP, fetches IPP
attributes, exits with the model + state. Useful for
debugging "is this thing on" without spinning up the whole
backend.

### `scripts/seedKiosks.ts`
Idempotent kiosk-row seeder. Useful when restoring a dev DB
from scratch without running the full `runSeed()`.

### `scripts/e2eCustomerTest.cjs`
End-to-end: register → JWT → multipart upload of a real
generated PDF → assert real PrintJob → POST
`/printer/complete` to the virtual printer → assert
byte-exact bytes land in `data/printed/`.

### `scripts/e2eBatchTest.cjs`
Same shape but for personal-batch (2 PDFs, 1 code, fan out).

### `scripts/e2ePrintTest.cjs`
Group flow: create session → join as participant → upload →
release at the kiosk → byte-exact.

### `scripts/e2eGroupSettingsTest.cjs`
Exercises the host's `enforced` toggle on group session
defaults.

### `scripts/e2eCupsTest.cjs`
Token mint → POST `/api/cups/print` → assert config parsed
from PPD options → assert wallet debited → assert byte-exact
at the kiosk. Plus the wallet-race and idempotency blocks
added with the security pass.

### `scripts/e2ePromotionTest.cjs`
Fires 10 concurrent `applyPromotion` calls against a promo
with `maxUses=3`, asserts `usageCount === 3` exactly.

### `scripts/e2eWebhookSignatureTest.cjs`
Asserts that the Paystack webhook receiver rejects bad
HMACs and accepts good ones — both with and without
`PAYSTACK_WEBHOOK_SECRET` set (so the fallback to
`PAYSTACK_SECRET_KEY` is exercised).

### `scripts/e2eAgentPullTest.cjs` (NEW)
End-to-end of the kiosk-pull architecture: customer upload →
flip `printDispatchMode` to `kiosk-pull` → POST
`/printer/complete` → assert `status=releasing` → GET
`/agent/jobs/ready` → POST `/agent/start` → fetch the signed
file URL, assert byte-exact SHA → POST `/agent/complete` →
assert second `/start` returns 409.

### `scripts/liveAgentSmoke.cjs` (NEW)
Doesn't run a virtual printer or assertions — just walks
the full cloud → release → status-poll flow so you can run
it against a real agent printing to a real printer and
watch the kiosk → cloud transitions in real time.

---

## 13) `data/` — runtime state (gitignored)

Everything under `data/` is generated and never committed.
The `.gitignore` rules are listed in the repo-root
`.gitignore`.

- `data/printloop.sqlite` — TypeORM's SQLite database file.
  On Railway, this lives on the persistent volume mounted at
  `/app/data/`.
- `data/uploads/` — uploaded customer documents when
  Cloudinary is not configured. Real user content; never
  commit, never log paths in plaintext.
- `data/printed/` — test artefacts captured by
  `scripts/virtualPrinter.cjs`. Used by the e2e suite for
  byte-exact assertions.
- `data/dev-store.json` — legacy in-process JSON store used
  by the `devApi.routes.ts` mock router.
- `data/tailscale/` (Railway only) — cached `tailscaled` +
  `tailscale` binaries. Persists across deploys so cold
  boots after the first stay under the 180 s healthcheck.
- `data/tailscaled.state`, `data/tailscaled.log` — Tailscale
  runtime state.

---

## Maintenance rule

When you add a backend file, **add its entry here in the same
commit**. Use the same structure: 1-line tagline → details →
who calls it → exported surface → any gotchas. When you
rename a file, edit the existing entry. When you delete a
file, strike through with `~~text~~` and append a line noting
the date + commit hash of the removal — do NOT silently delete
the entry. That way future readers can grep this file for "why
did this used to exist?" answers.

When a new directory appears (e.g. `services/printer-confirm/`),
add a numbered section and update the table of contents.
