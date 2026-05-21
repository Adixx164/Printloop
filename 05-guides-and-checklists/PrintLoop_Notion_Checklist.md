# 🖨️ PrintLoop — Implementation Checklist

> **Last updated:** April 2026  
> **Legend:** ✅ Done · ⚠️ Partial · ❌ Todo · 🔴 P0 Critical · 🟠 P1 High · 🟡 P2 Medium · ⚪ P3 Low

---

## 📊 Phase Scorecard

| Phase | Description | Status | Done | Partial | Todo | Est. Hours Left |
|---|---|---|---|---|---|---|
| Phase 1 – Foundation | DB entities & schema | ✅ Done | 22 | 4 | 0 | ~8h |
| Phase 2 – Customer App | Single & batch print flow | ⚠️ Partial | 18 | 8 | 5 | ~24h |
| Phase 3 – Group Printing | Host/participant group flow | ❌ Todo | 3 | 0 | 22 | ~120h |
| Phase 4 – Kiosk API | Printer endpoints | ✅ Done | 14 | 5 | 0 | ~18h |
| Phase 5 – Admin Panel | Operations dashboard | ⚠️ Partial | 6 | 2 | 28 | ~180h |
| Phase 6 – Security & Tests | Tests, retention, audit | ❌ Todo | 0 | 0 | 20 | ~80h |
| **TOTAL** | | | **63** | **19** | **75** | **~430h** |

---

## 🏗️ Phase 1 — Core Foundation & Database

### ✅ Entities — Fully implemented

- [x] ✅ `groupSession.entity.ts` — hostId, groupName, deadline, sharedSettings, status (OPEN/CLOSED), batchToken
- [x] ✅ `printJob.entity.ts` — JOB_TYPE enum (single/personal_batch/group_batch), groupSessionId FK, watermarkId
- [x] ✅ `file.entity.ts` — printJobId FK, one-to-many from PrintJob → File
- [x] ✅ `adminRole.entity.ts` — name + permissions (json array)
- [x] ✅ `auditLog.entity.ts` — userId, userType, action, ipAddress, timestamp
- [x] ✅ `promotion.entity.ts` — FREE_PAGES / PERCENTAGE_DISCOUNT / FIXED_DISCOUNT, startDate, endDate, isActive

### ⚠️ Schema Gaps — Updates needed

- [ ] 🟠 **`file.entity.ts` — add `participantId` (uuid, nullable)**
  - Needed before Phase 3. Group uploads must be traceable to a specific participant.
  - `→ src/database/entities/file.entity.ts` · Est: 1h

- [ ] 🟠 **`file.entity.ts` — add `perFilePrintConfig` (json, nullable)**
  - Needed before Phase 2 per-file batch UI. Currently printConfig is only on PrintJob.
  - `→ src/database/entities/file.entity.ts` · Est: 1h

- [ ] 🟡 **`auditLog.entity.ts` — add `resourceType`, `resourceId`, `payload`**
  - Only logs userId + action. No context about what was changed.
  - `→ src/database/entities/auditLog.entity.ts` · Est: 1h

- [ ] 🟡 **`promotion.entity.ts` — add `promoCode` (varchar, unique) and `maxUsage` (int)**
  - No customer-facing coupon redemption possible without a code string.
  - `→ src/database/entities/promotion.entity.ts` · Est: 1h

- [ ] 🔴 **New: `pricingConfig.entity.ts`**
  - Pricing is hardcoded (₦5 B/W, ₦25 color). Needs DB table so shops can adjust per-page pricing without redeploy. Blocks admin panel pricing settings.
  - `→ src/database/entities/pricingConfig.entity.ts` · Est: 3h

- [ ] 🔴 **New: `kiosk.entity.ts`**
  - No kiosks table. Blocks kiosk API auth and admin kiosk management.
  - Fields: id, name, shopId, apiKey, lastSeenAt, status (ACTIVE/MAINTENANCE/OFFLINE)
  - `→ src/database/entities/kiosk.entity.ts` · Est: 2h

---

## 📱 Phase 2 — Customer App: Single & Batch Printing

### ✅ Done — Single print flow

