# PrintLoop SaaS v2 - Complete Architectural Mapping

*Generated from codebase analysis - every service, data flow, integration point, and operational component mapped.*

---

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                              PRINTLOOP SAAS V2 ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐ │
│  │   CUSTOMER  │    │   BACKEND   │    │ RENDER WORKER │    │  KIOSK AGENT  │  │  KIOSK  │ │
│  │  FRONTEND   │◄──►│   (API)     │◄──►│  (Railway)    │◄──►│  (On-site)    │◄──►│ PRINTER │ │
│  │  (React)    │    │  (Express)  │    │  (BullMQ)     │    │  (Node.js)    │  │  (LAN)  │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └──────────┘ │
│         │                  │                  │                  │                  │        │
│         │                  │                  │                  │                  │        │
│         ▼                  ▼                  ▼                  ▼                  ▼        │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────┐│
│  │                              SHARED INFRASTRUCTURE                                       ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐  ││
│  │  │  DATABASE   │ │    REDIS    │ │    S3       │ │  PAYSTACK   │ │   TENANT WEBHOOKS │  ││
│  │  │  (SQLite/   │ │  (BullMQ    │ │  (Artifact  │ │  (Payments  │ │   (Dimension 14) │  ││
│  │  │   Postgres) │ │   Queues)   │ │   Storage)  │ │   & Splits) │ │                   │  ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘  ││
│  └────────────────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 SERVICE DECOMPOSITION (14 Services)

| Service | Responsibility | Technology | Key Files |
|---------|---------------|------------|-----------|
| **API Gateway** | HTTP routing, auth, tenant resolution | Express.js | `01-backend/app.ts`, `server.ts` |
| **Customer Print API** | Customer uploads, pricing, jobs | Express | `customerPrint.routes.ts` |
| **Agent API** | Kiosk agent polling, file dispatch | Express | `agent.routes.ts` |
| **CUPS Ingress** | Laptop printing via CUPS | Express | `cups.routes.ts` |
| **SaaS Onboarding** | Shop signup, subaccounts | Express | `saas.routes.ts` |
| **Payments** | Paystack integration, webhooks | Service | `paystack.service.ts`, `payments.service.ts` |
| **Render Enqueue** | Cloud render queue management | Service | `renderEnqueue.service.ts` |
| **Cost Reconciliation** | Pricing → render → final cost | Service | `costReconciliation.service.ts` |
| **Tenant Balance** | Per-tenant ledger | Service | `tenantBalance.service.ts` |
| **Commission** | Bolt-style split math | Service | `commission.service.ts` |
| **Render Worker** | PDF → PWG-Raster | Node.js | `render-worker/src/pipeline/render.ts` |
| **Kiosk Agent** | Cloud → LAN printer bridge | Node.js | `printloop-agent/agent.ts` |
| **Kiosk App** | Touchscreen UI | Electron | `printloop-kiosk-app/src/` |
| **Frontend** | Customer/shop UI | React | `printloop-new-frontend/` |

---

## 🔄 COMPLETE DATA FLOWS

### 1. CUSTOMER WEB UPLOAD FLOW (Primary Flow)

