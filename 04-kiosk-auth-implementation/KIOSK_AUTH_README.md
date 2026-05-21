# Kiosk API Key Authentication Implementation

## Overview
This implementation adds API key authentication to all printer/kiosk endpoints to prevent unauthorized access. Previously, anyone could call `/printer/complete` or other endpoints to manipulate jobs. Now, all kiosk endpoints require a valid `X-Kiosk-Key` header.

## Files Created

### Core Implementation
1. **`src/database/entities/kiosk.entity.ts`** - Kiosk entity with API key field
2. **`src/database/migrations/1714500000000-CreateKiosksTable.ts`** - Database migration
3. **`src/middleware/kioskAuth.middleware.ts`** - Authentication middleware
4. **`src/modules/printer/routes/printer.routes.ts`** - Updated routes with auth
5. **`src/modules/services/kiosk.service.ts`** - Kiosk management service
6. **`src/modules/admin/controllers/kiosk.controller.ts`** - Admin kiosk management
7. **`src/modules/admin/routes/kiosk.routes.ts`** - Admin routes
8. **`src/scripts/seedKiosks.ts`** - Seed script for dev/testing

## Installation Steps

### 1. Copy Files to Your Project

```bash
# Entity
cp kiosk.entity.ts src/database/entities/

# Migration
cp 1714500000000-CreateKiosksTable.ts src/database/migrations/

# Middleware
cp kioskAuth.middleware.ts src/middleware/

# Service
cp kiosk.service.ts src/modules/services/
# OR if you have a printer module:
cp kiosk.service.ts src/modules/printer/services/

# Admin controller
cp kiosk.controller.ts src/modules/admin/controllers/

# Admin routes
cp admin-kiosk.routes.ts src/modules/admin/routes/kiosk.routes.ts

# Seed script
cp seedKiosks.ts src/scripts/
```

### 2. Update Your Printer Routes

Replace your existing `src/modules/printer/routes/printer.routes.ts` with the new version, or manually add the middleware:

```typescript
import { kioskAuth } from '../../middleware/kioskAuth.middleware';

// Add kioskAuth to all routes
router.post('/validate-code', kioskAuth, validateCode);
router.post('/get-job', kioskAuth, getJob);
router.post('/start', kioskAuth, startPrintJob);
router.post('/complete', kioskAuth, completePrintJob);
router.post('/fail', kioskAuth, failPrintJob);
router.get('/ready-jobs', kioskAuth, getReadyJobs);
router.get('/status/:code', kioskAuth, getJobStatus);
```

### 3. Update Admin Routes Index

Add kiosk routes to your admin routes index:

```typescript
// src/modules/admin/routes/index.ts
import kioskRoutes from './kiosk.routes';

// ...
router.use('/kiosks', kioskRoutes);
```

### 4. Update Entities Index

Add kiosk entity to your entities barrel export:

```typescript
// src/database/entities/index.ts
export * from './kiosk.entity';
```

### 5. Run Database Migration

```bash
# Generate migration (if using TypeORM CLI)
npm run typeorm migration:run

# Or if you're manually running migrations
npm run migration:run
```

### 6. Seed Initial Kiosks

```bash
# Add script to package.json first
# "seed:kiosks": "ts-node src/scripts/seedKiosks.ts"

npm run seed:kiosks
```

**⚠️ IMPORTANT:** Save the API keys output by the seed script! You'll need them for testing.

## Usage

### For Kiosk Developers

All printer endpoint requests must now include the `X-Kiosk-Key` header:

```javascript
// Example: Validate code
const response = await fetch('http://localhost:3000/printer/validate-code', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Kiosk-Key': 'KSK_your_api_key_here'
  },
  body: JSON.stringify({
    code: 'AB1234'
  })
});
```

### Error Responses

**Missing API Key (401):**
```json
{
  "success": false,
  "message": "Authentication required. X-Kiosk-Key header missing.",
  "code": "KIOSK_AUTH_MISSING"
}
```

**Invalid API Key (401):**
```json
{
  "success": false,
  "message": "Invalid API key. Kiosk not found.",
  "code": "KIOSK_AUTH_INVALID"
}
```

