# 2 · BACKEND — ENTITIES (TypeORM data model)

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
  details — per-tenant branding overrides surfaced to the frontend via
    /api/branding.

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
