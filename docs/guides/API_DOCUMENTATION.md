# PrintLoop SaaS v2 - API Documentation

*Auto-generated from codebase routes - OpenAPI 3.1 specification*

---

## 📋 Overview

| Property | Value |
|----------|-------|
| **Title** | PrintLoop SaaS v2 API |
| **Version** | 2.0.0 |
| **Base URL** | `https://api.printloop.app/api` (production) / `http://localhost:4000/api` (dev) |
| **Auth** | JWT Cookie / X-Kiosk-Key / PrintToken / HMAC |
| **Format** | JSON |
| **Spec** | OpenAPI 3.1 |

---

## 🔐 Authentication

| Method | Header | Description |
|--------|--------|-------------|
| **Customer** | `Cookie: jwt=...` | HttpOnly JWT cookie |
| **Admin** | `Cookie: jwt=...` | Same cookie + `authenticate` middleware |
| **Agent** | `X-Kiosk-Key: <key>` | Long-lived kiosk API key |
| **CUPS** | `Authorization: Bearer <token>` \| `X-PrintLoop-Token` | PrintToken |
| **Webhooks** | `X-PrintLoop-Signature` | HMAC-SHA256 |
| **Paystack** | `X-Paystack-Signature` | HMAC-SHA512 |

---

## 📚 API Endpoints

---

### 🏥 Health & Metadata

#### `GET /health`
Health check endpoint.

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2026-09-24T10:30:00.000Z",
  "version": "2.0.0"
}
```

#### `GET /api/openapi.json`
OpenAPI 3.1 specification.

#### `GET /api/docs`
Swagger UI documentation.

---

### 🌐 Public Endpoints (No Auth)

#### `GET /api/branding`
Get tenant branding by host header.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "tenant": { "id": "uuid", "name": "PrintLoop (legacy)", "slug": "legacy" },
    "branding": null
  }
}
```

#### `GET /api/pricing`
Public pricing matrix (tenant-resolved by host).

**Response 200:**
```json
{
  "success": true,
  "data": {
    "currency": "NGN",
    "floor": 5,
    "officeConversion": true,
    "configs": [
      {
        "paperSize": "A4",
        "colorType": "BLACK_WHITE",
        "price100Simplex": 50,
        "price300Simplex": 70,
        "price600Simplex": 100,
        "price100Duplex": 65,
        "price300Duplex": 90,
        "price600Duplex": 120
      }
    ]
  }
}
```