- [x] ✅ 4-step print wizard (Upload → Options → Preview → Code) — `PrintFlow.tsx`
- [x] ✅ Dynamic price calculation — `useCalculatePriceMutation` on every option change
- [x] ✅ Cloudinary presigned upload — getPresignedUrl → direct upload → fileKey returned
- [x] ✅ Paystack payment integration — redirect flow + webhook handler
- [x] ✅ Wallet payment option with balance display
- [x] ✅ Print code display on step 4 — 6-char PIN shown
- [x] ✅ Personal batch — backend (JOB_TYPE.PERSONAL_BATCH, files array, cost aggregation)
- [x] ✅ Wallet funding page + walletApi RTK slice
- [x] ✅ Print history page — cancel, delete, status badges

### ⚠️ Partial / Needs completion

- [ ] 🔴 **QR code generation on print code screen**
  - Placeholder SVG only. No actual QR. Customers cannot scan at kiosk.
  - Install `qrcode.react`. Also generate base64 QR server-side for SMS/email receipts.
  - `→ src/pages/PrintFlow.tsx` · Est: 2h

- [ ] 🟠 **PreviewStep — actual PDF rendering**
  - `fileBase64` passed as empty string. File not rendered before payment.
  - Integrate `pdfjs-dist` or `react-pdf`. Load from Cloudinary URL. Show page thumbnails.
  - `→ src/components/PrintFlow/PreviewStep.tsx` · Est: 4h

- [ ] 🟠 **Inline wallet top-up during checkout**
  - Low-balance badge shown but no in-flow modal. User navigates away, losing all form state.
  - Build `WalletTopupModal`, trigger from badge, preserve Redux form state.
  - `→ src/components/PrintFlow/PaymentStep.tsx` · Est: 5h

- [ ] 🔴 **Pricing — move hardcoded ₦5/₦25 to DB**
  - `calculatePrice()` uses fixed values in service. Cannot change without redeploy.
  - Create `pricingConfig` entity (Phase 1). Add `GET /pricing/config`. Fetch on app load.
  - `→ src/modules/customer/services/printJob.service.ts` · Est: 3h

- [ ] 🟡 **Per-file settings in batch UI**
  - Uniform config applied across all batch files. No per-document overrides.
  - Requires `perFilePrintConfig` column on File (Phase 1).
  - `→ src/components/PrintFlow/BatchUploadStep.tsx` · Est: 8h

- [ ] 🟠 **Paystack webhook — idempotency guard**
  - No duplicate event check. Paystack retries could mark a payment complete multiple times.
  - Store processed `paymentReference` in DB. Skip re-processing on duplicates.
  - `→ src/modules/customer/controllers/webhook.controller.ts` · Est: 3h

- [ ] 🟡 **Frontend file type validation**
  - Backend validates correctly. Frontend drop zone accepts any file.
  - Add `accept=".pdf,.docx,.doc,.jpg,.png"` to input. Show friendly error for wrong types.
  - `→ src/components/PrintFlow/UploadStep.tsx` · Est: 2h

### ❌ Not started

- [ ] ⚪ **Stripe payment integration** — `src/modules/services/stripe.service.ts` · Est: 8h
- [ ] 🟠 **Email receipt after payment** — nodemailer/Resend, trigger from webhook · Est: 4h
- [ ] 🟡 **Push notifications (FCM)** — on job PAID / PRINTING / COMPLETE · Est: 6h

---

## 👥 Phase 3 — Customer App: Group Printing

> ⚠️ **This entire phase is unbuilt.** Schema is ready, services and UI do not exist.

### ❌ Backend — Group session API

- [ ] 🔴 **`POST /customer/group-sessions`** — host creates session (name, deadline, settings) · Est: 6h
- [ ] 🔴 **`POST /customer/group-sessions/:id/join`** — participant joins with upload token · Est: 4h
- [ ] 🔴 **`POST /customer/group-sessions/:id/upload`** — participant uploads, queues watermark job · Est: 6h
- [ ] 🟠 **`GET /customer/group-sessions/:id`** — host gets participant list + payment/upload status · Est: 4h
- [ ] 🔴 **`POST /customer/group-sessions/:id/close`** — generates batchToken, sets status CLOSED · Est: 5h
- [ ] 🟠 **Scheduled cron — auto-close expired sessions** — BullMQ repeatable job every 15 min · Est: 3h