```
┌─────────┐     ┌──────────────────┐     ┌──────────────┐     ┌─────────────────┐
│Customer │────►│ POST /api/cust/  │────►│  Upload file │────►│  Save to S3 /   │
│ Browser │     │ print-jobs       │     │  to memory   │     │  local storage  │
└─────────┘     └──────────────────┘     └──────────────┘     └─────────────────┘
                                                │                      │
                                                ▼                      ▼
                                      ┌─────────────────┐     ┌────────────────────┐
                                      │ Flatten annot.  │     │  Count pages       │
                                      │ (signatures)    │     │  (pdf-lib)         │
                                      └─────────────────┘     └────────────────────┘
                                                │                      │
                                                ▼                      ▼
                                      ┌─────────────────────────────────────────┐
                                      │           PRICING ENGINE                 │
                                      │  computeCost(pageCount, config)         │
                                      │  → ₦5/page B&W, ₦25/page Color          │
                                      │  → Duplex 0.85x, 600dpi 1.2x            │
                                      └─────────────────────────────────────────┘
                                                │
                                                ▼
                                      ┌─────────────────────────────────────────┐
                                      │         CREATE PRINT JOB                 │
                                      │  status: PENDING                        │
                                      │  cost: computed                         │
                                      │  code: null (minted after payment)      │
                                      │  status: PENDING                        │
                                      └─────────────────────────────────────────┘
                                                │
                                                ▼
                                      ┌─────────────────────────────────────────┐
                                      │         PAYSTACK CHECKOUT                │
                                      │  POST /api/payments/initialize-job-payment│
                                      │  → authorization_url                     │
                                      │  → reference = JOB_{id}_{timestamp}     │
                                      └─────────────────────────────────────────┘
                                                │
                                                ▼
                    ┌───────────────────────────┬───────────────────────────────┐
                    ▼                           ▼                               ▼
         ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
         │ Customer pays on     │    │ Paystack webhook     │    │ Webhook handler      │
         │ Paystack page        │───►│ charge.success       │───►│ completePrintJobPayment│
         └──────────────────────┘    └──────────────────────┘    └──────────────────────┘
                                                              │
                                                              ▼
                                                  ┌───────────────────────────────────┐
                                                  │     COMPLETE PAYMENT LOGIC        │
                                                  │  1. Mint release code (6-char)    │
                                                  │  2. Record Payment + Transaction  │
                                                  │  3. Update tenant balance         │
                                                  │  4. Send SMS/Email with code      │
                                                  │  5. Enqueue render job            │
                                                  │  6. Arm accept window (V2-58)     │
                                                  └───────────────────────────────────┘
```

### 2. CLOUD RENDER → KIOSK SPOOL PIPELINE (V2-6 Architecture)

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  PAYMENT DONE   │────►│  renderEnqueue   │────►│  BULLMQ render     │
│  (webhook)      │     │  .enqueueRender  │     │  queue (BullMQ)    │
└─────────────────┘     └──────────────────┘     └────────────────────┘
                                                          │
                                                          ▼
                                              ┌──────────────────────────────────────┐
                                              │         RENDER WORKER (Railway)       │
                                              │  BullMQ worker consumes 'render'      │
                                              │  queue → runs render pipeline          │
                                              └──────────────────────────────────────┘
                                                          │
                                                          ▼
                                              ┌──────────────────────────────────────────────────────────────────────┐
                                              │                    RENDER PIPELINE (pipeline/render.ts)               │
                                              │  1. Download source file from S3                                     │
                                              │  2. Normalize to PDF/A (Ghostscript)                                 │
                                              │  3. Apply print config (dpi, color, duplex, paper, orientation)      │
                                              │  4. cups-filters: pdf → PWG-Raster (pdftopwg)                        │
                                              │  5. Parse PWG header → page count, color/mono pages                  │
                                              │  3. Generate preview images (Ghostscript JPEG)                       │
                                              │  7. Upload PWG + previews to S3                                      │
                                              │  8. POST /api/render/callback (HMAC signed)                          │
                                              └──────────────────────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                    ┌──────────────────────────────────────────────────────────────────────┐
                    │              BACKEND CALLBACK: applyRenderCostReconciliation          │
                    │  1. Compute final cost from ACTUAL page count                        │
                    │  2. delta = finalCost - paidCost                                     │
                    │     • delta < 0 → write-off (tenant ledger reversed)                 │
                    │     • delta > 0 → shortfall (kiosk gate charges saved card)          │
                    │  3. Update PrintJob: finalCost, status=READY/AWAITING_ACCEPT         │
                    │  4. Mint release code if not minted                                  │
                    │  5. Fire tenant webhook (JOB_READY / JOB_FAILED)                     │
                    └──────────────────────────────────────────────────────────────────────┘
                                                          │
                                                          ▼
                    ┌──────────────────────────────────────────────────────────────┐
                    │                    KIOSK AGENT POLLING                        │
                    │  Agent polls: GET /api/agent/jobs/ready                      │
                    │  → Returns RELEASING jobs with signed download URLs          │
                    │  Agent downloads PDF/PWG, dispatches via IPP/raw9100/spooler │
                    │  Agent reports: POST /jobs/:id/complete or /failed           │
                    │  Backend: marks DONE/FAILED, queues cleanup, fires webhook   │
                    └──────────────────────────────────────────────────────────────┘
