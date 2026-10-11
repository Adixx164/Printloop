# 5 · BACKEND — SERVICES (business logic)

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

01-backend/services/backup.service.ts
  role — backup orchestration
  details — DB backup workflow helpers.

01-backend/services/onboarding.service.ts (repeated line note)
  role — already covered above; single source for signup/verification errors
