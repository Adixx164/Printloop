# PrintLoop — Developer Handover

For the engineer taking this over. Read this first, then
`PRINTLOOP-HOW-IT-WORKS.md` (architecture) and `PRODUCTION-READINESS.md`
(infra/deploy). This doc = **what's done, what's left, and the landmines.**

---

## 0. TL;DR

PrintLoop is a self‑service campus printing platform: customer uploads a doc →
pays → gets a code/QR → walks to a kiosk → kiosk tells the backend → backend
runs print policy → fetches the stored PDF → sends it to the printer over
IPP/IPPS. Group printing and an admin console are included.

**Maturity:** a working prototype with the **full print path verified
byte‑exact end‑to‑end** (customer *and* group), against a virtual IPP printer.
Backend & frontend both `tsc` clean (0 errors). It is **not yet
production‑deployed** — that's infra/ops + a short engineering backlog (§4).

---

## 1. Repo map

```
01-backend/            Express + TypeScript (run via tsx), TypeORM + SQLite
  app.ts / server.ts   bootstrap (DB init → seed → settings → listen)
  config/              database, redis (optional), seed, settings catalog
  entities/            TypeORM models
  routes/              see §2 — TWO API layers
  services/            ipp, documentConvert, printPolicy, groupSession, paystack…
  middleware/          auth (JWT), rbac, kioskAuth, bruteForce
  utils/               fileStore (uploads + byte loader), jwt
  scripts/             virtualPrinter.cjs, e2e*Test.cjs, probePrinter.cjs
  data/                dev-store.json (mock) + printloop.sqlite (real) + uploads/ printed/
printloop-new-frontend/ React + Vite + RTK Query + Tailwind (customer + admin SPA)
printloop-kiosk/       single static kiosk page (index.html) — browser kiosk mode
PRINTLOOP-HOW-IT-WORKS.md / PRODUCTION-READINESS.md / DEVELOPER-HANDOVER.md
```

---

## 2. The #1 thing to understand: two API layers

`app.ts` mounts both. **Do not confuse them.**

- **Real layer (TypeORM + SQLite `data/printloop.sqlite`)** — the production
  path. JWT auth. Routes: `/api/customer/auth`, `/api/customer`,
  `/api/admin/*`, `/api/groups`, `/api/participant-upload`, `/api/printer`,
  `/api/payments`, `/api/files` (static).
- **Mock layer (`devApi.routes.ts`, JSON `data/dev-store.json`)** — legacy,
  still serves the customer **wallet / stations / print‑options** only. Its
  `requireAuth` was **bridged to accept the real JWT** so it keeps working for
  a logged‑in customer.

A normal customer **single print** is now fully on the **real** layer
(register → JWT → file upload → real `PrintJob` → kiosk prints it). Wallet
balance/top‑up and station list are still mock (bridged).

---

## 3. Run it & prove it (5 min)

```
cd 01-backend && npm ci
node scripts/virtualPrinter.cjs        # terminal 1 — fake printer → data/printed/
npm run dev                            # terminal 2 — API on :4000
node scripts/e2eCustomerTest.cjs       # customer: register→upload→kiosk→BYTE-EXACT
node scripts/e2ePrintTest.cjs          # group: host→join→upload→kiosk→BYTE-EXACT
npm run typecheck                      # 0 errors

cd ../printloop-new-frontend && npm ci && npm run dev   # :5173 ; npm run typecheck → 0
```
Test creds: admin `admin@printloop.test` / `Admin1234!`. Kiosk key: Admin →
Printers → Add/Regen Key. Probe a real printer: `node
scripts/probePrinter.cjs <ip> [--path=/printers/<q>] [--ipps]`.

---

## 4. What's DONE (verified)

| Area | State | Key files |
|---|---|---|
| **Customer flow real** | register/login (JWT) + multipart upload → real `PrintJob` → kiosk byte‑exact | `routes/customerAuth.routes.ts`, `routes/customerPrint.routes.ts`, FE `authApi`/`jobsApi`/`NewPrintPage` |
| **Group printing** | guest‑host link → join/upload/pay → batch code → kiosk | `routes/groupSession.routes.ts`, `participantUpload.routes.ts`, FE `JoinPage`/`GroupPrintPage` |
| **Admin console** | separate app/layout, 37 endpoints, kiosk CRUD + **API‑key reveal/regen** | `routes/admin*.ts`, FE `pages/admin/*`, `PrintersTab` |
| **Print policy + IPP/IPPS** | block/mutate rules; full IPP attrs; TLS | `services/printPolicy.service.ts`, `services/ipp.service.ts` |
| **Documents** | **PDF + JPG/PNG only**; PDF byte‑exact, images→PDF (pdf‑lib); rejected at upload **and** kiosk otherwise | `services/documentConvert.service.ts` |
| **File storage** | uploads persisted, served `/api/files`, kiosk fetches | `utils/fileStore.ts` |
| **Kiosk** | single static `index.html`; browser kiosk mode (no Electron). Release pipeline runs in the backend (`/api/printer/*`) | `printloop-kiosk/`, `routes/printer.routes.ts` |
| **Settings/entities/RBAC** | idempotent settings catalog; entities; permission RBAC | `config/settings.ts`, `entities/`, `middleware/rbac.middleware.ts` |
| **Docs** | architecture + prod readiness + this | 3 root `*.md` |

