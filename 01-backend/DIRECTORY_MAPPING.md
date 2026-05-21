# PrintLoop — Quick Reference: File Placement

This is a copy-paste cheat sheet for placing every file in the right directory.

---

## Backend → `print-loop-api-main/`

### Quick install: copy everything in one go

```bash
PKG=/path/to/printloop-backend       # extracted backend package
API=/path/to/print-loop-api-main     # your API project root

# === Database entities ===
cp $PKG/entities/kiosk.entity.ts            $API/src/database/entities/
cp $PKG/entities/pricingConfig.entity.ts    $API/src/database/entities/
cp $PKG/entities/systemSetting.entity.ts    $API/src/database/entities/
cp $PKG/entities/groupParticipant.entity.ts $API/src/database/entities/

# === Migrations ===
cp $PKG/migrations/*.ts $API/src/database/migrations/

# === Middleware ===
cp $PKG/middleware/*.ts $API/src/middleware/

# === Services (split by module) ===
mkdir -p $API/src/modules/services
cp $PKG/services/pricing.service.ts $API/src/modules/services/
cp $PKG/services/qrCode.service.ts  $API/src/modules/services/
cp $PKG/services/email.service.ts   $API/src/modules/services/
cp $PKG/services/sms.service.ts     $API/src/modules/services/

mkdir -p $API/src/modules/printer/services
cp $PKG/services/kiosk.service.ts             $API/src/modules/printer/services/
cp $PKG/services/printerExtensions.service.ts $API/src/modules/printer/services/

mkdir -p $API/src/modules/customer/services
cp $PKG/services/groupSession.service.ts $API/src/modules/customer/services/

mkdir -p $API/src/modules/admin/services
cp $PKG/services/adminDashboard.service.ts $API/src/modules/admin/services/
cp $PKG/services/refund.service.ts         $API/src/modules/admin/services/

# === Controllers ===
mkdir -p $API/src/modules/admin/controllers
cp $PKG/controllers/kiosk.controller.ts $API/src/modules/admin/controllers/

mkdir -p $API/src/modules/customer/controllers
cp $PKG/controllers/groupSession.controller.ts $API/src/modules/customer/controllers/

mkdir -p $API/src/modules/printer/controllers
cp $PKG/controllers/printerExtensions.controller.ts $API/src/modules/printer/controllers/

# === Routes ===
mkdir -p $API/src/modules/admin/routes
cp $PKG/routes/admin-kiosk.routes.ts $API/src/modules/admin/routes/kiosk.routes.ts
cp $PKG/routes/admin.routes.ts       $API/src/modules/admin/routes/index.ts

mkdir -p $API/src/modules/customer/routes
cp $PKG/routes/groupSession.routes.ts      $API/src/modules/customer/routes/
cp $PKG/routes/participantUpload.routes.ts $API/src/modules/customer/routes/

# === Workers (NEW folder) ===
mkdir -p $API/src/workers
cp $PKG/workers/*.ts $API/src/workers/

# === Config / scripts / entry points ===
cp $PKG/config/redis.ts        $API/src/config/
mkdir -p $API/src/scripts
cp $PKG/scripts/seedKiosks.ts  $API/src/scripts/
cp $PKG/app.ts                 $API/src/app.ts        # REPLACES existing
cp $PKG/server.ts              $API/src/server.ts     # REPLACES existing
cp $PKG/.env.example           $API/.env.example
```

### File-by-file table

