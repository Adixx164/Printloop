# PrintLoop — How Everything Works

> Canonical technical reference for the whole PrintLoop system: architecture,
> data model, every flow, configuration, and how to run/build/verify it.
> Reflects the codebase as actually built and verified.

---

## 1. What PrintLoop is

PrintLoop is a self-service campus printing platform. A user uploads a
document from a web app, configures and pays for it, and receives a
**24‑hour release code + QR**. They walk to any PrintLoop **kiosk**
(a Linux box attached to a printer), enter/scan the code, and the document
prints. It also supports **personal batch** printing (many files, one code)
and **group printing** (a host shares a link; participants upload, configure
and pay for their own page; the host prints the whole batch with one token).
An **admin console** gives operators full control of users, jobs, kiosks,
pricing, promotions, refunds, settings, print policy and audit.

---

## 2. The three deployables

| App | Folder | Stack | Port (dev) |
|---|---|---|---|
| **Backend API** | `01-backend` | Express + TypeScript (run via `tsx`), TypeORM + SQLite | `4000` |
| **Customer web app** (incl. admin console) | `printloop-new-frontend` | React 18 + Vite + Redux Toolkit Query + Tailwind | `5173` |
| **Kiosk panel** | `printloop-kiosk` | Single static HTML page (browser kiosk mode) | static `8080` |

The **admin console** is part of the customer web app bundle but is a fully
separated route + layout (no customer chrome).

---

## 3. Backend architecture — the two API layers (read this first)

The single Express app (`01-backend/app.ts`) mounts **two different API
layers**. This split is the most important thing to understand:

### 3a. Mock layer — `devApi.routes.ts` (mounted at `/api`)
- Backed by a **JSON file**: `01-backend/data/dev-store.json`.
- Powers the **customer web app**: register/login, print jobs, wallet,
  stations, group-session mock, and **`POST /api/kiosk/release`**.
- Auth = **opaque session tokens** (random Bearer strings), not JWT.
- Seeded with a demo user, jobs, wallet, stations, group session.

### 3b. Real layer — TypeORM + SQLite (`01-backend/data/printloop.sqlite`)
`synchronize: true` (schema auto-created from entities; no migrations needed).
Mounted, in order, **before** the mock catch-all:

| Mount | Router | Auth |
|---|---|---|
| `/api/admin/auth` | `adminAuth.routes` | public `POST /login`, JWT `GET /me` |
| `/api/admin/kiosks` | `admin-kiosk.routes` | JWT + RBAC |
| `/api/admin` | `admin.routes` | JWT + RBAC |
| `/api/groups` | `groupSession.routes` | guest-host capable (`optionalAuth`) |
| `/api/participant-upload` | `participantUpload.routes` | upload token header |
| `/api/printer` | `printer.routes` | kiosk API key (`X-Kiosk-Key`) |
| `/api/payments` | `payments.routes` | JWT (init) / public (webhook) |
| `/api` | `devApi.routes` | session token (mock layer) |

> **Consequence:** the customer app authenticates with mock session tokens and
> therefore **cannot call the JWT‑protected admin endpoints**. The admin
> console logs in separately (`/api/admin/auth/login` → JWT). Group printing
> bridges this with a **guest host id** (see §7).

`app.ts` imports `reflect-metadata` (required for TypeORM decorators) and
`server.ts` initialises the DataSource, runs the seed, then
`ensureSystemSettings()` before listening.

---

## 4. Data model (TypeORM entities — `01-backend/entities`)

SQLite-friendly column types (`simple-enum`, `simple-json`, `datetime`).

- **User** — name, email, phone, passwordHash/salt, `role` (`user` /
  `admin` / `super_admin`), `adminPrivileges[]`, `isBlocked`, `blockReason`,
  `lastLoginAt`.
- **Wallet** / **Transaction** — balance + ledger (`topup/print/refund/credit`).
- **Payment** — money-movement record the admin reports on (amount, status
  `SUCCESS/PENDING/FAILED`, method, reference, refund fields — all nullable).
- **PrintJob** — `code` (unique), `cost`, `status`
  (`pending → ready → printing → done`, plus `failed/expired/refunded`),
  `JobType` (`single/personal_batch/group_batch`), `printConfiguration`
  (json), `totalPages`, `pagesCompleted`, `groupSessionId`, `watermarkId`,
  `printerId/printerName`, `completedAt`. `userId`/`fileId` nullable (guest
  group jobs).