```

### 3. KIOSK AGENT FLOW (On-Site)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        KIOSK AGENT (printloop-agent)                        │
│  Runs on shop PC (Windows/Linux) - only OUTBOUND HTTPS to cloud            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
            ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
            │  POLL LOOP    │   │  DISPATCH     │   │  CONFIRMATION │
            │  (4s interval)│   │  (3 transports)│   │  (job-truth)  │
            └───────────────┘   └───────────────┘   └───────────────┘
                    │                   │                   │
                    ▼                   ▼                   ▼
            GET /jobs/ready         3 TRANSPORTS:       V2-44 JOB-TRUTH:
            every 4s                • IPP (port 631)      • ipp-job-state: printer
            Returns:                • raw9100 (port 9100)   reports job-state=
                • job.id                + PJL               completed/canceled
                • items[]                 • spooler (OS)        • queue-drain: OS
                • signed download URL     • printnode (cloud)   queue drained
                • signed JWT (5min)       • email (HP ePrint)   • none: raw9100
                                                                     (no feedback)
                    │                   │                   │
                    ▼                   ▼                   ▼
            POST /jobs/:id/start    Dispatch bytes        POST /jobs/:id/
            → claim job               via transport      complete {confirmation,
            → status=PRINTING         (IPP/raw9100/          method, detail}
                status=PRINTING        spooler/printnode/
                                        email)
```

---

## 🗄️ DATA MODEL (Key Entities)

### Core Entities & Relationships

```
Tenant (1) ──────< TenantMember >────── (N) User
    │
    ├──< (1) TenantBranding
    ├──< (N) TenantDomain
    ├──< (N) TenantWebhook
    ├──< (N) TenantBalance  (denormalized ledger)
    ├──< (N) Kiosk
    ├──< (N) PricingConfig
    ├──< (N) PrinterProfile
    ├──< (N) PrintJob
    │       ├──< (N) PrintJobItem
    │       ├──< (1) File
    │       ├──< (1) Kiosk
    │       ├──< (1) PrinterProfile
    │       ├──< (1) DocumentEdit
    │       └──< (1) Payment
    ├──< (N) Payment
    ├──< (N) Transaction  (denormalized ledger)
    ├──< (N) Wallet
    ├──< (N) Payout
    │       └──< (N) PayoutSchedule
    ├──< (N) PayoutSchedule
    ├──< (N) Payout
    ├──< (N) Promotion
    ├──< (N) ShopReview
    ├──< (N) Dispute
    ├──< (N) BlogPost
    ├──< (N) GroupSession
    │       └──< (N) GroupParticipant
    └──< (N) File

User (1) ──────< (N) PrintJob
    │
    ├──< (1) Wallet
    ├──< (N) Transaction
    ├──< (N) File
    ├──< (N) PrintJob
    └──< (1) PrintToken (CUPS)
```

### Key Enums

```typescript
PrintJobStatus = [
  'PENDING',          // created, awaiting payment
  'RENDERING',        // cloud worker processing
  'AWAITING_ACCEPT',  // V2-58 marketplace accept window
  'READY',            // rendered, awaiting release
  'AWAITING_EDIT',    // V2-XX edit flow
  'EDIT_COMPLETE',
  'AWAITING_PAYMENT',
  'PAID',
  'RELEASING',        // kiosk agent claimed
  'PRINTING',         // agent dispatched to printer
  'DONE',             // confirmed printed
  'FAILED',           // printer error
  'EXPIRED',          // 24h TTL
  'REFUNDED',
  'AWAITING_PAYMENT'
]

PrintJobType = ['single', 'personal_batch', 'group_batch']

TransportMode = ['ipp', 'raw9100', 'spooler', 'printnode', 'lpd', 'email']
```

