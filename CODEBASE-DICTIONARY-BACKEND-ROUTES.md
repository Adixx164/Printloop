# 4 · BACKEND — ROUTES (API surface)

> Folder: `01-backend/routes/`
> role — Express routers that expose the REST API. Mounted in app.ts in a specific
>   order so auth/tenant/rate-limit policy applies correctly.

```

01-backend/routes/openapi.ts
  role — OpenAPI 3.1 spec + Swagger UI
  details — GET /api/openapi.json (spec) and /api/docs (Swagger UI). Anonymous, mounted
    at /api before tenant resolution.

01-backend/routes/devApi.routes.ts
  role — legacy single-tenant mock API (stations/options, JWT-bridged)
  details — catches /api/* that no other route claimed; kept for backward compat.
    Real stations/pricing now live in customerPrint.routes; this mock is the fallback.
    Mounted last among /api/* so real routes win the path match.

01-backend/routes/discovery.routes.ts
  role — marketplace discovery: public shop list + shop detail (V2-30)
  details — anonymous, mounted before resolveTenant. Returns only the public projection
    of a tenant (name, location, pricing, status) for /find and /find/:slug.

01-backend/routes/integrations.routes.ts
  role — external integrations: campus LMS trusted-link handoff (V2-44)
  details — anonymous, cross-tenant. LMS calls in with no PrintLoop session; validates
    the tenant's lmsKey and mints a short-lived handoff token.

01-backend/routes/passwordReset.routes.ts
  role — forgot-password + reset-password flow (V2-29)
  details — anonymous, optionalTenant. Handles reset-token mint, email delivery, and
    password update when the token is valid. Mounted at /api/auth before the dev mock.

01-backend/routes/saas.routes.ts
  role — SaaS tenant onboarding + tenant-owner console API (Phase A)
  details — /signup (anonymous), /verify-email + /resend-verification (otpLimiter),
    /me (tenant owner profile), /payouts, /bank-account, /subaccount setup,
    location/discoverability live gate, kiosk fleet management, and the tenant-scoped
    settings/branding/domains/webhooks surfaces. Auth + tenant resolution enforced inside.

01-backend/routes/customerAuth.routes.ts
  role — customer auth: register / login / me / password / export / close
  details — register (scopes email by tenant, mints wallet row + JWT + CUSTOMER_SIGNED_UP
    webhook), login (bcrypt + TOTP gate V2-22 + lastLoginAt + memberships stamped into JWT),
    GET/PUT /me (profile), PUT /password (old+new), POST /export (GDPR/NDPR data dump),
    DELETE /me (two-phase close: CLOSED → 30-day cooling-off → hard delete).

01-backend/routes/customerPrint.routes.ts
  role — customer print flow: upload, pricing, quote, jobs, stations, reviews, disputes
  details — POST /print-jobs (single) and /print-jobs/batch (multi-file) with multer,
    office→PDF conversion gate (V2-48), annotation flattening, authoritative page count,
    abuse limits + file-size/page-count caps, promotion application, computeCost from the
    admin matrix, PrintJob + File (+ PrintJobItem for batch) persistence, edit-job creation
    when editingRequired (V2-XX). GET /print-jobs (user's jobs), /print-token (CUPS token),
    /print-token/rotate, /pricing (live matrix), /print-jobs/quote (authoritative price),
    /stations (public kiosks with freshness-based online/offline), /print-jobs/options
    (legacy compat), POST /shops/:slug/reviews, POST /disputes.

01-backend/routes/adminAuth.routes.ts
  role — admin login + admin token refresh
  details — admin login path (separate from customer login), admin-scoped JWT minting.

01-backend/routes/admin.routes.ts
  role — real TypeORM-backed admin console API
  details — dashboard stats, jobs list + requeue/accept/release/status, group sessions,
    pricing CRUD (per-cell + legacy), promotions CRUD, transactions list, blog CRUD (V2-54),
    printer profiles CRUD (V2-56), users list + view/block/role/privileges, revenue + kiosk
    reports, system settings read/update, audit log viewer. All gated by requirePermission.
    Also hosts the optional /api/admin/spike route when ENABLE_SPIKE_RENDER=1.

01-backend/routes/admin-kiosk.routes.ts
  role — admin kiosk management (authenticate + resolveTenant)
  details — kiosk CRUD + key regenerate + status management for the tenant admin.

01-backend/routes/spike.routes.ts
  role — super-admin render/diagnostic spike endpoints (Option A)
  details — only mounted when ENABLE_SPIKE_RENDER=1; used to test render paths on real
    paper before wiring them into the live dispatch.

01-backend/routes/groupSession.routes.ts
  role — group print session lifecycle
  details — create/join/list group sessions and participant uploads.

01-backend/routes/participantUpload.routes.ts
  role — group participant upload endpoint
  details — allows participants (sometimes guests) to upload into a group session.

01-backend/routes/printer.routes.ts
  role — "PrintLoop as a network printer" CUPS ingress
  details — token-auth, no JWT. A laptop's CUPS backend POSTs here; the print token
    proves the user. Creates print jobs from CUPS-submitted documents.

01-backend/routes/agent.routes.ts
  role — on-site agent API: poll for ready jobs, claim, report complete/failed
  details — same X-Kiosk-Key auth as /api/printer. GET /jobs/ready (RELEASING jobs),
    POST /jobs/:id/start (atomic claim), /jobs/:id/complete + /jobs/:id/failed,
    /printer/capabilities (V2-44 auto-discovery push).

01-backend/routes/payments.routes.ts
  role — payment orchestration: Paystack init + webhook + payouts
  details — /initialize (tenant-resolved) starts a Paystack charge with commission split;
    /webhook (optionalTenant, Paystack POSTs with no host context; tenant derived from
    metadata.tenantId) handles charge.success / transfer etc.; payout initiation endpoint.
    Paystack webhook verifies HMAC-SHA512 against the raw body (captured by express.json
    verify hook in app.ts).

01-backend/routes/cups.routes.ts
  role — CUPS-printing backend ingress (token-auth, no JWT)
  details — laptops add PrintLoop as a CUPS printer; that backend POSTs print jobs here.

01-backend/routes/files.routes.ts
  role — uploaded document fetch endpoint
  details — serves stored files to kiosk/agent (public, no auth). Backed by fileStore.

01-backend/routes/publicPricing.routes.ts
  role — public pricing matrix (anonymous, tenant-resolved by host)
  details — same data admin edits + customer app sees, without JWT. Used by group-participant
    upload and landing page.

01-backend/routes/publicBranding.routes.ts
  role — public branding endpoint (Dimension 7, anonymous)
  details — powers BrandProvider's first-paint colour/wordmark/favicon swap.

01-backend/routes/blog.routes.ts
  role — public marketing blog read API (V2-54)
  details — published posts only, no auth.

01-backend/routes/legal.routes.ts
  role — legal/compliance documents (DPA, Terms, Privacy) — anonymous public.

01-backend/routes/preflight.routes.ts
  role — preflight analysis endpoint (anonymous, tenant-resolved by host)
  details — document pre-flight checks before upload/print.

01-backend/routes/render.routes.ts
  role — render-worker callback endpoint (platform-level, no tenant middleware)
  details — POST /callback (success: flip RENDERING→READY, persist artifact, reconcile cost)
    and /failure (flip RENDERING→FAILED). HMAC-SHA256 signed against RENDER_CALLBACK_SECRET
    using the raw body; rejects when secret unconfigured.

01-backend/routes/platform.routes.ts
  role — platform admin console API (Dimension 11, SUPER_ADMIN only)
  details — list/suspend/reactivate tenants, mint impersonation tokens, hard-delete tenants
    (irreversible, audit-first), fleet reliability metrics (kiosk online rate + job success
    rate + paid-but-unredeemed counts). No resolveTenant; authenticate + requirePlatformAdmin.

01-backend/routes/blog.routes.ts (already listed under public; kept separate for admin writes)
  role — marketing blog read (public) vs admin write (admin.routes)
  details — public reads via blog.routes; admin create/update/delete via admin.routes.