Verified byte‑exact (SHA‑256) to a virtual IPP printer for **both** customer
and group paths. `tsc` clean both sides.

---

## 5. What's LEFT (engineering backlog, prioritized)

> Most of these are gated on infra (see `PRODUCTION-READINESS.md` §2).

**P1 — required for production**
1. **DB → Postgres + migrations.** Switch `config/database.ts` off SQLite;
   disable `synchronize`; generate TypeORM migrations. *(gated on managed DB)*
2. **Payments real.** Verify Paystack **webhook signature**; move customer
   wallet/transactions fully onto real `Wallet`/`Transaction` (customer
   endpoint already debits a real wallet best‑effort); guest‑participant
   charge rail. `services/paystack.service.ts`, `routes/payments.routes.ts`.
3. **Auth completeness.** Email verification + password reset for real
   customers (currently auto‑verified; `forgot/verify` still hit mock).
   Needs email provider. `customerAuth.routes.ts`, FE auth pages.
4. **Security hardening.** Rate‑limit on auth, lock CORS, secret management,
   upload virus/type scanning, `JWT_SECRET` must be set (dev fallback exists).
5. **Real‑hardware printer test.** Only virtual IPP verified — validate
   fonts/duplex/colour/media/large jobs on a real printer/CUPS.

**P2 — important**
6. **Storage adapter.** S3/Cloudinary in `utils/fileStore.ts`; retention &
   cleanup worker (needs Redis).
7. **Workers/Redis.** Watermark worker is a **no‑op** (group watermark is
   configured but not actually stamped onto PDFs); plus cleanup & auto‑close.
   `workers/*`, needs Redis.
8. *(resolved)* Office conversion was removed — PrintLoop is **PDF + images
   only**, enforced at every upload endpoint and at the kiosk. No work left.
9. *(resolved)* Batch printing is now a **real one‑code / multi‑file model**
   (`PrintJobItem` per doc; group batch honours each participant's settings).

**P3 — cleanup**
10. Remove/relocate the superseded files quarantined in `tsconfig.json`
    `exclude` (old `controllers/{auth,job,wallet,admin,adminPrivilege}`,
    duplicate `middlewares/rbac.middleware.ts`).
11. Decide long‑term fate of the **mock layer** (wallet/stations/options) —
    either move fully real or formally keep as documented.
12. Kiosk autostart: ship a desktop/systemd unit that launches the browser
    in kiosk mode pointing at the served `index.html` (no Electron/signing).

---

## 6. Landmines — read before you touch code

- **Two data stores.** `data/dev-store.json` (mock wallet/stations) vs
  `data/printloop.sqlite` (real auth/jobs/groups/kiosks). A code created via
  the customer flow lives in **SQLite**; the kiosk reads SQLite. Don't expect
  them to share state.
- **Settings cache ≈ 20 s.** `printPolicy.service` caches settings; admin
  Options changes (policy, IPP port/path, IPPS) take up to ~20 s to apply.
- **Guest group host.** `GroupSession.hostUserId` is a plain id with **no FK**
  by design; the host identity is a `hostId` kept in browser `localStorage`.
- **tsconfig `exclude`** quarantines superseded duplicates — they are **not
  compiled** and are dead; don't resurrect them, port logic to the live files.
- **Redis‑optional.** Without `REDIS_URL`, workers (watermark/cleanup/
  auto‑close) **silently no‑op**. Watermarking is therefore not applied yet.
- **IPP/IPPS proven only against the virtual printer** (`scripts/
  virtualPrinter.cjs`, same `ipp` lib both ends). Real hardware untested.
- **`synchronize: true`** on SQLite auto‑creates schema — convenient in dev,
  **must** become migrations before prod.
- **Kiosk is a plain static page** (`printloop-kiosk/index.html`) — no
  Electron, no build, no installer. Serve it and open full‑screen in a
  browser kiosk mode.
- **devApi `requireAuth` JWT bridge** — if you change JWT/`utils/jwt`, the
  mock wallet/stations endpoints break too.

---

## 7. Suggested first week

1. Run §3, watch both e2e scripts print byte‑exact. Read
   `PRINTLOOP-HOW-IT-WORKS.md`.
2. Stand up Postgres + Redis locally; do **P1‑1** (DB switch + migrations) —
   it unblocks most of P1/P2.
3. **P1‑2** Paystack webhook verification + real wallet.
4. **P1‑4** security hardening pass.
5. Get a real IPP printer (or CUPS in a VM) and do **P1‑5**.
6. Then P2 in order.

Per‑subsystem entry points: print path → `routes/printer.routes.ts` +
`services/ipp.service.ts`; customer → `routes/customer*`; admin →
`routes/admin*` + `pages/admin/*`; conversion →
`services/documentConvert.service.ts`; policy →
`services/printPolicy.service.ts`.

---
*Everything in §4 is built & verified. §5 is the real remaining work, mostly
gated on the infra in `PRODUCTION-READINESS.md`. §6 will save you days.*
