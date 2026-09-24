# PrintLoop SaaS v2 — Current-State Issue List

Date: 2026-06-09
Based on: repo scan + docs review

---

## BLOCKER — Render worker not integrated

- `render-worker/` exists as a stub package.
- Backend does not emit `render` BullMQ jobs after payment.
- `print_job_render` table schema is design-only; no entity/CRUD implemented.
- Without this, the v2 value prop (transparent final pricing from actual render, kiosk spool speed) is invisible to users.

### What's needed
1. Wire `01-backend` payment success handler to emit `render` job with `fileId`, `tenantId`, `printerProfileId`.
2. Implement `print_job_render` entity + repo.
3. Build the pseudo-coded pipeline in `ARCHITECTURE.md` (Ghostscript normalize -> libcupsfilters pdfToPwg -> page/cost extract -> S3 write).
4. Add a fallback path: if no `printerProfileId` is configured for tenant/kiosk, skip render and let kiosk fallback to v1 raw-PDF behavior.

---

## DONE — Multi-tenancy implemented

- `SAAS-ROADMAP.md` Phase A (data-model multi-tenancy) is the #1 strategic dependency.
- **Resolution:** Phase A is complete.
  - `tenant.middleware.ts` resolves `req.tenant` from subdomain / `X-Tenant-Slug` / custom domain / authenticated user with legacy safe fallback for cutover.
  - Tenant entities exist: `tenant.entity.ts`, `tenantMember.entity.ts`, `tenantBranding.entity.ts`, `tenantDomain.entity.ts`, `tenantWebhook.entity.ts`, `tenantBalance.entity.ts`.
  - Multi-tenant data model is shipped: `1717200000000-AddTenantIdColumns`, `1717300000000-TightenTenantUniqueness`, `1717500000000-AddPrintJobItemTenantId`, plus balance/render-related migrations.
  - Tenant isolation is enforced in routes/services: admin routes scope queries by `req.tenant.id`; payment, render, and job paths stamp `tenantId`; seed backfills existing rows.
  - The only remaining cutover task is removing `LEGACY_TENANT_SLUG` fallback once every route is tenant-aware.

---

## HIGH — Middleware folder typo risk

- Both `01-backend/middleware/` and `01-backend/middlewares/` exist.
- If any import points at the wrong path, the app only runs in environments where the filesystem is case-insensitive.
- Impact: silent breakage on deploy or refactor.

### Fix
Unify to `middleware/`. Remove or archive `middlewares/`. Search-replace any stale imports.

---

## HIGH — Deployment doc confusion

- `DEPLOY.md` = v1 SQLite local dev guide.
- `DEPLOY-SAAS.md` = v2 Postgres multi-tenant guide.
- No file clearly says "for v2 use this one."

### Fix
Add a two-line canonical pointer at the top of both files, and update `CLAUDE.md`/`00-START-HERE.md` to reference the correct one.

---

## HIGH — Runtime stack mismatch

- `CLAUDE.md` says backend uses SQLite.
- `docker-compose.yml` provisions Postgres.
- A new contractor following `CLAUDE.md` will not get the DB the app actually runs against.

### Fix
Update `CLAUDE.md` to reflect Postgres as local default. Keep SQLite note only as historical context.

---

## MEDIUM — Render worker docs over-code

- Docs (`ARCHITECTURE.md`, `00-START-HERE.md`) describe a working render pipeline.
- Code is a stub.
- A reader assumes the system already does cloud rendering.

### Fix
Add a clear "not yet wired" banner to render-worker docs, or move the full pipeline description to a dedicated `docs/RENDER-WORKER.md` gated by a Phase marker.

---

## MEDIUM — Frontend route references may be stale

- `SCAN-CORRECTIONS.md` notes docs reference `pages/discovery/FindPage.tsx` and `ShopDetailPage.tsx`.
- Actual customer pages appear to live under `printloop-new-frontend/src/pages/customer/`.
- Mismatched paths in onboarding/training docs will break new developer velocity.

### Fix
Audit all docs against live `src/` tree. Correct any legacy path references.

---

## MEDIUM — Kiosk OS duality is unresolved

- `install-kiosk-pc.ps1` = Windows path (v1).
- `ARCHITECTURE.md` recommends Linux for v2 to unlock full OpenPrinting.
- No README clearly marks which installer is v1-only vs v2-ready.

### Fix
Rename/label the Windows installer as `legacy-install-kiosk-pc.ps1`, add a `v1-WARNING.md`, and create a short `KIOSK-V2.md` pointing to the Linux path.

---

## MEDIUM — Pricing matrix not yet validated by real output

The 24-cell pricing matrix exists in docs, but:

- Page-count + color detect (`libcupsfilters`) is not wired to the pricing service end-to-end yet.
- Until render worker extracts `meta.pageCount` and `meta.color`, the customer still sees estimated pricing, not final transparent pricing.

This is a product promise at risk.

### Fix
- Confirm pricing service unit tests cover the 24 cells.
- Stage when render worker feeds final `pageCount` + `color` and job status flips from `RENDERING` to `READY_FOR_PICKUP`.

---

## LOW — Vendor directory hygiene

- `vendor/openprinting/` is 26 repos, ~128 MB.
- README exists, but refresh script (`tools/refresh-vendor.ps1`) is unnamed/TODO in `00-START-HERE.md`.
- No documented owner for updating vendor when security patches drop.

### Fix
Add a quarterly "vendor refresh" checklist to `JOURNAL.md` or `TOOLS.md`.

---

## Summary by priority

| Priority | Count | Themes |
|---|---|---|
| BLOCKER | 1 | render integration |
| HIGH | 3 | typo risk, doc confusion, stack mismatch |
| MEDIUM | 4 | render docs, frontend paths, kiosk OS duality, unvalidated pricing |
| LOW | 1 | vendor hygiene |
