# PrintLoop — Developer Handover Guide

Everything a new engineer needs to run, understand, test, and ship
PrintLoop v2. Commands here are verified against the repo, not invented.

> **One-line description:** a multi-tenant SaaS marketplace for
> self-service campus printing in Nigeria. Students upload from their
> phones, pay online (Paystack), and collect prints at a shop by typing
> a 6-character code. Shops keep their printers on their own LAN; the
> cloud never touches the printer directly. Revenue = a per-transaction
> commission (default 10%), **not** a subscription.

---

## 1. The four services (how they fit)

| Package | What it is | Run | Port |
|---|---|---|---|
| `01-backend/` | Express + TypeORM API (auth, tenancy, pricing, jobs, payouts, marketplace) | `npm run dev` | 4000 |
| `printloop-new-frontend/` | React 18 + Vite + RTK Query (customer app, shop console, platform console) | `npm run dev` | 5173 |
| `worker/` (a.k.a. render-worker) | BullMQ consumer: PDF → PWG-raster via Ghostscript + cups-filters | `npm run dev` | — |
| `printloop-agent/` | Node process on the shop PC; pulls jobs, prints on the LAN, reports back | `npm start` | — |

Plus `printloop-kiosk-app/` (Electron kiosk UI) and `vendor/openprinting/`
(read-only reference clones, **gitignored — never edit**).

**Data flow:** customer **finds a shop on the map** (`/find`) → uploads →
backend stores + prices + issues a release code → (optional) render-worker
normalizes to PWG → agent on the shop LAN pulls the job by kiosk key,
prints, and reports `PRINTED`/`FAILED` back to the cloud. The cloud only
ever receives outbound HTTPS from the agent — no VPN/port-forward into
the shop.

**Marketplace discovery** (`/find` + `/find/:slug`, V2-30/31/32) is the
Bolt-style front door: a Leaflet + OpenStreetMap map with marker
clustering, a Haversine `GET /api/discovery/shops/nearby` sort by
distance, search + capability filters (colour / A3 / online-now), a
"Live" gate, and a session hand-off into the chosen shop's upload flow.
Shops appear only once the owner sets a (geocoded) location **and** flips
`isDiscoverable` on — an empty map usually means no live shops nearby,
not a bug. Code: `pages/discovery/FindPage.tsx` +
`routes/discovery.routes.ts`.

---

## 2. Local dev quickstart

Prereqs: Node 20+ and npm. (Postgres/Redis optional locally — see below.)

```bash
# Backend (auto-uses SQLite locally; seeds demo data)
cd 01-backend && npm install
SEED_DEMO=1 PORT=4000 npm run dev      # http://localhost:4000/health

# Frontend (proxies /api → :4000)
cd printloop-new-frontend && npm install && npm run dev   # http://localhost:5173
```

That's the whole app running. The frontend's Vite proxy points `/api` at
`localhost:4000`, so **if login fails everywhere, the backend is down** —
not a credentials problem.

**Seeded demo logins** (only exist when `SEED_DEMO=1`):
- Customer — `student@printloop.test` / `Password1!` (at `/auth/login`)
- Admin/super-admin — `admin@printloop.test` / `Admin1234!` (at `/admin/login`, also reaches `/platform`)

Full stack the way prod runs (Postgres + Redis + Gotenberg + api + workers):
```bash
docker compose up --build     # api on :4000
```

---

## 3. Configuration (env)

Backend reads env directly (`01-backend/.env.example` is the reference).
The load-bearing ones:

- `DATABASE_URL` — **absent → SQLite** (local dev, zero setup);
  `postgres://…` → Postgres. The driver auto-selects; migrations are
  driver-gated (see below).
- `JWT_SECRET` — signing key. **Must be set + strong in production.**
- `SEED_DEMO=1` — seed demo tenant/users. **Off in prod.**
- `COMMISSION_PCT_DEFAULT=0.10` — platform cut.
- `REDIS_URL` — enables BullMQ + rate limiting; absent → graceful no-op.
- `RENDER_CALLBACK_SECRET` — HMAC secret shared with the render-worker.
- `DOC_CONVERTER` / `GOTENBERG_URL` — Office→PDF conversion (V2-48).
- `DISABLE_RATE_LIMIT=1`, `SMTP_HOST=''`, `GEOCODER=fixture` — test escape hatches.

---

## 4. Database & migrations

- **Two migration chains, selected by driver** (`config/database.ts`):
  SQLite runs an incremental chain; Postgres runs a single
  `PostgresBaseline` + the few post-baseline migrations. When you add a
  migration, register it in **both** arrays (SQLite guarded with
  `PRAGMA`/`IF NOT EXISTS`, Postgres with `ADD COLUMN IF NOT EXISTS`).
- Migrations run automatically on boot (`migrationsRun: true`). There is
  **no** `synchronize` — schema changes are explicit, reviewed files.