---

## 🔐 MULTI-TENANCY ARCHITECTURE (Dimension 2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TENANT RESOLUTION CHAIN                          │
│  Priority order (middleware/tenant.middleware.ts):                  │
│                                                                     │
│  1. JWT token (tenantId claim)          → highest priority         │
│  2. Subdomain (tenant.printloop.app)    → marketplace              │
│  3. Custom domain (print.shop.com)      → tenantDomain table       │
│  4. X-Tenant-Slug header                → API integrations         │
│  5. Legacy fallback (tenantId=null)     → legacy single-tenant     │
└─────────────────────────────────────────────────────────────────────┘

Middleware Chain (app.ts):
  requestContext → CORS → rateLimit → passwordReset → optionalTenant
                           → resolveTenant (required on tenant-scoped routes)

Row-Level Security:
  - Every customer-facing entity has tenantId NOT NULL (V2-8 migration)
  - All queries auto-scoped via resolveTenant middleware
  - Partial unique indexes: (email, tenantId), (idempotencyKey, userId)
```

---

## 💰 PAYMENT & COMMISSION ARCHITECTURE (Dimensions 5, 9, 15)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PAYMENT FLOW (Paystack)                         │
│                                                                     │
│  Customer ──► Paystack Checkout ──► charge.success webhook         │
│                      │                         │                    │
│                      ▼                         ▼                    │
│            ┌─────────────────┐      ┌─────────────────┐           │
│            │  SPLIT PAYMENT  │      │  WEBHOOK HANDLER │           │
│            │  • customer_amt │      │  • verify HMAC    │           │
│            │  • commission   │      │  • charge.success │           │
│            │  • subaccount   │      │  • completePrintJob│          │
│            └─────────────────┘      │  • applyTransactionDelta    │
│                                     └─────────────────┘           │
│                                                                     │
│  COMMISSION ENGINE (Bolt-style):                                    │
│  • commission = gross × rate (default 10%, clamped 0-50%)         │
│  • tenant_net = gross - commission                                  │
│  • Paystack transaction_charge = commission (kobo)                │
│  • subaccount = tenant.paystackSubaccountCode                      │
│  • bearer = 'account' (tenant bears processor fee)                │
└─────────────────────────────────────────────────────────────────────┘

TENANT BALANCE LEDGER (Denormalized - TenantBalance entity):
  lifetimeTenantNet   = Σ(tx.amount - tx.commissionAmount)
  lifetimeCommission  = Σ(tx.commissionAmount)
  lifetimePayouts     = Σ(payout.amount WHERE status=PAID)
  pendingPayouts      = Σ(payout.amount WHERE status IN [PENDING,PROCESSING])
  availableBalance    = lifetimeTenantNet - lifetimePayouts - pendingPayouts
```

---

## 🖨️ PRINT TRANSPORT MATRIX (6 Transports)

| Transport | Protocol | Port | Use Case | Feedback | Confirmation |
|-----------|----------|------|----------|----------|--------------|
| **ipp** | IPP/HTTP | 631 | Modern network printers | IPP Get-Job-Attributes | Job-state=completed |
| **raw9100** | JetDirect | 9100 | HP/Brother/Lexmark | None (fire-forget) | None |
| **spooler** | OS Print Queue | OS | USB/Bluetooth/local | OS queue drain | Queue drained |
| **printnode** | HTTPS/PrintNode | 443 | Behind NAT/firewall | PrintNode API | Polling (planned) |
| **lpd** | LPR/LPD | 515 | Legacy Unix/Enterprise | None | None |
| **email** | SMTP | 587 | HP ePrint, Canon, Epson | SMTP 250 OK | None |

---

## ⚙️ JOB LIFECYCLE STATE MACHINE