| Source File (in package) | Destination Path |
|--------------------------|------------------|
| `entities/kiosk.entity.ts` | `src/database/entities/kiosk.entity.ts` |
| `entities/pricingConfig.entity.ts` | `src/database/entities/pricingConfig.entity.ts` |
| `entities/systemSetting.entity.ts` | `src/database/entities/systemSetting.entity.ts` |
| `entities/groupParticipant.entity.ts` | `src/database/entities/groupParticipant.entity.ts` |
| `migrations/1714500000000-CreateKiosksTable.ts` | `src/database/migrations/1714500000000-CreateKiosksTable.ts` |
| `migrations/1714600000000-AddSchemaGapsAndNewEntities.ts` | `src/database/migrations/1714600000000-AddSchemaGapsAndNewEntities.ts` |
| `middleware/kioskAuth.middleware.ts` | `src/middleware/kioskAuth.middleware.ts` |
| `middleware/rbac.middleware.ts` | `src/middleware/rbac.middleware.ts` |
| `middleware/idempotency.middleware.ts` | `src/middleware/idempotency.middleware.ts` |
| `middleware/rateLimit.middleware.ts` | `src/middleware/rateLimit.middleware.ts` |
| `middleware/bruteForce.middleware.ts` | `src/middleware/bruteForce.middleware.ts` |
| `services/pricing.service.ts` | `src/modules/services/pricing.service.ts` |
| `services/qrCode.service.ts` | `src/modules/services/qrCode.service.ts` |
| `services/email.service.ts` | `src/modules/services/email.service.ts` |
| `services/sms.service.ts` | `src/modules/services/sms.service.ts` |
| `services/kiosk.service.ts` | `src/modules/printer/services/kiosk.service.ts` |
| `services/printerExtensions.service.ts` | `src/modules/printer/services/printerExtensions.service.ts` |
| `services/groupSession.service.ts` | `src/modules/customer/services/groupSession.service.ts` |
| `services/adminDashboard.service.ts` | `src/modules/admin/services/adminDashboard.service.ts` |
| `services/refund.service.ts` | `src/modules/admin/services/refund.service.ts` |
| `controllers/kiosk.controller.ts` | `src/modules/admin/controllers/kiosk.controller.ts` |
| `controllers/groupSession.controller.ts` | `src/modules/customer/controllers/groupSession.controller.ts` |
| `controllers/printerExtensions.controller.ts` | `src/modules/printer/controllers/printerExtensions.controller.ts` |
| `routes/admin-kiosk.routes.ts` | `src/modules/admin/routes/kiosk.routes.ts` |
| `routes/admin.routes.ts` | `src/modules/admin/routes/index.ts` |
| `routes/groupSession.routes.ts` | `src/modules/customer/routes/groupSession.routes.ts` |
| `routes/participantUpload.routes.ts` | `src/modules/customer/routes/participantUpload.routes.ts` |
| `workers/queues.ts` | `src/workers/queues.ts` |
| `workers/watermark.worker.ts` | `src/workers/watermark.worker.ts` |
| `workers/fileCleanup.worker.ts` | `src/workers/fileCleanup.worker.ts` |
| `workers/scheduled.worker.ts` | `src/workers/scheduled.worker.ts` |
| `config/redis.ts` | `src/config/redis.ts` |
| `scripts/seedKiosks.ts` | `src/scripts/seedKiosks.ts` |
| `app.ts` | `src/app.ts` *(REPLACES existing)* |
| `server.ts` | `src/server.ts` *(REPLACES existing)* |
| `.env.example` | `.env.example` *(project root)* |

---

## Frontend → `print-loop-customers-main/`

```bash
PKG=/path/to/printloop-frontend
WEB=/path/to/print-loop-customers-main

cp $PKG/components/print/DocumentPreview.tsx $WEB/src/components/print/
cp $PKG/components/print/PreviewStep.tsx     $WEB/src/components/print/   # REPLACES
cp $PKG/utils/fileTypes.ts                   $WEB/src/utils/

cd $WEB && npm install @iamjariwala/react-doc-viewer
```

### Frontend file mapping

| Source File | Destination Path |
|-------------|------------------|
| `components/print/DocumentPreview.tsx` | `src/components/print/DocumentPreview.tsx` |
| `components/print/PreviewStep.tsx` | `src/components/print/PreviewStep.tsx` *(REPLACES)* |
| `utils/fileTypes.ts` | `src/utils/fileTypes.ts` |

### Don't forget

**Update `src/components/print/index.ts`:**

```typescript
export { default as DocumentPreview } from './DocumentPreview';
```

**Update `src/pages/PrintFlow.tsx`** where you render `<PreviewStep />`:

```tsx
<PreviewStep
  fileName={uploadedFile.file.name}
  fileBase64={fileBase64}
  fileType={uploadedFile.type}
  file={uploadedFile.file}              // ADD
  currentPage={currentPage}
  pageCount={uploadedFile.pageCount}
  zoom={zoom}
  paperSize={printOptions.paperSize}
  orientation={printOptions.orientation}
  colorType={printOptions.colorType}    // ADD
  duplex={printOptions.duplex}          // ADD
  copies={printOptions.copies}          // ADD
  onZoomIn={...}
  onZoomOut={...}
  onPreviousPage={...}
  onNextPage={...}
/>
```

---

## NPM Dependencies

### Backend
```bash
cd print-loop-api-main

npm install helmet cors compression morgan \
  express-rate-limit rate-limit-redis redis \
  bullmq qrcode nodemailer axios pdf-lib nanoid

npm install -D @types/qrcode @types/nodemailer @types/morgan @types/cors @types/compression
```

### Frontend
```bash
cd print-loop-customers-main
npm install @iamjariwala/react-doc-viewer
```

---

## Run order

```bash
# 1. Backend: configure .env then run migrations
cd print-loop-api-main
cp .env.example .env   # edit .env to fill in real values
npm run typeorm migration:run

# 2. Seed initial kiosks (SAVE THE API KEYS!)
npm run seed:kiosks

# 3. Start Redis
docker run -d -p 6379:6379 --name printloop-redis redis:7-alpine

# 4. Start backend
npm run dev

# 5. Start frontend
cd ../print-loop-customers-main
npm run dev
```

---

## Verifying it works

```bash
# Backend health check
curl http://localhost:3000/health

# Kiosk auth test (use real API key from seedKiosks output)
curl -X POST http://localhost:3000/printer/validate-code \
  -H "X-Kiosk-Key: KSK_..." \
  -H "Content-Type: application/json" \
  -d '{"code":"AB1234"}'

# Frontend: visit http://localhost:5173 → upload a PDF/DOCX/image
# At Preview step you should see the document rendered inline.
# Toggle B&W to see grayscale effect.
```