- Demo data is seeded by `config/seed.js` when `SEED_DEMO=1`.
- First prod admin: `tsx scripts/createSuperAdmin.ts <email> <password>`.

---

## 5. Testing

```bash
# Backend
cd 01-backend
npm run typecheck        # tsc --noEmit
npm run test:run         # vitest (unit/integration)
node scripts/e2e<Name>Test.cjs   # self-contained e2e (spawns own server)

# Frontend
cd printloop-new-frontend
npx tsc -b && npm run test && npx vite build
```

- **E2E convention:** each `scripts/e2e*.cjs` spawns its **own** backend
  on a **random high port** with `SMTP_HOST=''` (so the verify token
  logs to stdout) and its own SQLite file. This is why they're reliable
  in parallel — copy an existing one when adding coverage.
- CI (`.github/workflows/ci.yml`) runs vitest + the e2e suite on a
  Postgres+Redis matrix. Keep it green.
- Current baseline: backend vitest **43/43**, frontend typecheck/build
  clean. Every phase in `JOURNAL.md` records its verification.

---

## 6. Key patterns to know before editing

- **Tenant resolution** (`middleware/tenant.middleware.ts`): JWT
  memberships → subdomain → custom domain → `X-Tenant-Slug` header →
  legacy fallback. Almost every customer-facing table has
  `tenantId NOT NULL`. Don't write a query that isn't tenant-scoped.
- **Pricing is server-authoritative.** `services/pricing.service.ts`
  (`computeCost`) is the single source; the client estimate is UX only.
  Never trust a client-supplied page count or price.
- **Release codes:** `utils/releaseCode.ts` (`makeCode`) — crypto-random,
  Crockford-ish alphabet. One implementation; import it, don't re-roll.
- **Render pipeline:** backend enqueues → `worker/` renders to PWG →
  HMAC-signed callback to `/api/render/callback`. Redis ≥5 required for
  BullMQ (docker-compose provides Redis 7).
- **Agent job-truth (V2-44):** the agent confirms a *real* print
  (`ipp` polls job-state, `spooler` watches the queue drain, `raw9100`
  is honestly "unconfirmed"). "Spooler accepted it" ≠ "it printed."
- **Black boxes:** PrintLoop delegates the hard parts — printing
  (CUPS/Ghostscript/driver), payments (Paystack), geocoding, queues,
  Office→PDF (Gotenberg). See `BLACK-BOXES.md` for the map + roadmap.
- **Design system:** editorial-brutalist, documented in `CLAUDE.md`.
  Extend it; don't invent a new aesthetic per page. Motion = the
  in-house `scrollFx` kit only (no GSAP/Lenis) — audience is low-end
  Android on paid data.

---

## 7. Auth, roles & the API surface

- **Browse the whole API:** `GET /api/docs` (Swagger UI) and
  `GET /api/openapi.json` (spec). Fastest way to see every endpoint.
- **User auth = JWT.** `Authorization: Bearer <token>`. Roles: `user`
  (customer), `admin`, `super_admin`. The token embeds the user's
  **tenant memberships**, so most authz is a token read, not a DB
  lookup (bounded staleness — a revoked role takes effect on next
  login). Bcrypt cost 12 everywhere.
- **Agent/kiosk auth ≠ JWT.** The on-site agent authenticates with a
  long-lived `X-Kiosk-Key`; file downloads use short-lived signed URLs.
- **Route surfaces:** `/api/customer/*` (customer JWT), `/api/admin/*`
  (admin JWT), `/api/saas/*` (tenant-owner JWT + tenant scope),
  `/api/agent/*` (kiosk key), and `/api/discovery/*` + `/api/integrations/*`
  (anonymous, cross-tenant — mounted **before** tenant middleware, so they
  never read `req.tenant`).
- **Frontend token handling:** `store/services/apiSlice.ts` attaches the
  Bearer header from state and auto-reauths on 401. The session persists
  in `localStorage.pl_auth` (`{ user, accessToken, refreshToken }`).

## 8. Frontend architecture (quick)

- **One RTK Query slice**, extended per domain. `apiSlice.ts` is the base;
  each domain file (`authApi`, `jobsApi`, `saasApi`, `discoveryApi`,
  `deliveryApi`-style) calls `apiSlice.injectEndpoints(...)`. To add an
  API call, inject an endpoint — don't spin up a new base query.
- **`@/` → `src`** (Vite + tsconfig alias). Store in `store/index.ts`,
  auth state in `store/features/auth/authSlice.ts`.
- **The marketplace gate is intentional:** the customer upload pages
  (`/print/new`, `/print/batch`) bounce to the dashboard unless
  `sessionStorage.activeTenantSlug === reviewedPricesForTenant` — set
  when you pick a shop on `/find`. If uploads "redirect for no reason,"
  that's the gate, not a bug: pick a shop + review its prices first.

