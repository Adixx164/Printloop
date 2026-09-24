# CODEBASE DICTIONARY — PrintLoop SaaS v2

> One-file map of the whole repo. Split into this file from 7 separate dictionaries on 2026-09-13.
> Order: high-level folders first, then the remaining items previously missing, then cross-cutting reference.

---

## Table of Contents

1. [Backend — Entities](#1-backend--entities)
2. [Backend — Middleware](#2-backend--middleware)
3. [Backend — Routes (API surface)](#3-backend--routes-api-surface)
4. [Backend — Services (business logic)](#4-backend--services-business-logic)
5. [Backend — Config / Workers / Utils](#5-backend--config--workers--utils)
6. [Backend — Tests](#6-backend--tests-(still-missing-from-any-dictionary))
7. [Backend — Migrations](#7-backend--migrations-(still-missing-from-any-dictionary))
8. [Legacy Worker (`worker/`)](#8-legacy-worker-worker-)
9. [Cloud Render Worker (`render-worker/`)](#9-cloud-render-worker-render-worker-)
10. [On-Site Agent (`printloop-agent/`)](#10-on-site-agent-printloop-agent-)
11. [Kiosk App (Electron UI + main process)](#11-kiosk-app-electron-ui--main-process)
12. [Frontend — Web App (React + Vite + RTK)](#12-frontend--web-app-react--vite--rtk)
13. [Document Preview Spike (`03-document-preview-component/`)](#13-document-preview-spike-03-document-preview-component-)
14. [CUPS Backend (`tools/cups-printloop/`)](#14-cups-backend-toolscups-printloop-)
15. [Vendor OpenPrinting (`vendor/openprinting/`)](#15-vendor-openprinting-vendoropenprinting-)
16. [Tools, Scripts, Monitoring](#16-tools-scripts-monitoring)
17. [Electron Builder Output (`printloop-kiosk-app/dist/`)](#17-electron-builder-output-printloop-kiosk-appdist-)
18. [Claude Agent Memory (`.claude/`)](#18-claude-agent-memory-claude-)
19. [Interaction Map — How pieces connect](#19-interaction-map--how-pieces-connect)

---

# 1 · Backend — Entities

> Folder: `01-backend/entities/`
> role — database schema as TypeScript classes; each file = one table (or enum).

```
01-backend/entities/user.entity.ts
  role — User table: accounts, roles, 2FA, credentials, print token
  details — uuid pk, tenantId (nullable; customers carry it, admins hang off
    tenant_members), email+tenantId composite unique, passwordHash+salt (bcrypt),
    printToken (CUPS "Print to PrintLoop" credential, nullable unique),
    totpSecret+totpEnabled (2FA), isEmailVerified, verification/reset tokens,
    role enum USER/ADMIN/SUPER_ADMIN, adminPrivileges json, isBlocked+blockReason,
    lastLoginAt, createdAt/updatedAt/deletedAt (soft delete).

01-backend/entities/wallet.entity.ts
  role — Wallet table: per-user ledger bucket
  details — uuid pk, userId unique, tenantId denormalized for index speed,
    balance decimal, one-to-many Transactions. Product removed (no top-ups), but
    kept because transactions.walletId is NOT NULL and completePrintJobPayment
    writes earnings through it.

01-backend/entities/transaction.entity.ts
  role — Transaction table: wallet ledger entries
  details — uuid pk, walletId fk, tenantId nullable (backfilled to legacy),
    type enum TOPUP/PRINT/REFUND/CREDIT, amount gross, commissionAmount (PrintLoop
    slice), description, balanceAfter, reference, createdAt.
    Tenant net = amount - commissionAmount.

01-backend/entities/payment.entity.ts
  role — Payment table: captured payment records (revenue reporting)
  details — uuid pk, tenantId nullable, userId, amount, status SUCCESS/PENDING/FAILED,
    method wallet/card/transfer/ussd, reference, authorizationCode (saved-card delta
    charge, V2-53), description, refundedAt/refundReason/refundAmount/refundType/
    refundedBy, createdAt/updatedAt.

01-backend/entities/printJob.entity.ts
  role — PrintJob table: the core job lifecycle
  details — uuid pk, tenantId nullable, userId nullable (guests in group sessions),
    fileId fk, fileName, code (6-char release code, unique nullable),
    paymentReference, cost (estimate), finalCost (authoritative post-render, V2-52),
    costReconciledAt, totalPages, jobType SINGLE/PERSONAL_BATCH/GROUP_BATCH,
    editingRequired + editingInstructions + editedDocumentUrl (Edit & Print flow),
    status enum (PENDING→RENDERING→AWAITING_ACCEPT/READY/RELEASING/PRINTING/DONE/
    FAILED/EXPIRED/REFUNDED/AWAITING_EDIT/EDIT_COMPLETE/AWAITING_PAYMENT/PAID),
    printConfiguration json (copies, paper, color, sided, qualityDpi, orientation),
    kioskId fk, printerProfileId nullable (V2-56 render target),
    requiresAccept (marketplace accept window, V2-58), reroutedFromTenantId,
    printerId, printerName, groupSessionId, watermarkId, pagesCompleted,
    agentConfirmation (V2-44 job-truth: "ipp-job-state:confirmed" etc.),
    renderedKey/renderedPdfUrl/previewImageUrls, renderingStatus+renderingError+
    renderingStartedAt/renderingCompletedAt, idempotencyKey (CUPS retry dedup),
    expiresAt, completedAt, createdAt/updatedAt.
    Partial-unique index on (userId, idempotencyKey) where key is not null.

01-backend/entities/printJobItem.entity.ts
  role — PrintJobItem table: per-document rows inside a batch job
  details — holds individual file + settings for batched / group jobs where the
    parent PrintJob is the release-code umbrella and each item has its own page
    count, cost, and print config.

01-backend/entities/file.entity.ts
  role — File table: stored uploaded documents
  details — uuid pk, tenantId, fileName, mimeType, sizeBytes, fileURL (local or
    S3/Cloudinary), pageCount, watermarkedUrl (legacy), createdAt/updatedAt.
    Served at /api/files for kiosk/agent fetch.

01-backend/entities/kiosk.entity.ts
  role — Kiosk table: physical print stations
  details — uuid pk, tenantId nullable (backfilled), name, location, campus, shopId,
    apiKey unique, status ACTIVE/MAINTENANCE/OFFLINE/DISABLED, printerName/model,
    ipAddress, lastSeenAt, lastPrintedAt, lastOfflineAlertAt (alert cooldown),
    testPrintPassedAt (live gate for discoverability, V2-32),
    capColor/capDuplex/capA3 nullable (auto-discovered via IPP, V2-44),
    capMedia json, capUpdatedAt, totalJobsPrinted/totalPagesPrinted counters,
    notes, mapsUrl, isPublic (show on Stations page), createdAt/updatedAt/deletedAt.

01-backend/entities/pricingConfig.entity.ts
  role — PricingConfig table: per-tenant 24-cell price matrix
  details — uuid pk, tenantId nullable, paperSize A4/A3/LETTER/LEGAL,
    colorType BLACK_WHITE/COLOR, unique (tenantId, paperSize, colorType),
    legacy pricePerPage + duplexMultiplier + highResolutionMultiplier,
    six per-cell price columns price{100,300,600}{Simplex,Duplex} nullable,
    isActive, currency NGN, notes, officeConversion flag (V2-48),
    createdAt/updatedAt.

01-backend/entities/promotion.entity.ts
  role — Promotion table: admin-managed discount codes
  details — uuid pk, tenantId nullable, code (composite unique with tenantId),
    name, description, discountType percentage/fixed/free_pages, discountValue,
    status active/inactive/expired, usageCount, maxUses, startsAt/endsAt,
    createdAt/updatedAt.

01-backend/entities/tenant.entity.ts
  role — Tenant table: one printing business per SaaS row
  details — uuid pk, name, slug unique (subdomain + X-Tenant-Slug),
    customDomain unique nullable, status TRIAL/ACTIVE/SUSPENDED/CLOSED,
    commissionPct (decimal 0.10 default), paystackSubaccountCode nullable,
    suspendedAt/suspendReason, address/lat/lng (marketplace geocoding, V2-30),
    isDiscoverable (marketplace opt-in, default off),
    availability open/busy/closed (V2-57), lmsKey (campus LMS handoff, V2-44),
    photos json (Cloudinary URLs), createdAt/updatedAt.
    Legacy tenant slug 'legacy' owns pre-multi-tenancy rows.

01-backend/entities/tenantMember.entity.ts
  role — TenantMember join table: tenant ↔ user roles
  details — links users to tenants with owner/admin/staff roles.
    SUPER_ADMIN users get synthetic memberships; customers stick to user.tenantId.

01-backend/entities/tenantBranding.entity.ts
  role — TenantBranding table: white-label colors/wordmark (Dimension 7)
  details — per-tenant branding overrides surfaced to the frontend via /api/branding.

01-backend/entities/tenantDomain.entity.ts
  role — TenantDomain table: custom domain mappings (Dimension 8)
  details — one row per custom domain owned by a tenant.

01-backend/entities/tenantWebhook.entity.ts
  role — TenantWebhook table: outbound webhook subscriptions (Dimension 14)
  details — per-tenant webhook endpoints + event filters.

01-backend/entities/tenantBalance.entity.ts
  role — TenantBalance denormalized rollup (V2-8)
  details — O(1) dashboard reads; precomputed tenant earnings snapshot.

01-backend/entities/payout.entity.ts
  role — Payout table: tenant payouts
  details — payout lifecycle records (trigger, status, amount, Paystack reference).

01-backend/entities/payoutSchedule.entity.ts
  role — PayoutSchedule table: per-tenant payout cadence
  details — cadence (e.g. WEEKLY), dayOfWeek, minPayoutAmount.

01-backend/entities/auditLog.entity.ts
  role — AuditLog table: immutable action trail
  details — actorId, actorName, action, target, detail json, ipAddress, createdAt.

01-backend/entities/groupSession.entity.ts
  role — GroupSession table: batch group print sessions
  details — hostUserId, groupName, deadline, status, shareUrl, defaultOptions,
    tenantId.

01-backend/entities/groupParticipant.entity.ts
  role — GroupParticipant table: who joined a group session
  details — participant linkage with user + session + their uploaded items.

01-backend/entities/shopReview.entity.ts
  role — ShopReview table: customer reviews of a print shop
  details — tenantId, userId, rating 1-5, comment, photoUrl, createdAt/updatedAt.

01-backend/entities/dispute.entity.ts
  role — Dispute table: customer complaints on a print job
  details — tenantId, userId, printJobId, reason, status PENDING/etc.

01-backend/entities/blogPost.entity.ts
  role — BlogPost table: marketing blog posts (V2-54)
  details — tenantId, slug unique, title, excerpt, content, coverImageUrl,
    authorName, tags, status DRAFT/PUBLISHED, publishedAt, createdAt/updatedAt.

01-backend/entities/printerProfile.entity.ts
  role — PrinterProfile table: per-printer render capabilities (V2-56)
  details — uuid pk, tenantId not null, kioskId nullable, displayName,
    ippUri nullable, driverKind (hplip/gutenprint/ps/gs/retrofit/unknown),
    capabilities json (maxDpi, colorMode, paperSize, duplex),
    isDefault (one per tenant), isActive, createdAt/updatedAt.

01-backend/entities/documentEdit.entity.ts
  role — DocumentEdit table: Edit & Print workflow (V2-XX)
  details — tracks edit job state, operations, fees, shop notes, approval.

01-backend/entities/editPricingConfig.entity.ts
  role — EditPricingConfig table: per-shop editing service pricing (V2-XX)
  details — baseFee, perPageFee, editingEnabled flag.
```

---

# 2 · Backend — Middleware

> Folder: `01-backend/middleware/`
> role — Express request filters that attach context, enforce auth, rate-limit,
>   resolve tenants, and gate admin access before route handlers run.

```
01-backend/middleware/requestContext.middleware.ts
  role — stamps every request with an ID, a child logger, and a finish-time access log
  details — honours inbound X-Request-Id or generates one, echoes it back as a header,
    attaches req.log pre-bound with requestId+method+path, and emits one structured
    access line on response finish (status + duration + tenantId if resolved).
    Mounted first in app.ts so every downstream handler has req.log.

01-backend/middleware/auth.middleware.ts
  role — verifies the Bearer JWT and attaches the user to req.user
  details — extracts token from Authorization header, verifies via utils/jwt,
    loads the User row, rejects blocked users, attaches req.user + req.tenantMemberships
    (decoded from JWT claim) + optional impersonating actor id (platform admin impersonation,
    Dimension 11). Also exports optionalAuth which does the same but never blocks
    (for guest-capable endpoints like group join).

01-backend/middleware/tenant.middleware.ts
  role — resolves req.tenant from host/subdomain/header/auth and enforces access
  details — pickTenantSlug (owned-apex subdomain → X-Tenant-Slug header), pickCustomDomain
    (host that isn't our apex), requestCanAccessTenant (user role + memberships + customer
    route bypass). resolveTenant required on tenant-scoped routes; optionalTenant for
    marketing/signup/platform routes. Priority: custom domain → owned subdomain → header →
    authenticated user → legacy fallback. Suspended → 403, closed → 410, not member → 403.
    LEGACY_TENANT_SLUG = 'legacy' exported for seed/backfill.

01-backend/middleware/rateLimit.middleware.ts
  role — per-tenant + per-IP rate limits on auth and general API surfaces
  details — wraps express-rate-limit with RedisStore when REDIS_ENABLED, else MemoryStore.
    shouldSkip() no-ops when DISABLE_RATE_LIMIT=1 or Redis off (dev escape hatches).
    tenantKey() prefixes every key with resolved tenant id so tenants don't share quotas.
    Exports: apiLimiter (100/min), loginLimiter (5/15min), signupLimiter (3/hour),
    otpLimiter (10/hour), passwordResetLimiter (5/hour).

01-backend/middleware/rbac.middleware.ts
  role — fine-grained admin permission + tenant-membership gates
  details — Permission enum (VIEW_DASHBOARD, MANAGE_PRICING, MANAGE_KIOSKS, VIEW_JOBS,
    REQUEUE_JOBS, CANCEL_JOBS, MANAGE_BLOG, ISSUE_REFUNDS, BLOCK_USERS, EXPORT_REPORTS,
    VIEW_SETTINGS, MANAGE_ROLES, VIEW_AUDIT_LOG, etc.). requirePermission(...perms)
    enforces admin/super_admin + all listed perms + tenant membership (unless SUPER_ADMIN).
    requireTenantMembership(...roles) gates tenant-scoped routes by TenantMemberRole.
    Populates req.admin for downstream handlers.

01-backend/middleware/platformAdmin.middleware.ts
  role — gates platform-only routes to SUPER_ADMIN
  details — used on /api/platform/*; must run after authenticate. Rejects non-super_admin.

01-backend/middleware/kioskAuth.middleware.ts
  role — authenticates kiosk/appliance requests by X-Kiosk-Key header
  details — looks up the Kiosk by apiKey (not JWT), attaches req.kiosk. Used on
    /api/printer/* and /api/agent/* so the kiosk panel and on-site agent authenticate
    with their long-lived key rather than a user JWT.

01-backend/middleware/bruteForce.middleware.ts
  role — brute-force protection on sensitive endpoints
  details — applied (e.g.) on /api/printer/validate-code to slow repeated code guesses.

01-backend/middleware/verifiedEmail.middleware.ts
  role — requires email-verified users on selected routes
  details — checks req.user.isEmailVerified; used where unverified accounts must not proceed.
```

---

# 3 · Backend — Routes (API surface)

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
```

---

# 4 · Backend — Services (business logic)

> Folder: `01-backend/services/`
> role — reusable business logic imported by routes/controllers/workers.
>   Heavy lifts: pricing, payments/commission, kiosk lifecycle, render queue,
>   onboarding, payouts, documents, notifications, webhooks, audit, policy.

```
01-backend/services/pricing.service.ts
  role — authoritative cost computation shared by every ingress path
  details — priceOf (flat-rate fallback, ₦5 floor), computeCost (DB-backed: pick exact
    per-cell price for (dpi,duplex) if populated; else legacy multiplier path; else
    flat-rate; ₦5 floor enforced). Maps paper strings to PaperSize, picks the active
    PricingConfig by paper+color, uses pickCell to choose among the six per-cell columns.

01-backend/services/commission.service.ts
  role — Bolt-style per-transaction commission split
  details — computeCommissionSplit(tenant, grossAmount) returns gross/commission/tenantNet/
    rateUsed; commissionInKobo for Paystack's transaction_charge; tenantNetFromTransaction
    inverse; clampRate caps at 50%; round2 half-up. Must match Paystack Split exactly.

01-backend/services/payments.service.ts
  role — payment orchestration helpers (Paystack init + webhook handling)
  details — builds Paystack checkout params with commission split, verifies webhook signatures,
    reconciles payment status onto jobs. Works with completePrintJobPayment for the charge
    success path.

01-backend/services/paystack.service.ts
  role — Paystack client wrapper (charges, subaccounts, authorizations)
  details — wraps Paystack REST API for card charges, saved-card authorization codes
    (V2-53), subaccount creation during onboarding, and payout initiation.

01-backend/services/kiosk.service.ts
  role — Kiosk CRUD + lifecycle + connectivity probing
  details — KioskService class: createKiosk (auto apiKey KSK_<random>, defaults public),
    getKioskById (tenant-scoped when tenantId passed), getKioskByApiKey (key is the binding),
    listKiosks (tenant-scoped filters: status/campus/location; warns on missing tenantId),
    updateKioskStatus, updateKiosk, regenerateApiKey, recordPrintJob (increments counters +
    lastPrintedAt), getOfflineKiosks (lastSeenAt cutoff), testConnection (TCP connect to
    631/6310/9100 serial probe), deleteKiosk (soft disable).

01-backend/services/renderEnqueue.service.ts
  role — render queue enqueue + callback apply + reconciliation
  details — enqueueRender (Redis-aware: rejects when Redis disabled or job not in a trigger
    state PENDING/AWAITING_ACCEPT or batch parent; flips RENDERING before enqueue, reverts on
    failure; resolves printer profile + render opts for the worker; enqueues BullMQ 'render'
    job). enqueueRenderOrReady (tries enqueueRender; on rejection promotes straight to READY
    or AWAITING_ACCEPT for fallback deployments). applyRenderResult (RENDERING→READY, persists
    renderedKey/pageCount/bytes/preview, runs cost reconciliation). applyRenderFailure
    (RENDERING→FAILED, emits JOB_FAILED webhook). reconcileStuckRenders (sweeps RENDERING jobs
    past threshold; re-enqueues or fails them).

01-backend/services/costReconciliation.service.ts
  role — final-cost reconciliation after render (V2-52)
  details — applyRenderCostReconciliation: authoritative page count from render worker → finalCost;
    when final < paid, auto-refund delta to customer wallet atomically with the status flip;
    when final > paid, leave shortfall on the job for the kiosk release gate to collect
    (settleShortfall charges the saved card). settleShortfall used by printer/complete.

01-backend/services/tenantBalance.service.ts
  role — tenant balance rollup updates
  details — applyTransactionDelta updates the denormalized TenantBalance after a transaction
    lands (earnings snapshot for O(1) dashboard reads).

01-backend/services/audit.service.ts
  role — audit log writing
  details — writeAudit(req, action, target, detail): persists an AuditLog row, stamping actorId
    (+ impersonating actor when present), ipAddress from request context.

01-backend/services/onboarding.service.ts
  role — SaaS tenant signup + owner verification + slug/email validation
  details — signupTenant, verifyOwnerEmail, resendOwnerVerification, plus domain errors
    SlugUnavailableError / EmailTakenError / ValidationError.

01-backend/services/payout.service.ts
  role — payout initiation + balance checks
  details — getAvailableBalance, initiatePayout (triggers a payout against the tenant's
    Paystack subaccount, subject to schedule + min amount).

01-backend/services/email.service.ts
  role — transactional email via SMTP (nodemailer), best-effort, no-SMTP dev no-op
  details — EmailService class: constructor builds transporter only when SMTP_HOST set,
    else no-ops + logs body to stdout (E2E tests scrape the dev log). send() supports
    branding (TenantBranding colors/wordmark/logo) per tenant. Used for receipts, job-ready
    codes, password reset tokens, verification.

01-backend/services/sms.service.ts
  role — SMS via Termii (NGN-focused), best-effort
  details — SMSService class: send(phoneNumber, message) normalized to international format;
    sendPrintJobCode({phoneNumber, jobCode, fileName, cost}) and sendOTP. Returns false on
    missing api key or API error; callers treat as best-effort.

01-backend/services/printPolicy.service.ts
  role — server-side print-script policy evaluation + IPP connection prefs + dispatch mode
  details — evaluatePrintPolicy (block/mutate on max pages, max copies, force monochrome over
    N pages, force duplex over N pages, deny color, blocked file types — driven by system
    settings). ippConnectionPrefs (secure/port/path/version/rawPort from settings).
    printDispatchMode (cloud-push vs kiosk-pull).

01-backend/services/printerExtensions.service.ts
  role — print-job completion bookkeeping (counters, status, audit)
  details — PrinterServiceExtensions: completePrintJob marks the job DONE, increments kiosk
    counters via KioskService, records completion time, emits audit. Used by printer/complete
    after a successful dispatch.

01-backend/services/ipp.service.ts
  role — IPP / raw9100 / LPR / email dispatch primitives
  details — IppService: printJob (IPP Print-Job), rawPrint (JetDirect + PJL prologue),
    lprPrint, emailPrint. Builds IPP attributes from PrintOptions. Used by printer/complete
    cloud-push path and shared with agent patterns.

01-backend/services/documentConvert.service.ts
  role — document normalization: page count, ensure-PDF, annotation flattening, grayscale,
    orientation fit, native-language render (Option A)
  details — countPages (pdf-lib for PDFs, 1 for images; encrypted/unreadable → error),
    isPrintableDocument, ensurePdf (PDF passthrough / image→PDF wrap to A4), parsePageRange,
    extractPages (page-range subset), flattenAnnotations (rasterize annotated pages via
    pdfjs-dist + @napi-rs/canvas; byte-exact when no annotations or on failure),
    toGrayscale (Ghostscript pdfwrite → DeviceGray; graceful fallback to original bytes),
    fitToOrientation (scale-to-fit the chosen sheet, no rotation, no crop; graceful fallback),
    renderToPrinterLanguage (Ghostscript PDF→PS via ps2write or PDF→PCL-XL via pxlmono/pxlcolor;
    duplex/copies baked for PS; Not yet wired into live path — spike-only),
    rasterRenderAvailable (diagnostic: can the flatten toolchain load?).

01-backend/services/documentConversion.service.ts
  role — office→PDF conversion black box (V2-48)
  details — isOfficeDocument, conversionEnabled, convertOfficeToPdf (LibreOffice headless /
    Gotenberg depending on config), acceptedDocsLabel, OfficeConversionError. Converts DOCX/
    PPTX/XLSX to PDF before page count, pricing, render, and dispatch see a real PDF.

01-backend/services/groupSession.service.ts
  role — group session lifecycle + batch print data resolution
  details — GroupSessionService: create/close/list sessions, participant management, getBatchPrintData
    (resolves one batch code → all participant files + configs for the kiosk dispatch loop).

01-backend/services/promotion.service.ts
  role — promotion code application
  details — applyPromotion(baseCost, code, {pageCount, perPageBw}) returns {cost, discount, code,
    reason}. Validates code, status, dates, max uses; applies percentage/fixed/free_pages; bumps
    usageCount.

01-backend/services/geocoding.service.ts
  role — address → lat/lng for marketplace discovery
  details — geocodes tenant address on signup/edit so shops appear in nearby /find results.
    Stored as floats on Tenant.

01-backend/services/tenantWebhook.service.ts
  role — outbound tenant webhook dispatch (Dimension 14)
  details — emitTenantEvent(tenantId, event, payload): finds the tenant's webhook subscriptions,
    serializes + POSTs with retry. Used for CUSTOMER_SIGNED_UP, JOB_FAILED, and other events.

01-backend/services/customDomain.service.ts
  role — custom domain provisioning helpers (Dimension 8)
  details — validates + configures tenant custom domains (CNAME to domains.printloop.app etc.).

01-backend/services/backup.service.ts
  role — DB backup helpers
  details — backup orchestration for the backend data store.

01-backend/services/etherpad.service.ts
  role — Etherpad integration helpers (collaborative editing, if used)
  details — bridges to an Etherpad instance for shared document editing surfaces.

01-backend/services/sentry.service.ts
  role — Sentry init + error reporting
  details — initSentry() called first in server.ts before other imports; reportError helper
    used by the app error handler.

01-backend/services/adminDashboard.service.ts
  role — dashboard stats aggregation for the admin console
  details — AdminDashboardService.getStats(tenant): aggregates jobs, payments, kiosks, users,
    revenue for the dashboard snapshot.

01-backend/services/acceptWindow.service.ts
  role — Bolt-style accept-window logic for marketplace shops (V2-58)
  details — acceptJob(jobId) transitions awaiting_accept → READY and credits the ledger;
    ACCEPT_WINDOW_MS config; delayed job reroutes or auto-accepts if the shop doesn't accept
    in time.

01-backend/services/tenantDelete.service.ts
  role — tenant hard-delete (irreversible, SUPER_ADMIN only)
  details — hardDeleteTenant(id, {force}): wipes every tenant-scoped row in FK-dependency order,
    then the tenant row. Refuses unless CLOSED + past cooling-off + zero balance unless force.

01-backend/services/tenantExport.service.ts
  role — tenant-level data export
  details — exports tenant-scoped data for GDPR/NDPR compliance.

01-backend/services/abuseLimits.service.ts
  role — upload abuse limits (per-tenant daily bytes)
  details — checkUploadLimit(tenantId, fileSize): returns allowed + usedBytes + limitBytes +
    resetAt; used by customerPrint.routes before accepting uploads.

01-backend/services/qrCode.service.ts
  role — QR code generation for release-code convenience
  details — generates QR payloads (e.g. printloop://release/<code>) shown in the customer UI.
```

---

# 5 · Backend — Config / Workers / Utils

> Folders: `01-backend/config/`, `01-backend/workers/`, `01-backend/utils/`
> role — boot wiring, periodic background jobs, and small cross-cutting helpers.

## config

```
01-backend/config/index.ts
  role — single app configuration object from env
  details — config.app (env/version/port/allowedOrigins), config.database (url/file/ssl/
    poolMax/logging), config.redis (url/host/port/password/enabled), config.auth (jwtSecret/
    jwtExpiresIn), config.saas (commissionPctDefault/apexDomains/domainsCname/seedDemo/
    renderCallbackSecret), config.payments.paystack (public/secret/webhook keys),
    config.storage.s3 + cloudinary, config.email (SMTP), config.sms.termii (apiKey/senderId),
    config.logging (level/pretty), config.sentry (dsn/sample rates), config.render (callbackSecret/
    callbackUrl), config.office (converter=gotenberg, gotenbergUrl), config.print (dispatchMode).

01-backend/config/database.ts
  role — TypeORM DataSource bootstrap + migration runner + post-init data normalizations
  details — AppDataSource: selects SQLite vs Postgres from DATABASE_URL prefix; SQLite boots the
    incremental migration chain (SQLITE_MIGRATIONS), Postgres boots a single PostgresBaseline plus
    dual-driver-guarded later migrations (POSTGRES_MIGRATIONS). synchronize=false, migrationsRun=true.
    runPostInitMigrations(): adds shop_reviews.photoUrl column if missing, uppercases legacy promotion
    codes, backfills per-cell pricing columns for NULL cells (the 24-cell matrix defaults:
    A4/BW, A4/COLOR, A3/BW, A3/COLOR × 100/300/600dpi × simplex/duplex).

01-backend/config/redis.ts
  role — optional Redis client with in-memory stub fallback
  details — REDIS_ENABLED flag; createStub() implements a Map-based stand-in with TTL/expiry/
    incr/keys/ttl so code that touches redisClient runs in dev without a Redis server. Real client
    via redis.createClient when REDIS_URL/REDIS_HOST configured; connect + error/ready logging.

01-backend/config/seed.ts
  role — idempotent boot seed for demo data + legacy tenant + settings catalog
  details — runSeed(): when users table empty AND SEED_DEMO=1, inserts demo super_admin/admin/user,
    wallets, 4 kiosks, 4 pricing configs (the 24-cell matrix), 30 days of jobs/payments, 2 promotions,
    1 group session, 3 blog posts, 2 audit rows; default admin login admin@printloop.test/Admin1234!.
    Production mode (SEED_DEMO != 1) skips demo data but still ensures infrastructure.
    getOrCreateLegacyTenantId(): creates the 'legacy' tenant row if missing.
    ensureLegacyTenant(): on every boot, creates legacy tenant + default weekly payout schedule,
    backfills tenantId on every customer-facing table where null, links existing admin/super_admin
    users as legacy members (owners/admins) without touching shop-owner rows.

01-backend/config/settings.ts
  role — canonical system-settings catalog + idempotent ensure
  details — DEFAULT_SETTINGS array (Storage/Jobs/Payments/Notifications/Branding/Printing/System):
    documentRetentionHours, maxFileSizeMb, allowedFileTypes (read-only PDF,JPG,PNG), maxPagesPerFile,
    autoDeleteAfterPrint, jobExpiryHours, maxCopiesPerJob, jobCodeLength (read-only 6),
    defaultPaperSize/defaultColorMode, allowGroupPrinting/maxGroupParticipants, paystackEnabled,
    currency (read-only NGN), email/sms notifications, companyName/supportEmail/supportPhone,
    policyEnabled + policyMaxPagesPerJob/policyMaxCopiesPerJob/policyForceMonochromeOverPages/
    policyForceDuplexOverPages/policyDenyColor/policyBlockedFileTypes, ippSecure/ippPort/ippPath/
    ippTlsRejectUnauthorized/ippVersion/ippTransport/ippRawPort/printDispatchMode, maintenanceMode/
    maintenanceMessage/appVersion (read-only). ensureSystemSettings(): inserts missing keys, never
    overwrites existing values, forces allowedFileTypes to the read-only PDF/JPG/PNG truth.

01-backend/config/validateEnv.ts
  role — production env fail-fast gate
  details — validateDeployEnv() returns EnvIssue[]; required checks for DATABASE_URL, REDIS_URL,
    RENDER_CALLBACK_SECRET, PAYSTACK_SECRET_KEY, PRINTLOOP_APEX_DOMAINS; JWT_SECRET must be ≥16 chars
    and not the dev fallback; SEED_DEMO=1 and DISABLE_RATE_LIMIT=1 are flagged as production-forbidden.
    assertDeployConfig() throws on first boot if any issues in production; dev/test returns [].
```

## workers (backend-side, BullMQ consumers)

```
01-backend/workers/queues.ts
  role — BullMQ queue definitions (render, accept-window, notifications, etc.)
  details — exports renderQueue (+ others) configured against Redis; used by renderEnqueue.service
    and accept-window scheduling.

01-backend/workers/scheduled.worker.ts
  role — scheduled (cron-style) background job runner
  details — hosts periodic jobs like reconcileStuckRenders sweeps, retention, alerts.

01-backend/workers/webhook.worker.ts
  role — outbound webhook dispatch worker
  details — consumes webhook jobs with retry/backoff so tenant webhooks don't block request threads.

01-backend/workers/watermark.worker.ts
  role — watermarking worker (legacy/optional)
  details — watermark pipeline for uploaded documents (if/when watermarking is enabled).

01-backend/workers/fileCleanup.worker.ts
  role — expired/uploaded-file cleanup
  details — enforces documentRetentionHours by deleting served files past retention.

01-backend/workers/retention.ts
  role — retention sweep starter
  details — startRetentionSweep() kicks off periodic local-disk cleanup for expired jobs (no Redis
    required); called from server.ts after listen.
```

## utils

```
01-backend/utils/fileStore.ts
  role — uploaded-file persistence: local disk + optional S3/Cloudinary
  details — saveBuffer(buffer, fileName): writes to UPLOAD_DIR, optionally uploads to S3 and/or
    Cloudinary based on env, returns {url, localPath}. loadDocumentBytes(url): fetches bytes for
    dispatch/render. Signed URLs via S3 presigner when S3 configured. PUBLIC_BASE used for local URLs.

01-backend/utils/jwt.ts  (backend JWT mint/verify + membership loading)
  role — JWT signing, verification, and membership loading for auth
  details — JWT_SECRET (env with dev fallback), JWT_EXPIRES_IN (7d default), getJwtSecret() strict
    accessor for anonymous token surfaces (throws if missing/weak), JwtTenantMembership interface,
    JwtPayload (userId/role/memberships/impersonating), signAccessToken(payload, options),
    verifyToken(token) → JwtPayload, loadMembershipsForUser(userId) → memberships from DB.

01-backend/utils/releaseCode.ts
  role — cryptographically random 6-char release codes
  details — RELEASE_CODE_ALPHABET (Crockford-style, no 0/O/1/I/L, no vowels), makeCode(n) using
    randomBytes + modulo over a 32-symbol alphabet (zero bias because 256 % 32 = 0).

01-backend/utils/logger.ts
  role — structured logger (child loggers + request context)
  details — logger + logger.child() used by requestContext.middleware to bind requestId/method/path;
    child loggers also bind tenantId after resolution.

01-backend/utils/observability.ts
  role — error reporting bridge to Sentry
  details — reportError(err, context) used by app.ts error handler; no-op when Sentry unconfigured.

01-backend/utils/totp.ts
  role — TOTP 2FA helpers
  details — generateTotpSecret, buildOtpAuthUrl (qr provisioning), verifyTotp(secret, code).

01-backend/utils/limits.ts
  role — upload limits from system settings
  details — getUploadLimits(): maxFileBytes + maxPages from settings; used by customerPrint.routes.

01-backend/utils/handoffOnce.ts
  role — one-shot handoff guard (e.g. prevent duplicate processing)
  details — ensures an action fires only once under a given key.

01-backend/utils/s3.ts
  role — S3 helpers (presigned URLs, upload/delete)
  details — complements fileStore for direct S3 operations when needed.

01-backend/utils/totp.test.ts
  role — TOTP unit tests
  details — verifies generate/verify round-trip.
```

## bootstrap + app factory

```
01-backend/server.ts
  role — application entry point / bootstrap
  details — imports reflect-metadata + dotenv, initSentry first (V2-34: before any throwable import),
    creates AppDataSource, runs assertDeployConfig, initializes DB, runPostInitMigrations, runSeed,
    ensureLegacyTenant, ensureSystemSettings, createApp(), listen on config.port, startRetentionSweep.
    Single bootstrap() with try/catch + process.exit(1) on failure.

01-backend/app.ts
  role — Express app factory
  details — createApp(): requestContext first, appliance CORS for /api/printer|/api/agent|/api/
    participant-upload (origin:true, X-Kiosk-Key/X-Upload-Token/Authorization), global CORS for
    ALLOWED_ORIGINS, express.json with rawBody capture (Paystack HMAC), express.urlencoded, /health,
    /api (openapi), /api/discovery (anonymous), /api/integrations (anonymous), rate-limit prefix
    mounts, /api/auth (optionalTenant + passwordResetRoutes), /api/saas, /api/render (HMAC callback,
    no tenant middleware), /api/platform (super admin, no resolveTenant), /api/admin/auth,
    /api/admin/kiosks (authenticate+resolveTenant), /api/admin/disputes, optional /api/admin/spike,
    /api/admin (authenticate+resolveTenant), /api/groups, /api/participant-upload, /api/printer,
    /api/agent, /api/payments (optionalTenant), /api/pricing (optionalTenant), /api/branding,
    /api/legal, /api/preflight, /api/blog, /api/cups (resolveTenant), /api/customer/auth (optionalTenant),
    /api/customer (authenticate+resolveTenant), /api/files, /api (optionalTenant + devApi), 404 handler,
    error handler (multer→413/400, Sentry reportError, 500 JSON). Returns Application.

01-backend/worker.ts
  role — legacy worker bootstrap (reference)
  details — older worker entry point; the active render path now lives in render-worker/.
```

---

# 6 · Backend — Tests (still missing from any dictionary)

> Folder: `01-backend/tests/`
> role — backend unit + integration tests. 12 files. Not yet catalogued in any dictionary file.

```
01-backend/tests/accept-window.test.ts          — V2-58 marketplace accept-window logic (acceptJob transition, delayed reroute / auto-accept, ledger credit). 11.2 KB.
01-backend/tests/backup.test.ts                 — DB backup orchestration helpers. 2.6 KB.
01-backend/tests/cost-reconciliation.test.ts    — V2-52 final-cost reconciliation: render page count → finalCost, auto-refund delta when underpaid, shortfall tracking when overpaid, settleShortfall on saved card. 13.8 KB.
01-backend/tests/cups-billing.test.ts           — CUPS-print path billing parity: CUPS-submitted jobs bill through Paystack same as web uploads (V2-55); token-auth print job creation + cost + release code. 6.8 KB.
01-backend/tests/document-conversion.test.ts    — office→PDF conversion gate (V2-48): LibreOffice/Gotenberg path, accepted Docs label, OfficeConversionError. 2.6 KB.
01-backend/tests/printer-profiles.test.ts       — V2-56 printer profile CRUD + render-capability resolution: profile selection on enqueue, DPI/colour/paper fit override of job settings. 6.1 KB.
01-backend/tests/render-pipeline.test.ts       — render pipeline wiring: enqueueRender, applyRenderResult, applyRenderFailure, callback ↔ status flip (RENDERING→READY/FAILED), stuck-render reconciliation. 8.5 KB.
01-backend/tests/spec-gaps.test.ts              — spec gap coverage: tests for endpoints/flows that exist in code but lack OpenAPI spec coverage. 7.0 KB.
01-backend/tests/tenant-isolation.test.ts       — multi-tenancy isolation: tenant-scoped reads/writes, legacy backfill correctness, cross-tenant access rejection. 10.6 KB.
01-backend/tests/transports.test.ts             — print transport tests (IPP / raw9100 / spooler paths): dispatch + confirm logic. 4.9 KB.
01-backend/tests/validateEnv.test.ts            — validateDeployEnv / assertDeployConfig env gate: required-var checks, weak-JWT detection, production-forbidden flags (SEED_DEMO, DISABLE_RATE_LIMIT). 2.7 KB.
01-backend/tests/totp.test.ts                   — TOTP 2FA helpers: generateTotpSecret / buildOtpAuthUrl / verifyTotp round-trip. (in utils/totp.test.ts — note: lives under utils/, not tests/)
01-backend/tests/virtual-printer.test.ts        — virtual printer / print dispatch simulation: CUPS backend behaviour, idempotency, retry exit codes. 12.8 KB.
```

Note: `utils/totp.test.ts` lives under `01-backend/utils/`, not `tests/`; it is the TOTP unit test referenced by the utils section.

---

# 7 · Backend — Migrations (still missing from any dictionary)

> Folder: `01-backend/migrations/`
> role — TypeORM migration files. 32 files total. 1 incremental SQLite chain +
>   1 PostgresBaseline + 30 feature migrations (dual-driver guarded for Postgres).
>   Not yet catalogued in any dictionary file.

## Schema foundation

```
1700000000000-InitSchema.ts                     — initial schema: core tables before multi-tenancy (User, Wallet, Transaction, PrintJob, File, Kiosk, PricingConfig, Promotion).
```

## SaaS foundation + multi-tenancy bootstrap

```
1717100000000-CreateSaasFoundation.ts           — SaaS base: Tenant, TenantMember, TenantBranding, TenantDomain, TenantWebhook, TenantBalance, Payout, PayoutSchedule, AuditLog.
1717200000000-AddTenantIdColumns.ts             — adds tenantId to customer-facing tables (PrintJob, File, PricingConfig, Promotion, Kiosk, etc.).
1717300000000-TightenTenantUniqueness.ts        — unique constraints that require tenantId (e.g. slug, customDomain).
1717400000000-AddRenderingStatus.ts             — renderingStatus + renderingError + renderingStartedAt/renderingCompletedAt on PrintJob.
1717500000000-AddPrintJobItemTenantId.ts        — tenantId on PrintJobItem (batch item scoping).
1717600000000-CreateTenantBalances.ts           — TenantBalance denormalized rollup table (V2-8).
1717700000000-TightenTenantIdNotNull.ts         — enforces NOT NULL on tenantId for customer-facing tables after backfill.
```

## Tenant identity + multi-tenancy wiring

```
1717800000000-CreateTenantDomains.ts            — TenantDomain custom-domain mapping table.
1717900000000-CreateTenantWebhooks.ts           — TenantWebhook outbound webhook subscription table.
1718000000000-CreateTenantBrandings.ts          — TenantBranding white-label colours/wordmark table.
```

## Feature migrations (chronological, newest first — timestamps are epoch ms)

```
1721000000000-CreateEditPricingConfigsTable.ts  — EditPricingConfig: per-shop editing-service pricing (baseFee, perPageFee, editingEnabled).
1720900000000-CreateDocumentEditsTable.ts       — DocumentEdit: Edit & Print workflow state, operations, fees, shop notes, approval.
1720800000000-AddEditingFieldsToPrintJob.ts     — editingRequired + editingInstructions + editedDocumentUrl on PrintJob (first pass).
1720700000000-AddEditingFieldsToPrintJob.ts     — editing fields add (second pass / diff — same name, likely a no-op or additive column).
1720600000000-AddOfficeConversionToPricing.ts   — officeConversion flag on PricingConfig (V2-48).
1720500000000-AddAcceptWindowFields.ts          — requiresAccept + accept-window fields on PrintJob (V2-58).
1720400000000-AddTenantAvailability.ts          — availability (open/busy/closed) on Tenant (V2-57).
1720300000000-CreatePrinterProfiles.ts          — PrinterProfile table: per-printer render capabilities (V2-56).
1720200000000-CreateBlogPosts.ts                — BlogPost marketing blog table (V2-54).
1720100000000-AddPaymentAuthorizationCode.ts    — authorizationCode on Payment (saved-card delta charge, V2-53).
1720000000000-AddPrintJobFinalCost.ts           — finalCost + costReconciledAt on PrintJob (V2-52 authoritative post-render cost).
1719100000000-AllowNullableTransactionWalletId.ts — makes Transaction.walletId nullable (legacy compat).
1719000000000-AddJobTruthKioskCapsLmsKey.ts     — agentConfirmation + kiosk capability caps + lmsKey fields (V2-44 job-truth + discoverability).
1718800000000-AddKioskLastOfflineAlertAt.ts     — lastOfflineAlertAt on Kiosk (alert cooldown).
1718700000000-AddPrintJobRenderFields.ts        — renderedKey/renderedPdfUrl/previewImageUrls + rendering metadata on PrintJob.
1718600000000-CreateDisputesAndReviews.ts       — Dispute + ShopReview tables.
1718500000000-AllowNullablePrintJobCode.ts      — makes PrintJob.code nullable (pre-code jobs).
1718400000000-AddKioskTestPrintPassedAt.ts      — testPrintPassedAt on Kiosk (live discoverability gate, V2-32).
1718300000000-AddTenantLocation.ts              — address/lat/lng on Tenant (marketplace geocoding, V2-30).
1718200000000-AddUserTotp.ts                    — totpSecret + totpEnabled on User (2FA, V2-22).
```

## Driver-specific baseline

```
1718100000000-PostgresBaseline.ts               — single consolidated baseline for Postgres; replaces the incremental chain when DATABASE_URL is Postgres.
```

(The 32-file count includes the two `AddEditingFieldsToPrintJob.ts` entries as separate files; the dictionary lists 30 distinct named migrations + InitSchema + PostgresBaseline.)

---

# 8 · Legacy Worker (`worker/`)

> Folder: `worker/`
> role — OLDER render-worker implementation. Now superseded by `render-worker/`
>   for the live path; kept as a reference / fallback. Not catalogued anywhere before.

```
worker/src/index.ts
  role — BullMQ worker entry point (legacy)
  details — creates a 'render' Worker against Redis, consumes RenderManifest from job data,
    constructs a RenderPipeline (S3 config + layerKey function), chooses run vs mock based on
    RENDER_USE_OPENPRINTING, calls postRenderSuccess on done and postRenderFailure on failed,
    fail-fast on old Redis (BullMQ needs Redis ≥ 5.0), SIGINT shuts down cleanly.
    Concurrency from WORKER_CONCURRENCY (default 2).

worker/src/executor.ts
  role — RenderPipeline orchestration class (legacy)
  details — run(manifest): builds RenderInput from manifest, delegates to renderToPwgRaster
    (pipeline/render.ts) — the single source of truth (V2-41 dedup, executor no longer
    re-implements rendering). mock(manifest): no-S3, no-Ghostscript simulation for dev / callback
    e2e; returns same RenderResult shape so the API callback path is identical. estimatePages
    fallback (pages from config or 5), safeTenantId slugification.

worker/src/callback.ts
  role — render→API callback (legacy, identical contract to render-worker)
  details — postRenderSuccess + postRenderFailure. HMAC-SHA256 sign raw body with RENDER_CALLBACK_SECRET,
    POST to PRINTLOOP_API_URL + /api/render/callback or /api/render/failure with X-Render-Signature.
    Fail-open: callback errors are logged, never thrown (don't retry the expensive render).
    Reconciliation job for orphans still TODO.

worker/src/types.ts
  role — shared types for the legacy worker
  details — S3Config, RenderManifest (printJobId, tenantId, sourceFileKey, sourceFileUrl,
    fileName, printConfiguration, printerProfileId, watermarkId), RenderResult
    (renderedKey, renderedPdfUrl, previewImageUrls, pageCount, bytes, durationMs).
    Unified result shape so executor + pipeline + callback don't drift (V2-41).

worker/src/pipeline/render.ts
  role — render pipeline: download → normalise → rasterise → upload (legacy, fuller toolchain)
  details — renderToPwgRaster(RenderInput): downloads source (URL or S3), converts office→PDF
    via LibreOffice (soffice headless), wraps images into A4 PDF via pdf-lib, applies page-range
    slicing + watermark + orientation fit + printer-profile paper fit (V2-56) via pdf-lib
    processPdf, normalises to PDF/A via Ghostscript, optionally to grayscale, rasterises to
    PWG-Raster via cups-filters pdftopwg (dpi/colour from profile or job settings), counts pages
    from PWG Raster-Count markers, uploads .pwg + .pdf + up to 3 JPEG previews to S3 (or local
    fallback), returns RenderResult. Generates previews via pdfjs-dist + @napi-rs/canvas.
    Also exports parsePageRange, fitToPaper, standardFontDataUrl helpers.
    NOTE: this file is the more complete/active render implementation; render-worker/src/pipeline/render.ts
    is a parallel copy/simplification. Confirm which is the live path before editing either.

worker/scripts/_fireOnce.ts
  role — one-shot script helper (likely handoff/execution guard)
  details — small utility; treat as internal. Not a top-level entry point.

worker/dist/ (if present)
  role — compiled legacy worker output
  details — dist/index.js, dist/executor.js, dist/callback.js, dist/types.js, dist/pipeline/render.js.
```

**Interaction:** legacy worker consumes the same `render` BullMQ queue + `RenderManifest` contract as `render-worker/`. The backend's `renderEnqueue.service.ts` enqueues into that queue; whichever worker is running (legacy `worker/` or `render-worker/`) picks up the job, renders, and POSTs back to `/api/render/callback` / `/api/render/failure`. The callback handler is `01-backend/routes/render.routes.ts`. Confirm which worker binary is actually deployed before touching either implementation.

---

# 9 · Cloud Render Worker (`render-worker/`)

> Folder: `render-worker/`
> role — BullMQ consumer that normalises uploaded PDFs to PWG-Raster in the cloud so
>   kiosks spool pre-rendered artifacts instead of raw PDFs. Sits next to 01-backend as a
>   sibling service; calls back to POST /api/render/callback (HMAC-signed).

```
render-worker/src/pipeline/render.ts
  role — render pipeline: PDF→PWG-Raster + PDF/A normalization + preview + meta
  details — VENDOR_ROOT defaults to ../../vendor/openprinting (cups-filters/libcupsfilters
    binaries). RenderOptions: dpi, color, pageSize, duplex. RenderResult: pwgBuffer,
    pageCount, colorPages, monoPages, mediaSize.
    getBinaryPath(binaryName): searches vendor cups-filters/src, utils, libcupsfilters/src,
    cups-filters/, cups-filters/build, /usr/bin, /usr/local/bin for pdftopwg/gs.
    pdfToPwgRaster(inputPdfPath, options): runs pdftopwg -d dpi -p pageSize -c|-g (-D for
    duplex) → .pwg, reads the file, parses PWG-Raster-Page-Count/Color-Pages/Mono-Pages
    headers, deletes temp .pwg, returns RenderResult. Falls back: pages = colorPages+monoPages
    when page count is 0.
    normalizeToPdfA(inputPdfPath): Ghostscript -dPDFA=2 -sDEVICE=pdfwrite -sProcessColorModel=
    DeviceRGB → _normalized.pdf, returns output path.
    parsePwgMeta(pwgPath): regex-parses PWG-Raster-Page-Count/Color-Pages/Mono-Pages from the
    header text.
    generatePreviewImages(inputPdfPath, maxPages=3): Ghostscript -sDEVICE=jpeg -dJPEGQ=85 -r150
    -dFirstPage=1 -dLastPage=N -sOutputFile=...-preview-%d.jpg → returns generated JPG paths.
    runCommand(command, args): spawns a child process, captures stdout/stderr, rejects on non-zero
    exit or spawn error.

render-worker/src/worker.ts
  role — BullMQ worker entry point
  details — connects to Redis, processes the 'render' queue, pulls file from S3, calls the
    render pipeline, writes the PWG artifact back to S3, extracts page count / color / mono,
    computes final cost via pricing, then POSTs /api/render/callback with HMAC-SHA256 signature
    (X-Render-Signature) using RENDER_CALLBACK_SECRET + raw body. On failure POSTs /api/render/
    failure.

render-worker/src/config/index.ts (+ .js/.d.ts)
  role — render-worker config
  details — VENDOR_ROOT, S3/S3-bucket config, callback URL/secret, worker concurrency.

render-worker/src/utils/logger.ts (+ .js/.d.ts)
  role — render-worker logger

render-worker/src/utils/s3.ts (+ .js/.d.ts)
  role — S3 fetch/store helpers for the render worker
  details — get( key ) → bytes, put( buffer ) → key, signed URL helpers.

render-worker/package.json / package-lock.json / tsconfig.json
  role — render-worker dependencies + TS config

render-worker/dist/ (if present)
  role — compiled render-worker output
  details — dist/pipeline/render.js, dist/worker.js, dist/config, dist/utils.

render-worker/README.md
  role — render-worker readme
  details — likely documents the render flow + TODO for wiring to 01-backend (per 00-START-HERE).
```

---

# 10 · On-Site Agent (`printloop-agent/`)

> Folder: `printloop-agent/`
> role — Node service that runs on the shop LAN and prints jobs the cloud can't reach.
>   Polls /api/agent/jobs/ready, claims a RELEASING job, downloads the bytes, dispatches to
>   the LAN printer via IPP / raw9100 / OS spooler, and reports complete/failed with
>   V2-44 job-truth confirmation.

```
printloop-agent/agent.ts
  role — the entire on-site agent program
  details — loadConfig() reads .env (PRINTLOOP_BASE_URL, KIOSK_API_KEY, PRINTER_IP/NAME,
    PRINTER_PORT, PRINTER_TRANSPORT ipp|raw9100|spooler, PRINTER_RAW_PORT, IPP_PATH,
    IPP_VERSION, POLL_INTERVAL_MS, PRINTER_NAME, SPOOLER_COMMAND, CONFIRM_TIMEOUT_MS,
    CONFIRM_DISABLE). cloudApi(cfg) builds an axios client with X-Kiosk-Key + 30s timeout.
    Main loop: startup probe (/jobs/ready, 401→fatal), reportCapabilities once + every 6h
    (IPP Get-Printer-Attributes → color/duplex/A3/media → POST /api/agent/printer/capabilities),
    then setInterval poll loop with overlap prevention (running guard).
    pollOnce: GET /jobs/ready, for each job call processJob.
    processJob: POST /jobs/:id/start (atomic claim, 409→skip), for each item download bytes
    via signed URL, dispatchToPrinter, then report /jobs/:id/complete or /failed. Only marks
    FAILED if every item failed; partial success → DONE. Reports confirmation (confirmed/
    unconfirmed) + method (ipp-job-state/queue-drain/none) + detail.
    dispatchToPrinter:
      - raw9100 → rawDispatch: PJL prologue (UEL, @PJL JOB NAME, COPIES, DUPLEX, BINDING,
        RENDERMODE, PAPER, ORIENTATION, RESOLUTION, ECONOMODE, ENTER LANGUAGE) + bytes +
        epilogue over TCP; no feedback channel → unconfirmed/none.
      - spooler → spoolerDispatch: writes temp .pdf/.pwg, runs cmdTemplate (default
        Windows Start-Process -Verb PrintTo, Linux lp -d), deletes temp file; then
        confirmSpoolerDrain (Windows: Get-PrintJob powershell query; Linux: lpstat -o) →
        confirmed when queue empty, unconfirmed on timeout/error-state.
      - ipp → ippDispatch: ipp.Printer → Print-Job with operation + job attributes build from
        buildIppJobAttributes (copies, sides, print-color-mode, orientation-requested,
        media iso_a4/iso_a3/na_letter/na_legal, multiple-document-handling + sheet-collate,
        print-quality 3/4/5 from dpi). If jobId undefined → unconfirmed. If CONFIRM_DISABLE →
        unconfirmed. Else confirmIppJob: poll Get-Job-Attributes until completed (confirmed),
        canceled/aborted → throw, timeout/no-support → unconfirmed.
    queryPrinterCapabilities: IPP Get-Printer-Attributes for color-supported,
    print-color-mode-supported, sides-supported, media-supported → {color, duplex, a3, media}.
    reportCapabilities: POSTs capabilities to the backend.

printloop-agent/agent.ts (config + types inline)
  role — config + type definitions
  details — Config interface, Confirmation interface ({state: confirmed|unconfirmed,
    method: ipp-job-state|queue-drain|none, detail?}), ReadyJob/ReadyJobItem interfaces
    (fileId, fileName, downloadUrl, printConfiguration, id, code, jobType, totalPages,
    updatedAt, items).

printloop-agent/package.json / package-lock.json
  role — agent dependencies + scripts

printloop-agent/tsconfig.json
  role — agent TypeScript config

printloop-agent/install.ps1 / install.sh
  role — agent install helpers (Windows + shell)

printloop-agent/build-installer-exe.ps1
  role — builds an installer exe for the agent (Windows)

printloop-agent/.env.example (implied)
  role — agent env template
  details — documents required env vars for the agent.

printloop-agent/dist/ (if present)
  role — compiled agent output
```

**Interaction:** the agent authenticates with the same `X-Kiosk-Key` as the kiosk app main process and the CUPS backend. It reads from `GET /api/agent/jobs/ready` (jobs in RELEASING status), claims via `POST /jobs/:id/start`, downloads the pre-rendered PWG from S3 (or the raw file if no render), dispatches by transport, then reports back to `/jobs/:id/complete` or `/jobs/:id/failed`. The backend's `agent.routes.ts` + `printer.routes.ts` are the server side; `ipp.service.ts` + `printerExtensions.service.ts` are the completion bookkeeping.

---

# 11 · Kiosk App (Electron UI + main process)

> Folder: `printloop-kiosk-app/`
> role — in-store kiosk UI: code entry → job details → printing → settings.
>   Main process manages the Electron window, IPC, heartbeat, IPP print, and
>   print-job fetch + dispatch.

```
printloop-kiosk-app/src/main/index.ts
  role — Electron main-process bootstrap
  details — creates a fullscreen/kiosk BrowserWindow (1920×1080, frameless), loads the
    renderer (dev: localhost:5173; prod: index.html), sets up IPC handlers, starts/stops
    heartbeat, exposes app:get-version / app:get-platform / app:quit / app:restart via IPC,
    logs uncaught exceptions + unhandled rejections.

printloop-kiosk-app/src/main/ipc.ts
  role — IPC handler bridge between renderer and main
  details — setupIpcHandlers(): settings:get / settings:set (KioskSettings), print-job:fetch
    (fetchPrintJob by code via API key), print-job:print (printJob to printerUri + artifactKey),
    printer:list (listPrinters via IPP), printer:test (testPrinter). emitKioskEvent broadcasts
    to renderer via 'kiosk:event'.

printloop-kiosk-app/src/main/heartbeat.ts
  role — periodic heartbeat to the cloud backend
  details — startHeartbeat(): POSTs /api/kiosk/heartbeat (tenantId, kioskName, status:online,
    timestamp) with the API key every heartbeatInterval; emits success/failed events. No-op when
    not configured. stopHeartbeat() clears the interval.

printloop-kiosk-app/src/main/ipp.ts
  role — IPP printer interaction (list, test, PWG print)
  details — listPrinters() via ipp.getPrinters() → PrinterInfo[]; printPwgToIpp(printerUri,
    pwgFilePath): reads the PWG artifact, does IPP Print-Job with document-format
    application/vnd.pwg-raster, returns success + jobId/error; testPrinter(printerUri): Get-
    Printer-Attributes probe → TestPrintResult.

printloop-kiosk-app/src/main/printJob.ts
  role — print-job fetch + PWG dispatch
  details — fetchPrintJob(apiUrl, apiKey, code): GET /api/kiosk/jobs/:code → PrintJobData
    (id, code, artifactKey, pageCount, colorPages, monoPages, cost, customerName, fileName).
    printJob(printerUri, artifactKey): downloads PWG from S3, writes temp .pwg, calls
    printPwgToIpp, cleans up temp file.

printloop-kiosk-app/src/main/settings.ts
  role — kiosk settings persistence + config
  details — getSettings / setSetting / loadSettings: reads/writes kiosk config (apiUrl, apiKey,
    tenantId, kioskName, printerUri, heartbeatInterval, etc.) to a local file; isConfigured()
    checks required fields.

printloop-kiosk-app/src/main/config/index.ts (and .js/.d.ts)
  role — kiosk config types/constants
  details — KioskSettings shape + config helpers.

printloop-kiosk-app/src/main/utils/logger.ts (+ .js/.d.ts)
  role — kiosk main-process logger
  details — structured logging used by main process modules.

printloop-kiosk-app/src/main/utils/s3.ts (+ .js/.d.ts)
  role — S3 download helper for kiosk
  details — downloadFromS3(artifactKey): fetches the pre-rendered PWG artifact bytes.

printloop-kiosk-app/src/preload/index.ts (+ .js/.d.ts)
  role — Electron preload script
  details — exposes a narrow, context-isolated API to the renderer for settings/print-job/
    printer IPC calls; no nodeIntegration.

## renderer (UI)

printloop-kiosk-app/src/renderer/main.tsx
  role — renderer entry point
  details — mounts the React app inside the Electron window.

printloop-kiosk-app/src/renderer/index.html
  role — renderer HTML shell

printloop-kiosk-app/src/renderer/App.tsx
  role — kiosk renderer app shell + screen router
  details — wires up the kiosk screens (code entry, job details, printing, settings, error).

printloop-kiosk-app/src/renderer/types.ts (+ .js/.d.ts)
  role — renderer TypeScript types
  details — shared types for the kiosk renderer.

printloop-kiosk-app/src/renderer/hooks/useKiosk.ts
  role — kiosk runtime hook
  details — ties renderer UI to main-process IPC + kiosk state.

printloop-kiosk-app/src/renderer/screens/CodeEntryScreen.tsx
  role — code entry screen
  details — the screen where the customer enters the 6-digit release code.

printloop-kiosk-app/src/renderer/screens/JobDetailsScreen.tsx
  role — job details screen
  details — shows the released job info before printing.

printloop-kiosk-app/src/renderer/screens/PrintingScreen.tsx
  role — printing screen
  details — shows printing progress / result.

printloop-kiosk-app/src/renderer/screens/SettingsScreen.tsx
  role — settings screen
  details — kiosk config UI (API URL, key, printer, etc.).

printloop-kiosk-app/src/renderer/screens/ErrorScreen.tsx
  role — error screen
  details — user-friendly error state.

printloop-kiosk-app/src/renderer/styles.css
  role — kiosk renderer styles

printloop-kiosk-app/src/utils/logger.ts (+ .js/.d.ts)
  role — kiosk renderer logger

printloop-kiosk-app/src/utils/s3.ts (+ .js/.d.ts)
  role — kiosk renderer S3 helper (if used in renderer)

printloop-kiosk-app/src/config/index.ts (+ .js/.d.ts)
  role — kiosk renderer config

## build / packaging

printloop-kiosk-app/package.json / package-lock.json
  role — kiosk app dependencies + scripts

printloop-kiosk-app/tsconfig.json / tsconfig.main.json / tsconfig.renderer.json
  role — TypeScript configs for main vs renderer

printloop-kiosk-app/vite.config.ts / vite.config.js / vite.config.d.ts
  role — Vite build config for the renderer

printloop-kiosk-app/electron-builder.json
  role — electron-builder config
  details — produces the distributable (Setup.exe on Windows, etc.).

printloop-kiosk-app/index.html
  role — top-level HTML (electron window load target in some configs)

printloop-kiosk-app/README.md
  role — kiosk app readme

printloop-kiosk-app/kiosk-preload.js / setup-preload.js
  role — preload script artifacts (dev/build)

printloop-kiosk-app/setup.html
  role — setup wizard HTML (installer/first-run)

printloop-kiosk-app/build/make-icon.js
  role — icon build helper

printloop-kiosk-app/dist/
  role — built/output artifacts
  details — includes builder-effective-config.yaml, win-unpacked/* (packed app), renderer
    assets (JS/CSS), main/*.js, preload/*.js, utils/*.js, config/*.js.

printloop-kiosk-app/docker-entrypoint.sh
  role — Docker entrypoint for the kiosk app (if run in a container)
```

**Interaction:** kiosk app main process authenticates via `X-Kiosk-Key` (same as agent + CUPS backend). On startup it loads settings from a local file, starts heartbeat to `POST /api/kiosk/heartbeat`, and on the renderer side the customer enters a 6-char release code → `fetchPrintJob` calls `GET /api/kiosk/jobs/:code` → backend resolves the job → renderer calls `printJob` → main process downloads the PWG artifact from S3 → `printPwgToIpp` sends IPP Print-Job to the LAN printer. The pre-rendered PWG comes from the cloud render worker; the kiosk never renders locally. The `dist/` folder is the electron-builder output of all the above.

---

# 12 · Frontend — Web App (React + Vite + RTK)

> Folder: `printloop-new-frontend/`
> role — customer + admin + platform UI. Editorial-brutalist design system,
>   RTK Query API layer, route-gated pages.

```
printloop-new-frontend/src/main.tsx
  role — React app bootstrap
  details — render root with Redux Provider, BrowserRouter, SentryErrorBoundary,
    SentryAuthListener (keeps Sentry user in sync with auth slice), BrandProvider
    (per-tenant white-label swap), Toaster (sonner, styled to the ink/paper palette).
    initSentryIfConfigured() before mount; index.css imported.

printloop-new-frontend/src/App.tsx
  role — route tree + global chrome
  details — RouteWipe, TabTitleNudge, ImpersonationBanner, CookieConsent, then
    Routes: public marketing pages (/features, /pricing, /about, /contact, /blog,
    /blog/:slug, /privacy, /terms), /kiosk + /kiosk/code (KioskCodePage),
    /join/:shareId (group join), marketplace /find + /find/:slug,
    /saas/* tenant admin (signup/login/verify-email + SaasProtectedRoute + SaasShell),
    /platform (platform console), /saas/settings nested tabs (branding/domains/webhooks/
    security/account), auth pages under PublicOnlyRoute + AuthLayout, /admin/login under
    AdminPublicOnlyRoute, /admin under AdminProtectedRoute + AdminLayout, customer app
    under ProtectedRoute + AppLayout (/dashboard, /print/new, /print/batch, /groups,
    /jobs, /jobs/:jobId/edit-review, /stations, /settings), wildcard → /.

printloop-new-frontend/src/routes/ProtectedRoute.tsx
  role — route guards
  details — ProtectedRoute (needs auth token, else → /auth/login), AdminProtectedRoute
    (needs admin/super_admin role, else → /admin/login), PublicOnlyRoute (redirects
    signed-in users away from auth pages), AdminPublicOnlyRoute (redirects authenticated
    admins away from admin login).

printloop-new-frontend/src/constants/routes.ts
  role — centralized route path constants
  details — ROUTES = { ROOT, AUTH:{LOGIN,REGISTER,VERIFY_EMAIL,FORGOT_PASSWORD},
    APP:{DASHBOARD,NEW_PRINT,BATCH_PRINT,GROUP_PRINT,PRINT_JOBS,EDIT_REVIEW,STATIONS,
    SETTINGS}, SAAS:{DASHBOARD,QUEUE,EDIT_QUEUE,OPERATOR,TRANSACTIONS,PAYOUTS,
    SETUP_SUBACCOUNT,SETUP_BANK,OPERATOR_PRINTERS}, ADMIN:{HOME,LOGIN}, KIOSK:{HOME,CODE} }.

printloop-new-frontend/src/constants/config.ts
  role — frontend config (API base URL, feature flags)
  details — CONFIG.apiBaseUrl and any client-side feature constants; drives RTK Query
    fetchBaseQuery baseUrl.

## state / API layer

printloop-new-frontend/src/store/index.ts
  role — Redux store assembly
  details — configureStore with auth reducer + apiSlice reducer/middleware; exports
    RootState + AppDispatch types.

printloop-new-frontend/src/store/features/auth/authSlice.ts
  role — auth state (tokens, user, loading)
  details — holds accessToken/refreshToken/user, login/register/logout/refresh mutations,
    setCredentials, token-driven Sentry user sync (via SentryAuthListener).

printloop-new-frontend/src/store/services/apiSlice.ts
  role — RTK Query API base slice
  details — fetchBaseQuery with API base URL, prepareHeaders injects Bearer token + optional
    X-Tenant-Slug from URL param/sessionStorage (operator routes skip slug injection),
    baseQueryWithReauth: on 401/403 tries /auth/refresh, re-arms credentials, else logs out.
    tagTypes covers Auth, Jobs, Stations, GroupSessions, Pricing, Admin*, Blog, Tenant*,
    Platform*, TenantEdit*, etc. refetchOnFocus + refetchOnReconnect enabled (pricing updates
    visible without reload). endpoints: {} extended by feature API slices.

printloop-new-frontend/src/store/services/authApi.ts
  role — auth RTK Query endpoints
  details — login/register/refresh/me/logout endpoints; drives authSlice on success.

printloop-new-frontend/src/store/services/jobsApi.ts
  role — print-job RTK Query endpoints
  details — create job, list jobs, fetch job, release/print, quote, etc.

printloop-new-frontend/src/store/services/stationsApi.ts
  role — stations/discovery RTK Query endpoints
  details — list public stations, shop detail, discovery queries.

printloop-new-frontend/src/store/services/saasApi.ts
  role — tenant-admin RTK Query endpoints
  details — dashboard stats, queue, payouts, transactions, settings, branding, domains,
    webhooks, security, account, operator surfaces.

printloop-new-frontend/src/store/services/platformApi.ts
  role — platform-admin RTK Query endpoints
  details — list/suspend/reactivate tenants, impersonate, reliability metrics.

printloop-new-frontend/src/store/services/blogApi.ts
  role — marketing blog RTK Query endpoints
  details — list posts, get post by slug.

printloop-new-frontend/src/store/services/discoveryApi.ts
  role — marketplace discovery RTK Query endpoints
  details — shop search, nearby shops, pricing/public branding reads.

printloop-new-frontend/src/store/services/groupApi.ts
  role — group session RTK Query endpoints
  details — create/join/list group sessions, participant uploads.

printloop-new-frontend/src/store/services/preflightApi.ts
  role — preflight analysis RTK Query endpoints
  details — document pre-flight checks before upload.

printloop-new-frontend/src/store/services/adminApi.ts
  role — admin console RTK Query endpoints
  details — admin stats, jobs, users, pricing, promotions, blog, printer profiles,
    transactions, reports, audit logs, kiosks, settings.

## lib / helpers

printloop-new-frontend/src/lib/jwt.ts
  role — client-side JWT decode (display only)
  details — decodeToken(token) → DecodedToken | null (no verification; used to read the
    impersonating claim for the impersonation banner). Never trusted for auth.

printloop-new-frontend/src/lib/errors.ts
  role — error extraction helper
  details — extractError(err) digs through err.data.error.message / data.message / error /
    message for a user-facing message fallback.

printloop-new-frontend/src/lib/markdown.ts
  role — markdown rendering helper
  details — renders blog/legal content to HTML in the marketing/blog pages.

printloop-new-frontend/src/lib/pricing.ts
  role — client-side pricing helpers
  details — formatting/display helpers for the pricing matrix and quote UI.

printloop-new-frontend/src/lib/sentry.ts
  role — Sentry client-side init
  details — initSentryIfConfigured() reads VITE_SENTRY_DSN; safe no-op when unset.

printloop-new-frontend/src/lib/pageCount.ts
  role — page-count display helpers
  details — formatting helpers for page-count metadata in job UI.

## UI components

printloop-new-frontend/src/index.css
  role — design system + Tailwind layer
  details — Tailwind base/components/utilities; @layer base sets Inter, paper bg, ink text,
    persimmon selection, smooth scroll under reduced-motion. @layer components defines the
    editorial-brutalist component tokens: editorial-label, editorial-folio, editorial-rule,
    pl-btn/pl-btn-primary/pl-btn-dark/pl-btn-ghost/pl-btn-sm/pl-btn-lg (hard 5px offset
    shadow on hover, 2px ink border, uppercase tracking-wider), pl-input (ink border, paper-light,
    error → persimmon), pl-card (ink border, lift-on-hover), pl-chip/pl-chip-active, pl-pill.
    (Full file is larger; this captures the system's purpose.)

printloop-new-frontend/src/components/ui/Button.tsx
  role — button component
  details — (likely wraps pl-btn classes / design-system button; check file for exact API).

printloop-new-frontend/src/components/ui/Input.tsx
  role — input component
  details — (wraps pl-input / design-system input; check file for exact props).

printloop-new-frontend/src/components/ui/Select.tsx
  role — select component
  details — styled select aligned with the design system.

printloop-new-frontend/src/components/ui/CookieConsent.tsx
  role — cookie consent banner
  details — renders cookie consent UI; part of global App chrome.

printloop-new-frontend/src/components/ui/Paper3D.tsx
  role — 3D paper visual component
  details — paper-3D visual used in preview/hero contexts.

printloop-new-frontend/src/components/ui/QrBlock.tsx
  role — QR code display block
  details — renders a QR (e.g. release-code QR) with caption.

printloop-new-frontend/src/components/ui/scrollFx.tsx
  role — in-house scroll animation kit
  details — reveals, counters, parallax, pin-scrub using CSS transforms only; collapses
    under prefers-reduced-motion. No GSAP/Lenis/framer-motion.

printloop-new-frontend/src/components/AppChrome.tsx
  role — app-level chrome helpers
  details — RouteWipe (clears state on route change), TabTitleNudge (document title tweaks).

printloop-new-frontend/src/components/BrandProvider.tsx
  role — per-tenant branding context
  details — fetches /api/branding (public, tenant-resolved) and swaps colours/wordmark/
    favicon for white-label tenants.

printloop-new-frontend/src/components/layout/AppLayout.tsx
  role — customer app layout shell
  details — nav, chrome, and structure for customer-authed pages.

printloop-new-frontend/src/components/layout/AuthLayout.tsx
  role — auth page layout shell
  details — wraps login/register/verify/forgot pages.

printloop-new-frontend/src/components/layout/AdminLayout.tsx
  role — admin console layout shell
  details — separate chrome for /admin (no customer chrome).

printloop-new-frontend/src/components/layout/SaasShell.tsx
  role — tenant-admin shell
  details — shop nav + availability toggle wrapper for /saas/* authenticated pages.

printloop-new-frontend/src/components/layout/SaasProtectedRoute.tsx
  role — tenant-admin route guard
  details — gates /saas/* authenticated pages; redirects to /saas/login when unauthenticated.

printloop-new-frontend/src/components/layout/PublicHeader.tsx
  role — public site header
  details — header for marketing/landing pages.

printloop-new-frontend/src/components/layout/MobileNav.tsx
  role — mobile navigation
  details — mobile nav component.

printloop-new-frontend/src/components/layout/BottomTabBar.tsx
  role — bottom tab bar (mobile)
  details — mobile tab navigation.

printloop-new-frontend/src/components/layout/Marquee.tsx
  role — marquee/scroll-ticker component
  details — editorial marquee element.

printloop-new-frontend/src/components/layout/EditorialFooter.tsx
  role — editorial footer
  details — footer for public/marketing pages.

printloop-new-frontend/src/components/layout/ResponsiveTable.tsx
  role — responsive table
  details — table that adapts to small screens.

printloop-new-frontend/src/components/ImpersonationBanner.tsx
  role — impersonation banner (platform admin acting as tenant)
  details — reads the JWT impersonating claim (via decodeToken) and shows "acting as <tenant>"
    banner when present.

printloop-new-frontend/src/components/SaasProtectedRoute.tsx
  role — already listed under layout; single source for /saas auth gate

printloop-new-frontend/src/components/SentryErrorBoundary.tsx
  role — React error boundary wrapping Sentry
  details — catches render errors and reports to Sentry.

printloop-new-frontend/src/components/SentryAuthListener.tsx
  role — auth↔Sentry user-context sync
  details — subscribes to auth slice; sets/clears Sentry user on login/logout.

printloop-new-frontend/src/components/GoLiveWizard.tsx
  role — go-live wizard component
  details — onboarding/go-live step UI (likely tenant go-live checklist).

printloop-new-frontend/src/components/HowPrintLoopWorks.tsx
  role — "how it works" explainer component
  details — used on marketing/landing to explain the print loop.

printloop-new-frontend/src/components/preflight/IssuePanel.tsx
  role — preflight issue panel
  details — shows preflight analysis issues on upload.

printloop-new-frontend/src/components/preflight/AutoFixPanel.tsx
  role — preflight auto-fix panel
  details — offers auto-fixes for preflight issues where available.

printloop-new-frontend/src/components/preflight/PreflightUploader.tsx
  role — preflight uploader component
  details — upload UI with preflight analysis integration.

printloop-new-frontend/src/components/print/PrintPreview.tsx
  role — print preview component
  details — renders the print preview of the uploaded document + settings.

printloop-new-frontend/src/components/print/DocumentPreview.tsx
  role — document preview (from the preview-component spike)
  details — preview component used in the print flow; see 03-document-preview-component/.

printloop-new-frontend/src/components/print/PreviewStep.tsx
  role — preview step in the print flow
  details — step UI for preview before pay/release.

## pages

printloop-new-frontend/src/pages/LandingPage.tsx
  role — homepage/landing
  details — marketing landing + primary CTA flow.

printloop-new-frontend/src/pages/marketing/FeaturesPage.tsx
  role — features page
  details — product features marketing page.

printloop-new-frontend/src/pages/marketing/PricingPage.tsx
  role — pricing page
  details — public pricing matrix page.

printloop-new-frontend/src/pages/marketing/AboutPage.tsx
  role — about page
  details — about PrintLoop.

printloop-new-frontend/src/pages/marketing/ContactPage.tsx
  role — contact page
  details — contact/support page.

printloop-new-frontend/src/pages/marketing/BlogPage.tsx
  role — blog index
  details — list of published blog posts.

printloop-new-frontend/src/pages/marketing/BlogPostPage.tsx
  role — blog post detail
  details — renders one post (markdown content + metadata).

printloop-new-frontend/src/pages/legal/PrivacyPage.tsx
  role — privacy policy page

printloop-new-frontend/src/pages/legal/TermsPage.tsx
  role — terms page

printloop-new-frontend/src/pages/discovery/FindPage.tsx
  role — marketplace shop finder
  details — /find: lists shops by distance/relevance (marketplace discovery, V2-30).

printloop-new-frontend/src/pages/discovery/ShopDetailPage.tsx
  role — shop detail / public profile
  details — /find/:slug: shop name, location, pricing matrix, status, photos.

printloop-new-frontend/src/pages/auth/LoginPage.tsx
  role — customer login page

printloop-new-frontend/src/pages/auth/RegisterPage.tsx
  role — customer register page

printloop-new-frontend/src/pages/auth/VerifyEmailPage.tsx
  role — email verification page

printloop-new-frontend/src/pages/auth/ForgotPasswordPage.tsx
  role — forgot-password page

printloop-new-frontend/src/pages/customer/DashboardPage.tsx
  role — customer dashboard
  details — recent jobs, quick actions.

printloop-new-frontend/src/pages/customer/NewPrintPage.tsx
  role — single print upload flow
  details — upload, configure (copies/paper/color/sided/dpi/orientation), preview, quote, pay.

printloop-new-frontend/src/pages/customer/BatchPrintPage.tsx
  role — batch print flow
  details — multi-file upload, per-file settings, one code, one payment.

printloop-new-frontend/src/pages/customer/GroupPrintPage.tsx
  role — group print session page
  details — group session create/join/host flow.

printloop-new-frontend/src/pages/customer/PrintJobsPage.tsx
  role — customer job history
  details — list of user's jobs with status, codes, cost.

printloop-new-frontend/src/pages/customer/EditReviewPage.tsx
  role — edit review page
  details — edit a submitted shop review.

printloop-new-frontend/src/pages/customer/StationsPage.tsx
  role — stations directory (customer-facing)
  details — public kiosk list with online/offline status + maps links.

printloop-new-frontend/src/pages/customer/SettingsPage.tsx
  role — customer settings
  details — profile, security, print token rotation.

printloop-new-frontend/src/pages/kiosk/KioskCodePage.tsx
  role — kiosk code-entry page
  details — the page the kiosk UI shows for code entry (also reachable at /kiosk, /kiosk/code).

printloop-new-frontend/src/pages/group/JoinPage.tsx
  role — group join page
  details — /join/:shareId: join a group session by share link.

printloop-new-frontend/src/pages/admin/AdminLoginPage.tsx
  role — admin login page (/admin/login)

printloop-new-frontend/src/pages/admin/AdminConsolePage.tsx
  role — admin console home (/admin)
  details — admin dashboard + quick nav.

printloop-new-frontend/src/pages/admin/tabs/BlogTab.tsx
  role — admin blog management tab

printloop-new-frontend/src/pages/admin/tabs/DisputesTab.tsx
  role — admin disputes tab

printloop-new-frontend/src/pages/admin/tabs/JobsTab.tsx
  role — admin jobs tab

printloop-new-frontend/src/pages/admin/tabs/OptionsTab.tsx
  role — admin options/settings tab

printloop-new-frontend/src/pages/admin/tabs/PrinterProfilesTab.tsx
  role — admin printer profiles tab (V2-56)

printloop-new-frontend/src/pages/admin/tabs/PrintersTab.tsx
  role — admin printers tab

printloop-new-frontend/src/pages/admin/tabs/PromotionsTab.tsx
  role — admin promotions tab

printloop-new-frontend/src/pages/admin/tabs/ReportsTab.tsx
  role — admin reports tab

printloop-new-frontend/src/pages/admin/tabs/TransactionsTab.tsx
  role — admin transactions tab

printloop-new-frontend/src/pages/saas/SaasLoginPage.tsx
  role — tenant admin login (/saas/login)

printloop-new-frontend/src/pages/saas/SignupPage.tsx
  role — SaaS tenant signup (/saas/signup)

printloop-new-frontend/src/pages/saas/SaasQueuePage.tsx
  role — tenant queue page (/saas/queue)

printloop-new-frontend/src/pages/saas/SaasEditQueuePage.tsx
  role — tenant edit queue page (/saas/edit-queue)

printloop-new-frontend/src/pages/saas/DashboardHomePage.tsx
  role — tenant dashboard (/saas/dashboard)

printloop-new-frontend/src/pages/saas/PayoutsPage.tsx
  role — tenant payouts (/saas/payouts)

printloop-new-frontend/src/pages/saas/TransactionsPage.tsx
  role — tenant transactions (/saas/transactions)

printloop-new-frontend/src/pages/saas/SetupBankPage.tsx
  role — bank account setup (/saas/setup/bank-account)

printloop-new-frontend/src/pages/saas/SetupSubaccountPage.tsx
  role — Paystack subaccount setup (/saas/setup/subaccount)

printloop-new-frontend/src/pages/saas/SecurityPage.tsx
  role — tenant security settings (/saas/settings/security)

printloop-new-frontend/src/pages/saas/AccountPage.tsx
  role — tenant account settings (/saas/settings/account)

printloop-new-frontend/src/pages/saas/BrandingPage.tsx
  role — tenant branding (/saas/settings/branding)

printloop-new-frontend/src/pages/saas/DomainsPage.tsx
  role — tenant custom domains (/saas/settings/domains)

printloop-new-frontend/src/pages/saas/WebhooksPage.tsx
  role — tenant webhooks (/saas/settings/webhooks)

printloop-new-frontend/src/pages/saas/VerifyEmailPage.tsx
  role — tenant email verification (/saas/verify-email)

printloop-new-frontend/src/pages/saas/ClosedPage.tsx
  role — closed-tenant page (/saas/closed)

printloop-new-frontend/src/pages/saas/OperatorConsolePage.tsx
  role — operator console (/saas/operator)

printloop-new-frontend/src/pages/saas/OperatorPrintersPage.tsx
  role — operator printers (/saas/operator/printers)

printloop-new-frontend/src/pages/saas/SettingsLayout.tsx
  role — tenant settings tab layout
  details — nests branding/domains/webhooks/security/account under /saas/settings.

printloop-new-frontend/src/pages/platform/PlatformConsolePage.tsx
  role — platform super-admin console (/platform)
  details — list/suspend/reactivate tenants, impersonation, reliability.

## tests

printloop-new-frontend/src/__tests__/deck.builder.test.ts
  role — onboarding deck builder tests

printloop-new-frontend/src/__tests__/vitest.smoke.test.ts
  role — frontend smoke test

printloop-new-frontend/src/vite-env.d.ts
  role — Vite env type declarations (import.meta.env types)
```

---

# 13 · Document Preview Spike (`03-document-preview-component/`)

> Folder: `03-document-preview-component/`
> role — React component spike for inline document preview with print-option-aware rendering.
>   NOT yet merged into the main frontend; the components live here as a spike and are
>   referenced (but not fully described) in the frontend dictionary under
>   src/components/print/DocumentPreview.tsx + PreviewStep.tsx.

```
03-document-preview-component/components/print/DocumentPreview.tsx
  role — standalone document preview using @iamjariwala/react-doc-viewer
  details — renders an inline preview that reflects the user's print options:
    colorType=BLACK_WHITE → CSS grayscale filter; orientation=landscape → rotates the
    preview frame; paperSize → adjusts the frame's aspect ratio; watermarkText → overlays
    the doc viewer's built-in watermark. Supports 20+ file types: PDF, DOCX, XLSX, PPTX,
    images, CSV, TXT, MD, HTML, video.
    Props: file (File, preferred), fileBase64 (string), fileUrl (remote/Cloudinary),
    fileName, fileType, paperSize (PAPER_SIZE), orientation (ORIENTATION), colorType
    (COLOR_TYPE), duplex? (DUPLEX), showPaperFrame? (default true), watermarkText?,
    theme? (light|dark|auto).
    detectFileType(): MIME→viewer fileType map + extension fallback.
    getPaperAspectRatio(): A4/A3/LETTER/LEGAL → CSS aspect-ratio string.
    Cleans up blob: URLs on unmount. Renders a print-options badge bar above the preview
    (paper size · orientation, B&W/Color, ID: watermark), the paper-shaped DocViewer frame,
    and a helper note below.

03-document-preview-component/components/print/PreviewStep.tsx
  role — preview step wrapper: file-info card + live preview side by side
  details — two-column grid (file details left, live preview right). Left card shows
    file-type icon + label, page count, paper size / orientation / color / duplex / copies
    as badges, and an "About this preview" helper note. Right card wraps DocumentPreview.
    Props: fileName, fileBase64, fileType, file?, currentPage, pageCount, zoom,
    paperSize, orientation, colorType, duplex?, copies?, onZoomIn/Out, onPrevious/NextPage.
    getFileTypeLabel() + getFileTypeIcon() map MIME to human label + emoji.
    NOTE: PreviewStep accepts pageCount/currentPage/zoom + nav callbacks but does not itself
    render pagination controls — the parent print flow owns that. DocumentPreview is the
    actual viewer; PreviewStep is the layout + info chrome around it.

03-document-preview-component/ (spike folder root)
  role — isolated spike for the document preview component pair
  details — not wired into printloop-new-frontend yet; components are imported/exported from
    the spike folder. The frontend dict lists src/components/print/DocumentPreview.tsx and
    PreviewStep.tsx as the "real" locations — confirm whether those are symlinks, copies, or
    the spike originals before editing. If the spike is the source of truth, move it into
    printloop-new-frontend/src/components/print/ and delete the spike folder; if the frontend
    copies are the live ones, delete or archive the spike.
```

**Interaction:** DocumentPreview uses `@iamjariwala/react-doc-viewer` (a third-party viewer) and is purely a presentational component — it doesn't call the API. It receives print options (paper size, orientation, colour, duplex) + a file source (File / base64 / URL) from its parent. PreviewStep composes DocumentPreview with a file-info card. Both are designed to drop into the customer print flow (NewPrintPage / BatchPrintPage) where the user picks options and sees the preview update before paying. The backend's `documentConvert.service.ts` + `documentConvert.service.ts` are the server-side analogues (page count, normalisation, office→PDF) — the preview is client-side only and does not depend on them, but the print options it displays should match what the backend prices.

---

# 14 · CUPS Backend (`tools/cups-printloop/`)

> Folder: `tools/cups-printloop/`
> role — turns a Linux/macOS box into a "Print → PrintLoop" target. CUPS spools the
>   document; the `printloop` backend script POSTs it to PrintLoop's API; the user pays the
>   returned checkout link, then enters the release code at any PrintLoop kiosk to actually
>   print (V2-55: CUPS jobs bill via Paystack, same as web uploads).
>   NOT yet catalogued in any dictionary file.

```
tools/cups-printloop/README.md
  role — CUPS backend documentation
  details — architecture diagram (File → local CUPS → /usr/lib/cups/backend/printloop →
    POST /api/cups/print → PrintLoop → code + Paystack checkout link), prerequisites (cups,
    curl, print token), install (interactive sudo ./install.sh or unattended with
    PRINTLOOP_HOST / PRINTLOOP_TOKEN / QUEUE_NAME), what install.sh does (copies printloop
    to CUPS backend dir, restarts CUPS, lpadmin -p PrintLoop), verify (lpstat -p, lpq, echo
    "hi" | lp -d PrintLoop smoke test, lp a real PDF and check lpq -l for release code + PAY
    HERE link), uninstall (lpadmin -x PrintLoop, rm the backend script), troubleshooting table
    (401 token rotated, 413 file too big, 415 non-PDF/JPG/PNG, 5xx server unreachable, CUPS
    rejecting jobs, spooler not seeing printloop), security model (bearer token, lives in
    /etc/cups/printers.conf root-readable, HTTPS except localhost/*.local, rotate at
    /api/customer/print-token/rotate), architecture note (canonical "act as a network printer"
    pattern from SavaPage / OpenPrinting reference; we don't run a Node IPP server — CUPS
    already implements IPP, the ~150-line shell script is the entire glue).

tools/cups-printloop/printloop
  role — CUPS backend script (shell)
  details — CUPS invokes this at /usr/lib/cups/backend/printloop with:
    $0 job-id user title copies options [filename]
    When no filename is given, the document arrives on stdin.
    Device URI: printloop://HOST[:PORT]/?token=USER_PRINT_TOKEN
    Exit codes (CUPS backend(7) conventions): 0 success, 1 failed-permanent, 2 auth-required,
    4 retry-current, 5 retry-later.
    Discover mode (no args): prints 'direct printloop "Unknown" "PrintLoop (network printer)"'
    and exits 0 — CUPS uses this for lpinfo -v.
    Parses DEVICE_URI for host/port + token (from ?token= or userinfo user:token@host),
    decides scheme (localhost/*.local → http, else https, overrideable via ?scheme=), builds
    API_URL = $SCHEME://$host_port/api/cups/print.
    Spools stdin to a temp file if CUPS didn't give a filename (curl needs a seekable file for
    Content-Length). Sanity-checks non-empty. Names the upload CUPS-style (JobTitle.pdf if no
    extension).
    Idempotency-Key: cups-${JOB_ID}-${JOB_USER}-$(date -u +%Y%m%dT%H) — stable per CUPS
    job-attempt so CUPS retries (exit 4) don't double-create PrintJobs or double-charge.
    curl --silent --show-error --max-time 120 --header "Authorization: Bearer ***" (redacted
    in source) --header "Idempotency-Key: ..." --form "file=@..." --form "title=..." --form
    "copies=..." --form "options=..." $API_URL.
    On 200/201: plucks code + cost + payUrl from JSON with sed (no jq dependency), writes
    STATE: -cups-job-stopped-with-message + INFO: PrintLoop accepted — release code $CODE
    (cost: ₦...) + NOTICE: PAY HERE: $PAY_URL (if present) or NOTICE: Enter $CODE at any
    PrintLoop kiosk to print. Exits 0.
    On 401: ERROR: print token rejected, exit 2. On 403: account blocked, exit 1. On 413/415/
    422: rejected document, exit 1. On 500/502/503/504/000: server unreachable, exit 4 (CUPS
    retries). Default: unexpected HTTP code, exit 1.
    Logs go to /var/log/cups/error_log — search for INFO: PrintLoop.

tools/cups-printloop/install.sh
  role — unattended/interactive CUPS backend installer
  details — copies printloop to the CUPS backend directory (Linux: /usr/lib/cups/backend;
    macOS: /usr/libexec/cups/backend), mode 0755 root, restarts CUPS (systemctl or launchctl),
    runs lpadmin -p PrintLoop -E -v "printloop://HOST/?token=…" to create or update the queue
    with the generic PostScript PPD. Accepts PRINTLOOP_HOST, PRINTLOOP_TOKEN, QUEUE_NAME from
    env for unattended fleet provisioning; otherwise prompts interactively.
```

**Interaction:** the CUPS backend is the "Print to PrintLoop" entry point for laptop users who want to print from any app. It authenticates with the user's print token (the same one rotated at `/api/customer/print-token/rotate` and surfaced to the customer at `/api/customer/print-token` + the frontend settings page). It POSTs to `01-backend/routes/cups.routes.ts` → `/api/cups/print`, which creates a PrintJob (token-auth, no JWT) and returns the 6-char release code + Paystack checkout link. The user pays via the link, the Paystack webhook (`01-backend/routes/payments.routes.ts` + `payments.service.ts`) confirms the charge, and then the job is redeemable at any kiosk by entering the code. The backend script's idempotency key (`cups-${JOB_ID}-${JOB_USER}-${hour}`) maps to the PrintJob's `idempotencyKey` column and the partial-unique index on `(userId, idempotencyKey)` — this is what prevents CUPS retry storms from double-charging. V2-55 makes CUPS jobs bill through Paystack exactly like web uploads; V2-44 job-truth (agentConfirmation) is not involved here because the CUPS path doesn't go through the on-site agent.

---

# 15 · Vendor OpenPrinting (`vendor/openprinting/`)

> Folder: `vendor/openprinting/`
> role — 26 shallow-cloned (`--depth 1`) read-only OpenPrinting repos that supply the
>   print-stack binaries, libraries, and reference implementations PrintLoop depends on.
>   NOT edited in-repo; refresh with `pwsh tools/refresh-vendor.ps1`. Partially described in
>   the kiosk dict and the architecture doc, but not as a standalone dictionary entry until now.

```
vendor/openprinting/README.md
  role — vendor catalog + refresh instructions + disclosure
  details — shallow clones, read-only, refresh with pwsh tools/refresh-vendor.ps1. If a patch
    is needed, fork upstream and point refresh-vendor.ps1 at the fork. Disclosure: Apache-2.0 /
    GPL-2.0 / LGPL-2.1 per subproject; we link / call out to binaries / read data files, never
    re-distribute modified copies without preserving upstream license headers. If we bundle a
    built binary in an installer, the installer ships the corresponding LICENSE file.

## Repo → one-liner → used-by map (from README.md)

cups                    — CUPS 2.x source (reference)                        → Reference only
cups-filters            — Filter pipeline + driverless utilities for non-Mac → Render worker
libcups                 — CUPS 3.x client library                          → Render worker, kiosk agent
libcupsfilters          — Reusable filter library                          → Render worker
cups-browsed            — mDNS/DNS-SD network printer browser              → Kiosk
cups-local              — One-process IPP server (no system daemon)         → Kiosk
cups-sharing            — Share a printer between multiple submitters       → Kiosk (multi-kiosk shops)
ipp-usb                 — HTTP reverse proxy: USB MFP → IPP-over-HTTP on localhost → Kiosk (Linux)
ippusbxd                — Cross-platform IPP-over-USB driver (alternative)  → Kiosk fallback
hplip-printer-app       — HP driverless Printer Application                 → Kiosk (HP printers)
ps-printer-app          — PostScript driverless Printer Application        → Kiosk (PS-capable laser)
ghostscript-printer-app — Ghostscript driverless Printer Application       → Kiosk (catch-all)
gutenprint-printer-app  — Gutenprint driverless Printer Application        → Kiosk (Brother/Epson/Canon)
pappl-retrofit          — PPD-to-Printer-Application retrofit library      → Kiosk (legacy PPDs)
goipp                   — Pure-Go IPP protocol implementation              → Render worker (Go path)
go-mfp                  — Go libs for Multi-Function Printers / scanners   → Future scan-to-cloud
go-avahi                — Go cgo binding for Avahi (mDNS)                  → Render worker discovery
pycups                  — Python CUPS bindings                             → Ops scripts
cpdb-libs               — Common Print Dialog Backends client lib          → Future desktop "Print to PrintLoop"
cpdb-backend-cups       — CPDB backend that talks to CUPS                   → Future desktop print dialog
libpdfrip               — PDFio-based PDF rendering library                → Ingest validator
foomatic-db-engine     — Foomatic DB query engine                         → Tenant printer-profile picker
system-config-printer   — Mature GTK printer-admin UI (reference)           → UX inspiration only
fuzzing                 — Fuzz harnesses for IPP/PPD/PWG parsers           → Security CI

## Intentionally not vendored (too large for reliable Windows Schannel git-fetch)

foomatic-db   ~183 MB — git pack mid-fetch disconnects → query via foomatic-db-engine against upstream DB at runtime; alternatively download a release tarball from https://github.com/OpenPrinting/foomatic-db/releases
sample-files  ~214 MB — git pack mid-fetch disconnects → replace with mozilla/pdf.js test corpus or seeded fixtures; curl a single file from raw.githubusercontent.com when needed
```

**Interaction:** the render worker's `pipeline/render.ts` calls out to `pdftopwg` (from cups-filters) and `gs` (Ghostscript) as binaries — those live in vendor and are searched by `getBinaryPath`. The kiosk app's main-process `ipp.ts` uses `libcups` via the `ipp` Node package for list/test/print. The on-site agent's IPP path uses the same `ipp` package + `libcups` underpinnings. `cups-browsed` / `cups-local` / the printer-app repos are the kiosk-side printer-discovery and driverless-printing stack on Linux kiosks. `goipp` is the Go IPP path the render worker could use instead of the cups-filters binary path. `foomatic-db-engine` feeds the tenant printer-profile picker (`printerProfile.entity.ts` + admin CRUD). The `fuzzing` harnesses are for security CI on IPP/PPD/PWG parsers. None of these are edited in-repo; patches go to forks and the fork URL lives in `tools/refresh-vendor.ps1`.

---

# 16 · Tools, Scripts, Monitoring

> Root `tools/` + referenced paths. NOT yet catalogued in any dictionary file.

```
tools/refresh-vendor.ps1
  role — re-pulls the 26 openprinting shallow clones
  details — PowerShell script; updates vendor/openprinting/ from upstream URLs. If a patch is
    needed, point it at a fork. See vendor/openprinting/README.md.

tools/generate-dpa-pdf.ts
  role — DPA (Data Processing Agreement) PDF generator
  details — likely composes the DPA document into a PDF for download/legal compliance.
    Check the file for the exact input → output contract.

tools/extract-dpa.ts
  role — DPA text extractor (likely from a source doc)
  details — likely pulls DPA text from a source (markdown / HTML / docx) to feed the PDF
    generator. Pair with generate-dpa-pdf.ts.

tools/e2e-render-test.ts
  role — end-to-end render-path test
  details — exercises the render → callback → job-ready flow end to end, likely against a
    running backend + worker. Used to validate the callback wiring (V2-41) and the render
    pipeline without a full kiosk.

tools/deploy-prod.ps1
  role — production deployment script (Windows/PowerShell)
  details — likely builds + deploys the backend / worker / kiosk app to production. Check the
    file for the exact target environment and steps.

tools/build-all.ps1
  role — Windows build script (PowerShell)
  details — builds everything (backend, worker, kiosk app, etc.) in one shot on Windows.

tools/build-all.sh
  role — cross-platform build script (POSIX shell)
  details — same as build-all.ps1 but for Linux/macOS/CI. Check for which artifacts it produces.

tools/cups-printloop/ (full entry in section 14)
  role — CUPS "Print to PrintLoop" backend + installer
  details — README.md, printloop (shell backend script), install.sh.

tools/monitoring/  → DOES NOT EXIST in the repo (looked for it; no matches).
  intended role (per the ask) — monitoring dashboards / alerts / health-check probes.
  status — not present. If there's a monitoring folder elsewhere or it was planned but never
    created, create it or note the gap. No files to catalog.

tools/scripts/generate-onboarding-deck.js  → DOES NOT EXIST at that path (looked for
  tools/scripts/*.js; the tools/ directory has no scripts/ subfolder and no *.js files
  except cups-printloop/printloop which is a shell script, not JS).
  intended role (per the ask) — onboarding deck JS generator.
  status — not present at the path given. The closest tools/ script for deck work is
  tools/generate-dpa-pdf.ts (DPA PDF, not onboarding deck). If the onboarding deck generator
  is in printloop-new-frontend/src/__tests__/deck.builder.test.ts (the test references a
  "deck builder"), check there or ask where it actually lives. No files to catalog at the
  path given.
```

Note: `tools/` also contains no `monitoring/` folder and no `scripts/generate-onboarding-deck.js`. If either is expected to exist, the gap is real — flag it rather than inventing contents.

---

# 17 · Electron Builder Output (`printloop-kiosk-app/dist/`)

> Folder: `printloop-kiosk-app/dist/`
> role — compiled/built output of the kiosk Electron app, produced by electron-builder +
>   Vite. Mostly compiled artifacts; low information value for a dictionary, but listed here
>   for completeness since the ask explicitly named it. NOT yet catalogued in any dictionary.

```
printloop-kiosk-app/dist/  (representative tree — exact file count is large; this is the shape)
  role — built kiosk app output
  details — produced by `electron-builder` (config: electron-builder.json) after Vite builds the
    renderer and tsc compiles main + preload. Contains:

  dist/builder-effective-config.yaml          — resolved electron-builder config (what was actually used for the build)
  dist/*.js / dist/*.d.ts / dist/*.js.map    — top-level compiled entries (config, possibly entry points)
  dist/main/*.js / *.d.ts / *.js.map         — compiled main-process modules (index, ipc, heartbeat, ipp, printJob, settings, config, utils/logger, utils/s3)
  dist/main/main/*.js / *.d.ts / *.js.map   — nested main/ output (some configs emit main/main/; same modules, duplicated path)
  dist/preload/*.js / *.d.ts / *.js.map     — compiled preload script (context-isolated IPC bridge to renderer)
  dist/renderer/ (or dist/assets/)          — Vite-built renderer: JS chunks, CSS, index.html, static assets
  dist/utils/*.js / *.d.ts / *.js.map       — compiled utility modules (logger, s3, config) shared by main + renderer
  dist/config/*.js / *.d.ts / *.js.map      — compiled config module
  dist/win-unpacked/ (on Windows builds)    — unpackaged Windows app bundle (the .exe + dependent files), produced by electron-builder's win target
  + platform-specific build outputs (e.g. Setup.exe on Windows, AppImage / dmg on Linux / macOS)
```

**Interaction:** `dist/` is the output of the kiosk app source (section 11) — it is NOT source, and editing it directly is meaningless (it gets overwritten on the next build). To change what's in `dist/`, edit the corresponding source under `printloop-kiosk-app/src/` or the build config (`electron-builder.json`, `vite.config.ts`, `tsconfig*.json`), then run the build (`tools/build-all.ps1` / `tools/build-all.sh` or the kiosk app's own build script). The `win-unpacked/` tree is what `printloop-kiosk-app/dist/Setup.exe` (or the unpacked equivalent) installs — that's the artifact shipped to kiosk PCs. The `builder-effective-config.yaml` is useful when a build looks wrong and you need to see what electron-builder actually resolved (it's the post-resolution config, including Any OS overrides).

---

# 18 · Claude Agent Memory (`.claude/`)

> Folder: `.claude/`
> role — Hermes/Claude agent memory + agent definitions + local settings. NOT yet catalogued
>   in any dictionary file. Low:code value; included for repo-map completeness.

```
.claude/agent-memory-local/lead-generator/MEMORY.md
  role — lead-generator agent memory (local)
  details — persistent notes for the lead-generator agent run. Content is agent-specific;
    treat as opaque unless you're operating that agent.

.claude/agent-memory-local/lead-generator/project_lead_hunting.md
  role — lead-generator agent project lead-hunting notes
  details — project-level lead-hunting context for the agent. Opaque unless operating that agent.

.claude/agents/lead-generator.md
  role — lead-generator agent definition
  details — agent spec / instructions for the lead-generator subagent. Read this if you need to
    re-run or modify that agent; otherwise it's an internal artifact.

.claude/settings.local.json
  role — local Claude/Hermes settings override
  details — user-level local settings (likely feature flags, permissions, or model prefs). Do not
    commit or edit unless you know what you're changing; it's a local-only settings file.
```

**Interaction:** `.claude/` is Hermes-agent runtime state, not PrintLoop product code. It does not affect the API, the render pipeline, the kiosk, or the frontend. The lead-generator agent is a separate concern (likely outbound lead-hunting / outreach). If you're not working on that agent, ignore this folder. The `settings.local.json` may affect how Hermes behaves in this session but is not part of the PrintLoop codebase.

---

# 19 · Interaction Map — How pieces connect

> One-directional flow where possible; bidirectional where the reality is a callback.

## Print flow (customer side → cloud → kiosk)

```
printloop-new-frontend (customer UI)
  NewPrintPage / BatchPrintPage / GroupPrintPage
    → POST /api/customer/print-jobs (multi-file → customerPrint.routes.ts)
    → multer upload + office→PDF gate (documentConversion.service.ts, V2-48)
    → annotation flatten + page count (documentConvert.service.ts)
    → abuse limits (abuseLimits.service.ts) + file/page caps
    → promotion apply (promotion.service.ts)
    → computeCost from 24-cell matrix (pricing.service.ts)
    → persist PrintJob + File (+ PrintJobItem for batch) (entities)
    → if editingRequired: create DocumentEdit (documentEdit.entity.ts + editing services)
    → enqueueRender (renderEnqueue.service.ts) flips PENDING→RENDERING, enqueues BullMQ 'render'
    → return job + estimated cost + release code (once minted) to frontend

render-worker / legacy worker (whichever is deployed)
  consumes 'render' queue (BullMQ, Redis)
  → downloads source file (S3 or URL)
  → normalises: office→PDF (LibreOffice), image→PDF (pdf-lib wrap), PDF passthrough
  → processPdf: page-range slice, watermark, orientation fit, printer-profile paper fit (V2-56)
  → toPdfA (Ghostscript) + optional toGrayscale
  → pdfToPwg (cups-filters pdftopwg) → PWG-Raster at profile/job DPI + colour
  → count pages from PWG markers
  → upload .pwg + .pdf + up to 3 JPEG previews to S3
  → POST /api/render/callback (HMAC-SHA256, RENDER_CALLBACK_SECRET) with renderedKey, pageCount, bytes, preview URLs
    → render.routes.ts verifies signature, flips RENDERING→READY, persists artifacts, reconcile cost (costReconciliation.service.ts)

backend callback handler (render.routes.ts)
  → applyRenderResult: RENDERING→READY, pageCount→finalCost reconciliation
  → if final < paid: auto-refund delta to customer wallet (costReconciliation.service.ts)
  → if final > paid: leave shortfall on job for kiosk release gate (settleShortfall charges saved card)

customer frontend → kiosk
  customer enters release code at kiosk (KioskCodePage → printloop-kiosk-app renderer)
  → kiosk main process fetchPrintJob(GET /api/kiosk/jobs/:code, X-Kiosk-Key)
  → backend resolves PrintJob by code, returns artifactKey + pageCount + cost + customerName + fileName
  → kiosk downloads PWG from S3 (main/utils/s3.ts → downloadFromS3)
  → printJob → printPwgToIpp (ipp.ts) → IPP Print-Job to LAN printer (document-format application/vnd.pwg-raster)
  → job prints; backend records completion (printerExtensions.service.ts → completePrintJob → DONE, kiosk counters, audit)
```

## CUPS "Print to PrintLoop" path (laptop → backend → pay → kiosk)

```
any app on laptop
  → File → Print → PrintLoop (CUPS queue, generic PostScript PPD)
  → CUPS spools to /usr/lib/cups/backend/printloop (tools/cups-printloop/printloop)
  → parses DEVICE_URI for host + print token, builds API_URL = https://host/api/cups/print
  → curl POST multipart (file, title, copies, options) with Authorization: Bearer <printToken>
    + Idempotency-Key: cups-${JOB_ID}-${JOB_USER}-${hour}
  → 01-backend/routes/cups.routes.ts (token-auth, no JWT) → creates PrintJob (idempotencyKey dedup)
  → returns { code, cost, payUrl? } as JSON → CUPS backend script writes STATE/INFO/NOTICE to stderr
  → lpq -l shows "PrintLoop release code: XYZ" + "PAY HERE: https://paystack.link/..."
  → user opens PAY HERE link, pays via Paystack
  → Paystack webhook → payments.routes.ts /payments/webhook (HMAC-SHA512, rawBody) → reconciles payment → job moves to payable
  → user enters release code at any kiosk → kiosk fetches job → prints (same kiosk path as above)

NOTE: V2-55 makes CUPS jobs bill via Paystack exactly like web uploads. The CUPS backend's
idempotency key + the PrintJob partial-unique index on (userId, idempotencyKey) is what prevents
CUPS retry (exit 4) storms from double-creating jobs or double-charging.
```

## On-site agent path (LAN printer that the cloud can't reach directly)

```
printloop-agent (Node service on shop LAN)
  → loadConfig() from .env (PRINTLOOP_BASE_URL, KIOSK_API_KEY, PRINTER_IP/NAME/PORT/
    TRANSPORT ipp|raw9100|spooler, IPP_PATH/VERSION, POLL_INTERVAL_MS, SPOOLER_COMMAND,
    CONFIRM_TIMEOUT_MS, CONFIRM_DISABLE)
  → startup probe: GET /api/agent/jobs/ready (X-Kiosk-Key, 401 → fatal)
  → reportCapabilities once + every 6h: IPP Get-Printer-Attributes → POST /api/agent/printer/capabilities
  → poll loop: GET /jobs/ready → for each job POST /jobs/:id/start (atomic claim, 409 → skip)
  → for each item: download bytes via signed URL
  → dispatchToPrinter by transport:
      raw9100 → PJL prologue + bytes + epilogue over TCP (unconfirmed/none, no feedback)
      spooler → write temp .pdf/.pwg, run cmdTemplate (Windows Start-Process -Verb PrintTo /
        Linux lp -d), delete temp, confirmSpoolerDrain (Windows Get-PrintJob PS query / Linux lpstat -o)
      ipp → ipp.Printer Print-Job with buildIppJobAttributes, confirmIppJob: poll Get-Job-Attributes until completed
  → report /jobs/:id/complete (confirmed/unconfirmed + method + detail) or /failed
  → only FAILED if every item failed; partial success → DONE

backend side (agent.routes.ts + printer.routes.ts)
  → GET /api/agent/jobs/ready: RELEASING jobs for this kiosk
  → POST /jobs/:id/start: atomic claim (one agent wins)
  → POST /jobs/:id/complete: mark DONE, increment kiosk counters (KioskService.recordPrintJob),
    completion time, audit (PrinterServiceExtensions.completePrintJob)
  → POST /jobs/:id/failed: mark FAILED, JOB_FAILED webhook (tenantWebhook.service.ts)
  → POST /api/agent/printer/capabilities: store capColor/capDuplex/capA3/capMedia on Kiosk (V2-44 auto-discovery)

interaction with render worker
  → agent downloads the pre-rendered PWG artifact from S3 (or the raw file if no render) — the cloud
    render worker produces the PWG; the agent consumes it. If the render worker isn't deployed /
    Redis is down, enqueueRenderOrReady promotes the job straight to READY/AWAITING_ACCEPT and the
    agent (or kiosk) may print the raw PDF instead (legacy fallback).
```

## Marketplaces / discovery / multi-tenancy

```
frontend /find + /find/:slug
  → discovery.routes.ts (anonymous, before resolveTenant) → public tenant projection
    (name, location, pricing, status) for marketplace + map
  → geocoding.service.ts stores lat/lng on Tenant (V2-30)

frontend /saas/* (tenant admin)
  → saas.routes.ts (auth + resolveTenant) → onboarding, payouts, bank/subaccount, kiosk fleet,
    settings/branding/domains/webhooks
  → saasApi.ts (RTK Query) drives the UI

frontend /platform (SUPER_ADMIN)
  → platform.routes.ts (authenticate + requirePlatformAdmin, no resolveTenant) → list/suspend/
    reactivate tenants, impersonation, fleet reliability
  → platformApi.ts drives the UI

tenant resolution (tenant.middleware.ts)
  priority: custom domain → owned subdomain → X-Tenant-Slug header → authenticated user → legacy fallback
  → resolveTenant (required on tenant-scoped routes) / optionalTenant (marketing/signup/platform)
  → suspended → 403, closed → 410, not member → 403

every customer-facing table has tenantId NOT NULL (backfilled by migrations + seed ensureLegacyTenant)
  → multi-tenancy is shipped (JOURNAL V2-30 → V2-34); legacy slug 'legacy' owns pre-multi-tenancy rows
```

## Configuration / bootstrap / observability

```
server.ts (01-backend)
  → initSentry first (sentry.service.ts, V2-34)
  → dotenv + reflect-metadata
  → AppDataSource (database.ts: SQLite vs Postgres from DATABASE_URL prefix)
  → assertDeployConfig (validateEnv.ts: fail-fast on missing/weak env in production)
  → runPostInitMigrations (per-cell pricing backfill, shop_reviews.photoUrl, legacy promotion code uppercase)
  → runSeed (seed.ts: demo data when SEED_DEMO=1 + users empty; otherwise infrastructure only)
  → ensureLegacyTenant (backfills tenantId on null customer-facing rows, creates legacy tenant + weekly payout schedule)
  → ensureSystemSettings (settings.ts: idempotent settings catalog, forces allowedFileTypes = PDF/JPG/PNG)
  → createApp() (app.ts) → listen on config.port
  → startRetentionSweep (retention.ts: local-disk cleanup, no Redis required)

app.ts route mount order (policy applies correctly)
  → requestContext first (every handler gets req.log)
  → appliance CORS for /api/printer /api/agent /api/participant-upload
  → global CORS for ALLOWED_ORIGINS
  → express.json with rawBody capture (Paystack HMAC) + express.urlencoded
  → /health, /api (openapi), /api/discovery (anonymous), /api/integrations (anonymous)
  → rate-limit prefix mounts
  → /api/auth (optionalTenant + passwordResetRoutes)
  → /api/saas, /api/render (HMAC callback, no tenant middleware)
  → /api/platform (super admin, no resolveTenant)
  → /api/admin/auth, /api/admin/kiosks (authenticate+resolveTenant), /api/admin/disputes, optional /api/admin/spike
  → /api/admin (authenticate+resolveTenant)
  → /api/groups, /api/participant-upload, /api/printer, /api/agent
  → /api/payments (optionalTenant), /api/pricing (optionalTenant), /api/branding, /api/legal, /api/preflight, /api/blog
  → /api/cups (resolveTenant)
  → /api/customer/auth (optionalTenant), /api/customer (authenticate+resolveTenant)
  → /api/files
  → /api (optionalTenant + devApi fallback, mounted last among /api/*)
  → 404 handler, error handler (multer→413/400, Sentry reportError, 500 JSON)

workers (backend-side BullMQ consumers, Redis)
  → queues.ts defines renderQueue + others
  → scheduled.worker.ts: periodic sweeps (reconcileStuckRenders, retention, alerts)
  → webhook.worker.ts: outbound tenant webhook dispatch with retry/backoff
  → watermark.worker.ts: legacy/optional watermark pipeline
  → fileCleanup.worker.ts: enforce documentRetentionHours
  → (render worker is separate: render-worker/ or worker/, consumes the same 'render' queue)

config (config/index.ts)
  → app / database / redis / auth / saas / payments.paystack / storage.s3+cloudinary /
    email (SMTP) / sms.termii / logging / sentry / render (callbackSecret/callbackUrl) /
    office (converter=gotenberg, gotenbergUrl) / print (dispatchMode)
```

## Tooling / build / vendor

```
tools/build-all.ps1 / build-all.sh
  → build everything (backend, worker, kiosk app, etc.) — the build entry points

tools/refresh-vendor.ps1
  → re-pull the 26 openprinting shallow clones (vendor/openprinting/)

tools/deploy-prod.ps1
  → production deploy (backend / worker / kiosk app) — check the file for the exact target

tools/e2e-render-test.ts
  → end-to-end render → callback → job-ready validation

tools/generate-dpa-pdf.ts + extract-dpa.ts
  → DPA document → PDF (legal compliance)

tools/cups-printloop/ (section 14)
  → CUPS backend + installer (laptop "Print to PrintLoop")

vendor/openprinting/ (section 15)
  → 26 read-only OpenPrinting repos; render worker + kiosk + agent depend on binaries/libs from here

printloop-kiosk-app/dist/ (section 17)
  → built kiosk app output; edit source in printloop-kiosk-app/src/ + build config, not dist/

03-document-preview-component/ (section 13)
  → preview component spike; confirm whether it's the source of truth or whether
    printloop-new-frontend/src/components/print/ copies are live

01-backend/tests/ (section 6) + 01-backend/migrations/ (section 7) + worker/ (section 8)
  → test coverage, schema history, and legacy worker — all previously missing from any dictionary
```

---

*End of CODEBASE-DICTIONARY.md. Split and merged from 7 separate dictionary files on 2026-09-13. If a section is wrong or stale, fix it here — this is now the single source of truth for the repo map.*
