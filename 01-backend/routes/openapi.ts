import { Router, type Request, type Response } from 'express';

/**
 * OpenAPI 3.1 spec + docs page (V2-26).
 *
 * Hand-authored (not generated) and deliberately scoped to the
 * **integration surface** an external party would consume: tenant
 * sign-up + auth, the tenant-admin `/saas/*` API, the platform admin
 * API, plus the two inbound webhooks (Paystack, render-worker
 * callback). Internal kiosk/agent/CUPS endpoints are intentionally
 * omitted — they're appliance-to-server, not public API.
 *
 * Served at:
 *   GET /api/openapi.json  — the raw spec
 *   GET /api/docs          — Swagger UI (loads the spec above)
 */

const ok = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/SuccessEnvelope' },
    },
  },
});

const err = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorEnvelope' },
    },
  },
});

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'PrintLoop SaaS API',
    version: '2.0.0',
    description:
      'Multi-tenant self-service printing SaaS. Tenants sign up, ' +
      'configure pricing/branding/payouts, and earn from customer ' +
      'prints; PrintLoop takes a per-transaction commission via ' +
      'Paystack Split. This spec covers the public + tenant-admin + ' +
      'platform-admin integration surface.',
  },
  servers: [
    { url: 'https://api.printloop.app/api', description: 'production' },
    { url: 'http://localhost:4000/api', description: 'local' },
  ],
  tags: [
    { name: 'Onboarding', description: 'Anonymous tenant sign-up + verification' },
    { name: 'Auth', description: 'Customer + admin login (2FA-aware)' },
    { name: 'Tenant', description: 'Tenant-admin self-service (/saas/me/*)' },
    { name: 'Payouts', description: 'Balance + payouts (Dimension 15)' },
    { name: 'Platform', description: 'PrintLoop operator console (SUPER_ADMIN)' },
    { name: 'Webhooks', description: 'Inbound: Paystack + render-worker' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      tenantSlug: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Tenant-Slug',
        description: 'Resolves the tenant for API clients off-subdomain.',
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: 'object',
        properties: { success: { type: 'boolean', enum: [true] }, data: {} },
        required: ['success'],
      },
      ErrorEnvelope: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [false] },
          message: { type: 'string' },
          code: { type: 'string', description: 'Stable machine code, e.g. TOTP_REQUIRED' },
        },
        required: ['success', 'message'],
      },
      SignupRequest: {
        type: 'object',
        required: [
          'businessName', 'slug', 'ownerFirstName', 'ownerLastName',
          'ownerEmail', 'ownerPhone', 'ownerPassword',
        ],
        properties: {
          businessName: { type: 'string' },
          slug: { type: 'string', pattern: '^[a-z][a-z0-9-]{1,28}[a-z0-9]$' },
          ownerFirstName: { type: 'string' },
          ownerLastName: { type: 'string' },
          ownerEmail: { type: 'string', format: 'email' },
          ownerPhone: { type: 'string' },
          ownerPassword: { type: 'string', minLength: 10 },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
          totpCode: {
            type: 'string',
            description: 'Required when the account has 2FA enabled (else 401 TOTP_REQUIRED).',
          },
        },
      },
    },
  },
  paths: {
    '/saas/signup': {
      post: {
        tags: ['Onboarding'],
        summary: 'Create a tenant + owner',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SignupRequest' },
            },
          },
        },
        responses: {
          '201': ok('Tenant + owner created; returns loginUrl.'),
          '400': err('Validation error'),
          '409': err('Slug taken / email in use'),
        },
      },
    },
    '/saas/check-slug': {
      post: {
        tags: ['Onboarding'],
        summary: 'Live slug availability',
        responses: { '200': ok('{ available: boolean }') },
      },
    },
    '/saas/verify-email': {
      post: {
        tags: ['Onboarding'],
        summary: 'Verify owner email with the 6-digit token',
        responses: { '200': ok('{ verified, tenantSlug }'), '400': err('Bad token') },
      },
    },
    '/customer/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Customer login (2FA-aware)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': ok('{ user, tokens.accessToken }'),
          '401': err('Bad credentials, or TOTP_REQUIRED / TOTP_INVALID'),
        },
      },
    },
    '/admin/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Admin / platform login (2FA-aware)',
        responses: { '200': ok('{ user, tokens }'), '401': err('Bad credentials / TOTP'), '403': err('Not an admin') },
      },
    },
    '/saas/me': {
      get: {
        tags: ['Tenant'],
        summary: 'Resolved tenant config + onboarding checklist',
        security: [{ bearerAuth: [], tenantSlug: [] }],
        responses: { '200': ok('Tenant config'), '403': err('Not a member / suspended') },
      },
      delete: {
        tags: ['Tenant'],
        summary: 'Close tenant (confirmSlug required)',
        security: [{ bearerAuth: [], tenantSlug: [] }],
        responses: { '200': ok('Closed'), '400': err('CONFIRM_SLUG_MISMATCH') },
      },
    },
    '/saas/balance': {
      get: {
        tags: ['Payouts'],
        summary: 'Available + pending balance + lifetime commission',
        security: [{ bearerAuth: [], tenantSlug: [] }],
        responses: { '200': ok('Balance') },
      },
    },
    '/saas/payouts': {
      get: {
        tags: ['Payouts'],
        summary: 'Paginated payout history',
        security: [{ bearerAuth: [], tenantSlug: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': ok('{ items, nextCursor }') },
      },
    },
    '/saas/payouts/instant': {
      post: {
        tags: ['Payouts'],
        summary: 'Instant payout (₦100 fee)',
        security: [{ bearerAuth: [], tenantSlug: [] }],
        responses: { '201': ok('Payout row'), '402': err('Insufficient balance'), '409': err('No bank account') },
      },
    },
    '/saas/transactions': {
      get: {
        tags: ['Tenant'],
        summary: 'Paginated commission-bearing transactions',
        security: [{ bearerAuth: [], tenantSlug: [] }],
        responses: { '200': ok('{ items, nextCursor }') },
      },
    },
    '/saas/me/statement': {
      get: {
        tags: ['Tenant'],
        summary: 'Month-end statement (CSV)',
        security: [{ bearerAuth: [], tenantSlug: [] }],
        parameters: [{ name: 'month', in: 'query', schema: { type: 'string', example: '2026-05' } }],
        responses: { '200': { description: 'text/csv attachment', content: { 'text/csv': {} } } },
      },
    },
    '/saas/me/branding': {
      get: {
        tags: ['Tenant'], summary: 'Read branding',
        security: [{ bearerAuth: [], tenantSlug: [] }],
        responses: { '200': ok('Branding row') },
      },
      put: {
        tags: ['Tenant'], summary: 'Update branding (verified email required)',
        security: [{ bearerAuth: [], tenantSlug: [] }],
        responses: { '200': ok('Saved'), '400': err('Bad colour/URL'), '403': err('EMAIL_NOT_VERIFIED') },
      },
    },
    '/saas/me/domains': {
      get: { tags: ['Tenant'], summary: 'List domain claims', security: [{ bearerAuth: [], tenantSlug: [] }], responses: { '200': ok('Domains') } },
      post: { tags: ['Tenant'], summary: 'Claim a domain (returns TXT+CNAME)', security: [{ bearerAuth: [], tenantSlug: [] }], responses: { '201': ok('DNS records to publish'), '409': err('DOMAIN_TAKEN') } },
    },
    '/saas/me/domains/{id}/verify': {
      post: { tags: ['Tenant'], summary: 'Verify domain via DNS TXT', security: [{ bearerAuth: [], tenantSlug: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': ok('Verified'), '422': err('DOMAIN_NOT_VERIFIED') } },
    },
    '/saas/me/webhooks': {
      get: { tags: ['Tenant'], summary: 'List webhooks (secret masked)', security: [{ bearerAuth: [], tenantSlug: [] }], responses: { '200': ok('Webhooks') } },
      post: { tags: ['Tenant'], summary: 'Create webhook (secret shown once)', security: [{ bearerAuth: [], tenantSlug: [] }], responses: { '201': ok('Webhook + secret') } },
    },
    '/saas/me/2fa/setup': {
      post: { tags: ['Auth'], summary: 'Begin 2FA enrolment', security: [{ bearerAuth: [] }], responses: { '200': ok('{ secret, otpauthUrl }'), '409': err('TOTP_ALREADY_ENABLED') } },
    },
    '/saas/me/2fa/enable': {
      post: { tags: ['Auth'], summary: 'Confirm 2FA with a live code', security: [{ bearerAuth: [] }], responses: { '200': ok('{ enabled: true }'), '422': err('TOTP_INVALID') } },
    },
    '/saas/me/export': {
      post: { tags: ['Tenant'], summary: 'Export all tenant data (JSON)', security: [{ bearerAuth: [], tenantSlug: [] }], responses: { '200': { description: 'JSON attachment', content: { 'application/json': {} } } } },
    },
    '/platform/tenants': {
      get: { tags: ['Platform'], summary: 'List all tenants (SUPER_ADMIN)', security: [{ bearerAuth: [] }], responses: { '200': ok('{ items, nextCursor }'), '403': err('NOT_PLATFORM_ADMIN') } },
    },
    '/platform/tenants/{id}/suspend': {
      post: { tags: ['Platform'], summary: 'Suspend a tenant', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': ok('Suspended') } },
    },
    '/platform/tenants/{id}/impersonate': {
      post: { tags: ['Platform'], summary: 'Mint a short-lived impersonation token', security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'ttl', in: 'query', schema: { type: 'integer' } }], responses: { '200': ok('{ token, ttlSeconds, tenant }') } },
    },
    '/payments/webhook': {
      post: { tags: ['Webhooks'], summary: 'Paystack webhook (HMAC-SHA512 verified)', responses: { '200': ok('Handled'), '401': err('Bad signature') } },
    },
    '/render/callback': {
      post: { tags: ['Webhooks'], summary: 'Render-worker callback (HMAC-SHA256)', responses: { '200': ok('Status flipped'), '401': err('Bad signature') } },
    },
  },
} as const;

const router = Router();

router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

router.get('/docs', (_req: Request, res: Response) => {
  // Swagger UI from CDN, pointed at our spec. Docs page only — no
  // app data, so the CDN dependency is acceptable here.
  res.type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PrintLoop API — docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#ui',
      });
    </script>
  </body>
</html>`);
});

export default router;
