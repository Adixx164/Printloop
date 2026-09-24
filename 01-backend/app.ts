import "reflect-metadata";
import express, { type Application } from "express";
import cors from "cors";
import devApiRoutes from "./routes/devApi.routes.js";
import adminAuthRoutes from "./routes/adminAuth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminKioskRoutes from "./routes/admin-kiosk.routes.js";
import spikeRoutes from "./routes/spike.routes.js";
import groupSessionRoutes from "./routes/groupSession.routes.js";
import participantUploadRoutes from "./routes/participantUpload.routes.js";
import printerRoutes from "./routes/printer.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import paymentsRoutes from "./routes/payments.routes.js";
import customerAuthRoutes from "./routes/customerAuth.routes.js";
import customerPrintRoutes from "./routes/customerPrint.routes.js";
import cupsRoutes from "./routes/cups.routes.js";
import publicPricingRoutes from "./routes/publicPricing.routes.js";
import saasRoutes from "./routes/saas.routes.js";
import renderRoutes from "./routes/render.routes.js";
import platformRoutes from "./routes/platform.routes.js";
import publicBrandingRoutes from "./routes/publicBranding.routes.js";
import openApiRoutes from "./routes/openapi.js";
import discoveryRoutes from "./routes/discovery.routes.js";
import integrationsRoutes from "./routes/integrations.routes.js";
import passwordResetRoutes from "./routes/passwordReset.routes.js";
import disputeRoutes from "./routes/dispute.routes.js";
import blogRoutes from "./routes/blog.routes.js";
import legalRoutes from "./routes/legal.routes.js";
import preflightRoutes from "./routes/preflight.routes.js";
import { paystackService } from "./services/paystack.service.js";
import { authenticate } from "./middleware/auth.middleware.js";
import { resolveTenant, optionalTenant } from "./middleware/tenant.middleware.js";
import { requestContext } from "./middleware/requestContext.middleware.js";
import {
  loginLimiter,
  signupLimiter,
  otpLimiter,
  passwordResetLimiter,
} from "./middleware/rateLimit.middleware.js";
import { UPLOAD_DIR } from "./utils/fileStore.js";
import filesRoutes from "./routes/files.routes.js";