## 9. Adding a feature end-to-end

The well-worn path (backend → frontend → proof):

1. **Route** in `01-backend/routes/<x>.routes.ts`, **mount** in `app.ts`
   (mind the middleware order: anonymous routes before tenant resolution).
2. **Logic** in `services/`; keep money/pricing server-authoritative.
3. **Schema:** new `entities/*.entity.ts` + a migration registered in
   **both** driver arrays in `config/database.ts` (SQLite guarded +
   Postgres `IF NOT EXISTS`).
4. **Frontend:** inject an endpoint in `store/services/`, then build the
   page/component on the editorial-brutalist system (`pl-*` classes,
   `scrollFx` for motion).
5. **Prove it:** copy an existing `scripts/e2e*.cjs` (they self-spawn a
   server on a random port), wire it into `ci.yml`, and add a `JOURNAL.md`
   entry **on top**.

## 10. Debugging & common gotchas

- **Login fails everywhere → the backend is down.** Vite proxies `/api`
  → `:4000`; if nothing's there, every request fails. Not a credentials
  issue. Restart `01-backend`.
- **Worker won't consume jobs → Redis too old.** BullMQ needs Redis ≥5;
  a stock Windows Redis is 3.x and gets rejected. Use
  `docker run -d -p 6379:6379 redis:7-alpine` (docker-compose already does).
- **Grayscale / Office conversion silently no-op** when Ghostscript /
  Gotenberg aren't installed (by design — a color print beats no print).
  Check toolchain health at `GET /api/admin/spike/diag` (super-admin).
- **Logs are pino JSON** (one line per request). Pipe through
  `npx pino-pretty` locally for readability.
- **E2E tests** must set `SMTP_HOST=''` so the disabled mailer logs the
  verify token to stdout for the script to scrape.
- **Preview flakiness** (if using the harness preview): occasional frozen
  scroll/animations are a `requestAnimationFrame` wedge in the tooling,
  not the app — a real browser tab is fine. Restart the preview instance.

## 11. Deploy

- `docker-compose.yml` is the reference topology: Postgres, Redis,
  Gotenberg, `api` (`npm start`), a separate `worker` process (it — and
  only it — registers the repeatable scheduled jobs, so the API can scale
  horizontally without double-firing payouts), and `render-worker`.
- Set real secrets via the platform's secret store, `DATABASE_URL` to
  managed Postgres, `SEED_DEMO` unset, `JWT_SECRET` strong, TLS on.
- Don't push to remotes / open PRs without the owner's say-so.

---

## 12. Pre-launch security checklist (do before real customers)

**Code (a few hours, sharpest edges):**
- [ ] Refuse to boot in production without a strong `JWT_SECRET` (main
      auth path still has a dev fallback constant).
- [ ] Gate the dev mock router (`routes/devApi.routes.ts`, mounted at
      `/api`) behind `NODE_ENV !== 'production'`.
- [ ] Add security headers (helmet: CSP, HSTS, X-Frame-Options).
- [ ] Rate-limit kiosk **code validation** (guessable 6-char codes) —
      note a shared kiosk = many legit users on one IP, so scope by
      kiosk, not raw IP.

**Already solid:** Paystack webhooks HMAC-SHA512 verified (raw body);
bcrypt cost 12 everywhere; tenant isolation (24/24 e2e); single-use LMS
handoff tokens; super-admin bootstrap CLI.

**Ops:**
- [ ] Rotate/disable the seeded demo accounts (`SEED_DEMO` off in prod).
- [ ] Automated Postgres backups **+ a tested restore**.
- [ ] Secrets in a real store, not `.env` on the box.
- [ ] `npm audit` in CI + Dependabot.
- [ ] Turn on Sentry (DSN-gated, already wired) + uptime alerts.
- [ ] Reconciliation job: prove every wallet debit maps to a
      printed-or-refunded outcome (the "money taken, nothing printed"
      invariant — the one failure that hurts customers).

---

## 13. Where to read next

- `CLAUDE.md` — orientation + conventions + design system.
- `ARCHITECTURE.md` — the OpenPrinting-based print stack.
- `HOW-PRINTLOOP-WORKS.md` — the operating model (Mermaid diagrams).
- `BLACK-BOXES.md` — external dependencies + what to add next.
- `SAAS-ROADMAP.md` — the multi-tenant SaaS plan.
- `JOURNAL.md` — chronological build log; **newest phase is at the top.**
  Read the last few entries to see what changed most recently.
- `ONBOARDING-SHOP.md` — how a shop owner goes live (Paystack/KYC).

---

## 14. Owner context

The owner (Abdurrahman) is a non-programmer founder. Explain choices in
plain English and reference files by name. Currency is Naira (NGN); first
market is Nigerian universities. A v1 lives at
`printloop for anti-gravity` and must keep working — this repo is a fork.

_Last updated: 2026-06-19._