- **Kiosk** — name, location, `apiKey`, `status`
  (`ACTIVE/MAINTENANCE/OFFLINE/DISABLED`), counters, `lastSeenAt`.
- **File** — fileName, mimeType, sizeBytes, fileURL, watermarkedUrl,
  pageCount, `participantId`.
- **GroupSession** — `hostUserId` (plain id, **no FK** — supports guest
  hosts), `groupName`, `deadline`, `status` (`open/closed`), `shareUrl`,
  `shareId`, `watermarkPrefix`, `batchCode` (6‑char), `batchToken`,
  `closedAt`, `defaultOptions` (json incl. `enforce`, `watermark`).
- **GroupParticipant** — name/email/phone, `watermarkId`, `uploadToken`,
  `status` (`JOINED/UPLOADED/PAID/…`), `printJobId`.
- **PricingConfig** — `paperSize`×`colorType` unique, `pricePerPage`,
  `duplexMultiplier`, `highResolutionMultiplier`, `isActive`, `currency`.
- **SystemSetting** — `key/value/valueType/category/description/isReadOnly`.
- **Promotion**, **AuditLog**.

---

## 5. Authentication & RBAC

- **Customer (mock):** `POST /api/auth/login` → `{ user, tokens }`; opaque
  `accessToken` stored in Redux (`authSlice`) and sent as `Bearer`.
- **Admin/real:** `POST /api/admin/auth/login` → **JWT** (HS256,
  `utils/jwt.ts`, `JWT_SECRET` with a safe dev fallback). `authenticate`
  middleware verifies the JWT, loads the `User`, sets `req.user`.
- **RBAC:** `middleware/rbac.middleware.ts` — `Permission` enum +
  `requirePermission(...)`. Maps `User.role` + `adminPrivileges` to
  permissions, sets `req.admin`. **`super_admin` bypasses every check.**
  Permissions include: `view_dashboard, view/requeue_jobs,
  view/manage_pricing, view/manage_promotions, view_transactions,
  issue_refunds, view/manage/block_users, manage_roles, view/export_reports,
  view/manage_settings, view_audit_log, view/manage_kiosks`.
- **Guest group hosts:** a random `hostId` kept in the browser's
  `localStorage`; group host routes use `optionalAuth` and scope by
  `hostId`. No login required to host a group.
- **Kiosk:** `kioskAuth` middleware validates the `X-Kiosk-Key` header
  against `Kiosk.apiKey` and attaches `req.kiosk`.

---

## 6. Admin API & console

**37 endpoints** (see the in-app list or §"Admin controls"): Auth,
Dashboard stats, Jobs (list/requeue/status), Group sessions, Pricing
(GET/POST/PATCH/DELETE), Promotions, Transactions, Refunds, Users
(list/detail/block/role/privileges), Reports (revenue/kiosks),
Settings (GET / PATCH `:key`), Audit logs, Kiosks (CRUD + regenerate-key).

The console is **fully separated**: `AdminLayout` (no marquee/customer
nav/footer), an **“ADMIN →” button** on the sign-in page, and `AdminProtectedRoute`
that only allows `admin`/`super_admin`. Tabs are wired to the real backend
(Dashboard, Users & Admins, Printers/Kiosks, Jobs, Pricing & Charging,
Reports, Options/Settings, App Log).

---

## 7. Group printing (real backend, guest-host)

1. **Host** (customer app → Groups): names the session, sets a **deadline**,
   picks default options, optionally enables a **custom watermark word** →
   `POST /api/groups` (guest `hostId`). Gets a `shareId` + link
   `…/join/:shareId`.
2. **Participant** opens the public **`/join/:shareId`** page (no login):
   `GET /api/groups/share/:shareId` → join (`POST /api/groups/:shareId/join`,
   returns `uploadToken` + `watermarkId`) → upload + configure + **live
   preview** → pay → `POST /api/participant-upload/upload` creates a
   `PENDING` `PrintJob` (cost from `PricingConfig`, with flat-rate fallback).
3. **Host** closes the session → 6‑char **batch code** + token + QR; the
   kiosk prints the whole paid batch with that one code.

The host dashboard (`SessionCard`) polls `GET /api/groups/:id?hostId=` for
participants/summary.

---

## 8. Printing pipeline — policy → IPP/IPPS

When a kiosk releases a code (`POST /api/kiosk/release`):