```
                    ┌─────────┐
                    │ PENDING │  ◄──── Created (upload, CUPS, batch)
                    └────┬────┘
                         │ payment webhook
                         ▼
                    ┌───────────┐
                    │ RENDERING │ ◄── Cloud render worker
                    └─────┬─────┘
                          │ render callback
                          ▼
              ┌───────────┴───────────┐
              ▼                       ▼
       ┌─────────────┐         ┌─────────────┐
       │ AWAITING_   │         │    READY    │
       │ ACCEPT      │         │             │
       │ (marketplace)│         │             │
       └──────┬──────┘         └──────┬──────┘
              │                       │
       operator accepts          kiosk agent polls
              │                       │
              ▼                       ▼
        ┌──────────┐           ┌───────────┐
        │ RELEASING │           │ PRINTING  │
        └─────┬─────┘           └─────┬─────┘
              │                       │
              │            agent dispatches
              │                       │
              ▼                       ▼
        ┌──────────┐           ┌──────────┐
        │   DONE   │           │  FAILED  │
        └──────────┘           └──────────┘
              │                       │
              │         agent reports failed
              │                       │
              └───────────┬───────────┘
                          ▼
                   ┌────────────┐
                   │  EXPIRED   │  (24h TTL)
                   │  REFUNDED  │
                   └────────────┘

Special states:
  AWAITING_EDIT / EDIT_COMPLETE / AWAITING_PAYMENT / PAID / AWAITING_PAYMENT
  (V2-XX Document Editing Service)
```

---

## 📊 SCHEDULED JOBS (BullMQ - queues.ts)

| Job | Cron | Purpose |
|-----|------|---------|
| `auto-close-group-sessions` | every 15min | Close stale group sessions |
| `mark-offline-kiosks` | every 5min | Kiosk heartbeat → offline |
| `daily-cleanup` | 03:00 UTC | Expired jobs, files |
| `db-backup` | 02:30 UTC | SQLite VACUUM INTO / pg_dump |
| `process-payouts` | 04:00 UTC | Tenant payouts (Dimension 15) |
| `reconcile-stuck-renders` | every 10min | RENDERING > 15min → requeue/FAILED |

---

## 🔐 AUTHENTICATION & AUTHORIZATION

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTH LAYERS                                    │
├─────────────────────────────────────────────────────────────────┤
│  Customer API:     JWT (HttpOnly cookie) + optionalTenant       │
│  Admin API:        JWT + authenticate + resolveTenant           │
│  SaaS API:         JWT + optionalTenant (onboarding)            │
│  Agent API:        X-Kiosk-Key header (long-lived)              │
│  CUPS Ingress:     PrintToken (Bearer / X-PrintLoop-Token)     │
│  Render Callback:  HMAC-SHA256 (RENDER_CALLBACK_SECRET)         │
│  Webhooks:         HMAC-SHA256 (secret per webhook)             │
│  Paystack:         HMAC-SHA512 (PAYSTACK_WEBHOOK_SECRET)        │
│  CUPS:             PrintToken (Bearer / X-PrintLoop-Token)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 FILE STORAGE ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    FILE STORAGE LAYERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  UPLOAD (customer uploads)                                      │
│  └── multer.memoryStorage() → saveBuffer() → S3 / local        │
│       └── File entity: fileURL, sizeBytes, pageCount, mimeType │
│                                                                 │
│  RENDER OUTPUT (render worker)                                  │
│  └── render-worker → S3 key: renders/{tenantId}/{jobId}.pwg    │
│       └── File entity or PrintJob.renderedKey                  │
│                                                                 │
│  AGENT DOWNLOAD                                                 │
│  └── Signed JWT (5min TTL) → GET /api/agent/jobs/:id/file      │
│       → loadDocumentBytes() → S3 presigned or local path       │
│                                                                 │
│  CUPS INGRESS                                                   │
│  └── upload.single('file') → memoryStorage → saveBuffer()      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 EVENT-DRIVEN ARCHITECTURE (BullMQ Queues)