**Kiosk Disabled (403):**
```json
{
  "success": false,
  "message": "Kiosk is disabled. Contact administrator.",
  "code": "KIOSK_DISABLED"
}
```

**Kiosk in Maintenance (503):**
```json
{
  "success": false,
  "message": "Kiosk is in maintenance mode. Please try another kiosk.",
  "code": "KIOSK_MAINTENANCE"
}
```

## Admin API Endpoints

### Create Kiosk
```http
POST /admin/kiosks
Content-Type: application/json

{
  "name": "Library Kiosk 1",
  "location": "Main Library - Ground Floor",
  "campus": "Main Campus",
  "shopId": "SHOP001",
  "printerName": "HP LaserJet Pro",
  "printerModel": "M428fdw",
  "ipAddress": "192.168.1.100"
}
```

Response includes the generated API key (only returned on creation):
```json
{
  "success": true,
  "message": "Kiosk created successfully",
  "data": {
    "kiosk": {
      "id": "uuid",
      "name": "Library Kiosk 1",
      "apiKey": "KSK_randombase64string",
      "status": "ACTIVE"
    }
  }
}
```

### List All Kiosks
```http
GET /admin/kiosks
GET /admin/kiosks?status=ACTIVE
GET /admin/kiosks?campus=Main%20Campus
```

### Get Single Kiosk
```http
GET /admin/kiosks/:id
```

### Update Kiosk Status
```http
PATCH /admin/kiosks/:id/status
Content-Type: application/json

{
  "status": "MAINTENANCE"
}
```

Status options: `ACTIVE`, `MAINTENANCE`, `OFFLINE`, `DISABLED`

### Update Kiosk Details
```http
PATCH /admin/kiosks/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "location": "New Location",
  "notes": "Moved to new building"
}
```

### Regenerate API Key
```http
POST /admin/kiosks/:id/regenerate-key
```

Use this if a key is compromised. Returns the new key in the response.

### Get Offline Kiosks
```http
GET /admin/kiosks/offline
GET /admin/kiosks/offline?minutes=30
```

Returns kiosks that haven't sent a heartbeat in X minutes (default: 15).

### Delete Kiosk
```http
DELETE /admin/kiosks/:id
```

Soft delete (sets status to DISABLED).

## Testing

### 1. Test Authentication Middleware

```bash
# Test missing API key (should return 401)
curl -X POST http://localhost:3000/printer/validate-code \
  -H "Content-Type: application/json" \
  -d '{"code":"AB1234"}'

# Test invalid API key (should return 401)
curl -X POST http://localhost:3000/printer/validate-code \
  -H "Content-Type: application/json" \
  -H "X-Kiosk-Key: invalid_key_here" \
  -d '{"code":"AB1234"}'

# Test valid API key (should proceed to validate code)
curl -X POST http://localhost:3000/printer/validate-code \
  -H "Content-Type: application/json" \
  -H "X-Kiosk-Key: KSK_your_real_key_from_seed" \
  -d '{"code":"AB1234"}'
```

### 2. Test Kiosk Status

Set a kiosk to maintenance mode and verify it returns 503:

```bash
# Set to maintenance
curl -X PATCH http://localhost:3000/admin/kiosks/{kiosk-id}/status \
  -H "Content-Type: application/json" \
  -d '{"status":"MAINTENANCE"}'

# Try to use it (should return 503)
curl -X POST http://localhost:3000/printer/validate-code \
  -H "X-Kiosk-Key: KSK_that_kiosk_key" \
  -d '{"code":"AB1234"}'
```

### 3. Test Last Seen Update

Make a request and check that `lastSeenAt` updates:

```bash
# Make request
curl -X POST http://localhost:3000/printer/validate-code \
  -H "X-Kiosk-Key: KSK_your_key" \
  -d '{"code":"AB1234"}'

# Check kiosk details
curl http://localhost:3000/admin/kiosks/{kiosk-id}
# lastSeenAt should be current timestamp
```

### 4. Test Print Job Completion Stats

Complete a print job and verify counters increment:

