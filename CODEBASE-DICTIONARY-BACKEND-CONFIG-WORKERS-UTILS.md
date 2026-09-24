# 6 · BACKEND — CONFIG / WORKERS / UTILS

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

01-backend/config/seed.ts (already covered) — no separate file beyond above.

## workers

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
