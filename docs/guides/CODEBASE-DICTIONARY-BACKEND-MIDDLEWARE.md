# 3 · BACKEND — MIDDLEWARE

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

01-backend/middleware/auth.middleware.ts  (optionalAuth side note)
  role — soft auth for endpoints that work for both guests and signed-in users
  details — used where a request may or may not carry a token; if present and valid,
    attaches user + memberships but never 401s.