```bash
# Before: Check current stats
curl http://localhost:3000/admin/kiosks/{kiosk-id}
# Note totalJobsPrinted and totalPagesPrinted

# Complete a job
curl -X POST http://localhost:3000/printer/complete \
  -H "Content-Type: application/json" \
  -H "X-Kiosk-Key: KSK_your_key" \
  -d '{
    "jobNumber": "JOB123",
    "cost": 42,
    "totalPages": 12
  }'

# After: Check updated stats
curl http://localhost:3000/admin/kiosks/{kiosk-id}
# totalJobsPrinted should increment by 1
# totalPagesPrinted should increment by 12
```

## Security Best Practices

1. **Store API Keys Securely**
   - Never commit API keys to version control
   - Store in environment variables or secrets manager
   - Only show API key once (on creation)

2. **Rotate Keys Regularly**
   - Use the regenerate endpoint to rotate compromised keys
   - Implement key rotation schedule for high-security environments

3. **Monitor Kiosk Activity**
   - Use `lastSeenAt` to detect offline/compromised kiosks
   - Alert on unusual activity (too many failed attempts, etc.)

4. **Disable Unused Kiosks**
   - Set status to DISABLED rather than deleting
   - Maintain audit trail of kiosk history

## Electron Kiosk App Integration

Update your Electron kiosk app to include the API key:

```javascript
// In your Electron app config
const KIOSK_CONFIG = {
  apiKey: process.env.PRINTLOOP_KIOSK_KEY, // Load from .env
  apiUrl: 'http://localhost:3000'
};

// In your API client
async function validateCode(code) {
  const response = await fetch(`${KIOSK_CONFIG.apiUrl}/printer/validate-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Kiosk-Key': KIOSK_CONFIG.apiKey // Add this header
    },
    body: JSON.stringify({ code })
  });
  
  return response.json();
}
```

## Migration from Unauthenticated System

If you already have kiosks in production without auth:

1. **Deploy with Optional Auth First** (transition period):
   ```typescript
   // Temporarily use optionalKioskAuth instead of kioskAuth
   import { optionalKioskAuth } from '../../middleware/kioskAuth.middleware';
   router.post('/validate-code', optionalKioskAuth, validateCode);
   ```

2. **Create Kiosks and Distribute Keys**
   - Create kiosk entries for all existing devices
   - Update each device with its API key

3. **Switch to Required Auth**
   - After all devices updated, switch to `kioskAuth` middleware
   - Monitor logs for any devices still missing keys

## Troubleshooting

### Issue: Migration fails with "uuid_generate_v4 not found"

**Solution:** Enable UUID extension in PostgreSQL:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Issue: "Cannot find module 'crypto'"

**Solution:** `crypto` is built into Node.js, but if you see this error, ensure you're using Node.js 14+:
```bash
node --version
```

### Issue: Kiosk status not updating to OFFLINE

**Solution:** The `lastSeenAt` updates only when the kiosk makes requests. To mark kiosks as OFFLINE automatically, add a cron job that runs the `/admin/kiosks/offline` check and updates their status.

## Next Steps

1. **Add Admin Authentication**
   - Uncomment `adminAuth` middleware in admin routes
   - Implement RBAC for kiosk management

2. **Add Rate Limiting**
   - Limit failed authentication attempts
   - Prevent brute force attacks on API keys

3. **Add Heartbeat Endpoint**
   - Let kiosks ping `/printer/heartbeat` every 30s
   - Auto-mark kiosks as OFFLINE if no heartbeat for 5 minutes

4. **Add Monitoring Dashboard**
   - Build admin UI showing online/offline kiosks
   - Alert on kiosks that haven't been seen in X minutes

## Support

If you encounter issues during implementation, check:
1. Database connection is working
2. Migration ran successfully (`SELECT * FROM kiosks` returns empty table)
3. Kiosk entity is in TypeORM entities list
4. Middleware is imported correctly in routes

---

**Completion Time:** ~4 hours  
**Status:** ✅ Ready for integration  
**Priority:** 🔴 P0 - Critical (blocks launch)