1. **Print-script policy** (`services/printPolicy.service.ts`,
   `evaluatePrintPolicy`) runs first. It can **BLOCK** (max pages,
   blocked file types, deny colour) → `403 PRINT_POLICY_DENIED`, or silently
   **MUTATE** the job (clamp copies, force monochrome over N sheets, force
   duplex over N pages). All rules are admin settings (category **Printing**).
2. If allowed, the (possibly mutated) job is dispatched via
   **`services/ipp.service.ts`** with full IPP attributes: `copies`, `sides`
   (`two-sided-long-edge` for duplex), `print-color-mode`, `media`
   (A4/A3/Letter/Legal), `multiple-document-handling`+`sheet-collate`
   (collate), and `page-ranges`.
3. **IPPS (IPP over TLS):** when `ippSecure` is on, the printer URL becomes
   `ipps://host:port/ipp/print` over HTTPS with `rejectUnauthorized`
   (default off for self-signed appliance certs) and an optional CA from
   `IPP_CA_CERT`. Bytes resolve from URL/base64/buffer; non-fetchable dev
   URLs log the exact attributes instead of failing.

`ippConnectionPrefs()` reads `ippSecure/ippPort/ippTlsRejectUnauthorized`
from settings (env fallback). Settings are cached **~20 s**, so policy/IPPS
changes take effect within 20 s of saving in the admin Options tab.

---

## 9. Payments

- **Wallet** (mock layer): balance + ledger; top-up endpoints; jobs paid
  from wallet deduct balance, expired unprinted jobs auto-refund.
- **Paystack** (`services/paystack.service.ts`, `/api/payments`):
  `initialize` (real hosted-checkout URL when `PAYSTACK_SECRET_KEY` is set,
  otherwise a **dev mock URL**) and an **idempotent** `webhook`
  (`charge.success` credits the wallet once per reference).
- In the customer UI, payment is **Wallet** or **Paystack** only (Paystack
  covers card/transfer/USSD/bank in its gateway).

---

## 10. Customer web app

**Routing/layouts (`App.tsx`):**
- Public: Landing, `/kiosk`, **`/join/:shareId`** (participant page).
- `AuthLayout`: login/register/verify/forgot (login has the **ADMIN →**
  button).
- `AdminLayout`: standalone admin console.
- `AppLayout`: customer app (marquee, nav, **sticky footer** via flex
  column).

**Shared components:**
- **`PrintPreview`** (`pdfjs-dist`) — renders the document exactly as it will
  print: only the selected **page range**, **grayscale** when B&W, copies
  noted; auto-detects page count (PDF/image); manual fallback for
  unparseable formats.
- **`QrBlock`** — any QR, with **SAVE PNG** (white-padded PNG) and **SHARE**
  (Web Share API with the image *and* the link; clipboard fallback).

**New Print** (4 steps): Upload → Configure + Review → **Summary then
Preview** → Token (code + shareable QR). Page count is auto; preview
reflects colour + page range + copies.

**Batch**: many files; each has a **Customize** button (own config + live
preview) or uses the editable **default**; pay → **one combined code/QR**
for all documents; **Collate** toggle.

**Group**: host create (name + deadline + defaults + optional custom
watermark) → real link/QR; participant `/join` page does upload + configure
+ preview + pay.

Other pages: Dashboard, My Jobs, Wallet, Stations, Settings.

---

## 11. Kiosk panel (static web page)

- `printloop-kiosk/index.html` — a single self-contained static page. No
  Electron, no build step. First run: set **API base URL** + **kiosk key**
  (`X-Kiosk-Key`). Flow: enter/scan code → validate → preview → release.
  Online/offline indicator, brute-force lockout screen, ⚙ re-pair.
- Deploy: serve the folder on the kiosk machine (`npm run serve` →
  `npx serve -l 8080 .`, or any static host) and open it **full-screen in a
  browser kiosk mode** (e.g. `chromium --kiosk http://localhost:8080`).

---

## 12. Configuration (`01-backend/.env.example`)

SQLite is the default DB — **no DB server needed**. Redis is optional
(queues/cache no-op without it). MySQL/Postgres references in the env
example are historical.

Relevant vars: `NODE_ENV`, `PORT` (4000), `JWT_SECRET` (dev fallback if
unset), `PAYSTACK_SECRET_KEY` (mock if unset), `FRONTEND_URL`,
`ALLOWED_ORIGINS`, and the IPPS additions **`IPP_SECURE`**, **`IPP_PORT`**,
**`IPP_TLS_REJECT_UNAUTHORIZED`**, **`IPP_CA_CERT`**.

