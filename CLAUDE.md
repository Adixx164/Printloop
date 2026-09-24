# CLAUDE.md — orientation for future Claude sessions

This folder is **PrintLoop SaaS v2** — a duplicate of
`C:\Users\abdur\Videos\printloop for anti-gravity` made on 2026-05-31,
forked to lean on the OpenPrinting ecosystem instead of treating
printing as a black box behind the OS.

## Where to start each session

1. `00-START-HERE.md` — the human-facing entry point. Tells you
   what's new in v2 vs v1.
2. `SAAS-ROADMAP.md` — the 14-dimension multi-tenant SaaS plan
   (carried over from v1, still the strategy).
3. `ARCHITECTURE.md` — the print-stack architecture using
   OpenPrinting. New in v2. Read this whenever a task touches
   rendering, kiosk print services, or printer drivers.
4. `JOURNAL.md` Phase V2-0 (top of file) — what changed in the
   v2 kickoff. Append new phases on top of this one as work
   progresses.

## Folder layout shortcuts

- `01-backend/` — Express + TypeORM. DB driver auto-selects from
  `DATABASE_URL`: **Postgres in prod / Docker, SQLite for local dev**
  with no setup. Single migration set per driver (SQLite incremental
  chain vs `PostgresBaseline`). **Multi-tenancy shipped** — every
  customer-facing table has `tenantId NOT NULL`; the
  `Tenant` / `TenantMember` / `TenantBranding` / `TenantWebhook` /
  `TenantDomain` / `TenantBalance` entities + `tenant.middleware.ts`
  handle resolution (JWT memberships → subdomain → custom domain →
  `X-Tenant-Slug` header → legacy fallback). See V2-30 → V2-34
  journal entries.
- `printloop-new-frontend/` — React + Vite + RTK Query. Surfaces:
  `/` (landing), `/find` + `/find/:slug` (marketplace + map),
  `/saas/*` (tenant admin), `/platform` (SUPER_ADMIN console),
  `/print/new` (customer upload), `/admin/*` (legacy single-tenant
  admin).
- `printloop-kiosk-app/` — Electron-bundled kiosk UI. Ships a Setup.exe
  via electron-builder (`printloop-kiosk-app/dist/`).
- `printloop-agent/` — Node service running on the shop computer.
  Three transports: `ipp`, `raw9100`, `spooler` (V2-35 — uses the OS
  print queue, near-universal printer compatibility).
- `printloop-kiosk/` — older HTML kiosk UI, kept for reference.
- `render-worker/` — Cloud BullMQ consumer. Implemented (542 sloc in
  `pipeline/render.ts`, HMAC callback to backend). Backend emits via
  `services/renderEnqueue.service.ts`; `PrintJobStatus.RENDERING`
  enum entry; covered by `tests/render-pipeline.test.ts`.
- Multi-tenancy shipped — every customer-facing table has `tenantId
  NOT NULL`; `Tenant` / `TenantMember` / `TenantBranding` /
  `TenantWebhook` / `TenantDomain` / `TenantBalance` entities +
  `tenant.middleware.ts` handle resolution (JWT memberships →
  subdomain → custom domain → `X-Tenant-Slug` header → legacy
  fallback). See `JOURNAL.md` V2-30 → V2-34.
- `vendor/openprinting/` — 26 shallow-cloned OpenPrinting repos.
  **Read-only — do not edit.** Refresh with
  `pwsh tools/refresh-vendor.ps1`. See `vendor/openprinting/README.md`.
- `docs/` — internal docs.
- `tools/` — build / ops scripts (Windows-flavoured).

## Conventions baked in

- **Vendor, don't fork.** OpenPrinting code under `vendor/` is
  read-only. If a patch is needed, fork upstream and update
  `tools/refresh-vendor.ps1` to point at the fork.
- **Shallow clones (`--depth 1`)** for vendored repos. Deepen
  on demand.
- **Cloud render, kiosk spool.** Heavy work happens in
  `render-worker/`. Kiosk pulls pre-rendered PWG and hands it to
  a local CUPS over IPP.
- **Linux preferred for v2 kiosks**, Windows still supported via
  the existing `install-kiosk-pc.ps1` path.

## Design system (frontend)

UI work must **extend the existing editorial-brutalist system — never
invent a new aesthetic per page.** The system is the product's voice:

- **Palette:** Ink `#1A1410`, Paper `#F8F4ED`, Persimmon `#D14B2C`,
  Ochre `#C7944A`, Sage `#6B7A5C`, Fog `#888888` (Tailwind tokens in
  `printloop-new-frontend/tailwind.config.js`).
- **Type:** Fraunces serif (`pl-serif`) for display, Inter for body,
  JetBrains Mono (`pl-mono`) for codes/numbers.
- **Components:** `pl-btn-*` (2px ink border, hard `5px 5px 0` offset
  shadow on hover — never blurred), `pl-input`, `pl-card`, `pl-chip`,
  `editorial-label`. Defined in `src/index.css`.
- **Motion:** use the in-house `scrollFx` kit
  (`src/components/ui/scrollFx.tsx`) — reveals, counters, parallax,
  pin-scrub. No GSAP/Lenis/framer-motion; audience is low-end Android
  on paid data, so CSS transforms only and every effect must collapse
  under `prefers-reduced-motion`.

## What's intentionally NOT here

- A fork of CUPS or any OpenPrinting project.
- A bundled printer-application binary (we'll build per-release
  via Docker; nothing pre-built committed).
- ~~A solution for the multi-tenancy refactor~~ — **stale; multi-
  tenancy shipped** (see "Folder layout shortcuts" above and
  `JOURNAL.md` V2-30 → V2-34).

## When taking actions in this folder

- The user (Abdurrahman) is not a programmer. Explain choices in
  plain English; reference files by name when asking him to do
  something.
- The currency is Naira (NGN) and the first geography is Nigerian
  universities, even though the SaaS target is global.
- Don't push to remotes or open PRs without explicit instruction.
- Don't break v1 — this folder is a duplicate; the original at
  `printloop for anti-gravity` must keep working.

## Agent skills

### Issue tracker

GitHub Issues (uses `gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context (root `CONTEXT.md` + `docs/adr/`). See `docs/agents/domain.md`.