### ❌ Backend — PDF watermarking

- [ ] 🟠 **PDF watermarking BullMQ worker**
  - Fetches PDF from Cloudinary, stamps watermarkId + participant name via `pdf-lib`, re-uploads.
  - Must be async (queue job, don't block request).
  - `→ src/workers/watermark.worker.ts` · Est: 8h

### ❌ Frontend — Host view

- [ ] 🟠 **`CreateGroupSession.tsx`** — form: group name, deadline, enforced settings, share link display · Est: 8h
- [ ] 🟠 **`GroupDashboard.tsx`** — real-time participant monitor (WebSocket), Close Group button · Est: 12h
- [ ] 🟠 **Batch token display screen** — QR + PIN after group closes, SMS share · Est: 4h

### ❌ Frontend — Participant view

- [ ] 🟠 **`/join/[sessionId]` dynamic route** — public page, group details, deadline countdown · Est: 5h
- [ ] 🟠 **`ParticipantUpload.tsx`** — upload, see enforced settings, see individual cost, pay · Est: 10h

### ❌ Kiosk — Group token support

- [ ] 🟠 **Kiosk validate-code — handle GROUP_BATCH tokens**
  - Update `get-job` to return `files[]` array (all participant watermarked URLs) when `jobType === GROUP_BATCH`
  - `→ src/modules/printer/services/printer.service.ts` · Est: 6h

---

## 🖨️ Phase 4 — Kiosk Integration API

### ✅ Done — All core endpoints

- [x] ✅ `POST /printer/validate-code` — checks code, payment, prints status
- [x] ✅ `POST /printer/get-job` — returns full job details (fileURL, printConfig, customerInfo)
- [x] ✅ `POST /printer/start` — marks job PROCESSING, records printerId
- [x] ✅ `POST /printer/complete` — marks COMPLETED, records cost + totalPages
- [x] ✅ `POST /printer/fail` — marks FAILED with reason
- [x] ✅ `GET /printer/ready-jobs` — returns up to 50 PENDING paid jobs
- [x] ✅ `GET /printer/status/:code` — lightweight status poll
- [x] ✅ Zod validation on all inputs

### ❌ Security & feature gaps

- [ ] 🔴 **Kiosk API key authentication**
  - All printer endpoints are **public**. Any caller can mark jobs complete.
  - Create kiosks table (Phase 1). Add `X-Kiosk-Key` header validation middleware on `/printer/*`.
  - `→ src/middleware/kioskAuth.middleware.ts` · Est: 4h

- [ ] 🟠 **Group batch token support in `get-job`**
  - Returns single `fileURL` only. Must return `files[]` for GROUP_BATCH tokens.
  - `→ src/modules/printer/services/printer.service.ts` · Est: 5h

- [ ] 🟡 **`PATCH /printer/progress` — incremental page status**
  - No partial resumption on hardware failure. Add `pagesCompleted` counter + new endpoint.
  - `→ src/modules/printer/routes/printer.routes.ts` · Est: 4h

- [ ] 🟠 **Server-side QR code generation at job creation**
  - Store `qrCodeUrl` on PrintJob. Return in both customer API and kiosk `get-job`.
  - Install `qrcode` npm package.
  - `→ src/modules/customer/services/printJob.service.ts` · Est: 3h

- [ ] 🟡 **Kiosk heartbeat endpoint**
  - `GET /printer/heartbeat` updates `kiosk.lastSeenAt`. Admin panel reads for online/offline.
  - `→ src/modules/printer/routes/printer.routes.ts` · Est: 2h

---

## ⚙️ Phase 5 — Admin Panel

### ✅ Done — Backend scaffold

- [x] ✅ Admin module folder structure (controllers, routes, services, repositories)
- [x] ✅ Admin auth endpoints (login/logout, JWT)
- [x] ✅ AdminRole + AdminProfile entities
- [x] ✅ Basic admin printJob CRUD (search/filter)

### ⚠️ Partial — Needs expansion

- [ ] 🔴 **AdminDashboardService — aggregate metrics**
  - Currently only returns `totalUsers + recentUsers`. Missing: revenue, pagesPrinted, activeSessions, onlineKiosks, revenueByDay (30d), jobsByStatus.
  - Use a single aggregate SQL query (SUM/COUNT/GROUP BY) not multiple service calls.
  - `→ src/modules/admin/services/dashboard.service.ts` · Est: 6h

### ❌ Backend — Missing endpoints

- [ ] 🟠 **Kiosk management** — `GET/PATCH /admin/kiosks` (list, set maintenance mode) · Est: 5h
- [ ] 🟡 **Group session viewer** — `GET /admin/group-sessions/:id` with participant list · Est: 4h
- [ ] 🔴 **Pricing config CRUD** — `GET/PATCH /admin/pricing` · Est: 4h
- [ ] 🟠 **Promotions CRUD** — full CRUD + `GET /admin/promotions/active` for customer app · Est: 5h
- [ ] 🟠 **AdminRoles CRUD** — create roles, assign permissions, assign to admins · Est: 5h
- [ ] 🟡 **AuditLog viewer** — `GET /admin/audit-logs` (paginated, filterable) · Est: 3h
- [ ] 🟠 **Refund endpoint** — calls Paystack /refund API, stores `refundId` · Est: 5h
- [ ] 🟠 **Requeue failed jobs** — `PATCH /admin/print-jobs/:id/requeue` · Est: 3h

### ❌ Frontend — Admin React app (0% built)

> Create as separate Vite project in `/admin` folder. Share types from API via shared package.

- [ ] 🔴 **Admin app scaffold** — Vite + React + RTK Query + auth guard + routing · Est: 8h
- [ ] 🟠 **`Overview.tsx`** — metrics cards + revenue chart (30d) + jobs-by-status donut · Est: 12h
- [ ] 🟠 **`KioskManagement.tsx`** — table of kiosks, online/offline, maintenance toggle · Est: 10h
- [ ] 🟠 **`JobViewer.tsx`** — search/filter, requeue, refund, export CSV · Est: 14h
- [ ] 🟡 **`GroupSessionViewer.tsx`** — session list + participant drill-down · Est: 8h
- [ ] 🟠 **`PricingConfig.tsx`** — inline editable price table + live preview calculator · Est: 8h
- [ ] 🟡 **`Promotions.tsx`** — create/edit/deactivate promotions, usage count · Est: 10h
- [ ] 🟡 **`AdminRoles.tsx`** — permission checkboxes, assign roles to admins · Est: 8h
- [ ] 🟡 **`AuditLog.tsx`** — read-only paginated log, filter by admin/action/date, CSV export · Est: 6h

---

## 🔒 Phase 6 — Privacy, Security & Testing

### ❌ File retention

- [ ] 🔴 **Auto-delete files 24h post-completion**
  - BullMQ job triggered on COMPLETE with 24h delay. Calls `cloudinary.uploader.destroy()`. Nullifies `fileURL` in DB.
  - `→ src/workers/fileCleanup.worker.ts` · Est: 3h

- [ ] 🟠 **NDPR / GDPR data retention policy**
  - Files: 24h post-print · PII: anonymise after 12 months · Audit logs: 2 years
  - Required for investor due diligence.
  - `→ PRIVACY_POLICY.md` · Est: 2h

### ❌ Security hardening

- [ ] 🔴 **Helmet.js HTTP security headers**
  - `npm install helmet` → `app.use(helmet())` — one line fix.
  - `→ src/app.ts` · Est: 1h

- [ ] 🔴 **Rate limiting on sensitive endpoints**
  - `/auth/login`: 5/min · `/validate-code`: 10/min · `/printer/*`: 100/min per key
  - Use `express-rate-limit` with Redis store.
  - `→ src/middleware/rateLimit.middleware.ts` · Est: 3h

- [ ] 🟠 **Brute-force protection on print codes**
  - 5 wrong guesses from same IP within 10 min → 429. Use Redis counter with TTL.
  - `→ src/modules/printer/services/printer.service.ts` · Est: 3h

- [ ] 🟠 **Group session access control audit**
  - Participant from session A should not be able to access session B data.
  - Enforce `sessionId + participantToken` validation on all participant endpoints.
  - Est: 3h

- [ ] 🟠 **SQL injection / input sanitisation audit**
  - Full audit of TypeORM query builder usage. Use parameterised queries exclusively.
  - Est: 4h

### ❌ Testing

- [ ] 🟠 **Jest unit test setup — API** · Est: 6h
  - No test files exist. Add Jest config, test utilities, DB mocking.

- [ ] 🟠 **Unit tests — `PrintJobService`**
  - createPrintJob (valid/invalid), calculatePrice (all combinations), code uniqueness
  - `→ src/modules/customer/services/printJob.service.spec.ts` · Est: 8h

- [ ] 🟠 **Unit tests — `PaymentService` + Paystack webhook**
  - createPaymentRequest, handleWebhook (success/duplicate/tampered), refund flow
  - `→ src/modules/services/payment.service.spec.ts` · Est: 6h

- [ ] 🟠 **Unit tests — `printer.service` (kiosk flow)**
  - validateCode, complete, fail, progress
  - `→ src/modules/printer/services/printer.service.spec.ts` · Est: 5h

- [ ] 🟡 **E2E test — full payment and code flow (Playwright)**
  - register → upload → configure → pay (Paystack test mode) → receive code → kiosk validate → complete
  - `→ e2e/printFlow.spec.ts` · Est: 12h

- [ ] 🟡 **Vitest unit tests — customer React app**
  - PrintFlow wizard state, price calculator, upload validation
  - Est: 8h

---

## 💡 Backlog & Suggestions

### 🚀 High impact quick wins

- [ ] ⚪ **Google OAuth login** — reduces signup friction, most users have Google · Est: 4h
- [ ] ⚪ **SMS print code delivery** (Termii / Africa's Talking) — many users miss email · Est: 3h
- [ ] ⚪ **WhatsApp file upload** — send file to PrintLoop WhatsApp bot, receive code · Est: High effort
- [ ] ⚪ **USSD payment** — Paystack USSD for users without internet/cards · Est: Medium effort

### 🛠️ Developer experience

- [ ] ⚪ **CI/CD — GitHub Actions** — auto-run tests + deploy on merge to main
- [ ] ⚪ **Docker Compose** for local MySQL + Redis + API dev environment
- [ ] ⚪ **Monorepo (Turborepo)** — share types between customer app, admin app, kiosk

### 📈 Growth features

- [ ] ⚪ **Referral programme** — ₦20 wallet credit per successful signup referral
- [ ] ⚪ **Customer analytics page** — total spent, pages printed, most common file type
- [ ] ⚪ **Shop owner mobile app** — monitor jobs, paper-out alerts, earnings view

### ⚡ Performance

- [ ] ⚪ **Redis caching for pricingConfig** — TTL 1h, read on every job creation
- [ ] ⚪ **Cloudinary CDN optimisation** — `f_auto,q_auto` on all delivery URLs

---

## 🗓️ Suggested Sprint Order

| Sprint | Focus | Key deliverables |
|---|---|---|
| Sprint 1 (now) | Security & schema | kiosk API key auth, Helmet, rate limiting, pricingConfig entity, QR code |
| Sprint 2 | Phase 2 polish | PDF preview, wallet top-up modal, email receipt, webhook idempotency |
| Sprint 3 | Phase 3 backend | GroupSession API, watermark worker, auto-close cron |
| Sprint 4 | Phase 3 frontend | CreateGroupSession, GroupDashboard, ParticipantUpload |
| Sprint 5 | Admin backend | Dashboard stats, pricing CRUD, promotions, refund, requeue |
| Sprint 6 | Admin frontend | Admin app scaffold, Overview, KioskManagement, JobViewer |
| Sprint 7 | Tests | Jest setup, unit tests for services, E2E Playwright |
| Sprint 8 | Phase 6 | File retention, NDPR policy, remaining security hardening |

---

*Generated from codebase analysis of `print-loop-api-main` and `print-loop-customers-main` — April 2026*