#### `GET /api/discovery/shops`
Marketplace shop discovery.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "shops": [
      {
        "id": "uuid",
        "name": "PrintLoop UNILAG",
        "slug": "unilag",
        "location": "University of Lagos",
        "isOpen": true,
        "rating": 4.8
      }
    ]
  }
}
```

#### `GET /api/discovery/shops/:slug`
Get shop details.

#### `GET /api/discovery/shops/nearby`
Find nearby shops.

**Query:** `lat`, `lng`, `radius`, `limit`

---

### 👤 Customer API (JWT Cookie + optionalTenant)

> Base: `/api/customer` | Auth: JWT Cookie + `optionalTenant` middleware

#### `POST /api/customer/print-jobs`
Create a print job (single file).

**Request:** `multipart/form-data`
- `file` (required): PDF/JPG/PNG
- `printConfiguration` (JSON): `{ copies, paper, color, sided, qualityDpi, orientation }`
- `promotionCode` (optional)

**Response 201:**
```json
{
  "success": true,
  "data": {
    "job": {
      "id": "uuid",
      "fileName": "document.pdf",
      "title": "document",
      "code": null,
      "cost": 50,
      "status": "PENDING",
      "pageCount": 5,
      "printConfiguration": { ... },
      "createdAt": "2026-09-24T10:30:00.000Z",
      "expiresAt": "2026-09-25T10:30:00.000Z",
      "qrPayload": "printloop://release/ABC123"
    }
  }
}
```

#### `POST /api/customer/print-jobs/batch`
Create batch print job (multiple files, one code).

**Request:** `multipart/form-data`
- `files[]`: multiple files
- `items`: JSON array of per-file configs
- `collate`: boolean

#### `GET /api/customer/print-jobs`
List user's print jobs.

**Query:** `status` (optional filter)

#### `GET /api/customer/print-jobs/:id`
Get job details.

#### `POST /api/customer/print-jobs/quote`
Get price quote without creating job.

**Request:**
```json
{
  "pageCount": 5,
  "copies": 2,
  "paper": "A4",
  "color": "bw",
  "sided": "single",
  "qualityDpi": 300,
  "promotionCode": "WELCOME10"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "baseCost": 50,
    "cost": 45,
    "discount": 5,
    "promoCode": "WELCOME10",
    "promoReason": "First-time user discount"
  }
}
```

#### `GET /api/customer/print-jobs/options`
UI metadata for print options.

#### `GET /api/customer/stations`
Find nearby print stations.

#### `GET /api/customer/print-token`
Get current print token.

#### `POST /api/customer/print-token/rotate`
Rotate print token.

#### `POST /api/customer/print-token`
Legacy endpoint.

#### `POST /api/customer/shops/:slug/reviews`
Submit shop review.

#### `POST /api/customer/disputes`
File a dispute for a print job.

---

### 🏢 SaaS Admin API (JWT + resolveTenant)

> Base: `/api/saas` | Auth: JWT + `resolveTenant`

#### `POST /api/saas/signup`
Shop owner signup.

#### `POST /api/saas/login`
Shop owner login.

#### `GET /api/saas/dashboard`
Dashboard metrics.

#### `GET /api/saas/queue`
Job queue management.

#### `POST /api/saas/setup/paystack-subaccount`
Create Paystack subaccount.

#### `POST /api/saas/setup/bank-account`
Configure bank account for payouts.

#### `GET /api/saas/settings/*`
Settings: Branding, Domains, Webhooks, Security, Account.

---

### 👑 Admin API (JWT + authenticate + resolveTenant)

> Base: `/api/admin` | Auth: JWT + `authenticate` + `resolveTenant`

#### `POST /api/admin/auth/login`
Admin login.

#### `GET /api/admin/kiosks`
Manage kiosks.

#### `GET /api/admin/disputes`
Dispute management.

---

### 🌐 Platform API (SUPER_ADMIN Only)

> Base: `/api/platform` | Auth: JWT + `authenticate` (SUPER_ADMIN role)

#### `GET /api/platform`
Platform console.

#### `GET /api/platform/tenants`
List all tenants.

#### `POST /api/platform/tenants/:id/suspend`
Suspend tenant.

---

### 🖨️ CUPS Ingress (PrintToken)

> Base: `/api/cups` | Auth: PrintToken (Bearer / X-PrintLoop-Token)

#### `POST /api/cups/print`
Submit print job from CUPS backend.

**Request:** `multipart/form-data`
- `file`: PDF/JPG/PNG
- `title`: Job title
- `copies`: Number
- `options`: CUPS options string

**Response:**
```json
{
  "success": true,
  "data": {
    "code": "ABC123",
    "cost": 50,
    "pages": 5,
    "copies": 1,
    "config": { ... },
    "payUrl": "https://checkout.paystack.com/...",
    "message": "PrintLoop release code: ABC123 (₦50). Pay at: https://..."
  }
}
```

---

### 🤖 Agent API (X-Kiosk-Key)

> Base: `/api/agent` | Auth: `X-Kiosk-Key` header

#### `GET /api/agent/jobs/ready`
Poll for ready jobs (every 4s).

**Response:**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": "uuid",
        "code": "ABC123",
        "jobType": "single",
        "totalPages": 5,
        "items": [
          {
            "fileId": "uuid",
            "fileName": "doc.pdf",
            "downloadUrl": "https://.../file?t=...",
            "printConfiguration": { ... },
            "totalPages": 5
          }
        ]
      }
    ]
  }
}
```

#### `GET /api/agent/jobs/:id/file`
Download file for printing (signed JWT, 5min TTL).

**Query:** `t=<jwt>`, `item=<itemId>` (optional for batch)

**Response:** `application/pdf` or `image/pwg-raster`

#### `POST /api/agent/jobs/:id/start`
Claim job for printing.

#### `POST /api/agent/jobs/:id/complete`
Report print completion.

**Body:**
```json
{
  "confirmation": "confirmed",
  "method": "ipp-job-state",
  "detail": "optional detail"
}
```

**Confirmation Methods:**
| Method | Description |
|--------|-------------|
| `ipp-job-state` | IPP Get-Job-Attributes polling |
| `queue-drain` | OS spooler queue drain |
| `none` | raw9100/printnode/lpd/email (no feedback) |

#### `POST /api/agent/jobs/:id/failed`
Report print failure.

#### `POST /api/agent/printer/capabilities`
Report printer capabilities (V2-44 P2).

---

### 🎨 Render Callback (HMAC-SHA256)

> Base: `/api/render` | Auth: HMAC-SHA256

#### `POST /api/render/callback`
Render worker success callback.

**Headers:** `X-PrintLoop-Signature: <hmac-sha256>`

**Body:**
```json
{
  "printJobId": "uuid",
  "renderedKey": "renders/tenant/job.pwg",
  "renderedPdfUrl": "https://s3.amazonaws.com/...",
  "previewImageUrls": ["https://..."],
  "pageCount": 5,
  "bytes": 1024000,
  "durationMs": 3500
}
```

#### `POST /api/render/failure`
Render worker failure callback.

---

### 🔔 Tenant Webhooks (Dimension 14)

> Configured per-tenant via SaaS settings.

**Events:**
| Event | Description |
|-------|-------------|
| `job.created` | Print job created |
| `job.paid` | Payment successful |
| `job.ready` | Render complete, ready for pickup |
| `job.released` | Printed at kiosk |
| `job.failed` | Print failed |
| `job.expired` | Job expired (24h) |
| `payout.initiated` | Payout initiated |
| `payout.paid` | Payout settled |
| `payout.failed` | Payout failed |

**Payload:**
```json
{
  "event": "job.ready",
  "tenantId": "uuid",
  "emittedAt": "2026-09-24T10:30:00.000Z",
  "data": { "printJobId": "uuid", "code": "ABC123", "cost": 50 }
}
```

**Delivery:** HMAC-SHA256 signed POST, BullMQ retry (3 attempts, exponential backoff).

---

### 📦 Render Worker Callback

> Internal: `POST /api/internal/render/callback` (worker only)

---

## 📊 Data Models

### PrintJob
```typescript
interface PrintJob {
  id: string;
  userId: string | null;
  tenantId: string | null;
  fileId: string;
  fileName: string;
  code: string | null;           // 6-char release code
  cost: number;                   // ₦ (what customer paid)
  finalCost: number | null;       // ₦ (after render reconciliation)
  totalPages: number;
  jobType: 'single' | 'personal_batch' | 'group_batch';
  status: PrintJobStatus;
  printConfiguration: PrintConfiguration;
  code: string | null;
  requiresAccept: boolean;
  agentConfirmation: string | null;  // "ipp-job-state:confirmed"
  finalCost: number | null;
  costReconciledAt: Date | null;
}
```

### PrintConfiguration
```typescript
interface PrintConfiguration {
  copies: number;
  paper: 'A4' | 'A3' | 'Letter' | 'Legal';
  color: 'bw' | 'color';
  sided: 'single' | 'double';
  qualityDpi: 100 | 300 | 600;
  orientation?: 'portrait' | 'landscape';
}
```

### PrintJobStatus
```typescript
enum PrintJobStatus {
  PENDING = 'pending',
  RENDERING = 'rendering',
  AWAITING_ACCEPT = 'awaiting_accept',
  READY = 'ready',
  AWAITING_EDIT = 'awaiting_edit',
  EDIT_COMPLETE = 'edit_complete',
  AWAITING_PAYMENT = 'awaiting_payment',
  PAID = 'paid',
  RELEASING = 'releasing',
  PRINTING = 'printing',
  DONE = 'done',
  FAILED = 'failed',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
  AWAITING_PAYMENT = 'awaiting_payment'
}
```

### PricingConfig
```typescript
interface PricingConfig {
  paperSize: 'A4' | 'A3' | 'LETTER' | 'LEGAL';
  colorType: 'BLACK_WHITE' | 'COLOR';
  pricePerPage: number;
  duplexMultiplier: number;
  highResolutionMultiplier: number;
  price100Simplex: number | null;
  price300Simplex: number | null;
  price600Simplex: number | null;
  price100Duplex: number | null;
  price300Duplex: number | null;
  price600Duplex: number | null;
}
```

### Tenant
```typescript
interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'trial' | 'active' | 'suspended' | 'closed';
  commissionPct: number;      // 0.10 = 10%
  paystackSubaccountCode: string | null;
  isDiscoverable: boolean;
  availability: 'open' | 'busy' | 'closed';
  lat: number | null;
  lng: number | null;
  address: string | null;
}
```

---

## 🔧 Error Responses

### Standard Error Format
```json
{
  "success": false,
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Invalid/missing auth |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `FILE_TOO_LARGE` | 413 | File exceeds size limit |
| `UNSUPPORTED_DOCUMENT` | 415 | Unsupported file type |
| `TOO_MANY_PAGES` | 413 | Page count exceeds limit |
| `SHOP_OFFLINE` | 409 | Selected shop offline |
| `PAYMENT_FAILED` | 402 | Payment processing failed |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | HMAC verification failed |
| `IDEMPOTENCY_CONFLICT` | 409 | Duplicate idempotency key |

---

## 📄 OpenAPI Spec Access

**Live Spec:** `GET /api/openapi.json` (on running server)

**Swagger UI:** `GET /api/docs`

**Export Command:**
```bash
# From running server
curl http://localhost:4000/api/openapi.json > openapi.json

# Validate
npx @redocly/openapi-cli lint openapi.json
```

---

## 🔄 Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/customer/auth/login` | 5 | 1 min |
| `/api/customer/auth/register` | 10 | 1 hour |
| `/api/saas/signup` | 10 | 1 hour |
| `/api/saas/verify-email` | 10 | 1 hour |
| `/api/auth/forgot-password` | 5 | 1 hour |
| `/api/customer/print-jobs` | 30 | 1 min |
| `/api/agent/jobs/ready` | 60 | 1 min (per kiosk) |

---

## 📝 Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-09-24 | Initial v2 release |
| 1.0.0 | 2026-05-31 | Legacy v1 baseline |

---

*Generated from PrintLoop SaaS v2 codebase • OpenAPI 3.1 • Last updated: 2026-09-24*