```
┌─────────────────────────────────────────────────────────────────┐
│                     BULLMQ QUEUE TOPOLOGY                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   render    │    │ webhook-    │    │   notifications     │ │
│  │   queue     │    │ deliveries  │    │      queue          │ │
│  │             │    │   queue     │    │                     │ │
│  │ Payload:    │    │ Payload:    │    │ Payload:            │ │
│  │ {printJobId,│    │ {webhookId, │    │ {template, to,      │ │
│  │  tenantId,  │    │  url,       │    │  data, channel}    │ │
│  │  sourceKey, │    │  secret,    │    │                     │ │
│  │  profileId} │    │  event,     │    │                     │ │
│  │             │    │  body}      │    │                     │ │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘ │
│         │                  │                       │            │
│         ▼                  ▼                       ▼            │
│  ┌─────────────┐   ┌─────────────┐          ┌─────────────┐   │
│  │ render-     │   │ webhook-    │          │ email/      │   │
│  │ worker      │   │ worker      │          │ sms worker  │   │
│  │ (Railway)   │   │ (local)     │          │ (Termii)    │   │
│  └─────────────┘   └─────────────┘          └─────────────┘   │
│                                                                 │
│  Scheduled Jobs (repeatable):                                   │
│  • auto-close-group-sessions (15min)                           │
│  • mark-offline-kiosks (5min)                                  │
│  • daily-cleanup (03:00 UTC)                                   │
│  • db-backup (02:30 UTC)                                       │
│  • process-payouts (04:00 UTC)                                 │
│  • reconcile-stuck-renders (10min)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 KEY INTEGRATION POINTS

### 1. Paystack Integration (Dimensions 5, 9, 15)
- **Split Payments**: Commission split at charge time via subaccount
- **Saved Cards**: Authorization codes stored for delta charges (V2-53)
- **Webhooks**: charge.success, transfer.success/failed/reversed
- **Refunds**: Eliminated (V2-53) — write-offs instead

### 2. CUPS Integration (Laptop Printing)
- **Auth**: PrintToken (Bearer / X-PrintLoop-Token)
- **CUPS Backend**: Translates IPP → HTTP POST /api/cups/print
- **Idempotency**: CUPS retries → idempotency-key dedup
- **Release Code**: Pre-minted at creation, visible in `lpq`

### 3. Render Worker (Cloud → Kiosk Spool)
- **Input**: PDF from S3
- **Pipeline**: Ghostscript PDF/A → pdftopwg (cups-filters) → PWG-Raster
- **Output**: PWG-Raster + preview JPGs → S3
- **Callback**: HMAC-SHA256 signed POST /api/render/callback
- **Fallback**: `enqueueRenderOrReady()` → READY direct if Redis disabled

### 4. Kiosk Agent (On-Site Bridge)
- **Auth**: X-Kiosk-Key header (long-lived)
- **Polling**: 4s interval → GET /api/agent/jobs/ready
- **Dispatch**: 6 transports (IPP/raw9100/spooler/printnode/lpd/email)
- **Confirmation**: V2-44 job-truth (IPP job-state, queue-drain, none)
- **Heartbeat**: /api/agent/heartbeat every 30s

---

## 📈 OBSERVABILITY & OPERATIONS

| Layer | Tool | Purpose |
|-------|------|---------|
| **API** | Request context middleware | req.log, req.requestId, structured logs |
| **Errors** | Sentry (initSentry at bootstrap) | Error capture with tenant context |
| **Metrics** | Structured JSON logs | JSON per-request, per-job |
| **Render** | Logger (pino) | Pipeline stages, timing |
| **Agent** | Rolling file log | `%ProgramData%\PrintLoop\agent.log` |
| **Scheduled** | Console logs | Job start/end, counts |

---

## 🚀 DEPLOYMENT TOPOLOGY

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION DEPLOYMENT                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐     ┌──────────────────┐                 │
│  │   FRONTEND        │     │   BACKEND API    │                 │
│  │  (Vercel/Netlify/ │     │  (Railway/Render │                 │
│  │   Railway Static) │     │   / Fly.io)      │                 │
│  └────────┬──────────┘     └────────┬─────────┘                 │
│           │                         │                            │
│           ▼                         ▼                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    SHARED INFRASTRUCTURE                    │ │
│  │  ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌────────────┐  │ │
│  │  │ Postgres │  │  Redis  │  │   S3     │  │  Paystack  │  │ │
│  │  │ (Neon/   │  │ (Upstash│  │  (AWS/   │  │  (Split    │  │ │
│  │  │ Railway) │  │  /Rail) │  │  R2/MinIO)│  │  Payments) │  │ │
│  │  └──────────┘  └─────────┘  └──────────┘  └────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    RENDER WORKER (Railway)                  │ │
│  │  • Consumes 'render' queue                                  │ │
│  │  • Ghostscript + cups-filters (pdftopwg)                   │ │
│  │  • Outputs PWG-Raster → S3                                  │ │
│  │  • HMAC callback to /api/render/callback                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              ON-SITE KIOSK AGENT (per shop)                │ │
│  │  • Windows/Linux service (systemd / Scheduled Task)       │ │
│  │  • Outbound HTTPS only (no VPN/tunnel)                     │ │
│  │  • Auto-discovery: USB + mDNS + port scan                  │ │
│  │  • 6 transports: IPP/9100/spooler/printnode/lpd/email     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    KIOSK APP (Electron)                     │ │
│  │  • Fullscreen touchscreen UI                               │ │
│  │  • Polls /api/agent/jobs/ready                             │ │
│  │  • Displays release code, job status                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 COMPLETE FLOW SUMMARY: END-TO-END

```
1. CUSTOMER UPLOAD
   Browser ──► /api/customer/print-jobs (multipart)
              ├── flattenAnnotations (signatures)
              ├── countPages (pdf-lib)
              ├── computeCost (pricing matrix)
              ├── applyPromotion
              ├── saveBuffer → S3
              ├── create PrintJob (PENDING, code=null)
              └── POST /payments/initialize-job-payment
                        │
                        ▼