export function createApp(): Application {
  const app = express();

  // Request context FIRST — every downstream handler gets req.log +
  // req.requestId, and we emit one structured access line per request
  // on finish. Mounted before CORS so even rejected-preflight requests
  // are traceable.
  app.use(requestContext);

  // Appliance endpoints (kiosk panel, participant-upload device) are
  // separate installs on their own origin and authenticate with a header
  // key — not cookies — so origin reflection is safe here. Mounted BEFORE
  // the strict global CORS so their preflights are handled permissively.
  const applianceCors = cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Kiosk-Key", "X-Upload-Token", "Authorization"],
  });
  app.use("/api/printer", applianceCors);
  app.use("/api/agent", applianceCors);
  app.use("/api/participant-upload", applianceCors);

  app.use(
    cors({
      origin: (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(","),
      credentials: true,
    }),
  );

  // Capture the raw JSON body alongside the parsed copy. The Paystack
  // webhook signs raw bytes (HMAC-SHA512) — re-serialising the parsed
  // object would change the bytes and break verification.
  app.use(
    express.json({
      limit: "10mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "1.0.0",
    });
  });

  // ── API docs (OpenAPI 3.1) — anonymous, no tenant context ──────────────
  // GET /api/openapi.json (spec) + GET /api/docs (Swagger UI).
  app.use("/api", openApiRoutes);

  // ── Marketplace discovery (V2-30) — anonymous, cross-tenant ────────────
  // Customers browsing /find to choose a print shop. Mounted BEFORE
  // the tenant-resolution middleware: these routes never read
  // req.tenant; they return only the public projection of a tenant.
  app.use("/api/discovery", discoveryRoutes);

  // ── External integrations (V2-44) — anonymous, cross-tenant ────────────
  // Campus LMS trusted-link handoff. Same mounting rationale as
  // discovery: the LMS calls in with no PrintLoop session.
  app.use("/api/integrations", integrationsRoutes);

  // ── Rate limiting on auth surfaces (V2-28) ─────────────────────────────
  //
  // Path-prefix limiters mounted BEFORE their routers — Express runs
  // them first and lets through to the router only if the request is
  // under the per-(tenant, IP) quota.
  //
  // Each limiter no-ops when DISABLE_RATE_LIMIT=1 (test escape hatch)
  // or when REDIS_ENABLED is false (graceful degrade for dev without
  // Redis). Production sets REDIS_URL and leaves the disable unset
  // → full enforcement.
  //
  //   loginLimiter         5 / min   /api/{customer,admin}/auth/login
  //   signupLimiter       10 / hour  /api/saas/signup + customer register
  //   otpLimiter          10 / hour  /api/saas/verify-email + resend
  //   passwordResetLimiter 5 / hour  /api/auth/forgot-password + reset
  app.use("/api/customer/auth/login", loginLimiter);
  app.use("/api/customer/auth/register", signupLimiter);
  app.use("/api/admin/auth/login", loginLimiter);
  app.use("/api/saas/signup", signupLimiter);
  app.use("/api/saas/verify-email", otpLimiter);
  app.use("/api/saas/resend-verification", otpLimiter);
  app.use("/api/auth/forgot-password", passwordResetLimiter);
  app.use("/api/auth/reset-password", passwordResetLimiter);

  // ── Password reset (V2-29) — anonymous, optional tenant resolution ─────
  // Mounted at /api/auth so the frontend's existing forgot/reset
  // mutations work without change. Mounted HERE — before the catch-all
  // /api devApi mock at the bottom of this file — so the real routes
  // win the path match and the (security-broken) mock is shadowed.
  app.use("/api/auth", optionalTenant, passwordResetRoutes);

  // ── Tenant resolution policy (Phase A — Dimension 2) ───────────────────
  //
  // resolveTenant attaches req.tenant from JWT → subdomain → custom domain
  // → X-Tenant-Slug header → legacy fallback. It's required on every
  // route that reads/writes tenant-scoped data.
  //
  // optionalTenant attaches req.tenant when possible but never blocks —
  // for routes that legitimately serve multiple tenants OR no tenant
  // (marketing/sign-up, platform admin, webhooks).
  //
  // The routes mounted in this file fall into three buckets:
  //
  //   (a) tenant-required: customer-facing routes, admin routes, kiosk
  //       routes. Wrap with resolveTenant after auth.
  //
  //   (b) cross-tenant / no-tenant: /api/payments/webhook (Paystack POSTs
  //       it with no host context), /api/files (static), /health.
  //       Use optionalTenant or skip entirely.
  //
  //   (c) onboarding / public: sign-up, login, public pricing landing.
  //       Use optionalTenant so they can also serve a per-tenant variant
  //       when the host is a tenant subdomain.

  // ── SaaS onboarding (Dimension 5) ──────────────────────────────────────
  // /signup is anonymous and cross-tenant. /setup/* require auth + a
  // resolved tenant; both are enforced inside the router so the mount
  // here stays cross-tenant.
  app.use("/api/saas", saasRoutes);

  // ── Render-worker callback (Phase A — cloud render → kiosk spool) ──────
  // Cross-tenant: the render-worker is a platform-level service.
  // HMAC-signed against RENDER_CALLBACK_SECRET. No JWT, no tenant
  // middleware — the worker doesn't know which tenant a job belongs
  // to (the printJobId carries that linkage).
  app.use("/api/render", renderRoutes);

  // ── Platform admin console (Dimension 11) ──────────────────────────────
  // Cross-tenant by definition; SUPER_ADMIN only. Mounted without
  // resolveTenant so a platform admin can list/suspend any tenant
  // without spoofing a Host header.
  app.use("/api/platform", platformRoutes);

  // ── Real TypeORM-backed admin API (new REST contract) ──────────────────
  // Order matters: auth (public login) → kiosks → generic admin → dev mock.
  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin/kiosks", authenticate, resolveTenant, adminKioskRoutes);
  app.use("/api/admin/disputes", disputeRoutes);
  // Option A render spike (docs/OPENPRINTING-INTEGRATION.md) — super-admin
  // only, and only mounted when explicitly enabled, so it is invisible in
  // production. Must precede the generic /api/admin router below.
  if (process.env.ENABLE_SPIKE_RENDER === "1") {
    app.use("/api/admin/spike", authenticate, resolveTenant, spikeRoutes);
  }
  app.use("/api/admin", authenticate, resolveTenant, adminRoutes);

  // ── Real TypeORM-backed feature APIs (distinct prefixes; the legacy
  //    customer mock keeps its own /api/group-sessions etc.) ─────────────
  app.use("/api/groups", resolveTenant, groupSessionRoutes);
  app.use("/api/participant-upload", resolveTenant, participantUploadRoutes);
  app.use("/api/printer", resolveTenant, printerRoutes);
  // Kiosk-pull agent API: on-site agent polls for RELEASING jobs, fetches
  // bytes via signed URLs, dispatches to LAN printer, reports back. Auth
  // is the same X-Kiosk-Key header the kiosk uses for /api/printer.
  app.use("/api/agent", resolveTenant, agentRoutes);
  // Payments: /webhook is hit by Paystack with no tenant context; tenant
  // is derived from the metadata.tenantId we stamp on initialize. The
  // /initialize route resolves a tenant. Splitting into two mounts keeps
  // the policy precise.
  app.use("/api/payments", optionalTenant, paymentsRoutes);

  // Alias for Paystack webhook configured at /api/webhooks/paystack
  // (routes to the same handler as /api/payments/webhook)
  app.post("/api/webhooks/paystack", optionalTenant, async (req, res) => {
    try {
      const signature = req.header('x-paystack-signature');
      const rawBody: Buffer | undefined = (req as any).rawBody;
      if (!rawBody) {
        res.status(400).json({ success: false, message: 'Raw body unavailable' });
        return;
      }
      if (!paystackService.verifyWebhookSignature(rawBody, signature)) {
        res.status(401).json({ success: false, message: 'Invalid signature' });
        return;
      }
      const result = await paystackService.handleWebhook(req.body);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Payment webhook error:', error);
      res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
  });

  // Public pricing matrix — readable by anonymous flows (group-participant
  // upload, landing page). Same data the admin sets and the customer app
  // sees, just without JWT requirement. Per-tenant when the host resolves.
  app.use("/api/pricing", optionalTenant, publicPricingRoutes);

  // Public branding (Dimension 7) — anonymous, tenant-resolved by host.
  // Powers the BrandProvider's first-paint colour/wordmark/favicon swap.
  app.use("/api/branding", optionalTenant, publicBrandingRoutes);

  // Legal / compliance documents (DPA, Terms, Privacy) — anonymous, public.
  app.use("/api/legal", legalRoutes);

  // Preflight analysis — anonymous, tenant-resolved by host.
  app.use("/api/preflight", optionalTenant, preflightRoutes);

  // Public marketing blog (V2-54) — published posts only, no auth.
  app.use("/api/blog", blogRoutes);

  // ── "PrintLoop as a network printer" — CUPS ingress (token-auth, no JWT).
  //    A laptop adds PrintLoop as a CUPS printer; that backend POSTs here.
  app.use("/api/cups", resolveTenant, cupsRoutes);

  // ── Real TypeORM-backed customer API (auth + real print jobs) ──────────
  app.use("/api/customer/auth", optionalTenant, customerAuthRoutes);
  app.use("/api/customer", authenticate, resolveTenant, customerPrintRoutes);

  // Uploaded documents — fetchable by the kiosk/IPP service (public, no auth)
  app.use("/api/files", filesRoutes);

  // ── Remaining customer mock API (stations/options; JWT-bridged) ────────
  app.use("/api", optionalTenant, devApiRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Endpoint not found" });
  });

  app.use(async (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // Map multer errors to proper 4xx instead of leaking 500s.
    if (err && err.name === "MulterError") {
      const code = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(code).json({
        success: false,
        message: err.code === "LIMIT_FILE_SIZE" ? "File too large." : `Upload rejected: ${err.message}`,
        code: err.code,
      });
      return;
    }
    console.error("Unhandled error:", err);
    // V2-34: surface to Sentry when configured. No-op otherwise.
    try {
      // Lazy import so the bundle stays slim if Sentry is unused.
      const { reportError } = await import("./utils/observability.js");
      reportError(err, { path: _req.path, method: _req.method });
    } catch {
      // never let the error reporter eat the response
    }
    res.status(500).json({ success: false, message: err?.message || "Internal server error" });
  });

  return app;
}
