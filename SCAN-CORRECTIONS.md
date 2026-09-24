# PrintLoop SaaS v2 — Repo scan corrections

Tracker for issues found by repo scans. Each item carries its current
state so re-scanners don't re-flag closed items.

## Blocked state when this file was first written
- `C:\Users\abdur\Videos\printloop-saas-v2` is a real codebase with
  backend, frontend, kiosk app, render worker, docs, and Docker
  compose.
- The original scan did not run the app or tests. Items below have
  been audited against the actual code as of V2-35.

---

## Corrected issues

### 1. Middleware folder typo — RESOLVED (V2-35)

- **Found:** `01-backend/middleware/rbac.middleware.ts` AND
  `01-backend/middlewares/rbac.middleware.ts` (folder name typo).
- **Audit:** the duplicate was already excluded from `tsconfig.json`
  and not imported by anything in the codebase (verified via
  cross-tree grep). So it never affected the build, but left as a
  trap for future maintainers.
- **Resolution:** `01-backend/middlewares/` directory removed in
  V2-35. Backend `tsc --noEmit` stays clean.

### 2. Conflicting deployment docs — RESOLVED (pre-V2-35)

- **Found:** `DEPLOY.md` is the v1 SQLite guide; `DEPLOY-SAAS.md` is
  the canonical v2 multi-tenant guide. A new developer could
  follow either and land on the wrong stack.
- **Resolution:** both docs now cross-reference each other at the
  top.
  - `DEPLOY.md` opens with: *"v2 note: this is the original v1
    single-tenant / SQLite guide. For the multi-tenant SaaS deploy
    use `DEPLOY-SAAS.md` — canonical for v2."*
  - `DEPLOY-SAAS.md` line 4 opens with: *"Canonical deploy guide for
    the multi-tenant SaaS (v2). The older `DEPLOY.md` covers the v1
    single-tenant/SQLite story and the still-relevant printer-LAN
    constraint…"*

### 3. SQLite vs Postgres mismatch — RESOLVED (V2-35)

- **Found:** `CLAUDE.md` said backend is SQLite; `docker-compose.yml`
  provisions Postgres; `DEPLOY-SAAS.md` is Postgres-only.
- **Resolution:** `CLAUDE.md` "Folder layout shortcuts" section
  rewritten to state: *"DB driver auto-selects from `DATABASE_URL`:
  Postgres in prod / Docker, SQLite for local dev with no setup.
  Single migration set per driver (SQLite incremental chain vs
  `PostgresBaseline`)."*

### 4. Render worker is still a stub — FALSE CLAIM

- **Found:** scan said docs describe a complete render worker flow but
  `render-worker` is present as a stub.
- **Audit:** verified by reading the source.
  - `render-worker/src/index.ts` (99 sloc) — BullMQ Worker on
    `REDIS_URL` with parsed connection options.
  - `render-worker/src/pipeline/render.ts` (542 sloc) — actual
    `renderToPwgRaster()` implementation.
  - `render-worker/src/callback.ts` (83 sloc) — HMAC-signed callback
    to the backend on success / failure.
  - Backend side: `services/renderEnqueue.service.ts`,
    `routes/render.routes.ts`, `workers/scheduled.worker.ts`,
    `tests/render-pipeline.test.ts` (with mocked BullMQ queue).
  - `PrintJobStatus.RENDERING` is an enum value with a comment
    pointing at `ARCHITECTURE.md` for the cloud render → kiosk spool
    pipeline.
  - Migration `1718700000000-AddPrintJobRenderFields.ts` adds the
    render-status fields.
- **Resolution:** the *doc* (CLAUDE.md) that previously misrepresented
  render-worker as a stub was the root cause of this scan finding; the
  V2-35 CLAUDE.md rewrite now correctly describes it as
  *"Implemented (542 sloc in pipeline/render.ts, HMAC callback to
  backend)."* No code change required — the render worker was real
  all along.

### 5. Frontend URL/handoff path drift — RESOLVED

- **Found:** V2-34 journal references
  `pages/discovery/FindPage.tsx` and `ShopDetailPage.tsx`. Scan
  worried this implied a `pages/discovery/` folder that didn't exist.
- **Audit:** verified by listing
  `printloop-new-frontend/src/pages/discovery/`. Both files exist:
  ```
  FindPage.tsx
  ShopDetailPage.tsx
  ```
  The broader `src/pages/` layout is
  `admin / auth / customer / discovery / group / kiosk / platform / saas`
  — the discovery folder is real. No drift.
- **Resolution:** none needed — the docs match the code.

### 6. Windows/Linux kiosk guidance boundary — RESOLVED (V2-35)

- **Found:** `install-kiosk-pc.ps1` is Windows, but v2 docs say Linux
  is preferred. A fresh kiosk operator might use the wrong path.
- **Audit:** the V2 docs don't actually say "Linux is preferred" —
  both OSes are first-class. The real gap was lack of a single
  reader doc explaining the install matrix.
- **Resolution:**
  - V2-35 added a matched pair of unified installers at the repo
    root: `install-kiosk-pc.ps1` (Windows) and `install-kiosk-pc.sh`
    (Linux). Both handle full kiosk OR `--agent-only` headless mode.
  - V2-35 added `PrintLoopSetup.exe` — a self-contained Windows .exe
    (44 KB, PE32 console, `requireAdmin` manifest) that wraps the
    PowerShell installer via `ps2exe`. Shop owners double-click,
    UAC prompts, console wizard runs. No PowerShell skill required.
  - V2-35 added `KIOSK.md` at the repo root — single-page guide
    covering both OSes, the three printer transports, troubleshooting,
    log paths, and the architecture.

---

## Items still open

**None.** All six items from the original scan are either resolved or
were false claims that the V2-35 doc rewrite addressed at the root
cause.

---

## Last updated
2026-06-09 — V2-35 close-out