2. PAYMENT
   Customer ──► Paystack Checkout
              │
              ▼
   Paystack ──► /api/payments/webhook (charge.success)
              │
              ▼
3. COMPLETE PAYMENT
   completePrintJobPayment(jobId, reference)
              ├── mint release code (6-char)
              ├── record Payment + Transaction
              ├── applyTransactionDelta (tenant balance)
              ├── send SMS/Email with code
              ├── enqueueRenderOrReady
              └── arm accept window (V2-58)
                        │
                        ▼
4. RENDER (async, BullMQ)
   renderQueue.add('render', {printJobId, tenantId, ...})
                        │
                        ▼
   render-worker (Railway)
   ├─ download PDF from S3
   ├─ Ghostscript: PDF → PDF/A
   ├─ pdftopwg: PDF → PWG-Raster
   ├─ Ghostscript: preview JPGs
   ├─ upload PWG + previews to S3
   └─ HMAC POST /api/render/callback
                        │
                        ▼
5. CALLBACK & RECONCILIATION
   applyRenderCostReconciliation
   ├─ finalCost = computeCost(actualPages)
   ├─ delta = finalCost - paid
   │   ├─ delta < 0 → write-off (tenant ledger reversal)
   │   └─ delta > 0 → shortfall (kiosk gate)
   ├─ status = READY / AWAITING_ACCEPT
   ├─ mint release code (if needed)
   └─ fire tenant webhook (JOB_READY/JOB_FAILED)
                        │
                        ▼
6. KIOSK AGENT PICKUP
   Agent polls /api/agent/jobs/ready (4s)
   ──► signed JWT download URLs (5min TTL)
   ──► Download PDF/PWG
   ──► Dispatch via transport:
   │   ├─ IPP (port 631) + confirmIppJob
   │   ├─ raw9100 (port 9100) + PJL
   │   ├─ spooler (OS lp/PrintTo)
   │   ├─ printnode (cloud proxy)
   │   ├─ lpd (port 515)
   │   └─ email (SMTP)
   └─► POST /jobs/:id/complete {confirmation}
                        │
                        ▼
7. COMPLETION
   agentConfirmation = "ipp-job-state:confirmed"
   printerExt.completePrintJob
   └── kiosk counters, cleanup, audit log
```

---

*This architectural mapping represents the complete PrintLoop SaaS v2 system as implemented in the codebase. Every service, data flow, integration point, and operational component is mapped from the actual implementation.*