Runtime-tunable **System Settings** (admin Options tab, 37 keys across
**Storage, Jobs, Printing, Payments, Notifications, Branding, System**) are
defined in `config/settings.ts`. `ensureSystemSettings()` runs every boot
and inserts only **missing** keys (never overwrites admin-changed values),
so adding a new option = add one entry + restart.

---

## 13. Run / build / verify

**Backend**
```
cd 01-backend
npm install
npm run dev        # tsx watch → http://localhost:4000  (health: /health)
npm run typecheck  # tsc --noEmit  (expected: 0 errors)
```

**Customer web app**
```
cd printloop-new-frontend
npm install
npm run dev        # Vite → http://localhost:5173
npm run build      # tsc -b && vite build → dist/
```

**Kiosk**
```
# Kiosk (static page — no build):
cd printloop-kiosk && npm run serve       # → http://localhost:8080
# then open it full-screen: chromium --kiosk http://localhost:8080
```

**Test credentials**
- Admin: `admin@printloop.test` / `Admin1234!`  (super_admin)
- Demo user: `student@printloop.test` / `Password1!`
- Kiosk key: not fixed — get one from **Admin → Printers** (regenerate key)
  or read `kiosks.apiKey` from `data/printloop.sqlite`.

**Two data stores (don't confuse them):** customer/kiosk mock uses
`data/dev-store.json`; admin/groups/printer/payments use
`data/printloop.sqlite`. Codes created in the customer app live in the JSON
store; admin “Jobs” reads the SQLite store.

---

## 14. Known scope & deliberate decisions

- **Mock vs real split** is intentional (customer demo runs without DB
  setup; admin/groups/printing are real TypeORM).
- **Superseded duplicates excluded from build** (`tsconfig.json` exclude):
  old `controllers/{auth,job,wallet,admin,adminPrivilege}.controller.ts`
  and the duplicate `middlewares/rbac.middleware.ts` — replaced by the live
  devApi/adminAuth/admin.routes + `middleware/rbac`. Not deleted; just not
  compiled.
- **Workers** (BullMQ) and **Redis** are optional; without Redis they are
  safe no-ops.
- **Participant “pay”** is a confirm action that creates a `PENDING` job —
  there is no per-guest charge rail (guests have no wallet/Paystack
  identity).
- **`pdfjs-dist`** added for exact preview; `qrcode.react` for QR.

---

## 15. Directory map

```
printloop for anti-gravity/
├─ 01-backend/                 Express + TypeORM API
│  ├─ app.ts, server.ts        bootstrap (DB init → seed → settings → listen)
│  ├─ config/                  database (SQLite), redis (optional), seed, settings catalog
│  ├─ entities/                TypeORM models (User, PrintJob, GroupSession, …)
│  ├─ routes/                  devApi (mock) + admin/adminAuth/admin-kiosk/
│  │                           groupSession/participantUpload/printer/payments
│  ├─ controllers/             kiosk, groupSession, printerExtensions, …
│  ├─ services/                ipp, printPolicy, groupSession, refund,
│  │                           paystack, qrCode, email, sms, adminDashboard, …
│  ├─ middleware/              auth (JWT), rbac, kioskAuth, bruteForce, …
│  ├─ workers/                 BullMQ queues (Redis-optional, no-op stubs)
│  └─ data/                    dev-store.json (mock) + printloop.sqlite (real)
├─ printloop-new-frontend/     React SPA + admin console
│  └─ src/{pages,components,store,routes,constants}
├─ printloop-kiosk/            single static kiosk page (index.html)
└─ PRINTLOOP-HOW-IT-WORKS.md   (this document)
```

---

## 16. Verified status

- Backend `tsc --noEmit`: **0 errors**. Frontend `tsc --noEmit`: **0
  errors**. Frontend production build: **OK**.
- Smoke-tested live: admin login + all admin GETs (200); pricing
  create/delete; full guest-host group flow (create → share → join →
  participant upload → host details → close, 6-char batch code); print
  policy **block** (403) and **mutate** (forced monochrome) ; **IPPS**
  dispatch logged; expanded settings catalog (37 keys, “Printing”
  category).

---
*Generated as the canonical reference. Keep it next to the code and update
it when flows change.*
